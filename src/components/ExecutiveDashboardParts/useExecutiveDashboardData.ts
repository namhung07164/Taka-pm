import React, { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { Project, Task, Cost } from '../../types';
import { getStatus, parseDateTime } from '../../lib/utils';
import { EVMMetrics, CashflowData } from './executiveDashboardTypes';

interface UseExecutiveDashboardDataProps {
  filteredProjects: Project[];
  globalYearFilter: string;
  effectiveStore: string;
}

export function useExecutiveDashboardData({
  filteredProjects,
  globalYearFilter,
  effectiveStore,
}: UseExecutiveDashboardDataProps) {
  const tasks = useAppStore((state) => state.tasks);
  const costs = useAppStore((state) => state.costs);
  const setIsCostsRequested = useAppStore((state) => state.setIsCostsRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);

  // Lazy load costs & tasks for EVM calculation if not already requested (Tri-Gate Rule 3)
  useEffect(() => {
    setIsCostsRequested(true);
    setIsTasksRequested(true);
  }, [setIsCostsRequested, setIsTasksRequested]);

  const [forecastViewMode, setForecastViewMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [selectedEVMStore, setSelectedEVMStore] = useState<string>('all');

  // Filter costs & tasks matching projects
  const relevantProjects = useMemo(() => {
    if (selectedEVMStore === 'all') return filteredProjects;
    return filteredProjects.filter((p) => p.store === selectedEVMStore);
  }, [filteredProjects, selectedEVMStore]);

  const projectCodeSet = useMemo(() => {
    return new Set(relevantProjects.map((p) => p.code));
  }, [relevantProjects]);

  // Tasks mapped by projectCode O(1)
  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((task) => {
      if (task.isDeleted) return;
      if (projectCodeSet.has(task.projectCode)) {
        if (!map.has(task.projectCode)) map.set(task.projectCode, []);
        map.get(task.projectCode)!.push(task);
      }
    });
    return map;
  }, [tasks, projectCodeSet]);

  // Costs mapped by projectCode O(1)
  const costsByProject = useMemo(() => {
    const map = new Map<string, Cost[]>();
    costs.forEach((cost) => {
      if (cost.isDeleted) return;
      if (projectCodeSet.has(cost.projectCode)) {
        if (!map.has(cost.projectCode)) map.set(cost.projectCode, []);
        map.get(cost.projectCode)!.push(cost);
      }
    });
    return map;
  }, [costs, projectCodeSet]);

  // EVM Calculations (Earned Value Management)
  const evmMetrics: EVMMetrics = useMemo(() => {
    const now = new Date();
    const todayTime = now.getTime();

    let totalBAC = 0;
    let totalEV = 0;
    let totalPV = 0;
    let totalAC = 0;

    const projectEVMList = relevantProjects.map((p) => {
      const bac = Number(p.budget) || 0;
      totalBAC += bac;

      // Actual Cost (AC) from CostTab items if available, else project.actual
      const pCosts = costsByProject.get(p.code) || [];
      const acFromCosts = pCosts.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
      const ac = acFromCosts > 0 ? acFromCosts : Number(p.actual) || 0;
      totalAC += ac;

      // Calculate Physical % Complete from Tasks
      const pTasks = tasksByProject.get(p.code) || [];
      let percentComplete = 0;

      if (pTasks.length > 0) {
        const completedTasks = pTasks.filter((t) => t.approval === 'Approved' || t.runningStatus === 'Completed').length;
        const inProgressTasks = pTasks.filter((t) => t.runningStatus === 'On process' || (!t.approval && t.start)).length;
        percentComplete = Math.min(100, Math.round(((completedTasks * 1.0 + inProgressTasks * 0.4) / pTasks.length) * 100));
      } else if (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0) {
        // Fallback to real-time task summaries from project doc
        const completed = p.taskSummaries.filter(ts => String(ts.runningStatus || ts.status || '').toLowerCase().includes('complete') || ts.approval === 'Approved').length;
        const inProgress = p.taskSummaries.filter(ts => String(ts.runningStatus || ts.status || '').toLowerCase().includes('process') || ts.start).length;
        percentComplete = Math.min(100, Math.round(((completed * 1.0 + inProgress * 0.4) / p.taskSummaries.length) * 100));
      } else if (p.computedActProgress !== undefined && p.computedActProgress !== null) {
        percentComplete = p.computedActProgress;
      } else {
        const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
        if (status === 'Completed' || status === 'Handover') percentComplete = 100;
        else if (status === 'On process') percentComplete = 50;
        else if (status === 'Upcoming') percentComplete = 0;
        else percentComplete = 0;
      }

      // Calculate Planned % Complete (PV) based on baseline/plan start-finish dates
      const startDateStr = p.computedTakStart || p.start;
      const finishDateStr = p.computedTakCompl || p.opening;
      let plannedPercent = 0;

      if (startDateStr && finishDateStr) {
        const sTime = parseDateTime(startDateStr)?.getTime() || 0;
        const fTime = parseDateTime(finishDateStr)?.getTime() || 0;
        if (fTime > sTime) {
          if (todayTime <= sTime) plannedPercent = 0;
          else if (todayTime >= fTime) plannedPercent = 100;
          else {
            plannedPercent = Math.min(100, Math.max(0, Math.round(((todayTime - sTime) / (fTime - sTime)) * 100)));
          }
        } else {
          plannedPercent = percentComplete;
        }
      } else {
        plannedPercent = percentComplete;
      }

      const ev = (percentComplete / 100) * (bac > 0 ? bac : ac);
      const pv = (plannedPercent / 100) * (bac > 0 ? bac : ac);

      totalEV += ev;
      totalPV += pv;

      const cpi = ac > 0 ? Number((ev / ac).toFixed(2)) : (ev > 0 ? 1.5 : 1.0);
      const spi = pv > 0 ? Number((ev / pv).toFixed(2)) : (ev > 0 ? 1.2 : 1.0);
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);

      return {
        code: p.code,
        name: p.name || p.code,
        store: p.store || 'Unknown',
        bac,
        ac,
        ev,
        pv,
        cpi,
        spi,
        costVariance: ev - ac,
        scheduleVariance: ev - pv,
        percentComplete,
        status,
      };
    });

    const portfolioCPI = totalAC > 0 ? Number((totalEV / totalAC).toFixed(2)) : 1.0;
    const portfolioSPI = totalPV > 0 ? Number((totalEV / totalPV).toFixed(2)) : 1.0;
    const portfolioCostVariance = totalEV - totalAC;
    const portfolioScheduleVariance = totalEV - totalPV;

    const eac = portfolioCPI > 0 ? totalBAC / portfolioCPI : totalAC;
    const vac = totalBAC - eac;

    return {
      totalBAC,
      totalEV,
      totalPV,
      totalAC,
      portfolioCPI,
      portfolioSPI,
      portfolioCostVariance,
      portfolioScheduleVariance,
      eac,
      vac,
      projectEVMList: projectEVMList.sort((a, b) => b.bac - a.bac),
    };
  }, [relevantProjects, tasksByProject, costsByProject]);

  // Cashflow Forecast
  const cashflowData: CashflowData = useMemo(() => {
    const monthlyMap = new Map<number, any>();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let m = 1; m <= 12; m++) {
      monthlyMap.set(m, {
        month: m,
        label: `${monthNames[m - 1]}`,
        actualHCM: 0,
        forecastHCM: 0,
        actualHN: 0,
        forecastHN: 0,
        totalActual: 0,
        totalForecast: 0,
        totalDisbursement: 0,
      });
    }

    const addDisbursement = (dateStr: string | undefined, amount: number, isForecast: boolean, store: string) => {
      if (!dateStr || !amount) return;
      const parsed = parseDateTime(dateStr);
      if (!parsed) return;

      const costYear = parsed.getFullYear().toString();
      if (globalYearFilter !== 'all' && costYear !== globalYearFilter) return;

      const m = parsed.getMonth() + 1;
      const entry = monthlyMap.get(m);
      if (!entry) return;

      const isHCM = (store || '').toUpperCase() === 'HCM';

      if (isForecast) {
        if (isHCM) entry.forecastHCM += amount;
        else entry.forecastHN += amount;
        entry.totalForecast += amount;
      } else {
        if (isHCM) entry.actualHCM += amount;
        else entry.actualHN += amount;
        entry.totalActual += amount;
      }
      entry.totalDisbursement += amount;
    };

    costs.forEach((c) => {
      if (c.isDeleted) return;
      const store = c.projectStore || '';
      if (effectiveStore !== 'all' && store !== effectiveStore) return;

      if (c.firstPaid && c.firstPaid > 0) {
        const isForc = c.firstStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.firstPaidAt || c.updatedAt, c.firstPaid, isForc, store);
      }
      if (c.secondPaid && c.secondPaid > 0) {
        const isForc = c.secondStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.secondPaidAt || c.updatedAt, c.secondPaid, isForc, store);
      }
      if (c.thirdPaid && c.thirdPaid > 0) {
        const isForc = c.thirdStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.thirdPaidAt || c.updatedAt, c.thirdPaid, isForc, store);
      }
      if (!c.firstPaid && !c.secondPaid && !c.thirdPaid && c.actual > 0) {
        const isForc = c.costType === 'forc';
        addDisbursement(c.updatedAt, c.actual, isForc, store);
      }
    });

    if (costs.length === 0) {
      filteredProjects.forEach((p) => {
        const targetDate = p.computedOpening || p.computedTakCompl || p.start;
        const amount = p.actual || p.budget || 0;
        addDisbursement(targetDate, amount, false, p.store || 'HCM');
      });
    }

    const monthlyList = Array.from(monthlyMap.values());
    const quarterlyMap = [
      { quarter: 'Q1', label: 'Q1 (Jan-Mar)', totalActual: 0, totalForecast: 0, totalHCM: 0, totalHN: 0 },
      { quarter: 'Q2', label: 'Q2 (Apr-Jun)', totalActual: 0, totalForecast: 0, totalHCM: 0, totalHN: 0 },
      { quarter: 'Q3', label: 'Q3 (Jul-Sep)', totalActual: 0, totalForecast: 0, totalHCM: 0, totalHN: 0 },
      { quarter: 'Q4', label: 'Q4 (Oct-Dec)', totalActual: 0, totalForecast: 0, totalHCM: 0, totalHN: 0 },
    ];

    monthlyList.forEach((m) => {
      const qIdx = Math.floor((m.month - 1) / 3);
      quarterlyMap[qIdx].totalActual += m.totalActual;
      quarterlyMap[qIdx].totalForecast += m.totalForecast;
      quarterlyMap[qIdx].totalHCM += m.actualHCM + m.forecastHCM;
      quarterlyMap[qIdx].totalHN += m.actualHN + m.forecastHN;
    });

    return {
      monthlyList,
      quarterlyList: quarterlyMap,
      totalYearDisbursement: monthlyList.reduce((sum, m) => sum + m.totalDisbursement, 0),
      totalYearActual: monthlyList.reduce((sum, m) => sum + m.totalActual, 0),
      totalYearForecast: monthlyList.reduce((sum, m) => sum + m.totalForecast, 0),
    };
  }, [costs, filteredProjects, globalYearFilter, effectiveStore]);

  return {
    forecastViewMode,
    setForecastViewMode,
    selectedEVMStore,
    setSelectedEVMStore,
    evmMetrics,
    cashflowData,
  };
}
