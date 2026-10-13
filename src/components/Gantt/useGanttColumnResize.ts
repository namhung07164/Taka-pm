import React, { useCallback, useRef, useState } from 'react';
import { safeGetDeviceItemLocal, safeSetDeviceItemLocal } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';

export interface GanttColumnWidths {
  start: number;
  finish: number;
  party: number;
  duration: number;
  predecessor: number;
}

export const DEFAULT_GANTT_COL_WIDTHS: GanttColumnWidths = {
  start: 85,
  finish: 85,
  party: 80,
  duration: 60,
  predecessor: 90,
};

export function useGanttColumnResize() {
  const currentUser = useAppStore(state => state.currentUser);
  
  const [colWidths, setColWidths] = useState<GanttColumnWidths>(() => {
    try {
      const saved = safeGetDeviceItemLocal('taka_gantt_col_widths', currentUser?.id);
      if (saved) {
        return { ...DEFAULT_GANTT_COL_WIDTHS, ...JSON.parse(saved) };
      }
    } catch (_) {}
    return DEFAULT_GANTT_COL_WIDTHS;
  });

  const resizingColRef = useRef<{
    colKey: keyof GanttColumnWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  const startResizingColumn = useCallback((colKey: keyof GanttColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = colWidths[colKey] || DEFAULT_GANTT_COL_WIDTHS[colKey];
    resizingColRef.current = { colKey, startX, startWidth };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingColRef.current) return;
      const { colKey: key, startX: sX, startWidth: sW } = resizingColRef.current;
      const delta = moveEvent.clientX - sX;
      
      const minW = key === 'duration' ? 35 : 45;
      const maxW = 350;
      const newWidth = Math.max(minW, Math.min(maxW, Math.round(sW + delta)));

      setColWidths(prev => {
        return { ...prev, [key]: newWidth };
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (resizingColRef.current) {
        setColWidths(latest => {
          safeSetDeviceItemLocal('taka_gantt_col_widths', JSON.stringify(latest), currentUser?.id);
          return latest;
        });
        resizingColRef.current = null;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [colWidths, currentUser?.id]);

  return {
    colWidths,
    setColWidths,
    startResizingColumn,
  };
}
