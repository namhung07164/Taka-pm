import React, { FC } from 'react';
import { Project } from '../../../types';
import { cn } from '../../../lib/utils';

interface TooltipTitleSectionProps {
  v: any;
  p?: Project;
  canWrite: boolean;
  storeDisplay: string;
  unitCode: string;
  projectName: string;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
}

export const TooltipTitleSection: React.FC<TooltipTitleSectionProps> = ({
  v,
  p,
  canWrite,
  storeDisplay,
  unitCode,
  projectName,
  onEditProject,
}) => {
  return (
    <div className="w-full pt-0.5">
      <div 
        onClick={() => p && onEditProject?.(p, !canWrite, 'details')}
        className={cn(
          "font-bold text-slate-800 dark:text-[#f0f0f3] text-sm sm:text-[14px] leading-tight break-words flex items-start gap-1.5 flex-wrap",
          p ? "cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors" : ""
        )}
        title={p ? "Click to view project details" : undefined}
      >
        {v.floor && (
          <span className={cn(
            "text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border shrink-0 inline-block my-0.5",
            storeDisplay.toLowerCase() === 'hcm' 
              ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:border-blue-800/80' 
              : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80'
          )}>
            {storeDisplay}
          </span>
        )}
        {v.projectCode && <span className="font-bold font-mono text-blue-600 dark:text-[#8ab4f8]">{unitCode}</span>}
        {(v.projectCode && v.projectName && projectName) && <span className="text-slate-400 dark:text-slate-500">-</span>}
        {v.projectName && projectName && <span className="text-slate-800 dark:text-slate-100">{projectName}</span>}
        {!v.floor && !v.projectCode && (!v.projectName || !projectName) && (
          <span className="font-bold font-mono text-slate-400">{unitCode}</span>
        )}
      </div>
    </div>
  );
};
