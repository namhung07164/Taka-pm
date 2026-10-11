import { useMemo, useCallback } from 'react';
import { Project, Task } from '../../types';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { getStatus } from '../../lib/utils';

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

export function useDetailProjectInfo({ projects, tasks }: UseDetailProjectInfoParams) {
  const { tasksByProjectKey, tasksByCodeMap } = useMemo(() => {
    const keyMap = new Map<string, Task[]>();
    const codeMap = new Map<string, Task[]>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
      let list = keyMap.get(key);
      if (!list) {
        list = [];
        keyMap.set(key, list);
      }
      list.push(t);
      if (t.projectCode) {
        const c = String(t.projectCode).trim().toLowerCase();
        let cList = codeMap.get(c);
        if (!cList) {
          cList = [];
          codeMap.set(c, cList);
        }
        cList.push(t);
      }
    }
    return { tasksByProjectKey: keyMap, tasksByCodeMap: codeMap };
  }, [tasks]);

  const projectInfoMap = useMemo(() => {
    const map = new Map<string, ProjectInfo>();

    projects.forEach(p => {
      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
      let rawGroupTasks = tasksByProjectKey.get(key);
      if (!rawGroupTasks || rawGroupTasks.length === 0) {
        const pCode = String(p.code || "").trim().toLowerCase();
        const candidateTasks = tasksByCodeMap.get(pCode) || [];
        rawGroupTasks = candidateTasks.filter(t => {
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          return matchesStore && matchesYear;
        });
      }
      const sortedTasks = sortGroupTasks(rawGroupTasks || []);
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
      } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        let minStart: string | undefined = undefined;
        let maxFinish: string | undefined = undefined;
        for (let i = 0; i < p.taskSummaries.length; i++) {
          const ts = p.taskSummaries[i];
          if (ts.start && (!minStart || ts.start < minStart)) {
            minStart = ts.start;
          }
          if (ts.finish && (!maxFinish || ts.finish > maxFinish)) {
            maxFinish = ts.finish;
          }
          const name = String(ts.name || '').toLowerCase();
          if (name.includes('opening') || name.includes('open')) {
            if (ts.finish && (!computedOpening || ts.finish > computedOpening)) {
              computedOpening = ts.finish;
            }
          }
        }
        if (minStart) computedTakStart = minStart;
        if (maxFinish) computedTakCompl = maxFinish;
      }

      const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
      const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';
      const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      map.set(pUniqueKey, {
        status,
        start: computedTakStart || '9999-12-31',
        finish,
        computedTakStart,
        computedTakCompl,
        computedOpening,
        sortedTasks
      });
    });
    return map;
  }, [projects, tasksByProjectKey, tasksByCodeMap]);

  const getProjectInfo = useCallback((p: Project): ProjectInfo => {
    const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
    const cached = projectInfoMap.get(pUniqueKey);
    if (cached) return cached;
    
    const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
    let rawGroupTasks = tasksByProjectKey.get(key);
    if (!rawGroupTasks || rawGroupTasks.length === 0) {
      const pCode = String(p.code || "").trim().toLowerCase();
      const candidateTasks = tasksByCodeMap.get(pCode) || [];
      rawGroupTasks = candidateTasks.filter(t => {
        const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
        const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
        return matchesStore && matchesYear;
      });
    }
    const sortedTasks = sortGroupTasks(rawGroupTasks || []);
    let computedTakStart = p.computedTakStart || p.start;
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    let computedOpening = p.computedOpening || p.opening;

    if (sortedTasks.length > 0) {
      let minStart: string | undefined = undefined;
      let maxFinish: string | undefined = undefined;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
        if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
        const name = String(t.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (t.finish && (!computedOpening || t.finish > computedOpening)) {
            computedOpening = t.finish;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxFinish) computedTakCompl = maxFinish;
    } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
      let minStart: string | undefined = undefined;
      let maxFinish: string | undefined = undefined;
      for (let i = 0; i < p.taskSummaries.length; i++) {
        const ts = p.taskSummaries[i];
        if (ts.start && (!minStart || ts.start < minStart)) minStart = ts.start;
        if (ts.finish && (!maxFinish || ts.finish > maxFinish)) maxFinish = ts.finish;
        const name = String(ts.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (ts.finish && (!computedOpening || ts.finish > computedOpening)) {
            computedOpening = ts.finish;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxFinish) computedTakCompl = maxFinish;
    }

    const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';
    return { status, start: computedTakStart || '9999-12-31', finish, sortedTasks, computedTakStart, computedTakCompl, computedOpening };
  }, [projectInfoMap, tasksByProjectKey, tasksByCodeMap]);

  return {
    tasksByProjectKey,
    tasksByCodeMap,
    projectInfoMap,
    getProjectInfo,
  };
}
