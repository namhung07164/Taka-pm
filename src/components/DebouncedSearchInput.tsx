import React, { useState, useEffect, useRef, startTransition } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

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
  'data-global-search-input': dataGlobalSearch,
}) => {
  const effectiveDelay = debounceMs !== undefined ? debounceMs : delay;
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const lastCommittedRef = useRef(value || '');

  // hasValue only tracks whether the input has non-empty text (to show/hide the Clear button).
  // Keystrokes, Vietnamese Telex accents (aa -> â, as -> á), and deletes (Backspace) are handled
  // directly by the native browser DOM with zero React re-renders, eliminating all input lag.
  const [hasValue, setHasValue] = useState(() => Boolean(value));
  const hasValueRef = useRef(hasValue);

  // Sync external changes (e.g. clear filters, tab changes, external reset)
  useEffect(() => {
    const propVal = value || '';
    if (inputRef.current) {
      const currentNative = inputRef.current.value;
      if (currentNative !== propVal) {
        // Only override native DOM if not actively focused or if externally reset to empty
        if (!isFocusedRef.current || propVal === '') {
          inputRef.current.value = propVal;
          lastCommittedRef.current = propVal;
          const nextHas = Boolean(propVal);
          if (hasValueRef.current !== nextHas) {
            hasValueRef.current = nextHas;
            setHasValue(nextHas);
          }
        }
      }
    }
  }, [value]);

  // Clean up pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const scheduleDebounce = (val: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (val !== lastCommittedRef.current) {
        lastCommittedRef.current = val;
        startTransition(() => {
          onChange(val);
        });
      }
    }, effectiveDelay);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const nextHas = val.length > 0;
    // Only trigger React state update when switching between empty <-> non-empty
    if (nextHas !== hasValueRef.current) {
      hasValueRef.current = nextHas;
      setHasValue(nextHas);
    }

    // Do not dispatch debounce mid-composition (Vietnamese Telex / accents)
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
    onFocus?.(e);
  };

  const handleInternalBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    // Flush any pending change immediately on blur
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const val = inputRef.current?.value || '';
    if (val !== lastCommittedRef.current) {
      lastCommittedRef.current = val;
      startTransition(() => {
        onChange(val);
      });
    }
    onBlur?.(e);
  };

  const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Immediate flush on Enter key without waiting for debounce timer
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const val = inputRef.current?.value || '';
      if (val !== lastCommittedRef.current) {
        lastCommittedRef.current = val;
        startTransition(() => {
          onChange(val);
        });
      }
    }
    onKeyDown?.(e);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    lastCommittedRef.current = '';
    hasValueRef.current = false;
    setHasValue(false);
    startTransition(() => {
      onChange('');
    });
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative flex items-center w-full min-w-0 [overflow-anchor:none]', className)}>
      <Search className="w-4 h-4 text-slate-400 dark:text-[#838383] absolute left-3 pointer-events-none shrink-0" />
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
        className={cn(
          // text-[16px] prevents iOS Safari viewport auto-zoom & jitter on mobile devices; sm:text-xs / sm:text-sm for desktop
          'w-full pl-9 pr-10 py-1.5 sm:py-2 text-[16px] sm:text-xs md:text-sm bg-white dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-xl text-slate-800 dark:text-[#e3e3e3] placeholder:text-slate-400 dark:placeholder:text-[#737373] focus:outline-none focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 transition-colors duration-150 [overflow-anchor:none]',
          disabled && 'opacity-50 cursor-not-allowed',
          inputClassName
        )}
      />
      {hasValue && (
        <button
          type="button"
          onClick={handleClear}
          title="Clear search"
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:text-[#a3a3a3] dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#333336] active:scale-90 transition-transform duration-100 touch-manipulation cursor-pointer z-10"
        >
          <X className="w-4 h-4 stroke-[2.2]" />
        </button>
      )}
    </div>
  );
};
