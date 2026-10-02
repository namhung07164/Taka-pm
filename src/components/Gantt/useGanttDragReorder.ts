import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';

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

    // Reorder inside the same project
    const pCode = targetTask.projectCode;
    const projectTasks = tasks.filter(t => t.projectCode === pCode && !t.parentTaskId);
    const targetIdx = projectTasks.findIndex(t => t.id === targetTask.id);
    const draggedIdx = projectTasks.findIndex(t => t.id === draggedTask.id);

    if (targetIdx !== -1 && draggedIdx !== -1) {
      const reordered = [...projectTasks];
      const [moved] = reordered.splice(draggedIdx, 1);
      const insertIdx = dropPosition === 'before' ? targetIdx : targetIdx + 1;
      reordered.splice(insertIdx, 0, moved);

      // Save order to store and Firestore
      const batch = writeBatch(db);
      reordered.forEach((t, i) => {
        const orderNum = (i + 1) * 10;
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
        batch.update(docRef, { order: orderNum, updatedAt: new Date().toISOString() });
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
