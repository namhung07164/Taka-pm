import { useEffect, useRef, useCallback, useMemo } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { parseDateTime } from '../../lib/utils';
import { getExactDays } from './GanttBar';

interface UseGanttFocusTrackingParams {
  tasks: Task[];
  projects: Project[];
  initialFocusTaskId?: string;
  ganttTabFocusTaskId?: string | null;
  setGanttTabFocusTaskId: (id: string | null) => void;
  onClearFocus?: () => void;
  expandedProjects: string[];
  setExpandedProjectIds?: (ids: string[]) => void;
  expandedModularTasks: string[];
  setExpandedModularTasks?: (updater: (prev: string[]) => string[]) => void;
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
  topScrollRef: React.RefObject<HTMLDivElement | null>;
  startDate: Date;
  dayWidth: number;
}

export function useGanttFocusTracking({
  tasks,
  projects,
  initialFocusTaskId,
  ganttTabFocusTaskId,
  setGanttTabFocusTaskId,
  onClearFocus,
  expandedProjects,
  setExpandedProjectIds,
  expandedModularTasks,
  setExpandedModularTasks,
  tableContainerRef,
  mainScrollRef,
  topScrollRef,
  startDate,
  dayWidth,
}: UseGanttFocusTrackingParams) {
  const effectiveFocusTaskId = ganttTabFocusTaskId || initialFocusTaskId || null;
  const lastScrolledTaskIdRef = useRef<string | null>(null);

  const focusedTask = useMemo(() => {
    if (!effectiveFocusTaskId) return null;
    return tasks.find((t) => t.id === effectiveFocusTaskId) || null;
  }, [tasks, effectiveFocusTaskId]);

  const handleClearFocus = useCallback(() => {
    setGanttTabFocusTaskId(null);
    lastScrolledTaskIdRef.current = null;
    if (onClearFocus) onClearFocus();
  }, [onClearFocus, setGanttTabFocusTaskId]);

  // Center horizontally & vertically on the focused task
  const scrollToFocusedTask = useCallback(() => {
    if (!effectiveFocusTaskId) return;

    // 1. Horizontal scroll to task bar on timeline
    if (focusedTask?.start) {
      const dStart = parseDateTime(focusedTask.start);
      if (dStart && !isNaN(dStart.getTime())) {
        const offsetDays = getExactDays(startDate, dStart);
        const targetLeft = Math.max(0, offsetDays * dayWidth - 250);
        if (mainScrollRef.current) {
          mainScrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
        if (topScrollRef.current) {
          topScrollRef.current.scrollTo({ left: targetLeft, behavior: 'smooth' });
        }
      }
    }

    // 2. Vertical scroll to task row
    let attempts = 0;
    const tryScroll = () => {
      const el = document.getElementById(`gantt-task-row-${effectiveFocusTaskId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (attempts < 10) {
        attempts++;
        setTimeout(tryScroll, 60);
      }
    };
    requestAnimationFrame(tryScroll);
  }, [effectiveFocusTaskId, focusedTask, startDate, dayWidth, mainScrollRef, topScrollRef]);

  // Auto-reveal: expand parent project & modular group, then scroll
  useEffect(() => {
    if (!effectiveFocusTaskId || !focusedTask) return;

    // Only auto-expand & auto-scroll on change of focused task ID
    if (lastScrolledTaskIdRef.current === effectiveFocusTaskId) return;
    lastScrolledTaskIdRef.current = effectiveFocusTaskId;

    // 1. Auto-expand parent project if not expanded
    const parentProj = projects.find(
      (p) =>
        (p.id && String(p.id) === String(focusedTask.projectId)) ||
        (p.code && focusedTask.projectCode && p.code.toLowerCase() === focusedTask.projectCode.toLowerCase())
    );

    if (parentProj?.id && setExpandedProjectIds) {
      const projIdStr = String(parentProj.id);
      if (!expandedProjects.includes(projIdStr)) {
        setExpandedProjectIds(Array.from(new Set([...expandedProjects, projIdStr])));
      }
    }

    // 2. Auto-expand modular parent task if this task is a child
    if (focusedTask.parentTaskId && setExpandedModularTasks) {
      const parentTaskIdStr = String(focusedTask.parentTaskId);
      if (!expandedModularTasks.includes(parentTaskIdStr)) {
        setExpandedModularTasks((prev) => Array.from(new Set([...prev, parentTaskIdStr])));
      }
    }

    // 3. Scroll to the task
    const timer = setTimeout(() => {
      scrollToFocusedTask();
    }, 120);

    return () => clearTimeout(timer);
  }, [
    effectiveFocusTaskId,
    focusedTask,
    projects,
    expandedProjects,
    setExpandedProjectIds,
    expandedModularTasks,
    setExpandedModularTasks,
    scrollToFocusedTask,
  ]);

  // Clear focus with Escape key when not in open modal
  useEffect(() => {
    if (!effectiveFocusTaskId) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen ||
          state.isCalendarSyncModalOpen;
        if (hasOpenModal) return;

        e.preventDefault();
        handleClearFocus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [effectiveFocusTaskId, handleClearFocus]);

  return {
    effectiveFocusTaskId,
    focusedTask,
    handleClearFocus,
    scrollToFocusedTask,
  };
}
