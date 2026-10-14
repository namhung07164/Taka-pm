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
  Minimize2
} from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { PdfNativeCanvasViewer } from './PdfNativeCanvasViewer';

export function normalizeImageUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  // Cloudflare R2 protocol url conversion
  if (trimmed.startsWith('r2://')) {
    return `https://hcm.taka-pm.org/${trimmed.replace('r2://', '')}`;
  }

  // Google Drive URL conversion: convert view/sharing link to high-res thumbnail
  const driveMatch = trimmed.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1600`;
  }
  const driveIdParam = trimmed.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveIdParam && driveIdParam[1]) {
    return `https://drive.google.com/thumbnail?id=${driveIdParam[1]}&sz=w1600`;
  }

  // Dropbox direct link: www.dropbox.com/... -> dl.dropboxusercontent.com/...
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
  const [isFullDisplay, setIsFullDisplay] = useState(true); // Default to full display for maximum view area

  const transformRef = useRef<any>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const rawUrl = enlargedImage?.url || '';
  const resolvedUrl = normalizeImageUrl(rawUrl);
  const [currentSrc, setCurrentSrc] = useState(resolvedUrl);
  const [hasTriedCdnFallback, setHasTriedCdnFallback] = useState(false);

  const initialZoom = enlargedImage?.initialScale && enlargedImage.initialScale > 1
    ? Math.min(6, enlargedImage.initialScale)
    : 1;

  const [pdfPage, setPdfPage] = useState(1);

  const isDirectPdf = useMemo(() => {
    const u = (rawUrl || resolvedUrl || '').toLowerCase();
    return /\.pdf($|\?|#)/i.test(u) || u.includes('type=pdf') || u.includes('application/pdf');
  }, [rawUrl, resolvedUrl]);

  const isDriveDoc = useMemo(() => {
    const u = (rawUrl || '').toLowerCase();
    return u.includes('drive.google.com') || u.includes('docs.google.com');
  }, [rawUrl]);

  const driveFileId = useMemo(() => {
    const driveMatch =
      rawUrl.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/i) ||
      rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
    return driveMatch && driveMatch[1] ? driveMatch[1] : null;
  }, [rawUrl]);

  const effectiveUrl = useMemo(() => {
    if (isDriveDoc && driveFileId) {
      return `https://drive.google.com/file/d/${driveFileId}/preview`;
    }
    if (isDirectPdf && resolvedUrl) {
      const baseUrl = resolvedUrl.split('#')[0];
      return `${baseUrl}#page=${pdfPage}`;
    }
    return resolvedUrl;
  }, [rawUrl, resolvedUrl, isDirectPdf, isDriveDoc, driveFileId, pdfPage]);

  const handleImageError = useCallback(() => {
    if (driveFileId && !hasTriedCdnFallback) {
      setHasTriedCdnFallback(true);
      setCurrentSrc(`https://lh3.googleusercontent.com/d/${driveFileId}`);
      return;
    }
    setIsLoading(false);
    setImageError(true);
  }, [driveFileId, hasTriedCdnFallback]);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setImageError(false);
    if (initialZoom > 1) {
      try {
        transformRef.current?.centerView(initialZoom);
      } catch {}
    }
  }, [initialZoom]);

  useEffect(() => {
    setCurrentSrc(resolvedUrl);
    setHasTriedCdnFallback(false);
    setImageError(false);

    if (!resolvedUrl) {
      setIsLoading(false);
      return;
    }

    if (isDirectPdf || isDriveDoc) {
      setIsLoading(false);
      return;
    }

    const testImg = new Image();
    testImg.src = resolvedUrl;
    if (testImg.complete && testImg.naturalWidth > 0) {
      setIsLoading(false);
      setImageError(false);
    } else {
      setIsLoading(true);
    }
  }, [resolvedUrl, isDirectPdf, isDriveDoc]);

  const handleSafeClose = useCallback(() => {
    if (iframeRef.current) {
      try { iframeRef.current.src = 'about:blank'; } catch {}
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enlargedImage, handleSafeClose]);

  if (!enlargedImage || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999999] bg-black/95 backdrop-blur-md flex items-center justify-center p-0 sm:p-2 md:p-4 animate-in fade-in duration-150 select-none overscroll-none"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* 1. Floating Close 'X' Button on Top-Right */}
      <button
        type="button"
        onClick={handleSafeClose}
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[1000001] p-2.5 sm:p-3 bg-slate-900/90 hover:bg-red-600 text-white rounded-full border border-white/20 shadow-2xl transition-all duration-150 active:scale-90 cursor-pointer flex items-center justify-center group"
        title="Close (Escape)"
        aria-label="Close Preview"
      >
        <X className="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:rotate-90 transition-transform duration-200" />
      </button>

      {/* 2. Lightbox Card Container (Supports 100% Full Viewport Display) */}
      <div
        className={`relative bg-slate-900/98 rounded-none sm:rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col z-[1000000] transition-all duration-200 ${
          isFullDisplay
            ? 'w-full h-full max-w-none max-h-none rounded-none border-none'
            : 'max-w-6xl w-full max-h-[94vh]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate">
              {enlargedImage.title || 'Document Preview'}
            </span>
            {isDirectPdf && (
              <div className="flex items-center gap-1.5 ml-4 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 shadow-inner">
                <button
                  onClick={() => setPdfPage((p) => Math.max(1, p - 1))}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                  disabled={pdfPage <= 1}
                  title="Previous Page"
                >
                  <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 -rotate-90" />
                </button>
                <span className="text-xs font-bold px-1 min-w-[3rem] text-center">Page {pdfPage}</span>
                <button
                  onClick={() => setPdfPage((p) => p + 1)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                  title="Next Page"
                >
                  <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 rotate-90" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsFullDisplay(!isFullDisplay)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title={isFullDisplay ? "Normal View" : "Full Display"}
            >
              {isFullDisplay ? <Minimize2 className="w-4 h-4 text-blue-400" /> : <Maximize2 className="w-4 h-4 text-blue-400" />}
              <span className="hidden sm:inline font-bold">{isFullDisplay ? 'Normal View' : 'Full Display'}</span>
            </button>

            <button
              type="button"
              onClick={() => onCopyLink(rawUrl)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title={copiedLink === rawUrl ? 'Link Copied!' : 'Copy Link'}
            >
              {copiedLink === rawUrl ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-400 font-bold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Copy Link</span>
                </>
              )}
            </button>

            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-blue-400 hover:text-white bg-blue-950/60 hover:bg-blue-600 border border-blue-800 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold shadow-sm"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open in New Tab</span>
            </a>

            <button
              type="button"
              onClick={handleSafeClose}
              className="px-2.5 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold active:scale-95 shadow-sm"
              title="Close (Escape)"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Google Drive Permission Helper Header Bar */}
        {isDriveDoc && (
          <div className="bg-blue-950/90 border-b border-blue-800/80 px-3 py-1.5 text-xs text-blue-200 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertCircle className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="truncate text-[11px] sm:text-xs font-medium">
                Google Drive Document: If 403 or permission error appears below, open directly in Google Drive.
              </span>
            </div>
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded text-[11px] flex items-center gap-1 shrink-0 transition-colors shadow-sm"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Open in Google Drive</span>
            </a>
          </div>
        )}

        {/* Content Body: Zoomable Image or Full Display PDF / Google Drive */}
        <div className="flex-1 p-1 sm:p-2 flex items-center justify-center bg-black/80 overflow-hidden min-h-[300px] relative">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/40 z-10 pointer-events-none">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <span className="text-xs">Loading content...</span>
            </div>
          )}

          {imageError ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-xl">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">
                  Cannot display content directly
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  This document may require Google account access permissions or restricts iframe embedding.
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
          ) : isDriveDoc ? (
            <div className="w-full h-full flex flex-col relative rounded-xl overflow-hidden border border-slate-800">
              <iframe
                ref={iframeRef}
                src={effectiveUrl}
                className="w-full h-full border-0 bg-white"
                title={enlargedImage.title || 'Google Drive Document'}
                allow="autoplay"
              />
            </div>
          ) : isDirectPdf ? (
            <div className="w-full h-full flex flex-col relative rounded-xl overflow-hidden border border-slate-800">
              <PdfNativeCanvasViewer
                url={rawUrl}
                isFullscreen={true}
              />
            </div>
          ) : (
            <TransformWrapper
              ref={transformRef}
              initialScale={initialZoom > 1 ? initialZoom : 1.15}
              minScale={0.5}
              maxScale={12}
              centerOnInit
              smooth={false}
              wheel={{ step: 0.25 }}
              zoomAnimation={{ disabled: true }}
              pinch={{ step: 12 }}
              doubleClick={{ mode: 'toggle' }}
            >
              <TransformComponent
                wrapperClass="!w-full !h-full max-h-[85vh] flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
                contentClass="!w-full !h-full flex items-center justify-center select-none"
              >
                <img
                  ref={imgRef}
                  src={currentSrc}
                  alt={enlargedImage.title || 'Enlarged Preview'}
                  decoding="async"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                  className="max-w-full max-h-[85vh] object-contain rounded-xl select-none"
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          )}
        </div>

        {/* Footer: Full Link Address */}
        <div className="p-2.5 sm:p-3 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-2 shrink-0 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 font-mono text-[11px] sm:text-xs truncate"
            >
              {rawUrl}
            </a>
          </div>
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-slate-400 hover:text-white shrink-0 text-[11px] font-medium"
          >
            <span>Open Link</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
