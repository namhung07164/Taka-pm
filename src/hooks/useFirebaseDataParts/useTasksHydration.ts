import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { Task } from '../../types';
import { offloadPersistSnapshot, hydrateTasksFromLocal, hydrateTasksForProjects, hydrateDelegationsForProjects } from '../../lib/backgroundSyncWorker';
import { loadNotificationTasks } from '../../lib/notificationTaskService';
import { deduplicateTasksInMemory } from '../../lib/taskDeduplicationService';
import { cleanOrphanTasks } from '../../lib/taskStateService';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { deleteLocalRecord } from '../../lib/localDb';
import { pullAndApplyDeltas } from '../../lib/deltaSyncService';
import { getLoadedMarkers, hasMarker } from '../../lib/loadedMarkers';
import { markTasksDeleted, unmarkTaskDeleted, clearDeletedTasksTracker } from '../../lib/taskDeletedTracker';
import { isStaleCacheDoc, extractKeysToHydrate, groupActiveProjectsByYear, healProjectsAfterTasksBatch } from './tasksHydrationHelpers';
import { buildProjectTasksLookupIndex, getLocalProjectTasksFromIndex } from './projectsHydrationHelpers';
import { attachYearTasksListener, attachProjectTasksListener } from './tasksListenerAttachHelpers';

const DELTA_FIRST = { projects: false, tasks: false, costs: false, delegations: false };
const TTL_DURATION_MS = 15 * 60 * 1000;

interface UseTasksHydrationProps {
  querySignature: string | null;
  userRole?: string;
  allowedStores: string[];
}

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

  const prevQuerySigTasks = useRef<string>('');
  const prevSigTasks = useRef<string>('');

  // Atomic batching buffers for Tasks updates
  const pendingTasksMap = useRef<Map<string, Task> | null>(null);
  const pendingTasksChanged = useRef<Map<string, Task>>(new Map());
  const pendingTasksRemoved = useRef<Map<string, Task>>(new Map());
  const tasksBatchTimer = useRef<NodeJS.Timeout | null>(null);

  const batchTasksUpdate = useCallback(
    (docChanges: any[], fromCache: boolean = false, isForceSnapshot: boolean = false) => {
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
        const isTrueDelete = Boolean(data.isDeleted || change.type === 'removed');

        if (isTrueDelete) {
          const existing = pendingTasksMap.current!.get(id);
          const pIdHint = data.projectId || existing?.projectId;
          markTasksDeleted([id], pIdHint ? String(pIdHint) : undefined);
          pendingTasksMap.current!.delete(id);
          pendingTasksChanged.current.delete(id);
          pendingTasksRemoved.current.set(id, { ...(existing || {}), ...data, id });
        } else {
          if (
            !isForceSnapshot &&
            fromCache &&
            isStaleCacheDoc(pendingTasksMap.current!.get(id), data)
          )
            return;
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
          const rolledUpTasks = rollupParentTaskDatesAndStatus(
            unrolledTasks,
            useAppStore.getState().delegationGroups
          );
          rolledUpTasks.sort((a, b) => {
            if (a.projectCode !== b.projectCode) {
              return (a.projectCode || '').localeCompare(b.projectCode || '');
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
          const changed = Array.from(pendingTasksChanged.current.values()).filter((t) =>
            finalIds.has(t.id)
          );
          const removedIds = Array.from(pendingTasksRemoved.current.keys());
          pendingTasksChanged.current.clear();
          pendingTasksRemoved.current.clear();
          if (changed.length > 0) offloadPersistSnapshot('taka_tasks', changed);
          removedIds.forEach((id) => {
            deleteLocalRecord('taka_tasks', id).catch(() => {});
          });

          const setNotifs = useAppStore.getState().setAllTasksForNotifs;
          if (setNotifs) setNotifs(finalTasks);
          pendingTasksMap.current = null;
        }
      }, 200);
    },
    []
  );

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
        console.warn('[useTasksHydration] Notification lightweight tasks query error:', e);
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
    const currentSig = `${querySignature}_${activeProjectIds.join(',')}_${isTasksRequested}_${wakeRefreshCounter.current}`;

    if (prevQuerySigTasks.current !== querySignature) {
      if (prevQuerySigTasks.current !== '') {
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
    const getCurrentPendingOrStoreTasks = () =>
      pendingTasksMap.current
        ? Array.from(pendingTasksMap.current.values())
        : useAppStore.getState().tasks || [];

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

      const projectsByYear = groupActiveProjectsByYear(
        activeProjectIds,
        currentProjects,
        globalYearFilter
      );

      const neededKeys = new Set<string>();
      let needTasksDeltaSync = false;

      // Pre-build O(T) lookup index of currentTasks once before iterating active projects
      const currentTasksSnapshot = useAppStore.getState().tasks || [];
      const tasksLookupIndex = buildProjectTasksLookupIndex(currentTasksSnapshot);

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
            const hasLocalYearTasks = currentTasksSnapshot.some(
              (t) => String(t.projectYear || '') === String(year)
            );
            const isArchivedPastYear = Number(year) < new Date().getFullYear() - 1;

            const deltaManaged =
              (hasLocalYearTasks && isArchivedPastYear) ||
              (DELTA_FIRST.tasks && hasLocalYearTasks && hasMarker(markers, 'tasks_year', year));
            if (deltaManaged) {
              tasksPool.current.set(yearKey, () => {});
              setIsTasksLoading(false);
              needTasksDeltaSync = true;
              usePerformanceStore
                .getState()
                .trackGetDoc(
                  `taka_tasks_${yearKey}`,
                  true,
                  currentTasksSnapshot.length,
                  'Dexie Local-First Tasks (0 Read full collection)'
                );
            } else {
              attachYearTasksListener({
                year,
                yearKey,
                userRole,
                allowedStores,
                deltaFirstTasks: DELTA_FIRST.tasks,
                tasksPool: tasksPool.current,
                getCurrentPendingOrStoreTasks,
                batchTasksUpdate,
                setIsTasksLoading,
                setCloudStatus,
              });
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
              const localProjTasks = getLocalProjectTasksFromIndex(p, tasksLookupIndex);
              const expectedSummaryCount = Array.isArray(p.taskSummaries)
                ? p.taskSummaries.length
                : p.taskCount || 0;
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
                  (hasMarker(markers, 'tasks_proj', p.id) ||
                    hasMarker(markers, 'tasks_proj', p.code) ||
                    hasMarker(markers, 'tasks_year', year)));
              if (deltaManaged) {
                knownHydratedProjectCodes.current.add(String(p.id));
                tasksPool.current.set(projKey, () => {});
                setIsTasksLoading(false);
                if (!isZeroTaskProject) {
                  needTasksDeltaSync = true;
                  const healed = healProjectsAfterTasksBatch({
                    currentProjects: useAppStore.getState().projects || [],
                    finalTasks: currentTasksSnapshot,
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
                    'Dexie Local-First Project Tasks (0 Read)'
                  );
              } else {
                attachProjectTasksListener({
                  p,
                  projKey,
                  deltaFirstTasks: DELTA_FIRST.tasks,
                  tasksPool: tasksPool.current,
                  knownHydratedProjectCodes: knownHydratedProjectCodes.current,
                  getCurrentPendingOrStoreTasks,
                  batchTasksUpdate,
                  setIsTasksLoading,
                  setCloudStatus,
                });
              }
            }
          });
        }
      });

      if (needTasksDeltaSync) {
        pullAndApplyDeltas(undefined, true)
          .then(() => setCloudStatus('online'))
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
      console.warn('[useTasksHydration] runTasksSync error:', err);
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

    window.addEventListener('taka_sleep_wake_recovery', handleSleepWakeRecovery);
    window.addEventListener('taka_network_recovered', handleSleepWakeRecovery);

    return () => {
      isCancelled = true;
      window.removeEventListener('taka_sleep_wake_recovery', handleSleepWakeRecovery);
      window.removeEventListener('taka_network_recovered', handleSleepWakeRecovery);
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
