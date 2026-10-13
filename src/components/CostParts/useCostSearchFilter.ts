import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import { Project, Cost, AppUser } from '../../types';
import { matchesAdvancedSearch } from '../../lib/utils';
import { safeSetItemSession, safeGetItemSession } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';

interface UseCostSearchFilterParams {
  projects: Project[];
  costs: Cost[];
  currentUser: AppUser;
  initialSearchTerm?: string;
  costTabSearchTerm?: string;
  globalYearFilter: string;
  effectiveStore: string;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  getGroupCostsForProject: (p: Project) => Cost[];
}

export function useCostSearchFilter({
  projects,
  costs,
  currentUser,
  initialSearchTerm = '',
  costTabSearchTerm = '',
  globalYearFilter,
  effectiveStore,
  globalLocationFilter,
  setGlobalLocationFilter,
  getGroupCostsForProject,
}: UseCostSearchFilterParams) {
  const [searchTerm, setSearchTerm] = useState(
    initialSearchTerm || costTabSearchTerm || ''
  );
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    } else if (costTabSearchTerm) {
      setSearchTerm(costTabSearchTerm);
    }
  }, [initialSearchTerm, costTabSearchTerm]);

  const [hasActForcFilter, setHasActForcFilter] = useState(() => {
    if ((initialSearchTerm || '').trim()) return 'all';
    return safeGetItemSession('taka_cost_act_forc_filter') || 'has_value';
  });
  const lastSelectedActForcFilterRef = useRef<string>(
    safeGetItemSession('taka_cost_act_forc_filter') || 'has_value'
  );
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(!!(initialSearchTerm || '').trim());

  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (hasActForcFilter !== 'all') {
        lastSelectedActForcFilterRef.current = hasActForcFilter;
        safeSetItemSession('taka_cost_act_forc_filter', hasActForcFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setHasActForcFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored =
        lastSelectedActForcFilterRef.current ||
        safeGetItemSession('taka_cost_act_forc_filter') ||
        'has_value';
      setHasActForcFilter(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [deferredSearchTerm]);

  // Auto-jump to matched project location(s) when searching in CostTab (Debounced)
  useEffect(() => {
    const term = deferredSearchTerm.trim();
    if (!term) return;

    const timer = setTimeout(() => {
      const matchedProjects = projects.filter((p) => {
        const pYear = p.year
          ? String(p.year).trim()
          : p.start
          ? String(p.start).substring(0, 4)
          : null;
        if (
          globalYearFilter !== 'all' &&
          (pYear === null || pYear !== String(globalYearFilter).trim())
        )
          return false;
        if (
          effectiveStore !== 'all' &&
          (!p.store ||
            String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())
        )
          return false;

        const groupCosts = getGroupCostsForProject(p);

        const isMatch = matchesAdvancedSearch(
          term,
          [
            p.store,
            p.location,
            p.year,
            p.code,
            p.linkCodes,
            p.name,
            p.detail,
            (p as any).description,
            p.note,
          ],
          [],
          (tLower) => {
            return groupCosts.some((c) => {
              const cBalance =
                (c.actual || 0) -
                (c.firstPaid || 0) -
                (c.secondPaid || 0) -
                (c.thirdPaid || 0);
              const costFields = [
                c.description,
                c.vendor,
                c.actual,
                c.firstPaid,
                c.secondPaid,
                c.thirdPaid,
                c.supportingFee,
                cBalance,
              ];
              return costFields.some((val) =>
                String(val || '').toLowerCase().includes(tLower)
              );
            });
          }
        );
        return isMatch;
      });

      const matchedLocations = Array.from(
        new Set(
          matchedProjects
            .map((p) => p.location)
            .filter((loc): loc is string => !!loc && loc.trim() !== '')
        )
      );

      if (matchedLocations.length > 0) {
        const currentLocs = globalLocationFilter || [];
        const isSame =
          currentLocs.length === matchedLocations.length &&
          currentLocs.every((l) => matchedLocations.includes(l));
        if (!isSame) {
          setGlobalLocationFilter(matchedLocations);
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [
    deferredSearchTerm,
    projects,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    getGroupCostsForProject,
  ]);

  // Handle Escape key globally to clear search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchTerm) {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen ||
          state.isCalendarSyncModalOpen;
        if (hasOpenModal) return;

        e.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement && typeof (activeElement as HTMLElement).blur === 'function') {
          (activeElement as HTMLElement).blur();
        }
        setSearchTerm('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchTerm]);

  return {
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    hasActForcFilter,
    setHasActForcFilter,
  };
}
