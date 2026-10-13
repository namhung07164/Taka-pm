import React, { FC, memo } from 'react';

export interface GanttGridOverlayProps {
  leftOffset?: number;
  sideWidth?: number;
  totalDays?: number;
  timeUnits: Array<{ date: Date; days: number }>;
  dayWidth: number;
}

export const GanttGridOverlay: React.FC<GanttGridOverlayProps> = React.memo(({
  leftOffset,
  sideWidth = 0,
  timeUnits,
  dayWidth,
}) => {
  const actualLeft = leftOffset !== undefined ? leftOffset : sideWidth;
  return (
    <div
      className="absolute top-0 bottom-0 pointer-events-none z-10 flex"
      style={{ left: actualLeft }}
    >
      {timeUnits.map((unit) => (
        <div
          key={unit.date.getTime()}
          className="border-r border-slate-100 dark:border-[#333336] shrink-0 h-full"
          style={{
            width: `${unit.days * dayWidth}px`,
            minWidth: `${unit.days * dayWidth}px`,
            maxWidth: `${unit.days * dayWidth}px`,
          }}
        />
      ))}
    </div>
  );
}, (prev, next) => {
  const prevLeft = prev.leftOffset !== undefined ? prev.leftOffset : prev.sideWidth;
  const nextLeft = next.leftOffset !== undefined ? next.leftOffset : next.sideWidth;
  return prevLeft === nextLeft &&
         prev.dayWidth === next.dayWidth &&
         prev.timeUnits.length === next.timeUnits.length &&
         (prev.timeUnits.length === 0 || prev.timeUnits[0].date.getTime() === next.timeUnits[0]?.date.getTime());
});
