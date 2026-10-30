import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Project, Task, TakaDeltaItem } from '../types';
import { useAppStore } from '../store/useAppStore';
import { db, APP_ID, writeBatch } from '../lib/firebase';
import { doc } from 'firebase/firestore';
import { recordBatchDeltas } from '../lib/deltaSyncService';
import { reorderAndCalculateTasks } from '../lib/ganttUtils';
import { reorderTasksStateUnified } from '../lib/taskStateService';
import { executeSortSubTasks, executeMoveTask } from '../components/DetailTabParts/detailTaskMoveService';

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

  // Stable refs for 0ms callbacks and prevent stale closures
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

  const dragOverRafRef = useRef<number | null>(null);

  const draggingTaskNames = useMemo(() => {
    if (draggingTaskIds.length === 0) return '';
    const dragSet = new Set(draggingTaskIds);
    return realTasks.filter(tk => dragSet.has(tk.id)).map(tk => tk.name).join(', ');
  }, [draggingTaskIds, realTasks]);

  const handleSortSubTasks = useCallback(async (p: Project, groupTasks: Task[]) => {
    await executeSortSubTasks(p, groupTasks, realTasksRef.current, projectsRef.current);
  }, []);

  const handleMoveTask = useCallback(async (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => {
    await executeMoveTask(p, groupTasks, index, direction, realTasksRef.current, projectsRef.current);
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
    } catch {}
  }, []);

  const handleDetailTaskDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingTaskIdsRef.current.includes(taskId)) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const midY = rect.height / 2;

    let pos: 'before' | 'after';
    if (dragOverTaskIdRef.current === taskId && dropPositionRef.current) {
      if (dropPositionRef.current === 'before' && relY <= midY + 4) {
        pos = 'before';
      } else if (dropPositionRef.current === 'after' && relY >= midY - 4) {
        pos = 'after';
      } else {
        pos = relY < midY ? 'before' : 'after';
      }
    } else {
      pos = relY < midY ? 'before' : 'after';
    }

    if (dragOverTaskIdRef.current !== taskId || dropPositionRef.current !== pos) {
      dragOverTaskIdRef.current = taskId;
      dropPositionRef.current = pos;
      if (dragOverRafRef.current === null) {
        dragOverRafRef.current = requestAnimationFrame(() => {
          dragOverRafRef.current = null;
          setDragOverTaskId(dragOverTaskIdRef.current);
          setDropPosition(dropPositionRef.current);
        });
      }
    }
  }, []);

  const handleDetailTaskDragLeave = useCallback((e: React.DragEvent, taskId: string) => {
    const currentRow = e.currentTarget as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;
    if (related) {
      if (currentRow.contains(related)) return;
      if (related.closest && related.closest('tr[data-task-item="true"]')) return;
    }
    if (dragOverTaskIdRef.current === taskId) {
      dragOverTaskIdRef.current = null;
      dropPositionRef.current = null;
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  }, []);

  const handleDetailTaskDragEnd = useCallback((_e: React.DragEvent) => {
    if (dragOverRafRef.current !== null) {
      cancelAnimationFrame(dragOverRafRef.current);
      dragOverRafRef.current = null;
    }
    draggingTaskIdsRef.current = [];
    dragOverTaskIdRef.current = null;
    dropPositionRef.current = null;
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
  }, []);

  const handleDetailTaskDrop = useCallback(async (e: React.DragEvent, targetTask: Task, targetProject: Project) => {
    e.preventDefault();
    if (dragOverRafRef.current !== null) {
      cancelAnimationFrame(dragOverRafRef.current);
      dragOverRafRef.current = null;
    }

    let position = dropPositionRef.current;
    if (!position) {
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

      // 0ms Optimistic local state update in Zustand
      reorderTasksStateUnified(result.allUpdatedTasks, {
        affectedProjectIds: Array.from(affectedProjectIdsSet),
      });

      // Clear selection so newly positioned tasks don't drag unintended items next
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
