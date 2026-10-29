import React, { useEffect, useRef } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  parseDateTime,
  formatDisplayDateMain,
  formatDisplayDateTime,
  matchesAdvancedSearch,
  stripSearchAccents,
} from '../../lib/utils';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { ProjectInfo } from './useDetailProjectInfo';

export function doesTaskMatchSearchTerm(
  t: Task,
  idx: number,
  projectCode: string | undefined,
  termLower: string
): boolean {
  if (!termLower) return true;
  const codeFallback = `${projectCode || ''}#${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`;
  const rawFields: (string | number | undefined | null)[] = [
    t.taskCodePhu,
    codeFallback,
    t.name,
    t.duration,
    t.start,
    t.finish,
    t.party,
    t.runningStatus,
    t.predecessor,
  ];
  if (t.notes && t.notes.length > 0) {
    for (let i = 0; i < t.notes.length; i++) {
      rawFields.push(t.notes[i]?.content);
    }
  }
  if (t.comments && t.comments.length > 0) {
    for (let i = 0; i < t.comments.length; i++) {
      rawFields.push(t.comments[i]?.text);
    }
  }

  if (matchesAdvancedSearch(termLower, rawFields)) {
    return true;
  }

  // Only format dates if raw string check didn't match
  if (t.start) {
    const startMain = formatDisplayDateMain(t.start);
    const startFull = formatDisplayDateTime(t.start);
    if (matchesAdvancedSearch(termLower, [startMain, startFull])) {
      return true;
    }
  }
  if (t.finish) {
    const finishMain = formatDisplayDateMain(t.finish);
    const finishFull = formatDisplayDateTime(t.finish);
    if (matchesAdvancedSearch(termLower, [finishMain, finishFull])) {
      return true;
    }
  }

  return false;
}

interface UseDetailFilterSyncParams {
  projects: Project[];
  filteredProjects: Project[];
  tasksByProjectKey: Map<string, Task[]>;
  getProjectInfo: (p: Project) => ProjectInfo;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  deferredSearchTerm: string;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  lastSelectedStatusFilterRef: React.MutableRefObject<string>;
  globalYearFilter: string;
  effectiveStore: string;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  effectiveLocationFilter: string[];
  initialFilterCode?: string;
  visibleCount: number;
  setVisibleCount: (count: number) => void;
  setVisibleActiveProjectIds: (ids: string[]) => void;
}

export function useDetailFilterSync({
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
}: UseDetailFilterSyncParams) {
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession('taka_detail_status_filter', statusFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored =
        lastSelectedStatusFilterRef.current ||
        safeGetItemSession('taka_detail_status_filter') ||
        'On process + Upcoming 3 days';
      const finalStatus = restored && restored !== 'all' ? restored : 'On process + Upcoming 3 days';
      setStatusFilter(finalStatus);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [deferredSearchTerm]);

  // Auto-jump to matched project location(s) when searching (Debounced)
  useEffect(() => {
    const term = deferredSearchTerm.trim();
    if (!term) return;

    const timer = setTimeout(() => {
      const matchedProjects = projects.filter(p => {
        const pYear = p.year ? String(p.year) : null;
        if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
        if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;

        const groupTasks = tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];
        return matchesAdvancedSearch(
          term,
          [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party],
          [],
          (tLower) => {
            const summariesMatch =
              p.taskSummaries?.some(ts => {
                const tsName = String(ts.name || '');
                return tsName.toLowerCase().includes(tLower) || stripSearchAccents(tsName).includes(tLower);
              }) || false;
            if (summariesMatch) return true;
            return groupTasks.some((t, idx) => doesTaskMatchSearchTerm(t, idx, p.code, tLower));
          }
        );
      });

      const matchedLocations = Array.from(
        new Set(matchedProjects.map(p => p.location).filter((loc): loc is string => !!loc && loc.trim() !== ''))
      );
      if (matchedLocations.length > 0) {
        const currentLocs = globalLocationFilter || [];
        const isSame =
          currentLocs.length === matchedLocations.length &&
          currentLocs.every(l => matchedLocations.includes(l));
        if (!isSame) {
          setGlobalLocationFilter(matchedLocations);
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    deferredSearchTerm,
    projects,
    tasksByProjectKey,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
  ]);

  // Auto-clear stale filters when user manually changes Year / Store in Task Detail
  const prevYearStoreRef = useRef(`${globalYearFilter}_${effectiveStore}`);
  const prevTargetNavRef = useRef(
    `${useAppStore.getState().detailTabFilterCode || ''}_${useAppStore.getState().detailTabFocusTaskId || ''}`
  );

  useEffect(() => {
    const storeState = useAppStore.getState();
    const currentKey = `${globalYearFilter}_${effectiveStore}`;
    const currentTargetNav = `${storeState.detailTabFilterCode || ''}_${storeState.detailTabFocusTaskId || ''}`;
    const didTargetNavJustChange = prevTargetNavRef.current !== currentTargetNav && currentTargetNav !== '_';
    prevTargetNavRef.current = currentTargetNav;

    if (prevYearStoreRef.current !== currentKey) {
      prevYearStoreRef.current = currentKey;

      // Only clear deep-link filter code / focus task if the user manually switched store/year
      // without a simultaneous deep-link target change
      if (!didTargetNavJustChange && (storeState.detailTabFilterCode || storeState.detailTabFocusTaskId)) {
        storeState.setDetailTabFilterCode('');
        storeState.setDetailTabFocusTaskId('');
        if (searchTerm && searchTerm === storeState.detailTabFilterCode) {
          setSearchTerm('');
        }
      }

      const projectsInNewScope = projects.filter(p => {
        if (p.isDeleted) return false;
        const pYear = p.year ? String(p.year) : null;
        if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter)) return false;
        if (effectiveStore !== 'all' && String(p.store || '').toUpperCase() !== String(effectiveStore).toUpperCase()) {
          return false;
        }
        return true;
      });

      if (projectsInNewScope.length > 0) {
        if (globalLocationFilter.length > 0) {
          const hasMatchingLoc = projectsInNewScope.some(
            p => p.location && globalLocationFilter.includes(p.location)
          );
          if (!hasMatchingLoc) {
            setGlobalLocationFilter([]);
          }
        }
      }

      // Always reset to 'On process + Upcoming 3 days' when switching Year or Store, unless actively searching
      if (!searchTerm.trim()) {
        setStatusFilter('On process + Upcoming 3 days');
        lastSelectedStatusFilterRef.current = 'On process + Upcoming 3 days';
        safeSetItemSession('taka_detail_status_filter', 'On process + Upcoming 3 days');
      }
    }
  }, [
    globalYearFilter,
    effectiveStore,
    projects,
    globalLocationFilter,
    statusFilter,
    searchTerm,
    setGlobalLocationFilter,
    setStatusFilter,
    setSearchTerm,
    getProjectInfo,
  ]);

  useEffect(() => {
    if (filteredProjects.length === 0 && projects.length > 0) {
      console.warn('[Detail] 0 dự án sau khi lọc', {
        totalProjects: projects.length,
        year: globalYearFilter,
        store: effectiveStore,
        locationSelected: globalLocationFilter,
        locationEffective: effectiveLocationFilter,
        status: statusFilter,
        search: deferredSearchTerm,
      });
    }
  }, [
    filteredProjects.length,
    projects.length,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    effectiveLocationFilter,
    statusFilter,
    deferredSearchTerm,
  ]);

  // Ensure visibleCount is large enough to render target project row
  useEffect(() => {
    if (!initialFilterCode) return;
    const filterClean = String(initialFilterCode).trim().toUpperCase();
    const projIdx = filteredProjects.findIndex(p => {
      const pCode = String(p.code || '').trim().toUpperCase();
      const pId = String(p.id || '').trim().toUpperCase();
      return pId === filterClean || pCode === filterClean || (pCode && filterClean.startsWith(pCode));
    });
    if (projIdx >= 0 && projIdx >= visibleCount) {
      setVisibleCount(projIdx + 25);
    }
  }, [initialFilterCode, filteredProjects, visibleCount, setVisibleCount]);

  const prevVisibleIdsRef = useRef<string>('');
  useEffect(() => {
    const targetProjects =
      filteredProjects.length > 0
        ? filteredProjects.slice(0, visibleCount)
        : projects
            .filter(p => {
              const pYear = p.year ? String(p.year) : null;
              if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
              if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
              if (
                globalLocationFilter.length > 0 &&
                (!p.location || !globalLocationFilter.includes(p.location))
              ) {
                return false;
              }
              return true;
            })
            .slice(0, visibleCount);

    const visibleIds = targetProjects.map(p => String(p.id || p.no));
    const idsKey = visibleIds.join(',');
    if (prevVisibleIdsRef.current !== idsKey) {
      prevVisibleIdsRef.current = idsKey;
      setVisibleActiveProjectIds(visibleIds);
    }
  }, [
    filteredProjects,
    projects,
    visibleCount,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setVisibleActiveProjectIds,
  ]);

  useEffect(() => {
    return () => {
      useAppStore.getState().setVisibleActiveProjectIds([]);
    };
  }, []);
}
