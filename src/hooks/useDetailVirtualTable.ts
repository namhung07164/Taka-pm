import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Project, Task, DelegationGroup } from '../types';
import { matchesAdvancedSearch, computePlanProgressPercent, computeActProgressPercent, formatDisplayDateMain, formatDisplayDateTime } from '../lib/utils';
import { DetailTableRow } from '../components/DetailTabParts/detailTabTypes';

interface UseDetailVirtualTableParams {
  filteredProjects: Project[];
  visibleCount: number;
  projectInfoMap: Map<string, any>;
  getProjectInfo: (p: Project) => any;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  expandedCodes: string[];
  delegationGroups: DelegationGroup[];
  lowerSearchTerm: string;
  deferredSearchTerm: string;
}

const OVERSCAN = 10;

export function useDetailVirtualTable({
  filteredProjects,
  visibleCount,
  projectInfoMap,
  getProjectInfo,
  sortConfig,
  expandedCodes,
  delegationGroups,
  lowerSearchTerm,
  deferredSearchTerm,
}: UseDetailVirtualTableParams) {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(650);
  const scrollRafIdRef = useRef<number | null>(null);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const updateSize = () => {
      setContainerHeight(el.clientHeight || 650);
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
    }
    scrollRafIdRef.current = requestAnimationFrame(() => {
      setScrollTop(target.scrollTop);
      scrollRafIdRef.current = null;
    });
  }, []);

  const allVisibleTaskIds = useMemo(() => {
    return filteredProjects.slice(0, visibleCount).flatMap(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      return (pInfo.sortedTasks || []).map((t: Task) => t.id);
    });
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo]);

  const flatTableRows = useMemo(() => {
    const rows: DetailTableRow[] = [];
    const visibleProjects = filteredProjects.slice(0, visibleCount);

    visibleProjects.forEach((p, pIdx) => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      let groupTasks: Task[] = pInfo.sortedTasks || [];

      if (sortConfig && sortConfig.key) {
        groupTasks = [...groupTasks].sort((a, b) => {
          const key = sortConfig.key as keyof Task;
          const aVal = a[key] !== undefined && a[key] !== null ? a[key] : '';
          const bVal = b[key] !== undefined && b[key] !== null ? b[key] : '';
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }

      const effectiveTaskCount = groupTasks.length > 0 
        ? groupTasks.length 
        : (p.taskCount !== undefined 
            ? p.taskCount 
            : (p.taskSummaries?.length ?? 0));
      const isExpanded = expandedCodes.includes(String(p.id!));
      const hasDelegatedSubTask = groupTasks.some(t => t.delegation);
      const isProjDelegationOn = !!(p.delegation || hasDelegatedSubTask);

      const planProgressPercent = groupTasks.length > 0 ? computePlanProgressPercent(groupTasks) : (p.computedPlanProgress ?? 0);
      const actProgressPercent = groupTasks.length > 0 ? computeActProgressPercent(groupTasks, delegationGroups) : (p.computedActProgress ?? 0);

      const isProjectMatch = deferredSearchTerm
        ? matchesAdvancedSearch(deferredSearchTerm, [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party])
        : true;
      const tasksToRender = isProjectMatch ? groupTasks : groupTasks.filter((t, idx) => {
        const taskFields = [
          t.taskCodePhu,
          `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
          t.name,
          t.duration,
          t.start,
          t.finish,
          t.party,
          formatDisplayDateMain(t.start),
          formatDisplayDateTime(t.start),
          formatDisplayDateMain(t.finish),
          formatDisplayDateTime(t.finish)
        ];
        const notesFields = t.notes?.map(n => String(n.content || '')) || [];
        return matchesAdvancedSearch(deferredSearchTerm, [...taskFields, ...notesFields]);
      });

      rows.push({
        type: 'project',
        key: `project-${p.id || `${p.code}-${p.year}-${p.no}`}`,
        project: p,
        projectIndex: pIdx,
        effectiveTaskCount,
        isExpanded,
        groupTasks,
        isProjDelegationOn,
        planProgressPercent,
        actProgressPercent,
      });

      if (isExpanded) {
        tasksToRender.forEach((t) => {
          const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
          const i = originalIndex !== -1 ? originalIndex : 0;
          rows.push({
            type: 'task',
            key: `task-${t.id}`,
            task: t,
            taskIndex: i,
            project: p,
            projectIndex: pIdx,
            groupTasks,
          });
        });
      }
    });

    return rows;
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo, sortConfig, expandedCodes, delegationGroups, lowerSearchTerm, deferredSearchTerm]);

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
      }
      high = mid - 1;
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

  return {
    tableContainerRef,
    scrollTop,
    containerHeight,
    handleScroll,
    allVisibleTaskIds,
    flatTableRows,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
  };
}
