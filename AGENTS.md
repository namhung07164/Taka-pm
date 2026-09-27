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

## 12. Modal Performance, Code Splitting & JIT
- **JIT Mounting**: Modal nặng bắt buộc dùng Dynamic Import (`React.lazy`), bọc `<Suspense fallback={null}>` và chỉ mount khi mở (`{isOpen && <Modal />}`). Cấm DOM ẩn chạy ngầm.
- **Thư Viện Nặng & Code Splitting**: Cấm import tĩnh các thư viện nặng (`xlsx`, `html2canvas`, `konva`, `jspdf`) vào bundle chính. Bắt buộc dùng `await import(...)` hoặc `React.lazy` để file bundle chính luôn dưới 1MB, tối ưu thời gian khởi động (FCP) trên máy POS/di động.
- **Form Sub-Components**: Form phức tạp tách thành các component con bọc `React.memo` để gõ phím không re-render cả modal.

## 13. Unified Design System & Typography
- **Year**: Định dạng hiển thị và badge năm đồng nhất (`font-bold`, palette neutral/theme chuẩn).
- **Project & Task Code**: Dùng font monospace (`font-mono font-extrabold uppercase`), màu xanh thương hiệu (`text-blue-700 dark:text-[#8ab4f8]`).
- **Store Identifier**: HCM: Blue (`text-blue-600 dark:text-[#8ab4f8]`), HN: Red (`text-red-600 dark:text-red-400`).
- **Status Badges**: Trạng thái (Completed, On Process, Upcoming, Delay, Overdue) dùng chung màu Tailwind (Emerald, Blue, Amber, Rose) và quy cách bo góc/padding.
- **Token Reuse**: Buttons, `DebouncedSearchInput`, `MultiCheckboxSelect`, `FastInput` dùng chung token (`rounded-lg`/`rounded-xl`, `active:scale-95 touch-manipulation`, border transition, focus ring).

## 14. Documentation Maintenance
- Khi hoàn thành hoặc thay đổi tính năng mới, **bắt buộc** cập nhật các bước thao tác vào `USER_MANUAL.md`.
