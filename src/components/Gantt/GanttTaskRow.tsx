import React, { memo, useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task, AppUser } from '../../types';
import { getTaskStatus, computeActProgressPercent, resolveActualStatus, getUserDelegationRoleForTask, parseDateTime } from '../../lib/utils';
import { computeTaskCode, computeAllTaskCodes } from '../../lib/ganttUtils';
import { GanttBar } from './GanttBar';
import { GanttBaseline } from './GanttBaseline';
import { GanttTaskLeftColumns } from './GanttTaskLeftColumns';
import { cn, formatGanttDate, renderGanttDateCell } from './GanttUtils';
import { useIsRowFlashed } from '../../lib/changeFlashService';

export interface GanttTaskRowProps {
  t: Task;
  taskIndex?: number;
  isChild: boolean;
  parentTask?: Task;
  hasChildren: boolean;
  childCount: number;
  childTasks?: Task[];
  isModularExpanded: boolean;
  p: Project;
  projects: Project[];
  tasks: Task[];
  delegationGroups: any[];
  isHighlightDelegationOn: boolean;
  currentUser: AppUser | null;
  selectedTaskSet: Set<string>;
  selectedTaskIds: string[];
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void;
  isEditMode: boolean;
  canWrite: boolean;
  handleGroupModularTasks: (parentTaskId: string, childTaskIds: string[]) => void;
  handleUnlinkModularTasks: (childTaskIds: string[]) => void;
  toggleModularParent: (taskId: string | number) => void;
  getRowVisibilityClass: (id: string) => string;
  sideWidth: number;
  showStart: boolean;
  startColWidth: number;
  showFinish: boolean;
  finishColWidth: number;
  showParty: boolean;
  partyColWidth: number;
  showDuration: boolean;
  durationColWidth: number;
  showPredecessor?: boolean;
  predecessorColWidth?: number;
  taskCodeMap?: Map<string, string>;
  delegationGroupByTaskId?: Map<string, any>;
  timeUnits: any[];
  startDate: Date;
  dayWidth: number;
  activeTooltip: string | null;
  setActiveTooltip: (id: string | null) => void;
  getBarColor: (status: string, duration?: string | number) => string;
  initialFocusTaskId?: string | null;
  ganttTabFocusTaskId?: string | null;
  draggingTaskIds: string[];
  handleTaskDragStart: (e: React.DragEvent, id: string) => void;
  handleTaskDragOver: (e: React.DragEvent, id: string) => void;
  handleTaskDragLeave: (e: React.DragEvent, id: string) => void;
  handleTaskDrop: (e: React.DragEvent, targetTask: Task, parentProject?: Project) => void | Promise<void>;
  handleTaskDragEnd: () => void;
  dragOverTaskId: string | null;
  dropPosition: 'before' | 'inside' | 'after' | null;
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, id: string, isShift?: boolean) => void;
  isHideMode: boolean;
  toggleHideRow: (id: string, e: React.MouseEvent) => void;
  onNavigateToTaskDetail?: (taskId: string) => void;
}

export const GanttTaskRow = React.memo(function GanttTaskRow({
  t,
  taskIndex,
  isChild,
  parentTask,
  hasChildren,
  childCount,
  childTasks,
  isModularExpanded,
  p,
  projects,
  tasks,
  delegationGroups,
  isHighlightDelegationOn,
  currentUser,
  selectedTaskSet,
  selectedTaskIds,
  setSelectedTaskIds,
  isEditMode,
  canWrite,
  handleGroupModularTasks,
  handleUnlinkModularTasks,
  toggleModularParent,
  getRowVisibilityClass,
  sideWidth,
  showStart,
  startColWidth,
  showFinish,
  finishColWidth,
  showParty,
  partyColWidth,
  showDuration,
  durationColWidth,
  showPredecessor = false,
  predecessorColWidth = 90,
  taskCodeMap,  delegationGroupByTaskId,  timeUnits,
  startDate,
  dayWidth,
  activeTooltip,
  setActiveTooltip,
  getBarColor,
  initialFocusTaskId,
  ganttTabFocusTaskId,
  draggingTaskIds,
  handleTaskDragStart,
  handleTaskDragOver,
  handleTaskDragLeave,
  handleTaskDrop,
  handleTaskDragEnd,
  dragOverTaskId,
  dropPosition,
  handleTaskCheckboxChange,
  isHideMode,
  toggleHideRow,
  onNavigateToTaskDetail
}: GanttTaskRowProps) {
  const isSelected = selectedTaskSet.has(String(t.id)) || selectedTaskSet.has(t.id);
  const isTarget = dragOverTaskId === t.id;
  const isDragging = draggingTaskIds.includes(t.id);
  const isFocused = initialFocusTaskId === t.id || ganttTabFocusTaskId === t.id;

  const userRole = currentUser ? getUserDelegationRoleForTask(t, currentUser, delegationGroups || []) : null;
  const highlightRole = isHighlightDelegationOn ? userRole : null;

  const planStatus = getTaskStatus(t.start, t.finish);
  const linkedGroup = delegationGroupByTaskId?.get(t.id) || (delegationGroups || []).find((g: any) => g.taskId === t.id || g.parentTaskId === t.id);
  const actStatusObj = resolveActualStatus(planStatus, linkedGroup?.subTasks || []);
  const actPrg = computeActProgressPercent([t], delegationGroups || []);
  const taskCode = taskCodeMap?.get(t.id) || t.taskCodePhu || computeTaskCode(projects, tasks, t);

  // Compute accurate lifecycle status taking into account runningStatus, delegation, approvals, progress, and dates
  let effectiveStatus = planStatus;
  const running = (t.runningStatus || '').toLowerCase();
  const actLabel = (actStatusObj.label || '').toLowerCase();

  if (running.includes('complete') || t.approval === 'Approved' || actPrg >= 100 || actLabel.includes('complete')) {
    effectiveStatus = 'Completed';
  } else if (running.includes('delay') || actLabel.includes('reject') || actLabel.includes('delay')) {
    effectiveStatus = 'Delayed';
  } else if (running.includes('cancel')) {
    effectiveStatus = 'Canceled';
  } else if (running.includes('process') || running.includes('progress') || (actPrg > 0 && actPrg < 100) || actLabel.includes('progress') || actLabel.includes('process')) {
    effectiveStatus = 'On process';
  } else if (running.includes('upcoming') || actLabel.includes('planned') || actLabel.includes('upcoming')) {
    effectiveStatus = 'Upcoming';
  } else {
    // Check if task is overdue (past finish date but not completed)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dFinish = parseDateTime(t.finish);
    if (dFinish) dFinish.setHours(0, 0, 0, 0);
    if (dFinish && today > dFinish && actPrg < 100 && t.approval !== 'Approved') {
      effectiveStatus = 'Delayed';
    }
  }

  const onProcessChildTasks = React.useMemo(() => {
    if (!hasChildren || !childTasks || childTasks.length === 0) return [];

    return childTasks
      .filter((ct) => {
        const plSt = getTaskStatus(ct.start, ct.finish);
        const lg = delegationGroupByTaskId?.get(ct.id) || (delegationGroups || []).find((g: any) => g.taskId === ct.id || g.parentTaskId === ct.id);
        const actStObj = resolveActualStatus(plSt, lg?.subTasks || []);
        const prg = computeActProgressPercent([ct], delegationGroups || []);
        const running = (ct.runningStatus || '').toLowerCase();
        const actLabel = (actStObj.label || '').toLowerCase();

        if (running.includes('complete') || ct.approval === 'Approved' || prg >= 100 || actLabel.includes('complete')) {
          return false;
        }

        if (
          running.includes('process') ||
          running.includes('progress') ||
          actLabel.includes('process') ||
          actLabel.includes('progress') ||
          plSt === 'On process'
        ) {
          return true;
        }

        if (prg > 0 && prg < 100) {
          return true;
        }

        return false;
      })
      .map((ct) => {
        const ctPrg = computeActProgressPercent([ct], delegationGroups || []);
        const ctCode = ct.taskCodePhu || taskCodeMap?.get(ct.id) || computeTaskCode(projects, tasks, ct);
        return {
          id: String(ct.id),
          name: ct.name,
          taskCode: ctCode,
          actPrg: ctPrg,
          start: ct.start,
          finish: ct.finish,
          duration: ct.duration,
        };
      });
  }, [hasChildren, childTasks, delegationGroups, projects, tasks]);

  const extraVars = {
    actStatus: effectiveStatus,
    actStatusColor: actStatusObj.color,
    party: t.party,
    actPrg,
    duration: t.duration,
    taskCode,
    predecessors: t.predecessor,
    highlight: highlightRole,
    hasChildren,
    childCount,
    task: t,
    tasks,
    projects,
    canWrite,
    onNavigateToTaskDetail,
    onProcessChildTasks,
  };

  const { isFlashed } = useIsRowFlashed(t.id);
  const isParentTask = hasChildren || childCount > 0 || Boolean((t as any).isModularParent);

  return (
    <div
      id={`gantt-task-row-${t.id}`}
      draggable={isEditMode && !isParentTask}
      onDragStart={(e) => {
        if (!isEditMode || isParentTask) {
          e.preventDefault();
          return;
        }
        const target = e.target as HTMLElement;
        if (target.closest('input, button, a, [role="button"]')) {
          e.preventDefault();
          return;
        }
        handleTaskDragStart(e, t.id);
      }}
      onDragEnd={() => isEditMode && !isParentTask && handleTaskDragEnd()}
      onDragOver={(e) => isEditMode && handleTaskDragOver(e, t.id)}
      onDragLeave={(e) => isEditMode && handleTaskDragLeave(e, t.id)}
      onDrop={(e) => isEditMode && handleTaskDrop(e, t, p)}
      className={cn(
        "flex h-10 min-h-[40px] border-b border-slate-100 dark:border-slate-800 transition-all duration-700 relative group",
        getRowVisibilityClass(`task-${t.id}`),
        isSelected ? "bg-blue-50/50 dark:bg-blue-950/30" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
        isEditMode && !isParentTask && "cursor-grab active:cursor-grabbing hover:bg-blue-50/70 dark:hover:bg-blue-900/30",
        isEditMode && isParentTask && "hover:bg-purple-50/40 dark:hover:bg-purple-950/20 cursor-default",
        isDragging && "opacity-40",
        isTarget && dropPosition === 'before' && "border-t-2 border-t-blue-500",
        isTarget && dropPosition === 'after' && "border-b-2 border-b-blue-500",
        isFlashed && "ring-2 ring-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-950/60 z-20 shadow-sm"
      )}
    >
      {/* Left Side Columns Container */}
      <div
        className="sticky left-0 z-20 bg-white dark:bg-[#1e1e20] flex border-r border-slate-200 dark:border-slate-800 shrink-0 h-full items-center overflow-hidden"
        style={{ width: `${sideWidth}px` }}
      >
        <div className="flex-1 min-w-0 h-full flex items-center overflow-hidden">
          <GanttTaskLeftColumns
            t={t}
            taskIndex={taskIndex}
            taskCode={taskCode}
            projects={projects}
            tasks={tasks}
            isChild={isChild}
            parentTask={parentTask}
            hasChildren={hasChildren}
            childCount={childCount}
            isModularExpanded={isModularExpanded}
            toggleModularParent={toggleModularParent}
            selectedTaskSet={selectedTaskSet}
            handleTaskCheckboxChange={handleTaskCheckboxChange}
            isHideMode={isHideMode}
            toggleHideRow={toggleHideRow}
            isDragging={isDragging}
            handleTaskDragStart={handleTaskDragStart}
            handleTaskDragEnd={handleTaskDragEnd}
            isEditMode={isEditMode}
            isFocused={isFocused}
            onNavigateToTaskDetail={onNavigateToTaskDetail}
            handleUnlinkModularTasks={handleUnlinkModularTasks}
          />
        </div>

        {showStart && (
          <div
            className="border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
            style={{ width: startColWidth, minWidth: startColWidth, maxWidth: startColWidth }}
          >
            {renderGanttDateCell(t.start, "text-blue-600 dark:text-[#8ab4f8]")}
          </div>
        )}

        {showFinish && (
          <div
            className="border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
            style={{ width: finishColWidth, minWidth: finishColWidth, maxWidth: finishColWidth }}
          >
            {renderGanttDateCell(t.finish, "text-pink-600 dark:text-pink-400")}
          </div>
        )}

        {showParty && (
          <div
            className="text-xs text-slate-700 dark:text-slate-300 font-medium border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center shrink-0 h-full"
            style={{ width: partyColWidth, minWidth: partyColWidth, maxWidth: partyColWidth }}
          >
            {t.party || "-"}
          </div>
        )}

        {showDuration && (
          <div
            className="font-mono text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center font-bold shrink-0 h-full"
            style={{ width: durationColWidth, minWidth: durationColWidth, maxWidth: durationColWidth }}
          >
            {t.duration ? `${t.duration}d` : "-"}
          </div>
        )}

        {showPredecessor && (
          <div
            className="font-mono text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 font-semibold border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
            style={{ width: predecessorColWidth, minWidth: predecessorColWidth, maxWidth: predecessorColWidth }}
            title={t.predecessor || ""}
          >
            <span className="truncate">{t.predecessor || "-"}</span>
          </div>
        )}
      </div>

      {/* Right Timeline Area */}
      <div className="flex-1 relative h-full flex items-center">
        {/* Baseline Bar (from baselineStart/baseStart or plan start to baselineFinish/baseFinish or plan finish) */}
        <GanttBaseline
          baselineStart={t.baselineStart || (t as any).baseStart}
          baselineFinish={t.baselineFinish || (t as any).baseFinish}
          startStr={t.start}
          endStr={t.finish}
          startDate={startDate}
          dayWidth={dayWidth}
        />

        {/* Task Main Gantt Bar */}
        <GanttBar
          id={`task-${t.id}`}
          label={t.name}
          startStr={t.start}
          endStr={t.finish}
          status={effectiveStatus}
          extraVars={extraVars}
          startDate={startDate}
          dayWidth={dayWidth}
          activeTooltip={activeTooltip}
          setActiveTooltip={setActiveTooltip}
          isEditMode={isEditMode}
          getBarColor={getBarColor}
        />
      </div>
    </div>
  );
});
