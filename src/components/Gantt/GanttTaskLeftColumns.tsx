import React, { useRef } from 'react';
import { ChevronDown, ChevronRight, GripVertical, EyeOff, Unlink } from 'lucide-react';
import { Task, Project } from '../../types';
import { cn } from './GanttUtils';
import { computeTaskCode } from '../../lib/ganttUtils';
import { useAppStore } from '../../store/useAppStore';

interface GanttTaskLeftColumnsProps {
  t: Task;
  taskIndex?: number;
  taskCode?: string;
  projects?: Project[];
  tasks?: Task[];
  isChild: boolean;
  parentTask?: Task;
  hasChildren: boolean;
  childCount: number;
  isModularExpanded: boolean;
  toggleModularParent: (taskId: string | number) => void;
  selectedTaskSet: Set<string>;
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, id: string, isShift?: boolean) => void;
  isHideMode: boolean;
  toggleHideRow: (id: string, e: React.MouseEvent) => void;
  isDragging: boolean;
  handleTaskDragStart: (e: React.DragEvent, id: string) => void;
  handleTaskDragEnd: () => void;
  isEditMode?: boolean;
  isFocused?: boolean;
  onNavigateToTaskDetail?: (taskId: string) => void;
  handleUnlinkModularTasks?: (childTaskIds: string[]) => void | Promise<void>;
}

export function GanttTaskLeftColumns({
  t,
  taskIndex,
  taskCode: propTaskCode,
  projects = [],
  tasks = [],
  isChild,
  hasChildren,
  childCount,
  isModularExpanded,
  toggleModularParent,
  selectedTaskSet,
  handleTaskCheckboxChange,
  isHideMode,
  toggleHideRow,
  isDragging,
  handleTaskDragStart,
  handleTaskDragEnd,
  isEditMode = false,
  isFocused = false,
  onNavigateToTaskDetail,
  handleUnlinkModularTasks
}: GanttTaskLeftColumnsProps) {
  const isSelected = selectedTaskSet.has(String(t.id)) || selectedTaskSet.has(t.id);
  const taskCode = propTaskCode || (projects.length > 0 && tasks.length > 0 ? computeTaskCode(projects, tasks, t) : (t.taskCodePhu || ''));
  const shiftClickedRef = useRef(false);
  const isParentTask = hasChildren || childCount > 0 || Boolean((t as any).isModularParent);

  return (
    <div className="flex items-center w-full h-full overflow-hidden">
      {/* Selection Checkbox & Drag Handle & Hide Button - ONLY in Edit Mode */}
      {isEditMode ? (
        <div className="w-10 px-1 py-1 flex items-center justify-center gap-0.5 shrink-0 border-r border-slate-200 dark:border-[#333336]">
          {isHideMode ? (
            <button
              type="button"
              onClick={(e) => toggleHideRow(`task-${t.id}`, e)}
              className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors cursor-pointer"
              title="Hide this task"
            >
              <EyeOff className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-0.5">
              {!isParentTask ? (
                <div
                  draggable
                  onDragStart={(e) => handleTaskDragStart(e, t.id)}
                  onDragEnd={handleTaskDragEnd}
                  className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                  title="Drag to reorder task"
                >
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              ) : (
                <div className="text-slate-300 dark:text-slate-600 p-0.5 cursor-not-allowed" title="Dragging disabled for parent tasks">
                  <GripVertical className="w-3.5 h-3.5 opacity-30" />
                </div>
              )}
              <input
                type="checkbox"
                checked={isSelected}
                onPointerDown={(e) => {
                  if (e.shiftKey) shiftClickedRef.current = true;
                }}
                onMouseDown={(e) => {
                  if (e.shiftKey) shiftClickedRef.current = true;
                }}
                onClick={(e) => {
                  if (e.shiftKey) shiftClickedRef.current = true;
                }}
                onChange={(e) => {
                  const isShift = Boolean(
                    shiftClickedRef.current ||
                    (e.nativeEvent as MouseEvent)?.shiftKey ||
                    (e as any).shiftKey ||
                    (window.event as any)?.shiftKey
                  );
                  shiftClickedRef.current = false;
                  handleTaskCheckboxChange(e, String(t.id), isShift);
                }}
                className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer active:scale-95 touch-manipulation"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="w-10 px-1 py-1 flex items-center justify-center shrink-0 border-r border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-400 dark:text-slate-500 font-semibold select-none">
          {taskIndex !== undefined ? taskIndex + 1 : (t.orderIndex !== undefined ? t.orderIndex + 1 : '#')}
        </div>
      )}

      {/* Task Name Column with indentation for child tasks */}
      <div className="flex-1 min-w-0 px-2 py-1 flex items-center gap-1 overflow-hidden">
        {isChild && <div className="w-3 shrink-0" />}
        
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggleModularParent(t.id)}
            className="p-0.5 rounded bg-purple-600 text-white hover:bg-purple-700 shadow-xs shrink-0 cursor-pointer transition-all active:scale-90"
            title="Toggle Grouped Tasks"
          >
            {isModularExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-white font-bold stroke-[2.5]" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-white font-bold stroke-[2.5]" />
            )}
          </button>
        )}

        {(isChild || Boolean(t.parentTaskId)) && handleUnlinkModularTasks && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleUnlinkModularTasks([String(t.id)]);
            }}
            className="p-0.5 rounded text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/50 shrink-0 cursor-pointer transition-all active:scale-90"
            title="Unlink child task from parent group"
          >
            <Unlink className="w-3.5 h-3.5" />
          </button>
        )}

        <div 
          onClick={(e) => {
            if (isEditMode) return;
            e.stopPropagation();
            if (onNavigateToTaskDetail) {
              onNavigateToTaskDetail(t.id);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 truncate flex-1 min-w-0 p-0.5 rounded transition-colors group/tname overflow-hidden",
            !isEditMode ? "cursor-pointer hover:bg-slate-100 dark:hover:bg-[#333336]" : ""
          )}
          title={isEditMode ? (isParentTask ? `Parent task (${t.name}) - Dragging disabled` : `Click and drag row to reorder task (${t.name})`) : `Click to view task in Task Detail (${t.name})`}
        >
          {isEditMode && (
            (t.party?.toLowerCase().includes('tenant') || t.party?.toLowerCase().includes('contractor') || t.party?.toLowerCase().includes('nt') || t.name?.toLowerCase().includes('tenant') || t.name?.toLowerCase().includes('design guideline') || t.name?.toLowerCase().includes('opening') || t.name?.toLowerCase().includes('fit-out') || t.name?.toLowerCase().includes('shop drawing') || t.name?.toLowerCase().includes('re-instatement')) ? (
              <span className="text-blue-400 text-[10px] shrink-0 font-black">▶</span>
            ) : (
              <span className="text-emerald-400 text-xs shrink-0">📌</span>
            )
          )}

          <span className="text-xs text-slate-900 dark:text-slate-100 truncate font-semibold flex-1 min-w-0 group-hover/tname:text-blue-600 dark:group-hover/tname:text-[#8ab4f8]" title={t.name}>
            {t.name || '(Unnamed Task)'}
          </span>

          {hasChildren && (
            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold shrink-0">
              ({childCount})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
