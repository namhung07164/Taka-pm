import React, { useState, useEffect } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Task } from '../types';
import { useAppStore } from "../store/useAppStore";
import { useEnrichedData } from './useEnrichedData';
import { useTaskModalFormState } from './taskModal/useTaskModalFormState';
import { executeTaskSave } from './taskModal/taskModalSaveService';

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

  return {
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
