import { useCallback } from 'react';
import { Task, TaskPredecessor, PredecessorType } from '../types';
import { useAppStore } from '../store/useAppStore';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { writeBatch } from '../lib/firestoreWrites';

export function usePredecessorHardLink() {
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
      if (!targetTask) return '';
      
      const stt = (projectTasks.indexOf(targetTask) + 1).toString();
      const typeStr = pred.type === 'FS' ? '' : pred.type; // Loại FS được ẩn chữ cho gọn
      return `${stt}${typeStr}`;
    });

    return parts.filter(Boolean).join(', ');
  }, [tasks]);

  // 2. NGĂN CHẶN VÒNG LẶP: Quét đệ quy họ hàng phụ thuộc
  const isCyclic = useCallback((taskId: string, targetId: string): boolean => {
    if (taskId === targetId) return true;
    const targetTask = tasks.find(t => t.id === targetId);
    if (!targetTask || !targetTask.predecessors) return false;
    
    return targetTask.predecessors.some(pred => isCyclic(taskId, pred.taskId));
  }, [tasks]);

  // 3. DỊCH XUÔI & LƯU: Lấy chuỗi user nhập -> Parse thành mảng Object -> Lưu Firebase
  const parseAndSave = async (taskId: string, projectCode: string, inputText: string) => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) return;

    const projectTasks = tasks
      .filter(t => t.projectCode === projectCode)
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));

    const newPredecessors: TaskPredecessor[] = [];
    const tokens = inputText.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    for (const token of tokens) {
      // Nhận diện cú pháp STT + Type (VD: "3", "3FS", "12SS")
      const match = token.match(/^(\d+)(FS|SS|FF|SF)?$/);
      
      if (match) {
        const stt = parseInt(match[1], 10);
        const type = (match[2] as PredecessorType) || 'FS';
        const targetTask = projectTasks[stt - 1]; // STT (bắt đầu từ 1) trừ 1 ra index mảng
        
        if (targetTask && targetTask.id !== taskId) {
          if (isCyclic(taskId, targetTask.id)) throw new Error(`Lỗi: Vòng lặp chéo tại STT ${stt}`);
          if (!newPredecessors.some(p => p.taskId === targetTask.id)) {
            newPredecessors.push({ taskId: targetTask.id, type });
          }
        }
      } else {
         // Nếu user nhập chữ (tên task hoặc mã chữ), tìm gần đúng
         const matchedTask = projectTasks.find(t => 
           t.name.toUpperCase().includes(token) || 
           (t.taskCodePhu && t.taskCodePhu.toUpperCase().includes(token))
         );
         
         if (matchedTask && matchedTask.id !== taskId) {
           if (isCyclic(taskId, matchedTask.id)) throw new Error(`Lỗi: Vòng lặp chéo tại task ${matchedTask.name}`);
           if (!newPredecessors.some(p => p.taskId === matchedTask.id)) {
             newPredecessors.push({ taskId: matchedTask.id, type: 'FS' });
           }
         }
      }
    }

    // Nếu cấu trúc không đổi, bỏ qua việc gọi API
    if (JSON.stringify(currentTask.predecessors) === JSON.stringify(newPredecessors)) return;

    // Optimistic Update vào Zustand
    setTasks(tasks.map(t => t.id === taskId ? { ...t, predecessors: newPredecessors } : t));
    
    // Ghi hàng loạt (Batch) lên Firestore
    const batch = writeBatch(db);
    const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
    batch.update(taskRef, { predecessors: newPredecessors, updatedAt: new Date().toISOString() });
    
    await batch.commit();
  };

  return { getDisplayString, parseAndSave };
}
