import React, { useState } from "react";
import { Map } from 'lucide-react';
import { LiveLayoutViewer } from './LiveLayoutViewer';
import { useLayoutTabData } from './LayoutTabParts/useLayoutTabData';
import { LayoutTabFilterToolbar } from './LayoutTabParts/LayoutTabFilterToolbar';
import { LayoutTabFullscreenView } from './LayoutTabParts/LayoutTabFullscreenView';
import { LayoutTabStaticViewer } from './LayoutTabParts/LayoutTabStaticViewer';

export interface LayoutTabProps {
  initialStore?: string;
  initialLocation?: string;
  initialProjectCode?: string;
  onClearFocus?: () => void;
  onBackToGantt?: () => void;
}

export function LayoutTab({ 
  initialStore: propInitialStore,
  initialLocation: propInitialLocation,
  initialProjectCode: propInitialProjectCode,
  onClearFocus,
  onBackToGantt
}: LayoutTabProps) {
  const [cacheBuster, setCacheBuster] = useState<number>(Date.now());

  const {
    allowedStores,
    activeStore,
    setGlobalStoreFilter,
    setGlobalLocationFilter,
    availableLocations,
    locFilterStr,
    availableYears,
    effectiveYear,
    setGlobalYearFilter,
    canWrite,
    isAdmin,
    isEditing,
    setIsEditing,
    editUrl,
    setEditUrl,
    handleSave,
    isLiveMapMode,
    setIsLiveMapMode,
    url,
    getCleanUrl,
    fallbackSvg,
    isExporting,
    exportStatusMessage,
    handleTriggerReExport,
    unitSearchInput,
    setUnitSearchInput,
    targetUnitSearch,
    setTargetUnitSearch,
    showSuggestions,
    setShowSuggestions,
    searchContainerRef,
    filteredUnitSuggestions,
    handleSelectSearchUnit,
    handleClearSearchAndFocus,
    isFullscreenView,
    setIsFullscreenView,
  } = useLayoutTabData({
    propInitialStore,
    propInitialLocation,
    propInitialProjectCode,
    onClearFocus,
  });

  return (
    <>
      {isFullscreenView && (
        <LayoutTabFullscreenView
          isFullscreenView={isFullscreenView}
          setIsFullscreenView={setIsFullscreenView}
          activeStore={activeStore}
          locFilterStr={locFilterStr}
          effectiveYear={effectiveYear}
          targetUnitSearch={targetUnitSearch}
          onUnitSelected={undefined}
          onClearFocus={handleClearSearchAndFocus}
          isLiveMapMode={isLiveMapMode}
          url={url}
          getCleanUrl={getCleanUrl}
          fallbackSvg={fallbackSvg}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
        />
      )}

      <div className="flex-grow flex flex-col p-2.5 sm:p-4 md:p-6 bg-slate-50 dark:bg-slate-950 relative h-full print:p-0 print:m-0 print:bg-white print:border-none print:shadow-none">
        <LayoutTabFilterToolbar
          activeStore={activeStore}
          allowedStores={allowedStores}
          setGlobalStoreFilter={setGlobalStoreFilter}
          locFilterStr={locFilterStr}
          availableLocations={availableLocations}
          setGlobalLocationFilter={setGlobalLocationFilter}
          effectiveYear={effectiveYear}
          availableYears={availableYears}
          setGlobalYearFilter={setGlobalYearFilter}
          onBackToGantt={onBackToGantt}
          isLiveMapMode={isLiveMapMode}
          setIsLiveMapMode={setIsLiveMapMode}
          onRefresh={() => setCacheBuster(Date.now())}
          canWrite={canWrite}
          isExporting={isExporting}
          exportStatusMessage={exportStatusMessage}
          onTriggerReExport={handleTriggerReExport}
          isAdmin={isAdmin}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          editUrl={editUrl}
          setEditUrl={setEditUrl}
          url={url}
          onSaveUrl={handleSave}
          unitSearchInput={unitSearchInput}
          setUnitSearchInput={setUnitSearchInput}
          setTargetUnitSearch={setTargetUnitSearch}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          searchContainerRef={searchContainerRef}
          filteredUnitSuggestions={filteredUnitSuggestions}
          onSelectSearchUnit={handleSelectSearchUnit}
          onClearSearchAndFocus={handleClearSearchAndFocus}
        />

        <div className="flex-grow flex w-full min-h-[460px] h-[calc(100dvh-175px)] sm:h-[calc(100vh-195px)] bg-slate-50 dark:bg-slate-900/50 rounded-2xl shadow-inner border border-slate-200 dark:border-slate-800 overflow-hidden relative print:h-[100vh] print:w-full print:min-h-0 print:border-none print:shadow-none print:rounded-none print:bg-white">
          {allowedStores.length === 0 || availableLocations.length === 0 ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 p-6 text-center">
              <Map className="w-12 h-12 mb-3 opacity-20" />
              <p className="text-sm font-medium">No accessible projects or layouts found for this account</p>
              <p className="text-xs mt-1 text-slate-400">There are no projects matching your account permissions.</p>
            </div>
          ) : isLiveMapMode ? (
            <LiveLayoutViewer 
              storeFilter={activeStore} 
              locationFilter={locFilterStr} 
              yearFilter={effectiveYear}
              targetUnitSearch={targetUnitSearch}
              onUnitSelected={undefined}
              onClearFocus={handleClearSearchAndFocus}
            />
          ) : (
            <LayoutTabStaticViewer
              url={url}
              getCleanUrl={getCleanUrl}
              fallbackSvg={fallbackSvg}
              cacheBuster={cacheBuster}
              isAdmin={isAdmin}
              onOpenFullscreen={() => setIsFullscreenView(true)}
            />
          )}
        </div>
      </div>
    </>
  );
}

export default LayoutTab;
