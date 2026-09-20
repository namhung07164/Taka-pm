import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import {  db, APP_ID , setDoc } from "../lib/firebase";
import { Edit2, Save, ArrowLeft, Filter, Search, X, RefreshCw, ZoomIn, ZoomOut, Maximize, Maximize2, Eye, Move, HelpCircle, Clipboard, Map } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { AppUser, PermissionMatrix, AppRole, Project } from '../types';
import { getUserAllowedStores, getEffectiveStoreFilter } from '../lib/utils';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { LiveLayoutViewer } from './LiveLayoutViewer';
import { executeTriggerExportProcess } from './PictureMapping/lib/dynamicExportService';
import { useDataStore } from './PictureMapping/DataContext';

interface LayoutTabProps {
  initialStore?: string;
  initialLocation?: string;
  initialProjectCode?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
}

export function LayoutTab({ 
   
  initialStore = 'all', initialLocation = 'all', initialProjectCode = '', onClearFocus, onBackToGantt}: LayoutTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const [layoutSettings, setLayoutSettings] = useState<Record<string, any>>({});
  const [url, setUrl] = useState<string>('https://drive.google.com/file/d/1hxzPKKhQWhQ-tAThmgan8eNqqy5GN-Ds/preview');

  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);

  const [projectCodeFilter, setProjectCodeFilter] = useState(initialProjectCode);
  
  useEffect(() => {
    if (initialStore && initialStore !== 'all') {
      setGlobalStoreFilter(initialStore);
    }
    
    let targetLoc = (initialLocation && initialLocation !== 'all') ? initialLocation : '';
    
    if (initialProjectCode) {
      setProjectCodeFilter(initialProjectCode);
      setUnitSearchInput(initialProjectCode);
      setTargetUnitSearch(initialProjectCode);
      setIsLiveMapMode(true);

      if (!targetLoc) {
        const matched = projects.find(p => 
          (p.code && String(p.code).trim().toLowerCase() === String(initialProjectCode).trim().toLowerCase()) ||
          ((p as any).unit && String((p as any).unit).trim().toLowerCase() === String(initialProjectCode).trim().toLowerCase()) ||
          (p.name && String(p.name).trim().toLowerCase() === String(initialProjectCode).trim().toLowerCase())
        );
        if (matched?.location) {
          targetLoc = matched.location;
        } else {
          const m = String(initialProjectCode).match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
          if (m) targetLoc = m[1].toUpperCase();
        }
      }
    }

    if (targetLoc && targetLoc !== 'all') {
      setGlobalLocationFilter([targetLoc]);
    }
  }, [initialStore, initialLocation, initialProjectCode, projects, setGlobalStoreFilter, setGlobalLocationFilter]);

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout) && !isArchiveYear;

  const allowedStores = React.useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const activeStore = effectiveStore === 'all' ? (allowedStores[0] || 'HCM') : effectiveStore;

  const getAllStoreVersions = useDataStore((state) => state.getAllStoreVersions);
  const storeLocationData = useDataStore((state) => state.storeLocationData);
  const mapVersions = useDataStore((state) => state.mapVersions);

  // All versions for activeStore (synced with PictureMapping / ReviewTab)
  const allStoreVersions = React.useMemo(() => {
    try {
      return getAllStoreVersions((activeStore === 'HN' ? 'HN' : 'HCM'));
    } catch {
      return [];
    }
  }, [getAllStoreVersions, activeStore, storeLocationData, mapVersions]);

  // Available years: strictly based on existing versions for this store (matching Review Tab)
  const availableYears = React.useMemo(() => {
    const versionYears = Array.from(
      new Set(
        allStoreVersions
          .map(v => (v.year ? String(v.year).trim() : ''))
          .filter(y => y && y.toLowerCase() !== 'all')
      )
    ).sort((a, b) => Number(b) - Number(a));

    if (versionYears.length > 0) {
      return versionYears;
    }

    // Fallback if no version exists at all yet
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = projects.map(p => p.year ? String(p.year) : '').filter(Boolean);
    const taskYears = tasks.map(t => t.projectYear ? String(t.projectYear) : '').filter(Boolean);
    const allYrs = Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears]))
      .filter(y => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
    return allYrs;
  }, [allStoreVersions, projects, tasks]);

  const effectiveYear = React.useMemo(() => {
    if (globalYearFilter && globalYearFilter !== 'all' && availableYears.includes(globalYearFilter)) {
      return globalYearFilter;
    }
    return availableYears[0] || new Date().getFullYear().toString();
  }, [globalYearFilter, availableYears]);

  // Layout tab requires specific year selection (no 'all' option allowed)
  useEffect(() => {
    if (availableYears.length > 0 && (!globalYearFilter || globalYearFilter === 'all' || !availableYears.includes(globalYearFilter))) {
      setGlobalYearFilter(effectiveYear);
    }
  }, [globalYearFilter, availableYears, effectiveYear, setGlobalYearFilter]);

  // Layout tab only supports store-specific floor plans (HCM, HN), hide all-stores
  useEffect(() => {
    if (globalStoreFilter === 'all' && allowedStores.length > 0) {
      setGlobalStoreFilter(allowedStores[0]);
    }
  }, [globalStoreFilter, allowedStores, setGlobalStoreFilter]);

  // Helper check xem một url có hợp lệ (không phải null, undefined, '', '0', '_')
  const isValidUrl = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    if (str === '' || str === '0' || str === '_' || str.toLowerCase() === 'null') return false;
    return true;
  };

  const locationOptions = useLocationOptions();

  // Danh sách toàn bộ location mà người dùng được phân quyền (áp dụng chuẩn theo Account Control RBAC)
  const userAllowedLocations = React.useMemo(() => {
    return locationOptions.filter(loc => loc && String(loc).trim() !== '' && String(loc).toLowerCase() !== 'all');
  }, [locationOptions]);

  // Lọc danh sách location:
  // Dựa vào Review tab: Chỉ hiển thị những location (tầng) thực sự có version trong activeStore và effectiveYear
  const availableLocations = React.useMemo(() => {
    const yearVersions = allStoreVersions.filter(v => {
      const vYear = String(v.year || '').trim();
      return vYear === String(effectiveYear).trim();
    });

    const locationsWithVersions = Array.from(
      new Set(
        yearVersions
          .map(v => (v.location || '').toUpperCase().trim())
          .filter(Boolean)
      )
    );

    if (locationsWithVersions.length > 0) {
      const filtered = userAllowedLocations.filter(loc => 
        locationsWithVersions.includes(loc.toUpperCase().trim())
      );
      if (filtered.length > 0) {
        return filtered;
      }
      return locationsWithVersions;
    }

    // Fallback nếu chưa có version nào:
    if (isAdmin) {
      return userAllowedLocations;
    }
    return userAllowedLocations.filter(loc => {
      const specificKey = `url_${activeStore}_${loc}`;
      return isValidUrl(layoutSettings[specificKey]);
    });
  }, [allStoreVersions, effectiveYear, userAllowedLocations, isAdmin, layoutSettings, activeStore]);

  // Ensure globalLocationFilter is never 'all' or empty in Layout tab (must always select a specific floor)
  useEffect(() => {
    if (availableLocations.length > 0) {
      if (globalLocationFilter.length === 0 || globalLocationFilter[0] === 'all' || !availableLocations.includes(globalLocationFilter[0])) {
        setGlobalLocationFilter([availableLocations[0]]);
      }
    }
  }, [availableLocations, globalLocationFilter, setGlobalLocationFilter]);

  const locFilterStr = globalLocationFilter.length > 0 && globalLocationFilter[0] !== 'all' && availableLocations.includes(globalLocationFilter[0])
    ? globalLocationFilter[0] 
    : (availableLocations[0] || 'L1');
  const docKey = `url_${activeStore}_${locFilterStr}`;

  // Automatically sync activeStore and floor partition to useDataStore (PictureMapping / useSummaryData)
  // so switching HCM <-> HN instantly recalculates summary data without needing to visit General tab
  useEffect(() => {
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
  const [triggerState, setTriggerState] = useState<any>(null);
  const [isFullscreenView, setIsFullscreenView] = useState(false);
  const fsScaleTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Search Unit functionality next to Trigger Export
  const [unitSearchInput, setUnitSearchInput] = useState('');
  const [targetUnitSearch, setTargetUnitSearch] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);

  const getAllStoreUnits = useDataStore((state) => state.getAllStoreUnits);

  // Aggregate all known units in active store for rapid autocomplete suggestions (Unit code, Project Name, Brand Name)
  const unitSuggestions = React.useMemo(() => {
    const storeUnits: any[] = typeof getAllStoreUnits === 'function' ? (getAllStoreUnits as any)(activeStore) || [] : [];
    const map = new globalThis.Map<string, { unit: string; location?: string; brand?: string; project?: string; code?: string }>();
    const allowedLocsSet = new Set(userAllowedLocations.map(l => String(l).toLowerCase().trim()));

    // 1. Index storeUnits (only if location is accessible for this user)
    storeUnits.forEach((u: any) => {
      if (u?.name) {
        let loc = u.location || '';
        if (!loc) {
          const m = String(u.name).match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
          if (m) loc = m[1].toUpperCase();
        }
        if (isAdmin || !loc || allowedLocsSet.has(loc.toLowerCase().trim())) {
          map.set(u.name.toLowerCase().trim(), {
            unit: u.name.trim(),
            location: loc,
            brand: '',
            project: '',
            code: u.name.trim()
          });
        }
      }
    });

    // 2. Index projects (including project name, brand, code, unit, and location)
    // Note: projects comes from useEnrichedData() which already respects user's store, location, party and byPartyAccess permissions
    projects.forEach((p: any) => {
      if (!p.store || p.store === activeStore || activeStore === 'all') {
        let loc = p.location || '';
        if (!loc) {
          const m = String(p.code || p.unit || '').match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
          if (m) loc = m[1].toUpperCase();
        }
        if (isAdmin || !loc || allowedLocsSet.has(loc.toLowerCase().trim())) {
          const primaryCode = p.unit || p.code || p.name;
          if (primaryCode) {
            const key = String(primaryCode).toLowerCase().trim();
            const existing = map.get(key) || { unit: String(primaryCode).trim(), location: '', brand: '', project: '', code: '' };
            map.set(key, {
              unit: String(primaryCode).trim(),
              location: loc || existing.location || '',
              brand: p.brandName || existing.brand || '',
              project: p.name || existing.project || '',
              code: p.code || existing.code || ''
            });
          }
          // If project has both code and distinct project name, index project name as well
          if (p.name && p.code && p.name.trim().toLowerCase() !== p.code.trim().toLowerCase()) {
            const nameKey = `proj_${p.name.toLowerCase().trim()}`;
            map.set(nameKey, {
              unit: String(p.unit || p.code).trim(),
              location: loc,
              brand: p.brandName || '',
              project: p.name.trim(),
              code: p.code
            });
          }
        }
      }
    });

    return Array.from(map.values()) as Array<{ unit: string; location?: string; brand?: string; project?: string; code?: string }>;
  }, [getAllStoreUnits, activeStore, projects, userAllowedLocations, isAdmin]);

  const filteredUnitSuggestions = React.useMemo(() => {
    if (!unitSearchInput.trim()) return [];
    const q = unitSearchInput.toLowerCase().trim();
    return unitSuggestions.filter((item: { unit: string; location?: string; brand?: string; project?: string; code?: string }) => {
      const matchUnit = item.unit.toLowerCase().includes(q);
      const matchBrand = (item.brand || '').toLowerCase().includes(q);
      const matchProject = (item.project || '').toLowerCase().includes(q);
      const matchCode = (item.code || '').toLowerCase().includes(q);
      const matchLoc = (item.location || '').toLowerCase().includes(q);
      return matchUnit || matchBrand || matchProject || matchCode || matchLoc;
    });
  }, [unitSuggestions, unitSearchInput]);

  const handleSelectSearchUnit = (unitItem: { unit: string; location?: string; brand?: string; project?: string; code?: string }) => {
    setUnitSearchInput(unitItem.unit);
    setShowSuggestions(false);

    // 1. Ensure Live Map Mode is active
    if (!isLiveMapMode) {
      setIsLiveMapMode(true);
    }

    // 2. Resolve floor / location reliably
    let targetFloor = unitItem.location;
    if (!targetFloor || targetFloor.toLowerCase() === 'all') {
      const matchedP = projects.find(p => 
        ((p as any).unit && (p as any).unit.toLowerCase() === unitItem.unit.toLowerCase()) ||
        (p.code && p.code.toLowerCase() === unitItem.unit.toLowerCase()) ||
        (p.name && p.name.toLowerCase() === (unitItem.project || '').toLowerCase())
      );
      if (matchedP?.location) {
        targetFloor = matchedP.location;
      } else {
        const m = unitItem.unit.match(/^(L\d|B\d|\d+F|\d+L|GF|MF|RF)/i);
        if (m) targetFloor = m[1].toUpperCase();
      }
    }

    // 3. Switch floor automatically
    if (targetFloor && targetFloor.toLowerCase() !== 'all') {
      setGlobalLocationFilter([targetFloor]);
    }

    // 4. Zoom & Pan to target unit
    setTargetUnitSearch(unitItem.unit);
  };

  const handleClearSearchAndFocus = () => {
    setUnitSearchInput('');
    setTargetUnitSearch(null);
    setShowSuggestions(false);
    onClearFocus?.();
  };

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

  useEffect(() => {
    return () => {
      if (fsScaleTimeoutRef.current) clearTimeout(fsScaleTimeoutRef.current);
    };
  }, []);

  const lastTapRef = React.useRef(0);

  const handleDoubleTap = (e: React.MouseEvent | React.TouchEvent) => {
    // If it's a touch event with more than 1 finger, it's a pinch zoom, not a double tap.
    if ('touches' in e && e.touches.length > 1) {
      lastTapRef.current = 0; // Reset
      return;
    }

    const now = Date.now();
    const timeDiff = now - lastTapRef.current;
    
    if (timeDiff > 0 && timeDiff < 400) {
      setIsFullscreenView(true);
      lastTapRef.current = 0;
    } else {
      lastTapRef.current = now;
    }
  };

  useEffect(() => {
    usePerformanceStore.getState().registerListener('taka_settings/layout');
    usePerformanceStore.getState().registerListener('taka_settings/layout_trigger');

    // Realtime listen to layout settings
    const unsubLayout = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLayoutSettings(data);
      }
    }, (error) => {
      console.error("Error listening to layout settings", error);
    });

    // Listen to layout_trigger
    const unsubTrigger = onSnapshot(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout_trigger'), (docSnap) => {
      usePerformanceStore.getState().trackSnapshot('taka_settings/layout_trigger', docSnap);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTriggerState(data);
        if (data.is_ready_to_export === false) {
          setIsExporting(false);
          if (data.export_completed_at) {
            setCacheBuster(data.export_completed_at);
          }
        } else if (data.is_ready_to_export === true) {
          // Only show as exporting if the request was made recently (less than 15s ago)
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

  // Handle timeout for exporting state
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (isExporting) {
      timeoutId = setTimeout(() => {
        setIsExporting(false);
        setExportStatusMessage('');
      }, 30000); // 30 seconds timeout
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

  const getCleanUrl = (inputUrl: string | undefined | null) => {
    if (!inputUrl) return undefined;
    let cleanUrl = inputUrl;
    // If it's a view link, try to convert to preview so iframe works
    if (cleanUrl.includes('/view')) {
      cleanUrl = cleanUrl.replace('/view', '/preview');
    }
    // Add cache buster to iframe URL
    if (cleanUrl) {
      const separator = cleanUrl.includes('?') ? '&' : '?';
      return `${cleanUrl}${separator}t=${cacheBuster}`;
    }
    return undefined;
  };

  const fallbackSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';

  const y = useMotionValue(0);
  const bgOpacity = useTransform(y, [-300, 0, 300], [0, 1, 0]);
  const dismissScale = useTransform(y, [-300, 0, 300], [0.85, 1, 0.85]);
  const [fsScale, setFsScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);

  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const isMultiTouchRef = React.useRef(false);
  const isSwipingUpRef = React.useRef(false);
  const fsScaleRef = React.useRef(fsScale);

  useEffect(() => {
    fsScaleRef.current = fsScale;
  }, [fsScale]);

  useEffect(() => {
    if (!isFullscreenView) {
      y.set(0);
      setFsScale(1);
      touchStartRef.current = null;
      isMultiTouchRef.current = false;
      isSwipingUpRef.current = false;
    }
  }, [isFullscreenView, y]);

  useEffect(() => {
    if (!isFullscreenView && !isEditing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (isFullscreenView) {
          setIsFullscreenView(false);
        } else if (isEditing) {
          setIsEditing(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreenView, isEditing]);

  const handleFsTouchStart = (e: React.TouchEvent) => {
    // If 2 or more fingers are on screen, it is a multi-touch/pinch zoom gesture!
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      isSwipingUpRef.current = false;
      touchStartRef.current = null;
      if (y.get() !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
      return;
    }

    // Single finger touch: ONLY allow swipe-to-dismiss if not already in multi-touch sequence and scale is at normal zoom (<= 1.05)
    if (isMultiTouchRef.current || fsScaleRef.current > 1.05) {
      touchStartRef.current = null;
      isSwipingUpRef.current = false;
      return;
    }

    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    };
    isSwipingUpRef.current = false;
  };

  const handleFsTouchMove = (e: React.TouchEvent) => {
    // If a second finger touches the screen at any point, abort swipe immediately!
    if (e.touches.length > 1) {
      isMultiTouchRef.current = true;
      isSwipingUpRef.current = false;
      touchStartRef.current = null;
      if (y.get() !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
      return;
    }

    if (isMultiTouchRef.current || !touchStartRef.current || fsScaleRef.current > 1.05) {
      return;
    }

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;

    // We only track upward gestures (deltaY < 0)
    if (deltaY < -10) {
      if (Math.abs(deltaY) > Math.abs(deltaX) * 1.2 || isSwipingUpRef.current) {
        isSwipingUpRef.current = true;
        y.set(deltaY);
      }
    } else if (isSwipingUpRef.current) {
      // Pulling back down towards 0
      y.set(Math.min(0, deltaY));
    }
  };

  const handleFsTouchEnd = (e: React.TouchEvent) => {
    // Only evaluate and reset when all fingers have lifted
    if (e.touches.length === 0) {
      const wasSwiping = isSwipingUpRef.current;
      const startData = touchStartRef.current;
      const currentY = y.get();

      touchStartRef.current = null;
      isMultiTouchRef.current = false;
      isSwipingUpRef.current = false;

      if (wasSwiping && startData && fsScaleRef.current <= 1.05) {
        const duration = Math.max(1, Date.now() - startData.time);
        const velocity = Math.abs(currentY) / duration;

        // Dismiss if swiped up > 70px or flicked up with velocity > 0.35 px/ms
        if (currentY < -70 || (currentY < -30 && velocity > 0.35)) {
          animate(y, -window.innerHeight, { duration: 0.22, ease: "easeOut" }).then(() => {
            setIsFullscreenView(false);
            y.set(0);
          });
          return;
        }
      }

      if (currentY !== 0) {
        animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
      }
    }
  };

  const handleFsTouchCancel = () => {
    touchStartRef.current = null;
    isMultiTouchRef.current = false;
    isSwipingUpRef.current = false;
    if (y.get() !== 0) {
      animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
    }
  };

  return (
    <>
      <AnimatePresence>
        {isFullscreenView && (
          <motion.div 
            className="fixed inset-0 z-[100] flex flex-col overscroll-none touch-none select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onTouchStart={handleFsTouchStart}
            onTouchMove={handleFsTouchMove}
            onTouchEnd={handleFsTouchEnd}
            onTouchCancel={handleFsTouchCancel}
          >
            <motion.div className="absolute inset-0 bg-black" style={{ opacity: bgOpacity }} />
            <div className="absolute top-0 right-0 p-4 z-50">
              <button 
                onClick={() => setIsFullscreenView(false)} 
                className="p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/80 rounded-full backdrop-blur-md transition-colors shadow-lg"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="absolute bottom-6 w-full flex justify-center items-center pointer-events-none z-50 px-4">
              <span className="bg-black/60 text-white/90 px-4 py-2 rounded-full text-xs md:text-sm backdrop-blur-md shadow-lg border border-white/10 flex items-center gap-2">
                <span>Vuốt lên để đóng</span>
                <span className="text-white/40">•</span>
                <span>2 ngón tay hoặc chạm đúp để phóng to/thu nhỏ</span>
              </span>
            </div>
            
            <motion.div
              className="w-full h-full flex items-center justify-center"
              style={{ y, scale: dismissScale }}
            >
              <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={8}
                centerOnInit={true}
                wheel={{ step: 0.1 }}
                pinch={{ step: 5 }}
                panning={{ disabled: false, velocityDisabled: false }}
                doubleClick={{
                  mode: "toggle",
                  step: 2.5
                }}
                onPinchStart={() => {
                  setIsPinching(true);
                  isMultiTouchRef.current = true;
                  isSwipingUpRef.current = false;
                  touchStartRef.current = null;
                  if (y.get() !== 0) {
                    animate(y, 0, { type: "spring", stiffness: 400, damping: 30 });
                  }
                }}
                onPinchStop={() => setIsPinching(false)}
                onTransform={(ref) => {
                  if (fsScaleTimeoutRef.current) clearTimeout(fsScaleTimeoutRef.current);
                  fsScaleTimeoutRef.current = setTimeout(() => {
                    setFsScale(ref.state.scale);
                  }, 120);
                }}
              >
                {({ zoomIn, zoomOut, resetTransform, centerView }) => (
                   <TransformComponent 
                     wrapperStyle={{ width: "100%", height: "100%" }} 
                     contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}
                   >
                     <img 
                       src={getCleanUrl(url)} 
                       alt="Fullscreen Layout" 
                       className="object-contain pointer-events-none"
                       style={{ maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: 'auto' }}
                       onError={(e) => {
                         (e.target as HTMLImageElement).src = fallbackSvg;
                       }}
                     />
                   </TransformComponent>
                )}
              </TransformWrapper>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-grow flex flex-col p-2.5 sm:p-4 md:p-6 bg-slate-50 dark:bg-slate-950 relative h-full print:p-0 print:m-0 print:bg-white print:border-none print:shadow-none">
      <div className="flex flex-col gap-2 mb-2 hide-on-actual-print print:hidden">
        {/* Row 1: Header, Filter Bar, and Back to Gantt */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">Layout</h2>
            
            {/* Unified Filter Pill */}
            <div className="flex items-center gap-1 sm:gap-1.5 bg-white dark:bg-[#1e1e20] p-1 sm:p-1.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383] ml-1 shrink-0" />
              <select
                value={activeStore}
                onChange={(e) => setGlobalStoreFilter(e.target.value)}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[70px] outline-none cursor-pointer"
              >
                {allowedStores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-[#444446]"></div>
              <select
                value={locFilterStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalLocationFilter([val]);
                }}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[65px] outline-none cursor-pointer"
              >
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
              <div className="w-px h-3.5 bg-slate-200 dark:bg-[#444446]"></div>
              <select
                value={globalYearFilter === 'all' ? (new Date().getFullYear().toString()) : globalYearFilter}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[65px] outline-none cursor-pointer pr-1"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons & Gantt Navigation Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
            {onBackToGantt && (
              <button
                onClick={onBackToGantt}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-[#28282a] dark:text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs active:scale-95 touch-manipulation shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to Gantt</span>
                <span className="sm:hidden">Gantt</span>
              </button>
            )}

            {/* Live Map / Exit Live */}
            <button
              onClick={() => setIsLiveMapMode(!isLiveMapMode)}
              className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0 ${
                isLiveMapMode 
                  ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-400' 
                  : 'bg-white dark:bg-[#1e1e20] text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border-slate-200 dark:border-[#444446]'
              }`}
            >
              <Map className="w-3.5 h-3.5 shrink-0" />
              <span>{isLiveMapMode ? 'Exit Live' : 'Live Map'}</span>
            </button>

            {/* Refresh */}
            <button 
              onClick={() => setCacheBuster(Date.now())}
              className="flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-slate-200 dark:border-[#444446] shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
              title="Làm mới dữ liệu mặt bằng"
            >
              <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Export */}
            {canWrite && (
              <button 
                onClick={handleTriggerReExport}
                disabled={isExporting}
                title="Tự động thực hiện: Bước 1 Apply all rules Dynamic -> Bước 2 Save Cloud R2"
                className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-50 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-emerald-200 dark:border-emerald-800 shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isExporting ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{isExporting ? (exportStatusMessage || 'Đang xuất...') : 'Trigger Export'}</span>
                <span className="sm:hidden">{isExporting ? 'Xuất...' : 'Export'}</span>
              </button>
            )}

            {/* Edit URL for Admin */}
            {isAdmin && (
              <button 
                onClick={() => { setEditUrl(url); setIsEditing(true); }}
                className="flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-blue-200 dark:border-blue-800 shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
                title="Chỉnh sửa liên kết URL bản đồ"
              >
                <Edit2 className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden md:inline">Edit URL</span>
              </button>
            )}

            {/* Active Export Status Banner - Only displayed when exporting or waiting */}
            {isExporting && (
              <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 animate-pulse shrink-0">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span className="hidden sm:inline">{exportStatusMessage || 'Đang xử lý xuất...'}</span>
              </div>
            )}
          </div>
        </div>

        {!isEditing && (
          <div className="w-full">
            {/* Search Unit & Project Box - Full width */}
            <div ref={searchContainerRef} className="relative w-full">
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input 
                  type="text"
                  value={unitSearchInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setUnitSearchInput(val);
                    if (!val.trim()) {
                      setTargetUnitSearch(null);
                    }
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredUnitSuggestions.length > 0) {
                        handleSelectSearchUnit(filteredUnitSuggestions[0]);
                      } else if (unitSearchInput.trim()) {
                        handleSelectSearchUnit({ unit: unitSearchInput.trim() });
                      }
                    } else if (e.key === 'Escape') {
                      setShowSuggestions(false);
                      handleClearSearchAndFocus();
                    }
                  }}
                  placeholder="Tìm ô unit, brand hoặc dự án..."
                  className="w-full pl-9 pr-8 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-xl text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 dark:focus:border-purple-400 shadow-xs transition-all"
                />
                {unitSearchInput && (
                  <button 
                    type="button"
                    onClick={handleClearSearchAndFocus}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-200 transition-colors shadow-xs active:scale-95 touch-manipulation"
                    title="Xóa tìm kiếm & Thoát phóng to"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {showSuggestions && unitSearchInput.trim() && (
                <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-1.5 animate-in fade-in duration-100">
                  {filteredUnitSuggestions.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center italic">
                      Nhấn Enter để tìm "{unitSearchInput}"
                    </div>
                  ) : (
                    filteredUnitSuggestions.slice(0, 20).map((item: { unit: string; location?: string; brand?: string; project?: string; code?: string }) => (
                      <button
                        key={`${item.unit}_${item.project || ''}_${item.location || ''}`}
                        type="button"
                        onClick={() => handleSelectSearchUnit(item)}
                        className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/50 text-slate-800 dark:text-slate-100 transition-colors group cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-xs sm:text-sm font-mono text-purple-700 dark:text-purple-400 shrink-0">
                              {item.unit}
                            </span>
                            {item.brand && (
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {item.brand}
                              </span>
                            )}
                          </div>
                          {item.project && item.project !== item.unit && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              📁 {item.project}
                            </div>
                          )}
                        </div>
                        {item.location && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 shrink-0 ml-1">
                            {item.location}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {isAdmin && isEditing && (
          <div className="flex items-center gap-2 w-full max-w-xl">
            <div className="flex items-center gap-1 flex-grow">
              <input 
                type="text" 
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                onPaste={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="URL (Google Drive or Image URL)" 
                className="flex-grow p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
              />
              <button 
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setEditUrl(text);
                  } catch (err) {
                    console.error('Failed to read clipboard', err);
                  }
                }}
                className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg shrink-0 border border-slate-300 transition-colors"
                title="Paste from clipboard"
              >
                <Clipboard className="w-4 h-4" />
              </button>
            </div>
            <button 
              onClick={() => handleSave()}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              Save
            </button>
            <button 
              onClick={() => setIsEditing(false)}
              className="px-3 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-sm font-medium transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Helpful hint depending on view mode - hidden on mobile to maximize map height */}
      {url && !url.includes('drive.google.com') && !isEditing && (
        <div className="hidden md:flex mb-2 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-2 rounded-xl hide-on-actual-print print:hidden">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>💡 <b>Thao tác:</b> Cuộn chuột để di chuyển Lên/Xuống. Thu phóng: Giữ <b>Ctrl + Cuộn chuột</b> hoặc <b>Dùng 2 ngón tay</b> thu phóng trên màn hình cảm ứng/Touchpad.</span>
        </div>
      )}

      <div className="flex-grow flex w-full min-h-[460px] h-[calc(100dvh-175px)] sm:h-[calc(100vh-195px)] bg-slate-50 dark:bg-slate-900/50 rounded-2xl shadow-inner border border-slate-200 dark:border-slate-800 overflow-hidden relative print:h-[100vh] print:w-full print:min-h-0 print:border-none print:shadow-none print:rounded-none print:bg-white">
        {isLiveMapMode ? (
          <LiveLayoutViewer 
            storeFilter={activeStore} 
            locationFilter={locFilterStr} 
            targetUnitSearch={targetUnitSearch}
            onUnitSelected={(unit) => {
              if (unit?.name) {
                setUnitSearchInput(unit.name);
              }
            }}
            onClearFocus={handleClearSearchAndFocus}
          />
        ) : !url ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900">
            <Map className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm font-medium">No floor plan layout available for this location</p>
            {isAdmin && <p className="text-xs mt-1">Click "Edit URL" to configure layout link</p>}
          </div>
        ) : url.includes('drive.google.com') ? (
          <iframe 
            key={cacheBuster}
            src={getCleanUrl(url)} 
            width="100%" 
            style={{ height: '100%', minHeight: '600px', border: 'none' }}
            allow="autoplay"
          ></iframe>
        ) : (
          <div className="w-full h-full relative flex-grow flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
            <TransformWrapper
              initialScale={1}
              minScale={0.5}
              maxScale={6}
              centerOnInit={true}
              wheel={{ step: 0.1 }}
              pinch={{ step: 5 }}
              panning={{ disabled: false }}
              doubleClick={{
                mode: "toggle",
                step: 2.2
              }}
            >
              {({ zoomIn, zoomOut, resetTransform, state }) => (
                <>
                  <div className="absolute top-4 right-4 z-[50] flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
                    <button
                      type="button"
                      onClick={() => zoomIn(0.3)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomOut(0.3)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700">
                      {Math.round((state.scale || 1) * 100)}%
                    </span>
                    <button 
                      type="button"
                      onClick={() => resetTransform()}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                      title="Reset"
                    >
                      <Maximize className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsFullscreenView(true)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                      title="Fullscreen"
                    >
                      <Maximize2 className="w-4 h-4" />
                    </button>
                  </div>
                  <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                    contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}
                  >
                    <img 
                      src={getCleanUrl(url)} 
                      alt="Layout Scroll Preview" 
                      className="max-w-full max-h-full object-contain shadow-lg rounded-lg border border-slate-200 bg-white cursor-grab active:cursor-grabbing"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = fallbackSvg;
                      }}
                    />
                  </TransformComponent>
                </>
              )}
            </TransformWrapper>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
