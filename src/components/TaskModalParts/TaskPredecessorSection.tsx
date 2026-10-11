import React, { memo } from 'react';
import { Info } from 'lucide-react';
import { PredecessorHardLinkInput } from './PredecessorHardLinkInput';
import { Task } from '../../types';
import { formatDisplayDateTime } from '../../lib/utils';

interface TaskPredecessorSectionProps {
  task: Task;
  formData: any;
  canWrite: boolean;
  t: (key: string) => string;
  tasks: any[];
  projects: any[];
  resolvedPredecessors: any[];
  handlePredecessorChange: (val: string) => void;
  handlePredecessorTaskIdsChange: (ids: string[]) => void;
  handleApplyPredecessorDates: () => void;
}

export const TaskPredecessorSection = memo(function TaskPredecessorSection({
  task,
  formData,
  canWrite,
  t,
  tasks,
  projects,
  resolvedPredecessors,
  handlePredecessorChange,
  handlePredecessorTaskIdsChange,
  handleApplyPredecessorDates,
}: TaskPredecessorSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 dark:text-[#838383] uppercase">
          {t("Predecessor")}
          <span className="group relative inline-flex items-center">
            <Info className="w-3.5 h-3.5 text-amber-500 cursor-help" />
            <div className="absolute bottom-full left-0 mb-1.5 w-56 p-2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] leading-relaxed rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50 normal-case font-normal shadow-xl">
              The second predecessor requires a valid 'SF' (Start-to-Finish) or 'FF' (Finish-to-Finish) relationship.
              <svg className="absolute top-full left-1.5 w-2 h-2 text-slate-800 dark:text-slate-700" viewBox="0 0 8 4" fill="currentColor">
                <path d="M0 0l4 4 4-4H0z"/>
              </svg>
            </div>
          </span>
        </label>
        {resolvedPredecessors.length > 0 && (
          <div className="flex flex-col items-end gap-0.5 truncate max-w-[200px]">
            {resolvedPredecessors.map((rp, idx) => rp?.task && (
              <span key={idx} className={`text-[10px] font-semibold truncate ${idx === 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>
                {idx + 1}. {rp.task.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {task ? (
        <PredecessorHardLinkInput 
          task={task}
          canWrite={canWrite}
        />
      ) : (
        <div className="text-[10px] text-slate-500 italic p-2 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
          Please save the task first to enable predecessor linking.
        </div>
      )}

      {resolvedPredecessors.length > 0 && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {resolvedPredecessors.map((rp, idx) => rp?.task && (
            <div 
              key={idx} 
              className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                idx === 0 
                  ? "bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800" 
                  : "bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
              }`}
            >
              <div className="flex flex-col gap-0.5 truncate mr-2">
                <span className={`font-semibold truncate ${idx === 0 ? "text-blue-800 dark:text-blue-300" : "text-rose-800 dark:text-rose-300"}`}>
                  {idx + 1}. {rp.task.name}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-[#a3a3a3]">
                  {(rp.type === 'SS' || rp.type === 'SF') ? 'Start' : 'End'}: {formatDisplayDateTime((rp.type === 'SS' || rp.type === 'SF') ? rp.task.start : rp.task.finish)} ({rp.type || "FS"}{rp.lagValue ? ` ${rp.lagSign}${rp.lagValue}d` : ""})
                </span>
              </div>
              {idx === 0 && (
                <button
                  type="button"
                  onClick={handleApplyPredecessorDates}
                  className="shrink-0 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 bg-white dark:bg-[#1e1e20] border border-blue-200 dark:border-blue-700 px-2 py-1 rounded shadow-sm hover:bg-blue-50 cursor-pointer active:scale-95 touch-manipulation"
                >
                  Sync dates
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
