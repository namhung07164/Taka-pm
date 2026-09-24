import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Project, Task, DelegationGroup } from '../types';
import { getDefaultDatetimeLocal, calculateDays, formatToDatetimeLocal, parseDateTime } from '../lib/utils';
import { useAppStore } from "../store/useAppStore";
import { useEnrichedData } from './useEnrichedData';
import { doc } from 'firebase/firestore';
import { db, APP_ID, writeBatch } from "../lib/firebase";
import { addPendingUpdate } from '../lib/syncQueue';
import { undoManager } from '../lib/undoManager';
import { calculateTaskDatesFromPredecessors, getPredecessorCodeUpdates, updatePredecessorsStrings, parsePredecessors, computeTaskCode, buildTaskNoMap, scheduleDependentTasks, addDays, splitPredecessors, normalizeAndHealTaskPredecessors } from '../lib/ganttUtils';
import { resolvePredecessorString, PredecessorContext } from '../lib/predecessorMatchUtils';
import { generateId } from '../lib/utils';
import { syncProjectDatesByCode } from '../lib/projectDatesService';
import { saveTaskStateUnified, ensureProjectTasksLoaded } from '../lib/taskStateService';

export interface UseTaskModalLogicProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  prefillProjectCode: string | null;
  prefillProjectYear?: string | number | null;
  prefillProjectStore?: string | null;
  isReadOnly?: boolean;
  onNavigateToDelegation?: (groupId: string, taskId?: string) => void;
  initialTab?: 'details' | 'chat';
}

export function useTaskModalLogic({
  task,
  isOpen,
  onClose,
  prefillProjectCode,
  prefillProjectYear,
  prefillProjectStore,
  isReadOnly = false,
  onNavigateToDelegation,
  initialTab = 'details'
}: UseTaskModalLogicProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = !isReadOnly && (currentUser?.role === 'admin' || currentUser?.canWrite) && !isArchiveYear;

  const { t } = useLanguage();
  const nodeRef = React.useRef(null);
  const setToast = useAppStore(state => state.setToast);
  const cloudStatus = useAppStore(state => state.cloudStatus);
  const [dateErrors, setDateErrors] = useState<any>({});
  const [formData, setFormData] = useState<Partial<Task>>(() => {
    if (task) return task;
    const defaultDate = getDefaultDatetimeLocal();
    const targetProj = projects?.find(p => 
      p.code === prefillProjectCode &&
      (prefillProjectStore ? p.store === prefillProjectStore : true) &&
      (prefillProjectYear ? String(p.year) === String(prefillProjectYear) : true)
    ) || projects?.find(p => p.code === prefillProjectCode) || (projects && projects.length > 0 ? projects[0] : null);

    return {
      projectId: targetProj?.id || undefined,
      projectCode: prefillProjectCode || targetProj?.code || '',
      projectYear: prefillProjectYear || targetProj?.year || undefined,
      projectStore: prefillProjectStore || targetProj?.store || undefined,
      location: targetProj?.location || undefined,
      name: '',
      start: defaultDate,
      finish: defaultDate,
      baselineStart: defaultDate,
      baselineFinish: defaultDate,
      duration: '0',
      durationManual: true,
      finishManual: false,
      party: targetProj?.party || 'Takashimaya'
    };
  });
  const nameRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'details' | 'chat'>(initialTab);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModal.isOpen) return;
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmModal.isOpen]);

  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const setIsTaskModalOpen = useAppStore(state => state.setIsTaskModalOpen);

  const handleOpenProjectComments = () => {
    if (task) {
      const parentProject = projects.find(p => p.code === task.projectCode && String(p.year) === String(task.projectYear) && p.store === task.projectStore);
      if (parentProject) {
        setIsTaskModalOpen(false);
        setEditingProject(parentProject);
        setModalInitialTab('chat');
        setIsProjectModalOpen(true);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsSubmitting(false);
    }
  }, [isOpen, task?.id, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    if (task) {
      const healedPred = normalizeAndHealTaskPredecessors(task, tasks, projects).newPredecessor;
      setFormData({
        ...task,
        predecessor: healedPred !== undefined ? healedPred : (task.predecessor || '')
      });
    } else {
      const defaultDate = getDefaultDatetimeLocal();
      const targetProj = projects?.find(p => 
        p.code === prefillProjectCode &&
        (prefillProjectStore ? p.store === prefillProjectStore : true) &&
        (prefillProjectYear ? String(p.year) === String(prefillProjectYear) : true)
      ) || projects?.find(p => p.code === prefillProjectCode) || (projects && projects.length > 0 ? projects[0] : null);

      setFormData({
        projectId: targetProj?.id || undefined,
        projectCode: prefillProjectCode || targetProj?.code || '',
        projectYear: prefillProjectYear || targetProj?.year || undefined,
        projectStore: prefillProjectStore || targetProj?.store || undefined,
        location: targetProj?.location || undefined,
        name: '',
        start: defaultDate,
        finish: defaultDate,
        baselineStart: defaultDate,
        baselineFinish: defaultDate,
        duration: '0',
        durationManual: true,
        finishManual: false,
        party: targetProj?.party || 'Takashimaya'
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id, isOpen, prefillProjectCode, prefillProjectYear, prefillProjectStore]);

  const currentProject = useMemo(() => {
    return projects.find(p => 
      p.code === (formData.projectCode || task?.projectCode) &&
      (formData.projectStore ? p.store === formData.projectStore : true) &&
      (formData.projectYear ? String(p.year) === String(formData.projectYear) : true)
    ) || projects.find(p => p.code === (formData.projectCode || task?.projectCode));
  }, [projects, formData.projectCode, formData.projectStore, formData.projectYear, task?.projectCode]);

  const resolvedPredecessors = useMemo(() => {
    if (!formData.predecessor?.trim()) return [];
    try {
      const taskNoMap = buildTaskNoMap(projects || [], tasks || []);
      const dummyTask: Task = {
        id: task?.id || 'temp',
        projectId: formData.projectId || task?.projectId || currentProject?.id,
        projectCode: formData.projectCode || task?.projectCode || currentProject?.code || '',
        projectYear: formData.projectYear || task?.projectYear || currentProject?.year,
        projectStore: formData.projectStore || task?.projectStore || currentProject?.store,
        location: formData.location || task?.location || currentProject?.location,
        name: formData.name || '',
        start: formData.start,
        finish: formData.finish,
        duration: formData.duration,
        durationManual: true,
        finishManual: false
      };
      return parsePredecessors(formData.predecessor, taskNoMap, dummyTask);
    } catch {
      return [];
    }
  }, [formData.predecessor, formData.projectId, formData.projectCode, formData.projectYear, formData.projectStore, formData.location, currentProject, projects, tasks, task?.id, task?.projectId, task?.projectCode, task?.projectYear, task?.projectStore, task?.location]);



  const handlePredecessorChange = async (val: string) => {
    
    const isFilled = Boolean(val.trim());
    let updated = { ...formData, predecessor: val, realtimeUpdate: isFilled };

    const parts = val.split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      updated.durationManual = false;
    }
    if (isFilled) {
      try {
        let currentTasks = useAppStore.getState().tasks || tasks || [];
        let taskNoMap = buildTaskNoMap(projects || [], currentTasks);
        const dummyTask: Task = {
          id: task?.id || 'temp',
          projectId: updated.projectId || task?.projectId || currentProject?.id,
          projectCode: updated.projectCode || currentProject?.code || '',
          projectYear: updated.projectYear || currentProject?.year,
          projectStore: updated.projectStore || currentProject?.store,
          location: updated.location || task?.location || currentProject?.location,
          name: updated.name || '',
          start: updated.start,
          finish: updated.finish,
          duration: updated.duration,
          durationManual: updated.durationManual ?? (parts.length >= 2 ? false : true),
          finishManual: updated.finishManual ?? false
        };
        let parsed = parsePredecessors(val, taskNoMap, dummyTask);

        if (val.trim() && (!parsed.length || parsed.some(p => !p.task))) {
          const splitParts = splitPredecessors(val, taskNoMap);
          for (const token of splitParts) {
            const cleanToken = token.replace(/(fs|ss|ff|sf|[+-]\s*\d+|\s+\d+)$/i, '').trim();
            const matchedProj = (projects || []).find(p => p.code && cleanToken.toLowerCase().startsWith(p.code.toLowerCase()));
            if (matchedProj && matchedProj.code !== dummyTask.projectCode) {
              const loaded = await ensureProjectTasksLoaded(matchedProj.code);
              if (loaded.length > 0) {
                currentTasks = useAppStore.getState().tasks || currentTasks;
                taskNoMap = buildTaskNoMap(projects || [], currentTasks);
                parsed = parsePredecessors(val, taskNoMap, dummyTask);
              }
            }
          }
        }

        if (parsed.length > 0) {
          const calcResult = calculateTaskDatesFromPredecessors(dummyTask, parsed);
          if (calcResult) {
            updated.start = calcResult.start;
            updated.finish = calcResult.finish;
            updated.duration = calcResult.duration;
            updated.durationManual = calcResult.durationManual;

            if (!task?.baselineStart && !formData.baselineStart) {
              updated.baselineStart = calcResult.start;
            }
            if (!task?.baselineFinish && !formData.baselineFinish) {
              updated.baselineFinish = calcResult.finish;
            }
          }
        }
      } catch (err) {
        console.warn("Predecessor auto-calc err:", err);
      }
    }
    setFormData(updated);
  };

  const handleApplyPredecessorDates = () => {
    if (formData.predecessor) {
      if (resolvedPredecessors.length > 0) {
        const dummyTask: Task = {
          id: task?.id || 'temp',
          projectCode: formData.projectCode || '',
          projectYear: formData.projectYear,
          projectStore: formData.projectStore,
          name: formData.name || '',
          start: formData.start,
          finish: formData.finish,
          duration: formData.duration,
          durationManual: formData.durationManual ?? true,
          finishManual: formData.finishManual ?? false
        };
        const calcResult = calculateTaskDatesFromPredecessors(dummyTask, resolvedPredecessors);
        if (calcResult) {
          setFormData(prev => ({
            ...prev,
            start: calcResult.start,
            finish: calcResult.finish,
            duration: calcResult.duration,
            durationManual: calcResult.durationManual,
            ...(!task?.baselineStart && !prev.baselineStart ? { baselineStart: calcResult.start } : {}),
            ...(!task?.baselineFinish && !prev.baselineFinish ? { baselineFinish: calcResult.finish } : {})
          }));
          useAppStore.getState().setToast({
            title: t("Dates Synced") || "Dates Synced",
            message: t("Task dates and duration synced with predecessors.") || "Task dates and duration synced with predecessors."
          });
          return;
        }
      }
      handlePredecessorChange(formData.predecessor);
      useAppStore.getState().setToast({
        title: t("Dates Synced") || "Dates Synced",
        message: t("Task dates and duration synced with predecessors.") || "Task dates and duration synced with predecessors."
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    e.preventDefault();

    const currentProject = projects.find(p => 
      p.code === formData.projectCode &&
      (String(p.year || '') === String(formData.projectYear || '') || (!p.year && !formData.projectYear)) &&
      (String(p.store || '') === String(formData.projectStore || '') || (!p.store && !formData.projectStore))
    );
    if (!currentProject) {
      useAppStore.getState().setToast({ title: "Notice", message: String("Please select a valid project.") });
      setIsSubmitting(false); return;
    }

    const currentYear = (!isNaN(Number(currentProject?.year)) && currentProject?.year !== null && currentProject?.year !== '') 
      ? Number(currentProject.year) 
      : (formData.projectYear && !isNaN(Number(formData.projectYear)) ? Number(formData.projectYear) : new Date().getFullYear());

    // Check for duplicate task name in the same project (code, year, store)
    const isDuplicate = tasks.some(t => {
      if (t.id === task?.id) return false;
      if (t.name.trim().toLowerCase() !== (formData.name || '').trim().toLowerCase()) return false;
      
      return t.projectCode === currentProject.code && 
             (String(t.projectYear || '') === String(currentProject.year || '') || (!t.projectYear && !currentProject.year)) &&
             (String(t.projectStore || '') === String(currentProject.store || '') || (!t.projectStore && !currentProject.store));
    });

    if (isDuplicate) {
      setToast({ title: "Error", message: `Task "${formData.name}" already exists in this project. Please enter a different name.` });
      setIsSubmitting(false); return;
    }

    const id = task ? task.id : `t_${Date.now()}_${generateId().substring(0, 8)}`;
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
        formData.predecessor = resolvePredecessorString(formData.predecessor, tasks, projects, formData.projectCode, predContext);
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
      // Allow external predecessor links across projects without blocking window.confirm in iframe/mobile
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
        onClose(); setIsSubmitting(false);
        setIsSubmitting(false); return;
      }
      
      let dataToSave = {
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

      // Explicitly check if task code changed (especially for Task Mẹ with custom code or code containing commas)
      if (task) {
        const oldCode = (task.taskCodePhu || computeTaskCode(projects, tasks, task)).trim();
        const newCode = (dataToSave.taskCodePhu || computeTaskCode(projects, newTasksForMap, dataToSave as Task)).trim();
        if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
          oldCodeToNewCode.set(oldCode.toLowerCase(), newCode);
        }
      }

      const predecessorUpdatesOrig = updatePredecessorsStrings(oldCodeToNewCode, tasks, projects);
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
        if (tasks.find(t => t.id === depTask.id)) {
           batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), data);
        } else {
           batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), data);
        }
        mappedDepUpdates.add(depTask.id);
      });

      predecessorUpdates.forEach(pu => {
        if (!mappedDepUpdates.has(pu.id)) {
           batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), { predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        }
      });

      // Zero-Delay Optimistic UI: Immediately reflect all updates into Zustand global store
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
      // Optimistic UI update in Zustand & sync project dates immediately
      saveTaskStateUnified(optimisticList);

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        setIsSubmitting(false); return;
      }
      // Dirty Check: Chỉ kích hoạt đồng bộ project dates nếu có thay đổi về ngày (start, finish), trạng thái (runningStatus/approval/status/isCompleted), đổi dự án, hoặc dời lịch các task phụ thuộc
      const isNewTask = !task;
      const oldAny = (task || {}) as any;
      const newAny = dataToSave as any;
      const datesOrStatusChanged =
        isNewTask ||
        task.start !== dataToSave.start ||
        task.finish !== dataToSave.finish ||
        task.runningStatus !== dataToSave.runningStatus ||
        task.approval !== dataToSave.approval ||
        Boolean(oldAny.isCompleted) !== Boolean(newAny.isCompleted) ||
        (oldAny.status || '') !== (newAny.status || '') ||
        task.projectCode !== dataToSave.projectCode ||
        task.projectStore !== dataToSave.projectStore ||
        task.projectYear !== dataToSave.projectYear ||
        depUpdates.length > 0;

      if (datesOrStatusChanged) {
        const allTasksCurrent = useAppStore.getState().tasks;
        syncProjectDatesByCode(dataToSave.projectCode, dataToSave.projectStore, dataToSave.projectYear, allTasksCurrent);
        if (task && (task.projectCode !== dataToSave.projectCode || task.projectStore !== dataToSave.projectStore || task.projectYear !== dataToSave.projectYear)) {
          syncProjectDatesByCode(task.projectCode, task.projectStore, task.projectYear, allTasksCurrent);
        }
      }
      
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
      
      onClose(); setIsSubmitting(false);
    } catch (e: any) { 
      console.error(e); 
      useAppStore.getState().setToast({ title: "Notice", message: String(e.message || "An error occurred while saving the task.") });
    }
  };

  const handleDateChange = (field: 'start' | 'finish', value: string) => {
    const nextData = { ...formData, [field]: value };
    
    if (field === 'start') {
      if (nextData.durationManual) {
        if (nextData.start && nextData.duration !== undefined && nextData.duration !== '') {
          const s = parseDateTime(nextData.start);
          if (s && !isNaN(s.getTime())) {
            const days = parseFloat(String(nextData.duration));
            if (!isNaN(days)) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              nextData.finish = formatToDatetimeLocal(f);
            }
          }
        }
      } else {
        if (nextData.start && nextData.finish) {
          const s = parseDateTime(nextData.start);
          const f = parseDateTime(nextData.finish);
          if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
            const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
            nextData.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
          }
        }
      }
    } else {
      // field === 'finish'
      if (nextData.start && nextData.finish) {
        const s = parseDateTime(nextData.start);
        const f = parseDateTime(nextData.finish);
        if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
          const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
          nextData.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
        }
      }
    }

    if (!task?.baselineStart && !formData.baselineStart && nextData.start) {
      // Set only the first time start is filled natively or during initial populate without baseline
      nextData.baselineStart = nextData.start;
    }
    if (!task?.baselineFinish && !formData.baselineFinish && nextData.finish) {
      nextData.baselineFinish = nextData.finish;
    }

    setFormData(nextData);
  };

  const handleDurationChange = (value: string) => {
    const sanitizedValue = value.replace(',', '.');
    const nextData = { ...formData, duration: sanitizedValue };
    
    if (nextData.start) {
      const s = parseDateTime(nextData.start);
      if (s && !isNaN(s.getTime())) {
        let days = parseFloat(sanitizedValue);
        if (!isNaN(days) && days >= 0) {
          const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
          nextData.finish = formatToDatetimeLocal(f);

          if (!task?.baselineFinish && !formData.baselineFinish && nextData.finish) {
            nextData.baselineFinish = nextData.finish;
          }
        }
      }
    }
    setFormData(nextData);
  };

  const toggleDurationManual = () => {
    setFormData(prev => ({ ...prev, durationManual: !prev.durationManual }));
  };



  return {
    projects, tasks, delegationGroups, currentUser, permissionMatrix, locations, theme, appUsers, subAppUsers, parties, globalYearFilter, isArchiveYear, canWrite, t, nodeRef, setToast, cloudStatus, nameRef,
    formData, setFormData, dateErrors, setDateErrors, isSubmitting, activeTab, setActiveTab, confirmModal, setConfirmModal, resolvedPredecessors,
    handleOpenProjectComments, handlePredecessorChange, handleApplyPredecessorDates, handleSubmit, handleDateChange, handleDurationChange, toggleDurationManual
  };
}

export type TaskModalLogicType = ReturnType<typeof useTaskModalLogic>;
