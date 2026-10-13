import React, { FC, memo } from 'react';
import { format } from 'date-fns';

export interface GanttTodayLineProps {
  showToday?: boolean;
  sideWidth?: number;
  showStart?: boolean;
  startColWidth?: number;
  showFinish?: boolean;
  finishColWidth?: number;
  showParty?: boolean;
  partyColWidth?: number;
  showDuration?: boolean;
  durationColWidth?: number;
  showPredecessor?: boolean;
  predecessorColWidth?: number;
  todayLeftPx?: number;
  customToday: Date;
  setCustomToday?: (d: Date) => void;
  isDraggingToday?: boolean;
  setIsDraggingToday?: (v: boolean) => void;
  startDate?: Date;
  dayWidth?: number;
  getDateFromOffsetPx?: (offsetPx: number) => Date;
}

export const GanttTodayLine: React.FC<GanttTodayLineProps> = React.memo(({
  showToday = true,
  sideWidth = 0,
  showStart = false,
  startColWidth = 0,
  showFinish = false,
  finishColWidth = 0,
  showParty = false,
  partyColWidth = 0,
  showDuration = false,
  durationColWidth = 0,
  showPredecessor = false,
  predecessorColWidth = 0,
  todayLeftPx,
  customToday,
  setCustomToday,
  isDraggingToday,
  setIsDraggingToday,
  startDate,
  dayWidth = 30,
  getDateFromOffsetPx,
}) => {
  if (!showToday) return null;

  let calculatedTodayLeft = todayLeftPx;
  if (calculatedTodayLeft === undefined && startDate) {
    const diffDays = (customToday.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    calculatedTodayLeft = diffDays * dayWidth;
  }

  const leftPosition = sideWidth + (calculatedTodayLeft || 0);

  const formattedDate = format(customToday, 'dd/MM/yyyy');

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!setIsDraggingToday || !setCustomToday || !getDateFromOffsetPx) return;
    e.preventDefault();
    setIsDraggingToday(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const containerRect = (e.currentTarget.parentElement?.parentElement as HTMLElement)?.getBoundingClientRect();
      if (!containerRect) return;
      const mouseOffset = moveEvent.clientX - containerRect.left - sideWidth;
      const newDate = getDateFromOffsetPx(mouseOffset);
      setCustomToday(newDate);
    };

    const onMouseUp = () => {
      setIsDraggingToday(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-[60] group/today"
      style={{ left: `${leftPosition}px`, width: '0px' }}
      title={`Today: ${formattedDate}`}
    >
      {/* Today Pin Header Badge centered directly above the vertical line */}
      <div 
        onMouseDown={handleMouseDown}
        className="sticky top-1.5 z-[65] select-none pointer-events-auto cursor-ew-resize flex flex-col items-center -translate-x-1/2"
      >
        <div className="bg-[#f43f5e] text-white font-extrabold text-[9px] px-2.5 py-0.5 rounded-full shadow-lg tracking-wider flex items-center gap-1 whitespace-nowrap ring-1 ring-white/40 border border-white/20">
          <span>TODAY</span>
          <span className="opacity-95 font-mono font-bold">({formattedDate})</span>
        </div>
        {/* Pointer arrow connecting badge center directly to the line */}
        <div className="w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#f43f5e] -mt-[1px]" />
      </div>

      {/* Glowing Today Line centered at the exact middle */}
      <div className="absolute top-0 bottom-0 left-0 -translate-x-1/2 w-0.5 bg-[#f43f5e] shadow-[0_0_8px_rgba(244,63,94,0.7)]" />
    </div>
  );
});

GanttTodayLine.displayName = 'GanttTodayLine';
