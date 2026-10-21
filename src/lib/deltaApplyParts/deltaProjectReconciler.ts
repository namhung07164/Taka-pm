import { Project, Task, DelegationGroup } from '../../types';
import { localDb } from '../localDb';
import { getTasksForProject, calculateProjectComputedDates } from '../projectDatesService';
import { markTasksDeleted } from '../taskDeletedTracker';

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
  const byCodePart = new Map<string, number[]>();

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

  const validIdsLower = new Set(
    rawTaskSummaries.map((s: any) => String(s.id).trim().toLowerCase())
  );
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
  const nextTasks = updatedTasks.filter((t) => {
    if (!t || !t.id || t.id.startsWith('ts_')) return true;
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
    if (!matchesProj) return true;
    if (validIdsLower.has(String(t.id).trim().toLowerCase())) return true;
    const updatedMs = tsOf(t.updatedAt);
    if (updatedMs && nowMs - updatedMs <= 30000) return true;
    zombieIds.push(t.id);
    return false;
  });

  if (zombieIds.length > 0) {
    markTasksDeleted(zombieIds, pIdStr);
    zombieIds.forEach((zId) => {
      localDb.tasks.delete(zId).catch(() => {});
    });
    return { nextTasks, tasksChanged: true };
  }

  return { nextTasks: updatedTasks, tasksChanged: false };
}

/**
 * Upserts a task summary into matching projects using O(1) pre-built DeltaProjectsIndex.
 */
export function upsertTaskSummaryIntoMatchingProjects(params: {
  docId: string;
  action: 'create' | 'update' | 'delete';
  mergedTask: Task;
  updatedProjects: Project[];
  projectsIndex: DeltaProjectsIndex;
}): boolean {
  const { docId, action, mergedTask, updatedProjects, projectsIndex } = params;
  if (!mergedTask.start || !mergedTask.finish || !mergedTask.name) return false;

  const docIdLower = String(docId).trim().toLowerCase();
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

  if (candidateIndices.size === 0) return false;

  let anyProjectChanged = false;
  const mCodeLower = String(mergedTask.taskCodePhu || '').trim().toLowerCase();
  const mNameLower = String(mergedTask.name || '').trim().toLowerCase();
  const mStartStr = String(mergedTask.start || '').trim();

  candidateIndices.forEach((pIdx) => {
    const p = updatedProjects[pIdx];
    if (!p) return;

    if (!tProjId) {
      if (tStoreLower && p.store && String(p.store).trim().toLowerCase() !== tStoreLower) return;
      if (tYearStr && p.year && String(p.year).trim() !== tYearStr) return;
    } else if (String(p.id) !== tProjId) {
      return;
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

    const summaryItem = {
      ...(sIdx !== -1 ? currentSummaries[sIdx] : {}),
      id: docId,
      name: mergedTask.name,
      start: mergedTask.start,
      finish: mergedTask.finish,
      orderIndex:
        mergedTask.orderIndex ??
        (sIdx !== -1 ? currentSummaries[sIdx].orderIndex : currentSummaries.length),
      ...(mergedTask.baselineStart ? { baselineStart: mergedTask.baselineStart } : {}),
      ...(mergedTask.baselineFinish ? { baselineFinish: mergedTask.baselineFinish } : {}),
      ...(mergedTask.approval ? { approval: mergedTask.approval } : {}),
      ...(mergedTask.party ? { party: mergedTask.party } : {}),
      ...(mergedTask.taskCodePhu ? { taskCodePhu: mergedTask.taskCodePhu } : {}),
      ...(mergedTask.parentTaskId ? { parentTaskId: mergedTask.parentTaskId } : {}),
      ...(mergedTask.duration !== undefined ? { duration: mergedTask.duration } : {}),
      ...(mergedTask.runningStatus ? { runningStatus: mergedTask.runningStatus } : {}),
      ...(mergedTask.delegation !== undefined ? { delegation: mergedTask.delegation } : {}),
    };

    if (sIdx !== -1) {
      currentSummaries[sIdx] = summaryItem;
      anyProjectChanged = true;
      updatedProjects[pIdx] = {
        ...p,
        taskSummaries: currentSummaries,
        taskCount: currentSummaries.length,
      };
    } else if (action === 'create') {
      currentSummaries.push(summaryItem);
      anyProjectChanged = true;
      updatedProjects[pIdx] = {
        ...p,
        taskSummaries: currentSummaries,
        taskCount: currentSummaries.length,
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

    const pTasks = getTasksForProject(p, updatedTasks);
    const existingSummaries = Array.isArray(p.taskSummaries) ? p.taskSummaries : [];

    const useInMemoryTasks = pTasks.length > 0 && pTasks.length >= existingSummaries.length;
    const sourceTasksForCalc: Task[] = useInMemoryTasks
      ? pTasks
      : existingSummaries.map(
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
              duration: s.duration ?? 0,
              runningStatus: s.runningStatus,
              delegation: s.delegation,
            }) as Task
        );

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
