import React, { useState, useRef, useEffect, useCallback } from 'react';
import Konva from 'konva';

interface UseLayoutCadEngineParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  stageRef: React.RefObject<any>;
  bgImage: CanvasImageSource | null;
  version: any;
  units: any[];
  dimensions: { width: number; height: number };
  aggregatedData: Record<string, any>;
  restrictedProjectCodes: Set<string>;
  isProjectModalOpen: boolean;
  hasMiniGantt: boolean;
  onClearHoverInfo: () => void;
  setFocusedUnitId: (id: string | null) => void;
  focusedTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export function useLayoutCadEngine({
  containerRef,
  stageRef,
  bgImage,
  version,
  units,
  dimensions,
  aggregatedData,
  restrictedProjectCodes,
  isProjectModalOpen,
  hasMiniGantt,
  onClearHoverInfo,
  setFocusedUnitId,
  focusedTimerRef,
}: UseLayoutCadEngineParams) {
  const [stageScale, setStageScale] = useState<number>(1);
  const [stagePos, setStagePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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
    (window as any).__taka_layout_stage = stageRef.current;
    return () => {
      if ((window as any).__taka_layout_stage === stageRef.current) {
        (window as any).__taka_layout_stage = null;
      }
    };
  });

  useEffect(() => {
    return () => {
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      if (rafWheelIdRef.current !== null) cancelAnimationFrame(rafWheelIdRef.current);
      if (rafInertiaIdRef.current !== null) cancelAnimationFrame(rafInertiaIdRef.current);
      if (rafTouchIdRef.current !== null) cancelAnimationFrame(rafTouchIdRef.current);
    };
  }, []);

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
      const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || (bgImage as any).width || 1000;
      const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || (bgImage as any).height || 800;
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
  }, [bgImage, version, units, dimensions, stopInertia, containerRef, stageRef]);

  const zoomAndPanToUnit = useCallback((targetUnitOrName: string | any) => {
    if (!targetUnitOrName) return false;

    let targetUnit: any = null;
    if (typeof targetUnitOrName === 'object' && targetUnitOrName?.id) {
      targetUnit = targetUnitOrName;
    } else {
      const q = String(targetUnitOrName).toLowerCase().trim();
      targetUnit = units.find((u: any) => 
        (u.name || '').toLowerCase().trim() === q || 
        String(u.id).toLowerCase() === q
      );
      if (!targetUnit) {
        targetUnit = units.find((u: any) => {
          const uName = (u.name || '').toLowerCase().trim();
          const d = aggregatedData[uName];
          if (!d) return false;
          const matchCode = d.appProjectCode && String(d.appProjectCode).toLowerCase().trim() === q;
          const matchName = d.projectName && String(d.projectName).toLowerCase().trim() === q;
          const matchBrand = d.brandName && String(d.brandName).toLowerCase().trim() === q;
          const matchUnit = d.unit && String(d.unit).toLowerCase().trim() === q;
          return matchCode || matchName || matchBrand || matchUnit;
        });
      }
      if (!targetUnit) {
        const stem = q.replace(/[-_.#]\d+$/, '').trim();
        if (stem && stem !== q) {
          targetUnit = units.find((u: any) => 
            (u.name || '').toLowerCase().trim() === stem ||
            String(u.id).toLowerCase() === stem
          );
        }
      }
      if (!targetUnit) {
        targetUnit = units.find((u: any) => {
          const uName = (u.name || '').toLowerCase().trim();
          if (uName && (uName.includes(q) || q.includes(uName))) return true;
          const d = aggregatedData[uName];
          if (!d) return false;
          return (d.projectName && d.projectName.toLowerCase().includes(q)) ||
                 (d.brandName && d.brandName.toLowerCase().includes(q)) ||
                 (d.appProjectCode && (d.appProjectCode.toLowerCase().includes(q) || q.includes(d.appProjectCode.toLowerCase())));
        });
      }
      if (!targetUnit) {
        targetUnit = units.find((u: any) => 
          (u.name || '').toLowerCase().includes(q) ||
          String(u.id).toLowerCase() === q
        );
      }
    }

    if (!targetUnit) return false;

    const targetUName = (targetUnit.name || '').toLowerCase().trim();
    if (restrictedProjectCodes.has(targetUName) || aggregatedData[targetUName]?.isRestricted) {
      return false;
    }

    let cx = targetUnit.x || 0;
    let cy = targetUnit.y || 0;
    let uW = 100;
    let uH = 60;

    if (targetUnit.type === 'rect') {
      uW = Math.abs(targetUnit.width || 100);
      uH = Math.abs(targetUnit.height || 60);
      cx = (targetUnit.x || 0) + uW / 2;
      cy = (targetUnit.y || 0) + uH / 2;
    } else if (targetUnit.type === 'circle') {
      const r = targetUnit.radius || 30;
      uW = r * 2;
      uH = r * 2;
      cx = targetUnit.x || 0;
      cy = targetUnit.y || 0;
    } else if (targetUnit.type === 'polygon' && targetUnit.points && targetUnit.points.length >= 2) {
      let sumX = 0, sumY = 0, count = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < targetUnit.points.length; i += 2) {
        const px = targetUnit.points[i];
        const py = targetUnit.points[i + 1];
        sumX += px;
        sumY += py;
        count++;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      cx = count > 0 ? sumX / count : 0;
      cy = count > 0 ? sumY / count : 0;
      uW = maxX > minX ? maxX - minX : 100;
      uH = maxY > minY ? maxY - minY : 60;
    } else {
      cx = (targetUnit.textX || targetUnit.x || 0) + (targetUnit.textWidth || 100) / 2;
      cy = (targetUnit.textY || targetUnit.y || 0) + (targetUnit.textHeight || 30) / 2;
    }

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
    focusedTimerRef.current = setTimeout(() => {
      setFocusedUnitId(null);
    }, 10000);

    return targetUnit;
  }, [units, aggregatedData, restrictedProjectCodes, dimensions, containerRef, stageRef, setFocusedUnitId, focusedTimerRef]);

  const handleDragStart = useCallback(() => {
    stopInertia();
    isInteractingRef.current = true;
    onClearHoverInfo();
    const stage = stageRef.current;
    if (stage) {
      dragVelocityTrackerRef.current.history = [
        { x: stage.x(), y: stage.y(), time: performance.now() }
      ];
    }
  }, [stopInertia, onClearHoverInfo, stageRef]);

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
  }, [stageRef]);

  const handleWheel = useCallback((e: any) => {
    if (isProjectModalOpen || hasMiniGantt) return;
    e.evt.preventDefault();
    stopInertia();
    const stage = stageRef.current;
    if (!stage) return;
    
    isInteractingRef.current = true;
    onClearHoverInfo();

    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    lastWheelPointerRef.current = pointer;
    pendingWheelDeltaRef.current += e.evt.deltaY;

    if (rafWheelIdRef.current === null) {
      rafWheelIdRef.current = requestAnimationFrame(() => {
        rafWheelIdRef.current = null;
        const currentStage = stageRef.current;
        const ptr = lastWheelPointerRef.current;
        if (!currentStage || !ptr) return;

        const deltaY = pendingWheelDeltaRef.current;
        pendingWheelDeltaRef.current = 0;

        const oldScale = currentStage.scaleX();
        const zoomFactor = Math.exp(-deltaY * 0.002);
        const newScale = Math.max(0.04, Math.min(oldScale * zoomFactor, 20));

        const mousePointTo = {
          x: (ptr.x - currentStage.x()) / oldScale,
          y: (ptr.y - currentStage.y()) / oldScale,
        };

        const newPos = {
          x: ptr.x - mousePointTo.x * newScale,
          y: ptr.y - mousePointTo.y * newScale,
        };

        currentStage.scale({ x: newScale, y: newScale });
        currentStage.position(newPos);
        currentStage.batchDraw();

        if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
        wheelTimeoutRef.current = setTimeout(() => {
          setStageScale(currentStage.scaleX());
          setStagePos({ x: currentStage.x(), y: currentStage.y() });
          isInteractingRef.current = false;
        }, 120);
      });
    }
  }, [isProjectModalOpen, hasMiniGantt, stopInertia, onClearHoverInfo, stageRef]);

  const handleTouchStart = useCallback((e: any) => {
    if (e.evt.touches.length === 2) {
      stopInertia();
      isInteractingRef.current = true;
      onClearHoverInfo();
      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
      touchStateRef.current = { lastDist: dist, lastCenter: center, lastTap: touchStateRef.current.lastTap };
      const stage = stageRef.current;
      if (stage) stage.draggable(false);
    } else if (e.evt.touches.length === 1) {
      const now = Date.now();
      const timesince = now - touchStateRef.current.lastTap;
      touchStateRef.current.lastTap = now;
      if (timesince < 300 && timesince > 0) {
        fitToScreen(true);
      }
    }
  }, [stopInertia, onClearHoverInfo, fitToScreen, stageRef]);

  const handleTouchMove = useCallback((e: any) => {
    if (e.evt.touches.length === 2) {
      e.evt.preventDefault();
      const touch1 = e.evt.touches[0];
      const touch2 = e.evt.touches[1];
      const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
      const center = {
        x: (touch1.clientX + touch2.clientX) / 2,
        y: (touch1.clientY + touch2.clientY) / 2,
      };
      pendingTouchRef.current = { dist, center };

      if (rafTouchIdRef.current === null) {
        rafTouchIdRef.current = requestAnimationFrame(() => {
          rafTouchIdRef.current = null;
          if (!pendingTouchRef.current) return;
          const { dist: curDist, center: curCenter } = pendingTouchRef.current;
          const { lastDist, lastCenter } = touchStateRef.current;
          const stage = stageRef.current;
          if (stage && lastDist > 0 && lastCenter) {
            const oldScale = stage.scaleX();
            const scaleDelta = curDist / lastDist;
            const newScale = Math.max(0.04, Math.min(oldScale * scaleDelta, 20));
            
            const stageBox = stage.container().getBoundingClientRect();
            const lastPointerX = lastCenter.x - stageBox.left;
            const lastPointerY = lastCenter.y - stageBox.top;
            const currentPointerX = curCenter.x - stageBox.left;
            const currentPointerY = curCenter.y - stageBox.top;

            const worldPointX = (lastPointerX - stage.x()) / oldScale;
            const worldPointY = (lastPointerY - stage.y()) / oldScale;

            const newPos = {
              x: currentPointerX - worldPointX * newScale,
              y: currentPointerY - worldPointY * newScale,
            };

            stage.scale({ x: newScale, y: newScale });
            stage.position(newPos);
            stage.batchDraw();

            touchStateRef.current.lastDist = curDist;
            touchStateRef.current.lastCenter = curCenter;
          }
        });
      }
    }
  }, [stageRef]);

  const handleTouchEnd = useCallback(() => {
    if (rafTouchIdRef.current !== null) {
      cancelAnimationFrame(rafTouchIdRef.current);
      rafTouchIdRef.current = null;
    }
    pendingTouchRef.current = null;
    touchStateRef.current.lastDist = 0;
    touchStateRef.current.lastCenter = null;
    const stage = stageRef.current;
    if (stage) {
      stage.draggable(true);
      setStageScale(stage.scaleX());
      setStagePos({ x: stage.x(), y: stage.y() });
    }
    isInteractingRef.current = false;
  }, [stageRef]);

  return {
    stageScale,
    setStageScale,
    stagePos,
    setStagePos,
    isInteractingRef,
    fitToScreen,
    zoomAndPanToUnit,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    stopInertia,
  };
}
