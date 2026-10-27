import { Task, Project } from '../types';
import { doc, collection, getDocs } from 'firebase/firestore';
import { writeBatch } from './firestoreWrites';
import { db, APP_ID } from './firebase';

/**
 * Normalizes a store code (e.g. "hn" -> "HN", "hcm" -> "HCM").
 */
export function normalizeStoreCode(store?: string | null): string {
  if (!store) return '';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH')) return 'HCM';
  return s;
}

/**
 * Normalizes a year value to string (e.g. 2027 or "2027" -> "2027").
 */
export function normalizeYearString(year?: string | number | null): string {
  if (year === undefined || year === null || year === '') return '';
  return String(year).trim();
}

/**
 * Normalizes a task name for reliable duplicate comparison.
 * Treats task name as an absolute value:
 * 1. Trims leading and trailing whitespace
 * 2. Lowercases
 * 3. Collapses multiple consecutive spaces to a single space
 * NEVER strips projectCode, numbers, or dashes ("-") so that
 * tasks like "FFD", "FFD-1", and "1" are recognized as distinct absolute names.
 */
export function normalizeTaskNameForComparison(name?: string | null, _projectCode?: string | null): string {
  if (!name) return '';
  return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
}

const EMPTY_PROJECTS: Project[] = [];

/**
 * Builds a canonical project key for a task or project.
 */
export function buildCanonicalProjectKey(
  projectCode?: string | null,
  year?: string | number | null,
  store?: string | null,
  projects: Project[] = EMPTY_PROJECTS,
  projectLookupMap?: Map<string, Project>,
  projectId?: string | null
): string {
  if (projectId) {
    return `proj_${String(projectId).trim().toLowerCase()}`;
  }

  const pCode = String(projectCode || '').trim().toLowerCase();
  if (!pCode) return '';

  const normStore = normalizeStoreCode(store);
  const normYear = normalizeYearString(year);

  let matchedProj: Project | undefined = undefined;
  if (projectLookupMap) {
    let candidate: Project | undefined;
    if (normYear && normStore && projectLookupMap.has(`${pCode}__${normYear}__${normStore}`)) {
      candidate = projectLookupMap.get(`${pCode}__${normYear}__${normStore}`);
    } else if (!normYear && normStore && projectLookupMap.has(`${pCode}____${normStore}`)) {
      candidate = projectLookupMap.get(`${pCode}____${normStore}`);
    } else if (normYear && !normStore && projectLookupMap.has(`${pCode}__${normYear}__`)) {
      candidate = projectLookupMap.get(`${pCode}__${normYear}__`);
    } else if (!normYear && !normStore) {
      candidate = projectLookupMap.get(pCode);
    }
    if (candidate) {
      const cStore = normalizeStoreCode(candidate.store);
      const cYear = normalizeYearString(candidate.year);
      if ((!normStore || !cStore || normStore === cStore) && (!normYear || !cYear || normYear === cYear)) {
        matchedProj = candidate;
      }
    }
  } else if (projects && projects.length > 0) {
    matchedProj = projects.find(p => {
      const pCodeMatch = String(p.code || '').trim().toLowerCase() === pCode ||
                         String(p.id || '').trim().toLowerCase() === pCode ||
                         String(p.no || '').trim().toLowerCase() === pCode;
      if (!pCodeMatch) return false;
      const pStore = normalizeStoreCode(p.store);
      const pYear = normalizeYearString(p.year);
      if (normStore && pStore && normStore !== pStore) return false;
      if (normYear && pYear && normYear !== pYear) return false;
      return true;
    });
  }

  const canonicalCode = matchedProj ? String(matchedProj.code || pCode).trim().toLowerCase() : pCode;
  const canonicalYear = normYear || normalizeYearString(matchedProj?.year);
  const canonicalStore = normStore || normalizeStoreCode(matchedProj?.store);

  return `${canonicalCode}__${canonicalYear}__${canonicalStore}`;
}

const _dedupWeakCache = new WeakMap<Task[], {
  dedupedTasks: Task[];
  duplicateCount: number;
  removedTaskIds: string[];
}>();

/**
 * Deduplicates a list of tasks in-memory.
 * If multiple tasks exist with the same project and same task name (case-insensitive or normalized)
 * or same task code, it merges them keeping the most complete / latest updated task.
 */
export function deduplicateTasksInMemory(tasks: Task[], projects: Project[] = EMPTY_PROJECTS): {
  dedupedTasks: Task[];
  duplicateCount: number;
  removedTaskIds: string[];
} {
  if (!tasks || tasks.length === 0) {
    return { dedupedTasks: [], duplicateCount: 0, removedTaskIds: [] };
  }
  if (tasks.length === 1) {
    return { dedupedTasks: tasks, duplicateCount: 0, removedTaskIds: [] };
  }
  if (!projects || projects.length <= 1) {
    const cached = _dedupWeakCache.get(tasks);
    if (cached) return cached;
  }

  // Pre-index projects into Map for O(1) canonical key resolution
  const projectLookupMap = new Map<string, Project>();
  (projects || []).forEach(p => {
    const pCode = String(p.code || '').trim().toLowerCase();
    const pStore = normalizeStoreCode(p.store);
    const pYear = normalizeYearString(p.year);
    if (pCode) {
      if (pYear && pStore) projectLookupMap.set(`${pCode}__${pYear}__${pStore}`, p);
      if (pStore) projectLookupMap.set(`${pCode}____${pStore}`, p);
      if (pYear) projectLookupMap.set(`${pCode}__${pYear}__`, p);
      if (!projectLookupMap.has(pCode)) projectLookupMap.set(pCode, p);
    }
    const pNo = String(p.no || '').trim().toLowerCase();
    if (pNo) {
      if (pYear && pStore) projectLookupMap.set(`${pNo}__${pYear}__${pStore}`, p);
      if (pStore) projectLookupMap.set(`${pNo}____${pStore}`, p);
      if (pYear) projectLookupMap.set(`${pNo}__${pYear}__`, p);
      if (!projectLookupMap.has(pNo)) projectLookupMap.set(pNo, p);
    }
    if (p.id) projectLookupMap.set(String(p.id).trim().toLowerCase(), p);
  });

  const seenMap = new Map<string, Task>();
  const seenNormMap = new Map<string, string>(); // normKey -> taskId
  const idRedirectMap = new Map<string, string>(); // duplicateId -> survivingId
  const removedTaskIds: string[] = [];
  let duplicateCount = 0;

  // Pre-compute updatedAt numeric timestamps, canonical project keys, and parent lookup maps in O(N)
  const updatedTimeCache = new WeakMap<Task, number>();
  const projKeyCache = new WeakMap<Task, string>();
  const taskByIdLower = new Map<string, Task>();
  const taskByScopedCode = new Map<string, Task>();
  const taskNameByIdMap = new Map<string, string>();

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || t.isDeleted) continue;
    const tProjIdStr = t.projectId ? String(t.projectId).trim().toLowerCase() : '';
    const pKey = buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects, projectLookupMap, tProjIdStr);
    projKeyCache.set(t, pKey);

    if (t.id) {
      const idL = String(t.id).trim().toLowerCase();
      if (!taskByIdLower.has(idL) || !(t as any)._isVirtualSummary) {
        taskByIdLower.set(idL, t);
      }
      if (t.name) {
        taskNameByIdMap.set(idL, normalizeTaskNameForComparison(t.name));
      }
    }
    if (pKey) {
      if (t.taskCodePhu) {
        const rawC = String(t.taskCodePhu).trim().toLowerCase().replace(/^\d+\s+/, '');
        if (rawC) {
          taskByScopedCode.set(`${pKey}:::${rawC}`, t);
          if (rawC.includes('-')) {
            taskByScopedCode.set(`${pKey}:::${rawC.replace(/-(\d+)$/, '#$1')}`, t);
          }
          const m = rawC.match(/#(\d+)$/) || rawC.match(/-(\d+)$/) || rawC.match(/^(\d+)$/);
          if (m) {
            taskByScopedCode.set(`${pKey}:::#${m[1]}`, t);
            taskByScopedCode.set(`${pKey}:::${m[1]}`, t);
          }
        }
      }
      if (t.orderIndex !== undefined && t.orderIndex !== null && !Number.isNaN(Number(t.orderIndex))) {
        const ordNum = Number(t.orderIndex) + 1;
        if (!taskByScopedCode.has(`${pKey}:::#${ordNum}`)) taskByScopedCode.set(`${pKey}:::#${ordNum}`, t);
        if (!taskByScopedCode.has(`${pKey}:::${ordNum}`)) taskByScopedCode.set(`${pKey}:::${ordNum}`, t);
      }
    }
    if (t.updatedAt) {
      const parsed = Date.parse(t.updatedAt);
      updatedTimeCache.set(t, Number.isNaN(parsed) ? 0 : parsed);
    }
  }

  // Identify valid parent references and active parent tasks in O(N)
  const validParentByTask = new WeakMap<Task, Task>();
  const activeParentIdsLower = new Set<string>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || t.isDeleted) continue;
    const rawPar = t.parentTaskId || (t as any).parentId;
    if (!rawPar) continue;
    const parLower = String(rawPar).trim().toLowerCase();
    if (!parLower) continue;
    const pKey = projKeyCache.get(t) || '';
    let matchedPar = taskByIdLower.get(parLower);
    if (matchedPar && pKey && projKeyCache.get(matchedPar) && projKeyCache.get(matchedPar) !== pKey) {
      matchedPar = undefined;
    }
    if (!matchedPar && pKey) {
      matchedPar =
        taskByScopedCode.get(`${pKey}:::${parLower}`) ||
        taskByScopedCode.get(`${pKey}:::${parLower.replace(/-(\d+)$/, '#$1')}`);
      if (!matchedPar) {
        const m = parLower.match(/#\s*(\d+)$/) || parLower.match(/^(\d+)$/);
        if (m) {
          matchedPar = taskByScopedCode.get(`${pKey}:::#${m[1]}`) || taskByScopedCode.get(`${pKey}:::${m[1]}`);
        }
      }
    }
    if (matchedPar && matchedPar.id && String(matchedPar.id).trim().toLowerCase() !== String(t.id || '').trim().toLowerCase()) {
      validParentByTask.set(t, matchedPar);
      activeParentIdsLower.add(String(matchedPar.id).trim().toLowerCase());
    }
  }

  // Sort tasks so parents are deduplicated before subtasks, and subtasks with valid parents win over orphaned duplicates
  const sorted = [...tasks].sort((a, b) => {
    if (a.isDeleted && !b.isDeleted) return 1;
    if (!a.isDeleted && b.isDeleted) return -1;
    const aVirt = Boolean((a as any)._isVirtualSummary);
    const bVirt = Boolean((b as any)._isVirtualSummary);
    if (aVirt !== bVirt) return aVirt ? 1 : -1;
    const aIdL = String(a.id || '').trim().toLowerCase();
    const bIdL = String(b.id || '').trim().toLowerCase();
    const aIsParent = activeParentIdsLower.has(aIdL);
    const bIsParent = activeParentIdsLower.has(bIdL);
    if (aIsParent !== bIsParent) return aIsParent ? -1 : 1;
    const aHasValidParent = validParentByTask.has(a);
    const bHasValidParent = validParentByTask.has(b);
    if (aHasValidParent !== bHasValidParent) return aHasValidParent ? -1 : 1;
    const aComments = a.comments?.length || 0;
    const bComments = b.comments?.length || 0;
    if (aComments !== bComments) return bComments - aComments;
    const aNotes = a.notes?.length || 0;
    const bNotes = b.notes?.length || 0;
    if (aNotes !== bNotes) return bNotes - aNotes;
    if (a.delegation && !b.delegation) return -1;
    if (!a.delegation && b.delegation) return 1;
    if (a.predecessor && !b.predecessor) return -1;
    if (!a.predecessor && b.predecessor) return 1;
    if (a.party && !b.party) return -1;
    if (!a.party && b.party) return 1;
    const aTime = updatedTimeCache.get(a) || 0;
    const bTime = updatedTimeCache.get(b) || 0;
    if (bTime !== aTime) return bTime - aTime;
    return String(a.id).localeCompare(String(b.id));
  });

  sorted.forEach(task => {
    if (task.isDeleted) return;

    if ((!task.name || !String(task.name).trim()) && (!task.start || !String(task.start).trim()) && (!task.finish || !String(task.finish).trim())) {
      duplicateCount++;
      if (task.id) removedTaskIds.push(task.id);
      return;
    }

    const taskIdStr = String(task.id || '').trim();
    if (!taskIdStr) {
      duplicateCount++;
      return;
    }

    if (seenMap.has(taskIdStr)) {
      duplicateCount++;
      removedTaskIds.push(task.id);
      return;
    }

    const projKey = projKeyCache.get(task) || buildCanonicalProjectKey(task.projectCode, task.projectYear, task.projectStore, projects, projectLookupMap, task.projectId ? String(task.projectId).trim().toLowerCase() : '');
    const cleanCodePhu = String(task.taskCodePhu || '').trim().toLowerCase().replace(/^\d+\s+/, '');
    const exactName = normalizeTaskNameForComparison(task.name);
    const startStr = String(task.start || '').trim();
    const finishStr = String(task.finish || '').trim();

    const validPar = validParentByTask.get(task);
    const rawParLower = validPar?.id ? String(validPar.id).trim().toLowerCase() : '';
    const resolvedParentLower = rawParLower ? (idRedirectMap.get(rawParLower) || rawParLower) : '';
    const parentIdentity = resolvedParentLower
      ? (taskNameByIdMap.get(resolvedParentLower) || taskNameByIdMap.get(rawParLower) || resolvedParentLower)
      : 'root';

    const taskUniqueSignature = `${projKey}__${cleanCodePhu || 'nocode'}__${exactName}__${startStr}__${finishStr}`;
    const taskContentSignature = `${projKey}__parent:${parentIdentity}__${exactName}__${startStr}__${finishStr}`;
    const taskNameDatesSignature = `${projKey}__namedates:${exactName}__${startStr}__${finishStr}`;

    const matchedExistingId = (projKey && exactName)
      ? ((cleanCodePhu ? seenNormMap.get(taskUniqueSignature) : undefined) ||
         seenNormMap.get(taskContentSignature) ||
         seenNormMap.get(taskNameDatesSignature))
      : undefined;

    if (matchedExistingId && seenMap.has(matchedExistingId)) {
      const existing = seenMap.get(matchedExistingId)!;
      if (task.projectId && existing.projectId && String(task.projectId) !== String(existing.projectId)) {
        seenMap.set(task.id, task);
        return;
      }

      const tYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim() : '';
      const eYear = existing.projectYear !== undefined && existing.projectYear !== null ? String(existing.projectYear).trim() : '';
      const tStore = task.projectStore ? String(task.projectStore).trim().toUpperCase() : '';
      const eStore = existing.projectStore ? String(existing.projectStore).trim().toUpperCase() : '';

      if (tYear && eYear && tYear !== eYear) {
        seenMap.set(task.id, task);
        return;
      }
      if (tStore && eStore && tStore !== eStore) {
        seenMap.set(task.id, task);
        return;
      }

      const existingIdLower = String(existing.id || '').trim().toLowerCase();
      const taskIdLower = taskIdStr.toLowerCase();
      const existingValidPar = validParentByTask.get(existing);
      const eRawParLower = existingValidPar?.id ? String(existingValidPar.id).trim().toLowerCase() : '';
      const eResolvedParLower = eRawParLower ? (idRedirectMap.get(eRawParLower) || eRawParLower) : '';

      // Never merge a child task into its own parent task
      if (resolvedParentLower === existingIdLower || eResolvedParLower === taskIdLower) {
        seenMap.set(task.id, task);
        return;
      }

      // If BOTH tasks have valid existing parents in the project, only keep both if their parents are genuinely distinct tasks
      if (resolvedParentLower && eResolvedParLower && resolvedParentLower !== eResolvedParLower) {
        const tParName = taskNameByIdMap.get(resolvedParentLower) || taskNameByIdMap.get(rawParLower);
        const eParName = taskNameByIdMap.get(eResolvedParLower) || taskNameByIdMap.get(eRawParLower);
        if (!tParName || !eParName || tParName !== eParName) {
          seenMap.set(task.id, task);
          return;
        }
      }

      // If one task is an active parent of subtasks and the other is a subtask with a valid parent, do not merge them
      if (activeParentIdsLower.has(taskIdLower) && Boolean(eResolvedParLower) !== Boolean(resolvedParentLower)) {
        seenMap.set(task.id, task);
        return;
      }

      // Duplicate task found!
      duplicateCount++;
      removedTaskIds.push(task.id);
      idRedirectMap.set(taskIdLower, existingIdLower);
      idRedirectMap.set(taskIdStr, String(existing.id).trim());

      if ((!existing.comments || existing.comments.length === 0) && task.comments && task.comments.length > 0) {
        existing.comments = task.comments;
      }
      if ((!existing.notes || existing.notes.length === 0) && task.notes && task.notes.length > 0) {
        existing.notes = task.notes;
      }
      if (!existing.party && task.party) existing.party = task.party;
      if (!existing.predecessor && task.predecessor) existing.predecessor = task.predecessor;
      if (!existing.delegation && task.delegation) existing.delegation = task.delegation;
      if (!existing.taskCodePhu && task.taskCodePhu) existing.taskCodePhu = task.taskCodePhu;
      if (!existingValidPar && validPar && validPar.id) {
        existing.parentTaskId = validPar.id;
        validParentByTask.set(existing, validPar);
      }
    } else {
      seenMap.set(task.id, task);
      if (projKey && exactName) {
        if (cleanCodePhu) seenNormMap.set(taskUniqueSignature, task.id);
        seenNormMap.set(taskContentSignature, task.id);
        if (!seenNormMap.has(taskNameDatesSignature)) {
          seenNormMap.set(taskNameDatesSignature, task.id);
        }
      }
    }
  });

  const dedupedTasks = Array.from(seenMap.values());
  for (let i = 0; i < dedupedTasks.length; i++) {
    const t = dedupedTasks[i];
    const validPar = validParentByTask.get(t);
    if (validPar && validPar.id) {
      const redirected = idRedirectMap.get(String(validPar.id).trim()) || String(validPar.id).trim();
      if (t.parentTaskId !== redirected) {
        dedupedTasks[i] = { ...t, parentTaskId: redirected };
      }
    } else if (t.parentTaskId) {
      const redirected = idRedirectMap.get(String(t.parentTaskId).trim());
      if (redirected && redirected !== t.parentTaskId) {
        dedupedTasks[i] = { ...t, parentTaskId: redirected };
      }
    }
  }

  const result = {
    dedupedTasks,
    duplicateCount,
    removedTaskIds
  };
  _dedupWeakCache.set(tasks, result);
  _dedupWeakCache.set(dedupedTasks, { dedupedTasks, duplicateCount: 0, removedTaskIds: [] });
  return result;
}

let _lastDedupInputTasksRef: Task[] | null = null;
let _lastDedupInputProjectsRef: Project[] | null = null;
let _cachedDedupTasksResult: Task[] = [];

/**
 * Convenient helper returning just the deduplicated array of tasks.
 * Includes reference-equality caching to prevent redundant sorting and map allocations.
 */
export function deduplicateTasks(tasks: Task[], projects: Project[] = EMPTY_PROJECTS): Task[] {
  if (!tasks || tasks.length === 0) return [];
  if (tasks.length === 1) return tasks;

  const normalizedProjects = projects && projects.length > 0 ? projects : EMPTY_PROJECTS;

  if (_lastDedupInputTasksRef === tasks && _lastDedupInputProjectsRef === normalizedProjects && _lastDedupInputTasksRef !== null) {
    return _cachedDedupTasksResult;
  }

  _lastDedupInputTasksRef = tasks;
  _lastDedupInputProjectsRef = normalizedProjects;
  _cachedDedupTasksResult = deduplicateTasksInMemory(tasks, normalizedProjects).dedupedTasks;
  return _cachedDedupTasksResult;
}

/**
 * Scans Firestore tasks collection and removes duplicate tasks in projects.
 */
export async function scanAndRemoveDuplicateTasksOnFirestore(projects: Project[] = []): Promise<{
  removedCount: number;
  mergedCount: number;
}> {
  try {
    const tasksCol = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks');
    const snap = await getDocs(tasksCol);
    if (snap.empty) return { removedCount: 0, mergedCount: 0 };

    const allTasks: Task[] = [];
    snap.docs.forEach(d => {
      allTasks.push({ id: d.id, ...d.data() } as Task);
    });

    const { duplicateCount, removedTaskIds } = deduplicateTasksInMemory(allTasks, projects);
    if (duplicateCount === 0 || removedTaskIds.length === 0) {
      return { removedCount: 0, mergedCount: 0 };
    }

    const BATCH_LIMIT = 400;
    for (let i = 0; i < removedTaskIds.length; i += BATCH_LIMIT) {
      const chunk = removedTaskIds.slice(i, i + BATCH_LIMIT);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.delete(ref);
      });
      await batch.commit();
    }

    return { removedCount: removedTaskIds.length, mergedCount: duplicateCount };
  } catch (e) {
    console.error('Failed to clean duplicate tasks on Firestore:', e);
    return { removedCount: 0, mergedCount: 0 };
  }
}
