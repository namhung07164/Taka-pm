import { Task, Project } from '../../types';
import { normalizeDashes } from '../utils';
import { parsePredecessors } from './predecessorParsingAndCascades';
import { buildTaskNoMap, computeTaskCode, computeAllTaskCodes } from './taskCodeIndexers';

export { buildTaskNoMap, computeTaskCode, computeAllTaskCodes };

/**
 * Extracts a numeric subtask index from any taskCodePhu representation.
 * Supports "#13", "L3-304#13", "L3-304-13", "CP-01-2", "HN-TKV-SMZ2-85", "Task 13", "13", etc.
 */
export function extractSubtaskIndex(codeOrPhu?: string | null): number | null {
  if (!codeOrPhu) return null;
  const str = normalizeDashes(String(codeOrPhu)).trim();
  if (!str) return null;

  const hashMatch = str.match(/#\s*(\d+)/);
  if (hashMatch) {
    const num = parseInt(hashMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  const delimiterMatch = str.match(/[-_.:/\s]+(\d+)\s*$/);
  if (delimiterMatch) {
    const num = parseInt(delimiterMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    if (!isNaN(num)) return num;
  }

  const prefixMatch = str.match(/(?:task|step|no\.?|t)\s*[-#.:]?\s*(\d+)/i);
  if (prefixMatch) {
    const num = parseInt(prefixMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  const trailingDigitsMatch = str.match(/(\d+)\s*$/);
  if (trailingDigitsMatch) {
    const num = parseInt(trailingDigitsMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  return null;
}

export function sortGroupTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    const valAOrder = a.orderIndex !== undefined && a.orderIndex !== null ? Number(a.orderIndex) : null;
    const valBOrder = b.orderIndex !== undefined && b.orderIndex !== null ? Number(b.orderIndex) : null;

    if (valAOrder !== null && valBOrder !== null && valAOrder !== valBOrder) {
      return valAOrder - valBOrder;
    }
    if (valAOrder !== null && valBOrder === null) return -1;
    if (valAOrder === null && valBOrder !== null) return 1;

    const codeA = a.taskCodePhu || (a.projectCode && a.orderIndex !== undefined ? `${a.projectCode}#${a.orderIndex + 1}` : a.name || '');
    const codeB = b.taskCodePhu || (b.projectCode && b.orderIndex !== undefined ? `${b.projectCode}#${b.orderIndex + 1}` : b.name || '');
    const numA = extractSubtaskIndex(codeA);
    const numB = extractSubtaskIndex(codeB);

    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
    } else if (numA !== null && numB === null) {
      return -1;
    } else if (numA === null && numB !== null) {
      return 1;
    }

    if (codeA && codeB && codeA !== codeB) {
      const codeCmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      if (codeCmp !== 0) return codeCmp;
    }

    const startA = a.start || '';
    const startB = b.start || '';
    if (startA && startB && startA !== startB) {
      return startA.localeCompare(startB);
    }
    const finishA = a.finish || '';
    const finishB = b.finish || '';
    if (finishA && finishB && finishA !== finishB) {
      return finishA.localeCompare(finishB);
    }

    const nameA = a.name || '';
    const nameB = b.name || '';
    if (nameA && nameB && nameA !== nameB) {
      const nameCmp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
    }

    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Sorts tasks prioritizing predecessor dependency relationships and computed dates,
 * while preserving parent-child hierarchy (child tasks are sorted and placed immediately after their parent task).
 */
export function sortTasksByPredecessorsAndDates(
  groupTasks: Task[], 
  projects: Project[] = [], 
  allTasks: Task[] = []
): Task[] {
  if (!Array.isArray(groupTasks) || groupTasks.length <= 1) return groupTasks || [];

  const pool = groupTasks.length > 0 ? groupTasks : (allTasks.length > 0 ? allTasks : []);
  const taskNoMap = buildTaskNoMap(projects, pool);
  const taskById = new Map<string, Task>();
  const taskByCodeLower = new Map<string, Task>();

  const initialOrdered = sortGroupTasks(groupTasks);
  initialOrdered.forEach((t, idx) => {
    if (!t || !t.id) return;
    taskById.set(t.id, t);
    taskById.set(String(t.id).trim().toLowerCase(), t);
    if (t.taskCodePhu) {
      taskByCodeLower.set(String(t.taskCodePhu).trim().toLowerCase(), t);
    }
    if (t.projectCode) {
      taskByCodeLower.set(`${String(t.projectCode).trim()}#${idx + 1}`.toLowerCase(), t);
    }
    taskByCodeLower.set(`#${idx + 1}`, t);
  });

  // Identify parent-child hierarchy within groupTasks
  const childrenByParentId = new Map<string, Task[]>();
  const resolvedParentIdByChildId = new Map<string, string>();

  groupTasks.forEach(t => {
    if (!t || !t.id) return;
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return;
    const rawParentLower = String(rawParent).trim().toLowerCase();
    const parentTask = taskById.get(String(rawParent).trim()) || taskById.get(rawParentLower) || taskByCodeLower.get(rawParentLower);
    if (parentTask && parentTask.id !== t.id) {
      resolvedParentIdByChildId.set(t.id, parentTask.id);
      const list = childrenByParentId.get(parentTask.id) || [];
      list.push(t.parentTaskId === parentTask.id ? t : { ...t, parentTaskId: parentTask.id });
      childrenByParentId.set(parentTask.id, list);
    }
  });

  const sortFlatTaskSubset = (subset: Task[]): Task[] => {
    if (subset.length <= 1) return subset;
    const subsetMap = new Map<string, Task>();
    subset.forEach(t => { if (t && t.id) subsetMap.set(t.id, t); });

    const adjMap = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const undirectedAdj = new Map<string, Set<string>>();

    subset.forEach(t => {
      adjMap.set(t.id, []);
      inDegree.set(t.id, 0);
      undirectedAdj.set(t.id, new Set());
    });

    subset.forEach(t => {
      // Skip auto-rollup SS/FF predecessor string on parent tasks so parents don't depend on their own children
      const isParentTask = childrenByParentId.has(t.id) || Boolean(t.isModularParent);
      if (isParentTask) return;

      if (t.predecessor && t.predecessor.trim()) {
        const parsed = parsePredecessors(t.predecessor, taskNoMap, t);
        parsed.forEach(pObj => {
          if (pObj?.task && pObj.task.id && pObj.task.id !== t.id) {
            // If dependency points to a child of another root task while sorting roots, lift to its root parent
            let u = pObj.task.id;
            if (!subsetMap.has(u)) {
              const parentOfU = resolvedParentIdByChildId.get(u);
              if (parentOfU && subsetMap.has(parentOfU)) {
                u = parentOfU;
              }
            }
            const v = t.id;
            if (u !== v && subsetMap.has(u)) {
              const neighbors = adjMap.get(u) || [];
              if (!neighbors.includes(v)) {
                neighbors.push(v);
                adjMap.set(u, neighbors);
                inDegree.set(v, (inDegree.get(v) || 0) + 1);
              }
              undirectedAdj.get(u)?.add(v);
              undirectedAdj.get(v)?.add(u);
            }
          }
        });
      }
    });

    const visited = new Set<string>();
    const components: Task[][] = [];

    subset.forEach(t => {
      if (visited.has(t.id)) return;

      const compTasks: Task[] = [];
      const queue = [t.id];
      visited.add(t.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currTask = subsetMap.get(currId);
        if (currTask) compTasks.push(currTask);

        const neighbors = undirectedAdj.get(currId);
        if (neighbors) {
          neighbors.forEach(neighborId => {
            if (!visited.has(neighborId)) {
              visited.add(neighborId);
              queue.push(neighborId);
            }
          });
        }
      }
      components.push(compTasks);
    });

    const compareTasks = (a: Task, b: Task) => {
      const startA = a.start || '9999-12-31';
      const startB = b.start || '9999-12-31';
      if (startA !== startB) return startA < startB ? -1 : 1;
      
      const finishA = a.finish || '9999-12-31';
      const finishB = b.finish || '9999-12-31';
      if (finishA !== finishB) return finishA < finishB ? -1 : 1;

      const ordA = a.orderIndex !== undefined ? a.orderIndex : 0;
      const ordB = b.orderIndex !== undefined ? b.orderIndex : 0;
      if (ordA !== ordB) return ordA - ordB;

      return String(a.id || '').localeCompare(String(b.id || ''));
    };

    const sortedComponents = components.map(compTasks => {
      if (compTasks.length <= 1) return compTasks;

      const compSet = new Set(compTasks.map(ct => ct.id));
      const compInDegree = new Map<string, number>();
      compTasks.forEach(ct => {
        let deg = 0;
        subset.forEach(other => {
          if (compSet.has(other.id) && other.id !== ct.id) {
            const neighbors = adjMap.get(other.id) || [];
            if (neighbors.includes(ct.id)) deg++;
          }
        });
        compInDegree.set(ct.id, deg);
      });

      const ready: Task[] = compTasks.filter(ct => (compInDegree.get(ct.id) || 0) === 0);
      ready.sort(compareTasks);

      const compResult: Task[] = [];
      const compProcessed = new Set<string>();

      while (ready.length > 0) {
        const u = ready.shift()!;
        compResult.push(u);
        compProcessed.add(u.id);

        const neighbors = adjMap.get(u.id) || [];
        let newlyReady = false;
        for (const vId of neighbors) {
          if (!compSet.has(vId)) continue;
          const currentDeg = (compInDegree.get(vId) || 0) - 1;
          compInDegree.set(vId, currentDeg);
          if (currentDeg === 0 && !compProcessed.has(vId)) {
            const vTask = subsetMap.get(vId);
            if (vTask) {
              ready.push(vTask);
              newlyReady = true;
            }
          }
        }
        if (newlyReady) {
          ready.sort(compareTasks);
        }
      }

      if (compResult.length < compTasks.length) {
        const remaining = compTasks.filter(ct => !compProcessed.has(ct.id));
        remaining.sort(compareTasks);
        compResult.push(...remaining);
      }

      return compResult;
    });

    sortedComponents.sort((compA, compB) => {
      const rootA = compA[0];
      const rootB = compB[0];
      if (!rootA && !rootB) return 0;
      if (!rootA) return 1;
      if (!rootB) return -1;
      return compareTasks(rootA, rootB);
    });

    return sortedComponents.flat();
  };

  // If no parent-child tasks exist in groupTasks, sort flat directly
  if (childrenByParentId.size === 0) {
    return sortFlatTaskSubset(groupTasks);
  }

  // Sort root tasks, and immediately place each parent's sorted children right after their parent
  const rootTasks = groupTasks.filter(t => t && t.id && !resolvedParentIdByChildId.has(t.id));
  const sortedRoots = sortFlatTaskSubset(rootTasks);

  const finalResult: Task[] = [];
  const emittedIds = new Set<string>();

  const emitWithChildren = (task: Task) => {
    if (!task || !task.id || emittedIds.has(task.id)) return;
    emittedIds.add(task.id);
    finalResult.push(task);
    const children = childrenByParentId.get(task.id);
    if (children && children.length > 0) {
      const sortedChildren = sortFlatTaskSubset(children);
      sortedChildren.forEach(child => emitWithChildren(child));
    }
  };

  sortedRoots.forEach(root => emitWithChildren(root));
  groupTasks.forEach(t => {
    if (t && t.id && !emittedIds.has(t.id)) {
      emitWithChildren(t);
    }
  });

  return finalResult;
}
