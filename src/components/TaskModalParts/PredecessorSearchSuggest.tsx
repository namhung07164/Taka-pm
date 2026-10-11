import { useState, useMemo, useRef, useEffect, memo } from 'react';
import { Task, TaskPredecessor, PredecessorType } from '../../types';
import { useTaskPredecessor } from '../../hooks/useTaskPredecessor';
import { useAppStore } from '../../store/useAppStore';
import { X, Search, AlertTriangle, Link as LinkIcon } from 'lucide-react';

interface PredecessorSearchSuggestProps {
  task: Task;
  canWrite: boolean;
}

export const PredecessorSearchSuggest: React.FC<PredecessorSearchSuggestProps> = memo(({ task, canWrite }) => {
  const { updatePredecessors } = useTaskPredecessor();
  const allTasks = useAppStore(state => state.tasks);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [crossProjectWarning, setCrossProjectWarning] = useState<Task | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const currentPredecessors = task.predecessors || [];

  // 1. Xử lý đóng Dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. Lọc danh sách gợi ý (Trừ task hiện tại và các task đã link)
  const suggestions = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    
    return allTasks
      .filter(t => t.id !== task.id && !currentPredecessors.some(p => p.taskId === t.id))
      .filter(t => 
        t.name.toLowerCase().includes(term) || 
        (t.taskCodePhu && t.taskCodePhu.toLowerCase().includes(term)) ||
        t.projectCode?.toLowerCase().includes(term)
      )
      .slice(0, 15); // Giới hạn 15 kết quả để tối ưu UI
  }, [allTasks, searchTerm, task.id, currentPredecessors]);

  // 3. Xử lý chọn Task từ Dropdown
  const handleSelectSuggestion = (selectedTask: Task) => {
    setIsDropdownOpen(false);
    setSearchTerm('');

    // Nếu khác dự án -> Bật cảnh báo
    if (selectedTask.projectCode !== task.projectCode) {
      setCrossProjectWarning(selectedTask);
      return;
    }

    // Nếu cùng dự án -> Add luôn (Mặc định là FS)
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

  if (!canWrite) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {currentPredecessors.map(p => {
          const t = allTasks.find(x => x.id === p.taskId);
          return (
            <span key={p.taskId} className="px-2 py-1 bg-slate-100 dark:bg-[#252528] rounded border border-slate-200 dark:border-[#444446] text-xs font-medium text-slate-700 dark:text-[#e3e3e3]">
              <strong className="text-indigo-600 dark:text-indigo-400 mr-1">{p.type}</strong>
              {t ? `${t.taskCodePhu || t.projectCode} - ${t.name}` : 'Unknown'}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 relative" ref={wrapperRef}>
      {/* Cảnh báo Cross-Project */}
      {crossProjectWarning && (
        <div className="absolute z-[100] top-full left-0 right-0 mt-2 p-3 bg-amber-50 dark:bg-amber-950/90 border border-amber-200 dark:border-amber-700 rounded-xl shadow-lg flex flex-col gap-2">
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200 text-xs font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Bạn đang cố gắng liên kết với task <strong>{crossProjectWarning.name}</strong> thuộc dự án khác (<strong>{crossProjectWarning.projectCode}</strong>). 
              Liên kết chéo dự án có thể làm biểu đồ Gantt trở nên phức tạp. Bạn có chắc chắn không?
            </p>
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={() => setCrossProjectWarning(null)} className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg transition-colors">
              Hủy bỏ
            </button>
            <button onClick={() => executeAddPredecessor(crossProjectWarning.id, 'FS')} className="px-3 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors">
              Xác nhận liên kết
            </button>
          </div>
        </div>
      )}

      {/* Hiển thị Tags (Các task đã chọn) */}
      <div className="flex flex-wrap gap-1.5 mb-1">
        {currentPredecessors.map(p => {
          const t = allTasks.find(x => x.id === p.taskId);
          const isCross = t && t.projectCode !== task.projectCode;
          
          return (
            <div key={p.taskId} className={`flex items-stretch bg-white dark:bg-[#252528] rounded-md border ${isCross ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/50 dark:bg-amber-950/20' : 'border-slate-200 dark:border-[#444446]'} overflow-hidden shadow-xs`}>
              <select
                value={p.type}
                onChange={(e) => handleChangeType(p.taskId, e.target.value as PredecessorType)}
                className="bg-indigo-50 dark:bg-[#1a1a1f] text-indigo-700 dark:text-indigo-400 text-[10px] font-extrabold px-1.5 border-r border-slate-200 dark:border-[#444446] outline-none cursor-pointer"
              >
                <option value="FS">FS</option><option value="SS">SS</option>
                <option value="FF">FF</option><option value="SF">SF</option>
              </select>
              <div className="px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-[#e3e3e3] flex items-center gap-1 max-w-[200px]">
                {isCross && (
                  <span title="Khác dự án">
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                  </span>
                )}
                <span className="truncate" title={t?.name}>{t ? `${t.taskCodePhu || ''} ${t.name}` : 'Unknown'}</span>
              </div>
              <button onClick={() => handleRemove(p.taskId)} className="px-1.5 hover:bg-red-50 dark:hover:bg-red-950/50 text-slate-400 hover:text-red-500 border-l border-slate-200 dark:border-[#444446] transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Input Autocomplete */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
          <Search className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsDropdownOpen(true);
          }}
          onFocus={() => setIsDropdownOpen(true)}
          placeholder="Tìm tên hoặc mã công việc để liên kết..."
          className="w-full pl-8 pr-3 py-2 text-xs bg-white dark:bg-[#1e1e20] border border-slate-300 dark:border-[#555] rounded-lg text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
        />

        {/* Dropdown Suggestions */}
        {isDropdownOpen && searchTerm.trim() && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto bg-white dark:bg-[#252528] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xl flex flex-col py-1">
            {suggestions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500 italic text-center">Không tìm thấy công việc phù hợp</li>
            ) : (
              suggestions.map(t => {
                const isCross = t.projectCode !== task.projectCode;
                return (
                  <li 
                    key={t.id} 
                    onClick={() => handleSelectSuggestion(t)}
                    className="px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer flex flex-col gap-0.5 border-b border-slate-100 dark:border-[#333] last:border-0 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 dark:text-[#f3f3f3] truncate">{t.name}</span>
                      {isCross && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 shrink-0">Khác dự án</span>}
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" /> {t.projectCode} {t.taskCodePhu ? `> ${t.taskCodePhu}` : ''}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </div>
  );
});
