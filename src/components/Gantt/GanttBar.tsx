import React, { useState, useRef, useEffect } from 'react';
import { cn, parseDateTime } from '../../lib/utils';
import { positionTooltip } from './GanttUtils';
import { Task, Project } from '../../types';
import { GanttBarTooltip } from './GanttBarTooltip';

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
    hasChildren?: boolean;
    childCount?: number;
    task?: Task;
    tasks?: Task[];
    projects?: Project[];
    canWrite?: boolean;
    onProcessChildTasks?: Array<{
      id: string;
      name: string;
      taskCode?: string;
      actPrg?: number;
      start?: string;
      finish?: string;
      duration?: string | number;
    }>;
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
  const isMilestone = Number(extraVars?.duration) === 0 ||
                      (dStart && dEnd && Math.abs(dStart.getTime() - dEnd.getTime()) < 3600000) ||
                      (label.toLowerCase().includes('opening') && Number(extraVars?.duration || 0) <= 1);

  const customColor = extraVars?.task?.textColor;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingPredecessor, setIsEditingPredecessor] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const isDraggingTooltipRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const tooltipStartPos = useRef({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleBarMouseEnter = (e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setIsHovered(true);
  };

  const handleBarMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 200);
  };

  const handleTooltipMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsHovered(true);
  };

  const handleTooltipMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  const isPinned = activeTooltip === id || isEditingPredecessor;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!tooltipRef.current) return;
    isDraggingTooltipRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    const rect = tooltipRef.current.getBoundingClientRect();
    tooltipStartPos.current = { x: rect.left, y: rect.top };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingTooltipRef.current || !tooltipRef.current) return;
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const newX = Math.max(10, Math.min(window.innerWidth - 100, tooltipStartPos.current.x + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 80, tooltipStartPos.current.y + dy));
    tooltipRef.current.style.left = `${newX}px`;
    tooltipRef.current.style.top = `${newY}px`;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingTooltipRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
  };

  useEffect(() => {
    if ((isHovered || isPinned) && tooltipRef.current && !isDraggingTooltipRef.current) {
      positionTooltip(tooltipRef.current, lastMousePos.current.x, lastMousePos.current.y);
    }
  }, [isHovered, isPinned]);

  if (!dStart || !dEnd) {
    return null;
  }

  const offsetDays = getExactDays(startDate, dStart);
  const durationDays = Math.max(getExactDays(dStart, dEnd) + 1, 1);
  const leftPx = offsetDays * dayWidth;
  const widthPx = isMilestone ? 16 : Math.max(durationDays * dayWidth, 8);

  const barColor = isMilestone 
    ? "bg-[#f97316] border border-[#ea580c]" 
    : getBarColor(status, extraVars?.duration);

  const actProgress = extraVars?.actPrg ?? 0;

  return (
    <>
      <div
        onClick={(e) => {
          if (onBarClick) {
            onBarClick(e);
          } else {
            setActiveTooltip(isPinned ? null : id);
          }
        }}
        onMouseEnter={handleBarMouseEnter}
        onMouseMove={(e) => {
          if (!isPinned && !isDraggingTooltipRef.current) {
            lastMousePos.current = { x: e.clientX, y: e.clientY };
            if (tooltipRef.current) {
              positionTooltip(tooltipRef.current, e.clientX, e.clientY);
            }
          }
        }}
        onMouseLeave={handleBarMouseLeave}
        className={cn(
          "absolute top-1.5 bottom-1.5 flex items-center transition-all cursor-pointer select-none group shadow-2xs",
          isMilestone ? "w-4 h-4 rotate-45 rounded-[2px] mt-1.5 shadow-md z-20" : "h-6 rounded-md",
          !customColor && barColor,
          isSimulation && "border-2 border-dashed border-purple-400 opacity-80",
          extraVars?.highlight === 'assignee' && "ring-2 ring-emerald-400 ring-offset-1",
          extraVars?.highlight === 'creator' && "ring-2 ring-blue-400 ring-offset-1",
          isPinned && "ring-2 ring-blue-500 shadow-md",
          isHovered && "brightness-110 shadow-md scale-[1.01]"
        )}
        style={{
          left: `${leftPx}px`,
          width: `${widthPx}px`,
          zIndex: isPinned ? 30 : isHovered ? 20 : 10,
          ...(customColor && !isMilestone ? { backgroundColor: customColor, borderColor: customColor } : {})
        }}
      >
        {/* Actual Progress Fill */}
        {!isMilestone && actProgress > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 bg-black/20 dark:bg-white/20 rounded-l-md pointer-events-none transition-all duration-300"
            style={{ width: `${Math.min(100, actProgress)}%` }}
          />
        )}

        {/* Bar Label text */}
        {!isMilestone && widthPx > 30 && (
          <div className="px-2 w-full flex items-center justify-between text-[11px] font-bold text-white drop-shadow-xs truncate pointer-events-none">
            <span className="truncate">{label}</span>
            {actProgress > 0 && widthPx > 70 && (
              <span className="text-[10px] font-mono opacity-90 pl-1">{actProgress}%</span>
            )}
          </div>
        )}
      </div>

      {/* Floating Tooltip via Portal */}
      {(isHovered || isPinned) && (
        <GanttBarTooltip
          id={id}
          label={label}
          startStr={startStr}
          endStr={endStr}
          status={status}
          extraVars={extraVars}
          isPinned={isPinned}
          isEditingPredecessor={isEditingPredecessor}
          setIsEditingPredecessor={setIsEditingPredecessor}
          setActiveTooltip={setActiveTooltip}
          tooltipRef={tooltipRef}
          handlePointerDown={handlePointerDown}
          handlePointerMove={handlePointerMove}
          handlePointerUp={handlePointerUp}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
        />
      )}
    </>
  );
});
