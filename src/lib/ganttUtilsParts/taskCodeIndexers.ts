import { Task, Project } from '../../types';
import { isTaskBelongsToProject, normalizeDashes } from '../utils';
import { sortGroupTasks } from './taskSortingAndCodes';

const _taskNoMapWeakCache = new WeakMap<Task[], WeakMap<Project[], Map<string, Task[]>>>();
const EMPTY_PROJECTS_REF: Project[] = [];
const EMPTY_TASKS_REF: Task[] = [];

export function buildTaskNoMap(projects: Project[], tasks: Task[]): Map<string, Task[]> {
  const tasksKey = Array.isArray(tasks) && tasks.length > 0 ? tasks : EMPTY_TASKS_REF;
  const projectsKey = Array.isArray(projects) && projects.length > 0 ? projects : EMPTY_PROJECTS_REF;
  const cachedByProj = _taskNoMapWeakCache.get(tasksKey)?.get(projectsKey);
  if (cachedByProj) {
    return cachedByProj;
  }

  const map = new Map<string, Task[]>();
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const addKey = (t: Task, rawKey?: string | number | null) => {
    if (rawKey === undefined || rawKey === null) return;
    const rawStr = String(rawKey).trim();
    if (!rawStr) return;
    const k = rawStr.toLowerCase();
    const normK = normalizeDashes(k);

    const insert = (key: string) => {
      let existing = map.get(key);
      if (!existing) {
        existing = [t];
        map.set(key, existing);
      } else if (!existing.some(item => item.id === t.id)) {
        existing.push(t);
      }
    };

    insert(k);
    if (normK !== k) insert(normK);
  };

  const taskCodeMap = computeAllTaskCodes(safeProjects, safeTasks);

  // Pre-index tasks by projectId and projectCode parts in O(T) to eliminate O(P * T) scans
  const tasksByProjectId = new Map<string, Task[]>();
  const tasksByCodePart = new Map<string, Task[]>();

  for (let i = 0; i < safeTasks.length; i++) {
    const t = safeTasks[i];
    if (!t || t.isDeleted) continue;
    if (t.projectId) {
      const pid = String(t.projectId).trim();
      let list = tasksByProjectId.get(pid);
      if (!list) {
        list = [];
        tasksByProjectId.set(pid, list);
      }
      list.push(t);
    }
    if (t.projectCode) {
      const tCode = String(t.projectCode).trim().toLowerCase();
      const parts = tCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      const codes = parts.length > 0 ? parts : [tCode];
      for (let cIdx = 0; cIdx < codes.length; cIdx++) {
        const c = codes[cIdx];
        let list = tasksByCodePart.get(c);
        if (!list) {
          list = [];
          tasksByCodePart.set(c, list);
        }
        list.push(t);
      }
    }
  }

  safeProjects.forEach((p) => {
    if (!p || p.isDeleted) return;
    const pCode = String(p.code || '').trim();
    if (!pCode) return;

    const pId = p.id ? String(p.id).trim() : '';
    const pCodeLower = pCode.toLowerCase();
    const rawCodeCombined = (p.linkCodes && p.linkCodes.trim()) ? `${pCodeLower}, ${p.linkCodes.toLowerCase()}` : pCodeLower;
    const pCodeParts = rawCodeCombined.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

    const matchedMap = new Map<string, Task>();
    if (pId) {
      const idTasks = tasksByProjectId.get(pId);
      if (idTasks) {
        for (let i = 0; i < idTasks.length; i++) {
          const t = idTasks[i];
          if (isTaskBelongsToProject(t, p, safeProjects)) {
            matchedMap.set(t.id, t);
          }
        }
      }
    }
    for (let i = 0; i < pCodeParts.length; i++) {
      const candTasks = tasksByCodePart.get(pCodeParts[i]);
      if (candTasks) {
        for (let j = 0; j < candTasks.length; j++) {
          const t = candTasks[j];
          if (!matchedMap.has(t.id) && isTaskBelongsToProject(t, p, safeProjects)) {
            matchedMap.set(t.id, t);
          }
        }
      }
    }

    const pTasks = Array.from(matchedMap.values());
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

      const explicitSubMatch = String(t.taskCodePhu || '').trim().match(/[#-](\d+)$/);
      const explicitSubNum = explicitSubMatch ? parseInt(explicitSubMatch[1], 10) : null;

      if (explicitSubNum !== null && !isNaN(explicitSubNum) && explicitSubNum !== i + 1) {
        addKey(t, `${pCode}#${explicitSubNum}`);
        addKey(t, `${pCode}-${explicitSubNum}`);
        addKey(t, `#${explicitSubNum}`);
      } else if (t.orderIndex !== undefined && t.orderIndex !== null && Number(t.orderIndex) !== i) {
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
    const explicitSubMatch = String(t.taskCodePhu || '').trim().match(/[#-](\d+)$/);
    if (!explicitSubMatch && t.orderIndex !== undefined && t.orderIndex !== null && t.projectCode) {
      addKey(t, `${t.projectCode}#${Number(t.orderIndex) + 1}`);
      addKey(t, `${t.projectCode}-${Number(t.orderIndex) + 1}`);
    }
    if (t.id) addKey(t, t.id);
  });

  let projCache = _taskNoMapWeakCache.get(tasksKey);
  if (!projCache) {
    projCache = new WeakMap<Project[], Map<string, Task[]>>();
    _taskNoMapWeakCache.set(tasksKey, projCache);
  }
  projCache.set(projectsKey, map);
  return map;
}

export function computeTaskCode(projects: Project[], tasks: Task[], task: Task): string {
  if (!task || task.isDeleted) return '';

  const allCodes = computeAllTaskCodes(projects || [], tasks || []);
  const fastCode = allCodes.get(task.id);
  if (fastCode) return fastCode;

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

const _taskCodesWeakCache = new WeakMap<Task[], WeakMap<Project[], Map<string, string>>>();

/**
 * Pre-indexes all task codes in O(N log K) single pass instead of O(N^2 log N).
 * Uses WeakMap reference caching across multiple task/project array views (storeTasks, pool, filteredTasks).
 */
export function computeAllTaskCodes(projects: Project[], tasks: Task[]): Map<string, string> {
  const tasksKey = Array.isArray(tasks) && tasks.length > 0 ? tasks : EMPTY_TASKS_REF;
  const projectsKey = Array.isArray(projects) && projects.length > 0 ? projects : EMPTY_PROJECTS_REF;
  const cachedByProj = _taskCodesWeakCache.get(tasksKey)?.get(projectsKey);
  if (cachedByProj) {
    return cachedByProj;
  }

  const map = new Map<string, string>();
  if (!tasks || !Array.isArray(tasks)) return map;

  const projectMapByScopedCode = new Map<string, Project>();
  const projectMapById = new Map<string, Project>();
  const projectsByCodePart = new Map<string, Project[]>();

  (projects || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if (p.id) projectMapById.set(String(p.id).trim(), p);
    if (p.code) {
      const pCodeClean = String(p.code).trim();
      const key = `${pCodeClean}-${p.year || ''}-${p.store || ''}`.toLowerCase();
      projectMapByScopedCode.set(key, p);

      const rawCombined = (p.linkCodes && p.linkCodes.trim())
        ? `${pCodeClean.toLowerCase()}, ${p.linkCodes.toLowerCase()}`
        : pCodeClean.toLowerCase();
      const parts = rawCombined.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const c = parts[i];
        let list = projectsByCodePart.get(c);
        if (!list) {
          list = [];
          projectsByCodePart.set(c, list);
        }
        list.push(p);
      }
    }
  });

  const resolveTaskProject = (t: Task): Project | undefined => {
    if (t.projectId) {
      const byId = projectMapById.get(String(t.projectId).trim());
      if (byId && isTaskBelongsToProject(t, byId, projects)) return byId;
    }
    if (t.projectCode) {
      const tCodeClean = String(t.projectCode).trim();
      const scopedKey = `${tCodeClean}-${t.projectYear || ''}-${t.projectStore || ''}`.toLowerCase();
      const byScoped = projectMapByScopedCode.get(scopedKey);
      if (byScoped && isTaskBelongsToProject(t, byScoped, projects)) return byScoped;

      const tCodeParts = tCodeClean.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      for (let i = 0; i < tCodeParts.length; i++) {
        const candidates = projectsByCodePart.get(tCodeParts[i]);
        if (candidates) {
          for (let j = 0; j < candidates.length; j++) {
            if (isTaskBelongsToProject(t, candidates[j], projects)) {
              return candidates[j];
            }
          }
        }
      }
    }
    return undefined;
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

  let projCache = _taskCodesWeakCache.get(tasksKey);
  if (!projCache) {
    projCache = new WeakMap<Project[], Map<string, string>>();
    _taskCodesWeakCache.set(tasksKey, projCache);
  }
  projCache.set(projectsKey, map);
  return map;
}
