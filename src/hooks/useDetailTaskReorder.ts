import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  const realTasks = useMemo(
    () => tasks.filter((t) => t && !(t as any)._isVirtualSummary && !String(t.id || '').startsWith('ts_')),
    [tasks]
  );

  // Refs to keep drag callbacks 100% referentially stable and prevent stale closures across memoized DetailTaskRows
  const realTasksRef = useRef(realTasks);
  realTasksRef.current = realTasks;

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const selectedTaskIdsRef = useRef(selectedTaskIds);
  selectedTaskIdsRef.current = selectedTaskIds;

  const draggingTaskIdsRef = useRef<string[]>(draggingTaskIds);
  draggingTaskIdsRef.current = draggingTaskIds;

  const dragOverTaskIdRef = useRef<string | null>(dragOverTaskId);
  dragOverTaskIdRef.current = dragOverTaskId;

  const dropPositionRef = useRef<'before' | 'after' | null>(dropPosition);
  dropPositionRef.current = dropPosition;

  const draggingTaskNames = useMemo(() => {
    if (draggingTaskIds.length === 0) return '';
    const dragSet = new Set(draggingTaskIds);
    return realTasks.filter(tk => dragSet.has(tk.id)).map(tk => tk.name).join(', ');
  }, [draggingTaskIds, realTasks]);

  const handleSortSubTasks = useCallback(async (p: Project, groupTasks: Task[]) => {
    try {
      const currentRealTasks = realTasksRef.current;
      const currentProjects = projectsRef.current;
      const realGroupTasks = groupTasks.filter(
        (gt) => gt && !(gt as any)._isVirtualSummary && !String(gt.id || '').startsWith('ts_')
      );
      if (realGroupTasks.length === 0) return;

      const pCodeLower = String(p.code || '').trim().toLowerCase();
      const isTaskInScope = (t: Task) => {
        if (!t || t.isDeleted) return false;
        if (p.id && t.projectId === p.id) return true;
        if (String(t.projectCode || '').trim().toLowerCase() === pCodeLower) return true;
        if (pCodeLower && t.predecessor && t.predecessor.toLowerCase().includes(pCodeLower)) return true;
        return false;
      };

      const scopedOldTasks = currentRealTasks.filter(isTaskInScope);
      const scopedProjects = [p];
      const oldTaskNoMap = buildTaskNoMap(scopedProjects, scopedOldTasks);
      const sorted = sortTasksByPredecessorsAndDates(realGroupTasks, scopedProjects, scopedOldTasks);

      const batch = writeBatch(db);
      const updatesPerTask = new Map<string, any>();
      const now = new Date().toISOString();
      const groupTaskById = new Map(realGroupTasks.map(gt => [gt.id, gt]));

      sorted.forEach((t, index) => {
        const newCode = `${p.code}#${index + 1}`;
        const origTask = groupTaskById.get(t.id) || t;
        const parentChanged = t.parentTaskId !== origTask.parentTaskId;
        if (t.orderIndex !== index || t.taskCodePhu !== newCode || parentChanged) {
          updatesPerTask.set(t.id, { 
            orderIndex: index, 
            taskCodePhu: newCode,
            ...(t.parentTaskId ? { parentTaskId: t.parentTaskId } : {}),
            updatedAt: now 
          });
        }
      });

      const scopedUpdatedTasks = scopedOldTasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const newTaskNoMap = buildTaskNoMap(scopedProjects, scopedUpdatedTasks);
      const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, scopedProjects, scopedUpdatedTasks);

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, scopedUpdatedTasks, scopedProjects, oldTaskNoMap);
      let scopedFinalTasks = scopedUpdatedTasks;
      if (predUpdates.length > 0) {
        const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
        predUpdates.forEach(pu => {
          const existingUpdates = updatesPerTask.get(pu.id) || {};
          updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        });
        scopedFinalTasks = scopedUpdatedTasks.map(t => {
          const pu = predMap.get(t.id);
          return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
        });
      }

      // Heal any remaining legacy or out-of-sync predecessors within scoped tasks
      const healed = healAllTasksPredecessors(scopedFinalTasks, currentProjects);
      if (healed.changedCount > 0) {
        scopedFinalTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, {
            ...existingUpdates,
            ...(u.predecessor !== undefined ? { predecessor: u.predecessor } : {}),
            ...(u.taskCodePhu !== undefined ? { taskCodePhu: u.taskCodePhu } : {}),
            updatedAt: u.updatedAt,
          });
        });
      }

      const scopedFinalById = new Map(scopedFinalTasks.map(t => [t.id, t]));
      const allUpdatedTasks = currentRealTasks.map(t => scopedFinalById.get(t.id) || t);

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

      setTimeout(() => {
        try {
          updatesPerTask.forEach((updates, taskId) => {
            const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
            batch.set(tRef, updates, { merge: true });
          });
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
        }
      }, 0);

      useAppStore.getState().setToast({
        title: "Sắp xếp thành công",
        message: "Đã đánh lại số thứ tự và tự động điền lại Predecessor theo Task code mới.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleMoveTask = useCallback(async (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === groupTasks.length - 1)) return;

    try {
      const currentRealTasks = realTasksRef.current;
      const currentProjects = projectsRef.current;
      const realGroupTasks = groupTasks.filter(
        (gt) => gt && !(gt as any)._isVirtualSummary && !String(gt.id || '').startsWith('ts_')
      );
      if (realGroupTasks.length === 0) return;

      const pCodeLower = String(p.code || '').trim().toLowerCase();
      const isTaskInScope = (t: Task) => {
        if (!t || t.isDeleted) return false;
        if (p.id && t.projectId === p.id) return true;
        if (String(t.projectCode || '').trim().toLowerCase() === pCodeLower) return true;
        if (pCodeLower && t.predecessor && t.predecessor.toLowerCase().includes(pCodeLower)) return true;
        return false;
      };

      const scopedOldTasks = currentRealTasks.filter(isTaskInScope);
      const scopedProjects = [p];
      const oldTaskNoMap = buildTaskNoMap(scopedProjects, scopedOldTasks);
      const sorted = [...realGroupTasks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sorted.length) return;
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

      const scopedUpdatedTasks = scopedOldTasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const newTaskNoMap = buildTaskNoMap(scopedProjects, scopedUpdatedTasks);
      const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, scopedProjects, scopedUpdatedTasks);

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, scopedUpdatedTasks, scopedProjects, oldTaskNoMap);
      let scopedFinalTasks = scopedUpdatedTasks;
      if (predUpdates.length > 0) {
        const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
        predUpdates.forEach(pu => {
          const existingUpdates = updatesPerTask.get(pu.id) || {};
          updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        });
        scopedFinalTasks = scopedUpdatedTasks.map(t => {
          const pu = predMap.get(t.id);
          return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
        });
      }

      const healed = healAllTasksPredecessors(scopedFinalTasks, currentProjects);
      if (healed.changedCount > 0) {
        scopedFinalTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, {
            ...existingUpdates,
            ...(u.predecessor !== undefined ? { predecessor: u.predecessor } : {}),
            ...(u.taskCodePhu !== undefined ? { taskCodePhu: u.taskCodePhu } : {}),
            updatedAt: u.updatedAt,
          });
        });
      }

      const scopedFinalById = new Map(scopedFinalTasks.map(t => [t.id, t]));
      const allUpdatedTasks = currentRealTasks.map(t => scopedFinalById.get(t.id) || t);

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

      setTimeout(() => {
        try {
          updatesPerTask.forEach((updates, taskId) => {
            const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
            batch.set(tRef, updates, { merge: true });
          });
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
        }
      }, 0);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const handleDetailTaskDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    const currentSelected = selectedTaskIdsRef.current;
    const tasksToMove = currentSelected.has(taskId)
      ? Array.from(currentSelected)
      : [taskId];
    draggingTaskIdsRef.current = tasksToMove;
    setDraggingTaskIds(tasksToMove);

    const payload = JSON.stringify({
      type: "task-reorder",
      tasks: tasksToMove,
    });
    e.dataTransfer.setData("application/json", payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "move";
    try {
      const cell = (e.currentTarget as HTMLElement).querySelector("td");
      if (cell) e.dataTransfer.setDragImage(cell, 10, 10);
    } catch (err) {}
  }, []);

  const handleDetailTaskDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingTaskIdsRef.current.includes(taskId)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pos: 'before' | 'after' = relY < rect.height / 2 ? 'before' : 'after';

    if (dragOverTaskIdRef.current !== taskId || dropPositionRef.current !== pos) {
      dragOverTaskIdRef.current = taskId;
      dropPositionRef.current = pos;
      setDragOverTaskId(taskId);
      setDropPosition(pos);
    }
  }, []);

  const handleDetailTaskDragLeave = useCallback((e: React.DragEvent, taskId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    if (dragOverTaskIdRef.current === taskId) {
      dragOverTaskIdRef.current = null;
      dropPositionRef.current = null;
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  }, []);

  const handleDetailTaskDragEnd = useCallback((_e: React.DragEvent) => {
    draggingTaskIdsRef.current = [];
    dragOverTaskIdRef.current = null;
    dropPositionRef.current = null;
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
    // Note: Do NOT remove 'draggable' attribute from <tr> here so continuous drag-and-drop works seamlessly!
  }, []);

  const handleDetailTaskDrop = useCallback(async (e: React.DragEvent, targetTask: Task, targetProject: Project) => {
    e.preventDefault();
    e.stopPropagation();
    let position = dropPositionRef.current;
    if (!position && e.currentTarget) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    }
    const finalPosition = position || 'before';

    const currentDraggingIds = draggingTaskIdsRef.current;
    draggingTaskIdsRef.current = [];
    dragOverTaskIdRef.current = null;
    dropPositionRef.current = null;
    setDragOverTaskId(null);
    setDropPosition(null);
    setDraggingTaskIds([]);

    try {
      if ((targetTask as any)?._isVirtualSummary || String(targetTask?.id || '').startsWith('ts_')) return;
      let payloadStr = e.dataTransfer.getData("application/json");
      if (!payloadStr) {
        const textPlain = e.dataTransfer.getData("text/plain");
        if (textPlain) {
          try {
            const parsed = JSON.parse(textPlain);
            if (!parsed.type) parsed.type = "task-reorder";
            payloadStr = JSON.stringify(parsed);
          } catch {}
        }
      }

      let tasksToMoveIds: string[] = [];
      if (payloadStr) {
        const data = JSON.parse(payloadStr);
        if (data.type === "task-reorder" && Array.isArray(data.tasks)) {
          tasksToMoveIds = data.tasks.filter((id: string) => !String(id).startsWith('ts_'));
        }
      } else if (currentDraggingIds.length > 0) {
        tasksToMoveIds = currentDraggingIds.filter((id: string) => !String(id).startsWith('ts_'));
      }

      if (tasksToMoveIds.length === 0) return;
      if (tasksToMoveIds.includes(targetTask.id)) return;

      const currentRealTasks = realTasksRef.current;
      const currentProjects = projectsRef.current;

      const result = reorderAndCalculateTasks(
        currentRealTasks,
        currentProjects,
        targetProject,
        tasksToMoveIds,
        targetTask.id,
        finalPosition
      );
      if (!result) return;

      const affectedProjectIdsSet = new Set<string>();
      if (targetProject.id) affectedProjectIdsSet.add(targetProject.id);
      const movedSet = new Set(tasksToMoveIds);
      for (let i = 0; i < currentRealTasks.length; i++) {
        const t = currentRealTasks[i];
        if (movedSet.has(t.id) && t.projectId) {
          affectedProjectIdsSet.add(t.projectId);
        }
      }

      // 0ms Optimistic local state update in Zustand & sync only affected project dates immediately
      reorderTasksStateUnified(result.allUpdatedTasks, {
        affectedProjectIds: Array.from(affectedProjectIdsSet),
      });
      setSelectedTaskIds(new Set());

      // Background Firestore commit & delta broadcast
      setTimeout(() => {
        try {
          const writeBatches: any[] = [];
          let currentWriteBatch = writeBatch(db);
          let writeCount = 0;
          const taskUpdateIds = new Set<string>();

          for (const tu of result.taskUpdates) {
            taskUpdateIds.add(tu.id);
            const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tu.id);
            currentWriteBatch.set(tRef, tu.updates, { merge: true });
            writeCount++;
            if (writeCount >= 400) {
              writeBatches.push(currentWriteBatch.commit());
              currentWriteBatch = writeBatch(db);
              writeCount = 0;
            }
          }

          for (const pu of result.predecessorUpdates) {
            if (!taskUpdateIds.has(pu.id)) {
              const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", pu.id);
              currentWriteBatch.set(tRef, {
                predecessor: pu.predecessor,
                updatedAt: pu.updatedAt,
              }, { merge: true });
              writeCount++;
              if (writeCount >= 400) {
                writeBatches.push(currentWriteBatch.commit());
                currentWriteBatch = writeBatch(db);
                writeCount = 0;
              }
            }
          }

          if (writeCount > 0) writeBatches.push(currentWriteBatch.commit());
          Promise.all(writeBatches).catch(err => console.error("DetailTab drop batch commit error:", err));

          const deltaItems: TakaDeltaItem[] = [];
          result.taskUpdates.forEach((tu) => {
            deltaItems.push({
              docId: tu.id,
              collectionName: 'taka_tasks',
              action: 'update',
              isPatch: true,
              data: tu.updates,
              year: targetProject.year ? String(targetProject.year) : undefined,
            });
          });
          result.predecessorUpdates.forEach((pu) => {
            if (!taskUpdateIds.has(pu.id)) {
              deltaItems.push({
                docId: pu.id,
                collectionName: 'taka_tasks',
                action: 'update',
                isPatch: true,
                data: { predecessor: pu.predecessor, updatedAt: pu.updatedAt },
                year: targetProject.year ? String(targetProject.year) : undefined,
              });
            }
          });
          if (deltaItems.length > 0) {
            recordBatchDeltas(deltaItems, useAppStore.getState().currentUser?.email || 'drag_reorder').catch(() => {});
          }
        } catch (err) {
          console.error("DetailTab background drop sync error:", err);
        }
      }, 0);
    } catch (err) {
      console.error("DetailTab drop error:", err);
    }
  }, [setSelectedTaskIds]);

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
