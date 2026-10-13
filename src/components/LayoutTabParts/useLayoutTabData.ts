import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { AppRole } from '../../types';
import { getUserAllowedStores, getEffectiveStoreFilter } from '../../lib/utils';
import { useDataStore } from '../PictureMapping/DataContext';
import { useLayoutTabSettings } from './useLayoutTabSettings';
import { 
  buildUnitSuggestions, 
  scoreAndFilterUnitSuggestions, 
  resolveTargetFloorForUnit, 
  resolveInitialTargetLocation,
  sortLocationsByFloorRank
} from './layoutTabSearchUtils';

export interface UseLayoutTabDataProps {
  propInitialStore?: string;
  propInitialLocation?: string;
  propInitialProjectCode?: string;
  onClearFocus?: () => void;
}

export function useLayoutTabData({
  propInitialStore,
  propInitialLocation,
  propInitialProjectCode,
  onClearFocus,
}: UseLayoutTabDataProps) {
  const layoutTabFilters = useAppStore(state => state.layoutTabFilters);
  const initialStore = propInitialStore !== undefined ? propInitialStore : (layoutTabFilters?.store || 'all');
  const initialLocation = propInitialLocation !== undefined ? propInitialLocation : (layoutTabFilters?.location || 'all');
  const initialProjectCode = propInitialProjectCode !== undefined ? propInitialProjectCode : (layoutTabFilters?.projectCode || '');

  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const locationVisibility = useAppStore(state => state.locationVisibility);

  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);

  const [projectCodeFilter, setProjectCodeFilter] = useState(initialProjectCode);
  
  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout) && !isArchiveYear;

  const allowedStores = useMemo(() => {
    return getUserAllowedStores(currentUser);
  }, [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const activeStore = effectiveStore === 'all' ? (allowedStores[0] || '') : (allowedStores.includes(effectiveStore) ? effectiveStore : (allowedStores[0] || ''));

  const getAllStoreVersions = useDataStore((state) => state.getAllStoreVersions);
  const storeLocationData = useDataStore((state) => state.storeLocationData);
  const mapVersions = useDataStore((state) => state.mapVersions);

  // Stable memoized versions for activeStore to prevent reference churn across partition updates
  const prevStoreVersionsRef = useRef<any[]>([]);
  const prevStoreVersionsKeyRef = useRef<string>('');

  const allStoreVersions = useMemo(() => {
    try {
      const vers = getAllStoreVersions((activeStore === 'HN' ? 'HN' : 'HCM'));
      if (!Array.isArray(vers)) return [];
      const sig = `${activeStore}_${vers.map(v => `${v?.id || ''}_${v?.backgroundUrl || ''}`).join('|')}`;
      if (sig === prevStoreVersionsKeyRef.current) {
        return prevStoreVersionsRef.current;
      }
      prevStoreVersionsKeyRef.current = sig;
      prevStoreVersionsRef.current = vers;
      return vers;
    } catch {
      return [];
    }
  }, [getAllStoreVersions, activeStore, storeLocationData, mapVersions]);

  // Initial params sync effect - runs on mount or when props / layoutTabFilters change!
  const hasSyncedInitialRef = useRef(false);
  const lastInitialPropKeyRef = useRef('');

  useEffect(() => {
    const activeStoreParam = propInitialStore !== undefined ? propInitialStore : (layoutTabFilters?.store || '');
    const activeLocParam = propInitialLocation !== undefined ? propInitialLocation : (layoutTabFilters?.location || '');
    const activeCodeParam = propInitialProjectCode !== undefined ? propInitialProjectCode : (layoutTabFilters?.projectCode || '');
    const filterTs = (layoutTabFilters as any)?._ts || '';

    const propKey = `${activeStoreParam}_${activeLocParam}_${activeCodeParam}_${filterTs}`;
    if (hasSyncedInitialRef.current && propKey === lastInitialPropKeyRef.current) {
      return;
    }
    hasSyncedInitialRef.current = true;
    lastInitialPropKeyRef.current = propKey;

    if (activeStoreParam && activeStoreParam !== 'all') {
      setGlobalStoreFilter(activeStoreParam);
    }
    
    if (activeLocParam && activeLocParam !== 'all' && activeLocParam !== 'ALL') {
      setIsLiveMapMode(true);
      setGlobalLocationFilter([activeLocParam.toUpperCase().trim()]);
    }
    
    if (activeCodeParam) {
      setProjectCodeFilter(activeCodeParam);
      setUnitSearchInput(activeCodeParam);
      setTargetUnitSearch(activeCodeParam);
      setIsLiveMapMode(true);
    }

    const unitInfo = useDataStore.getState().unitInfo || [];
    const targetLoc = resolveInitialTargetLocation(
      activeLocParam, 
      activeCodeParam, 
      projects, 
      tasks, 
      allStoreVersions, 
      unitInfo
    );

    if (targetLoc && targetLoc.toLowerCase() !== 'all') {
      setGlobalLocationFilter([targetLoc]);
    }
  }, [propInitialStore, propInitialLocation, propInitialProjectCode, layoutTabFilters, projects, tasks, allStoreVersions, setGlobalStoreFilter, setGlobalLocationFilter]);

  // Available years: based on user permissions, projects, tasks, and store versions
  const prevAvailableYearsRef = useRef<string[]>([]);
  const prevAvailableYearsKeyRef = useRef<string>('');

  const availableYears = useMemo(() => {
    const storeProjects = projects.filter(p => {
      if (!activeStore || activeStore === 'all') return true;
      const pStore = String(p.store || 'HCM').toUpperCase().trim();
      return pStore === activeStore;
    });

    const projectYearsSet = new Set<string>();
    storeProjects.forEach(p => {
      const y = String(p.year || (p.start ? String(p.start).substring(0, 4) : '')).trim();
      if (y && y.toLowerCase() !== 'all' && /^\d{4}$/.test(y)) {
        projectYearsSet.add(y);
      }
    });

    const storeTasks = tasks.filter(t => {
      if (!activeStore || activeStore === 'all') return true;
      const tStore = String(t.projectStore || 'HCM').toUpperCase().trim();
      return tStore === activeStore;
    });
    const taskYearsSet = new Set<string>();
    storeTasks.forEach(t => {
      const y = String(t.projectYear || (t.start ? String(t.start).substring(0, 4) : '')).trim();
      if (y && y.toLowerCase() !== 'all' && /^\d{4}$/.test(y)) {
        taskYearsSet.add(y);
      }
    });

    const userPermittedYears = new Set([...projectYearsSet, ...taskYearsSet]);

    const versionYears = Array.from(
      new Set(
        allStoreVersions
          .filter(v => {
            if (!activeStore || activeStore === 'all') return true;
            const vStore = String(v.store || (activeStore === 'HN' ? 'HN' : 'HCM')).toUpperCase().trim();
            return vStore === activeStore;
          })
          .map(v => (v.year ? String(v.year).trim() : ''))
          .filter(y => y && y.toLowerCase() !== 'all' && /^\d{4}$/.test(y))
      )
    );

    const defaultStoreYears = activeStore === 'HN' ? ['2027'] : ['2026', '2027'];

    const finalYears = Array.from(new Set([...userPermittedYears, ...versionYears, ...defaultStoreYears]))
      .filter(Boolean)
      .sort((a, b) => Number(b) - Number(a));

    const key = finalYears.join('|');
    if (key === prevAvailableYearsKeyRef.current) {
      return prevAvailableYearsRef.current;
    }
    prevAvailableYearsKeyRef.current = key;
    prevAvailableYearsRef.current = finalYears;
    return finalYears;
  }, [allStoreVersions, projects, tasks, activeStore]);

  const effectiveYear = useMemo(() => {
    if (globalYearFilter && globalYearFilter !== 'all' && availableYears.includes(globalYearFilter)) {
      return globalYearFilter;
    }
    return availableYears[0] || '';
  }, [globalYearFilter, availableYears]);

  // Layout tab requires specific year selection (no 'all' option allowed)
  useEffect(() => {
    if (availableYears.length > 0 && (!globalYearFilter || globalYearFilter === 'all' || !availableYears.includes(globalYearFilter))) {
      setGlobalYearFilter(effectiveYear);
    }
  }, [globalYearFilter, availableYears, effectiveYear, setGlobalYearFilter]);

  // Layout tab only supports store-specific floor plans (HCM, HN), hide all-stores
  useEffect(() => {
    if (allowedStores.length > 0 && (!globalStoreFilter || globalStoreFilter === 'all' || !allowedStores.includes(globalStoreFilter))) {
      setGlobalStoreFilter(allowedStores[0]);
    }
  }, [globalStoreFilter, allowedStores, setGlobalStoreFilter]);

  // Danh sách location của Tab Layout (Cached to prevent array reference churn)
  const prevAvailableLocationsRef = useRef<string[]>([]);
  const prevAvailableLocationsKeyRef = useRef<string>('');

  const availableLocations = useMemo(() => {
    const storeParam = (activeStore === 'HN' ? 'HN' : 'HCM');
    const isUserAdmin = currentUser?.role === 'admin';
    const locPerms = currentUser?.locationPermissions || {};
    const hasAll = isUserAdmin || locPerms['all'] === true;

    const isFloorName = (name: string) => {
      if (!name) return false;
      const n = name.toUpperCase().trim();
      const nonFloors = ['BUDGET', 'COST', 'ALL', 'SUMMARY', 'GENERAL', 'SETTING'];
      if (nonFloors.includes(n)) return false;
      return true;
    };

    const isPermitted = (loc: string) => {
      if (!loc || !isFloorName(loc)) return false;
      if (locationVisibility[loc] === false) return false;
      if (hasAll) return true;
      const lLower = loc.toLowerCase().trim();
      const cleanLoc = lLower.replace(/^md-/, '');
      return !!(locPerms[cleanLoc] || locPerms[`md-${cleanLoc}`] || locPerms[lLower]);
    };

    const pmLocationsSet = new Set<string>();

    allStoreVersions.forEach(v => {
      const loc = String(v.location || '').toUpperCase().trim();
      if (loc && isPermitted(loc)) {
        pmLocationsSet.add(loc);
      }
    });

    if (storeLocationData) {
      Object.entries(storeLocationData).forEach(([key, partition]) => {
        if (key.startsWith(`${storeParam}_`)) {
          const loc = key.replace(`${storeParam}_`, '').toUpperCase().trim();
          if (loc && isPermitted(loc)) {
            if (
              (partition?.mapVersions && partition.mapVersions.length > 0) ||
              (partition?.mapUnits && partition.mapUnits.length > 0) ||
              partition?.activeMapVersionId
            ) {
              pmLocationsSet.add(loc);
            }
          }
        }
      });
    }

    let finalLocations: string[] = [];
    if (pmLocationsSet.size > 0) {
      finalLocations = Array.from(pmLocationsSet);
    } else {
      finalLocations = (locations || []).map(l => String(l).toUpperCase().trim()).filter(isPermitted);
    }

    const sorted = sortLocationsByFloorRank(finalLocations);
    const key = sorted.join('|');
    if (key === prevAvailableLocationsKeyRef.current) {
      return prevAvailableLocationsRef.current;
    }
    prevAvailableLocationsKeyRef.current = key;
    prevAvailableLocationsRef.current = sorted;
    return sorted;
  }, [allStoreVersions, storeLocationData, activeStore, currentUser, locationVisibility, locations]);

  // Ensure globalLocationFilter is never 'all' or empty in Layout tab
  useEffect(() => {
    if (availableLocations.length > 0) {
      const currentLoc = (globalLocationFilter[0] || '').toUpperCase().trim();
      if (!currentLoc || currentLoc === 'ALL') {
        const initialTargetLoc = resolveInitialTargetLocation(
          propInitialLocation || layoutTabFilters?.location || '', 
          propInitialProjectCode || layoutTabFilters?.projectCode || '', 
          projects, 
          tasks, 
          allStoreVersions, 
          useDataStore.getState().unitInfo || []
        );
        if (initialTargetLoc && availableLocations.includes(initialTargetLoc)) {
          setGlobalLocationFilter([initialTargetLoc]);
          return;
        }
      }
      const matched = availableLocations.find(l => l.toUpperCase().trim() === currentLoc);
      if (matched) {
        if (globalLocationFilter[0] !== matched) {
          setGlobalLocationFilter([matched]);
        }
      } else {
        const initialTargetLoc = resolveInitialTargetLocation(
          propInitialLocation || layoutTabFilters?.location || '', 
          propInitialProjectCode || layoutTabFilters?.projectCode || '', 
          projects, 
          tasks, 
          allStoreVersions, 
          useDataStore.getState().unitInfo || []
        );
        if (initialTargetLoc && availableLocations.includes(initialTargetLoc)) {
          setGlobalLocationFilter([initialTargetLoc]);
        } else {
          setGlobalLocationFilter([availableLocations[0]]);
        }
      }
    }
  }, [availableLocations, globalLocationFilter, setGlobalLocationFilter, propInitialLocation, propInitialProjectCode, layoutTabFilters, projects, tasks, allStoreVersions]);

  const locFilterStr = useMemo(() => {
    const currentLoc = (globalLocationFilter[0] || '').toUpperCase().trim();
    if (currentLoc && currentLoc !== 'ALL') {
      const matched = availableLocations.find(l => l.toUpperCase().trim() === currentLoc);
      if (matched) return matched;
      return currentLoc;
    }
    return availableLocations[0] || '';
  }, [globalLocationFilter, availableLocations]);
  const [isLiveMapMode, setIsLiveMapMode] = useState(true);
  const [isFullscreenView, setIsFullscreenView] = useState(false);

  // Settings, URL persistence, and export triggers
  const {
    url,
    isEditing,
    setIsEditing,
    editUrl,
    setEditUrl,
    handleSave,
    isExporting,
    exportStatusMessage,
    handleTriggerReExport,
    getCleanUrl,
    fallbackSvg,
    cacheBuster,
    setCacheBuster,
  } = useLayoutTabSettings({ activeStore, locFilterStr });

  // Search Unit functionality next to Trigger Export
  const [unitSearchInput, setUnitSearchInput] = useState('');
  const [targetUnitSearch, setTargetUnitSearch] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const getAllStoreUnits = useDataStore((state) => state.getAllStoreUnits);

  // Lazy autocomplete suggestions: ONLY compute when user opens or types into search box
  const unitSuggestions = useMemo(() => {
    if (!showSuggestions && !unitSearchInput.trim()) {
      return [];
    }
    const storeUnits: any[] = typeof getAllStoreUnits === 'function' ? (getAllStoreUnits as any)(activeStore) || [] : [];
    return buildUnitSuggestions(storeUnits, projects, activeStore, availableLocations, isAdmin);
  }, [getAllStoreUnits, activeStore, projects, availableLocations, isAdmin, showSuggestions, unitSearchInput]);

  const filteredUnitSuggestions = useMemo(() => {
    if (!unitSearchInput.trim()) return [];
    const currentLoc = globalLocationFilter[0] || '';
    return scoreAndFilterUnitSuggestions(unitSuggestions, unitSearchInput, currentLoc);
  }, [unitSuggestions, unitSearchInput, globalLocationFilter]);

  const handleSelectSearchUnit = useCallback((unitItem: { unit: string; location?: string; brand?: string; project?: string; code?: string }) => {
    setUnitSearchInput(unitItem.unit);
    setShowSuggestions(false);

    if (!isLiveMapMode) {
      setIsLiveMapMode(true);
    }

    const targetFloor = resolveTargetFloorForUnit(unitItem, projects);
    if (targetFloor && targetFloor.toLowerCase() !== 'all') {
      setGlobalLocationFilter([targetFloor]);
    }

    setTargetUnitSearch(unitItem.unit);
  }, [isLiveMapMode, projects, setGlobalLocationFilter]);

  const handleClearSearchAndFocus = useCallback(() => {
    setUnitSearchInput('');
    setTargetUnitSearch(null);
    setShowSuggestions(false);
    onClearFocus?.();
  }, [onClearFocus]);

  // Close suggestions on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // When activeStore, locFilterStr, or effectiveYear changes, reset search & focus states to default
  const prevFilterStateRef = useRef({ store: activeStore, loc: locFilterStr, yr: effectiveYear });
  useEffect(() => {
    const prev = prevFilterStateRef.current;
    if (prev.store !== activeStore || prev.loc !== locFilterStr || prev.yr !== effectiveYear) {
      prevFilterStateRef.current = { store: activeStore, loc: locFilterStr, yr: effectiveYear };
      setUnitSearchInput('');
      setTargetUnitSearch(null);
      setShowSuggestions(false);
      onClearFocus?.();
    }
  }, [activeStore, locFilterStr, effectiveYear, onClearFocus]);

  return {
    allowedStores, activeStore, setGlobalStoreFilter,
    globalLocationFilter, setGlobalLocationFilter,
    availableLocations, locFilterStr,
    availableYears, effectiveYear, setGlobalYearFilter, globalYearFilter,
    canWrite, isAdmin, isEditing, setIsEditing, editUrl, setEditUrl, handleSave,
    isLiveMapMode, setIsLiveMapMode, url, getCleanUrl, fallbackSvg,
    isExporting, exportStatusMessage, handleTriggerReExport,
    unitSearchInput, setUnitSearchInput, targetUnitSearch, setTargetUnitSearch,
    showSuggestions, setShowSuggestions, searchContainerRef,
    filteredUnitSuggestions, handleSelectSearchUnit, handleClearSearchAndFocus,
    isFullscreenView, setIsFullscreenView,
  };
}
