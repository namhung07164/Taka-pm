import React from 'react';
import { Layers } from 'lucide-react';

interface LiveLayoutFloorSelectorProps {
  locationFilter: string;
  targetLoc: string;
  locationVersions: any[];
  version: any;
  selectedVersionId: string | null;
  setSelectedVersionId: (id: string) => void;
}

export const LiveLayoutFloorSelector: React.FC<LiveLayoutFloorSelectorProps> = ({
  locationFilter,
  targetLoc,
  locationVersions,
  version,
  selectedVersionId,
  setSelectedVersionId,
}) => {
  return (
    <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex items-center gap-1 sm:gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-800 pointer-events-auto">
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
        <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
          {locationFilter === 'all' ? `Tất cả (${targetLoc})` : targetLoc}
        </span>
      </div>

      {locationVersions.length > 1 && (
        <div className="flex items-center gap-1 min-w-0">
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
          <select
            value={selectedVersionId || version?.id || ''}
            onChange={(e) => setSelectedVersionId(e.target.value)}
            className="text-[11px] sm:text-xs font-semibold bg-transparent text-slate-700 dark:text-slate-300 hover:text-brand-600 dark:hover:text-brand-400 focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[160px] truncate"
            title="Chọn bản vẽ kỹ thuật"
          >
            {locationVersions.map((v: any) => (
              <option key={v.id} value={v.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                {v.name || 'Bản vẽ'} {v.year ? `(${v.year})` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
