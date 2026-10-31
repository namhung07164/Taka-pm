import { Task, Project } from '../../types';
import { sortGroupTasks, buildTaskNoMap } from './taskSortingAndCodes';
import {
  getPredecessorCodeUpdates,
  updatePredecessorsStrings,
} from './predecessorParsingAndCascades';

export interface ReorderCalculationResult {
  groupTasks: Task[];
  allUpdatedTasks: Task[];
  taskUpdates: { id: string; updates: Partial<Task> }[];
  predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[];
}

export function reorderAndCalculateTasks(
  allTasks: Task[],
  projects: Project[],
  targetProject: Project,
  tasksToMoveIds: string[],
  targetTaskId: string,
  position: 'before' | 'after'
): ReorderCalculationResult | null {
  if (!tasksToMoveIds.length) return null;
  if (tasksToMoveIds.length === 1 && tasksToMoveIds[0] === targetTaskId) return null;

  const movedIdsSet = new Set(tasksToMoveIds);
  if (movedIdsSet.has(targetTaskId)) return null;

  const targetPrjId = targetProject.id || "";
  const targetPrjCode = targetProject.code;
  const targetPrjCodeLower = String(targetPrjCode || "").trim().toLowerCase();
  const targetPrjYear = targetProject.year || "";
  const targetPrjYearLower = String(targetPrjYear).trim().toLowerCase();
  const targetPrjStore = targetProject.store || "";
  const targetPrjStoreLower = String(targetPrjStore).trim().toLowerCase();

  const matchesTargetProject = (t: Task) => {
    if (targetPrjId && t.projectId) {
      return t.projectId === targetPrjId;
    }
    return (
      String(t.projectCode || "").trim().toLowerCase() === targetPrjCodeLower &&
      (targetPrjYearLower ? String(t.projectYear || "").trim().toLowerCase() === targetPrjYearLower : true) &&
      (targetPrjStoreLower ? String(t.projectStore || "").trim().toLowerCase() === targetPrjStoreLower : true)
    );
  };

  const currentProjectTasks = sortGroupTasks(allTasks.filter(matchesTargetProject));
  const remaining = currentProjectTasks.filter(t => !movedIdsSet.has(t.id));

  let targetIndex = remaining.findIndex(t => t.id === targetTaskId);
  if (targetIndex === -1) {
    targetIndex = remaining.length;
  } else if (position === 'after') {
    targetIndex += 1;
  }

  const movedTasks = allTasks.filter(t => movedIdsSet.has(t.id));
  movedTasks.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  remaining.splice(targetIndex, 0, ...movedTasks);
  const reorderedGroupTasks = remaining;

  const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
  const taskUpdatesMap = new Map<string, { id: string; updates: Partial<Task> }>();
  const now = new Date().toISOString();

  const newTasksMap = new Map<string, Task>();
  for (let i = 0; i < allTasks.length; i++) {
    const t = allTasks[i];
    newTasksMap.set(t.id, t);
  }

  const affectedProjectCodesLower = new Set<string>([targetPrjCodeLower]);
  const affectedProjectIds = new Set<string>(targetPrjId ? [targetPrjId] : []);
  for (let i = 0; i < movedTasks.length; i++) {
    const mt = movedTasks[i];
    if (mt.projectCode) affectedProjectCodesLower.add(String(mt.projectCode).trim().toLowerCase());
    if (mt.projectId) affectedProjectIds.add(mt.projectId);
  }

  reorderedGroupTasks.forEach((t, idx) => {
    const newOrderIndex = idx;
    const newTaskCodePhu = `${targetPrjCode}#${idx + 1}`;
    const isMoved = movedIdsSet.has(t.id);
    const hasOrderChanged = t.orderIndex !== newOrderIndex || t.taskCodePhu !== newTaskCodePhu;

    if (hasOrderChanged || isMoved) {
      const updates: Partial<Task> = {
        orderIndex: newOrderIndex,
        taskCodePhu: newTaskCodePhu,
        updatedAt: now,
      };
      if (isMoved) {
        if (targetPrjId) updates.projectId = targetPrjId;
        updates.projectCode = targetPrjCode;
        updates.projectYear = targetPrjYear;
        updates.projectStore = targetPrjStore;
      }
      const entry = { id: t.id, updates };
      taskUpdates.push(entry);
      taskUpdatesMap.set(t.id, entry);

      const existing = newTasksMap.get(t.id);
      if (existing) {
        newTasksMap.set(t.id, { ...existing, ...updates });
      }
    }
  });

  // Scope predecessor recalculation to affected projects + any cross-project tasks referencing affected project codes
  const scopedProjects = projects.filter(p => {
    if (!p) return false;
    if (p.id && affectedProjectIds.has(p.id)) return true;
    const pCode = String(p.code || '').trim().toLowerCase();
    return affectedProjectCodesLower.has(pCode);
  });
  const effectiveProjects = scopedProjects.length > 0 ? scopedProjects : [targetProject];

  const isTaskInAffectedScope = (t: Task) => {
    if (!t || t.isDeleted) return false;
    if (t.projectId && affectedProjectIds.has(t.projectId)) return true;
    const pCode = String(t.projectCode || '').trim().toLowerCase();
    if (affectedProjectCodesLower.has(pCode)) return true;
    if (t.predecessor) {
      const predLower = t.predecessor.toLowerCase();
      for (const code of affectedProjectCodesLower) {
        if (code && predLower.includes(code)) return true;
      }
    }
    return false;
  };

  const scopedOldTasks: Task[] = [];
  const scopedNewTasks: Task[] = [];
  for (let i = 0; i < allTasks.length; i++) {
    const oldT = allTasks[i];
    const newT = newTasksMap.get(oldT.id) || oldT;
    if (isTaskInAffectedScope(oldT) || isTaskInAffectedScope(newT)) {
      scopedOldTasks.push(oldT);
      scopedNewTasks.push(newT);
    }
  }

  const oldTaskNoMap = buildTaskNoMap(effectiveProjects, scopedOldTasks);
  const newTaskNoMap = buildTaskNoMap(effectiveProjects, scopedNewTasks);
  const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, effectiveProjects, scopedNewTasks);
  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, scopedNewTasks, effectiveProjects, oldTaskNoMap);

  for (let i = 0; i < predecessorUpdates.length; i++) {
    const pu = predecessorUpdates[i];
    const existing = taskUpdatesMap.get(pu.id);
    if (existing) {
      existing.updates.predecessor = pu.predecessor;
    }
    const memTask = newTasksMap.get(pu.id);
    if (memTask) {
      newTasksMap.set(pu.id, {
        ...memTask,
        predecessor: pu.predecessor,
        updatedAt: pu.updatedAt,
      });
    }
  }

  const updatedAllTasks = Array.from(newTasksMap.values());

  return {
    groupTasks: reorderedGroupTasks,
    allUpdatedTasks: updatedAllTasks,
    taskUpdates,
    predecessorUpdates,
  };
}
