import React, { FC, memo } from 'react';

export interface GanttTimelineHeaderProps {
  timeUnits: Array<{
    date: Date;
    days: number;
    label?: string;
    labelPrimary?: string;
    labelSecondary?: string;
  }>;
  dayWidth: number;
}

export const GanttTimelineHeader: React.FC<GanttTimelineHeaderProps> = React.memo(({
  timeUnits,
  dayWidth,
}) => {
  return (
    <div className="flex h-full cursor-grab active:cursor-grabbing" title="Wheel to Zoom, Click & Drag to Pan">
      {timeUnits.map((unit) => {
        const width = unit.days * dayWidth;
        return (
          <div
            key={unit.date.getTime()}
            className="flex flex-col justify-center items-center border-r border-slate-200 dark:border-slate-800 text-center shrink-0 px-1 py-1"
            style={{
              width: `${width}px`,
              minWidth: `${width}px`,
              maxWidth: `${width}px`,
            }}
          >
            <div className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3] truncate">
              {unit.labelPrimary || unit.label}
            </div>
            {unit.labelSecondary && (
              <div className="text-[10px] text-slate-400 dark:text-[#838383] truncate">
                {unit.labelSecondary}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
