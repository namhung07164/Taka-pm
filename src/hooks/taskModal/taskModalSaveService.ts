import { doc, deleteField } from 'firebase/firestore';
import { db, APP_ID, writeBatch } from '../../lib/firebase';
import { addPendingUpdate } from '../../lib/syncQueue';
import { undoManager } from '../../lib/undoManager';
import {
  getPredecessorCodeUpdates,
  updatePredecessorsStrings,
  parsePredecessors,
  computeTaskCode,
  buildTaskNoMap,
  scheduleDependentTasks,
  splitPredecessors
} from '../../lib/ganttUtils';
import { resolvePredecessorString, PredecessorContext } from '../../lib/predecessorMatchUtils';
import { generateId, getDefaultDatetimeLocal, formatToDatetimeLocal, parseDateTime } from '../../lib/utils';
import { syncProjectDatesByCode } from '../../lib/projectDatesService';
import { saveTaskStateUnified } from '../../lib/taskStateService';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task, AppUser } from '../../types';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { createPatchDeltaItem } from '../../lib/deltaPatchService';

export interface TaskSaveParams {
  formData: Partial<Task>;
  task: Task | null;
  projects: Project[];
  tasks: Task[];
  cloudStatus: string;
  currentUser: AppUser;
  t: (key: string) => string;
  setToast: (toast: any) => void;
  onClose: () => void;
  setIsSubmitting: (submitting: boolean) => void;
}

export async function executeTaskSave({
  formData,
  task,
  projects,
  tasks,
  cloudStatus,
  currentUser,
  setToast,
  onClose,
  setIsSubmitting
}: TaskSaveParams): Promise<boolean> {
  const currentProject = projects.find(p => 
    p.code === formData.projectCode &&
    (String(p.year || '') === String(formData.projectYear || '') || (!p.year && !formData.projectYear)) &&
    (String(p.store || '') === String(formData.projectStore || '') || (!p.store && !formData.projectStore))
  );

  if (!currentProject) {
    useAppStore.getState().setToast({ title: "Notice", message: "Please select a valid project." });
    setIsSubmitting(false);
    return false;
  }

  const currentYear = (!isNaN(Number(currentProject?.year)) && currentProject?.year !== null && currentProject?.year !== '') 
    ? Number(currentProject.year) 
    : (formData.projectYear && !isNaN(Number(formData.projectYear)) ? Number(formData.projectYear) : new Date().getFullYear());

  const targetPrjKey = buildCanonicalProjectKey(
    currentProject.code || formData.projectCode,
    currentProject.year || formData.projectYear,
    currentProject.store || formData.projectStore,
    projects
  );

  // Check for duplicate task name or code in the same project
  const normFormName = normalizeTaskNameForComparison(formData.name, formData.projectCode || currentProject?.code);
  const formTaskCode = formData.taskCodePhu ? String(formData.taskCodePhu).trim().toLowerCase() : '';

  const isDuplicate = tasks.some(t => {
    if (t.id === task?.id || t.isDeleted) return false;
    
    const tPrjKey = buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects);
    const sameProject = (tPrjKey === targetPrjKey);
    if (!sameProject) return false;

    // Check exact name
    if (t.name && String(t.name).trim().toLowerCase() === String(formData.name || '').trim().toLowerCase()) {
      return true;
    }
    // Check normalized name
    const tNorm = normalizeTaskNameForComparison(t.name, t.projectCode);
    if (normFormName && tNorm && normFormName === tNorm) {
      return true;
    }
    // Check taskCodePhu
    if (formTaskCode && t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === formTaskCode) {
      return true;
    }
    return false;
  });

  if (isDuplicate) {
    setToast({ title: "Duplicate Task", message: `Task "${formData.name}" already exists in this project. Duplicate sub-tasks are not allowed.` });
    setIsSubmitting(false);
    return false;
  }

  let id = task ? task.id : `t_${Date.now()}_${generateId().substring(0, 8)}`;
  if (id && id.startsWith('ts_')) {
    let realTask = tasks.find(t => 
      !t.id.startsWith('ts_') &&
      t.projectCode === currentProject.code &&
      (String(t.projectStore || '') === String(currentProject.store || '')) &&
      (String(t.projectYear || '') === String(currentProject.year || '')) &&
      ((task?.taskCodePhu && t.taskCodePhu === task.taskCodePhu) ||
       (task?.name && t.name && t.name.trim().toLowerCase() === task.name.trim().toLowerCase()))
    );
    if (!realTask && currentProject?.code) {
      try {
        const { getLocalTasksForProjects, bulkPersistTasks } = await import('../../lib/localDb');
        const sameIdentity = (x: Task) =>
          String(x.projectStore || '').trim().toLowerCase() === String(currentProject.store || '').trim().toLowerCase() &&
          String(x.projectYear ?? '').trim() === String(currentProject.year ?? '').trim();
        let loaded: Task[] = (await getLocalTasksForProjects([currentProject.code])).filter(dt => !dt.isDeleted);
        if (!loaded.some(sameIdentity)) {
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const q = query(
            collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks'),
            where('projectCode', '==', currentProject.code)
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
        const loadedSame = loaded.filter(sameIdentity);
        if (loadedSame.length > 0) {
          const latestTasks = useAppStore.getState().tasks || tasks;
          const existingIds = new Set(latestTasks.map(tsk => tsk.id));
          useAppStore.getState().setTasks([
            ...latestTasks.filter(tsk => !tsk.id.startsWith('ts_')),
            ...loadedSame.filter(x => !existingIds.has(x.id)),
          ]);
          realTask = loadedSame.find(t =>
            (task?.taskCodePhu && t.taskCodePhu === task.taskCodePhu) ||
            (task?.name && t.name && t.name.trim().toLowerCase() === task.name.trim().toLowerCase())
          );
        }
      } catch (err) {
        console.warn("Failed to find real task for ts_ in Firestore:", err);
      }
    }
    if (realTask) {
      id = realTask.id;
    } else {
      id = `t_${Date.now()}_${generateId().substring(0, 8)}`;
    }
  }
  let newOrderIndex = task?.orderIndex;
  
  if (!task) {
    const existingProjectTasks = tasks.filter(t => 
      t.projectCode === currentProject.code && 
      (String(t.projectYear || '') === String(currentProject.year || '') || (!t.projectYear && !currentProject.year)) &&
      (String(t.projectStore || '') === String(currentProject.store || '') || (!t.projectStore && !currentProject.store))
    );
    let maxOrder = 0;
    existingProjectTasks.forEach(t => {
      const order = t.orderIndex !== undefined ? t.orderIndex : 0;
      if (order > maxOrder) maxOrder = order;
    });
    newOrderIndex = maxOrder + 1;
  }

  if (formData.predecessor !== undefined && (!task || formData.predecessor !== task.predecessor)) {
    if (formData.predecessor) {
      const predContext: PredecessorContext = {
        projectId: formData.projectId || task?.projectId || currentProject?.id,
        projectCode: formData.projectCode || task?.projectCode || currentProject?.code,
        projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
        projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
        projectLocation: formData.location || task?.location || currentProject?.location
      };
      formData.predecessor = resolvePredecessorString(formData.predecessor, tasks, projects, formData.projectCode, predContext, formData.predecessorTaskIds);
      const taskNoMap = buildTaskNoMap(projects, tasks);
      let parts = splitPredecessors(formData.predecessor, taskNoMap);
      if (parts.length >= 2) {
        if (!/FF|SF/i.test(parts[1])) {
          if (!/SS|FS/i.test(parts[1])) parts[1] += "FF";
          else parts[1] = parts[1].replace(/SS|FS/ig, "FF");
        }
        formData.predecessor = parts.join(", ");
      }
    }
    const taskNoMap = buildTaskNoMap(projects, tasks);
    const dummyTask: any = {
      projectId: formData.projectId || task?.projectId || currentProject?.id,
      projectCode: formData.projectCode || task?.projectCode || currentProject?.code,
      projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
      projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
      location: formData.location || task?.location || currentProject?.location
    };
    parsePredecessors(formData.predecessor, taskNoMap, dummyTask);
  }

  try {
    const todayDate = getDefaultDatetimeLocal();
    let finalFormData = { ...formData };
    if (!finalFormData.start) finalFormData.start = todayDate;
    if (!finalFormData.finish) finalFormData.finish = finalFormData.start || todayDate;
    if (!finalFormData.baselineStart) finalFormData.baselineStart = finalFormData.start || todayDate;
    if (!finalFormData.baselineFinish) finalFormData.baselineFinish = finalFormData.finish || todayDate;
    if (finalFormData.duration === undefined || finalFormData.duration === null || String(finalFormData.duration).trim() === '') {
      finalFormData.duration = "0";
    }
    let durationVal = parseFloat(String(finalFormData.duration || "0"));
    if (durationVal < 0) {
      finalFormData.duration = "0";
      finalFormData.finish = finalFormData.start;
    }
    if (finalFormData.durationManual ?? true) {
      finalFormData.durationManual = true;
      if (finalFormData.start && finalFormData.duration !== undefined && finalFormData.duration !== '') {
        const s = parseDateTime(finalFormData.start);
        const days = parseFloat(String(finalFormData.duration));
        if (s && !isNaN(s.getTime()) && !isNaN(days)) {
          const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
          finalFormData.finish = formatToDatetimeLocal(f);
        }
      }
    }
    if (!finalFormData.party) {
      finalFormData.party = currentProject?.party || 'Takashimaya';
    }

    if (cloudStatus === 'offline') {
      let payload = {
        ...finalFormData,
        id,
        projectYear: Number(currentYear) || new Date().getFullYear(),
        comments: task?.comments || finalFormData.comments || [],
        updatedAt: new Date().toISOString(),
        orderIndex: newOrderIndex
      };
      addPendingUpdate({ collectionPath: `artifacts/${APP_ID}/public/data/taka_tasks`, action: 'set', docId: id, data: payload } as any);
      setToast({ title: 'Draft Saved', message: 'Task saved offline. Will sync when connection returns.' });
      onClose();
      setIsSubmitting(false);
      return true;
    }
    
    let dataToSave: any = {
      ...finalFormData,
      id,
      projectYear: Number(currentYear) || new Date().getFullYear(),
      comments: task?.comments || finalFormData.comments || [],
      updatedAt: new Date().toISOString(),
      orderIndex: newOrderIndex
    };

    if (dataToSave.predecessor && dataToSave.predecessor.trim()) {
      dataToSave.realtimeUpdate = true;
    } else {
      dataToSave.realtimeUpdate = false;
    }

    // Explicitly delete fields from Firestore if unlinked or cleared
    if (task?.parentTaskId && !finalFormData.parentTaskId) {
      dataToSave.parentTaskId = deleteField();
      dataToSave.parentId = null;
    }
    if (task?.taskCodePhu && (!finalFormData.taskCodePhu || !finalFormData.taskCodePhu.trim())) {
      dataToSave.taskCodePhu = deleteField();
    }

    Object.keys(dataToSave).forEach(key => {
      if ((dataToSave as any)[key] === undefined) {
        delete (dataToSave as any)[key];
      }
    });

    const oldTaskNoMap = buildTaskNoMap(projects, tasks);
    const newTasksForMap = task 
       ? tasks.map(t => t.id === id ? dataToSave as Task : t) 
       : [...tasks, dataToSave as Task];
    const newTaskNoMap = buildTaskNoMap(projects, newTasksForMap);
    const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, newTasksForMap);

    if (task) {
      const oldCode = (task.taskCodePhu || computeTaskCode(projects, tasks, task)).trim();
      const newCode = (dataToSave.taskCodePhu || computeTaskCode(projects, newTasksForMap, dataToSave as Task)).trim();
      if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
        oldCodeToNewCode.set(oldCode.toLowerCase(), newCode);
      }
    }

    const predecessorUpdatesOrig = updatePredecessorsStrings(oldCodeToNewCode, tasks, projects, oldTaskNoMap);
    const predecessorUpdates = predecessorUpdatesOrig.filter(pu => pu.id !== id);
    const predecessorUpdatesMap = new Map(predecessorUpdates.map(pu => [pu.id, pu]));

    const updatesToDependents = scheduleDependentTasks(dataToSave as Task, tasks, projects);
    
    const scheduledUpdatedTask = updatesToDependents.find(d => d.id === dataToSave.id);
    if (scheduledUpdatedTask) {
      dataToSave = scheduledUpdatedTask as any;
    }

    const batch = writeBatch(db);
    if (task) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), dataToSave);
    } else {
      batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), dataToSave);
    }

    const depUpdates = updatesToDependents.filter(d => d.id !== id);
    const mappedDepUpdates = new Set<string>();

    depUpdates.forEach(depTask => {
      const depProj = projects.find(p => p.code === depTask.projectCode);
      const depYear = (depTask.projectYear !== undefined && depTask.projectYear !== null && !isNaN(Number(depTask.projectYear)))
        ? Number(depTask.projectYear)
        : (depProj?.year && !isNaN(Number(depProj.year)) ? Number(depProj.year) : new Date().getFullYear());
      const pu = predecessorUpdatesMap.get(depTask.id);
      const data = pu 
        ? { ...depTask, projectYear: depYear, predecessor: pu.predecessor, updatedAt: new Date().toISOString() } 
        : { ...depTask, projectYear: depYear, updatedAt: new Date().toISOString() };
      Object.keys(data).forEach(key => {
        if ((data as any)[key] === undefined) {
          delete (data as any)[key];
        }
      });
      batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), data, { merge: true });
      mappedDepUpdates.add(depTask.id);
    });

    predecessorUpdates.forEach(pu => {
      if (!mappedDepUpdates.has(pu.id)) {
         batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), { predecessor: pu.predecessor, updatedAt: pu.updatedAt }, { merge: true });
      }
    });

    const optimisticList: any[] = [dataToSave];
    depUpdates.forEach(depTask => {
      const pu = predecessorUpdatesMap.get(depTask.id);
      if (pu) {
        optimisticList.push({ ...depTask, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
      } else {
        optimisticList.push(depTask);
      }
    });
    predecessorUpdates.forEach(pu => {
      if (!mappedDepUpdates.has(pu.id)) {
        optimisticList.push({ id: pu.id, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
      }
    });
    
    saveTaskStateUnified(optimisticList);

    const isNewTask = !task;
    const oldAny = (task || {}) as any;
    const newAny = dataToSave as any;
    const datesOrStatusChanged =
      isNewTask ||
      task?.start !== dataToSave.start ||
      task?.finish !== dataToSave.finish ||
      task?.runningStatus !== dataToSave.runningStatus ||
      task?.approval !== dataToSave.approval ||
      Boolean(oldAny.isCompleted) !== Boolean(newAny.isCompleted) ||
      (oldAny.status || '') !== (newAny.status || '') ||
      task?.projectCode !== dataToSave.projectCode ||
      task?.projectStore !== dataToSave.projectStore ||
      task?.projectYear !== dataToSave.projectYear ||
      depUpdates.length > 0;

    // Close modal INSTANTLY (0ms UI lag)
    onClose();
    setIsSubmitting(false);

    // Offload network commit, delta emission, and project date rollups to non-blocking background microtask
    setTimeout(async () => {
      try {
        const deltaItems = optimisticList.map(item => {
          const prev = tasks.find(t => t.id === item.id);
          return createPatchDeltaItem({
            docId: item.id,
            collectionName: 'taka_tasks',
            previous: prev,
            updated: item,
            action: prev ? 'update' : 'create',
            year: item.projectYear ? String(item.projectYear) : (task?.projectYear ? String(task.projectYear) : undefined),
          });
        });
        const { markExplicitDelta } = await import('../../lib/autoDeltaQueue');
        markExplicitDelta(deltaItems);
        await batch.commit();
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});

        if (datesOrStatusChanged) {
          const allTasksCurrent = useAppStore.getState().tasks;
          const targetProjId = dataToSave.projectId ? String(dataToSave.projectId) : (currentProject?.id ? String(currentProject.id) : undefined);
          syncProjectDatesByCode(dataToSave.projectCode, dataToSave.projectStore, dataToSave.projectYear, allTasksCurrent, targetProjId);
          if (task && (task.projectCode !== dataToSave.projectCode || task.projectStore !== dataToSave.projectStore || task.projectYear !== dataToSave.projectYear)) {
            const oldProjId = task.projectId ? String(task.projectId) : targetProjId;
            syncProjectDatesByCode(task.projectCode, task.projectStore, task.projectYear, allTasksCurrent, oldProjId);
          }
        }
      } catch (error: any) {
        console.error("Background task save failed:", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
      }
    }, 0);

    undoManager.push({
      description: task ? `Update Task: ${formData.name}` : `Create Task: ${formData.name}`,
      revert: async () => {
        const revertBatch = writeBatch(db);
        if (task) {
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), { ...task, updatedAt: new Date().toISOString() });
        } else {
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), { isDeleted: true, updatedAt: new Date().toISOString() }, { merge: true });
        }
        updatesToDependents.forEach(depTask => {
          const originalDep = tasks.find(tsk => tsk.id === depTask.id);
          if (originalDep) {
            revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), originalDep);
          }
        });
        predecessorUpdates.forEach(pu => {
          if (!mappedDepUpdates.has(pu.id)) {
             const originalTask = tasks.find(tk => tk.id === pu.id);
             if (originalTask) {
               revertBatch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', originalTask.id), { predecessor: originalTask.predecessor || '' });
             }
          }
        });
        revertBatch.commit().catch(console.error);
      }
    });

    return true;
  } catch (e: any) { 
    console.error(e); 
    useAppStore.getState().setToast({ title: "Notice", message: String(e.message || "An error occurred while saving the task.") });
    setIsSubmitting(false);
    return false;
  }
}
