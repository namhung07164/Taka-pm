import React, { useState, useEffect, useRef } from 'react';
import { PredecessorMultiInput } from '../PredecessorMultiInput';
import { Task, Project } from '../../types';

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
  const [val, setVal] = useState(value !== undefined && value !== null ? value : '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVal(value !== undefined && value !== null ? value : '');
  }, [value]);

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

  if (!canWrite) {
    return <span>{value !== undefined && value !== null && value !== '' ? value : '-'}</span>;
  }

  if (isEditing) {
    return (
      <div ref={containerRef} className="w-full relative" onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setIsEditing(false);
          if (val !== value) onSave(val);
        } else if (e.key === 'Escape') {
          setIsEditing(false);
          setVal(value !== undefined && value !== null ? value : '');
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
      <span className={val ? '' : 'text-slate-300 dark:text-slate-600'}>
        {val || '...'}
      </span>
    </div>
  );
});
