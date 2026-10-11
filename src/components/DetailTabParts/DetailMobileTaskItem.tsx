import React, { memo } from 'react';
import { ChevronUp, ChevronDown, Maximize2, Trash2 } from 'lucide-react';
import { Task, Project } from '../../types';
import { FastToggle } from './FastToggle';
import { EditableCell } from './EditableCell';
import { cleanDurationString } from '../../lib/taskImportService';
import { cn, formatDisplayDateMain, calculateDays, getTaskStatus, getActStatusPercent } from '../../lib/utils';

export interface DetailMobileTaskItemProps {
  task: Task;
  project: Project;
  groupTasks: Task[];
  index: number;
  taskCode: string;
  actStatus: { label: string; color: string };
  isFocused: boolean;
  canWrite: boolean;
  isProjectDelegationOn?: boolean;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  handleMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => void;
  handleUpdateTask: (task: Task, updates: Partial<Task>) => void;
  handleDeleteTask: (task: Task) => void;
}

export const DetailMobileTaskItem = memo(function DetailMobileTaskItem({
  task: t,
  project: p,
  groupTasks,
  index: i,
  taskCode,
  actStatus,
  isFocused,
  canWrite,
  isProjectDelegationOn,
  onEditTask,
  handleMoveTask,
  handleUpdateTask,
  handleDeleteTask
}: DetailMobileTaskItemProps) {
  const taskStatus = getTaskStatus(t.start, t.finish);

  let taskStatusColorClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 font-bold';
  if (taskStatus === 'Completed') {
    taskStatusColorClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white border-emerald-500 font-extrabold shadow-2xs';
  } else if (taskStatus === 'On process') {
    taskStatusColorClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white border-amber-400 font-extrabold shadow-2xs';
  }

  const delStatusText = actStatus?.label || 'Pending';
  const delStatusColorClass = actStatus?.color || 'bg-slate-50 text-slate-600';

  const showActStatus = Boolean(isProjectDelegationOn && t.delegation);

  const taskBorderAccent = taskStatus === 'Completed' 
    ? 'border-l-[4px] border-l-emerald-500' 
    : taskStatus === 'On process' 
    ? 'border-l-[4px] border-l-amber-500' 
    : 'border-l-[4px] border-l-slate-400';

  return (
    <div 
      id={`detail-task-${t.id}`} 
      style={{ contentVisibility: 'auto', containIntrinsicSize: '120px' }}
      className={cn(
        "bg-slate-50/90 dark:bg-[#252528] rounded-xl p-3 border border-slate-200/90 dark:border-[#444446] text-sm shadow-xs flex flex-col gap-2.5 transition-all", 
        taskBorderAccent,
        isFocused ? "ring-2 ring-inset ring-yellow-400 !bg-yellow-50 dark:!bg-yellow-900/20" : ""
      )} 
      onClick={() => canWrite && onEditTask(t, false, "chat")}
    >
      <div className="flex gap-3">
        {canWrite && (
          <div className="shrink-0 flex flex-col items-center justify-center -mr-1">
            <button
              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'up'); }}
              disabled={i === 0}
              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:hover:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed touch-manipulation active:scale-95"
              title="Move Up"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'down'); }}
              disabled={i === groupTasks.length - 1}
              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:hover:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed touch-manipulation active:scale-95"
              title="Move Down"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex flex-col w-20 shrink-0 text-xs text-slate-500 dark:text-[#a3a3a3] gap-1 border-r border-slate-200 dark:border-[#444446] pr-2">
          <div className="font-mono text-blue-700 dark:text-[#8ab4f8] font-bold">{formatDisplayDateMain(t.start)}</div>
          <div className="font-mono text-pink-700 dark:text-pink-400 font-bold">{formatDisplayDateMain(t.finish)}</div>
          <div className="text-[10px] mt-1">
            {canWrite ? (
              <EditableCell
                value={t.duration !== undefined && t.duration !== null ? t.duration : calculateDays(t.start, t.finish).replace('d', '')}
                type="number"
                className="text-slate-700 dark:text-[#c3c3c3] font-mono font-medium text-[10px] px-0.5 py-0"
                onSave={(val) => {
                  const cleanVal = cleanDurationString(val);
                  handleUpdateTask(t, { duration: cleanVal, durationManual: true });
                }}
                canWrite={canWrite}
              />
            ) : (
              <span className="italic">{t.duration !== undefined ? `${t.duration}d` : calculateDays(t.start, t.finish)}</span>
            )}
          </div>
        </div>
        <div className="flex-grow flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shrink-0 inline-block">
              {taskCode || t.taskCodePhu || `${p.code}#${i + 1}`}
            </span>
            <span className="font-bold text-slate-900 dark:text-[#ffffff] text-sm leading-snug">
              {t.name || '(Unnamed Task)'}
            </span>
          </div>
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-slate-600 dark:text-[#a3a3a3] font-medium">{t.party || ''}</span>
              {t.predecessor && (
                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-800">
                  Pred: {t.predecessor}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <FastToggle value={Boolean(t.delegation)} canWrite={canWrite} onToggle={(val) => handleUpdateTask(t, { delegation: val })} />
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-end pt-2 border-t border-slate-200 dark:border-[#444446] mt-1">
        <div className="flex gap-3 items-center">
          <button 
            onClick={(e) => { e.stopPropagation(); onEditTask(t, false, "chat"); }} 
            className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors touch-manipulation active:scale-95" 
            title="Open Task Modal"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          {canWrite && (
            <button 
              onClick={(e) => { e.stopPropagation(); handleDeleteTask(t); }} 
              className="text-red-400 hover:text-red-600 dark:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors touch-manipulation active:scale-95"
              title="Delete Task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-1 items-end">
          <div className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${taskStatusColorClass}`}>
            Pl: {taskStatus}
          </div>
          {showActStatus && (
            <div className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md border ${delStatusColorClass}`}>
              Act: {delStatusText} ({getActStatusPercent(delStatusText)}%)
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
