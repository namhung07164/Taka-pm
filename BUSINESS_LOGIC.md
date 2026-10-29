# TAKASHIMAYA PROJECT MANAGEMENT - TÀI LIỆU BUSINESS LOGIC & BỘ QUY TẮC NGHIỆP VỤ TOÀN CỤC

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, quy tắc tài chính, công thức tính toán, RBAC và cơ chế đồng bộ ở đây KHÔNG ĐƯỢC XÓA HAY LÀM SAI LỆCH trong mọi bản cập nhật.

---

## 🏢 1. QUY TẮC PHẠM VI & PHÂN LẠI DỮ LIỆU (SCOPE & CÔ LẬP KHÓA)

### 1.1. Cô Lập 4 Khóa Định Danh (`projectId` + `projectCode` + `year` + `store`)
- **Tái sử dụng mã dự án**: Một mã dự án (`projectCode` như `A01`, `L1-105`) có thể tồn tại độc lập ở cả 2 chi nhánh (`HCM`, `HN`) hoặc qua nhiều niên độ tài chính (`2025`, `2026`, `2027`).
- **Cô lập tuyệt đối**: Mọi Task, Cost, Delegation Group bắt buộc có đủ 4 khóa: `projectId`, `projectCode`, `projectYear` (hoặc `year`), `projectStore` (hoặc `store`).
- **Ràng buộc đối chiếu**: Liên kết thực thể luôn ưu tiên khớp `projectId === project.id`. Dữ liệu cũ thiếu `projectId` bắt buộc thỏa mãn đồng thời cả 3 yếu tố: cùng `projectCode` + cùng `year` + cùng `store`.
- **Khóa sổ năm cũ (Archive Read-Only)**: Khi chọn năm tài chính nhỏ hơn năm hiện tại (`year < CurrentYear`), hệ thống tự động khóa chế độ **Chỉ xem (Read-Only)** để bảo vệ dấu vết kiểm toán.

---

## 💰 2. NGÂN SÁCH (BUDGET) & CHI PHÍ (COST)

### 2.1. Cấu Trúc Ngân Sách 3 Cấp (3-Tier Budget)
1. **Category (Hạng mục lớn)**: Định mức ngân sách tổng năm được phê duyệt.
2. **Sub-Category (Hạng mục con)**: Ngân sách được duyệt tính theo tỷ trọng: `Approved Budget = Category Budget × (Ratio% / 100)`.
3. **Detail Row (Chi tiết dự án)**: Liên kết trực tiếp qua `projectCode` để gom chi phí thực tế.
- **Công thức cốt lõi**:
  - `Spent (Đã chi)` = Tổng `amount` (**Chưa VAT / Excl. VAT**) của các khoản chi phí hợp lệ gắn với dòng ngân sách.
  - `Remaining Budget (Ngân sách còn lại)` = `Approved Budget - Spent (Excl. VAT)`.
  - `Utilization (%)` = `(Spent / Approved Budget) × 100`.
- **Ngưỡng cảnh báo màu**:
  - 🟢 **Xanh lục**: Utilization `< 80%` (An toàn).
  - 🟡 **Vàng cam**: Utilization `80% – 100%` (Cảnh báo cận trần).
  - 🔴 **Đỏ**: Utilization `> 100%` (Vượt ngân sách).
- **Phụ lục hợp đồng (Contract Addendum)**: Khi thêm phụ lục, ngân sách gốc tự động khóa (`isOriginalLocked = true`) để bảo toàn nguyên vẹn lịch sử gốc.

### 2.2. Chi Phí (Cost) & Thanh Toán 3 Đợt
- **Phân loại**:
  1. `Cost Summary`: Chi phí hợp đồng chính.
  2. `Variation Order (VO)`: Chi phí phát sinh (tự động cộng dồn vào tổng thực chi của hạng mục).
  3. `Other Expenses`: Chi phí vận hành/phát sinh lẻ khác.
- **Công thức VAT & Chênh lệch**:
  - `Contract Amount (Sau VAT)` = `Amount (Chưa VAT) × (1 + VAT% / 100)`.
  - `Difference (Chênh lệch)` = `Approved Budget - Total Excl. VAT` (Dương = Tiết kiệm, Âm = Vượt ngân sách).
- **Phân kỳ 3 đợt thanh toán (`P1`, `P2`, `P3`)**:
  - Tổng `%P1 + %P2 + %P3` luôn đối soát bằng **100%** giá trị hợp đồng sau VAT.
  - Khi nhập `P1` (Tạm ứng) và `P2` (Thanh toán tiến độ), đợt quyết toán cuối `P3` tự động tính: `P3 = Contract Amount (Sau VAT) - P1 - P2`.
- **Cảnh báo quyết toán đợt cuối (Final Payment Alert)**: Cảnh báo màu vàng/đỏ khi hạn quyết toán đợt 3 còn `≤ 14 ngày` mà chưa tích chọn `Final Payment Done`.

---

## 📋 3. QUẢN LÝ TẮC WBS, TIỀN NHIỆM (PREDECESSOR) & GANTT

### 3.1. Đánh Mã WBS & In-Memory Rollup
- **Mã WBS**:
  - Task gốc (Root Task): `<ProjectCode>-<Index>` (Ví dụ: `A01-1`, `A01-2`).
  - Task con (Sub-task): `<ParentCode>.<SubIndex>` (Ví dụ: `A01-1.1`, `A01-1.2`).
- **Rollup Task Mẹ (In-Memory Pure Function)**:
  - `Start (Mẹ)` = Ngày bắt đầu sớm nhất trong các Task con (`Min(Start)`).
  - `Finish (Mẹ)` = Ngày kết thúc muộn nhất trong các Task con (`Max(Finish)`).
  - `% Tiến độ` = Trung bình cộng % hoàn thành của các Task con.
  - Cấm dùng Cloud Function trigger ghi ngược để tránh vòng lặp ghi đè.

### 3.2. Quan Hệ Tiền Nhiệm (Predecessor) & Lập Lịch Tự Động
- **4 Loại liên kết chuẩn MS Project**:
  - `FS` (Finish-to-Start, Mặc định): `Start = Finish (Tiền nhiệm) + Lag`.
  - `SS` (Start-to-Start): `Start = Start (Tiền nhiệm) + Lag`.
  - `FF` (Finish-to-Finish): `Finish = Finish (Tiền nhiệm) + Lag`.
  - `SF` (Start-to-Finish): `Finish = Start (Tiền nhiệm) + Lag`.
- **Hỗ trợ Lag**: Độ trễ/sớm dạng `+N` hoặc `-N` ngày (Ví dụ: `A01-1FS+2`, `A01-1SS-1`).
- **Liên kết xuyên dự án (Cross-Project Predecessors)**: Cho phép phụ thuộc công việc của dự án khác, có cảnh báo huy hiệu tím.
- **Topological Cascade Scheduling**: Khi Task tiền nhiệm dời ngày, toàn bộ chuỗi Task phụ thuộc có bật `Realtime Update` sẽ tự động trượt lịch liền mạch, bọc `Circular Guard` chống lặp vô hạn.

---

## 🤝 4. ỦY QUYỀN GIAO VIỆC (DELEGATION) & TRACKER

### 4.1. Luồng Trạng Thái Giao Việc (Delegation State Machine)
1. `Assigned` (0%): Tạo giao việc cho PIC / Nhà thầu (`Party`).
2. `Accepted / On process` (50%): PIC nhận việc và tiến hành thi công.
3. `Pending completed` (85%): PIC gửi yêu cầu nghiệm thu (`Requested Approval`).
4. `Approved / Completed` (100%): Người giao việc hoặc Admin phê duyệt đạt.
5. `Rejected / Needs Rework` (25%): Trả về yêu cầu sửa chữa.

### 4.2. Tự Động Cập Nhật Ngày Thực Tế (Realtime Progress Sync)
- Khi sub-task đầu tiên chuyển sang `On process`, ngày `Start` thực tế của Task tự động chốt.
- Khi **100%** sub-task đạt `Approved / Completed`, Task cha tự động chốt ngày `Finish` thực tế và kích hoạt dây chuyền cập nhật ngày cho các Task kế tiếp.

---

## 🗺️ 5. MẶT BẰNG TƯƠNG TÁC (LAYOUT), DIỆN TÍCH (m²) & COLOR LEGEND

### 5.1. Liên Kết Multi-Unit Polygon (`linkCodes`)
- Một dự án có thể gộp nhiều ô mặt bằng (Ví dụ: `L1-101, L1-102`). Bản đồ tự động tô màu và gom nhóm dự án theo mã liên kết.

### 5.2. Công Thức Tính Diện Tích (`sizeM2`) Trong Bảng Color Legend
- **Quy tắc diện tích tổng các dự án**: Diện tích của từng nhóm trạng thái (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) được tính bằng **tổng diện tích (`sizeM2`) của các Project duy nhất (unique projects)** khớp trong nhóm đó (loại trừ tính trùng khi 1 project gộp nhiều ô polygon).
- **Fallback**: Chỉ khi ô mặt bằng chưa gắn Project hoặc Project chưa nhập `sizeM2`, hệ thống mới fallback dùng diện tích diện mạo hình học của polygon (`unit.sizeM2`).

### 5.3. Viền Màu Trạng Thái Khi Chọn Color Legend (Status Outline Guard)
- Khi nhấp vào một dòng trong Color Legend (Ví dụ: `Completed`, `In Progress`), các ô/dự án thuộc nhóm đó **có diện tích (`sizeM2 > 0`)** sẽ hiển thị **viền màu trạng thái rực rỡ nổi bật bao quanh polygon** trên bản đồ canvas.
- Các ô/dự án **không có diện tích (`sizeM2 = 0` hoặc chưa nhập)** sẽ **không có viền màu xung quanh**, giúp người quản lý nhận biết trực quan diện tích thực tế.

### 5.4. Thiết Lập & Gắn Paint Categories Độc Quyền Admin (Admin-Only Paint Setup & Real-time Filter Sync)
- **Quyền hạn độc quyền Admin**: Chỉ duy nhất tài khoản `Admin` (`role === 'admin'`) mới có quyền tạo mới, xóa bỏ Paint Categories và gắn các nhóm điều kiện động (`condition groups`) vào từng Paint Category trong Edit Mode.
- **Áp dụng bộ lọc toàn cục**: Khi Admin thiết lập hoặc chọn bộ lọc Paint Category (`activePaintFilter`), hệ thống tự động lưu trữ cấu hình lên Cloud Firestore (`taka_config/paint_categories`) và phát sóng thời gian thực đến tất cả tài khoản User khác. Toàn bộ người dùng sẽ tự động áp dụng bộ lọc và quy tắc phân loại hiển thị theo đúng cấu hình của Admin.
- **Chế độ Read-Only cho User**: Tài khoản thông thường chỉ có thể xem danh mục và phân nhóm đã được Admin gán sẵn, không được phép can thiệp chỉnh sửa hay xóa bỏ.

---

## 🛡️ 6. BẢO MẬT PHÂN QUYỀN (RBAC) & TỰ ĐỘNG SAO LƯU (CLOUDFLARE R2 BACKUP)

### 6.1. Ma Trận Phân Quyền (RBAC)
- **Admin / Super Admin**: Toàn quyền hệ thống, cấu hình RBAC, xuất/nhập Excel, phê duyệt và kích hoạt Backup.
- **Standard User**: Kiểm soát chi tiết qua 5 cờ phân quyền:
  1. `canWrite`: Thêm/Sửa/Xóa (tắt = Chỉ xem).
  2. `storePermissions`: Truy cập chi nhánh (`HCM`, `HN`).
  3. `locationPermissions`: Truy cập theo tầng/vị trí (`B2`, `B1`, `L1`... hoặc `All`).
  4. `partyPermissions`: Truy cập theo bộ phận/nhà thầu.
  5. `tabPermissions`: Cho phép/ẩn từng Tab chức năng.
- **Che giấu tài chính (Financial Masking)**: Tài khoản không có quyền xem tài chính sẽ thấy số tiền hiển thị dưới dạng `***`.

### 6.2. Tự Động Sao Lưu Nén Lên Cloudflare R2 (Cron R2 Auto-Backup)
- Hệ thống thiết lập Cron Trigger ngầm định kỳ xuất, nén GZIP toàn bộ dữ liệu dự án, công việc, ngân sách, chi phí và tải lên kho lưu trữ **Cloudflare R2**.
- Bảo hiểm dữ liệu tuyệt đối chống mất mát lịch sử từ thời điểm hiện tại đến mốc vận hành 2027+.

---

## 🔄 7. ĐỒNG BỘ ĐA THIẾT BỊ (DELTA SYNC) & KHỦ "ZOMBIE" TASK

### 7.1. Local-First & 0ms Optimistic UI
- Lưu/sửa/xóa cập nhật ngay lập tức vào Zustand & Dexie IndexedDB (0ms).
- Đẩy tác vụ Firestore ra chạy ngầm. Rớt mạng sẽ tự động đẩy vào hàng đợi `syncQueue` để phát lại khi có kết nối.

### 7.2. Kênh Delta Realtime & Hồi Phục Sau Đêm (Overnight Wake-up)
- Các thiết bị đồng bộ tức thì qua kênh `taka_deltas`.
- **Overnight Wake-up Heartbeat**: Khi máy tính/iPad mở lại sau khi ngủ qua đêm, hệ thống tự động phát hiện khoảng dừng, kéo bù Delta thiếu và quét đối chiếu 2 chiều (Bi-directional Reconciliation) để loại trừ triệt để các "Task ma" đã bị xóa từ thiết bị khác mà không cần người dùng bấm xóa cache.
