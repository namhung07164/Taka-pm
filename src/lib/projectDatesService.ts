import { setDoc, updateDoc, writeBatch } from "./firestoreWrites";
import { db, APP_ID } from "./firebase";
import { doc, collection, getDocs } from 'firebase/firestore';
import { Project, Task, DelegationGroup } from "../types";
import { useAppStore } from "../store/useAppStore";
import { getTaskStatus, computeActProgressPercent, computePlanProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries, getStatus, resolveActualStatus, isTaskBelongsToProject, isProjectTasksHydrated, normalizeDashes } from "./utils";
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
 * không phân biệt chữ hoa/thường, khoảng trắng thừa và chuẩn hóa mọi loại dấu gạch ngang (hyphen, en-dash, em-dash).
 */
export function matchProjectCode(codeA?: string, codeB?: string): boolean {
  if (!codeA || !codeB) return false;
  const a = normalizeDashes(String(codeA)).trim().toLowerCase();
  const b = normalizeDashes(String(codeB)).trim().toLowerCase();
  if (a === b) return true;
  const partsA = a.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  const partsB = b.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  return partsA.some(pa => partsB.includes(pa));
}

/**
 * Trích xuất danh sách Task thuộc về một Dự án cụ thể (xử lý chính xác projectId, multi-code, store và year).
 */
export function getTasksForProject(
  project: Partial<Project>,
  allTasks: Task[],
  options?: { realTasksOnly?: boolean }
): Task[] {
  if (!project) return [];
  const safeAllTasks = Array.isArray(allTasks) ? allTasks : [];
  const pIdStr = project.id ? String(project.id).trim() : '';

  const matchedMap = new Map<string, Task>();

  safeAllTasks.forEach(t => {
    if (!t || !t.id || t.isDeleted) return;
    if ((t as any)._isVirtualSummary) return;
    if (isTaskBelongsToProject(t, project)) {
      matchedMap.set(String(t.id), t);
    }
  });

  // Also include subtasks whose parent belongs to matchedMap
  let addedChild = true;
  while (addedChild) {
    addedChild = false;
    safeAllTasks.forEach(t => {
      if (!t || !t.id || t.isDeleted || (t as any)._isVirtualSummary || matchedMap.has(String(t.id))) return;
      if (isTaskDeletedInTracker(t.id, pIdStr || undefined)) return;
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent && matchedMap.has(String(rawParent))) {
        matchedMap.set(String(t.id), t);
        addedChild = true;
      }
    });
  }

  if (options?.realTasksOnly) {
    return Array.from(matchedMap.values());
  }

  const taskByIdFallback = buildTaskByIdMap(safeAllTasks);
  const validSummaries = (project.taskSummaries && Array.isArray(project.taskSummaries))
    ? project.taskSummaries
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
        } as unknown as Task))
    : [];

  if (matchedMap.size > 0) {
    if (isProjectTasksHydrated(pIdStr) || matchedMap.size >= validSummaries.length) {
      return Array.from(matchedMap.values());
    }
    // Partial in-memory tasks before project hydration: merge with remaining validSummaries
    const realList = Array.from(matchedMap.values());
    const realIdSet = new Set(realList.map(t => String(t.id).trim().toLowerCase()));
    const realNameSet = new Set(realList.map(t => String(t.name || '').trim().toLowerCase()).filter(Boolean));
    validSummaries.forEach(vs => {
      const vsId = String(vs.id || '').trim().toLowerCase();
      const vsName = String(vs.name || '').trim().toLowerCase();
      if (!realIdSet.has(vsId) && (!vsName || !realNameSet.has(vsName))) {
        realList.push(vs);
      }
    });
    return realList;
  }

  return validSummaries;
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

  const activeExistingSummaries = existingSummaries.filter((es: any) =>
    !isTaskDeletedInTracker(es.id, pIdStr) &&
    Boolean((es.name && String(es.name).trim()) || (es.start && String(es.start).trim()) || (es.finish && String(es.finish).trim()) || es.taskCodePhu)
  );

  const rawTasks = (projectTasks || []).filter(t =>
    t &&
    !t.isDeleted &&
    !isTaskDeletedInTracker(t.id, pIdStr) &&
    Boolean((t.name && String(t.name).trim()) || (t.start && String(t.start).trim()) || (t.finish && String(t.finish).trim()) || t.taskCodePhu)
  );
  const realOnlyTasks = rawTasks.filter(t => !(t as any)._isVirtualSummary);
  const realIdSet = new Set(realOnlyTasks.map(t => String(t.id || '').trim().toLowerCase()).filter(Boolean));
  const hasMissingActiveSummaries = activeExistingSummaries.some((es: any) => {
    const esId = String(es?.id || '').trim().toLowerCase();
    return Boolean(esId && !esId.startsWith('ts_') && !realIdSet.has(esId));
  });
  let filteredInputTasks: Task[];

  if (realOnlyTasks.length === 0) {
    filteredInputTasks = rawTasks;
  } else if (!hasMissingActiveSummaries && (isProjectTasksHydrated(pIdStr) || realOnlyTasks.length >= activeExistingSummaries.length)) {
    filteredInputTasks = realOnlyTasks;
  } else {
    // Partial real tasks in memory: merge with remaining activeExistingSummaries so unhydrated tasks are never dropped
    const mergedList: Task[] = [...realOnlyTasks];
    const realCodeSet = new Set(realOnlyTasks.map(t => String(t.taskCodePhu || '').trim().toLowerCase()).filter(Boolean));
    const realNameSet = new Set(realOnlyTasks.map(t => String(t.name || '').trim().toLowerCase()).filter(Boolean));
    const realNameStartSet = new Set(
      realOnlyTasks.map(t => `${String(t.name || '').trim().toLowerCase()}|${String(t.start || '').trim()}`)
    );

    activeExistingSummaries.forEach((ts: any, idx: number) => {
      const tsId = String(ts?.id || '').trim().toLowerCase();
      if (tsId && !tsId.startsWith('ts_')) {
        if (realIdSet.has(tsId)) return;
      } else {
        const tsCode = String(ts?.taskCodePhu || '').trim().toLowerCase();
        const tsName = String(ts?.name || '').trim().toLowerCase();
        const tsStart = String(ts?.start || '').trim();
        if (tsCode && realCodeSet.has(tsCode)) return;
        if (tsName && (realNameStartSet.has(`${tsName}|${tsStart}`) || (!tsId && !tsCode && realNameSet.has(tsName)))) return;
      }

      mergedList.push({
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
      } as unknown as Task);
    });
    filteredInputTasks = mergedList;
  }

  const { dedupedTasks } = deduplicateTasksInMemory(filteredInputTasks, project.code || project.id ? [project as Project] : []);
  const { cleaned: nonOrphanTasks } = filterNonOrphanTasks(dedupedTasks);
  const normalizedTasks = nonOrphanTasks.map(t => ({
    ...t,
    name: (t.name && String(t.name).trim()) ? t.name : (t.taskCodePhu || 'Task'),
  }));

  const rolledUpProjTasks = rollupParentTaskDatesAndStatus(normalizedTasks, delegationGroups);
  const sortedProjTasks = sortGroupTasks(rolledUpProjTasks);

  const taskSummariesRaw = sortedProjTasks.map((t, idx) => {
    const summary: Record<string, any> = {
      name: (t.name && String(t.name).trim()) ? t.name : (t.taskCodePhu || 'Task'),
      start: t.start || '',
      finish: t.finish || '',
      orderIndex: t.orderIndex !== undefined ? t.orderIndex : idx,
    };
    if (t.id) summary.id = t.id;
    if (t.duration !== undefined && t.duration !== null && String(t.duration) !== '') summary.duration = t.duration;
    if (t.parentTaskId) summary.parentTaskId = t.parentTaskId;
    if (t.isModularParent) summary.isModularParent = true;
    if (t.taskCodePhu) summary.taskCodePhu = t.taskCodePhu;
    if (t.runningStatus) summary.runningStatus = t.runningStatus;
    if (t.approval) summary.approval = t.approval;
    if (t.party) summary.party = t.party;
    if (t.delegation) summary.delegation = true;
    if (t.predecessor) summary.predecessor = t.predecessor;
    if (Array.isArray(t.predecessorTaskIds) && t.predecessorTaskIds.length > 0) summary.predecessorTaskIds = t.predecessorTaskIds;
    if (t.baselineStart) summary.baselineStart = t.baselineStart;
    if (t.baselineFinish) summary.baselineFinish = t.baselineFinish;
    return summary;
  });

  const taskSummaries = rollupTaskSummaries(taskSummariesRaw);

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

  const planProgressPercent = sortedProjTasks.length > 0
    ? computePlanProgressPercent(sortedProjTasks)
    : (finalSummaries.length > 0 
        ? computePlanProgressFromSummaries(finalSummaries) 
        : (project.computedPlanProgress ?? 0));
  
  const actProgressPercent = sortedProjTasks.length > 0
    ? computeActProgressPercent(sortedProjTasks, delegationGroups)
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
const pendingProjectSyncPayloads = new Map<string, { payload: Record<string, any>; year?: string }>();
const inFlightProjectSyncSet = new Set<string>();

async function flushProjectSummarySync(projectId: string): Promise<void> {
  if (inFlightProjectSyncSet.has(projectId)) return;
  inFlightProjectSyncSet.add(projectId);
  try {
    const [{ markExplicitDelta }, { recordDelta }] = await Promise.all([
      import("./autoDeltaQueue"),
      import("./deltaSyncService"),
    ]);
    while (pendingProjectSyncPayloads.has(projectId)) {
      const next = pendingProjectSyncPayloads.get(projectId)!;
      pendingProjectSyncPayloads.delete(projectId);
      const projectRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", projectId);
      markExplicitDelta([{ docId: projectId, collectionName: "taka_projects" }]);
      await Promise.all([
        setDoc(projectRef, next.payload, { merge: true }),
        recordDelta({
          docId: projectId,
          collectionName: "taka_projects",
          action: "update",
          isPatch: true,
          data: next.payload,
          year: next.year,
        }).catch(() => {}),
      ]);
    }
  } catch (error) {
    console.error(`Error syncing computed dates for project ${projectId}:`, error);
  } finally {
    inFlightProjectSyncSet.delete(projectId);
    if (pendingProjectSyncPayloads.has(projectId)) {
      flushProjectSummarySync(projectId).catch(() => {});
    }
  }
}

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

    const safeTaskSummaries = dates.taskSummaries !== undefined ? dates.taskSummaries : existingSummaries;
    const safeTaskCount = dates.taskCount !== undefined ? dates.taskCount : existingCount;

    const toSummariesSig = (list: any[]) =>
      (list || [])
        .map(
          (s: any, idx: number) =>
            `${s?.id || ""}:${s?.name || ""}:${s?.start || ""}:${s?.finish || ""}:${s?.duration ?? ""}:${s?.parentTaskId || ""}:${s?.isModularParent ? "1" : "0"}:${s?.taskCodePhu || ""}:${s?.runningStatus || ""}:${s?.approval || ""}:${s?.party || ""}:${s?.delegation ? "1" : ""}:${s?.predecessor || ""}:${s?.orderIndex ?? idx}`
        )
        .join("|");

    const hasChanged =
      !existingProject ||
      (existingProject.computedTakStart || "") !== (dates.computedTakStart || "") ||
      (existingProject.computedTakCompl || "") !== (dates.computedTakCompl || "") ||
      (existingProject.computedOpening || "") !== (dates.computedOpening || "") ||
      Number(existingProject.computedActProgress ?? 0) !== Number(dates.computedActProgress ?? 0) ||
      Number(existingProject.taskCount ?? 0) !== Number(safeTaskCount ?? dates.taskCount ?? 0) ||
      toSummariesSig(existingProject.taskSummaries || []) !== toSummariesSig(safeTaskSummaries || dates.taskSummaries || []);

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

    if (!hasChanged) return;

    const updatePayload: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };
    if (dates.computedTakStart !== undefined) updatePayload.computedTakStart = dates.computedTakStart;
    if (dates.computedTakCompl !== undefined) updatePayload.computedTakCompl = dates.computedTakCompl;
    if (dates.computedOpening !== undefined) updatePayload.computedOpening = dates.computedOpening;
    if (dates.computedPlanProgress !== undefined) updatePayload.computedPlanProgress = dates.computedPlanProgress;
    if (dates.computedActProgress !== undefined) updatePayload.computedActProgress = dates.computedActProgress;
    if (safeTaskCount !== undefined) updatePayload.taskCount = safeTaskCount;
    if (safeTaskSummaries !== undefined) {
      updatePayload.taskSummaries = safeTaskSummaries.map((ts: any) => {
        const item: Record<string, any> = {};
        for (const [k, v] of Object.entries(ts)) {
          if (v !== undefined && v !== null && v !== "" && v !== false && k !== "_isVirtualSummary") {
            item[k] = v;
          }
        }
        return item;
      });
    }

    pendingProjectSyncPayloads.set(projectId, {
      payload: updatePayload,
      year: existingProject?.year ? String(existingProject.year) : undefined,
    });
    await flushProjectSummarySync(projectId);
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


