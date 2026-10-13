import React, { FC } from 'react';
import { GripHorizontal, X } from 'lucide-react';
import { Project } from '../../types';
import { QuickNavButton } from '../QuickNavButton';
import { cn } from '../../lib/utils';

interface MiniGanttHeaderProps {
  project: Project;
  onClose: () => void;
}

export const MiniGanttHeader: React.FC<MiniGanttHeaderProps> = ({ project, onClose }) => {
  const storeDisplay = (project.store || 'HCM').toUpperCase();
  const isHcm = storeDisplay === 'HCM';

  return (
    <div className="modal-handle cursor-grab active:cursor-grabbing px-4 py-3 bg-slate-50 dark:bg-[#252528] border-b border-slate-200 dark:border-[#38383a] flex items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          <GripHorizontal className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className={cn(
              'text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border shrink-0',
              isHcm
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:border-blue-800/80'
                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80'
            )}
          >
            {storeDisplay}
          </span>
          <span className="font-mono font-extrabold text-sm text-blue-700 dark:text-[#8ab4f8] tracking-tight">
            {project.code}
          </span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate max-w-[200px] sm:max-w-[320px]">
            {project.name}
          </span>
        </div>
      </div>

      {/* Header Action Buttons */}
      <div className="flex items-center gap-1.5 shrink-0 no-drag">
        <QuickNavButton
          project={project}
          title={`Quick Navigator (${project.code})`}
          className="no-drag"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="no-drag p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Close Mini Gantt (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
