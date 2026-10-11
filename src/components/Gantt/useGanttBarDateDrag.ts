import React, { useState, useRef, useCallback } from 'react';
import { parseDateTime } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';

export interface UseGanttBarDateDragParams {
  taskId: string;
  startStr?: string;
  endStr?: string;
  dayWidth: number;
  startDate: Date;
  isEditMode?: boolean;
}

export function useGanttBarDateDrag({
  taskId,
  startStr,
  endStr,
  dayWidth,
  startDate,
  isEditMode = false,
}: UseGanttBarDateDragParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragType, setDragType] = useState<'move' | 'resize-start' | 'resize-end' | null>(null);
  const dragStartXRef = useRef(0);
  const initialDatesRef = useRef<{ start: Date; end: Date } | null>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent | React.PointerEvent, type: 'move' | 'resize-start' | 'resize-end') => {
      if (!isEditMode) return;
      e.stopPropagation();

      const dStart = parseDateTime(startStr);
      const dEnd = parseDateTime(endStr);
      if (!dStart || !dEnd) return;

      setIsDragging(true);
      setDragType(type);
      dragStartXRef.current = e.clientX;
      initialDatesRef.current = { start: dStart, end: dEnd };
    },
    [isEditMode, startStr, endStr]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragType(null);
    initialDatesRef.current = null;
  }, []);

  return {
    isDragging,
    dragType,
    handleDragStart,
    handleDragEnd,
  };
}

export default useGanttBarDateDrag;
