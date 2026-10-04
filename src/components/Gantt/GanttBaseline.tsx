import React from 'react';
import { parseDateTime } from '../../lib/utils';
import { getExactDays } from './GanttBar';

export interface GanttBaselineProps {
  startStr?: string;
  endStr?: string;
  baselineStart?: string;
  baselineFinish?: string;
  baseStart?: string;
  baseFinish?: string;
  type?: "project" | "task";
  startDate: Date;
  dayWidth: number;
}

export const GanttBaseline: React.FC<GanttBaselineProps> = React.memo(({ 
  startStr, 
  endStr, 
  baselineStart, 
  baselineFinish, 
  baseStart,
  baseFinish,
  startDate, 
  dayWidth 
}) => {
  const effectiveStart = baselineStart || baseStart || startStr;
  const effectiveEnd = baselineFinish || baseFinish || endStr;
  if (!effectiveStart || !effectiveEnd) return null;
  const s = parseDateTime(effectiveStart);
  const e = parseDateTime(effectiveEnd);
  if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return null;

  const leftDays = getExactDays(startDate, s);
  const widthDays = Math.max(getExactDays(s, e) + 1, 1);

  const leftPx = leftDays * dayWidth;
  const widthPx = Math.max(widthDays * dayWidth, 6);

  return (
    <div
      className="absolute bottom-0.5 h-[5px] rounded-xs bg-amber-400 dark:bg-amber-400 border border-amber-600/90 dark:border-amber-500/90 shadow-[0_2px_4px_rgba(0,0,0,0.3)] pointer-events-none z-[45] ring-1 ring-white/20 transition-all"
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      title={`Baseline Plan: ${effectiveStart} -> ${effectiveEnd}`}
    />
  );
}, (prev, next) => {
  const prevStart = prev.baselineStart || prev.baseStart || prev.startStr;
  const prevEnd = prev.baselineFinish || prev.baseFinish || prev.endStr;
  const nextStart = next.baselineStart || next.baseStart || next.startStr;
  const nextEnd = next.baselineFinish || next.baseFinish || next.endStr;
  return prevStart === nextStart &&
         prevEnd === nextEnd &&
         prev.dayWidth === next.dayWidth &&
         prev.startDate.getTime() === next.startDate.getTime();
});
