import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  X, 
  Image as ImageIcon, 
  Link as LinkIcon,
  Maximize2
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface ZoomableImageViewerProps {
  url: string;
  title?: string;
  onClose: () => void;
  onCopyLink?: (url: string) => void;
}

export const ZoomableImageViewer: React.FC<ZoomableImageViewerProps> = ({
  url,
  title,
  onClose,
  onCopyLink
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1);
  const lastTapRef = useRef<number>(0);

  // Reset zoom, position and rotation
  const handleReset = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  // Zoom In
  const handleZoomIn = useCallback(() => {
    setScale(prev => Math.min(6, Math.round((prev + 0.35) * 100) / 100));
  }, []);

  // Zoom Out
  const handleZoomOut = useCallback(() => {
    setScale(prev => {
      const next = Math.max(0.8, Math.round((prev - 0.35) * 100) / 100);
      if (next <= 1) setPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Rotate Right 90deg
  const handleRotate = useCallback(() => {
    setRotation(prev => (prev + 90) % 360);
  }, []);

  // Keyboard shortcut support (Escape to close, +, -, 0 to reset)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        handleZoomIn();
      } else if (e.key === '-') {
        handleZoomOut();
      } else if (e.key === '0') {
        handleReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleZoomIn, handleZoomOut, handleReset]);

  // Wheel event for zoom
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setScale(prevScale => {
      const newScale = Math.min(6, Math.max(0.8, prevScale * zoomFactor));
      if (newScale <= 1) {
        setPosition({ x: 0, y: 0 });
      }
      return newScale;
    });
  }, []);

  // Mouse drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    setPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Double click to toggle zoom (1x <-> 2.5x)
  const handleDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (scale > 1.1) {
      handleReset();
    } else {
      setScale(2.5);
    }
  }, [scale, handleReset]);

  // Touch handlers for mobile / iPad (Pinch-to-zoom & 1-finger Drag)
  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // Double tap gesture
        if (scale > 1.1) {
          handleReset();
        } else {
          setScale(2.5);
        }
      }
      lastTapRef.current = now;

      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y
      };
    } else if (e.touches.length === 2) {
      setIsDragging(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartScaleRef.current = scale;
    }
  }, [position, scale, handleReset]);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.touches.length === 1 && isDragging) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const ratio = dist / touchStartDistRef.current;
      const newScale = Math.min(6, Math.max(0.8, touchStartScaleRef.current * ratio));
      setScale(newScale);
    }
  }, [isDragging]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      touchStartDistRef.current = null;
    }
    if (e.touches.length === 0) {
      setIsDragging(false);
    }
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      <div 
        className="relative max-w-5xl w-full h-[92vh] max-h-[95vh] bg-slate-900/95 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900 text-white shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate" title={title || url}>
              {title || `Link / Photo: ${url}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onCopyLink && (
              <button
                type="button"
                onClick={() => onCopyLink(url)}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer active:scale-95"
                title="Sao chép link"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer active:scale-95"
              title="Mở tab mới"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer active:scale-95"
              title="Đóng (Escape)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Canvas / Image Viewing Container */}
        <div 
          ref={containerRef}
          className={cn(
            "flex-1 relative overflow-hidden bg-black/80 flex items-center justify-center touch-none cursor-grab",
            isDragging && "cursor-grabbing"
          )}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {imageError ? (
            <div className="flex flex-col items-center justify-center text-slate-400 p-6 text-center">
              <ImageIcon className="w-12 h-12 text-rose-500/80 mb-2" />
              <p className="text-sm font-semibold text-rose-300">Không thể tải hình ảnh</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md truncate">{url}</p>
            </div>
          ) : (
            <div 
              className="transition-transform duration-75 ease-out will-change-transform flex items-center justify-center"
              style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0px) scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
            >
              <img 
                src={url} 
                alt={title || 'Enlarged Preview'} 
                onLoad={() => setIsImageLoaded(true)}
                onError={() => setImageError(true)}
                className="max-w-[85vw] max-h-[72vh] object-contain rounded-xl select-none pointer-events-none shadow-2xl"
                draggable={false}
              />
            </div>
          )}

          {/* Floating Zoom & Control Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 sm:gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-white shadow-2xl">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 0.8}
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded-full transition-colors cursor-pointer active:scale-95"
              title="Thu nhỏ (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold min-w-[45px] text-center text-blue-400">
              {Math.round(scale * 100)}%
            </span>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 6}
              className="p-1.5 hover:bg-slate-800 disabled:opacity-30 rounded-full transition-colors cursor-pointer active:scale-95"
              title="Phóng to (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-4 bg-slate-700 my-auto mx-0.5" />

            <button
              type="button"
              onClick={handleRotate}
              className="p-1.5 hover:bg-slate-800 rounded-full transition-colors cursor-pointer active:scale-95 text-slate-300 hover:text-white"
              title="Xoay hình 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="px-2 py-1 hover:bg-slate-800 rounded-full text-[11px] font-bold transition-colors cursor-pointer active:scale-95 text-slate-300 hover:text-white flex items-center gap-1"
              title="Đặt lại kích thước ban đầu"
            >
              <RefreshCw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>

        {/* Modal Footer Link Bar */}
        <div className="p-2.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2 shrink-0 z-10">
          <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <a 
            href={url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-blue-400 hover:underline truncate flex-1"
            title={url}
          >
            {url}
          </a>
          <span className="text-[10px] text-slate-500 font-medium shrink-0 hidden sm:inline">
            Dùng 2 ngón tay hoặc cuộn chuột để zoom / Kéo để di chuyển
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};
