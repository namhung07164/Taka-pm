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
  const removedTaskIds: string[] = [];
  let duplicateCount = 0;

  // Pre-compute updatedAt numeric timestamps in O(N) to avoid O(N log N) Date allocations in sort comparator
  const updatedTimeCache = new WeakMap<Task, number>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t && t.updatedAt) {
      const parsed = Date.parse(t.updatedAt);
      updatedTimeCache.set(t, Number.isNaN(parsed) ? 0 : parsed);
    }
  }

  // Sort tasks so the most recently updated, non-deleted, or feature-rich task comes first
  const sorted = [...tasks].sort((a, b) => {
    // Prefer non-deleted
    if (a.isDeleted && !b.isDeleted) return 1;
    if (!a.isDeleted && b.isDeleted) return -1;
    // Prefer task with more comments
    const aComments = a.comments?.length || 0;
    const bComments = b.comments?.length || 0;
    if (aComments !== bComments) return bComments - aComments;
    // Prefer task with notes
    const aNotes = a.notes?.length || 0;
    const bNotes = b.notes?.length || 0;
    if (aNotes !== bNotes) return bNotes - aNotes;
    // Prefer task with delegation
    if (a.delegation && !b.delegation) return -1;
    if (!a.delegation && b.delegation) return 1;
    // Prefer task with predecessor
    if (a.predecessor && !b.predecessor) return -1;
    if (!a.predecessor && b.predecessor) return 1;
    // Prefer task with party
    if (a.party && !b.party) return -1;
    if (!a.party && b.party) return 1;
    // Prefer latest updatedAt (O(1) cached lookup)
    const aTime = updatedTimeCache.get(a) || 0;
    const bTime = updatedTimeCache.get(b) || 0;
    if (bTime !== aTime) return bTime - aTime;
    // Tie-break: use ID to ensure all devices pick the same task, independent of load order
    return String(a.id).localeCompare(String(b.id));
  });

  sorted.forEach(task => {
    if (task.isDeleted) {
      // Don't index deleted tasks into seenMap
      return;
    }

    // Filter out completely empty/corrupt ghost tasks (no name, no start, no finish)
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

    // Check by exact task ID first
    if (seenMap.has(taskIdStr)) {
      duplicateCount++;
      removedTaskIds.push(task.id);
      return;
    }

    const taskProjIdStr = task.projectId ? String(task.projectId).trim().toLowerCase() : '';
    const projKey = buildCanonicalProjectKey(task.projectCode, task.projectYear, task.projectStore, projects, projectLookupMap, taskProjIdStr);
    const codePhu = String(task.taskCodePhu || '').trim().toLowerCase();
    const exactName = String(task.name || '').trim().toLowerCase();
    const startStr = String(task.start || '').trim();
    const finishStr = String(task.finish || '').trim();
    const partyStr = String(task.party || '').trim().toLowerCase();

    // Đưa đầy đủ codePhu + exactName + start + finish + party vào signature để không bao giờ xóa nhầm các hạng mục WBS trùng tên
    const taskUniqueSignature = `${projKey}__${codePhu || 'nocode'}__${exactName}__${startStr}__${finishStr}__${partyStr}`;

    const matchedExistingId = (projKey && exactName && seenNormMap.has(taskUniqueSignature))
      ? seenNormMap.get(taskUniqueSignature)
      : undefined;

    if (matchedExistingId && seenMap.has(matchedExistingId)) {
      const existing = seenMap.get(matchedExistingId)!;
      // Absolute guard 1: If both tasks have explicit projectIds that do NOT match, they are NEVER duplicates!
      if (task.projectId && existing.projectId && String(task.projectId) !== String(existing.projectId)) {
        seenMap.set(task.id, task);
        return;
      }

      // Absolute guard 2: Strict 4-key isolation if IDs are missing but other keys differ
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

      // Absolute guard 2: If both tasks have explicit parentTaskIds that do NOT match, they are NEVER duplicates!
      if (task.parentTaskId && existing.parentTaskId && String(task.parentTaskId) !== String(existing.parentTaskId)) {
        seenMap.set(task.id, task);
        return;
      }

      // Duplicate task found!
      duplicateCount++;
      removedTaskIds.push(task.id);
      
      // Merge comments, notes, delegation, party, predecessor, attachments from duplicate into surviving task
      if ((!existing.comments || existing.comments.length === 0) && task.comments && task.comments.length > 0) {
        existing.comments = task.comments;
      }
      if ((!existing.notes || existing.notes.length === 0) && task.notes && task.notes.length > 0) {
        existing.notes = task.notes;
      }
      if (!existing.party && task.party) {
        existing.party = task.party;
      }
      if (!existing.predecessor && task.predecessor) {
        existing.predecessor = task.predecessor;
      }
      if (!existing.delegation && task.delegation) {
        existing.delegation = task.delegation;
      }
      if (!existing.taskCodePhu && task.taskCodePhu) {
        existing.taskCodePhu = task.taskCodePhu;
      }
      if (!existing.parentTaskId && task.parentTaskId) {
        existing.parentTaskId = task.parentTaskId;
      }
    } else {
      seenMap.set(task.id, task);
      if (projKey && exactName) {
        seenNormMap.set(taskUniqueSignature, task.id);
      }
    }
  });

  return {
    dedupedTasks: Array.from(seenMap.values()),
    duplicateCount,
    removedTaskIds
  };
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
