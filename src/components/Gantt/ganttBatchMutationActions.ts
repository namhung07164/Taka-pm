import React from 'react';
import { Task, Project, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, deleteField } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { recordBatchDeltas, recordDelta } from '../../lib/deltaSyncService';
import { deleteTaskStateUnified } from '../../lib/taskStateService';
import { extractStorageUrls, deleteStorageFiles } from '../../lib/storageUtils';
import { addPendingUpdate, isPermanentWriteError } from '../../lib/syncQueue';
import { calculateParentTaskPredecessorsAndDates } from '../../lib/parentTaskPredecessorService';

export interface GanttBatchMutationContext {
  selectedTaskIds: string[];
  selectedProjectIds: string[];
  currentUser: AppUser;
  taskByIdMap: Map<string, Task>;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedProjectIds: React.Dispatch<React.SetStateAction<string[]>>;
  setIsTaskModularModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setExpandedModularTasks: React.Dispatch<React.SetStateAction<string[]>>;
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>>;
}

export function createGanttBatchMutationActions(ctx: GanttBatchMutationContext) {
  const {
    selectedTaskIds,
    selectedProjectIds,
    currentUser,
    taskByIdMap,
    setSelectedTaskIds,
    setSelectedProjectIds,
    setIsTaskModularModalOpen,
    setExpandedModularTasks,
    setConfirmModal,
  } = ctx;

  const handleGroupModularTasks = async (parentTaskId: string, childTaskIds: string[]) => {
    if (!parentTaskId || !childTaskIds || childTaskIds.length === 0) return;

    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;
    const childIdSet = new Set(childTaskIds.map(String));
    const parentIdStr = String(parentTaskId);

    const mapped = prevTasks.map((t) => {
      const tIdStr = String(t.id);
      return childIdSet.has(tIdStr)
        ? { ...t, parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now }
        : t;
    });

    const parentObj = mapped.find((t) => String(t.id) === parentIdStr);
    const children = mapped.filter((t) => String(t.parentTaskId) === parentIdStr && String(t.id) !== parentIdStr);
    const projects = useAppStore.getState().projects;
    const parentPatch = parentObj ? calculateParentTaskPredecessorsAndDates(parentObj, children, projects, mapped) : null;
    const finalParentData = { isModularParent: true, ...(parentPatch || {}), updatedAt: now };
    const updatedTasks = mapped.map((t) => (String(t.id) === parentIdStr ? { ...t, ...finalParentData } : t));

    useAppStore.getState().setTasks(updatedTasks);

    setExpandedModularTasks(prev => {
      const nextSet = new Set(prev.map(String));
      nextSet.add(parentIdStr);
      return Array.from(nextSet);
    });

    setIsTaskModularModalOpen(false);
    setSelectedTaskIds([]);

    const batch = writeBatch(db);
    childTaskIds.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', String(id));
      batch.set(docRef, { parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now }, { merge: true });
    });
    const parentDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentIdStr);
    batch.set(parentDocRef, finalParentData, { merge: true });

    try {
      const { localDb } = await import('../../lib/localDb');
      await Promise.all([
        ...childTaskIds.map(id => (localDb.tasks.update as any)(String(id), { parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now })),
        (localDb.tasks.update as any)(parentIdStr, finalParentData)
      ]);
    } catch (e) {
      console.warn('[useGanttBatchOps] Dexie update on group failed:', e);
    }

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = [
        ...childTaskIds.map(id => {
          const t = taskByIdMap.get(String(id));
          return {
            docId: String(id),
            collectionName: 'taka_tasks' as const,
            action: 'update' as const,
            isPatch: true,
            data: { parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now },
            year: t?.projectYear ? String(t.projectYear) : undefined,
          };
        }),
        {
          docId: parentIdStr,
          collectionName: 'taka_tasks' as const,
          action: 'update' as const,
          isPatch: true,
          data: finalParentData,
        }
      ];
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      useAppStore.getState().setToast({
        title: 'Success',
        message: `Grouped ${childTaskIds.length} tasks under parent modular task.`
      });
    } catch (err) {
      console.error('[handleGroupModularTasks] Batch commit error:', err);
      useAppStore.getState().setTasks(prevTasks);
      useAppStore.getState().setToast({
        title: 'Error',
        message: 'Failed to group tasks on server. Changes reverted.'
      });
    }
  };

  const handleUnlinkModularTasks = async (childTaskIds?: string[]) => {
    const targetIds = childTaskIds && childTaskIds.length > 0 ? childTaskIds : selectedTaskIds;
    if (!targetIds || targetIds.length === 0) return;

    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;
    const targetSet = new Set(targetIds.map(String));

    const parentCodeSet = new Set<string>();
    prevTasks.forEach(t => {
      if (targetSet.has(String(t.id)) && t.taskCodePhu) {
        parentCodeSet.add(String(t.taskCodePhu).trim().toLowerCase());
      }
    });

    const allIdsToUnlink = new Set<string>();
    targetIds.forEach(id => allIdsToUnlink.add(String(id)));
    prevTasks.forEach(t => {
      const rawParent = t.parentTaskId || (t as any).parentId;
      if (rawParent) {
        const rawStr = String(rawParent).trim().toLowerCase();
        if (targetSet.has(String(rawParent)) || parentCodeSet.has(rawStr)) {
          allIdsToUnlink.add(String(t.id));
        }
      }
    });

    const unlinkedArray = Array.from(allIdsToUnlink);

    const updatedTasks = prevTasks.map((t) => {
      if (!allIdsToUnlink.has(String(t.id))) return t;
      const copy: any = { ...t, parentTaskId: undefined, parentId: undefined, updatedAt: now };
      delete copy.parentTask;
      delete copy.parentTaskCode;
      delete copy.parentCode;
      return copy as Task;
    });
    useAppStore.getState().setTasks(updatedTasks);
    setIsTaskModularModalOpen(false);
    setSelectedTaskIds([]);

    const batch = writeBatch(db);
    unlinkedArray.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', String(id));
      batch.set(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now }, { merge: true });
    });

    try {
      const { localDb } = await import('../../lib/localDb');
      await Promise.all(
        unlinkedArray.map(id => (localDb.tasks.update as any)(String(id), { parentTaskId: null, parentId: null, updatedAt: now }))
      );
    } catch (e) {
      console.warn('[useGanttBatchOps] Dexie update on unlink failed:', e);
    }

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = unlinkedArray.map(id => {
        const t = taskByIdMap.get(String(id));
        return {
          docId: String(id),
          collectionName: 'taka_tasks' as const,
          action: 'update' as const,
          isPatch: true,
          data: { parentTaskId: null, parentId: null, updatedAt: now },
          year: t?.projectYear ? String(t.projectYear) : undefined,
        };
      });
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      }
      useAppStore.getState().setToast({
        title: 'Success',
        message: `Unlinked ${unlinkedArray.length} modular task(s).`
      });
    } catch (err) {
      console.error('[handleUnlinkModularTasks] Batch commit error:', err);
      useAppStore.getState().setTasks(prevTasks);
      useAppStore.getState().setToast({
        title: 'Error',
        message: 'Failed to unlink tasks on server. Changes reverted.'
      });
    }
  };

  const handleSetTextColor = async (color: string | null) => {
    if (selectedTaskIds.length === 0) return;
    const now = new Date().toISOString();
    const selSet = new Set(selectedTaskIds.map(String));

    // 0ms Optimistic UI update (Rule 2)
    const prevTasks = useAppStore.getState().tasks;
    useAppStore.getState().setTasks(
      prevTasks.map(t => (selSet.has(String(t.id)) ? { ...t, textColor: color || undefined, updatedAt: now } : t))
    );

    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.update(docRef, { textColor: color, updatedAt: now });
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = selectedTaskIds.map(id => {
        const t = taskByIdMap.get(String(id));
        return {
          docId: id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: { textColor: color, updatedAt: now },
          year: t?.projectYear ? String(t.projectYear) : undefined,
        };
      });
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      useAppStore.getState().setToast({
        title: 'Success',
        message: `Updated text color for ${selectedTaskIds.length} tasks.`
      });
    } catch (err) {
      console.error(err);
      if (!isPermanentWriteError(err)) {
        selectedTaskIds.forEach(id => {
          addPendingUpdate({
            collectionPath: `artifacts/${APP_ID}/public/data/taka_tasks`,
            action: 'update',
            docId: id,
            data: { textColor: color, updatedAt: now },
          }).catch(() => {});
        });
      }
    }
  };

  const handleSetBaselineSelected = async () => {
    if (selectedTaskIds.length === 0) return;
    const now = new Date().toISOString();
    const selSet = new Set(selectedTaskIds.map(String));

    // 0ms Optimistic UI update (Rule 2)
    const prevTasks = useAppStore.getState().tasks;
    useAppStore.getState().setTasks(
      prevTasks.map(t =>
        selSet.has(String(t.id)) && t.start && t.finish
          ? { ...t, baselineStart: t.start, baselineFinish: t.finish, updatedAt: now }
          : t
      )
    );

    const batch = writeBatch(db);
    const deltaItems: TakaDeltaItem[] = [];

    selectedTaskIds.forEach(id => {
      const t = taskByIdMap.get(String(id));
      if (t && t.start && t.finish) {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(docRef, {
          baselineStart: t.start,
          baselineFinish: t.finish,
          updatedAt: now
        });
        deltaItems.push({
          docId: id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: { baselineStart: t.start, baselineFinish: t.finish, updatedAt: now },
          year: t.projectYear ? String(t.projectYear) : undefined,
        });
      }
    });

    try {
      await batch.commit();
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      }
      useAppStore.getState().setToast({
        title: 'Success',
        message: 'Saved baseline dates for selected tasks.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleRealtimeUpdate = async () => {
    if (selectedTaskIds.length === 0) return;
    const now = new Date().toISOString();
    const selSet = new Set(selectedTaskIds.map(String));

    // 0ms Optimistic UI update (Rule 2)
    const prevTasks = useAppStore.getState().tasks;
    useAppStore.getState().setTasks(
      prevTasks.map(t =>
        selSet.has(String(t.id)) ? { ...t, realtimeUpdate: !t.realtimeUpdate, updatedAt: now } : t
      )
    );

    const batch = writeBatch(db);
    const deltaItems: TakaDeltaItem[] = [];

    selectedTaskIds.forEach(id => {
      const t = taskByIdMap.get(String(id));
      if (t) {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(docRef, {
          realtimeUpdate: !t.realtimeUpdate,
          updatedAt: now
        });
        deltaItems.push({
          docId: id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: { realtimeUpdate: !t.realtimeUpdate, updatedAt: now },
          year: t.projectYear ? String(t.projectYear) : undefined,
        });
      }
    });

    try {
      await batch.commit();
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      }
      useAppStore.getState().setToast({
        title: 'Success',
        message: 'Toggled realtime sync on selected tasks.'
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleTogglePin = async (p: Project) => {
    const now = new Date().toISOString();
    const nextPin = !p.isPinned;

    // 0ms Optimistic UI update (Rule 2)
    const prevProjects = useAppStore.getState().projects;
    useAppStore.getState().setProjects(
      prevProjects.map(item => (item.id === p.id ? { ...item, isPinned: nextPin, updatedAt: now } : item))
    );

    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id);
    try {
      await writeBatch(db).update(docRef, { isPinned: nextPin, updatedAt: now }).commit();
      recordDelta({
        docId: p.id,
        collectionName: 'taka_projects',
        action: 'update',
        isPatch: true,
        data: { isPinned: nextPin, updatedAt: now },
        year: p.year ? String(p.year) : undefined,
        updatedBy: currentUser?.email || currentUser?.username,
      }).catch(() => {});
    } catch (err) {
      console.error(err);
      if (!isPermanentWriteError(err)) {
        addPendingUpdate({
          collectionPath: `artifacts/${APP_ID}/public/data/taka_projects`,
          action: 'update',
          docId: p.id,
          data: { isPinned: nextPin, updatedAt: now },
        }).catch(() => {});
      }
    }
  };

  const handleDeleteSelected = () => {
    const total = selectedTaskIds.length + selectedProjectIds.length;
    if (total === 0) return;

    setConfirmModal({
      isOpen: true,
      title: 'Delete Selected Items',
      message: `Are you sure you want to delete ${total} selected item(s)? This action cannot be undone.`,
      onConfirm: async () => {
        const currentTasks = useAppStore.getState().tasks;
        const currentProjects = useAppStore.getState().projects;
        const deletedTaskIds = [...selectedTaskIds];
        const deletedProjectIds = [...selectedProjectIds];
        const projSet = new Set(deletedProjectIds.map(String));

        if (deletedTaskIds.length > 0) {
          const taskObjsToDelete = currentTasks.filter(t => deletedTaskIds.includes(String(t.id)));
          deleteTaskStateUnified(taskObjsToDelete.length > 0 ? taskObjsToDelete : deletedTaskIds).catch(() => {});
        }

        if (deletedProjectIds.length > 0) {
          const deletedProjectsObjs = currentProjects.filter(
            p => projSet.has(String(p.id)) || projSet.has(String(p.no))
          );
          // Storage Deep Clean (Rule 4)
          deletedProjectsObjs.forEach(p => {
            const urls = extractStorageUrls(p);
            if (urls.length > 0) deleteStorageFiles(urls).catch(() => {});
          });

          const remainingProjects = currentProjects.filter(
            p => !projSet.has(String(p.id)) && !projSet.has(String(p.no))
          );
          useAppStore.getState().setProjects(remainingProjects);
          try {
            const { localDb } = await import('../../lib/localDb');
            await localDb.projects.bulkDelete(deletedProjectIds);
          } catch {}
        }

        setSelectedTaskIds([]);
        setSelectedProjectIds([]);

        try {
          if (deletedProjectIds.length > 0) {
            const batch = writeBatch(db);
            deletedProjectIds.forEach(id => {
              const p = currentProjects.find(item => String(item.id) === id || String(item.no) === id);
              const docId = p?.id ? String(p.id) : id;
              const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
              batch.delete(docRef);
            });
            await batch.commit();

            const deltaItems: TakaDeltaItem[] = deletedProjectIds.map(id => {
              const p = currentProjects.find(item => String(item.id) === id || String(item.no) === id);
              const docId = p?.id ? String(p.id) : id;
              return {
                docId,
                collectionName: 'taka_projects' as const,
                action: 'delete' as const,
                isPatch: false,
                data: null,
              };
            });
            if (deltaItems.length > 0) {
              recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
            }
          }

          useAppStore.getState().setToast({
            title: 'Success',
            message: `Deleted ${total} item(s).`
          });
        } catch (err) {
          console.error(err);
          useAppStore.getState().setToast({
            title: 'Error',
            message: 'Failed to delete item(s) on server.'
          });
        }
      }
    });
  };

  return {
    handleGroupModularTasks,
    handleUnlinkModularTasks,
    handleSetTextColor,
    handleSetBaselineSelected,
    handleToggleRealtimeUpdate,
    handleTogglePin,
    handleDeleteSelected,
  };
}
