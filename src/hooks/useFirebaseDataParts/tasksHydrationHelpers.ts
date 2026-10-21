import { Task, Project, DelegationGroup } from '../../types';
import { isTaskBelongsToProject, matchProjectCode } from '../../lib/utils';
import {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
} from '../../lib/projectDatesService';

export { matchProjectCode };

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

/**
 * Checks if incoming doc from Firestore/cache is staler than existing local doc in memory.
 */
export function isStaleCacheDoc(existingDoc: Task | undefined, newDoc: Task): boolean {
  if (!existingDoc) return false;
  const existingTime = tsOf(existingDoc.updatedAt);
  const newTime = tsOf(newDoc?.updatedAt);
  if (existingTime <= 0 || newTime <= 0) return false;
  return existingTime > newTime;
}

/**
 * Extracts set of project keys/codes to hydrate from active project IDs.
 */
export function extractKeysToHydrate(
  activeProjectIds: string[],
  projects: Project[],
  globalYearFilter?: string
): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(activeProjectIds) || activeProjectIds.length === 0) return keys;

  const idSet = new Set(activeProjectIds.map((id) => String(id)));

  (projects || []).forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    const matchesById = pId && idSet.has(pId);
    const matchesByCode =
      pCode &&
      idSet.has(pCode) &&
      (!globalYearFilter ||
        globalYearFilter === 'all' ||
        !p.year ||
        String(p.year).trim() === String(globalYearFilter).trim());
    if (matchesById || matchesByCode) {
      if (pCode) keys.add(pCode);
      if (p.linkCodes) {
        p.linkCodes.split(/[,;/]+/).forEach((c) => {
          const trimmed = c.trim();
          if (trimmed) keys.add(trimmed);
        });
      }
    }
  });

  activeProjectIds.forEach((id) => keys.add(String(id)));
  return keys;
}

/**
 * Groups active projects by year string.
 */
export function groupActiveProjectsByYear(
  activeProjectIds: string[],
  projects: Project[],
  globalYearFilter?: string
): Map<string, Project[]> {
  const map = new Map<string, Project[]>();
  if (!Array.isArray(projects)) return map;

  const activeIdSet = new Set(activeProjectIds.map((id) => String(id)));

  projects.forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    const matchesById = pId && activeIdSet.has(pId);
    const matchesByCode =
      pCode &&
      activeIdSet.has(pCode) &&
      (!globalYearFilter ||
        globalYearFilter === 'all' ||
        !p.year ||
        String(p.year).trim() === String(globalYearFilter).trim());

    if (matchesById || matchesByCode) {
      const year = p.year ? String(p.year).trim() : globalYearFilter || '2026';
      const list = map.get(year) || [];
      list.push(p);
      map.set(year, list);
    }
  });

  return map;
}

/**
 * Checks if a task belongs to a specific project by ID or (code + store + year).
 */
export function doesTaskBelongToProject(t: Task, p: Project): boolean {
  return isTaskBelongsToProject(t, p);
}

/**
 * Filters snapshot.docChanges() from a projectCode query so only tasks belonging to project `p` are applied.
 */
export function filterCompatibleProjectChanges(docChanges: any[], p: Project): any[] {
  return docChanges.filter((ch) => {
    const dt: any = ch.doc.data();
    if (!dt) return false;
    const pIdStr = p.id ? String(p.id).trim() : '';
    const dtProjId = dt.projectId ? String(dt.projectId).trim() : '';
    if (dtProjId && pIdStr) {
      return dtProjId === pIdStr;
    }
    if (
      dt &&
      dt.projectStore &&
      p.store &&
      String(dt.projectStore).trim().toLowerCase() !== String(p.store).trim().toLowerCase()
    ) {
      return false;
    }
    const dy = dt?.projectYear;
    if (
      dy !== undefined &&
      dy !== null &&
      dy !== '' &&
      p.year !== undefined &&
      p.year !== null &&
      String(dy).trim() !== String(p.year).trim()
    ) {
      return false;
    }
    return true;
  });
}

/**
 * Builds synthetic "removed" docChanges for any local task in `year` that no longer exists in a server snapshot.
 */
export function buildZombieTaskRemovalsForYear(
  snapshotDocs: any[],
  currentTasks: Task[],
  year: string | number,
  userRole: string | undefined,
  allowedStores: string[]
): any[] {
  const serverIds = new Set<string>();
  snapshotDocs.forEach((d) => serverIds.add(d.id));
  const nowMs = Date.now();
  const allowedLower = allowedStores.map((s) => s.toLowerCase());
  const isStoreRestricted =
    userRole !== 'admin' && allowedLower.length > 0 && !allowedLower.includes('all');
  const zombieRemovals: any[] = [];

  currentTasks.forEach((t) => {
    if (
      t?.id &&
      !(t as any)._isVirtualSummary &&
      String(t.projectYear ?? '').trim() === String(year).trim() &&
      !serverIds.has(t.id)
    ) {
      if (
        isStoreRestricted &&
        t.projectStore &&
        !allowedLower.includes(String(t.projectStore).trim().toLowerCase())
      ) {
        return;
      }
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: 'removed',
          doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) },
        });
      }
    }
  });

  return zombieRemovals;
}

/**
 * Builds synthetic "removed" docChanges for any local task of project `p` that no longer exists in a server snapshot.
 */
export function buildZombieTaskRemovalsForProject(
  snapshotDocs: any[],
  currentTasks: Task[],
  p: Project
): any[] {
  if (!snapshotDocs || snapshotDocs.length === 0) {
    return [];
  }
  const serverIds = new Set<string>();
  snapshotDocs.forEach((d) => {
    serverIds.add(d.id);
  });

  const summaryIdsLower = new Set<string>();
  if (Array.isArray(p.taskSummaries)) {
    p.taskSummaries.forEach((s: any) => {
      const sId = s?.id ? String(s.id).trim().toLowerCase() : '';
      if (sId) summaryIdsLower.add(sId);
    });
  }

  const nowMs = Date.now();
  const zombieRemovals: any[] = [];

  currentTasks.forEach((t) => {
    if (
      t?.id &&
      !(t as any)._isVirtualSummary &&
      doesTaskBelongToProject(t, p) &&
      !serverIds.has(t.id) &&
      !summaryIdsLower.has(String(t.id).trim().toLowerCase())
    ) {
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: 'removed',
          doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) },
        });
      }
    }
  });

  return zombieRemovals;
}

/**
 * Reconciles and heals project summaries and taskCount after a batch of task changes/removals.
 * Pre-groups finalTasks by projectId and projectCode in O(T) to eliminate O(P * T) filtering.
 */
export function healProjectsAfterTasksBatch(params: {
  currentProjects: Project[];
  finalTasks: Task[];
  delegationGroups: DelegationGroup[];
  changedTasks: Map<string, Task>;
  removedTasks: Map<string, Task>;
  fromCache: boolean;
  knownHydratedProjectCodes: Set<string>;
  tasksPool: Map<string, () => void>;
}): Project[] | null {
  const {
    currentProjects,
    finalTasks,
    delegationGroups,
    changedTasks,
    removedTasks,
    fromCache,
    knownHydratedProjectCodes,
    tasksPool,
  } = params;

  if (!currentProjects || currentProjects.length === 0) return null;

  const touchedIds = new Set<string>();
  const touchedCodes = new Set<string>();
  const removedIdsLower = new Set<string>();

  const noteTaskTouch = (t: Partial<Task> | undefined) => {
    if (!t) return;
    if (t.projectId) touchedIds.add(String(t.projectId));
    if (t.projectCode) touchedCodes.add(String(t.projectCode).trim().toLowerCase());
  };

  changedTasks.forEach((t) => noteTaskTouch(t));
  removedTasks.forEach((t, id) => {
    removedIdsLower.add(String(id).trim().toLowerCase());
    noteTaskTouch(t);
  });

  if (
    touchedIds.size === 0 &&
    touchedCodes.size === 0 &&
    removedIdsLower.size === 0 &&
    knownHydratedProjectCodes.size === 0 &&
    (fromCache || tasksPool.size === 0)
  ) {
    return null;
  }

  let projectsNeedUpdate = false;
  const canRunServerSelfHeal =
    !fromCache &&
    (getAppBootAgeMs() >= BOOT_SYNC_GUARD_MS ||
      knownHydratedProjectCodes.size > 0 ||
      tasksPool.size > 0);

  // Pre-index finalTasks by projectId and projectCode parts in O(T)
  const tasksByProjectId = new Map<string, Task[]>();
  const tasksByCodePart = new Map<string, Task[]>();
  if (canRunServerSelfHeal && Array.isArray(finalTasks)) {
    for (let i = 0; i < finalTasks.length; i++) {
      const t = finalTasks[i];
      if (!t || t.isDeleted) continue;
      if (t.projectId) {
        const pid = String(t.projectId).trim();
        let list = tasksByProjectId.get(pid);
        if (!list) {
          list = [];
          tasksByProjectId.set(pid, list);
        }
        list.push(t);
      }
      if (t.projectCode) {
        const rawCode = String(t.projectCode).trim().toLowerCase();
        const parts = rawCode
          .split(/[,;/]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const codes = parts.length > 0 ? parts : [rawCode];
        for (let j = 0; j < codes.length; j++) {
          const c = codes[j];
          let list = tasksByCodePart.get(c);
          if (!list) {
            list = [];
            tasksByCodePart.set(c, list);
          }
          list.push(t);
        }
      }
    }
  }

  const healedProjects = currentProjects.map((p) => {
    let workingProj = p;
    let summaryRemoved = false;

    if (
      removedIdsLower.size > 0 &&
      Array.isArray(workingProj.taskSummaries) &&
      workingProj.taskSummaries.length > 0
    ) {
      const filteredSummaries = workingProj.taskSummaries.filter((s: any) => {
        const sId = s?.id ? String(s.id).trim().toLowerCase() : '';
        return !sId || !removedIdsLower.has(sId);
      });
      if (filteredSummaries.length !== workingProj.taskSummaries.length) {
        summaryRemoved = true;
        projectsNeedUpdate = true;
        workingProj = {
          ...workingProj,
          taskSummaries: filteredSummaries,
          taskCount: filteredSummaries.length,
        };
      }
    }

    if (!canRunServerSelfHeal) return workingProj;

    const isFullyHydratedProject =
      knownHydratedProjectCodes.has(String(workingProj.id)) ||
      tasksPool.has(`proj_${workingProj.id}`) ||
      tasksPool.has(`year_${workingProj.year}`);

    const rawCodeCombined = workingProj.linkCodes
      ? `${workingProj.code || ''}, ${workingProj.linkCodes}`
      : String(workingProj.code || '');
    const pCodeParts = rawCodeCombined
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s: string) => s.trim())
      .filter(Boolean);
    const isProjectTouched =
      summaryRemoved ||
      isFullyHydratedProject ||
      touchedIds.has(String(workingProj.id)) ||
      pCodeParts.some((c) => touchedCodes.has(c));

    if (!isProjectTouched) return workingProj;
    if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS && !isFullyHydratedProject) return workingProj;

    // O(K) lookup of project tasks via pre-built index
    const pTasks: Task[] = [];
    const seenIds = new Set<string>();
    const pIdStr = workingProj.id ? String(workingProj.id).trim() : '';
    if (pIdStr) {
      const byIdList = tasksByProjectId.get(pIdStr);
      if (byIdList) {
        for (let i = 0; i < byIdList.length; i++) {
          const t = byIdList[i];
          if (isTaskBelongsToProject(t, workingProj)) {
            if (t.id) seenIds.add(String(t.id));
            pTasks.push(t);
          }
        }
      }
    }
    for (let i = 0; i < pCodeParts.length; i++) {
      const byCodeList = tasksByCodePart.get(pCodeParts[i]);
      if (!byCodeList) continue;
      for (let j = 0; j < byCodeList.length; j++) {
        const t = byCodeList[j];
        const tid = t.id ? String(t.id) : '';
        if (tid && seenIds.has(tid)) continue;
        if (isTaskBelongsToProject(t, workingProj)) {
          if (tid) seenIds.add(tid);
          pTasks.push(t);
        }
      }
    }

    if (!isFullyHydratedProject) {
      const existingMaxCount = Math.max(
        workingProj.taskCount || 0,
        Array.isArray(workingProj.taskSummaries) ? workingProj.taskSummaries.length : 0
      );
      if (pTasks.length === 0 || pTasks.length < existingMaxCount) return workingProj;
    }

    const baseProjForCalc =
      isFullyHydratedProject && pTasks.length === 0 && removedIdsLower.size > 0
        ? { ...workingProj, taskSummaries: [], taskCount: 0 }
        : workingProj;

    const computed = calculateProjectComputedDates(baseProjForCalc, pTasks, delegationGroups);
    const existingSig = (workingProj.taskSummaries || [])
      .map(
        (s: any) =>
          `${s.id || ''}:${s.name || ''}:${s.start || ''}:${s.finish || ''}:${s.parentTaskId || ''}`
      )
      .join('|');
    const computedSig = (computed.taskSummaries || [])
      .map(
        (s: any) =>
          `${s.id || ''}:${s.name || ''}:${s.start || ''}:${s.finish || ''}:${s.parentTaskId || ''}`
      )
      .join('|');
    const hasStructuralChange =
      workingProj.taskCount !== computed.taskCount ||
      !workingProj.taskSummaries ||
      workingProj.taskSummaries.length !== (computed.taskSummaries?.length || 0) ||
      existingSig !== computedSig ||
      (workingProj.computedTakStart || '') !== (computed.computedTakStart || '') ||
      (workingProj.computedTakCompl || '') !== (computed.computedTakCompl || '');

    const hasProgressDiscrepancy =
      (workingProj.computedPlanProgress ?? 0) !== (computed.computedPlanProgress ?? 0) ||
      (workingProj.computedActProgress ?? 0) !== (computed.computedActProgress ?? 0);

    const hasDiscrepancy = hasStructuralChange || hasProgressDiscrepancy;

    if (!hasDiscrepancy) return workingProj;

    projectsNeedUpdate = true;

    // RULE: Only sync project dates back to Firestore when there are ACTUAL task mutations,
    // NEVER from passive viewing, daily progress ticks, or Tri-Gate delegation mismatches!
    const hasActualMutations = !fromCache && (changedTasks.size > 0 || removedTasks.size > 0);
    if (hasActualMutations && hasStructuralChange) {
      syncProjectDatesToFirestore(workingProj.id, computed).catch(() => {});
    }

    return {
      ...workingProj,
      ...computed,
    };
  });

  return projectsNeedUpdate ? healedProjects : null;
}
