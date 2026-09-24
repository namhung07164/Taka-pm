import React from 'react';
import { ChevronDown, ChevronRight, Eye, EyeOff, Link, Unlink, Edit, Trash2, CornerDownRight, GripVertical, Play, Pin } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Project, Task, AppUser } from '../../types';
import { getTaskStatus, computeActProgressPercent, resolveActualStatus, getUserDelegationRoleForTask } from '../../lib/utils';
import { computeTaskCode } from '../../lib/ganttUtils';
import { formatGanttDate } from './GanttUtils';
import { GanttBar } from './GanttBar';
import { GanttBaseline } from './GanttBaseline';

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
  hiddenRowsSet: Set<string>;
  onNavigateToTaskDetail?: (id: string) => void;
  taskCode?: string;
  delegationGroup?: any;
  childTasks?: Task[];
}

export const GanttTaskRow: React.FC<GanttTaskRowProps> = React.memo(({
  t, isChild, parentTask, hasChildren, childCount, isModularExpanded, childTasks,
  p, projects, tasks, delegationGroups, isHighlightDelegationOn, currentUser,
  selectedTaskSet, selectedTaskIds, setSelectedTaskIds,
  isEditMode, canWrite, handleGroupModularTasks, handleUnlinkModularTasks,
  toggleModularParent,
  getRowVisibilityClass, sideWidth, showStart, startColWidth, showFinish, finishColWidth,
  showParty, partyColWidth, showDuration, durationColWidth, timeUnits,
  startDate, dayWidth, activeTooltip, setActiveTooltip, getBarColor,
  draggingTaskIds, handleTaskDragStart, handleTaskDragOver, handleTaskDragLeave,
  handleTaskDrop, handleTaskDragEnd, dragOverTaskId, dropPosition,
  handleTaskCheckboxChange, isHideMode, toggleHideRow, hiddenRowsSet, onNavigateToTaskDetail,
  initialFocusTaskId, ganttTabFocusTaskId, taskCode: taskCodeProp, delegationGroup: delegationGroupProp
}) => {
  const tStatus = getTaskStatus(t.start, t.finish);
  const delegationGroup = delegationGroupProp !== undefined
    ? delegationGroupProp
    : delegationGroups.find((g) => g.parentTaskId === t.id);
  const actStatusObj = resolveActualStatus(
    tStatus,
    delegationGroup?.subTasks || [],
  );
  const actStatus = actStatusObj.label;
  const tActPrg = computeActProgressPercent(
    [t], delegationGroups
  );
  const taskCode = taskCodeProp !== undefined
    ? taskCodeProp
    : computeTaskCode(projects, tasks, t);

  const onProcessChildTasks = React.useMemo(() => {
    if (!hasChildren || !childTasks || childTasks.length === 0) return undefined;
    return childTasks
      .filter((ct) => {
        const ctStatus = getTaskStatus(ct.start, ct.finish);
        const ctDelGroup = delegationGroups.find((g) => g.parentTaskId === ct.id);
        const ctActStatusObj = resolveActualStatus(ctStatus, ctDelGroup?.subTasks || []);
        const ctActStatusLabel = (ctActStatusObj?.label || "").toLowerCase();
        return (
          ctStatus === "On process" ||
          ctActStatusLabel === "in progress" ||
          ctActStatusLabel === "on process" ||
          ctActStatusLabel === "delay" ||
          ctActStatusLabel === "delayed"
        );
      })
      .map((ct) => {
        const ctCode = computeTaskCode(projects, tasks, ct);
        const ctProg = computeActProgressPercent([ct], delegationGroups);
        return {
          id: ct.id,
          name: ct.name,
          taskCode: ctCode,
          actPrg: ctProg,
          start: ct.start,
          finish: ct.finish,
          duration: ct.duration,
        };
      });
  }, [hasChildren, childTasks, delegationGroups, projects, tasks]);

  const extraVars = React.useMemo(() => ({
    actStatus: actStatus,
    actStatusColor: actStatusObj.color,
    party: t.party,
    actPrg: tActPrg,
    duration: t.duration,
    taskCode: taskCode,
    predecessors: t.predecessor,
    highlight: isHighlightDelegationOn ? getUserDelegationRoleForTask(t, currentUser, delegationGroups) : null,
    hasChildren,
    childCount,
    onProcessChildTasks,
  }), [actStatus, actStatusObj.color, t.party, tActPrg, t.duration, taskCode, t.predecessor, isHighlightDelegationOn, currentUser, delegationGroups, hasChildren, childCount, onProcessChildTasks]);
                        return (
                          <tr
                            id={`gantt-task-${t.id}`}
                            key={t.id}
                            className={cn(
                              "transition-all group task-row select-none",
                              draggingTaskIds.includes(t.id)
                                ? "opacity-30 bg-blue-50/30 dark:bg-blue-950/20 border-dashed border-2 border-blue-400"
                                : "bg-slate-50 dark:bg-[#232325] hover:bg-slate-100 dark:hover:bg-[#2d2d30]",
                              initialFocusTaskId === t.id
                                ? "ring-2 ring-inset ring-yellow-400 bg-yellow-50 dark:bg-yellow-900/20"
                                : "",
                              getRowVisibilityClass(`task-${t.id}`),
                            )}
                            draggable={canWrite && isEditMode}
                            onDragStart={(e) =>
                              canWrite && isEditMode && handleTaskDragStart(e, t.id)
                            }
                            onDragOver={(e) =>
                              canWrite && isEditMode && handleTaskDragOver(e, t.id)
                            }
                            onDragLeave={(e) =>
                              canWrite && isEditMode && handleTaskDragLeave(e, t.id)
                            }
                            onDragEnd={() => canWrite && isEditMode && handleTaskDragEnd()}
                            onDrop={(e) => canWrite && isEditMode && handleTaskDrop(e, t, p)}
                          >
                            <td
                              className={cn(
                                "print-sticky-x sticky left-0 z-30 border-b border-r border-slate-200 dark:border-[#444446] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] p-2 relative",
                                "bg-slate-50 dark:bg-[#232325] group-hover:bg-slate-100 dark:group-hover:bg-[#2d2d30]",
                                dragOverTaskId === t.id
                                  ? (dropPosition === 'before' ? "!border-t-2 !border-t-blue-500 bg-blue-50/70 dark:bg-blue-950/40" : "!border-b-2 !border-b-blue-500 bg-blue-50/70 dark:bg-blue-950/40")
                                  : ""
                              )}
                              style={{
                                position: "sticky",
                                left: 0,
                                zIndex: 30,
                                width: sideWidth,
                                minWidth: sideWidth,
                                maxWidth: sideWidth,
                              }}
                            >
                              {/* Drag Reorder Insertion Guide Badge & Beam (Zero Layout Shift) */}
                              {dragOverTaskId === t.id && (
                                <div
                                  className={cn(
                                    "absolute left-0 right-0 h-[3px] bg-blue-600 dark:bg-blue-400 z-30 pointer-events-none flex items-center shadow-[0_0_8px_rgba(37,99,235,0.7)]",
                                    dropPosition === 'before' ? "top-0" : "bottom-0"
                                  )}
                                >
                                  <div className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 -ml-1 border-2 border-white dark:border-slate-900 shadow-sm ring-2 ring-blue-300" />
                                  <div className="ml-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-xl text-[10px] font-bold ring-2 ring-white dark:ring-[#1e1e20] whitespace-nowrap animate-in fade-in duration-75">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-ping shrink-0" />
                                    <span>{dropPosition === 'before' ? '▲ Chèn trước:' : '▼ Chèn sau:'}</span>
                                    <span className="font-semibold max-w-[170px] truncate text-blue-100">
                                      {tasks.filter(tk => draggingTaskIds.includes(tk.id)).map(tk => tk.name).join(', ') || 'Nhiệm vụ'}
                                    </span>
                                    <span className="ml-1 text-[9px] bg-blue-700/80 px-1.5 py-0.5 rounded text-blue-200 font-normal">Thả để chèn</span>
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1 w-full relative">
                                {isEditMode && (
                                  <label
                                    className="flex items-center justify-center p-1 shrink-0 cursor-pointer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <input
                                      type="checkbox"
                                      data-task-checkbox="true"
                                      data-task-id={t.id}
                                      checked={selectedTaskSet.has(t.id)}
                                      onChange={(e) => handleTaskCheckboxChange(e, t.id)}
                                      className="w-3.5 h-3.5 text-blue-600 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500 cursor-pointer active:scale-95 transition-all touch-manipulation"
                                    />
                                  </label>
                                )}
                                {isHideMode && (
                                  <button
                                    onClick={(e) =>
                                      toggleHideRow(`task-${t.id}`, e)
                                    }
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-400 shrink-0 cursor-pointer active:scale-95 transition-all touch-manipulation"
                                  >
                                    {hiddenRowsSet.has(`task-${t.id}`) ? (
                                      <EyeOff className="w-3.5 h-3.5 text-blue-500" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                                {hasChildren ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      toggleModularParent(t.id);
                                    }}
                                    onMouseDown={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onTouchStart={(e) => {
                                      e.stopPropagation();
                                    }}
                                    onTouchEnd={(e) => {
                                      e.stopPropagation();
                                    }}
                                    className={cn(
                                      "h-6 min-w-[28px] px-1.5 rounded flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-bold shrink-0 transition-all active:scale-95 shadow-xs cursor-pointer select-none relative z-20 touch-manipulation",
                                      "before:absolute before:-inset-2 before:content-['']",
                                      isModularExpanded
                                        ? "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-500 ring-1 ring-purple-400/50"
                                        : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-950/80 dark:hover:bg-purple-900 dark:text-purple-300 border border-purple-300 dark:border-purple-700"
                                    )}
                                    title={isModularExpanded ? `Thu gọn ${childCount} task con` : `Mở rộng ${childCount} task con`}
                                  >
                                    {isModularExpanded ? (
                                      <ChevronDown className="w-3.5 h-3.5 pointer-events-none shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3.5 h-3.5 pointer-events-none shrink-0" />
                                    )}
                                    <span className="text-[10px] font-mono leading-none pointer-events-none">{childCount}</span>
                                  </button>
                                ) : isChild ? (
                                  canWrite && isEditMode ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleUnlinkModularTasks([t.id]);
                                      }}
                                      className="w-6 h-5 rounded flex items-center justify-center text-indigo-500 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-950/60 dark:text-indigo-400 dark:hover:text-red-400 shrink-0 transition-all active:scale-90 cursor-pointer group/sub"
                                      title="Nhấp để tách khỏi Task Mẹ (Ungroup)"
                                    >
                                      <CornerDownRight className="w-3.5 h-3.5 stroke-[2.5] group-hover/sub:hidden" />
                                      <Unlink className="w-3 h-3 hidden group-hover/sub:inline-block text-red-500" />
                                    </button>
                                  ) : (
                                    <div
                                      className="w-6 h-5 flex items-center justify-center shrink-0 text-indigo-500 dark:text-indigo-400"
                                      title={parentTask ? `Thuộc task mẹ: ${parentTask.name}` : "Task con"}
                                    >
                                      <CornerDownRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                    </div>
                                  )
                                ) : (
                                  <div className="w-6 h-5 shrink-0" />
                                )}
                                {canWrite && (
                                  <div
                                    className={cn(
                                      "cursor-grab active:cursor-grabbing text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 shrink-0 p-0.5 transition-opacity",
                                      isEditMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                    )}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Kéo thả để sắp xếp lại nhiệm vụ"
                                  >
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                )}
                                <div
                                  className={cn(
                                    "text-sm whitespace-normal break-words leading-tight flex-1 relative py-1",
                                    onNavigateToTaskDetail && !isEditMode
                                      ? "cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors"
                                      : "",
                                    extraVars?.highlight === 'assignee' ? "text-yellow-600 dark:text-yellow-400 font-bold drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" : extraVars?.highlight === 'creator' ? "text-purple-600 dark:text-purple-400 font-bold drop-shadow-[0_0_5px_rgba(192,132,252,0.8)]" : "text-slate-600 dark:text-[#c3c3c3]",
                                  )}
                                  title={t.name}
                                  style={
                                    t.textColor
                                      ? { color: t.textColor }
                                      : undefined
                                  }
                                  onClick={(e) => {
                                    if (isEditMode) return;
                                    e.stopPropagation();
                                    onNavigateToTaskDetail?.(t.id);
                                  }}
                                >
                                  {t.realtimeUpdate ? (
                                    <Play className="w-3 h-3 text-blue-500 fill-current inline-block mr-1 shrink-0" />
                                  ) : (
                                    <Pin className="w-3 h-3 text-green-500 rotate-45 inline-block mr-1 shrink-0" />
                                  )}
                                  <span>{t.name}</span>
                                </div>
                              </div>
                            </td>
                            {showStart && (
                              <td
                                className={cn(
                                  "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center",
                                  "text-blue-700 dark:text-[#8ab4f8] font-bold bg-slate-50 dark:bg-[#232325] group-hover:bg-slate-100 dark:hover:bg-[#2d2d30]",
                                  dragOverTaskId === t.id
                                    ? (dropPosition === 'before' ? "!border-t-2 !border-t-blue-500 bg-blue-50/70 dark:bg-blue-950/40" : "!border-b-2 !border-b-blue-500 bg-blue-50/70 dark:bg-blue-950/40")
                                    : ""
                                )}
                                style={{
                                  position: "sticky",
                                  left: sideWidth,
                                  zIndex: 30,
                                  width: startColWidth,
                                  minWidth: startColWidth,
                                  maxWidth: startColWidth,
                                }}
                              >
                                {formatGanttDate(t.start)}
                              </td>
                            )}
                            {showFinish && (
                              <td
                                className={cn(
                                  "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]",
                                  "text-pink-700 dark:text-pink-400 font-bold bg-slate-50 dark:bg-[#232325] group-hover:bg-slate-100 dark:hover:bg-[#2d2d30]",
                                  dragOverTaskId === t.id
                                    ? (dropPosition === 'before' ? "!border-t-2 !border-t-blue-500 bg-blue-50/70 dark:bg-blue-950/40" : "!border-b-2 !border-b-blue-500 bg-blue-50/70 dark:bg-blue-950/40")
                                    : ""
                                )}
                                style={{
                                  position: "sticky",
                                  left:
                                    sideWidth + (showStart ? startColWidth : 0),
                                  zIndex: 30,
                                  width: finishColWidth,
                                  minWidth: finishColWidth,
                                  maxWidth: finishColWidth,
                                }}
                              >
                                {formatGanttDate(t.finish)}
                              </td>
                            )}
                            {showParty && (
                              <td
                                className={cn(
                                  "print-sticky-x sticky z-30 text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center",
                                  "bg-slate-50 dark:bg-[#232325] group-hover:bg-slate-100 dark:hover:bg-[#2d2d30]",
                                  dragOverTaskId === t.id
                                    ? (dropPosition === 'before' ? "!border-t-2 !border-t-blue-500 bg-blue-50/70 dark:bg-blue-950/40" : "!border-b-2 !border-b-blue-500 bg-blue-50/70 dark:bg-blue-950/40")
                                    : ""
                                )}
                                style={{
                                  position: "sticky",
                                  left:
                                    sideWidth +
                                    (showStart ? startColWidth : 0) +
                                    (showFinish ? finishColWidth : 0),
                                  zIndex: 30,
                                  width: partyColWidth,
                                  minWidth: partyColWidth,
                                  maxWidth: partyColWidth,
                                }}
                              >
                                {t.party || "-"}
                              </td>
                            )}
                            {showDuration && (
                              <td
                                className={cn(
                                  "print-sticky-x sticky z-30 font-mono text-[10px] sm:text-xs text-slate-500 dark:text-[#838383] border-b border-r border-slate-200 dark:border-[#444446] p-2 text-center font-bold",
                                  "bg-slate-50 dark:bg-[#232325] group-hover:bg-slate-100 dark:hover:bg-[#2d2d30]",
                                  dragOverTaskId === t.id
                                    ? (dropPosition === 'before' ? "!border-t-2 !border-t-blue-500 bg-blue-50/70 dark:bg-blue-950/40" : "!border-b-2 !border-b-blue-500 bg-blue-50/70 dark:bg-blue-950/40")
                                    : ""
                                )}
                                style={{
                                  position: "sticky",
                                  left:
                                    sideWidth +
                                    (showStart ? startColWidth : 0) +
                                    (showFinish ? finishColWidth : 0) +
                                    (showParty ? partyColWidth : 0),
                                  zIndex: 30,
                                  width: durationColWidth,
                                  minWidth: durationColWidth,
                                  maxWidth: durationColWidth,
                                }}
                              >
                                {String(t.duration) !== "undefined" &&
                                t.duration !== null
                                  ? t.duration
                                  : t.start && t.finish
                                    ? String(
                                        Math.round(
                                          (new Date(t.finish).getTime() -
                                            new Date(t.start).getTime()) /
                                            (1000 * 60 * 60 * 24),
                                        ),
                                      )
                                    : "-"}
                              </td>
                            )}
                            <td
                              colSpan={timeUnits.length}
                              className="border-b border-slate-200 dark:border-[#444446] relative p-0 h-8"
                            >
                              {/* Drag Reorder Timeline Insertion Beam & Ghost Simulation Bar */}
                              {dragOverTaskId === t.id && (
                                <>
                                  <div
                                    className={cn(
                                      "absolute left-0 right-0 h-[3px] bg-blue-600 dark:bg-blue-400 shadow-[0_0_8px_rgba(37,99,235,0.8)] z-40 pointer-events-none",
                                      dropPosition === 'before' ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
                                    )}
                                  />
                                  {tasks.filter(tk => draggingTaskIds.includes(tk.id)).map(dt => (
                                    <div key={`sim-bar-${dt.id}`} className="pointer-events-none">
                                      <GanttBar
  startStr={dt.start}
  endStr={dt.finish}
  status="In Progress"
  label={`[Mô phỏng] ${dt.name}`}
  id={`sim-task-${dt.id}`}
  extraVars={{ isSimulation: true, duration: dt.duration }}
  startDate={startDate}
  dayWidth={dayWidth}
  activeTooltip={activeTooltip}
  setActiveTooltip={setActiveTooltip}
  isEditMode={isEditMode}
  getBarColor={getBarColor}
/>
                                    </div>
                                  ))}
                                </>
                              )}

                              {/* Task Bar */}
                              <GanttBar
  startStr={t.start}
  endStr={t.finish}
  status={tStatus}
  label={t.name}
  id={`task-${t.id}`}
  extraVars={extraVars}
  startDate={startDate}
  dayWidth={dayWidth}
  activeTooltip={activeTooltip}
  setActiveTooltip={setActiveTooltip}
  isEditMode={isEditMode}
  getBarColor={getBarColor}
/>
                              <GanttBaseline
  startStr={t.baselineStart}
  endStr={t.baselineFinish}
  type="task"
  startDate={startDate}
  dayWidth={dayWidth}
/>
                            </td>
                          </tr>
  );
}, (prev, next) => {
  return prev.isChild === next.isChild &&
         prev.hasChildren === next.hasChildren &&
         prev.childCount === next.childCount &&
         prev.childTasks === next.childTasks &&
         prev.isModularExpanded === next.isModularExpanded &&
         prev.isHighlightDelegationOn === next.isHighlightDelegationOn &&
         prev.isEditMode === next.isEditMode &&
         prev.canWrite === next.canWrite &&
         prev.taskCode === next.taskCode &&
         prev.isHideMode === next.isHideMode &&
         prev.selectedTaskSet.has(String(prev.t.id)) === next.selectedTaskSet.has(String(next.t.id)) &&
         (prev.hiddenRowsSet.has(`task-${prev.t.id}`) === next.hiddenRowsSet.has(`task-${next.t.id}`)) &&
         prev.sideWidth === next.sideWidth &&
         prev.startColWidth === next.startColWidth &&
         prev.finishColWidth === next.finishColWidth &&
         prev.partyColWidth === next.partyColWidth &&
         prev.durationColWidth === next.durationColWidth &&
         prev.showStart === next.showStart &&
         prev.showFinish === next.showFinish &&
         prev.showParty === next.showParty &&
         prev.showDuration === next.showDuration &&
         prev.timeUnits.length === next.timeUnits.length &&
         prev.t === next.t &&
         prev.p === next.p &&
         prev.startDate.getTime() === next.startDate.getTime() &&
         prev.dayWidth === next.dayWidth &&
         (prev.dragOverTaskId === prev.t.id || next.dragOverTaskId === next.t.id
           ? prev.dragOverTaskId === next.dragOverTaskId && prev.dropPosition === next.dropPosition
           : true) &&
         (prev.draggingTaskIds.includes(prev.t.id) === next.draggingTaskIds.includes(next.t.id)) &&
         (prev.activeTooltip === `task-${prev.t.id}` || next.activeTooltip === `task-${next.t.id}` ? prev.activeTooltip === next.activeTooltip : true) &&
         (prev.initialFocusTaskId === prev.t.id || next.initialFocusTaskId === next.t.id ? prev.initialFocusTaskId === next.initialFocusTaskId : true) &&
         (prev.ganttTabFocusTaskId === prev.t.id || next.ganttTabFocusTaskId === next.t.id ? prev.ganttTabFocusTaskId === next.ganttTabFocusTaskId : true);
});
