const DELETED_TTL_MS = 45 * 1000; // 45 seconds optimistic delete guard
const PROJECT_DELETED_TTL_MS = 120 * 1000; // 120 seconds optimistic project delete guard

const deletedTasksTimeMap = new Map<string, number>();
const deletedProjectsTimeMap = new Map<string, number>();

// Xóa bỏ bộ nhớ đen vĩnh viễn cũ trong localStorage từng gây ẩn nhầm task thật
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('taka_deleted_task_ids_v1');
    window.localStorage.removeItem('taka_deleted_tasks_v1');
  } catch {}
}

export function markProjectsDeleted(projectIds: (string | undefined | null)[]): void {
  const now = Date.now();
  for (const id of projectIds) {
    if (!id) continue;
    const clean = String(id).trim().toLowerCase();
    if (clean) {
      deletedProjectsTimeMap.set(clean, now);
    }
  }
}

export function unmarkProjectDeleted(projectId: string | undefined | null): void {
  if (!projectId) return;
  deletedProjectsTimeMap.delete(String(projectId).trim().toLowerCase());
}

export function isProjectDeletedInTracker(projectId: string | undefined | null): boolean {
  if (!projectId) return false;
  const clean = String(projectId).trim().toLowerCase();
  const deletedAt = deletedProjectsTimeMap.get(clean);
  if (!deletedAt) return false;
  if (Date.now() - deletedAt > PROJECT_DELETED_TTL_MS) {
    deletedProjectsTimeMap.delete(clean);
    return false;
  }
  return true;
}

export function markTasksDeleted(taskIds: (string | undefined | null)[], _projectId?: string): void {
  const now = Date.now();
  for (const id of taskIds) {
    if (!id) continue;
    const clean = String(id).trim().toLowerCase();
    if (clean) {
      deletedTasksTimeMap.set(clean, now);
    }
  }
}

export function unmarkTaskDeleted(taskId: string | undefined | null): void {
  if (!taskId) return;
  deletedTasksTimeMap.delete(String(taskId).trim().toLowerCase());
}

export function isTaskDeletedInTracker(taskId: string | undefined | null, projectId?: string): boolean {
  if (projectId && isProjectDeletedInTracker(projectId)) return true;
  if (!taskId) return false;
  const clean = String(taskId).trim().toLowerCase();
  const deletedAt = deletedTasksTimeMap.get(clean);
  if (!deletedAt) return false;
  if (Date.now() - deletedAt > DELETED_TTL_MS) {
    deletedTasksTimeMap.delete(clean);
    return false;
  }
  return true;
}

export function clearDeletedTasksTracker(): void {
  deletedTasksTimeMap.clear();
  deletedProjectsTimeMap.clear();
}

export function getDeletedTaskIds(): string[] {
  const now = Date.now();
  const ids: string[] = [];
  for (const [id, time] of deletedTasksTimeMap.entries()) {
    if (now - time <= DELETED_TTL_MS) {
      ids.push(id);
    } else {
      deletedTasksTimeMap.delete(id);
    }
  }
  return ids;
}

