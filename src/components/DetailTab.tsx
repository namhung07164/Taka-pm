import React, { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";

import { useEnrichedData } from '../hooks/useEnrichedData';
import { Search, Plus, Trash2, ChevronRight, ChevronDown, ChevronUp, FolderOutput, Pin, Play, Download, Upload, FileText, Edit3, MessageSquare, ArrowDownUp, Printer, EyeOff, X, GripVertical, ArrowLeft, Maximize2, Wand2 } from 'lucide-react';
import { Project, Task, AppUser, TaskNote, PermissionMatrix, AppRole, DelegationGroup } from '../types';
import { cn, formatDisplayDateMain, formatDisplayDateTime, calculateDays, parseDateTime, formatToDatetimeLocal, getStatus, getTaskStatus, getDefaultDatetimeLocal, resolveActualStatus, getDefaultStoreFilter, computeActProgressPercent, computePlanProgressPercent, generateId, getUserAllowedStores, getEffectiveStoreFilter, scrollToElement, matchesAdvancedSearch } from '../lib/utils';
import { doc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, APP_ID , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { undoManager } from '../lib/undoManager';
import { downloadCSV, parseCSV, generateCSV } from '../lib/csvUtils';
import { lazyWithRetry } from '../lib/lazyWithRetry';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');
const TaskNoteModal = lazyWithRetry(() => import('./TaskNoteModal').then(m => ({ default: m.TaskNoteModal })), 'TaskNoteModal');

import { ResizableHeader } from './ResizableHeader';
import { ColumnAdder } from './ColumnAdder';
import { FullReplaceImport } from './FullReplaceImport';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { scheduleDependentTasks, buildTaskNoMap, sortGroupTasks, parsePredecessors, reorderAndCalculateTasks, calculateTaskDatesFromPredecessors, splitPredecessors, updatePredecessorsStrings, computeTaskCode, getProjectCodeChangePredecessorUpdates, normalizeAndHealTaskPredecessors, healAllTasksPredecessors } from '../lib/ganttUtils';
import { syncProjectDatesByCode, backfillMissingProjectDates } from '../lib/projectDatesService';
import { 
  saveTaskStateUnified, 
  deleteTaskStateUnified, 
  reorderTasksStateUnified 
} from '../lib/taskStateService';
import { QRCodeButton } from './QRCodeButton';
import { QuickNavButton } from './QuickNavButton';
import { safeGetItemSession, safeSetItemSession } from '../lib/storage';
import { PredecessorMultiInput } from "./PredecessorMultiInput";
import { EditableCell } from './DetailTabParts/EditableCell';
import { PredecessorEditableCell } from './DetailTabParts/PredecessorEditableCell';
import { FastToggle } from './DetailTabParts/FastToggle';
import { DetailProjectRow } from './DetailTabParts/DetailProjectRow';
import { DetailTaskRow } from './DetailTabParts/DetailTaskRow';
import { DetailTableHeader } from './DetailTabParts/DetailTableHeader';
import { DetailFilterToolbar } from './DetailTabParts/DetailFilterToolbar';
import { DetailMobileView } from './DetailTabParts/DetailMobileView';
import { DetailFocusControls } from './DetailTabParts/DetailFocusControls';
import { DetailFloatingActionBar } from './DetailTabParts/DetailFloatingActionBar';
// Enterprise Table Virtualization (Virtual Windowing)

export type DetailTableRow = 
  | {
      type: 'project';
      key: string;
      project: Project;
      projectIndex: number;
      effectiveTaskCount: number;
      isExpanded: boolean;
      groupTasks: Task[];
      isProjDelegationOn: boolean;
      planProgressPercent: number;
      actProgressPercent: number;
    }
  | {
      type: 'task';
      key: string;
      task: Task;
      taskIndex: number;
      project: Project;
      projectIndex: number;
      groupTasks: Task[];
    };

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
  initialFilterCode: propInitialFilterCode,
  initialFocusTaskId: propInitialFocusTaskId,
  returnScrollId: propReturnScrollId,
  onClearFocus,
  onBackToGantt,
  onAddProject,
  onAddTask,
  onEditTask,
  onEditProject,
  onNavigateToDelegation
}: DetailTabProps) {
  const storeFilterCode = useAppStore(state => state.detailTabFilterCode);
  const storeFocusTaskId = useAppStore(state => state.detailTabFocusTaskId);
  const storeReturnScrollId = useAppStore(state => state.detailReturnScrollId);

  const initialFilterCode = propInitialFilterCode !== undefined ? propInitialFilterCode : storeFilterCode;
  const initialFocusTaskId = propInitialFocusTaskId !== undefined ? propInitialFocusTaskId : storeFocusTaskId;
  const returnScrollId = propReturnScrollId !== undefined ? propReturnScrollId : storeReturnScrollId;

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
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession("taka_detail_status_filter", statusFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days';
      setStatusFilter(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [searchTerm, globalLocationFilter, setGlobalLocationFilter, statusFilter]);

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
    let rafId: number | null = null;

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

    const scheduleUpdate = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateActiveProject);
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
        scheduleUpdate();
      },
      {
        root: null,
        // RootMargin shifts active viewport area so project entering top 100px-500px triggers active state
        rootMargin: '-60px 0px -40% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    const observeVisibleElements = () => {
      const projectElements = document.querySelectorAll<HTMLElement>('[data-project-item="true"]');
      projectElements.forEach((el) => observer.observe(el));
    };

    // Observe initial items on next frame
    const frameId = requestAnimationFrame(observeVisibleElements);

    return () => {
      cancelAnimationFrame(frameId);
      if (rafId !== null) cancelAnimationFrame(rafId);
      observer.disconnect();
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

  // Synchronize and heal all predecessor contents according to latest subtask codes
  const isSyncingPredecessorsRef = useRef(false);
  const [isSyncingPredecessors, setIsSyncingPredecessors] = useState(false);

  const handleSyncAllPredecessors = React.useCallback(async (showToast = false) => {
    if (isSyncingPredecessorsRef.current) return;
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) {
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Thông báo",
          message: "Chưa có dữ liệu công việc để đồng bộ.",
          type: "info"
        });
      }
      return;
    }

    try {
      isSyncingPredecessorsRef.current = true;
      setIsSyncingPredecessors(true);

      const healed = healAllTasksPredecessors(tasks, projects);
      if (healed.changedCount > 0) {
        // Zero-delay optimistic UI update (0ms)
        useAppStore.getState().setTasks(healed.updatedTasks);

        // Batch update to Firestore in background (non-blocking)
        const batch = writeBatch(db);
        healed.updatesToSave.forEach(u => {
          const tRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", u.id);
          const updatePayload: any = { updatedAt: u.updatedAt };
          if (u.predecessor !== undefined) updatePayload.predecessor = u.predecessor;
          if (u.taskCodePhu !== undefined) updatePayload.taskCodePhu = u.taskCodePhu;
          batch.update(tRef, updatePayload);
        });
        batch.commit().catch(e => console.error("Background sync predecessors error:", e));

        if (showToast) {
          useAppStore.getState().setToast({
            title: "Đồng bộ thành công",
            message: `Đã chuẩn hóa và cập nhật ${healed.changedCount} mã tiền nhiệm (Predecessor) theo mã Subtask mới!`,
            type: "success"
          });
        }
      } else if (showToast) {
        useAppStore.getState().setToast({
          title: "Đồng bộ hoàn tất",
          message: "Tất cả các ô Predecessor đã khớp chính xác với mã Subtask hiện tại.",
          type: "info"
        });
      }
    } catch (e: any) {
      console.error("Sync predecessors error:", e);
      if (showToast) {
        useAppStore.getState().setToast({
          title: "Lỗi đồng bộ",
          message: e?.message || "Có lỗi xảy ra khi đồng bộ tiền nhiệm.",
          type: "error"
        });
      }
    } finally {
      isSyncingPredecessorsRef.current = false;
      setIsSyncingPredecessors(false);
    }
  }, [tasks, projects]);

  // Auto-heal on data change if needed in background (debounced to avoid mount lag)
  useEffect(() => {
    if (!tasks || tasks.length === 0 || !projects || projects.length === 0) return;
    const timer = setTimeout(() => {
      handleSyncAllPredecessors(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [tasks, projects, handleSyncAllPredecessors]);

  // Escape key triggers Clear Search / Clear Focus when not in modals
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen ||
          state.isCalendarSyncModalOpen;
        if (hasOpenModal) return;

        if (searchTerm) {
          e.preventDefault();
          const activeElement = document.activeElement;
          if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
            (activeElement as HTMLElement).blur();
          }
          setSearchTerm("");
          setDetailTabFilterCode("");
          onClearFocus?.();
        } else if (initialFocusTaskId) {
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
  }, [searchTerm, initialFocusTaskId, handleClearFocus, setDetailTabFilterCode, onClearFocus]);

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
    no: 90,
    year: 80,
    store: 80,
    location: 120,
    code: 130,
    projectName: 220,
    taskName: 250,
    duration: 100,
    start: 200,
    finish: 200,
    predecessor: 140,
    party: 150,
    action: 160
  });

  useEffect(() => {
    const saved = localStorage.getItem(`taka_detail_col_widths_${currentUser.id}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.action && parsed.action < 160) {
          parsed.action = 160;
        }
        setColWidths(parsed);
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
      const pCodeParts = String(p.code || '').toLowerCase().split(/[,;/]+/).map(x => x.trim()).filter(Boolean);

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

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

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
      const pCodeParts = String(p.code || '').toLowerCase().split(/[,;/]+/).map(x => x.trim()).filter(Boolean);

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

      // Optimistic UI update in Zustand & sync project dates immediately (0ms)
      reorderTasksStateUnified(allUpdatedTasks, { affectedProjectIds: [p.id] });

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

      // Optimistic local state update in Zustand & sync project dates immediately
      reorderTasksStateUnified(result.allUpdatedTasks);

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
          // Xóa tức thì khỏi Zustand store & đồng bộ lại tiến độ/mốc ngày của Project
          deleteTaskStateUnified([t.id]);
          
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
      
      // Optimistically update the UI and sync computed project dates to prevent lag
      const allUpdatesToSave = [
        newT,
        ...depUpdates,
        ...predecessorUpdates.filter(pu => pu.id !== t.id && !depUpdates.some(d => d.id === pu.id))
      ];
      saveTaskStateUnified(allUpdatesToSave);

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        
        // Revert optimistic updates on failure
        saveTaskStateUnified([t, ...depUpdates.map(d => tasks.find(tsk => tsk.id === d.id) || d)]);
        return;
      }
      
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
      
      saveTaskStateUnified(tasksToImport);
      
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
        if (action === 'delete') {
          deleteTaskStateUnified(Array.from(selectedTaskIds));
        } else {
          const updatedTasksList: (Partial<Task> & { id: string })[] = [];
          Array.from(selectedTaskIds).forEach(taskId => {
            const task = tasks.find(t => t.id === taskId);
            if (task) {
              const u: any = { id: taskId, updatedAt: now };
              if (action === 'delegation_on') u.delegation = true;
              if (action === 'delegation_off') u.delegation = false;
              if (action === 'flexible_on') u.realtimeUpdate = true;
              if (action === 'flexible_off') u.realtimeUpdate = false;
              if (action === 'baseline') {
                u.baselineStart = task.start;
                u.baselineFinish = task.finish;
              }
              updatedTasksList.push(u);
            }
          });
          if (updatedTasksList.length > 0) {
            saveTaskStateUnified(updatedTasksList);
          }
        }

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

  const { tasksByProjectKey, tasksByCodeMap } = useMemo(() => {
    const keyMap = new Map<string, Task[]>();
    const codeMap = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = `${t.projectCode || ''}-${t.projectYear || ''}-${t.projectStore || ''}`;
      let list = keyMap.get(key);
      if (!list) {
        list = [];
        keyMap.set(key, list);
      }
      list.push(t);

      if (t.projectCode) {
        const c = String(t.projectCode).trim().toLowerCase();
        let cList = codeMap.get(c);
        if (!cList) {
          cList = [];
          codeMap.set(c, cList);
        }
        cList.push(t);
      }
    });
    return { tasksByProjectKey: keyMap, tasksByCodeMap: codeMap };
  }, [tasks]);

  // Auto-jump to matched project location(s) when searching
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;

    const matchedProjects = projects.filter(p => {
      const pYear = p.year ? String(p.year) : (p.start ? String(p.start).substring(0, 4) : null);
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;

      const groupTasks = tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];

      const isMatch = matchesAdvancedSearch(
        term,
        [p.store, p.location, p.year, p.code, p.name],
        [],
        (tLower) => {
          const summariesMatch = p.taskSummaries?.some(ts =>
            String(ts.name || "").toLowerCase().includes(tLower)
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
            const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(tLower));
            const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(tLower)) || false;
            return fieldMatch || notesMatch;
          });

          return summariesMatch || taskMatches;
        }
      );

      return isMatch;
    });

    const matchedLocations = Array.from(
      new Set(matchedProjects.map(p => p.location).filter((loc): loc is string => !!loc && loc.trim() !== ''))
    );

    if (matchedLocations.length > 0) {
      const currentLocs = globalLocationFilter || [];
      const isSame = currentLocs.length === matchedLocations.length && currentLocs.every(l => matchedLocations.includes(l));
      if (!isSame) {
        setGlobalLocationFilter(matchedLocations);
      }
    }
  }, [searchTerm, projects, tasksByProjectKey, globalYearFilter, effectiveStore, globalLocationFilter, setGlobalLocationFilter]);

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
        const candidateTasks = tasksByCodeMap.get(pCode) || [];
        rawGroupTasks = candidateTasks.filter(t => {
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          return matchesStore && matchesYear;
        });
      }
      const sortedTasks = sortGroupTasks(rawGroupTasks);

      let computedTakStart = p.computedTakStart || p.start;
      if (sortedTasks.length > 0) {
        let minStart: string | undefined = undefined;
        for (let i = 0; i < sortedTasks.length; i++) {
          const t = sortedTasks[i];
          if (t.start && (!minStart || t.start < minStart)) {
            minStart = t.start;
          }
        }
        if (minStart) computedTakStart = minStart;
      }

      let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
      if (sortedTasks.length > 0) {
        let maxFinish: string | undefined = undefined;
        for (let i = 0; i < sortedTasks.length; i++) {
          const t = sortedTasks[i];
          if (t.finish && (!maxFinish || t.finish > maxFinish)) {
            maxFinish = t.finish;
          }
        }
        if (maxFinish) computedTakCompl = maxFinish;
      }

      let computedOpening = p.computedOpening || p.opening;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
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
  }, [projects, tasksByProjectKey, tasksByCodeMap]);

  const getProjectInfo = (p: Project) => {
    const pUniqueKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
    const cached = projectInfoMap.get(pUniqueKey);
    if (cached) return cached;

    const key = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
    let rawGroupTasks = tasksByProjectKey.get(key);
    if (!rawGroupTasks || rawGroupTasks.length === 0) {
      const pCode = String(p.code || "").trim().toLowerCase();
      const candidateTasks = tasksByCodeMap.get(pCode) || [];
      rawGroupTasks = candidateTasks.filter(t => {
        const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
        const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
        return matchesStore && matchesYear;
      });
    }
    const sortedTasks = sortGroupTasks(rawGroupTasks);
    let computedTakStart = p.computedTakStart || p.start;
    if (sortedTasks.length > 0) {
      let minStart: string | undefined = undefined;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
      }
      if (minStart) computedTakStart = minStart;
    }
    let computedTakCompl: string | undefined = p.computedTakCompl || p.handover;
    if (sortedTasks.length > 0) {
      let maxFinish: string | undefined = undefined;
      for (let i = 0; i < sortedTasks.length; i++) {
        const t = sortedTasks[i];
        if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
      }
      if (maxFinish) computedTakCompl = maxFinish;
    }
    let computedOpening = p.computedOpening || p.opening;
    for (let i = 0; i < sortedTasks.length; i++) {
      const t = sortedTasks[i];
      const name = String(t.name || '').toLowerCase();
      if (name.includes('opening') || name.includes('open')) {
        if (t.finish && (!computedOpening || t.finish > computedOpening)) {
          computedOpening = t.finish;
        }
      }
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
    const lowerSearchTerm = deferredSearchTerm.toLowerCase();

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

      if (deferredSearchTerm) {
        const isMatch = matchesAdvancedSearch(
          deferredSearchTerm,
          [p.store, p.location, p.year, p.code, p.name],
          [],
          (term) => {
            const summariesMatch = p.taskSummaries?.some(ts =>
              String(ts.name || "").toLowerCase().includes(term)
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
              const fieldMatch = taskFields.some(val => String(val || "").toLowerCase().includes(term));
              const notesMatch = t.notes?.some(n => String(n.content || '').toLowerCase().includes(term)) || false;
              return fieldMatch || notesMatch;
            });

            return summariesMatch || taskMatches;
          }
        );
        if (!isMatch) return false;
      }
      return true;
    });
  }, [sortedProjects, projectInfoMap, tasksByProjectKey, globalYearFilter, effectiveStore, globalLocationFilter, deferredSearchTerm, statusFilter, projects, tasks]);



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

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(650);
  const scrollRafIdRef = useRef<number | null>(null);

  const totalTableWidth = useMemo(() => {
    return visibleColumns.reduce((acc, col) => acc + (colWidths[col] || 100), 0);
  }, [visibleColumns, colWidths]);

  const flatTableRows = useMemo<DetailTableRow[]>(() => {
    const rows: DetailTableRow[] = [];
    const visibleProjects = filteredProjects.slice(0, visibleCount);

    visibleProjects.forEach((p, pIdx) => {
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

      rows.push({
        type: 'project',
        key: `project-${p.id || `${p.code}-${p.year}-${p.no}`}`,
        project: p,
        projectIndex: pIdx,
        effectiveTaskCount,
        isExpanded,
        groupTasks,
        isProjDelegationOn,
        planProgressPercent,
        actProgressPercent,
      });

      if (isExpanded) {
        tasksToRender.forEach((t) => {
          const originalIndex = groupTasks.findIndex(gt => gt.id === t.id);
          const i = originalIndex !== -1 ? originalIndex : 0;
          rows.push({
            type: 'task',
            key: `task-${t.id}`,
            task: t,
            taskIndex: i,
            project: p,
            projectIndex: pIdx,
            groupTasks,
          });
        });
      }
    });

    return rows;
  }, [filteredProjects, visibleCount, projectInfoMap, sortConfig, expandedCodes, delegationGroups, lowerSearchTerm]);

  const flatTableRowsRef = useRef(flatTableRows);
  useEffect(() => {
    flatTableRowsRef.current = flatTableRows;
  }, [flatTableRows]);

  const { totalHeight, rowOffsets } = useMemo(() => {
    const totalRows = flatTableRows.length;
    const offsets = new Float64Array(totalRows + 1);
    let sum = 0;
    for (let i = 0; i < totalRows; i++) {
      offsets[i] = sum;
      sum += (flatTableRows[i].type === 'project' ? 42 : 36);
    }
    offsets[totalRows] = sum;
    return { totalHeight: sum, rowOffsets: offsets };
  }, [flatTableRows]);

  const OVERSCAN = 10;
  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const totalRows = flatTableRows.length;
    if (totalRows === 0) {
      return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0 };
    }

    let low = 0;
    let high = totalRows - 1;
    let start = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rowOffsets[mid + 1] <= Math.max(0, scrollTop)) {
        low = mid + 1;
      } else {
        start = mid;
        high = mid - 1;
      }
    }

    const viewStart = Math.max(0, start - OVERSCAN);

    const bottomTarget = scrollTop + containerHeight;
    low = start;
    high = totalRows - 1;
    let end = totalRows - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rowOffsets[mid] < bottomTarget) {
        end = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    const viewEnd = Math.min(totalRows, end + 1 + OVERSCAN);
    const topPad = rowOffsets[viewStart] || 0;
    const bottomPad = Math.max(0, totalHeight - (rowOffsets[viewEnd] || totalHeight));

    return {
      startIndex: viewStart,
      endIndex: viewEnd,
      paddingTop: topPad,
      paddingBottom: bottomPad,
    };
  }, [rowOffsets, totalHeight, scrollTop, containerHeight, flatTableRows.length]);

  const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    const sh = target.scrollHeight;
    const ch = target.clientHeight;

    if (scrollRafIdRef.current !== null) {
      cancelAnimationFrame(scrollRafIdRef.current);
    }
    scrollRafIdRef.current = requestAnimationFrame(() => {
      setScrollTop(st);
      scrollRafIdRef.current = null;
    });

    if (sh - (st + ch) < 400) {
      if (visibleCount < filteredProjects.length) {
        setVisibleCount(prev => Math.min(prev + 30, filteredProjects.length));
      }
    }
  }, [visibleCount, filteredProjects.length]);

  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = entry.contentRect.height;
        if (h > 0) setContainerHeight(h);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!initialFocusTaskId || !tableContainerRef.current) return;
    const idx = flatTableRows.findIndex(r => r.type === 'task' && r.task.id === initialFocusTaskId);
    if (idx >= 0 && rowOffsets[idx] !== undefined) {
      const targetScroll = Math.max(0, rowOffsets[idx] - 120);
      tableContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }, [initialFocusTaskId, flatTableRows, rowOffsets]);

  // Enterprise Optimization: Pre-computed Task Codes Map
  const taskCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      map.set(t.id, computeTaskCode(projects, tasks, t) || t.taskCodePhu || '');
    }
    return map;
  }, [projects, tasks]);

  // Enterprise Optimization: Pre-computed Actual Statuses Map
  const taskActualStatusMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      const taskStatus = getTaskStatus(t.start, t.finish);
      const delegationGroup = delegationGroupByParentKey.get(t.id);
      const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || []);
      map.set(t.id, actStatus);
    }
    return map;
  }, [tasks, delegationGroupByParentKey]);

  // Enterprise Optimization: Pre-computed Dragging Task Names
  const draggingTaskNames = useMemo(() => {
    if (draggingTaskIds.length === 0) return '';
    return tasks.filter(tk => draggingTaskIds.includes(tk.id)).map(tk => tk.name).join(', ');
  }, [draggingTaskIds, tasks]);

  // Enterprise Optimization: Stable Row Action Callbacks
  const handleSelectAllTasksInProject = useCallback((groupTasks: Task[], select: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      groupTasks.forEach(t => {
        if (select) next.add(t.id);
        else next.delete(t.id);
      });
      return next;
    });
  }, []);

  const handleToggleSelectTask = useCallback((taskId: string, shiftKey: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      const isChecked = !prev.has(taskId);
      if (isChecked) {
        if (shiftKey && lastCheckedTaskIdRef.current) {
          const lastIdx = allVisibleTaskIds.indexOf(lastCheckedTaskIdRef.current);
          const currentIdx = allVisibleTaskIds.indexOf(taskId);
          if (lastIdx !== -1 && currentIdx !== -1) {
            const minIdx = Math.min(lastIdx, currentIdx);
            const maxIdx = Math.max(lastIdx, currentIdx);
            for (let idx = minIdx; idx <= maxIdx; idx++) {
              next.add(allVisibleTaskIds[idx]);
            }
          } else {
            next.add(taskId);
          }
        } else {
          next.add(taskId);
        }
        lastCheckedTaskIdRef.current = taskId;
      } else {
        next.delete(taskId);
        lastCheckedTaskIdRef.current = null;
      }
      return next;
    });
  }, [allVisibleTaskIds]);

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <React.Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal 
            isOpen={confirmModal.isOpen}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
          />
        )}
        {!!noteModalTask && (
          <TaskNoteModal
            isOpen={!!noteModalTask}
            onClose={() => setNoteModalTask(null)}
            task={noteModalTask}
            onSave={handleSaveNotes}
            canWrite={canWrite}
          />
        )}
      </React.Suspense>
      <DetailFilterToolbar
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationFilterOptions={locationFilterOptions}
        statusFilter={statusFilter}
        onStatusFilterChange={(val) => {
          setStatusFilter(val);
          if (!searchTerm.trim()) {
            lastSelectedStatusFilterRef.current = val;
            safeSetItemSession("taka_detail_status_filter", val);
          }
        }}
        searchTerm={searchTerm}
        onSearchTermChange={(val) => {
          setSearchTerm(val);
          if (!val) {
            setDetailTabFilterCode("");
            onClearFocus?.();
          }
        }}
        availableColumnsForUser={availableColumnsForUser}
        visibleColumns={visibleColumns}
        onToggleColumn={handleToggleColumn}
        hasWritePermission={hasWritePermission}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        canWrite={canWrite}
        onAddProject={onAddProject}
        onAddTask={onAddTask}
        activeProjectInView={activeProjectInView}
        filteredProjects={filteredProjects}
        projects={projects}
        handleSyncAllPredecessors={handleSyncAllPredecessors}
        isSyncingPredecessors={isSyncingPredecessors}
        currentUser={currentUser}
        handleExportProjects={handleExportProjects}
        handleImportProjects={handleImportProjects}
        handleExportTasks={handleExportTasks}
        handleImportTasks={handleImportTasks}
        parseCSVDate={parseCSVDate}
      />

      <div className="hidden xl:block flex-grow pb-16">
        <div 
          ref={tableContainerRef}
          onScroll={handleTableScroll}
          className="overflow-auto border border-slate-200 dark:border-[#444446] rounded-xl shadow-xs bg-white dark:bg-[#1e1e20]"
          style={{ height: "calc(100vh - 210px)", minHeight: "520px" }}
        >
          <table 
            className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full"
            style={{ width: `${totalTableWidth}px` }}
          >
            <thead className="sticky top-0 z-20 text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446] shadow-xs">
              <DetailTableHeader
                visibleColumns={visibleColumns}
                colWidths={colWidths}
                canWrite={canWrite}
                selectedTaskIds={selectedTaskIds}
                allVisibleTaskIds={allVisibleTaskIds}
                expandedCodes={expandedCodes}
                filteredProjects={filteredProjects}
                availableColumnsForUser={availableColumnsForUser}
                sortConfig={sortConfig}
                onResize={handleResize}
                onToggleColumn={handleToggleColumn}
                onSort={handleSort}
                onSelectAllChange={(checked) => {
                  if (checked) {
                    setSelectedTaskIds(new Set(allVisibleTaskIds));
                  } else {
                    setSelectedTaskIds(new Set());
                  }
                }}
                onToggleExpandAll={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p => String(p.id!)) : [])}
              />
            </thead>
            <tbody>
              {paddingTop > 0 && (
                <tr style={{ height: `${paddingTop}px` }}>
                  <td colSpan={visibleColumns.length} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
              {flatTableRows.slice(startIndex, endIndex).map((item) => {
                if (item.type === "project") {
                  const groupTasks = item.groupTasks;
                  const isAllTasksSelected = groupTasks.length > 0 && groupTasks.every(t => selectedTaskIds.has(t.id));
                  return (
                    <DetailProjectRow
                      key={item.key}
                      item={item}
                      visibleColumns={visibleColumns}
                      canWrite={canWrite}
                      isAllTasksSelected={isAllTasksSelected}
                      allowedStoreOptions={allowedStoreOptions}
                      allowedLocationOptions={allowedLocationOptions}
                      onToggleGroup={toggleGroup}
                      onSelectAllTasksInProject={handleSelectAllTasksInProject}
                      onUpdateProject={handleUpdateProject}
                      onSortSubTasks={handleSortSubTasks}
                      onEditProject={onEditProject}
                      onAddTask={onAddTask}
                      onDeleteProject={handleDeleteProject}
                    />
                  );
                }

                const t = item.task;
                const actStatus = taskActualStatusMap.get(t.id) || { label: 'Pending', color: 'bg-slate-50 text-slate-600' };

                return (
                  <DetailTaskRow
                    key={item.key}
                    item={item}
                    visibleColumns={visibleColumns}
                    canWrite={canWrite}
                    isSelected={selectedTaskIds.has(t.id)}
                    isDragging={draggingTaskIds.includes(t.id)}
                    isDragOver={dragOverTaskId === t.id}
                    dropPosition={dragOverTaskId === t.id ? dropPosition : null}
                    draggingTaskNames={draggingTaskNames}
                    taskCode={taskCodeMap.get(t.id) || ''}
                    isFocused={initialFocusTaskId === t.id}
                    delStatusText={actStatus.label}
                    delStatusColorClass={actStatus.color}
                    tasks={tasks}
                    projects={projects}
                    onToggleSelectTask={handleToggleSelectTask}
                    onEditTask={onEditTask}
                    onUpdateTask={handleUpdateTask}
                    onMoveTask={handleMoveTask}
                    onDeleteTask={handleDeleteTask}
                    onDragStart={handleDetailTaskDragStart}
                    onDragOver={handleDetailTaskDragOver}
                    onDragLeave={handleDetailTaskDragLeave}
                    onDragEnd={handleDetailTaskDragEnd}
                    onDrop={handleDetailTaskDrop}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: `${paddingBottom}px` }}>
                  <td colSpan={visibleColumns.length} style={{ padding: 0, border: 'none' }} />
                </tr>
              )}
              {visibleCount < filteredProjects.length && (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-4 text-center bg-white/90 dark:bg-[#1e1e20]/90 backdrop-blur-sm border-t border-slate-200 dark:border-[#444446]">
                    <button
                      onClick={() => setVisibleCount(prev => Math.min(prev + 30, filteredProjects.length))}
                      className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-xs transition-colors text-sm cursor-pointer active:scale-95 touch-manipulation"
                    >
                      Load More Projects ({filteredProjects.length - visibleCount} remaining)
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DetailMobileView
        filteredProjects={filteredProjects}
        expandedCodes={expandedCodes}
        setExpandedCodes={setExpandedCodes}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        projectInfoMap={projectInfoMap}
        getProjectInfo={getProjectInfo}
        sortConfig={sortConfig}
        delegationGroupByParentKey={delegationGroupByParentKey}
        initialFocusTaskId={initialFocusTaskId}
        canWrite={canWrite}
        tasks={tasks}
        projects={projects}
        lowerSearchTerm={lowerSearchTerm}
        delegationGroups={delegationGroups}
        toggleGroup={toggleGroup}
        onEditProject={onEditProject}
        onAddTask={onAddTask}
        onEditTask={onEditTask}
        handleUpdateProject={handleUpdateProject}
        handleMoveTask={handleMoveTask}
        handleUpdateTask={handleUpdateTask}
        handleDeleteTask={handleDeleteTask}
      />

      <DetailFocusControls 
        initialFocusTaskId={initialFocusTaskId}
        onBackToGantt={handleBackToGantt}
        onClearFocus={onClearFocus ? handleClearFocus : undefined}
      />

      <DetailFloatingActionBar
        selectedCount={selectedTaskIds.size}
        canWrite={canWrite}
        onBulkAction={handleBulkAction}
        onClearSelection={() => { setSelectedTaskIds(new Set()); lastCheckedTaskIdRef.current = null; }}
      />
    </div>
  );
}
