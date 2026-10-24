import React, { useMemo } from 'react';
import { Project, Task, DelegationGroup } from '../../types';
import { matchesAdvancedSearch, computePlanProgressPercent, computeActProgressPercent, computePlanProgressFromSummaries, computeActProgressFromSummaries } from '../../lib/utils';
import { DetailTableRow, SortConfig } from './detailTypes';
import { ProjectInfo } from './useDetailProjectInfo';
import { useAppStore } from '../../store/useAppStore';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import { doesTaskMatchSearchTerm } from './useDetailFilterSync';

interface UseDetailFlatRowsParams {
  filteredProjects: Project[];
  visibleCount: number;
  projectInfoMap: Map<string, ProjectInfo>;
  getProjectInfo: (p: Project) => ProjectInfo;
  sortConfig: SortConfig | null;
  expandedCodes: string[];
  expandedModularTasks?: Set<string>;
  delegationGroups: DelegationGroup[];
  lowerSearchTerm: string;
  taskCodeMap: Map<string, string>;
}

import { buildProjectParentHierarchyIndex, type ProjectParentHierarchyIndex } from '../../lib/parentHierarchyUtils';
export { buildProjectParentHierarchyIndex, type ProjectParentHierarchyIndex };


export function useDetailFlatRows({
  filteredProjects,
  visibleCount,
  projectInfoMap,
  getProjectInfo,
  sortConfig,
  expandedCodes,
  expandedModularTasks = new Set(),
  delegationGroups,
  lowerSearchTerm,
  taskCodeMap,
}: UseDetailFlatRowsParams) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const isExportingPDF = useAppStore(state => state.isExportingPDF);
  const flatTableRows = useMemo<DetailTableRow[]>(() => {
    const rows: DetailTableRow[] = [];
    const visibleProjects = (isPrintPreview || isExportingPDF)
      ? filteredProjects
      : filteredProjects.slice(0, visibleCount);

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

      const isExpanded = p.id
        ? expandedCodes.includes(String(p.id)) ||
          (p.code && (!p.year || String(p.year) === String(globalYearFilter))
            ? expandedCodes.includes(p.code)
            : false)
        : (p.code ? expandedCodes.includes(p.code) : false);
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
        groupTasks: validGroupTasks,
        isProjDelegationOn,
        planProgressPercent,
        actProgressPercent,
      });

      if (isExpanded) {
        const { parentTaskMap, groupTaskIndexMap, parentTaskIdsInProject } = buildProjectParentHierarchyIndex(validGroupTasks);

        const seenRenderTaskIds = new Set<string>();
        tasksToRender.forEach((t, tIdx) => {
          if (t.id && seenRenderTaskIds.has(t.id)) return;

          // If t is a valid child task (and not itself a parent task), check if its parent task is expanded
          const rawParentId = t.parentTaskId
            ? String(t.parentTaskId).trim()
            : ((t as any).parentId ? String((t as any).parentId).trim() : '');
          const matchedParent =
            parentTaskMap.get(String(t.id)) ||
            parentTaskMap.get(String(t.id).toLowerCase()) ||
            (t.taskCodePhu ? parentTaskMap.get(String(t.taskCodePhu).trim().toLowerCase()) : undefined) ||
            (rawParentId ? (parentTaskMap.get(rawParentId) || parentTaskMap.get(rawParentId.toLowerCase())) : undefined);

          if (matchedParent && !parentTaskIdsInProject.has(String(t.id)) && String(matchedParent.id) !== String(t.id)) {
            // Only bypass collapse if user explicitly searched for a term that directly matches this child task and does not match the project as a whole
            const isDirectChildSearchHit = Boolean(lowerSearchTerm && !isProjectMatch && doesTaskMatchSearchTerm(t, tIdx, p.code, lowerSearchTerm));
            if (!isDirectChildSearchHit) {
              const candidateIds: string[] = [
                String(matchedParent.id).trim(),
                String(matchedParent.id).trim().toLowerCase(),
              ];
              if (rawParentId) {
                candidateIds.push(rawParentId, rawParentId.toLowerCase());
              }
              if (matchedParent.taskCodePhu) {
                candidateIds.push(String(matchedParent.taskCodePhu).trim());
                candidateIds.push(String(matchedParent.taskCodePhu).trim().toLowerCase());
              }
              if (matchedParent.orderIndex !== undefined && matchedParent.orderIndex !== null) {
                const ordNum = Number(matchedParent.orderIndex);
                candidateIds.push(String(ordNum + 1), `#${ordNum + 1}`, String(ordNum));
              }

              const isParentExpanded = candidateIds.some(cid => expandedModularTasks.has(cid));
              if (!isParentExpanded) {
                return; // Parent task is collapsed -> hide child task
              }
            }
          }

          if (t.id) seenRenderTaskIds.add(t.id);
          const originalIndex = groupTaskIndexMap.get(String(t.id));
          const i = originalIndex !== undefined ? originalIndex : tIdx;
          rows.push({
            type: 'task',
            key: `task-${p.id || p.code || p.no}-${t.id || tIdx}`,
            task: t,
            taskIndex: i,
            project: p,
            projectIndex: pIdx,
            groupTasks: validGroupTasks,
            isProjDelegationOn,
          });
        });
      }
    });

    return rows;
  }, [filteredProjects, visibleCount, isPrintPreview, isExportingPDF, projectInfoMap, getProjectInfo, sortConfig, expandedCodes, expandedModularTasks, delegationGroups, lowerSearchTerm, taskCodeMap, globalYearFilter]);

  return flatTableRows;
}
