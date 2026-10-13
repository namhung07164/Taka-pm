import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface UseGanttZoomAndPanParams {
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  sideWidth: number;
}

export function useGanttZoomAndPan({
  mainScrollRef,
  topScrollRef,
  sideWidth
}: UseGanttZoomAndPanParams) {
  const dayWidth = useAppStore((state) => state.ganttDayWidth);
  const setDayWidth = useAppStore((state) => state.setGanttDayWidth);
  const setScaleInput = useAppStore((state) => state.setGanttScaleInput);
  const setIsWidthChanged = useAppStore((state) => state.setIsGanttWidthChanged);

  const [isPanning, setIsPanning] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0
  });

  // Target scroll position during focal point zoom
  const targetScrollLeftRef = useRef<number | null>(null);

  // 1. Mouse Wheel Zoom Listener with Focal Point Preservation
  useEffect(() => {
    const mainEl = mainScrollRef.current;
    const topEl = topScrollRef.current;
    if (!mainEl) return;

    const handleWheelZoom = (e: WheelEvent) => {
      // Trigger zoom on Ctrl/Meta/Alt + wheel OR wheel when over top timeline header
      const isZoomGesture = e.ctrlKey || e.metaKey || e.altKey || (topEl && topEl.contains(e.target as Node));
      
      if (!isZoomGesture) {
        return; // Allow standard native scrolling
      }

      e.preventDefault();
      e.stopPropagation();

      const currentWidth = useAppStore.getState().ganttDayWidth;
      const zoomIn = e.deltaY < 0;

      // Calculate smooth exponential zoom step
      const factor = zoomIn ? 1.15 : 0.85;
      let newWidth = currentWidth * factor;

      // Clamp between 0.8px and 120px
      newWidth = Math.max(0.8, Math.min(120, newWidth));
      newWidth = Math.round(newWidth * 100) / 100; // 2 decimal places

      if (Math.abs(newWidth - currentWidth) < 0.01) return;

      // Calculate Focal Point under Mouse Cursor
      const rect = mainEl.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const currentScrollLeft = mainEl.scrollLeft;
      
      // Effective X in timeline space
      const cursorXInTimeline = currentScrollLeft + cursorX - sideWidth;

      if (cursorXInTimeline > 0 && currentWidth > 0) {
        const daysFromStart = cursorXInTimeline / currentWidth;
        const newCursorXInTimeline = daysFromStart * newWidth;
        const newScrollLeft = Math.max(0, newCursorXInTimeline - (cursorX - sideWidth));
        targetScrollLeftRef.current = newScrollLeft;
      }

      // Update Zustand Store & UI scale input
      setDayWidth(newWidth);
      const newScaleVal = String(Math.round((newWidth / 8) * 75));
      setScaleInput(newScaleVal);
      setIsWidthChanged(true);
    };

    // Attach wheel event with passive: false so preventDefault() works reliably
    mainEl.addEventListener('wheel', handleWheelZoom, { passive: false });
    if (topEl) {
      topEl.addEventListener('wheel', handleWheelZoom, { passive: false });
    }

    return () => {
      mainEl.removeEventListener('wheel', handleWheelZoom);
      if (topEl) {
        topEl.removeEventListener('wheel', handleWheelZoom);
      }
    };
  }, [mainScrollRef, topScrollRef, sideWidth, setDayWidth, setScaleInput, setIsWidthChanged]);

  // Apply target scroll position after dayWidth re-render
  useEffect(() => {
    if (targetScrollLeftRef.current !== null && mainScrollRef.current) {
      const target = targetScrollLeftRef.current;
      targetScrollLeftRef.current = null;
      requestAnimationFrame(() => {
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollLeft = target;
        }
      });
    }
  }, [dayWidth, mainScrollRef]);

  // 2. Drag-to-Pan Pointer Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const targetEl = e.target as HTMLElement;

    // Ignore clicks on interactive components
    if (
      targetEl.closest('button') ||
      targetEl.closest('input') ||
      targetEl.closest('select') ||
      targetEl.closest('a') ||
      targetEl.closest('.gantt-bar') ||
      targetEl.closest('.cursor-col-resize') ||
      targetEl.closest('.cursor-row-resize') ||
      targetEl.closest('.gantt-tooltip')
    ) {
      return;
    }

    // Left click (button 0) or Middle click (button 1)
    if (e.button === 0 || e.button === 1) {
      const scrollEl = mainScrollRef.current;
      if (!scrollEl) return;

      isDraggingRef.current = true;
      setIsPanning(true);

      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: scrollEl.scrollLeft,
        scrollTop: scrollEl.scrollTop
      };

      if (e.button === 1) {
        e.preventDefault();
      }
    }
  }, [mainScrollRef]);

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !mainScrollRef.current) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      mainScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
      mainScrollRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
    };

    const handlePointerUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [mainScrollRef]);

  return {
    isPanning,
    handlePointerDown
  };
}
