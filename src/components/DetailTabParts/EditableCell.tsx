import React, { useState, useEffect } from 'react';
import { formatDisplayDateTime, getDefaultDatetimeLocal } from '../../lib/utils';

export const EditableCell = React.memo(function EditableCell({ 
  value, 
  type = 'text', 
  options, 
  onSave, 
  canWrite, 
  isDate = false,
  listId
}: { 
  value: any, 
  type?: string, 
  options?: ({label: string, value: string} | string)[], 
  onSave: (val: any) => void, 
  canWrite: boolean, 
  isDate?: boolean,
  listId?: string
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');

  useEffect(() => {
    setVal(value !== undefined && value !== null ? value : '');
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    const newVal = type === 'number' ? Number(val) : val;
    if (newVal !== value) {
      onSave(newVal);
    }
  };

  const handleEditClick = () => {
    setIsEditing(true);
    if (isDate && (!val || val === '')) {
      setVal(getDefaultDatetimeLocal());
    }
  };

  if (!canWrite) {
    return <span>{isDate ? formatDisplayDateTime(value) : (value !== undefined && value !== null && value !== '' ? value : '-')}</span>;
  }

  if (isEditing) {
    if (type === 'select') {
      return (
        <select
          autoFocus
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setIsEditing(false);
            if (e.target.value !== value) {
              onSave(e.target.value);
            }
          }}
          onBlur={handleBlur}
          className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3]"
        >
          <option value="">-</option>
          {options?.map(opt => {
            const optVal = typeof opt === 'string' ? opt : opt.value;
            const optLbl = typeof opt === 'string' ? opt : opt.label;
            return <option key={optVal} value={optVal}>{optLbl}</option>;
          })}
        </select>
      );
    }

    return (
      <input
        autoFocus
        type={type === 'number' ? 'text' : type}
        value={val}
        {...(type === 'number' ? { inputMode: 'decimal' } : {})}
        onChange={(e) => setVal(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        list={listId}
        className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3]"
      />
    );
  }

  return (
    <div 
      onClick={handleEditClick} 
      className="cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px] break-words whitespace-normal"
    >
      {isDate ? formatDisplayDateTime(value) : (value !== undefined && value !== null && value !== '' ? value : '-')}
    </div>
  );
});
