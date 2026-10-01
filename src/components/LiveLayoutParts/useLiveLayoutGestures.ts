import React, { useState, useRef, useEffect, useCallback } from 'react';
import Konva from 'konva';

interface UseLiveLayoutGesturesParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<any>;
  bgImage: CanvasImageSource | null;
  version: any;
  units: any[];
  dimensions: { width: number; height: number };
  isProjectModalOpen: boolean;
  hasMiniGantt: boolean;
  onClearHoverInfo: () => void;
  setFocusedUnitId: (id: string | null) => void;
  focusedTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  onUnitSelected?: (unit: any) => void;
}

export function useLiveLayoutGestures({
  containerRef,
  stageRef,
  bgImage,
  version,
  units,
  dimensions,
  isProjectModalOpen: _isProjectModalOpen,
  hasMiniGantt: _hasMiniGantt,
  onClearHoverInfo,
  setFocusedUnitId,
  focusedTimerRef,
  onUnitSelected,
}: UseLiveLayoutGesturesParams) {
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  const touchStateRef = useRef<{
    lastDist: number;
    lastCenter: { x: number; y: number } | null;
    lastTap: number;
  }>({
    lastDist: 0,
    lastCenter: null,
    lastTap: 0,
  });

  const isInteractingRef = useRef(false);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const rafWheelIdRef = useRef<number | null>(null);
  const rafTouchIdRef = useRef<number | null>(null);
  const pendingTouchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Smooth kinetic inertia momentum panning refs
  const dragVelocityTrackerRef = useRef<{
    history: Array<{ x: number; y: number; time: number }>;
  }>({
    history: [],
  });
  const rafInertiaIdRef = useRef<number | null>(null);

  const stopInertia = useCallback(() => {
    if (rafInertiaIdRef.current !== null) {
      cancelAnimationFrame(rafInertiaIdRef.current);
      rafInertiaIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopInertia();
      if (rafTouchIdRef.current !== null) cancelAnimationFrame(rafTouchIdRef.current);
      if (rafWheelIdRef.current !== null) cancelAnimationFrame(rafWheelIdRef.current);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [stopInertia]);

  // Fit to screen: Zooms so the ENTIRE background image & all units are 100% visible in view
  const fitToScreen = useCallback((animated: boolean = false) => {
    const stage = stageRef.current;
    if (!stage) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (bgImage) {
      const bgW = (bgImage as any).naturalWidth || (bgImage as any).width || 1200;
      const bgH = (bgImage as any).naturalHeight || (bgImage as any).height || 800;
      const posX = version?.imagePos?.x || 0;
      const posY = version?.imagePos?.y || 0;
      const scale = version?.imageScale || 1;
      minX = posX;
      minY = posY;
      maxX = posX + bgW * scale;
      maxY = posY + bgH * scale;
    }

    if (units && units.length > 0) {
      units.forEach((u: any) => {
        let uMinX = u.x || 0;
        let uMinY = u.y || 0;
        let uMaxX = uMinX + (u.width || u.textWidth || 60);
        let uMaxY = uMinY + (u.height || u.textHeight || 30);

        if (u.type === 'circle') {
          const r = u.radius || 20;
          uMinX = (u.x || 0) - r;
          uMaxX = (u.x || 0) + r;
          uMinY = (u.y || 0) - r;
          uMaxY = (u.y || 0) + r;
        } else if (u.type === 'polygon' && Array.isArray(u.points)) {
          for (let i = 0; i < u.points.length; i += 2) {
            const px = u.points[i];
            const py = u.points[i + 1];
            if (px < uMinX) uMinX = px;
            if (px > uMaxX) uMaxX = px;
            if (py < uMinY) uMinY = py;
            if (py > uMaxY) uMaxY = py;
          }
        }
        if (uMinX < minX) minX = uMinX;
        if (uMinY < minY) minY = uMinY;
        if (uMaxX > maxX) maxX = uMaxX;
        if (uMaxY > maxY) maxY = uMaxY;
      });
    }

    if (minX === Infinity || maxX === -Infinity) {
      minX = 0; minY = 0; maxX = 1200; maxY = 800;
    }

    const contentW = Math.max(maxX - minX, 100);
    const contentH = Math.max(maxY - minY, 100);
    const containerW = dimensions.width || (containerRef.current ? containerRef.current.clientWidth : 800);
    const containerH = dimensions.height || (containerRef.current ? containerRef.current.clientHeight : 600);

    const padding = 28;
    const scaleX = (containerW - padding * 2) / contentW;
    const scaleY = (containerH - padding * 2) / contentH;
    const newScale = Math.min(scaleX, scaleY, 2.5);

    const newX = (containerW - contentW * newScale) / 2 - minX * newScale;
    const newY = (containerH - contentH * newScale) / 2 - minY * newScale;

    if (animated) {
      new Konva.Tween({
        node: stage,
        duration: 0.35,
        easing: Konva.Easings.EaseInOut,
        scaleX: newScale,
        scaleY: newScale,
        x: newX,
        y: newY,
        onFinish: () => {
          setStageScale(newScale);
          setStagePos({ x: newX, y: newY });
        }
      }).play();
    } else {
      stage.scale({ x: newScale, y: newScale });
      stage.position({ x: newX, y: newY });
      stage.batchDraw();
      setStageScale(newScale);
      setStagePos({ x: newX, y: newY });
    }
  }, [bgImage, version, units, dimensions, containerRef, stageRef]);

  // Inertia and drag listeners
  const handleDragStart = useCallback(() => {
    stopInertia();
    isInteractingRef.current = true;
    onClearHoverInfo();
    const stage = stageRef.current;
    if (stage) {
      dragVelocityTrackerRef.current.history = [{
        x: stage.x(),
        y: stage.y(),
        time: performance.now(),
      }];
    }
  }, [stopInertia, onClearHoverInfo, stageRef]);

  const handleDragMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const now = performance.now();
    const tracker = dragVelocityTrackerRef.current;
    tracker.history.push({ x: stage.x(), y: stage.y(), time: now });
    if (tracker.history.length > 5) {
      tracker.history.shift();
    }
  }, [stageRef]);

  const handleDragEnd = useCallback((e: any) => {
    const stage = stageRef.current;
    if (!stage) {
      isInteractingRef.current = false;
      return;
    }

    const currentX = e.target.x();
    const currentY = e.target.y();
    setStagePos({ x: currentX, y: currentY });

    const tracker = dragVelocityTrackerRef.current;
    const history = tracker.history;
    if (history.length < 2) {
      isInteractingRef.current = false;
      return;
    }

    const latest = history[history.length - 1];
    const earliest = history[0];
    const dt = latest.time - earliest.time;

    if (dt <= 0 || dt > 150) {
      isInteractingRef.current = false;
      return;
    }

    const vx = ((latest.x - earliest.x) / dt) * 1000;
    const vy = ((latest.y - earliest.y) / dt) * 1000;
    const speed = Math.hypot(vx, vy);

    if (speed < 120) {
      isInteractingRef.current = false;
      return;
    }

    const clampedSpeed = Math.min(speed, 3500);
    const speedScale = clampedSpeed / speed;
    let velX = vx * speedScale;
    let velY = vy * speedScale;

    let lastTime = performance.now();
    const friction = 0.92;

    const step = (time: number) => {
      const deltaT = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      velX *= Math.pow(friction, deltaT * 60);
      velY *= Math.pow(friction, deltaT * 60);

      const curStage = stageRef.current;
      if (!curStage) {
        isInteractingRef.current = false;
        return;
      }

      const nextX = curStage.x() + velX * deltaT;
      const nextY = curStage.y() + velY * deltaT;

      curStage.position({ x: nextX, y: nextY });
      curStage.batchDraw();

      if (Math.hypot(velX, velY) > 25) {
        rafInertiaIdRef.current = requestAnimationFrame(step);
      } else {
        rafInertiaIdRef.current = null;
        setStagePos({ x: curStage.x(), y: curStage.y() });
        isInteractingRef.current = false;
      }
    };

    stopInertia();
    rafInertiaIdRef.current = requestAnimationFrame(step);
  }, [stopInertia, stageRef]);

  // Zoom In / Out
  const zoomIn = useCallback(() => {
    const currentStage = stageRef.current;
    if (!currentStage) return;
    const oldScale = currentStage.scaleX();
    const newScale = Math.min(oldScale * 1.25, 20);
    const stageBox = containerRef.current?.getBoundingClientRect();
    if (stageBox) {
      const centerX = stageBox.width / 2;
      const centerY = stageBox.height / 2;
      const worldPoint = {
        x: (centerX - currentStage.x()) / oldScale,
        y: (centerY - currentStage.y()) / oldScale,
      };
      const newPos = {
        x: centerX - worldPoint.x * newScale,
        y: centerY - worldPoint.y * newScale,
      };
      currentStage.scale({ x: newScale, y: newScale });
      currentStage.position(newPos);
      currentStage.batchDraw();
      setStageScale(newScale);
      setStagePos(newPos);
    }
  }, [stageRef, containerRef]);

  const zoomOut = useCallback(() => {
    const currentStage = stageRef.current;
    if (!currentStage) return;
    const oldScale = currentStage.scaleX();
    const newScale = Math.max(oldScale / 1.25, 0.04);
    const stageBox = containerRef.current?.getBoundingClientRect();
    if (stageBox) {
      const centerX = stageBox.width / 2;
      const centerY = stageBox.height / 2;
      const worldPoint = {
        x: (centerX - currentStage.x()) / oldScale,
        y: (centerY - currentStage.y()) / oldScale,
      };
      const newPos = {
        x: centerX - worldPoint.x * newScale,
        y: centerY - worldPoint.y * newScale,
      };
      currentStage.scale({ x: newScale, y: newScale });
      currentStage.position(newPos);
      currentStage.batchDraw();
      setStageScale(newScale);
      setStagePos(newPos);
    }
  }, [stageRef, containerRef]);

  // Zoom & Pan smoothly to target unit and highlight it with 70% Zoom (0.70 scale)
  const zoomAndPanToUnit = useCallback((targetUnitOrName: string | any) => {
    if (!targetUnitOrName || !stageRef.current) return;
    const stage = stageRef.current;

    let foundUnit: any = null;
    if (typeof targetUnitOrName === 'string') {
      const cleanTarget = targetUnitOrName.toLowerCase().trim();
      if (!cleanTarget) return;

      // 1. Exact ID, Name or Code match
      foundUnit = units.find((u: any) =>
        String(u.id || '').toLowerCase() === cleanTarget ||
        String(u.name || '').toLowerCase().trim() === cleanTarget ||
        String(u.code || '').toLowerCase().trim() === cleanTarget
      );

      // 2. Partial match if no exact match
      if (!foundUnit) {
        foundUnit = units.find((u: any) => {
          const uName = String(u.name || '').toLowerCase();
          const uId = String(u.id || '').toLowerCase();
          const uCode = String(u.code || '').toLowerCase();
          return uName.includes(cleanTarget) || cleanTarget.includes(uName) ||
                 uId.includes(cleanTarget) || cleanTarget.includes(uId) ||
                 uCode.includes(cleanTarget) || cleanTarget.includes(uCode);
        });
      }
    } else {
      foundUnit = targetUnitOrName;
    }

    if (!foundUnit) return;

    setFocusedUnitId(foundUnit.id);
    if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
    focusedTimerRef.current = setTimeout(() => {
      setFocusedUnitId(null);
    }, 15000);

    let centerX = foundUnit.x || 0;
    let centerY = foundUnit.y || 0;
    let unitW = foundUnit.width || foundUnit.textWidth || 100;
    let unitH = foundUnit.height || foundUnit.textHeight || 100;

    if (foundUnit.type === 'circle') {
      const r = foundUnit.radius || 30;
      centerX = foundUnit.x || 0;
      centerY = foundUnit.y || 0;
      unitW = r * 2;
      unitH = r * 2;
    } else if (foundUnit.type === 'polygon' && Array.isArray(foundUnit.points) && foundUnit.points.length >= 2) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < foundUnit.points.length; i += 2) {
        const px = foundUnit.points[i];
        const py = foundUnit.points[i + 1];
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      centerX = (minX + maxX) / 2;
      centerY = (minY + maxY) / 2;
      unitW = maxX - minX;
      unitH = maxY - minY;
    } else {
      centerX = (foundUnit.x || 0) + unitW / 2;
      centerY = (foundUnit.y || 0) + unitH / 2;
    }

    const containerW = dimensions.width || (containerRef.current ? containerRef.current.clientWidth : 800);
    const containerH = dimensions.height || (containerRef.current ? containerRef.current.clientHeight : 600);
    const targetScale = 0.70; // 70% Zoom as specified

    const targetX = containerW / 2 - centerX * targetScale;
    const targetY = containerH / 2 - centerY * targetScale;

    new Konva.Tween({
      node: stage,
      duration: 0.6,
      easing: Konva.Easings.EaseInOut,
      scaleX: targetScale,
      scaleY: targetScale,
      x: targetX,
      y: targetY,
      onFinish: () => {
        setStageScale(targetScale);
        setStagePos({ x: targetX, y: targetY });
      }
    }).play();

    if (onUnitSelected) {
      onUnitSelected(foundUnit);
    }
  }, [units, dimensions, stageRef, containerRef, setFocusedUnitId, focusedTimerRef, onUnitSelected]);

  return {
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
  };
}
