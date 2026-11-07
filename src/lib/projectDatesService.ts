import { Project, Task, DelegationGroup } from "../types";
import { computeActProgressPercent, computePlanProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries, isTaskBelongsToProject, isProjectTasksHydrated, normalizeDashes } from "./utils";
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
 * Duyệt cây subtask O(N) qua Map + BFS kèm Circular Guard (visited Set).
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
  const childrenByParentId = new Map<string, Task[]>();

  for (let i = 0; i < safeAllTasks.length; i++) {
    const t = safeAllTasks[i];
    if (!t || !t.id || t.isDeleted || (t as any)._isVirtualSummary) continue;
    const tId = String(t.id);
    if (isTaskBelongsToProject(t, project)) {
      matchedMap.set(tId, t);
    } else if (!isTaskDeletedInTracker(t.id, pIdStr || undefined)) {
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent) {
        const pKey = String(rawParent);
        const list = childrenByParentId.get(pKey);
        if (list) list.push(t);
        else childrenByParentId.set(pKey, [t]);
      }
    }
  }

  // O(N) BFS traversal with Circular Guard (visited Set) for subtasks
  if (matchedMap.size > 0 && childrenByParentId.size > 0) {
    const queue = Array.from(matchedMap.keys());
    const visited = new Set<string>(queue);
    let head = 0;
    while (head < queue.length) {
      const currentParentId = queue[head++];
      const children = childrenByParentId.get(currentParentId);
      if (!children) continue;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childId = String(child.id);
        if (!visited.has(childId)) {
          visited.add(childId);
          matchedMap.set(childId, child);
          queue.push(childId);
        }
      }
    }
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
    const realList = Array.from(matchedMap.values());
    const realIdSet = new Set(realList.map(t => String(t.id).trim().toLowerCase()));
    const realCodeSet = new Set(realList.map(t => String(t.taskCodePhu || '').trim().toLowerCase()).filter(Boolean));
    const realNameStartSet = new Set(
      realList.map(t => `${String(t.name || '').trim().toLowerCase()}|${String(t.start || '').trim()}`)
    );

    const hasMissingValidSummary = validSummaries.some(vs => {
      const vsId = String(vs.id || '').trim().toLowerCase();
      if (vsId && !vsId.startsWith('ts_')) {
        return !realIdSet.has(vsId);
      }
      const vsCode = String(vs.taskCodePhu || '').trim().toLowerCase();
      const vsNameStart = `${String(vs.name || '').trim().toLowerCase()}|${String(vs.start || '').trim()}`;
      if (vsCode && realCodeSet.has(vsCode)) return false;
      if (vsNameStart !== '|' && realNameStartSet.has(vsNameStart)) return false;
      return true;
    });

    if (!hasMissingValidSummary && (isProjectTasksHydrated(pIdStr) || matchedMap.size >= validSummaries.length)) {
      return realList;
    }

    // Partial in-memory tasks: merge any remaining validSummaries so unhydrated tasks are never dropped when creating a new task
    validSummaries.forEach(vs => {
      const vsId = String(vs.id || '').trim().toLowerCase();
      if (vsId && !vsId.startsWith('ts_')) {
        if (!realIdSet.has(vsId)) {
          realList.push(vs);
        }
        return;
      }
      const vsCode = String(vs.taskCodePhu || '').trim().toLowerCase();
      const vsNameStart = `${String(vs.name || '').trim().toLowerCase()}|${String(vs.start || '').trim()}`;
      if ((!vsCode || !realCodeSet.has(vsCode)) && (vsNameStart === '|' || !realNameStartSet.has(vsNameStart))) {
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
  const realCodeSet = new Set(realOnlyTasks.map(t => String(t.taskCodePhu || '').trim().toLowerCase()).filter(Boolean));
  const realNameSet = new Set(realOnlyTasks.map(t => String(t.name || '').trim().toLowerCase()).filter(Boolean));
  const realNameStartSet = new Set(
    realOnlyTasks.map(t => `${String(t.name || '').trim().toLowerCase()}|${String(t.start || '').trim()}`)
  );
  const hasMissingActiveSummaries = activeExistingSummaries.some((es: any) => {
    const esId = String(es?.id || '').trim().toLowerCase();
    if (esId && !esId.startsWith('ts_')) {
      return !realIdSet.has(esId);
    }
    const esCode = String(es?.taskCodePhu || '').trim().toLowerCase();
    const esName = String(es?.name || '').trim().toLowerCase();
    const esStart = String(es?.start || '').trim();
    if (esCode && realCodeSet.has(esCode)) return false;
    if (esName && (realNameStartSet.has(`${esName}|${esStart}`) || (!esId && !esCode && realNameSet.has(esName)))) return false;
    return true;
  });
  let filteredInputTasks: Task[];

  if (realOnlyTasks.length === 0) {
    filteredInputTasks = rawTasks;
  } else if (!hasMissingActiveSummaries && (isProjectTasksHydrated(pIdStr) || realOnlyTasks.length >= activeExistingSummaries.length)) {
    filteredInputTasks = realOnlyTasks;
  } else {
    // Partial real tasks in memory: merge with remaining activeExistingSummaries so unhydrated tasks are never dropped
    const mergedList: Task[] = [...realOnlyTasks];

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

export {
  syncProjectDatesToFirestore,
  syncProjectDatesByCode,
} from "./projectDatesSyncService";

export {
  getAppBootAgeMs,
  BOOT_SYNC_GUARD_MS,
  backfillMissingProjectDates,
  isDelegationGroupBelongsToProject,
  computeProjectActStatus,
  syncAllProjectsTaskCountFromFirestore,
} from "./projectDatesBackfill";



