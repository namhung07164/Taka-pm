import React, { Dispatch, SetStateAction } from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { extractStorageUrls, deleteStorageFiles } from '../../lib/storageUtils';
import { getProjectCodeChangePredecessorUpdates } from '../../lib/ganttUtils';
import { generateId } from '../../lib/utils';
import { deleteTaskStateUnified } from '../../lib/taskStateService';

interface UseDetailProjectMutationsParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>>;
}

export function useDetailProjectMutations({
  projects,
  tasks,
  delegationGroups,
  currentUser,
  setConfirmModal,
}: UseDetailProjectMutationsParams) {
  const handleDeleteProject = async (p: Project) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: `Delete project ${p.code} and all associated tasks and data?`,
      onConfirm: async () => {
        try {
          const { deleteProjectStateUnified } = await import('../../lib/taskStateService');
          await deleteProjectStateUnified(p.id || String(p.no) || p.code, p);
          useAppStore.getState().setToast({
            title: "Success",
            message: `Deleted project ${p.code} successfully.`,
            type: "success"
          });
        } catch (e: any) {
          console.error("Delete project error:", e);
          useAppStore.getState().setToast({
            title: "Error",
            message: e?.message || "Failed to delete project.",
            type: "error"
          });
        }
      }
    });
  };

  const handleUpdateProject = async (p: Project, field: keyof Project, value: any) => {
    try {
      if ((field === 'code' || field === 'year' || field === 'store') && value !== p[field]) {
        const newCode = field === 'code' ? value : p.code;
        const newYear = field === 'year' ? value : p.year;
        const newStore = field === 'store' ? value : p.store;
        const isDuplicate = projects.some(proj => 
          proj.no !== p.no &&
          String(proj.code).trim().toLowerCase() === String(newCode).trim().toLowerCase() &&
          String(proj.year) === String(newYear) &&
          String(proj.store) === String(newStore)
        );
        if (isDuplicate) {
          useAppStore.getState().setToast({ title: "Notice", message: `Project code "${newCode}" already exists in year ${newYear} - Store ${newStore}. Please enter a different code.` });
          return;
        }
      }

      if ((field === 'code' || field === 'year' || field === 'store') && value !== p[field]) {
        const batch = writeBatch(db);
        const docId = p.id || p.id!;
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
        const dataToSave = { ...p, [field]: value, updatedAt: new Date().toISOString() };
        
        // Preserve computed fields and summaries on p
        if (p.computedTakStart && !dataToSave.computedTakStart) dataToSave.computedTakStart = p.computedTakStart;
        if (p.computedTakCompl && !dataToSave.computedTakCompl) dataToSave.computedTakCompl = p.computedTakCompl;
        if (p.computedOpening && !dataToSave.computedOpening) dataToSave.computedOpening = p.computedOpening;
        if (p.taskCount !== undefined && dataToSave.taskCount === undefined) dataToSave.taskCount = p.taskCount;
        if (p.taskSummaries && !dataToSave.taskSummaries) dataToSave.taskSummaries = p.taskSummaries;
        delete (dataToSave as any).id;
        
        // Sanitize dataToSave
        Object.keys(dataToSave).forEach(key => {
          if ((dataToSave as any)[key] === undefined) delete (dataToSave as any)[key];
        });
        batch.set(pRef, dataToSave, { merge: true });

        const projectCodeUpdate = field === 'code' ? value : p.code;
        const projectYearUpdate = field === 'year' ? value : p.year;
        const projectStoreUpdate = field === 'store' ? value : p.store;

        // Compute cascaded code & predecessor updates across all tasks
        const { taskUpdates, predecessorUpdates } = getProjectCodeChangePredecessorUpdates(
          p,
          projectCodeUpdate,
          projectYearUpdate,
          projectStoreUpdate,
          tasks,
          projects
        );

        // Update all tasks with this project identity
        const relatedTasks = tasks.filter(t => 
          t.projectCode === p.code && 
          (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
          (t.projectStore == p.store || (!t.projectStore && !p.store))
        );
        const relatedTaskIds = new Set(relatedTasks.map(t => t.id));

        relatedTasks.forEach(t => {
          const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          const tUpdate = taskUpdates.get(t.id) || {
            projectCode: projectCodeUpdate,
            projectYear: projectYearUpdate,
            projectStore: projectStoreUpdate
          };
          const pu = predecessorUpdates.find(item => item.id === t.id);
          const payload: any = {
            ...tUpdate,
            updatedAt: new Date().toISOString()
          };
          if (pu) {
            payload.predecessor = pu.predecessor;
          }
          batch.update(tRef, payload);
        });

        // Update predecessor for tasks in other projects that reference this project
        predecessorUpdates.forEach(pu => {
          if (!relatedTaskIds.has(pu.id)) {
            const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
            batch.update(tRef, {
              predecessor: pu.predecessor,
              updatedAt: pu.updatedAt
            });
          }
        });
        
        // Update all costs with this project identity from memory store (Zero-read optimization)
        const storeCosts = useAppStore.getState().costs || [];
        const relatedCosts = storeCosts.filter(c => {
          const matchesCode = c.projectCode === p.code;
          const matchesYear = c.projectYear == p.year || (!c.projectYear && !p.year);
          const matchesStore = c.projectStore == p.store || (!c.projectStore && !p.store);
          return matchesCode && matchesYear && matchesStore;
        });
        relatedCosts.forEach(c => {
          const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
          batch.update(cRef, { 
            projectCode: projectCodeUpdate,
            projectYear: projectYearUpdate,
            projectStore: projectStoreUpdate
          });
        });

        // Optimistic update in Zustand store (0ms UI latency)
        const predMap = new Map(predecessorUpdates.map(pu => [pu.id, pu.predecessor]));
        const updatedTasks = tasks.map(t => {
          const tUpdate = taskUpdates.get(t.id);
          const newPred = predMap.get(t.id);
          if (tUpdate || newPred !== undefined) {
            return {
              ...t,
              ...(tUpdate || {}),
              ...(newPred !== undefined ? { predecessor: newPred, updatedAt: new Date().toISOString() } : {})
            };
          }
          return t;
        });
        useAppStore.getState().setTasks(updatedTasks);
        const updatedProjects = projects.map(proj => proj.id === p.id ? { ...proj, ...dataToSave, id: p.id, updatedAt: new Date().toISOString() } : proj);
        useAppStore.getState().setProjects(updatedProjects);

        batch.commit().catch(e => {
          console.error("Batch commit failed", e);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        });
        
        undoManager.push({
          description: `Update Project Identity: ${p.code}(${p.year || ''}) -> ${projectCodeUpdate}(${projectYearUpdate || ''})`,
          revert: async () => {
            const revertBatch = writeBatch(db);
            revertBatch.set(pRef, p);
            relatedTasks.forEach(t => {
              const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
              revertBatch.update(tRef, { 
                projectCode: p.code, 
                projectYear: p.year,
                projectStore: p.store,
                ...(t.taskCodePhu !== undefined ? { taskCodePhu: t.taskCodePhu } : {}),
                ...(t.predecessor !== undefined ? { predecessor: t.predecessor } : {})
              });
            });
            predecessorUpdates.forEach(pu => {
              if (!relatedTaskIds.has(pu.id)) {
                const originalTask = tasks.find(st => st.id === pu.id);
                revertBatch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), {
                  predecessor: originalTask?.predecessor || ''
                });
              }
            });
            relatedCosts.forEach(c => {
              const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
              revertBatch.update(cRef, { projectCode: p.code, projectYear: p.year, projectStore: p.store });
            });
            revertBatch.commit().catch(console.error);
          }
        });
      } else {
        const docId = p.id || p.id!;
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
        const dataToSave = { ...p, [field]: value, updatedAt: new Date().toISOString() };
        
        // Preserve computed fields and summaries on p
        if (p.computedTakStart && !dataToSave.computedTakStart) dataToSave.computedTakStart = p.computedTakStart;
        if (p.computedTakCompl && !dataToSave.computedTakCompl) dataToSave.computedTakCompl = p.computedTakCompl;
        if (p.computedOpening && !dataToSave.computedOpening) dataToSave.computedOpening = p.computedOpening;
        if (p.taskCount !== undefined && dataToSave.taskCount === undefined) dataToSave.taskCount = p.taskCount;
        if (p.taskSummaries && !dataToSave.taskSummaries) dataToSave.taskSummaries = p.taskSummaries;
        delete (dataToSave as any).id;
        
        // Sanitize dataToSave to remove any undefined fields
        Object.keys(dataToSave).forEach(key => {
          if ((dataToSave as any)[key] === undefined) {
            delete (dataToSave as any)[key];
          }
        });
        
        const batch = writeBatch(db);
        batch.set(pRef, dataToSave, { merge: true });

        if (field === 'delegation' && value === true) {
           const existingGroup = delegationGroups.find(g => g.parentTaskId === p.code && (!g.projectStore || g.projectStore === p.store) && (!g.projectYear || String(g.projectYear) === String(p.year)));
           const storeKey = p.store || 'HCM';
           const yearKey = (p.year !== undefined && p.year !== null && !isNaN(Number(p.year))) ? Number(p.year) : new Date().getFullYear();
           const deterministicGroupId = existingGroup?.id || `del_proj_${p.code}_${storeKey}_${yearKey}`;
           
           if (!existingGroup) {
              const dateStr = new Date().toISOString().substring(0, 10);
              const newGroup: DelegationGroup = {
                id: deterministicGroupId,
                parentTaskId: p.code,
                name: p.name || 'Delegated Project',
                projectCode: p.code,
                projectStore: p.store,
                projectYear: yearKey,
                subTasks: [{ 
                   id: generateId(), 
                   name: '', 
                   comments: '', 
                   status: 'Assigned', 
                   delegationStatus: 'Assigned', 
                   priority: 'Mid', 
                   party: currentUser.username || '', 
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
        
        try {
          await batch.commit();
        } catch (error: any) {
          console.error("Batch commit failed", error);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
          return;
        }
        
        undoManager.push({
          description: `Update Project: ${p.code}`,
          revert: async () => {
            setDoc(pRef, p);
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return {
    handleDeleteProject,
    handleUpdateProject,
  };
}
