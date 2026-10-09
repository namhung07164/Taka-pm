import { useEffect, useMemo } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { parseDateTime, getTaskStatus } from '../../lib/utils';
import { sortGroupTasks, extractSubtaskIndex } from '../../lib/ganttUtils';
import { safeSetItemLocal, safeSetItemSession } from '../../lib/storage';

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const formatMonthDay = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate();
  return `${month} ${day}`;
};

export const getBarColor = (status: string, duration?: string | number) => {
  if (
    duration !== undefined &&
    duration !== '' &&
    parseFloat(String(duration)) === 0
  )
    return 'bg-amber-500 hover:bg-amber-600 border border-amber-600';
  const s = String(status || '').toLowerCase().trim();
  if (s === 'completed' || s === 'done')
    return 'bg-emerald-500 hover:bg-emerald-600 border border-emerald-600';
  if (s === 'on process' || s === 'in progress')
    return 'bg-blue-500 hover:bg-blue-600 border border-blue-600';
  if (s === 'delayed' || s === 'delay' || s === 'overdue')
    return 'bg-rose-500 hover:bg-rose-600 border border-rose-600';
  if (s === 'upcoming' || s === 'planned')
    return 'bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 dark:hover:bg-slate-400 border border-slate-500/80';
  if (s === 'handover')
    return 'bg-blue-500 hover:bg-blue-600 border border-blue-600';
  if (s === 'canceled' || s === 'cancelled')
    return 'bg-slate-300 dark:bg-slate-600 hover:bg-slate-400 text-slate-600 border border-slate-400';
  return 'bg-slate-400 dark:bg-slate-500 hover:bg-slate-500 border border-slate-500/80';
};

export interface MiniGanttRow {
  task: Task;
  isChild: boolean;
  hasChildren: boolean;
  childCount: number;
}

export function useMiniGanttData(project: Project | null, onClose: () => void) {
  const tasks = useAppStore((state) => state.tasks);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const isTasksRequested = useAppStore((state) => state.isTasksRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);

  // Ensure tasks are fetched from Firestore when Mini Gantt is opened
  useEffect(() => {
    if (project && !isTasksRequested) {
      setIsTasksRequested(true);
    }
  }, [project, isTasksRequested, setIsTasksRequested]);

  // Raw tasks for this project (matching Main Gantt getGroupTasksForProject logic)
  const rawProjectTasks = useMemo(() => {
    if (!project) return [];

    const pId = project.id ? String(project.id) : '';
    const pCode = (project.code || '').trim().toUpperCase();
    const pYear = project.year ? String(project.year).trim() : '';
    const pStore = project.store ? String(project.store).trim().toUpperCase() : '';

    const matchedZustandTasks = tasks.filter((t) => {
      if (t.isDeleted) return false;
      if (pId && t.projectId && String(t.projectId) === pId) return true;
      const tCode = String(t.projectCode || '').trim().toUpperCase();
      if (!tCode || tCode !== pCode) return false;
      const tYear = t.projectYear ? String(t.projectYear).trim() : '';
      const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
      if (pYear && tYear && tYear !== pYear) return false;
      if (pStore && tStore && tStore !== pStore) return false;
      return true;
    });

    if (matchedZustandTasks.length > 0) {
      return matchedZustandTasks;
    }

    if (project.taskSummaries && project.taskSummaries.length > 0) {
      return project.taskSummaries.map((ts: any, idx: number) => {
        const subtaskNum = extractSubtaskIndex(ts.taskCodePhu);
        const derivedOrderIndex =
          subtaskNum !== null
            ? subtaskNum - 1
            : ts.orderIndex !== undefined && ts.orderIndex !== null
            ? ts.orderIndex
            : idx;
        const fallbackCode = subtaskNum !== null ? `#${subtaskNum}` : ts.taskCodePhu || '';

        let durStr = '1';
        if (ts.duration !== undefined && ts.duration !== null && String(ts.duration).trim() !== '') {
          durStr = String(ts.duration).trim();
        }

        return {
          id: ts.id || ts.taskId || `ts_${idx}`,
          name: ts.name || 'Task',
          start: ts.start || '',
          finish: ts.finish || '',
          duration: durStr,
          taskCodePhu: fallbackCode,
          runningStatus: ts.runningStatus || (ts.approval === 'Approved' ? 'Completed' : 'Upcoming'),
          approval: ts.approval,
          party: ts.party,
          parentTaskId: ts.parentTaskId,
          projectCode: project.code,
          projectId: project.id,
          orderIndex: derivedOrderIndex,
        } as Task;
      });
    }

    return [];
  }, [project, tasks]);

  // Exact Main Gantt (useGanttVirtualization.ts) task ordering & hierarchy
  const orderedGanttRows: MiniGanttRow[] = useMemo(() => {
    if (rawProjectTasks.length === 0) return [];

    const pTasks = sortGroupTasks(rawProjectTasks);

    // Group parent and child tasks (identical to Main Gantt)
    const parentTasks: Task[] = [];
    const childTasksMap = new Map<string, Task[]>();

    // Index tasks in project by ID and taskCodePhu for robust parent matching
    const projectTaskById = new Map<string, Task>();
    const projectTaskByCode = new Map<string, Task>();
    pTasks.forEach((t) => {
      if (t.id) projectTaskById.set(String(t.id), t);
      if (t.taskCodePhu) {
        projectTaskByCode.set(String(t.taskCodePhu).trim().toLowerCase(), t);
      }
    });

    pTasks.forEach((t) => {
      const rawParentId = t.parentTaskId || (t as any).parentId;
      if (rawParentId) {
        const parentKey = String(rawParentId).trim().toLowerCase();
        const matchedParent =
          projectTaskById.get(String(rawParentId)) || projectTaskByCode.get(parentKey);
        const effectiveParentId = matchedParent ? matchedParent.id : String(rawParentId);

        if (!childTasksMap.has(effectiveParentId)) {
          childTasksMap.set(effectiveParentId, []);
        }
        childTasksMap.get(effectiveParentId)!.push(t);
      } else {
        parentTasks.push(t);
      }
    });

    // Exactly like Main Gantt: sort parent tasks independently
    const sortedParentTasks = sortGroupTasks(parentTasks);

    const rows: MiniGanttRow[] = [];

    sortedParentTasks.forEach((t) => {
      const rawChildren = childTasksMap.get(t.id) || [];
      // Exactly like Main Gantt: sort child tasks of this parent independently
      const children = sortGroupTasks(rawChildren);
      const hasChildren = children.length > 0;

      rows.push({
        task: t,
        isChild: false,
        hasChildren,
        childCount: children.length,
      });

      if (hasChildren) {
        children.forEach((c) => {
          rows.push({
            task: c,
            isChild: true,
            hasChildren: false,
            childCount: 0,
          });
        });
      }
    });

    return rows;
  }, [rawProjectTasks]);

  // Calculate timeline bounding dates
  const timelineBounds = useMemo(() => {
    if (!project) {
      const now = new Date().getTime();
      return {
        startDate: new Date(now),
        finishDate: new Date(now + 30 * 86400000),
        totalDays: 30,
      };
    }
    const dates: number[] = [];

    const projStart = parseDateTime(project.computedTakStart || project.start);
    const projFinish = parseDateTime(
      project.computedTakCompl || project.handover || project.opening
    );
    if (projStart) dates.push(projStart.getTime());
    if (projFinish) dates.push(projFinish.getTime());

    rawProjectTasks.forEach((t) => {
      const s = parseDateTime(t.start);
      const f = parseDateTime(t.finish);
      if (s) dates.push(s.getTime());
      if (f) dates.push(f.getTime());
    });

    const now = new Date().getTime();
    if (dates.length === 0) {
      return {
        startDate: new Date(now),
        finishDate: new Date(now + 30 * 86400000),
        totalDays: 30,
      };
    }

    const minTime = Math.min(...dates);
    const maxTime = Math.max(...dates);
    const totalDays = Math.max(1, Math.round((maxTime - minTime) / 86400000) + 1);

    return {
      startDate: new Date(minTime),
      finishDate: new Date(maxTime),
      totalDays,
    };
  }, [project, rawProjectTasks]);

  // Calculate Today position on timeline (Today Line)
  const todayData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const startTime = new Date(timelineBounds.startDate);
    startTime.setHours(0, 0, 0, 0);

    const totalDays = Math.max(1, timelineBounds.totalDays);
    const offsetDays = (todayTime - startTime.getTime()) / 86400000;
    const percent = (offsetDays / totalDays) * 100;

    const isInTimeline = percent >= 0 && percent <= 100;
    const clampedPercent = Math.min(100, Math.max(0, percent));

    return {
      today,
      formattedToday: formatMonthDay(today),
      percent: clampedPercent,
      isInTimeline,
    };
  }, [timelineBounds]);

  // Overall task stats matching GanttTab logic
  const stats = useMemo(() => {
    const total = rawProjectTasks.length;
    let completed = 0;
    let inProgress = 0;
    let upcoming = 0;
    let milestone = 0;

    rawProjectTasks.forEach((t) => {
      const rawDur = parseFloat(String(t.duration || ''));
      if (!isNaN(rawDur) && rawDur === 0) {
        milestone++;
        return;
      }
      const s = (t.runningStatus || '').toLowerCase();
      let status = getTaskStatus(t.start, t.finish);
      if (t.approval === 'Approved' || s.includes('complete')) {
        status = 'Completed';
      } else if (s.includes('process') || s.includes('progress')) {
        status = 'On process';
      }

      if (status === 'Completed') {
        completed++;
      } else if (status === 'On process') {
        inProgress++;
      } else {
        upcoming++;
      }
    });

    return {
      total,
      completed,
      inProgress,
      upcoming,
      milestone,
    };
  }, [rawProjectTasks]);

  const handleOpenFullGantt = () => {
    if (!project) return;
    const yearVal = project.year;
    if (yearVal) {
      useAppStore.getState().setGlobalYearFilter(String(yearVal));
    } else {
      useAppStore.getState().setGlobalYearFilter('all');
    }

    const storeVal = project.store;
    const currentUser = useAppStore.getState().currentUser;
    if (storeVal) {
      useAppStore.getState().setGlobalStoreFilter(storeVal);
      if (currentUser?.id) {
        safeSetItemLocal(`taka_store_filter_${currentUser.id}`, String(storeVal));
      }
    } else {
      useAppStore.getState().setGlobalStoreFilter('all');
      if (currentUser?.id) {
        safeSetItemLocal(`taka_store_filter_${currentUser.id}`, 'all');
      }
    }

    if (project.code) {
      safeSetItemSession('taka_gantt_search', project.code);
    }

    const targetProjectId = project.id ? String(project.id) : (project.code || '');
    useAppStore.getState().setGanttTabFilterProjectId(targetProjectId);

    const currentExpanded = useAppStore.getState().expandedProjectIds;
    if (project.id && !currentExpanded.includes(project.id)) {
      useAppStore.getState().setExpandedProjectIds([...currentExpanded, project.id]);
    }
    useAppStore.getState().setIsTasksRequested(true);

    safeSetItemSession('taka_gantt_trigger_today', 'true');
    useAppStore.getState().triggerGanttToday();
    setActiveTab('gantt');
    onClose();
  };

  return {
    rawProjectTasks,
    orderedGanttRows,
    timelineBounds,
    todayData,
    stats,
    handleOpenFullGantt,
  };
}
