import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Project, Task, AppUser, PermissionMatrix } from '../types';
import { getStatus, parseDateTime, getDefaultStoreFilter, getUserAllowedStores, getEffectiveStoreFilter, cn } from '../lib/utils';
import { Filter, BarChart3, TrendingUp, Wallet, Printer, LayoutDashboard, LineChart } from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { MultiCheckboxSelect } from './MultiCheckboxSelect';
import { useLocationOptions } from '../hooks/useLocationOptions';
import { ExecutiveDashboard } from './ExecutiveDashboard';

interface SummaryTabProps {
}

const STATUS_COLORS: Record<string, string> = {
  'On process': '#ea580c', // Orange
  'Upcoming': '#94a3b8',   // Slate
  'Completed': '#16a34a',  // Green
  'Handover': '#3b82f6',   // Blue
  'Canceled': '#ef4444',   // Red
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export function SummaryTab({}: SummaryTabProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  
  // Sub-tabs: Project Summary vs Executive Financial Dashboard
  const [activeSubTab, setActiveSubTab] = useState<'project_summary' | 'exec_dashboard'>('project_summary');
  
  const years = useMemo(() => {
    const yearsSet = new Set<string>();
    projects.forEach(p=> {
      const year = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      if (year) yearsSet.add(year);
    });
    yearsSet.add('2026');
    yearsSet.add('2027');
    const arr = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
    return arr.length > 0 ? arr : ['2027', '2026'];
  }, [projects, currentUser?.role]);

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore(state => state.setGlobalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const setGlobalLocationFilter = useAppStore(state => state.setGlobalLocationFilter);

  const [startMonth, setStartMonth] = useState<number>(1);
  const [endMonth, setEndMonth] = useState<number>(12);

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  const stores = allowedStores;

  const locationOptions = useLocationOptions();

  const filteredProjects = useMemo(() => {
    return projects.filter(p=> {
      const pYear = p.year ? String(p.year) : (p.computedTakStart ? String(p.computedTakStart).substring(0, 4) : null);
      const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
      const matchesStore = effectiveStore === 'all' || p.store === effectiveStore;
      const matchesLocation = globalLocationFilter.length === 0 || (p.location && globalLocationFilter.includes(p.location));
      return matchesYear && matchesStore && matchesLocation;
    });
  }, [projects, globalYearFilter, effectiveStore, globalLocationFilter]);

  const projectsInPeriod = useMemo(() => {
    return filteredProjects.filter(p => {
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

  const yearChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredProjects.forEach(p => {
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredProjects]);

  const monthChartData = useMemo(() => {
    const counts: Record<string, number> = {};
    projectsInPeriod.forEach(p => {
      const status = getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code);
      counts[status] = (counts[status] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [projectsInPeriod]);

  const totalBudget = useMemo(() => filteredProjects.reduce((acc, curr) => acc + (curr.budget || 0), 0), [filteredProjects]);
  const totalActual = useMemo(() => filteredProjects.reduce((acc, curr) => acc + (curr.actual || 0), 0), [filteredProjects]);
  const periodBudget = useMemo(() => projectsInPeriod.reduce((acc, curr) => acc + (curr.budget || 0), 0), [projectsInPeriod]);
  const periodActual = useMemo(() => projectsInPeriod.reduce((acc, curr) => acc + (curr.actual || 0), 0), [projectsInPeriod]);

  const renderPieChart = (data: { name: string; value: number }[], title: string) => (
    <div className="flex flex-col items-center bg-white dark:bg-[#1e1e20] p-6 rounded-xl border border-slate-100 dark:border-[#333336] shadow-sm w-full h-[400px]">
      <h3 className="text-lg font-semibold text-slate-700 dark:text-[#c3c3c3] mb-4">{title}</h3>
      <div className="w-full h-full flex-grow">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#cbd5e1'} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" height={36}/>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col flex-grow bg-slate-50 dark:bg-[#1e1e20]/50 p-4 md:p-8 space-y-6 overflow-y-auto">
      {/* Sub-tab Navigation: Project Summary vs Executive Financial Dashboard */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-[#333336]">
        <div className="flex items-center gap-2 bg-slate-200/70 dark:bg-[#28282a] p-1.5 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('project_summary')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all',
              activeSubTab === 'project_summary'
                ? 'bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Project Summary</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('exec_dashboard')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all',
              activeSubTab === 'exec_dashboard'
                ? 'bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            <LineChart className="w-4 h-4 text-emerald-500" />
            <span>Exec Fin Dashboard</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {activeSubTab === 'project_summary'
            ? 'Báo cáo tổng hợp số lượng dự án & ngân sách theo kỳ'
            : 'Dashboard điều hành: Quản trị giá trị thu được (EVM) & Dự báo dòng tiền (Cashflow)'}
        </div>
      </div>

      {activeSubTab === 'exec_dashboard' ? (
        <ExecutiveDashboard
          filteredProjects={filteredProjects}
          globalYearFilter={globalYearFilter}
          effectiveStore={effectiveStore}
        />
      ) : (
        <>
          {/* Header & Filters Table Section */}
          <div className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-lg border border-slate-200 dark:border-[#444446] overflow-hidden transform transition-all hover:shadow-xl">
            <div className="bg-slate-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-blue-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-widest">Dashboard Control Center</h2>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-[#1e1e20]/50 border-b border-slate-200 dark:border-[#444446] text-slate-500 dark:text-[#a3a3a3] text-[10px] sm:text-xs">
                  <tr>
                    <th className="px-4 py-3 font-bold uppercase tracking-wider border-r border-slate-200 dark:border-[#444446]">{t('Year')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-wider border-r border-slate-200 dark:border-[#444446]">{t('Store')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-wider border-r border-slate-200 dark:border-[#444446]">{t('Location')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-wider border-r border-slate-200 dark:border-[#444446]">{t('Start Month')}</th>
                    <th className="px-4 py-3 font-bold uppercase tracking-wider">{t('End Month')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-4 border-r border-slate-200 dark:border-[#444446]">
                      <div className="flex items-center gap-2">
                        <select 
                          value={globalYearFilter}
                          onChange={(e) => setGlobalYearFilter(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs sm:text-sm"
                        >
                          <option value="all">All Years</option>
                          {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-4 border-r border-slate-200 dark:border-[#444446]">
                      <select 
                        value={effectiveStore}
                        onChange={(e) => setGlobalStoreFilter(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs sm:text-sm"
                      >
                        {stores.length > 1 && <option value="all">All Stores</option>}
                        {stores.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-4 border-r border-slate-200 dark:border-[#444446]">
                      <MultiCheckboxSelect 
                        value={globalLocationFilter}
                        onChange={setGlobalLocationFilter}
                        options={locationOptions}
                        placeholder="All Locations"
                        className="w-full"
                      />
                    </td>
                    <td className="px-3 py-4 border-r border-slate-200 dark:border-[#444446]">
                      <select 
                        value={startMonth}
                        onChange={(e) => setStartMonth(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs sm:text-sm"
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i + 1} value={i + 1}>{name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-4">
                      <select 
                        value={endMonth}
                        onChange={(e) => setEndMonth(Number(e.target.value))}
                        className="w-full bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs sm:text-sm"
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={i + 1} value={i + 1}>{name}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {renderPieChart(
              yearChartData, 
              globalYearFilter === 'all' ? t("Total Projects") : `${globalYearFilter} ${t("Total Projects")}`
            )}
            {renderPieChart(
              monthChartData, 
              `${t("Start Month")} ${startMonth} - ${t("End Month")} ${endMonth}`
            )}
          </div>

          {/* Summary Stats Footer */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-200">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Projects')}</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-black text-slate-700 dark:text-[#c3c3c3]">{filteredProjects.length}</p>
                <TrendingUp className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383]" />
              </div>
            </div>
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-orange-200">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Projects in Period')}</p>
              <p className="text-xl font-black text-orange-600">{projectsInPeriod.length}</p>
            </div>
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-blue-300">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Budget')}</p>
              <div className="flex items-center gap-2">
                <p className="text-xl font-black text-blue-600 dark:text-[#8ab4f8]">
                  {(periodBudget / 1000000).toFixed(1)}M
                </p>
                <Wallet className="w-3.5 h-3.5 text-blue-400" />
              </div>
            </div>
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-emerald-300">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Period Summary')} - {t('Cost')}</p>
              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">
                {(periodActual / 1000000).toFixed(1)}M
              </p>
            </div>
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Budget')}</p>
              <p className="text-xl font-black text-slate-600 dark:text-[#a3a3a3]">
                {(totalBudget / 1000000).toFixed(1)}M
              </p>
            </div>
            <div className="bg-white dark:bg-[#1e1e20] p-4 rounded-xl border border-slate-200 dark:border-[#444446] shadow-sm flex flex-col gap-1 transition-all hover:border-slate-300">
              <p className="text-[10px] font-bold text-slate-400 dark:text-[#838383] uppercase tracking-tight">{t('Total Actual')}</p>
              <p className="text-xl font-black text-slate-600 dark:text-[#a3a3a3]">
                {(totalActual / 1000000).toFixed(1)}M
              </p>
            </div>
          </div>

          {/* Table 2: Financial Comparison Section */}
          <div className="bg-white dark:bg-[#1e1e20] rounded-xl shadow-lg border border-slate-200 dark:border-[#444446] overflow-hidden transform transition-all hover:shadow-xl">
            <div className="bg-slate-900 p-4 flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Table 2: Budget vs Actual Comparison</h2>
            </div>

            <div className="p-6">
              <div className="w-full h-[450px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={projectsInPeriod.slice(0, 15).map(p=> ({
                      name: p.code,
                      budget: p.budget || 0,
                      actual: p.actual || 0
                    }))}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
                      angle={-45} 
                      textAnchor="end" 
                      interval={0} 
                      height={80}
                      fontSize={12}
                      tick={{ fill: '#64748b' }}
                    />
                    <YAxis 
                      fontSize={12}
                      tick={{ fill: '#64748b' }}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                    />
                    <Tooltip 
                      formatter={(value: number) => new Intl.NumberFormat('en-US').format(value)}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" align="right" height={36} />
                    <Bar dataKey="budget" name="Budget" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual Cost" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-center">
                <p className="text-xs text-slate-400 dark:text-[#838383] italic">
                  * Showing top 15  by current filters. Values in Millions (M).
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SummaryTab;
