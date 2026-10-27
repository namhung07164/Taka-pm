import {
  getLocalCosts,
  getLocalDelegations,
  getLocalDelegationsForProjects,
  getLocalDelegationsForTasks,
  getLocalTasks,
  deleteLocalRecord,
  bulkPersistProjects,
} from '../localDb';
import { useAppStore } from '../../store/useAppStore';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { Project, Task, Cost } from '../../types';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from '../utils';
import { isTaskDeletedInTracker, isProjectDeletedInTracker, markTasksDeleted } from '../taskDeletedTracker';
import { rollupTaskSummaries } from '../taskRollupHelpers';
import { deduplicateTasksInMemory } from '../taskDeduplicationService';
import { syncProjectDatesToFirestore } from '../projectDatesService';

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
  unmatchedSummaryNameStarts: Map<string, number>;
}

export interface ZombieProjectIndex {
  byId: Map<string, IndexedProjectSummaryEntry>;
  byCodePart: Map<string, IndexedProjectSummaryEntry[]>;
}

/**
 * Pre-indexes projects and their deduplicated taskSummaries ID Sets once in O(P).
 * Only summary entries whose ID is NOT already present in `candidateTasks` are added to `unmatchedSummaryNameStarts`,
 * preventing duplicate/zombie local tasks with old IDs from hiding behind already-matched task names.
 */
export function buildZombieProjectIndex(projects: Project[], candidateTasks?: Task[]): ZombieProjectIndex {
  const byId = new Map<string, IndexedProjectSummaryEntry>();
  const byCodePart = new Map<string, IndexedProjectSummaryEntry[]>();

  if (!Array.isArray(projects) || projects.length === 0) {
    return { byId, byCodePart };
  }

  const candidateIdsLower = new Set<string>();
  if (Array.isArray(candidateTasks)) {
    for (let i = 0; i < candidateTasks.length; i++) {
      const tid = candidateTasks[i]?.id;
      if (tid) candidateIdsLower.add(String(tid).trim().toLowerCase());
    }
  }

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || p.isDeleted || isProjectDeletedInTracker(p.id)) continue;

    const rawSummaries = Array.isArray(p.taskSummaries) ? p.taskSummaries : null;
    const summaries = rawSummaries && rawSummaries.length > 0 ? rollupTaskSummaries(rawSummaries) : rawSummaries;
    const isZeroTaskProject = Boolean(
      summaries && summaries.length === 0 && (p.taskCount ?? 0) === 0
    );
    const allSummariesHaveIds = Boolean(
      summaries &&
        summaries.length > 0 &&
        summaries.every((s: any) => Boolean(s?.id && !String(s.id).startsWith('ts_')))
    );
    const summaryIds = new Set<string>();
    const unmatchedSummaryNameStarts = new Map<string, number>();
    if (summaries) {
      for (let j = 0; j < summaries.length; j++) {
        const sId = String(summaries[j]?.id || '').trim().toLowerCase();
        if (sId) summaryIds.add(sId);
        if (!sId || !candidateIdsLower.has(sId)) {
          const sName = String(summaries[j]?.name || '').trim().toLowerCase();
          const sStart = String(summaries[j]?.start || '').trim();
          if (sName) {
            const key = `${sName}|${sStart}`;
            unmatchedSummaryNameStarts.set(key, (unmatchedSummaryNameStarts.get(key) || 0) + 1);
          }
        }
      }
    }

    const entry: IndexedProjectSummaryEntry = {
      project: p,
      allSummariesHaveIds,
      isZeroTaskProject,
      summaryIds,
      unmatchedSummaryNameStarts,
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
  if (updatedMs > 0 && Date.now() - updatedMs <= 60000) return false;

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
  return false;
}

/**
 * Background Self-Healing Pass: normalizes local project taskSummaries and deduplicates local tasks
 * in Zustand + Dexie without overwriting Firestore `taka_projects` from stale/partial local state.
 */
export async function reconcileAndDeduplicateLocalStore(): Promise<void> {
  try {
    const store = useAppStore.getState();
    const currentProjects = store.projects || [];
    if (currentProjects.length === 0) return;

    let projectsChanged = false;
    const healedProjectsToPersist: Project[] = [];
    const normalizedProjects = currentProjects.map((p) => {
      if (!p || p.isDeleted || !Array.isArray(p.taskSummaries) || p.taskSummaries.length <= 1) return p;
      const rolled = rollupTaskSummaries(p.taskSummaries);
      if (rolled.length < p.taskSummaries.length || p.taskCount !== rolled.length) {
        projectsChanged = true;
        const nextP: Project = { ...p, taskSummaries: rolled, taskCount: rolled.length };
        healedProjectsToPersist.push(nextP);
        return nextP;
      }
      return p;
    });

    if (projectsChanged) {
      store.setProjects(normalizedProjects);
      if (healedProjectsToPersist.length > 0) {
        bulkPersistProjects(healedProjectsToPersist).catch(() => {});
      }
    }

    const dexieTasks = await getLocalTasks(store.globalYearFilter).catch(() => [] as Task[]);
    const ramTasks = useAppStore.getState().tasks || [];
    if (dexieTasks.length === 0 && ramTasks.length === 0) return;

    const combinedMap = new Map<string, Task>();
    dexieTasks.forEach((t) => { if (t?.id) combinedMap.set(t.id, t); });
    ramTasks.forEach((t) => { if (t?.id) combinedMap.set(t.id, t); });
    const allCandidateTasks = Array.from(combinedMap.values());

    const activeProjects = useAppStore.getState().projects || normalizedProjects;
    const zombieIndex = buildZombieProjectIndex(activeProjects, allCandidateTasks);
    const idsToPurge = new Set<string>();
    const nonZombieTasks: Task[] = [];

    for (let i = 0; i < allCandidateTasks.length; i++) {
      const t = allCandidateTasks[i];
      if (isZombieTaskAgainstProjects(t, activeProjects, zombieIndex)) {
        if (t?.id) idsToPurge.add(t.id);
      } else {
        nonZombieTasks.push(t);
      }
    }

    const { dedupedTasks, removedTaskIds } = deduplicateTasksInMemory(nonZombieTasks, activeProjects);
    removedTaskIds.forEach((id) => idsToPurge.add(id));

    if (idsToPurge.size > 0) {
      idsToPurge.forEach((id) => {
        deleteLocalRecord('taka_tasks', id).catch(() => {});
      });
      if (ramTasks.length > 0 || useAppStore.getState().isTasksRequested) {
        useAppStore.getState().setTasks(dedupedTasks);
      }
    }
  } catch (err) {
    console.warn('[localHydrationHelpers] reconcileAndDeduplicateLocalStore error:', err);
  }
}

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
        if (!cur || tsOf(c.updatedAt) > tsOf(cur.updatedAt)) {
          cMap.set(c.id, c);
          changed = true;
        }
      });
      if (changed) {
        currentStore.setCosts(Array.from(cMap.values()));
        usePerformanceStore.getState().trackGetDoc('dexie_costs_hydration', true, localCosts.length, 'Instant Local-First Costs Hydration (0ms)');
      }
      return localCosts.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateCostsFromLocal error:', err);
    return 0;
  }
}

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
        if (!cur || tsOf(d.updatedAt) > tsOf(cur.updatedAt)) {
          dMap.set(d.id, d);
          changed = true;
        }
      });
      if (changed) {
        currentStore.setDelegationGroups(Array.from(dMap.values()));
        usePerformanceStore.getState().trackGetDoc('dexie_delegations_hydration', true, localDelegations.length, `Instant Local-First Delegations Hydration for ${targetYear || 'all'} (0ms, 0 Read)`);
      }
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsFromLocal error:', err);
    return 0;
  }
}

export async function hydrateDelegationsForProjects(
  projectIdsOrCodes: string[],
  year?: string | number | null,
  storeFilter?: string | null
): Promise<number> {
  if (!projectIdsOrCodes || projectIdsOrCodes.length === 0) return 0;
  try {
    const store = useAppStore.getState();
    const currentProjects = store.projects || [];
    const normYear = year !== undefined && year !== null && String(year).toLowerCase() !== 'all' ? String(year).trim() : '';
    const normStore = storeFilter && String(storeFilter).toLowerCase() !== 'all' ? String(storeFilter).trim().toUpperCase() : '';
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
          if (String(p.code).trim().toLowerCase() !== trimmed.toLowerCase() && String(p.no) !== trimmed) return false;
          if (normYear && p.year && String(p.year).trim() !== normYear) return false;
          if (normStore && p.store && String(p.store).trim().toUpperCase() !== normStore) return false;
          return true;
        });
      if (matched) {
        if (!targetProjects.some((tp) => tp.id === matched.id)) targetProjects.push(matched);
        if (matched.code) expandedKeys.add(String(matched.code).trim());
        if (matched.id) expandedKeys.add(String(matched.id).trim());
      }
    });

    const localDelegations = await getLocalDelegationsForProjects(Array.from(expandedKeys), year, storeFilter);
    if (!localDelegations || localDelegations.length === 0) return 0;

    const existing = store.delegationGroups || [];
    const dMap = new Map(existing.map((d) => [d.id, d]));
    let hasNew = false;
    localDelegations.forEach((d) => {
      if (dMap.has(d.id)) return;
      if (targetProjects.length > 0 && !targetProjects.some((p) => isDelegationGroupBelongsToProject(d, p))) return;
      dMap.set(d.id, d);
      hasNew = true;
    });

    if (hasNew) {
      store.setDelegationGroups(Array.from(dMap.values()));
      usePerformanceStore.getState().trackGetDoc('dexie_delegations_by_project', true, localDelegations.length, `Instant Delegations Hydration for ${projectIdsOrCodes.length} projects (0ms)`);
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsForProjects error:', err);
    return 0;
  }
}

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
      usePerformanceStore.getState().trackGetDoc('dexie_delegations_by_task', true, localDelegations.length, `Instant Delegations Hydration for ${taskIds.length} tasks (0ms)`);
      return localDelegations.length;
    }
    return 0;
  } catch (err) {
    console.warn('[backgroundSyncWorker] hydrateDelegationsForTasks error:', err);
    return 0;
  }
}
