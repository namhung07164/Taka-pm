import React, { useCallback, useMemo } from 'react';
import { Project, Task } from '../../types';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { getStatus } from '../../lib/utils';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';

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

      const pStore = p.store ? String(p.store).trim().toLowerCase() : '';
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

      if (p.id && tasksByProjectId.has(String(p.id))) {
        tasksByProjectId.get(String(p.id))!.forEach(t => {
          if (t && (t.id || t.name)) {
            const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
            const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
            if (pStore && tStore && pStore !== tStore) return;
            if (pYear && tYear && pYear !== tYear) return;
            mergedTasksMap.set(String(t.id || t.name), t);
          }
        });
      }

      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
      const foundByKey = tasksByProjectKey.get(key);
      if (foundByKey && foundByKey.length > 0) {
        foundByKey.forEach(t => {
          if (t && (t.id || t.name)) {
            if (t.projectId && p.id && String(t.projectId) !== String(p.id)) return;
            mergedTasksMap.set(String(t.id || t.name), t);
          }
        });
      }

      const allCodes = new Set<string>();
      if (p.code) allCodes.add(String(p.code).trim().toLowerCase());
      if (p.linkCodes) {
        String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(c => allCodes.add(c));
      }
      allCodes.forEach(code => {
        const candidateTasks = tasksByCodeMap.get(code) || [];
        candidateTasks.forEach(t => {
          if (!t || (!t.id && !t.name)) return;
          if (t.projectId && p.id && String(t.projectId) !== String(p.id)) return;

          const tStore = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
          const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';

          if (pStore && tStore && pStore !== tStore) return;
          if (pYear && tYear && pYear !== tYear) return;

          mergedTasksMap.set(String(t.id || t.name), t);
        });
      });

      let rawGroupTasks: Task[] = Array.from(mergedTasksMap.values());

      // Safety guard: Merge missing tasks from p.taskSummaries when taskSummaries has more items
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > rawGroupTasks.length) {
        const existingIdSet = new Set<string>();
        const existingCodeNameSet = new Set<string>();
        const existingNameSet = new Set<string>();

        rawGroupTasks.forEach(t => {
          if (t.id) existingIdSet.add(String(t.id).toLowerCase());
          const tName = t.name ? String(t.name).trim().toLowerCase() : '';
          const tCode = t.taskCodePhu ? String(t.taskCodePhu).trim().toLowerCase() : '';
          if (tName) existingNameSet.add(tName);
          if (tCode && tName) existingCodeNameSet.add(`${tCode}:::${tName}`);
        });

        p.taskSummaries.forEach((ts, idx) => {
          if (isTaskDeletedInTracker(ts.id, p.id ? String(p.id) : undefined)) {
            return;
          }

          const tsId = ts.id ? String(ts.id).toLowerCase() : '';
          const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
          const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';

          const hasMatch = (tsId && existingIdSet.has(tsId)) ||
                           (tsCode && tsName && existingCodeNameSet.has(`${tsCode}:::${tsName}`)) ||
                           (!tsCode && tsName && existingNameSet.has(tsName));
          if (!hasMatch) {
            rawGroupTasks.push({
              id: ts.id || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`,
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
      }

      // Ensure unique tasks by id to eliminate any duplicate key collision
      const uniqueTaskMap = new Map<string, Task>();
      rawGroupTasks.forEach(t => {
        if (t && t.id && !uniqueTaskMap.has(t.id)) {
          uniqueTaskMap.set(t.id, t);
        }
      });
      rawGroupTasks = Array.from(uniqueTaskMap.values());
      const rolledUpGroupTasks = rollupParentTaskDatesAndStatus(rawGroupTasks || []);
      const sortedTasks = sortGroupTasks(rolledUpGroupTasks);
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
  }, [projects, tasksByProjectId, tasksByProjectKey, tasksByCodeMap]);

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
      const allCodes = new Set<string>();
      if (p.code) allCodes.add(String(p.code).trim().toLowerCase());
      if (p.linkCodes) {
        String(p.linkCodes).toLowerCase().split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(c => allCodes.add(c));
      }
      const matchedMap = new Map<string, Task>();
      allCodes.forEach(code => {
        const candidateTasks = tasksByCodeMap.get(code) || [];
        candidateTasks.forEach(t => {
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          if (matchesStore && matchesYear && t && (t.id || t.name)) {
            matchedMap.set(String(t.id || t.name), t);
          }
        });
      });
      rawGroupTasks = Array.from(matchedMap.values());
    }
    if (!rawGroupTasks) rawGroupTasks = [];
    if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > rawGroupTasks.length) {
      const existingIdSet = new Set<string>();
      const existingCodeNameSet = new Set<string>();
      const existingNameSet = new Set<string>();

      rawGroupTasks.forEach(t => {
        if (t.id) existingIdSet.add(String(t.id).toLowerCase());
        const tName = t.name ? String(t.name).trim().toLowerCase() : '';
        const tCode = t.taskCodePhu ? String(t.taskCodePhu).trim().toLowerCase() : '';
        if (tName) existingNameSet.add(tName);
        if (tCode && tName) existingCodeNameSet.add(`${tCode}:::${tName}`);
      });

      p.taskSummaries.forEach((ts, idx) => {
        if (isTaskDeletedInTracker(ts.id, p.id ? String(p.id) : undefined)) return;
        const tsId = ts.id ? String(ts.id).toLowerCase() : '';
        const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
        const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';

        const hasMatch = (tsId && existingIdSet.has(tsId)) ||
                         (tsCode && tsName && existingCodeNameSet.has(`${tsCode}:::${tsName}`)) ||
                         (!tsCode && tsName && existingNameSet.has(tsName));
        if (!hasMatch) {
          rawGroupTasks!.push({
            id: ts.id || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`,
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
    }
    // Ensure unique tasks by id to eliminate any duplicate key collision
    if (rawGroupTasks && rawGroupTasks.length > 0) {
      const uniqueTaskMap = new Map<string, Task>();
      rawGroupTasks.forEach(t => {
        if (t && t.id && !uniqueTaskMap.has(t.id)) {
          uniqueTaskMap.set(t.id, t);
        }
      });
      rawGroupTasks = Array.from(uniqueTaskMap.values());
    }
    const rolledUpGroupTasks = rollupParentTaskDatesAndStatus(rawGroupTasks || []);
    const sortedTasks = sortGroupTasks(rolledUpGroupTasks);
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
