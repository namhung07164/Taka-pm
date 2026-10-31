import React, { useCallback, useEffect, useRef, useState } from 'react';
import Konva from 'konva';
import { useAppStore } from '../../store/useAppStore';
import { HoverInfo } from './layoutViewerTypes';
import { useLayoutGestures } from './useLayoutGestures';
import { useLayoutWindowListeners } from './useLayoutWindowListeners';
import { 
  calculateUnitFocalPoint, 
  computeTooltipPosition, 
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

    const targetScale = 0.7;

    // Center unit perfectly at exact 50% width and 50% height of viewport
    const targetScreenCenterX = containerW * 0.50;
    const targetScreenCenterY = containerH * 0.50;

    const posX = targetScreenCenterX - cx * targetScale;
    const posY = targetScreenCenterY - cy * targetScale;
    const newPos = { x: posX, y: posY };

    setStageScale(targetScale);
    setStagePos(newPos);

    const stage = stageRef.current;
    if (stage) {
      stage.scale({ x: targetScale, y: targetScale });
      stage.position(newPos);
      stage.batchDraw();
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
    }

    setFocusedUnitId(targetUnit.id);
    if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);

    isPinnedRef.current = false;
    setHoverInfo(null);

    return true;
  }, [units, dimensions.width, dimensions.height]);

  const updateAggregatedData = useCallback((data: Record<string, any>, restricted: Set<string>) => {
    aggregatedDataRef.current = data;
    restrictedProjectCodesRef.current = restricted;

    // If there is an active search query waiting to be focused and not yet focused, retry zooming now that aggregates are available
    if (targetUnitSearch && String(targetUnitSearch).trim() && !focusedUnitId) {
      const q = String(targetUnitSearch).trim();
      const success = zoomAndPanToUnit(q);
      if (success) {
        lastHandledSearchRef.current = q;
      }
    }
  }, [targetUnitSearch, focusedUnitId, zoomAndPanToUnit]);

  // Kinetic inertia, gestures and zoom engine
  const gestures = useLayoutGestures({
    stageRef,
    containerRef,
    dimensions,
    setDimensions,
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

  const fitToScreenRef = useRef(fitToScreen);
  fitToScreenRef.current = fitToScreen;

  // Trigger fitToScreen when background image or partition version changes
  const lastFloorVersionKeyRef = useRef<string>('');
  useEffect(() => {
    // If version has a background URL, wait for bgImage to load before auto-fitting to prevent jumping
    if (version?.backgroundUrl && !bgImage) {
      return;
    }
    const currentKey = `${storeFilter}_${targetLoc}_${version?.year || ''}_${version?.id || ''}`;
    const floorChanged = lastFloorVersionKeyRef.current !== currentKey;
    if (floorChanged) {
      lastFloorVersionKeyRef.current = currentKey;
      if (!targetUnitSearch && !focusedUnitId && !lastHandledSearchRef.current) {
        fitToScreenRef.current();
      }
    }
  }, [storeFilter, targetLoc, version?.year, version?.id, version?.backgroundUrl, bgImage, targetUnitSearch, focusedUnitId]);

  // Sync with incoming targetUnitSearch prop from toolbar / Quick Navigation
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim()) {
      const q = String(targetUnitSearch).trim();
      
      const tryZoom = () => {
        const success = zoomAndPanToUnit(q);
        if (success) {
          lastHandledSearchRef.current = q;
        } else {
          const foundInOther = findUnitInOtherFloorVersions(q, availableStoreVersions);
          if (foundInOther) {
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
      };

      tryZoom();
      const timers = [60, 220, 500].map(ms => setTimeout(tryZoom, ms));
      return () => timers.forEach(clearTimeout);
    } else if (targetUnitSearch === null || targetUnitSearch === '') {
      if (lastHandledSearchRef.current !== null || focusedUnitId !== null) {
        lastHandledSearchRef.current = null;
        setFocusedUnitId(null);
        setHoverInfo(null);
        if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
        fitToScreenRef.current(true);
      }
    }
  }, [targetUnitSearch, zoomAndPanToUnit, availableStoreVersions, selectedVersionId, setSelectedVersionId]);

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

  // If units reload after floor switch and targetUnitSearch is waiting to be zoomed, zoom cleanly
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim() && units.length > 0) {
      const q = String(targetUnitSearch).trim();
      if (lastHandledSearchRef.current !== q || !focusedUnitId) {
        const success = zoomAndPanToUnit(q);
        if (success) {
          lastHandledSearchRef.current = q;
        }
      }
    }
  }, [units, targetUnitSearch, zoomAndPanToUnit, focusedUnitId]);

  const activeTab = useAppStore(state => state.activeTab);
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-close tooltip, unpin, and cleanup timers when navigating away or unmounting
  useEffect(() => {
    const cleanup = () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      setHoverInfo(null);
      isPinnedRef.current = false;
      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
    };
    if (activeTab !== 'layout') cleanup();
    return cleanup;
  }, [activeTab]);

  // Window listeners: resize observer, print preview, export, visibility wake-up
  useLayoutWindowListeners({
    isPrintPreview,
    fitToScreen,
    fitToScreenRef,
    handleExport,
    stageRef,
    containerRef,
    setDimensions,
    versionId: version?.id,
    activeTab,
    focusedUnitId,
    bgImage,
    version,
    units,
  });

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
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!gestures.canTriggerUnitInteraction() || (e?.evt && e.evt.buttons > 0) || isPinnedRef.current || Boolean(miniGanttProject) || Boolean(isProjectModalOpen)) return;
    try {
      const container = e.target.getStage()?.container();
      if (container) container.style.cursor = 'pointer';
      const clientX = e.evt.clientX;
      const clientY = e.evt.clientY;
      const uName = (unit.name || '').toLowerCase();

      // Intentional hover debounce (120ms): prevents flashing tooltips when zooming, panning, or sweeping across units
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        if (!gestures.canTriggerUnitInteraction() || isPinnedRef.current || Boolean(miniGanttProject) || Boolean(isProjectModalOpen)) return;
        const aggregatedData = aggregatedDataRef.current;
        setHoverInfo({
          visible: true,
          data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
          unitName: unit.name || 'Unknown',
          clientX,
          clientY
        });
        setTimeout(() => updateTooltipPos(clientX, clientY), 0);
      }, 120);
    } catch (err) {
      console.error("Defensive Check: Error onMouseEnter unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.canTriggerUnitInteraction, miniGanttProject, isProjectModalOpen, updateTooltipPos]);

  const handleMouseMoveUnit = useCallback((_unit: any, e: any) => {
    if (!gestures.canTriggerUnitInteraction() || (e?.evt && e.evt.buttons > 0) || isPinnedRef.current || Boolean(miniGanttProject) || Boolean(isProjectModalOpen)) return;
    try {
      updateTooltipPos(e.evt.clientX, e.evt.clientY);
    } catch (err) {
      console.error("Defensive Check: Error onMouseMove unit in LiveLayoutViewer:", err);
    }
  }, [gestures.canTriggerUnitInteraction, miniGanttProject, isProjectModalOpen, updateTooltipPos]);

  const handleMouseLeaveUnit = useCallback((unit: any, e: any) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    try {
      const container = e.target.getStage()?.container();
      if (container && !gestures.isInteractingRef.current) container.style.cursor = 'grab';
      if (gestures.isInteractingRef.current || isPinnedRef.current || Boolean(miniGanttProject) || Boolean(isProjectModalOpen)) return;
      setHoverInfo(current => (current ? null : current));
    } catch (err) {
      console.error("Defensive Check: Error onMouseLeave unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.isInteractingRef, miniGanttProject, isProjectModalOpen]);

  const pinAndShowTooltip = useCallback((unit: any, clientX: number, clientY: number, quickImageMode = false) => {
    isPinnedRef.current = true;
    const uName = (unit?.name || '').toLowerCase();
    const agg = aggregatedDataRef.current;
    setHoverInfo({
      visible: true,
      data: (uName && agg[uName]) ? agg[uName] : {},
      unitName: unit?.name || 'Unknown',
      clientX,
      clientY,
      quickImageMode,
    });
    setTimeout(() => updateTooltipPos(clientX, clientY), 0);
  }, [updateTooltipPos]);

  const handleClickUnit = useCallback((unit: any, e: any, quickImageMode = false) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!gestures.canTriggerUnitInteraction() || Boolean(miniGanttProject)) return;
    try {
      pinAndShowTooltip(unit, e.evt.clientX, e.evt.clientY, quickImageMode);
      onUnitSelected?.(unit);
    } catch (err) {
      console.error("Defensive Check: Error onClick unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.canTriggerUnitInteraction, miniGanttProject, pinAndShowTooltip, onUnitSelected]);

  const handleTapUnit = useCallback((unit: any, e: any, quickImageMode = false) => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    if (!gestures.canTriggerUnitInteraction() || Boolean(miniGanttProject)) return;
    try {
      const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
      const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
      pinAndShowTooltip(unit, clientX, clientY, quickImageMode);
      onUnitSelected?.(unit);
    } catch (err) {
      console.error("Defensive Check: Error onTap unit in LiveLayoutViewer:", err, unit);
    }
  }, [gestures.canTriggerUnitInteraction, miniGanttProject, pinAndShowTooltip, onUnitSelected]);

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
    isPinchingRef: gestures.isPinchingRef,
    lastPinchEndTimeRef: gestures.lastPinchEndTimeRef,
    lastWheelTimeRef: gestures.lastWheelTimeRef,
    lastZoomTimeRef: gestures.lastZoomTimeRef,
    canTriggerUnitInteraction: gestures.canTriggerUnitInteraction,
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
