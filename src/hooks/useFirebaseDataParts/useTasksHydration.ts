import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { Task } from '../../types';
import { offloadPersistSnapshot, hydrateTasksFromLocal, hydrateTasksForProjects, hydrateDelegationsForProjects } from '../../lib/backgroundSyncWorker';
import { loadNotificationTasks } from '../../lib/notificationTaskService';
import { deduplicateTasksInMemory } from '../../lib/taskDeduplicationService';
import { cleanOrphanTasks } from '../../lib/taskStateService';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { deleteLocalRecord } from '../../lib/localDb';
import { pullAndApplyDeltas, applyIncomingDeltas } from '../../lib/deltaSyncService';
import { flushDeferredInvalidations } from '../../lib/deltaInvalidateService';
import { getLoadedMarkers, hasFreshMarker, markLoaded } from '../../lib/loadedMarkers';
import { markProjectTasksHydrated } from '../../lib/utils';
import { markTasksDeleted, unmarkTaskDeleted, clearDeletedTasksTracker } from '../../lib/taskDeletedTracker';
import { isStaleCacheDoc, extractKeysToHydrate, groupActiveProjectsByYear, healProjectsAfterTasksBatch, purgeRemovedDuplicateTasksFromFirestore } from './tasksHydrationHelpers';
import { buildProjectTasksLookupIndex, getLocalProjectTasksFromIndex } from './projectsHydrationHelpers';
import { attachYearTasksListener, attachProjectTasksListener, computeActiveProjectsSummarySig, evaluateProjectTaskHydrationState } from './tasksListenerAttachHelpers';

const DELTA_FIRST = { projects: true, tasks: true, costs: true, delegations: true };
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
  const activeProjectsSummarySig = useAppStore((state) =>
    computeActiveProjectsSummarySig(
      state.projects,
      state.expandedProjectIds,
      state.searchActiveProjectIds,
      state.isTasksRequested
    )
  );

  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setIsTasksLoading = useAppStore((state) => state.setIsTasksLoading);
  const setAllTasksForNotifs = useAppStore((state) => state.setAllTasksForNotifs);
  const setCloudStatus = useAppStore((state) => state.setCloudStatus);
  const [wakeTick, setWakeTick] = useState(0);

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
          const { dedupedTasks, removedTaskIds } = deduplicateTasksInMemory(rawList, projects);
          if (removedTaskIds.length > 0) {
            removedTaskIds.forEach((dupId) => {
              const dupTask = pendingTasksMap.current?.get(dupId);
              pendingTasksMap.current?.delete(dupId);
              pendingTasksChanged.current.delete(dupId);
              if (dupTask) pendingTasksRemoved.current.set(dupId, dupTask);
            });
          }
          const { cleaned: unrolledTasks } = cleanOrphanTasks(dedupedTasks);
          const finalTasks = rollupParentTaskDatesAndStatus(unrolledTasks, useAppStore.getState().delegationGroups);
          finalTasks.sort((a, b) =>
            a.projectCode !== b.projectCode
              ? (a.projectCode || '').localeCompare(b.projectCode || '')
              : (a.orderIndex || 0) - (b.orderIndex || 0)
          );
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
          if (healedProjects) useAppStore.getState().setProjects(healedProjects);

          const finalIds = new Set(finalTasks.map((t) => t.id));
          const changed = Array.from(pendingTasksChanged.current.values()).filter((t) => finalIds.has(t.id));
          const removedIds = Array.from(pendingTasksRemoved.current.keys());
          pendingTasksChanged.current.clear();
          pendingTasksRemoved.current.clear();
          if (changed.length > 0) offloadPersistSnapshot('taka_tasks', changed);
          removedIds.forEach((id) => deleteLocalRecord('taka_tasks', id).catch(() => {}));

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
    if (!querySignature || isTasksRequested) return;

    const fetchNotifs = async () => {
      if (isCancelled) return;
      try {
        const loadedNotifTasks = await loadNotificationTasks({ skipFirestoreFallback: true });
        if (!isCancelled) setAllTasksForNotifs(loadedNotifTasks);
      } catch (e) {
        console.warn('[useTasksHydration] Notification lightweight tasks query error:', e);
      }
    };
    fetchNotifs();
    intervalId = setInterval(fetchNotifs, 4 * 60 * 60 * 1000);
    return () => {
      isCancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [querySignature, isTasksRequested, setAllTasksForNotifs]);

  // Main Tasks Sync Logic
  useEffect(() => {
    if (!querySignature) return;
    if (isTasksRequested) {
      flushDeferredInvalidations('taka_tasks')
        .then((synthetic) => {
          if (synthetic.length > 0) applyIncomingDeltas(synthetic);
        })
        .catch(() => {});
    }

    const activeProjectIds = isTasksRequested
      ? [...new Set([...expandedProjectIds, ...searchActiveProjectIds])]
      : [];
    const currentSig = `${querySignature}_${activeProjectIds.join(',')}_${isTasksRequested}_${activeProjectsSummarySig}_${wakeRefreshCounter.current}`;

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
      const storeState = useAppStore.getState();
      const currentProjects = storeState.projects || [];
      const currentStoreFilter = storeState.globalStoreFilter;
      const keysToHydrate = extractKeysToHydrate(activeProjectIds, currentProjects, globalYearFilter);

      await Promise.all([
        hydrateTasksForProjects(Array.from(keysToHydrate), globalYearFilter, currentStoreFilter),
        hydrateDelegationsForProjects(activeProjectIds, globalYearFilter, currentStoreFilter),
      ]);
      if (isCancelled) return;
      const markers = await getLoadedMarkers();
      if (isCancelled) return;

      setIsTasksLoading(true);

      const projectsByYear = groupActiveProjectsByYear(
        activeProjectIds,
        currentProjects,
        globalYearFilter
      );

      const neededKeys = new Set<string>();
      const currentTasksSnapshot = useAppStore.getState().tasks || [];
      const tasksLookupIndex = buildProjectTasksLookupIndex(currentTasksSnapshot);

      projectsByYear.forEach((projs, year) => {
        const yearKey = `year_${year}`;
        const isYearFresh = hasFreshMarker(markers, 'tasks_year', year);
        const isArchivedPastYear = Number(year) < new Date().getFullYear() - 1;

        if (tasksPool.current.has(yearKey)) {
          neededKeys.add(yearKey);
          if (tasksTTLTimeouts.current.has(yearKey)) {
            clearTimeout(tasksTTLTimeouts.current.get(yearKey)!);
            tasksTTLTimeouts.current.delete(yearKey);
          }
          setIsTasksLoading(false);
          return;
        }

        const visibleSet = new Set(
          (visibleActiveProjectIdsRef.current || []).map((id) => String(id))
        );
        const sortedProjs = [...projs].sort((a, b) => {
          const aVis = visibleSet.has(a.id) || visibleSet.has(a.code) ? 1 : 0;
          const bVis = visibleSet.has(b.id) || visibleSet.has(b.code) ? 1 : 0;
          return bVis - aVis;
        });

        const unhydratedProjs: typeof sortedProjs = [];
        let hydratedLocalTaskCount = 0;
        let hasAnyNonZeroHydrated = false;
        const isTargetedExpansion = sortedProjs.length <= 25 && !isArchivedPastYear;

        sortedProjs.forEach((p) => {
          const projKey = `proj_${p.id}`;
          neededKeys.add(projKey);

          if (tasksTTLTimeouts.current.has(projKey)) {
            clearTimeout(tasksTTLTimeouts.current.get(projKey)!);
            tasksTTLTimeouts.current.delete(projKey);
          }

          const localProjTasks = getLocalProjectTasksFromIndex(p, tasksLookupIndex);
          const { alreadyActiveInPool, deltaManaged, isZeroTaskProject, coversAllSummaries } =
            evaluateProjectTaskHydrationState({
              p,
              projKey,
              localProjTasks,
              markers,
              isYearFresh,
              isArchivedPastYear,
              isTargetedExpansion,
              deltaFirstTasks: DELTA_FIRST.tasks,
              tasksPool: tasksPool.current,
              knownHydratedProjectCodes: knownHydratedProjectCodes.current,
            });

          if (alreadyActiveInPool) return;

          if (deltaManaged) {
            if (coversAllSummaries || isZeroTaskProject) {
              knownHydratedProjectCodes.current.add(String(p.id));
              markProjectTasksHydrated(p.id);
            }
            const noop = () => {};
            (noop as any).__isNoop = true;
            if (isZeroTaskProject) (noop as any).__isZeroTaskNoop = true;
            tasksPool.current.set(projKey, noop);
            hydratedLocalTaskCount += localProjTasks.length;
            if (!isZeroTaskProject) hasAnyNonZeroHydrated = true;
          } else {
            unhydratedProjs.push(p);
          }
        });

        if (hydratedLocalTaskCount > 0 || hasAnyNonZeroHydrated) {
          setCloudStatus('online');
          const healed = healProjectsAfterTasksBatch({
            currentProjects: useAppStore.getState().projects || [],
            finalTasks: currentTasksSnapshot,
            delegationGroups: useAppStore.getState().delegationGroups || [],
            changedTasks: new Map(),
            removedTasks: new Map(),
            fromCache: true,
            knownHydratedProjectCodes: knownHydratedProjectCodes.current,
            tasksPool: tasksPool.current,
          });
          if (healed) {
            useAppStore.getState().setProjects(healed);
          }
          usePerformanceStore
            .getState()
            .trackGetDoc(
              `taka_tasks_${yearKey}_dexie`,
              true,
              hydratedLocalTaskCount,
              `Dexie Local-First Tasks (0 Read, ${sortedProjs.length - unhydratedProjs.length} projects)`
            );
        }

        if (unhydratedProjs.length === 0) {
          setIsTasksLoading(false);
          return;
        }

        if (unhydratedProjs.length > 50 && String(year).toLowerCase() !== 'all') {
          neededKeys.add(yearKey);
          unhydratedProjs.forEach((p) => {
            const pKey = `proj_${p.id}`;
            neededKeys.delete(pKey);
            if (tasksPool.current.has(pKey)) {
              tasksPool.current.get(pKey)?.();
              tasksPool.current.delete(pKey);
              usePerformanceStore.getState().unregisterListener(`taka_tasks_${pKey}`);
            }
          });
          attachYearTasksListener({
            year,
            yearKey,
            projectsInYear: projs,
            userRole,
            allowedStores,
            deltaFirstTasks: DELTA_FIRST.tasks,
            tasksPool: tasksPool.current,
            knownHydratedProjectCodes: knownHydratedProjectCodes.current,
            getCurrentPendingOrStoreTasks,
            batchTasksUpdate,
            setIsTasksLoading,
            setCloudStatus,
          });
        } else {
          unhydratedProjs.forEach((p) => {
            const projKey = `proj_${p.id}`;
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
          });
        }
      });

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

    const handleSleepWakeRecovery = (e?: Event) => {
      const elapsedSleepMs = Number((e as CustomEvent)?.detail?.elapsedSleepMs || 0);
      // Only reset pool if device slept longer than the 24h marker TTL; normal sleep/wake is handled by pullAndApplyDeltas
      if (elapsedSleepMs > 24 * 60 * 60 * 1000) {
        knownHydratedProjectCodes.current.clear();
        tasksPool.current.forEach((u, key) => {
          if ((u as any)?.__isNoop) {
            tasksPool.current.delete(key);
          }
        });
        wakeRefreshCounter.current += 1;
        if (useAppStore.getState().isTasksRequested) {
          setWakeTick((prev) => prev + 1);
        }
      }
      if (useAppStore.getState().isTasksRequested) {
        hydrateTasksFromLocal(useAppStore.getState().globalYearFilter).catch(() => {});
        pullAndApplyDeltas(undefined, true).catch(() => {});
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
    activeProjectsSummarySig,
    globalYearFilter,
    batchTasksUpdate,
    setIsTasksLoading,
    setCloudStatus,
    wakeTick,
  ]);
}
