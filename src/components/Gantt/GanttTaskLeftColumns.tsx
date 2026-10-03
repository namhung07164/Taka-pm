import React from 'react';
import { ChevronDown, ChevronRight, GripVertical, EyeOff } from 'lucide-react';
import { Task, Project } from '../../types';
import { cn } from './GanttUtils';
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
  isDragging: boolean;
  handleTaskDragStart: (e: React.DragEvent, id: string) => void;
  handleTaskDragEnd: () => void;
  isEditMode?: boolean;
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
  isDragging,
  handleTaskDragStart,
  handleTaskDragEnd,
  isEditMode = false
}: GanttTaskLeftColumnsProps) {
  const isSelected = selectedTaskSet.has(t.id);
  const taskCode = propTaskCode || (projects.length > 0 && tasks.length > 0 ? computeTaskCode(projects, tasks, t) : (t.taskCodePhu || ''));

  return (
    <div className="flex items-center w-full h-full overflow-hidden">
      {/* Selection Checkbox & Drag Handle & Hide Button - ONLY in Edit Mode */}
      {isEditMode && (
        <div className="w-9 px-1 py-1 flex items-center justify-center gap-0.5 shrink-0 border-r border-slate-200 dark:border-[#333336]">
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
              <div
                draggable
                onDragStart={(e) => handleTaskDragStart(e, t.id)}
                onDragEnd={handleTaskDragEnd}
                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-300"
              >
                <GripVertical className="w-3 h-3" />
              </div>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => handleTaskCheckboxChange(e, t.id)}
                className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
            </div>
          )}
        </div>
      )}

      {/* Task Name Column with indentation for child tasks */}
      <div className="flex-1 min-w-0 px-2 py-1 flex items-center gap-1 overflow-hidden">
        {isChild && <div className="w-3 shrink-0" />}
        
        {hasChildren && (
          <button
            type="button"
            onClick={() => toggleModularParent(t.id)}
            className="p-0.5 rounded hover:bg-slate-700 text-slate-400 shrink-0 cursor-pointer"
          >
            {isModularExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        )}

        <div className="flex items-center gap-1.5 truncate flex-1 min-w-0">
          {(t.party?.toLowerCase().includes('tenant') || t.party?.toLowerCase().includes('contractor') || t.party?.toLowerCase().includes('nt') || t.name?.toLowerCase().includes('tenant') || t.name?.toLowerCase().includes('design guideline') || t.name?.toLowerCase().includes('opening') || t.name?.toLowerCase().includes('fit-out') || t.name?.toLowerCase().includes('shop drawing') || t.name?.toLowerCase().includes('re-instatement')) ? (
            <span className="text-blue-400 text-[10px] shrink-0 font-black">▶</span>
          ) : (
            <span className="text-emerald-400 text-xs shrink-0">📌</span>
          )}

          {taskCode && (
            <span className="font-mono text-[10px] font-bold text-slate-400 shrink-0">
              {taskCode}
            </span>
          )}

          <span className="text-xs text-slate-100 truncate font-medium flex-1 min-w-0" title={t.name}>
            {t.name}
          </span>

          {hasChildren && (
            <span className="text-[10px] text-blue-400 font-semibold shrink-0">
              ({childCount})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
