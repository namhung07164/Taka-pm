import React from 'react';
import { parseDateTime } from '../../lib/utils';
import { getExactDays } from './GanttBar';

export interface GanttBaselineProps {
  startStr?: string;
  endStr?: string;
  baselineStart?: string;
  baselineFinish?: string;
  type?: "project" | "task";
  startDate: Date;
  dayWidth: number;
}

export const GanttBaseline: React.FC<GanttBaselineProps> = React.memo(({ 
  startStr, 
  endStr, 
  baselineStart, 
  baselineFinish, 
  startDate, 
  dayWidth 
}) => {
  const effectiveStart = baselineStart || startStr;
  const effectiveEnd = baselineFinish || endStr;
  if (!effectiveStart || !effectiveEnd) return null;
  const s = parseDateTime(effectiveStart);
  const e = parseDateTime(effectiveEnd);
  if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return null;

  const leftDays = getExactDays(startDate, s);
  const widthDays = getExactDays(e, s) + 1;

  const leftPx = leftDays * dayWidth;
  const widthPx = Math.max(widthDays * dayWidth, 4);

  return (
    <div
      className="absolute bottom-0.5 h-[4px] rounded-sm bg-yellow-400 dark:bg-yellow-400 border-[0.5px] border-yellow-600/80 shadow-[0_2px_4px_rgba(0,0,0,0.3)] pointer-events-none z-[45] ring-1 ring-white/20"
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      title="Baseline Plan"
    />
  );
}, (prev, next) => {
  const prevStart = prev.baselineStart || prev.startStr;
  const prevEnd = prev.baselineFinish || prev.endStr;
  const nextStart = next.baselineStart || next.startStr;
  const nextEnd = next.baselineFinish || next.endStr;
  return prevStart === nextStart &&
         prevEnd === nextEnd &&
         prev.dayWidth === next.dayWidth &&
         prev.startDate.getTime() === next.startDate.getTime();
});
