import React from 'react';
import { createPortal } from 'react-dom';
import { Palette, X } from 'lucide-react';

export interface LayoutColorLegendModalProps {
  showLegendModal: boolean;
  onClose: () => void;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: (id: string | null) => void;
}

export const LayoutColorLegendModal: React.FC<LayoutColorLegendModalProps> = ({
  showLegendModal,
  onClose,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
}) => {
  if (!showLegendModal) return null;

  const content = (
    <div className="fixed inset-0 z-[150000] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150 hide-on-actual-print print:hidden">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
            <Palette className="w-5 h-5 text-purple-600" />
            Bảng Chú Thích Màu (Color Legend)
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Groups Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
              Nhóm Phân Loại Đang Áp Dụng ({activeGroups.length})
            </div>
            {selectedLegendGroupId && (
              <button
                onClick={() => setSelectedLegendGroupId(null)}
                className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium"
              >
                Clear group filter
              </button>
            )}
          </div>

          {activeGroups.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
              Map colors currently reflect project progress status or have no custom classification groups.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {activeGroups.map((g: any) => {
                const isSelected = selectedLegendGroupId === g.id;
                return (
                  <div 
                    key={g.id}
                    onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <div 
                          className="w-4 h-4 rounded-full shadow-sm border border-black/15 shrink-0" 
                          style={{ backgroundColor: g.color }} 
                        />
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          {g.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                        {g.matchCount} gian hàng
                      </span>
                    </div>

                    {g.matchedUnits && g.matchedUnits.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {g.matchedUnits.slice(0, 15).map((u: any) => (
                          <span 
                            key={u.id}
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          >
                            {u.name}
                          </span>
                        ))}
                        {g.matchedUnits.length > 15 && (
                          <span className="text-[10px] text-slate-400 self-center">
                            +{g.matchedUnits.length - 15} nữa...
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};
