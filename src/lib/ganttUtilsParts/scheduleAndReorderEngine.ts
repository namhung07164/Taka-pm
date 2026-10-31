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

export {
  type ReorderCalculationResult,
  reorderAndCalculateTasks,
} from './ganttReorderSubEngine';

