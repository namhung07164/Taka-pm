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
import { isTaskDeletedInTracker } from '../../lib/taskDeletedTracker';
import { deduplicateTasksInMemory } from '../../lib/taskDeduplicationService';
import { filterNonOrphanTasks } from '../../lib/taskRollupService';

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
    const saved = safeGetItemSession("taka_gantt_status_filter");
    return saved && saved !== 'all' ? saved : 'On process + Upcoming 3 days';
  });

  const lastSelectedStatusFilterRef = useRef<string>(
    (() => {
      const saved = safeGetItemSession("taka_gantt_status_filter");
      return saved && saved !== 'all' ? saved : 'On process + Upcoming 3 days';
    })()
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
      const finalStatus = restored && restored !== 'all' ? restored : 'On process + Upcoming 3 days';
      setFilterProjectStatus(finalStatus);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [deferredSearchTerm]);

  // Reset to default 'On process + Upcoming 3 days' when switching Year or Store
  const prevGanttScopeRef = useRef(`${globalYearFilter}_${effectiveStore}`);
  useEffect(() => {
    const currentScope = `${globalYearFilter}_${effectiveStore}`;
    if (prevGanttScopeRef.current !== currentScope) {
      prevGanttScopeRef.current = currentScope;
      if (!searchTerm.trim()) {
        setFilterProjectStatus('On process + Upcoming 3 days');
        lastSelectedStatusFilterRef.current = 'On process + Upcoming 3 days';
        safeSetItemSession("taka_gantt_status_filter", 'On process + Upcoming 3 days');
      }
      if (globalLocationFilter.length > 0) {
        const hasMatchingLoc = projects.some(p => {
          if (p.isDeleted) return false;
          const pYear = p.year ? String(p.year) : null;
          if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter)) return false;
          if (effectiveStore !== 'all' && String(p.store || '').toUpperCase() !== String(effectiveStore).toUpperCase()) return false;
          return p.location && globalLocationFilter.includes(p.location);
        });
        if (!hasMatchingLoc) {
          setGlobalLocationFilter([]);
        }
      }
    }
  }, [globalYearFilter, effectiveStore, searchTerm, projects, globalLocationFilter, setGlobalLocationFilter]);

  const uniqueYears = useMemo(() => {
    const yearsSet = new Set<string>();
    projects.forEach(p => {
      if (p.year) yearsSet.add(String(p.year));
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

  const projectTasksCache = useMemo(
    () => new WeakMap<Project, Task[]>(),
    [tasksByProjectId, tasksByProject, tasksMapByCode]
  );

  const getGroupTasksForProject = useCallback(
    (p: Project): Task[] => {
      if (!p) return [];
      const cached = projectTasksCache.get(p);
      if (cached) return cached;

      const realTasksMap = new Map<string, Task>();
      const virtualTasksMap = new Map<string, Task>();

      const pIdStr = p.id ? String(p.id).trim() : '';
      const pStore = p.store ? String(p.store).trim().toUpperCase() : '';
      const pYear = p.year !== undefined && p.year !== null ? String(p.year).trim() : '';

      const tryAddTask = (t: Task) => {
        if (!t || (!t.id && !t.name) || t.isDeleted) return;
        const tIdStr = String(t.id || '').trim();
        if (tIdStr && isTaskDeletedInTracker(tIdStr, pIdStr || undefined)) return;
        if ((!t.name || !String(t.name).trim()) && (!t.start || !String(t.start).trim()) && (!t.finish || !String(t.finish).trim()) && !t.taskCodePhu) {
          return;
        }

        const tProjId = t.projectId ? String(t.projectId).trim() : '';
        if (tProjId && pIdStr) {
          if (tProjId !== pIdStr) return;
        } else {
          const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
          const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
          if (pStore && tStore && pStore !== tStore) return;
          if (pYear && tYear && pYear !== tYear) return;
        }

        const mapKey = (tIdStr || String(t.name)).toLowerCase();
        const isVirtual = Boolean((t as any)._isVirtualSummary);
        if (isVirtual) {
          if (!virtualTasksMap.has(mapKey)) virtualTasksMap.set(mapKey, t);
        } else {
          realTasksMap.set(mapKey, t);
        }
      };

      // 1. By projectId
      if (pIdStr && tasksByProjectId.has(pIdStr)) {
        tasksByProjectId.get(pIdStr)!.forEach(tryAddTask);
      }

      // 2. By project key (CODE_YEAR_STORE)
      const key = `${String(p.code || '').trim().toUpperCase()}_${pYear}_${pStore}`;
      const foundByKey = tasksByProject.get(key);
      if (foundByKey && foundByKey.length > 0) {
        foundByKey.forEach(tryAddTask);
      }

      // 3. By project code
      const codeKey = String(p.code || '').trim().toUpperCase();
      if (codeKey) {
        const foundByCode = tasksMapByCode.get(codeKey);
        if (foundByCode && foundByCode.length > 0) {
          foundByCode.forEach(tryAddTask);
        }
      }

      // 4. Fallback & Merge from taskSummaries if taskSummaries has more items than realTasksMap
      if (p.taskSummaries && Array.isArray(p.taskSummaries) && realTasksMap.size < p.taskSummaries.length) {
        p.taskSummaries.forEach((ts, idx) => {
          if (isTaskDeletedInTracker(ts.id, pIdStr || undefined)) return;
          if ((!ts.name || !String(ts.name).trim()) && (!ts.start || !String(ts.start).trim()) && (!ts.finish || !String(ts.finish).trim()) && !ts.taskCodePhu) {
            return;
          }
          const rawTsId = ts.id ? String(ts.id).trim() : '';
          const tsId = rawTsId || `ts_${p.id || p.code}_${p.store || 'HCM'}_${p.year || ''}_${idx}`;
          const tsIdLower = tsId.toLowerCase();
          if (!virtualTasksMap.has(tsIdLower)) {
            virtualTasksMap.set(tsIdLower, {
              id: tsId,
              name: (ts.name && String(ts.name).trim()) ? ts.name : (ts.taskCodePhu || `Task ${idx + 1}`),
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
              ...ts,
              _isVirtualSummary: true,
            } as unknown as Task);
          }
        });
      }

      const rawGroupTasks: Task[] = Array.from(realTasksMap.values());
      const realCodeSet = new Set<string>();
      const realNameOrdSet = new Set<string>();
      rawGroupTasks.forEach(rt => {
        if (rt.taskCodePhu) realCodeSet.add(String(rt.taskCodePhu).trim().toLowerCase());
        if (rt.name) {
          const nLower = String(rt.name).trim().toLowerCase();
          const ordStr = rt.orderIndex !== undefined && rt.orderIndex !== null ? String(rt.orderIndex) : '';
          realNameOrdSet.add(`${nLower}|${ordStr}`);
        }
      });

      virtualTasksMap.forEach((vt, mapKey) => {
        if (realTasksMap.has(mapKey)) return;
        const vtCode = vt.taskCodePhu ? String(vt.taskCodePhu).trim().toLowerCase() : '';
        if (vtCode && realCodeSet.has(vtCode)) return;
        const vtName = vt.name ? String(vt.name).trim().toLowerCase() : '';
        const vtOrd = vt.orderIndex !== undefined && vt.orderIndex !== null ? String(vt.orderIndex) : '';
        if (!vt.id || String(vt.id).startsWith('ts_')) {
          if (vtName && realNameOrdSet.has(`${vtName}|${vtOrd}`)) return;
        }
        rawGroupTasks.push(vt);
      });

      if (rawGroupTasks.length <= 1) {
        projectTasksCache.set(p, rawGroupTasks);
        return rawGroupTasks;
      }
      const { dedupedTasks } = deduplicateTasksInMemory(rawGroupTasks, [p]);
      const { cleaned } = filterNonOrphanTasks(dedupedTasks);
      projectTasksCache.set(p, cleaned);
      return cleaned;
    },
    [projectTasksCache, tasksByProjectId, tasksByProject, tasksMapByCode]
  );

  const hasActiveSearchTerm = Boolean(deferredSearchTerm.trim());

  // Pre-indexed Search Pool Cache built lazily only when user actually searches
  const projectSearchIndex = useMemo(() => {
    const map = new Map<string, { mainFields: (string | number | undefined | null)[]; subFields: (string | number | undefined | null)[] }>();
    if (!hasActiveSearchTerm) return map;
    projects.forEach(p => {
      const pTasks = getGroupTasksForProject(p);
      const rawLink = Array.isArray(p.linkCodes) ? p.linkCodes : typeof p.linkCodes === 'string' ? [p.linkCodes] : [];
      const computedTakStart = p.computedTakStart || p.start || "";
      const status = p.computedStatus || getStatus(computedTakStart, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);

      const mainFields = [
        p.code,
        p.name,
        p.store,
        p.location,
        p.year,
        p.detail,
        p.party,
        p.shopType,
        status,
        ...rawLink
      ];

      const subFields = pTasks.flatMap(t => [
        t.name,
        t.taskCodePhu,
        t.party,
        t.runningStatus,
        t.predecessor,
        ...(t.notes ? t.notes.map(n => n.content) : [])
      ]);

      if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
        p.taskSummaries.forEach(ts => {
          subFields.push(ts.name, ts.taskCodePhu, ts.party, ts.runningStatus);
        });
      }

      map.set(String(p.id || p.code), { mainFields, subFields });
    });
    return map;
  }, [hasActiveSearchTerm, projects, getGroupTasksForProject]);

  const fixedProjectCode = useAppStore(state => state.fixedProjectCode);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      // Check fixedProjectCode
      if (fixedProjectCode && fixedProjectCode.trim()) {
        const fix = fixedProjectCode.trim().toLowerCase();
        const pCode = (p.code || '').trim().toLowerCase();
        const pName = (p.name || '').trim().toLowerCase();
        const matchesFix = pCode === fix || pCode.includes(fix) || pName.includes(fix) || String(p.id).toLowerCase() === fix;
        if (!matchesFix) return false;
      }

      // Strict single-project isolation when navigated via Quick Navigation
      if (ganttTabFilterProjectId) {
        const isTarget = (p.id && String(p.id) === String(ganttTabFilterProjectId)) ||
                         (p.code && String(p.code).trim().toUpperCase() === String(ganttTabFilterProjectId).trim().toUpperCase());
        return isTarget;
      }

      const computedTakStart = p.computedTakStart || p.start || "";
      const status = p.computedStatus || getStatus(computedTakStart, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      const pYear = p.year ? String(p.year).trim() : null;
      const matchesYear = globalYearFilter === 'all' || (pYear !== null && pYear === String(globalYearFilter).trim());
      const matchesStore = effectiveStore === 'all' || (Boolean(p.store) && String(p.store).toUpperCase().trim() === effectiveStore.toUpperCase().trim());
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));

      const matchesStatus = matchProjectStatusFilter(status, filterProjectStatus, computedTakStart);

      if (!matchesYear || !matchesStore || !matchesLocation || !matchesStatus) return false;

      if (!deferredSearchTerm.trim()) return true;

      const key = String(p.id || p.code);
      const indexed = projectSearchIndex.get(key);
      if (indexed) {
        return matchesAdvancedSearch(deferredSearchTerm, indexed.mainFields, indexed.subFields);
      }

      return matchesAdvancedSearch(deferredSearchTerm, [p.code, p.name, p.store, p.location, p.year, p.detail, p.party, p.shopType, status]);
    });
  }, [
    projects,
    fixedProjectCode,
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

  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const isExportingPDF = useAppStore(state => state.isExportingPDF);

  const paginatedProjects = useMemo(() => {
    if (isPrintPreview || isExportingPDF) return sortedProjects;
    return sortedProjects.slice(0, visibleCount);
  }, [sortedProjects, visibleCount, isPrintPreview, isExportingPDF]);

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
