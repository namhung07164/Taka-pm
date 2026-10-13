import React, { FC } from 'react';

interface CsvExportFileSectionProps {
  file: File | null;
  sheetNames: string[];
  activeSheet: string;
  onSheetChange: (sheetName: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancelUpload: () => void;
  templateFile: File | null;
  onTemplateUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCancelTemplate: () => void;
  activeTab: string;
  error: string;
}

export const CsvExportFileSection: React.FC<CsvExportFileSectionProps> = ({
  file,
  sheetNames,
  activeSheet,
  onSheetChange,
  onFileUpload,
  onCancelUpload,
  templateFile,
  onTemplateUpload,
  onCancelTemplate,
  activeTab,
  error,
}) => {
  return (
    <div className="space-y-6">
      {/* File Upload Box */}
      <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-[#e3e3e3]">
            <i className="ph ph-upload-simple text-blue-600 dark:text-blue-400 text-lg"></i>{' '}
            1. Tải lên dữ liệu gốc
          </h2>
          {file && (
            <button
              onClick={onCancelUpload}
              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
            >
              <i className="ph-fill ph-x-circle text-sm"></i> Đổi file
            </button>
          )}
        </div>
        <label className="border-2 border-dashed border-slate-200 dark:border-[#333336] rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-[#333336]/50 transition-colors group">
          <i
            className={`ph ${file ? 'ph-file-spreadsheet' : 'ph-cloud-arrow-up'} text-4xl mb-2 transition-colors ${
              file
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-slate-300 dark:text-slate-500 group-hover:text-blue-500'
            }`}
          ></i>
          <span
            className={`text-sm text-center font-medium ${
              file
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {file ? file.name : 'Nhấp hoặc thả file Excel (.xlsx) / CSV'}
          </span>
          <input
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={onFileUpload}
          />
        </label>

        {sheetNames.length > 1 && (
          <div className="mt-4">
            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
              Chọn Sheet:
            </label>
            <select
              value={activeSheet}
              onChange={(e) => onSheetChange(e.target.value)}
              className="w-full p-2.5 bg-slate-50 dark:bg-[#1a1a1c] border border-slate-200 dark:border-[#333336] rounded-xl text-sm font-medium text-slate-700 dark:text-[#e3e3e3] outline-none focus:border-blue-500"
            >
              {sheetNames.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-xs rounded-xl font-medium border border-red-100 dark:border-red-900/50">
            {error}
          </div>
        )}
      </div>

      {/* Template Upload Box for mass_task */}
      {activeTab === 'mass_task' && (
        <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-[#e3e3e3]">
              <i className="ph ph-file-plus text-blue-600 dark:text-blue-400 text-lg"></i>{' '}
              Tải lên Template Attached
            </h2>
            {templateFile && (
              <button
                onClick={onCancelTemplate}
                className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
              >
                <i className="ph-fill ph-x-circle text-sm"></i> Hủy
              </button>
            )}
          </div>
          <label className="border-2 border-dashed border-slate-200 dark:border-[#333336] rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-[#333336]/50 transition-colors group">
            <i
              className={`ph ${templateFile ? 'ph-file-csv' : 'ph-cloud-arrow-up'} text-4xl mb-2 transition-colors ${
                templateFile
                  ? 'text-blue-500 dark:text-blue-400'
                  : 'text-slate-300 dark:text-slate-500 group-hover:text-blue-400'
              }`}
            ></i>
            <span
              className={`text-sm text-center font-medium ${
                templateFile
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {templateFile ? templateFile.name : 'Chọn file attached (Template)'}
            </span>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,.xls,.csv"
              onChange={onTemplateUpload}
            />
          </label>
        </div>
      )}
    </div>
  );
};
