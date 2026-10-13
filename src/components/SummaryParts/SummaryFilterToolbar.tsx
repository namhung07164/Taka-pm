import React, { FC, memo } from 'react';
import { Filter, LayoutDashboard, LineChart } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { MONTH_NAMES } from './summaryTypes';

interface SummaryFilterToolbarProps {
  activeSubTab: 'project_summary' | 'exec_dashboard';
  setActiveSubTab: (tab: 'project_summary' | 'exec_dashboard') => void;
  globalYearFilter: string;
  setGlobalYearFilter: (val: string) => void;
  years: string[];
  effectiveStore: string;
  setGlobalStoreFilter: (val: string) => void;
  stores: string[];
  globalLocationFilter: string[];
  setGlobalLocationFilter: (val: string[]) => void;
  locationOptions: string[];
  startMonth: number;
  setStartMonth: (val: number) => void;
  endMonth: number;
  setEndMonth: (val: number) => void;
}

export const SummaryFilterToolbar: React.FC<SummaryFilterToolbarProps> = React.memo(({
  activeSubTab,
  setActiveSubTab,
  globalYearFilter,
  setGlobalYearFilter,
  years,
  effectiveStore,
  setGlobalStoreFilter,
  stores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationOptions,
  startMonth,
  setStartMonth,
  endMonth,
  setEndMonth,
}) => {
  const { t } = useLanguage();

  return (
    <>
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

      {activeSubTab === 'project_summary' && (
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
                    <select 
                      value={globalYearFilter}
                      onChange={(e) => setGlobalYearFilter(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-[#1e1e20]/50 border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium text-xs sm:text-sm"
                    >
                      <option value="all">All Years</option>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
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
      )}
    </>
  );
});
SummaryFilterToolbar.displayName = 'SummaryFilterToolbar';
