import { Task, Project } from '../types';
import { parseDateTime, formatToDatetimeLocal } from './utils';

export function getPredecessorCodeUpdates(oldTaskNoMap: Map<string, Task[]>, newTaskNoMap: Map<string, Task[]>, projects: Project[], newTasks: Task[]): Map<string, string> {
  const oldCodeToNewCode = new Map<string, string>();
  const taskIdToOldCode = new Map<string, string>();
  for (const [code, groupTasks] of oldTaskNoMap.entries()) {
      groupTasks.forEach(t => taskIdToOldCode.set(t.id, code));
  }
  for (const [code, groupTasks] of newTaskNoMap.entries()) {
      groupTasks.forEach(t => {
          const oldCode = taskIdToOldCode.get(t.id);
          if (oldCode && oldCode !== code) {
              oldCodeToNewCode.set(oldCode, code);
          }
      });
  }
  return oldCodeToNewCode;
}

export function updatePredecessorsStrings(oldCodeToNewCode: Map<string, string>, allTasks: Task[]): {id: string, predecessor: string, updatedAt: string}[] {
  const updates: {id: string, predecessor: string, updatedAt: string}[] = [];
  if (oldCodeToNewCode.size === 0) return updates;
  
  allTasks.forEach(t => {
      if (!t.predecessor) return;
      const preds = t.predecessor.split(',').map(s => s.trim()).filter(Boolean);
      let changed = false;
      const newPreds = preds.map(pMatches => {
          const lowerMatches = pMatches.toLowerCase();
          let longestMatch = "";
          for (const oldCode of oldCodeToNewCode.keys()) {
            if (lowerMatches.startsWith(oldCode) && oldCode.length > longestMatch.length) {
              const remainder = lowerMatches.substring(oldCode.length);
              if (remainder.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainder)) {
                longestMatch = oldCode;
              }
            }
          }
          if (longestMatch) {
            const newCode = oldCodeToNewCode.get(longestMatch)!;
            if (newCode.toLowerCase() !== longestMatch) {
              changed = true;
              let replacementCode = newCode;
              const originalMatchStr = pMatches.substring(0, longestMatch.length);
              if (originalMatchStr === originalMatchStr.toUpperCase()) {
                replacementCode = replacementCode.toUpperCase();
              }
              return replacementCode + pMatches.substring(longestMatch.length);
            }
          }
          return pMatches;
      });

      if (changed) {
          updates.push({
              id: t.id,
              predecessor: newPreds.join(', '),
              updatedAt: new Date().toISOString()
          });
      }
  });

  return updates;
}

export function sortGroupTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const valAOrder = a.orderIndex !== undefined ? a.orderIndex : 0;
    const valBOrder = b.orderIndex !== undefined ? b.orderIndex : 0;
    
    if (valAOrder === valBOrder) {
      // Fallback to stable sorting using id
      return String(a.id || '').localeCompare(String(b.id || ''));
    }
    return valAOrder - valBOrder;
  });
}

export function buildTaskNoMap(projects: Project[], tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  const tasksByProjectCode = new Map<string, Task[]>();
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  for (const t of safeTasks) {
    if (!t) continue;
    const code = String(t.projectCode || '').trim().toLowerCase();
    let arr = tasksByProjectCode.get(code);
    if (!arr) {
      arr = [];
      tasksByProjectCode.set(code, arr);
    }
    arr.push(t);
  }

  safeProjects.forEach((p) => {
    if (!p) return;
    const pCode = String(p.code || '').trim().toLowerCase();
    const pTasks = tasksByProjectCode.get(pCode) || [];
    const groupTasks = sortGroupTasks(pTasks.filter(t => 
       t &&
       (p.year ? String(t.projectYear || '') === String(p.year) : true) &&
       (p.store ? String(t.projectStore || '') === String(p.store) : true)
    ));
    groupTasks.forEach((t, i) => {
      if (!t) return;
      const code = String(t.taskCodePhu || `${p.code || ''}-${i + 1}`).toLowerCase();
      const existing = map.get(code) || [];
      existing.push(t);
      map.set(code, existing);
    });
  });
  return map;
}

export function computeTaskCode(projects: Project[], tasks: Task[], task: Task): string {
  if (!task || !projects || !Array.isArray(projects) || !tasks || !Array.isArray(tasks)) return '';
  if (task.taskCodePhu) return task.taskCodePhu;
  const p = projects.find(proj => 
     proj && proj.code && task.projectCode &&
     String(proj.code).trim().toLowerCase() === String(task.projectCode).trim().toLowerCase() && 
     (proj.year ? String(task.projectYear || '').trim().toLowerCase() === String(proj.year).trim().toLowerCase() : true) &&
    (proj.store ? String(task.projectStore || '').trim().toLowerCase() === String(proj.store).trim().toLowerCase() : true)
  );
  if (!p) return '';
  const groupTasks = sortGroupTasks((tasks || []).filter(t => 
     t && t.projectCode && p.code &&
     String(t.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase() && 
     (p.year ? String(t.projectYear || '').trim().toLowerCase() === String(p.year).trim().toLowerCase() : true) &&
    (p.store ? String(t.projectStore || '').trim().toLowerCase() === String(p.store).trim().toLowerCase() : true)
  ));
  const i = groupTasks.findIndex(t => t.id === task.id);
  if (i === -1) return '';
  return `${p.code}-${i + 1}`;
}

export function parsePredecessors(predecessorString: string, taskNoMap: Map<string, Task[]>, contextTask?: Task) {
  if (!predecessorString) return [];
  const preds = predecessorString.split(',').map(s => s.trim()).filter(Boolean);
  return preds.map(pMatches => {
    const lowerMatches = pMatches.toLowerCase();
    let longestMatch = "";
    for (const code of taskNoMap.keys()) {
      if (lowerMatches.startsWith(code) && code.length > longestMatch.length) {
        const remainderCheck = lowerMatches.substring(code.length);
        if (remainderCheck.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
          longestMatch = code;
        }
      }
    }

    // Smart fallback 1: if input started with '1' instead of 'l' (common OCR/typing confusion like 11-113-3-2 for l1-113-3-2)
    if (!longestMatch && /^1/.test(lowerMatches)) {
      const fixedLower = 'l' + lowerMatches.substring(1);
      for (const code of taskNoMap.keys()) {
        if (fixedLower.startsWith(code) && code.length > longestMatch.length) {
          const remainderCheck = fixedLower.substring(code.length);
          if (remainderCheck.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
            longestMatch = code;
          }
        }
      }
    }

    // Smart fallback 2: short sub-task index within current project (e.g. "2", "-2", "#2")
    if (!longestMatch && contextTask && contextTask.projectCode) {
      const shortMatch = lowerMatches.match(/^[-#\s]*(\d+)(.*)$/);
      if (shortMatch) {
        const subIndex = shortMatch[1];
        const candidateCode = `${String(contextTask.projectCode).trim().toLowerCase()}-${subIndex}`;
        if (taskNoMap.has(candidateCode)) {
          longestMatch = candidateCode;
        }
      }
    }

    if (longestMatch) {
      // Find remainder from either pMatches or matched code
      let remainder = "";
      if (lowerMatches.startsWith(longestMatch)) {
        remainder = pMatches.substring(longestMatch.length).trim();
      } else {
        // Fallback matched through replacement or short index
        const cleaned = pMatches.replace(/^[-#\s]*\d+/, '').replace(/^11-/, '').trim();
        remainder = cleaned;
      }

      let type = 'FS';
      let lagSign = '+';
      let lagValue = 0;

      if (remainder) {
        const remainderMatch = remainder.match(/^(FS|SS|FF|SF)?\s*(?:([+-])?\s*(\d+(?:\.\d+)?))?\s*$/i);
        if (remainderMatch) {
          if (remainderMatch[1]) type = remainderMatch[1].toUpperCase();
          if (remainderMatch[2]) lagSign = remainderMatch[2];
          if (remainderMatch[3]) lagValue = parseFloat(remainderMatch[3]);
        }
      }
      
      const possibleTasks = taskNoMap.get(longestMatch);
      let resolvedTask;
      if (possibleTasks) {
        if (contextTask) {
           resolvedTask = possibleTasks.find(t => 
             t &&
             String(t.projectCode || '').trim().toLowerCase() === String(contextTask.projectCode || '').trim().toLowerCase() && 
             String(t.projectYear || '').trim().toLowerCase() === String(contextTask.projectYear || '').trim().toLowerCase() && 
             String(t.projectStore || '').trim().toLowerCase() === String(contextTask.projectStore || '').trim().toLowerCase()
           );
        }
        if (!resolvedTask) resolvedTask = possibleTasks[0];
      }

      return {
        no: longestMatch,
        type,
        lagSign,
        lagValue,
        task: resolvedTask
      };
    }
    return null;
  }).filter(Boolean);
}

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

  // Case 1: Both Start Constraint and Finish Constraint exist (e.g. Pred 1 is FS/SS, Pred 2 is FF/SF)
  if (hasStartConstraint && hasFinishConstraint) {
    const newStart = maxStartConstraintStr;
    let newFinish = maxFinishConstraintStr;
    const startMs = maxStartConstraintMs;
    const finishMs = maxFinishConstraintMs;
    let diffDays = (finishMs - startMs) / (1000 * 60 * 60 * 24);
    let newDuration = "0";

    if (diffDays >= 0) {
      newDuration = String(Number(diffDays.toFixed(2)));
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

  // Case 2: Only Start Constraint exists (FS/SS)
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

  // Case 3: Only Finish Constraint exists (FF/SF)
  if (!hasStartConstraint && hasFinishConstraint) {
    const newFinish = maxFinishConstraintStr;
    let newStart = "";
    let newDuration = String(safeDuration);
    let durationManual = currentTask.durationManual ?? false;

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
  let mergedTasks = allTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
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

  // Group tasks in the target project sorted by orderIndex
  const currentProjectTasks = sortGroupTasks(
    allTasks.filter(t =>
      String(t.projectCode || "").trim().toLowerCase() === String(targetPrjCode).trim().toLowerCase() &&
      (targetPrjYear ? String(t.projectYear || "").trim().toLowerCase() === String(targetPrjYear).trim().toLowerCase() : true) &&
      (targetPrjStore ? String(t.projectStore || "").trim().toLowerCase() === String(targetPrjStore).trim().toLowerCase() : true)
    )
  );

  // Remove moved tasks from the target project list if they were already there
  const remaining = currentProjectTasks.filter(t => !tasksToMoveIds.includes(t.id));

  // Find targetTask insertion index in remaining
  let targetIndex = remaining.findIndex(t => t.id === targetTaskId);
  if (targetIndex === -1) {
    targetIndex = remaining.length;
  } else if (position === 'after') {
    targetIndex += 1;
  }

  // Get moved tasks, preserving their current relative orderIndex
  const movedTasks = allTasks.filter(t => tasksToMoveIds.includes(t.id));
  movedTasks.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  // Insert moved tasks into the target position
  remaining.splice(targetIndex, 0, ...movedTasks);
  const reorderedGroupTasks = remaining;

  // Build taskUpdates
  const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
  const now = new Date().toISOString();

  // Create a working clone of all tasks for predecessor calculation
  const newTasksMap = new Map<string, Task>();
  allTasks.forEach(t => newTasksMap.set(t.id, { ...t }));

  reorderedGroupTasks.forEach((t, idx) => {
    const newOrderIndex = idx;
    const newTaskCodePhu = `${targetPrjCode}-${idx + 1}`;
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

  // Compute predecessor updates
  const oldTaskNoMap = buildTaskNoMap(projects, allTasks);
  const newTaskNoMap = buildTaskNoMap(projects, updatedAllTasks);
  const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, updatedAllTasks);
  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, updatedAllTasks);

  // Merge any predecessor updates for tasks that are already in taskUpdates
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
