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
  delay = 300,
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
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComposingRef = useRef(false);
  const isFocusedRef = useRef(false);
  const lastCommittedValRef = useRef(value);

  // Sync external changes (e.g. clear filters, switching tabs, external reset)
  // Prevents echo re-render loop if local input is actively focused and matches committed value
  useEffect(() => {
    if (isFocusedRef.current && value !== '' && value === lastCommittedValRef.current) {
      return;
    }
    setLocalValue(value || '');
    lastCommittedValRef.current = value || '';
  }, [value]);

  // Clean up pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const triggerDebounce = (nextVal: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      lastCommittedValRef.current = nextVal;
      startTransition(() => {
        onChange(nextVal);
      });
    }, effectiveDelay);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setLocalValue(nextVal);
    // Don't trigger debounce mid-composition (Vietnamese Telex / accents on iOS)
    if (!isComposingRef.current) {
      triggerDebounce(nextVal);
    }
  };

  const handleCompositionStart = () => {
    isComposingRef.current = true;
  };

  const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const nextVal = e.currentTarget.value;
    setLocalValue(nextVal);
    triggerDebounce(nextVal);
  };

  const handleInternalFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = true;
    onFocus?.(e);
  };

  const handleInternalBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    // On blur, immediately flush any pending debounced change to sync state without waiting
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      if (localValue !== lastCommittedValRef.current) {
        lastCommittedValRef.current = localValue;
        startTransition(() => {
          onChange(localValue);
        });
      }
    }
    onBlur?.(e);
  };

  const handleInternalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Immediate search flush on Enter key press
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (localValue !== lastCommittedValRef.current) {
        lastCommittedValRef.current = localValue;
        startTransition(() => {
          onChange(localValue);
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
    lastCommittedValRef.current = '';
    setLocalValue('');
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
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={localValue}
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
      {localValue && (
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
