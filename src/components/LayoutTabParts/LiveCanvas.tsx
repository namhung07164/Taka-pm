import React, { Suspense, memo, useDeferredValue, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { AlertTriangle, ShieldAlert, Layers } from 'lucide-react';
import { LayoutUnitTooltip } from './LayoutUnitTooltip';
import { LayoutPrintLegendOverlay } from './LayoutPrintLegendOverlay';
import { LayoutFocusBanner } from './LayoutFocusBanner';
import { LayoutFloorVersionSelector } from './LayoutFloorVersionSelector';
import { LayoutZoomControls } from './LayoutZoomControls';
import { LayoutColorLegendBar } from './LayoutColorLegendBar';
import { LayoutColorLegendModal } from './LayoutColorLegendModal';
import { LayoutEditModeModal } from './LayoutEditModeModal';
import { LayoutCanvasViewport } from './LayoutCanvasViewport';
import { useLayoutFloorData } from './useLayoutFloorData';
import { useLayoutAggregates } from './useLayoutAggregates';
import { useLayoutStageInteractions } from './useLayoutStageInteractions';
import { getContrastStyle } from './layoutViewerTypes';
import { Project } from '../../types';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import { executeTriggerExportProcess } from '../PictureMapping/lib/dynamicExportService';

const LayoutMiniGanttModal = lazyWithRetry(
  () => import('./LayoutMiniGanttModal').then(m => ({ default: m.LayoutMiniGanttModal })),
  'LayoutMiniGanttModal'
);

interface LiveCanvasProps {
  config: any;
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
  onRefreshConfig?: () => Promise<void> | void;
  onOpenR2Config: () => void;
  canWrite: boolean;
}

export const LiveCanvas = React.memo(function LiveCanvas({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
  onRefreshConfig,
  onOpenR2Config,
  canWrite,
}: LiveCanvasProps) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const setLayoutTooltipVisibility = useAppStore(state => state.setLayoutTooltipVisibility);
  const resetLayoutTooltipVisibility = useAppStore(state => state.resetLayoutTooltipVisibility);
  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const isProjectModalOpen = useAppStore(state => state.isProjectModalOpen);
  const quickNavTarget = useAppStore(state => state.quickNavTarget);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const setIsPrintPreview = useAppStore(state => state.setIsPrintPreview);

  const [filterOnlyAlerts, setFilterOnlyAlerts] = useState<boolean>(false);
  const [isSmartAlertCollapsed, setIsSmartAlertCollapsed] = useState<boolean>(false);
  const [miniGanttProject, setMiniGanttProject] = useState<Project | null>(null);
  const isAnyModalActive = Boolean(quickNavTarget) || isProjectModalOpen || Boolean(miniGanttProject);

  const savedTooltipStateRef = React.useRef<{
    hoverInfo: any;
    isPinned: boolean;
  } | null>(null);
  const prevIsAnyModalActiveRef = React.useRef(isAnyModalActive);

  const [showMenu, setShowMenu] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [isLegendStripCollapsed, setIsLegendStripCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('taka_layout_legend_collapsed');
      if (saved !== null) return saved === 'true';
    } catch {
      // Ignore
    }
    return false;
  });
  const [selectedLegendGroupId, setSelectedLegendGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  // 1. Floor data & versions resolution hook
  const {
    version,
    units,
    locationVersions,
    availableStoreVersions,
    bgImage,
    unitImagesRev,
    hasStoredUnitImages,
    selectedVersionId,
    setSelectedVersionId,
    targetLoc,
    effectiveLayoutYear,
  } = useLayoutFloorData({
    config,
    storeFilter,
    locationFilter,
    yearFilter,
  });

  // 2. Stage interactions, zoom & pan engine
  const stageInteractions = useLayoutStageInteractions({
    bgImage,
    version,
    units,
    targetUnitSearch,
    onUnitSelected,
    onClearFocus,
    availableStoreVersions,
    selectedVersionId,
    setSelectedVersionId,
    storeFilter,
    targetLoc,
    isProjectModalOpen,
    miniGanttProject,
  });

  // 3. Financial, project, and thematic aggregates hook
  const {
    aggregatedData,
    activeGroups,
    totalFloorAlerts,
    focusedUnit,
    visibleUnits,
    hasUserAccessInStoreYear,
    restrictedProjectCodes,
  } = useLayoutAggregates({
    units,
    version,
    storeFilter,
    locationFilter,
    targetLoc,
    effectiveLayoutYear,
    hasStoredUnitImages,
    unitImagesRev,
    focusedUnitId: stageInteractions.focusedUnitId,
    filterOnlyAlerts,
    deferredSearchQuery,
    stageScale: stageInteractions.stageScale,
    stagePos: stageInteractions.stagePos,
    dimensions: stageInteractions.dimensions,
  });

  // Synchronize latest aggregated data with stage interaction callbacks
  stageInteractions.updateAggregatedData(aggregatedData, restrictedProjectCodes);

  // Auto-hide Tooltip when QuickNav / MiniGantt / ProjectModal is active, and Auto-restore when closed
  useEffect(() => {
    if (!prevIsAnyModalActiveRef.current && isAnyModalActive) {
      if (stageInteractions.hoverInfo && stageInteractions.hoverInfo.visible) {
        savedTooltipStateRef.current = {
          hoverInfo: stageInteractions.hoverInfo,
          isPinned: stageInteractions.isPinnedRef.current,
        };
      }
    } else if (prevIsAnyModalActiveRef.current && !isAnyModalActive) {
      if (savedTooltipStateRef.current) {
        const saved = savedTooltipStateRef.current;
        savedTooltipStateRef.current = null;
        stageInteractions.isPinnedRef.current = saved.isPinned;
        stageInteractions.setHoverInfo(saved.hoverInfo);
        if (saved.hoverInfo?.clientX != null && saved.hoverInfo?.clientY != null) {
          setTimeout(() => {
            stageInteractions.updateTooltipPos(saved.hoverInfo.clientX, saved.hoverInfo.clientY);
          }, 30);
        }
      }
    }
    prevIsAnyModalActiveRef.current = isAnyModalActive;
  }, [isAnyModalActive, stageInteractions]);

  // Reset focus, tooltips, alert filters, legend filters, mini gantt, and fit screen whenever store, location, or year changes
  const prevFilterScopeRef = React.useRef<string>('');
  useEffect(() => {
    const currentScope = `${storeFilter}_${targetLoc}_${effectiveLayoutYear}`;
    if (prevFilterScopeRef.current && prevFilterScopeRef.current !== currentScope) {
      stageInteractions.setFocusedUnitId(null);
      stageInteractions.setHoverInfo(null);
      stageInteractions.isPinnedRef.current = false;
      savedTooltipStateRef.current = null;
      setFilterOnlyAlerts(false);
      setSelectedLegendGroupId(null);
      setMiniGanttProject(null);
      setShowLegendModal(false);
      if (stageInteractions.focusedTimerRef.current) clearTimeout(stageInteractions.focusedTimerRef.current);
      onClearFocus?.();
      stageInteractions.fitToScreen(true);
    }
    prevFilterScopeRef.current = currentScope;
  }, [storeFilter, targetLoc, effectiveLayoutYear, onClearFocus, stageInteractions]);

  // Listen for Edit Mode trigger from hamburger menu
  useEffect(() => {
    const handleOpenEditMode = () => {
      setShowMenu(true);
    };
    window.addEventListener("open-layout-edit-mode", handleOpenEditMode);
    return () => {
      window.removeEventListener("open-layout-edit-mode", handleOpenEditMode);
    };
  }, []);

  const handleTriggerExport = async () => {
    if (!canWrite) {
      alert('⚠️ You do not have Write permission to trigger export.');
      return;
    }
    if (isExporting) return;
    try {
      setIsExporting(true);
      setExportStatus('Step 1/4: Loading data from Cloudflare R2...');
      const targetStore = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      const res = await executeTriggerExportProcess(targetStore, (status) => {
        setExportStatus(status);
      });
      setIsExporting(false);
      setExportStatus('');
      alert(`✅ ${res.message}`);
      if (onRefreshConfig) {
        await onRefreshConfig();
      }
    } catch (err: any) {
      console.error("Lỗi khi Trigger Export:", err);
      setIsExporting(false);
      setExportStatus('');
      alert(`⚠️ Lỗi khi Trigger Export:\n${err?.message || err}`);
    }
  };

  const isIOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1));
  const pixelRatio = typeof window !== 'undefined' ? (isIOS ? 1 : Math.min(window.devicePixelRatio || 1, 1.25)) : 1;

  if (!hasUserAccessInStoreYear) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-slate-400 p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 flex items-center justify-center mb-3 shadow-inner">
          <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400 opacity-80" />
        </div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200">
          No authorized projects or tasks found ({globalYearFilter || 'Selected Year'})
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
          Floor layout and live metrics are restricted and hidden for accounts without active assignments in this timeframe.
        </p>
      </div>
    );
  }

  if (!version || !version.id) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-slate-400 p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center mb-3 shadow-inner">
          <Layers className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-80" />
        </div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200">
          Chưa có dữ liệu Layout cho {storeFilter} • {targetLoc} ({globalYearFilter || 'Tất cả năm'})
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
          Bộ lọc và dữ liệu mặt bằng đồng bộ trực tiếp theo các phiên bản tại tab Review. Hãy tạo hoặc gán phiên bản tại tab Picture Mapping để hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative select-none [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:20px_20px] print:bg-white print:bg-none print:p-0 print:m-0 print:border-none">
      
      {/* Clean High-Contrast Print Legend Overlay - Renders only on print & print preview */}
      <LayoutPrintLegendOverlay
        storeFilter={storeFilter}
        targetLoc={targetLoc}
        version={version}
        activeGroups={activeGroups}
      />
      
      {/* Floating Focus Unit Banner with Cancel / Exit Button */}
      <LayoutFocusBanner
        focusedUnitId={stageInteractions.focusedUnitId}
        units={units}
        onClearFocus={() => {
          stageInteractions.setFocusedUnitId(null);
          stageInteractions.setHoverInfo(null);
          if (stageInteractions.focusedTimerRef.current) clearTimeout(stageInteractions.focusedTimerRef.current);
          stageInteractions.fitToScreen(true);
          onClearFocus?.();
        }}
      />

      {/* Floating Top-Left Controls: Location & Layout Version Switcher */}
      <LayoutFloorVersionSelector
        storeFilter={storeFilter}
        targetLoc={targetLoc}
        locationVersions={locationVersions}
        version={version}
        setSelectedVersionId={setSelectedVersionId}
      />

      {/* Floating Top-Right Controls */}
      <LayoutZoomControls
        totalFloorAlerts={totalFloorAlerts}
        filterOnlyAlerts={filterOnlyAlerts}
        setFilterOnlyAlerts={setFilterOnlyAlerts}
        stageScale={stageInteractions.stageScale}
        onZoomIn={stageInteractions.handleZoomIn}
        onZoomOut={stageInteractions.handleZoomOut}
        onFitToScreen={() => stageInteractions.fitToScreen(true)}
      />

      {/* Active Alert Filter Banner */}
      {filterOnlyAlerts && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-red-600 text-white px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-150 hide-on-actual-print print:hidden">
          <AlertTriangle className="w-4 h-4 shrink-0 text-white animate-pulse" />
          <span>Showing {totalFloorAlerts} unit{totalFloorAlerts > 1 ? 's' : ''} with active alerts</span>
          <button
            type="button"
            onClick={() => setFilterOnlyAlerts(false)}
            className="ml-1 bg-white/20 hover:bg-white/30 text-white text-[10px] font-bold px-2 py-0.5 rounded-full active:scale-95 transition-all cursor-pointer"
          >
            Show All
          </button>
        </div>
      )}

      {/* Compact Color Legend Bar with Export Integration */}
      <LayoutColorLegendBar
        layoutTooltipVisibility={layoutTooltipVisibility}
        activeGroups={activeGroups}
        selectedLegendGroupId={selectedLegendGroupId}
        setSelectedLegendGroupId={setSelectedLegendGroupId}
        setShowLegendModal={setShowLegendModal}
        isLegendStripCollapsed={isLegendStripCollapsed}
        setIsLegendStripCollapsed={setIsLegendStripCollapsed}
        canWrite={canWrite}
        handleTriggerExport={handleTriggerExport}
        isExporting={isExporting}
        exportStatus={exportStatus}
        handleExport={stageInteractions.handleExport}
        setIsPrintPreview={setIsPrintPreview}
      />

      {/* Full Color Legend Modal / Drawer (iOS friendly) */}
      <LayoutColorLegendModal
        showLegendModal={showLegendModal}
        onClose={() => setShowLegendModal(false)}
        activeGroups={activeGroups}
        selectedLegendGroupId={selectedLegendGroupId}
        setSelectedLegendGroupId={setSelectedLegendGroupId}
      />

      {/* Floating Edit Mode Drawer / Modal */}
      <LayoutEditModeModal
        showMenu={showMenu}
        onClose={() => setShowMenu(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSmartAlertCollapsed={isSmartAlertCollapsed}
        setIsSmartAlertCollapsed={setIsSmartAlertCollapsed}
        layoutTooltipVisibility={layoutTooltipVisibility}
        setLayoutTooltipVisibility={setLayoutTooltipVisibility}
        resetLayoutTooltipVisibility={resetLayoutTooltipVisibility}
        canWrite={canWrite}
        handleTriggerExport={handleTriggerExport}
        isExporting={isExporting}
        exportStatus={exportStatus}
        setIsPrintPreview={setIsPrintPreview}
        isPrintPreview={isPrintPreview}
        handleExport={stageInteractions.handleExport}
        onOpenR2Config={onOpenR2Config}
      />

      {/* Tooltip (Auto-hidden when any Modal or QuickNav is active) */}
      {!isAnyModalActive && stageInteractions.hoverInfo && stageInteractions.hoverInfo.visible && (
        <div className="hide-on-actual-print print:hidden">
          <LayoutUnitTooltip
            hoverInfo={stageInteractions.hoverInfo}
            tooltipRef={stageInteractions.tooltipRef}
            containerRef={stageInteractions.containerRef}
            onClose={() => {
              savedTooltipStateRef.current = null;
              stageInteractions.isPinnedRef.current = false;
              stageInteractions.setHoverInfo(null);
              if (stageInteractions.focusedUnitId) {
                stageInteractions.setFocusedUnitId(null);
                if (stageInteractions.focusedTimerRef.current) clearTimeout(stageInteractions.focusedTimerRef.current);
                stageInteractions.fitToScreen(true);
                onClearFocus?.();
              }
            }}
            onOpenMiniGantt={(project) => {
              if (stageInteractions.hoverInfo && stageInteractions.hoverInfo.visible) {
                savedTooltipStateRef.current = {
                  hoverInfo: stageInteractions.hoverInfo,
                  isPinned: stageInteractions.isPinnedRef.current,
                };
              }
              setMiniGanttProject(project);
            }}
            onEditProject={(project, _isReadOnly, tab) => {
              if (stageInteractions.hoverInfo && stageInteractions.hoverInfo.visible) {
                savedTooltipStateRef.current = {
                  hoverInfo: stageInteractions.hoverInfo,
                  isPinned: stageInteractions.isPinnedRef.current,
                };
              }
              setEditingProject(project);
              setModalInitialTab(tab || 'details');
              setIsProjectModalOpen(true);
            }}
            canWrite={canWrite}
            storeFilter={storeFilter}
            onFocusUnit={(unitTarget) => {
              stageInteractions.zoomAndPanToUnit(unitTarget);
            }}
          />
        </div>
      )}

      {/* JIT Mounted Draggable Mini Gantt Modal */}
      {miniGanttProject && (
        <React.Suspense fallback={null}>
          <LayoutMiniGanttModal
            project={miniGanttProject}
            isOpen={Boolean(miniGanttProject)}
            onClose={() => setMiniGanttProject(null)}
          />
        </React.Suspense>
      )}

      {/* Canvas Viewport */}
      <LayoutCanvasViewport
        containerRef={stageInteractions.containerRef}
        stageRef={stageInteractions.stageRef}
        dimensions={stageInteractions.dimensions}
        stageScale={stageInteractions.stageScale}
        setStageScale={stageInteractions.setStageScale}
        stagePos={stageInteractions.stagePos}
        setStagePos={stageInteractions.setStagePos}
        pixelRatio={pixelRatio}
        isProjectModalOpen={isProjectModalOpen}
        miniGanttProject={miniGanttProject}
        handleDragStart={stageInteractions.handleDragStart}
        handleDragMove={stageInteractions.handleDragMove}
        handleDragEnd={stageInteractions.handleDragEnd}
        stopInertia={stageInteractions.stopInertia}
        isPinnedRef={stageInteractions.isPinnedRef}
        setHoverInfo={stageInteractions.setHoverInfo}
        touchStateRef={stageInteractions.touchStateRef}
        pendingTouchRef={stageInteractions.pendingTouchRef}
        rafTouchIdRef={stageInteractions.rafTouchIdRef}
        isInteractingRef={stageInteractions.isInteractingRef}
        fitToScreen={stageInteractions.fitToScreen}
        lastWheelPointerRef={stageInteractions.lastWheelPointerRef}
        pendingWheelDeltaRef={stageInteractions.pendingWheelDeltaRef}
        rafWheelIdRef={stageInteractions.rafWheelIdRef}
        wheelTimeoutRef={stageInteractions.wheelTimeoutRef}
        bgImage={bgImage}
        version={version}
        visibleUnits={visibleUnits}
        layoutTooltipVisibility={layoutTooltipVisibility}
        focusedUnitId={stageInteractions.focusedUnitId}
        selectedLegendGroupId={selectedLegendGroupId}
        getContrastStyle={getContrastStyle}
        aggregatedData={aggregatedData}
        focusedUnit={focusedUnit}
        handleMouseEnterUnit={stageInteractions.handleMouseEnterUnit}
        handleMouseMoveUnit={stageInteractions.handleMouseMoveUnit}
        handleMouseLeaveUnit={stageInteractions.handleMouseLeaveUnit}
        handleClickUnit={stageInteractions.handleClickUnit}
        handleTapUnit={stageInteractions.handleTapUnit}
        hasStoredUnitImages={hasStoredUnitImages}
        storeFilter={storeFilter}
      />
    </div>
  );
});
