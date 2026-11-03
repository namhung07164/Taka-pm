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

          undoManager.push({
            description: `Delete Task: ${t.name}`,
            revert: async () => {
              const { doc } = await import('firebase/firestore');
              const { writeBatch } = await import('../../lib/firestoreWrites');
              const { db, APP_ID } = await import('../../lib/firebase');
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);

              const storeDelegations = useAppStore.getState().delegationGroups || [];
              const relatedDelGroups = storeDelegations.filter(
                (d) => d.parentTaskId === t.id || d.id === `del_${t.id}`
              );
              relatedDelGroups.forEach((d) => {
                revertBatch.set(
                  doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id),
                  d
                );
              });

              revertBatch.commit().catch(console.error);
            },
          });
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

