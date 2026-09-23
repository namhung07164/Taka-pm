import React, { useState, useEffect, useRef, useDeferredValue } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { Search, RefreshCw, Pin, GripVertical, CheckCircle2, ArrowUp, ArrowDown, ChevronUp, ChevronDown } from 'lucide-react';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { Project, Task, AppUser, DelegationGroup } from '../types';
import { getStatus, formatDisplayDateMain, cn, parseDateTime, getTaskStatus, getDefaultStoreFilter, resolveActualStatus, computeActProgressPercent, getUserAllowedStores, getEffectiveStoreFilter, matchesAdvancedSearch } from '../lib/utils';
import { useLanguage } from '../lib/LanguageContext';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { safeGetItemSession, safeSetItemSession } from '../lib/storage';

interface GeneralTabProps {
  onProjectClick: (p: Project) => void;
}

export function GeneralTab({      onProjectClick}: GeneralTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
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
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const pinnedProjects = useAppStore(state => state.pinnedProjects);
  const setPinnedProjects = useAppStore(state => state.setPinnedProjects);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!searchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (statusFilter !== 'all') {
        lastSelectedStatusFilterRef.current = statusFilter;
        safeSetItemSession("taka_general_status_filter", statusFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setStatusFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedStatusFilterRef.current || safeGetItemSession("taka_general_status_filter") || 'On process + Upcoming 3 days';
      setStatusFilter(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [searchTerm, globalLocationFilter, setGlobalLocationFilter, statusFilter]);

  // Auto-jump to matched project location(s) when searching
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;

    const matchedProjects = projects.filter(p => {
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      const searchFields = [p.no, p.store, p.code, p.linkCodes, p.name, p.detail, status, p.year];
      const matchesSearch = matchesAdvancedSearch(term, searchFields);
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
      const matchesStore = effectiveStore === 'all' || p.store === effectiveStore;
      return matchesSearch && matchesYear && matchesStore;
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
  }, [searchTerm, projects, globalYearFilter, effectiveStore, globalLocationFilter, setGlobalLocationFilter]);

  // Handle Escape key globally to clear search when not in modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchTerm) {
        const state = useAppStore.getState();
        const hasOpenModal =
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen ||
          state.isCalendarSyncModalOpen;
        if (hasOpenModal) return;

        e.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement && typeof (activeElement as HTMLElement).blur === "function") {
          (activeElement as HTMLElement).blur();
        }
        setSearchTerm("");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchTerm]);
  const [flashToggle, setFlashToggle] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const [isSyncing, setIsSyncing] = useState(false);
  const [draggedPinnedId, setDraggedPinnedId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    id: string;
    position: 'above' | 'below';
    index: number;
    projectCode?: string;
    projectName?: string;
  } | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSuccessFeedback = (id: string, message: string) => {
    setJustDroppedId(id);
    setSuccessToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setJustDroppedId(null);
      setSuccessToast(null);
    }, 2400);
  };

  const reorderPinnedProjects = (
    currentPinned: string[],
    draggedId: string,
    targetId: string,
    position: 'above' | 'below'
  ): string[] => {
    if (draggedId === targetId) return currentPinned;
    const listWithoutDragged = currentPinned.filter(id => id !== draggedId);
    const targetIndexInCleanList = listWithoutDragged.indexOf(targetId);
    if (targetIndexInCleanList === -1) return currentPinned;

    const insertIndex = position === 'above' ? targetIndexInCleanList : targetIndexInCleanList + 1;
    const result = [...listWithoutDragged];
    result.splice(insertIndex, 0, draggedId);
    return result;
  };

  const handlePinToggle = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (pinnedProjects.includes(projectId)) {
      setPinnedProjects(pinnedProjects.filter(id => id !== projectId));
    } else {
      setPinnedProjects([...pinnedProjects, projectId]);
    }
  };

  const handleMovePinned = (e: React.MouseEvent, projectId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    const currIdx = pinnedProjects.indexOf(projectId);
    if (currIdx === -1) return;
    const newIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (newIdx < 0 || newIdx >= pinnedProjects.length) return;

    const newPinned = [...pinnedProjects];
    const [moved] = newPinned.splice(currIdx, 1);
    newPinned.splice(newIdx, 0, moved);
    setPinnedProjects(newPinned);

    const proj = projects.find(p => p.id === projectId);
    triggerSuccessFeedback(
      projectId,
      direction === 'up'
        ? `Đã di chuyển ${proj?.code || 'dự án'} lên vị trí ${newIdx + 1}`
        : `Đã di chuyển ${proj?.code || 'dự án'} xuống vị trí ${newIdx + 1}`
    );
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedPinnedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleRowDragOver = (e: React.DragEvent, targetProject: Project, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedPinnedId || !targetProject.id || draggedPinnedId === targetProject.id) {
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const isAbove = relativeY < rect.height / 2;
    const position = isAbove ? 'above' : 'below';

    if (dragOverTarget?.id !== targetProject.id || dragOverTarget?.position !== position) {
      setDragOverTarget({
        id: targetProject.id,
        position,
        index: idx,
        projectCode: targetProject.code,
        projectName: targetProject.name,
      });
    }
  };

  const handleRowDrop = (e: React.DragEvent, targetId: string, position: 'above' | 'below') => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedPinnedId || draggedPinnedId === targetId) {
      setDraggedPinnedId(null);
      setDragOverTarget(null);
      return;
    }

    const newPinned = reorderPinnedProjects(pinnedProjects, draggedPinnedId, targetId, position);
    setPinnedProjects(newPinned);

    const movedProj = projects.find(p => p.id === draggedPinnedId);
    const targetProj = projects.find(p => p.id === targetId);
    const code = movedProj?.code || 'Dự án';

    triggerSuccessFeedback(
      draggedPinnedId,
      position === 'above'
        ? `Đã chuyển ${code} lên trước ${targetProj?.code || ''}!`
        : `Đã chuyển ${code} xuống sau ${targetProj?.code || ''}!`
    );

    setDraggedPinnedId(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedPinnedId(null);
    setDragOverTarget(null);
  };

  const handleCanvasDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!draggedPinnedId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const headerHeight = 60;
    const rowHeight = 70;

    if (y > headerHeight) {
      const idx = Math.floor((y - headerHeight) / rowHeight);
      if (idx >= 0 && idx < paginatedProjects.length) {
        const targetProject = paginatedProjects[idx];
        if (targetProject.id && pinnedProjects.includes(targetProject.id) && targetProject.id !== draggedPinnedId) {
          const rowY = headerHeight + idx * rowHeight;
          const relativeY = y - rowY;
          const position = relativeY < rowHeight / 2 ? 'above' : 'below';
          setDragOverTarget({
            id: targetProject.id,
            position,
            index: idx,
            projectCode: targetProject.code,
            projectName: targetProject.name,
          });
        }
      }
    }
  };

  const handleCanvasDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!draggedPinnedId) return;
    if (dragOverTarget && dragOverTarget.id !== draggedPinnedId) {
      handleRowDrop(e, dragOverTarget.id, dragOverTarget.position);
    } else {
      setDraggedPinnedId(null);
      setDragOverTarget(null);
    }
  };

  const handleGoogleSync = async () => {
    if (currentUser.role !== 'admin') return;

    if (!useAppStore.getState().isDelegationsRequested) {
      useAppStore.getState().setIsDelegationsRequested(true);
    }

    const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbwPAZcZ8wGQ1CVPYn_5h4arJ2dqX7T9rpWPMAmEuc3Q2G4BB7l59Mbxb8Ep0aQE6GA1/exec';
      
    setIsSyncing(true);
      
    const projectsData = projects.map(p=> {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : '');
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      
      const projectDelegations = delegationGroups.filter(g=> g.projectCode === p.code);
      let delegationTaskStr = '';
      if (projectDelegations.length > 0) {
        delegationTaskStr = projectDelegations.map(g => {
          let st = g.subTasks?.[0]?.delegationStatus || g.subTasks?.[0]?.status || 'Assigned';
          if (st === 'Accepted') st = 'On process';
          return `${g.name} (${st})`;
        }).join('; ');
      }

      const progressPercent = p.computedPlanProgress ?? 0;

      const now = new Date();
      let activeTaskNames: string[] = [];
      if (p.taskSummaries) {
        const activeTasks = p.taskSummaries.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      }

      let taskLines: string[] = [];
      activeTaskNames.forEach(name => {
        taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
      });
      let detailString = taskLines.length > 0 ? taskLines.join('\n') : (p.detail || '');
      
      return {
        projectId: p.id || p.no, // Unique ID for upsert
        year: pYear,
        store: p.store || '',
        location: p.location || '',
        code: p.code || '',
        linkCodes: p.linkCodes || p.code || '',
        projectName: p.name || '',
        status: status,
        detail: detailString,
        startPlan: p.computedTakStart ? formatDisplayDateMain(p.computedTakStart) : '',
        finishPlan: p.computedTakCompl ? formatDisplayDateMain(p.computedTakCompl) : '',
        delegationTask: delegationTaskStr
      };
    });

    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ action: 'upsert', projects: projectsData })
      });
        
      useAppStore.getState().setToast({ title: "Notice", message: "Sent project sync request to Google Sheets!" });
    } catch(err) {
      console.error(err);
      useAppStore.getState().setToast({ title: "Error", message: (err instanceof Error ? err.message : String(err)) });
    } finally {
      setIsSyncing(false);
    }
  };

  const years = [...new Set([...projects.map(p=> {
    if (p.year) return String(p.year);
    if (p.computedTakStart) return String(p.computedTakStart).substring(0, 4);
    return null;
  }).filter(Boolean), '2026', '2027'])].sort();

  const allowedStores = React.useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const stores = allowedStores;
  const locationOptions = useLocationOptions();

  const statusWeight: Record<string, number> = {
    'On process': 1,
    'Upcoming': 2,
    'Completed': 3,
    'Handover': 4,
    'Canceled': 5
  };

  const [visibleCount, setVisibleCount] = useState(20);

  const filteredProjects = projects.filter(p=> {
    const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
    const searchFields = [p.no, p.store, p.code, p.linkCodes, p.name, p.detail, status, p.year];
    const matchesSearch = matchesAdvancedSearch(deferredSearchTerm, searchFields);
    const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
    const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
    const matchesStore = effectiveStore === 'all' || p.store === effectiveStore;
    const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));
    let matchesStatus = true;
    if (statusFilter === 'On process + Upcoming 3 days') {
      if (status === 'On process') {
        matchesStatus = true;
      } else if (status === 'Upcoming') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dStart = parseDateTime(p.computedTakStart);
        if (dStart) {
          dStart.setHours(0, 0, 0, 0);
          const diffTime = dStart.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          matchesStatus = diffDays <= 3 && diffDays >= 0;
        } else {
          matchesStatus = false;
        }
      } else {
        matchesStatus = false;
      }
    } else {
      matchesStatus = statusFilter === 'all' || status === statusFilter;
    }
    return matchesSearch && matchesYear && matchesStore && matchesLocation && matchesStatus;
  }).sort((a, b) => {
    const isPinnedA = a.id && pinnedProjects.includes(a.id);
    const isPinnedB = b.id && pinnedProjects.includes(b.id);
    
    if (isPinnedA !== isPinnedB) {
      return isPinnedA ? -1 : 1;
    }
    if (isPinnedA && isPinnedB) {
      const orderA = pinnedProjects.indexOf(a.id as string);
      const orderB = pinnedProjects.indexOf(b.id as string);
      if (orderA !== orderB) return orderA - orderB;
    }

    if (sortConfig) {
      let valA = '';
      let valB = '';
      if (sortConfig.key === 'start') {
        valA = a.computedTakStart || '9999-12-31';
        valB = b.computedTakStart || '9999-12-31';
      } else if (sortConfig.key === 'handover') {
        valA = a.computedTakCompl || '9999-12-31';
        valB = b.computedTakCompl || '9999-12-31';
      } else if (sortConfig.key === 'opening') {
        valA = a.computedOpening || a.opening || '9999-12-31';
        valB = b.computedOpening || b.opening || '9999-12-31';
      }
      
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    }

    const statusA = getStatus(a.computedTakStart, a.computedTakCompl, a.computedOpening || a.opening, a.code);
    const statusB = getStatus(b.computedTakStart, b.computedTakCompl, b.computedOpening || b.opening, b.code);
    
    const weightA = statusWeight[statusA] || 99;
    const weightB = statusWeight[statusB] || 99;

    if (weightA !== weightB) {
      return weightA - weightB;
    }

    // Special sorting for 'On process' : prioritize finish date proximity to today
    if (statusA === 'On process') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const finishA = parseDateTime(a.computedTakCompl || a.handover || a.computedOpening || a.opening);
      const finishB = parseDateTime(b.computedTakCompl || b.handover || b.computedOpening || b.opening);
      
      if (finishA && finishB) {
        const diffA = Math.abs(finishA.getTime() - today.getTime());
        const diffB = Math.abs(finishB.getTime() - today.getTime());
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      } else if (finishA) {
        return -1;
      } else if (finishB) {
        return 1;
      }
    }

    const startA = a.computedTakStart || '9999-12-31';
    const startB = b.computedTakStart || '9999-12-31';
    if (startA !== startB) {
      return startA.localeCompare(startB);
    }

    const complA = a.computedTakCompl || '9999-12-31';
    const complB = b.computedTakCompl || '9999-12-31';
    if (complA !== complB) {
      return complA.localeCompare(complB);
    }

    const openA = a.computedOpening || a.opening || '9999-12-31';
    const openB = b.computedOpening || b.opening || '9999-12-31';
    if (openA !== openB) {
      return openA.localeCompare(openB);
    }
    
    return a.code.localeCompare(b.code) || String(a.year || '').localeCompare(String(b.year || ''));
  });


  useEffect(() => {
    const interval = setInterval(() => setFlashToggle(prev => !prev), 600);
    return () => clearInterval(interval);
  }, []);

  const paginatedProjects = filteredProjects.slice(0, visibleCount);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rowHeight = 70;
    const headerHeight = 60;
    const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
    const logicalWidth = Math.max(wrapper.clientWidth, 1280);
    const totalBase = baseWidths.reduce((a, b) => a + b, 0);
    const scale = logicalWidth / totalBase;
    const colWidths = baseWidths.map(w => w * scale);
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const totalHeight = Math.max(headerHeight + paginatedProjects.length * rowHeight + 30, wrapper.clientHeight);

    canvas.width = totalWidth * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = totalWidth + 'px';
    canvas.style.height = totalHeight + 'px';
    ctx.scale(dpr, dpr);

    const isDark = theme === 'dark' || (typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));

    ctx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    const cols = [
      { label: t('Year'), key: 'year' },
      { label: t('Store'), key: 'store' },
      { label: t('Location'), key: 'location' },
      { label: t('Code'), key: 'code' },
      { label: t('Project'), key: 'name' },
      { label: t('Status'), key: 'status' },
      { label: t('Details'), key: 'detail' },
      { label: t('Pj Start'), key: 'start' },
      { label: t('Pj Compl'), key: 'handover' },
      { label: t('Opening'), key: 'opening' }
    ];

    const fontSans = 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const fontMono = 'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace';

    paginatedProjects.forEach((item, i) => {
      const y = headerHeight + i * rowHeight;
      const status = getStatus(item.computedTakStart, item.computedTakCompl, item.computedOpening || item.opening, item.code);
      
      if (isDark) {
        ctx.fillStyle = (i % 2 === 0) ? '#18181b' : '#202025';
      } else {
        ctx.fillStyle = (i % 2 === 0) ? '#ffffff' : '#f8fafc';
      }
      ctx.fillRect(0, y, totalWidth, rowHeight);
      
      ctx.strokeStyle = isDark ? '#2a2a2e' : '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + rowHeight);
      ctx.lineTo(totalWidth, y + rowHeight);
      ctx.stroke();

      let colX = 0;
      cols.forEach((col, colIdx) => {
        const width = colWidths[colIdx];
        ctx.globalAlpha = (status === 'Canceled' && col.key !== 'status') ? 0.45 : 1.0;
        let text = String(item[col.key as keyof Project] || '');
        let progressPercent = 0;
        let actProgressPercent = 0;
        if (col.key === 'status') {
            progressPercent = item.computedPlanProgress ?? 0;
            actProgressPercent = item.computedActProgress ?? 0;
        }
        
        let activeTaskNames: string[] = [];
        if (col.key === 'detail' && item.taskSummaries) {
          const now = new Date();
          const activeTasks = item.taskSummaries.filter(t => {
            if (!t.start || !t.finish) return false;
            const start = new Date(t.start);
            const finish = new Date(t.finish);
            return now >= start && now <= finish;
          });
          activeTaskNames = activeTasks.map(t => t.name);
        }

        if (col.key === 'no') text = String(i + 1);
        if (col.key === 'status') text = status;
        if (col.key === 'start') text = formatDisplayDateMain(item.computedTakStart || item.start);
        else if (col.key === 'handover') text = formatDisplayDateMain(item.computedTakCompl || item.handover || (item as any).takCompl);
        else if (col.key === 'opening') text = formatDisplayDateMain(item.computedOpening || item.opening);

        let isFlashingRed = false;
        let isFlashingGreen = false;

        if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
           let dateStr = '';
           if (col.key === 'start') dateStr = item.computedTakStart || item.start || '';
           else if (col.key === 'handover') dateStr = item.computedTakCompl || item.handover || (item as any).takCompl || '';
           else if (col.key === 'opening') dateStr = item.computedOpening || item.opening || '';
           
           if (dateStr && status !== 'Completed' && status !== 'Canceled') {
             const d = new Date(dateStr);
             if (!isNaN(d.getTime())) {
               const today = new Date();
               today.setHours(0, 0, 0, 0);
               const target = new Date(d);
               target.setHours(0, 0, 0, 0);
               const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
               
               if (diffDays <= 1) isFlashingRed = true;
               else if (diffDays <= 3) isFlashingGreen = true;
             }
           }
        }

        // Clip cell boundary to prevent text overflow into adjacent columns
        ctx.save();
        ctx.beginPath();
        ctx.rect(colX, y, width, rowHeight);
        ctx.clip();

        if (isFlashingRed && flashToggle) {
          ctx.fillStyle = isDark ? '#7f1d1d' : '#fee2e2';
          ctx.fillRect(colX + 2, y + 2, width - 4, rowHeight - 4);
          ctx.fillStyle = isDark ? '#fca5a5' : '#dc2626';
          ctx.font = `700 12.5px ${fontMono}`;
        } else if (isFlashingGreen && flashToggle) {
          ctx.fillStyle = isDark ? '#14532d' : '#dcfce7';
          ctx.fillRect(colX + 2, y + 2, width - 4, rowHeight - 4);
          ctx.fillStyle = isDark ? '#86efac' : '#16a34a';
          ctx.font = `700 12.5px ${fontMono}`;
        } else {
          if (col.key === 'code') { 
            ctx.fillStyle = isDark ? '#93c5fd' : '#1d4ed8'; 
            ctx.font = `700 13px ${fontMono}`; 
          }
          else if (col.key === 'store') {
            ctx.font = `700 13.5px ${fontSans}`;
            if (text.toLowerCase() === 'hcm') ctx.fillStyle = isDark ? '#60a5fa' : '#2563eb';
            else if (text.toLowerCase() === 'hn') ctx.fillStyle = isDark ? '#f87171' : '#dc2626';
            else ctx.fillStyle = isDark ? '#e2e8f0' : '#475569';
          }
          else if (col.key === 'name') { 
            ctx.fillStyle = isDark ? '#ffffff' : '#0f172a'; 
            ctx.font = `700 13px ${fontSans}`; 
          }
          else if (col.key === 'year') {
             const isPinned = item.id ? pinnedProjects.includes(item.id) : false;
             if (isPinned) {
                ctx.fillStyle = isDark ? '#60a5fa' : '#2563eb';
                ctx.font = `700 13.5px ${fontSans}`;
             } else {
                ctx.fillStyle = isDark ? '#e2e8f0' : '#334155';
                ctx.font = `600 13.5px ${fontSans}`;
             }
          }
          else if (col.key === 'location') { 
            ctx.fillStyle = isDark ? '#cbd5e1' : '#334155'; 
            ctx.font = `600 13px ${fontSans}`; 
          }
          else if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
            ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b'; 
            ctx.font = `600 12.5px ${fontMono}`;
          }
          else if (col.key === 'status') {
            ctx.font = `700 11px ${fontSans}`;
            if (text === 'Completed') ctx.fillStyle = isDark ? '#4ade80' : '#15803d';
            else if (text === 'Handover') ctx.fillStyle = isDark ? '#60a5fa' : '#1d4ed8';
            else if (text === 'On process') ctx.fillStyle = isDark ? '#fb923c' : '#c2410c';
            else if (text === 'Canceled') ctx.fillStyle = isDark ? '#f87171' : '#b91c1c';
            else ctx.fillStyle = isDark ? '#e2e8f0' : '#475569';
          } else { 
            ctx.fillStyle = isDark ? '#e2e8f0' : '#334155'; 
            ctx.font = `500 13px ${fontSans}`; 
          }
        }

        ctx.textBaseline = 'middle';
        if (col.key === 'no') {
          ctx.textAlign = 'center';
          ctx.fillText(text, colX + width / 2, y + rowHeight / 2);
          ctx.textAlign = 'left';
        } else if (col.key === 'start' || col.key === 'handover' || col.key === 'opening') {
          ctx.textAlign = 'center';
          ctx.fillText(text, colX + width / 2, y + rowHeight / 2);
          ctx.textAlign = 'left';
        } else if (col.key === 'detail') {
          ctx.textBaseline = 'top';
          let lineY = y + 12;
          
          let taskLines: string[] = [];
          activeTaskNames.forEach(name => {
            taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
          });

          taskLines.forEach((taskName, tIdx) => {
            if (lineY > y + rowHeight - 14) return;
            if (tIdx % 3 === 0) ctx.fillStyle = isDark ? '#93c5fd' : '#1d4ed8';
            else if (tIdx % 3 === 1) ctx.fillStyle = isDark ? '#fdba74' : '#c2410c';
            else ctx.fillStyle = isDark ? '#a7f3d0' : '#047857';

            ctx.font = `600 12px ${fontSans}`;
            
            const words = taskName.split(' ');
            let line = '';
            for (let n = 0; n < words.length; n++) {
              let testLine = line + words[n] + ' ';
              if (ctx.measureText(testLine).width > width - 20 && n > 0) {
                ctx.fillText(line, colX + 10, lineY);
                line = words[n] + ' ';
                lineY += 15;
                if (lineY > y + rowHeight - 14) break;
              } else {
                line = testLine;
              }
            }
            if (lineY <= y + rowHeight - 14) {
              ctx.fillText(line, colX + 10, lineY);
              lineY += 15;
            }
          });
        } else if (col.key === 'status') {
          // Status Pill Badge
          const badgeWidth = Math.min(width - 16, 96);
          const badgeHeight = 20;
          const badgeX = colX + (width - badgeWidth) / 2;
          const badgeY = y + 8;

          let badgeBg = isDark ? '#27272a' : '#f1f5f9';
          let badgeText = isDark ? '#f8fafc' : '#0f172a';
          if (text === 'Completed') {
            badgeBg = isDark ? '#14532d' : '#dcfce7';
            badgeText = isDark ? '#4ade80' : '#15803d';
          } else if (text === 'Handover') {
            badgeBg = isDark ? '#1e3a8a' : '#dbeafe';
            badgeText = isDark ? '#60a5fa' : '#1d4ed8';
          } else if (text === 'On process') {
            badgeBg = isDark ? '#7c2d12' : '#ffedd5';
            badgeText = isDark ? '#fb923c' : '#c2410c';
          } else if (text === 'Canceled') {
            badgeBg = isDark ? '#7f1d1d' : '#fee2e2';
            badgeText = isDark ? '#f87171' : '#b91c1c';
          }

          ctx.fillStyle = badgeBg;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 5);
          else ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
          ctx.fill();

          ctx.fillStyle = badgeText;
          ctx.font = `700 10.5px ${fontSans}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, colX + (width / 2), badgeY + badgeHeight / 2);

          // Plan & Act Progress bars with side-by-side percentage labels (no overlap)
          const barWidth = Math.max(width - 64, 45);
          const barHeight = 4;
          const barX = colX + 8;
          const textX = colX + width - 6;

          // Plan Progress Row
          const planY = badgeY + badgeHeight + 8;
          ctx.fillStyle = isDark ? '#27272a' : '#e2e8f0';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(barX, planY, barWidth, barHeight, 2);
          else ctx.rect(barX, planY, barWidth, barHeight);
          ctx.fill();

          if (progressPercent > 0) {
             ctx.fillStyle = isDark ? '#38bdf8' : '#2563eb';
             ctx.beginPath();
             if (ctx.roundRect) ctx.roundRect(barX, planY, Math.min(barWidth, barWidth * (progressPercent / 100)), barHeight, 2);
             else ctx.rect(barX, planY, Math.min(barWidth, barWidth * (progressPercent / 100)), barHeight);
             ctx.fill();
          }

          ctx.fillStyle = isDark ? '#38bdf8' : '#1d4ed8';
          ctx.font = `700 9.5px ${fontMono}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${progressPercent}% (P)`, textX, planY + 2);

          // Actual Progress Row
          const actY = planY + 12;
          ctx.fillStyle = isDark ? '#27272a' : '#e2e8f0';
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(barX, actY, barWidth, barHeight, 2);
          else ctx.rect(barX, actY, barWidth, barHeight);
          ctx.fill();

          if (actProgressPercent > 0) {
             ctx.fillStyle = isDark ? '#34d399' : '#10b981';
             ctx.beginPath();
             if (ctx.roundRect) ctx.roundRect(barX, actY, Math.min(barWidth, barWidth * (actProgressPercent / 100)), barHeight, 2);
             else ctx.rect(barX, actY, Math.min(barWidth, barWidth * (actProgressPercent / 100)), barHeight);
             ctx.fill();
          }

          ctx.fillStyle = isDark ? '#34d399' : '#047857';
          ctx.font = `700 9.5px ${fontMono}`;
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${actProgressPercent}% (A)`, textX, actY + 2);
          ctx.textAlign = 'left';

        } else if (col.key === 'name') {
          ctx.textBaseline = 'top';
          const words = text.split(' ');
          let line = '';
          let lineY = y + 16;
          for (let n = 0; n < words.length; n++) {
            let testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > width - 20 && n > 0) {
              ctx.fillText(line, colX + 10, lineY);
              line = words[n] + ' ';
              lineY += 16;
              if (lineY > y + rowHeight - 16) break;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, colX + 10, lineY);
        } else {
          if (col.key === 'year') {
            const isPinned = item.id ? pinnedProjects.includes(item.id) : false;
            const textX = isPinned ? colX + 58 : colX + 28;
            ctx.fillText(text, textX, y + rowHeight / 2);
          } else {
            ctx.fillText(text, colX + 10, y + rowHeight / 2);
          }
        }

        ctx.restore();
        colX += width;
      });
    });

    // Header Row Background & Text
    ctx.fillStyle = isDark ? '#111113' : '#0f172a';
    ctx.fillRect(0, 0, totalWidth, headerHeight);

    ctx.strokeStyle = isDark ? '#27272a' : '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, headerHeight);
    ctx.lineTo(totalWidth, headerHeight);
    ctx.stroke();

    ctx.fillStyle = isDark ? '#ffffff' : '#ffffff';
    ctx.font = `700 12px ${fontSans}`;
    ctx.textBaseline = 'middle';
    let hX = 0;
    cols.forEach((col, i) => {
      const width = colWidths[i];
      let label = String(col.label || '').toUpperCase();
      if (sortConfig && sortConfig.key === col.key) {
        label += sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
      }
      
      const words = label.split(' ');
      let line = '';
      let lineY = headerHeight / 2;
      
      if (ctx.measureText(label).width > width - 20) {
        lineY = headerHeight / 2 - 7;
      }

      if (col.key === 'no' || col.key === 'status') {
        ctx.textAlign = 'center';
        ctx.fillText(label, hX + width / 2, headerHeight / 2);
        ctx.textAlign = 'left';
      } else {
        for (let n = 0; n < words.length; n++) {
          let testLine = line + words[n] + ' ';
          if (ctx.measureText(testLine).width > width - 15 && n > 0) {
            ctx.fillText(line, hX + 12, lineY);
            line = words[n] + ' ';
            lineY += 15;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, hX + 12, lineY);
      }
      hX += width;
    });

  }, [paginatedProjects, searchTerm, globalYearFilter, globalStoreFilter, globalLocationFilter, statusFilter, flashToggle, sortConfig, theme]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const headerHeight = 60;
    const rowHeight = 70;

    if (y <= headerHeight) {
      const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
      const logicalWidth = Math.max(wrapper.clientWidth, 1280);
      const totalBase = baseWidths.reduce((a, b) => a + b, 0);
      const scale = logicalWidth / totalBase;
      const colWidths = baseWidths.map(w => w * scale);
      
      const cols = [
        { label: t('Year'), key: 'year' },
        { label: t('Store'), key: 'store' },
        { label: t('Location'), key: 'location' },
        { label: t('Code'), key: 'code' },
        { label: t('Project'), key: 'name' },
        { label: t('Status'), key: 'status' },
        { label: t('Details'), key: 'detail' },
        { label: t('Tak start'), key: 'start' },
        { label: t('Tak compl'), key: 'handover' },
        { label: t('Opening'), key: 'opening' }
      ];

      let currentX = 0;
      for (let i = 0; i < cols.length; i++) {
        const colWidth = colWidths[i];
        if (x >= currentX && x <= currentX + colWidth) {
          const key = cols[i].key;
          if (key === 'start' || key === 'handover' || key === 'opening') {
            setSortConfig(prev => {
              if (prev && prev.key === key) {
                if (prev.direction === 'asc') return { key, direction: 'desc' };
                return null;
              }
              return { key, direction: 'asc' };
            });
          }
          break;
        }
        currentX += colWidth;
      }
      return;
    }

    const idx = Math.floor((y - headerHeight) / rowHeight);
    if (idx >= 0 && idx < paginatedProjects.length) {
      const baseWidths = [100, 75, 80, 140, 210, 125, 210, 105, 105, 105];
      const logicalWidth = Math.max(wrapper.clientWidth, 1280);
      const totalBase = baseWidths.reduce((a, b) => a + b, 0);
      const scale = logicalWidth / totalBase;
      const noColWidth = 100 * scale;

      const clickedProject = paginatedProjects[idx];
      if (x < noColWidth && clickedProject.id) {
        handlePinToggle(e as unknown as React.MouseEvent, clickedProject.id);
        return;
      }
      
      onProjectClick(clickedProject);
    }
  };

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm min-h-0">
      {/* Sticky Action Controls (matching DetailTab design) */}
      {currentUser.role === 'admin' && (
        <div className="fixed top-[76px] xl:top-[84px] right-4 md:right-8 z-50 flex flex-row gap-2 justify-end items-start print:hidden">
          <button 
            onClick={handleGoogleSync}
            disabled={isSyncing}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs ${
              isSyncing
                ? "bg-red-50 hover:bg-red-100 border-red-200 text-red-600 dark:text-red-400 disabled:opacity-50"
                : "bg-slate-900 dark:bg-blue-600 border border-slate-800 dark:border-blue-500 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 shadow-md"
            }`}
            title="Google Sync"
          >
            <RefreshCw className={cn("w-4 h-4 pointer-events-none", isSyncing && "animate-spin")} />
            <span className="hidden sm:inline pointer-events-none">{isSyncing ? t('Syncing...') : t('Google Sync')}</span>
          </button>
        </div>
      )}
      
      <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden rounded-t-xl">
        <div className="flex flex-col gap-2.5 sm:gap-3 w-full xl:w-auto flex-grow max-w-4xl">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full">
          <select 
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            <option value="all">{t('All Years')}</option>
            {years.map(y => <option key={y} value={y}>{t('Year')} {y}</option>)}
          </select>
          <select 
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            {stores.length > 1 && <option value="all">{t('All Stores')}</option>}
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <MultiCheckboxSelect 
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder={t('All Locations')}
            className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          />
          <select 
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value;
              setStatusFilter(val);
              if (!searchTerm.trim()) {
                lastSelectedStatusFilterRef.current = val;
                safeSetItemSession("taka_general_status_filter", val);
              }
            }}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          >
            <option value="all">{t('All Statuses')}</option>
            <option value="On process">{t('On process')}</option>
            <option value="On process + Upcoming 3 days">{t('On process + Upcoming 3 days')}</option>
            <option value="Upcoming">{t('Upcoming')}</option>
            <option value="Completed">{t('Completed')}</option>
            <option value="Handover">{t('Handover')}</option>
            <option value="Canceled">{t('Canceled')}</option>
          </select>
          </div>
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
              <Search className="w-4 h-4" />
            </div>
            <DebouncedSearchInput 
              value={searchTerm}
              onChange={(val) => setSearchTerm(val)}
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 p-2 outline-none shadow-sm" 
              placeholder={t('Search anything...')}
            />
          </div>
        </div>
      </div>

      <div ref={wrapperRef} className="hidden xl:block flex-grow overflow-auto border-t border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] relative">
        <canvas 
          ref={canvasRef} 
          onClick={handleCanvasClick}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          className="block cursor-pointer"
        />

        {/* Full-width drag-over drop target zones when dragging */}
        {draggedPinnedId && paginatedProjects.map((p, idx) => {
          if (!p.id || !pinnedProjects.includes(p.id)) return null;
          const isSource = p.id === draggedPinnedId;
          const isTarget = dragOverTarget?.id === p.id;
          return (
            <div
              key={`drop-zone-${p.id}`}
              className={`absolute left-0 right-0 z-20 min-w-[1100px] transition-colors pointer-events-auto ${
                isSource 
                  ? 'opacity-40 bg-slate-200/50 dark:bg-slate-800/50 border-2 border-dashed border-blue-400' 
                  : isTarget 
                    ? 'bg-blue-500/10 dark:bg-blue-400/10' 
                    : 'hover:bg-blue-500/5'
              }`}
              style={{ top: 60 + idx * 70, height: 70 }}
              onDragOver={(e) => handleRowDragOver(e, p, idx)}
              onDrop={(e) => dragOverTarget && handleRowDrop(e, p.id!, dragOverTarget.position)}
            >
              {isSource && (
                <div className="absolute inset-0 flex items-center pl-28 text-xs font-semibold text-blue-600 dark:text-blue-400 select-none">
                  <span>{t('Moving project')}: {p.code} - {p.name}</span>
                </div>
              )}
            </div>
          );
        })}

        {/* High-visibility glowing insertion beam during drag */}
        {draggedPinnedId && dragOverTarget && (
          <div
            className="absolute left-0 right-0 min-w-[1100px] z-30 pointer-events-none transition-all duration-75"
            style={{
              top: (dragOverTarget.position === 'above' 
                ? 60 + dragOverTarget.index * 70 
                : 60 + (dragOverTarget.index + 1) * 70) - 2,
            }}
          >
            <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.9)] rounded-full relative">
              <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-300 dark:ring-blue-800" />
              <div className="absolute -top-3.5 left-28 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg border border-blue-300/40 animate-pulse">
                {dragOverTarget.position === 'above' ? (
                  <>
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>{t('Insert above')}: {dragOverTarget.projectCode}</span>
                  </>
                ) : (
                  <>
                    <ArrowDown className="w-3.5 h-3.5" />
                    <span>{t('Insert below')}: {dragOverTarget.projectCode}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Success pulse highlight overlay on the newly dropped row */}
        {justDroppedId && (
          paginatedProjects.map((p, idx) => {
            if (p.id !== justDroppedId) return null;
            return (
              <div
                key={`just-dropped-${p.id}`}
                className="absolute left-0 right-0 min-w-[1100px] h-[70px] bg-emerald-500/15 dark:bg-emerald-400/15 border-2 border-emerald-500 z-30 pointer-events-none flex items-center justify-between px-6 animate-pulse rounded-lg transition-all duration-700"
                style={{ top: 60 + idx * 70 }}
              >
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs bg-white/95 dark:bg-slate-900/95 px-3 py-1 rounded-full shadow border border-emerald-500/50">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('Position updated successfully!')}</span>
                </div>
              </div>
            );
          })
        )}

        {/* Action overlay (drag handle, pin button, and quick up/down) for projects on Canvas */}
        {paginatedProjects.map((p, idx) => {
          if (!p.id) return null;
          const isPinned = pinnedProjects.includes(p.id);
          const pinnedIndex = pinnedProjects.indexOf(p.id);
          return (
            <div 
              key={`row-ctrl-${p.id}`}
              className="absolute left-0 flex items-center gap-1 z-10 pl-2 pointer-events-auto"
              style={{ 
                top: 60 + idx * 70, 
                width: isPinned ? 58 : 36,
                height: 70 
              }}
            >
              {isPinned ? (
                <>
                  {/* Quick 1-click reorder buttons (Move Up / Down) placed where drag handle was */}
                  <div className="flex flex-col items-center justify-center gap-0.5 w-5 h-7">
                    <button
                      type="button"
                      disabled={pinnedIndex === 0}
                      onClick={(e) => handleMovePinned(e, p.id!, 'up')}
                      className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === 0 ? 'invisible pointer-events-none' : ''}`}
                      title={t('Move up')}
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={pinnedIndex === pinnedProjects.length - 1}
                      onClick={(e) => handleMovePinned(e, p.id!, 'down')}
                      className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === pinnedProjects.length - 1 ? 'invisible pointer-events-none' : ''}`}
                      title={t('Move down')}
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePinToggle(e, p.id!);
                    }}
                    className="flex items-center justify-center w-6 h-7 rounded hover:bg-blue-100/70 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    title={t('Unpin')}
                  >
                    <Pin className="w-3.5 h-3.5 fill-current" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePinToggle(e, p.id!);
                  }}
                  className="flex items-center justify-center w-6 h-7 rounded opacity-0 hover:opacity-100 text-slate-300 hover:text-blue-600 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-all"
                  title={t('Pin to top')}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-2.5 p-2.5 sm:p-4 relative">
        {paginatedProjects.map((p, idx) => {
          const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
          
          let statusBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
          let borderAccentClass = 'border-l-4 border-l-slate-400';
          let bgCardTint = 'bg-white dark:bg-[#1e1e20]';

          if (status === 'Completed') {
            statusBadgeClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white shadow-2xs font-extrabold border-emerald-500';
            borderAccentClass = 'border-l-[5px] border-l-emerald-500';
            bgCardTint = 'bg-emerald-50/25 dark:bg-emerald-950/15';
          } else if (status === 'Handover') {
            statusBadgeClass = 'bg-blue-600 text-white dark:bg-blue-600 dark:text-white shadow-2xs font-extrabold border-blue-500';
            borderAccentClass = 'border-l-[5px] border-l-blue-500';
            bgCardTint = 'bg-blue-50/25 dark:bg-blue-950/15';
          } else if (status === 'On process') {
            statusBadgeClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white shadow-2xs font-extrabold border-amber-400';
            borderAccentClass = 'border-l-[5px] border-l-amber-500';
            bgCardTint = 'bg-amber-50/30 dark:bg-amber-950/20';
          } else if (status === 'Canceled') {
            statusBadgeClass = 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white shadow-2xs font-extrabold border-rose-500';
            borderAccentClass = 'border-l-[5px] border-l-rose-500';
            bgCardTint = 'bg-rose-50/25 dark:bg-rose-950/15';
          } else {
            statusBadgeClass = 'bg-indigo-600 text-white dark:bg-indigo-600 dark:text-white shadow-2xs font-extrabold border-indigo-500';
            borderAccentClass = 'border-l-[5px] border-l-indigo-500';
            bgCardTint = 'bg-indigo-50/25 dark:bg-indigo-950/15';
          }

          const storeUpper = (p.store || '').toUpperCase();
          let storeBadgeClass = 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
          if (storeUpper === 'HCM') {
            storeBadgeClass = 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80 dark:border-blue-800 font-bold';
          } else if (storeUpper === 'HN') {
            storeBadgeClass = 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80 dark:border-rose-800 font-bold';
          } else if (storeUpper) {
            storeBadgeClass = 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200/80 dark:border-amber-800 font-bold';
          }

          const progressPercent = p.computedPlanProgress ?? 0;
          const actProgressPercent = p.computedActProgress ?? 0;

          const now = new Date();
          let activeTaskNames: string[] = [];
          if (p.taskSummaries) {
            const activeTasks = p.taskSummaries.filter(t => {
              if (!t.start || !t.finish) return false;
              const start = new Date(t.start);
              const finish = new Date(t.finish);
              return now >= start && now <= finish;
            });
            activeTaskNames = activeTasks.map(t => t.name);
          }

          let taskLines: string[] = [];
          activeTaskNames.forEach(name => {
            taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
          });

          const isPinned = p.id ? pinnedProjects.includes(p.id) : false;
          const pinnedIndex = p.id ? pinnedProjects.indexOf(p.id) : -1;
          const isSource = draggedPinnedId === p.id;
          const isTarget = dragOverTarget?.id === p.id;
          const isJustDropped = justDroppedId === p.id;

          return (
            <React.Fragment key={p.id || `${p.code}-${p.year}-${p.store}-${p.no}`}>
              {/* Insertion line indicator on mobile when dragging above */}
              {draggedPinnedId && isTarget && dragOverTarget.position === 'above' && (
                <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)] -my-1 flex items-center justify-center">
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                    ▲ {t('Insert above')}: {p.code}
                  </span>
                </div>
              )}

              <div 
                className={`${bgCardTint} ${borderAccentClass} rounded-xl border border-slate-200/90 dark:border-[#38383b] shadow-xs hover:shadow-md p-3 flex flex-col gap-2 cursor-pointer relative transition-all active:scale-[0.99] touch-manipulation ${
                  isSource ? 'opacity-40 ring-2 ring-dashed ring-blue-400' : ''
                } ${isTarget ? 'bg-blue-50/60 dark:bg-blue-950/30' : ''} ${
                  isJustDropped ? 'ring-2 ring-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40' : isPinned ? 'ring-2 ring-blue-500/50' : ''
                }`}
                onClick={() => onProjectClick(p)}
                draggable={isPinned}
                onDragStart={(e) => p.id && isPinned && handleDragStart(e, p.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => isPinned && handleRowDragOver(e, p, idx)}
                onDrop={(e) => isPinned && dragOverTarget && handleRowDrop(e, p.id!, dragOverTarget.position)}
              >
                {/* Success badge for mobile */}
                {isJustDropped && (
                  <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{t('Position updated!')}</span>
                  </div>
                )}

                {/* Top controls: Badges on left, Status Badge on top-right, Pin Controls below Status Badge */}
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {p.year && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        {p.year}
                      </span>
                    )}
                    {p.store && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded border font-bold ${storeBadgeClass}`}>
                        {p.store}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                      {p.code}
                    </span>
                    {p.location && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                        • {p.location}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-md border whitespace-nowrap ${statusBadgeClass}`}>
                      {status}
                    </div>
                    {p.id && (
                      <div className="flex items-center bg-slate-100/90 dark:bg-slate-800/90 rounded-md p-0.5 border border-slate-200/80 dark:border-slate-700/80">
                        <button
                          type="button"
                          onClick={(e) => handlePinToggle(e, p.id as string)}
                          className={`p-1 rounded transition-colors active:scale-95 touch-manipulation ${isPinned ? 'text-blue-600 bg-white dark:bg-slate-700 shadow-2xs' : 'text-slate-400 hover:text-blue-600'}`}
                          title={isPinned ? "Unpin" : "Pin to top"}
                        >
                          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
                        </button>
                        {isPinned && (
                          <>
                            <button
                              type="button"
                              disabled={pinnedIndex === 0}
                              onClick={(e) => handleMovePinned(e, p.id as string, 'up')}
                              className={`p-0.5 rounded text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === 0 ? 'opacity-30 pointer-events-none' : 'active:scale-95'}`}
                              title={t('Move up')}
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={pinnedIndex === pinnedProjects.length - 1}
                              onClick={(e) => handleMovePinned(e, p.id as string, 'down')}
                              className={`p-0.5 rounded text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === pinnedProjects.length - 1 ? 'opacity-30 pointer-events-none' : 'active:scale-95'}`}
                              title={t('Move down')}
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Project Title */}
                <div className="font-bold text-slate-900 dark:text-[#ffffff] text-sm sm:text-base leading-snug">
                  {p.name}
                  {p.linkCodes && p.linkCodes !== p.code && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-normal ml-1.5">
                      ({p.linkCodes})
                    </span>
                  )}
                </div>

                {/* Dates Section: Start in Blue, Finish in Pink, Opening in Emerald (matching Task Detail) */}
                <div className="grid grid-cols-3 gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50/90 dark:bg-[#161618] border border-slate-200/60 dark:border-[#2e2e32] text-xs">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Start')}</span>
                    {(() => {
                      const formatted = formatDisplayDateMain(p.computedTakStart || p.start);
                      const commaIdx = formatted.indexOf(',');
                      if (commaIdx !== -1) {
                        return (
                          <span className="font-mono text-xs font-bold text-blue-600 dark:text-[#8ab4f8] leading-tight block">
                            <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                            <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-[#8ab4f8] leading-tight break-words whitespace-normal">
                          {formatted || '-'}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col min-w-0 border-x border-slate-200/60 dark:border-[#2e2e32] px-2">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Finish')}</span>
                    {(() => {
                      const formatted = formatDisplayDateMain(p.computedTakCompl || p.handover || (p as any).takCompl);
                      const commaIdx = formatted.indexOf(',');
                      if (commaIdx !== -1) {
                        return (
                          <span className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 leading-tight block">
                            <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                            <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono text-xs font-bold text-pink-600 dark:text-pink-400 leading-tight break-words whitespace-normal">
                          {formatted || '-'}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col min-w-0 pl-1.5">
                    <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight leading-none mb-1">{t('Opening')}</span>
                    {(() => {
                      const formatted = formatDisplayDateMain(p.computedOpening || p.opening);
                      const commaIdx = formatted.indexOf(',');
                      if (commaIdx !== -1) {
                        return (
                          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight block">
                            <span className="block">{formatted.slice(0, commaIdx + 1)}</span>
                            <span className="block">{formatted.slice(commaIdx + 1).trim()}</span>
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 leading-tight break-words whitespace-normal">
                          {formatted || '-'}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Progress Bars: Plan bar stacked directly on top of Act bar for easy direct visual comparison */}
                <div className="flex flex-col gap-1.5 py-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight w-11 shrink-0">Plan:</span>
                    <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
                      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300 shadow-2xs" style={{ width: `${progressPercent}%` }}></div>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 w-9 text-right shrink-0">{progressPercent}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tight w-11 shrink-0">Act:</span>
                    <div className="flex-1 bg-slate-200/80 dark:bg-slate-700/80 rounded-full h-2 overflow-hidden">
                      <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-2 rounded-full transition-all duration-300 shadow-2xs" style={{ width: `${actProgressPercent}%` }}></div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 w-9 text-right shrink-0">{actProgressPercent}%</span>
                  </div>
                </div>
                
                {/* Active Subtasks / Description Detail Box */}
                {(taskLines.length > 0 || p.detail) && (
                  <div className="bg-slate-50/90 dark:bg-[#161618] rounded-lg p-2 border border-slate-200/60 dark:border-[#2e2e32] text-xs shadow-2xs flex flex-col gap-1">
                    {taskLines.length > 0 && (
                      <div className="flex flex-col gap-0.5">
                        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('Detail')}</div>
                        {taskLines.map((line, idx) => (
                          <div key={idx} className={`font-medium text-xs leading-tight ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}>
                            • {line}
                          </div>
                        ))}
                      </div>
                    )}
                    {p.detail && (
                      <div className="flex flex-col gap-0.5">
                        <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t('Description')}</div>
                        <div className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">{p.detail}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Insertion line indicator on mobile when dragging below */}
              {draggedPinnedId && isTarget && dragOverTarget.position === 'below' && (
                <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 rounded-full shadow-[0_0_8px_rgba(37,99,235,0.8)] -my-1 flex items-center justify-center">
                  <span className="bg-blue-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-sm">
                    ▼ {t('Insert below')}: {p.code}
                  </span>
                </div>
              )}
            </React.Fragment>
          );
        })}
        {visibleCount < filteredProjects.length && (
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm"
            >
              Load More Projects ({filteredProjects.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>

      {/* Floating visual feedback toast */}
      {successToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 bg-emerald-600 dark:bg-emerald-700 text-white font-medium text-sm rounded-full shadow-2xl border border-emerald-400/50 animate-bounce">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-white" />
          <span>{successToast}</span>
        </div>
      )}

      <div className="mt-4 text-xs text-slate-500 dark:text-[#a3a3a3] text-right flex justify-between items-center px-1 shrink-0">
        <span>* Data is synced to Cloud. Header is sticky.</span>
        <span>{t('Total')}: <span className="font-bold text-slate-700 dark:text-[#c3c3c3]">{filteredProjects.length}</span> {t('')}</span>
      </div>
    </div>
  );
}
