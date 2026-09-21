import React, { useMemo, useCallback, useLayoutEffect, useEffect } from 'react';
import { 
  MessageSquare, 
  X
} from 'lucide-react';
import { QuickNavButton } from '../QuickNavButton';
import { cn, parseDateTime } from '../../lib/utils';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';

interface LayoutUnitTooltipProps {
  hoverInfo: {
    visible: boolean;
    data: any;
    unitName: string;
    clientX?: number;
    clientY?: number;
  };
  tooltipRef: React.RefObject<HTMLDivElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export const LayoutUnitTooltip: React.FC<LayoutUnitTooltipProps> = ({
  hoverInfo,
  tooltipRef,
  containerRef,
  onClose,
  onEditProject,
  canWrite = false,
  storeFilter = 'HCM'
}) => {
  const { enrichedProjects: projects } = useEnrichedData();
  const data = hoverInfo?.data || {};
  const initialP: Project | undefined = data.matchedProject;
  const p: Project | undefined = (initialP?.id ? projects.find(item => item.id === initialP.id) : undefined) || initialP;

  // Auto Anti-Collision & Obstruction-Proof Positioning Engine
  const positionTooltip = useCallback(() => {
    if (!tooltipRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = rect.width > 0 ? rect.width : 340;
    const tooltipHeight = rect.height > 0 ? rect.height : 140;

    const viewportWidth = window.innerWidth;
    const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
    const viewportHeight = visualVp ? visualVp.height : window.innerHeight;
    const isMobile = viewportWidth < 640;

    const pad = 12;
    // Bottom clearance: 80px on mobile to leave room for Menu button & Home indicator, 64px on desktop
    const bottomMargin = isMobile ? 80 : 64;

    // Calculate safe top clearance to ensure the tooltip is NEVER covered by the App Header or Layout toolbars
    let safeTop = isMobile ? 152 : 115;

    // 1. Check if the map container element exists
    const containerEl = containerRef?.current || (typeof document !== 'undefined' ? (document.getElementById('live-layout-canvas-container') || document.querySelector('.cursor-grab')) : null);
    if (containerEl) {
      const cRect = containerEl.getBoundingClientRect();
      if (cRect.top > 0) {
        // Place below the container top and clear floating top controls (HCM • L1 & Zoom)
        safeTop = Math.max(safeTop, cRect.top + (isMobile ? 48 : 42));
      }
    }

    // 2. Also inspect the App Header (.sticky or header)
    if (typeof document !== 'undefined') {
      const headerEl = document.querySelector('.sticky.top-0') || document.querySelector('header');
      if (headerEl) {
        const hRect = headerEl.getBoundingClientRect();
        if (hRect.bottom > 0) {
          safeTop = Math.max(safeTop, hRect.bottom + (isMobile ? 64 : 50));
        }
      }
    }

    const clientX = hoverInfo.clientX !== undefined ? hoverInfo.clientX : viewportWidth / 2;
    const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;

    if (isMobile) {
      // Mobile: Horizontal Auto-Centering with 12px margin
      const left = pad;
      const right = pad;
      
      // Vertical placement:
      // If tapped in lower half of screen (clientY > viewportHeight * 0.52),
      // place tooltip in UPPER half below header (safeTop) so tapped unit remains visible and tooltip never gets covered by Menu!
      let top: number;
      if (clientY > viewportHeight * 0.52) {
        top = safeTop;
      } else {
        top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
      }

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = `${right}px`;
      el.style.top = `${top}px`;
      el.style.width = `calc(100vw - ${pad * 2}px)`;
      el.style.maxWidth = '420px';
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
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
      top = Math.max(safeTop, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.top = `${top}px`;
      el.style.width = '350px';
      el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0';
      el.style.transform = 'none';
    }
  }, [hoverInfo.clientX, hoverInfo.clientY, tooltipRef, containerRef]);

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
  const status = p?.computedStatus || data.appProjectStatus || data.status || 'On process';
  
  let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  const lowerStatus = String(status).toLowerCase();
  if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
    statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-800';
  } else if (lowerStatus.includes('handover')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('on process') || lowerStatus.includes('process')) {
    statusColorClass = 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60';
  } else if (lowerStatus.includes('delay') || lowerStatus.includes('canceled') || lowerStatus.includes('late')) {
    statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60';
  } else if (lowerStatus.includes('ready')) {
    statusColorClass = 'bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  }

  // MD Status from project or layout data
  const rawMdStatus = p?.mdStatus || data.mdStatus || (p as any)?.md_status || (data as any)?.md_status || '';
  const mdStatus = (rawMdStatus && rawMdStatus !== '-' && String(rawMdStatus).trim().toLowerCase() !== 'null') 
    ? String(rawMdStatus).trim() 
    : '';

  let mdStatusColorClass = 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/60';
  const lowerMdStatus = mdStatus.toLowerCase();
  if (lowerMdStatus.includes('signed') || lowerMdStatus.includes('agreement')) {
    mdStatusColorClass = 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/60';
  } else if (lowerMdStatus.includes('reject')) {
    mdStatusColorClass = 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800/60';
  }

  // Task lines & Details (Strictly matching General Tab logic)
  const taskLines: string[] = (data.taskLines && Array.isArray(data.taskLines) && data.taskLines.length > 0)
    ? data.taskLines
    : (() => {
        if (!p) return [];
        const now = new Date();
        let activeTaskNames: string[] = [];
        if (p.taskSummaries && p.taskSummaries.length > 0) {
          const activeTasks = p.taskSummaries.filter(t => {
            if (!t.start || !t.finish) return false;
            const start = new Date(t.start);
            const finish = new Date(t.finish);
            return now >= start && now <= finish;
          });
          activeTaskNames = activeTasks.map(t => t.name);
        }
        const lines: string[] = [];
        activeTaskNames.forEach(name => {
          lines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
        });
        return lines;
      })();

  const detailText = p?.detail || data.detail || '';

  // Dates
  const computedTakStart = p?.computedTakStart || p?.start || data.startDate || '';
  const computedTakCompl = p?.computedTakCompl || p?.handover || data.handoverDate || '';

  // Comments count
  const commentsCount = p?.comments?.length || 0;

  // Store display
  const storeDisplay = p?.store || data.store || storeFilter || 'HCM';
  const unitCode = p?.code || hoverInfo.unitName;
  const projectName = p?.name || data.projectName || data.brandName || '';
  const floorValue = data.floor || (p as any)?.floor;

  const targetProject: Project = p || ({
    id: `unit_${unitCode}`,
    code: unitCode,
    name: projectName || unitCode,
    store: storeDisplay,
    location: floorValue ? String(floorValue) : undefined,
  } as Project);

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed z-[120] pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-3 sm:p-3.5 flex flex-col gap-2.5 transition-all duration-150",
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
      <div className="flex items-start justify-between gap-2 pr-16">
        <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm leading-snug flex items-start gap-1.5 flex-1 min-w-0">
          {/* Store - Code - Name (Clickable to open Project Modal) */}
          <span 
            onClick={() => p && onEditProject?.(p, !canWrite, 'details')}
            className={cn(
              "break-words leading-tight",
              p ? "cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors" : ""
            )}
            title={p ? "Nhấp để xem chi tiết dự án" : undefined}
          >
            <span className={storeDisplay.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : storeDisplay.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>
              {storeDisplay}
            </span>
            {' - '}
            <span className="font-bold font-mono">{unitCode}</span>
            {projectName ? ` - ${projectName}` : ''}
          </span>
        </div>

        {/* Status Badges: MD Status + Project Status */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {/* MD Status Badge in Header */}
          {mdStatus && (
            <div 
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${mdStatusColorClass} flex items-center gap-1`}
              title={`MD Status: ${mdStatus}`}
            >
              <span className="text-[8px] font-semibold uppercase opacity-75">MD:</span>
              <span className="capitalize">{mdStatus}</span>
            </div>
          )}

          {/* Project Status Badge (On process in orange matching General Tab) */}
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${statusColorClass}`}>
            {status}
          </div>
        </div>

        {/* Actions: Quick Navigator + Close Button */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
          <QuickNavButton 
            project={targetProject}
            title={`Quick Navigator (${unitCode})`}
            className="p-1 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#333336] dark:hover:text-[#8ab4f8] border border-slate-200 dark:border-[#444446]"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Đóng tooltip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Middle Section: Progress Bars (Full Width without pencil button) */}
      <div className="flex flex-col gap-1.5 px-0.5">
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

      {/* 3. Unified Information Row: Floor, Diện tích, Comment Symbol & Dates */}
      <div className="flex items-center justify-between gap-2 px-0.5 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap sm:flex-nowrap">
        {/* Left Side: Floor, Diện tích & Comment Symbol */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Floor Badge */}
          {floorValue && (
            <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
              <span className="text-[9px] text-slate-400 font-medium uppercase">Floor:</span>
              <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{floorValue}</span>
            </div>
          )}

          {/* Area (if available) */}
          {data.size > 0 && (
            <div className="bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/80 flex items-center gap-1 shrink-0">
              <span className="text-[9px] text-slate-400 font-medium uppercase">DT:</span>
              <span className="font-bold text-xs text-slate-700 dark:text-slate-200">{Number(data.size).toLocaleString('en-US')} m²</span>
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
              title="Mở trao đổi / Bình luận dự án"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {commentsCount > 0 && <span>{commentsCount}</span>}
            </button>
          )}

          {/* Quick Navigator Button */}
          <QuickNavButton 
            project={targetProject} 
            title={`Quick Navigator (${unitCode})`}
            className="p-1 rounded border border-slate-200 dark:border-[#444446] bg-slate-50 dark:bg-slate-800/50 text-blue-600 dark:text-[#8ab4f8] hover:bg-blue-50 dark:hover:bg-[#333336]"
          />
        </div>

        {/* Right Side: Start Date (Blue) & Finish Date (Pink) */}
        {(computedTakStart || computedTakCompl) && (
          <div className="flex gap-2 sm:gap-2.5 text-[11px] font-bold leading-tight shrink-0 ml-auto items-center">
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
        )}
      </div>

      {/* 4. Details Section (Strictly matching General Tab logic and styling) */}
      {(taskLines.length > 0 || detailText) && (
        <div className="bg-slate-50 dark:bg-[#1e1e20]/60 rounded-lg p-2.5 border border-slate-200/80 dark:border-[#444446] text-xs shadow-sm flex flex-col gap-1.5">
          <div className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider">
            Detail
          </div>
          {taskLines.length > 0 ? (
            <div className="flex flex-col gap-1">
              {taskLines.map((line, idx) => (
                <div 
                  key={idx} 
                  className={`font-medium text-xs leading-relaxed ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}
                >
                  {line}
                </div>
              ))}
              {detailText && (
                <div className="text-slate-600 dark:text-[#a3a3a3] text-[11px] font-normal whitespace-pre-wrap leading-relaxed pt-1.5 mt-0.5 border-t border-slate-200/60 dark:border-slate-700/60">
                  {detailText}
                </div>
              )}
            </div>
          ) : (
            <div className="text-blue-600 dark:text-[#8ab4f8] font-medium text-xs whitespace-pre-wrap leading-relaxed">
              {detailText}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
