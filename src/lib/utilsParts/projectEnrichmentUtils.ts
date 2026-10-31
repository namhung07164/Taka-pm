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
import {
  extractPrimaryProjectCodes,
  isProjectGroupedWithOthers,
  resolveMatchedUnitSizeM2,
} from "../unitSizeResolver";
import { extractAllProjectCodes } from "./projectCodeAndScopeUtils";
import { rollupTaskSummaries } from "../taskRollupHelpers";
import { useDataStore } from "../../components/PictureMapping/DataContext";
import { sortEnrichedProjects, resolveProjectDatesFromSource } from "./projectEnrichmentHelpers";

// Module-level 8-slot ring buffer cache for zero-cost multi-component calls to enrichProjects
// Prevents cache thrashing when different hooks pass rawTasks vs deduplicated baseTasks
const EMPTY_DELEGATION_GROUPS: DelegationGroup[] = [];
interface EnrichGlobalCacheSlot {
  projectsRef: Project[];
  tasksRef: Task[];
  delegationRef: DelegationGroup[];
  mapUnitsRef: any;
  mapVersionsRef: any;
  storeLocationDataRef: any;
  result: Project[];
}
const ENRICH_CACHE_MAX = 8;
const _enrichCacheRing: EnrichGlobalCacheSlot[] = [];

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

  for (let i = 0; i < _enrichCacheRing.length; i++) {
    const slot = _enrichCacheRing[i];
    if (
      slot.projectsRef === projects &&
      slot.tasksRef === tasks &&
      slot.delegationRef === normDelegations &&
      slot.mapUnitsRef === dataState.mapUnits &&
      slot.mapVersionsRef === dataState.mapVersions &&
      slot.storeLocationDataRef === dataState.storeLocationData
    ) {
      return slot.result;
    }
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

  // Pre-compute secondary grouped project codes per (store|year) so grouped projects take size strictly from EditTab (or 0)
  const secondaryGroupedCodesByScope = new Set<string>();
  for (let i = 0; i < projects.length; i++) {
    const mp = projects[i];
    if (!mp || mp.isDeleted || !isProjectGroupedWithOthers(mp)) continue;
    const mpStore = String(mp.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM';
    const mpYear = String(mp.year || '').trim();
    const primarySet = new Set(extractPrimaryProjectCodes(mp));
    const allCodes = extractAllProjectCodes(mp);
    for (let j = 0; j < allCodes.length; j++) {
      const c = allCodes[j];
      if (!primarySet.has(c)) {
        secondaryGroupedCodesByScope.add(`${mpStore}|${mpYear}|${c}`);
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

    const pStoreScope = String(p.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM';
    const pYearScope = String(p.year || '').trim();
    const isSecondaryGroupedProject =
      Boolean(pCode) && secondaryGroupedCodesByScope.has(`${pStoreScope}|${pYearScope}|${pCode}`);

    const isHydrated = isProjectTasksHydrated(pId);
    const cachedEntry = _perProjectEnrichCache.get(p);
    if (
      !isSecondaryGroupedProject &&
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

    const { computedTakStart, computedTakCompl, computedOpening } = isAuthoritativeRealTasks && projectTasks.length > 0
      ? resolveProjectDatesFromSource(p, projectTasks, true)
      : (taskSummaries.length > 0 ? resolveProjectDatesFromSource(p, taskSummaries, false) : {
          computedTakStart: p.computedTakStart || p.start,
          computedTakCompl: p.computedTakCompl || p.handover || (p as any).takCompl || undefined,
          computedOpening: p.computedOpening || (p.openingMode === 'manual' ? p.opening : ''),
        });

    const planProgressPercent = isAuthoritativeRealTasks && projectTasks.length > 0 
      ? computePlanProgressPercent(projectTasks)
      : (p.computedPlanProgress && p.computedPlanProgress > 0 
          ? p.computedPlanProgress 
          : (taskSummaries.length > 0 ? computePlanProgressFromSummaries(taskSummaries) : (p.computedPlanProgress ?? 0)));

    const actProgressPercent = isAuthoritativeRealTasks && projectTasks.length > 0
      ? computeActProgressPercent(projectTasks, candidateDelegations)
      : (taskSummaries.length > 0 
          ? computeActProgressFromSummaries(taskSummaries) 
          : (p.computedActProgress ?? 0));

    const taskCount = isAuthoritativeRealTasks
      ? projectTasks.length
      : (taskSummaries.length > 0 ? taskSummaries.length : (p.taskCount ?? 0));

    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const actStatus = computeProjectActStatus(
      { ...p, taskSummaries, computedStatus: status, computedActProgress: actProgressPercent },
      candidateDelegations,
      projectTasks
    );

    const resolvedSizeM2 = isSecondaryGroupedProject
      ? (resolveMatchedUnitSizeM2({
          code: p.code,
          store: p.store,
          location: p.location,
          year: p.year,
        }).sizeM2 ?? 0)
      : (p.sizeM2 !== undefined && p.sizeM2 !== null && p.sizeM2 > 0
          ? p.sizeM2
          : resolveMatchedUnitSizeM2(p).sizeM2);

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

    const cacheVal: PerProjectEnrichCacheEntry = {
      projectTasks,
      candidateDelegations,
      isHydrated,
      mapUnitsRef: dataState.mapUnits,
      mapVersionsRef: dataState.mapVersions,
      storeLocationDataRef: dataState.storeLocationData,
      enriched,
    };
    _perProjectEnrichCache.set(p, cacheVal);
    _perProjectEnrichCache.set(enriched, cacheVal);

    return enriched;
  });

  sortEnrichedProjects(enrichedProjects);

  if (_enrichCacheRing.length >= ENRICH_CACHE_MAX) _enrichCacheRing.shift();
  _enrichCacheRing.push({
    projectsRef: projects,
    tasksRef: tasks,
    delegationRef: normDelegations,
    mapUnitsRef: dataState.mapUnits,
    mapVersionsRef: dataState.mapVersions,
    storeLocationDataRef: dataState.storeLocationData,
    result: enrichedProjects,
  });

  return enrichedProjects;
}
