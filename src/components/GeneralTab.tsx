import React, { useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { useLanguage } from '../lib/LanguageContext';
import { GeneralTabProps } from './GeneralTabParts/generalTypes';
import { useGeneralData } from './GeneralTabParts/useGeneralData';
import { useGeneralDragDrop } from './GeneralTabParts/useGeneralDragDrop';
import { useGeneralGoogleSync } from './GeneralTabParts/useGeneralGoogleSync';
import { GeneralFilterToolbar } from './GeneralTabParts/GeneralFilterToolbar';
import { GeneralCanvasView } from './GeneralTabParts/GeneralCanvasView';
import { GeneralMobileView } from './GeneralTabParts/GeneralMobileView';
import { CheckCircle2 } from 'lucide-react';

export function GeneralTab({ onProjectClick }: GeneralTabProps) {
  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const { t } = useLanguage();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const {
    globalYearFilter,
    setGlobalYearFilter,
    effectiveStore,
    setGlobalStoreFilter,
    globalLocationFilter,
    setGlobalLocationFilter,
    pinnedProjects,
    setPinnedProjects,
    theme,
    searchTerm,
    setSearchTerm,
    statusFilter,
    setStatusFilter,
    lastSelectedStatusFilterRef,
    flashToggle,
    sortConfig,
    setSortConfig,
    visibleCount,
    setVisibleCount,
    years,
    stores,
    locationOptions,
    filteredProjects,
    paginatedProjects
  } = useGeneralData({
    projects,
    tasks,
    currentUser
  });

  const {
    draggedPinnedId,
    dragOverTarget,
    justDroppedId,
    successToast,
    handlePinToggle,
    handleMovePinned,
    handleDragStart,
    handleRowDragOver,
    handleRowDrop,
    handleDragEnd,
    handleCanvasDragOver,
    handleCanvasDrop
  } = useGeneralDragDrop({
    projects,
    paginatedProjects,
    pinnedProjects,
    setPinnedProjects,
    canvasRef,
    t
  });

  const { isSyncing, handleGoogleSync } = useGeneralGoogleSync({
    currentUser,
    projects,
    delegationGroups
  });

  return (
    <div className="flex flex-col flex-grow bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-xl shadow-sm min-h-0">
      {/* Top Controls & Filter Toolbar */}
      <GeneralFilterToolbar
        currentUser={currentUser}
        isSyncing={isSyncing}
        handleGoogleSync={handleGoogleSync}
        globalYearFilter={globalYearFilter}
        setGlobalYearFilter={setGlobalYearFilter}
        years={years}
        effectiveStore={effectiveStore}
        setGlobalStoreFilter={setGlobalStoreFilter}
        stores={stores}
        globalLocationFilter={globalLocationFilter}
        setGlobalLocationFilter={setGlobalLocationFilter}
        locationOptions={locationOptions}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        lastSelectedStatusFilterRef={lastSelectedStatusFilterRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
      />

      {/* Desktop Canvas View */}
      <GeneralCanvasView
        wrapperRef={wrapperRef}
        canvasRef={canvasRef}
        paginatedProjects={paginatedProjects}
        pinnedProjects={pinnedProjects}
        sortConfig={sortConfig}
        setSortConfig={setSortConfig}
        theme={theme}
        flashToggle={flashToggle}
        searchTerm={searchTerm}
        globalYearFilter={globalYearFilter}
        globalStoreFilter={effectiveStore}
        globalLocationFilter={globalLocationFilter}
        statusFilter={statusFilter}
        draggedPinnedId={draggedPinnedId}
        dragOverTarget={dragOverTarget}
        justDroppedId={justDroppedId}
        onProjectClick={onProjectClick}
        handlePinToggle={handlePinToggle}
        handleMovePinned={handleMovePinned}
        handleRowDragOver={handleRowDragOver}
        handleRowDrop={handleRowDrop}
        handleCanvasDragOver={handleCanvasDragOver}
        handleCanvasDrop={handleCanvasDrop}
      />

      {/* Mobile Card List View */}
      <GeneralMobileView
        paginatedProjects={paginatedProjects}
        filteredProjects={filteredProjects}
        visibleCount={visibleCount}
        setVisibleCount={setVisibleCount}
        pinnedProjects={pinnedProjects}
        draggedPinnedId={draggedPinnedId}
        dragOverTarget={dragOverTarget}
        justDroppedId={justDroppedId}
        onProjectClick={onProjectClick}
        handlePinToggle={handlePinToggle}
        handleMovePinned={handleMovePinned}
        handleDragStart={handleDragStart}
        handleRowDragOver={handleRowDragOver}
        handleRowDrop={handleRowDrop}
        handleDragEnd={handleDragEnd}
      />

      {/* Floating visual feedback toast */}
      {successToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-2.5 bg-emerald-600 dark:bg-emerald-700 text-white font-medium text-sm rounded-full shadow-2xl border border-emerald-400/50 animate-bounce">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-white" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-4 text-xs text-slate-500 dark:text-[#a3a3a3] text-right flex justify-between items-center px-1 shrink-0">
        <span>* Data is synced to Cloud. Header is sticky.</span>
        <span>{t('Total')}: <span className="font-bold text-slate-700 dark:text-[#c3c3c3]">{filteredProjects.length}</span> {t('')}</span>
      </div>
    </div>
  );
}

export default GeneralTab;
