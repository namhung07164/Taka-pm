import { Task, Project } from "../types";
import { useAppStore } from "../store/useAppStore";
import { 
  getTasksForProject, 
  calculateProjectComputedDates, 
  syncProjectDatesToFirestore,
  matchProjectCode 
} from "./projectDatesService";

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

  const currentTasks = useAppStore.getState().tasks;
  const tasksToDelete = currentTasks.filter(t => taskIds.includes(t.id));
  const affectedProjects = findAffectedProjects(tasksToDelete);

  // 1. Xóa tức thì khỏi Zustand store
  useAppStore.getState().optimisticDeleteTasks(taskIds);

  if (options?.syncProjects === false) return;

  // 2. Tính lại tiến độ & mốc ngày cho các dự án với danh sách tasks còn lại
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
