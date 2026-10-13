import React, { FC, memo } from 'react';
import { Layers } from 'lucide-react';

export interface LayoutFloorVersionSelectorProps {
  storeFilter: string;
  targetLoc: string;
  locationVersions: any[];
  version: any;
  setSelectedVersionId: (id: string) => void;
}

export const LayoutFloorVersionSelector: React.FC<LayoutFloorVersionSelectorProps> = React.memo(({
  storeFilter,
  targetLoc,
  locationVersions,
  version,
  setSelectedVersionId,
}) => {
  return (
    <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 sm:gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1.5 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl max-w-[55%] sm:max-w-none hide-on-actual-print print:hidden">
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
        <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider whitespace-nowrap">
          {storeFilter} • {targetLoc}
        </span>
      </div>
      {locationVersions.length > 1 && (
        <>
          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-semibold text-slate-400 uppercase hidden sm:inline">Version:</span>
            <select
              value={version?.id || ''}
              onChange={(e) => setSelectedVersionId(e.target.value)}
              className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[10px] sm:text-xs font-semibold rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer max-w-[85px] sm:max-w-[180px] truncate"
              title="Select Layout Version"
            >
              {locationVersions.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.name || v.id}{v.year ? ` • ${v.year}` : ''}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {locationVersions.length <= 1 && version?.name && (
        <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-1.5 sm:pl-2 max-w-[80px] sm:max-w-[180px] truncate">
          {version.name}{version.year ? ` • ${version.year}` : ''}
        </span>
      )}
    </div>
  );
});
