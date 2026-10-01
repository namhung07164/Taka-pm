import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { cn, parseDateTime } from '../../lib/utils';
import { positionTooltip, formatGanttDate } from './GanttUtils';
import { GanttTooltipPredecessor } from './GanttTooltipPredecessor';
import { Task, Project } from '../../types';
import { X, GripHorizontal, Pin } from 'lucide-react';

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
  const isMilestone = dStart && dEnd && Math.abs(dStart.getTime() - dEnd.getTime()) < 3600000;
  
  const [isHovered, setIsHovered] = useState(false);
  const [isEditingPredecessor, setIsEditingPredecessor] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const isDraggingTooltipRef = useRef(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const tooltipStartPos = useRef({ x: 0, y: 0 });

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
    } catch (_) {}
  };

  const handleMouseMove = (ev: React.MouseEvent) => {
    if (isPinned) return; // Keep tooltip frozen in place when pinned
    lastMousePos.current = { x: ev.clientX, y: ev.clientY };
    if (tooltipRef.current) {
      positionTooltip(ev, tooltipRef.current);
    }
  };

  const handleMouseEnter = (ev: React.MouseEvent) => {
    if (!isPinned) {
      lastMousePos.current = { x: ev.clientX, y: ev.clientY };
    }
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      setIsHovered(false);
    }
  };

  const handleBarClick = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    if (isEditMode) return;
    if (onBarClick) {
      onBarClick(ev);
      return;
    }
    if (activeTooltip === id) {
      setActiveTooltip(null);
      setIsHovered(false);
    } else {
      lastMousePos.current = { x: ev.clientX, y: ev.clientY };
      if (tooltipRef.current) {
        positionTooltip(ev, tooltipRef.current);
      }
      setActiveTooltip(id);
      setIsHovered(true);
    }
  };

  React.useEffect(() => {
    if (!isPinned && isHovered && tooltipRef.current) {
      positionTooltip({ clientX: lastMousePos.current.x, clientY: lastMousePos.current.y } as any, tooltipRef.current);
    }
  }, [isHovered, isPinned]);

  useEffect(() => {
    if (activeTooltip !== id) return;
    const handleGlobalClick = (e: MouseEvent) => {
      if (tooltipRef.current && tooltipRef.current.contains(e.target as Node)) {
        return;
      }
      if (!isEditingPredecessor) {
        setActiveTooltip(null);
        setIsHovered(false);
      }
    };
    const timer = setTimeout(() => {
      window.addEventListener('click', handleGlobalClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('click', handleGlobalClick);
    };
  }, [activeTooltip, id, isEditingPredecessor, setActiveTooltip]);

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
        onMouseLeave={handleMouseLeave}
        onClick={handleBarClick}
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
        
        {(isHovered || activeTooltip === id || isEditingPredecessor) && createPortal(
          <div
            ref={tooltipRef}
            style={{ top: -9999, left: -9999 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
              if (!isPinned) setIsHovered(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed gantt-tooltip-global z-[99999] flex w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600 flex-col gap-1 pointer-events-auto select-text"
          >
            {/* Header with Drag Handle and Close button */}
            <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-slate-600/80 gap-1.5 select-none">
              <div 
                className="flex items-center gap-1.5 text-[10px] text-slate-300 font-bold modal-handle cursor-grab active:cursor-grabbing hover:text-white transition-colors flex-1 min-w-0"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                title="Drag to reposition tooltip"
              >
                <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate font-bold text-white text-xs">{label}</span>
                {extraVars?.taskCode && (
                  <span className="text-slate-300 font-mono text-[9px] shrink-0">
                    [{extraVars.taskCode}]
                  </span>
                )}
                {isPinned && (
                  <span className="flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                    <Pin className="w-2.5 h-2.5 rotate-45" />
                    PINNED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-orange-500 text-white font-bold uppercase tracking-wider">
                  Milestone
                </span>
                {isPinned && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTooltip(null);
                      setIsHovered(false);
                    }}
                    className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors cursor-pointer"
                    title="Close Tooltip (Esc / Click outside)"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
              <div className="flex justify-between gap-4">
                {extraVars?.actPrg !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Prog:</span>
                    <span className="font-medium text-emerald-400 dark:text-emerald-300">{extraVars.actPrg}%</span>
                  </div>
                )}
                {extraVars?.duration !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Dur:</span>
                    <span className="font-medium text-amber-400 dark:text-amber-300">{extraVars.duration}d</span>
                  </div>
                )}
              </div>
            )}
            {(extraVars?.party || extraVars?.task || extraVars?.predecessors) && (
              <div className="flex flex-col gap-1.5 mt-0.5">
                {extraVars?.party && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Party:</span>
                    <span>{extraVars.party}</span>
                  </div>
                )}
                {extraVars?.task ? (
                  <GanttTooltipPredecessor
                    task={extraVars.task}
                    tasks={extraVars.tasks || []}
                    projects={extraVars.projects || []}
                    canWrite={!!extraVars.canWrite && !isSimulation}
                    compact
                    onEditingChange={setIsEditingPredecessor}
                  />
                ) : extraVars?.predecessors ? (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Pred:</span>
                    <span className="max-w-[200px] break-words whitespace-normal font-mono" title={extraVars.predecessors}>
                      {extraVars.predecessors}
                    </span>
                  </div>
                ) : null}
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
              <span className="font-medium">
                <span className="text-sky-300 dark:text-sky-200">{formatGanttDate(startStr) || "N/A"}</span>
                <span className="text-slate-400 mx-1">-</span>
                <span className="text-pink-300 dark:text-pink-300">{formatGanttDate(endStr) || "N/A"}</span>
              </span>
            </div>
            {extraVars?.hasChildren && (
              <div className="mt-1.5 pt-1.5 border-t border-slate-600/80">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 mb-1">
                  <span className="flex items-center gap-1.5 text-blue-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    Tasks In Progress ({extraVars.onProcessChildTasks?.length || 0}/{extraVars.childCount || 0}):
                  </span>
                </div>
                {extraVars.onProcessChildTasks && extraVars.onProcessChildTasks.length > 0 ? (
                  <div
                    className="flex flex-col gap-1 max-h-48 md:max-h-56 overflow-y-auto pr-1 custom-scrollbar touch-pan-y overscroll-contain pointer-events-auto select-text"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                  >
                    {extraVars.onProcessChildTasks.map((ct) => (
                      <div
                        key={ct.id}
                        className="flex items-center justify-between gap-1.5 text-[10px] bg-slate-900/70 dark:bg-slate-800/90 px-2 py-1 rounded border border-slate-700/60"
                      >
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="text-emerald-400 text-[9px] shrink-0 font-mono">▶</span>
                          <span className="font-medium text-slate-100 truncate" title={ct.name}>
                            {ct.name}
                          </span>
                          {ct.taskCode && (
                            <span className="font-mono text-[9px] text-blue-300/80 shrink-0">
                              [{ct.taskCode}]
                            </span>
                          )}
                        </div>
                        {ct.actPrg !== undefined && (
                          <span className="text-emerald-400 font-mono font-bold shrink-0 text-[10px] pl-1">
                            {ct.actPrg}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400 italic">
                    No child tasks currently in progress
                  </div>
                )}
              </div>
            )}
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
      onMouseLeave={handleMouseLeave}
      onClick={handleBarClick}
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
      
      {(isHovered || activeTooltip === id || isEditingPredecessor) && createPortal(
        <div
          ref={tooltipRef}
          style={{ top: -9999, left: -9999 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => {
            if (!isPinned) setIsHovered(false);
          }}
          onClick={(e) => e.stopPropagation()}
          className="fixed gantt-tooltip-global z-[99999] flex w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600 flex-col gap-1 pointer-events-auto select-text"
        >
          {/* Header with Drag Handle and Close button */}
          <div className="flex items-center justify-between pb-1 mb-0.5 border-b border-slate-600/80 gap-1.5 select-none">
            <div 
              className="flex items-center gap-1.5 text-[10px] text-slate-300 font-bold modal-handle cursor-grab active:cursor-grabbing hover:text-white transition-colors flex-1 min-w-0"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              title="Drag to reposition tooltip"
            >
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate font-bold text-white text-xs">{label}</span>
              {extraVars?.taskCode && (
                <span className="text-slate-300 font-mono text-[9px] shrink-0">
                  [{extraVars.taskCode}]
                </span>
              )}
              {isPinned && (
                <span className="flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                  <Pin className="w-2.5 h-2.5 rotate-45" />
                  PINNED
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-slate-300 text-[10px]">({status})</span>
              {isPinned && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTooltip(null);
                    setIsHovered(false);
                  }}
                  className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors cursor-pointer"
                  title="Close Tooltip (Esc / Click outside)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
            <div className="flex items-center gap-2">
              {extraVars?.actPrg !== undefined && (
                <>
                  <span className="text-slate-400 dark:text-[#838383] w-10">
                    Prog:
                  </span>
                  <span className="w-8 font-medium text-emerald-400 dark:text-emerald-300">{extraVars.actPrg}%</span>
                </>
              )}
              {extraVars?.duration !== undefined && (
                <>
                  <span className="text-slate-400 dark:text-[#838383] w-10 ml-2">
                    Dur:
                  </span>
                  <span className="font-medium text-amber-400 dark:text-amber-300">{extraVars.duration}d</span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sky-400 dark:text-sky-300 font-semibold w-10">
              Start:
            </span>
            <span className="text-sky-300 dark:text-sky-200 font-medium">{formatGanttDate(startStr) || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-pink-400 dark:text-pink-300 font-semibold w-10">
              Finish:
            </span>
            <span className="text-pink-300 dark:text-pink-200 font-medium">{formatGanttDate(endStr) || "N/A"}</span>
          </div>
          {(extraVars?.party || extraVars?.task || extraVars?.predecessors) && (
            <div className="flex flex-col gap-2 mt-1 border-t border-slate-600 pt-1.5">
              {extraVars?.party && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 dark:text-[#838383] text-[10px] uppercase tracking-wider">
                    Party
                  </span>
                  <span className="font-medium">{extraVars.party}</span>
                </div>
              )}
              {extraVars?.task ? (
                <GanttTooltipPredecessor
                  task={extraVars.task}
                  tasks={extraVars.tasks || []}
                  projects={extraVars.projects || []}
                  canWrite={!!extraVars.canWrite && !isSimulation}
                  onEditingChange={setIsEditingPredecessor}
                />
              ) : extraVars?.predecessors ? (
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-slate-400 dark:text-[#838383] text-[10px] uppercase tracking-wider">
                    Predecessors
                  </span>
                  <span className="font-medium font-mono whitespace-normal max-w-[200px] break-words" title={extraVars.predecessors}>
                    {extraVars.predecessors}
                  </span>
                </div>
              ) : null}
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
          {extraVars?.hasChildren && (
            <div className="mt-1.5 pt-1.5 border-t border-slate-600/80">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-300 mb-1">
                <span className="flex items-center gap-1.5 text-blue-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Tasks In Progress ({extraVars.onProcessChildTasks?.length || 0}/{extraVars.childCount || 0}):
                </span>
              </div>
              {extraVars.onProcessChildTasks && extraVars.onProcessChildTasks.length > 0 ? (
                <div
                  className="flex flex-col gap-1 max-h-48 md:max-h-56 overflow-y-auto pr-1 custom-scrollbar touch-pan-y overscroll-contain pointer-events-auto select-text"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                  onWheel={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                >
                  {extraVars.onProcessChildTasks.map((ct) => (
                    <div
                      key={ct.id}
                      className="flex items-center justify-between gap-1.5 text-[10px] bg-slate-900/70 dark:bg-slate-800/90 px-2 py-1 rounded border border-slate-700/60"
                    >
                      <div className="flex items-center gap-1 min-w-0 flex-1">
                        <span className="text-emerald-400 text-[9px] shrink-0 font-mono">▶</span>
                        <span className="font-medium text-slate-100 truncate" title={ct.name}>
                          {ct.name}
                        </span>
                        {ct.taskCode && (
                          <span className="font-mono text-[9px] text-blue-300/80 shrink-0">
                            [{ct.taskCode}]
                          </span>
                        )}
                      </div>
                      {ct.actPrg !== undefined && (
                        <span className="text-emerald-400 font-mono font-bold shrink-0 text-[10px] pl-1">
                          {ct.actPrg}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[10px] text-slate-400 italic">
                  No child tasks currently in progress
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}, (prev, next) => {
  if (prev.id !== next.id) return false;
  if (prev.startStr !== next.startStr || prev.endStr !== next.endStr) return false;
  if (prev.status !== next.status || prev.label !== next.label) return false;
  if (prev.dayWidth !== next.dayWidth) return false;
  if (prev.startDate.getTime() !== next.startDate.getTime()) return false;
  if (prev.isEditMode !== next.isEditMode) return false;
  
  const prevTooltipActive = prev.activeTooltip === prev.id;
  const nextTooltipActive = next.activeTooltip === next.id;
  if (prevTooltipActive !== nextTooltipActive) return false;

  const pe = prev.extraVars;
  const ne = next.extraVars;
  if (pe === ne) return true;
  if (!pe || !ne) return false;

  return pe.actStatus === ne.actStatus &&
         pe.actStatusColor === ne.actStatusColor &&
         pe.actPrg === ne.actPrg &&
         pe.party === ne.party &&
         pe.duration === ne.duration &&
         pe.taskCode === ne.taskCode &&
         pe.predecessors === ne.predecessors &&
         pe.highlight === ne.highlight &&
         pe.isSimulation === ne.isSimulation &&
         pe.hasChildren === ne.hasChildren &&
         pe.childCount === ne.childCount &&
         pe.onProcessChildTasks === ne.onProcessChildTasks;
});
