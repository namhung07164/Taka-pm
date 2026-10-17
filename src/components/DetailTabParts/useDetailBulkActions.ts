import React, { Dispatch, SetStateAction } from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, deleteField } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
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
  const handleBulkAction = async (action: 'delegation_on' | 'delegation_off' | 'flexible_on' | 'flexible_off' | 'baseline' | 'unlink' | 'delete') => {
    if (selectedTaskIds.size === 0) return;

    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;

    // Special handler: Unlink modular tasks
    if (action === 'unlink') {
      const targetIds = Array.from(selectedTaskIds);
      const targetSet = new Set(targetIds);

      const parentCodeSet = new Set<string>();
      prevTasks.forEach(t => {
        if (targetSet.has(t.id) && t.taskCodePhu) {
          parentCodeSet.add(String(t.taskCodePhu).trim().toLowerCase());
        }
      });

      const allIdsToUnlink = new Set<string>();
      targetIds.forEach(id => allIdsToUnlink.add(id));
      prevTasks.forEach(t => {
        const rawParent = t.parentTaskId || (t as any).parentId;
        if (rawParent) {
          const rawStr = String(rawParent).trim().toLowerCase();
          if (targetSet.has(String(rawParent)) || parentCodeSet.has(rawStr)) {
            allIdsToUnlink.add(t.id);
          }
        }
      });

      const unlinkedArray = Array.from(allIdsToUnlink);

      // 1. 0ms Optimistic UI update in Zustand
      const updatedTasks = prevTasks.map(t =>
        allIdsToUnlink.has(t.id)
          ? { ...t, parentTaskId: undefined, parentId: undefined, updatedAt: now }
          : t
      );
      useAppStore.getState().setTasks(updatedTasks);
      setSelectedTaskIds(new Set());
      lastCheckedTaskIdRef.current = null;

      // 2. Update Dexie (IndexedDB)
      try {
        const { localDb } = await import('../../lib/localDb');
        await Promise.all(
          unlinkedArray.map(id => (localDb.tasks.update as any)(id, { parentTaskId: null, parentId: null, updatedAt: now }))
        );
      } catch (e) {
        console.warn('[useDetailBulkActions] Dexie update failed:', e);
      }

      // 3. Write batch to Firestore
      const batch = writeBatch(db);
      unlinkedArray.forEach(id => {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
      });

      try {
        await batch.commit();
        const { recordBatchDeltas } = await import('../../lib/deltaSyncService');
        const deltaItems: any[] = unlinkedArray.map(id => {
          const t = prevTasks.find(item => item.id === id);
          return {
            docId: id,
            collectionName: 'taka_tasks',
            action: 'update',
            isPatch: true,
            data: { parentTaskId: null, parentId: null, updatedAt: now },
            year: t?.projectYear ? String(t.projectYear) : undefined,
          };
        });
        if (deltaItems.length > 0) {
          recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
        }
        useAppStore.getState().setToast({
          title: "Success",
          message: `Unlinked ${unlinkedArray.length} modular task(s).`
        });
      } catch (err: any) {
        console.error(err);
        useAppStore.getState().setTasks(prevTasks);
        useAppStore.getState().setToast({
          title: "Error",
          message: "Failed to unlink tasks on server. Changes reverted."
        });
      }
      return;
    }

    try {
      if (action === 'delete') {
        const count = selectedTaskIds.size;
        const selectedObjs = tasks.filter(t => selectedTaskIds.has(t.id));
        setSelectedTaskIds(new Set());
        lastCheckedTaskIdRef.current = null;
        await deleteTaskStateUnified(selectedObjs.length > 0 ? selectedObjs : Array.from(selectedTaskIds));
        useAppStore.getState().setToast({ title: "Success", message: `Successfully deleted ${count} tasks.` });
        return;
      }

      const batch = writeBatch(db);
      let updateCount = 0;

      Array.from(selectedTaskIds).forEach(taskId => {
        const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
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
      });

      if (updateCount > 0) {
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

        try {
          await batch.commit();
        } catch (error: any) {
          console.error("Batch commit failed", error);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
          return;
        }

        useAppStore.getState().setToast({ title: "Success", message: `Successfully updated ${updateCount} tasks.` });
        setSelectedTaskIds(new Set());
        lastCheckedTaskIdRef.current = null;
      }
    } catch (e: any) {
      console.error(e);
      useAppStore.getState().setToast({ title: "Error", message: e.message });
    }
  };

  return {
    handleBulkAction,
  };
}
