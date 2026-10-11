import { useCallback } from 'react';
import { Task, TaskPredecessor, PredecessorType } from '../types';
import { useAppStore } from '../store/useAppStore';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { writeBatch } from '../lib/firestoreWrites';

/**
 * Hook logic for managing task predecessors (Hard Links).
 * Handles cyclic dependency checks and atomic Firestore updates.
 */
export function useTaskPredecessor() {
  const tasks = useAppStore(state => state.tasks);
  const setTasks = useAppStore(state => state.setTasks);

  // 1. DỊCH NGƯỢC: Lấy mảng Object -> Trả ra chuỗi hiển thị UI (VD: "1, 2SS, 4FF")
  const getDisplayString = useCallback((predecessors: TaskPredecessor[] | undefined, projectCode: string): string => {
    if (!predecessors || predecessors.length === 0) return '';
    
    // Lọc task cùng project và sắp xếp theo orderIndex để đồng bộ STT
    const projectTasks = tasks
      .filter(t => t.projectCode === projectCode)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    
    const parts = predecessors.map(pred => {
      const targetTask = projectTasks.find(t => t.id === pred.taskId);
      if (!targetTask) {
        // Nếu không tìm thấy trong project hiện tại, có thể là cross-project link
        const crossTask = tasks.find(t => t.id === pred.taskId);
        if (!crossTask) return '';
        const typeStr = pred.type === 'FS' ? '' : pred.type;
        return `${crossTask.projectCode}!${crossTask.taskCodePhu || crossTask.name}${typeStr}`;
      }
      
      const stt = (projectTasks.indexOf(targetTask) + 1).toString();
      const typeStr = pred.type === 'FS' ? '' : pred.type; 
      return `${stt}${typeStr}`;
    });

    return parts.filter(Boolean).join(', ');
  }, [tasks]);

  // 2. NGĂN CHẶN VÒNG LẶP: Quét đệ quy họ hàng phụ thuộc
  const isCyclic = useCallback((taskId: string, targetId: string, visited = new Set<string>()): boolean => {
    if (taskId === targetId) return true;
    if (visited.has(targetId)) return false;
    visited.add(targetId);

    const targetTask = tasks.find(t => t.id === targetId);
    if (!targetTask || !targetTask.predecessors) return false;
    
    return targetTask.predecessors.some(pred => isCyclic(taskId, pred.taskId, visited));
  }, [tasks]);

  // 3. CẬP NHẬT: Lưu mảng Object và Chuỗi vào Zustand và Firestore
  const updatePredecessors = async (taskId: string, newPredecessors: TaskPredecessor[]) => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    // Kiểm tra vòng lặp cho từng link mới
    for (const pred of newPredecessors) {
      if (isCyclic(taskId, pred.taskId)) {
        const targetTask = tasks.find(t => t.id === pred.taskId);
        throw new Error(`Lỗi: Phát hiện vòng lặp phụ thuộc với công việc "${targetTask?.name || pred.taskId}"`);
      }
    }

    // Tạo chuỗi hiển thị tương ứng
    const newPredecessorString = getDisplayString(newPredecessors, currentTask.projectCode);

    // Nếu cấu trúc không đổi, bỏ qua
    if (
      JSON.stringify(currentTask.predecessors || []) === JSON.stringify(newPredecessors) &&
      currentTask.predecessor === newPredecessorString
    ) return;

    // Optimistic Update vào Zustand
    const now = new Date().toISOString();
    setTasks(tasks.map(t => t.id === taskId ? { 
      ...t, 
      predecessors: newPredecessors, 
      predecessor: newPredecessorString,
      updatedAt: now 
    } : t));
    
    // Ghi lên Firestore
    try {
      const batch = writeBatch(db);
      const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
      batch.update(taskRef, { 
        predecessors: newPredecessors, 
        predecessor: newPredecessorString,
        updatedAt: now 
      });
      await batch.commit();
    } catch (err) {
      console.error('[useTaskPredecessor] Update failed:', err);
      throw err;
    }
  };

  return { updatePredecessors, isCyclic, getDisplayString };
}
