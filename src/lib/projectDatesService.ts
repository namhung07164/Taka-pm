import { setDoc, updateDoc, writeBatch } from "./firestoreWrites";
import { db, APP_ID } from "./firebase";
import { doc, collection, getDocs } from 'firebase/firestore';
import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getTaskStatus, computeActProgressPercent, computePlanProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries, getStatus, resolveActualStatus } from "./utils";
import { sortGroupTasks } from "./ganttUtils";
import { isTaskDeletedInTracker } from "./taskDeletedTracker";
import { buildTaskByIdMap, isForeignSummaryEntry } from './summaryGhostFilter';

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
  if (!project) return [];
  const safeAllTasks = Array.isArray(allTasks) ? allTasks : [];

  const pYear = project.year !== undefined && project.year !== null ? String(project.year).trim() : '';
  const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
  const pCodeLower = String(project.code || '').trim().toLowerCase();
  const rawCodeStr = project.linkCodes ? `${project.code || ''}, ${project.linkCodes}` : String(project.code || '');
  const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const pIdStr = project.id ? String(project.id) : '';

  const allProjects = useAppStore.getState().projects || [];
  const sameCodeStoreProjects = pCodeLower
    ? allProjects.filter(
        proj =>
          !(proj as any).isDeleted &&
          String(proj.code || '').trim().toLowerCase() === pCodeLower &&
          (!pStore || !proj.store || String(proj.store).trim().toLowerCase() === pStore)
      )
    : [];
  const isUniqueCodeInStore = sameCodeStoreProjects.length <= 1;

  const matchedMap = new Map<string, Task>();

  safeAllTasks.forEach(t => {
    if (!t || !t.id || t.isDeleted) return;
    if (isTaskDeletedInTracker(t.id, pIdStr || undefined)) return;

    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim().toLowerCase() : '';

    if (pIdStr && t.projectId && String(t.projectId) === pIdStr) {
      if (pStore && tStore && pStore !== tStore) return;
      if (!isUniqueCodeInStore && pYear && tYear && pYear !== tYear) return;

      matchedMap.set(String(t.id), t);
      return;
    }

    // Absolute Guard: If both have IDs and they differ, they are NOT the same project.
    if (pIdStr && t.projectId && String(t.projectId) !== pIdStr) {
      return;
    }

    // Strict Store & Year Isolation (allowing unique project code in store to span across years)
    if (pStore && tStore && pStore !== tStore) return;
    if (!isUniqueCodeInStore && pYear && tYear && pYear !== tYear) return;

    if (t.projectCode && project.code) {
      const tCode = String(t.projectCode).trim().toLowerCase();
      const matchesCode = tCode === pCodeLower ||
                          pCodeParts.includes(tCode) ||
                          matchProjectCode(t.projectCode, project.code) ||
                          matchProjectCode(t.projectCode, project.linkCodes);
      if (matchesCode) {
        matchedMap.set(String(t.id), t);
      }
    }
  });

  // Also include subtasks whose parent belongs to matchedMap
  let addedChild = true;
  while (addedChild) {
    addedChild = false;
    safeAllTasks.forEach(t => {
      if (!t || !t.id || t.isDeleted || matchedMap.has(String(t.id))) return;
      if (isTaskDeletedInTracker(t.id, pIdStr || undefined)) return;
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent && matchedMap.has(String(rawParent))) {
        matchedMap.set(String(t.id), t);
        addedChild = true;
      }
    });
  }

  // Fallback or supplement with taskSummaries when tasks for this project are not loaded (or only partially cached) in memory
  if (project.taskSummaries && Array.isArray(project.taskSummaries) && project.taskSummaries.length > 0) {
    const taskByIdFallback = buildTaskByIdMap(safeAllTasks);
    const validSummaries = project.taskSummaries
      .filter(ts => !isTaskDeletedInTracker(ts.id, pIdStr || undefined) && !isForeignSummaryEntry(ts.id, project, taskByIdFallback))
      .map((ts, idx) => ({
        id: ts.id || `ts_${project.id || project.code}_${project.store || 'HCM'}_${project.year || ''}_${idx}`,
        name: ts.name || `Task ${idx + 1}`,
        start: ts.start || project.computedTakStart || project.start || '',
        finish: ts.finish || project.computedTakCompl || project.handover || '',
        projectCode: project.code || '',
        projectStore: project.store || 'HCM',
        projectYear: project.year ? String(project.year) : '',
        party: ts.party || project.party || '',
        runningStatus: ts.runningStatus || 'On process',
        duration: ts.duration || '',
        parentTaskId: ts.parentTaskId,
        taskCodePhu: ts.taskCodePhu || (project.code ? `${project.code}#${idx + 1}` : undefined),
        orderIndex: ts.orderIndex !== undefined ? ts.orderIndex : idx,
        projectId: project.id,
        ...ts
      } as Task));

    if (matchedMap.size === 0) {
      return validSummaries;
    }

    // If project is collapsed/partially hydrated and project.taskSummaries from server has newly added tasks not yet in matchedMap, include them
    if (validSummaries.length > matchedMap.size) {
      validSummaries.forEach((st) => {
        if (st.id && !matchedMap.has(String(st.id))) {
          matchedMap.set(String(st.id), st);
        }
      });
    }
  }

  return Array.from(matchedMap.values());
}

import { rollupParentTaskDatesAndStatus, rollupTaskSummaries } from "./taskRollupService";

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

  const existingSummaries = (project.taskSummaries && Array.isArray(project.taskSummaries)) ? project.taskSummaries : [];
  const existingCount = project.taskCount !== undefined ? project.taskCount : existingSummaries.length;

  const rolledUpProjTasks = rollupParentTaskDatesAndStatus(projectTasks || [], delegationGroups);
  const sortedProjTasks = sortGroupTasks(rolledUpProjTasks);

  const taskSummariesRaw = sortedProjTasks
    .filter(t => Boolean(t.name))
    .map((t, idx) => {
      const summary: {
        name: string;
        start: string;
        finish: string;
        [key: string]: any;
      } = {
        name: t.name || '',
        start: t.start || '',
        finish: t.finish || '',
        orderIndex: t.orderIndex !== undefined ? t.orderIndex : idx,
      };
      if (t.id) summary.id = t.id;
      if (t.duration !== undefined && t.duration !== null) summary.duration = t.duration;
      if (t.parentTaskId) summary.parentTaskId = t.parentTaskId;
      if (t.taskCodePhu) summary.taskCodePhu = t.taskCodePhu;
      if (t.runningStatus) summary.runningStatus = t.runningStatus;
      if (t.approval) summary.approval = t.approval;
      if (t.party) summary.party = t.party;
      if (t.delegation !== undefined) summary.delegation = t.delegation;
      return summary;
    });

  const taskSummaries = rollupTaskSummaries(taskSummariesRaw);

  const activeExistingSummaries = existingSummaries.filter((es: any) => 
    !isTaskDeletedInTracker(es.id, project.id ? String(project.id) : undefined)
  );

  const finalSummaries: any[] = sortedProjTasks.length > 0
    ? taskSummaries
    : rollupTaskSummaries(activeExistingSummaries);

  const finalTaskCount = projectTasks && projectTasks.length > 0
    ? projectTasks.length
    : (finalSummaries.length > 0 ? finalSummaries.length : existingCount);

  // Compute start / compl / opening across the unified summaries and tasks
  const allKnownForDates = finalSummaries.length > 0 ? finalSummaries : sortedProjTasks;
  const validStarts = allKnownForDates
    .map((t: any) => t.start)
    .filter(Boolean)
    .sort();
  if (validStarts.length > 0) {
    computedTakStart = validStarts[0];
  } else {
    computedTakStart = project.start || "";
  }

  const validFinishes = allKnownForDates
    .map((t: any) => t.finish)
    .filter(Boolean)
    .sort((a: string, b: string) => (b || "").localeCompare(a || ""));
  if (validFinishes.length > 0) {
    computedTakCompl = validFinishes[0];
  } else {
    computedTakCompl = project.handover || (project as any).takCompl || "";
  }

  const openingTasks = allKnownForDates.filter((t: any) => {
    const name = String(t.name || "").toLowerCase();
    return name.includes("opening") || name.includes("open");
  });
  if (openingTasks.length > 0) {
    const validOpeningFinishes = openingTasks
      .map((t: any) => t.finish)
      .filter(Boolean)
      .sort((a: string, b: string) => (b || "").localeCompare(a || ""));
    if (validOpeningFinishes.length > 0) {
      computedOpening = validOpeningFinishes[0];
    } else {
      computedOpening = project.opening || "";
    }
  } else if (allKnownForDates.length > 0 || (Array.isArray(projectTasks) && projectTasks.length > 0)) {
    computedOpening = project.opening || "";
  } else if (!computedOpening) {
    computedOpening = project.computedOpening || project.opening || "";
  }

  const planProgressPercent = projectTasks && projectTasks.length > 0
    ? computePlanProgressPercent(projectTasks)
    : (finalSummaries.length > 0 
        ? computePlanProgressFromSummaries(finalSummaries) 
        : (project.computedPlanProgress ?? 0));
  
  const actProgressPercent = projectTasks && projectTasks.length > 0
    ? computeActProgressPercent(projectTasks, delegationGroups)
    : (finalSummaries.length > 0 
        ? computeActProgressFromSummaries(finalSummaries) 
        : (project.computedActProgress ?? 0));

  return {
    computedTakStart: computedTakStart || "",
    computedTakCompl: computedTakCompl || "",
    computedOpening: computedOpening || "",
    computedPlanProgress: planProgressPercent,
    computedActProgress: actProgressPercent,
    taskCount: finalTaskCount,
    taskSummaries: finalSummaries,
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
    const existingCount = existingProject?.taskCount || existingProject?.taskSummaries?.length || 0;
    const existingSummaries = existingProject?.taskSummaries || [];

    // When computed, dates.taskSummaries and dates.taskCount are authoritative
    const safeTaskSummaries = dates.taskSummaries !== undefined ? dates.taskSummaries : existingSummaries;
    const safeTaskCount = dates.taskCount !== undefined ? dates.taskCount : existingCount;

    // Dirty Check: Chỉ gửi lệnh ghi vào Firestore nếu các chỉ số cốt lõi (ngày, tiến độ, số lượng task, taskSummaries) thực sự thay đổi.
    // Nếu chỉ sửa comment, ghi chú hay đổi tên đơn thuần không làm đổi mốc thời gian/tiến độ -> bỏ qua Write to Firestore (0 write).
    const hasChanged =
      !existingProject ||
      (existingProject.computedTakStart || "") !== (dates.computedTakStart || "") ||
      (existingProject.computedTakCompl || "") !== (dates.computedTakCompl || "") ||
      (existingProject.computedOpening || "") !== (dates.computedOpening || "") ||
      Number(existingProject.computedPlanProgress ?? 0) !== Number(dates.computedPlanProgress ?? 0) ||
      Number(existingProject.computedActProgress ?? 0) !== Number(dates.computedActProgress ?? 0) ||
      Number(existingProject.taskCount ?? 0) !== Number(safeTaskCount ?? dates.taskCount ?? 0) ||
      JSON.stringify(existingProject.taskSummaries || []) !== JSON.stringify(safeTaskSummaries || dates.taskSummaries || []);

    // Cập nhật Optimistic in-memory Store tức thời (0ms) để UI đồng bộ mượt mà
    let updatedProjectObj: Project | null = null;
    if (existingProject) {
      const updated = projects.map((p) => {
        if (p.id === projectId) {
          updatedProjectObj = {
            ...p,
            ...dates,
            taskCount: safeTaskCount !== undefined ? safeTaskCount : dates.taskCount,
            taskSummaries: safeTaskSummaries !== undefined ? safeTaskSummaries : dates.taskSummaries,
          };
          return updatedProjectObj;
        }
        return p;
      });
      setProjects(updated);
      if (updatedProjectObj && hasChanged) {
        import("./localDb")
          .then(({ bulkPersistProjects }) => bulkPersistProjects([updatedProjectObj!]))
          .catch(() => {});
      }
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
    if (safeTaskCount !== undefined) {
      updatePayload.taskCount = safeTaskCount;
    }
    if (safeTaskSummaries !== undefined) {
      updatePayload.taskSummaries = safeTaskSummaries.map((ts: any) => {
        const item: Record<string, any> = {};
        for (const [k, v] of Object.entries(ts)) {
          if (v !== undefined) {
            item[k] = v;
          }
        }
        return item;
      });
    }

    const { markExplicitDelta } = await import("./autoDeltaQueue");
    markExplicitDelta([{ docId: projectId, collectionName: "taka_projects" }]);

    await setDoc(projectRef, updatePayload, { merge: true });

    // Phát tín hiệu delta của taka_projects để các thiết bị khác đồng bộ real-time
    const { recordDelta } = await import("./deltaSyncService");
    recordDelta({
      docId: projectId,
      collectionName: "taka_projects",
      action: "update",
      isPatch: true,
      data: updatePayload,
      year: existingProject?.year ? String(existingProject.year) : undefined,
    }).catch(() => {});
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
  overrideTasks?: Task[],
  targetProjectId?: string
): Promise<void> {
  if (!projectCode && !targetProjectId) return;

  const { projects, tasks, delegationGroups } = useAppStore.getState();
  const project = projects.find(
    (p) => {
      if (targetProjectId && String(p.id) === String(targetProjectId)) return true;
      if (targetProjectId && String(p.id) !== String(targetProjectId)) return false;
      return (
        (p.code === projectCode || matchProjectCode(p.code, projectCode)) &&
        (!projectStore || !p.store || String(p.store).trim().toLowerCase() === String(projectStore).trim().toLowerCase()) &&
        (!projectYear || !p.year || String(p.year).trim() === String(projectYear).trim())
      );
    }
  );

  if (!project || !project.id) return;

  const currentTasks = overrideTasks || tasks;
  const projectTasks = getTasksForProject(project, currentTasks);

  const dates = calculateProjectComputedDates(project, projectTasks, delegationGroups);
  await syncProjectDatesToFirestore(project.id, dates);
}

/**
 * Tính toán trạng thái thực tế (Actual Status) của Dự án dựa trên các Delegation Groups và Tasks.
 * Ưu tiên: Rejected > Completed > Pending Completed > In Progress > Planned.
 */
export function computeProjectActStatus(
  p: Project,
  delegationGroups: DelegationGroup[] = [],
  matchedTasks: Task[] = []
): string {
  // Nếu có manual override actStatus hoặc actualStatus trong DB, dùng nó.
  const pAny = p as any;
  if (pAny.actStatus) return String(pAny.actStatus);
  if (pAny.actualStatus) return String(pAny.actualStatus);

  if (delegationGroups && delegationGroups.length > 0) {
    const matchedTaskIds = new Set(matchedTasks.map(t => t.id).filter(Boolean));
    const pGroups = delegationGroups.filter(g => isDelegationGroupBelongsToProject(g, p, matchedTaskIds));

    if (pGroups.length > 0) {
      const statuses = pGroups.map(g => {
        if (g.actStatus) return g.actStatus;
        return resolveActualStatus(p.computedStatus || 'On process', g.subTasks || []).label;
      });
      if (statuses.some(s => s === 'Rejected' || s === 'Correction Needed')) return 'Rejected';
      if (statuses.every(s => s === 'Completed')) return 'Completed';
      if (statuses.some(s => s === 'Pending Completed' || s === 'Pending Approval' || s === 'Review Late')) return 'Pending Completed';
      if (statuses.some(s => s === 'In Progress' || s === 'On Process' || s === 'Delayed' || s === 'Accepted')) return 'In Progress';
      return statuses[0] || 'Planned';
    }
  }

  if (p.computedActProgress === 100) return 'Completed';
  const plStatus = p.computedStatus || getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
  if (plStatus === 'Completed') return 'Completed';
  if (plStatus === 'Canceled') return 'Cancel';
  if (p.computedActProgress && p.computedActProgress > 0) return 'In Progress';
  if (plStatus === 'On process' || plStatus === 'Handover') return 'In Progress';
  return 'Planned';
}

export function isDelegationGroupBelongsToProject(
  g: DelegationGroup | undefined | null,
  p: Partial<Project> | undefined | null,
  matchedTaskIds?: Set<string>
): boolean {
  if (!g || !p || g.isDeleted || (p as any).isDeleted) return false;

  if (g.parentTaskId && matchedTaskIds && matchedTaskIds.has(g.parentTaskId)) {
    return true;
  }

  const gProjId = g.projectId ? String(g.projectId).trim() : '';
  const pId = p.id ? String(p.id).trim() : '';
  if (gProjId && pId && gProjId !== pId) return false;

  const gStore = g.projectStore ? String(g.projectStore).trim().toUpperCase() : '';
  const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
  if (gStore && pStore && gStore !== pStore) return false;

  const gYear = g.projectYear !== undefined && g.projectYear !== null ? String(g.projectYear).trim() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
  if (gYear && pYear && gYear !== pYear) return false;

  if (gProjId && pId && gProjId === pId) return true;

  if (!g.projectCode || !p.code) return false;
  const gCode = String(g.projectCode).trim().toLowerCase();
  return gCode === String(p.code).trim().toLowerCase() || matchProjectCode(g.projectCode, p.code);
}

export {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  backfillMissingProjectDates,
} from "./projectDatesBackfill";

/**
 * Lệnh cưỡng bức đồng bộ lại Task Count từ Firestore cho toàn bộ dự án
 * (Dùng để sửa lỗi iPad/iPhone lệch count khi snapshot cache bị cũ)
 */
export async function syncAllProjectsTaskCountFromFirestore(): Promise<{ updatedCount: number; totalProjects: number }> {
  try {
    const { projects, tasks, delegationGroups } = useAppStore.getState();
    const totalProjects = projects.length;
    let updatedCount = 0;

    // Chỉ thực hiện trên 200 dự án gần nhất hoặc đang hiển thị để tránh quá tải
    for (const p of projects) {
      if (!p.id || p.isDeleted) continue;

      // 1. Lấy task thật đang có trong RAM (đã được onSnapshot nạp đầy đủ)
      const pTasks = getTasksForProject(p, tasks);
      
      // 2. Tính toán lại bộ chỉ số
      const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);

      // 3. So khớp: nếu lệch count hoặc lệch summaries thì ghi đè Firestore
      const hasDiscrepancy = 
        p.taskCount !== computed.taskCount || 
        (p.taskSummaries?.length || 0) !== (computed.taskSummaries?.length || 0);

      if (hasDiscrepancy) {
        await syncProjectDatesToFirestore(p.id, computed);
        updatedCount++;
      }
    }

    return { updatedCount, totalProjects };
  } catch (err: any) {
    console.error("[syncAllProjectsTaskCountFromFirestore] Sync Failed", err);
    useAppStore.getState().setToast({ title: "Sync Failed", message: err.message || "Error syncing task counts", type: "error" });
    return { updatedCount: 0, totalProjects: 0 };
  }
}


