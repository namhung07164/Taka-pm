import React, { Dispatch, SetStateAction, useCallback, useMemo, useState } from 'react';
import { Project, Task, TakaDeltaItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { db, APP_ID, writeBatch } from '../lib/firebase';
import { doc } from 'firebase/firestore';
import { recordBatchDeltas } from '../lib/deltaSyncService';
import { 
  sortTasksByPredecessorsAndDates, 
  updatePredecessorsStrings, 
  healAllTasksPredecessors, 
  reorderAndCalculateTasks,
  buildTaskNoMap,
  getPredecessorCodeUpdates
} from '../lib/ganttUtils';
import { reorderTasksStateUnified } from '../lib/taskStateService';

interface UseDetailTaskReorderParams {
  tasks: Task[];
  projects: Project[];
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export function useDetailTaskReorder({
  tasks,
  projects,
  selectedTaskIds,
  setSelectedTaskIds,
}: UseDetailTaskReorderParams) {
  const [draggingTaskIds, setDraggingTaskIds] = useState<string[]>([]);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);

  const draggingTaskNames = useMemo(() => {
    if (draggingTaskIds.length === 0) return '';
    return tasks.filter(tk => draggingTaskIds.includes(tk.id)).map(tk => tk.name).join(', ');
  }, [draggingTaskIds, tasks]);

  const handleSortSubTasks = useCallback(async (p: Project, groupTasks: Task[]) => {
    try {
      const oldTaskNoMap = buildTaskNoMap(projects, tasks);
      const sorted = sortTasksByPredecessorsAndDates(groupTasks, projects, tasks);

      const batch = writeBatch(db);
      const updatesPerTask = new Map<string, any>();
      const now = new Date().toISOString();

      sorted.forEach((t, index) => {
        const newCode = `${p.code}#${index + 1}`;
        if (t.orderIndex !== index || t.taskCodePhu !== newCode) {
          updatesPerTask.set(t.id, { 
            orderIndex: index, 
            taskCodePhu: newCode, 
            updatedAt: now 
          });
        }
      });

      let allUpdatedTasks = tasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const newTaskNoMap = buildTaskNoMap(projects, allUpdatedTasks);
      const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, allUpdatedTasks);

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, allUpdatedTasks, projects, oldTaskNoMap);
      if (predUpdates.length > 0) {
        const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
        predUpdates.forEach(pu => {
          const existingUpdates = updatesPerTask.get(pu.id) || {};
          updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        });
        allUpdatedTasks = allUpdatedTasks.map(t => {
          const pu = predMap.get(t.id);
          return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
        });
      }

      // Heal all remaining legacy or out-of-sync predecessors
      const healed = healAllTasksPredecessors(allUpdatedTasks, projects);
      if (healed.changedCount > 0) {
        allUpdatedTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, { ...existingUpdates, predecessor: u.predecessor, updatedAt: u.updatedAt });
        });
      }

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

      updatesPerTask.forEach((updates, taskId) => {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        batch.update(tRef, updates);
      });

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
        const deltaItems: TakaDeltaItem[] = Array.from(updatesPerTask.entries()).map(([taskId, patch]) => ({
          docId: taskId,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: patch,
          year: p.year ? String(p.year) : undefined,
        }));
        recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'reorder_tasks').catch(() => {});
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

      useAppStore.getState().setToast({
        title: "Sắp xếp thành công",
        message: "Đã đánh lại số thứ tự và tự động điền lại Predecessor theo Task code mới.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
    }
  }, [tasks, projects]);

  const handleMoveTask = useCallback(async (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === groupTasks.length - 1)) return;

    try {
      const oldTaskNoMap = buildTaskNoMap(projects, tasks);
      const sorted = [...groupTasks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const [movedTask] = sorted.splice(index, 1);
      sorted.splice(targetIndex, 0, movedTask);

      const batch = writeBatch(db);
      const updatesPerTask = new Map<string, any>();
      const now = new Date().toISOString();

      sorted.forEach((t, newIdx) => {
        const newCode = `${p.code}#${newIdx + 1}`;
        if (t.orderIndex !== newIdx || t.taskCodePhu !== newCode) {
          updatesPerTask.set(t.id, { 
            orderIndex: newIdx, 
            taskCodePhu: newCode, 
            updatedAt: now 
          });
        }
      });

      let allUpdatedTasks = tasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const newTaskNoMap = buildTaskNoMap(projects, allUpdatedTasks);
      const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, allUpdatedTasks);

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, allUpdatedTasks, projects, oldTaskNoMap);
      if (predUpdates.length > 0) {
        const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
        predUpdates.forEach(pu => {
          const existingUpdates = updatesPerTask.get(pu.id) || {};
          updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        });
        allUpdatedTasks = allUpdatedTasks.map(t => {
          const pu = predMap.get(t.id);
          return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
        });
      }

      // Heal any remaining legacy or out-of-sync predecessors
      const healed = healAllTasksPredecessors(allUpdatedTasks, projects);
      if (healed.changedCount > 0) {
        allUpdatedTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, { ...existingUpdates, predecessor: u.predecessor, updatedAt: u.updatedAt });
        });
      }

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

      updatesPerTask.forEach((updates, taskId) => {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        batch.update(tRef, updates);
      });

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
        const deltaItems: TakaDeltaItem[] = Array.from(updatesPerTask.entries()).map(([taskId, patch]) => ({
          docId: taskId,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: patch,
          year: p.year ? String(p.year) : undefined,
        }));
        recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'move_task').catch(() => {});
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
    } catch (error) {
      console.error(error);
    }
  }, [tasks, projects]);

  const handleDetailTaskDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    const tasksToMove = selectedTaskIds.has(taskId)
      ? Array.from(selectedTaskIds)
      : [taskId];
    setDraggingTaskIds(tasksToMove);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        type: "task-reorder",
        tasks: tasksToMove,
      })
    );
    e.dataTransfer.effectAllowed = "move";
    try {
      const cell = (e.currentTarget as HTMLElement).querySelector("td");
      if (cell) e.dataTransfer.setDragImage(cell, 10, 10);
    } catch (err) {}
  }, [selectedTaskIds]);

  const handleDetailTaskDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingTaskIds.includes(taskId)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pos: 'before' | 'after' = relY < rect.height / 2 ? 'before' : 'after';

    if (dragOverTaskId !== taskId || dropPosition !== pos) {
      setDragOverTaskId(taskId);
      setDropPosition(pos);
    }
  }, [draggingTaskIds, dragOverTaskId, dropPosition]);

  const handleDetailTaskDragLeave = useCallback((e: React.DragEvent, taskId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    if (dragOverTaskId === taskId) {
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  }, [dragOverTaskId]);

  const handleDetailTaskDragEnd = useCallback((e: React.DragEvent) => {
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
    const tr = e.currentTarget as HTMLTableRowElement;
    if (tr) tr.removeAttribute('draggable');
  }, []);

  const handleDetailTaskDrop = useCallback(async (e: React.DragEvent, targetTask: Task, targetProject: Project) => {
    e.preventDefault();
    const position = dropPosition || 'before';
    setDragOverTaskId(null);
    setDropPosition(null);
    setDraggingTaskIds([]);

    try {
      let payloadStr = e.dataTransfer.getData("application/json");
      if (!payloadStr) {
        const textPlain = e.dataTransfer.getData("text/plain");
        if (textPlain) {
          const parsed = JSON.parse(textPlain);
          if (!parsed.type) parsed.type = "task-reorder";
          payloadStr = JSON.stringify(parsed);
        }
      }

      if (!payloadStr) return;
      const data = JSON.parse(payloadStr);
      if (data.type !== "task-reorder" || !data.tasks || !Array.isArray(data.tasks)) return;

      const tasksToMoveIds: string[] = data.tasks;
      if (tasksToMoveIds.length === 0) return;
      if (tasksToMoveIds.includes(targetTask.id)) return;

      const result = reorderAndCalculateTasks(
        tasks,
        projects,
        targetProject,
        tasksToMoveIds,
        targetTask.id,
        position
      );
      if (!result) return;

      // Optimistic local state update in Zustand & sync project dates immediately
      reorderTasksStateUnified(result.allUpdatedTasks);

      const writeBatches: any[] = [];
      let currentWriteBatch = writeBatch(db);
      let writeCount = 0;

      for (const tu of result.taskUpdates) {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tu.id);
        currentWriteBatch.update(tRef, tu.updates);
        writeCount++;
        if (writeCount >= 400) {
          writeBatches.push(currentWriteBatch.commit());
          currentWriteBatch = writeBatch(db);
          writeCount = 0;
        }
      }

      for (const pu of result.predecessorUpdates) {
        const alreadyInBatch = result.taskUpdates.some((tu) => tu.id === pu.id);
        if (!alreadyInBatch) {
          const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", pu.id);
          currentWriteBatch.update(tRef, {
            predecessor: pu.predecessor,
            updatedAt: pu.updatedAt,
          });
          writeCount++;
          if (writeCount >= 400) {
            writeBatches.push(currentWriteBatch.commit());
            currentWriteBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      if (writeCount > 0) writeBatches.push(currentWriteBatch.commit());
      await Promise.all(writeBatches);

      const deltaItems: TakaDeltaItem[] = [];
      result.taskUpdates.forEach((tu) => {
        deltaItems.push({
          docId: tu.id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: tu.updates,
        });
      });
      result.predecessorUpdates.forEach((pu) => {
        if (!result.taskUpdates.some((tu) => tu.id === pu.id)) {
          deltaItems.push({
            docId: pu.id,
            collectionName: 'taka_tasks',
            action: 'update',
            isPatch: true,
            data: { predecessor: pu.predecessor, updatedAt: pu.updatedAt },
          });
        }
      });
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'drag_reorder').catch(() => {});
      }

      setSelectedTaskIds(new Set());
    } catch (err) {
      console.error("DetailTab drop error:", err);
    }
  }, [dropPosition, tasks, projects, setSelectedTaskIds]);

  return {
    draggingTaskIds,
    dragOverTaskId,
    dropPosition,
    draggingTaskNames,
    handleSortSubTasks,
    handleMoveTask,
    handleDetailTaskDragStart,
    handleDetailTaskDragOver,
    handleDetailTaskDragLeave,
    handleDetailTaskDragEnd,
    handleDetailTaskDrop,
  };
}
