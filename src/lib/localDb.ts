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
    this.version(2).stores({
      projects: '&id, code, store, year, status, updatedAt',
      tasks: '&id, projectId, projectCode, code, projectStore, projectYear, store, year, status, updatedAt',
      costs: '&id, projectId, projectCode, code, projectStore, projectYear, store, year, status, updatedAt',
      delegations: '&id, projectId, projectCode, code, projectStore, projectYear, store, year, status, updatedAt',
      syncMeta: '&key, updatedAt',
    });
    this.version(3).stores({
      delegations: '&id, projectId, projectCode, parentTaskId, code, projectStore, projectYear, store, year, status, updatedAt',
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
 * Áp dụng field-level patch vào Local Database (Dexie)
 * Nếu bản ghi đã tồn tại: chỉ cập nhật các trường thay đổi (giữ nguyên các trường còn lại)
 * Nếu chưa tồn tại: thêm mới bản ghi
 */
export async function patchLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  id: string,
  patch: Record<string, any>
): Promise<void> {
  if (!id || !patch) return;
  try {
    const table = (() => {
      switch (collectionName) {
        case 'taka_projects': return localDb.projects;
        case 'taka_tasks': return localDb.tasks;
        case 'taka_costs': return localDb.costs;
        case 'taka_delegations': return localDb.delegations;
      }
    })();
    // Patch only existing rows. Creating a row from a partial patch produced incomplete records
    // (missing year/code/store) that later hydrated into the UI as broken data.
    await (table as any).update(id, patch);
  } catch (err) {
    console.warn(`[localDb] patchLocalRecord error on ${collectionName}:`, err);
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
    const activeProjects = results.filter((p) => !p.isDeleted);
    if (store && store !== 'all' && store !== 'ALL') {
      return activeProjects.filter(
        (p) => p.store && p.store.toLowerCase() === store.toLowerCase()
      );
    }
    return activeProjects;
  } catch (err) {
    console.warn('[localDb] getLocalProjects error:', err);
    return [];
  }
}

/**
 * Đọc Tasks từ Local Database theo danh sách Project IDs hoặc Project Codes
 */
export async function getLocalTasksForProjects(projectIdsOrCodes: string[]): Promise<Task[]> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return [];
  try {
    const rawIds = projectIdsOrCodes.map(id => String(id).trim()).filter(Boolean);
    if (rawIds.length === 0) return [];
    const [byProjId, byProjCode, byCode] = await Promise.all([
      localDb.tasks.where('projectId').anyOf(rawIds).toArray().catch(() => []),
      localDb.tasks.where('projectCode').anyOf(rawIds).toArray().catch(() => []),
      localDb.tasks.where('code').anyOf(rawIds).toArray().catch(() => []),
    ]);
    const mergedMap = new Map<string, Task>();
    for (const t of byProjId) {
      if (t && t.id && !t.isDeleted) mergedMap.set(t.id, t);
    }
    for (const t of byProjCode) {
      if (t && t.id && !t.isDeleted) mergedMap.set(t.id, t);
    }
    for (const t of byCode) {
      if (t && t.id && !t.isDeleted) mergedMap.set(t.id, t);
    }
    return Array.from(mergedMap.values());
  } catch (err) {
    console.warn('[localDb] getLocalTasksForProjects error:', err);
    return [];
  }
}

/**
 * Đọc toàn bộ Tasks từ Local Database
 */
export async function getLocalTasks(year?: string): Promise<Task[]> {
  try {
    if (!year || year === 'all' || year === 'ALL') {
      const all = await localDb.tasks.toArray();
      return all.filter(t => !t.isDeleted);
    }
    const strYear = String(year);
    const [byYear, byProjYear] = await Promise.all([
      localDb.tasks.where('year').equals(strYear).toArray().catch(() => []),
      localDb.tasks.where('projectYear').equals(strYear).toArray().catch(() => []),
    ]);
    const merged = new Map<string, Task>();
    for (const t of byYear) if (t && t.id && !t.isDeleted) merged.set(t.id, t);
    for (const t of byProjYear) if (t && t.id && !t.isDeleted) merged.set(t.id, t);
    return Array.from(merged.values());
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
    if (!year || year === 'all' || year === 'ALL') {
      return await localDb.costs.toArray();
    }
    const strYear = String(year);
    const [byYear, byProjYear] = await Promise.all([
      localDb.costs.where('year').equals(strYear).toArray().catch(() => []),
      localDb.costs.where('projectYear').equals(strYear).toArray().catch(() => []),
    ]);
    const merged = new Map<string, Cost>();
    for (const c of byYear) if (c && c.id) merged.set(c.id, c);
    for (const c of byProjYear) if (c && c.id) merged.set(c.id, c);
    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalCosts error:', err);
    return [];
  }
}

/**
 * Đọc toàn bộ Delegations từ Local Database (hỗ trợ lọc theo năm)
 */
export async function getLocalDelegations(year?: string): Promise<DelegationGroup[]> {
  try {
    if (!year || year === 'all' || year === 'ALL') {
      return await localDb.delegations.toArray();
    }
    const strYear = String(year);
    const numYear = Number(year);
    const queries = [
      localDb.delegations.where('year').equals(strYear).toArray().catch(() => []),
      localDb.delegations.where('projectYear').equals(strYear).toArray().catch(() => []),
    ];
    if (!isNaN(numYear)) {
      queries.push(
        localDb.delegations.where('projectYear').equals(numYear).toArray().catch(() => [])
      );
    }
    const results = await Promise.all(queries);
    const merged = new Map<string, DelegationGroup>();
    for (const list of results) {
      for (const d of list) {
        if (d && d.id) merged.set(d.id, d);
      }
    }
    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalDelegations error:', err);
    return [];
  }
}

/**
 * Đọc Delegations từ Local Database theo danh sách Project IDs hoặc Project Codes
 */
export async function getLocalDelegationsForProjects(projectIdsOrCodes: string[]): Promise<DelegationGroup[]> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return [];
  try {
    const rawKeys = projectIdsOrCodes.map(k => String(k).trim()).filter(Boolean);
    if (rawKeys.length === 0) return [];

    const [byProjCode, byProjId, byCode] = await Promise.all([
      localDb.delegations.where('projectCode').anyOf(rawKeys).toArray().catch(() => []),
      localDb.delegations.where('projectId').anyOf(rawKeys).toArray().catch(() => []),
      localDb.delegations.where('code').anyOf(rawKeys).toArray().catch(() => []),
    ]);

    const merged = new Map<string, DelegationGroup>();
    for (const d of byProjCode) if (d && d.id) merged.set(d.id, d);
    for (const d of byProjId) if (d && d.id) merged.set(d.id, d);
    for (const d of byCode) if (d && d.id) merged.set(d.id, d);

    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalDelegationsForProjects error:', err);
    return [];
  }
}

/**
 * Đọc Delegations từ Local Database theo danh sách Task IDs
 */
export async function getLocalDelegationsForTasks(taskIds: string[]): Promise<DelegationGroup[]> {
  if (!taskIds || taskIds.length === 0) return [];
  try {
    const rawIds = taskIds.map(id => String(id).trim()).filter(Boolean);
    if (rawIds.length === 0) return [];

    const [byParentTaskId, byId] = await Promise.all([
      localDb.delegations.where('parentTaskId').anyOf(rawIds).toArray().catch(() => []),
      localDb.delegations.where('id').anyOf(rawIds).toArray().catch(() => []),
    ]);

    const merged = new Map<string, DelegationGroup>();
    for (const d of byParentTaskId) if (d && d.id) merged.set(d.id, d);
    for (const d of byId) if (d && d.id) merged.set(d.id, d);

    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalDelegationsForTasks error:', err);
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

/**
 * Xóa sạch toàn bộ dữ liệu Dexie IndexedDB (dành cho Resync Cache)
 */
export async function clearDexieDatabase(): Promise<void> {
  try {
    await Promise.all([
      localDb.projects.clear().catch(() => {}),
      localDb.tasks.clear().catch(() => {}),
      localDb.costs.clear().catch(() => {}),
      localDb.delegations.clear().catch(() => {}),
      localDb.syncMeta.clear().catch(() => {}),
    ]);
  } catch (err) {
    console.warn('[localDb] clearDexieDatabase error:', err);
  }
}
