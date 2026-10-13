import React, { FC } from 'react';
import { Target, ExternalLink, X, MapPin } from 'lucide-react';
import { Task, Project } from '../../types';

export interface GanttFocusControlsProps {
  task: Task | null;
  project?: Project | null;
  onLocate: () => void;
  onNavigateToTaskDetail?: (taskId: string) => void;
  onClearFocus: () => void;
}

export const GanttFocusControls: React.FC<GanttFocusControlsProps> = ({
  task,
  project,
  onLocate,
  onNavigateToTaskDetail,
  onClearFocus,
}) => {
  if (!task) return null;

  const taskCode = task.taskCodePhu || '';

  return (
    <div
      className="fixed bottom-5 right-5 z-[999] bg-slate-900/95 dark:bg-[#18181b]/95 text-white rounded-2xl shadow-2xl border border-slate-700/80 backdrop-blur-md p-3 max-w-sm w-auto animate-in slide-in-from-bottom-5 duration-200 select-none pointer-events-auto"
      style={{ touchAction: 'none' }}
    >
      {/* Top Header: Badge & Close */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
          <span className="text-[10px] font-black tracking-wider uppercase text-amber-400">
            Focus Mode Active
          </span>
        </div>
        <button
          type="button"
          onClick={onClearFocus}
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          title="Clear Focus Mode (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Task & Project Summary */}
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {taskCode && (
            <span className="px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-300 border border-purple-500/40 text-[10px] font-mono font-bold shrink-0">
              {taskCode}
            </span>
          )}
          <span className="font-bold text-xs text-slate-100 truncate" title={task.name}>
            {task.name}
          </span>
        </div>
        {project && (
          <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 font-medium">
            <span className="font-mono text-blue-400 font-bold">{project.code}</span>
            <span>•</span>
            <span className="truncate">{project.name}</span>
          </div>
        )}
      </div>

      {/* Action Buttons: Locate, Task Detail, Exit */}
      <div className="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={onLocate}
          className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
          title="Center Timeline & Scroll to Task Row"
        >
          <Target className="w-3.5 h-3.5 shrink-0" />
          <span>Locate</span>
        </button>

        {onNavigateToTaskDetail && (
          <button
            type="button"
            onClick={() => onNavigateToTaskDetail(task.id)}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium border border-slate-700/80 transition-all active:scale-95 cursor-pointer"
            title="Open Task Detail Modal"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Detail</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClearFocus}
          className="flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 rounded-lg text-xs font-medium border border-slate-700/80 hover:border-rose-800/60 transition-all active:scale-95 cursor-pointer"
          title="Exit Focus Mode (Esc)"
        >
          <span>Exit</span>
          <span className="text-[10px] text-slate-400 opacity-80">(Esc)</span>
        </button>
      </div>
    </div>
  );
};
