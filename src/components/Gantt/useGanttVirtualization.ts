import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task } from '../../types';
import { GanttTableRow } from './ganttTypes';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { rollupParentTaskDatesAndStatus } from '../../lib/taskRollupService';

interface UseGanttVirtualizationParams {
  paginatedProjects: Project[];
  expandedProjects: string[];
  expandedModularSet: Set<string>;
  hiddenRowsSet: Set<string>;
  getGroupTasksForProject: (p: Project) => Task[];
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  handleMainScroll: (e: React.UIEvent<HTMLDivElement>) => void;
}

export function useGanttVirtualization({
  paginatedProjects,
  expandedProjects,
  expandedModularSet,
  hiddenRowsSet,
  getGroupTasksForProject,
  tableContainerRef,
  handleMainScroll
}: UseGanttVirtualizationParams) {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setViewportHeight(entry.contentRect.height || 800);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tableContainerRef]);

  const handleCombinedMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    handleMainScroll(e);
    const top = e.currentTarget.scrollTop;
    if (scrollRafRef.current !== null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(top);
    });
  }, [handleMainScroll]);

  // Flatten Gantt Rows
  const flatGanttRows = useMemo(() => {
    const rows: GanttTableRow[] = [];

    paginatedProjects.forEach((p, pIdx) => {
      const pId = p.id || p.code;
      const isProjectExpanded = expandedProjects.includes(pId);
      const isProjectHidden = hiddenRowsSet.has(`proj-${pId}`);

      rows.push({
        type: 'project',
        key: `proj-${pId}`,
        project: p,
        projectIndex: pIdx,
        isExpanded: isProjectExpanded,
        isHidden: isProjectHidden
      });

      if (!isProjectExpanded) return;

      const rawTasks = getGroupTasksForProject(p).filter(t => {
        if ((!t.name || !String(t.name).trim()) && (!t.start || !String(t.start).trim()) && (!t.finish || !String(t.finish).trim())) {
          return false;
        }
        return true;
      });
      if (!rawTasks || rawTasks.length === 0) return;

      const rolledUpTasks = rollupParentTaskDatesAndStatus(rawTasks, []);
      const pTasks = sortGroupTasks(rolledUpTasks);

      // Create index map for sequential numbering
      const pTaskIndexMap = new Map<string, number>();
      pTasks.forEach((t, idx) => {
        if (t.id) pTaskIndexMap.set(t.id, idx);
      });

      // Group parent and child tasks
      const parentTasks: Task[] = [];
      const childTasksMap = new Map<string, Task[]>();

      // 1. Index tasks in project by ID and taskCodePhu for robust parent matching
      const projectTaskById = new Map<string, Task>();
      const projectTaskByCode = new Map<string, Task>();
      pTasks.forEach(t => {
        if (t.id) projectTaskById.set(String(t.id), t);
        if (t.taskCodePhu) {
          projectTaskByCode.set(String(t.taskCodePhu).trim().toLowerCase(), t);
        }
      });

      // 2. Identify tasks that are referenced as parent tasks by other tasks in this project
      const parentTaskIdsInProject = new Set<string>();
      pTasks.forEach(t => {
        const rawParentId = t.parentTaskId || (t as any).parentId;
        if (rawParentId) {
          const parentKey = String(rawParentId).trim().toLowerCase();
          const matchedParent = projectTaskById.get(String(rawParentId)) || projectTaskByCode.get(parentKey);
          if (matchedParent && String(matchedParent.id) !== String(t.id)) {
            parentTaskIdsInProject.add(String(matchedParent.id));
          }
        }
      });

      // 3. Partition tasks into root parentTasks vs childTasksMap
      pTasks.forEach(t => {
        const isSelfParent = parentTaskIdsInProject.has(String(t.id));
        const rawParentId = t.parentTaskId || (t as any).parentId;

        // If t is a parent task containing subtasks, it MUST be a root parent task (cannot be hidden as a child)
        if (rawParentId && !isSelfParent) {
          const parentKey = String(rawParentId).trim().toLowerCase();
          const matchedParent = projectTaskById.get(String(rawParentId)) || projectTaskByCode.get(parentKey);

          // ONLY treat as child if matchedParent exists in this project and is not self
          if (matchedParent && String(matchedParent.id) !== String(t.id)) {
            const effectiveParentId = String(matchedParent.id);
            if (!childTasksMap.has(effectiveParentId)) {
              childTasksMap.set(effectiveParentId, []);
            }
            childTasksMap.get(effectiveParentId)!.push(t);
            return;
          }
        }

        // If no valid matched parent exists in this project, or t is a parent task itself,
        // treat t as a root parent task so it is ALWAYS rendered and NEVER lost!
        parentTasks.push(t);
      });

      const sortedParentTasks = sortGroupTasks(parentTasks);

      sortedParentTasks.forEach((t, ptIdx) => {
        const isTaskHidden = hiddenRowsSet.has(`task-${t.id}`);
        const rawChildren = childTasksMap.get(String(t.id)) || childTasksMap.get(t.id) || [];
        const children = sortGroupTasks(rawChildren);
        const hasChildren = children.length > 0;
        const isModularExpanded = expandedModularSet.has(String(t.id)) || expandedModularSet.has(t.id);
        const tIndex = pTaskIndexMap.get(t.id) ?? ptIdx;

        rows.push({
          type: 'task',
          key: `task-${t.id}`,
          task: t,
          taskIndex: tIndex,
          project: p,
          isChild: false,
          hasChildren,
          childCount: children.length,
          childTasks: children,
          isModularExpanded,
          isHidden: isTaskHidden
        });

        if (hasChildren && isModularExpanded) {
          children.forEach((ct, ctIdx) => {
            const isChildHidden = hiddenRowsSet.has(`task-${ct.id}`);
            const ctIndex = pTaskIndexMap.get(ct.id) ?? (tIndex + ctIdx + 1);
            rows.push({
              type: 'task',
              key: `task-${ct.id}`,
              task: ct,
              taskIndex: ctIndex,
              project: p,
              parentTask: t,
              isChild: true,
              hasChildren: false,
              childCount: 0,
              isModularExpanded: false,
              isHidden: isChildHidden
            });
          });
        }
      });

      // 4. Safety Net: Render any leftover tasks in childTasksMap that were not in sortedParentTasks
      const renderedParentIds = new Set(sortedParentTasks.map(pt => String(pt.id)));
      childTasksMap.forEach((leftoverChildren, pId) => {
        if (!renderedParentIds.has(String(pId))) {
          leftoverChildren.forEach(ct => {
            const isChildHidden = hiddenRowsSet.has(`task-${ct.id}`);
            const ctIndex = pTaskIndexMap.get(ct.id) ?? 0;
            rows.push({
              type: 'task',
              key: `task-${ct.id}`,
              task: ct,
              taskIndex: ctIndex,
              project: p,
              isChild: false,
              hasChildren: false,
              childCount: 0,
              isModularExpanded: false,
              isHidden: isChildHidden
            });
          });
        }
      });
    });

    return rows;
  }, [
    paginatedProjects,
    expandedProjects,
    expandedModularSet,
    hiddenRowsSet,
    getGroupTasksForProject
  ]);

  // Index row heights and offsets
  const { totalHeight, rowOffsets } = useMemo(() => {
    let currentOffset = 0;
    const offsets: number[] = [];

    for (let i = 0; i < flatGanttRows.length; i++) {
      offsets.push(currentOffset);
      const row = flatGanttRows[i];
      if (row.isHidden) {
        currentOffset += 0;
      } else if (row.type === 'project') {
        currentOffset += 48; // project row height (h-12)
      } else {
        currentOffset += 40; // task row height (h-10)
      }
    }

    return { totalHeight: currentOffset, rowOffsets: offsets };
  }, [flatGanttRows]);

  // Virtual window slice indices
  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    if (flatGanttRows.length === 0) {
      return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }

    const bufferPx = 300;
    const startY = Math.max(0, scrollTop - bufferPx);
    const endY = scrollTop + viewportHeight + bufferPx;

    let s = 0;
    let e = flatGanttRows.length;

    // Binary search startIndex
    let low = 0;
    let high = flatGanttRows.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (rowOffsets[mid] < startY) {
        s = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // Binary search endIndex
    low = s;
    high = flatGanttRows.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (rowOffsets[mid] <= endY) {
        e = mid + 1;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const topPad = rowOffsets[s] || 0;
    const bottomPad = Math.max(0, totalHeight - (rowOffsets[e] || totalHeight));

    return {
      startIndex: s,
      endIndex: Math.min(e, flatGanttRows.length),
      paddingTop: topPad,
      paddingBottom: bottomPad
    };
  }, [flatGanttRows.length, rowOffsets, scrollTop, viewportHeight, totalHeight]);

  const visibleGanttRows = useMemo(() => {
    return flatGanttRows.slice(startIndex, endIndex);
  }, [flatGanttRows, startIndex, endIndex]);

  return {
    flatGanttRows,
    visibleGanttRows,
    startIndex,
    endIndex,
    paddingTop,
    paddingBottom,
    totalHeight,
    scrollTop,
    viewportHeight,
    handleCombinedMainScroll
  };
}
