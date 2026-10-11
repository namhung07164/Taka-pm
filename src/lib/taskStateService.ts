import { Task, Project } from "../types";
import { useAppStore } from "../store/useAppStore";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db, APP_ID } from "./firebase";
import { 
  getTasksForProject, 
  calculateProjectComputedDates, 
  syncProjectDatesToFirestore,
  matchProjectCode 
} from "./projectDatesService";

// Cache in-flight requests to avoid duplicate fetches
const pendingProjectFetches = new Map<string, Promise<Task[]>>();

/**
 * Ensures tasks for a specific projectCode are loaded into Zustand store.
 * Useful when resolving cross-project predecessors dynamically.
 */
export async function ensureProjectTasksLoaded(projectCode: string): Promise<Task[]> {
  if (!projectCode) return [];
  const cleanCode = projectCode.trim();
  const currentTasks = useAppStore.getState().tasks || [];
  
  // If we already have tasks for this project in memory, return them
  const existing = currentTasks.filter(t => 
    t.projectCode && t.projectCode.trim().toLowerCase() === cleanCode.toLowerCase()
  );
  if (existing.length > 0) return existing;

  // If already fetching, return existing promise
  if (pendingProjectFetches.has(cleanCode.toLowerCase())) {
    return pendingProjectFetches.get(cleanCode.toLowerCase())!;
  }

  const fetchPromise = (async () => {
    try {
      const q = query(
        collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks"),
        where("projectCode", "==", cleanCode)
      );
      const snap = await getDocs(q);
      const loaded: Task[] = [];
      snap.forEach(docSnap => {
        const d = { id: docSnap.id, ...docSnap.data() } as Task;
        if (!d.isDeleted) loaded.push(d);
      });

      if (loaded.length > 0) {
        const latestTasks = useAppStore.getState().tasks || [];
        const currentIds = new Set(latestTasks.map(t => t.id));
        const toAdd = loaded.filter(t => !currentIds.has(t.id));
        if (toAdd.length > 0) {
          useAppStore.getState().setTasks([...latestTasks, ...toAdd]);
        }
      }
      return loaded;
    } catch (err) {
      console.warn("Failed to fetch tasks for external project:", cleanCode, err);
      return [];
    } finally {
      pendingProjectFetches.delete(cleanCode.toLowerCase());
    }
  })();

  pendingProjectFetches.set(cleanCode.toLowerCase(), fetchPromise);
  return fetchPromise;
}

/**
 * Tìm toàn bộ danh sách Projects bị ảnh hưởng bởi danh sách Tasks đưa vào
 */
export function findAffectedProjects(
  tasksToCheck: (Partial<Task>)[],
  allProjects?: Project[]
): Project[] {
  const projects = allProjects || useAppStore.getState().projects;
  if (!tasksToCheck.length || !projects.length) return [];

  const affectedMap = new Map<string, Project>();

  for (const t of tasksToCheck) {
    if (!t.projectCode) continue;
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : "";
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : "";

    for (const p of projects) {
      if (!p.id || !p.code) continue;

      const pStore = p.store ? String(p.store).trim().toLowerCase() : "";
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : "";

      const matchesCode =
        String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase() ||
        matchProjectCode(p.code, t.projectCode);

      if (!matchesCode) continue;
      if (pStore && tStore && pStore !== tStore) continue;
      if (pYear && tYear && pYear !== tYear) continue;

      affectedMap.set(p.id, p);
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
    const computedDates = calculateProjectComputedDates(project, projectTasks, delegationGroups);
    await syncProjectDatesToFirestore(project.id, computedDates);
  }
}

/**
 * Shared State Handler: Cập nhật / Thêm mới Tasks đồng bộ giữa mọi Tab (DetailTab <-> GeneralTab)
 * 1. Optimistic update vào Zustand `tasks` (0ms UI lag).
 * 2. Tự động nhận diện Projects liên quan, tính lại Start, Finish/Handover, Opening, Tiến độ.
 * 3. Optimistic update vào Zustand `projects` và đồng bộ ngầm Firestore.
 */
export async function saveTaskStateUnified(
  taskUpdates: (Partial<Task> & { id: string })[],
  options?: { syncProjects?: boolean; allTasksOverride?: Task[] }
): Promise<void> {
  if (!taskUpdates || taskUpdates.length === 0) return;

  // 1. Cập nhật Optimistic tức thì vào State Tasks
  useAppStore.getState().optimisticUpdateTasks(taskUpdates);

  if (options?.syncProjects === false) return;

  // 2. Lấy danh sách Tasks và Projects mới nhất
  const updatedTasks = options?.allTasksOverride || useAppStore.getState().tasks;
  const affectedProjects = findAffectedProjects(taskUpdates);

  // 3. Đồng bộ lại toàn bộ Computed Dates cho các dự án bị ảnh hưởng
  await syncAffectedProjects(affectedProjects, updatedTasks);
}

/**
 * Shared State Handler: Xóa Tasks đồng bộ giữa DetailTab và GeneralTab
 */
export async function deleteTaskStateUnified(
  taskIds: string[],
  options?: { syncProjects?: boolean }
): Promise<void> {
  if (!taskIds || taskIds.length === 0) return;

  const idSet = new Set(taskIds.map(String));
  const currentTasks = useAppStore.getState().tasks;
  const tasksToDelete = currentTasks.filter(t => idSet.has(String(t.id)));
  const affectedProjects = findAffectedProjects(tasksToDelete);

  // Collect codes and IDs of deleted tasks for unlinking and predecessor cleanup
  const deletedCodesAndIds = new Set<string>();
  tasksToDelete.forEach(t => {
    if (t.id) deletedCodesAndIds.add(String(t.id).trim().toLowerCase());
    if (t.taskCodePhu) deletedCodesAndIds.add(String(t.taskCodePhu).trim().toLowerCase());
  });

  // 1. Unlink child tasks if a parent task was deleted, and clean stale predecessor strings
  const now = new Date().toISOString();
  const tasksAfterDeletion = useAppStore.getState().tasks.filter(t => !idSet.has(String(t.id)));
  
  const cleanedTasks = tasksAfterDeletion.map(t => {
    let updated = t;
    let modified = false;

    // Check if child task lost its parent
    const rawParent = t.parentTaskId || (t as any).parentId;
    if (rawParent && deletedCodesAndIds.has(String(rawParent).trim().toLowerCase())) {
      updated = { ...updated, parentTaskId: undefined, updatedAt: now };
      delete (updated as any).parentId;
      modified = true;
    }

    // Clean deleted task codes/IDs from predecessor string
    if (updated.predecessor && typeof updated.predecessor === 'string') {
      const predParts = updated.predecessor.split(',').map(p => p.trim()).filter(Boolean);
      const filteredParts = predParts.filter(part => {
        // Strip relationship suffixes like SS, FF, SF, FS or lag +2d to extract task code
        const codeOnly = part.replace(/(?:SS|FF|SF|FS)?\s*(?:[+-]\d+[dwmy]?)?$/i, '').trim().toLowerCase();
        return !deletedCodesAndIds.has(codeOnly);
      });
      const newPred = filteredParts.join(', ');
      if (newPred !== updated.predecessor) {
        updated = { ...updated, predecessor: newPred, updatedAt: now };
        modified = true;
      }
    }

    return updated;
  });

  useAppStore.getState().setTasks(cleanedTasks);

  // 2. Xóa tức thì khỏi Dexie (IndexedDB) để ngăn hồi sinh dữ liệu khi re-hydrate
  try {
    const { localDb } = await import('./localDb');
    await localDb.tasks.bulkDelete(Array.from(idSet));
    await localDb.tasks.bulkDelete(taskIds as any);
  } catch (e) {
    console.warn('[taskStateService] Dexie bulkDelete tasks error:', e);
  }

  // 3. Xóa tệp đính kèm trên Firebase Storage (Storage Deep Clean - Rule 4)
  try {
    const { extractStorageUrls, deleteStorageFiles } = await import('./storageUtils');
    const urls: string[] = [];
    tasksToDelete.forEach(t => {
      const extracted = extractStorageUrls(t);
      if (extracted.length > 0) urls.push(...extracted);
    });
    if (urls.length > 0) {
      deleteStorageFiles(urls).catch(() => {});
    }
  } catch (e) {}

  if (options?.syncProjects === false) return;

  // 4. Tính lại tiến độ & mốc ngày cho các dự án với danh sách tasks còn lại
  const remainingTasks = useAppStore.getState().tasks;
  await syncAffectedProjects(affectedProjects, remainingTasks);
}

/**
 * Shared State Handler: Sắp xếp / Đổi toàn bộ danh sách Tasks (Reorder / Batch Sort)
 */
export async function reorderTasksStateUnified(
  allUpdatedTasks: Task[],
  options?: { affectedProjectIds?: string[]; syncProjects?: boolean }
): Promise<void> {
  if (!allUpdatedTasks) return;

  // 1. Cập nhật toàn bộ Tasks vào Zustand
  useAppStore.getState().setTasks(allUpdatedTasks);

  if (options?.syncProjects === false) return;

  const allProjects = useAppStore.getState().projects;
  let targetProjects: Project[] = [];

  if (options?.affectedProjectIds && options.affectedProjectIds.length > 0) {
    const idSet = new Set(options.affectedProjectIds);
    targetProjects = allProjects.filter(p => p.id && idSet.has(p.id));
  } else {
    targetProjects = findAffectedProjects(allUpdatedTasks, allProjects);
  }

  await syncAffectedProjects(targetProjects, allUpdatedTasks);
}
