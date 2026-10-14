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
import { pullAndApplyDeltas } from "../../lib/deltaSyncService";

interface UseTasksHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

const TTL_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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

  // Atomic batching buffer for Tasks updates
  const pendingTasksMap = useRef<Map<string, Task> | null>(null);
  const tasksBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchTasksUpdate = useCallback((docChanges: any[]) => {
    if (!pendingTasksMap.current) {
      const currentTasks = useAppStore.getState().tasks || [];
      const map = new Map<string, Task>();
      currentTasks.forEach((t) => map.set(t.id, t));
      pendingTasksMap.current = map;
    }

    docChanges.forEach((change) => {
      const data = { id: change.doc.id, ...change.doc.data() } as Task;
      if (change.type === "removed" || data.isDeleted) {
        pendingTasksMap.current!.delete(change.doc.id);
      } else {
        pendingTasksMap.current!.set(change.doc.id, data);
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
        const { cleaned: finalTasks } = cleanOrphanTasks(dedupedTasks);
        finalTasks.sort((a, b) => {
          if (a.projectCode !== b.projectCode) {
            return (a.projectCode || "").localeCompare(b.projectCode || "");
          }
          return (a.orderIndex || 0) - (b.orderIndex || 0);
        });
        useAppStore.getState().setTasks(finalTasks);
        offloadPersistSnapshot("taka_tasks", finalTasks);
        const setNotifs = useAppStore.getState().setAllTasksForNotifs;
        if (setNotifs) setNotifs(finalTasks);
        pendingTasksMap.current = null;
      }
      tasksBatchTimer.current = null;
    }, 120);
  }, []);

  // Sleep/Wake Recovery Listener
  useEffect(() => {
    const handleSleepWakeRecovery = () => {
      tasksPool.current.forEach((u) => u());
      tasksPool.current.clear();
      tasksTTLTimeouts.current.forEach((t) => clearTimeout(t));
      tasksTTLTimeouts.current.clear();

      if (useAppStore.getState().isTasksRequested) {
        hydrateTasksFromLocal().catch(() => {});
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
      const keysToHydrate = new Set<string>();
      activeProjectIds.forEach((id) => {
        keysToHydrate.add(String(id));
        const matched = currentProjects.find(
          (p) =>
            String(p.id || "") === String(id) ||
            String(p.no) === String(id) ||
            String(p.code || "") === String(id) ||
            `${p.code}-${p.year}-${p.store}-${p.no}` === String(id)
        );
        if (matched) {
          if (matched.id) keysToHydrate.add(String(matched.id));
          if (matched.code) keysToHydrate.add(String(matched.code));
          if (matched.linkCodes) {
            matched.linkCodes.split(/[,;/]+/).forEach((c) => {
              if (c.trim()) keysToHydrate.add(c.trim());
            });
          }
        }
      });

      await Promise.all([
        hydrateTasksForProjects(Array.from(keysToHydrate)),
        hydrateDelegationsForProjects(activeProjectIds),
      ]);
      if (isCancelled) return;

      setIsTasksLoading(true);

      const projectsByYear = new Map<string, Array<{ id: string; code: string }>>();

      activeProjectIds.forEach((projectId) => {
        const proj = currentProjects.find(
          (p) =>
            String(p.id || "") === String(projectId) ||
            String(p.no) === String(projectId) ||
            String(p.code || "") === String(projectId) ||
            `${p.code}-${p.year}-${p.store}-${p.no}` === String(projectId)
        );
        const codeToQuery = proj?.code || String(projectId);
        const yearToGroup = proj?.year
          ? String(proj.year).trim()
          : proj?.start
          ? String(proj.start).substring(0, 4)
          : globalYearFilter !== "all"
          ? globalYearFilter
          : "2026";

        let list = projectsByYear.get(yearToGroup);
        if (!list) {
          list = [];
          projectsByYear.set(yearToGroup, list);
        }
        list.push({ id: String(projectId), code: codeToQuery });
      });

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
            const isClosedOrPastYear = Number(year) < 2026;

            if (hasLocalYearTasks && isClosedOrPastYear) {
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
                  batchTasksUpdate(snapshot.docChanges());
                  setCloudStatus("online");
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
          const visibleSet = new Set(
            (visibleActiveProjectIdsRef.current || []).map((id) => String(id))
          );
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
              const hasLocalProjTasks =
                currentTasks.some((t) => String(t.projectCode || "") === String(p.code)) ||
                knownHydratedProjectCodes.current.has(p.code);
              const isClosedOrPastYear = Number(year) < 2026;

              if (hasLocalProjTasks && isClosedOrPastYear) {
                tasksPool.current.set(projKey, () => {});
                setIsTasksLoading(false);
                needTasksDeltaSync = true;
                usePerformanceStore
                  .getState()
                  .trackGetDoc(
                    `taka_tasks_${projKey}`,
                    true,
                    1,
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
                    knownHydratedProjectCodes.current.add(p.code);
                    usePerformanceStore.getState().trackSnapshot(`taka_tasks_${projKey}`, snapshot);
                    setIsTasksLoading(false);
                    batchTasksUpdate(snapshot.docChanges());
                    setCloudStatus("online");
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
