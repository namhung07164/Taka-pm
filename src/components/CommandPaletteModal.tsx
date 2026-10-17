import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Search, Command, X, Sparkles, Building2, Tag, List, LayoutDashboard } from 'lucide-react';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { cn } from '../lib/utils';
import {
  CommandPaletteModalProps,
  CommandCategory,
} from './CommandPaletteParts/commandPaletteTypes';
import { useCommandPaletteItems } from './CommandPaletteParts/useCommandPaletteItems';
import { CommandPaletteItemRow } from './CommandPaletteParts/CommandPaletteItemRow';
import { CommandPaletteFooter } from './CommandPaletteParts/CommandPaletteFooter';

export function CommandPaletteModal({
  isOpen,
  onClose,
  onTabChange,
  onToggleTheme,
  onToggleFocusMode,
  onPrintPreviewToggle,
}: CommandPaletteModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto focus input on open
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSelectedCategory('all');
      setSelectedIndex(0);
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const categories: Array<{ id: CommandCategory; label: string; icon: React.ElementType }> = [
    { id: 'all', label: 'All', icon: Sparkles },
    { id: 'actions', label: 'Actions', icon: Sparkles },
    { id: 'navigation', label: 'Navigation', icon: LayoutDashboard },
    { id: 'floors', label: 'Floors', icon: Building2 },
    { id: 'projects', label: 'Projects', icon: Tag },
    { id: 'tasks', label: 'Tasks', icon: List },
  ];

  const { filteredItems } = useCommandPaletteItems({
    searchQuery,
    selectedCategory,
    onClose,
    onTabChange,
    onToggleTheme,
    onToggleFocusMode,
    onPrintPreviewToggle,
  });

  // Adjust active index within range
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, selectedCategory]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(
          (prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length)
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].onSelect();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const catKeys = categories.map((c) => c.id);
        const currentCatIdx = catKeys.indexOf(selectedCategory);
        const nextCatIdx = e.shiftKey
          ? (currentCatIdx - 1 + catKeys.length) % catKeys.length
          : (currentCatIdx + 1) % catKeys.length;
        setSelectedCategory(catKeys[nextCatIdx]);
      }
    },
    [filteredItems, selectedIndex, selectedCategory, categories, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-16 sm:pt-24 p-3 bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <motion.div
        ref={containerRef}
        initial={{ opacity: 0, scale: 0.96, y: -10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: -10 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className="w-full max-w-2xl bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#38383a] overflow-hidden flex flex-col max-h-[82vh]"
        onKeyDown={handleKeyDown}
      >
        {/* Top Draggable Handle & Search Bar Header */}
        <div className="border-b border-slate-100 dark:border-[#333336] p-3 sm:p-4 bg-slate-50/70 dark:bg-[#252528]/70">
          <div className="flex items-center justify-between gap-2 mb-2 px-1 text-slate-400 dark:text-[#838383]">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#a3a3a3]">
              <Command className="w-3.5 h-3.5" />
              <span>Command Palette</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-[#38383a] text-slate-600 dark:text-[#c3c3c3]">
                Esc to close
              </span>
              <button
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-[#f3f3f3] hover:bg-slate-200 dark:hover:bg-[#38383a] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="relative flex items-center">
            <DebouncedSearchInput
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              debounceMs={180}
              placeholder="Search projects, tasks, floors, actions, or jump to tab..."
              className="w-full"
            />
            <div className="absolute right-3 flex items-center gap-1 pointer-events-none z-10">
              <kbd className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-[#28282a] text-slate-500 dark:text-[#a3a3a3] border border-slate-200 dark:border-[#444446] px-1.5 py-0.5 rounded shadow-2xs">
                ⌘K
              </kbd>
            </div>
          </div>

          {/* Filter Categories Chips */}
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95 touch-manipulation',
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white dark:bg-[#1e1e20] text-slate-600 dark:text-[#c3c3c3] hover:bg-slate-200/70 dark:hover:bg-[#333336] border border-slate-200/80 dark:border-[#38383a]'
                  )}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List of Filtered Items */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-slate-100/50 dark:divide-[#28282a]/50"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-400 dark:text-[#838383]">
              <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-medium">No results found for "{searchQuery}"</p>
              <p className="text-xs text-slate-400 mt-1">
                Try typing project codes, task names, or actions like "Gantt" or "Theme"
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <CommandPaletteItemRow
                key={item.id}
                item={item}
                idx={idx}
                isSelected={idx === selectedIndex}
                onMouseEnter={setSelectedIndex}
              />
            ))
          )}
        </div>

        <CommandPaletteFooter totalResults={filteredItems.length} />
      </motion.div>
    </div>
  );
}

export default CommandPaletteModal;
