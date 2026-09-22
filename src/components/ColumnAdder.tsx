import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

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
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCol, setSelectedCol] = useState('');
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
          className="p-1.5 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer flex items-center justify-center mx-auto"
          title="Add / Restore Column"
        >
          <Plus className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors text-xs font-medium shadow-sm cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Column
        </button>
      )}

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-52 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl z-50 p-2 flex flex-col gap-2 font-normal text-slate-800 dark:text-[#e3e3e3]">
          {hiddenCols.length === 0 ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 py-2 text-center">
              All columns are currently visible
            </div>
          ) : (
            <>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 pb-1 border-b border-slate-100 dark:border-[#333336]">
                Hidden Columns:
              </div>
              <div className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {hiddenCols.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onAddColumn(c.id);
                      if (hiddenCols.length <= 1) {
                        setIsOpen(false);
                      }
                    }}
                    className="flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 text-left transition-colors text-slate-700 dark:text-[#e3e3e3]"
                  >
                    <span>{c.label}</span>
                    <Plus className="w-3 h-3 text-blue-500" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

