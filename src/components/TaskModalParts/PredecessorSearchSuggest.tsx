import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Task, TaskPredecessor, PredecessorType } from '../../types';
import { useTaskPredecessor } from '../../hooks/useTaskPredecessor';
import { useAppStore } from '../../store/useAppStore';
import { X, Search, AlertTriangle, Link as LinkIcon } from 'lucide-react';

interface PredecessorSearchSuggestProps {
  task: Task;
  canWrite: boolean;
}

export const PredecessorSearchSuggest: React.FC<PredecessorSearchSuggestProps> = React.memo(({ task, canWrite }) => {
  const { updatePredecessors } = useTaskPredecessor();
  const allTasks = useAppStore(state => state.tasks);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [crossProjectWarning, setCrossProjectWarning] = useState<Task | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentPredecessors = task.predecessors || [];

  // Click outside để đóng dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    
    return allTasks
      .filter(t => t.id !== task.id && !currentPredecessors.some(p => p.taskId === t.id))
      .filter(t => 
        t.name.toLowerCase().includes(term) || 
        (t.taskCodePhu && t.taskCodePhu.toLowerCase().includes(term))
      ).slice(0, 10);
  }, [allTasks, searchTerm, task.id, currentPredecessors]);

  const handleSelectSuggestion = (selectedTask: Task) => {
    setIsDropdownOpen(false);
    setSearchTerm('');
    if (selectedTask.projectCode !== task.projectCode) {
      setCrossProjectWarning(selectedTask);
      return;
    }
    executeAddPredecessor(selectedTask.id, 'FS');
  };

  const executeAddPredecessor = async (targetId: string, type: PredecessorType) => {
    try {
      const newPred: TaskPredecessor = { taskId: targetId, type };
      await updatePredecessors(task.id, [...currentPredecessors, newPred]);
      setCrossProjectWarning(null);
    } catch (err: any) {
      useAppStore.getState().setToast({ title: 'Lỗi liên kết', message: err.message, type: 'error' });
    }
  };

  const handleRemove = async (removeId: string) => {
    try {
      const newIds = currentPredecessors.filter(p => p.taskId !== removeId);
      await updatePredecessors(task.id, newIds);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleChangeType = async (taskId: string, newType: PredecessorType) => {
    try {
      const newIds = currentPredecessors.map(p => p.taskId === taskId ? { ...p, type: newType } : p);
      await updatePredecessors(task.id, newIds);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-2 relative" ref={wrapperRef}>
      {/* Cảnh báo Cross-Project */}
      {crossProjectWarning && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/80 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-col gap-2 shadow-sm mb-1">
          <div className="flex gap-2 items-start text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>Task <strong>{crossProjectWarning.name}</strong> thuộc dự án khác ({crossProjectWarning.projectCode}). Liên kết chéo có thể làm biểu đồ phức tạp. Vẫn tiếp tục?</p>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCrossProjectWarning(null)} className="px-2.5 py-1 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-amber-100 rounded">Hủy</button>
            <button onClick={() => executeAddPredecessor(crossProjectWarning.id, 'FS')} className="px-2.5 py-1 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded">Xác nhận</button>
          </div>
        </div>
      )}

      {/* Hiển thị Tags (Thẻ liên kết) */}
      {currentPredecessors.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1">
          {currentPredecessors.map(p => {
            const t = allTasks.find(x => x.id === p.taskId);
            const isCross = t && t.projectCode !== task.projectCode;
            return (
              <div key={p.taskId} className={`flex items-stretch bg-white dark:bg-[#252528] rounded-md border ${isCross ? 'border-amber-400 bg-amber-50/50' : 'border-slate-300 dark:border-[#444]'} shadow-sm`}>
                {canWrite ? (
                  <select
                    value={p.type}
                    onChange={(e) => handleChangeType(p.taskId, e.target.value as PredecessorType)}
                    className="bg-indigo-50 dark:bg-[#1f1f22] text-indigo-700 dark:text-indigo-400 text-[10px] font-bold px-1 border-r border-slate-200 dark:border-[#444] outline-none cursor-pointer rounded-l-md appearance-none text-center"
                  >
                    <option value="FS">FS</option><option value="SS">SS</option>
                    <option value="FF">FF</option><option value="SF">SF</option>
                  </select>
                ) : (
                  <div className="bg-indigo-50 dark:bg-[#1f1f22] text-indigo-700 text-[10px] font-bold px-2 flex items-center border-r border-slate-200 dark:border-[#444]">{p.type}</div>
                )}
                
                <div className="px-2 py-1 text-xs text-slate-700 dark:text-[#e3e3e3] flex items-center gap-1.5 max-w-[220px]">
                  {isCross && <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />}
                  <span className="truncate">{t ? `${t.taskCodePhu || ''} ${t.name}` : 'Unknown'}</span>
                </div>
                {canWrite && (
                  <button onClick={() => handleRemove(p.taskId)} className="px-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 border-l border-slate-200 dark:border-[#444] rounded-r-md transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Input Search Autocomplete */}
      {canWrite && (
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none"><Search className="w-4 h-4 text-slate-400" /></div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setIsDropdownOpen(true); }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Tìm tên hoặc mã công việc để liên kết..."
            className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-[#1e1e20] border border-slate-300 dark:border-[#555] rounded-lg text-slate-800 dark:text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {/* Dropdown Box */}
          {isDropdownOpen && searchTerm.trim() && (
            <ul className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#252528] border border-slate-200 dark:border-[#444] rounded-xl shadow-xl py-1">
              {suggestions.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-500 italic text-center">Không tìm thấy công việc</li>
              ) : (
                suggestions.map(t => (
                  <li 
                    key={t.id} 
                    onClick={() => handleSelectSuggestion(t)}
                    className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-[#2e2e32] cursor-pointer flex flex-col gap-0.5 border-b border-slate-100 dark:border-[#333] last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-[#f3f3f3] truncate">{t.name}</span>
                      {t.projectCode !== task.projectCode && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">Khác dự án</span>}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> {t.projectCode} {t.taskCodePhu ? `> ${t.taskCodePhu}` : ''}
                    </div>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
