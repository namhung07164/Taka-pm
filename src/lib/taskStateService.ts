import { Task, Project } from '../types';
import { useAppStore } from '../store/useAppStore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import {
  getTasksForProject,
  calculateProjectComputedDates,
  syncProjectDatesToFirestore,
} from './projectDatesService';
import { isTaskDeletedInTracker } from './taskDeletedTracker';
import { isTaskBelongsToProject as isTaskBelongsToProjectCore, normalizeDashes } from './utils';
import {
  deleteTaskStateUnified,
  deleteProjectStateUnified,
} from './taskStateParts/taskDeletionService';

export { deleteTaskStateUnified, deleteProjectStateUnified };

// Cache in-flight requests to avoid duplicate fetches
const pendingProjectFetches = new Map<string, Promise<Task[]>>();

/**
 * Validates whether a task belongs to a specific project by verifying projectId, store, code, and year.
 */
export function isTaskBelongsToProject(t: Partial<Task>, p: Partial<Project>): boolean {
  return isTaskBelongsToProjectCore(t, p);
}

export interface EnsureProjectTasksContext {
  projectId?: string;
  store?: string;
  year?: string | number;
}

/**
 * Ensures tasks for a specific projectCode (and optional 4-key context) are loaded into Zustand store.
 * Useful when resolving cross-project predecessors dynamically.
 */
export async function ensureProjectTasksLoaded(
  projectCode: string,
  context?: EnsureProjectTasksContext
): Promise<Task[]> {
  if (!projectCode && !context?.projectId) return [];
  const cleanCode = normalizeDashes(projectCode || '').trim();
  const cleanCodeLower = cleanCode.toLowerCase();
  const ctxProjectId = context?.projectId ? String(context.projectId).trim() : '';
  const ctxStoreLower = context?.store ? String(context.store).trim().toLowerCase() : '';
  const ctxYearStr =
    context?.year !== undefined && context?.year !== null ? String(context.year).trim() : '';

  const matchesContext = (t: Partial<Task>): boolean => {
    if (t.isDeleted || (t.id && isTaskDeletedInTracker(t.id))) return false;
    if (ctxProjectId && t.projectId) {
      return String(t.projectId).trim() === ctxProjectId;
    }
    const tCodeLower = t.projectCode ? normalizeDashes(t.projectCode).trim().toLowerCase() : '';
    if (ctxProjectId && !t.projectId) {
      if (cleanCodeLower && (!tCodeLower || tCodeLower !== cleanCodeLower)) {
        return false;
      }
      if (ctxStoreLower && t.projectStore && t.projectStore.trim().toLowerCase() !== ctxStoreLower) {
        return false;
      }
      if (
        ctxYearStr &&
        t.projectYear !== undefined &&
        t.projectYear !== null &&
        String(t.projectYear).trim() !== ctxYearStr
      ) {
        return false;
      }
      return Boolean(cleanCodeLower);
    }
    if (cleanCodeLower && (!tCodeLower || tCodeLower !== cleanCodeLower)) {
      return false;
    }
    if (ctxStoreLower && t.projectStore && t.projectStore.trim().toLowerCase() !== ctxStoreLower) {
      return false;
    }
    if (
      ctxYearStr &&
      t.projectYear !== undefined &&
      t.projectYear !== null &&
      String(t.projectYear).trim() !== ctxYearStr
    ) {
      return false;
    }
    return true;
  };

  const stateNow = useAppStore.getState();
  const currentTasks = stateNow.tasks || [];
  const projects = stateNow.projects || [];
  const matchingProjs = projects.filter((p) => {
    if (ctxProjectId && p.id === ctxProjectId) return true;
    if (ctxProjectId && p.id && p.id !== ctxProjectId) return false;
    if (cleanCodeLower && (!p.code || p.code.trim().toLowerCase() !== cleanCodeLower)) return false;
    if (ctxStoreLower && p.store && p.store.trim().toLowerCase() !== ctxStoreLower) return false;
    if (ctxYearStr && p.year !== undefined && String(p.year).trim() !== ctxYearStr) return false;
    return true;
  });

  const expectedSummaryIds = new Set<string>();
  let expectedCount = 0;
  matchingProjs.forEach((p) => {
    const sLen = Array.isArray(p.taskSummaries) ? p.taskSummaries.length : 0;
    expectedCount = Math.max(expectedCount, p.taskCount || 0, sLen);
    if (Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach((s: any) => {
        const sId = String(s?.id || '').trim().toLowerCase();
        if (sId && !sId.startsWith('ts_')) expectedSummaryIds.add(sId);
      });
    }
  });

  const coversExpected = (list: Task[]): boolean => {
    if (list.length === 0 || list.length < expectedCount) return false;
    if (expectedSummaryIds.size === 0) return true;
    const idSet = new Set(list.map((t) => String(t.id || '').trim().toLowerCase()));
    for (const sId of expectedSummaryIds) {
      if (!idSet.has(sId)) return false;
    }
    return true;
  };

  // 1. If we already have all expected tasks for this specific project context in memory, return them (0 Read)
  const existing = currentTasks.filter(matchesContext);
  if (coversExpected(existing)) return existing;

  const cacheKey = `${ctxProjectId || '*'}|${cleanCodeLower}|${ctxStoreLower || '*'}|${ctxYearStr || '*'}`;

  if (pendingProjectFetches.has(cacheKey)) {
    return pendingProjectFetches.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      // 2. Check Dexie Local-First Database before touching Firestore (0 Read)
      const { getLocalTasksForProjects, bulkPersistTasks } = await import('./localDb');
      const lookupKeys = [ctxProjectId, cleanCode].filter(Boolean);
      const localTasks = await getLocalTasksForProjects(
        lookupKeys,
        ctxYearStr || undefined,
        ctxStoreLower || undefined
      );
      const validLocal = (localTasks || []).filter(matchesContext);
      if (coversExpected(validLocal)) {
        const latestTasks = useAppStore.getState().tasks || [];
        const currentIds = new Set(latestTasks.map((t) => t.id));
        const toAdd = validLocal.filter((t) => !currentIds.has(t.id));
        if (toAdd.length > 0) {
          useAppStore.getState().setTasks([...latestTasks, ...toAdd]);
        }
        return validLocal;
      }

      // 3. Check if project has 0 tasks according to project summary (0 Read)
      if (
        matchingProjs.length > 0 &&
        expectedCount === 0 &&
        matchingProjs.every(
          (p) =>
            (p.taskCount || 0) === 0 && (!p.taskSummaries || p.taskSummaries.length === 0)
        )
      ) {
        return [];
      }

      // 4. Fallback to Firestore when local cache is incomplete or empty
      const colRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks');
      const queries = [];
      if (ctxProjectId) {
        queries.push(getDocs(query(colRef, where('projectId', '==', ctxProjectId))));
      }
      if (cleanCode) {
        const dashHyphen = cleanCode.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
        const dashEn = cleanCode.replace(/-/g, '–');
        const codeVariants = Array.from(
          new Set([
            cleanCode,
            cleanCode.toUpperCase(),
            cleanCode.toLowerCase(),
            dashHyphen,
            dashHyphen.toUpperCase(),
            dashHyphen.toLowerCase(),
            dashEn,
            dashEn.toUpperCase(),
            dashEn.toLowerCase(),
          ])
        ).slice(0, 10);
        queries.push(
          getDocs(
            codeVariants.length > 1
              ? query(colRef, where('projectCode', 'in', codeVariants))
              : query(colRef, where('projectCode', '==', codeVariants[0]))
          )
        );
      }
      const snaps = await Promise.all(queries);
      const loadedMap = new Map<string, Task>();
      snaps.forEach((snap) => {
        snap.forEach((docSnap) => {
          const d = { id: docSnap.id, ...docSnap.data() } as Task;
          if (matchesContext(d)) loadedMap.set(docSnap.id, d);
        });
      });
      const loaded = Array.from(loadedMap.values());

      if (loaded.length > 0) {
        bulkPersistTasks(loaded).catch(() => {});
        const latestTasks = useAppStore.getState().tasks || [];
        const mergedById = new Map<string, Task>(latestTasks.map((t) => [t.id, t]));
        loaded.forEach((t) => mergedById.set(t.id, t));
        useAppStore.getState().setTasks(Array.from(mergedById.values()));
      }
      return loaded;
    } catch (err) {
      console.warn('Failed to fetch tasks for external project:', cleanCode, err);
      return [];
    } finally {
      pendingProjectFetches.delete(cacheKey);
    }
  })();

  pendingProjectFetches.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Tìm toàn bộ danh sách Projects bị ảnh hưởng bởi danh sách Tasks đưa vào.
 * Tiền xử lý Map dự án theo ID và Code (O(P + T) thay vì O(T * P)).
 */
export function findAffectedProjects(
  tasksToCheck: Partial<Task>[],
  allProjects?: Project[]
): Project[] {
  const projects = allProjects || useAppStore.getState().projects;
  if (!tasksToCheck.length || !projects.length) return [];

  const projectsById = new Map<string, Project>();
  const projectsByCodePart = new Map<string, Project[]>();

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p || (!p.id && !p.code)) continue;
    if (p.id) {
      projectsById.set(String(p.id).trim(), p);
    }
    const rawCodes = (p as any).linkCodes
      ? `${p.code || ''}, ${(p as any).linkCodes}`
      : String(p.code || '');
    const parts = rawCodes
      .toLowerCase()
      .split(/[,;/]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      let list = projectsByCodePart.get(part);
      if (!list) {
        list = [];
        projectsByCodePart.set(part, list);
      }
      list.push(p);
    }
  }

  const affectedMap = new Map<string, Project>();

  for (let i = 0; i < tasksToCheck.length; i++) {
    const t = tasksToCheck[i];
    if (!t) continue;
    const tWithActive = { ...t, isDeleted: false };

    const tProjId = t.projectId ? String(t.projectId).trim() : '';
    if (tProjId) {
      const pById = projectsById.get(tProjId);
      if (pById && isTaskBelongsToProjectCore(tWithActive, pById, projects)) {
        affectedMap.set(pById.id || pById.code, pById);
        continue;
      }
    }

    if (t.projectCode) {
      const tCodeParts = String(t.projectCode)
        .toLowerCase()
        .split(/[,;/]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (let j = 0; j < tCodeParts.length; j++) {
        const candidates = projectsByCodePart.get(tCodeParts[j]);
        if (!candidates) continue;
        for (let k = 0; k < candidates.length; k++) {
          const p = candidates[k];
          const key = p.id || p.code;
          if (!affectedMap.has(key) && isTaskBelongsToProjectCore(tWithActive, p, projects)) {
            affectedMap.set(key, p);
          }
        }
      }
    }
  }

  return Array.from(affectedMap.values());
}

/**
 * Đồng bộ tính toán lại mốc thời gian và tiến độ cho các dự án bị ảnh hưởng
 * Cập nhật ngay tức thì vào Zustand store (0ms) và đẩy ngầm Firestore (Dirty-checked).
 */
export async function syncAffectedProjects(
  affectedProjects: Project[],
  allTasks?: Task[]
): Promise<void> {
  if (!affectedProjects.length) return;

  const currentTasks = allTasks || useAppStore.getState().tasks;
  const delegationGroups = useAppStore.getState().delegationGroups;

  for (const project of affectedProjects) {
    if (!project.id) continue;
    const projectTasks = getTasksForProject(project, currentTasks);
    const computedDates = calculateProjectComputedDates(
      project,
      projectTasks,
      delegationGroups
    );
    await syncProjectDatesToFirestore(project.id, computedDates);
  }
}

/**
 * Shared State Handler: Cập nhật / Thêm mới Tasks đồng bộ giữa mọi Tab (DetailTab <-> GeneralTab)
 */
export async function saveTaskStateUnified(
  taskUpdates: (Partial<Task> & { id: string })[],
  options?: { syncProjects?: boolean; allTasksOverride?: Task[] }
): Promise<void> {
  if (!taskUpdates || taskUpdates.length === 0) return;

  useAppStore.getState().optimisticUpdateTasks(taskUpdates);

  if (options?.syncProjects === false) return;

  const updatedTasks = options?.allTasksOverride || useAppStore.getState().tasks;
  const affectedProjects = findAffectedProjects(taskUpdates);

  await syncAffectedProjects(affectedProjects, updatedTasks);
}

/**
 * Tự động phát hiện và xử lý các task mồ côi trong bộ nhớ (task con có parentTaskId chỉ đến task mẹ đã bị xóa)
 */
export function cleanOrphanTasks(tasks: Task[]): { cleaned: Task[]; fixedCount: number } {
  if (!tasks || tasks.length === 0) return { cleaned: tasks, fixedCount: 0 };

  const projects = useAppStore.getState().projects || [];
  const taskMap = new Map<string, Task>();
  const taskCodeMap = new Map<string, Task>();
  const summaryTaskIds = new Set<string>();

  const targetProjIds = new Set<string>();
  const targetProjCodes = new Set<string>();
  // Group tasks by project scope to index canonical ${projectCode}#${idx + 1} codes
  const scopedBuckets = new Map<string, Task[]>();
  tasks.forEach((t) => {
    if (!t) return;
    if (t.id) taskMap.set(String(t.id).trim().toLowerCase(), t);
    if (t.taskCodePhu) taskCodeMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
    if (t.projectId) targetProjIds.add(String(t.projectId).trim());
    if (t.projectCode) targetProjCodes.add(String(t.projectCode).trim().toLowerCase());
    const scopeKey = t.projectId
      ? `pid:${String(t.projectId).trim()}`
      : `code:${String(t.projectCode || '').trim().toLowerCase()}|${String(t.projectStore || '').trim().toLowerCase()}|${String(t.projectYear || '').trim()}`;
    let list = scopedBuckets.get(scopeKey);
    if (!list) {
      list = [];
      scopedBuckets.set(scopeKey, list);
    }
    list.push(t);
  });

  projects.forEach((p) => {
    if (!p || p.isDeleted || !Array.isArray(p.taskSummaries)) return;
    const pIdMatch = p.id && targetProjIds.has(String(p.id).trim());
    const pCodeMatch = p.code && targetProjCodes.has(String(p.code).trim().toLowerCase());
    if (!pIdMatch && !pCodeMatch) return;
    p.taskSummaries.forEach((s: any) => {
      if (s?.id && !String(s.id).startsWith('ts_')) {
        summaryTaskIds.add(String(s.id).trim().toLowerCase());
      }
      if (s?.taskCodePhu) {
        summaryTaskIds.add(String(s.taskCodePhu).trim().toLowerCase());
      }
    });
  });

  scopedBuckets.forEach((bucket, scopeKey) => {
    const sorted = [...bucket].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    sorted.forEach((t, idx) => {
      if (!t || !t.id) return;
      const num = idx + 1;
      const pCode = String(t.projectCode || '').trim();
      if (pCode) {
        const canonicalLower = `${pCode}#${num}`.toLowerCase();
        taskCodeMap.set(`${scopeKey}__${canonicalLower}`, t);
        if (!taskCodeMap.has(canonicalLower)) taskCodeMap.set(canonicalLower, t);
      }
      taskCodeMap.set(`${scopeKey}__#${num}`, t);
      taskCodeMap.set(`${scopeKey}__${num}`, t);
    });
  });

  let fixedCount = 0;

  const cleaned = tasks.map((t) => {
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (!rawParent) return t;

    const parentStr = String(rawParent).trim().toLowerCase();
    const scopeKey = t.projectId
      ? `pid:${String(t.projectId).trim()}`
      : `code:${String(t.projectCode || '').trim().toLowerCase()}|${String(t.projectStore || '').trim().toLowerCase()}|${String(t.projectYear || '').trim()}`;

    const parentTask =
      taskMap.get(parentStr) ||
      taskCodeMap.get(`${scopeKey}__${parentStr}`) ||
      taskCodeMap.get(parentStr);

    if (parentTask && !parentTask.isDeleted && String(parentTask.id) !== String(t.id)) {
      if (t.parentTaskId !== parentTask.id) {
        return { ...t, parentTaskId: parentTask.id };
      }
      return t;
    }

    // If parent is not yet hydrated in tasks array but exists in project.taskSummaries, preserve linkage
    if (summaryTaskIds.has(parentStr) && parentStr !== String(t.id).trim().toLowerCase()) {
      return t;
    }

    fixedCount++;
    // Do NOT stamp a fresh updatedAt here: in-memory orphan cleanup must not masquerade as a user edit
    // that blocks authoritative server taskSummaries reconciliation.
    const updated = { ...t, parentTaskId: undefined };
    delete (updated as any).parentId;
    return updated;
  });

  return { cleaned, fixedCount };
}

/**
 * Shared State Handler: Sắp xếp / Đổi toàn bộ danh sách Tasks (Reorder / Batch Sort)
 */
export async function reorderTasksStateUnified(
  allUpdatedTasks: Task[],
  options?: { affectedProjectIds?: string[]; syncProjects?: boolean }
): Promise<void> {
  if (!allUpdatedTasks) return;

  useAppStore.getState().setTasks(allUpdatedTasks);

  setTimeout(() => {
    import('./localDb')
      .then(({ bulkPersistTasks }) => {
        if (options?.affectedProjectIds && options.affectedProjectIds.length > 0) {
          const idSet = new Set(options.affectedProjectIds.map(String));
          const subset = allUpdatedTasks.filter((t) => t.projectId && idSet.has(String(t.projectId)));
          return bulkPersistTasks(subset.length > 0 ? subset : allUpdatedTasks);
        }
        return bulkPersistTasks(allUpdatedTasks);
      })
      .catch(() => {});
  }, 0);

  if (options?.syncProjects === false) return;

  const allProjects = useAppStore.getState().projects;
  let targetProjects: Project[] = [];

  if (options?.affectedProjectIds && options.affectedProjectIds.length > 0) {
    const idSet = new Set(options.affectedProjectIds);
    targetProjects = allProjects.filter((p) => p.id && idSet.has(p.id));
  } else {
    targetProjects = findAffectedProjects(allUpdatedTasks, allProjects);
  }

  await syncAffectedProjects(targetProjects, allUpdatedTasks);
}
