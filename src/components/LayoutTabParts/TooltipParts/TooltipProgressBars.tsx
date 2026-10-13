import React, { FC } from 'react';

interface TooltipProgressBarsProps {
  planProgressPercent: number;
  actProgressPercent: number;
}

export const TooltipProgressBars: React.FC<TooltipProgressBarsProps> = ({
  planProgressPercent,
  actProgressPercent,
}) => {
  return (
    <div className="flex flex-col gap-1 px-0.5 pt-0.5">
      {/* Plan Progress */}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
          Plan Prg:
        </span>
        <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
          />
        </div>
        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
          {planProgressPercent}%
        </span>
      </div>

      {/* Actual Progress */}
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
          Act Prg:
        </span>
        <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
          <div 
            className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
          />
        </div>
        <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
          {actProgressPercent}%
        </span>
      </div>
    </div>
  );
};
