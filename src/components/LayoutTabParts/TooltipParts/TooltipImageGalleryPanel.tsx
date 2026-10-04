import React from 'react';
import { 
  Image as ImageIcon, 
  Plus, 
  X, 
  Link as LinkIcon, 
  Check, 
  Maximize2, 
  ExternalLink, 
  Copy, 
  Trash2 
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { normalizeImageUrl } from '../LayoutUnitLightboxModal';

interface TooltipImageGalleryPanelProps {
  showImagePanel: boolean;
  setShowImagePanel: React.Dispatch<React.SetStateAction<boolean>>;
  showAddLinkInput: boolean;
  setShowAddLinkInput: React.Dispatch<React.SetStateAction<boolean>>;
  newLinkInput: string;
  setNewLinkInput: React.Dispatch<React.SetStateAction<string>>;
  allUnitImages: TooltipImageItem[];
  copiedLink: string | null;
  handleAddCustomImage: (e?: React.FormEvent) => void;
  handleDeleteCustomImage: (id: string, urlToDelete?: string) => void;
  handleCopyLink: (url: string) => void;
  setEnlargedImage: (img: { url: string; title?: string } | null) => void;
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
}) => {
  if (!showImagePanel && !showAddLinkInput) return null;

  return (
    <div className="w-full bg-slate-50/95 dark:bg-[#161618] rounded-xl p-2.5 border border-slate-200 dark:border-[#333336] shadow-inner flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-150 my-1">
      {/* Panel Header */}
      <div className="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-1.5 font-bold text-xs text-slate-700 dark:text-slate-200 min-w-0">
          <ImageIcon className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8] shrink-0" />
          <span className="truncate">Hình ảnh & Thumbnail liên kết</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-[#8ab4f8] font-mono shrink-0">
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

      {/* Add / Post Link Input Row (Only visible when clicking "+ Thêm") */}
      {showAddLinkInput && (
        <form onSubmit={handleAddCustomImage} className="flex gap-1.5 items-center w-full animate-in fade-in slide-in-from-top-1 duration-150 py-0.5">
          <div className="relative flex-1 min-w-0">
            <LinkIcon className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input 
              type="url"
              value={newLinkInput}
              onChange={(e) => setNewLinkInput(e.target.value)}
              onFocus={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Dán link ảnh hoặc link bài viết (URL)..."
              className="w-full pl-7 pr-2 py-1.5 text-[11px] bg-white dark:bg-[#1e1e20] border border-blue-400 dark:border-blue-500 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-mono"
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
          <button
            type="button"
            onClick={() => {
              setNewLinkInput('');
              setShowAddLinkInput(false);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors shrink-0"
            title="Hủy"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
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
              {/* Thumbnail Image Container - Full Natural Proportions & Zero Crop */}
              <div className="relative rounded-lg overflow-hidden bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200/60 dark:border-slate-800/80 w-full max-h-[190px] sm:max-h-[280px] flex items-center justify-center group/thumb p-1">
                <img 
                  src={normalizeImageUrl(img.url)} 
                  alt={img.title}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                    const parent = (e.target as HTMLElement).parentElement;
                    if (parent && !parent.querySelector('.img-fallback')) {
                      const div = document.createElement('div');
                      div.className = 'img-fallback flex flex-col items-center justify-center gap-1 text-[10px] text-slate-400 p-2 text-center';
                      div.innerHTML = `<span class="font-semibold text-slate-600 dark:text-slate-300">Web Link / Article Preview</span><span class="truncate max-w-[200px] text-[9px] font-mono text-blue-500">${img.url}</span>`;
                      parent.appendChild(div);
                    }
                  }}
                  className="w-full h-auto max-h-[180px] sm:max-h-[270px] object-contain cursor-pointer hover:scale-[1.01] transition-transform duration-200 rounded-md"
                  onClick={() => setEnlargedImage({ url: img.url, title: img.title })}
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-90 group-hover/thumb:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEnlargedImage({ url: img.url, title: img.title })}
                    className="p-1.5 bg-black/70 hover:bg-black/90 text-white rounded-md backdrop-blur-xs transition-colors cursor-pointer shadow-md"
                    title="Phóng to xem ảnh HD toàn màn hình"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

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
