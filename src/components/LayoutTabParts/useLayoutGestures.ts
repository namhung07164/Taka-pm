import React, { useCallback, useEffect, useRef } from 'react';
import Konva from 'konva';

interface UseLayoutGesturesProps {
  stageRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dimensions: { width: number; height: number };
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
    const containerW = containerRef.current?.offsetWidth || dimensions.width;
    const containerH = containerRef.current?.offsetHeight || dimensions.height;
    if (containerW <= 0 || containerH <= 0) return;

    let contentW = 1000;
    let contentH = 800;
    let contentX = 0;
    let contentY = 0;

    if (bgImage) {
      const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || bgImage.width || 1000;
      const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || bgImage.height || 800;
      const imgScale = version?.imageScale || 1;
      contentW = imgNaturalW * imgScale;
      contentH = imgNaturalH * imgScale;
      contentX = version?.imagePos?.x || 0;
      contentY = version?.imagePos?.y || 0;
    } else if (units && units.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      units.forEach((u: any) => {
        const ux = u.x || 0;
        const uy = u.y || 0;
        const uw = u.width || 100;
        const uh = u.height || 100;
        minX = Math.min(minX, ux);
        minY = Math.min(minY, uy);
        maxX = Math.max(maxX, ux + uw);
        maxY = Math.max(maxY, uy + uh);
      });
      if (minX !== Infinity && maxX > minX) {
        contentX = minX;
        contentY = minY;
        contentW = Math.max(100, maxX - minX);
        contentH = Math.max(100, maxY - minY);
      }
    }

    const pad = containerW < 640 ? 12 : 24;
    const availW = Math.max(10, containerW - pad * 2);
    const availH = Math.max(10, containerH - pad * 2);

    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    const fitScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(0.01, Math.min(fitScale, 10));

    const contentCenterX = contentX + contentW / 2;
    const contentCenterY = contentY + contentH / 2;
    const posX = containerW / 2 - contentCenterX * clampedScale;
    const posY = containerH / 2 - contentCenterY * clampedScale;

    const newPos = { x: posX, y: posY };

    const stage = stageRef.current;
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
  }, [bgImage, version?.id, version?.imageScale, version?.imagePos?.x, version?.imagePos?.y, units, dimensions.width, dimensions.height, containerRef, stageRef, setStageScale, setStagePos, stopInertia]);

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
