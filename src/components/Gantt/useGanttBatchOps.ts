import React, { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, deleteField } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { recordBatchDeltas, recordDelta } from '../../lib/deltaSyncService';
import { deleteTaskStateUnified } from '../../lib/taskStateService';

interface UseGanttBatchOpsParams {
  tasks: Task[];
  projects: Project[];
  paginatedProjects: Project[];
  currentUser: AppUser;
  getGroupTasksForProject: (p: Project) => Task[];
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void>;
  }>>;
}

export function useGanttBatchOps({
  tasks,
  projects,
  paginatedProjects,
  currentUser,
  getGroupTasksForProject,
  setConfirmModal
}: UseGanttBatchOpsParams) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const lastSelectedTaskIdRef = useRef<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sumMode, setSumMode] = useState<"none" | "duration">("none");
  const [isHighlightDelegationOn, setIsHighlightDelegationOn] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Modular task states
  const [isTaskModularModalOpen, setIsTaskModularModalOpen] = useState(false);
  const [expandedModularTasks, setExpandedModularTasks] = useState<string[]>(() => {
    const saved = safeGetItemSession("taka_gantt_modular_expanded");
    return saved ? JSON.parse(saved) : [];
  });

  const selectedTaskSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectedProjectSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);
  const expandedModularSet = useMemo(() => new Set(expandedModularTasks), [expandedModularTasks]);

  const toggleModularParent = useCallback((taskId: string | number) => {
    const idStr = String(taskId);
    setExpandedModularTasks(prev => {
      const next = prev.includes(idStr) ? prev.filter(id => id !== idStr) : [...prev, idStr];
      safeSetItemSession("taka_gantt_modular_expanded", JSON.stringify(next));
      return next;
    });
  }, []);

  // Hidden rows state
  const [hiddenRows, setHiddenRows] = useState<string[]>(() => {
    const saved = safeGetItemSession("taka_gantt_hidden_rows");
    return saved ? JSON.parse(saved) : [];
  });
  const [isHideMode, setIsHideMode] = useState(false);
  const hiddenRowsSet = useMemo(() => new Set(hiddenRows), [hiddenRows]);

  const toggleHideRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenRows(prev => {
      const next = prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id];
      safeSetItemSession("taka_gantt_hidden_rows", JSON.stringify(next));
      return next;
    });
  };

  const getRowVisibilityClass = (id: string) => {
    return hiddenRowsSet.has(id) ? (isHideMode ? "opacity-30 line-through" : "hidden") : "";
  };

  // Checkbox selection with Shift-range
  const isShiftHeldRef = useRef(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftHeldRef.current = true;
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        setSelectedTaskIds((prev) => (prev.length > 0 ? [] : prev));
        setSelectedProjectIds((prev) => (prev.length > 0 ? [] : prev));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftHeldRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleTaskCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, taskId: string, isShiftClick?: boolean, orderedTaskIds?: string[]) => {
      const isShift = isShiftClick !== undefined
        ? isShiftClick
        : Boolean((e.nativeEvent as MouseEvent)?.shiftKey ?? (e as React.MouseEvent).shiftKey ?? (window.event as any)?.shiftKey ?? isShiftHeldRef.current);
      const isChecked = 'checked' in e.target ? (e.target as HTMLInputElement).checked : true;
      const strTaskId = String(taskId);

      if (isChecked) {
        if (isShift && lastSelectedTaskIdRef.current && lastSelectedTaskIdRef.current !== strTaskId) {
          const currentTasks = useAppStore.getState().tasks;
          const candidateIds = orderedTaskIds && orderedTaskIds.length > 0 
            ? orderedTaskIds.map(String) 
            : currentTasks.map(t => String(t.id));
          let startIdx = candidateIds.indexOf(lastSelectedTaskIdRef.current);
          let endIdx = candidateIds.indexOf(strTaskId);
          let targetList = candidateIds;
          if (startIdx === -1 || endIdx === -1) {
            const allStoreIds = currentTasks.map(t => String(t.id));
            const sIdx = allStoreIds.indexOf(lastSelectedTaskIdRef.current);
            const eIdx = allStoreIds.indexOf(strTaskId);
            if (sIdx !== -1 && eIdx !== -1) {
              startIdx = sIdx;
              endIdx = eIdx;
              targetList = allStoreIds;
            }
          }
          if (startIdx !== -1 && endIdx !== -1) {
            const range = targetList.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
            setSelectedTaskIds(prev => Array.from(new Set([...prev.map(String), ...range])));
          } else {
            setSelectedTaskIds(prev => Array.from(new Set([...prev.map(String), strTaskId])));
          }
        } else {
          setSelectedTaskIds(prev => Array.from(new Set([...prev.map(String), strTaskId])));
        }
        lastSelectedTaskIdRef.current = strTaskId;
      } else {
        if (isShift && lastSelectedTaskIdRef.current && lastSelectedTaskIdRef.current !== strTaskId) {
          const currentTasks = useAppStore.getState().tasks;
          const candidateIds = orderedTaskIds && orderedTaskIds.length > 0 
            ? orderedTaskIds.map(String) 
            : currentTasks.map(t => String(t.id));
          let startIdx = candidateIds.indexOf(lastSelectedTaskIdRef.current);
          let endIdx = candidateIds.indexOf(strTaskId);
          let targetList = candidateIds;
          if (startIdx === -1 || endIdx === -1) {
            const allStoreIds = currentTasks.map(t => String(t.id));
            const sIdx = allStoreIds.indexOf(lastSelectedTaskIdRef.current);
            const eIdx = allStoreIds.indexOf(strTaskId);
            if (sIdx !== -1 && eIdx !== -1) {
              startIdx = sIdx;
              endIdx = eIdx;
              targetList = allStoreIds;
            }
          }
          if (startIdx !== -1 && endIdx !== -1) {
            const rangeSet = new Set(targetList.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1));
            setSelectedTaskIds(prev => prev.map(String).filter(id => !rangeSet.has(id)));
          } else {
            setSelectedTaskIds(prev => prev.map(String).filter(id => id !== strTaskId));
          }
        } else {
          setSelectedTaskIds(prev => prev.map(String).filter(id => id !== strTaskId));
        }
        lastSelectedTaskIdRef.current = strTaskId;
      }
    },
    []
  );

  // Group / Unlink modular tasks
  const handleGroupModularTasks = async (parentTaskId: string, childTaskIds: string[]) => {
    if (!parentTaskId || !childTaskIds || childTaskIds.length === 0) return;

    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;
    const childIdSet = new Set(childTaskIds.map(String));
    const parentIdStr = String(parentTaskId);

    // 0ms Optimistic UI update
    const updatedTasks = prevTasks.map((t) => {
      const tIdStr = String(t.id);
      if (childIdSet.has(tIdStr)) {
        return { ...t, parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now };
      }
      if (tIdStr === parentIdStr) {
        return { ...t, isModularParent: true, updatedAt: now };
      }
      return t;
    });
    useAppStore.getState().setTasks(updatedTasks);

    // Auto-expand the parent task in Gantt view so grouped subtasks appear immediately!
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
    batch.set(parentDocRef, { isModularParent: true, updatedAt: now }, { merge: true });

    // Update Dexie (IndexedDB)
    try {
      const { localDb } = await import('../../lib/localDb');
      await Promise.all([
        ...childTaskIds.map(id => (localDb.tasks.update as any)(String(id), { parentTaskId: parentIdStr, parentId: parentIdStr, updatedAt: now })),
        (localDb.tasks.update as any)(parentIdStr, { isModularParent: true, updatedAt: now })
      ]);
    } catch (e) {
      console.warn('[useGanttBatchOps] Dexie update on group failed:', e);
    }

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = [
        ...childTaskIds.map(id => {
          const t = prevTasks.find(item => String(item.id) === String(id));
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
          data: { isModularParent: true, updatedAt: now },
        }
      ];
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});

      useAppStore.getState().setToast({
        title: "Success",
        message: `Grouped ${childTaskIds.length} tasks under parent modular task.`
      });
    } catch (err) {
      console.error('[handleGroupModularTasks] Batch commit error:', err);
      useAppStore.getState().setTasks(prevTasks);
      useAppStore.getState().setToast({
        title: "Error",
        message: "Failed to group tasks on server. Changes reverted."
      });
    }
  };

  const handleUnlinkModularTasks = async (childTaskIds?: string[]) => {
    const targetIds = childTaskIds && childTaskIds.length > 0 ? childTaskIds : selectedTaskIds;
    if (!targetIds || targetIds.length === 0) return;

    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;
    const targetSet = new Set(targetIds.map(String));

    // Collect all task IDs that need unlinking:
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

    // 0ms Optimistic UI update
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

    // Update Dexie (IndexedDB)
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
        const t = prevTasks.find(item => String(item.id) === String(id));
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
        title: "Success",
        message: `Unlinked ${unlinkedArray.length} modular task(s).`
      });
    } catch (err) {
      console.error('[handleUnlinkModularTasks] Batch commit error:', err);
      useAppStore.getState().setTasks(prevTasks);
      useAppStore.getState().setToast({
        title: "Error",
        message: "Failed to unlink tasks on server. Changes reverted."
      });
    }
  };

  // Batch text color update
  const handleSetTextColor = async (color: string | null) => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    selectedTaskIds.forEach(id => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.update(docRef, { textColor: color, updatedAt: now });
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = selectedTaskIds.map(id => {
        const t = tasks.find(item => item.id === id);
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
        title: "Success",
        message: `Updated text color for ${selectedTaskIds.length} tasks.`
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Batch baseline update
  const handleSetBaselineSelected = async () => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    selectedTaskIds.forEach(id => {
      const t = tasks.find(item => item.id === id);
      if (t && t.start && t.finish) {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(docRef, {
          baselineStart: t.start,
          baselineFinish: t.finish,
          updatedAt: now
        });
      }
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = [];
      selectedTaskIds.forEach(id => {
        const t = tasks.find(item => item.id === id);
        if (t && t.start && t.finish) {
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
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      }
      useAppStore.getState().setToast({
        title: "Success",
        message: `Saved baseline dates for selected tasks.`
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Batch realtime sync toggle
  const handleToggleRealtimeUpdate = async () => {
    const batch = writeBatch(db);
    const now = new Date().toISOString();

    selectedTaskIds.forEach(id => {
      const t = tasks.find(item => item.id === id);
      if (t) {
        const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
        batch.update(docRef, {
          realtimeUpdate: !t.realtimeUpdate,
          updatedAt: now
        });
      }
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = [];
      selectedTaskIds.forEach(id => {
        const t = tasks.find(item => item.id === id);
        if (t) {
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
      if (deltaItems.length > 0) {
        recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
      }
      useAppStore.getState().setToast({
        title: "Success",
        message: `Toggled realtime sync on selected tasks.`
      });
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Pin project
  const handleTogglePin = async (p: Project) => {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id);
    try {
      await writeBatch(db).update(docRef, {
        isPinned: !p.isPinned,
        updatedAt: new Date().toISOString()
      }).commit();
      recordDelta({
        docId: p.id,
        collectionName: 'taka_projects',
        action: 'update',
        isPatch: true,
        data: { isPinned: !p.isPinned, updatedAt: new Date().toISOString() },
        year: p.year ? String(p.year) : undefined,
        updatedBy: currentUser?.email || currentUser?.username,
      }).catch(() => {});
    } catch (err) {
      console.error(err);
    }
  };

  // Batch delete selected tasks/projects
  const handleDeleteSelected = () => {
    const total = selectedTaskIds.length + selectedProjectIds.length;
    if (total === 0) return;

    setConfirmModal({
      isOpen: true,
      title: "Delete Selected Items",
      message: `Are you sure you want to delete ${total} selected item(s)? This action cannot be undone.`,
      onConfirm: async () => {
        const now = new Date().toISOString();
        const currentTasks = useAppStore.getState().tasks;
        const currentProjects = useAppStore.getState().projects;
        const deletedTaskIds = [...selectedTaskIds];
        const deletedProjectIds = [...selectedProjectIds];
        const taskSet = new Set(deletedTaskIds.map(String));
        const projSet = new Set(deletedProjectIds.map(String));

        // If any deleted task is a parent task, unlink its subtasks so they don't break
        const parentCodeSet = new Set<string>();
        currentTasks.forEach(t => {
          if (taskSet.has(String(t.id)) && t.taskCodePhu) {
            parentCodeSet.add(String(t.taskCodePhu).trim().toLowerCase());
          }
        });

        const childrenToUnlink = currentTasks.filter(t => {
          if (taskSet.has(String(t.id))) return false; // will be deleted anyway
          const rawParent = t.parentTaskId || (t as any).parentId;
          if (rawParent) {
            const rawStr = String(rawParent).trim().toLowerCase();
            return taskSet.has(String(rawParent)) || parentCodeSet.has(rawStr);
          }
          return false;
        });

        // 1. Optimistic UI update & atomic task deletion via deleteTaskStateUnified (0ms)
        if (deletedTaskIds.length > 0) {
          const taskObjsToDelete = currentTasks.filter(t => deletedTaskIds.includes(String(t.id)));
          deleteTaskStateUnified(taskObjsToDelete.length > 0 ? taskObjsToDelete : deletedTaskIds).catch(() => {});
        }

        if (deletedProjectIds.length > 0) {
          const remainingProjects = useAppStore.getState().projects.filter(p => 
            !projSet.has(String(p.id)) && !projSet.has(String(p.no))
          );
          useAppStore.getState().setProjects(remainingProjects);
          try {
            const { localDb } = await import('../../lib/localDb');
            await localDb.projects.bulkDelete(deletedProjectIds);
          } catch (e) {}
        }

        setSelectedTaskIds([]);
        setSelectedProjectIds([]);

        // 2. Commit project deletions to Firestore (task deletions & child unlinks are already committed by deleteTaskStateUnified)
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
                data: null
              };
            });
            if (deltaItems.length > 0) {
              recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});
            }
          }

          useAppStore.getState().setToast({
            title: "Success",
            message: `Deleted ${total} item(s).`
          });
        } catch (err) {
          console.error(err);
          useAppStore.getState().setToast({
            title: "Error",
            message: "Failed to delete item(s) on server."
          });
        }
      }
    });
  };

  // Computed sum duration
  const computedSum = useMemo(() => {
    if (sumMode !== 'duration') return null;
    let sum = 0;
    selectedTaskIds.forEach(id => {
      const t = tasks.find(item => item.id === id);
      if (t && t.duration) {
        sum += Number(t.duration) || 0;
      }
    });
    return sum;
  }, [sumMode, selectedTaskIds, tasks]);

  const isAllSelected = useMemo(() => {
    if (paginatedProjects.length === 0) return false;
    return paginatedProjects.every(p => {
      const pTasks = getGroupTasksForProject(p);
      return pTasks.length > 0 && pTasks.every(t => selectedTaskSet.has(t.id));
    });
  }, [paginatedProjects, getGroupTasksForProject, selectedTaskSet]);

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedTaskIds([]);
      setSelectedProjectIds([]);
    } else {
      const allIds: string[] = [];
      const projIds: string[] = [];
      paginatedProjects.forEach(p => {
        projIds.push(p.id || p.code);
        const pTasks = getGroupTasksForProject(p);
        pTasks.forEach(t => allIds.push(t.id));
      });
      setSelectedTaskIds(allIds);
      setSelectedProjectIds(projIds);
    }
  }, [isAllSelected, paginatedProjects, getGroupTasksForProject]);

  return {
    selectedTaskIds,
    setSelectedTaskIds,
    selectedProjectIds,
    setSelectedProjectIds,
    selectedTaskSet,
    selectedProjectSet,
    isAllSelected,
    handleToggleSelectAll,
    handleTaskCheckboxChange,
    handleDeleteSelected,
    handleSetTextColor,
    handleSetBaselineSelected,
    handleToggleRealtimeUpdate,
    handleTogglePin,
    handleGroupModularTasks,
    handleUnlinkModularTasks,
    isTaskModularModalOpen,
    setIsTaskModularModalOpen,
    expandedModularTasks,
    setExpandedModularTasks,
    expandedModularSet,
    toggleModularParent,
    sumMode,
    setSumMode,
    computedSum,
    isHighlightDelegationOn,
    setIsHighlightDelegationOn,
    isEditMode,
    setIsEditMode,
    isHideMode,
    setIsHideMode,
    hiddenRows,
    setHiddenRows,
    hiddenRowsSet,
    toggleHideRow,
    getRowVisibilityClass
  };
}
