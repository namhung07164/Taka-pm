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
import { useAppStore } from '../../store/useAppStore';
import { SortConfig } from './detailTypes';
import { useDetailProjectInfo } from './useDetailProjectInfo';
import { useDetailFlatRows, buildProjectParentHierarchyIndex } from './useDetailFlatRows';
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

function collectTaskAliases(
  pId: string,
  tasks: Task[],
  projectInfoMap: Map<string, any>
): { targetTask?: Task; aliases: Set<string> } {
  const pIdStr = String(pId).trim();
  const pIdLower = pIdStr.toLowerCase();
  let targetTask = tasks.find(
    (t) => String(t.id) === pIdStr || (t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === pIdLower)
  );
  if (!targetTask) {
    for (const info of projectInfoMap.values()) {
      const found = info.sortedTasks?.find(
        (t: Task) => String(t.id) === pIdStr || (t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === pIdLower)
      );
      if (found) {
        targetTask = found;
        break;
      }
    }
  }
  const aliases = new Set<string>([pIdStr, pIdLower]);
  if (targetTask) {
    if (targetTask.id) {
      aliases.add(String(targetTask.id).trim());
      aliases.add(String(targetTask.id).trim().toLowerCase());
    }
    if (targetTask.taskCodePhu) {
      aliases.add(String(targetTask.taskCodePhu).trim());
      aliases.add(String(targetTask.taskCodePhu).trim().toLowerCase());
    }
  }
  return { targetTask, aliases };
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
  const initialStatus = safeGetItemSession("taka_detail_status_filter");
  const defaultStatus = initialStatus && initialStatus !== 'all' ? initialStatus : 'On process + Upcoming 3 days';
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const lastSelectedStatusFilterRef = useRef<string>(defaultStatus);

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

  const isFirstMountVisibleCountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountVisibleCountRef.current) {
      isFirstMountVisibleCountRef.current = false;
      return;
    }
    setVisibleCount(30);
  }, [searchTerm, globalStoreFilter, globalYearFilter, globalLocationFilter, statusFilter]);

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

  const fixedProjectCode = useAppStore(state => state.fixedProjectCode);

  const filteredProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return projects.filter(p => {
      if (fixedProjectCode && fixedProjectCode.trim()) {
        const fix = fixedProjectCode.trim().toLowerCase();
        const pCode = (p.code || '').trim().toLowerCase();
        const rawLink = Array.isArray(p.linkCodes) ? p.linkCodes : typeof p.linkCodes === 'string' ? [p.linkCodes] : [];
        const pLinkCodes = rawLink.map((c: any) => String(c).trim().toLowerCase());
        const pName = (p.name || '').trim().toLowerCase();
        const matchesFix = pCode === fix || pCode.includes(fix) || pName.includes(fix) || pLinkCodes.includes(fix) || String(p.id).toLowerCase() === fix;
        if (!matchesFix) return false;
      }

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
              matchesAdvancedSearch(term, [ts.name, ts.taskCodePhu, ts.party])
            ) || false;
            if (summariesMatch) return true;
            return groupTasks.some((t, idx) => doesTaskMatchSearchTerm(t, idx, p.code, term));
          }
        );
        if (!isMatch) return false;
      }

      return true;
    });
  }, [projects, projectInfoMap, getProjectInfo, globalYearFilter, effectiveStore, effectiveLocationFilter, statusFilter, deferredSearchTerm, tasksByProjectKey, fixedProjectCode]);

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

  const lowerSearchTerm = deferredSearchTerm.toLowerCase().trim();

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

  // Pre-indexed O(1) map of subtask counts per resolved canonical parent task ID
  const childTasksCountMap = useMemo(() => {
    const map = new Map<string, number>();
    projects.forEach(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      const pTasks = info.sortedTasks || [];
      if (pTasks.length === 0) return;
      const { localChildCountByParentId } = buildProjectParentHierarchyIndex(pTasks);
      localChildCountByParentId.forEach((cnt, pid) => {
        map.set(pid, cnt);
      });
    });
    return map;
  }, [projects, projectInfoMap, getProjectInfo]);

  // Modular parent task expand/collapse state (isolated to Detail Tab)
  const [expandedModularTasks, setExpandedModularTasks] = useState<string[]>(() => {
    try {
      const saved = safeGetItemSession('taka_detail_modular_expanded') || sessionStorage.getItem('taka_detail_modular_expanded');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const expandedModularTasksSet = useMemo(() => {
    const set = new Set<string>();
    expandedModularTasks.forEach(id => {
      const idStr = String(id).trim();
      set.add(idStr);
      set.add(idStr.toLowerCase());
    });
    return set;
  }, [expandedModularTasks]);

  const handleToggleModularParent = useCallback((parentTaskId: string) => {
    const { targetTask, aliases } = collectTaskAliases(parentTaskId, tasks, projectInfoMap);
    const pId = String(parentTaskId).trim();
    if (!pId) return;

    setExpandedModularTasks(prev => {
      const isCurrentlyExpanded = prev.some(id => aliases.has(String(id).trim()) || aliases.has(String(id).trim().toLowerCase()));
      let next: string[];
      if (isCurrentlyExpanded) {
        next = prev.filter(id => !aliases.has(String(id).trim()) && !aliases.has(String(id).trim().toLowerCase()));
      } else {
        const canonicalId = targetTask?.id ? String(targetTask.id).trim() : pId;
        const cleaned = prev.filter(id => !aliases.has(String(id).trim()) && !aliases.has(String(id).trim().toLowerCase()));
        cleaned.push(canonicalId);
        next = cleaned;
      }
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify(next));
      return next;
    });
  }, [tasks, projectInfoMap]);

  const handleToggleProjectModularTasks = useCallback((parentTaskIds: string[], expand: boolean) => {
    setExpandedModularTasks(prev => {
      const prevSet = new Set(prev);
      parentTaskIds.forEach(pId => {
        const { targetTask, aliases } = collectTaskAliases(pId, tasks, projectInfoMap);
        aliases.forEach(a => expand ? prevSet.add(a) : prevSet.delete(a));
        if (targetTask?.id) expand ? prevSet.add(String(targetTask.id).trim()) : prevSet.delete(String(targetTask.id).trim());
      });
      const next = Array.from(prevSet);
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify(next));
      return next;
    });
  }, [tasks, projectInfoMap]);

  const { currentModularParentIds, totalChildTasksCount } = useMemo(() => {
    const parentIdSet = new Set<string>();
    let totalChildren = 0;
    filteredProjects.slice(0, visibleCount).forEach(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      const pTasks = info.sortedTasks || [];
      if (pTasks.length === 0) return;
      const { projectModularParentIds, projectChildTasksCount } = buildProjectParentHierarchyIndex(pTasks);
      projectModularParentIds.forEach(pid => parentIdSet.add(pid));
      totalChildren += projectChildTasksCount;
    });

    return {
      currentModularParentIds: Array.from(parentIdSet),
      totalChildTasksCount: totalChildren,
    };
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo]);

  const isAllModularExpanded = useMemo(() => {
    if (currentModularParentIds.length === 0) return false;
    return currentModularParentIds.some(id => 
      expandedModularTasksSet.has(id) || expandedModularTasksSet.has(id.toLowerCase())
    );
  }, [currentModularParentIds, expandedModularTasksSet]);

  const handleToggleExpandAllModular = useCallback(() => {
    if (isAllModularExpanded) {
      setExpandedModularTasks([]);
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify([]));
    } else {
      setExpandedModularTasks(currentModularParentIds);
      safeSetItemSession('taka_detail_modular_expanded', JSON.stringify(currentModularParentIds));
    }
  }, [isAllModularExpanded, currentModularParentIds]);

  const modularParentsCount = useMemo(() => {
    return currentModularParentIds.length;
  }, [currentModularParentIds]);

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
    handleToggleProjectModularTasks,
    isAllModularExpanded,
    handleToggleExpandAllModular,
    totalChildTasksCount,
    modularParentsCount,
    flatTableRows,
    handleSelectAllTasksInProject,
    handleToggleSelectTask,
    handleClearFocus,
    handleBackToGantt,
  };
}
