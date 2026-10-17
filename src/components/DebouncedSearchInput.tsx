import React, { useState, useEffect, useRef } from 'react';
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
}

export const DebouncedSearchInput: React.FC<DebouncedSearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  inputClassName,
  delay = 250,
  debounceMs,
  onFocus,
  onBlur,
  onKeyDown,
  autoFocus,
  disabled,
  id,
}) => {
  const effectiveDelay = debounceMs !== undefined ? debounceMs : delay;
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setLocalValue(nextVal);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(nextVal);
    }, effectiveDelay);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setLocalValue('');
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <div className={cn('relative flex items-center w-full min-w-0', className)}>
      <Search className="w-4 h-4 text-slate-400 dark:text-[#838383] absolute left-3 pointer-events-none shrink-0"/>
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={localValue}
        onChange={handleInputChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'w-full pl-9 pr-10 py-2 text-xs sm:text-sm bg-white dark:bg-[#131314] border border-slate-200 dark:border-[#444446] rounded-xl text-slate-800 dark:text-[#e3e3e3] placeholder:text-slate-400 dark:placeholder:text-[#737373] focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-all',
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
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:text-[#a3a3a3] dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-[#333336] active:scale-90 transition-all touch-manipulation cursor-pointer z-10"
        >
          <X className="w-4 h-4 stroke-[2.2]"/>
        </button>
      )}
    </div>
  );
};
