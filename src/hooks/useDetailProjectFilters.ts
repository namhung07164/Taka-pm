import { useMemo, useCallback } from 'react';
import { Project, Task, DelegationGroup } from '../types';
import { getStatus, getTaskStatus, resolveActualStatus, matchesAdvancedSearch, formatDisplayDateMain, formatDisplayDateTime } from '../lib/utils';

interface UseDetailProjectFiltersParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  globalYearFilter: string;
  effectiveStore: string;
  globalLocationFilter: string[];
  statusFilter: string;
  deferredSearchTerm: string;
}

export function useDetailProjectFilters({
  projects,
  tasks,
  delegationGroups,
  globalYearFilter,
  effectiveStore,
  globalLocationFilter,
  statusFilter,
  deferredSearchTerm,
}: UseDetailProjectFiltersParams) {
  const { tasksByProjectKey } = useMemo(() => {
    const keyMap = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
      let list = keyMap.get(key);
      if (!list) {
        list = [];
        keyMap.set(key, list);
      }
      list.push(t);
    });
    return { tasksByProjectKey: keyMap };
  }, [tasks]);

  const delegationGroupByParentKey = useMemo(() => {
    const map = new Map<string, DelegationGroup>();
    delegationGroups.forEach(g => {
      if (g.parentTaskId) {
        const keyWithStore = `${g.parentTaskId}-${g.projectStore || ''}`;
        map.set(keyWithStore, g);
        if (!map.has(g.parentTaskId)) {
          map.set(g.parentTaskId, g);
        }
      }
    });
    return map;
  }, [delegationGroups]);

  const getProjectInfo = useCallback((p: Project) => {
    const groupTasks = tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];
    return {
      sortedTasks: groupTasks,
      planProgress: p.computedPlanProgress ?? 0,
      actProgress: p.computedActProgress ?? 0,
      totalCount: groupTasks.length
    };
  }, [tasksByProjectKey]);

  const projectInfoMap = useMemo(() => {
    const map = new Map<string, any>();
    projects.forEach(p => {
      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      map.set(key, getProjectInfo(p));
    });
    return map;
  }, [projects, getProjectInfo]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : (p.start ? String(p.start).substring(0, 4) : null));
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
      if (globalLocationFilter.length > 0 && (!p.location || !globalLocationFilter.includes(p.location))) return false;

      if (statusFilter !== 'all') {
        const pStatus = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
        if (statusFilter === 'On process + Upcoming 3 days') {
          if (pStatus !== 'On process' && pStatus !== 'Upcoming' && (pStatus as string) !== 'Delay' && (pStatus as string) !== 'Overdue') return false;
        } else if (pStatus !== statusFilter) {
          return false;
        }
      }

      if (deferredSearchTerm) {
        const groupTasks = tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];
        const isMatch = matchesAdvancedSearch(
          deferredSearchTerm,
          [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party],
          [],
          (term) => {
            const summariesMatch = p.taskSummaries?.some(ts =>
              String(ts.name || "").toLowerCase().includes(term)
            ) || false;

            const taskMatches = groupTasks.some((t, idx) => {
              const taskFields = [
                t.taskCodePhu,
                `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
                t.name,
                t.duration,
                t.start,
                t.finish,
                t.party,
                formatDisplayDateMain(t.start),
                formatDisplayDateTime(t.start),
                formatDisplayDateMain(t.finish),
                formatDisplayDateTime(t.finish)
              ];
              const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(term));
              const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(term)) || false;
              return fieldMatch || notesMatch;
            });

            return summariesMatch || taskMatches;
          }
        );
        if (!isMatch) return false;
      }
      return true;
    });
  }, [projects, globalYearFilter, effectiveStore, globalLocationFilter, statusFilter, deferredSearchTerm, tasksByProjectKey]);

  const taskCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach((t, i) => {
      map.set(t.id, t.taskCodePhu || `${t.projectCode || ''}#${(t.orderIndex !== undefined ? t.orderIndex : i) + 1}`);
    });
    return map;
  }, [tasks]);

  const taskActualStatusMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const taskStatus = getTaskStatus(t.start, t.finish);
      const delegationGroup = delegationGroupByParentKey.get(t.id);
      const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
      map.set(t.id, actStatus);
    }
    return map;
  }, [tasks, delegationGroupByParentKey]);

  return {
    tasksByProjectKey,
    delegationGroupByParentKey,
    getProjectInfo,
    projectInfoMap,
    filteredProjects,
    taskCodeMap,
    taskActualStatusMap,
  };
}
