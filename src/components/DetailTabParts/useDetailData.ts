import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { 
  getTaskStatus, 
  parseDateTime, 
  resolveActualStatus, 
  matchesAdvancedSearch 
} from '../../lib/utils';
import { computeAllTaskCodes } from '../../lib/ganttUtils';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { SortConfig } from './detailTypes';
import { useDetailProjectInfo } from './useDetailProjectInfo';
import { useDetailFlatRows } from './useDetailFlatRows';
import { useDetailFocusTracking } from './useDetailFocusTracking';
import { useDetailFilterSync, doesTaskMatchSearchTerm } from './useDetailFilterSync';

interface UseDetailDataParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  effectiveStore: string;
  globalYearFilter: string;
  setGlobalYearFilter: (year: string) => void;
  globalStoreFilter: string;
  setGlobalStoreFilter: (store: string) => void;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  initialFilterCode?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  sortConfig: SortConfig | null;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  setVisibleActiveProjectIds: (ids: string[]) => void;
  canWrite: boolean;
}

export function useDetailData({
  projects,
  tasks,
  delegationGroups,
  currentUser: _currentUser,
  effectiveStore,
  globalYearFilter,
  setGlobalYearFilter,
  globalStoreFilter,
  setGlobalStoreFilter,
  globalLocationFilter,
  setGlobalLocationFilter,
  initialFilterCode,
  initialFocusTaskId,
  returnScrollId: _returnScrollId,
  onClearFocus,
  onBackToGantt,
  sortConfig,
  expandedCodes,
  setExpandedCodes,
  setVisibleActiveProjectIds,
}: UseDetailDataParams) {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastCheckedTaskIdRef = useRef<string | null>(null);

  // Focus & Viewport Tracking Hook
  const {
    activeProjectInView,
    handleClearFocus,
    handleBackToGantt,
  } = useDetailFocusTracking({
    projects,
    tasks,
    initialFilterCode,
    initialFocusTaskId,
    onClearFocus,
    onBackToGantt,
    searchTerm,
    setSearchTerm,
    globalYearFilter,
    setGlobalYearFilter,
    globalStoreFilter,
    setGlobalStoreFilter,
    statusFilter,
    setStatusFilter,
    expandedCodes,
    setExpandedCodes,
  });

  // Project Info Map & Helpers Hook
  const {
    tasksByProjectKey,
    projectInfoMap,
    getProjectInfo,
  } = useDetailProjectInfo({ projects, tasks });

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

  useEffect(() => { setVisibleCount(20); }, [searchTerm, globalStoreFilter, globalYearFilter, globalLocationFilter, statusFilter]);

  const effectiveLocationFilter = useMemo(() => {
    if (globalLocationFilter.length === 0) return globalLocationFilter;
    const available = new Set<string>();
    projects.forEach((p) => {
      const pYear = p.year ? String(p.year).trim() : '';
      if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter).trim()) return;
      if (effectiveStore !== 'all' && (!p.store || String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())) return;
      if (p.location) available.add(p.location);
    });
    return globalLocationFilter.filter((loc) => available.has(loc));
  }, [projects, globalYearFilter, effectiveStore, globalLocationFilter]);

  const filteredProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return projects.filter(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      const pYear = p.year ? String(p.year).trim() : null;
      if (globalYearFilter !== 'all' && (pYear === null || pYear !== String(globalYearFilter).trim())) return false;
      if (effectiveStore !== 'all' && (!p.store || String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())) return false;
      if (effectiveLocationFilter.length > 0 && (!p.location || !effectiveLocationFilter.includes(p.location))) return false;

      let matchesStatus = true;
      if (statusFilter === 'On process + Upcoming 3 days') {
        if (info.status === 'On process') {
          matchesStatus = true;
        } else if (info.status === 'Upcoming') {
          const dStart = parseDateTime(info.start);
          if (dStart) {
            dStart.setHours(0, 0, 0, 0);
            const diffTime = dStart.getTime() - todayTime;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            matchesStatus = diffDays <= 3 && diffDays >= 0;
          } else {
            matchesStatus = false;
          }
        } else {
          matchesStatus = false;
        }
      } else {
        matchesStatus = statusFilter === 'all' || info.status === statusFilter;
      }
      if (!matchesStatus) return false;

      const groupTasks = info.sortedTasks || tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];
      if (deferredSearchTerm) {
        const isMatch = matchesAdvancedSearch(
          deferredSearchTerm,
          [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party],
          [],
          (term) => {
            const summariesMatch = p.taskSummaries?.some(ts =>
              String(ts.name || "").toLowerCase().includes(term)
            ) || false;
            if (summariesMatch) return true;
            return groupTasks.some((t, idx) => doesTaskMatchSearchTerm(t, idx, p.code, term));
          }
        );
        if (!isMatch) return false;
      }

      return true;
    });
  }, [projects, projectInfoMap, getProjectInfo, globalYearFilter, effectiveStore, effectiveLocationFilter, statusFilter, deferredSearchTerm, tasksByProjectKey]);

  useDetailFilterSync({
    projects,
    filteredProjects,
    tasksByProjectKey,
    getProjectInfo,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    effectiveLocationFilter,
    initialFilterCode,
    visibleCount,
    setVisibleCount,
    setVisibleActiveProjectIds,
  });

  const allVisibleTaskIds = useMemo(() => {
    return filteredProjects.slice(0, visibleCount).flatMap(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      return (pInfo.sortedTasks || []).map(t => t.id);
    });
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo]);

  const lowerSearchTerm = searchTerm.toLowerCase().trim();

  // Task code & status maps
  const taskCodeMap = useMemo(() => {
    return computeAllTaskCodes(projects, tasks);
  }, [projects, tasks]);

  const taskActualStatusMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      const taskStatus = getTaskStatus(t.start, t.finish);
      const delegationGroup = delegationGroupByParentKey.get(t.id);
      const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || [], t);
      map.set(t.id, actStatus);
    }
    return map;
  }, [tasks, delegationGroupByParentKey]);

  // Pre-indexed O(1) map of subtask counts per parent to avoid 250,000 array filters in DetailTaskRow
  const childTasksCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const child = tasks[idx];
      if (child.parentTaskId) {
        const pId = String(child.parentTaskId).trim();
        map.set(pId, (map.get(pId) || 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  // Modular parent task expand/collapse state
  const [expandedModularTasks, setExpandedModularTasks] = useState<string[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem('taka_detail_modular_expanded') || '[]');
    } catch {
      return [];
    }
  });

  const expandedModularTasksSet = useMemo(() => new Set(expandedModularTasks), [expandedModularTasks]);

  const handleToggleModularParent = useCallback((parentTaskId: string) => {
    setExpandedModularTasks(prev => {
      const pId = String(parentTaskId).trim();
      const next = prev.includes(pId) ? prev.filter(id => id !== pId) : [...prev, pId];
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify(next));
      return next;
    });
  }, []);

  const currentModularParentIds = useMemo(() => {
    const set = new Set<string>();
    filteredProjects.slice(0, visibleCount).forEach(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      (info.sortedTasks || []).forEach(t => {
        if (t.parentTaskId) set.add(String(t.parentTaskId).trim());
      });
    });
    return Array.from(set);
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo]);

  const isAllModularExpanded = useMemo(() => {
    if (currentModularParentIds.length === 0) return false;
    return currentModularParentIds.some(id => expandedModularTasks.includes(id));
  }, [currentModularParentIds, expandedModularTasks]);

  const handleToggleExpandAllModular = useCallback(() => {
    if (isAllModularExpanded) {
      setExpandedModularTasks([]);
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify([]));
    } else {
      setExpandedModularTasks(currentModularParentIds);
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify(currentModularParentIds));
    }
  }, [isAllModularExpanded, currentModularParentIds]);

  const totalChildTasksCount = useMemo(() => {
    return tasks.filter(t => Boolean(t.parentTaskId)).length;
  }, [tasks]);

  // Virtual Windowing Flat Rows
  const flatTableRows = useDetailFlatRows({
    filteredProjects,
    visibleCount,
    projectInfoMap,
    getProjectInfo,
    sortConfig,
    expandedCodes,
    expandedModularTasks: expandedModularTasksSet,
    delegationGroups,
    lowerSearchTerm,
    taskCodeMap,
  });

  // Selection handlers
  const handleSelectAllTasksInProject = useCallback((groupTasks: Task[], select: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      groupTasks.forEach(t => {
        if (select) next.add(t.id);
        else next.delete(t.id);
      });
      return next;
    });
  }, []);

  const handleToggleSelectTask = useCallback((taskId: string, shiftKey: boolean) => {
    const strTaskId = String(taskId);
    setSelectedTaskIds(prev => {
      const next = new Set(Array.from(prev).map(String));
      const isChecked = !next.has(strTaskId);
      if (isChecked) {
        if (shiftKey && lastCheckedTaskIdRef.current && lastCheckedTaskIdRef.current !== strTaskId) {
          const visibleIds = allVisibleTaskIds.map(String);
          const lastIdx = visibleIds.indexOf(lastCheckedTaskIdRef.current);
          const currentIdx = visibleIds.indexOf(strTaskId);
          if (lastIdx !== -1 && currentIdx !== -1) {
            const minIdx = Math.min(lastIdx, currentIdx);
            const maxIdx = Math.max(lastIdx, currentIdx);
            for (let idx = minIdx; idx <= maxIdx; idx++) {
              next.add(visibleIds[idx]);
            }
          } else {
            next.add(strTaskId);
          }
        } else {
          next.add(strTaskId);
        }
        lastCheckedTaskIdRef.current = strTaskId;
      } else {
        next.delete(strTaskId);
        lastCheckedTaskIdRef.current = null;
      }
      return next;
    });
  }, [allVisibleTaskIds]);

  return {
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    visibleCount,
    setVisibleCount,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    selectedTaskIds,
    setSelectedTaskIds,
    lastCheckedTaskIdRef,
    activeProjectInView,
    delegationGroupByParentKey,
    projectInfoMap,
    getProjectInfo,
    filteredProjects,
    allVisibleTaskIds,
    lowerSearchTerm,
    taskCodeMap,
    taskActualStatusMap,
    childTasksCountMap,
    expandedModularTasks: expandedModularTasksSet,
    handleToggleModularParent,
    isAllModularExpanded,
    handleToggleExpandAllModular,
    totalChildTasksCount,
    flatTableRows,
    handleSelectAllTasksInProject,
    handleToggleSelectTask,
    handleClearFocus,
    handleBackToGantt,
  };
}
