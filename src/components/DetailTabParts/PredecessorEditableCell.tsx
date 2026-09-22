import React, { useState, useEffect, useRef } from 'react';
import { PredecessorMultiInput } from '../PredecessorMultiInput';
import { Task, Project } from '../../types';
import { normalizeAndHealTaskPredecessors } from '../../lib/ganttUtils';

export const PredecessorEditableCell = React.memo(function PredecessorEditableCell({
  value,
  onSave,
  canWrite,
  task,
  tasks,
  projects
}: {
  value: any,
  onSave: (val: any) => void,
  canWrite: boolean,
  task: Task,
  tasks: Task[],
  projects: Project[]
}) {
  const [isEditing, setIsEditing] = useState(false);
  const healedInitial = task ? normalizeAndHealTaskPredecessors(task, tasks, projects).newPredecessor : '';
  const [val, setVal] = useState(healedInitial || (value !== undefined && value !== null ? value : ''));
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const healed = task ? normalizeAndHealTaskPredecessors(task, tasks, projects).newPredecessor : '';
    setVal(healed || (value !== undefined && value !== null ? value : ''));
  }, [value, task, tasks, projects]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (isEditing && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsEditing(false);
        if (val !== value) {
          onSave(val);
        }
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isEditing, val, value, onSave]);

  const displayVal = task ? (normalizeAndHealTaskPredecessors(task, tasks, projects).newPredecessor || val) : val;

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
        if (e.key === 'Enter') {
          setIsEditing(false);
          if (val !== value) onSave(val);
        } else if (e.key === 'Escape') {
          setIsEditing(false);
          setVal(displayVal !== undefined && displayVal !== null ? displayVal : '');
        }
      }}>
        <PredecessorMultiInput
          value={val}
          onChange={setVal}
          tasks={tasks}
          projects={projects}
          currentProjectCode={task.projectCode}
          currentProjectYear={task.projectYear}
          currentProjectStore={task.projectStore}
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
