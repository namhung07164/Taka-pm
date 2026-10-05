import React, { Suspense } from 'react';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { SummaryTabProps } from './SummaryParts/summaryTypes';
import { useSummaryData } from './SummaryParts/useSummaryData';
import { SummaryFilterToolbar } from './SummaryParts/SummaryFilterToolbar';
import { SummaryMetricsCards } from './SummaryParts/SummaryMetricsCards';
import { SummaryChartsView } from './SummaryParts/SummaryChartsView';

const ExecutiveDashboard = lazyWithRetry(
  () => import('./ExecutiveDashboard').then((m) => ({ default: m.ExecutiveDashboard })),
  'ExecutiveDashboard'
);

export function SummaryTab({}: SummaryTabProps) {
  const {
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
  } = useSummaryData();

  return (
    <div className="flex flex-col flex-grow bg-slate-50 dark:bg-[#1e1e20]/50 p-4 md:p-8 space-y-6 overflow-y-auto">
      {/* 1. Filter & Sub-Tab Control Toolbar */}
      <SummaryFilterToolbar
        activeSubTab={activeSubTab}
        setActiveSubTab={setActiveSubTab}
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        startMonth={startMonth}
        setStartMonth={setStartMonth}
        endMonth={endMonth}
        setEndMonth={setEndMonth}
      />

      {/* 2. Content Area: Exec Dashboard vs Project Summary */}
      {activeSubTab === 'exec_dashboard' ? (
        <Suspense
          fallback={
            <div className="flex-1 w-full p-6 animate-pulse space-y-4">
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/3"></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
                <div className="h-28 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
              </div>
              <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
            </div>
          }
        >
          <ExecutiveDashboard
            filteredProjects={filteredProjects}
            globalYearFilter={globalYearFilter}
            effectiveStore={effectiveStore}
          />
        </Suspense>
      ) : (
        <>
          {/* Charts Section */}
          <SummaryChartsView
            yearChartData={yearChartData}
            monthChartData={monthChartData}
            globalYearFilter={globalYearFilter}
            startMonth={startMonth}
            endMonth={endMonth}
            projectsInPeriod={projectsInPeriod}
          />

          {/* Summary Stats Footer */}
          <SummaryMetricsCards
            totalProjectsCount={filteredProjects.length}
            periodProjectsCount={projectsInPeriod.length}
            periodBudget={periodBudget}
            periodActual={periodActual}
            totalBudget={totalBudget}
            totalActual={totalActual}
          />
        </>
      )}
    </div>
  );
}

export default SummaryTab;
