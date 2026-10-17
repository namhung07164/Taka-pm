import {
  localDb,
  bulkPersistProjects,
  bulkPersistTasks,
  bulkPersistCosts,
  bulkPersistDelegations,
  upsertLocalRecord,
  patchLocalRecord,
  deleteLocalRecord,
  getLocalProjects,
  getLocalTasks,
  getLocalTasksForProjects,
  getLocalCosts,
  getLocalDelegations,
  getLocalDelegationsForProjects,
  getLocalDelegationsForTasks,
} from './localDb';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { pullAndApplyDeltas } from './deltaSyncService';
import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';
import { deduplicateTasks } from './taskDeduplicationService';
import { initBroadcastSyncListener } from './broadcastSyncService';
import { purgeOldDeltas } from './deltaPurgeService';
import { enforceStorageBudget } from './storageBudgetService';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from './utils';

/**
 * Nạp tức thì (Instant Boot ~5ms, 0 Read) dữ liệu từ Dexie Local-First Engine vào Zustand Store
 */
export async function bootstrapLocalStore(): Promise<{
  projectCount: number;
  taskCount: number;
  costCount: number;
}> {
  const start = performance.now();
  try {
    const store = useAppStore.getState();
    const currentYear = store.globalYearFilter;

    // Boot siêu tốc (~5ms, 0 read): Chỉ nạp Projects cần thiết của năm hiện tại
    // Tuân thủ triệt để Tri-Gate lazy loading: KHÔNG đọc Task, Cost hay Delegation khi chưa kích hoạt cờ
    const [projects, tasks, costs, delegations] = await Promise.all([
      getLocalProjects(currentYear),
      store.isTasksRequested ? getLocalTasks(currentYear) : Promise.resolve([]),
      store.isCostsRequested ? getLocalCosts(currentYear) : Promise.resolve([]),
      store.isDelegationsRequested ? getLocalDelegations(currentYear) : Promise.resolve([]),
    ]);

    if (projects.length > 0 && (!store.projects || store.projects.length === 0)) {
      const normalizedProjects = projects.map(p => ({
        ...p,
        taskCount: Math.max(p.taskCount ?? 0, p.taskSummaries?.length ?? 0),
      }));
      store.setProjects(normalizedProjects);
    }
    if (tasks.length > 0 && store.isTasksRequested && (!store.tasks || store.tasks.length === 0)) {
      store.setTasks(deduplicateTasks(tasks, projects));
    }
    if (costs.length > 0 && store.isCostsRequested && (!store.costs || store.costs.length === 0)) {
      store.setCosts(costs);
    }
    if (delegations.length > 0 && store.isDelegationsRequested && (!store.delegationGroups || store.delegationGroups.length === 0)) {
      store.setDelegationGroups(delegations);
    }

    const duration = Math.round(performance.now() - start);
    if (projects.length > 0) {
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_local_db', true, projects.length, `Local-First Boot in ${duration}ms`);
    }

    // Tự động kiểm tra và bảo đảm ngân sách bộ nhớ 40MB iOS
    setTimeout(() => {
      enforceStorageBudget().catch(() => {});
    }, 1000);

    return {
      projectCount: projects.length,
      taskCount: tasks.length,
      costCount: costs.length,
    };
  } catch (err) {
    console.warn('[backgroundSyncWorker] bootstrapLocalStore error:', err);
    return { projectCount: 0, taskCount: 0, costCount: 0 };
  }
}

/**
 * Nạp tức thời Projects từ Dexie khi mở app hoặc chuyển năm (0ms UI, 0 Firestore Read)
 */
export async function hydrateProjectsFromLocal(year?: string, storeFilter?: string): Promise<number> {
  try {
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    if (store.projects && store.projects.length > 0) {
      if (!targetYear || targetYear === 'all' || targetYear === 'ALL') return store.projects.length;
      const hasForYear = store.projects.some(p => String(p.year || '') === String(targetYear));
      if (hasForYear) return store.projects.length;
    }

    const localProjects = await getLocalProjects(targetYear, storeFilter);
    if (localProjects && localProjects.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.projects || [];
      const isAll = !targetYear || targetYear === 'all' || targetYear === 'ALL';
      const baseExisting = isAll
        ? existing
        : existing.filter(p => String(p.year || '') === String(targetYear));
      const pMap = new Map<string, Project>();
      localProjects.forEach(p => {
        pMap.set(p.id, {
          ...p,
          taskCount: Math.max(p.taskCount ?? 0, p.taskSummaries?.length ?? 0),
        });
      });
      // Preserve fresher in-memory records of the target year
      baseExisting.forEach(p => pMap.set(p.id, p));

      const sorted = Array.from(pMap.values()).sort((a, b) => (a.no || 0) - (b.no || 0));
      currentStore.setProjects(sorted);
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_projects_hydration', true, localProjects.length, `Instant Local-First Projects Hydration (0ms, 0 Read)`);
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
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    if (store.tasks && store.tasks.length > 0) {
      if (!targetYear || targetYear === 'all' || targetYear === 'ALL') return store.tasks.length;
      const hasForYear = store.tasks.some(t => String(t.projectYear || '') === String(targetYear));
      if (hasForYear) return store.tasks.length;
    }

    const localTasks = await getLocalTasks(targetYear);
    if (localTasks && localTasks.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.tasks || [];
      const tMap = new Map<string, Task>(localTasks.map(t => [t.id, t]));
      // Keep fresher in-memory tasks on top of Dexie tasks
      existing.forEach(t => tMap.set(t.id, t));
      const deduped = deduplicateTasks(Array.from(tMap.values()), currentStore.projects);
      currentStore.setTasks(deduped);

      // Instant local reconciliation: sync taskCount & taskSummaries for projects from cached tasks
      if (currentStore.projects && currentStore.projects.length > 0) {
        const updatedProjects = currentStore.projects.map(p => {
          const pTasks = deduped.filter(t => isTaskBelongsToProject(t, p));
          // KHÔNG BAO GIỜ chữa theo hướng giảm (ít task hơn taskCount đã lưu nghĩa là cache cục bộ chưa nạp đủ)
          if (pTasks.length > (p.taskCount || 0)) {
            const summaryItems = pTasks.map(t => ({
              id: t.id,
              name: t.name || '',
              start: t.start || '',
              finish: t.finish || '',
              taskCodePhu: t.taskCodePhu,
              duration: t.duration,
              runningStatus: t.runningStatus,
            }));
            const validStarts = pTasks.map(t => t.start).filter(Boolean).sort();
            const validFinishes = pTasks.map(t => t.finish).filter(Boolean).sort((a, b) => b.localeCompare(a));
            return {
              ...p,
              taskCount: pTasks.length,
              taskSummaries: summaryItems,
              computedTakStart: validStarts[0] || p.start || '',
              computedTakCompl: validFinishes[0] || p.handover || (p as any).takCompl || '',
            };
          }
          return p;
        });
        currentStore.setProjects(updatedProjects);
      }

      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_tasks_hydration', true, deduped.length, 'Instant Local-First Tasks Hydration (0ms)');
      return deduped.length;
    }
    return 0;
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
    const normYear = year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
      ? String(year).trim()
      : '';
    const normStore = storeFilter && String(storeFilter).toLowerCase() !== 'all'
      ? String(storeFilter).trim().toUpperCase()
      : '';

    const keySet = new Set(projectIdsOrCodes.map(k => String(k).trim()).filter(Boolean));
    const lowerKeySet = new Set(projectIdsOrCodes.map(k => String(k).trim().toLowerCase()).filter(Boolean));

    const targetProjects = currentProjects.filter(p => {
      if (!p || p.isDeleted) return false;
      if (p.id && keySet.has(String(p.id).trim())) return true;
      const pCode = String(p.code || '').trim().toLowerCase();
      if (pCode && lowerKeySet.has(pCode)) {
        if (normYear && p.year && String(p.year).trim() !== normYear) return false;
        if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore) return false;
        return true;
      }
      return false;
    });

    const localTasks = await getLocalTasksForProjects(projectIdsOrCodes, year, storeFilter);
    if (!localTasks || localTasks.length === 0) return 0;

    const existingTasks = store.tasks || [];
    const existingIds = new Set(existingTasks.map(t => t.id));
    const newTasksToAdd: Task[] = [];

    for (const t of localTasks) {
      if (existingIds.has(t.id)) continue;
      if (targetProjects.length > 0 && !targetProjects.some(p => isTaskBelongsToProject(t, p))) {
        continue;
      }
      newTasksToAdd.push(t);
    }

    if (newTasksToAdd.length > 0) {
      const merged = deduplicateTasks([...existingTasks, ...newTasksToAdd], store.projects);
      store.setTasks(merged);
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_tasks_partial_hydration', true, newTasksToAdd.length, `Local-First Hydration for ${projectIdsOrCodes.length} projects (0ms)`);
      return newTasksToAdd.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateTasksForProjects error:', err);
    return 0;
  }
}

/**
 * Nạp tức thời Costs từ Dexie khi người dùng chuyển sang tab yêu cầu Chi phí (0ms UI)
 */
export async function hydrateCostsFromLocal(year?: string): Promise<number> {
  try {
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    if (store.costs && store.costs.length > 0) {
      if (!targetYear || targetYear === 'all' || targetYear === 'ALL') return store.costs.length;
      const hasForYear = store.costs.some(c => String(c.projectYear || '') === String(targetYear));
      if (hasForYear) return store.costs.length;
    }
    const localCosts = await getLocalCosts(targetYear);
    if (localCosts && localCosts.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.costs || [];
      const cMap = new Map<string, Cost>(localCosts.map(c => [c.id, c]));
      existing.forEach(c => cMap.set(c.id, c));
      const merged = Array.from(cMap.values());
      currentStore.setCosts(merged);
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_costs_hydration', true, localCosts.length, 'Instant Local-First Costs Hydration (0ms)');
      return localCosts.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateCostsFromLocal error:', err);
    return 0;
  }
}

/**
 * Nạp tức thời Delegations từ Dexie khi người dùng chuyển sang tab Phân quyền (0ms UI, lọc theo năm)
 */
export async function hydrateDelegationsFromLocal(year?: string): Promise<number> {
  try {
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;

    // Nếu store đã nạp delegations của năm này, giữ nguyên (0 Read)
    if (store.delegationGroups && store.delegationGroups.length > 0) {
      if (!targetYear || targetYear === 'all' || targetYear === 'ALL') {
        return store.delegationGroups.length;
      }
      const hasForYear = store.delegationGroups.some(d => String(d.projectYear || '') === String(targetYear));
      if (hasForYear) return store.delegationGroups.length;
    }

    const localDelegations = await getLocalDelegations(targetYear);
    if (localDelegations && localDelegations.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.delegationGroups || [];
      const dMap = new Map(existing.map(d => [d.id, d]));
      // Store data (from Firestore listeners / deltas) is fresher than Dexie: never overwrite it
      localDelegations.forEach(d => { if (!dMap.has(d.id)) dMap.set(d.id, d); });
      const merged = Array.from(dMap.values());
      currentStore.setDelegationGroups(merged);
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_delegations_hydration', true, localDelegations.length, `Instant Local-First Delegations Hydration for ${targetYear || 'all'} (0ms, 0 Read)`);
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsFromLocal error:', err);
    return 0;
  }
}

/**
 * Nạp tức thì Delegations của các dự án cụ thể từ Dexie vào Zustand (0ms UI, không tải cả kho 4000 items)
 */
export async function hydrateDelegationsForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  storeFilter?: string | null
): Promise<number> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return 0;
  try {
    const store = useAppStore.getState();
    const currentProjects = store.projects || [];
    const normYear = year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
      ? String(year).trim()
      : '';
    const normStore = storeFilter && String(storeFilter).toLowerCase() !== 'all'
      ? String(storeFilter).trim().toUpperCase()
      : '';

    const expandedKeys = new Set<string>();
    const targetProjects: Project[] = [];

    projectIdsOrCodes.forEach((key) => {
      const trimmed = String(key).trim();
      if (!trimmed) return;
      expandedKeys.add(trimmed);
      const matched =
        currentProjects.find((p) => String(p.id) === trimmed) ||
        currentProjects.find((p) => {
          if (String(p.code).trim().toLowerCase() !== trimmed.toLowerCase() && String(p.no) !== trimmed) {
            return false;
          }
          if (normYear && p.year && String(p.year).trim() !== normYear) return false;
          if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore) return false;
          return true;
        });
      if (matched) {
        if (!targetProjects.some(tp => tp.id === matched.id)) targetProjects.push(matched);
        if (matched.code) expandedKeys.add(String(matched.code).trim());
        if (matched.id) expandedKeys.add(String(matched.id).trim());
      }
    });

    const localDelegations = await getLocalDelegationsForProjects(Array.from(expandedKeys), year, storeFilter);
    if (!localDelegations || localDelegations.length === 0) return 0;

    const existing = store.delegationGroups || [];
    const dMap = new Map(existing.map(d => [d.id, d]));
    let hasNew = false;
    localDelegations.forEach(d => {
      if (dMap.has(d.id)) return;
      if (targetProjects.length > 0 && !targetProjects.some(p => isDelegationGroupBelongsToProject(d, p))) {
        return;
      }
      dMap.set(d.id, d);
      hasNew = true;
    });

    if (hasNew) {
      store.setDelegationGroups(Array.from(dMap.values()));
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_delegations_by_project', true, localDelegations.length, `Instant Delegations Hydration for ${projectIdsOrCodes.length} projects (0ms)`);
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsForProjects error:', err);
    return 0;
  }
}

/**
 * Nạp tức thì Delegations của các task cụ thể từ Dexie vào Zustand (0ms UI)
 */
export async function hydrateDelegationsForTasks(taskIds: string[]): Promise<number> {
  if (!taskIds || taskIds.length === 0) return 0;
  try {
    const localDelegations = await getLocalDelegationsForTasks(taskIds);
    if (!localDelegations || localDelegations.length === 0) return 0;

    const store = useAppStore.getState();
    const existing = store.delegationGroups || [];
    const dMap = new Map(existing.map(d => [d.id, d]));
    let hasNew = false;
    localDelegations.forEach(d => {
      if (!dMap.has(d.id)) {
        dMap.set(d.id, d);
        hasNew = true;
      }
    });

    if (hasNew) {
      store.setDelegationGroups(Array.from(dMap.values()));
      usePerformanceStore
        .getState()
        .trackGetDoc('dexie_delegations_by_task', true, localDelegations.length, `Instant Delegations Hydration for ${taskIds.length} tasks (0ms)`);
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsForTasks error:', err);
    return 0;
  }
}

/**
 * Ghi nhận các Delta nhận được từ server vào Dexie Local Database ngầm
 */
export async function applyDeltasToLocalDatabase(deltas: TakaDelta[]): Promise<void> {
  if (!deltas || deltas.length === 0) return;

  // Thực hiện giao dịch bất đồng bộ ngoài luồng render UI
  setTimeout(async () => {
    try {
      await localDb.transaction('rw', [localDb.projects, localDb.tasks, localDb.costs, localDb.delegations], async () => {
        const processDeltaItem = async (
          docId?: string,
          collectionName?: any,
          action?: string,
          data?: any,
          isPatch?: boolean
        ) => {
          if (!docId || !collectionName) return;
          if (collectionName === 'taka_delegation_groups') collectionName = 'taka_delegations';
          if (action === 'delete' || data?.isDeleted === true) {
            await deleteLocalRecord(collectionName, docId);
          } else if (action === 'update' || isPatch) {
            await patchLocalRecord(collectionName, docId, data || {});
          } else {
            await upsertLocalRecord(collectionName, { id: docId, ...data });
          }
        };

        for (const delta of deltas) {
          if (delta.action === 'batch_update' && Array.isArray(delta.batchItems)) {
            for (const item of delta.batchItems) {
              await processDeltaItem(item.docId, item.collectionName, item.action, item.data, item.isPatch);
            }
          } else if (delta.docId && delta.collectionName) {
            await processDeltaItem(delta.docId, delta.collectionName, delta.action, delta.data, delta.isPatch);
          }
        }
      });
    } catch (err) {
      console.warn('[backgroundSyncWorker] applyDeltasToLocalDatabase error:', err);
    }
  }, 0);
}

/**
 * Lưu snapshot từ Firestore vào Dexie Local Database mà không làm nghẽn Main Thread
 */
export function offloadPersistSnapshot(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  items: any[]
): void {
  if (!items || items.length === 0) return;

  // Đẩy sang Microtask để UI duy trì 60 FPS
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
export function startBackgroundSyncCoordinator(intervalMs: number = 30000): () => void {
  if (typeof window === 'undefined') return () => {};

  // 1. Boot local store ngay lập tức
  bootstrapLocalStore().catch(() => {});

  // 2. Kích hoạt BroadcastChannel Multi-Tab Synchronization
  const cleanupBroadcast = initBroadcastSyncListener();

  // 3. Khởi chạy ngầm Auto-Purge dọn dẹp các delta cũ (>48h) không làm nghẽn UI
  setTimeout(() => {
    purgeOldDeltas(48).catch(() => {});
  }, 5000);

  // 4. Định kỳ kích hoạt Delta Sync
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
