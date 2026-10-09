import React, { memo } from 'react';
import { Target, ExternalLink, EyeOff, Locate } from 'lucide-react';
import { Task } from '../../types';

interface GanttFocusControlsProps {
  focusedTask: Task | null;
  onClearFocus: () => void;
  onNavigateToTaskDetail?: (taskId: string) => void;
  onScrollToTask?: () => void;
}

export const GanttFocusControls = memo(function GanttFocusControls({
  focusedTask,
  onClearFocus,
  onNavigateToTaskDetail,
  onScrollToTask,
}: GanttFocusControlsProps) {
  if (!focusedTask) return null;

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-8 sm:right-8 flex items-center gap-2 print:hidden pointer-events-none z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="pointer-events-auto flex items-center gap-2 px-3.5 py-2 bg-slate-900/90 dark:bg-slate-800/95 text-white rounded-2xl shadow-2xl border border-blue-500/50 backdrop-blur-md">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
          <Target className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
          <span className="hidden sm:inline">Focus Active:</span>
          <span className="font-mono text-white max-w-[140px] sm:max-w-[200px] truncate" title={focusedTask.name}>
            {focusedTask.taskCodePhu || (focusedTask as any).taskCode || focusedTask.name}
          </span>
        </div>

        {onScrollToTask && (
          <button
            type="button"
            onClick={onScrollToTask}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg transition-colors cursor-pointer border border-slate-700"
            title="Center on timeline"
          >
            <Locate className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden md:inline font-medium">Locate</span>
          </button>
        )}

        {onNavigateToTaskDetail && (
          <button
            type="button"
            onClick={() => onNavigateToTaskDetail(focusedTask.id)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg transition-colors cursor-pointer"
            title="Open in Task Detail"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-medium">Task Detail</span>
          </button>
        )}

        <button
          type="button"
          onClick={onClearFocus}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 hover:text-rose-100 rounded-lg transition-colors cursor-pointer border border-rose-800/60 active:scale-95"
          title="Clear Focus (Esc)"
        >
          <EyeOff className="w-3.5 h-3.5" />
          <span className="font-semibold">Clear (Esc)</span>
        </button>
      </div>
    </div>
  );
});
