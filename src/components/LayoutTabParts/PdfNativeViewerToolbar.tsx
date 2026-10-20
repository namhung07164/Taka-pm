import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  ExternalLink,
  Layers,
  FileText,
  LayoutGrid,
} from 'lucide-react';

export interface PdfNativeViewerToolbarProps {
  currentPage: number;
  numPages: number;
  pageInput: string;
  onPageInputChange: (val: string) => void;
  onPageInputSubmit: (e: React.FormEvent) => void;
  onPageChange: (page: number) => void;
  isLoading: boolean;
  zoomScale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
  url: string;
  viewMode: 'page' | 'scroll';
  onToggleViewMode: () => void;
  showThumbnails?: boolean;
  onToggleThumbnails?: () => void;
}

export const PdfNativeViewerToolbar: React.FC<PdfNativeViewerToolbarProps> = ({
  currentPage,
  numPages,
  pageInput,
  onPageInputChange,
  onPageInputSubmit,
  onPageChange,
  isLoading,
  zoomScale,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  isFullscreen,
  onOpenFullscreen,
  url,
  viewMode,
  onToggleViewMode,
  showThumbnails = false,
  onToggleThumbnails,
}) => {
  return (
    <div className="z-[60] flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 bg-slate-900 border-b border-slate-800 shrink-0 text-slate-100 select-none">
      {/* Left: Page Navigation Arrows, Input, Mode & Thumbnails */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1 || isLoading}
          onClick={() => onPageChange(currentPage - 1)}
          className="p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer border border-slate-700/80"
          title="Previous Page (Left Arrow)"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <form onSubmit={onPageInputSubmit} className="flex items-center gap-1">
          <span className="text-[11px] sm:text-xs text-slate-400 font-medium hidden xs:inline">Page</span>
          <input
            type="text"
            value={pageInput}
            onChange={(e) => onPageInputChange(e.target.value)}
            onBlur={() => onPageInputChange(String(currentPage))}
            className="w-9 sm:w-11 px-1 py-0.5 text-center bg-slate-800 border border-slate-700 rounded text-xs font-mono font-bold text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <span className="text-[11px] sm:text-xs text-slate-400 font-mono font-medium">/ {numPages || 1}</span>
        </form>

        <button
          type="button"
          disabled={currentPage >= numPages || isLoading}
          onClick={() => onPageChange(currentPage + 1)}
          className="p-1 sm:p-1.5 bg-slate-800/80 hover:bg-slate-700 disabled:opacity-30 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer border border-slate-700/80"
          title="Next Page (Right Arrow / Swipe Up)"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {onToggleThumbnails && numPages >= 1 && (
          <button
            type="button"
            onClick={onToggleThumbnails}
            className={`ml-0.5 px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer border ${
              showThumbnails
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title="Toggle Page Thumbnails"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Thumbnails</span>
          </button>
        )}

        {numPages > 1 && (
          <button
            type="button"
            onClick={onToggleViewMode}
            className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer border ${
              viewMode === 'scroll'
                ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
            title={viewMode === 'scroll' ? 'Switch to Page by Page' : 'Switch to Continuous Scroll'}
          >
            {viewMode === 'scroll' ? (
              <>
                <Layers className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Scroll Mode</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Page Mode</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Center: 0ms GPU Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          className="p-1 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Zoom Out (- / Scroll Down)"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <span className="px-1.5 sm:px-2 py-0.5 text-[11px] sm:text-xs font-mono font-bold text-blue-300 bg-slate-800 rounded border border-slate-700 min-w-[2.8rem] sm:min-w-[3.2rem] text-center">
          {Math.round(zoomScale * 100)}%
        </span>

        <button
          type="button"
          onClick={onZoomIn}
          className="p-1 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Zoom In (+ / Scroll Up)"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          className="px-1.5 sm:px-2 py-1 text-[11px] font-semibold rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors active:scale-95 touch-manipulation flex items-center gap-1 cursor-pointer"
          title="Reset Zoom (100%)"
        >
          <RotateCcw className="w-3 h-3" />
          <span className="hidden xs:inline">Reset</span>
        </button>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {onOpenFullscreen && !isFullscreen && (
          <button
            type="button"
            onClick={onOpenFullscreen}
            className="p-1 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
            title="Full Display"
          >
            <Maximize2 className="w-4 h-4 text-blue-400" />
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 sm:p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
          title="Open original file in new window"
        >
          <ExternalLink className="w-4 h-4 text-slate-400 hover:text-white" />
        </a>
      </div>
    </div>
  );
};
