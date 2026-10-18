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

  const pYear = project.year !== undefined && project.year !== null ? String(project.year).trim().toLowerCase() : '';
  const pStore = project.store ? String(project.store).trim().toLowerCase() : '';
  const pCodeLower = String(project.code || '').trim().toLowerCase();
  const rawCodeStr = project.linkCodes ? `${project.code || ''}, ${project.linkCodes}` : String(project.code || '');
  const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const pIdStr = project.id ? String(project.id).trim() : '';

  const matchedMap = new Map<string, Task>();

  safeAllTasks.forEach(t => {
    if (!t || !t.id || t.isDeleted) return;
    if (String(t.id).startsWith('ts_') || (t as any)._isVirtualSummary) return;
    if (isTaskDeletedInTracker(t.id, pIdStr || undefined)) return;

    const tProjId = t.projectId ? String(t.projectId).trim() : '';
    const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
    const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim().toLowerCase() : '';

    // 1. Absolute Guard: If both have IDs and they differ, they are NOT the same project (Rule 16.2).
    if (pIdStr && tProjId && tProjId !== pIdStr) {
      return;
    }

    // 2. Strict Store & Year Factor Isolation (Rule 16.3 & 16.4)
    if (pStore && tStore && pStore !== tStore) return;
    if (pYear && tYear && pYear !== tYear) return;

    // 3. Direct Project ID match after passing Store & Year factors
    if (pIdStr && tProjId && tProjId === pIdStr) {
      matchedMap.set(String(t.id), t);
      return;
    }

    // 4. Fallback to Code + linkCodes when ID is missing on one side
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
      if (!t || !t.id || t.isDeleted || String(t.id).startsWith('ts_') || (t as any)._isVirtualSummary || matchedMap.has(String(t.id))) return;
      if (isTaskDeletedInTracker(t.id, pIdStr || undefined)) return;
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent && matchedMap.has(String(rawParent))) {
        matchedMap.set(String(t.id), t);
        addedChild = true;
      }
    });
  }

  if (matchedMap.size > 0) {
    return Array.from(matchedMap.values());
  }

  // Fallback to taskSummaries ONLY when no real tasks for this project are loaded in memory
  if (project.taskSummaries && Array.isArray(project.taskSummaries) && project.taskSummaries.length > 0) {
    const taskByIdFallback = buildTaskByIdMap(safeAllTasks);
    const validSummaries = project.taskSummaries
      .filter(ts =>
        !isTaskDeletedInTracker(ts.id, pIdStr || undefined) &&
        !isForeignSummaryEntry(ts.id, project, taskByIdFallback) &&
        Boolean((ts.name && String(ts.name).trim()) || (ts.start && String(ts.start).trim()) || (ts.finish && String(ts.finish).trim()) || ts.taskCodePhu)
      )
      .map((ts, idx) => ({
        id: ts.id || `ts_${project.id || project.code}_${project.store || 'HCM'}_${project.year || ''}_${idx}`,
        name: (ts.name && String(ts.name).trim()) ? ts.name : (ts.taskCodePhu || `Task ${idx + 1}`),
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
        ...ts,
        _isVirtualSummary: true,
      } as unknown as Task));

    return validSummaries;
  }

  return [];
}

import { rollupParentTaskDatesAndStatus, rollupTaskSummaries, filterNonOrphanTasks } from "./taskRollupService";
import { deduplicateTasksInMemory } from "./taskDeduplicationService";

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

  const pIdStr = project.id ? String(project.id) : undefined;
  const existingSummaries = (project.taskSummaries && Array.isArray(project.taskSummaries)) ? project.taskSummaries : [];
  const existingCount = project.taskCount !== undefined ? project.taskCount : existingSummaries.length;

  const rawTasks = (projectTasks || []).filter(t =>
    t &&
    !t.isDeleted &&
    !isTaskDeletedInTracker(t.id, pIdStr) &&
    Boolean((t.name && String(t.name).trim()) || (t.start && String(t.start).trim()) || (t.finish && String(t.finish).trim()) || t.taskCodePhu)
  );
  const hasRealTasks = rawTasks.some(t => !String(t.id || '').startsWith('ts_') && !(t as any)._isVirtualSummary);
  const filteredInputTasks = hasRealTasks
    ? rawTasks.filter(t => !String(t.id || '').startsWith('ts_') && !(t as any)._isVirtualSummary)
    : rawTasks;

  const { dedupedTasks } = deduplicateTasksInMemory(filteredInputTasks, project.code || project.id ? [project as Project] : []);
  const { cleaned: nonOrphanTasks } = filterNonOrphanTasks(dedupedTasks);
  const normalizedTasks = nonOrphanTasks.map(t => ({
    ...t,
    name: (t.name && String(t.name).trim()) ? t.name : (t.taskCodePhu || 'Task'),
  }));

  const rolledUpProjTasks = rollupParentTaskDatesAndStatus(normalizedTasks, delegationGroups);
  const sortedProjTasks = sortGroupTasks(rolledUpProjTasks);

  const taskSummariesRaw = sortedProjTasks
    .map((t, idx) => {
      const summary: {
        name: string;
        start: string;
        finish: string;
        [key: string]: any;
      } = {
        name: (t.name && String(t.name).trim()) ? t.name : (t.taskCodePhu || 'Task'),
        start: t.start || '',
        finish: t.finish || '',
        orderIndex: t.orderIndex !== undefined ? t.orderIndex : idx,
      };
      if (t.id && !String(t.id).startsWith('ts_')) summary.id = t.id;
      else if (t.id) summary.id = t.id;
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
    !isTaskDeletedInTracker(es.id, pIdStr) &&
    Boolean((es.name && String(es.name).trim()) || (es.start && String(es.start).trim()) || (es.finish && String(es.finish).trim()) || es.taskCodePhu)
  );

  const finalSummaries: any[] = sortedProjTasks.length > 0
    ? taskSummaries
    : rollupTaskSummaries(activeExistingSummaries);

  const finalTaskCount = sortedProjTasks.length > 0
    ? finalSummaries.length
    : (Array.isArray(project.taskSummaries) ? finalSummaries.length : existingCount);

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

export {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  backfillMissingProjectDates,
  isDelegationGroupBelongsToProject,
  computeProjectActStatus,
  syncAllProjectsTaskCountFromFirestore,
} from "./projectDatesBackfill";


