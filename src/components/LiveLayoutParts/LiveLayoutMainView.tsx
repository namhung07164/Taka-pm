import React, { useEffect, useState, useRef, useMemo, useDeferredValue } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Layers, ShieldAlert } from 'lucide-react';
import { useOffscreenImage } from '../../hooks/useOffscreenImage';
import { extractR2Key, getS3Sdk } from '../PictureMapping/lib/r2Upload';
import { LayoutUnitTooltip } from '../LayoutTabParts/LayoutUnitTooltip';
import { Project, AppRole } from '../../types';
import { lazyWithRetry } from '../../lib/lazyWithRetry';

import { useLiveLayoutData } from './useLiveLayoutData';
import { useLiveLayoutGestures } from './useLiveLayoutGestures';
import { useLiveLayoutWindowEvents } from './useLiveLayoutWindowEvents';
import { LiveLayoutFloorSelector } from './LiveLayoutFloorSelector';
import { LiveLayoutTopControls } from './LiveLayoutTopControls';
import { LiveLayoutLegendBar } from './LiveLayoutLegendBar';
import { LiveLayoutAlertFilterBanner } from './LiveLayoutAlertFilterBanner';
import { LiveLayoutBottomActions } from './LiveLayoutBottomActions';
import { LiveLayoutLegendModal } from './LiveLayoutLegendModal';
import { LiveLayoutSettingsDrawer } from './LiveLayoutSettingsDrawer';
import { LiveLayoutPrintLegend } from './LiveLayoutPrintLegend';
import { LiveLayoutFocusBanner } from './LiveLayoutFocusBanner';
import { LiveLayoutCanvas } from './LiveLayoutCanvas';

const LayoutMiniGanttModal = lazyWithRetry(
  () => import('../LayoutTabParts/LayoutMiniGanttModal').then(m => ({ default: m.LayoutMiniGanttModal })),
  'LayoutMiniGanttModal'
);

interface LiveLayoutMainViewProps {
  config: any;
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
  onRefreshConfig?: () => Promise<void> | void;
}

export function LiveLayoutMainView({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
  onRefreshConfig,
}: LiveLayoutMainViewProps) {
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const isProjectModalOpen = useAppStore(state => state.isProjectModalOpen);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const isPrintPreview = useAppStore(state => state.isPrintPreview);

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

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [filterOnlyAlerts, setFilterOnlyAlerts] = useState<boolean>(false);
  const [isSmartAlertCollapsed, setIsSmartAlertCollapsed] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [isLegendStripCollapsed, setIsLegendStripCollapsed] = useState(false);
  const [selectedLegendGroupId, setSelectedLegendGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const [focusedUnitId, setFocusedUnitId] = useState<string | null>(null);
  const focusedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    visible: boolean;
    data: any;
    unitName: string;
    clientX: number;
    clientY: number;
  } | null>(null);

  const isPinnedRef = useRef(false);
  const [miniGanttProject, setMiniGanttProject] = useState<Project | null>(null);

  // 1. Data Engine Hook
  const {
    targetLoc,
    effectiveLayoutYear,
    locationVersions,
    version,
    units,
    enrichedProjects,
    tasks,
    aggregatedData,
    unitColorMap,
    activeGroups,
    totalFloorAlerts,
    focusedUnit,
    visibleUnits,
  } = useLiveLayoutData({
    config,
    storeFilter,
    locationFilter,
    yearFilter,
    selectedVersionId,
    filterOnlyAlerts,
    selectedLegendGroupId,
    searchQuery: deferredSearchQuery,
    focusedUnitId,
    stageScale: stageRef.current ? stageRef.current.scaleX() : 1,
    stagePos: stageRef.current ? { x: stageRef.current.x(), y: stageRef.current.y() } : { x: 0, y: 0 },
    dimensions: { width: 800, height: 600 },
  });

  // 2. Background Image Resolution
  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');
  const r2Config = useAppStore(state => state.r2Config);

  useEffect(() => {
    let isMounted = true;
    const url = version?.backgroundUrl || '';
    if (url.startsWith('r2://')) {
      const imgKey = extractR2Key(url);
      if (imgKey && r2Config?.accountId && r2Config?.accessKeyId && r2Config?.secretAccessKey && r2Config?.bucketName) {
        getS3Sdk().then(({ S3Client, GetObjectCommand, getSignedUrl }) => {
          const s3 = new S3Client({
            region: 'auto',
            endpoint: `https://${r2Config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: r2Config.accessKeyId,
              secretAccessKey: r2Config.secretAccessKey,
            },
          });
          const imgCommand = new GetObjectCommand({
            Bucket: r2Config.bucketName,
            Key: imgKey,
          });
          getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }).then((signedUrl) => {
            if (isMounted) setResolvedBgUrl(signedUrl);
          });
        }).catch(err => {
          console.warn('Failed to resolve signed URL for bg', err);
        });
      }
    } else {
      setResolvedBgUrl(url);
    }
    return () => { isMounted = false; };
  }, [version?.backgroundUrl, r2Config]);

  const [bgImage] = useOffscreenImage(resolvedBgUrl || version?.backgroundUrl || '', 'anonymous');

  // 3. Gestures Hook
  const {
    stageScale,
    setStageScale,
    stagePos,
    setStagePos,
    isInteractingRef,
    touchStateRef,
    pendingTouchRef,
    rafTouchIdRef,
    wheelTimeoutRef,
    pendingWheelDeltaRef,
    rafWheelIdRef,
    lastWheelPointerRef,
    stopInertia,
    fitToScreen,
    zoomIn,
    zoomOut,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    zoomAndPanToUnit,
  } = useLiveLayoutGestures({
    containerRef,
    stageRef,
    bgImage,
    version,
    units,
    dimensions: { width: 800, height: 600 },
    isProjectModalOpen,
    hasMiniGantt: Boolean(miniGanttProject),
    onClearHoverInfo: () => setHoverInfo(null),
    setFocusedUnitId,
    focusedTimerRef,
    onUnitSelected,
  });

  // 4. Window Events & Resize Hook
  const {
    tooltipRef,
    dimensions,
    isExporting,
    exportStatus,
    updateTooltipPos,
    hasStoredUnitImages,
    handleTriggerExport,
  } = useLiveLayoutWindowEvents({
    stageRef,
    containerRef,
    fitToScreen,
    setStageScale,
    setStagePos,
    targetUnitSearch,
    zoomAndPanToUnit,
    setFocusedUnitId,
    focusedUnitId,
    onClearFocus,
    isPinnedRef,
    setHoverInfo,
    isPrintPreview,
    storeFilter,
    targetLoc,
    effectiveLayoutYear,
    onRefreshConfig,
  });

  // Auto-focus when targetUnitSearch prop changes
  useEffect(() => {
    if (targetUnitSearch && units && units.length > 0) {
      const timer = setTimeout(() => {
        zoomAndPanToUnit(targetUnitSearch);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [targetUnitSearch, units, zoomAndPanToUnit]);

  // Auto-focus when search query matches exactly 1 unit
  useEffect(() => {
    if (deferredSearchQuery && deferredSearchQuery.length >= 2 && units && units.length > 0) {
      const clean = deferredSearchQuery.toLowerCase().trim();
      const matched = units.filter((u: any) =>
        String(u.id || '').toLowerCase() === clean ||
        String(u.name || '').toLowerCase().trim() === clean ||
        String(u.code || '').toLowerCase().trim() === clean
      );
      if (matched.length === 1) {
        zoomAndPanToUnit(matched[0]);
      }
    }
  }, [deferredSearchQuery, units, zoomAndPanToUnit]);

  // Fit to screen on initial floor change
  const lastFloorVersionKeyRef = useRef<string>('');
  useEffect(() => {
    const curKey = `${storeFilter}_${targetLoc}_${version?.id || ''}`;
    if (lastFloorVersionKeyRef.current !== curKey) {
      lastFloorVersionKeyRef.current = curKey;
      const timer = setTimeout(() => fitToScreen(false), 80);
      return () => clearTimeout(timer);
    }
  }, [storeFilter, targetLoc, version?.id, fitToScreen]);

  // Security Defense: Check Access
  const hasUserAccessInStoreYear = useMemo(() => {
    if (!currentUser) return false;
    const userRole = (currentUser.role as string)?.toLowerCase();
    if (userRole === 'admin' || userRole === 'manager' || userRole === 'viewer') return true;
    const targetStore = storeFilter === 'HN' ? 'HN' : 'HCM';
    const targetYear = effectiveLayoutYear;
    const hasProj = enrichedProjects.some(p => {
      const pStore = p.store || (p.code && p.code.startsWith('HN') ? 'HN' : 'HCM');
      const pYear = String(p.year || '');
      return pStore === targetStore && (pYear === targetYear || targetYear === 'all');
    });
    if (hasProj) return true;
    const hasTask = tasks.some(t => {
      const tStore = (t as any).store || (t.projectCode && t.projectCode.startsWith('HN') ? 'HN' : 'HCM');
      const tYear = String((t as any).year || '');
      return tStore === targetStore && (tYear === targetYear || targetYear === 'all');
    });
    return hasTask;
  }, [currentUser, enrichedProjects, tasks, storeFilter, effectiveLayoutYear]);

  if (!hasUserAccessInStoreYear) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center mb-4">
          <ShieldAlert className="w-8 h-8 text-amber-600 dark:text-amber-400 opacity-80" />
        </div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
          Không có quyền truy cập mặt bằng này
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
          Tài khoản của bạn ({currentUser?.name || currentUser?.email}) không được phân công quản lý bất kỳ dự án hay công việc nào tại chi nhánh {storeFilter} - Năm {effectiveLayoutYear}.
        </p>
      </div>
    );
  }

  if (!version || !version.id) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 p-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/50 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-80" />
        </div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200 mb-1">
          Chưa có bản vẽ mặt bằng
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm text-center">
          Vui lòng chọn tầng khác hoặc vào tab Picture Mapping để tải lên sơ đồ mặt bằng cho chi nhánh này.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative select-none">
      {/* Print Legend */}
      <LiveLayoutPrintLegend />

      {/* Focus Unit Banner */}
      <LiveLayoutFocusBanner
        focusedUnit={focusedUnit}
        targetUnitSearch={targetUnitSearch}
        onExitFocus={() => {
          setFocusedUnitId(null);
          if (onClearFocus) onClearFocus();
          fitToScreen(true);
        }}
      />

      {/* Floor & Version Selector */}
      <LiveLayoutFloorSelector
        locationFilter={locationFilter}
        targetLoc={targetLoc}
        locationVersions={locationVersions}
        version={version}
        selectedVersionId={selectedVersionId}
        setSelectedVersionId={setSelectedVersionId}
      />

      {/* Top Controls: Includes Search, Refresh, Alerts, Export, Palette (Item 5), Settings & Zoom */}
      <LiveLayoutTopControls
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onRefreshConfig={onRefreshConfig}
        loading={false}
        totalFloorAlerts={totalFloorAlerts}
        filterOnlyAlerts={filterOnlyAlerts}
        setFilterOnlyAlerts={setFilterOnlyAlerts}
        canWrite={canWrite}
        isExporting={isExporting}
        exportStatus={exportStatus}
        onTriggerExport={handleTriggerExport}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        onOpenLegendModal={() => setShowLegendModal(true)}
        layoutTooltipVisibility={layoutTooltipVisibility}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFitToScreen={() => fitToScreen(true)}
      />

      {/* Legend Bar */}
      <LiveLayoutLegendBar
        activeGroups={activeGroups}
        selectedLegendGroupId={selectedLegendGroupId}
        setSelectedLegendGroupId={setSelectedLegendGroupId}
        isLegendStripCollapsed={isLegendStripCollapsed}
        setIsLegendStripCollapsed={setIsLegendStripCollapsed}
        onOpenLegendModal={() => setShowLegendModal(true)}
      />

      {/* Alert Filter Banner */}
      <LiveLayoutAlertFilterBanner
        filterOnlyAlerts={filterOnlyAlerts}
        totalFloorAlerts={totalFloorAlerts}
        onClearFilter={() => setFilterOnlyAlerts(false)}
      />

      {/* Bottom Actions */}
      <LiveLayoutBottomActions
        onOpenLegendModal={() => setShowLegendModal(true)}
        showMenu={showMenu}
        setShowMenu={setShowMenu}
        onFitToScreen={() => fitToScreen(true)}
      />

      {/* Legend Modal */}
      <LiveLayoutLegendModal
        isOpen={showLegendModal}
        onClose={() => setShowLegendModal(false)}
        activeGroups={activeGroups}
        selectedLegendGroupId={selectedLegendGroupId}
        setSelectedLegendGroupId={setSelectedLegendGroupId}
        units={units}
        unitColorMap={unitColorMap}
      />

      {/* Settings / Edit Mode Drawer (Item 4) */}
      <LiveLayoutSettingsDrawer
        isOpen={showMenu}
        onClose={() => setShowMenu(false)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isSmartAlertCollapsed={isSmartAlertCollapsed}
        setIsSmartAlertCollapsed={setIsSmartAlertCollapsed}
      />

      {/* Hover/Pinned Tooltip */}
      {hoverInfo && hoverInfo.visible && (
        <LayoutUnitTooltip
          hoverInfo={hoverInfo}
          tooltipRef={tooltipRef}
          containerRef={containerRef}
          onClose={() => {
            isPinnedRef.current = false;
            setHoverInfo(null);
          }}
          onEditProject={(proj, _isReadOnly, tab = 'details') => {
            setEditingProject(proj);
            setModalInitialTab(tab);
            setIsProjectModalOpen(true);
          }}
          onOpenMiniGantt={(proj) => {
            setMiniGanttProject(proj);
          }}
          canWrite={canWrite}
          storeFilter={storeFilter}
        />
      )}

      {/* Mini Gantt Modal */}
      {Boolean(miniGanttProject) && (
        <LayoutMiniGanttModal
          isOpen={Boolean(miniGanttProject)}
          onClose={() => setMiniGanttProject(null)}
          project={miniGanttProject}
          canWrite={canWrite}
        />
      )}

      {/* Canvas Viewport */}
      <LiveLayoutCanvas
        containerRef={containerRef}
        stageRef={stageRef}
        dimensions={dimensions}
        bgImage={bgImage}
        version={version}
        visibleUnits={visibleUnits}
        focusedUnit={focusedUnit}
        focusedUnitId={focusedUnitId}
        stageScale={stageScale}
        stagePos={stagePos}
        selectedLegendGroupId={selectedLegendGroupId}
        layoutTooltipVisibility={layoutTooltipVisibility}
        aggregatedData={aggregatedData}
        hasStoredUnitImages={hasStoredUnitImages}
        isPinnedRef={isPinnedRef}
        isInteractingRef={isInteractingRef}
        miniGanttProject={miniGanttProject}
        isProjectModalOpen={isProjectModalOpen}
        setHoverInfo={setHoverInfo}
        updateTooltipPos={updateTooltipPos}
        handleDragStart={handleDragStart}
        handleDragMove={handleDragMove}
        handleDragEnd={handleDragEnd}
        touchStateRef={touchStateRef}
        pendingTouchRef={pendingTouchRef}
        rafTouchIdRef={rafTouchIdRef}
        wheelTimeoutRef={wheelTimeoutRef}
        pendingWheelDeltaRef={pendingWheelDeltaRef}
        rafWheelIdRef={rafWheelIdRef}
        lastWheelPointerRef={lastWheelPointerRef}
        stopInertia={stopInertia}
        fitToScreen={fitToScreen}
        setStageScale={setStageScale}
        setStagePos={setStagePos}
      />
    </div>
  );
}
