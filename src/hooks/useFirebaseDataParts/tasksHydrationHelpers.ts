import { Task, Project, DelegationGroup } from "../../types";
import { isTaskBelongsToProject, matchProjectCode } from "../../lib/utils";
import {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
} from "../../lib/projectDatesService";

export const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.toMillis === "function") {
    const n = v.toMillis();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof v?.seconds === "number") {
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

  const idSet = new Set(activeProjectIds.map(id => String(id)));

  (projects || []).forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    const matchesById = pId && idSet.has(pId);
    const matchesByCode = pCode && idSet.has(pCode) && (
      !globalYearFilter ||
      globalYearFilter === 'all' ||
      !p.year ||
      String(p.year).trim() === String(globalYearFilter).trim()
    );
    if (matchesById || matchesByCode) {
      if (pCode) keys.add(pCode);
      if (p.linkCodes) {
        p.linkCodes.split(/[,;/]+/).forEach(c => {
          const trimmed = c.trim();
          if (trimmed) keys.add(trimmed);
        });
      }
    }
  });

  // Also include raw IDs if no project matched
  activeProjectIds.forEach(id => keys.add(String(id)));

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

  const activeIdSet = new Set(activeProjectIds.map(id => String(id)));

  projects.forEach((p) => {
    if (!p) return;
    const pId = String(p.id || '');
    const pCode = String(p.code || '').trim();
    const matchesById = pId && activeIdSet.has(pId);
    const matchesByCode = pCode && activeIdSet.has(pCode) && (
      !globalYearFilter ||
      globalYearFilter === 'all' ||
      !p.year ||
      String(p.year).trim() === String(globalYearFilter).trim()
    );

    if (matchesById || matchesByCode) {
      const year = p.year ? String(p.year).trim() : (globalYearFilter || '2026');
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
    if (dt && dt.projectId && p.id && String(dt.projectId).trim() !== String(p.id).trim()) return false;
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
      dy !== "" &&
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
  const isStoreRestricted = userRole !== "admin" && allowedLower.length > 0 && !allowedLower.includes("all");
  const zombieRemovals: any[] = [];

  currentTasks.forEach((t) => {
    if (
      t?.id &&
      !t.id.startsWith("ts_") &&
      String(t.projectYear ?? "").trim() === String(year).trim() &&
      !serverIds.has(t.id)
    ) {
      if (isStoreRestricted && t.projectStore && !allowedLower.includes(String(t.projectStore).trim().toLowerCase())) {
        return;
      }
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({
          type: "removed",
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
  const serverIds = new Set<string>();
  const serverIdsLower = new Set<string>();
  snapshotDocs.forEach((d) => {
    serverIds.add(d.id);
    serverIdsLower.add(String(d.id).trim().toLowerCase());
  });
  const nowMs = Date.now();
  const zombieRemovals: any[] = [];
  const addedRemovalIdsLower = new Set<string>();
  const localByIdLower = new Map<string, Task>();

  currentTasks.forEach((t) => {
    if (t?.id) localByIdLower.set(String(t.id).trim().toLowerCase(), t);
    if (t?.id && !t.id.startsWith("ts_") && doesTaskBelongToProject(t, p) && !serverIds.has(t.id)) {
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        addedRemovalIdsLower.add(String(t.id).trim().toLowerCase());
        zombieRemovals.push({
          type: "removed",
          doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) },
        });
      }
    }
  });

  if (Array.isArray(p.taskSummaries)) {
    p.taskSummaries.forEach((s: any) => {
      const sId = s?.id ? String(s.id).trim() : "";
      if (!sId || sId.startsWith("ts_")) return;
      const sIdLower = sId.toLowerCase();
      if (!serverIdsLower.has(sIdLower) && !addedRemovalIdsLower.has(sIdLower)) {
        const localT = localByIdLower.get(sIdLower);
        const updatedMs = localT ? tsOf(localT.updatedAt) : 0;
        if (!updatedMs || nowMs - updatedMs > 30000) {
          addedRemovalIdsLower.add(sIdLower);
          zombieRemovals.push({
            type: "removed",
            doc: {
              id: sId,
              data: () => ({
                ...(localT || {}),
                id: sId,
                projectId: p.id,
                projectCode: p.code,
                projectYear: p.year,
                projectStore: p.store,
                isDeleted: true,
              }),
            },
          });
        }
      }
    });
  }

  return zombieRemovals;
}

/**
 * Reconciles and heals project summaries and taskCount after a batch of task changes/removals.
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
    !fromCache && (getAppBootAgeMs() >= BOOT_SYNC_GUARD_MS || knownHydratedProjectCodes.size > 0 || tasksPool.size > 0);

  const healedProjects = currentProjects.map((p) => {
    let workingProj = p;
    let summaryRemoved = false;

    // 1. Immediately purge any explicitly removed task IDs from p.taskSummaries (Rule 16)
    if (removedIdsLower.size > 0 && Array.isArray(workingProj.taskSummaries) && workingProj.taskSummaries.length > 0) {
      const filteredSummaries = workingProj.taskSummaries.filter((s: any) => {
        const sId = s?.id ? String(s.id).trim().toLowerCase() : "";
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

    const rawCodeCombined = workingProj.linkCodes ? `${workingProj.code || ''}, ${workingProj.linkCodes}` : String(workingProj.code || '');
    const pCodeParts = rawCodeCombined.toLowerCase().split(/[,;/]+/).map((s: string) => s.trim()).filter(Boolean);
    const isProjectTouched =
      summaryRemoved ||
      isFullyHydratedProject ||
      touchedIds.has(String(workingProj.id)) ||
      pCodeParts.some((c) => touchedCodes.has(c));

    if (!isProjectTouched) return workingProj;
    if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS && !isFullyHydratedProject) return workingProj;

    const pTasks = finalTasks.filter((t) => !t.isDeleted && isTaskBelongsToProject(t, workingProj));

    if (!isFullyHydratedProject) {
      const existingMaxCount = Math.max(workingProj.taskCount || 0, Array.isArray(workingProj.taskSummaries) ? workingProj.taskSummaries.length : 0);
      if (pTasks.length === 0 || pTasks.length < existingMaxCount) return workingProj;
    }

    const baseProjForCalc = isFullyHydratedProject && pTasks.length === 0
      ? { ...workingProj, taskSummaries: [], taskCount: 0 }
      : workingProj;

    const computed = calculateProjectComputedDates(baseProjForCalc, pTasks, delegationGroups);
    const existingSig = (workingProj.taskSummaries || [])
      .map((s: any) => `${s.id || ''}:${s.name || ''}:${s.start || ''}:${s.finish || ''}:${s.parentTaskId || ''}`)
      .join('|');
    const computedSig = (computed.taskSummaries || [])
      .map((s: any) => `${s.id || ''}:${s.name || ''}:${s.start || ''}:${s.finish || ''}:${s.parentTaskId || ''}`)
      .join('|');
    const hasDiscrepancy =
      workingProj.taskCount !== computed.taskCount ||
      !workingProj.taskSummaries ||
      workingProj.taskSummaries.length !== (computed.taskSummaries?.length || 0) ||
      existingSig !== computedSig ||
      (workingProj.computedTakStart || '') !== (computed.computedTakStart || '') ||
      (workingProj.computedTakCompl || '') !== (computed.computedTakCompl || '') ||
      (workingProj.computedPlanProgress ?? 0) !== (computed.computedPlanProgress ?? 0) ||
      (workingProj.computedActProgress ?? 0) !== (computed.computedActProgress ?? 0);

    if (!hasDiscrepancy) return workingProj;

    projectsNeedUpdate = true;
    syncProjectDatesToFirestore(workingProj.id, computed).catch(() => {});

    return {
      ...workingProj,
      ...computed,
    };
  });

  return projectsNeedUpdate ? healedProjects : null;
}
