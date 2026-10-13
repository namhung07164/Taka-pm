import React, { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef } from 'react';
import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { parseDateTime } from '../../lib/utils';
import { safeSetItemSession } from '../../lib/storage';

export interface UseGanttFocusParams {
  tasks: Task[];
  projects: Project[];
  initialFocusTaskId?: string | null;
  ganttTabFocusTaskId?: string | null;
  setGanttTabFocusTaskId: (id: string | null) => void;
  setExpandedModularTasks: React.Dispatch<React.SetStateAction<string[]>>;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  startDate: Date;
  dayWidth: number;
  sideWidth: number;
  onClearFocus?: () => void;
}

export function useGanttFocus({
  tasks,
  projects,
  initialFocusTaskId,
  ganttTabFocusTaskId,
  setGanttTabFocusTaskId,
  setExpandedModularTasks,
  mainScrollRef,
  topScrollRef,
  startDate,
  dayWidth,
  sideWidth,
  onClearFocus,
}: UseGanttFocusParams) {
  const activeFocusId = ganttTabFocusTaskId || initialFocusTaskId || null;

  const focusedTask = useMemo(() => {
    if (!activeFocusId || !tasks || tasks.length === 0) return null;
    const cleanId = String(activeFocusId).replace('task-', '').trim();
    return tasks.find(t => String(t.id) === cleanId) || null;
  }, [activeFocusId, tasks]);

  const focusedProject = useMemo(() => {
    if (!focusedTask || !projects || projects.length === 0) return null;
    return projects.find(
      p => (p.id && String(p.id) === String(focusedTask.projectId)) ||
           (p.code && focusedTask.projectCode && p.code.trim().toUpperCase() === focusedTask.projectCode.trim().toUpperCase())
    ) || null;
  }, [focusedTask, projects]);

  const lastFocusedIdRef = useRef<string | null>(null);

  // Clear focus helper
  const handleClearFocus = useCallback(() => {
    setGanttTabFocusTaskId(null);
    useAppStore.getState().setGanttTabFilterProjectId('');
    if (onClearFocus) onClearFocus();
  }, [setGanttTabFocusTaskId, onClearFocus]);

  // Locate task: smoothly scroll horizontally to task bar and vertically to task row
  const locateTask = useCallback(() => {
    if (!focusedTask || !mainScrollRef.current) return;
    const scrollContainer = mainScrollRef.current;

    // 1. Horizontal Timeline centering
    const dStart = parseDateTime(focusedTask.start);
    const dFinish = parseDateTime(focusedTask.finish);

    let targetScrollLeft = scrollContainer.scrollLeft;
    if (dStart && startDate) {
      const diffMs = dStart.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      const taskLeftPx = diffDays * dayWidth;
      const durationDays = dFinish ? Math.max(1, (dFinish.getTime() - dStart.getTime()) / (1000 * 60 * 60 * 24)) : 1;
      const taskCenterPx = taskLeftPx + (durationDays * dayWidth) / 2;
      const visibleTimelineWidth = Math.max(150, scrollContainer.clientWidth - sideWidth);
      targetScrollLeft = Math.max(0, taskCenterPx - visibleTimelineWidth / 2);
    }

    // 2. Vertical Row centering
    const rowEl = document.getElementById(`gantt-task-row-${focusedTask.id}`);
    let targetScrollTop = scrollContainer.scrollTop;
    if (rowEl) {
      const containerRect = scrollContainer.getBoundingClientRect();
      const rowRect = rowEl.getBoundingClientRect();
      const currentTopOffset = rowRect.top - containerRect.top;
      targetScrollTop = scrollContainer.scrollTop + currentTopOffset - (containerRect.height / 2) + (rowRect.height / 2);
    }

    scrollContainer.scrollTo({
      left: targetScrollLeft,
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });

    if (topScrollRef.current) {
      topScrollRef.current.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth'
      });
    }
  }, [focusedTask, startDate, dayWidth, sideWidth, mainScrollRef, topScrollRef]);

  // Auto-Reveal & Auto-Center when activeFocusId changes
  useEffect(() => {
    if (!activeFocusId || !focusedTask) return;

    // Only trigger full auto-reveal on new focus selection
    const isNewFocus = lastFocusedIdRef.current !== activeFocusId;
    lastFocusedIdRef.current = activeFocusId;

    if (!isNewFocus) return;

    // A. Auto-reveal parent project
    const pId = focusedProject?.id || (focusedTask.projectId ? String(focusedTask.projectId) : null);
    if (pId) {
      const currentExpandedProjects = useAppStore.getState().expandedProjectIds;
      if (!currentExpandedProjects.includes(pId)) {
        useAppStore.getState().setExpandedProjectIds([...currentExpandedProjects, pId]);
      }
    }

    // B. Auto-reveal parent modular task (if child task)
    if (focusedTask.parentTaskId) {
      const ancestorIds: string[] = [];
      let curParentId: any = focusedTask.parentTaskId;
      const visited = new Set<string>();

      while (curParentId && !visited.has(String(curParentId))) {
        const parentIdStr = String(curParentId);
        visited.add(parentIdStr);
        ancestorIds.push(parentIdStr);
        const parent = tasks.find(
          t => String(t.id) === parentIdStr ||
               (t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === parentIdStr.toLowerCase())
        );
        curParentId = parent?.parentTaskId;
      }

      if (ancestorIds.length > 0) {
        setExpandedModularTasks(prev => {
          const next = Array.from(new Set([...prev, ...ancestorIds]));
          safeSetItemSession("taka_gantt_modular_expanded", JSON.stringify(next));
          return next;
        });
      }
    }

    // C. Auto-center with cascading timeouts to allow DOM & virtualization to mount row
    const timer1 = setTimeout(() => {
      locateTask();
    }, 120);

    const timer2 = setTimeout(() => {
      locateTask();
    }, 320);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [activeFocusId, focusedTask, focusedProject, tasks, setExpandedModularTasks, locateTask]);

  // Global Escape keyboard shortcut to exit Focus Mode
  useEffect(() => {
    if (!activeFocusId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClearFocus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFocusId, handleClearFocus]);

  return {
    activeFocusId,
    focusedTask,
    focusedProject,
    locateTask,
    handleClearFocus,
  };
}
