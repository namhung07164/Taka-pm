import React, { memo, useEffect, useRef, useState } from 'react';
import { Task, Project } from '../../types';
import { PredecessorSearchSuggest } from '../TaskModalParts/PredecessorSearchSuggest';
import { resolvePredecessorString } from '../../lib/predecessorMatchUtils';
import { 
  buildTaskNoMap, 
  parsePredecessors, 
  calculateTaskDatesFromPredecessors, 
  scheduleDependentTasks, 
  splitPredecessors 
} from '../../lib/ganttUtils';
import { ensureProjectTasksLoaded } from '../../lib/taskStateService';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { Edit2, Check, X, Link, Plus } from 'lucide-react';
import { cn } from '../../lib/utils';

interface GanttTooltipPredecessorProps {
  task: Task;
  tasks: Task[];
  projects: Project[];
  canWrite: boolean;
  isEditing?: boolean;
  setIsEditing?: (val: boolean) => void;
  onEditingChange?: (isEditing: boolean) => void;
  compact?: boolean;
}

export const GanttTooltipPredecessor = React.memo(function GanttTooltipPredecessor({
  task,
  tasks,
  projects,
  canWrite,
  isEditing: controlledIsEditing,
  setIsEditing: controlledSetIsEditing,
  onEditingChange,
  compact = false,
}: GanttTooltipPredecessorProps) {
  const [internalIsEditing, setInternalIsEditing] = useState(false);
  const isEditing = controlledIsEditing !== undefined ? controlledIsEditing : internalIsEditing;
  const setIsEditing = (val: boolean) => {
    if (controlledSetIsEditing) controlledSetIsEditing(val);
    else setInternalIsEditing(val);
    if (onEditingChange) onEditingChange(val);
  };

  const [val, setVal] = useState(task.predecessor || '');
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setVal(task.predecessor || '');
    }
  }, [task.predecessor, isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canWrite) return;
    setIsEditing(true);
    onEditingChange?.(true);
  };

  const handleCancel = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIsEditing(false);
    setVal(task.predecessor || '');
    onEditingChange?.(false);
  };

  const handleSave = async (rawVal: string) => {
    setIsSaving(true);
    try {
      const context = {
        projectId: task?.projectId,
        projectCode: task?.projectCode,
        projectYear: task?.projectYear,
        projectStore: task?.projectStore,
        projectLocation: task?.location,
      };

      const resolved = resolvePredecessorString(rawVal, tasks, projects, task?.projectCode, context);
      setVal(resolved);

      if (resolved === (task.predecessor || '')) {
        setIsEditing(false);
        onEditingChange?.(false);
        setIsSaving(false);
        return;
      }

      let currentTasks = useAppStore.getState().tasks || tasks;
      const updatedTask: Task = {
        ...task,
        predecessor: resolved,
        realtimeUpdate: Boolean(resolved.trim()),
        updatedAt: new Date().toISOString(),
      };

      // 1. Build map and parse predecessors
      let taskNoMap = buildTaskNoMap(projects, currentTasks);
      let parsed = parsePredecessors(resolved, taskNoMap, updatedTask);

      // 2. Load external project tasks if not resolved
      if (resolved.trim() && (!parsed.length || parsed.some((p) => !p.task))) {
        const parts = splitPredecessors(resolved, Array.from(taskNoMap.keys()));
        for (const token of parts) {
          const cleanToken = token.replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
          const matchedProj = projects.find((p) => p.code && cleanToken.toLowerCase().startsWith(p.code.toLowerCase()));
          if (matchedProj && matchedProj.code !== task.projectCode) {
            const loaded = await ensureProjectTasksLoaded(matchedProj.code);
            if (loaded.length > 0) {
              currentTasks = useAppStore.getState().tasks || currentTasks;
              taskNoMap = buildTaskNoMap(projects, currentTasks);
              parsed = parsePredecessors(resolved, taskNoMap, updatedTask);
            }
          }
        }
      }

      // 3. Recalculate dates for updatedTask
      const calcResult = calculateTaskDatesFromPredecessors(updatedTask, parsed);
      if (calcResult) {
        updatedTask.start = calcResult.start;
        updatedTask.finish = calcResult.finish;
        updatedTask.duration = calcResult.duration;
        updatedTask.durationManual = calcResult.durationManual;
      }

      // 4. Schedule dependent tasks cascading
      const updatesToDependents = scheduleDependentTasks(updatedTask, currentTasks, projects);

      // 5. Update Zustand store (0ms optimistic)
      const allTasksMap = new Map(currentTasks.map((t) => [t.id, t]));
      allTasksMap.set(updatedTask.id, updatedTask);
      updatesToDependents.forEach((u) => {
        const t = allTasksMap.get(u.id);
        if (t) {
          allTasksMap.set(u.id, {
            ...t,
            start: u.start,
            finish: u.finish,
            duration: u.duration,
            updatedAt: u.updatedAt,
          });
        }
      });
      useAppStore.getState().setTasks(Array.from(allTasksMap.values()));

      // 6. Persist to Firestore
      const batch = writeBatch(db);
      batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', updatedTask.id), updatedTask, { merge: true });
      updatesToDependents.forEach((u) => {
        batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', u.id), u, { merge: true });
      });
      batch.commit().catch((err) => {
        console.error('Failed to persist task predecessor update:', err);
      });

      useAppStore.getState().setToast({
        title: 'Predecessor Updated',
        message: resolved ? `Linked to ${resolved}` : 'Predecessor removed',
        type: 'success',
      });
    } catch (err: any) {
      console.error('Error saving predecessor:', err);
      useAppStore.getState().setToast({
        title: 'Update Failed',
        message: err.message || 'Could not update predecessor',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
      setIsEditing(false);
      onEditingChange?.(false);
    }
  };

  if (!canWrite && !task.predecessor) {
    return null;
  }

  if (isEditing) {
    return (
      <div 
        ref={containerRef} 
        onClick={(e) => e.stopPropagation()} 
        onMouseDown={(e) => e.stopPropagation()}
        className="flex flex-col gap-1.5 p-2 rounded-xl bg-slate-900/95 dark:bg-slate-950/95 border border-blue-500/50 shadow-md my-1 w-full min-w-[240px] max-w-[320px] max-h-[360px] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between text-[11px] font-bold text-blue-300">
          <span className="flex items-center gap-1">
            <Link className="w-3 h-3 text-blue-400" />
            Edit Predecessor
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleCancel}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="w-full relative" onKeyDown={(e) => {
          if (e.key === 'Escape') {
            handleCancel();
          }
        }}>
        <PredecessorSearchSuggest 
          task={task}
          canWrite={canWrite}
        />
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-400">Pred:</span>
        {task.predecessor ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span 
              className="font-mono text-[11px] font-bold text-blue-300 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-700/50 max-w-[180px] truncate"
              title={task.predecessor}
            >
              {task.predecessor}
            </span>
            {canWrite && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="p-0.5 text-slate-400 hover:text-blue-300 hover:bg-slate-700/80 rounded transition-colors cursor-pointer"
                title="Edit Predecessor"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : canWrite ? (
          <button
            type="button"
            onClick={handleStartEdit}
            className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
          >
            <Plus className="w-3 h-3" />
            Add Predecessor
          </button>
        ) : (
          <span className="text-slate-400">N/A</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 flex-1 min-w-[120px]">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 dark:text-[#838383] text-[10px] uppercase tracking-wider font-semibold">
          Predecessors
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={handleStartEdit}
            className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-0.5 cursor-pointer"
            title={task.predecessor ? "Edit Predecessor" : "Add Predecessor"}
          >
            {task.predecessor ? (
              <>
                <Edit2 className="w-2.5 h-2.5" />
                Edit
              </>
            ) : (
              <>
                <Plus className="w-2.5 h-2.5" />
                Add
              </>
            )}
          </button>
        )}
      </div>
      {task.predecessor ? (
        <div 
          onClick={canWrite ? handleStartEdit : undefined}
          className={cn(
            "font-medium font-mono text-[11px] text-blue-300 bg-blue-950/50 px-2 py-1 rounded-lg border border-blue-800/60 whitespace-normal break-words shadow-xs",
            canWrite ? "cursor-pointer hover:border-blue-400 hover:bg-blue-900/50 transition-colors" : ""
          )}
          title={task.predecessor}
        >
          {task.predecessor}
        </div>
      ) : (
        <button
          type="button"
          onClick={canWrite ? handleStartEdit : undefined}
          className="text-left text-xs text-slate-400 hover:text-blue-300 italic px-2 py-1 rounded-lg border border-dashed border-slate-700 hover:border-blue-500/70 transition-colors flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-3 h-3 text-blue-400" />
          <span>Add Predecessor...</span>
        </button>
      )}
    </div>
  );
});
