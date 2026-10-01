import React from 'react';
import { Palette, X } from 'lucide-react';

interface LiveLayoutLegendModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: React.Dispatch<React.SetStateAction<string | null>>;
  units: any[];
  unitColorMap: Map<string, string>;
}

export const LiveLayoutLegendModal: React.FC<LiveLayoutLegendModalProps> = ({
  isOpen,
  onClose,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
  units,
  unitColorMap,
}) => {
  if (!isOpen) return null;

  const unassignedCount = units.filter((u: any) => !unitColorMap.has(u.id)).length;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-3xl sm:rounded-2xl w-full max-w-lg p-5 text-slate-800 dark:text-slate-100 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
            <Palette className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            Bảng chú giải màu sắc (Color Legend)
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Active Groups Section */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Nhóm chuyên đề đang áp dụng
            </span>
            {selectedLegendGroupId !== null && (
              <button
                onClick={() => setSelectedLegendGroupId(null)}
                className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline"
              >
                Xóa bộ lọc nhóm
              </button>
            )}
          </div>

          {activeGroups.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 text-xs text-slate-500 text-center">
              Chưa có nhóm màu sắc nào được gán quy tắc hiển thị trên tầng này.
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
                        ? 'bg-brand-50 dark:bg-brand-950/40 border-brand-500 shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white dark:ring-slate-900"
                          style={{ backgroundColor: g.color || '#94a3b8' }}
                        />
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                          {g.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                        {g.count} gian hàng
                      </span>
                    </div>
                    {g.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 pl-6 line-clamp-2">
                        {g.description}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Unassigned Units */}
          {unassignedCount > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2.5">
                  <span className="w-3.5 h-3.5 rounded-full bg-slate-300 dark:bg-slate-600 border border-white dark:border-slate-800" />
                  <span className="font-semibold text-xs text-slate-600 dark:text-slate-400">
                    Gian hàng chưa gán màu / Không nằm trong nhóm
                  </span>
                </div>
                <span className="text-xs font-bold text-slate-500">
                  {unassignedCount}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
