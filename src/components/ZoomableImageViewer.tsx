import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Maximize2,
  FileText,
  RefreshCw,
  Hand,
  Layers,
} from 'lucide-react';
import { normalizeImageUrl } from './LayoutTabParts/LayoutUnitLightboxModal';
import { PdfNativeCanvasViewer } from './LayoutTabParts/PdfNativeCanvasViewer';
import {
  TouchPinchZoomStage,
  TouchPinchZoomStageHandle,
} from './LayoutTabParts/TouchPinchZoomStage';
import { useAppStore } from '../store/useAppStore';

export interface ZoomableImageViewerProps {
  isOpen?: boolean;
  onClose?: () => void;
  imageUrl?: string;
  url?: string;
  src?: string;
  title?: string;
  alt?: string;
  image?: { url: string; title?: string; initialScale?: number } | null;
  initialScale?: number;
}

export function isPdfUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (/\.pdf($|\?|#)/i.test(lower)) return true;
  if (
    lower.includes('type=pdf') ||
    lower.includes('format=pdf') ||
    lower.includes('application/pdf')
  )
    return true;
  if (lower.includes('drive.google.com') && !lower.includes('thumbnail'))
    return true;
  if (lower.includes('docs.google.com')) return true;
  return false;
}

function getPdfIframeUrl(url: string, useGdocsViewer: boolean): string {
  if (!url) return '';
  const driveMatch =
    url.match(
      /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i
    ) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  if (url.includes('docs.google.com')) {
    return url;
  }
  if (useGdocsViewer) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }
  return url;
}

export const ZoomableImageViewer: React.FC<ZoomableImageViewerProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
  imageUrl: propImageUrl,
  url: propUrl,
  src: propSrc,
  title: propTitle,
  alt: propAlt,
  image: propImage,
  initialScale: propInitialScale,
}) => {
  const storeZoomableImageSrc = useAppStore((state) => state.zoomableImageSrc);
  const setStoreZoomableImageSrc = useAppStore(
    (state) => state.setZoomableImageSrc
  );

  const [eventState, setEventState] = useState<{
    isOpen: boolean;
    url: string;
    title?: string;
    initialScale?: number;
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useGdocsFallback, setUseGdocsFallback] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [touchZoomMode, setTouchZoomMode] = useState<'pinch' | 'scroll'>('pinch');

  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{
        url?: string;
        imageUrl?: string;
        src?: string;
        title?: string;
        initialScale?: number;
      }>;
      const detail = customEvent.detail;
      if (detail) {
        const rawUrl = detail.url || detail.imageUrl || detail.src || '';
        if (rawUrl) {
          setEventState({
            isOpen: true,
            url: rawUrl,
            title: detail.title || '',
            initialScale: detail.initialScale,
          });
        }
      }
    };

    window.addEventListener('taka_open_image_viewer', handleOpenEvent);
    return () => {
      window.removeEventListener('taka_open_image_viewer', handleOpenEvent);
    };
  }, []);

  const isControlled = propIsOpen !== undefined;
  const isVisible = isControlled
    ? propIsOpen
    : eventState.isOpen || Boolean(storeZoomableImageSrc);

  const rawTargetUrl = isControlled
    ? propImageUrl || propUrl || propSrc || propImage?.url || ''
    : storeZoomableImageSrc || eventState.url;

  const activeTitle =
    (isControlled ? propTitle || propAlt || propImage?.title : eventState.title) ||
    (isPdfUrl(rawTargetUrl) ? 'PDF Document Viewer' : 'Image Viewer');

  const effectiveInitialScale =
    (isControlled
      ? propInitialScale || propImage?.initialScale
      : eventState.initialScale) || 1;

  const isPdf = isPdfUrl(rawTargetUrl);
  const isDriveOrDocs =
    rawTargetUrl.toLowerCase().includes('drive.google.com') ||
    rawTargetUrl.toLowerCase().includes('docs.google.com');

  const resolvedUrl = normalizeImageUrl(rawTargetUrl, 'w1600');
  const [currentSrc, setCurrentSrc] = useState(resolvedUrl);
  const [hasTriedCdnFallback, setHasTriedCdnFallback] = useState(false);

  const handleClose = useCallback(() => {
    if (iframeRef.current) {
      try {
        iframeRef.current.src = 'about:blank';
      } catch {}
    }
    if (imgRef.current) {
      try {
        imgRef.current.src = '';
      } catch {}
    }
    if (isControlled) {
      propOnClose?.();
    } else {
      setEventState((prev) => ({ ...prev, isOpen: false }));
      setStoreZoomableImageSrc(null);
    }
  }, [isControlled, propOnClose, setStoreZoomableImageSrc]);

  const handleImageError = useCallback(() => {
    const driveMatch =
      rawTargetUrl.match(
        /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/
      ) || rawTargetUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1] && !hasTriedCdnFallback) {
      setHasTriedCdnFallback(true);
      setCurrentSrc(`https://lh3.googleusercontent.com/d/${driveMatch[1]}=w1600`);
      return;
    }
    setIsLoading(false);
    setHasError(true);
  }, [rawTargetUrl, hasTriedCdnFallback]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    if (effectiveInitialScale > 1) {
      zoomStageRef.current?.centerView(effectiveInitialScale);
    }
  }, [effectiveInitialScale]);

  useEffect(() => {
    if (!isVisible) return;
    setCurrentSrc(resolvedUrl);
    setHasTriedCdnFallback(false);
    setHasError(false);
    setUseGdocsFallback(false);
    setZoomScale(effectiveInitialScale);
    setTouchZoomMode('pinch');

    if (!resolvedUrl) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
  }, [isVisible, resolvedUrl, effectiveInitialScale]);

  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isVisible, handleClose]);

  const handleCopy = () => {
    if (!rawTargetUrl) return;
    navigator.clipboard?.writeText(rawTargetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isVisible || typeof document === 'undefined') return null;

  const useEmbedViewer = isPdf && (isDriveOrDocs || useGdocsFallback);
  const iframeSrc = useEmbedViewer
    ? getPdfIframeUrl(rawTargetUrl, useGdocsFallback)
    : '';

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] flex flex-col bg-slate-950/98 select-none overscroll-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Top Floating Header & Controls */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-white z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 max-w-[45%] min-w-0">
          {isPdf ? (
            <FileText className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Maximize2 className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span
            className="text-sm font-semibold truncate text-slate-100"
            title={activeTitle}
          >
            {activeTitle}
          </span>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {(!isPdf || useEmbedViewer) && (
            <>
              <button
                type="button"
                onClick={() => zoomStageRef.current?.zoomOut(0.45)}
                title="Zoom Out (-)"
                className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
              >
                <ZoomOut className="w-4 h-4" />
              </button>

              <span className="px-2 py-0.5 text-xs font-mono font-bold text-blue-300 bg-slate-800 rounded border border-slate-700 min-w-[3.2rem] text-center">
                {Math.round(zoomScale * 100)}%
              </span>

              <button
                type="button"
                onClick={() => zoomStageRef.current?.zoomIn(0.45)}
                title="Zoom In (+)"
                className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => zoomStageRef.current?.resetTransform()}
                title="Reset Zoom (1:1)"
                className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </>
          )}

          {useEmbedViewer && (
            <button
              type="button"
              onClick={() => {
                if (touchZoomMode === 'pinch') {
                  zoomStageRef.current?.resetTransform();
                  setTouchZoomMode('scroll');
                } else {
                  setTouchZoomMode('pinch');
                }
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors active:scale-95 touch-manipulation flex items-center gap-1.5 ${
                touchZoomMode === 'pinch'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
              title="Toggle between Finger Pinch Zoom and Page Scroll"
            >
              {touchZoomMode === 'pinch' ? (
                <>
                  <Hand className="w-3.5 h-3.5" />
                  <span>Pinch Zoom</span>
                </>
              ) : (
                <>
                  <Layers className="w-3.5 h-3.5" />
                  <span>Scroll Pages</span>
                </>
              )}
            </button>
          )}

          {isPdf && !isDriveOrDocs && (
            <button
              type="button"
              onClick={() => setUseGdocsFallback((prev) => !prev)}
              title={
                useGdocsFallback
                  ? 'Switch to Native Canvas'
                  : 'Switch to Google Docs Viewer'
              }
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 hover:text-white transition-colors active:scale-95 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">
                {useGdocsFallback ? 'Native Canvas' : 'Embed Viewer'}
              </span>
            </button>
          )}

          {rawTargetUrl && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Direct Link"
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-400" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}

          {rawTargetUrl && (
            <a
              href={rawTargetUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in New Tab"
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <div className="w-[1px] h-5 bg-slate-700 mx-1" />

          <button
            type="button"
            onClick={handleClose}
            title="Close (Esc)"
            className="p-1.5 sm:p-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors active:scale-95 touch-manipulation font-bold flex items-center gap-1 shadow-sm"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline text-xs font-semibold">Close</span>
          </button>
        </div>
      </div>

      {/* Main Container Stage */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center p-1 sm:p-2">
        {isPdf ? (
          useEmbedViewer ? (
            <TouchPinchZoomStage
              ref={zoomStageRef}
              initialScale={effectiveInitialScale}
              minScale={0.5}
              maxScale={8}
              onScaleChange={setZoomScale}
              captureOverlay={touchZoomMode === 'pinch'}
              allowNativeTouch={touchZoomMode === 'scroll'}
              className="w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900"
            >
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                onLoad={() => setIsLoading(false)}
                className="w-full h-full border-0 bg-white"
                title={activeTitle}
                allow="autoplay; fullscreen"
              />
            </TouchPinchZoomStage>
          ) : (
            <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
              <PdfNativeCanvasViewer
                url={rawTargetUrl}
                isFullscreen={true}
                onFallbackToIframe={() => setUseGdocsFallback(true)}
              />
            </div>
          )
        ) : (
          <>
            {isLoading && !hasError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 pointer-events-none z-10">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-xs font-medium">Loading image...</span>
              </div>
            )}

            {hasError ? (
              <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md mx-auto">
                <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-200">
                  Unable to load image directly
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  The file could not be rendered inline due to network or security restrictions. You can open or copy the direct link.
                </p>
                {rawTargetUrl && (
                  <a
                    href={rawTargetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors mt-2 shadow"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Original File Link
                  </a>
                )}
              </div>
            ) : (
              <TouchPinchZoomStage
                ref={zoomStageRef}
                initialScale={effectiveInitialScale}
                minScale={0.5}
                maxScale={10}
                onScaleChange={setZoomScale}
              >
                <img
                  ref={imgRef}
                  src={currentSrc}
                  alt={activeTitle}
                  decoding="async"
                  className="max-w-[95vw] max-h-[85vh] object-contain"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  draggable={false}
                />
              </TouchPinchZoomStage>
            )}
          </>
        )}
      </div>

      {/* Bottom Hint Footer */}
      <div
        className="px-4 py-2 bg-slate-900 border-t border-slate-800 text-center text-[11px] text-slate-400 shrink-0 z-20 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          Pinch with 2 fingers to zoom • Drag to pan • Double-tap to toggle zoom
        </span>
        <button
          type="button"
          onClick={handleClose}
          className="text-xs text-slate-300 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700"
        >
          ESC to exit
        </button>
      </div>
    </div>,
    document.body
  );
};

export default ZoomableImageViewer;
