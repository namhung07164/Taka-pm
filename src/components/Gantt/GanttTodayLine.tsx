import React from 'react';
import { format } from 'date-fns';

export interface GanttTodayLineProps {
  showToday: boolean;
  sideWidth: number;
  showStart: boolean;
  startColWidth: number;
  showFinish: boolean;
  finishColWidth: number;
  showParty: boolean;
  partyColWidth: number;
  showDuration: boolean;
  durationColWidth: number;
  todayLeftPx: number;
  customToday: Date;
}

export const GanttTodayLine: React.FC<GanttTodayLineProps> = React.memo(({
  showToday,
  sideWidth,
  showStart,
  startColWidth,
  showFinish,
  finishColWidth,
  showParty,
  partyColWidth,
  showDuration,
  durationColWidth,
  todayLeftPx,
  customToday,
}) => {
  if (!showToday) return null;

  const leftPosition =
    sideWidth +
    (showStart ? startColWidth : 0) +
    (showFinish ? finishColWidth : 0) +
    (showParty ? partyColWidth : 0) +
    (showDuration ? durationColWidth : 0) +
    todayLeftPx;

  const formattedDate = format(customToday, 'dd/MM/yyyy');

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-[60] flex flex-col items-center group/today"
      style={{ left: `${leftPosition}px` }}
      title={`Today: ${formattedDate}`}
    >
      {/* Today Pin Header Badge matching Mini Gantt */}
      <div className="sticky top-1.5 z-[65] -translate-x-1/2 select-none pointer-events-auto">
        <div className="bg-red-500 dark:bg-rose-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded shadow-lg tracking-wider flex items-center gap-1 whitespace-nowrap ring-1 ring-white/40 border border-white/20">
          <span>TODAY</span>
          <span className="opacity-95 font-mono font-bold">({formattedDate})</span>
        </div>
      </div>

      {/* Glowing Today Line matching Mini Gantt */}
      <div className="w-0.5 flex-1 bg-red-500 dark:bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
    </div>
  );
});

GanttTodayLine.displayName = 'GanttTodayLine';
