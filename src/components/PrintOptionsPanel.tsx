import React from "react";
import { motion } from "motion/react";
import { X, GripHorizontal } from "lucide-react";
import { useAppStore } from "../store/useAppStore";

interface PrintOptionsPanelProps {
  activeTab: string;
  onClose: () => void;
  onPrintToPDF: () => void;
  onExportToExcel: () => void;
}

export const PrintOptionsPanel: React.FC<PrintOptionsPanelProps> = React.memo(({
  activeTab,
  onClose,
  onPrintToPDF,
  onExportToExcel,
}) => {
  const printTarget = useAppStore(state => state.printTarget);
  const setPrintTarget = useAppStore(state => state.setPrintTarget);
  const printOrientation = useAppStore(state => state.printOrientation);
  const setPrintOrientation = useAppStore(state => state.setPrintOrientation);
  const printPaperSize = useAppStore(state => state.printPaperSize);
  const setPrintPaperSize = useAppStore(state => state.setPrintPaperSize);
  const printScaleMode = useAppStore(state => state.printScaleMode);
  const setPrintScaleMode = useAppStore(state => state.setPrintScaleMode);
  const printScaleCustom = useAppStore(state => state.printScaleCustom);
  const setPrintScaleCustom = useAppStore(state => state.setPrintScaleCustom);
  const printDpi = useAppStore(state => state.printDpi);
  const setPrintDpi = useAppStore(state => state.setPrintDpi);
  const printWatermark = useAppStore(state => state.printWatermark);
  const setPrintWatermark = useAppStore(state => state.setPrintWatermark);
  const printFilterHeader = useAppStore(state => state.printFilterHeader);
  const setPrintFilterHeader = useAppStore(state => state.setPrintFilterHeader);
  const printDate = useAppStore(state => state.printDate);
  const setPrintDate = useAppStore(state => state.setPrintDate);
  const printRangeType = useAppStore(state => state.printRangeType);
  const setPrintRangeType = useAppStore(state => state.setPrintRangeType);
  const printStartDate = useAppStore(state => state.printStartDate);
  const setPrintStartDate = useAppStore(state => state.setPrintStartDate);
  const printEndDate = useAppStore(state => state.printEndDate);
  const setPrintEndDate = useAppStore(state => state.setPrintEndDate);
  const isExportingPDF = useAppStore(state => state.isExportingPDF);

  return (
    <motion.div 
      drag
      dragMomentum={false}
      className="fixed top-4 right-4 z-[9999] bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-[#f3f3f3] p-4 rounded-xl shadow-2xl border border-slate-200 dark:border-[#333336] flex flex-col gap-4 animate-in slide-in-from-top-4 hide-on-actual-print min-w-[280px]"
    >
      <div className="flex items-center justify-between cursor-move">
        <div className="flex items-center gap-2">
          <GripHorizontal className="text-slate-400" size={16} />
          <span className="font-bold text-sm">Print Options</span>
        </div>
        <button 
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-[#333336] rounded-md transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Printer Target */}
        <div className="flex flex-col gap-1.5 col-span-2 mb-1">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Printer</span>
          <select
            value={printTarget}
            onChange={(e) => setPrintTarget(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-1.5 outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3]"
          >
            <option value="pdf">Download PDF (High Quality / Light)</option>
            <option value="browser">Direct Browser Print (Ctrl+P / Vector)</option>
            {activeTab !== 'gantt' && <option value="excel">Export to Excel</option>}
          </select>
        </div>

        {/* Orientation */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Orientation</span>
          <div className="flex bg-slate-100 dark:bg-[#131314] p-1 rounded-md border border-slate-200 dark:border-[#444446]">
            <button
              onClick={() => setPrintOrientation("portrait")}
              className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${printOrientation === 'portrait' ? 'bg-white dark:bg-[#333336] shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Portrait
            </button>
            <button
              onClick={() => setPrintOrientation("landscape")}
              className={`flex-1 py-1 rounded text-xs font-bold transition-colors ${printOrientation === 'landscape' ? 'bg-white dark:bg-[#333336] shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            >
              Land.
            </button>
          </div>
        </div>

        {/* Paper Size */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Paper Size</span>
          <select
            value={printPaperSize}
            onChange={(e) => setPrintPaperSize(e.target.value as "A2" | "A3" | "A4")}
            className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-[7px] outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-200 dark:hover:bg-[#28282a] transition-colors h-[28px]"
          >
            <option value="A4">A4</option>
            <option value="A3">A3</option>
            <option value="A2">A2</option>
          </select>
        </div>

        {/* Scale */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Scale</span>
          <select
            value={printScaleMode}
            onChange={(e) => setPrintScaleMode(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-[7px] outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-200 dark:hover:bg-[#28282a] transition-colors h-[28px]"
          >
            <option value="default">Default</option>
            <option value="fit-cols">Fit to width (cols on 1 page)</option>
            <option value="fit-rows">Fit to height (rows on 1 page)</option>
            <option value="fit-page">Fit to 1 page</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {printScaleMode === "custom" && (
          <div className="flex flex-col gap-1.5 mt-2">
            <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Custom (%)</span>
            <input
              type="number"
              min="10"
              max="200"
              step="5"
              value={printScaleCustom}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) setPrintScaleCustom(val);
              }}
              className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-[5px] outline-none text-slate-700 dark:text-[#e3e3e3] h-[28px]"
            />
          </div>
        )}

        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Image Quality (DPI)</span>
          <select
            value={printDpi}
            onChange={(e) => setPrintDpi(parseInt(e.target.value, 10))}
            className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-1.5 outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3]"
          >
            <option value={96}>96 DPI (Fastest)</option>
            <option value={150}>150 DPI (Balanced)</option>
            <option value={200}>200 DPI (High Detail)</option>
            <option value={300}>300 DPI (Ultra Sharp)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 mt-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Watermark</span>
          <select
            value={printWatermark}
            onChange={(e) => setPrintWatermark(e.target.value as any)}
            className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-1.5 outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3]"
          >
            <option value="none">None</option>
            <option value="draft">DRAFT</option>
            <option value="confidential">CONFIDENTIAL</option>
          </select>
        </div>

        {/* Header & Date Checkboxes */}
        <div className="flex flex-col gap-2 justify-center mt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={printFilterHeader}
              onChange={() => setPrintFilterHeader(!printFilterHeader)}
              className="w-4 h-4 cursor-pointer text-blue-600 rounded"
            />
            <span className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3]">Show Filter Header</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={printDate}
              onChange={() => setPrintDate(!printDate)}
              className="w-4 h-4 cursor-pointer text-blue-600 rounded"
            />
            <span className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3]">Show Date</span>
          </label>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">Range</span>
        <select
          value={printRangeType}
          onChange={(e) => setPrintRangeType(e.target.value as "entire" | "custom")}
          className="w-full text-xs font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-2 outline-none cursor-pointer text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-200 dark:hover:bg-[#28282a] transition-colors"
        >
          <option value="entire">Entire Project</option>
          <option value="custom">Custom Date Range</option>
        </select>
        {printRangeType === "custom" && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="date"
              defaultValue={printStartDate || ""}
              onBlur={(e) => setPrintStartDate(e.target.value || null)}
              className="w-1/2 text-[11px] font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-1.5 outline-none text-slate-700 dark:text-[#e3e3e3]"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              defaultValue={printEndDate || ""}
              onBlur={(e) => setPrintEndDate(e.target.value || null)}
              className="w-1/2 text-[11px] font-bold bg-slate-100 dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-md px-2 py-1.5 outline-none text-slate-700 dark:text-[#e3e3e3]"
            />
          </div>
        )}
      </div>

      <button 
        onClick={printTarget === 'excel' ? onExportToExcel : onPrintToPDF}
        className="mt-1 w-full bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500 py-2 rounded-md text-sm font-bold transition-colors shadow-sm active:scale-95 touch-manipulation flex items-center justify-center gap-2"
        disabled={isExportingPDF}
      >
        {isExportingPDF 
          ? "Processing..." 
          : printTarget === 'excel' 
          ? "Export to Excel" 
          : printTarget === 'browser' 
          ? "Open Browser Print" 
          : "Download PDF"}
      </button>
    </motion.div>
  );
});

PrintOptionsPanel.displayName = 'PrintOptionsPanel';
