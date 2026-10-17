import React, { Dispatch, SetStateAction } from 'react';
import { Project, Task, DelegationGroup, AppUser, TaskNote } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { extractStorageUrls, deleteStorageFiles } from '../../lib/storageUtils';
import { 
  buildTaskNoMap, 
  splitPredecessors, 
  parsePredecessors, 
  computeTaskCode, 
  updatePredecessorsStrings, 
  calculateTaskDatesFromPredecessors, 
  scheduleDependentTasks 
} from '../../lib/ganttUtils';
import { parseDateTime, formatToDatetimeLocal, generateId } from '../../lib/utils';
import { cleanDurationString, rollupParentTaskDates } from '../../lib/taskImportService';
import { normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { ensureProjectTasksLoaded, saveTaskStateUnified, deleteTaskStateUnified } from '../../lib/taskStateService';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { createPatchDeltaItem } from '../../lib/deltaPatchService';
import { TakaDeltaItem } from '../../types';

interface UseDetailTaskMutationsParams {
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>>;
}

export function useDetailTaskMutations({
  tasks,
  projects,
  delegationGroups,
  currentUser,
  setConfirmModal,
}: UseDetailTaskMutationsParams) {
  const handleDeleteTask = async (t: Task) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: 'Delete this Task?',
      onConfirm: async () => {
        try {
          // Xóa tức thì khỏi Zustand store & đồng bộ nguyên tử Batch Firestore + Delta Sync
          // Hàm này đã bao gồm: Xóa task, Cập nhật Project Summary, Xóa Dexie, Ghi Delta Batch.
          await deleteTaskStateUnified([t]);
          
          undoManager.push({
            description: `Delete Task: ${t.name}`,
            revert: async () => {
              const { doc } = await import('firebase/firestore');
              const { writeBatch } = await import('../../lib/firestoreWrites');
              const { db, APP_ID } = await import('../../lib/firebase');
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              
              // Restore related delegations if any
              const storeDelegations = useAppStore.getState().delegationGroups || [];
              const relatedDelGroups = storeDelegations.filter(d => d.parentTaskId === t.id || d.id === `del_${t.id}`);
              relatedDelGroups.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d);
              });

              revertBatch.commit().catch(console.error);
            }
          });
        } catch (e) {
          console.error(e);
        }
      }
    });
  };

  const handleUpdateTask = async (
    t: Task, 
    updates: Partial<Task>, 
    _options?: { skipPredecessorRecalc?: boolean; skipProjectRollup?: boolean }
  ) => {
    try {
      if (updates.name && updates.name !== t.name) {
        const currentProject = projects.find(p => 
          p.code === t.projectCode &&
          (String(p.year || '') === String(t.projectYear || '') || (!p.year && !t.projectYear)) &&
          (String(p.store || '') === String(t.projectStore || '') || (!p.store && !t.projectStore))
        );
        if (currentProject) {
          const normUpdateName = normalizeTaskNameForComparison(updates.name, currentProject.code);
          const isDuplicate = tasks.some(tsk => {
            if (tsk.id === t.id || tsk.isDeleted) return false;
            const sameProject = tsk.projectCode === currentProject.code &&
                   (String(tsk.projectYear || '') === String(currentProject.year || '') || (!tsk.projectYear && !currentProject.year)) &&
                   (String(tsk.projectStore || '') === String(currentProject.store || '') || (!tsk.projectStore && !currentProject.store));
            if (!sameProject) return false;

            if (tsk.name.trim().toLowerCase() === (updates.name || '').trim().toLowerCase()) return true;
            const tNorm = normalizeTaskNameForComparison(tsk.name, tsk.projectCode);
            return !!(normUpdateName && tNorm && normUpdateName === tNorm);
          });
          if (isDuplicate) {
            useAppStore.getState().setToast({ title: "Notice", message: `Task name "${updates.name}" already exists in project ${currentProject.code} (${currentProject.year} - ${currentProject.store}). Please enter a different name.` });
            return;
          }
        }
      }

      if (updates.predecessor !== undefined && updates.predecessor !== t.predecessor) {
        let val = updates.predecessor;
        const taskNoMap = buildTaskNoMap(projects, tasks);
        let parts = splitPredecessors(val, taskNoMap);
        if (parts.length > 2) parts = parts.slice(0, 2);
        
        if (parts.length >= 2) {
          updates.durationManual = false;
          if (!/FF|SF/i.test(parts[1])) {
            if (!/SS|FS/i.test(parts[1])) parts[1] += "FF";
            else parts[1] = parts[1].replace(/SS|FS/ig, "FF");
          }
          updates.predecessor = parts.join(', ');
        }
        parsePredecessors(updates.predecessor, taskNoMap, t);
      }

      let predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[] = [];
      if (updates.taskCodePhu !== undefined && updates.taskCodePhu !== t.taskCodePhu) {
        const oldCode = (t.taskCodePhu || computeTaskCode(projects, tasks, t)).trim();
        const newCode = (updates.taskCodePhu || computeTaskCode(projects, tasks.map(item => item.id === t.id ? { ...item, ...updates } : item), { ...t, ...updates })).trim();
        if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
          const map = new Map<string, string>();
          map.set(oldCode.toLowerCase(), newCode);
          predecessorUpdates = updatePredecessorsStrings(map, tasks, projects);
        }
      }

      let targetTaskId = t.id;
      if (targetTaskId && targetTaskId.startsWith('ts_')) {
        // Cùng mã dự án chưa đủ: phải cùng store và year (mã phụ ảo `<mã>#<số>` trùng giữa các store/năm)
        const sameProjectIdentity = (x: any) =>
          String(x.projectStore || '').trim().toLowerCase() === String(t.projectStore || '').trim().toLowerCase() &&
          String(x.projectYear ?? '').trim() === String(t.projectYear ?? '').trim();
        let realTask = tasks.find(tsk => 
          !tsk.id.startsWith('ts_') &&
          tsk.projectCode === t.projectCode &&
          sameProjectIdentity(tsk) &&
          ((t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
           (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase()))
        );
        if (!realTask && t.projectCode) {
          try {
            const { getLocalTasksForProjects, bulkPersistTasks } = await import('../../lib/localDb');
            let loaded: Task[] = (await getLocalTasksForProjects([t.projectCode])).filter(dt => !dt.isDeleted);
            if (!loaded.some(sameProjectIdentity)) {
              const { collection, query, where, getDocs } = await import('firebase/firestore');
              const q = query(
                collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks'),
                where('projectCode', '==', t.projectCode)
              );
              const snap = await getDocs(q);
              loaded = [];
              snap.forEach(d => {
                const dt = { id: d.id, ...d.data() } as Task;
                if (!dt.isDeleted) loaded.push(dt);
              });
              if (loaded.length > 0) bulkPersistTasks(loaded).catch(() => {});
            }
            // Chỉ nhận task đúng store + year của dự án đang sửa, và không thêm trùng id vào store
            const loadedSame = loaded.filter(sameProjectIdentity);
            if (loadedSame.length > 0) {
              const latestTasks = useAppStore.getState().tasks || tasks;
              const existingIds = new Set(latestTasks.map(tsk => tsk.id));
              useAppStore.getState().setTasks([
                ...latestTasks.filter(tsk => !tsk.id.startsWith('ts_')),
                ...loadedSame.filter(x => !existingIds.has(x.id)),
              ]);
              realTask = loadedSame.find(tsk =>
                (t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
                (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase())
              );
            }
          } catch (err) {
            console.warn("Failed to fetch real task for ts_ in Firestore:", err);
          }
        }
        if (realTask) {
          targetTaskId = realTask.id;
        } else {
          targetTaskId = `t_${Date.now()}_${generateId().substring(0, 8)}`;
        }
      }
      const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', targetTaskId);
      
      let newT = { ...t, id: targetTaskId, ...updates, updatedAt: new Date().toISOString() };
      if (updates.predecessor !== undefined) {
        let currentTasks = useAppStore.getState().tasks || tasks;
        let taskNoMap = buildTaskNoMap(projects, currentTasks);
        let parts = splitPredecessors(updates.predecessor, taskNoMap);
        if (parts.length >= 2) {
          newT.durationManual = false;
        }
        newT.realtimeUpdate = Boolean(updates.predecessor.trim());
        let parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);
        
        if (updates.predecessor.trim() && (!parsed.length || parsed.some(p => !p.task))) {
          for (const token of parts) {
            const cleanToken = token.replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
            const matchedProj = projects.find(p => p.code && cleanToken.toLowerCase().startsWith(p.code.toLowerCase()));
            if (matchedProj && matchedProj.code !== t.projectCode) {
              const loaded = await ensureProjectTasksLoaded(matchedProj.code);
              if (loaded.length > 0) {
                currentTasks = useAppStore.getState().tasks || currentTasks;
                taskNoMap = buildTaskNoMap(projects, currentTasks);
                parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);
              }
            }
          }
        }
        const calcResult = calculateTaskDatesFromPredecessors(newT, parsed);
        if (calcResult) {
          newT.start = calcResult.start;
          newT.finish = calcResult.finish;
          newT.duration = calcResult.duration;
          newT.durationManual = calcResult.durationManual;
        }
      } else if (newT.predecessor) {
        newT.realtimeUpdate = Boolean(newT.predecessor.trim());
      }
      
      if (updates.finish !== undefined) {
        if (newT.start && newT.finish) {
          const s = parseDateTime(newT.start);
          const f = parseDateTime(newT.finish);
          if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
            const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
            newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
          }
        }
      } else if (updates.start !== undefined) {
        if (newT.durationManual) {
          if (newT.start && newT.duration !== undefined && newT.duration !== '') {
            const s = parseDateTime(newT.start);
            if (s && !isNaN(s.getTime())) {
              const days = parseFloat(String(newT.duration));
              if (!isNaN(days) && days >= 0) {
                const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
                newT.finish = formatToDatetimeLocal(f);
              }
            }
          }
        } else {
          if (newT.start && newT.finish) {
            const s = parseDateTime(newT.start);
            const f = parseDateTime(newT.finish);
            if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
            }
          }
        }
      } else if (updates.duration !== undefined) {
        newT.duration = cleanDurationString(updates.duration);
        newT.durationManual = true;
        if (newT.start && newT.duration !== '') {
          const s = parseDateTime(newT.start);
          if (s && !isNaN(s.getTime())) {
            const days = parseFloat(newT.duration);
            if (!isNaN(days) && days >= 0) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              newT.finish = formatToDatetimeLocal(f);
            }
          }
        }
      } else if (updates.predecessor === undefined) {
        if (newT.durationManual) {
          if (newT.start && newT.duration !== undefined && newT.duration !== '') {
            const s = parseDateTime(newT.start);
            if (s && !isNaN(s.getTime())) {
              const days = parseFloat(String(newT.duration));
              if (!isNaN(days) && days >= 0) {
                const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
                newT.finish = formatToDatetimeLocal(f);
              }
            }
          }
        } else {
          if (newT.start && newT.finish) {
            const s = parseDateTime(newT.start);
            const f = parseDateTime(newT.finish);
            if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
            }
          }
        }
      }

      const updatesToDependents = scheduleDependentTasks(newT, tasks, projects);
      const batch = writeBatch(db);

      const scheduledUpdatedTask = updatesToDependents.find(d => d.id === newT.id);
      if (scheduledUpdatedTask) {
        newT = scheduledUpdatedTask as any;
      }

      const allCurrentTasksWithScheduled = tasks.map(tsk => {
        if (tsk.id === newT.id) return newT;
        const dep = updatesToDependents.find(d => d.id === tsk.id);
        return dep || tsk;
      });
      if (!allCurrentTasksWithScheduled.some(tsk => tsk.id === newT.id)) {
        allCurrentTasksWithScheduled.push(newT);
      }
      const { updatedParents } = rollupParentTaskDates(allCurrentTasksWithScheduled);

      batch.set(tRef, newT, { merge: true });

      // Rule 9 Mandate: Parent task rollups are computed 100% in-memory on client.
      // We keep updatedParents in memory via saveTaskStateUnified below, but do NOT issue Firestore writeBatch for parent tasks.

      if (updates.delegation === true) {
         const deterministicGroupId = `del_${t.id}`;
         const existingGroup = delegationGroups.find(g => g.parentTaskId === t.id || g.id === deterministicGroupId);
         if (!existingGroup) {
            const dateStr = new Date().toISOString().substring(0, 10);
            const rawParty = (t.party && t.party.trim()) ? t.party.trim() : (currentUser.username || '');
            const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
            const newGroup: DelegationGroup = {
              id: deterministicGroupId,
              parentTaskId: t.id,
              name: t.name || 'Delegated Task',
              projectCode: t.projectCode,
              projectStore: t.projectStore,
              projectYear: (t.projectYear !== undefined && t.projectYear !== null && !isNaN(Number(t.projectYear))) ? Number(t.projectYear) : (Number(projects.find(p => p.code === t.projectCode)?.year) || new Date().getFullYear()),
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
                 updatedAt: new Date().toISOString() 
              }],
              updatedAt: new Date().toISOString(),
              createdBy: currentUser.id
            };
            const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
            batch.set(delRef, newGroup, { merge: true });
         }
      }

      const depUpdates = updatesToDependents.filter(d => d.id !== newT.id);
      depUpdates.forEach(depTask => {
        const depRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id);
        batch.set(depRef, { ...depTask, updatedAt: new Date().toISOString() }, { merge: true });
      });

      predecessorUpdates.forEach(pu => {
        if (pu.id !== t.id && !updatesToDependents.some(d => d.id === pu.id)) {
          const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
          batch.update(pRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        }
      });
      
      const allUpdatesToSave = [
        newT,
        ...depUpdates,
        ...updatedParents.filter(pt => pt.id !== newT.id && !depUpdates.some(d => d.id === pt.id)),
        ...predecessorUpdates.filter(pu => pu.id !== t.id && !depUpdates.some(d => d.id === pu.id))
      ];
      const deltaItems: TakaDeltaItem[] = allUpdatesToSave.map((item) => {
        const prev = tasks.find((tsk) => tsk.id === item.id);
        return createPatchDeltaItem({
          docId: item.id,
          collectionName: 'taka_tasks',
          previous: prev,
          updated: item,
          action: 'update',
          year: (item as any).projectYear ? String((item as any).projectYear) : (t.projectYear ? String(t.projectYear) : undefined),
        });
      });

      saveTaskStateUnified(allUpdatesToSave);

      try {
        const { markExplicitDelta } = await import('../../lib/autoDeltaQueue');
        markExplicitDelta(deltaItems);
        await batch.commit();
        recordBatchDeltas(deltaItems, currentUser.username || currentUser.id).catch(() => {});
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        saveTaskStateUnified([t, ...depUpdates.map(d => tasks.find(tsk => tsk.id === d.id) || d)]);
        return;
      }
      
      undoManager.push({
        description: `Update Task Schedule: ${t.name}`,
        revert: async () => {
          const revertBatch = writeBatch(db);
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
          updatesToDependents.forEach(depTask => {
            const originalDep = tasks.find(tsk => tsk.id === depTask.id);
            if (originalDep) {
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), originalDep);
            }
          });
          revertBatch.commit().catch(console.error);
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotes = async (taskId: string, notes: TaskNote[]) => {
    const t = tasks.find(item => item.id === taskId);
    if (t) {
      await handleUpdateTask(t, { notes });
    }
  };

  return {
    handleDeleteTask,
    handleUpdateTask,
    handleSaveNotes,
  };
}
