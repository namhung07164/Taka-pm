import React from 'react';

export const GanttColorLegend: React.FC = React.memo(function GanttColorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-2.5 py-1.5 bg-white/90 dark:bg-[#18181b]/90 border border-slate-200/80 dark:border-slate-800 rounded-lg text-[11px] text-slate-700 dark:text-slate-300 shadow-2xs">
      <span className="font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px]">
        Legend:
      </span>

      {/* Completed */}
      <div className="flex items-center gap-1.5" title="Task or Project is 100% Completed">
        <span className="inline-block w-3.5 h-2.5 rounded-xs bg-emerald-500 border border-emerald-600 shrink-0" />
        <span className="font-medium">Completed</span>
      </div>

      {/* On Process */}
      <div className="flex items-center gap-1.5" title="In Progress / On Process (darker fill shows % progress)">
        <span className="relative inline-block w-4 h-2.5 rounded-xs bg-blue-500 border border-blue-600 overflow-hidden shrink-0">
          <span className="absolute left-0 top-0 bottom-0 w-1/2 bg-black/25 dark:bg-white/25" />
        </span>
        <span className="font-medium">On Process</span>
      </div>

      {/* Delayed */}
      <div className="flex items-center gap-1.5" title="Delayed / Overdue past finish date">
        <span className="inline-block w-3.5 h-2.5 rounded-xs bg-rose-500 border border-rose-600 shrink-0" />
        <span className="font-medium">Delayed</span>
      </div>

      {/* Upcoming */}
      <div className="flex items-center gap-1.5" title="Upcoming / Planned task">
        <span className="inline-block w-3.5 h-2.5 rounded-xs bg-slate-400 dark:bg-slate-500 border border-slate-500 shrink-0" />
        <span className="font-medium">Upcoming</span>
      </div>

      {/* Custom Task Color */}
      <div className="flex items-center gap-1.5" title="Custom color assigned to task in Edit Mode">
        <span className="inline-block w-3.5 h-2.5 rounded-xs bg-purple-500 border border-purple-600 shrink-0" />
        <span className="font-medium">Custom Color</span>
      </div>

      {/* Milestone (0d) */}
      <div className="flex items-center gap-1.5" title="Milestone Task (Duration = 0d)">
        <span className="inline-block w-2.5 h-2.5 rotate-45 rounded-[1px] bg-[#f97316] border border-white dark:border-slate-900 ring-1 ring-[#ea580c] shrink-0 mx-0.5" />
        <span className="font-medium">Milestone (0d)</span>
      </div>

      {/* Baseline */}
      <div className="flex items-center gap-1.5" title="Initial Baseline Plan (Start -> Finish)">
        <span className="inline-block w-4 h-[5px] rounded-xs bg-amber-400 border border-amber-600 shrink-0" />
        <span className="font-medium">Baseline</span>
      </div>

      {/* Today Line */}
      <div className="flex items-center gap-1.5" title="Current Today Reference Line">
        <span className="inline-block w-0.5 h-3 bg-red-500 shrink-0 mx-0.5" />
        <span className="font-medium">Today</span>
      </div>
    </div>
  );
});
