import React, { useMemo } from 'react';
import { Project, DelegationGroup } from '../../types';
import { matchesAdvancedSearch, computePlanProgressPercent, computeActProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries } from '../../lib/utils';
import { DetailTableRow, SortConfig } from './detailTypes';
import { ProjectInfo } from './useDetailProjectInfo';
import { useAppStore } from '../../store/useAppStore';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';

interface UseDetailFlatRowsParams {
  filteredProjects: Project[];
  visibleCount: number;
  projectInfoMap: Map<string, ProjectInfo>;
  getProjectInfo: (p: Project) => ProjectInfo;
  sortConfig: SortConfig | null;
  expandedCodes: string[];
  delegationGroups: DelegationGroup[];
  lowerSearchTerm: string;
  taskCodeMap: Map<string, string>;
}

export function useDetailFlatRows({
  filteredProjects,
  visibleCount,
  projectInfoMap,
  getProjectInfo,
  sortConfig,
  expandedCodes,
  delegationGroups,
  lowerSearchTerm,
  taskCodeMap,
}: UseDetailFlatRowsParams) {
  const flatTableRows = useMemo<DetailTableRow[]>(() => {
    const rows: DetailTableRow[] = [];
    const visibleProjects = filteredProjects.slice(0, visibleCount);

    visibleProjects.forEach((p, pIdx) => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      const sortedTasks = pInfo.sortedTasks || [];

      const groupTasks = sortConfig ? [...sortedTasks].sort((a, b) => {
        let valA = '';
        let valB = '';
        let direction = 'asc';
        
        if (sortConfig.key === 'start') {
          valA = a.start || '9999-12-31';
          valB = b.start || '9999-12-31';
        } else if (sortConfig.key === 'finish') {
          valA = a.finish || '9999-12-31';
          valB = b.finish || '9999-12-31';
        } else if (sortConfig.key === 'taskName') {
          valA = a.name || '';
          valB = b.name || '';
        } else if (sortConfig.key === 'code') {
          const codeA = a.taskCodePhu || '';
          const codeB = b.taskCodePhu || '';
          direction = sortConfig.direction;
          const comp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
          return direction === 'asc' ? comp : -comp;
        } else if (sortConfig.key === 'no') {
          const ordA = a.orderIndex !== undefined ? a.orderIndex : 0;
          const ordB = b.orderIndex !== undefined ? b.orderIndex : 0;
          direction = sortConfig.direction;
          return direction === 'asc' ? ordA - ordB : ordB - ordA;
        } else if (sortConfig.key === 'duration') {
          valA = a.duration || '0';
          valB = b.duration || '0';
          direction = sortConfig.direction;
          const numA = Number(valA);
          const numB = Number(valB);
          if (!isNaN(numA) && !isNaN(numB)) {
            return direction === 'asc' ? numA - numB : numB - numA;
          }
        } else if (sortConfig.key === 'party') {
          valA = a.party || '';
          valB = b.party || '';
        } else if (sortConfig.key === 'predecessor') {
          valA = a.predecessor || '';
          valB = b.predecessor || '';
        }

        direction = sortConfig.direction;
        return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }) : sortedTasks;

      const isExpanded =
        expandedCodes.includes(String(p.id || '')) ||
        (p.code ? expandedCodes.includes(p.code) : false) ||
        (p.no !== undefined && p.no !== null ? expandedCodes.includes(String(p.no)) : false);
      const isProjDelegationOn = groupTasks.some(t => Boolean(t.delegation)) || (p.taskSummaries?.some(ts => Boolean(ts.delegation)) ?? false);

      const rolledUpGroupTasks = rollupParentTaskDatesAndStatus(groupTasks, delegationGroups);
      const validGroupTasks = rolledUpGroupTasks.map(t => ({
        ...t,
        name: t.name && String(t.name).trim() ? t.name : (t.taskCodePhu || 'Task')
      }));

      const isProjectMatch = lowerSearchTerm
        ? matchesAdvancedSearch(lowerSearchTerm, [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party])
        : true;

      const tasksToRender = isProjectMatch
        ? validGroupTasks
        : lowerSearchTerm 
          ? validGroupTasks.filter(t => {
              const code = taskCodeMap.get(t.id) || '';
              const commentsMatch = t.comments?.some(c => String(c.text || '').toLowerCase().includes(lowerSearchTerm));
              const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm));
              return (
                String(t.name || '').toLowerCase().includes(lowerSearchTerm) ||
                code.toLowerCase().includes(lowerSearchTerm) ||
                String(t.party || '').toLowerCase().includes(lowerSearchTerm) ||
                commentsMatch ||
                notesMatch
              );
            })
          : validGroupTasks;

      const activeSummaries = (p.taskSummaries && Array.isArray(p.taskSummaries))
        ? p.taskSummaries.filter(ts => !isTaskDeletedInTracker(ts.id, p.id ? String(p.id) : undefined))
        : [];
      const summaryCount = activeSummaries.length;
      const loadedTaskCount = validGroupTasks.length;
      const authoritativeCount = loadedTaskCount > 0 ? loadedTaskCount : (Array.isArray(p.taskSummaries) ? summaryCount : (p.taskCount ?? 0));
      const effectiveTaskCount = (lowerSearchTerm && !isProjectMatch)
        ? tasksToRender.length
        : authoritativeCount;

      let planProgressPercent = 0;
      let actProgressPercent = 0;

      if (validGroupTasks.length > 0) {
        planProgressPercent = computePlanProgressPercent(validGroupTasks);
        actProgressPercent = computeActProgressPercent(validGroupTasks, delegationGroups);
      } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        planProgressPercent = computePlanProgressFromSummaries(p.taskSummaries);
        actProgressPercent = computeActProgressFromSummaries(p.taskSummaries);
      } else {
        planProgressPercent = p.computedPlanProgress ?? 0;
        actProgressPercent = p.computedActProgress ?? 0;
      }

      rows.push({
        type: 'project',
        key: `proj-${p.id || p.no}`,
        project: p,
        projectIndex: pIdx,
        effectiveTaskCount,
        isExpanded,
        groupTasks,
        isProjDelegationOn,
        planProgressPercent,
        actProgressPercent,
      });

      if (isExpanded) {
        const groupTaskIndexMap = new Map<string, number>();
        groupTasks.forEach((gt, idx) => {
          if (gt.id) groupTaskIndexMap.set(gt.id, idx);
        });

        const seenRenderTaskIds = new Set<string>();
        tasksToRender.forEach((t, tIdx) => {
          if (t.id && seenRenderTaskIds.has(t.id)) return;
          if (t.id) seenRenderTaskIds.add(t.id);
          const originalIndex = groupTaskIndexMap.get(t.id);
          const i = originalIndex !== undefined ? originalIndex : tIdx;
          rows.push({
            type: 'task',
            key: `task-${p.id || p.code || p.no}-${t.id || tIdx}`,
            task: t,
            taskIndex: i,
            project: p,
            projectIndex: pIdx,
            groupTasks,
            isProjDelegationOn,
          });
        });
      }
    });

    return rows;
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo, sortConfig, expandedCodes, delegationGroups, lowerSearchTerm, taskCodeMap]);

  return flatTableRows;
}
