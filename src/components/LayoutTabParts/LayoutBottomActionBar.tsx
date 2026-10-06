import React from 'react';
import { Palette, AlertTriangle } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LayoutBottomActionBarProps {
  hoverInfo: any;
  layoutTooltipVisibility: any;
  activeGroups: any[];
  totalFloorAlerts: number;
  filterOnlyAlerts: boolean;
  setFilterOnlyAlerts: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenLegendModal: () => void;
}

export const LayoutBottomActionBar: React.FC<LayoutBottomActionBarProps> = React.memo(({
  hoverInfo,
  layoutTooltipVisibility,
  activeGroups,
  totalFloorAlerts,
  filterOnlyAlerts,
  setFilterOnlyAlerts,
  onOpenLegendModal,
}) => {
  return (
    <div className={`absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 transition-all duration-150 hide-on-actual-print print:hidden ${hoverInfo?.visible ? 'max-sm:opacity-0 max-sm:pointer-events-none' : 'opacity-100'}`}>
      <button 
        onClick={onOpenLegendModal} 
        className={cn(
          "flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 backdrop-blur-md border shadow-xl rounded-full text-xs font-bold active:scale-95 touch-manipulation transition-all whitespace-nowrap cursor-pointer",
          layoutTooltipVisibility?.legendColor !== false
            ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
            : "bg-slate-700/90 hover:bg-slate-800 text-slate-200 border-slate-600"
        )}
      >
        <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
        <span>Color Legend</span>
        {layoutTooltipVisibility?.legendColor !== false && activeGroups.length > 0 && (
          <span className="bg-white/25 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
            {activeGroups.length}
          </span>
        )}
        {layoutTooltipVisibility?.legendColor === false && (
          <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[9px] font-medium text-slate-300">
            Off
          </span>
        )}
      </button>

      {totalFloorAlerts > 0 && (
        <button
          onClick={() => setFilterOnlyAlerts(prev => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 backdrop-blur-md border shadow-xl rounded-full text-xs font-bold active:scale-95 touch-manipulation transition-all whitespace-nowrap cursor-pointer",
            filterOnlyAlerts
              ? "bg-red-600 hover:bg-red-700 text-white border-red-500 shadow-red-500/20 ring-2 ring-red-400"
              : "bg-white/95 dark:bg-slate-800/95 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60"
          )}
          title={filterOnlyAlerts ? "Click to show all units" : "Highlight only units with active alerts"}
        >
          <AlertTriangle className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", filterOnlyAlerts ? "text-white" : "text-red-500 animate-pulse")} />
          <span>{filterOnlyAlerts ? "Show All" : "Focus Alerts"}</span>
          <span className={cn(
            "px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold",
            filterOnlyAlerts ? "bg-white/25 text-white" : "bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300"
          )}>
            {totalFloorAlerts}
          </span>
        </button>
      )}
    </div>
  );
});
