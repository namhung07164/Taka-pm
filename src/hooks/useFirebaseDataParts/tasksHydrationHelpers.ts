import { doc } from 'firebase/firestore';
import { Task, Project, DelegationGroup } from '../../types';
import { db, APP_ID } from '../../lib/firebase';
import { writeBatch } from '../../lib/firestoreWrites';
import { isTaskBelongsToProject, matchProjectCode } from '../../lib/utils';
import { getAppBootAgeMs, BOOT_SYNC_GUARD_MS, calculateProjectComputedDates, syncProjectDatesToFirestore } from '../../lib/projectDatesService';
import { bulkPersistProjects } from '../../lib/localDb';

export { matchProjectCode };

/**
 * Permanently deletes duplicate task docs from Firestore when deduplicated during server snapshot hydration.
 */
export function purgeRemovedDuplicateTasksFromFirestore(removedIds: string[], fromCache: boolean): void {
  if (fromCache || !removedIds || removedIds.length === 0 || getAppBootAgeMs() < BOOT_SYNC_GUARD_MS) return;
  const realIds = removedIds.filter((id) => id && !String(id).startsWith('ts_'));
  if (realIds.length === 0) return;
  setTimeout(async () => {
    try {
      const batch = writeBatch(db);
      realIds.slice(0, 400).forEach((id) => {
        batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', String(id)));
      });
      await batch.commit();
    } catch {}
  }, 500);
}

export const tsOf = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'string') { const n = Date.parse(v); return Number.isFinite(n) ? n : 0; }
  if (typeof v?.toMillis === 'function') { const n = v.toMillis(); return Number.isFinite(n) ? n : 0; }
  if (typeof v?.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function isStaleCacheDoc(existingDoc: Task | undefined, newDoc: Task): boolean {
  if (!existingDoc) return false;
  const existingTime = tsOf(existingDoc.updatedAt);
  const newTime = tsOf(newDoc?.updatedAt);
  if (existingTime <= 0 || newTime <= 0) return false;
  return existingTime > newTime;
}

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
      const fallbackYear =
        globalYearFilter && String(globalYearFilter).toLowerCase() !== 'all'
          ? String(globalYearFilter).trim()
          : String(new Date().getFullYear());
      const year =
        p.year && String(p.year).toLowerCase() !== 'all'
          ? String(p.year).trim()
          : fallbackYear;
      const list = map.get(year) || [];
      list.push(p);
      map.set(year, list);
    }
  });
  return map;
}

export function doesTaskBelongToProject(t: Task, p: Project): boolean {
  return isTaskBelongsToProject(t, p);
}

export function filterCompatibleProjectChanges(docChanges: any[], p: Project): any[] {
  return docChanges.filter((ch) => {
    const dt: any = ch.doc.data();
    if (!dt) return false;
    const pIdStr = p.id ? String(p.id).trim() : '';
    const dtProjId = dt.projectId ? String(dt.projectId).trim() : '';
    if (dtProjId && pIdStr) return dtProjId === pIdStr;
    if (dt && dt.projectStore && p.store && String(dt.projectStore).trim().toLowerCase() !== String(p.store).trim().toLowerCase()) return false;
    const dy = dt?.projectYear;
    if (dy !== undefined && dy !== null && dy !== '' && p.year !== undefined && p.year !== null && String(dy).trim() !== String(p.year).trim()) return false;
    return true;
  });
}

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
  const isStoreRestricted = userRole !== 'admin' && allowedLower.length > 0 && !allowedLower.includes('all');
  const zombieRemovals: any[] = [];
  currentTasks.forEach((t) => {
    if (t?.id && !(t as any)._isVirtualSummary && String(t.projectYear ?? '').trim() === String(year).trim() && !serverIds.has(t.id)) {
      if (isStoreRestricted && t.projectStore && !allowedLower.includes(String(t.projectStore).trim().toLowerCase())) return;
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({ type: 'removed', doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) } });
      }
    }
  });
  return zombieRemovals;
}

export function buildZombieTaskRemovalsForProject(
  snapshotDocs: any[],
  currentTasks: Task[],
  p: Project
): any[] {
  const serverIds = new Set<string>();
  (snapshotDocs || []).forEach((d) => { if (d?.id) serverIds.add(d.id); });
  const nowMs = Date.now();
  const zombieRemovals: any[] = [];
  currentTasks.forEach((t) => {
    if (t?.id && !(t as any)._isVirtualSummary && doesTaskBelongToProject(t, p) && !serverIds.has(t.id)) {
      const updatedMs = tsOf(t.updatedAt);
      if (!updatedMs || nowMs - updatedMs > 30000) {
        zombieRemovals.push({ type: 'removed', doc: { id: t.id, data: () => ({ ...t, isDeleted: true }) } });
      }
    }
  });
  return zombieRemovals;
}

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
    if (t.projectId) {
      touchedIds.add(String(t.projectId));
    } else if (t.projectCode) {
      const cKey = String(t.projectCode).trim().toLowerCase();
      const sKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '*';
      const yKey = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '*';
      touchedCodes.add(`${cKey}|${sKey}|${yKey}`);
    }
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
        const parts = rawCode.split(/[,;/]+/).map((s) => s.trim()).filter(Boolean);
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

    const isAuthoritativelyHydrated = knownHydratedProjectCodes.has(String(workingProj.id));
    const isFullyHydratedProject =
      isAuthoritativelyHydrated ||
      tasksPool.has(`proj_${workingProj.id}`) ||
      tasksPool.has(`year_${workingProj.year}`);

    const rawCodeCombined = workingProj.linkCodes
      ? `${workingProj.code || ''}, ${workingProj.linkCodes}`
      : String(workingProj.code || '');
    const pCodeParts = rawCodeCombined.toLowerCase().split(/[,;/]+/).map((s: string) => s.trim()).filter(Boolean);
    const pStoreKey = workingProj.store ? String(workingProj.store).trim().toLowerCase() : '*';
    const pYearKey = workingProj.year !== undefined && workingProj.year !== null ? String(workingProj.year).trim() : '*';
    const isInitialHydrationPass = changedTasks.size === 0 && removedTasks.size === 0;
    const isProjectTouched =
      summaryRemoved ||
      (isInitialHydrationPass && isFullyHydratedProject) ||
      touchedIds.has(String(workingProj.id)) ||
      pCodeParts.some(
        (c) =>
          touchedCodes.has(`${c}|${pStoreKey}|${pYearKey}`) ||
          touchedCodes.has(`${c}|*|${pYearKey}`) ||
          touchedCodes.has(`${c}|${pStoreKey}|*`) ||
          touchedCodes.has(`${c}|*|*`)
      );

    if (!isProjectTouched) return workingProj;
    if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS && !isFullyHydratedProject) return workingProj;

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

    const existingMaxCount = Math.max(
      workingProj.taskCount || 0,
      Array.isArray(workingProj.taskSummaries) ? workingProj.taskSummaries.length : 0
    );
    if (!summaryRemoved && !isAuthoritativelyHydrated && (pTasks.length === 0 || pTasks.length < existingMaxCount)) {
      return workingProj;
    }
    if (!summaryRemoved && isAuthoritativelyHydrated && pTasks.length === 0 && existingMaxCount > 0) {
      return workingProj;
    }

    const baseProjForCalc =
      (isAuthoritativelyHydrated && pTasks.length > 0) || (summaryRemoved && pTasks.length === 0)
        ? { ...workingProj, taskSummaries: [], taskCount: pTasks.length }
        : workingProj;

    const computed = calculateProjectComputedDates(baseProjForCalc, pTasks, delegationGroups);
    const toSig = (list: any[]) =>
      (list || [])
        .map(
          (s: any, idx: number) =>
            `${s.id || ''}:${s.name || ''}:${s.start || ''}:${s.finish || ''}:${s.duration ?? ''}:${s.parentTaskId || ''}:${s.isModularParent ? '1' : '0'}:${s.taskCodePhu || ''}:${s.runningStatus || ''}:${s.approval || ''}:${s.party || ''}:${s.delegation ? '1' : ''}:${s.predecessor || ''}:${s.orderIndex ?? idx}`
        )
        .join('|');
    const existingSig = toSig(workingProj.taskSummaries || []);
    const computedSig = toSig(computed.taskSummaries || []);
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

    if (!hasStructuralChange && !hasProgressDiscrepancy) return workingProj;

    projectsNeedUpdate = true;
    const healedProj = { ...workingProj, ...computed };
    if (!fromCache && hasStructuralChange) {
      bulkPersistProjects([healedProj]).catch(() => {});
      if (isFullyHydratedProject && workingProj.id) {
        syncProjectDatesToFirestore(String(workingProj.id), computed).catch(() => {});
      }
    }
    return healedProj;
  });

  return projectsNeedUpdate ? healedProjects : null;
}
