import React, { useEffect, useRef, useState, useTransition } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { X } from 'lucide-react';

interface DebouncedSearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  debounceMs?: number;
  triggerOnEnter?: boolean;
}

export function DebouncedSearchInput({ 
  value, 
  onChange, 
  debounceMs = 300, 
  triggerOnEnter = false, 
  ...props
}: DebouncedSearchInputProps) {
  const { t } = useLanguage();
  const [innerValue, setInnerValue] = useState(value || "");
  const lastReportedValue = useRef(value || "");
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [, startTransition] = useTransition();

  const isFocusedRef = useRef(false);

  // Sync external value changes into local state (only when not actively typing/focused)
  useEffect(() => {
    if (!isFocusedRef.current && value !== lastReportedValue.current) {
      setInnerValue(value || "");
      lastReportedValue.current = value || "";
    }
  }, [value]);

  const commitSearch = (valToCommit: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (valToCommit !== lastReportedValue.current) {
      lastReportedValue.current = valToCommit;
      startTransition(() => {
        onChange(valToCommit);
      });
    }
  };

  // Debounce mechanism: triggers filtering after user has finished typing (300ms pause)
  useEffect(() => {
    if (triggerOnEnter) return;

    if (innerValue === lastReportedValue.current) return;

    timerRef.current = setTimeout(() => {
      if (innerValue !== lastReportedValue.current) {
        lastReportedValue.current = innerValue;
        startTransition(() => {
          onChange(innerValue);
        });
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [innerValue, onChange, debounceMs, triggerOnEnter]);

  return (
    <div className="relative w-full">
      <input
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoComplete="off"
        enterKeyHint="search"
        {...props}
        className={props.className ? (props.className.includes('pr-') ? props.className.replace(/pr-\d+/, 'pr-10') : props.className + ' pr-10') : 'pr-10'}
        value={innerValue}
        onChange={(e) => setInnerValue(e.target.value)}
        onFocus={(e) => {
          isFocusedRef.current = true;
          if (props.onFocus) props.onFocus(e);
        }}
        onKeyDown={(e) => {
          if (props.onKeyDown) props.onKeyDown(e);
          if (e.key === 'Escape' && innerValue) {
            e.preventDefault();
            e.stopPropagation();
            setInnerValue("");
            commitSearch("");
          } else if (e.key === 'Enter') {
            e.preventDefault();
            commitSearch(innerValue);
          }
        }}
        onBlur={(e) => {
          isFocusedRef.current = false;
          if (props.onBlur) props.onBlur(e);
          commitSearch(innerValue);
        }}
      />
      {innerValue && (
        <button
          type="button"
          onClick={() => {
            setInnerValue("");
            commitSearch("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors z-10"
          title={t("Clear") || "Clear"}
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
