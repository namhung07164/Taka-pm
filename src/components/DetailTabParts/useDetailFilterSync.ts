import React, { useEffect, useRef } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  parseDateTime,
  formatDisplayDateMain,
  formatDisplayDateTime,
  matchesAdvancedSearch,
} from '../../lib/utils';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { ProjectInfo } from './useDetailProjectInfo';

export function doesTaskMatchSearchTerm(
  t: Task,
  idx: number,
  projectCode: string | undefined,
  termLower: string
): boolean {
  const codeFallback = `${projectCode || ''}#${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`;
  // Fast raw field check first before formatting dates
  if (
    (t.taskCodePhu && String(t.taskCodePhu).toLowerCase().includes(termLower)) ||
    codeFallback.toLowerCase().includes(termLower) ||
    (t.name && String(t.name).toLowerCase().includes(termLower)) ||
    (t.duration && String(t.duration).toLowerCase().includes(termLower)) ||
    (t.start && String(t.start).toLowerCase().includes(termLower)) ||
    (t.finish && String(t.finish).toLowerCase().includes(termLower)) ||
    (t.party && String(t.party).toLowerCase().includes(termLower))
  ) {
    return true;
  }

  if (t.notes?.some(n => String(n.content || '').toLowerCase().includes(termLower))) {
    return true;
  }

  // Only format dates if raw string check didn't match
  if (t.start) {
    if (
      formatDisplayDateMain(t.start).toLowerCase().includes(termLower) ||
      formatDisplayDateTime(t.start).toLowerCase().includes(termLower)
    ) {
      return true;
    }
  }
  if (t.finish) {
    if (
      formatDisplayDateMain(t.finish).toLowerCase().includes(termLower) ||
      formatDisplayDateTime(t.finish).toLowerCase().includes(termLower)
    ) {
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
      setStatusFilter(restored);
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
              p.taskSummaries?.some(ts => String(ts.name || '').toLowerCase().includes(tLower)) || false;
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

  // Auto-clear stale filters when user changes Year / Store in Task Detail
  const prevYearStoreRef = useRef(`${globalYearFilter}_${effectiveStore}`);

  useEffect(() => {
    const currentKey = `${globalYearFilter}_${effectiveStore}`;
    if (prevYearStoreRef.current !== currentKey) {
      prevYearStoreRef.current = currentKey;

      const storeState = useAppStore.getState();
      if (storeState.detailTabFilterCode || storeState.detailTabFocusTaskId) {
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

        if (statusFilter !== 'all') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayTime = today.getTime();
          const hasMatchingStatus = projectsInNewScope.some(p => {
            const info = getProjectInfo(p);
            if (statusFilter === 'On process + Upcoming 3 days') {
              if (info.status === 'On process') return true;
              if (info.status === 'Upcoming') {
                const dStart = parseDateTime(info.start);
                if (dStart) {
                  dStart.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((dStart.getTime() - todayTime) / (1000 * 60 * 60 * 24));
                  return diffDays <= 3 && diffDays >= 0;
                }
              }
              return false;
            }
            return info.status === statusFilter;
          });
          if (!hasMatchingStatus) {
            setStatusFilter('all');
            safeSetItemSession('taka_detail_status_filter', 'all');
          }
        }
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
