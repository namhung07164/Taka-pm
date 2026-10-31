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
import { parseDateTime, formatToDatetimeLocal, generateId, isTaskBelongsToProject } from '../../lib/utils';
import { cleanDurationString, rollupParentTaskDates, prepareMissingDelegationsForTasks } from '../../lib/taskImportService';
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
          // 1. Xóa tức thì khỏi Zustand store & đồng bộ nguyên tử Batch Firestore + Delta Sync
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
      const liveState = useAppStore.getState();
      const activeTasks = liveState.tasks || tasks;
      const activeProjects = liveState.projects || projects;
      const currentProject = activeProjects.find(p => 
        (t.projectId && p.id === t.projectId) ||
        (p.code === t.projectCode &&
        (String(p.year || '') === String(t.projectYear || '') || (!p.year && !t.projectYear)) &&
        (String(p.store || '') === String(t.projectStore || '') || (!p.store && !t.projectStore)))
      );

      if (updates.name && updates.name !== t.name && currentProject) {
        const normUpdateName = normalizeTaskNameForComparison(updates.name);
        const isDuplicate = activeTasks.some(tsk => {
          if (tsk.id === t.id || tsk.isDeleted) return false;
          if (!isTaskBelongsToProject(tsk, currentProject, activeProjects)) return false;
          if (tsk.name && (tsk.name || '').trim().toLowerCase() === (updates.name || '').trim().toLowerCase()) return true;
          const tNorm = normalizeTaskNameForComparison(tsk.name);
          return !!(normUpdateName && tNorm && normUpdateName === tNorm);
        });
        if (isDuplicate) {
          useAppStore.getState().setToast({ title: "Notice", message: `Task name "${updates.name}" already exists in project ${currentProject.code} (${currentProject.year} - ${currentProject.store}). Please enter a different name.` });
          return;
        }
      }

      if (updates.predecessor !== undefined && updates.predecessor !== t.predecessor) {
        let val = updates.predecessor;
        const taskNoMap = buildTaskNoMap(activeProjects, activeTasks);
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
        const oldCode = (t.taskCodePhu || computeTaskCode(activeProjects, activeTasks, t)).trim();
        const newCode = (updates.taskCodePhu || computeTaskCode(activeProjects, activeTasks.map(item => item.id === t.id ? { ...item, ...updates } : item), { ...t, ...updates })).trim();
        if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
          const map = new Map<string, string>();
          map.set(oldCode.toLowerCase(), newCode);
          predecessorUpdates = updatePredecessorsStrings(map, activeTasks, activeProjects);
        }
      }

      let targetTaskId = t.id;
      if (targetTaskId && targetTaskId.startsWith('ts_')) {
        const sameProjectIdentity = (x: any) =>
          String(x.projectStore || '').trim().toLowerCase() === String(t.projectStore || '').trim().toLowerCase() &&
          String(x.projectYear ?? '').trim() === String(t.projectYear ?? '').trim();
        let realTask = activeTasks.find(tsk => 
          !tsk.id.startsWith('ts_') &&
          tsk.projectCode === t.projectCode &&
          sameProjectIdentity(tsk) &&
          ((t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
           (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase()))
        );
        if (!realTask && t.projectCode) {
          try {
            const loaded = await ensureProjectTasksLoaded(t.projectCode, {
              projectId: t.projectId,
              store: t.projectStore,
              year: t.projectYear,
            });
            const loadedSame = loaded.filter(sameProjectIdentity);
            if (loadedSame.length > 0) {
              realTask = loadedSame.find(tsk =>
                (t.taskCodePhu && tsk.taskCodePhu === t.taskCodePhu) ||
                (t.name && tsk.name && tsk.name.trim().toLowerCase() === t.name.trim().toLowerCase())
              );
            }
          } catch (err) {
            console.warn("Failed to resolve ts_ task from local/cache:", err);
          }
        }
        if (realTask) {
          targetTaskId = realTask.id;
        } else {
          targetTaskId = `t_${Date.now()}_${generateId().substring(0, 8)}`;
        }
      }
      const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', targetTaskId);
      
      let newT: Task = {
        ...t,
        id: targetTaskId,
        projectId: updates.projectId || t.projectId || currentProject?.id,
        projectCode: updates.projectCode || t.projectCode || currentProject?.code || '',
        projectStore: updates.projectStore || t.projectStore || currentProject?.store,
        projectYear: updates.projectYear ?? t.projectYear ?? currentProject?.year,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      delete (newT as any)._isVirtualSummary;

      if (updates.predecessor !== undefined) {
        let currentTasks = useAppStore.getState().tasks || activeTasks;
        let taskNoMap = buildTaskNoMap(activeProjects, currentTasks);
        let parts = splitPredecessors(updates.predecessor, taskNoMap);
        if (parts.length >= 2) {
          newT.durationManual = false;
        }
        newT.realtimeUpdate = Boolean(updates.predecessor.trim());
        let parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);
        
        if (updates.predecessor.trim() && (!parsed.length || parsed.some(p => !p.task))) {
          for (const token of parts) {
            const cleanToken = token.replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
            const matchedProj = activeProjects.find(
              p =>
                p.code &&
                cleanToken.toLowerCase().startsWith(p.code.toLowerCase()) &&
                (!t.projectStore || !p.store || p.store.trim().toLowerCase() === t.projectStore.trim().toLowerCase()) &&
                (!t.projectYear || !p.year || String(p.year).trim() === String(t.projectYear).trim())
            ) || activeProjects.find(p => p.code && cleanToken.toLowerCase().startsWith(p.code.toLowerCase()));
            if (matchedProj && (matchedProj.id !== t.projectId || matchedProj.code !== t.projectCode)) {
              const loaded = await ensureProjectTasksLoaded(matchedProj.code, {
                projectId: matchedProj.id,
                store: matchedProj.store,
                year: matchedProj.year,
              });
              if (loaded.length > 0) {
                currentTasks = useAppStore.getState().tasks || currentTasks;
                taskNoMap = buildTaskNoMap(activeProjects, currentTasks);
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

      const latestTasks = useAppStore.getState().tasks || activeTasks;
      const updatesToDependents = scheduleDependentTasks(newT, latestTasks, activeProjects);
      const batch = writeBatch(db);

      const scheduledUpdatedTask = updatesToDependents.find(d => d.id === newT.id);
      if (scheduledUpdatedTask) {
        newT = { ...(scheduledUpdatedTask as any) };
        delete (newT as any)._isVirtualSummary;
      }
      if (!newT.baselineStart && newT.start) newT.baselineStart = t.baselineStart || newT.start;
      if (!newT.baselineFinish && newT.finish) newT.baselineFinish = t.baselineFinish || newT.finish;

      const depUpdateMap = new Map<string, Task>();
      updatesToDependents.forEach(d => {
        const cleanDep = { ...d };
        delete (cleanDep as any)._isVirtualSummary;
        depUpdateMap.set(cleanDep.id, cleanDep);
      });

      const affectedProjIds = new Set<string>();
      const affectedProjCodes = new Set<string>();
      const registerScope = (item: Partial<Task>) => {
        if (item.projectId) affectedProjIds.add(String(item.projectId).trim());
        if (item.projectCode) affectedProjCodes.add(String(item.projectCode).trim().toLowerCase());
      };
      registerScope(newT);
      updatesToDependents.forEach(registerScope);

      const scopedTasksForRollup: Task[] = [];
      let foundNewT = false;
      for (let i = 0; i < latestTasks.length; i++) {
        const tsk = latestTasks[i];
        if (!tsk || tsk.isDeleted) continue;
        const matchesScope =
          (tsk.projectId && affectedProjIds.has(String(tsk.projectId).trim())) ||
          (tsk.projectCode && affectedProjCodes.has(String(tsk.projectCode).trim().toLowerCase()));
        if (!matchesScope) continue;
        if (tsk.id === newT.id) {
          scopedTasksForRollup.push(newT);
          foundNewT = true;
        } else {
          scopedTasksForRollup.push(depUpdateMap.get(tsk.id) || tsk);
        }
      }
      if (!foundNewT) {
        scopedTasksForRollup.push(newT);
      }
      const { updatedParents: rawUpdatedParents } = rollupParentTaskDates(scopedTasksForRollup);
      const updatedParents = rawUpdatedParents.map(pt => {
        const cleanPt = { ...pt };
        delete (cleanPt as any)._isVirtualSummary;
        return cleanPt;
      });

      batch.set(tRef, newT, { merge: true });

      const { newDelegations } = newT.delegation
        ? prepareMissingDelegationsForTasks([newT], currentUser)
        : { newDelegations: [] as DelegationGroup[] };
      newDelegations.forEach((delGroup) => {
        const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', delGroup.id);
        batch.set(delRef, delGroup, { merge: true });
      });

      const depUpdates = Array.from(depUpdateMap.values()).filter(d => d.id !== newT.id);
      depUpdates.forEach(depTask => {
        const depRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id);
        batch.set(depRef, { ...depTask, updatedAt: new Date().toISOString() }, { merge: true });
      });

      predecessorUpdates.forEach(pu => {
        if (pu.id !== t.id && !depUpdateMap.has(pu.id)) {
          const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
          batch.set(pRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt }, { merge: true });
        }
      });
      
      const allUpdatesToSave = [
        newT,
        ...depUpdates,
        ...updatedParents.filter(pt => pt.id !== newT.id && !depUpdateMap.has(pt.id)),
        ...predecessorUpdates.filter(pu => pu.id !== t.id && !depUpdateMap.has(pu.id))
      ];

      // 1. Update Zustand immediately in 0ms so UI responds instantaneously
      useAppStore.getState().optimisticUpdateTasks(allUpdatesToSave);

      // 2. Offload Firestore commit, Delta broadcast, and Project Date sync in parallel
      setTimeout(async () => {
        try {
          if (newDelegations.length > 0) {
            import('../../lib/localDb').then(({ bulkPersistDelegations }) => bulkPersistDelegations(newDelegations)).catch(() => {});
          }
          const prevTaskById = new Map<string, Task>();
          for (let i = 0; i < latestTasks.length; i++) {
            const item = latestTasks[i];
            if (item?.id) prevTaskById.set(item.id, item);
          }

          const deltaItems: TakaDeltaItem[] = allUpdatesToSave.map((item) => {
            const prev = prevTaskById.get(item.id);
            return createPatchDeltaItem({
              docId: item.id,
              collectionName: 'taka_tasks',
              previous: prev,
              updated: item,
              action: 'update',
              year: (item as any).projectYear ? String((item as any).projectYear) : (t.projectYear ? String(t.projectYear) : undefined),
            });
          });

          deltaItems.forEach(di => {
            if (di.action === 'update' && di.data) {
              if (!di.data.projectId && newT.projectId) di.data.projectId = newT.projectId;
              if (!di.data.projectCode && newT.projectCode) di.data.projectCode = newT.projectCode;
              if (!di.data.projectStore && newT.projectStore) di.data.projectStore = newT.projectStore;
              if (!di.data.projectYear && newT.projectYear) di.data.projectYear = newT.projectYear;
            }
          });

          newDelegations.forEach((delGroup) => {
            deltaItems.push({
              docId: delGroup.id,
              collectionName: 'taka_delegations',
              action: 'create',
              isPatch: false,
              data: delGroup,
              year: delGroup.projectYear ? String(delGroup.projectYear) : undefined,
              projectId: delGroup.projectId ? String(delGroup.projectId) : undefined,
              projectCode: delGroup.projectCode ? String(delGroup.projectCode) : undefined,
              projectStore: delGroup.projectStore ? String(delGroup.projectStore) : undefined,
            });
          });

          const { markExplicitDelta } = await import('../../lib/autoDeltaQueue');
          markExplicitDelta(deltaItems);
          await Promise.all([
            batch.commit(),
            saveTaskStateUnified(allUpdatesToSave, { syncProjects: true }),
          ]);
          recordBatchDeltas(deltaItems, currentUser.username || currentUser.id).catch(() => {});
        } catch (error: any) {
          console.error("Batch commit failed", error);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
          saveTaskStateUnified([t, ...depUpdates.map(d => latestTasks.find(tsk => tsk.id === d.id) || d)]);
        }
      }, 0);
      
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
