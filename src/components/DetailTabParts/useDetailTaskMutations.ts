import React from 'react';
import { Project, Task, DelegationGroup, AppUser, TaskNote } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { undoManager } from '../../lib/undoManager';
import { deleteTaskStateUnified } from '../../lib/taskStateService';
import { executeUnifiedTaskUpdate, ExecuteUnifiedTaskUpdateOptions } from '../../lib/taskInlineUpdateService';

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
          await deleteTaskStateUnified([t]);
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const handleUpdateTask = async (
    t: Task,
    updates: Partial<Task>,
    options?: ExecuteUnifiedTaskUpdateOptions
  ) => {
    await executeUnifiedTaskUpdate(t, updates, currentUser, options);
  };

  const handleSaveNotes = async (taskId: string, notes: TaskNote[]) => {
    const liveTasks = useAppStore.getState().tasks || tasks;
    const t = liveTasks.find((item) => item.id === taskId);
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

