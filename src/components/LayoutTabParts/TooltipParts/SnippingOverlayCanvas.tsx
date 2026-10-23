import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  CropBox,
  SnippingTool,
  AnnotationStroke,
  StrokePoint,
} from './snippingTypes';
import { SnippingToolBar } from './SnippingToolBar';

interface SnippingOverlayCanvasProps {
  sourceImg: string;
  rotation: number;
  cropBox: CropBox;
  setCropBox: React.Dispatch<React.SetStateAction<CropBox>>;
  strokes: AnnotationStroke[];
  setStrokes: React.Dispatch<React.SetStateAction<AnnotationStroke[]>>;
  currentTool: SnippingTool;
  setCurrentTool: (tool: SnippingTool) => void;
  penColor: string;
  setPenColor: (color: string) => void;
  penSize: number;
  setPenSize: (size: number) => void;
  highlighterColor: string;
  setHighlighterColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCapture: () => void;
  onCopyClipboard: () => void;
  onCancel: () => void;
  isProcessing: boolean;
  copiedFeedback: boolean;
}

type DragMode =
  | 'none'
  | 'create'
  | 'move'
  | 'resize-n'
  | 'resize-s'
  | 'resize-w'
  | 'resize-e'
  | 'resize-nw'
  | 'resize-ne'
  | 'resize-sw'
  | 'resize-se'
  | 'draw';

export const SnippingOverlayCanvas: React.FC<SnippingOverlayCanvasProps> = ({
  sourceImg,
  rotation,
  cropBox,
  setCropBox,
  strokes,
  setStrokes,
  currentTool,
  setCurrentTool,
  penColor,
  setPenColor,
  penSize,
  setPenSize,
  highlighterColor,
  setHighlighterColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCapture,
  onCopyClipboard,
  onCancel,
  isProcessing,
  copiedFeedback,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [dragMode, setDragMode] = useState<DragMode>('none');
  const dragStartRef = useRef<{ x: number; y: number; crop: CropBox }>({
    x: 0,
    y: 0,
    crop: cropBox,
  });

  const activeStrokeRef = useRef<AnnotationStroke | null>(null);

  // Render annotations onto the canvas
  const renderStrokes = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const allStrokes = [...strokes];
    if (activeStrokeRef.current) {
      allStrokes.push(activeStrokeRef.current);
    }

    allStrokes.forEach((stroke) => {
      ctx.save();
      if (stroke.tool === 'highlighter') {
        ctx.globalAlpha = 0.42;
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.size * 3.5;
        ctx.lineCap = 'square';
        ctx.lineJoin = 'bevel';
      } else if (stroke.tool === 'pen') {
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      } else if (stroke.tool === 'rectangle') {
        ctx.globalAlpha = 1.0;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size + 1;
      }

      if (stroke.tool === 'rectangle') {
        if (stroke.points.length >= 2) {
          const p1 = stroke.points[0];
          const p2 = stroke.points[stroke.points.length - 1];
          const x1 = (p1.x / 100) * width;
          const y1 = (p1.y / 100) * height;
          const x2 = (p2.x / 100) * width;
          const y2 = (p2.y / 100) * height;
          ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
        }
      } else {
        if (stroke.points.length > 0) {
          ctx.beginPath();
          const first = stroke.points[0];
          ctx.moveTo((first.x / 100) * width, (first.y / 100) * height);
          for (let i = 1; i < stroke.points.length; i++) {
            const pt = stroke.points[i];
            ctx.lineTo((pt.x / 100) * width, (pt.y / 100) * height);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }, [strokes]);

  useEffect(() => {
    renderStrokes();
  }, [renderStrokes]);

  // Pointer event handlers for drawing and box manipulation
  const getContainerRelativePercent = (clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isProcessing) return;
    const { x, y } = getContainerRelativePercent(e.clientX, e.clientY);
    const target = e.target as HTMLElement;
    const handleType = target.getAttribute('data-handle');

    // Drawing Mode (Pen / Highlighter / Rectangle)
    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'rectangle') {
      setDragMode('draw');
      const stroke: AnnotationStroke = {
        id: `stroke_${Date.now()}_${Math.random()}`,
        tool: currentTool,
        color: currentTool === 'highlighter' ? highlighterColor : penColor,
        size: currentTool === 'highlighter' ? 6 : penSize,
        points: [{ x, y }],
      };
      activeStrokeRef.current = stroke;
      renderStrokes();
      return;
    }

    // Eraser Mode
    if (currentTool === 'eraser') {
      // Find nearest stroke to click and remove it
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        return prev.slice(0, prev.length - 1);
      });
      return;
    }

    // Resize Handle Pressed
    if (handleType) {
      setDragMode(`resize-${handleType}` as DragMode);
      dragStartRef.current = { x: e.clientX, y: e.clientY, crop: { ...cropBox } };
      return;
    }

    // Inside Crop Box -> Move
    const inX = x >= cropBox.x && x <= cropBox.x + cropBox.w;
    const inY = y >= cropBox.y && y <= cropBox.y + cropBox.h;
    if (inX && inY) {
      setDragMode('move');
      dragStartRef.current = { x: e.clientX, y: e.clientY, crop: { ...cropBox } };
      return;
    }

    // Outside Crop Box -> Create new selection box
    setDragMode('create');
    setCropBox({ x, y, w: 1, h: 1 });
    dragStartRef.current = { x: e.clientX, y: e.clientY, crop: { x, y, w: 1, h: 1 } };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragMode === 'none' || !containerRef.current) return;
    const { x, y } = getContainerRelativePercent(e.clientX, e.clientY);

    if (dragMode === 'draw') {
      if (activeStrokeRef.current) {
        if (activeStrokeRef.current.tool === 'rectangle') {
          activeStrokeRef.current.points = [activeStrokeRef.current.points[0], { x, y }];
        } else {
          activeStrokeRef.current.points.push({ x, y });
        }
        renderStrokes();
      }
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;
    const init = dragStartRef.current.crop;

    if (dragMode === 'create') {
      const curX = Math.min(init.x, x);
      const curY = Math.min(init.y, y);
      const curW = Math.max(2, Math.abs(x - init.x));
      const curH = Math.max(2, Math.abs(y - init.y));
      setCropBox({
        x: Math.round(curX * 10) / 10,
        y: Math.round(curY * 10) / 10,
        w: Math.round(curW * 10) / 10,
        h: Math.round(curH * 10) / 10,
      });
      return;
    }

    if (dragMode === 'move') {
      const nextX = Math.max(0, Math.min(100 - init.w, init.x + dx));
      const nextY = Math.max(0, Math.min(100 - init.h, init.y + dy));
      setCropBox({
        ...init,
        x: Math.round(nextX * 10) / 10,
        y: Math.round(nextY * 10) / 10,
      });
      return;
    }

    // Resizing handles
    let { x: nx, y: ny, w: nw, h: nh } = init;
    if (dragMode.includes('w')) {
      const maxW = init.x + init.w;
      nx = Math.max(0, Math.min(maxW - 3, init.x + dx));
      nw = maxW - nx;
    }
    if (dragMode.includes('e')) {
      nw = Math.max(3, Math.min(100 - init.x, init.w + dx));
    }
    if (dragMode.includes('n')) {
      const maxH = init.y + init.h;
      ny = Math.max(0, Math.min(maxH - 3, init.y + dy));
      nh = maxH - ny;
    }
    if (dragMode.includes('s')) {
      nh = Math.max(3, Math.min(100 - init.y, init.h + dy));
    }

    setCropBox({
      x: Math.round(nx * 10) / 10,
      y: Math.round(ny * 10) / 10,
      w: Math.round(nw * 10) / 10,
      h: Math.round(nh * 10) / 10,
    });
  };

  const handlePointerUp = () => {
    if (dragMode === 'draw' && activeStrokeRef.current) {
      setStrokes((prev) => [...prev, activeStrokeRef.current!]);
      activeStrokeRef.current = null;
      renderStrokes();
    }
    setDragMode('none');
  };

  // Calculate toolbar docked position directly underneath the crop box
  const getToolbarStyle = () => {
    if (!containerRef.current) return { bottom: '24px', left: '50%', transform: 'translateX(-50%)' };
    const rect = containerRef.current.getBoundingClientRect();
    const boxBottomPx = (cropBox.y + cropBox.h) * 0.01 * rect.height;
    const boxCenterXPx = (cropBox.x + cropBox.w * 0.5) * 0.01 * rect.width;

    // Check if bottom has enough space for toolbar (~65px)
    const hasSpaceBelow = rect.height - boxBottomPx > 75;
    const topPx = hasSpaceBelow ? boxBottomPx + 12 : Math.max(12, boxBottomPx - cropBox.h * 0.01 * rect.height - 65);

    // Clamp horizontal center so toolbar stays within container
    const clampX = Math.max(180, Math.min(rect.width - 180, boxCenterXPx));

    return {
      top: `${Math.round(topPx)}px`,
      left: `${Math.round(clampX)}px`,
      transform: 'translateX(-50%)',
    };
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-full flex items-center justify-center overflow-hidden select-none"
      style={{
        touchAction: 'none',
        cursor:
          currentTool === 'pen' || currentTool === 'highlighter'
            ? 'crosshair'
            : currentTool === 'eraser'
            ? 'cell'
            : currentTool === 'rectangle'
            ? 'crosshair'
            : dragMode === 'move'
            ? 'grabbing'
            : 'default',
      }}
    >
      {/* Background Image Layer */}
      <img
        ref={imgRef}
        src={sourceImg}
        alt="Screen Capture"
        style={{ transform: `rotate(${rotation}deg)` }}
        className="w-full h-full object-contain pointer-events-none transition-transform duration-150"
      />

      {/* Dimmed backdrop outside selection box & dashed selection region */}
      <div
        style={{
          left: `${cropBox.x}%`,
          top: `${cropBox.y}%`,
          width: `${cropBox.w}%`,
          height: `${cropBox.h}%`,
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.62)',
        }}
        className="absolute border-2 border-dashed border-white/95 pointer-events-none rounded-xs"
      >
        {/* Pill Handles (Windows 11 Snipping Tool Style) */}
        {/* Top Handle */}
        <div
          data-handle="n"
          className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-7 h-2.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-ns-resize hover:scale-110 active:scale-95 transition-transform"
        />
        {/* Bottom Handle */}
        <div
          data-handle="s"
          className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-7 h-2.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-ns-resize hover:scale-110 active:scale-95 transition-transform"
        />
        {/* Left Handle */}
        <div
          data-handle="w"
          className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-2.5 h-7 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-ew-resize hover:scale-110 active:scale-95 transition-transform"
        />
        {/* Right Handle */}
        <div
          data-handle="e"
          className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-7 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-ew-resize hover:scale-110 active:scale-95 transition-transform"
        />

        {/* 4 Corner Handles */}
        <div
          data-handle="nw"
          className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
        />
        <div
          data-handle="ne"
          className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
        />
        <div
          data-handle="sw"
          className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-nesw-resize hover:scale-125 transition-transform"
        />
        <div
          data-handle="se"
          className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white rounded-full shadow-lg border border-slate-700/40 pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
        />
      </div>

      {/* Freehand / Annotation Drawing Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Docked Windows 11 Snipping Floating Toolbar */}
      <div
        className="absolute z-50 pointer-events-auto transition-all duration-75"
        style={getToolbarStyle()}
      >
        <SnippingToolBar
          currentTool={currentTool}
          setCurrentTool={setCurrentTool}
          penColor={penColor}
          setPenColor={setPenColor}
          penSize={penSize}
          setPenSize={setPenSize}
          highlighterColor={highlighterColor}
          setHighlighterColor={setHighlighterColor}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          onCapture={onCapture}
          onCopyClipboard={onCopyClipboard}
          onCancel={onCancel}
          isProcessing={isProcessing}
          copiedFeedback={copiedFeedback}
        />
      </div>
    </div>
  );
};
