import React, { memo } from 'react';
import { ArrowLeft, EyeOff } from 'lucide-react';
import { Task, Project } from '../../types';

interface DetailFocusControlsProps {
  initialFocusTaskId?: string;
  initialFilterCode?: string;
  tasks?: Task[];
  projects?: Project[];
  onBackToGantt: () => void;
  onClearFocus?: () => void;
}

export const DetailFocusControls = memo(function DetailFocusControls({
  initialFocusTaskId,
  initialFilterCode,
  onBackToGantt,
  onClearFocus
}: DetailFocusControlsProps) {
  if (!initialFocusTaskId && !initialFilterCode) return null;

  return (
    <div className="fixed bottom-[118px] right-4 md:bottom-20 md:right-8 flex items-center gap-2 print:hidden pointer-events-none z-50">
      <button
        onClick={onBackToGantt}
        className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm cursor-pointer border border-slate-600/30"
        title="Back to Gantt"
      >
        <ArrowLeft className="w-4 h-4" />
        <span className="font-bold tracking-wide">Back to Gantt</span>
      </button>

      {onClearFocus && (
        <button
          onClick={onClearFocus}
          className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm cursor-pointer border border-slate-600/30"
          title="Clear Focus (Esc)"
        >
          <EyeOff className="w-4 h-4" />
          <span className="font-bold tracking-wide">Clear Focus</span>
        </button>
      )}
    </div>
  );
});
