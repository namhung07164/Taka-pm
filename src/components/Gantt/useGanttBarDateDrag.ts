import { useState, useRef, useCallback } from 'react';
import { parseDateTime } from '../../lib/utils';
import { formatGanttDate } from './GanttUtils';

interface UseGanttBarDateDragProps {
  taskId: string;
  startStr: string;
  endStr: string;
  dayWidth: number;
  isEditMode: boolean;
  onUpdateTaskDates?: (taskId: string, newStart: string, newFinish: string) => Promise<void> | void;
}

export function shiftDateStr(dateStr: string, days: number): string {
  if (!dateStr || days === 0) return dateStr;
  const d = parseDateTime(dateStr);
  if (!d || isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (dateStr.includes('T')) {
    const timePart = dateStr.split('T')[1];
    return `${y}-${m}-${day}T${timePart}`;
  }
  return `${y}-${m}-${day}`;
}

export function useGanttBarDateDrag({
  taskId,
  startStr,
  endStr,
  dayWidth,
  isEditMode,
  onUpdateTaskDates,
}: UseGanttBarDateDragProps) {
  const [dragMode, setDragMode] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [deltaDays, setDeltaDays] = useState(0);

  const dragRef = useRef<{
    startX: number;
    mode: 'move' | 'resize-start' | 'resize-end';
    origStart: string;
    origEnd: string;
  } | null>(null);

  const startDrag = useCallback((
    e: React.PointerEvent,
    mode: 'move' | 'resize-start' | 'resize-end'
  ) => {
    if (!isEditMode || !onUpdateTaskDates || !startStr || !endStr) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    dragRef.current = {
      startX,
      mode,
      origStart: startStr,
      origEnd: endStr,
    };
    setDragMode(mode);
    setDeltaDays(0);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const rawDays = Math.round(dx / dayWidth);

      // Clamp so start doesn't exceed end
      if (dragRef.current.mode === 'resize-start') {
        const dS = parseDateTime(dragRef.current.origStart);
        const dE = parseDateTime(dragRef.current.origEnd);
        if (dS && dE) {
          const maxShift = Math.floor((dE.getTime() - dS.getTime()) / (1000 * 60 * 60 * 24));
          setDeltaDays(Math.min(maxShift, rawDays));
          return;
        }
      } else if (dragRef.current.mode === 'resize-end') {
        const dS = parseDateTime(dragRef.current.origStart);
        const dE = parseDateTime(dragRef.current.origEnd);
        if (dS && dE) {
          const minShift = -Math.floor((dE.getTime() - dS.getTime()) / (1000 * 60 * 60 * 24));
          setDeltaDays(Math.max(minShift, rawDays));
          return;
        }
      }

      setDeltaDays(rawDays);
    };

    const onPointerUp = async (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (dragRef.current) {
        const dx = upEvent.clientX - dragRef.current.startX;
        const finalDays = Math.round(dx / dayWidth);
        const { mode: currentMode, origStart, origEnd } = dragRef.current;

        if (finalDays !== 0) {
          let newStart = origStart;
          let newFinish = origEnd;

          if (currentMode === 'move') {
            newStart = shiftDateStr(origStart, finalDays);
            newFinish = shiftDateStr(origEnd, finalDays);
          } else if (currentMode === 'resize-start') {
            newStart = shiftDateStr(origStart, finalDays);
          } else if (currentMode === 'resize-end') {
            newFinish = shiftDateStr(origEnd, finalDays);
          }

          if (newStart !== origStart || newFinish !== origEnd) {
            await onUpdateTaskDates(taskId, newStart, newFinish);
          }
        }

        dragRef.current = null;
      }

      setDragMode(null);
      setDeltaDays(0);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [isEditMode, onUpdateTaskDates, startStr, endStr, dayWidth, taskId]);

  const previewStart = dragMode === 'move' || dragMode === 'resize-start'
    ? shiftDateStr(startStr, deltaDays)
    : startStr;

  const previewEnd = dragMode === 'move' || dragMode === 'resize-end'
    ? shiftDateStr(endStr, deltaDays)
    : endStr;

  return {
    isDraggingDate: dragMode !== null,
    dragMode,
    deltaDays,
    previewStart,
    previewEnd,
    handleBarDragStart: (e: React.PointerEvent) => startDrag(e, 'move'),
    handleLeftResizeStart: (e: React.PointerEvent) => startDrag(e, 'resize-start'),
    handleRightResizeStart: (e: React.PointerEvent) => startDrag(e, 'resize-end'),
  };
}
