import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { 
  X, 
  GripHorizontal, 
  BarChartHorizontal, 
  Calendar, 
  ExternalLink,
  Layers
} from 'lucide-react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { cn, parseDateTime, getTaskStatus } from '../../lib/utils';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { QuickNavButton } from '../QuickNavButton';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Helper to format date concisely as "Dec 20"
const formatMonthDay = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const month = MONTH_NAMES[d.getMonth()];
  const day = d.getDate();
  return `${month} ${day}`;
};

// Bar color mapping matching GanttTab 100%
const getBarColor = (status: string, duration?: string | number) => {
  if (
    duration !== undefined &&
    duration !== "" &&
    parseFloat(String(duration)) === 0
  )
    return "bg-orange-500 hover:bg-orange-600";
  if (status === "On process" || status === "In Progress") return "bg-blue-500 hover:bg-blue-600";
  if (status === "Upcoming") return "bg-slate-700 dark:bg-slate-500 hover:bg-slate-800 dark:hover:bg-slate-400";
  if (status === "Completed") return "bg-green-500 hover:bg-green-600";
  if (status === "Handover") return "bg-blue-500 hover:bg-blue-600";
  if (status === "Canceled") return "bg-slate-400 hover:bg-slate-500";
  return "bg-slate-400 hover:bg-slate-500";
};

interface LayoutMiniGanttModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export const LayoutMiniGanttModal: React.FC<LayoutMiniGanttModalProps> = ({
  project,
  isOpen,
  onClose
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const tasks = useAppStore(state => state.tasks);
  const setActiveTab = useAppStore(state => state.setActiveTab);

  // Handle ESC key to close (AGENTS.md Rule 6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Raw tasks for this project (Prioritizes Zustand cache, falls back to embedded project.taskSummaries)
  const rawProjectTasks = useMemo(() => {
    if (!project) return [];
    const pId = project.id;
    const pCode = (project.code || '').trim().toLowerCase();
    const pYear = project.year ? String(project.year).trim() : '';
    const pStore = project.store ? String(project.store).trim().toLowerCase() : '';

    const matchedZustandTasks = tasks.filter(t => {
      if (t.isDeleted) return false;
      if (pId && t.projectId === pId) return true;
      if (pCode && String(t.projectCode || '').trim().toLowerCase() === pCode) {
        if (pYear && t.projectYear && String(t.projectYear).trim() !== pYear) return false;
        if (pStore && t.projectStore && String(t.projectStore).trim().toLowerCase() !== pStore) return false;
        return true;
      }
      return false;
    });

    if (matchedZustandTasks.length > 0) {
      return matchedZustandTasks;
    }

    // 0-Read Fallback: Use embedded taskSummaries already present inside the Project document
    if (project.taskSummaries && project.taskSummaries.length > 0) {
      return project.taskSummaries.map((ts: any, idx: number) => ({
        id: `ts_${idx}`,
        name: ts.name || 'Task',
        start: ts.start || '',
        finish: ts.finish || '',
        duration: ts.duration || '1',
        taskCodePhu: ts.taskCodePhu || `#${idx + 1}`,
        runningStatus: ts.runningStatus || (ts.approval === 'Approved' ? 'Completed' : 'Upcoming'),
        approval: ts.approval,
        party: ts.party,
        projectCode: project.code,
        projectId: project.id,
        orderIndex: ts.orderIndex !== undefined ? ts.orderIndex : idx
      })) as Task[];
    }

    return [];
  }, [tasks, project]);

  // Exact GanttTab task ordering with sortGroupTasks and parent-child tree hierarchy
  const orderedGanttRows = useMemo(() => {
    if (rawProjectTasks.length === 0) return [];

    // 1. Sort tasks according to GanttTab standard algorithm (orderIndex, fallback to stable id)
    const sortedRawTasks = sortGroupTasks(rawProjectTasks);

    // 2. Build parent-child tree mapping (modular tasks) with circular reference protection
    const childTasksMap = new Map<string, Task[]>();
    const isChildSet = new Set<string>();
    const ptMap = new Map(sortedRawTasks.map(pt => [String(pt.id), pt]));

    sortedRawTasks.forEach((t) => {
      if (t.parentTaskId) {
        const currParentId = String(t.parentTaskId);
        if (ptMap.has(currParentId)) {
          let rootParentId = currParentId;
          const visited = new Set<string>([String(t.id), rootParentId]);
          while (true) {
            const pTask = ptMap.get(rootParentId);
            if (pTask && pTask.parentTaskId && !visited.has(String(pTask.parentTaskId))) {
              if (ptMap.has(String(pTask.parentTaskId))) {
                rootParentId = String(pTask.parentTaskId);
                visited.add(rootParentId);
                continue;
              }
            }
            break;
          }
          isChildSet.add(String(t.id));
          const list = childTasksMap.get(rootParentId) || [];
          list.push(t);
          childTasksMap.set(rootParentId, list);
        }
      }
    });

    type MiniGanttRow = {
      task: Task;
      isChild: boolean;
      hasChildren: boolean;
      childCount: number;
    };

    const rows: MiniGanttRow[] = [];

    sortedRawTasks.forEach((t) => {
      const tIdStr = String(t.id);
      if (isChildSet.has(tIdStr)) return; // Subtasks are rendered directly beneath their parent

      const rawChildren = childTasksMap.get(tIdStr) || [];
      const children = sortGroupTasks(rawChildren);
      const hasChildren = children.length > 0;

      rows.push({
        task: t,
        isChild: false,
        hasChildren,
        childCount: children.length
      });

      if (hasChildren) {
        children.forEach((c) => {
          rows.push({
            task: c,
            isChild: true,
            hasChildren: false,
            childCount: 0
          });
        });
      }
    });

    return rows;
  }, [rawProjectTasks]);

  // Calculate timeline bounding dates
  const timelineBounds = useMemo(() => {
    const dates: number[] = [];
    
    // Project dates
    const projStart = parseDateTime(project.computedTakStart || project.start);
    const projFinish = parseDateTime(project.computedTakCompl || project.handover || project.opening);
    if (projStart) dates.push(projStart.getTime());
    if (projFinish) dates.push(projFinish.getTime());

    // Task dates
    rawProjectTasks.forEach(t => {
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
        totalDays: 30
      };
    }

    const minTime = Math.min(...dates);
    const maxTime = Math.max(...dates);
    const totalDays = Math.max(1, Math.round((maxTime - minTime) / 86400000) + 1);

    return {
      startDate: new Date(minTime),
      finishDate: new Date(maxTime),
      totalDays
    };
  }, [project, rawProjectTasks]);

  // Calculate Today position on timeline (Today Line)
  const todayData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    
    const startTime = new Date(timelineBounds.startDate);
    startTime.setHours(0, 0, 0, 0);
    
    const finishTime = new Date(timelineBounds.finishDate);
    finishTime.setHours(23, 59, 59, 999);

    const totalDays = Math.max(1, timelineBounds.totalDays);
    const offsetDays = (todayTime - startTime.getTime()) / 86400000;
    const percent = (offsetDays / totalDays) * 100;

    const isInTimeline = percent >= 0 && percent <= 100;
    const clampedPercent = Math.min(100, Math.max(0, percent));

    return {
      today,
      formattedToday: formatMonthDay(today),
      percent: clampedPercent,
      isInTimeline
    };
  }, [timelineBounds]);

  // Overall task stats matching GanttTab logic
  const stats = useMemo(() => {
    const total = rawProjectTasks.length;
    let completed = 0;
    let inProgress = 0;
    let upcoming = 0;
    let milestone = 0;

    rawProjectTasks.forEach(t => {
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
      milestone
    };
  }, [rawProjectTasks]);

  if (!isOpen || !project) return null;

  const storeDisplay = (project.store || 'HCM').toUpperCase();
  const isHcm = storeDisplay === 'HCM';

  // Navigate to full Gantt Tab
  const handleOpenFullGantt = () => {
    const currentExpanded = useAppStore.getState().expandedProjectIds;
    if (project.id && !currentExpanded.includes(project.id)) {
      useAppStore.getState().setExpandedProjectIds([...currentExpanded, project.id]);
    }
    useAppStore.getState().setIsTasksRequested(true);
    setActiveTab('gantt');
    onClose();
  };

  const modalContent = (
    <div 
      className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-3 sm:p-5 overscroll-contain"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Semi-transparent backdrop for focus */}
      <div 
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }} 
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs pointer-events-auto transition-opacity cursor-pointer overscroll-contain" 
      />

      {/* Draggable Window (AGENTS.md Rule 11) */}
      <Draggable 
        handle=".modal-handle" 
        cancel="button, input, select, textarea, .no-drag" 
        nodeRef={nodeRef} 
        bounds="parent"
      >
        <div
          ref={nodeRef}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="relative pointer-events-auto bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[85vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 overscroll-contain"
          style={{ cursor: 'default' }}
        >
          {/* 1. Header (Handle) */}
          <div className="modal-handle cursor-grab active:cursor-grabbing px-4 py-3 bg-slate-50 dark:bg-[#252528] border-b border-slate-200 dark:border-[#38383a] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <GripHorizontal className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <span className={cn(
                  "text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0",
                  isHcm 
                    ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:border-blue-800/80" 
                    : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80"
                )}>
                  {storeDisplay}
                </span>
                <span className="font-mono font-extrabold text-sm text-blue-700 dark:text-[#8ab4f8] tracking-tight">
                  {project.code}
                </span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[320px]">
                  {project.name}
                </span>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0 no-drag">
              <QuickNavButton 
                project={project} 
                title={`Quick Navigator (${project.code})`} 
                className="no-drag"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="no-drag p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer active:scale-95 touch-manipulation"
                title="Close Mini Gantt (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. Project Stats & Timeline Range Sub-header */}
          <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] flex items-center justify-between gap-3 flex-wrap text-xs shrink-0">
            {/* Left: Overall Dates */}
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-medium">Timeline:</span>
                <span className="font-bold font-mono text-[11px] text-blue-600 dark:text-[#8ab4f8]">
                  {formatMonthDay(timelineBounds.startDate)}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-bold font-mono text-[11px] text-pink-600 dark:text-pink-400">
                  {formatMonthDay(timelineBounds.finishDate)}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">({timelineBounds.totalDays}d)</span>
              </div>
            </div>

            {/* Right: Task Status Badges matching GanttTab */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {todayData.isInTimeline && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-rose-400 border border-red-200 dark:border-red-800/80">
                  Today: {todayData.formattedToday}
                </span>
              )}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {stats.total} Tasks
              </span>
              {stats.completed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400 border border-green-200 dark:border-green-800/80">
                  {stats.completed} Completed
                </span>
              )}
              {stats.inProgress > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-[#8ab4f8] border border-blue-200 dark:border-blue-800/80">
                  {stats.inProgress} On process
                </span>
              )}
              {stats.upcoming > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {stats.upcoming} Upcoming
                </span>
              )}
              {stats.milestone > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400 border border-orange-200 dark:border-orange-800/80">
                  {stats.milestone} Milestone
                </span>
              )}
            </div>
          </div>

          {/* 3. Gantt Chart Area */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[55vh] flex flex-col bg-white dark:bg-[#1a1a1c]">
            {orderedGanttRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Layers className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
                <div className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                  No tasks registered for this project yet
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-sm">
                  Tasks will appear here once defined in Task Detail or Gantt chart.
                </div>
              </div>
            ) : (
              <div className="min-w-[550px] flex flex-col">
                {/* Timeline Grid Header */}
                <div className="sticky top-0 z-10 flex items-center border-b border-slate-200 dark:border-[#333336] bg-slate-100/90 dark:bg-[#202022] backdrop-blur-xs text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {/* Left Column: Task Name & Dates */}
                  <div className="w-[240px] sm:w-[270px] px-3 py-1.5 border-r border-slate-200 dark:border-[#333336] shrink-0 uppercase tracking-wider flex items-center justify-between">
                    <span>Task</span>
                    <span className="font-mono text-[9px] text-slate-400 font-medium">Dates (Start - End)</span>
                  </div>
                  {/* Right Column: Time Scale Markers */}
                  <div className="flex-1 px-3 py-1.5 relative flex justify-between uppercase tracking-wider overflow-visible">
                    <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8]">{formatMonthDay(timelineBounds.startDate)}</span>
                    <span className="hidden sm:inline">Timeline Progress</span>
                    <span className="font-mono font-bold text-pink-600 dark:text-pink-400">{formatMonthDay(timelineBounds.finishDate)}</span>

                    {/* Today Pin Header Marker */}
                    {todayData.isInTimeline && (
                      <div 
                        className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20"
                        style={{ left: `calc(12px + (100% - 24px) * ${todayData.percent / 100})` }}
                        title={`Today: ${todayData.formattedToday}`}
                      >
                        <div className="bg-red-500 dark:bg-rose-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded shadow-xs tracking-wider flex items-center gap-0.5 whitespace-nowrap">
                          <span>TODAY</span>
                          <span className="opacity-90 font-mono">({todayData.formattedToday})</span>
                        </div>
                        <div className="w-0.5 flex-1 bg-red-500 dark:bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Task Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {orderedGanttRows.map(({ task: t, isChild, hasChildren }, idx) => {
                    const tStart = parseDateTime(t.start);
                    const tFinish = parseDateTime(t.finish);
                    const rawDuration = parseFloat(String(t.duration || ''));
                    const isMilestone = !isNaN(rawDuration) && rawDuration === 0;
                    const duration = isNaN(rawDuration) || rawDuration <= 0 ? (isMilestone ? 0 : 1) : rawDuration;

                    // Dates in "Dec 20" style with General tab color coding (Start: Blue, Finish: Pink)
                    const sFormatted = formatMonthDay(tStart);
                    const fFormatted = formatMonthDay(tFinish);

                    // Compute task status matching GanttTab logic
                    let computedStatus = getTaskStatus(t.start, t.finish);
                    const statusStr = (t.runningStatus || '').toLowerCase();
                    if (t.approval === 'Approved' || statusStr.includes('complete')) {
                      computedStatus = 'Completed';
                    } else if (statusStr.includes('cancel')) {
                      computedStatus = 'Canceled';
                    } else if (statusStr.includes('handover')) {
                      computedStatus = 'Handover';
                    } else if (statusStr.includes('process') || statusStr.includes('progress')) {
                      computedStatus = 'On process';
                    }

                    // Bar color matching GanttTab logic 100%
                    const barColor = getBarColor(computedStatus, t.duration);

                    // Compute relative Gantt Bar position
                    let leftPercent = 0;
                    let widthPercent = 10;

                    if (tStart && tFinish) {
                      const offsetDays = Math.max(0, Math.round((tStart.getTime() - timelineBounds.startDate.getTime()) / 86400000));
                      const taskDays = Math.max(1, Math.round((tFinish.getTime() - tStart.getTime()) / 86400000) + 1);
                      leftPercent = Math.min(95, Math.max(0, (offsetDays / timelineBounds.totalDays) * 100));
                      widthPercent = Math.min(100 - leftPercent, Math.max(2.5, (taskDays / timelineBounds.totalDays) * 100));
                    }

                    return (
                      <div 
                        key={t.id || idx}
                        className={cn(
                          "flex items-center hover:bg-slate-50 dark:hover:bg-[#252528]/50 transition-colors group h-9",
                          isChild && "bg-slate-50/40 dark:bg-[#1a1a1c]/40"
                        )}
                      >
                        {/* Task Info Cell: Name & Dates (Start: Blue, Finish: Pink) */}
                        <div className="w-[240px] sm:w-[270px] px-3 py-1 border-r border-slate-100 dark:border-[#333336] shrink-0 flex items-center justify-between gap-2 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {isChild && (
                              <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] select-none pl-1.5 shrink-0">↳</span>
                            )}
                            <span 
                              className={cn(
                                "text-xs truncate flex-1",
                                isChild ? "text-slate-600 dark:text-slate-300 font-normal" : "text-slate-800 dark:text-slate-100 font-medium"
                              )}
                              title={`${t.name}${sFormatted || fFormatted ? ` (${sFormatted || ''} - ${fFormatted || ''})` : ''}`}
                            >
                              {t.name}
                            </span>
                          </div>
                          {(sFormatted || fFormatted) && (
                            <span 
                              className="font-mono text-[10px] shrink-0 tabular-nums font-semibold flex items-center gap-0.5"
                              title={`Start: ${t.start || 'N/A'} • Finish: ${t.finish || 'N/A'}`}
                            >
                              {sFormatted && (
                                <span className="text-blue-600 dark:text-[#8ab4f8]">{sFormatted}</span>
                              )}
                              {sFormatted && fFormatted && sFormatted !== fFormatted && (
                                <span className="text-slate-400 dark:text-slate-500 font-normal">-</span>
                              )}
                              {fFormatted && sFormatted !== fFormatted && (
                                <span className="text-pink-600 dark:text-pink-400">{fFormatted}</span>
                              )}
                              {!sFormatted && fFormatted && (
                                <>
                                  <span className="text-slate-400 dark:text-slate-500 font-normal">→</span>
                                  <span className="text-pink-600 dark:text-pink-400">{fFormatted}</span>
                                </>
                              )}
                            </span>
                          )}
                        </div>

                        {/* Gantt Bar Cell */}
                        <div className="flex-1 px-3 py-1 relative h-full flex items-center">
                          {/* Background Grid Lines (25%, 50%, 75%) */}
                          <div className="absolute inset-0 flex pointer-events-none opacity-20">
                            <div className="w-1/4 border-r border-dashed border-slate-400" />
                            <div className="w-1/4 border-r border-dashed border-slate-400" />
                            <div className="w-1/4 border-r border-dashed border-slate-400" />
                          </div>

                          {/* Vertical Today Line through task rows */}
                          {todayData.isInTimeline && (
                            <div 
                              className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none z-10"
                              style={{ left: `calc(12px + (100% - 24px) * ${todayData.percent / 100})` }}
                            >
                              <div className="w-0.5 h-full bg-red-500/80 dark:bg-rose-500/80 shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
                            </div>
                          )}

                          {/* Task Bar / Milestone diamond matching GanttTab */}
                          {isMilestone ? (
                            <div 
                              className="absolute top-1/2 -translate-y-1/2 flex items-center cursor-pointer group/bar"
                              style={{ left: `${leftPercent}%` }}
                              title={`${t.name}\nMilestone: ${t.start || t.finish || 'N/A'}\nStatus: ${computedStatus}`}
                            >
                              <div className="w-3.5 h-3.5 rotate-45 rounded-xs shadow-xs bg-orange-500 hover:bg-orange-600 transition-transform group-hover/bar:scale-110" />
                              <span className="ml-1.5 text-[9px] font-bold text-orange-600 dark:text-orange-400 whitespace-nowrap">
                                0d
                              </span>
                            </div>
                          ) : (
                            <div
                              className={cn(
                                "relative h-5 rounded-md shadow-xs transition-all flex items-center overflow-hidden cursor-pointer",
                                barColor
                              )}
                              style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`
                              }}
                              title={`${t.name}\nStart: ${t.start || 'N/A'}\nFinish: ${t.finish || 'N/A'}\nDuration: ${duration}d\nStatus: ${computedStatus}${t.party ? `\nParty: ${t.party}` : ''}`}
                            >
                              {/* Inner Shading for completion */}
                              {computedStatus === 'Completed' && (
                                <div className="absolute top-0 left-0 bottom-0 w-full bg-black/15 pointer-events-none" />
                              )}

                              {/* Label inside bar if wide enough */}
                              {widthPercent > 12 && (
                                <span className="relative z-10 px-1.5 text-[9px] font-extrabold text-white truncate drop-shadow-xs">
                                  {duration}d
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Footer Summary */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#202022] border-t border-slate-200 dark:border-[#38383a] flex items-center justify-between text-xs shrink-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Drag header to move &bull; Esc to close
            </span>
            <button
              type="button"
              onClick={handleOpenFullGantt}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all active:scale-95 touch-manipulation flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <BarChartHorizontal className="w-3.5 h-3.5" />
              <span>Full Gantt View</span>
            </button>
          </div>
        </div>
      </Draggable>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default LayoutMiniGanttModal;
