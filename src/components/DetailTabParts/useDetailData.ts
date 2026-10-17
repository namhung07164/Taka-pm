import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, DelegationGroup, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { 
  getTaskStatus, 
  parseDateTime, 
  formatDisplayDateMain, 
  formatDisplayDateTime, 
  resolveActualStatus, 
  matchesAdvancedSearch 
} from '../../lib/utils';
import { computeTaskCode, computeAllTaskCodes } from '../../lib/ganttUtils';
import { safeGetItemSession, safeSetItemSession } from '../../lib/storage';
import { SortConfig } from './detailTypes';
import { useDetailProjectInfo } from './useDetailProjectInfo';
import { useDetailFlatRows } from './useDetailFlatRows';
import { useDetailFocusTracking } from './useDetailFocusTracking';

interface UseDetailDataParams {
  projects: Project[];
  tasks: Task[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  effectiveStore: string;
  globalYearFilter: string;
  setGlobalYearFilter: (year: string) => void;
  globalStoreFilter: string;
  setGlobalStoreFilter: (store: string) => void;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  initialFilterCode?: string;
  initialFocusTaskId?: string;
  returnScrollId?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
  sortConfig: SortConfig | null;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  setVisibleActiveProjectIds: (ids: string[]) => void;
  canWrite: boolean;
}

export function useDetailData({
  projects,
  tasks,
  delegationGroups,
  currentUser: _currentUser,
  effectiveStore,
  globalYearFilter,
  setGlobalYearFilter,
  globalStoreFilter,
  setGlobalStoreFilter,
  globalLocationFilter,
  setGlobalLocationFilter,
  initialFilterCode,
  initialFocusTaskId,
  returnScrollId: _returnScrollId,
  onClearFocus,
  onBackToGantt,
  sortConfig,
  expandedCodes,
  setExpandedCodes,
  setVisibleActiveProjectIds,
}: UseDetailDataParams) {
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [visibleCount, setVisibleCount] = useState(30);
  const [statusFilter, setStatusFilter] = useState(() => safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedStatusFilterRef = useRef<string>(safeGetItemSession("taka_detail_status_filter") || 'On process + Upcoming 3 days');
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(false);

  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
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
  }, [deferredSearchTerm]);

  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastCheckedTaskIdRef = useRef<string | null>(null);

  // Focus & Viewport Tracking Hook
  const {
    activeProjectInView,
    handleClearFocus,
    handleBackToGantt,
  } = useDetailFocusTracking({
    projects,
    tasks,
    initialFilterCode,
    initialFocusTaskId,
    onClearFocus,
    onBackToGantt,
    searchTerm,
    setSearchTerm,
    globalYearFilter,
    setGlobalYearFilter,
    globalStoreFilter,
    setGlobalStoreFilter,
    statusFilter,
    setStatusFilter,
    expandedCodes,
    setExpandedCodes,
  });

  // Project Info Map & Helpers Hook
  const {
    tasksByProjectKey,
    projectInfoMap,
    getProjectInfo,
  } = useDetailProjectInfo({ projects, tasks });

  // Auto-jump to matched project location(s) when searching (Debounced)
  useEffect(() => {
    const term = deferredSearchTerm.trim();
    if (!term) return;

    const timer = setTimeout(() => {
      const matchedProjects = projects.filter(p => {
        const pYear = p.year ? String(p.year) : null;
        if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
        if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;

        const groupTasks = tasksByProjectKey.get(`${p.code || ''}-${p.year || ''}-${p.store || ''}`) || [];
        const isMatch = matchesAdvancedSearch(
          term,
          [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party],
          [],
          (tLower) => {
            const summariesMatch = p.taskSummaries?.some(ts =>
              String(ts.name || "").toLowerCase().includes(tLower)
            ) || false;
            const taskMatches = groupTasks.some((t, idx) => {
              const taskFields = [
                t.taskCodePhu,
                `${p.code}#${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
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
    }, 350);

    return () => clearTimeout(timer);
  }, [deferredSearchTerm, projects, tasksByProjectKey, globalYearFilter, effectiveStore, globalLocationFilter, setGlobalLocationFilter]);

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

  useEffect(() => { setVisibleCount(20); }, [searchTerm, globalStoreFilter, globalYearFilter, globalLocationFilter, statusFilter]);

  // === Auto-clear stale filters when user changes Year / Store in Task Detail ===
  const prevYearStoreRef = useRef(`${globalYearFilter}_${effectiveStore}`);

  useEffect(() => {
    const currentKey = `${globalYearFilter}_${effectiveStore}`;
    if (prevYearStoreRef.current !== currentKey) {
      prevYearStoreRef.current = currentKey;

      // 1. Khi đổi Year hoặc Store: nếu đang có detailTabFilterCode / detailTabFocusTaskId của dự án thuộc Store/Year cũ thì xóa đi
      const storeState = useAppStore.getState();
      if (storeState.detailTabFilterCode || storeState.detailTabFocusTaskId) {
        storeState.setDetailTabFilterCode('');
        storeState.setDetailTabFocusTaskId('');
        if (searchTerm && searchTerm === storeState.detailTabFilterCode) {
          setSearchTerm('');
        }
      }

      // 2. Kiểm tra xem globalLocationFilter hiện tại có hợp lệ với Store/Year mới không
      const projectsInNewScope = projects.filter((p) => {
        if (p.isDeleted) return false;
        const pYear = p.year ? String(p.year) : null;
        if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter)) return false;
        if (effectiveStore !== 'all' && String(p.store || '').toUpperCase() !== String(effectiveStore).toUpperCase()) return false;
        return true;
      });

      if (projectsInNewScope.length > 0) {
        // Nếu location đang chọn không có dự án nào ở Store/Year mới -> reset location filter
        if (globalLocationFilter.length > 0) {
          const hasMatchingLoc = projectsInNewScope.some(
            (p) => p.location && globalLocationFilter.includes(p.location)
          );
          if (!hasMatchingLoc) {
            setGlobalLocationFilter([]);
          }
        }

        // Nếu statusFilter đang khác 'all' mà làm ẩn toàn bộ dự án của Store/Year mới -> tự động mở về 'all'
        if (statusFilter !== 'all') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayTime = today.getTime();
          const hasMatchingStatus = projectsInNewScope.some((p) => {
            const info = getProjectInfo(p);
            if (statusFilter === 'On process + Upcoming 3 days') {
              if (info.status === 'On process') return true;
              if (info.status === 'Upcoming') {
                const dStart = parseDateTime(info.start);
                if (dStart) {
                  dStart.setHours(0, 0, 0, 0);
                  const diffDays = Math.ceil((dStart.getTime() - todayTime) / (1000 * 60 * 60 * 24));
                  return diffDays <= 3 && diffDays >= 0;
                }
              }
              return false;
            }
            return info.status === statusFilter;
          });
          if (!hasMatchingStatus) {
            setStatusFilter('all');
            safeSetItemSession('taka_detail_status_filter', 'all');
          }
        }
      }
    }
  }, [
    globalYearFilter,
    effectiveStore,
    projects,
    globalLocationFilter,
    statusFilter,
    searchTerm,
    setGlobalLocationFilter,
    setStatusFilter,
    setSearchTerm,
    getProjectInfo,
  ]);

  // Vị trí đang chọn nhưng không có dự án nào trong store/năm hiện tại thì bỏ qua,
  // tránh bảng trống dù nhãn hiển thị "All Locations" (ví dụ vị trí STORE của HN còn sót khi chuyển sang HCM)
  const effectiveLocationFilter = useMemo(() => {
    if (globalLocationFilter.length === 0) return globalLocationFilter;
    const available = new Set<string>();
    projects.forEach((p) => {
      const pYear = p.year ? String(p.year).trim() : '';
      if (globalYearFilter !== 'all' && pYear !== String(globalYearFilter).trim()) return;
      if (effectiveStore !== 'all' && (!p.store || String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())) return;
      if (p.location) available.add(p.location);
    });
    return globalLocationFilter.filter((loc) => available.has(loc));
  }, [projects, globalYearFilter, effectiveStore, globalLocationFilter]);

  const filteredProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    return projects.filter(p => {
      const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}-${p.id || p.no}`;
      const info = projectInfoMap.get(pKey) || getProjectInfo(p);
      const pYear = p.year ? String(p.year).trim() : null;
      if (globalYearFilter !== 'all' && (pYear === null || pYear !== String(globalYearFilter).trim())) return false;
      if (effectiveStore !== 'all' && (!p.store || String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())) return false;
      if (effectiveLocationFilter.length > 0 && (!p.location || !effectiveLocationFilter.includes(p.location))) return false;

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
          [p.store, p.location, p.year, p.code, p.linkCodes, p.name, p.detail, (p as any).description, p.note, p.party],
          [],
          (term) => {
            const summariesMatch = p.taskSummaries?.some(ts =>
              String(ts.name || "").toLowerCase().includes(term)
            ) || false;
            const taskMatches = groupTasks.some((t, idx) => {
              const taskFields = [
                t.taskCodePhu,
                `${p.code}#${(t.orderIndex !== undefined ? t.orderIndex : idx) + 1}`,
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
  }, [projects, projectInfoMap, getProjectInfo, globalYearFilter, effectiveStore, effectiveLocationFilter, statusFilter, deferredSearchTerm, tasksByProjectKey]);

  // Chẩn đoán: bảng trống dù store có dự án
  useEffect(() => {
    if (filteredProjects.length === 0 && projects.length > 0) {
      console.warn('[Detail] 0 dự án sau khi lọc', {
        totalProjects: projects.length,
        year: globalYearFilter,
        store: effectiveStore,
        locationSelected: globalLocationFilter,
        locationEffective: effectiveLocationFilter,
        status: statusFilter,
        search: deferredSearchTerm,
      });
    }
  }, [filteredProjects.length, projects.length, globalYearFilter, effectiveStore, globalLocationFilter, effectiveLocationFilter, statusFilter, deferredSearchTerm]);

  // Ensure visibleCount is large enough to render target project row
  useEffect(() => {
    if (!initialFilterCode) return;
    const filterClean = String(initialFilterCode).trim().toUpperCase();
    const projIdx = filteredProjects.findIndex(p => {
      const pCode = String(p.code || '').trim().toUpperCase();
      const pId = String(p.id || '').trim().toUpperCase();
      return pId === filterClean || pCode === filterClean || (pCode && filterClean.startsWith(pCode));
    });
    if (projIdx >= 0 && projIdx >= visibleCount) {
      setVisibleCount(projIdx + 25);
    }
  }, [initialFilterCode, filteredProjects, visibleCount]);

  const prevVisibleIdsRef = useRef<string>("");
  useEffect(() => {
    const targetProjects = filteredProjects.length > 0
      ? filteredProjects.slice(0, visibleCount)
      : projects.filter(p => {
          const pYear = p.year ? String(p.year) : null;
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
  }, [filteredProjects, projects, visibleCount, globalYearFilter, effectiveStore, globalLocationFilter, setVisibleActiveProjectIds]);

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
  }, [filteredProjects, visibleCount, projectInfoMap, getProjectInfo]);

  const lowerSearchTerm = searchTerm.toLowerCase().trim();

  // Task code & status maps
  const taskCodeMap = useMemo(() => {
    return computeAllTaskCodes(projects, tasks);
  }, [projects, tasks]);

  const taskActualStatusMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string }>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const t = tasks[idx];
      const taskStatus = getTaskStatus(t.start, t.finish);
      const delegationGroup = delegationGroupByParentKey.get(t.id);
      const actStatus = resolveActualStatus(taskStatus, delegationGroup?.subTasks || [], t);
      map.set(t.id, actStatus);
    }
    return map;
  }, [tasks, delegationGroupByParentKey]);

  // Pre-indexed O(1) map of subtask counts per parent to avoid 250,000 array filters in DetailTaskRow
  const childTasksCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (let idx = 0; idx < tasks.length; idx++) {
      const child = tasks[idx];
      if (child.parentTaskId) {
        map.set(child.parentTaskId, (map.get(child.parentTaskId) || 0) + 1);
      }
    }
    return map;
  }, [tasks]);

  // Virtual Windowing Flat Rows
  const flatTableRows = useDetailFlatRows({
    filteredProjects,
    visibleCount,
    projectInfoMap,
    getProjectInfo,
    sortConfig,
    expandedCodes,
    delegationGroups,
    lowerSearchTerm,
    taskCodeMap,
  });

  // Selection handlers
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
    const strTaskId = String(taskId);
    setSelectedTaskIds(prev => {
      const next = new Set(Array.from(prev).map(String));
      const isChecked = !next.has(strTaskId);
      if (isChecked) {
        if (shiftKey && lastCheckedTaskIdRef.current && lastCheckedTaskIdRef.current !== strTaskId) {
          const visibleIds = allVisibleTaskIds.map(String);
          const lastIdx = visibleIds.indexOf(lastCheckedTaskIdRef.current);
          const currentIdx = visibleIds.indexOf(strTaskId);
          if (lastIdx !== -1 && currentIdx !== -1) {
            const minIdx = Math.min(lastIdx, currentIdx);
            const maxIdx = Math.max(lastIdx, currentIdx);
            for (let idx = minIdx; idx <= maxIdx; idx++) {
              next.add(visibleIds[idx]);
            }
          } else {
            next.add(strTaskId);
          }
        } else {
          next.add(strTaskId);
        }
        lastCheckedTaskIdRef.current = strTaskId;
      } else {
        next.delete(strTaskId);
        lastCheckedTaskIdRef.current = null;
      }
      return next;
    });
  }, [allVisibleTaskIds]);

  return {
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    visibleCount,
    setVisibleCount,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    selectedTaskIds,
    setSelectedTaskIds,
    lastCheckedTaskIdRef,
    activeProjectInView,
    delegationGroupByParentKey,
    projectInfoMap,
    getProjectInfo,
    filteredProjects,
    allVisibleTaskIds,
    lowerSearchTerm,
    taskCodeMap,
    taskActualStatusMap,
    childTasksCountMap,
    flatTableRows,
    handleSelectAllTasksInProject,
    handleToggleSelectTask,
    handleClearFocus,
    handleBackToGantt,
  };
}
