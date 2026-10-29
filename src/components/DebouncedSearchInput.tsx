import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from 'react';
import { Search, X, Sparkles } from 'lucide-react';
import {
  cn,
  getRecentSearches,
  addRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  stripSearchAccents,
} from '../lib/utils';
import { SearchAssistantPopover } from './SearchParts/SearchAssistantPopover';

interface DebouncedSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  delay?: number;
  debounceMs?: number; // Alias for delay
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  showAssistant?: boolean;
  'data-global-search-input'?: string | boolean;
}

export const DebouncedSearchInput: React.FC<DebouncedSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  inputClassName,
  delay = 400,
  debounceMs,
  onFocus,
  onBlur,
  onKeyDown,
  autoFocus,
  disabled,
  id,
  showAssistant,
  'data-global-search-input': dataGlobalSearch,
}) => {
  const effectiveDelay = debounceMs !== undefined ? debounceMs : delay;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const lastCommittedRef = useRef(value || '');

  // Automatically disable assistant popover if custom onFocus is provided (e.g., LayoutTab unit suggestions)
  // or inside CommandPaletteModal (debounceMs === 180) unless explicitly enabled via showAssistant.
  const isAssistantEnabled = useMemo(() => {
    if (showAssistant !== undefined) return showAssistant;
    if (onFocus) return false;
    if (debounceMs === 180) return false;
    return true;
  }, [showAssistant, onFocus, debounceMs]);

  const [hasValue, setHasValue] = useState(() => Boolean(value));
  const hasValueRef = useRef(hasValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showSyntaxTips, setShowSyntaxTips] = useState(false);
  const [filterTextForHistory, setFilterTextForHistory] = useState(() => value || '');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearches());
  const [activeRecentIdx, setActiveRecentIdx] = useState<number>(-1);

  const matchingRecentSearches = useMemo(() => {
    const q = stripSearchAccents(filterTextForHistory);
    if (!q) return recentSearches.slice(0, 5);
    return recentSearches
      .filter((item) => {
        const normItem = stripSearchAccents(item);
        return normItem.includes(q) && normItem !== q;
      })
      .slice(0, 5);
  }, [recentSearches, filterTextForHistory]);

  // Sync external changes (e.g. clear filters, tab changes, external reset)
  useEffect(() => {
    const propVal = value || '';
    if (inputRef.current) {
      const currentNative = inputRef.current.value;
      if (currentNative !== propVal) {
        if (!isFocusedRef.current || propVal === '') {
          inputRef.current.value = propVal;
          lastCommittedRef.current = propVal;
          setFilterTextForHistory(propVal);
          const nextHas = Boolean(propVal);
          if (hasValueRef.current !== nextHas) {
            hasValueRef.current = nextHas;
            setHasValue(nextHas);
          }
        }
      }
    }
  }, [value]);

  // Global "/" shortcut to focus the primary visible search input on the page
  useEffect(() => {
    if (disabled || !isAssistantEnabled) return;
    const handleGlobalSlash = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const el = inputRef.current;
      if (!el || el.offsetParent === null) return;
      // Only let the first visible search input on screen handle "/"
      const allVisibleInputs = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[data-smart-search-bar="true"]')
      ).filter((node) => node.offsetParent !== null && !node.disabled);
      if (allVisibleInputs[0] === el) {
        e.preventDefault();
        el.focus();
        el.select();
      }
    };
    window.addEventListener('keydown', handleGlobalSlash);
    return () => window.removeEventListener('keydown', handleGlobalSlash);
  }, [disabled, isAssistantEnabled]);

  // Clean up pending timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (historyCommitTimerRef.current) {
        clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = null;
      }
    };
  }, []);

  const recordToHistoryDeferred = useCallback((val: string) => {
    if (!isAssistantEnabled) return;
    if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
    const trimmed = val.trim();
    if (trimmed.length < 2) return;
    historyCommitTimerRef.current = setTimeout(() => {
      historyCommitTimerRef.current = null;
      setRecentSearches(addRecentSearch(trimmed));
    }, 1400);
  }, [isAssistantEnabled]);

  const commitValueImmediately = useCallback(
    (val: string, saveToHistory = false) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (inputRef.current && inputRef.current.value !== val) {
        inputRef.current.value = val;
      }
      const nextHas = val.length > 0;
      if (hasValueRef.current !== nextHas) {
        hasValueRef.current = nextHas;
        setHasValue(nextHas);
      }
      setFilterTextForHistory(val);
      if (saveToHistory && isAssistantEnabled && val.trim().length >= 2) {
        setRecentSearches(addRecentSearch(val.trim()));
      }
      if (val !== lastCommittedRef.current) {
        lastCommittedRef.current = val;
        startTransition(() => {
          onChange(val);
        });
      }
    },
    [onChange, isAssistantEnabled]
  );

  const scheduleDebounce = (val: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setFilterTextForHistory(val);
      if (val !== lastCommittedRef.current) {
        lastCommittedRef.current = val;
        startTransition(() => {
          onChange(val);
        });
        recordToHistoryDeferred(val);
      }
    }, effectiveDelay);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const nextHas = val.length > 0;
    if (nextHas !== hasValueRef.current) {
      hasValueRef.current = nextHas;
      setHasValue(nextHas);
    }
    setActiveRecentIdx(-1);

    if (!isComposingRef.current) {
      scheduleDebounce(val);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const val = e.currentTarget.value;
    scheduleDebounce(val);
  };

  const handleInternalFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    setIsFocused(true);
    if (isAssistantEnabled) {
      setRecentSearches(getRecentSearches());
      setFilterTextForHistory(inputRef.current?.value || '');
      setIsPopoverOpen(true);
      setActiveRecentIdx(-1);
    }
    onFocus?.(e);
  };

  const handleInternalBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    setIsFocused(false);
    setIsPopoverOpen(false);
    setShowSyntaxTips(false);
    setActiveRecentIdx(-1);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const val = inputRef.current?.value || '';
    if (isAssistantEnabled && val.trim().length >= 2) {
      setRecentSearches(addRecentSearch(val.trim()));
    }
    if (val !== lastCommittedRef.current) {
      lastCommittedRef.current = val;
      startTransition(() => {
        onChange(val);
      });
    }
    onBlur?.(e);
  };

  const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isAssistantEnabled && isPopoverOpen && matchingRecentSearches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveRecentIdx((prev) =>
          prev < matchingRecentSearches.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveRecentIdx((prev) =>
          prev > 0 ? prev - 1 : matchingRecentSearches.length - 1
        );
        return;
      }
    }

    if (e.key === 'Enter') {
      if (
        isAssistantEnabled &&
        isPopoverOpen &&
        activeRecentIdx >= 0 &&
        activeRecentIdx < matchingRecentSearches.length
      ) {
        e.preventDefault();
        const chosen = matchingRecentSearches[activeRecentIdx];
        commitValueImmediately(chosen, true);
        setIsPopoverOpen(false);
        setActiveRecentIdx(-1);
        return;
      }

      const val = inputRef.current?.value || '';
      commitValueImmediately(val, true);
      setIsPopoverOpen(false);
    } else if (e.key === 'Escape') {
      const currentVal = inputRef.current?.value || '';
      if (currentVal.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        commitValueImmediately('', false);
        setIsPopoverOpen(false);
        return;
      }
      if (isPopoverOpen) {
        e.preventDefault();
        setIsPopoverOpen(false);
        inputRef.current?.blur();
        return;
      }
    }
    onKeyDown?.(e);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    commitValueImmediately('', false);
    inputRef.current?.focus();
  };

  const handleSelectRecent = useCallback(
    (query: string) => {
      commitValueImmediately(query, true);
      setIsPopoverOpen(false);
      setActiveRecentIdx(-1);
    },
    [commitValueImmediately]
  );

  const handleRemoveRecent = useCallback((query: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentSearches(removeRecentSearch(query));
  }, []);

  const handleClearAllRecent = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRecentSearches(clearRecentSearches());
  }, []);

  const handleInsertOperator = useCallback(
    (operatorType: 'and' | 'or' | 'exact' | 'exclude') => {
      const el = inputRef.current;
      if (!el) return;
      const cur = el.value;
      let next = cur;

      if (operatorType === 'and') {
        next = cur.trim() ? `${cur.trimEnd()} + ` : '';
      } else if (operatorType === 'or') {
        next = cur.trim() ? `${cur.trimEnd()}, ` : '';
      } else if (operatorType === 'exclude') {
        next = cur.trim() ? `${cur.trimEnd()} -` : '-';
      } else if (operatorType === 'exact') {
        const trimmed = cur.trim();
        if (trimmed && !trimmed.startsWith('"')) {
          next = `"${trimmed}"`;
        } else {
          next = cur ? `${cur} ""` : '""';
        }
      }

      el.value = next;
      const nextHas = next.length > 0;
      if (hasValueRef.current !== nextHas) {
        hasValueRef.current = nextHas;
        setHasValue(nextHas);
      }
      setFilterTextForHistory(next);
      el.focus();
      if (operatorType === 'exact' && next.endsWith('""')) {
        const pos = next.length - 1;
        el.setSelectionRange(pos, pos);
      } else {
        el.setSelectionRange(next.length, next.length);
      }
      scheduleDebounce(next);
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex items-center w-full min-w-0 [overflow-anchor:none]',
        className
      )}
    >
      <Search
        className={cn(
          'w-4 h-4 absolute left-3 pointer-events-none shrink-0 transition-colors duration-150',
          hasValue || isFocused
            ? 'text-blue-600 dark:text-[#8ab4f8]'
            : 'text-slate-400 dark:text-[#838383]'
        )}
      />
      <input
        ref={inputRef}
        id={id}
        type="text"
        defaultValue={value || ''}
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        onChange={handleInputChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onFocus={handleInternalFocus}
        onBlur={handleInternalBlur}
        onKeyDown={handleInternalKeyDown}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        data-global-search-input={dataGlobalSearch}
        data-smart-search-bar={isAssistantEnabled ? 'true' : undefined}
        className={cn(
          // text-[16px] prevents iOS Safari viewport auto-zoom & jitter on mobile devices; sm:text-xs / md:text-sm for desktop
          'w-full pl-9 pr-14 py-1.5 sm:py-2 text-[16px] sm:text-xs md:text-sm bg-white dark:bg-[#131314] border rounded-xl text-slate-800 dark:text-[#e3e3e3] placeholder:text-slate-400 dark:placeholder:text-[#737373] focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-colors duration-150 [overflow-anchor:none]',
          hasValue
            ? 'border-blue-400/80 dark:border-blue-500/60 bg-blue-50/15 dark:bg-blue-950/10'
            : 'border-slate-200 dark:border-[#444446]',
          disabled && 'opacity-50 cursor-not-allowed',
          inputClassName
        )}
      />

      {/* Right Action Area: Clear (X), Syntax Helper Toggle, or "/" Shortcut Hint */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 z-10">
        {isAssistantEnabled && (isFocused || hasValue) && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isFocusedRef.current) {
                inputRef.current?.focus();
              }
              setShowSyntaxTips((prev) => !prev);
              setIsPopoverOpen(true);
            }}
            title="Smart search syntax & recent searches"
            aria-label="Smart search syntax"
            className={cn(
              'w-6 h-6 sm:w-6 sm:h-6 hidden sm:flex items-center justify-center rounded-md transition-colors cursor-pointer active:scale-95 touch-manipulation',
              showSyntaxTips
                ? 'text-blue-600 dark:text-[#8ab4f8] bg-blue-100/80 dark:bg-blue-950/60'
                : 'text-slate-400 hover:text-blue-600 dark:text-[#838383] dark:hover:text-[#8ab4f8] hover:bg-slate-100 dark:hover:bg-[#28282a]'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        )}

        {hasValue ? (
          <button
            type="button"
            onClick={handleClear}
            title="Clear search (Esc)"
            aria-label="Clear search"
            className="w-7 h-7 sm:w-7 sm:h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:text-[#a3a3a3] dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#333336] active:scale-90 transition-transform duration-100 touch-manipulation cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        ) : (
          isAssistantEnabled &&
          !isFocused && (
            <kbd
              title="Press / to search"
              className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 dark:text-[#737373] bg-slate-100/80 dark:bg-[#222225] border border-slate-200/80 dark:border-[#38383a] rounded pointer-events-none mr-1 select-none"
            >
              /
            </kbd>
          )
        )}
      </div>

      {/* Recent Searches & Smart Syntax Popover */}
      {isAssistantEnabled && (
        <SearchAssistantPopover
          isOpen={isPopoverOpen}
          recentSearches={matchingRecentSearches}
          activeIndex={activeRecentIdx}
          hasText={hasValue}
          showSyntaxTips={showSyntaxTips}
          onSelectRecent={handleSelectRecent}
          onRemoveRecent={handleRemoveRecent}
          onClearAllRecent={handleClearAllRecent}
          onInsertOperator={handleInsertOperator}
          onSetActiveIndex={setActiveRecentIdx}
        />
      )}
    </div>
  );
};
