import React from 'react';
import { Project, Task, AppUser } from '../../types';
import { getTaskStatus, computeActProgressPercent, resolveActualStatus, getUserDelegationRoleForTask } from '../../lib/utils';
import { computeTaskCode } from '../../lib/ganttUtils';
import { GanttBar } from './GanttBar';
import { GanttBaseline } from './GanttBaseline';
import { GanttTaskLeftColumns } from './GanttTaskLeftColumns';
import { cn, formatGanttDate } from './GanttUtils';

export interface GanttTaskRowProps {
  t: Task;
  isChild: boolean;
  parentTask?: Task;
  hasChildren: boolean;
  childCount: number;
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
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  isHideMode: boolean;
  toggleHideRow: (id: string, e: React.MouseEvent) => void;
}

export const GanttTaskRow = React.memo(function GanttTaskRow({
  t,
  isChild,
  parentTask,
  hasChildren,
  childCount,
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
  timeUnits,
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
  toggleHideRow
}: GanttTaskRowProps) {
  const isSelected = selectedTaskSet.has(t.id);
  const isTarget = dragOverTaskId === t.id;
  const isDragging = draggingTaskIds.includes(t.id);
  const isFocused = initialFocusTaskId === t.id || ganttTabFocusTaskId === t.id;

  const userRole = currentUser ? getUserDelegationRoleForTask(t, currentUser, delegationGroups || []) : null;
  const highlightRole = isHighlightDelegationOn ? userRole : null;

  const planStatus = getTaskStatus(t.start, t.finish);
  const linkedGroup = (delegationGroups || []).find((g: any) => g.taskId === t.id || g.parentTaskId === t.id);
  const actStatusObj = resolveActualStatus(planStatus, linkedGroup?.subTasks || []);
  const actPrg = computeActProgressPercent([t], delegationGroups || []);
  const taskCode = computeTaskCode(projects, tasks, t);

  const extraVars = {
    actStatus: actStatusObj.label,
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
  };

  return (
    <div
      id={`gantt-task-row-${t.id}`}
      onDragOver={(e) => handleTaskDragOver(e, t.id)}
      onDragLeave={(e) => handleTaskDragLeave(e, t.id)}
      onDrop={(e) => handleTaskDrop(e, t, p)}
      className={cn(
        "flex h-9 border-b border-slate-100 dark:border-slate-800 transition-colors relative group",
        getRowVisibilityClass(`task-${t.id}`),
        isSelected ? "bg-blue-50/50 dark:bg-blue-950/30" : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40",
        isFocused && "ring-2 ring-blue-500 z-20 bg-blue-50/70 dark:bg-blue-900/30",
        isDragging && "opacity-40",
        isTarget && dropPosition === 'before' && "border-t-2 border-t-blue-500",
        isTarget && dropPosition === 'after' && "border-b-2 border-b-blue-500"
      )}
    >
      {/* Left Side Columns */}
      <div
        className="sticky left-0 z-20 bg-white dark:bg-[#1e1e20] flex border-r border-slate-200 dark:border-slate-800 shrink-0"
        style={{ width: `${sideWidth}px` }}
      >
        <GanttTaskLeftColumns
          t={t}
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
        />
      </div>

      {showStart && (
        <div
          className="print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-400 border-r border-slate-200 dark:border-[#444446] p-2 flex items-center justify-center shrink-0 bg-white dark:bg-[#1e1e20]"
          style={{ width: startColWidth, minWidth: startColWidth, maxWidth: startColWidth }}
        >
          {formatGanttDate(t.start)}
        </div>
      )}

      {showFinish && (
        <div
          className="print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-400 border-r border-slate-200 dark:border-[#444446] p-2 flex items-center justify-center shrink-0 bg-white dark:bg-[#1e1e20]"
          style={{ width: finishColWidth, minWidth: finishColWidth, maxWidth: finishColWidth }}
        >
          {formatGanttDate(t.finish)}
        </div>
      )}

      {showParty && (
        <div
          className="print-sticky-x sticky z-30 text-xs text-slate-400 border-r border-slate-200 dark:border-[#444446] p-2 flex items-center justify-center shrink-0 bg-white dark:bg-[#1e1e20]"
          style={{ width: partyColWidth, minWidth: partyColWidth, maxWidth: partyColWidth }}
        >
          {t.party || "-"}
        </div>
      )}

      {showDuration && (
        <div
          className="print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-400 border-r border-slate-200 dark:border-[#444446] p-2 flex items-center justify-center font-bold shrink-0 bg-white dark:bg-[#1e1e20]"
          style={{ width: durationColWidth, minWidth: durationColWidth, maxWidth: durationColWidth }}
        >
          {t.duration ? `${t.duration}d` : "-"}
        </div>
      )}

      {/* Right Timeline Area */}
      <div className="flex-1 relative h-full flex items-center">
        {/* Baseline Bar (if task has baseline) */}
        {t.baselineStart && t.baselineFinish && (
          <GanttBaseline
            baselineStart={t.baselineStart}
            baselineFinish={t.baselineFinish}
            startDate={startDate}
            dayWidth={dayWidth}
          />
        )}

        {/* Task Main Gantt Bar */}
        <GanttBar
          id={`task-${t.id}`}
          label={t.name}
          startStr={t.start}
          endStr={t.finish}
          status={planStatus}
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
