import React from 'react';
import { BarChartHorizontal } from 'lucide-react';
import { Project } from '../../../types';
import { cn, parseDateTime } from '../../../lib/utils';

interface TooltipMetaRowProps {
  v: any;
  p?: Project;
  canWrite?: boolean;
  floorValue?: any;
  shopTypeValue?: string;
  dataSize?: number;
  commentsCount: number;
  computedTakStart?: string;
  computedTakCompl?: string;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  onOpenMiniGantt?: (project: Project) => void;
}

export const TooltipMetaRow: React.FC<TooltipMetaRowProps> = React.memo(({
  v,
  p,
  canWrite = false,
  floorValue,
  shopTypeValue,
  dataSize = 0,
  commentsCount,
  computedTakStart,
  computedTakCompl,
  onEditProject,
  onOpenMiniGantt,
}) => {
  const effectiveSize = p?.sizeM2 ?? (p as any)?.size ?? (p as any)?.area ?? dataSize ?? 0;
  const effectiveShopType = shopTypeValue || p?.shopType || (p as any)?.shop_type || '';

  if (!v.floor && !v.area && !v.shopType && !v.startDate && !v.endDate && commentsCount === 0 && !onOpenMiniGantt && effectiveSize === 0 && !effectiveShopType) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-1.5 px-0.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex-nowrap min-w-0">
      {/* Left Side: Floor, Mini Gantt, Shop Type & Area/Size */}
      <div className="flex items-center gap-1 shrink min-w-0 flex-nowrap">
        {/* Floor Badge */}
        {v.floor && floorValue && (
          <div className="bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/80 flex items-center gap-0.5 shrink-0">
            <span className="text-[8px] text-slate-400 font-medium uppercase">Floor:</span>
            <span className="font-bold text-[10px] text-slate-700 dark:text-slate-200">{floorValue}</span>
          </div>
        )}

        {/* Modular Mini Gantt Button */}
        {p && onOpenMiniGantt && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMiniGantt(p);
            }}
            className="flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-all active:scale-95 touch-manipulation cursor-pointer shrink-0 shadow-2xs"
            title="Open Mini Gantt Timeline"
          >
            <BarChartHorizontal className="w-3 h-3" />
            <span>Gantt</span>
          </button>
        )}

        {/* Shop Type Badge - Displayed right before Area / Size (m²) */}
        {(v.shopType !== false) && effectiveShopType && (
          <div 
            className="bg-purple-50 dark:bg-purple-950/70 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-800/80 flex items-center gap-0.5 shrink-0"
            title={`Shop Type: ${effectiveShopType}`}
          >
            <span className="text-[7.5px] text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-tight">Type:</span>
            <span className="font-bold text-[9.5px] text-purple-700 dark:text-purple-300 font-mono truncate max-w-[105px]">
              {effectiveShopType}
            </span>
          </div>
        )}

        {/* Area / Size (m²) Badge - Displayed right next to mini gantt / shop type */}
        {(v.area !== false) && effectiveSize > 0 && (
          <div 
            className="bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/80 flex items-center gap-0.5 shrink-0"
            title={`Size (m²): ${Number(effectiveSize).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²`}
          >
            <span className="text-[7.5px] text-slate-400 font-semibold uppercase tracking-tight">Size:</span>
            <span className="font-bold text-[9.5px] text-slate-700 dark:text-slate-200 font-mono">
              {Number(effectiveSize).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²
            </span>
          </div>
        )}
      </div>

      {/* Right Side: Start Date (Blue) & Finish Date (Pink) */}
      {(v.startDate || v.endDate) && (computedTakStart || computedTakCompl) && (
        <div className="flex gap-1.5 text-[10px] font-bold leading-tight shrink-0 ml-auto items-center">
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
});
