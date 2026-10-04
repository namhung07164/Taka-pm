import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, APP_ID } from "../../lib/firebase";
import { AppRole } from '../../types';
import { getUserAllowedStores, getEffectiveStoreFilter } from '../../lib/utils';
import { usePerformanceStore } from '../../store/usePerformanceStore';
import { executeTriggerExportProcess } from '../PictureMapping/lib/dynamicExportService';
import { useDataStore } from '../PictureMapping/DataContext';
import { 
  isValidUrl, 
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

  const [layoutSettings, setLayoutSettings] = useState<Record<string, any>>({});
  const [url, setUrl] = useState<string>('https://drive.google.com/file/d/1hxzPKKhQWhQ-tAThmgan8eNqqy5GN-Ds/preview');

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

  // All versions for activeStore (synced with PictureMapping / ReviewTab)
  const allStoreVersions = useMemo(() => {
    try {
      return getAllStoreVersions((activeStore === 'HN' ? 'HN' : 'HCM'));
    } catch {
      return [];
    }
  }, [getAllStoreVersions, activeStore, storeLocationData, mapVersions]);

  // Initial params sync effect
  useEffect(() => {
    if (initialStore && initialStore !== 'all') {
      setGlobalStoreFilter(initialStore);
    }
    
    if (initialLocation && initialLocation !== 'all') {
      setIsLiveMapMode(true);
    }
    
    if (initialProjectCode) {
      setProjectCodeFilter(initialProjectCode);
      setUnitSearchInput(initialProjectCode);
      setTargetUnitSearch(initialProjectCode);
      setIsLiveMapMode(true);
    }

    const unitInfo = useDataStore.getState().unitInfo || [];
    const targetLoc = resolveInitialTargetLocation(
      initialLocation, 
      initialProjectCode, 
      projects, 
      tasks, 
      allStoreVersions, 
      unitInfo
    );

    if (targetLoc && targetLoc.toLowerCase() !== 'all') {
      setGlobalLocationFilter([targetLoc]);
    }
  }, [initialStore, initialLocation, initialProjectCode, projects, tasks, allStoreVersions, setGlobalStoreFilter, setGlobalLocationFilter]);

  // Available years: based on user permissions, projects, tasks, and store versions
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

    return Array.from(new Set([...userPermittedYears, ...versionYears, ...defaultStoreYears]))
      .filter(Boolean)
      .sort((a, b) => Number(b) - Number(a));
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

  // Danh sách location của Tab Layout
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

    return sortLocationsByFloorRank(finalLocations);
  }, [allStoreVersions, storeLocationData, activeStore, currentUser, locationVisibility, locations]);

  // Ensure globalLocationFilter is never 'all' or empty in Layout tab
  useEffect(() => {
    if (availableLocations.length > 0) {
      const currentLoc = (globalLocationFilter[0] || '').toUpperCase().trim();
      const matched = availableLocations.find(l => l.toUpperCase().trim() === currentLoc);
      if (matched) {
        if (globalLocationFilter[0] !== matched) {
          setGlobalLocationFilter([matched]);
        }
      } else {
        setGlobalLocationFilter([availableLocations[0]]);
      }
    }
  }, [availableLocations, globalLocationFilter, setGlobalLocationFilter]);

  const locFilterStr = useMemo(() => {
    const currentLoc = (globalLocationFilter[0] || '').toUpperCase().trim();
    if (currentLoc && currentLoc !== 'ALL') {
      const matched = availableLocations.find(l => l.toUpperCase().trim() === currentLoc);
      if (matched) return matched;
      return currentLoc;
    }
    return availableLocations[0] || '';
  }, [globalLocationFilter, availableLocations]);
  const docKey = `url_${activeStore}_${locFilterStr}`;

  // Automatically sync activeStore and floor partition to useDataStore
  useEffect(() => {
    if (!locFilterStr || locFilterStr.trim() === '' || locFilterStr.toUpperCase() === 'ALL') {
      return;
    }
    const targetStore = (activeStore === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const currStore = useDataStore.getState().store;
    const currLocation = useDataStore.getState().location;

    if (currStore !== targetStore || currLocation !== locFilterStr) {
      useDataStore.getState().setStoreAndLocation(targetStore, locFilterStr);
    }
  }, [activeStore, locFilterStr]);

  const [isEditing, setIsEditing] = useState(false);
  const [isLiveMapMode, setIsLiveMapMode] = useState(true);
  const [editUrl, setEditUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
  const [isFullscreenView, setIsFullscreenView] = useState(false);

  // Search Unit functionality next to Trigger Export
  const [unitSearchInput, setUnitSearchInput] = useState('');
  const [targetUnitSearch, setTargetUnitSearch] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const getAllStoreUnits = useDataStore((state) => state.getAllStoreUnits);

  // Aggregate all known units in active store for rapid autocomplete suggestions
  const unitSuggestions = useMemo(() => {
    const storeUnits: any[] = typeof getAllStoreUnits === 'function' ? (getAllStoreUnits as any)(activeStore) || [] : [];
    return buildUnitSuggestions(storeUnits, projects, activeStore, availableLocations, isAdmin);
  }, [getAllStoreUnits, activeStore, projects, availableLocations, isAdmin]);

  const filteredUnitSuggestions = useMemo(() => {
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

  // Listen to layout settings & triggers from Firestore
  useEffect(() => {
    usePerformanceStore.getState().registerListener('taka_settings/layout');
    usePerformanceStore.getState().registerListener('taka_settings/layout_trigger');

    const unsubLayout = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLayoutSettings(data);
      }
    }, (error) => {
      console.error("Error listening to layout settings", error);
    });

    const unsubTrigger = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout_trigger'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout_trigger', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.is_ready_to_export === false) {
          setIsExporting(false);
          if (data.export_completed_at) {
            setCacheBuster(data.export_completed_at);
          }
        } else if (data.is_ready_to_export === true) {
          if (data.requested_at && Date.now() - data.requested_at < 15000) {
            setIsExporting(true);
          } else {
            setIsExporting(false);
          }
        }
      }
    }, (error) => {
      console.error("Error listening to layout_trigger", error);
    });

    return () => {
      unsubLayout();
      unsubTrigger();
      usePerformanceStore.getState().unregisterListener('taka_settings/layout');
      usePerformanceStore.getState().unregisterListener('taka_settings/layout_trigger');
    };
  }, []);

  // Synchronize URL when docKey, layoutSettings, or activeStore changes
  useEffect(() => {
    if (layoutSettings[docKey] && isValidUrl(layoutSettings[docKey])) {
      setUrl(layoutSettings[docKey]);
    } else if (layoutSettings[`url_${activeStore}`] && isValidUrl(layoutSettings[`url_${activeStore}`])) {
      setUrl(layoutSettings[`url_${activeStore}`]);
    } else {
      setUrl('');
    }
  }, [docKey, layoutSettings, activeStore]);

  const [exportStatusMessage, setExportStatusMessage] = useState<string>('');

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isExporting) {
      timeoutId = setTimeout(() => {
        setIsExporting(false);
        setExportStatusMessage('');
      }, 30000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isExporting]);

  const handleSave = async () => {
    try {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout');
      const updates: Record<string, any> = { [docKey]: editUrl };
      setDoc(docRef, updates, { merge: true });
      setUrl(editUrl);
      setIsEditing(false);
    } catch (error) {
      console.error("Error saving layout URL", error);
    }
  };

  const handleTriggerReExport = async () => {
    if (isExporting) return;
    try {
      setIsExporting(true);
      setExportStatusMessage('Bước 1/4: Đang tải dữ liệu từ Cloudflare R2...');
      const targetStore = (activeStore === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      
      const res = await executeTriggerExportProcess(targetStore, (status) => {
        setExportStatusMessage(status);
      });

      setCacheBuster(Date.now());
      setIsExporting(false);
      setExportStatusMessage('');
      alert(`✅ ${res.message}`);
    } catch (error: any) {
      console.error("Error triggering layout export", error);
      setIsExporting(false);
      setExportStatusMessage('');
      alert(`⚠️ Lỗi khi Trigger Export:\n${error?.message || error}`);
    }
  };

  const getCleanUrl = useCallback((inputUrl: string | undefined | null) => {
    if (!inputUrl) return undefined;
    let cleanUrl = inputUrl;
    if (cleanUrl.includes('/view')) {
      cleanUrl = cleanUrl.replace('/view', '/preview');
    }
    if (cleanUrl) {
      const separator = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${separator}t=${cacheBuster}`;
    }
    return undefined;
  }, [cacheBuster]);

  const fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';

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
