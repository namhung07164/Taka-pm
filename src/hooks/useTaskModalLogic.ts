import React, { useEffect, useRef, useState } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Task } from '../types';
import { useAppStore } from "../store/useAppStore";
import { useEnrichedData } from './useEnrichedData';
import { useTaskModalFormState } from './taskModal/useTaskModalFormState';
import { executeTaskSave } from './taskModal/taskModalSaveService';
import { hydrateDelegationsForProjects, hydrateDelegationsForTasks, hydrateTasksForProjects } from '../lib/backgroundSyncWorker';
import { ensureProjectTasksLoaded } from '../lib/taskStateService';
import { prepareMissingDelegationsForTasks } from '../lib/taskImportService';

export interface UseTaskModalLogicProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  prefillProjectCode: string | null;
  prefillProjectYear?: string | number | null;
  prefillProjectStore?: string | null;
  prefillProjectId?: string | null;
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
  prefillProjectId,
  isReadOnly = false,
  onNavigateToDelegation: _onNavigateToDelegation,
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

  const [activeTab, setActiveTab] = useState<'details' | 'chat'>(initialTab);
  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State Sub-Hook
  const {
    formData,
    setFormData,
    dateErrors,
    setDateErrors,
    nameRef,
    resolvedPredecessors,
    handlePredecessorChange,
    handleApplyPredecessorDates,
    handleDateChange,
    handleDurationChange,
    toggleDurationManual
  } = useTaskModalFormState({
    task,
    isOpen,
    prefillProjectCode,
    prefillProjectYear,
    prefillProjectStore,
    prefillProjectId,
    projects,
    tasks,
    t
  });

  // Escape key handler
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

  // JIT Targeted Local-First Task & Delegation Hydration + Self-Healing Auto-Provisioning
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const pCode = task?.projectCode || prefillProjectCode;
    const pId = task?.projectId;
    const pYear = task?.projectYear ?? prefillProjectYear;
    const pStore = task?.projectStore ?? prefillProjectStore;
    const keys = [pId, pCode].filter(Boolean) as string[];

    (async () => {
      if (keys.length > 0) {
        await Promise.all([
          hydrateTasksForProjects(keys, pYear, pStore).catch(() => {}),
          hydrateDelegationsForProjects(keys, pYear, pStore).catch(() => {}),
        ]);
        if (pCode || pId) {
          ensureProjectTasksLoaded(pCode || '', {
            projectId: pId,
            store: pStore,
            year: pYear,
          }).catch(() => {});
        }
      }
      if (task?.id) {
        await hydrateDelegationsForTasks([task.id]).catch(() => {});
      }
      if (cancelled || !task?.id || String(task.id).startsWith('ts_')) return;

      const isDelActive = Boolean(formData?.delegation ?? task?.delegation);
      if (!isDelActive) return;

      const detId = `del_${task.id}`;
      const existingInStore = (useAppStore.getState().delegationGroups || []).find(
        (g) => g.parentTaskId === task.id || g.id === detId || g.id === task.id
      );
      if (existingInStore && Array.isArray(existingInStore.subTasks) && existingInStore.subTasks.length > 0) {
        return;
      }

      // Check Firestore first in case another device created it, otherwise auto-provision immediately
      try {
        const { doc, getDoc } = await import('firebase/firestore');
        const { db, APP_ID, setDoc } = await import('../lib/firebase');
        const { bulkPersistDelegations } = await import('../lib/localDb');
        const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', detId));
        if (cancelled) return;
        if (snap.exists()) {
          const remoteGroup = { id: snap.id, ...(snap.data() as any) };
          if (!remoteGroup.isDeleted && Array.isArray(remoteGroup.subTasks) && remoteGroup.subTasks.length > 0) {
            const cur = useAppStore.getState().delegationGroups || [];
            const map = new Map(cur.map((d) => [d.id, d]));
            map.set(remoteGroup.id, remoteGroup);
            useAppStore.getState().setDelegationGroups(Array.from(map.values()));
            bulkPersistDelegations([remoteGroup]).catch(() => {});
            return;
          }
        }
        const mergedTask: Task = {
          ...task,
          ...formData,
          id: task.id,
          delegation: true,
        } as Task;
        const { newDelegations } = prepareMissingDelegationsForTasks([mergedTask], currentUser);
        if (newDelegations.length > 0) {
          bulkPersistDelegations(newDelegations).catch(() => {});
          for (const dg of newDelegations) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', dg.id), dg, { merge: true }).catch(() => {});
          }
        }
      } catch {
        const mergedTask: Task = {
          ...task,
          ...formData,
          id: task.id,
          delegation: true,
        } as Task;
        prepareMissingDelegationsForTasks([mergedTask], currentUser);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, task?.id, task?.delegation, formData?.delegation, task?.projectId, task?.projectCode, task?.projectYear, task?.projectStore, prefillProjectCode, prefillProjectYear, prefillProjectStore]);

  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const setIsTaskModalOpen = useAppStore(state => state.setIsTaskModalOpen);

  const handleOpenProjectComments = () => {
    if (task) {
      const parentProject = projects.find(p =>
        (task.projectId && p.id === task.projectId) ||
        (p.code === task.projectCode &&
          (!task.projectYear || !p.year || String(p.year) === String(task.projectYear)) &&
          (!task.projectStore || !p.store || String(p.store).toUpperCase() === String(task.projectStore).toUpperCase()))
      );
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

  const handleSubmit = async (e: React.FormEvent) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    e.preventDefault();

    await executeTaskSave({
      formData,
      task,
      projects,
      tasks,
      cloudStatus,
      currentUser,
      t,
      setToast,
      onClose,
      setIsSubmitting
    });
  };

  const handleUnlinkParentInModal = async () => {
    if (!task?.id) return;
    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;

    // 1. Optimistic update
    const unlinkedTask: Task = { ...task, parentTaskId: undefined, updatedAt: now };
    delete (unlinkedTask as any).parentId;
    const updatedTasks = prevTasks.map(t =>
      t.id === task.id ? unlinkedTask : t
    );
    useAppStore.getState().setTasks(updatedTasks);
    setFormData((prev: any) => ({ ...prev, parentTaskId: undefined, parentId: undefined }));

    // 2. Sync project summaries + Dexie
    try {
      const { saveTaskStateUnified } = await import('../lib/taskStateService');
      await saveTaskStateUnified([unlinkedTask]);
      const { localDb } = await import('../lib/localDb');
      await (localDb.tasks.update as any)(task.id, { parentTaskId: null, parentId: null, updatedAt: now });
    } catch (e) {}

    // 3. Firestore update
    try {
      const { doc, deleteField } = await import('firebase/firestore');
      const { writeBatch } = await import('../lib/firestoreWrites');
      const { db, APP_ID } = await import('../lib/firebase');
      const { recordDelta } = await import('../lib/deltaSyncService');
      const batch = writeBatch(db);
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', task.id);
      batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
      await batch.commit();

      recordDelta({
        docId: task.id,
        collectionName: 'taka_tasks',
        action: 'update',
        isPatch: true,
        data: { parentTaskId: null, parentId: null, updatedAt: now },
        projectId: task.projectId,
        projectCode: task.projectCode,
        store: task.projectStore,
        year: task.projectYear ? String(task.projectYear) : undefined,
        updatedBy: currentUser?.email || currentUser?.username,
      }).catch(() => {});

      setToast({ title: "Success", message: "Task unlinked from parent modular task." });
    } catch (err: any) {
      console.error(err);
      useAppStore.getState().setTasks(prevTasks);
      setToast({ title: "Error", message: "Failed to unlink task on server." });
    }
  };

  const handleDeleteTaskInModal = () => {
    if (!task?.id) return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Task",
      message: `Are you sure you want to delete task "${task.name || ''}"? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const { deleteTaskStateUnified } = await import('../lib/taskStateService');
          await deleteTaskStateUnified([task]);
          setToast({ title: "Success", message: "Task deleted successfully." });
          onClose();
        } catch (err: any) {
          console.error(err);
          setToast({ title: "Error", message: "Failed to delete task on server." });
        }
      }
    });
  };

  return {
    handleUnlinkParentInModal,
    handleDeleteTaskInModal,
    projects,
    tasks,
    delegationGroups,
    currentUser,
    permissionMatrix,
    locations,
    theme,
    appUsers,
    subAppUsers,
    parties,
    globalYearFilter,
    isArchiveYear,
    canWrite,
    t,
    nodeRef,
    setToast,
    cloudStatus,
    nameRef,
    formData,
    setFormData,
    dateErrors,
    setDateErrors,
    isSubmitting,
    activeTab,
    setActiveTab,
    confirmModal,
    setConfirmModal,
    resolvedPredecessors,
    handleOpenProjectComments,
    handlePredecessorChange,
    handleApplyPredecessorDates,
    handleSubmit,
    handleDateChange,
    handleDurationChange,
    toggleDurationManual
  };
}

export type TaskModalLogicType = ReturnType<typeof useTaskModalLogic>;
