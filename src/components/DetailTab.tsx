import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";

import { useEnrichedData } from '../hooks/useEnrichedData';
import { Search, Plus, Trash2, ChevronRight, ChevronDown, ChevronUp, FolderOutput, Pin, Play, Download, Upload, FileText, Edit3, MessageSquare, ArrowDownUp, Printer, EyeOff, X, GripVertical, ArrowLeft, Maximize2 } from 'lucide-react';
import { Project, Task, AppUser, TaskNote, PermissionMatrix, AppRole, DelegationGroup } from '../types';
import { cn, formatDisplayDateMain, formatDisplayDateTime, calculateDays, parseDateTime, formatToDatetimeLocal, getStatus, getTaskStatus, getDefaultDatetimeLocal, resolveActualStatus, getDefaultStoreFilter, computeActProgressPercent, computePlanProgressPercent, generateId, getUserAllowedStores, getEffectiveStoreFilter, scrollToElement } from '../lib/utils';
import { doc, collection, query, where, getDocs } from 'firebase/firestore';
import {    db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { undoManager } from '../lib/undoManager';
import { downloadCSV, parseCSV, generateCSV } from '../lib/csvUtils';
import { ConfirmModal } from './ConfirmModal';
import { TaskNoteModal } from './TaskNoteModal';
import { ResizableHeader } from './ResizableHeader';
import { ColumnAdder } from './ColumnAdder';
import { FullReplaceImport } from './FullReplaceImport';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { scheduleDependentTasks, buildTaskNoMap, sortGroupTasks, parsePredecessors, reorderAndCalculateTasks, calculateTaskDatesFromPredecessors, splitPredecessors, updatePredecessorsStrings, computeTaskCode, getProjectCodeChangePredecessorUpdates, normalizeAndHealTaskPredecessors, healAllTasksPredecessors } from '../lib/ganttUtils';
import { syncProjectDatesByCode, backfillMissingProjectDates } from '../lib/projectDatesService';
import { QRCodeButton } from './QRCodeButton';
import { safeGetItemSession, safeSetItemSession } from '../lib/storage';
import { PredecessorMultiInput } from "./PredecessorMultiInput";
import { EditableCell } from './DetailTabParts/EditableCell';
import { PredecessorEditableCell } from './DetailTabParts/PredecessorEditableCell';
import { FastToggle } from './DetailTabParts/FastToggle';

interface DetailTabProps {
  initialFilterCode?: string;
  initialStoreFilter?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  onAddProject: () => void;
  onAddTask: (p?: Project | null) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onNavigateToDelegation?: (groupId: string, sourceTaskId?: string) => void;
}

const AVAILABLE_COLUMNS = [
  { id: 'no', label: 'No' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'location', label: 'Location' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'taskName', label: 'Task Name' },
  { id: 'duration', label: 'Duration' },
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Finish' },
  { id: 'predecessor', label: 'Predecessor' },
  { id: 'party', label: 'Party' },
  { id: 'action', label: 'Action' }
];
export function DetailTab({
  initialFilterCode,
  initialFocusTaskId,
  onClearFocus,
  onBackToGantt,
  onAddProject,
  onAddTask,
  onEditTask,
  onEditProject,
  onNavigateToDelegation
}: DetailTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const costs = useAppStore(state => state.costs);
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);

  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);

  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession("taka_detail_status_filter", statusFilter);
      }
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days';
      setStatusFilter(restored);
      wasSearchingRef.current = false;
    }
  }, [searchTerm]);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
  const expandedCodes = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);
  const setExpandedCodes = useAppStore(state => state.setExpandedProjectIds);
  const setVisibleActiveProjectIds = useAppStore(state => state.setVisibleActiveProjectIds);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);

  useEffect(() => {
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
  }, [isTasksRequested, setIsTasksRequested]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastCheckedTaskIdRef = React.useRef<string | null>(null);
  const lastFocusedTaskIdRef = React.useRef<string | null>(null);
  const lastProcessedFilterCodeRef = React.useRef<string | null>(null);
  const [activeProjectInView, setActiveProjectInView] = useState<Project | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [draggingTaskIds, setDraggingTaskIds] = useState<string[]>([]);

  // Smart Viewport Project Tracking using IntersectionObserver (zero scroll lag, off-main-thread layout engine)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    // Track intersection ratios / bounding tops of observed project rows
    const visibleEntriesMap = new Map<Element, IntersectionObserverEntry>();

    const updateActiveProject = () => {
      let topProjectEl: Element | null = null;
      let minTop = Infinity;

      // Find visible project row closest to the top offset (or most visible)
      visibleEntriesMap.forEach((entry, el) => {
        if (entry.isIntersecting) {
          const top = entry.boundingClientRect.top;
          if (top >= 0 && top < minTop) {
            minTop = top;
            topProjectEl = el;
          } else if (topProjectEl === null) {
            topProjectEl = el;
          }
        }
      });

      if (topProjectEl) {
        const code = (topProjectEl as HTMLElement).getAttribute('data-project-code');
        const year = (topProjectEl as HTMLElement).getAttribute('data-project-year');
        const store = (topProjectEl as HTMLElement).getAttribute('data-project-store');
        if (code) {
          const found = projects.find(
            (p) =>
              p.code === code &&
              (String(p.year || '') === String(year || '') || (!p.year && !year)) &&
              (String(p.store || '') === String(store || '') || (!p.store && !store))
          );
          if (found) {
            setActiveProjectInView((prev) => {
              if (
                prev &&
                prev.code === found.code &&
                String(prev.year || '') === String(found.year || '') &&
                String(prev.store || '') === String(found.store || '')
              ) {
                return prev;
              }
              return found;
            });
          }
        }
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleEntriesMap.set(entry.target, entry);
          } else {
            visibleEntriesMap.delete(entry.target);
          }
        });
        updateActiveProject();
      },
      {
        root: null,
        // RootMargin shifts active viewport area so project entering top 100px-500px triggers active state
        rootMargin: '-60px 0px -40% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    const projectElements = document.querySelectorAll<HTMLElement>('[data-project-item="true"]');
    projectElements.forEach((el) => observer.observe(el));

    // Also observe newly rendered items if DOM updates
    const mutationObserver = new MutationObserver(() => {
      const currentElements = document.querySelectorAll<HTMLElement>('[data-project-item="true"]');
      currentElements.forEach((el) => observer.observe(el));
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
      visibleEntriesMap.clear();
    };
  }, [projects]);

  useEffect(() => {
    return () => {
      setSearchTerm('');
      lastFocusedTaskIdRef.current = null;
    };
  }, []);

  const handleClearFocus = React.useCallback(() => {
    let parentProjectCode = '';
    if (initialFocusTaskId) {
      const focusedTask = tasks.find(t => t.id === initialFocusTaskId);
      if (focusedTask) {
        parentProjectCode = focusedTask.projectCode || '';
      }
    }
    if (!parentProjectCode && initialFilterCode) {
      const matched = projects.find(p => p.code && (initialFilterCode === p.code || initialFilterCode.startsWith(p.code + '-')));
      parentProjectCode = matched?.code || initialFilterCode;
    }
    setSearchTerm(parentProjectCode);
    setDetailTabFilterCode(parentProjectCode);
    lastFocusedTaskIdRef.current = null;
    onClearFocus?.();
  }, [initialFocusTaskId, initialFilterCode, tasks, projects, onClearFocus, setDetailTabFilterCode]);

  // Auto-heal legacy, out-of-sync or mismatched predecessors & taskCodePhu across tasks in background
  const hasAutoHealedRef = useRef(false);
  useEffect(() => {
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) return;
    if (hasAutoHealedRef.current) return;

    const healed = healAllTasksPredecessors(tasks, projects);
    if (healed.changedCount > 0) {
      hasAutoHealedRef.current = true;
      useAppStore.getState().setTasks(healed.updatedTasks);
      
      const batch = writeBatch(db);
      healed.updatesToSave.forEach(u => {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", u.id);
        const updatePayload: any = { updatedAt: u.updatedAt };
        if (u.predecessor !== undefined) updatePayload.predecessor = u.predecessor;
        if (u.taskCodePhu !== undefined) updatePayload.taskCodePhu = u.taskCodePhu;
        batch.update(tRef, updatePayload);
      });
      batch.commit().catch(e => console.error("Auto-heal predecessors background commit failed", e));
    }
  }, [tasks, projects]);

  // Escape key triggers Clear Focus when not in modals
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen;
        if (hasOpenModal) return;

        if (initialFocusTaskId) {
          e.preventDefault();
          const activeElement = document.activeElement;
          if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
            (activeElement as HTMLElement).blur();
          }
          handleClearFocus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [initialFocusTaskId, handleClearFocus]);

  const handleBackToGantt = () => {
    if (onBackToGantt) {
      onBackToGantt();
    } else {
      if (onClearFocus) onClearFocus();
      useAppStore.getState().setActiveTab('gantt');
    }
  };

  React.useEffect(() => {
    if (initialFocusTaskId && initialFocusTaskId !== lastFocusedTaskIdRef.current) {
      const task = tasks.find((t) => t.id === initialFocusTaskId);
      if (task) {
        const p = projects.find(
          (proj) =>
            String(proj.code || "").trim().toLowerCase() === String(task.projectCode || "").trim().toLowerCase() &&
            (!task.projectStore || !proj.store || String(proj.store).trim().toLowerCase() === String(task.projectStore).trim().toLowerCase()) &&
            (!task.projectYear || !proj.year || String(proj.year).trim() === String(task.projectYear).trim())
        ) || projects.find(
          (proj) => String(proj.code || "").trim().toLowerCase() === String(task.projectCode || "").trim().toLowerCase()
        );

        lastFocusedTaskIdRef.current = initialFocusTaskId;
        const subTaskCode = task.taskCodePhu || (p ? `${p.code}-${(task.orderIndex !== undefined ? task.orderIndex : 0) + 1}` : '') || task.projectCode;
        if (subTaskCode) {
          setSearchTerm(subTaskCode);
          setDetailTabFilterCode(subTaskCode);
        }

        if (p) {
          if (p.year && globalYearFilter !== 'all' && String(p.year) !== String(globalYearFilter)) {
            setGlobalYearFilter(String(p.year));
          }
          if (p.store && globalStoreFilter !== 'all' && String(p.store) !== String(globalStoreFilter)) {
            setGlobalStoreFilter(p.store);
          }
          if (statusFilter !== 'all') {
            setStatusFilter('all');
          }

          setExpandedCodes([...new Set([...expandedCodes, p.id!])]);

          setTimeout(() => {
            const el = document.getElementById(`detail-task-${initialFocusTaskId}`);
            if (el) {
              scrollToElement(el);
            }
          }, 500);
        } else if (task.projectCode) {
          if (statusFilter !== 'all') {
            setStatusFilter('all');
          }
        }
      }
    } else if (!initialFocusTaskId && lastFocusedTaskIdRef.current) {
      lastFocusedTaskIdRef.current = null;
    }
  }, [initialFocusTaskId, tasks, projects, globalYearFilter, globalStoreFilter, statusFilter, setGlobalYearFilter, setGlobalStoreFilter]);
  const [noteModalTask, setNoteModalTask] = useState<Task | null>(null);
  const availableColumnsForUser = useMemo(() => {
    return AVAILABLE_COLUMNS;
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(availableColumnsForUser.map(c => c.id));

  const [colWidths, setColWidths] = useState<Record<string, number>>({
    no: 80,
    year: 80,
    store: 80,
    location: 150,
    code: 120,
    projectName: 200,
    taskName: 250,
    duration: 120,
    start: 200,
    finish: 200,
    predecessor: 120,
    party: 150,
    action: 80
  });

  useEffect(() => {
    const saved = localStorage.getItem(`taka_detail_col_widths_${currentUser.id}`);
    if (saved) {
      try {
        setColWidths(JSON.parse(saved));
      } catch (e) { console.error(e); }
    }
    
    const savedCols = localStorage.getItem(`taka_detail_visible_cols_${currentUser.id}`);
    if (savedCols) {
      try {
        let parsed = JSON.parse(savedCols);
        if (!parsed.includes('action')) parsed.push('action');
        setVisibleColumns(parsed);
      } catch (e) {
        console.error(e);
      }
    } else {
      setVisibleColumns(availableColumnsForUser.map(c => c.id));
    }
  }, [currentUser.role, availableColumnsForUser]);

  const handleResize = (col: string, newWidth: number) => {
    setColWidths(prev => {
      const updated = { ...prev, [col]: newWidth };
      localStorage.setItem(`taka_detail_col_widths_${currentUser.id}`, JSON.stringify(updated));
      return updated;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      localStorage.setItem(`taka_detail_visible_cols_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleSortSubTasks = async (p: Project, groupTasks: Task[]) => {
    try {
      const sorted = [...groupTasks].sort((a, b) => {
        const valAStart = a.start || '9999-12-31';
        const valBStart = b.start || '9999-12-31';
        if (valAStart !== valBStart) {
          return valAStart < valBStart ? -1 : 1;
        }
        const valAFinish = a.finish || '9999-12-31';
        const valBFinish = b.finish || '9999-12-31';
        if (valAFinish !== valBFinish) {
          return valAFinish < valBFinish ? -1 : 1;
        }
        return 0;
      });

      const oldCodeToNewCode = new Map<string, string>();
      const pCodeParts = String(p.code || '').toLowerCase().split(/[,/]+/).map(x => x.trim()).filter(Boolean);

      groupTasks.forEach((t, i) => {
        const oldIndex = i;
        const newIndex = sorted.findIndex(st => st.id === t.id);
        const newCode = `${p.code}-${newIndex + 1}`;
        
        if (t.taskCodePhu) {
          oldCodeToNewCode.set(t.taskCodePhu.trim().toLowerCase(), newCode);
        }
        oldCodeToNewCode.set(`${p.code}-${oldIndex + 1}`.toLowerCase(), newCode);

        // Map any sub-parts of project code (e.g. "l1-115-13" -> "L1-115, L1-113-13")
        pCodeParts.forEach(part => {
          oldCodeToNewCode.set(`${part}-${oldIndex + 1}`.toLowerCase(), newCode);
          oldCodeToNewCode.set(`${part}-${newIndex + 1}`.toLowerCase(), newCode);
        });
      });

      const batch = writeBatch(db);
      const updatesPerTask = new Map<string, any>();

      sorted.forEach((t, index) => {
        const newCode = `${p.code}-${index + 1}`;
        if (t.orderIndex !== index || t.taskCodePhu !== newCode) {
          updatesPerTask.set(t.id, { 
            orderIndex: index, 
            taskCodePhu: newCode, 
            updatedAt: new Date().toISOString() 
          });
        }
      });

      let allUpdatedTasks = tasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, allUpdatedTasks, projects);
      predUpdates.forEach(pu => {
        const existingUpdates = updatesPerTask.get(pu.id) || {};
        updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        allUpdatedTasks = allUpdatedTasks.map(t => t.id === pu.id ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t);
      });

      // Heal all remaining legacy or out-of-sync predecessors
      const healed = healAllTasksPredecessors(allUpdatedTasks, projects);
      if (healed.changedCount > 0) {
        allUpdatedTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, { ...existingUpdates, predecessor: u.predecessor, updatedAt: u.updatedAt });
        });
      }

      // Optimistic UI update in Zustand immediately (0ms)
      useAppStore.getState().setTasks(allUpdatedTasks);

      updatesPerTask.forEach((updates, taskId) => {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        batch.update(tRef, updates);
      });

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

      useAppStore.getState().setToast({
        title: "Sắp xếp thành công",
        message: "Đã đánh lại số thứ tự và tự động điền lại Predecessor theo Task code mới.",
        type: "success"
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleMoveTask = async (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === groupTasks.length - 1)) return;

    try {
      const sorted = [...groupTasks];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      const [movedTask] = sorted.splice(index, 1);
      sorted.splice(targetIndex, 0, movedTask);

      const oldCodeToNewCode = new Map<string, string>();
      const pCodeParts = String(p.code || '').toLowerCase().split(/[,/]+/).map(x => x.trim()).filter(Boolean);

      groupTasks.forEach((t, i) => {
        const oldIndex = i;
        const newIndex = sorted.findIndex(st => st.id === t.id);
        const newCode = `${p.code}-${newIndex + 1}`;
        
        if (t.taskCodePhu) {
          oldCodeToNewCode.set(t.taskCodePhu.trim().toLowerCase(), newCode);
        }
        oldCodeToNewCode.set(`${p.code}-${oldIndex + 1}`.toLowerCase(), newCode);

        pCodeParts.forEach(part => {
          oldCodeToNewCode.set(`${part}-${oldIndex + 1}`.toLowerCase(), newCode);
          oldCodeToNewCode.set(`${part}-${newIndex + 1}`.toLowerCase(), newCode);
        });
      });

      const batch = writeBatch(db);
      const updatesPerTask = new Map<string, any>();

      sorted.forEach((t, newIdx) => {
        const newCode = `${p.code}-${newIdx + 1}`;
        if (t.orderIndex !== newIdx || t.taskCodePhu !== newCode) {
          updatesPerTask.set(t.id, { 
            orderIndex: newIdx, 
            taskCodePhu: newCode, 
            updatedAt: new Date().toISOString() 
          });
        }
      });

      let allUpdatedTasks = tasks.map(t => {
        const up = updatesPerTask.get(t.id);
        return up ? { ...t, ...up } : t;
      });

      const predUpdates = updatePredecessorsStrings(oldCodeToNewCode, allUpdatedTasks, projects);
      predUpdates.forEach(pu => {
        const existingUpdates = updatesPerTask.get(pu.id) || {};
        updatesPerTask.set(pu.id, { ...existingUpdates, predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        allUpdatedTasks = allUpdatedTasks.map(t => t.id === pu.id ? { ...t, predecessor: pu.predecessor, updatedAt: pu.updatedAt } : t);
      });

      // Heal any remaining legacy or out-of-sync predecessors
      const healed = healAllTasksPredecessors(allUpdatedTasks, projects);
      if (healed.changedCount > 0) {
        allUpdatedTasks = healed.updatedTasks;
        healed.updatesToSave.forEach(u => {
          const existingUpdates = updatesPerTask.get(u.id) || {};
          updatesPerTask.set(u.id, { ...existingUpdates, predecessor: u.predecessor, updatedAt: u.updatedAt });
        });
      }

      // Optimistic UI update in Zustand immediately (0ms)
      useAppStore.getState().setTasks(allUpdatedTasks);

      updatesPerTask.forEach((updates, taskId) => {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        batch.update(tRef, updates);
      });

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleDetailTaskDragStart = (e: React.DragEvent, taskId: string) => {
    const tasksToMove = selectedTaskIds.has(taskId)
      ? Array.from(selectedTaskIds)
      : [taskId];
    setDraggingTaskIds(tasksToMove);
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({
        type: "task-reorder",
        tasks: tasksToMove,
      })
    );
    e.dataTransfer.effectAllowed = "move";
    try {
      const cell = (e.currentTarget as HTMLElement).querySelector("td");
      if (cell) e.dataTransfer.setDragImage(cell, 10, 10);
    } catch (err) {}
  };

  const handleDetailTaskDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingTaskIds.includes(taskId)) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pos: 'before' | 'after' = relY < rect.height / 2 ? 'before' : 'after';

    if (dragOverTaskId !== taskId || dropPosition !== pos) {
      setDragOverTaskId(taskId);
      setDropPosition(pos);
    }
  };

  const handleDetailTaskDragLeave = (e: React.DragEvent, taskId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    if (dragOverTaskId === taskId) {
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  };

  const handleDetailTaskDragEnd = (e: React.DragEvent) => {
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
    const tr = e.currentTarget as HTMLTableRowElement;
    if (tr) tr.removeAttribute('draggable');
  };

  const handleDetailTaskDrop = async (e: React.DragEvent, targetTask: Task, targetProject: Project) => {
    e.preventDefault();
    const position = dropPosition || 'before';
    setDragOverTaskId(null);
    setDropPosition(null);
    setDraggingTaskIds([]);

    try {
      let payloadStr = e.dataTransfer.getData("application/json");
      if (!payloadStr) {
        const textPlain = e.dataTransfer.getData("text/plain");
        if (textPlain) {
          const parsed = JSON.parse(textPlain);
          if (!parsed.type) parsed.type = "task-reorder";
          payloadStr = JSON.stringify(parsed);
        }
      }
      if (!payloadStr) return;
      const data = JSON.parse(payloadStr);
      let tasksToMoveIds: string[] = [];
      if (data.type === "task-reorder" || data.type === "legacy") {
        tasksToMoveIds = data.tasks || [];
      } else return;

      if (!tasksToMoveIds || tasksToMoveIds.length === 0) return;
      if (tasksToMoveIds.length === 1 && tasksToMoveIds.includes(targetTask.id)) return;

      const result = reorderAndCalculateTasks(
        tasks,
        projects,
        targetProject,
        tasksToMoveIds,
        targetTask.id,
        position
      );
      if (!result) return;

      // Optimistic local state update in Zustand
      useAppStore.getState().setTasks(result.allUpdatedTasks);

      const writeBatches: any[] = [];
      let currentWriteBatch = writeBatch(db);
      let writeCount = 0;

      for (const tu of result.taskUpdates) {
        const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tu.id);
        currentWriteBatch.update(tRef, tu.updates);
        writeCount++;
        if (writeCount >= 400) {
          writeBatches.push(currentWriteBatch.commit());
          currentWriteBatch = writeBatch(db);
          writeCount = 0;
        }
      }

      for (const pu of result.predecessorUpdates) {
        const alreadyInBatch = result.taskUpdates.some((tu) => tu.id === pu.id);
        if (!alreadyInBatch) {
          const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", pu.id);
          currentWriteBatch.update(tRef, {
            predecessor: pu.predecessor,
            updatedAt: pu.updatedAt,
          });
          writeCount++;
          if (writeCount >= 400) {
            writeBatches.push(currentWriteBatch.commit());
            currentWriteBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      if (writeCount > 0) writeBatches.push(currentWriteBatch.commit());
      await Promise.all(writeBatches);
      setSelectedTaskIds(new Set());
    } catch (err) {
      console.error("DetailTab drop error:", err);
    }
  };

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const allowedStoreOptions = useMemo(() => {
    if (currentUser.role === 'admin') return [{label: 'HCM', value: 'HCM'}, {label: 'HN', value: 'HN'}];
    const options = [];
    if (currentUser.storePermissions?.hcm) options.push({label: 'HCM', value: 'HCM'});
    if (currentUser.storePermissions?.hn) options.push({label: 'HN', value: 'HN'});
    return options;
  }, [currentUser]);

  const locationFilterOptions = useLocationOptions();
  const allowedLocationOptions = useMemo(() => {
    if (currentUser.role === 'admin') return Array.from(new Set(locations));
    return Array.from(new Set(locations)).filter(loc=> currentUser.locationPermissions?.['all'] || currentUser.locationPermissions?.[loc.toLowerCase()]);
  }, [locations, currentUser]);

  useEffect(() => {
    if (initialFilterCode && initialFilterCode !== lastProcessedFilterCodeRef.current) {
      lastProcessedFilterCodeRef.current = initialFilterCode;
      setSearchTerm(initialFilterCode);
      setStatusFilter('all');
      const matchedProj = projects.find(
        (p) => String(p.code || "").trim().toUpperCase() === String(initialFilterCode).trim().toUpperCase()
      ) || projects.find(
        (p) => p.code && String(initialFilterCode).trim().toUpperCase().startsWith(String(p.code).trim().toUpperCase() + '-')
      );
      if (matchedProj && matchedProj.id) {
        setExpandedCodes([...new Set([...expandedCodes, matchedProj.id])]);
      }
      setTimeout(() => {
        const el =
          (matchedProj ? document.getElementById(`detail-project-${matchedProj.no ?? matchedProj.code}`) : null) ||
          document.querySelector(`[data-project-code="${initialFilterCode}"]`);
        if (el && el instanceof HTMLElement) {
          scrollToElement(el);
        }
      }, 500);
    } else if (!initialFilterCode && lastProcessedFilterCodeRef.current !== null) {
      lastProcessedFilterCodeRef.current = null;
      if (!initialFocusTaskId) {
        setSearchTerm('');
      }
    }
  }, [initialFilterCode, initialFocusTaskId, projects]);

  useEffect(() => {
    if (projects.length > 0 && tasks.length > 0) {
      backfillMissingProjectDates(projects, tasks, delegationGroups);
    }
  }, [projects.length, tasks.length, delegationGroups.length]);

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const hasWritePermission = (isAdmin || !!permissionMatrix[role]?.Write?.detail) && !isArchiveYear;
  const [isEditMode, setIsEditMode] = useState(false);
  const canWrite = hasWritePermission && isEditMode;

  const years = [...new Set([...projects.map(p=> {
    if (p.year) return String(p.year);
    if (p.start) return String(p.start).substring(0, 4);
    return null;
  }).filter(Boolean), '2026', '2027'])].sort();

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const stores = allowedStores;

  const toggleGroup = (id: string | number) => {
    // VFS sync trigger
    toggleProjectExpansion(String(id));
  };

  const handleDeleteProject = async (p: Project) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: `Delete project ${p.code} and all Sub-?`,
      onConfirm: async () => {
        try {
          const docId = p.id || p.id!;
          const relatedTasks = tasks.filter(t=> 
            t.projectCode === p.code && 
            (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
            (t.projectStore == p.store || (!t.projectStore && !p.store))
          );
          
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), { id: docId, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          // Collect storage urls to delete
          const urlsToDelete: string[] = [];
          urlsToDelete.push(...extractStorageUrls(p));
          
          // Delete related tasks
          relatedTasks.forEach(t => {
            urlsToDelete.push(...extractStorageUrls(t));
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });

          // Delete related costs from memory store (Zero-read optimization)
          const storeCosts = useAppStore.getState().costs || [];
          const relatedCosts = storeCosts.filter(c => 
            c.projectCode === p.code &&
            String(c.projectYear || '') === String(p.year || '') &&
            String(c.projectStore || '') === String(p.store || '')
          );
          relatedCosts.forEach(c => {
            urlsToDelete.push(...extractStorageUrls(c));
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });

          // Delete related delegations from memory store (Zero-read optimization)
          const storeDelegations = useAppStore.getState().delegationGroups || [];
          const relatedDelGroups = storeDelegations.filter(d => 
            relatedTasks.some(t => t.id === d.parentTaskId) || d.projectCode === p.code
          );
          relatedDelGroups.forEach(d => {
            batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id));
          });

          const costsToDelete = relatedCosts.map(c => ({ id: c.id, data: c }));
          const delegationsToDelete = relatedDelGroups.map(d => ({ id: d.id, data: d }));

          if (urlsToDelete.length > 0) {
            deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
          
          undoManager.push({
            description: `Delete Project: ${p.code}`,
            revert: async () => {
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), p);
              relatedTasks.forEach(t => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              });
              costsToDelete.forEach(c => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c.data);
              });
              delegationsToDelete.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d.data);
              });
              revertBatch.commit().catch(console.error);
            }
          });
        } catch (e) { console.error(e); }
      }
    });
  };

  const handleDeleteTask = async (t: Task) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Task',
      message: 'Delete this Task?',
      onConfirm: async () => {
        try {
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          const urlsToDelete = extractStorageUrls(t);
          if (urlsToDelete.length > 0) {
             deleteStorageFiles(urlsToDelete).catch(console.error);
          }
          
          // Delete related delegations for this task from memory store (Zero-read optimization)
          const storeDelegations = useAppStore.getState().delegationGroups || [];
          const relatedDelGroups = storeDelegations.filter(d => d.parentTaskId === t.id || d.id === `del_${t.id}`);
          const delegationsToDelete = relatedDelGroups.map(d => ({ id: d.id, data: d }));
          relatedDelGroups.forEach(d => {
            batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id));
          });
          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
          const remainingTasks = tasks.filter(task => task.id !== t.id);
          syncProjectDatesByCode(t.projectCode, t.projectStore, t.projectYear, remainingTasks);
          
          undoManager.push({
            description: `Delete Task: ${t.name}`,
            revert: async () => {
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              delegationsToDelete.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d.data);
              });
              revertBatch.commit().catch(console.error);
            }
          });
        } catch (e) { console.error(e); }
      }
    });
  };

  const handleUpdateProject = async (p: Project, field: keyof Project, value: any) => {
    try {
      if ((field === 'code' || field === 'year' || field === 'store') && value !== p[field]) {
        const newCode = field === 'code' ? value : p.code;
        const newYear = field === 'year' ? value : p.year;
        const newStore = field === 'store' ? value : p.store;

        const isDuplicate = projects.some(proj => 
          proj.no !== p.no &&
          String(proj.code).trim().toLowerCase() === String(newCode).trim().toLowerCase() &&
          String(proj.year) === String(newYear) &&
          String(proj.store) === String(newStore)
        );

        if (isDuplicate) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String(`Mã dự án "${newCode}" đã tồn tại trong năm ${newYear} - Store ${newStore}. Vui lòng nhập mã khác.`) });
          return;
        }
      }

      if ((field === 'code' || field === 'year' || field === 'store') && value !== p[field]) {
        const batch = writeBatch(db);
        const docId = p.id || p.id!;
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
        const dataToSave = { ...p, [field]: value, updatedAt: new Date().toISOString() };
        
        // Remove id and computed fields before saving
        delete (dataToSave as any).id;
        delete (dataToSave as any).computedTakStart;
        delete (dataToSave as any).computedTakCompl;
        delete (dataToSave as any).computedOpening;

        // Sanitize dataToSave
        Object.keys(dataToSave).forEach(key => {
          if ((dataToSave as any)[key] === undefined) delete (dataToSave as any)[key];
        });

        batch.set(pRef, dataToSave);

        const projectCodeUpdate = field === 'code' ? value : p.code;
        const projectYearUpdate = field === 'year' ? value : p.year;
        const projectStoreUpdate = field === 'store' ? value : p.store;

        // Compute cascaded code & predecessor updates across all tasks
        const { taskUpdates, predecessorUpdates } = getProjectCodeChangePredecessorUpdates(
          p,
          projectCodeUpdate,
          projectYearUpdate,
          projectStoreUpdate,
          tasks,
          projects
        );

        // Update all tasks with this project identity
        const relatedTasks = tasks.filter(t=> 
          t.projectCode === p.code && 
          (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
          (t.projectStore == p.store || (!t.projectStore && !p.store))
        );

        const relatedTaskIds = new Set(relatedTasks.map(t => t.id));

        relatedTasks.forEach(t => {
          const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
          const tUpdate = taskUpdates.get(t.id) || {
            projectCode: projectCodeUpdate,
            projectYear: projectYearUpdate,
            projectStore: projectStoreUpdate
          };
          const pu = predecessorUpdates.find(item => item.id === t.id);
          const payload: any = {
            ...tUpdate,
            updatedAt: new Date().toISOString()
          };
          if (pu) {
            payload.predecessor = pu.predecessor;
          }
          batch.update(tRef, payload);
        });

        // Update predecessor for tasks in other projects that reference this project
        predecessorUpdates.forEach(pu => {
          if (!relatedTaskIds.has(pu.id)) {
            const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
            batch.update(tRef, {
              predecessor: pu.predecessor,
              updatedAt: pu.updatedAt
            });
          }
        });
        
        // Update all costs with this project identity from memory store (Zero-read optimization)
        const storeCosts = useAppStore.getState().costs || [];
        const relatedCosts = storeCosts.filter(c => {
          const matchesCode = c.projectCode === p.code;
          const matchesYear = c.projectYear == p.year || (!c.projectYear && !p.year);
          const matchesStore = c.projectStore == p.store || (!c.projectStore && !p.store);
          return matchesCode && matchesYear && matchesStore;
        });

        relatedCosts.forEach(c => {
          const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
          batch.update(cRef, { 
            projectCode: projectCodeUpdate,
            projectYear: projectYearUpdate,
            projectStore: projectStoreUpdate
          });
        });

        // Optimistic update in Zustand store (0ms UI latency)
        const predMap = new Map(predecessorUpdates.map(pu => [pu.id, pu.predecessor]));
        const updatedTasks = tasks.map(t => {
          const tUpdate = taskUpdates.get(t.id);
          const newPred = predMap.get(t.id);
          if (tUpdate || newPred !== undefined) {
            return {
              ...t,
              ...(tUpdate || {}),
              ...(newPred !== undefined ? { predecessor: newPred, updatedAt: new Date().toISOString() } : {})
            };
          }
          return t;
        });
        useAppStore.getState().setTasks(updatedTasks);

        const updatedProjects = projects.map(proj => proj.id === p.id ? { ...proj, ...dataToSave, id: p.id, updatedAt: new Date().toISOString() } : proj);
        useAppStore.getState().setProjects(updatedProjects);

        batch.commit().catch(e => {
          console.error("Batch commit failed", e);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        });
        
        undoManager.push({
          description: `Update Project Identity: ${p.code}(${p.year || ''}) -> ${projectCodeUpdate}(${projectYearUpdate || ''})`,
          revert: async () => {
            const revertBatch = writeBatch(db);
            revertBatch.set(pRef, p);
            relatedTasks.forEach(t => {
              const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
              revertBatch.update(tRef, { 
                projectCode: p.code, 
                projectYear: p.year,
                projectStore: p.store,
                ...(t.taskCodePhu !== undefined ? { taskCodePhu: t.taskCodePhu } : {}),
                ...(t.predecessor !== undefined ? { predecessor: t.predecessor } : {})
              });
            });
            predecessorUpdates.forEach(pu => {
              if (!relatedTaskIds.has(pu.id)) {
                const originalTask = tasks.find(st => st.id === pu.id);
                revertBatch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), {
                  predecessor: originalTask?.predecessor || ''
                });
              }
            });
            relatedCosts.forEach(c => {
              const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
              revertBatch.update(cRef, { projectCode: p.code, projectYear: p.year, projectStore: p.store });
            });
            revertBatch.commit().catch(console.error);
          }
        });
      } else {
        const docId = p.id || p.id!;
        const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
        const dataToSave = { ...p, [field]: value, updatedAt: new Date().toISOString() };
        
        // Remove id and computed fields before saving
        delete (dataToSave as any).id;
        delete (dataToSave as any).computedTakStart;
        delete (dataToSave as any).computedTakCompl;
        delete (dataToSave as any).computedOpening;

        // Sanitize dataToSave to remove any undefined fields
        Object.keys(dataToSave).forEach(key => {
          if ((dataToSave as any)[key] === undefined) {
            delete (dataToSave as any)[key];
          }
        });
        
        const batch = writeBatch(db);
        batch.set(pRef, dataToSave);

        if (field === 'delegation' && value === true) {
           const existingGroup = delegationGroups.find(g=> g.parentTaskId === p.code && (!g.projectStore || g.projectStore === p.store) && (!g.projectYear || String(g.projectYear) === String(p.year)));
           const storeKey = p.store || 'HCM';
           const yearKey = (p.year !== undefined && p.year !== null && !isNaN(Number(p.year))) ? Number(p.year) : new Date().getFullYear();
           const deterministicGroupId = existingGroup?.id || `del_proj_${p.code}_${storeKey}_${yearKey}`;
           if (!existingGroup) {
              const dateStr = new Date().toISOString().substring(0, 10);
              const newGroup: DelegationGroup = {
                id: deterministicGroupId,
                parentTaskId: p.code,
                name: p.name || 'Delegated Project',
                projectCode: p.code,
                projectStore: p.store,
                projectYear: yearKey,
                subTasks: [{
                   id: generateId(),
                   name: '',
                   comments: '',
                   status: 'Assigned',
                   delegationStatus: 'Assigned',
                   priority: 'Mid',
                   party: currentUser.username || '',
                   startAct: dateStr,
                   finishAct: dateStr,
                   updatedAt: new Date().toISOString()
                }],
                updatedAt: new Date().toISOString(),
                createdBy: currentUser.id
              };
              const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
              batch.set(delRef, newGroup, { merge: true });
           }
        }
        
        try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
        
        undoManager.push({
          description: `Update Project: ${p.code}`,
          revert: async () => {
            setDoc(pRef, p);
          }
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTask = async (t: Task, updates: Partial<Task>) => {
    try {
      if (updates.name && updates.name !== t.name) {
        const currentProject = projects.find(p=> 
          p.code === t.projectCode &&
          (String(p.year || '') === String(t.projectYear || '') || (!p.year && !t.projectYear)) &&
          (String(p.store || '') === String(t.projectStore || '') || (!p.store && !t.projectStore))
        );
        if (currentProject) {
          const isDuplicate = tasks.some(tsk => {
            if (tsk.id === t.id) return false;
            if (tsk.name.trim().toLowerCase() !== (updates.name || '').trim().toLowerCase()) return false;
            return tsk.projectCode === currentProject.code && 
                   (String(tsk.projectYear || '') === String(currentProject.year || '') || (!tsk.projectYear && !currentProject.year)) &&
                   (String(tsk.projectStore || '') === String(currentProject.store || '') || (!tsk.projectStore && !currentProject.store));
          });
          if (isDuplicate) {
            useAppStore.getState().setToast({ title: "Thông báo", message: String(`Tên nhiệm vụ "${updates.name}" đã tồn tại trong dự án ${currentProject.code} (${currentProject.year} - ${currentProject.store}). Vui lòng nhập tên khác.`) });
            return;
          }
        }
      }

      if (updates.predecessor !== undefined && updates.predecessor !== t.predecessor) {
        let val = updates.predecessor;
        const taskNoMap = buildTaskNoMap(projects, tasks);
        let parts = splitPredecessors(val, taskNoMap);
        if (parts.length > 2) parts = parts.slice(0, 2);
        
        if (parts.length >= 2) {
          updates.durationManual = false;
          if (!/FF|SF/i.test(parts[1])) {
            if (!/SS|FS/i.test(parts[1])) parts[1] += "FF";
            else parts[1] = parts[1].replace(/SS|FS/ig, "FF");
          }
          updates.predecessor = parts.join(', ');
        }

        // Allow external predecessor links across projects without blocking window.confirm in iframe/mobile
        parsePredecessors(updates.predecessor, taskNoMap, t);
      }

      let predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[] = [];
      if (updates.taskCodePhu !== undefined && updates.taskCodePhu !== t.taskCodePhu) {
        const oldCode = (t.taskCodePhu || computeTaskCode(projects, tasks, t)).trim();
        const newCode = (updates.taskCodePhu || computeTaskCode(projects, tasks.map(item => item.id === t.id ? { ...item, ...updates } : item), { ...t, ...updates })).trim();
        if (oldCode && newCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
          const map = new Map<string, string>();
          map.set(oldCode.toLowerCase(), newCode);
          predecessorUpdates = updatePredecessorsStrings(map, tasks, projects);
        }
      }

      const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
      
      let newT = { ...t, ...updates, updatedAt: new Date().toISOString() };

      if (updates.predecessor !== undefined) {
        const taskNoMap = buildTaskNoMap(projects, tasks);
        const parts = splitPredecessors(updates.predecessor, taskNoMap);
        if (parts.length >= 2) {
          newT.durationManual = false;
        }
        newT.realtimeUpdate = Boolean(updates.predecessor.trim());
        const parsed = parsePredecessors(updates.predecessor, taskNoMap, newT);
        const calcResult = calculateTaskDatesFromPredecessors(newT, parsed);
        if (calcResult) {
          newT.start = calcResult.start;
          newT.finish = calcResult.finish;
          newT.duration = calcResult.duration;
          newT.durationManual = calcResult.durationManual;
        }
      } else if (newT.predecessor) {
        newT.realtimeUpdate = Boolean(newT.predecessor.trim());
      }
      
      if (updates.finish !== undefined) {
        if (newT.start && newT.finish) {
          const s = parseDateTime(newT.start);
          const f = parseDateTime(newT.finish);
          if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
            const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
            newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
          }
        }
      } else if (updates.start !== undefined) {
        if (newT.durationManual) {
          if (newT.start && newT.duration !== undefined && newT.duration !== '') {
            const s = parseDateTime(newT.start);
            if (s && !isNaN(s.getTime())) {
              const days = parseFloat(String(newT.duration));
              if (!isNaN(days) && days >= 0) {
                const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
                newT.finish = formatToDatetimeLocal(f);
              }
            }
          }
        } else {
          if (newT.start && newT.finish) {
            const s = parseDateTime(newT.start);
            const f = parseDateTime(newT.finish);
            if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
            }
          }
        }
      } else if (updates.duration !== undefined) {
        if (newT.start && newT.duration !== undefined && newT.duration !== '') {
          const s = parseDateTime(newT.start);
          if (s && !isNaN(s.getTime())) {
            const days = parseFloat(String(newT.duration));
            if (!isNaN(days) && days >= 0) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              newT.finish = formatToDatetimeLocal(f);
            }
          }
        }
      } else if (updates.predecessor === undefined) {
        if (newT.durationManual) {
          if (newT.start && newT.duration !== undefined && newT.duration !== '') {
            const s = parseDateTime(newT.start);
            if (s && !isNaN(s.getTime())) {
              const days = parseFloat(String(newT.duration));
              if (!isNaN(days) && days >= 0) {
                const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
                newT.finish = formatToDatetimeLocal(f);
              }
            }
          }
        } else {
          if (newT.start && newT.finish) {
            const s = parseDateTime(newT.start);
            const f = parseDateTime(newT.finish);
            if (s && f && !isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              newT.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
            }
          }
        }
      }

      const updatesToDependents = scheduleDependentTasks(newT, tasks, projects);
      
      const batch = writeBatch(db);

      // Extract the scheduled version of the updated task if it was modified during scheduling
      const scheduledUpdatedTask = updatesToDependents.find(d => d.id === newT.id);
      if (scheduledUpdatedTask) {
        newT = scheduledUpdatedTask as any;
      }

      batch.set(tRef, newT);

      if (updates.delegation === true) {
         const deterministicGroupId = `del_${t.id}`;
         const existingGroup = delegationGroups.find(g=> g.parentTaskId === t.id || g.id === deterministicGroupId);
         if (!existingGroup) {
            const dateStr = new Date().toISOString().substring(0, 10);
            const rawParty = (t.party && t.party.trim()) ? t.party.trim() : (currentUser.username || '');
            const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
            const newGroup: DelegationGroup = {
              id: deterministicGroupId,
              parentTaskId: t.id,
              name: t.name || 'Delegated Task',
              projectCode: t.projectCode,
              projectStore: t.projectStore,
              projectYear: (t.projectYear !== undefined && t.projectYear !== null && !isNaN(Number(t.projectYear))) ? Number(t.projectYear) : (Number(projects.find(p => p.code === t.projectCode)?.year) || new Date().getFullYear()),
              subTasks: [{
                 id: generateId(),
                 name: '',
                 comments: '',
                 status: 'Assigned',
                 delegationStatus: 'Assigned',
                 priority: 'Mid',
                 party: parsedParty,
                 startAct: dateStr,
                 finishAct: dateStr,
                 updatedAt: new Date().toISOString()
              }],
              updatedAt: new Date().toISOString(),
              createdBy: currentUser.id
            };
            const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
            batch.set(delRef, newGroup, { merge: true });
         }
      }

      // Only write to dependents that are NOT the currently edited task
      const depUpdates = updatesToDependents.filter(d => d.id !== newT.id);
      depUpdates.forEach(depTask => {
        const depRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id);
        batch.set(depRef, { ...depTask, updatedAt: new Date().toISOString() });
      });

      predecessorUpdates.forEach(pu => {
        if (pu.id !== t.id && !updatesToDependents.some(d => d.id === pu.id)) {
          const pRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id);
          batch.update(pRef, { predecessor: pu.predecessor, updatedAt: pu.updatedAt });
        }
      });
      
      // Optimistically update the UI to prevent input lag
      useAppStore.getState().optimisticUpdateTasks([
        newT,
        ...depUpdates,
        ...predecessorUpdates.filter(pu => pu.id !== t.id && !depUpdates.some(d => d.id === pu.id))
      ]);

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        
        // Revert optimistic updates on failure
        useAppStore.getState().optimisticUpdateTasks([t, ...depUpdates.map(d => tasks.find(tsk => tsk.id === d.id) || d)]);
        return;
      }
      syncProjectDatesByCode(newT.projectCode, newT.projectStore, newT.projectYear);
      
      undoManager.push({
        description: `Update Task Schedule: ${t.name}`,
        revert: async () => {
          const revertBatch = writeBatch(db);
          revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
          updatesToDependents.forEach(depTask => {
            const originalDep = tasks.find(tsk => tsk.id === depTask.id);
            if (originalDep) {
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', depTask.id), originalDep);
            }
          });
          revertBatch.commit().catch(console.error);
        }
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveNotes = async (taskId: string, notes: TaskNote[]) => {
    const t = tasks.find(t=> t.id === taskId);
    if (t) {
      await handleUpdateTask(t, { notes });
    }
  };

  const handleExportProjects = () => {
    const headers = ['store', 'location', 'year', 'code', 'name'];
    const data = filteredProjects.map(p => [
      p.store || '', p.location || '', p.year || '', p.code || '', p.name || ''
    ]);
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_projects_filtered.csv');
  };

  const handleImportProjects = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String('CSV file is empty or has no data rows.') });
          return;
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Required Field Validation
        let hasError = false;
        let errorMsg = '';
        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          if (row.every(c => !String(c).trim())) continue;
          
          let hasYear = false, hasStore = false, hasCode = false;
          headers.forEach((h, i) => {
            const val = String(row[i] || '').trim();
            if ((h === 'year' || h === 'projectyear') && val) hasYear = true;
            if ((h === 'store' || h === 'projectstore') && val) hasStore = true;
            if ((h === 'code' || h === 'projectcode') && val) hasCode = true;
          });
          
          if (!hasYear || !hasStore || !hasCode) {
            hasError = true;
            errorMsg = `Row ${idx + 2} is missing Year, Store, or Code. All imported data must include these three fields.`;
            break;
          }
        }
        
        if (hasError) {
          useAppStore.getState().setToast({ title: "Thông báo", message: String('Import failed: ' + errorMsg) });
          return;
        }
        
        let maxNo = projects.length > 0 ? Math.max(...projects.map(p=> {
          const n = Number(p.no);
          return isNaN(n) ? 0 : n;
        })) : 0;

        const processedProjects = new Map<string, Project>();
        projects.forEach(p=> {
          const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '').trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
          processedProjects.set(key, p);
        });

        const previousStates = new Map<string, any>();
        const newIds = new Set<string>();

        let importCount = 0;
        for (const row of dataRows) {
          if (row.length < headers.length) continue;

          const p: any = {};
          headers.forEach((h, i) => {
            const fieldMap: Record<string, keyof Project> = {
              'store': 'store',
              'projectstore': 'store',
              'location': 'location',
              'year': 'year',
              'projectyear': 'year',
              'code': 'code',
              'projectcode': 'code',
              'name': 'name',
              'task name': 'name'
            };
            
            const targetField = fieldMap[h];
            if (targetField) {
              let val: any = row[i];
              if (targetField === 'year') {
                val = !isNaN(Number(val)) ? Number(val) : String(val).trim();
              }
              p[targetField] = val;
            }
          });
          
          if (p.code && p.year) {
            const key = `${String(p.code).trim().toLowerCase()}_${String(p.year).trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
            const existing = processedProjects.get(key);
            let no = existing ? existing.no : null;
            let docId = existing ? (existing.id || String(existing.no)) : null;
            
            if (!no) {
              maxNo++;
              no = maxNo;
              docId = String(no);
              newIds.add(docId);
            } else if (!docId) {
              docId = String(no);
            }
            
            if (docId && !previousStates.has(docId) && existing) {
              previousStates.set(docId, existing);
            }
            
            const finalProject = existing ? { ...existing, ...p } : { ...p, no };
            
            // Remove computed fields and undefined values before saving to Firestore
            const toSave = { ...finalProject };
            if (toSave.year !== undefined && toSave.year !== null && toSave.year !== '' && !isNaN(Number(toSave.year))) {
              toSave.year = Number(toSave.year);
            }
            delete (toSave as any).id;
            delete (toSave as any).computedTakStart;
            delete (toSave as any).computedTakCompl;
            delete (toSave as any).computedOpening;
            
            Object.keys(toSave).forEach(key => {
              if ((toSave as any)[key] === undefined) {
                delete (toSave as any)[key];
              }
            });

            processedProjects.set(key, finalProject);
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId!), toSave);
            importCount++;
          }
        }
        
        if (importCount > 0) {
          undoManager.push({
            description: 'Import Projects',
            revert: async () => {
              const batch = writeBatch(db);
              previousStates.forEach((oldData, id) => {
                const toSave = { ...oldData };
                delete toSave.computedTakStart;
                delete toSave.computedTakCompl;
                delete toSave.computedOpening;
                delete toSave.id;
                batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id), toSave);
              });
              newIds.forEach(id => {
                batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id));
              });
              try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
            }
          });
        }
        
        useAppStore.getState().setToast({ title: "Thông báo", message: String(`Import Projects completed! Processed ${importCount} .`) });
      } catch (err) {
        console.error('Import error:', err);
        useAppStore.getState().setToast({ title: "Thông báo", message: String('Error importing CSV: ' + (err instanceof Error ? err.message : String(err))) });
      }
    };
    reader.readAsText(file);
  };

  const formatToCSVDate = (isoString: string | undefined) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    return `${month}/${day}/${year} ${hour}:${minute}`;
  };

  const parseCSVDate = (csvDate: any) => {
    if (!csvDate) return '';
    const str = String(csvDate).trim();
    if (str.includes('T')) return str;
    const parts = str.split(' ');
    if (parts.length >= 2) {
      const dateParts = parts[0].split(/[\/\-]/);
      const timeParts = parts[1].split(':');
      if (dateParts.length === 3 && timeParts.length >= 2) {
        if (dateParts[0].length === 4) {
          const year = dateParts[0];
          const month = dateParts[1].padStart(2, '0');
          const day = dateParts[2].padStart(2, '0');
          const hour = timeParts[0].padStart(2, '0');
          const minute = timeParts[1].padStart(2, '0');
          return `${year}-${month}-${day}T${hour}:${minute}`;
        }
        const month = dateParts[0].padStart(2, '0');
        const day = dateParts[1].padStart(2, '0');
        const year = dateParts[2];
        const hour = timeParts[0].padStart(2, '0');
        const minute = timeParts[1].padStart(2, '0');
        return `${year}-${month}-${day}T${hour}:${minute}`;
      }
    }
    return str;
  };

  const handleExportTasks = async () => {
    const headers = ['store', 'location', 'projectYear', 'projectCode', 'Sub-task code', 'Task name', 'start', 'finish', 'duration', 'party', 'predecessor', 'delegation', 'task flexible', 'comments'];
    
    // Flatten filtered belonging to filtered
    const filteredTasksToExport: Task[] = [];
    filteredProjects.forEach(p => {
      const groupTasks = sortGroupTasks(tasks.filter(t=> 
        t.projectCode === p.code && 
        (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
        (t.projectStore == p.store || (!t.projectStore && !p.store))
      ));
      filteredTasksToExport.push(...groupTasks);
    });

    const data = filteredTasksToExport.map((t, idx) => {
      const p = projects.find(proj => 
        proj.code === t.projectCode && 
        (t.projectYear == proj.year || (!t.projectYear && !proj.year)) &&
        (t.projectStore == proj.store || (!t.projectStore && !proj.store))
      );
      const subTaskCode = t.taskCodePhu || (p ? `${p.code}-${t.orderIndex !== undefined ? t.orderIndex + 1 : idx + 1}` : '');

      const commentsText = t.comments && t.comments.length > 0 
        ? t.comments.map(c => {
            const author = appUsers.find(u => 
              u.id === c.userId || 
              (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase())
            );
            const name = c.userName || author?.username || c.userId || '';
            return `${name ? name + ': ' : ''}${c.text}`;
          }).join(' | ') 
        : '';

      return [
        t.projectStore || p?.store || '',
        p?.location || '',
        t.projectYear || p?.year || '',
        t.projectCode || '', 
        subTaskCode,
        t.name || '', 
        formatToCSVDate(t.start), 
        formatToCSVDate(t.finish), 
        t.duration !== undefined ? t.duration : '',
        t.party || '',
        t.predecessor || '',
        t.delegation ? 'true' : 'false',
        t.realtimeUpdate ? 'true' : 'false',
        commentsText
      ];
    });

    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Sheet 1: tasks (Danh sách công việc)
      const wsTasksData = [headers, ...data];
      const wsTasks = XLSX.utils.aoa_to_sheet(wsTasksData);
      wsTasks['!cols'] = [
        { wch: 10 }, // store
        { wch: 10 }, // location
        { wch: 12 }, // projectYear
        { wch: 16 }, // projectCode
        { wch: 18 }, // Sub-task code
        { wch: 32 }, // Task name
        { wch: 18 }, // start
        { wch: 18 }, // finish
        { wch: 10 }, // duration
        { wch: 16 }, // party
        { wch: 20 }, // predecessor
        { wch: 12 }, // delegation
        { wch: 14 }, // task flexible
        { wch: 45 }, // comments
      ];
      XLSX.utils.book_append_sheet(wb, wsTasks, 'tasks');

      // Sheet 2: method (Quy định & Hướng dẫn sử dụng)
      const methodData: (string | number)[][] = [
        ['QUY ĐỊNH & HƯỚNG DẪN IMPORT / EXPORT DỮ LIỆU TASK (TASK DATA METHOD & RULES)'],
        [''],
        ['1. CẤU TRÚC CÁC CỘT DỮ LIỆU TẠI SHEET "tasks" (DATA COLUMNS SPECIFICATIONS)'],
        ['Tên Cột (Header)', 'Bắt Buộc (Required)', 'Định Dạng (Format)', 'Mô Tả & Quy Tắc Chi Tiết'],
        ['store', 'Bắt buộc (Yes)', 'Text ("HCM" hoặc "HN")', 'Tên trung tâm thương mại / Store chi nhánh.'],
        ['location', 'Tùy chọn (No)', 'Text (VD: L3, B1, L2, F1...)', 'Vị trí / Tầng triển khai dự án.'],
        ['projectYear', 'Bắt buộc (Yes)', 'Số năm (VD: 2026, 2027)', 'Năm tài chính của dự án.'],
        ['projectCode', 'Bắt buộc (Yes)', 'Text (VD: L3-303-1)', 'Mã dự án cha. Cùng với Store và Year tạo thành khóa định danh duy nhất của dự án.'],
        ['Sub-task code', 'Tùy chọn (No)', 'Text (VD: L3-303-1-1)', 'Mã định danh công việc con. Nếu để trống hệ thống sẽ tự động gán theo số thứ tự (1, 2, 3...).'],
        ['Task name', 'Bắt buộc (Yes)', 'Text (VD: TSC design)', 'Tên đầu việc cần thực hiện.'],
        ['start', 'Bắt buộc (Yes)', 'MM/DD/YYYY HH:mm', 'Thời gian bắt đầu công việc. Hỗ trợ định dạng MM/DD/YYYY HH:mm hoặc YYYY-MM-DDTHH:mm.'],
        ['finish', 'Bắt buộc (Yes)', 'MM/DD/YYYY HH:mm', 'Thời gian hoàn thành công việc.'],
        ['duration', 'Tùy chọn (No)', 'Số ngày (VD: 0.5, 1.5, 30)', 'Thời lượng thực hiện tính theo ngày (cho phép số lẻ thập phân).'],
        ['party', 'Tùy chọn (No)', 'Text (VD: Con1, CP, MD, Tenant)', 'Bên chịu trách nhiệm thực hiện, phân cách dấu phẩy nếu nhiều bên.'],
        ['predecessor', 'Tùy chọn (No)', 'Text (VD: L3-303-1-1, L3-303-1-5SS)', 'Công việc tiên quyết (tiền nhiệm). Hỗ trợ liên kết Finish-to-Start (FS), Start-to-Start (SS) và độ trễ (Lag) như +0.5.'],
        ['delegation', 'Tùy chọn (No)', 'true / false', 'Cho phép ủy quyền công việc (Task Delegation). Nhận: true, false, 1, 0, yes, no.'],
        ['task flexible', 'Tùy chọn (No)', 'true / false', 'Chế độ cập nhật thời gian linh hoạt (realtime update). Nhận: true, false.'],
        ['comments', 'Tùy chọn (No)', 'Text', 'Lịch sử trao đổi / Ghi chú của task (xem quy tắc chi tiết ở phần 2 dưới đây).'],
        [''],
        ['2. QUY ĐỊNH CHI TIẾT ĐỐI VỚI CỘT "comments" (LỊCH SỬ BÌNH LUẬN)'],
        ['Thao tác', 'Cách ghi trong ô "comments"', 'Cơ chế xử lý của hệ thống'],
        ['Giữ nguyên bình luận hiện tại', 'Để nguyên nội dung cũ xuất ra (hoặc để trống ô)', 'Hệ thống tự động bỏ qua, KHÔNG tạo bình luận trùng lặp, bảo toàn nguyên vẹn lịch sử trao đổi.'],
        ['Thêm bình luận mới (Add-on)', 'Nhập nội dung ghi chú / trao đổi mới vào ô', 'Hệ thống tự động CỘNG DỒN (Append) bình luận mới này vào Task, lưu đúng tên người Import và ngày giờ. TUYỆT ĐỐI KHÔNG XÓA hay ghi đè các bình luận cũ.'],
        ['Xóa toàn bộ bình luận của Task', 'Gõ chính xác từ khóa: [DELETE] hoặc [CLEAR]', 'Hệ thống nhận diện lệnh đặc biệt này và xóa sạch toàn bộ lịch sử bình luận của task tương ứng.'],
        [''],
        ['3. NGUYÊN TẮC HỢP NHẤT DỮ LIỆU KHI IMPORT (DATA MERGE LOGIC)'],
        ['Nguyên tắc', 'Chi tiết', '', ''],
        ['Định danh Task', 'Tổ hợp: Project Code + Project Year + Project Store + Task Name.', '', ''],
        ['Cập nhật Task có sẵn', 'Nếu Task đã tồn tại: Hệ thống cập nhật các trường mới (Start, Finish, Duration, Predecessor, Comments...) mà vẫn giữ nguyên ID nội bộ và cấu trúc liên kết.', '', ''],
        ['Thêm mới Task', 'Nếu Task chưa có trong hệ thống: Hệ thống tự động tạo mới Task và xếp theo thứ tự trong file.', '', ''],
        ['Định dạng file hỗ trợ', 'Hệ thống hỗ trợ nhập cả file Excel (.xlsx, .xls) và file CSV (.csv). Khi import file Excel có nhiều sheet, hệ thống tự động đọc dữ liệu từ sheet "tasks" (hoặc sheet đầu tiên).', '', '']
      ];

      const wsMethod = XLSX.utils.aoa_to_sheet(methodData);
      wsMethod['!cols'] = [
        { wch: 32 },
        { wch: 35 },
        { wch: 28 },
        { wch: 80 }
      ];
      XLSX.utils.book_append_sheet(wb, wsMethod, 'method');

      XLSX.writeFile(wb, 'taka_tasks_filtered.xlsx');
    } catch (err) {
      console.error("Export tasks error:", err);
      const csv = generateCSV(headers, data);
      downloadCSV(csv, 'taka_tasks_filtered.csv');
    }
  };

  const handleImportTasks = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let rows: string[][] = [];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('tasks') ? 'tasks' : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
        rows = rawRows.map(row => row.map((cell: any) => String(cell !== null && cell !== undefined ? cell : '').trim()));
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (!rows || rows.length < 2) {
        useAppStore.getState().setToast({ title: "Thông báo", message: "File không có dữ liệu hoặc định dạng không đúng." });
        return;
      }
      const headers = rows[0].map(h => h.trim().toLowerCase());
      const dataRows = rows.slice(1);
      
      // Required Field Validation
      let hasError = false;
      let errorMsg = '';
      for (let idx = 0; idx < dataRows.length; idx++) {
        const row = dataRows[idx];
        if (row.every(c => !String(c).trim())) continue;
        
        let hasYear = false, hasStore = false, hasCode = false;
        headers.forEach((h, i) => {
          const val = String(row[i] || '').trim();
          if ((h === 'year' || h === 'projectyear') && val) hasYear = true;
          if ((h === 'store' || h === 'projectstore') && val) hasStore = true;
          if ((h === 'code' || h === 'projectcode') && val) hasCode = true;
        });
        
        if (!hasYear || !hasStore || !hasCode) {
          hasError = true;
          errorMsg = `Row ${idx + 2} is missing Year, Store, or Project Code. All imported data must include these three fields.`;
          break;
        }
      }
      
      if (hasError) {
        useAppStore.getState().setToast({ title: "Thông báo", message: String('Import failed: ' + errorMsg) });
        return;
      }

      const processedTasks = new Map<string, Task>();
      tasks.forEach(tsk => {
        if (tsk.projectCode && tsk.name) {
          const yearKey = tsk.projectYear ? String(tsk.projectYear).trim().toLowerCase() : '';
          const storeKey = tsk.projectStore ? String(tsk.projectStore).trim().toLowerCase() : '';
          processedTasks.set(`${String(tsk.projectCode).trim().toLowerCase()}_${yearKey}_${storeKey}_${String(tsk.name).trim().toLowerCase()}`, tsk);
        }
      });
      
      const previousStates = new Map<string, any>();
      const newIds = new Set<string>();
      let importCount = 0;

      const tasksToImport: Task[] = [];
      const simulatedTasksMap = new Map<string, Task>();
      tasks.forEach(t=> simulatedTasksMap.set(t.id, t));

      // First pass: extract all parsed rows grouped by project key
      const rawParsedRowsByProject = new Map<string, Array<{ rowData: any, originalCsvIndex: number }>>();

      dataRows.forEach((row, rowIndex) => {
        if (row.length < headers.length) return;

        const t: any = {};
        headers.forEach((h, i) => {
          let key = h;
          if (h === 'task name') key = 'name';
          if (h === 'projectcode') key = 'projectCode';
          if (h === 'year' || h === 'projectyear') key = 'projectYear';
          if (h === 'store' || h === 'projectstore') key = 'projectStore';
          if (h === 'sub-task code' || h === 'sub task code' || h === 'subtask code' || h === 'sub_task_code' || h === 'taskcodephu' || h === 'task code phu' || h === 'task_code_phu') {
            key = 'taskCodePhu';
          }
          if (h === 'orderindex' || h === 'order_index') key = 'orderIndex';
          if (h === 'delegation' || h === 'task delegation' || h === 'task_delegation' || h === 'isdelegation') {
            key = 'delegation';
          }
          if (h === 'task flexible' || h === 'task_flexible' || h === 'taskflexible' || h === 'flexible' || h === 'realtimeupdate' || h === 'realtime_update') {
            key = 'realtimeUpdate';
          }
          if (h === 'comments' || h === 'comment') {
            key = 'importComment';
          }
          
          if (['projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'importComment'].includes(key)) {
            let val: any = row[i];
            if (key === 'start' || key === 'finish') {
              val = parseCSVDate(val);
            } else if (key === 'delegation' || key === 'realtimeUpdate') {
              const strVal = String(val || '').trim().toLowerCase();
              val = (strVal === 'true' || strVal === '1' || strVal === 'yes' || strVal === 'on');
            } else if (key === 'projectYear') {
              val = isNaN(Number(val)) ? val : Number(val);
            }
            t[key] = val;
          }
        });

        if (t.projectCode && t.name) {
          if (!t.projectYear || !t.projectStore) {
            const possibleProjects = projects.filter(p=> String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase());
            if (possibleProjects.length === 1) {
              if (!t.projectYear) t.projectYear = possibleProjects[0].year;
              if (!t.projectStore) t.projectStore = possibleProjects[0].store;
            }
          }
          if (!t.projectYear) {
            const matchedProj = projects.find(p=> String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase());
            t.projectYear = (matchedProj?.year && !isNaN(Number(matchedProj.year))) ? Number(matchedProj.year) : new Date().getFullYear();
          }
          if (t.projectYear !== undefined && !isNaN(Number(t.projectYear))) {
            t.projectYear = Number(t.projectYear);
          } else {
            t.projectYear = new Date().getFullYear();
          }
          const yearKey = t.projectYear ? String(t.projectYear).trim().toLowerCase() : '';
          const storeKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
          const prjKey = `${String(t.projectCode).trim().toLowerCase()}_${yearKey}_${storeKey}`;
          
          if (!rawParsedRowsByProject.has(prjKey)) {
            rawParsedRowsByProject.set(prjKey, []);
          }
          rawParsedRowsByProject.get(prjKey)!.push({ rowData: t, originalCsvIndex: rowIndex });
        }
      });

      // Second pass: for each project, sort tasks by sub-task code if provided, otherwise preserve CSV top-to-bottom order
      rawParsedRowsByProject.forEach((items, prjKey) => {
        const sortedItems = [...items].sort((a, b) => {
          const codeA = String(a.rowData.taskCodePhu || '').trim();
          const codeB = String(b.rowData.taskCodePhu || '').trim();

          const numMatchA = codeA.match(/-(\d+)$/);
          const numMatchB = codeB.match(/-(\d+)$/);

          if (numMatchA && numMatchB) {
            const numA = parseInt(numMatchA[1], 10);
            const numB = parseInt(numMatchB[1], 10);
            if (numA !== numB) return numA - numB;
          } else if (codeA && codeB) {
            const comp = codeA.localeCompare(codeB, undefined, { numeric: true });
            if (comp !== 0) return comp;
          } else if (codeA && !codeB) {
            return -1;
          } else if (!codeA && codeB) {
            return 1;
          }

          if (a.rowData.orderIndex !== undefined && b.rowData.orderIndex !== undefined && a.rowData.orderIndex !== '' && b.rowData.orderIndex !== '') {
            const ordA = Number(a.rowData.orderIndex);
            const ordB = Number(b.rowData.orderIndex);
            if (!isNaN(ordA) && !isNaN(ordB) && ordA !== ordB) return ordA - ordB;
          }

          return a.originalCsvIndex - b.originalCsvIndex;
        });

        sortedItems.forEach((item, index) => {
          const t = item.rowData;
          const taskOrderIndex = index;
          const taskCodePhu = t.taskCodePhu ? String(t.taskCodePhu).trim() : `${String(t.projectCode).trim()}-${taskOrderIndex + 1}`;

          const key = `${prjKey}_${String(t.name).trim().toLowerCase()}`;
          const existing = processedTasks.get(key);
          const id = existing ? existing.id : `t_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${tasksToImport.length}`;
          
          if (existing) {
            if (!previousStates.has(id)) {
              previousStates.set(id, existing);
            }
          } else {
            newIds.add(id);
          }

          let updatedComments = existing?.comments ? [...existing.comments] : [];
          if (t.importComment !== undefined) {
             const importedCommentText = String(t.importComment).trim();
             
             // Lệnh đặc biệt để xóa toàn bộ comments
             if (importedCommentText === '[DELETE]' || importedCommentText === '[CLEAR]') {
                 updatedComments = [];
             } else if (importedCommentText) {
                const existingText = updatedComments.map(c => {
                   const author = appUsers.find(u => 
                      u.id === c.userId || 
                      (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase())
                   );
                   const name = c.userName || author?.username || c.userId || '';
                   return `${name ? name + ': ' : ''}${c.text}`;
                }).join(' | ');

                // Nếu khác với nội dung hiện có, thêm comment mới
                if (importedCommentText !== existingText) {
                   const activeUser = useAppStore.getState().currentUser || currentUser;
                   const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                   const activeUserName = (activeUser?.username && activeUser.username !== 'Guest') ? activeUser.username : (activeUser?.name || activeUser?.email || 'User');

                   // Check if user prefixed the comment in CSV like "Name: Message"
                   let commentText = importedCommentText;
                   let commentUserId = activeUserId;
                   let commentUserName = activeUserName;

                   const prefixMatch = importedCommentText.match(/^([^:\n]+):\s*(.+)$/s);
                   if (prefixMatch) {
                      const potentialName = prefixMatch[1].trim();
                      const potentialText = prefixMatch[2].trim();
                      const matchedUser = appUsers.find(u => 
                         (u.username && u.username.toLowerCase() === potentialName.toLowerCase()) ||
                         (u.id && u.id.toLowerCase() === potentialName.toLowerCase()) ||
                         (u.email && u.email.toLowerCase() === potentialName.toLowerCase())
                      );
                      if (matchedUser) {
                         commentUserId = matchedUser.id;
                         commentUserName = matchedUser.username || potentialName;
                         commentText = potentialText;
                      }
                   }

                   updatedComments.push({
                      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                      text: commentText,
                      createdAt: new Date().toISOString(),
                      userId: commentUserId,
                      userName: commentUserName
                   });
                }
             }
          }
          delete t.importComment;

          const finalTask = existing 
            ? { ...existing, ...t, comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu, updatedAt: new Date().toISOString() } 
            : { ...t, id, comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu, durationManual: true, finishManual: false, startManual: false, updatedAt: new Date().toISOString() };
          
          if (finalTask.start && finalTask.duration !== undefined && finalTask.duration !== '') {
            const s = new Date(finalTask.start);
            const days = parseFloat(String(finalTask.duration));
            if (!isNaN(s.getTime()) && !isNaN(days)) {
              const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
              finalTask.finish = formatToDatetimeLocal(f);
              finalTask.durationManual = true;
            }
          } else if (finalTask.start && finalTask.finish) {
            const s = new Date(finalTask.start);
            const f = new Date(finalTask.finish);
            if (!isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              finalTask.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
            }
          }

          processedTasks.set(key, finalTask);
          simulatedTasksMap.set(id, finalTask as Task);
          tasksToImport.push(finalTask as Task);
        });
      });

      const simulatedTasks = Array.from(simulatedTasksMap.values());
      const simulatedTaskNoMap = buildTaskNoMap(projects, simulatedTasks);

      for (const finalTask of tasksToImport) {
         setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', finalTask.id), finalTask);
         if (finalTask.delegation) {
            const now = new Date().toISOString();
            const dateStr = now.substring(0, 10);
            const activeUser = useAppStore.getState().currentUser || currentUser;
            const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
            const rawParty = (finalTask.party && finalTask.party.trim()) ? finalTask.party.trim() : (activeUser?.username || '');
            const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
            const deterministicGroupId = `del_${finalTask.id}`;
            const newGroup = {
              id: deterministicGroupId,
              parentTaskId: finalTask.id,
              name: finalTask.name || 'Delegated Task',
              projectCode: finalTask.projectCode,
              projectStore: finalTask.projectStore,
              projectYear: (finalTask.projectYear !== undefined && finalTask.projectYear !== null && !isNaN(Number(finalTask.projectYear))) ? Number(finalTask.projectYear) : (Number(projects.find(p => p.code === finalTask.projectCode)?.year) || new Date().getFullYear()),
              subTasks: [{ 
                 id: generateId(), 
                 name: '', 
                 comments: '', 
                 status: 'Assigned', 
                 delegationStatus: 'Assigned', 
                 priority: 'Mid', 
                 party: parsedParty, 
                 startAct: dateStr, 
                 finishAct: dateStr, 
                 updatedAt: now 
              }],
              updatedAt: now,
              createdBy: activeUserId
            };
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId), newGroup, { merge: true });
         }
         importCount++;
      }
      
      const affectedProjectCodes = new Set(tasksToImport.map(t => t.projectCode));
      affectedProjectCodes.forEach(code => {
        const sample = tasksToImport.find(t => t.projectCode === code);
        syncProjectDatesByCode(code, sample?.projectStore, sample?.projectYear);
      });
      
      if (importCount > 0) {
        undoManager.push({
          description: 'Import Tasks',
          revert: async () => {
            const batch = writeBatch(db);
            previousStates.forEach((oldData, id) => {
              batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), oldData);
            });
            newIds.forEach(id => {
              batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id));
            });
            try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
          }
        });
      }
      
      useAppStore.getState().setToast({ title: "Thông báo", message: String(`Import Tasks completed! Processed ${tasksToImport.length} tasks.`) });
    } catch (err: any) {
      console.error("Import error:", err);
      useAppStore.getState().setToast({ title: "Lỗi", message: "Không thể nhập file: " + (err?.message || "Lỗi xử lý file"), type: "error" });
    } finally {
      e.target.value = '';
    }
  };

  const handleBulkAction = async (action: 'delegation_on' | 'delegation_off' | 'flexible_on' | 'flexible_off' | 'baseline' | 'delete') => {
    if (selectedTaskIds.size === 0) return;
    
    if (action === 'delete') {
      if (!window.confirm(`Bạn có chắc muốn xoá ${selectedTaskIds.size} nhiệm vụ đã chọn?`)) return;
    }

    try {
      const batch = writeBatch(db);
      let updateCount = 0;
      const now = new Date().toISOString();

      Array.from(selectedTaskIds).forEach(taskId => {
        const docRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", taskId);
        
        if (action === 'delete') {
          batch.delete(docRef);
          updateCount++;
        } else {
          const payload: any = { updatedAt: now };
          if (action === 'delegation_on') {
            payload.delegation = true;
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              const deterministicGroupId = `del_${task.id}`;
              const existingGroup = delegationGroups.find(g => g.parentTaskId === task.id || g.id === deterministicGroupId);
              if (!existingGroup) {
                 const dateStr = now.substring(0, 10);
                 const activeUser = useAppStore.getState().currentUser || currentUser;
                 const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                 const rawParty = (task.party && task.party.trim()) ? task.party.trim() : (activeUser?.username || '');
                 const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
                 const newGroup = {
                   id: deterministicGroupId,
                   parentTaskId: task.id,
                   name: task.name || 'Delegated Task',
                   projectCode: task.projectCode,
                   projectStore: task.projectStore,
                   projectYear: (task.projectYear !== undefined && task.projectYear !== null && !isNaN(Number(task.projectYear))) ? Number(task.projectYear) : (Number(projects.find(p => p.code === task.projectCode)?.year) || new Date().getFullYear()),
                   subTasks: [{ 
                      id: generateId(), 
                      name: '', 
                      comments: '', 
                      status: 'Assigned', 
                      delegationStatus: 'Assigned', 
                      priority: 'Mid', 
                      party: parsedParty, 
                      startAct: dateStr, 
                      finishAct: dateStr, 
                      updatedAt: now 
                   }],
                   updatedAt: now,
                   createdBy: activeUserId
                 };
                 const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
                 batch.set(delRef, newGroup, { merge: true });
              }
            }
          }
          if (action === 'delegation_off') payload.delegation = false;
          if (action === 'flexible_on') payload.realtimeUpdate = true;
          if (action === 'flexible_off') payload.realtimeUpdate = false;
          
          if (action === 'baseline') {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              payload.baselineStart = task.start;
              payload.baselineFinish = task.finish;
            }
          }
          
          batch.update(docRef, payload);
          updateCount++;
        }
      });
      
      if (updateCount > 0) {
        try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
        useAppStore.getState().setToast({ title: "Thành công", message: `Đã ${action === 'delete' ? 'xoá' : 'cập nhật'} ${updateCount} nhiệm vụ.` });
        setSelectedTaskIds(new Set());
        lastCheckedTaskIdRef.current = null;
      }
    } catch (e: any) {
      console.error(e);
      useAppStore.getState().setToast({ title: "Lỗi", message: e.message });
    }
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const tasksByProjectKey = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(t);
    });
    return map;
  }, [tasks]);

  const delegationGroupByParentKey = useMemo(() => {
    const map = new Map<string, DelegationGroup>();
    delegationGroups.forEach(g => {
      if (g.parentTaskId) {
        const keyWithStore = `${g.parentTaskId}-${g.projectStore || ''}`;
        map.set(keyWithStore, g);
        if (!map.has(g.parentTaskId)) {
          map.set(g.parentTaskId, g);
        }
      }
    });
    return map;
  }, [delegationGroups]);

  const projectInfoMap = useMemo(() => {
    const map = new Map<string, {
      status: string;
      start: string;
      finish: string;
      computedTakStart?: string;
      computedTakCompl?: string;
      computedOpening?: string;
      sortedTasks: Task[];
    }>();

    projects.forEach(p => {
      const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
      let rawGroupTasks = tasksByProjectKey.get(key);
      if (!rawGroupTasks || rawGroupTasks.length === 0) {
        const pCode = String(p.code || "").trim().toLowerCase();
        rawGroupTasks = tasks.filter(t => {
          const tCode = String(t.projectCode || "").trim().toLowerCase();
          if (tCode !== pCode) return false;
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          return matchesStore && matchesYear;
        });
      }
      const sortedTasks = sortGroupTasks(rawGroupTasks);

      let computedTakStart = p.computedTakStart || p.start;
      if (sortedTasks.length > 0) {
        let minStart: string | undefined = undefined;
        for (const t of sortedTasks) {
          if (t.start && (!minStart || t.start < minStart)) {
            minStart = t.start;
          }
        }
        if (minStart) computedTakStart = minStart;
      }

      let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
      if (sortedTasks.length > 0) {
        let maxFinish: string | undefined = undefined;
        for (const t of sortedTasks) {
          if (t.finish && (!maxFinish || t.finish > maxFinish)) {
            maxFinish = t.finish;
          }
        }
        if (maxFinish) computedTakCompl = maxFinish;
      }

      let computedOpening = p.computedOpening || p.opening;
      for (const t of sortedTasks) {
        const name = String(t.name || '').toLowerCase();
        if (name.includes('opening') || name.includes('open')) {
          if (t.finish && (!computedOpening || t.finish > computedOpening)) {
            computedOpening = t.finish;
          }
        }
      }

      const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
      const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';

      const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      map.set(pUniqueKey, {
        status,
        start: computedTakStart || '9999-12-31',
        finish,
        computedTakStart,
        computedTakCompl,
        computedOpening,
        sortedTasks
      });
    });

    return map;
  }, [projects, tasksByProjectKey]);

  const getProjectInfo = (p: Project) => {
    const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
    const cached = projectInfoMap.get(pUniqueKey);
    if (cached) return cached;

    const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
    let rawGroupTasks = tasksByProjectKey.get(key);
    if (!rawGroupTasks || rawGroupTasks.length === 0) {
      const pCode = String(p.code || "").trim().toLowerCase();
      rawGroupTasks = tasks.filter(t => {
        const tCode = String(t.projectCode || "").trim().toLowerCase();
        if (tCode !== pCode) return false;
        const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
        const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
        return matchesStore && matchesYear;
      });
    }
    const sortedTasks = sortGroupTasks(rawGroupTasks);
    let computedTakStart = p.computedTakStart || p.start;
    if (sortedTasks.length > 0) {
      const validStarts = sortedTasks.map(t => t.start).filter(Boolean).sort();
      if (validStarts.length > 0) computedTakStart = validStarts[0];
    }
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    if (sortedTasks.length > 0) {
      const validFinishes = sortedTasks.map(t => t.finish).filter(Boolean).sort((a, b) => b.localeCompare(a));
      if (validFinishes.length > 0) computedTakCompl = validFinishes[0];
    }
    let computedOpening = p.computedOpening || p.opening;
    const openingTasks = sortedTasks.filter(t => {
      const name = String(t.name || '').toLowerCase();
      return name.includes('opening') || name.includes('open');
    });
    if (openingTasks.length > 0) {
      const validFinishes = openingTasks.map(t => t.finish).filter(Boolean).sort((a, b) => b.localeCompare(a));
      if (validFinishes.length > 0) computedOpening = validFinishes[0];
    }
    const status = getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
    const finish = computedTakCompl || computedOpening || p.opening || '9999-12-31';
    return { status, start: computedTakStart || '9999-12-31', finish, sortedTasks, computedTakStart, computedTakCompl, computedOpening };
  };

  const sortedProjects = projects;

  useEffect(() => { setVisibleCount(20); }, [searchTerm, globalStoreFilter, globalYearFilter, globalLocationFilter, statusFilter]);

  const filteredProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    const lowerSearchTerm = searchTerm.toLowerCase();

    return sortedProjects.filter(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      const pYear = p.year ? String(p.year) : (info.computedTakStart ? String(info.computedTakStart).substring(0, 4) : (p.start ? String(p.start).substring(0, 4) : null));
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
      if (globalLocationFilter.length > 0 && (!p.location || !globalLocationFilter.includes(p.location))) return false;
      let matchesStatus = true;
      if (statusFilter === 'On process + Upcoming 3 days') {
        if (info.status === 'On process') {
          matchesStatus = true;
        } else if (info.status === 'Upcoming') {
          const dStart = parseDateTime(info.start);
          if (dStart) {
            dStart.setHours(0, 0, 0, 0);
            const diffTime = dStart.getTime() - todayTime;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            matchesStatus = diffDays <= 3 && diffDays >= 0;
          } else {
            matchesStatus = false;
          }
        } else {
          matchesStatus = false;
        }
      } else {
        matchesStatus = statusFilter === 'all' || info.status === statusFilter;
      }
      if (!matchesStatus) return false;

      const groupTasks = info.sortedTasks || tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];

      if (lowerSearchTerm) {
        const projectFields = [p.store, p.location, p.year, p.code, p.name];
        const projectMatches = projectFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
        
        const summariesMatch = p.taskSummaries?.some(ts =>
          String(ts.name || "").toLowerCase().includes(lowerSearchTerm)
        ) || false;

        const taskMatches = groupTasks.some((t, idx) => {
          const taskFields = [
            t.taskCodePhu,
            `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
            t.name,
            t.duration,
            t.start,
            t.finish,
            t.party,
            formatDisplayDateMain(t.start),
            formatDisplayDateTime(t.start),
            formatDisplayDateMain(t.finish),
            formatDisplayDateTime(t.finish)
          ];
          const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
          const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm)) || false;
          
          return fieldMatch || notesMatch;
        });

        if (!projectMatches && !summariesMatch && !taskMatches) {
          return false;
        }
      }
      return true;
    });
  }, [sortedProjects, projectInfoMap, tasksByProjectKey, globalYearFilter, effectiveStore, globalLocationFilter, searchTerm, statusFilter, projects, tasks]);



  const toggleAll = () => {
    if (expandedCodes.length === 0) {
      setExpandedCodes(filteredProjects.map(p => String(p.id!)));
    } else {
      setExpandedCodes([]);
    }
  };

  const prevVisibleIdsRef = useRef<string>("");
  useEffect(() => {
    const targetProjects = filteredProjects.length > 0
      ? filteredProjects.slice(0, visibleCount)
      : sortedProjects.filter(p => {
          const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : (p.start ? String(p.start).substring(0, 4) : null));
          if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
          if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
          if (globalLocationFilter.length > 0 && (!p.location || !globalLocationFilter.includes(p.location))) return false;
          return true;
        }).slice(0, visibleCount);

    const visibleIds = targetProjects.map(p => String(p.id || p.no));
    const idsKey = visibleIds.join(',');
    if (prevVisibleIdsRef.current !== idsKey) {
      prevVisibleIdsRef.current = idsKey;
      setVisibleActiveProjectIds(visibleIds);
    }
  }, [filteredProjects, sortedProjects, visibleCount, globalYearFilter, effectiveStore, globalLocationFilter, setVisibleActiveProjectIds]);

  useEffect(() => {
    return () => {
      useAppStore.getState().setVisibleActiveProjectIds([]);
    };
  }, []);

  const allVisibleTaskIds = useMemo(() => {
    return filteredProjects.slice(0, visibleCount).flatMap(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
      return (pInfo.sortedTasks || []).map(t => t.id);
    });
  }, [filteredProjects, visibleCount, projectInfoMap]);

  const lowerSearchTerm = searchTerm.toLowerCase().trim();

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <ConfirmModal 
        isOpen={confirmModal.isOpen}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
      <TaskNoteModal
        isOpen={!!noteModalTask}
        onClose={() => setNoteModalTask(null)}
        task={noteModalTask}
        onSave={handleSaveNotes}
        canWrite={canWrite}
      />
      <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden">
        <div className="flex flex-col gap-2.5 sm:gap-3 w-full xl:w-auto flex-grow max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full">
            <select 
              value={globalYearFilter}
              onChange={(e) => setGlobalYearFilter(e.target.value)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
            >
              <option value="all">All Years</option>
              {years.map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
            <select 
              value={effectiveStore}
              onChange={(e) => setGlobalStoreFilter(e.target.value)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
            >
              {stores.length > 1 && <option value="all">All Stores</option>}
              {stores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <MultiCheckboxSelect 
              value={globalLocationFilter}
              onChange={setGlobalLocationFilter}
              options={locationFilterOptions}
              placeholder="All Locations"
              className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
            />
            <select 
              value={statusFilter}
              onChange={(e) => {
                const val = e.target.value;
                setStatusFilter(val);
                if (!searchTerm.trim()) {
                  lastSelectedStatusFilterRef.current = val;
                  safeSetItemSession("taka_detail_status_filter", val);
                }
              }}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
            >
              <option value="all">All Status</option>
              <option value="Upcoming">Upcoming</option>
              <option value="On process">On process</option>
              <option value="On process + Upcoming 3 days">On process + Upcoming 3 days</option>
              <option value="Handover">Handover</option>
              <option value="Completed">Completed</option>
              <option value="Canceled">Canceled</option>
            </select>
          </div>
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => {
                setSearchTerm(val);
                if (!val) {
                  setDetailTabFilterCode("");
                  onClearFocus?.();
                }
              }}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 p-2 outline-none shadow-sm" 
              placeholder="Search in detail..."
            />
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 self-end xl:self-center">
          <ColumnAdder 
            availableColumns={availableColumnsForUser} 
            visibleColumns={visibleColumns} 
            onAddColumn={handleToggleColumn} 
          />

            {/* Sticky Action Controls (matching GanttTab design & coordinate system) */}
            {hasWritePermission && (
              <div className="fixed top-[76px] xl:top-[84px] right-4 md:right-8 z-50 flex flex-row gap-2 justify-end items-start print:hidden">
                <button
                  onClick={() => setIsEditMode(!isEditMode)}
                  className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs ${
                    isEditMode
                      ? "bg-blue-600 border-blue-700 text-white hover:bg-blue-700 shadow-blue-500/20"
                      : "bg-slate-800 dark:bg-[#1e1e20] border border-slate-700 dark:border-[#444446] text-white dark:text-[#e3e3e3] hover:bg-slate-700 dark:hover:bg-[#28282a]/50"
                  }`}
                  title="Edit Mode"
                >
                  <Edit3 className={`w-4 h-4 pointer-events-none ${isEditMode ? "text-white" : "text-blue-400"}`} />
                  <span className="hidden sm:inline pointer-events-none">
                    {isEditMode ? 'Editing' : 'Edit Mode'}
                  </span>
                </button>

                {canWrite && (
                  <>
                    <button 
                      onClick={onAddProject}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-blue-600 border border-slate-800 dark:border-blue-500 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs"
                      title="Add Project"
                    >
                      <Plus className="w-4 h-4 pointer-events-none" />
                      <span className="hidden sm:inline pointer-events-none">
                        Add Project
                      </span>
                    </button>

                    <button 
                      onClick={() => {
                        const targetProj = activeProjectInView || (filteredProjects && filteredProjects.length > 0 ? filteredProjects[0] : (projects && projects.length > 0 ? projects[0] : null));
                        onAddTask(targetProj);
                      }}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 dark:bg-emerald-600 border border-emerald-700 text-white rounded-lg hover:bg-emerald-700 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs"
                      title={activeProjectInView?.code ? `Add Task for ${activeProjectInView.code}` : "Add New Task"}
                    >
                      <Plus className="w-4 h-4 pointer-events-none" />
                      <span className="hidden sm:inline pointer-events-none">
                        {activeProjectInView?.code ? `+ Task (${activeProjectInView.code})` : 'Add New Task'}
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}

            {hasWritePermission && (
              <>
                <div className="flex gap-1 items-center">
                  {currentUser.role === 'admin' && (
                    <FullReplaceImport 
                      collectionName="taka_projects"
                      onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Thông báo", message: String(`Full replace successful! Imported ${count} .`) })}
                      onParseRow={(row, headers) => {
                        const p: any = {};
                        let rowNo: any = null;
                        headers.forEach((h, i) => {
                          const fieldMap: any = { 'store': 'store', 'location': 'location', 'year': 'year', 'code': 'code', 'name': 'name', 'no': 'no' };
                          const target = fieldMap[h];
                          if (target) {
                            let val: any = row[i];
                            if (target === 'year' || target === 'no') val = isNaN(Number(val)) ? val : Number(val);
                            p[target] = val;
                            if (target === 'no') rowNo = val;
                          }
                        });
                        if (!p.code) return null;
                        return p;
                      }}
                      id="detail-full-import-projects-btn"
                      hiddenBtn={true}
                    />
                  )}
                  <button id="detail-export-projects-btn" onClick={handleExportProjects} className="hidden" />
                  <input id="detail-import-projects-input" type="file" accept=".csv" onChange={handleImportProjects} className="hidden" />
                </div>
                <div className="flex gap-1 items-center hidden">
                  {currentUser.role === 'admin' && (
                    <FullReplaceImport 
                      collectionName="taka_tasks"
                      onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Thông báo", message: String(`Full replace successful! Imported ${count} .`) })}
                      onParseRow={(row, headers) => {
                        const t: any = {};
                        headers.forEach((h, i) => {
                          let key = h;
                          if (h === 'task name') key = 'name';
                          if (h === 'projectcode') key = 'projectCode';
                          if (h === 'year' || h === 'projectyear') key = 'projectYear';
                          if (h === 'store' || h === 'projectstore') key = 'projectStore';
                          if (h === 'sub-task code' || h === 'sub task code' || h === 'subtask code' || h === 'sub_task_code' || h === 'taskcodephu' || h === 'task code phu' || h === 'task_code_phu') key = 'taskCodePhu';
                          if (h === 'orderindex' || h === 'order_index') key = 'orderIndex';
                          if (h === 'delegation' || h === 'task delegation' || h === 'task_delegation' || h === 'isdelegation') key = 'delegation';
                          if (h === 'task flexible' || h === 'task_flexible' || h === 'taskflexible' || h === 'flexible' || h === 'realtimeupdate' || h === 'realtime_update') key = 'realtimeUpdate';
                          if (['projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'id'].includes(key)) {
                            let val: any = row[i];
                            if (key === 'start' || key === 'finish') val = parseCSVDate(val);
                            else if (key === 'delegation' || key === 'realtimeUpdate') {
                              const strVal = String(val || '').trim().toLowerCase();
                              val = (strVal === 'true' || strVal === '1' || strVal === 'yes' || strVal === 'on');
                            } else if (key === 'projectYear') {
                              val = isNaN(Number(val)) ? val : Number(val);
                            }
                            t[key] = val;
                          }
                        });
                        if (!t.projectCode || !t.name) return null;
                        return t;
                      }}
                      onRecordSave={(record, batch) => {
                         if (record.delegation) {
                            const now = new Date().toISOString();
                            const dateStr = now.substring(0, 10);
                            const activeUser = useAppStore.getState().currentUser || currentUser;
                            const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                            const rawParty = (record.party && record.party.trim()) ? record.party.trim() : (activeUser?.username || '');
                            const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
                            const deterministicGroupId = `del_${record.id}`;
                            const newGroup = {
                              id: deterministicGroupId,
                              parentTaskId: record.id,
                              name: record.name || 'Delegated Task',
                              projectCode: record.projectCode,
                              projectStore: record.projectStore,
                              projectYear: (record.projectYear !== undefined && record.projectYear !== null && !isNaN(Number(record.projectYear))) ? Number(record.projectYear) : (Number(projects.find(p => p.code === record.projectCode)?.year) || new Date().getFullYear()),
                              subTasks: [{ 
                                 id: generateId(), 
                                 name: '', 
                                 comments: '', 
                                 status: 'Assigned', 
                                 delegationStatus: 'Assigned', 
                                 priority: 'Mid', 
                                 party: parsedParty, 
                                 startAct: dateStr, 
                                 finishAct: dateStr, 
                                 updatedAt: now 
                              }],
                              updatedAt: now,
                              createdBy: activeUserId
                            };
                            const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
                            batch.set(delRef, newGroup, { merge: true });
                         }
                      }}
                      id="detail-full-import-tasks-btn"
                      hiddenBtn={true}
                    />
                  )}
                  <button id="detail-export-tasks-btn" onClick={handleExportTasks} className="hidden" />
                  <input id="detail-import-tasks-input" type="file" accept=".csv, .xlsx, .xls" onChange={handleImportTasks} className="hidden" />
                </div>
              </>
            )}
          </div>
      </div>

      <div className="hidden xl:block overflow-x-auto flex-grow pb-16">
        <table className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full" style={{ width: `${visibleColumns.reduce((acc, col) => acc + (colWidths[col] || 100), 0)}px` }}>
          <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
            <tr>
              {visibleColumns.includes('no') && (
                <ResizableHeader width={colWidths.no} onResize={(w) => handleResize('no', w)} className="px-6 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('no')}>
                  <div className="flex items-center justify-center gap-1">
                    {canWrite && (
                      <input 
                        type="checkbox" 
                        title="Select All Visible Tasks"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTaskIds(new Set(allVisibleTaskIds));
                          } else {
                            setSelectedTaskIds(new Set());
                          }
                        }}
                        checked={selectedTaskIds.size > 0 && selectedTaskIds.size === allVisibleTaskIds.length}
                        className="cursor-pointer rounded border-slate-300 dark:border-slate-600 mr-1"
                      />
                    )}
                    No.
                    <button onClick={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p => String(p.id!)) : [])} className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8]">
                      {expandedCodes.length === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </ResizableHeader>
              )}
              {visibleColumns.includes('year') && (
                <ResizableHeader width={colWidths.year} onResize={(w) => handleResize('year', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('year')}>Year</ResizableHeader>
              )}
              {visibleColumns.includes('store') && <ResizableHeader width={colWidths.store} onResize={(w) => handleResize('store', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('store')}>Store</ResizableHeader>}
              {visibleColumns.includes('location') && <ResizableHeader width={colWidths.location} onResize={(w) => handleResize('location', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('location')}>Location</ResizableHeader>}
              {visibleColumns.includes('code') && <ResizableHeader width={colWidths.code} onResize={(w) => handleResize('code', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('code')}>Code</ResizableHeader>}
              {visibleColumns.includes('projectName') && <ResizableHeader width={colWidths.projectName} onResize={(w) => handleResize('projectName', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('projectName')}>Project Name</ResizableHeader>}
              {visibleColumns.includes('taskName') && <ResizableHeader width={colWidths.taskName} onResize={(w) => handleResize('taskName', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('taskName')}>Task Name</ResizableHeader>}
              {visibleColumns.includes('duration') && <ResizableHeader width={colWidths.duration} onResize={(w) => handleResize('duration', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('duration')}>Duration</ResizableHeader>}
              {visibleColumns.includes('start') && (
                <ResizableHeader 
                  width={colWidths.start} 
                  onResize={(w) => handleResize('start', w)} 
                  className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
                  onClick={() => handleSort('start')}
                  hideable onHide={() => handleToggleColumn('start')}
                >
                  Start (Plan) {sortConfig?.key === 'start' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </ResizableHeader>
              )}
              {visibleColumns.includes('finish') && (
                <ResizableHeader 
                  width={colWidths.finish} 
                  onResize={(w) => handleResize('finish', w)} 
                  className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
                  onClick={() => handleSort('finish')}
                  hideable onHide={() => handleToggleColumn('finish')}
                >
                  Finish (Plan) {sortConfig?.key === 'finish' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                </ResizableHeader>
              )}
              {visibleColumns.includes('predecessor') && (
                <ResizableHeader width={colWidths.predecessor} onResize={(w) => handleResize('predecessor', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('predecessor')}>
                  Predecessor
                </ResizableHeader>
              )}
              {visibleColumns.includes('party') && (
                <ResizableHeader width={colWidths.party} onResize={(w) => handleResize('party', w)} className="px-6 py-3 font-bold" hideable onHide={() => handleToggleColumn('party')}>
                  <div className="flex flex-col items-center justify-center text-center">
                    <span>Party</span>
                    <div className="mt-1 flex flex-col items-center">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-[#838383] normal-case leading-none mb-1">deleg</span>
                      <div className="relative inline-flex h-3 w-5 items-center rounded-full bg-green-500">
                        <span className="inline-block h-2 w-2 transform translate-x-2.5 rounded-full bg-white dark:bg-[#1e1e20]" />
                      </div>
                    </div>
                  </div>
                </ResizableHeader>
              )}
              {visibleColumns.includes('action') && <ResizableHeader width={colWidths.action} onResize={(w) => handleResize('action', w)} className="px-4 py-3 font-bold text-center" hideable onHide={() => handleToggleColumn('action')}>Action</ResizableHeader>}
            </tr>
          </thead>
          <tbody>
            {filteredProjects.slice(0, visibleCount).map((p, pIdx) => {
              const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
              const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
              const sortedTasks = pInfo.sortedTasks || [];
              const groupTasks = sortConfig ? [...sortedTasks].sort((a, b) => {
                let valA = '';
                let valB = '';
                let direction = 'asc';
                
                if (sortConfig.key === 'start') {
                  valA = a.start || '9999-12-31';
                  valB = b.start || '9999-12-31';
                } else if (sortConfig.key === 'finish') {
                  valA = a.finish || '9999-12-31';
                  valB = b.finish || '9999-12-31';
                } else if (sortConfig.key === 'taskName') {
                  valA = a.name || '';
                  valB = b.name || '';
                } else if (sortConfig.key === 'duration') {
                  valA = a.duration || '0';
                  valB = b.duration || '0';
                  direction = sortConfig.direction;
                  const numA = Number(valA);
                  const numB = Number(valB);
                  if (numA < numB) return direction === 'asc' ? -1 : 1;
                  if (numA > numB) return direction === 'asc' ? 1 : -1;
                  return 0;
                }
                direction = sortConfig.direction;
                
                if (valA < valB) return direction === 'asc' ? -1 : 1;
                if (valA > valB) return direction === 'asc' ? 1 : -1;
                return 0;
              }) : sortedTasks;

              const effectiveTaskCount = groupTasks.length > 0 
                ? groupTasks.length 
                : (p.taskCount !== undefined 
                    ? p.taskCount 
                    : (p.taskSummaries?.length ?? 0));
              const isExpanded = expandedCodes.includes(String(p.id!));
              const hasDelegatedSubTask = groupTasks.some(t => t.delegation);
              const isProjDelegationOn = !!(p.delegation || hasDelegatedSubTask);

              const planProgressPercent = groupTasks.length > 0 ? computePlanProgressPercent(groupTasks) : (p.computedPlanProgress ?? 0);
              const actProgressPercent = groupTasks.length > 0 ? computeActProgressPercent(groupTasks, delegationGroups) : (p.computedActProgress ?? 0);

              const isProjectMatch = lowerSearchTerm ? [p.store, p.location, p.year, p.code, p.name].some(val => String(val || "").toLowerCase().includes(lowerSearchTerm)) : true;
              const tasksToRender = isProjectMatch ? groupTasks : groupTasks.filter((t, idx) => {
                const taskFields = [
                  t.taskCodePhu,
                  `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
                  t.name,
                  t.duration,
                  t.start,
                  t.finish,
                  t.party,
                  formatDisplayDateMain(t.start),
                  formatDisplayDateTime(t.start),
                  formatDisplayDateMain(t.finish),
                  formatDisplayDateTime(t.finish)
                ];
                const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
                const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm)) || false;
                return fieldMatch || notesMatch;
              });

              return (
                <React.Fragment key={p.id || `${p.code}-${p.year}-${p.no}`}>
                  <tr 
                    id={`detail-project-${p.no ?? p.code}`}
                    data-project-item="true"
                    data-project-id={String(p.id || p.no || p.code)}
                    data-project-code={p.code}
                    data-project-year={p.year || ''}
                    data-project-store={p.store || ''}
                    className={cn("border-b-2 border-slate-200 dark:border-[#444446] transition-colors", pIdx % 2 === 0 ? "bg-slate-100/80 dark:bg-[#1e1e20]/80" : "bg-blue-50/50 dark:bg-[#28282a]")}
                  >
                    {visibleColumns.includes('no') && (
                      <td className="px-6 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canWrite && (
                            <input
                              type="checkbox"
                              title="Select All Tasks in Project"
                              onChange={(e) => {
                                const newSet = new Set(selectedTaskIds);
                                groupTasks.forEach(t => {
                                  if (e.target.checked) newSet.add(t.id);
                                  else newSet.delete(t.id);
                                });
                                setSelectedTaskIds(newSet);
                              }}
                              checked={groupTasks.length > 0 && groupTasks.every(t => selectedTaskIds.has(t.id))}
                              className="cursor-pointer rounded border-slate-300 dark:border-slate-600"
                            />
                          )}
                          <button 
                             onClick={() => toggleGroup(p.id!)} 
                             className={cn(
                               "flex items-center gap-1 px-1.5 py-0.5 rounded font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
                               effectiveTaskCount >= 2
                                  ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white"
                                  : effectiveTaskCount === 1
                                  ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white"
                                  : "bg-slate-200 hover:bg-slate-300 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-600 dark:text-slate-300"
                             )}
                             title={isExpanded ? "Collapse" : `Expand (${effectiveTaskCount})`}
                          >
                            {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            <span className="text-[10px]">({effectiveTaskCount})</span>
                          </button>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('year') && (
                      <td className="px-6 py-3 font-bold text-slate-700 dark:text-[#c3c3c3]">
                        <EditableCell 
                          value={p.year} 
                          type="number"
                          onSave={(val) => handleUpdateProject(p, 'year', val)} 
                          canWrite={canWrite} 
                        />
                      </td>
                    )}
                    {visibleColumns.includes('store') && (
                      <td className={cn("px-6 py-3 font-bold", p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-[#c3c3c3]')}>
                        <EditableCell 
                          value={p.store} 
                          type="select" 
                          options={allowedStoreOptions} 
                          onSave={(val) => handleUpdateProject(p, 'store', val)} 
                          canWrite={canWrite} 
                        />
                      </td>
                    )}
                    {visibleColumns.includes('location') && (
                      <td className="px-6 py-3 font-bold text-slate-700 dark:text-[#c3c3c3] break-words whitespace-normal">
                        <EditableCell 
                          value={p.location} 
                          type="select" 
                          options={allowedLocationOptions.map(l => ({label: l, value: l}))} 
                          onSave={(val) => handleUpdateProject(p, 'location', val)} 
                          canWrite={canWrite} 
                        />
                      </td>
                    )}
                    {visibleColumns.includes('code') && (
                      <td className="px-6 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-extrabold uppercase break-words whitespace-normal">
                        <EditableCell 
                          value={p.code} 
                          onSave={(val) => handleUpdateProject(p, 'code', String(val || '').toUpperCase())} 
                          canWrite={canWrite} 
                        />
                      </td>
                    )}
                    {visibleColumns.includes('projectName') && (
                      <td className="px-6 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] break-words whitespace-normal">
                        <EditableCell 
                          value={p.name} 
                          onSave={(val) => handleUpdateProject(p, 'name', val)} 
                          canWrite={canWrite} 
                        />
                      </td>
                    )}
                    {visibleColumns.includes('taskName') && (
                      <td className="px-6 py-3 font-bold text-slate-500 dark:text-[#a3a3a3] text-xs italic">
                        <div className="flex flex-col gap-1.5">
                          <div className="truncate">{effectiveTaskCount} Sub-</div>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase w-8">Plan:</span>
                              <div className="flex-grow bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 min-w-[50px] overflow-hidden">
                                <div className="bg-blue-500 dark:bg-blue-400 h-full rounded-full transition-all duration-300" style={{ width: `${planProgressPercent}%` }}></div>
                              </div>
                              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 w-6 text-right leading-none">{planProgressPercent}%</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-bold text-slate-400 uppercase w-8">Act:</span>
                              <div className="flex-grow bg-slate-200 dark:bg-slate-700/50 rounded-full h-1.5 min-w-[50px] overflow-hidden">
                                <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${actProgressPercent}%` }}></div>
                              </div>
                              <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 w-6 text-right leading-none">{actProgressPercent}%</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('duration') && (
                      <td className="px-6 py-3 font-bold text-slate-700 dark:text-[#c3c3c3]">
                        {calculateDays(p.computedTakStart, p.computedTakCompl)}
                      </td>
                    )}
                    {visibleColumns.includes('start') && (
                      <td className="px-6 py-3 font-mono text-xs font-bold text-blue-700 dark:text-[#8ab4f8]">{formatDisplayDateMain(p.computedTakStart)}</td>
                    )}
                    {visibleColumns.includes('finish') && (
                      <td className="px-6 py-3 font-mono text-xs font-bold text-pink-700">{formatDisplayDateMain(p.computedTakCompl)}</td>
                    )}
                    {visibleColumns.includes('predecessor') && (
                      <td className="px-6 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSortSubTasks(p, groupTasks);
                          }}
                          className="flex items-center text-[10px] px-2 py-1 rounded shadow-sm transition-colors cursor-pointer border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 active:bg-slate-100"
                        >
                          <ArrowDownUp className="w-3 h-3 mr-1" />
                          Sort
                        </button>
                      </td>
                    )}
                    {visibleColumns.includes('party') && (
                      <td className="px-6 py-3">
                        <div className="flex flex-col gap-2">
                          <EditableCell 
                            value={p.party} 
                            onSave={(val) => handleUpdateProject(p, 'party', val)} 
                            canWrite={canWrite} 
                          />
                          <div className="flex items-center gap-2">
                            <FastToggle value={Boolean(isProjDelegationOn)} canWrite={canWrite} onToggle={(val) => handleUpdateProject(p, 'delegation', val)} />
                          </div>
                        </div>
                      </td>
                    )}
                    {visibleColumns.includes('action') && (
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <QRCodeButton title={p.name || p.code} url={`${window.location.origin}${window.location.pathname}?tab=detail&q=${encodeURIComponent(p.code || '')}`} />
                            <button onClick={(e) => { e.stopPropagation(); onEditProject?.(p, false, "chat"); }} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] transition-colors p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#28282a]" title="Open Project Modal"><Maximize2 className="w-4 h-4" /></button>
                            {canWrite && (
                              <>
                                <button onClick={(e) => { e.stopPropagation(); onAddTask(p); }} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] transition-colors p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#28282a]" title="Add Task"><Plus className="w-4 h-4" /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteProject(p); }} className="text-red-500 hover:text-red-700 transition-colors p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#28282a]" title="Delete Project"><Trash2 className="w-4 h-4" /></button>
                              </>
                            )}
                          </div>
                          {p.updatedAt && (
                            <div className="text-[9px] text-slate-400 dark:text-[#838383] font-mono text-center leading-tight mt-1">
                              Update<br/>{formatDisplayDateMain(p.updatedAt)}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  {isExpanded && tasksToRender.map((t) => {
                    const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
                    const i = originalIndex !== -1 ? originalIndex : 0;
                    const taskStatus = getTaskStatus(t.start, t.finish);
                    let taskStatusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
                    if (taskStatus === 'Completed') taskStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
                    else if (taskStatus === 'On process') taskStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';

                    const delegationGroup = delegationGroupByParentKey.get(t.id);
                    const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
                    let delStatusText = actStatus.label;
                    let delStatusColorClass = actStatus.color;

                    return (
                      <tr
                        id={`detail-task-${t.id}`}
                        key={t.id}
                        onDragStart={(e) => canWrite && handleDetailTaskDragStart(e, t.id)}
                        onDragOver={(e) => canWrite && handleDetailTaskDragOver(e, t.id)}
                        onDragLeave={(e) => canWrite && handleDetailTaskDragLeave(e, t.id)}
                        onDragEnd={handleDetailTaskDragEnd}
                        onDrop={(e) => canWrite && handleDetailTaskDrop(e, t, p)}
                        className={cn(
                          draggingTaskIds.includes(t.id)
                            ? "opacity-40 bg-blue-50/30 dark:bg-blue-950/20 border-dashed border-2 border-blue-400"
                            : "bg-white dark:bg-[#1e1e20] border-b border-slate-100 dark:border-[#333336] hover:bg-blue-50/50 dark:hover:bg-[#444446]",
                          "transition-all text-xs relative",
                          initialFocusTaskId === t.id ? "ring-2 ring-inset ring-yellow-400 !bg-yellow-50 dark:!bg-yellow-900/20" : "",
                          dragOverTaskId === t.id && dropPosition === 'before' ? "border-t-[3px] !border-t-blue-600 dark:!border-t-blue-400 shadow-[0_-2px_6px_rgba(37,99,235,0.3)]" : "",
                          dragOverTaskId === t.id && dropPosition === 'after' ? "border-b-[3px] !border-b-blue-600 dark:!border-b-blue-400 shadow-[0_2px_6px_rgba(37,99,235,0.3)]" : ""
                        )}
                      >
                      {visibleColumns.includes('no') && (
                        <td className="px-6 py-3 text-center text-slate-300 dark:text-slate-600 font-mono italic" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>
                          <div className="flex items-center justify-center gap-2">
                            {canWrite && (
                              <input
                                type="checkbox"
                                onClick={(e) => {
                                  const newSet = new Set(selectedTaskIds);
                                  const isChecked = !selectedTaskIds.has(t.id);
                                  if (isChecked) {
                                    if (e.shiftKey && lastCheckedTaskIdRef.current) {
                                      const lastIdx = allVisibleTaskIds.indexOf(lastCheckedTaskIdRef.current);
                                      const currentIdx = allVisibleTaskIds.indexOf(t.id);
                                      if (lastIdx !== -1 && currentIdx !== -1) {
                                        const minIdx = Math.min(lastIdx, currentIdx);
                                        const maxIdx = Math.max(lastIdx, currentIdx);
                                        for (let i = minIdx; i <= maxIdx; i++) {
                                          newSet.add(allVisibleTaskIds[i]);
                                        }
                                      } else {
                                        newSet.add(t.id);
                                      }
                                    } else {
                                      newSet.add(t.id);
                                    }
                                    lastCheckedTaskIdRef.current = t.id;
                                  } else {
                                    newSet.delete(t.id);
                                    lastCheckedTaskIdRef.current = null;
                                  }
                                  setSelectedTaskIds(newSet);
                                }}
                                onChange={() => {}}
                                checked={selectedTaskIds.has(t.id)}
                                className="cursor-pointer rounded border-slate-300 dark:border-slate-600"
                              />
                            )}
                            <span>{pIdx + 1}.${i + 1}</span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('year') && <td className="px-6 py-3 text-slate-400 dark:text-[#838383] font-medium" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>{p.year || '-'}</td>}
                      {visibleColumns.includes('store') && <td className="px-6 py-3 text-slate-400 dark:text-[#838383] font-medium" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>{p.store || '-'}</td>}
                      {visibleColumns.includes('location') && <td className="px-6 py-3 text-slate-400 dark:text-[#838383] font-medium" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>{p.location || '-'}</td>}
                      {visibleColumns.includes('code') && <td className="px-6 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-bold text-xs" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>{computeTaskCode(projects, tasks, t) || t.taskCodePhu || `${p.code}-${i + 1}`}</td>}
                      {visibleColumns.includes('projectName') && (
                        <td className="px-6 py-3" onDoubleClick={() => canWrite && onEditTask(t, false, "chat")}>
                          <div className="flex flex-col gap-1.5 items-start">
                            <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full border text-center ${taskStatusColorClass}`}>
                              Pl: {taskStatus}
                            </span>
                            <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full border text-center ${delStatusColorClass}`}>
                              Act: {delStatusText}
                            </span>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('taskName') && (
                        <td className="px-6 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] pl-6 flex items-center gap-1 group relative">
                          {dragOverTaskId === t.id && (
                            <div
                              className={cn(
                                "absolute left-0 right-0 h-[3px] bg-blue-600 dark:bg-blue-400 z-30 pointer-events-none flex items-center shadow-[0_0_8px_rgba(37,99,235,0.7)]",
                                dropPosition === 'before' ? "top-0" : "bottom-0"
                              )}
                            >
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 -ml-1 border-2 border-white dark:border-slate-900 shadow-sm ring-2 ring-blue-300" />
                              <div className="ml-3 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-xl text-[10px] font-bold ring-2 ring-white dark:ring-[#1e1e20] whitespace-nowrap animate-in fade-in duration-75">
                                <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-ping shrink-0" />
                                <span>{dropPosition === 'before' ? '▲ Chèn trước:' : '▼ Chèn sau:'}</span>
                                <span className="font-semibold max-w-[200px] truncate text-blue-100">
                                  {tasks.filter(tk => draggingTaskIds.includes(tk.id)).map(tk => tk.name).join(', ')}
                                </span>
                                <span className="ml-1 text-[9px] bg-blue-700/80 px-1.5 py-0.5 rounded text-blue-200 font-normal">Thả để chèn</span>
                              </div>
                            </div>
                          )}
                          {canWrite && (
                            <div className="absolute left-0.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <div
                                onMouseDown={(e) => {
                                  const tr = e.currentTarget.closest('tr');
                                  if (tr) tr.setAttribute('draggable', 'true');
                                }}
                                onMouseUp={(e) => {
                                  const tr = e.currentTarget.closest('tr');
                                  if (tr) tr.removeAttribute('draggable');
                                }}
                                onMouseLeave={(e) => {
                                  const tr = e.currentTarget.closest('tr');
                                  if (tr) tr.removeAttribute('draggable');
                                }}
                                onTouchStart={(e) => {
                                  const tr = e.currentTarget.closest('tr');
                                  if (tr) tr.setAttribute('draggable', 'true');
                                }}
                                onTouchEnd={(e) => {
                                  const tr = e.currentTarget.closest('tr');
                                  if (tr) tr.removeAttribute('draggable');
                                }}
                                className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 p-0.5"
                                title="Kéo để chèn giữa các nhiệm vụ"
                              >
                                <GripVertical className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex flex-col items-center justify-center">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'up'); }}
                                  disabled={i === 0}
                                  className="p-0 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <ChevronUp className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'down'); }}
                                  disabled={i === groupTasks.length - 1}
                                  className="p-0 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <ChevronDown className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          )}
                          {!canWrite && <span className="text-slate-400 dark:text-[#838383]">↳</span>}
                          <div className="flex-grow pl-1">
                            <EditableCell value={t.name} onSave={(val) => handleUpdateTask(t, { name: val })} canWrite={canWrite} />
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('duration') && (
                        <td className="px-6 py-3 italic text-slate-500 dark:text-[#a3a3a3] bg-slate-50 dark:bg-[#1e1e20]/30">
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => canWrite && handleUpdateTask(t, { durationManual: !t.durationManual })}
                              className={cn("p-1 rounded hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors", t.durationManual ? "text-cyan-400" : "text-blue-500")}
                            >
                              {t.durationManual ? <Pin className="w-3.5 h-3.5" /> : <FolderOutput className="w-3.5 h-3.5" />}
                            </button>
                            <div className="flex-grow">
                              <EditableCell 
                                value={parseFloat(t.duration || '0')} 
                                type="number" 
                                onSave={(val) => handleUpdateTask(t, { duration: String(val) })} 
                                canWrite={canWrite && t.durationManual} 
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('start') && (
                        <td className="px-6 py-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <FolderOutput className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                            <div className="flex-grow">
                              <EditableCell 
                                value={t.start} 
                                type="datetime-local" 
                                isDate 
                                onSave={(val) => handleUpdateTask(t, { start: val })} 
                                canWrite={canWrite} 
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('finish') && (
                        <td className="px-6 py-3 font-mono">
                          <div className="flex items-center gap-1.5">
                            <button 
                              onClick={() => canWrite && handleUpdateTask(t, { durationManual: !t.durationManual })}
                              className={cn("p-1 rounded hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors shrink-0", !t.durationManual ? "text-cyan-400" : "text-blue-500")}
                            >
                              {!t.durationManual ? <Pin className="w-3.5 h-3.5" /> : <FolderOutput className="w-3.5 h-3.5" />}
                            </button>
                            <div className="flex-grow">
                              <EditableCell 
                                value={t.finish} 
                                type="datetime-local" 
                                isDate 
                                onSave={(val) => handleUpdateTask(t, { finish: val })} 
                                canWrite={canWrite && !t.durationManual} 
                              />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('predecessor') && (
                        <td className="px-6 py-3 font-mono text-sm text-slate-600 dark:text-[#a3a3a3]">
                          <PredecessorEditableCell value={t.predecessor} onSave={(val) => handleUpdateTask(t, { predecessor: val })} canWrite={canWrite} task={t} tasks={tasks} projects={projects} />
                        </td>
                      )}
                      {visibleColumns.includes('party') && (
                        <td className="px-6 py-3">
                          <div className="flex flex-col gap-2">
                            <EditableCell value={t.party} onSave={(val) => handleUpdateTask(t, { party: val })} canWrite={canWrite} />
                            <div className="flex items-center gap-2">
                              <FastToggle value={Boolean(t.delegation)} canWrite={canWrite} onToggle={(val) => handleUpdateTask(t, { delegation: val })} />
                            </div>
                        </div>
                      </td>
                      )}
                      {visibleColumns.includes('action') && (
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <div className="flex items-center justify-center gap-2">
                              <QRCodeButton title={t.name} url={`${window.location.origin}${window.location.pathname}?tab=detail&q=${encodeURIComponent(t.taskCodePhu || '')}`} />
                              <button onClick={(e) => { e.stopPropagation(); onEditTask(t, false, "chat"); }} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] transition-colors p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#28282a]" title="Open Task Modal"><Maximize2 className="w-4 h-4" /></button>
                              {canWrite && (
                                <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(t); }} className="text-red-500 hover:text-red-700 transition-colors p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#28282a]"><Trash2 className="w-4 h-4" /></button>
                              )}
                            </div>
                            {t.updatedAt && (
                              <div className="text-[9px] text-slate-400 dark:text-[#838383] font-mono text-center leading-tight mt-1">
                                Update<br/>{formatDisplayDateMain(t.updatedAt)}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )})}
                </React.Fragment>
              );
            })}
            {visibleCount < filteredProjects.length && (
              <tr>
                <td colSpan={visibleColumns.length} className="py-4 text-center">
                  <button
                    onClick={() => setVisibleCount(prev => prev + 20)}
                    className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
                  >
                    Load More Projects ({filteredProjects.length - visibleCount} remaining)
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="xl:hidden flex justify-between items-center px-2 pb-2">
        <span className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">Projects ({filteredProjects.length})</span>
        <button 
          onClick={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p=> String(p.id!)) : [])} 
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-[#8ab4f8] font-medium hover:text-blue-800 dark:text-[#8ab4f8] transition-colors"
        >
          {expandedCodes.length === 0 ? (
            <><ChevronRight className="w-4 h-4" /> Expand All</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Collapse All</>
          )}
        </button>
      </div>

      <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-4 px-2">
        {filteredProjects.slice(0, visibleCount).map((p, pIdx) => {
          const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
          const pInfo = projectInfoMap.get(pKey) || getProjectInfo(p);
          const sortedTasks = pInfo.sortedTasks || [];
          const groupTasks = sortConfig ? [...sortedTasks].sort((a, b) => {
            if (!sortConfig) return 0;
            let valA = '';
            let valB = '';
            let direction = sortConfig.direction;
            if (sortConfig.key === 'start') {
              valA = a.start || '9999-12-31';
              valB = b.start || '9999-12-31';
            } else if (sortConfig.key === 'finish') {
              valA = a.finish || '9999-12-31';
              valB = b.finish || '9999-12-31';
            } else if (sortConfig.key === 'taskName') {
              valA = a.name || '';
              valB = b.name || '';
            } else if (sortConfig.key === 'duration') {
              const numA = Number(a.duration || '0');
              const numB = Number(b.duration || '0');
              if (numA < numB) return direction === 'asc' ? -1 : 1;
              if (numA > numB) return direction === 'asc' ? 1 : -1;
              return 0;
            }
            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
          }) : sortedTasks;

          const computedTakStart = pInfo.computedTakStart;
          const computedTakCompl = pInfo.computedTakCompl;
          const status = pInfo.status;
          
          let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
          if (status === 'Completed') statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
          else if (status === 'Handover') statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
          else if (status === 'On process') statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
          else if (status === 'Canceled') statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';

          const effectiveTaskCount = groupTasks.length > 0 
            ? groupTasks.length 
            : (p.taskCount !== undefined 
                ? p.taskCount 
                : (p.taskSummaries?.length ?? 0));
          const isExpanded = expandedCodes.includes(String(p.id!));
          const hasDelegatedSubTask = groupTasks.some(t => t.delegation);
          const isProjDelegationOn = !!(p.delegation || hasDelegatedSubTask);

          const planProgressPercent = groupTasks.length > 0 ? computePlanProgressPercent(groupTasks) : (p.computedPlanProgress ?? 0);
          const actProgressPercent = groupTasks.length > 0 ? computeActProgressPercent(groupTasks, delegationGroups) : (p.computedActProgress ?? 0);

          const isProjectMatch = lowerSearchTerm ? [p.store, p.location, p.year, p.code, p.name].some(val => String(val || "").toLowerCase().includes(lowerSearchTerm)) : true;
          const tasksToRender = isProjectMatch ? groupTasks : groupTasks.filter((t, idx) => {
            const taskFields = [
              t.taskCodePhu,
              `${p.code}-${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
              t.name,
              t.duration,
              t.start,
              t.finish,
              t.party,
              formatDisplayDateMain(t.start),
              formatDisplayDateTime(t.start),
              formatDisplayDateMain(t.finish),
              formatDisplayDateTime(t.finish)
            ];
            const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(lowerSearchTerm));
            const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(lowerSearchTerm)) || false;
            return fieldMatch || notesMatch;
          });

          return (
            <div 
              key={p.id || `${p.code}-${p.year}-${p.no}`} 
              id={`detail-project-${p.no ?? p.code}`}
              data-project-item="true"
              data-project-code={p.code}
              data-project-year={p.year || ''}
              data-project-store={p.store || ''}
              className={cn("rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm p-4 flex flex-col gap-3 relative transition-colors", pIdx % 2 === 0 ? "bg-white dark:bg-[#1e1e20]" : "bg-blue-50/30 dark:bg-[#1e1e20]")}
            >
              <div className={`absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-md border ${statusColorClass}`}>
                {status}
              </div>
              <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-base leading-snug pr-20 flex items-start gap-2">
                <button 
                  onClick={() => toggleGroup(p.id!)} 
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 mt-0.5 shrink-0 rounded font-bold text-xs shadow-sm transition-all active:scale-95 touch-manipulation cursor-pointer",
                    effectiveTaskCount >= 2
                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white"
                      : effectiveTaskCount === 1
                      ? "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 text-white"
                      : "bg-slate-200 hover:bg-slate-300 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-600 dark:text-slate-300"
                  )}
                  title={isExpanded ? "Collapse" : `Expand (${effectiveTaskCount})`}
                >
                  {!isExpanded ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  <span className="text-[10px]">({effectiveTaskCount})</span>
                </button>
                <span><span className={p.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : p.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : ''}>{p.store}</span> - {p.code} - {p.name}</span>
              </div>

              <div className="flex flex-col gap-1 px-1 mt-1 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[60px]">Plan Prg:</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all duration-300" style={{ width: `${planProgressPercent}%` }}></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right">{planProgressPercent}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-[#a3a3a3] uppercase w-[60px]">Act Prg:</span>
                  <div className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${actProgressPercent}%` }}></div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400 w-8 text-right">{actProgressPercent}%</span>
                </div>
              </div>

              <div className="flex justify-between items-center px-1 border-t border-slate-50 dark:border-slate-800 pt-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-slate-500 dark:text-[#a3a3a3] italic font-bold">
                    {effectiveTaskCount} Sub-
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSortSubTasks(p, groupTasks);
                    }}
                    className="flex items-center text-[9px] px-1.5 py-0.5 rounded shadow-sm transition-colors cursor-pointer border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-50 dark:hover:bg-[#28282a]/50 active:bg-slate-100"
                  >
                    <ArrowDownUp className="w-2.5 h-2.5 mr-0.5" />
                    Sort
                  </button>
                  <div className="flex items-center gap-1.5">
                    {p.party && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 truncate max-w-[80px]">
                        {p.party}
                      </span>
                    )}
                    <FastToggle value={Boolean(isProjDelegationOn)} canWrite={canWrite} onToggle={(val) => handleUpdateProject(p, 'delegation', val)} isSmall={true} />
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditProject?.(p, false, "chat"); }}
                      className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors"
                      title="Open Project Modal"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                    {canWrite && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onAddTask(p); }}
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded transition-colors"
                        title={`Add Task for ${p.code}`}
                      >
                        <Plus className="w-3 h-3" />
                        Task
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex gap-4 text-[11px] font-bold leading-tight">
                  <div className="text-blue-700 dark:text-[#8ab4f8] text-right">
                    {(() => {
                      const d = parseDateTime(computedTakStart);
                      if (!d) return null;
                      return (
                        <>
                          <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                          <div>{d.getFullYear()}</div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="text-pink-700 dark:text-pink-400 text-right">
                    {(() => {
                      const d = parseDateTime(computedTakCompl);
                      if (!d) return null;
                      return (
                        <>
                          <div>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })},</div>
                          <div>{d.getFullYear()}</div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
              
              {isExpanded && (
                <div className="flex flex-col gap-2 mt-2">
                {tasksToRender.map((t) => {
                  const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
                  const i = originalIndex !== -1 ? originalIndex : 0;
                  const taskStatus = getTaskStatus(t.start, t.finish);
                  let taskStatusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
                  if (taskStatus === 'Completed') taskStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
                  else if (taskStatus === 'On process') taskStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';

                  const delegationGroup = delegationGroupByParentKey.get(t.id);
                  const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
                  let delStatusText = actStatus.label;
                  let delStatusColorClass = actStatus.color;

                  return (
                    <div id={`detail-task-${t.id}`} key={t.id} className={cn("bg-slate-50 dark:bg-[#1e1e20]/50 rounded-lg p-3 border border-slate-200 dark:border-[#444446] text-sm shadow-sm flex flex-col gap-2", initialFocusTaskId === t.id ? "ring-2 ring-inset ring-yellow-400 !bg-yellow-50 dark:!bg-yellow-900/20" : "")} onClick={() => canWrite && onEditTask(t, false, "chat")}>
                      <div className="flex gap-3">
                        {canWrite && (
                          <div className="shrink-0 flex flex-col items-center justify-center -mr-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'up'); }}
                              disabled={i === 0}
                              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMoveTask(p, groupTasks, i, 'down'); }}
                              disabled={i === groupTasks.length - 1}
                              className="p-1 text-slate-400 dark:text-[#838383] hover:text-blue-600 dark:text-[#8ab4f8] disabled:opacity-20 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex flex-col w-20 shrink-0 text-xs text-slate-500 dark:text-[#a3a3a3] gap-1 border-r border-slate-200 dark:border-[#444446] pr-2">
                          <div className="font-mono text-blue-700 dark:text-[#8ab4f8] font-bold">{formatDisplayDateMain(t.start)}</div>
                          <div className="font-mono text-pink-700 font-bold">{formatDisplayDateMain(t.finish)}</div>
                          <div className="text-[10px] italic mt-1">{calculateDays(t.start, t.finish)}</div>
                        </div>
                        <div className="flex-grow flex flex-col gap-1">
                          <div className="font-bold text-slate-800 dark:text-[#e3e3e3]">
                            <span className="text-blue-600 dark:text-[#8ab4f8] mr-1">{computeTaskCode(projects, tasks, t) || t.taskCodePhu || `${p.code}-${i + 1}`}</span>
                            {t.name}
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-slate-600 dark:text-[#a3a3a3] font-medium">{t.party || ''}</span>
                              {t.predecessor && (
                                <span className="text-[10px] font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-800">
                                  Pred: {normalizeAndHealTaskPredecessors(t, tasks, projects).newPredecessor || t.predecessor}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <FastToggle value={Boolean(t.delegation)} canWrite={canWrite} onToggle={(val) => handleUpdateTask(t, { delegation: val })} />
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-end pt-2 border-t border-slate-200 dark:border-[#444446] mt-1">
                        <div className="flex gap-3 items-center">
                          <button onClick={(e) => { e.stopPropagation(); onEditTask(t, false, "chat"); }} className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-[#28282a] transition-colors" title="Open Task Modal">
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          {canWrite && (
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteTask(t); }} className="text-red-400 hover:text-red-600 dark:text-red-400 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 items-end">
                          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${taskStatusColorClass}`}>
                            Pl: {taskStatus}
                          </div>
                          <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${delStatusColorClass}`}>
                            Act: {delStatusText}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
              
              {canWrite && isExpanded && (
                <button 
                  onClick={() => onAddTask(p)}
                  className="mt-2 w-full py-2 bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-600 dark:text-[#a3a3a3] text-sm font-bold rounded-lg border border-slate-200 dark:border-[#444446] border-dashed flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              )}
            </div>
          )
        })}
        {visibleCount < filteredProjects.length && (
          <div className="py-6 flex justify-center w-full">
            <button 
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2.5 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-full text-sm font-bold text-blue-600 dark:text-[#8ab4f8] shadow-sm hover:shadow hover:border-blue-300 dark:hover:border-blue-500 transition-all active:scale-95"
            >
              Load More Projects ({filteredProjects.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {initialFocusTaskId && (
        <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 flex items-center gap-2 print:hidden pointer-events-none z-50">
          <button
            onClick={handleBackToGantt}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm cursor-pointer border border-slate-600/30"
            title="Quay lại Gantt (Back to Gantt)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold tracking-wide">Back to Gantt</span>
          </button>

          {onClearFocus && (
            <button
              onClick={handleClearFocus}
              className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm cursor-pointer border border-slate-600/30"
              title="Thoát Focus (Esc)"
            >
              <EyeOff className="w-4 h-4" />
              <span className="font-bold tracking-wide">Clear Focus</span>
            </button>
          )}
        </div>
      )}
      
      {selectedTaskIds.size > 0 && canWrite && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-white dark:bg-[#1e1e20] shadow-2xl border border-slate-200 dark:border-[#444446] rounded-full px-4 py-2 flex flex-wrap justify-center items-center gap-3 animate-in fade-in slide-in-from-bottom-4 print:hidden">
          <span className="text-sm font-bold text-slate-700 dark:text-[#e3e3e3] bg-slate-100 dark:bg-[#28282a] px-3 py-1.5 rounded-full shrink-0">
            {selectedTaskIds.size} selected
          </span>
          
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]"></div>
          
          <div className="flex items-center gap-2">
            <button onClick={() => handleBulkAction('delegation_on')} className="px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors">
              Del: ON
            </button>
            <button onClick={() => handleBulkAction('delegation_off')} className="px-3 py-1.5 text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 transition-colors">
              Del: OFF
            </button>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]"></div>

          <div className="flex items-center gap-2">
            <button onClick={() => handleBulkAction('flexible_on')} className="px-3 py-1.5 text-xs font-bold bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 transition-colors">
              Flex: ON
            </button>
            <button onClick={() => handleBulkAction('flexible_off')} className="px-3 py-1.5 text-xs font-bold bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 rounded-md border border-slate-200 dark:border-slate-700 transition-colors">
              Flex: OFF
            </button>
          </div>

          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]"></div>

          <button onClick={() => handleBulkAction('baseline')} className="px-3 py-1.5 text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded-md border border-blue-200 dark:border-blue-800 transition-colors">
            Set Baseline
          </button>
          
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-[#333336]"></div>

          <button onClick={() => handleBulkAction('delete')} className="px-3 py-1.5 text-xs font-bold bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded-md border border-red-200 dark:border-red-800 transition-colors flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          
          <button 
            onClick={() => { setSelectedTaskIds(new Set()); lastCheckedTaskIdRef.current = null; }}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-[#838383] dark:hover:text-white dark:hover:bg-[#333336] rounded-full transition-colors shrink-0"
            title="Clear Selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
