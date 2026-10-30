# Taka-PM System Architecture & Quick Lookup Guide

> 📌 **MỤC ĐÍCH**: Bản đồ kiến trúc kỹ thuật dành cho AI Agent và Developer để định vị file submodule, tái sử dụng các hàm có sẵn trong `src/lib/` & `src/hooks/`, và tuyệt đối chống viết lại code trùng lặp.

---

## 1. Sơ đồ Luồng Dữ Liệu & Đồng Bộ (Data & Sync Pipeline)

Hệ thống hoạt động theo mô hình **Local-First 4 Tầng** với độ trễ phản hồi UI 0ms:

```
[UI Layer (React 19 + Tailwind)]
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

### Luồng Đọc (Read Pipeline)
1. **Cold Boot (5–10ms)**: `bootstrapLocalStore()` nạp dữ liệu từ Dexie.js vào Zustand ngay lập tức mà không chờ mạng, xóa bỏ hoàn toàn màn hình tải (loading spinner).
2. **Tri-Gate Lazy Fetching**: 3 cờ `isTasksRequested`, `isCostsRequested`, `isDelegationsRequested` chỉ kích hoạt Firestore listener khi người dùng mở tab tương ứng.
3. **Multi-Listener Pooling**: Quản lý listener từng năm qua `Map` pool, giữ kết nối Delta Sync, không ngắt khi chuyển năm cũ để Zero-Read từ cache.
4. **Realtime Delta Sync**: `deltaRealtimeListener.ts` lắng nghe collection `taka_deltas` theo `serverTime`. Khi phát hiện thay đổi từ thiết bị khác, hệ thống áp dụng nguyên tử vào Zustand và Dexie.
5. **Reconciliation (Triệt tiêu Task Ma)**: Khi nhận Server Snapshot sạch (`!fromCache`), cơ chế đối chiếu tự động xóa bỏ task cục bộ không còn trên máy chủ.

### Luồng Ghi (Write Pipeline)
1. **Zero-Delay Optimistic (0ms)**: Cập nhật ngay vào Zustand, UI phản hồi lập tức.
2. **Local Storage Mirror**: Đồng bộ ngầm không chặn luồng chính (`setTimeout 0`) vào Dexie.js.
3. **Write Protection**: Mọi thao tác ghi Firestore bắt buộc dùng wrapper `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` từ `src/lib/firestoreWrites.ts` để `autoDeltaQueue.ts` tự động phát sinh delta sang các thiết bị khác.
4. **Offline Queue Resilience**: Nếu mất mạng hoặc lỗi, tác vụ được lưu vào `src/lib/syncQueue.ts` và tự động retry khi kết nối trở lại.

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

### 2.4. Đồng Bộ Dữ Liệu & Hạ Tầng (Sync, Dexie, Firestore)
| File | Hàm Quan Trọng | Mô Tả & Nghiệp Vụ |
| :--- | :--- | :--- |
| `src/lib/firestoreWrites.ts` | `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` | **BẮT BUỘC DÙNG**: Wrapper SDK Firestore tự phát delta `invalidate` qua `autoDeltaQueue`. |
| `src/lib/localDb.ts` | `localDb`, `bootstrapLocalStore`, `bulkPutLocal` | Cơ sở dữ liệu IndexedDB Dexie lưu trữ sơ cấp client. |
| `src/lib/deltaSyncService.ts` | `recordDelta`, `pullAndApplyDeltas` | Kéo và áp dụng các delta mutation mới nhất từ server vào local. |
| `src/lib/deltaRealtimeListener.ts` | `startDeltaRealtimeListener` | Listener duy nhất thời gian thực trên `taka_deltas` để nhận biến động từ máy khác. |
| `src/lib/syncQueue.ts` | `enqueueSyncItem`, `flushSyncQueue` | Hàng đợi lưu trữ ngoại tuyến khi mất mạng hoặc server bận. |
| `src/lib/storageUtils.ts` | `extractStorageUrls`, `deleteStorageFiles` | Quét và xóa file mồ côi trên Firebase Storage khi xóa Task/Project. |
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

---

## 4. Bản Đồ Điều Hướng Tính Năng (Feature-to-File Routing Table)

```
src/components/
├── <TabName>.tsx             <- Orchestrator Container (dưới 400 dòng, chỉ đọc state & truyền props)
└── <TabName>Parts/           <- Toàn bộ Sub-components, Sub-modals & Hooks độc lập (< 500 dòng/file)
```

| TabId | Tên Phân Hệ | File Container Chính | Thư Mục Sub-modules & Hooks | Modals / Dialogs Liên Quan |
| :--- | :--- | :--- | :--- | :--- |
| `general` | Tổng quan dự án | `src/components/GeneralTab.tsx` | `src/components/GeneralTabParts/` | `ProjectModal`, `ProjectQuickNavModal` |
| `detail` | Chi tiết công việc | `src/components/DetailTab.tsx` | `src/components/DetailTabParts/` | `TaskModal`, `ProjectModal`, `TaskNoteModal`, `TaskModularModal`, `FullReplaceImport` |
| `gantt` | Biểu đồ tiến độ Gantt | `src/components/GanttTab.tsx` | `src/components/Gantt/` | `TaskModal`, `ProjectModal`, `TaskNoteModal` |
| `calendar` | Lịch tiến độ công việc | `src/components/CalendarTab.tsx` | `src/components/CalendarTabParts/` | `CalendarSyncModal`, `TaskModal` |
| `budget` | Quản lý ngân sách | `src/components/BudgetTab.tsx` | `src/components/BudgetParts/` | `BudgetLinkModal` (Link Sub-Projects) |
| `cost` | Chi phí thực tế | `src/components/CostTab.tsx` | `src/components/CostParts/` | `CostItemModal`, `CostExportModal` |
| `layout` | Mặt bằng CAD / Kỹ thuật | `src/components/LayoutTab.tsx` | `src/components/LayoutTabParts/` | `LayoutUnitLightboxModal`, `LayoutMiniGanttModal` |
| `picture_mapping` | Ánh xạ sơ đồ hình ảnh | `src/components/PictureMappingTab.tsx` | `src/components/PictureMapping/` | `EditTabInspector`, `DynamicHierarchyTab`, `ReviewTab` |
| `summary` | Báo cáo tóm tắt | `src/components/SummaryTab.tsx` | `src/components/SummaryParts/` | `SummaryExportModal` |
| `taskDelegation` | Phân công ủy quyền | `src/components/TaskDelegationTab.tsx`| `src/components/TaskDelegationParts/`, `DelegationParts/` | `DelegationGroupModal`, `DelegationTaskModal` |
| `taskDelegationCalendar`| Lịch ủy quyền | `src/components/DelegationCalendarTab.tsx`| `src/components/DelegationCalendarParts/` | `DelegationDetailModal` |
| `notification` | Trung tâm thông báo | `src/components/NotificationTab.tsx`| `src/components/NotificationParts/` | `NotificationDetailModal` |
| `accControl` | Quản lý truy cập / User | `src/components/AccControlTab.tsx` | `src/components/AccControlTabParts/` | `UserModal` |
| `audit` | Nhật ký kiểm toán | `src/components/AuditLogTab.tsx` | `src/components/AuditLogParts/` | `AuditDiffViewerModal` |
| `setting` | Cấu hình & Backup | `src/components/SettingTab.tsx` | `src/components/SettingTabParts/` | `ProjectLinksImagesManagerModal`, `FirestoreSummarizedExportModal`, `DesktopOptimizationModal` |
| `csv_export` | Xuất nhập file | `src/components/CsvExportTab.tsx` | `src/components/CsvExportParts/` | `CsvImportModal` |
| `manual` | Hướng dẫn sử dụng | `src/components/ManualTab.tsx` | `src/components/FaqBot/` | `FaqChatbotModal` |

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

3. **Bước 3: Tuân Thủ Kỷ Luật Trần File 500 Dòng (`AGENTS.md` Rule 12)**:
   - Bất kỳ file component, hook hoặc service nào nếu sau khi viết vượt quá **500 dòng**, bắt buộc phải băm nhỏ/tách submodule độc lập ngay lập tức.
   - Modal nặng bắt buộc bọc `React.lazy` và `lazyWithRetry`, chỉ mount JIT khi người dùng kích hoạt mở.

4. **Bước 4: Đồng Bộ Mã Nguồn (`AGENTS.md` Rule 13)**:
   - Sau khi hoàn thành và chạy `compile_applet` / `lint_applet` thành công, đồng bộ ngay các file sửa/tạo mới vào `TAKASHIMAYA_FULL_SOURCE.txt`.
   - Không spam log hoặc sửa các file tài liệu khác ngoài mã nguồn.
