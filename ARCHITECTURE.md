# Taka-PM System Architecture & Quick Lookup Guide

> 📌 **MỤC ĐÍCH**: Bản đồ kiến trúc kỹ thuật dành cho AI Agent và Developer để định vị nhanh file submodule (`*Parts/`), tái sử dụng các hàm có sẵn trong `src/lib/` & `src/hooks/`, và tuyệt đối chống viết lại code trùng lặp.
> 📖 **QUY TẮC & KỶ LUẬT TÁC NGHIỆP**: Xem chi tiết tại **`AGENTS.md`** (4 Nguyên tắc cốt lõi, Quy trình 3 bước, Cô lập 4 khóa định danh, Local-First & Delta Sync) và **`src/api-contracts.ts`** (Từ điển Types, Zustand Store & chữ ký hàm API).

---

## 1. Sơ Đồ Kiến Trúc Local-First 4 Tầng (4-Layer Data & Sync Pipeline)

Hệ thống hoạt động theo mô hình **Local-First 4 Tầng** với độ trễ phản hồi UI 0ms (chi tiết quy tắc đọc/ghi/reconcile xem tại `AGENTS.md` Mục 3, 14, 15, 16):

```
[UI Layer (React 19 + Tailwind + Lucide)]
       ▲                     │  (Optimistic Mutate 0ms)
       │ (Atomic Selectors)  ▼
[Layer 1: Zustand Store (`src/store/useAppStore.ts`)]
       ▲                     │  (Async Mirror setTimeout 0)
       │ (Bootstrap 5-10ms)  ▼
[Layer 2: Local Database (`src/lib/localDb.ts` - Dexie.js / IndexedDB)]
       ▲                     │  (Write via `firestoreWrites.ts`)
       │ (Realtime Deltas)   ▼
[Layer 3: Delta Pipeline (`taka_deltas` + `autoDeltaQueue.ts` + `syncQueue.ts`)]
       ▲                     │  (Batch Writes / Atomic Increments)
       │ (onSnapshot Cursor) ▼
[Layer 4: Cloud Backend (Google Firestore + Firebase Storage / Cloudflare R2)]
```

---

## 2. Danh Mục Core Services & Utils (`src/lib/`) — Chống Viết Lại Hàm Trùng Lặp

> ⛔ **CẤM VIẾT LẠI**: Trước khi viết logic xử lý dữ liệu, bắt buộc kiểm tra và import từ các file dưới đây:

### 2.1. Thao Tác Task & Project (State, Rollup, Xóa)
| File | Hàm Quan Trọng | Mô Tả & Nghiệp Vụ |
| :--- | :--- | :--- |
| `src/lib/taskStateService.ts` | `saveTaskStateUnified`, `deleteTaskUnified`, `reorderTaskOrderIndex` | Thao tác CRUD task đồng bộ giữa Zustand, Dexie, Firestore và phát delta tự động. |
| `src/lib/taskStateParts/taskDeletionService.ts` | `deleteTaskUnified` | Xóa task, cập nhật orderIndex, dọn dẹp quan hệ phụ thuộc và lưu vết delta. |
| `src/lib/taskStateParts/projectDeletionService.ts` | `deleteProjectStateUnified` | Xóa dự án cascade (kèm toàn bộ tasks, costs, delegations), ghi delta `delete`. |
| `src/lib/projectDatesService.ts` | `calculateProjectComputedDates`, `matchProjectCode` | Tính toán tự động Start, Finish, % Tiến độ dự án từ task con; so khớp composite key. |
| `src/lib/taskRollupService.ts` | `calculateProjectRollupDates`, `calculateTaskParentRollup` | Tính rollup ngày bắt đầu/kết thúc và thời lượng cho task mẹ trong bộ nhớ client. |
| `src/lib/taskDeduplicationService.ts` | `resolveProjectContext`, `deduplicateTasks` | Chuẩn hóa và đối chiếu composite key (Code + Year + Store + Id), chống trùng lặp. |
| `src/lib/taskDeletedTracker.ts` | `markTasksDeleted`, `isTaskMarkedDeleted` | Bộ nhớ đệm chặn snapshot cũ hồi sinh lại task vừa xóa (Zombie protection). |
| `src/lib/taskImportService.ts` | `executeTaskImport`, `validateImportTasks` | Phân tích và nhập task hàng loạt từ Excel/CSV/JSON. |

### 2.2. Tài Chính & Ngân Sách (Financial & Budget)
| File | Hàm Quan Trọng | Mô Tả & Nghiệp Vụ |
| :--- | :--- | :--- |
| `src/lib/financialAtomicService.ts` | `saveCostWithAtomicSummary`, `deleteCostWithAtomicSummary` | Ghi chi phí dùng dot-notation (`financial.byStore...` + `increment()`), chống conflict. |
| `src/lib/financialService.ts` | `calculateProjectFinancials`, `aggregateCostSummary` | Tính toán chi phí thực tế, dự toán, phí hỗ trợ và số tiền còn lại của dự án. |
| `src/lib/budgetTreeService.ts` | `buildBudgetTree`, `linkProjectBudget` | Xây dựng cây dự án cha - con phục vụ phân bổ và liên kết ngân sách (Link Budget). |
| `src/lib/aggregationService.ts` | `aggregateProjectsData` | Tổng hợp chỉ số tài chính, tiến độ theo chi nhánh Store và năm tài chính. |

### 2.3. Gantt & Phụ Thuộc (Dependencies & Predecessors)
| File | Hàm Quan Trọng | Mô Tả & Nghiệp Vụ |
| :--- | :--- | :--- |
| `src/lib/ganttUtils.ts` | `calculateGanttSchedule`, `buildGanttDependencies` | Điều phối tổng thể timeline, tọa độ thanh bar và quan hệ phụ thuộc Gantt. |
| `src/lib/ganttUtilsParts/scheduleAndReorderEngine.ts` | `cascadeTaskDates`, `recalculatePredecessors` | Đẩy lùi/kéo tiến ngày của chuỗi task phụ thuộc khi task tiền nhiệm thay đổi ngày. |
| `src/lib/ganttUtilsParts/predecessorParsingUtils.ts` | `parsePredecessors`, `formatPredecessors` | Phân tích cú pháp quan hệ (`FS`, `SS`, `FF`, `SF` kèm offset ngày `+2d`, `-1d`). |
| `src/lib/ganttUtilsParts/predecessorHealingAndConversion.ts` | `healPredecessorCode`, `convertMinusToHash` | Tự động sửa mã task tiền nhiệm bị lỗi định dạng hoặc chuyển đổi `-` sang `#`. |
| `src/lib/parentTaskPredecessorService.ts` | `syncParentPredecessors` | Đồng bộ quan hệ phụ thuộc giữa các task thuộc nhiều dự án khác nhau. |
| `src/lib/predecessorMatchUtils.ts` | `resolvePredecessorString` | So khớp mã task tiền nhiệm theo mã dự án và số thứ tự task. |

### 2.4. Đồng Bộ, Hạ Tầng & Tiện Ích Giao Diện (Sync, Cache, Storage, UI)
| File | Hàm Quan Trọng | Mô Tả & Nghiệp Vụ |
| :--- | :--- | :--- |
| `src/lib/firestoreWrites.ts` | `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` | **BẮT BUỘC DÙNG**: Wrapper SDK Firestore tự phát delta `invalidate` qua `autoDeltaQueue`. |
| `src/lib/localDb.ts` | `localDb`, `getLocalProjects`, `getLocalTasks`, `bulkPersistTasks` | Cơ sở dữ liệu IndexedDB Dexie lưu trữ sơ cấp client. |
| `src/lib/backgroundSyncWorker.ts` | `bootstrapLocalStore`, `hydrateTasksFromLocal`, `hydrateTasksForProjects`, `hydrateDelegationsFromLocal` | Khởi tạo dữ liệu tức thì từ Dexie (0 Firestore Read) và đồng bộ nền không chặn UI. |
| `src/lib/deltaSyncService.ts` | `recordDelta`, `recordBatchDeltas`, `pullAndApplyDeltas` | Kéo và áp dụng các delta mutation mới nhất từ server vào local. |
| `src/lib/deltaRealtimeListener.ts` | `startDeltaRealtimeListener` | Listener duy nhất thời gian thực trên `taka_deltas` để nhận biến động từ máy khác. |
| `src/lib/syncQueue.ts` | `syncQueueManager`, `addPendingUpdate`, `processPendingSync` | Hàng đợi lưu trữ ngoại tuyến khi mất mạng hoặc server bận. |
| `src/lib/storageUtils.ts` | `extractStorageUrls`, `deleteStorageFiles` | Quét và xóa file mồ côi trên Firebase Storage khi xóa Task/Project. |
| `src/lib/r2StorageUtils.ts` | `uploadPictureToTakaFolder`, `deleteR2ImageCleanly`, `cleanOrphanR2Files` | Quản lý sao lưu và lưu trữ ảnh mặt bằng/file lớn trên Cloudflare R2. |
| `src/lib/imageCompression.ts` | `compressImageToWebp` | Nén ảnh phía client (max 1920px, webp/jpeg 0.82) trước khi tải lên Storage. |
| `src/lib/zIndexManager.ts` | `getZIndexValue`, `getZIndexClass` | Quản lý tập trung các tầng z-index toàn ứng dụng (`MODAL_MODULAR`, `DROPDOWN`...). |
| `src/lib/lazyWithRetry.ts` | `lazyWithRetry` | Dynamic import bọc cơ chế tự tải lại khi mất mạng hoặc có phiên bản code mới. |
| `src/lib/auditLogService.ts` | `recordAuditLog` | Ghi nhật ký kiểm toán Append-only vào `audit_logs` đối với biến động tiền và cấu hình. |
| `src/lib/unitSizeResolver.ts` | `getUnitEffectiveSizeM2`, `projectMatchesUnitCode` | Giải mã diện tích m² và ghép nối mã dự án với layout CAD/PDF. |
| `src/lib/shareTargetService.ts` | `consumeSharedInboxPayloads`, `saveSharedMediaToDexieAndR2`, `flushPendingSharedMediaQueue` | Xử lý Web Share Target API (nhận ảnh/text từ Zalo cả khi Offline), lưu vào Dexie `sharedMedia` và đồng bộ lên Cloudflare R2. |

---

## 3. Danh Mục Custom Hooks (`src/hooks/`)

| Hook | Đường Dẫn | Vai Trò & Tác Vụ |
| :--- | :--- | :--- |
| `useAppStore` / `useUISlice` / `useDataSlice` | `src/store/useAppStore.ts` | Quản lý toàn bộ State toàn cục (Data, UI, Optimistic) qua atomic/shallow selectors. |
| `useEnrichedData` | `src/hooks/useEnrichedData.ts` | Nối dữ liệu (join) trong bộ nhớ: kết hợp Project + Tasks + Costs + Locations thành các object giàu thuộc tính (Computed dates, progress, status). |
| `useFirebaseData` | `src/hooks/useFirebaseData.ts` | Orchestrator chính khởi chạy các hydration hooks theo nhu cầu (Tri-Gate). |
| `useProjectsHydration` | `src/hooks/useFirebaseDataParts/useProjectsHydration.ts` | Lắng nghe realtime `taka_projects` theo năm tài chính đang chọn. |
| `useTasksHydration` | `src/hooks/useFirebaseDataParts/useTasksHydration.ts` | Lắng nghe `taka_tasks` theo pool đa năm, chỉ bật khi `isTasksRequested = true`. |
| `useCostsHydration` | `src/hooks/useFirebaseDataParts/useCostsHydration.ts` | Lắng nghe `taka_costs`, chỉ kích hoạt khi `isCostsRequested = true`. |
| `useDelegationsHydration` | `src/hooks/useFirebaseDataParts/useDelegationsHydration.ts` | Lắng nghe `taka_delegation_groups`, chỉ bật khi `isDelegationsRequested = true`. |
| `useStaticAndAuthHydration`| `src/hooks/useFirebaseDataParts/useStaticAndAuthHydration.ts` | Khởi tạo Auth, thông tin phân quyền người dùng và bảng cấu hình `taka_config`. |
| `useDetailTaskReorder` | `src/hooks/useDetailTaskReorder.ts` | Kéo thả task trong bảng Detail: RAF throttled, auto-scroll rìa, giữ vững Edit Mode. |
| `useDetailPredecessorSync`| `src/hooks/useDetailPredecessorSync.ts` | Kiểm tra tính hợp lệ và tự động cập nhật ngày khi gõ tiền nhiệm trong DetailTab. |
| `useTableVirtualizer` | `src/hooks/useTableVirtualizer.ts` | Ảo hóa dòng cho bảng lớn bằng binary search, tối ưu scroll 60 FPS. |
| `useGanttDragDrop` | `src/hooks/useGanttDragDrop.ts` | Kéo thả thanh bar, chỉnh sửa ngày bắt đầu/kết thúc trực tiếp trên timeline Gantt. |
| `useDeepLinkLogic` | `src/hooks/useDeepLinkLogic.ts` | Bóc tách URL params (`?tab=...&proj=...`) để tự động mở đúng tab, store, year và modal. |
| `useTaskModalLogic` | `src/hooks/useTaskModalLogic.ts` | Quản lý form state, validation, tiền nhiệm và submit cho TaskModal. |
| `useNotificationActions` | `src/hooks/useNotificationActions.ts` | Đánh dấu đã đọc, xóa thông báo và điều hướng đến đối tượng tương ứng. |
| `useOffscreenImage` | `src/hooks/useOffscreenImage.ts` | Tải và giải mã trước ảnh mặt bằng nặng trong bộ nhớ nền trước khi vẽ lên canvas Konva. |

---

## 4. Bản Đồ Điều Hướng Tính Năng (Feature-to-File Routing Table)

```
src/components/
├── <TabName>.tsx             <- Orchestrator Container (dưới 400 dòng, chỉ đọc state & truyền props)
└── <TabName>Parts/           <- Toàn bộ Sub-components, Sub-modals & Hooks độc lập (< 500 dòng/file)
    ├── <TabName>FilterToolbar.tsx   (Thanh công cụ, bộ lọc, tìm kiếm, Fix Project, xuất/nhập)
    ├── <TabName>TableView.tsx       (Giao diện View chính: Bảng/Lưới/Cây/Kanban)
    ├── <TabName>MobileView.tsx      (Giao diện tối ưu di động iOS/Android)
    ├── <TabName>RowItem.tsx         (Hàng dữ liệu con bọc React.memo)
    ├── <TabName>Modal.tsx           (Modal phụ bọc React.lazy & JIT Mounting)
    ├── <tabName>Types.ts            (Type/Interface riêng của module)
    └── use<TabName>Data.ts          (Custom Hook xử lý tính toán/memo/filter)
```

| TabId | Phân Hệ | File Container Chính | Submodules & Hooks Chính Cần Mở | Modals / Dialogs Liên Quan |
| :--- | :--- | :--- | :--- | :--- |
| `general` | Tổng quan dự án | `src/components/GeneralTab.tsx` | `GeneralTabParts/ProjectTableView.tsx`, `GeneralFilterToolbar.tsx`, `useGeneralData.ts` | `ProjectModal`, `ProjectQuickNavModal`, `ShareTargetModal` |
| `myWork` | Việc của tôi (My Work) | `src/components/MyWorkTab.tsx` | `MyWorkTabParts/MyWorkHeader.tsx`, `MyWorkKanbanView.tsx`, `MyWorkStreamView.tsx`, `MyWorkRowItem.tsx`, `useMyWorkData.ts`, `myWorkDataBuilders.ts`, `myWorkMutationService.ts`, `myWorkAccountSync.ts` | `TaskModal`, `ProjectModal`, `CalendarSyncModal` |
| `detail` | Chi tiết công việc | `src/components/DetailTab.tsx` | `DetailTabParts/DetailTableView.tsx`, `DetailFilterToolbar.tsx`, `DetailMobileView.tsx`, `detailTaskMoveService.ts`, `useDetailData.ts`, `useDetailFilterSync.ts`, `useDetailTaskReorder.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal`, `TaskModularModal`, `FullReplaceImport` |
| `gantt` | Biểu đồ tiến độ Gantt | `src/components/GanttTab.tsx` | `Gantt/GanttTableView.tsx`, `GanttTimeline.tsx`, `GanttProjectRow.tsx`, `GanttTaskRow.tsx`, `GanttTaskEditableColumns.tsx`, `useGanttProjectsFilter.ts`, `useGanttRowVirtualizer.ts`, `useGanttDependencies.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal` |
| `calendar` | Lịch tiến độ công việc | `src/components/CalendarTab.tsx` | `CalendarTabParts/CalendarMonthlyView.tsx`, `useCalendarEvents.ts` | `CalendarSyncModal`, `TaskModal` |
| `budget` | Quản lý ngân sách | `src/components/BudgetTab.tsx` | `BudgetParts/BudgetTableView.tsx`, `BudgetFilterToolbar.tsx`, `BudgetTreeRow.tsx`, `useBudgetData.ts`, `useBudgetFilterSort.ts` | `BudgetLinkModal` (kèm `BudgetLinkParentColumn.tsx`, `BudgetLinkChildColumn.tsx`) |
| `cost` | Chi phí thực tế | `src/components/CostTab.tsx` | `CostParts/CostTableView.tsx`, `CostFilterToolbar.tsx`, `useCostData.ts`, `useCostSearchFilter.ts` | `CostItemModal`, `CostExportModal` |
| `layout` | Mặt bằng CAD / Kỹ thuật | `src/components/LayoutTab.tsx` | `LayoutTabParts/LayoutCanvasViewport.tsx`, `LayoutUnitSidebar.tsx`, `LayoutFilterToolbar.tsx`, `useLayoutGestures.ts`, `layoutDataAggregator.ts` | `LayoutUnitLightboxModal`, `LayoutMiniGanttModal`, `ShareTargetModal` |
| `picture_mapping` | Ánh xạ sơ đồ hình ảnh | `src/components/PictureMappingTab.tsx` | `PictureMapping/components/DataMapping/EditTab.tsx`, `DynamicHierarchyTab.tsx`, `ReviewTab.tsx`, `EditTabParts/EditTabInspector.tsx`, `DynamicHierarchyParts/DynamicGroupCard.tsx`, `DynamicHierarchyCsvService.ts`, `DynamicCsvGuideModal.tsx` | `EditTabInspector`, `DynamicCsvGuideModal`, `ReviewTab` |
| `summary` | Báo cáo tóm tắt | `src/components/SummaryTab.tsx` | `SummaryParts/SummaryMetricsCard.tsx`, `SummaryFilterToolbar.tsx` | `SummaryExportModal` |
| `taskDelegation` | Phân công ủy quyền | `src/components/TaskDelegationTab.tsx`| `TaskDelegationParts/DelegationTableView.tsx`, `DelegationParts/DelegationCard.tsx` | `DelegationGroupModal`, `DelegationTaskModal` |
| `taskDelegationCalendar`| Lịch ủy quyền | `src/components/DelegationCalendarTab.tsx`| `DelegationCalendarParts/DelegationCalendarGrid.tsx` | `DelegationDetailModal` |
| `notification` | Trung tâm thông báo | `src/components/NotificationTab.tsx`| `NotificationParts/NotificationList.tsx`, `NotificationItem.tsx` | `NotificationDetailModal` |
| `accControl` | Quản lý truy cập / User | `src/components/AccControlTab.tsx` | `AccControlTabParts/UserTable.tsx`, `RoleMatrixView.tsx` | `UserModal` |
| `audit` | Nhật ký kiểm toán | `src/components/AuditLogTab.tsx` | `AuditLogParts/AuditLogTable.tsx`, `AuditLogFilterToolbar.tsx` | `AuditDiffViewerModal` |
| `setting` | Cấu hình & Backup | `src/components/SettingTab.tsx` | `SettingTabParts/SystemConfigPanel.tsx`, `DataBackupPanel.tsx` | `ProjectLinksImagesManagerModal`, `FirestoreSummarizedExportModal`, `DesktopOptimizationModal` |
| `csv_export` | Xuất nhập file | `src/components/CsvExportTab.tsx` | `CsvExportParts/ExportPreviewTable.tsx` | `CsvImportModal` |
| `manual` | Hướng dẫn sử dụng | `src/components/ManualTab.tsx` | `FaqBot/FaqChatWindow.tsx`, `FaqKnowledgeViewer.tsx` | `FaqChatbotModal` |

