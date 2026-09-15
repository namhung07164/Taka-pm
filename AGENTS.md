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

## 5. Cập Nhật Tài Liệu Định Kỳ
- Khi hoàn thành tính năng mới, AI bắt buộc cập nhật các bước thao tác vào `USER_MANUAL.md`.
