import { setDoc, updateDoc, writeBatch } from "../lib/firebase";
import { db, APP_ID } from "./firebase";
import { doc, collection, getDocs } from 'firebase/firestore';
import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getTaskStatus, computeActProgressPercent, computePlanProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries } from "./utils";
import { sortGroupTasks } from "./ganttUtils";

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
  const rawCodeStr = project.linkCodes ? `${project.code || ''}, ${project.linkCodes}` : String(project.code || '');
  const pCodeParts = rawCodeStr.toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const pIdStr = project.id ? String(project.id) : '';

  const matchedMap = new Map<string, Task>();

  safeAllTasks.forEach(t => {
    if (!t || !t.id || t.isDeleted) return;

    if (pIdStr && t.projectId && String(t.projectId) === pIdStr) {
      matchedMap.set(String(t.id), t);
      return;
    }

    if (t.projectCode && project.code) {
      const tCode = String(t.projectCode).trim().toLowerCase();
      const matchesCode = tCode === String(project.code).trim().toLowerCase() ||
                          pCodeParts.includes(tCode) ||
                          matchProjectCode(t.projectCode, project.code) ||
                          matchProjectCode(t.projectCode, project.linkCodes);
      if (matchesCode) {
        const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
        if (pStore && tStore && pStore !== tStore) return;

        const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
        if (pYear && tYear && pYear !== tYear) return;

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
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent && matchedMap.has(String(rawParent))) {
        matchedMap.set(String(t.id), t);
        addedChild = true;
      }
    });
  }

  const matchedList = Array.from(matchedMap.values());
  if (matchedList.length > 0) {
    // Safety guard: If memory only has a partial task set (e.g. mobile or lazy loading),
    // merge in any remaining tasks from project.taskSummaries so task list never shrinks!
    if (project.taskSummaries && Array.isArray(project.taskSummaries) && project.taskSummaries.length > matchedList.length) {
      const existingSummaryMap = new Map<string, any>();
      matchedList.forEach(t => {
        if (t.id) existingSummaryMap.set(String(t.id).toLowerCase(), t);
        if (t.taskCodePhu) existingSummaryMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
        if (t.name) existingSummaryMap.set(String(t.name).trim().toLowerCase(), t);
      });
      const mergedList = [...matchedList];
      project.taskSummaries.forEach((ts, idx) => {
        const tsId = ts.id ? String(ts.id).toLowerCase() : '';
        const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
        const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
        const hasMatch = (tsId && existingSummaryMap.has(tsId)) ||
                         (tsCode && existingSummaryMap.has(tsCode)) ||
                         (tsName && existingSummaryMap.has(tsName));
        if (!hasMatch) {
          mergedList.push({
            id: ts.id || `ts_${project.code || project.id}_${project.store || 'HCM'}_${project.year || ''}_${idx}`,
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
          } as Task);
        }
      });
      return mergedList;
    }
    return matchedList;
  }

  // Fallback to taskSummaries when tasks for this project are not loaded in memory yet
  if (project.taskSummaries && Array.isArray(project.taskSummaries) && project.taskSummaries.length > 0) {
    return project.taskSummaries.map((ts, idx) => ({
      id: ts.id || `ts_${project.code || project.id}_${project.store || 'HCM'}_${project.year || ''}_${idx}`,
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
  }

  return [];
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
  let computedTakStart = project.start || "";
  let computedTakCompl = project.handover || (project as any).takCompl || "";
  let computedOpening = project.opening || "";

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
    } else {
      computedOpening = project.opening || "";
    }
  } else if (project.taskSummaries && project.taskSummaries.length > 0) {
    const validStarts = project.taskSummaries
      .map((t) => t.start)
      .filter(Boolean)
      .sort();
    if (validStarts.length > 0) {
      computedTakStart = validStarts[0];
    }

    const validFinishes = project.taskSummaries
      .map((t) => t.finish)
      .filter(Boolean)
      .sort((a, b) => (b || "").localeCompare(a || ""));
    if (validFinishes.length > 0) {
      computedTakCompl = validFinishes[0];
    }

    const openingTasks = project.taskSummaries.filter((t) => {
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
    } else {
      computedOpening = project.opening || "";
    }
  } else {
    computedOpening = project.opening || "";
  }

  const existingSummaries = (project.taskSummaries && Array.isArray(project.taskSummaries)) ? project.taskSummaries : [];
  const existingCount = project.taskCount !== undefined ? project.taskCount : existingSummaries.length;

  const sortedProjTasks = sortGroupTasks(projectTasks || []);

  const taskSummaries = sortedProjTasks
    .filter(t => t.start || t.finish || t.name)
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

  // Always merge existingSummaries and taskSummaries so tasks are NEVER lost or dropped
  const updatedMap = new Map<string, any>();
  taskSummaries.forEach(ts => {
    if (ts.id) updatedMap.set(String(ts.id).toLowerCase(), ts);
    if (ts.taskCodePhu) updatedMap.set(String(ts.taskCodePhu).trim().toLowerCase(), ts);
    if (ts.name) updatedMap.set(String(ts.name).trim().toLowerCase(), ts);
  });

  const finalSummaries: any[] = existingSummaries.map((es) => {
    const esId = es.id ? String(es.id).toLowerCase() : '';
    const esCode = es.taskCodePhu ? String(es.taskCodePhu).trim().toLowerCase() : '';
    const esName = es.name ? String(es.name).trim().toLowerCase() : '';

    const match = (esId && updatedMap.get(esId)) ||
                  (esCode && updatedMap.get(esCode)) ||
                  (esName && updatedMap.get(esName));
    if (match) {
      return {
        ...es,
        name: match.name || es.name || '',
        start: match.start || es.start || '',
        finish: match.finish || es.finish || '',
        duration: match.duration !== undefined ? match.duration : es.duration,
        runningStatus: match.runningStatus || es.runningStatus,
        taskCodePhu: match.taskCodePhu || es.taskCodePhu,
        party: match.party || es.party,
        delegation: match.delegation !== undefined ? match.delegation : es.delegation,
        id: match.id || es.id,
      };
    }
    return es;
  });

  // Append any task from taskSummaries that wasn't already in finalSummaries
  taskSummaries.forEach(ts => {
    const tsId = ts.id ? String(ts.id).toLowerCase() : '';
    const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
    const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
    const alreadyIn = finalSummaries.some(es => 
      (tsId && es.id && String(es.id).toLowerCase() === tsId) ||
      (tsCode && es.taskCodePhu && String(es.taskCodePhu).trim().toLowerCase() === tsCode) ||
      (tsName && es.name && String(es.name).trim().toLowerCase() === tsName)
    );
    if (!alreadyIn && (ts.start || ts.finish || ts.name)) {
      finalSummaries.push(ts);
    }
  });

  const finalTaskCount = Math.max(existingCount, finalSummaries.length, projectTasks?.length || 0);

  // Compute start / compl / opening across the unified summaries and tasks
  const allKnownForDates = finalSummaries.length > 0 ? finalSummaries : sortedProjTasks;
  const validStarts = allKnownForDates
    .map((t: any) => t.start)
    .filter(Boolean)
    .sort();
  if (validStarts.length > 0) {
    computedTakStart = validStarts[0];
  } else if (!computedTakStart) {
    computedTakStart = project.computedTakStart || project.start || "";
  }

  const validFinishes = allKnownForDates
    .map((t: any) => t.finish)
    .filter(Boolean)
    .sort((a: string, b: string) => (b || "").localeCompare(a || ""));
  if (validFinishes.length > 0) {
    computedTakCompl = validFinishes[0];
  } else if (!computedTakCompl) {
    computedTakCompl = project.computedTakCompl || project.handover || (project as any).takCompl || "";
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
    }
  } else if (!computedOpening) {
    computedOpening = project.computedOpening || project.opening || "";
  }

  const planProgressPercent = finalSummaries.length > 0 
    ? computePlanProgressFromSummaries(finalSummaries) 
    : (projectTasks && projectTasks.length > 0
        ? computePlanProgressPercent(projectTasks)
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

    // Safety guard: Never shrink taskCount if memory only had a partial task set
    let safeTaskCount = Math.max(existingCount, dates.taskCount || 0);

    // Safety guard: Never drop or shrink taskSummaries
    const updatedMap = new Map<string, any>();
    (dates.taskSummaries || []).forEach((ts: any) => {
      if (ts.id) updatedMap.set(String(ts.id).toLowerCase(), ts);
      if (ts.taskCodePhu) updatedMap.set(String(ts.taskCodePhu).trim().toLowerCase(), ts);
      if (ts.name) updatedMap.set(String(ts.name).trim().toLowerCase(), ts);
    });

    const mergedSummaries = existingSummaries.map((es: any) => {
      const esId = es.id ? String(es.id).toLowerCase() : '';
      const esCode = es.taskCodePhu ? String(es.taskCodePhu).trim().toLowerCase() : '';
      const esName = es.name ? String(es.name).trim().toLowerCase() : '';
      const match = (esId && updatedMap.get(esId)) ||
                    (esCode && updatedMap.get(esCode)) ||
                    (esName && updatedMap.get(esName));
      return match ? { ...es, ...match } : es;
    });

    (dates.taskSummaries || []).forEach((ts: any) => {
      const tsId = ts.id ? String(ts.id).toLowerCase() : '';
      const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
      const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
      const alreadyIn = mergedSummaries.some((es: any) =>
        (tsId && es.id && String(es.id).toLowerCase() === tsId) ||
        (tsCode && es.taskCodePhu && String(es.taskCodePhu).trim().toLowerCase() === tsCode) ||
        (tsName && es.name && String(es.name).trim().toLowerCase() === tsName)
      );
      if (!alreadyIn && (ts.start || ts.finish || ts.name)) {
        mergedSummaries.push(ts);
      }
    });

    let safeTaskSummaries = mergedSummaries.length >= (dates.taskSummaries?.length || 0)
      ? mergedSummaries
      : (dates.taskSummaries || existingSummaries);
    safeTaskCount = Math.max(safeTaskCount, safeTaskSummaries.length);

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
    if (existingProject) {
      const updated = projects.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            ...dates,
            taskCount: safeTaskCount !== undefined ? safeTaskCount : dates.taskCount,
            taskSummaries: safeTaskSummaries !== undefined ? safeTaskSummaries : dates.taskSummaries,
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

const APP_BOOT_TIME = Date.now();
export const BOOT_SYNC_GUARD_MS = 15000;
/** Số ms kể từ khi app khởi động (dùng để hoãn các tác vụ ghi ngầm lúc mới mở app). */
export function getAppBootAgeMs(): number {
  return Date.now() - APP_BOOT_TIME;
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
  // Trong 15s đầu sau khi mở app, dữ liệu task có thể chưa tải đủ -> không backfill
  // (không bật cờ hasBackfilledInSession để lần gọi sau vẫn chạy được)
  if (getAppBootAgeMs() < BOOT_SYNC_GUARD_MS) return 0;
  if (hasBackfilledInSession || !projects.length || !tasks.length) return 0;
  hasBackfilledInSession = true;

  let count = 0;
  for (const p of projects) {
    if (!p.id || !p.code) continue;

    const pTasks = getTasksForProject(p, tasks);
    if (pTasks.length === 0) continue;

    // Safety guard: If memory only has a partial task set (< project.taskCount), do NOT backfill
    if (p.taskCount && pTasks.length < p.taskCount) continue;

    const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);

    // Chỉ cập nhật nếu Firestore chưa có hoặc ngày hoàn thành/bắt đầu thực sự thiếu
    const needsUpdate =
      !p.computedTakCompl ||
      (!p.computedTakStart && Boolean(computed.computedTakStart)) ||
      (!p.computedOpening && Boolean(computed.computedOpening)) ||
      p.computedPlanProgress === undefined ||
      p.computedActProgress === undefined;

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

      const pTasks = getTasksForProject(p, allTasks);

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


