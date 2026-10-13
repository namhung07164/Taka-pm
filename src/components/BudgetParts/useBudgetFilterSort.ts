import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { matchesAdvancedSearch } from '../../lib/utils';
import { BudgetTreeNode, BudgetSortConfig } from './budgetTypes';

interface UseBudgetFilterSortParams {
  treeData: BudgetTreeNode[];
  globalYearFilter: string;
  effectiveStore: string;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  moneyFilter: string;
  searchTerm: string;
  deferredSearchTerm: string;
}

export function useBudgetFilterSort({
  treeData,
  globalYearFilter,
  effectiveStore,
  globalLocationFilter,
  setGlobalLocationFilter,
  moneyFilter,
  searchTerm,
  deferredSearchTerm
}: UseBudgetFilterSortParams) {
  const [sortConfig, setSortConfig] = useState<BudgetSortConfig | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);

  const isChildMatchSearch = (child: any, term: string): boolean => {
    if (!term) return false;
    const cSearchFields = [
      child.code,
      child.name,
      child.store,
      child.location,
      child.type,
      child.note,
      child.year,
      child.budget,
      child.totalActual,
      child.remaining
    ];
    return matchesAdvancedSearch(term, cSearchFields);
  };

  const isParentMatchSearch = (node: any, term: string): boolean => {
    if (!term) return false;
    const searchFields = [
      node.code,
      node.name,
      node.store,
      node.location,
      node.type,
      node.note,
      node.year,
      node.totalBudget,
      node.totalActual,
      node.remaining
    ];
    return matchesAdvancedSearch(term, searchFields);
  };

  // Auto-jump to matched project location(s) when searching (Debounced)
  useEffect(() => {
    const term = searchTerm.trim();
    if (!term) return;
    if (!treeData || treeData.length === 0) return;

    const timer = setTimeout(() => {
      const matchedLocationsList: string[] = [];

      treeData.forEach((node: any) => {
        const pYear = node.year ? String(node.year) : (node.start ? String(node.start).substring(0, 4) : null);
        if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return;
        if (effectiveStore !== 'all' && node.store !== effectiveStore) return;

        const parentMatch = isParentMatchSearch(node, term);
        if (parentMatch && node.location) {
          matchedLocationsList.push(node.location);
        }

        if (node.children && node.children.length > 0) {
          node.children.forEach((child: any) => {
            const cYear = child.year ? String(child.year) : null;
            if (globalYearFilter !== 'all' && cYear && cYear !== globalYearFilter) return;
            if (effectiveStore !== 'all' && child.store && child.store !== effectiveStore) return;

            if (isChildMatchSearch(child, term) || parentMatch) {
              if (child.location) matchedLocationsList.push(child.location);
              else if (node.location) matchedLocationsList.push(node.location);
            }
          });
        }
      });

      const matchedLocations = Array.from(
        new Set(matchedLocationsList.filter((loc): loc is string => !!loc && loc.trim() !== ''))
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
  }, [searchTerm, treeData, globalYearFilter, effectiveStore, globalLocationFilter, setGlobalLocationFilter]);

  const filterNode = (node: any): boolean => {
    const pYear = node.year ? String(node.year).trim() : (node.start ? String(node.start).substring(0, 4) : null);
    const matchesYear = globalYearFilter === 'all' || (pYear !== null && pYear === String(globalYearFilter).trim());
    const matchesStore = effectiveStore === 'all' || (Boolean(node.store) && String(node.store).toUpperCase().trim() === effectiveStore.toUpperCase().trim());
    
    // Strict Scope Guard: A parent project that does not belong to the selected Year or Store scope MUST NOT be displayed
    if (!matchesYear || !matchesStore) {
      return false;
    }

    const matchesLocation = globalLocationFilter.length === 0 || (node.location && globalLocationFilter.includes(node.location));
    
    const hasBudget = (node.totalBudget || 0) !== 0;
    const hasActForc = (node.totalActual || 0) !== 0;
    let matchesMoney = true;
    if (moneyFilter === 'has_money') matchesMoney = hasBudget || hasActForc;
    else if (moneyFilter === 'has_budget') matchesMoney = hasBudget;
    else if (moneyFilter === 'has_act_forc') matchesMoney = hasActForc;
    
    const baseParentMatch = matchesLocation && matchesMoney;
    const parentMatchesSearch = !deferredSearchTerm || isParentMatchSearch(node, deferredSearchTerm);

    if (node.children && node.children.length > 0) {
      const validChildren = node.children.filter((child: any) => {
        const cYear = child.year ? String(child.year).trim() : (child.start ? String(child.start).substring(0, 4) : pYear);
        const cMatchesYear = globalYearFilter === 'all' || !cYear || cYear === String(globalYearFilter).trim();
        const cStore = child.store ? String(child.store).toUpperCase().trim() : (node.store ? String(node.store).toUpperCase().trim() : '');
        const cMatchesStore = effectiveStore === 'all' || !cStore || cStore === effectiveStore.toUpperCase().trim();
        const cMatchesLocation = globalLocationFilter.length === 0 || (!child.location) || globalLocationFilter.includes(child.location);
        
        const cHasBudget = (child.budget || 0) !== 0;
        const cHasActForc = (child.totalActual || 0) !== 0;
        let cMatchesMoney = true;
        if (moneyFilter === 'has_money') cMatchesMoney = cHasBudget || cHasActForc || matchesMoney;
        else if (moneyFilter === 'has_budget') cMatchesMoney = cHasBudget || hasBudget;
        else if (moneyFilter === 'has_act_forc') cMatchesMoney = cHasActForc || hasActForc;

        return cMatchesYear && cMatchesStore && cMatchesLocation && cMatchesMoney;
      });

      const hasMultiChildren = node.children.length >= 2;

      if (!deferredSearchTerm.trim()) {
        node.filteredChildren = validChildren.map((c: any) => ({ ...c, isSearchMatch: false }));
        return baseParentMatch || validChildren.length > 0;
      }

      const matchingChildIds = new Set<string>();
      validChildren.forEach((child: any) => {
        if (isChildMatchSearch(child, deferredSearchTerm)) {
          matchingChildIds.add(child.id);
        }
      });

      const anyChildMatchesSearch = matchingChildIds.size > 0;

      if (hasMultiChildren) {
        if (anyChildMatchesSearch || (baseParentMatch && parentMatchesSearch)) {
          const shouldFilterChildren = !parentMatchesSearch && anyChildMatchesSearch;
          node.filteredChildren = validChildren
            .filter((child: any) => shouldFilterChildren ? matchingChildIds.has(child.id) : true)
            .map((child: any) => ({
              ...child,
              isSearchMatch: matchingChildIds.has(child.id)
            }));
          return true;
        }
        node.filteredChildren = [];
        return false;
      } else {
        if (anyChildMatchesSearch) {
          node.filteredChildren = validChildren
            .filter((c: any) => matchingChildIds.has(c.id))
            .map((c: any) => ({ ...c, isSearchMatch: true }));
          return true;
        } else if (baseParentMatch && parentMatchesSearch) {
          node.filteredChildren = validChildren.map((c: any) => ({ ...c, isSearchMatch: false }));
          return true;
        }
        node.filteredChildren = [];
        return false;
      }
    } else {
      node.filteredChildren = [];
      return baseParentMatch && parentMatchesSearch;
    }
  };

  const filteredRoots = useMemo(() => {
    let roots = treeData.filter(filterNode);
    if (sortConfig) {
      const sortFn = (a: any, b: any) => {
        let valA = 0, valB = 0;
        if (sortConfig.key === 'totalBudget') { valA = a.totalBudget || 0; valB = b.totalBudget || 0; }
        else if (sortConfig.key === 'actual') { valA = a.totalActual || 0; valB = b.totalActual || 0; }
        else if (sortConfig.key === 'variance') { valA = a.remaining || 0; valB = b.remaining || 0; }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      };
      roots = [...roots].sort(sortFn);
    }
    return roots;
  }, [treeData, globalYearFilter, effectiveStore, globalLocationFilter, moneyFilter, deferredSearchTerm, sortConfig]);

  const handleBudgetScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    const sh = target.scrollHeight;
    const ch = target.clientHeight;
    if (sh - (st + ch) < 350) {
      if (visibleCount < filteredRoots.length) {
        setVisibleCount(prev => Math.min(prev + 30, filteredRoots.length));
      }
    }
  }, [visibleCount, filteredRoots.length]);

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const totalGlobalBudget = filteredRoots.reduce((sum, p) => sum + (p.totalBudget || 0), 0);
  const totalGlobalActual = filteredRoots.reduce((sum, p) => sum + (p.totalActual || 0), 0);
  const totalGlobalSupportingFee = filteredRoots.reduce((sum, p) => sum + (p.totalSupportingFee || 0), 0);
  const totalGlobalRemaining = totalGlobalBudget - totalGlobalActual + totalGlobalSupportingFee;
  const totalVarianceColor = totalGlobalRemaining < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400';

  return {
    sortConfig,
    setSortConfig,
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
  };
}
