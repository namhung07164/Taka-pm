import React, { memo } from 'react';
import { Trash2, Unlink, X } from 'lucide-react';

interface DetailFloatingActionBarProps {
  selectedCount?: number;
  selectedTaskIds?: Set<string>;
  canWrite?: boolean;
  onBulkAction: (action: any) => void;
  onClearSelection: () => void;
  onSelectAll?: () => void;
}

export const DetailFloatingActionBar = memo(function DetailFloatingActionBar({
  selectedCount,
  selectedTaskIds,
  onBulkAction,
  onClearSelection
}: DetailFloatingActionBarProps) {
  const count = selectedCount !== undefined ? selectedCount : (selectedTaskIds ? selectedTaskIds.size : 0);
  if (count === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white dark:bg-[#1e1e20] shadow-2xl border border-slate-200 dark:border-[#444446] rounded-full px-4 py-2 flex flex-wrap justify-center items-center gap-3 animate-in fade-in slide-in-from-bottom-4 print:hidden">
      <span className="text-sm font-bold text-slate-700 dark:text-[#e3e3e3] bg-slate-100 dark:bg-[#28282a] px-3 py-1.5 rounded-full shrink-0">
        {count} selected
      </span>
      
      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]" />
      
      <div className="flex items-center gap-2">
        <button 
          onClick={() => onBulkAction('delegation_on')} 
          className="px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer active:scale-95 touch-manipulation"
        >
          Del: ON
        </button>
        <button 
          onClick={() => onBulkAction('delegation_off')} 
          className="px-3 py-1.5 text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer active:scale-95 touch-manipulation"
        >
          Del: OFF
        </button>
      </div>

      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]" />

      <div className="flex items-center gap-2">
        <button 
          onClick={() => onBulkAction('flexible_on')} 
          className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 transition-colors cursor-pointer active:scale-95 touch-manipulation"
        >
          Flex: ON
        </button>
        <button 
          onClick={() => onBulkAction('flexible_off')} 
          className="px-3 py-1.5 text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer active:scale-95 touch-manipulation"
        >
          Flex: OFF
        </button>
      </div>

      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]" />

      <button 
        onClick={() => onBulkAction('baseline')} 
        className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-800 transition-colors cursor-pointer active:scale-95 touch-manipulation"
      >
        Set Baseline
      </button>
      
      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]" />

      <button 
        onClick={() => onBulkAction('unlink')} 
        className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 rounded-md border border-amber-200 dark:border-amber-800 transition-colors flex items-center gap-1 cursor-pointer active:scale-95 touch-manipulation"
        title="Unlink selected tasks from parent modular link"
      >
        <Unlink className="w-3.5 h-3.5" /> Unlink
      </button>

      <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]" />

      <button 
        onClick={() => onBulkAction('delete')} 
        className="px-3 py-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800 transition-colors flex items-center gap-1 cursor-pointer active:scale-95 touch-manipulation"
      >
        <Trash2 className="w-3.5 h-3.5" /> Delete
      </button>
      
      <button 
        onClick={onClearSelection}
        className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-[#838383] dark:hover:text-white dark:hover:bg-[#333336] rounded-full transition-colors shrink-0 cursor-pointer"
        title="Clear Selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
});
