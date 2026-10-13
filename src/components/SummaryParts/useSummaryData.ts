import React, { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { getStatus, parseDateTime, getUserAllowedStores, getEffectiveStoreFilter } from '../../lib/utils';
import { useLocationOptions } from '../../hooks/useLocationOptions';
import { StatusCountItem } from './summaryTypes';

export function useSummaryData() {
  const { enrichedProjects: projects } = useEnrichedData();
  const currentUser = useAppStore((state) => state.currentUser)!;

  const [activeSubTab, setActiveSubTab] = useState<'project_summary' | 'exec_dashboard'>('project_summary');

  const years = useMemo(() => {
    const yearsSet = new Set<string>();
    projects.forEach((p) => {
      const year = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      if (year) yearsSet.add(year);
    });
    yearsSet.add('2026');
    yearsSet.add('2027');
    const arr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return arr.length > 0 ? arr : ['2027', '2026'];
  }, [projects, currentUser?.role]);

  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore((state) => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore((state) => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore((state) => state.setGlobalLocationFilter);

  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const stores = allowedStores;

  const locationOptions = useLocationOptions();

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
      const matchesStore = effectiveStore === 'all' || p.store === effectiveStore;
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));
      return matchesYear && matchesStore && matchesLocation;
    });
  }, [projects, globalYearFilter, effectiveStore, globalLocationFilter]);

  const projectsInPeriod = useMemo(() => {
    return filteredProjects.filter((p) => {
      const dateStr = p.computedTakStart || p.start;
      if (!dateStr) return false;
      const date = parseDateTime(dateStr);
      if (!date) return false;
      const month = date.getMonth() + 1; // 1-indexed

      const minM = Math.min(startMonth, endMonth);
      const maxM = Math.max(startMonth, endMonth);

      return month >= minM && month <= maxM;
    });
  }, [filteredProjects, startMonth, endMonth]);

  const yearChartData: StatusCountItem[] = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjects.forEach((p) => {
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredProjects]);

  const monthChartData: StatusCountItem[] = useMemo(() => {
    const counts: Record<string, number> = {};
    projectsInPeriod.forEach((p) => {
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [projectsInPeriod]);

  const totalBudget = useMemo(() => filteredProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0), [filteredProjects]);
  const totalActual = useMemo(() => filteredProjects.reduce((acc, curr) => acc + (curr.actual || 0), 0), [filteredProjects]);
  const periodBudget = useMemo(() => projectsInPeriod.reduce((acc, curr) => acc + (curr.budget || 0), 0), [projectsInPeriod]);
  const periodActual = useMemo(() => projectsInPeriod.reduce((acc, curr) => acc + (curr.actual || 0), 0), [projectsInPeriod]);

  return {
    activeSubTab,
    setActiveSubTab,
    years,
    stores,
    locationOptions,
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    startMonth,
    setStartMonth,
    endMonth,
    setEndMonth,
    filteredProjects,
    projectsInPeriod,
    yearChartData,
    monthChartData,
    totalBudget,
    totalActual,
    periodBudget,
    periodActual,
  };
}
