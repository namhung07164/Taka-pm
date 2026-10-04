import React from 'react';
import { Palette, ChevronUp, ChevronDown } from 'lucide-react';

export interface LayoutColorLegendBarProps {
  layoutTooltipVisibility: any;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: (id: string | null) => void;
  setShowLegendModal: (show: boolean) => void;
  isLegendStripCollapsed: boolean;
  setIsLegendStripCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
}

export const LayoutColorLegendBar: React.FC<LayoutColorLegendBarProps> = React.memo(({
  layoutTooltipVisibility,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
  setShowLegendModal,
  isLegendStripCollapsed,
  setIsLegendStripCollapsed,
}) => {
  if (layoutTooltipVisibility?.legendColor === false) return null;

  return (
    <div className="hidden sm:block absolute bottom-16 left-4 max-w-xl z-20 pointer-events-auto hide-on-actual-print print:hidden">
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl p-2.5 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
              <Palette className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Chú thích màu
            </span>
            {activeGroups.length > 0 && (
              <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                {activeGroups.length} nhóm
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {selectedLegendGroupId && (
              <button
                onClick={() => setSelectedLegendGroupId(null)}
                className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline px-1.5 py-0.5"
              >
                Bỏ lọc
              </button>
            )}
            <button
              onClick={() => setShowLegendModal(true)}
              className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Bảng đầy đủ
            </button>
            <button
              onClick={() => setIsLegendStripCollapsed(!isLegendStripCollapsed)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isLegendStripCollapsed ? "Mở rộng" : "Thu gọn"}
            >
              {isLegendStripCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Swatches List */}
        {!isLegendStripCollapsed && (
          <div className="pt-2">
            {activeGroups.length === 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[11px] font-medium whitespace-nowrap">Completed</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-[11px] font-medium whitespace-nowrap">On Process</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-[11px] font-medium whitespace-nowrap">Upcoming</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-[11px] font-medium whitespace-nowrap">Delay</span>
                </div>
              </div>
            ) : (
              <div 
                className="flex items-center gap-1.5 overflow-x-auto pb-0.5 touch-pan-x"
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
                          ? 'bg-purple-100 dark:bg-purple-950 border-purple-400 text-purple-900 dark:text-purple-100 shadow-sm scale-105'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                      title={`Bấm để ${isSelected ? 'bỏ lọc' : 'lọc & highlight'} nhóm ${g.name}`}
                    >
                      <span 
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-black/15" 
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="whitespace-nowrap font-medium text-[11px] sm:text-xs">
                        {g.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {g.matchCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
