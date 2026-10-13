import React, { FC } from 'react';
import { TAB_CONFIG } from './csvExportTypes';

interface CsvExportPreviewSectionProps {
  activeTab: string;
  previewData: any[];
  excelData: any[];
  file: File | null;
  templateFile: File | null;
  onExport: () => void;
}

export const CsvExportPreviewSection: React.FC<CsvExportPreviewSectionProps> = ({
  activeTab,
  previewData,
  excelData,
  file,
  templateFile,
  onExport,
}) => {
  return (
    <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] min-h-[500px] flex flex-col">
      <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100 dark:border-[#333336]">
        <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-[#e3e3e3]">
          <i className="ph ph-eye text-blue-600 dark:text-blue-400 text-lg"></i>{' '}
          3. Xem trước & Xuất bản
        </h2>
        <button
          disabled={!file}
          onClick={onExport}
          className="bg-slate-900 dark:bg-[#e3e3e3] text-white dark:text-slate-900 px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <i className="ph ph-export text-lg"></i>
          Tải xuống Excel
        </button>
      </div>

      {previewData.length > 0 ? (
        <div className="overflow-x-auto flex-1 rounded-xl border border-slate-200 dark:border-[#333336]">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-[#1a1a1c] text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-[#333336] uppercase text-xs tracking-wider">
              <tr>
                {TAB_CONFIG[activeTab]?.columns.map((c: string) => (
                  <th key={c} className="px-4 py-3 font-bold whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#333336]">
              {previewData.map((row: any, i: number) => (
                <tr
                  key={i}
                  className="hover:bg-slate-50 dark:hover:bg-[#333336]/50 transition-colors"
                >
                  {TAB_CONFIG[activeTab]?.columns.map((c: string) => {
                    const displayVal = row[c];
                    return (
                      <td
                        key={c}
                        className="px-4 py-3 text-slate-600 dark:text-[#e3e3e3] truncate max-w-[150px]"
                        title={displayVal || ''}
                      >
                        {displayVal || (
                          <span className="text-slate-300 dark:text-slate-600">
                            -
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {excelData.length > 0 && (
            <div className="text-center py-3 text-xs text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-[#1a1a1c] border-t border-slate-100 dark:border-[#333336]">
              Đang hiển thị tối đa 10 dòng đầu tiên. File tải xuống sẽ chứa toàn bộ{' '}
              {activeTab === 'mass_task'
                ? `dữ liệu từ ${excelData.length} project`
                : `${excelData.length} dòng`}
              .
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-[#1a1a1c]/50 rounded-xl border border-dashed border-slate-200 dark:border-[#333336]">
          <i className="ph ph-file-search text-6xl mb-4 text-slate-300 dark:text-slate-600"></i>
          <p className="font-medium">
            {activeTab === 'mass_task' &&
            (!templateFile || excelData.length === 0)
              ? 'Vui lòng tải lên cả file mass project name và file Attached'
              : 'Vui lòng tải lên một file để xem dữ liệu'}
          </p>
        </div>
      )}
    </div>
  );
};
