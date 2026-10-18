import type { Project, Task } from '../types';
import { useAppStore } from '../store/useAppStore';

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Bản đồ id -> task cho các task thật đang nạp trong bộ nhớ */
export function buildTaskByIdMap(tasks: Task[]): Map<string, Task> {
  const m = new Map<string, Task>();
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (t && t.id && !t.isDeleted) m.set(String(t.id), t);
  }
  return m;
}

export function isForeignSummaryEntry(
  tsId: string | undefined,
  project: Partial<Project>,
  taskById: Map<string, Task>
): boolean {
  if (!tsId) return false;
  const t = taskById.get(String(tsId));
  if (!t) return false;

  if (t.projectId && project.id) return String(t.projectId).trim() !== String(project.id).trim();

  const ps = norm(project.store);
  const ts = norm(t.projectStore);
  if (ps && ts && ps !== ts) return true;

  const py = String(project.year ?? '').trim();
  const ty = String(t.projectYear ?? '').trim();
  if (py && ty && py !== ty) return true;

  const pCode = norm(project.code);
  const tCode = norm(t.projectCode);
  if (pCode && tCode && pCode !== tCode) {
    const rawCodeCombined = project.linkCodes ? `${project.code || ''}, ${project.linkCodes}` : String(project.code || '');
    const pCodeParts = rawCodeCombined.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
    if (!pCodeParts.includes(tCode)) return true;
  }

  return false;
}
