import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
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
    const targetTask = tasks.find(t => String(t.id) === String(taskId));
    const isParentTask = targetTask && (
      Boolean((targetTask as any).isModularParent) ||
      tasks.some(other => {
        const rawParent = other.parentTaskId || (other as any).parentId;
        if (!rawParent) return false;
        const rawStr = String(rawParent).trim().toLowerCase();
        return String(rawParent) === String(targetTask.id) ||
          (targetTask.taskCodePhu && rawStr === String(targetTask.taskCodePhu).trim().toLowerCase());
      })
    );
    if (isParentTask) {
      e.preventDefault();
      return;
    }
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
    const pCode = targetTask.projectCode || draggedTask.projectCode;

    // Check if draggedTask is a parent task (has child tasks in the store)
    const childTasksOfDragged = tasks.filter(t => {
      if (!t || t.id === draggedTask.id) return false;
      const rawPId = String(t.parentTaskId || (t as any).parentId || '').trim();
      if (!rawPId) return false;
      return (
        rawPId === String(draggedTask.id) ||
        (draggedTask.taskCodePhu && rawPId.toLowerCase() === String(draggedTask.taskCodePhu).trim().toLowerCase())
      );
    });
    const isParentTask = childTasksOfDragged.length > 0;

    // Determine targetParentId:
    // 1) If draggedTask is a parent task (task gộp cha), force targetParentId to null (root level).
    // 2) If draggedTask is a child task, check if targetTask is a parent task or subtask.
    let targetParentId: string | null = null;
    if (isParentTask) {
      targetParentId = null;
    } else {
      const targetIsParent = tasks.some(t => {
        if (!t || t.id === targetTask.id) return false;
        const rawPId = String(t.parentTaskId || (t as any).parentId || '').trim();
        return rawPId === String(targetTask.id) || (targetTask.taskCodePhu && rawPId.toLowerCase() === String(targetTask.taskCodePhu).trim().toLowerCase());
      });

      if (targetIsParent && !targetTask.parentTaskId && !(targetTask as any).parentId) {
        // Dropped onto a parent task -> attach as child of targetTask
        targetParentId = targetTask.id;
      } else {
        // Otherwise match targetTask's parentTaskId
        targetParentId = targetTask.parentTaskId || (targetTask as any).parentId || null;
      }
    }

    // Sibling tasks (either root tasks of the project or child tasks of the same parent)
    const siblingTasks = tasks
      .filter(t => 
        (t.projectCode || '') === (pCode || '') && 
        (t.parentTaskId || (t as any).parentId || null) === targetParentId
      )
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
    if (targetParentId) {
      (movedTask as any).parentId = targetParentId;
    } else {
      delete (movedTask as any).parentId;
    }
    cleanList.splice(insertIdx, 0, movedTask);

    const oldTaskNoMap = buildTaskNoMap(projects, tasks);

    const reorderedWithOrder = cleanList.map((t, idx) => {
      const pCodeVal = t.projectCode || '';
      const newCode = pCodeVal ? `${pCodeVal}#${idx + 1}` : (t.taskCodePhu || '');
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

    // Preserve parent-child relationships: ensure all child tasks point to parent's canonical ID
    const parentCodeToIdMap = new Map<string, string>();
    reorderedWithOrder.forEach(pt => {
      parentCodeToIdMap.set(pt.id, pt.id);
      if (pt.taskCodePhu) parentCodeToIdMap.set(pt.taskCodePhu.trim().toLowerCase(), pt.id);
    });

    let allUpdatedTasks = tasks.map(t => {
      const updatedSibling = updatesMap.get(t.id);
      if (updatedSibling) return updatedSibling;

      // Check if this task is a child of any reordered parent task
      const rawPId = String(t.parentTaskId || (t as any).parentId || '').trim();
      if (rawPId) {
        const canonicalParentId = parentCodeToIdMap.get(rawPId) || parentCodeToIdMap.get(rawPId.toLowerCase());
        if (canonicalParentId && (t.parentTaskId !== canonicalParentId || (t as any).parentId !== canonicalParentId)) {
          const res = {
            ...t,
            parentTaskId: canonicalParentId,
            updatedAt: nowIso
          };
          (res as any).parentId = canonicalParentId;
          return res;
        }
      }
      return t;
    });
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

    // Save to Firestore in batch with dirty-checking to eliminate redundant writes
    const batch = writeBatch(db);
    let writeCount = 0;

    allUpdatedTasks.forEach(t => {
      const orig = tasks.find(o => o.id === t.id);
      
      // Dirty check: Only write to Firestore if fields actually changed
      const isNew = !orig;
      const orderChanged = orig ? (orig as any).order !== (t as any).order : true;
      const orderIndexChanged = orig ? orig.orderIndex !== t.orderIndex : true;
      const codeChanged = orig ? orig.taskCodePhu !== t.taskCodePhu : true;
      const predChanged = orig ? orig.predecessor !== t.predecessor : true;
      const parentChanged = orig ? (orig.parentTaskId || null) !== (t.parentTaskId || null) : true;

      if (isNew || orderChanged || orderIndexChanged || codeChanged || predChanged || parentChanged) {
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
        writeCount++;
      }
    });

    if (writeCount > 0) {
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
