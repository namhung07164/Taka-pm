import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Task, Project, AppUser, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc, writeBatch, deleteField } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { recordBatchDeltas, recordDelta } from '../../lib/deltaSyncService';

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

  const visualTasksList = useMemo(() => {
    if (!paginatedProjects || !getGroupTasksForProject) return tasks;
    return paginatedProjects.flatMap(p => getGroupTasksForProject(p) || []);
  }, [paginatedProjects, getGroupTasksForProject, tasks]);

  // Checkbox selection with Shift-range
  const handleTaskCheckboxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement> | React.MouseEvent, taskId: string) => {
      const nativeEv = (e.nativeEvent || e) as any;
      const isShift = Boolean(
        nativeEv?.shiftKey || 
        (e as any).shiftKey || 
        (e.target as any)?._shiftKey || 
        (window.event as any)?.shiftKey
      );
      const target = (e.target || e.currentTarget) as HTMLInputElement;
      const isChecked = target ? Boolean(target.checked) : !selectedTaskSet.has(taskId);

      if (isChecked) {
        if (isShift && lastSelectedTaskIdRef.current && lastSelectedTaskIdRef.current !== taskId) {
          const orderedIds = (visualTasksList.length > 0 ? visualTasksList : tasks).map(t => t.id);
          const startIdx = orderedIds.indexOf(lastSelectedTaskIdRef.current);
          const endIdx = orderedIds.indexOf(taskId);
          if (startIdx !== -1 && endIdx !== -1) {
            const range = orderedIds.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
            setSelectedTaskIds(prev => Array.from(new Set([...prev, ...range])));
          } else {
            setSelectedTaskIds(prev => Array.from(new Set([...prev, taskId])));
          }
        } else {
          setSelectedTaskIds(prev => Array.from(new Set([...prev, taskId])));
        }
        lastSelectedTaskIdRef.current = taskId;
      } else {
        setSelectedTaskIds(prev => prev.filter(id => id !== taskId));
      }
    },
    [visualTasksList, tasks, selectedTaskSet]
  );

  // Group / Unlink modular tasks
  const handleGroupModularTasks = async (parentTaskId: string, childTaskIds: string[]) => {
    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;

    // 0ms Optimistic UI update
    const updatedTasks = prevTasks.map((t) =>
      childTaskIds.includes(t.id)
        ? { ...t, parentTaskId, parentId: parentTaskId, updatedAt: now }
        : t
    );
    useAppStore.getState().setTasks(updatedTasks);
    setIsTaskModularModalOpen(false);
    setSelectedTaskIds([]);

    const batch = writeBatch(db);
    childTaskIds.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.update(docRef, { parentTaskId, parentId: parentTaskId, updatedAt: now });
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = childTaskIds.map(id => {
        const t = prevTasks.find(item => item.id === id);
        return {
          docId: id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: { parentTaskId, parentId: parentTaskId, updatedAt: now },
          year: t?.projectYear ? String(t.projectYear) : undefined,
        };
      });
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});

      useAppStore.getState().setToast({
        title: "Success",
        message: `Grouped ${childTaskIds.length} tasks under parent modular task.`
      });
    } catch (err) {
      console.error(err);
      useAppStore.getState().setTasks(prevTasks);
      useAppStore.getState().setToast({
        title: "Error",
        message: "Failed to group tasks on server. Changes reverted."
      });
    }
  };

  const handleUnlinkModularTasks = async (childTaskIds: string[]) => {
    const now = new Date().toISOString();
    const prevTasks = useAppStore.getState().tasks;

    // 0ms Optimistic UI update
    const updatedTasks = prevTasks.map((t) =>
      childTaskIds.includes(t.id)
        ? { ...t, parentTaskId: undefined, parentId: undefined, updatedAt: now }
        : t
    );
    useAppStore.getState().setTasks(updatedTasks);
    setSelectedTaskIds([]);

    const batch = writeBatch(db);
    childTaskIds.forEach((id) => {
      const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
      batch.update(docRef, { parentTaskId: deleteField(), parentId: null, updatedAt: now });
    });

    try {
      await batch.commit();
      const deltaItems: TakaDeltaItem[] = childTaskIds.map(id => {
        const t = prevTasks.find(item => item.id === id);
        return {
          docId: id,
          collectionName: 'taka_tasks',
          action: 'update',
          isPatch: true,
          data: { parentTaskId: null, parentId: null, updatedAt: now },
          year: t?.projectYear ? String(t.projectYear) : undefined,
        };
      });
      recordBatchDeltas(deltaItems, currentUser?.email || currentUser?.username).catch(() => {});

      useAppStore.getState().setToast({
        title: "Success",
        message: `Unlinked ${childTaskIds.length} modular tasks.`
      });
    } catch (err) {
      console.error(err);
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
        const batch = writeBatch(db);
        selectedTaskIds.forEach(id => {
          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id);
          batch.delete(docRef);
        });
        selectedProjectIds.forEach(id => {
          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id);
          batch.delete(docRef);
        });

        try {
          await batch.commit();
          setSelectedTaskIds([]);
          setSelectedProjectIds([]);
          useAppStore.getState().setToast({
            title: "Success",
            message: `Deleted ${total} item(s).`
          });
        } catch (err) {
          console.error(err);
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
