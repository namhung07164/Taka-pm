import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Hand,
  Layers,
  ChevronDown,
  ChevronUp,
  Search,
  ArrowUpToLine,
} from 'lucide-react';

export interface LightboxZoomDockProps {
  zoomScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onSetScale?: (scale: number) => void;
  touchZoomMode: 'pinch' | 'scroll';
  onToggleTouchZoomMode: () => void;
  onScrollUp?: () => void;
  onScrollDown?: () => void;
  onScrollToTop?: () => void;
  isIframeMode?: boolean;
  className?: string;
}

export const LightboxZoomDock: React.FC<LightboxZoomDockProps> = ({
  zoomScale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onSetScale,
  touchZoomMode,
  onToggleTouchZoomMode,
  onScrollUp,
  onScrollDown,
  onScrollToTop,
  isIframeMode = true,
  className = '',
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const percentage = Math.round(zoomScale * 100);

  const handleCycleScale = () => {
    if (!onSetScale) return;
    if (percentage < 125) onSetScale(1.5);
    else if (percentage < 175) onSetScale(2.0);
    else if (percentage < 250) onSetScale(3.0);
    else onResetZoom();
  };

  if (isCollapsed) {
    return (
      <div
        className={`absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 z-40 transition-all select-none ${className}`}
      >
        <button
          type="button"
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/95 hover:bg-slate-800 text-white border border-slate-700 shadow-2xl backdrop-blur-md active:scale-95 touch-manipulation cursor-pointer text-xs font-bold"
          title="Expand Zoom Controls"
        >
          <Search className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-mono text-blue-300">{percentage}%</span>
          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`absolute bottom-12 sm:bottom-14 left-1/2 -translate-x-1/2 z-40 max-w-[94vw] transition-all select-none ${className}`}
    >
      <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-2xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 shadow-2xl text-white">
        {/* Collapse Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(true)}
          className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Minimize Dock"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

        {/* Zoom Out Button */}
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Percentage (Interactive Cycle) */}
        <button
          type="button"
          onClick={handleCycleScale}
          className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-xs font-mono font-bold text-blue-300 hover:text-blue-200 hover:border-blue-500 transition-colors active:scale-95 touch-manipulation cursor-pointer min-w-[3.2rem] text-center"
          title="Click to cycle: 100% → 150% → 200% → 300%"
        >
          {percentage}%
        </button>

        {/* Zoom In Button */}
        <button
          type="button"
          onClick={onZoomIn}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        {/* Reset Zoom Button */}
        <button
          type="button"
          onClick={onResetZoom}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Reset Zoom (100%)"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        {/* Zoom Presets (sm+ screens) */}
        {onSetScale && (
          <div className="hidden md:flex items-center gap-1 border-l border-slate-700 pl-1.5">
            <button
              type="button"
              onClick={() => onSetScale(1.0)}
              className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors active:scale-95 cursor-pointer ${
                percentage === 100 ? 'bg-blue-600 font-bold text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
              title="Fit / 100%"
            >
              1x
            </button>
            <button
              type="button"
              onClick={() => onSetScale(1.5)}
              className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors active:scale-95 cursor-pointer ${
                percentage === 150 ? 'bg-blue-600 font-bold text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
              title="150% Zoom"
            >
              1.5x
            </button>
            <button
              type="button"
              onClick={() => onSetScale(2.0)}
              className={`px-1.5 py-0.5 text-[11px] font-mono rounded transition-colors active:scale-95 cursor-pointer ${
                percentage === 200 ? 'bg-blue-600 font-bold text-white' : 'text-slate-300 hover:bg-slate-800'
              }`}
              title="200% Zoom"
            >
              2x
            </button>
          </div>
        )}

        {/* Iframe Interaction Mode Toggle (Pinch Zoom vs Scroll) */}
        {isIframeMode && (
          <>
            <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />
            <button
              type="button"
              onClick={onToggleTouchZoomMode}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold transition-all active:scale-95 touch-manipulation cursor-pointer ${
                touchZoomMode === 'pinch'
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title={
                touchZoomMode === 'pinch'
                  ? 'Pinch & Pan Active: Drag with 1 finger, pinch with 2 fingers to zoom'
                  : 'Scroll Mode Active: Directly scroll Google Drive pages'
              }
            >
              {touchZoomMode === 'pinch' ? (
                <>
                  <Hand className="w-3.5 h-3.5 text-blue-200" />
                  <span className="text-[11px] font-bold">Pinch Zoom</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px]">Scroll Pages</span>
                </>
              )}
            </button>

            {/* Quick-Scroll Action Buttons when in Scroll Mode */}
            {touchZoomMode === 'scroll' && (
              <div className="flex items-center gap-1 border-l border-slate-700 pl-1">
                {onScrollToTop && (
                  <button
                    type="button"
                    onClick={onScrollToTop}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-blue-300 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer flex items-center gap-0.5 text-[11px] font-bold"
                    title="Scroll to Top (Lên đầu trang)"
                  >
                    <ArrowUpToLine className="w-3.5 h-3.5 text-blue-400" />
                    <span className="hidden sm:inline">Top</span>
                  </button>
                )}
                {onScrollUp && (
                  <button
                    type="button"
                    onClick={onScrollUp}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-emerald-300 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer flex items-center gap-0.5 text-[11px] font-bold"
                    title="Scroll Up (Cuộn lên)"
                  >
                    <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Up</span>
                  </button>
                )}
                {onScrollDown && (
                  <button
                    type="button"
                    onClick={onScrollDown}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-indigo-300 hover:text-white transition-colors active:scale-95 touch-manipulation cursor-pointer flex items-center gap-0.5 text-[11px] font-bold"
                    title="Scroll Down (Cuộn xuống)"
                  >
                    <ChevronDown className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="hidden sm:inline">Down</span>
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
