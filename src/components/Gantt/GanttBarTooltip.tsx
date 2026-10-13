import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from 'react-dom';
import { X, GripHorizontal, Pin, ExternalLink, ChevronDown, Target } from 'lucide-react';
import { Task, Project } from '../../types';
import { formatGanttDate, ensureTooltipInViewport } from './GanttUtils';
import { GanttTooltipPredecessor } from './GanttTooltipPredecessor';
import { useAppStore } from '../../store/useAppStore';

interface GanttBarTooltipProps {
  id: string;
  label: string;
  startStr?: string;
  endStr?: string;
  status: string;
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
    onNavigateToTaskDetail?: (taskId: string) => void;
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
  isPinned: boolean;
  isEditingPredecessor: boolean;
  setIsEditingPredecessor: (val: boolean) => void;
  setActiveTooltip: (id: string | null) => void;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClose?: () => void;
}

export function GanttBarTooltip({
  id,
  label,
  startStr,
  endStr,
  status,
  extraVars,
  isPinned,
  isEditingPredecessor,
  setIsEditingPredecessor,
  setActiveTooltip,
  tooltipRef,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  onMouseEnter,
  onMouseLeave,
  onClose
}: GanttBarTooltipProps) {
  const [isSubtasksOpen, setIsSubtasksOpen] = useState(true);

  const handleContainerPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [role="button"]')) {
      return;
    }
    handlePointerDown(e);
  };

  const rawTaskId = extraVars?.task?.id || (id.startsWith('task-') ? id.replace('task-', '') : id);

  // Tự động căn chỉnh vị trí Tooltip trên màn hình bất cứ khi nào kích thước tooltip thay đổi (vd: khi bật/tắt Edit Predecessor)
  useLayoutEffect(() => {
    if (!tooltipRef.current) return;
    const el = tooltipRef.current;
    ensureTooltipInViewport(el);

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        requestAnimationFrame(() => {
          ensureTooltipInViewport(el);
        });
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [tooltipRef, isEditingPredecessor]);

  return createPortal(
    <div
      ref={tooltipRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => {
        e.stopPropagation();
        if (!isPinned) setActiveTooltip(id);
      }}
      className={`fixed z-[100000] bg-slate-900/95 dark:bg-slate-900/95 text-white text-[11px] rounded-xl shadow-2xl p-2.5 w-64 sm:w-72 md:w-[340px] max-w-sm border backdrop-blur-md transition-all duration-150 flex flex-col gap-1.5 max-h-[calc(100vh-20px)] overflow-y-auto overscroll-contain ${
        isPinned ? 'ring-2 ring-blue-500 border-blue-400' : 'border-slate-700/80'
      }`}
      style={{
        left: 0,
        top: 0,
        transform: 'none',
        pointerEvents: 'auto',
        touchAction: 'none'
      }}
    >
      {/* Header with Title and Pin / Focus / Close Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2.5 mb-2.5">
        <div className="flex items-center gap-2 font-bold text-slate-100 text-xs min-w-0 flex-1">
          <GripHorizontal className="w-4 h-4 text-slate-400 cursor-grab active:cursor-grabbing shrink-0" />
          {extraVars?.taskCode && (
            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-300 font-mono text-[10px] rounded border border-blue-500/30 font-bold shrink-0">
              {extraVars.taskCode}
            </span>
          )}
          <span className="truncate text-xs font-bold text-white" title={label}>{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extraVars?.task?.id && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (extraVars?.onNavigateToTaskDetail) {
                  extraVars.onNavigateToTaskDetail(extraVars.task.id);
                }
              }}
              className="p-1.5 text-slate-400 hover:text-blue-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Open in Task Detail"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTooltip(isPinned ? null : id);
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isPinned ? 'text-blue-400 bg-blue-500/20 border border-blue-500/30' : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            title={isPinned ? 'Unpin' : 'Pin tooltip'}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              if (onClose) {
                onClose();
              } else {
                setActiveTooltip(null);
                setIsEditingPredecessor(false);
              }
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close tooltip"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Info Desktop Multi-Column Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
        {/* Start Date Card */}
        <div className="flex flex-col gap-0.5 bg-sky-950/40 border border-sky-800/50 p-2 rounded-xl">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Start Date</span>
          <span className="font-mono text-xs font-semibold text-sky-100 truncate">
            {formatGanttDate(startStr)}
          </span>
        </div>

        {/* Finish Date Card */}
        <div className="flex flex-col gap-0.5 bg-pink-950/40 border border-pink-800/50 p-2 rounded-xl">
          <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Finish Date</span>
          <span className="font-mono text-xs font-semibold text-pink-100 truncate">
            {formatGanttDate(endStr)}
          </span>
        </div>

        {/* Progress & Duration Card */}
        <div className="flex items-center justify-between gap-1 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700/60">
          <div className="flex items-center gap-1">
            <span className="text-slate-400 font-medium text-[10px] uppercase">Prog:</span>
            <span className="font-mono font-bold text-emerald-400">{extraVars?.actPrg ?? 0}%</span>
          </div>
          {extraVars?.duration !== undefined && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 font-medium text-[10px] uppercase">Dur:</span>
              <span className="font-mono font-bold text-amber-300">{extraVars.duration}d</span>
            </div>
          )}
        </div>

        {/* Status & Party Card */}
        <div className="flex items-center justify-between gap-1 bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700/60 overflow-hidden">
          {extraVars?.party ? (
            <div className="flex items-center gap-1 truncate">
              <span className="text-slate-400 font-medium text-[10px] uppercase shrink-0">Party:</span>
              <span className="text-slate-100 font-bold truncate">{extraVars.party}</span>
            </div>
          ) : (
            <span className="text-slate-400 text-[10px] uppercase font-medium">Status</span>
          )}
          <span className="font-bold text-amber-400 shrink-0 text-[11px]">
            {extraVars?.actStatus || status}
          </span>
        </div>
      </div>

      {/* Predecessors Section & Editor */}
      {extraVars?.task && extraVars?.tasks && (
        <div className="mt-2.5 pt-2 border-t border-slate-700/60 pointer-events-auto">
          <GanttTooltipPredecessor
            task={extraVars.task}
            tasks={extraVars.tasks}
            projects={extraVars.projects || []}
            canWrite={Boolean(extraVars.canWrite ?? true)}
            isEditing={isEditingPredecessor}
            setIsEditing={(val) => {
              if (val) setActiveTooltip(id);
              setIsEditingPredecessor(val);
            }}
          />
        </div>
      )}

      {/* Active On-process Child Tasks in Group/Parent Task */}
      {extraVars?.hasChildren && (
        <div className="mt-2.5 pt-2 border-t border-slate-700/60 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isPinned) setActiveTooltip(id);
              setIsSubtasksOpen((prev) => !prev);
            }}
            className="w-full flex items-center justify-between p-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-semibold text-[11px] cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
              <span>On Process Subtasks ({extraVars.onProcessChildTasks?.length || 0})</span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isSubtasksOpen ? 'rotate-180' : ''}`} />
          </button>

          {isSubtasksOpen && (
            <div className="mt-1.5 max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {extraVars.onProcessChildTasks && extraVars.onProcessChildTasks.length > 0 ? (
                extraVars.onProcessChildTasks.map((ct) => (
                  <div
                    key={ct.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (extraVars?.onNavigateToTaskDetail) {
                        setActiveTooltip(null);
                        extraVars.onNavigateToTaskDetail(ct.id);
                      }
                    }}
                    className="p-1.5 rounded-lg bg-slate-800/90 border border-slate-700 hover:border-blue-400/80 hover:bg-slate-700/80 transition-all cursor-pointer group/ct"
                    title={`Click to view ${ct.name} in Task Detail`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[11px] font-semibold text-slate-200">
                      <div className="flex items-center gap-1 min-w-0">
                        {ct.taskCode && (
                          <span className="px-1 py-0.2 bg-purple-500/25 text-purple-300 border border-purple-500/40 rounded text-[9px] font-mono shrink-0 font-bold">
                            {ct.taskCode}
                          </span>
                        )}
                        <span className="truncate group-hover/ct:text-blue-300">{ct.name}</span>
                      </div>
                      <span className="font-mono text-emerald-400 text-[10px] shrink-0 font-bold">{ct.actPrg || 0}%</span>
                    </div>

                    {(ct.start || ct.finish) && (
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 font-mono">
                        <span>{formatGanttDate(ct.start)} ➔ {formatGanttDate(ct.finish)}</span>
                        {ct.duration && <span>{ct.duration}d</span>}
                      </div>
                    )}

                    <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden mt-1">
                      <div className="bg-emerald-500 h-1 rounded-full transition-all" style={{ width: `${ct.actPrg || 0}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[10px] text-slate-400 italic text-center py-1.5 bg-slate-800/40 rounded border border-slate-700/40">
                  No active on-process subtasks ({extraVars.childCount || 0} subtasks completed or upcoming)
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
