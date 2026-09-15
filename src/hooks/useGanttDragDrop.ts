import { useState, useRef, useCallback } from 'react';
import { Task, Project } from '../types';
import { doc } from 'firebase/firestore';
import {  db, APP_ID , writeBatch } from "../lib/firebase";
import { parseDateTime, formatToDatetimeLocal } from '../lib/utils';
import { debounce } from 'lodash';
import { scheduleDependentTasks } from '../lib/ganttUtils';
import { syncProjectDatesByCode } from '../lib/projectDatesService';

export function useGanttDragDrop(tasks: Task[], projects: Project[]) {
  const [optimisticTasks, setOptimisticTasks] = useState<Record<string, Task>>({});

  const debouncedSave = useRef(
    debounce(async (updatedTasks: Task[]) => {
      try {
        const batch = writeBatch(db);
        const projectsToSync = new Set<string>();

        updatedTasks.forEach(t => {
          const ref = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          batch.update(ref, {
            start: t.start,
            finish: t.finish,
            computedTakStart: (t as any).computedTakStart || null,
            computedTakCompl: (t as any).computedTakCompl || null,
            duration: t.duration,
            updatedAt: new Date().toISOString()
          });
          if (t.projectCode) {
            projectsToSync.add(`${t.projectCode}|${t.projectStore || ''}|${t.projectYear || ''}`);
          }
        });
        batch.commit().catch(e => console.error("Batch commit failed", e));
        
        projectsToSync.forEach(key => {
          const [code, store, year] = key.split('|');
          syncProjectDatesByCode(code, store || undefined, year || undefined);
        });
      } catch (e) {
        console.error("Error saving Gantt drag dates:", e);
      }
    }, 500)
  ).current;

  // handleTaskBarDrag will be called on mouse move.
  // It expects the INITIAL task before dragging started, so that deltaDays is applied correctly.
  const handleTaskBarDrag = useCallback((initialTask: Task, deltaDays: number) => {
    const tStart = parseDateTime(initialTask.start);
    const tFinish = parseDateTime(initialTask.finish);
    
    if (isNaN(tStart.getTime()) || isNaN(tFinish.getTime())) return;

    tStart.setDate(tStart.getDate() + deltaDays);
    tFinish.setDate(tFinish.getDate() + deltaDays);

    const newStart = formatToDatetimeLocal(tStart);
    const newFinish = formatToDatetimeLocal(tFinish);

    const newTask = { ...initialTask, start: newStart, finish: newFinish };
    
    // We apply dependencies on top of the original tasks + this new task
    // To be perfectly accurate, we should merge optimisticTasks, but 
    // for a single drag session, using the original tasks array is fine.
    const updates = scheduleDependentTasks(newTask, tasks, projects);
    const nextOptimistic = { [initialTask.id]: newTask };
    
    const tasksToSave: Task[] = [newTask];
    updates.forEach(updatedDep => {
      if (updatedDep.id) {
        nextOptimistic[updatedDep.id] = updatedDep;
        tasksToSave.push(updatedDep);
      }
    });

    setOptimisticTasks(prev => ({ ...prev, ...nextOptimistic }));
    
    debouncedSave(tasksToSave);
  }, [tasks, projects, debouncedSave]);

  const clearOptimisticTasks = useCallback(() => {
    setOptimisticTasks({});
  }, []);

  return {
    optimisticTasks,
    handleTaskBarDrag,
    clearOptimisticTasks
  };
}
