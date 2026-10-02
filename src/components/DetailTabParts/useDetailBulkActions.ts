import React from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { generateId } from '../../lib/utils';
import { saveTaskStateUnified, deleteTaskStateUnified } from '../../lib/taskStateService';

interface UseDetailBulkActionsParams {
  selectedTaskIds: Set<string>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  lastCheckedTaskIdRef: React.MutableRefObject<string | null>;
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
}

export function useDetailBulkActions({
  selectedTaskIds,
  setSelectedTaskIds,
  lastCheckedTaskIdRef,
  tasks,
  projects,
  delegationGroups,
  currentUser,
}: UseDetailBulkActionsParams) {
  const handleBulkAction = async (action: 'delegation_on' | 'delegation_off' | 'flexible_on' | 'flexible_off' | 'baseline' | 'delete') => {
    if (selectedTaskIds.size === 0) return;
    
    if (action === 'delete') {
      if (!window.confirm(`Bạn có chắc muốn xoá ${selectedTaskIds.size} nhiệm vụ đã chọn?`)) return;
    }

    try {
      const batch = writeBatch(db);
      let updateCount = 0;
      const now = new Date().toISOString();

      Array.from(selectedTaskIds).forEach(taskId => {
        const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        
        if (action === 'delete') {
          batch.delete(docRef);
          updateCount++;
        } else {
          const payload: any = { updatedAt: now };
          if (action === 'delegation_on') {
            payload.delegation = true;
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              const deterministicGroupId = `del_${task.id}`;
              const existingGroup = delegationGroups.find(g => g.parentTaskId === task.id || g.id === deterministicGroupId);
              if (!existingGroup) {
                 const dateStr = now.substring(0, 10);
                 const activeUser = useAppStore.getState().currentUser || currentUser;
                 const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                 const rawParty = (task.party && task.party.trim()) ? task.party.trim() : (activeUser?.username || '');
                 const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
                 const newGroup = {
                   id: deterministicGroupId,
                   parentTaskId: task.id,
                   name: task.name || 'Delegated Task',
                   projectCode: task.projectCode,
                   projectStore: task.projectStore,
                   projectYear: (task.projectYear !== undefined && task.projectYear !== null && !isNaN(Number(task.projectYear))) ? Number(task.projectYear) : (Number(projects.find(p => p.code === task.projectCode)?.year) || new Date().getFullYear()),
                   subTasks: [{
                       id: generateId(),
                       name: '',
                       comments: '',
                       status: 'Assigned',
                       delegationStatus: 'Assigned',
                       priority: 'Mid',
                       party: parsedParty,
                       startAct: dateStr,
                       finishAct: dateStr,
                       updatedAt: now
                    }],
                   updatedAt: now,
                   createdBy: activeUserId
                 };
                 const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
                 batch.set(delRef, newGroup, { merge: true });
              }
            }
          }
          if (action === 'delegation_off') payload.delegation = false;
          if (action === 'flexible_on') payload.realtimeUpdate = true;
          if (action === 'flexible_off') payload.realtimeUpdate = false;
          
          if (action === 'baseline') {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              payload.baselineStart = task.start;
              payload.baselineFinish = task.finish;
            }
          }
          
          batch.update(docRef, payload);
          updateCount++;
        }
      });

      if (updateCount > 0) {
        if (action === 'delete') {
          deleteTaskStateUnified(Array.from(selectedTaskIds));
        } else {
          const updatedTasksList: (Partial<Task> & { id: string })[] = [];
          Array.from(selectedTaskIds).forEach(taskId => {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              const u: any = { id: taskId, updatedAt: now };
              if (action === 'delegation_on') u.delegation = true;
              if (action === 'delegation_off') u.delegation = false;
              if (action === 'flexible_on') u.realtimeUpdate = true;
              if (action === 'flexible_off') u.realtimeUpdate = false;
              if (action === 'baseline') {
                u.baselineStart = task.start;
                u.baselineFinish = task.finish;
              }
              updatedTasksList.push(u);
            }
          });
          if (updatedTasksList.length > 0) {
            saveTaskStateUnified(updatedTasksList);
          }
        }

        try {
          await batch.commit();
        } catch (error: any) {
          console.error("Batch commit failed", error);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
          return;
        }

        useAppStore.getState().setToast({ title: "Thành công", message: `Đã ${action === 'delete' ? 'xoá' : 'cập nhật'} ${updateCount} nhiệm vụ.` });
        setSelectedTaskIds(new Set());
        lastCheckedTaskIdRef.current = null;
      }
    } catch (e: any) {
      console.error(e);
      useAppStore.getState().setToast({ title: "Lỗi", message: e.message });
    }
  };

  return {
    handleBulkAction,
  };
}
