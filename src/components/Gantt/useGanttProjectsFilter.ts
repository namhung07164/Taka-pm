import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { 
  getStatus, 
  getProjectDatesAndStatus,
  matchProjectStatusFilter,
  parseDateTime, 
  getUserAllowedStores, 
  getEffectiveStoreFilter, 
  matchesAdvancedSearch 
} from '../../lib/utils';
import { useLocationOptions } from '../../hooks/useLocationOptions';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';

interface UseGanttProjectsFilterParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: any[];
  currentUser: AppUser;
}

export function useGanttProjectsFilter({
  projects,
  tasks,
  delegationGroups,
  currentUser
}: UseGanttProjectsFilterParams) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const setExpandedProjects = useAppStore(state => state.setExpandedProjectIds);
  const ganttTabFilterProjectId = useAppStore(state => state.ganttTabFilterProjectId);
  const setGanttTabFilterProjectId = useAppStore(state => state.setGanttTabFilterProjectId);

  const [searchTerm, setSearchTerm] = useState(() => safeGetItemSession("taka_gantt_search") || "");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Sync QuickNav targeted project filter
  useEffect(() => {
    if (ganttTabFilterProjectId) {
      const targetProj = projects.find(
        p => (p.id && String(p.id) === String(ganttTabFilterProjectId)) ||
             (p.code && String(p.code).trim().toUpperCase() === String(ganttTabFilterProjectId).trim().toUpperCase())
      );
      const codeToDisplay = targetProj?.code || ganttTabFilterProjectId;
      setSearchTerm(codeToDisplay);
      setFilterProjectStatus('all');
    }
  }, [ganttTabFilterProjectId, projects]);

  const [filterProjectStatus, setFilterProjectStatus] = useState<string>(() => {
    if ((safeGetItemSession("taka_gantt_search") || "").trim()) return 'all';
    return safeGetItemSession("taka_gantt_status_filter") || 'On process + Upcoming 3 days';
  });

  const lastSelectedStatusFilterRef = useRef<string>(
    safeGetItemSession("taka_gantt_status_filter") || 'On process + Upcoming 3 days'
  );
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(!!(safeGetItemSession("taka_gantt_search") || "").trim());

  useEffect(() => {
    const timer = setTimeout(() => {
      safeSetItemSession("taka_gantt_search", searchTerm);
      if (ganttTabFilterProjectId) {
        const targetProj = projects.find(
          p => (p.id && String(p.id) === String(ganttTabFilterProjectId)) ||
               (p.code && String(p.code).trim().toUpperCase() === String(ganttTabFilterProjectId).trim().toUpperCase())
        );
        const expectedCode = targetProj?.code || ganttTabFilterProjectId;
        if (!searchTerm.trim() || searchTerm.trim().toUpperCase() !== expectedCode.trim().toUpperCase()) {
          setGanttTabFilterProjectId('');
        }
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm, ganttTabFilterProjectId, setGanttTabFilterProjectId, projects]);

  const onStatusFilterChange = useCallback((status: string) => {
    setFilterProjectStatus(status);
    if (!searchTerm.trim()) {
      lastSelectedStatusFilterRef.current = status;
      safeSetItemSession("taka_gantt_status_filter", status);
    }
  }, [searchTerm]);

  // Status & Location filter preservation during search
  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (filterProjectStatus !== 'all') {
        lastSelectedStatusFilterRef.current = filterProjectStatus;
        safeSetItemSession("taka_gantt_status_filter", filterProjectStatus);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setFilterProjectStatus('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_gantt_status_filter") || 'On process + Upcoming 3 days';
      setFilterProjectStatus(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [deferredSearchTerm]);

  const uniqueYears = useMemo(() => {
    const yearsSet = new Set<string>();
    projects.forEach(p => {
      if (p.year) yearsSet.add(String(p.year));
      else if (p.computedTakStart) yearsSet.add(String(p.computedTakStart).substring(0, 4));
      else if (p.start) yearsSet.add(String(p.start).substring(0, 4));
    });
    ['2026', '2027'].forEach(y => yearsSet.add(y));
    return Array.from(yearsSet).sort();
  }, [projects]);

  const uniqueStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const locationOptions = useLocationOptions();

  // Index tasks by project ID, project key, and code
  const tasksByProjectId = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      if (t.projectId) {
        const pId = String(t.projectId);
        if (!map.has(pId)) map.set(pId, []);
        map.get(pId)!.push(t);
      }
    });
    return map;
  }, [tasks]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${String(t.projectCode || '').trim().toUpperCase()}_${String(t.projectYear || '').trim()}_${String(t.projectStore || '').trim().toUpperCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const tasksMapByCode = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const code = String(t.projectCode || '').trim().toUpperCase();
      if (!map.has(code)) map.set(code, []);
      map.get(code)!.push(t);
    });
    return map;
  }, [tasks]);

  const getGroupTasksForProject = useCallback(
    (p: Project): Task[] => {
      const mergedMap = new Map<string, Task>();

      const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
      const pYear = p.year ? String(p.year).trim() : '';

      // 1. By projectId
      if (p.id && tasksByProjectId.has(String(p.id))) {
        tasksByProjectId.get(String(p.id))!.forEach(t => {
          if (t && (t.id || t.name)) {
            const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
            const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
            if (pStore && tStore && pStore !== tStore) return;
            if (pYear && tYear && pYear !== tYear) return;
            mergedMap.set(String(t.id || t.name), t);
          }
        });
      }

      // 2. By project key (CODE_YEAR_STORE)
      const key = `${String(p.code || '').trim().toUpperCase()}_${String(p.year || '').trim()}_${String(p.store || '').trim().toUpperCase()}`;
      const foundByKey = tasksByProject.get(key);
      if (foundByKey && foundByKey.length > 0) {
        foundByKey.forEach(t => {
          if (t && (t.id || t.name)) mergedMap.set(String(t.id || t.name), t);
        });
      }

      // 3. By project code
      const codeKey = String(p.code || '').trim().toUpperCase();
      if (codeKey) {
        const foundByCode = tasksMapByCode.get(codeKey);
        if (foundByCode && foundByCode.length > 0) {
          foundByCode.forEach(t => {
            const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toUpperCase() === String(p.store).trim().toUpperCase();
            const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
            if (matchesStore && matchesYear && t && (t.id || t.name)) {
              mergedMap.set(String(t.id || t.name), t);
            }
          });
        }
      }

      let resultTasks = Array.from(mergedMap.values());

      // Fallback & Merge from taskSummaries if taskSummaries has more items
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > resultTasks.length) {
        const existingSet = new Set<string>();
        resultTasks.forEach(t => {
          if (t.id) existingSet.add(String(t.id).toLowerCase());
          if (t.taskCodePhu) existingSet.add(String(t.taskCodePhu).trim().toLowerCase());
          if (t.name) existingSet.add(String(t.name).trim().toLowerCase());
        });

        p.taskSummaries.forEach((ts, idx) => {
          const tsId = ts.id ? String(ts.id).toLowerCase() : '';
          const tsCode = ts.taskCodePhu ? String(ts.taskCodePhu).trim().toLowerCase() : '';
          const tsName = ts.name ? String(ts.name).trim().toLowerCase() : '';
          const hasMatch = (tsId && existingSet.has(tsId)) ||
                           (tsCode && existingSet.has(tsCode)) ||
                           (tsName && existingSet.has(tsName));
          if (!hasMatch) {
            resultTasks.push({
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
              taskCodePhu: ts.taskCodePhu || (p.code ? `${p.code}-${idx + 1}` : undefined),
              orderIndex: ts.orderIndex !== undefined ? ts.orderIndex : idx,
              projectId: p.id,
              ...ts
            } as Task);
          }
        });
      }

      return resultTasks;
    },
    [tasksByProjectId, tasksByProject, tasksMapByCode]
  );

  // Pre-indexed Search Pool Cache to eliminate Garbage Collection pauses on mobile Safari
  const projectSearchIndex = useMemo(() => {
    const map = new Map<string, { pPool: (string | number | undefined | null)[]; tPools: (string | number | undefined | null)[][] }>();
    projects.forEach(p => {
      const pTasks = getGroupTasksForProject(p);
      const pPool = [p.code, p.name, p.store, p.location, p.year, p.detail, p.party];
      const tPools = pTasks.map(t => [
        t.name,
        t.taskCodePhu,
        t.party,
        t.runningStatus,
        t.predecessor,
        ...(t.notes ? t.notes.map(n => n.content) : [])
      ]);
      map.set(p.id || p.code, { pPool, tPools });
    });
    return map;
  }, [projects, getGroupTasksForProject]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // Strict single-project isolation when navigated via Quick Navigation
      if (ganttTabFilterProjectId) {
        const isTarget = (p.id && String(p.id) === String(ganttTabFilterProjectId)) ||
                         (p.code && String(p.code).trim().toUpperCase() === String(ganttTabFilterProjectId).trim().toUpperCase());
        return isTarget;
      }

      const { computedTakStart, status } = getProjectDatesAndStatus(p, tasks);
      const pYear = p.year ? String(p.year).trim() : (computedTakStart ? String(computedTakStart).substring(0, 4) : null);
      const matchesYear = globalYearFilter === 'all' || (pYear !== null && pYear === String(globalYearFilter).trim());
      const matchesStore = effectiveStore === 'all' || (Boolean(p.store) && String(p.store).toUpperCase().trim() === effectiveStore.toUpperCase().trim());
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));

      const matchesStatus = matchProjectStatusFilter(status, filterProjectStatus, computedTakStart);

      if (!matchesYear || !matchesStore || !matchesLocation || !matchesStatus) return false;

      if (!deferredSearchTerm.trim()) return true;

      const indexed = projectSearchIndex.get(p.id || p.code);
      if (indexed) {
        if (matchesAdvancedSearch(deferredSearchTerm, [...indexed.pPool, status])) return true;
        return indexed.tPools.some(tPool => matchesAdvancedSearch(deferredSearchTerm, tPool));
      }

      return matchesAdvancedSearch(deferredSearchTerm, [p.code, p.name, p.store, p.location, status]);
    });
  }, [
    projects,
    ganttTabFilterProjectId,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    filterProjectStatus,
    deferredSearchTerm,
    projectSearchIndex
  ]);

  const [visibleCount, setVisibleCount] = useState(20);

  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      const startA = a.computedTakStart || '9999-12-31';
      const startB = b.computedTakStart || '9999-12-31';
      if (startA !== startB) return startA.localeCompare(startB);
      return a.code.localeCompare(b.code);
    });
  }, [filteredProjects]);

  const paginatedProjects = useMemo(() => {
    return sortedProjects.slice(0, visibleCount);
  }, [sortedProjects, visibleCount]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + 20, sortedProjects.length));
  }, [sortedProjects.length]);

  // Search filter operates on Project Summaries + loaded tasks first (Tri-Gate Lazy Loading).
  // Projects remain in summarized/collapsed state until user taps Expand (+), which triggers Delta Sync task fetching.
  const lastAutoExpandedSearchRef = useRef<string>('');
  useEffect(() => {
    const term = deferredSearchTerm.trim();
    if (!term) {
      lastAutoExpandedSearchRef.current = '';
    }
  }, [deferredSearchTerm]);

  return {
    globalYearFilter,
    setGlobalYearFilter,
    globalStoreFilter,
    setGlobalStoreFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    filterProjectStatus,
    onStatusFilterChange,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    uniqueYears,
    uniqueStores,
    locationOptions,
    tasksByProject,
    tasksMapByCode,
    getGroupTasksForProject,
    filteredProjects,
    sortedProjects,
    paginatedProjects,
    visibleCount,
    setVisibleCount,
    handleLoadMore
  };
}
