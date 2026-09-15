import React, { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  Info,
  CalendarRange,
} from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { cn, getStatus, parseDateTime, getUserAllowedStores, getEffectiveStoreFilter, formatCurrencyValue } from '../lib/utils';
import { Project, Task, Cost } from '../types';

interface ExecutiveDashboardProps {
  filteredProjects: Project[];
  globalYearFilter: string;
  effectiveStore: string;
}

export const ExecutiveDashboard = React.memo(function ExecutiveDashboard({
  filteredProjects,
  globalYearFilter,
  effectiveStore,
}: ExecutiveDashboardProps) {
  const { t } = useLanguage();
  const tasks = useAppStore((state) => state.tasks);
  const costs = useAppStore((state) => state.costs);
  const setIsCostsRequested = useAppStore((state) => state.setIsCostsRequested);
  const setIsTasksRequested = useAppStore((state) => state.setIsTasksRequested);
  const currency = useAppStore((state) => state.currency);
  const jpyRate = useAppStore((state) => state.jpyRate);
  const usdRate = useAppStore((state) => state.usdRate);

  // Lazy load costs & tasks for EVM calculation if not already requested
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

  // Tasks mapped by projectCode
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

  // Costs mapped by projectCode
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
  // BAC (Budget at Completion): Total Budget
  // AC (Actual Cost): Total Actual spent (from cost items or project.actual)
  // EV (Earned Value): Progress% * BAC
  // PV (Planned Value): Scheduled Progress% * BAC (based on today vs start-finish dates)
  // CPI = EV / AC (Cost Performance Index: >1 under budget, <1 over budget)
  // SPI = EV / PV (Schedule Performance Index: >1 ahead of schedule, <1 behind schedule)
  const evmMetrics = useMemo(() => {
    const now = new Date();
    const todayTime = now.getTime();

    let totalBAC = 0;
    let totalEV = 0;
    let totalPV = 0;
    let totalAC = 0;

    const projectEVMList: Array<{
      code: string;
      name: string;
      store: string;
      bac: number;
      ac: number;
      ev: number;
      pv: number;
      cpi: number;
      spi: number;
      costVariance: number;
      scheduleVariance: number;
      percentComplete: number;
      status: string;
    }> = [];

    relevantProjects.forEach((p) => {
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
      } else {
        // Fallback by project lifecycle status
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

      projectEVMList.push({
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
      });
    });

    const portfolioCPI = totalAC > 0 ? Number((totalEV / totalAC).toFixed(2)) : 1.0;
    const portfolioSPI = totalPV > 0 ? Number((totalEV / totalPV).toFixed(2)) : 1.0;
    const portfolioCostVariance = totalEV - totalAC;
    const portfolioScheduleVariance = totalEV - totalPV;

    // Estimate at Completion (EAC) = BAC / CPI
    const eac = portfolioCPI > 0 ? totalBAC / portfolioCPI : totalAC;
    // Variance at Completion (VAC) = BAC - EAC
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

  // Cashflow Forecast (Actual Disbursed vs Forecast by Month & Store)
  const cashflowData = useMemo(() => {
    // 12 months data
    const monthlyMap = new Map<
      number,
      {
        month: number;
        label: string;
        actualHCM: number;
        forecastHCM: number;
        actualHN: number;
        forecastHN: number;
        totalActual: number;
        totalForecast: number;
        totalDisbursement: number;
      }
    >();

    for (let m = 1; m <= 12; m++) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
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

    // Helper to bucket dates into monthly installments
    const addDisbursement = (dateStr: string | undefined, amount: number, isForecast: boolean, store: string) => {
      if (!dateStr || !amount) return;
      const parsed = parseDateTime(dateStr);
      if (!parsed) return;

      const costYear = parsed.getFullYear().toString();
      // If filtering by specific year, ensure match
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

    // Iterate through costs
    costs.forEach((c) => {
      if (c.isDeleted) return;
      // Project matching
      const store = c.projectStore || '';
      if (effectiveStore !== 'all' && store !== effectiveStore) return;

      // 1st Paid
      if (c.firstPaid && c.firstPaid > 0) {
        const isForc = c.firstStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.firstPaidAt || c.updatedAt, c.firstPaid, isForc, store);
      }
      // 2nd Paid
      if (c.secondPaid && c.secondPaid > 0) {
        const isForc = c.secondStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.secondPaidAt || c.updatedAt, c.secondPaid, isForc, store);
      }
      // 3rd Paid
      if (c.thirdPaid && c.thirdPaid > 0) {
        const isForc = c.thirdStatus === 'Forecast' || c.costType === 'forc';
        addDisbursement(c.thirdPaidAt || c.updatedAt, c.thirdPaid, isForc, store);
      }

      // If no installments, but cost has actual/amount
      if (!c.firstPaid && !c.secondPaid && !c.thirdPaid && c.actual > 0) {
        const isForc = c.costType === 'forc';
        addDisbursement(c.updatedAt, c.actual, isForc, store);
      }
    });

    // If costs don't have enough entries, fallback/enrich with project opening dates
    if (costs.length === 0) {
      filteredProjects.forEach((p) => {
        const targetDate = p.computedOpening || p.computedTakCompl || p.start;
        const amount = p.actual || p.budget || 0;
        addDisbursement(targetDate, amount, false, p.store || 'HCM');
      });
    }

    const monthlyList = Array.from(monthlyMap.values());

    // Quarterly rollup
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

  const formatAmount = (val: number) => {
    return formatCurrencyValue(val, currency, jpyRate, usdRate);
  };

  const formatMillions = (val: number) => {
    return `${(val / 1000000).toFixed(1)}M`;
  };

  const getCPILabel = (cpi: number) => {
    if (cpi >= 1.05) return { label: 'Under Budget', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' };
    if (cpi >= 0.95) return { label: 'On Budget', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' };
    return { label: 'Over Budget', color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800' };
  };

  const getSPILabel = (spi: number) => {
    if (spi >= 1.05) return { label: 'Ahead of Schedule', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' };
    if (spi >= 0.95) return { label: 'On Schedule', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800' };
    return { label: 'Behind Schedule', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' };
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Executive Summary Cards (EVM Core Indicators) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPI Card */}
        <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              CPI (Cost Performance)
            </span>
            <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', getCPILabel(evmMetrics.portfolioCPI).bg, getCPILabel(evmMetrics.portfolioCPI).color)}>
              {getCPILabel(evmMetrics.portfolioCPI).label}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {evmMetrics.portfolioCPI}
            </span>
            <span className={cn('text-xs font-semibold flex items-center gap-0.5', evmMetrics.portfolioCPI >= 1 ? 'text-emerald-600' : 'text-rose-600')}>
              {evmMetrics.portfolioCPI >= 1 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {evmMetrics.portfolioCPI >= 1 ? `+${Math.round((evmMetrics.portfolioCPI - 1) * 100)}% eff.` : `${Math.round((evmMetrics.portfolioCPI - 1) * 100)}%`}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            EV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalEV)}</strong> / AC: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalAC)}</strong>
          </p>
        </div>

        {/* SPI Card */}
        <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-blue-500" />
              SPI (Schedule Performance)
            </span>
            <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', getSPILabel(evmMetrics.portfolioSPI).bg, getSPILabel(evmMetrics.portfolioSPI).color)}>
              {getSPILabel(evmMetrics.portfolioSPI).label}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              {evmMetrics.portfolioSPI}
            </span>
            <span className={cn('text-xs font-semibold flex items-center gap-0.5', evmMetrics.portfolioSPI >= 1 ? 'text-emerald-600' : 'text-amber-600')}>
              {evmMetrics.portfolioSPI >= 1 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {evmMetrics.portfolioSPI >= 1 ? `+${Math.round((evmMetrics.portfolioSPI - 1) * 100)}% pace` : `${Math.round((evmMetrics.portfolioSPI - 1) * 100)}%`}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            EV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalEV)}</strong> / PV: <strong className="text-slate-700 dark:text-slate-200">{formatMillions(evmMetrics.totalPV)}</strong>
          </p>
        </div>

        {/* EAC & Forecast at Completion */}
        <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-purple-500" />
              EAC (Forecast At Completion)
            </span>
            <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border', evmMetrics.vac >= 0 ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200')}>
              VAC: {formatMillions(evmMetrics.vac)}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {formatMillions(evmMetrics.eac)}
            </span>
            <span className="text-xs text-slate-500">vs BAC {formatMillions(evmMetrics.totalBAC)}</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            {evmMetrics.vac >= 0 ? 'Dự kiến tiết kiệm ngân sách' : 'Cảnh báo nguy cơ bội chi ngân sách'}
          </p>
        </div>

        {/* Total Annual Disbursed vs Forecast */}
        <div className="bg-white dark:bg-[#1e1e20] p-5 rounded-2xl border border-slate-200/80 dark:border-[#333336] shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <CalendarRange className="w-4 h-4 text-amber-500" />
              Dòng Tiền Giải Ngân Cả Năm
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#333336] text-slate-700 dark:text-slate-300">
              {globalYearFilter === 'all' ? 'All Years' : globalYearFilter}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {formatMillions(cashflowData.totalYearDisbursement)}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs mt-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              Đã chi: {formatMillions(cashflowData.totalYearActual)}
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              Dự chi: {formatMillions(cashflowData.totalYearForecast)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Cashflow Forecast Chart Section */}
      <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-sm border border-slate-200/80 dark:border-[#333336] p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Cashflow Forecast (Dự Báo & Dòng Tiền Thực Tế Giải Ngân)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Phân tích kế hoạch dòng tiền Thực chi (Actual Paid) và Dự kiến giải ngân (Forecast Paid) theo Cửa hàng & Phân kỳ
            </p>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            <div className="bg-slate-100 dark:bg-[#28282a] p-1 rounded-xl flex items-center text-xs font-semibold">
              <button
                type="button"
                onClick={() => setForecastViewMode('monthly')}
                className={cn(
                  'px-3 py-1.5 rounded-lg transition-all',
                  forecastViewMode === 'monthly'
                    ? 'bg-white dark:bg-[#38383a] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                12 Tháng
              </button>
              <button
                type="button"
                onClick={() => setForecastViewMode('quarterly')}
                className={cn(
                  'px-3 py-1.5 rounded-lg transition-all',
                  forecastViewMode === 'quarterly'
                    ? 'bg-white dark:bg-[#38383a] text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                )}
              >
                4 Quý (Q1 - Q4)
              </button>
            </div>
          </div>
        </div>

        {/* Recharts Component */}
        <div className="w-full h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            {forecastViewMode === 'monthly' ? (
              <ComposedChart data={cashflowData.monthlyList} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={12} tick={{ fill: '#64748b' }} />
                <YAxis fontSize={12} tick={{ fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${formatMillions(value)} (${new Intl.NumberFormat('en-US').format(value)})`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    backgroundColor: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                  }}
                />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar dataKey="actualHCM" name="HCM Thực Chi" stackId="a" fill="#0284c7" radius={[0, 0, 0, 0]} />
                <Bar dataKey="forecastHCM" name="HCM Dự Chi" stackId="a" fill="#7dd3fc" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actualHN" name="HN Thực Chi" stackId="b" fill="#059669" radius={[0, 0, 0, 0]} />
                <Bar dataKey="forecastHN" name="HN Dự Chi" stackId="b" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="totalDisbursement" name="Tổng Dòng Tiền" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} />
              </ComposedChart>
            ) : (
              <BarChart data={cashflowData.quarterlyList} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="label" fontSize={12} tick={{ fill: '#64748b' }} />
                <YAxis fontSize={12} tick={{ fill: '#64748b' }} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${formatMillions(value)} (${new Intl.NumberFormat('en-US').format(value)})`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: '12px',
                    backgroundColor: '#1e293b',
                    color: '#fff',
                    border: 'none',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                  }}
                />
                <Legend verticalAlign="top" align="right" height={36} />
                <Bar dataKey="totalActual" name="Thực Chi (Actual)" fill="#2563eb" radius={[6, 6, 0, 0]} />
                <Bar dataKey="totalForecast" name="Dự Chi (Forecast)" fill="#93c5fd" radius={[6, 6, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. EVM Performance Analysis (Top Projects Benchmark) */}
      <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-sm border border-slate-200/80 dark:border-[#333336] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
              Chỉ Số EVM Chi Tiết Từng Dự Án (Earned Value Breakdown)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              So sánh Chỉ số Hiệu quả Chi phí (CPI) & Tiến độ (SPI) theo dõi sát sao nguy cơ trễ hạn / vượt ngân sách
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Chi nhánh:</span>
            <select
              value={selectedEVMStore}
              onChange={(e) => setSelectedEVMStore(e.target.value)}
              className="text-xs bg-slate-50 dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg px-2.5 py-1.5 font-semibold outline-none"
            >
              <option value="all">Tất cả chi nhánh</option>
              <option value="HCM">HCM</option>
              <option value="HN">HN</option>
            </select>
          </div>
        </div>

        {/* Project EVM Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#333336] bg-slate-50 dark:bg-[#28282a] text-slate-500 dark:text-slate-400 uppercase font-bold text-[10px] tracking-wider">
                <th className="py-3 px-3">Mã DA</th>
                <th className="py-3 px-3">Tên Dự Án</th>
                <th className="py-3 px-2">Store</th>
                <th className="py-3 px-3 text-right">Ngân Sách (BAC)</th>
                <th className="py-3 px-3 text-right">Thực Chi (AC)</th>
                <th className="py-3 px-3 text-right">Giá Trị Đạt Được (EV)</th>
                <th className="py-3 px-2 text-center">Tiến Độ</th>
                <th className="py-3 px-2 text-center">CPI (Chi Phí)</th>
                <th className="py-3 px-2 text-center">SPI (Tiến Độ)</th>
                <th className="py-3 px-3 text-center">Đánh Giá Ban Điều Hành</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#2d2d30]">
              {evmMetrics.projectEVMList.slice(0, 15).map((item) => {
                const cpiStatus = getCPILabel(item.cpi);
                const spiStatus = getSPILabel(item.spi);

                return (
                  <tr key={item.code} className="hover:bg-slate-50/80 dark:hover:bg-[#28282a]/50 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {item.code}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-800 dark:text-slate-200 max-w-[220px] truncate" title={item.name}>
                      {item.name}
                    </td>
                    <td className="py-3 px-2">
                      <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold', item.store === 'HCM' ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300' : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300')}>
                        {item.store}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                      {formatMillions(item.bac)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                      {formatMillions(item.ac)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatMillions(item.ev)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <div className="w-12 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full',
                              item.percentComplete >= 100 ? 'bg-emerald-500' : item.percentComplete >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                            )}
                            style={{ width: `${item.percentComplete}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold text-slate-600 dark:text-slate-400">
                          {item.percentComplete}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border', cpiStatus.bg, cpiStatus.color)}>
                        {item.cpi}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      <span className={cn('px-2 py-0.5 rounded-full font-mono font-bold text-[11px] border', spiStatus.bg, spiStatus.color)}>
                        {item.spi}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {item.cpi >= 1 && item.spi >= 1 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Xuất sắc
                        </span>
                      ) : item.cpi < 0.95 && item.spi < 0.95 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Nguy cơ cao
                        </span>
                      ) : item.cpi < 0.95 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Bội chi phí
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                          <Clock className="w-3.5 h-3.5" /> Cần đẩy tiến độ
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
