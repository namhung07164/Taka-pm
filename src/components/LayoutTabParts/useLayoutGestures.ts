import React, { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';

interface UseLayoutGesturesProps {
  stageRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
  setDimensions?: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  stageScale: number;
  setStageScale: (s: number) => void;
  stagePos: { x: number; y: number };
  setStagePos: (pos: { x: number; y: number }) => void;
  bgImage: any;
  version: any;
  units: any[];
  setHoverInfo: (info: any) => void;
}

export function useLayoutGestures({
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
}: UseLayoutGesturesProps) {
  const isInteractingRef = useRef(false);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const rafWheelIdRef = useRef<number | null>(null);
  const rafTouchIdRef = useRef<number | null>(null);
  const pendingTouchRef = useRef<{ dist: number; center: { x: number; y: number } } | null>(null);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);

  const touchStateRef = useRef<{
    lastDist: number;
    lastCenter: { x: number; y: number } | null;
    lastTap: number;
  }>({
    lastDist: 0,
    lastCenter: null,
    lastTap: 0,
  });

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

  // Cleanup timers & RAFs on unmount
  useEffect(() => {
    return () => {
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      if (rafWheelIdRef.current !== null) cancelAnimationFrame(rafWheelIdRef.current);
      if (rafInertiaIdRef.current !== null) cancelAnimationFrame(rafInertiaIdRef.current);
      if (rafTouchIdRef.current !== null) cancelAnimationFrame(rafTouchIdRef.current);
    };
  }, []);

  // Auto-fit floor plan background & units to perfectly fit and center in the viewport
  const fitToScreen = useCallback((animated: boolean = false) => {
    stopInertia();
    const el = containerRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    const containerW = Math.round(rect?.width || el?.clientWidth || el?.offsetWidth || dimensions.width);
    const containerH = Math.round(rect?.height || el?.clientHeight || el?.offsetHeight || dimensions.height);
    if (containerW <= 0 || containerH <= 0) return;

    // Immediately sync Stage and dimensions state with real container size so Stage never clips at 800x600
    if (setDimensions) {
      setDimensions(prev => (prev.width === containerW && prev.height === containerH) ? prev : { width: containerW, height: containerH });
    }
    const stage = stageRef.current;
    if (stage) {
      if (stage.width() !== containerW) stage.width(containerW);
      if (stage.height() !== containerH) stage.height(containerH);
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    if (bgImage) {
      const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || bgImage.width || 1000;
      const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || bgImage.height || 800;
      const imgScale = version?.imageScale || 1;
      const w = imgNaturalW * imgScale;
      const h = imgNaturalH * imgScale;
      const px = version?.imagePos?.x || 0;
      const py = version?.imagePos?.y || 0;
      const angle = ((version?.backgroundRotation || 0) * Math.PI) / 180;
      const s = Math.sin(angle);
      const c = Math.cos(angle);

      const corners = [
        { x: px, y: py },
        { x: px + w * c, y: py + w * s },
        { x: px + w * c - h * s, y: py + w * s + h * c },
        { x: px - h * s, y: py + h * c },
      ];
      corners.forEach(pt => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
    }

    if (units && units.length > 0) {
      units.forEach((u: any) => {
        if (u.type === 'polygon' && Array.isArray(u.points) && u.points.length >= 2) {
          const ox = u.x || 0;
          const oy = u.y || 0;
          for (let i = 0; i < u.points.length; i += 2) {
            const px = ox + u.points[i];
            const py = oy + u.points[i + 1];
            minX = Math.min(minX, px);
            minY = Math.min(minY, py);
            maxX = Math.max(maxX, px);
            maxY = Math.max(maxY, py);
          }
        } else if (u.type === 'circle') {
          const r = u.radius || 20;
          const cx = u.x || 0;
          const cy = u.y || 0;
          minX = Math.min(minX, cx - r);
          minY = Math.min(minY, cy - r);
          maxX = Math.max(maxX, cx + r);
          maxY = Math.max(maxY, cy + r);
        } else {
          const ux = u.x || 0;
          const uy = u.y || 0;
          const uw = u.width || 100;
          const uh = u.height || 100;
          minX = Math.min(minX, ux);
          minY = Math.min(minY, uy);
          maxX = Math.max(maxX, ux + uw);
          maxY = Math.max(maxY, uy + uh);
        }
      });
    }

    const contentX = minX !== Infinity ? minX : 0;
    const contentY = minY !== Infinity ? minY : 0;
    const contentW = minX !== Infinity && maxX > minX ? Math.max(100, maxX - minX) : 1000;
    const contentH = minY !== Infinity && maxY > minY ? Math.max(100, maxY - minY) : 800;

    const sidePad = containerW < 640 ? 12 : 24;
    const topPad = containerW < 640 ? 52 : 56;
    const bottomPad = containerW < 640 ? 48 : 28;
    const availW = Math.max(10, containerW - sidePad * 2);
    const availH = Math.max(10, containerH - topPad - bottomPad);

    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    const fitScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(0.01, Math.min(fitScale, 10));

    const contentCenterX = contentX + contentW / 2;
    const contentCenterY = contentY + contentH / 2;
    const posX = containerW / 2 - contentCenterX * clampedScale;
    const posY = topPad + availH / 2 - contentCenterY * clampedScale;

    const newPos = { x: posX, y: posY };

    if (stage) {
      if (animated) {
        stage.to({
          scaleX: clampedScale,
          scaleY: clampedScale,
          x: posX,
          y: posY,
          duration: 0.22,
          easing: Konva.Easings.EaseOut,
          onFinish: () => {
            setStageScale(clampedScale);
            setStagePos(newPos);
          }
        });
      } else {
        stage.scale({ x: clampedScale, y: clampedScale });
        stage.position(newPos);
        stage.batchDraw();
        setStageScale(clampedScale);
        setStagePos(newPos);
      }
    } else {
      setStageScale(clampedScale);
      setStagePos(newPos);
    }
  }, [bgImage, version?.id, version?.imageScale, version?.imagePos?.x, version?.imagePos?.y, version?.backgroundRotation, units, dimensions.width, dimensions.height, containerRef, stageRef, setDimensions, setStageScale, setStagePos, stopInertia]);

  // Inertia momentum panning handlers
  const handleDragStart = useCallback(() => {
    if (document.body.classList.contains('lightbox-open')) {
      const stage = stageRef.current;
      if (stage) stage.stopDrag();
      return;
    }
    stopInertia();
    isInteractingRef.current = true;
    setHoverInfo((current: any) => (current ? null : current));
    const stage = stageRef.current;
    if (stage) {
      dragVelocityTrackerRef.current.history = [
        { x: stage.x(), y: stage.y(), time: performance.now() }
      ];
    }
  }, [stageRef, setHoverInfo, stopInertia]);

  const handleDragMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const now = performance.now();
    const history = dragVelocityTrackerRef.current.history;
    history.push({ x: stage.x(), y: stage.y(), time: now });
    while (history.length > 2 && now - history[0].time > 100) {
      history.shift();
    }
  }, [stageRef]);

  const handleDragEnd = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) {
      isInteractingRef.current = false;
      return;
    }

    const history = dragVelocityTrackerRef.current.history;
    const now = performance.now();
    while (history.length > 2 && now - history[0].time > 100) {
      history.shift();
    }

    let vx = 0;
    let vy = 0;
    if (history.length >= 2) {
      const oldest = history[0];
      const newest = history[history.length - 1];
      const dt = newest.time - oldest.time;
      if (dt > 10 && dt < 150) {
        vx = (newest.x - oldest.x) / dt;
        vy = (newest.y - oldest.y) / dt;
      }
    }

    const speed = Math.hypot(vx, vy);
    if (speed > 0.12) {
      const maxSpeed = 3.0;
      if (speed > maxSpeed) {
        const ratio = maxSpeed / speed;
        vx *= ratio;
        vy *= ratio;
      }

      let currentVx = vx;
      let currentVy = vy;
      let lastTime = performance.now();

      const step = (time: number) => {
        const frameDt = Math.min(32, time - lastTime);
        lastTime = time;

        const friction = Math.pow(0.925, frameDt / 16.6);
        currentVx *= friction;
        currentVy *= friction;

        const currentStage = stageRef.current;
        if (!currentStage) {
          isInteractingRef.current = false;
          return;
        }

        const nextX = currentStage.x() + currentVx * frameDt;
        const nextY = currentStage.y() + currentVy * frameDt;

        currentStage.position({ x: nextX, y: nextY });
        currentStage.batchDraw();

        if (Math.hypot(currentVx, currentVy) > 0.02) {
          rafInertiaIdRef.current = requestAnimationFrame(step);
        } else {
          rafInertiaIdRef.current = null;
          setStagePos({ x: currentStage.x(), y: currentStage.y() });
          isInteractingRef.current = false;
        }
      };

      rafInertiaIdRef.current = requestAnimationFrame(step);
    } else {
      setStagePos({ x: stage.x(), y: stage.y() });
      isInteractingRef.current = false;
    }
  }, [stageRef, setStagePos]);

  const handleZoomIn = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const newScale = Math.min(oldScale * 1.3, 20);
    const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };
    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.18,
      easing: Konva.Easings.EaseOut,
      onFinish: () => {
        setStageScale(newScale);
        setStagePos(newPos);
      }
    });
  }, [dimensions.width, dimensions.height, stageRef, setStageScale, setStagePos]);

  const handleZoomOut = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = stage.scaleX();
    const newScale = Math.max(oldScale / 1.3, 0.04);
    const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
    const mousePointTo = {
      x: (center.x - stage.x()) / oldScale,
      y: (center.y - stage.y()) / oldScale,
    };
    const newPos = {
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    };
    stage.to({
      scaleX: newScale,
      scaleY: newScale,
      x: newPos.x,
      y: newPos.y,
      duration: 0.18,
      easing: Konva.Easings.EaseOut,
      onFinish: () => {
        setStageScale(newScale);
        setStagePos(newPos);
      }
    });
  }, [dimensions.width, dimensions.height, stageRef, setStageScale, setStagePos]);

  return {
    isInteractingRef,
    wheelTimeoutRef,
    pendingWheelDeltaRef,
    rafWheelIdRef,
    rafTouchIdRef,
    pendingTouchRef,
    lastWheelPointerRef,
    touchStateRef,
    dragVelocityTrackerRef,
    rafInertiaIdRef,
    stopInertia,
    fitToScreen,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleZoomIn,
    handleZoomOut,
  };
}
