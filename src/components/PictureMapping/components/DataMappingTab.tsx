import { useShallow } from 'zustand/react/shallow';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Split, Edit3, GitMerge, Eye, Maximize2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import EditTab from './DataMapping/EditTab';
import HierarchyTab from './DataMapping/HierarchyTab';
import DynamicHierarchyTab from './DataMapping/DynamicHierarchyTab';
import ReviewTab from './DataMapping/ReviewTab';
import { UnitShape, Group, MapVersion } from './DataMapping/types';
import { useDataStore } from '../DataContext';

export type SubTab = 'edit' | 'hierarchy' | 'dynamic-hierarchy' | 'review';

export default React.memo(function DataMappingTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('edit');
  const [isTabFullscreen, setIsTabFullscreen] = useState(false);
  
  const [isHeaderVisible, setIsHeaderVisible] = useState(false);
  
  // Shared State
  const {  mapUnits, setMapUnits, mapVersions, setMapVersions, activeMapVersionId, setActiveMapVersionId  } = useDataStore(useShallow(state => ({
    mapUnits: state.mapUnits,
    setMapUnits: state.setMapUnits,
    mapVersions: state.mapVersions,
    setMapVersions: state.setMapVersions,
    activeMapVersionId: state.activeMapVersionId,
    setActiveMapVersionId: state.setActiveMapVersionId,
  })));

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
      case 'hierarchy':
        return (
          <HierarchyTab 
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
            units={mapUnits}
            setUnits={setMapUnits}
            versions={mapVersions}
            setVersions={setMapVersions}
            activeVersionId={activeMapVersionId}
            setActiveVersionId={setActiveMapVersionId}
          />
        );
      case 'review':
        return (
          <ReviewTab 
            units={mapUnits}
            setUnits={setMapUnits}
            versions={mapVersions}
            setVersions={setMapVersions}
            activeVersionId={activeMapVersionId}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden pb-4 pr-2 relative">
      <div className="z-50 p-2">
        <div className="glass rounded-xl p-3 border border-slate-800 shadow-2xl flex items-center justify-between bg-slate-950/80 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-600/20 border border-brand-500/30 rounded-lg flex items-center justify-center text-brand-400">
              <Split size={14} />
            </div>
            <div>
              <h3 className="text-xs font-bold italic serif tracking-wide text-white flex items-center gap-3">
                Data Mapping
                <span id="data-mapping-toolbar-portal" className="flex items-center gap-1"></span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex bg-slate-900/50 p-1 rounded-lg border border-slate-800/50">
              <button
                onClick={() => setActiveSubTab('edit')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                  activeSubTab === 'edit' 
                    ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Edit3 size={11} />
                Edit
              </button>
              <button
                onClick={() => setActiveSubTab('hierarchy')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                  activeSubTab === 'hierarchy' 
                    ? "bg-purple-600/20 text-purple-400 border border-purple-500/30" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <GitMerge size={11} />
                Hierarchy
              </button>
              <button
                onClick={() => setActiveSubTab('dynamic-hierarchy')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                  activeSubTab === 'dynamic-hierarchy' 
                    ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <GitMerge size={11} />
                Dynamic
              </button>
              <button
                onClick={() => setActiveSubTab('review')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all duration-300",
                  activeSubTab === 'review' 
                    ? "bg-brand-600/20 text-brand-400 border border-brand-500/30" 
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                <Eye size={11} />
                Review
              </button>
            </div>
            
            <button 
              onClick={() => setIsTabFullscreen(true)}
              className="p-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-all shadow-lg"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 glass rounded-3xl border border-slate-800/50 shadow-2xl relative overflow-hidden flex flex-col z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSubTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 p-8 overflow-hidden"
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
            className="fixed inset-0 z-[100] bg-bg-dark p-6 lg:p-12 overflow-hidden flex flex-col"
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
                  onClick={() => setActiveSubTab('hierarchy')}
                  className={cn(
                    "flex items-center gap-2 px-8 py-3 rounded-lg text-sm font-bold uppercase transition-all",
                    activeSubTab === 'hierarchy' ? "bg-purple-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-200"
                  )}
                >
                  <GitMerge size={16} /> Hierarchy
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

