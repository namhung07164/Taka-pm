import React, { FC, memo } from 'react';
import { Task } from '../../types';
import { parseDateTime, getTaskStatus, cn } from '../../lib/utils';
import { formatMonthDay, getBarColor } from './useMiniGanttData';

interface MiniGanttRowItemProps {
  task: Task;
  isChild: boolean;
  timelineBounds: {
    startDate: Date;
    finishDate: Date;
    totalDays: number;
  };
  todayData: {
    today: Date;
    formattedToday: string;
    percent: number;
    isInTimeline: boolean;
  };
}

export const MiniGanttRowItem: React.FC<MiniGanttRowItemProps> = React.memo(
  ({ task: t, isChild, timelineBounds, todayData }) => {
    const tStart = parseDateTime(t.start);
    const tFinish = parseDateTime(t.finish);
    const rawDuration = parseFloat(String(t.duration ?? ''));
    const isMilestone = !isNaN(rawDuration) && rawDuration === 0;
    const duration = isMilestone ? 0 : isNaN(rawDuration) || rawDuration <= 0 ? 1 : rawDuration;

    const sFormatted = formatMonthDay(tStart);
    const fFormatted = formatMonthDay(tFinish);

    let computedStatus = getTaskStatus(t.start, t.finish);
    const statusStr = (t.runningStatus || '').toLowerCase();
    if (t.approval === 'Approved' || statusStr.includes('complete')) {
      computedStatus = 'Completed';
    } else if (statusStr.includes('cancel')) {
      computedStatus = 'Canceled';
    } else if (statusStr.includes('handover')) {
      computedStatus = 'Handover';
    } else if (statusStr.includes('process') || statusStr.includes('progress')) {
      computedStatus = 'On process';
    }

    const barColor = getBarColor(computedStatus, t.duration);

    let leftPercent = 0;
    let widthPercent = 10;

    const effectiveStart = tStart || tFinish;
    const effectiveFinish = tFinish || tStart;

    if (effectiveStart && effectiveFinish) {
      const offsetDays = Math.max(
        0,
        Math.round((effectiveStart.getTime() - timelineBounds.startDate.getTime()) / 86400000)
      );
      const taskDays = isMilestone
        ? 0
        : Math.max(
            1,
            Math.round((effectiveFinish.getTime() - effectiveStart.getTime()) / 86400000) + 1
          );
      leftPercent = Math.min(
        98,
        Math.max(0, (offsetDays / timelineBounds.totalDays) * 100)
      );
      widthPercent = isMilestone
        ? 0
        : Math.min(
            100 - leftPercent,
            Math.max(2.5, (taskDays / timelineBounds.totalDays) * 100)
          );
    }

    return (
      <div
        className={cn(
          'flex items-center hover:bg-slate-50 dark:hover:bg-[#252528]/50 transition-colors group h-9',
          isChild && 'bg-slate-50/40 dark:bg-[#1a1a1c]/40'
        )}
      >
        {/* Task Info Cell: Name & Dates */}
        <div className="w-[240px] sm:w-[270px] px-3 py-1 border-r border-slate-100 dark:border-[#333336] shrink-0 flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {isChild && (
              <span className="text-slate-400 dark:text-slate-500 font-mono text-[11px] select-none pl-1.5 shrink-0">
                ↳
              </span>
            )}
            {(() => {
              const displayCode = t.taskCodePhu || (t.orderIndex !== undefined && t.orderIndex !== null ? `#${t.orderIndex + 1}` : '');
              if (!displayCode) return null;
              return (
                <span className="font-mono text-[10px] text-blue-600 dark:text-[#8ab4f8] font-bold shrink-0">
                  {displayCode}
                </span>
              );
            })()}
            <span
              className={cn(
                'text-xs truncate flex-1',
                isChild
                  ? 'text-slate-600 dark:text-slate-300 font-normal'
                  : 'text-slate-800 dark:text-slate-100 font-medium'
              )}
              title={`${t.taskCodePhu || (t.orderIndex !== undefined ? `#${t.orderIndex + 1} ` : '')}${t.name}${
                sFormatted || fFormatted ? ` (${sFormatted || ''} - ${fFormatted || ''})` : ''
              }`}
            >
              {t.name}
            </span>
          </div>
          {(sFormatted || fFormatted) && (
            <span
              className="font-mono text-[10px] shrink-0 tabular-nums font-semibold flex items-center gap-0.5"
              title={`Start: ${t.start || 'N/A'} • Finish: ${t.finish || 'N/A'}${
                isMilestone ? ' • Milestone (0d)' : ''
              }`}
            >
              {isMilestone ? (
                <span className="text-orange-600 dark:text-orange-400 flex items-center gap-1 font-bold">
                  <span className="text-[8px]">◆</span>
                  <span>{sFormatted || fFormatted}</span>
                </span>
              ) : (
                <>
                  {sFormatted && (
                    <span className="text-blue-600 dark:text-[#8ab4f8]">{sFormatted}</span>
                  )}
                  {sFormatted && fFormatted && sFormatted !== fFormatted && (
                    <span className="text-slate-400 dark:text-slate-500 font-normal">-</span>
                  )}
                  {fFormatted && sFormatted !== fFormatted && (
                    <span className="text-pink-600 dark:text-pink-400">{fFormatted}</span>
                  )}
                  {!sFormatted && fFormatted && (
                    <>
                      <span className="text-slate-400 dark:text-slate-500 font-normal">→</span>
                      <span className="text-pink-600 dark:text-pink-400">{fFormatted}</span>
                    </>
                  )}
                </>
              )}
            </span>
          )}
        </div>

        {/* Gantt Bar Cell */}
        <div className="flex-1 px-3 py-1 relative h-full flex items-center">
          {/* Background Grid Lines (25%, 50%, 75%) */}
          <div className="absolute inset-0 flex pointer-events-none opacity-20">
            <div className="w-1/4 border-r border-dashed border-slate-400" />
            <div className="w-1/4 border-r border-dashed border-slate-400" />
            <div className="w-1/4 border-r border-dashed border-slate-400" />
          </div>

          {/* Vertical Today Line through task rows */}
          {todayData.isInTimeline && (
            <div
              className="absolute top-0 bottom-0 -translate-x-1/2 pointer-events-none z-10"
              style={{ left: `calc(12px + (100% - 24px) * ${todayData.percent / 100})` }}
            >
              <div className="w-0.5 h-full bg-red-500/80 dark:bg-rose-500/80 shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
            </div>
          )}

          {/* Task Bar / Milestone diamond matching GanttTab */}
          {isMilestone ? (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center cursor-pointer group/bar z-20"
              style={{ left: `${leftPercent}%` }}
              title={`${t.name}\nMilestone (0d): ${t.start || t.finish || 'N/A'}\nStatus: ${computedStatus}${
                t.party ? `\nParty: ${t.party}` : ''
              }`}
            >
              <div className="w-3.5 h-3.5 rotate-45 rounded-xs shadow-md bg-orange-500 hover:bg-orange-600 transition-transform group-hover/bar:scale-125 border border-white dark:border-[#1a1a1c]" />
              <span className="ml-1.5 text-[9px] font-extrabold text-orange-600 dark:text-orange-400 whitespace-nowrap drop-shadow-xs bg-orange-50/80 dark:bg-orange-950/60 px-1 py-0.2 rounded border border-orange-200 dark:border-orange-900/40">
                0d
              </span>
            </div>
          ) : (
            <div
              className={cn(
                'relative h-5 rounded-md shadow-xs transition-all flex items-center overflow-hidden cursor-pointer',
                barColor
              )}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              }}
              title={`${t.name}\nStart: ${t.start || 'N/A'}\nFinish: ${t.finish || 'N/A'}\nDuration: ${duration}d\nStatus: ${computedStatus}${
                t.party ? `\nParty: ${t.party}` : ''
              }`}
            >
              {computedStatus === 'Completed' && (
                <div className="absolute top-0 left-0 bottom-0 w-full bg-black/15 pointer-events-none" />
              )}

              {widthPercent > 12 && (
                <span className="relative z-10 px-1.5 text-[9px] font-extrabold text-white truncate drop-shadow-xs">
                  {duration}d
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
