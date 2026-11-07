# Taka-PM System Architecture & Quick Lookup Map

> 📌 **PURPOSE**: Fast lookup map for `*Parts/` submodules, `src/lib/` services, and `src/hooks/`. **Never duplicate existing functions.**
> ⚡ **MAINTENANCE**: Preserve 100% module/function accuracy in **Telegraphic Imperative English** to minimize token usage.

## 1. 4-Layer Local-First Pipeline (0ms UI Latency)
`UI (React 19)` ⇄ `Layer 1: Zustand (useAppStore.ts, 0ms)` ⇄ `Layer 2: Dexie IDB (localDb.ts, 5-10ms boot)` ⇄ `Layer 3: Delta Pipeline (taka_deltas + autoDeltaQueue.ts + syncQueue.ts)` ⇄ `Layer 4: Cloud (Firestore + Storage / R2)`

## 2. Core Services & Utils (`src/lib/`) — Reuse Mandatory

### 2.1. Task & Project State, Rollup & Deletion
| File | Key Exports | Purpose |
| :--- | :--- | :--- |
| `src/lib/taskStateService.ts` | `saveTaskStateUnified`, `deleteTaskStateUnified`, `reorderTasksStateUnified`, `ensureProjectTasksLoaded`, `syncAffectedProjects` | Unified task CRUD across Zustand, Dexie, Firestore + auto delta. |
| `src/lib/taskStateParts/taskDeletionService.ts` | `deleteTaskUnified` | Delete tasks, reindex `orderIndex`, clean dependencies, emit delta. |
| `src/lib/taskStateParts/projectDeletionService.ts` | `deleteProjectStateUnified` | Cascade delete project + tasks/costs/delegations + emit delta. |
| `src/lib/projectDatesService.ts` | `calculateProjectComputedDates`, `getTasksForProject`, `syncProjectDatesToFirestore`, `matchProjectCode` | Compute project dates/progress/`taskSummaries` & 4-key matching. |
| `src/lib/taskRollupService.ts` | `calculateProjectRollupDates`, `calculateTaskParentRollup` | In-memory parent task & project date/duration rollup. |
| `src/lib/taskRollupHelpers.ts` | `rollupTaskSummaries` | Deduplicate and roll up parent/child `taskSummaries`. |
| `src/lib/taskDeduplicationService.ts` | `resolveProjectContext`, `deduplicateTasks`, `deduplicateTasksInMemory` | 4-key composite matching (`projectId`+`code`+`year`+`store`) & dedup. |
| `src/lib/taskDeletedTracker.ts` | `markTasksDeleted`, `unmarkTaskDeleted`, `isTaskDeletedInTracker` | Block stale snapshots from resurrecting deleted tasks/projects. |
| `src/lib/taskImportService.ts` | `executeTaskImport`, `validateImportTasks` | Bulk Excel/CSV/JSON task validation & import. |
| `src/lib/taskInlineUpdateService.ts` | `executeUnifiedTaskUpdate` | Inline task update with predecessor cascade & project rollup. |
| `src/lib/undoManager.ts` & `undoStateHelpers.ts` | `undoManager`, `restoreTasksSnapshot`, `restoreProjectsSnapshot`, `restoreCostsSnapshot` | Global Undo/Redo batch stack and snapshot restoration. |

### 2.2. Financial & Budget Services
| File | Key Exports | Purpose |
| :--- | :--- | :--- |
| `src/lib/financialAtomicService.ts` | `saveCostWithAtomicSummary`, `deleteCostWithAtomicSummary` | Atomic cost writes (`financial.byStore...` + `increment()`). |
| `src/lib/financialService.ts` | `calculateProjectFinancials`, `aggregateCostSummary` | Compute budget, approved, actual, forecast, fee, and balance. |
| `src/lib/budgetTreeService.ts` | `buildBudgetTree`, `linkProjectBudget` | Build parent-child project tree for Budget Linking. |
| `src/lib/aggregationService.ts` | `aggregateProjectsData` | Aggregate financial & progress metrics by Store and Year. |

### 2.3. Gantt & Predecessor Engine
| File | Key Exports | Purpose |
| :--- | :--- | :--- |
| `src/lib/ganttUtils.ts` | `calculateGanttSchedule`, `buildGanttDependencies` | Gantt timeline coordinates and dependency links. |
| `src/lib/ganttUtilsParts/scheduleAndReorderEngine.ts` | `cascadeTaskDates`, `recalculatePredecessors`, `isCyclic` | Cascade dependent task dates & detect cycles. |
| `src/lib/ganttUtilsParts/predecessorParsingUtils.ts` | `parsePredecessors`, `formatPredecessors` | Parse/format `FS`, `SS`, `FF`, `SF` with `+2d`/`-1d` lag. |
| `src/lib/ganttUtilsParts/predecessorHealingAndConversion.ts` | `healPredecessorCode`, `convertMinusToHash` | Auto-heal predecessor codes and convert `-` to `#`. |
| `src/lib/parentTaskPredecessorService.ts` | `syncParentPredecessors` | Sync cross-project/parent task predecessors. |
| `src/lib/predecessorMatchUtils.ts` | `resolvePredecessorString` | Resolve predecessor strings by project code and `#index`. |

### 2.4. Sync, LocalDB, Storage, Audit & UI Infrastructure
| File | Key Exports | Purpose |
| :--- | :--- | :--- |
| `src/lib/firestoreWrites.ts` | `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` | **MANDATORY** Firestore write wrappers triggering `autoDeltaQueue.ts`. |
| `src/lib/localDb.ts` | `localDb`, `getLocalProjects`, `getLocalTasks`, `bulkPersistTasks`, `bulkPersistProjects` | Primary Dexie IndexedDB storage & non-blocking persistence. |
| `src/lib/backgroundSyncWorker.ts` | `bootstrapLocalStore`, `hydrateTasksFromLocal`, `hydrateTasksForProjects`, `hydrateDelegationsFromLocal` | 5–10ms Dexie cold-boot hydration (0 Firestore reads) & background sync. |
| `src/lib/deltaSyncService.ts` | `recordDelta`, `recordBatchDeltas`, `pullAndApplyDeltas`, `applyIncomingDeltas` | Pull, filter, and apply server deltas into Zustand & Dexie. |
| `src/lib/deltaRealtimeListener.ts` | `startDeltaRealtimeListener` | Single realtime `onSnapshot` listener on `taka_deltas` (`serverTime`). |
| `src/lib/syncResilience.ts` | `waitForNetworkRecovery`, `resetStalledFirestoreConnection`, `installSyncResilienceWatchers` | Overnight sleep/wake (>60s gap) & stalled socket recovery. |
| `src/lib/summaryAuditService.ts` | `runSummaryAudit`, `repairServerSummaries`, `repairLocalDevice`, `purgeExcessFirestoreTasks` | 3-way cross-audit & auto-heal (`taka_tasks` ⇄ `taskSummaries` ⇄ Local). |
| `src/lib/syncQueue.ts` | `syncQueueManager`, `addPendingUpdate`, `processPendingSync` | Offline mutation queue with auto-retry on reconnect. |
| `src/lib/storageUtils.ts` | `extractStorageUrls`, `deleteStorageFiles` | Purge orphan Firebase Storage files on entity delete. |
| `src/lib/r2StorageUtils.ts` | `uploadPictureToTakaFolder`, `deleteR2ImageCleanly`, `cleanOrphanR2Files` | Cloudflare R2 image upload, deletion, and orphan cleanup. |
| `src/lib/imageCompression.ts` | `compressImageToWebp` | Client-side WebP/JPEG compression (max 1920px, 0.82) before upload. |
| `src/lib/zIndexManager.ts` | `getZIndexValue`, `getZIndexClass`, `useOverlayStack` | Centralized z-index stacking (`MODAL_BASE`, `MODAL_MODULAR`...). |
| `src/lib/lazyWithRetry.ts` | `lazyWithRetry` | Dynamic `React.lazy` wrapper with chunk-reload retry. |
| `src/lib/auditLogService.ts` | `recordAuditLog` | Append-only financial & RBAC audit logging (`audit_logs`). |
| `src/lib/unitSizeResolver.ts` | `getUnitEffectiveSizeM2`, `projectMatchesUnitCode` | Resolve unit m² area and match project codes to CAD/PDF units. |

## 3. Custom Hooks (`src/hooks/`)
| Hook | Path | Purpose |
| :--- | :--- | :--- |
| `useAppStore` / `useUISlice` / `useDataSlice` | `src/store/useAppStore.ts` | Global Zustand state via atomic/shallow selectors. |
| `useEnrichedData` | `src/hooks/useEnrichedData.ts` | In-memory join of Projects + Tasks + Costs + Locations. |
| `useFirebaseData` | `src/hooks/useFirebaseData.ts` | Tri-Gate hydration orchestrator (`useProjectsHydration`, `useTasksHydration`, `useCostsHydration`, `useDelegationsHydration`, `useStaticAndAuthHydration`). |
| `useDetailTaskReorder` | `src/hooks/useDetailTaskReorder.ts` | RAF-throttled drag-and-drop task reorder in DetailTab. |
| `useDetailPredecessorSync` | `src/hooks/useDetailPredecessorSync.ts` | Validate and cascade dates on inline predecessor edits. |
| `useTableVirtualizer` | `src/hooks/useTableVirtualizer.ts` | Binary-search row virtualizer for 60 FPS table scrolling. |
| `useGanttDragDrop` | `src/hooks/useGanttDragDrop.ts` | Interactive Gantt bar dragging & date resizing. |
| `useDeepLinkLogic` | `src/hooks/useDeepLinkLogic.ts` | Parse URL params (`?tab=...&proj=...`) to open target view/modal. |
| `useTaskModalLogic` | `src/hooks/useTaskModalLogic.ts` | Form state, validation, and predecessor calc for `TaskModal`. |
| `useNotificationActions` | `src/hooks/useNotificationActions.ts` | Mark read, dismiss, and navigate to notification targets. |
| `useOffscreenImage` | `src/hooks/useOffscreenImage.ts` | Background-decode floorplan images for Konva canvas. |

## 4. Feature-to-File Routing Table (`<TabName>.tsx` < 400 lines; `*Parts/` < 500 lines)
| TabId | Container | Key `*Parts/` Submodules & Hooks | Modals |
| :--- | :--- | :--- | :--- |
| `general` | `src/components/GeneralTab.tsx` | `GeneralTabParts/ProjectTableView.tsx`, `GeneralFilterToolbar.tsx`, `useGeneralData.ts` | `ProjectModal`, `ProjectQuickNavModal` |
| `myWork` | `src/components/MyWorkTab.tsx` | `MyWorkTabParts/MyWorkHeader.tsx`, `MyWorkKanbanView.tsx`, `MyWorkStreamView.tsx`, `MyWorkRowItem.tsx`, `useMyWorkData.ts`, `useMyWorkActions.ts`, `myWorkMutationService.ts` | `TaskModal`, `ProjectModal`, `CalendarSyncModal` |
| `detail` | `src/components/DetailTab.tsx` | `DetailTabParts/DetailTableView.tsx`, `DetailFilterToolbar.tsx`, `DetailMobileView.tsx`, `detailTaskMoveService.ts`, `detailTaskImportExecutor.ts`, `detailTaskImportProjectSync.ts`, `useDetailData.ts`, `useDetailTaskReorder.ts`, `StemLibrary/stemAutoWiringEngine.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal`, `TaskModularModal`, `FullReplaceImport`, `StemTaskLibraryModal`, `StemCapturePresetModal` |
| `gantt` | `src/components/GanttTab.tsx` | `Gantt/GanttTableView.tsx`, `GanttTimeline.tsx`, `GanttProjectRow.tsx`, `GanttTaskRow.tsx`, `GanttTaskEditableColumns.tsx`, `useGanttLinkDrag.ts`, `useGanttDependencies.ts`, `StemLibrary/stemScheduleCalculator.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal`, `StemTaskLibraryModal`, `StemCapturePresetModal` |
| `calendar` | `src/components/CalendarTab.tsx` | `CalendarTabParts/CalendarMonthlyView.tsx`, `useCalendarEvents.ts` | `CalendarSyncModal`, `TaskModal` |
| `budget` | `src/components/BudgetTab.tsx` | `BudgetParts/BudgetTableView.tsx`, `BudgetFilterToolbar.tsx`, `BudgetTreeRow.tsx`, `useBudgetData.ts`, `useBudgetFilterSort.ts` | `BudgetLinkModal` (`BudgetLinkParentColumn.tsx`, `BudgetLinkChildColumn.tsx`) |
| `cost` | `src/components/CostTab.tsx` | `CostParts/CostTableView.tsx`, `CostFilterToolbar.tsx`, `useCostData.ts`, `useCostSearchFilter.ts` | `CostItemModal`, `CostExportModal` |
| `layout` | `src/components/LayoutTab.tsx` | `LayoutTabParts/LayoutCanvasViewport.tsx`, `LayoutUnitSidebar.tsx`, `LayoutFilterToolbar.tsx`, `useLayoutGestures.ts`, `layoutDataAggregator.ts` | `LayoutUnitLightboxModal`, `LayoutMiniGanttModal` |
| `picture_mapping` | `src/components/PictureMappingTab.tsx` | `PictureMapping/components/DataMapping/EditTab.tsx`, `DynamicHierarchyTab.tsx`, `ReviewTab.tsx`, `EditTabParts/EditTabInspector.tsx`, `DynamicHierarchyParts/DynamicGroupCard.tsx`, `DynamicHierarchyCsvService.ts` | `EditTabInspector`, `DynamicCsvGuideModal`, `ReviewTab` |
| `summary` | `src/components/SummaryTab.tsx` | `SummaryParts/SummaryMetricsCard.tsx`, `SummaryFilterToolbar.tsx` | `SummaryExportModal` |
| `taskDelegation` | `src/components/TaskDelegationTab.tsx` | `TaskDelegationParts/DelegationTableView.tsx`, `DelegationParts/DelegationCard.tsx` | `DelegationGroupModal`, `DelegationTaskModal` |
| `taskDelegationCalendar` | `src/components/DelegationCalendarTab.tsx` | `DelegationCalendarParts/DelegationCalendarGrid.tsx` | `DelegationDetailModal` |
| `notification` | `src/components/NotificationTab.tsx` | `NotificationParts/NotificationList.tsx`, `NotificationItem.tsx` | `NotificationDetailModal` |
| `accControl` | `src/components/AccControlTab.tsx` | `AccControlTabParts/UserTable.tsx`, `RoleMatrixView.tsx` | `UserModal` |
| `audit` | `src/components/AuditLogTab.tsx` | `AuditLogParts/AuditLogTable.tsx`, `AuditLogFilterToolbar.tsx` | `AuditDiffViewerModal` |
| `setting` | `src/components/SettingTab.tsx` | `SettingTabParts/SystemConfigPanel.tsx`, `DataBackupPanel.tsx`, `SummaryAuditPanel.tsx`, `maintenanceHelpers.ts` | `ProjectLinksImagesManagerModal`, `FirestoreSummarizedExportModal`, `DesktopOptimizationModal` |
| `csv_export` | `src/components/CsvExportTab.tsx` | `CsvExportParts/CsvExportMappingTable.tsx`, `CsvExportPreviewSection.tsx`, `useCsvExportState.ts`, `csvExportHabitService.ts`, `csvExportProcessing.ts` | `CsvExportR2TemplateModal`, `CsvExportUnlockModal` |
| `manual` | `src/components/ManualTab.tsx` | `FaqBot/FaqChatWindow.tsx`, `FaqKnowledgeViewer.tsx` | `FaqChatbotModal` |


