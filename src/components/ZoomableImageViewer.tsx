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
  Maximize2
} from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { normalizeImageUrl } from './LayoutTabParts/LayoutUnitLightboxModal';

export interface ZoomableImageViewerProps {
  isOpen?: boolean;
  onClose?: () => void;
  imageUrl?: string;
  url?: string;
  src?: string;
  title?: string;
  alt?: string;
  image?: { url: string; title?: string } | null;
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
}) => {
  // Global event listener state for uncontrolled / window-event usage
  const [eventState, setEventState] = useState<{
    isOpen: boolean;
    url: string;
    title?: string;
  }>({
    isOpen: false,
    url: '',
    title: '',
  });

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [copied, setCopied] = useState(false);
  const transformRef = useRef<any>(null);

  // Listen to window-level custom events: 'taka_open_image_viewer'
  useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ url?: string; imageUrl?: string; src?: string; title?: string }>;
      const detail = customEvent.detail;
      if (detail) {
        const rawUrl = detail.url || detail.imageUrl || detail.src || '';
        if (rawUrl) {
          setEventState({
            isOpen: true,
            url: rawUrl,
            title: detail.title || '',
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
  const isVisible = isControlled ? propIsOpen : eventState.isOpen;
  const rawTargetUrl = isControlled
    ? (propImageUrl || propUrl || propSrc || propImage?.url || '')
    : eventState.url;
  const activeTitle = (isControlled ? (propTitle || propAlt || propImage?.title) : eventState.title) || 'Image Viewer';

  const resolvedUrl = normalizeImageUrl(rawTargetUrl);

  const handleClose = useCallback(() => {
    if (isControlled) {
      propOnClose?.();
    } else {
      setEventState(prev => ({ ...prev, isOpen: false }));
    }
  }, [isControlled, propOnClose]);

  // Reset loading and error states when URL changes
  useEffect(() => {
    if (resolvedUrl) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [resolvedUrl]);

  // Handle ESC key to close
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

  return createPortal(
    <div 
      className="fixed inset-0 z-[999999] flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-200 select-none"
      onClick={(e) => {
        // Close on backdrop click (if clicking directly on the overlay container)
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      {/* Top Floating Header & Controls */}
      <div 
        className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 text-white z-20 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 max-w-[50%] min-w-0">
          <Maximize2 className="w-4 h-4 text-blue-400 shrink-0" />
          <span className="text-sm font-semibold truncate text-slate-100" title={activeTitle}>
            {activeTitle}
          </span>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Zoom In */}
          <button
            type="button"
            onClick={() => transformRef.current?.zoomIn()}
            title="Zoom In (+)"
            className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => transformRef.current?.zoomOut()}
            title="Zoom Out (-)"
            className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Reset Zoom */}
          <button
            type="button"
            onClick={() => transformRef.current?.resetTransform()}
            title="Reset Zoom (1:1)"
            className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Copy Link */}
          {rawTargetUrl && (
            <button
              type="button"
              onClick={handleCopy}
              title="Copy Image Link"
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors active:scale-95 touch-manipulation"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          )}

          {/* Open In New Tab */}
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

          {/* Close Modal Button */}
          <button
            type="button"
            onClick={handleClose}
            title="Close (Esc)"
            className="p-1.5 sm:p-2 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white transition-colors active:scale-95 touch-manipulation font-bold flex items-center gap-1 shadow-sm"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline text-xs font-semibold">Close</span>
          </button>
        </div>
      </div>

      {/* Main Pan/Zoom Stage Canvas */}
      <div className="relative flex-1 w-full h-full overflow-hidden flex items-center justify-center">
        {/* Loading Spinner */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 pointer-events-none z-10">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Loading high resolution image...</span>
          </div>
        )}

        {/* Error Fallback */}
        {hasError ? (
          <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md mx-auto">
            <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-200">Unable to load image directly</div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The image could not be rendered inline due to network or CORS restrictions. You can still open or copy the direct link.
            </p>
            {rawTargetUrl && (
              <a
                href={rawTargetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors mt-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Original Link
              </a>
            )}
          </div>
        ) : (
          <TransformWrapper
            ref={transformRef}
            initialScale={1}
            minScale={0.5}
            maxScale={6}
            centerOnInit
            wheel={{ step: 0.015 }}
            doubleClick={{ mode: 'toggle' }}
          >
            <TransformComponent
              wrapperClass="!w-full !h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
              contentClass="!w-full !h-full flex items-center justify-center"
            >
              <img
                src={resolvedUrl}
                alt={activeTitle}
                className="max-w-[95vw] max-h-[85vh] object-contain transition-opacity duration-300 drop-shadow-2xl"
                style={{ opacity: isLoading ? 0 : 1 }}
                onLoad={() => setIsLoading(false)}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
                draggable={false}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      {/* Bottom Hint Footer */}
      <div 
        className="px-4 py-2 bg-slate-900/80 border-t border-slate-800/80 text-center text-[11px] text-slate-400 shrink-0 z-20 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="hidden sm:inline">
          Tip: Scroll or pinch to zoom. Drag to pan. Double click to toggle zoom.
        </span>
        <span className="sm:hidden">
          Pinch to zoom • Drag to pan
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
