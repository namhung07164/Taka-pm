import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project, Task, AppUser, AppRole } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { safeGetItemLocal, safeSetItemLocal, safeGetDeviceItemLocal, safeSetDeviceItemLocal, getDeviceScreenType } from '../../lib/storage';
import { scrollToElement } from '../../lib/utils';
import { AVAILABLE_COLUMNS, DelegatableItem, DelegationColWidths, resolveGroupParentProject } from './taskDelegationTypes';
import { filterAndSortDelegationGroups } from './delegationFilterSort';

interface UseTaskDelegationDataParams {
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  onBackFromFocus?: () => void;
}

export function useTaskDelegationData({
  projects,
  tasks,
  currentUser,
  onBackFromFocus,
}: UseTaskDelegationDataParams) {
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);
  const appUsers = useAppStore((state) => state.appUsers);
  const subAppUsers = useAppStore((state) => state.subAppUsers);
  const rawDelegationGroups = useAppStore((state) => state.delegationGroups);

  const groups = useMemo(() => {
    return [...rawDelegationGroups].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [rawDelegationGroups]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterFlowStatus, setFilterFlowStatus] = useState('all');
  const [multiSearchTerm, setMultiSearchTerm] = useState('');
  const [filterParty, setFilterParty] = useState('');
  const [focusTarget, setFocusTarget] = useState<{ groupId: string; subTaskId?: string } | null>(null);
  const [visibleCount, setVisibleCount] = useState(20);

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [colWidths, setColWidths] = useState<DelegationColWidths>({
    expand: 50,
    taskName: 300,
    projectCode: 150,
    comments: 400,
    status: 120,
    startAct: 120,
    finishAct: 120,
    priority: 120,
    party: 150,
    actions: 80,
  });

  const availableColumnsForUser = useMemo(() => AVAILABLE_COLUMNS, []);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    availableColumnsForUser.map((c) => c.id)
  );
  const searchRef = useRef<HTMLDivElement>(null);

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const loadDeviceConfig = () => {
      const saved = safeGetDeviceItemLocal('taka_delegation_col_widths', currentUser.id);
      if (saved) {
        try {
          setColWidths(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }

      const savedCols = safeGetDeviceItemLocal('taka_delegation_visible_cols', currentUser.id);
      if (savedCols) {
        try {
          setVisibleColumns(JSON.parse(savedCols));
        } catch (e) {
          console.error(e);
        }
      } else {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        if (isMobile) {
          setVisibleColumns(['expand', 'taskName', 'status', 'actions']);
        }
      }
    };

    loadDeviceConfig();

    const handleResize = () => {
      const currentScreenType = getDeviceScreenType();
      if (currentScreenType !== prevScreenTypeRef.current) {
        prevScreenTypeRef.current = currentScreenType;
        loadDeviceConfig();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUser.id]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleResize = (col: keyof DelegationColWidths, newWidth: number) => {
    setColWidths((prev) => {
      const next = { ...prev, [col]: newWidth };
      safeSetDeviceItemLocal('taka_delegation_col_widths', JSON.stringify(next), currentUser.id);
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(colId) ? prev.filter((id) => id !== colId) : [...prev, colId];
      safeSetDeviceItemLocal('taka_delegation_visible_cols', JSON.stringify(next), currentUser.id);
      return next;
    });
  };

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const isArchiveYear =
    globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite =
    (isAdmin || !!permissionMatrix[role]?.Write?.taskDelegation) && !isArchiveYear;

  useEffect(() => {
    if (focusTarget) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setFocusTarget(null);
          onBackFromFocus?.();
        }
      };
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [focusTarget, onBackFromFocus]);

  const picOptions = useMemo(() => {
    const list = new Set<string>();
    appUsers.forEach((u) => u.username && list.add(u.username));
    subAppUsers.forEach((u) => {
      const vals = [
        u.username,
        u.name,
        u.fullName,
        u.displayName,
        u.email,
        u.title,
        u.id,
      ].filter((v) => v && typeof v === 'string' && v.trim() !== '');
      vals.forEach((val) => list.add(val as string));
      for (const key of Object.keys(u)) {
        const val = (u as any)[key];
        if (val && typeof val === 'string' && val.trim() !== '' && key.toLowerCase().includes('name')) {
          list.add(val);
        }
      }
    });
    return Array.from(list).sort();
  }, [appUsers, subAppUsers]);

  const uniqueParties = useMemo(() => {
    const partiesList = new Set<string>();
    groups.forEach((g) =>
      g.subTasks.forEach((st) => {
        if (st.party) partiesList.add(st.party);
      })
    );
    return [...partiesList].sort();
  }, [groups]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleOpenGroup = (e: any) => {
      const { groupId, subTaskId } = e.detail;
      setFocusTarget({ groupId, subTaskId });

      const group = groups.find((g) => g.id === groupId);
      if (group) {
        const p = resolveGroupParentProject(group, projects, tasks);
        if (p) {
          const pId = p.id || String(p.no);
          setExpandedProjects((prev) => {
            if (!prev.includes(pId)) return [...prev, pId];
            return prev;
          });
        }
      }

      setExpandedGroups((prev) => {
        if (!prev.includes(groupId)) return [...prev, groupId];
        return prev;
      });

      setTimeout(() => {
        const el = document.getElementById(`delegation-subtask-${subTaskId}`);
        const elMob = document.getElementById(`delegation-subtask-mobile-${subTaskId}`);
        const targetEl = el && el.offsetHeight > 0 ? el : elMob && elMob.offsetHeight > 0 ? elMob : null;

        if (targetEl) {
          scrollToElement(targetEl);
          targetEl.classList.add('bg-yellow-50', 'transition-all');
          setTimeout(() => targetEl?.classList.remove('bg-yellow-50', 'transition-all'), 3000);
        } else {
          const groupEl = document.getElementById(`delegation-group-${groupId}`);
          const groupElMob = document.getElementById(`delegation-group-mobile-${groupId}`);
          const targetGroupEl = groupEl && groupEl.offsetHeight > 0 ? groupEl : groupElMob && groupElMob.offsetHeight > 0 ? groupElMob : null;

          if (targetGroupEl) {
            scrollToElement(targetGroupEl);
            targetGroupEl.classList.add('bg-yellow-100', 'transition-all');
            setTimeout(() => targetGroupEl?.classList.remove('bg-yellow-100', 'transition-all'), 3000);
          }
        }
      }, 500);
    };

    const handleClearFocus = () => {
      setFocusTarget(null);
    };

    window.addEventListener('taka_open_delegation_group', handleOpenGroup);
    window.addEventListener('taka_clear_delegation_focus', handleClearFocus);
    return () => {
      window.removeEventListener('taka_open_delegation_group', handleOpenGroup);
      window.removeEventListener('taka_clear_delegation_focus', handleClearFocus);
    };
  }, [groups, projects, tasks]);

  const availableItems: DelegatableItem[] = useMemo(() => {
    return [
      ...projects
        .filter(
          (p) =>
            p.delegation &&
            !groups.some((g) => g.parentTaskId === p.code && (!g.projectStore || g.projectStore === p.store))
        )
        .map((p) => ({
          type: 'project' as const,
          id: `${p.code}-${p.year || ''}-${p.store || ''}`,
          name: p.name,
          projectCode: p.code,
          projectStore: p.store,
          projectYear: p.year,
          projectName: p.name,
          party: '',
        })),
      ...tasks
        .filter((t) => t.delegation && !groups.some((g) => g.parentTaskId === t.id))
        .map((t) => {
          const p = projects.find(
            (proj) =>
              proj.code === t.projectCode &&
              (String(proj.year || '') === String(t.projectYear || '') || (!proj.year && !t.projectYear)) &&
              (String(proj.store || '') === String(t.projectStore || '') || (!proj.store && !t.projectStore))
          );
          return {
            type: 'task' as const,
            id: t.id,
            name: t.name,
            projectCode: t.projectCode,
            projectStore: t.projectStore,
            projectYear: t.projectYear,
            projectName: p?.name,
            party: t.party,
          };
        }),
    ];
  }, [projects, tasks, groups]);

  const searchResults = useMemo(() => {
    return searchTerm
      ? availableItems.filter((item) => {
          const searchStr = `${item.name} ${item.projectCode} ${item.projectName || ''} ${item.party || ''}`.toLowerCase();
          return searchStr.includes(searchTerm.toLowerCase());
        })
      : availableItems;
  }, [searchTerm, availableItems]);

  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => (prev.includes(id) ? prev.filter((gId) => gId !== id) : [...prev, id]));
  };

  const toggleProject = (id: string) => {
    setExpandedProjects((prev) => (prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]));
  };

  const visibleGroups = useMemo(() => {
    return filterAndSortDelegationGroups({
      groups,
      isAdmin,
      currentUser,
      filterFlowStatus,
      filterParty,
      multiSearchTerm,
      focusTarget,
      sortConfig,
    });
  }, [groups, isAdmin, currentUser, filterFlowStatus, filterParty, multiSearchTerm, focusTarget, sortConfig]);

  const groupedDelegations = useMemo(() => {
    const byProject = new Map<string, typeof visibleGroups>();
    const orphans: typeof visibleGroups = [];

    const paginatedGroups = visibleGroups.slice(0, visibleCount);

    paginatedGroups.forEach((group) => {
      const p = resolveGroupParentProject(group, projects, tasks);
      if (p) {
        const key = p.id || String(p.no);
        if (!byProject.has(key)) {
          byProject.set(key, []);
        }
        byProject.get(key)!.push(group);
      } else {
        orphans.push(group);
      }
    });

    const orderedProjects = projects
      .filter((p) => {
        const key = p.id || String(p.no);
        return byProject.has(key);
      })
      .map((p) => {
        const key = p.id || String(p.no);
        return {
          project: p,
          groups: byProject.get(key)!,
        };
      });

    return { orderedProjects, orphans };
  }, [visibleGroups, visibleCount, projects, tasks]);

  const isAllExpanded =
    expandedGroups.length >= visibleGroups.length &&
    expandedProjects.length >= groupedDelegations.orderedProjects.length;

  const handleToggleAllGroups = () => {
    const allProjectIds = groupedDelegations.orderedProjects.map(
      (p) => p.project.id || String(p.project.no)
    );
    if (expandedGroups.length >= visibleGroups.length && expandedProjects.length >= allProjectIds.length) {
      setExpandedGroups([]);
      setExpandedProjects([]);
    } else {
      setExpandedGroups(visibleGroups.map((g) => g.id));
      setExpandedProjects(allProjectIds);
    }
  };

  const handleTextareaInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = `${target.scrollHeight}px`;
  };

  useEffect(() => {
    const timers = [100, 500].map((delay) =>
      setTimeout(() => {
        document.querySelectorAll('textarea').forEach((textarea) => {
          textarea.style.height = 'auto';
          textarea.style.height = `${textarea.scrollHeight}px`;
        });
      }, delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [expandedGroups, groups]);

  return {
    groups,
    searchTerm,
    setSearchTerm,
    filterFlowStatus,
    setFilterFlowStatus,
    multiSearchTerm,
    setMultiSearchTerm,
    filterParty,
    setFilterParty,
    focusTarget,
    setFocusTarget,
    visibleCount,
    setVisibleCount,
    sortConfig,
    handleSort,
    colWidths,
    handleResize,
    visibleColumns,
    availableColumnsForUser,
    handleToggleColumn,
    isSearchFocused,
    setIsSearchFocused,
    searchRef,
    expandedProjects,
    setExpandedProjects,
    expandedGroups,
    setExpandedGroups,
    toggleGroup,
    toggleProject,
    handleToggleAllGroups,
    isAllExpanded,
    picOptions,
    uniqueParties,
    availableItems,
    searchResults,
    visibleGroups,
    groupedDelegations,
    handleTextareaInput,
    canWrite,
    isAdmin,
    globalYearFilter,
    globalStoreFilter,
  };
}
