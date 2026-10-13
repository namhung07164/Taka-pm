import React, { Dispatch, FC, SetStateAction, memo } from 'react';
import { Bell, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LayoutZoomControlsProps {
  totalFloorAlerts: number;
  filterOnlyAlerts: boolean;
  setFilterOnlyAlerts: React.Dispatch<React.SetStateAction<boolean>>;
  stageScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
}

export const LayoutZoomControls: React.FC<LayoutZoomControlsProps> = React.memo(({
  totalFloorAlerts,
  filterOnlyAlerts,
  setFilterOnlyAlerts,
  stageScale,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
}) => {
  return (
    <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-20 flex items-center gap-0.5 sm:gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl hide-on-actual-print print:hidden">
      {totalFloorAlerts > 0 && (
        <button
          type="button"
          onClick={() => setFilterOnlyAlerts(prev => !prev)}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all active:scale-95 touch-manipulation border mr-0.5 cursor-pointer",
            filterOnlyAlerts
              ? "bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-400/50"
              : "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/50 dark:hover:bg-red-900/60 dark:text-red-300 border-red-200 dark:border-red-900/60"
          )}
          title={filterOnlyAlerts ? "Currently filtering only alert units (Click to show all)" : `Filter ${totalFloorAlerts} alert units`}
        >
          <Bell className={cn("w-3.5 h-3.5", filterOnlyAlerts ? "text-white animate-bounce" : "text-red-500")} />
          <span className="font-bold">{filterOnlyAlerts ? "Alerts Only" : "Alerts"}</span>
          <span className={cn(
            "font-mono font-bold px-1.5 py-0.2 rounded-full text-[10px]",
            filterOnlyAlerts ? "bg-white/25 text-white" : "bg-red-200 dark:bg-red-900/70 text-red-800 dark:text-red-200"
          )}>
            {totalFloorAlerts}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={onZoomIn}
        className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
        title="Zoom In"
      >
        <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
        title="Zoom Out"
      >
        <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
      <div className="px-1.5 py-0.5 text-[10px] sm:text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700 min-w-[34px] sm:min-w-[42px] text-center">
        {Math.round(stageScale * 100)}%
      </div>
      <button 
        type="button" 
        onClick={onFitToScreen}
        className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
        title="Reset / Fit to Screen"
      >
        <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </button>
    </div>
  );
});
