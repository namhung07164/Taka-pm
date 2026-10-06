import {
  localDb,
  bulkPersistProjects,
  bulkPersistTasks,
  bulkPersistCosts,
  bulkPersistDelegations,
  upsertLocalRecord,
  deleteLocalRecord,
  getLocalProjects,
  getLocalTasks,
  getLocalCosts,
  getLocalDelegations,
} from './localDb';
import { useAppStore } from '../store/useAppStore';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { pullAndApplyDeltas } from './deltaSyncService';
import { TakaDelta, Project, Task, Cost, DelegationGroup } from '../types';

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
    const [projects, tasks, costs, delegations] = await Promise.all([
      getLocalProjects(),
      getLocalTasks(),
      getLocalCosts(),
      getLocalDelegations(),
    ]);

    const store = useAppStore.getState();

    if (projects.length > 0 && (!store.projects || store.projects.length === 0)) {
      store.setProjects(projects);
    }
    if (tasks.length > 0 && store.isTasksRequested && (!store.tasks || store.tasks.length === 0)) {
      store.setTasks(tasks);
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
 * Ghi nhận các Delta nhận được từ server vào Dexie Local Database ngầm
 */
export async function applyDeltasToLocalDatabase(deltas: TakaDelta[]): Promise<void> {
  if (!deltas || deltas.length === 0) return;

  // Thực hiện giao dịch bất đồng bộ ngoài luồng render UI
  setTimeout(async () => {
    try {
      await localDb.transaction('rw', [localDb.projects, localDb.tasks, localDb.costs, localDb.delegations], async () => {
        for (const delta of deltas) {
          if (delta.action === 'delete') {
            await deleteLocalRecord(delta.collectionName, delta.docId);
          } else {
            await upsertLocalRecord(delta.collectionName, { id: delta.docId, ...delta.data });
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

  // 2. Định kỳ kích hoạt Delta Sync
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
  };
}
