import { updateDoc } from "../lib/firebase";
import { db, APP_ID } from "./firebase";
import { doc } from 'firebase/firestore';
import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getTaskStatus, computeActProgressPercent } from "./utils";

export interface ComputedProjectDates {
  computedTakStart?: string;
  computedTakCompl?: string;
  computedOpening?: string;
  computedPlanProgress?: number;
  computedActProgress?: number;
  taskCount?: number;
  taskSummaries?: { name: string; start: string; finish: string; }[];
}

/**
 * Thuật toán tính toán mốc thời gian tĩnh (Pre-computed Dates) cho Dự án từ danh sách Tasks con:
 * - computedTakStart: Ngày bắt đầu sớm nhất trong các Task con (hoặc giữ project.start)
 * - computedTakCompl: Ngày hoàn thành (finish) muộn nhất trong các Task con (đại diện cho Handover / Pj Compl)
 * - computedOpening: Ngày hoàn thành của Task mang từ khóa "opening" hoặc "open" (hoặc fallback về project.opening)
 */
export function calculateProjectComputedDates(
  project: Partial<Project>,
  projectTasks: Task[],
  delegationGroups: DelegationGroup[] = []
): ComputedProjectDates {
  let computedTakStart = project.start;
  let computedTakCompl: string | undefined = undefined;

  if (projectTasks && projectTasks.length > 0) {
    const validStarts = projectTasks
      .map((t) => t.start)
      .filter(Boolean)
      .sort();
    if (validStarts.length > 0) {
      computedTakStart = validStarts[0];
    }

    const validFinishes = projectTasks
      .map((t) => t.finish)
      .filter(Boolean)
      .sort((a, b) => (b || "").localeCompare(a || ""));
    if (validFinishes.length > 0) {
      computedTakCompl = validFinishes[0];
    }
  }

  let computedOpening = project.opening;
  const openingTasks = (projectTasks || []).filter((t) => {
    const name = String(t.name || "").toLowerCase();
    return name.includes("opening") || name.includes("open");
  });
  if (openingTasks.length > 0) {
    const validFinishes = openingTasks
      .map((t) => t.finish)
      .filter(Boolean)
      .sort((a, b) => (b || "").localeCompare(a || ""));
    if (validFinishes.length > 0) {
      computedOpening = validFinishes[0];
    }
  }

  const planProgressPercent = projectTasks.length > 0 
    ? Math.round((projectTasks.filter(t => t.start && t.finish && getTaskStatus(t.start, t.finish) === "Completed").length / projectTasks.length) * 100) 
    : 0;
  
  const actProgressPercent = computeActProgressPercent(projectTasks, delegationGroups);

  const taskSummaries = projectTasks
    .filter(t => t.start && t.finish && t.name)
    .map(t => ({
      name: t.name!,
      start: t.start!,
      finish: t.finish!
    }));

  const taskCount = projectTasks ? projectTasks.length : (project.taskCount ?? 0);

  return {
    computedTakStart: computedTakStart || "",
    computedTakCompl: computedTakCompl || "",
    computedOpening: computedOpening || "",
    computedPlanProgress: planProgressPercent,
    computedActProgress: actProgressPercent,
    taskCount,
    taskSummaries,
  };
}

/**
 * Cập nhật các trường computed dates lên document taka_projects trong Firestore
 * và cập nhật nhanh vào Zustand Store để giao diện phản hồi tức thời.
 */
export async function syncProjectDatesToFirestore(
  projectId: string,
  dates: ComputedProjectDates
): Promise<void> {
  if (!projectId) return;

  try {
    const projectRef = doc(
      db,
      "artifacts",
      APP_ID,
      "public",
      "data",
      "taka_projects",
      projectId
    );

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (dates.computedTakStart !== undefined) {
      updatePayload.computedTakStart = dates.computedTakStart;
    }
    if (dates.computedTakCompl !== undefined) {
      updatePayload.computedTakCompl = dates.computedTakCompl;
    }
    if (dates.computedOpening !== undefined) {
      updatePayload.computedOpening = dates.computedOpening;
    }
    if (dates.computedPlanProgress !== undefined) {
      updatePayload.computedPlanProgress = dates.computedPlanProgress;
    }
    if (dates.computedActProgress !== undefined) {
      updatePayload.computedActProgress = dates.computedActProgress;
    }
    if (dates.taskCount !== undefined) {
      updatePayload.taskCount = dates.taskCount;
    }
    if (dates.taskSummaries !== undefined) {
      updatePayload.taskSummaries = dates.taskSummaries;
    }

    updateDoc(projectRef, updatePayload).catch(console.error);

    // Optimistic store update
    const { projects, setProjects } = useAppStore.getState();
    const updated = projects.map((p) => {
      if (p.id === projectId) {
        return {
          ...p,
          ...dates,
        };
      }
      return p;
    });
    setProjects(updated);
  } catch (error) {
    console.error(`Error syncing computed dates for project ${projectId}:`, error);
  }
}

/**
 * Đồng bộ computed dates cho một dự án dựa trên projectCode, store, year và danh sách task hiện có.
 */
export async function syncProjectDatesByCode(
  projectCode: string,
  projectStore?: string,
  projectYear?: string | number,
  overrideTasks?: Task[]
): Promise<void> {
  if (!projectCode) return;

  const { projects, tasks, delegationGroups } = useAppStore.getState();
  const project = projects.find(
    (p) =>
      p.code === projectCode &&
      (!projectStore || String(p.store).toLowerCase() === String(projectStore).toLowerCase()) &&
      (!projectYear || String(p.year) === String(projectYear))
  );

  if (!project || !project.id) return;

  const currentTasks = overrideTasks || tasks;
  const projectTasks = currentTasks.filter(
    (t) =>
      t.projectCode === projectCode &&
      (!projectStore || String(t.projectStore || project.store).toLowerCase() === String(projectStore).toLowerCase()) &&
      (!projectYear || String(t.projectYear || project.year) === String(projectYear))
  );

  const dates = calculateProjectComputedDates(project, projectTasks, delegationGroups);
  await syncProjectDatesToFirestore(project.id, dates);
}

let hasBackfilledInSession = false;

/**
 * Tự động backfill trường computed dates cho các Project trong Firestore
 * nếu Project đó chưa có computedTakCompl / computedOpening.
 * Chỉ chạy 1 lần duy nhất trong toàn bộ phiên làm việc của user để tiết kiệm write.
 */
export async function backfillMissingProjectDates(
  projects: Project[],
  tasks: Task[],
  delegationGroups: DelegationGroup[] = []
): Promise<number> {
  if (hasBackfilledInSession || !projects.length || !tasks.length) return 0;
  hasBackfilledInSession = true;

  const tasksByProject = new Map<string, Task[]>();
  tasks.forEach((t) => {
    const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`.toLowerCase();
    if (!tasksByProject.has(key)) tasksByProject.set(key, []);
    tasksByProject.get(key)!.push(t);
  });

  let count = 0;
  for (const p of projects) {
    if (!p.id || !p.code) continue;

    const key = `${p.code || ""}-${p.year || ""}-${p.store || ""}`.toLowerCase();
    const pTasks = tasksByProject.get(key) || [];
    if (pTasks.length === 0) continue;

    const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);

    // Chỉ cập nhật nếu Firestore chưa có hoặc khác biệt
    const needsUpdate =
      !p.computedTakCompl ||
      p.computedTakCompl !== computed.computedTakCompl ||
      !p.computedTakStart ||
      p.computedTakStart !== computed.computedTakStart ||
      (!p.computedOpening && Boolean(computed.computedOpening)) ||
      p.computedPlanProgress === undefined ||
      p.computedActProgress === undefined ||
      p.taskCount === undefined ||
      p.taskCount !== computed.taskCount;

    if (needsUpdate) {
      count++;
      await syncProjectDatesToFirestore(p.id, computed);
    }
  }

  if (count > 0) {
    console.info(`[projectDatesService] Backfilled computed dates for ${count} projects`);
  }
  return count;
}

