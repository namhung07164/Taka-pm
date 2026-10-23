import {
  getLocalCosts,
  getLocalDelegations,
  getLocalDelegationsForProjects,
  getLocalDelegationsForTasks,
} from '../localDb';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { Project, Task, Cost } from '../../types';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from '../utils';
import { isTaskDeletedInTracker, isProjectDeletedInTracker } from '../taskDeletedTracker';

export const tsOf = (v: any): number => {
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

export interface IndexedProjectSummaryEntry {
  project: Project;
  allSummariesHaveIds: boolean;
  isZeroTaskProject: boolean;
  summaryIds: Set<string>;
}

export interface ZombieProjectIndex {
  byId: Map<string, IndexedProjectSummaryEntry>;
  byCodePart: Map<string, IndexedProjectSummaryEntry[]>;
}

/**
 * Pre-indexes projects and their taskSummaries ID Sets once in O(P) to eliminate O(T * (P + S))
 * repeated scans and Set allocations inside isZombieTaskAgainstProjects.
 */
export function buildZombieProjectIndex(projects: Project[]): ZombieProjectIndex {
  const byId = new Map<string, IndexedProjectSummaryEntry>();
  const byCodePart = new Map<string, IndexedProjectSummaryEntry[]>();

  if (!Array.isArray(projects) || projects.length === 0) {
    return { byId, byCodePart };
  }

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.isDeleted || isProjectDeletedInTracker(p.id)) continue;

    const summaries = Array.isArray(p.taskSummaries) ? p.taskSummaries : null;
    const isZeroTaskProject = Boolean(
      summaries && summaries.length === 0 && (p.taskCount ?? 0) === 0
    );
    const allSummariesHaveIds = Boolean(
      summaries && summaries.length > 0 && summaries.every((s: any) => Boolean(s?.id))
    );
    const summaryIds = new Set<string>();
    if (allSummariesHaveIds && summaries) {
      for (let j = 0; j < summaries.length; j++) {
        const sId = String(summaries[j]?.id || '')
          .trim()
          .toLowerCase();
        if (sId) summaryIds.add(sId);
      }
    }

    const entry: IndexedProjectSummaryEntry = {
      project: p,
      allSummariesHaveIds,
      isZeroTaskProject,
      summaryIds,
    };

    if (p.id) {
      byId.set(String(p.id).trim(), entry);
    }

    const rawCodes = (p as any).linkCodes
      ? `${p.code || ''}, ${(p as any).linkCodes}`
      : String(p.code || '');
    const parts = rawCodes
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      let list = byCodePart.get(part);
      if (!list) {
        list = [];
        byCodePart.set(part, list);
      }
      list.push(entry);
    }
  }

  return { byId, byCodePart };
}

/**
 * Checks if a cached Dexie task `t` is a zombie that was deleted on the server according to its parent project's `taskSummaries`.
 * Uses O(1) pre-built ZombieProjectIndex when provided.
 */
export function isZombieTaskAgainstProjects(
  t: Task,
  projects: Project[],
  prebuiltIndex?: ZombieProjectIndex
): boolean {
  if (!t || !t.id || t.isDeleted) return true;
  if (isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)) return true;
  if ((t as any)._isVirtualSummary) return false;

  const updatedMs = tsOf(t.updatedAt);
  if (updatedMs > 0 && Date.now() - updatedMs <= 30000) return false;

  if (!projects || projects.length === 0) return false;

  const idx = prebuiltIndex || buildZombieProjectIndex(projects);
  let matchedEntry: IndexedProjectSummaryEntry | undefined;

  if (t.projectId) {
    const candidate = idx.byId.get(String(t.projectId).trim());
    if (candidate && isTaskBelongsToProject(t, candidate.project)) {
      matchedEntry = candidate;
    }
  }

  if (!matchedEntry && t.projectCode) {
    const codeParts = String(t.projectCode)
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = 0; i < codeParts.length && !matchedEntry; i++) {
      const candidates = idx.byCodePart.get(codeParts[i]);
      if (!candidates) continue;
      for (let j = 0; j < candidates.length; j++) {
        if (isTaskBelongsToProject(t, candidates[j].project)) {
          matchedEntry = candidates[j];
          break;
        }
      }
    }
  }

  if (!matchedEntry) return false;
  if (matchedEntry.isZeroTaskProject) return true;
  if (!matchedEntry.allSummariesHaveIds || matchedEntry.summaryIds.size === 0) return false;

  return !matchedEntry.summaryIds.has(String(t.id).trim().toLowerCase());
}

/**
 * Nạp tức thời Costs từ Dexie khi người dùng chuyển sang tab yêu cầu Chi phí (0ms UI)
 */
export async function hydrateCostsFromLocal(year?: string): Promise<number> {
  try {
    const store = useAppStore.getState();
    const targetYear = year || store.globalYearFilter;
    const localCosts = await getLocalCosts(targetYear);
    if (localCosts && localCosts.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.costs || [];
      const cMap = new Map<string, Cost>(existing.map((c) => [c.id, c]));
      let changed = false;
      localCosts.forEach((c) => {
        if (!c?.id) return;
        const cur = cMap.get(c.id);
        if (!cur) {
          cMap.set(c.id, c);
          changed = true;
        } else if (tsOf(c.updatedAt) > tsOf(cur.updatedAt)) {
          cMap.set(c.id, c);
          changed = true;
        }
      });
      if (changed) {
        currentStore.setCosts(Array.from(cMap.values()));
        usePerformanceStore
          .getState()
          .trackGetDoc(
            'dexie_costs_hydration',
            true,
            localCosts.length,
            'Instant Local-First Costs Hydration (0ms)'
          );
      }
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

    const localDelegations = await getLocalDelegations(targetYear);
    if (localDelegations && localDelegations.length > 0) {
      const currentStore = useAppStore.getState();
      const existing = currentStore.delegationGroups || [];
      const dMap = new Map(existing.map((d) => [d.id, d]));
      let changed = false;
      localDelegations.forEach((d) => {
        if (!d?.id) return;
        const cur = dMap.get(d.id);
        if (!cur) {
          dMap.set(d.id, d);
          changed = true;
        } else if (tsOf(d.updatedAt) > tsOf(cur.updatedAt)) {
          dMap.set(d.id, d);
          changed = true;
        }
      });
      if (changed) {
        currentStore.setDelegationGroups(Array.from(dMap.values()));
        usePerformanceStore
          .getState()
          .trackGetDoc(
            'dexie_delegations_hydration',
            true,
            localDelegations.length,
            `Instant Local-First Delegations Hydration for ${targetYear || 'all'} (0ms, 0 Read)`
          );
      }
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
    const normYear =
      year !== undefined && year !== null && String(year).toLowerCase() !== 'all'
        ? String(year).trim()
        : '';
    const normStore =
      storeFilter && String(storeFilter).toLowerCase() !== 'all'
        ? String(storeFilter).trim().toUpperCase()
        : '';

    const expandedKeys = new Set<string>();
    const targetProjects: Project[] = [];
    const codesCoveredByIdMatch = new Set<string>();

    projectIdsOrCodes.forEach((key) => {
      const trimmed = String(key).trim();
      if (!trimmed) return;
      const byId = currentProjects.find((p) => !p.isDeleted && String(p.id) === trimmed);
      if (byId) {
        if (!targetProjects.some((tp) => tp.id === byId.id)) targetProjects.push(byId);
        if (byId.code) {
          codesCoveredByIdMatch.add(String(byId.code).trim().toLowerCase());
          expandedKeys.add(String(byId.code).trim());
        }
        if (byId.id) expandedKeys.add(String(byId.id).trim());
      }
    });

    projectIdsOrCodes.forEach((key) => {
      const trimmed = String(key).trim();
      if (!trimmed) return;
      expandedKeys.add(trimmed);
      if (codesCoveredByIdMatch.has(trimmed.toLowerCase())) return;
      const matched =
        currentProjects.find((p) => !p.isDeleted && String(p.id) === trimmed) ||
        currentProjects.find((p) => {
          if (p.isDeleted) return false;
          if (
            String(p.code).trim().toLowerCase() !== trimmed.toLowerCase() &&
            String(p.no) !== trimmed
          ) {
            return false;
          }
          if (normYear && p.year && String(p.year).trim() !== normYear) return false;
          if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore)
            return false;
          return true;
        });
      if (matched) {
        if (!targetProjects.some((tp) => tp.id === matched.id)) targetProjects.push(matched);
        if (matched.code) expandedKeys.add(String(matched.code).trim());
        if (matched.id) expandedKeys.add(String(matched.id).trim());
      }
    });

    const localDelegations = await getLocalDelegationsForProjects(
      Array.from(expandedKeys),
      year,
      storeFilter
    );
    if (!localDelegations || localDelegations.length === 0) return 0;

    const existing = store.delegationGroups || [];
    const dMap = new Map(existing.map((d) => [d.id, d]));
    let hasNew = false;
    localDelegations.forEach((d) => {
      if (dMap.has(d.id)) return;
      if (
        targetProjects.length > 0 &&
        !targetProjects.some((p) => isDelegationGroupBelongsToProject(d, p))
      ) {
        return;
      }
      dMap.set(d.id, d);
      hasNew = true;
    });

    if (hasNew) {
      store.setDelegationGroups(Array.from(dMap.values()));
      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_delegations_by_project',
          true,
          localDelegations.length,
          `Instant Delegations Hydration for ${projectIdsOrCodes.length} projects (0ms)`
        );
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
    const dMap = new Map(existing.map((d) => [d.id, d]));
    let hasNew = false;
    localDelegations.forEach((d) => {
      if (!dMap.has(d.id)) {
        dMap.set(d.id, d);
        hasNew = true;
      }
    });

    if (hasNew) {
      store.setDelegationGroups(Array.from(dMap.values()));
      usePerformanceStore
        .getState()
        .trackGetDoc(
          'dexie_delegations_by_task',
          true,
          localDelegations.length,
          `Instant Delegations Hydration for ${taskIds.length} tasks (0ms)`
        );
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsForTasks error:', err);
    return 0;
  }
}
