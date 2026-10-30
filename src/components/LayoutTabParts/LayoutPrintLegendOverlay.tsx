import React, { useEffect, useMemo, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { GripHorizontal, EyeOff, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getHatchCssStyle } from './layoutPatternUtils';

export interface LayoutPrintLegendOverlayProps {
  storeFilter: string;
  targetLoc: string;
  version: any;
  activeGroups: any[];
  bgImage?: HTMLImageElement | ImageBitmap | null;
  units?: any[];
  stageScale?: number;
  stagePos?: { x: number; y: number };
  dimensions?: { width: number; height: number };
}

const REF_PLAN_WIDTH = 1000;

export const LayoutPrintLegendOverlay: React.FC<LayoutPrintLegendOverlayProps> = ({
  storeFilter,
  targetLoc,
  version,
  activeGroups,
  bgImage,
  units = [],
  stageScale = 1,
  stagePos = { x: 0, y: 0 },
  dimensions = { width: 1000, height: 700 },
}) => {
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const printShowColorLegend = useAppStore(state => state.printShowColorLegend);
  const setPrintShowColorLegend = useAppStore(state => state.setPrintShowColorLegend);

  const nodeRef = useRef<HTMLDivElement>(null);
  const planFrameRef = useRef<HTMLDivElement>(null);

  // Compute exact floor plan world bounds matching exportStageHighRes in layoutStageUtils.ts
  const planBounds = useMemo(() => {
    const imgScale = Number(version?.imageScale) || 1;
    const imgPosX = Number(version?.imagePos?.x) || 0;
    const imgPosY = Number(version?.imagePos?.y) || 0;

    let contentW = 0;
    let contentH = 0;
    let contentX = imgPosX;
    let contentY = imgPosY;

    if (bgImage) {
      const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || bgImage.width || 0;
      const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || bgImage.height || 0;
      if (imgNaturalW > 0 && imgNaturalH > 0) {
        contentW = imgNaturalW * imgScale;
        contentH = imgNaturalH * imgScale;
      }
    }

    if ((contentW <= 0 || contentH <= 0) && units.length > 0) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      units.forEach((u: any) => {
        if (!u || u.visible === false) return;
        const ux = Number(u.x) || 0;
        const uy = Number(u.y) || 0;
        const uw = Number(u.width) || 120;
        const uh = Number(u.height) || 80;
        if (ux < minX) minX = ux;
        if (uy < minY) minY = uy;
        if (ux + uw > maxX) maxX = ux + uw;
        if (uy + uh > maxY) maxY = uy + uh;
      });
      if (isFinite(minX) && isFinite(minY) && maxX > minX && maxY > minY) {
        const pad = 60;
        contentX = minX - pad;
        contentY = minY - pad;
        contentW = maxX - minX + pad * 2;
        contentH = maxY - minY + pad * 2;
      }
    }

    if (contentW <= 0 || contentH <= 0) {
      const safeScale = stageScale || 1;
      return {
        planLeft: 0,
        planTop: 0,
        planW: Math.max(200, dimensions.width),
        planH: Math.max(200, dimensions.height),
        refW: REF_PLAN_WIDTH,
        refH: Math.max(200, Math.round(REF_PLAN_WIDTH * (dimensions.height / Math.max(1, dimensions.width)))),
        overlayScale: Math.max(0.15, dimensions.width / REF_PLAN_WIDTH),
        safeScale,
      };
    }

    const planLeft = stagePos.x + contentX * stageScale;
    const planTop = stagePos.y + contentY * stageScale;
    const planW = Math.max(100, contentW * stageScale);
    const planH = Math.max(100, contentH * stageScale);
    const refW = REF_PLAN_WIDTH;
    const refH = Math.max(200, REF_PLAN_WIDTH * (contentH / contentW));
    const overlayScale = planW / refW;

    return {
      planLeft,
      planTop,
      planW,
      planH,
      refW,
      refH,
      overlayScale,
      safeScale: stageScale,
    };
  }, [bgImage, version?.imageScale, version?.imagePos?.x, version?.imagePos?.y, units, stageScale, stagePos.x, stagePos.y, dimensions.width, dimensions.height]);

  const [dragPos, setDragPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = sessionStorage.getItem('taka_print_legend_pos_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return { x: 0, y: 0 };
  });

  const handleDragStop = (_e: any, data: { x: number; y: number }) => {
    const next = { x: Math.round(data.x), y: Math.round(data.y) };
    setDragPos(next);
    try {
      sessionStorage.setItem('taka_print_legend_pos_v2', JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    const zero = { x: 0, y: 0 };
    setDragPos(zero);
    try {
      sessionStorage.removeItem('taka_print_legend_pos_v2');
    } catch {
      // Ignore
    }
  };

  // Expose print legend state and exact floor-plan-relative coordinates for PDF export (exportLayoutPlanToPdf)
  useEffect(() => {
    (window as any).__taka_layout_print_legend = {
      show: Boolean(printShowColorLegend),
      storeFilter,
      targetLoc,
      versionYear: version?.year ? String(version.year) : '',
      activeGroups: activeGroups || [],
      getRelativeRect: () => {
        const el = nodeRef.current;
        const frameEl = planFrameRef.current;
        if (!el || !frameEl || !printShowColorLegend) return null;
        const elRect = el.getBoundingClientRect();
        const frameRect = frameEl.getBoundingClientRect();
        if (frameRect.width <= 0 || frameRect.height <= 0 || elRect.width <= 0 || elRect.height <= 0) {
          return null;
        }
        return {
          relX: Math.max(0, Math.min(1, (elRect.left - frameRect.left) / frameRect.width)),
          relY: Math.max(0, Math.min(1, (elRect.top - frameRect.top) / frameRect.height)),
          relW: Math.min(1, elRect.width / frameRect.width),
          relH: Math.min(1, elRect.height / frameRect.height),
        };
      },
    };
    return () => {
      delete (window as any).__taka_layout_print_legend;
    };
  }, [printShowColorLegend, storeFilter, targetLoc, version?.year, activeGroups, dragPos, planBounds]);

  if (!printShowColorLegend) {
    return null;
  }

  const displayGroups =
    activeGroups.length > 0
      ? activeGroups
      : [
          { id: 'completed', name: 'Completed', color: '#10b981' },
          { id: 'on_process', name: 'On Process', color: '#3b82f6' },
          { id: 'upcoming', name: 'Upcoming', color: '#f59e0b' },
          { id: 'delay', name: 'Delay', color: '#f43f5e' },
        ];

  const totalUnits = activeGroups.reduce((acc, g) => acc + Number(g.matchCount || 0), 0);
  const totalArea = activeGroups.reduce((acc, g) => acc + Number(g.totalArea || 0), 0);

  return (
    <div
      ref={planFrameRef}
      style={{
        left: `${planBounds.planLeft}px`,
        top: `${planBounds.planTop}px`,
        width: `${planBounds.refW}px`,
        height: `${planBounds.refH}px`,
        transform: `scale(${planBounds.overlayScale})`,
        transformOrigin: '0 0',
      }}
      className={`${
        isPrintPreview ? 'block' : 'hidden print:block'
      } absolute z-40 pointer-events-none select-none ${
        isPrintPreview
          ? 'outline-1 outline-dashed outline-purple-500/45 print:outline-none'
          : ''
      }`}
    >
      {isPrintPreview && (
        <div className="absolute -top-5 right-0 px-1.5 py-0.5 rounded bg-purple-900/75 text-purple-100 text-[9px] font-mono font-bold tracking-wider uppercase hide-on-actual-print print:hidden">
          Print Page Boundary (1:1 Scale)
        </div>
      )}

      <Draggable
        nodeRef={nodeRef}
        handle=".print-legend-drag-handle"
        cancel="button, .no-drag"
        bounds="parent"
        scale={planBounds.overlayScale}
        position={dragPos}
        onStop={handleDragStop}
      >
        <div
          ref={nodeRef}
          className={`${
            isPrintPreview ? 'flex pointer-events-auto' : 'hidden print:flex pointer-events-none'
          } print-legend-drag-handle cursor-grab active:cursor-grabbing absolute bottom-5 left-5 bg-white px-3 py-2 rounded-lg border-[2px] border-slate-800 shadow-lg print:shadow-none flex-col gap-1 min-w-[235px] max-w-[360px] select-none group`}
        >
          {/* Floating Interactive Controls above the card (excluded from printed card bounding box so 1:1 scale is exact) */}
          {isPrintPreview && (
            <div className="absolute -top-7 left-0 flex items-center gap-1 bg-slate-900/90 text-white px-2 py-0.5 rounded-md shadow-md border border-slate-700 whitespace-nowrap hide-on-actual-print print:hidden">
              <GripHorizontal className="w-3 h-3 text-purple-300 shrink-0" />
              <span className="text-[9px] font-bold tracking-wide text-purple-200">Drag Legend (1:1 Print Scale)</span>
              {(dragPos.x !== 0 || dragPos.y !== 0) && (
                <button
                  type="button"
                  onClick={handleResetPosition}
                  className="no-drag ml-1 p-0.5 rounded hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Reset Legend Position"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setPrintShowColorLegend(false)}
                className="no-drag ml-0.5 flex items-center gap-0.5 px-1 py-0.2 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 border border-rose-400/30 text-[8px] font-bold transition-colors cursor-pointer"
                title="Hide Color Legend in Print"
              >
                <EyeOff className="w-2.5 h-2.5" />
                <span>Hide</span>
              </button>
            </div>
          )}

          {/* Header matching PDF export 1:1 */}
          <div className="flex items-center justify-between border-b border-slate-300 pb-1 gap-3">
            <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider leading-tight">
              COLOR LEGEND
            </span>
            <span className="text-[9.5px] font-bold text-slate-600 leading-tight">
              {storeFilter} • {targetLoc} {version?.year ? `(${version.year})` : ''}
            </span>
          </div>

          {/* Vertical list of legend items matching PDF export 1:1 */}
          <div className="flex flex-col gap-1 pt-0.5">
            {displayGroups.map((g: any) => (
              <div
                key={g.id}
                className="flex items-center gap-2 text-slate-900 text-[10px] font-bold leading-tight"
              >
                <span
                  className="w-3 h-3 rounded-[2px] border border-slate-600 shrink-0"
                  style={getHatchCssStyle(g.color, g.hatchPattern)}
                />
                <span className="truncate">
                  {g.name}
                  {g.matchCount !== undefined && (
                    <span className="font-semibold text-slate-700">
                      {` (${g.matchCount} ${g.matchCount === 1 ? 'unit' : 'units'}${
                        g.totalArea > 0
                          ? ` • ${Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²`
                          : ''
                      }${g.areaPercent ? ` • ${Number(g.areaPercent).toFixed(1)}%` : ''})`}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {activeGroups.length > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-1 mt-0.5 text-[9.5px] font-mono font-bold text-slate-700 leading-tight">
              <span className="uppercase tracking-wider text-slate-500">TOTAL</span>
              <span>
                {totalUnits} {totalUnits === 1 ? 'unit' : 'units'}
                {totalArea > 0
                  ? ` • ${totalArea.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m² • 100%`
                  : ''}
              </span>
            </div>
          )}
        </div>
      </Draggable>
    </div>
  );
};


