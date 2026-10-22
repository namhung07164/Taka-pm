import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  Crop,
  RotateCw,
  Check,
  X,
  Upload,
  Loader2,
  Monitor,
  Maximize2,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { uploadPictureToTakaFolder } from '../../../lib/r2StorageUtils';

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
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number }>({ x: 10, y: 10, w: 80, h: 80 });
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; crop: typeof crop }>({ x: 0, y: 0, crop });

  // Clean state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setSourceImg(null);
      setRotation(0);
      setCrop({ x: 10, y: 10, w: 80, h: 80 });
      setErrorMsg(null);
    }
  }, [isOpen]);

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
                setCrop({ x: 10, y: 10, w: 80, h: 80 });
                setRotation(0);
                setErrorMsg(null);
              }
            };
            reader.readAsDataURL(blob);
          }
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  // Desktop Screen Capture via getDisplayMedia
  const handleCaptureScreen = async () => {
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

      // Capture full frame to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setSourceImg(dataUrl);
        setCrop({ x: 10, y: 10, w: 80, h: 80 });
        setRotation(0);
      }

      // Stop all tracks immediately
      stream.getTracks().forEach((track) => track.stop());
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        setErrorMsg(err.message || 'Failed to capture screen.');
      }
    } finally {
      setIsCapturing(false);
    }
  };

  // File picker handler (for iOS photo upload, desktop drag & drop, etc.)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (evt.target?.result) {
        setSourceImg(evt.target.result as string);
        setCrop({ x: 10, y: 10, w: 80, h: 80 });
        setRotation(0);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Crop Dragging (Pointer Events for touch & mouse)
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      crop: { ...crop },
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100;
    const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100;

    const initial = dragStartRef.current.crop;
    let nextX = Math.max(0, Math.min(100 - initial.w, initial.x + dx));
    let nextY = Math.max(0, Math.min(100 - initial.h, initial.y + dy));

    setCrop({
      x: Math.round(nextX * 10) / 10,
      y: Math.round(nextY * 10) / 10,
      w: initial.w,
      h: initial.h,
    });
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // Crop & Upload to Cloudflare R2
  const handleCropAndUpload = async () => {
    if (!sourceImg || !imgRef.current) return;
    setIsUploading(true);
    setErrorMsg(null);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = sourceImg;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Render image with rotation
      const rad = (rotation * Math.PI) / 180;
      const is90or270 = rotation % 180 !== 0;
      const rotW = is90or270 ? img.height : img.width;
      const rotH = is90or270 ? img.width : img.height;

      const rotCanvas = document.createElement('canvas');
      rotCanvas.width = rotW;
      rotCanvas.height = rotH;
      const rotCtx = rotCanvas.getContext('2d');
      if (!rotCtx) throw new Error('Canvas 2D context not available');

      rotCtx.translate(rotW / 2, rotH / 2);
      rotCtx.rotate(rad);
      rotCtx.drawImage(img, -img.width / 2, -img.height / 2);

      // Crop coordinates in pixels
      const cropX = Math.round((crop.x / 100) * rotW);
      const cropY = Math.round((crop.y / 100) * rotH);
      const cropW = Math.max(10, Math.round((crop.w / 100) * rotW));
      const cropH = Math.max(10, Math.round((crop.h / 100) * rotH));

      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = cropW;
      croppedCanvas.height = cropH;
      const cropCtx = croppedCanvas.getContext('2d');
      if (!cropCtx) throw new Error('Canvas 2D context not available');

      cropCtx.drawImage(rotCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // Convert to JPEG blob & File
      const blob = await new Promise<Blob | null>((resolve) =>
        croppedCanvas.toBlob(resolve, 'image/jpeg', 0.88)
      );
      if (!blob) throw new Error('Failed to create cropped image blob');

      const fileName = `screenshot_${Date.now()}.jpg`;
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Upload directly using standard project R2 upload utility
      const res = await uploadPictureToTakaFolder(file, unitCode, activeStore);
      if (res.success && res.publicUrl) {
        onSuccess(res.publicUrl);
        onClose();
      } else {
        throw new Error(res.error || 'Upload to R2 failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to crop and upload image');
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-white">Screenshot & Crop Tool</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center gap-4 min-h-[300px]">
          {errorMsg && (
            <div className="w-full p-2.5 bg-red-950/80 border border-red-800/80 rounded-xl text-xs text-red-200">
              ⚠️ {errorMsg}
            </div>
          )}

          {!sourceImg ? (
            <div className="flex flex-col items-center justify-center gap-3 py-8 w-full">
              <p className="text-xs text-slate-400 text-center max-w-md">
                Capture your screen or window, paste a screenshot with <kbd className="px-1.5 py-0.5 bg-slate-800 rounded border border-slate-700 font-mono text-indigo-300">Ctrl+V</kbd>, or choose an image/photo to crop.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                <button
                  type="button"
                  disabled={isCapturing}
                  onClick={handleCaptureScreen}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  {isCapturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Monitor className="w-4 h-4" />}
                  <span>Capture Screen (Desktop)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-2 border border-slate-700 active:scale-95 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Choose Photo / Image</span>
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
          ) : (
            <div className="flex flex-col items-center gap-3 w-full">
              {/* Interactive Crop Viewport */}
              <div
                ref={containerRef}
                className="relative max-w-full max-h-[50vh] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 flex items-center justify-center select-none"
                style={{ touchAction: 'none' }}
              >
                <img
                  ref={imgRef}
                  src={sourceImg}
                  alt="Crop Target"
                  style={{ transform: `rotate(${rotation}deg)` }}
                  className="max-h-[50vh] max-w-full object-contain pointer-events-none transition-transform duration-150"
                />

                {/* Draggable Crop Box Overlay */}
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    left: `${crop.x}%`,
                    top: `${crop.y}%`,
                    width: `${crop.w}%`,
                    height: `${crop.h}%`,
                  }}
                  className="absolute border-2 border-indigo-400 bg-indigo-500/15 cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] rounded-xs"
                >
                  <div className="absolute top-1 left-1 bg-indigo-600/90 text-white text-[9px] font-mono px-1 rounded pointer-events-none">
                    Crop Region
                  </div>
                </div>
              </div>

              {/* Crop Controls Bar */}
              <div className="flex items-center gap-2 flex-wrap justify-center w-full pt-1">
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 active:scale-95 cursor-pointer"
                  title="Rotate 90° Clockwise"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCrop({ x: 10, y: 10, w: 80, h: 80 })}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 active:scale-95 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset Box</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceImg(null)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700 active:scale-95 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Take Another</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {sourceImg && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800 bg-slate-950/60">
            <span className="text-[11px] text-slate-400">Drag blue box to adjust crop area.</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUploading}
                onClick={handleCropAndUpload}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>{isUploading ? 'Uploading to R2...' : 'Save & Upload'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
