import React, { Dispatch, FC, Profiler, SetStateAction, Suspense, memo } from 'react';
import { motion } from "motion/react";
import { TabErrorBoundary } from "./TabErrorBoundary";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { useAppStore } from "../store/useAppStore";
import { useEnrichedData } from "../hooks/useEnrichedData";
import { TabId, Project, Task, AppUser, ActiveNotification, NotificationRule } from "../types";
import { findProjectLayoutUnit } from "../lib/layoutUnitFinder";

// Code Splitting - JIT Dynamic Imports for all application tabs (Rule 12)
const GeneralTab = lazyWithRetry(() => import("./GeneralTab"), "GeneralTab");
const SummaryTab = lazyWithRetry(() => import("./SummaryTab"), "SummaryTab");
const LayoutTab = lazyWithRetry(() => import("./LayoutTab"), "LayoutTab");
const DetailTab = lazyWithRetry(() => import("./DetailTab"), "DetailTab");
const TaskDelegationTab = lazyWithRetry(() => import("./TaskDelegationTab"), "TaskDelegationTab");
const DelegationCalendarTab = lazyWithRetry(() => import("./DelegationCalendarTab"), "DelegationCalendarTab");
const CalendarTab = lazyWithRetry(() => import("./CalendarTab"), "CalendarTab");
const GanttTab = lazyWithRetry(() => import("./GanttTab"), "GanttTab");
const BudgetTab = lazyWithRetry(() => import("./BudgetTab"), "BudgetTab");
const CostTab = lazyWithRetry(() => import("./CostTab"), "CostTab");
const AccControlTab = lazyWithRetry(() => import("./AccControlTab"), "AccControlTab");
const CsvExportTab = lazyWithRetry(() => import("./CsvExportTab"), "CsvExportTab");
const PictureMappingTab = lazyWithRetry(() => import("./PictureMappingTab").then(m => ({ default: m.PictureMappingTab })), "PictureMappingTab");
const NotificationTab = lazyWithRetry(() => import("./NotificationTab"), "NotificationTab");
const SettingTab = lazyWithRetry(() => import("./SettingTab"), "SettingTab");
const ManualTab = lazyWithRetry(() => import("./ManualTab").then(m => ({ default: m.ManualTab })), "ManualTab");
const AuditLogTab = lazyWithRetry(() => import("./AuditLogTab").then(m => ({ default: m.AuditLogTab })), "AuditLogTab");

interface AppTabRouterProps {
  activeTab: TabId;
  currentUser: AppUser;
  userRole: any;
  permissionMatrix: any;
  layoutTabFilters: any;
  setLayoutTabFilters: (val: any) => void;
  ganttTabFocusTaskId: string;
  setGanttTabFocusTaskId: (val: string) => void;
  detailTabFilterCode: string;
  setDetailTabFilterCode: (val: string) => void;
  globalStoreFilter: string;
  globalYearFilter: string;
  setGlobalStoreFilter: (val: string) => void;
  setGlobalYearFilter: (val: string) => void;
  detailTabFocusTaskId: string;
  setDetailTabFocusTaskId: (val: string) => void;
  detailReturnScrollId: string;
  setDetailReturnScrollId: (val: string) => void;
  budgetTabSearchTerm: string;
  setBudgetTabSearchTerm: (val: string) => void;
  costTabSearchTerm: string;
  setCostTabSearchTerm: (val: string) => void;
  tabHistory: TabId[];
  setTabHistory: React.Dispatch<React.SetStateAction<TabId[]>>;
  locationVisibility: Record<string, boolean>;
  activeNotifications: ActiveNotification[];
  readNotifs: string[] | Set<string>;
  notificationFilterId: string | null;
  setNotificationFilterId: (val: string | null) => void;
  unreadCount: number;
  handleRequestPermission: () => Promise<void>;
  notifActions: any;
  notificationRules: NotificationRule[];
  handleTabChange: (tab: TabId) => void;
  handleNavigateToLayout: (projectCode: string, store: string, location?: string, taskId?: string) => void;
  handleNavigateToTaskDetail: (projectCode: string, store: string, taskId?: string) => void;
  setQuickNavTarget: (target: any) => void;
  setEditingProject: (p: Project | null) => void;
  setEditingTask: (t: Task | null) => void;
  setEditingUser: (u: AppUser | null) => void;
  setIsReadOnlyModal: (val: boolean) => void;
  setModalInitialTab: (val: "details" | "chat") => void;
  setIsProjectModalOpen: (val: boolean) => void;
  setIsTaskModalOpen: (val: boolean) => void;
  setIsUserModalOpen: (val: boolean) => void;
  setPrefillProjectCode: (val: string) => void;
  setPrefillProjectYear: (val: number | null) => void;
  setPrefillProjectStore: (val: string | null) => void;
  isAppReadyRef: React.MutableRefObject<boolean>;
  executeDeepLinkRef: React.MutableRefObject<((type: string, id: string | number, extra?: any) => void) | null>;
  onRenderCallback: (id: string, phase: any, actualDuration: number, baseDuration: number, startTime: number, commitTime: number) => void;
}

export const AppTabRouter: React.FC<AppTabRouterProps> = React.memo(({
  activeTab,
  currentUser,
  userRole,
  permissionMatrix,
  layoutTabFilters,
  setLayoutTabFilters,
  ganttTabFocusTaskId,
  setGanttTabFocusTaskId,
  detailTabFilterCode,
  setDetailTabFilterCode,
  globalStoreFilter,
  globalYearFilter,
  setGlobalStoreFilter,
  setGlobalYearFilter,
  detailTabFocusTaskId,
  setDetailTabFocusTaskId,
  detailReturnScrollId,
  setDetailReturnScrollId,
  budgetTabSearchTerm,
  setBudgetTabSearchTerm,
  costTabSearchTerm,
  setCostTabSearchTerm,
  tabHistory,
  setTabHistory,
  locationVisibility,
  activeNotifications,
  readNotifs,
  notificationFilterId,
  setNotificationFilterId,
  unreadCount,
  handleRequestPermission,
  notifActions,
  notificationRules,
  handleTabChange,
  handleNavigateToLayout,
  handleNavigateToTaskDetail,
  setQuickNavTarget,
  setEditingProject,
  setEditingTask,
  setEditingUser,
  setIsReadOnlyModal,
  setModalInitialTab,
  setIsProjectModalOpen,
  setIsTaskModalOpen,
  setIsUserModalOpen,
  setPrefillProjectCode,
  setPrefillProjectYear,
  setPrefillProjectStore,
  isAppReadyRef,
  executeDeepLinkRef,
  onRenderCallback,
}) => {
  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups } = useEnrichedData();
  const appUsers = useAppStore(state => state.appUsers);
  const setActiveTab = useAppStore(state => state.setActiveTab);

  return (
    <div className="flex-grow flex flex-col min-h-0 relative z-[10]">
      <TabErrorBoundary tabKey={activeTab}>
        <Suspense fallback={
          <div className="flex-1 w-full h-full p-4 md:p-6 lg:p-8 animate-pulse bg-slate-50 dark:bg-[#0e0e11]">
            <div className="max-w-7xl mx-auto w-full space-y-6">
              <div className="flex items-center justify-between">
                <div className="h-8 w-48 bg-slate-200 dark:bg-[#18181a] rounded-lg"></div>
                <div className="h-8 w-24 bg-slate-200 dark:bg-[#18181a] rounded-lg"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-slate-200 dark:bg-[#18181a] rounded-xl"></div>)}
              </div>
              <div className="h-[400px] w-full bg-slate-200 dark:bg-[#18181a] rounded-xl"></div>
            </div>
          </div>
        }>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0.95 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.06 }}
            className="flex flex-col flex-grow min-h-0"
          >
              {activeTab === "layout" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.layout) && (
                  <LayoutTab
                    initialStore={layoutTabFilters?.store}
                    initialLocation={layoutTabFilters?.location}
                    initialProjectCode={layoutTabFilters?.projectCode}
                    onClearFocus={() => setLayoutTabFilters(null)}
                    onBackToGantt={() => {
                      if (layoutTabFilters?.sourceTaskId) {
                        setGanttTabFocusTaskId(layoutTabFilters.sourceTaskId);
                      } else {
                        setGanttTabFocusTaskId("");
                      }
                      handleTabChange("gantt");
                    }}
                  />
                )}

              {activeTab === "summary" &&
                (currentUser.role === "admin" ||
                  permissionMatrix[userRole]?.See?.summary ||
                  permissionMatrix[userRole]?.See?.report) && (
                  <SummaryTab />
                )}

              {activeTab === "general" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.general) && (
                  <GeneralTab
                    onProjectClick={(p) => {
                      setQuickNavTarget({ project: p });
                    }}
                  />
                )}

              {activeTab === "detail" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.detail) && (
                  <Profiler id="DetailTab" onRender={onRenderCallback}>
                    <DetailTab
                      initialFilterCode={detailTabFilterCode}
                      initialStoreFilter={globalStoreFilter}
                      initialFocusTaskId={detailTabFocusTaskId}
                      returnScrollId={detailReturnScrollId}
                      onClearFocus={() => {
                        setDetailReturnScrollId(detailTabFocusTaskId);
                        setDetailTabFocusTaskId("");
                      }}
                      onBackToGantt={() => {
                        setDetailReturnScrollId(detailTabFocusTaskId);
                        setDetailTabFocusTaskId("");
                        setDetailTabFilterCode("");
                        handleTabChange("gantt");
                      }}
                      onAddProject={() => {
                        setEditingProject(null);
                        setIsReadOnlyModal(false);
                        setModalInitialTab("details");
                        setIsProjectModalOpen(true);
                      }}
                      onAddTask={(p) => {
                        if (!isAppReadyRef.current) return;
                        const safeP = p || (projects && projects.length > 0 ? projects[0] : null);
                        setPrefillProjectCode(safeP?.code || "");
                        setPrefillProjectYear(safeP?.year || null);
                        setPrefillProjectStore(safeP?.store || null);
                        setEditingTask(null);
                        setIsReadOnlyModal(false);
                        setModalInitialTab("details");
                        setIsTaskModalOpen(true);
                      }}
                      onEditProject={(p, isReadOnly, initialTab) => {
                        setEditingProject(p);
                        setIsReadOnlyModal(isReadOnly || false);
                        setModalInitialTab((initialTab as "details" | "chat") || "details");
                        setIsProjectModalOpen(true);
                      }}
                      onEditTask={(t, isReadOnly, initialTab) => {
                        setEditingTask(t);
                        setIsReadOnlyModal(isReadOnly || false);
                        setModalInitialTab((initialTab as "details" | "chat") || "details");
                        setIsTaskModalOpen(true);
                      }}
                      onNavigateToDelegation={(groupId, sourceTaskId) => {
                        if (sourceTaskId) setDetailReturnScrollId(sourceTaskId);
                        handleTabChange("taskDelegation");
                        setTimeout(() => {
                          window.dispatchEvent(
                            new CustomEvent("taka_open_delegation_group", {
                              detail: { groupId },
                            }),
                          );
                        }, 400);
                      }}
                    />
                  </Profiler>
                )}

              {activeTab === "calendar" &&
                (currentUser.role === "admin" ||
                  permissionMatrix[userRole]?.See?.calendar ||
                  permissionMatrix[userRole]?.See?.report) && (
                  <CalendarTab
                    onEditTask={(t, isReadOnly) => {
                      setEditingTask(t);
                      setIsReadOnlyModal(isReadOnly || false);
                      setModalInitialTab("details");
                      setIsTaskModalOpen(true);
                    }}
                    onEditProject={(p, isReadOnly) => {
                      setEditingProject(p);
                      setIsReadOnlyModal(isReadOnly || false);
                      setModalInitialTab("details");
                      setIsProjectModalOpen(true);
                    }}
                  />
                )}

              {activeTab === "gantt" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.report) && (
                  <Profiler id="GanttTab" onRender={onRenderCallback}>
                    <div className="flex flex-col flex-grow min-h-0">
                      <GanttTab
                        initialFocusTaskId={ganttTabFocusTaskId}
                        onClearFocus={() => setGanttTabFocusTaskId("")}
                        onNavigateToLayout={handleNavigateToLayout}
                        onNavigateToTaskDetail={handleNavigateToTaskDetail}
                      />
                    </div>
                  </Profiler>
                )}

              {activeTab === "budget" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.budget) && (
                  <BudgetTab
                    initialSearchTerm={budgetTabSearchTerm}
                    onGoToCost={(code) => {
                      setCostTabSearchTerm(code ? String(code).replace(/["']/g, '').trim() : "");
                      handleTabChange("cost");
                    }}
                  />
                )}

              {activeTab === "taskDelegation" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.taskDelegation) && (
                  <TaskDelegationTab
                    onBackFromFocus={() => {
                      if (tabHistory.length > 0) {
                        const prev = tabHistory[tabHistory.length - 1];
                        setTabHistory((h) => h.slice(0, -1));
                        setActiveTab(prev);
                      } else {
                        setActiveTab("detail");
                      }
                    }}
                  />
                )}

              {activeTab === "taskDelegationCalendar" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.taskDelegation) && (
                  <DelegationCalendarTab
                    groups={visibleDelegationGroups}
                    onTabChange={handleTabChange}
                  />
                )}

              {activeTab === "cost" &&
                (currentUser.role === "admin" || permissionMatrix[userRole]?.See?.costDetail) && (
                  <CostTab
                    initialSearchTerm={costTabSearchTerm}
                    onGoToBudget={(code) => {
                      setBudgetTabSearchTerm(code);
                      handleTabChange("budget");
                    }}
                  />
                )}

              {activeTab === "accControl" && (
                <AccControlTab
                  users={appUsers}
                  locationVisibility={locationVisibility}
                  onEditUser={(u) => {
                    setEditingUser(u);
                    setIsUserModalOpen(true);
                  }}
                  onAddUser={() => {
                    setEditingUser(null);
                    setIsUserModalOpen(true);
                  }}
                />
              )}

              {activeTab === "notification" &&
                (currentUser.role === "admin" || currentUser.notification !== false) && (
                  <NotificationTab
                    activeNotifications={activeNotifications}
                    readNotifs={readNotifs}
                    filterId={notificationFilterId}
                    initialStatusFilter={unreadCount > 0 ? "unread" : "all"}
                    onClearFilter={() => setNotificationFilterId(null)}
                    onRequestPermission={handleRequestPermission}
                    onTogglePushEnabled={notifActions.onTogglePushEnabled}
                    onToggleRead={notifActions.onToggleRead}
                    onMarkAllRead={() => notifActions.onMarkAllRead(activeNotifications)}
                    onActionAgree={notifActions.onActionAgree}
                    onActionReject={notifActions.onActionReject}
                    onQuickCompleteTask={notifActions.onQuickCompleteTask}
                    onSnoozeNotif={notifActions.onSnoozeNotif}
                    onClearStaleNotifs={() => notifActions.onClearStaleNotifs(activeNotifications)}
                    onNotificationClick={(notif) => {
                      notifActions.onNotificationClick(notif);

                      if (notif.targetId && notif.targetType) {
                        if (notif.targetType === "notification") {
                          setNotificationFilterId(notif.targetId);
                          handleTabChange("notification");
                          return;
                        }

                        const canSeeLayout = currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.layout;
                        const combinedProjects = (projects && projects.length > 0) ? projects : (useAppStore.getState().allProjectsForNotifs || []);
                        const combinedTasks = (tasks && tasks.length > 0) ? tasks : (useAppStore.getState().allTasksForNotifs || []);
                        const layoutMatch = canSeeLayout ? findProjectLayoutUnit(notif, combinedProjects, combinedTasks) : null;

                        if (canSeeLayout && layoutMatch) {
                          const targetYear = layoutMatch.year || (layoutMatch.project?.year ? String(layoutMatch.project.year) : (notif.projectYear ? String(notif.projectYear) : ''));
                          if (targetYear && targetYear !== globalYearFilter && targetYear !== 'all') {
                            setGlobalYearFilter(targetYear);
                          }
                          const targetStore = layoutMatch.store || notif.projectStore || 'HCM';
                          if (targetStore && targetStore !== 'all') {
                            setGlobalStoreFilter(targetStore);
                          }
                          const targetLocation = layoutMatch.location || 'L1';
                          if (targetLocation && targetLocation !== 'ALL') {
                            useAppStore.getState().setGlobalLocationFilter([targetLocation]);
                          }

                          const targetUnitCode = layoutMatch.unitCode || layoutMatch.project?.code || notif.projectCode || (notif.title && notif.title.includes(' - ') ? notif.title.split(' - ')[0].trim() : '');

                          setLayoutTabFilters({
                            store: targetStore,
                            location: targetLocation,
                            projectCode: targetUnitCode,
                            sourceTaskId: layoutMatch.task?.id,
                          });

                          handleTabChange("layout");

                          if (layoutMatch.isComment) {
                            if (layoutMatch.isTaskComment && layoutMatch.task) {
                              setEditingTask(layoutMatch.task);
                              setIsReadOnlyModal(false);
                              setModalInitialTab("chat");
                              setIsTaskModalOpen(true);
                            } else if (layoutMatch.project) {
                              setEditingProject(layoutMatch.project);
                              setIsReadOnlyModal(false);
                              setModalInitialTab("chat");
                              setIsProjectModalOpen(true);
                            }
                          }
                          return;
                        }

                        if (notif.targetType === "task_delegation") {
                          handleTabChange("detail");
                          const targetProject =
                            layoutMatch?.project ||
                            combinedProjects.find(
                              (p) =>
                                (notif.projectCode && p.code?.toLowerCase() === notif.projectCode.toLowerCase()) ||
                                String(p.id) === String(notif.targetId) ||
                                String(p.no) === String(notif.targetId)
                            );

                          if (targetProject) {
                            setEditingProject(targetProject);
                            setIsReadOnlyModal(false);
                            setModalInitialTab("chat");
                            setIsProjectModalOpen(true);
                          } else if (layoutMatch?.task) {
                            setEditingTask(layoutMatch.task);
                            setIsReadOnlyModal(false);
                            setModalInitialTab("chat");
                            setIsTaskModalOpen(true);
                            return;
                          }
                        }

                        executeDeepLinkRef.current?.(
                          notif.targetType,
                          notif.targetId,
                          {
                            store: notif.projectStore,
                            year: String(notif.projectYear),
                            code: notif.projectCode,
                          }
                        );
                      }
                    }}
                  />
                )}

              {activeTab === "setting" && (
                <SettingTab rules={notificationRules} />
              )}

              {activeTab === "manual" && (
                <ManualTab />
              )}

              {activeTab === "audit" && (currentUser.role === "admin" || (permissionMatrix[userRole]?.See as any)?.audit) && (
                <AuditLogTab />
              )}

              {activeTab === "csv_export" && (currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.importCsv || !!permissionMatrix[userRole]?.Write?.importCsv) && (
                <CsvExportTab />
              )}

              {activeTab === "picture_mapping" && (currentUser.role === "admin" || !!permissionMatrix[userRole]?.See?.pictureMapping || !!permissionMatrix[userRole]?.Write?.pictureMapping) && (
                <PictureMappingTab />
              )}
            </motion.div>
        </Suspense>
      </TabErrorBoundary>
    </div>
  );
});
