# Project Architecture & Coding Conventions

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, UI/UX, tính năng và luồng dữ liệu TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA, DISABLE HAY LÀM SUY GIẢM khi cập nhật, trừ khi người dùng yêu cầu rõ ràng. Mọi thay đổi phải là mở rộng (additive) hoặc tối ưu (optimization).

## 1. On-Demand Business Logic
- **Kho quy chuẩn**: `BUSINESS_LOGIC.md` lưu trữ toàn bộ công thức tài chính, schema, RBAC và quy tắc nghiệp vụ.
- **Quy trình**: Tác vụ UI/màu sắc không cần đọc. Tác vụ can thiệp sâu vào tính toán, phân quyền hoặc nghiệp vụ (Budget, Gantt, RBAC) **bắt buộc** dùng `view_file` tra cứu `BUSINESS_LOGIC.md` qua Navigation Index trước khi sửa code.

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

## 13. Quy Chuẩn Đồng Bộ Source Code (Single Source of Truth)

1. 🛑 CẤM Cập Nhật Tài Liệu Lắt Nhắt (No Docs Spam)
Tuyệt đối KHÔNG tự động viết log, tóm tắt, hay cập nhật các file tài liệu (như `manual_usual.md`, `README.md`, v.v.) sau mỗi lần sửa/viết code. Việc thay đổi tính năng chỉ được phản ánh trực tiếp vào code.

2. 🔄 Cập Nhật Thẳng Vào Mã Nguồn Gốc (Update The Source)
Sau mỗi lần tái cấu trúc, băm nhỏ file, hoặc viết thêm tính năng mới thành công, AI bắt buộc phải cập nhật (ghi đè đoạn code cũ bằng đoạn code mới) trực tiếp vào file `TAKASHIMAYA_FULL_SOURCE.txt`.

3. 🎯 Nguyên Tắc "Single Source of Truth"
File `TAKASHIMAYA_FULL_SOURCE.txt` đóng vai trò là kho lưu trữ trung tâm duy nhất chứa trạng thái code hiện tại. Bất kỳ Agent nào trước khi bắt tay vào sửa logic đều phải đảm bảo mã nguồn trong file này luôn đồng bộ với các thay đổi mới nhất để không ghi đè làm mất các bản vá lỗi (hotfix) hoặc các module vừa được tách nhỏ.

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
- **Cô Lập Tuyệt Đối 4 Khóa (`projectId` + `projectCode` + `year` + `store`)**:
  - Không bao giờ dùng riêng lẻ `projectCode` để đối chiếu, gom nhóm, hoặc truy vấn dữ liệu.
  - Mọi hàm liên kết thực thể (Task, Delegation, Cost) với Project (như `isTaskBelongsToProject`, `isDelegationGroupBelongsToProject`, `getTasksForProject`, `computeProjectActStatus`, `resolveProjectContext`, `computeTaskCode`, `buildTaskNoMap`) bắt buộc kiểm tra:
    1. Bỏ qua bản ghi có `isDeleted: true` hoặc nằm trong `taskDeletedTracker`.
    2. Khớp theo `projectId` / `id` làm ưu tiên cao nhất. Nếu cả 2 bên có ID nhưng khác nhau -> lập tức loại trừ (`return false`), cấm fallback sang `projectCode` làm gộp nhầm dữ liệu.
    3. Nếu cả 2 bên có `store`: bắt buộc cùng chi nhánh (so khớp không phân biệt hoa thường). Nếu khác nhau -> loại trừ ngay.
    4. Nếu cả 2 bên có `year`: bắt buộc cùng năm tài chính. Nếu khác nhau -> loại trừ ngay.
- **Đồng Bộ Đa Màn Hình / Đa Thiết Bị (iPhone, iPad, Desktop)**:
  - Khi thao tác Thêm / Sửa / Xóa trên thiết bị A, cập nhật ngay tức thì vào Zustand và Dexie local (0ms lag), đồng thời phát sinh `taka_deltas` lên Firestore với đầy đủ thông tin định danh (`id`, `projectId`, `projectCode`, `projectYear`, `projectStore`).
  - Thiết bị B đón nhận qua `deltaRealtimeListener.ts` và áp dụng tức thì vào Zustand + Dexie.
  - Khi xóa Task/Project trên một thiết bị: Các thiết bị khác khi nhận delta xóa phải ngay lập tức loại bỏ task khỏi `localDb.tasks`, đánh dấu vào `taskDeletedTracker`, cắt đứt task khỏi `p.taskSummaries`, và tự động kích hoạt tính toán lại `calculateProjectComputedDates` cho dự án tương ứng.
  - Cơ chế hồi phục kết nối iOS/Safari: Khi thiết bị mở lại từ chế độ ngủ / ẩn màn hình (`visibilitychange`, `pageshow`, `online`), hệ thống tự động kiểm tra socket, khôi phục listener và kích hoạt `pullAndApplyDeltas(undefined, true)` để bù đắp các delta phát sinh trong thời gian ngoại tuyến.
