import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Plus } from 'lucide-react';

export function ColumnAdder({
  availableColumns,
  visibleColumns,
  onAddColumn
}: {
  availableColumns: { id: string, label: string }[],
  visibleColumns: string[],
  onAddColumn: (id: string) => void
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

  if (hiddenCols.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] rounded-lg hover:bg-slate-50 dark:hover:bg-[#28282a] transition-colors text-xs font-medium shadow-sm"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Column
      </button>
      
      {isOpen && (
        <div className="absolute top-full right-0 mt-1 w-48 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl z-50 p-2 flex flex-col gap-2">
          <select 
            className="w-full text-sm border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] dark:text-[#e3e3e3] rounded p-1.5 outline-none focus:border-blue-500"
            value={selectedCol}
            onChange={(e) => setSelectedCol(e.target.value)}
          >
            <option value="" disabled>Select column...</option>
            {hiddenCols.map(c => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          <button disabled={!selectedCol}
            onClick={() => {
              if (selectedCol) {
                onAddColumn(selectedCol);
                setSelectedCol('');
                setIsOpen(false);
              }
            }}
            className="w-full bg-blue-600 text-white text-xs font-bold py-1.5 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
