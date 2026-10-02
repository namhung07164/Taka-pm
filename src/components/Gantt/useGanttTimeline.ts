import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { parseDateTime } from '../../lib/utils';
import { ViewMode, TimeUnit } from './ganttTypes';
import { useSyncScroll } from './GanttHooks';

interface UseGanttTimelineParams {
  filterStartDate: string;
  filterEndDate: string;
  printDateRangeOverride?: { start: Date; end: Date };
}

export function useGanttTimeline({
  filterStartDate,
  filterEndDate,
  printDateRangeOverride
}: UseGanttTimelineParams) {
  const [viewMode, setViewMode] = useState<ViewMode>("monthly");
  
  const [dayWidth, setDayWidth] = useState<number>(() => {
    const saved = localStorage.getItem("taka_gantt_day_width");
    return saved ? Math.max(5, Math.min(120, Number(saved))) : 24;
  });

  const [isWidthChanged, setIsWidthChanged] = useState(false);
  const [scaleInput, setScaleInput] = useState(() => String(dayWidth));

  const saveDayWidth = useCallback(() => {
    localStorage.setItem("taka_gantt_day_width", String(dayWidth));
    setIsWidthChanged(false);
    useAppStore.getState().setToast({
      title: "Saved",
      message: `Default day width updated to ${dayWidth}px`
    });
  }, [dayWidth]);

  const [customToday, setCustomToday] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [isDraggingToday, setIsDraggingToday] = useState(false);

  const { topScrollRef, mainScrollRef, handleTopScroll, handleMainScroll } = useSyncScroll();

  // Timeline Units, StartDate, EndDate, TotalDays
  const { timeUnits, startDate, endDate, totalDays } = useMemo(() => {
    if (printDateRangeOverride) {
      const s = new Date(printDateRangeOverride.start);
      s.setHours(0, 0, 0, 0);
      const e = new Date(printDateRangeOverride.end);
      e.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      const units: TimeUnit[] = [];
      let curr = new Date(s);
      while (curr <= e) {
        units.push({
          date: new Date(curr),
          label: `${curr.getDate()}/${curr.getMonth() + 1}`,
          days: 1
        });
        curr.setDate(curr.getDate() + 1);
      }
      return { timeUnits: units, startDate: s, endDate: e, totalDays: Math.max(diffDays, 1) };
    }

    let start = filterStartDate ? parseDateTime(filterStartDate) : null;
    let end = filterEndDate ? parseDateTime(filterEndDate) : null;

    if (!start) {
      start = new Date();
      start.setFullYear(start.getFullYear() - 1, 0, 1);
    }
    if (!end) {
      end = new Date();
      end.setFullYear(end.getFullYear() + 2, 11, 31);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    const units: TimeUnit[] = [];
    let curr = new Date(start);

    if (viewMode === 'weekly') {
      while (curr <= end) {
        units.push({
          date: new Date(curr),
          label: `W${Math.ceil(curr.getDate() / 7)} - ${curr.getMonth() + 1}/${curr.getFullYear()}`,
          labelPrimary: `W${Math.ceil(curr.getDate() / 7)}`,
          labelSecondary: `${curr.getMonth() + 1}/${curr.getFullYear()}`,
          days: 7
        });
        curr.setDate(curr.getDate() + 7);
      }
    } else if (viewMode === 'quarterly') {
      while (curr <= end) {
        const q = Math.floor(curr.getMonth() / 3) + 1;
        units.push({
          date: new Date(curr),
          label: `Q${q} ${curr.getFullYear()}`,
          labelPrimary: `Q${q}`,
          labelSecondary: String(curr.getFullYear()),
          days: 90
        });
        curr.setMonth(curr.getMonth() + 3);
      }
    } else {
      // Monthly default
      while (curr <= end) {
        const daysInMonth = new Date(curr.getFullYear(), curr.getMonth() + 1, 0).getDate();
        units.push({
          date: new Date(curr),
          label: `${curr.toLocaleString('en-US', { month: 'short' })} ${curr.getFullYear()}`,
          labelPrimary: curr.toLocaleString('en-US', { month: 'short' }),
          labelSecondary: String(curr.getFullYear()),
          days: daysInMonth
        });
        curr.setMonth(curr.getMonth() + 1, 1);
      }
    }

    const totalDaysCount = Math.max(
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1,
      1
    );

    return {
      timeUnits: units,
      startDate: start,
      endDate: end,
      totalDays: totalDaysCount
    };
  }, [filterStartDate, filterEndDate, printDateRangeOverride, viewMode]);

  const calculateDateOffsetPx = useCallback(
    (targetDate: Date | null | undefined): number => {
      if (!targetDate || !startDate) return 0;
      const diffMs = targetDate.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays * dayWidth;
    },
    [startDate, dayWidth]
  );

  const getDateFromOffsetPx = useCallback(
    (offsetPx: number): Date => {
      const diffDays = offsetPx / dayWidth;
      const d = new Date(startDate);
      d.setDate(d.getDate() + Math.round(diffDays));
      return d;
    },
    [startDate, dayWidth]
  );

  const scrollToToday = useCallback(
    (smooth = true) => {
      const offsetPx = calculateDateOffsetPx(customToday);
      if (mainScrollRef.current) {
        const targetScroll = Math.max(0, offsetPx - 400);
        mainScrollRef.current.scrollTo({
          left: targetScroll,
          behavior: smooth ? 'smooth' : 'auto'
        });
      }
    },
    [calculateDateOffsetPx, customToday, mainScrollRef]
  );

  const handleTodayClick = useCallback(() => {
    scrollToToday(true);
  }, [scrollToToday]);

  return {
    viewMode,
    setViewMode,
    dayWidth,
    setDayWidth,
    isWidthChanged,
    setIsWidthChanged,
    scaleInput,
    setScaleInput,
    saveDayWidth,
    customToday,
    setCustomToday,
    isDraggingToday,
    setIsDraggingToday,
    timeUnits,
    startDate,
    endDate,
    totalDays,
    calculateDateOffsetPx,
    getDateFromOffsetPx,
    scrollToToday,
    handleTodayClick,
    topScrollRef,
    mainScrollRef,
    handleTopScroll,
    handleMainScroll
  };
}
