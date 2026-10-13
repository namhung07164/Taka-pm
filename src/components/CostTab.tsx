import React, { Suspense, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { CostTabProps } from './CostParts/costTypes';
import { useCostData } from './CostParts/useCostData';
import { useCostMutations } from './CostParts/useCostMutations';
import { useCostCsvOps } from './CostParts/useCostCsvOps';
import { CostFilterToolbar } from './CostParts/CostFilterToolbar';
import { CostSummaryCard } from './CostParts/CostSummaryCard';
import { CostTableView } from './CostParts/CostTableView';
import { CostMobileView } from './CostParts/CostMobileView';

const ConfirmModal = lazyWithRetry(
  () => import('./ConfirmModal').then((m) => ({ default: m.ConfirmModal })),
  'ConfirmModal'
);

export function CostTab({ initialSearchTerm = '', onGoToBudget }: CostTabProps) {
  const { enrichedProjects: projects } = useEnrichedData();
  const costs = useAppStore((state) => state.costs);
  const currentUser = useAppStore((state) => state.currentUser)!;
  const isCostsRequested = useAppStore((state) => state.isCostsRequested);
  const setIsCostsRequested = useAppStore((state) => state.setIsCostsRequested);

  useEffect(() => {
    if (!isCostsRequested) {
      setIsCostsRequested(true);
    }
  }, [isCostsRequested, setIsCostsRequested]);

  const {
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
  } = useCostData({
    projects,
    costs,
    currentUser,
    initialSearchTerm,
  });

  const {
    confirmModal,
    setConfirmModal,
    handleAddCost,
    handleDeleteCost,
    handleUpdateCost,
  } = useCostMutations({
    canWrite,
    expandedCodes,
    toggleProjectExpansion,
  });

  const { handleExportCosts, handleImportCosts } = useCostCsvOps({
    costs,
    projects,
    filteredCostsForTotals,
  });

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm">
      <React.Suspense fallback={null}>
        {confirmModal.isOpen && (
          <ConfirmModal
            isOpen={confirmModal.isOpen}
            message={confirmModal.message}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
          />
        )}
      </React.Suspense>

      {/* Top Filter & Action Bar */}
      <CostFilterToolbar
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        hasActForcFilter={hasActForcFilter}
        setHasActForcFilter={setHasActForcFilter}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        visibleColumns={visibleColumns}
        handleToggleColumn={handleToggleColumn}
        canWrite={canWrite}
        isAdmin={isAdmin}
        handleExportCosts={handleExportCosts}
        handleImportCosts={handleImportCosts}
      />

      {/* Desktop & Mobile Summary Cards with Paid Date Filter */}
      <CostSummaryCard
        totalActAll={totalActAll}
        totalBalanceAll={totalBalanceAll}
        totalSupAll={totalSupAll}
        totalRemainingAll={totalRemainingAll}
        formatCurrency={formatCurrency}
        isPaidDateFilterOpen={isPaidDateFilterOpen}
        setIsPaidDateFilterOpen={setIsPaidDateFilterOpen}
        paidDateStart={paidDateStart}
        paidDateEnd={paidDateEnd}
        matchingCount={filteredCostsForTotals.length}
        tempDateStart={tempDateStart}
        tempDateEnd={tempDateEnd}
        handleTempStartChange={handleTempStartChange}
        handleTempEndChange={handleTempEndChange}
        commitDateFilter={commitDateFilter}
        handleClearPaidDateFilter={handleClearPaidDateFilter}
        paidStageFilter={paidStageFilter}
        setPaidStageFilter={setPaidStageFilter}
        onGoToBudget={() => useAppStore.getState().setActiveTab('budget')}
      />

      {/* Desktop Table View */}
      <CostTableView
        filteredProjectsForDisplay={filteredProjectsForDisplay}
        visibleColumns={visibleColumns}
        colWidths={colWidths}
        handleResize={handleResize}
        handleToggleColumn={handleToggleColumn}
        expandedCodes={expandedCodes}
        setExpandedCodes={setExpandedCodes}
        sortedProjects={sortedProjects}
        formatCurrency={formatCurrency}
        hasActForcFilter={hasActForcFilter}
        setHasActForcFilter={setHasActForcFilter}
        totalActAll={totalActAll}
        totalFirstPaidAll={totalFirstPaidAll}
        totalSecondPaidAll={totalSecondPaidAll}
        totalThirdPaidAll={totalThirdPaidAll}
        totalBalanceAll={totalBalanceAll}
        totalSupAll={totalSupAll}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        handleCostScroll={handleCostScroll}
        toggleGroup={toggleGroup}
        handleProjectLinkClick={handleProjectLinkClick}
        canWrite={canWrite}
        handleAddCost={handleAddCost}
        handleDeleteCost={handleDeleteCost}
        handleUpdateCost={handleUpdateCost}
        currency={currency}
        jpyRate={jpyRate}
        usdRate={usdRate}
        paidDateStart={paidDateStart}
        paidDateEnd={paidDateEnd}
        paidStageFilter={paidStageFilter}
        getGroupCostsForProject={getGroupCostsForProject}
        getCostPaidMatches={getCostPaidMatches}
      />

      {/* Mobile View */}
      <CostMobileView
        filteredProjectsForDisplay={filteredProjectsForDisplay}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        expandedCodes={expandedCodes}
        toggleAll={toggleAll}
        toggleGroup={toggleGroup}
        formatCurrency={formatCurrency}
        canWrite={canWrite}
        handleAddCost={handleAddCost}
        handleDeleteCost={handleDeleteCost}
        handleUpdateCost={handleUpdateCost}
        currency={currency}
        jpyRate={jpyRate}
        usdRate={usdRate}
        paidDateStart={paidDateStart}
        paidDateEnd={paidDateEnd}
        paidStageFilter={paidStageFilter}
        getGroupCostsForProject={getGroupCostsForProject}
        getCostPaidMatches={getCostPaidMatches}
        handleCostScroll={handleCostScroll}
      />
    </div>
  );
}

export default CostTab;
