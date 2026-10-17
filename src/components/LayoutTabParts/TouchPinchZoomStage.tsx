import React, {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';

export interface TouchPinchZoomStageHandle {
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  resetTransform: () => void;
  centerView: (scale?: number) => void;
  getScale: () => number;
}

export interface TouchPinchZoomStageProps {
  children: React.ReactNode;
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  onScaleChange?: (scale: number) => void;
  captureOverlay?: boolean;
  allowNativeTouch?: boolean;
  alwaysPan?: boolean;
  className?: string;
  contentClassName?: string;
}

export const TouchPinchZoomStage = forwardRef<
  TouchPinchZoomStageHandle,
  TouchPinchZoomStageProps
>(function TouchPinchZoomStage(
  {
    children,
    initialScale = 1,
    minScale = 0.5,
    maxScale = 8,
    onScaleChange,
    captureOverlay = false,
    allowNativeTouch = false,
    alwaysPan = true,
    className = '',
    contentClassName = '',
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef<{ scale: number; x: number; y: number }>({
    scale: initialScale,
    x: 0,
    y: 0,
  });

  const rafIdRef = useRef<number | null>(null);
  const lastReportedScaleRef = useRef<number>(initialScale);
  const scaleReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinchStartRef = useRef<{
    startDist: number;
    startScale: number;
    startX: number;
    startY: number;
    startMidX: number;
    startMidY: number;
  } | null>(null);

  const panStartRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  const isMouseDraggingRef = useRef(false);
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({ time: 0, x: 0, y: 0 });

  const clampScale = useCallback(
    (s: number) => Math.max(minScale, Math.min(maxScale, s)),
    [minScale, maxScale]
  );

  const notifyScale = useCallback(
    (s: number, immediate = false) => {
      if (!onScaleChange) return;
      const rounded = Math.round(s * 100) / 100;
      if (immediate) {
        if (scaleReportTimerRef.current) {
          clearTimeout(scaleReportTimerRef.current);
          scaleReportTimerRef.current = null;
        }
        lastReportedScaleRef.current = rounded;
        onScaleChange(rounded);
        return;
      }
      if (Math.abs(rounded - lastReportedScaleRef.current) < 0.02) return;
      if (!scaleReportTimerRef.current) {
        scaleReportTimerRef.current = setTimeout(() => {
          scaleReportTimerRef.current = null;
          const latest = Math.round(stateRef.current.scale * 100) / 100;
          lastReportedScaleRef.current = latest;
          onScaleChange(latest);
        }, 60);
      }
    },
    [onScaleChange]
  );

  const applyTransformDOM = useCallback((animate = false) => {
    const el = contentRef.current;
    if (!el) return;
    const { scale, x, y } = stateRef.current;
    el.style.transition = animate ? 'transform 160ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
  }, []);

  const scheduleRender = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      applyTransformDOM(false);
    });
  }, [applyTransformDOM]);

  const setTransformAnimated = useCallback(
    (nextScale: number, nextX: number, nextY: number) => {
      const clamped = clampScale(nextScale);
      stateRef.current = {
        scale: clamped,
        x: clamped <= 1.01 ? 0 : nextX,
        y: clamped <= 1.01 ? 0 : nextY,
      };
      applyTransformDOM(true);
      notifyScale(clamped, true);
    },
    [clampScale, applyTransformDOM, notifyScale]
  );

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: (step = 0.4) => {
        const cur = stateRef.current;
        const nextScale = clampScale(cur.scale + step);
        const ratio = nextScale / cur.scale;
        setTransformAnimated(nextScale, cur.x * ratio, cur.y * ratio);
      },
      zoomOut: (step = 0.4) => {
        const cur = stateRef.current;
        const nextScale = clampScale(cur.scale - step);
        if (nextScale <= 1.02) setTransformAnimated(1, 0, 0);
        else {
          const ratio = nextScale / cur.scale;
          setTransformAnimated(nextScale, cur.x * ratio, cur.y * ratio);
        }
      },
      resetTransform: () => setTransformAnimated(1, 0, 0),
      centerView: (targetScale = 1) => setTransformAnimated(targetScale, 0, 0),
      getScale: () => stateRef.current.scale,
    }),
    [clampScale, setTransformAnimated]
  );

  useEffect(() => {
    const clamped = clampScale(initialScale || 1);
    stateRef.current = { scale: clamped, x: 0, y: 0 };
    applyTransformDOM(false);
    notifyScale(clamped, true);
  }, [initialScale, clampScale, applyTransformDOM, notifyScale]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCenter = () => {
      const rect = container.getBoundingClientRect();
      return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 };
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (allowNativeTouch && e.touches.length < 2) return;
      if (e.touches.length === 2) {
        if (e.cancelable) e.preventDefault();
        panStartRef.current = null;
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        pinchStartRef.current = {
          startDist: Math.max(dist, 10),
          startScale: stateRef.current.scale,
          startX: stateRef.current.x,
          startY: stateRef.current.y,
          startMidX: (t1.clientX + t2.clientX) / 2,
          startMidY: (t1.clientY + t2.clientY) / 2,
        };
      } else if (e.touches.length === 1) {
        pinchStartRef.current = null;
        const t = e.touches[0];
        panStartRef.current = {
          clientX: t.clientX,
          clientY: t.clientY,
          startX: stateRef.current.x,
          startY: stateRef.current.y,
          moved: false,
        };
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        if (e.cancelable) e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const currDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const currMidX = (t1.clientX + t2.clientX) / 2;
        const currMidY = (t1.clientY + t2.clientY) / 2;

        const { startDist, startScale, startX, startY, startMidX, startMidY } = pinchStartRef.current;
        const newScale = clampScale(startScale * (currDist / startDist));
        const { cx, cy } = getCenter();
        const pointX = (startMidX - cx - startX) / startScale;
        const pointY = (startMidY - cy - startY) / startScale;

        stateRef.current.scale = newScale;
        stateRef.current.x = currMidX - cx - pointX * newScale;
        stateRef.current.y = currMidY - cy - pointY * newScale;

        scheduleRender();
        notifyScale(newScale, false);
      } else if (!allowNativeTouch && e.touches.length === 1 && panStartRef.current) {
        const canPan = alwaysPan || stateRef.current.scale > 1.02 || captureOverlay;
        if (!canPan) return;
        const t = e.touches[0];
        const dx = t.clientX - panStartRef.current.clientX;
        const dy = t.clientY - panStartRef.current.clientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panStartRef.current.moved = true;
        if (panStartRef.current.moved) {
          if (e.cancelable) e.preventDefault();
          stateRef.current.x = panStartRef.current.startX + dx;
          stateRef.current.y = panStartRef.current.startY + dy;
          scheduleRender();
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        pinchStartRef.current = null;
        if (!allowNativeTouch) {
          const t = e.touches[0];
          panStartRef.current = {
            clientX: t.clientX,
            clientY: t.clientY,
            startX: stateRef.current.x,
            startY: stateRef.current.y,
            moved: true,
          };
        }
        notifyScale(stateRef.current.scale, true);
        return;
      }

      if (e.touches.length === 0) {
        const wasPinching = Boolean(pinchStartRef.current);
        const wasMoved = panStartRef.current?.moved ?? false;
        pinchStartRef.current = null;
        panStartRef.current = null;

        if (wasPinching) {
          if (stateRef.current.scale < 1.02 && stateRef.current.scale > 0.95) {
            setTransformAnimated(1, 0, 0);
          } else {
            notifyScale(stateRef.current.scale, true);
          }
          return;
        }

        if (!allowNativeTouch && !wasMoved && e.changedTouches.length === 1) {
          const t = e.changedTouches[0];
          const now = Date.now();
          const dt = now - lastTapRef.current.time;
          const dist = Math.hypot(t.clientX - lastTapRef.current.x, t.clientY - lastTapRef.current.y);

          if (dt > 0 && dt < 300 && dist < 32) {
            if (e.cancelable) e.preventDefault();
            lastTapRef.current = { time: 0, x: 0, y: 0 };
            const cur = stateRef.current;
            if (cur.scale > 1.15) {
              setTransformAnimated(1, 0, 0);
            } else {
              const targetScale = Math.min(maxScale, 2.5);
              const { cx, cy } = getCenter();
              const tapPx = t.clientX - cx;
              const tapPy = t.clientY - cy;
              setTransformAnimated(
                targetScale,
                tapPx - ((tapPx - cur.x) / cur.scale) * targetScale,
                tapPy - ((tapPy - cur.y) / cur.scale) * targetScale
              );
            }
          } else {
            lastTapRef.current = { time: now, x: t.clientX, y: t.clientY };
          }
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (allowNativeTouch && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const cur = stateRef.current;
      const factor = e.ctrlKey ? 0.012 : 0.002;
      const nextScale = clampScale(cur.scale * Math.exp(-e.deltaY * factor));
      if (Math.abs(nextScale - cur.scale) < 0.001) return;

      const { cx, cy } = getCenter();
      const cursorPx = e.clientX - cx;
      const cursorPy = e.clientY - cy;
      stateRef.current.scale = nextScale;
      stateRef.current.x = nextScale <= 1.01 ? 0 : cursorPx - ((cursorPx - cur.x) / cur.scale) * nextScale;
      stateRef.current.y = nextScale <= 1.01 ? 0 : cursorPy - ((cursorPy - cur.y) / cur.scale) * nextScale;

      scheduleRender();
      notifyScale(nextScale, false);
    };

    const handleGesture = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: false });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('gesturestart', handleGesture, { passive: false });
    container.addEventListener('gesturechange', handleGesture, { passive: false });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('gesturestart', handleGesture);
      container.removeEventListener('gesturechange', handleGesture);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (scaleReportTimerRef.current) {
        clearTimeout(scaleReportTimerRef.current);
        scaleReportTimerRef.current = null;
      }
    };
  }, [allowNativeTouch, alwaysPan, captureOverlay, clampScale, maxScale, notifyScale, scheduleRender, setTransformAnimated]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (allowNativeTouch || e.button !== 0) return;
    isMouseDraggingRef.current = true;
    panStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startX: stateRef.current.x,
      startY: stateRef.current.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (allowNativeTouch || !isMouseDraggingRef.current || !panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.clientX;
    const dy = e.clientY - panStartRef.current.clientY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) panStartRef.current.moved = true;
    if (panStartRef.current.moved) {
      stateRef.current.x = panStartRef.current.startX + dx;
      stateRef.current.y = panStartRef.current.startY + dy;
      scheduleRender();
    }
  };

  const handleMouseUp = () => {
    isMouseDraggingRef.current = false;
    panStartRef.current = null;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (allowNativeTouch) return;
    const container = containerRef.current;
    if (!container) return;
    const cur = stateRef.current;
    if (cur.scale > 1.15) {
      setTransformAnimated(1, 0, 0);
    } else {
      const targetScale = Math.min(maxScale, 2.5);
      const rect = container.getBoundingClientRect();
      const tapPx = e.clientX - (rect.left + rect.width / 2);
      const tapPy = e.clientY - (rect.top + rect.height / 2);
      setTransformAnimated(
        targetScale,
        tapPx - ((tapPx - cur.x) / cur.scale) * targetScale,
        tapPy - ((tapPy - cur.y) / cur.scale) * targetScale
      );
    }
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      className={`relative w-full h-full overflow-hidden flex items-center justify-center select-none ${
        allowNativeTouch ? '' : 'cursor-grab active:cursor-grabbing'
      } ${className}`}
      style={{
        touchAction: allowNativeTouch ? 'pan-x pan-y' : 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div
        ref={contentRef}
        className={`w-full h-full flex items-center justify-center ${contentClassName}`}
        style={{
          transformOrigin: 'center center',
          willChange: 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        {children}
      </div>

      {captureOverlay && !allowNativeTouch && (
        <div
          className="absolute inset-0 z-20 bg-transparent"
          style={{ touchAction: 'none' }}
          title="Pinch with 2 fingers to zoom • Drag with 1 finger to pan • Double-tap to toggle zoom"
        />
      )}
    </div>
  );
});
