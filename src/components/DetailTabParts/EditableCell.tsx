import React, { memo, useEffect, useRef, useState } from 'react';
import { formatDisplayDateTime, getDefaultDatetimeLocal, cn } from '../../lib/utils';

export const EditableCell = React.memo(function EditableCell({ 
  value, 
  type = 'text', 
  options, 
  onSave, 
  canWrite, 
  isDate = false,
  listId,
  className
}: { 
  value: any, 
  type?: string, 
  options?: ({label: string, value: string} | string)[], 
  onSave: (val: any) => void, 
  canWrite: boolean, 
  isDate?: boolean,
  listId?: string,
  className?: string
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');
  // Đang gõ thì KHÔNG cho dữ liệu từ store/server ghi đè ô (chống "giật ngược" khi đang nhập)
  const editingRef = useRef(false);

  useEffect(() => {
    if (editingRef.current) return;
    setVal(value !== undefined && value !== null ? value : '');
  }, [value]);

  const finishEditing = () => {
    editingRef.current = false;
    setIsEditing(false);
  };

  const handleBlur = () => {
    finishEditing();
    if (type === 'number') {
      const parsed = Number(String(val).replace(',', '.').trim());
      if (Number.isNaN(parsed)) {
        // Nhập sai định dạng số: trả về giá trị cũ, không lưu
        setVal(value !== undefined && value !== null ? value : '');
        return;
      }
      if (parsed !== value) onSave(parsed);
      return;
    }
    if (val !== value) {
      onSave(val);
    }
  };

  const handleEditClick = () => {
    editingRef.current = true;
    setIsEditing(true);
    if (isDate && (!val || val === '')) {
      setVal(getDefaultDatetimeLocal());
    }
  };

  if (!canWrite) {
    return <span className={className}>{isDate ? formatDisplayDateTime(value) : (value !== undefined && value !== null && value !== '' ? value : '-')}</span>;
  }

  if (isEditing) {
    if (type === 'select') {
      return (
        <select
          autoFocus
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            finishEditing();
            if (e.target.value !== value) {
              onSave(e.target.value);
            }
          }}
          onBlur={finishEditing}
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
          if (e.key === 'Escape') {
            setVal(value !== undefined && value !== null ? value : '');
            finishEditing();
          }
        }}
        list={listId}
        className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 outline-none text-inherit font-inherit text-slate-900 dark:text-[#e3e3e3]"
      />
    );
  }

  return (
    <div 
      onClick={handleEditClick} 
      className={cn(
        "cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a] px-1 py-0.5 rounded border border-transparent hover:border-slate-200 min-h-[24px] break-words whitespace-normal",
        className
      )}
    >
      {isDate ? formatDisplayDateTime(value) : (value !== undefined && value !== null && value !== '' ? value : '-')}
    </div>
  );
});
