import React from 'react';
import { 
  X, 
  Crosshair, 
  Image as ImageIcon 
} from 'lucide-react';
import { QuickNavButton } from '../../QuickNavButton';
import { Project } from '../../../types';
import { cn } from '../../../lib/utils';
import { TooltipImageItem } from './tooltipTypes';
import { normalizeImageUrl } from '../LayoutUnitLightboxModal';

interface TooltipHeaderBarProps {
  v: any;
  mdStatus: string;
  mdStatusColorClass: string;
  status: string;
  statusColorClass: string;
  allUnitImages: TooltipImageItem[];
  showImagePanel: boolean;
  setShowImagePanel: React.Dispatch<React.SetStateAction<boolean>>;
  targetProject: Project;
  unitCode: string;
  unitName: string;
  onFocusUnit?: (unitName: string) => void;
  onClose: () => void;
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
}

export const TooltipHeaderBar: React.FC<TooltipHeaderBarProps> = ({
  v,
  mdStatus,
  mdStatusColorClass,
  status,
  statusColorClass,
  allUnitImages,
  showImagePanel,
  setShowImagePanel,
  targetProject,
  unitCode,
  unitName,
  onFocusUnit,
  onClose,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
}) => {
  return (
    <div 
      onPointerDown={(e) => {
        e.stopPropagation();
        handlePointerDown(e);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="sticky top-0 z-30 bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-md pb-1.5 pt-0.5 -mt-1 -mx-1 px-1 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-1.5 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Left: MD Status & Project Status Badges */}
      <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
        {/* MD Status Badge */}
        {v.mdStatus && mdStatus && (
          <div 
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? mdStatusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'} flex items-center gap-1`}
            title={`MD Status: ${mdStatus}`}
          >
            <span className="text-[8px] font-semibold uppercase opacity-75">MD:</span>
            <span className="capitalize">{mdStatus}</span>
          </div>
        )}

        {/* Project Status Badge */}
        {v.actStatus && (
          <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${v.legendColor ? statusColorClass : 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600'}`}>
            {status}
          </div>
        )}
      </div>

      {/* Right: Actions (Image Gallery Toggle, Quick Nav, Focus, Close) */}
      <div className="flex items-center gap-1 shrink-0 ml-auto">
        {/* Image & Link Thumbnail Gallery Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowImagePanel(prev => !prev);
          }}
          className={cn(
            "rounded-md transition-all active:scale-95 touch-manipulation cursor-pointer border flex items-center gap-1",
            allUnitImages.length > 0 ? "p-0.5" : "p-1",
            showImagePanel 
              ? "bg-blue-100 text-blue-600 dark:bg-blue-900/60 dark:text-[#8ab4f8] border-blue-400 dark:border-blue-600 shadow-2xs ring-1 ring-blue-400/40" 
              : allUnitImages.length > 0
                ? "bg-white dark:bg-slate-800 text-blue-600 dark:text-[#8ab4f8] border-blue-300 dark:border-blue-700/80 shadow-2xs hover:border-blue-400"
                : "bg-slate-50 text-slate-500 hover:text-blue-600 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-[#8ab4f8] border-slate-200 dark:border-[#444446] hover:bg-slate-100"
          )}
          title={
            showImagePanel 
              ? "Đóng bảng hình ảnh" 
              : allUnitImages.length > 0 
                ? `Có ${allUnitImages.length} hình ảnh/thumbnail. Bấm để xem chi tiết.` 
                : "Mở bảng hình ảnh & link thumbnail"
          }
        >
          {allUnitImages.length > 0 ? (
            <div className="relative flex items-center gap-1">
              {/* Mini Image Thumbnail Preview */}
              <div 
                className="w-5 h-5 rounded overflow-hidden bg-slate-100 dark:bg-slate-900 border border-blue-200 dark:border-blue-800 shrink-0 flex items-center justify-center pointer-events-none"
              >
                <img 
                  src={normalizeImageUrl(allUnitImages[0].url)} 
                  alt="Thumbnail" 
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                    const parent = (e.target as HTMLElement).parentElement;
                    if (parent && !parent.querySelector('.img-fallback-icon')) {
                      const iconSpan = document.createElement('span');
                      iconSpan.className = 'img-fallback-icon flex items-center justify-center text-[10px] text-blue-500 font-bold';
                      iconSpan.innerText = '🖼️';
                      parent.appendChild(iconSpan);
                    }
                  }}
                />
              </div>
              {allUnitImages.length > 1 ? (
                <span className="text-[9px] font-bold font-mono text-blue-600 dark:text-[#8ab4f8] pr-1">
                  +{allUnitImages.length - 1}
                </span>
              ) : (
                <div className="w-1" />
              )}
            </div>
          ) : (
            <ImageIcon className="w-3.5 h-3.5" />
          )}
        </button>

        <QuickNavButton 
          project={targetProject} 
          title={`Quick Navigator (${unitCode})`}
          className="p-1 rounded-md bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-[#333336] dark:hover:text-[#8ab4f8] border border-slate-200 dark:border-[#444446]"
        />

        {onFocusUnit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFocusUnit(unitCode || unitName);
            }}
            className="p-1 rounded-md bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-950/50 dark:hover:text-amber-400 border border-slate-200 dark:border-[#444446] transition-colors active:scale-95 touch-manipulation cursor-pointer"
            title="Phóng to & Focus gian hàng này (Zoom & Center)"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title="Close tooltip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
