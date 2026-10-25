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

import { isTaskDeletedInTracker } from './taskDeletedTracker';

const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'string') {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.toMillis === 'function') {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.seconds === 'number') {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const localDb = new TakaLocalDB();

function cleanItemForLocalDb<T extends Record<string, any>>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  if (
    '_isVirtualSummary' in item ||
    'realtimeUpdate' in item ||
    'importComment' in item ||
    'parentTaskCode' in item ||
    'parentTaskName' in item
  ) {
    const { _isVirtualSummary, realtimeUpdate, importComment, parentTaskCode, parentTaskName, ...rest } = item as any;
    return rest as T;
  }
  return item;
}

async function bulkPersistTable<T extends { id?: string; isDeleted?: boolean; _isVirtualSummary?: boolean }>(
  table: Table<T, string>,
  items: T[],
  label: string
): Promise<void> {
  if (!items || items.length === 0) return;
  try {
    const toPut: T[] = [];
    const toDelete: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.id) continue;
      const idStr = String(it.id);
      if (it._isVirtualSummary || idStr.startsWith('ts_')) continue;
      if (it.isDeleted) {
        toDelete.push(idStr);
      } else {
        toPut.push(cleanItemForLocalDb(it));
      }
    }
    if (toPut.length > 0) await table.bulkPut(toPut);
    if (toDelete.length > 0) await table.bulkDelete(toDelete);
  } catch (err) {
    console.warn(`[localDb] ${label} error:`, err);
  }
}

export async function bulkPersistProjects(projects: Project[]): Promise<void> {
  return bulkPersistTable(localDb.projects, projects, 'bulkPersistProjects');
}

export async function bulkPersistTasks(tasks: Task[]): Promise<void> {
  return bulkPersistTable(localDb.tasks, tasks, 'bulkPersistTasks');
}

export async function bulkPersistCosts(costs: Cost[]): Promise<void> {
  return bulkPersistTable(localDb.costs, costs, 'bulkPersistCosts');
}

export async function bulkPersistDelegations(groups: DelegationGroup[]): Promise<void> {
  return bulkPersistTable(localDb.delegations, groups, 'bulkPersistDelegations');
}

function getTableByCollection(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations'
): Table<any, string> {
  switch (collectionName) {
    case 'taka_projects': return localDb.projects;
    case 'taka_tasks': return localDb.tasks;
    case 'taka_costs': return localDb.costs;
    case 'taka_delegations': return localDb.delegations;
  }
}

export async function upsertLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  item: any
): Promise<void> {
  if (!item?.id || item._isVirtualSummary || String(item.id).startsWith('ts_')) return;
  try {
    const table = getTableByCollection(collectionName);
    if (item.isDeleted) {
      await table.delete(item.id);
      return;
    }
    const existing = await table.get(item.id);
    const existingTs = tsOf(existing?.updatedAt);
    const incomingTs = tsOf(item.updatedAt);
    if (existing && existingTs > 0 && incomingTs > 0 && existingTs > incomingTs) return;

    const clean = cleanItemForLocalDb(item);
    if (existing) {
      const merged: any = { ...existing, ...clean, id: item.id };
      if (collectionName === 'taka_projects') {
        if (clean.taskSummaries === undefined && existing.taskSummaries !== undefined) {
          merged.taskSummaries = existing.taskSummaries;
        }
        if (clean.taskCount === undefined && existing.taskCount !== undefined) {
          merged.taskCount = existing.taskCount;
        }
      }
      await table.put(merged);
    } else {
      await table.put(clean);
    }
  } catch (err) {
    console.warn(`[localDb] upsertLocalRecord error on ${collectionName}:`, err);
  }
}

export async function patchLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  id: string,
  patch: Record<string, any>
): Promise<void> {
  if (!id || !patch || String(id).startsWith('ts_')) return;
  try {
    const table = getTableByCollection(collectionName);
    const existing = await table.get(id);
    if (!existing) return;

    if (patch.isDeleted) {
      await table.delete(id);
      return;
    }

    const existingTs = tsOf(existing.updatedAt);
    const incomingTs = tsOf(patch.updatedAt);
    if (existingTs > 0 && incomingTs > 0 && existingTs > incomingTs) return;

    const cleanPatch = cleanItemForLocalDb(patch);
    const merged: any = { ...existing };
    for (const [k, v] of Object.entries(cleanPatch)) {
      if (v === null) {
        delete merged[k];
      } else if (v !== undefined) {
        merged[k] = v;
      }
    }
    merged.id = id;
    await table.put(merged);
  } catch (err) {
    console.warn(`[localDb] patchLocalRecord error on ${collectionName}:`, err);
  }
}

export async function deleteLocalRecord(
  collectionName: 'taka_projects' | 'taka_tasks' | 'taka_costs' | 'taka_delegations',
  id: string
): Promise<void> {
  if (!id) return;
  try {
    await getTableByCollection(collectionName).delete(id);
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
      const yearKeys: Array<string | number> = [String(year)];
      if (Number.isFinite(Number(year))) yearKeys.push(Number(year));
      collection = localDb.projects.where('year').anyOf(yearKeys);
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
 * Đọc Tasks từ Local Database theo danh sách Project IDs hoặc Project Codes (hỗ trợ lọc theo year & store)
 */
export async function getLocalTasksForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  store?: string | null
): Promise<Task[]> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return [];
  try {
    const rawIds = Array.from(new Set(projectIdsOrCodes.flatMap(id => {
      const s = String(id).trim(), norm = s.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
      return norm !== s ? [s, norm] : [s];
    }).filter(Boolean)));
    if (rawIds.length === 0) return [];
    const [byProjId, byProjCode, byCode] = await Promise.all([
      localDb.tasks.where('projectId').anyOf(rawIds).toArray().catch(() => []),
      localDb.tasks.where('projectCode').anyOf(rawIds).toArray().catch(() => []),
      localDb.tasks.where('code').anyOf(rawIds).toArray().catch(() => []),
    ]);

    const normYear = year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
      ? String(year).trim()
      : '';
    const normStore = store && String(store).toLowerCase() !== 'all'
      ? String(store).trim().toUpperCase()
      : '';

    const matchesScope = (t: Task, matchedById: boolean): boolean => {
      if (!t || !t.id || t.isDeleted) return false;
      if (isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)) return false;
      const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
      const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
      if (normYear && tYear && tYear !== normYear) return false;
      if (normStore && tStore && tStore !== normStore) return false;
      if (!matchedById && t.projectId && rawIds.length > 0) {
        // If rawIds contains a project UUID and t.projectId points to a DIFFERENT UUID while missing year/store, guard against cross-year collision
        const hasUuidInQuery = rawIds.some(k => k.length >= 16 && !k.includes(' '));
        if (hasUuidInQuery && !rawIds.includes(String(t.projectId).trim())) {
          if (!normYear || !tYear || !normStore || !tStore) return false;
        }
      }
      return true;
    };

    const mergedMap = new Map<string, Task>();
    for (const t of byProjId) {
      if (matchesScope(t, true)) mergedMap.set(t.id, t);
    }
    for (const t of byProjCode) {
      if (matchesScope(t, false)) mergedMap.set(t.id, t);
    }
    for (const t of byCode) {
      if (matchesScope(t, false)) mergedMap.set(t.id, t);
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
      return all.filter(t => !t.isDeleted && !isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined));
    }
    const strYear = String(year);
    const [byYear, byProjYear] = await Promise.all([
      localDb.tasks.where('year').anyOf(Number.isFinite(Number(strYear)) ? [strYear, Number(strYear)] : [strYear]).toArray().catch(() => []),
      localDb.tasks.where('projectYear').anyOf(Number.isFinite(Number(strYear)) ? [strYear, Number(strYear)] : [strYear]).toArray().catch(() => []),
    ]);
    const merged = new Map<string, Task>();
    for (const t of byYear) {
      if (t && t.id && !t.isDeleted && !isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)) {
        merged.set(t.id, t);
      }
    }
    for (const t of byProjYear) {
      if (t && t.id && !t.isDeleted && !isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)) {
        merged.set(t.id, t);
      }
    }
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
      const all = await localDb.costs.toArray();
      return all.filter((c) => !c.isDeleted);
    }
    const strYear = String(year);
    const [byYear, byProjYear] = await Promise.all([
      localDb.costs.where('year').anyOf(Number.isFinite(Number(strYear)) ? [strYear, Number(strYear)] : [strYear]).toArray().catch(() => []),
      localDb.costs.where('projectYear').anyOf(Number.isFinite(Number(strYear)) ? [strYear, Number(strYear)] : [strYear]).toArray().catch(() => []),
    ]);
    const merged = new Map<string, Cost>();
    for (const c of byYear) if (c && c.id && !c.isDeleted) merged.set(c.id, c);
    for (const c of byProjYear) if (c && c.id && !c.isDeleted) merged.set(c.id, c);
    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalCosts error:', err);
    return [];
  }
}

export async function getLocalDelegations(year?: string): Promise<DelegationGroup[]> {
  try {
    if (!year || year === 'all' || year === 'ALL') {
      const all = await localDb.delegations.toArray();
      return all.filter((d) => !d.isDeleted);
    }
    const strYear = String(year);
    const keys = Number.isFinite(Number(strYear)) ? [strYear, Number(strYear)] : [strYear];
    const [byYear, byProjYear] = await Promise.all([
      localDb.delegations.where('year').anyOf(keys).toArray().catch(() => []),
      localDb.delegations.where('projectYear').anyOf(keys).toArray().catch(() => []),
    ]);
    const merged = new Map<string, DelegationGroup>();
    for (const d of byYear) if (d && d.id && !d.isDeleted) merged.set(d.id, d);
    for (const d of byProjYear) if (d && d.id && !d.isDeleted) merged.set(d.id, d);
    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalDelegations error:', err);
    return [];
  }
}

/**
 * Đọc Delegations từ Local Database theo danh sách Project IDs hoặc Project Codes (hỗ trợ lọc theo year & store)
 */
export async function getLocalDelegationsForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  store?: string | null
): Promise<DelegationGroup[]> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return [];
  try {
    const rawKeys = projectIdsOrCodes.map(k => String(k).trim()).filter(Boolean);
    if (rawKeys.length === 0) return [];

    const [byProjCode, byProjId, byCode] = await Promise.all([
      localDb.delegations.where('projectCode').anyOf(rawKeys).toArray().catch(() => []),
      localDb.delegations.where('projectId').anyOf(rawKeys).toArray().catch(() => []),
      localDb.delegations.where('code').anyOf(rawKeys).toArray().catch(() => []),
    ]);

    const normYear = year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
      ? String(year).trim()
      : '';
    const normStore = store && String(store).toLowerCase() !== 'all'
      ? String(store).trim().toUpperCase()
      : '';

    const matchesScope = (d: DelegationGroup, matchedById: boolean): boolean => {
      if (!d || !d.id || d.isDeleted) return false;
      const dYear = d.projectYear !== undefined && d.projectYear !== null ? String(d.projectYear).trim() : '';
      const dStore = d.projectStore ? String(d.projectStore).trim().toUpperCase() : '';
      if (normYear && dYear && dYear !== normYear) return false;
      if (normStore && dStore && dStore !== normStore) return false;
      if (!matchedById && d.projectId && rawKeys.length > 0) {
        const hasUuidInQuery = rawKeys.some(k => k.length >= 16 && !k.includes(' '));
        if (hasUuidInQuery && !rawKeys.includes(String(d.projectId).trim())) {
          if (!normYear || !dYear || !normStore || !dStore) return false;
        }
      }
      return true;
    };

    const merged = new Map<string, DelegationGroup>();
    for (const d of byProjId) if (matchesScope(d, true)) merged.set(d.id, d);
    for (const d of byProjCode) if (matchesScope(d, false)) merged.set(d.id, d);
    for (const d of byCode) if (matchesScope(d, false)) merged.set(d.id, d);

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
    for (const d of byParentTaskId) if (d && d.id && !d.isDeleted) merged.set(d.id, d);
    for (const d of byId) if (d && d.id && !d.isDeleted) merged.set(d.id, d);

    return Array.from(merged.values());
  } catch (err) {
    console.warn('[localDb] getLocalDelegationsForTasks error:', err);
    return [];
  }
}

export async function getLocalSyncMeta(key: string): Promise<string | null> {
  try {
    const record = await localDb.syncMeta.get(key);
    return record ? record.value : null;
  } catch {
    return null;
  }
}

export async function setLocalSyncMeta(key: string, value: string): Promise<void> {
  try {
    await localDb.syncMeta.put({ key, value, updatedAt: Date.now() });
  } catch (err) {
    console.warn('[localDb] setLocalSyncMeta error:', err);
  }
}

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
