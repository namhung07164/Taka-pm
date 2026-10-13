import React, { FC } from 'react';

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
  return (
    <div className="hidden print:flex absolute bottom-4 left-4 z-30 bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-300 shadow-md flex-col gap-1.5 min-w-[200px] max-w-xl pointer-events-none">
      <div className="flex items-center justify-between border-b border-slate-200 pb-1 gap-3">
        <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
          Color Legend
        </span>
        <span className="text-[10px] font-bold text-slate-600">
          {storeFilter} • {targetLoc} {version?.year ? `(${version.year})` : ''}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {activeGroups.length > 0 ? (
          activeGroups.map((g: any) => (
            <div key={g.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
              <span className="w-3.5 h-3.5 rounded-xs border border-slate-400 shrink-0" style={{ backgroundColor: g.color }} />
              <span className="font-bold">{g.name}</span>
              {g.matchCount !== undefined && (
                <span className="text-[10px] text-slate-500 font-mono">({g.matchCount})</span>
              )}
            </div>
          ))
        ) : (
          <>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 border border-slate-400 shrink-0" />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
              <span className="w-3 h-3 rounded-xs bg-blue-500 border border-slate-400 shrink-0" />
              <span>On Process</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
              <span className="w-3 h-3 rounded-xs bg-amber-500 border border-slate-400 shrink-0" />
              <span>Upcoming</span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
              <span className="w-3 h-3 rounded-xs bg-rose-500 border border-slate-400 shrink-0" />
              <span>Delay</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
