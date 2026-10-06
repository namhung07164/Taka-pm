import { useMemo, useCallback } from 'react';
import { Project, Task } from '../../types';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { getStatus } from '../../lib/utils';
import { deduplicateTasks } from '../../lib/taskDeduplicationService';

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
    tasks.forEach(t => {
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
    });
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
      const sortedTasks = sortGroupTasks(deduplicateTasks(rawGroupTasks || []));
      let computedTakStart = p.computedTakStart || p.start;
      if (sortedTasks.length > 0) {
        let minStart: string | undefined = undefined;
        for (let i = 0; i < sortedTasks.length; i++) {
          const t = sortedTasks[i];
          if (t.start && (!minStart || t.start < minStart)) {
            minStart = t.start;
          }
        }
        if (minStart) computedTakStart = minStart;
      }
      let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
      if (sortedTasks.length > 0) {
        let maxFinish: string | undefined = undefined;
        for (let i = 0; i < sortedTasks.length; i++) {
          const t = sortedTasks[i];
          if (t.finish && (!maxFinish || t.finish > maxFinish)) {
            maxFinish = t.finish;
          }
        }
        if (maxFinish) computedTakCompl = maxFinish;
      }
      let computedOpening = p.computedOpening || p.opening;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        const name = String(t.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (t.finish && (!computedOpening || t.finish > computedOpening)) {
            computedOpening = t.finish;
          }
        }
      }
      const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
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
    const sortedTasks = sortGroupTasks(rawGroupTasks);
    let computedTakStart = p.computedTakStart || p.start;
    if (sortedTasks.length > 0) {
      let minStart: string | undefined = undefined;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
      }
      if (minStart) computedTakStart = minStart;
    }
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    if (sortedTasks.length > 0) {
      let maxFinish: string | undefined = undefined;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
      }
      if (maxFinish) computedTakCompl = maxFinish;
    }
    let computedOpening = p.computedOpening || p.opening;
    for (let i = 0; i < sortedTasks.length; i++) {
      const t = sortedTasks[i];
      const name = String(t.name || '').toLowerCase();
      if (name.includes('opening') || name.includes('open')) {
        if (t.finish && (!computedOpening || t.finish > computedOpening)) {
          computedOpening = t.finish;
        }
      }
    }
    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
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
