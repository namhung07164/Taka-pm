import React, { memo, useEffect, useState } from 'react';
import { cn, formatCurrencyValue } from '../../lib/utils';

interface CostEditableCellProps {
  value: any;
  type?: string;
  onSave: (val: any) => void;
  canWrite: boolean;
  isCurrency?: boolean;
  wrap?: boolean;
  currency?: 'VND' | 'JPY' | 'USD';
  jpyRate?: number;
  usdRate?: number;
}

export const CostEditableCell = React.memo(function CostEditableCell({
  value,
  type = 'text',
  onSave,
  canWrite,
  isCurrency = false,
  wrap = false,
  currency = 'VND',
  jpyRate = 160,
  usdRate = 25000,
}: CostEditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value || '');

  useEffect(() => {
    setVal(value || '');
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const newVal = type === 'number' ? Number(val) : val;
    if (newVal !== value) {
      onSave(newVal);
    }
  };

  const displayValue = isCurrency
    ? value === null || value === undefined
      ? '-'
      : formatCurrencyValue(value, currency, jpyRate, usdRate)
    : value || '-';

  const isMoneyLocked = isCurrency && currency !== 'VND';
  const effectiveCanWrite = canWrite && !isMoneyLocked;

  if (!effectiveCanWrite) {
    return (
      <span
        title={
          isMoneyLocked
            ? `Editing locked in ${currency}. Switch to VND to edit.`
            : undefined
        }
        className={cn(
          wrap ? 'break-words whitespace-pre-wrap' : '',
          isMoneyLocked
            ? 'cursor-not-allowed select-text opacity-95 text-slate-700 dark:text-[#c3c3c3]'
            : ''
        )}
      >
        {displayValue}
      </span>
    );
  }

  if (isEditing) {
    if (wrap && type === 'text') {
      return (
        <textarea
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={handleBlur}
          className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3] min-h-[60px] resize-y"
        />
      );
    }
    return (
      <input
        autoFocus
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3]"
      />
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className={cn(
        'cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px]',
        wrap ? 'break-words whitespace-pre-wrap' : 'truncate'
      )}
    >
      {displayValue}
    </div>
  );
});
