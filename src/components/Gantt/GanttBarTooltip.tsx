import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, GripHorizontal, Pin, ExternalLink } from 'lucide-react';
import { Task, Project } from '../../types';
import { formatGanttDate } from './GanttUtils';
import { GanttTooltipPredecessor } from './GanttTooltipPredecessor';

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
  handlePointerUp
}: GanttBarTooltipProps) {
  return createPortal(
    <div
      ref={tooltipRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(e) => e.stopPropagation()}
      className={`fixed z-[100000] bg-slate-900/95 dark:bg-slate-800/95 text-white text-xs rounded-xl shadow-2xl p-3 max-w-sm border backdrop-blur-md transition-all duration-150 ${
        isPinned ? 'ring-2 ring-blue-500 border-blue-400' : 'border-slate-700/80'
      }`}
      style={{
        left: 0,
        top: 0,
        transform: 'none',
        pointerEvents: (isPinned || isEditingPredecessor) ? 'auto' : 'none',
        touchAction: 'none'
      }}
    >
      {/* Header with Title and Pin / Close Controls */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-700/60 pb-2 mb-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-200 text-xs min-w-0">
          <GripHorizontal className="w-4 h-4 text-slate-400 cursor-grab active:cursor-grabbing shrink-0" />
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {extraVars?.task?.id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (extraVars?.onNavigateToTaskDetail) {
                  extraVars.onNavigateToTaskDetail(extraVars.task.id);
                }
              }}
              className="p-1 text-slate-400 hover:text-blue-400 rounded hover:bg-slate-700 transition-colors cursor-pointer"
              title="Open in Task Detail"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTooltip(isPinned ? null : id)}
            className={`p-1 rounded transition-colors ${
              isPinned ? 'text-blue-400 bg-blue-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
            title={isPinned ? 'Unpin' : 'Pin tooltip'}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTooltip(null);
              setIsEditingPredecessor(false);
            }}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Info with Task Detail Color Palette */}
      <div className="space-y-2 text-xs text-slate-300">
        {/* Progress & Duration */}
        <div className="flex items-center justify-between gap-2 bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700/60">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-medium">Prog:</span>
            <span className="font-mono font-bold text-emerald-400">{extraVars?.actPrg ?? 0}%</span>
          </div>
          {extraVars?.duration !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Dur:</span>
              <span className="font-mono font-bold text-amber-300">{extraVars.duration}d</span>
            </div>
          )}
        </div>

        {/* Start Date */}
        <div className="flex flex-col gap-0.5 bg-sky-950/40 border border-sky-800/50 p-2 rounded-lg">
          <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Start</span>
          <span className="font-mono text-xs font-semibold text-sky-100">
            {formatGanttDate(startStr)}
          </span>
        </div>

        {/* Finish Date */}
        <div className="flex flex-col gap-0.5 bg-pink-950/40 border border-pink-800/50 p-2 rounded-lg">
          <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider">Finish</span>
          <span className="font-mono text-xs font-semibold text-pink-100">
            {formatGanttDate(endStr)}
          </span>
        </div>

        {/* Party */}
        {extraVars?.party && (
          <div className="flex justify-between items-center gap-2 pt-0.5">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Party:</span>
            <span className="text-slate-100 font-bold">{extraVars.party}</span>
          </div>
        )}

        {/* Status */}
        <div className="flex justify-between items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Status:</span>
          <span className="font-bold text-amber-400">{extraVars?.actStatus || status}</span>
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

      {/* Active On-process Child Tasks in Modular Project */}
      {extraVars?.onProcessChildTasks && extraVars.onProcessChildTasks.length > 0 && (
        <div className="mt-2.5 pt-2 border-t border-slate-700/60">
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">
            Active Subtasks ({extraVars.onProcessChildTasks.length})
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
            {extraVars.onProcessChildTasks.map((ct) => (
              <div
                key={ct.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (extraVars?.onNavigateToTaskDetail) {
                    setActiveTooltip(null);
                    extraVars.onNavigateToTaskDetail(ct.id);
                  }
                }}
                className="p-1.5 rounded bg-slate-800/80 border border-slate-700/50 flex flex-col gap-0.5 cursor-pointer hover:bg-slate-700/90 hover:border-blue-400/60 transition-colors group/subtask"
                title={`Click to view ${ct.name} in Task Detail`}
              >
                <div className="flex justify-between items-center gap-1 font-semibold text-[11px] text-slate-200 group-hover/subtask:text-blue-300">
                  <span className="truncate">{ct.name}</span>
                  <span className="font-mono text-emerald-400 text-[10px]">{ct.actPrg || 0}%</span>
                </div>
                <div className="w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-1 rounded-full" style={{ width: `${ct.actPrg || 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
