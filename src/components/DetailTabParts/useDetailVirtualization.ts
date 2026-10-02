import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { DetailTableRow } from './detailTypes';

export interface UseDetailVirtualizationParams {
  flatTableRows: DetailTableRow[];
  initialFocusTaskId?: string;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  filteredProjectsLength: number;
}

const OVERSCAN = 10;

export function useDetailVirtualization({
  flatTableRows,
  initialFocusTaskId,
  visibleCount,
  setVisibleCount,
  filteredProjectsLength,
}: UseDetailVirtualizationParams) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(650);
  const scrollRafIdRef = useRef<number | null>(null);

  const flatTableRowsRef = useRef(flatTableRows);
  useEffect(() => {
    flatTableRowsRef.current = flatTableRows;
  }, [flatTableRows]);

  const { totalHeight, rowOffsets } = useMemo(() => {
    const totalRows = flatTableRows.length;
    const offsets = new Float64Array(totalRows + 1);
    let sum = 0;
    for (let i = 0; i < totalRows; i++) {
      offsets[i] = sum;
      sum += (flatTableRows[i].type === 'project' ? 42 : 36);
    }
    offsets[totalRows] = sum;
    return { totalHeight: sum, rowOffsets: offsets };
  }, [flatTableRows]);

  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const totalRows = flatTableRows.length;
    if (totalRows === 0) {
      return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }
    let low = 0;
    let high = totalRows - 1;
    let start = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rowOffsets[mid + 1] <= Math.max(0, scrollTop)) {
        low = mid + 1;
      } else {
        start = mid;
        high = mid - 1;
      }
    }

    const viewStart = Math.max(0, start - OVERSCAN);
    const bottomTarget = scrollTop + containerHeight;

    low = start;
    high = totalRows - 1;
    let end = totalRows - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rowOffsets[mid] < bottomTarget) {
        end = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const viewEnd = Math.min(totalRows, end + 1 + OVERSCAN);
    const topPad = rowOffsets[viewStart] || 0;
    const bottomPad = Math.max(0, totalHeight - (rowOffsets[viewEnd] || totalHeight));

    return {
      startIndex: viewStart,
      endIndex: viewEnd,
      paddingTop: topPad,
      paddingBottom: bottomPad,
    };
  }, [rowOffsets, totalHeight, scrollTop, containerHeight, flatTableRows.length]);

  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    const sh = target.scrollHeight;
    const ch = target.clientHeight;
    
    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
    }
    scrollRafIdRef.current = requestAnimationFrame(() => {
      setScrollTop(st);
      scrollRafIdRef.current = null;
    });

    if (sh - (st + ch) < 400) {
      if (visibleCount < filteredProjectsLength) {
        setVisibleCount(prev => Math.min(prev + 30, filteredProjectsLength));
      }
    }
  }, [visibleCount, filteredProjectsLength, setVisibleCount]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setContainerHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!initialFocusTaskId || !tableContainerRef.current) return;
    const idx = flatTableRows.findIndex(r => r.type === 'task' && r.task.id === initialFocusTaskId);
    if (idx >= 0 && rowOffsets[idx] !== undefined) {
      const targetScroll = Math.max(0, rowOffsets[idx] - 120);
      tableContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }, [initialFocusTaskId, flatTableRows, rowOffsets]);

  return {
    tableContainerRef,
    handleTableScroll,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    scrollTop,
    containerHeight,
    rowOffsets,
    totalHeight,
  };
}
