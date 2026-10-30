import React, { FC } from 'react';

export interface GanttTimelineHeaderProps {
  timeUnits: Array<{
    date: Date;
    days: number;
    label?: string;
    labelPrimary?: string;
    labelSecondary?: string;
  }>;
  dayWidth: number;
  onStartMonthResize?: (
    unitDays: number,
    daysBeforeUnit: number,
    e: React.PointerEvent | React.MouseEvent
  ) => void;
}

export const GanttTimelineHeader: React.FC<GanttTimelineHeaderProps> = React.memo(({
  timeUnits,
  dayWidth,
  onStartMonthResize,
}) => {
  let cumulativeDays = 0;

  return (
    <div className="flex h-full cursor-grab active:cursor-grabbing" title="Click & Drag to Pan, Drag between months to resize">
      {timeUnits.map((unit) => {
        const width = unit.days * dayWidth;
        const daysBefore = cumulativeDays;
        cumulativeDays += unit.days;
        const isCompact = width < 44;
        const isUltraCompact = width < 32;

        return (
          <div
            key={unit.date.getTime()}
            className={`relative flex flex-col justify-center items-center border-r border-slate-200 dark:border-slate-800 text-center shrink-0 py-1 overflow-hidden ${
              isCompact ? 'px-0' : 'px-1'
            }`}
            style={{
              width: `${width}px`,
              minWidth: `${width}px`,
              maxWidth: `${width}px`,
            }}
          >
            <div
              className={`font-bold text-slate-800 dark:text-[#e3e3e3] whitespace-nowrap leading-tight pointer-events-none ${
                isUltraCompact
                  ? 'text-[9px] tracking-tighter'
                  : isCompact
                  ? 'text-[10px] tracking-tight'
                  : 'text-xs truncate'
              }`}
            >
              {unit.labelPrimary || unit.label}
            </div>
            {unit.labelSecondary && (
              <div
                className={`text-slate-500 dark:text-[#838383] font-semibold whitespace-nowrap leading-tight pointer-events-none ${
                  isUltraCompact
                    ? 'text-[8px] tracking-tighter'
                    : isCompact
                    ? 'text-[9px] tracking-tight'
                    : 'text-[10px] truncate'
                }`}
              >
                {unit.labelSecondary}
              </div>
            )}
            {onStartMonthResize && (
              <div
                onPointerDown={(e) => onStartMonthResize(unit.days, daysBefore, e)}
                className="absolute -right-1.5 top-0 bottom-0 w-3 cursor-col-resize z-20 group/month-resize flex items-center justify-center touch-none print:hidden hide-on-actual-print"
                title="Drag left/right to resize month width"
              >
                <div className="w-0.5 h-full group-hover/month-resize:bg-blue-500 group-active/month-resize:bg-blue-600 transition-colors" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
