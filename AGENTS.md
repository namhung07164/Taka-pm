# Project Architecture & Coding Conventions

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, UI/UX, tính năng và luồng dữ liệu TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA, DISABLE HAY LÀM SUY GIẢM khi cập nhật, trừ khi người dùng yêu cầu rõ ràng. Mọi thay đổi phải là mở rộng (additive) hoặc tối ưu (optimization).

## 1. On-Demand Business Logic (Cơ chế tra cứu)
- **`BUSINESS_LOGIC.md`** là kho lưu trữ trung tâm của toàn bộ công thức, schema, RBAC và quy tắc nghiệp vụ.
- **Quy trình**: Với tác vụ đơn giản (UI/UX, màu sắc), KHÔNG cần đọc file này. Với tác vụ can thiệp sâu vào tính toán, phân quyền hoặc nghiệp vụ (Budget, Gantt, RBAC), **BẮT BUỘC** dùng lệnh `view_file` đọc `BUSINESS_LOGIC.md` qua Navigation Index để đảm bảo 100% chuẩn xác.

## 2. Core Architecture & Build Constraints
- **Safe Boot Protocol**: Luôn boot tại general, cấm lưu taka_last_tab vào localStorage.
- **State Management (Zustand)**: Bắt buộc dùng Zustand (`useAppStore.ts`) làm Global State. KHÔNG truyền prop quá sâu. Dùng Atomic Selectors (vd: `useAppStore(state => state.projects)`) để chống re-render.
- **Package Manager (NPM ONLY)**: CHỈ SỬ DỤNG NPM. Tuyệt đối cấm Bun/Yarn/Pnpm. Nếu thấy `bun.lock`, `yarn.lock`, phải xóa ngay và chạy `npm install` để duy trì `package-lock.json`. Build SPA luôn trỏ vào `dist/`.
- **Zero-Delay Optimistic UI**: Thao tác lưu/sửa/xóa phải cập nhật ngay vào Zustand và đóng Modal (0ms). Đẩy ngầm thao tác mạng (Firestore) ra background, KHÔNG chặn UI bằng `await batch.commit()`. Các nút bấm phải có class `active:scale-95 touch-manipulation` để phản hồi tức thời.
- **Bảo Vệ Tính Toàn Vẹn**: KHÔNG tạo field rác hoặc đổi tên schema ngoài `src/types.ts`. Giữ nguyên mọi tính năng xuất file, watermark, delegation, export.

## 3. Data Fetching & Performance Guards (Firebase)
- **Tri-Gate Lazy Loading**: Bảo toàn 3 cờ lazy loading (`isTasksRequested`, `isCostsRequested`, `isDelegationsRequested`), cấm kích hoạt query Tasks/Costs/Delegations khi chưa có yêu cầu từ user.
- **Dot-Notation Aggregates**: Cập nhật tài chính lồng sâu bắt buộc dùng chuỗi chấm (`'financial.byStore...'` + `increment()`), gom 1 update/doc/batch.
- **Lazy Loading & Anti-Read-Storm**: Tuyệt đối không query thừa. Tránh bỏ toàn bộ object vào dependency array của `useEffect` (gây loop read-storm). Khi chuyển tab, luôn đọc từ cache của Zustand thay vì query lại.
- **Multi-listener Pooling ("All Years")**: Khi chọn "All Years", các listener của từng năm được đưa vào `useRef<Map>` pool (giữ kết nối Delta Sync), KHÔNG unmount khi chuyển về năm cũ để tránh tải lại (Zero-Read từ cache).
- **IDB Locks & Wake-Up Sync**: 
  - Iframe/PWA dùng `persistentSingleTabManager({ forceOwnership: true })` để tránh văng IndexedDB. Desktop chuẩn dùng `persistentMultipleTabManager`.
  - Không unmount data listeners khi sleep (xóa logic 5-phút debounce timeout), cho phép giữ `resumeToken` để sync delta rẻ tiền thay vì cold-boot tải lại toàn bộ.

## 4. Hardware & Storage Safety
- Luôn kiểm tra quyền `getUserMedia` cho Scanner/Camera; phải gọi `track.stop()` khi unmount. Giới hạn 3-5 FPS khi scan Face/QR để chống đơ UI.
- **Storage Cleanup (Deep Clean)**: Khi xóa (soft-delete) Task/Project/Cost, bắt buộc dùng `extractStorageUrls` và `deleteStorageFiles` (trong `src/lib/storageUtils.ts`) để quét và xóa file đính kèm trên Firebase Storage, chống rác vật lý mồ côi.
- Mọi dữ liệu config (`taka_users`, `taka_config`) phải dùng `onSnapshot` để UI cập nhật realtime khi Admin thay đổi.

## 5. Safe Integration (Tích hợp tính năng mới từ file ZIP)
Khi giải nén và tích hợp tính năng mới (vd: picture mapping từ file ZIP), BẮT BUỘC tuân thủ nguyên tắc "Cô lập & Chỉ thêm vào" (Decoupled & Additive-Only):
- **Strict Isolation**: Gom toàn bộ UI/Logic mới vào thư mục riêng biệt (vd: `src/components/NewFeature/`). Tuyệt đối không trộn lẫn vào các core components hiện tại.
- **Zero-Modification**: TUYỆT ĐỐI KHÔNG sửa/xóa/ghi đè UI layout, CSS, custom hooks, hay các hàm đang chạy. Việc kết nối tính năng mới CHỈ ĐƯỢC cắm thêm qua 1 Nút/Tab Navigation (Plug-and-play).
- **State & Schema Safety**: Mọi state mới phải là slice độc lập trong Zustand (không can thiệp vào `tasks`, `projects`, v.v.). Type mới viết nối ở cuối `src/types.ts` hoặc tạo file riêng. Cấm sửa đổi `BUSINESS_LOGIC.md`.

## 6. UI/UX & Responsive Performance Architecture
- **Atomic UI Component Isolation**: Mọi nút điều khiển UI/UX phức tạp (vd: `RibbonDisplayMenu`, Quick Access Toolbar) phải tách riêng thành standalone component và quản lý qua `UISlice` trong Zustand. Tuyệt đối không nhồi chung UI state vào data slices để tránh làm re-render toàn bộ bảng tính / danh sách công việc.
- **Mobile/iOS Responsive Anti-Cluttering**:
  - Trên màn hình di động/iOS, KHÔNG nhân bản hay xếp đè nhiều nút công cụ lên Header/Navigation.
  - Sử dụng class `hidden lg:inline-flex` để ẩn các nút Ribbon/Toolbar phức tạp trên mobile và gom gọn vào đúng 1 vị trí trực quan duy nhất trong Slide-out Navigation Drawer.
- **Sticky Controls & Reflow Prevention**: Các thanh công cụ/nút bấm quan trọng (vd: nút Edit Mode trong Task Detail, thanh Gantt Controls) phải dùng `sticky top-0 z-[100]` với `backdrop-blur-md` để theo dõi vị trí cuộn mượt mà mà không gây giật lag hay tính toán lại vị trí DOM (layout reflow).
- **Keyboard Shortcuts & Clean Listeners**: Các chế độ hiển thị toàn màn hình (Full-screen/Focus mode) phải gắn listener phím `Escape` trên `window` và bắt buộc cleanup listener khi unmount để chống rò rỉ bộ nhớ (memory leak).

## 7. Canvas & Graphics Performance Guards (Konva & SVG)
- **Hit-Graph Overhead Elimination**: Mọi Konva element không nhận sự kiện click/tap (Text labels, Alert Badges, Golden Focus Rings, Grid Lines, Background Map shapes) **BẮT BUỘC** gắn `listening={false}` và `perfectDrawEnabled={false}` để Konva không tốn CPU vẽ Hit Canvas ngầm.
- **High-Frequency Event Throttling**: Các thao tác Wheel, Pan, Pinch-to-zoom và Dragging phải bọc trong `requestAnimationFrame` và huỷ bằng `cancelAnimationFrame` khi unmount, ngăn chặn đơ UI trên trackpad và màn hình 120Hz/ProMotion.
- **Offscreen Canvas & Image Caching**: Bản vẽ mặt bằng nặng (PNG/SVG HD) phải decode qua `useOffscreenImage` hoặc memoized HTMLImage, cấm reload lại ảnh khi chuyển tầng hoặc thay đổi bộ lọc màu.
- **O(1) Data Pre-Indexing**: Tuyệt đối không dùng `.filter()` lồng trong `.map()` khi render canvas hoặc bảng tính lớn. Luôn index dữ liệu qua `Map<string, T[]>` trong `useMemo` trước khi render (chuyển đổi từ O(N*M) sang O(N)).

## 8. Realtime Chat, Comments & Inline Mutation Economy (Firestore Protection)
- **Zero-Query Read for Modals**: Mọi modal chi tiết (Task Detail, Quick Navigator, Project Comments) phải đọc thẳng từ state Zustand đã được sync, cấm gọi `getDoc` hoặc `query` độc lập từ Firestore.
- **Targeted ArrayUnion for Comments**: Thao tác thêm bình luận (`project.comments`), activity logs hoặc chat nội bộ phải dùng `arrayUnion()` trên doc dự án, tránh ghi đè toàn bộ doc gây race condition và xung đột dữ liệu.
- **Debounced Sync Queue (Auto-Save)**: Các ô nhập liệu nhanh trong Gantt, Detail, Review phải cập nhật tức thời vào Zustand state (0ms) và debounce 400ms trước khi đưa vào hàng đợi `syncQueue` (Firestore Batch Write), cấm phát sinh 1 write/mỗi ký tự gõ.

## 9. Task Hierarchy & Parent-Child Rollup Engine
- **Pure In-Memory Computed Rollup**: Mọi ngày bắt đầu (start), kết thúc (finish), thời lượng (duration) và tiến độ (%) của Task mẹ phải được tính tự động từ danh sách Task con **hoàn toàn trong bộ nhớ client** (Pure Function).
- **Zero Cascading Database Triggers**: Không tạo Cloud Function trigger hoặc vòng lặp write ngược lại Firestore để cập nhật Task mẹ, bảo toàn ngân sách Firestore và ngăn chặn lag mạng.
- **Circular Dependency Guard**: Luôn kiểm tra `visited` Set trong các hàm duyệt cây task để chống treo trình duyệt do vòng lặp cha - con vô tận.