import React from 'react';
import { ChevronDown, ChevronRight, GripVertical, Eye, EyeOff } from 'lucide-react';
import { Task, Project, AppUser } from '../../types';
import { cn, formatGanttDate } from './GanttUtils';
import { computeTaskCode } from '../../lib/ganttUtils';

interface GanttTaskLeftColumnsProps {
  t: Task;
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
  handleTaskCheckboxChange: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void;
  isHideMode: boolean;
  toggleHideRow: (id: string, e: React.MouseEvent) => void;
  showStart: boolean;
  startColWidth: number;
  showFinish: boolean;
  finishColWidth: number;
  showParty: boolean;
  partyColWidth: number;
  showDuration: boolean;
  durationColWidth: number;
  isDragging: boolean;
  handleTaskDragStart: (e: React.DragEvent, id: string) => void;
  handleTaskDragEnd: () => void;
}

export function GanttTaskLeftColumns({
  t,
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
  showStart,
  startColWidth,
  showFinish,
  finishColWidth,
  showParty,
  partyColWidth,
  showDuration,
  durationColWidth,
  isDragging,
  handleTaskDragStart,
  handleTaskDragEnd
}: GanttTaskLeftColumnsProps) {
  const isSelected = selectedTaskSet.has(t.id);
  const taskCode = propTaskCode || (projects.length > 0 && tasks.length > 0 ? computeTaskCode(projects, tasks, t) : (t.taskCodePhu || ''));

  return (
    <>
      {/* Selection Checkbox & Drag Handle & Hide Button */}
      <div className="w-10 px-1 py-1 flex items-center justify-center gap-0.5 shrink-0 border-r border-slate-200 dark:border-slate-800">
        {isHideMode ? (
          <button
            type="button"
            onClick={(e) => toggleHideRow(`task-${t.id}`, e)}
            className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors"
            title="Hide this task"
          >
            <EyeOff className="w-3.5 h-3.5" />
          </button>
        ) : (
          <div className="flex items-center gap-0.5">
            <div
              draggable
              onDragStart={(e) => handleTaskDragStart(e, t.id)}
              onDragEnd={handleTaskDragEnd}
              className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500"
            >
              <GripVertical className="w-3 h-3" />
            </div>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => handleTaskCheckboxChange(e, t.id)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            />
          </div>
        )}
      </div>

      {/* Task Name Column with indentation for child tasks */}
      <div className="flex-1 min-w-[140px] px-2 py-1 flex items-center gap-1.5 overflow-hidden border-r border-slate-200 dark:border-slate-800">
        {isChild && <div className="w-4 shrink-0" />}
        
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggleModularParent(t.id)}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 shrink-0"
          >
            {isModularExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        )}

        <div className="flex items-center gap-1.5 truncate">
          {taskCode && (
            <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
              {taskCode}
            </span>
          )}
          <span className="text-xs text-slate-800 dark:text-slate-200 truncate font-medium" title={t.name}>
            {t.name}
          </span>
          {hasChildren && (
            <span className="text-[10px] text-blue-500 font-semibold shrink-0">
              ({childCount})
            </span>
          )}
        </div>
      </div>

      {/* Start Date Column */}
      {showStart && (
        <div
          className="px-2 py-1 text-center font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0 border-r border-slate-200 dark:border-slate-800 truncate"
          style={{ width: `${startColWidth}px` }}
        >
          {formatGanttDate(t.start)}
        </div>
      )}

      {/* Finish Date Column */}
      {showFinish && (
        <div
          className="px-2 py-1 text-center font-mono text-[11px] text-slate-600 dark:text-slate-400 shrink-0 border-r border-slate-200 dark:border-slate-800 truncate"
          style={{ width: `${finishColWidth}px` }}
        >
          {formatGanttDate(t.finish)}
        </div>
      )}

      {/* Party Column */}
      {showParty && (
        <div
          className="px-2 py-1 text-center text-[11px] font-medium text-slate-600 dark:text-slate-400 shrink-0 border-r border-slate-200 dark:border-slate-800 truncate"
          style={{ width: `${partyColWidth}px` }}
        >
          {t.party || '-'}
        </div>
      )}

      {/* Duration Column */}
      {showDuration && (
        <div
          className="px-2 py-1 text-center font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300 shrink-0 border-r border-slate-200 dark:border-slate-800 truncate"
          style={{ width: `${durationColWidth}px` }}
        >
          {t.duration ? `${t.duration}d` : '-'}
        </div>
      )}
    </>
  );
}
