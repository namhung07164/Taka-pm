import { useCallback } from 'react';
import { Task, TaskPredecessor } from '../types';
import { useAppStore } from '../store/useAppStore';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { writeBatch } from '../lib/firestoreWrites';

export function useTaskPredecessor() {
  const tasks = useAppStore(state => state.tasks);
  const setTasks = useAppStore(state => state.setTasks);

  // Kiểm tra vòng lặp phụ thuộc (đệ quy)
  const isCyclic = useCallback((taskId: string, targetPredecessorId: string): boolean => {
    if (taskId === targetPredecessorId) return true;
    const targetTask = tasks.find(t => t.id === targetPredecessorId);
    if (!targetTask || !targetTask.predecessors) return false;
    
    return targetTask.predecessors.some(pred => isCyclic(taskId, pred.taskId));
  }, [tasks]);

  const updatePredecessors = async (taskId: string, newPredecessors: TaskPredecessor[]) => {
    // Validate vòng lặp trước khi lưu
    const hasCycle = newPredecessors.some(pred => isCyclic(taskId, pred.taskId));
    if (hasCycle) {
      throw new Error("Phát hiện vòng lặp phụ thuộc. Không thể liên kết công việc này.");
    }

    // Cập nhật Optimistic UI vào Zustand
    setTasks(tasks.map(t => 
      t.id === taskId ? { ...t, predecessors: newPredecessors } : t
    ));

    // Batch Write lên Firestore
    const batch = writeBatch(db);
    const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
    batch.update(taskRef, { predecessors: newPredecessors, updatedAt: new Date().toISOString() });
    
    await batch.commit();
  };

  return { updatePredecessors, isCyclic };
}
