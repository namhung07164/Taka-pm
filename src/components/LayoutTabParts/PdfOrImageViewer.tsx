import React, { useState } from 'react';
import { ZoomIn, ZoomOut, Maximize, Maximize2, ExternalLink, FileText, AlertCircle, RefreshCw } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { PdfNativeCanvasViewer } from './PdfNativeCanvasViewer';

export interface PdfOrImageViewerProps {
  url: string;
  getCleanUrl?: (u: string | undefined | null) => string | undefined;
  fallbackSvg?: string;
  cacheBuster?: number;
  isAdmin?: boolean;
  onOpenFullscreen?: () => void;
  isFullscreen?: boolean;
  className?: string;
  alt?: string;
}

export function isPdfOrDocUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (/\.pdf($|\?|#)/i.test(lower)) return true;
  if (lower.includes('type=pdf') || lower.includes('format=pdf') || lower.includes('application/pdf')) return true;
  if (lower.includes('drive.google.com') && !lower.includes('thumbnail')) return true;
  if (lower.includes('docs.google.com')) return true;
  return false;
}

export function resolvePdfIframeUrl(url: string, useGdocsFallback: boolean = false): string {
  if (!url) return '';
  const driveMatch =
    url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  if (url.includes('docs.google.com')) {
    return url;
  }
  if (useGdocsFallback) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }
  return url;
}

export const PdfOrImageViewer: React.FC<PdfOrImageViewerProps> = ({
  url,
  getCleanUrl = (u) => u || undefined,
  fallbackSvg = '',
  cacheBuster = 0,
  onOpenFullscreen,
  isFullscreen = false,
  className = '',
  alt = 'Layout Preview',
}) => {
  const [hasPdfError, setHasPdfError] = useState(false);
  const [useGdocsFallback, setUseGdocsFallback] = useState(false);
  const [useIframeFallback, setUseIframeFallback] = useState(false);

  const cleanUrl = getCleanUrl(url) || url;
  const isPdf = isPdfOrDocUrl(cleanUrl);

  if (!url) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 ${className}`}>
        <FileText className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">No document or layout available</p>
      </div>
    );
  }

  // PDF or Google Drive / Docs document mode
  if (isPdf) {
    if (!useIframeFallback) {
      return (
        <PdfNativeCanvasViewer
          url={cleanUrl}
          isFullscreen={isFullscreen}
          onOpenFullscreen={onOpenFullscreen}
          className={className}
          onFallbackToIframe={() => setUseIframeFallback(true)}
        />
      );
    }

    const iframeSrc = resolvePdfIframeUrl(cleanUrl, useGdocsFallback);

    return (
      <div className={`w-full h-full relative flex flex-col bg-slate-900 ${className}`}>
        {/* Floating action controls */}
        <div className="absolute top-4 right-4 z-[50] flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1 border border-slate-700 shadow-md rounded-xl">
          <button
            type="button"
            onClick={() => setUseIframeFallback(false)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation flex items-center gap-1 text-xs"
            title="Switch to Native Canvas Viewer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline font-medium text-[11px]">Native Mode</span>
          </button>

          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation flex items-center gap-1 text-xs"
            title="Open in new window"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="hidden sm:inline font-medium text-[11px]">Open File</span>
          </a>

          {!useGdocsFallback && cleanUrl.startsWith('http') && !cleanUrl.includes('drive.google.com') && (
            <button
              type="button"
              onClick={() => setUseGdocsFallback(true)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation text-xs flex items-center gap-1"
              title="Use Google Docs Preview Mode"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-medium text-[11px]">GDocs Mode</span>
            </button>
          )}

          {onOpenFullscreen && !isFullscreen && (
            <button
              type="button"
              onClick={onOpenFullscreen}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 touch-manipulation"
              title="Fullscreen"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {hasPdfError ? (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-slate-300 text-center">
            <AlertCircle className="w-12 h-12 text-amber-400 mb-3" />
            <p className="text-base font-semibold">Cannot embed this PDF document directly</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md">
              The external host may restrict embedding. You can view or download the file directly in a new window.
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-4 h-4" />
                Open PDF in New Window
              </a>
              {!useGdocsFallback && (
                <button
                  type="button"
                  onClick={() => {
                    setUseGdocsFallback(true);
                    setHasPdfError(false);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
                >
                  Try GDocs Embed
                </button>
              )}
            </div>
          </div>
        ) : (
          <iframe
            key={`${cacheBuster}_${iframeSrc}`}
            src={iframeSrc}
            width="100%"
            height="100%"
            style={{ width: '100%', height: '100%', minHeight: isFullscreen ? '100vh' : '600px', border: 'none' }}
            allow="autoplay; fullscreen"
            title="PDF or Document Viewer"
            onError={() => setHasPdfError(true)}
          />
        )}
      </div>
    );
  }

  // Image mode with interactive zoom and pan
  return (
    <div className={`w-full h-full relative flex-grow flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950 ${className}`}>
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={12}
        centerOnInit={true}
        smooth={false}
        wheel={{ step: 0.25 }}
        zoomAnimation={{ disabled: true }}
        pinch={{ step: 12 }}
        panning={{ disabled: false }}
        doubleClick={{
          mode: 'toggle',
          step: 2.2,
        }}
      >
        {({ zoomIn, zoomOut, resetTransform, state }) => (
          <>
            <div className="absolute top-4 right-4 z-[50] flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
              <button
                type="button"
                onClick={() => zoomIn(0.5)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => zoomOut(0.5)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700">
                {Math.round((state.scale || 1) * 100)}%
              </span>
              <button
                type="button"
                onClick={() => resetTransform()}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Reset"
              >
                <Maximize className="w-4 h-4" />
              </button>
              {onOpenFullscreen && !isFullscreen && (
                <button
                  type="button"
                  onClick={onOpenFullscreen}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{
                width: '100%',
                height: '100%',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '1rem',
              }}
            >
              <img
                src={cleanUrl}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-full object-contain shadow-lg rounded-lg border border-slate-200 bg-white cursor-grab active:cursor-grabbing"
                onError={(e) => {
                  if (fallbackSvg) {
                    (e.target as HTMLImageElement).src = fallbackSvg;
                  }
                }}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};

export default PdfOrImageViewer;
