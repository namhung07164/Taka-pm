import React, { memo } from 'react';
import { Project, Task } from '../../types';
import { cn, formatDisplayDateTime, formatDisplayDateMain, calculateDays, getActStatusPercent } from '../../lib/utils';
import { GripVertical, Trash2, Edit3, ArrowUp, ArrowDown } from 'lucide-react';
import { DetailTableRow } from './detailTypes';
import { EditableCell } from './EditableCell';
import { PredecessorEditableCell } from './PredecessorEditableCell';
import { FastToggle } from './FastToggle';
import { QuickNavButton } from '../QuickNavButton';
import { cleanDurationString } from '../../lib/taskImportService';
import { useIsRowFlashed } from '../../lib/changeFlashService';

interface DetailTaskRowProps {
  item: DetailTableRow & { type: 'task' };
  visibleColumns: string[];
  canWrite: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  dropPosition: 'before' | 'after' | null;
  draggingTaskNames: string;
  taskCode: string;
  isFocused: boolean;
  delStatusText: string;
  delStatusColorClass: string;
  childTasksCount: number;
  tasks?: Task[];
  projects?: Project[];
  onToggleSelectTask: (id: string, shiftKey: boolean) => void;
  onEditTask: (t: Task) => void;
  onUpdateTask: (t: Task, updates: Partial<Task>) => Promise<void>;
  onMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => Promise<void>;
  onDeleteTask: (t: Task) => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragOver: (e: React.DragEvent, taskId: string) => void;
  onDragLeave: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, targetTask: Task, targetProject: Project) => Promise<void>;
}

export const DetailTaskRow = React.memo(function DetailTaskRow({
  item,
  visibleColumns,
  canWrite,
  isSelected,
  isDragging,
  isDragOver,
  dropPosition,
  taskCode,
  isFocused,
  delStatusText,
  delStatusColorClass,
  childTasksCount = 0,
  tasks,
  projects,
  onToggleSelectTask,
  onEditTask,
  onUpdateTask,
  onMoveTask,
  onDeleteTask,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDragEnd,
  onDrop,
}: DetailTaskRowProps) {
  const t = item.task;
  const p = item.project;
  const groupTasks = item.groupTasks;
  const i = item.taskIndex;
  const isChildTask = Boolean(t.parentTaskId);
  const { isFlashed, updatedBy } = useIsRowFlashed(t.id);

  return (
    <tr
      id={`detail-task-${t.id}`}
      data-task-item="true"
      data-task-id={t.id}
      data-project-code={t.projectCode}
      draggable={canWrite}
      onDragStart={(e) => onDragStart(e, t.id)}
      onDragOver={(e) => onDragOver(e, t.id)}
      onDragLeave={(e) => onDragLeave(e, t.id)}
      onDragEnd={onDragEnd}
      onDrop={(e) => onDrop(e, t, p)}
      className={cn(
        "table-row-optimized border-b border-slate-100 dark:border-[#333336] transition-all duration-700 relative",
        item.taskIndex % 2 === 0 ? "bg-white dark:bg-[#1e1e20]" : "bg-slate-50/50 dark:bg-[#252528]",
        isSelected && "bg-blue-50/80 dark:bg-blue-900/20",
        isDragging && "opacity-40",
        isFocused && "ring-2 ring-blue-500 z-10",
        isFlashed && "ring-2 ring-emerald-500/80 bg-emerald-50/80 dark:bg-emerald-950/60 z-10 shadow-sm"
      )}
    >
      {visibleColumns.includes('drag') && (
        <td className="px-2 py-2 text-center select-none w-8 text-slate-400">
          {canWrite && (
            <div className="cursor-grab active:cursor-grabbing flex justify-center items-center">
              <GripVertical size={14} />
            </div>
          )}
        </td>
      )}
      {visibleColumns.includes('checkbox') && (
        <td className="px-2 py-2 text-center select-none">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              const isShift = Boolean(
                (e.nativeEvent as MouseEvent)?.shiftKey ||
                (e as any).shiftKey ||
                (window.event as any)?.shiftKey
              );
              onToggleSelectTask(t.id, isShift);
            }}
            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 bg-white dark:bg-[#28282a] border-slate-300 dark:border-[#444446] cursor-pointer"
          />
        </td>
      )}
      {visibleColumns.includes('no') && (
        <td className="px-3 py-2 text-slate-600 dark:text-[#c3c3c3] text-xs font-mono">
          <div className="flex items-center gap-1.5 pl-1">
            {canWrite && (
              <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <GripVertical size={13} />
              </div>
            )}
            <span className="font-semibold">{i + 1}</span>
            {childTasksCount > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/90 text-purple-700 dark:text-purple-200 border border-purple-300 dark:border-purple-600 shadow-2xs flex items-center gap-0.5 leading-none" title={`${childTasksCount} task con`}>
                ({childTasksCount})
              </span>
            )}
            {isChildTask && (
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 uppercase shrink-0 border border-amber-300 dark:border-amber-700 flex items-center gap-0.5 leading-none" title="Task con (Sub-task)">
                ↳ SUB
              </span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('year') && (
        <td className="px-3 py-2 text-slate-600 dark:text-[#a3a3a3] text-xs">
          {t.projectYear || p.year}
        </td>
      )}
      {visibleColumns.includes('store') && (
        <td className={cn(
          "px-3 py-2 text-xs font-bold",
          (t.projectStore || p.store)?.toLowerCase() === 'hcm'
            ? "text-blue-600 dark:text-[#8ab4f8]"
            : (t.projectStore || p.store)?.toLowerCase() === 'hn'
            ? "text-rose-600 dark:text-rose-400"
            : "text-slate-600 dark:text-[#a3a3a3]"
        )}>
          {t.projectStore || p.store}
        </td>
      )}
      {visibleColumns.includes('location') && (
        <td className="px-3 py-2 text-slate-600 dark:text-[#a3a3a3] text-xs">
          {p.location}
        </td>
      )}
      {visibleColumns.includes('code') && (
        <td className="px-3 py-2 font-mono text-xs">
          <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
            {taskCode || p.code}
          </span>
        </td>
      )}
      {visibleColumns.includes('projectName') && (
        <td className="px-3 py-2 text-slate-400 text-xs">-</td>
      )}
      {visibleColumns.includes('taskName') && (
        <td className="px-3 py-2 font-medium text-slate-800 dark:text-[#f5f5f7]">
          <div className="flex items-center gap-2">
            <EditableCell
              value={t.name || '(Unnamed Task)'}
              onSave={(val) => onUpdateTask(t, { name: val })}
              canWrite={canWrite}
            />
            {isFlashed && (
              <span className="inline-flex items-center gap-1 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-300 animate-pulse border border-emerald-300 dark:border-emerald-700 shrink-0" title={updatedBy ? `Updated by ${updatedBy}` : 'Realtime updated remotely'}>
                🟢 Live
              </span>
            )}
            {t.notes && t.notes.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.2 rounded-full font-mono">
                {t.notes.length} note
              </span>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('duration') && (
        <td className="px-3 py-2 text-slate-500 dark:text-[#a3a3a3] font-mono text-xs">
          {canWrite ? (
            <EditableCell
              value={t.duration !== undefined && t.duration !== null ? t.duration : calculateDays(t.start, t.finish).replace('d', '')}
              type="number"
              className="text-slate-700 dark:text-[#c3c3c3] font-mono font-medium"
              onSave={(val) => {
                const cleanVal = cleanDurationString(val);
                onUpdateTask(t, { duration: cleanVal, durationManual: true });
              }}
              canWrite={canWrite}
            />
          ) : (
            <span className="italic">
              {t.duration !== undefined ? `${t.duration}d` : calculateDays(t.start, t.finish)}
            </span>
          )}
        </td>
      )}
      {visibleColumns.includes('start') && (
        <td className="px-3 py-2 font-mono text-xs">
          <EditableCell
            value={t.start}
            type="datetime-local"
            isDate={true}
            className="text-blue-600 dark:text-[#8ab4f8] font-semibold font-mono"
            onSave={(val) => onUpdateTask(t, { start: val })}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('finish') && (
        <td className="px-3 py-2 font-mono text-xs">
          <EditableCell
            value={t.finish}
            type="datetime-local"
            isDate={true}
            className="text-pink-600 dark:text-pink-400 font-semibold font-mono"
            onSave={(val) => onUpdateTask(t, { finish: val })}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('planProgress') && (
        <td className="px-3 py-2 text-slate-400 font-mono text-xs">-</td>
      )}
      {visibleColumns.includes('actProgress') && (
        <td className="px-3 py-2">
          {item.isProjDelegationOn && t.delegation ? (
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium inline-block", delStatusColorClass)}>
              {delStatusText} ({getActStatusPercent(delStatusText)}%)
            </span>
          ) : (
            <span className="text-slate-400 font-mono text-xs">-</span>
          )}
        </td>
      )}
      {visibleColumns.includes('predecessor') && (
        <td className="px-3 py-2">
          <PredecessorEditableCell
            value={t.predecessor}
            onSave={(updates) => onUpdateTask(t, updates)}
            canWrite={canWrite}
            task={t}
            tasks={tasks}
            projects={projects}
          />
        </td>
      )}
      {visibleColumns.includes('party') && (
        <td className="px-3 py-2">
          <div className="flex items-center justify-between gap-2 pr-1">
            <div className="flex-1">
              <EditableCell
                value={t.party}
                onSave={(val) => onUpdateTask(t, { party: val })}
                canWrite={canWrite}
              />
            </div>
            <FastToggle
              value={Boolean(t.delegation)}
              canWrite={canWrite}
              onToggle={(val) => onUpdateTask(t, { delegation: val })}
              isSmall={true}
            />
          </div>
        </td>
      )}
      {visibleColumns.includes('action') && (
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <QuickNavButton 
              project={p} 
              task={t} 
              taskCode={taskCode} 
              title={`Quick Navigator (${taskCode || t.name})`} 
              className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-blue-500 hover:text-blue-400 bg-transparent border-0 shadow-none"
            />
            {canWrite && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveTask(p, groupTasks, i, 'up'); }}
                  disabled={i === 0}
                  className={cn("p-1 rounded text-slate-400 hover:text-blue-600 transition-colors cursor-pointer", i === 0 && "opacity-30 cursor-not-allowed")}
                  title="Move Up"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveTask(p, groupTasks, i, 'down'); }}
                  disabled={i === groupTasks.length - 1}
                  className={cn("p-1 rounded text-slate-400 hover:text-blue-600 transition-colors cursor-pointer", i === groupTasks.length - 1 && "opacity-30 cursor-not-allowed")}
                  title="Move Down"
                >
                  <ArrowDown size={14} />
                </button>
              </>
            )}
            <button
              onClick={() => onEditTask(t)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              title="Edit Task / Notes"
            >
              <Edit3 size={14} />
            </button>
            {canWrite && (
              <button
                onClick={() => onDeleteTask(t)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                title="Delete Task"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </td>
      )}
      {isDragOver && dropPosition && (
        <td
          colSpan={visibleColumns.length}
          className={cn(
            "absolute left-0 right-0 h-1 bg-blue-500 pointer-events-none z-20",
            dropPosition === 'before' ? "top-0" : "bottom-0"
          )}
        />
      )}
    </tr>
  );
});
