import React from 'react';
import { Palette, ChevronDown, ChevronUp } from 'lucide-react';

interface LiveLayoutLegendBarProps {
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  isLegendStripCollapsed: boolean;
  setIsLegendStripCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  onOpenLegendModal: () => void;
}

export const LiveLayoutLegendBar: React.FC<LiveLayoutLegendBarProps> = ({
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
  isLegendStripCollapsed,
  setIsLegendStripCollapsed,
  onOpenLegendModal,
}) => {
  return (
    <div className="hidden lg:flex absolute bottom-4 left-4 z-20 max-w-[85vw] sm:max-w-xl pointer-events-auto">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-2 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 transition-all flex flex-col gap-1.5 w-full">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 tracking-wide">
              Phân loại mặt bằng
            </span>
            {activeGroups.length > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {activeGroups.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onOpenLegendModal}
              className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 hover:underline px-1 py-0.5"
            >
              Xem chi tiết
            </button>
            <button
              onClick={() => setIsLegendStripCollapsed(prev => !prev)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
              title={isLegendStripCollapsed ? "Mở rộng thanh màu" : "Thu gọn"}
            >
              {isLegendStripCollapsed ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Swatches List */}
        {!isLegendStripCollapsed && (
          activeGroups.length === 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Bình thường</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6]"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Đang xử lý</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Sắp đến hạn</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Chậm tiến độ</span>
              </div>
            </div>
          ) : (
            <div
              className="flex items-center gap-1.5 overflow-x-auto py-0.5"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {activeGroups.map((g: any) => {
                const isSelected = selectedLegendGroupId === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                      style={{ backgroundColor: g.color || '#94a3b8' }}
                    />
                    <span className="truncate max-w-[120px]">{g.name || 'Nhóm'}</span>
                    <span className="text-[10px] opacity-75 font-normal">({g.count})</span>
                  </button>
                );
              })}
              {selectedLegendGroupId !== null && (
                <button
                  onClick={() => setSelectedLegendGroupId(null)}
                  className="px-2 py-0.5 rounded-full text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 shrink-0 transition-colors"
                >
                  Xóa lọc
                </button>
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};
