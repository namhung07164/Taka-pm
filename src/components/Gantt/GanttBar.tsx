import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn, parseDateTime } from '../../lib/utils';
import { positionTooltip, formatGanttDate } from './GanttUtils';

export interface GanttBarProps {
  startStr: string | undefined;
  endStr: string | undefined;
  status: string;
  label: string;
  id: string;
  extraVars?: {
    actStatus?: string;
    actStatusColor?: string;
    party?: string;
    actPrg?: number;
    duration?: string | number;
    taskCode?: string;
    predecessors?: string;
    highlight?: 'assignee' | 'creator' | null;
    isSimulation?: boolean;
  };
  startDate: Date;
  dayWidth: number;
  activeTooltip: string | null;
  setActiveTooltip: (id: string | null) => void;
  isEditMode: boolean;
  getBarColor: (status: string, duration?: string | number) => string;
  onBarClick?: (ev: React.MouseEvent) => void;
}

export const getExactDays = (d1: Date, d2: Date) => {
  return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
};

export const GanttBar = React.memo(function GanttBar({
  startStr,
  endStr,
  status,
  label,
  id,
  extraVars,
  startDate,
  dayWidth,
  activeTooltip,
  setActiveTooltip,
  isEditMode,
  getBarColor,
  onBarClick,
}: GanttBarProps) {
  const isSimulation = !!extraVars?.isSimulation;
  const isTask = id.startsWith('task-') || id.startsWith('sim-task-');
  const dStart = parseDateTime(startStr);
  const dEnd = parseDateTime(endStr);
  const isMilestone = dStart && dEnd && Math.abs(dStart.getTime() - dEnd.getTime()) < 3600000;
  
  const [isHovered, setIsHovered] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleMouseMove = (ev: React.MouseEvent) => {
    lastMousePos.current = { x: ev.clientX, y: ev.clientY };
    if (tooltipRef.current) {
      positionTooltip(ev, tooltipRef.current);
    }
  };

  const handleMouseEnter = (ev: React.MouseEvent) => {
    lastMousePos.current = { x: ev.clientX, y: ev.clientY };
    setIsHovered(true);
  };

  React.useEffect(() => {
    if ((isHovered || activeTooltip === id) && tooltipRef.current) {
      positionTooltip({ clientX: lastMousePos.current.x, clientY: lastMousePos.current.y } as any, tooltipRef.current);
    }
  }, [isHovered, activeTooltip, id]);

  if (!dStart || !dEnd) return null;

  const leftDays = getExactDays(startDate, dStart);
  let durationDays = getExactDays(dStart, dEnd);
  
  if (!isMilestone && durationDays === 0) {
    durationDays = 1;
  }

  const leftPx = leftDays * dayWidth;
  const widthPx = Math.max(durationDays * dayWidth, 2);

  if (isMilestone) {
    return (
      <div
        id={isTask ? `gantt-bar-${id}` : undefined}
        onMouseMove={handleMouseMove}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(ev) => {
          ev.stopPropagation();
          if (isEditMode) return;
          if (onBarClick) {
            onBarClick(ev);
            return;
          }
          if (tooltipRef.current) positionTooltip(ev, tooltipRef.current);
          setActiveTooltip(activeTooltip === id ? null : id);
        }}
        className={`absolute top-0 bottom-0 md:hover:z-[60] group ${isEditMode ? "cursor-default" : "cursor-pointer"} ${activeTooltip === id ? "z-[60]" : ""} ${extraVars?.highlight === 'assignee' ? "ring-2 ring-yellow-400 ring-offset-1 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.7)]" : extraVars?.highlight === 'creator' ? "ring-2 ring-purple-400 ring-offset-1 rounded-full shadow-[0_0_10px_rgba(192,132,252,0.7)]" : ""}`}
        style={{ left: `${leftPx + dayWidth / 2 - 8}px`, width: "16px" }}
      >
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-45 rounded-sm shadow-sm ${getBarColor(status, extraVars?.duration)}`}
        />
        <div className="absolute inset-0 flex items-center px-4 overflow-visible z-10 pointer-events-none">
          <span className="truncate whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-300 ml-1">
            {label}{" "}
            {extraVars?.actPrg !== undefined ? `(${extraVars.actPrg}%)` : ""}
          </span>
        </div>
        
        {(isHovered || activeTooltip === id) && createPortal(
          <div
            ref={tooltipRef}
            style={{ top: -9999, left: -9999 }}
          className="fixed gantt-tooltip-global z-[99999] flex w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600 flex-col gap-1 pointer-events-none"
          >
            <div className="font-bold border-b border-slate-600 pb-1 mb-0.5 flex items-start flex-wrap gap-1.5">
              {label}{" "}
              {extraVars?.taskCode && (
                <span className="text-slate-300 font-mono text-[10px]">
                  [{extraVars.taskCode}]
                </span>
              )}{" "}
              ({status})
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-orange-500 text-white font-bold uppercase tracking-wider">
                Milestone
              </span>
            </div>
            {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
              <div className="flex justify-between gap-4">
                {extraVars?.actPrg !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Prog:</span>
                    <span>{extraVars.actPrg}%</span>
                  </div>
                )}
                {extraVars?.duration !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Dur:</span>
                    <span>{extraVars.duration}d</span>
                  </div>
                )}
              </div>
            )}
            {(extraVars?.party || extraVars?.predecessors) && (
              <div className="flex justify-between gap-4">
                {extraVars?.party && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Party:</span>
                    <span>{extraVars.party}</span>
                  </div>
                )}
                {extraVars?.predecessors && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Pred:</span>
                    <span className="max-w-[200px] break-words whitespace-normal" title={extraVars.predecessors}>{extraVars.predecessors}</span>
                  </div>
                )}
              </div>
            )}
            {extraVars?.actStatus && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Status:</span>
                <span style={{ color: extraVars.actStatusColor }}>
                  {extraVars.actStatus}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Dates:</span>
              <span>
                {formatGanttDate(startStr) || "N/A"} -{" "}
                {formatGanttDate(endStr) || "N/A"}
              </span>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div
      id={isTask ? `gantt-bar-${id}` : undefined}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsHovered(false)}
      onClick={(ev) => {
        ev.stopPropagation();
        if (isEditMode) return;
        if (onBarClick) {
          onBarClick(ev);
          return;
        }
        if (tooltipRef.current) positionTooltip(ev, tooltipRef.current);
        setActiveTooltip(activeTooltip === id ? null : id);
      }}
      className={`absolute top-1/2 -translate-y-1/2 h-6 md:hover:z-[60] group rounded-sm shadow-sm ${isEditMode ? "cursor-default" : "cursor-pointer"} ${activeTooltip === id ? "z-[60]" : ""} ${extraVars?.highlight === 'assignee' ? "ring-2 ring-yellow-400 ring-offset-1 shadow-[0_0_10px_rgba(250,204,21,0.5)]" : extraVars?.highlight === 'creator' ? "ring-2 ring-purple-400 ring-offset-1 shadow-[0_0_10px_rgba(192,132,252,0.5)]" : ""}`}
      style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-sm overflow-hidden",
          isSimulation ? "bg-blue-500/30" : getBarColor(status, extraVars?.duration)
        )}
      >
        {!isSimulation && extraVars?.actPrg !== undefined && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-black/20 dark:bg-white/25 pointer-events-none transition-all duration-300"
            style={{
              width: `${Math.min(100, Math.max(0, extraVars.actPrg))}%`,
            }}
          />
        )}
      </div>
      <div className="absolute inset-0 flex items-center px-2 overflow-hidden z-10 pointer-events-none">
        {widthPx > 50 && (
          <span className={cn("truncate flex-1", isSimulation ? "text-blue-900 dark:text-blue-100 font-bold" : "")}>
            {label}{" "}
            {!isSimulation && extraVars?.actPrg !== undefined ? `(${extraVars.actPrg}%)` : ""}
          </span>
        )}
      </div>
      
      {(isHovered || activeTooltip === id) && createPortal(
        <div
          ref={tooltipRef}
          style={{ top: -9999, left: -9999 }}
          className="fixed gantt-tooltip-global z-[99999] flex w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600 flex-col gap-1 pointer-events-none"
        >
          <div className="font-bold border-b border-slate-600 pb-1 mb-0.5 flex items-start flex-wrap gap-1.5">
            <span className="whitespace-normal break-words">{label}</span>
            {extraVars?.taskCode && (
              <span className="text-slate-300 font-mono text-[10px] mt-0.5 whitespace-nowrap">
                [{extraVars.taskCode}]
              </span>
            )}
            <span className="whitespace-nowrap mt-0.5">({status})</span>
          </div>
          {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
            <div className="flex items-center gap-2">
              {extraVars?.actPrg !== undefined && (
                <>
                  <span className="text-slate-400 dark:text-[#838383] w-10">
                    Prog:
                  </span>
                  <span className="w-8">{extraVars.actPrg}%</span>
                </>
              )}
              {extraVars?.duration !== undefined && (
                <>
                  <span className="text-slate-400 dark:text-[#838383] w-10 ml-2">
                    Dur:
                  </span>
                  <span>{extraVars.duration}d</span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-[#838383] w-10">
              Start:
            </span>
            <span>{formatGanttDate(startStr) || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-[#838383] w-10">
              Finish:
            </span>
            <span>{formatGanttDate(endStr) || "N/A"}</span>
          </div>
          {(extraVars?.party || extraVars?.predecessors) && (
            <div className="flex items-start gap-4 mt-1 border-t border-slate-600 pt-1.5">
              {extraVars?.party && (
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-slate-400 dark:text-[#838383] text-[10px] uppercase tracking-wider">
                    Party
                  </span>
                  <span className="font-medium">{extraVars.party}</span>
                </div>
              )}
              {extraVars?.predecessors && (
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-slate-400 dark:text-[#838383] text-[10px] uppercase tracking-wider">
                    Predecessors
                  </span>
                  <span className="font-medium whitespace-normal max-w-[200px] break-words" title={extraVars.predecessors}>
                    {extraVars.predecessors}
                  </span>
                </div>
              )}
            </div>
          )}
          {extraVars?.actStatus && (
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-slate-400 dark:text-[#838383] w-10">
                Status:
              </span>
              <span
                style={{ color: extraVars.actStatusColor }}
                className="font-medium"
              >
                {extraVars.actStatus}
              </span>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
});
