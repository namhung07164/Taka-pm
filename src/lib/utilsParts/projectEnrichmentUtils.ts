import { Project, Task, DelegationGroup } from "../../types";
import { isTaskDeletedInTracker } from "../taskDeletedTracker";
import { parseDateTime } from "./commonAndDateUtils";
import { isTaskBelongsToProject, isProjectTasksHydrated } from "./projectCodeAndScopeUtils";
import {
  getStatus,
  computePlanProgressPercent,
  computePlanProgressFromSummaries,
  computeActProgressPercent,
  computeActProgressFromSummaries,
  computeProjectActStatus,
} from "./progressAndStatusUtils";

// Module-level cache for zero-cost multi-component calls to enrichProjects
let _lastProjectsRef: Project[] | null = null;
let _lastTasksRef: Task[] | null = null;
let _lastDelegationRef: DelegationGroup[] | null = null;
let _lastEnrichedResult: Project[] | null = null;

export function enrichProjects(
  projects: Project[], 
  tasks: Task[], 
  delegationGroups: DelegationGroup[] = []
): Project[] {
  if (
    _lastProjectsRef === projects &&
    _lastTasksRef === tasks &&
    _lastDelegationRef === delegationGroups &&
    _lastEnrichedResult
  ) {
    return _lastEnrichedResult;
  }

  const tasksByProjectId = new Map<string, Task[]>();
  const tasksByCodePart = new Map<string, Task[]>();

  tasks.forEach(t => {
    if (!t || t.isDeleted) return;
    if (String(t.id || '').startsWith('ts_') || (t as any)._isVirtualSummary) return;
    if (t.id && isTaskDeletedInTracker(t.id, t.projectId ? String(t.projectId) : undefined)) return;
    if (t.projectId) {
      const pid = String(t.projectId).trim();
      let pList = tasksByProjectId.get(pid);
      if (!pList) {
        pList = [];
        tasksByProjectId.set(pid, pList);
      }
      pList.push(t);
    }
    if (!t.projectCode) return;
    const tCode = String(t.projectCode).trim().toLowerCase();
    const tCodeParts = tCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
    const codesToIndex = tCodeParts.length > 0 ? tCodeParts : [tCode];

    codesToIndex.forEach(code => {
      let cList = tasksByCodePart.get(code);
      if (!cList) {
        cList = [];
        tasksByCodePart.set(code, cList);
      }
      cList.push(t);
    });
  });

  const enrichedProjects = projects.map((p) => {
    const pId = p.id ? String(p.id).trim() : "";
    const pCode = String(p.code || "").trim().toLowerCase();
    const rawCodeCombined = (p.linkCodes && p.linkCodes.trim()) ? `${pCode}, ${p.linkCodes.toLowerCase()}` : pCode;
    const pCodeParts = rawCodeCombined.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);

    const matchedTaskMap = new Map<string, Task>();

    // 1. Check direct Project ID match first
    if (pId) {
      const idTasks = tasksByProjectId.get(pId);
      if (idTasks) {
        for (let i = 0; i < idTasks.length; i++) {
          const t = idTasks[i];
          if (isTaskBelongsToProject(t, p, projects)) {
            matchedTaskMap.set(t.id, t);
          }
        }
      }
    }

    // 2. Check code + linkCodes parts
    for (let i = 0; i < pCodeParts.length; i++) {
      const candidateTasks = tasksByCodePart.get(pCodeParts[i]);
      if (candidateTasks) {
        for (let j = 0; j < candidateTasks.length; j++) {
          const t = candidateTasks[j];
          if (!matchedTaskMap.has(t.id) && isTaskBelongsToProject(t, p, projects)) {
            matchedTaskMap.set(t.id, t);
          }
        }
      }
    }

    const projectTasks = Array.from(matchedTaskMap.values());

    const sortedProjTasks = [...projectTasks].sort((a, b) => {
      const codeA = a.taskCodePhu || '';
      const codeB = b.taskCodePhu || '';
      
      const numA = codeA.match(/#\s*(\d+)/)?.[1] || codeA.match(/[-_.:/\s]+(\d+)\s*$/)?.[1] || (/^\d+$/.test(codeA.trim()) ? codeA.trim() : null);
      const numB = codeB.match(/#\s*(\d+)/)?.[1] || codeB.match(/[-_.:/\s]+(\d+)\s*$/)?.[1] || (/^\d+$/.test(codeB.trim()) ? codeB.trim() : null);

      if (numA !== null && numB !== null) {
        const intA = parseInt(numA, 10);
        const intB = parseInt(numB, 10);
        if (!isNaN(intA) && !isNaN(intB) && intA !== intB) return intA - intB;
      } else if (numA !== null && numB === null) {
        return -1;
      } else if (numA === null && numB !== null) {
        return 1;
      }

      const valA = a.orderIndex !== undefined ? a.orderIndex : 0;
      const valB = b.orderIndex !== undefined ? b.orderIndex : 0;
      if (valA !== valB) return valA - valB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const filteredExistingSummaries = Array.isArray(p.taskSummaries)
      ? p.taskSummaries.filter((ts: any) => !isTaskDeletedInTracker(ts?.id, pId || undefined))
      : [];

    const isAuthoritativeRealTasks =
      sortedProjTasks.length > 0 &&
      (isProjectTasksHydrated(pId) || sortedProjTasks.length >= filteredExistingSummaries.length);

    let taskSummaries: any[];
    if (isAuthoritativeRealTasks) {
      taskSummaries = sortedProjTasks.filter(t => Boolean(t.name)).map((t, idx) => ({
        id: t.id,
        name: t.name!,
        start: t.start || '',
        finish: t.finish || '',
        orderIndex: t.orderIndex !== undefined ? t.orderIndex : idx,
        duration: t.duration,
        parentTaskId: t.parentTaskId,
        taskCodePhu: t.taskCodePhu,
        runningStatus: t.runningStatus,
        approval: t.approval,
        party: t.party
      }));
    } else if (sortedProjTasks.length > 0 && filteredExistingSummaries.length > sortedProjTasks.length) {
      const realById = new Map<string, Task>();
      sortedProjTasks.forEach(t => {
        if (t.id) realById.set(String(t.id).trim().toLowerCase(), t);
      });
      taskSummaries = filteredExistingSummaries.map((es: any, idx: number) => {
        const esId = es?.id ? String(es.id).trim().toLowerCase() : '';
        const matchedReal = esId ? realById.get(esId) : undefined;
        if (matchedReal) {
          return {
            ...es,
            id: matchedReal.id,
            name: matchedReal.name || es.name,
            start: matchedReal.start || es.start || '',
            finish: matchedReal.finish || es.finish || '',
            orderIndex: matchedReal.orderIndex !== undefined ? matchedReal.orderIndex : (es.orderIndex ?? idx),
            duration: matchedReal.duration ?? es.duration,
            parentTaskId: matchedReal.parentTaskId ?? es.parentTaskId,
            taskCodePhu: matchedReal.taskCodePhu ?? es.taskCodePhu,
            runningStatus: matchedReal.runningStatus ?? es.runningStatus,
            approval: matchedReal.approval ?? es.approval,
            party: matchedReal.party ?? es.party,
          };
        }
        return es;
      });
    } else {
      taskSummaries = filteredExistingSummaries;
    }

    let computedTakStart = p.computedTakStart || p.start;
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover || (p as any).takCompl || undefined;
    let computedOpening = p.computedOpening || (p.openingMode === 'manual' ? p.opening : '');

    if (isAuthoritativeRealTasks && projectTasks.length > 0) {
      let minStart: string | undefined = undefined;
      let maxCompl: string | undefined = undefined;
      let hasOpeningTask = false;
      for (let i = 0; i < projectTasks.length; i++) {
        const t = projectTasks[i];
        if (t.start && (!minStart || t.start < minStart)) {
          minStart = t.start;
        }
        if (t.finish && (!maxCompl || t.finish > maxCompl)) {
          maxCompl = t.finish;
        }
        const name = t.name ? String(t.name).toLowerCase() : "";
        if ((name.includes("opening") || name.includes("open")) && t.finish) {
          if (!hasOpeningTask || t.finish > computedOpening) {
            computedOpening = t.finish;
            hasOpeningTask = true;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxCompl) computedTakCompl = maxCompl;
      if (!hasOpeningTask && p.openingMode !== 'manual') {
        computedOpening = '';
      }
    } else if (taskSummaries.length > 0) {
      let minStart: string | undefined = undefined;
      let maxCompl: string | undefined = undefined;
      let hasOpeningTask = false;
      for (let i = 0; i < taskSummaries.length; i++) {
        const ts = taskSummaries[i];
        if (ts.start && (!minStart || ts.start < minStart)) {
          minStart = ts.start;
        }
        if (ts.finish && (!maxCompl || ts.finish > maxCompl)) {
          maxCompl = ts.finish;
        }
        const name = ts.name ? String(ts.name).toLowerCase() : "";
        if ((name.includes("opening") || name.includes("open")) && ts.finish) {
          if (!hasOpeningTask || ts.finish > computedOpening) {
            computedOpening = ts.finish;
            hasOpeningTask = true;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxCompl) computedTakCompl = maxCompl;
      if (!hasOpeningTask && p.openingMode !== 'manual') {
        computedOpening = '';
      }
    }

    const planProgressPercent = isAuthoritativeRealTasks && projectTasks.length > 0 
      ? computePlanProgressPercent(projectTasks)
      : (p.computedPlanProgress && p.computedPlanProgress > 0 
          ? p.computedPlanProgress 
          : (taskSummaries.length > 0 ? computePlanProgressFromSummaries(taskSummaries) : (p.computedPlanProgress ?? 0)));

    const actProgressPercent = isAuthoritativeRealTasks && projectTasks.length > 0
      ? computeActProgressPercent(projectTasks, delegationGroups)
      : (p.computedActProgress && p.computedActProgress > 0 
          ? p.computedActProgress 
          : (taskSummaries.length > 0 ? computeActProgressFromSummaries(taskSummaries) : (p.computedActProgress ?? 0)));

    const taskCount = isAuthoritativeRealTasks
      ? projectTasks.length
      : (taskSummaries.length > 0 ? taskSummaries.length : (p.taskCount ?? 0));

    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const actStatus = computeProjectActStatus(
      { ...p, computedStatus: status, computedActProgress: actProgressPercent },
      delegationGroups,
      projectTasks
    );

    return {
      ...p,
      computedTakStart,
      computedTakCompl,
      computedOpening,
      computedPlanProgress: planProgressPercent,
      computedActProgress: actProgressPercent,
      computedStatus: status,
      computedActStatus: actStatus,
      taskSummaries,
      taskCount,
    };
  });

  const statusPriority: Record<string, number> = {
    'On process': 1,
    'Handover': 2,
    'Upcoming': 3,
    'Completed': 4,
    'Canceled': 5
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  enrichedProjects.sort((a, b) => {
    const statusA = a.computedStatus || 'Upcoming';
    const statusB = b.computedStatus || 'Upcoming';

    const priorityA = statusPriority[statusA] || 99;
    const priorityB = statusPriority[statusB] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    if (statusA === 'On process') {
      const finishA = parseDateTime(a.computedTakCompl || a.computedOpening || a.opening || '9999-12-31');
      const finishB = parseDateTime(b.computedTakCompl || b.computedOpening || b.opening || '9999-12-31');
      if (finishA && finishB) {
        const diffA = Math.abs(finishA.getTime() - todayTime);
        const diffB = Math.abs(finishB.getTime() - todayTime);
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      }
    }

    const startA = a.computedTakStart || '9999-12-31';
    const startB = b.computedTakStart || '9999-12-31';

    if (startA < startB) return -1;
    if (startA > startB) return 1;

    return String(a.code || '').localeCompare(String(b.code || '')) || String(a.year || '').localeCompare(String(b.year || ''));
  });

  _lastProjectsRef = projects;
  _lastTasksRef = tasks;
  _lastDelegationRef = delegationGroups;
  _lastEnrichedResult = enrichedProjects;

  return enrichedProjects;
}
