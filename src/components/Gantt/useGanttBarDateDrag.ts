import React, { useCallback, useEffect, useRef, useState } from 'react';
import { parseDateTime, formatToDatetimeLocal } from '../../lib/utils';

export interface UseGanttBarDateDragParams {
  taskId: string;
  startStr?: string;
  endStr?: string;
  dayWidth: number;
  isEditMode?: boolean;
  onUpdateTaskDates?: (taskId: string, start: string, end: string) => void;
}

export function useGanttBarDateDrag({
  taskId,
  startStr,
  endStr,
  dayWidth,
  isEditMode = false,
  onUpdateTaskDates,
}: UseGanttBarDateDragParams) {
  const [isDraggingDate, setIsDraggingDate] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const [deltaDays, setDeltaDays] = useState(0);
  const [previewStart, setPreviewStart] = useState(startStr || '');
  const [previewEnd, setPreviewEnd] = useState(endStr || '');

  const dragStartXRef = useRef(0);
  const initialDatesRef = useRef<{ start: Date; end: Date } | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.PointerEvent, type: 'move' | 'resize-start' | 'resize-end') => {
      if (!isEditMode) return;
      e.stopPropagation();

      const dStart = parseDateTime(startStr);
      const dEnd = parseDateTime(endStr);
      if (!dStart || !dEnd) return;

      setIsDraggingDate(true);
      setDragType(type);
      dragStartXRef.current = e.clientX;
      initialDatesRef.current = { start: new Date(dStart), end: new Date(dEnd) };
      setDeltaDays(0);
      setPreviewStart(startStr || '');
      setPreviewEnd(endStr || '');
    },
    [isEditMode, startStr, endStr]
  );

  const handleBarDragStart = (e: React.MouseEvent | React.PointerEvent) => handleDragStart(e, 'move');
  const handleLeftResizeStart = (e: React.MouseEvent | React.PointerEvent) => handleDragStart(e, 'resize-start');
  const handleRightResizeStart = (e: React.MouseEvent | React.PointerEvent) => handleDragStart(e, 'resize-end');

  useEffect(() => {
    if (!isDraggingDate) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!initialDatesRef.current || !dragType) return;

      const diffX = e.clientX - dragStartXRef.current;
      const days = Math.round(diffX / dayWidth);
      setDeltaDays(days);

      const msPerDay = 24 * 60 * 60 * 1000;
      const newStart = new Date(initialDatesRef.current.start.getTime());
      const newEnd = new Date(initialDatesRef.current.end.getTime());

      if (dragType === 'move') {
        newStart.setTime(newStart.getTime() + days * msPerDay);
        newEnd.setTime(newEnd.getTime() + days * msPerDay);
      } else if (dragType === 'resize-start') {
        newStart.setTime(newStart.getTime() + days * msPerDay);
        if (newStart.getTime() > newEnd.getTime()) {
          newStart.setTime(newEnd.getTime());
        }
      } else if (dragType === 'resize-end') {
        newEnd.setTime(newEnd.getTime() + days * msPerDay);
        if (newEnd.getTime() < newStart.getTime()) {
          newEnd.setTime(newStart.getTime());
        }
      }

      setPreviewStart(formatToDatetimeLocal(newStart));
      setPreviewEnd(formatToDatetimeLocal(newEnd));
    };

    const handlePointerUp = () => {
      if (isDraggingDate && onUpdateTaskDates && (previewStart !== startStr || previewEnd !== endStr)) {
        onUpdateTaskDates(taskId, previewStart, previewEnd);
      }
      setIsDraggingDate(false);
      setDragType(null);
      initialDatesRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingDate, dragType, dayWidth, taskId, onUpdateTaskDates, previewStart, previewEnd, startStr, endStr]);

  return {
    isDraggingDate,
    deltaDays,
    previewStart,
    previewEnd,
    handleBarDragStart,
    handleLeftResizeStart,
    handleRightResizeStart,
    handleDragEnd: () => setIsDraggingDate(false), // fallback
  };
}

export default useGanttBarDateDrag;
