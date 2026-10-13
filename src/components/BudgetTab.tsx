import React, { useEffect } from "react";
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { BudgetTabProps } from './BudgetParts/budgetTypes';
import { useBudgetData } from './BudgetParts/useBudgetData';
import { useBudgetMutations } from './BudgetParts/useBudgetMutations';
import { BudgetFilterToolbar } from './BudgetParts/BudgetFilterToolbar';
import { BudgetTableView } from './BudgetParts/BudgetTableView';
import { BudgetMobileView } from './BudgetParts/BudgetMobileView';
import { BudgetSummaryCard } from './BudgetParts/BudgetSummaryCard';
import { BudgetLinkModal } from './BudgetParts/BudgetLinkModal';

export function BudgetTab({ onGoToCost, initialSearchTerm = '' }: BudgetTabProps) {
  const { enrichedProjects: projects } = useEnrichedData();
  const costs = useAppStore(state => state.costs);
  const isCostsRequested = useAppStore(state => state.isCostsRequested);
  const setIsCostsRequested = useAppStore(state => state.setIsCostsRequested);
  const currentUser = useAppStore(state => state.currentUser)!;

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
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    searchTerm,
    setSearchTerm,
    moneyFilter,
    setMoneyFilter,
    lastSelectedMoneyFilterRef,
    collapsedInSearch,
    expandedParents,
    sortConfig,
    visibleColumns,
    colWidths,
    visibleCount,
    setVisibleCount,
    years,
    stores,
    locationOptions,
    filteredRoots,
    totalGlobalBudget,
    totalGlobalActual,
    totalGlobalSupportingFee,
    totalGlobalRemaining,
    totalVarianceColor,
    candidateParentProjects,
    candidateChildProjects,
    linkedChildrenCount,
    selectedParentProject,
    setSelectedParentProject,
    isLinkModalOpen,
    setIsLinkModalOpen,
    parentSearchTerm,
    setParentSearchTerm,
    childSearchTerm,
    setChildSearchTerm,
    getProjectFinancials,
    handleResize,
    handleToggleColumn,
    toggleExpand,
    toggleAllParents,
    handleSort,
    handleBudgetScroll,
    handleOpenLinkModal,
    handleExportBudget,
    handleImportBudget,
    handleProjectLinkClick,
    formatCurrency
  } = useBudgetData({
    projects,
    costs,
    currentUser,
    initialSearchTerm
  });

  const { handleUpdateProject, handleLinkParent } = useBudgetMutations({ projects });

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm min-h-0">
      {/* Top Filter & Action Bar */}
      <BudgetFilterToolbar
        canWrite={canWrite}
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        moneyFilter={moneyFilter}
        setMoneyFilter={setMoneyFilter}
        lastSelectedMoneyFilterRef={lastSelectedMoneyFilterRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        visibleColumns={visibleColumns}
        handleToggleColumn={handleToggleColumn}
        handleExportBudget={handleExportBudget}
        handleImportBudget={handleImportBudget}
      />

      {/* Desktop Table View (Scrollable / Virtualized) */}
      <BudgetTableView
        filteredRoots={filteredRoots}
        visibleCount={visibleCount}
        visibleColumns={visibleColumns}
        colWidths={colWidths}
        sortConfig={sortConfig}
        canWrite={canWrite}
        currency={currency}
        jpyRate={jpyRate}
        usdRate={usdRate}
        searchTerm={searchTerm}
        collapsedInSearch={collapsedInSearch}
        expandedParents={expandedParents}
        totalGlobalBudget={totalGlobalBudget}
        totalGlobalActual={totalGlobalActual}
        totalGlobalSupportingFee={totalGlobalSupportingFee}
        totalGlobalRemaining={totalGlobalRemaining}
        totalVarianceColor={totalVarianceColor}
        onGoToCost={onGoToCost}
        onProjectClick={handleProjectLinkClick}
        toggleExpand={toggleExpand}
        handleSort={handleSort}
        handleResize={handleResize}
        handleBudgetScroll={handleBudgetScroll}
        handleUpdateProject={handleUpdateProject}
        handleOpenLinkModal={handleOpenLinkModal}
        handleLinkParent={handleLinkParent}
        formatCurrency={formatCurrency}
      />

      {/* Mobile Summary Cards & List View */}
      <div className="xl:hidden flex flex-col gap-3 p-3 bg-slate-50 dark:bg-[#121214] border-t border-slate-200 dark:border-[#444446]">
        <BudgetSummaryCard
          totalGlobalBudget={totalGlobalBudget}
          totalGlobalActual={totalGlobalActual}
          totalGlobalSupportingFee={totalGlobalSupportingFee}
          totalGlobalRemaining={totalGlobalRemaining}
          totalVarianceColor={totalVarianceColor}
          formatCurrency={formatCurrency}
        />
      </div>

      <BudgetMobileView
        filteredRoots={filteredRoots}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        canWrite={canWrite}
        searchTerm={searchTerm}
        collapsedInSearch={collapsedInSearch}
        expandedParents={expandedParents}
        toggleExpand={toggleExpand}
        toggleAllParents={toggleAllParents}
        onGoToCost={onGoToCost}
        onProjectClick={handleProjectLinkClick}
        handleOpenLinkModal={handleOpenLinkModal}
        handleLinkParent={handleLinkParent}
        formatCurrency={formatCurrency}
      />

      {/* Project Modular Link Modal */}
      <BudgetLinkModal
        isOpen={isLinkModalOpen}
        onClose={() => {
          setIsLinkModalOpen(false);
          setSelectedParentProject(null);
        }}
        selectedParentProject={selectedParentProject}
        setSelectedParentProject={setSelectedParentProject}
        parentSearchTerm={parentSearchTerm}
        setParentSearchTerm={setParentSearchTerm}
        childSearchTerm={childSearchTerm}
        setChildSearchTerm={setChildSearchTerm}
        candidateParentProjects={candidateParentProjects}
        candidateChildProjects={candidateChildProjects}
        linkedChildrenCount={linkedChildrenCount}
        getProjectFinancials={getProjectFinancials}
        handleLinkParent={handleLinkParent}
        formatCurrency={formatCurrency}
        projects={projects}
        initialYear={globalYearFilter}
        initialStore={effectiveStore}
        initialLocation={globalLocationFilter[0] || 'all'}
      />
    </div>
  );
}

export default BudgetTab;
