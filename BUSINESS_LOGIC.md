# 🏛️ TAKASHIMAYA PROJECT MANAGEMENT (TAKA-PM) — COMPREHENSIVE BUSINESS LOGIC & DOMAIN SPECIFICATION

> ⛔ **QUY TẮC BẤT KHẢ XÂM PHẠM (IMMUTABLE DOMAIN CONSTITUTION)**:
> Tài liệu này là **Nguồn Tham Chiếu Nghiệp Vụ Tối Thượng (Single Source of Truth)** dành cho **Chuyên gia Nghiệp vụ (Domain Experts / PM / QS / Accounting)**, **Hệ thống Trợ lý Hỏi đáp (FAQ Bot)** và **AI Coding Agents**. Toàn bộ công thức tài chính, quy tắc lập lịch WBS/Gantt, luồng phê duyệt, cơ chế cô lập dữ liệu, ánh xạ mặt bằng động và phân quyền RBAC tại đây TUYỆT ĐỐI KHÔNG ĐƯỢC XÓA BỎ hay LÀM SAI LỆCH trong bất kỳ bản cập nhật nào.

---

## 🧭 MỤC LỤC ĐIỀU HƯỚNG NHANH (NAVIGATION INDEX)

| Mục | Phân Hệ Nghiệp Vụ (Domain Module) | Từ Khóa Tra Cứu Nhanh (Keywords) |
| :--- | :--- | :--- |
| **[Mục 1](#-1-quy-tắc-phạm-vi-cô-lập-4-khóa--điều-hướng-cố-định-dự-án)** | **Phạm Vi, Cô Lập 4 Khóa & Fix Project Code** | `4-Key Isolation`, `projectId`, `store`, `year`, `Archive Read-Only`, `Currency Guard`, `Quick Navigator`, `fixedProjectCode` |
| **[Mục 2](#-2-không-gian-làm-việc-cá-nhân-my-work--đồng-bộ-kiểm-tra-theo-tài-khoản)** | **My Work Tab, Bộ Lọc Thời Gian & Đồng Bộ Đã Kiểm Tra** | `myWork`, `Summary Mode 0-Read`, `Today/This Week`, `Reviewed Sync`, `buildCompletionSignature`, `Cross-Device Check` |
| **[Mục 3](#-3-vòng-đời-dự-án-general-mốc-tiến-độ--earned-value-summary)** | **Vòng Đời Dự Án (General), Cột Mốc & Báo Cáo Summary** | `Project Status`, `Tak Start`, `Handover`, `Opening`, `Auto vs Manual Dates`, `linkCodes`, `Pin Priority`, `EVM / KPI` |
| **[Mục 4](#-4-cấu-trúc-wbs-tiền-nhiệm-predecessor--biểu-đồ-gantt)** | **Quản Lý Task WBS, Tiền Nhiệm (`#`) & Biểu Đồ Gantt** | `WBS Rollup`, `Predecessor FS/SS/FF/SF`, `Double Lock`, `Cross-Project`, `Topological Cascade`, `Flexible vs Pinned`, `Gantt` |
| **[Mục 5](#-5-ngân-sách-budget-cây-cha-con--chi-phí-3-đợt-cost)** | **Ngân Sách (Budget), Cây Modular & Chi Phí 3 Đợt (Cost)** | `Parent-Self-Sub`, `Remaining Budget`, `Supporting Fee`, `ACT vs FORC`, `VAT 0/8/10%`, `P1/P2/P3`, `14-Day Alert`, `Atomic Dot-Notation` |
| **[Mục 6](#-6-ủy-quyền-giao-việc-delegation-tracker-5-bước--lịch-ios)** | **Ủy Quyền Giao Việc (Delegation), Tracker & Lịch iOS** | `Party Auto-Access`, `5-Step State Machine`, `Assigned/Accepted/ReqApproval/Approved/Rejected`, `Webcal QR Sync` |
| **[Mục 7](#-7-mặt-bằng-2d-layout-diện-tích-m²--picture-mapping-dynamic-hierarchy)** | **Mặt Bằng 2D (Layout), Diện Tích (`m²`) & Picture Mapping** | `Unique Project Area m²`, `Status Outline Guard`, `Admin Paint Categories`, `Dynamic Hierarchy Rules`, `2-Sheet Excel/CSV Import-Export` |
| **[Mục 8](#-8-bảo-mật-phân-quyền-rbac-nhật-ký-kiểm-toán--đồng-bộ-đa-thiết-bị)** | **Phân Quyền (RBAC), Audit Log, Delta Sync & Sao Lưu R2** | `5-Layer RBAC`, `Financial Masking ***`, `audit_logs`, `Dexie Local-First`, `iOS 40MB Cap`, `Overnight Wake-up`, `Zombie Reconciliation`, `R2 Backup` |

---

## 🏢 1. QUY TẮC PHẠM VI, CÔ LẬP 4 KHÓA & ĐIỀU HƯỚNG CỐ ĐỊNH DỰ ÁN

### 1.1. Cô Lập Tuyệt Đối 4 Khóa Định Danh (`projectId` + `projectCode` + `year` + `store`)
* **Bối cảnh nghiệp vụ**: Trong vận hành trung tâm thương mại Takashimaya, một mã gian hàng/dự án (`projectCode` như `A01`, `L1-105`, `B2-201`) có thể được cải tạo nhiều lần qua các năm tài chính (`2025`, `2026`, `2027`) hoặc trùng ký hiệu tầng giữa 2 chi nhánh **TP.HCM (`HCM`)** và **Hà Nội (`HN`)**.
* **Nguyên tắc bất khả xâm phạm**: Mọi bản ghi `Project`, `Task`, `Cost`, `DelegationGroup` khi lưu trữ vào Zustand, IndexedDB (`Dexie.js`) và Cloud Firestore bắt buộc phải mang đủ 4 trường định danh:
  1. `projectId` (UUID duy nhất của dự án).
  2. `projectCode` (Mã nghiệp vụ dự án, chuẩn hóa viết hoa `trim().toUpperCase()`).
  3. `year` / `projectYear` (Năm tài chính dạng chuỗi chuẩn hóa `String(year).trim()`).
  4. `store` / `projectStore` (Chi nhánh chuẩn hóa `toLowerCase().trim()`: `'hcm'` hoặc `'hn'`).
* **Thứ tự ưu tiên 5 bước khi liên kết thực thể (`isTaskBelongsToProject`, `isDelegationGroupBelongsToProject`, `getTasksForProject`, `resolveProjectContext`)**:
  1. **Loại trừ bản ghi đã xóa**: Nếu `record.isDeleted === true` hoặc ID nằm trong bộ nhớ đệm `taskDeletedTracker` ➔ **Loại trừ ngay (`return false`)**.
  2. **Khớp ID Dự án (Ưu tiên #1)**: Nếu cả 2 thực thể đều có `projectId`:
     - Trùng nhau (`task.projectId === project.id`) ➔ **Khớp hợp lệ (`return true`)**.
     - Khác nhau (`task.projectId !== project.id`) ➔ **Lập tức loại trừ (`return false`)**, tuyệt đối cấm fallback sang `projectCode`.
  3. **Khớp Chi nhánh Store (Ưu tiên #2)**: So sánh `store`. Nếu khác chi nhánh (`HCM` vs `HN`) ➔ **Lập tức loại trừ (`return false`)**.
  4. **Khớp Năm tài chính Year (Ưu tiên #3)**: So sánh `year`. Nếu khác năm (`2026` vs `2027`) ➔ **Lập tức loại trừ (`return false`)**.
  5. **Legacy Fallback (Dữ liệu lịch sử)**: Chỉ khi bản ghi cũ thiếu hoàn toàn `projectId`, hệ thống mới đối chiếu kết hợp đồng thời cả 3 yếu tố: **`projectCode` + `store` + `year`**.

### 1.2. Khóa Sổ Năm Cũ (`Archive Read-Only`) & Khóa Nhập Liệu Ngoại Tệ (`Currency Input Guard`)
* **Khóa sổ kiểm toán năm cũ (`year < CurrentYear`)**: Khi người dùng chọn niên độ tài chính nhỏ hơn năm hiện tại, hệ thống tự động chuyển sang chế độ **Chỉ xem (`Archive Read-Only`)** đối với các tài khoản thông thường nhằm bảo vệ toàn vẹn số liệu lịch sử đã quyết toán.
* **Khóa an toàn khi quy đổi tiền tệ (`VND` / `JPY` / `USD`)**:
  - Đơn vị gốc lưu trữ trong cơ sở dữ liệu là **`'000 VND`** (Nghìn đồng).
  - Khi người dùng chuyển sang xem theo **`JPY` (Yên Nhật)** hoặc **`USD` (Đô la Mỹ)**, hệ thống tự động nhân/chia theo tỷ giá cấu hình (`exchangeRates`) trên toàn bộ bảng `Budget`, `Cost`, `Summary`.
  - Đồng thời, mọi ô nhập tiền trực tiếp trên bảng tự động khóa (`disabled`) khi đang ở chế độ `JPY`/`USD` để ngăn ngừa rủi ro người dùng nhập nhầm số tiền VND vào ô ngoại tệ. Để sửa số tiền, người dùng chuyển về `'000 VND`.

### 1.3. Cơ Chế Điều Hướng `Quick Navigator` & Ô Cố Định Dự Án (`Fix Project Code` vs `Search`)
* **Tách biệt mục đích giữa `Fix Project Code` (`fixedProjectCode`) và `Search` (`searchTerm`)**:
  - **Ô `Fix Project Code`**: Dùng để **ghim cố định một dự án mục tiêu** xuyên suốt tất cả các Tab (`Detail`, `Gantt`, `Budget`, `Cost`, `Layout`, `My Work`).
  - **Ô `Search`**: Dùng để tìm kiếm từ khóa phụ (tên công việc, tên nhà thầu, ghi chú, hạng mục chi phí) **bên trong** phạm vi đang xem.
* **Quy tắc khi click từ `Quick Navigator` (hoặc click liên kết mã dự án xuyên Tab)**:
  1. Hệ thống điền mã dự án (`project.code`) vào ô **`Fix Project Code`** (`setFixedProjectCode(code)`) và **xóa trống ô `Search`** của các tab (`detailTabFilterCode = ''`, `ganttTabSearchTerm = ''`, `budgetTabSearchTerm = ''`, `costTabSearchTerm = ''`).
  2. Nhờ đó, người dùng vừa cố định được dự án cần làm việc, vừa rảnh tay gõ thêm từ khóa lọc chi tiết vào ô `Search` mà không sợ làm mất dự án đang chọn.
* **Hành vi đồng bộ thông minh của `Fix Project Code`**:
  - Tự động nới lỏng bộ lọc trạng thái/tiền tệ (`filterTaskStatus = 'all'`, `filterProjectStatus = 'all'`, `moneyFilter = 'all'`, `hasActForcFilter = 'all'`) để đảm bảo dự án và toàn bộ công việc/chi phí của nó luôn hiển thị đầy đủ.
  - Tự động nhảy bộ lọc tầng (`globalLocationFilter`) sang đúng tầng (`location`) của dự án được ghim (hoặc chuyển sang `'all'` nếu khớp nhiều tầng).
  - Tự động bung mở (expand) toàn bộ cây Dự án Cha – Con (`Budget`) và danh sách công việc (`Detail`, `Gantt`).
  - Khi người dùng bấm nút **`X`** xóa `Fix Project Code`, hệ thống tự động khôi phục lại trạng thái bộ lọc trước đó.

---

## ⚡ 2. KHÔNG GIAN LÀM VIỆC CÁ NHÂN (`MY WORK`) & ĐỒNG BỘ KIỂM TRA THEO TÀI KHOẢN

### 2.1. Chế Độ Tóm Tắt `0 Firestore Read` (Summary Mode) vs Tải Chi Tiết (Full Details)
* **Summary Mode (Mặc định khi mở Tab `My Work`)**:
  - Hệ thống tổng hợp danh sách công việc cá nhân trực tiếp từ `project.taskSummaries`, `delegationGroups` và các cột mốc dự án (`Handover`, `Opening`) đã có sẵn trong bộ nhớ RAM (Zustand/Dexie).
  - **Tiêu thụ `0` lượt đọc Firestore phụ trội**, phản hồi trong `0ms`.
* **Load Full Details Mode**: Khi người dùng chủ động nhấn nút `Load Full Details` (hoặc khi đã mở Tab `Detail`/`Gantt`), hệ thống mới kích hoạt đầy đủ trường ghi chú sâu và bình luận của từng task.

### 2.2. Hệ Thống Bộ Lọc Chân Trời Thời Gian (Time-Horizon Filters)
Để giúp nhân sự (PIC) và quản lý tập trung xử lý đúng việc cần làm trong ngày/tuần, Tab `My Work` cung cấp 6 bộ lọc thời gian kết hợp cùng `Store` (`All` / `HCM` / `HN`), `Status`, `Sort` và `Fix Project Code`:
1. **`All Dates`**: Hiển thị toàn bộ đầu việc được phân công.
2. **`Overdue` (Quá hạn)**: Các đầu việc chưa hoàn thành có `dueDate < Today`.
3. **`Today` (Hôm nay)**: Các đầu việc có hạn chót hoặc ngày thực hiện rơi vào đúng ngày hôm nay (`dueDate === Today` hoặc `startDate <= Today <= dueDate`), cộng với các việc quá hạn khẩn cấp.
4. **`This Week` (Tuần này)**: Các đầu việc có hạn chót nằm trong tuần lễ hiện tại (Thứ Hai ➔ Chủ Nhật).
5. **`Next 7 Days` (7 ngày tới)**: Các đầu việc có hạn chót từ `Today` đến `Today + 7 days`.
6. **`This Month` (Tháng này)**: Các đầu việc có hạn chót nằm trong tháng hiện tại.

### 2.3. Đồng Bộ Trạng Thái "Đã Kiểm Tra / Hoàn Tất" Theo Tài Khoản Đa Thiết Bị (Per-Account Cross-Device Reviewed Sync)
* **Bài toán thực tế**: Khi người dùng (ví dụ tài khoản `CP-HUNG`) dùng điện thoại iOS ngoài công trường tích chọn đã kiểm tra (`Mark as Reviewed`) các công việc trong `My Work`, thì khi mở máy tính Laptop lên, các công việc đó cũng phải tự động nằm ở cột **`Completed / Reviewed`**, tuyệt đối không hiện lặp lại ở cột `To Do` hay `In Progress`.
* **Kiến trúc lưu trữ & đồng bộ theo Tài khoản (`accountKey`)**:
  - Định danh tài khoản chuẩn hóa: `accountKey = normalizeAccountKey(currentUser.email || currentUser.username || currentUser.name)`.
  - Lưu trữ đám mây: Tài liệu Firestore `taka_config/mywork_reviewed_<accountKey>` kết hợp phát tín hiệu qua kênh `taka_deltas` (collection `'config'`).
  - Bộ nhớ đệm cục bộ: `localStorage` với khóa cô lập theo từng tài khoản `taka_mywork_completed_v1_<accountKey>` để nạp tức thì `0ms` khi vừa mở ứng dụng.
* **Chữ ký trạng thái thông minh (`buildCompletionSignature`) & Tự động kích hoạt lại khi có biến động**:
  - Mỗi khi người dùng tích chọn 1 đầu việc, hệ thống lưu kèm chữ ký:
    $$\text{Signature} = \text{status} \mid \text{progress} \mid \text{endDate} \mid \text{delStatus}$$
  - **Cơ chế bảo vệ thông minh**:
    1. Nếu đầu việc giữ nguyên trạng thái từ lúc người dùng tích chọn ➔ Đầu việc tiếp tục nằm yên trong cột `Completed / Reviewed` trên mọi thiết bị (iOS, iPad, Desktop) của tài khoản đó.
    2. Nếu đồng nghiệp hoặc cấp trên **thay đổi tiến độ, dời ngày hạn chót (`endDate`), hoặc trả về yêu cầu làm lại (`Rejected / Rework`)**, chữ ký hiện tại sẽ khác với chữ ký lúc tích chọn (`currentSig !== savedSig`) ➔ Hệ thống **tự động gỡ dấu tích** và đưa đầu việc quay trở lại cột `To Do / In Progress` để người phụ trách biết có cập nhật mới cần xử lý.

---

## 📊 3. VÒNG ĐỜI DỰ ÁN (`GENERAL`), MỐC TIẾN ĐỘ & EARNED VALUE (`SUMMARY`)

### 3.1. Công Thức Tự Động Suy Diễn Trạng Thái Dự Án (`computeProjectActStatus`)
Trạng thái thực tế của dự án được tính toán động trong bộ nhớ dựa trên các Task con thuộc dự án đó (đối chiếu qua 4 khóa định danh):
1. **`Canceled`**: Khi dự án được đánh dấu hủy chủ động.
2. **`Completed`**: Khi **100%** các Task con hợp lệ đạt trạng thái `Completed` (hoặc tiến độ trung bình đạt `100%`).
3. **`Delayed` (Trễ tiến độ)**: Khi có bất kỳ Task con nào chưa hoàn thành mà ngày kết thúc kế hoạch đã qua (`endDate < Today`), hoặc tiến độ thực tế (`Act %`) thấp hơn tiến độ kế hoạch (`Plan %`) vượt ngưỡng cảnh báo.
4. **`On process` (`In Progress`)**: Khi dự án có ít nhất 1 Task đang thi công (`progress > 0%` hoặc `status === 'On process'`) hoặc ngày hiện tại đã bước vào vùng thực hiện.
5. **`Upcoming`**: Khi tất cả các Task đều chưa bắt đầu (`0%`) và ngày bắt đầu nằm trong tương lai (`startDate > Today`).

### 3.2. Ba Cột Mốc Trọng Yếu (`Tak Start`, `Handover`, `Opening`) & Chế Độ `Auto` vs `Manual`
* **Chế độ `Auto` (Tự động suy diễn từ Task WBS)**:
  - `Tak Start`: Lấy ngày bắt đầu sớm nhất (`Min(startDate)`) trong toàn bộ các Task của dự án.
  - `Handover` (Bàn giao mặt bằng): Tự động tìm Task có tên chứa từ khóa `"handover"` hoặc `"bàn giao"` và lấy ngày `endDate` của Task đó.
  - `Opening` (Khai trương gian hàng): Tự động tìm Task có tên chứa từ khóa `"opening"` hoặc `"khai trương"` và lấy ngày `endDate` của Task đó.
* **Chế độ `Manual` (Khóa ngày hợp đồng)**: Cho phép PM nhập trực tiếp và khóa cứng từng mốc ngày (`isStartManual`, `isHandoverManual`, `isOpeningManual`) độc lập với sự dịch chuyển của các Task con.

### 3.3. Liên Kết Đa Ô Mặt Bằng (`linkCodes`) & Ghim Ưu Tiên (`Pin Priority`)
* **`Project Code Link` (`linkCodes`)**: Cho phép một dự án liên kết với nhiều mã ô gian hàng trên bản vẽ CAD/Layout, phân tách bằng dấu phẩy (ví dụ: `L3-303-1, L3-303-2, L3-303-3`).
* **Ghim dự án ưu tiên (`isPinned` & `pinnedOrder`)**: Các dự án được gắn ghim 📌 luôn nổi lên đầu bảng `General` và được sắp xếp theo chỉ số `pinnedOrder` tăng dần (điều chỉnh bằng nút `▲ / ▼`).

---

## 📋 4. CẤU TRÚC WBS, TIỀN NHIỆM (`PREDECESSOR`) & BIỂU ĐỒ GANTT

### 4.1. Đánh Mã WBS & Cộng Dồn Task Mẹ (`In-Memory Pure Rollup`)
* **Quy ước mã WBS**:
  - **Task gốc (Root Task)**: `<ProjectCode>-<Index>` hoặc `<ProjectCode>#<Index>` (Ví dụ: `A01-1`, `A01-2` hoặc `A01#1`, `A01#2`).
  - **Task con (Sub-task)**: `<ParentCode>.<SubIndex>` (Ví dụ: `A01-1.1`, `A01-1.2`).
* **Công thức Rollup Task Mẹ (`calculateTaskParentRollup` - 100% Client Memory)**:
  - $\text{Start}_{\text{Parent}} = \min(\text{Start}_{\text{Child}_1}, \dots, \text{Start}_{\text{Child}_n})$
  - $\text{Finish}_{\text{Parent}} = \max(\text{Finish}_{\text{Child}_1}, \dots, \text{Finish}_{\text{Child}_n})$
  - $\text{Duration}_{\text{Parent}} = \text{Finish}_{\text{Parent}} - \text{Start}_{\text{Parent}} + 1 \text{ (ngày)}$
  - $\text{Progress (\%)}_{\text{Parent}} = \frac{1}{n} \sum_{i=1}^{n} \text{Progress}_{\text{Child}_i}$
  - **Cấm dùng Cloud Function ghi ngược**: Toàn bộ giá trị rollup được tính bằng Pure Function trong RAM để đạt tốc độ `0ms` và triệt tiêu vòng lặp ghi đè Firestore.

### 4.2. Cú Pháp Tiền Nhiệm (`Predecessor #`) & 4 Kiểu Liên Kết Chuẩn MS Project
* **Cú pháp chuẩn**: `[ProjectCode]#[TaskNo][Type][±Lag]` (Ví dụ: `A01#1FS+2`, `L1-105#3SS-1`, hoặc gõ tắt `#1FS` khi trong cùng dự án). Hệ thống tự động chuẩn hóa dấu `-` sang `#` (`convertMinusToHash`) và tự chữa lỗi cú pháp (`healPredecessorCode`).
* **Công thức 4 loại liên kết**:
  1. **`FS` (Finish-to-Start — Mặc định)**: Công việc kế tiếp bắt đầu sau khi công việc tiền nhiệm kết thúc.
     $$\text{Start}_B = \text{Finish}_A + 1\text{d} + \text{Lag}$$
  2. **`SS` (Start-to-Start)**: Hai công việc bắt đầu song song.
     $$\text{Start}_B = \text{Start}_A + \text{Lag}$$
  3. **`FF` (Finish-to-Finish)**: Hai công việc kết thúc cùng thời điểm.
     $$\text{Finish}_B = \text{Finish}_A + \text{Lag}$$
  4. **`SF` (Start-to-Finish)**: Công việc kế tiếp kết thúc dựa trên ngày bắt đầu của công việc tiền nhiệm.
     $$\text{Finish}_B = \text{Start}_A + \text{Lag}$$
* **Khóa 2 Đầu Bằng 2 Tiền Nhiệm (Double Predecessor Two-Ended Lock)**:
  - Khi một Task được nhập 2 mã tiền nhiệm quy định cả đầu bắt đầu (như `FS`/`SS`) và đầu kết thúc (như `FF`/`SF`), ví dụ: `A01#1SS, A01#3FF`:
  - Hệ thống tự động khóa cứng ngày `Start` theo `#1`, khóa ngày `Finish` theo `#3`, và **tự động tính lại thời lượng**:
    $$\text{Duration} = \max(0, \text{Finish} - \text{Start})$$
* **Liên kết Xuyên Dự Án (`Cross-Project Predecessors`)**:
  - Hỗ trợ phụ thuộc vào công việc của dự án khác (khác Mã, Tầng, Chi nhánh hoặc Năm).
  - Hiển thị huy hiệu màu tím **`External Link`** và yêu cầu xác nhận khi thiết lập liên kết ngoại vi để tránh gõ nhầm mã.

### 4.3. Động Cơ Trượt Lịch Dây Chuyền (`Topological Cascade Engine`) & Chống Vòng Lặp (`Circular Guard`)
* **Linh hoạt (`Flexible / Realtime Update` ▶️) vs Ghim cố định (`Pinned` 📌)**:
  - Khi Task tiền nhiệm thay đổi ngày, hệ thống duyệt đồ thị phụ thuộc theo thứ tự Topo (`cascadeTaskDates`).
  - Các Task phụ thuộc đang bật **`Realtime Update` (▶️ xanh dương)** sẽ tự động trượt ngày `Start`/`Finish` nối tiếp nhau.
  - Các Task đang bật **`Pinned` (📌 xanh lá)** giữ nguyên ngày cố định, không bị đẩy lịch.
* **Circular Dependency Guard**: Sử dụng tập hợp `visited = new Set<string>()` khi duyệt đồ thị cha-con và tiền nhiệm; nếu phát hiện chu trình khép kín (`A -> B -> A`), hệ thống ngắt nhánh lặp ngay lập tức để bảo vệ trình duyệt không bị treo.
* **Tự động cập nhật mã khi kéo thả đổi thứ tự (`reorderTaskOrderIndex`)**: Khi người dùng kéo thả Task đổi vị trí dòng (ví dụ từ dòng `#3` lên `#2`), hệ thống tự động viết lại toàn bộ chuỗi `Predecessor` của các Task khác đang trỏ tới `#3` thành `#2`.

---

## 💰 5. NGÂN SÁCH (`BUDGET`), CÂY CHA-CON & CHI PHÍ 3 ĐỢT (`COST`)

### 5.1. Cấu Trúc Ngân Sách & Cây Dự Án Cha – Con (`Project Modular Hierarchy`)
* **Cấu trúc 3 tầng ngân sách**:
  1. **Category (Hạng mục lớn)**: Định mức ngân sách tổng năm được phê duyệt.
  2. **Sub-Category (Hạng mục con)**: Tính theo tỷ trọng $\text{Approved Budget} = \text{Category Budget} \times \frac{\text{Ratio\%}}{100}$.
  3. **Project / Modular Tree (`Parent -> ↳ SELF + ↳ SUB`)**:
     - Mỗi dự án độc lập là một dòng tổng hợp. Khi dùng tính năng **`Project Modular`** để gộp các dự án con vào một dự án mẹ:
     - Dòng **`↳ SELF` (Nhãn Xanh dương)**: Ngân sách và thực chi của riêng bản thân dự án mẹ.
     - Dòng **`↳ SUB` (Nhãn Cam)**: Ngân sách và thực chi của từng dự án con được liên kết vào.
     - **Dòng Tổng Hợp Mẹ (`Parent Row`)**: Tự động cộng dồn trong bộ nhớ (`buildBudgetTree`):
       $$\text{Budget}_{\text{Parent}} = \text{Budget}_{\text{Self}} + \sum \text{Budget}_{\text{Sub}}$$
       $$\text{Actual/Forc}_{\text{Parent}} = \text{Actual/Forc}_{\text{Self}} + \sum \text{Actual/Forc}_{\text{Sub}}$$
       $$\text{Supporting Fee}_{\text{Parent}} = \text{Supporting Fee}_{\text{Self}} + \sum \text{Supporting Fee}_{\text{Sub}}$$
     - **Huy hiệu nhận diện**: Khi dự án mẹ có `> 2` dòng con, huy hiệu đếm số lượng ở cột `No.` tự động chuyển sang màu **Xanh Lá (`Emerald`)**.

### 5.2. Công Thức Số Dư Ngân Sách (`Remaining Budget`) & Ngưỡng Cảnh Báo Màu
* **Công thức cốt lõi (tính trên giá trị Chưa VAT / Excl. VAT)**:
  $$\text{Remaining Budget (Ngân sách còn lại)} = \text{Approved Budget} - \text{Actual/Forc (Excl. VAT)} + \text{Supporting Fee (Phí hỗ trợ)}$$
  $$\text{Utilization (\%)} = \frac{\text{Actual/Forc} - \text{Supporting Fee}}{\text{Approved Budget}} \times 100\%$$
* **Ngưỡng cảnh báo màu trực quan**:
  - 🟢 **Xanh lục (`Safe`)**: Ngân sách còn dư `> 20%` (tức Utilization `< 80%`).
  - 🟡 **Vàng cam (`Warning`)**: Ngân sách còn lại từ `0% – 20%` (tức Utilization `80% – 100%`).
  - 🔴 **Đỏ (`Over-Budget`)**: Ngân sách còn lại `< 0` (Vượt ngân sách, Utilization `> 100%`).
* **Khóa ngân sách gốc khi thêm Phụ lục (`Contract Addendum`)**: Khi phát sinh phụ lục hợp đồng, ngân sách gốc được đánh dấu `isOriginalLocked = true` để bảo toàn lịch sử phê duyệt ban đầu.

### 5.3. Quản Lý Chi Phí (`Cost Tab`), Thuế VAT & Thanh Toán 3 Đợt (`1st, 2nd, 3rd Paid`)
* **Phân loại khoản mục chi phí**:
  1. `Cost Summary`: Chi phí hợp đồng chính.
  2. `Variation Order (VO)`: Chi phí phát sinh tăng/giảm (tự động cộng dồn vào tổng thực chi của dự án).
  3. `Other Expenses`: Chi phí vận hành/mua sắm lẻ khác.
* **Trạng thái `ACT` (Thực tế) vs `FORC` (Dự báo)**:
  - Mỗi khoản mục có cờ chuyển đổi `act` (Xanh) hoặc `forc` (Cam). Nếu một dự án có bất kỳ khoản mục nào đang ở `forc`, dòng tổng hợp trên `Budget` và `Cost` sẽ hiển thị nhãn cảnh báo `FORC`.
* **Công thức Thuế VAT (`0%`, `8%`, `10%`)**:
  - Áp dụng làm tròn số nguyên chuẩn kế toán Việt Nam (`Math.round`):
    $$\text{Contract Amount (Incl. VAT)} = \text{Math.round}\left(\text{Amount (Excl. VAT)} \times \left(1 + \frac{\text{VAT\%}}{100}\right)\right)$$
* **Quy tắc Phân Kỳ 3 Đợt Thanh Toán (`1st Paid`, `2nd Paid`, `3rd Paid`)**:
  - Tổng tỷ lệ 3 đợt luôn đối soát bằng **100%** giá trị thực tế: $\%P_1 + \%P_2 + \%P_3 = 100\%$.
  - Khi kế toán/QS nhập **Đợt 1 (`1st Paid` - Tạm ứng)** và **Đợt 2 (`2nd Paid` - Thanh toán tiến độ)**, hệ thống tự động tính phần còn lại cho **Đợt 3 (`3rd Paid` - Quyết toán cuối)**:
    $$P_3 = \max(0, \text{Actual Amount} - P_1 - P_2)$$
  - **Số dư công nợ còn phải trả (`Balance`)**:
    $$\text{Balance} = \text{Actual Amount} - (P_1 + P_2 + P_3)$$
    Khi đã thanh toán đủ cả 3 đợt, `Balance = 0`.
* **Cảnh báo quyết toán đợt cuối (`Final Payment Alert ≤ 14 Days`)**: Khi ngày dự kiến thanh toán đợt cuối còn `≤ 14 ngày` (hoặc đã quá hạn) mà chưa tích hoàn tất thanh toán (`Final Payment Done`), hệ thống phát cảnh báo màu Vàng/Đỏ.
* **Bộ lọc Ngày Thanh Toán (`Filter Paid Date`)**: Cho phép lọc các khoản chi có ngày trả tiền của Đợt `1st`, `2nd`, hoặc `3rd` nằm trong khoảng `[FromDate, ToDate]` và tự động tô viền xanh lá (`Emerald Highlight`) đúng ô đợt thanh toán khớp điều kiện.
* **Ghi Nguyên Tử Chuỗi Chấm (`Atomic Dot-Notation Summary`)**: Mọi thao tác thêm/sửa/xóa chi phí đều đi qua `saveCostWithAtomicSummary` / `deleteCostWithAtomicSummary` dùng `financial.byStore.<store>...` và `increment()` để 2 kế toán nhập liệu cùng lúc không bao giờ ghi đè mất số liệu của nhau.

---

## 🤝 6. ỦY QUYỀN GIAO VIỆC (`DELEGATION`), TRACKER 5 BƯỚC & LỊCH iOS

### 6.1. Cơ Chế Tự Động Cấp Quyền Theo `Party` & `PIC`
* Bất kỳ nhân sự (`PIC`), phòng ban hoặc nhà thầu ngoài nào có tên xuất hiện trong trường **`Party`** của Dự án hoặc Công việc đều được hệ thống tự động cấp quyền nhìn thấy và cập nhật tiến độ cho đầu việc đó trong `Delegation` và `My Work`.

### 6.2. Máy Trạng Thái Phê Duyệt 5 Bước (`5-Step Delegation State Machine`)
Mọi đầu việc ủy quyền trong `Delegation Tracker` vận hành nghiêm ngặt qua 5 trạng thái với tỷ lệ % tiến độ chuẩn hóa:
1. **`Assigned` (`0%`)**: Quản lý khởi tạo đầu việc, gán cho `PIC` / `Party` kèm hạn chót (`Deadline`).
2. **`Accepted / On process` (`50%`)**: Người nhận việc bấm xác nhận **"Accept"** và bắt đầu triển khai ngoài hiện trường.
3. **`Pending completed / Requested Approval` (`85%`)**: Người thực hiện hoàn thành công việc, tải ảnh minh chứng hiện trường và bấm **"Request Approval"** gửi cấp trên nghiệm thu.
4. **`Approved / Completed` (`100%`)**: Người giao việc hoặc Admin kiểm tra đạt yêu cầu và bấm **"Approve"**.
5. **`Rejected / Needs Rework` (`25%`)**: Nếu chất lượng chưa đạt, người duyệt bấm **"Reject"** kèm lý do yêu cầu sửa chữa; đầu việc lùi về `25%` và bật cảnh báo đỏ trên `My Work` của người nhận.

### 6.3. Đồng Bộ Ngày Thực Tế Tự Động Giữa Tracker & Lịch Trình Gantt
* Khi đầu việc con đầu tiên trong nhóm ủy quyền chuyển sang **`Accepted / On process`**, nếu Task cha đang bật `Realtime Update`, ngày `Start` thực tế của Task cha được tự động chốt.
* Khi **100%** các đầu việc con trong nhóm ủy quyền đạt trạng thái **`Approved / Completed` (`100%`)**, Task cha tự động chuyển sang `Completed (100%)`, chốt ngày `Finish` thực tế và kích hoạt dây chuyền `Topological Cascade` đẩy lịch các Task kế tiếp trên Gantt.

### 6.4. Đồng Bộ Lịch Trực Tiếp Sang iPhone / iPad (`iOS Calendar Webcal & QR Sync`)
* Hệ thống cung cấp luồng xuất lịch chuẩn `iCalendar (.ics)` thời gian thực qua giao thức `webcal://` kèm mã **QR Code** (`CalendarSyncModal`).
* Khi người dùng quét mã QR bằng Camera iPhone/iPad và bấm **Subscribe**, ứng dụng Apple Calendar sẽ tự động đồng bộ ngầm các mốc `Tak Start`, `Handover`, `Opening` và hạn chót `Task` theo đúng bộ lọc Chi nhánh/Năm đã chọn.

---

## 🗺️ 7. MẶT BẰNG 2D (`LAYOUT`), DIỆN TÍCH (`m²`) & `PICTURE MAPPING` DYNAMIC HIERARCHY

### 7.1. Đồng Bộ Diện Tích 2 Chiều & Công Thức Tính Diện Tích (`sizeM2`) Trong `Color Legend`
* **Đồng bộ 2 chiều (`Two-Way Area Sync`)**: Khi Admin/PM chỉnh sửa diện tích `Size (m²)` của một ô gian hàng (`Unit`) trong `Layout Edit Mode`, diện tích của Dự án liên kết trực tiếp với ô đó được tự động cập nhật đồng bộ.
* **Quy tắc tính Tổng Diện Tích (`m²`) chuẩn xác trong bảng `Color Legend` (`getUnitEffectiveSizeM2`)**:
  1. Diện tích của mỗi nhóm trạng thái (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) được tính bằng **tổng diện tích (`sizeM2`) của các Dự án duy nhất (`Unique Projects`)** thuộc nhóm đó cộng với diện tích của các ô mặt bằng phụ được nối qua `Project Code Link` (`linkCodes`).
  2. **Chống nhân đôi diện tích**: Khi 1 dự án gộp nhiều ô polygon hoặc có nhiều dự án con (`Modular Sub-projects`), diện tích của dự án chủ chỉ được tính **1 lần duy nhất**, các dự án con chỉ lấy diện tích từ Unit riêng của chúng (hoặc bằng `0` nếu không gắn Unit riêng).
  3. **Fallback hình học**: Chỉ khi ô mặt bằng chưa gắn với bất kỳ Dự án nào (hoặc Dự án chưa có `sizeM2`), hệ thống mới lấy diện tích hình học của polygon (`unit.sizeM2`).

### 7.2. Quy Tắc Viền Màu Trạng Thái Khi Bấm Chọn `Color Legend` (`Status Outline Guard`)
* Khi người dùng nhấp vào một dòng trạng thái bất kỳ trong bảng **Color Legend** (ví dụ: chọn `Completed` hoặc `In Progress`):
  - Các gian hàng/dự án thuộc nhóm đó **có diện tích thực tế (`sizeM2 > 0`)** sẽ phát sáng **đường viền màu chính của trạng thái đó bao quanh polygon** trên bản đồ 2D.
  - Các ô/dự án **không có diện tích (`sizeM2 = 0` hoặc để trống)** sẽ **không hiển thị viền màu xung quanh**, giúp lãnh đạo nhận diện tức thì những gian hàng đã có dữ liệu diện tích thương mại.

### 7.3. Thiết Lập `Paint Categories` Độc Quyền Admin & Đồng Bộ Bộ Lọc Toàn Cục
* **Độc quyền Admin (`role === 'admin'`)**: Chỉ tài khoản Admin mới có quyền thêm, sửa, xóa danh mục tô màu (`Paint Categories`) và thiết lập các nhóm điều kiện lọc động (`condition groups`) trong `Edit Mode`.
* **Phát sóng thời gian thực (`Real-time Broadcast`)**: Khi Admin chọn hoặc lưu bộ lọc `activePaintFilter`, cấu hình được ghi lên `taka_config/paint_categories` và phát sóng tức thì tới toàn bộ tài khoản User đang trực tuyến. Tài khoản User ở chế độ `Read-Only` sẽ tự động hiển thị màu mặt bằng theo đúng tiêu chuẩn Admin đã chọn.

### 7.4. Phân Hệ `Picture Mapping` (`Edit` • `Dynamic Hierarchy` • `Review`) & Xuất/Nhập CSV/Excel 2 Sheet
Phân hệ `Picture Mapping` cung cấp công cụ quy hoạch mặt bằng nâng cao theo niên độ (`2025`, `2026`, `2027`...) và lưu trữ đám mây **Cloudflare R2**:
1. **Tab `EDIT` (Thiết kế Polygon & Thuộc tính Gian hàng)**:
   - Vẽ mới, chỉnh sửa đỉnh đa giác (polygon vertices), gán mã `Unit ID`, `Brand Name`, `Category Code (catCode)`, `Area (m²)`, `Lease Status`, `Hoarding`, `Contract Dates` trên bảng `EditTabInspector`.
2. **Tab `DYNAMIC HIERARCHY` (Phân Nhóm Tự Động Theo Quy Tắc — `Rule-Based Groups`)**:
   - Quản lý đa phiên bản kịch bản quy hoạch (`Versions`, ví dụ: `PM-L4-HN`, chế độ `ALWAYS ON`, tốc độ tính toán `RAM 0ms`).
   - Mỗi nhóm quy tắc (`DynamicGroupCard`) gồm màu tô (`Color`), độ trong suốt (`Opacity`), kiểu tô (`Solid` / `Hatch`), ký hiệu (`Symbol`) và danh sách các điều kiện (`Matching Rules`: `Floor`, `Category`, `Lease Status`, `Area`, `Party`, `Status`... với toán tử `=`, `!=`, `contains`, `>`, `<`, `>=`, `<=`, `in`).
   - Tự động tính tổng số lượng gian hàng (`units`) và tổng diện tích (`m²`) khớp quy tắc ngay lập tức (`0ms`). Hỗ trợ sao chép nhanh bộ quy tắc giữa các tầng/phiên bản (`[ COPY GROUPS FROM ]`).
3. **Tính Năng Xuất / Nhập Excel (`.xlsx` 2 Sheet) & CSV Trong `Dynamic Hierarchy`**:
   - **Xuất File Excel 2 Sheet (`Export Excel / CSV`)**:
     + **Sheet 1 (`Dynamic_Rules_Data`)**: Chứa bảng dữ liệu phẳng của toàn bộ các nhóm quy tắc và điều kiện (`VersionName`, `GroupId`, `GroupName`, `Color`, `Opacity`, `FillStyle`, `Symbol`, `LogicOperator`, `RuleField`, `RuleOperator`, `RuleValue`) để người dùng chỉnh sửa hàng loạt trên Excel và Import ngược lại.
     + **Sheet 2 (`Field_Reference_Guide` — Bảng Giải Thích Trường Dữ Liệu)**: Cung cấp từ điển hướng dẫn chi tiết giải thích ý nghĩa từng cột, danh sách đầy đủ các mã trường dữ liệu hợp lệ (`unitId`, `brandName`, `floor`, `catCode`, `leaseStatus`, `area`, `shopType`, `party`, `actStatus`...), các toán tử hợp lệ (`=`, `!=`, `contains`, `>`, `<`, `in`) kèm ví dụ mẫu thực tế để chuyên gia nghiệp vụ không bao giờ nhập sai mã.
   - **Nhập File (`Import CSV / Excel`)**: Đọc dữ liệu từ file CSV hoặc Sheet 1 của file Excel, tự động kiểm tra tính hợp lệ, gom nhóm theo `GroupName`/`GroupId` và áp dụng ngay lên mặt bằng với độ trễ `0ms`.
4. **Tab `REVIEW` & Đồng Bộ Đám Mây `Cloudflare R2`**:
   - So sánh trực quan các phương án mặt bằng, xuất báo cáo trình chiếu và đồng bộ toàn bộ bản vẽ + cấu hình quy tắc động lên **Cloudflare R2** qua các nút `SAVE CLOUD DYNAMIC`, `LOAD CLOUD DYNAMIC`, và dọn rác `CLEAN R2`.

---

## 🛡️ 8. BẢO MẬT PHÂN QUYỀN (`RBAC`), NHẬT KÝ KIỂM TOÁN & ĐỒNG BỘ ĐA THIẾT BỊ

### 8.1. Ma Trận Phân Quyền 5 Lớp (`5-Layer RBAC Matrix`) & Che Giấu Tài Chính (`***`)
* **`Admin` (`role === 'admin'`)**: Toàn quyền quản trị hệ thống, cấu hình người dùng (`AccControlTab`), thiết lập Paint Categories, phê duyệt nghiệm thu và kích hoạt sao lưu hệ thống.
* **`Standard User` (PM / QS / Staff / Nhà thầu CP)**: Được kiểm soát chặt chẽ qua 5 lớp quyền độc lập:
  1. `canWrite`: Cho phép Thêm/Sửa/Xóa (`true`) hoặc khóa Chỉ xem (`false`).
  2. `storePermissions`: Danh sách chi nhánh được phép truy cập (`['HCM']`, `['HN']`, hoặc `['HCM', 'HN']`). Nếu chỉ có quyền 1 chi nhánh, tùy chọn `All Stores` tự động ẩn.
  3. `locationPermissions`: Danh sách tầng được phép xem (`B2`, `B1`, `L1`..`L5`, hoặc đặc quyền `"all"` để xem mọi tầng).
  4. `partyPermissions`: Danh sách bộ phận/nhà thầu được phép xem (hoặc đặc quyền `"all"` để điều phối mọi bộ phận).
  5. `tabPermissions`: Cấp quyền hiển thị hoặc ẩn từng Tab chức năng trên thanh điều hướng.
* **Che giấu số liệu tài chính (`Financial Masking`)**: Nếu tài khoản không được cấp quyền xem tài chính (`Budget` / `Cost`), mọi con số tiền tệ trên giao diện và báo cáo sẽ tự động hiển thị thành **`***`**.

### 8.2. Nhật Ký Kiểm Toán Bất Biến (`Append-Only Audit Logs`)
* Mọi biến động liên quan đến luồng tiền (`Budget`, `Cost`, `Supporting Fee`, `3rd Paid`) và thay đổi cấu hình phân quyền (`taka_users`, `taka_config`) đều bắt buộc ghi vết vào collection `audit_logs` thông qua `auditLogService.ts` (chỉ thêm mới, cấm sửa/xóa lịch sử) kèm thông tin người thực hiện, thời gian và dữ liệu trước/sau (`Diff Viewer`).

### 8.3. Kiến Trúc Local-First (`Dexie.js`), Kênh `taka_deltas` & Tự Động Khử "Task Ma" (`Bi-Directional Reconciliation`)
1. **Local-First Cold Boot (`5–10ms`) & Trần Bộ Nhớ iOS `40MB`**:
   - Khi khởi động, `bootstrapLocalStore()` nạp 100% dữ liệu từ IndexedDB (`Dexie.js`) vào Zustand trong `5–10ms` mà không hiện màn hình chờ.
   - Trên thiết bị iOS/iPadOS, bộ nhớ đệm Firestore được khóa trần ở mức **`40MB` (`41,943,040 bytes`)** kết hợp `persistentSingleTabManager({ forceOwnership: true })` để ngăn trình duyệt Safari WebKit tự ý xóa trắng IndexedDB.
2. **Bắt Buộc Ghi Qua `firestoreWrites.ts` & Hàng Đợi Ngoại Tuyến (`syncQueue`)**:
   - Mọi thao tác Thêm/Sửa/Xóa phản ánh tức thì vào Zustand (`0ms`) và bắt buộc đi qua wrapper `src/lib/firestoreWrites.ts` để tự động phát tín hiệu `taka_deltas` (sắp xếp theo giờ máy chủ `serverTime`) sang các thiết bị khác.
   - Nếu mất kết nối mạng, tác vụ tự động lưu vào `syncQueue.ts` và phát lại ngay khi có mạng.
3. **Thức Giấc Qua Đêm (`Overnight Wake-up Guard`) & Khử "Task Ma" (`Zombie Detection - Bản Vá 1L`)**:
   - Bộ đếm nhịp tim (`Heartbeat Gap Detection`) kiểm tra mỗi 15–30 giây. Khi phát hiện máy tính/iPad vừa mở lại sau khi ngủ qua đêm (`gap > 60s`), hệ thống tự động kết nối lại socket và gọi `pullAndApplyDeltas(undefined, true)` (`forceAll`) để kéo bù 100% biến động bị lỡ.
   - Khi nhận Server Snapshot sạch (`!fromCache && !hasPendingWrites`), hệ thống đối chiếu 2 chiều và tự động dọn sạch các "Task ma" (task đã bị xóa trên máy khác nhưng còn lưu trong cache cục bộ), đồng thời bảo vệ tuyệt đối các task vừa mới tạo/sửa trong vòng 30 giây (`RECENT_EDIT_GUARD_MS = 30000`).
4. **Sao Lưu Dự Phòng Định Kỳ Lên Cloudflare R2 (`Cron R2 Auto-Backup`)**:
   - Hệ thống tự động xuất và nén `GZIP` toàn bộ cơ sở dữ liệu Dự án, Công việc, Ngân sách, Chi phí và Sơ đồ mặt bằng lên kho lưu trữ đám mây **Cloudflare R2**, đảm bảo an toàn dữ liệu tuyệt đối xuyên suốt các niên độ 2025–2027+.
