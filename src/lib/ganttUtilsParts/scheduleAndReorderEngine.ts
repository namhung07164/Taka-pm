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
  const mergedTasks = allTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
  if (!allTasks.some(t => t.id === updatedTask.id)) {
    mergedTasks.push(updatedTask);
  }
  const taskNoMap = buildTaskNoMap(projects, mergedTasks);
  const taskParsedPreds = new Map<string, any[]>();
  const dependencyGraph = new Map<string, string[]>();

  mergedTasks.forEach(tsk => {
    if (tsk.predecessor) {
      const parsed = parsePredecessors(tsk.predecessor, taskNoMap, tsk);
      
      if (parsed.length > 0) {
        taskParsedPreds.set(tsk.id, parsed);
        parsed.forEach(pred => {
          const predTask = pred?.task;
          if (predTask) {
            const deps = dependencyGraph.get(predTask.id) || [];
            deps.push(tsk.id);
            dependencyGraph.set(predTask.id, deps);
          }
        });
      }
    }
  });

  const queue: string[] = [];
  const processed = new Set<string>();
  const updatesToApply = new Map<string, Task>();
  const currentStates = new Map<string, Task>();
  
  mergedTasks.forEach(tsk => currentStates.set(tsk.id, tsk));
  currentStates.set(updatedTask.id, updatedTask);

  const updatedTaskPreds = taskParsedPreds.get(updatedTask.id) || [];
  updatedTaskPreds.forEach(pred => {
    if (pred) {
      const predTask = pred.task;
      if (predTask) queue.push(predTask.id);
    }
  });
  queue.push(updatedTask.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (processed.has(currentId)) continue;
    processed.add(currentId);

    const dependents = dependencyGraph.get(currentId) || [];
    
    dependents.forEach(depId => {
      const depTask = currentStates.get(depId)!;
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

  const targetPrjCode = targetProject.code;
  const targetPrjYear = targetProject.year || "";
  const targetPrjStore = targetProject.store || "";

  const currentProjectTasks = sortGroupTasks(
    allTasks.filter(t =>
      String(t.projectCode || "").trim().toLowerCase() === String(targetPrjCode).trim().toLowerCase() &&
      (targetPrjYear ? String(t.projectYear || "").trim().toLowerCase() === String(targetPrjYear).trim().toLowerCase() : true) &&
      (targetPrjStore ? String(t.projectStore || "").trim().toLowerCase() === String(targetPrjStore).trim().toLowerCase() : true)
    )
  );

  const remaining = currentProjectTasks.filter(t => !tasksToMoveIds.includes(t.id));

  let targetIndex = remaining.findIndex(t => t.id === targetTaskId);
  if (targetIndex === -1) {
    targetIndex = remaining.length;
  } else if (position === 'after') {
    targetIndex += 1;
  }

  const movedTasks = allTasks.filter(t => tasksToMoveIds.includes(t.id));
  movedTasks.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  remaining.splice(targetIndex, 0, ...movedTasks);
  const reorderedGroupTasks = remaining;

  const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
  const now = new Date().toISOString();

  const newTasksMap = new Map<string, Task>();
  allTasks.forEach(t => newTasksMap.set(t.id, { ...t }));

  reorderedGroupTasks.forEach((t, idx) => {
    const newOrderIndex = idx;
    const newTaskCodePhu = `${targetPrjCode}#${idx + 1}`;
    const isMoved = tasksToMoveIds.includes(t.id);
    const hasOrderChanged = t.orderIndex !== newOrderIndex || t.taskCodePhu !== newTaskCodePhu;

    if (hasOrderChanged || isMoved) {
      const updates: Partial<Task> = {
        orderIndex: newOrderIndex,
        taskCodePhu: newTaskCodePhu,
        updatedAt: now,
      };
      if (isMoved) {
        updates.projectCode = targetPrjCode;
        updates.projectYear = targetPrjYear;
        updates.projectStore = targetPrjStore;
      }
      taskUpdates.push({ id: t.id, updates });

      const existing = newTasksMap.get(t.id);
      if (existing) {
        newTasksMap.set(t.id, { ...existing, ...updates });
      }
    }
  });

  const updatedAllTasks = Array.from(newTasksMap.values());

  const oldTaskNoMap = buildTaskNoMap(projects, allTasks);
  const newTaskNoMap = buildTaskNoMap(projects, updatedAllTasks);
  const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, updatedAllTasks);
  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, updatedAllTasks, projects);

  predecessorUpdates.forEach(pu => {
    const existing = taskUpdates.find(tu => tu.id === pu.id);
    if (existing) {
      existing.updates.predecessor = pu.predecessor;
    }
    const memTask = updatedAllTasks.find(t => t.id === pu.id);
    if (memTask) {
      memTask.predecessor = pu.predecessor;
      memTask.updatedAt = pu.updatedAt;
    }
  });

  return {
    groupTasks: reorderedGroupTasks,
    allUpdatedTasks: updatedAllTasks,
    taskUpdates,
    predecessorUpdates,
  };
}
