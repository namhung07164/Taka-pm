import { useCallback, useMemo, useRef } from 'react';
import { Project, Task } from '../../types';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { getStatus, isProjectTasksHydrated } from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import { buildTaskByIdMap, isForeignSummaryEntry } from '../../lib/summaryGhostFilter';
import { deduplicateTasksInMemory } from '../../lib/taskDeduplicationService';
import { cleanOrphanTasks } from '../../lib/taskStateService';

export interface ProjectInfo {
  status: string;
  start: string;
  finish: string;
  computedTakStart?: string;
  computedTakCompl?: string;
  computedOpening?: string;
  sortedTasks: Task[];
}

interface UseDetailProjectInfoParams {
  projects: Project[];
  tasks: Task[];
}

function hasValidTaskContent(t: Partial<Task> | any): boolean {
  if (!t) return false;
  return Boolean(
    (t.name && String(t.name).trim()) ||
    (t.start && String(t.start).trim()) ||
    (t.finish && String(t.finish).trim()) ||
    t.taskCodePhu
  );
}

function collectCandidateTasksForProject(
  p: Project,
  tasksByProjectId: Map<string, Task[]>,
  tasksByProjectKey: Map<string, Task[]>,
  tasksByCodeMap: Map<string, Task[]>
): Task[] {
  const candidates: Task[] = [];
  const pIdStr = p.id ? String(p.id).trim() : '';
  if (pIdStr && tasksByProjectId.has(pIdStr)) {
    const byId = tasksByProjectId.get(pIdStr)!;
    for (let i = 0; i < byId.length; i++) candidates.push(byId[i]);
  }
  const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
  const foundByKey = tasksByProjectKey.get(key);
  if (foundByKey) {
    for (let i = 0; i < foundByKey.length; i++) candidates.push(foundByKey[i]);
  }
  const pCodeLower = String(p.code || '').trim().toLowerCase();
  if (pCodeLower) {
    const byCode = tasksByCodeMap.get(pCodeLower);
    if (byCode) {
      for (let i = 0; i < byCode.length; i++) candidates.push(byCode[i]);
    }
  }
  if (p.linkCodes) {
    const linkParts = String(p.linkCodes).toLowerCase().split(/[,;/]+/);
    for (let i = 0; i < linkParts.length; i++) {
      const lc = linkParts[i].trim();
      if (lc && lc !== pCodeLower) {
        const byLink = tasksByCodeMap.get(lc);
        if (byLink) {
          for (let j = 0; j < byLink.length; j++) candidates.push(byLink[j]);
        }
      }
    }
  }
  return candidates;
}

function computeSingleProjectInfo(
  p: Project,
  candidates: Task[],
  taskById: Map<string, Task>
): ProjectInfo {
  const realTasksMap = new Map<string, Task>();
  const virtualTasksMap = new Map<string, Task>();

  const pIdStr = p.id ? String(p.id).trim() : '';
  const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

  const tryAddTask = (t: Task) => {
    if (!t || (!t.id && !t.name) || t.isDeleted) return;
    const tIdStr = String(t.id || '').trim();
    if (tIdStr && isTaskDeletedInTracker(tIdStr, pIdStr || undefined)) return;
    if (!hasValidTaskContent(t)) return;

    const tProjId = t.projectId ? String(t.projectId).trim() : '';
    if (tProjId && pIdStr) {
      if (tProjId !== pIdStr) return;
    } else {
      const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
      const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';

      // Strict Rule 16.1 Store & Year isolation
      if (pStore && tStore && pStore !== tStore) return;
      if (pYear && tYear && pYear !== tYear) return;
    }

    const mapKey = (tIdStr || String(t.name)).toLowerCase();
    const isVirtual = Boolean((t as any)._isVirtualSummary);
    if (isVirtual) {
      if (!virtualTasksMap.has(mapKey)) {
        virtualTasksMap.set(mapKey, t);
      }
    } else {
      realTasksMap.set(mapKey, t);
    }
  };

  for (let i = 0; i < candidates.length; i++) {
    tryAddTask(candidates[i]);
  }

  // Fallback or merge p.taskSummaries when no real tasks are loaded OR when project is not fully hydrated and only partial tasks are in RAM
  const hasSummaries = p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0;
  if (
    hasSummaries &&
    (realTasksMap.size === 0 || (!isProjectTasksHydrated(pIdStr) && realTasksMap.size < p.taskSummaries!.length))
  ) {
    p.taskSummaries!.forEach((ts, idx) => {
      if (isTaskDeletedInTracker(ts.id, pIdStr || undefined)) return;
      if (isForeignSummaryEntry(ts.id, p, taskById)) return;
      if (!hasValidTaskContent(ts)) return;

      const rawTsId = ts.id ? String(ts.id).trim() : '';
      const tsId = rawTsId || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`;
      const tsIdLower = tsId.toLowerCase();

      if (!virtualTasksMap.has(tsIdLower)) {
        virtualTasksMap.set(tsIdLower, {
          id: tsId,
          name: (ts.name && String(ts.name).trim()) ? ts.name : (ts.taskCodePhu || `Task ${idx + 1}`),
          start: ts.start || p.computedTakStart || p.start || '',
          finish: ts.finish || p.computedTakCompl || p.handover || '',
          projectCode: p.code || '',
          projectStore: p.store || 'HCM',
          projectYear: p.year ? String(p.year) : '',
          party: ts.party || p.party || '',
          runningStatus: ts.runningStatus || 'On process',
          duration: ts.duration || '',
          parentTaskId: ts.parentTaskId,
          taskCodePhu: ts.taskCodePhu || (p.code ? `${p.code}#${idx + 1}` : undefined),
          orderIndex: ts.orderIndex !== undefined ? ts.orderIndex : idx,
          projectId: p.id,
          ...ts,
          _isVirtualSummary: true,
        } as unknown as Task);
      }
    });
  }

  const rawGroupTasks: Task[] = Array.from(realTasksMap.values());
  const realCodeSet = new Set<string>();
  const realNameSet = new Set<string>();
  rawGroupTasks.forEach(rt => {
    if (rt.taskCodePhu) realCodeSet.add(String(rt.taskCodePhu).trim().toLowerCase());
    if (rt.name) realNameSet.add(String(rt.name).trim().toLowerCase());
  });
  virtualTasksMap.forEach((vt, key) => {
    if (realTasksMap.has(key)) return;
    const vtCode = vt.taskCodePhu ? String(vt.taskCodePhu).trim().toLowerCase() : '';
    if (vtCode && realCodeSet.has(vtCode)) return;
    const vtName = vt.name ? String(vt.name).trim().toLowerCase() : '';
    if (!vt.id || String(vt.id).startsWith('ts_')) {
      if (vtName && realNameSet.has(vtName)) return;
    }
    rawGroupTasks.push(vt);
  });

  if (rawGroupTasks.length === 0) {
    const computedTakStart = p.computedTakStart || p.start;
    const computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    const computedOpening = p.computedOpening || p.opening;
    const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';
    return {
      status,
      start: computedTakStart || '9999-12-31',
      finish,
      computedTakStart,
      computedTakCompl,
      computedOpening,
      sortedTasks: [],
    };
  }

  let sortedTasks: Task[];
  if (rawGroupTasks.length === 1 && !rawGroupTasks[0].parentTaskId) {
    const single = rawGroupTasks[0];
    sortedTasks = [{
      ...single,
      name: (single.name && String(single.name).trim()) ? single.name : (single.taskCodePhu || 'Task'),
    }];
  } else {
    const { dedupedTasks } = deduplicateTasksInMemory(rawGroupTasks, [p]);
    const { cleaned: unrolledTasks } = cleanOrphanTasks(dedupedTasks);
    const rolledUpGroupTasks = rollupParentTaskDatesAndStatus(unrolledTasks || []);
    sortedTasks = sortGroupTasks(rolledUpGroupTasks).map(t => ({
      ...t,
      name: (t.name && String(t.name).trim()) ? t.name : (t.taskCodePhu || 'Task'),
    }));
  }

  let computedTakStart = p.computedTakStart || p.start;
  let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
  let computedOpening = p.computedOpening || p.opening;

  if (sortedTasks.length > 0) {
    let minStart: string | undefined = undefined;
    let maxFinish: string | undefined = undefined;
    for (let i = 0; i < sortedTasks.length; i++) {
      const t = sortedTasks[i];
      if (t.start && (!minStart || t.start < minStart)) {
        minStart = t.start;
      }
      if (t.finish && (!maxFinish || t.finish > maxFinish)) {
        maxFinish = t.finish;
      }
      const name = String(t.name || '').toLowerCase();
      if (name.includes('opening') || name.includes('open')) {
        if (t.finish && (!computedOpening || t.finish > computedOpening)) {
          computedOpening = t.finish;
        }
      }
    }
    if (minStart) computedTakStart = minStart;
    if (maxFinish) computedTakCompl = maxFinish;
  }

  const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
  const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';

  return {
    status,
    start: computedTakStart || '9999-12-31',
    finish,
    computedTakStart,
    computedTakCompl,
    computedOpening,
    sortedTasks,
  };
}

interface CachedProjectInfoEntry {
  project: Project;
  candidates: Task[];
  hydrated: boolean;
  info: ProjectInfo;
}

function areTaskArraysShallowEqual(a: Task[], b: Task[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function useDetailProjectInfo({ projects, tasks }: UseDetailProjectInfoParams) {
  const cacheRef = useRef<Map<string, CachedProjectInfoEntry>>(new Map());

  const { tasksByProjectId, tasksByProjectKey, tasksByCodeMap } = useMemo(() => {
    const idMap = new Map<string, Task[]>();
    const keyMap = new Map<string, Task[]>();
    const codeMap = new Map<string, Task[]>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      if (t.isDeleted) continue;
      if (t.projectId) {
        const pIdStr = String(t.projectId).trim();
        let pList = idMap.get(pIdStr);
        if (!pList) {
          pList = [];
          idMap.set(pIdStr, pList);
        }
        pList.push(t);
      }
      const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
      let list = keyMap.get(key);
      if (!list) {
        list = [];
        keyMap.set(key, list);
      }
      list.push(t);
      if (t.projectCode) {
        const rawCode = String(t.projectCode).trim().toLowerCase();
        const parts = rawCode.split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
        const codes = parts.length > 0 ? parts : [rawCode];
        for (let cIdx = 0; cIdx < codes.length; cIdx++) {
          const c = codes[cIdx];
          let cList = codeMap.get(c);
          if (!cList) {
            cList = [];
            codeMap.set(c, cList);
          }
          cList.push(t);
        }
      }
    }
    return { tasksByProjectId: idMap, tasksByProjectKey: keyMap, tasksByCodeMap: codeMap };
  }, [tasks]);

  const taskById = useMemo(() => buildTaskByIdMap(tasks), [tasks]);

  const projectInfoMap = useMemo(() => {
    const map = new Map<string, ProjectInfo>();
    const prevCache = cacheRef.current;
    const nextCache = new Map<string, CachedProjectInfoEntry>();

    projects.forEach(p => {
      const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pIdStr = p.id ? String(p.id).trim() : '';
      const hydrated = isProjectTasksHydrated(pIdStr);
      const candidates = collectCandidateTasksForProject(p, tasksByProjectId, tasksByProjectKey, tasksByCodeMap);
      const cached = prevCache.get(pUniqueKey);

      if (
        cached &&
        cached.project === p &&
        cached.hydrated === hydrated &&
        areTaskArraysShallowEqual(cached.candidates, candidates)
      ) {
        map.set(pUniqueKey, cached.info);
        nextCache.set(pUniqueKey, cached);
        return;
      }

      const info = computeSingleProjectInfo(p, candidates, taskById);
      map.set(pUniqueKey, info);
      nextCache.set(pUniqueKey, { project: p, candidates, hydrated, info });
    });

    cacheRef.current = nextCache;
    return map;
  }, [projects, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById]);

  const getProjectInfo = useCallback((p: Project): ProjectInfo => {
    const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
    const cached = projectInfoMap.get(pUniqueKey);
    if (cached) return cached;
    const candidates = collectCandidateTasksForProject(p, tasksByProjectId, tasksByProjectKey, tasksByCodeMap);
    return computeSingleProjectInfo(p, candidates, taskById);
  }, [projectInfoMap, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById]);

  return {
    tasksByProjectKey,
    tasksByCodeMap,
    projectInfoMap,
    getProjectInfo,
  };
}

