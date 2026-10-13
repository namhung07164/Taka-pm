import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Project, Cost, AppUser, AppRole } from '../../types';
import {
  getUserAllowedStores,
  getEffectiveStoreFilter,
  matchesAdvancedSearch,
  formatCurrencyValue,
} from '../../lib/utils';
import { useLocationOptions } from '../../hooks/useLocationOptions';
import { safeSetItemLocal, safeSetItemSession } from '../../lib/storage';
import { useAppStore } from '../../store/useAppStore';
import { useCostDateFilter } from './useCostDateFilter';
import { useCostColumns } from './useCostColumns';
import { useCostTotals } from './useCostTotals';
import { useCostSearchFilter } from './useCostSearchFilter';

interface UseCostDataParams {
  projects: Project[];
  costs: Cost[];
  currentUser: AppUser;
  initialSearchTerm?: string;
}

export function useCostData({
  projects,
  costs,
  currentUser,
  initialSearchTerm = '',
}: UseCostDataParams) {
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);
  const currency = useAppStore((state) => state.currency);
  const jpyRate = useAppStore((state) => state.jpyRate);
  const usdRate = useAppStore((state) => state.usdRate);

  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore((state) => state.setGlobalStoreFilter);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const globalLocationFilter = useAppStore((state) => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore((state) => state.setGlobalLocationFilter);
  const setDetailTabFilterCode = useAppStore((state) => state.setDetailTabFilterCode);
  const setDetailTabStoreFilter = useAppStore((state) => state.setDetailTabStoreFilter);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const costTabSearchTerm = useAppStore((state) => state.costTabSearchTerm);

  const expandedCodes = useAppStore((state) => state.expandedProjectIds);
  const toggleProjectExpansion = useAppStore((state) => state.toggleProjectExpansion);
  const setExpandedCodes = useAppStore((state) => state.setExpandedProjectIds);

  const handleProjectLinkClick = (p: Project) => {
    if (!p) return;
    setDetailTabFilterCode(p.code);
    setDetailTabStoreFilter(p.store || 'all');
    if (p.year) {
      setGlobalYearFilter(String(p.year));
      safeSetItemSession('taka_detail_year', String(p.year));
    } else {
      setGlobalYearFilter('all');
      safeSetItemSession('taka_detail_year', 'all');
    }
    if (p.store) {
      setGlobalStoreFilter(p.store);
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, String(p.store));
    } else {
      setGlobalStoreFilter('all');
      safeSetItemLocal(`taka_store_filter_${currentUser.id}`, 'all');
    }
    setActiveTab('detail');
  };

  // O(1) Pre-indexed Map for Costs by Project Code
  const costsMapByCode = useMemo(() => {
    const map = new Map<string, Cost[]>();
    for (let i = 0; i < costs.length; i++) {
      const c = costs[i];
      if (c.isDeleted) continue;
      const cCode = String(c.projectCode || (c as any).code || '').trim().toLowerCase();
      if (!cCode) continue;
      let list = map.get(cCode);
      if (!list) {
        list = [];
        map.set(cCode, list);
      }
      list.push(c);
    }
    return map;
  }, [costs]);

  // Helper to get matching costs for a project in O(1) + O(k) candidate filter
  const getGroupCostsForProject = useCallback(
    (p: Project) => {
      const pCode = String(p.code || '').trim().toLowerCase();
      const candidateCosts = costsMapByCode.get(pCode) || [];
      const pYr = String(p.year || (p.start ? String(p.start).substring(0, 4) : '')).trim();
      const pStore = String(p.store || '').trim().toLowerCase();

      return candidateCosts.filter((c) => {
        const costYear = String(c.projectYear || (c as any).year || '').trim();
        const matchesYear = !costYear || !pYr || costYear === pYr;
        if (!matchesYear) return false;

        const costStore = String(c.projectStore || (c as any).store || '').trim().toLowerCase();
        const matchesStore = !costStore || !pStore || costStore === pStore;
        if (!matchesStore) return false;

        return true;
      });
    },
    [costsMapByCode]
  );

  // Sub-hook: Search term & filter synchronization
  const {
    searchTerm,
    setSearchTerm,
    deferredSearchTerm,
    hasActForcFilter,
    setHasActForcFilter,
  } = useCostSearchFilter({
    projects,
    costs,
    currentUser,
    initialSearchTerm,
    costTabSearchTerm,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    setGlobalLocationFilter,
    getGroupCostsForProject,
  });

  // Sub-hook: Columns visibility & resizable widths
  const {
    visibleColumns,
    colWidths,
    handleResize,
    handleToggleColumn,
  } = useCostColumns({ userId: currentUser.id });

  // Sub-hook: Paid Date filter
  const {
    isPaidDateFilterOpen,
    setIsPaidDateFilterOpen,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    setPaidStageFilter,
    tempDateStart,
    tempDateEnd,
    handleTempStartChange,
    handleTempEndChange,
    commitDateFilter,
    handleClearPaidDateFilter,
    getCostPaidMatches,
  } = useCostDateFilter();

  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear =
    globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite =
    (isAdmin || !!permissionMatrix[role]?.Write?.costDetail) && !isArchiveYear;

  const years = useMemo(() => {
    const projYears = projects
      .map((p) => {
        if (p.year) return String(p.year).trim();
        if (p.start) return String(p.start).substring(0, 4);
        return null;
      })
      .filter(Boolean) as string[];

    const baseYears = ['2026', '2027'];
    const unique = Array.from(new Set([...projYears, ...baseYears]))
      .filter(Boolean)
      .sort();
    return unique.length > 0 ? unique : ['2026', '2027'];
  }, [projects]);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const stores = allowedStores;
  const locationOptions = useLocationOptions();

  const toggleGroup = (id: string | number) => {
    toggleProjectExpansion(String(id));
  };

  const formatCurrency = (val: number | undefined) => {
    return formatCurrencyValue(val, currency, jpyRate, usdRate);
  };

  const filteredProjectsForDisplay = useMemo(() => {
    return projects.filter((p) => {
      const pYear = p.year
        ? String(p.year).trim()
        : p.start
        ? String(p.start).substring(0, 4)
        : null;
      if (
        globalYearFilter !== 'all' &&
        (pYear === null || pYear !== String(globalYearFilter).trim())
      )
        return false;
      if (
        effectiveStore !== 'all' &&
        (!p.store ||
          String(p.store).toUpperCase().trim() !== effectiveStore.toUpperCase().trim())
      )
        return false;
      if (
        globalLocationFilter.length > 0 &&
        (!p.location || !globalLocationFilter.includes(p.location))
      )
        return false;

      const groupCosts = getGroupCostsForProject(p);

      if (paidDateStart || paidDateEnd) {
        const hasMatchingPaidCost = groupCosts.some(
          (c) => getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches
        );
        if (!hasMatchingPaidCost) return false;
      }

      const matchingGroupCosts =
        paidDateStart || paidDateEnd
          ? groupCosts.filter(
              (c) =>
                getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches
            )
          : groupCosts;

      if (deferredSearchTerm) {
        const isMatch = matchesAdvancedSearch(
          deferredSearchTerm,
          [
            p.store,
            p.location,
            p.year,
            p.code,
            p.linkCodes,
            p.name,
            p.detail,
            (p as any).description,
            p.note,
          ],
          [],
          (term) => {
            return matchingGroupCosts.some((c) => {
              const cBalance =
                (c.actual || 0) -
                (c.firstPaid || 0) -
                (c.secondPaid || 0) -
                (c.thirdPaid || 0);
              const costFields = [
                c.description,
                c.vendor,
                c.actual,
                c.firstPaid,
                c.secondPaid,
                c.thirdPaid,
                c.supportingFee,
                cBalance,
              ];
              return costFields.some((val) =>
                String(val || '').toLowerCase().includes(term)
              );
            });
          }
        );
        if (!isMatch) return false;
      }

      const totalAct =
        matchingGroupCosts.length > 0
          ? matchingGroupCosts.reduce((sum, c) => sum + (c.actual || 0), 0)
          : p.financial?.totalActualPaid || p.actual || 0;
      if (
        hasActForcFilter === 'has_value' &&
        totalAct === 0 &&
        !paidDateStart &&
        !paidDateEnd
      )
        return false;

      return true;
    });
  }, [
    projects,
    costs,
    globalYearFilter,
    effectiveStore,
    globalLocationFilter,
    deferredSearchTerm,
    hasActForcFilter,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    getGroupCostsForProject,
    getCostPaidMatches,
  ]);

  // Sub-hook: Aggregated Financial Totals
  const {
    filteredCostsForTotals,
    totalActAll,
    totalFirstPaidAll,
    totalSecondPaidAll,
    totalThirdPaidAll,
    totalBalanceAll,
    totalSupAll,
    totalRemainingAll,
  } = useCostTotals({
    filteredProjectsForDisplay,
    projects,
    costs,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    getGroupCostsForProject,
    getCostPaidMatches,
  });

  const sortedProjects = projects;
  const [visibleCount, setVisibleCount] = useState(30);

  const handleCostScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      const st = target.scrollTop;
      const sh = target.scrollHeight;
      const ch = target.clientHeight;

      if (sh - (st + ch) < 350) {
        if (visibleCount < filteredProjectsForDisplay.length) {
          setVisibleCount((prev) => Math.min(prev + 30, filteredProjectsForDisplay.length));
        }
      }
    },
    [visibleCount, filteredProjectsForDisplay.length]
  );

  useEffect(() => {
    if (paidDateStart || paidDateEnd) {
      setExpandedCodes(
        filteredProjectsForDisplay.map((p) => `${p.code}-${p.year}-${p.store}-${p.no}`)
      );
    }
  }, [paidDateStart, paidDateEnd, paidStageFilter, filteredProjectsForDisplay, setExpandedCodes]);

  const toggleAll = () => {
    if (expandedCodes.length === 0) {
      setExpandedCodes(
        filteredProjectsForDisplay.map((p) => `${p.code}-${p.year}-${p.store}-${p.no}`)
      );
    } else {
      setExpandedCodes([]);
    }
  };

  return {
    currency,
    jpyRate,
    usdRate,
    canWrite,
    isAdmin,
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    searchTerm,
    setSearchTerm,
    hasActForcFilter,
    setHasActForcFilter,
    years,
    stores,
    locationOptions,
    visibleColumns,
    colWidths,
    handleResize,
    handleToggleColumn,
    expandedCodes,
    setExpandedCodes,
    toggleGroup,
    toggleAll,
    toggleProjectExpansion,
    handleProjectLinkClick,
    formatCurrency,
    filteredProjectsForDisplay,
    filteredCostsForTotals,
    totalActAll,
    totalFirstPaidAll,
    totalSecondPaidAll,
    totalThirdPaidAll,
    totalBalanceAll,
    totalSupAll,
    totalRemainingAll,
    sortedProjects,
    visibleCount,
    setVisibleCount,
    handleCostScroll,
    getGroupCostsForProject,
    getCostPaidMatches,
    isPaidDateFilterOpen,
    setIsPaidDateFilterOpen,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    setPaidStageFilter,
    tempDateStart,
    tempDateEnd,
    handleTempStartChange,
    handleTempEndChange,
    commitDateFilter,
    handleClearPaidDateFilter,
  };
}
