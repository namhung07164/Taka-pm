import React, { FC, useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { X, Loader2, Camera, AlertTriangle, RefreshCw, Upload, ExternalLink, SwitchCamera, Image as ImageIcon, GripHorizontal } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Portal } from './Portal';
import { ErrorBoundary } from './ErrorBoundary';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (decodedText: string) => void;
}

const ScannerInner: React.FC<QRScannerModalProps> = ({ isOpen, onClose, onScan }) => {
  const [error, setError] = useState<string | null>(null);
  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileScannerRef = useRef<Html5Qrcode | null>(null);
  const isComponentUnmounted = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startAttemptRef = useRef(0);
  const nodeRef = useRef<HTMLDivElement>(null);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const stopActiveScanner = async () => {
    // Ensure all media stream tracks are cleanly stopped to release camera hardware
    try {
      const videoEls = document.querySelectorAll<HTMLVideoElement>('#reader video');
      videoEls.forEach((v) => {
        if (v.srcObject && 'getTracks' in (v.srcObject as any)) {
          (v.srcObject as MediaStream).getTracks().forEach((track) => {
            try { track.stop(); } catch (e) {}
          });
        }
      });
    } catch (e) {}

    if (scannerRef.current) {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      try {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await scanner.stop().catch(() => {});
        }
      } catch (e) {
        // Ignore stop error
      }
      try {
        const el = document.getElementById("reader");
        if (el) {
          el.innerHTML = "";
        }
      } catch (e) {
        // Ignore DOM reset error
      }
    }
  };

  const waitForReaderElement = async (maxAttempts = 25, delayMs = 60): Promise<HTMLElement | null> => {
    for (let i = 0; i < maxAttempts; i++) {
      if (isComponentUnmounted.current) return null;
      const el = document.getElementById("reader");
      if (el && el.clientWidth > 0) return el;
      await new Promise(res => setTimeout(res, delayMs));
    }
    return document.getElementById("reader");
  };

  const startScannerWithConfig = async (cameraList?: { id: string; label: string }[], camIndex: number = 0) => {
    if (!isOpen || isComponentUnmounted.current) return;
    const attemptId = ++startAttemptRef.current;

    setIsLoading(true);
    setError(null);
    setFileError(null);

    await stopActiveScanner();
    if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) return;

    // Ensure DOM element exists and has computed dimensions
    const readerEl = await waitForReaderElement();
    if (!readerEl || startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
      if (!isComponentUnmounted.current && isOpen) {
        setIsLoading(false);
        setError("Không thể khởi tạo khung hiển thị camera. Vui lòng thử lại.");
      }
      return;
    }

    try {
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      let targetCameraConfig: any = null;

      // 1. If cameras list is already known, pick from it
      if (cameraList && cameraList.length > 0) {
        const idx = Math.min(camIndex, cameraList.length - 1);
        targetCameraConfig = cameraList[idx].id;
      } else {
        // Try getting cameras first
        try {
          const availableDevices = await Html5Qrcode.getCameras();
          if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
            await stopActiveScanner();
            return;
          }
          if (availableDevices && availableDevices.length > 0) {
            setCameras(availableDevices);
            // Default to back camera on mobile if available, otherwise first camera (desktop webcam)
            const backIndex = availableDevices.findIndex(d => 
              d.label.toLowerCase().includes('back') || 
              d.label.toLowerCase().includes('rear') || 
              d.label.toLowerCase().includes('sau') ||
              d.label.toLowerCase().includes('environment')
            );
            const chosenIdx = backIndex >= 0 ? backIndex : 0;
            setCurrentCameraIndex(chosenIdx);
            targetCameraConfig = availableDevices[chosenIdx].id;
          }
        } catch (camErr) {
          console.warn("Could not enumerate cameras directly, will try permission prompt or facingMode fallbacks", camErr);
        }

        // Active permission request if no camera device ID found yet
        if (!targetCameraConfig && navigator?.mediaDevices?.getUserMedia) {
          try {
            const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
            tempStream.getTracks().forEach((track) => {
              try { track.stop(); } catch (e) {}
            });
            if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
              await stopActiveScanner();
              return;
            }
            const recheckedDevices = await Html5Qrcode.getCameras().catch(() => []);
            if (recheckedDevices && recheckedDevices.length > 0) {
              setCameras(recheckedDevices);
              const backIndex = recheckedDevices.findIndex(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('rear') || 
                d.label.toLowerCase().includes('sau') ||
                d.label.toLowerCase().includes('environment')
              );
              const chosenIdx = backIndex >= 0 ? backIndex : 0;
              setCurrentCameraIndex(chosenIdx);
              targetCameraConfig = recheckedDevices[chosenIdx].id;
            }
          } catch (permErr) {
            console.warn("Active getUserMedia pre-check notice:", permErr);
          }
        }
      }

      if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
        await stopActiveScanner();
        return;
      }

      // Handler for successful scan
      const onScanSuccess = (decodedText: string) => {
        if (isComponentUnmounted.current) return;
        onScan(decodedText);
        onClose();
      };

      const scanConfig = {
        fps: 5,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minEdge = Math.min(viewfinderWidth || 250, viewfinderHeight || 250);
          const computed = Math.floor(minEdge * 0.7);
          const edgeSize = Math.max(computed, 100);
          return { width: edgeSize, height: edgeSize };
        },
        aspectRatio: 1.0,
      };

      // Double-check DOM element before starting stream
      const checkEl = document.getElementById("reader");
      if (!checkEl || startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
        await stopActiveScanner();
        return;
      }

      // 2. Start with chosen camera ID if found
      if (targetCameraConfig) {
        await html5QrCode.start(targetCameraConfig, scanConfig, onScanSuccess, () => {});
      } else {
        // Fallback 1: Try environment (mobile rear)
        try {
          await html5QrCode.start({ facingMode: "environment" }, scanConfig, onScanSuccess, () => {});
        } catch (envErr) {
          if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
            await stopActiveScanner();
            return;
          }
          console.warn("facingMode 'environment' failed, falling back to 'user' (desktop/front)", envErr);
          // Fallback 2: Try user (desktop webcam / front camera)
          try {
            await html5QrCode.start({ facingMode: "user" }, scanConfig, onScanSuccess, () => {});
          } catch (userErr) {
            if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
              await stopActiveScanner();
              return;
            }
            // Fallback 3: Re-query getCameras() in case permission was just granted
            const devs = await Html5Qrcode.getCameras().catch(() => []);
            if (devs && devs.length > 0) {
              setCameras(devs);
              setCurrentCameraIndex(0);
              await html5QrCode.start(devs[0].id, scanConfig, onScanSuccess, () => {});
            } else {
              throw userErr;
            }
          }
        }
      }

      if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
        await stopActiveScanner();
        return;
      }

      setHasCamera(true);
      setIsLoading(false);
    } catch (err: any) {
      if (startAttemptRef.current !== attemptId || isComponentUnmounted.current) {
        return;
      }
      console.error("Camera start failed:", err);
      setHasCamera(false);
      setIsLoading(false);
      const msg = err?.message || String(err || "");
      if (msg.includes("NotAllowedError") || msg.includes("Permission denied") || msg.includes("denied")) {
        setError("Quyền truy cập Camera bị từ chối trong trình duyệt. Vui lòng cấp quyền Camera.");
      } else if (msg.includes("NotFoundError") || msg.includes("DevicesNotFoundError") || msg.includes("OverconstrainedError")) {
        setError("Không tìm thấy thiết bị Camera/Webcam phù hợp trên thiết bị này.");
      } else if (msg.includes("NotReadableError") || msg.includes("TrackStartError")) {
        setError("Camera đang được ứng dụng khác (Zoom, Teams...) sử dụng.");
      } else if (msg.includes("clientWidth") || msg.includes("null")) {
        setError("Khung camera chưa sẵn sàng. Vui lòng bấm 'Thử lại Camera' hoặc tải ảnh QR từ máy.");
      } else {
        setError(msg || "Không thể kết nối Camera.");
      }
    }
  };

  useEffect(() => {
    isComponentUnmounted.current = false;
    if (isOpen) {
      startScannerWithConfig();
    }

    return () => {
      isComponentUnmounted.current = true;
      stopActiveScanner();
      if (fileScannerRef.current) {
        fileScannerRef.current = null;
        try {
          const fileEl = document.getElementById("file-reader-hidden");
          if (fileEl) fileEl.innerHTML = "";
        } catch (e) {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSwitchCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    await startScannerWithConfig(cameras, nextIndex);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    setFileError(null);

    try {
      if (!fileScannerRef.current) {
        fileScannerRef.current = new Html5Qrcode("file-reader-hidden");
      }
      const decodedText = await fileScannerRef.current.scanFile(file, false);
      if (decodedText) {
        onScan(decodedText);
        onClose();
      }
    } catch (scanErr: any) {
      console.error("File QR scan failed", scanErr);
      setFileError("Không tìm thấy mã QR hợp lệ trong bức ảnh này. Vui lòng chọn ảnh khác rõ nét hơn.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
        <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button, input, select">
          <div 
            ref={nodeRef}
            className="bg-white dark:bg-[#1a1a1c] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative border border-slate-200 dark:border-[#333336] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-handle cursor-grab active:cursor-grabbing px-5 py-4 flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#333336] select-none">
              <h3 className="text-base font-bold text-slate-800 dark:text-[#f3f3f3] flex items-center gap-2">
                <GripHorizontal className="w-4 h-4 text-slate-400" />
                <Camera className="w-5 h-5 text-blue-500" /> QR Scanner
              </h3>
              <div className="flex items-center gap-2">
                {cameras.length > 1 && hasCamera && (
                  <button 
                    onClick={handleSwitchCamera}
                    title="Switch camera"
                    className="text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}
                <button 
                  onClick={onClose} 
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-[#c3c3c3] p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          
          {/* Viewfinder / Camera View */}
          <div className="bg-black relative flex flex-col items-center justify-center min-h-[320px] max-h-[420px] overflow-hidden">
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 text-white gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                <span className="text-sm font-medium">Đang kết nối Camera...</span>
              </div>
            )}

            {hasCamera === false && (
              <div className="absolute inset-0 bg-black/95 z-20 overflow-y-auto flex flex-col items-center justify-center text-white gap-3 p-6 text-center">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center border border-red-500/30 shrink-0">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <span className="text-base font-bold text-slate-100">Không thể truy cập Camera</span>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                  {error || "Vui lòng cho phép quyền Camera trong cài đặt trình duyệt để tiếp tục quét mã."}
                </p>

                {isInIframe && (
                  <div className="mt-1 p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300 text-left w-full flex items-start gap-2">
                    <ExternalLink className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Ứng dụng đang trong khung nhúng (iframe). Hãy mở tab mới độc lập để Chrome cho phép truy cập Camera dễ dàng hơn.</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-center gap-2 mt-2 w-full">
                  <button 
                    onClick={() => startScannerWithConfig(cameras, currentCameraIndex)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Thử lại Camera
                  </button>

                  {isInIframe && (
                    <button 
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Mở tab mới
                    </button>
                  )}
                </div>
              </div>
            )}
            
            <div 
              id="reader" 
              className="w-full h-full min-h-[320px] overflow-hidden" 
            />
          </div>

          {/* Hidden helper for file-based decoding */}
          <div id="file-reader-hidden" style={{ display: 'none' }} />
          <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            className="hidden" 
            onChange={handleFileUpload} 
          />

          {/* File Error Alert */}
          {fileError && (
            <div className="px-4 py-2 bg-amber-500/10 border-t border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

            {/* Footer - File Upload Option & Guide */}
            <div className="p-4 bg-slate-50 dark:bg-[#1e1e20] border-t border-slate-200 dark:border-[#333336] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessingFile}
                  className="px-3.5 py-2 bg-white dark:bg-[#28282a] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-700 dark:text-[#e0e0e0] border border-slate-300 dark:border-[#444446] rounded-lg text-xs font-medium flex items-center gap-2 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {isProcessingFile ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  ) : (
                    <Upload className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  <span>Upload QR Image</span>
                </button>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:inline">
                  (Scan directly from photo)
                </span>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-[#2d2d30] dark:hover:bg-[#38383c] text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Draggable>
      </div>
    </Portal>
  );
};

export const QRScannerModal: React.FC<QRScannerModalProps> = (props) => (
  <ErrorBoundary>
    <ScannerInner {...props} />
  </ErrorBoundary>
);
