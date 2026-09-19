import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import {  db, APP_ID , setDoc } from "../lib/firebase";
import { Edit2, Save, ArrowLeft, Filter, Search, X, RefreshCw, ZoomIn, ZoomOut, Maximize, Eye, Move, HelpCircle, Clipboard, Map } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { AppUser, PermissionMatrix, AppRole, Project } from '../types';
import { getUserAllowedStores, getEffectiveStoreFilter } from '../lib/utils';
import { usePerformanceStore } from '../store/usePerformanceStore';
import { LiveLayoutViewer } from './LiveLayoutViewer';
import { executeTriggerExportProcess } from './PictureMapping/lib/dynamicExportService';

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
    if (initialStore) setGlobalStoreFilter(initialStore);
    if (initialLocation) setGlobalLocationFilter([initialLocation]);
    if (initialProjectCode) setProjectCodeFilter(initialProjectCode);
  }, [initialStore, initialLocation, initialProjectCode]);

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout) && !isArchiveYear;

  const allowedStores = React.useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const activeStore = effectiveStore === 'all' ? (allowedStores[0] || 'HCM') : effectiveStore;

  // Layout tab only supports store-specific floor plans (HCM, HN), hide all-stores
  useEffect(() => {
    if (globalStoreFilter === 'all' && allowedStores.length > 0) {
      setGlobalStoreFilter(allowedStores[0]);
    }
  }, [globalStoreFilter, allowedStores, setGlobalStoreFilter]);

  const locFilterStr = globalLocationFilter.length > 0 ? globalLocationFilter[0] : 'all';
  const docKey = locFilterStr !== 'all' 
    ? `url_${activeStore}_${locFilterStr}` 
    : `url_${activeStore}`;

  // Helper check xem một url có hợp lệ (không phải null, undefined, '', '0', '_')
  const isValidUrl = (val: any): boolean => {
    if (val === null || val === undefined) return false;
    const str = String(val).trim();
    if (str === '' || str === '0' || str === '_' || str.toLowerCase() === 'null') return false;
    return true;
  };

  // Danh sách toàn bộ location mà người dùng được phân quyền (Admin thấy toàn bộ)
  const userAllowedLocations = React.useMemo(() => {
    const baseList = Array.from(new Set([...locations, ...projects.map(p => p.location).filter(Boolean)]))
      .filter(l => l && String(l).trim() !== '' && String(l).toLowerCase() !== 'all');
    if (isAdmin || currentUser.locationPermissions?.['all']) {
      return baseList;
    }
    return baseList.filter(loc => currentUser.locationPermissions?.[loc.toLowerCase()]);
  }, [locations, projects, currentUser, isAdmin]);

  // Lọc danh sách location:
  // Nếu là Admin -> hiển thị TOÀN BỘ locations để admin có thể chọn và add/edit link URL
  // Nếu không phải Admin -> chỉ hiển thị các locations đã có URL hợp lệ
  const availableLocations = React.useMemo(() => {
    if (isAdmin) {
      return userAllowedLocations;
    }
    return userAllowedLocations.filter(loc => {
      const specificKey = `url_${activeStore}_${loc}`;
      return isValidUrl(layoutSettings[specificKey]);
    });
  }, [userAllowedLocations, isAdmin, layoutSettings, activeStore]);
  const [isEditing, setIsEditing] = useState(false);
  const [isLiveMapMode, setIsLiveMapMode] = useState(true);
  const [editUrl, setEditUrl] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());
  const [triggerState, setTriggerState] = useState<any>(null);
  const [isFullscreenView, setIsFullscreenView] = useState(false);
  const [scrollZoom, setScrollZoom] = useState(1);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

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

  const scrollZoomRef = React.useRef(scrollZoom);
  useEffect(() => {
    scrollZoomRef.current = scrollZoom;
  }, [scrollZoom]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    let initialDistance = 0;
    let initialZoom = 1;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        // Prevent default browser zoom
        e.preventDefault();
        // Determine zoom direction
        const zoomDelta = e.deltaY > 0 ? -0.15 : 0.15;
        setScrollZoom(prev => {
          let newZoom = prev + zoomDelta;
          // Let's constraint zoom range
          if (newZoom < 0.2) newZoom = 0.2;
          if (newZoom > 5) newZoom = 5;
          return newZoom;
        });
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialDistance = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        initialZoom = scrollZoomRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // Prevent default browser zoom/scroll
        e.preventDefault();
        const currentDistance = Math.hypot(
          e.touches[0].pageX - e.touches[1].pageX,
          e.touches[0].pageY - e.touches[1].pageY
        );
        if (initialDistance > 0) {
          const scale = currentDistance / initialDistance;
          setScrollZoom(() => {
            let newZoom = initialZoom * scale;
            if (newZoom < 0.2) newZoom = 0.2;
            if (newZoom > 5) newZoom = 5;
            return newZoom;
          });
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [url]);


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
      setExportStatusMessage('Bước 1/3: Đang tải dữ liệu từ Cloudflare R2...');
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
                panning={{ disabled: fsScale <= 1 }}
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
                  setFsScale(ref.state.scale);
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
      <div className="flex-grow flex flex-col p-4 md:p-6 bg-slate-50 relative h-full">
      <div className="flex flex-col gap-3 mb-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">Layout</h2>
          
          {onBackToGantt && (
            <button
              onClick={onBackToGantt}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-[#28282a] dark:text-white rounded-lg text-sm font-semibold transition-colors shadow-sm"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Gantt
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-white dark:bg-[#1e1e20] p-1.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm">
            <Filter className="w-4 h-4 text-slate-400 dark:text-[#838383] ml-1" />
            <select
              value={activeStore}
              onChange={(e) => setGlobalStoreFilter(e.target.value)}
              className="bg-transparent border-none text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[70px] outline-none cursor-pointer"
            >
              {allowedStores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="w-px h-4 bg-slate-200 dark:bg-[#444446]"></div>
            <select
              value={globalLocationFilter.length > 0 ? globalLocationFilter[0] : 'all'}
              onChange={(e) => {
                const val = e.target.value;
                setGlobalLocationFilter(val === 'all' ? [] : [val]);
              }}
              className="bg-transparent border-none text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[80px] outline-none cursor-pointer pr-1"
            >
              <option value="all">All Locations</option>
              {availableLocations.map(loc => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
          </div>

          {(!triggerState || !isExporting) ? (
            <div className="text-xs text-slate-600 dark:text-slate-300 font-mono bg-slate-200 dark:bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700">
              Status: false (Done)
            </div>
          ) : (
            <div className="text-xs text-amber-700 font-mono bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200">
              Status: true (Waiting for App 1)
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
            <button
              onClick={() => setIsLiveMapMode(!isLiveMapMode)}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border shadow-sm ${
                isLiveMapMode 
                  ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-400' 
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-200'
              }`}
            >
              <Map className="w-4 h-4" />
              {isLiveMapMode ? 'Exit Live Map' : 'View Live Map'}
            </button>
            <button 
              onClick={() => setCacheBuster(Date.now())}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-slate-200 shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
            {canWrite && (
              <button 
                onClick={handleTriggerReExport}
                disabled={isExporting}
                title="Tự động thực hiện: Bước 1 Apply all rules Dynamic -> Bước 2 Save Cloud R2"
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-emerald-200 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
                {isExporting ? (exportStatusMessage || 'Đang xử lý xuất...') : 'Trigger Export'}
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => { setEditUrl(url); setIsEditing(true); }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-blue-200 shadow-sm"
              >
                <Edit2 className="w-4 h-4" />
                Edit URL
              </button>
            )}
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

      {/* Helpful hint depending on view mode */}
      {url && !url.includes('drive.google.com') && !isEditing && (
        <div className="mb-2.5 flex items-center gap-1.5 text-xs text-slate-500 bg-blue-50/50 border border-blue-100 p-2 rounded-lg">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
          <span>💡 <b>Scroll:</b> Scroll mouse to move up/down. To Zoom: Hold <b>Ctrl + Scroll</b> or <b>Pinch with 2 fingers</b>.</span>
        </div>
      )}

      <div className="flex-grow flex w-full min-h-[600px] h-[calc(100vh-270px)] bg-slate-50 rounded-xl shadow-inner border border-slate-200 overflow-hidden relative">
        {isLiveMapMode ? (
          <LiveLayoutViewer storeFilter={activeStore} locationFilter={globalLocationFilter.length > 0 ? globalLocationFilter[0] : 'all'} />
        ) : !url ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
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
          <div className="w-full h-full relative flex-grow flex flex-col overflow-hidden bg-slate-100">
            <div className="absolute top-4 right-4 z-[50] flex items-center gap-2">
              <span className="text-xs font-semibold bg-white/90 backdrop-blur px-2 py-1.5 rounded shadow-lg text-slate-600 border border-slate-200">
                {Math.round(scrollZoom * 100)}%
              </span>
              <button 
                onClick={() => setScrollZoom(1)}
                className="p-1.5 bg-white/90 backdrop-blur text-slate-600 hover:bg-slate-50 border border-slate-200 rounded shadow-lg transition-all"
              >
                <Maximize className="w-4 h-4" />
              </button>
            </div>
            <div 
              ref={scrollContainerRef}
              className="w-full h-full overflow-y-auto overflow-x-auto p-4 md:p-8 bg-slate-100 text-center whitespace-nowrap [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]"
            >
              <div 
                className="inline-block text-left"
                  style={{ 
                    width: scrollZoom === 1 ? '100%' : `${100 * scrollZoom}%`,
                    maxWidth: scrollZoom === 1 ? '1200px' : `${1200 * scrollZoom}px`,
                    verticalAlign: 'top'
                  }}
                >
                  <img 
                    src={getCleanUrl(url)} 
                    alt="Layout Scroll Preview" 
                    className="w-full h-auto shadow-lg rounded-lg border border-slate-200 bg-white"
                    onClick={handleDoubleTap}
                    style={{ cursor: 'zoom-in', transition: 'width 0.1s ease, max-width 0.1s ease', touchAction: 'manipulation' }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = fallbackSvg;
                    }}
                  />
                </div>
              </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
