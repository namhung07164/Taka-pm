# Project Architecture & Coding Conventions

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, UI/UX, tính năng và luồng dữ liệu TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA, DISABLE HAY LÀM SUY GIẢM khi cập nhật, trừ khi người dùng yêu cầu rõ ràng. Mọi thay đổi phải là mở rộng (additive) hoặc tối ưu (optimization).

## 0. 4 Nguyên Tắc Tác Nghiệp Cốt Lõi Cho AI Agent (Core Operating Mindset)

Mọi Agent/AI khi hỗ trợ dự án Takashimaya PM (Taka-PM / T-Project) phải tuân thủ nghiêm ngặt 4 nguyên tắc:

### 0.1. Nghĩ trước khi code (Think Before Coding)
- Không tự ý viết code khi chưa hiểu rõ bối cảnh hoặc yêu cầu.
- Bắt buộc đối chiếu `ARCHITECTURE.md` và `src/api-contracts.ts` để phân tích phạm vi ảnh hưởng (đặc biệt khi đụng vào Dynamic Hierarchy, Rule-Based Groups, Gantt Predecessors, đồng bộ Cloud R2 hoặc Delta Sync).

### 0.2. Đơn giản trước - Simplicity First (Chỉ viết đúng thứ được yêu cầu)
- Tối giản code, tránh tự chế thêm tầng factory/class rườm rà; ưu tiên tái sử dụng hàm tiện ích có sẵn trong `src/lib/` và hooks trong `src/hooks/`.
- **Lưu ý bắt buộc**: Tối giản code nhưng tuyệt đối tuân thủ kiến trúc lõi (tách submodule `< 500` dòng/file, ghi qua `firestoreWrites.ts` / `saveTaskStateUnified` và bảo toàn Optimistic UI 0ms).

### 0.3. Sửa đúng chỗ - Surgical Changes
- Khi sửa lỗi (bugs) hoặc nâng cấp tính năng, chỉ can thiệp chính xác vào file hoặc hàm gây ra vấn đề.
- Tuyệt đối không viết lại toàn bộ file, không xóa comment nghiệp vụ quan trọng và không lan sang module không liên quan.

### 0.4. Làm theo mục tiêu - Goal-Driven Execution (Pass All Checks)
- Viết/sửa code bám sát mục tiêu -> **Kiểm tra (`lint_applet` / `tsc --noEmit` & `compile_applet`)** -> **Sửa triệt để (Fix/Refine)** cho đến khi 0 lỗi cú pháp hay logic.

## 1. On-Demand Business Logic & Operating Protocol

### 1.1. Nguồn Tham Chiếu Tối Thượng (Single Source of Truth)
1. **`ARCHITECTURE.md` (Đọc đầu tiên):** Bản đồ vị trí thư mục, phân bổ submodule (`*Parts/`), danh mục hàm `src/lib/` và hooks `src/hooks/`. Không tạo thư mục mới lệch cấu trúc này.
2. **`src/api-contracts.ts` (Tra cứu thứ hai):** Từ điển `interface`, `type`, `enum`, cấu trúc Zustand Store và chữ ký hàm API/Services. Chỉ tra cứu kiểu/tên hàm tại đây khi gọi từ module khác; **KHÔNG** đọc toàn bộ file thực thi trừ khi cần sửa bên trong. Cấm tự suy đoán tên hàm hoặc thuộc tính (Zero Hallucination).
3. **`BUSINESS_LOGIC.md` (Tra cứu theo yêu cầu):** Chứa công thức tài chính, schema, RBAC. Khi can thiệp sâu vào tính toán, phân quyền hoặc nghiệp vụ (Budget, Gantt, RBAC), bắt buộc dùng `view_file` tra cứu qua Navigation Index trước khi sửa.

### 1.2. Quy Trình 3 Bước Thực Hiện (3-Step Workflow)
- **Bước 1 (Check Map & Contracts):** Định vị submodule trong `ARCHITECTURE.md` và kiểm tra type/action/service có sẵn trong `src/api-contracts.ts`.
- **Bước 2 (Code Implementation):** Viết code `< 500` dòng/file, TypeScript strict mode (cấm `any`), tách biệt UI Component và Zustand Store.
- **Bước 3 (Selective Auto-Sync & Mandatory Validation):**
  - **Cập nhật tài liệu có chọn lọc:** CHỈ cập nhật `src/api-contracts.ts` khi thêm/sửa/xóa `interface`, `type`, Zustand state/action/selector hoặc chữ ký hàm API; CHỈ cập nhật `ARCHITECTURE.md` khi tạo thêm module/phân hệ hoặc thư mục mới. **CẤM** sửa các file tài liệu này khi chỉ vá lỗi nhỏ (bug fix), chỉnh UI/CSS hay đổi biến cục bộ.
  - **Chốt chặn kiểm tra:** Bắt buộc chạy `lint_applet` (`tsc --noEmit`) và `compile_applet` đạt 0 lỗi trước khi kết thúc lượt trả lời.

## 2. Core Architecture & Build Constraints
- **Safe Boot**: Luôn khởi động tại tab `'general'`; cấm lưu `taka_last_tab` vào `localStorage`.
- **Global State (Zustand)**: Quản lý qua `useAppStore.ts`. Dùng Atomic Selectors (`state => state.projects`) và shallow hooks (`useUISlice`, `useDataSlice`) chống re-render. Cấm truyền prop quá sâu.
- **Package Manager (NPM ONLY)**: Chỉ dùng NPM (xóa ngay lockfile của Bun/Yarn/Pnpm nếu có). Build SPA luôn trỏ vào `dist/`.
- **Zero-Delay Optimistic UI & Offline Queue**: Lưu/sửa/xóa cập nhật ngay vào Zustand (0ms) và đẩy Firestore chạy ngầm; bọc `try/catch` đẩy lỗi vào Offline Queue (`src/lib/syncQueue.ts`) chống mất dữ liệu ngầm (Silent Data Loss). Nút bấm dùng `active:scale-95 touch-manipulation`.
- **Tính toàn vẹn Schema**: Cấm thêm field rác hoặc đổi tên schema ngoài `src/types.ts`. Bảo toàn 100% tính năng xuất file, watermark, delegation, export.

## 3. Data Fetching & Performance Guards (Firebase)
- **Tri-Gate Lazy Loading**: Bảo toàn 3 cờ (`isTasksRequested`, `isCostsRequested`, `isDelegationsRequested`); không kích hoạt Firestore listener hay nhồi dữ liệu vào slice khi user chưa yêu cầu.
- **Dot-Notation & Atomic Aggregates**: Cập nhật tài chính lồng sâu bắt buộc dùng chuỗi chấm (`'financial.byStore...'` + `increment()`), gom 1 update/doc/batch chống xung đột ghi đè giữa các kế toán.
- **Anti-Read-Storm**: Không query thừa; cấm đưa object vào deps của `useEffect`. Khi chuyển tab, luôn ưu tiên đọc cache Zustand / Dexie.
- **Multi-listener Pooling ("All Years")**: Quản lý listener từng năm qua `useRef<Map>` pool (giữ Delta Sync), không unmount khi chuyển năm cũ để Zero-Read từ cache.
- **IDB Locks & Trần Bộ Nhớ iOS 40MB**: Iframe/PWA dùng `persistentSingleTabManager({ forceOwnership: true })`; Desktop chuẩn dùng `persistentMultipleTabManager`. Giới hạn cache iOS ở mức 40MB (`cacheSizeBytes: isIOS ? 41943040 : CACHE_SIZE_UNLIMITED`) tránh WebKit xóa trắng IDB gây bão đọc.

## 4. Hardware, Storage & Financial Audit Safety
- **Camera/Scanner**: Kiểm tra quyền `getUserMedia`; gọi `track.stop()` khi unmount. Giới hạn 3–5 FPS khi scan Face/QR chống đơ UI.
- **Storage Deep Clean**: Khi xóa (soft/hard delete) Task/Project/Cost, bắt buộc dùng `extractStorageUrls` và `deleteStorageFiles` (`src/lib/storageUtils.ts`) để xóa sạch file đính kèm trên Firebase Storage (và `deleteR2ImageCleanly` cho R2), chống rác mồ côi.
- **Config Realtime & Audit Logging**: Bảng config (`taka_users`, `taka_config`) dùng `onSnapshot`. Mọi biến động luồng tiền (Budget/Cost) hoặc quyền hạn bắt buộc ghi log vào `audit_logs` (Append-only) qua `auditLogService.ts`.

## 5. Safe Integration (Tích Hợp Module Mới / ZIP)
- **Strict Isolation & Zero-Modification**: Gom toàn bộ UI/Logic mới vào thư mục riêng (`src/components/<FeatureName>/`), không sửa/ghi đè layout, CSS, hooks hiện có; chỉ kết nối qua 1 nút/tab navigation (Plug-and-play).
- **State & Schema Safety**: State mới tạo slice độc lập trong Zustand; type mới viết nối cuối `src/types.ts` hoặc file riêng. Cấm sửa `BUSINESS_LOGIC.md`.

## 6. UI/UX & Responsive Architecture
- **Tách biệt UI Controls**: Ribbon/Toolbar phức tạp tách thành standalone component quản lý qua `UISlice`, không nhồi vào data slices.
- **Mobile Responsive**: Trên di động, dùng `hidden lg:inline-flex` ẩn Ribbon/Toolbar phức tạp trên Header và gom vào Navigation Drawer.
- **Sticky & Reflow Guard**: Thanh công cụ chính dùng `sticky top-0 z-[100] backdrop-blur-md` chống layout reflow.
- **Shortcuts & Memory**: Full-screen/Focus mode gắn phím `Escape` trên `window` và cleanup listener khi unmount.

## 7. Graphics & Canvas Guards (Konva & SVG)
- **Hit-Graph Elimination**: Mọi Konva element tĩnh (Labels, Badges, Rings, Grid, Background Map) bắt buộc gắn `listening={false}` và `perfectDrawEnabled={false}`.
- **Event Throttling**: Wheel, Pan, Pinch, Drag phải bọc trong `requestAnimationFrame` (và Direct Node Transform + `batchDraw()`) và hủy bằng `cancelAnimationFrame` khi unmount.
- **Image Caching**: Mặt bằng nặng giải mã qua `useOffscreenImage` hoặc memoized HTMLImage; cấm reload ảnh khi đổi filter/tầng.
- **O(1) Data Pre-Indexing**: Không lồng `.filter()` trong `.map()`. Tiền xử lý qua `Map<string, T[]>` trong `useMemo` trước khi render.

## 8. Realtime Mutation & Chat Economy
- **Zero-Query for Modals**: Modal chi tiết (Task/Project Detail, QuickNav) đọc trực tiếp từ Zustand, cấm gọi `query`/`getDoc` Firestore độc lập.
- **Targeted ArrayUnion**: Thêm bình luận (`project.comments`), activity log, chat phải dùng `arrayUnion()` trên doc, tránh ghi đè toàn bộ doc.
- **Debounced Auto-Save**: Ô nhập nhanh cập nhật tức thì vào Zustand (0ms) và debounce 400ms trước khi đưa vào `syncQueue` (Firestore Batch Write).

## 9. Task Hierarchy & Rollup Engine
- **In-Memory Computed Rollup**: Ngày bắt đầu, kết thúc, duration, tiến độ (%) của Task mẹ và Dự án tính tự động từ Task con 100% trong bộ nhớ client (Pure Function qua `taskRollupService.ts` / `projectDatesService.ts`). Cấm dùng Cloud Function trigger ghi ngược Firestore.
- **Circular Guard**: Dùng `visited` Set khi duyệt cây task/predecessor để chống treo trình duyệt do vòng lặp cha - con.

## 10. Language Standard (English UI Mandate)
- **100% English UI**: Toàn bộ tiêu đề (Titles), nhãn (Labels), chú thích (Tooltips), diễn giải (Descriptions), cảnh báo (Alerts/Toasts), trạng thái (Badges) phải dùng tiếng Anh chuyên nghiệp chuẩn Enterprise.

## 11. Universal Draggable Modals & Tooltips
- Mọi modal (`ProjectModal`, `TaskModal`, `UserModal`, `ConfirmModal`, `CalendarSync`, `QuickNav`...) và modular tooltip bắt buộc hỗ trợ kéo thả (Draggable/Pointer Drag với `dragControls` hoặc `.modal-handle`, `cursor-grab active:cursor-grabbing`, icon `GripHorizontal`).

## 12. Modal Performance, Code Splitting & Modular Architecture
- **Trần Giới Hạn File (< 500 dòng)**: Mỗi file `.tsx` / `.ts` **tuyệt đối không vượt quá 500 dòng**. Khi vượt ngưỡng, bắt buộc tách submodule vào `src/components/<TabName>Parts/` (chi tiết cấu trúc 4 lớp và bảng định tuyến xem tại `ARCHITECTURE.md` Mục 4).
- **Container Orchestrator & Zero Monolithic Logic**: File chính (`<TabName>.tsx`) chỉ điều phối (`< 300-400` dòng), đọc state từ `useAppStore` và truyền props phẳng xuống submodules. Cấm nhồi logic mới trực tiếp vào file chính.
- **JIT Mounting & Code Splitting**: Modal nặng bọc `React.lazy` / `lazyWithRetry`, `<Suspense fallback={null}>` và chỉ mount khi mở (`{isOpen && <Modal />}`). Cấm import tĩnh các thư viện nặng (`xlsx`, `html2canvas`, `konva`, `jspdf`) vào bundle chính (bắt buộc dùng `await import(...)` để giữ bundle chính `< 1MB`).
- **Form Sub-Components**: Form phức tạp tách thành component con bọc `React.memo` để gõ phím không re-render cả modal.

## 13. Quy Chuẩn Không Cập Nhật Tài Liệu Lắt Nhắt (No Docs Spam)
- 🛑 **CẤM Tự Động Viết Log/Tài Liệu**: Tuyệt đối KHÔNG tự động viết log, tóm tắt, hay cập nhật các file tài liệu (`manual_usual.md`, `README.md`...) sau mỗi lần sửa code.

## 14. Local-First & Delta Synchronization Architecture (Dexie & Delta Pipeline)
- **Primary Storage (Dexie.js / IndexedDB)**: `src/lib/localDb.ts` (`TakaLocalDB`) và Zustand là Primary Data Source. Khi boot app, `bootstrapLocalStore()` nạp ngay 100% dữ liệu từ Dexie trong 5ms–10ms, triệt tiêu loading spinner. Nếu IndexedDB bị chặn (Incognito) hoặc rỗng, tự động fallback nạp Firestore.
- **Non-blocking UI Thread**: Mọi tác vụ ghi/đồng bộ nặng (`offloadPersistSnapshot`, `bulkPut`, `applyDeltasToLocalDatabase`) bắt buộc đẩy sang microtasks (`setTimeout(..., 0)`), bảo đảm 60 FPS.
- **Self-Mutation Skipping**: Bỏ qua echo tự thân khi đang gõ phím (`delta.updatedBy === currentUser.email`).

## 15. Real-time Delta Channel & Auto Delta (Sync Consistency)
- **Realtime Single Listener**: `deltaRealtimeListener.ts` duy trì 1 `onSnapshot` duy nhất trên `taka_deltas` (polling 5 phút chỉ làm safety net; cấm dùng polling ngắn hạn).
- **Mandatory Write Wrapper & Auto Delta**: Mọi thao tác ghi vào `taka_projects`, `taka_tasks`, `taka_costs`, `taka_delegation_groups`, `taka_users` **BẮT BUỘC** import `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` từ `src/lib/firestoreWrites.ts` (hoặc `src/lib/firebase.ts`) để tự động phát delta qua `autoDeltaQueue.ts`. **CẤM** import trực tiếp các hàm ghi từ `firebase/firestore`.
- **Ghost Record Guard**: Delta `update` cho bản ghi chưa tồn tại trong Zustand/Dexie phải bị bỏ qua (hoặc chỉ nạp khi đúng scope), cấm tạo bản ghi rỗng từ patch một phần.
- **Server-Time Sync Cursor (`serverTime`)**: Luôn sắp xếp và truy vấn delta theo `serverTimestamp()` (`serverTime`), tuyệt đối cấm dùng giờ máy cục bộ (`numericTime`) làm cursor truy vấn để bảo toàn đồng bộ khi lệch múi giờ hoặc vừa thoát offline.

## 16. Quy Chuẩn Đồng Bộ Đa Thiết Bị & Cô Lập Khóa Dữ Liệu Tuyệt Đối (Multi-Device Sync & Composite Key Isolation)

### 16.1. Cô Lập Tuyệt Đối 4 Khóa Định Danh (`projectId` + `projectCode` + `year` + `store`)
- **Nguyên Tắc Bất Khả Xâm Phạm**: Cấm dùng riêng lẻ `projectCode` để đối chiếu, gom nhóm, liên kết hoặc truy vấn giữa `Task`, `Project`, `Cost`, `Delegation`. Cùng mã `projectCode` (vd: `A01`) ở các năm hoặc chi nhánh khác nhau là các thực thể độc lập.
- **Persistence Standard**: Mọi bản ghi lưu xuống Firestore, Dexie `localDb` và Zustand bắt buộc đủ 4 trường: `projectId`, `projectCode`, `projectYear` (hoặc `year`), và `projectStore` (hoặc `store`). Khi tạo Task từ Project, kế thừa trực tiếp cả 4 trường này.
- **Thứ Tự Ưu Tiên Liên Kết Thực Thể (`isTaskBelongsToProject`, `isDelegationGroupBelongsToProject`, `getTasksForProject`, `computeProjectActStatus`, `resolveProjectContext`, `computeTaskCode`, `buildTaskNoMap`, `resolvePredecessorString`)**:
  1. **Loại trừ đã xóa**: Bỏ qua bản ghi có `isDeleted: true` hoặc nằm trong `taskDeletedTracker`.
  2. **Khớp ID dự án (#1)**: `task.projectId === project.id`. Nếu CẢ HAI đều có ID nhưng KHÁC NHAU -> LẬP TỨC LOẠI TRỪ (`return false`), cấm fallback sang `projectCode`.
  3. **Khớp Chi Nhánh Store (#2)**: Chuẩn hóa `toLowerCase().trim()`. Khác store (`HCM` vs `HN`) -> LẬP TỨC LOẠI TRỪ (`return false`).
  4. **Khớp Năm Tài Chính Year (#3)**: Chuẩn hóa `String(year).trim()`. Khác năm -> LẬP TỨC LOẠI TRỪ (`return false`).
  5. **Legacy Fallback**: Chỉ khi bản ghi cũ thiếu hoàn toàn `projectId`, mới đối chiếu kết hợp đồng thời cả 3 yếu tố: `projectCode` + `store` + `year`.

### 16.2. Cơ Chế Thức Giấc Qua Đêm & Hồi Phục Kết Nối (Overnight Wake-up & Sleep Resume Guard)
- Duy trì listener toàn cục (`visibilitychange`, `pageshow`, `online`, `focus`) và **Heartbeat Gap Detection** (mỗi 15–30s). Khi phát hiện khoảng trống > 60s (máy ngủ qua đêm / gập màn hình):
  1. Kiểm tra & tái kích hoạt Firestore Realtime Socket nếu bị treo/stale.
  2. Gọi `pullAndApplyDeltas(undefined, true)` (`forceAll`) kéo bù toàn bộ delta từ `lastSyncTime` vào Zustand + Dexie.
  3. Kích hoạt Reconcile đối chiếu nhanh giữa server snapshot và local cache.

### 16.3. Tự Động Đối Chiếu Hai Chiều & Triệt Tiêu Task Ma (Bi-directional Reconciliation - Bản Vá 1L)
- **Self-Healing**: Khi nhận Server Snapshot sạch (`!snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites`):
  - **Chiều Thuận**: Cập nhật task mới/sửa từ server vào Zustand + Dexie (`snapshot.docChanges()`).
  - **Chiều Nghịch (Zombie Detection)**: Task có trong Zustand/Dexie thuộc phạm vi năm/dự án đang nghe nhưng không còn trên server snapshot -> tự động xóa khỏi Local (`buildZombieRemovalsForYear`, `buildZombieRemovalsForProject`).
- **An Toàn Tuyệt Đối**: Bảo vệ các task vừa tạo/sửa trong vòng 30 giây (`RECENT_EDIT_GUARD_MS = 30000`), chỉ đối chiếu đúng phạm vi `projectYear`/`projectStore`/`projectId` của truy vấn, và chỉ xóa cục bộ trên Zustand + Dexie (cấm ghi ngược lệnh xóa lên Firestore).

### 16.4. Đồng Bộ Đa Chiều & Tính Toán Tiến Độ Tức Thì (Instant Multi-Device Sync & Rollup)
- **Phát Tán Đột Biến**: Thêm/Sửa/Xóa phản ánh 0ms vào Zustand + Dexie và phát `taka_deltas` (`id`, `projectId`, `projectCode`, `projectYear`, `projectStore`, `action`, `updatedBy`) sang các thiết bị khác.
- **Xử Lý Khi Nhận Lệnh Xóa Task**: Xóa khỏi `localDb.tasks` & Zustand -> đưa `id` vào `taskDeletedTracker` -> cắt khỏi `p.taskSummaries` -> chạy `calculateProjectComputedDates` cập nhật ngày và % tiến độ dự án trên mọi thiết bị.
