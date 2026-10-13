import React, { Dispatch, FC, SetStateAction } from 'react';
import { TAB_CONFIG } from './csvExportTypes';

interface CsvExportMappingTableProps {
  activeTab: string;
  isLocked: boolean;
  mapping: Record<string, string>;
  setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  keepOriginal: Record<string, boolean>;
  setKeepOriginal: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  constantMapping: Record<string, string>;
  setConstantMapping: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  excelHeaders: string[];
  onLockToggle: () => void;
}

export const CsvExportMappingTable: React.FC<CsvExportMappingTableProps> = ({
  activeTab,
  isLocked,
  mapping,
  setMapping,
  keepOriginal,
  setKeepOriginal,
  constantMapping,
  setConstantMapping,
  excelHeaders,
  onLockToggle,
}) => {
  return (
    <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] relative">
      <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-[#333336]">
        <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-[#e3e3e3]">
          <i className="ph ph-intersect text-blue-600 dark:text-blue-400 text-lg"></i>{' '}
          2. Cấu hình cột
        </h2>
        <button
          onClick={onLockToggle}
          className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold transition-colors cursor-pointer ${
            isLocked
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          }`}
        >
          <i className={isLocked ? 'ph-fill ph-lock-key' : 'ph ph-floppy-disk'}></i>
          {isLocked ? 'Đã khóa' : 'Lưu & Khóa'}
        </button>
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {TAB_CONFIG[activeTab]?.columns
          ?.filter((col: string) => {
            if (activeTab === 'mass_task') {
              return [
                'store',
                'location',
                'projectCode',
                'predecessor',
                'projectYear',
              ].includes(col);
            }
            return true;
          })
          .map((col: string) => (
            <div key={col} className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {col}
              </label>
              <div className="flex gap-2">
                <select
                  disabled={isLocked}
                  className="flex-1 w-0 p-2 border border-slate-200 dark:border-[#333336] rounded-lg text-xs bg-slate-50 dark:bg-[#1a1a1c] disabled:bg-slate-100 dark:disabled:bg-[#333336]/50 disabled:text-slate-400 dark:disabled:text-slate-500 outline-none focus:border-blue-500 dark:focus:border-blue-500 text-slate-800 dark:text-[#e3e3e3]"
                  value={mapping[col] || ''}
                  onChange={(e) =>
                    setMapping({ ...mapping, [col]: e.target.value })
                  }
                >
                  <option value="">-- Cột Excel --</option>
                  {excelHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {(activeTab === 'task' || activeTab === 'mass_task') && (
                  <div
                    className="flex items-center"
                    title="Giữ nguyên giá trị tải lên"
                  >
                    <input
                      type="checkbox"
                      disabled={isLocked}
                      checked={!!keepOriginal[col]}
                      onChange={(e) =>
                        setKeepOriginal({
                          ...keepOriginal,
                          [col]: e.target.checked,
                        })
                      }
                      className="w-4 h-4 cursor-pointer border-slate-300 dark:border-[#333336] rounded text-blue-600 dark:text-blue-500 focus:ring-blue-500 dark:focus:ring-blue-500 bg-white dark:bg-[#1a1a1c]"
                    />
                  </div>
                )}
                <input
                  disabled={isLocked}
                  type="text"
                  placeholder="Giá trị tĩnh..."
                  className="w-24 p-2 border border-slate-200 dark:border-[#333336] rounded-lg text-xs disabled:bg-slate-100 dark:disabled:bg-[#333336]/50 disabled:text-slate-400 dark:disabled:text-slate-500 outline-none focus:border-blue-500 dark:focus:border-blue-500 text-slate-800 dark:text-[#e3e3e3] bg-white dark:bg-[#1a1a1c]"
                  value={constantMapping[col] || ''}
                  onChange={(e) =>
                    setConstantMapping({
                      ...constantMapping,
                      [col]: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
