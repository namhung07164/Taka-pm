import React, { useState, useEffect, useRef } from 'react';
import { PredecessorHardLinkInput } from '../TaskModalParts/PredecessorHardLinkInput';
import { Task, Project } from '../../types';
import { resolvePredecessorString } from '../../lib/predecessorMatchUtils';
import { useAppStore } from '../../store/useAppStore';
import { splitPredecessors, computeTaskCode } from '../../lib/ganttUtils';
import { parsePredecessorToken, findTaskByQueryOrCode } from '../../lib/predecessorMatchUtils';

export const PredecessorEditableCell = React.memo(function PredecessorEditableCell({
  value,
  onSave,
  canWrite,
  task,
  tasks,
  projects
}: {
  value: any,
  onSave: (updates: Partial<Task>) => void,
  canWrite: boolean,
  task: Task,
  tasks?: Task[],
  projects?: Project[]
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setVal(value !== undefined && value !== null ? value : '');
    }
  }, [value, isEditing]);

  const commitSave = (rawVal: string) => {
    setIsEditing(false);
    const context = {
      projectId: task?.projectId,
      projectCode: task?.projectCode,
      projectYear: task?.projectYear,
      projectStore: task?.projectStore,
      projectLocation: task?.location
    };
    const effectiveTasks = (tasks && tasks.length > 0) ? tasks : (useAppStore.getState().tasks || []);
    const effectiveProjects = (projects && projects.length > 0) ? projects : (useAppStore.getState().projects || []);
    const resolved = resolvePredecessorString(rawVal, effectiveTasks, effectiveProjects, task?.projectCode, context, task.predecessorTaskIds);
    setVal(resolved);
    if (resolved !== (value || '')) {
      const finalTokens = splitPredecessors(resolved, effectiveTasks.map(t => computeTaskCode(effectiveProjects, effectiveTasks, t)));
      const newIds = finalTokens.map(tok => {
        const { query } = parsePredecessorToken(tok);
        if (!query) return '';
        const t = findTaskByQueryOrCode(query, effectiveTasks, effectiveProjects, context);
        return t ? t.id : '';
      });
      onSave({ predecessor: resolved, predecessorTaskIds: newIds });
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('.fixed') || target.closest('[role="dialog"]') || target.closest('.modal-handle'))) {
        return;
      }
      if (isEditing && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        commitSave(val);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing, val, value, onSave, tasks, projects, task?.projectCode, task?.projectId, task?.projectYear, task?.projectStore, task?.location, task.predecessorTaskIds]);

  const displayVal = isEditing ? val : (value !== undefined && value !== null ? value : '');

  if (!canWrite) {
    return (
      <span className={displayVal ? 'font-mono text-xs text-blue-600 dark:text-[#8ab4f8] font-medium' : 'text-slate-400'}>
        {displayVal !== undefined && displayVal !== null && displayVal !== '' ? displayVal : '-'}
      </span>
    );
  }

  if (isEditing) {
    return (
      <div ref={containerRef} className="w-full relative" onKeyDown={(e) => {
        if (e.defaultPrevented) return;
        if (e.key === 'Enter') {
          commitSave(val);
        } else if (e.key === 'Escape') {
          setIsEditing(false);
          setVal(displayVal !== undefined && displayVal !== null ? displayVal : '');
        }
      }}>
        <PredecessorHardLinkInput 
          task={task}
          canWrite={canWrite}
        />
      </div>
    );
  }

  return (
    <div 
      className="cursor-pointer min-h-[24px] w-full flex items-center hover:bg-slate-50 dark:hover:bg-[#202023] rounded transition-colors group"
      onClick={() => setIsEditing(true)}
    >
      <span className={displayVal ? 'font-mono text-xs text-blue-600 dark:text-[#8ab4f8] font-medium' : 'text-slate-400 dark:text-slate-600'}>
        {displayVal || '...'}
      </span>
    </div>
  );
});
