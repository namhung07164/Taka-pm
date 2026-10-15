/**
 * Centralized Deleted Task Tracker
 * Prevents deleted tasks from being re-synthesized as virtual tasks or restored by stale project summaries.
 */

const deletedTaskKeys = new Set<string>();

export function markTasksDeleted(keys: (string | undefined | null)[]): void {
  if (!keys || !Array.isArray(keys)) return;
  keys.forEach(k => {
    if (k && typeof k === 'string') {
      const clean = k.trim().toLowerCase();
      if (clean) deletedTaskKeys.add(clean);
    }
  });
}

// Chỉ kiểm tra theo ID task/xác thực chính xác.
// Tuyệt đối KHÔNG kiểm tra theo taskCodePhu hoặc name vì mã phụ và tên task trùng lặp giữa nhiều dự án khác nhau.
export function isTaskDeletedInTracker(
  taskOrKey: string | { id?: string; taskCodePhu?: string; name?: string } | undefined | null,
  _code?: string,
  _name?: string
): boolean {
  if (!taskOrKey) return false;
  if (typeof taskOrKey === 'string') {
    return deletedTaskKeys.has(taskOrKey.trim().toLowerCase());
  }
  const id = taskOrKey.id ? String(taskOrKey.id).trim().toLowerCase() : '';
  if (id && deletedTaskKeys.has(id)) return true;

  return false;
}

export function getDeletedTaskKeysSet(): Set<string> {
  return deletedTaskKeys;
}

