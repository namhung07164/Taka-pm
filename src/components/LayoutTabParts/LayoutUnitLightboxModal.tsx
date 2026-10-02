import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Copy, 
  ExternalLink, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Check, 
  Loader2, 
  AlertCircle 
} from 'lucide-react';

export function normalizeImageUrl(rawUrl: string | undefined | null): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

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
  enlargedImage: { url: string; title?: string } | null;
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
  const [isLoading, setIsLoading] = useState(true);

  const rawUrl = enlargedImage?.url || '';
  const resolvedUrl = normalizeImageUrl(rawUrl);

  // Reset loading and error state whenever enlargedImage changes
  useEffect(() => {
    setImageError(false);
    setIsLoading(true);
  }, [rawUrl]);

  // Keyboard shortcut: Escape key closes enlarged image (AGENTS.md Rule 6)
  useEffect(() => {
    if (!enlargedImage) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enlargedImage, onClose]);

  if (!enlargedImage || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150 select-none"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchMove={(e) => e.stopPropagation()}
    >
      {/* 1. Ultra-Prominent Floating Close 'X' Button on Top-Right of Viewport */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="fixed top-3 right-3 sm:top-5 sm:right-5 z-[100001] p-2.5 sm:p-3 bg-slate-900/90 hover:bg-red-600 text-white rounded-full border border-white/20 shadow-2xl transition-all duration-150 active:scale-90 cursor-pointer flex items-center justify-center group"
        title="Đóng xem ảnh (Phím Escape)"
        aria-label="Đóng xem ảnh"
      >
        <X className="w-5 h-5 sm:w-6 sm:h-6 text-white group-hover:rotate-90 transition-transform duration-200" />
      </button>

      {/* 2. Lightbox Card Container */}
      <div
        className="relative max-w-5xl w-full max-h-[94vh] bg-slate-900/98 rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 flex flex-col z-[100000]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-slate-800 bg-slate-900 text-white shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <ImageIcon className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-bold text-xs sm:text-sm truncate">
              {enlargedImage.title || 'Image Preview'}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onCopyLink(rawUrl)}
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title={copiedLink === rawUrl ? 'Đã sao chép link!' : 'Sao chép link'}
            >
              {copiedLink === rawUrl ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="hidden sm:inline text-emerald-400">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="hidden sm:inline">Sao chép link</span>
                </>
              )}
            </button>

            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 sm:px-2.5 sm:py-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
              title="Mở trong tab mới"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Mở tab mới</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 bg-red-600/90 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold active:scale-95 shadow-sm"
              title="Đóng (Escape)"
            >
              <X className="w-4 h-4" />
              <span>Đóng</span>
            </button>
          </div>
        </div>

        {/* Content Body: Image or Fallback */}
        <div className="flex-1 p-2 sm:p-4 flex items-center justify-center bg-black/70 overflow-hidden min-h-[260px] sm:min-h-[380px] relative">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-950/40 z-10">
              <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
              <span className="text-xs">Đang tải hình ảnh...</span>
            </div>
          )}

          {!imageError ? (
            <img
              src={resolvedUrl}
              alt={enlargedImage.title || 'Enlarged Preview'}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setImageError(true);
              }}
              className={`max-w-full max-h-[75vh] object-contain rounded-xl select-none transition-opacity duration-200 ${
                isLoading ? 'opacity-0' : 'opacity-100'
              }`}
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md bg-slate-900/90 rounded-2xl border border-slate-700/60 shadow-xl">
              <AlertCircle className="w-10 h-10 text-amber-400" />
              <div>
                <h4 className="text-sm font-bold text-white mb-1">
                  Không thể hiển thị ảnh trực tiếp
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Link này có thể là trang web, thư mục chia sẻ hoặc yêu cầu quyền truy cập từ tài khoản của bạn.
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
                  <span>Mở liên kết trong tab mới</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Full Link Address */}
        <div className="p-2.5 sm:p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2 shrink-0">
          <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-blue-400 hover:underline truncate flex-1"
            title={rawUrl}
          >
            {rawUrl}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
