import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn, parseDateTime } from '../../lib/utils';
import { positionTooltip, formatGanttDate } from './GanttUtils';
import { Task, Project } from '../../types';
import { GanttBarTooltip } from './GanttBarTooltip';
import { useGanttBarDateDrag } from './useGanttBarDateDrag';

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
  onUpdateTaskDates?: (taskId: string, newStart: string, newFinish: string) => Promise<void> | void;
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
  onUpdateTaskDates,
}: GanttBarProps) {
  const isSimulation = !!extraVars?.isSimulation;
  const isTask = id.startsWith('task-') || id.startsWith('sim-task-');
  const rawTaskId = id.startsWith('task-') ? id.replace('task-', '') : id;

  const dStartInitial = parseDateTime(startStr);
  const dEndInitial = parseDateTime(endStr);
  const isMilestone = Number(extraVars?.duration) === 0 ||
                      (dStartInitial && dEndInitial && Math.abs(dStartInitial.getTime() - dEndInitial.getTime()) < 3600000) ||
                      (label.toLowerCase().includes('opening') && Number(extraVars?.duration || 0) <= 1);

  const {
    isDraggingDate,
    deltaDays,
    previewStart,
    previewEnd,
    handleBarDragStart,
    handleLeftResizeStart,
    handleRightResizeStart,
  } = useGanttBarDateDrag({
    taskId: rawTaskId,
    startStr: startStr || '',
    endStr: endStr || '',
    dayWidth,
    isEditMode: isEditMode && isTask && !isMilestone,
    onUpdateTaskDates,
  });

  const activeStart = isDraggingDate ? previewStart : startStr;
  const activeEnd = isDraggingDate ? previewEnd : endStr;
  const dStart = parseDateTime(activeStart);
  const dEnd = parseDateTime(activeEnd);

  const customColor = extraVars?.task?.textColor;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isEditingPredecessor, setIsEditingPredecessor] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const moveRafRef = useRef<number | null>(null);
  const isDraggingTooltipRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const tooltipStartPos = useRef({ x: 0, y: 0 });
  const hoverTimeoutRef = useRef<number | null>(null);

  const handleBarMouseEnter = (e: React.MouseEvent) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setIsDismissed(false);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setIsHovered(true);
  };

  const handleBarMouseLeave = () => {
    hoverTimeoutRef.current = window.setTimeout(() => {
      setIsHovered(false);
      setIsDismissed(false);
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
      setIsDismissed(false);
    }, 150);
  };

  const handleCloseTooltip = React.useCallback(() => {
    setIsDismissed(true);
    setIsHovered(false);
    setActiveTooltip(null);
    setIsEditingPredecessor(false);
  }, [setActiveTooltip]);

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (moveRafRef.current !== null) {
        cancelAnimationFrame(moveRafRef.current);
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
          e.stopPropagation();
          lastMousePos.current = { x: e.clientX, y: e.clientY };
          if (onBarClick) {
            onBarClick(e);
          } else {
            setIsDismissed(false);
            const nextPinned = activeTooltip !== id;
            setActiveTooltip(nextPinned ? id : null);
            if (nextPinned && tooltipRef.current) {
              positionTooltip(tooltipRef.current, e.clientX, e.clientY);
            }
          }
        }}
        onMouseEnter={handleBarMouseEnter}
        onMouseMove={(e) => {
          if (!isPinned && !isDraggingTooltipRef.current) {
            const clientX = e.clientX;
            const clientY = e.clientY;
            lastMousePos.current = { x: clientX, y: clientY };
            if (moveRafRef.current === null) {
              moveRafRef.current = requestAnimationFrame(() => {
                if (tooltipRef.current) {
                  positionTooltip(tooltipRef.current, lastMousePos.current.x, lastMousePos.current.y);
                }
                moveRafRef.current = null;
              });
            }
          }
        }}
        onMouseLeave={handleBarMouseLeave}
        className={cn(
          "absolute top-1.5 bottom-1.5 flex items-center transition-all cursor-pointer select-none group shadow-2xs before:absolute before:-inset-y-1.5 before:-inset-x-1 before:content-['']",
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
        {/* Left Resize Handle for Start Date */}
        {isEditMode && isTask && !isMilestone && (
          <div
            onPointerDown={handleLeftResizeStart}
            className="absolute left-0 top-0 bottom-0 w-2.5 cursor-w-resize hover:bg-white/40 active:bg-white/60 z-30 rounded-l-md flex items-center justify-center transition-colors group/hleft"
            title="Drag to resize Start Date"
          >
            <div className="w-0.5 h-3 bg-white/70 rounded-full" />
          </div>
        )}

        {/* Center Move Handle for Shifting entire bar */}
        {isEditMode && isTask && !isMilestone && (
          <div
            onPointerDown={handleBarDragStart}
            className="absolute inset-x-2.5 top-0 bottom-0 cursor-move z-20"
            title="Drag bar to shift task dates"
          />
        )}

        {/* Right Resize Handle for Finish Date */}
        {isEditMode && isTask && !isMilestone && (
          <div
            onPointerDown={handleRightResizeStart}
            className="absolute right-0 top-0 bottom-0 w-2.5 cursor-e-resize hover:bg-white/40 active:bg-white/60 z-30 rounded-r-md flex items-center justify-center transition-colors group/hright"
            title="Drag to resize Finish Date"
          >
            <div className="w-0.5 h-3 bg-white/70 rounded-full" />
          </div>
        )}

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

      {/* Floating Date Drag Indicator Badge */}
      {isDraggingDate && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[99999] pointer-events-none bg-slate-900/95 text-white font-mono text-xs px-4 py-2 rounded-full shadow-2xl border border-blue-400 backdrop-blur-md flex items-center gap-2.5 animate-in fade-in">
          <span className="text-blue-300 font-bold">{label}:</span>
          <span>{formatGanttDate(previewStart)} ➔ {formatGanttDate(previewEnd)}</span>
          <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">
            {deltaDays >= 0 ? `+${deltaDays}d` : `${deltaDays}d`}
          </span>
        </div>
      )}

      {/* Floating Tooltip via Portal */}
      {!isDismissed && (isHovered || isPinned) && (
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
          onClose={handleCloseTooltip}
        />
      )}
    </>
  );
});
