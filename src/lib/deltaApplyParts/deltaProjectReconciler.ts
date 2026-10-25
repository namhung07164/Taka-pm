import { Project, Task, DelegationGroup } from '../../types';
import { localDb } from '../localDb';
import { getTasksForProject, calculateProjectComputedDates } from '../projectDatesService';
import { rollupTaskSummaries } from '../taskRollupHelpers';
import { markTasksDeleted } from '../taskDeletedTracker';
import { runBackgroundDexieProjectTaskReconciliation } from '../../hooks/useFirebaseDataParts/projectsHydrationHelpers';

export {
  purgeProjectAndTasksOnDeleteDelta,
  unlinkChildTasksOnTaskDeleteDelta,
  removeDeletedTaskSummaryFromProjects,
} from './deltaDeleteReconciler';

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

export interface DeltaProjectsIndex {
  byId: Map<string, number>;
  byCodePart: Map<string, number[]>;
}

/**
 * Pre-indexes projects array by ID and lowercase code parts in O(P) for O(1) lookup during delta application.
 */
export function buildDeltaProjectsIndex(projects: Project[]): DeltaProjectsIndex {
  const byId = new Map<string, number>();
  const byCodePart = new Map<string, number[]>;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p) continue;
    if (p.id) {
      byId.set(String(p.id), i);
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
      list.push(i);
    }
  }

  return { byId, byCodePart };
}

/**
 * Reconciles local in-memory tasks against authoritative incoming `project.taskSummaries` on project delta.
 */
export function reconcileTasksAgainstIncomingProjectSummaries(
  nextProj: Project,
  rawTaskSummaries: any[],
  updatedTasks: Task[]
): { nextTasks: Task[]; tasksChanged: boolean } {
  const hasReliableIds =
    rawTaskSummaries.length === 0 || rawTaskSummaries.every((s: any) => Boolean(s?.id));
  if (!hasReliableIds) {
    return { nextTasks: updatedTasks, tasksChanged: false };
  }

  // Always reconcile Dexie localDb.tasks in background (crucial when iOS is on GeneralTab with updatedTasks = [])
  runBackgroundDexieProjectTaskReconciliation([nextProj]);

  const summaryByIdLower = new Map<string, any>();
  rawTaskSummaries.forEach((s: any) => {
    if (s?.id) summaryByIdLower.set(String(s.id).trim().toLowerCase(), s);
  });
  const validIdsLower = new Set(summaryByIdLower.keys());
  const nowMs = Date.now();
  const pIdStr = String(nextProj.id);
  const pCodeLower = String(nextProj.code || '').trim().toLowerCase();
  const pStoreLower = String(nextProj.store || '').trim().toLowerCase();
  const pYearStr =
    nextProj.year !== undefined && nextProj.year !== null ? String(nextProj.year).trim() : '';
  const rawCodes = (nextProj as any).linkCodes
    ? `${nextProj.code || ''}, ${(nextProj as any).linkCodes}`
    : String(nextProj.code || '');
  const pCodeParts = rawCodes
    .toLowerCase()
    .split(/[,;/]+/)
    .map((s: string) => s.trim())
    .filter(Boolean);

  const zombieIds: string[] = [];
  const patchedTasksForDexie: Task[] = [];
  let anyTaskPatched = false;

  const nextTasks: Task[] = [];
  for (let i = 0; i < updatedTasks.length; i++) {
    const t = updatedTasks[i];
    if (!t || !t.id || t.id.startsWith('ts_')) {
      nextTasks.push(t);
      continue;
    }
    const matchesProj =
      (t.projectId && String(t.projectId) === pIdStr) ||
      (!t.projectId &&
        t.projectCode &&
        (String(t.projectCode).trim().toLowerCase() === pCodeLower ||
          pCodeParts.includes(String(t.projectCode).trim().toLowerCase())) &&
        (!pStoreLower ||
          !t.projectStore ||
          String(t.projectStore).trim().toLowerCase() === pStoreLower) &&
        (!pYearStr || !t.projectYear || String(t.projectYear).trim() === pYearStr));
    if (!matchesProj) {
      nextTasks.push(t);
      continue;
    }
    const tIdLower = String(t.id).trim().toLowerCase();
    const updatedMs = tsOf(t.updatedAt);
    const projUpdatedMs = tsOf(nextProj.updatedAt);
    const isNewerThanProj = Boolean(updatedMs > 0 && projUpdatedMs > 0 && updatedMs > projUpdatedMs);
    const isRecentLocal = Boolean((updatedMs && nowMs - updatedMs <= 60000) || isNewerThanProj);

    if (validIdsLower.has(tIdLower)) {
      const s = summaryByIdLower.get(tIdLower);
      if (s && !isRecentLocal) {
        const tParent = t.parentTaskId || undefined;
        const tParentLower = tParent ? String(tParent).trim().toLowerCase() : '';
        const isModernSummary =
          s.orderIndex !== undefined ||
          s.runningStatus !== undefined ||
          s.isModularParent !== undefined ||
          'parentTaskId' in s;
        const sParent =
          s.parentTaskId !== undefined && s.parentTaskId !== null && String(s.parentTaskId).trim() !== ''
            ? s.parentTaskId
            : isModernSummary
              ? undefined
              : tParentLower && validIdsLower.has(tParentLower)
                ? tParent
                : undefined;
        const summaryDiffers =
          (s.name !== undefined && s.name !== t.name) ||
          (s.start !== undefined && s.start !== t.start) ||
          (s.finish !== undefined && s.finish !== t.finish) ||
          (s.runningStatus !== undefined && s.runningStatus !== t.runningStatus) ||
          (s.approval !== undefined && s.approval !== t.approval) ||
          (s.party !== undefined && s.party !== t.party) ||
          (s.duration !== undefined && s.duration !== t.duration) ||
          (s.isModularParent !== undefined && Boolean(s.isModularParent) !== Boolean(t.isModularParent)) ||
          (s.predecessor !== undefined && s.predecessor !== t.predecessor) ||
          sParent !== tParent;
        if (summaryDiffers) {
          const patched: Task = {
            ...t,
            ...(s.name !== undefined ? { name: s.name } : {}),
            ...(s.start !== undefined ? { start: s.start } : {}),
            ...(s.finish !== undefined ? { finish: s.finish } : {}),
            ...(s.runningStatus !== undefined ? { runningStatus: s.runningStatus } : {}),
            ...(s.approval !== undefined ? { approval: s.approval } : {}),
            ...(s.party !== undefined ? { party: s.party } : {}),
            ...(s.duration !== undefined ? { duration: s.duration } : {}),
            ...(s.orderIndex !== undefined ? { orderIndex: s.orderIndex } : {}),
            ...(s.isModularParent !== undefined ? { isModularParent: Boolean(s.isModularParent) } : {}),
            ...(s.predecessor !== undefined ? { predecessor: s.predecessor } : {}),
            ...(s.predecessorTaskIds !== undefined ? { predecessorTaskIds: s.predecessorTaskIds } : {}),
            parentTaskId: sParent,
          };
          if (!sParent) delete (patched as any).parentId;
          anyTaskPatched = true;
          patchedTasksForDexie.push(patched);
          nextTasks.push(patched);
          continue;
        }
      }
      nextTasks.push(t);
      continue;
    }

    if (isRecentLocal || rawTaskSummaries.length > 0) {
      nextTasks.push(t);
      continue;
    }
    zombieIds.push(t.id);
  }

  if (patchedTasksForDexie.length > 0) {
    localDb.tasks.bulkPut(patchedTasksForDexie).catch(() => {});
  }

  if (zombieIds.length > 0) {
    markTasksDeleted(zombieIds, pIdStr);
    zombieIds.forEach((zId) => {
      localDb.tasks.delete(zId).catch(() => {});
    });
    return { nextTasks, tasksChanged: true };
  }

  return { nextTasks: anyTaskPatched ? nextTasks : updatedTasks, tasksChanged: anyTaskPatched };
}

/**
 * Upserts a task summary into matching projects using O(1) pre-built DeltaProjectsIndex,
 * with fallback scan by summary ID when a partial task patch lacks projectId/projectCode.
 */
export function upsertTaskSummaryIntoMatchingProjects(params: {
  docId: string;
  action: 'create' | 'update' | 'delete';
  mergedTask: Task;
  updatedProjects: Project[];
  projectsIndex: DeltaProjectsIndex;
  touchedProjectIds?: Set<string>;
}): boolean {
  const { docId, action, mergedTask, updatedProjects, projectsIndex, touchedProjectIds } = params;
  const docIdLower = String(docId).trim().toLowerCase();
  if (!docIdLower) return false;

  const tProjId = mergedTask.projectId ? String(mergedTask.projectId) : '';
  const tCodeLower = mergedTask.projectCode ? String(mergedTask.projectCode).trim().toLowerCase() : '';
  const tStoreLower = mergedTask.projectStore
    ? String(mergedTask.projectStore).trim().toLowerCase()
    : '';
  const tYearStr =
    mergedTask.projectYear !== undefined && mergedTask.projectYear !== null
      ? String(mergedTask.projectYear).trim()
      : '';

  const candidateIndices = new Set<number>();
  if (tProjId) {
    const idxById = projectsIndex.byId.get(tProjId);
    if (idxById !== undefined) candidateIndices.add(idxById);
  } else if (tCodeLower) {
    const idxsByCode = projectsIndex.byCodePart.get(tCodeLower);
    if (idxsByCode) {
      for (let i = 0; i < idxsByCode.length; i++) {
        candidateIndices.add(idxsByCode[i]);
      }
    }
  }

  // Fallback for partial task patches when store.tasks was empty on General tab: find project whose taskSummaries contains docId
  if (candidateIndices.size === 0) {
    for (let i = 0; i < updatedProjects.length; i++) {
      const p = updatedProjects[i];
      if (!p || !Array.isArray(p.taskSummaries)) continue;
      if (p.taskSummaries.some((s: any) => String(s?.id || '').trim().toLowerCase() === docIdLower)) {
        candidateIndices.add(i);
      }
    }
  }

  if (candidateIndices.size === 0) return false;

  let anyProjectChanged = false;
  const mCodeLower = String(mergedTask.taskCodePhu || '').trim().toLowerCase();
  const mNameLower = String(mergedTask.name || '').trim().toLowerCase();
  const mStartStr = String(mergedTask.start || '').trim();

  candidateIndices.forEach((pIdx) => {
    const p = updatedProjects[pIdx];
    if (!p) return;

    if (tProjId) {
      if (String(p.id) !== tProjId) return;
    } else if (tCodeLower) {
      if (tStoreLower && p.store && String(p.store).trim().toLowerCase() !== tStoreLower) return;
      if (tYearStr && p.year && String(p.year).trim() !== tYearStr) return;
    }

    const currentSummaries = Array.isArray(p.taskSummaries) ? [...p.taskSummaries] : [];
    const sIdx = currentSummaries.findIndex((s: any) => {
      const sId = String(s?.id || '').trim().toLowerCase();
      if (sId && !sId.startsWith('ts_')) return sId === docIdLower;
      const sCode = String(s?.taskCodePhu || '').trim().toLowerCase();
      if (sCode && mCodeLower && sCode === mCodeLower) return true;
      return (
        Boolean(mNameLower) &&
        String(s?.name || '').trim().toLowerCase() === mNameLower &&
        String(s?.start || '').trim() === mStartStr
      );
    });

    const existingSummary = sIdx !== -1 ? currentSummaries[sIdx] : null;
    const effName = mergedTask.name ?? existingSummary?.name;
    const effStart = mergedTask.start ?? existingSummary?.start;
    const effFinish = mergedTask.finish ?? existingSummary?.finish;

    if (!effName || !effStart || !effFinish) return;

    const summaryItem: any = {
      ...(existingSummary || {}),
      id: docId,
      name: effName,
      start: effStart,
      finish: effFinish,
      orderIndex:
        mergedTask.orderIndex ??
        (existingSummary ? existingSummary.orderIndex : currentSummaries.length),
      ...(mergedTask.baselineStart ? { baselineStart: mergedTask.baselineStart } : {}),
      ...(mergedTask.baselineFinish ? { baselineFinish: mergedTask.baselineFinish } : {}),
      ...(mergedTask.approval !== undefined ? { approval: mergedTask.approval } : {}),
      ...(mergedTask.party !== undefined ? { party: mergedTask.party } : {}),
      ...(mergedTask.taskCodePhu ? { taskCodePhu: mergedTask.taskCodePhu } : {}),
      ...(mergedTask.duration !== undefined ? { duration: mergedTask.duration } : {}),
      ...(mergedTask.runningStatus !== undefined ? { runningStatus: mergedTask.runningStatus } : {}),
      ...(mergedTask.delegation !== undefined ? { delegation: mergedTask.delegation } : {}),
      ...(mergedTask.isModularParent !== undefined ? { isModularParent: mergedTask.isModularParent } : {}),
      ...(mergedTask.predecessor !== undefined ? { predecessor: mergedTask.predecessor } : {}),
      ...(mergedTask.predecessorTaskIds !== undefined ? { predecessorTaskIds: mergedTask.predecessorTaskIds } : {}),
    };
    const explicitParentUnset =
      (mergedTask as any).parentTaskId === null ||
      ('parentTaskId' in mergedTask && !mergedTask.parentTaskId);
    const effectiveParentId = mergedTask.parentTaskId
      ? mergedTask.parentTaskId
      : explicitParentUnset
        ? undefined
        : existingSummary?.parentTaskId;
    if (effectiveParentId) {
      summaryItem.parentTaskId = effectiveParentId;
    } else {
      delete summaryItem.parentTaskId;
      delete summaryItem.parentId;
    }

    if (sIdx !== -1) {
      currentSummaries[sIdx] = summaryItem;
      const rolledSummaries = rollupTaskSummaries(currentSummaries);
      anyProjectChanged = true;
      if (p.id && touchedProjectIds) touchedProjectIds.add(String(p.id));
      updatedProjects[pIdx] = {
        ...p,
        taskSummaries: rolledSummaries,
        taskCount: rolledSummaries.length,
      };
    } else if (action === 'create' || action === 'update') {
      currentSummaries.push(summaryItem);
      const rolledSummaries = rollupTaskSummaries(currentSummaries);
      anyProjectChanged = true;
      if (p.id && touchedProjectIds) touchedProjectIds.add(String(p.id));
      updatedProjects[pIdx] = {
        ...p,
        taskSummaries: rolledSummaries,
        taskCount: rolledSummaries.length,
      };
    }
  });

  return anyProjectChanged;
}

/**
 * Recalculates computed dates & progress for touched projects after applying a batch of deltas.
 */
export function recalculateTouchedProjectsAfterDeltas(params: {
  updatedProjects: Project[];
  updatedTasks: Task[];
  delegationGroups: DelegationGroup[];
  touchedProjectIds: Set<string>;
  touchedProjectCodes: Set<string>;
}): { nextProjects: Project[]; touchedProjectsToPersist: Project[] } {
  const {
    updatedProjects,
    updatedTasks,
    delegationGroups,
    touchedProjectIds,
    touchedProjectCodes,
  } = params;

  const touchedProjectsToPersist: Project[] = [];
  const nextProjects = updatedProjects.map((p) => {
    const codeParts = `${p.code || ''},${(p as any).linkCodes || ''}`
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const pStoreLower = p.store ? String(p.store).trim().toLowerCase() : '*';
    const pYearStr = p.year !== undefined && p.year !== null ? String(p.year).trim() : '*';
    const isTouched =
      touchedProjectIds.has(String(p.id)) ||
      codeParts.some(
        (c) =>
          touchedProjectCodes.has(c) ||
          touchedProjectCodes.has(`${c}|${pStoreLower}|${pYearStr}`) ||
          touchedProjectCodes.has(`${c}|*|${pYearStr}`) ||
          touchedProjectCodes.has(`${c}|${pStoreLower}|*`) ||
          touchedProjectCodes.has(`${c}|*|*`)
      );

    if (!isTouched) return p;

    const realProjTasks = getTasksForProject(p, updatedTasks, { realTasksOnly: true });
    const existingSummaries = Array.isArray(p.taskSummaries) ? p.taskSummaries : [];

    let sourceTasksForCalc: Task[];
    if (realProjTasks.length > 0 && realProjTasks.length >= existingSummaries.length) {
      sourceTasksForCalc = realProjTasks;
    } else {
      const realIdSet = new Set(
        realProjTasks.map((t) => String(t.id || '').trim().toLowerCase()).filter(Boolean)
      );
      const realCodeSet = new Set(
        realProjTasks.map((t) => String(t.taskCodePhu || '').trim().toLowerCase()).filter(Boolean)
      );
      const summaryTasks = existingSummaries
        .filter((s: any) => {
          const sId = String(s?.id || '').trim().toLowerCase();
          const sCode = String(s?.taskCodePhu || '').trim().toLowerCase();
          if (sId && !sId.startsWith('ts_') && realIdSet.has(sId)) return false;
          if (sCode && realCodeSet.has(sCode)) return false;
          return true;
        })
        .map(
          (s: any, idx: number) =>
            ({
              id: s.id || `ts_${p.id}_${idx}`,
              projectId: p.id,
              projectCode: p.code,
              projectStore: p.store,
              projectYear: p.year,
              name: s.name,
              start: s.start,
              finish: s.finish,
              orderIndex: s.orderIndex ?? idx,
              baselineStart: s.baselineStart || s.start,
              baselineFinish: s.baselineFinish || s.finish,
              approval: s.approval,
              party: s.party,
              taskCodePhu: s.taskCodePhu,
              parentTaskId: s.parentTaskId,
              isModularParent: s.isModularParent,
              predecessor: s.predecessor,
              predecessorTaskIds: s.predecessorTaskIds,
              duration: s.duration ?? 0,
              runningStatus: s.runningStatus,
              delegation: s.delegation,
            }) as Task
        );
      sourceTasksForCalc = [...realProjTasks, ...summaryTasks];
    }

    const computedDates = calculateProjectComputedDates(p, sourceTasksForCalc, delegationGroups);
    const nextProj: Project = {
      ...p,
      ...computedDates,
      taskCount:
        computedDates.taskCount !== undefined ? computedDates.taskCount : existingSummaries.length,
      taskSummaries:
        computedDates.taskSummaries !== undefined ? computedDates.taskSummaries : existingSummaries,
    };
    touchedProjectsToPersist.push(nextProj);
    return nextProj;
  });

  return { nextProjects, touchedProjectsToPersist };
}
