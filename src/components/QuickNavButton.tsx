import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Project, Task } from '../types';
import { useAppStore } from '../store/useAppStore';

interface QuickNavButtonProps {
  project: Project;
  task?: Task | null;
  taskCode?: string;
  className?: string;
  title?: string;
}

export function QuickNavButton({ project, task, taskCode, className = "", title }: QuickNavButtonProps) {
  const setQuickNavTarget = useAppStore(state => state.setQuickNavTarget);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const effectiveCode = taskCode || (task ? (task.taskCodePhu || project?.code) : project?.code);
    setQuickNavTarget({
      project,
      task,
      taskCode: effectiveCode,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-1.5 rounded-lg bg-slate-800/90 dark:bg-[#242426] hover:bg-slate-700 dark:hover:bg-[#333336] border border-slate-700/80 dark:border-[#444446] text-blue-500 hover:text-blue-400 transition-all shadow-xs active:scale-95 cursor-pointer shrink-0 flex items-center justify-center ${className}`}
      title={title || "Quick Navigator"}
      aria-label="Quick Navigator"
    >
      <ExternalLink className="w-3.5 h-3.5 stroke-[2.2]" />
    </button>
  );
}
