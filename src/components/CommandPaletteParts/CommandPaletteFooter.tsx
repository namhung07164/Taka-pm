import React, { FC } from 'react';

interface CommandPaletteFooterProps {
  totalResults: number;
}

export const CommandPaletteFooter: React.FC<CommandPaletteFooterProps> = ({ totalResults }) => {
  return (
    <div className="border-t border-slate-100 dark:border-[#333336] px-4 py-2 bg-slate-50/80 dark:bg-[#252528]/80 flex items-center justify-between text-[11px] text-slate-500 dark:text-[#838383]">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">
            ↑↓
          </kbd>{' '}
          Navigate
        </span>
        <span className="flex items-center gap-1">
          <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">
            ↵
          </kbd>{' '}
          Select
        </span>
        <span className="flex items-center gap-1">
          <kbd className="font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] px-1 rounded">
            Tab
          </kbd>{' '}
          Category
        </span>
      </div>

      <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
        <span>{totalResults} results</span>
      </div>
    </div>
  );
};
