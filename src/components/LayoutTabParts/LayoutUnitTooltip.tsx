import React, { useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { 
  Edit2, 
  MessageSquare, 
  Maximize2, 
  X
} from 'lucide-react';
import { cn, parseDateTime } from '../../lib/utils';
import { Project } from '../../types';

interface LayoutUnitTooltipProps {
  hoverInfo: {
    visible: boolean;
    data: any;
    unitName: string;
    clientX?: number;
    clientY?: number;
  };
  tooltipRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export const LayoutUnitTooltip: React.FC<LayoutUnitTooltipProps> = ({
  hoverInfo,
  tooltipRef,
  onClose,
  onEditProject,
  canWrite = false,
  storeFilter = 'HCM'
}) => {
  const data = hoverInfo?.data || {};
  const p: Project | undefined = data.matchedProject;

  // Auto Anti-Collision & Obstruction-Proof Positioning Engine
  const positionTooltip = useCallback(() => {
    if (!tooltipRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = rect.width > 0 ? rect.width : 340;
    const tooltipHeight = rect.height > 0 ? rect.height : 220;

    const viewportWidth = window.innerWidth;
    const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
    const viewportHeight = visualVp ? visualVp.height : window.innerHeight;
    const isMobile = viewportWidth < 640;

    const pad = 12;
    // Bottom clearance: 84px on mobile to leave room for Menu button & Home indicator, 72px on desktop
    const bottomMargin = isMobile ? 84 : 72;
    const topMargin = isMobile ? 64 : 16;

    const clientX = hoverInfo.clientX !== undefined ? hoverInfo.clientX : viewportWidth / 2;
    const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;

    if (isMobile) {
      // Mobile: Horizontal Auto-Centering with 12px margin
      const left = pad;
      const right = pad;
      
      // Vertical placement:
      // If tapped in lower half of screen (clientY > viewportHeight * 0.52),
      // place tooltip in UPPER half so tapped unit remains visible and tooltip never gets covered by Menu!
      let top: number;
      if (clientY > viewportHeight * 0.52) {
        top = topMargin;
      } else {
        top = Math.max(topMargin, viewportHeight - tooltipHeight - bottomMargin);
      }

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = `${right}px`;
      el.style.top = `${top}px`;
      el.style.width = `calc(100vw - ${pad * 2}px)`;
      el.style.maxWidth = '420px';
      el.style.maxHeight = `calc(${viewportHeight - topMargin - bottomMargin}px)`;
      el.style.margin = '0 auto';
      el.style.transform = 'none';
    } else {
      // Desktop / Tablet: Smart 4-Way Collision Clamping
      let left = clientX + 16;
      if (left + tooltipWidth > viewportWidth - pad) {
        left = clientX - tooltipWidth - 16;
      }
      left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

      let top = clientY + 16;
      if (top + tooltipHeight > viewportHeight - bottomMargin) {
        top = clientY - tooltipHeight - 16;
      }
      top = Math.max(topMargin, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.top = `${top}px`;
      el.style.width = '350px';
      el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
      el.style.maxHeight = `calc(${viewportHeight - topMargin - bottomMargin}px)`;
      el.style.margin = '0';
      el.style.transform = 'none';
    }
  }, [hoverInfo.clientX, hoverInfo.clientY, tooltipRef]);

  useLayoutEffect(() => {
    positionTooltip();
  }, [positionTooltip]);

  // Continuously listen to size changes of the tooltip, window resize, and visualViewport changes
  useEffect(() => {
    if (!tooltipRef.current) return;
    const el = tooltipRef.current;
    const ro = new ResizeObserver(() => {
      positionTooltip();
    });
    ro.observe(el);

    const onResize = () => positionTooltip();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, [positionTooltip, tooltipRef]);

  // Progress metrics
  const planProgressPercent = p?.computedPlanProgress ?? data.planProgressPercent ?? 0;
  const actProgressPercent = p?.computedActProgress ?? data.actProgressPercent ?? 0;

  // Status computation
  const status = p?.computedStatus || data.appProjectStatus || data.status || data.mdStatus || 'On process';
  
  let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  const lowerStatus = String(status).toLowerCase();
  if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
    statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-800';
  } else if (lowerStatus.includes('handover')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('on process') || lowerStatus.includes('process')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('delay') || lowerStatus.includes('canceled') || lowerStatus.includes('late')) {
    statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60';
  } else if (lowerStatus.includes('ready')) {
    statusColorClass = 'bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  }

  // Dates
  const computedTakStart = p?.computedTakStart || p?.start || data.startDate || '';
  const computedTakCompl = p?.computedTakCompl || p?.handover || data.handoverDate || '';

  // Comments count
  const commentsCount = p?.comments?.length || 0;

  // Store display
  const storeDisplay = p?.store || data.store || storeFilter || 'HCM';
  const unitCode = p?.code || hoverInfo.unitName;
  const projectName = p?.name || data.projectName || data.brandName || '';

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed z-[70] pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-3.5 sm:p-4 flex flex-col gap-3 transition-all duration-150",
        "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-100",
        "overflow-y-auto custom-scrollbar"
      )}
      style={{ 
        position: 'fixed',
        transformOrigin: 'top left'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Header Row */}
      <div className="flex items-start justify-between gap-2 pr-8">
        <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm sm:text-base leading-snug flex items-start gap-1.5 flex-1 min-w-0">
          {/* Store - Code - Name */}
          <span className="break-words leading-tight">
            <span className={storeDisplay.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : storeDisplay.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>
              {storeDisplay}
            </span>
            {' - '}
            <span className="font-bold font-mono">{unitCode}</span>
            {projectName ? ` - ${projectName}` : ''}
          </span>
        </div>

        {/* Status Badge */}
        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${statusColorClass}`}>
          {status}
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Đóng tooltip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. Middle Section: Progress Bars & Floating Edit Action Button */}
      <div className="flex items-center gap-2 px-0.5 mt-0.5">
        <div className="flex-1 flex flex-col gap-1.5">
          {/* Plan Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[65px] shrink-0">
              Plan Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right shrink-0">
              {planProgressPercent}%
            </span>
          </div>

          {/* Actual Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[65px] shrink-0">
              Act Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right shrink-0">
              {actProgressPercent}%
            </span>
          </div>
        </div>

        {/* Floating Edit Icon (Right-Side Square Button matching Task Summary) */}
        {p && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditProject?.(p, !canWrite, 'details');
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#27272a] dark:hover:bg-[#323236] border border-slate-200 dark:border-[#3f3f46] text-blue-600 dark:text-blue-400 shadow-sm transition-all active:scale-95 touch-manipulation shrink-0"
            title="Xem chi tiết & Chỉnh sửa dự án"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Vacant / Non-Project Unit Attributes (If size or floor exists) */}
      {(!p || data.size > 0 || data.floor) && (
        <div className="grid grid-cols-2 gap-2 text-xs py-1">
          {data.size > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-medium uppercase">Diện tích</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {Number(data.size).toLocaleString('en-US')} m²
              </div>
            </div>
          )}
          {data.floor && (
            <div className="bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800/80">
              <div className="text-[10px] text-slate-400 font-medium uppercase">Vị trí / Tầng</div>
              <div className="font-semibold text-slate-700 dark:text-slate-200">
                {data.floor}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Bottom Row: Party, Chat, Maximize & Start/Finish Dates */}
      <div className="flex justify-between items-center px-0.5 border-t border-slate-100 dark:border-slate-800 pt-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Party Badge (CP, etc.) */}
          {(p?.party || data.party) && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 truncate max-w-[70px] shrink-0">
              {p?.party || data.party}
            </span>
          )}

          {/* Project Chat / Comment Button */}
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
              title="Mở trao đổi / Bình luận dự án"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {commentsCount > 0 && <span>{commentsCount}</span>}
            </button>
          )}

          {/* Maximize / Open Modal */}
          {p && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditProject?.(p, !canWrite, 'details');
              }}
              className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors shrink-0"
              title="Xem đầy đủ dự án"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Start Date (Blue) & Finish Date (Pink) */}
        <div className="flex gap-2.5 sm:gap-3 text-[11px] font-bold leading-tight shrink-0">
          {computedTakStart && (
            <div className="text-blue-700 dark:text-[#8ab4f8] text-right">
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
          {computedTakCompl && (
            <div className="text-pink-700 dark:text-pink-400 text-right">
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
      </div>

      {/* 4. Quick Description / Detail note if present */}
      {data.detail && (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-lg p-2 border border-slate-200/60 dark:border-slate-700/60 text-xs">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            Ghi chú
          </div>
          <div className="text-slate-700 dark:text-slate-300 font-normal whitespace-pre-wrap leading-relaxed">
            {data.detail}
          </div>
        </div>
      )}
    </div>
  );
};
