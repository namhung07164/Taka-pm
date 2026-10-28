import React from 'react';
import { RefreshCw, Image as ImageIcon, FileText, Printer } from 'lucide-react';

interface LayoutLegendExportMenuProps {
  canWrite?: boolean;
  handleTriggerExport?: () => void | Promise<void>;
  handleExport?: (type: 'jpeg' | 'pdf') => void;
  setIsPrintPreview?: (show: boolean) => void;
  onClose: () => void;
}

export const LayoutLegendExportMenu: React.FC<LayoutLegendExportMenuProps> = ({
  canWrite,
  handleTriggerExport,
  handleExport,
  setIsPrintPreview,
  onClose,
}) => {
  return (
    <div className="absolute top-full right-0 mt-1.5 w-56 bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 flex flex-col gap-1 z-40 animate-in fade-in zoom-in-95 duration-150">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
        Export Options
      </div>

      {canWrite && handleTriggerExport && (
        <button
          type="button"
          onClick={() => {
            onClose();
            handleTriggerExport();
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-left transition-colors cursor-pointer active:scale-95"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
          <div>
            <div className="font-bold">Sync to Cloud R2</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Auto-sync all floor layouts</div>
          </div>
        </button>
      )}

      {handleExport && (
        <>
          <button
            type="button"
            onClick={() => {
              onClose();
              handleExport('jpeg');
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer active:scale-95"
          >
            <ImageIcon className="w-3.5 h-3.5 shrink-0 text-blue-500" />
            <div>
              <div className="font-bold">Export Image (JPEG)</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">High-resolution layout capture</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onClose();
              handleExport('pdf');
            }}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer active:scale-95"
          >
            <FileText className="w-3.5 h-3.5 shrink-0 text-rose-500" />
            <div>
              <div className="font-bold">Export PDF</div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Architectural A3/A4 document</div>
            </div>
          </button>
        </>
      )}

      {setIsPrintPreview && (
        <button
          type="button"
          onClick={() => {
            onClose();
            setIsPrintPreview(true);
          }}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer border-t border-slate-100 dark:border-slate-800 pt-1.5 active:scale-95"
        >
          <Printer className="w-3.5 h-3.5 shrink-0 text-purple-500" />
          <div>
            <div className="font-bold">Print Preview</div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">Direct blueprint print layout</div>
          </div>
        </button>
      )}
    </div>
  );
};
