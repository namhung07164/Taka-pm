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
  const { tasksByProjectId, tasksByProjectKey, tasksByCodeMap } = useMemo(() => {
    const idMap = new Map<string, Task[]>();
    const keyMap = new Map<string, Task[]>();
    const codeMap = new Map<string, Task[]>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      if (t.isDeleted) continue;
      if (t.projectId) {
        const pIdStr = String(t.projectId);
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
        const c = String(t.projectCode).trim().toLowerCase();
        let cList = codeMap.get(c);
        if (!cList) {
          cList = [];
          codeMap.set(c, cList);
        }
        cList.push(t);
      }
    }
    return { tasksByProjectId: idMap, tasksByProjectKey: keyMap, tasksByCodeMap: codeMap };
  }, [tasks]);

  const projectInfoMap = useMemo(() => {
    const map = new Map<string, ProjectInfo>();

    projects.forEach(p => {
      const mergedTasksMap = new Map<string, Task>();

      if (p.id && tasksByProjectId.has(String(p.id))) {
        tasksByProjectId.get(String(p.id))!.forEach(t => {
          if (t && (t.id || t.name)) mergedTasksMap.set(String(t.id || t.name), t);
        });
      }

      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
      const foundByKey = tasksByProjectKey.get(key);
      if (foundByKey && foundByKey.length > 0) {
        foundByKey.forEach(t => {
          if (t && (t.id || t.name)) mergedTasksMap.set(String(t.id || t.name), t);
        });
      }

      const pCode = String(p.code || "").trim().toLowerCase();
      if (pCode) {
        const candidateTasks = tasksByCodeMap.get(pCode) || [];
        candidateTasks.forEach(t => {
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          if (matchesStore && matchesYear && t && (t.id || t.name)) {
            mergedTasksMap.set(String(t.id || t.name), t);
          }
        });
      }

      let rawGroupTasks: Task[] = Array.from(mergedTasksMap.values());
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        // Merge: In-memory tasks take precedence, but keep all summary tasks to ensure the count is correct
        const existingMap = new Map<string, any>();
        rawGroupTasks.forEach(t => {
          if (t.id) existingMap.set(String(t.id).toLowerCase(), t);
          if (t.taskCodePhu) existingMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
          const nameKey = String(t.name || '').trim().toLowerCase();
          if (nameKey) existingMap.set(nameKey, t);
        });

        const merged = [...rawGroupTasks];
        p.taskSummaries.forEach((ts, idx) => {
          const tsId = ts.id ? String(ts.id).toLowerCase() : '';
          const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
          const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
          const match = (tsId && existingMap.has(tsId)) ||
                        (tsCode && existingMap.has(tsCode)) ||
                        (tsName && existingMap.has(tsName));
          if (!match) {
            merged.push({
              id: ts.id || `ts_${p.code || p.id}_${p.store || 'HCM'}_${p.year || ''}_${idx}`,
              name: ts.name || `Task ${idx + 1}`,
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
              ...ts
            } as Task);
          }
        });
        rawGroupTasks = merged;
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
    
    let rawGroupTasks = p.id ? tasksByProjectId.get(String(p.id)) : undefined;
    if (!rawGroupTasks || rawGroupTasks.length === 0) {
      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
      rawGroupTasks = tasksByProjectKey.get(key);
    }
    if (!rawGroupTasks || rawGroupTasks.length === 0) {
      const pCode = String(p.code || "").trim().toLowerCase();
      const candidateTasks = tasksByCodeMap.get(pCode) || [];
      rawGroupTasks = candidateTasks.filter(t => {
        const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
        const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
        return matchesStore && matchesYear;
      });
    }
    if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
      // Merge: In-memory tasks take precedence, but keep all summary tasks to ensure the count is correct
      const existingMap = new Map<string, any>();
      rawGroupTasks?.forEach(t => {
        if (t.id) existingMap.set(String(t.id).toLowerCase(), t);
        if (t.taskCodePhu) existingMap.set(String(t.taskCodePhu).trim().toLowerCase(), t);
        const nameKey = String(t.name || '').trim().toLowerCase();
        if (nameKey) existingMap.set(nameKey, t);
      });

      const merged = [...(rawGroupTasks || [])];
      p.taskSummaries.forEach((ts, idx) => {
        const tsId = ts.id ? String(ts.id).toLowerCase() : '';
        const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
        const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
        const match = (tsId && existingMap.has(tsId)) ||
                      (tsCode && existingMap.has(tsCode)) ||
                      (tsName && existingMap.has(tsName));
        if (!match) {
          merged.push({
            id: ts.id || `ts_${p.code || p.id}_${p.store || 'HCM'}_${p.year || ''}_${idx}`,
            name: ts.name || `Task ${idx + 1}`,
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
            ...ts
          } as Task);
        }
      });
      rawGroupTasks = merged;
    }
    const sortedTasks = sortGroupTasks(rawGroupTasks || []);
    let computedTakStart = p.computedTakStart || p.start;
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    let computedOpening = p.computedOpening || (p.openingMode === 'manual' ? p.opening : '');

    if (sortedTasks.length > 0) {
      let minStart: string | undefined = undefined;
      let maxFinish: string | undefined = undefined;
      let hasOpeningTask = false;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
        if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
        const name = String(t.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (t.finish && (!hasOpeningTask || t.finish > computedOpening)) {
            computedOpening = t.finish;
            hasOpeningTask = true;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxFinish) computedTakCompl = maxFinish;
      if (!hasOpeningTask && p.openingMode !== 'manual') {
        computedOpening = '';
      }
    } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
      let minStart: string | undefined = undefined;
      let maxFinish: string | undefined = undefined;
      let hasOpeningTask = false;
      for (let i = 0; i < p.taskSummaries.length; i++) {
        const ts = p.taskSummaries[i];
        if (ts.start && (!minStart || ts.start < minStart)) minStart = ts.start;
        if (ts.finish && (!maxFinish || ts.finish > maxFinish)) maxFinish = ts.finish;
        const name = String(ts.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (ts.finish && (!hasOpeningTask || ts.finish > computedOpening)) {
            computedOpening = ts.finish;
            hasOpeningTask = true;
          }
        }
      }
      if (minStart) computedTakStart = minStart;
      if (maxFinish) computedTakCompl = maxFinish;
      if (!hasOpeningTask && p.openingMode !== 'manual') {
        computedOpening = '';
      }
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
