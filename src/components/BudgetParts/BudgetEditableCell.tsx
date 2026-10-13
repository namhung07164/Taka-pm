import React, { useEffect, useRef, useState } from 'react';
import { formatCurrencyValue, cn } from '../../lib/utils';

export interface BudgetEditableCellProps {
  value: any;
  type?: string;
  onSave: (val: any) => void;
  canWrite: boolean;
  isCurrency?: boolean;
  currency?: 'VND' | 'JPY' | 'USD';
  jpyRate?: number;
  usdRate?: number;
  wrapText?: boolean;
}

export function BudgetEditableCell({
  value,
  type = 'text',
  onSave,
  canWrite,
  isCurrency = false,
  currency = 'VND',
  jpyRate = 160,
  usdRate = 25000,
  wrapText = false
}: BudgetEditableCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');
  const isTypingRef = React.useRef(false);

  useEffect(() => {
    if (!isTypingRef.current) {
      setVal(value !== undefined && value !== null ? value : '');
    }
  }, [value]);

  const handleBlur = () => {
    isTypingRef.current = false;
    setIsEditing(false);
    const newVal = type === 'number' ? Number(String(val).replace(',', '.')) : val;
    if (newVal !== value) {
      onSave(newVal);
    }
  };

  const displayValue = isCurrency
    ? (value === null || value === undefined ? '-' : formatCurrencyValue(value, currency, jpyRate, usdRate))
    : (value || '-');

  const isMoneyLocked = isCurrency && currency !== 'VND';
  const effectiveCanWrite = canWrite && !isMoneyLocked;

  if (!effectiveCanWrite) {
    return (
      <span
        title={isMoneyLocked ? `Editing locked in ${currency}. Switch to VND to edit.` : undefined}
        className={isMoneyLocked ? "cursor-not-allowed select-text opacity-95 text-slate-700 dark:text-[#c3c3c3]" : ""}
      >
        {displayValue}
      </span>
    );
  }

  if (isEditing) {
    return (
      <input
        autoFocus
        type={type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'decimal' : 'text'}
        value={val}
        onFocus={(e) => {
          isTypingRef.current = true;
          e.target.select();
        }}
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
        "cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px]",
        wrapText ? "whitespace-normal break-words" : "truncate"
      )}
      title={typeof displayValue === 'string' ? displayValue : undefined}
    >
      {displayValue}
    </div>
  );
}
