import React from 'react';
import { MessageSquare, BarChartHorizontal } from 'lucide-react';
import { Project } from '../../../types';
import { cn, parseDateTime } from '../../../lib/utils';

interface TooltipMetaRowProps {
  v: any;
  p?: Project;
  floorValue?: any;
  dataSize?: number;
  commentsCount: number;
  computedTakStart?: string;
  computedTakCompl?: string;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  onOpenMiniGantt?: (project: Project) => void;
}

export const TooltipMetaRow: React.FC<TooltipMetaRowProps> = ({
  v,
  p,
  floorValue,
  dataSize = 0,
  commentsCount,
  computedTakStart,
  computedTakCompl,
  onEditProject,
  onOpenMiniGantt,
}) => {
  if (!v.floor && !v.area && !v.startDate && !v.endDate && commentsCount === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 px-0.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex-wrap sm:flex-nowrap">
      {/* Left Side: Floor, Area & Comment Symbol */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Floor Badge */}
        {v.floor && floorValue && (
          <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-slate-400 font-medium uppercase">Floor:</span>
            <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{floorValue}</span>
          </div>
        )}

        {/* Area (if available) */}
        {v.area && dataSize > 0 && (
          <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-slate-400 font-medium uppercase">DT:</span>
            <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{Number(dataSize).toLocaleString('en-US')} m²</span>
          </div>
        )}

        {/* Project Chat / Comment Symbol Button */}
        {p && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditProject?.(p, false, 'chat');
            }}
            className={cn(
              "flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0",
              commentsCount > 0 
                ? "bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-800/80 hover:bg-blue-100" 
                : "bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-[#444446] hover:text-blue-500"
            )}
            title="Open Project Comments"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            {commentsCount > 0 && <span>{commentsCount}</span>}
          </button>
        )}

        {/* Modular Mini Gantt Button (Next to comments button) */}
        {p && onOpenMiniGantt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMiniGantt(p);
            }}
            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0 shadow-xs"
            title="Open Mini Gantt Timeline"
          >
            <BarChartHorizontal className="w-3.5 h-3.5" />
            <span>Gantt</span>
          </button>
        )}
      </div>

      {/* Right Side: Start Date (Blue) & Finish Date (Pink) */}
      {(v.startDate || v.endDate) && (computedTakStart || computedTakCompl) && (
        <div className="flex gap-2 sm:gap-2.5 text-[11px] font-bold leading-tight shrink-0 ml-auto items-center">
          {v.startDate && computedTakStart && (
            <div className="text-blue-600 dark:text-[#8ab4f8] text-right">
              {(() => {
                const d = parseDateTime(computedTakStart);
                if (!d) return null;
                return (
                  <>
                    <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                    <div>{d.getFullYear()}</div>
                  </>
                );
              })()}
            </div>
          )}
          {v.endDate && computedTakCompl && (
            <div className="text-pink-600 dark:text-pink-400 text-right">
              {(() => {
                const d = parseDateTime(computedTakCompl);
                if (!d) return null;
                return (
                  <>
                    <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                    <div>{d.getFullYear()}</div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
