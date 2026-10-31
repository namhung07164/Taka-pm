# Project Architecture & Coding Conventions

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, UI/UX, tính năng và luồng dữ liệu TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA, DISABLE HAY LÀM SUY GIẢM khi cập nhật, trừ khi người dùng yêu cầu rõ ràng. Mọi thay đổi phải là mở rộng (additive) hoặc tối ưu (optimization).

## 1. On-Demand Business Logic & Operating Protocol

### 1.1. Nguồn Tham Chiếu Tối Thượng (Single Source of Truth)
1. **Đọc `ARCHITECTURE.md` trước tiên:** Để nắm vị trí thư mục, phân bổ module và luồng nghiệp vụ chính. Không tự ý tạo thư mục mới lệch khỏi cấu trúc này.
2. **Tra cứu `src/api-contracts.ts` thứ hai:** Từ điển chứa toàn bộ `interface`, `type`, `enum`, cấu trúc Zustand Store (State & Actions) và chữ ký hàm API/Services.
   - Khi cần gọi Zustand store hoặc API từ module khác, chỉ cần tra cứu kiểu và tên hàm trong `src/api-contracts.ts`. **KHÔNG** đọc toàn bộ file thực thi trừ khi cần sửa logic bên trong nó.
   - **Chống bịa đặt (Zero Hallucination):** Tuyệt đối không tự suy đoán tên hàm trong Zustand store hoặc thuộc tính của dữ liệu nếu chưa kiểm tra trong `src/api-contracts.ts`.
3. **Kho quy chuẩn nghiệp vụ (`BUSINESS_LOGIC.md`):** Lưu trữ toàn bộ công thức tài chính, schema, RBAC. Tác vụ can thiệp sâu vào tính toán, phân quyền hoặc nghiệp vụ (Budget, Gantt, RBAC) **bắt buộc** dùng `view_file` tra cứu `BUSINESS_LOGIC.md` qua Navigation Index trước khi sửa code.

### 1.2. Quy Trình 3 Bước Khi Thực Hiện Yêu Cầu (Workflow)
- **Bước 1 (Check Contracts):** Kiểm tra `src/api-contracts.ts` xem đã có sẵn `type/interface`, action/selector trong Zustand store hoặc hàm API nào phục vụ được yêu cầu chưa. Tái sử dụng tối đa những gì đã có.
- **Bước 2 (Code Implementation):** Viết code tuân thủ nghiêm ngặt quy tắc mỗi file dưới 500 dòng, dùng TypeScript strict mode (không dùng `any`), tách biệt rõ UI Component và Zustand Store.
- **Bước 3 (Selective Auto-Sync & Mandatory Validation):**
  - **Cập nhật có chọn lọc (Chống lãng phí token & xung đột):** CHỈ cập nhật `src/api-contracts.ts` khi thực sự có thêm/sửa/xóa `interface`, `type`, Zustand state/action/selector cốt lõi hoặc chữ ký hàm API; CHỈ cập nhật `ARCHITECTURE.md` khi tạo thêm module/phân hệ hoặc thư mục tính năng mới. **TUYỆT ĐỐI KHÔNG** sửa lại các file tài liệu này đối với các bản vá lỗi nhỏ (bug fix), tinh chỉnh UI/CSS, hoặc thay đổi biến cục bộ.
  - **Chốt chặn kiểm tra tự động (`lint_applet`):** Sau khi viết/sửa code xong, **BẮT BUỘC** chạy `lint_applet` (`tsc --noEmit`) và `compile_applet` để bắt ngay mọi lỗi thiếu type hoặc sai kiểu dữ liệu trước khi kết thúc lượt trả lời.



## 2. Core Architecture & Build Constraints
- **Safe Boot**: Luôn boot tại tab General; cấm lưu `taka_last_tab` vào `localStorage`.
- **Global State (Zustand)**: Quản lý toàn bộ state qua `useAppStore.ts`. Dùng Atomic Selectors (vd: `state => state.projects`) và shallow hooks (`useUISlice`, `useDataSlice`) để chống re-render. Cấm truyền prop quá sâu.
- **Package Manager (NPM ONLY)**: Chỉ dùng NPM. Cấm Bun/Yarn/Pnpm (nếu có lockfile khác phải xóa ngay). Build SPA luôn trỏ vào `dist/`.
- **Zero-Delay Optimistic UI & Offline Queue**: Lưu/sửa/xóa cập nhật ngay vào Zustand (0ms). Đẩy tác vụ Firestore ra chạy ngầm; bắt buộc bọc `try/catch` đẩy tác vụ lỗi vào Offline Queue (`src/lib/syncQueue.ts`) để chống mất dữ liệu ngầm (Silent Data Loss). Nút bấm dùng `active:scale-95 touch-manipulation`.
- **Tính toàn vẹn Schema**: Cấm thêm field rác hoặc đổi tên schema ngoài `src/types.ts`. Bảo toàn 100% tính năng xuất file, watermark, delegation, export.

## 3. Data Fetching & Performance Guards (Firebase)
- **Tri-Gate Lazy Loading**: Bảo toàn 3 cờ (`isTasksRequested`, `isCostsRequested`, `isDelegationsRequested`); không query khi user chưa yêu cầu.
- **Dot-Notation & Atomic Aggregates**: Cập nhật tài chính lồng sâu bắt buộc dùng chuỗi chấm (`'financial.byStore...'` + `increment()`), gom 1 update/doc/batch để chống xung đột ghi đè đồng thời giữa các kế toán.
- **Anti-Read-Storm**: Không query thừa; cấm đưa object vào deps của `useEffect`. Khi chuyển tab, luôn ưu tiên đọc cache Zustand.
- **Multi-listener Pooling ("All Years")**: Quản lý listener từng năm qua `useRef<Map>` pool (giữ Delta Sync), không unmount khi chuyển năm cũ để Zero-Read từ cache.
- **IDB Locks & Trần Bộ Nhớ iOS 40MB**: Iframe/PWA dùng `persistentSingleTabManager({ forceOwnership: true })`; Desktop chuẩn dùng `persistentMultipleTabManager`. Bắt buộc giới hạn cache iOS ở mức 40MB (`cacheSizeBytes: isIOS ? 41943040 : CACHE_SIZE_UNLIMITED`) để tránh WebKit dọn sạch IDB gây bão đọc.

## 4. Hardware, Storage & Financial Audit Safety
- **Camera/Scanner**: Luôn kiểm tra quyền `getUserMedia`; gọi `track.stop()` khi unmount. Giới hạn 3-5 FPS khi scan Face/QR để chống đơ UI.
- **Storage Deep Clean**: Khi xóa (soft/hard delete) Task/Project/Cost, bắt buộc dùng `extractStorageUrls` và `deleteStorageFiles` (trong `src/lib/storageUtils.ts`) để xóa sạch file đính kèm trên Firebase Storage, chống rác mồ côi.
- **Config Realtime & Audit Logging**: Bảng config (`taka_users`, `taka_config`) phải dùng `onSnapshot`. Mọi biến động luồng tiền (Budget/Cost) bắt buộc ghi log vào `audit_logs` (Append-only) để truy vết kiểm toán.

## 5. Safe Integration (Tích Hợp Module Mới / ZIP)
- **Strict Isolation**: Gom toàn bộ UI/Logic mới vào thư mục riêng (vd: `src/components/NewFeature/`). Không trộn lẫn vào core components.
- **Zero-Modification**: Tuyệt đối không sửa/ghi đè UI layout, CSS, hooks hiện có. Chỉ kết nối qua 1 nút/tab navigation (Plug-and-play).
- **State & Schema Safety**: State mới tạo slice độc lập trong Zustand; type mới viết nối cuối `src/types.ts` hoặc file riêng. Cấm sửa `BUSINESS_LOGIC.md`.

## 6. UI/UX & Responsive Architecture
- **Tách biệt UI Controls**: Nút điều khiển phức tạp (Ribbon/Toolbar) tách thành standalone component quản lý qua `UISlice`, không nhồi vào data slices.
- **Mobile Responsive**: Trên di động, dùng `hidden lg:inline-flex` để ẩn Ribbon/Toolbar phức tạp trên Header và gom gọn vào Navigation Drawer.
- **Sticky & Reflow Guard**: Thanh công cụ/nút chính dùng `sticky top-0 z-[100] backdrop-blur-md` để cuộn mượt mà, chống layout reflow.
- **Shortcuts & Memory**: Full-screen/Focus mode gắn phím `Escape` trên `window` và cleanup listener khi unmount.

## 7. Graphics & Canvas Guards (Konva & SVG)
- **Hit-Graph Elimination**: Mọi Konva element không nhận sự kiện click (Labels, Badges, Rings, Grid, Background Map) **bắt buộc** gắn `listening={false}` và `perfectDrawEnabled={false}`.
- **Event Throttling**: Wheel, Pan, Pinch, Drag phải bọc trong `requestAnimationFrame` và hủy bằng `cancelAnimationFrame` khi unmount.
- **Image Caching**: Mặt bằng nặng giải mã qua `useOffscreenImage` hoặc memoized HTMLImage; cấm reload lại ảnh khi đổi filter/tầng.
- **O(1) Data Pre-Indexing**: Không lồng `.filter()` trong `.map()`. Tiền xử lý dữ liệu qua `Map<string, T[]>` trong `useMemo` trước khi render.

## 8. Realtime Mutation & Chat Economy
- **Zero-Query for Modals**: Modal chi tiết (Task/Project Detail, QuickNav) đọc trực tiếp từ Zustand, cấm gọi query/getDoc Firestore độc lập.
- **Targeted ArrayUnion**: Thêm bình luận (`project.comments`), activity log, chat phải dùng `arrayUnion()` trên doc, tránh ghi đè toàn bộ doc.
- **Debounced Auto-Save**: Ô nhập nhanh cập nhật tức thì vào Zustand (0ms) và debounce 400ms trước khi đưa vào hàng đợi `syncQueue` (Firestore Batch Write).

## 9. Task Hierarchy & Rollup Engine
- **In-Memory Computed Rollup**: Ngày bắt đầu, kết thúc, duration, tiến độ (%) của Task mẹ tính tự động từ Task con 100% trong bộ nhớ client (Pure Function). Cấm dùng Cloud Function trigger ghi ngược Firestore.
- **Circular Guard**: Dùng `visited` Set khi duyệt cây task để chống treo trình duyệt do vòng lặp cha - con.

## 10. Language Standard (English UI Mandate)
- **100% English UI**: Toàn bộ tiêu đề (Titles), nhãn (Labels), chú thích (Tooltips), diễn giải (Descriptions), cảnh báo (Alerts/Toasts), trạng thái (Badges) phải dùng tiếng Anh chuyên nghiệp chuẩn Enterprise.

## 11. Universal Draggable Modals & Tooltips
- Mọi modal (`ProjectModal`, `TaskModal`, `UserModal`, `ConfirmModal`, `CalendarSync`, `QuickNav`...) và modular tooltip bắt buộc hỗ trợ kéo thả (Draggable/Pointer Drag) với handle (`.modal-handle`, `cursor-grab active:cursor-grabbing` hoặc icon `GripHorizontal`).

## 12. Modal Performance, Code Splitting & Modular Architecture
- **Trần Giới Hạn File (Hard File Size Cap < 500 lines)**: Mỗi component / file `.tsx` / `.ts` **tuyệt đối không vượt quá 500 dòng code**. Khi nâng cấp hoặc thêm tính năng mới làm file vượt quá ranh giới này, AI **bắt buộc** phải băm nhỏ/tách submodule vào thư mục tương ứng (`src/components/<TabName>Parts/`).
- **Mô Hình Module Hóa Tiêu Chuẩn (Modular Directory Standard)**: Mọi Tab và Module phức tạp bắt buộc tuân theo mô hình phân tách 4 lớp:
  ```
  src/components/<TabName>Parts/
  ├── <TabName>FilterToolbar.tsx   (Thanh công cụ, bộ lọc, tìm kiếm, xuất/nhập)
  ├── <TabName>TableView.tsx       (Giao diện View chính: Bảng/Lưới/Cây)
  ├── <TabName>MobileView.tsx      (Giao diện tối ưu di động iOS/Android)
  ├── <TabName>RowItem.tsx         (Hàng dữ liệu con bọc React.memo)
  ├── <TabName>Modal.tsx           (Modal phụ bọc React.lazy & JIT Mounting)
  ├── <tabName>Types.ts            (Type/Interface riêng của module)
  └── use<TabName>Data.ts          (Custom Hook xử lý tính toán/memo/filter)
  ```
- **Container Orchestrator**: Container file chính (`<TabName>.tsx`) chỉ giữ vai trò điều phối (dưới 300-400 dòng), đọc state từ Zustand (`useAppStore`) và truyền props phẳng xuống submodules.
- **Cấm Tái Tạo File Nguyên Khối (Zero Monolithic Logic)**: Tuyệt đối cấm gộp lại hoặc nhồi code mới trực tiếp vào file chính. Mọi nâng cấp mới phải là mở rộng submodule độc lập hoặc viết hook riêng (Additive/Modular Pattern).
- **JIT Mounting**: Modal nặng bắt buộc dùng Dynamic Import (`React.lazy`), bọc `<Suspense fallback={null}>` và chỉ mount khi mở (`{isOpen && <Modal />}`). Cấm DOM ẩn chạy ngầm.
- **Thư Viện Nặng & Code Splitting**: Cấm import tĩnh các thư viện nặng (`xlsx`, `html2canvas`, `konva`, `jspdf`) vào bundle chính. Bắt buộc dùng `await import(...)` hoặc `React.lazy` để file bundle chính luôn dưới 1MB, tối ưu thời gian khởi động (FCP) trên máy POS/di động.
- **Form Sub-Components**: Form phức tạp tách thành các component con bọc `React.memo` để gõ phím không re-render cả modal.

## 13. Quy Chuẩn Không Cập Nhật Tài Liệu Lắt Nhắt (No Docs Spam)
- 🛑 **CẤM Tự Động Viết Log/Tài Liệu**: Tuyệt đối KHÔNG tự động viết log, tóm tắt, hay cập nhật các file tài liệu (như `manual_usual.md`, `README.md`, v.v.) sau mỗi lần sửa/viết code. Việc thay đổi tính năng chỉ được phản ánh trực tiếp vào mã nguồn.


## 14. Local-First & Delta Synchronization Architecture (Dexie & Delta Pipeline)
- **Primary Storage (Dexie.js / IndexedDB)**: Coi `src/lib/localDb.ts` (`TakaLocalDB`) và in-memory Zustand là Primary Data Source cho client. Khi boot app, luôn ưu tiên đọc cache Dexie (`bootstrapLocalStore()`) nạp ngay 100% dữ liệu trong 5ms – 10ms, triệt tiêu hoàn toàn loading spinner.
- **Delta Sync Pipeline (`taka_deltas`)**: Mọi đột biến (mutation) sau khi xả ghi xuống Firestore bắt buộc ghi nhận bản ghi delta qua `recordDelta()` (`src/lib/deltaSyncService.ts`). Background worker định kỳ kéo delta (`numericTime > lastSyncTime`) và áp dụng nguyên tử vào Zustand + Dexie, cắt giảm 80%–95% lượt Firestore READ.
- **Non-blocking UI Thread**: Mọi tác vụ ghi nặng (`offloadPersistSnapshot`, `bulkPut`, `applyDeltasToLocalDatabase`) bắt buộc đẩy sang background microtasks (`setTimeout(..., 0)`), cấm thực hiện I/O làm nghẽn luồng render chính của React, bảo đảm 60 FPS.
- **Self-Mutation Skipping & Tri-Gate Guards**: Tránh echo giật con trỏ khi đang gõ phím (`delta.updatedBy === currentUser.email`) và tuân thủ tuyệt đối 3 cờ Tri-Gate (`isTasksRequested`, `isCostsRequested`, `isDelegationsRequested`) không nhồi dữ liệu vào slice chưa kích hoạt.
- **Fault-Tolerant Fallback & Sync Queue**: Khi IndexedDB bị chặn (Incognito/Private) hoặc rỗng dữ liệu, tự động fallback về nạp Firestore. Mọi tác vụ ghi tiếp tục được bảo vệ bởi hàng đợi `syncQueue.ts` chống mất mát dữ liệu ngoại tuyến.


## 15. Real-time Delta Channel & Auto Delta (Sync Consistency)
- **Realtime**: `deltaRealtimeListener.ts` giữ 1 `onSnapshot` trên `taka_deltas` (thay polling 25s). Polling chỉ còn là safety net 5 phút. Cấm đưa lại polling ngắn hạn.
- **Auto Delta**: mọi ghi vào `taka_projects/tasks/costs/delegation_groups` qua wrapper trong `firebase.ts` tự phát delta `invalidate` (`autoDeltaQueue.ts`). Code mới KHÔNG cần tự gọi `recordDelta`, nhưng nếu gọi thì phải gọi trong vòng vài giây sau lệnh ghi để tránh phát trùng.
- **Ghost record guard**: delta `update` cho doc chưa có trong store/Dexie phải bị bỏ qua, cấm tạo bản ghi từ patch một phần.
- **Write imports (BẮT BUỘC)**: file ghi vào `taka_projects/tasks/costs/delegation_groups` phải import `setDoc/updateDoc/deleteDoc/writeBatch` từ `src/lib/firestoreWrites.ts` (hoặc `src/lib/firebase.ts`), CẤM import trực tiếp từ `firebase/firestore`, nếu không các máy khác sẽ không nhận được thay đổi.
- **Sync cursor**: delta được sắp/lọc theo `serverTime` (serverTimestamp), không dùng `numericTime` (giờ máy) để truy vấn, để delta tạo lúc offline vẫn tới được các máy khác.

## 16. Quy Chuẩn Đồng Bộ Đa Thiết Bị & Cô Lập Khóa Dữ Liệu Tuyệt Đối (Multi-Device Sync & Composite Key Isolation)

### 16.1. Cô Lập Tuyệt Đối 4 Khóa Định Danh (`projectId` + `projectCode` + `year` + `store`)
- **Nguyên Tắc Bất Khả Xâm Phạm**: Không bao giờ được dùng riêng lẻ `projectCode` để đối chiếu, gom nhóm, liên kết hoặc truy vấn dữ liệu giữa các thực thể (Task, Project, Cost, Delegation). Một mã `projectCode` (ví dụ: `A01`) có thể tồn tại ở nhiều năm tài chính khác nhau và nhiều chi nhánh khác nhau; chúng là các thực thể hoàn toàn độc lập và cấm gộp chung.
- **Tiêu Chuẩn Bắt Buộc Khi Tạo Mới / Cập Nhật (Persistence Standard)**:
  - Mọi bản ghi khi ghi xuống Firestore (`taka_tasks`, `taka_costs`, `taka_delegation_groups`), lưu vào Dexie `localDb` và Zustand bắt buộc phải có đầy đủ 4 trường định danh: `projectId`, `projectCode`, `projectYear` (hoặc `year`), và `projectStore` (hoặc `store`). CẤM để trống hoặc gán `undefined`/`null` cho các trường này.
  - Khi tạo Task mới từ Project, bắt buộc kế thừa trực tiếp: `task.projectId = project.id`, `task.projectCode = project.code`, `task.projectYear = project.year`, `task.projectStore = project.store`.
- **Thứ Tự Ưu Tiên Khi Đối Chiếu & Liên Kết Thực Thể (Matching Priority Engine)**:
  - Mọi hàm liên kết thực thể (như `isTaskBelongsToProject`, `isDelegationGroupBelongsToProject`, `getTasksForProject`, `computeProjectActStatus`, `resolveProjectContext`, `computeTaskCode`, `buildTaskNoMap`, `resolvePredecessorString`) bắt buộc tuân thủ thứ tự kiểm tra:
    1. **Loại trừ đã xóa**: Bỏ qua ngay lập tức mọi bản ghi có `isDeleted: true` hoặc nằm trong danh sách `taskDeletedTracker`.
    2. **Khớp ID dự án (Ưu tiên cao nhất #1)**: So khớp `task.projectId === project.id`. Nếu CẢ HAI BÊN đều có ID nhưng giá trị KHÁC NHAU -> LẬP TỨC LOẠI TRỪ (`return false`). TUYỆT ĐỐI CẤM fallback sang so sánh `projectCode` khi ID đã không khớp.
    3. **Khớp Chi Nhánh Store (Ưu tiên #2)**: Bắt buộc cùng chi nhánh store (so khớp chuẩn hóa `toLowerCase().trim()`). Nếu một bên là `HCM` và một bên là `HN` -> LẬP TỨC LOẠI TRỪ (`return false`).
    4. **Khớp Năm Tài Chính Year (Ưu tiên #3)**: Bắt buộc cùng năm tài chính (so khớp chuỗi chuẩn hóa `String(year).trim()`). Nếu khác năm -> LẬP TỨC LOẠI TRỪ (`return false`).
    5. **Chế độ tương thích dữ liệu cũ (Legacy Fallback)**: Chỉ khi bản ghi cũ thiếu hoàn toàn trường `projectId`, mới được phép đối chiếu kết hợp đồng thời cả 3 yếu tố: `projectCode` + `store` + `year`. Thiếu bất kỳ yếu tố nào trong 3 yếu tố này cũng không được liên kết bừa bãi.

### 16.2. Cơ Chế Thức Giấc Qua Đêm & Hồi Phục Kết Nối (Overnight Wake-up & Sleep Resume Guard)
- **Bản Chất Lỗi Qua Đêm**: Khi máy tính Desktop/Laptop gập màn hình hoặc iPad vào chế độ ngủ qua đêm, trình duyệt (Chrome/Safari) chuyển sang trạng thái đóng băng tiến trình (frozen/throttled). Kết nối WebSockets của Firestore và listener Delta bị ngắt ngầm mà không kích hoạt sự kiện lỗi ngay lập tức, dẫn đến việc thiết bị bỏ lỡ các delta phát sinh từ các thiết bị khác trong đêm.
- **Cơ Chế Bắt Sự Kiện Thức Giấc Toàn Diện**:
  - Hệ thống bắt buộc duy trì các listener toàn cục: `document.addEventListener('visibilitychange')`, `window.addEventListener('pageshow')`, `window.addEventListener('online')`, `window.addEventListener('focus')`.
  - **Heartbeat Gap Detection**: Định kỳ mỗi 15-30 giây kiểm tra một nhịp tim (timestamp). Nếu khoảng cách giữa hai lần kiểm tra thực tế vượt quá 60 giây (dấu hiệu chắc chắn máy vừa bị tạm dừng hoặc ngủ qua đêm), hệ thống kích hoạt chuỗi hành động hồi phục:
    1. **Kiểm Tra & Tái Kích Hoạt Realtime Socket**: Kiểm tra trạng thái Firestore Network, nếu socket bị treo hoặc stale thì reset và tái kích hoạt listener.
    2. **Bù Đắp Delta Toàn Diện (`forceAll`)**: Ngay lập tức gọi `pullAndApplyDeltas(undefined, true)` với cờ cưỡng chế kéo bù tất cả các delta phát sinh từ mốc `lastSyncTime` trên server để nạp ngay vào Zustand + Dexie.
    3. **Tự Động Kích Hoạt Reconcile**: Kích hoạt quét đối chiếu nhanh giữa server snapshot và local cache để loại trừ mọi task đã bị xóa hoặc sửa đổi trong đêm.

### 16.3. Tự Động Đối Chiếu Hai Chiều & Triệt Tiêu Task Ma (Bi-directional Reconciliation & Zero-Zombie Standard - Bản Vá 1L)
- **Chấm Dứt Phụ Thuộc Vào "Clear & Resync Cache"**:
  - Không bao giờ bắt người dùng phải bấm nút xóa cache thủ công khi dữ liệu bị lệch giữa các thiết bị. Hệ thống phải tự động tự cân bằng và tự làm sạch (Self-Healing).
- **Cơ Chế Đối Chiếu Snapshot Hai Chiều**:
  - Mỗi khi nhận một Server Snapshot đầy đủ (từ listener theo năm `useTasksHydration` hoặc listener theo dự án), và snapshot đó **KHÔNG từ cache** (`!snapshot.metadata.fromCache`) và **KHÔNG có pending writes** (`!snapshot.metadata.hasPendingWrites`):
    - **Chiều Thuận**: Task có trên server mà thiếu hoặc cũ dưới client -> cập nhật ngay vào Zustand và Dexie (đã có qua `snapshot.docChanges()`).
    - **Chiều Nghịch (Zombie Detection)**: Task đang tồn tại trong Zustand/Dexie thuộc phạm vi của năm/dự án đang nghe, nhưng trên server snapshot không còn tồn tại -> TỰ ĐỘNG XÓA KHỎI LOCAL (`buildZombieRemovalsForYear`, `buildZombieRemovalsForProject`).
- **An Toàn Tuyệt Đối Khi Loại Trừ Task Ma**:
  - **Guard 30 Giây (Recent Edit Guard)**: Tuyệt đối không xóa các task vừa được tạo hoặc sửa đổi trong vòng 30.000ms (`RECENT_EDIT_GUARD_MS`) để tránh xóa nhầm task mới tạo dưới local chưa kịp hoàn tất ghi lên server.
  - **Phạm Vi Đối Chiếu Chuẩn Xác**: Chỉ đối chiếu các task thuộc đúng `projectYear` và `projectStore` được phân quyền, hoặc đúng `projectId`/mã dự án nằm trong truy vấn. Task của dự án khác hoặc năm khác không bao giờ bị đụng tới.
  - **Chỉ Xóa Cục Bộ**: Thao tác loại trừ task ma chỉ thực hiện trên bộ nhớ (Zustand) và IndexedDB (Dexie), TUYỆT ĐỐI KHÔNG ghi ngược lệnh xóa lên Firestore.

### 16.4. Đồng Bộ Đa Chiều & Tính Toán Tiến Độ Tức Thì (Instant Multi-Device Sync & Rollup)
- **Phát Tán Đột Biến (Mutation Broadcast)**:
  - Mọi thao tác Thêm / Sửa / Xóa trên thiết bị A được phản ánh ngay 0ms vào Zustand và Dexie của thiết bị A, đồng thời phát sinh `taka_deltas` với đầy đủ thông tin: `id`, `projectId`, `projectCode`, `projectYear`, `projectStore`, `action`, `updatedBy`.
  - Thiết bị B, C, iPad đón nhận qua `deltaRealtimeListener.ts` và áp dụng ngay lập tức vào Zustand + Dexie.
- **Xử Lý Khi Nhận Lệnh Xóa**:
  - Khi nhận delta xóa Task từ thiết bị khác:
    1. Xóa ngay bản ghi khỏi `localDb.tasks` (Dexie) và Zustand.
    2. Đưa `id` của task vào `taskDeletedTracker` để ngăn snapshot cũ hồi sinh lại task.
    3. Cắt đứt task khỏi mảng `p.taskSummaries` trong tài liệu dự án tương ứng.
    4. Tự động kích hoạt `calculateProjectComputedDates` để tính toán lại ngày bắt đầu, ngày kết thúc và % tiến độ của dự án trên toàn bộ các thiết bị.

### 16.5. Kỷ Luật Nhập Xuất & Ghi Dữ Liệu Đột Biến (Write Imports & Delta Integrity)
- **Cấm Nhập Trực Tiếp Từ Firebase SDK**:
  - Toàn bộ các file thao tác ghi vào `taka_projects`, `taka_tasks`, `taka_costs`, `taka_delegation_groups` **BẮT BUỘC** import `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` từ `src/lib/firestoreWrites.ts` (hoặc `src/lib/firebase.ts`).
  - **TUYỆT ĐỐI CẤM** import các hàm ghi trực tiếp từ `firebase/firestore`. Việc import trực tiếp sẽ bỏ qua bộ phát delta tự động (`autoDeltaQueue.ts`), dẫn đến việc các thiết bị khác không nhận được thông báo thay đổi và gây ra hiện tượng lệch dữ liệu âm thầm.
- **Cursor Đồng Bộ Dựa Trên Thời Gian Máy Chủ (`serverTime`)**:
  - Con trỏ đồng bộ delta phải luôn dùng `serverTimestamp()` (`serverTime`), tuyệt đối không dùng giờ đồng hồ cục bộ của thiết bị (`numericTime`) để truy vấn delta, bảo đảm các thiết bị có múi giờ hoặc đồng hồ lệch vẫn nhận đủ 100% dữ liệu.
