import { useCallback, useMemo } from 'react';
import { Project, Task } from '../../types';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { getStatus } from '../../lib/utils';
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

function computeSingleProjectInfo(
  p: Project,
  tasksByProjectId: Map<string, Task[]>,
  tasksByProjectKey: Map<string, Task[]>,
  tasksByCodeMap: Map<string, Task[]>,
  taskById: Map<string, Task>
): ProjectInfo {
  const realTasksMap = new Map<string, Task>();
  const virtualTasksMap = new Map<string, Task>();

  const pIdStr = p.id ? String(p.id).trim() : '';
  const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
  const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';
  const pCodeLower = String(p.code || '').trim().toLowerCase();

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

  if (pIdStr && tasksByProjectId.has(pIdStr)) {
    tasksByProjectId.get(pIdStr)!.forEach(tryAddTask);
  }

  const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
  const foundByKey = tasksByProjectKey.get(key);
  if (foundByKey && foundByKey.length > 0) {
    foundByKey.forEach(tryAddTask);
  }

  const allCodes = new Set<string>();
  if (pCodeLower) allCodes.add(pCodeLower);
  if (p.linkCodes) {
    String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(c => allCodes.add(c));
  }
  allCodes.forEach(code => {
    const candidateTasks = tasksByCodeMap.get(code) || [];
    candidateTasks.forEach(tryAddTask);
  });

  // Fallback to p.taskSummaries ONLY when no real tasks for this project are loaded in memory
  if (realTasksMap.size === 0 && p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
    p.taskSummaries.forEach((ts, idx) => {
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
  virtualTasksMap.forEach((vt, key) => {
    if (!realTasksMap.has(key)) {
      rawGroupTasks.push(vt);
    }
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

export function useDetailProjectInfo({ projects, tasks }: UseDetailProjectInfoParams) {
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
    projects.forEach(p => {
      const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      map.set(
        pUniqueKey,
        computeSingleProjectInfo(p, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById)
      );
    });
    return map;
  }, [projects, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById]);

  const getProjectInfo = useCallback((p: Project): ProjectInfo => {
    const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
    const cached = projectInfoMap.get(pUniqueKey);
    if (cached) return cached;
    return computeSingleProjectInfo(p, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById);
  }, [projectInfoMap, tasksByProjectId, tasksByProjectKey, tasksByCodeMap, taskById]);

  return {
    tasksByProjectKey,
    tasksByCodeMap,
    projectInfoMap,
    getProjectInfo,
  };
}

