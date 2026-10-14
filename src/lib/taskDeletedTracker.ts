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

export function isTaskDeletedInTracker(taskOrKey: string | { id?: string; taskCodePhu?: string; name?: string } | undefined | null): boolean {
  if (!taskOrKey) return false;
  if (typeof taskOrKey === 'string') {
    return deletedTaskKeys.has(taskOrKey.trim().toLowerCase());
  }
  const id = taskOrKey.id ? String(taskOrKey.id).trim().toLowerCase() : '';
  const code = taskOrKey.taskCodePhu ? String(taskOrKey.taskCodePhu).trim().toLowerCase() : '';
  const name = taskOrKey.name ? String(taskOrKey.name).trim().toLowerCase() : '';

  if (id && deletedTaskKeys.has(id)) return true;
  if (code && deletedTaskKeys.has(code)) return true;
  if (name && deletedTaskKeys.has(name)) return true;

  return false;
}

export function getDeletedTaskKeysSet(): Set<string> {
  return deletedTaskKeys;
}
