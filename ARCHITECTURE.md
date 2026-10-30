# Taka-PM System Architecture & Quick Lookup Guide

> 📌 **MỤC ĐÍCH**: Bản đồ kiến trúc kỹ thuật dành cho AI Agent và Developer để định vị file submodule, tái sử dụng các hàm có sẵn trong `src/lib/` & `src/hooks/`, và tuyệt đối chống viết lại code trùng lặp.

---

## 1. Sơ đồ Luồng Dữ Liệu & Đồng Bộ (Data & Sync Pipeline)

Hệ thống hoạt động theo mô hình **Local-First 4 Tầng** với độ trễ phản hồi UI 0ms:

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

### 1.1. Luồng Đọc & Đồng Bộ Realtime (Read Pipeline)
1. **Cold Boot (5–10ms)**: `bootstrapLocalStore()` nạp dữ liệu từ Dexie.js vào Zustand ngay lập tức mà không chờ mạng, xóa bỏ hoàn toàn màn hình tải (loading spinner).
2. **Tri-Gate Lazy Fetching**: 3 cờ `isTasksRequested`, `isCostsRequested`, `isDelegationsRequested` chỉ kích hoạt Firestore listener khi người dùng mở tab tương ứng.
3. **Multi-Listener Pooling ("All Years")**: Quản lý listener từng năm qua `Map` pool, giữ kết nối Delta Sync, không ngắt khi chuyển năm cũ để Zero-Read từ cache.
4. **Realtime Delta Sync**: `deltaRealtimeListener.ts` lắng nghe collection `taka_deltas` theo `serverTime`. Khi phát hiện thay đổi từ thiết bị khác, hệ thống áp dụng nguyên tử vào Zustand và Dexie.
5. **Reconciliation (Triệt tiêu Task Ma - Bản vá 1L)**: Khi nhận Server Snapshot sạch (`!fromCache` & `!hasPendingWrites`), tự động đối chiếu loại trừ các task cục bộ không còn trên máy chủ (`buildZombieRemovalsForYear`). Có guard an toàn 30 giây (`RECENT_EDIT_GUARD_MS`) chống xóa nhầm task vừa tạo.
6. **Thức Giấc Qua Đêm (Overnight Wake-up & Sleep Resume Guard)**: Heartbeat gap detection phát hiện máy ngủ qua đêm (> 60s gap) để kích hoạt `pullAndApplyDeltas(undefined, true)`, kéo bù 100% biến động bị bỏ lỡ.

### 1.2. Luồng Ghi & Bảo Vệ Toàn Vẹn (Write Pipeline)
1. **Zero-Delay Optimistic (0ms)**: Cập nhật ngay vào Zustand, UI phản hồi lập tức.
2. **Local Storage Mirror**: Đồng bộ ngầm không chặn luồng chính (`setTimeout 0`) vào Dexie.js.
3. **Write Protection (BẮT BUỘC)**: Mọi thao tác ghi Firestore bắt buộc dùng wrapper `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` từ `src/lib/firestoreWrites.ts` để `autoDeltaQueue.ts` tự động phát sinh delta sang các thiết bị khác.
4. **Offline Queue Resilience**: Nếu mất mạng hoặc lỗi, tác vụ được lưu vào `src/lib/syncQueue.ts` và tự động retry khi kết nối trở lại.

### 1.3. Quy Chuẩn 4 Khóa Định Danh (Composite Key Isolation Standard)
- **4 trường bắt buộc**: Mọi bản ghi (Task, Project, Cost, Delegation) phải lưu đủ: `projectId`, `projectCode`, `year` (hoặc `projectYear`), và `store` (hoặc `projectStore`).
- **Thứ tự ưu tiên khi liên kết thực thể (`isTaskBelongsToProject`)**:
  1. Loại trừ bản ghi đã xóa (`isDeleted: true` hoặc nằm trong `taskDeletedTracker`).
  2. Khớp ID dự án (Ưu tiên #1): `task.projectId === project.id`. Nếu cả hai bên đều có ID nhưng khác nhau ➔ LẬP TỨC LOẠI TRỪ (`return false`).
  3. Khớp Chi nhánh Store (Ưu tiên #2): Chuẩn hóa `toLowerCase().trim()`. Khác store ➔ LẬP TỨC LOẠI TRỪ.
  4. Khớp Năm tài chính Year (Ưu tiên #3): Chuẩn hóa `String(year).trim()`. Khác năm ➔ LẬP TỨC LOẠI TRỪ.
  5. Fallback dữ liệu cũ: Chỉ khi thiếu `projectId` mới đối chiếu kết hợp `projectCode` + `store` + `year`.

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
| `src/lib/localDb.ts` | `localDb`, `bootstrapLocalStore`, `bulkPutLocal` | Cơ sở dữ liệu IndexedDB Dexie lưu trữ sơ cấp client. |
| `src/lib/deltaSyncService.ts` | `recordDelta`, `pullAndApplyDeltas` | Kéo và áp dụng các delta mutation mới nhất từ server vào local. |
| `src/lib/deltaRealtimeListener.ts` | `startDeltaRealtimeListener` | Listener duy nhất thời gian thực trên `taka_deltas` để nhận biến động từ máy khác. |
| `src/lib/syncQueue.ts` | `enqueueSyncItem`, `flushSyncQueue` | Hàng đợi lưu trữ ngoại tuyến khi mất mạng hoặc server bận. |
| `src/lib/storageUtils.ts` | `extractStorageUrls`, `deleteStorageFiles` | Quét và xóa file mồ côi trên Firebase Storage khi xóa Task/Project. |
| `src/lib/r2StorageUtils.ts` | `uploadToR2`, `deleteFromR2` | Quản lý sao lưu và lưu trữ ảnh mặt bằng/file lớn trên Cloudflare R2. |
| `src/lib/imageCompression.ts` | `compressImageFile` | Nén ảnh phía client (max 1920px, webp/jpeg 0.82) trước khi tải lên Storage. |
| `src/lib/zIndexManager.ts` | `getZIndexValue`, `getZIndexClass` | Quản lý tập trung các tầng z-index toàn ứng dụng (`MODAL_MODULAR`, `DROPDOWN`...). |
| `src/lib/lazyWithRetry.ts` | `lazyWithRetry` | Dynamic import bọc cơ chế tự tải lại khi mất mạng hoặc có phiên bản code mới. |
| `src/lib/auditLogService.ts` | `logAuditEvent` | Ghi nhật ký kiểm toán Append-only vào `audit_logs` đối với biến động tiền và cấu hình. |
| `src/lib/unitSizeResolver.ts` | `getUnitEffectiveSizeM2`, `projectMatchesUnitCode` | Giải mã diện tích m² và ghép nối mã dự án với layout CAD/PDF. |

---

## 3. Danh Mục Custom Hooks (`src/hooks/`)

| Hook | Đường Dẫn | Vai Trò & Tác Vụ |
| :--- | :--- | :--- |
| `useAppStore` | `src/store/useAppStore.ts` | Quản lý toàn bộ State toàn cục (Data, UI, Filters, Selections) theo atomic selectors. |
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
```

| TabId | Phân Hệ | File Container Chính | Submodules & Hooks Chính Cần Mở | Modals / Dialogs Liên Quan |
| :--- | :--- | :--- | :--- | :--- |
| `general` | Tổng quan dự án | `src/components/GeneralTab.tsx` | `GeneralTabParts/ProjectTableView.tsx`, `GeneralFilterToolbar.tsx`, `useGeneralData.ts` | `ProjectModal`, `ProjectQuickNavModal` |
| `detail` | Chi tiết công việc | `src/components/DetailTab.tsx` | `DetailTabParts/DetailTableView.tsx`, `DetailFilterToolbar.tsx`, `DetailMobileView.tsx`, `detailTaskMoveService.ts`, `useDetailData.ts`, `useDetailTaskReorder.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal`, `TaskModularModal`, `FullReplaceImport` |
| `gantt` | Biểu đồ tiến độ Gantt | `src/components/GanttTab.tsx` | `Gantt/GanttTimeline.tsx`, `GanttProjectRow.tsx`, `GanttTaskRow.tsx`, `useGanttDependencies.ts` | `TaskModal`, `ProjectModal`, `TaskNoteModal` |
| `calendar` | Lịch tiến độ công việc | `src/components/CalendarTab.tsx` | `CalendarTabParts/CalendarMonthlyView.tsx`, `useCalendarEvents.ts` | `CalendarSyncModal`, `TaskModal` |
| `budget` | Quản lý ngân sách | `src/components/BudgetTab.tsx` | `BudgetParts/BudgetTableView.tsx`, `BudgetFilterToolbar.tsx`, `BudgetTreeRow.tsx`, `useBudgetData.ts` | `BudgetLinkModal` (kèm `BudgetLinkParentColumn.tsx`, `BudgetLinkChildColumn.tsx`) |
| `cost` | Chi phí thực tế | `src/components/CostTab.tsx` | `CostParts/CostTableView.tsx`, `CostFilterToolbar.tsx`, `useCostData.ts` | `CostItemModal`, `CostExportModal` |
| `layout` | Mặt bằng CAD / Kỹ thuật | `src/components/LayoutTab.tsx` | `LayoutTabParts/LayoutCanvasViewport.tsx`, `LayoutUnitSidebar.tsx`, `LayoutFilterToolbar.tsx`, `useLayoutGestures.ts`, `layoutDataAggregator.ts` | `LayoutUnitLightboxModal`, `LayoutMiniGanttModal` |
| `picture_mapping` | Ánh xạ sơ đồ hình ảnh | `src/components/PictureMappingTab.tsx` | `PictureMapping/components/DataMapping/EditTab.tsx`, `DynamicHierarchyTab.tsx`, `ReviewTab.tsx`, `EditTabParts/EditTabInspector.tsx`, `InspectorInputs.tsx`, `DynamicHierarchyParts/DynamicGroupCard.tsx` | `EditTabInspector`, `DynamicHierarchyTab`, `ReviewTab` |
| `summary` | Báo cáo tóm tắt | `src/components/SummaryTab.tsx` | `SummaryParts/SummaryMetricsCard.tsx`, `SummaryFilterToolbar.tsx` | `SummaryExportModal` |
| `taskDelegation` | Phân công ủy quyền | `src/components/TaskDelegationTab.tsx`| `TaskDelegationParts/DelegationTableView.tsx`, `DelegationParts/DelegationCard.tsx` | `DelegationGroupModal`, `DelegationTaskModal` |
| `taskDelegationCalendar`| Lịch ủy quyền | `src/components/DelegationCalendarTab.tsx`| `DelegationCalendarParts/DelegationCalendarGrid.tsx` | `DelegationDetailModal` |
| `notification` | Trung tâm thông báo | `src/components/NotificationTab.tsx`| `NotificationParts/NotificationList.tsx`, `NotificationItem.tsx` | `NotificationDetailModal` |
| `accControl` | Quản lý truy cập / User | `src/components/AccControlTab.tsx` | `AccControlTabParts/UserTable.tsx`, `RoleMatrixView.tsx` | `UserModal` |
| `audit` | Nhật ký kiểm toán | `src/components/AuditLogTab.tsx` | `AuditLogParts/AuditLogTable.tsx`, `AuditLogFilterToolbar.tsx` | `AuditDiffViewerModal` |
| `setting` | Cấu hình & Backup | `src/components/SettingTab.tsx` | `SettingTabParts/SystemConfigPanel.tsx`, `DataBackupPanel.tsx` | `ProjectLinksImagesManagerModal`, `FirestoreSummarizedExportModal`, `DesktopOptimizationModal` |
| `csv_export` | Xuất nhập file | `src/components/CsvExportTab.tsx` | `CsvExportParts/ExportPreviewTable.tsx` | `CsvImportModal` |
| `manual` | Hướng dẫn sử dụng | `src/components/ManualTab.tsx` | `FaqBot/FaqChatWindow.tsx`, `FaqKnowledgeViewer.tsx` | `FaqChatbotModal` |

---

## 5. Quy Tắc Tác Nghiệp Nhanh Cho AI (Quick Lookup Protocol)

Khi nhận bất kỳ yêu cầu sửa lỗi (hotfix), tối ưu hiệu năng hoặc thêm tính năng mới:

1. **Bước 1: Tra cứu Bản Đồ Điều Hướng (Mục 4)**:
   - Xác định chính xác `TabId` liên quan.
   - **Chỉ mở các file trong thư mục `*Parts/`** của phân hệ đó để chỉnh sửa.
   - **TUYỆT ĐỐI KHÔNG** nhồi code mới vào file Container chính (`<TabName>.tsx`). Container chính chỉ làm nhiệm vụ kết nối và điều phối.

2. **Bước 2: Tái sử dụng Core Services (Mục 2) & Hooks (Mục 3)**:
   - **TUYỆT ĐỐI CẤM** viết lại các hàm tính toán ngày, tính tiền, phân tích tiền nhiệm hay ghi database.
   - Thao tác ghi dữ liệu **BẮT BUỘC** import từ `src/lib/firestoreWrites.ts` và dùng các hàm chuẩn như `saveTaskStateUnified`, `saveCostWithAtomicSummary`, `calculateProjectComputedDates`.
   - Luôn tuân thủ nguyên tắc 4 Khóa Định Danh (Mục 1.3) khi liên kết task, cost, delegation với project.

3. **Bước 3: Hiệu Năng Đồ Họa & Modal Kéo Thả**:
   - Đối với Konva Canvas (Layout & Picture Mapping): Luôn đặt `listening={false}` & `perfectDrawEnabled={false}` trên các shape tĩnh; dùng Direct Node Transform + `batchDraw()` thay vì ép vẽ lại toàn bộ layer (`drawScene()`).
   - Mọi modal (`ProjectModal`, `TaskModal`, `BudgetLinkModal`...) bắt buộc hỗ trợ kéo thả (`dragControls` từ `motion/react`) và bọc `lazyWithRetry` mount JIT khi mở.

4. **Bước 4: Tuân Thủ Kỷ Luật Trần File 500 Dòng (`AGENTS.md` Rule 12)**:
   - Bất kỳ file component, hook hoặc service nào nếu sau khi viết vượt quá **500 dòng**, bắt buộc phải băm nhỏ/tách submodule độc lập ngay lập tức.
   - Đảm bảo 100% nhãn, tiêu đề, trạng thái trên UI bằng tiếng Anh chuyên nghiệp chuẩn Enterprise.

5. **Bước 5: Đồng Bộ Mã Nguồn (`AGENTS.md` Rule 13)**:
   - Sau khi hoàn thành và chạy `compile_applet` / `lint_applet` thành công, đồng bộ ngay các file sửa/tạo mới vào `TAKASHIMAYA_FULL_SOURCE.txt`.
   - Không spam log hoặc sửa các file tài liệu khác ngoài mã nguồn.
