import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

interface ZoomableImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const ZoomableImageViewer: React.FC<ZoomableImageViewerProps> = ({
  src,
  alt = 'Image Preview',
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Transform states
  const [scale, setScale] = useState<number>(1);
  const [translateX, setTranslateX] = useState<number>(0);
  const [translateY, setTranslateY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);

  // Dragging states
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Touch touch/pinch states
  const touchStartRef = useRef<{
    initialDistance: number;
    initialScale: number;
    initialTranslate: { x: number; y: number };
    midpoint: { x: number; y: number };
  } | null>(null);

  // Double tap track
  const lastTapRef = useRef<number>(0);

  // Helper: zoom to specific coordinate in container
  const zoomToPoint = (clientX: number, clientY: number, factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;

    let newScale = scale * factor;
    newScale = Math.max(0.8, Math.min(6, newScale));

    const scaleRatio = newScale / scale;
    const newTranslateX = x - (x - translateX) * scaleRatio;
    const newTranslateY = y - (y - translateY) * scaleRatio;

    setScale(newScale);
    setTranslateX(newTranslateX);
    setTranslateY(newTranslateY);
  };

  // Helper: toggle zoom 2.5x
  const toggleDoubleZoom = (clientX: number, clientY: number) => {
    if (scale > 1.05) {
      // Reset
      setScale(1);
      setTranslateX(0);
      setTranslateY(0);
    } else {
      // Zoom in to 2.5x at point
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = clientX - rect.left - rect.width / 2;
      const y = clientY - rect.top - rect.height / 2;

      setScale(2.5);
      // Center on target clicked point
      setTranslateX(-x * 1.5);
      setTranslateY(-y * 1.5);
    }
  };

  // Wheel zoom (mouse)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomToPoint(e.clientX, e.clientY, factor);
  };

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - translateX, y: e.clientY - translateY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTranslateX(e.clientX - dragStart.x);
    setTranslateY(e.clientY - dragStart.y);
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  // Touch Interaction Handlers (Pinch & Pan)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single finger drag
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - translateX, y: touch.clientY - translateY });
    } else if (e.touches.length === 2) {
      // Pinch to Zoom
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      touchStartRef.current = {
        initialDistance: dist,
        initialScale: scale,
        initialTranslate: { x: translateX, y: translateY },
        midpoint: { x: midX, y: midY },
      };
      setIsDragging(false); // Disable single-finger drag
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      setTranslateX(touch.clientX - dragStart.x);
      setTranslateY(touch.clientY - dragStart.y);
    } else if (e.touches.length === 2 && touchStartRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;

      const { initialDistance, initialScale, initialTranslate, midpoint } = touchStartRef.current;
      if (initialDistance > 0) {
        let nextScale = initialScale * (dist / initialDistance);
        nextScale = Math.max(0.8, Math.min(6, nextScale));

        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          // Calculate zoom origin offset
          const ox = midX - rect.left - rect.width / 2;
          const oy = midY - rect.top - rect.height / 2;

          const scaleRatio = nextScale / initialScale;
          const nextTranslateX = ox - (ox - initialTranslate.x) * scaleRatio;
          const nextTranslateY = oy - (oy - initialTranslate.y) * scaleRatio;

          setScale(nextScale);
          setTranslateX(nextTranslateX);
          setTranslateY(nextTranslateY);
        }
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      setIsDragging(false);
      touchStartRef.current = null;
    } else if (e.touches.length === 1) {
      // Reset single finger dragging start reference
      const touch = e.touches[0];
      setDragStart({ x: touch.clientX - translateX, y: touch.clientY - translateY });
      setIsDragging(true);
      touchStartRef.current = null;
    }
  };

  // Double tap or click handler
  const handleDoubleTapOrClick = (clientX: number, clientY: number) => {
    toggleDoubleZoom(clientX, clientY);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleDoubleTapOrClick(e.clientX, e.clientY);
  };

  // Touch single tap vs double tap
  const handleTouchTapCheck = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const now = Date.now();
    const DOUBLE_TAP_DELAY = 300;
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      e.preventDefault();
      const touch = e.touches[0];
      handleDoubleTapOrClick(touch.clientX, touch.clientY);
    }
    lastTapRef.current = now;
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        setScale((prev) => Math.min(6, prev * 1.25));
      } else if (e.key === '-') {
        e.preventDefault();
        setScale((prev) => Math.max(0.8, prev / 1.25));
      } else if (e.key === '0') {
        e.preventDefault();
        handleReset();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(6, prev * 1.25));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(0.8, prev / 1.25));
  };

  const handleRotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const handleReset = () => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-between bg-black/95 select-none touch-none animate-fade-in backdrop-blur-md">
      {/* Top Header Controls */}
      <div className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <span className="text-white font-medium text-sm md:text-base truncate max-w-[70%]">
          {alt}
        </span>
        <button
          onClick={onClose}
          className="p-2 bg-white/10 hover:bg-white/20 active:scale-95 transition rounded-full text-white cursor-pointer"
          title="Close (Esc)"
        >
          <X className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>

      {/* Main Viewport Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onTouchStart={(e) => {
          handleTouchStart(e);
          handleTouchTapCheck(e);
        }}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        className="flex-1 w-full h-full flex items-center justify-center overflow-hidden relative cursor-grab active:cursor-grabbing"
      >
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          draggable={false}
          className="max-w-[90%] max-h-[85%] object-contain pointer-events-none select-none transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${rotation}deg)`,
          }}
        />
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="p-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center pb-8 md:pb-12">
        <div className="flex items-center gap-1 md:gap-2 bg-slate-900/90 border border-slate-800/80 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md">
          {/* Zoom Out Button */}
          <button
            onClick={handleZoomOut}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white active:scale-95 transition rounded-xl cursor-pointer"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-5 h-5" />
          </button>

          {/* Scale Display */}
          <span className="text-white font-mono text-sm min-w-[60px] text-center font-bold">
            {Math.round(scale * 100)}%
          </span>

          {/* Zoom In Button */}
          <button
            onClick={handleZoomIn}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white active:scale-95 transition rounded-xl cursor-pointer"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-5 h-5" />
          </button>

          {/* Divider */}
          <div className="h-6 w-[1px] bg-slate-800 mx-1 md:mx-2" />

          {/* Rotate Button */}
          <button
            onClick={handleRotate}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white active:scale-95 transition rounded-xl cursor-pointer"
            title="Rotate 90°"
          >
            <RotateCw className="w-5 h-5" />
          </button>

          {/* Reset Button */}
          <button
            onClick={handleReset}
            className="p-2 hover:bg-white/10 text-slate-300 hover:text-white active:scale-95 transition rounded-xl cursor-pointer"
            title="Reset (0)"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
