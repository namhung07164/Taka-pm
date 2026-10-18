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
import { markTasksDeleted, unmarkTaskDeleted, clearDeletedTasksTracker } from "../../lib/taskDeletedTracker";

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
  healProjectsAfterTasksBatch,
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
  const wakeRefreshCounter = useRef<number>(0);

  const prevQuerySigTasks = useRef<string>("");
  const prevSigTasks = useRef<string>("");

  // Atomic batching buffers for Tasks updates
  const pendingTasksMap = useRef<Map<string, Task> | null>(null);
  const pendingTasksChanged = useRef<Map<string, Task>>(new Map());
  const pendingTasksRemoved = useRef<Map<string, Task>>(new Map());
  const tasksBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchTasksUpdate = useCallback((docChanges: any[], fromCache: boolean = false, isForceSnapshot: boolean = false) => {
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
        const existing = pendingTasksMap.current!.get(id);
        const pIdHint = data.projectId || existing?.projectId;
        markTasksDeleted([id], pIdHint ? String(pIdHint) : undefined);
        pendingTasksMap.current!.delete(id);
        pendingTasksChanged.current.delete(id);
        pendingTasksRemoved.current.set(id, { ...(existing || {}), ...data, id });
      } else {
        if (!isForceSnapshot && fromCache && isStaleCacheDoc(pendingTasksMap.current!.get(id), data)) return;
        if (!data.isDeleted) {
          unmarkTaskDeleted(id);
        }
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

        const healedProjects = healProjectsAfterTasksBatch({
          currentProjects: useAppStore.getState().projects || [],
          finalTasks,
          delegationGroups: useAppStore.getState().delegationGroups || [],
          changedTasks: pendingTasksChanged.current,
          removedTasks: pendingTasksRemoved.current,
          fromCache,
          knownHydratedProjectCodes: knownHydratedProjectCodes.current,
          tasksPool: tasksPool.current,
        });

        if (healedProjects) {
          useAppStore.getState().setProjects(healedProjects);
        }

        const finalIds = new Set(finalTasks.map((t) => t.id));
        const changed = Array.from(pendingTasksChanged.current.values()).filter((t) => finalIds.has(t.id));
        const removedIds = Array.from(pendingTasksRemoved.current.keys());
        pendingTasksChanged.current.clear();
        pendingTasksRemoved.current.clear();
        if (changed.length > 0) offloadPersistSnapshot("taka_tasks", changed);
        removedIds.forEach((id) => {
          deleteLocalRecord("taka_tasks", id).catch(() => {});
        });

        const setNotifs = useAppStore.getState().setAllTasksForNotifs;
        if (setNotifs) setNotifs(finalTasks);
        pendingTasksMap.current = null;
      }
    }, 200);
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
    const currentSig = `${querySignature}_${activeProjectIds.join(",")}_${isTasksRequested}_${wakeRefreshCounter.current}`;

    if (prevQuerySigTasks.current !== querySignature) {
      if (prevQuerySigTasks.current !== "") {
        tasksPool.current.forEach((u) => u());
        tasksPool.current.clear();
        tasksTTLTimeouts.current.forEach((t) => clearTimeout(t));
        tasksTTLTimeouts.current.clear();
        clearDeletedTasksTracker();
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
            const isArchivedPastYear = Number(year) < new Date().getFullYear() - 1;

            const deltaManaged =
              (hasLocalYearTasks && isArchivedPastYear) ||
              (DELTA_FIRST.tasks && hasLocalYearTasks && hasMarker(markers, "tasks_year", year));
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
                  if (!fromCache && !snapshot.metadata.hasPendingWrites) {
                    const currentTasksNow = pendingTasksMap.current
                      ? Array.from(pendingTasksMap.current.values())
                      : useAppStore.getState().tasks || [];
                    const zombieRemovals = buildZombieTaskRemovalsForYear(
                      snapshot.docs,
                      currentTasksNow,
                      year,
                      userRole,
                      allowedStores
                    );
                    if (zombieRemovals.length > 0) {
                      changesToApply = [...changesToApply, ...zombieRemovals];
                    }
                  }
                  batchTasksUpdate(changesToApply, fromCache);
                  setCloudStatus("online");

                  if (DELTA_FIRST.tasks && !fromCache) {
                    markLoaded("tasks_year", year).catch(() => {});
                    const u = tasksPool.current.get(yearKey);
                    tasksPool.current.set(yearKey, () => {});
                    u?.();
                    usePerformanceStore.getState().unregisterListener(`taka_tasks_${yearKey}`);
                  }
                },
                (e) => {
                  setIsTasksLoading(false);
                  console.error("Tasks consolidated listener error:", e);
                  tasksPool.current.delete(yearKey);
                  usePerformanceStore.getState().unregisterListener(`taka_tasks_${yearKey}`);
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
              const expectedSummaryCount = Array.isArray(p.taskSummaries)
                ? p.taskSummaries.length
                : (p.taskCount || 0);
              const hasLocalProjTasks =
                (localProjTasks.length > 0 && localProjTasks.length >= expectedSummaryCount) ||
                knownHydratedProjectCodes.current.has(String(p.id));
              const isArchivedPastYear = Number(year) < new Date().getFullYear() - 1;
              const isZeroTaskProject =
                (p.taskCount || 0) === 0 &&
                Array.isArray(p.taskSummaries) &&
                p.taskSummaries.length === 0 &&
                localProjTasks.length === 0;

              const deltaManaged =
                isZeroTaskProject ||
                (hasLocalProjTasks && isArchivedPastYear) ||
                (DELTA_FIRST.tasks &&
                  hasLocalProjTasks &&
                  (hasMarker(markers, "tasks_proj", p.id) ||
                    hasMarker(markers, "tasks_proj", p.code) ||
                    hasMarker(markers, "tasks_year", year)));
              if (deltaManaged) {
                knownHydratedProjectCodes.current.add(String(p.id));
                tasksPool.current.set(projKey, () => {});
                setIsTasksLoading(false);
                if (!isZeroTaskProject) {
                  needTasksDeltaSync = true;
                  const healed = healProjectsAfterTasksBatch({
                    currentProjects: useAppStore.getState().projects || [],
                    finalTasks: currentTasks,
                    delegationGroups: useAppStore.getState().delegationGroups || [],
                    changedTasks: new Map(),
                    removedTasks: new Map(),
                    fromCache: false,
                    knownHydratedProjectCodes: knownHydratedProjectCodes.current,
                    tasksPool: tasksPool.current,
                  });
                  if (healed) {
                    useAppStore.getState().setProjects(healed);
                  }
                }
                usePerformanceStore
                  .getState()
                  .trackGetDoc(
                    `taka_tasks_${projKey}`,
                    true,
                    localProjTasks.length,
                    "Dexie Local-First Project Tasks (0 Read)"
                  );
              } else {
                const codeSet = new Set<string>();
                if (p.code) {
                  const raw = String(p.code).trim();
                  if (raw) {
                    codeSet.add(raw);
                    codeSet.add(raw.toUpperCase());
                    codeSet.add(raw.toLowerCase());
                  }
                }
                if (p.linkCodes) {
                  const extra = String(p.linkCodes)
                    .split(/[,;/]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  extra.forEach((c) => {
                    codeSet.add(c);
                    codeSet.add(c.toUpperCase());
                    codeSet.add(c.toLowerCase());
                  });
                }
                if (p.id) {
                  const idStr = String(p.id).trim();
                  if (idStr) codeSet.add(idStr);
                }
                const codeList = Array.from(codeSet);
                const qTasks =
                  codeList.length > 1
                    ? query(
                        collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
                        where("projectCode", "in", codeList.slice(0, 10))
                      )
                    : query(
                        collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
                        where("projectCode", "==", p.code || "")
                      );

                usePerformanceStore.getState().registerListener(`taka_tasks_${projKey}`);
                const unsub = onSnapshot(
                  qTasks,
                  (snapshot) => {
                    knownHydratedProjectCodes.current.add(String(p.id));
                    usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
                    setIsTasksLoading(false);
                    const fromCache = snapshot.metadata.fromCache;

                    let compatibleChanges = filterCompatibleProjectChanges(
                      snapshot.docChanges(),
                      p
                    );

                    if (!fromCache && !snapshot.metadata.hasPendingWrites) {
                      const currentTasksNow = pendingTasksMap.current
                        ? Array.from(pendingTasksMap.current.values())
                        : useAppStore.getState().tasks || [];
                      const compatibleServerDocs = snapshot.docs.filter((docSnap) => {
                        const dt: any = docSnap.data();
                        if (dt?.isDeleted) return false;
                        const pIdStr = p.id ? String(p.id).trim() : '';
                        const dtProjId = dt?.projectId ? String(dt.projectId).trim() : '';
                        if (dtProjId && pIdStr) {
                          return dtProjId === pIdStr;
                        }
                        if (
                          dt &&
                          dt.projectStore &&
                          p.store &&
                          String(dt.projectStore).trim().toLowerCase() !== String(p.store).trim().toLowerCase()
                        ) {
                          return false;
                        }
                        const dy = dt?.projectYear;
                        if (
                          dy !== undefined &&
                          dy !== null &&
                          dy !== "" &&
                          p.year !== undefined &&
                          p.year !== null &&
                          String(dy).trim() !== String(p.year).trim()
                        ) {
                          return false;
                        }
                        return true;
                      });
                      const zombieRemovals = buildZombieTaskRemovalsForProject(
                        compatibleServerDocs,
                        currentTasksNow,
                        p
                      );
                      if (zombieRemovals.length > 0) {
                        compatibleChanges = [...compatibleChanges, ...zombieRemovals];
                      }
                    }

                    batchTasksUpdate(compatibleChanges, fromCache);
                    setCloudStatus("online");

                    if (DELTA_FIRST.tasks && !fromCache) {
                      markLoaded("tasks_proj", p.id).catch(() => {});
                      const u = tasksPool.current.get(projKey);
                      tasksPool.current.set(projKey, () => {});
                      u?.();
                      usePerformanceStore.getState().unregisterListener(`taka_tasks_${projKey}`);
                    }
                  },
                  (e) => {
                    setIsTasksLoading(false);
                    console.error("Tasks listener error:", e);
                    tasksPool.current.delete(projKey);
                    usePerformanceStore.getState().unregisterListener(`taka_tasks_${projKey}`);
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
        pullAndApplyDeltas(undefined, true)
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

    const handleSleepWakeRecovery = () => {
      if (useAppStore.getState().isTasksRequested) {
        hydrateTasksFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
      }
      if (tasksPool.current.size > 0) {
        tasksPool.current.forEach((u, key) => {
          u();
          usePerformanceStore.getState().unregisterListener(`taka_tasks_${key}`);
        });
        tasksPool.current.clear();
        wakeRefreshCounter.current += 1;
        runTasksSync().catch(() => {});
      }
    };

    window.addEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
    window.addEventListener("taka_network_recovered", handleSleepWakeRecovery);

    return () => {
      isCancelled = true;
      window.removeEventListener("taka_sleep_wake_recovery", handleSleepWakeRecovery);
      window.removeEventListener("taka_network_recovered", handleSleepWakeRecovery);
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

