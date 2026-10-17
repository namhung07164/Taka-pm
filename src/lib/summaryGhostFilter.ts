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

  if (t.projectId && project.id) return String(t.projectId) !== String(project.id);

  const ps = norm(project.store);
  const ts = norm(t.projectStore);
  if (ps && ts && ps !== ts) return true;

  const pCode = norm(project.code);
  const tCode = norm(t.projectCode);
  if (pCode && tCode && pCode !== tCode) return true;

  const py = String(project.year ?? '').trim();
  const ty = String(t.projectYear ?? '').trim();
  if (py && ty && py !== ty) {
    // Nếu trong store có nhiều hơn 1 dự án cùng mã pCode (ví dụ dự án lặp lại mỗi năm), mới coi khác năm là ngoại lai.
    // Còn nếu mã dự án pCode là duy nhất trong store (dự án kéo dài vắt qua 2 năm 2026-2027), thì task đó thuộc chính dự án này!
    const allProjects = useAppStore.getState().projects || [];
    const hasOtherProjectForTaskYear = allProjects.some(
      (other) =>
        !(other as any).isDeleted &&
        String(other.id) !== String(project.id) &&
        norm(other.code) === pCode &&
        (!ps || !other.store || norm(other.store) === ps) &&
        String(other.year ?? '').trim() === ty
    );
    return hasOtherProjectForTaskYear;
  }

  return false;
}
