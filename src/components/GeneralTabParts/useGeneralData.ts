import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
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
import { SortConfig } from './generalTypes';

interface UseGeneralDataParams {
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
}

const statusWeight: Record<string, number> = {
  'On process': 1,
  'Upcoming': 2,
  'Completed': 3,
  'Handover': 4,
  'Canceled': 5
};

export function useGeneralData({
  projects,
  tasks,
  currentUser
}: UseGeneralDataParams) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const pinnedProjects = useAppStore(state => state.pinnedProjects);
  const setPinnedProjects = useAppStore(state => state.setPinnedProjects);
  const theme = useAppStore(state => state.theme);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  const [flashToggle, setFlashToggle] = useState(true);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  // Status and Location Filter Preservation when Searching
  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession("taka_general_status_filter", statusFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days';
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
        const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
        const searchFields = [p.no, p.store, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party, status, p.year];
        const matchesSearch = matchesAdvancedSearch(term, searchFields);
        const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
        const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
        const matchesStore = effectiveStore === 'all' || p.store === effectiveStore;
        return matchesSearch && matchesYear && matchesStore;
      });
      const matchedLocations = Array.from(
        new Set(matchedProjects.map(p => p.location).filter((loc): loc is string => !!loc && loc.trim() !== ''))
      );
      if (matchedLocations.length > 0) {
        const currentLocs = globalLocationFilter || [];
        const isSame = currentLocs.length === matchedLocations.length && currentLocs.every(l => matchedLocations.includes(l));
        if (!isSame) {
          setGlobalLocationFilter(matchedLocations);
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [deferredSearchTerm, projects, globalYearFilter, effectiveStore, globalLocationFilter, setGlobalLocationFilter]);

  // Handle Escape key globally to clear search when not in modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchTerm) {
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
        if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
          (activeElement as HTMLElement).blur();
        }
        setSearchTerm("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm]);

  const years = useMemo(() => {
    const projYears = projects.map(p => {
      if (p.year) return String(p.year);
      if (p.computedTakStart) return String(p.computedTakStart).substring(0, 4);
      return null;
    }).filter(Boolean) as string[];
    const taskYears = tasks.map(t => {
      if (t.projectYear) return String(t.projectYear);
      if (t.start) return String(t.start).substring(0, 4);
      return null;
    }).filter(Boolean) as string[];
    const baseYears = ['2026', '2027'];
    const unique = Array.from(new Set([...projYears, ...taskYears, ...baseYears])).filter(Boolean).sort();
    return unique.length > 0 ? unique : ['2026', '2027'];
  }, [projects, tasks, currentUser?.role]);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const stores = allowedStores;
  const locationOptions = useLocationOptions();

  useEffect(() => {
    if (locationOptions.length > 0 && globalLocationFilter.length > 0) {
      const valid = globalLocationFilter.filter(loc => locationOptions.includes(loc));
      if (valid.length !== globalLocationFilter.length) {
        setGlobalLocationFilter(valid);
      }
    }
  }, [locationOptions, globalLocationFilter, setGlobalLocationFilter]);

  const filteredProjects = useMemo(() => {
    // Pre-calculate project dates & status once (O(N)) to eliminate O(N log N) recalculations during sorting
    const infoMap = new Map<string, ReturnType<typeof getProjectDatesAndStatus>>();
    projects.forEach(p => {
      const pKey = p.id || p.code || String(p.no || '');
      infoMap.set(pKey, getProjectDatesAndStatus(p, tasks));
    });

    const getMemoizedInfo = (p: Project) => {
      const pKey = p.id || p.code || String(p.no || '');
      return infoMap.get(pKey) || getProjectDatesAndStatus(p, tasks);
    };

    return projects.filter(p => {
      const { computedTakStart, computedTakCompl, computedOpening, status } = getMemoizedInfo(p);
      const searchFields = [p.no, p.store, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party, status, p.year];
      const matchesSearch = matchesAdvancedSearch(deferredSearchTerm, searchFields);
      const pYear = p.year ? String(p.year).trim() : (computedTakStart ? String(computedTakStart).substring(0, 4) : (p.start ? String(p.start).substring(0, 4) : null));
      const matchesYear = globalYearFilter === 'all' || (pYear !== null && pYear === String(globalYearFilter).trim());
      const matchesStore = effectiveStore === 'all' || (Boolean(p.store) && String(p.store).toUpperCase().trim() === effectiveStore.toUpperCase().trim());
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));

      const matchesStatus = matchProjectStatusFilter(status, statusFilter, computedTakStart);

      return matchesSearch && matchesYear && matchesStore && matchesLocation && matchesStatus;
    }).sort((a, b) => {
      const isPinnedA = a.id && pinnedProjects.includes(a.id);
      const isPinnedB = b.id && pinnedProjects.includes(b.id);
      
      if (isPinnedA !== isPinnedB) {
        return isPinnedA ? -1 : 1;
      }
      if (isPinnedA && isPinnedB) {
        const orderA = pinnedProjects.indexOf(a.id as string);
        const orderB = pinnedProjects.indexOf(b.id as string);
        if (orderA !== orderB) return orderA - orderB;
      }

      const infoA = getMemoizedInfo(a);
      const infoB = getMemoizedInfo(b);

      if (sortConfig) {
        let valA = '';
        let valB = '';
        if (sortConfig.key === 'start') {
          valA = infoA.computedTakStart || '9999-12-31';
          valB = infoB.computedTakStart || '9999-12-31';
        } else if (sortConfig.key === 'handover') {
          valA = infoA.computedTakCompl || '9999-12-31';
          valB = infoB.computedTakCompl || '9999-12-31';
        } else if (sortConfig.key === 'opening') {
          valA = infoA.computedOpening || a.opening || '9999-12-31';
          valB = infoB.computedOpening || b.opening || '9999-12-31';
        }
        
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      }

      const statusA = infoA.status;
      const statusB = infoB.status;
      
      const weightA = statusWeight[statusA] || 99;
      const weightB = statusWeight[statusB] || 99;
      if (weightA !== weightB) {
        return weightA - weightB;
      }

      // Special sorting for 'On process' : prioritize finish date proximity to today
      if (statusA === 'On process') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const finishA = parseDateTime(a.computedTakCompl || a.handover || a.computedOpening || a.opening);
        const finishB = parseDateTime(b.computedTakCompl || b.handover || b.computedOpening || b.opening);
        
        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) {
            return diffA - diffB;
          }
        } else if (finishA) {
          return -1;
        } else if (finishB) {
          return 1;
        }
      }

      const startA = a.computedTakStart || '9999-12-31';
      const startB = b.computedTakStart || '9999-12-31';
      if (startA !== startB) {
        return startA.localeCompare(startB);
      }

      const complA = a.computedTakCompl || '9999-12-31';
      const complB = b.computedTakCompl || '9999-12-31';
      if (complA !== complB) {
        return complA.localeCompare(complB);
      }

      const openA = a.computedOpening || a.opening || '9999-12-31';
      const openB = b.computedOpening || b.opening || '9999-12-31';
      if (openA !== openB) {
        return openA.localeCompare(openB);
      }
      
      return a.code.localeCompare(b.code) || String(a.year || '').localeCompare(String(b.year || ''));
    });
  }, [projects, tasks, deferredSearchTerm, globalYearFilter, effectiveStore, globalLocationFilter, statusFilter, pinnedProjects, sortConfig]);

  useEffect(() => {
    const interval = setInterval(() => setFlashToggle(prev => !prev), 600);
    return () => clearInterval(interval);
  }, []);

  const paginatedProjects = useMemo(() => {
    return filteredProjects.slice(0, visibleCount);
  }, [filteredProjects, visibleCount]);

  return {
    globalYearFilter,
    setGlobalYearFilter,
    globalStoreFilter,
    setGlobalStoreFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    pinnedProjects,
    setPinnedProjects,
    theme,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    flashToggle,
    sortConfig,
    setSortConfig,
    visibleCount,
    setVisibleCount,
    years,
    stores,
    locationOptions,
    filteredProjects,
    paginatedProjects
  };
}
