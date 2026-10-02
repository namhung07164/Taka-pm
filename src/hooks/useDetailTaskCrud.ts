import React, { useState, useCallback } from 'react';
import { Project, Task, TaskNote, AppUser, DelegationGroup } from '../types';
import { useAppStore } from '../store/useAppStore';
import { db, APP_ID, writeBatch, setDoc, deleteDoc } from '../lib/firebase';
import { doc } from 'firebase/firestore';
import { extractStorageUrls, deleteStorageFiles } from '../lib/storageUtils';
import { undoManager } from '../lib/undoManager';
import { deleteTaskStateUnified, saveTaskStateUnified, ensureProjectTasksLoaded } from '../lib/taskStateService';
import { 
  buildTaskNoMap, 
  splitPredecessors, 
  parsePredecessors, 
  calculateTaskDatesFromPredecessors, 
  computeTaskCode, 
  updatePredecessorsStrings, 
  scheduleDependentTasks, 
  getProjectCodeChangePredecessorUpdates 
} from '../lib/ganttUtils';
import { generateId } from '../lib/utils';

interface UseDetailTaskCrudParams {
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
}

export function useDetailTaskCrud({
  tasks,
  projects,
  delegationGroups,
  currentUser,
}: UseDetailTaskCrudParams) {
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [noteModalTask, setNoteModalTask] = useState<Task | null>(null);

  const handleDeleteProject = useCallback(async (p: Project) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: `Delete project ${p.code} and all Sub-tasks?`,
      onConfirm: async () => {
        try {
          const docId = p.id || p.id!;
          const relatedTasks = tasks.filter(t => 
            t.projectCode === p.code && 
            (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
            (t.projectStore == p.store || (!t.projectStore && !p.store))
          );
          
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), { id: docId, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          const urlsToDelete: string[] = [];
          urlsToDelete.push(...extractStorageUrls(p));
          
          relatedTasks.forEach(t => {
            urlsToDelete.push(...extractStorageUrls(t));
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });

          const storeCosts = useAppStore.getState().costs || [];
          const relatedCosts = storeCosts.filter(c => 
            c.projectCode === p.code &&
            String(c.projectYear || '') === String(p.year || '') &&
            String(c.projectStore || '') === String(p.store || '')
          );
          relatedCosts.forEach(c => {
            urlsToDelete.push(...extractStorageUrls(c));
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });

          const storeDelegations = useAppStore.getState().delegationGroups || [];
          const relatedDelGroups = storeDelegations.filter(d => 
            relatedTasks.some(t => t.id === d.parentTaskId) || d.projectCode === p.code
          );
          relatedDelGroups.forEach(d => {
            batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id));
          });

          const costsToDelete = relatedCosts.map(c => ({ id: c.id, data: c }));
          const delegationsToDelete = relatedDelGroups.map(d => ({ id: d.id, data: d }));

          if (urlsToDelete.length > 0) {
            deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          try {
            await batch.commit();
          } catch (error: any) {
            console.error("Batch commit failed", error);
            useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
            return;
          }
          
          undoManager.push({
            description: `Delete Project: ${p.code}`,
            revert: async () => {
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), p);
              relatedTasks.forEach(t => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              });
              costsToDelete.forEach(c => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c.data);
              });
              delegationsToDelete.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d.data);
              });
              revertBatch.commit().catch(console.error);
            }
          });
        } catch (e) { console.error(e); }
      }
    });
  }, [tasks]);

  const handleDeleteTask = useCallback(async (t: Task) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: 'Delete this Task?',
      onConfirm: async () => {
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          const urlsToDelete = extractStorageUrls(t);
          if (urlsToDelete.length > 0) {
             deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          
          const storeDelegations = useAppStore.getState().delegationGroups || [];
          const relatedDelGroups = storeDelegations.filter(d => d.parentTaskId === t.id || d.id === `del_${t.id}`);
          const delegationsToDelete = relatedDelGroups.map(d => ({ id: d.id, data: d }));
          relatedDelGroups.forEach(d => {
            batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id));
          });
          try {
            await batch.commit();
          } catch (error: any) {
            console.error("Batch commit failed", error);
            useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
            return;
          }
          deleteTaskStateUnified([t.id]);
          
          undoManager.push({
            description: `Delete Task: ${t.name}`,
            revert: async () => {
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              delegationsToDelete.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d.data);
              });
              revertBatch.commit().catch(console.error);
            }
          });
        } catch (e) { console.error(e); }
      }
    });
  }, []);

  const handleUpdateProject = useCallback(async (p: Project, field: keyof Project, value: any) => {
    try {
      if ((field === 'code' || field === 'year' || field === 'store') && value !== p[field]) {
        const newCode = field === 'code' ? value : p.code;
        const newYear = field === 'year' ? value : p.year;
        const newStore = field === 'store' ? value : p.store;

        const isDuplicate = projects.some(proj => 
          proj.no !== p.no &&
          String(proj.code).trim().toLowerCase() === String(newCode).trim().toLowerCase() &&
          (String(proj.year || '') === String(newYear || '') || (!proj.year && !newYear)) &&
          (String(proj.store || '').toLowerCase() === String(newStore || '').toLowerCase() || (!proj.store && !newStore))
        );
        if (isDuplicate) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String(`Mã dự án "${newCode}" đã tồn tại trong năm ${newYear} - chi nhánh ${newStore}. Vui lòng nhập mã khác.`) });
          return;
        }
      }

      const docId = p.id || String(p.no);
      const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
      const updatedProject = { ...p, [field]: value, updatedAt: new Date().toISOString() };
      
      const batch = writeBatch(db);
      batch.update(pRef, { [field]: value, updatedAt: updatedProject.updatedAt });

      if (field === 'code' && value !== p.code) {
        const relatedTasks = tasks.filter(t => 
          t.projectCode === p.code && 
          (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
          (t.projectStore == p.store || (!t.projectStore && !p.store))
        );
        relatedTasks.forEach(t => {
          const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          batch.update(tRef, { projectCode: value, updatedAt: updatedProject.updatedAt });
        });

        const predResult = getProjectCodeChangePredecessorUpdates(p, value, p.year, p.store, tasks, projects);
        predResult.predecessorUpdates.forEach(pu => {
          if (!relatedTasks.some(rt => rt.id === pu.id)) {
            const extRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
            batch.update(extRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt });
          }
        });

        const storeCosts = useAppStore.getState().costs || [];
        const relatedCosts = storeCosts.filter(c => 
          c.projectCode === p.code &&
          String(c.projectYear || '') === String(p.year || '') &&
          String(c.projectStore || '') === String(p.store || '')
        );
        relatedCosts.forEach(c => {
          const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
          batch.update(cRef, { projectCode: value, updatedAt: updatedProject.updatedAt });
        });

        const storeDelegations = useAppStore.getState().delegationGroups || [];
        const relatedDelGroups = storeDelegations.filter(d => 
          relatedTasks.some(t => t.id === d.parentTaskId) || d.projectCode === p.code
        );
        relatedDelGroups.forEach(d => {
          const dRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id);
          batch.update(dRef, { projectCode: value, updatedAt: updatedProject.updatedAt });
        });
      }

      if (field === 'store' && value !== p.store) {
        const relatedTasks = tasks.filter(t => 
          t.projectCode === p.code && 
          (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
          (t.projectStore == p.store || (!t.projectStore && !p.store))
        );
        relatedTasks.forEach(t => {
          const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          batch.update(tRef, { projectStore: value, updatedAt: updatedProject.updatedAt });
        });
      }

      if (field === 'delegation') {
        const relatedTasks = tasks.filter(t => 
          t.projectCode === p.code && 
          (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
          (t.projectStore == p.store || (!t.projectStore && !p.store))
        );
        relatedTasks.forEach(t => {
          const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          batch.update(tRef, { delegation: value, updatedAt: updatedProject.updatedAt });
        });

        if (value === true) {
           const deterministicGroupId = `group-${p.id}`;
           const existingGroup = delegationGroups.find(g => g.id === deterministicGroupId);
           if (!existingGroup) {
              const dateStr = p.start ? String(p.start).substring(0, 10) : new Date().toISOString().substring(0, 10);
              const newGroup: any = {
                id: deterministicGroupId,
                name: `${p.code} - Project Delegation`,
                projectCode: p.code,
                projectStore: p.store,
                projectYear: (p.year !== undefined && p.year !== null && !isNaN(Number(p.year))) ? Number(p.year) : new Date().getFullYear(),
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
    } catch (e) {
      console.error(e);
    }
  }, [projects, tasks, delegationGroups, currentUser]);

  const handleUpdateTask = useCallback(async (t: Task, updates: Partial<Task>) => {
    try {
      if (updates.name && updates.name !== t.name) {
        const currentProject = projects.find(p => 
          p.code === t.projectCode &&
          (String(p.year || '') === String(t.projectYear || '') || (!p.year && !t.projectYear)) &&
          (String(p.store || '') === String(t.projectStore || '') || (!p.store && !t.projectStore))
        );
        if (currentProject) {
          const isDuplicate = tasks.some(tsk => {
            if (tsk.id === t.id) return false;
            if (tsk.name.trim().toLowerCase() !== (updates.name || '').trim().toLowerCase()) return false;
            return tsk.projectCode === currentProject.code && 
                   (String(tsk.projectYear || '') === String(currentProject.year || '') || (!tsk.projectYear && !currentProject.year)) &&
                   (String(tsk.projectStore || '') === String(currentProject.store || '') || (!tsk.projectStore && !currentProject.store));
          });
          if (isDuplicate) {
            useAppStore.getState().setToast({ title: "Thông báo", message: `Tên nhiệm vụ "${updates.name}" đã tồn tại trong dự án ${currentProject.code}. Vui lòng nhập tên khác.` });
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

      const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      let newT = { ...t, ...updates, updatedAt: new Date().toISOString() };

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
        const taskNoMap = buildTaskNoMap(projects, tasks);
        const parsed = parsePredecessors(newT.predecessor, taskNoMap, newT);
        const calcResult = calculateTaskDatesFromPredecessors(newT, parsed);
        if (calcResult) {
          newT.start = calcResult.start;
          newT.finish = calcResult.finish;
          newT.duration = calcResult.duration;
          newT.durationManual = calcResult.durationManual;
        }
      }

      if (updates.start !== undefined || updates.finish !== undefined || updates.duration !== undefined) {
        if (updates.duration !== undefined && updates.duration !== t.duration) {
          newT.durationManual = true;
          if (newT.start && newT.duration) {
            const s = new Date(newT.start);
            const days = parseFloat(newT.duration);
            if (!isNaN(s.getTime()) && !isNaN(days)) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              newT.finish = f.toISOString().substring(0, 16);
            }
          }
        }
        if (updates.finish !== undefined && updates.finish !== t.finish) {
          newT.finishManual = true;
          if (newT.start && newT.finish) {
            const s = new Date(newT.start);
            const f = new Date(newT.finish);
            if (!isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = Math.max(0, (f.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
              newT.duration = String(diffDays);
            }
          }
        }
        if (updates.start !== undefined && updates.start !== t.start) {
          newT.startManual = true;
          if (newT.start && newT.duration) {
            const s = new Date(newT.start);
            const days = parseFloat(newT.duration);
            if (!isNaN(s.getTime()) && !isNaN(days)) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              newT.finish = f.toISOString().substring(0, 16);
            }
          }
        }
      }

      const batch = writeBatch(db);
      batch.update(tRef, newT);

      // Auto Provision Delegation Group if delegation turned true
      if (updates.delegation === true) {
         const deterministicGroupId = `group-${t.id}`;
         const existingGroup = delegationGroups.find(g => g.parentTaskId === t.id || g.id === deterministicGroupId);
         if (!existingGroup) {
            const now = new Date().toISOString();
            const dateStr = newT.start ? newT.start.substring(0, 10) : now.substring(0, 10);
            const parsedParty = (newT.party && newT.party.trim()) ? newT.party.trim() : (currentUser.username || 'system');
            const newGroup: any = {
              id: deterministicGroupId,
              name: `${newT.projectCode || ''} - ${newT.name || ''}`,
              parentTaskId: t.id,
              projectCode: newT.projectCode,
              projectStore: newT.projectStore,
              projectYear: (newT.projectYear !== undefined && newT.projectYear !== null && !isNaN(Number(newT.projectYear))) ? Number(newT.projectYear) : (Number(projects.find(p => p.code === newT.projectCode)?.year) || new Date().getFullYear()),
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
              createdBy: currentUser.id || 'system'
            };
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId), newGroup, { merge: true });
         }
      }

      let depUpdates: Task[] = [];
      const isDateChanged = newT.start !== t.start || newT.finish !== t.finish;
      if (isDateChanged) {
        const otherTasks = tasks.map(tk => tk.id === newT.id ? newT : tk);
        depUpdates = scheduleDependentTasks(newT, otherTasks, projects);
      }

      depUpdates.forEach(depTask => {
        const dRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id);
        batch.set(dRef, {
          start: depTask.start,
          finish: depTask.finish,
          duration: depTask.duration,
          updatedAt: depTask.updatedAt
        }, { merge: true });
      });

      predecessorUpdates.forEach(pu => {
        if (pu.id !== t.id && !depUpdates.some(d => d.id === pu.id)) {
          const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
          batch.set(pRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt }, { merge: true });
        }
      });
      
      const allUpdatesToSave = [
        newT,
        ...depUpdates,
        ...predecessorUpdates.filter(pu => pu.id !== t.id && !depUpdates.some(d => d.id === pu.id))
      ];
      saveTaskStateUnified(allUpdatesToSave);

      try {
        await batch.commit();
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        saveTaskStateUnified([t, ...depUpdates.map(d => tasks.find(tsk => tsk.id === d.id) || d)]);
        return;
      }
      
      undoManager.push({
        description: `Update Task: ${t.name}`,
        revert: async () => {
          const revertBatch = writeBatch(db);
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
          depUpdates.forEach(depTask => {
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
  }, [projects, tasks, delegationGroups, currentUser]);

  const handleSaveNotes = useCallback(async (taskId: string, notes: TaskNote[]) => {
    const t = tasks.find(t => t.id === taskId);
    if (t) {
      await handleUpdateTask(t, { notes });
    }
  }, [tasks, handleUpdateTask]);

  return {
    confirmModal,
    setConfirmModal,
    noteModalTask,
    setNoteModalTask,
    handleDeleteProject,
    handleDeleteTask,
    handleUpdateProject,
    handleUpdateTask,
    handleSaveNotes,
  };
}
