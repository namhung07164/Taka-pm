import { useEnrichedData } from '../hooks/useEnrichedData';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import React, {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  useDeferredValue,
} from "react";
import { useLanguage } from "../lib/LanguageContext";
import {
  Project,
  Task,
  AppUser,
  DelegationGroup,
  PermissionMatrix,
  AppRole,
} from "../types";
import {
  getStatus,
  getTaskStatus,
  parseDateTime,
  formatToDatetimeLocal,
  cn,
  formatDisplayDateMain,
  formatDisplayDateTime,
  getDefaultStoreFilter,
  resolveActualStatus,
  scrollToElement,
  matchesAdvancedSearch,
  computeActProgressPercent,
  getUserDelegationRoleForTask,
  getUserAllowedStores,
  getEffectiveStoreFilter,
} from "../lib/utils";
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";
import { DebouncedSearchInput } from "./DebouncedSearchInput";
import {
  sortGroupTasks,
  buildTaskNoMap,
  parsePredecessors,
  getPredecessorCodeUpdates,
  updatePredecessorsStrings,
  computeTaskCode,
  scheduleDependentTasks,
  reorderAndCalculateTasks,
} from "../lib/ganttUtils";
import { ColumnAdder } from "./ColumnAdder";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Save,
  Maximize2,
  Minimize2,
  Printer,
  X,
  EyeOff,
  Eye,
  Edit2,
  Trash2,
  GripVertical,
  Play,
  Pin,
  Target,
  Download,
  Palette,
  Calculator,
  Calendar,
  Loader2,
  Layers,
  Unlink,
  CornerDownRight,
} from "lucide-react";
import { TaskModularModal } from "./TaskModularModal";
import {
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  startOfQuarter,
  endOfQuarter,
  eachQuarterOfInterval,
  format,
  differenceInDays,
  addMonths,
  subMonths,
  getDaysInMonth,
  isToday,
} from "date-fns";
import { doc, collection, getDocs, query, where, deleteField } from 'firebase/firestore';
import {   db, APP_ID , writeBatch , updateDoc } from "../lib/firebase";
import { useSyncScroll } from "./Gantt/GanttHooks";
import { formatGanttDate, positionTooltip, filterTaskByDate, getPKey } from "./Gantt/GanttUtils";
import { ConfirmModal } from "./ConfirmModal";
import { MultiCheckboxSelect } from "./MultiCheckboxSelect";
import { useLocationOptions } from "../hooks/useLocationOptions";

interface GanttTabProps {
  onNavigateToTaskDetail?: (taskId: string) => void;
  onNavigateToLayout?: (
    store: string,
    location: string,
    projectCode?: string,
    sourceTaskId?: string,
  ) => void;
  initialFocusTaskId?: string;
  printDateRangeOverride?: { start: Date; end: Date };
  onClearFocus?: () => void;
}

import { GanttProjectRow } from './Gantt/GanttProjectRow';
import { GanttTaskRow } from './Gantt/GanttTaskRow';
import { GanttToolbar } from './Gantt/GanttToolbar';
import { GanttTimelineHeader } from './Gantt/GanttTimelineHeader';
import { GanttGridOverlay } from './Gantt/GanttGridOverlay';

export function GanttTab({
  
  
  
  
  
  
  onNavigateToTaskDetail, onNavigateToLayout, initialFocusTaskId, onClearFocus, printDateRangeOverride}: GanttTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const activeTab = useAppStore(state => state.activeTab);
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const locationOptions = useLocationOptions();
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();

  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [tempStartDate, setTempStartDate] = useState("");
  const [tempEndDate, setTempEndDate] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilterStartDate(tempStartDate);
      setFilterEndDate(tempEndDate);
    }, 600);
    return () => clearTimeout(timer);
  }, [tempStartDate, tempEndDate]);
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutsideDate = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setIsDateFilterOpen(false);
      }
    };
    if (isDateFilterOpen) {
      document.addEventListener("mousedown", handleClickOutsideDate);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideDate);
  }, [isDateFilterOpen]);



  const [searchTerm, setSearchTerm] = useState(() => {
    return safeGetItemSession("taka_gantt_search") || "";
  });
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const printRangeType = useAppStore(state => state.printRangeType);
  const globalPrintStartDate = useAppStore(state => state.printStartDate);
  const globalPrintEndDate = useAppStore(state => state.printEndDate);

  const printStartDateOverride = printRangeType === "custom" ? globalPrintStartDate : null;
  const printEndDateOverride = printRangeType === "custom" ? globalPrintEndDate : null;

  useEffect(() => {
    safeSetItemSession("taka_gantt_search", searchTerm);
  }, [searchTerm]);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const isTasksLoading = useAppStore(state => state.isTasksLoading);
  const isTasksRequested = useAppStore(state => state.isTasksRequested);
  const setIsTasksRequested = useAppStore(state => state.setIsTasksRequested);
  const setToast = useAppStore(state => state.setToast);
  const ganttTabFocusTaskId = useAppStore(state => state.ganttTabFocusTaskId);
  const setGanttTabFocusTaskId = useAppStore(state => state.setGanttTabFocusTaskId);
  const ganttTriggerToday = useAppStore(state => state.ganttTriggerToday);

  useEffect(() => {
    if (!isTasksRequested) {
      setIsTasksRequested(true);
    }
  }, [isTasksRequested, setIsTasksRequested]);

  const [filterProjectStatus, setFilterProjectStatus] = useState<string>(() => {
    const initSearch = safeGetItemSession("taka_gantt_search") || "";
    if (initSearch.trim()) return "all";
    return (
      safeGetItemSession("taka_gantt_filter_project_status") || "active"
    );
  });

  const lastSelectedStatusFilterRef = useRef<string>(
    safeGetItemSession("taka_gantt_filter_project_status") || "active"
  );
  const wasSearchingRef = useRef<boolean>(!!(safeGetItemSession("taka_gantt_search") || "").trim());

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (filterProjectStatus !== 'all') {
        lastSelectedStatusFilterRef.current = filterProjectStatus;
        safeSetItemSession("taka_gantt_filter_project_status", filterProjectStatus);
      }
      setFilterProjectStatus('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_gantt_filter_project_status") || "active";
      setFilterProjectStatus(restored);
      wasSearchingRef.current = false;
    }
  }, [searchTerm]);

  const expandedProjects = useAppStore(state => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore(state => state.toggleProjectExpansion);
  const setExpandedProjects = useAppStore(state => state.setExpandedProjectIds);
  const setVisibleActiveProjectIds = useAppStore(state => state.setVisibleActiveProjectIds);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [sideWidth, setSideWidth] = useState<number>(() => {
    const saved = safeGetItemLocal("taka_gantt_side_width");
    return saved ? parseInt(saved, 10) : 300;
  });
  const [isResizingSide, setIsResizingSide] = useState(false);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    const saved = safeGetItemLocal("taka_gantt_columns");
    try {
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  const safeColumns = visibleColumns || [];
  const [hiddenRows, setHiddenRows] = useState<string[]>(() => {
    const saved = safeGetItemSession("taka_gantt_hidden_rows");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeSetItemSession(
      "taka_gantt_hidden_rows",
      JSON.stringify(hiddenRows),
    );
  }, [hiddenRows]);
  const [isHideMode, setIsHideMode] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  useEffect(() => {
    const handleBeforePrint = () => {
      setIsPrinting(true);
      if (mainScrollRef.current && containerRef.current) {
        containerRef.current.style.setProperty(
          "--print-scroll-x",
          `${mainScrollRef.current.scrollLeft}px`,
        );
      }
    };
    const handleAfterPrint = () => {
      setIsPrinting(false);
      if (containerRef.current) {
        containerRef.current.style.setProperty("--print-scroll-x", `0px`);
      }
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const lastSelectedTaskIdRef = useRef<string | null>(null);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sumMode, setSumMode] = useState<"none" | "duration">("none");
  const [isHighlightDelegationOn, setIsHighlightDelegationOn] = useState(false);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after' | null>(null);
  const [draggingTaskIds, setDraggingTaskIds] = useState<string[]>([]);

  // Task Modular state & handlers (Gantt tab only)
  const [isTaskModularModalOpen, setIsTaskModularModalOpen] = useState(false);
  const [expandedModularTasks, setExpandedModularTasks] = useState<string[]>(() => {
    const saved = safeGetItemSession("taka_gantt_expanded_modular_tasks");
    try {
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    safeSetItemSession(
      "taka_gantt_expanded_modular_tasks",
      JSON.stringify(expandedModularTasks),
    );
  }, [expandedModularTasks]);

  // Fast O(1) Sets for instant checkbox and modular state checks
  const selectedTaskSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
  const selectedProjectSet = useMemo(() => new Set(selectedProjectIds), [selectedProjectIds]);
  const expandedModularSet = useMemo(() => new Set(expandedModularTasks), [expandedModularTasks]);

  const toggleModularParent = (parentTaskId: string | number) => {
    const idStr = String(parentTaskId);
    setExpandedModularTasks((prev) =>
      prev.includes(idStr) ? prev.filter((id) => id !== idStr) : [...prev, idStr],
    );
  };

  const handleGroupModularTasks = (parentTaskId: string, childTaskIds: string[]) => {
    if (!parentTaskId || childTaskIds.length === 0) return;

    // RULE (Gộp task modular chỉ 1 lớp duy nhất):
    // Nếu task mẹ nào đã có task modular con và gộp vào task mẹ khác thì sẽ gom các task modular con đó vào trong cùng task mẹ và bỏ đi liên kết cũ.
    const finalTargetIds = new Set<string>();

    childTaskIds.forEach((id) => {
      const idStr = String(id);
      if (idStr !== String(parentTaskId)) {
        finalTargetIds.add(idStr);
      }
    });

    // Gom tất cả các task con (sub-tasks) của bất kỳ task nào trong danh sách đang được chọn:
    tasks.forEach((t) => {
      if (t.parentTaskId && childTaskIds.map(String).includes(String(t.parentTaskId))) {
        const childIdStr = String(t.id);
        if (childIdStr !== String(parentTaskId)) {
          finalTargetIds.add(childIdStr);
        }
      }
    });

    const finalChildTaskIds = Array.from(finalTargetIds);
    if (finalChildTaskIds.length === 0) return;

    // 1. Optimistic Update in Zustand store
    const nowIso = new Date().toISOString();
    const updates = finalChildTaskIds.map((id) => ({
      id,
      parentTaskId,
      updatedAt: nowIso,
    }));
    useAppStore.getState().optimisticUpdateTasks(updates);

    // 2. Remove any former parents from expandedModularTasks (vì chúng đã trở thành task con, không còn con riêng)
    // Và tự động bung mở task mẹ mới để thấy ngay kết quả
    const formerParentIds = childTaskIds.map(String);
    const pIdStr = String(parentTaskId);
    setExpandedModularTasks((prev) => {
      const filtered = prev.filter((id) => !formerParentIds.includes(id));
      return filtered.includes(pIdStr) ? filtered : [...filtered, pIdStr];
    });

    // 3. Clear selection and close modal
    setSelectedTaskIds([]);
    setIsTaskModularModalOpen(false);
    setToast({
      title: "Task Modular",
      message: `Đã gom ${finalChildTaskIds.length} task vào task mẹ (1 lớp duy nhất)`,
      type: "success",
    });

    // 4. Non-blocking Firestore batch update
    try {
      const batch = writeBatch(db);
      finalChildTaskIds.forEach((tId) => {
        const ref = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tId);
        batch.update(ref, {
          parentTaskId,
          updatedAt: nowIso,
        });
      });
      batch.commit().catch((err) => console.error("Batch update modular tasks error:", err));
    } catch (err) {
      console.error("Group modular tasks error:", err);
    }
  };

  const handleUnlinkModularTasks = (childTaskIds: string[]) => {
    if (childTaskIds.length === 0) return;

    // 1. Optimistic Update in Zustand store
    const updates = childTaskIds.map((id) => ({
      id,
      parentTaskId: undefined,
      updatedAt: new Date().toISOString(),
    }));
    useAppStore.getState().optimisticUpdateTasks(updates);

    setSelectedTaskIds((prev) => prev.filter((id) => !childTaskIds.includes(id)));
    setIsTaskModularModalOpen(false);
    setToast({
      title: "Task Modular",
      message: `Đã tách ${childTaskIds.length} task khỏi task mẹ`,
      type: "success",
    });

    // 2. Non-blocking Firestore batch update
    try {
      const batch = writeBatch(db);
      childTaskIds.forEach((tId) => {
        const ref = doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tId);
        batch.update(ref, {
          parentTaskId: deleteField(),
          updatedAt: new Date().toISOString(),
        });
      });
      batch.commit().catch((err) => console.error("Batch unlink modular tasks error:", err));
    } catch (err) {
      console.error("Unlink modular tasks error:", err);
    }
  };

  const handleTaskCheckboxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, taskId: string) => {
    const checked = e.target.checked;
    const shiftKey = (e.nativeEvent as any).shiftKey;
    if (shiftKey && lastSelectedTaskIdRef.current) {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"][data-task-checkbox="true"]')) as HTMLInputElement[];
      const taskIds = checkboxes.map(cb => cb.dataset.taskId);
      const startIndex = taskIds.indexOf(lastSelectedTaskIdRef.current);
      const endIndex = taskIds.indexOf(taskId);
      if (startIndex !== -1 && endIndex !== -1) {
        const min = Math.min(startIndex, endIndex);
        const max = Math.max(startIndex, endIndex);
        const idsToToggle = taskIds.slice(min, max + 1).filter(Boolean) as string[];
        if (checked) {
          setSelectedTaskIds(prev => Array.from(new Set([...prev, ...idsToToggle])));
        } else {
          const toggleSet = new Set(idsToToggle);
          setSelectedTaskIds(prev => prev.filter(id => !toggleSet.has(id)));
        }
      } else {
        if (checked) {
          setSelectedTaskIds(prev => [...prev, taskId]);
        } else {
          setSelectedTaskIds(prev => prev.filter(id => id !== taskId));
        }
      }
    } else {
      if (checked) {
        setSelectedTaskIds(prev => [...prev, taskId]);
      } else {
        setSelectedTaskIds(prev => prev.filter(id => id !== taskId));
      }
    }
    lastSelectedTaskIdRef.current = taskId;
  }, []);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    confirmStyle?: "danger" | "primary";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showStart = safeColumns.includes("start");
  const showFinish = safeColumns.includes("finish");
  const showParty = safeColumns.includes("party");
  const showDuration = safeColumns.includes("duration");

  const startColWidth = 220;
  const finishColWidth = 220;
  const partyColWidth = 95;
  const durationColWidth = 60;

  const hiddenRowsSet = useMemo(() => new Set(hiddenRows), [hiddenRows]);

  const getRowVisibilityClass = (id: string) => {
    const isHidden = hiddenRowsSet.has(id);
    if (isHidden && !isHideMode) return "hidden print:hidden";
    if (isHidden && isHideMode) return "opacity-50 print:hidden";
    return "";
  };

  const toggleHideRow = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenRows((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleToggleColumn = (col: string) => {
    setVisibleColumns((prev) => {
      const arr = Array.isArray(prev) ? prev : [];
      const nw = arr.includes(col)
        ? arr.filter((c) => c !== col)
        : [...arr, col];
      safeSetItemLocal("taka_gantt_columns", JSON.stringify(nw));
      return nw;
    });
  };

  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = !isArchiveYear &&
    currentUser?.role === "admin" ||
    !!(
      currentUser?.role &&
      permissionMatrix?.[currentUser.role as AppRole]?.Write?.general
    );

  // Use CSS-based pseudo-fullscreen for better iOS compatibility
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const [viewMode, setViewMode] = useState<"weekly" | "monthly" | "quarterly">("monthly");
  const [dayWidth, setDayWidth] = useState<number>(() => {
    const saved = safeGetItemLocal("taka_gantt_day_width");
    return saved ? Math.round(parseFloat(saved)) : 4;
  });
  const [isWidthChanged, setIsWidthChanged] = useState(false);
  const [scaleInput, setScaleInput] = useState("");

  useEffect(() => {
    setScaleInput(Math.round((dayWidth / 4) * 100).toString());
  }, [dayWidth]);

  const [customToday, setCustomToday] = useState<Date>(() => {
    const saved = safeGetItemLocal("taka_gantt_custom_today");
    return saved ? new Date(saved) : new Date();
  });
  const [isDraggingToday, setIsDraggingToday] = useState(false);

  const { topScrollRef, mainScrollRef, handleTopScroll, handleMainScroll } = useSyncScroll();

  const saveDayWidth = () => {
    safeSetItemLocal("taka_gantt_day_width", dayWidth.toString());
    setIsWidthChanged(false);
  };

  const uniqueYears = useMemo(() => {
    const years = new Set([...projects.map(p => String(p.year)).filter(Boolean), '2026', '2027']);
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const uniqueStores = allowedStores;





  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach(t => {
      const key = getPKey(t.projectCode, t.projectYear, t.projectStore);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : (p.start ? String(p.start).substring(0, 4) : null));
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
      if (globalLocationFilter.length > 0 && (!p.location || !globalLocationFilter.includes(p.location))) return false;

      if (filterProjectStatus && filterProjectStatus !== "all") {
        const pStart = p.computedTakStart || p.start || "9999-12-31";
        const pEnd = p.computedTakCompl || p.handover;
        const pStatus = getStatus(
          pStart,
          pEnd,
          p.computedOpening || p.opening,
          p.code,
        );

        if (filterProjectStatus === "active") {
          if (pStatus !== "On process" && pStatus !== "Upcoming") return false;
        } else if (pStatus !== filterProjectStatus) {
          return false;
        }
      }

      const pKey = getPKey(p.code, p.year, p.store);
      let projectTasks = tasksByProject.get(pKey);
      if (!projectTasks || projectTasks.length === 0) {
        const pCode = String(p.code || "").trim().toLowerCase();
        projectTasks = tasks.filter(t => {
          const tCode = String(t.projectCode || "").trim().toLowerCase();
          if (tCode !== pCode) return false;
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          return matchesStore && matchesYear;
        });
      }
      projectTasks = projectTasks || [];

      if (filterStartDate || filterEndDate) {
        if (projectTasks.length > 0) {
          projectTasks = projectTasks.filter(t => filterTaskByDate(t, filterStartDate, filterEndDate));
          if (projectTasks.length === 0) return false;
        } else {
          const pStart = p.computedTakStart || p.start;
          const pEnd = p.computedTakCompl || p.handover;
          if (filterStartDate && pEnd && pEnd < filterStartDate) return false;
          if (filterEndDate && pStart && pStart > filterEndDate) return false;
        }
      }
      
      if (deferredSearchTerm) {
        return matchesAdvancedSearch(
          deferredSearchTerm,
          [p.code, p.name, p.store, p.location],
          [],
          (term, andTerms) => {
            const taskSource = projectTasks.length > 0 ? projectTasks : (p.taskSummaries || []);
            if (taskSource.length === 0) {
              return andTerms.every((tTerm) =>
                [p.code, p.name, p.store, p.location].some((v) =>
                  String(v || "")
                    .toLowerCase()
                    .includes(tTerm)
                )
              );
            }
            return taskSource.some((t: any) => {
              return andTerms.every((tTerm) => {
                const inProject = [p.code, p.name, p.store, p.location].some(
                  (v) =>
                    String(v || "")
                      .toLowerCase()
                      .includes(tTerm),
                );
                if (inProject) return true;
                return [t.name, t.party].some((v) =>
                  String(v || "")
                    .toLowerCase()
                    .includes(tTerm),
                );
              });
            });
          },
        );
      }

      return true;
    });
  }, [
    projects,
    tasksByProject,
    tasks,
    effectiveStore,
    globalYearFilter,
    globalStoreFilter,
    globalLocationFilter,
    deferredSearchTerm,
    filterProjectStatus,
    filterStartDate,
    filterEndDate,
  ]);

  const [visibleCount, setVisibleCount] = useState(20);

  const sortedProjects = useMemo(() => {
    const statusPriority: Record<string, number> = {
      "On process": 1,
      Upcoming: 2,
      Completed: 3,
      Handover: 4,
      Canceled: 5,
    };

    return [...filteredProjects].sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const aStart = a.computedTakStart || a.start || "9999-12-31";
      const aEnd = a.computedTakCompl || a.handover;
      const aStatus = getStatus(
        aStart,
        aEnd,
        a.computedOpening || a.opening,
        a.code,
      );

      const bStart = b.computedTakStart || b.start || "9999-12-31";
      const bEnd = b.computedTakCompl || b.handover;
      const bStatus = getStatus(
        bStart,
        bEnd,
        b.computedOpening || b.opening,
        b.code,
      );

      const pA = statusPriority[aStatus] || 99;
      const pB = statusPriority[bStatus] || 99;

      if (pA !== pB) return pA - pB;

      // Special sorting for 'On process' : prioritize finish date proximity to today
      if (aStatus === "On process") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const finishA = parseDateTime(aEnd || a.computedOpening || a.opening);
        const finishB = parseDateTime(bEnd || b.computedOpening || b.opening);

        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) {
            return diffA - diffB;
          }
        }
      }

      return aStart.localeCompare(bStart);
    });
  }, [filteredProjects]);

  const lastAutoExpandedSearchRef = useRef<string>('');

  useEffect(() => {
    if (searchTerm && searchTerm.trim() !== '' && searchTerm !== lastAutoExpandedSearchRef.current && sortedProjects.length > 0) {
      const exactMatch = sortedProjects.find(p => p.code?.trim().toLowerCase() === searchTerm.trim().toLowerCase());
      if (exactMatch && exactMatch.id) {
        lastAutoExpandedSearchRef.current = searchTerm;
        if (!expandedProjects.includes(exactMatch.id)) {
          toggleProjectExpansion(exactMatch.id);
        }
      }
    }
  }, [searchTerm, sortedProjects, expandedProjects, toggleProjectExpansion]);

  // Auto-expand modular parent tasks if search matches a child task directly
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;
    const parentsToExpand: string[] = [];
    tasks.forEach((t) => {
      if (t.parentTaskId) {
        const match = matchesAdvancedSearch(term, [t.name, t.party]);
        if (match && !parentsToExpand.includes(String(t.parentTaskId))) {
          parentsToExpand.push(String(t.parentTaskId));
        }
      }
    });
    if (parentsToExpand.length > 0) {
      setExpandedModularTasks((prev) => {
        const newIds = parentsToExpand.filter((id) => !prev.includes(id));
        return newIds.length > 0 ? [...prev, ...newIds] : prev;
      });
    }
  }, [searchTerm, tasks]);

  const paginatedProjects = useMemo(() => {
    if (printDateRangeOverride) return sortedProjects;
    return sortedProjects.slice(0, visibleCount);
  }, [sortedProjects, visibleCount, printDateRangeOverride]);

  const prevVisibleIdsRef = useRef<string>("");
  useEffect(() => {
    const visibleIds = paginatedProjects.map(p => String(p.id || p.no));
    const idsKey = visibleIds.join(',');
    if (prevVisibleIdsRef.current !== idsKey) {
      prevVisibleIdsRef.current = idsKey;
      setVisibleActiveProjectIds(visibleIds);
    }
  }, [paginatedProjects, setVisibleActiveProjectIds]);

  useEffect(() => {
    return () => {
      useAppStore.getState().setVisibleActiveProjectIds([]);
    };
  }, []);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + 20);
  };

  const { timeUnits, startDate, endDate, totalDays } = useMemo(() => {
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    const updateMinMax = (dateStr: string | undefined) => {
      const d = parseDateTime(dateStr);
      if (d && !isNaN(d.getTime())) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    };

    sortedProjects.forEach((p) => {
      updateMinMax(p.computedTakStart || p.start);
      updateMinMax(p.computedTakCompl || p.handover);
      updateMinMax(p.computedOpening || p.opening);
    });

    tasks.forEach(t => {
      if (sortedProjects.some((p) => p.code === t.projectCode)) {
        updateMinMax(t.start);
        updateMinMax(t.finish);
      }
    });

    if (!minDate) minDate = new Date();
    if (!maxDate) maxDate = new Date();

    const targetToday = customToday || new Date();
    if (!minDate || targetToday < minDate) minDate = targetToday;
    if (!maxDate || targetToday > maxDate) maxDate = targetToday;

    const overrideStart = printStartDateOverride
      ? parseDateTime(printStartDateOverride)
      : null;
    const overrideEnd = printEndDateOverride
      ? parseDateTime(printEndDateOverride)
      : null;

    let start = (overrideStart && !isNaN(overrideStart.getTime())) 
      ? overrideStart 
      : subMonths(startOfMonth(minDate), 1);
    let end = (overrideEnd && !isNaN(overrideEnd.getTime())) 
      ? overrideEnd 
      : addMonths(endOfMonth(maxDate), 1);
      
    if (printDateRangeOverride) {
      start = printDateRangeOverride.start;
      end = printDateRangeOverride.end;
    }

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    let intervalUnits: { date: Date, days: number, labelPrimary: string, labelSecondary: string }[] = [];

    if (viewMode === "weekly") {
      start = startOfWeek(start, { weekStartsOn: 1 });
      end = endOfWeek(end, { weekStartsOn: 1 });
      const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      intervalUnits = weeks.map(w => {
        const eow = endOfWeek(w, { weekStartsOn: 1 });
        const days = differenceInDays(eow > end ? end : eow, w) + 1;
        return { date: w, days: 7, labelPrimary: `W${format(w, "w")}`, labelSecondary: format(w, "MMM yyyy") };
      });
    } else if (viewMode === "quarterly") {
      start = startOfQuarter(start);
      end = endOfQuarter(end);
      const quarters = eachQuarterOfInterval({ start, end });
      intervalUnits = quarters.map(q => {
        const eoq = endOfQuarter(q);
        const days = differenceInDays(eoq, q) + 1;
        return { date: q, days, labelPrimary: `Q${format(q, "Q")}`, labelSecondary: format(q, "yyyy") };
      });
    } else {
      start = startOfMonth(start);
      end = endOfMonth(end);
      const months = eachMonthOfInterval({ start, end });
      intervalUnits = months.map(m => {
        const days = getDaysInMonth(m);
        return { date: m, days, labelPrimary: format(m, "MMM"), labelSecondary: format(m, "yyyy") };
      });
    }

    const days = differenceInDays(end, start) + 1;

    return {
      timeUnits: intervalUnits,
      startDate: start,
      endDate: end,
      totalDays: days,
    };
  }, [sortedProjects, tasks, viewMode, printStartDateOverride, printEndDateOverride, printDateRangeOverride, customToday]);

  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [dependencyLines, setDependencyLines] = useState<
    { id: string; d: string; arrowDir: string }[]
  >([]);
  const tableRef = useRef<HTMLTableElement>(null);

  const taskNoMap = useMemo(
    () => buildTaskNoMap(projects, tasks),
    [projects, tasks],
  );

  // Precompute task codes map once per [projects, tasks] to avoid O(N*M*logM) sorting on every row render
  const taskCodeMap = useMemo(() => {
    const codeMap = new Map<string, string>();
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const safeProjects = Array.isArray(projects) ? projects : [];
    const tasksByProjectCode = new Map<string, Task[]>();

    for (const t of safeTasks) {
      if (!t) continue;
      const code = String(t.projectCode || '').trim().toLowerCase();
      let arr = tasksByProjectCode.get(code);
      if (!arr) {
        arr = [];
        tasksByProjectCode.set(code, arr);
      }
      arr.push(t);
    }

    safeProjects.forEach((p) => {
      if (!p) return;
      const pCode = String(p.code || '').trim().toLowerCase();
      const pTasks = tasksByProjectCode.get(pCode) || [];
      const groupTasks = sortGroupTasks(pTasks.filter(t => 
         t &&
         (p.year ? String(t.projectYear || '') === String(p.year) : true) &&
         (p.store ? String(t.projectStore || '') === String(p.store) : true)
      ));
      groupTasks.forEach((t, i) => {
        if (!t) return;
        codeMap.set(t.id, t.taskCodePhu || `${p.code || ''}-${i + 1}`);
      });
    });

    return codeMap;
  }, [projects, tasks]);

  // Precompute delegation groups lookup map once per [delegationGroups] to avoid linear .find() per task
  const delegationGroupByTaskId = useMemo(() => {
    const map = new Map<string, typeof delegationGroups[0]>();
    delegationGroups.forEach((g) => {
      if (g && g.parentTaskId) {
        map.set(g.parentTaskId, g);
      }
    });
    return map;
  }, [delegationGroups]);

  // --- GANTT TIMELINE VIRTUALIZATION ENGINE ---
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const scrollRafRef = useRef<number | null>(null);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight || 800);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setViewportHeight(entry.contentRect.height);
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mainScrollRef]);

  const handleCombinedMainScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    handleMainScroll();
    const st = e.currentTarget.scrollTop;
    if (scrollRafRef.current) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      setScrollTop(st);
    });
  }, [handleMainScroll]);

  // Flatten Gantt projects and their expanded tasks into a single linear array
  const flatGanttRows = useMemo(() => {
    type FlatRow =
      | {
          type: 'project';
          key: string;
          p: Project;
          pIdx: number;
          projectTasks: Task[];
          isExpanded: boolean;
        }
      | {
          type: 'task';
          key: string;
          t: Task;
          isChild: boolean;
          parentTask?: Task;
          hasChildren: boolean;
          childCount: number;
          isModularExpanded: boolean;
          p: Project;
          taskCode: string;
          delegationGroup?: any;
        };

    const rows: FlatRow[] = [];

    paginatedProjects.forEach((p, pIdx) => {
      const isExpanded = expandedProjects.includes(p.id!);
      const pKey = getPKey(p.code, p.year, p.store);
      let projectTasks = tasksByProject.get(pKey);
      if (!projectTasks || projectTasks.length === 0) {
        const pCode = String(p.code || "").trim().toLowerCase();
        projectTasks = tasks.filter(t => {
          const tCode = String(t.projectCode || "").trim().toLowerCase();
          if (tCode !== pCode) return false;
          const matchesStore = !t.projectStore || !p.store || String(t.projectStore).trim().toLowerCase() === String(p.store).trim().toLowerCase();
          const matchesYear = !t.projectYear || !p.year || String(t.projectYear).trim() === String(p.year).trim();
          return matchesStore && matchesYear;
        });
      }
      projectTasks = projectTasks || [];
      if (filterStartDate || filterEndDate) {
        projectTasks = projectTasks.filter(t => filterTaskByDate(t, filterStartDate, filterEndDate));
      }
      if (searchTerm) {
        projectTasks = projectTasks.filter((t) =>
          matchesAdvancedSearch(
            searchTerm,
            [p.code, p.name, p.store, p.location],
            [t.name, t.party],
          ),
        );
      }

      projectTasks = sortGroupTasks(projectTasks);

      rows.push({
        type: 'project',
        key: `project-${p.code || ''}-${p.no || ''}-${pIdx}`,
        p,
        pIdx,
        projectTasks,
        isExpanded,
      });

      if (isExpanded) {
        const childTasksMap = new Map<string, Task[]>();
        const isChildSet = new Set<string>();
        const ptMap = new Map(projectTasks.map(pt => [String(pt.id), pt]));

        projectTasks.forEach((t) => {
          if (t.parentTaskId) {
            const currParentId = String(t.parentTaskId);
            if (ptMap.has(currParentId)) {
              let rootParentId = currParentId;
              const visited = new Set<string>([String(t.id), rootParentId]);
              while (true) {
                const pTask = ptMap.get(rootParentId);
                if (pTask && pTask.parentTaskId && !visited.has(String(pTask.parentTaskId))) {
                  if (ptMap.has(String(pTask.parentTaskId))) {
                    rootParentId = String(pTask.parentTaskId);
                    visited.add(rootParentId);
                    continue;
                  }
                }
                break;
              }
              isChildSet.add(String(t.id));
              const list = childTasksMap.get(rootParentId) || [];
              list.push(t);
              childTasksMap.set(rootParentId, list);
            }
          }
        });

        projectTasks.forEach((t) => {
          const tIdStr = String(t.id);
          if (isChildSet.has(tIdStr)) return;
          const children = childTasksMap.get(tIdStr) || [];
          const hasChildren = children.length > 0;
          const isModularExpanded = expandedModularTasks.includes(tIdStr);
          const taskCode = taskCodeMap.get(t.id) || t.taskCodePhu || '';
          const delGroup = delegationGroupByTaskId.get(t.id);

          rows.push({
            type: 'task',
            key: `task-${t.id}`,
            t,
            isChild: false,
            hasChildren,
            childCount: children.length,
            isModularExpanded,
            p,
            taskCode,
            delegationGroup: delGroup,
          });

          if (hasChildren && isModularExpanded) {
            children.forEach((c) => {
              const childTaskCode = taskCodeMap.get(c.id) || c.taskCodePhu || '';
              const childDelGroup = delegationGroupByTaskId.get(c.id);
              rows.push({
                type: 'task',
                key: `task-${c.id}`,
                t: c,
                isChild: true,
                parentTask: t,
                hasChildren: false,
                childCount: 0,
                isModularExpanded: false,
                p,
                taskCode: childTaskCode,
                delegationGroup: childDelGroup,
              });
            });
          }
        });
      }
    });

    return rows;
  }, [
    paginatedProjects,
    expandedProjects,
    tasksByProject,
    tasks,
    filterStartDate,
    filterEndDate,
    searchTerm,
    taskCodeMap,
    delegationGroupByTaskId,
    expandedModularTasks,
    getPKey,
  ]);

  const { totalHeight, rowOffsets } = useMemo(() => {
    const totalRows = flatGanttRows.length;
    const offsets = new Float64Array(totalRows + 1);
    let sum = 0;
    for (let i = 0; i < totalRows; i++) {
      offsets[i] = sum;
      sum += (flatGanttRows[i].type === 'project' ? 44 : 38);
    }
    offsets[totalRows] = sum;
    return { totalHeight: sum, rowOffsets: offsets };
  }, [flatGanttRows]);

  const OVERSCAN = 15;
  const { startIndex, endIndex, paddingTop, paddingBottom } = useMemo(() => {
    const totalRows = flatGanttRows.length;
    if (isPrinting || isExporting || printDateRangeOverride || totalRows === 0) {
      return {
        startIndex: 0,
        endIndex: totalRows,
        paddingTop: 0,
        paddingBottom: 0,
      };
    }

    const visibleTop = Math.max(0, scrollTop);
    const bottomTarget = visibleTop + (viewportHeight || 800);

    let low = 0;
    let high = totalRows - 1;
    let start = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (rowOffsets[mid + 1] <= visibleTop) {
        low = mid + 1;
      } else {
        start = mid;
        high = mid - 1;
      }
    }

    const viewStart = Math.max(0, start - OVERSCAN);

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
  }, [
    rowOffsets,
    totalHeight,
    scrollTop,
    viewportHeight,
    flatGanttRows.length,
    isPrinting,
    isExporting,
    printDateRangeOverride,
  ]);

  const visibleGanttRows = useMemo(() => {
    return flatGanttRows.slice(startIndex, endIndex);
  }, [flatGanttRows, startIndex, endIndex]);

  const totalColSpan = useMemo(() => {
    return 1 +
      (showStart ? 1 : 0) +
      (showFinish ? 1 : 0) +
      (showParty ? 1 : 0) +
      (showDuration ? 1 : 0) +
      timeUnits.length;
  }, [showStart, showFinish, showParty, showDuration, timeUnits.length]);

  useEffect(() => {
    const focusId = initialFocusTaskId || ganttTabFocusTaskId;
    if (!focusId || !mainScrollRef.current) return;
    const idx = flatGanttRows.findIndex(r => r.type === 'task' && r.t.id === focusId);
    if (idx >= 0 && rowOffsets[idx] !== undefined) {
      const targetScroll = Math.max(0, rowOffsets[idx] - 120);
      mainScrollRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  }, [initialFocusTaskId, ganttTabFocusTaskId, flatGanttRows, rowOffsets]);

  const drawDependencies = useCallback(() => {
    if (!tableRef.current) return;
    const tableBody = tableRef.current;
    const tableRect = tableBody.getBoundingClientRect();
    const paths: { id: string; d: string; arrowDir: string }[] = [];

    // gather rects for all visible task bars
    const taskRects = new Map<string, DOMRect>();
    const barPrefix = "gantt-bar-task-";
    const bars = tableBody.querySelectorAll(`[id^="${barPrefix}"]`);
    bars.forEach((el) => {
      const id = el.id.substring(barPrefix.length);
      taskRects.set(id, el.getBoundingClientRect());
    });

    tasks.forEach(t => {
      if (!t.predecessor) return;
      const tRect = taskRects.get(t.id);
      if (!tRect) return;

      const preds = parsePredecessors(t.predecessor, taskNoMap, t);
      preds.forEach((pred) => {
        if (!pred) return;
        const predTask = pred.task;
        if (!predTask) return;

        const pRect = taskRects.get(predTask.id);
        if (!pRect) return;

        const startX =
          pred.type === "FS" || pred.type === "FF"
            ? pRect.right - tableRect.left
            : pRect.left - tableRect.left;
        const startY = pRect.top - tableRect.top + pRect.height / 2;

        const endX =
          pred.type === "FS" || pred.type === "SS"
            ? tRect.left - tableRect.left
            : tRect.right - tableRect.left;
        const endY = tRect.top - tableRect.top + tRect.height / 2;
        let arrowDir = "right";

        let d = "";
        const offset = 24;
        const mY = startY + (endY - startY) / 2;
        if (pred.type === "FS") {
          arrowDir = "right";
          if (endX >= startX + 16) {
            d = `M ${startX} ${startY} C ${startX + offset} ${startY}, ${endX - offset} ${endY}, ${endX - 2} ${endY}`;
          } else {
            d = `M ${startX} ${startY} C ${startX + offset} ${startY}, ${startX + offset} ${mY}, ${startX} ${mY} C ${endX - offset} ${mY}, ${endX - offset} ${endY}, ${endX - 2} ${endY}`;
          }
        } else if (pred.type === "SS") {
          arrowDir = "right";
          d = `M ${startX} ${startY} C ${startX - offset} ${startY}, ${endX - offset} ${endY}, ${endX - 2} ${endY}`;
        } else if (pred.type === "FF") {
          arrowDir = "left";
          d = `M ${startX} ${startY} C ${startX + offset} ${startY}, ${endX + offset} ${endY}, ${endX + 2} ${endY}`;
        } else if (pred.type === "SF") {
          arrowDir = "left";
          d = `M ${startX} ${startY} C ${startX - offset} ${startY}, ${endX + offset} ${endY}, ${endX + 2} ${endY}`;
        }

        paths.push({ id: `${predTask.id}-${t.id}`, d, arrowDir });
      });
    });

    setDependencyLines(paths);
  }, [ taskNoMap]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTimeout(drawDependencies, 50));
    return () => cancelAnimationFrame(frame);
  }, [
    
    expandedProjects,
    expandedModularTasks,
    globalYearFilter,
    globalStoreFilter,
    globalLocationFilter,
    searchTerm,
    dayWidth,
    startDate,
    sideWidth,
    safeColumns,
    hiddenRows,
    startIndex,
    endIndex,
    drawDependencies,
  ]);

  useEffect(() => {
    const handleClickOutside = () => setActiveTooltip(null);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  const lastFocusedTaskIdRef = React.useRef<string | null>(null);

  const handleClearFocus = useCallback(() => {
    lastFocusedTaskIdRef.current = null;
    if (onClearFocus) {
      onClearFocus();
    }
    setGanttTabFocusTaskId("");
  }, [onClearFocus, setGanttTabFocusTaskId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isTaskModularModalOpen) {
          e.preventDefault();
          setIsTaskModularModalOpen(false);
          return;
        }

        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen;
        if (hasOpenModal) return;

        if (initialFocusTaskId || ganttTabFocusTaskId) {
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
  }, [initialFocusTaskId, ganttTabFocusTaskId, handleClearFocus]);

  const prevSearchTermRef = useRef(searchTerm);
  useEffect(() => {
    if (prevSearchTermRef.current && (!searchTerm || searchTerm.trim() === "")) {
      if (initialFocusTaskId || ganttTabFocusTaskId) {
        handleClearFocus();
      }
    }
    prevSearchTermRef.current = searchTerm;
  }, [searchTerm, initialFocusTaskId, ganttTabFocusTaskId, handleClearFocus]);

  useEffect(() => {
    if (
      initialFocusTaskId &&
      initialFocusTaskId !== lastFocusedTaskIdRef.current
    ) {
      const task = tasks.find(t => t.id === initialFocusTaskId);
      if (task) {
        const p = projects.find(
          (proj) =>
            proj.code === task.projectCode &&
            proj.store === task.projectStore &&
            String(proj.year) === String(task.projectYear),
        );
        if (p) {
          lastFocusedTaskIdRef.current = initialFocusTaskId;
          if (p.code) setSearchTerm(p.code);
          if (!expandedProjects.includes(p.id!)) {
            toggleProjectExpansion(p.id!);
          }

          setTimeout(() => {
            const el = document.getElementById(
              `gantt-task-${initialFocusTaskId}`,
            );
            if (el) {
              scrollToElement(el);
            }
          }, 500);
        }
      }
    }
  }, [initialFocusTaskId]);

  const toggleProject = (id: string) => {
    // VFS sync trigger
    toggleProjectExpansion(id);
  };

  const hasAnyExpanded = expandedProjects.length > 0;
  const toggleAll = () => {
    if (hasAnyExpanded) {
      setExpandedProjects([]);
    } else {
      setExpandedProjects(sortedProjects.map((p) => String(p.id!)));
    }
  };

  // Find all modular parent tasks and projects containing them for modular expand/collapse
  const { allModularParentIds, modularProjectNoSet } = useMemo(() => {
    const parentIdSet = new Set<string>();
    const projNoSet = new Set<string>();
    const safeTasks = Array.isArray(tasks) ? tasks : [];
    const safeProjects = Array.isArray(sortedProjects) ? sortedProjects : [];

    const taskMap = new Map<string, Task>();
    safeTasks.forEach((t) => {
      if (t) taskMap.set(String(t.id), t);
    });

    safeTasks.forEach((t) => {
      if (t && t.parentTaskId) {
        const pIdStr = String(t.parentTaskId);
        parentIdSet.add(pIdStr);
        const parentTask = taskMap.get(pIdStr);
        if (parentTask) {
          const pCode = String(parentTask.projectCode || "").trim().toLowerCase();
          const pYear = parentTask.projectYear ? String(parentTask.projectYear).trim() : "";
          const pStore = parentTask.projectStore ? String(parentTask.projectStore).trim().toLowerCase() : "";
          const proj = safeProjects.find((p) =>
            String(p.code || "").trim().toLowerCase() === pCode &&
            (pYear && p.year ? String(p.year).trim() === pYear : true) &&
            (pStore && p.store ? String(p.store).trim().toLowerCase() === pStore : true)
          );
          if (proj && proj.no) {
            projNoSet.add(String(proj.no));
          }
        }
      }
    });

    return {
      allModularParentIds: Array.from(parentIdSet),
      modularProjectNoSet: Array.from(projNoSet),
    };
  }, [tasks, sortedProjects]);

  const hasAnyModularExpanded = expandedModularTasks.length > 0;
  const toggleAllModular = () => {
    if (hasAnyModularExpanded) {
      setExpandedModularTasks([]);
    } else {
      setExpandedModularTasks(allModularParentIds);
      // Ensure projects containing modular tasks are also expanded so they are visible
      if (modularProjectNoSet.length > 0) {
        const next = new Set([...expandedProjects, ...modularProjectNoSet]);
        setExpandedProjects(Array.from(next));
      }
    }
  };

  const getBarColor = (status: string, duration?: string | number) => {
    if (
      duration !== undefined &&
      duration !== "" &&
      parseFloat(String(duration)) === 0
    )
      return "bg-orange-500";
    if (status === "On process") return "bg-blue-500";
    if (status === "Upcoming") return "bg-slate-700 dark:bg-slate-500";
    if (status === "Completed") return "bg-green-500";
    if (status === "Handover") return "bg-blue-500";
    if (status === "Canceled") return "bg-slate-400";
    return "bg-slate-400";
  };

  const getExactDays = (d1: Date, d2: Date) => {
    const utc1 = Date.UTC(
      d1.getFullYear(),
      d1.getMonth(),
      d1.getDate(),
      d1.getHours(),
      d1.getMinutes(),
      d1.getSeconds(),
    );
    const utc2 = Date.UTC(
      d2.getFullYear(),
      d2.getMonth(),
      d2.getDate(),
      d2.getHours(),
      d2.getMinutes(),
      d2.getSeconds(),
    );
    return (utc1 - utc2) / (1000 * 60 * 60 * 24);
  };

  const startResizingSide = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSide(true);

    const startX = e.pageX;
    const startWidth = sideWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(150, startWidth + (moveEvent.pageX - startX));
      setSideWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizingSide(false);
      safeSetItemLocal("taka_gantt_side_width", sideWidth.toString());
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const renderBaseline = (
    startStr?: string,
    endStr?: string,
    type: "project" | "task" = "task",
  ) => {
    if (!startStr || !endStr) return null;
    const s = parseDateTime(startStr);
    const e = parseDateTime(endStr);
    if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return null;

    const leftDays = getExactDays(s, startDate);
    const widthDays = getExactDays(e, s) + 1;

    const leftPx = leftDays * dayWidth;
    const widthPx = Math.max(widthDays * dayWidth, 4);

    return (
      <div
        className={`absolute bottom-0.5 h-[4px] rounded-sm bg-yellow-400 dark:bg-yellow-400 border-[0.5px] border-yellow-600/80 shadow-[0_2px_4px_rgba(0,0,0,0.3)] pointer-events-none z-[45] ring-1 ring-white/20`}
        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
        title="Baseline Plan"
      />
    );
  };

  const renderBar = (
    startStr: string | undefined,
    endStr: string | undefined,
    status: string,
    label: string,
    id: string,
    extraVars?: {
      actStatus?: string;
      actStatusColor?: string;
      party?: string;
      actPrg?: number;
      duration?: string | number;
      taskCode?: string;
      predecessors?: string;
      highlight?: 'assignee' | 'creator' | null;
      isSimulation?: boolean;
    },
  ) => {
    const s = parseDateTime(startStr);
    const e = parseDateTime(endStr);

    if (!s || !e || isNaN(s.getTime()) || isNaN(e.getTime())) return null;

    const isTask = id.startsWith("task-");
    const leftDays = getExactDays(s, startDate);
    const widthDays = getExactDays(e, s) + 1;

    const isMilestone =
      extraVars?.duration !== undefined &&
      extraVars.duration !== "" &&
      parseFloat(String(extraVars.duration)) === 0;

    const leftPx = leftDays * dayWidth;
    const widthPx = Math.max(widthDays * dayWidth, isMilestone ? 16 : 4);

    if (isMilestone) {
      return (
        <div
          id={isTask ? `gantt-bar-${id}` : undefined}
          onMouseMove={(ev) => positionTooltip(ev, ev.currentTarget.querySelector(".gantt-tooltip-global"))} 
          onClick={(ev) => {
            ev.stopPropagation();
            if (isEditMode) return;
            positionTooltip(ev, ev.currentTarget.querySelector(".gantt-tooltip-global"));
            setActiveTooltip(activeTooltip === id ? null : id);
          }}
          className={`absolute top-0 bottom-0 md:hover:z-[60] group ${isEditMode ? "cursor-default" : "cursor-pointer"} ${activeTooltip === id ? "z-[60]" : ""} ${extraVars?.highlight === 'assignee' ? "ring-2 ring-yellow-400 ring-offset-1 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.7)]" : extraVars?.highlight === 'creator' ? "ring-2 ring-purple-400 ring-offset-1 rounded-full shadow-[0_0_10px_rgba(192,132,252,0.7)]" : ""}`}
          style={{ left: `${leftPx + dayWidth / 2 - 8}px`, width: "16px" }}
        >
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rotate-45 rounded-sm shadow-sm ${getBarColor(status, extraVars?.duration)}`}
          />
          <div className="absolute inset-0 flex items-center px-4 overflow-visible z-10 pointer-events-none">
            <span className="truncate whitespace-nowrap text-[10px] text-slate-700 dark:text-slate-300 ml-1">
              {label}{" "}
              {extraVars?.actPrg !== undefined ? `(${extraVars.actPrg}%)` : ""}
            </span>
          </div>
          <div
            className={`hidden md:group-hover:flex ${activeTooltip === id ? "!flex" : ""} fixed gantt-tooltip-global z-[99999] w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600  flex-col gap-1 pointer-events-none`}
          >
            <div className="font-bold border-b border-slate-600 pb-1 mb-0.5 flex items-start flex-wrap gap-1.5">
              {label}{" "}
              {extraVars?.taskCode && (
                <span className="text-slate-300 font-mono text-[10px]">
                  [{extraVars.taskCode}]
                </span>
              )}{" "}
              ({status})
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-orange-500 text-white font-bold uppercase tracking-wider">
                Milestone
              </span>
            </div>
            {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
              <div className="flex justify-between gap-4">
                {extraVars?.actPrg !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Prog:</span>
                    <span>{extraVars.actPrg}%</span>
                  </div>
                )}
                {extraVars?.duration !== undefined && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Dur:</span>
                    <span>{extraVars.duration}</span>
                  </div>
                )}
              </div>
            )}
            {(extraVars?.party || extraVars?.predecessors) && (
              <div className="flex justify-between gap-4">
                {extraVars?.party && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Party:</span>
                    <span>{extraVars.party}</span>
                  </div>
                )}
                {extraVars?.predecessors && (
                  <div className="flex gap-2">
                    <span className="text-slate-400">Pred:</span>
                    <span className="max-w-[200px] break-words whitespace-normal" title={extraVars.predecessors}>{extraVars.predecessors}</span>
                  </div>
                )}
              </div>
            )}
            {extraVars?.actStatus && (
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Status:</span>
                <span style={{ color: extraVars.actStatusColor }}>
                  {extraVars.actStatus}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span className="text-slate-400">Dates:</span>
              <span>
                {formatGanttDate(startStr)} -{" "}
                {formatGanttDate(endStr)}
              </span>
            </div>
          </div>
        </div>
      );
    }

    const isSimulation = !!extraVars?.isSimulation;

    return (
      <div
        id={isTask && !isSimulation ? `gantt-bar-${id}` : undefined}
        onMouseMove={(ev) => !isSimulation && positionTooltip(ev, ev.currentTarget.querySelector(".gantt-tooltip-global"))} 
        onClick={(ev) => {
          ev.stopPropagation();
          if (isEditMode || isSimulation) return;
          positionTooltip(ev, ev.currentTarget.querySelector(".gantt-tooltip-global"));
          setActiveTooltip(activeTooltip === id ? null : id);
        }}
        className={cn(
          "absolute top-1.5 bottom-1.5 rounded-sm shadow-sm whitespace-nowrap text-[10px] text-white font-medium select-none",
          isSimulation
            ? "!border-2 !border-dashed !border-blue-500 !bg-blue-500/40 !opacity-90 animate-pulse z-[70] pointer-events-none shadow-md"
            : `md:hover:z-[60] group ${isEditMode ? "cursor-default" : "cursor-pointer"} ${activeTooltip === id ? "z-[60]" : ""} ${extraVars?.highlight === 'assignee' ? "ring-2 ring-yellow-400 ring-offset-1 shadow-[0_0_10px_rgba(250,204,21,0.7)] z-[50]" : extraVars?.highlight === 'creator' ? "ring-2 ring-purple-400 ring-offset-1 shadow-[0_0_10px_rgba(192,132,252,0.7)] z-[50]" : ""}`
        )}
        style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
      >
        <div
          className={cn(
            "absolute inset-0 rounded-sm overflow-hidden",
            isSimulation ? "bg-blue-500/30" : getBarColor(status, extraVars?.duration)
          )}
        >
          {!isSimulation && extraVars?.actPrg !== undefined && (
            <div
              className="absolute left-0 top-0 bottom-0 bg-black/20 dark:bg-white/25 pointer-events-none transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, extraVars.actPrg))}%`,
              }}
            />
          )}
        </div>
        <div className="absolute inset-0 flex items-center px-2 overflow-hidden z-10 pointer-events-none">
          {widthPx > 50 && (
            <span className={cn("truncate flex-1", isSimulation ? "text-blue-900 dark:text-blue-100 font-bold" : "")}>
              {label}{" "}
              {!isSimulation && extraVars?.actPrg !== undefined ? `(${extraVars.actPrg}%)` : ""}
            </span>
          )}
        </div>

        <div
          className={`hidden md:group-hover:flex ${activeTooltip === id ? "!flex" : ""} fixed gantt-tooltip-global z-[99999] w-max max-w-xs md:max-w-sm bg-slate-800 dark:bg-slate-700 text-white text-xs px-2.5 py-2 rounded shadow-lg dark:border dark:border-slate-600  flex-col gap-1 pointer-events-none`}
        >
          <div className="font-bold border-b border-slate-600 pb-1 mb-0.5 flex items-start flex-wrap gap-1.5">
            <span className="whitespace-normal break-words">{label}</span>
            {extraVars?.taskCode && (
              <span className="text-slate-300 font-mono text-[10px] mt-0.5 whitespace-nowrap">
                [{extraVars.taskCode}]
              </span>
            )}
            <span className="whitespace-nowrap mt-0.5">({status})</span>
            {isMilestone && (
              <span className="px-1.5 py-0.5 rounded text-[9px] bg-orange-500 text-white font-bold uppercase tracking-wider">
                Milestone
              </span>
            )}
          </div>
          {(extraVars?.actPrg !== undefined || extraVars?.duration !== undefined) && (
            <div className="flex items-center gap-2">
              {extraVars?.actPrg !== undefined && (
                <>
                  <span className="text-slate-400 dark:text-[#838383] w-10">
                    Prog:
                  </span>
                  <span className="w-8">{extraVars.actPrg}%</span>
                </>
              )}
              {extraVars?.duration !== undefined && (
                <>
                  <span className={cn("text-slate-400 dark:text-[#838383]", extraVars?.actPrg !== undefined ? "ml-1" : "w-10")}>
                    Dur:
                  </span>
                  <span>{extraVars.duration}</span>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-[#838383] w-10">
              Start:
            </span>
            <span>{formatGanttDate(startStr) || "N/A"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-[#838383] w-10">
              Finish:
            </span>
            <span>{formatGanttDate(endStr) || "N/A"}</span>
          </div>
          {extraVars?.actStatus && (
            <div className="flex items-center gap-2">
              <span className="text-slate-400 dark:text-[#838383] w-10">
                Act:
              </span>
              <span
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold rounded-full border whitespace-nowrap",
                  extraVars.actStatusColor || "",
                )}
              >
                {extraVars.actStatus}
              </span>
            </div>
          )}
          {(extraVars?.party || extraVars?.predecessors) && (
            <div className="flex items-center gap-4">
              {extraVars?.party && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 dark:text-[#838383]">
                    Party:
                  </span>
                  <span>{extraVars.party}</span>
                </div>
              )}
              {extraVars?.predecessors && (
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 dark:text-[#838383]">
                    Pred:
                  </span>
                  <span className="max-w-[200px] break-words whitespace-normal" title={extraVars.predecessors}>{extraVars.predecessors}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const todayLeftPx = getExactDays(customToday, startDate) * dayWidth;
  const showToday = customToday >= startDate && customToday <= endDate;

  const scrollToToday = useCallback(
    (smooth = true) => {
      if (!mainScrollRef.current) return;
      const clientWidth = mainScrollRef.current.clientWidth;
      if (clientWidth === 0) {
        requestAnimationFrame(() => scrollToToday(smooth));
        return;
      }

      const dateColsWidth =
        (showStart ? startColWidth : 0) +
        (showFinish ? finishColWidth : 0) +
        (showParty ? partyColWidth : 0) +
        (showDuration ? durationColWidth : 0);

      const targetTodayPx = getExactDays(customToday, startDate) * dayWidth;
      const targetLeft = sideWidth + dateColsWidth + targetTodayPx;
      const halfWidth = clientWidth / 2;
      const scrollPos = Math.max(0, targetLeft - halfWidth);

      if (smooth) {
        mainScrollRef.current.scrollTo({ left: scrollPos, behavior: "smooth" });
        if (topScrollRef.current) {
          topScrollRef.current.scrollTo({ left: scrollPos, behavior: "smooth" });
        }
      } else {
        mainScrollRef.current.scrollLeft = scrollPos;
        if (topScrollRef.current) {
          topScrollRef.current.scrollLeft = scrollPos;
        }
      }
    },
    [
      customToday,
      startDate,
      dayWidth,
      sideWidth,
      showStart,
      startColWidth,
      showFinish,
      finishColWidth,
      showParty,
      partyColWidth,
      showDuration,
      durationColWidth,
    ]
  );

  const handleTodayClick = useCallback(() => {
    const now = new Date();
    setCustomToday(now);
    safeSetItemLocal(
      "taka_gantt_custom_today",
      now.toISOString(),
    );
    setTimeout(() => {
      scrollToToday(true);
    }, 50);
  }, [scrollToToday]);

  const lastTriggerTodayRef = useRef<number>(0);

  useEffect(() => {
    const hasSessionTrigger = safeGetItemSession("taka_gantt_trigger_today") === "true";
    if (hasSessionTrigger || (ganttTriggerToday > 0 && ganttTriggerToday !== lastTriggerTodayRef.current)) {
      lastTriggerTodayRef.current = ganttTriggerToday;
      safeRemoveItemSession("taka_gantt_trigger_today");

      const sessionSearch = safeGetItemSession("taka_gantt_search");
      if (sessionSearch && sessionSearch !== searchTerm) {
        setSearchTerm(sessionSearch);
      }

      const now = new Date();
      setCustomToday(now);
      safeSetItemLocal("taka_gantt_custom_today", now.toISOString());

      const t1 = setTimeout(() => {
        scrollToToday(true);
      }, 100);
      const t2 = setTimeout(() => {
        scrollToToday(true);
      }, 350);
      const t3 = setTimeout(() => {
        scrollToToday(true);
      }, 700);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [ganttTriggerToday, searchTerm, scrollToToday]);

  const hasAutoScrolled = useRef(false);

  useEffect(() => {
    if (initialFocusTaskId) return;

    if (!hasAutoScrolled.current && showToday && totalDays > 0) {
      const timer = setTimeout(() => {
        scrollToToday(false);
        hasAutoScrolled.current = true;
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [initialFocusTaskId, showToday, totalDays, scrollToToday]);

  useEffect(() => {
    if (!isDraggingToday) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!mainScrollRef.current) return;

      const rect = mainScrollRef.current.getBoundingClientRect();
      const scrollLeft = mainScrollRef.current.scrollLeft;
      const x = e.clientX - rect.left + scrollLeft;

      const dateColsWidth =
        (showStart ? startColWidth : 0) +
        (showFinish ? finishColWidth : 0) +
        (showParty ? partyColWidth : 0) +
        (showDuration ? durationColWidth : 0);

      const daysFromStart = (x - sideWidth - dateColsWidth) / dayWidth;
      const newDate = new Date(
        startDate.getTime() + daysFromStart * 24 * 60 * 60 * 1000,
      );

      setCustomToday(newDate);
    };

    const handleMouseUp = () => {
      setIsDraggingToday(false);
      safeSetItemLocal(
        "taka_gantt_custom_today",
        customToday.toISOString(),
      );
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingToday, startDate, dayWidth, customToday]);

  // Calculate total width for the top scrollbar
  const dateColsWidth =
    (showStart ? startColWidth : 0) +
    (showFinish ? finishColWidth : 0) +
    (showParty ? partyColWidth : 0) +
    (showDuration ? durationColWidth : 0);
  const totalWidthPx = totalDays * dayWidth + sideWidth + dateColsWidth;

  const handleToggleRealtimeUpdate = async () => {
    if (selectedProjectIds.length === 0 && selectedTaskIds.length === 0) return;
    try {
      const batch = writeBatch(db);
      let newToggleState = true;

      if (selectedTaskIds.length > 0) {
        const first = tasks.find(t => t.id === selectedTaskIds[0]);
        if (first && first.realtimeUpdate) newToggleState = false;
      } else if (selectedProjectIds.length > 0) {
        const first = projects.find(p =>
            p.id! === selectedProjectIds[0] ||
            p.id === selectedProjectIds[0],
        );
        if (first && first.realtimeUpdate) newToggleState = false;
      }

      for (const id of selectedProjectIds) {
        const p = projects.find(
          (proj) => String(proj.no) === id || proj.id === id,
        );
        if (p && p.id) {
          batch.update(
            doc(
              db,
              "artifacts",
              APP_ID,
              "public",
              "data",
              "taka_projects",
              p.id,
            ),
            { realtimeUpdate: newToggleState },
          );
        }
      }

      for (const id of selectedTaskIds) {
        const t = tasks.find((tsk) => tsk.id === id);
        if (t) {
          batch.update(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", t.id),
            { realtimeUpdate: newToggleState },
          );
        }
      }

      try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }
    } catch (e) {
      console.error("Failed to toggle task flexible:", e);
      setToast({ title: 'Error', message: 'Failed to toggle task flexible' });
    }
  };

  const handleSetTextColor = async (color: string | null) => {
    if (selectedProjectIds.length === 0 && selectedTaskIds.length === 0) return;
    try {
      const writeBatches: any[] = [];
      let currentWriteBatch = writeBatch(db);
      let writeCount = 0;

      for (const id of selectedProjectIds) {
        const p = projects.find(
          (proj) => String(proj.no) === id || proj.id === id,
        );
        if (p && p.id) {
          currentWriteBatch.set(
            doc(
              db,
              "artifacts",
              APP_ID,
              "public",
              "data",
              "taka_projects",
              p.id,
            ),
            {
              textColor: color ? color : deleteField(),
              updatedAt: new Date().toISOString(),
            },
            { merge: true },
          );

          writeCount++;
          if (writeCount === 500) {
            writeBatches.push(currentWriteBatch.commit());
            currentWriteBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      for (const id of selectedTaskIds) {
        currentWriteBatch.set(
          doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", id),
          {
            textColor: color ? color : deleteField(),
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );

        writeCount++;
        if (writeCount === 500) {
          writeBatches.push(currentWriteBatch.commit());
          currentWriteBatch = writeBatch(db);
          writeCount = 0;
        }
      }

      if (writeCount > 0) writeBatches.push(currentWriteBatch.commit());
      await Promise.all(writeBatches);
    } catch (e) {
      console.error("Failed to set background color:", e);
      setToast({ title: 'Error', message: 'Failed to set background color' });
    }
  };

  const handleSetBaselineSelected = async () => {
    if (selectedProjectIds.length === 0 && selectedTaskIds.length === 0) return;
    try {
      const writeBatches: any[] = [];
      let currentWriteBatch = writeBatch(db);
      let writeCount = 0;

      for (const id of selectedProjectIds) {
        const p = projects.find(
          (proj) => String(proj.no) === id || proj.id === id,
        );
        if (p && p.id) {
          currentWriteBatch.set(
            doc(
              db,
              "artifacts",
              APP_ID,
              "public",
              "data",
              "taka_projects",
              p.id,
            ),
            {
              baselineStart: p.computedTakStart || p.start || "",
              baselineFinish: p.computedTakCompl || "",
            },
            { merge: true },
          );

          writeCount++;
          if (writeCount === 500) {
            writeBatches.push(currentWriteBatch.commit());
            currentWriteBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      for (const id of selectedTaskIds) {
        const t = tasks.find((tsk) => tsk.id === id);
        if (t) {
          currentWriteBatch.set(
            doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", t.id),
            {
              baselineStart: t.start || "",
              baselineFinish: t.finish || "",
            },
            { merge: true },
          );

          writeCount++;
          if (writeCount === 500) {
            writeBatches.push(currentWriteBatch.commit());
            currentWriteBatch = writeBatch(db);
            writeCount = 0;
          }
        }
      }

      if (writeCount > 0) {
        writeBatches.push(currentWriteBatch.commit());
      }
      await Promise.all(writeBatches);
    } catch (e: any) {
      console.error("Failed to set baseline:", e);
      setToast({ title: 'Error', message: `Failed to set baseline: ${e.message}` });
    }
  };

  const handleExportToPDF = async () => {
    if (!mainScrollRef.current) return;
    setIsExporting(true);
    
    const wasHideMode = isHideMode;
    if (wasHideMode) {
      setIsHideMode(false);
    }
    
    const wasDarkMode = document.documentElement.classList.contains("dark");
    if (wasDarkMode) {
      document.documentElement.classList.remove("dark");
    }

    // Allow UI to update and show exporting state before freezing
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const gContainer = mainScrollRef.current;
      const targetNode = (gContainer.firstElementChild as HTMLElement) || gContainer;
      const width = targetNode.scrollWidth;
      const height = targetNode.scrollHeight;

      // Limit scale dynamically if width is very large to prevent canvas limit errors
      const maxCanvasWidth = 8000;
      const scale = width > maxCanvasWidth ? maxCanvasWidth / width : 2;

      const filterNode = (node: HTMLElement) => {
        if (node?.classList?.contains('hidden') || node?.classList?.contains('print:hidden')) {
          return false;
        }
        return true;
      };

      const htmlToImage = await import("html-to-image");
      const imgData = await htmlToImage.toJpeg(targetNode, {
        width,
        height,
        pixelRatio: scale,
        quality: 0.95,
        backgroundColor: '#ffffff',
        filter: filterNode as any,
      });

      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({
        orientation: width > height ? "landscape" : "portrait",
        unit: "mm",
        format: [
          Math.max(210, width * 0.264583),
          Math.max(297, height * 0.264583),
        ],
      });
      pdf.addImage(imgData, "JPEG", 0, 0, width * 0.264583, height * 0.264583);
      pdf.save("gantt-chart.pdf");
    } catch (error) {
      console.error("Failed to export to PDF:", error);
      setToast({ title: 'Error', message: `Failed to export to PDF: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setIsExporting(false);
      if (wasHideMode) {
        setIsHideMode(true);
      }
      if (wasDarkMode) {
        document.documentElement.classList.add("dark");
      }
    }
  };

  const handleExportToPNG = useCallback(async () => {
    if (!mainScrollRef.current) return;
    setIsExporting(true);
    
    const wasHideMode = isHideMode;
    if (wasHideMode) {
      setIsHideMode(false);
    }
    
    const wasDarkMode = document.documentElement.classList.contains("dark");
    if (wasDarkMode) {
      document.documentElement.classList.remove("dark");
    }

    // Allow UI to update and show exporting state before freezing
    await new Promise(resolve => setTimeout(resolve, 300));

    try {
      const gContainer = mainScrollRef.current;
      const targetNode = (gContainer.firstElementChild as HTMLElement) || gContainer;
      
      const width = targetNode.scrollWidth;
      const height = targetNode.scrollHeight;

      // Limit scale dynamically if width is very large to prevent canvas limit errors
      const maxCanvasWidth = 8000;
      const scale = width > maxCanvasWidth ? maxCanvasWidth / width : 2;

      const filterNode = (node: HTMLElement) => {
        if (node?.classList?.contains('hidden') || node?.classList?.contains('print:hidden')) {
          return false;
        }
        return true;
      };

      const htmlToImage = await import("html-to-image");
      const imgData = await htmlToImage.toPng(targetNode, {
        width,
        height,
        pixelRatio: scale,
        backgroundColor: '#ffffff',
        filter: filterNode as any,
      });
      
      const link = document.createElement("a");
      link.download = "gantt-chart.png";
      link.href = imgData;
      link.click();
    } catch (error) {
      console.error("Failed to export to PNG:", error);
      setToast({ title: 'Error', message: `Failed to export to PNG: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
      setIsExporting(false);
      if (wasHideMode) {
        setIsHideMode(true);
      }
      if (wasDarkMode) {
        document.documentElement.classList.add("dark");
      }
    }
  }, [isHideMode]);

  useEffect(() => {
    window.addEventListener("export-png", handleExportToPNG);
    return () => {
      window.removeEventListener("export-png", handleExportToPNG);
    };
  }, [handleExportToPNG]);

  const computedSum = useMemo(() => {
    if (sumMode === "none") return 0;
    let sum = 0;
    
    selectedTaskIds.forEach(id => {
      const task = tasks.find(t=> t.id === id);
      if (task) {
        if (task.duration !== undefined && task.duration !== null && task.duration !== '') {
          const val = parseFloat(String(task.duration));
          if (!isNaN(val)) {
            sum += Math.ceil(val);
          }
        } else if (task.start && task.finish) {
          const s = new Date(task.start);
          const f = new Date(task.finish);
          if (!isNaN(s.getTime()) && !isNaN(f.getTime())) {
            const val = Math.round((f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
            sum += Math.ceil(val);
          }
        }
      }
    });
    
    return sum;
  }, [sumMode, selectedTaskIds]);

  const handleDeleteSelected = () => {
    if (selectedProjectIds.length === 0 && selectedTaskIds.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: "Delete Selected",
      message: `Are you sure you want to delete ${selectedProjectIds.length}  and ${selectedTaskIds.length} ?`,
      confirmStyle: "danger",
      onConfirm: async () => {
        try {
          const writeBatches: any[] = [];
          let currentWriteBatch = writeBatch(db);
          let writeCount = 0;

          selectedProjectIds.forEach((pId) => {
            const proj = projects.find(p => p.id! === pId || p.id === pId,
            );
            if (proj) {
              const docId = proj.id || String(proj.no);
              currentWriteBatch.delete(
                doc(
                  db,
                  "artifacts",
                  APP_ID,
                  "public",
                  "data",
                  "taka_projects",
                  docId,
                ),
              );
              writeCount++;
              if (writeCount > 400) {
                writeBatches.push(currentWriteBatch.commit());
                currentWriteBatch = writeBatch(db);
                writeCount = 0;
              }
            }
          });

          selectedTaskIds.forEach((tId) => {
            currentWriteBatch.delete(
              doc(db, "artifacts", APP_ID, "public", "data", "taka_tasks", tId),
            );
            writeCount++;
            if (writeCount > 400) {
              writeBatches.push(currentWriteBatch.commit());
              currentWriteBatch = writeBatch(db);
              writeCount = 0;
            }
          });

          if (writeCount > 0) writeBatches.push(currentWriteBatch.commit());
          await Promise.all(writeBatches);

          if (selectedTaskIds.length > 0) {
            const taskIdSet = new Set(selectedTaskIds);
            const storeDelegations = useAppStore.getState().delegationGroups || [];
            const matchingDels = storeDelegations.filter(d => 
              taskIdSet.has(d.parentTaskId) || (d.id.startsWith("del_") && taskIdSet.has(d.id.slice(4)))
            );
            
            let delBatch = writeBatch(db);
            let delWriteCount = 0;
            const delBatches: Promise<any>[] = [];
            
            matchingDels.forEach((d) => {
              delBatch.delete(doc(db, "artifacts", APP_ID, "public", "data", "taka_delegation_groups", d.id));
              delWriteCount++;
              if (delWriteCount > 400) {
                delBatches.push(delBatch.commit());
                delBatch = writeBatch(db);
                delWriteCount = 0;
              }
            });
            if (delWriteCount > 0) delBatches.push(delBatch.commit());
            await Promise.all(delBatches);
          }

          setSelectedProjectIds([]);
          setSelectedTaskIds([]);
          setIsEditMode(false);
        } catch (e) {
          console.error(e);
        }
      },
    });
  };

  const handleTogglePin = async (p: Project) => {
    try {
      const docId = p.id || p.id!;
      const projectRef = doc(db, "artifacts", APP_ID, "public", "data", "taka_projects", docId);
      updateDoc(projectRef, {
        isPinned: !p.isPinned,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Error toggling pin:", err);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "text/plain",
      JSON.stringify({ projects: selectedProjectIds, tasks: selectedTaskIds, type: "legacy" })
    );
    e.dataTransfer.effectAllowed = "move";
  };

  const dragScrollInterval = useRef<NodeJS.Timeout | null>(null);
  const dragMouseY = useRef<number>(0);

  const startDragScroll = () => {
    if (dragScrollInterval.current) return;
    dragScrollInterval.current = setInterval(() => {
      if (!mainScrollRef.current) return;
      const container = mainScrollRef.current;
      const { top, bottom } = container.getBoundingClientRect();
      const threshold = 100;
      const scrollSpeed = 20;

      const topBound = Math.max(top, 0);
      const bottomBound = Math.min(
        bottom,
        window.innerHeight || document.documentElement.clientHeight,
      );

      if (dragMouseY.current > 0 && dragMouseY.current < topBound + threshold) {
        container.scrollTop -= scrollSpeed;
        window.scrollBy(0, -scrollSpeed);
      } else if (
        dragMouseY.current > 0 &&
        dragMouseY.current > bottomBound - threshold
      ) {
        container.scrollTop += scrollSpeed;
        window.scrollBy(0, scrollSpeed);
      }
    }, 50);
  };

  const stopDragScroll = () => {
    if (dragScrollInterval.current) {
      clearInterval(dragScrollInterval.current);
      dragScrollInterval.current = null;
    }
  };

  useEffect(() => {
    if (!canWrite && !isEditMode) {
      stopDragScroll();
      return;
    }
    const handleGlobalDragOver = (e: DragEvent) => {
      e.preventDefault(); // crucial for global drag over to allow drops and catch consistently
      dragMouseY.current = e.clientY;
      startDragScroll();
    };
    const handleGlobalDragEnd = () => {
      stopDragScroll();
      setDraggingTaskIds([]);
      setDragOverTaskId(null);
      setDropPosition(null);
    };
    window.addEventListener("dragover", handleGlobalDragOver, {
      passive: false,
    });
    window.addEventListener("dragend", handleGlobalDragEnd);
    return () => {
      window.removeEventListener("dragover", handleGlobalDragOver);
      window.removeEventListener("dragend", handleGlobalDragEnd);
      stopDragScroll();
    };
  }, [canWrite, isEditMode, sideWidth]);

  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    const tasksToMove = selectedTaskIds.includes(taskId) && selectedTaskIds.length > 1
      ? selectedTaskIds
      : [taskId];
    setDraggingTaskIds(tasksToMove);
    const payload = JSON.stringify({
      type: "task-reorder",
      tasks: tasksToMove,
    });
    e.dataTransfer.setData("application/json", payload);
    e.dataTransfer.setData("text/plain", payload);
    e.dataTransfer.effectAllowed = "move";

    // Set custom drag image to the first cell (the task name cell) to avoid giant drag ghosts
    try {
      const cell = (e.currentTarget as HTMLElement).querySelector("td");
      if (cell) {
        e.dataTransfer.setDragImage(cell, 10, 10);
      }
    } catch (err) {}
  };

  const handleTaskDragOver = (e: React.DragEvent, taskId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingTaskIds.includes(taskId)) return; // Don't target the task being dragged
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const pos: 'before' | 'after' = relY < rect.height / 2 ? 'before' : 'after';

    if (dragOverTaskId !== taskId || dropPosition !== pos) {
      setDragOverTaskId(taskId);
      setDropPosition(pos);
    }
    dragMouseY.current = e.clientY;
    startDragScroll();
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!mainScrollRef.current) return;
    dragMouseY.current = e.clientY;
    startDragScroll();
  };

  const handleTaskDragLeave = (e: React.DragEvent, taskId: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) {
      return;
    }
    if (dragOverTaskId === taskId) {
      setDragOverTaskId(null);
      setDropPosition(null);
    }
  };

  const handleTaskDragEnd = () => {
    stopDragScroll();
    setDraggingTaskIds([]);
    setDragOverTaskId(null);
    setDropPosition(null);
  };

  const handleTaskDrop = async (e: React.DragEvent, targetTask: Task, parentProject?: Project) => {
    e.preventDefault();
    e.stopPropagation();
    const position = dropPosition || 'before';
    const currentDragging = [...draggingTaskIds];
    setDragOverTaskId(null);
    setDropPosition(null);
    setDraggingTaskIds([]);
    stopDragScroll();

    try {
      let payloadStr = e.dataTransfer.getData("application/json");
      if (!payloadStr) {
        payloadStr = e.dataTransfer.getData("text/plain");
      }
      
      let tasksToMoveIds: string[] = [];
      let isLegacy = false;

      if (payloadStr) {
        try {
          const data = JSON.parse(payloadStr);
          if (data.type === "task-reorder" || data.type === "legacy") {
            tasksToMoveIds = data.tasks || [];
            if (data.type === "legacy") isLegacy = true;
          }
        } catch (err) {}
      }

      // Fallback: If browser/iframe sandbox blocks dataTransfer, use state directly
      if (tasksToMoveIds.length === 0 && currentDragging.length > 0) {
        tasksToMoveIds = currentDragging;
      }

      if (!tasksToMoveIds || tasksToMoveIds.length === 0) return;
      if (tasksToMoveIds.length === 1 && tasksToMoveIds.includes(targetTask.id))
        return;

      const targetProject = parentProject || projects.find(
        (p) =>
          String(p.code || "").trim().toLowerCase() === String(targetTask.projectCode || "").trim().toLowerCase() &&
          (p.year && targetTask.projectYear ? String(p.year).trim() === String(targetTask.projectYear).trim() : true) &&
          (p.store && targetTask.projectStore ? String(p.store).trim().toLowerCase() === String(targetTask.projectStore).trim().toLowerCase() : true),
      ) || filteredProjects.find(
        (p) => String(p.code || "").trim().toLowerCase() === String(targetTask.projectCode || "").trim().toLowerCase()
      );
      if (!targetProject) {
        console.warn("Target project not found for task reorder", targetTask);
        return;
      }

      const performDrop = async () => {
        try {
          const result = reorderAndCalculateTasks(
            tasks,
            projects,
            targetProject,
            tasksToMoveIds,
            targetTask.id,
            position,
          );
          if (!result) return;

          // Optimistic local state update in Zustand
          useAppStore.getState().setTasks(result.allUpdatedTasks);

          const writeBatches: any[] = [];
          let currentWriteBatch = writeBatch(db);
          let writeCount = 0;

          for (const tu of result.taskUpdates) {
            const tRef = doc(
              db,
              "artifacts",
              APP_ID,
              "public",
              "data",
              "taka_tasks",
              tu.id,
            );
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
              const tRef = doc(
                db,
                "artifacts",
                APP_ID,
                "public",
                "data",
                "taka_tasks",
                pu.id,
              );
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
          setSelectedTaskIds([]);
        } catch (err) {
          console.error("Drop task commit error", err);
        }
      };

      if (isLegacy && tasksToMoveIds.length > 0) {
        setConfirmModal({
          isOpen: true,
          title: "Move and Reorder Tasks",
          message: `Are you sure you want to move ${tasksToMoveIds.length} task(s) ${position === 'before' ? 'before' : 'after'} "${targetTask.name}"?`,
          confirmText: "Move",
          confirmStyle: "primary",
          onConfirm: performDrop,
        });
      } else {
        await performDrop();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fast memoized header "select all" state calculation with instant early exit
  const isAllSelected = useMemo(() => {
    if (filteredProjects.length === 0) return false;
    for (const p of filteredProjects) {
      if (!selectedProjectSet.has(p.id!)) return false;
      const pKey = getPKey(p.code, p.year, p.store);
      let pTasks = tasksByProject.get(pKey) || [];
      if (filterStartDate || filterEndDate) {
        pTasks = pTasks.filter((t) => filterTaskByDate(t, filterStartDate, filterEndDate));
      }
      if (searchTerm) {
        pTasks = pTasks.filter((t) =>
          matchesAdvancedSearch(
            searchTerm,
            [p.code, p.name, p.store, p.location],
            [t.name, t.party],
          ),
        );
      }
      for (const t of pTasks) {
        if (!selectedTaskSet.has(t.id)) return false;
      }
    }
    return true;
  }, [
    filteredProjects,
    selectedProjectSet,
    selectedTaskSet,
    tasksByProject,
    filterStartDate,
    filterEndDate,
    searchTerm,
  ]);

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        const pIds = filteredProjects.map((p) => p.id!);
        let tIds: string[] = [];
        filteredProjects.forEach((p) => {
          const pKey = getPKey(p.code, p.year, p.store);
          let pTasks = tasksByProject.get(pKey) || [];
          if (filterStartDate || filterEndDate) {
            pTasks = pTasks.filter((t) =>
              filterTaskByDate(t, filterStartDate, filterEndDate),
            );
          }
          if (searchTerm) {
            pTasks = pTasks.filter((t) =>
              matchesAdvancedSearch(
                searchTerm,
                [p.code, p.name, p.store, p.location],
                [t.name, t.party],
              ),
            );
          }
          tIds = tIds.concat(pTasks.map((t) => t.id));
        });
        setSelectedProjectIds(pIds);
        setSelectedTaskIds(tIds);
      } else {
        setSelectedProjectIds([]);
        setSelectedTaskIds([]);
      }
    },
    [
      filteredProjects,
      tasksByProject,
      filterStartDate,
      filterEndDate,
      searchTerm,
      getPKey,
      filterTaskByDate,
    ],
  );

  const handleStatusFilterChange = useCallback(
    (val: string) => {
      setFilterProjectStatus(val);
      if (!searchTerm.trim()) {
        lastSelectedStatusFilterRef.current = val;
        safeSetItemSession("taka_gantt_filter_project_status", val);
      }
    },
    [searchTerm],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm",
        !!printDateRangeOverride ? "overflow-visible" : "flex-grow overflow-hidden",
        isFullscreen &&
          "fixed inset-0  rounded-none border-none no-swipe",
        isExporting && "exporting-active"
      )}
    >
      {/* Gantt Toolbar */}
      <GanttToolbar
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        uniqueYears={uniqueYears}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        uniqueStores={uniqueStores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        filterProjectStatus={filterProjectStatus}
        onStatusFilterChange={handleStatusFilterChange}
        isTasksLoading={isTasksLoading}
        canWrite={canWrite}
        isEditMode={isEditMode}
        setIsEditMode={setIsEditMode}
        isHighlightDelegationOn={isHighlightDelegationOn}
        setIsHighlightDelegationOn={setIsHighlightDelegationOn}
        selectedProjectIds={selectedProjectIds}
        selectedTaskIds={selectedTaskIds}
        setSelectedProjectIds={setSelectedProjectIds}
        setSelectedTaskIds={setSelectedTaskIds}
        handleSetTextColor={handleSetTextColor}
        handleSetBaselineSelected={handleSetBaselineSelected}
        handleToggleRealtimeUpdate={handleToggleRealtimeUpdate}
        setIsTaskModularModalOpen={setIsTaskModularModalOpen}
        sumMode={sumMode}
        setSumMode={setSumMode}
        handleDeleteSelected={handleDeleteSelected}
        handleDragStart={handleDragStart}
        isHideMode={isHideMode}
        setIsHideMode={setIsHideMode}
        hiddenRows={hiddenRows}
        setHiddenRows={setHiddenRows}
        handleExportToPDF={handleExportToPDF}
        isExporting={isExporting}
        tempStartDate={tempStartDate}
        setTempStartDate={setTempStartDate}
        tempEndDate={tempEndDate}
        setTempEndDate={setTempEndDate}
        setFilterStartDate={setFilterStartDate}
        setFilterEndDate={setFilterEndDate}
        visibleColumns={visibleColumns || []}
        handleToggleColumn={handleToggleColumn}
        handleTodayClick={handleTodayClick}
        viewMode={viewMode}
        setViewMode={setViewMode}
        scaleInput={scaleInput}
        setScaleInput={setScaleInput}
        dayWidth={dayWidth}
        setDayWidth={setDayWidth}
        isWidthChanged={isWidthChanged}
        setIsWidthChanged={setIsWidthChanged}
        saveDayWidth={saveDayWidth}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        initialFocusTaskId={initialFocusTaskId}
        ganttTabFocusTaskId={ganttTabFocusTaskId}
        handleClearFocus={handleClearFocus}
      />

      {/* Top Scrollbar */}
      <div
        className="overflow-x-auto border-b border-slate-200 dark:border-[#444446] bg-slate-100 dark:bg-[#28282a]/50 shrink-0 h-4 print:hidden"
        ref={topScrollRef}
        onScroll={handleTopScroll}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div style={{ width: totalWidthPx, height: "1px" }} />
      </div>

      {/* Gantt Chart Area */}
      <div
        className={cn("relative bg-slate-50 dark:bg-[#1e1e20]/50 print:overflow-hidden print:w-full print:max-w-full print:block", !!printDateRangeOverride ? "overflow-visible" : "flex-grow overflow-auto")}
        ref={mainScrollRef}
        onScroll={handleCombinedMainScroll}
        onDragOver={handleContainerDragOver}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div className="relative min-w-max print-gantt-table min-h-full pb-48">
          <table
            ref={tableRef}
            className="border-separate border-spacing-0 table-fixed"
            style={{ width: totalWidthPx }}
          >
            {/* Timeline Header */}
            <GanttTimelineHeader
              isEditMode={isEditMode}
              isAllSelected={isAllSelected}
              onToggleSelectAll={handleToggleSelectAll}
              hasAnyExpanded={hasAnyExpanded}
              hasAnyModularExpanded={hasAnyModularExpanded}
              toggleAll={toggleAll}
              toggleAllModular={toggleAllModular}
              isResizingSide={isResizingSide}
              startResizingSide={startResizingSide}
              sideWidth={sideWidth}
              showStart={showStart}
              startColWidth={startColWidth}
              showFinish={showFinish}
              finishColWidth={finishColWidth}
              showParty={showParty}
              partyColWidth={partyColWidth}
              showDuration={showDuration}
              durationColWidth={durationColWidth}
              handleToggleColumn={handleToggleColumn}
              timeUnits={timeUnits}
              dayWidth={dayWidth}
            />
            <tbody className="relative">
              {paddingTop > 0 && (
                <tr style={{ height: `${paddingTop}px` }} className="pointer-events-none select-none">
                  <td colSpan={totalColSpan} className="p-0 border-0 m-0" />
                </tr>
              )}
              {visibleGanttRows.map((item) => {
                if (item.type === 'project') {
                  return (
                    <GanttProjectRow
                      key={item.key}
                      p={item.p}
                      pIdx={item.pIdx}
                      projectTasks={item.projectTasks}
                      isExpanded={item.isExpanded}
                      expandedModularTasks={expandedModularTasks}
                      setExpandedModularTasks={setExpandedModularTasks}
                      isEditMode={isEditMode}
                      canWrite={canWrite}
                      selectedProjectSet={selectedProjectSet}
                      selectedProjectIds={selectedProjectIds}
                      setSelectedProjectIds={setSelectedProjectIds}
                      setSelectedTaskIds={setSelectedTaskIds}
                      toggleProject={toggleProject}
                      isResizingSide={isResizingSide}
                      startResizingSide={startResizingSide}
                      sideWidth={sideWidth}
                      showStart={showStart}
                      startColWidth={startColWidth}
                      showFinish={showFinish}
                      finishColWidth={finishColWidth}
                      showParty={showParty}
                      partyColWidth={partyColWidth}
                      showDuration={showDuration}
                      durationColWidth={durationColWidth}
                      timeUnits={timeUnits}
                      delegationGroups={delegationGroups}
                      getRowVisibilityClass={getRowVisibilityClass}
                      startDate={startDate}
                      dayWidth={dayWidth}
                      activeTooltip={activeTooltip}
                      setActiveTooltip={setActiveTooltip}
                      getBarColor={getBarColor}
                      onNavigateToLayout={onNavigateToLayout}
                    />
                  );
                }
                return (
                  <GanttTaskRow
                    key={item.key}
                    t={item.t}
                    isChild={item.isChild}
                    parentTask={item.parentTask}
                    hasChildren={item.hasChildren}
                    childCount={item.childCount}
                    isModularExpanded={item.isModularExpanded}
                    p={item.p}
                    projects={projects}
                    tasks={tasks}
                    delegationGroups={delegationGroups}
                    isHighlightDelegationOn={isHighlightDelegationOn}
                    currentUser={currentUser}
                    selectedTaskSet={selectedTaskSet}
                    selectedTaskIds={selectedTaskIds}
                    setSelectedTaskIds={setSelectedTaskIds}
                    isEditMode={isEditMode}
                    canWrite={canWrite}
                    handleGroupModularTasks={handleGroupModularTasks}
                    handleUnlinkModularTasks={handleUnlinkModularTasks}
                    toggleModularParent={toggleModularParent}
                    getRowVisibilityClass={getRowVisibilityClass}
                    sideWidth={sideWidth}
                    showStart={showStart}
                    startColWidth={startColWidth}
                    showFinish={showFinish}
                    finishColWidth={finishColWidth}
                    showParty={showParty}
                    partyColWidth={partyColWidth}
                    showDuration={showDuration}
                    durationColWidth={durationColWidth}
                    timeUnits={timeUnits}
                    startDate={startDate}
                    dayWidth={dayWidth}
                    activeTooltip={activeTooltip}
                    setActiveTooltip={setActiveTooltip}
                    getBarColor={getBarColor}
                    draggingTaskIds={draggingTaskIds}
                    handleTaskDragStart={handleTaskDragStart}
                    handleTaskDragOver={handleTaskDragOver}
                    handleTaskDragLeave={handleTaskDragLeave}
                    handleTaskDrop={handleTaskDrop}
                    handleTaskDragEnd={handleTaskDragEnd}
                    dragOverTaskId={dragOverTaskId}
                    dropPosition={dropPosition}
                    handleTaskCheckboxChange={handleTaskCheckboxChange}
                    isHideMode={isHideMode}
                    toggleHideRow={toggleHideRow}
                    hiddenRowsSet={hiddenRowsSet}
                    onNavigateToTaskDetail={onNavigateToTaskDetail}
                    initialFocusTaskId={initialFocusTaskId}
                    ganttTabFocusTaskId={ganttTabFocusTaskId}
                    taskCode={item.taskCode}
                    delegationGroup={item.delegationGroup}
                  />
                );
              })}
              {paddingBottom > 0 && (
                <tr style={{ height: `${paddingBottom}px` }} className="pointer-events-none select-none">
                  <td colSpan={totalColSpan} className="p-0 border-0 m-0" />
                </tr>
              )}
            </tbody>
          </table>

          {/* Global Grid Lines Overlay */}
          <GanttGridOverlay
            leftOffset={
              sideWidth +
              (showStart ? startColWidth : 0) +
              (showFinish ? finishColWidth : 0) +
              (showParty ? partyColWidth : 0) +
              (showDuration ? durationColWidth : 0)
            }
            timeUnits={timeUnits}
            dayWidth={dayWidth}
          />
          <svg className="absolute inset-0 pointer-events-none z-[15] overflow-visible print:hidden" width="100%" height="100%">
            <defs>
              <marker
                id="arrowhead"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 6 3, 0 6" fill="#1d4ed8" />
              </marker>
            </defs>
            {dependencyLines.map((line) => (
              <path
                key={line.id}
                d={line.d}
                fill="none"
                stroke="#1d4ed8"
                strokeWidth="1.5"
                markerEnd="url(#arrowhead)"
                className="opacity-70"
              />
            ))}
          </svg>

          {/* Absolute Today Line overlaying the whole table body */}
          {showToday && (
            <div
              className={`absolute top-0 bottom-0 w-1 z-20 group/today`}
              style={{
                left:
                  sideWidth +
                  (showStart ? startColWidth : 0) +
                  (showFinish ? finishColWidth : 0) +
                  (showParty ? partyColWidth : 0) +
                  (showDuration ? durationColWidth : 0) +
                  todayLeftPx,
              }}
            >
              <div className="absolute inset-y-0 left-0 w-px border-l-2 border-red-500" />
              <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[8px] font-bold px-1 rounded opacity-0 group-hover/today:opacity-100 transition-opacity whitespace-nowrap">
                {format(customToday, "dd/MM/yyyy")}
              </div>
            </div>
          )}
        </div>
        {visibleCount < sortedProjects.length && (
          <div className="sticky left-0 right-0 flex justify-center p-4 print:hidden">
            <button
              onClick={handleLoadMore}
              className="bg-slate-100 hover:bg-slate-200 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-700 dark:text-[#e3e3e3] px-6 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer text-center border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              Load More Projects ({sortedProjects.length - visibleCount}{" "}
              remaining)
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Buttons for Focus Mode */}
      {initialFocusTaskId && onClearFocus && (
        <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8  flex flex-col gap-2 items-end print:hidden pointer-events-none">
          <button
            onClick={handleClearFocus}
            className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm"
            title="Clear Focus (Esc)"
          >
            <X className="w-4 h-4" />
            <span className="font-semibold hidden md:inline">Clear Focus</span>
          </button>
        </div>
      )}

      <TaskModularModal
        isOpen={isTaskModularModalOpen}
        onClose={() => setIsTaskModularModalOpen(false)}
        selectedTaskIds={selectedTaskIds}
        tasks={tasks}
        projects={projects}
        onGroupTasks={handleGroupModularTasks}
        onUnlinkTasks={handleUnlinkModularTasks}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmStyle={confirmModal.confirmStyle}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Sum Tooltip */}
      {isEditMode && sumMode !== "none" && (selectedTaskIds.length > 0 || selectedProjectIds.length > 0) && (
        <div className="fixed bottom-6 right-6 z-[200] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4">
          <div className="p-2 bg-emerald-500 rounded-full">
            <Calculator className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-slate-300 dark:text-slate-600 font-medium">Calculated Sum</span>
            <span className="text-xl font-bold">
              {sumMode === "duration" && `${computedSum} Days`}
            </span>
          </div>
        </div>
      )}

      {/* Exporting Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4 border border-slate-200 dark:border-[#444446]">
            <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3] mb-2">Exporting Chart</h3>
            <p className="text-slate-500 dark:text-[#a3a3a3] text-center text-sm">Please wait while we generate your file. This may take a few moments for large charts.</p>
          </div>
        </div>
      )}
    </div>
  );
}
