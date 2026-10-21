import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Copy, ExternalLink, Image as ImageIcon, Link as LinkIcon, Check,
  Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  RefreshCw, Hand, Layers,
} from 'lucide-react';
import { PdfNativeCanvasViewer } from './PdfNativeCanvasViewer';
import { TouchPinchZoomStage, TouchPinchZoomStageHandle } from './TouchPinchZoomStage';
import { LightboxZoomDock } from './LightboxZoomDock';
import { LightboxIframeViewer } from './LightboxIframeViewer';

export function normalizeImageUrl(rawUrl: string | undefined | null, size: string = 'w1600'): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('r2://')) return `https://hcm.taka-pm.org/${trimmed.replace('r2://', '')}`;

  const driveMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch?.[1]) return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=${size}`;

  const driveIdParam = trimmed.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdParam?.[1]) return `https://drive.google.com/thumbnail?id=${driveIdParam[1]}&sz=${size}`;

  if (trimmed.includes('dropbox.com') && !trimmed.includes('raw=1')) {
    return trimmed.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '');
  }
  return trimmed;
}

interface LayoutUnitLightboxModalProps {
  enlargedImage: { url: string; title?: string; initialScale?: number } | null;
  onClose: () => void;
  onCopyLink: (url: string) => void;
  copiedLink: string | null;
}

export function LayoutUnitLightboxModal({
  enlargedImage,
  onClose,
  onCopyLink,
  copiedLink,
}: LayoutUnitLightboxModalProps) {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFullDisplay, setIsFullDisplay] = useState(true);
  const [zoomScale, setZoomScale] = useState(1);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const [touchZoomMode, setTouchZoomMode] = useState<'pinch' | 'scroll'>('pinch');
  const [modeToast, setModeToast] = useState<string | null>(null);

  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const rawUrl = enlargedImage?.url || '';
  const resolvedUrl = useMemo(() => normalizeImageUrl(rawUrl, 'w1600'), [rawUrl]);
  const lowResPlaceholderUrl = useMemo(() => normalizeImageUrl(rawUrl, 'w400'), [rawUrl]);
  const [currentSrc, setCurrentSrc] = useState(resolvedUrl);
  const [hasTriedCdnFallback, setHasTriedCdnFallback] = useState(false);
  const [hasTriedProxyFallback, setHasTriedProxyFallback] = useState(false);

  const initialZoom =
    enlargedImage?.initialScale && enlargedImage.initialScale > 1 ? Math.min(6, enlargedImage.initialScale) : 1;

  const isDirectPdf = useMemo(() => {
    const u = (rawUrl || '').toLowerCase();
    if (u.includes('drive.google.com') || u.includes('docs.google.com')) return false;
    return /\.pdf($|\?|#)/i.test(u) || u.includes('type=pdf') || u.includes('application/pdf');
  }, [rawUrl]);

  const isDriveDoc = useMemo(() => {
    const u = (rawUrl || '').toLowerCase();
    return u.includes('drive.google.com') || u.includes('docs.google.com');
  }, [rawUrl]);

  const driveFileId = useMemo(() => {
    const m =
      rawUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i) ||
      rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    return m?.[1] || null;
  }, [rawUrl]);

  const isPdf = isDirectPdf || isDriveDoc;

  const effectivePdfSourceUrl = useMemo(() => {
    if (isDriveDoc && driveFileId) {
      return `/api/drive-pdf?id=${driveFileId}`;
    }
    return resolvedUrl || rawUrl;
  }, [isDriveDoc, driveFileId, resolvedUrl, rawUrl]);

  const effectiveEmbedUrl = useMemo(() => {
    if (isDriveDoc && driveFileId) {
      return `https://drive.google.com/file/d/${driveFileId}/preview?rm=minimal`;
    }
    const clean = resolvedUrl || rawUrl;
    if (isDirectPdf && clean && /^https?:\/\//i.test(clean)) {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(clean)}&embedded=true`;
    }
    return clean;
  }, [isDriveDoc, driveFileId, isDirectPdf, resolvedUrl, rawUrl]);

  const releaseIframeMemory = useCallback(() => {
    if (iframeRef.current) {
      try { iframeRef.current.src = 'about:blank'; } catch {}
    }
  }, []);

  const handleFallbackToIframe = useCallback(() => {
    setUseIframeFallback(true);
  }, []);

  const handleToggleTouchZoomMode = useCallback(() => {
    setTouchZoomMode((prev) => {
      const next = prev === 'pinch' ? 'scroll' : 'pinch';
      if (next === 'scroll') {
        zoomStageRef.current?.resetTransform();
      }
      setModeToast(
        next === 'pinch'
          ? 'Pinch Zoom Active • 2-finger pinch & 1-finger pan'
          : 'Scroll Mode Active • Direct document scrolling'
      );
      return next;
    });
  }, []);

  const handleImageError = useCallback(() => {
    if (driveFileId && !hasTriedCdnFallback) {
      setHasTriedCdnFallback(true);
      setCurrentSrc(`/api/drive-thumb?id=${driveFileId}&sz=w1600`);
      return;
    }
    if (!driveFileId && !hasTriedProxyFallback && /^https?:\/\//i.test(resolvedUrl)) {
      setHasTriedProxyFallback(true);
      setCurrentSrc(`/api/pdf-proxy?url=${encodeURIComponent(resolvedUrl)}`);
      return;
    }
    setIsLoading(false);
    setImageError(true);
  }, [driveFileId, hasTriedCdnFallback, hasTriedProxyFallback, resolvedUrl]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
    if (initialZoom > 1) zoomStageRef.current?.centerView(initialZoom);
  }, [initialZoom]);

  useEffect(() => {
    setUseIframeFallback(false);
    setHasTriedCdnFallback(false);
    setHasTriedProxyFallback(false);
    setImageError(false);
    setIsLoading(Boolean(resolvedUrl && !isPdf));
    setZoomScale(initialZoom);
    setCurrentSrc(resolvedUrl);
    setTouchZoomMode('pinch');
    setModeToast(null);
  }, [rawUrl, resolvedUrl, initialZoom, isPdf]);

  useEffect(() => {
    if (!modeToast) return;
    const t = setTimeout(() => setModeToast(null), 2500);
    return () => clearTimeout(t);
  }, [modeToast]);

  // Lock background scroll when open
  useEffect(() => {
    if (!enlargedImage) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    const konvaContents = Array.from(document.querySelectorAll('.konvajs-content')) as HTMLElement[];
    konvaContents.forEach((el) => { el.style.visibility = 'hidden'; });

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
      konvaContents.forEach((el) => { el.style.visibility = ''; });
    };
  }, [enlargedImage]);

  const handleSafeClose = useCallback(() => {
    releaseIframeMemory();
    if (imgRef.current) {
      try { imgRef.current.src = ''; } catch {}
    }
    onClose();
  }, [onClose, releaseIframeMemory]);

  useEffect(() => {
    if (!enlargedImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleSafeClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [enlargedImage, handleSafeClose]);

  if (!enlargedImage || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-slate-950/98 flex items-center justify-center p-0 sm:p-2 md:p-4 select-none"
      style={{ overscrollBehavior: 'none' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
    >
      <div
        className={`relative bg-slate-950 overflow-hidden shadow-2xl border border-slate-800 flex flex-col z-[1000000] ${
          isFullDisplay ? 'w-full h-full max-w-none max-h-none rounded-none border-none' : 'max-w-6xl w-full h-[92vh] rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900 text-white shrink-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate max-w-[160px] sm:max-w-[280px]">
              {enlargedImage.title || (isPdf ? 'PDF Blueprint Viewer' : 'Image Preview')}
            </span>

            {/* Zoom controls for raster images and Google Drive / iframe PDF viewer */}
            {(!isPdf || useIframeFallback) && (
              <div className="flex items-center gap-1 ml-1 sm:ml-3 px-1.5 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    if (useIframeFallback && touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    zoomStageRef.current?.zoomOut(0.35);
                  }}
                  className="p-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white active:scale-95 touch-manipulation cursor-pointer"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (useIframeFallback && touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    const currentPct = Math.round(zoomScale * 100);
                    const next = currentPct < 125 ? 1.5 : currentPct < 175 ? 2.0 : currentPct < 250 ? 3.0 : 1.0;
                    zoomStageRef.current?.centerView(next);
                  }}
                  className="text-[11px] font-mono font-bold px-1 min-w-[2.8rem] text-center text-blue-300 hover:text-blue-200 hover:underline cursor-pointer"
                  title="Click to cycle zoom: 100% → 150% → 200% → 300%"
                >
                  {Math.round(zoomScale * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (useIframeFallback && touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    zoomStageRef.current?.zoomIn(0.35);
                  }}
                  className="p-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white active:scale-95 touch-manipulation cursor-pointer"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => zoomStageRef.current?.resetTransform()}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white active:scale-95 touch-manipulation cursor-pointer"
                  title="Reset Zoom (100%)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {useIframeFallback && (
                  <button
                    type="button"
                    onClick={handleToggleTouchZoomMode}
                    className={`hidden sm:flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded text-[11px] font-semibold transition-colors active:scale-95 cursor-pointer ${
                      touchZoomMode === 'pinch'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                    title={touchZoomMode === 'pinch' ? 'Switch to Scroll Mode' : 'Switch to Pinch & Pan Mode'}
                  >
                    {touchZoomMode === 'pinch' ? (
                      <><Hand className="w-3 h-3 text-blue-200" /><span>Pinch</span></>
                    ) : (
                      <><Layers className="w-3 h-3 text-slate-300" /><span>Scroll</span></>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {useIframeFallback && (
              <button
                type="button"
                onClick={() => setUseIframeFallback(false)}
                className="px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                title="Switch back to Native Canvas Viewer"
              >
                <RefreshCw className="w-3 h-3" />
                <span className="hidden sm:inline">Try Native Canvas</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsFullDisplay(!isFullDisplay)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium active:scale-95 touch-manipulation"
              title={isFullDisplay ? 'Normal View' : 'Full Display'}
            >
              {isFullDisplay ? <Minimize2 className="w-4 h-4 text-blue-400" /> : <Maximize2 className="w-4 h-4 text-blue-400" />}
              <span className="hidden md:inline font-bold">{isFullDisplay ? 'Normal View' : 'Full Display'}</span>
            </button>

            <button
              type="button"
              onClick={() => onCopyLink(rawUrl)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium active:scale-95 touch-manipulation"
              title={copiedLink === rawUrl ? 'Link Copied!' : 'Copy Link'}
            >
              {copiedLink === rawUrl ? (
                <><Check className="w-4 h-4 text-emerald-400" /><span className="hidden md:inline text-emerald-400 font-bold">Copied</span></>
              ) : (
                <><Copy className="w-4 h-4" /><span className="hidden md:inline">Copy Link</span></>
              )}
            </button>

            <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 sm:px-2.5 sm:py-1.5 text-blue-400 hover:text-white bg-blue-950/60 hover:bg-blue-600 border border-blue-800 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95 touch-manipulation" title="Open in new tab">
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open in New Tab</span>
            </a>

            <button type="button" onClick={handleSafeClose} className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold active:scale-95 touch-manipulation shadow-sm" title="Close (Escape)">
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Content Body: Unified Viewer for Google Drive and R2 Cloud */}
        <div className="flex-1 w-full h-full flex items-center justify-center bg-slate-950 overflow-hidden relative">
          {/* Floating Mode Switch Toast Notification */}
          {modeToast && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-slate-900/95 border border-blue-500/60 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 pointer-events-none transition-all">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>{modeToast}</span>
            </div>
          )}

          {isPdf ? (
            useIframeFallback ? (
              <>
                <LightboxIframeViewer
                  embedUrl={effectiveEmbedUrl}
                  title={enlargedImage.title || 'Document Embed Viewer'}
                  touchZoomMode={touchZoomMode}
                  zoomScale={zoomScale}
                  onScaleChange={setZoomScale}
                  zoomStageRef={zoomStageRef}
                  iframeRef={iframeRef}
                />

                <LightboxZoomDock
                  zoomScale={zoomScale}
                  onZoomIn={() => {
                    if (touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    zoomStageRef.current?.zoomIn(0.35);
                  }}
                  onZoomOut={() => {
                    if (touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    zoomStageRef.current?.zoomOut(0.35);
                  }}
                  onResetZoom={() => zoomStageRef.current?.resetTransform()}
                  onSetScale={(s) => {
                    if (touchZoomMode === 'scroll') setTouchZoomMode('pinch');
                    zoomStageRef.current?.centerView(s);
                  }}
                  touchZoomMode={touchZoomMode}
                  onToggleTouchZoomMode={handleToggleTouchZoomMode}
                  onScrollUp={() => {
                    try {
                      iframeRef.current?.contentWindow?.scrollBy({ top: -450, behavior: 'smooth' });
                    } catch {}
                  }}
                  onScrollDown={() => {
                    try {
                      iframeRef.current?.contentWindow?.scrollBy({ top: 450, behavior: 'smooth' });
                    } catch {}
                  }}
                  onScrollToTop={() => {
                    try {
                      iframeRef.current?.contentWindow?.scrollTo({ top: 0, behavior: 'smooth' });
                    } catch {}
                  }}
                  isIframeMode={true}
                />
              </>
            ) : (
              <div className="w-full h-full flex flex-col relative rounded-xl overflow-hidden border border-slate-800">
                <PdfNativeCanvasViewer
                  url={effectivePdfSourceUrl}
                  isFullscreen={isFullDisplay}
                  onFallbackToIframe={handleFallbackToIframe}
                />
              </div>
            )
          ) : (
            <TouchPinchZoomStage
              ref={zoomStageRef}
              initialScale={initialZoom}
              minScale={0.5}
              maxScale={10}
              onScaleChange={setZoomScale}
              className="w-full h-full flex items-center justify-center p-2"
            >
              {isLoading && !imageError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/60 z-20 pointer-events-none">
                  {lowResPlaceholderUrl && (
                    <img
                      src={lowResPlaceholderUrl}
                      alt=""
                      className="max-w-full max-h-[85vh] object-contain rounded-lg opacity-55 blur-[1px]"
                    />
                  )}
                  <div className="absolute flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 shadow-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                    <span className="text-xs font-medium text-slate-200">Loading HD image...</span>
                  </div>
                </div>
              )}
              {imageError ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
                  <AlertCircle className="w-10 h-10 text-amber-400" />
                  <h4 className="text-sm font-bold text-white">Cannot display image directly</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    The external host restricts inline display. You can open the file link in a new tab.
                  </p>
                  <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95">
                    <ExternalLink className="w-4 h-4" />
                    <span>Open in New Tab</span>
                  </a>
                </div>
              ) : (
                <img
                  ref={imgRef}
                  src={currentSrc}
                  alt={enlargedImage.title || 'Enlarged Preview'}
                  decoding="async"
                  fetchPriority="high"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  className="max-w-full max-h-[85vh] object-contain rounded-lg select-none shadow-2xl"
                  draggable={false}
                />
              )}
            </TouchPinchZoomStage>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0 text-xs z-30">
          <div className="flex items-center gap-2 min-w-0">
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 font-mono text-[11px] truncate">
              {rawUrl}
            </a>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-[11px] text-slate-400">Pinch with 2 fingers to zoom • Drag to pan • Double-tap to zoom</span>
            <a href={rawUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-slate-300 hover:text-white shrink-0 text-[11px] font-medium">
              <span>Open Link</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LayoutUnitLightboxModal;
