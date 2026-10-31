import React, { useState, useEffect } from "react";
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'motion/react';
import { Split, Edit3, GitMerge, Eye, Maximize2, Minimize2, X, Building2, MapPin, Layers, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import EditTab from './DataMapping/EditTab';
import DynamicHierarchyTab from './DataMapping/DynamicHierarchyTab';
import ReviewTab from './DataMapping/ReviewTab';
import { UnitShape, Group, MapVersion } from './DataMapping/types';
import { useDataStore } from '../DataContext';
import { useAppStore } from '../../../store/useAppStore';
import { getUserAllowedStores } from '../../../lib/utils';

import CloudSyncManager from './CloudSync/CloudSyncManager';
import { preloadFloorImages } from '../../../lib/imageDBCache';

export type SubTab = 'edit' | 'dynamic-hierarchy' | 'review';

export default React.memo(function DataMappingTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('edit');
  const [isTabFullscreen, setIsTabFullscreen] = useState(false);
  
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);

  useEffect(() => {
    const handleToggleEvent = () => {
      setIsTabFullscreen(prev => !prev);
    };
    window.addEventListener('taka_toggle_mapping_fullscreen', handleToggleEvent);
    return () => window.removeEventListener('taka_toggle_mapping_fullscreen', handleToggleEvent);
  }, []);

  useEffect(() => {
    if (!isTabFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
          return;
        }
        setIsTabFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTabFullscreen]);

  const currentUser = useAppStore(state => state.currentUser);
  const isAdmin = currentUser.role === 'admin';
  const appLocations = useAppStore(state => state.locations);
  const appProjects = useAppStore(state => state.projects);
  const appTasks = useAppStore(state => state.tasks);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);

  const availableYears = React.useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = (appProjects || []).map(p => p.year ? String(p.year) : '').filter(Boolean);
    const taskYears = (appTasks || []).map(t => t.projectYear ? String(t.projectYear) : '').filter(Boolean);
    const allYrs = Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears]))
      .filter(y => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
    return allYrs;
  }, [appProjects, appTasks]);

  const effectiveYear = (globalYearFilter && globalYearFilter !== 'all')
    ? globalYearFilter
    : (availableYears[0] || new Date().getFullYear().toString());

  const allowedStores = React.useMemo(() => {
    const list = getUserAllowedStores(currentUser);
    const filtered = list.filter((s): s is 'HCM' | 'HN' => s === 'HCM' || s === 'HN');
    return filtered.length > 0 ? filtered : (['HCM'] as ('HCM' | 'HN')[]);
  }, [currentUser]);

  const userAllowedLocations = React.useMemo(() => {
    const defaults = ['B2', 'B1', 'L1', 'L2', 'L3', 'L4', 'L5'];
    const baseList = Array.from(new Set([...defaults, ...(appLocations || []), ...((appProjects || []).map(p => p.location).filter(Boolean))]))
      .filter(l => l && String(l).trim() !== '' && String(l).toLowerCase() !== 'all');
    if (isAdmin || currentUser.locationPermissions?.['all']) {
      return baseList;
    }
    return baseList.filter(loc => {
      const lLower = loc.toLowerCase();
      return currentUser.locationPermissions?.[lLower] || currentUser.locationPermissions?.[`md-${lLower}`];
    });
  }, [appLocations, appProjects, currentUser, isAdmin]);
  
  // Shared State
  const {  
    store,
    setStore,
    location,
    setLocation,
    mapUnits, 
    setMapUnits, 
    mapVersions, 
    setMapVersions, 
    activeMapVersionId, 
    setActiveMapVersionId,
    getAllStoreUnits,
    getAllStoreVersions,
    updateStoreUnitsAcrossLocations,
    updateStoreVersionsAcrossLocations,
    storeLocationData,
  } = useDataStore(useShallow(state => ({
    store: state.store,
    setStore: state.setStore,
    location: state.location,
    setLocation: state.setLocation,
    mapUnits: state.mapUnits,
    setMapUnits: state.setMapUnits,
    mapVersions: state.mapVersions,
    setMapVersions: state.setMapVersions,
    activeMapVersionId: state.activeMapVersionId,
    setActiveMapVersionId: state.setActiveMapVersionId,
    getAllStoreUnits: state.getAllStoreUnits,
    getAllStoreVersions: state.getAllStoreVersions,
    updateStoreUnitsAcrossLocations: state.updateStoreUnitsAcrossLocations,
    updateStoreVersionsAcrossLocations: state.updateStoreVersionsAcrossLocations,
    storeLocationData: state.storeLocationData,
  })));

  // Tự động bảo vệ & đồng bộ theo phân quyền Store
  React.useEffect(() => {
    if (allowedStores.length > 0 && !allowedStores.includes(store)) {
      setStore(allowedStores[0]);
    }
  }, [store, allowedStores, setStore]);

  // Tự động bảo vệ & đồng bộ theo phân quyền Location
  React.useEffect(() => {
    if (userAllowedLocations.length > 0 && !userAllowedLocations.includes(location)) {
      setLocation(userAllowedLocations[0]);
    }
  }, [location, userAllowedLocations, setLocation]);

  const prevUnitsCacheRef = React.useRef<{
    store: string;
    mapUnitsRef: any;
    partitionUnitRefs: any[];
    result: any[];
  } | null>(null);

  const allStoreUnits = React.useMemo(() => {
    const partitionUnitRefs: any[] = [];
    for (const key in storeLocationData) {
      if (key.startsWith(`${store}_`)) {
        partitionUnitRefs.push(key, storeLocationData[key]?.mapUnits);
      }
    }
    const prev = prevUnitsCacheRef.current;
    if (
      prev &&
      prev.store === store &&
      prev.mapUnitsRef === mapUnits &&
      prev.partitionUnitRefs.length === partitionUnitRefs.length &&
      prev.partitionUnitRefs.every((val, idx) => val === partitionUnitRefs[idx])
    ) {
      return prev.result;
    }
    const nextResult = getAllStoreUnits(store);
    prevUnitsCacheRef.current = {
      store,
      mapUnitsRef: mapUnits,
      partitionUnitRefs,
      result: nextResult,
    };
    return nextResult;
  }, [store, mapUnits, storeLocationData, getAllStoreUnits]);

  const allStoreVersions = React.useMemo(() => {
    return getAllStoreVersions(store);
  }, [store, mapVersions, storeLocationData, getAllStoreVersions]);

  // Pre-cache all floor maps into IndexedDB for instant switching
  const preloadedUrlsKeyRef = React.useRef<string>('');
  React.useEffect(() => {
    if (allStoreVersions.length > 0) {
      const urls = allStoreVersions
        .map(v => v?.backgroundUrl)
        .filter((u): u is string => typeof u === 'string' && u.length > 0 && !u.startsWith('r2://'));
      const key = urls.join('|');
      if (urls.length > 0 && key !== preloadedUrlsKeyRef.current) {
        preloadedUrlsKeyRef.current = key;
        preloadFloorImages(urls);
      }
    }
  }, [allStoreVersions]);

  React.useEffect(() => {
    try {
        const params = new URLSearchParams(window.location.search);
        const reviewVersion = params.get('review');
        if (reviewVersion) {
            setActiveMapVersionId(reviewVersion);
            setActiveSubTab('review');
            setIsTabFullscreen(true);
        }
    } catch(e) {}
  }, []);

  const renderTabContent = () => {
    switch (activeSubTab) {
      case 'edit':
        return (
          <EditTab 
            units={mapUnits}
            setUnits={setMapUnits}
            versions={mapVersions}
            setVersions={setMapVersions}
            activeVersionId={activeMapVersionId}
            setActiveVersionId={setActiveMapVersionId}
          />
        );
      case 'dynamic-hierarchy':
        return (
          <DynamicHierarchyTab 
            units={allStoreUnits}
            setUnits={(newUnits) => updateStoreUnitsAcrossLocations(newUnits, store)}
            versions={allStoreVersions}
            setVersions={(newVersions) => updateStoreVersionsAcrossLocations(newVersions, store)}
            activeVersionId={activeMapVersionId}
            setActiveVersionId={setActiveMapVersionId}
            store={store}
            location={location}
            year={effectiveYear}
          />
        );
      case 'review':
        return (
          <ReviewTab 
            units={allStoreUnits}
            setUnits={(newUnits) => updateStoreUnitsAcrossLocations(newUnits, store)}
            versions={allStoreVersions}
            setVersions={(newVersions) => updateStoreVersionsAcrossLocations(newVersions, store)}
            activeVersionId={activeMapVersionId}
            store={store}
            location={location}
            year={effectiveYear}
          />
        );
    }
  };

  const workspaceBody = (
    <div className={cn(
      "flex flex-col w-full overflow-hidden min-h-0",
      isTabFullscreen
        ? "fixed inset-0 z-[200000] bg-slate-950 text-slate-100 p-1.5 sm:p-2.5 h-screen"
        : "h-full relative"
    )}>
      <div className="relative z-10 px-0.5 py-0.5 shrink-0">
        <div className="glass rounded-md py-0.5 px-1.5 border border-slate-800/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between bg-slate-950/90 backdrop-blur-xl gap-1">
          {/* Top Row on Mobile: Title & SubTab Switcher + Fullscreen */}
          <div className="flex items-center justify-between sm:justify-start gap-1 w-full sm:w-auto">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 bg-brand-600/20 border border-brand-500/30 rounded flex items-center justify-center text-brand-400 shrink-0">
                <Split size={10} />
              </div>
              <h3 className="text-[10px] font-bold italic serif tracking-wide text-white flex items-center gap-1 whitespace-nowrap">
                Picture Mapping
                <span id="data-mapping-toolbar-portal" className="flex items-center gap-0.5"></span>
              </h3>
            </div>

            {/* Sub-tab Selector & Fullscreen on Mobile Right */}
            <div className="flex items-center gap-1 ml-auto sm:ml-0">
              <div className="flex bg-slate-900/70 p-0.5 rounded border border-slate-800/80">
                <button
                  onClick={() => setActiveSubTab('edit')}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all duration-200",
                    activeSubTab === 'edit' 
                      ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Edit3 size={9} />
                  Edit
                </button>
                <button
                  onClick={() => setActiveSubTab('dynamic-hierarchy')}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all duration-200",
                    activeSubTab === 'dynamic-hierarchy' 
                      ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <GitMerge size={9} />
                  Dynamic
                </button>
                <button
                  onClick={() => setActiveSubTab('review')}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-all duration-200",
                    activeSubTab === 'review' 
                      ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Eye size={9} />
                  Review
                </button>
              </div>

              <button 
                onClick={() => setIsTabFullscreen(prev => !prev)}
                className={cn(
                  "px-1.5 py-0.5 border rounded transition-all shadow-sm flex items-center gap-1 text-[9px] font-semibold shrink-0 active:scale-95 touch-manipulation cursor-pointer",
                  isTabFullscreen
                    ? "bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border-red-500/40"
                    : "bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                )}
                title={isTabFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Workspace"}
              >
                {isTabFullscreen ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
                <span className="hidden md:inline">{isTabFullscreen ? 'Thoát Toàn Màn Hình' : 'Toàn Màn Hình'}</span>
              </button>
            </div>
          </div>

          {/* Bottom Row on Mobile / Right Filters on Desktop: Store & Location Filter Dropdown */}
          <div className="flex items-center justify-between sm:justify-start gap-1 flex-wrap w-full sm:w-auto border-t sm:border-t-0 pt-0.5 sm:pt-0 border-slate-800/80">
            <div className="flex items-center gap-1 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700/80 shadow-inner flex-wrap">
              <div className="flex items-center gap-0.5" title="Chọn Chi nhánh (Store)">
                <Building2 size={10} className="text-brand-400" />
                <span className="text-[8px] font-bold uppercase text-slate-400">Store:</span>
                <select
                  value={store}
                  onChange={(e) => setStore(e.target.value as 'HCM' | 'HN')}
                  className="bg-transparent border-none text-[10px] text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-brand-300 transition-colors"
                >
                  {allowedStores.map(s => (
                    <option key={s} value={s} className="bg-slate-950 text-slate-200 font-semibold">{s}</option>
                  ))}
                </select>
              </div>

              <div className="w-px h-2 bg-slate-700/80"></div>

              {/* Location Filter on all tabs */}
              <div className="flex items-center gap-0.5" title="Chọn Tầng / Vị trí (Location)">
                <MapPin size={10} className="text-purple-400" />
                <span className="text-[8px] font-bold uppercase text-slate-400">Loc:</span>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="bg-transparent border-none text-[10px] text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-purple-300 transition-colors"
                >
                  {userAllowedLocations.map(loc => (
                    <option key={loc} value={loc} className="bg-slate-950 text-slate-200 font-semibold">{loc}</option>
                  ))}
                </select>
              </div>

              {/* Year Filter: ONLY on dynamic-hierarchy and review tabs, HIDDEN on edit tab */}
              {activeSubTab !== 'edit' && (
                <>
                  <div className="w-px h-2 bg-slate-700/80"></div>
                  <div className="flex items-center gap-0.5" title="Chọn Năm quy hoạch (Year)">
                    <Calendar size={10} className="text-amber-400" />
                    <span className="text-[8px] font-bold uppercase text-slate-400">Year:</span>
                    <select
                      value={effectiveYear}
                      onChange={(e) => setGlobalYearFilter(e.target.value)}
                      className="bg-transparent border-none text-[10px] text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-amber-300 transition-colors"
                    >
                      {availableYears.map(y => (
                        <option key={y} value={y} className="bg-slate-950 text-slate-200 font-semibold">{y}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="w-px h-2 bg-slate-700/80 hidden sm:block"></div>

              <span className="text-[8px] font-medium text-slate-400 hidden sm:inline">
                {mapUnits.length} units
              </span>
            </div>

            <CloudSyncManager scope={activeSubTab === 'dynamic-hierarchy' ? 'dynamic' : activeSubTab} compact />

            {isTabFullscreen && (
              <button
                onClick={() => setIsTabFullscreen(false)}
                className="w-6 h-6 flex items-center justify-center bg-slate-800 hover:bg-red-600 text-slate-200 hover:text-white rounded border border-slate-700 transition-all shadow cursor-pointer"
                title="Close Fullscreen (Esc)"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 w-full h-full rounded-lg border border-slate-800 shadow-lg relative overflow-hidden flex flex-col z-0 bg-[#141416]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 overflow-hidden flex flex-col"
          >
            {renderTabContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );

  if (isTabFullscreen && typeof document !== 'undefined') {
    return (
      <>
        <div className="flex flex-col h-full w-full overflow-hidden relative min-h-0 bg-slate-950/50 rounded-lg border border-slate-800 items-center justify-center text-slate-500 text-xs">
          Workspace is open in Fullscreen mode
        </div>
        {createPortal(workspaceBody, document.body)}
      </>
    );
  }

  return workspaceBody;
});

