import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Link as LinkIcon,
  Check,
  Loader2,
  AlertCircle,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  Hand,
  Layers,
  Zap,
} from 'lucide-react';
import { PdfNativeCanvasViewer } from './PdfNativeCanvasViewer';
import {
  TouchPinchZoomStage,
  TouchPinchZoomStageHandle,
} from './TouchPinchZoomStage';

export function normalizeImageUrl(
  rawUrl: string | undefined | null,
  size: string = 'w1600'
): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Cloudflare R2 protocol url conversion
  if (trimmed.startsWith('r2://')) {
    return `https://hcm.taka-pm.org/${trimmed.replace('r2://', '')}`;
  }

  // Google Drive URL conversion: convert view/sharing link to high-res thumbnail
  const driveMatch = trimmed.match(
    /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/
  );
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=${size}`;
  }
  const driveIdParam = trimmed.match(
    /drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/
  );
  if (driveIdParam && driveIdParam[1]) {
    return `https://drive.google.com/thumbnail?id=${driveIdParam[1]}&sz=${size}`;
  }

  // Dropbox direct link: www.dropbox.com/... -> dl.dropboxusercontent.com/...
  if (trimmed.includes('dropbox.com') && !trimmed.includes('raw=1')) {
    return trimmed
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '');
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

  // For Google Drive docs:
  // 'pinch' = Full PDF with 60fps iOS 2-finger pinch-to-zoom & pan enabled
  // 'scroll' = Full PDF with native 1-finger page scrolling inside the document
  // 'fast' = Ultra-lightweight HD rasterized sheet (0 iframe overhead, instant load & pinch zoom)
  const [driveTouchMode, setDriveTouchMode] = useState<'pinch' | 'scroll' | 'fast'>('pinch');

  const zoomStageRef = useRef<TouchPinchZoomStageHandle>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const rawUrl = enlargedImage?.url || '';
  const resolvedUrl = normalizeImageUrl(rawUrl, 'w1600');
  const [currentSrc, setCurrentSrc] = useState(resolvedUrl);
  const [hasTriedCdnFallback, setHasTriedCdnFallback] = useState(false);

  const initialZoom =
    enlargedImage?.initialScale && enlargedImage.initialScale > 1
      ? Math.min(6, enlargedImage.initialScale)
      : 1;

  const isDirectPdf = useMemo(() => {
    const u = (rawUrl || resolvedUrl || '').toLowerCase();
    return (
      /\.pdf($|\?|#)/i.test(u) ||
      u.includes('type=pdf') ||
      u.includes('application/pdf')
    );
  }, [rawUrl, resolvedUrl]);

  const isDriveDoc = useMemo(() => {
    const u = (rawUrl || '').toLowerCase();
    return u.includes('drive.google.com') || u.includes('docs.google.com');
  }, [rawUrl]);

  const driveFileId = useMemo(() => {
    const driveMatch =
      rawUrl.match(
        /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i
      ) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    return driveMatch && driveMatch[1] ? driveMatch[1] : null;
  }, [rawUrl]);

  const effectiveEmbedUrl = useMemo(() => {
    if (isDriveDoc && driveFileId) {
      return `https://drive.google.com/file/d/${driveFileId}/preview`;
    }
    return resolvedUrl;
  }, [resolvedUrl, isDriveDoc, driveFileId]);

  const handleImageError = useCallback(() => {
    if (driveFileId && !hasTriedCdnFallback) {
      setHasTriedCdnFallback(true);
      setCurrentSrc(`https://lh3.googleusercontent.com/d/${driveFileId}=w1600`);
      return;
    }
    if (isDriveDoc && driveTouchMode === 'fast') {
      // Fallback seamlessly to full PDF embed if thumbnail endpoint is unavailable
      setDriveTouchMode('pinch');
      setIsLoading(false);
      setImageError(false);
      return;
    }
    setIsLoading(false);
    setImageError(true);
  }, [driveFileId, hasTriedCdnFallback, isDriveDoc, driveTouchMode]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
    if (initialZoom > 1) {
      zoomStageRef.current?.centerView(initialZoom);
    }
  }, [initialZoom]);

  useEffect(() => {
    setCurrentSrc(resolvedUrl);
    setHasTriedCdnFallback(false);
    setImageError(false);
    setZoomScale(initialZoom);
    setDriveTouchMode(initialZoom > 1 ? 'fast' : 'pinch');

    if (!resolvedUrl) {
      setIsLoading(false);
      return;
    }

    if (isDirectPdf || (isDriveDoc && initialZoom <= 1)) {
      setIsLoading(true);
      const timer = setTimeout(() => setIsLoading(false), 900);
      return () => clearTimeout(timer);
    }

    setIsLoading(true);
  }, [resolvedUrl, isDirectPdf, isDriveDoc, initialZoom]);

  // Aggressively release iframe & image memory on close so the app stays feather-light
  const handleSafeClose = useCallback(() => {
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
    onClose();
  }, [onClose]);

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

  const showZoomControls = !isDirectPdf;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-slate-950/98 flex items-center justify-center p-0 sm:p-2 md:p-4 select-none overscroll-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
    >
      {/* Lightbox Card Container */}
      <div
        className={`relative bg-slate-950 overflow-hidden shadow-2xl border border-slate-800 flex flex-col z-[1000000] ${
          isFullDisplay
            ? 'w-full h-full max-w-none max-h-none rounded-none border-none'
            : 'max-w-6xl w-full h-[92vh] rounded-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-800 bg-slate-900 text-white shrink-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate max-w-[160px] sm:max-w-[260px]">
              {enlargedImage.title || 'Document Preview'}
            </span>

            {/* Zoom Controls in Header for iPad / iPhone / Desktop */}
            {showZoomControls && (
              <div className="flex items-center gap-1 ml-1 sm:ml-3 px-1.5 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700">
                <button
                  type="button"
                  onClick={() => zoomStageRef.current?.zoomOut(0.45)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white active:scale-95 touch-manipulation"
                  title="Zoom Out (-)"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <span className="text-[11px] font-mono font-bold px-1 min-w-[2.8rem] text-center text-blue-300">
                  {Math.round(zoomScale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => zoomStageRef.current?.zoomIn(0.45)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-200 hover:text-white active:scale-95 touch-manipulation"
                  title="Zoom In (+)"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => zoomStageRef.current?.resetTransform()}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 hover:text-white active:scale-95 touch-manipulation"
                  title="Reset Zoom (100%)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsFullDisplay(!isFullDisplay)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium active:scale-95 touch-manipulation"
              title={isFullDisplay ? 'Normal View' : 'Full Display'}
            >
              {isFullDisplay ? (
                <Minimize2 className="w-4 h-4 text-blue-400" />
              ) : (
                <Maximize2 className="w-4 h-4 text-blue-400" />
              )}
              <span className="hidden md:inline font-bold">
                {isFullDisplay ? 'Normal View' : 'Full Display'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onCopyLink(rawUrl)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium active:scale-95 touch-manipulation"
              title={copiedLink === rawUrl ? 'Link Copied!' : 'Copy Link'}
            >
              {copiedLink === rawUrl ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="hidden md:inline text-emerald-400 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden md:inline">Copy Link</span>
                </>
              )}
            </button>

            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-blue-400 hover:text-white bg-blue-950/60 hover:bg-blue-600 border border-blue-800 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm active:scale-95 touch-manipulation"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open in New Tab</span>
            </a>

            <button
              type="button"
              onClick={handleSafeClose}
              className="px-2.5 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold active:scale-95 touch-manipulation shadow-sm"
              title="Close (Escape)"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Google Drive Interactive Touch & Mode Bar */}
        {isDriveDoc && (
          <div className="bg-slate-900/95 border-b border-slate-800 px-3 py-1.5 text-xs text-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0 z-30">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setDriveTouchMode('pinch')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation cursor-pointer ${
                  driveTouchMode === 'pinch'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Enable 2-finger pinch zoom & 1-finger pan on iPad/iPhone"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>Finger Pinch Zoom</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  zoomStageRef.current?.resetTransform();
                  setDriveTouchMode('scroll');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation cursor-pointer ${
                  driveTouchMode === 'scroll'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Scroll vertically through multi-page PDF documents"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Scroll PDF Pages</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setImageError(false);
                  setIsLoading(true);
                  setDriveTouchMode('fast');
                }}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation cursor-pointer ${
                  driveTouchMode === 'fast'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
                title="Ultra-lightweight HD sheet mode for instant load & smooth touch zoom"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fast Light HD</span>
              </button>
            </div>

            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white border border-blue-500/30 font-bold rounded-lg text-[11px] flex items-center gap-1 shrink-0 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in Google Drive</span>
            </a>
          </div>
        )}

        {/* Content Body: 60fps Hardware-Accelerated Touch Pinch-Zoom Stage */}
        <div className="flex-1 p-1 sm:p-2 flex items-center justify-center bg-slate-950 overflow-hidden min-h-[300px] relative">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/60 z-20 pointer-events-none">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <span className="text-xs font-medium">Loading document...</span>
            </div>
          )}

          {imageError ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">
                  Cannot display content directly
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This document may require Google account access permissions or restricts embedding.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Link in New Tab</span>
                </a>
              </div>
            </div>
          ) : isDriveDoc && driveTouchMode !== 'fast' ? (
            <TouchPinchZoomStage
              ref={zoomStageRef}
              initialScale={initialZoom}
              minScale={0.5}
              maxScale={8}
              onScaleChange={setZoomScale}
              captureOverlay={driveTouchMode === 'pinch'}
              allowNativeTouch={driveTouchMode === 'scroll'}
              className="w-full h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900"
            >
              <iframe
                ref={iframeRef}
                src={effectiveEmbedUrl}
                onLoad={() => setIsLoading(false)}
                className="w-full h-full border-0 bg-white"
                title={enlargedImage.title || 'Google Drive Document'}
                allow="autoplay"
              />
            </TouchPinchZoomStage>
          ) : isDirectPdf ? (
            <div className="w-full h-full flex flex-col relative rounded-xl overflow-hidden border border-slate-800">
              <PdfNativeCanvasViewer url={rawUrl} isFullscreen={true} />
            </div>
          ) : (
            <TouchPinchZoomStage
              ref={zoomStageRef}
              initialScale={initialZoom}
              minScale={0.5}
              maxScale={10}
              onScaleChange={setZoomScale}
            >
              <img
                ref={imgRef}
                src={currentSrc}
                alt={enlargedImage.title || 'Enlarged Preview'}
                decoding="async"
                onLoad={handleImageLoad}
                onError={handleImageError}
                className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
                draggable={false}
              />
            </TouchPinchZoomStage>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0 text-xs z-30">
          <div className="flex items-center gap-2 min-w-0">
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 font-mono text-[11px] truncate"
            >
              {rawUrl}
            </a>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-[11px] text-slate-400">
              Pinch with 2 fingers to zoom • Drag to pan • Double-tap to zoom
            </span>
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-slate-300 hover:text-white shrink-0 text-[11px] font-medium"
            >
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
