import { updateDoc, writeBatch } from "../lib/firebase";
import { db, APP_ID } from "./firebase";
import { doc, collection, getDocs } from 'firebase/firestore';
import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getTaskStatus, computeActProgressPercent, computePlanProgressPercent } from "./utils";

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
 * So sánh 2 mã dự án: hỗ trợ chuỗi đơn, chuỗi nhiều mã phân tách bởi dấu phẩy/chấm phẩy,
 * không phân biệt chữ hoa/thường và khoảng trắng thừa.
 */
export function matchProjectCode(codeA?: string, codeB?: string): boolean {
  if (!codeA || !codeB) return false;
  const a = String(codeA).trim().toLowerCase();
  const b = String(codeB).trim().toLowerCase();
  if (a === b) return true;
  const partsA = a.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const partsB = b.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  return partsA.some(pa => partsB.includes(pa));
}

/**
 * Trích xuất danh sách Task thuộc về một Dự án cụ thể (xử lý chính xác multi-code, store và year).
 */
export function getTasksForProject(project: Partial<Project>, allTasks: Task[]): Task[] {
  if (!project.code || !allTasks || allTasks.length === 0) return [];
  const pYear = project.year ? String(project.year).trim() : '';
  const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
  const pCodeParts = String(project.code).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

  return allTasks.filter(t => {
    if (!t.projectCode) return false;
    const tCode = String(t.projectCode).trim().toLowerCase();
    const matchesCode = tCode === String(project.code).trim().toLowerCase() || pCodeParts.includes(tCode) || matchProjectCode(t.projectCode, project.code);
    if (!matchesCode) return false;

    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
    if (pStore && tStore && pStore !== tStore) return false;

    const tYear = t.projectYear ? String(t.projectYear).trim() : '';
    if (pYear && tYear && pYear !== tYear) return false;

    return true;
  });
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
  let computedTakStart = project.computedTakStart || project.start || "";
  let computedTakCompl = project.computedTakCompl || project.handover || (project as any).takCompl || "";
  let computedOpening = project.computedOpening || project.opening || "";

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

    const openingTasks = projectTasks.filter((t) => {
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
  }

  const planProgressPercent = projectTasks && projectTasks.length > 0 
    ? computePlanProgressPercent(projectTasks) 
    : (project.computedPlanProgress ?? 0);
  
  const actProgressPercent = projectTasks && projectTasks.length > 0
    ? computeActProgressPercent(projectTasks, delegationGroups)
    : (project.computedActProgress ?? 0);

  const taskSummaries = (projectTasks || [])
    .filter(t => t.start && t.finish && t.name)
    .map(t => ({
      name: t.name!,
      start: t.start!,
      finish: t.finish!
    }));

  const taskCount = projectTasks && projectTasks.length > 0 
    ? projectTasks.length 
    : (project.taskCount ?? (projectTasks ? projectTasks.length : 0));

  return {
    computedTakStart: computedTakStart || "",
    computedTakCompl: computedTakCompl || "",
    computedOpening: computedOpening || "",
    computedPlanProgress: planProgressPercent,
    computedActProgress: actProgressPercent,
    taskCount,
    taskSummaries: taskSummaries.length > 0 ? taskSummaries : (project.taskSummaries || []),
  };
}

/**
 * Cập nhật các trường computed dates lên document taka_projects trong Firestore
 * và cập nhật nhanh vào Zustand Store để giao diện phản hồi tức thời.
 * Đã tích hợp Dirty Check: Chỉ ghi vào Firestore khi có sự thay đổi thực sự
 * về mốc thời gian (start, finish/compl, opening), tiến độ hoặc số lượng task.
 */
export async function syncProjectDatesToFirestore(
  projectId: string,
  dates: ComputedProjectDates
): Promise<void> {
  if (!projectId) return;

  try {
    const { projects, setProjects } = useAppStore.getState();
    const existingProject = projects.find((p) => p.id === projectId);

    // Dirty Check: Chỉ gửi lệnh ghi vào Firestore nếu các chỉ số cốt lõi (ngày, tiến độ, số lượng task) thực sự thay đổi.
    // Nếu chỉ sửa comment, ghi chú hay đổi tên đơn thuần không làm đổi mốc thời gian/tiến độ -> bỏ qua Write to Firestore (0 write).
    const hasChanged =
      !existingProject ||
      (existingProject.computedTakStart || "") !== (dates.computedTakStart || "") ||
      (existingProject.computedTakCompl || "") !== (dates.computedTakCompl || "") ||
      (existingProject.computedOpening || "") !== (dates.computedOpening || "") ||
      Number(existingProject.computedPlanProgress ?? 0) !== Number(dates.computedPlanProgress ?? 0) ||
      Number(existingProject.computedActProgress ?? 0) !== Number(dates.computedActProgress ?? 0) ||
      Number(existingProject.taskCount ?? 0) !== Number(dates.taskCount ?? 0);

    // Cập nhật Optimistic in-memory Store tức thời (0ms) để UI đồng bộ mượt mà
    if (existingProject) {
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
    }

    if (!hasChanged) {
      // Dữ liệu tổng hợp không đổi -> Tiết kiệm 100% lượt Write cho project tổng hợp
      return;
    }

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
      (p.code === projectCode || matchProjectCode(p.code, projectCode)) &&
      (!projectStore || !p.store || String(p.store).trim().toLowerCase() === String(projectStore).trim().toLowerCase()) &&
      (!projectYear || !p.year || String(p.year).trim() === String(projectYear).trim())
  );

  if (!project || !project.id) return;

  const currentTasks = overrideTasks || tasks;
  const projectTasks = getTasksForProject(project, currentTasks);

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

  let count = 0;
  for (const p of projects) {
    if (!p.id || !p.code) continue;

    const pTasks = getTasksForProject(p, tasks);
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

/**
 * Đồng bộ toàn bộ taskCount và thông số tiến độ cho toàn bộ Dự án trên Firestore (Chạy 1 lần cho toàn hệ thống).
 * Đọc tất cả taka_tasks và taka_projects trên Firestore, gom nhóm và ghi batch cập nhật taskCount, taskSummaries,
 * computedTakStart, computedTakCompl, computedPlanProgress, computedActProgress.
 */
export async function syncAllProjectsTaskCountsToFirestore(
  onProgress?: (processed: number, total: number) => void
): Promise<{ updatedCount: number; totalProjects: number }> {
  try {
    const projectsCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
    const tasksCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks");
    const delegationsCol = collection(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups");

    const [projectsSnap, tasksSnap, delegationsSnap] = await Promise.all([
      getDocs(projectsCol),
      getDocs(tasksCol),
      getDocs(delegationsCol),
    ]);

    const allProjects: Project[] = [];
    projectsSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allProjects.push({ id: d.id, ...data });
      }
    });

    const allTasks: Task[] = [];
    tasksSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allTasks.push({ id: d.id, ...data });
      }
    });

    const allDelegations: DelegationGroup[] = [];
    delegationsSnap.forEach((d) => {
      const data = d.data() as any;
      if (!data.isDeleted) {
        allDelegations.push({ id: d.id, ...data });
      }
    });

    // Gom tasks theo project code, year, store
    const tasksByProject = new Map<string, Task[]>();
    allTasks.forEach((t) => {
      const key = `${t.projectCode || ""}-${t.projectYear || ""}-${t.projectStore || ""}`.toLowerCase();
      if (!tasksByProject.has(key)) tasksByProject.set(key, []);
      tasksByProject.get(key)!.push(t);
    });

    let updatedCount = 0;
    const batchSize = 400;
    let currentBatch = writeBatch(db);
    let batchOpCount = 0;

    const total = allProjects.length;

    for (let i = 0; i < total; i++) {
      const p = allProjects[i];
      if (!p.id || !p.code) continue;

      const key = `${p.code || ""}-${p.year || ""}-${p.store || ""}`.toLowerCase();
      const pTasks = tasksByProject.get(key) || [];

      const computed = calculateProjectComputedDates(p, pTasks, allDelegations);

      const needsUpdate =
        p.taskCount === undefined ||
        p.taskCount !== computed.taskCount ||
        !p.computedTakCompl ||
        p.computedTakCompl !== computed.computedTakCompl ||
        !p.computedTakStart ||
        p.computedTakStart !== computed.computedTakStart ||
        p.computedPlanProgress === undefined ||
        p.computedActProgress === undefined;

      if (needsUpdate) {
        const pRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", p.id);
        currentBatch.update(pRef, {
          updatedAt: new Date().toISOString(),
          taskCount: computed.taskCount ?? 0,
          taskSummaries: computed.taskSummaries || [],
          computedTakStart: computed.computedTakStart || "",
          computedTakCompl: computed.computedTakCompl || "",
          computedOpening: computed.computedOpening || "",
          computedPlanProgress: computed.computedPlanProgress ?? 0,
          computedActProgress: computed.computedActProgress ?? 0,
        });
        batchOpCount++;
        updatedCount++;

        if (batchOpCount >= batchSize) {
          await currentBatch.commit();
          currentBatch = writeBatch(db);
          batchOpCount = 0;
        }
      }

      if (onProgress && (i % 10 === 0 || i === total - 1)) {
        onProgress(i + 1, total);
      }
    }

    if (batchOpCount > 0) {
      await currentBatch.commit();
    }

    console.info(`[projectDatesService] Successfully synchronized taskCount for ${updatedCount}/${total} projects.`);
    return { updatedCount, totalProjects: total };
  } catch (error) {
    console.error("[projectDatesService] Error syncing all project taskCounts:", error);
    throw error;
  }
}


