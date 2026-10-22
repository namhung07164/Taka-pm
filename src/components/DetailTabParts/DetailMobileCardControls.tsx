import React, { memo } from 'react';
import { ArrowDownUp, Maximize2 } from 'lucide-react';
import { Project, Task } from '../../types';
import { FastToggle } from './FastToggle';
import { formatDisplayDateMain } from '../../lib/utils';

interface DetailMobileCardControlsProps {
  project: Project;
  groupTasks: Task[];
  displayParty: string;
  isProjectDelegationOn: boolean;
  startParts: { month: string; day: string; year: string } | null;
  complParts: { month: string; day: string; year: string } | null;
  canWrite: boolean;
  computedTakStart?: string;
  computedTakCompl?: string;
  onSortSubTasks?: (p: Project, groupTasks: Task[]) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
}

export const DetailMobileCardControls = memo(function DetailMobileCardControls({
  project: p,
  groupTasks,
  displayParty,
  isProjectDelegationOn,
  startParts,
  complParts,
  canWrite,
  computedTakStart,
  computedTakCompl,
  onSortSubTasks,
  onEditProject,
}: DetailMobileCardControlsProps) {
  return (
    <>
      {/* Project Party (Placed above controls bar so it has full width and never truncates) */}
      {displayParty ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span 
            className="px-2 py-0.5 rounded-md border border-purple-500/80 dark:border-purple-500 bg-purple-100/60 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 text-xs font-semibold shadow-2xs break-words max-w-full"
            title={`Party: ${displayParty}`}
          >
            {displayParty}
          </span>
        </div>
      ) : null}

      <div className="border-t border-slate-200/80 dark:border-[#38383b] my-0.5" />

      {/* Controls Bar: Sort, Delegation Toggle, Maximize, and Stacked Dates */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSortSubTasks?.(p, groupTasks);
            }}
            className="px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#28282a] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center gap-1 shadow-2xs active:scale-95 touch-manipulation cursor-pointer"
            title="Sort sub-tasks by Start Date"
          >
            <ArrowDownUp className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span>Sort</span>
          </button>

          <div className="flex items-center" title="Project delegation status (active when child tasks have delegation enabled)">
            <FastToggle
              value={isProjectDelegationOn}
              canWrite={false}
              readOnly={true}
              onToggle={() => {}}
              isSmall={true}
            />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onEditProject?.(p, !canWrite, "chat");
            }}
            className="p-1 text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-95 touch-manipulation cursor-pointer"
            title="Open Project Details"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Right side: Stacked Dates */}
        <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
          {startParts && (
            <div 
              className="flex flex-col items-center text-center font-bold text-xs sm:text-sm leading-tight text-blue-600 dark:text-sky-400 select-none whitespace-nowrap"
              title={`Start: ${formatDisplayDateMain(computedTakStart || p.start)}`}
            >
              <span>{startParts.month}</span>
              <span>{startParts.day}</span>
              <span>{startParts.year}</span>
            </div>
          )}
          {complParts && (
            <div 
              className="flex flex-col items-center text-center font-bold text-xs sm:text-sm leading-tight text-pink-600 dark:text-pink-400 select-none whitespace-nowrap"
              title={`Finish: ${formatDisplayDateMain(computedTakCompl || p.handover || p.opening)}`}
            >
              <span>{complParts.month}</span>
              <span>{complParts.day}</span>
              <span>{complParts.year}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
});
