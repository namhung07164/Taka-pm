import { Task, Project } from '../../types';
import { parseDateTime, formatToDatetimeLocal } from '../utils';
import { sortGroupTasks, buildTaskNoMap } from './taskSortingAndCodes';
import {
  parsePredecessors,
  getPredecessorCodeUpdates,
  updatePredecessorsStrings,
} from './predecessorParsingAndCascades';

export function addDays(dateStr: string, days: number): string {
  const s = parseDateTime(dateStr);
  if (!s || isNaN(s.getTime())) return dateStr;
  const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
  return formatToDatetimeLocal(f);
}

export interface PredecessorCalculationResult {
  start: string;
  finish: string;
  duration: string;
  durationManual: boolean;
}

export function calculateTaskDatesFromPredecessors(
  currentTask: {
    id?: string;
    start?: string;
    finish?: string;
    duration?: string;
    durationManual?: boolean;
  },
  parsedPreds: Array<{
    type: string;
    lagSign: string;
    lagValue: number;
    task?: { id?: string; start?: string; finish?: string } | null;
  }>,
  getTaskById?: (id: string) => { start?: string; finish?: string } | undefined
): PredecessorCalculationResult | null {
  if (!parsedPreds || parsedPreds.length === 0) return null;

  let maxStartConstraintMs = -1;
  let maxStartConstraintStr = "";

  let maxFinishConstraintMs = -1;
  let maxFinishConstraintStr = "";

  let hasValidPred = false;

  for (const pred of parsedPreds) {
    if (!pred || !pred.task) continue;
    const ptId = pred.task.id || "";
    const pt = (getTaskById && ptId ? getTaskById(ptId) : null) || pred.task;
    if (!pt || !pt.start || !pt.finish) continue;

    hasValidPred = true;
    const lagDays = pred.lagValue * (pred.lagSign === '-' ? -1 : 1);

    if (pred.type === 'FS') {
      const s = addDays(pt.finish, lagDays);
      const ms = parseDateTime(s)?.getTime() || -1;
      if (ms > maxStartConstraintMs) {
        maxStartConstraintMs = ms;
        maxStartConstraintStr = s;
      }
    } else if (pred.type === 'SS') {
      const s = addDays(pt.start, lagDays);
      const ms = parseDateTime(s)?.getTime() || -1;
      if (ms > maxStartConstraintMs) {
        maxStartConstraintMs = ms;
        maxStartConstraintStr = s;
      }
    } else if (pred.type === 'FF') {
      const f = addDays(pt.finish, lagDays);
      const ms = parseDateTime(f)?.getTime() || -1;
      if (ms > maxFinishConstraintMs) {
        maxFinishConstraintMs = ms;
        maxFinishConstraintStr = f;
      }
    } else if (pred.type === 'SF') {
      const f = addDays(pt.start, lagDays);
      const ms = parseDateTime(f)?.getTime() || -1;
      if (ms > maxFinishConstraintMs) {
        maxFinishConstraintMs = ms;
        maxFinishConstraintStr = f;
      }
    }
  }

  if (!hasValidPred) return null;

  const hasStartConstraint = maxStartConstraintMs !== -1;
  const hasFinishConstraint = maxFinishConstraintMs !== -1;

  if (!hasStartConstraint && !hasFinishConstraint) return null;

  const currentDurationNum = parseFloat(String(currentTask.duration || "0"));
  const safeDuration = isNaN(currentDurationNum) || currentDurationNum < 0 ? 0 : currentDurationNum;

  if (hasStartConstraint && hasFinishConstraint) {
    const newStart = maxStartConstraintStr;
    let newFinish = maxFinishConstraintStr;
    const startMs = maxStartConstraintMs;
    const finishMs = maxFinishConstraintMs;
    const diffDays = (finishMs - startMs) / (1000 * 60 * 60 * 24);
    let newDuration = "0";

    if (diffDays >= 0) {
      const rounded = Math.round(diffDays);
      newDuration = Math.abs(diffDays - rounded) < 0.45 ? String(rounded) : String(Number(diffDays.toFixed(2)));
    } else {
      newFinish = newStart;
      newDuration = "0";
    }

    return {
      start: newStart,
      finish: newFinish,
      duration: newDuration,
      durationManual: false
    };
  }

  if (hasStartConstraint && !hasFinishConstraint) {
    const newStart = maxStartConstraintStr;
    const newFinish = addDays(newStart, safeDuration);
    return {
      start: newStart,
      finish: newFinish,
      duration: String(safeDuration),
      durationManual: currentTask.durationManual ?? true
    };
  }

  if (!hasStartConstraint && hasFinishConstraint) {
    const newFinish = maxFinishConstraintStr;
    let newStart = "";
    let newDuration = String(safeDuration);
    const durationManual = currentTask.durationManual ?? false;

    if (currentTask.durationManual) {
      newStart = addDays(newFinish, -safeDuration);
    } else if (currentTask.start) {
      newStart = currentTask.start;
      const startMs = parseDateTime(newStart)?.getTime() || -1;
      const finishMs = maxFinishConstraintMs;
      if (startMs !== -1) {
        const diffDays = (finishMs - startMs) / (1000 * 60 * 60 * 24);
        newDuration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
      } else {
        newStart = addDays(newFinish, -safeDuration);
      }
    } else {
      newStart = addDays(newFinish, -safeDuration);
    }

    return {
      start: newStart,
      finish: newFinish,
      duration: newDuration,
      durationManual
    };
  }

  return null;
}

export function scheduleDependentTasks(updatedTask: Task, allTasks: Task[], projects: Project[]): Task[] {
  // Reuse WeakMap-cached taskNoMap for allTasks instead of cloning allTasks into a new array reference
  const taskNoMap = buildTaskNoMap(projects, allTasks);
  const taskParsedPreds = new Map<string, any[]>();
  const dependencyGraph = new Map<string, string[]>();
  const currentStates = new Map<string, Task>();

  const tasksWithPredByProjectKey = new Map<string, Task[]>();
  const crossProjectPredTasks: Task[] = [];

  const getProjScopeKey = (t: Partial<Task>) => {
    if (t.projectId) return `id:${String(t.projectId).trim()}`;
    return `code:${String(t.projectCode || '').trim().toLowerCase()}|${String(t.projectStore || '').trim().toLowerCase()}|${String(t.projectYear || '').trim()}`;
  };

  for (let i = 0; i < allTasks.length; i++) {
    const raw = allTasks[i];
    if (!raw || raw.isDeleted) continue;
    const tsk = raw.id === updatedTask.id ? updatedTask : raw;
    currentStates.set(tsk.id, tsk);
    if (tsk.predecessor && tsk.predecessor.trim()) {
      const pKey = getProjScopeKey(tsk);
      let list = tasksWithPredByProjectKey.get(pKey);
      if (!list) {
        list = [];
        tasksWithPredByProjectKey.set(pKey, list);
      }
      list.push(tsk);

      const pCodeLower = String(tsk.projectCode || '').trim().toLowerCase();
      const predLower = tsk.predecessor.toLowerCase();
      // If predecessor string contains '#' and is not strictly a local '#N' or same-project 'CODE#N', mark as potential cross-project dependent
      if (
        (tsk.predecessorTaskIds && tsk.predecessorTaskIds.length > 0) ||
        (predLower.includes('#') && (!pCodeLower || !predLower.startsWith(pCodeLower + '#')))
      ) {
        crossProjectPredTasks.push(tsk);
      }
    }
  }
  if (!currentStates.has(updatedTask.id)) {
    currentStates.set(updatedTask.id, updatedTask);
    if (updatedTask.predecessor && updatedTask.predecessor.trim()) {
      const pKey = getProjScopeKey(updatedTask);
      let list = tasksWithPredByProjectKey.get(pKey);
      if (!list) {
        list = [];
        tasksWithPredByProjectKey.set(pKey, list);
      }
      list.push(updatedTask);
    }
  }

  const parsedScopes = new Set<string>();
  const parsedTaskIds = new Set<string>();

  const parseTaskPred = (tsk: Task) => {
    if (parsedTaskIds.has(tsk.id)) return;
    parsedTaskIds.add(tsk.id);
    if (!tsk.predecessor) return;
    const parsed = parsePredecessors(tsk.predecessor, taskNoMap, tsk);
    if (parsed.length > 0) {
      taskParsedPreds.set(tsk.id, parsed);
      for (let i = 0; i < parsed.length; i++) {
        const predTask = parsed[i]?.task;
        if (predTask && predTask.id) {
          let deps = dependencyGraph.get(predTask.id);
          if (!deps) {
            deps = [];
            dependencyGraph.set(predTask.id, deps);
          }
          deps.push(tsk.id);
        }
      }
    }
  };

  const ensureScopeParsed = (tsk: Task) => {
    const scopeKey = getProjScopeKey(tsk);
    if (!parsedScopes.has(scopeKey)) {
      parsedScopes.add(scopeKey);
      const scopeTasks = tasksWithPredByProjectKey.get(scopeKey);
      if (scopeTasks) {
        for (let i = 0; i < scopeTasks.length; i++) {
          parseTaskPred(scopeTasks[i]);
        }
      }
    }
    const pCodeLower = String(tsk.projectCode || '').trim().toLowerCase();
    for (let i = 0; i < crossProjectPredTasks.length; i++) {
      const cpTask = crossProjectPredTasks[i];
      if (parsedTaskIds.has(cpTask.id)) continue;
      const hasHardLink = cpTask.predecessorTaskIds?.includes(tsk.id);
      const mentionsCode = pCodeLower && cpTask.predecessor?.toLowerCase().includes(pCodeLower);
      if (hasHardLink || mentionsCode) {
        parseTaskPred(cpTask);
      }
    }
  };

  parseTaskPred(updatedTask);
  ensureScopeParsed(updatedTask);

  const queue: string[] = [];
  const processed = new Set<string>();
  const updatesToApply = new Map<string, Task>();

  const updatedTaskPreds = taskParsedPreds.get(updatedTask.id) || [];
  updatedTaskPreds.forEach(pred => {
    if (pred?.task?.id) {
      ensureScopeParsed(pred.task);
      queue.push(pred.task.id);
    }
  });
  queue.push(updatedTask.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (processed.has(currentId)) continue;
    processed.add(currentId);

    const currentTaskObj = currentStates.get(currentId);
    if (currentTaskObj) {
      ensureScopeParsed(currentTaskObj);
    }

    const dependents = dependencyGraph.get(currentId) || [];
    
    dependents.forEach(depId => {
      const depTask = currentStates.get(depId);
      if (!depTask) return;
      const preds = taskParsedPreds.get(depId) || [];
      
      const isFlexible = Boolean(depTask.predecessor?.trim());

      if (depTask.approval === "Approved" || (depTask as any)._isAutoActualized || !isFlexible) {
        return;
      }

      const calcResult = calculateTaskDatesFromPredecessors(
        depTask,
        preds,
        (id) => currentStates.get(id)
      );

      if (calcResult) {
        const { start: newStart, finish: newFinish, duration: newDuration, durationManual: newDurationManual } = calcResult;
        if (newStart !== depTask.start || newFinish !== depTask.finish || newDuration !== depTask.duration || newDurationManual !== depTask.durationManual) {
           const updatedDepTask = { 
             ...depTask, 
             start: newStart, 
             finish: newFinish,
             duration: newDuration,
             durationManual: newDurationManual,
             ...(depTask.realtimeUpdate === undefined && Boolean(depTask.predecessor?.trim()) ? { realtimeUpdate: true } : {})
           };
           currentStates.set(depId, updatedDepTask);
           updatesToApply.set(depId, updatedDepTask);
           queue.push(depId);
        }
      }
    });
  }

  return Array.from(updatesToApply.values());
}

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
