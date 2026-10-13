import React, { useEffect, useRef, useState } from 'react';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { cn } from '../lib/utils';

export function ColumnAdder({
  availableColumns,
  visibleColumns,
  onAddColumn,
  isHeader = false
}: {
  availableColumns: { id: string; label: string }[];
  visibleColumns: string[];
  onAddColumn: (id: string) => void;
  isHeader?: boolean;
}) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const hiddenCols = availableColumns.filter(c => !visibleColumns.includes(c.id));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      {isHeader ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center mx-auto active:scale-95"
          title={t("Add / Restore Column")}
        >
          <Plus className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-slate-200 rounded-xl hover:bg-slate-50 dark:hover:bg-[#252528] transition-all text-xs font-semibold shadow-xs cursor-pointer active:scale-95"
        >
          <Plus className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
          <span>{t('Add Column')}</span>
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-1.5 w-56 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl z-50 p-2 flex flex-col gap-1.5 animate-in fade-in zoom-in-95 text-slate-800 dark:text-[#e3e3e3]">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-2 py-1 border-b border-slate-100 dark:border-[#333336] flex items-center justify-between">
            <span>{t('Toggle Columns')}</span>
            <span className="text-[10px] font-mono">{visibleColumns.length}/{availableColumns.length}</span>
          </div>

          <div className="max-h-56 overflow-y-auto flex flex-col gap-0.5 py-1">
            {availableColumns.map((col) => {
              const isVisible = visibleColumns.includes(col.id);
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => onAddColumn(col.id)}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer",
                    isVisible
                      ? "bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300"
                      : "hover:bg-slate-100 dark:hover:bg-[#28282a] text-slate-600 dark:text-slate-400"
                  )}
                >
                  <span>{col.label}</span>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    isVisible
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 dark:bg-[#28282a] text-slate-400"
                  )}>
                    {isVisible ? t('Shown') : t('Hidden')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

