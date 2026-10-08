import React, { useState, useRef, useCallback } from 'react';
import { Maximize2, ZoomIn } from 'lucide-react';
import { TooltipImageItem } from './tooltipTypes';
import { normalizeImageUrl } from '../LayoutUnitLightboxModal';

interface TooltipZoomableThumbnailProps {
  img: TooltipImageItem;
  onOpenFullscreen: (img: { url: string; title?: string; initialScale?: number }) => void;
}

export const TooltipZoomableThumbnail: React.FC<TooltipZoomableThumbnailProps> = ({
  img,
  onOpenFullscreen,
}) => {
  const [previewScale, setPreviewScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  const [isImgError, setIsImgError] = useState(false);

  const touchStateRef = useRef<{
    initialDist: number;
    triggered: boolean;
  } | null>(null);

  const singleTouchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastTapRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. Pinch-to-zoom & Drag-to-zoom gesture on touch devices (iOS / iPad / mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const dist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      touchStateRef.current = { initialDist: dist, triggered: false };
      setIsPinching(true);
      setShowZoomHint(true);
      singleTouchStartRef.current = null;
    } else if (e.touches.length === 1) {
      singleTouchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now(),
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStateRef.current) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const currentDist = Math.hypot(p2.clientX - p1.clientX, p2.clientY - p1.clientY);
      const ratio = currentDist / Math.max(touchStateRef.current.initialDist, 1);

      // User spreading fingers to zoom into thumbnail
      if (ratio > 1.05) {
        if (e.cancelable) e.preventDefault();
        setPreviewScale(Math.min(2.2, ratio));

        // When zoom expansion crosses threshold, auto-expand to fullscreen and continue zooming
        if (ratio >= 1.15 && !touchStateRef.current.triggered) {
          touchStateRef.current.triggered = true;
          const targetScale = Math.min(4, Math.max(1.35, ratio * 1.3));
          onOpenFullscreen({
            url: img.url,
            title: img.title,
            initialScale: targetScale,
          });
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    singleTouchStartRef.current = null;
    if (touchStateRef.current) {
      touchStateRef.current = null;
      setIsPinching(false);
      setPreviewScale(1);
      setTimeout(() => setShowZoomHint(false), 800);
      return;
    }

    // Double-tap zoom detection for single touch
    if (e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        // Double-tap detected -> auto open fullscreen at 2x zoom
        lastTapRef.current = 0;
        if (e.cancelable) e.preventDefault();
        onOpenFullscreen({
          url: img.url,
          title: img.title,
          initialScale: 2.0,
        });
      } else {
        lastTapRef.current = now;
      }
    }
  };

  // 2. Mouse Wheel & Trackpad Pinch Zoom Detection
  const handleWheel = (e: React.WheelEvent) => {
    // Scrolling wheel up (zoom in) or trackpad pinch (e.ctrlKey)
    if (e.deltaY < 0 || e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation();
      const targetScale = e.ctrlKey ? 1.6 : 1.35;
      onOpenFullscreen({
        url: img.url,
        title: img.title,
        initialScale: targetScale,
      });
    }
  };

  // 3. Regular click to open fullscreen at 1x
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenFullscreen({
      url: img.url,
      title: img.title,
      initialScale: 1,
    });
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onWheel={handleWheel}
      onMouseEnter={() => setShowZoomHint(true)}
      onMouseLeave={() => setShowZoomHint(false)}
      className="relative rounded-lg overflow-hidden bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/80 w-full max-h-[190px] sm:max-h-[280px] flex items-center justify-center group/thumb p-1 touch-manipulation cursor-pointer"
      title="Click or pinch/scroll to zoom in fullscreen"
    >
      {!isImgError ? (
        <img
          src={normalizeImageUrl(img.url)}
          alt={img.title}
          onError={() => setIsImgError(true)}
          onClick={handleClick}
          style={{
            transform: previewScale > 1 ? `scale(${previewScale})` : undefined,
            transition: isPinching ? 'none' : 'transform 0.15s ease-out',
          }}
          draggable={false}
          className="w-full h-auto max-h-[180px] sm:max-h-[270px] object-contain hover:scale-[1.01] duration-150 rounded-md select-none"
        />
      ) : (
        <div
          onClick={handleClick}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 p-3 text-center w-full"
        >
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            Web Link / Article Preview
          </span>
          <span className="truncate max-w-[200px] text-[9px] font-mono text-blue-500">
            {img.url}
          </span>
        </div>
      )}

      {/* Floating Action Bar: Maximize & Zoom Hint */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-90 group-hover/thumb:opacity-100 transition-opacity z-10">
        <button
          type="button"
          onClick={handleClick}
          className="p-1.5 bg-black/75 hover:bg-black/95 text-white rounded-md backdrop-blur-xs transition-all active:scale-90 cursor-pointer shadow-md flex items-center gap-1 text-[10px] font-medium"
          title="Zoom HD Fullscreen (Escape to close)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Zoom HD</span>
        </button>
      </div>

      {/* Interactive Micro-badge feedback when pinching or hovering */}
      {(showZoomHint || previewScale > 1) && (
        <div className="absolute bottom-2 left-2 bg-slate-900/85 backdrop-blur-xs text-white text-[9px] px-2 py-0.5 rounded-full pointer-events-none flex items-center gap-1 font-mono shadow-md animate-in fade-in duration-100 z-10">
          <ZoomIn className="w-2.5 h-2.5 text-blue-400" />
          <span>
            {previewScale > 1
              ? `Zooming ${(previewScale * 100).toFixed(0)}%...`
              : 'Pinch / Scroll to expand'}
          </span>
        </div>
      )}
    </div>
  );
};

export default TooltipZoomableThumbnail;
