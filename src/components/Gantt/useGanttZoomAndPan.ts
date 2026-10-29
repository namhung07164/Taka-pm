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

  // Target scroll position during month resize anchoring
  const targetScrollLeftRef = useRef<number | null>(null);
  const monthResizeRef = useRef<{
    startX: number;
    startDayWidth: number;
    unitDays: number;
    daysBeforeUnit: number;
    startScrollLeft: number;
  } | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Apply target scroll position after dayWidth re-render
  useEffect(() => {
    if (targetScrollLeftRef.current !== null) {
      const target = targetScrollLeftRef.current;
      targetScrollLeftRef.current = null;
      if (mainScrollRef.current) {
        mainScrollRef.current.scrollLeft = target;
      }
      if (topScrollRef.current) {
        topScrollRef.current.scrollLeft = target;
      }
      requestAnimationFrame(() => {
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollLeft = target;
        }
        if (topScrollRef.current) {
          topScrollRef.current.scrollLeft = target;
        }
      });
    }
  }, [dayWidth, mainScrollRef, topScrollRef]);

  // 1. Drag Divider Between Months to Resize Month Width
  const handleStartMonthResize = useCallback(
    (unitDays: number, daysBeforeUnit: number, e: React.PointerEvent | React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const currentWidth = useAppStore.getState().ganttDayWidth;
      const startScrollLeft =
        mainScrollRef.current?.scrollLeft ?? topScrollRef.current?.scrollLeft ?? 0;

      monthResizeRef.current = {
        startX: e.clientX,
        startDayWidth: currentWidth,
        unitDays: Math.max(1, unitDays),
        daysBeforeUnit: Math.max(0, daysBeforeUnit),
        startScrollLeft
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [mainScrollRef, topScrollRef]
  );

  // 2. Drag-to-Pan Pointer Handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const targetEl = e.target as HTMLElement;

    // Ignore clicks on interactive components or month resize dividers
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
      if (monthResizeRef.current) {
        const clientX = e.clientX;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          const resizeState = monthResizeRef.current;
          if (!resizeState) return;

          const dx = clientX - resizeState.startX;
          let newWidth = resizeState.startDayWidth + dx / resizeState.unitDays;
          newWidth = Math.max(0.8, Math.min(120, newWidth));
          newWidth = Math.round(newWidth * 100) / 100;

          const currentWidth = useAppStore.getState().ganttDayWidth;
          if (Math.abs(newWidth - currentWidth) < 0.01) return;

          const newScrollLeft = Math.max(
            0,
            resizeState.startScrollLeft +
              resizeState.daysBeforeUnit * (newWidth - resizeState.startDayWidth)
          );
          targetScrollLeftRef.current = newScrollLeft;

          if (mainScrollRef.current) {
            mainScrollRef.current.scrollLeft = newScrollLeft;
          }
          if (topScrollRef.current) {
            topScrollRef.current.scrollLeft = newScrollLeft;
          }

          setDayWidth(newWidth);
          const newScaleVal = String(Math.round((newWidth / 8) * 75));
          setScaleInput(newScaleVal);
          setIsWidthChanged(true);
        });
        return;
      }

      if (!isDraggingRef.current || !mainScrollRef.current) return;

      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      mainScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
      mainScrollRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
    };

    const handlePointerUp = () => {
      if (monthResizeRef.current) {
        monthResizeRef.current = null;
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsPanning(false);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [mainScrollRef, topScrollRef, setDayWidth, setScaleInput, setIsWidthChanged]);

  return {
    isPanning,
    handlePointerDown,
    handleStartMonthResize
  };
}
