import React, { useCallback } from 'react';
import { Task, TaskPredecessor } from '../types';
import { useAppStore } from '../store/useAppStore';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { writeBatch } from '../lib/firestoreWrites';

// Hàm phụ trợ tính toán ngày tháng
const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const getDuration = (start: string, finish: string): number => {
  const d1 = new Date(start);
  const d2 = new Date(finish);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
};

export function useTaskPredecessor() {
  const tasks = useAppStore(state => state.tasks);
  const setTasks = useAppStore(state => state.setTasks);

  // Phát hiện vòng lặp đồ thị có hướng (Cyclic Detection)
  const isCyclic = useCallback((taskId: string, targetPredecessorId: string): boolean => {
    if (taskId === targetPredecessorId) return true;
    const targetTask = tasks.find(t => t.id === targetPredecessorId);
    if (!targetTask || !targetTask.predecessors) return false;
    return targetTask.predecessors.some(pred => isCyclic(taskId, pred.taskId));
  }, [tasks]);

  const updatePredecessors = async (taskId: string, newPredecessors: TaskPredecessor[]) => {
    const currentTask = tasks.find(t => t.id === taskId);
    if (!currentTask) throw new Error("Không tìm thấy công việc");

    if (newPredecessors.some(pred => isCyclic(taskId, pred.taskId))) {
      throw new Error("Phát hiện vòng lặp phụ thuộc (Cyclic Dependency). Liên kết bị từ chối.");
    }

    // 1. THUẬT TOÁN LẬP LỊCH TỰ ĐỘNG (AUTO-SCHEDULE)
    let newStart = currentTask.start;
    let newFinish = currentTask.finish;
    const duration = getDuration(currentTask.start, currentTask.finish);

    if (newPredecessors.length > 0) {
      let maxTargetDate: Date | null = null;
      let controllingType = 'FS';

      newPredecessors.forEach(pred => {
        const pTask = tasks.find(t => t.id === pred.taskId);
        if (pTask) {
          let compareDateStr = pTask.finish; // Mặc định kết thúc của task trước
          if (pred.type === 'SS' || pred.type === 'SF') compareDateStr = pTask.start;
          
          const compareDate = new Date(compareDateStr);
          if (!isNaN(compareDate.getTime())) {
            if (!maxTargetDate || compareDate > maxTargetDate) {
              maxTargetDate = compareDate;
              controllingType = pred.type;
            }
          }
        }
      });

      if (maxTargetDate) {
        const targetDateStr = maxTargetDate.toISOString().split('T')[0];
        
        switch (controllingType) {
          case 'FS':
            newStart = addDays(targetDateStr, 1);
            newFinish = addDays(newStart, duration);
            break;
          case 'SS':
            newStart = targetDateStr;
            newFinish = addDays(newStart, duration);
            break;
          case 'FF':
            newFinish = targetDateStr;
            newStart = addDays(newFinish, -duration);
            break;
          case 'SF':
            newFinish = targetDateStr;
            newStart = addDays(newFinish, -duration);
            break;
        }
      }
    }

    // 2. CHUẨN HÓA DỮ LIỆU HIỂN THỊ GANTT CHART
    // Phải tạo chuỗi hiển thị đúng format mã task (Ví dụ: L1-115FS; L1-113SS)
    const legacyString = newPredecessors.map(pred => {
      const pTask = tasks.find(t => t.id === pred.taskId);
      if (!pTask) return '';
      const code = pTask.taskCodePhu || pTask.projectCode || '';
      const typeStr = pred.type === 'FS' ? '' : pred.type;
      return `${code}${typeStr}`;
    }).filter(Boolean).join('; ');

    // 3. ĐỒNG BỘ TRẠNG THÁI (UI & DATABASE)
    const now = new Date().toISOString();
    const updatedFields = {
      predecessors: newPredecessors,
      predecessor: legacyString,
      start: newStart,
      finish: newFinish,
      updatedAt: now
    };

    setTasks(tasks.map(t => t.id === taskId ? { ...t, ...updatedFields } : t));

    const editingTask = useAppStore.getState().editingTask;
    if (editingTask && editingTask.id === taskId) {
      useAppStore.getState().setEditingTask({ ...editingTask, ...updatedFields });
    }

    const batch = writeBatch(db);
    const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', taskId);
    batch.update(taskRef, { ...updatedFields, updatedAt: now });
    await batch.commit();
  };

  return { updatePredecessors, isCyclic };
}
