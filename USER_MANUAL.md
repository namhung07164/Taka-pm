# 📘 CẨM NANG HƯỚNG DẪN SỬ DỤNG TOÀN DIỆN TAKASHIMAYA PM (USER MANUAL & FAQ KNOWLEDGE BASE)

> 💡 **Tài liệu chuẩn mực (Single Source of Truth)**: Được biên soạn toàn diện cho **Người dùng mới (Onboarding)**, **Chuyên gia Nghiệp vụ (PM / QS / Kế toán / Quản lý mặt bằng)**, **Trợ lý Hỏi đáp Thông minh (FAQ Bot)** và **AI Agent**. Mỗi phân hệ đều được trình bày theo cấu trúc: **"🎯 Hiểu đơn giản ➔ 👆 Thao tác 3 bước ➔ 📐 Công thức & Quy tắc ➔ 💡 Mẹo thực chiến"**.

---

## 🧭 MỤC LỤC TRA CỨU NHANH (QUICK NAVIGATION INDEX)

1. **[🚀 Mục 1: Lộ Trình 5 Phút Cho Người Mới, Cô Lập 4 Khóa & Quick Navigator (`Fix Project Code`)](#-1-bắt-đầu-nhanh-cho-người-mới-cô-lập-4-khóa--quick-navigator)**
2. **[⚡ Mục 2: Tab My Work – Quản Lý Việc Cá Nhân, Bộ Lọc Thời Gian & Đồng Bộ "Đã Kiểm Tra" Đa Thiết Bị](#-2-tab-my-work--không-gian-làm-việc-cá-nhân--đồng-bộ-kiểm-tra-theo-tài-khoản)**
3. **[📊 Mục 3: Tab General & Summary – Quản Lý Danh Mục Dự Án, Cột Mốc & Báo Cáo KPI](#-3-tab-general--summary--quản-lý-danh-mục-dự-án--báo-cáo-tổng-hợp)**
4. **[📝 Mục 4: Tab Task Detail – Chia Đầu Việc (WBS), Tiền Nhiệm (`Predecessor #`) & Nhập/Xuất Excel](#-4-tab-task-detail--chia-đầu-việc-wbs--tiền-nhiệm-predecessor)**
5. **[📈 Mục 5: Tab Gantt Chart – Biểu Đồ Tiến Độ, Kéo Giãn Tháng, Baseline & Focus Mode](#-5-tab-gantt-chart--biểu-đồ-tiến-độ-thời-gian-thực)**
6. **[💰 Mục 6: Tab Budget & Cost – Cây Ngân Sách Cha-Con, Thuế VAT & Thanh Toán 3 Đợt](#-6-tab-budget--cost--quản-lý-ngân-sách--chi-phí-3-đợt)**
7. **[🤝 Mục 7: Tab Delegation, Tracker 5 Bước & Đồng Bộ Lịch iPhone/iPad Qua Mã QR](#-7-tab-delegation--calendar--giao-việc-nghiệm-thu-5-bước--đồng-bộ-lịch-ios)**
8. **[🗺️ Mục 8: Tab Layout 2D & Picture Mapping – Bản Đồ Mặt Bằng, Diện Tích (`m²`), Quy Tắc Động & Xuất/Nhập CSV 2 Sheet](#-8-tab-layout-2d--picture-mapping--mặt-bằng-diện-tích-m²--dynamic-hierarchy)**
9. **[🛡️ Mục 9: Phân Quyền 5 Lớp (RBAC), Nhật Ký Kiểm Toán (Audit Log) & Đồng Bộ Đám Mây Cloudflare R2](#-9-phân-quyền-rbac-nhật-ký-kiểm-toán--đồng-bộ-đa-thiết-bị-r2)**
10. **[⌨️ Mục 10: Bảng Phím Tắt Thần Tốc & Bộ Câu Hỏi Thường Gặp (Top FAQ)](#-10-bảng-phím-tắt-thần-tốc--hỏi-đáp-nhanh-top-faq)**

---

## 🚀 1. BẮT ĐẦU NHANH CHO NGƯỜI MỚI, CÔ LẬP 4 KHÓA & QUICK NAVIGATOR

### 🎯 Hiểu đơn giản
Hệ thống **Takashimaya Project Management (Taka-PM / T-Project)** quản lý trọn vẹn vòng đời dự án cải tạo, thiết kế và thi công gian hàng tại **Takashimaya TP.HCM (`HCM`)** và **Hà Nội (`HN`)** xoay quanh 5 trụ cột:
**Việc của tôi (`My Work`) ➔ Dự án (`General`) ➔ Tiến độ (`Task Detail / Gantt`) ➔ Tài chính (`Budget / Cost`) ➔ Mặt bằng (`Layout 2D / Picture Mapping`)**.

### 🔑 Quy tắc Vàng #1: "Cô Lập Tuyệt Đối 4 Khóa Định Danh"
Mọi dữ liệu trong hệ thống luôn được phân tách độc lập theo **4 khóa**:
`ID Dự án (projectId)` + `Mã Dự án (projectCode)` + `Năm (year)` + `Chi nhánh (store)`
* **Ví dụ thực tế**: Cùng mã gian hàng `L1-105` nhưng ở năm `2026` và năm `2027` (hoặc giữa chi nhánh `HCM` và `HN`) là **các dự án hoàn toàn độc lập**, không bao giờ bị cộng nhầm tiến độ, công việc hay tiền bạc.
* **Khóa sổ năm cũ (`Archive Read-Only`)**: Khi bạn chọn năm tài chính nhỏ hơn năm hiện tại, hệ thống tự động bật chế độ **Chỉ Xem (`Read-Only`)** để bảo vệ số liệu kiểm toán lịch sử.

### 🔑 Quy tắc Vàng #2: Điều Hướng `Quick Navigator` & Ô `Fix Project Code` vs `Search`
Trên thanh công cụ của các Tab (`Detail`, `Gantt`, `Budget`, `Cost`, `My Work`), bạn sẽ thấy **2 ô lọc riêng biệt**:
1. **Ô `Fix Project Code` (Ghim cố định mã dự án)**:
   - Khi bạn mở bảng **`Quick Navigator`** (hoặc bấm vào liên kết mã dự án từ bảng khác) để nhảy tới một dự án, hệ thống sẽ **tự động điền mã dự án vào ô `Fix Project Code`** và **để trống hoàn toàn ô `Search`**.
   - **Tác dụng thông minh**: Khi `Fix Project Code` có mã dự án, hệ thống tự động mở khóa bộ lọc trạng thái/tiền tệ (`All`), tự nhảy bộ lọc tầng (`Location`) sang đúng tầng của dự án đó, và tự động bung mở các dòng con.
2. **Ô `Search` (Tìm kiếm từ khóa phụ)**:
   - Vì dự án đã được ghim ở ô `Fix Project Code`, ô `Search` luôn trống để bạn thoải mái gõ thêm từ khóa lọc sâu bên trong dự án đó (ví dụ: tìm tên nhà thầu, chữ `"MEP"`, `"Handover"`, hoặc tên hợp đồng).
   - Khi muốn bỏ ghim dự án để xem lại toàn bộ danh sách, chỉ cần bấm nút **`X`** trên nhãn `Fix Project Code`.

### 🧭 Hệ Thống Menu Điều Hướng Trên Thanh Header
1. ⚡ **`My Work`**: Trung tâm quản lý công việc cá nhân hàng ngày, lọc theo `Today / This Week / Overdue` và đánh dấu hoàn tất đồng bộ đa thiết bị.
2. 📊 **`Report`**:
   - `Calendar`: Lịch biểu tổng quan theo tháng/tuần & đồng bộ lịch iPhone/iPad (`QR Webcal`).
   - `Layout`: Bản đồ số mặt bằng 2D các tầng (`B2` ➔ `L5`), tô màu tiến độ & tính diện tích (`m²`).
   - `Picture mapping`: Thiết kế polygon mặt bằng, phân nhóm tự động theo quy tắc (`Dynamic Hierarchy`), nhập/xuất CSV & Excel 2 Sheet và đồng bộ đám mây `Cloudflare R2`.
   - `Summary`: Dashboard biểu đồ KPI tổng hợp, tiến độ và dòng tiền giải ngân.
3. 📋 **`Index`**:
   - `General`: Bảng danh sách tổng quan toàn bộ dự án (Trang chủ mặc định khi khởi động).
   - `Gantt`: Biểu đồ thanh tiến độ thời gian thực, đường `TODAY`, `Baseline` & kéo thả lịch.
   - `Task detail`: Bảng chia nhỏ đầu việc (`WBS`), nối dây chuyền tiền nhiệm (`Predecessor #`).
4. 💰 **`Financial`**:
   - `Budget`: Quản lý định mức ngân sách, phí hỗ trợ (`Supporting Fee`) & gộp dự án Cha – Con (`Project Modular`).
   - `Cost`: Quản lý hợp đồng, phát sinh (`VO`), thuế VAT (`0%`, `8%`, `10%`) & thanh toán 3 đợt (`1st, 2nd, 3rd Paid`).
5. 🤝 **`Delegation`** *(hoặc trong nhóm quản lý công việc)*:
   - `Delegation`: Giao việc cho cá nhân (`PIC`) / nhà thầu (`Party`) & duyệt nghiệm thu 5 bước.
   - `Del. Calendar`: Lịch theo dõi hạn chót (`Deadline`) của các đầu việc ủy quyền.
6. ❓ **`Help & Admin`**:
   - `Manual` & `Trợ lý HDSD (Nút góc dưới phải)`: Cẩm nang tương tác song ngữ Việt – Anh, xuất PDF & Chatbot AI 24/7.
   - `AccControl`, `Audit`, `Setting`: Quản lý phân quyền người dùng, nhật ký kiểm toán và sao lưu đám mây R2.

### ⚡ Bộ Công Cụ Tiện Ích Toàn Cục Trên Header
* **Bộ lọc Toàn cục (`Year` • `Store` • `Location`)**: Luôn giữ nguyên lựa chọn của bạn khi chuyển qua lại giữa các Tab.
* **Đổi tiền tệ (`'000 VND` / `JPY` / `USD`)**: Tự động quy đổi toàn bộ bảng `Budget`, `Cost`, `Summary` theo tỷ giá. *(Lưu ý: Khi đang xem `JPY` hoặc `USD`, các ô nhập tiền tự động khóa để tránh nhập nhầm đơn vị; hãy chọn lại `'000 VND` khi cần sửa số tiền).*

---

## ⚡ 2. TAB MY WORK – KHÔNG GIAN LÀM VIỆC CÁ NHÂN & ĐỒNG BỘ KIỂM TRA THEO TÀI KHOẢN

### 🎯 Dùng để làm gì?
Giúp từng cá nhân (ví dụ: `CP-HUNG`, PM, QS, Kỹ sư giám sát) biết chính xác **hôm nay và tuần này mình cần xử lý những việc gì**, theo dõi cảnh báo trễ hạn (`Critical & Overdue`), duyệt nghiệm thu và **tích chọn đánh dấu các việc đã kiểm tra** đồng bộ tức thì giữa Điện thoại iOS, iPad và Laptop.

### 👆 Thao tác 3 bước quản lý công việc hàng ngày
1. **Bước 1 – Xem Bảng Tóm Tắt (`Today's Work Briefing`)**:
   - Ngay đầu trang là 4 thẻ tổng hợp thông minh: **Tasks & Work** (Báo số việc quá hạn đỏ, ưu tiên cao cam, đang làm xanh), **Schedule & Milestones** (Số dự án sắp bàn giao/khai trương), **Delegation Workflow** (Số luồng việc ủy quyền), và **Approvals & Rework** (Số việc chờ duyệt hoặc bị trả về sửa lại).
   - Chế độ mặc định **`Summary Mode (0 Read)`** đọc trực tiếp từ bộ nhớ đệm siêu tốc mà không tốn lượt đọc máy chủ. Khi cần tải toàn bộ ghi chú chi tiết, bấm **`Load Full Details`**.
2. **Bước 2 – Lọc Việc Cần Làm Theo Thời Gian & Dự Án**:
   - Sử dụng bộ lọc thời gian (`Time Filter`):
     + **`Today`**: Chỉ hiện việc cần làm hôm nay và việc quá hạn khẩn cấp.
     + **`This Week`** / **`Next 7 Days`** / **`This Month`**: Lọc việc đến hạn trong tuần này, 7 ngày tới hoặc tháng này.
     + **`Overdue`**: Chỉ lọc riêng các việc đang trễ hạn để xử lý gấp.
   - Kết hợp cùng nút chọn chi nhánh **`All | HCM | HN`**, ô **`Fix Project Code`** (cố định 1 dự án), ô **`Search tasks`** và 3 chế độ nhìn: **`Kanban`** (Bảng cột trực quan), **`List`** (Danh sách gọn), hoặc **`Calendar`** (Lịch cá nhân).
3. **Bước 3 – Tích Chọn "Đã Kiểm Tra" (`Mark as Reviewed`) Đồng Bộ Theo Tài Khoản**:
   - Khi bạn đã kiểm tra hoặc xử lý xong một đầu việc trên thẻ `To Do / Assigned` hoặc `In Progress`, hãy **tích vào ô tròn `✓` trên thẻ công việc đó**.
   - Đầu việc sẽ lập tức chuyển sang cột **`Completed / Reviewed`**.

### 🔄 Quy tắc Đồng Bộ Đa Thiết Bị Theo Tài Khoản (`Per-Account Sync`)
* **Đồng bộ xuyên suốt iOS ⇄ iPad ⇄ Laptop**:
  - Trạng thái các task bạn đã tích kiểm tra được lưu gắn liền với **tài khoản đăng nhập của bạn** (ví dụ: `CP-HUNG`) trên đám mây (`taka_config/mywork_reviewed_<account>`) và phát tín hiệu thời gian thực qua kênh `taka_deltas`.
  - **Ví dụ thực tế**: Khi `CP-HUNG` đi kiểm tra hiện trường bằng iPhone (iOS) và tích chọn hết 5 task đã kiểm tra, thì ngay khi `CP-HUNG` mở máy tính Laptop lên, cả 5 task đó cũng tự động nằm gọn trong cột **`Completed`** trên Laptop, **tuyệt đối không hiện lặp lại** ở cột `To Do` hay `In Progress`.
* **Cơ chế Tự Động Nhắc Lại Thông Minh (`Smart Auto-Reopen`)**:
  - Nếu một công việc đã được bạn tích kiểm tra, nhưng sau đó đồng nghiệp hoặc cấp trên **cập nhật lại % tiến độ mới, đổi ngày hạn chót, hoặc bấm `Reject` yêu cầu làm lại**, hệ thống sẽ phát hiện chữ ký trạng thái thay đổi và **tự động đưa công việc đó quay lại cột `To Do / In Progress`** để bạn không bao giờ bỏ sót biến động mới!

---

## 📊 3. TAB GENERAL & SUMMARY – QUẢN LÝ DANH MỤC DỰ ÁN & BÁO CÁO TỔNG HỢP

### 🎯 Dùng để làm gì?
* **Tab `General`**: Nơi khởi tạo dự án mới, quản lý danh sách toàn bộ dự án, theo dõi tiến độ Kế hoạch (`Plan %`) so với Thực tế (`Act %`), trạng thái (`Upcoming`, `On process`, `Completed`, `Delayed`) và 3 mốc ngày trọng yếu (`Tak Start`, `Handover`, `Opening`).
* **Tab `Summary`**: Cung cấp bức tranh tổng thể qua hệ thống thẻ chỉ số KPI, biểu đồ phân bổ ngân sách, tiến độ theo chi nhánh `HCM`/`HN` và xuất báo cáo tổng hợp.

### 👆 Thao tác 3 bước: Tạo Dự Án Mới Chuẩn Xác
1. **Bước 1**: Nhấp nút **`+ New Project`** (hoặc nhấn phím tắt **`P`**).
2. **Bước 2**: Nhập thông tin định danh dự án:
   - `Code`: Mã dự án viết hoa (VD: `L1-105`).
   - `Project Code Link (linkCodes)`: Nhập mã ô gian hàng trên mặt bằng 2D. Nếu dự án gộp nhiều ô mặt bằng, nhập cách nhau bằng dấu phẩy (VD: `L3-303-1, L3-303-2`). Bản đồ sẽ tô màu chính xác từng ô được liên kết.
   - `Store` (`HCM` / `HN`), `Location` (Tầng `B2`..`L5`), `Size (m²)` (Diện tích thương mại của dự án), `Shop Type`, `Party` (Đơn vị phụ trách).
3. **Bước 3**: Thiết lập chế độ tính 3 mốc ngày (`Tak Start`, `Handover`, `Opening`) rồi bấm **`Save Project`**:
   - **`Auto` (Tự động)**: Tự động lấy `Tak Start` từ task bắt đầu sớm nhất; lấy `Handover` từ ngày kết thúc của task có chữ *"Handover"*; lấy `Opening` từ ngày kết thúc của task có chữ *"Opening"*.
   - **`Manual` (Thủ công)**: Cho phép nhập tay và khóa cố định ngày theo hợp đồng thuê.

### 💡 Mẹo thực chiến trên Tab General
* **Ghim dự án trọng điểm (📌)**: Nhấp biểu tượng ghim ở đầu dòng để đưa dự án lên đầu bảng. Dùng 2 nút mũi tên `▲` / `▼` ngay cạnh ghim để sắp xếp thứ tự ưu tiên.
* **Mở nhanh Quick Navigator**: Nhấp vào dự án hoặc bấm `Ctrl + K` để mở bảng điều hướng nhanh sang `Detail`, `Gantt`, `Budget`, `Cost`, `Layout` với mã dự án được điền sẵn vào ô **`Fix Project Code`**.

---

## 📝 4. TAB TASK DETAIL – CHIA ĐẦU VIỆC (WBS) & TIỀN NHIỆM (`PREDECESSOR #`)

### 🎯 Dùng để làm gì?
Chia nhỏ dự án thành cấu trúc công việc phân cấp (**Task Mẹ – Task Con / Nhóm Modular**) và thiết lập liên kết tiền nhiệm (`Predecessor`) để hệ thống tự động tính toán và trượt lịch dây chuyền.

### 📐 Quy tắc Đánh Mã WBS & Cộng Dồn Tự Động (`In-Memory Rollup`)
* **Mã thứ tự công việc**: Tự động đánh số `#1, #2, #3...` trong phạm vi từng dự án (`MãDựÁn#1`, `MãDựÁn#2`).
* **Cộng dồn Task Mẹ (`Parent Task Rollup`)**:
  - `Start (Mẹ)` = Ngày bắt đầu sớm nhất của các Task con (`Min(Start)`).
  - `Finish (Mẹ)` = Ngày kết thúc muộn nhất của các Task con (`Max(Finish)`).
  - `Progress % (Mẹ)` = Trung bình cộng `%` hoàn thành của các Task con.

### 🔗 Cách Nhập Tiền Nhiệm (`Predecessor #`) Chuẩn MS Project
Tiền nhiệm quy định mối quan hệ phụ thuộc thời gian giữa công việc trước và công việc sau theo cú pháp: **`[MãDựÁn]#[SốThứTự][LoạiLiênKết][±SốNgàyTrễ]`** (Trong cùng dự án có thể gõ tắt `#1FS+2`):
1. **`FS` (Finish-to-Start — Mặc định)**: Việc trước **Kết thúc** ➔ Việc này **Bắt đầu** (`Start = Finish trước + 1 ngày + Lag`).
   - *Ví dụ*: `L1-105#1FS+2` (Sau khi việc `#1` xong, nghỉ chờ khô sơn 2 ngày rồi bắt đầu việc này).
2. **`SS` (Start-to-Start)**: Việc trước **Bắt đầu** ➔ Việc này **cùng Bắt đầu** (`Start = Start trước + Lag`).
3. **`FF` (Finish-to-Finish)**: Việc trước **Kết thúc** ➔ Việc này **cùng Kết thúc** (`Finish = Finish trước + Lag`).
4. **`SF` (Start-to-Finish)**: Việc trước **Bắt đầu** ➔ Việc này **Kết thúc**.
* **Khóa 2 Đầu Bằng 2 Tiền Nhiệm (`Double Predecessor Lock`)**:
  - Nhập 2 mã tiền nhiệm cách nhau bằng dấu phẩy, ví dụ: **`L1-105#1SS, L1-105#3FF`**.
  - Hệ thống sẽ tự động lấy ngày `Start` theo `#1`, lấy ngày `Finish` theo `#3`, và **tự động tính số ngày thực hiện `Duration = Finish - Start`**.
* **Liên kết Xuyên Dự Án (`Cross-Project Predecessor`)**:
  - Khi bạn nhập mã tiền nhiệm thuộc một dự án khác, hệ thống hiển thị huy hiệu màu tím **`External Link`** và bật hộp thoại xác nhận trước khi nối lịch.

### ⚡ Công Cụ Mạnh Mẽ Trên Task Detail
* **Linh hoạt (`▶️ Play xanh dương`) vs Ghim cố định (`📌 Pin xanh lá`)**:
  - Đang bật **Linh hoạt (`Realtime Update`)**: Khi việc trước dời ngày, việc này tự động trượt ngày theo dây chuyền.
  - Đang bật **Ghim cố định (`Pinned`)**: Giữ nguyên ngày cố định, không bị đẩy lịch.
* **Kéo thả đổi thứ tự dòng (`⋮⋮`)**: Giữ chuột kéo dòng task lên/xuống ➔ Hệ thống tự đánh lại số `#1, #2...` và **tự động cập nhật lại tất cả các ô `Predecessor`** đang tham chiếu tới task đó.
* **Chỉnh sửa hàng loạt (`Edit Mode`)**: Bật `Edit Mode` ➔ Tích chọn nhiều task (giữ **`Shift + Click`** để chọn nhanh cả dải) ➔ Đổi trạng thái, gắn nhóm `Modular`, bật/tắt `Realtime Update`, `Set Baseline`, hoặc Xóa cùng lúc.
* **Quy tắc cột `comments` khi Import Excel / CSV**:
  - Nhập nội dung vào cột `comments` sẽ **tự động nối thêm (Append)** vào lịch sử trao đổi của task.
  - Để trống ô `comments` sẽ giữ nguyên bình luận cũ.
  - Gõ từ khóa **`[DELETE]`** hoặc **`[CLEAR]`** để xóa sạch lịch sử bình luận của task đó.

---

## 📈 5. TAB GANTT CHART – BIỂU ĐỒ TIẾN ĐỘ THỜI GIAN THỰC

### 🎯 Dùng để làm gì?
Hiển thị trực quan tiến độ dự án dưới dạng biểu đồ thanh ngang theo `Day / Week / Month / Year`, so sánh với kế hoạch gốc (`Baseline`) và điều chỉnh lịch trực tiếp trên biểu đồ.

### 👆 Các thao tác và ký hiệu trực quan trên Gantt
1. **Ý nghĩa màu sắc trên biểu đồ**:
   - 🟢 **Thanh Xanh lá**: Đã hoàn thành (`Completed`).
   - 🔵 **Thanh Xanh dương**: Đang thực hiện (`On process`).
   - ⚫ **Thanh Xám đậm**: Sắp thực hiện (`Upcoming`).
   - 🟠 **Hình thoi Cam (`0d`)**: Cột mốc quan trọng (`Milestone` có `Duration = 0`).
   - **Thanh mờ nằm ngay bên dưới**: Đường kế hoạch gốc (`Baseline`) giúp nhận biết ngay công việc đang nhanh hay chậm so với ban đầu.
   - **Đường kẻ dọc Đỏ (`TODAY`)**: Vị trí ngày hôm nay (bấm nút `Today` để cuộn màn hình về đúng ngày hiện tại).
2. **Dòng Tiêu Đề Tháng Cố Định (`Sticky Month Row`) & Kéo Giãn Độ Rộng Tháng**:
   - Khi cuộn dọc xem danh sách công việc dài, dòng tiêu đề Tháng luôn ghim cố định ở mép trên để bạn dễ gióng cột ngày.
   - **Kéo giãn độ rộng tháng**: Đưa chuột vào **vạch ngăn cách giữa 2 tháng bất kỳ** trên thanh tiêu đề (con trỏ chuyển thành `↔`), nhấn giữ chuột trái và kéo sang trái/phải để thu hẹp hoặc phóng rộng tháng theo ý muốn.
3. **Cụm 2 Nút Mở Rộng Độc Lập ở đầu mỗi Dự án**:
   - **Nút Xám (Phía trên)**: Đóng/mở danh sách các Task của dự án.
   - **Nút Tím (Phía dưới)**: Đóng/mở các nhóm công việc gộp (`Modular Tasks`).
4. **Sửa nhanh `Predecessor` ngay trên Tooltip & Nhảy `Focus Mode`**:
   - Chạm/di chuột vào thanh Gantt ➔ Bấm **`[+ Add]`** hoặc **`[✏️ Edit]`** ngay trên bảng nổi để gắn tiền nhiệm có gợi ý thông minh mà không cần mở cửa sổ lớn.
   - Nhấp vào tên Task trên Gantt ➔ Tự động nhảy sang Tab `Task Detail`, lọc riêng task đó và tô sáng viền vàng (**`Focus Mode`**). Bấm nút `Back to Gantt` ở góc dưới để quay lại biểu đồ ngay.

---

## 💰 6. TAB BUDGET & COST – QUẢN LÝ NGÂN SÁCH & CHI PHÍ 3 ĐỢT

### 6.1. 🏦 Tab Budget – Định Mức Ngân Sách & Cây Dự Án Cha – Con (`Project Modular`)
* **Cấu trúc Cây Dự Án Mẹ – Con (`Parent -> ↳ SELF + ↳ SUB`)**:
  - Mỗi dự án là một dòng tổng hợp. Khi bạn dùng tính năng **`Project Modular`** (biểu tượng xếp lớp `☶`) để gộp các dự án nhỏ vào một dự án lớn:
    + Dòng **`↳ SELF` (Màu Xanh dương)**: Hiển thị ngân sách và chi phí của riêng bản thân dự án mẹ.
    + Các dòng **`↳ SUB` (Màu Cam)**: Hiển thị ngân sách và chi phí của từng dự án con được gộp vào.
  - **Cộng dồn tự động lên dòng Mẹ**:
    $$\text{Tổng Budget Mẹ} = \text{Budget (Self)} + \sum \text{Budget (Sub)}$$
  - **Dấu hiệu nhận biết**: Khi dự án mẹ có `> 2` dòng con, huy hiệu đếm số lượng ở cột đầu tiên (`No.`) sẽ đổi sang **Màu Xanh Lá (`Emerald`)** nổi bật.
* **📐 Công thức Số Dư Ngân Sách (`Remaining Budget`) & Cảnh Báo Màu**:
  $$\text{Remaining (Số dư còn lại)} = \text{Approved Budget} - \text{Actual/Forc (Đã chi)} + \text{Supporting Fee (Phí hỗ trợ)}$$
  - 🟢 **Màu Xanh lá (`> 20%` Budget)**: Ngân sách an toàn, dồi dào.
  - 🟡 **Màu Vàng cam (`0% – 20%` Budget)**: Cảnh báo sắp chạm trần ngân sách.
  - 🔴 **Màu Đỏ (`< 0`)**: Vượt ngân sách được duyệt (`Over-Budget`).
  - Nhãn **`ACT` (Xanh)** = Chi phí đã chốt thực tế; Nhãn **`FORC` (Cam)** = Có khoản mục đang là chi phí dự báo.

### 6.2. 💳 Tab Cost – Hợp Đồng, Thuế VAT & Thanh Toán 3 Đợt (`1st, 2nd, 3rd Paid`)
* **Phân loại khoản mục**: `Cost Summary` (Hợp đồng chính), `Variation Order - VO` (Phát sinh tăng/giảm), `Other Expenses` (Chi phí lẻ).
* **📐 Công thức Thuế VAT & Tự Động Chia 3 Đợt Thanh Toán**:
  - Hỗ trợ mức thuế VAT **`0%`**, **`8%`**, **`10%`** (tự động làm tròn số nguyên chuẩn kế toán `Math.round`):
    $$\text{Giá trị sau VAT} = \text{Giá trị trước VAT} \times (1 + \text{VAT\%})$$
  - **Tự động tính Đợt 3 (`Final Settlement`)**: Khi bạn nhập số tiền hoặc % của **Đợt 1 (`1st Paid` - Tạm ứng)** và **Đợt 2 (`2nd Paid` - Thanh toán tiến độ)**, hệ thống tự động tính phần còn lại cho **Đợt 3 (`3rd Paid` - Quyết toán)** để tổng 3 đợt luôn khớp **100%**.
  - **Công nợ còn lại (`Balance`)**:
    $$\text{Balance} = \text{Actual Amount} - (\text{1st Paid} + \text{2nd Paid} + \text{3rd Paid})$$
    Khi đã thanh toán đủ cả 3 đợt, `Balance = 0`.
* **⚡ Công cụ kiểm soát dòng tiền dành cho Kế toán & QS**:
  - **Cảnh báo quyết toán (`Final Warning ≤ 14 ngày`)**: Tự động báo Vàng/Đỏ khi hạn thanh toán đợt cuối còn `≤ 14 ngày` mà chưa tích hoàn tất.
  - **Bộ lọc Ngày Thanh Toán (`Filter Paid Date` 📅)**: Chọn khoảng thời gian `[Từ ngày ➔ Đến ngày]` và chọn đợt (`1st / 2nd / 3rd`) để lọc riêng các khoản giải ngân trong kỳ; các ô khớp điều kiện sẽ tự động sáng **viền màu Xanh lá**.
  - **Liên kết nhảy nhanh**: Bấm vào biểu tượng 🔗 để chuyển nhanh giữa `Budget` và `Cost` với mã dự án được ghim sẵn vào ô **`Fix Project Code`**.

---

## 🤝 7. TAB DELEGATION & CALENDAR – GIAO VIỆC, NGHIỆM THU 5 BƯỚC & ĐỒNG BỘ LỊCH iOS

### 7.1. 🔄 Quy Trình 5 Bước Phê Duyệt Trên Bảng `Delegation Tracker`
Bất kỳ nhân sự (`PIC`) hoặc nhà thầu (`Party`) nào có tên trong dự án/công việc đều có thể phối hợp nghiệm thu qua **5 bước chuẩn**:
1. **`Assigned` (`0%`)**: Quản lý khởi tạo đầu việc, giao cho PIC / Nhà thầu kèm hạn chót (`Deadline`).
2. **`Accepted / On process` (`50%`)**: Người nhận bấm **"Accept / Nhận việc"** và bắt đầu thi công. *(Nếu Task cha bật `Realtime Update`, ngày `Start` thực tế tự động được ghi nhận).*
3. **`Pending completed / ReqApproval` (`85%`)**: Người làm báo cáo hoàn thành, đính kèm hình ảnh nghiệm thu hiện trường và bấm **"Request Approval (Gửi duyệt)"**.
4. **`Approved / Completed` (`100%`)**: Quản lý/Admin kiểm tra đạt yêu cầu và bấm **"Approve (Phê duyệt)"**. *(Khi 100% đầu việc con đạt `Approved`, Task cha tự động chốt ngày `Finish` thực tế và đẩy lịch các việc tiếp theo trên Gantt).*
5. **`Rejected / Needs Rework` (`25%`)**: Nếu chưa đạt, Quản lý bấm **"Reject (Từ chối)"** kèm lý do để đơn vị thi công sửa lại; đầu việc đồng thời nổi cảnh báo trên Tab `My Work`.

### 7.2. 📱 Đồng Bộ Lịch Dự Án Vào iPhone / iPad Qua Mã QR (`iOS Calendar Sync`)
1. Mở **Tab `Calendar`** (hoặc bấm nút **`Sync iOS / QR`** trên thanh công cụ).
2. Chọn phạm vi lịch muốn theo dõi (`Chi nhánh HCM/HN`, `Năm`, hoặc `Dự án phụ trách`).
3. Dùng **Camera iPhone / iPad** quét mã **QR Code** hiển thị trên màn hình (hoặc bấm **`Subscribe Webcal`**).
4. Bấm **"Đăng ký" (`Subscribe`)** trên ứng dụng Lịch của iOS ➔ Toàn bộ mốc `Tak Start`, `Handover`, `Opening` và `Task Deadline` sẽ tự động cập nhật ngầm vào điện thoại của bạn!

---

## 🗺️ 8. TAB LAYOUT 2D & PICTURE MAPPING – MẶT BẰNG, DIỆN TÍCH (`m²`) & DYNAMIC HIERARCHY

### 8.1. 🗺️ Tab Layout 2D – Bản Đồ Mặt Bằng, Công Thức Diện Tích (`m²`) & Viền Màu Legend
* **📐 Công thức tính Tổng Diện Tích (`m²`) chuẩn xác trong bảng `Color Legend`**:
  - Bảng nổi **Color Legend** thống kê từng nhóm theo cấu trúc: `[Tên Nhóm] : [Số lượng unit] • [Tổng diện tích m²] • [Tỷ lệ %]` kèm dòng tổng **`TOTAL`**.
  - **Quy tắc chống trùng diện tích**: Diện tích của mỗi nhóm trạng thái (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) được tính bằng **tổng diện tích (`sizeM2`) của các Dự án duy nhất (`Unique Projects`)** thuộc nhóm đó cộng với diện tích các ô phụ được nối qua `Project Code Link`. Khi 1 dự án gộp nhiều ô mặt bằng, diện tích dự án chỉ được cộng **1 lần duy nhất**, không bao giờ bị nhân đôi.
* **✨ Quy tắc Viền Màu Trạng Thái khi bấm vào `Color Legend`**:
  - Khi bạn nhấp chọn 1 dòng trạng thái trong bảng **Color Legend** (ví dụ: bấm vào `Completed` hoặc `In Progress`):
    + Những gian hàng/dự án thuộc nhóm đó **có diện tích (`sizeM2 > 0`)** sẽ sáng **đường viền màu chính của trạng thái đó bao xung quanh polygon**.
    + Những ô **không có diện tích (`sizeM2 = 0` hoặc trống)** sẽ **không hiện viền**, giúp phân biệt tức thì các gian hàng có diện tích thực tế.
* **🎨 Thiết lập `Paint Categories` (Độc quyền Admin)**:
  - Chỉ tài khoản **Admin** mới có quyền tạo/sửa/xóa `Paint Categories` và gắn điều kiện lọc động trong `Edit Mode`. Khi Admin chọn bộ lọc màu, cấu hình tự động đồng bộ thời gian thực cho toàn bộ tài khoản User khác cùng xem thống nhất.
* **👆 Tương tác 1 chạm & Quét QR Code Gian hàng**:
  - Chạm vào gian hàng bất kỳ trên bản đồ để mở bảng nổi thông minh: xem thanh tiến độ đôi (`Plan %` vs `Act %`), mở **`[📊 Mini Gantt]`** ngay trên mặt bằng, mở **`[💬 Chat]`** (0ms), hoặc xem **`[🖼️ Ảnh hiện trường]`** (được cô lập 100% giữa `HCM` và `HN`).
  - Dùng điện thoại **Quét Mã QR của Dự án** để ứng dụng tự động chuyển đúng Chi nhánh, Năm, Tầng và **phóng to (`Zoom 70%`)** thẳng vào gian hàng đó trên mặt bằng!

### 8.2. 🖼️ Tab Picture Mapping – Quy Hoạch Mặt Bằng Động (`Dynamic Hierarchy`) & Xuất/Nhập CSV/Excel 2 Sheet
Phân hệ **`Picture Mapping`** cung cấp bộ 3 chế độ chuyên sâu (**`EDIT` • `DYNAMIC` • `REVIEW`**) để quy hoạch mặt bằng đa kịch bản theo từng năm (`2025`, `2026`, `2027`...) và đồng bộ đám mây **Cloudflare R2**:
1. **Chế độ `EDIT` (Chỉnh sửa Polygon & Hồ sơ Gian hàng)**:
   - Vẽ và tinh chỉnh hình học từng ô gian hàng, nhập thông tin chi tiết trên cột `Inspector` (`Unit ID`, `Brand Name`, `Floor`, `Category Code`, `Area m²`, `Lease Status`, `Hoarding`...).
2. **Chế độ `DYNAMIC` (`Dynamic Hierarchy` – Phân Nhóm Tự Động Theo Quy Tắc `RAM 0ms`)**:
   - Tạo nhiều phiên bản kịch bản quy hoạch (`+ NEW VERSION`, ví dụ: `PM-L4-HN`) với trạng thái kích hoạt `ALWAYS ON`.
   - Trong mỗi phiên bản, bạn tạo các **Nhóm Quy Tắc (`Rule-Based Groups`)** như `Approached`, `Negotiation`, `Signed`, `Vacant`... Mỗi nhóm có màu sắc, độ đậm nhạt, kiểu tô (`Solid` / `Hatch`), ký hiệu (`Sym`) và danh sách điều kiện lọc (`Matching Rules`, ví dụ: `Floor = L4`, `Lease Status = Negotiation`).
   - Bấm **`APPLY RULES`**: Hệ thống tự động quét và tô màu mặt bằng trong `0ms`, đồng thời tính ngay `[Số lượng units • Tổng m²]` trên từng thẻ nhóm. Bạn cũng có thể sao chép nhanh bộ nhóm từ tầng khác bằng ô **`[ COPY GROUPS FROM ]`**.
3. **📥📤 Chế Độ Import / Export CSV & File Excel 2 Sheet Hướng Dẫn Chi Tiết**:
   - **Khi bấm `Export Excel (.xlsx)` (hoặc `Export CSV`) trong Tab `DYNAMIC`**:
     Hệ thống xuất ra file chuẩn gồm **2 Sheet chuyên nghiệp**:
     + **📄 Sheet 1 (`Dynamic_Rules_Data` – Dữ liệu Quy tắc Động)**: Chứa toàn bộ danh sách các nhóm (`GroupName`, `Color`, `Opacity`, `FillStyle`, `Symbol`) và từng dòng điều kiện (`RuleField`, `RuleOperator`, `RuleValue`) của phiên bản hiện tại. Bạn có thể sửa hàng loạt hoặc thêm hàng trăm quy tắc mới ngay trên Sheet 1 này.
     + **📘 Sheet 2 (`Field_Reference_Guide` – Bảng Giải Thích & Từ Điển Trường Dữ Liệu)**: Giải thích chi tiết ý nghĩa từng cột khi Import, liệt kê đầy đủ danh sách **các mã trường dữ liệu (`Field Keys`) hợp lệ** (như `floor`, `unitId`, `brandName`, `catCode`, `leaseStatus`, `area`, `shopType`, `party`, `status`...), **các toán tử (`Operators`) hợp lệ** (`=`, `!=`, `contains`, `>`, `<`, `>=`, `<=`, `in`), mã màu Hex mẫu và ví dụ cụ thể để bất kỳ chuyên viên nào cũng điền đúng 100%.
   - **Khi bấm `Import CSV / Excel`**:
     + Chọn file `.csv` hoặc `.xlsx` bạn vừa biên tập ➔ Hệ thống tự động đọc dữ liệu từ Sheet 1, kiểm tra hợp lệ, cập nhật toàn bộ thẻ nhóm quy tắc (`Rule-Based Groups`) và tô màu lại bản đồ tức thì!
4. **☁️ Lưu & Tải Đám Mây Cloudflare R2 (`SAVE CLOUD DYNAMIC` / `LOAD CLOUD DYNAMIC` / `CLEAN R2`)**:
   - Bấm **`SAVE CLOUD DYNAMIC`** để đẩy toàn bộ sơ đồ mặt bằng, danh sách gian hàng và các phiên bản quy tắc động lên đám mây **Cloudflare R2**.
   - Trên máy tính hoặc iPad khác, bấm **`LOAD CLOUD DYNAMIC`** để tải đồng bộ toàn bộ mặt bằng và quy tắc về máy trong tích tắc.

---

## 🛡️ 9. PHÂN QUYỀN (RBAC), NHẬT KÝ KIỂM TOÁN & ĐỒNG BỘ ĐA THIẾT BỊ R2

### 🔐 5 Lớp Phân Quyền Tài Khoản (`Account Control`)
1. **`Admin`**: Toàn quyền quản trị hệ thống, cấu hình RBAC, thiết lập `Paint Categories`, duyệt ngân sách, xem `Audit Log` và quản lý sao lưu R2.
2. **`Standard User` (PM / QS / Staff / Đối tác CP)**: Được cấp quyền chi tiết theo 5 tiêu chí:
   - `canWrite`: Được phép Thêm/Sửa/Xóa (Nếu tắt ➔ Chỉ xem `Read-Only`).
   - `storePermissions`: Quyền truy cập chi nhánh `HCM`, `HN`.
   - `locationPermissions`: Quyền truy cập theo từng tầng (`B2`..`L5` hoặc đặc quyền **`"all"`** xem mọi tầng).
   - `partyPermissions`: Quyền truy cập theo bộ phận/nhà thầu (hoặc đặc quyền **`"all"`** điều phối mọi bộ phận).
   - `tabPermissions`: Cho phép hiển thị hoặc ẩn từng Tab chức năng.
   - **Che giấu tài chính (`Cost Masking`)**: Tài khoản không được cấp quyền xem tài chính sẽ thấy mọi con số tiền tệ hiển thị thành **`***`**.

### 🔄 Đồng Bộ Tức Thì `0ms`, Chống Ngủ Tab & Tự Dọn "Task Ma"
* **Lưu tức thì `0ms` & Hàng đợi ngoại tuyến (`Offline Queue`)**: Mọi thao tác Lưu/Sửa/Xóa phản hồi ngay lập tức trên màn hình nhờ cơ sở dữ liệu nội bộ **Dexie.js (IndexedDB)** (trên iOS được bảo vệ bằng trần bộ nhớ an toàn `40MB`). Nếu mất mạng Wi-Fi/4G, dữ liệu được giữ an toàn trong `syncQueue` và tự đẩy lên máy chủ ngay khi có mạng lại.
* **Thức giấc qua đêm (`Overnight Wake-up`) & Tự dọn "Task Ma" (`Zero-Zombie`)**: Khi mở lại Laptop hoặc iPad sau khi gập máy ngủ qua đêm, hệ thống tự động phát hiện nhịp nghỉ (`Heartbeat Gap > 60s`), kéo bù 100% thay đổi mới nhất (`taka_deltas`) và tự xóa sạch các công việc đã bị đồng nghiệp xóa từ máy khác mà **không bao giờ cần bấm xóa cache thủ công**.
* **☁️ Sao lưu tự động lên Cloudflare R2 (`R2 Auto-Backup`)**: Tiến trình ngầm định kỳ tự động nén (`GZIP`) toàn bộ dữ liệu Dự án, Công việc, Ngân sách, Chi phí và lưu trữ an toàn lên đám mây **Cloudflare R2**.

---

## ⌨️ 10. BẢNG PHÍM TẮT THẦN TỐC & HỎI ĐÁP NHANH (TOP FAQ)

### ⌨️ Bảng Phím Tắt Toàn Cục
| Phím tắt / Thao tác | Tác dụng tức thì |
| :--- | :--- |
| **`Ctrl + K`** *(hoặc `Cmd + K`)* | Mở bảng **Quick Navigator / Command Palette** để nhảy nhanh tới bất kỳ Dự án, Tab hoặc lệnh nào |
| **`/`** | Đưa con trỏ chuột vào ngay ô **Tìm kiếm (`Search`)** |
| **`P`** | Mở nhanh cửa sổ **Tạo Dự Án Mới (`+ New Project`)** |
| **`T`** | Mở nhanh cửa sổ **Tạo Công Việc Mới (`+ New Task`)** |
| **`Ctrl + Z`** *(hoặc `Cmd + Z`)* | **Hoàn tác (`Undo`)** thao tác sửa/xóa công việc vừa thực hiện |
| **`Shift + Click`** | Tích chọn nhanh một dải nhiều công việc liên tiếp trong `Edit Mode` |
| **`Shift + F`** | Bật / Tắt chế độ **Toàn màn hình (`Focus Mode`)** |
| **`Esc`** | Xóa nhanh từ khóa tìm kiếm / Đóng cửa sổ Modal đang mở |
| **Kéo thanh tiêu đề Modal** | Mọi cửa sổ (`Project`, `Task`, `Quick Navigator`, `Legend`, `FAQ Bot`) đều kéo thả tự do để đối chiếu số liệu |
| **In ấn (`Print Preview`)** | Mở Menu góc `☰` ➔ `Print Preview` để xuất PDF/PNG khổ `A2 / A3 / A4` sắc nét kèm Watermark bảo mật |

---

### ❓ Giải Đáp Nhanh Các Câu Hỏi Thực Tế Thường Gặp (Top FAQ)

1. **Hỏi: Tôi đã tích chọn kiểm tra xong các task trong Tab `My Work` trên điện thoại iPhone (iOS), khi mở máy tính Laptop lên thì có phải tích lại không?**
   - **Đáp**: **Không cần!** Trạng thái đánh dấu đã kiểm tra (`Reviewed / Completed`) được đồng bộ thời gian thực theo **tài khoản đăng nhập của bạn** (ví dụ `CP-HUNG`). Khi bạn tích xong trên iOS, trên Laptop các task đó cũng tự động nằm ở cột **`Completed`** và không hiện lại ở cột việc cần làm nữa (trừ khi task đó có thay đổi mới về tiến độ/hạn chót hoặc bị trả về `Rework`).
2. **Hỏi: Tại sao khi tôi chọn một dự án từ `Quick Navigator`, mã dự án lại nằm ở ô `Fix Project Code` chứ không nằm ở ô `Search`?**
   - **Đáp**: Đây là thiết kế thông minh giúp bạn **ghim cố định dự án** ở ô `Fix Project Code` (vẫn tự động nhảy đúng tầng, mở khóa bộ lọc `All` và bung dòng con y hệt như khi tìm kiếm), đồng thời **giữ cho ô `Search` luôn trống** để bạn có thể gõ thêm từ khóa lọc các công việc hoặc khoản chi phí cụ thể bên trong dự án đó.
3. **Hỏi: Trong Tab `Picture Mapping` ➔ `DYNAMIC`, làm sao để tôi biết cần điền những trường dữ liệu nào khi Import file CSV / Excel quy tắc động?**
   - **Đáp**: Bạn chỉ cần bấm nút **`Export Excel`** trong Tab `DYNAMIC`. File xuất ra có sẵn **Sheet 1 (`Dynamic_Rules_Data`)** chứa cấu trúc bảng để nhập liệu và **Sheet 2 (`Field_Reference_Guide`)** giải thích chi tiết từng cột, danh sách các trường hợp lệ (`Floor`, `Category`, `Lease Status`, `Area`...), các toán tử (`=`, `!=`, `contains`, `>`, `<`) kèm ví dụ mẫu.
4. **Hỏi: Tại sao tôi không sửa được dữ liệu hoặc thấy số tiền hiển thị thành dấu `***`?**
   - **Đáp**: Có 3 nguyên nhân: (1) Bạn đang chọn **Năm tài chính cũ** (hệ thống tự khóa `Read-Only`); (2) Bạn đang chọn đơn vị tiền tệ là **`JPY` hoặc `USD`** trên Header (hãy chuyển về `'000 VND` để mở khóa ô nhập tiền); hoặc (3) Tài khoản của bạn đang ở chế độ Chỉ xem / Chưa được cấp quyền xem tài chính.
5. **Hỏi: Khi tôi đổi ngày của 1 công việc, làm sao để các công việc phía sau tự động dời ngày theo?**
   - **Đáp**: Bạn nhập mã công việc trước vào ô **`Predecessor`** của công việc sau (VD: `A01#1FS` hoặc `#1FS+2`) và đảm bảo công việc sau đang bật biểu tượng **Linh hoạt (`▶️ Play màu xanh dương`)**.
6. **Hỏi: Trong bảng `Color Legend` ở Tab `Layout`, tại sao khi tôi bấm vào 1 trạng thái thì có ô hiện viền màu đậm, có ô lại không có viền?**
   - **Đáp**: Khi bạn bấm chọn 1 dòng trong `Color Legend` (như `Completed` hay `In Progress`), hệ thống chỉ vẽ **đường viền màu trạng thái bao quanh những gian hàng/dự án đã có số liệu diện tích (`sizeM2 > 0`)**; các ô chưa có diện tích (`0 m²`) sẽ không hiện viền.
