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

// Các nơi gọi truyền thêm (code, name) nhưng hiện chỉ kiểm tra theo id/khóa chính.
// Không kiểm tra theo tên vì tên task có thể trùng giữa các dự án.
export function isTaskDeletedInTracker(
  taskOrKey: string | { id?: string; projectId?: string; taskCodePhu?: string; name?: string } | undefined | null,
  contextProjectIdOrCode?: string,
  _name?: string
): boolean {
  if (!taskOrKey) return false;
  const taskId = typeof taskOrKey === 'string'
    ? taskOrKey.trim().toLowerCase()
    : (taskOrKey.id ? String(taskOrKey.id).trim().toLowerCase() : '');
  if (!taskId) return false;

  const projId = typeof taskOrKey === 'object' && (taskOrKey as any).projectId
    ? String((taskOrKey as any).projectId).trim().toLowerCase()
    : (contextProjectIdOrCode ? String(contextProjectIdOrCode).trim().toLowerCase() : '');

  if (projId && deletedTaskKeys.has(`${projId}:::${taskId}`)) {
    return true;
  }

  return deletedTaskKeys.has(taskId);
}

export function getDeletedTaskKeysSet(): Set<string> {
  return deletedTaskKeys;
}

