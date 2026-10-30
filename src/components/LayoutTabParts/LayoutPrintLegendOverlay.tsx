import React, { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { GripHorizontal, EyeOff, RotateCcw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { getHatchCssStyle } from './layoutPatternUtils';

export interface LayoutPrintLegendOverlayProps {
  storeFilter: string;
  targetLoc: string;
  version: any;
  activeGroups: any[];
}

export const LayoutPrintLegendOverlay: React.FC<LayoutPrintLegendOverlayProps> = ({
  storeFilter,
  targetLoc,
  version,
  activeGroups,
}) => {
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const printShowColorLegend = useAppStore(state => state.printShowColorLegend);
  const setPrintShowColorLegend = useAppStore(state => state.setPrintShowColorLegend);

  const nodeRef = useRef<HTMLDivElement>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = sessionStorage.getItem('taka_print_legend_pos');
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

  const handleDrag = (_e: any, data: { x: number; y: number }) => {
    const next = { x: data.x, y: data.y };
    setDragPos(next);
    try {
      sessionStorage.setItem('taka_print_legend_pos', JSON.stringify(next));
    } catch {
      // Ignore
    }
  };

  const handleResetPosition = (e: React.MouseEvent) => {
    e.stopPropagation();
    const zero = { x: 0, y: 0 };
    setDragPos(zero);
    try {
      sessionStorage.removeItem('taka_print_legend_pos');
    } catch {
      // Ignore
    }
  };

  // Expose print legend state and relative position for PDF export (exportLayoutPlanToPdf)
  useEffect(() => {
    (window as any).__taka_layout_print_legend = {
      show: Boolean(printShowColorLegend),
      storeFilter,
      targetLoc,
      versionYear: version?.year ? String(version.year) : '',
      activeGroups: activeGroups || [],
      getRelativeRect: () => {
        const el = nodeRef.current;
        if (!el || !printShowColorLegend) return null;
        const parent = el.parentElement;
        if (!parent) return null;
        const elRect = el.getBoundingClientRect();
        const parentRect = parent.getBoundingClientRect();
        if (parentRect.width <= 0 || parentRect.height <= 0 || elRect.width <= 0 || elRect.height <= 0) {
          return null;
        }
        return {
          relX: Math.max(0, Math.min(1, (elRect.left - parentRect.left) / parentRect.width)),
          relY: Math.max(0, Math.min(1, (elRect.top - parentRect.top) / parentRect.height)),
          relW: Math.min(1, elRect.width / parentRect.width),
          relH: Math.min(1, elRect.height / parentRect.height),
        };
      },
    };
    return () => {
      delete (window as any).__taka_layout_print_legend;
    };
  }, [printShowColorLegend, storeFilter, targetLoc, version?.year, activeGroups, dragPos]);

  if (!printShowColorLegend) {
    return null;
  }

  const totalUnits = activeGroups.reduce((acc, g) => acc + Number(g.matchCount || 0), 0);
  const totalArea = activeGroups.reduce((acc, g) => acc + Number(g.totalArea || 0), 0);

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".print-legend-drag-handle"
      cancel="button, .no-drag"
      bounds="parent"
      position={dragPos}
      onDrag={handleDrag}
    >
      <div
        ref={nodeRef}
        className={`${
          isPrintPreview ? 'flex pointer-events-auto' : 'hidden print:flex pointer-events-none'
        } absolute bottom-4 left-4 z-40 bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border-2 border-slate-800 shadow-xl print:shadow-none flex-col gap-1.5 min-w-[220px] max-w-xl select-none`}
      >
        <div className="print-legend-drag-handle cursor-grab active:cursor-grabbing flex items-center justify-between border-b border-slate-300 pb-1.5 gap-3">
          <div className="flex items-center gap-1.5">
            {isPrintPreview && (
              <span
                className="p-0.5 rounded bg-purple-100 text-purple-700 hide-on-actual-print print:hidden"
                title="Drag to move Color Legend anywhere on the layout sheet"
              >
                <GripHorizontal className="w-3.5 h-3.5" />
              </span>
            )}
            <span className="text-[11px] font-extrabold text-slate-900 uppercase tracking-wider">
              Color Legend
            </span>
            {isPrintPreview && (
              <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.2 rounded hide-on-actual-print print:hidden">
                Drag to move
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-700">
              {storeFilter} • {targetLoc} {version?.year ? `(${version.year})` : ''}
            </span>
            {isPrintPreview && (
              <div className="flex items-center gap-1 hide-on-actual-print print:hidden">
                {(dragPos.x !== 0 || dragPos.y !== 0) && (
                  <button
                    type="button"
                    onClick={handleResetPosition}
                    className="no-drag p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                    title="Reset Legend Position"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPrintShowColorLegend(false)}
                  className="no-drag flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-bold transition-colors cursor-pointer"
                  title="Hide Color Legend in Print (can re-enable in Print Options)"
                >
                  <EyeOff className="w-3 h-3" />
                  <span>Hide</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {activeGroups.length > 0 ? (
            activeGroups.map((g: any) => (
              <div
                key={g.id}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-[11px] font-semibold"
              >
                <span
                  className="w-3.5 h-3.5 rounded-xs border border-slate-500 shrink-0"
                  style={getHatchCssStyle(g.color, g.hatchPattern)}
                />
                <span className="font-bold text-slate-900">{g.name}</span>
                {g.matchCount !== undefined && (
                  <span className="text-[10px] text-slate-600 font-mono">
                    ({g.matchCount} {g.matchCount === 1 ? 'unit' : 'units'}
                    {g.totalArea > 0
                      ? ` • ${Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²`
                      : ''}
                    {g.areaPercent ? ` • ${Number(g.areaPercent).toFixed(1)}%` : ''})
                  </span>
                )}
              </div>
            ))
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 border border-slate-500 shrink-0" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-blue-500 border border-slate-500 shrink-0" />
                <span>On Process</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-amber-500 border border-slate-500 shrink-0" />
                <span>Upcoming</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-rose-500 border border-slate-500 shrink-0" />
                <span>Delay</span>
              </div>
            </>
          )}
        </div>

        {activeGroups.length > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-1 mt-0.5 text-[10px] font-mono font-bold text-slate-700">
            <span className="uppercase tracking-wider text-slate-500">Total</span>
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
  );
};

