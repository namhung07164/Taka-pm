# TAKASHIMAYA PROJECT MANAGEMENT - TÀI LIỆU BUSINESS LOGIC TOÀN CỤC

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM**: Toàn bộ logic nghiệp vụ, quy tắc tài chính, RBAC ở đây KHÔNG ĐƯỢC XÓA HAY LÀM SAI LỆCH trong mọi bản cập nhật.

## 1. QUY TẮC BỘ LỌC PHẠM VI (STORE & YEAR SCOPE)
- **Store Scope (Chi nhánh)**: Lọc theo HCM hoặc HN. "All Stores" kết hợp dữ liệu toàn quốc.
- **Fiscal Year Scope (Năm tài chính)**: Lọc theo năm. "All Years" gộp toàn bộ lịch sử. Dữ liệu kế thừa từ Bộ lọc cấp cao -> Tab -> Modal.

## 2. CẤU TRÚC THỰC THỂ & NGHIỆP VỤ (BUSINESS DOMAINS)
### 2.1. Dự Án (Projects) & Ngân Sách (Budget)
- **Cấu trúc Budget 3 cấp**: Project Mẹ (Self-node) -> Sub-Project (Con). Ngân sách tự động Rollup từ Con lên Mẹ.
- **Tính toán số dư (Remaining Budget)**: 
  `Remaining = Budget - Actual + SupportingFee`
  - *Xanh (Normal)*: Remaining > 20% Budget
  - *Vàng (Warning)*: 0 <= Remaining <= 20% Budget
  - *Đỏ (Danger)*: Remaining < 0
- Nếu có Sub-Project mang tính dự chi (`Forc`), Project Mẹ sẽ tự động ghim cờ `hasForc`.

### 2.2. Chi Phí & Phân Kỳ Thanh Toán (Cost Management)
- **Phân loại**: `act` (Thực chi) và `forc` (Dự chi).
- **VAT**: Hỗ trợ 10%, 8%, 0%, tính toán phải dùng `Math.round()`.
- **Phân kỳ 3 đợt (Paid Breakdown)**: 
  Chi phí có thể trả thành 3 đợt (`firstPaid`, `secondPaid`, `thirdPaid`). 
  Mỗi đợt có thể là `Actual` (Đã trả) hoặc `Forecast` (Dự kiến).
  `Balance = Actual - (firstPaid + secondPaid + thirdPaid)`. Bằng 0 khi thanh toán đủ.

### 2.3. Công Việc & Ủy Quyền (Tasks & Delegation)
- **Vòng đời trạng thái**: Đóng băng (Icebox) -> Cần làm (To Do) -> Đang làm (In Progress) -> Chờ duyệt (Review) -> Hoàn thành (Done) -> Hủy (Canceled).
- **Phân cấp WBS**: Hỗ trợ Sub-task kế thừa mã tự động. Có logic tính toán phụ thuộc (Dependencies) khi kết xuất Gantt chart.
- **Ủy quyền (Delegation)**:
  - Cho phép giao/ủy quyền Task xuyên bộ phận (Cross-Party). 
  - Khi một User/Party được tag vào `party` của Project/Task, họ có quyền truy cập vĩnh viễn vào nội dung đó.

### 2.4. Sơ Đồ Mặt Bằng (Floor Plan & Markers)
- Sử dụng tọa độ phần trăm (`x%, y%`) để ghim vị trí sự cố trên bản đồ tòa nhà, đảm bảo marker hiển thị đúng trên mọi kích thước màn hình.
- Marker đổi màu theo mức độ ưu tiên/trạng thái xử lý.

### 2.5. Báo Cáo & In Ấn (Export)
- Xuất dữ liệu: `Excel (.xlsx)`, `CSV`, `PDF`, `JSON`.
- In ấn: Bắt buộc chuẩn Vector/Canvas với Watermark bảo mật để chống rò rỉ.

## 3. MA TRẬN PHÂN QUYỀN NGƯỜI DÙNG (RBAC)
| Hành Động | Admin | Manager | Member | Viewer |
| :--- | :--- | :--- | :--- | :--- |
| **Xem dữ liệu** | Toàn bộ | Chi nhánh mình | Dự án tham gia | Toàn bộ / Giới hạn |
| **Tạo mới Dự án** | Có | Có | Không | Không |
| **Tạo & Giao Task** | Có | Có | Trong dự án | Không |
| **Cập nhật Task** | Có | Có | Task của mình | Không |
| **Duyệt & Tạo Cost**| Có | Có | Tạo bản nháp | Không |
| **Ủy quyền** | Có | Có | Task mình làm | Không |
| **Quản trị RBAC** | Có | Không | Không | Không |

**Quyền Master Đặc Biệt (`"all"`)**:
- **Location Master**: Được gán `locationPermissions['all'] = true` -> Cho phép xem và thao tác trên mọi chi nhánh.
- **Party Master**: Được gán `partyPermissions['all'] = true` -> Vượt qua rào cản phân ban, có quyền điều phối/xem toàn bộ Task/Delegation của mọi phòng ban (Party) trong hệ thống.

## 4. TỰ ĐỘNG HÓA KIỂM THỬ (VITEST)
- **`src/lib/financialService.test.ts`**: Chứa 15 Test Cases bảo vệ logic tài chính cốt lõi (Phân kỳ 3 đợt, số dư Cost, Rollup Budget, cảnh báo sức khỏe tài chính). Bắt buộc phải pass `npm test` khi thay đổi thuật toán.

## 5. QUY TẮC CÔ LẬP KHÓA & ĐỒNG BỘ DỮ LIỆU ĐA THIẾT BỊ (COMPOSITE KEY ISOLATION & MULTI-DEVICE SYNC)
### 5.1. Định Danh & Cô Lập Bằng Bộ 4 Khóa (`projectId` + `projectCode` + `year` + `store`)
- **Tái Sử Dụng Mã Dự Án**: Mã dự án (`projectCode`) có thể lặp lại qua các năm (ví dụ cùng một thương hiệu thi công năm 2025 và tái ký năm 2026) hoặc giữa các chi nhánh (HCM vs HN).
- **Ràng Buộc Trực Thuộc**: Mỗi Task, Cost, hoặc Delegation Group thuộc quyền sở hữu độc nhất của Dự án có `id === projectId`.
- **Ràng Buộc Kế Thừa**: Trường hợp dữ liệu cũ thiếu `projectId`, chỉ được phép gán Task vào Dự án nếu đồng thời thỏa mãn cả 3 điều kiện: cùng `projectCode`, cùng `year`, và cùng `store`.
- **Cấm Nhầm Lẫn Quy Mô**: Tuyệt đối cấm gộp số liệu tiến độ, tính ngày bắt đầu/kết thúc dự án, phân bổ ngân sách, hoặc đánh số thứ tự công việc WBS (`ProjectCode#1, #2...`) giữa các dự án khác năm hoặc khác chi nhánh.

### 5.2. Đồng Bộ Thực Thể & Khử "Bóng Ma" Dữ Liệu Đa Thiết Bị
- **Tính Nhất Quán Giữa Các Thiết Bị (iPhone, iPad, Desktop)**: Khi xóa hoặc cập nhật Task trên thiết bị A, bản ghi delta phát sinh phải mang theo `projectId`, `projectCode`, `projectYear`, `projectStore`.
- **Dọn Sạch Tóm Tắt Dự Án (`taskSummaries`)**: Thiết bị B khi nhận delta xóa task phải cắt bỏ ngay lập tức task tương ứng ra khỏi `taskSummaries` của Dự án trong bộ nhớ và Dexie, đồng thời tính toán lại ngày và tiến độ (`calculateProjectComputedDates`).
- **Chống Hồi Sinh Task Đã Xóa**: Ngăn chặn tình trạng thiết bị B nạp lại task đã xóa từ cache IndexedDB hoặc từ `taskSummaries` chưa kịp làm sạch, đảm bảo tính toàn vẹn 100% trên toàn bộ các thiết bị đang hoạt động đồng thời.
