import { useCallback } from 'react';
import { Task, TaskPredecessor } from '../types';
import { useAppStore } from '../store/useAppStore';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { writeBatch } from '../lib/firestoreWrites';

export function useTaskPredecessor() {
  const tasks = useAppStore(state => state.tasks);
  const setTasks = useAppStore(state => state.setTasks);

  // Đệ quy kiểm tra vòng lặp phụ thuộc
  const isCyclic = useCallback((taskId: string, targetPredecessorId: string): boolean => {
    if (taskId === targetPredecessorId) return true;
    const targetTask = tasks.find(t => t.id === targetPredecessorId);
    if (!targetTask || !targetTask.predecessors) return false;
    
    return targetTask.predecessors.some(pred => isCyclic(taskId, pred.taskId));
  }, [tasks]);

  const updatePredecessors = async (taskId: string, newPredecessors: TaskPredecessor[]) => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) throw new Error("Không tìm thấy công việc");

    // 1. Kiểm tra vòng lặp
    const hasCycle = newPredecessors.some(pred => isCyclic(taskId, pred.taskId));
    if (hasCycle) {
      throw new Error("Phát hiện vòng lặp liên kết chéo. Không thể thực hiện.");
    }

    // 2. Dịch mảng Object thành chuỗi Legacy ("1, 2FS") cho màn hình ngoài (Gantt/Detail)
    const projectTasks = tasks
      .filter(t => t.projectCode === currentTask.projectCode)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const legacyString = newPredecessors.map(pred => {
      const pTask = projectTasks.find(t => t.id === pred.taskId);
      if (!pTask) return '';
      const stt = projectTasks.indexOf(pTask) + 1; // Số thứ tự
      const typeStr = pred.type === 'FS' ? '' : pred.type;
      return `${stt}${typeStr}`;
    }).filter(Boolean).join(', ');

    // 3. CẬP NHẬT: Lưu mảng Object và Chuỗi vào Zustand và Firestore
    const now = new Date().toISOString();
    setTasks(tasks.map(t => 
      t.id === taskId ? { ...t, predecessors: newPredecessors, predecessor: legacyString, updatedAt: now } : t
    ));

    // 4. FIX LỖI: Cập nhật state editingTask để Modal hiển thị ngay lập tức
    const editingTask = useAppStore.getState().editingTask;
    if (editingTask && editingTask.id === taskId) {
      useAppStore.getState().setEditingTask({ 
        ...editingTask, 
        predecessors: newPredecessors, 
        predecessor: legacyString,
        updatedAt: now
      });
    }

    // 5. Lưu lên Firestore đồng thời cả 2 format
    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
      batch.update(taskRef, { 
        predecessors: newPredecessors, 
        predecessor: legacyString, // Đồng bộ ngược cho UI Gantt chart cũ
        updatedAt: now 
      });
      await batch.commit();
    } catch (err) {
      console.error('[useTaskPredecessor] Update failed:', err);
      throw err;
    }
  };

  return { updatePredecessors, isCyclic };
}
