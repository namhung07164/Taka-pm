import React from 'react';
import { AlertCircle, RefreshCw, ExternalLink } from 'lucide-react';

export interface PdfDocumentErrorViewProps {
  url: string;
  onFallbackToIframe?: () => void;
}

export const PdfDocumentErrorView: React.FC<PdfDocumentErrorViewProps> = ({
  url,
  onFallbackToIframe,
}) => {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-200 text-center bg-slate-900 rounded-xl">
      <AlertCircle className="w-10 h-10 text-amber-400 mb-3 shrink-0" />
      <p className="text-base font-semibold text-slate-100">Cannot load PDF directly in canvas</p>
      <p className="text-xs text-slate-400 mt-1 max-w-md">
        The document server prevents direct binary access. You can use embedded mode or open in a new window.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onFallbackToIframe && (
          <button
            type="button"
            onClick={onFallbackToIframe}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Switch to Embed Viewer
          </button>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 active:scale-95 touch-manipulation cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open File in New Tab
        </a>
      </div>
    </div>
  );
};

export interface PdfPageRenderErrorOverlayProps {
  onRetry: () => void;
  onFallbackToIframe?: () => void;
}

export const PdfPageRenderErrorOverlay: React.FC<PdfPageRenderErrorOverlayProps> = ({
  onRetry,
  onFallbackToIframe,
}) => {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center">
      <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
      <p className="text-xs font-semibold text-slate-200">Không thể vẽ trang PDF trên canvas thiết bị</p>
      <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
        File có thể chứa font hoặc bộ lọc đồ họa đặc biệt. Bạn có thể mở bằng trình xem Iframe hoặc tab mới.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium active:scale-95 cursor-pointer"
        >
          Thử lại
        </button>
        {onFallbackToIframe && (
          <button
            type="button"
            onClick={onFallbackToIframe}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium active:scale-95 cursor-pointer"
          >
            Chuyển sang Iframe
          </button>
        )}
      </div>
    </div>
  );
};
