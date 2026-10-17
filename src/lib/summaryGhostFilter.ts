import type { Project, Task } from '../types';

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

/**
 * Mục tóm tắt là "ma" nếu id của nó trùng một task THẬT đang nạp nhưng task đó thuộc dự án khác
 * (khác projectId, hoặc cùng thiếu projectId nhưng khác store/năm một cách rõ ràng).
 * Không kết luận khi task chưa nạp: khi đó mục tóm tắt vẫn hiển thị như cũ.
 */
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

  const py = String(project.year ?? '').trim();
  const ty = String(t.projectYear ?? '').trim();
  if (py && ty && py !== ty) return true;

  return false;
}
