import { useEffect, useRef, useCallback } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAppStore } from "../../store/useAppStore";
import { usePerformanceStore } from "../../store/usePerformanceStore";
import { db, APP_ID } from "../../lib/firebase";
import { Task } from "../../types";
import { buildStoreAndYearQuery } from "./firebaseQueryHelpers";
import {
  offloadPersistSnapshot,
  hydrateTasksFromLocal,
  hydrateTasksForProjects,
  hydrateDelegationsForProjects,
} from "../../lib/backgroundSyncWorker";
import { loadNotificationTasks } from "../../lib/notificationTaskService";
import { deduplicateTasksInMemory } from "../../lib/taskDeduplicationService";
import { cleanOrphanTasks } from "../../lib/taskStateService";
import { rollupParentTaskDatesAndStatus } from "../../lib/taskRollupService";
import { deleteLocalRecord } from "../../lib/localDb";
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";
import { getLoadedMarkers, hasMarker, markLoaded } from "../../lib/loadedMarkers";
import {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
} from "../../lib/projectDatesService";
import { markTasksDeleted } from "../../lib/taskDeletedTracker";

// Delta-first: sau lần tải đầy đủ đầu tiên, hủy onSnapshot lớn, dựa vào Dexie + kênh delta.
// Bật TỪNG CÁI sau khi đã test. Mặc định tắt = hành vi hiện tại.
const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };


interface UseTasksHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

import {
  isStaleCacheDoc,
  extractKeysToHydrate,
  groupActiveProjectsByYear,
  doesTaskBelongToProject,
  filterCompatibleProjectChanges,
  buildZombieTaskRemovalsForYear,
  buildZombieTaskRemovalsForProject,
} from "./tasksHydrationHelpers";

export function useTasksHydration({
  querySignature,
  userRole,
  allowedStores,
}: UseTasksHydrationProps) {
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const expandedProjectIds = useAppStore((state) => state.expandedProjectIds);
  const searchActiveProjectIds = useAppStore((state) => state.searchActiveProjectIds);
  const visibleActiveProjectIds = useAppStore((state) => state.visibleActiveProjectIds);
  const visibleActiveProjectIdsRef = useRef(visibleActiveProjectIds);
  visibleActiveProjectIdsRef.current = visibleActiveProjectIds;

  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setIsTasksLoading = useAppStore((state) => state.setIsTasksLoading);
  const setAllTasksForNotifs = useAppStore((state) => state.setAllTasksForNotifs);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);

  const tasksPool = useRef<Map<string, () => void>>(new Map());
  const tasksTTLTimeouts = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const knownHydratedProjectCodes = useRef<Set<string>>(new Set());

  const prevQuerySigTasks = useRef<string>("");
  const prevSigTasks = useRef<string>("");

  // Atomic batching buffers for Tasks updates
  const pendingTasksMap = useRef<Map<string, Task> | null>(null);
  const pendingTasksChanged = useRef<Map<string, Task>>(new Map());
  const pendingTasksRemoved = useRef<Set<string>>(new Set());
  const tasksBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchTasksUpdate = useCallback((docChanges: any[], fromCache: boolean = false) => {
    if (!pendingTasksMap.current) {
      const currentTasks = useAppStore.getState().tasks || [];
      const map = new Map<string, Task>();
      currentTasks.forEach((t) => map.set(t.id, t));
      pendingTasksMap.current = map;
    }

    docChanges.forEach((change) => {
      const id = change.doc.id;
      const rawDocData = change.doc.data();
      const data = { id, ...rawDocData } as Task;
      const isTrueDelete = Boolean(data.isDeleted || change.type === "removed");

      if (isTrueDelete) {
        markTasksDeleted([id], data.projectId ? String(data.projectId) : undefined);
        pendingTasksMap.current!.delete(id);
        pendingTasksChanged.current.delete(id);
        pendingTasksRemoved.current.add(id);
      } else {
        if (fromCache && isStaleCacheDoc(pendingTasksMap.current!.get(id), data)) return;
        pendingTasksMap.current!.set(id, data);
        pendingTasksChanged.current.set(id, data);
        pendingTasksRemoved.current.delete(id);
      }
    });

    if (tasksBatchTimer.current) {
      clearTimeout(tasksBatchTimer.current);
    }

    tasksBatchTimer.current = setTimeout(() => {
      if (pendingTasksMap.current) {
        const rawList = Array.from(pendingTasksMap.current.values());
        const projects = useAppStore.getState().projects || [];
        const { dedupedTasks } = deduplicateTasksInMemory(rawList, projects);
        const { cleaned: unrolledTasks } = cleanOrphanTasks(dedupedTasks);
        const rolledUpTasks = rollupParentTaskDatesAndStatus(unrolledTasks, useAppStore.getState().delegationGroups);
        rolledUpTasks.sort((a, b) => {
          if (a.projectCode !== b.projectCode) {
            return (a.projectCode || "").localeCompare(b.projectCode || "");
          }
          return (a.orderIndex || 0) - (b.orderIndex || 0);
        });
        const finalTasks = rolledUpTasks;
        useAppStore.getState().setTasks(finalTasks);

        // Immediately prune any removed task IDs from project.taskSummaries in store.projects
        if (pendingTasksRemoved.current.size > 0) {
          const removedSet = new Set(Array.from(pendingTasksRemoved.current).map(id => String(id).trim().toLowerCase()));
          const currentProjects = useAppStore.getState().projects || [];
          const modifiedProjects: any[] = [];
          const prunedProjects = currentProjects.map((p) => {
            if (Array.isArray(p.taskSummaries) && p.taskSummaries.some((s: any) => s?.id && removedSet.has(String(s.id).trim().toLowerCase()))) {
              const filteredSummaries = p.taskSummaries.filter((s: any) => !s?.id || !removedSet.has(String(s.id).trim().toLowerCase()));
              const pForCalc = { ...p, taskSummaries: filteredSummaries, taskCount: filteredSummaries.length };
              const pTasks = finalTasks.filter((t) => !t.isDeleted && (
                (t.projectId && String(t.projectId) === String(p.id)) ||
                (!t.projectId && String(t.projectCode || "").trim().toLowerCase() === String(p.code || "").trim().toLowerCase() &&
                  String(t.projectStore || "").trim().toLowerCase() === String(p.store || "").trim().toLowerCase() &&
                  String(t.projectYear ?? "").trim() === String(p.year ?? "").trim())
              ));
              const computed = calculateProjectComputedDates(pForCalc, pTasks, useAppStore.getState().delegationGroups);
              const nextProj = {
                ...p,
                ...computed,
                taskSummaries: computed.taskSummaries || filteredSummaries,
                taskCount: computed.taskCount !== undefined ? computed.taskCount : filteredSummaries.length,
              };
              modifiedProjects.push(nextProj);
              return nextProj;
            }
            return p;
          });
          if (modifiedProjects.length > 0) {
            useAppStore.getState().setProjects(prunedProjects);
            offloadPersistSnapshot('taka_projects', modifiedProjects);
          }
        }
        
        // Self-healing an toàn:
        // - chỉ xét các dự án có task thay đổi trong lô này (không quét toàn bộ P x T)
        // - bỏ qua snapshot từ cache và 15 giây đầu sau khi mở app (dữ liệu cục bộ có thể cũ/thiếu)
        // - KHÔNG chữa theo hướng giảm: ít task hơn taskCount đã lưu nghĩa là có thể mới tải một phần
        if (!fromCache && getAppBootAgeMs() >= BOOT_SYNC_GUARD_MS && pendingTasksChanged.current.size > 0) {
          const touchedIds = new Set<string>();
          const touchedCodes = new Set<string>();
          pendingTasksChanged.current.forEach((t) => {
            if (t.projectId) touchedIds.add(String(t.projectId));
            if (t.projectCode) touchedCodes.add(String(t.projectCode).trim().toLowerCase());
          });

          // Task thuộc dự án khi: đúng projectId; hoặc (task cũ không có projectId) khớp đủ ba trường store, year, code
          const belongsToProject = (t: Task, p: any): boolean => {
            if (t.projectId) return String(t.projectId) === String(p.id);
            return (
              String(t.projectCode || "").trim().toLowerCase() === String(p.code || "").trim().toLowerCase() &&
              String(t.projectStore || "").trim().toLowerCase() === String(p.store || "").trim().toLowerCase() &&
              String(t.projectYear ?? "").trim() === String(p.year ?? "").trim()
            );
          };

          const currentProjects = useAppStore.getState().projects || [];
          let projectsNeedUpdate = false;
          const healedProjects = currentProjects.map((p) => {
            const codeKey = String(p.code || "").trim().toLowerCase();
            if (!touchedIds.has(String(p.id)) && !(codeKey && touchedCodes.has(codeKey))) return p;

            const pTasks = finalTasks.filter((t) => !t.isDeleted && belongsToProject(t, p));
            if (pTasks.length === 0) return p;

            // Có thể mới tải một phần task: không bao giờ ghi số liệu nhỏ hơn lên server
            if (pTasks.length < (p.taskCount || 0)) return p;

            const computed = calculateProjectComputedDates(p, pTasks, useAppStore.getState().delegationGroups);

            const hasDiscrepancy =
              p.taskCount !== computed.taskCount ||
              !p.taskSummaries ||
              p.taskSummaries.length !== (computed.taskSummaries?.length || 0) ||
              (p.computedTakStart || '') !== (computed.computedTakStart || '') ||
              (p.computedTakCompl || '') !== (computed.computedTakCompl || '');
            if (!hasDiscrepancy) return p;

            projectsNeedUpdate = true;
            syncProjectDatesToFirestore(p.id, computed).catch(() => {});

            return {
              ...p,
              ...computed,
            };
          });
          if (projectsNeedUpdate) {
            useAppStore.getState().setProjects(healedProjects);
          }
        }
        
        const finalIds = new Set(finalTasks.map(t => t.id));
        const changed = Array.from(pendingTasksChanged.current.values()).filter(t => finalIds.has(t.id));
        const removed = Array.from(pendingTasksRemoved.current);
        pendingTasksChanged.current.clear();
        pendingTasksRemoved.current.clear();
        if (changed.length > 0) offloadPersistSnapshot('taka_tasks', changed);
        removed.forEach((id) => { deleteLocalRecord('taka_tasks', id).catch(() => {}); });

        const setNotifs = useAppStore.getState().setAllTasksForNotifs;
        if (setNotifs) setNotifs(finalTasks);
        pendingTasksMap.current = null;
      }
    }, 200);
  }, []);

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      // 1. KHÔNG hủy listener khi thức giấc.
      // Hủy xong mà không effect nào tạo lại => mất realtime tasks/costs/delegations
      // Socket chết do iOS treo đã có initNetworkRecovery (syncResilience) xử lý bằng deltaResync
      
      if (useAppStore.getState().isTasksRequested) {
        hydrateTasksFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
      }
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    return () => {
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      tasksPool.current.forEach((u) => u());
      tasksPool.current.clear();
      tasksTTLTimeouts.current.forEach((t) => clearTimeout(t));
      tasksTTLTimeouts.current.clear();
      if (tasksBatchTimer.current) clearTimeout(tasksBatchTimer.current);
    };
  }, []);

  // Lightweight Notification Query for Tasks (0 Read from Dexie with Safe Fallback)
  useEffect(() => {
    let isCancelled = false;
    let intervalId: NodeJS.Timeout | null = null;

    if (!querySignature || isTasksRequested) {
      return;
    }

    const fetchNotifs = async () => {
      if (isCancelled) return;
      try {
        const loadedNotifTasks = await loadNotificationTasks();
        if (isCancelled) return;
        setAllTasksForNotifs(loadedNotifTasks);
      } catch (e) {
        console.warn("[useTasksHydration] Notification lightweight tasks query error:", e);
      }
    };

    fetchNotifs();

    const POLL_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
    intervalId = setInterval(fetchNotifs, POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [querySignature, isTasksRequested, setAllTasksForNotifs]);

  // Main Tasks Sync Logic
  useEffect(() => {
    if (!querySignature) return;

    const activeProjectIds = isTasksRequested
      ? [...new Set([...expandedProjectIds, ...searchActiveProjectIds])]
      : [];
    const currentSig = `${querySignature}_${activeProjectIds.join(",")}_${isTasksRequested}`;

    if (prevQuerySigTasks.current !== querySignature) {
      if (prevQuerySigTasks.current !== "") {
        tasksPool.current.forEach((u) => u());
        tasksPool.current.clear();
        tasksTTLTimeouts.current.forEach((t) => clearTimeout(t));
        tasksTTLTimeouts.current.clear();
      }
      prevQuerySigTasks.current = querySignature;
    }
    prevSigTasks.current = currentSig;

    if (activeProjectIds.length === 0) {
      Array.from(tasksPool.current.keys()).forEach((key) => {
        if (!tasksTTLTimeouts.current.has(key)) {
          const timeoutId = setTimeout(() => {
            const unsub = tasksPool.current.get(key);
            if (unsub) unsub();
            tasksPool.current.delete(key);
            tasksTTLTimeouts.current.delete(key);
            usePerformanceStore.getState().unregisterListener(`taka_tasks_${key}`);
          }, TTL_DURATION_MS);
          tasksTTLTimeouts.current.set(key, timeoutId);
        }
      });
      setIsTasksLoading(false);
      return;
    }

    let isCancelled = false;
    const runTasksSync = async () => {
      const currentProjects = useAppStore.getState().projects || [];
      const keysToHydrate = extractKeysToHydrate(activeProjectIds, currentProjects);

      await Promise.all([
        hydrateTasksForProjects(Array.from(keysToHydrate)),
        hydrateDelegationsForProjects(activeProjectIds),
      ]);
      if (isCancelled) return;
      const markers = await getLoadedMarkers();

      setIsTasksLoading(true);

      const projectsByYear = groupActiveProjectsByYear(activeProjectIds, currentProjects, globalYearFilter);

      const neededKeys = new Set<string>();
      let needTasksDeltaSync = false;

      projectsByYear.forEach((projs, year) => {
        if (projs.length > 10) {
          const yearKey = `year_${year}`;
          neededKeys.add(yearKey);

          if (tasksTTLTimeouts.current.has(yearKey)) {
            clearTimeout(tasksTTLTimeouts.current.get(yearKey)!);
            tasksTTLTimeouts.current.delete(yearKey);
          }

          projs.forEach((p) => {
            const pKey = `proj_${p.id}`;
            if (tasksPool.current.has(pKey)) {
              const u = tasksPool.current.get(pKey);
              if (u) u();
              tasksPool.current.delete(pKey);
              usePerformanceStore.getState().unregisterListener(`taka_tasks_${pKey}`);
            }
          });

          if (!tasksPool.current.has(yearKey)) {
            const currentTasks = useAppStore.getState().tasks || [];
            const hasLocalYearTasks = currentTasks.some(
              (t) => String(t.projectYear || "") === String(year)
            );
            const isClosedOrPastYear = Number(year) < new Date().getFullYear();

            const deltaManaged =
              (hasLocalYearTasks && isClosedOrPastYear) ||
              (DELTA_FIRST.tasks && hasMarker(markers, 'tasks_year', year));
            if (deltaManaged) {
              tasksPool.current.set(yearKey, () => {});
              setIsTasksLoading(false);
              needTasksDeltaSync = true;
              usePerformanceStore
                .getState()
                .trackGetDoc(
                  `taka_tasks_${yearKey}`,
                  true,
                  currentTasks.length,
                  "Dexie Local-First Tasks (0 Read full collection)"
                );
            } else {
              const colRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks");
              const qTasks = buildStoreAndYearQuery(
                colRef,
                "projectStore",
                "projectYear",
                year,
                userRole,
                allowedStores
              );

              usePerformanceStore.getState().registerListener(`taka_tasks_${yearKey}`);
              const unsub = onSnapshot(
                qTasks,
                (snapshot) => {
                  usePerformanceStore.getState().trackSnapshot(`taka_tasks_${yearKey}`, snapshot);
                  setIsTasksLoading(false);
                  const fromCache = snapshot.metadata.fromCache;
                  let changesToApply: any[] = snapshot.docChanges();
                  if (!fromCache) {
                    const zombieRemovals = buildZombieTaskRemovalsForYear(
                      snapshot.docs,
                      useAppStore.getState().tasks || [],
                      year,
                      userRole,
                      allowedStores
                    );
                    if (zombieRemovals.length > 0) changesToApply = [...changesToApply, ...zombieRemovals];
                  }
                  batchTasksUpdate(changesToApply, fromCache);
                  setCloudStatus("online");

                  if (DELTA_FIRST.tasks && !fromCache) {
                    markLoaded('tasks_year', year).catch(() => {});
                    const u = tasksPool.current.get(yearKey);
                    tasksPool.current.set(yearKey, () => {});
                    u?.();
                    usePerformanceStore.getState().unregisterListener(`taka_tasks_${yearKey}`);
                  }
                },
                (e) => {
                  setIsTasksLoading(false);
                  console.error("Tasks consolidated listener error:", e);
                  setCloudStatus("offline");
                }
              );
              tasksPool.current.set(yearKey, unsub);
            }
          }
        } else {
          const visibleSet = new Set((visibleActiveProjectIdsRef.current || []).map((id) => String(id)));
          const sortedProjs = [...projs].sort((a, b) => {
            const aVis = visibleSet.has(a.id) || visibleSet.has(a.code) ? 1 : 0;
            const bVis = visibleSet.has(b.id) || visibleSet.has(b.code) ? 1 : 0;
            return bVis - aVis;
          });

          sortedProjs.forEach((p) => {
            const projKey = `proj_${p.id}`;
            const yearKey = `year_${year}`;

            if (tasksPool.current.has(yearKey)) {
              neededKeys.add(yearKey);
              return;
            }

            neededKeys.add(projKey);

            if (tasksTTLTimeouts.current.has(projKey)) {
              clearTimeout(tasksTTLTimeouts.current.get(projKey)!);
              tasksTTLTimeouts.current.delete(projKey);
            }

            if (!tasksPool.current.has(projKey)) {
              const currentTasks = useAppStore.getState().tasks || [];
              const localProjTasks = currentTasks.filter((t) => doesTaskBelongToProject(t, p));
              const hasLocalProjTasks =
                localProjTasks.length > 0 ||
                knownHydratedProjectCodes.current.has(String(p.id));
              const isClosedOrPastYear = Number(year) < new Date().getFullYear();
              const isZeroTaskProject =
                (p.taskCount || 0) === 0 &&
                Array.isArray(p.taskSummaries) &&
                p.taskSummaries.length === 0 &&
                localProjTasks.length === 0;

              const deltaManaged =
                isZeroTaskProject ||
                (hasLocalProjTasks && isClosedOrPastYear) ||
                (DELTA_FIRST.tasks && (hasMarker(markers, 'tasks_proj', p.id) || hasMarker(markers, 'tasks_proj', p.code) || hasMarker(markers, 'tasks_year', year)));
              if (deltaManaged) {
                tasksPool.current.set(projKey, () => {});
                setIsTasksLoading(false);
                if (!isZeroTaskProject) needTasksDeltaSync = true;
                usePerformanceStore
                  .getState()
                  .trackGetDoc(
                    `taka_tasks_${projKey}`,
                    true,
                    localProjTasks.length,
                    "Dexie Local-First Project Tasks (0 Read)"
                  );
              } else {
                const qTasks = query(
                  collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
                  where("projectCode", "==", p.code)
                );

                usePerformanceStore.getState().registerListener(`taka_tasks_${projKey}`);
                const unsub = onSnapshot(
                  qTasks,
                  (snapshot) => {
                    knownHydratedProjectCodes.current.add(String(p.id));
                    usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
                    setIsTasksLoading(false);
                    const fromCache = snapshot.metadata.fromCache;
                    let compatibleChanges = filterCompatibleProjectChanges(snapshot.docChanges(), p);

                    if (!fromCache) {
                      const zombieRemovals = buildZombieTaskRemovalsForProject(
                        snapshot.docs,
                        useAppStore.getState().tasks || [],
                        p
                      );
                      if (zombieRemovals.length > 0) compatibleChanges = [...compatibleChanges, ...zombieRemovals];
                    }

                    batchTasksUpdate(compatibleChanges, fromCache);
                    setCloudStatus("online");

                    if (DELTA_FIRST.tasks && !fromCache) {
                      markLoaded('tasks_proj', p.id).catch(() => {});
                      const u = tasksPool.current.get(projKey);
                      tasksPool.current.set(projKey, () => {});
                      u?.();
                      usePerformanceStore.getState().unregisterListener(`taka_tasks_${projKey}`);
                    }
                  },
                  (e) => {
                    setIsTasksLoading(false);
                    console.error("Tasks listener error:", e);
                    setCloudStatus("offline");
                  }
                );
                tasksPool.current.set(projKey, unsub);
              }
            }
          });
        }
      });

      if (needTasksDeltaSync) {
        pullAndApplyDeltas()
          .then(() => setCloudStatus("online"))
          .catch(() => {});
      }

      Array.from(tasksPool.current.keys()).forEach((key) => {
        if (!neededKeys.has(key)) {
          if (!tasksTTLTimeouts.current.has(key)) {
            const timeoutId = setTimeout(() => {
              const unsub = tasksPool.current.get(key);
              if (unsub) unsub();
              tasksPool.current.delete(key);
              tasksTTLTimeouts.current.delete(key);
              usePerformanceStore.getState().unregisterListener(`taka_tasks_${key}`);
            }, TTL_DURATION_MS);
            tasksTTLTimeouts.current.set(key, timeoutId);
          }
        }
      });
    };

    runTasksSync().catch((err) => {
      console.warn("[useTasksHydration] runTasksSync error:", err);
    });

    return () => {
      isCancelled = true;
    };
  }, [
    querySignature,
    userRole,
    allowedStores,
    isTasksRequested,
    expandedProjectIds,
    searchActiveProjectIds,
    globalYearFilter,
    batchTasksUpdate,
    setIsTasksLoading,
    setCloudStatus,
  ]);
}
