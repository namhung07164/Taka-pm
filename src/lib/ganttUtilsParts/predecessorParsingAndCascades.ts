import { Task, Project } from '../../types';
import { parsePredecessorToken } from '../predecessorMatchUtils';
import { sortGroupTasks, computeAllTaskCodes } from './taskSortingAndCodes';
import { splitPredecessors, parsePredecessors } from './predecessorParsingUtils';

export { splitPredecessors, parsePredecessors };

export function getPredecessorCodeUpdates(
  oldTaskNoMap: Map<string, Task[]>,
  newTaskNoMap: Map<string, Task[]>,
  projects: Project[],
  newTasks: Task[]
): Map<string, string> {
  const oldCodeToNewCode = new Map<string, string>();
  const taskIdToOldCodes = new Map<string, string[]>();

  for (const [code, groupTasks] of oldTaskNoMap.entries()) {
    groupTasks.forEach(t => {
      if (!t || !t.id) return;
      const list = taskIdToOldCodes.get(t.id) || [];
      if (!list.includes(code)) list.push(code);
      taskIdToOldCodes.set(t.id, list);
    });
  }

  const taskCodeMap = computeAllTaskCodes(projects, newTasks);

  newTasks.forEach(t => {
    if (!t || !t.id) return;
    const oldCodes = taskIdToOldCodes.get(t.id) || [];
    const newPrimaryCode = taskCodeMap.get(t.id) || t.taskCodePhu || (t.projectCode ? `${t.projectCode}#${(t.orderIndex ?? 0) + 1}` : t.id);

    if (newPrimaryCode) {
      oldCodes.forEach(oldCode => {
        // Never map bare '#1' or numeric shorthand globally across projects in oldCodeToNewCode
        if (!oldCode || oldCode.startsWith('#') || /^\d+$/.test(oldCode)) return;
        if (
          oldCode.toLowerCase() !== newPrimaryCode.toLowerCase() &&
          oldCode.toLowerCase() !== t.id.toLowerCase()
        ) {
          oldCodeToNewCode.set(oldCode.toLowerCase(), newPrimaryCode);
        }
      });
    }
  });

  return oldCodeToNewCode;
}

export function updatePredecessorsStrings(
  oldCodeToNewCode: Map<string, string>, 
  allTasks: Task[],
  projects?: Project[],
  oldTaskNoMap?: Map<string, Task[]>
): {id: string, predecessor: string, updatedAt: string}[] {
  const updates: {id: string, predecessor: string, updatedAt: string}[] = [];
  if ((!oldCodeToNewCode || oldCodeToNewCode.size === 0) && !oldTaskNoMap) return updates;
  
  const normalizedMap = new Map<string, string>();
  if (oldCodeToNewCode) {
    for (const [k, v] of oldCodeToNewCode.entries()) {
      if (k && v && !k.trim().startsWith('#')) {
        normalizedMap.set(k.trim().toLowerCase(), v.trim());
      }
    }
  }

  const canonicalCodeMap = computeAllTaskCodes(projects || [], allTasks);
  const taskIdToNewTask = new Map<string, Task>();
  allTasks.forEach(t => {
    if (t && t.id) taskIdToNewTask.set(t.id, t);
  });

  const knownCodes = new Set<string>();
  for (const k of normalizedMap.keys()) knownCodes.add(k);
  for (const v of normalizedMap.values()) knownCodes.add(v.toLowerCase());
  if (oldTaskNoMap) {
    for (const k of oldTaskNoMap.keys()) knownCodes.add(k.toLowerCase());
  }
  allTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.toLowerCase());
    if (t.projectCode) knownCodes.add(t.projectCode.toLowerCase());
  });

  allTasks.forEach(t => {
    if (!t || !t.predecessor) return;
    const preds = splitPredecessors(t.predecessor, knownCodes);
    let changed = false;
    const newPreds = preds.map((pMatches, tokIdx) => {
      const trimmed = pMatches.trim();
      if (!trimmed) return pMatches;

      if (oldTaskNoMap) {
        const tokenCtx = { ...t, predecessorTaskIds: [(t.predecessorTaskIds || [])[tokIdx] || ''] } as Task;
        const parsed = parsePredecessors(trimmed, oldTaskNoMap, tokenCtx);
        if (parsed.length > 0 && parsed[0]?.task) {
          const targetTaskObj = parsed[0].task;
          const updatedTargetTask = taskIdToNewTask.get(targetTaskObj.id);
          if (updatedTargetTask) {
            const newPrimaryCode =
              canonicalCodeMap.get(updatedTargetTask.id) ||
              updatedTargetTask.taskCodePhu ||
              (updatedTargetTask.projectCode ? `${updatedTargetTask.projectCode}#${(updatedTargetTask.orderIndex ?? 0) + 1}` : updatedTargetTask.id);

            let remainder = parsePredecessorToken(trimmed).suffix;
            const lowerMatches = trimmed.toLowerCase();
            if (!remainder) {
              if (parsed[0].no && lowerMatches.startsWith(parsed[0].no.toLowerCase()) && parsed[0].no.length < trimmed.length) {
                remainder = trimmed.substring(parsed[0].no.length);
              } else if (!(parsed[0].no && lowerMatches === parsed[0].no.toLowerCase())) {
                remainder = trimmed.replace(/^[-#\s]*\d+/, '').replace(/^[a-zA-Z0-9_-]+[-#]\d+/, '').trim();
              }
            }

            const shortMatch = trimmed.match(/^([-#\s]*)(\d+)(.*)$/);
            const isSameProject = t.projectId && updatedTargetTask.projectId
              ? t.projectId === updatedTargetTask.projectId
              : (t.projectCode && updatedTargetTask.projectCode && 
                 String(t.projectCode).trim().toLowerCase() === String(updatedTargetTask.projectCode).trim().toLowerCase());

            if (shortMatch && isSameProject) {
              const prefixSymbol = shortMatch[1];
              const newSubtaskNum = (updatedTargetTask.orderIndex !== undefined ? updatedTargetTask.orderIndex : 0) + 1;
              const restSuffix = shortMatch[3];
              const reassembled = `${prefixSymbol}${newSubtaskNum}${restSuffix}`;
              if (reassembled !== trimmed) {
                changed = true;
                return reassembled;
              }
              return trimmed;
            } else {
              const reassembled = `${newPrimaryCode}${remainder}`;
              if (reassembled !== trimmed) {
                changed = true;
                return reassembled;
              }
              return trimmed;
            }
          }
        }
      }

      const lowerMatches = trimmed.toLowerCase();
      let longestMatch = "";
      for (const oldCode of normalizedMap.keys()) {
        if (lowerMatches.startsWith(oldCode) && oldCode.length > longestMatch.length) {
          const remainder = lowerMatches.substring(oldCode.length);
          if (remainder.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s*\d|$)/i.test(remainder)) {
            longestMatch = oldCode;
          }
        }
      }
      if (longestMatch) {
        const newCode = normalizedMap.get(longestMatch)!;
        if (newCode.toLowerCase() !== longestMatch) {
          changed = true;
          let replacementCode = newCode;
          const originalMatchStr = trimmed.substring(0, longestMatch.length);
          if (originalMatchStr === originalMatchStr.toUpperCase()) {
            replacementCode = replacementCode.toUpperCase();
          }
          return replacementCode + trimmed.substring(longestMatch.length);
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

export function getProjectCodeChangePredecessorUpdates(
  oldProject: Project,
  newCode: string,
  newYear: number | string | undefined,
  newStore: string | undefined,
  allTasks: Task[],
  projects: Project[]
): {
  oldCodeToNewCode: Map<string, string>;
  taskUpdates: Map<string, { taskCodePhu?: string; projectCode: string; projectYear?: number; projectStore?: string }>;
  predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[];
} {
  const oldCodeToNewCode = new Map<string, string>();
  const taskUpdates = new Map<string, { taskCodePhu?: string; projectCode: string; projectYear?: number; projectStore?: string }>();

  const oldPCode = String(oldProject.code || '').trim();
  const newPCode = String(newCode || '').trim();
  const oldYear = oldProject.year;
  const oldStore = oldProject.store;

  const yearNum = (newYear !== undefined && newYear !== null && !isNaN(Number(newYear))) 
    ? Number(newYear) 
    : (oldYear !== undefined && !isNaN(Number(oldYear)) ? Number(oldYear) : undefined);

  const relatedTasks = allTasks.filter(t => {
    const matchesCode = String(t.projectCode || '').trim().toLowerCase() === oldPCode.toLowerCase();
    const matchesYear = !t.projectYear || !oldYear || String(t.projectYear) === String(oldYear);
    const matchesStore = !t.projectStore || !oldStore || String(t.projectStore) === String(oldStore);
    return matchesCode && matchesYear && matchesStore;
  });

  const sortedTasks = sortGroupTasks(relatedTasks);

  sortedTasks.forEach((t, i) => {
    const order = (t.orderIndex !== undefined ? t.orderIndex : i) + 1;
    const defaultOldCode = `${oldPCode}#${order}`;
    const defaultNewCode = `${newPCode}#${order}`;
    
    oldCodeToNewCode.set(defaultOldCode.toLowerCase(), defaultNewCode);

    const newTaskCodePhu = `${newPCode}#${order}`;
    
    if (t.taskCodePhu && t.taskCodePhu.trim()) {
      const lowerPhu = t.taskCodePhu.trim().toLowerCase();
      oldCodeToNewCode.set(lowerPhu, newTaskCodePhu);
    }

    taskUpdates.set(t.id, {
      projectCode: newPCode,
      ...(yearNum !== undefined ? { projectYear: yearNum } : {}),
      ...(newStore ? { projectStore: newStore } : {}),
      taskCodePhu: newTaskCodePhu
    });
  });

  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, allTasks, projects);

  return {
    oldCodeToNewCode,
    taskUpdates,
    predecessorUpdates
  };
}
