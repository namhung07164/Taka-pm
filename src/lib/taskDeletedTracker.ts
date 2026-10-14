/**
 * Centralized Deleted Task Tracker
 * Prevents deleted tasks from being re-synthesized as virtual tasks or restored by stale project summaries.
 */

const deletedTaskKeys = new Set<string>();

export function markTasksDeleted(keys: (string | undefined | null)[]): void {
  keys.forEach((k) => {
    if (k && typeof k === 'string') {
      const clean = k.trim().toLowerCase();
      if (clean) deletedTaskKeys.add(clean);
    }
  });
}

export function isTaskDeletedInTracker(
  id?: string | null,
  taskCodePhu?: string | null,
  name?: string | null
): boolean {
  if (id && deletedTaskKeys.has(String(id).trim().toLowerCase())) return true;
  if (taskCodePhu && deletedTaskKeys.has(String(taskCodePhu).trim().toLowerCase())) return true;
  if (name && deletedTaskKeys.has(String(name).trim().toLowerCase())) return true;
  return false;
}

export function clearTaskDeletedTracker(): void {
  deletedTaskKeys.clear();
}
