import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { parseDateTime } from '../../lib/utils';
import { ViewMode, TimeUnit } from './ganttTypes';
import { useSyncScroll } from './GanttHooks';
import { Project, Task } from '../../types';

interface UseGanttTimelineParams {
  filterStartDate: string;
  filterEndDate: string;
  printDateRangeOverride?: { start: Date; end: Date };
  paginatedProjects?: Project[];
  tasks?: Task[];
  getGroupTasksForProject?: (p: Project) => Task[];
  globalYearFilter?: string;
}

export function useGanttTimeline({
  filterStartDate,
  filterEndDate,
  printDateRangeOverride,
  paginatedProjects,
  tasks,
  getGroupTasksForProject,
  globalYearFilter
}: UseGanttTimelineParams) {
  const viewMode = useAppStore((state) => state.ganttViewMode);
  const setViewMode = useAppStore((state) => state.setGanttViewMode);
  const dayWidth = useAppStore((state) => state.ganttDayWidth);
  const setDayWidth = useAppStore((state) => state.setGanttDayWidth);
  const scaleInput = useAppStore((state) => state.ganttScaleInput);
  const setScaleInput = useAppStore((state) => state.setGanttScaleInput);
  const isWidthChanged = useAppStore((state) => state.isGanttWidthChanged);
  const setIsWidthChanged = useAppStore((state) => state.setIsGanttWidthChanged);
  const saveDayWidth = useAppStore((state) => state.saveGanttDayWidth);

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

    if (!start || !end) {
      let minFound: Date | null = null;
      let maxFound: Date | null = null;

      if (paginatedProjects && paginatedProjects.length > 0) {
        paginatedProjects.forEach((p) => {
          const pStart = p.start ? parseDateTime(p.start) : (p.computedTakStart ? parseDateTime(p.computedTakStart) : null);
          const pEnd = p.opening ? parseDateTime(p.opening) : (p.computedOpening ? parseDateTime(p.computedOpening) : (p.handover ? parseDateTime(p.handover) : (p.computedTakCompl ? parseDateTime(p.computedTakCompl) : null)));

          if (pStart) {
            if (!minFound || pStart < minFound) minFound = pStart;
          }
          if (pEnd) {
            if (!maxFound || pEnd > maxFound) maxFound = pEnd;
          }

          if (getGroupTasksForProject) {
            const groupTasks = getGroupTasksForProject(p);
            groupTasks.forEach((t) => {
              const tStart = t.start ? parseDateTime(t.start) : null;
              const tEnd = t.finish ? parseDateTime(t.finish) : null;
              if (tStart) {
                if (!minFound || tStart < minFound) minFound = tStart;
              }
              if (tEnd) {
                if (!maxFound || tEnd > maxFound) maxFound = tEnd;
              }
            });
          }
        });
      }

      if (minFound && maxFound) {
        // Expand start to 1st day of month
        const s = new Date(minFound);
        s.setDate(1);
        s.setHours(0, 0, 0, 0);

        // Expand end to last day of month
        const e = new Date(maxFound);
        e.setMonth(e.getMonth() + 1, 0);
        e.setHours(23, 59, 59, 999);

        if (!start) start = s;
        if (!end) end = e;
      } else {
        const targetYear = globalYearFilter && globalYearFilter !== 'all' && !isNaN(parseInt(globalYearFilter, 10))
          ? parseInt(globalYearFilter, 10)
          : new Date().getFullYear();

        if (!start) {
          start = new Date(targetYear, 0, 1);
        }
        if (!end) {
          end = new Date(targetYear, 11, 31);
        }
      }
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
  }, [filterStartDate, filterEndDate, printDateRangeOverride, paginatedProjects, getGroupTasksForProject, globalYearFilter, viewMode]);

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
