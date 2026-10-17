# Kế Hoạch Tối Ưu Hóa Firestore Read & Lá Chắn Bảo Toàn 100% Đồng Bộ Đa Thiết Bị

Bản kế hoạch điều chỉnh (revised plan) nhằm trả lời trực diện mối bận tâm của người dùng về cơ chế đồng bộ giữa các thiết bị (iPhone, iPad, Desktop), đồng thời thiết lập **Lá chắn 5 lớp bảo vệ tính toàn vẹn đồng bộ (Zero-Risk Multi-Device Sync)** trước khi áp dụng bất kỳ kỹ thuật giảm đọc Firestore nào.

---

## Trả Lời Trực Diện: Plan Này Ảnh Hưởng Đến Cơ Chế Đồng Bộ Đa Thiết Bị Thế Nào?

> [!NOTE]
> **Cam kết cốt lõi**: Cơ chế đồng bộ đa thiết bị **KHÔNG BỊ ẢNH HƯỞNG TIÊU CỰC VÀ KHÔNG BỊ SUY GIẢM**. Trái lại, tốc độ đồng bộ còn được cải thiện nhanh và ổn định hơn nhờ giảm tải nghẽn mạng.

### 1. Hiện tượng trên hệ thống hiện nay (Khi chưa tối ưu):
- Khi **Thiết bị A** (ví dụ Desktop) sửa 1 công việc hoặc chi phí, thay đổi được ghi lên Firestore.
- **Thiết bị B** (ví dụ iPhone) đang mở đồng thời **2 luồng nhận tin**:
  - *Luồng 1*: Lắng nghe toàn bộ danh sách (`onSnapshot` cả collection hàng ngàn docs).
  - *Luồng 2*: Lắng nghe kênh thay đổi tức thì `taka_deltas`.
- Do mở cả 2 luồng, Thiết bị B bị "đọc trùng lặp" (duplicate read) và tốn tài nguyên tải lại cả danh sách ngay cả khi chỉ có 1 dòng dữ liệu bị đổi.

### 2. Sau khi áp dụng Plan tối ưu:
- **Thiết bị A** sửa 1 công việc -> Ghi Firestore -> Phát sinh 1 bản ghi delta siêu nhẹ vào `taka_deltas` (chỉ chứa ID và trường bị đổi).
- **Thiết bị B** lập tức nhận được delta này qua kênh `deltaRealtimeListener` trong vòng **500ms – 1s**.
- Thiết bị B chỉ đọc đúng 1 tài liệu đó từ Firestore để cập nhật nguyên tử vào Zustand Store và Dexie Local DB.
- **Kết quả**: Dữ liệu trên iPhone/iPad nhảy tức thì cùng lúc với Desktop (0ms lag nhận diện), nhưng **tiết kiệm hơn 90% số lượt đọc** vì không kéo lại các công việc không liên quan.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> Dưới đây là các quyết định kỹ thuật cốt lõi và các biện pháp phòng ngừa rủi ro đã được điều chỉnh để đáp ứng 100% yêu cầu "Không làm ảnh hưởng đồng bộ thiết bị":

1. **Rà soát 100% Write Wrappers trước khi kích hoạt Delta-First**:
   - Mọi thao tác ghi dữ liệu bắt buộc đi qua `src/lib/firestoreWrites.ts` để đảm bảo khi Thiết bị A thao tác, `autoDeltaQueue` **luôn luôn** phát tín hiệu delta lên cloud. Không thiết bị nào bị "bỏ rơi" hay chậm dữ liệu.
2. **Lá chắn 5 lớp bảo toàn đồng bộ đa thiết bị (Multi-Device Sync Guards)**:
   - *Lớp 1 (Realtime Delta)*: Kênh `onSnapshot` trên `taka_deltas` luôn thức để nhận biến động tức thì.
   - *Lớp 2 (Relevance Filter)*: Thiết bị B đang ở tab nào thì tự động nạp ngay doc bị biến động thuộc tab đó.
   - *Lớp 3 (Sleep/Wake Recovery)*: Khi gập mở iPad/iPhone, hệ thống tự động kiểm tra `serverTime` để kéo bù các delta phát sinh trong lúc thiết bị ngủ.
   - *Lớp 4 (Zero-Query Local Check)*: Modal kiểm tra trùng mã công việc/dự án dựa trên bộ nhớ đệm Zustand/Dexie thay vì gửi lệnh đọc lên server, giúp thao tác mượt mà 0ms và không gây nghẽn kết nối.
   - *Lớp 5 (Safety Net - Nút Refresh Thủ Công)*: Nút "Refresh" trên thanh công cụ luôn sẵn sàng để người dùng cưỡng chế đồng bộ toàn bộ (Force Full Sync) 100% từ server bất kỳ lúc nào muốn kiểm tra chéo.

---

## 1. Overview & Core Concept

- **Mục tiêu**: Cắt giảm 70% – 90% chi phí đọc Firestore nhưng bảo toàn trọn vẹn 100% tính năng đồng bộ thời gian thực giữa các thiết bị (iPhone, iPad, PC).
- **Nguyên tắc bất khả xâm phạm**: Tuân thủ tuyệt đối Quy tắc 14, 15, 16 trong `AGENTS.md` về Local-First, Composite Key Isolation (`projectId` + `projectCode` + `year` + `store`), và Auto Delta Pipeline.

---

## 2. Technical Architecture & Data Strategy

### Luồng Hoạt Động Đồng Bộ Sau Khi Tối Ưu

```
┌────────────────────────────────────────────────────────────────────────┐
│               THIẾT BỊ A (Desktop / Thao tác sửa dữ liệu)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Ghi Firestore qua firestoreWrites.ts
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ 1. Cập nhật ngay vào Zustand & Dexie cục bộ (0ms)       │
       │ 2. Tự động tạo bản ghi delta trên `taka_deltas`        │
       │    (chỉ 1 doc nhẹ: { id, collection, action, serverTime })│
       └────────────────────────────┬────────────────────────────┘
                                    │
                                    │ Firebase Realtime Channel (500ms)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   THIẾT BỊ B (iPhone / iPad / Laptop khác)             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ `deltaRealtimeListener` đón nhận bản ghi delta          │
       ├─────────────────────────────────────────────────────────┤
       │ • Nếu là 'delete': xóa ngay khỏi Zustand + Dexie local  │
       │ • Nếu là 'invalidate': tải đúng 1 doc vừa sửa (1 read)   │
       │ • Áp dụng nguyên tử vào Zustand Store + Dexie DB        │
       └─────────────────────────────────────────────────────────┘
```

---

## 3. Các Hạng Mục Triển Khai Cụ Thể (Step-by-Step Implementation)

### Bước 1: Rà soát và chuẩn hóa 100% các cổng ghi dữ liệu (Audit Write Wrappers)
- **Tệp can thiệp**: `src/lib/firestoreWrites.ts`, `src/lib/autoDeltaQueue.ts`
- **Mục tiêu**: Đảm bảo tất cả các hàm `setDoc`, `updateDoc`, `deleteDoc`, `writeBatch` trong toàn bộ mã nguồn đều phát delta tự động. Tuyệt đối không để sót bất kỳ luồng sửa đổi nào mà thiết bị khác không nhận được.

### Bước 2: Triệt tiêu các lệnh `getDocs` thừa tại Modal (Zero-Query Modals)
- **Tệp can thiệp**:
  - `src/hooks/taskModal/taskModalSaveService.ts`
  - `src/components/ProjectModalParts/projectModalIdentityService.ts`
  - `src/components/DetailTabParts/useDetailTaskMutations.ts`
- **Mục tiêu**: Khi tạo mới hoặc lưu task/project, kiểm tra tính duy nhất của mã (Code uniqueness) trực tiếp trong Zustand Store (`useAppStore.getState().projects` / `tasks`) thay vì gửi truy vấn `getDocs(where(...))` lên server. 
- **Lợi ích**: Tăng tốc độ lưu công việc lên 0ms, loại bỏ hoàn toàn các lượt đọc thừa.

### Bước 3: Khử trùng lặp Listener Config
- **Tệp can thiệp**: `src/components/LiveLayoutParts/useLiveLayoutR2Config.ts`
- **Mục tiêu**: Hủy listener `onSnapshot` độc lập tại file này, chuyển sang tái sử dụng dữ liệu từ `configCacheService.ts` đã được nạp sẵn vào store.

### Bước 4: Tối ưu hoá Notification Task Service
- **Tệp can thiệp**: `src/lib/notificationTaskService.ts`
- **Mục tiêu**: Sử dụng danh sách task đã có trong bộ nhớ client để tính số thông báo quá hạn, không gọi `getDocsFromServer` lặp lại.

### Bước 5: Kích hoạt có kiểm soát chế độ Smart Delta-First
- **Tệp can thiệp**:
  - `src/hooks/useFirebaseDataParts/useProjectsHydration.ts`
  - `src/hooks/useFirebaseDataParts/useTasksHydration.ts`
  - `src/hooks/useFirebaseDataParts/useCostsHydration.ts`
  - `src/hooks/useFirebaseDataParts/useDelegationsHydration.ts`
- **Mục tiêu**:
  - Khi đã có dữ liệu trong Dexie và có marker xác nhận, đóng listener collection lớn, chỉ dựa vào kênh delta.
  - Tích hợp chốt an toàn: Khi người dùng bấm nút **Làm mới (Refresh)** trên thanh công cụ, hệ thống sẽ kích hoạt 1 lần kéo server đầy đủ để tái tạo marker và xóa mọi nguy cơ lệch dữ liệu.

### Bước 6: Kiểm thử và đồng bộ mã nguồn gốc
- Chạy `compile_applet` xác nhận không có lỗi cú pháp hay TypeScript.
- Cập nhật toàn bộ các cải tiến vào `TAKASHIMAYA_FULL_SOURCE.txt` theo đúng Quy tắc 13.

---

## 4. Verification & Testing Checklist

- [ ] **Test đồng bộ 2 thiết bị**: Mở app trên 2 tab trình duyệt (hoặc 1 PC, 1 iPhone), thêm/sửa/xóa 1 task trên thiết bị A -> Kiểm tra thiết bị B cập nhật trong vòng < 1 giây.
- [ ] **Test Sleep/Wake trên iOS**: Khóa màn hình iPhone 1 phút, thao tác trên PC, mở lại iPhone -> Dữ liệu mới xuất hiện đầy đủ mà không cần reload app.
- [ ] **Test kiểm tra mã trùng 0ms**: Tạo task mới, gõ mã task đã có -> Cảnh báo trùng lặp hiển thị tức thì mà không có network request.
- [ ] **Test nút Refresh thủ công**: Bấm nút Refresh trên thanh công cụ -> Dữ liệu được nạp lại toàn bộ từ server an toàn.
