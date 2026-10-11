import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { 
  buildTaskNoMap, 
  getPredecessorCodeUpdates, 
  updatePredecessorsStrings, 
  healAllTasksPredecessors 
} from '../../lib/ganttUtils';

interface UseGanttDragReorderParams {
  tasks: Task[];
  projects: Project[];
  mainScrollRef: React.RefObject<HTMLDivElement | null>;
}

export function useGanttDragReorder({
  tasks,
  projects,
  mainScrollRef
}: UseGanttDragReorderParams) {
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [draggingTaskIds, setDraggingTaskIds] = useState<string[]>([]);

  const dragScrollInterval = useRef<NodeJS.Timeout | null>(null);
  const dragMouseY = useRef<number>(0);

  const startDragAutoScroll = useCallback(() => {
    if (dragScrollInterval.current) return;
    dragScrollInterval.current = setInterval(() => {
      const container = mainScrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const y = dragMouseY.current;
      const threshold = 60;
      const maxSpeed = 15;

      if (y < rect.top + threshold && y > rect.top - 50) {
        const factor = Math.max(0, (rect.top + threshold - y) / threshold);
        container.scrollTop -= Math.round(maxSpeed * factor);
      } else if (y > rect.bottom - threshold && y < rect.bottom + 50) {
        const factor = Math.max(0, (y - (rect.bottom - threshold)) / threshold);
        container.scrollTop += Math.round(maxSpeed * factor);
      }
    }, 16);
  }, [mainScrollRef]);

  const stopDragAutoScroll = useCallback(() => {
    if (dragScrollInterval.current) {
      clearInterval(dragScrollInterval.current);
      dragScrollInterval.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDragAutoScroll();
    };
  }, [stopDragAutoScroll]);

  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    e.stopPropagation();
    setDraggingTaskIds([taskId]);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    startDragAutoScroll();
  };

  const handleTaskDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragMouseY.current = e.clientY;

    if (draggingTaskIds.includes(taskId)) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const isTopHalf = relativeY < rect.height / 2;
    const pos = isTopHalf ? 'before' : 'after';

    if (dragOverTaskId !== taskId || dropPosition !== pos) {
      setDragOverTaskId(taskId);
      setDropPosition(pos);
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    dragMouseY.current = e.clientY;
  };

  const handleTaskDragLeave = (e: React.DragEvent, taskId: string) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    if (dragOverTaskId === taskId) {
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  };

  const handleTaskDragEnd = () => {
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
    stopDragAutoScroll();
  };

  const handleTaskDrop = async (e: React.DragEvent, targetTask: Task, parentProject?: Project) => {
    e.preventDefault();
    e.stopPropagation();
    stopDragAutoScroll();

    const draggedId = draggingTaskIds[0] || e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === targetTask.id) {
      handleTaskDragEnd();
      return;
    }

    const draggedTask = tasks.find(t => t.id === draggedId);
    if (!draggedTask) {
      handleTaskDragEnd();
      return;
    }

    // Reorder inside the same project & parent group
    const pCode = targetTask.projectCode;
    const targetParentId = targetTask.parentTaskId || (targetTask as any).parentId || null;
    const draggedParentId = draggedTask.parentTaskId || (draggedTask as any).parentId || null;

    // Sibling tasks (either root tasks of the project or child tasks of the same parent)
    const siblingTasks = tasks
      .filter(t => t.projectCode === pCode && (t.parentTaskId || (t as any).parentId || null) === targetParentId)
      .sort((a, b) => (a.orderIndex !== undefined ? a.orderIndex : ((a as any).order || 0)) - (b.orderIndex !== undefined ? b.orderIndex : ((b as any).order || 0)));

    const cleanList = siblingTasks.filter(t => t.id !== draggedTask.id);
    const targetIdx = cleanList.findIndex(t => t.id === targetTask.id);
    const insertIdx = targetIdx === -1 ? cleanList.length : (dropPosition === 'before' ? targetIdx : targetIdx + 1);

    const nowIso = new Date().toISOString();
    const movedTask: Task = {
      ...draggedTask,
      parentTaskId: targetParentId || undefined,
      updatedAt: nowIso
    };
    cleanList.splice(insertIdx, 0, movedTask);

    const oldTaskNoMap = buildTaskNoMap(projects, tasks);

    const reorderedWithOrder = cleanList.map((t, idx) => {
      const pCode = t.projectCode || '';
      const newCode = pCode ? `${pCode}#${idx + 1}` : (t.taskCodePhu || '');
      return {
        ...t,
        orderIndex: idx,
        order: (idx + 1) * 10,
        taskCodePhu: newCode || t.taskCodePhu,
        updatedAt: nowIso
      };
    });

    const updatesMap = new Map<string, Task>();
    reorderedWithOrder.forEach(t => updatesMap.set(t.id, t));

    let allUpdatedTasks = tasks.map(t => updatesMap.get(t.id) || t);
    const newTaskNoMap = buildTaskNoMap(projects, allUpdatedTasks);
    const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, allUpdatedTasks);
    const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, allUpdatedTasks, projects, oldTaskNoMap);

    if (predUpdates.length > 0) {
      const predMap = new Map(predUpdates.map(pu => [pu.id, pu]));
      allUpdatedTasks = allUpdatedTasks.map(t => {
        const pu = predMap.get(t.id);
        return pu ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t;
      });
    }

    const healed = healAllTasksPredecessors(allUpdatedTasks, projects);
    if (healed.changedCount > 0) {
      allUpdatedTasks = healed.updatedTasks;
    }

    // 0ms Optimistic UI update in Zustand
    useAppStore.getState().optimisticUpdateTasks(allUpdatedTasks);

    // Save to Firestore in batch
    const batch = writeBatch(db);
    allUpdatedTasks.forEach(t => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      batch.update(docRef, {
        order: (t as any).order,
        orderIndex: t.orderIndex,
        taskCodePhu: t.taskCodePhu,
        predecessor: t.predecessor,
        parentTaskId: t.parentTaskId || null,
        parentId: t.parentTaskId || null,
        updatedAt: t.updatedAt
      });
    });

    try {
      await batch.commit();
      useAppStore.getState().setToast({
        title: "Success",
        message: `Reordered task ${draggedTask.name}`
      });
    } catch (err) {
      console.error("Task reorder error:", err);
    }

    handleTaskDragEnd();
  };

  return {
    dragOverTaskId,
    dropPosition,
    draggingTaskIds,
    handleTaskDragStart,
    handleTaskDragOver,
    handleContainerDragOver,
    handleTaskDragLeave,
    handleTaskDragEnd,
    handleTaskDrop
  };
}
