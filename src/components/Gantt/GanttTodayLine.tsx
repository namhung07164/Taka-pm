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
      className="absolute top-0 bottom-0 pointer-events-none z-[60] group/today"
      style={{ left: `${leftPosition}px`, width: '0px' }}
      title={`Today: ${formattedDate}`}
    >
      {/* Today Pin Header Badge centered directly above the vertical line */}
      <div className="sticky top-1.5 z-[65] select-none pointer-events-auto flex flex-col items-center -translate-x-1/2">
        <div className="bg-red-500 dark:bg-rose-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded shadow-lg tracking-wider flex items-center gap-1 whitespace-nowrap ring-1 ring-white/40 border border-white/20">
          <span>TODAY</span>
          <span className="opacity-95 font-mono font-bold">({formattedDate})</span>
        </div>
        {/* Pointer arrow connecting badge center directly to the line */}
        <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-red-500 dark:border-t-rose-500 -mt-[1px]" />
      </div>

      {/* Glowing Today Line centered at the exact middle */}
      <div className="absolute top-0 bottom-0 left-0 -translate-x-1/2 w-0.5 bg-red-500 dark:bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
    </div>
  );
});

GanttTodayLine.displayName = 'GanttTodayLine';
