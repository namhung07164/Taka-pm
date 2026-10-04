import React, { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { Project, Task, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { 
  getStatus, 
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

  const [searchTerm, setSearchTerm] = useState(() => safeGetItemSession("taka_gantt_search") || "");
  const deferredSearchTerm = useDeferredValue(searchTerm);

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
    }, 350);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

  // Index tasks by project code
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
      const key = `${String(p.code || '').trim().toUpperCase()}_${String(p.year || '').trim()}_${String(p.store || '').trim().toUpperCase()}`;
      return tasksByProject.get(key) || tasksMapByCode.get(String(p.code || '').trim().toUpperCase()) || [];
    },
    [tasksByProject, tasksMapByCode]
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
      const pYear = p.year ? String(p.year).trim() : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      const matchesYear = globalYearFilter === 'all' || (pYear !== null && pYear === String(globalYearFilter).trim());
      const matchesStore = effectiveStore === 'all' || (Boolean(p.store) && String(p.store).toUpperCase().trim() === effectiveStore.toUpperCase().trim());
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));

      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      let matchesStatus = true;
      if (filterProjectStatus === 'On process + Upcoming 3 days') {
        if (status === 'On process') {
          matchesStatus = true;
        } else if (status === 'Upcoming') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dStart = parseDateTime(p.computedTakStart);
          if (dStart) {
            dStart.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((dStart.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            matchesStatus = diffDays <= 3 && diffDays >= 0;
          } else {
            matchesStatus = false;
          }
        } else {
          matchesStatus = false;
        }
      } else {
        matchesStatus = filterProjectStatus === 'all' || status === filterProjectStatus;
      }

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
