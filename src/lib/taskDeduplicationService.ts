import { Task, Project } from '../types';
import { doc, writeBatch, collection, getDocs } from 'firebase/firestore';
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
 * Normalizes a task name for reliable duplicate comparison by:
 * 1. Lowercasing and trimming
 * 2. Collapsing multiple spaces into a single space
 * 3. Stripping project code and task numbering prefixes (e.g. "B1-B110-1#1 ", "#1 ", "1. ", "1 - ")
 */
export function normalizeTaskNameForComparison(name?: string | null, projectCode?: string | null): string {
  if (!name) return '';
  let str = String(name).trim().toLowerCase();
  
  // Collapse whitespace
  str = str.replace(/\s+/g, ' ');
  
  if (projectCode) {
    const pCode = String(projectCode).trim().toLowerCase();
    // Strip projectCode prefix if present, e.g. "b1-b110-1#1 ", "b1-b110-1-1 ", "b1-b110-1: "
    const escapedCode = pCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pCodeRegex = new RegExp(`^${escapedCode}[#\\-\\:\\/\\s\\.]*(\\d+)?([\\s\\:\\-\\.\\)]+)?`, 'i');
    str = str.replace(pCodeRegex, '').trim();
  }
  
  // Strip leading task index patterns like "#1 ", "1. ", "1) ", "1 - ", "1: "
  str = str.replace(/^#?\d+[\s\.\-\)\:]+/, '').trim();
  
  return str;
}

/**
 * Builds a canonical project key for a task or project.
 */
export function buildCanonicalProjectKey(
  projectCode?: string | null,
  year?: string | number | null,
  store?: string | null,
  projects: Project[] = []
): string {
  const pCode = String(projectCode || '').trim().toLowerCase();
  if (!pCode) return '';

  const matchedProj = projects.find(p => 
    String(p.code || '').trim().toLowerCase() === pCode ||
    String(p.no || '').trim().toLowerCase() === pCode ||
    String(p.id || '').trim().toLowerCase() === pCode
  );

  const canonicalCode = matchedProj ? String(matchedProj.code || pCode).trim().toLowerCase() : pCode;
  const canonicalYear = normalizeYearString(matchedProj?.year ?? year);
  const canonicalStore = normalizeStoreCode(matchedProj?.store ?? store);

  if (canonicalYear || canonicalStore) {
    return `${canonicalCode}__${canonicalYear}__${canonicalStore}`;
  }
  return canonicalCode;
}

/**
 * Deduplicates a list of tasks in-memory.
 * If multiple tasks exist with the same project and same task name (case-insensitive or normalized)
 * or same task code, it merges them keeping the most complete / latest updated task.
 */
export function deduplicateTasksInMemory(tasks: Task[], projects: Project[] = []): {
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

  const seenMap = new Map<string, Task>();
  const seenNormMap = new Map<string, string>(); // normKey -> taskId
  const seenCodeMap = new Map<string, string>(); // codeKey -> taskId
  const removedTaskIds: string[] = [];
  let duplicateCount = 0;

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
    // Prefer latest updatedAt
    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bTime - aTime;
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

    const tName = String(task.name || '').trim().toLowerCase();
    const prjKey = buildCanonicalProjectKey(task.projectCode, task.projectYear, task.projectStore, projects);
    const pCode = String(task.projectCode || '').trim().toLowerCase();
    const rawTaskCode = task.taskCodePhu ? String(task.taskCodePhu).trim().toLowerCase() : '';
    const parentIdStr = task.parentTaskId ? String(task.parentTaskId).trim().toLowerCase() : '';
    const startStr = task.start ? String(task.start).trim() : '';
    const finishStr = task.finish ? String(task.finish).trim() : '';

    const codeKey = pCode && rawTaskCode ? `${pCode}:::code:::${rawTaskCode}` : '';
    // Require exact match on project, parent, name, start, and finish to prevent falsely merging distinct tasks!
    const exactTaskKey = prjKey && tName ? `${prjKey}:::parent:${parentIdStr}:::name:${tName}:::start:${startStr}:::finish:${finishStr}` : '';

    let matchedExistingId: string | undefined = undefined;

    if (codeKey && seenCodeMap.has(codeKey)) {
      matchedExistingId = seenCodeMap.get(codeKey);
    } else if (exactTaskKey && seenNormMap.has(exactTaskKey)) {
      matchedExistingId = seenNormMap.get(exactTaskKey);
    }

    if (matchedExistingId && seenMap.has(matchedExistingId)) {
      // Duplicate task found!
      duplicateCount++;
      removedTaskIds.push(task.id);
      
      // Merge comments, notes, delegation, party, predecessor, attachments from duplicate into surviving task
      const existing = seenMap.get(matchedExistingId)!;
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
      if (codeKey) seenCodeMap.set(codeKey, task.id);
      if (exactTaskKey) seenNormMap.set(exactTaskKey, task.id);
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
export function deduplicateTasks(tasks: Task[], projects: Project[] = []): Task[] {
  if (!tasks || tasks.length === 0) return [];
  if (tasks.length === 1) return tasks;

  if (_lastDedupInputTasksRef === tasks && _lastDedupInputProjectsRef === projects && _lastDedupInputTasksRef !== null) {
    return _cachedDedupTasksResult;
  }

  _lastDedupInputTasksRef = tasks;
  _lastDedupInputProjectsRef = projects;
  _cachedDedupTasksResult = deduplicateTasksInMemory(tasks, projects).dedupedTasks;
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
