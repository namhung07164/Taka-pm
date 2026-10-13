import React, { FC, memo } from 'react';
import { CornerDownLeft } from 'lucide-react';
import { PaletteItem } from './commandPaletteTypes';
import { cn } from '../../lib/utils';

interface CommandPaletteItemRowProps {
  item: PaletteItem;
  idx: number;
  isSelected: boolean;
  onMouseEnter: (idx: number) => void;
}

export const CommandPaletteItemRow: React.FC<CommandPaletteItemRowProps> = React.memo(
  ({ item, idx, isSelected, onMouseEnter }) => {
    const Icon = item.icon;

    return (
      <div
        data-index={idx}
        onClick={item.onSelect}
        onMouseEnter={() => onMouseEnter(idx)}
        className={cn(
          'group px-3 py-2.5 rounded-xl flex items-center justify-between gap-3 cursor-pointer transition-all',
          isSelected
            ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-[#8ab4f8] shadow-2xs'
            : 'hover:bg-slate-50 dark:hover:bg-[#252528] text-slate-700 dark:text-[#e3e3e3]'
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs transition-colors',
              item.iconColor || 'bg-slate-100 dark:bg-[#28282a] text-slate-600 dark:text-[#c3c3c3]'
            )}
          >
            <Icon className="w-4 h-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {item.code && (
                <span className="font-mono font-extrabold text-xs text-blue-700 dark:text-[#8ab4f8] uppercase shrink-0">
                  {item.code}
                </span>
              )}
              <span className="font-semibold text-sm truncate">{item.title}</span>
              {item.badge && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0',
                    item.badgeColor || 'bg-slate-100 text-slate-700 dark:bg-[#28282a] dark:text-[#c3c3c3]'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </div>
            {item.subtitle && (
              <p className="text-xs text-slate-400 dark:text-[#838383] truncate mt-0.5">
                {item.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right Shortcut or Action Indicator */}
        <div className="flex items-center gap-1.5 shrink-0">
          {item.shortcut && (
            <kbd className="text-[10px] font-mono font-bold bg-white dark:bg-[#28282a] text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] px-1.5 py-0.5 rounded shadow-2xs">
              {item.shortcut}
            </kbd>
          )}
          <CornerDownLeft
            className={cn(
              'w-3.5 h-3.5 transition-opacity',
              isSelected
                ? 'opacity-100 text-blue-600 dark:text-blue-400'
                : 'opacity-0 group-hover:opacity-60'
            )}
          />
        </div>
      </div>
    );
  }
);
