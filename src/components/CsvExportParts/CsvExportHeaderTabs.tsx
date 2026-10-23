import React from 'react';
import { Cloud } from 'lucide-react';
import { TAB_CONFIG, CsvTabConfigItem } from './csvExportTypes';

interface CsvExportHeaderTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  onOpenR2Modal?: () => void;
}

export const CsvExportHeaderTabs: React.FC<CsvExportHeaderTabsProps> = ({
  activeTab,
  onTabChange,
  onOpenR2Modal,
}) => {
  const tabs = Object.values(TAB_CONFIG);

  return (
    <div className="bg-white dark:bg-[#28282a] p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] flex flex-col gap-4">
      {/* Top Header Row: Title & Cloud R2 Action Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 dark:bg-blue-500 p-2.5 rounded-xl text-white shadow-xs">
            <i className="ph-fill ph-file-spreadsheet text-2xl"></i>
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-[#e3e3e3] tracking-tight">
              Taka Data Converter
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Thiết kế file xuất chuyên nghiệp
            </p>
          </div>
        </div>

        {onOpenR2Modal && (
          <button
            type="button"
            onClick={onOpenR2Modal}
            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95 touch-manipulation whitespace-nowrap self-end sm:self-auto"
            title="Lưu và mở các thư mục mẫu upload lên Cloudflare R2"
          >
            <Cloud className="w-4 h-4" />
            <span>Mẫu Cloud R2</span>
          </button>
        )}
      </div>

      {/* 2-Line Tab Navigation Grid (5 items per line) */}
      <div className="bg-slate-100/90 dark:bg-[#1a1a1c] p-1.5 rounded-xl border border-slate-200/60 dark:border-[#333336]/60">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 w-full">
          {tabs.map((tab: CsvTabConfigItem) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                title={tab.label}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 touch-manipulation text-center ${
                  isActive
                    ? 'bg-white dark:bg-[#333336] text-blue-600 dark:text-blue-400 shadow-xs font-bold border border-slate-200/80 dark:border-white/10 ring-1 ring-black/5 dark:ring-white/5'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-[#e3e3e3] hover:bg-white/60 dark:hover:bg-[#28282a]/60'
                }`}
              >
                <i className={`ph ${tab.icon} text-base shrink-0`}></i>
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

