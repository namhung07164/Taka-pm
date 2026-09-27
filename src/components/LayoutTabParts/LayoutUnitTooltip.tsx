import React, { useMemo, useCallback, useLayoutEffect, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  X,
  AlertTriangle,
  Bell,
  GripHorizontal,
  ChevronRight
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
    unitScreenBounds?: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      centerX: number;
      centerY: number;
    };
  };
  tooltipRef: React.RefObject<HTMLDivElement>;
  containerRef?: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onEditProject?: (project: Project, isReadOnly?: boolean, tab?: 'details' | 'chat' | 'delegation') => void;
  canWrite?: boolean;
  storeFilter?: string;
}

export function getMdStatusColorClass(mdStatus: string): string {
  if (!mdStatus) return 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
  
  const s = mdStatus.trim().toLowerCase();

  // 1. Signed Agreement / Contract Signed / Fully Executed / Finalized (Emerald Green)
  if (s.includes('signed agreement') || s.includes('contract signed') || s.includes('executed') || s.includes('fully signed') || s.includes('finalized') || s.includes('agreement signed')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80';
  }

  // 2. T&C Agreed / Terms Agreed / Commercial Agreed (Amethyst Purple / Indigo)
  if (s.includes('t&c') || s.includes('tc agreed') || s.includes('terms agreed') || s.includes('commercial agreed')) {
    return 'bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-950/70 dark:text-purple-300 dark:border-purple-800/80';
  }

  // 3. LOI Signed / LOA Signed / MOU / Pre-Agreed (Teal / Cyan)
  if (s.includes('loi') || s.includes('loa') || s.includes('mou') || s.includes('pre-agreed') || s.includes('intent')) {
    return 'bg-teal-50 text-teal-700 border-teal-300 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800/80';
  }

  // 4. Verbally Agreed / Verbal / Initial Talk (Warm Amber / Gold)
  if (s.includes('verbal') || s.includes('initial agreement') || s.includes('talks agreed')) {
    return 'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800/80';
  }

  // 5. Renewal / Replacement / Relocation / Extension (Royal Blue)
  if (s.includes('renew') || s.includes('replace') || s.includes('relocat') || s.includes('exten')) {
    return 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-800/80';
  }

  // 6. Negotiating / Discussion / Proposal Sent / Offer / Under Review / Draft (Sky Blue)
  if (s.includes('negotiat') || s.includes('discuss') || s.includes('proposal') || s.includes('offer') || s.includes('review') || s.includes('draft') || s.includes('pending')) {
    return 'bg-sky-50 text-sky-700 border-sky-300 dark:bg-sky-950/70 dark:text-sky-300 dark:border-sky-800/80';
  }

  // 7. Rejected / Cancelled / Terminated / Dropped / Vacant / Refused (Rose / Red)
  if (s.includes('reject') || s.includes('cancel') || s.includes('terminat') || s.includes('drop') || s.includes('vacant') || s.includes('hold') || s.includes('fail') || s.includes('refus')) {
    return 'bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800/80';
  }

  // 8. Generic "Agreed" or "Signed" fallback (Emerald Green)
  if (s.includes('agree') || s.includes('sign') || s.includes('approved') || s.includes('confirm')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800/80';
  }

  // Default Fallback: Cool Violet / Indigo
  return 'bg-violet-50 text-violet-700 border-violet-300 dark:bg-violet-950/70 dark:text-violet-300 dark:border-violet-800/80';
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
  const vis = useAppStore(state => state.layoutTooltipVisibility);
  const data = hoverInfo?.data || {};
  const initialP: Project | undefined = data.matchedProject;
  const p: Project | undefined = (initialP?.id ? projects.find(item => item.id === initialP.id) : undefined) || initialP;

  // Draggable State Handling
  const isDraggingRef = useRef(false);
  const hasUserDraggedRef = useRef(false);
  const dragStartRef = useRef<{ startX: number; startY: number; initialLeft: number; initialTop: number }>({
    startX: 0,
    startY: 0,
    initialLeft: 0,
    initialTop: 0
  });

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('a') || (e.target as HTMLElement).closest('input')) {
      return;
    }
    const el = tooltipRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    isDraggingRef.current = true;
    hasUserDraggedRef.current = true;
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: rect.left,
      initialTop: rect.top
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const el = tooltipRef.current;
    if (!el) return;
    const dx = e.clientX - dragStartRef.current.startX;
    const dy = e.clientY - dragStartRef.current.startY;
    const newLeft = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, dragStartRef.current.initialLeft + dx));
    const newTop = Math.max(60, Math.min(window.innerHeight - el.offsetHeight - 8, dragStartRef.current.initialTop + dy));
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;
    el.style.right = 'auto';
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  // Reset user dragged flag whenever a new unit is searched/focused
  useEffect(() => {
    hasUserDraggedRef.current = false;
  }, [hoverInfo.unitName, hoverInfo.clientX, hoverInfo.clientY]);

  // Auto Anti-Collision & Obstruction-Proof Positioning Engine
  const positionTooltip = useCallback(() => {
    if (!tooltipRef.current || hasUserDraggedRef.current) return;
    const el = tooltipRef.current;
    const rect = el.getBoundingClientRect();
    const tooltipWidth = rect.width > 0 ? rect.width : 350;
    const tooltipHeight = rect.height > 0 ? rect.height : 220;

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

    const bounds = hoverInfo.unitScreenBounds;

    if (isMobile) {
      // Mobile: Horizontal Auto-Centering with 12px margin
      const left = pad;
      const right = pad;
      
      // Vertical placement: Smart non-obstruction calculation
      let top: number;
      if (bounds) {
        // If unit is in lower half of screen, place tooltip at safeTop (upper half)
        if (bounds.centerY > viewportHeight * 0.48) {
          top = safeTop;
        } else {
          // Unit is in upper half of screen, place tooltip at lower half
          top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
        }
      } else {
        const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;
        if (clientY > viewportHeight * 0.52) {
          top = safeTop;
        } else {
          top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
        }
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
      // Desktop / Tablet: Smart 4-Way Anti-Obstruction Clamping
      let left: number;
      let top: number;

      if (bounds) {
        const spaceRight = viewportWidth - bounds.right;
        const spaceLeft = bounds.left;

        if (spaceRight >= tooltipWidth + pad + 20) {
          // Place cleanly to the right of the unit
          left = bounds.right + 24;
        } else if (spaceLeft >= tooltipWidth + pad + 20) {
          // Place cleanly to the left of the unit
          left = bounds.left - tooltipWidth - 24;
        } else {
          left = Math.max(pad, viewportWidth - tooltipWidth - pad);
        }
        top = Math.max(safeTop, Math.min(bounds.top, viewportHeight - tooltipHeight - bottomMargin));
      } else {
        const clientX = hoverInfo.clientX !== undefined ? hoverInfo.clientX : viewportWidth / 2;
        const clientY = hoverInfo.clientY !== undefined ? hoverInfo.clientY : viewportHeight / 2;

        left = clientX + 16;
        if (left + tooltipWidth > viewportWidth - pad) {
          left = clientX - tooltipWidth - 16;
        }
        left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

        top = clientY + 16;
        if (top + tooltipHeight > viewportHeight - bottomMargin) {
          top = clientY - tooltipHeight - 16;
        }
        top = Math.max(safeTop, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));
      }

      el.style.position = 'fixed';
      el.style.left = `${left}px`;
      el.style.right = 'auto';
      el.style.top = `${top}px`;
      el.style.width = '370px';
      el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
      el.style.maxHeight = `calc(${Math.max(160, viewportHeight - safeTop - bottomMargin)}px)`;
      el.style.margin = '0';
      el.style.transform = 'none';
    }
  }, [hoverInfo.clientX, hoverInfo.clientY, hoverInfo.unitScreenBounds, tooltipRef, containerRef]);

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
    window.addEventListener('resize', positionTooltip);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', positionTooltip);
      window.visualViewport.addEventListener('scroll', positionTooltip);
    }
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', positionTooltip);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', positionTooltip);
        window.visualViewport.removeEventListener('scroll', positionTooltip);
      }
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

  // MD Status color class
  const mdStatusColorClass = getMdStatusColorClass(mdStatus);

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
  const descriptionText = p?.detail || (p as any)?.description || data.appProjectDescription || data.appDescription || data.description || '';

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

  // Safe fallback if vis is undefined
  const v = vis || {
    projectCode: true,
    projectName: true,
    mdStatus: true,
    actStatus: true,
    legendColor: true,
    floor: true,
    startDate: true,
    endDate: true,
    detail: true,
    description: true,
    progressBars: true,
    area: true,
  };

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed z-[120] pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-2.5 sm:p-3 flex flex-col gap-2 transition-all duration-150 select-none",
        "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-100",
        "overflow-y-auto custom-scrollbar"
      )}
      style={{ 
        position: 'fixed',
        transformOrigin: 'top left'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 1. Top Bar: Badges (MD Status & Act Status) + Action Buttons (Drag, QuickNav, Close) */}
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none pb-1 border-b border-slate-100 dark:border-slate-800/80"
      >
        {/* Left: MD Status & Project Status Badges */}
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
          {/* MD Status Badge */}
          {v.mdStatus && mdStatus && (
            <div 
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? mdStatusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'} flex items-center gap-1`}
              title={`MD Status: ${mdStatus}`}
            >
              <span className="text-[8px] font-semibold uppercase opacity-75">MD:</span>
              <span className="capitalize">{mdStatus}</span>
            </div>
          )}

          {/* Project Status Badge */}
          {v.actStatus && (
            <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? statusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'}`}>
              {status}
            </div>
          )}
        </div>

        {/* Right: Actions (Drag Handle, Quick Nav, Close) */}
        <div className="flex items-center gap-1 shrink-0 ml-auto">
          <div
            title="Drag to move tooltip"
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-grab active:cursor-grabbing hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <GripHorizontal className="w-4 h-4" />
          </div>
          <QuickNavButton 
            project={targetProject} 
            title={`Quick Navigator (${unitCode})`}
            className="p-1 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#333336] dark:hover:text-[#8ab4f8] border border-slate-200 dark:border-[#444446]"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Close tooltip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Full-Width Task / Unit Title */}
      <div className="w-full pt-0.5">
        <div 
          onClick={() => p && onEditProject?.(p, !canWrite, 'details')}
          className={cn(
            "font-bold text-slate-800 dark:text-[#f0f0f3] text-sm sm:text-[14px] leading-tight break-words flex items-start gap-1.5 flex-wrap",
            p ? "cursor-pointer hover:text-blue-600 dark:hover:text-[#8ab4f8] transition-colors" : ""
          )}
          title={p ? "Click to view project details" : undefined}
        >
          {v.floor && (
            <span className={cn(
              "text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded border shrink-0 inline-block my-0.5",
              storeDisplay.toLowerCase() === 'hcm' 
                ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-[#8ab4f8] dark:border-blue-800/80' 
                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400 dark:border-red-800/80'
            )}>
              {storeDisplay}
            </span>
          )}
          {v.projectCode && <span className="font-bold font-mono text-blue-600 dark:text-[#8ab4f8]">{unitCode}</span>}
          {(v.projectCode && v.projectName && projectName) && <span className="text-slate-400 dark:text-slate-500">-</span>}
          {v.projectName && projectName && <span className="text-slate-800 dark:text-slate-100">{projectName}</span>}
          {!v.floor && !v.projectCode && (!v.projectName || !projectName) && (
            <span className="font-bold font-mono text-slate-400">{unitCode}</span>
          )}
        </div>
      </div>

      {/* Smart Alert Notification Banner (Click-to-Action) */}
      {data.alerts?.hasAlert && vis?.notifications !== false && (
        <div 
          onClick={() => {
            if (p) {
              onEditProject?.(p, !canWrite, 'details');
            }
          }}
          className={cn(
            "group flex items-start justify-between gap-2 p-2.5 rounded-xl text-xs border font-medium my-1 transition-all cursor-pointer active:scale-[0.98] touch-manipulation hover:shadow-md",
            data.alerts.level === 'critical'
              ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50 hover:bg-red-100/70 dark:hover:bg-red-900/40"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50 hover:bg-amber-100/70 dark:hover:bg-amber-900/40"
          )}
          title="Click to inspect project & tasks"
        >
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <AlertTriangle className={cn(
              "w-4 h-4 shrink-0 mt-0.5",
              data.alerts.level === 'critical' ? "text-red-500 animate-pulse" : "text-amber-500"
            )} />
            <div className="flex-1 flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-[10.5px] uppercase tracking-wide">
                  {data.alerts.level === 'critical' ? 'Critical Alert' : 'Schedule Notice'}
                </span>
                <span className={cn(
                  "text-[9px] font-bold px-1.5 py-0.2 rounded-full",
                  data.alerts.level === 'critical' 
                    ? "bg-red-200/80 dark:bg-red-900/60 text-red-800 dark:text-red-200" 
                    : "bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200"
                )}>
                  {data.alerts.count} issue{data.alerts.count > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 text-[11px] mt-0.5">
                {data.alerts.reasons?.map((reason: string, idx: number) => (
                  <span key={idx} className="flex items-center gap-1.5 break-words">
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" />
                    <span>{reason}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 self-center text-[10px] font-bold opacity-80 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-blue-600 dark:text-[#8ab4f8]">
            <span>Inspect</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* 3. Progress Bars */}
      {v.progressBars && (
        <div className="flex flex-col gap-1 px-0.5 pt-0.5">
          {/* Plan Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
              Plan Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, planProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
              {planProgressPercent}%
            </span>
          </div>

          {/* Actual Progress */}
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[70px] shrink-0">
              Act Prg:
            </span>
            <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300" 
                style={{ width: `${Math.min(100, Math.max(0, actProgressPercent))}%` }} 
              />
            </div>
            <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-300 w-9 text-right shrink-0">
              {actProgressPercent}%
            </span>
          </div>
        </div>
      )}

      {/* 4. Unified Information Row: Floor, Area, Comment Symbol & Dates */}
      {(v.floor || v.area || v.startDate || v.endDate || commentsCount > 0) && (
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
            {v.area && data.size > 0 && (
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
      )}

      {/* 5. Details & Description Section */}
      {((v.detail && (taskLines.length > 0 || detailText)) || (v.description && descriptionText)) && (
        <div className="bg-slate-50 dark:bg-[#1e1e20]/60 rounded-lg p-2 sm:p-2.5 border border-slate-200/80 dark:border-[#444446] text-xs shadow-sm flex flex-col gap-1.5 mt-0.5">
          {v.detail && (taskLines.length > 0 || detailText) && (
            <div className="flex flex-col gap-0.5">
              <div className="text-[9.5px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider">
                Detail
              </div>
              {taskLines.length > 0 ? (
                <div className="flex flex-col gap-0.5">
                  {taskLines.map((line, idx) => (
                    <div 
                      key={idx} 
                      className={`font-semibold text-xs leading-snug ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}
                    >
                      {line}
                    </div>
                  ))}
                  {detailText && (
                    <div className="text-slate-600 dark:text-[#a3a3a3] text-[11px] font-normal whitespace-pre-wrap leading-relaxed pt-1 mt-0.5 border-t border-slate-200/60 dark:border-slate-700/60">
                      {detailText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-blue-600 dark:text-[#8ab4f8] font-semibold text-xs whitespace-pre-wrap leading-snug">
                  {detailText}
                </div>
              )}
            </div>
          )}

          {v.description && descriptionText && (
            <div className={cn("flex flex-col gap-0.5", v.detail && (taskLines.length > 0 || detailText) ? "pt-1 border-t border-slate-200/60 dark:border-slate-700/60" : "")}>
              <div className="text-[9.5px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-wider">
                Description / Note
              </div>
              <div className="text-slate-700 dark:text-slate-200 font-medium text-xs whitespace-pre-wrap leading-relaxed">
                {descriptionText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
