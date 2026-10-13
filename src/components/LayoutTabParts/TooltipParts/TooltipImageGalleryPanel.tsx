import React, { Dispatch, FC, SetStateAction, useRef, useState } from 'react';
import { 
  Image as ImageIcon, 
  Plus, 
  X, 
  Link as LinkIcon, 
  Check, 
  Maximize2, 
  ExternalLink, 
  Copy, 
  Trash2,
  Upload,
  Loader2
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { normalizeImageUrl } from '../LayoutUnitLightboxModal';
import { uploadPictureToTakaFolder } from '../../../lib/r2StorageUtils';
import { TooltipZoomableThumbnail } from './TooltipZoomableThumbnail';

interface TooltipImageGalleryPanelProps {
  showImagePanel: boolean;
  setShowImagePanel: React.Dispatch<React.SetStateAction<boolean>>;
  showAddLinkInput: boolean;
  setShowAddLinkInput: React.Dispatch<React.SetStateAction<boolean>>;
  newLinkInput: string;
  setNewLinkInput: React.Dispatch<React.SetStateAction<string>>;
  allUnitImages: TooltipImageItem[];
  copiedLink: string | null;
  handleAddCustomImage: (e?: React.FormEvent, customUrl?: string) => void;
  handleDeleteCustomImage: (id: string, urlToDelete?: string) => void;
  handleCopyLink: (url: string) => void;
  setEnlargedImage: (img: { url: string; title?: string; initialScale?: number } | null) => void;
  unitCode?: string;
  activeStore?: string;
}

export const TooltipImageGalleryPanel: React.FC<TooltipImageGalleryPanelProps> = ({
  showImagePanel,
  setShowImagePanel,
  showAddLinkInput,
  setShowAddLinkInput,
  newLinkInput,
  setNewLinkInput,
  allUnitImages,
  copiedLink,
  handleAddCustomImage,
  handleDeleteCustomImage,
  handleCopyLink,
  setEnlargedImage,
  unitCode,
  activeStore = 'HCM',
}) => {
  const [addMode, setAddMode] = useState<'link' | 'picture'>('link');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccessUrl, setUploadSuccessUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!showImagePanel && !showAddLinkInput) return null;

  const handlePictureFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsUploading(true);
    setUploadError(null);
    setUploadSuccessUrl(null);

    try {
      const res = await uploadPictureToTakaFolder(file, unitCode, activeStore);
      if (res.success && res.publicUrl) {
        const feedback = `${res.publicUrl}${(res as any).compressionInfo || ''}`;
        setUploadSuccessUrl(feedback);
        setNewLinkInput(res.publicUrl);
        // Save link immediately into gallery
        handleAddCustomImage(undefined, res.publicUrl);
        setTimeout(() => setUploadSuccessUrl(null), 4500);
      } else {
        setUploadError(res.error || 'Upload failed');
      }
    } catch (err: any) {
      setUploadError(err?.message || 'Lỗi kết nối upload');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="w-full bg-slate-50/95 dark:bg-[#161618] rounded-xl p-2.5 border border-slate-200 dark:border-[#333336] shadow-inner flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 my-1">
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-slate-200 min-w-0">
          <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8] shrink-0" />
          <span className="truncate">Hình ảnh liên kết ({activeStore})</span>
          <span className={cn(
            "text-[10px] px-1.5 py-0.2 rounded-full font-mono shrink-0 font-bold",
            activeStore.toUpperCase() === 'HN'
              ? "bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-400"
              : "bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-[#8ab4f8]"
          )}>
            {allUnitImages.length}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* Top "+ Thêm" Button */}
          <button
            type="button"
            onClick={() => setShowAddLinkInput(prev => !prev)}
            className={cn(
              "px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer shadow-xs",
              showAddLinkInput 
                ? "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200" 
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
            title={showAddLinkInput ? "Đóng ô nhập link" : "Thêm link ảnh / bài viết"}
          >
            <Plus className="w-3 h-3" />
            <span>Thêm</span>
          </button>
          {/* Close Image Panel Button */}
          <button
            type="button"
            onClick={() => {
              setShowImagePanel(false);
              setShowAddLinkInput(false);
            }}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Đóng bảng ảnh"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Add / Post Link Input or Upload Picture Section (Only visible when clicking "+ Thêm") */}
      {showAddLinkInput && (
        <div className="flex flex-col gap-2 w-full animate-in fade-in slide-in-from-top-1 duration-150 py-1 bg-white dark:bg-[#1a1a1c] border border-blue-300 dark:border-blue-900 rounded-xl p-2 shadow-xs">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5 gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAddMode('link');
                  setUploadError(null);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer",
                  addMode === 'link'
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                )}
              >
                <LinkIcon className="w-3 h-3" />
                <span>Dán Link URL</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAddMode('picture');
                  setUploadError(null);
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation cursor-pointer",
                  addMode === 'picture'
                    ? "bg-purple-600 text-white shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                )}
              >
                <Upload className="w-3 h-3" />
                <span>Add Picture (Upload R2)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setNewLinkInput('');
                setShowAddLinkInput(false);
                setUploadError(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mode 1: Dán Link URL */}
          {addMode === 'link' && (
            <form onSubmit={handleAddCustomImage} className="flex gap-1.5 items-center w-full pt-0.5">
              <div className="relative flex-1 min-w-0">
                <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input 
                  type="url"
                  value={newLinkInput}
                  onChange={(e) => setNewLinkInput(e.target.value)}
                  onFocus={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Dán link ảnh hoặc link bài viết (https://...)..."
                  className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-slate-50 dark:bg-[#1e1e20] border border-blue-400 dark:border-blue-500 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={!newLinkInput.trim()}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 touch-manipulation shrink-0 cursor-pointer shadow-xs"
                title="Xác nhận thêm link"
              >
                <Check className="w-3.5 h-3.5" />
                <span>OK</span>
              </button>
            </form>
          )}

          {/* Mode 2: Add Picture (Auto upload R2) */}
          {addMode === 'picture' && (
            <div className="flex flex-col gap-1.5 w-full pt-0.5">
              <input 
                type="file"
                ref={fileInputRef}
                accept="image/*"
                className="hidden"
                onChange={handlePictureFileSelected}
              />

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation cursor-pointer shadow-xs shrink-0"
                >
                  {isUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span>{isUploading ? "Đang upload lên R2..." : "Chọn Ảnh Từ Máy / Chụp Ảnh"}</span>
                </button>

                <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono shrink-0 truncate max-w-[210px]">
                  <span>Thư mục R2:</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">Taka-Pm-folder/</span>
                </div>
              </div>

              {uploadError && (
                <div className="text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/60 p-1.5 rounded-md border border-red-200 dark:border-red-900/80 flex items-center gap-1">
                  <span>⚠️ {uploadError}</span>
                </div>
              )}

              {uploadSuccessUrl && (
                <div className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 p-1.5 rounded-md border border-emerald-200 dark:border-emerald-900/80 flex items-center gap-1 truncate font-mono">
                  <span>✅ Đã lưu link R2:</span>
                  <span className="truncate">{uploadSuccessUrl}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Image & Link Thumbnail List */}
      {allUnitImages.length === 0 ? (
        <div className="text-center py-3.5 px-2 bg-white/60 dark:bg-[#1e1e20]/60 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 text-xs flex flex-col items-center gap-1.5">
          <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
          <span>Chưa có hình ảnh. Bấm nút <b>+ Thêm</b> ở trên để dán link ảnh/bài viết.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 max-h-[70vh] sm:max-h-[460px] overflow-y-auto custom-scrollbar pr-0.5">
          {allUnitImages.map((img) => (
            <div 
              key={img.id}
              className="bg-white dark:bg-[#1e1e20] rounded-lg border border-slate-200 dark:border-[#333336] p-2 flex flex-col gap-1.5 shadow-2xs group hover:border-blue-300 dark:hover:border-blue-800 transition-colors"
            >
              {/* Thumbnail Image Container with Pinch / Wheel / Double-tap Auto-Fullscreen Zoom */}
              <TooltipZoomableThumbnail
                img={img}
                onOpenFullscreen={(target) => setEnlargedImage(target)}
              />

              {/* Link Address and Action Buttons (Only shown when clicking "+ Thêm") */}
              {showAddLinkInput && (
                <div className="flex items-center justify-between gap-1.5 pt-0.5 border-t border-slate-100 dark:border-slate-800/80 animate-in fade-in duration-150">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <LinkIcon className="w-3 h-3 text-slate-400 shrink-0" />
                    <a 
                      href={img.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[10px] font-mono text-blue-600 dark:text-[#8ab4f8] hover:underline truncate"
                      title={img.url}
                    >
                      {img.url}
                    </a>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(img.url)}
                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title={copiedLink === img.url ? "Đã sao chép link!" : "Sao chép link"}
                    >
                      {copiedLink === img.url ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <a
                      href={img.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Mở link trong tab mới"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {img.isCustom && (
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteCustomImage(img.id, img.url);
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer active:scale-95 touch-manipulation flex items-center justify-center"
                        title="Xóa link này"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500 hover:text-red-600" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
