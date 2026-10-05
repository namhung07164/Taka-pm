import Dexie, { type Table } from 'dexie';
import { Project, Task, Cost, DelegationGroup } from '../types';

export interface LocalSyncMeta {
  key: string;
  value: string;
  updatedAt: number;
}

/**
 * TakaLocalDB: IndexedDB Local-First Database bọc bởi Dexie.js
 * Cung cấp khả năng lưu trữ cục bộ có chỉ mục (indexed), truy vấn O(1) và nạp tức thì 0ms
 */
export class TakaLocalDB extends Dexie {
  projects!: Table<Project, string>;
  tasks!: Table<Task, string>;
  costs!: Table<Cost, string>;
  delegations!: Table<DelegationGroup, string>;
  syncMeta!: Table<LocalSyncMeta, string>;

  constructor() {
    super('TakaLocalFirstDB_v1');
    this.version(1).stores({
      projects: '&id, code, store, year, status, updatedAt',
      tasks: '&id, projectId, code, store, year, status, updatedAt',
      costs: '&id, projectId, code, store, year, status, updatedAt',
      delegations: '&id, projectId, code, store, year, status, updatedAt',
      syncMeta: '&key, updatedAt',
    });
  }
}

export const localDb = new TakaLocalDB();

/**
 * Lưu hàng loạt Dự án vào Local Database (Dexie)
 */
export async function bulkPersistProjects(projects: Project[]): Promise<void> {
  if (!projects || projects.length === 0) return;
  try {
    await localDb.projects.bulkPut(projects);
  } catch (err) {
    console.warn('[localDb] bulkPersistProjects error:', err);
  }
}

/**
 * Lưu hàng loạt Tasks vào Local Database (Dexie)
 */
export async function bulkPersistTasks(tasks: Task[]): Promise<void> {
  if (!tasks || tasks.length === 0) return;
  try {
    await localDb.tasks.bulkPut(tasks);
  } catch (err) {
    console.warn('[localDb] bulkPersistTasks error:', err);
  }
}

/**
 * Lưu hàng loạt Costs vào Local Database (Dexie)
 */
export async function bulkPersistCosts(costs: Cost[]): Promise<void> {
  if (!costs || costs.length === 0) return;
  try {
    await localDb.costs.bulkPut(costs);
  } catch (err) {
    console.warn('[localDb] bulkPersistCosts error:', err);
  }
}

/**
 * Lưu hàng loạt Delegation Groups vào Local Database (Dexie)
 */
export async function bulkPersistDelegations(groups: DelegationGroup[]): Promise<void> {
  if (!groups || groups.length === 0) return;
  try {
    await localDb.delegations.bulkPut(groups);
  } catch (err) {
    console.warn('[localDb] bulkPersistDelegations error:', err);
  }
}

/**
 * Cập nhật hoặc thêm mới 1 bản ghi vào bảng tương ứng trong Local Database
 */
export async function upsertLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  item: any
): Promise<void> {
  try {
    switch (collectionName) {
      case 'taka_projects':
        await localDb.projects.put(item);
        break;
      case 'taka_tasks':
        await localDb.tasks.put(item);
        break;
      case 'taka_costs':
        await localDb.costs.put(item);
        break;
      case 'taka_delegations':
        await localDb.delegations.put(item);
        break;
    }
  } catch (err) {
    console.warn(`[localDb] upsertLocalRecord error on ${collectionName}:`, err);
  }
}

/**
 * Xóa 1 bản ghi khỏi Local Database
 */
export async function deleteLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  id: string
): Promise<void> {
  try {
    switch (collectionName) {
      case 'taka_projects':
        await localDb.projects.delete(id);
        break;
      case 'taka_tasks':
        await localDb.tasks.delete(id);
        break;
      case 'taka_costs':
        await localDb.costs.delete(id);
        break;
      case 'taka_delegations':
        await localDb.delegations.delete(id);
        break;
    }
  } catch (err) {
    console.warn(`[localDb] deleteLocalRecord error on ${collectionName}:`, err);
  }
}

/**
 * Đọc toàn bộ Dự án từ Local Database theo bộ lọc
 */
export async function getLocalProjects(year?: string, store?: string): Promise<Project[]> {
  try {
    let collection = localDb.projects.toCollection();
    if (year && year !== 'all' && year !== 'ALL') {
      collection = localDb.projects.where('year').equals(String(year));
    }
    const results = await collection.toArray();
    if (store && store !== 'all' && store !== 'ALL') {
      return results.filter(
        (p) => p.store && p.store.toLowerCase() === store.toLowerCase()
      );
    }
    return results;
  } catch (err) {
    console.warn('[localDb] getLocalProjects error:', err);
    return [];
  }
}

/**
 * Đọc toàn bộ Tasks từ Local Database
 */
export async function getLocalTasks(year?: string): Promise<Task[]> {
  try {
    let collection = localDb.tasks.toCollection();
    if (year && year !== 'all' && year !== 'ALL') {
      collection = localDb.tasks.where('year').equals(String(year));
    }
    return await collection.toArray();
  } catch (err) {
    console.warn('[localDb] getLocalTasks error:', err);
    return [];
  }
}

/**
 * Đọc toàn bộ Costs từ Local Database
 */
export async function getLocalCosts(year?: string): Promise<Cost[]> {
  try {
    let collection = localDb.costs.toCollection();
    if (year && year !== 'all' && year !== 'ALL') {
      collection = localDb.costs.where('year').equals(String(year));
    }
    return await collection.toArray();
  } catch (err) {
    console.warn('[localDb] getLocalCosts error:', err);
    return [];
  }
}

/**
 * Đọc toàn bộ Delegations từ Local Database
 */
export async function getLocalDelegations(): Promise<DelegationGroup[]> {
  try {
    return await localDb.delegations.toArray();
  } catch (err) {
    console.warn('[localDb] getLocalDelegations error:', err);
    return [];
  }
}

/**
 * Đọc giá trị metadata đồng bộ
 */
export async function getLocalSyncMeta(key: string): Promise<string | null> {
  try {
    const record = await localDb.syncMeta.get(key);
    return record ? record.value : null;
  } catch {
    return null;
  }
}

/**
 * Ghi giá trị metadata đồng bộ
 */
export async function setLocalSyncMeta(key: string, value: string): Promise<void> {
  try {
    await localDb.syncMeta.put({
      key,
      value,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.warn('[localDb] setLocalSyncMeta error:', err);
  }
}
