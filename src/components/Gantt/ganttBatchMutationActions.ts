import React from 'react';
import { Task, Project, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, deleteField } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { recordBatchDeltas, recordDelta } from '../../lib/deltaSyncService';
import { deleteTaskStateUnified, deleteProjectStateUnified, saveTaskStateUnified } from '../../lib/taskStateService';
import { addPendingUpdate, isPermanentWriteError } from '../../lib/syncQueue';
import { calculateParentTaskPredecessorsAndDates } from '../../lib/parentTaskPredecessorService';
import { isTaskBelongToSameParentScope } from '../../lib/parentHierarchyUtils';

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
    const parentIdStr = String(parentTaskId);
    const parentObj = prevTasks.find((t) => String(t.id) === parentIdStr);
    if (!parentObj) return;

    // Strictly filter children belonging to the SAME project, year, store, and projectCode as parentObj
    const validChildren = prevTasks.filter((t) => {
      return childTaskIds.some(cid => String(cid) === String(t.id)) && isTaskBelongToSameParentScope(t, parentObj);
    });

    if (validChildren.length === 0) {
      useAppStore.getState().setToast({
        title: 'Notice',
        message: 'No selected tasks belong to the same project scope as the parent task.'
      });
      return;
    }

    const validChildIdSet = new Set(validChildren.map((t) => String(t.id)));
    const parentCanonicalId = String(parentObj.id);

    // Patch children with parent's ID and inherit missing 4 keys
    const childInheritedPatch = {
      parentTaskId: parentCanonicalId,
      parentId: parentCanonicalId,
      ...(parentObj.projectId ? { projectId: parentObj.projectId } : {}),
      ...(parentObj.projectCode ? { projectCode: parentObj.projectCode } : {}),
      ...(parentObj.projectYear !== undefined ? { projectYear: parentObj.projectYear } : {}),
      ...(parentObj.projectStore ? { projectStore: parentObj.projectStore } : {}),
      updatedAt: now,
    };

    const mapped = prevTasks.map((t) => {
      const tIdStr = String(t.id);
      return validChildIdSet.has(tIdStr)
        ? { ...t, ...childInheritedPatch }
        : t;
    });

    const activeChildren = mapped.filter((t) => String(t.parentTaskId) === parentCanonicalId && String(t.id) !== parentCanonicalId);
    const projects = useAppStore.getState().projects;
    const parentPatch = calculateParentTaskPredecessorsAndDates(parentObj, activeChildren, projects, mapped);
    const finalParentData = { isModularParent: true, ...(parentPatch || {}), updatedAt: now };
    const updatedTasks = mapped.map((t) => (String(t.id) === parentCanonicalId ? { ...t, ...finalParentData } : t));

    useAppStore.getState().setTasks(updatedTasks);
    saveTaskStateUnified(
      updatedTasks.filter((t) => validChildIdSet.has(String(t.id)) || String(t.id) === parentCanonicalId)
    ).catch(() => {});

    setExpandedModularTasks(prev => {
      const nextSet = new Set(prev.map(String));
      nextSet.add(parentCanonicalId);
      return Array.from(nextSet);
    });

    setIsTaskModularModalOpen(false);
    setSelectedTaskIds([]);

    const batch = writeBatch(db);
    validChildren.forEach((child) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', String(child.id));
      batch.set(docRef, childInheritedPatch, { merge: true });
    });
    const parentDocRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentCanonicalId);
    batch.set(parentDocRef, finalParentData, { merge: true });

    try {
      const { localDb } = await import('../../lib/localDb');
      await Promise.all([
        ...validChildren.map(c => (localDb.tasks.update as any)(String(c.id), childInheritedPatch)),
        (localDb.tasks.update as any)(parentCanonicalId, finalParentData)
      ]);
    } catch (e) {
      console.warn('[useGanttBatchOps] Dexie update on group failed:', e);
    }

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = [
        ...validChildren.map(c => ({
          docId: String(c.id),
          collectionName: 'taka_tasks' as const,
          action: 'update' as const,
          isPatch: true,
          data: childInheritedPatch,
          year: parentObj.projectYear ? String(parentObj.projectYear) : (c.projectYear ? String(c.projectYear) : undefined),
        })),
        {
          docId: parentCanonicalId,
          collectionName: 'taka_tasks' as const,
          action: 'update' as const,
          isPatch: true,
          data: finalParentData,
          year: parentObj.projectYear ? String(parentObj.projectYear) : undefined,
        }
      ];
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      useAppStore.getState().setToast({
        title: 'Success',
        message: `Grouped ${validChildren.length} tasks under parent modular task.`
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
    saveTaskStateUnified(updatedTasks.filter((t) => allIdsToUnlink.has(String(t.id)))).catch(() => {});
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

        setSelectedTaskIds([]);
        setSelectedProjectIds([]);

        try {
          if (deletedTaskIds.length > 0) {
            const taskObjsToDelete = currentTasks.filter(t => deletedTaskIds.includes(String(t.id)));
            await deleteTaskStateUnified(taskObjsToDelete.length > 0 ? taskObjsToDelete : deletedTaskIds);
          }

          if (deletedProjectIds.length > 0) {
            const matchedProjects = currentProjects.filter((p) => {
              const pKey = `${p.code || ''}__${p.store || ''}__${p.year || ''}`;
              return (
                (p.id && projSet.has(String(p.id))) ||
                (p.no !== undefined && projSet.has(String(p.no))) ||
                projSet.has(pKey)
              );
            });
            for (const p of matchedProjects) {
              await deleteProjectStateUnified(String(p.id || p.code || p.no), p);
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

