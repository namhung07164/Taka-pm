import { ChevronDown, ChevronRight, GripVertical, EyeOff } from 'lucide-react';
import { Task, Project } from '../../types';
import { cn } from './GanttUtils';
import { computeTaskCode } from '../../lib/ganttUtils';
import { useAppStore } from '../../store/useAppStore';

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
  isFocused?: boolean;
  onNavigateToTaskDetail?: (taskId: string) => void;
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
  isEditMode = false,
  isFocused = false,
  onNavigateToTaskDetail
}: GanttTaskLeftColumnsProps) {
  const isSelected = selectedTaskSet.has(t.id);
  const taskCode = propTaskCode || (projects.length > 0 && tasks.length > 0 ? computeTaskCode(projects, tasks, t) : (t.taskCodePhu || ''));

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
              <div
                draggable
                onDragStart={(e) => handleTaskDragStart(e, t.id)}
                onDragEnd={handleTaskDragEnd}
                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                title="Drag to reorder task"
              >
                <GripVertical className="w-3.5 h-3.5" />
              </div>
              <input
                type="checkbox"
                checked={isSelected}
                onClick={(e) => {
                  (e.target as any)._shiftKey = e.shiftKey;
                }}
                onChange={(e) => handleTaskCheckboxChange(e, t.id)}
                className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
            </div>
          )}
        </div>
      ) : (
        <div className="w-10 px-1 py-1 flex items-center justify-center shrink-0 border-r border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-400 dark:text-slate-500 font-semibold select-none">
          {t.orderIndex !== undefined ? t.orderIndex + 1 : '#'}
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
          title={isEditMode ? `Click and drag row to reorder task (${t.name})` : `Click to view task in Task Detail (${t.name})`}
        >
          {isEditMode && (
            (t.party?.toLowerCase().includes('tenant') || t.party?.toLowerCase().includes('contractor') || t.party?.toLowerCase().includes('nt') || t.name?.toLowerCase().includes('tenant') || t.name?.toLowerCase().includes('design guideline') || t.name?.toLowerCase().includes('opening') || t.name?.toLowerCase().includes('fit-out') || t.name?.toLowerCase().includes('shop drawing') || t.name?.toLowerCase().includes('re-instatement')) ? (
              <span className="text-blue-400 text-[10px] shrink-0 font-black">▶</span>
            ) : (
              <span className="text-emerald-400 text-xs shrink-0">📌</span>
            )
          )}

          <span className="text-xs text-slate-900 dark:text-slate-100 truncate font-semibold flex-1 min-w-0 group-hover/tname:text-blue-600 dark:group-hover/tname:text-[#8ab4f8]" title={t.name}>
            {t.name}
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
