# 📘 CẨM NANG HƯỚNG DẪN SỬ DỤNG TAKASHIMAYA PM (DÀNH CHO NGƯỜI MỚI & FAQ BOT)

> 💡 **Tài liệu chuẩn mực (Single Source of Truth)**: Được thiết kế tinh gọn, trực quan theo cấu trúc **"Hiểu đơn giản ➔ Thao tác 3 bước ➔ Công thức & Ví dụ thực tế"** để người dùng mới làm chủ hệ thống trong 5 phút và giúp FAQ Bot trả lời tức thì.

---

## 🚀 1. BẮT ĐẦU NHANH CHO NGƯỜI MỚI (LỘ TRÌNH 5 PHÚT)

### 🎯 Hiểu đơn giản
Hệ thống **Takashimaya Project Management (Taka PM)** quản lý trọn vòng đời dự án cải tạo & thi công gian hàng tại **Takashimaya TP.HCM (`HCM`)** và **Hà Nội (`HN`)** quanh 4 trụ cột: **Dự án (Project) ➔ Công việc (Task/Gantt) ➔ Tài chính (Budget/Cost) ➔ Mặt bằng (Layout 2D)**.

### 🔑 Quy tắc Vàng cần nhớ đầu tiên: "Cô Lập 4 Khóa"
Mọi dữ liệu trong hệ thống luôn được phân tách độc lập theo **4 khóa định danh**:
`ID Dự án (projectId)` + `Mã Dự án (projectCode)` + `Năm (year)` + `Chi nhánh (store)`
* **Ví dụ dễ hiểu**: Cùng mã gian hàng `L1-105` nhưng ở năm `2026` và năm `2027` (hoặc giữa `HCM` và `HN`) là **2 dự án hoàn toàn độc lập**, không bao giờ bị gộp nhầm tiến độ hay tiền bạc.
* **Khóa sổ năm cũ (`Read-Only`)**: Khi bạn chọn năm nhỏ hơn năm hiện tại (VD: xem lại năm cũ), hệ thống tự động bật chế độ **Chỉ Xem** để bảo vệ số liệu kiểm toán.

### 🧭 5 Nhóm Menu Điều Hướng Chính (Trên thanh Header)
1. 📊 **REPORT (Báo cáo & Bản đồ)**:
   - `Calendar`: Lịch biểu tổng quan theo tháng/tuần.
   - `Layout`: Bản đồ số mặt bằng 2D các tầng, tô màu tiến độ & diện tích (`m²`).
   - `Summary`: Biểu đồ KPI tổng hợp & Dashboard tài chính (EVM, dòng tiền).
2. 📋 **INDEX (Dự án & Tiến độ)**:
   - `General`: Bảng danh sách tổng quan tất cả dự án (Trang chủ mặc định).
   - `Gantt`: Biểu đồ thanh tiến độ theo thời gian thực & kéo thả lịch trình.
   - `Task detail`: Bảng chia nhỏ đầu việc (WBS), nhập liên kết tiền nhiệm (`Predecessor`).
3. 💰 **FINANCIAL (Tài chính)**:
   - `Budget`: Quản lý định mức ngân sách & gom nhóm dự án Cha - Con.
   - `Cost`: Quản lý chi phí thực tế (`ACT`)/dự báo (`FORC`), thuế VAT & thanh toán 3 đợt.
4. 🤝 **DELEGATION (Giao việc & Nghiệm thu)**:
   - `Delegation`: Giao việc cho nhân sự/nhà thầu (`Party`) & duyệt nghiệm thu 5 bước.
   - `Del. Calendar`: Lịch theo dõi hạn chót (deadline) của các việc đã giao.
5. ❓ **HELP (Trợ giúp)**:
   - `Manual`: Cẩm nang hướng dẫn sử dụng & xuất PDF.
   - `FAQ Guide (Nút góc dưới phải)`: Trợ lý hỏi đáp nghiệp vụ thông minh 24/7.

### ⚡ Bộ Công Cụ Tiện Ích Trên Thanh Header
* **Bộ lọc Toàn cục (Global Filters)**: 3 ô lọc `Year` (Năm), `Store` (`HCM`/`HN`/`All Stores`) và `Location` (Tầng `B2`, `B1`, `L1`..`L5`) luôn đi theo bạn khi chuyển qua lại giữa các Tab.
* **Huy hiệu `On [Tên Tab]`**: Cho biết bạn đang mở tab con nào.
* **Nút `Set 1st page`**: Đang ở tab nào, bấm nút này để đặt tab đó làm trang mở đầu tiên mỗi khi vào app.
* **Đổi tiền tệ (`VND` / `JPY` / `USD`)**: Quy đổi tự động toàn bộ bảng Budget & Cost theo tỷ giá. *(Lưu ý: Khi đang xem `JPY` hoặc `USD`, ô nhập tiền sẽ tự khóa để tránh nhập nhầm; hãy chuyển về `'000 VND` khi cần sửa số tiền).*

---

## 📊 2. TAB GENERAL – QUẢN LÝ DANH MỤC DỰ ÁN

### 🎯 Dùng để làm gì?
Nơi tạo mới dự án, xem danh sách tổng thể, trạng thái thi công (`Upcoming`, `On process`, `Completed`, `Delayed`) và các mốc ngày quan trọng của từng gian hàng.

### 👆 Thao tác 3 bước: Tạo Dự Án Mới
1. **Bước 1**: Nhấp nút **`+ New Project`** (hoặc bấm phím `P`).
2. **Bước 2**: Điền thông tin cơ bản:
   - `Code`: Mã dự án viết hoa, không khoảng trắng (VD: `L1-105`).
   - `Project Code Link (linkCodes)`: Nhập mã ô gian hàng trên mặt bằng 2D. Nếu dự án gộp nhiều ô, nhập cách nhau bằng dấu phẩy (VD: `L3-303-1, L3-303-2`). Hệ thống chỉ tô màu đúng các ô này (**Cô lập Unit**).
   - `Store` (`HCM`/`HN`), `Location` (Tầng), `Size (m²)` (Diện tích dự án), `Shop Type`, `Party` (Nhà thầu/Bộ phận).
3. **Bước 3**: Chọn chế độ tính 3 mốc ngày (`Tak Start`, `Handover`, `Opening`) rồi bấm **`Save Project`**:
   - Chế độ **`Auto` (Tự động)**: Tự lấy ngày từ các Task con trong dự án (`Start` = ngày bắt đầu sớm nhất; `Handover` = ngày xong của task có chữ *"Handover"*; `Opening` = ngày xong của task có chữ *"Opening"*).
   - Chế độ **`Manual` (Thủ công)**: Tự nhập và khóa cứng ngày theo hợp đồng.

### 💡 Mẹo tương tác nhanh trên Tab General
* **Ghim dự án quan trọng (📌)**: Bấm biểu tượng cây ghim ở đầu dòng để đưa dự án lên đầu bảng. Dùng nút mũi tên `▲` / `▼` ngay cạnh ghim để đổi thứ tự ưu tiên chỉ với 1 chạm.
* **Tìm kiếm tự nhảy tầng**: Gõ mã dự án, tên brand hoặc nội dung mô tả vào ô Search (phím `/`), bộ lọc `Location` sẽ tự động nhảy sang đúng tầng chứa dự án đó. Nhấn phím `Esc` để xóa tìm kiếm và trả lại bộ lọc cũ.
* **Bấm nút cây bút (✏️)**: Mở nhanh cửa sổ trao đổi/bình luận (`Comments`) của dự án.

---

## 📝 3. TAB TASK DETAIL – CHIA ĐẦU VIỆC (WBS) & TIỀN NHIỆM (PREDECESSOR)

### 🎯 Dùng để làm gì?
Chia dự án thành các công việc nhỏ (Task Mẹ - Task Con), nối dây chuyền công việc trước - sau (`Predecessor`) để hệ thống tự động tính lịch trình.

### 📐 Quy tắc Đánh Mã WBS & Cộng Dồn (Rollup)
* **Mã công việc phụ (`taskCodePhu`)**: Tự động đánh số theo thứ tự dòng: `MãDựÁn-1`, `MãDựÁn-2` (hoặc `MãDựÁn#1`, `MãDựÁn#2`).
* **Task Mẹ (Parent Task)**: Tự động tính từ các Task Con bên trong:
  - `Ngày bắt đầu (Start)` = Ngày sớm nhất của các task con.
  - `Ngày kết thúc (Finish)` = Ngày muộn nhất của các task con.
  - `% Tiến độ` = Trung bình cộng % của các task con.

### 🔗 Cách Nhập Tiền Nhiệm (`Predecessor`) Cực Dễ Hiểu
Tiền nhiệm giúp bạn quy định: *"Việc A xong thì Việc B mới được làm"*.
* **4 Kiểu liên kết chuẩn**:
  1. **`FS` (Finish-to-Start - Mặc định)**: Việc trước **Kết thúc** ➔ Việc này **Bắt đầu** (`Start = Finish trước + Độ trễ`).
  2. **`SS` (Start-to-Start)**: Việc trước **Bắt đầu** ➔ Việc này **cùng Bắt đầu** (`Start = Start trước + Độ trễ`).
  3. **`FF` (Finish-to-Finish)**: Việc trước **Kết thúc** ➔ Việc này **cùng Kết thúc** (`Finish = Finish trước + Độ trễ`).
  4. **`SF` (Start-to-Finish)**: Việc trước **Bắt đầu** ➔ Việc này **Kết thúc**.
* **Độ trễ (`Lag`)**: Thêm `+N` (lùi N ngày) hoặc `-N` (sớm N ngày).
  - *Ví dụ 1 tiền nhiệm*: Gõ `L1-105#1FS+2` (Sau khi task `#1` xong 2 ngày thì task này bắt đầu).
  - *Ví dụ 2 tiền nhiệm (Khóa 2 đầu)*: Gõ `L1-105#1SS, L1-105#3FF` ➔ Task này sẽ lấy `Start` theo task `#1` và lấy `Finish` theo task `#3`, sau đó tự động tính số ngày `Duration = Finish - Start`.
* **Liên kết khác dự án (Cross-Project)**: Khi gõ mã của dự án khác (khác Năm, Chi nhánh, Tầng hoặc Mã), hệ thống hiện nhãn tím `External Link` và mở hộp thoại xác nhận trước khi nối lịch.

### ⚡ Công Cụ Mạnh Mẽ Trên Task Detail
* **Ghim cố định (📌 Pin xanh lá) vs Linh hoạt (▶️ Play xanh dương)**:
  - Bật **Linh hoạt (`Realtime Update`)**: Khi task trước dời ngày, task này tự động trượt lịch theo dây chuyền.
  - Bật **Ghim cố định**: Giữ nguyên ngày, không bị đẩy lịch.
* **Kéo thả đổi vị trí Task (`⋮⋮`)**: Giữ chuột kéo task lên/xuống ➔ Hệ thống tự đánh lại số `#1, #2...` và tự sửa lại mọi ô `Predecessor` liên quan.
* **Chỉnh sửa hàng loạt (`Edit Mode`)**: Bật `Edit Mode` ➔ Tích chọn nhiều task (giữ `Shift + Click` để chọn cả dải) ➔ Bật/tắt Ủy quyền, Linh hoạt, `Set Baseline`, `Unlink` (tách khỏi nhóm gộp) hoặc Xóa cùng lúc.
* **Nút `+ Task (Mã dự án)` thông minh**: Khi cuộn bảng, nút `+ Task` góc trên phải tự nhận diện dự án đang nhìn thấy để thêm nhanh task vào đúng dự án đó.
* **Nhập / Xuất Excel & CSV (Trong Menu ☰)**:
  - Cột `comments` khi Import: Nhập nội dung mới sẽ **tự động cộng dồn (Append)** vào lịch sử chat; để trống sẽ giữ nguyên; gõ `[DELETE]` hoặc `[CLEAR]` để xóa sạch bình luận của task đó.

---

## 📈 4. TAB GANTT CHART – BIỂU ĐỒ TIẾN ĐỘ THỜI GIAN THỰC

### 🎯 Dùng để làm gì?
Nhìn toàn cảnh tiến độ dạng thanh ngang theo `Day / Week / Month / Year`, đối chiếu kế hoạch gốc (`Baseline`) và kéo thả điều chỉnh lịch trực quan.

### 👆 Các thao tác trực quan trên Gantt
1. **Phân biệt màu thanh tiến độ**:
   - 🟢 **Xanh lá**: Đã hoàn thành (`Completed`).
   - 🔵 **Xanh dương**: Đang thực hiện (`On process`).
   - ⚫ **Xám đậm**: Sắp tới (`Upcoming`).
   - 🟠 **Hình thoi Cam (`0d`)**: Cột mốc quan trọng (`Milestone` có `Duration = 0`).
   - **Thanh mờ phía dưới**: Đường kế hoạch gốc (`Baseline`) để biết task đang nhanh hay chậm tiến độ.
   - **Đường kẻ dọc Đỏ (`TODAY`)**: Vị trí ngày hôm nay (bấm nút `Today` để cuộn ngay về hôm nay).
2. **Cụm 2 nút Mở rộng / Thu gọn độc lập**:
   - **Nút mũi tên Xám (Trên)**: Mở/đóng danh sách Task của dự án.
   - **Nút màu Tím (Dưới)**: Mở/đóng các nhóm Task gộp (`Modular Tasks`).
3. **Sửa nhanh Predecessor trên Tooltip**: Chạm/rê chuột vào thanh Gantt ➔ Bấm `[+ Add]` hoặc `[✏️ Edit]` ngay trên bảng nổi để thêm tiền nhiệm có gợi ý thông minh mà không cần mở modal lớn.
4. **Click Task nhảy thẳng sang Detail (`Focus Mode`)**: Nhấp vào tên hoặc thanh Task con trên Gantt ➔ Tự nhảy sang Tab `Detail`, lọc riêng task đó và tô viền vàng. Bấm `Back to Gantt` ở góc dưới để quay lại ngay.

---

## 💰 5. TAB BUDGET & COST – QUẢN LÝ NGÂN SÁCH & CHI PHÍ 3 ĐỢT

### 5.1. 🏦 Tab Budget (Ngân Sách & Liên Kết Dự Án Cha - Con)
* **Cấu trúc Dự án Mẹ – Con (`Parent - Self - Sub`)**:
  - Mỗi dự án độc lập là một dòng tổng hợp. Khi bấm mở rộng `▶ (số con)`, bên trong gồm:
    + **`↳ SELF` (Màu xanh dương)**: Ngân sách và chi phí của riêng bản thân dự án đó.
    + **`↳ SUB` (Màu cam)**: Các dự án con được gộp vào dự án mẹ này.
  - **Dòng Mẹ tự cộng dồn**: `Tổng Budget Mẹ = Budget (Self) + Tổng Budget (Sub)`.
  - **Dấu hiệu nhận biết**: Khi dự án mẹ có `> 2` dòng con, nút đếm số con ở cột đầu tiên (`No.`) sẽ đổi sang **Màu Xanh Lá (`Emerald`)** nổi bật.
* **Cách gộp Dự án Con vào Dự án Cha (`Project Modular`)**:
  1. Bấm nút **`Project Modular`** (biểu tượng xếp lớp ☶) trên dòng dự án muốn làm Cha.
  2. **Bảng Trái (hoặc Trên)**: Dự án Cha đang chọn. **Bảng Phải (hoặc Dưới)**: Danh sách dự án ứng viên ➔ Bấm **`Chọn làm Con`** để gộp, hoặc bấm **`Gỡ con (Unlink)`** để tách ra độc lập.
* **Công thức Ngân sách & Cảnh báo màu**:
  $$\text{Remaining (Còn lại)} = \text{Budget} - \text{Actual/Forc} + \text{Supporting Fee}$$
  - 🟢 **Xanh lá**: Còn dư dồi dào (`> 20%` Budget).
  - 🟡 **Vàng**: Sắp chạm trần (`0% – 20%` Budget).
  - 🔴 **Đỏ**: Vượt ngân sách (`< 0`).
  - Nhãn **`ACT` (Xanh)** = Chi phí thực tế; Nhãn **`FORC` (Cam)** = Có khoản chi phí dự kiến.

### 5.2. 💳 Tab Cost (Dòng Tiền Giải Ngân & Thanh Toán 3 Đợt)
* **Phân loại khoản mục**: `Cost Summary` (Hợp đồng chính), `Variation Order - VO` (Phát sinh tăng/giảm), `Other Expenses` (Chi phí lẻ).
* **Công thức Thuế VAT & Thanh toán 3 Đợt (`1st`, `2nd`, `3rd Paid`)**:
  - Hỗ trợ VAT `0%`, `8%`, `10%` (làm tròn số nguyên chuẩn kế toán `Math.round()`).
  - `Giá trị sau VAT = Giá trị trước VAT × (1 + VAT%)`.
  - Khi nhập **Đợt 1 (`1st Paid` - Tạm ứng)** và **Đợt 2 (`2nd Paid` - Tiến độ)**, hệ thống tự tính **Đợt 3 (`3rd Paid` - Quyết toán)** để tổng đủ **100%**.
  - `Số dư còn phải trả (Balance) = Actual - (1st Paid + 2nd Paid + 3rd Paid)`. Bằng `0` khi đã tất toán.
* **Tiện ích kiểm soát dòng tiền**:
  - **Cảnh báo quyết toán (`Final Warning`)**: Báo vàng/đỏ khi hạn thanh toán đợt cuối còn `≤ 14 ngày` mà chưa hoàn tất.
  - **Bộ lọc `Filter Paid Date`**: Lọc nhanh các khoản chi có ngày thanh toán Đợt 1, 2 hoặc 3 nằm trong khoảng từ ngày... đến ngày... và tự động tô viền xanh lá các ô khớp.
  - **Click chuyển nhanh**: Bấm vào Mã/Tên dự án để nhảy sang `Task Detail`, hoặc bấm biểu tượng 🔗 để nhảy qua lại giữa `Budget` và `Cost`.

---

## 🤝 6. TAB DELEGATION & TRACKER – GIAO VIỆC & DUYỆT NGHIỆM THU 5 BƯỚC

### 🎯 Dùng để làm gì?
Phân công đầu việc cho từng cá nhân (`PIC`), phòng ban hoặc nhà thầu ngoài (`Party`) và theo dõi tiến độ nghiệm thu minh bạch.
*(Quy tắc tự động: Bất kỳ ai hoặc đơn vị nào có tên trong ô `Party` của Dự án/Task đều được cấp quyền xem và cập nhật công việc đó).*

### 🔄 Quy Trình 5 Bước Phê Duyệt Trên Bảng Tracker
1. **`Assigned` (0%)**: Người quản lý tạo đầu việc và giao cho PIC / Nhà thầu.
2. **`Accepted / On process` (50%)**: Người nhận bấm **"Nhận việc"** và bắt đầu thi công. *(Nếu Task cha bật `Realtime Update`, ngày `Start` thực tế sẽ tự động được ghi nhận).*
3. **`Pending completed / ReqApproval` (85%)**: Người làm báo cáo hoàn thành, đính kèm ảnh hiện trường và bấm **"Gửi duyệt"**.
4. **`Approved / Completed` (100%)**: Quản lý/Admin kiểm tra và bấm **"Phê duyệt (Approve)"**. *(Khi 100% đầu việc con đạt Completed, Task cha tự động chốt ngày `Finish` thực tế và đẩy lịch các việc kế tiếp).*
5. **`Rejected / Needs Rework` (25%)**: Nếu chưa đạt, Quản lý bấm **"Từ chối (Reject)"** kèm lý do để làm lại.

---

## 🗺️ 7. TAB LAYOUT – BẢN ĐỒ MẶT BẰNG 2D, DIỆN TÍCH (m²) & MÃ QR

### 🎯 Dùng để làm gì?
Định vị trực quan từng gian hàng trên bản vẽ kiến trúc các tầng (`B2` ➔ `L5`), xem màu sắc tiến độ, diện tích (`m²`) và cảnh báo sự cố ngay trên mặt bằng.

### 🎨 Bảng Chú Thích Màu Nổi (`Color Legend`) & Quy Tắc Tính Diện Tích (`m²`)
Ở góc màn hình có bảng **Color Legend** (có thể kéo thả tự do hoặc thu gọn) hiển thị thống kê từng nhóm theo công thức:
`[Tên Trạng Thái / Nhóm] : [Số lượng unit] • [Tổng diện tích m²] • [Tỷ lệ %]` và dòng tổng **`TOTAL`** ở dưới cùng.
* **📐 Công thức tính Diện tích (`m²`) chuẩn xác**:
  - Diện tích của mỗi nhóm (VD: `Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) được tính bằng **tổng diện tích (`sizeM2`) của các Dự án duy nhất (Unique Projects)** đang thuộc nhóm đó.
  - *Lợi ích*: Khi 1 dự án lớn gộp 2–3 ô mặt bằng, diện tích dự án chỉ được tính **1 lần duy nhất**, không bao giờ bị nhân đôi sai lệch. Chỉ khi ô mặt bằng chưa gắn dự án nào thì mới lấy diện tích hình học của ô.
* **✨ Hiệu ứng Viền Màu khi bấm vào Color Legend**:
  - Khi bạn nhấp chọn 1 dòng trạng thái trong bảng **Color Legend** (VD: bấm vào ô `Completed` hoặc `In Progress`):
    + Những gian hàng/dự án nào thuộc nhóm đó và **có diện tích (`sizeM2 > 0`)** sẽ tự động sáng lên **đường viền màu chính của trạng thái đó bao xung quanh**.
    + Những ô **không có diện tích (`sizeM2 = 0` hoặc trống)** sẽ **không hiện viền**, giúp bạn nhận diện ngay các dự án có diện tích thực tế trên mặt bằng.
* **🎨 Phân Loại Tô Màu (Paint Categories) – Độc Quyền Admin**:
  - **Cấu hình độc quyền Admin**: Việc thiết lập, thêm mới, xóa bỏ Paint Categories và gắn các nhóm điều kiện (`dynamic conditions`) vào danh mục trong **Edit Mode** chỉ có duy nhất **Admin** mới được thực hiện.
  - **Tự động áp dụng cho toàn bộ người dùng**: Khi Admin cấu hình hoặc chọn bộ lọc Paint Category (`Active Paint Filter`), hệ thống tự động lưu trữ lên Cloud Firestore và đồng bộ thời gian thực đến tất cả tài khoản User khác. Mọi người dùng sẽ tự động áp dụng bộ lọc màu theo đúng cấu hình của Admin.
  - **Chế độ Read-Only cho User**: Các tài khoản thông thường xem danh mục ở chế độ Chỉ đọc (Read-Only) và tự động nhận kết quả tô màu theo Admin.

### 👆 Tương tác 1 chạm trên Mặt Bằng 2D
* **Chạm vào Gian hàng (Unit Tooltip thông minh)**:
  - Tự động né tránh không bao giờ che khuất gian hàng đang chọn hoặc đè lên thanh Header.
  - Xem ngay thanh tiến độ đôi (`Plan %` vs `Act %`), ngày `Start` & `Handover`.
  - Bấm **`[📊 Gantt]`**: Mở cửa sổ **Mini Gantt** xem nhanh tiến độ và đường `TODAY` của riêng gian hàng đó ngay trên bản đồ.
  - Bấm **`[💬 Chat]`**: Mở ngay khung trao đổi của dự án (chỉ tải 25 tin nhắn mới nhất siêu nhẹ, tốn 0 read thừa).
  - Bấm **`[🖼️ Hình ảnh]`**: Xem hoặc dán thêm link ảnh hiện trường (được cô lập riêng biệt 100% giữa `HCM` và `HN`).
* **Chế độ Lọc Sự Cố (`Alerts Only`)**: Bấm nút chuông **`Alerts`** ở thanh trên cùng để làm mờ các gian hàng bình thường và chỉ làm sáng các gian hàng đang trễ hạn hoặc sắp bàn giao/khai trương.
* **📱 Quét Mã QR (`QR Code`)**: Mỗi dự án có 1 mã QR. Dùng điện thoại quét mã QR, ứng dụng sẽ tự động chuyển đúng `Chi nhánh`, `Năm`, `Tầng`, mở Tab **Layout** và **phóng to (Zoom 70%)** thẳng vào gian hàng đó!

---

## 🛡️ 8. PHÂN QUYỀN (RBAC), ĐỒNG BỘ ĐA THIẾT BỊ & SAO LƯU R2

### 🔐 5 Lớp Phân Quyền Tài Khoản (Account Control)
1. **`Admin`**: Toàn quyền quản trị hệ thống, phân quyền RBAC, duyệt ngân sách, cấu hình sao lưu.
2. **`Standard User` (Manager / Staff / Đối tác CP)**: Được cấp quyền chi tiết theo 5 tiêu chí:
   - `canWrite`: Được phép Thêm/Sửa/Xóa (Nếu tắt ➔ Chỉ xem).
   - `storePermissions`: Quyền xem chi nhánh `HCM`, `HN`.
   - `locationPermissions`: Quyền xem theo từng tầng (`B1`, `L1`... hoặc đặc quyền `"all"` xem mọi tầng).
   - `partyPermissions`: Quyền xem theo bộ phận/nhà thầu (hoặc đặc quyền `"all"` điều phối mọi bộ phận).
   - `tabPermissions`: Cho phép truy cập hoặc ẩn từng Tab.
   - **Bảo mật tài chính (`Cost Masking`)**: Tài khoản không có quyền xem tài chính sẽ thấy các con số tiền tệ hiển thị thành `***`.

### 🔄 Đồng Bộ Tức Thì & Tự Làm Sạch Dữ Liệu (Zero-Lag & Self-Healing)
* **Lưu tức thì `0ms` & Chống mất mạng (`Offline Queue`)**: Mọi thao tác Lưu/Sửa/Xóa phản hồi ngay lập tức trên màn hình. Nếu rớt mạng Wi-Fi/4G, dữ liệu được cất an toàn trong hàng đợi `syncQueue` và tự đẩy lên máy chủ ngay khi có mạng lại.
* **Thức giấc qua đêm (`Overnight Wake-up`) & Tự dọn "Task Ma"**: Khi máy tính hoặc iPad mở lại sau khi gập máy ngủ qua đêm, hệ thống tự động kéo bù các thay đổi mới nhất và tự xóa sạch các công việc đã bị đồng nghiệp xóa từ máy khác mà **không cần bấm xóa cache thủ công**.
* **☁️ Sao lưu tự động lên Cloudflare R2 (`R2 Auto-Backup`)**: Hệ thống có tiến trình ngầm định kỳ tự động nén (`GZIP`) toàn bộ dữ liệu Dự án, Công việc, Ngân sách, Chi phí và lưu trữ an toàn lên đám mây **Cloudflare R2**, bảo hiểm dữ liệu tuyệt đối từ nay đến 2027+.

---

## ⌨️ 9. BẢNG PHÍM TẮT & MẸO THAO TÁC NHANH

| Phím tắt / Thao tác | Tác dụng tức thì |
| :--- | :--- |
| **`Ctrl + K`** *(hoặc `Cmd + K`)* | Mở bảng **Command Palette** để nhảy nhanh tới bất kỳ Dự án, Tab hoặc lệnh nào |
| **`/`** | Đưa con trỏ chuột vào ngay ô **Tìm kiếm (Search)** |
| **`P`** | Mở nhanh cửa sổ **Tạo Dự Án Mới (`+ New Project`)** |
| **`T`** | Mở nhanh cửa sổ **Tạo Công Việc Mới (`+ New Task`)** |
| **`Ctrl + Z`** *(hoặc `Cmd + Z`)* | **Hoàn tác (Undo)** thao tác sửa/xóa công việc vừa thực hiện |
| **`Shift + Click`** | Tích chọn nhanh một dải nhiều công việc liên tiếp trong `Edit Mode` |
| **`Shift + F`** | Bật / Tắt chế độ **Toàn màn hình (Focus Mode)** |
| **`Esc`** | Xóa nhanh từ khóa tìm kiếm / Đóng cửa sổ Modal đang mở |
| **Kéo thanh tiêu đề Modal** | Mọi cửa sổ (Project, Task, FAQ Bot, Legend) đều kéo thả được để vừa xem vừa đối chiếu |
| **In ấn (`Print Preview`)** | Mở Menu góc `☰` ➔ `Print Preview` để xuất PDF/PNG khổ A2/A3/A4 kèm Watermark bảo mật |

---

## ❓ 10. HỎI ĐÁP NHANH CHO NGƯỜI MỚI (TOP CÂU HỎI THƯỜNG GẶP)

1. **Hỏi: Tôi mới vào công ty, làm sao để biết mình cần làm việc gì hôm nay?**
   - **Đáp**: Bạn mở Tab **`Delegation`** (hoặc bấm chuông Thông báo 🔔 góc trên phải) để xem các đầu việc được giao cho bộ phận (`Party`) của bạn, hoặc mở Tab **`Gantt`** bấm nút `Today` để xem các việc đang cắt ngang đường kẻ đỏ hôm nay.
2. **Hỏi: Tại sao tôi không sửa được dữ liệu hoặc thấy số tiền hiện `***`?**
   - **Đáp**: Có 3 lý do: (1) Bạn đang chọn **Năm cũ** (hệ thống tự khóa `Read-Only`); (2) Bạn đang để đơn vị tiền tệ là **`JPY` hoặc `USD`** trên Header (hãy đổi về `'000 VND`); hoặc (3) Tài khoản của bạn đang ở chế độ Chỉ xem / Chưa được cấp quyền xem tài chính.
3. **Hỏi: Làm sao để 1 dự án hiển thị tô màu trên nhiều ô mặt bằng ở Tab Layout?**
   - **Đáp**: Khi sửa Dự án, tại ô **`Project Code Link`**, bạn nhập danh sách các mã ô cách nhau bằng dấu phẩy (VD: `L2-201, L2-202`). Bản đồ sẽ tô màu cả 2 ô nhưng diện tích `m²` trong bảng Legend vẫn chỉ tính 1 lần chuẩn xác theo dự án.
4. **Hỏi: Khi tôi đổi ngày của 1 công việc, làm sao để các công việc phía sau tự động dời ngày theo?**
   - **Đáp**: Bạn chỉ cần điền mã công việc trước vào ô **`Predecessor`** của công việc sau (VD: `A01-1FS`) và đảm bảo công việc sau đang bật biểu tượng **Linh hoạt (▶️ Play màu xanh dương)**.
5. **Hỏi: Trong bảng Color Legend ở Tab Layout, tại sao khi tôi bấm vào 1 trạng thái thì có ô hiện viền màu đậm, có ô lại không có viền?**
   - **Đáp**: Theo quy tắc trực quan của hệ thống, khi bạn bấm chọn 1 mục trong Color Legend (như `Completed` hay `In Progress`), chỉ những gian hàng/dự án **đã có số liệu diện tích (`sizeM2 > 0`)** mới được vẽ **viền màu trạng thái bao xung quanh**; các ô chưa có diện tích (`0 m²`) sẽ không hiện viền.
