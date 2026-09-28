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

  return (
    <div
      className="absolute top-0 bottom-0 w-1 z-20 group/today"
      style={{ left: leftPosition }}
    >
      <div className="absolute inset-y-0 left-0 w-px border-l-2 border-red-500" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1 rounded opacity-0 group-hover/today:opacity-100 transition-opacity whitespace-nowrap">
        {format(customToday, 'dd/MM/yyyy')}
      </div>
    </div>
  );
});

GanttTodayLine.displayName = 'GanttTodayLine';
