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
  splitPredecessors,
  calculateTaskDatesFromPredecessors
} from '../../lib/ganttUtils';
import { resolvePredecessorString, PredecessorContext } from '../../lib/predecessorMatchUtils';
import { generateId, getDefaultDatetimeLocal, formatToDatetimeLocal, parseDateTime, isTaskBelongsToProject, normalizeDashes } from '../../lib/utils';
import { syncProjectDatesByCode } from '../../lib/projectDatesService';
import { saveTaskStateUnified } from '../../lib/taskStateService';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task, AppUser } from '../../types';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { createPatchDeltaItem } from '../../lib/deltaPatchService';
import { isTaskBelongToSameParentScope } from '../../lib/parentHierarchyUtils';

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
    
    const sameProject = isTaskBelongsToProject(t, currentProject, projects);
    if (!sameProject) return false;

    // Check exact name
    if (t.name && String(t.name).trim().toLowerCase() === String(formData.name || '').trim().toLowerCase()) {
      return true;
    }
    // Check normalized name
    const tNorm = normalizeTaskNameForComparison(t.name);
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
        const { ensureProjectTasksLoaded } = await import('../../lib/taskStateService');
        const sameIdentity = (x: Task) =>
          String(x.projectStore || '').trim().toLowerCase() === String(currentProject.store || '').trim().toLowerCase() &&
          String(x.projectYear ?? '').trim() === String(currentProject.year ?? '').trim();
        const loaded: Task[] = await ensureProjectTasksLoaded(currentProject.code, {
          projectId: currentProject.id,
          store: currentProject.store,
          year: currentProject.year,
        });
        const loadedSame = loaded.filter(sameIdentity);
        if (loadedSame.length > 0) {
          realTask = loadedSame.find(t =>
            (task?.taskCodePhu && t.taskCodePhu === task.taskCodePhu) ||
            (task?.name && t.name && t.name.trim().toLowerCase() === task.name.trim().toLowerCase())
          );
        }
      } catch (err) {
        console.warn("Failed to find real task for ts_ in local/cache:", err);
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
      const normPred = normalizeDashes(formData.predecessor);
      const predContext: PredecessorContext = {
        projectId: formData.projectId || task?.projectId || currentProject?.id,
        projectCode: formData.projectCode || task?.projectCode || currentProject?.code,
        projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
        projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
        projectLocation: formData.location || task?.location || currentProject?.location
      };
      formData.predecessor = resolvePredecessorString(normPred, tasks, projects, formData.projectCode, predContext, formData.predecessorTaskIds);
      let taskNoMap = buildTaskNoMap(projects, tasks);
      let parts = splitPredecessors(formData.predecessor, taskNoMap);
      if (parts.length >= 2) {
        if (!/FF|SF/i.test(parts[1])) {
          if (!/SS|FS/i.test(parts[1])) parts[1] += "FF";
          else parts[1] = parts[1].replace(/SS|FS/ig, "FF");
        }
        formData.predecessor = parts.join(", ");
      }

      const dummyTask: any = {
        projectId: formData.projectId || task?.projectId || currentProject?.id,
        projectCode: formData.projectCode || task?.projectCode || currentProject?.code,
        projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
        projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
        location: formData.location || task?.location || currentProject?.location
      };
      let parsed = parsePredecessors(formData.predecessor, taskNoMap, dummyTask);

      if (formData.predecessor.trim() && (!parsed.length || parsed.some((p: any) => !p.task))) {
        for (const token of parts) {
          const cleanToken = normalizeDashes(token).replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
          const cleanTokenLower = cleanToken.toLowerCase();
          const matchedProj = projects.find(
            (p) =>
              p.code &&
              cleanTokenLower.startsWith(normalizeDashes(p.code).toLowerCase())
          );
          if (matchedProj && (matchedProj.id !== dummyTask.projectId || matchedProj.code !== dummyTask.projectCode)) {
            const { ensureProjectTasksLoaded } = await import('../../lib/taskStateService');
            const loaded = await ensureProjectTasksLoaded(matchedProj.code, {
              projectId: matchedProj.id,
              store: matchedProj.store,
              year: matchedProj.year,
            });
            if (loaded.length > 0) {
              tasks = useAppStore.getState().tasks || tasks;
              taskNoMap = buildTaskNoMap(projects, tasks);
              parsed = parsePredecessors(formData.predecessor, taskNoMap, dummyTask);
            }
          }
        }
      }

      if (parsed.length >= 2) formData.durationManual = false;
      const calcResult = calculateTaskDatesFromPredecessors(formData, parsed);
      if (calcResult) {
        formData.start = calcResult.start;
        formData.finish = calcResult.finish;
        formData.duration = calcResult.duration;
        formData.durationManual = calcResult.durationManual;
      }
    }
  }

  try {
    const todayDate = getDefaultDatetimeLocal();
    let finalFormData = { ...formData };
    finalFormData.start = finalFormData.start || todayDate;
    finalFormData.finish = finalFormData.finish || finalFormData.start || todayDate;
    finalFormData.baselineStart = finalFormData.baselineStart || finalFormData.start || todayDate;
    finalFormData.baselineFinish = finalFormData.baselineFinish || finalFormData.finish || todayDate;
    finalFormData.duration = (finalFormData.duration === undefined || finalFormData.duration === null || String(finalFormData.duration).trim() === '') ? "0" : String(finalFormData.duration);
    if (parseFloat(finalFormData.duration) < 0) {
      finalFormData.duration = "0";
      finalFormData.finish = finalFormData.start;
    }
    if (finalFormData.durationManual ?? true) {
      finalFormData.durationManual = true;
      if (finalFormData.start && finalFormData.duration !== '') {
        const s = parseDateTime(finalFormData.start);
        const days = parseFloat(finalFormData.duration);
        if (s && !isNaN(s.getTime()) && !isNaN(days)) {
          finalFormData.finish = formatToDatetimeLocal(new Date(s.getTime() + days * 86400000));
        }
      }
    }
    if (!finalFormData.party) finalFormData.party = currentProject?.party || 'Takashimaya';

    if (cloudStatus === 'offline') {
      let payload: any = {
        ...finalFormData,
        id,
        projectId: finalFormData.projectId || task?.projectId || currentProject.id,
        projectCode: finalFormData.projectCode || currentProject.code,
        projectStore: finalFormData.projectStore || currentProject.store,
        projectYear: Number(currentYear) || new Date().getFullYear(),
        comments: task?.comments || finalFormData.comments || [],
        updatedAt: new Date().toISOString(),
        orderIndex: newOrderIndex
      };
      delete payload._isVirtualSummary;
      addPendingUpdate({ collectionPath: `artifacts/${APP_ID}/public/data/taka_tasks`, action: 'set', docId: id, data: payload } as any);
      setToast({ title: 'Draft Saved', message: 'Task saved offline. Will sync when connection returns.' });
      onClose();
      setIsSubmitting(false);
      return true;
    }
    
    let dataToSave: any = {
      ...finalFormData,
      id,
      projectId: finalFormData.projectId || task?.projectId || currentProject.id,
      projectCode: finalFormData.projectCode || currentProject.code,
      projectStore: finalFormData.projectStore || currentProject.store,
      projectYear: Number(currentYear) || new Date().getFullYear(),
      comments: task?.comments || finalFormData.comments || [],
      updatedAt: new Date().toISOString(),
      orderIndex: newOrderIndex
    };
    delete dataToSave._isVirtualSummary;

    dataToSave.realtimeUpdate = Boolean(dataToSave.predecessor && dataToSave.predecessor.trim());

    // Explicitly delete fields from Firestore if unlinked or cleared
    if (task?.parentTaskId && !finalFormData.parentTaskId) {
      dataToSave.parentTaskId = deleteField();
      dataToSave.parentId = null;
    } else if (finalFormData.parentTaskId) {
      const parentTask = tasks.find(t => String(t.id) === String(finalFormData.parentTaskId) || (t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === String(finalFormData.parentTaskId).trim().toLowerCase()));
      if (parentTask && isTaskBelongToSameParentScope(dataToSave, parentTask)) {
        dataToSave.parentTaskId = String(parentTask.id);
        dataToSave.parentId = String(parentTask.id);
        dataToSave.projectId = dataToSave.projectId || parentTask.projectId;
        dataToSave.projectStore = dataToSave.projectStore || parentTask.projectStore;
        dataToSave.projectYear = dataToSave.projectYear !== undefined ? dataToSave.projectYear : parentTask.projectYear;
        dataToSave.projectCode = dataToSave.projectCode || parentTask.projectCode;
      } else if (parentTask && !isTaskBelongToSameParentScope(dataToSave, parentTask)) {
        delete dataToSave.parentTaskId;
        delete dataToSave.parentId;
      }
    }
    if (task?.taskCodePhu && (!finalFormData.taskCodePhu || !finalFormData.taskCodePhu.trim())) {
      dataToSave.taskCodePhu = deleteField();
    }

    Object.keys(dataToSave).forEach(key => {
      if ((dataToSave as any)[key] === undefined) {
        delete (dataToSave as any)[key];
      }
    });

    const hasPredecessors = Boolean(
      (dataToSave.predecessor && dataToSave.predecessor.trim()) ||
      (task?.predecessor && task.predecessor.trim()) ||
      (task && task.taskCodePhu !== dataToSave.taskCodePhu)
    );

    let depUpdates: Task[] = [];
    let predecessorUpdates: any[] = [];
    const predecessorUpdatesMap = new Map<string, any>();
    const mappedDepUpdates = new Set<string>();

    if (hasPredecessors) {
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
      predecessorUpdates = predecessorUpdatesOrig.filter(pu => pu.id !== id);
      predecessorUpdates.forEach(pu => predecessorUpdatesMap.set(pu.id, pu));

      const updatesToDependents = scheduleDependentTasks(dataToSave as Task, tasks, projects);
      const scheduledUpdatedTask = updatesToDependents.find(d => d.id === dataToSave.id);
      if (scheduledUpdatedTask) {
        dataToSave = { ...(scheduledUpdatedTask as any) };
        delete dataToSave._isVirtualSummary;
      }
      depUpdates = updatesToDependents.filter(d => d.id !== id);
    }

    const batch = writeBatch(db);
    batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), dataToSave, { merge: true });

    depUpdates.forEach(depTask => {
      const depProj = projects.find(p => p.code === depTask.projectCode);
      const depYear = (depTask.projectYear !== undefined && depTask.projectYear !== null && !isNaN(Number(depTask.projectYear)))
        ? Number(depTask.projectYear)
        : (depProj?.year && !isNaN(Number(depProj.year)) ? Number(depProj.year) : new Date().getFullYear());
      const pu = predecessorUpdatesMap.get(depTask.id);
      const data: any = pu 
        ? { ...depTask, projectYear: depYear, predecessor: pu.predecessor, updatedAt: new Date().toISOString() } 
        : { ...depTask, projectYear: depYear, updatedAt: new Date().toISOString() };
      delete data._isVirtualSummary;
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
      const cleanDep: any = pu ? { ...depTask, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : { ...depTask };
      delete cleanDep._isVirtualSummary;
      optimisticList.push(cleanDep);
    });
    predecessorUpdates.forEach(pu => {
      if (!mappedDepUpdates.has(pu.id)) {
        optimisticList.push({ id: pu.id, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
      }
    });

    // 1. Optimistic in-memory update into Zustand Store (0ms instant UI reaction)
    useAppStore.getState().optimisticUpdateTasks(optimisticList);

    // 2. Close modal INSTANTLY (0ms UI lag)
    onClose();
    setIsSubmitting(false);

    // 3. Offload network commit, delta emission, Dexie persistence, and project date rollups in parallel
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
        await Promise.all([
          batch.commit(),
          saveTaskStateUnified(optimisticList, { syncProjects: true }).catch(() => {}),
        ]);
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});

        // If task moved from an older project/store/year, also resync the previous project's taskSummaries
        if (
          task &&
          (task.projectId !== dataToSave.projectId ||
            task.projectCode !== dataToSave.projectCode ||
            task.projectStore !== dataToSave.projectStore ||
            task.projectYear !== dataToSave.projectYear)
        ) {
          const allTasksCurrent = useAppStore.getState().tasks;
          const oldProjId = task.projectId ? String(task.projectId) : undefined;
          syncProjectDatesByCode(task.projectCode, task.projectStore, task.projectYear, allTasksCurrent, oldProjId);
        }
      } catch (error: any) {
        console.error("Background task save failed:", error);
        optimisticList.forEach(item => {
          addPendingUpdate({
            collectionPath: `artifacts/${APP_ID}/public/data/taka_tasks`,
            action: 'set',
            docId: item.id,
            data: item
          } as any);
        });
        useAppStore.getState().setToast({ title: "Offline Saved", message: "Saved to offline queue. Will sync when connection is restored.", type: "warning" });
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
        depUpdates.forEach(depTask => {
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
