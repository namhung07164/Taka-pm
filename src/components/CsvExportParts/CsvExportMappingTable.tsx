import React, { useState } from 'react';
import { BookmarkCheck, Plus, Trash2, Check, X } from 'lucide-react';
import { TAB_CONFIG } from './csvExportTypes';
import { CsvMappingPreset } from './csvExportHabitService';

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
  presets?: CsvMappingPreset[];
  activePresetId?: string;
  onSelectPreset?: (presetId: string) => void;
  onSavePreset?: (name: string) => void;
  onDeletePreset?: (presetId: string) => void;
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
  presets = [],
  activePresetId = 'default',
  onSelectPreset,
  onSavePreset,
  onDeletePreset,
}) => {
  const [isNamingPreset, setIsNamingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const visibleColumns = (TAB_CONFIG[activeTab]?.columns || []).filter((col: string) => {
    if (activeTab === 'mass_task') {
      return [
        'store',
        'location',
        'projectCode',
        'predecessor',
        'projectYear',
        'Sub-task code',
        'Parent task code',
        'delegation',
      ].includes(col);
    }
    return true;
  });

  const savedColsCount = visibleColumns.filter((c) => Boolean(mapping[c])).length;
  const tickedCount = visibleColumns.filter((c) => Boolean(keepOriginal[c])).length;
  const staticCount = visibleColumns.filter((c) => Boolean(constantMapping[c])).length;

  const handleConfirmSavePreset = () => {
    if (!newPresetName.trim()) return;
    onSavePreset?.(newPresetName.trim());
    setNewPresetName('');
    setIsNamingPreset(false);
  };

  return (
    <div className="bg-white dark:bg-[#28282a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-[#333336] relative">
      <div className="flex justify-between items-center mb-3 pb-3 border-b border-slate-100 dark:border-[#333336]">
        <div>
          <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-[#e3e3e3]">
            <i className="ph ph-intersect text-blue-600 dark:text-blue-400 text-lg"></i>{' '}
            2. Cấu hình cột
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
            Tự động nhớ cột đã chọn ({savedColsCount}), ô tick ({tickedCount}) & giá trị tĩnh ({staticCount}) khi chọn file
          </p>
        </div>
        <button
          onClick={onLockToggle}
          className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 font-bold transition-colors cursor-pointer active:scale-95 touch-manipulation ${
            isLocked
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50'
              : 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50'
          }`}
          title="Lưu thói quen hiện tại lên Cloud và khóa cấu hình"
        >
          <i className={isLocked ? 'ph-fill ph-lock-key' : 'ph ph-floppy-disk'}></i>
          {isLocked ? 'Đã khóa' : 'Lưu & Khóa'}
        </button>
      </div>

      {/* Preset / Habit Selector Bar */}
      <div className="mb-4 p-2.5 rounded-xl bg-slate-50 dark:bg-[#1e1e20] border border-slate-200/80 dark:border-[#333336] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <BookmarkCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Mẫu thói quen tự động:
          </span>
          {!isLocked && !isNamingPreset && (
            <button
              type="button"
              onClick={() => setIsNamingPreset(true)}
              className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              title="Lưu cách chọn cột, ô tick và giá trị tĩnh hiện tại thành một mẫu tùy chỉnh"
            >
              <Plus className="w-3 h-3" />
              Lưu thành mẫu
            </button>
          )}
        </div>

        {isNamingPreset ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmSavePreset();
                if (e.key === 'Escape') setIsNamingPreset(false);
              }}
              placeholder="Tên mẫu (vd: Design Timeline HN 2027)..."
              autoFocus
              className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-blue-400 dark:border-blue-500 bg-white dark:bg-[#1a1a1c] text-slate-800 dark:text-[#e3e3e3] outline-none"
            />
            <button
              type="button"
              onClick={handleConfirmSavePreset}
              className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-95"
              title="Lưu mẫu"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsNamingPreset(false)}
              className="p-1.5 rounded-lg bg-slate-200 dark:bg-[#333336] text-slate-600 dark:text-slate-300 cursor-pointer active:scale-95"
              title="Hủy"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <select
              disabled={isLocked}
              value={activePresetId}
              onChange={(e) => onSelectPreset?.(e.target.value)}
              className="flex-1 min-w-0 p-1.5 border border-slate-200 dark:border-[#333336] rounded-lg text-xs font-semibold bg-white dark:bg-[#1a1a1c] text-slate-700 dark:text-[#e3e3e3] disabled:opacity-60 outline-none focus:border-blue-500"
            >
              <option value="default">★ Thói quen gần nhất (Tự động chọn sẵn)</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  📌 {p.name}
                </option>
              ))}
            </select>
            {!isLocked && activePresetId !== 'default' && (
              <button
                type="button"
                onClick={() => onDeletePreset?.(activePresetId)}
                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                title="Xóa mẫu đã lưu này"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
        {visibleColumns.map((col: string) => {
          const currentSelectedCol = mapping[col] || '';
          const isSavedButNotInCurrentFile =
            Boolean(currentSelectedCol) && !excelHeaders.includes(currentSelectedCol);

          return (
            <div key={col} className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{col}</span>
                {(keepOriginal[col] || constantMapping[col]) && (
                  <span className="text-[10px] font-normal normal-case text-emerald-600 dark:text-emerald-400">
                    {keepOriginal[col] ? '✓ Giữ nguyên' : ''}{' '}
                    {constantMapping[col] ? `• Tĩnh: "${constantMapping[col]}"` : ''}
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <select
                  disabled={isLocked}
                  className="flex-1 w-0 p-2 border border-slate-200 dark:border-[#333336] rounded-lg text-xs bg-slate-50 dark:bg-[#1a1a1c] disabled:bg-slate-100 dark:disabled:bg-[#333336]/50 disabled:text-slate-400 dark:disabled:text-slate-500 outline-none focus:border-blue-500 dark:focus:border-blue-500 text-slate-800 dark:text-[#e3e3e3]"
                  value={currentSelectedCol}
                  onChange={(e) =>
                    setMapping({ ...mapping, [col]: e.target.value })
                  }
                >
                  <option value="">-- Cột Excel --</option>
                  {isSavedButNotInCurrentFile && (
                    <option value={currentSelectedCol}>
                      {currentSelectedCol} (Đã lưu sẵn)
                    </option>
                  )}
                  {excelHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
                {(activeTab === 'task' || activeTab === 'mass_task') && (
                  <div
                    className="flex items-center"
                    title="Giữ nguyên giá trị tải lên (Tự động nhớ khi chọn file mới)"
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
          );
        })}
      </div>
    </div>
  );
};
