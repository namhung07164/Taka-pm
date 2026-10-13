import React, { FC, memo, useMemo, useState } from 'react';
import { Task, TaskPredecessor, PredecessorType } from '../../types';
import { Link, X, Plus } from 'lucide-react';
import { useTaskPredecessor } from '../../hooks/useTaskPredecessor';

interface TaskPredecessorSelectProps {
  currentTaskId: string;
  currentProjectCode: string;
  allTasks: Task[];
  currentPredecessors?: TaskPredecessor[];
  canWrite: boolean;
}

export const TaskPredecessorSelect: React.FC<TaskPredecessorSelectProps> = React.memo(({
  currentTaskId,
  currentProjectCode,
  allTasks,
  currentPredecessors = [],
  canWrite
}) => {
  const { updatePredecessors } = useTaskPredecessor();
  const [error, setError] = useState<string | null>(null);
  
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<PredecessorType>('FS');

  // Chỉ lấy task cùng project, ngoại trừ task hiện tại và các task đã được link
  const candidateTasks = useMemo(() => {
    return allTasks.filter(t => 
      t.projectCode === currentProjectCode && 
      t.id !== currentTaskId &&
      !currentPredecessors.some(p => p.taskId === t.id)
    );
  }, [allTasks, currentProjectCode, currentTaskId, currentPredecessors]);

  const handleAddPredecessor = async () => {
    if (!selectedTaskId) return;
    try {
      setError(null);
      const newPred: TaskPredecessor = { taskId: selectedTaskId, type: selectedType };
      await updatePredecessors(currentTaskId, [...currentPredecessors, newPred]);
      setSelectedTaskId('');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleRemovePredecessor = async (removeTaskId: string) => {
    try {
      setError(null);
      const newIds = currentPredecessors.filter(p => p.taskId !== removeTaskId);
      await updatePredecessors(currentTaskId, newIds);
    } catch (err: any) {
      console.error(err);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-slate-50 dark:bg-[#1a1a1d] rounded-xl border border-slate-200 dark:border-[#333336]">
      <label className="text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
        <Link className="w-3.5 h-3.5 text-blue-500" /> Predecessors
      </label>
      
      {/* Display linked tasks */}
      {currentPredecessors.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-1">
          {currentPredecessors.map(pred => {
            const pTask = allTasks.find(t => t.id === pred.taskId);
            const displayName = pTask ? `${pTask.taskCodePhu || 'N/A'} - ${pTask.name}` : 'Unknown Task';
            
            return (
              <div key={pred.taskId} className="flex items-center justify-between bg-white dark:bg-[#252528] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#444446] text-xs group hover:border-blue-300 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-bold font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shrink-0">
                    {pred.type}
                  </span>
                  <span className="truncate text-slate-800 dark:text-[#e3e3e3] font-medium" title={displayName}>
                    {displayName}
                  </span>
                </div>
                {canWrite && (
                  <button onClick={() => handleRemovePredecessor(pred.taskId)} className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add new predecessor form */}
      {canWrite && (
        <div className="flex items-center gap-1.5">
          <select
            value={selectedTaskId}
            onChange={(e) => setSelectedTaskId(e.target.value)}
            className="flex-1 text-xs p-2 border border-slate-300 dark:border-[#555] rounded-lg bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 truncate min-w-0"
          >
            <option value="" disabled>+ Select Task...</option>
            {candidateTasks.map(t => (
              <option key={t.id} value={t.id}>
                {t.taskCodePhu || 'N/A'} - {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as PredecessorType)}
            className="w-16 text-xs font-bold p-2 border border-slate-300 dark:border-[#555] rounded-lg bg-indigo-50 dark:bg-[#25252a] text-indigo-700 dark:text-indigo-300 outline-none shrink-0"
          >
            <option value="FS">FS</option>
            <option value="SS">SS</option>
            <option value="FF">FF</option>
            <option value="SF">SF</option>
          </select>

          <button
            onClick={handleAddPredecessor}
            disabled={!selectedTaskId}
            className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && <span className="text-[10px] text-red-500 font-bold">{error}</span>}
    </div>
  );
});
