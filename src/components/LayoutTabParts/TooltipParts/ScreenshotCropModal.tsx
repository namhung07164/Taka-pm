import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  RotateCw,
  X,
  Upload,
  Loader2,
  Monitor,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { uploadPictureToTakaFolder } from '../../../lib/r2StorageUtils';
import {
  CropBox,
  SnippingTool,
  AnnotationStroke,
} from './snippingTypes';
import { SnippingOverlayCanvas } from './SnippingOverlayCanvas';

interface ScreenshotCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (publicUrl: string) => void;
  unitCode?: string;
  activeStore?: string;
}

export const ScreenshotCropModal: React.FC<ScreenshotCropModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  unitCode,
  activeStore = 'HCM',
}) => {
  const [sourceImg, setSourceImg] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);
  const [cropBox, setCropBox] = useState<CropBox>({ x: 15, y: 15, w: 70, h: 65 });
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Snipping Tool & Annotation States
  const [currentTool, setCurrentTool] = useState<SnippingTool>('select');
  const [penColor, setPenColor] = useState<string>('#ef4444');
  const [penSize, setPenSize] = useState<number>(3);
  const [highlighterColor, setHighlighterColor] = useState<string>('#fef08a');
  const [strokes, setStrokes] = useState<AnnotationStroke[]>([]);
  const [undoHistory, setUndoHistory] = useState<AnnotationStroke[][]>([]);
  const [redoHistory, setRedoHistory] = useState<AnnotationStroke[][]>([]);
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Push to history when strokes change
  const handleSetStrokes = useCallback(
    (action: React.SetStateAction<AnnotationStroke[]>) => {
      setStrokes((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        setUndoHistory((hist) => [...hist, prev]);
        setRedoHistory([]);
        return next;
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (undoHistory.length === 0) return;
    const previous = undoHistory[undoHistory.length - 1];
    setUndoHistory((hist) => hist.slice(0, hist.length - 1));
    setRedoHistory((hist) => [...hist, strokes]);
    setStrokes(previous);
  }, [undoHistory, strokes]);

  const handleRedo = useCallback(() => {
    if (redoHistory.length === 0) return;
    const next = redoHistory[redoHistory.length - 1];
    setRedoHistory((hist) => hist.slice(0, hist.length - 1));
    setUndoHistory((hist) => [...hist, strokes]);
    setStrokes(next);
  }, [redoHistory, strokes]);

  // Auto-capture the current application screen on open
  const autoCaptureAppScreen = useCallback(async () => {
    setIsCapturing(true);
    setErrorMsg(null);
    try {
      const htmlToImage = await import('html-to-image');
      const rootEl = document.getElementById('root') || document.body;
      const dataUrl = await htmlToImage.toJpeg(rootEl, {
        quality: 0.95,
        cacheBust: false,
        filter: (node) => {
          const el = node as HTMLElement;
          if (el?.classList?.contains('snipping-modal-root')) return false;
          return true;
        },
      });
      setSourceImg(dataUrl);
      setCropBox({ x: 15, y: 15, w: 70, h: 65 });
      setRotation(0);
      setStrokes([]);
      setUndoHistory([]);
      setRedoHistory([]);
    } catch (err: any) {
      console.warn('Auto app capture fallback to screen dialog:', err);
      // If htmlToImage fails, leave empty to show capture prompt
    } finally {
      setIsCapturing(false);
    }
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      autoCaptureAppScreen();
    } else {
      setSourceImg(null);
      setRotation(0);
      setCropBox({ x: 15, y: 15, w: 70, h: 65 });
      setStrokes([]);
      setUndoHistory([]);
      setRedoHistory([]);
      setErrorMsg(null);
      setCurrentTool('select');
      setCopiedFeedback(false);
    }
  }, [isOpen, autoCaptureAppScreen]);

  // Support Ctrl+V / Cmd+V paste screenshot directly
  useEffect(() => {
    if (!isOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              if (evt.target?.result) {
                setSourceImg(evt.target.result as string);
                setCropBox({ x: 10, y: 10, w: 80, h: 80 });
                setRotation(0);
                setStrokes([]);
                setUndoHistory([]);
                setRedoHistory([]);
                setErrorMsg(null);
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        handleRedo();
      }
    };

    window.addEventListener('paste', handlePaste);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('paste', handlePaste);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handleUndo, handleRedo]);

  // Desktop Screen Capture via getDisplayMedia
  const handleCaptureDisplayMedia = async () => {
    setErrorMsg(null);
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setErrorMsg('Screen capture is not supported on this device/browser. Please choose an image or take a photo.');
      return;
    }

    setIsCapturing(true);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as any,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(resolve).catch(reject);
        };
        video.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setSourceImg(dataUrl);
        setCropBox({ x: 15, y: 15, w: 70, h: 65 });
        setRotation(0);
        setStrokes([]);
        setUndoHistory([]);
        setRedoHistory([]);
      }

      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMsg(err.message || 'Failed to capture screen.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  // File picker handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setSourceImg(evt.target.result as string);
        setCropBox({ x: 15, y: 15, w: 70, h: 65 });
        setRotation(0);
        setStrokes([]);
        setUndoHistory([]);
        setRedoHistory([]);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Generate cropped & marked canvas
  const generateCroppedCanvas = async (): Promise<HTMLCanvasElement | null> => {
    if (!sourceImg) return null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = sourceImg;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const rad = (rotation * Math.PI) / 180;
    const is90or270 = rotation % 180 !== 0;
    const rotW = is90or270 ? img.height : img.width;
    const rotH = is90or270 ? img.width : img.height;

    // Full rotated canvas
    const rotCanvas = document.createElement('canvas');
    rotCanvas.width = rotW;
    rotCanvas.height = rotH;
    const rotCtx = rotCanvas.getContext('2d');
    if (!rotCtx) throw new Error('Canvas 2D context not available');

    rotCtx.translate(rotW / 2, rotH / 2);
    rotCtx.rotate(rad);
    rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

    // Crop coordinates in image pixels
    const cropX = Math.round((cropBox.x / 100) * rotW);
    const cropY = Math.round((cropBox.y / 100) * rotH);
    const cropW = Math.max(20, Math.round((cropBox.w / 100) * rotW));
    const cropH = Math.max(20, Math.round((cropBox.h / 100) * rotH));

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const cropCtx = croppedCanvas.getContext('2d');
    if (!cropCtx) throw new Error('Canvas 2D context not available');

    // Draw cropped portion
    cropCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Draw annotation strokes scaled to cropped canvas
    strokes.forEach((stroke) => {
      cropCtx.save();
      if (stroke.tool === 'highlighter') {
        cropCtx.globalAlpha = 0.42;
        cropCtx.strokeStyle = stroke.color;
        cropCtx.fillStyle = stroke.color;
        cropCtx.lineWidth = stroke.size * 3.5;
        cropCtx.lineCap = 'square';
      } else if (stroke.tool === 'pen') {
        cropCtx.globalAlpha = 1.0;
        cropCtx.strokeStyle = stroke.color;
        cropCtx.lineWidth = stroke.size;
        cropCtx.lineCap = 'round';
        cropCtx.lineJoin = 'round';
      } else if (stroke.tool === 'rectangle') {
        cropCtx.globalAlpha = 1.0;
        cropCtx.strokeStyle = stroke.color;
        cropCtx.lineWidth = stroke.size + 1;
      }

      if (stroke.tool === 'rectangle' && stroke.points.length >= 2) {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        // Relative to full image (0-100), shift to crop relative
        const x1 = ((p1.x - cropBox.x) / cropBox.w) * cropW;
        const y1 = ((p1.y - cropBox.y) / cropBox.h) * cropH;
        const x2 = ((p2.x - cropBox.x) / cropBox.w) * cropW;
        const y2 = ((p2.y - cropBox.y) / cropBox.h) * cropH;
        cropCtx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      } else if (stroke.points.length > 0) {
        cropCtx.beginPath();
        const first = stroke.points[0];
        const fx = ((first.x - cropBox.x) / cropBox.w) * cropW;
        const fy = ((first.y - cropBox.y) / cropBox.h) * cropH;
        cropCtx.moveTo(fx, fy);
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          const px = ((pt.x - cropBox.x) / cropBox.w) * cropW;
          const py = ((pt.y - cropBox.y) / cropBox.h) * cropH;
          cropCtx.lineTo(px, py);
        }
        cropCtx.stroke();
      }
      cropCtx.restore();
    });

    return croppedCanvas;
  };

  // Action 1: Capture & Upload to R2 Cloud Storage
  const handleCaptureAndUpload = async () => {
    setIsUploading(true);
    setErrorMsg(null);
    try {
      const croppedCanvas = await generateCroppedCanvas();
      if (!croppedCanvas) throw new Error('No crop available');

      const blob = await new Promise<Blob | null>((resolve) =>
        croppedCanvas.toBlob(resolve, 'image/jpeg', 0.90)
      );
      if (!blob) throw new Error('Failed to create cropped image blob');

      const fileName = `screenshot_${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      const res = await uploadPictureToTakaFolder(file, unitCode, activeStore);
      if (res.success && res.publicUrl) {
        onSuccess(res.publicUrl);
        onClose();
      } else {
        throw new Error(res.error || 'Upload to R2 failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to capture and upload image');
    } finally {
      setIsUploading(false);
    }
  };

  // Action 2: Copy to Clipboard
  const handleCopyClipboard = async () => {
    try {
      const croppedCanvas = await generateCroppedCanvas();
      if (!croppedCanvas) return;
      const blob = await new Promise<Blob | null>((resolve) =>
        croppedCanvas.toBlob(resolve, 'image/png')
      );
      if (!blob) return;

      if (navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': blob }),
        ]);
        setCopiedFeedback(true);
        setTimeout(() => setCopiedFeedback(false), 2200);
      }
    } catch (err: any) {
      console.warn('Clipboard write failed:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="snipping-modal-root fixed inset-0 z-[200] flex flex-col bg-black/90 select-none animate-in fade-in duration-100 overflow-hidden">
      {/* Top Windows 11 Snipping Tool Header Bar */}
      <div className="h-11 px-4 bg-[#18181b]/95 border-b border-white/10 flex items-center justify-between text-slate-200 z-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-teal-500/20 text-teal-300">
            <Camera className="w-4 h-4" />
          </div>
          <span className="font-bold text-xs text-white tracking-wide">
            Windows Snipping Tool (Screenshot & Crop)
          </span>
          {isCapturing && (
            <span className="text-[11px] text-teal-400 flex items-center gap-1 font-medium ml-2 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Freezing screen...
            </span>
          )}
        </div>

        {/* Top Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={autoCaptureAppScreen}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            title="Snip Application View"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span className="hidden sm:inline">Snip App</span>
          </button>

          <button
            type="button"
            onClick={handleCaptureDisplayMedia}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            title="Capture Full Desktop Screen"
          >
            <Monitor className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Desktop/Window</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-slate-200 rounded-lg text-xs font-medium flex items-center gap-1 transition-all cursor-pointer"
            title="Choose Image / Photo"
          >
            <Upload className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Upload/Paste</span>
          </button>

          {sourceImg && (
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg transition-all cursor-pointer"
              title="Rotate 90° Clockwise"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="w-[1px] h-4 bg-white/20 mx-1" />

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 rounded-lg transition-all cursor-pointer"
            title="Exit Snipping Tool (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Error notification banner if any */}
      {errorMsg && (
        <div className="w-full px-4 py-1.5 bg-red-950/90 border-b border-red-800 text-xs text-red-200 flex items-center justify-between z-50">
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-300 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Snipping Canvas Viewport */}
      <div className="relative flex-1 w-full h-[calc(100vh-44px)] overflow-hidden flex items-center justify-center">
        {sourceImg ? (
          <SnippingOverlayCanvas
            sourceImg={sourceImg}
            rotation={rotation}
            cropBox={cropBox}
            setCropBox={setCropBox}
            strokes={strokes}
            setStrokes={handleSetStrokes}
            currentTool={currentTool}
            setCurrentTool={setCurrentTool}
            penColor={penColor}
            setPenColor={setPenColor}
            penSize={penSize}
            setPenSize={setPenSize}
            highlighterColor={highlighterColor}
            setHighlighterColor={setHighlighterColor}
            canUndo={undoHistory.length > 0}
            canRedo={redoHistory.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onCapture={handleCaptureAndUpload}
            onCopyClipboard={handleCopyClipboard}
            onCancel={onClose}
            isProcessing={isUploading || isCapturing}
            copiedFeedback={copiedFeedback}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-300 p-6 text-center max-w-md animate-in fade-in duration-200">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
            <p className="text-sm font-semibold text-white">Capturing screen for snipping...</p>
            <p className="text-xs text-slate-400">
              You can also click <b>Desktop/Window</b> above to capture another screen, or paste with <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 text-teal-300 font-mono">Ctrl+V</kbd>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
