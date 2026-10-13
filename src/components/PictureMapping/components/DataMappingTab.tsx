import React, { useState } from "react";
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'motion/react';
import { Split, Edit3, GitMerge, Eye, Maximize2, X, Building2, MapPin, Layers, Calendar } from 'lucide-react';
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

  const allStoreUnits = React.useMemo(() => {
    return getAllStoreUnits(store);
  }, [store, mapUnits, storeLocationData, getAllStoreUnits]);

  const allStoreVersions = React.useMemo(() => {
    return getAllStoreVersions(store);
  }, [store, mapVersions, storeLocationData, getAllStoreVersions]);

  // Pre-cache all floor maps into IndexedDB for instant switching
  React.useEffect(() => {
    if (allStoreVersions.length > 0) {
      const urls = allStoreVersions
        .map(v => v?.backgroundUrl)
        .filter((u): u is string => typeof u === 'string' && u.length > 0 && !u.startsWith('r2://'));
      if (urls.length > 0) {
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

  return (
    <div className="flex flex-col h-full w-full overflow-hidden pb-1 relative min-h-0">
      <div className="relative z-10 p-1 shrink-0">
        <div className="glass rounded-xl p-2 px-3 border border-slate-800/80 shadow-lg flex items-center justify-between bg-slate-950/90 backdrop-blur-xl flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-brand-600/20 border border-brand-500/30 rounded-lg flex items-center justify-center text-brand-400 shrink-0">
                <Split size={14} />
              </div>
              <div>
                <h3 className="text-xs font-bold italic serif tracking-wide text-white flex items-center gap-2">
                  Picture Mapping
                  <span id="data-mapping-toolbar-portal" className="flex items-center gap-1"></span>
                </h3>
              </div>
            </div>

              {/* Store & Location Filter Dropdown */}
              <div className="flex items-center gap-2 bg-slate-900/90 px-2 py-1 rounded-lg border border-slate-700/80 shadow-inner">
                <div className="flex items-center gap-1.5" title="Chọn Chi nhánh (Store)">
                  <Building2 size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Store:</span>
                  <select
                    value={store}
                    onChange={(e) => setStore(e.target.value as 'HCM' | 'HN')}
                    className="bg-transparent border-none text-xs text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-brand-300 transition-colors"
                  >
                    {allowedStores.map(s => (
                      <option key={s} value={s} className="bg-slate-950 text-slate-200 font-semibold">{s}</option>
                    ))}
                  </select>
                </div>

                <div className="w-px h-3.5 bg-slate-700/80"></div>

                {/* Location Filter on all tabs */}
                <div className="flex items-center gap-1.5" title="Chọn Tầng / Vị trí (Location)">
                  <MapPin size={13} className="text-purple-400" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Location:</span>
                  <select
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="bg-transparent border-none text-xs text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-purple-300 transition-colors"
                  >
                    {userAllowedLocations.map(loc => (
                      <option key={loc} value={loc} className="bg-slate-950 text-slate-200 font-semibold">{loc}</option>
                    ))}
                  </select>
                </div>

                {/* Year Filter: ONLY on dynamic-hierarchy and review tabs, HIDDEN on edit tab */}
                {activeSubTab !== 'edit' && (
                  <>
                    <div className="w-px h-3.5 bg-slate-700/80"></div>
                    <div className="flex items-center gap-1.5" title="Chọn Năm quy hoạch (Year)">
                      <Calendar size={13} className="text-amber-400" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Year:</span>
                      <select
                        value={effectiveYear}
                        onChange={(e) => setGlobalYearFilter(e.target.value)}
                        className="bg-transparent border-none text-xs text-white font-bold uppercase tracking-wide outline-none cursor-pointer hover:text-amber-300 transition-colors"
                      >
                        {availableYears.map(y => (
                          <option key={y} value={y} className="bg-slate-950 text-slate-200 font-semibold">{y}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className="w-px h-3.5 bg-slate-700/80"></div>

                <span className="text-[10px] font-medium text-slate-400">
                  {mapUnits.length} {mapUnits.length === 1 ? 'unit' : 'units'} ({location})
                </span>
              </div>
          </div>

          <div className="flex items-center gap-2">
            <CloudSyncManager scope={activeSubTab === 'dynamic-hierarchy' ? 'dynamic' : activeSubTab} />
            <div className="flex bg-slate-900/70 p-0.5 rounded-lg border border-slate-800/80">
              <button
                onClick={() => setActiveSubTab('edit')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                  activeSubTab === 'edit' 
                    ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Edit3 size={11} />
                Edit
              </button>
              <button
                onClick={() => setActiveSubTab('dynamic-hierarchy')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                  activeSubTab === 'dynamic-hierarchy' 
                    ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <GitMerge size={11} />
                Dynamic
              </button>
              <button
                onClick={() => setActiveSubTab('review')}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all duration-200",
                  activeSubTab === 'review' 
                    ? "bg-brand-600/30 text-brand-300 border border-brand-500/40 shadow-sm" 
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                <Eye size={11} />
                Review
              </button>
            </div>
            
            <button 
              onClick={() => setIsTabFullscreen(true)}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-white transition-all shadow-sm flex items-center gap-1 text-[10px] font-semibold"
              title="Toàn màn hình Workspace"
            >
              <Maximize2 size={12} />
              <span className="hidden sm:inline">Toàn Màn Hình</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 w-full h-full rounded-xl border border-slate-800 shadow-xl relative overflow-hidden flex flex-col z-0 bg-[#141416]">
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

      {/* Fullscreen Overlay */}
      <AnimatePresence>
        {isTabFullscreen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[99999] bg-bg-dark p-6 lg:p-12 overflow-hidden flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <div className="flex bg-slate-900/50 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveSubTab('edit')}
                  className={cn(
                    "flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold uppercase transition-all",
                    activeSubTab === 'edit' ? "bg-brand-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  <Edit3 size={16} /> Edit
                </button>
                <button
                  onClick={() => setActiveSubTab('dynamic-hierarchy')}
                  className={cn(
                    "flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold uppercase transition-all",
                    activeSubTab === 'dynamic-hierarchy' ? "bg-brand-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  <GitMerge size={16} /> Dynamic Hierarchy
                </button>
                <button
                  onClick={() => setActiveSubTab('review')}
                  className={cn(
                    "flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold uppercase transition-all",
                    activeSubTab === 'review' ? "bg-brand-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  <Eye size={16} /> Review
                </button>
              </div>

              <button 
                onClick={() => setIsTabFullscreen(false)}
                className="w-12 h-12 flex items-center justify-center bg-slate-800 hover:bg-red-600 text-white rounded-2xl transition-all shadow-xl"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden relative glass border border-slate-800 rounded-3xl p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`fs-${activeSubTab}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  {renderTabContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

