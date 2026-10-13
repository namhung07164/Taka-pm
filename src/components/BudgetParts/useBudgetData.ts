import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Project, Cost, AppUser, AppRole } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { 
  getUserAllowedStores, 
  getEffectiveStoreFilter, 
  formatCurrencyValue 
} from '../../lib/utils';
import { useLocationOptions } from '../../hooks/useLocationOptions';
import { safeSetItemLocal, safeSetItemSession, safeGetItemSession, safeGetDeviceItemLocal, safeSetDeviceItemLocal, getDeviceScreenType } from '../../lib/storage';
import { AVAILABLE_COLUMNS, ProjectFinancials } from './budgetTypes';
import { useBudgetTreeData } from './useBudgetTreeData';
import { useBudgetFilterSort } from './useBudgetFilterSort';
import { useBudgetCsvOps } from './useBudgetCsvOps';

interface UseBudgetDataParams {
  projects: Project[];
  costs: Cost[];
  currentUser: AppUser;
  initialSearchTerm?: string;
}

export function useBudgetData({
  projects,
  costs,
  currentUser,
  initialSearchTerm = ''
}: UseBudgetDataParams) {
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const currency = useAppStore(state => state.currency);
  const jpyRate = useAppStore(state => state.jpyRate);
  const usdRate = useAppStore(state => state.usdRate);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);
  const setDetailTabFilterCode = useAppStore(state => state.setDetailTabFilterCode);
  const setDetailTabStoreFilter = useAppStore(state => state.setDetailTabStoreFilter);
  const setActiveTab = useAppStore(state => state.setActiveTab);
  const budgetTabSearchTerm = useAppStore(state => state.budgetTabSearchTerm);

  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || budgetTabSearchTerm || '');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
    } else if (budgetTabSearchTerm) {
      setSearchTerm(budgetTabSearchTerm);
    }
  }, [initialSearchTerm, budgetTabSearchTerm]);

  const [collapsedInSearch, setCollapsedInSearch] = useState<Set<string>>(new Set());
  const [moneyFilter, setMoneyFilter] = useState(() => {
    if ((initialSearchTerm || '').trim()) return 'all';
    return safeGetItemSession("taka_budget_money_filter") || 'has_money';
  });
  const lastSelectedMoneyFilterRef = useRef<string>(
    safeGetItemSession("taka_budget_money_filter") || 'has_money'
  );
  const lastSelectedLocationFilterRef = useRef<string[]>(globalLocationFilter);
  const wasSearchingRef = useRef<boolean>(!!(initialSearchTerm || '').trim());

  useEffect(() => {
    const isSearching = !!deferredSearchTerm.trim();
    if (!wasSearchingRef.current && isSearching) {
      if (moneyFilter !== 'all') {
        lastSelectedMoneyFilterRef.current = moneyFilter;
        safeSetItemSession("taka_budget_money_filter", moneyFilter);
      }
      lastSelectedLocationFilterRef.current = globalLocationFilter;
      setMoneyFilter('all');
      wasSearchingRef.current = true;
    } else if (wasSearchingRef.current && !isSearching) {
      const restored = lastSelectedMoneyFilterRef.current || safeGetItemSession("taka_budget_money_filter") || 'has_money';
      setMoneyFilter(restored);
      setGlobalLocationFilter(lastSelectedLocationFilterRef.current || []);
      wasSearchingRef.current = false;
    }
  }, [deferredSearchTerm]);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(AVAILABLE_COLUMNS.map(c => c.id));
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    no: 80,
    year: 80,
    store: 80,
    location: 130,
    code: 165,
    projectName: 220,
    totalBudget: 140,
    actual: 140,
    supportingFee: 140,
    variance: 140,
    type: 130,
    note: 200,
    actions: 90
  });

  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const [selectedParentProject, setSelectedParentProject] = useState<Project | null>(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [childSearchTerm, setChildSearchTerm] = useState('');
  const [parentSearchTerm, setParentSearchTerm] = useState('');

  // 1. Build hierarchy tree data
  const treeData = useBudgetTreeData({ projects, costs });

  // 2. Filter, search and sort tree roots
  const {
    sortConfig,
    visibleCount,
    setVisibleCount,
    filteredRoots,
    handleBudgetScroll,
    handleSort,
    totalGlobalBudget,
    totalGlobalActual,
    totalGlobalSupportingFee,
    totalGlobalRemaining,
    totalVarianceColor
  } = useBudgetFilterSort({
    treeData,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    moneyFilter,
    searchTerm,
    deferredSearchTerm
  });

  // 3. Export / Import CSV
  const { handleExportBudget, handleImportBudget } = useBudgetCsvOps({ projects, filteredRoots });

  const getProjectFinancials = (p: Project): ProjectFinancials => {
    const fin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0, totalForecastPaid: 0 };
    const budget = fin.totalApproved || p.budget || 0;
    const actual = fin.totalActualPaid;
    const hasForc = fin.totalForecastPaid > 0;
    const supportingFee = p.supportingFee || 0;
    const remaining = budget - (actual + fin.totalForecastPaid) + supportingFee;
    return { budget, actual, supportingFee, hasForc, remaining };
  };

  // Candidates for Parent Project Selection
  const candidateParentProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const term = parentSearchTerm.trim().toLowerCase();
    return projects.filter(p => {
      if (!term) return true;
      const searchPool = [
        p.code,
        p.name,
        p.year,
        p.store,
        p.location,
        p.type,
        p.note
      ].map(v => String(v || '').toLowerCase());
      
      return searchPool.some(val => val.includes(term));
    }).slice(0, 100);
  }, [projects, parentSearchTerm]);

  // Candidates for Child Project Selection
  const candidateChildProjects = useMemo(() => {
    if (!projects || projects.length === 0) return [];
    const parentCode = selectedParentProject ? String(selectedParentProject.code || '').trim().toUpperCase() : '';
    const parentId = selectedParentProject?.id || (selectedParentProject ? `${selectedParentProject.code}-${selectedParentProject.year}-${selectedParentProject.store}-${selectedParentProject.no}` : '');
    const term = childSearchTerm.trim().toLowerCase();

    const filtered = projects.filter(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
      const pCode = String(p.code || '').trim().toUpperCase();

      if (selectedParentProject && (pId === parentId || pCode === parentCode)) return false;
      if (selectedParentProject?.parentId && String(selectedParentProject.parentId).trim().toUpperCase() === pCode) return false;

      // Restrict candidate children to same fiscal year and store as selected parent
      if (selectedParentProject) {
        const pYear = p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : '');
        const parentYear = selectedParentProject.year ? String(selectedParentProject.year).trim() : (selectedParentProject.start ? String(selectedParentProject.start).substring(0, 4) : '');
        if (pYear && parentYear && pYear !== parentYear) return false;

        const pStore = String(p.store || '').trim().toUpperCase();
        const parentStore = String(selectedParentProject.store || '').trim().toUpperCase();
        if (pStore && parentStore && pStore !== parentStore) return false;
      }

      if (!term) return true;
      const searchPool = [
        p.code,
        p.name,
        p.year,
        p.store,
        p.location,
        p.type,
        p.note
      ].map(v => String(v || '').toLowerCase());
      
      return searchPool.some(val => val.includes(term));
    });

    if (parentCode) {
      filtered.sort((a, b) => {
        const aIsChild = a.parentId && String(a.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        const bIsChild = b.parentId && String(b.parentId).trim().toUpperCase() === parentCode ? 1 : 0;
        return bIsChild - aIsChild;
      });
    }

    return filtered.slice(0, 100);
  }, [projects, selectedParentProject, childSearchTerm]);

  const linkedChildrenCount = useMemo(() => {
    if (!selectedParentProject) return 0;
    const parentCode = String(selectedParentProject.code || '').trim().toUpperCase();
    const parentYear = selectedParentProject.year ? String(selectedParentProject.year).trim() : (selectedParentProject.start ? String(selectedParentProject.start).substring(0, 4) : '');
    const parentStore = String(selectedParentProject.store || '').trim().toUpperCase();

    return projects.filter(p => {
      if (!p.parentId || String(p.parentId).trim().toUpperCase() !== parentCode) return false;
      const cYear = p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : '');
      const cStore = String(p.store || '').trim().toUpperCase();
      if (parentYear && cYear && cYear !== parentYear) return false;
      if (parentStore && cStore && cStore !== parentStore) return false;
      return true;
    }).length;
  }, [projects, selectedParentProject]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isLinkModalOpen || selectedParentProject) {
          e.preventDefault();
          e.stopPropagation();
          setIsLinkModalOpen(false);
          setSelectedParentProject(null);
          return;
        }
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLinkModalOpen, selectedParentProject, searchTerm]);

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const loadDeviceConfig = () => {
      const saved = safeGetDeviceItemLocal('taka_budget_col_widths', currentUser.id);
      if (saved) {
        try { 
          const parsed = JSON.parse(saved);
          if (parsed.code && parsed.code < 165) {
            parsed.code = 165;
          }
          if (parsed.no && parsed.no < 60) {
            parsed.no = 80;
          }
          setColWidths(prev => ({ ...prev, ...parsed })); 
        } catch (e) {}
      }
      const savedCols = safeGetDeviceItemLocal('taka_budget_visible_cols', currentUser.id);
      if (savedCols) {
        try { 
          const parsed = JSON.parse(savedCols);
          if (Array.isArray(parsed)) {
            let cleaned = parsed.filter((id: string) => id !== 'budget' && id !== 'linkCost');
            if (!cleaned.includes('no')) {
              cleaned = ['no', ...cleaned];
            }
            setVisibleColumns(cleaned);
          }
        } catch (e) {}
      } else {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        if (isMobile) {
          setVisibleColumns(['no', 'code', 'projectName', 'totalBudget', 'actual', 'variance']);
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

  const handleResize = (col: string, newWidth: number) => {
    setColWidths(prev => {
      const next = { ...prev, [col]: newWidth };
      safeSetDeviceItemLocal('taka_budget_col_widths', JSON.stringify(next), currentUser.id);
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      safeSetDeviceItemLocal('taka_budget_visible_cols', JSON.stringify(next), currentUser.id);
      return next;
    });
  };

  const toggleExpand = (id: string) => {
    if (searchTerm.trim()) {
      setCollapsedInSearch(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setExpandedParents(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const toggleAllParents = () => {
    if (expandedParents.size === 0) {
      const allParentIds = new Set<string>();
      const collectParents = (nodes: any[]) => {
        nodes.forEach(n => {
          if (n.filteredChildren && n.filteredChildren.length > 0) {
            allParentIds.add(n.id || n.code);
            collectParents(n.filteredChildren);
          }
        });
      };
      collectParents(filteredRoots);
      setExpandedParents(allParentIds);
    } else {
      setExpandedParents(new Set());
    }
  };

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.budget) && !isArchiveYear;

  const formatCurrency = (val: number | undefined) => {
    return formatCurrencyValue(val, currency, jpyRate, usdRate);
  };

  const years = useMemo(() => {
    const projYears = projects.map(p => {
      if (p.year) return String(p.year);
      if (p.start) return String(p.start).substring(0, 4);
      return null;
    }).filter(Boolean) as string[];
    const baseYears = ['2026', '2027'];
    const unique = Array.from(new Set([...projYears, ...baseYears])).filter(Boolean).sort();
    return unique.length > 0 ? unique : ['2026', '2027'];
  }, [projects, currentUser?.role]);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const stores = allowedStores;
  const locationOptions = useLocationOptions();

  useEffect(() => {
    if (locationOptions.length > 0 && globalLocationFilter.length > 0) {
      const valid = globalLocationFilter.filter(loc => locationOptions.includes(loc));
      if (valid.length !== globalLocationFilter.length) {
        setGlobalLocationFilter(valid);
      }
    }
  }, [locationOptions, globalLocationFilter, setGlobalLocationFilter]);

  const handleOpenLinkModal = (projectToSelect?: Project) => {
    if (projectToSelect) {
      setSelectedParentProject(projectToSelect);
      setParentSearchTerm(String(projectToSelect.code || '').trim());
    } else {
      if (!selectedParentProject && filteredRoots.length > 0) {
        setSelectedParentProject(filteredRoots[0].project);
        setParentSearchTerm(String(filteredRoots[0].project.code || '').trim());
      } else if (selectedParentProject) {
        setParentSearchTerm(String(selectedParentProject.code || '').trim());
      }
    }
    setIsLinkModalOpen(true);
  };

  const handleProjectLinkClick = (p: Project) => {
    if (!p) return;
    setDetailTabFilterCode(p.code);
    setDetailTabStoreFilter(p.store || "all");
    if (p.year) {
      setGlobalYearFilter(String(p.year));
      safeSetItemSession("taka_detail_year", String(p.year));
    } else {
      setGlobalYearFilter("all");
      safeSetItemSession("taka_detail_year", "all");
    }
    if (p.store) {
      setGlobalStoreFilter(p.store);
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, String(p.store));
    } else {
      setGlobalStoreFilter("all");
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, "all");
    }
    setActiveTab("detail");
  };

  return {
    currency,
    jpyRate,
    usdRate,
    canWrite,
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    moneyFilter,
    setMoneyFilter,
    lastSelectedMoneyFilterRef,
    collapsedInSearch,
    expandedParents,
    sortConfig,
    visibleColumns,
    colWidths,
    visibleCount,
    setVisibleCount,
    years,
    stores,
    locationOptions,
    filteredRoots,
    totalGlobalBudget,
    totalGlobalActual,
    totalGlobalSupportingFee,
    totalGlobalRemaining,
    totalVarianceColor,
    candidateParentProjects,
    candidateChildProjects,
    linkedChildrenCount,
    selectedParentProject,
    setSelectedParentProject,
    isLinkModalOpen,
    setIsLinkModalOpen,
    parentSearchTerm,
    setParentSearchTerm,
    childSearchTerm,
    setChildSearchTerm,
    getProjectFinancials,
    handleResize,
    handleToggleColumn,
    toggleExpand,
    toggleAllParents,
    handleSort,
    handleBudgetScroll,
    handleOpenLinkModal,
    handleExportBudget,
    handleImportBudget,
    handleProjectLinkClick,
    formatCurrency
  };
}
