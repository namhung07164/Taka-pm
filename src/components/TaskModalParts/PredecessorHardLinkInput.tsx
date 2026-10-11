import React, { useState, useEffect } from 'react';
import { Task } from '../../types';
import { usePredecessorHardLink } from '../../hooks/usePredecessorHardLink';
import { useAppStore } from '../../store/useAppStore';

interface PredecessorHardLinkInputProps {
  task: Task;
  canWrite: boolean;
  className?: string;
}

export const PredecessorHardLinkInput: React.FC<PredecessorHardLinkInputProps> = React.memo(({
  task,
  canWrite,
  className = ''
}) => {
  const { getDisplayString, parseAndSave } = usePredecessorHardLink();
  const setToast = useAppStore(state => state.setToast);
  
  // State quản lý text hiển thị trên UI
  const [displayValue, setDisplayValue] = useState(() => 
    getDisplayString(task.predecessors, task.projectCode)
  );

  // Tự động đồng bộ text nếu cấu trúc bị thay đổi từ bên ngoài (kéo thả đổi vị trí)
  useEffect(() => {
    setDisplayValue(getDisplayString(task.predecessors, task.projectCode));
  }, [task.predecessors, task.projectCode, getDisplayString]);

  const handleBlur = async () => {
    if (!canWrite) return;
    try {
      await parseAndSave(task.id, task.projectCode, displayValue);
      // Tự động format lại text cho chuẩn đẹp sau khi lưu
      setDisplayValue(getDisplayString(task.predecessors, task.projectCode));
    } catch (err: any) {
      // Nếu dính lỗi vòng lặp, báo toast và roll-back lại text cũ
      setToast({ title: 'Không thể liên kết', message: err.message, type: 'error' });
      setDisplayValue(getDisplayString(task.predecessors, task.projectCode));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    }
  };

  if (!canWrite) {
    return (
      <span className="text-slate-700 dark:text-[#c3c3c3]">
        {displayValue || '-'}
      </span>
    );
  }

  return (
    <input
      type="text"
      value={displayValue}
      onChange={(e) => setDisplayValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder="VD: 1, 2FS, 3SS..."
      title="Nhập STT hoặc Tên để liên kết. Bấm Enter để lưu."
      className={`w-full px-2 py-1.5 text-xs bg-white dark:bg-[#1e1e20] border border-slate-300 dark:border-[#555] rounded-md text-slate-800 dark:text-[#e3e3e3] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${className}`}
    />
  );
});
