import React, { FC, memo } from 'react';
import { ExecutiveDashboardProps } from './ExecutiveDashboardParts/executiveDashboardTypes';
import { useExecutiveDashboardData } from './ExecutiveDashboardParts/useExecutiveDashboardData';
import { ExecutiveDashboardMetricsCards } from './ExecutiveDashboardParts/ExecutiveDashboardMetricsCards';
import { ExecutiveDashboardCharts } from './ExecutiveDashboardParts/ExecutiveDashboardCharts';
import { ExecutiveDashboardProjectsTable } from './ExecutiveDashboardParts/ExecutiveDashboardProjectsTable';

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = React.memo(({
  filteredProjects,
  globalYearFilter,
  effectiveStore,
}) => {
  const {
    forecastViewMode,
    setForecastViewMode,
    selectedEVMStore,
    setSelectedEVMStore,
    evmMetrics,
    cashflowData,
  } = useExecutiveDashboardData({
    filteredProjects,
    globalYearFilter,
    effectiveStore,
  });

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. Executive Summary Cards (EVM Core Indicators) */}
      <ExecutiveDashboardMetricsCards
        evmMetrics={evmMetrics}
        cashflowData={cashflowData}
        globalYearFilter={globalYearFilter}
      />

      {/* 2. Cashflow Forecast Chart Section */}
      <ExecutiveDashboardCharts
        cashflowData={cashflowData}
        forecastViewMode={forecastViewMode}
        setForecastViewMode={setForecastViewMode}
      />

      {/* 3. EVM Performance Analysis (Top Projects Benchmark) */}
      <ExecutiveDashboardProjectsTable
        evmMetrics={evmMetrics}
        selectedEVMStore={selectedEVMStore}
        setSelectedEVMStore={setSelectedEVMStore}
      />
    </div>
  );
});

ExecutiveDashboard.displayName = 'ExecutiveDashboard';
export default ExecutiveDashboard;
