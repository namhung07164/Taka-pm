import React, { useState, useRef, useEffect } from 'react';
import { Palette, ChevronUp, ChevronDown, Download, RefreshCw, FileText, Image as ImageIcon, Printer, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LayoutColorLegendBarProps {
  layoutTooltipVisibility: any;
  activeGroups: any[];
  selectedLegendGroupId: string | null;
  setSelectedLegendGroupId: (id: string | null) => void;
  setShowLegendModal?: (show: boolean) => void;
  isLegendStripCollapsed?: boolean;
  setIsLegendStripCollapsed?: React.Dispatch<React.SetStateAction<boolean>>;
  canWrite?: boolean;
  handleTriggerExport?: () => void | Promise<void>;
  isExporting?: boolean;
  exportStatus?: string;
  handleExport?: (type: 'jpeg' | 'pdf') => void;
  setIsPrintPreview?: (show: boolean) => void;
}

export const LayoutColorLegendBar: React.FC<LayoutColorLegendBarProps> = React.memo(({
  layoutTooltipVisibility,
  activeGroups,
  selectedLegendGroupId,
  setSelectedLegendGroupId,
  setShowLegendModal,
  isLegendStripCollapsed: propIsCollapsed,
  setIsLegendStripCollapsed: propSetIsCollapsed,
  canWrite = false,
  handleTriggerExport,
  isExporting = false,
  exportStatus = '',
  handleExport,
  setIsPrintPreview,
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  const isCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : internalCollapsed;
  const toggleCollapsed = () => {
    if (propSetIsCollapsed) {
      propSetIsCollapsed(!isCollapsed);
    } else {
      setInternalCollapsed(prev => !prev);
    }
  };

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    if (showExportMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showExportMenu]);

  if (layoutTooltipVisibility?.legendColor === false) return null;

  return (
    <div className="absolute bottom-3 left-3 sm:left-4 z-20 pointer-events-auto hide-on-actual-print print:hidden max-w-[calc(100vw-24px)] sm:max-w-xl transition-all duration-200">
      <div className="bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl p-1.5 sm:p-2 transition-all">
        {/* Compact Header Row */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          {/* Legend Title & Swatch Count */}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left cursor-pointer active:scale-95"
            title={isCollapsed ? "Mở rộng chú thích màu" : "Thu gọn chú thích màu"}
          >
            <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 shrink-0">
              <Palette className="w-3.5 h-3.5" />
            </span>
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap">
              Chú thích màu
            </span>
            {activeGroups.length > 0 && (
              <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shrink-0">
                {activeGroups.length}
              </span>
            )}
          </button>

          {/* Action Tools: Clear Filter, Full Modal, Export Dropdown, Expand/Collapse */}
          <div className="flex items-center gap-1 shrink-0">
            {selectedLegendGroupId && (
              <button
                type="button"
                onClick={() => setSelectedLegendGroupId(null)}
                className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 cursor-pointer"
              >
                Bỏ lọc
              </button>
            )}

            {setShowLegendModal && !isCollapsed && (
              <button
                type="button"
                onClick={() => setShowLegendModal(true)}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer hidden sm:inline-block"
              >
                Chi tiết
              </button>
            )}

            {/* Export Menu Button */}
            <div className="relative" ref={exportMenuRef}>
              <button
                type="button"
                onClick={() => setShowExportMenu(prev => !prev)}
                disabled={isExporting}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold transition-all border shadow-xs active:scale-95 cursor-pointer whitespace-nowrap",
                  isExporting
                    ? "bg-amber-500 text-white border-amber-600 animate-pulse"
                    : "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700"
                )}
                title="Xuất file bản đồ / Trigger Cloud R2"
              >
                {isExporting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                <span className="hidden xs:inline sm:inline">Export</span>
              </button>

              {/* Export Popover Dropdown */}
              {showExportMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-52 bg-white dark:bg-[#1e1e20] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-1.5 flex flex-col gap-1 z-30 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    Tùy chọn xuất bản đồ
                  </div>

                  {canWrite && handleTriggerExport && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        handleTriggerExport();
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-left transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                      <div>
                        <div className="font-bold">Trigger Sync (Cloud R2)</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Đồng bộ tự động các tầng</div>
                      </div>
                    </button>
                  )}

                  {handleExport && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handleExport('jpeg');
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <div>
                          <div className="font-bold">Xuất ảnh (JPEG)</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Tải ảnh mặt bằng HD</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowExportMenu(false);
                          handleExport('pdf');
                        }}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <div>
                          <div className="font-bold">Xuất PDF</div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Tải tài liệu PDF chuẩn A3/A4</div>
                        </div>
                      </button>
                    </>
                  )}

                  {setIsPrintPreview && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        setIsPrintPreview(true);
                      }}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800 pt-1.5"
                    >
                      <Printer className="w-3.5 h-3.5 shrink-0 text-purple-500" />
                      <div>
                        <div className="font-bold">Print Preview</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Xem trước & in ấn trực tiếp</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Collapse / Expand Toggle Button */}
            <button
              type="button"
              onClick={toggleCollapsed}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title={isCollapsed ? "Mở rộng danh sách màu" : "Thu gọn"}
            >
              {isCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Swatches List (Only visible when Expanded) */}
        {!isCollapsed && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1.5">
            {activeGroups.length === 0 ? (
              <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 text-xs" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Completed</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  <span className="text-[10px] font-medium whitespace-nowrap">On Process</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Upcoming</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <span className="text-[10px] font-medium whitespace-nowrap">Delay</span>
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
                      type="button"
                      onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                      className={cn(
                        "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer active:scale-95",
                        isSelected
                          ? "bg-purple-100 dark:bg-purple-950 border-purple-400 text-purple-900 dark:text-purple-100 shadow-xs"
                          : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                      )}
                      title={`Bấm để ${isSelected ? 'bỏ lọc' : 'lọc & highlight'} nhóm ${g.name}`}
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs border border-black/15" 
                        style={{ backgroundColor: g.color }}
                      />
                      <span className="whitespace-nowrap font-medium text-[10px] sm:text-[11px]">
                        {g.name}
                      </span>
                      <span className="text-[9px] font-mono font-bold px-1 py-0.1 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
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
