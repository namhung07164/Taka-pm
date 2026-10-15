/**
 * Centralized Deleted Task Tracker
 * Prevents deleted tasks from being re-synthesized as virtual tasks or restored by stale project summaries.
 */

const deletedTaskKeys = new Set<string>();

export function markTasksDeleted(keys: (string | undefined | null)[], projectId?: string): void {
  if (!keys || !Array.isArray(keys)) return;
  const pKey = projectId ? String(projectId).trim().toLowerCase() : '';
  keys.forEach(k => {
    if (k && typeof k === 'string') {
      const clean = k.trim().toLowerCase();
      if (clean) {
        deletedTaskKeys.add(clean);
        if (pKey) {
          deletedTaskKeys.add(`${pKey}:::${clean}`);
        }
      }
    }
  });
}

// Chỉ kiểm tra theo ID task/xác thực chính xác.
// Hỗ trợ kiểm tra theo project context để tránh xóa nhầm task ở dự án khác khi dùng chung ID ảo hoặc ID nhân bản.
export function isTaskDeletedInTracker(
  taskOrKey: string | { id?: string; projectId?: string; taskCodePhu?: string; name?: string } | undefined | null,
  contextProjectId?: string,
  _unused?: string
): boolean {
  if (!taskOrKey) return false;
  const taskId = typeof taskOrKey === 'string'
    ? taskOrKey.trim().toLowerCase()
    : (taskOrKey.id ? String(taskOrKey.id).trim().toLowerCase() : '');
  if (!taskId) return false;

  const projId = typeof taskOrKey === 'object' && (taskOrKey as any).projectId
    ? String((taskOrKey as any).projectId).trim().toLowerCase()
    : (contextProjectId ? String(contextProjectId).trim().toLowerCase() : '');

  if (projId) {
    if (deletedTaskKeys.has(`${projId}:::${taskId}`)) return true;
    // Nếu có project ID mà không có trong khóa project-scoped thì KHÔNG coi là xóa
    // (ngăn chặn task trùng ID từ dự án khác làm mất task dự án này)
    return false;
  }

  return deletedTaskKeys.has(taskId);
}

export function getDeletedTaskKeysSet(): Set<string> {
  return deletedTaskKeys;
}

