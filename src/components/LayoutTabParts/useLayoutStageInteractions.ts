import { useState, useEffect, useRef, useCallback } from 'react';
import Konva from 'konva';
import { useAppStore } from '../../store/useAppStore';
import { HoverInfo } from './layoutViewerTypes';
import { useLayoutGestures } from './useLayoutGestures';
import { 
  calculateUnitFocalPoint, 
  computeTooltipPosition, 
  exportStageHighRes, 
  triggerStageDownload, 
  findUnitInOtherFloorVersions,
  hasAggregatedDataChanged
} from './layoutStageUtils';

interface UseLayoutStageInteractionsProps {
  bgImage: any;
  version: any;
  units: any[];
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
  availableStoreVersions: any[];
  selectedVersionId: string | null;
  setSelectedVersionId: (id: string | null) => void;
  storeFilter: string;
  targetLoc: string;
  isProjectModalOpen: boolean;
  miniGanttProject: any;
}

export function useLayoutStageInteractions({
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
}: UseLayoutStageInteractionsProps) {
  const isPrintPreview = useAppStore(state => state.isPrintPreview);

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const isPinnedRef = useRef(false);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [focusedUnitId, setFocusedUnitId] = useState<string | null>(null);
  const focusedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHandledSearchRef = useRef<string | null>(null);

  // Mutable refs for data aggregates to eliminate circular dependencies and prevent infinite loops
  const aggregatedDataRef = useRef<Record<string, any>>({});
  const restrictedProjectCodesRef = useRef<Set<string>>(new Set());

  const updateAggregatedData = useCallback((data: Record<string, any>, restricted: Set<string>) => {
    aggregatedDataRef.current = data;
    restrictedProjectCodesRef.current = restricted;
  }, []);

  // Kinetic inertia, gestures and zoom engine
  const gestures = useLayoutGestures({
    stageRef,
    containerRef,
    dimensions,
    stageScale,
    setStageScale,
    stagePos,
    setStagePos,
    bgImage,
    version,
    units,
    setHoverInfo,
  });

  const {
    fitToScreen,
    stopInertia,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleZoomIn,
    handleZoomOut,
  } = gestures;

  // Export handlers
  const handleExport = useCallback(() => triggerStageDownload(stageRef.current), []);

  // Global window references for export
  useEffect(() => {
    (window as any).__taka_layout_stage = stageRef.current;
    (window as any).__taka_layout_export = (dpi: number = 200) => {
      return exportStageHighRes(stageRef.current, bgImage, version, units, dpi);
    };

    return () => {
      if ((window as any).__taka_layout_stage === stageRef.current) {
        (window as any).__taka_layout_stage = null;
        (window as any).__taka_layout_export = null;
      }
    };
  }, [bgImage, version, units]);

  const fitToScreenRef = useRef(fitToScreen);
  fitToScreenRef.current = fitToScreen;

  // Trigger fitToScreen when background image or partition version changes
  const lastFloorVersionKeyRef = useRef<string>('');
  useEffect(() => {
    // If version has a background URL, wait for bgImage to load before auto-fitting to prevent jumping
    if (version?.backgroundUrl && !bgImage) {
      return;
    }
    const currentKey = `${storeFilter}_${targetLoc}_${version?.id || ''}`;
    const floorChanged = lastFloorVersionKeyRef.current !== currentKey;
    if (floorChanged) {
      lastFloorVersionKeyRef.current = currentKey;
      if (!targetUnitSearch && !focusedUnitId && !lastHandledSearchRef.current) {
        fitToScreenRef.current();
      }
    }
  }, [storeFilter, targetLoc, version?.id, version?.backgroundUrl, bgImage, targetUnitSearch, focusedUnitId]);

  // Zoom & Pan smoothly to target unit and highlight it
  const zoomAndPanToUnit = useCallback((targetUnitOrName: string | any) => {
    const focalPoint = calculateUnitFocalPoint(
      targetUnitOrName,
      units,
      aggregatedDataRef.current,
      restrictedProjectCodesRef.current
    );
    if (!focalPoint) return false;

    const { targetUnit, cx, cy } = focalPoint;

    const containerW = containerRef.current?.offsetWidth || dimensions.width || 800;
    const containerH = containerRef.current?.offsetHeight || dimensions.height || 600;
    const isDesktop = containerW >= 768;

    const targetScale = 0.7;

    const targetScreenCenterX = isDesktop ? containerW * 0.38 : containerW * 0.50;
    const targetScreenCenterY = isDesktop ? containerH * 0.50 : containerH * 0.35;

    const posX = targetScreenCenterX - cx * targetScale;
    const posY = targetScreenCenterY - cy * targetScale;
    const newPos = { x: posX, y: posY };

    const stage = stageRef.current;
    if (stage) {
      stage.to({
        scaleX: targetScale,
        scaleY: targetScale,
        x: posX,
        y: posY,
        duration: 0.35,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          setStageScale(targetScale);
          setStagePos(newPos);
        }
      });
    } else {
      setStageScale(targetScale);
      setStagePos(newPos);
    }

    setFocusedUnitId(targetUnit.id);
    if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);

    isPinnedRef.current = false;
    setHoverInfo(null);

    onUnitSelected?.(targetUnit);
    return true;
  }, [units, dimensions.width, dimensions.height, onUnitSelected]);

  // Sync with incoming targetUnitSearch prop from toolbar
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim()) {
      const q = String(targetUnitSearch).trim();
      if (lastHandledSearchRef.current === q) {
        return;
      }

      const success = zoomAndPanToUnit(q);
      if (success) {
        lastHandledSearchRef.current = q;
      } else {
        const foundInOther = findUnitInOtherFloorVersions(q, availableStoreVersions);
        if (foundInOther) {
          lastHandledSearchRef.current = q;
          if (foundInOther.location) {
            const floorLoc = String(foundInOther.location).trim().toUpperCase();
            if (useAppStore.getState().globalLocationFilter[0] !== floorLoc) {
              useAppStore.getState().setGlobalLocationFilter([floorLoc]);
            }
          }
          if (foundInOther.id !== selectedVersionId) {
            setSelectedVersionId(foundInOther.id);
          }
        }
      }
    } else if (targetUnitSearch === null || targetUnitSearch === '') {
      // Guard against infinite loop: ONLY reset if there was an active search or focused unit
      if (lastHandledSearchRef.current !== null || focusedUnitId !== null) {
        lastHandledSearchRef.current = null;
        setFocusedUnitId(null);
        setHoverInfo(null);
        if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
        fitToScreenRef.current(true);
      }
    }
  }, [targetUnitSearch, zoomAndPanToUnit, availableStoreVersions, selectedVersionId, focusedUnitId, setSelectedVersionId]);

  // Keyboard listener: Escape key to exit zoom focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (focusedUnitId || targetUnitSearch)) {
        lastHandledSearchRef.current = null;
        setFocusedUnitId(null);
        setHoverInfo(null);
        if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
        fitToScreen(true);
        onClearFocus?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedUnitId, targetUnitSearch, fitToScreen, onClearFocus]);

  // If units reload after floor switch and targetUnitSearch is waiting to be zoomed, zoom once cleanly
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim() && units.length > 0) {
      const q = String(targetUnitSearch).trim();
      if (lastHandledSearchRef.current !== q) {
        const success = zoomAndPanToUnit(q);
        if (success) {
          lastHandledSearchRef.current = q;
        }
      }
    }
  }, [units, targetUnitSearch, zoomAndPanToUnit]);

  // ResizeObserver for canvas container: safely only update state when width/height actually changes
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const newW = containerRef.current.offsetWidth || 800;
      const newH = containerRef.current.offsetHeight || 600;
      setDimensions(prev => (prev.width === newW && prev.height === newH) ? prev : { width: newW, height: newH });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(updateSize);
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, []);

  // When print preview activates or deactivates, automatically fit floor plan to screen
  const prevPrintPreviewRef = useRef(isPrintPreview);
  useEffect(() => {
    if (prevPrintPreviewRef.current !== isPrintPreview) {
      prevPrintPreviewRef.current = isPrintPreview;
      const timer = setTimeout(() => {
        fitToScreen(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isPrintPreview, fitToScreen]);

  // Handle browser native print & custom export events
  useEffect(() => {
    const handleBeforePrint = () => fitToScreenRef.current(false);
    const handleExportPngEvent = () => handleExport();
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('export-png', handleExportPngEvent);
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('export-png', handleExportPngEvent);
    };
  }, [handleExport]);

  // Wake-up redraw handler after tab cold freeze or background sleep
  useEffect(() => {
    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        stageRef.current?.batchDraw();
      }
    };
    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    return () => {
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
    };
  }, []);

  // Handle position tooltip directly via DOM with RAF throttle and 2D collision clamping
  const rafTooltipIdRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (rafTooltipIdRef.current !== null) {
        cancelAnimationFrame(rafTooltipIdRef.current);
      }
    };
  }, []);

  const updateTooltipPos = useCallback((clientX: number, clientY: number) => {
    if (rafTooltipIdRef.current !== null) {
      cancelAnimationFrame(rafTooltipIdRef.current);
    }
    rafTooltipIdRef.current = requestAnimationFrame(() => {
      rafTooltipIdRef.current = null;
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      const tooltipWidth = rect.width > 0 ? rect.width : 340;
      const tooltipHeight = rect.height > 0 ? rect.height : 280;

      const viewportWidth = window.innerWidth;
      const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
      const viewportHeight = visualVp ? visualVp.height : window.innerHeight;

      const styleObj = computeTooltipPosition(
        clientX,
        clientY,
        tooltipWidth,
        tooltipHeight,
        viewportWidth,
        viewportHeight
      );

      Object.assign(el.style, styleObj);
    });
  }, []);

  // Re-anchor tooltip position when ProjectModal closes if it was kept open from comment button
  const prevIsProjectModalOpenRef = useRef(isProjectModalOpen);
  useEffect(() => {
    if (prevIsProjectModalOpenRef.current && !isProjectModalOpen) {
      if (hoverInfo?.visible && hoverInfo.clientX != null && hoverInfo.clientY != null) {
        updateTooltipPos(hoverInfo.clientX, hoverInfo.clientY);
      }
    }
    prevIsProjectModalOpenRef.current = isProjectModalOpen;
  }, [isProjectModalOpen, hoverInfo?.visible, hoverInfo?.clientX, hoverInfo?.clientY, updateTooltipPos]);

  // Keep hoverInfo.data in sync with latest aggregatedData if projects update
  useEffect(() => {
    if (hoverInfo?.visible && hoverInfo.unitName) {
      const uName = hoverInfo.unitName.toLowerCase();
      const latestData = aggregatedDataRef.current[uName];
      if (latestData && latestData !== hoverInfo.data) {
        if (hasAggregatedDataChanged(hoverInfo.data, latestData)) {
          setHoverInfo(current => current ? { ...current, data: latestData } : null);
        }
      }
    }
  }, [hoverInfo?.visible, hoverInfo?.unitName, hoverInfo?.data]);

  const handleMouseEnterUnit = useCallback((unit: any, e: any) => {
    if (gestures.isInteractingRef.current || isPinnedRef.current || Boolean(miniGanttProject)) return;
    try {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = 'pointer';
      const uName = (unit.name || '').toLowerCase();
      const aggregatedData = aggregatedDataRef.current;
      setHoverInfo({
        visible: true,
        data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
        unitName: unit.name || 'Unknown',
        clientX: e.evt.clientX,
        clientY: e.evt.clientY
      });
      setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
    } catch (err) {
      console.error("Defensive Check: Error onMouseEnter unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.isInteractingRef, miniGanttProject, updateTooltipPos]);

  const handleMouseMoveUnit = useCallback((_unit: any, e: any) => {
    if (gestures.isInteractingRef.current || isPinnedRef.current || Boolean(miniGanttProject)) return;
    try {
      updateTooltipPos(e.evt.clientX, e.evt.clientY);
    } catch (err) {
      console.error("Defensive Check: Error onMouseMove unit in LiveLayoutViewer:", err);
    }
  }, [gestures.isInteractingRef, miniGanttProject, updateTooltipPos]);

  const handleMouseLeaveUnit = useCallback((unit: any, e: any) => {
    try {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = 'grab';
      if (isPinnedRef.current || Boolean(miniGanttProject)) return;
      setHoverInfo(null);
    } catch (err) {
      console.error("Defensive Check: Error onMouseLeave unit in LiveLayoutViewer:", err, unit);
    }
  }, [miniGanttProject]);

  const pinAndShowTooltip = useCallback((unit: any, clientX: number, clientY: number) => {
    isPinnedRef.current = true;
    const uName = (unit?.name || '').toLowerCase();
    const agg = aggregatedDataRef.current;
    setHoverInfo({
      visible: true,
      data: (uName && agg[uName]) ? agg[uName] : {},
      unitName: unit?.name || 'Unknown',
      clientX,
      clientY
    });
    setTimeout(() => updateTooltipPos(clientX, clientY), 0);
  }, [updateTooltipPos]);

  const handleClickUnit = useCallback((unit: any, e: any) => {
    if (gestures.isInteractingRef.current || Boolean(miniGanttProject)) return;
    try {
      pinAndShowTooltip(unit, e.evt.clientX, e.evt.clientY);
    } catch (err) {
      console.error("Defensive Check: Error onClick unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.isInteractingRef, miniGanttProject, pinAndShowTooltip]);

  const handleTapUnit = useCallback((unit: any, e: any) => {
    if (gestures.isInteractingRef.current || Boolean(miniGanttProject)) return;
    try {
      const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
      const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
      pinAndShowTooltip(unit, clientX, clientY);
    } catch (err) {
      console.error("Defensive Check: Error onTap unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.isInteractingRef, miniGanttProject, pinAndShowTooltip]);

  return {
    stageRef,
    containerRef,
    tooltipRef,
    dimensions,
    hoverInfo,
    setHoverInfo,
    isPinnedRef,
    stageScale,
    setStageScale,
    stagePos,
    setStagePos,
    focusedUnitId,
    setFocusedUnitId,
    focusedTimerRef,
    lastHandledSearchRef,
    touchStateRef: gestures.touchStateRef,
    pendingTouchRef: gestures.pendingTouchRef,
    rafTouchIdRef: gestures.rafTouchIdRef,
    isInteractingRef: gestures.isInteractingRef,
    wheelTimeoutRef: gestures.wheelTimeoutRef,
    pendingWheelDeltaRef: gestures.pendingWheelDeltaRef,
    rafWheelIdRef: gestures.rafWheelIdRef,
    lastWheelPointerRef: gestures.lastWheelPointerRef,
    dragVelocityTrackerRef: gestures.dragVelocityTrackerRef,
    rafInertiaIdRef: gestures.rafInertiaIdRef,
    stopInertia,
    fitToScreen,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleZoomIn,
    handleZoomOut,
    zoomAndPanToUnit,
    handleMouseEnterUnit,
    handleMouseMoveUnit,
    handleMouseLeaveUnit,
    handleClickUnit,
    handleTapUnit,
    handleExport,
    updateTooltipPos,
    updateAggregatedData,
  };
}
