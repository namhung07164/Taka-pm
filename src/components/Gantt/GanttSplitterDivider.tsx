import React, { useState, useRef, useCallback, useEffect } from 'react';
import { safeSetDeviceItemLocal } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';
import { GanttColumnWidths } from './useGanttColumnResize';

interface GanttSplitterDividerProps {
  sideWidth: number;
  setSideWidth: React.Dispatch<React.SetStateAction<number>>;
  visibleColumns: string[];
  colWidths?: GanttColumnWidths;
  onAutoFit?: (autoWidth: number) => void;
  className?: string;
}

export const GanttSplitterDivider: React.FC<GanttSplitterDividerProps> = React.memo(({
  sideWidth,
  setSideWidth,
  visibleColumns,
  colWidths,
  onAutoFit,
  className = '',
}) => {
  const currentUser = useAppStore(state => state.currentUser);
  const [isDragging, setIsDragging] = useState(false);
  const [dragWidth, setDragWidth] = useState(sideWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  // Calculate content-based ideal auto-fit width
  const calculateAutoFitWidth = useCallback(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const baseNameWidth = isMobile ? 150 : 220;
    const indexColWidth = 40;

    let totalColsWidth = 0;
    if (visibleColumns.includes('start')) totalColsWidth += colWidths?.start ?? 85;
    if (visibleColumns.includes('finish')) totalColsWidth += colWidths?.finish ?? 85;
    if (visibleColumns.includes('party')) totalColsWidth += colWidths?.party ?? 80;
    if (visibleColumns.includes('duration')) totalColsWidth += colWidths?.duration ?? 60;
    if (visibleColumns.includes('predecessor')) totalColsWidth += colWidths?.predecessor ?? 90;

    const ideal = indexColWidth + baseNameWidth + totalColsWidth;
    const minW = isMobile ? 160 : 200;
    const maxW = typeof window !== 'undefined' ? Math.min(850, Math.floor(window.innerWidth * 0.75)) : 650;
    return Math.max(minW, Math.min(maxW, ideal));
  }, [visibleColumns, colWidths]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const autoW = calculateAutoFitWidth();
    setSideWidth(autoW);
    safeSetDeviceItemLocal('taka_gantt_side_width', String(autoW), currentUser?.id);
    if (onAutoFit) onAutoFit(autoW);
    useAppStore.getState().setToast({
      title: "Auto-Fit Frozen Columns",
      message: `Frozen columns width auto-fitted to ${autoW}px`
    });
  }, [calculateAutoFitWidth, setSideWidth, currentUser?.id, onAutoFit]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startW = sideWidth;
    dragRef.current = { startX, startW };
    setIsDragging(true);
    setDragWidth(startW);

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const isMobile = window.innerWidth < 768;
      const minW = isMobile ? 150 : 180;
      const maxW = Math.min(850, Math.floor(window.innerWidth * 0.75));
      const delta = moveEvent.clientX - dragRef.current.startX;
      const newW = Math.max(minW, Math.min(maxW, Math.round(dragRef.current.startW + delta)));

      setDragWidth(newW);
      setSideWidth(newW);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (dragRef.current) {
        const isMobile = window.innerWidth < 768;
        const minW = isMobile ? 150 : 180;
        const maxW = Math.min(850, Math.floor(window.innerWidth * 0.75));
        const delta = upEvent.clientX - dragRef.current.startX;
        const finalW = Math.max(minW, Math.min(maxW, Math.round(dragRef.current.startW + delta)));

        setSideWidth(finalW);
        safeSetDeviceItemLocal('taka_gantt_side_width', String(finalW), currentUser?.id);
        dragRef.current = null;
      }
      setIsDragging(false);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }, [sideWidth, setSideWidth, currentUser?.id]);

  return (
    <>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={sideWidth}
        aria-label="Resize Frozen Columns Divider"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSideWidth(prev => {
              const next = Math.max(160, prev - 15);
              safeSetDeviceItemLocal('taka_gantt_side_width', String(next), currentUser?.id);
              return next;
            });
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setSideWidth(prev => {
              const next = Math.min(800, prev + 15);
              safeSetDeviceItemLocal('taka_gantt_side_width', String(next), currentUser?.id);
              return next;
            });
          }
        }}
        className={`absolute top-0 bottom-0 z-40 w-2.5 -ml-1 cursor-col-resize group touch-none select-none flex items-center justify-center transition-colors ${className}`}
        style={{ left: `${sideWidth}px` }}
        title="Drag boundary to resize frozen columns • Double-click to auto-fit"
      >
        {/* Visual Line */}
        <div
          className={`w-[3px] h-full transition-colors duration-150 ${
            isDragging
              ? 'bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
              : 'bg-transparent group-hover:bg-blue-500/80 group-focus:bg-blue-500'
          }`}
        />

        {/* Small Center Handle Pill */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3.5 h-7 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
            isDragging ? '!opacity-100 ring-2 ring-blue-500' : ''
          }`}
        >
          <div className="w-0.5 h-3 bg-slate-400 dark:text-slate-500 rounded-full" />
        </div>
      </div>

      {/* Floating Measurement Badge during drag */}
      {isDragging && (
        <div
          className="fixed z-[99999] top-16 pointer-events-none transform -translate-x-1/2 bg-slate-900/90 text-white font-mono text-[11px] font-bold px-3 py-1.5 rounded-full shadow-xl border border-blue-400/50 backdrop-blur-md flex items-center gap-2 animate-in fade-in"
          style={{ left: `${dragWidth}px` }}
        >
          <span className="text-blue-300">Frozen:</span>
          <span>{dragWidth}px</span>
          <span className="text-[9.5px] text-slate-400 font-sans font-normal border-l border-slate-700 pl-2">
            Double-click to auto-fit
          </span>
        </div>
      )}
    </>
  );
});

GanttSplitterDivider.displayName = 'GanttSplitterDivider';
