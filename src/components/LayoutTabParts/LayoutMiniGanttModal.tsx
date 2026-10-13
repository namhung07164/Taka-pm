import React, { FC, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { BarChartHorizontal, Calendar, Layers } from 'lucide-react';
import { Project } from '../../types';
import { useOverlayStack } from '../../lib/zIndexManager';
import { formatMonthDay, useMiniGanttData } from './useMiniGanttData';
import { MiniGanttHeader } from './MiniGanttHeader';
import { MiniGanttRowItem } from './MiniGanttRowItem';

interface LayoutMiniGanttModalProps {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
}

export const LayoutMiniGanttModal: React.FC<LayoutMiniGanttModalProps> = ({
  project,
  isOpen,
  onClose,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  // Handle ESC key to close (AGENTS.md Rule 6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const {
    orderedGanttRows,
    timelineBounds,
    todayData,
    stats,
    handleOpenFullGantt,
  } = useMiniGanttData(project, onClose);

  const zInfo = useOverlayStack({
    layer: 'MINI_GANTT',
    isOpen,
    onClose,
    closeOnTabChange: true,
  });

  if (!isOpen || !project) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 ${zInfo.zClass} pointer-events-none flex items-center justify-center p-3 sm:p-5 overscroll-contain`}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {/* Semi-transparent backdrop for focus */}
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs pointer-events-auto transition-opacity cursor-pointer overscroll-contain"
      />

      {/* Draggable Window (AGENTS.md Rule 11) */}
      <Draggable
        handle=".modal-handle"
        cancel="button, input, select, textarea, .no-drag"
        nodeRef={nodeRef}
        bounds="parent"
      >
        <div
          ref={nodeRef}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onWheel={(e) => e.stopPropagation()}
          className="relative pointer-events-auto bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[85vh] overflow-hidden select-none animate-in fade-in zoom-in-95 duration-150 overscroll-contain"
          style={{ cursor: 'default' }}
        >
          {/* 1. Header (Handle) */}
          <MiniGanttHeader project={project} onClose={onClose} />

          {/* 2. Project Stats & Timeline Range Sub-header */}
          <div className="px-4 py-2.5 bg-slate-50/50 dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] flex items-center justify-between gap-3 flex-wrap text-xs shrink-0">
            {/* Left: Overall Dates */}
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-[11px] font-medium">Timeline:</span>
                <span className="font-bold font-mono text-[11px] text-blue-600 dark:text-[#8ab4f8]">
                  {formatMonthDay(timelineBounds.startDate)}
                </span>
                <span className="text-slate-400">→</span>
                <span className="font-bold font-mono text-[11px] text-pink-600 dark:text-pink-400">
                  {formatMonthDay(timelineBounds.finishDate)}
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  ({timelineBounds.totalDays}d)
                </span>
              </div>
            </div>

            {/* Right: Task Status Badges matching GanttTab */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {todayData.isInTimeline && (
                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-950/60 dark:text-rose-400 border border-red-200 dark:border-red-800/80">
                  Today: {todayData.formattedToday}
                </span>
              )}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                {stats.total} Tasks
              </span>
              {stats.completed > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400 border border-green-200 dark:border-green-800/80">
                  {stats.completed} Completed
                </span>
              )}
              {stats.inProgress > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-[#8ab4f8] border border-blue-200 dark:border-blue-800/80">
                  {stats.inProgress} On process
                </span>
              )}
              {stats.upcoming > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {stats.upcoming} Upcoming
                </span>
              )}
              {stats.milestone > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-400 border border-orange-200 dark:border-orange-800/80">
                  {stats.milestone} Milestone
                </span>
              )}
            </div>
          </div>

          {/* 3. Gantt Chart Area */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[55vh] flex flex-col bg-white dark:bg-[#1a1a1c]">
            {orderedGanttRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <Layers className="w-10 h-10 mb-2 opacity-30 text-slate-400" />
                <div className="font-semibold text-sm text-slate-600 dark:text-slate-300">
                  No tasks registered for this project yet
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-sm">
                  Tasks will appear here once defined in Task Detail or Gantt chart.
                </div>
              </div>
            ) : (
              <div className="min-w-[550px] flex flex-col">
                {/* Timeline Grid Header */}
                <div className="sticky top-0 z-10 flex items-center border-b border-slate-200 dark:border-[#333336] bg-slate-100/90 dark:bg-[#202022] backdrop-blur-xs text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {/* Left Column: Task Name & Dates */}
                  <div className="w-[240px] sm:w-[270px] px-3 py-1.5 border-r border-slate-200 dark:border-[#333336] shrink-0 uppercase tracking-wider flex items-center justify-between">
                    <span>Task</span>
                    <span className="font-mono text-[9px] text-slate-400 font-medium">
                      Dates (Start - End)
                    </span>
                  </div>
                  {/* Right Column: Time Scale Markers */}
                  <div className="flex-1 px-3 py-1.5 relative flex justify-between uppercase tracking-wider overflow-visible">
                    <span className="font-mono font-bold text-blue-600 dark:text-[#8ab4f8]">
                      {formatMonthDay(timelineBounds.startDate)}
                    </span>
                    <span className="hidden sm:inline">Timeline Progress</span>
                    <span className="font-mono font-bold text-pink-600 dark:text-pink-400">
                      {formatMonthDay(timelineBounds.finishDate)}
                    </span>

                    {/* Today Pin Header Marker */}
                    {todayData.isInTimeline && (
                      <div
                        className="absolute top-0 bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20"
                        style={{
                          left: `calc(12px + (100% - 24px) * ${todayData.percent / 100})`,
                        }}
                        title={`Today: ${todayData.formattedToday}`}
                      >
                        <div className="bg-red-500 dark:bg-rose-500 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded shadow-xs tracking-wider flex items-center gap-0.5 whitespace-nowrap">
                          <span>TODAY</span>
                          <span className="opacity-90 font-mono">
                            ({todayData.formattedToday})
                          </span>
                        </div>
                        <div className="w-0.5 flex-1 bg-red-500 dark:bg-rose-500 shadow-[0_0_6px_rgba(239,68,68,0.5)]" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Task Rows */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {orderedGanttRows.map(({ task: t, isChild }, idx) => (
                    <MiniGanttRowItem
                      key={t.id || idx}
                      task={t}
                      isChild={isChild}
                      timelineBounds={timelineBounds}
                      todayData={todayData}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. Footer Summary */}
          <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#202022] border-t border-slate-200 dark:border-[#38383a] flex items-center justify-between text-xs shrink-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Drag header to move &bull; Esc to close
            </span>
            <button
              type="button"
              onClick={handleOpenFullGantt}
              className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition-all active:scale-95 touch-manipulation flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <BarChartHorizontal className="w-3.5 h-3.5" />
              <span>Full Gantt View</span>
            </button>
          </div>
        </div>
      </Draggable>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default LayoutMiniGanttModal;
