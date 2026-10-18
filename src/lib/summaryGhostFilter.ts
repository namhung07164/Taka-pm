import type { Project, Task } from '../types';
import { isTaskBelongsToProject } from './utils';

/** Bản đồ id -> task cho các task thật đang nạp trong bộ nhớ */
export function buildTaskByIdMap(tasks: Task[]): Map<string, Task> {
  const m = new Map<string, Task>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (!t || !t.id || t.isDeleted) continue;
    if ((t as any)._isVirtualSummary) continue;
    m.set(String(t.id), t);
  }
  return m;
}

export function isForeignSummaryEntry(
  tsId: string | undefined,
  project: Partial<Project>,
  taskById: Map<string, Task>
): boolean {
  if (!tsId || String(tsId).startsWith('ts_')) return false;
  const t = taskById.get(String(tsId));
  if (!t) return false;
  return !isTaskBelongsToProject(t, project);
}
