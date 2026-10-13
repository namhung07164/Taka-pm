import React from 'react';

interface TooltipProgressBarsProps {
  planProgressPercent: number;
  actProgressPercent: number;
  hasProjectDelegation?: boolean;
}

export const TooltipProgressBars: React.FC<TooltipProgressBarsProps> = ({
  planProgressPercent,
  actProgressPercent,
  hasProjectDelegation,
}) => {
  return (
    <div className="flex flex-col gap-1.5 px-0.5 pt-0.5">
      {/* Plan Progress */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-11 shrink-0">
          Plan:
        </span>
        <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300 shadow-2xs" 
            style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
          />
        </div>
        <span className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400 w-9 text-right shrink-0">
          {planProgressPercent}%
        </span>
      </div>

      {/* Actual Progress - Only shown when project has active delegation (matching General Tab) */}
      {hasProjectDelegation && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-11 shrink-0">
            Act:
          </span>
          <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300 shadow-2xs" 
              style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
            />
          </div>
          <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 w-9 text-right shrink-0">
            {actProgressPercent}%
          </span>
        </div>
      )}
    </div>
  );
};
