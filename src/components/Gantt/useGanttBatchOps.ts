import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { createGanttBatchMutationActions } from './ganttBatchMutationActions';

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
  paginatedProjects,
  currentUser,
  getGroupTasksForProject,
  setConfirmModal
}: UseGanttBatchOpsParams) {
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const lastSelectedTaskIdRef = useRef<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sumMode, setSumMode] = useState<'none' | 'duration'>('none');
  const [isHighlightDelegationOn, setIsHighlightDelegationOn] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Modular task states
  const [isTaskModularModalOpen, setIsTaskModularModalOpen] = useState(false);
  const [expandedModularTasks, setExpandedModularTasks] = useState<string[]>(() => {
    const saved = safeGetItemSession('taka_gantt_modular_expanded');
    return saved ? JSON.parse(saved) : [];
  });

  const selectedTaskSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectedProjectSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);
  const expandedModularSet = useMemo(() => {
    const set = new Set<string>();
    expandedModularTasks.forEach(id => {
      const s = String(id).trim();
      set.add(s);
      set.add(s.toLowerCase());
    });
    return set;
  }, [expandedModularTasks]);

  // O(1) Pre-indexed Task Map (Rule 7)
  const taskByIdMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (let i = 0; i < tasks.length; i++) {
      map.set(String(tasks[i].id), tasks[i]);
    }
    return map;
  }, [tasks]);

  const toggleModularParent = useCallback((taskId: string | number) => {
    const idStr = String(taskId).trim();
    if (!idStr) return;

    const targetTask = taskByIdMap.get(idStr) || tasks.find(
      (t) => String(t.id) === idStr || (t.taskCodePhu && String(t.taskCodePhu).trim().toLowerCase() === idStr.toLowerCase())
    );

    const aliases = new Set<string>([idStr, idStr.toLowerCase()]);
    if (targetTask) {
      if (targetTask.id) {
        aliases.add(String(targetTask.id).trim());
        aliases.add(String(targetTask.id).trim().toLowerCase());
      }
      if (targetTask.taskCodePhu) {
        aliases.add(String(targetTask.taskCodePhu).trim());
        aliases.add(String(targetTask.taskCodePhu).trim().toLowerCase());
      }
    }

    setExpandedModularTasks(prev => {
      const isCurrentlyExpanded = prev.some(id => aliases.has(String(id).trim()) || aliases.has(String(id).trim().toLowerCase()));
      let next: string[];
      if (isCurrentlyExpanded) {
        next = prev.filter(id => !aliases.has(String(id).trim()) && !aliases.has(String(id).trim().toLowerCase()));
      } else {
        const canonicalId = targetTask?.id ? String(targetTask.id).trim() : idStr;
        const cleaned = prev.filter(id => !aliases.has(String(id).trim()) && !aliases.has(String(id).trim().toLowerCase()));
        next = [...cleaned, canonicalId];
      }
      safeSetItemSession('taka_gantt_modular_expanded', JSON.stringify(next));
      return next;
    });
  }, [taskByIdMap, tasks]);

  // Hidden rows state
  const [hiddenRows, setHiddenRows] = useState<string[]>(() => {
    const saved = safeGetItemSession('taka_gantt_hidden_rows');
    return saved ? JSON.parse(saved) : [];
  });
  const [isHideMode, setIsHideMode] = useState(false);
  const hiddenRowsSet = useMemo(() => new Set(hiddenRows), [hiddenRows]);

  const toggleHideRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenRows(prev => {
      const next = prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id];
      safeSetItemSession('taka_gantt_hidden_rows', JSON.stringify(next));
      return next;
    });
  };

  const getRowVisibilityClass = (id: string) => {
    return hiddenRowsSet.has(id) ? (isHideMode ? 'opacity-30 line-through' : 'hidden') : '';
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

      const resolveRange = () => {
        const currentTasks = useAppStore.getState().tasks;
        const candidateIds = orderedTaskIds && orderedTaskIds.length > 0
          ? orderedTaskIds.map(String)
          : currentTasks.map(t => String(t.id));
        let startIdx = candidateIds.indexOf(lastSelectedTaskIdRef.current!);
        let endIdx = candidateIds.indexOf(strTaskId);
        let targetList = candidateIds;
        if (startIdx === -1 || endIdx === -1) {
          const allStoreIds = currentTasks.map(t => String(t.id));
          const sIdx = allStoreIds.indexOf(lastSelectedTaskIdRef.current!);
          const eIdx = allStoreIds.indexOf(strTaskId);
          if (sIdx !== -1 && eIdx !== -1) {
            startIdx = sIdx;
            endIdx = eIdx;
            targetList = allStoreIds;
          }
        }
        if (startIdx !== -1 && endIdx !== -1) {
          return targetList.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1);
        }
        return null;
      };

      if (isChecked) {
        if (isShift && lastSelectedTaskIdRef.current && lastSelectedTaskIdRef.current !== strTaskId) {
          const range = resolveRange();
          if (range) {
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
          const range = resolveRange();
          if (range) {
            const rangeSet = new Set(range);
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

  const {
    handleGroupModularTasks,
    handleUnlinkModularTasks,
    handleSetTextColor,
    handleSetBaselineSelected,
    handleToggleRealtimeUpdate,
    handleTogglePin,
    handleDeleteSelected,
  } = createGanttBatchMutationActions({
    selectedTaskIds,
    selectedProjectIds,
    currentUser,
    taskByIdMap,
    setSelectedTaskIds,
    setSelectedProjectIds,
    setIsTaskModularModalOpen,
    setExpandedModularTasks,
    setConfirmModal,
  });

  // O(1) Computed sum duration
  const computedSum = useMemo(() => {
    if (sumMode !== 'duration') return null;
    let sum = 0;
    for (let i = 0; i < selectedTaskIds.length; i++) {
      const t = taskByIdMap.get(String(selectedTaskIds[i]));
      if (t && t.duration) {
        sum += Number(t.duration) || 0;
      }
    }
    return sum;
  }, [sumMode, selectedTaskIds, taskByIdMap]);

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
