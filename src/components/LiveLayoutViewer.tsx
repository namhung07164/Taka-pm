import React, { memo } from 'react';
import Konva from 'konva';
import { useAppStore } from '../store/useAppStore';
import { RefreshCw, Layers } from 'lucide-react';
import { useLiveLayoutR2Config } from './LiveLayoutParts/useLiveLayoutR2Config';
import { LiveLayoutViewerProps } from './LayoutTabParts/layoutViewerTypes';
import { LiveCanvas } from './LayoutTabParts/LiveCanvas';
import { AppRole } from '../types';

// Performance tuning for older iOS WebKit & high-fps dragging
Konva.hitOnDragEnabled = false;
Konva.dragDistance = 3;
Konva.dragButtons = [0];

export const LiveLayoutViewer = React.memo(function LiveLayoutViewer({
  storeFilter,
  locationFilter,
  yearFilter,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
}: LiveLayoutViewerProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isAdmin = currentUser ? currentUser.role === 'admin' : false;
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
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout || !!permissionMatrix[role]?.Write?.pictureMapping) && !isArchiveYear;

  const {
    config,
    loading,
    error,
    setShowConfigModal,
    initFormFromStorage,
    loadConfig,
  } = useLiveLayoutR2Config();

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm font-medium">Đang tải cấu hình Bản đồ Chuyên đề (Thematic Map)...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-amber-600 dark:text-amber-400 p-4">
        <Layers className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm font-medium px-4 text-center max-w-md">{error}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button 
            onClick={() => loadConfig()} 
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Thử lại
          </button>
          <button 
            onClick={() => { initFormFromStorage(); setShowConfigModal(true); }} 
            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition"
          >
            Cấu hình R2 Manual
          </button>
        </div>
      </div>
    );
  }

  return (
    <LiveCanvas 
      config={config} 
      storeFilter={storeFilter} 
      locationFilter={locationFilter} 
      yearFilter={yearFilter}
      targetUnitSearch={targetUnitSearch}
      onUnitSelected={onUnitSelected}
      onClearFocus={onClearFocus}
      onRefreshConfig={loadConfig} 
      onOpenR2Config={() => { initFormFromStorage(); setShowConfigModal(true); }} 
      canWrite={canWrite}
    />
  );
});

export default LiveLayoutViewer;
