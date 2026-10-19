import { Task, Project } from '../../types';
import { isTaskBelongsToProject } from '../utils';
import { parsePredecessors } from './predecessorParsingAndCascades';

/**
 * Extracts a numeric subtask index from any taskCodePhu representation.
 * Supports "#13", "L3-304#13", "L3-304-13", "CP-01-2", "HN-TKV-SMZ2-85", "Task 13", "13", etc.
 */
export function extractSubtaskIndex(codeOrPhu?: string | null): number | null {
  if (!codeOrPhu) return null;
  const str = String(codeOrPhu).trim();
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
 * Sorts tasks prioritizing predecessor dependency relationships and computed dates.
 * If Task B depends on Task A, Task A will always be positioned before Task B.
 */
export function sortTasksByPredecessorsAndDates(
  groupTasks: Task[], 
  projects: Project[] = [], 
  allTasks: Task[] = []
): Task[] {
  if (!Array.isArray(groupTasks) || groupTasks.length <= 1) return groupTasks || [];
  
  const pool = groupTasks.length > 0 ? groupTasks : (allTasks.length > 0 ? allTasks : []);
  const taskNoMap = buildTaskNoMap(projects, pool);
  const taskMap = new Map<string, Task>();
  groupTasks.forEach(t => { if (t && t.id) taskMap.set(t.id, t); });

  const adjMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const undirectedAdj = new Map<string, Set<string>>();

  groupTasks.forEach(t => {
    adjMap.set(t.id, []);
    inDegree.set(t.id, 0);
    undirectedAdj.set(t.id, new Set());
  });

  groupTasks.forEach(t => {
    if (t.predecessor && t.predecessor.trim()) {
      const parsed = parsePredecessors(t.predecessor, taskNoMap, t);
      parsed.forEach(pObj => {
        if (pObj?.task && pObj.task.id && pObj.task.id !== t.id && taskMap.has(pObj.task.id)) {
          const u = pObj.task.id;
          const v = t.id;
          const neighbors = adjMap.get(u) || [];
          if (!neighbors.includes(v)) {
            neighbors.push(v);
            adjMap.set(u, neighbors);
            inDegree.set(v, (inDegree.get(v) || 0) + 1);
          }
          undirectedAdj.get(u)?.add(v);
          undirectedAdj.get(v)?.add(u);
        }
      });
    }
  });

  const visited = new Set<string>();
  const components: Task[][] = [];

  groupTasks.forEach(t => {
    if (visited.has(t.id)) return;

    const compTasks: Task[] = [];
    const queue = [t.id];
    visited.add(t.id);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const currTask = taskMap.get(currId);
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
      groupTasks.forEach(other => {
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
          const vTask = taskMap.get(vId);
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
}

export function buildTaskNoMap(projects: Project[], tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const addKey = (t: Task, rawKey?: string | number | null) => {
    if (rawKey === undefined || rawKey === null) return;
    const k = String(rawKey).trim().toLowerCase();
    if (!k) return;
    const existing = map.get(k) || [];
    if (!existing.some(item => item.id === t.id)) {
      existing.push(t);
      map.set(k, existing);
    }
  };

  const taskCodeMap = computeAllTaskCodes(safeProjects, safeTasks);

  safeProjects.forEach((p) => {
    if (!p || p.isDeleted) return;
    const pCode = String(p.code || '').trim();
    if (!pCode) return;

    const pTasks = safeTasks.filter(t => isTaskBelongsToProject(t, p));
    const groupTasks = sortGroupTasks(pTasks);
    groupTasks.forEach((t, i) => {
      if (!t) return;
      const computed = taskCodeMap.get(t.id) || t.taskCodePhu || `${pCode}#${i + 1}`;
      if (computed) {
        addKey(t, computed);
        if (computed.includes('#')) addKey(t, computed.replace('#', '-'));
        if (computed.includes('-')) addKey(t, computed.replace(/-(\d+)$/, '#$1'));
      }

      if (t.taskCodePhu) {
        addKey(t, t.taskCodePhu);
        if (t.taskCodePhu.includes('#')) addKey(t, t.taskCodePhu.replace('#', '-'));
        if (t.taskCodePhu.includes('-')) addKey(t, t.taskCodePhu.replace(/-(\d+)$/, '#$1'));
      }

      addKey(t, `${pCode}#${i + 1}`);
      addKey(t, `${pCode}-${i + 1}`);
      addKey(t, `#${i + 1}`);

      if (t.orderIndex !== undefined && t.orderIndex !== null) {
        addKey(t, `${pCode}#${Number(t.orderIndex) + 1}`);
        addKey(t, `${pCode}-${Number(t.orderIndex) + 1}`);
        addKey(t, `#${Number(t.orderIndex) + 1}`);
      }

      if (t.id) addKey(t, t.id);
    });
  });

  safeTasks.forEach(t => {
    if (!t || t.isDeleted) return;
    const computed = taskCodeMap.get(t.id) || t.taskCodePhu || '';
    if (computed) {
      addKey(t, computed);
      if (computed.includes('#')) addKey(t, computed.replace('#', '-'));
      if (computed.includes('-')) addKey(t, computed.replace(/-(\d+)$/, '#$1'));
    }
    if (t.taskCodePhu) {
      addKey(t, t.taskCodePhu);
      if (t.taskCodePhu.includes('#')) addKey(t, t.taskCodePhu.replace('#', '-'));
      if (t.taskCodePhu.includes('-')) addKey(t, t.taskCodePhu.replace(/-(\d+)$/, '#$1'));
    }
    if (t.orderIndex !== undefined && t.orderIndex !== null && t.projectCode) {
      addKey(t, `${t.projectCode}#${Number(t.orderIndex) + 1}`);
      addKey(t, `${t.projectCode}-${Number(t.orderIndex) + 1}`);
    }
    if (t.id) addKey(t, t.id);
  });

  return map;
}

export function computeTaskCode(projects: Project[], tasks: Task[], task: Task): string {
  if (!task || task.isDeleted) return '';

  const taskPCode = String(task.projectCode || '').trim();
  const taskYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim() : '';
  const taskStore = task.projectStore ? String(task.projectStore).trim().toUpperCase() : '';

  const p =
    (task.projectId ? (projects || []).find(proj => proj && !proj.isDeleted && String(proj.id) === String(task.projectId)) : undefined) ||
    (projects || []).find(proj => proj && !proj.isDeleted && isTaskBelongsToProject(task, proj));

  const currentPCode = p ? String(p.code).trim() : taskPCode;
  
  if (!currentPCode) return '';

  const pTasks = p
    ? (tasks || []).filter(t => isTaskBelongsToProject(t, p))
    : (tasks || []).filter(t => {
        if (!t || t.isDeleted) return false;
        if (!t.projectCode || String(t.projectCode).trim().toLowerCase() !== currentPCode.toLowerCase()) return false;
        const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
        const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
        if (taskYear && tYear && taskYear !== tYear) return false;
        if (taskStore && tStore && taskStore !== tStore) return false;
        return true;
      });
  
  const sorted = sortGroupTasks(pTasks);
  const idx = sorted.findIndex(t => t.id === task.id);
  
  const orderNum = idx !== -1 ? idx + 1 : (task.orderIndex !== undefined ? Number(task.orderIndex) + 1 : 1);

  return `${currentPCode}#${orderNum}`;
}

let _lastProjectsForCodeMapRef: Project[] | null = null;
let _lastTasksForCodeMapRef: Task[] | null = null;
let _cachedTaskCodesMap: Map<string, string> = new Map();

/**
 * Pre-indexes all task codes in O(N log K) single pass instead of O(N^2 log N).
 * Includes reference-level memoization to eliminate recalculations across sibling components.
 */
export function computeAllTaskCodes(projects: Project[], tasks: Task[]): Map<string, string> {
  if (
    _lastProjectsForCodeMapRef === projects &&
    _lastTasksForCodeMapRef === tasks &&
    _cachedTaskCodesMap.size > 0
  ) {
    return _cachedTaskCodesMap;
  }

  const map = new Map<string, string>();
  if (!tasks || !Array.isArray(tasks)) return map;

  const projectMapByScopedCode = new Map<string, Project>();
  const projectMapById = new Map<string, Project>();
  (projects || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if (p.id) projectMapById.set(String(p.id), p);
    if (p.code) {
      const key = `${String(p.code).trim()}-${p.year || ''}-${p.store || ''}`.toLowerCase();
      projectMapByScopedCode.set(key, p);
    }
  });

  const resolveTaskProject = (t: Task): Project | undefined => {
    if (t.projectId) {
      const byId = projectMapById.get(String(t.projectId));
      if (byId && isTaskBelongsToProject(t, byId)) return byId;
    }
    if (t.projectCode) {
      const scopedKey = `${String(t.projectCode).trim()}-${t.projectYear || ''}-${t.projectStore || ''}`.toLowerCase();
      const byScoped = projectMapByScopedCode.get(scopedKey);
      if (byScoped && isTaskBelongsToProject(t, byScoped)) return byScoped;
    }
    return (projects || []).find(proj => proj && !proj.isDeleted && isTaskBelongsToProject(t, proj));
  };

  const tasksByGroupKey = new Map<string, { pCode: string; tasks: Task[] }>();
  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    if (!t || t.isDeleted) continue;
    const p = resolveTaskProject(t);
    const pCode = p ? String(p.code || '').trim() : String(t.projectCode || '').trim();

    if (!pCode) {
      if (t.taskCodePhu && t.taskCodePhu.trim()) {
        map.set(t.id, t.taskCodePhu.trim());
      }
      continue;
    }

    const groupKey = p?.id
      ? `pid:${p.id}`
      : `${pCode}-${p?.year ?? t.projectYear ?? ''}-${p?.store ?? t.projectStore ?? ''}`.toLowerCase();
    
    let entry = tasksByGroupKey.get(groupKey);
    if (!entry) {
      entry = { pCode, tasks: [] };
      tasksByGroupKey.set(groupKey, entry);
    }
    entry.tasks.push(t);
  }

  tasksByGroupKey.forEach(({ pCode, tasks: groupTasks }) => {
    const sorted = sortGroupTasks(groupTasks);
    sorted.forEach((t, i) => {
      const orderNum = i + 1;
      const code = pCode ? `${pCode}#${orderNum}` : (t.taskCodePhu || '');
      map.set(t.id, code);
    });
  });

  _lastProjectsForCodeMapRef = projects;
  _lastTasksForCodeMapRef = tasks;
  _cachedTaskCodesMap = map;
  return map;
}
