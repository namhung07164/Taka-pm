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
import { resolveMatchedUnitSizeM2 } from "../unitSizeResolver";
import { rollupTaskSummaries } from "../taskRollupHelpers";
import { useDataStore } from "../../components/PictureMapping/DataContext";

// Module-level cache for zero-cost multi-component calls to enrichProjects
const EMPTY_DELEGATION_GROUPS: DelegationGroup[] = [];
let _lastProjectsRef: Project[] | null = null;
let _lastTasksRef: Task[] | null = null;
let _lastDelegationRef: DelegationGroup[] | null = null;
let _lastMapUnitsRef: any = null;
let _lastMapVersionsRef: any = null;
let _lastStoreLocationDataRef: any = null;
let _lastEnrichedResult: Project[] | null = null;

interface PerProjectEnrichCacheEntry {
  projectTasks: Task[];
  candidateDelegations: DelegationGroup[];
  isHydrated: boolean;
  mapUnitsRef: any;
  mapVersionsRef: any;
  storeLocationDataRef: any;
  enriched: Project;
}

const _perProjectEnrichCache = new WeakMap<Project, PerProjectEnrichCacheEntry>();

function areArraysShallowEqual<T>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function enrichProjects(
  projects: Project[], 
  tasks: Task[], 
  delegationGroups: DelegationGroup[] = EMPTY_DELEGATION_GROUPS
): Project[] {
  const normDelegations =
    delegationGroups && delegationGroups.length > 0 ? delegationGroups : EMPTY_DELEGATION_GROUPS;
  const dataState = useDataStore.getState();

  if (
    _lastProjectsRef === projects &&
    _lastTasksRef === tasks &&
    _lastDelegationRef === normDelegations &&
    _lastMapUnitsRef === dataState.mapUnits &&
    _lastMapVersionsRef === dataState.mapVersions &&
    _lastStoreLocationDataRef === dataState.storeLocationData &&
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

  // Pre-index delegationGroups in O(D) to eliminate O(P * D) scans per project
  const delegationsByProjectId = new Map<string, DelegationGroup[]>();
  const delegationsByParentTaskId = new Map<string, DelegationGroup[]>();
  const delegationsByCodePart = new Map<string, DelegationGroup[]>();

  for (let i = 0; i < normDelegations.length; i++) {
    const g = normDelegations[i];
    if (!g || g.isDeleted) continue;
    if (g.projectId) {
      const gPid = String(g.projectId).trim();
      let list = delegationsByProjectId.get(gPid);
      if (!list) {
        list = [];
        delegationsByProjectId.set(gPid, list);
      }
      list.push(g);
    }
    if (g.parentTaskId) {
      const pTid = String(g.parentTaskId).trim();
      let list = delegationsByParentTaskId.get(pTid);
      if (!list) {
        list = [];
        delegationsByParentTaskId.set(pTid, list);
      }
      list.push(g);
    }
    if (g.projectCode) {
      const gCode = String(g.projectCode).trim().toLowerCase();
      const gCodeParts = gCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
      const codes = gCodeParts.length > 0 ? gCodeParts : [gCode];
      for (let cIdx = 0; cIdx < codes.length; cIdx++) {
        const c = codes[cIdx];
        let list = delegationsByCodePart.get(c);
        if (!list) {
          list = [];
          delegationsByCodePart.set(c, list);
        }
        list.push(g);
      }
    }
  }

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

    // Gather candidate delegation groups for this project in O(1)
    let candidateDelegations: DelegationGroup[] = EMPTY_DELEGATION_GROUPS;
    if (normDelegations.length > 0) {
      const candSet = new Set<DelegationGroup>();
      if (pId) {
        const byPid = delegationsByProjectId.get(pId);
        if (byPid) for (let i = 0; i < byPid.length; i++) candSet.add(byPid[i]);
      }
      for (let i = 0; i < projectTasks.length; i++) {
        const tId = projectTasks[i].id;
        if (tId) {
          const byTid = delegationsByParentTaskId.get(String(tId).trim());
          if (byTid) for (let j = 0; j < byTid.length; j++) candSet.add(byTid[j]);
        }
      }
      for (let i = 0; i < pCodeParts.length; i++) {
        const byCode = delegationsByCodePart.get(pCodeParts[i]);
        if (byCode) for (let j = 0; j < byCode.length; j++) candSet.add(byCode[j]);
      }
      if (candSet.size > 0) {
        candidateDelegations = Array.from(candSet);
      }
    }

    const isHydrated = isProjectTasksHydrated(pId);
    const cachedEntry = _perProjectEnrichCache.get(p);
    if (
      cachedEntry &&
      cachedEntry.isHydrated === isHydrated &&
      cachedEntry.mapUnitsRef === dataState.mapUnits &&
      cachedEntry.mapVersionsRef === dataState.mapVersions &&
      cachedEntry.storeLocationDataRef === dataState.storeLocationData &&
      areArraysShallowEqual(cachedEntry.projectTasks, projectTasks) &&
      areArraysShallowEqual(cachedEntry.candidateDelegations, candidateDelegations)
    ) {
      return cachedEntry.enriched;
    }

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
      (isHydrated || sortedProjTasks.length >= filteredExistingSummaries.length);

    let taskSummaries: any[];
    if (isAuthoritativeRealTasks) {
      taskSummaries = rollupTaskSummaries(
        sortedProjTasks.filter(t => Boolean(t.name)).map((t, idx) => ({
          id: t.id,
          name: t.name!,
          start: t.start || '',
          finish: t.finish || '',
          orderIndex: t.orderIndex !== undefined ? t.orderIndex : idx,
          duration: t.duration,
          parentTaskId: t.parentTaskId,
          isModularParent: t.isModularParent,
          taskCodePhu: t.taskCodePhu,
          runningStatus: t.runningStatus,
          approval: t.approval,
          party: t.party,
          delegation: t.delegation,
          predecessor: t.predecessor,
          predecessorTaskIds: t.predecessorTaskIds,
          baselineStart: t.baselineStart,
          baselineFinish: t.baselineFinish,
        }))
      );
    } else if (sortedProjTasks.length > 0 && filteredExistingSummaries.length > sortedProjTasks.length) {
      const realById = new Map<string, Task>();
      sortedProjTasks.forEach(t => {
        if (t.id) realById.set(String(t.id).trim().toLowerCase(), t);
      });
      taskSummaries = rollupTaskSummaries(
        filteredExistingSummaries.map((es: any, idx: number) => {
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
              parentTaskId: matchedReal.parentTaskId,
              isModularParent: matchedReal.isModularParent ?? es.isModularParent,
              taskCodePhu: matchedReal.taskCodePhu ?? es.taskCodePhu,
              runningStatus: matchedReal.runningStatus ?? es.runningStatus,
              approval: matchedReal.approval ?? es.approval,
              party: matchedReal.party ?? es.party,
              delegation: matchedReal.delegation ?? es.delegation,
              predecessor: matchedReal.predecessor ?? es.predecessor,
              predecessorTaskIds: matchedReal.predecessorTaskIds ?? es.predecessorTaskIds,
            };
          }
          return es;
        })
      );
    } else {
      taskSummaries = rollupTaskSummaries(filteredExistingSummaries);
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
      ? computeActProgressPercent(projectTasks, candidateDelegations)
      : (p.computedActProgress && p.computedActProgress > 0 
          ? p.computedActProgress 
          : (taskSummaries.length > 0 ? computeActProgressFromSummaries(taskSummaries) : (p.computedActProgress ?? 0)));

    const taskCount = isAuthoritativeRealTasks
      ? projectTasks.length
      : (taskSummaries.length > 0 ? taskSummaries.length : (p.taskCount ?? 0));

    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const actStatus = computeProjectActStatus(
      { ...p, computedStatus: status, computedActProgress: actProgressPercent },
      candidateDelegations,
      projectTasks
    );

    const resolvedSizeM2 =
      p.sizeM2 !== undefined && p.sizeM2 !== null && p.sizeM2 > 0
        ? p.sizeM2
        : resolveMatchedUnitSizeM2(p).sizeM2;

    const enriched: Project = {
      ...p,
      ...(resolvedSizeM2 !== undefined ? { sizeM2: resolvedSizeM2 } : {}),
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

    _perProjectEnrichCache.set(p, {
      projectTasks,
      candidateDelegations,
      isHydrated,
      mapUnitsRef: dataState.mapUnits,
      mapVersionsRef: dataState.mapVersions,
      storeLocationDataRef: dataState.storeLocationData,
      enriched,
    });
    _perProjectEnrichCache.set(enriched, {
      projectTasks,
      candidateDelegations,
      isHydrated,
      mapUnitsRef: dataState.mapUnits,
      mapVersionsRef: dataState.mapVersions,
      storeLocationDataRef: dataState.storeLocationData,
      enriched,
    });

    return enriched;
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

  // Pre-compute finish timestamps in O(P) for 'On process' projects before sorting
  const onProcessFinishDiffMap = new WeakMap<Project, number>();
  for (let i = 0; i < enrichedProjects.length; i++) {
    const ep = enrichedProjects[i];
    if ((ep.computedStatus || 'Upcoming') === 'On process') {
      const parsed = parseDateTime(ep.computedTakCompl || ep.computedOpening || ep.opening || '9999-12-31');
      if (parsed) {
        onProcessFinishDiffMap.set(ep, Math.abs(parsed.getTime() - todayTime));
      }
    }
  }

  enrichedProjects.sort((a, b) => {
    const statusA = a.computedStatus || 'Upcoming';
    const statusB = b.computedStatus || 'Upcoming';

    const priorityA = statusPriority[statusA] || 99;
    const priorityB = statusPriority[statusB] || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    if (statusA === 'On process') {
      const diffA = onProcessFinishDiffMap.get(a);
      const diffB = onProcessFinishDiffMap.get(b);
      if (diffA !== undefined && diffB !== undefined && diffA !== diffB) {
        return diffA - diffB;
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
  _lastDelegationRef = normDelegations;
  _lastMapUnitsRef = dataState.mapUnits;
  _lastMapVersionsRef = dataState.mapVersions;
  _lastStoreLocationDataRef = dataState.storeLocationData;
  _lastEnrichedResult = enrichedProjects;

  return enrichedProjects;
}
