import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export interface FastInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (v: string) => void;
}

export const FastInput = React.forwardRef<HTMLInputElement, FastInputProps>(
  ({ value, onChange, className = '', type, inputMode, ...props }, ref) => {
    const [local, setLocal] = useState(value);
    const isCanceling = useRef(false);

    useEffect(() => {
      setLocal(value);
    }, [value]);

    const inputClassName = className
      ? className.includes('pr-')
        ? className.replace(/pr-\d+/, 'pr-10')
        : `${className} pr-10`
      : 'pr-10';

    const isDecimal = inputMode === 'decimal' || type === 'number';
    const effectiveType = isDecimal ? 'text' : type;
    const effectiveInputMode = isDecimal ? 'decimal' : inputMode;

    const normalizeValue = (val: string) => {
      if (isDecimal) {
        return val.replace(/,/g, '.');
      }
      return val;
    };

    return (
      <div className="relative w-full">
        <input
          {...props}
          type={effectiveType}
          inputMode={effectiveInputMode}
          className={inputClassName}
          ref={ref}
          value={local}
          onBeforeInput={(e: any) => {
            if (isDecimal && e.data === ',') {
              e.preventDefault();
              const target = e.currentTarget as HTMLInputElement;
              const start = target.selectionStart ?? target.value.length;
              const end = target.selectionEnd ?? target.value.length;
              const newVal = target.value.slice(0, start) + '.' + target.value.slice(end);
              setLocal(newVal);
              onChange(newVal);
              setTimeout(() => {
                try {
                  target.setSelectionRange(start + 1, start + 1);
                } catch (_) {}
              }, 0);
            }
          }}
          onChange={(e) => {
            const val = normalizeValue(e.target.value);
            setLocal(val);
            onChange(val);
            if (props.onChangeCapture) props.onChangeCapture(e);
          }}
          onBlur={(e) => {
            if (!isCanceling.current) {
              const val = normalizeValue(local);
              setLocal(val);
              onChange(val);
            }
            isCanceling.current = false;
            if (props.onBlur) props.onBlur(e);
          }}
          onKeyDown={(e) => {
            if (isDecimal && e.key === ',') {
              e.preventDefault();
              const target = e.currentTarget as HTMLInputElement;
              const start = target.selectionStart ?? target.value.length;
              const end = target.selectionEnd ?? target.value.length;
              const newVal = target.value.slice(0, start) + '.' + target.value.slice(end);
              setLocal(newVal);
              onChange(newVal);
              setTimeout(() => {
                try {
                  target.setSelectionRange(start + 1, start + 1);
                } catch (_) {}
              }, 0);
              return;
            }
            if (e.key === 'Escape') {
              isCanceling.current = true;
              setLocal(value);
              onChange(value);
              e.currentTarget.blur();
            } else if (e.key === 'Enter') {
              const val = normalizeValue(local);
              onChange(val);
            }
            if (props.onKeyDown) props.onKeyDown(e);
          }}
        />
        {local && !props.readOnly && !props.disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLocal('');
              onChange('');
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }
);

FastInput.displayName = 'FastInput';
