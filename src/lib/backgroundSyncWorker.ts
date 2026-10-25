import {
  localDb, bulkPersistProjects, bulkPersistTasks, bulkPersistCosts, bulkPersistDelegations,
  upsertLocalRecord, patchLocalRecord, deleteLocalRecord,
  getLocalProjects, getLocalTasks, getLocalTasksForProjects, getLocalCosts, getLocalDelegations,
} from './localDb';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { pullAndApplyDeltas } from './deltaSyncService';
import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';
import { deduplicateTasks } from './taskDeduplicationService';
import { initBroadcastSyncListener } from './broadcastSyncService';
import { purgeOldDeltas } from './deltaPurgeService';
import { enforceStorageBudget } from './storageBudgetService';
import { isTaskBelongsToProject } from './utils';
import { getTasksForProject, calculateProjectComputedDates, syncProjectDatesToFirestore } from './projectDatesService';
import {
  tsOf, buildZombieProjectIndex, isZombieTaskAgainstProjects,
  hydrateCostsFromLocal, hydrateDelegationsFromLocal, hydrateDelegationsForProjects, hydrateDelegationsForTasks,
} from './backgroundSyncParts/localHydrationHelpers';
import { isProjectDeletedInTracker } from './taskDeletedTracker';

export { hydrateCostsFromLocal, hydrateDelegationsFromLocal, hydrateDelegationsForProjects, hydrateDelegationsForTasks };

/**
 * Làm tươi (refresh) Task của một dự án cụ thể khi có biến động (0ms lag)
 */
export async function refreshProjectTasksAndDates(pId: string): Promise<void> {
  const store = useAppStore.getState();
  const p = store.projects.find((proj) => proj.id === pId);
  if (!p) return;

  const pTasks = getTasksForProject(p, store.tasks);

  const computed = calculateProjectComputedDates(p, pTasks, store.delegationGroups);
  if (
    computed.taskCount !== p.taskCount ||
    JSON.stringify(computed.taskSummaries) !== JSON.stringify(p.taskSummaries)
  ) {
    await syncProjectDatesToFirestore(p.id, computed);
  }
}

let bootstrapInFlightPromise: Promise<{
  projectCount: number;
  taskCount: number;
  costCount: number;
}> | null = null;
let activeLocalDeltaWritePromise: Promise<void> | null = null;

/**
 * Nạp tức thì (Instant Boot ~5ms, 0 Read) dữ liệu từ Dexie Local-First Engine vào Zustand Store
 */
export function bootstrapLocalStore(): Promise<{
  projectCount: number;
  taskCount: number;
  costCount: number;
}> {
  if (bootstrapInFlightPromise) return bootstrapInFlightPromise;

  bootstrapInFlightPromise = (async () => {
    const start = performance.now();
    try {
      const store = useAppStore.getState();
      const currentYear = store.globalYearFilter;

      const [projects, tasks, costs, delegations] = await Promise.all([
        getLocalProjects('all'),
        store.isTasksRequested ? getLocalTasks(currentYear) : Promise.resolve([]),
        store.isCostsRequested ? getLocalCosts(currentYear) : Promise.resolve([]),
        store.isDelegationsRequested ? getLocalDelegations(currentYear) : Promise.resolve([]),
      ]);

      const validProjects = projects.filter((p) => p && !p.isDeleted && !isProjectDeletedInTracker(p.id));
      if (validProjects.length > 0 && (!store.projects || store.projects.length === 0)) {
        const normalizedProjects = validProjects
          .map((p) => ({
            ...p,
            taskCount:
              Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0
                ? p.taskSummaries.length
                : (p.taskCount ?? 0),
          }))
          .sort((a, b) => (a.no || 0) - (b.no || 0));
        store.setProjects(normalizedProjects);
      }
      if (tasks.length > 0 && store.isTasksRequested && (!store.tasks || store.tasks.length === 0)) {
        const zombieIndex = buildZombieProjectIndex(validProjects);
        const cleanTasks = tasks.filter(
          (t) => !isZombieTaskAgainstProjects(t, validProjects, zombieIndex)
        );
        store.setTasks(deduplicateTasks(cleanTasks, validProjects));
      }
      if (costs.length > 0 && store.isCostsRequested && (!store.costs || store.costs.length === 0)) {
        store.setCosts(costs);
      }
      if (
        delegations.length > 0 &&
        store.isDelegationsRequested &&
        (!store.delegationGroups || store.delegationGroups.length === 0)
      ) {
        store.setDelegationGroups(delegations);
      }

      const duration = Math.round(performance.now() - start);
      if (validProjects.length > 0) {
        usePerformanceStore
          .getState()
          .trackGetDoc('dexie_local_db', true, validProjects.length, `Local-First Boot in ${duration}ms`);
      }

      setTimeout(() => {
        enforceStorageBudget().catch(() => {});
      }, 1000);

      return {
        projectCount: validProjects.length,
        taskCount: tasks.length,
        costCount: costs.length,
      };
    } catch (err) {
      console.warn('[backgroundSyncWorker] bootstrapLocalStore error:', err);
      return { projectCount: 0, taskCount: 0, costCount: 0 };
    } finally {
      bootstrapInFlightPromise = null;
    }
  })();

  return bootstrapInFlightPromise;
}

/**
 * Nạp tức thời Projects từ Dexie khi mở app hoặc chuyển năm (0ms UI, 0 Firestore Read)
 */
export async function hydrateProjectsFromLocal(
  year?: string,
  _storeFilter?: string
): Promise<number> {
  try {
    if (activeLocalDeltaWritePromise) await activeLocalDeltaWritePromise;
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    const preHydrateIds = new Set((store.projects || []).map((p) => String(p.id)));

    const localProjects = await getLocalProjects(targetYear);
    if (activeLocalDeltaWritePromise) await activeLocalDeltaWritePromise;
    const currentProjects = useAppStore.getState().projects || [];
    const mergedMap = new Map<string, Project>();

    currentProjects.forEach((p) => {
      if (p && p.id && !p.isDeleted && !isProjectDeletedInTracker(p.id)) {
        mergedMap.set(String(p.id), p);
      }
    });

    if (localProjects && localProjects.length > 0) {
      localProjects.forEach((p) => {
        if (p && p.id && !p.isDeleted && !isProjectDeletedInTracker(p.id)) {
          const pIdStr = String(p.id);
          const existing = mergedMap.get(pIdStr);
          // Do not resurrect a project that was in memory before getLocalProjects and removed concurrently by a delta
          if (!existing && preHydrateIds.has(pIdStr)) return;
          if (!existing || tsOf(p.updatedAt) > tsOf(existing.updatedAt)) {
            mergedMap.set(pIdStr, {
              ...(existing || {}),
              ...p,
              taskCount:
                Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0
                  ? p.taskSummaries.length
                  : (p.taskCount ?? existing?.taskCount ?? 0),
              taskSummaries: p.taskSummaries || existing?.taskSummaries,
            });
          }
        }
      });
    }

    const mergedList = Array.from(mergedMap.values()).sort((a, b) => (a.no || 0) - (b.no || 0));
    useAppStore.getState().setProjects(mergedList);

    if (localProjects && localProjects.length > 0) {
      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_projects_hydration',
          true,
          localProjects.length,
          'Instant Local-First Projects Hydration (0ms, 0 Read)'
        );
      return localProjects.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateProjectsFromLocal error:', err);
    return 0;
  }
}

/**
 * Nạp tức thời Tasks từ Dexie khi người dùng chuyển sang tab yêu cầu Tasks (0ms UI, triệt tiêu Spinner)
 */
export async function hydrateTasksFromLocal(year?: string): Promise<number> {
  try {
    if (activeLocalDeltaWritePromise) await activeLocalDeltaWritePromise;
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    const localTasks = await getLocalTasks(targetYear);
    if (localTasks && localTasks.length > 0) {
      const currentStore = useAppStore.getState();
      const projectsNow = currentStore.projects || [];
      const existing = currentStore.tasks || [];
      const zombieIdsToDelete: string[] = [];
      const zombieIndex = buildZombieProjectIndex(projectsNow);

      const tMap = new Map<string, Task>();
      let existingZombieCount = 0;
      existing.forEach((t) => {
        if (!isZombieTaskAgainstProjects(t, projectsNow, zombieIndex)) {
          tMap.set(t.id, t);
        } else {
          existingZombieCount++;
        }
      });

      let anyNewOrUpdated = false;
      localTasks.forEach((t) => {
        if (isZombieTaskAgainstProjects(t, projectsNow, zombieIndex)) {
          if (t?.id) zombieIdsToDelete.push(t.id);
          return;
        }
        const prev = tMap.get(t.id);
        if (!prev || tsOf(t.updatedAt) >= tsOf(prev.updatedAt)) {
          if (!prev || tsOf(t.updatedAt) > tsOf(prev.updatedAt)) anyNewOrUpdated = true;
          tMap.set(t.id, prev ? { ...prev, ...t } : t);
        }
      });

      if (zombieIdsToDelete.length > 0) {
        zombieIdsToDelete.forEach((id) => {
          deleteLocalRecord('taka_tasks', id).catch(() => {});
        });
      }

      if (!anyNewOrUpdated && tMap.size === existing.length && existingZombieCount === 0) {
        return existing.length;
      }

      const deduped = deduplicateTasks(Array.from(tMap.values()), projectsNow);
      currentStore.setTasks(deduped);

      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_tasks_hydration',
          true,
          deduped.length,
          'Instant Local-First Tasks Hydration (0ms)'
        );
      return deduped.length;
    }
    return store.tasks?.length || 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateTasksFromLocal error:', err);
    return 0;
  }
}

/**
 * Nạp tức thì Tasks của các dự án cụ thể từ Dexie vào Zustand (0ms UI, không chờ Firestore)
 */
export async function hydrateTasksForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  storeFilter?: string | null
): Promise<number> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return 0;
  try {
    const store = useAppStore.getState();
    const currentProjects = store.projects || [];
    const normYear =
      year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
        ? String(year).trim()
        : '';
    const normStore =
      storeFilter && String(storeFilter).toLowerCase() !== 'all'
        ? String(storeFilter).trim().toUpperCase()
        : '';

    const keySet = new Set(projectIdsOrCodes.map((k) => String(k).trim()).filter(Boolean));
    const lowerKeySet = new Set(
      projectIdsOrCodes.map((k) => String(k).trim().toLowerCase()).filter(Boolean)
    );

    const codesCoveredByIdMatch = new Set<string>();
    currentProjects.forEach((p) => {
      if (p && !p.isDeleted && p.id && keySet.has(String(p.id).trim()) && p.code) {
        codesCoveredByIdMatch.add(String(p.code).trim().toLowerCase());
      }
    });

    const targetProjects = currentProjects.filter((p) => {
      if (!p || p.isDeleted) return false;
      if (p.id && keySet.has(String(p.id).trim())) return true;
      const pCode = String(p.code || '').trim().toLowerCase();
      if (pCode && lowerKeySet.has(pCode) && !codesCoveredByIdMatch.has(pCode)) {
        if (normYear && p.year && String(p.year).trim() !== normYear) return false;
        if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore)
          return false;
        return true;
      }
      return false;
    });

    const expandedKeys = new Set<string>(keySet);
    targetProjects.forEach((p) => {
      if (p.id) expandedKeys.add(String(p.id).trim());
      if (p.code) expandedKeys.add(String(p.code).trim());
      if (p.linkCodes) {
        String(p.linkCodes)
          .split(/[,;/]+/)
          .forEach((c) => {
            if (c.trim()) expandedKeys.add(c.trim());
          });
      }
    });

    if (activeLocalDeltaWritePromise) await activeLocalDeltaWritePromise;
    const localTasks = await getLocalTasksForProjects(Array.from(expandedKeys), year, storeFilter);
    if (!localTasks || localTasks.length === 0) return 0;

    const latestStore = useAppStore.getState();
    const existingTasks = latestStore.tasks || [];
    const taskMap = new Map<string, Task>(existingTasks.map((t) => [t.id, t]));
    let changedCount = 0;
    const zombieIndex = buildZombieProjectIndex(currentProjects);

    for (const t of localTasks) {
      if (isZombieTaskAgainstProjects(t, currentProjects, zombieIndex)) {
        if (t?.id) deleteLocalRecord('taka_tasks', t.id).catch(() => {});
        continue;
      }
      if (targetProjects.length > 0 && !targetProjects.some((p) => isTaskBelongsToProject(t, p))) {
        continue;
      }
      const prev = taskMap.get(t.id);
      if (!prev || tsOf(t.updatedAt) > tsOf(prev.updatedAt)) {
        taskMap.set(t.id, prev ? { ...prev, ...t } : t);
        changedCount++;
      }
    }

    if (changedCount > 0) {
      const merged = deduplicateTasks(Array.from(taskMap.values()), latestStore.projects);
      latestStore.setTasks(merged);
      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_tasks_partial_hydration',
          true,
          changedCount,
          `Local-First Hydration for ${projectIdsOrCodes.length} projects (0ms)`
        );
      return changedCount;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateTasksForProjects error:', err);
    return 0;
  }
}

/**
 * Ghi nhận các Delta nhận được từ server vào Dexie Local Database ngầm
 */
export async function applyDeltasToLocalDatabase(deltas: TakaDelta[]): Promise<void> {
  if (!deltas || deltas.length === 0) return;

  const writeJob = new Promise<void>((resolve) => {
    setTimeout(async () => {
      try {
        await localDb.transaction(
          'rw',
          [localDb.projects, localDb.tasks, localDb.costs, localDb.delegations],
          async () => {
            const processDeltaItem = async (docId?: string, collectionName?: any, action?: string, data?: any, isPatch?: boolean) => {
              if (!docId || !collectionName) return;
              if (collectionName === 'taka_delegation_groups') collectionName = 'taka_delegations';
              if (action === 'delete' || data?.isDeleted === true) {
                await deleteLocalRecord(collectionName, docId);
              } else if (isPatch === true || (action === 'update' && isPatch !== false)) {
                await patchLocalRecord(collectionName, docId, data || {});
              } else {
                await upsertLocalRecord(collectionName, { id: docId, ...data });
              }
            };

            for (const delta of deltas) {
              if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
                for (const item of delta.batchItems) {
                  if (item.invalidate) continue;
                  await processDeltaItem(item.docId, item.collectionName, item.action, item.data, item.isPatch);
                }
              } else if (delta.docId && delta.collectionName) {
                await processDeltaItem(delta.docId, delta.collectionName, delta.action, delta.data, delta.isPatch);
              }
            }
          }
        );
      } catch (err) {
        console.warn('[backgroundSyncWorker] applyDeltasToLocalDatabase error:', err);
      } finally {
        resolve();
      }
    }, 0);
  });

  activeLocalDeltaWritePromise = writeJob;
  return writeJob;
}

/**
 * Lưu snapshot từ Firestore vào Dexie Local Database mà không làm nghẽn Main Thread
 */
export function offloadPersistSnapshot(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  items: any[]
): void {
  if (!items || items.length === 0) return;

  setTimeout(async () => {
    try {
      switch (collectionName) {
        case 'taka_projects':
          await bulkPersistProjects(items as Project[]);
          break;
        case 'taka_tasks':
          await bulkPersistTasks(items as Task[]);
          break;
        case 'taka_costs':
          await bulkPersistCosts(items as Cost[]);
          break;
        case 'taka_delegations':
          await bulkPersistDelegations(items as DelegationGroup[]);
          break;
      }
    } catch (err) {
      console.warn(`[backgroundSyncWorker] offloadPersistSnapshot error on ${collectionName}:`, err);
    }
  }, 0);
}

let syncCoordinatorTimer: any = null;

/**
 * Khởi chạy Background Sync Coordinator
 * Điều phối đồng bộ hai chiều giữa Dexie Local Engine và Firestore Delta Bus
 */
export function startBackgroundSyncCoordinator(intervalMs: number = 5 * 60 * 1000): () => void {
  if (typeof window === 'undefined') return () => {};

  bootstrapLocalStore().catch(() => {});
  const cleanupBroadcast = initBroadcastSyncListener();

  setTimeout(() => {
    purgeOldDeltas(48).catch(() => {});
  }, 5000);

  const runSync = async () => {
    try {
      const year = useAppStore.getState().globalYearFilter;
      await pullAndApplyDeltas(year);
    } catch (err) {
      console.warn('[backgroundSyncWorker] runSync error:', err);
    }
  };

  if (syncCoordinatorTimer) {
    clearInterval(syncCoordinatorTimer);
  }

  syncCoordinatorTimer = setInterval(runSync, intervalMs);

  return () => {
    if (syncCoordinatorTimer) {
      clearInterval(syncCoordinatorTimer);
      syncCoordinatorTimer = null;
    }
    cleanupBroadcast();
  };
}
