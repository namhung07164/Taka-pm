import { useFirebaseData } from "./hooks/useFirebaseData";
import { useDeepLinkLogic } from "./hooks/useDeepLinkLogic";
import { useNotificationActions } from "./hooks/useNotificationActions";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { useEnrichedData } from "./hooks/useEnrichedData";
import { useAppNotificationsSync } from "./hooks/appParts/useAppNotificationsSync";
import { useAppNavigationAndShortcuts } from "./hooks/appParts/useAppNavigationAndShortcuts";
import { useAppPrintController } from "./hooks/appParts/useAppPrintController";
import { useAppLifecycleEffects } from "./hooks/appParts/useAppLifecycleEffects";
import { Suspense, useEffect, useRef } from "react";
import { AppRole } from "./types";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { RibbonDisplayMenu } from "./components/RibbonDisplayMenu";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { AppTabRouter } from "./components/AppTabRouter";
import { AppModals } from "./components/AppModals";
import { useAppStore } from "./store/useAppStore";
import { PrintFilterHeader } from "./components/PrintFilterHeader";
import { AppPrintStyles } from "./components/AppParts/AppPrintStyles";
import { AppGanttPrintPagesView } from "./components/AppParts/AppGanttPrintPagesView";
import { AppGlobalOverlays } from "./components/AppParts/AppGlobalOverlays";

const PrintOptionsPanel = lazyWithRetry(
  () =>
    import("./components/PrintOptionsPanel").then((m) => ({
      default: m.PrintOptionsPanel,
    })),
  "PrintOptionsPanel"
);

const onRenderCallback = (
  _id: string,
  _phase: "mount" | "update" | "nested-update",
  _actualDuration: number,
  _baseDuration: number,
  _startTime: number,
  _commitTime: number
) => {
  // Profiler onRender callback
};

export default function App() {
  const isFocusMode = useAppStore((state) => state.isFocusMode);
  const setIsFocusMode = useAppStore((state) => state.setIsFocusMode);
  const showTour = useAppStore((state) => state.showTour);
  const setShowTour = useAppStore((state) => state.setShowTour);
  const isCommandPaletteOpen = useAppStore((state) => state.isCommandPaletteOpen);
  const setIsCommandPaletteOpen = useAppStore((state) => state.setIsCommandPaletteOpen);
  const toast = useAppStore((state) => state.toast);
  const setToast = useAppStore((state) => state.setToast);
  const currentUser = useAppStore((state) => state.currentUser)!;
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const notificationRules = useAppStore((state) => state.notificationRules);
  const locationVisibility = useAppStore((state) => state.locationVisibility);
  const permissionMatrix = useAppStore((state) => state.permissionMatrix);
  const activeNotifications = useAppStore((state) => state.activeNotifications);
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const setGlobalStoreFilter = useAppStore((state) => state.setGlobalStoreFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);
  const tabHistory = useAppStore((state) => state.tabHistory);
  const setTabHistory = useAppStore((state) => state.setTabHistory);
  const notificationFilterId = useAppStore((state) => state.notificationFilterId);
  const setNotificationFilterId = useAppStore((state) => state.setNotificationFilterId);
  const undoStack = useAppStore((state) => state.undoStack);
  const setUndoStack = useAppStore((state) => state.setUndoStack);
  const redoStack = useAppStore((state) => state.redoStack);
  const setRedoStack = useAppStore((state) => state.setRedoStack);

  const isAnyModalOpen = useAppStore(
    (state) =>
      !!(
        state.isLoginModalOpen ||
        state.isProjectModalOpen ||
        state.isTaskModalOpen ||
        state.isUserModalOpen
      )
  );
  const setIsLoginModalOpen = useAppStore((state) => state.setIsLoginModalOpen);
  const setIsProjectModalOpen = useAppStore((state) => state.setIsProjectModalOpen);
  const setIsTaskModalOpen = useAppStore((state) => state.setIsTaskModalOpen);
  const setIsUserModalOpen = useAppStore((state) => state.setIsUserModalOpen);
  const setEditingProject = useAppStore((state) => state.setEditingProject);
  const setEditingTask = useAppStore((state) => state.setEditingTask);
  const setEditingUser = useAppStore((state) => state.setEditingUser);
  const setModalInitialTab = useAppStore((state) => state.setModalInitialTab);
  const setIsReadOnlyModal = useAppStore((state) => state.setIsReadOnlyModal);
  const setPrefillProjectCode = useAppStore((state) => state.setPrefillProjectCode);
  const setPrefillProjectYear = useAppStore((state) => state.setPrefillProjectYear);
  const setPrefillProjectStore = useAppStore((state) => state.setPrefillProjectStore);
  const setCostTabSearchTerm = useAppStore((state) => state.setCostTabSearchTerm);
  const costTabSearchTerm = useAppStore((state) => state.costTabSearchTerm);
  const setBudgetTabSearchTerm = useAppStore((state) => state.setBudgetTabSearchTerm);
  const budgetTabSearchTerm = useAppStore((state) => state.budgetTabSearchTerm);
  const setDetailTabFilterCode = useAppStore((state) => state.setDetailTabFilterCode);
  const detailTabFilterCode = useAppStore((state) => state.detailTabFilterCode);
  const setDetailTabStoreFilter = useAppStore((state) => state.setDetailTabStoreFilter);
  const setDetailTabFocusTaskId = useAppStore((state) => state.setDetailTabFocusTaskId);
  const detailTabFocusTaskId = useAppStore((state) => state.detailTabFocusTaskId);
  const setDetailReturnScrollId = useAppStore((state) => state.setDetailReturnScrollId);
  const detailReturnScrollId = useAppStore((state) => state.detailReturnScrollId);
  const setGanttTabFocusTaskId = useAppStore((state) => state.setGanttTabFocusTaskId);
  const ganttTabFocusTaskId = useAppStore((state) => state.ganttTabFocusTaskId);
  const setLayoutTabFilters = useAppStore((state) => state.setLayoutTabFilters);
  const layoutTabFilters = useAppStore((state) => state.layoutTabFilters);
  const cloudStatus = useAppStore((state) => state.cloudStatus);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const quickNavTarget = useAppStore((state) => state.quickNavTarget);
  const setQuickNavTarget = useAppStore((state) => state.setQuickNavTarget);
  const ribbonDisplayMode = useAppStore((state) => state.ribbonDisplayMode);
  const setRibbonDisplayMode = useAppStore((state) => state.setRibbonDisplayMode);

  // Safe Harbor Fallback (Idle Timeout)
  const isAppReadyRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      isAppReadyRef.current = true;
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Core Data & Sync Hooks
  useFirebaseData();
  usePushNotifications();
  const notifActions = useNotificationActions();

  // Centralized O(1) Memoized Enriched Data (Phase 1 Optimization)
  const { enrichedProjects, filteredTasks, visibleDelegationGroups } = useEnrichedData();

  const enrichedProjectsRef = useRef(enrichedProjects);
  const filteredTasksRef = useRef(filteredTasks);
  useEffect(() => {
    enrichedProjectsRef.current = enrichedProjects;
    filteredTasksRef.current = filteredTasks;
  }, [enrichedProjects, filteredTasks]);

  // Notifications & RBAC Visible Tabs Hook
  const { readNotifs, unreadCount, visibleTabs } = useAppNotificationsSync({
    enrichedProjects,
    filteredTasks,
    visibleDelegationGroups,
  });

  // Navigation, Keyboard Shortcuts & Touch Gestures Hook
  const {
    handleTabChange,
    handleNavigateToTaskDetail,
    handleNavigateToLayout,
    handleQuickNavigate,
    handleDataUndo,
    handleDataRedo,
  } = useAppNavigationAndShortcuts({
    projects,
    tasks,
    visibleTabs,
    isAppReadyRef,
  });

  const { handleDeepLinkString, pendingDeepLinkRef, executeDeepLinkRef } = useDeepLinkLogic(
    handleTabChange,
    enrichedProjectsRef,
    filteredTasksRef
  );

  const {
    handleCloseTour,
    toggleTheme,
    handleRequestPermission,
    handleLogin,
    handleLogout,
  } = useAppLifecycleEffects({
    currentUser,
    setCurrentUser,
    setShowTour,
    setActiveTab,
    setUndoStack,
    setRedoStack,
    ribbonDisplayMode,
    setRibbonDisplayMode,
    theme,
    setTheme,
    setToast,
    isAnyModalOpen,
    activeTab,
    setIsLoginModalOpen,
    handleTabChange,
    pendingDeepLinkRef,
    executeDeepLinkRef,
  });

  const canSee = currentUser.role === "admin" || currentUser.canSee;
  const userRole = (
    currentUser?.role === "admin"
      ? "admin"
      : (currentUser?.role as string)?.toUpperCase() === "CP"
      ? "CP"
      : (currentUser?.role as string)?.toLowerCase() === "manager"
      ? "Manager"
      : (currentUser?.role as string)?.toLowerCase() === "staff"
      ? "Staff"
      : (currentUser?.role as string)?.toLowerCase() === "external"
      ? "External"
      : currentUser?.role
  ) as AppRole;

  // Print & Export Controller Hook
  const {
    isPrintPreview,
    setIsPrintPreview,
    printOrientation,
    printPaperSize,
    printDate,
    printFilterHeader,
    printScaleMode,
    printWatermark,
    isExportingPDF,
    printWidth,
    printHeight,
    printFilterContext,
    printScale,
    measuredContentSize,
    ganttPrintPages,
    handleExportToExcel,
    handlePrintToPDF,
  } = useAppPrintController({
    enrichedProjects,
    filteredTasks,
  });

  return (
    <div
      className={`min-h-[100dvh] p-2 lg:p-4 flex flex-col bg-slate-50 dark:bg-[#131314] text-slate-800 dark:text-[#f3f3f3] font-sans pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] print:p-0 transition-colors ${
        isPrintPreview ? "print-preview-container" : ""
      }`}
    >
      <AppPrintStyles
        printPaperSize={printPaperSize}
        printOrientation={printOrientation}
        activeTab={activeTab}
        printScale={printScale}
        isPrintPreview={isPrintPreview}
        printWidth={printWidth}
        printHeight={printHeight}
        printScaleMode={printScaleMode}
        measuredContentWidth={measuredContentSize.width}
        measuredContentHeight={measuredContentSize.height}
      />

      {isPrintPreview && (
        <Suspense fallback={null}>
          <PrintOptionsPanel
            activeTab={activeTab}
            onClose={() => setIsPrintPreview(false)}
            onExportToExcel={handleExportToExcel}
            onPrintToPDF={handlePrintToPDF}
          />
        </Suspense>
      )}

      {ganttPrintPages ? (
        <AppGanttPrintPagesView
          ganttPrintPages={ganttPrintPages}
          printWatermark={printWatermark}
          printOrientation={printOrientation}
          printDate={printDate}
          printFilterHeader={printFilterHeader}
          printFilterContext={printFilterContext}
          isPrintPreview={isPrintPreview}
          printScale={printScale}
          printPaperSize={printPaperSize}
          printScaleMode={printScaleMode}
          ganttTabFocusTaskId={ganttTabFocusTaskId}
          setGanttTabFocusTaskId={setGanttTabFocusTaskId}
          handleNavigateToLayout={handleNavigateToLayout}
          handleNavigateToTaskDetail={handleNavigateToTaskDetail}
          onRenderCallback={onRenderCallback}
        />
      ) : (
        <div
          className={
            isPrintPreview
              ? "print-paper relative flex-grow flex flex-col w-full"
              : "w-full flex-grow flex flex-col"
          }
        >
          {isPrintPreview && printWatermark !== "none" && (
            <div
              className="absolute inset-0 pointer-events-none flex items-center justify-center z-[150] overflow-hidden"
              style={{ opacity: 0.15 }}
            >
              <span
                className="font-black text-slate-500 uppercase tracking-widest text-center"
                style={{
                  fontSize: printOrientation === "landscape" ? "12vw" : "15vw",
                  transform: "rotate(-45deg)",
                }}
              >
                {printWatermark}
              </span>
            </div>
          )}
          {printDate && isPrintPreview && (
            <div className="absolute bottom-4 left-4 text-xs font-mono text-slate-500 dark:text-slate-400 z-[90]">
              Printed on: {new Date().toLocaleString()}
            </div>
          )}
          {printFilterHeader && isPrintPreview && activeTab !== "layout" && (
            <div className="w-full px-4 pt-3 pb-1 bg-white dark:bg-[#1e1e20] shrink-0">
              <PrintFilterHeader context={printFilterContext} />
            </div>
          )}

          <div
            className={`w-full flex-grow flex flex-col bg-white dark:bg-[#1e1e20] ${
              activeTab === "layout"
                ? "p-0 pb-0 border-none shadow-none rounded-none"
                : activeTab === "picture_mapping"
                ? "p-1.5 sm:p-2.5 pb-2 sm:pb-2.5 rounded-xl shadow-sm border border-slate-200 dark:border-[#333336]"
                : "p-4 lg:p-6 pb-20 lg:pb-6 rounded-xl shadow-sm border border-slate-200 dark:border-[#333336]"
            } transition-colors print:p-0 print:m-0 print:border-none print:shadow-none print:rounded-none print-content-wrapper ${
              isPrintPreview ? "print-preview-content-active" : ""
            }`}
          >
            {ribbonDisplayMode === "fullscreen" && (
              <div className="fixed top-3 right-4 z-[9999] print:hidden">
                <RibbonDisplayMenu variant="floating" />
              </div>
            )}

            {ribbonDisplayMode === "always_show" && (
              <div className="print:hidden relative z-[200]">
                <Header
                  cloudStatus={cloudStatus}
                  onLoginClick={() => setIsLoginModalOpen(true)}
                  onLogoutClick={handleLogout}
                  onPrintClick={() => setIsPrintPreview(true)}
                  onTabChange={handleTabChange}
                  activeTab={activeTab}
                  notificationCount={unreadCount}
                  onUndo={handleDataUndo}
                  canUndo={undoStack.length > 0 || tabHistory.length > 0}
                  hasDataToUndo={undoStack.length > 0}
                  undoDescription={
                    undoStack.length > 0
                      ? `Undo: ${undoStack[undoStack.length - 1].description}`
                      : tabHistory.length > 0
                      ? `Go back to previous page`
                      : undefined
                  }
                  onRedo={handleDataRedo}
                  canRedo={redoStack.length > 0}
                  hasDataToRedo={redoStack.length > 0}
                  redoDescription={
                    redoStack.length > 0
                      ? `Redo: ${redoStack[redoStack.length - 1].description}`
                      : undefined
                  }
                  onToggleTheme={toggleTheme}
                  isFocusMode={isFocusMode}
                  onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                  isPrintPreview={isPrintPreview}
                  onPrintPreviewToggle={() => setIsPrintPreview(!isPrintPreview)}
                  onDeepLink={handleDeepLinkString}
                  onQuickNavigate={handleQuickNavigate}
                />
              </div>
            )}

            {canSee && !isFocusMode && ribbonDisplayMode !== "fullscreen" && (
              <div className="print:hidden relative z-[150]">
                <Navigation
                  activeTab={activeTab}
                  onTabChange={(tab) => {
                    if (tab === "budget") {
                      setBudgetTabSearchTerm("");
                    }
                    if (tab === "detail") {
                      setDetailTabFilterCode("");
                      setDetailTabStoreFilter("");
                    }
                    handleTabChange(tab);
                  }}
                />
              </div>
            )}

            {!canSee ? (
              <div className="flex-grow flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-xl m-4 print:hidden">
                <div className="w-16 h-16 text-slate-300 mb-4">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    ></path>
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700">Access Restricted</h3>
                <p className="text-slate-500 text-sm max-w-xs text-center mt-2">
                  Please log in with a valid account to view and manage project data.
                </p>
                <button
                  title="Button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="mt-6 px-8 py-2.5 bg-slate-900 text-white rounded-xl font-bold shadow-lg transition-transform active:scale-95"
                >
                  Login Now
                </button>
              </div>
            ) : (
              <AppTabRouter
                activeTab={activeTab}
                currentUser={currentUser}
                userRole={userRole}
                permissionMatrix={permissionMatrix}
                layoutTabFilters={layoutTabFilters}
                setLayoutTabFilters={setLayoutTabFilters}
                ganttTabFocusTaskId={ganttTabFocusTaskId}
                setGanttTabFocusTaskId={setGanttTabFocusTaskId}
                detailTabFilterCode={detailTabFilterCode}
                setDetailTabFilterCode={setDetailTabFilterCode}
                globalStoreFilter={globalStoreFilter}
                globalYearFilter={globalYearFilter}
                setGlobalStoreFilter={setGlobalStoreFilter}
                setGlobalYearFilter={setGlobalYearFilter}
                detailTabFocusTaskId={detailTabFocusTaskId}
                setDetailTabFocusTaskId={setDetailTabFocusTaskId}
                detailReturnScrollId={detailReturnScrollId}
                setDetailReturnScrollId={setDetailReturnScrollId}
                budgetTabSearchTerm={budgetTabSearchTerm}
                setBudgetTabSearchTerm={setBudgetTabSearchTerm}
                costTabSearchTerm={costTabSearchTerm}
                setCostTabSearchTerm={setCostTabSearchTerm}
                tabHistory={tabHistory}
                setTabHistory={setTabHistory}
                locationVisibility={locationVisibility}
                activeNotifications={activeNotifications}
                readNotifs={readNotifs}
                notificationFilterId={notificationFilterId}
                setNotificationFilterId={setNotificationFilterId}
                unreadCount={unreadCount}
                handleRequestPermission={handleRequestPermission}
                notifActions={notifActions}
                notificationRules={notificationRules}
                handleTabChange={handleTabChange}
                handleNavigateToLayout={handleNavigateToLayout}
                handleNavigateToTaskDetail={handleNavigateToTaskDetail}
                setQuickNavTarget={setQuickNavTarget}
                setEditingProject={setEditingProject}
                setEditingTask={setEditingTask}
                setEditingUser={setEditingUser}
                setIsReadOnlyModal={setIsReadOnlyModal}
                setModalInitialTab={setModalInitialTab}
                setIsProjectModalOpen={setIsProjectModalOpen}
                setIsTaskModalOpen={setIsTaskModalOpen}
                setIsUserModalOpen={setIsUserModalOpen}
                setPrefillProjectCode={setPrefillProjectCode}
                setPrefillProjectYear={setPrefillProjectYear}
                setPrefillProjectStore={setPrefillProjectStore}
                setPrefillProjectId={useAppStore.getState().setPrefillProjectId}
                isAppReadyRef={isAppReadyRef}
                executeDeepLinkRef={executeDeepLinkRef}
                onRenderCallback={onRenderCallback}
              />
            )}
          </div>
        </div>
      )}

      <AppModals onLogin={handleLogin} onTabChange={handleTabChange} />

      <AppGlobalOverlays
        quickNavTarget={quickNavTarget}
        setQuickNavTarget={setQuickNavTarget}
        handleQuickNavigate={handleQuickNavigate}
        isCommandPaletteOpen={isCommandPaletteOpen}
        setIsCommandPaletteOpen={setIsCommandPaletteOpen}
        handleTabChange={handleTabChange}
        toggleTheme={toggleTheme}
        isFocusMode={isFocusMode}
        setIsFocusMode={setIsFocusMode}
        isPrintPreview={isPrintPreview}
        setIsPrintPreview={setIsPrintPreview}
        toast={toast}
        setToast={setToast}
        showTour={showTour}
        handleCloseTour={handleCloseTour}
        isExportingPDF={isExportingPDF}
      />
    </div>
  );
}
