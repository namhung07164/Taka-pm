import React, { FC } from 'react';
import { TAB_CONFIG } from './csvExportTypes';

interface CsvExportHeaderTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export const CsvExportHeaderTabs: React.FC<CsvExportHeaderTabsProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm flex flex-col xl:flex-row justify-between items-center gap-4 border border-slate-200 dark:border-[#333336]">
      <div className="flex items-center gap-3 w-full xl:w-auto">
        <div className="bg-blue-600 dark:bg-blue-500 p-3 rounded-xl text-white">
          <i className="ph-fill ph-file-spreadsheet text-2xl"></i>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">
            Taka Data Converter
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Thiết kế file xuất chuyên nghiệp
          </p>
        </div>
      </div>
      <div className="flex bg-slate-100 dark:bg-[#1a1a1c] p-1 rounded-xl overflow-x-auto max-w-full w-full xl:w-auto">
        {Object.values(TAB_CONFIG).map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#333336] text-blue-600 dark:text-blue-400 shadow-sm font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-[#e3e3e3]'
            }`}
          >
            <i className={`ph ${tab.icon} text-lg`}></i>
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};
