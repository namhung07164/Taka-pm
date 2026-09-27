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
import { cn, parseDateTime } from '../../lib/utils';

// Helper to format date concisely as DD/MM
const formatCompactDate = (d: Date | null): string => {
  if (!d || isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
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
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  const expandedProjectIds = useAppStore(state => state.expandedProjectIds);
  const setExpandedProjectIds = useAppStore(state => state.setExpandedProjectIds);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);

  // Zero-Read Guard: Only request tasks from Firestore if NO embedded taskSummaries and NO cached tasks in Zustand
  useEffect(() => {
    if (!project?.id) return;
    const hasCachedTasks = tasks.some(t => 
      t.projectId === project.id || 
      (t.projectCode && project.code && t.projectCode.trim().toUpperCase() === project.code.trim().toUpperCase())
    );
    const hasSummaries = (project.taskSummaries?.length ?? 0) > 0;
    
    // If we already have tasks in cache or embedded summaries, DO NOT trigger any Firestore queries! (0 Reads)
    if (hasCachedTasks || hasSummaries) {
      return;
    }

    // If neither exists, load only this project's tasks on-demand
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
    if (!expandedProjectIds.includes(project.id)) {
      setExpandedProjectIds([...expandedProjectIds, project.id]);
    }

    return () => {
      // Clean up on unmount: remove this project from expandedProjectIds to stop listener
      const current = useAppStore.getState().expandedProjectIds;
      if (current.includes(project.id)) {
        useAppStore.getState().setExpandedProjectIds(current.filter(id => id !== project.id));
      }
    };
  }, [project?.id, project?.code, project?.taskSummaries, tasks, isTasksRequested, expandedProjectIds, setIsTasksRequested, setExpandedProjectIds]);

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

  // Filter tasks for this project (Prioritizes Zustand cache, falls back to embedded project.taskSummaries)
  const projectTasks = useMemo(() => {
    if (!project) return [];
    const pId = project.id;
    const pCode = (project.code || '').trim().toUpperCase();

    const matchedZustandTasks = tasks.filter(t => {
      if (t.isDeleted) return false;
      if (pId && t.projectId === pId) return true;
      if (pCode && t.projectCode && t.projectCode.trim().toUpperCase() === pCode) return true;
      return false;
    });

    if (matchedZustandTasks.length > 0) {
      return matchedZustandTasks.sort((a, b) => {
        if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
          return a.orderIndex - b.orderIndex;
        }
        if (a.taskCodePhu && b.taskCodePhu) {
          return a.taskCodePhu.localeCompare(b.taskCodePhu, undefined, { numeric: true });
        }
        const dateA = a.start ? new Date(a.start).getTime() : 0;
        const dateB = b.start ? new Date(b.start).getTime() : 0;
        return dateA - dateB;
      });
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
        projectId: project.id
      })) as Task[];
    }

    return [];
  }, [tasks, project]);

  // Calculate timeline bounding dates
  const timelineBounds = useMemo(() => {
    const dates: number[] = [];
    
    // Project dates
    const projStart = parseDateTime(project.computedTakStart || project.start);
    const projFinish = parseDateTime(project.computedTakCompl || project.handover || project.opening);
    if (projStart) dates.push(projStart.getTime());
    if (projFinish) dates.push(projFinish.getTime());

    // Task dates
    projectTasks.forEach(t => {
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
  }, [project, projectTasks]);

  // Overall task stats
  const stats = useMemo(() => {
    const total = projectTasks.length;
    let completed = 0;
    let inProgress = 0;
    let delayed = 0;
    let upcoming = 0;

    projectTasks.forEach(t => {
      const s = (t.runningStatus || '').toLowerCase();
      if (t.approval === 'Approved' || s.includes('complete')) {
        completed++;
      } else if (s.includes('delay') || s.includes('overdue')) {
        delayed++;
      } else if (s.includes('process') || s.includes('progress') || t.start) {
        inProgress++;
      } else {
        upcoming++;
      }
    });

    return { total, completed, inProgress, delayed, upcoming };
  }, [projectTasks]);

  if (!isOpen || !project) return null;

  const storeDisplay = (project.store || 'HCM').toUpperCase();
  const isHcm = storeDisplay === 'HCM';

  // Navigate to full Gantt Tab
  const handleOpenFullGantt = () => {
    setQuickNavTarget({
      project,
      taskCode: project.code
    });
    setActiveTab('gantt');
    onClose();
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] pointer-events-none flex items-center justify-center p-3 sm:p-5">
      {/* Semi-transparent backdrop for focus */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs pointer-events-auto transition-opacity" 
      />

      {/* Draggable Window (AGENTS.md Rule 11) */}
      <Draggable handle=".modal-handle" nodeRef={nodeRef} bounds="parent">
        <div
          ref={nodeRef}
          className="relative pointer-events-auto bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[85vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150"
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
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleOpenFullGantt}
                className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/80 transition-all active:scale-95 touch-manipulation cursor-pointer"
                title="Open this project in full Gantt chart"
              >
                <BarChartHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Open Full Gantt</span>
                <ExternalLink className="w-3 h-3 ml-0.5 opacity-70" />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer"
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
                <span className="font-bold font-mono text-[11px] text-slate-700 dark:text-slate-200">
                  {timelineBounds.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-bold font-mono text-[11px] text-slate-700 dark:text-slate-200">
                  {timelineBounds.finishDate.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">({timelineBounds.totalDays}d)</span>
              </div>
            </div>

            {/* Right: Task Status Badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {stats.total} Tasks
              </span>
              {stats.completed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/80">
                  {stats.completed} Done
                </span>
              )}
              {stats.inProgress > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-[#8ab4f8] border border-blue-200 dark:border-blue-800/80">
                  {stats.inProgress} Doing
                </span>
              )}
              {stats.delayed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-800/80 animate-pulse">
                  {stats.delayed} Delay
                </span>
              )}
            </div>
          </div>

          {/* 3. Gantt Chart Area */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[55vh] flex flex-col bg-white dark:bg-[#1a1a1c]">
            {projectTasks.length === 0 ? (
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
                  <div className="w-[230px] sm:w-[260px] px-3 py-1.5 border-r border-slate-200 dark:border-[#333336] shrink-0 uppercase tracking-wider flex items-center justify-between">
                    <span>Task</span>
                    <span className="font-mono text-[9px] text-slate-400 font-medium">Dates</span>
                  </div>
                  {/* Right Column: Time Scale Markers */}
                  <div className="flex-1 px-3 py-1.5 flex justify-between uppercase tracking-wider">
                    <span>{timelineBounds.startDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    <span className="hidden sm:inline">Timeline Progress</span>
                    <span>{timelineBounds.finishDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                  </div>
                </div>

                {/* Task Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {projectTasks.map((t, idx) => {
                    const tStart = parseDateTime(t.start);
                    const tFinish = parseDateTime(t.finish);
                    const rawDuration = parseInt(t.duration || '1', 10);
                    const duration = isNaN(rawDuration) || rawDuration <= 0 ? 1 : rawDuration;

                    // Concise dates: DD/MM - DD/MM
                    const sFormatted = formatCompactDate(tStart);
                    const fFormatted = formatCompactDate(tFinish);
                    let dateRangeText = '';
                    if (sFormatted && fFormatted) {
                      dateRangeText = sFormatted === fFormatted ? sFormatted : `${sFormatted} - ${fFormatted}`;
                    } else if (sFormatted) {
                      dateRangeText = sFormatted;
                    } else if (fFormatted) {
                      dateRangeText = `→ ${fFormatted}`;
                    }

                    // Compute relative Gantt Bar position
                    let leftPercent = 0;
                    let widthPercent = 10;

                    if (tStart && tFinish) {
                      const offsetDays = Math.max(0, Math.round((tStart.getTime() - timelineBounds.startDate.getTime()) / 86400000));
                      const taskDays = Math.max(1, Math.round((tFinish.getTime() - tStart.getTime()) / 86400000) + 1);
                      leftPercent = Math.min(95, Math.max(0, (offsetDays / timelineBounds.totalDays) * 100));
                      widthPercent = Math.min(100 - leftPercent, Math.max(2.5, (taskDays / timelineBounds.totalDays) * 100));
                    }

                    // Bar colors based on status
                    const statusStr = (t.runningStatus || '').toLowerCase();
                    const isCompleted = t.approval === 'Approved' || statusStr.includes('complete');
                    const isDelay = statusStr.includes('delay') || statusStr.includes('overdue');
                    const isInProgress = statusStr.includes('process') || statusStr.includes('progress');

                    const barColor = isCompleted
                      ? 'bg-emerald-500 hover:bg-emerald-600'
                      : isDelay
                        ? 'bg-rose-500 hover:bg-rose-600'
                        : isInProgress
                          ? 'bg-blue-500 hover:bg-blue-600'
                          : 'bg-indigo-400 hover:bg-indigo-500';

                    return (
                      <div 
                        key={t.id || idx}
                        className="flex items-center hover:bg-slate-50 dark:hover:bg-[#252528]/50 transition-colors group h-9"
                      >
                        {/* Task Info Cell: Name & Compact Dates */}
                        <div className="w-[230px] sm:w-[260px] px-3 py-1 border-r border-slate-100 dark:border-[#333336] shrink-0 flex items-center justify-between gap-2 min-w-0">
                          <span 
                            className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate flex-1"
                            title={`${t.name}${dateRangeText ? ` (${dateRangeText})` : ''}`}
                          >
                            {t.name}
                          </span>
                          {dateRangeText && (
                            <span 
                              className="font-mono text-[10px] text-slate-500 dark:text-slate-400 shrink-0 tabular-nums"
                              title={`Start: ${t.start || 'N/A'} - Finish: ${t.finish || 'N/A'}`}
                            >
                              {dateRangeText}
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

                          {/* Task Bar */}
                          <div
                            className={cn(
                              "relative h-5 rounded-md shadow-xs transition-all flex items-center overflow-hidden cursor-pointer",
                              barColor
                            )}
                            style={{
                              left: `${leftPercent}%`,
                              width: `${widthPercent}%`
                            }}
                            title={`${t.name}\nStart: ${t.start || 'N/A'}\nFinish: ${t.finish || 'N/A'}\nDuration: ${duration}d\nStatus: ${t.runningStatus || 'N/A'}${t.party ? `\nParty: ${t.party}` : ''}`}
                          >
                            {/* Inner Shading for completion */}
                            {isCompleted && (
                              <div className="absolute top-0 left-0 bottom-0 w-full bg-black/15 pointer-events-none" />
                            )}

                            {/* Label inside bar if wide enough */}
                            {widthPercent > 12 && (
                              <span className="relative z-10 px-1.5 text-[9px] font-extrabold text-white truncate drop-shadow-xs">
                                {duration}d
                              </span>
                            )}
                          </div>
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
