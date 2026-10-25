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
  computeAvailableLayoutYears,
  computeAvailableLayoutLocations
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
  const role = (
    currentUser?.role === 'admin'
      ? 'admin'
      : (currentUser?.role as string)?.toUpperCase() === 'CP'
      ? 'CP'
      : (currentUser?.role as string)?.toLowerCase() === 'manager'
      ? 'Manager'
      : (currentUser?.role as string)?.toLowerCase() === 'staff'
      ? 'Staff'
      : (currentUser?.role as string)?.toLowerCase() === 'external'
      ? 'External'
      : currentUser?.role || 'viewer'
  ) as AppRole;
  const isPartyRestricted = !isAdmin && currentUser?.byPartyAccess === true && currentUser?.partyPermissions?.['all'] !== true;
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

  // Track whether filter changes came from initial deep-link/notification props
  const isSyncingInitialPropsRef = useRef(false);

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
    isSyncingInitialPropsRef.current = true;

    const normalizedStoreParam =
      activeStoreParam && activeStoreParam !== 'all'
        ? activeStoreParam.toUpperCase().trim()
        : '';

    if (normalizedStoreParam && allowedStores.includes(normalizedStoreParam)) {
      setGlobalStoreFilter(normalizedStoreParam);
    }

    const unitInfo = useDataStore.getState().unitInfo || [];
    const targetLoc = resolveInitialTargetLocation(
      activeLocParam,
      activeCodeParam,
      projects,
      tasks,
      allStoreVersions,
      unitInfo,
      (normalizedStoreParam && allowedStores.includes(normalizedStoreParam)) ? normalizedStoreParam : activeStore
    );

    if (targetLoc && targetLoc.toLowerCase() !== 'all') {
      setIsLiveMapMode(true);
      setGlobalLocationFilter([targetLoc.toUpperCase().trim()]);
    } else if (activeLocParam && activeLocParam !== 'all' && activeLocParam !== 'ALL') {
      setIsLiveMapMode(true);
      setGlobalLocationFilter([activeLocParam.toUpperCase().trim()]);
    }

    if (activeCodeParam) {
      setProjectCodeFilter(activeCodeParam);
      setUnitSearchInput(activeCodeParam);
      setTargetUnitSearch(activeCodeParam);
      setIsLiveMapMode(true);
    }
  }, [propInitialStore, propInitialLocation, propInitialProjectCode, layoutTabFilters, projects, tasks, allStoreVersions, activeStore, allowedStores, setGlobalStoreFilter, setGlobalLocationFilter]);

  // Available years: based on user permissions, projects, tasks, and store versions
  const prevAvailableYearsRef = useRef<string[]>([]);
  const prevAvailableYearsKeyRef = useRef<string>('');

  const availableYears = useMemo(() => {
    const finalYears = computeAvailableLayoutYears({
      projects,
      tasks,
      allStoreVersions,
      activeStore,
      isAdmin,
      isPartyRestricted,
      role,
    });
    const key = finalYears.join('|');
    if (key === prevAvailableYearsKeyRef.current) {
      return prevAvailableYearsRef.current;
    }
    prevAvailableYearsKeyRef.current = key;
    prevAvailableYearsRef.current = finalYears;
    return finalYears;
  }, [allStoreVersions, projects, tasks, activeStore, isAdmin, isPartyRestricted, role]);

  const effectiveYear = useMemo(() => {
    if (globalYearFilter && globalYearFilter !== 'all' && availableYears.includes(globalYearFilter)) {
      return globalYearFilter;
    }
    const currentCalendarYear = String(new Date().getFullYear());
    if (availableYears.includes(currentCalendarYear)) {
      return currentCalendarYear;
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
    const sorted = computeAvailableLayoutLocations({
      allStoreVersions,
      storeLocationData,
      activeStore,
      currentUser,
      locationVisibility,
      locations,
      isPartyRestricted,
      role,
      projects,
      tasks,
      effectiveYear,
    });
    const key = sorted.join('|');
    if (key === prevAvailableLocationsKeyRef.current) {
      return prevAvailableLocationsRef.current;
    }
    prevAvailableLocationsKeyRef.current = key;
    prevAvailableLocationsRef.current = sorted;
    return sorted;
  }, [allStoreVersions, storeLocationData, activeStore, currentUser, locationVisibility, locations, isPartyRestricted, role, projects, tasks, effectiveYear]);

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
  } = useLayoutTabSettings({ activeStore, locFilterStr, canWrite });

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
    return buildUnitSuggestions(storeUnits, projects, activeStore, availableLocations, isAdmin, isPartyRestricted);
  }, [getAllStoreUnits, activeStore, projects, availableLocations, isAdmin, isPartyRestricted, showSuggestions, unitSearchInput]);

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

  // When activeStore, locFilterStr, or effectiveYear changes manually, reset search & focus states to default
  const prevFilterStateRef = useRef({ store: activeStore, loc: locFilterStr, yr: effectiveYear });
  useEffect(() => {
    const prev = prevFilterStateRef.current;
    if (prev.store !== activeStore || prev.loc !== locFilterStr || prev.yr !== effectiveYear) {
      prevFilterStateRef.current = { store: activeStore, loc: locFilterStr, yr: effectiveYear };
      if (isSyncingInitialPropsRef.current) {
        isSyncingInitialPropsRef.current = false;
        return;
      }
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
    cacheBuster, setCacheBuster,
  };
}
