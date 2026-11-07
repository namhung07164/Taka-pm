import React, { useEffect, useRef, useState } from 'react';
import {
  safeGetDeviceItemLocal,
  safeSetDeviceItemLocal,
  getDeviceScreenType,
} from '../../lib/storage';

export function useGanttLayoutState(currentUserId?: string) {
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  const [sideWidth, setSideWidth] = useState<number>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    if (w < 768) {
      const savedMobile = safeGetDeviceItemLocal('taka_gantt_side_width', currentUserId);
      return savedMobile
        ? Math.max(150, Math.min(240, Number(savedMobile)))
        : Math.max(165, Math.min(210, Math.floor(w * 0.48)));
    }
    const saved = safeGetDeviceItemLocal('taka_gantt_side_width', currentUserId);
    if (saved) return Math.max(240, Math.min(680, Number(saved)));
    return w < 1024 ? 380 : 500;
  });

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = safeGetDeviceItemLocal('taka_gantt_visible_columns', currentUserId);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    if (w < 768) return [];
    if (w < 1024) return ['start', 'finish'];
    return ['start', 'finish', 'party', 'duration'];
  });

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const handleResize = () => {
      const currentScreenType = getDeviceScreenType();
      if (window.innerWidth < 768) {
        const maxMobileWidth = Math.max(
          165,
          Math.min(220, Math.floor(window.innerWidth * 0.52))
        );
        setSideWidth((prev) => Math.min(prev, maxMobileWidth));
      }

      if (currentScreenType !== prevScreenTypeRef.current) {
        prevScreenTypeRef.current = currentScreenType;
        const savedCols = safeGetDeviceItemLocal('taka_gantt_visible_columns', currentUserId);
        if (savedCols) {
          try {
            setVisibleColumns(JSON.parse(savedCols));
          } catch (_) {}
        }
        const savedSide = safeGetDeviceItemLocal('taka_gantt_side_width', currentUserId);
        if (savedSide) {
          setSideWidth(Number(savedSide));
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUserId]);

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId];
      safeSetDeviceItemLocal('taka_gantt_visible_columns', JSON.stringify(next), currentUserId);
      return next;
    });
  };

  return {
    filterStartDate,
    setFilterStartDate,
    filterEndDate,
    setFilterEndDate,
    tempStartDate,
    setTempStartDate,
    tempEndDate,
    setTempEndDate,
    sideWidth,
    setSideWidth,
    visibleColumns,
    handleToggleColumn,
  };
}
