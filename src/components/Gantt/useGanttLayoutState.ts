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
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    if (isMobile) {
      const savedMobile = safeGetDeviceItemLocal('taka_gantt_side_width', currentUserId);
      return savedMobile
        ? Math.max(140, Math.min(260, Number(savedMobile)))
        : Math.max(160, Math.min(220, Math.floor(window.innerWidth * 0.52)));
    }
    const saved = safeGetDeviceItemLocal('taka_gantt_side_width', currentUserId);
    return saved ? Math.max(180, Math.min(600, Number(saved))) : 360;
  });

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = safeGetDeviceItemLocal('taka_gantt_visible_columns', currentUserId);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? ['start', 'finish'] : ['start', 'finish', 'party', 'duration'];
  });

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const handleResize = () => {
      const currentScreenType = getDeviceScreenType();
      if (window.innerWidth < 768) {
        const maxMobileWidth = Math.max(
          160,
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
