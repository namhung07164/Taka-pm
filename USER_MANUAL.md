# 📘 CẨM NANG HƯỚNG DẪN SỬ DỤNG HỆ THỐNG QUẢN LÝ DỰ ÁN TAKASHIMAYA
*(TAKASHIMAYA PROJECT MANAGEMENT SYSTEM - EXHAUSTIVE STEP-BY-STEP USER MANUAL & BOT KNOWLEDGE BASE)*

---

## 🏢 1. GIỚI THIỆU TỔNG QUAN HỆ THỐNG
Hệ thống **Takashimaya Project Management** là nền tảng quản lý dự án thi công, tiến độ, ngân sách, chi phí và phân bổ công việc chuyên sâu dành riêng cho chuỗi trung tâm thương mại Takashimaya.

### 🌐 Khái niệm & Phạm vi Dữ liệu Cốt lõi:
* **Chi nhánh & Kiểm soát quyền truy cập (Store Scope & Access Control)**:
  - **HCM**: Dữ liệu thuộc Trung tâm thương mại Takashimaya TP. Hồ Chí Minh.
  - **HN**: Dữ liệu thuộc Chi nhánh Takashimaya Hà Nội.
  - **All Stores (Tất cả chi nhánh = HCM + HN + ...)**: Chế độ tổng hợp hiển thị gộp toàn bộ dự án của cả 2 chi nhánh HCM và HN.
  - *Quy tắc bảo mật Account Control*: Người dùng chỉ nhìn thấy và chọn được các chi nhánh mà tài khoản được phân quyền (`storePermissions`). Nếu người dùng chỉ được cấp quyền 1 chi nhánh (ví dụ HCM), hệ thống sẽ tự động gán phạm vi mặc định là chi nhánh đó và ẩn tùy chọn "All Stores" để đảm bảo an toàn dữ liệu.
* **Niên độ (Year Scope)**:
  - Quản lý theo từng năm riêng biệt (2026, 2027, 2028...).
  - **All Years (Tất cả các năm = 2026 + 2027 + 2028 + ...)**: Đọc và hiển thị toàn bộ dữ liệu của tất cả các năm (không giới hạn niên độ, bao gồm dữ liệu lịch sử, các năm hiện tại và tương lai).

---

## 🔑 2. HỆ THỐNG PHÂN QUYỀN (ROLES & RBAC MATRIX)
Hệ thống thiết lập phân quyền ma trận độc lập cho từng Tab chức năng theo 2 cấp độ: **Xem (See)** và **Chỉnh sửa (Write)**:

1. **Admin / Super Admin**:
   - Toàn quyền hệ thống (Xem, Thêm, Sửa, Xóa, Cấu hình tài khoản, Phân quyền RBAC, Đồng bộ Google Sheet, Nhập/Xuất Excel).
2. **Manager (Quản lý cấp cao)**:
   - Theo dõi toàn bộ tiến độ, Phê duyệt (Approve/Reject) các hạng mục công việc, Xem báo cáo tài chính, ngân sách tổng hợp.
3. **Staff (Nhân viên nội bộ)**:
   - Cập nhật tiến độ dự án được phân công, Tạo/Chỉnh sửa Task, Thêm bình luận, Tag tên đồng nghiệp và đính kèm hình ảnh hiện trường.
4. **CP / External (Đối tác / Nhà thầu bên ngoài)**:
   - Chỉ xem và cập nhật các đầu việc được bàn giao trong phân hệ Ủy quyền (Task Delegation).

---

## 🧭 3. CẤU TRÚC ĐIỀU HƯỚNG (NAVIGATION MENU)
Thanh Menu điều hướng được thiết kế tối giản, hiện đại và chia thành 5 nhóm nghiệp vụ chính (đồng bộ thống nhất từ trên xuống dưới cho cả Desktop và Mobile/iOS; trên Desktop hỗ trợ tính năng **Hover Dropdown** - khi rê chuột tới tab mẹ, menu các tab con sẽ tự động sổ xuống để chọn nhanh):

* 📊 **NHÓM 1: REPORT (Báo cáo & Mặt bằng)**
  - `Calendar`: Lịch biểu tiến độ tổng quan.
  - `Layout`: Bản đồ số mặt bằng các tầng và ghim vị trí gian hàng.
  - `Summary`: Báo cáo tài chính, ngân sách và KPI tỷ lệ hoàn thành.
* 📋 **NHÓM 2: INDEX (Chỉ mục & Tiến độ công việc)**
  - `General`: Danh mục tổng quan toàn bộ dự án.
  - `Gantt`: Biểu đồ dòng thời gian tiến độ & Baseline.
  - `Task detail`: Cây công việc WBS, chi tiết từng Task và quy trình duyệt.
* 💰 **NHÓM 3: FINANCIAL (Tài chính & Chi phí)**
  - `Budget`: Quản lý định mức ngân sách & Liên kết dự án Cha - Con.
  - `Cost`: Quản lý dòng tiền chi trả 3 đợt và đối soát nhà thầu.
* 🤝 **NHÓM 4: DELEGATION (Ủy quyền & Phân công)**
  - `Del. Calendar` / `Delegation Calendar`: Lịch biểu hạn chót các công việc được ủy quyền.
  - `Delegation`: Bàn giao và phân công công việc cho nhân sự/đối tác.
* ❓ **NHÓM 5: HELP (Trợ giúp)**
  - `Manual`: Xem trực tiếp tài liệu hướng dẫn sử dụng này.
* 💡 **Nút Báo Tab Con Đang Mở (On Tab con)**:
  - **Trên Desktop**: Hàng nút tab con được ẩn đi để tối ưu không gian; ngay phía sau nút tab **Help**, hệ thống hiển thị 1 nút/badge nổi bật được tô màu và in đậm rõ ràng với định dạng: `On [Tên tab con]` (ví dụ: `On Calendar`, `On Budget`, `On Task detail`,...). Nhấp vào nút này có thể kích hoạt/tập trung ngay vào tab con hiện hành.
  - **Trên iOS điện thoại & iPad**: Ô báo tên tab con này được đặt ngay **cùng dòng với nút Undo và canh lề phải**, với màu sắc rực rỡ, icon đồng bộ và chữ in đậm `On [Tên tab con]`, giúp người dùng thiết bị di động/máy tính bảng luôn biết mình đang xem phân hệ nào ngay trên thanh tác vụ trên cùng.
* ⚙️ **CÁC TIỆN ÍCH HỆ THỐNG (Góc trên bên phải Header)**:
  - 📌 **Cài đặt trang mặc định (Set 1st page)**: Cho phép từng người dùng tự chọn bất kỳ Tab nào (General, Calendar, Gantt Chart, Budget, Detail, v.v.) làm trang mở đầu tiên khi đăng nhập hoặc tải lại trang web. Chỉ cần chuyển đến Tab mong muốn, bấm nút **"Set 1st page"** trên thanh Header. Hệ thống sẽ lưu cấu hình vào tài khoản Firestore và bộ nhớ trình duyệt, đảm bảo mỗi lần mở ứng dụng đều vào ngay đúng trang bạn đã chọn mà không bị nhảy sang các tab khác.
  - 🔔 Thông báo (Notification).
  - 🛡️ Phân quyền tài khoản (Account Control / RBAC) *(Dành cho Admin)*.
  - ⚙️ Cài đặt hệ thống (Settings).
  - ⌨️ Phím tắt (Keyboard Shortcuts).
  - 🌓 Chuyển đổi giao diện Sáng / Tối (Light / Dark Mode).
  - 🌐 Chuyển đổi ngôn ngữ (Tiếng Việt / English).

---

## 📖 4. HƯỚNG DẪN THAO TÁC CHI TIẾT TỪNG PHÂN HỆ (STEP-BY-STEP)

---

### 4.1. 📊 PHÂN HỆ TỔNG QUAN DỰ ÁN (GENERAL TAB)
Nơi hiển thị toàn bộ danh sách các dự án thi công, cải tạo của Takashimaya.

#### 🔹 Hướng dẫn Lọc & Tìm kiếm:
1. **Lọc theo Chi nhánh**: Chọn ô chọn Store (`HCM`, `HN`, hoặc `All Stores`).
2. **Lọc theo Năm**: Chọn ô chọn Year (`2026`, `2027`, hoặc `All Years`).
3. **Lọc theo Trạng thái**: Chọn Trạng thái (`On process`, `Upcoming`, `Completed`, `Handover`, `Canceled`).
4. **Tìm kiếm nhanh**: Gõ tên dự án, mã dự án hoặc vị trí gian hàng vào ô Search (hoặc bấm phím tắt `/`).

#### 🔹 Hướng dẫn Tạo Mới / Chỉnh Sửa Dự Án:
* **Tạo mới**: Nhấp nút **"+ New Project"** (hoặc bấm phím tắt `P`):
  - **Bước 1**: Nhập Mã dự án (`Code`), Tên dự án (`Project Name`), Chi nhánh (`Store`), Tầng/Vị trí (`Location`).
  - **Bước 2**: Chọn Chế độ tính ngày (`Auto` - Tự động tính từ các task con, hoặc `Manual` - Nhập ngày cố định).
  - **Bước 3**: Nhập Ngày bắt đầu thi công (`Tak Start`), Ngày hoàn thành (`Tak Compl`), Ngày bàn giao (`Handover`), Ngày khai trương (`Opening`).
  - **Bước 4**: Bấm **"Save Project"** để lưu vào hệ thống.
* **Chỉnh sửa**: Nhấp chuột trực tiếp vào dòng dự án cần sửa trên bảng.
* **Ghim dự án ưu tiên**: Bấm biểu tượng cây ghim 📌 ở đầu dòng để dự án luôn nằm trên cùng. Khi chưa ghim, rê chuột vào đầu dòng sẽ hiển thị nút ghim mờ để ghim nhanh.
* **Sắp xếp thứ tự dự án đã ghim (Nút Di Chuyển Mũi Tên 1 Chạm & Kéo Thả Trực Quan)**:
  - **Trên Desktop**: Nút kéo thả chuột (drag handle) được lược bỏ gọn gàng để tối ưu không gian; thay vào đó, hệ thống đặt trực tiếp cặp nút mũi tên lên `▲` và xuống `▼` ngay vị trí đầu dòng (thay thế tay cầm cũ), liền kề cây ghim 📌. Người dùng chỉ cần nhấp chuột 1 chạm là dự án lập tức di chuyển lên trên hoặc xuống dưới 1 bậc, hoàn toàn không bị che khuất hay đè lên thông tin Năm/Cửa hàng (Year/Store).
  - **Trên Mobile**: Hỗ trợ đầy đủ cả nút mũi tên 1 chạm và tay cầm kéo thả trực quan kèm đường chỉ báo phát quang chèn trước/chèn sau.
* **Đổi màu chữ làm nổi bật**: Chọn biểu tượng bảng màu để đổi màu chữ của dự án giúp dễ nhận biết.

#### 🔹 Hướng dẫn Đồng bộ Google Sheet:
* Dành riêng cho Admin: Nhấp nút **"Sync Google"** (biểu tượng xoay vòng) để tự động xuất toàn bộ dữ liệu dự án lên Google Sheet liên kết.

---

### 4.2. 📝 PHÂN HỆ TIẾN ĐỘ CHI TIẾT (DETAIL TAB)
Nơi chia nhỏ dự án thành các đầu việc (Task) cụ thể để theo dõi tiến độ từng ngày.

#### 🔹 Tính Năng Chỉnh Sửa Hàng Loạt (Bulk Edit)
Khi bật chế độ **Edit Mode**, hệ thống cho phép chọn nhiều Task cùng lúc để cập nhật hàng loạt:
1. Tích vào ô vuông đầu cột **No** trên tiêu đề bảng để chọn toàn bộ Task đang hiển thị.
2. Tích vào ô vuông trên dòng **Dự án** để chọn toàn bộ Task con thuộc dự án đó.
3. Hoặc tích chọn thủ công từng Task cần cập nhật.
4. Một thanh công cụ nổi (Floating Action Bar) sẽ xuất hiện ở cạnh dưới màn hình, cho phép bạn thực hiện nhanh các thao tác sau cho tất cả Task đã chọn:
   - **Bật/Tắt Delegation (Ủy quyền)** hàng loạt.
   - **Bật/Tắt Flexible (Công việc linh hoạt)** hàng loạt.
   - **Set Baseline (Thiết lập kế hoạch gốc)** hàng loạt: tự động sao chép ngày Start/Finish hiện tại vào cột Baseline.
   - **Xoá (Delete)** hàng loạt.

*Mẹo nhỏ (Shift + Click)*: Bạn có thể tích chọn Task đầu tiên, sau đó **giữ phím Shift** và tích chọn Task tiếp theo để chọn nhanh hàng loạt tất cả các Task nằm ở giữa.





#### 🔹 Hướng dẫn Thao tác Dự án Mẹ (Project Row Operations):
1. **Chỉnh sửa thông tin Dự án**: Nhấp biểu tượng Cây bút (✏️ Edit Project) trên dòng dự án mẹ để mở cửa sổ Modal hiệu chỉnh đầy đủ thông tin dự án (Mã, Tên, Chi nhánh, Vị trí, Niên độ, Ngày thi công).
2. **Thêm Task con nhanh**: Nhấp nút **"+"** trực tiếp trên dòng dự án mẹ để tạo thêm công việc mới cho dự án đó.
3. **Chỉ báo Phân bổ Ủy quyền (Project Delegation Toggle)**:
   - Nút gạt Toggle Delegation trên dòng dự án mẹ sẽ tự động hiển thị **Màu xanh lá** nếu chính dự án đó hoặc **bất kỳ task con nào bên trong có bật Toggle ủy quyền**.
   - Bấm vào nút gạt để bật/tắt ủy quyền trực tiếp.
4. **Sắp xếp thứ tự Task con**: Nhấp nút **"Sort"** (Predecessor) để tự động sắp xếp lại các task con theo trình tự ngày bắt đầu.

#### 🔹 Hướng dẫn Kéo Thả Chèn Giữa Các Nhiệm Vụ (Drag & Drop Task Reorder):
1. **Thao tác Kéo Thả (Drag Handle)**:
   - Tại cột **Task Name**, rê chuột vào đầu dòng sẽ hiển thị biểu tượng tay nắm kéo (`GripVertical`) cạnh mũi tên điều hướng.
   - Nhấn giữ chuột và kéo nhiệm vụ dọc lên trên hoặc xuống dưới để sắp xếp lại thứ tự công việc.
2. **Chỉ Báo Đường Kẻ & Huy Hiệu Chèn Trực Quan**:
   - Khi kéo qua nửa trên của dòng nhiệm vụ mục tiêu: hiển thị đường viền xanh đậm cạnh trên kèm huy hiệu `▲ Chèn lên trước: [Tên Task]`.
   - Khi kéo qua nửa dưới của dòng nhiệm vụ mục tiêu: hiển thị đường viền xanh đậm cạnh dưới kèm huy hiệu `▼ Chèn xuống sau: [Tên Task]`.
3. **Kéo Thả Hàng Loạt (Multi-Task Reorder)**:
   - Tích chọn nhiều ô checkbox của các Task cần di chuyển, sau đó kéo một trong các task đó; toàn bộ nhóm task đã chọn sẽ được di chuyển và chèn đồng loạt vào vị trí mới.
4. **Tự Động Đánh Lại Mã Phụ & Đồng Bộ Chuỗi Predecessor**:
   - Sau khi thả chuột, hệ thống tự động cập nhật lại `orderIndex`, đánh lại mã nhiệm vụ phụ (`taskCodePhu` dạng `CP-01-1`, `CP-01-2`...) và tự động đồng bộ tất cả các liên kết tiền nhiệm (`Predecessor`) bị ảnh hưởng để bảo toàn 100% logic tiến độ.

#### 🔹 Hướng dẫn Tạo Mới Task:
1. Nhấp nút **"+ New Task"** (hoặc bấm phím tắt `T`).
2. Chọn Dự án cha thuộc danh mục.
3. Nhập Tên công việc (`Task Name`), Mã công việc phụ (`taskCodePhu` nếu có).
4. Chọn Bên phụ trách (`Party`: Thi công, Thiết kế, Nghiệm thu, Giám sát...).
5. Chọn Ngày bắt đầu (`Start Date`) và Ngày kết thúc (`Finish Date`). Hệ thống sẽ tự động tính số ngày (`Duration`).
6. Bấm **"Save Task"**.

#### 🔹 Hướng dẫn Sắp Xếp Vị Trí Task Con & Tự Động Cập Nhật Mã Phụ & Predecessor:
1. **Thay đổi vị trí Task con**: Bấm nút mũi tên Lên/Xuống (🔺 Chevron Up / 🔻 Chevron Down) ở đầu tên Task (hoặc kéo thả trong biểu đồ Gantt) để hoán đổi vị trí công việc.
2. **Quy tắc sinh mã Task phụ**: 
   - Task phụ ở dòng đầu tiên luôn bắt đầu từ **`**-1`** (ví dụ: `CP-01-1`), dòng thứ hai là `CP-01-2`, dòng thứ ba là `CP-01-3`...
   - Khi hoán đổi vị trí, hệ thống sẽ tự động cập nhật lại mã Task phụ tương ứng theo vị trí dòng mới.
3. **Tự động đồng bộ liên kết Predecessor**:
   - Khi bạn đổi vị trí công việc (hoặc bấm nút Sort), toàn bộ các Task khác đang có liên kết tiền nhiệm (`Predecessor`) trỏ tới mã cũ sẽ **tự động được cập nhật sang mã mới**, giúp sơ đồ Gantt và chuỗi liên kết tiến độ luôn chuẩn xác 100% không bị gãy hoặc lệch.

#### 🔹 Hướng dẫn Nhập (Import) & Xuất (Export) Dữ Liệu Task (Excel / CSV):
1. **Export Dữ Liệu (Xuất file kèm Sheet "method" hướng dẫn)**:
   - Khi bấm nút **"Export Task"** trong menu Hamburger (hoặc trên Detail Tab), hệ thống sẽ xuất ra file Excel workbook (`taka_tasks_filtered.xlsx`) được cấu hình chuyên nghiệp với 2 sheets:
     + **Sheet 1 (`tasks`)**: Danh sách toàn bộ các đầu việc tương ứng với bộ lọc hiện tại, bao gồm đầy đủ các cột: `store`, `location`, `projectYear`, `projectCode`, `Sub-task code` (mã phụ ví dụ: `CP-01-1`, `CP-01-2`), `Task name`, `start`, `finish`, `duration`, `party`, `predecessor`, `delegation` (`true`/`false`), `task flexible` (`true`/`false`), và **`comments`** (lịch sử bình luận & trao đổi).
     + **Sheet 2 (`method`)**: Chứa toàn bộ bảng chỉ dẫn, quy định định dạng các cột dữ liệu, các trường bắt buộc, nguyên tắc ghép nối và hướng dẫn xử lý cột bình luận để người dùng dễ dàng tra cứu ngay trong Excel.
2. **Quy Định Chi Tiết Đối Với Cột "comments" (Lịch sử bình luận & trao đổi)**:
   - **Định dạng hiển thị khi xuất**: Các bình luận của task được nối với nhau bằng dấu gạch đứng `|` theo cú pháp: `username: nội dung | username2: nội dung`.
   - **Thêm bình luận mới (Add-on mode)**: Để bổ sung ghi chú/bình luận mới cho task, bạn chỉ cần nhập nội dung mới vào ô `comments`. Khi Import, hệ thống sẽ tự động **cộng dồn (Append)** nội dung mới này vào Task dưới tên tài khoản của bạn và thời gian hiện tại, **tuyệt đối không xóa hay ghi đè** lịch sử các bình luận cũ.
   - **Giữ nguyên bình luận**: Nếu bạn để nguyên nội dung xuất ra hoặc để trống ô `comments`, hệ thống sẽ tự động bỏ qua và bảo toàn nguyên vẹn các bình luận hiện có mà không tạo bản ghi trùng.
   - **Lệnh xóa bình luận**: Nếu muốn xóa sạch toàn bộ lịch sử trao đổi của một task qua file, hãy nhập chính xác từ khóa **`[DELETE]`** hoặc **`[CLEAR]`** vào ô `comments`. Khi Import, hệ thống sẽ tự động xóa sạch các bình luận của task đó.
3. **Import Dữ Liệu (Hỗ trợ cả Excel .xlsx/.xls và CSV .csv)**:
   - Bấm nút **"Import Task"** và chọn file Excel (`.xlsx`, `.xls`) hoặc file CSV (`.csv`).
   - Nếu nhập file Excel có nhiều sheet, hệ thống sẽ tự động đọc dữ liệu từ sheet `tasks` (hoặc sheet đầu tiên) và bỏ qua sheet hướng dẫn `method`.
   - **Ưu tiên theo Sub-task code**: Nếu file có cột `Sub-task code` (hoặc `sub task code`), hệ thống sẽ **tự động ưu tiên sắp xếp thứ tự và vị trí các Task con theo đúng mã phụ** (ví dụ: Task có mã `CP-01-1` đứng dòng 1, `CP-01-2` đứng dòng 2, `CP-01-3` đứng dòng 3...).
   - **Thứ tự mặc định từ trên xuống dưới**: Nếu file không có cột mã phụ, hệ thống sẽ nhập các dòng Task theo đúng thứ tự từ trên xuống dưới của file và tự động sinh mã bắt đầu từ `**-1`, `**-2`, `**-3`...
   - **Tự động kích hoạt Task Delegation & Task Flexible**:
     + Cột `delegation` (hoặc `task delegation`): Điền `true` $\rightarrow$ Hệ thống tự động bật ON tính năng Ủy quyền công việc (Task Delegation).
     + Cột `task flexible` (hoặc `flexible`): Điền `true` $\rightarrow$ Hệ thống tự động bật ON tính năng Task linh hoạt (Task Flexible / Real-time Update).
   - Tự động nhận diện liên kết `Predecessor` và cảnh báo nếu có liên kết sang dự án bên ngoài.

#### 🔹 Hướng dẫn Thiết Lập & Tự Động Đồng Bộ Tiến Độ Theo Tiền Nhiệm (Predecessor):
1. **Nhập & Chọn Mã Tiền Nhiệm (Predecessor)**:
   - Trong cửa sổ Task Modal hoặc bảng Task Detail, nhập mã công việc tiền nhiệm vào ô **Predecessor** (ví dụ: `L1-113-3-2` hoặc gõ tắt `2`, `-2` đối với các task cùng dự án).
   - Hệ thống cung cấp danh sách gợi ý thông minh hiển thị đầy đủ: Mã công việc, Tên công việc, Ngày bắt đầu/kết thúc và Dự án để dễ dàng lựa chọn.
   - **Hỗ trợ Đa Tiền Nhiệm (Multi-Predecessor)**: Hỗ trợ nhập đồng thời nhiều tiền nhiệm phân cách bởi dấu phẩy `,` (ví dụ: `CP-01-1, CP-01-2FF` hoặc `CP-01-1, CP-01-2SF`).
   - **Áp dụng đuôi FF hoặc SF cho Tiền nhiệm thứ 2**: Tiền nhiệm thứ 2 hỗ trợ cả 2 chuẩn liên kết ràng buộc mốc kết thúc: `FF` (Finish-to-Finish) và `SF` (Start-to-Finish). Khi người dùng chọn tiền nhiệm thứ 2 từ danh sách gợi ý, hệ thống mặc định gắn `FF` và cho phép tùy chỉnh sang `SF` (hoặc kèm Lag như `+2`, `-1`).
   - **Cảnh báo Task ngoài dự án (Cross-Project Warning)**: Cả tiền nhiệm thứ nhất và thứ hai (hoặc bất kỳ tiền nhiệm nào) nếu trỏ tới task thuộc dự án khác đều được hệ thống hiển thị huy hiệu cảnh báo màu hổ phách/vàng rõ ràng kèm tên dự án nguồn để người dùng nhận diện ngay.
2. **Quy Tắc Tính Toán Ngày Bắt Đầu (Start), Kết Thúc (Finish) & Thời Lượng (Duration)**:
   - **Trường hợp 1 Tiền nhiệm (Single Predecessor)**:
     + `FS` (Finish-to-Start): `Start = Finish (Tiền nhiệm) + Lag`, `Finish = Start + Duration`.
     + `SS` (Start-to-Start): `Start = Start (Tiền nhiệm) + Lag`, `Finish = Start + Duration`.
     + `FF` (Finish-to-Finish): `Finish = Finish (Tiền nhiệm) + Lag`, `Start = Finish - Duration`.
     + `SF` (Start-to-Finish): `Finish = Start (Tiền nhiệm) + Lag`, `Start = Finish - Duration`.
   - **Trường hợp 2 Tiền nhiệm (Double Predecessor — ví dụ: Pred 1 FS/SS + Pred 2 FF/SF)**:
     + `Start` được xác định theo mốc ràng buộc của Tiền nhiệm 1 (thường là `FS/SS`).
     + `Finish` được xác định theo mốc ràng buộc của Tiền nhiệm 2:
       * Nếu Pred 2 là `FF`: $\text{Finish} = \text{Finish (Tiền nhiệm 2)} + \text{Lag}$.
       * Nếu Pred 2 là `SF`: $\text{Finish} = \text{Start (Tiền nhiệm 2)} + \text{Lag}$.
     + `Duration` tự động tính chính xác bằng khoảng cách số ngày: $\text{Duration} = \text{Finish} - \text{Start}$.
     + Thời lượng (`durationManual`) được tự động chuyển sang chế độ tự động tính toán (`false`) để đảm bảo ngày bắt đầu và kết thúc của task bám sát 100% hai mốc phụ thuộc.
3. **Cơ Chế Tự Động Linh Hoạt & Đồng Bộ (Cascading Schedule)**:
   - **Khi có điền tiền nhiệm**: Hệ thống mặc định tự động kích hoạt tính năng **Flexible** — khi công việc tiền nhiệm thay đổi ngày, tiến độ các công việc phụ thuộc sẽ tự động tịnh tiến theo dây chuyền (cascading schedule).
   - **Khi không điền tiền nhiệm**: Công việc giữ nguyên mốc ngày độc lập, không bị dời theo các công việc khác.
   - **Nút "Sync dates"**: Trong Task Modal có nút **"Sync dates"** giúp tính toán và làm mới ngày và thời lượng theo tiền nhiệm bất cứ lúc nào. Khi chỉnh sửa trực tiếp ngày Kết thúc (`Finish`), hệ thống sẽ tự động tính lại Thời lượng (`Duration = Finish - Start`) mà không bị ghi đè ngày kết thúc.

#### 🔹 Hướng dẫn Quy trình Phê Duyệt Tiến Độ (Approval Workflow):
1. Mỗi dòng công việc có cột trạng thái phê duyệt: **Pending (Chờ duyệt)**, **Approved (Đã duyệt)**, **Rejected (Từ chối)**.
2. Cấp Quản lý (Manager/Admin) nhấp vào nút trạng thái:
   - Chọn **"Approve"**: Hệ thống ghi nhận trạng thái Đã duyệt, lưu tên người duyệt và thời gian duyệt (`approvedAt`).
   - Chọn **"Reject"**: Hệ thống trả về trạng thái từ chối kèm lý do để nhân viên chỉnh sửa lại.

#### 🔹 Hướng dẫn Thêm Ghi Chú, Bình Luận & Tải File Hiện Trường:
1. Nhấp biểu tượng Ghi chú 💬 trên dòng Task để mở cửa sổ bình luận.
2. **Tag đồng nghiệp**: Gõ ký tự `@` kèm tên tài khoản để gửi thông báo cho đồng nghiệp.
3. **Đính kèm tài liệu/hình ảnh**: Bấm nút "Attach File" hoặc kéo thả ảnh chụp tiến độ vào ô chat.
4. *Lưu ý*: Khi bạn xóa một bình luận có file đính kèm, hệ thống sẽ tự động dọn dẹp file trên bộ nhớ đám mây để tiết kiệm tài nguyên.

---

### 4.3. 📈 PHÂN HỆ BIỂU ĐỒ GANTT (GANTT CHART TAB)
Trực quan hóa kế hoạch và tiến độ thực tế theo thời gian.

#### 🔹 Các Thao tác trên Biểu đồ:
1. **Chuyển đổi góc nhìn Timeline**: Bấm chọn các nút chế độ:
   - `Day`: Xem chi tiết từng ngày.
   - `Week`: Xem theo tuần.
   - `Month`: Xem theo tháng.
   - `Year`: Xem toàn cảnh cả năm.
2. **Mở rộng / Thu gọn Độc lập Từng Dự án & Task Modular**:
   - **Nút tại từng dòng Dự án (Hoạt động Độc Lập)**: Mỗi dòng dự án có cụm 2 nút điều khiển độc lập, không bị dính chùm vào các dự án khác:
     * *Nút xám (trên)*: Mở rộng / thu gọn danh sách Task con của riêng dự án đó.
     * *Nút tím (dưới)*: Mở rộng / thu gọn toàn bộ Task Modular (nhóm task mẹ - con) thuộc riêng dự án đó.
   - **Nút tại tiêu đề cột (Project / Task Header)**: Cung cấp 2 nút mở rộng / thu gọn toàn cục (Global) cho tất cả các dự án và tất cả Task Modular trên toàn bộ biểu đồ Gantt.
3. **Đường mốc chuẩn (Baseline Comparison)**:
   - Thanh màu trên: Tiến độ thực tế đang chạy.
   - Thanh mờ bên dưới: Đường Baseline kế hoạch ban đầu giúp đối chiếu mức độ trễ hạn.
4. **Định vị nhanh công việc**: Bấm vào thanh tiến độ để xem chi tiết task; hệ thống có đường kẻ đỏ thể hiện vị trí ngày hiện tại (`Today Line`).
5. **Kéo Thả Chèn Giữa Các Nhiệm Vụ & Xem Trước Mô Phỏng (Smooth Zero-Jitter Simulation Preview)**:
   - **Kích hoạt linh hoạt**: 
     - **Cách 1 (Kéo thả nhanh)**: Khi người dùng có quyền Chỉnh sửa (`Write`), chỉ cần rê chuột vào bất kỳ dòng nhiệm vụ nào trong Gantt Chart, biểu tượng tay nắm kéo (`GripVertical` ⋮⋮) sẽ tự động hiện lên, cho phép kéo và thả ngay lập tức mà không cần qua nhiều bước.
     - **Cách 2 (Bật Edit Mode)**: Nhấp nút **Edit Mode** (màu xanh nổi bật) ngay trên thanh công cụ chính của Gantt (hoặc nút Edit Mode cố định góc trên). Ở chế độ này, bạn có thể tích chọn hàng loạt checkbox của nhiều nhiệm vụ để di chuyển cả nhóm cùng lúc hoặc đổi màu/xóa.
   - **Thao tác Kéo Thả**: Rê chuột vào biểu tượng tay nắm kéo (`GripVertical`), tên nhiệm vụ hoặc trên thanh timeline, nhấn giữ chuột và kéo dọc lên trên hoặc xuống dưới.
   - **Hiệu Ứng Task Đang Kéo (Source Ghost State)**: Task đang được kéo sẽ tự động chuyển sang trạng thái mờ (opacity 30-40%) kèm viền nét đứt màu xanh dương để dễ nhận biết.
   - **Đường Tia Chỉ Báo Chèn Tuyệt Đối (Zero-Jitter Insertion Beam & Simulation)**:
     - Khắc phục hoàn toàn hiện tượng rung lắc/giật dòng: Các dòng bảng giữ nguyên vị trí cố định 100%, không bị đẩy dịch đột ngột khi di chuột.
     - Khi rê chuột vào nửa trên dòng mục tiêu: Xuất hiện đường kẻ chùm tia xanh đậm phía trên (`▲ Chèn trước: [Tên Task]`) cùng chấm định vị phát sáng và viền sáng nổi bật.
     - Khi rê chuột vào nửa dưới dòng mục tiêu: Xuất hiện đường kẻ chùm tia xanh đậm phía dưới (`▼ Chèn sau: [Tên Task]`).
     - **Thanh Gantt mô phỏng trực tiếp trên Timeline**: Trên vùng biểu đồ Gantt, cả đường tia chèn màu xanh và thanh tiến độ mô phỏng (`[Mô phỏng] Tên Task`) với viền nét đứt màu xanh hiển thị xuyên suốt chiều ngang từ cột tên sang timeline, giúp người dùng thấy rõ khung thời gian tương quan trước khi thả chuột.
   - **Tự Động Đồng Bộ Dữ Liệu & Hỗ Trợ Iframe Sandbox**: Thả chuột để hoàn tất chèn; hệ thống hỗ trợ dự phòng bộ nhớ state tự động cho các trình duyệt sandbox, tự động cập nhật lại thứ tự `orderIndex`, cập nhật mã phụ `taskCodePhu` và chuyển đổi tất cả chuỗi `Predecessor` liên quan.
   - **Hỗ Trợ Kéo Thả Nhiều Task Cùng Lúc**: Tích chọn nhiều checkbox ở đầu các dòng nhiệm vụ trong Edit Mode, sau đó kéo một task bất kỳ để chèn cả nhóm vào vị trí mới (dòng mô phỏng sẽ hiển thị tổng số lượng và tên các task được di chuyển cùng lúc).

---

6. **Cơ Chế Tải Dữ Liệu Lười Theo Nhu Cầu (On-Demand Expansion Loading & Tiết Kiệm Chi Phí Đọc Firestore)**:
   - **Tối ưu hóa lượt đọc Firestore (Zero-Read Collapsed Projects)**: Khi mở tab **Detail Tab** hoặc **Gantt Tab**, danh sách dự án được hiển thị ban đầu ở trạng thái thu gọn (collapsed) dựa hoàn toàn trên tệp tổng hợp `taka_projects`. Người dùng có thể xem ngay lập tức Mã dự án, Tên dự án, Chi nhánh, Vị trí, Tiến độ kế hoạch (`Plan Prg`), Tiến độ thực tế (`Act Prg`), Số lượng công việc con (`Sub-task Count`), Thời gian bắt đầu và kết thúc mà **không tốn bất kỳ lượt đọc Firestore nào cho các công việc con (`taka_tasks`)**.
   - **Tự động đối soát tìm kiếm & bộ lọc khi chưa mở rộng (Instant Search & Filter on Project Summary)**: Khi thực hiện tìm kiếm từ khóa hoặc lọc theo thời gian, hệ thống tự động so khớp từ khóa với các trường dự án và trường tóm tắt công việc (`taskSummaries`). Các dự án thỏa điều kiện sẽ xuất hiện ngay lập tức mà không cần phải mở rộng trước.
   - **Tải ngầm công việc con khi mở rộng (Expand to Download Tasks)**: Khi người dùng nhấp nút mở rộng (▶) trên bất kỳ dự án nào (hoặc bấm "Expand All"), hệ thống mới kích hoạt tải ngầm các công việc con của dự án đó theo thời gian thực (Realtime Listener). Khi thu gọn lại, cơ chế dọn dẹp bộ nhớ đệm (TTL 15 phút) sẽ tối ưu hóa tài nguyên trình duyệt.
   - **Đồng bộ thời gian thực đa người dùng (Realtime Multi-User Sync)**: Mọi thay đổi về tiến độ, số lượng task, ngày bắt đầu và kết thúc khi có người chỉnh sửa sẽ tự động cập nhật ngay lập tức lên document của dự án, đảm bảo mọi tài khoản khác đang xem đều nhận được số liệu mới nhất theo thời gian thực mà không cần tải chi tiết task.
7. **Cố Định Tiêu Đề & Cột Trái Khi Cuộn (Sticky Header & Left Columns)**:
   - **Cố định ngang (Horizontal Sticky)**: Khi cuộn ngang sang phải để xem dòng thời gian (timeline) dài hạn, toàn bộ các cột thông tin bên trái bao gồm: **Cột Dự Án / Nhiệm Vụ (Project / Task)**, **Ngày Bắt Đầu (Start Date)**, **Ngày Hoàn Thành (End Date)**, **Bên Phụ Trách (Party)** và **Thời Gian (Duration)** sẽ luôn được ghim cố định (`sticky left`) ở phía bên trái màn hình. Dòng thời gian cuộn bên dưới một cách mượt mà mà không làm che mất tên và thông tin dự án/nhiệm vụ.
   - **Cố định dọc (Vertical Sticky Header)**: Tiêu đề các cột và thanh niên độ/tháng/ngày luôn được ghim ở mép trên cùng (`sticky top-0`) khi bạn cuộn dọc xuống dưới để theo dõi các dự án tiếp theo.
   - **Nền đục chống xuyên thấu (Solid Background)**: Các ô cố định được thiết kế nền đục 100% (cả chế độ Sáng lẫn Tối), đảm bảo không bị hiện tượng bóng mờ hay chữ của timeline bị đè chồng khi cuộn qua.

---

### 4.4. 💰 PHÂN HỆ NGÂN SÁCH (BUDGET TAB)
Quản lý định mức ngân sách được duyệt và dòng tiền dự án mẹ - con theo cấu trúc phân cấp chuẩn.

#### 🔹 Cấu trúc hiển thị Dự án Mẹ - Con (Parent - Self - Sub Hierarchy):
* Mỗi dự án độc lập ở ngoài bảng sẽ đóng vai trò là một **Dự án Mẹ (Parent)**:
  - Khi mở rộng dòng Mẹ (▶/▼), bên trong sẽ luôn có 1 dòng con **Chính nó (Self)** mang ngân sách và chi phí thực tế riêng của dự án đó.
  - Nếu dự án có liên kết các dự án con khác, các dự án con này sẽ hiển thị là các dòng con **Phụ (Sub)** bên trong dòng Mẹ.
  - **Dòng Mẹ (Parent)** tự động tính toán tổng ngân sách và tổng chi phí:
    $$\text{Total Budget (Mẹ)} = \text{Budget (Self)} + \sum \text{Budget (Sub)}$$
    $$\text{Actual/Forc (Mẹ)} = \text{Actual/Forc (Self)} + \sum \text{Actual/Forc (Sub)}$$
* **Quy tắc liên kết & Tự động Gom Con (Cascade Linking Rule)**:
  - Khi một dự án được liên kết làm con của một dự án khác, dự án đó sẽ **không còn xuất hiện ở cấp ngoài cùng (Root)** như một dự án mẹ độc lập nữa, mà chỉ xuất hiện làm dòng con (`Sub`) bên trong dự án mẹ được chỉ định.
  - **Cơ chế Tự Động Gom Con về Cha Lớn Nhất**: Nếu một dự án đang có $\ge 1$ dự án con trực thuộc, khi dự án đó được liên kết làm con của một dự án khác, **toàn bộ các dự án con trước đó sẽ tự động được chuyển giao sang làm con của Dự Án Cha lớn nhất** nhằm duy trì cấu trúc phẳng 1 cấp con rõ ràng, không bị lồng đa tầng phức tạp.
  - Khi hủy liên kết (`Unlink`), dự án sẽ tự động trở lại thành một dự án mẹ độc lập ở cấp ngoài cùng.

#### 🔹 Thiết kế Phân biệt Trực quan giữa các Cấp độ & Tối ưu Hiển thị (Visual Distinction):
1. **DỰ ÁN MẸ / TỔNG HỢP (Parent / Root)**:
   - Viền dải màu xanh dương đậm chủ đạo (`border-blue-500`), nền gradient sáng/tối sang trọng.
   - Nút mở rộng phân cấp hiển thị số lượng con `▶ (số con)`.
   - **Chỉ Báo Màu Xanh Lá Cây (Green Highlight for > 2 Children)**: Khi dự án mẹ có **nhiều hơn 2 budget con** (> 2), ô/nút số lượng con tự động chuyển sang **Màu xanh lá cây (Emerald Green)** nổi bật, giúp phân biệt ngay các gói dự án mẹ quy mô lớn gom nhiều hạng mục. Với các dự án có $\le 2$ con, nút giữ màu xanh dương tiêu chuẩn.
   - Đã tinh gọn giao diện bằng cách lược bỏ nhãn chữ `MẸ`, tạo không gian thoáng đãng và thanh lịch.
   - Cột/Ô `TOTAL BUDGET`: Chữ số đậm lớn màu xanh dương.
2. **DỰ ÁN BẢN THÂN (SELF - Ngân sách riêng của Mẹ)**:
   - Thụt lề cấp con tinh gọn (`↳`), viền xanh dương dịu (`border-l-4 border-l-blue-500`).
   - Badge nhận diện: `↳ SELF` màu xanh dương với viền bảo vệ.
3. **DỰ ÁN CON (SUB / CHILD PROJECT)**:
   - Thụt lề cấp con tinh gọn (`↳`), viền màu cam / hổ phách (`border-l-4 border-l-amber-500`), nền ấm phân biệt.
   - Badge nhận diện: `↳ SUB` màu hổ phách/cam ấm.
   - Có nút **"Gỡ con (Unlink)"** màu đỏ nổi bật để tách độc lập nhanh chóng.

4. **CỘT PHÂN CẤP ĐẦU DÒNG (No. Column Ở Đầu Bảng)**:
   - **Vị trí đầu bảng**: Cột `No.` được đưa ra đầu bảng (`index 0`), gom toàn bộ các tương tác và nhãn chỉ báo phân tầng ra đầu dòng giúp bảng cực kỳ thông thoáng và trực quan.
   - **Tích hợp trọn vẹn các nút & nhãn nhận diện phân cấp**: Nút bấm mở rộng/thu gọn `[▼ (số con)]` / `[▶ (số con)]` (nổi bật màu xanh lá khi $>2$ con), nhãn `↳ SELF`, nhãn `↳ SUB`, và nhãn tìm kiếm `MATCH` đều được gom gọn gàng trong cột `No.` này (đã loại bỏ số 1, 1.1 để giao diện hoàn toàn sạch sẽ, tối giản).
   - **Giải phóng Cột Mã Dự Án (Code)**: Cột `Code` chỉ còn hiển thị thuần túy mã dự án sạch sẽ, dễ nhìn, không còn bị chèn ép bởi các nút và nhãn phân cấp.
   - **Tùy biến linh hoạt**: Cột `No.` hỗ trợ kéo dãn kích thước (`ResizableHeader`) và có thể bật/tắt hiển thị trong menu quản lý cột (`ColumnAdder`).

> 💡 **Tối ưu Hiển thị Văn bản & Bố cục Cột (Text Wrapping & Compact Columns)**:
> - **Wrap Text Tự Động cho Cột Budget Name (Project Name)**: Tự động xuống dòng tự nhiên (`whitespace-normal break-words`) cho các tên dự án dài (ví dụ các dự án kết hợp nhiều tên gian hàng), không còn bị cắt bớt bằng dấu `...`.
> - **Wrap Text cho Cột Note & Type**: Hỗ trợ xuống dòng cho các nội dung ghi chú và loại hình dài (ví dụ: `Budget: [B103-1 & B103-...]`), giúp người dùng xem đầy đủ thông tin mà không cần rê chuột.
> - **Cột Code Chống Nhảy Dòng (`whitespace-nowrap`)**: Đảm bảo các chuỗi mã dự án luôn nằm trên một dòng duy nhất, kết hợp thụt lề phân cấp rõ ràng.

#### 🔹 Hướng dẫn Lọc & Tìm kiếm Thông minh (Hierarchical Search & Match Highlight):
* **Ô tìm kiếm mở rộng (Wide Responsive Search Bar)**:
  - Thanh tìm kiếm được thiết kế co giãn linh hoạt, mở rộng tối đa trên màn hình Desktop/Laptop để người dùng nhập từ khóa tìm kiếm nhanh chóng và rõ ràng.
  - Tích hợp nút xóa nhanh (✖ Clear) bên phải ô tìm kiếm để reset từ khóa chỉ bằng 1 cú nhấp chuột.
* **Cơ chế hiển thị toàn bộ cây Dự án khi tìm kiếm (Parent & Full Children Context)**:
  - Khi tìm kiếm một từ khóa bất kỳ (mã dự án, tên, vị trí, ngân sách...): nếu một **Budget Con (`Self` hoặc `Sub`)** khớp với từ khóa trong một Dự án Mẹ có từ 2 budget con trở lên ($\ge 2$ con), hệ thống sẽ **hiển thị Dự án Mẹ và TOÀN BỘ ĐẦY ĐỦ các budget con** của dự án mẹ đó (không bị ẩn bớt các con còn lại) nhằm giữ nguyên bức tranh phân cấp tổng thể.
  - **Viền Highlight Nổi bật Riêng biệt (Border Highlight)**: Riêng chính xác Budget con nào khớp với từ khóa tìm kiếm sẽ được làm nổi bật trực quan bằng **khung viền nổi bật (Ring/Border)** kèm nhãn **`MATCH`** màu xanh dương, giúp người dùng dễ dàng định vị ngay lập tức mục tiêu tìm kiếm trong cây dự án.

* **Tự động chuyển đổi bộ lọc khi tìm kiếm (Smart Auto-Filter & Restoration)**:
  - **Tự động mở rộng phạm vi (Auto All Filter)**: Khi người dùng gõ từ khóa vào ô tìm kiếm ở bất kỳ tab nào:
    - Tại **Tab Budget**: Bộ lọc tiền tự động chuyển sang **All Projects** để không bỏ sót bất kỳ dự án nào khớp từ khóa.
    - Tại **Tab Cost**: Bộ lọc chi phí tự động chuyển sang **All Act/Forc** để tìm kiếm toàn bộ các dòng chi phí phát sinh.
    - Tại **Tab General, Detail, Gantt**: Bộ lọc trạng thái tự động chuyển sang **All Status** để tìm kiếm trên tất cả các trạng thái công việc/dự án.
  - **Khôi phục trạng thái mặc định ban đầu (Auto Restore)**: Khi xóa từ khóa (bằng nút ✖ Clear hoặc nhấn phím `Esc`), hệ thống sẽ **tự động phục hồi lại chính xác bộ lọc mà người dùng đã thiết lập trước đó** (được ghi nhớ an toàn theo phiên làm việc).

#### 🔹 Hướng dẫn Liên kết / Hủy Liên kết Dự án (Project Modular - Link / Unlink Flow):
1. **Mở modal liên kết (Quy trình chọn Dự án Cha trước & Tự động điền tìm kiếm)**:
   - Nhấp nút **"Project Modular"** (biểu tượng lớp xếp chồng ☶ `Layers`) trên thanh công cụ hoặc nhấp biểu tượng **Modular** trên dòng/thẻ của dự án bạn muốn **chọn làm Dự án Cha (Parent Project)**.
   - **Tự Động Điền Mã Dự Án (Auto-fill Search)**: Cửa sổ **Project Modular (Link Budget)** sẽ mở ra, đồng thời ô tìm kiếm của bảng **Dự Án Chính (Choose Main Project)** sẽ **tự động điền chính xác Mã của dự án được nhấn nút Link đó**, giúp bạn tìm thấy ngay lập tức dự án tương ứng mà không cần phải gõ lại.
   - Bảng hiển thị đầy đủ thông số tài chính **Budget**, **Cost**, **Supporting Fee**, **Remaining** và số lượng dự án con hiện có.
   - **Bố cục Thích ứng (Responsive Layout)**:
     - **Trên Máy tính (Desktop)**: **Bảng Cha** nằm ở **bên Trái**, **Bảng Con** nằm ở **bên Phải**.
     - **Trên Điện thoại (iOS / Mobile)**: **Bảng Cha** nằm ở **phía Trên**, **Bảng Con** nằm ở **phía Dưới**.
2. **Thao tác tại BẢNG CHA (Parent Project - Bảng 1)**:
   - Khối tóm tắt trên cùng hiển thị dự án đang được chọn làm Cha cùng số lượng con đang liên kết.
   - Danh sách cuộn toàn bộ dự án giúp bạn có thể nhấp chọn đổi sang bất kỳ Dự án Cha nào khác bất cứ lúc nào.
   - Ô tìm kiếm thông minh theo mã, tên dự án, khu vực...
3. **Thao tác tại BẢNG CON (Child Project - Bảng 2)**:
   - Danh sách cuộn toàn bộ các dự án ứng viên có thể liên kết làm Con của Dự án Cha đang chọn.
   - **Liên kết thêm dự án con**: Nhấp nút **"Chọn làm Con"** trên thẻ dự án tương ứng để liên kết ngay lập tức vào Dự án Cha đang chọn.
   - **Gỡ dự án con ra độc lập**: Nhấp nút **"Gỡ con" (Unlink)** trên các dự án đang là con để tách dự án đó trở lại thành dự án mẹ độc lập ở cấp ngoài cùng.
   - Các dự án đang là con của dự án cha khác sẽ hiển thị nhãn cảnh báo rõ ràng `Đang là con của: [Mã cha]`.
4. **Hủy liên kết trực tiếp trên bảng**: Mở rộng dòng dự án mẹ trên bảng Budget -> Trên dòng con `Sub`, nhấp nút **"Unlink"** để tách dự án ra thành độc lập.

#### 🔹 Đối soát các cột số liệu trong bảng & Quản lý hiển thị cột (Tắt / Mở Cột):
* **Quản lý Cột Linh hoạt (Ẩn / Hiện Cột)**:
  - **Tắt cột nhanh (Nút ✕)**: Di chuột (hover) vào tiêu đề bất kỳ cột nào trên bảng Budget sẽ xuất hiện nút **✕** màu đỏ nhỏ ở góc phải tiêu đề cột; nhấp vào nút này để ẩn ngay cột đó.
  - **Thêm lại cột đã ẩn (Add Column)**: Nhấp vào nút **"+ Add Column"** trên thanh công cụ điều khiển phía trên bên phải để chọn và mở lại bất kỳ cột nào đã ẩn.
  - **Lưu cấu hình cá nhân**: Thứ tự, độ rộng và trạng thái ẩn/hiện của các cột được tự động lưu vào trình duyệt của từng tài khoản người dùng.
* **Các cột số liệu tài chính**:
  * **Budget**: Ngân sách của dự án (trên dòng Mẹ thể hiện `Total Budget`, trên dòng con thể hiện ngân sách riêng).
  * **Actual/Forc (ACT / FORC)**: Chi phí thực tế đã giải ngân (lấy tự động từ phân hệ Cost theo mã dự án, năm và chi nhánh). Hệ thống hiển thị badge phân biệt trực quan chuẩn màu từ tab Cost:
    - `ACT` (Màu xanh dương): Chi phí thực tế đã ký kết/phát sinh chính thức.
    - `FORC` (Màu hổ phách / cam): Chi phí ước tính / dự báo (Forecast).
    - Số tiền được thể hiện bằng phông số xanh ngọc (`emerald`) nổi bật và dễ đọc.
  * **Supporting Fee**: Chi phí hỗ trợ / phát sinh liên quan (được tổng hợp tự động theo thời gian thực từ tab Cost qua global store theo mã dự án, năm và chi nhánh, nằm ở giữa cột Actual và Remaining).
  * **Remaining**: Số tiền ngân sách còn lại:
    $$\text{Remaining} = \text{Budget} - \text{Actual/Forc} + \text{Supporting Fee}$$
    - Ngưỡng màu trực quan: **Xanh lá** (Còn dồi dào > 20%), **Vàng** (Sắp hết 0 - 20%), **Đỏ** (Thâm hụt / Vượt ngân sách < 0).
* *Lưu ý*: Mọi số tiền đều được làm tròn số nguyên chuẩn xác theo thuật toán `Math.round()`, được bảo vệ 100% bằng bộ **Automated Unit Tests (`financialService.test.ts`)** để ngăn chặn mọi sai số cộng dồn. Hỗ trợ hiển thị tối ưu trên cả giao diện Máy tính (Bảng dữ liệu) và Điện thoại di động/iOS (Thẻ Card View thông minh với **Tên công việc/dự án được đặt ngay cạnh Mã công việc và tô màu nổi bật** để nhận biết nhanh chóng).

#### 🔹 Tự Động Đồng Bộ Dữ Liệu Từ Tab Cost Sang Tab Budget (Cost Integration & Instant Hydration):
* **Tự Động Kích Hoạt Tải Cost (Auto-fetch Cost on Budget Tab)**: Ngay khi bạn mở tab Budget (hoặc chuyển sang tab Budget), hệ thống sẽ lập tức kích hoạt bộ lắng nghe dữ liệu từ bộ phận Chi phí (`taka_costs`), đảm bảo các số liệu **ACT / FORC** và **Supporting Fee** luôn được cập nhật theo thời gian thực từ tab Cost sang mà không cần người dùng phải bấm vào tab Cost trước.
* **Cơ Chế Khớp Dữ Liệu Đa Tầng Thông Minh (Robust Project-Cost Matching)**: Hệ thống sử dụng thuật toán đối soát mềm dẻo giữa Cost và Project theo Mã dự án (`projectCode`), Năm (`projectYear`) và Chi nhánh (`projectStore`), hỗ trợ tự động chuẩn hóa chữ hoa/chữ thường (`HN`/`hn`, `HCM`/`hcm`) và trường dữ liệu dự phòng, đảm bảo mọi khoản chi phí thực tế đều phản ánh chính xác 100% vào dòng dự án tương ứng trên bảng Budget.
* **Tốc Độ 0ms Với Bộ Đệm IndexedDB (Instant Cache)**: Dữ liệu chi phí đã lưu được nạp ngay từ bộ nhớ đệm trình duyệt trong 0ms đầu tiên, sau đó tự động đồng bộ thời gian thực với máy chủ đám mây.
* **Liên kết click nhanh từ Budget sang Detail Task (Click-to-Task Detail)**: Nhấp trực tiếp vào **Mã dự án (Project Code)** hoặc **Tên dự án (Project Name)** trên bảng Budget để chuyển ngay lập tức sang phân hệ **Detail Task** ứng với dự án đó. Hệ thống sẽ tự động đồng bộ hóa các bộ lọc Store và Year tương ứng để hiển thị chính xác cây công việc WBS.
* **Liên kết chuyển nhanh sang Cost (Link Cost to Cost Tab)**: Nhấp vào nút/biểu tượng chuyển sang Cost trên từng dòng dự án tại tab Budget để điều hướng trực tiếp sang tab **Cost**. Hệ thống sẽ tự động điền Mã dự án vào ô lọc tìm kiếm của tab Cost, đồng thời **tự động chuyển bộ lọc Act/Forc sang "All Act/Forc" (`All`)**, giúp bạn xem được đầy đủ tất cả các dòng chi phí (bao gồm cả các dự án có ngân sách nhưng chưa phát sinh chi phí thực tế) mà không bị che khuất bởi bộ lọc `!= 0`. Khi bạn **xóa mã lọc trong ô Filter Code (hết link cost)** hoặc **thoát/chuyển sang tab khác**, hệ thống sẽ tự động khôi phục bộ lọc về trạng thái mặc định **`Has Act/Forc`** (`!= 0`).

---

### 4.5. 💳 PHÂN HỆ CHI PHÍ THỰC TẾ (COST TAB)
Theo dõi dòng tiền giải ngân cho từng Nhà thầu và Nhà cung cấp.

#### 🔹 Hướng dẫn Nhập Chi Phí Thanh Toán:
1. Nhấp nút **"+ Add Cost Item"**.
2. Chọn Dự án và Tên Nhà thầu (`Vendor Name`).
3. Nhập số tiền và ngày thanh toán theo từng giai đoạn:
   - **Đợt 1 (`1st Paid`)**: Tạm ứng hợp đồng.
   - **Đợt 2 (`2nd Paid`)**: Thanh toán theo giai đoạn thi công.
   - **Đợt 3 (`3rd Paid`)**: Quyết toán hoàn thành.
   - **Phí hỗ trợ (`Supporting Fee`)**: Các khoản phụ phí nếu có.
4. **Chuyển đổi nhanh Actual / Forecast**:
   - Bấm nút **"act"**: Đánh dấu đây là khoản tiền Thực tế đã chi trả.
   - Bấm nút **"forc"**: Đánh dấu đây là khoản tiền Dự báo kế hoạch sẽ chi.
5. Bấm **"Save Cost"**.

#### 🔹 Bộ Lọc Theo Khoảng Ngày Thanh Toán (Paid Date Range & Stage Filter):
Hỗ trợ lọc chính xác các khoản thanh toán phát sinh hoặc được cập nhật trong một khoảng thời gian cụ thể:
1. **Nút Bấm Sổ Xuống Gọn Gàng (Collapsible Filter Button)**:
   - Toàn bộ bảng lọc ngày được giấu gọn bên trong nút **"Filter Paid Date"** (có biểu tượng lịch 📅 và số lượng khoản mục khớp). Bảng chỉ sổ ra khi bạn nhấp vào nút này.
   - **Giao diện Desktop**: Nút nằm ngay sát khối **"Total Remaining (Linked from Budget)"** trên thanh Total Summary giúp người dùng dễ dàng đối chiếu ngân sách và thời hạn thanh toán; khi nhấp vào, một khung popover nổi sẽ mở ra bên dưới nút và tự động đóng khi nhấp chuột ra ngoài hoặc ấn nút **"Done"**.
   - **Giao diện Điện thoại / iOS**: Nút **"Filter Paid Date"** được bố trí đặt ngay bên dưới nhãn **"Linked from Budget"** ở góc phải trên cùng của thẻ **Total Summary**. Khi chạm vào nút, khung lọc sẽ trượt mở ngay bên trong thẻ tóm tắt.
2. **Cơ Chế Nhập Ngày Chống Lag (Debounced & Enter Commit)**:
   - Các ô **Start (Từ ngày)** và **End (Đến ngày)** hỗ trợ nhập liệu tức thì: bạn có thể **nhấn phím Enter** hoặc di chuyển trỏ chuột ra ngoài (`blur`) để áp dụng ngay, hoặc hệ thống sẽ tự động chờ thời gian trễ an toàn **0.5 giây** sau khi ngừng nhập mới tiến hành đối soát dữ liệu, giúp triệt tiêu hoàn toàn hiện tượng giật lag khi gõ hoặc chọn lịch.
3. **Chọn đợt thanh toán (Paid Stage Selector)**:
   - **All Paid Stages (1st, 2nd, 3rd)**: Tìm tất cả các dòng chi phí có ít nhất một đợt (1st, 2nd hoặc 3rd) được cập nhật ngày thanh toán nằm trong khoảng ngày đã chọn.
   - **1st Paid only**: Chỉ lọc các khoản thanh toán Đợt 1 có ngày thanh toán nằm trong khoảng chọn.
   - **2nd Paid only**: Chỉ lọc các khoản thanh toán Đợt 2 có ngày thanh toán nằm trong khoảng chọn.
   - **3rd Paid only**: Chỉ lọc các khoản thanh toán Đợt 3 có ngày thanh toán nằm trong khoảng chọn.
4. **Hiển thị & Làm nổi bật trực quan (Visual Highlight)**:
   - Hệ thống tự động mở rộng nhóm dự án (`auto-expand`) chứa các hạng mục chi phí khớp với điều kiện lọc.
   - Các ô thanh toán (1st, 2nd hoặc 3rd) có ngày cập nhật nằm trong khoảng chọn sẽ được viền khung xanh lá (`emerald`) nổi bật kèm chỉ số badge số lượng khoản thanh toán trùng khớp.
   - Thanh tổng hợp (Total Summary) sẽ tự động tính lại tổng số tiền `Total Act/Forc`, `1st Paid`, `2nd Paid`, `3rd Paid` và `Balance` dựa trên các hạng mục đã lọc.
5. **Nút Xóa Nhanh (Clear Filter)**: Nhấp nút **"Clear"** (hoặc biểu tượng ✕) để hủy bộ lọc ngày và đưa bảng về trạng thái bình thường.

#### 🔹 Tính năng Liên kết chuyển hướng nhanh (Cross-navigation Links):
* **Chuyển sang Detail Task**: Nhấp trực tiếp vào **Mã dự án (Project Code)** hoặc **Tên dự án (Project Name)** trên bảng Cost để chuyển ngay lập tức sang phân hệ **Detail Task** ứng với dự án đó. Các bộ lọc năm và chi nhánh sẽ tự động thay đổi để đồng bộ chính xác.
* **Chuyển nhanh sang Budget**: Nhấp nút biểu tượng liên kết 🔗 bên cạnh mã dự án để xem ngay tình trạng ngân sách của dự án đó trên phân hệ **Budget**.

---

### 4.6. 📑 PHÂN HỆ BÁO CÁO TỔNG HỢP (SUMMARY TAB)
Dành cho Ban Giám đốc và Trưởng phòng theo dõi bức tranh toàn cảnh dự án và dòng tiền doanh nghiệp. Phân hệ được chia thành 2 Tab con chuyên biệt:

#### 🔹 4.6.1. Tab Con "Project Summary":
1. **Bộ lọc thời gian & vị trí**: Lọc theo Năm (Year), Chi nhánh (Store: HCM, HN, All Stores), Khu vực (Location), Tháng bắt đầu (Start Month) và Tháng kết thúc (End Month).
2. **Biểu đồ tỷ trọng dự án**: Phân bổ trạng thái dự án trong năm và trong kỳ chọn lọc (`On process`, `Upcoming`, `Completed`, `Handover`, `Canceled`).
3. **Thống kê tổng hợp & So sánh chi phí**: Thẻ KPI Tổng số dự án, Dự án trong kỳ, Ngân sách kỳ, Chi phí thực tế kỳ, cùng Biểu đồ so sánh Ngân sách vs Thực chi (Budget vs Actual Comparison) top 15 dự án lớn nhất.

#### 🔹 4.6.2. Tab Con "Executive Financial Dashboard" (Exec Fin Dashboard):
Dành riêng cho cấp Lãnh đạo cấp cao cần bức tranh điều hành tài chính và tiến độ vĩ mô:
1. **Earned Value Management (EVM)**:
   - **CPI (Cost Performance Index)**: Đo lường hiệu quả chi phí (`CPI = EV / AC`). CPI > 1 (Tiết kiệm ngân sách), CPI = 1 (Đúng kế hoạch), CPI < 1 (Nguy cơ bội chi).
   - **SPI (Schedule Performance Index)**: Đo lường hiệu quả tiến độ (`SPI = EV / PV`). SPI > 1 (Vượt tiến độ), SPI = 1 (Đúng tiến độ), SPI < 1 (Chậm tiến độ).
   - **EAC (Estimate At Completion)** & **VAC (Variance At Completion)**: Dự báo tổng mức chi phí khi hoàn thành toàn bộ danh mục và số tiền dự kiến tiết kiệm/vượt ngân sách.
2. **Cashflow Forecast (Dự báo & Thực tế Dòng tiền Giải ngân)**:
   - Biểu đồ Composed Chart trực quan phân tích dòng tiền Thực chi (Actual Paid) và Dự kiến giải ngân (Forecast Paid) theo từng chi nhánh (HCM, HN) qua 12 tháng hoặc 4 Quý (Q1-Q4).
   - Dữ liệu dòng tiền kết hợp từ phân kỳ thanh toán 3 đợt (`1st Paid`, `2nd Paid`, `3rd Paid`) của từng hạng mục chi phí.
3. **Bảng Xếp Hạng & Đánh Giá EVM Từng Dự Án**:
   - So sánh BAC (Budget), AC (Actual Cost), EV (Earned Value), CPI, SPI, Tiến độ % hoàn thành kèm Đánh giá điều hành trực quan (Xuất sắc, Cần đẩy tiến độ, Bội chi phí, Nguy cơ cao).

---

### 4.7. 🤝 PHÂN HỆ ỦY QUYỀN CÔNG VIỆC (TASK DELEGATION & CALENDAR)
Quản lý các công việc giao cho cá nhân, phòng ban hoặc đối tác bên ngoài.

#### 🔹 Hướng dẫn Giao việc (Delegation):
1. Vào Tab **Task Delegation** ➔ Nhấp **"+ New Delegation"**.
2. Chọn Dự án, Nhập Tên đầu việc cần bàn giao.
3. Chọn Người nhận việc (`Assignee`) hoặc Phòng ban/Đối tác.
4. Đặt Hạn hoàn thành (`Deadline`).
5. **Theo dõi trạng thái**: Khi người nhận việc cập nhật trạng thái (*Assigned ➔ Accepted ➔ On process ➔ Completed*), tiến độ sẽ tự động cập nhật về Dự án gốc.
6. **Xem trên Delegation Calendar**: Bấm sang tab con `Delegation Calendar` để theo dõi toàn bộ deadline dưới dạng lưới lịch tháng.
7. **Cơ chế Tự động Đồng bộ Năm Dữ liệu (Auto-Fallback Project Year)**: Toàn bộ quá trình tạo mới ủy quyền hoặc chỉnh sửa nhiệm vụ luôn tự động kế thừa và chuẩn hóa `projectYear` dạng số (`Number`) từ dự án mẹ hoặc năm hiện tại, đảm bảo bộ lọc dữ liệu Firestore hoạt động chính xác 100% và ngăn ngừa triệt để lỗi quét dữ liệu dư thừa.

---

### 4.8. 🗺️ PHÂN HỆ MẶT BẰNG 2D (STORE FLOOR LAYOUT TAB)
Bản đồ số định vị vị trí các dự án trực tiếp trên sơ đồ mặt bằng TTTM Takashimaya.

#### 🔹 Hướng dẫn Sử dụng Bản đồ:
1. **Bộ lọc Cửa hàng & Khu vực (Store & Location Filter)**:
   - Chọn Cửa hàng (`HCM`, `HN` hoặc `All Stores`).
   - **Bộ lọc Khu vực (Location)**: Tự động chỉ hiển thị các khu vực/tầng có đường dẫn URL mặt bằng hợp lệ được gắn vào (loại bỏ các giá trị trống, null, `0`, hoặc `_`).
2. **Kéo & Thu phóng (Zoom/Pan)**: Sử dụng con lăn chuột hoặc nút (+ / -) để phóng to/thu nhỏ sơ đồ; kéo chuột để di chuyển góc nhìn.
3. **Ghim vị trí dự án (Add Pin)**: Nhấp nút "Add Pin", sau đó nhấp vào vị trí gian hàng trên bản đồ và liên kết với Dự án tương ứng.
4. **Xem nhanh thông tin**: Nhấp vào bất kỳ điểm ghim nào trên bản đồ để xem ngay tên gian hàng, thời gian thi công và hình ảnh hiện trường.

---

### 4.9. 🖨️ XUẤT DỮ LIỆU & IN ẤN BÁO CÁO (EXPORT & PRINT)
1. **Xuất Excel / CSV**: Nhấp nút **"Export CSV/Excel"** ở góc bảng để tải toàn bộ bảng tính về máy tính.
2. **In ấn & Xuất hình ảnh độ nét cao**:
   - Nhấp nút **"Print Preview"** (biểu tượng máy in).
   - Chọn khổ giấy: `A3` hoặc `A4` (Hướng ngang Landscape hoặc Hướng dọc Portrait).
   - Tùy chọn đóng dấu mờ bản quyền: Tích chọn **"Watermark"** để hiển thị dấu bảo mật nội bộ Takashimaya.
   - Bấm **"Print / Save PDF"**.

---

## ⌨️ 5. DANH MỤC PHÍM TẮT THAO TÁC NHANH (KEYBOARD SHORTCUTS)
Để làm việc với tốc độ cao nhất, bạn có thể sử dụng các phím tắt sau:

| Phím tắt | Chức năng thực hiện |
| :--- | :--- |
| `/` | Đưa con trỏ nhanh vào ô Tìm kiếm (Focus Search) |
| `P` | Mở nhanh cửa sổ Tạo Dự Án Mới (New Project) |
| `T` | Mở nhanh cửa sổ Tạo Công Việc Mới (New Task) |
| `1` đến `9` | Chuyển đổi nhanh qua lại giữa các Tab chức năng |
| `Shift + F` | Bật / Tắt chế độ tập trung toàn màn hình (Focus Mode) |
| `Ctrl + Z` | Hoàn tác thao tác vừa thực hiện (Undo) |
| `Backspace` | Quay lại trang/tab trước đó trong lịch sử (Back to previous page) |
| `Esc` | Đóng nhanh Modal đang mở / Thoát chế độ Focus (Clear Focus) |

---

## ❓ 6. CÂU HỎI THƯỜNG GẶP (FAQ DÀNH CHO TRỢ LÝ ẢO & NGƯỜI MỚI)

**Q1: Làm sao để xem toàn bộ dự án của cả HCM và HN từ trước đến nay?**
* **Trả lời**: Tại thanh lọc ở Tab General/Budget/Summary, bạn chọn ô **Store** là `All Stores` và ô **Year** là `All Years`.

**Q2: Tại sao số tiền trên bảng Ngân sách của Dự án Cha lại lớn hơn số tiền tôi nhập?**
* **Trả lời**: Vì Dự án Cha đang được liên kết với các Dự án Con (`parentId`). Hệ thống sẽ tự động cộng dồn ngân sách của tất cả các dự án con vào dòng dự án cha.

**Q3: Tôi có thể đính kèm ảnh chụp hiện trường vào đâu?**
* **Trả lời**: Vào Tab **Detail**, bấm vào biểu tượng Ghi chú (💬) ở dòng Task tương ứng, sau đó kéo thả file hoặc bấm "Attach File" để tải ảnh lên.

**Q4: Làm thế nào để duyệt một công việc đã hoàn thành?**
* **Trả lời**: Người dùng có quyền Manager/Admin vào Tab **Detail**, tìm đến cột Trạng thái duyệt của Task và nhấp chọn **Approved**. Hệ thống sẽ tự động ghi nhận thời gian và người duyệt.

---
*Tài liệu này là nguồn kiến thức chuẩn mực (Single Source of Truth) của Hệ thống Quản lý Dự án Takashimaya.*

### 4.10. CÁC TÍNH NĂNG TỐI ƯU MỚI (Cập nhật tự động)
1. **Quy đổi tiền tệ đa quốc gia (Multi-Currency Support - VND / JPY / USD) & Khóa an toàn nhập liệu**: Nút chọn đơn vị tiền tệ trên thanh Header (VND / JPY / USD) đã được kết nối đồng bộ trực tiếp với toàn bộ các bảng tính **Budget** và **Cost** (cả dự án cha và các hạng mục con). Khi chuyển đổi sang Yên Nhật (JPY) hoặc Đô la Mỹ (USD), toàn bộ giá trị ngân sách dự án, chi phí thực tế (Actual / Forecast), các đợt giải ngân (1st, 2nd, 3rd Paid), số dư còn lại (Balance / Remaining) và các dòng tổng cộng đều tự động quy đổi theo tỷ giá thời gian thực (`jpyRate`, `usdRate`) một cách chính xác. **Cơ chế khóa an toàn**: Khi đang ở chế độ xem JPY hoặc USD, hệ thống tự động khóa tính năng nhập/sửa số tiền trên các ô ngân sách và chi phí để chống sai lệch dữ liệu do nhập nhầm số tiền quy đổi; người dùng chỉ cần chuyển lại đơn vị **VND** trên Header khi cần nhập hoặc cập nhật số liệu. Dữ liệu gốc lưu trữ trên Firestore luôn được bảo toàn tuyệt đối theo đơn vị VND gốc.
2. **Phân trang (Pagination) trên General & Detail Tab**: Để tối ưu hiệu năng, danh sách dự án ban đầu sẽ hiển thị 20 mục. Cuộn xuống cuối và nhấn **"Load More Projects"** để tiếp tục xem thêm dữ liệu.
3. **Cơ chế tìm kiếm tự động thông minh (Smart Debounced Search - 300ms)**: Trong toàn bộ các ô tìm kiếm trên toàn hệ thống (General, Detail, Gantt, Cost, Budget, Task Delegation, Account Control, v.v.), bộ lọc sẽ tự động kích hoạt mượt mà sau khi người dùng ngừng gõ khoảng 300ms (debounce pause), hoặc có thể bấm **Enter** / click ra ngoài để tìm kiếm ngay tức thì. Cơ chế này loại bỏ hoàn toàn hiện tượng giật lag do kích hoạt re-render quá mức liên tục, đi kèm nút `X` tiện lợi để xóa nhanh từ khóa.
4. **Lọc nhanh Act/Forc & Tối ưu giao diện thẻ Mobile (Cost Tab)**: Nhấp trực tiếp vào tiêu đề cột "Act/Forecast" (trên máy tính) hoặc dòng tổng "Act/Forecast" (trên điện thoại) ở phần Total để bật/tắt nhanh chế độ hiển thị chỉ các dự án có phát sinh chi phí (`has_value` vs `all`). Trên giao diện điện thoại, các thẻ chi phí con được tối ưu dạng thẻ tích hợp tràn viền gọn gàng, loại bỏ các nhãn thừa, đảm bảo 100% số tiền, ngày thanh toán, số dư và phí hỗ trợ hiển thị vừa vặn, không bị tràn hay cắt chữ.
5. **Dọn dẹp rác hệ thống**: Khi bạn tiến hành xóa một bình luận (Comment) có chứa hình ảnh/file đính kèm, hệ thống sẽ tự động dọn dẹp và xóa sạch các file rác trên máy chủ (Firebase Storage) để tối ưu không gian lưu trữ.
6. **Giao diện thẻ ngân sách di động (Budget Tab Mobile / iOS)**: Trên các thiết bị di động (iPhone, iPad, iOS Safari, Android), Tab **Budget** được trang bị giao diện thẻ cây phân cấp (Hierarchical Tree Cards) thông minh. Hỗ trợ hiển thị đầy đủ tổng ngân sách (Total Budget), chi phí thực tế (Actual/Forc), số dư còn lại (Remaining/Balance), nút mở rộng/thu gọn dự án con (Parent-Child Rollup), liên kết dự án cha-con, điều hướng nhanh sang Cost Tab, và nút "Load More Projects" giúp tối ưu hóa hiệu năng 60 FPS mượt mà. Đặc biệt, nút mở rộng dự án mẹ `MAIN (n)` (trên Mobile) và nút số lượng ở cột No. (trên Desktop) sẽ **tự động chuyển sang màu xanh lá cây (Emerald Green)** khi dự án có từ 2 budget trở lên (gồm 1 dòng Bản thân Self và từ 1 dòng Sub con trở lên).
7. **Bộ lọc Toàn cục Hybrid (Hybrid Global Filters)**: Hệ thống áp dụng cấu trúc lọc thông minh (Hybrid Model) mới nhất. Ba bộ lọc chính gồm **Năm (Year)**, **Chi nhánh (Store)**, và **Vị trí (Location)** được cố định ở thanh trạng thái toàn cục trên AppStore và đồng bộ xuyên suốt qua tất cả các tab (General, Budget, Cost, Detail, Summary, Layout, Gantt...). Khi bạn chuyển qua lại giữa các tab, các bộ lọc này sẽ tự động được ghi nhớ. Các bộ lọc cục bộ khác (Tìm kiếm, Trạng thái, Has Budget, Has Act/Forc...) vẫn giữ tính linh hoạt độc lập trong từng tab cụ thể, đảm bảo trải nghiệm thống nhất và mượt mà.
8. **Đặc quyền Master "all" trong Phân quyền Tài khoản (Location & Party Permissions)**: Trong phân hệ Phân quyền người dùng (Account Control), khi tài khoản được gắn nhãn `"all"` ở cột **Location** hoặc **Party**, hệ thống sẽ mở toàn bộ quyền truy cập đối với danh mục đó. Người dùng có nhãn `all` ở Location sẽ nhìn thấy toàn bộ mặt bằng/vị trí trên tất cả các tab (Gantt, Detail, General, v.v.), và người dùng có nhãn `all` ở Party sẽ theo dõi được tất cả các đầu việc/nhiệm vụ bàn giao của mọi bộ phận và đối tác.
9. **Khôi phục ô Party Dự án trong Task Detail & Quyền truy cập tự động theo Party**: Trong tab **Detail**, cột PARTY trên mỗi dòng dự án đã được khôi phục ô chỉnh sửa nhanh trực tiếp (`p.party`) song song với nút gạt bật/tắt ủy quyền (Delegation Toggle). Đồng thời, bất kỳ nhân sự hoặc đơn vị đối tác nào được điền tên trong trường `party` của Dự án hoặc Công việc con đều có quyền hiển thị và truy cập dự án đó trong danh sách công việc của mình.
10. **Lưu & Đồng bộ Trạng thái Lọc Tự động (Persistent Filters)**: Hệ thống ghi nhớ các tuỳ chọn Store, Year và Location ở trên thiết bị của bạn. Khi bạn tắt ứng dụng và mở lại, các bộ lọc mà bạn đang xem sẽ được khôi phục nguyên vẹn. Hơn nữa, danh sách vị trí (Location) trong menu xổ xuống sẽ tự động cập nhật thông minh chỉ hiển thị những vị trí nằm trong Năm, Chi nhánh bạn đã chọn và tuân thủ chặt chẽ quyền truy cập (Permissions) được cấp của bạn.
11. **Focus Mode Liên Kết Giữa Gantt và Detail Tab**: Khi bạn đang xem tiến độ trên biểu đồ Gantt (Gantt Tab) và nhấp chọn một công việc con, hệ thống sẽ tự động chuyển hướng sang Detail Tab, mở rộng đúng dự án chứa công việc đó, cuộn màn hình đến đúng vị trí công việc, đồng thời làm nổi bật (highlight) màu vàng để bạn dễ dàng tập trung. Bạn có thể bấm nút "Clear Focus" (biểu tượng hình con mắt gạch chéo) nổi ở góc dưới màn hình để thoát khỏi chế độ này.
12. **Tính năng Ghim & Linh hoạt lịch trình (Pinned/Flexible Task)**: Trên giao diện Gantt Tab và Detail Tab, người dùng có thể tùy chỉnh trạng thái của từng Task con bằng biểu tượng 📌 Pin xanh lá (Ghim cố định) hoặc ▶️ Play xanh dương (Linh hoạt). Khi một task được cấu hình là Linh hoạt, hệ thống sẽ tự động tính toán lại và di dời (cascade) ngày tháng bắt đầu/kết thúc của tất cả các task phụ thuộc ở phía sau nếu bạn thay đổi ngày tháng hoặc kéo thả thời gian trên thanh biểu đồ. Nếu là Ghim cố định, task đó sẽ đứng im và không di chuyển theo các task trước đó.
13. **Bộ lọc Trạng thái Mở rộng (On process + Upcoming 3 days)**: Tại bộ lọc trạng thái của General Tab và Detail Tab, bổ sung thêm tùy chọn "On process + Upcoming 3 days". Tùy chọn này cho phép tự động gom nhóm hiển thị toàn bộ dự án đang trong quá trình thực hiện cùng với các dự án sẽ được khởi công trong vòng 3 ngày tới, giúp người quản lý chủ động chuẩn bị nhân sự và nguồn lực từ sớm.
14. **Hiển thị trực quan Phân loại Chi phí (ACT / FORC) trên Budget Tab**: Trong mục Actual của Budget Tab (trên cả giao diện Desktop dạng bảng và Mobile dạng thẻ), hệ thống tự động đối chiếu các mục chi phí con từ Cost Tab. Nếu dự án có bất kỳ mục chi phí dự kiến nào (Forecast - FORC), hệ thống sẽ hiển thị một nhãn dán màu cam đậm chữ "FORC" ngay trên số tiền để cảnh báo. Ngược lại sẽ hiển thị nhãn xanh "ACT" cho các chi phí thực tế. Số tiền 0 sẽ được tự động làm gọn.
15. **Dọn dẹp biểu tượng Import/Export**: Đã gỡ bỏ toàn bộ các nút Import và Export CSV dư thừa nằm rải rác bên ngoài giao diện ở các Tab (Cost, Detail, Budget). Mọi chức năng Import và Export giờ đây được quy hoạch tập trung 100% vào bên trong menu dấu ba gạch ngang (Hamburger Menu) để giữ cho giao diện luôn gọn gàng và đồng bộ.
16. **Dọn dẹp biểu tượng In (Print)**: Đã gỡ bỏ toàn bộ các nút In nằm bên ngoài giao diện ở các Tab. Để sử dụng tính năng xem trước bản in (Print Preview), vui lòng mở menu dấu ba gạch ngang (Hamburger Menu) và chọn 'Print Preview'.

17. **Thao tác nhanh qua nút cây bút (Edit Pencil) trên Detail Tab**:
    - **Nút cây bút của Task**: Mở thẳng cửa sổ Task Modal (tab Comments / Trao đổi công việc) giúp nhanh chóng thảo luận, cập nhật báo cáo và theo dõi phản hồi.
    - **Nút cây bút của Project**: Nhấp vào biểu tượng cây bút ✏️ trên dòng dự án (cột Action trên desktop và góc trên thẻ mobile) sẽ mở ngay hộp thoại Project Modal trực tiếp tại tab **Comments** (Trao đổi & Bình luận cấp dự án) để theo dõi và gửi phản hồi, ý kiến trao đổi mà không phải qua nhiều bước chuyển tab.

18. **Cải tiến Focus Mode (Mục tiêu)**: Khi chuyển từ bảng Detail sang Gantt thông qua tính năng focus, hệ thống sẽ tự động lọc riêng Project cha, mở rộng Project và cuộn chính xác tới vị trí của Task con.

19. **Bộ nút thao tác cố định thông minh (Smart Sticky Controls) & Thêm nhanh Task theo Dự án**:
   - **Tự động nhận diện Dự án đang xem (Smart Viewport Tracking)**: Khi bạn cuộn/lướt danh sách dự án trên Detail Tab, nút ghim cố định `+ Add New Task` ở góc trên bên phải sẽ tự động bắt lấy dự án gần nhất trong tầm mắt và cập nhật nhãn (ví dụ: `+ Task (B1-B106)`). Khi bấm vào, hộp thoại tạo Task mới sẽ tự động điền sẵn mã dự án, năm và chi nhánh tương ứng mà không cần bạn phải chọn thủ công.
   - **Nút Thêm nhanh Task trực tiếp trên từng Dự án (In-Card / In-Row Quick Action)**: Ngay trên từng dòng dự án (ở cột Action trên Desktop) và ở thanh chân thẻ dự án (trên Mobile), luôn có nút `+ Task` nhanh giúp bạn tạo ngay công việc mới cho đúng dự án đó chỉ với 1 chạm duy nhất.

20. **Điều hướng thông minh tại Trung tâm Thông báo (Notification Center)**: Mọi thẻ thông báo (gồm @mention, hạn chót Task/Project, và cập nhật phân công công việc Delegation Task) đều hỗ trợ mở trực tiếp mục tương ứng với cơ chế tìm kiếm thông minh:
   - Thông báo Task: Mở trực tiếp Task Modal.
   - Thông báo Project: Mở trực tiếp Project Modal.
   - Thông báo Phân công (Delegation): Nếu là task liên kết sẽ mở Modal chi tiết, nếu là nhóm phân công độc lập (custom delegation) sẽ tự động chuyển sang tab **Task Delegation** để bạn thao tác ngay lập tức.

21. **Đồng bộ điều hướng Task Gantt sang Task Detail (Gantt-to-Detail Sync) & Tự Động Xóa Focus khi Xóa Search**:
   - **Click Task con trên Gantt Tab**: Khi nhấp vào tên hoặc thanh của một Task con trên biểu đồ Gantt, hệ thống tự động điều hướng sang **Detail Tab**, tự động điền mã Task code phụ (hoặc mã task phụ `pCode-index`) vào ô tìm kiếm (`Search in detail...`) và lọc hiển thị duy nhất Task con đó, đồng thời mở rộng dự án cha, cuộn mượt mà đến đúng vị trí và highlight viền vàng nổi bật.
   - **Bấm nút Clear Focus & Back to Gantt**: Khi đang ở chế độ Focus Task tại Detail Tab, thanh công cụ dính nổi (sticky) ở góc dưới bên phải sẽ cung cấp 2 nút bấm thao tác nhanh:
     + **Nút Back to Gantt** (kế bên nút Clear Focus): Cho phép bạn lập tức quay trở lại biểu đồ Gantt Chart với vị trí công việc đang theo dõi mà không làm mất luồng làm việc.
     + **Nút Clear Focus** (biểu tượng con mắt gạch chéo): Ô tìm kiếm sẽ tự động chuyển từ mã Task con sang điền mã **Project Code** của dự án cha, cho phép bạn xem trọn vẹn toàn bộ danh sách các công việc con trong dự án đó mà không cần phải gõ lại.
   - **Bấm dấu X trên ô tìm kiếm**: Khi nhấp vào biểu tượng dấu **X** trên ô tìm kiếm, hệ thống sẽ xóa sạch toàn bộ từ khóa tìm kiếm (trở về rỗng `""`) và thoát khỏi chế độ focus, hiển thị lại toàn bộ các dự án và công việc một cách thông thoáng.
   - **Tự động Clear Focus tại Tab Gantt**: Trên biểu đồ Gantt (**Gantt Tab**), khi bạn đang trong trạng thái Focus một Task (có viền vàng nổi bật và nút nổi "Clear Focus"), nếu bạn **xóa từ khóa trong ô tìm kiếm** (bằng phím Backspace/Delete đưa về rỗng hoặc bấm nút `X` làm sạch), hệ thống sẽ **tự động xóa bỏ trạng thái Focus** (tắt viền highlight vàng và ẩn nút "Clear Focus"), giúp bạn xem lại toàn bộ tiến độ một cách liền mạch mà không cần thao tác bấm phụ.

22. **Tự động cuộn căn giữa ngày hiện tại trên biểu đồ Gantt (Scroll-to-Today)**:
   - Khi mở tab Gantt Chart (khi không có yêu cầu focus vào task cụ thể), biểu đồ sẽ tự động căn giữa khung nhìn trực tiếp vào mốc thời gian Hôm nay (Today Marker) để bạn nhanh chóng nắm bắt tiến độ công việc hiện tại.
   - Nút bấm **Today** trên thanh công cụ cho phép bạn đặt lại mốc thời gian về ngày hôm nay và cuộn mượt mà (smooth scroll) đưa đường chỉ thời gian hôm nay vào chính giữa màn hình bất cứ lúc nào.
   - **Tự động kích hoạt nút Today khi chuyển từ Tab General sang Gantt**: Khi bạn nhấp vào bất kỳ một dự án nào ở Tab **General** để chuyển sang xem tiến độ tại Tab **Gantt Chart**, hệ thống không chỉ tự động áp dụng bộ lọc (Year, Store, Project Code) và mở rộng danh sách task của dự án đó, mà còn **tự động kích hoạt ngay thao tác của nút Today** (đặt lại mốc thời gian chuẩn và cuộn mượt mà đưa đường Today vào chính giữa màn hình), giúp bạn lập tức nhìn thấy vị trí thời gian hiện tại tương quan với các giai đoạn của dự án.

23. **Tự động làm sạch ô tìm kiếm / mã Task ở tab Detail (Auto Clear Search on Tab Exit)**:
   - Ô tìm kiếm (`Search in detail...`) ở Tab Detail được trang bị nút `X` (Clear) nhanh ở góc phải giúp bạn xóa trắng nội dung tìm kiếm chỉ với 1 chạm.
   - Khi bạn chuyển sang tab khác (Gantt, General, Cost, Budget, Layout...) hoặc nhấn nút Quay lại (Back/Undo), toàn bộ nội dung tìm kiếm và trạng thái focus của Tab Detail sẽ được tự động dọn dẹp sạch sẽ, giúp bạn luôn có một giao diện mới tinh tươm và trực quan khi quay trở lại.

24. **Tối ưu hoá Tải Dữ liệu Tĩnh & Bộ lọc (Debounce Optimization)**:
   - Hệ thống đã được nâng cấp tối đa hiệu suất tải dữ liệu bằng cách tải một lần duy nhất (`getDocs/getDoc`) đối với các danh mục cấu hình tĩnh (Người dùng, Địa điểm, Tỷ giá, Phân quyền) vào bộ nhớ cục bộ thay vì mở kết nối liên tục, giúp giảm đáng kể tài nguyên đọc từ máy chủ.
   - Khi chuyển đổi nhanh chóng giữa các bộ lọc **Store** hoặc **Year**, hệ thống tích hợp bộ trì hoãn (Debounce ~350ms) để gom các thao tác chọn nhanh lại thành một lần tải duy nhất. Điều này giúp ngăn chặn hiện tượng khựng/lag trên giao diện khi người dùng bấm liên tục và tiết kiệm chi phí băng thông lên đến 70%.

25. **Cấu hình Sơ đồ Mặt bằng (Layout Tab) chuyên biệt theo Chi nhánh & Vị trí & Liên kết từ Gantt**:
   - **Liên kết trực tiếp từ Gantt Chart sang Layout (Gantt-to-Layout Link)**: Trên thanh danh sách dự án ở biểu đồ **Gantt Tab**, khi bạn nhấp vào tên dự án (hiển thị đầy đủ Mã dự án, Chi nhánh `HCM`/`HN`, và Vị trí `Location`), hệ thống sẽ lập tức chuyển hướng sang **Layout Tab**, tự động đồng bộ bộ lọc theo đúng Chi nhánh (`Store`) và Tầng/Vị trí (`Location`) của dự án đó để mở ra ngay sơ đồ mặt bằng tương ứng. Trên Tab Layout đồng thời hiển thị nút **Back to Gantt** giúp bạn nhanh chóng quay lại biểu đồ tiến độ.
   - **Ẩn tùy chọn All Stores**: Do sơ đồ kiến trúc mặt bằng mang tính chất vật lý riêng biệt theo từng cơ sở (HCM / HN), Tab Layout được thiết kế chuyên biệt theo từng chi nhánh cụ thể và ẩn tùy chọn "All Stores" để đảm bảo hiển thị chuẩn xác sơ đồ mặt bằng thực tế.
   - Đối với tài khoản **Admin / Quản trị viên** (hoặc người dùng có quyền ghi `Write.layout`): Menu chọn **Location** trên tab Layout sẽ hiển thị đầy đủ tất cả các vị trí/tầng (B2, B1, L1, L2, L3, L4, L5...) hiện có trong hệ thống, cho phép Admin dễ dàng chọn bất kỳ tầng/vị trí nào và nhấn **Edit URL** để cấu hình hoặc cập nhật link hình ảnh/Google Drive sơ đồ mặt bằng tương ứng.
   - Đối với tài khoản **Người dùng thông thường (Chỉ xem)**: Dropdown Location sẽ tự động tối ưu hóa để chỉ hiển thị các tầng/vị trí đã được Admin gắn sơ đồ hợp lệ của chi nhánh đang chọn.
   - Hệ thống hỗ trợ lưu trữ và phân cấp link mặt bằng thông minh theo từng chi nhánh (`url_HCM_B2`, `url_HN_B1`...).

26. **Tách Biệt Môi Trường Database (Environment Split)**:
   - Hệ thống hiện đã được cấu hình khả năng **Tự động nhận diện môi trường** (Dev/Prod).
   - Khi chạy trên trình duyệt Sandbox của AI Studio (`ais-dev-...`), hệ thống tự động trỏ vào **Database Taka-Dev**.
   - Khi chạy trên URL Publish/Shared (`ais-pre-...`), hệ thống tự động trỏ vào **Database Taka-Prod**.
   - **Thao tác yêu cầu**: Admin cần vào file `src/lib/firebase.ts` để cập nhật thông tin cấu hình cho biến `firebaseConfigDev` (hiện tại đang dùng tạm config của Prod để tránh lỗi).

27. **Lưu Trữ Trạng Thái Đã Đọc & Tắt Chuông Báo Đỏ (Notification Read Status Retention)**:
   - **Tự động đánh dấu đã đọc khi xem**: Khi bạn nhấp vào bất kỳ thẻ thông báo nào trong danh sách hoặc bấm nút đánh dấu hoàn thành, thông báo đó sẽ ngay lập tức được chuyển sang trạng thái "Đã đọc" (Read) và lưu trữ bền vững trên Firestore lẫn bộ nhớ trình duyệt cục bộ.
   - **Tắt chấm chuông đỏ (Badge)**: Số lượng chưa đọc trên biểu tượng chuông thông báo ở góc trên Header sẽ tự động giảm trừ tương ứng. Khi toàn bộ thông báo đã được đọc (hoặc khi bấm nút "Read All"), chấm tròn màu đỏ trên chuông sẽ tự động biến mất và không bao giờ báo đỏ lại cho những thông báo đã đọc.
   - **Bộ lọc Trạng thái**: Bạn có thể dễ dàng chuyển đổi qua lại giữa các tab **Unread** (Chưa đọc), **Read** (Đã đọc) hoặc **Read All** (Đánh dấu đã đọc tất cả) để quản lý luồng công việc khoa học và không bị bỏ sót sự kiện.

28. **Trung tâm Thông báo Đa Chi nhánh, Toàn bộ Niên độ & Gom Nhóm Thông Minh (Notification System Phase 1)**:
   - **Bao quát Toàn diện Mọi Chi nhánh & Năm (All Stores & All Years)**: Trung tâm thông báo theo dõi và tổng hợp toàn bộ các đầu việc, dự án gần tới hạn hoặc quá hạn trên toàn hệ thống (cả HCM, HN và tất cả các năm 2026, 2027, 2028...), hoàn toàn không bị giới hạn hay phụ thuộc vào bộ lọc đang chọn trên giao diện.
   - **Gom nhóm thông báo thông minh (Smart Task Alert Batching)**: Khi một dự án có nhiều hơn một công việc cùng đến hạn hoặc quá hạn, hệ thống tự động gom nhóm các công việc đó lại vào một thẻ thông báo tổng thể duy nhất kèm nhãn số lượng (`X tasks`). Điều này giúp bảng thông báo luôn gọn gàng, súc tích và tránh gây ngập thông báo cho người dùng.
   - **Tự động Thoát Chế độ Focus Thông báo (Auto Clear Focus Filter)**: Khi bạn nhấp vào một thông báo cụ thể để xem chi tiết (chế độ Focus Notification), nút `Clear Filter` sẽ hiển thị để bạn quay lại danh sách chung. Đặc biệt, nếu bạn bấm vào bất kỳ nút phân loại nào khác trên thanh công cụ (`Read`, `Unread`, `Read All`, `Project`, `Task`, `Delegation`), hệ thống sẽ **tự động xóa chế độ Focus** và chuyển ngay sang hiển thị danh sách tương ứng với nút bạn vừa bấm mà không cần phải bấm nút `Clear Filter` thủ công.
   - **Bộ nhớ đệm IndexedDB & Tối ưu hóa lượt đọc (Zero Redundant Reads)**: Dữ liệu thông báo toàn cục được lưu trữ đệm trong IndexedDB trình duyệt (`taka_global_projects`, `taka_global_tasks`). Ứng dụng hiển thị thông báo tức thì ngay khi mở trang mà không phải quét lại toàn bộ cơ sở dữ liệu Firestore, bảo đảm tốc độ phản hồi tối đa và tiết kiệm chi phí đọc dữ liệu.

29. **Hiển thị Trực quan Thẻ Thông báo (Nhãn Store Dưới Chuông & Phân biệt Mã / Tên Task)**:
   - **Nhãn Chi nhánh đặt dưới icon Chuông (Store Badge)**: Huy hiệu nhận diện cơ sở được bố trí ngay bên dưới biểu tượng quả chuông ở góc trái thẻ theo quy chuẩn nhận diện màu sắc chuẩn (**HN màu đỏ**, **HCM màu xanh dương**), tạo sự gọn gàng, liền mạch cho tiêu đề thông báo bên phải.
   - **Phân biệt Mã task & Tên task (Bold Task Name)**: Dòng thông tin hiển thị màu xanh rõ nét, trong đó **mã dự án/task được giữ nét chữ thường (font-normal)** và **chỉ in đậm riêng phần tên dự án / tên công việc (font-bold)** (ví dụ: `L1-105-2` nét thường, `Laneige - Xerjoff` in đậm), giúp mắt dễ dàng phân tách mã hiệu và nội dung công việc.
   - **Lược bỏ chuỗi ngày giờ ISO thừa**: Đã loại bỏ chuỗi ngày giờ thô kỹ thuật dạng `2026-09-02T10...`, chỉ giữ lại phần thời gian cập nhật `UPDATE: ...` được định dạng thân thiện và chuẩn hóa ở cuối thẻ.



30. **Điều Hướng & Định Vị Trực Tiếp Đến Dự Án / Task Khi Nhấp Thông Báo (Smart Notification Deep-Linking & Auto-Focus)**:
   - **Tự động Chuyển Chi Nhánh (Store) & Niên Độ (Year)**: Khi bạn nhấp vào bất kỳ thông báo nào (ví dụ thẻ thông báo mention của dự án Dior tại chi nhánh HN), hệ thống sẽ tự động nhận diện chi nhánh (`HN`) và năm tương ứng của dự án/task đó, tự động đồng bộ hóa bộ lọc toàn cục sang đúng chi nhánh và năm mà không để người dùng kẹt ở chi nhánh cũ (ví dụ HCM).
   - **Mở Thẳng Modal Chi Tiết & Highlight Bình Luận Đề Cập (@Mention)**: Nếu thông báo là một lượt gắn thẻ nhắc tên (@mention), hệ thống lập tức mở cửa sổ Modal của dự án/công việc đó tại tab Chat (Bình luận) và cuộn sáng đúng tin nhắn đề cập để bạn lập tức nắm bắt ngữ cảnh.
   - **Tự Động Lọc & Cuộn Tới Đúng Vị Trí Dự Án Trên Bảng Chi Tiết (Detail Tab Auto-Scroll & Expand)**: Đồng thời, bảng dữ liệu bên dưới tự động chuyển sang tab Detail, tự động điền mã dự án vào thanh tìm kiếm, tự động đặt bộ lọc trạng thái về 'Tất cả' (đảm bảo dự án không bị ẩn bởi các tiêu chí lọc tiến độ khác), tự động mở rộng (Expand) danh mục công việc con và tự động cuộn màn hình (smooth scroll) thẳng tới đúng dòng/thẻ dự án đó.

31. **Cơ Chế Thông Báo Siêu Nhẹ & Tách Biệt Tải Dữ Liệu Toàn Cục (Zero-Lag Lightweight Notification Queries)**:
   - **Tách biệt khỏi lượt tải nặng**: Trung tâm thông báo không còn yêu cầu quét tải toàn bộ danh sách công việc (`tasks`) hay chi phí (`costs`) của toàn bộ hệ thống ngay khi bạn vừa mở ứng dụng.
   - **Truy vấn thu hẹp thông minh**: Khi ở màn hình Tổng quan (General, Summary...), hệ thống chỉ chạy một truy vấn nhẹ trong phạm vi 60 ngày quanh thời điểm hiện tại (30 ngày trước đến 30 ngày tới) với giới hạn tài liệu nghiêm ngặt. Nhờ đó thông báo hạn chót luôn cập nhật theo thời gian thực mà ứng dụng tải mượt mà tức thì, giảm từ 90% đến 98% số lượt đọc Firestore không cần thiết.
   - **Kích hoạt tải chi tiết theo nhu cầu (On-Demand Hydration)**: Dữ liệu công việc đầy đủ (`tasks`) và bảng chi phí (`costs`) chỉ được tải ngầm khi bạn thực sự chuyển sang các tab chuyên sâu tương ứng (`Detail`, `Gantt`, `Cost`), mang lại trải nghiệm 60 FPS liền mạch.

32. **Phân hệ Lịch Biểu Tiến Độ (Task Calendar) & Nút Gạt Hiển Thị Task Con (Sub-tasks Toggle)**:
   - **Góc nhìn mặc định dạng Tháng (Default Month View)**: Khi mở tab Calendar, hệ thống luôn ưu tiên hiển thị chế độ xem lưới tháng (`Month view`), giúp người dùng bao quát toàn bộ tiến độ trong tháng.
   - **Nút Gạt Hiển Thị Task Con (Toggle Task con)**: 
     - Trên thanh công cụ của Calendar Tab có nút công tắc gạt **"Task con"**.
     - **Khi bật ON**: Trên lưới lịch tháng, ngoài các mốc của Dự án mẹ (**Project Start**: màu xanh lá cây `#10b981`, **Project Finish**: màu cam `#fb923c`), hệ thống sẽ hiển thị trực quan các mốc tiến độ của từng task con:
       - **Task Start**: Màu xanh dương đậm (`#2563eb`).
       - **Task Finish**: Màu đỏ tía / magenta (`#a21caf`).
       - Các chấm tròn định vị (dots) trên từng ô ngày trong lịch tháng cũng tự động hiển thị các màu tương ứng để người dùng nhìn nhanh mật độ công việc.
       - Danh sách chi tiết các sự kiện bên dưới ngày được chọn sẽ hiển thị đầy đủ thẻ nhiệm vụ kèm nhãn phân loại `[Project]` hoặc `[Task]`, nhấp vào thẻ sẽ mở ngay hộp thoại chi tiết tương ứng.
     - **Khi tắt OFF**: Lịch tháng ẩn các mốc task con, chỉ tập trung hiển thị các mốc bắt đầu và hoàn thành của Dự án tổng thể.
     - Trạng thái gạt (Bật/Tắt) được lưu bền vững vào bộ nhớ thiết bị (`taka_calendar_show_subtasks`), không bị mất khi tải lại trang.
   - **Xuất Lịch (.ics) Đồng Bộ Lịch Cá Nhân (Export ICS)**: Nút **"Export ICS"** cho phép tải file lịch biểu chuẩn `.ics` về máy tính hoặc điện thoại để đồng bộ hạn chót công việc trực tiếp vào Google Calendar, Microsoft Outlook hoặc Apple Calendar.

### 4.8. ⚡ CƠ CHẾ TỐI ƯU HÓA TỐC ĐỘ TẢI VÀ BỘ NHỚ ĐỆM (CACHE & DELTA SYNC)
21. **Bộ đệm Ma trận Phân quyền (IndexedDB Permission Cache)**: Hệ thống sử dụng bộ nhớ IndexedDB nội bộ của trình duyệt để lưu lại Ma trận phân quyền (Permission Matrix) của người dùng. Khi bạn mở ứng dụng, giao diện và các Tab chức năng sẽ được hiển thị ngay lập tức dựa trên bộ đệm cục bộ này, triệt tiêu độ trễ màn hình trắng và giảm đáng kể số lượng request dư thừa lên cơ sở dữ liệu Firestore, trong khi vẫn duy trì đồng bộ ngầm thời gian thực.
32. **Đồng Bộ Dữ Liệu Hợp Nhất Toàn Cầu (Unified Global Delta Sync & Zero-Read Filter Switching)**:
   - **Mở ứng dụng 0ms từ IndexedDB**: Khi bạn mở lại ứng dụng trên Desktop, iPhone hoặc iPad, toàn bộ dữ liệu dự án (`projects`), công việc (`tasks`) và chi phí (`costs`) đã lưu trước đó trong bộ nhớ vĩnh viễn IndexedDB của thiết bị được hiển thị lên màn hình ngay lập tức trong 0 giây mà không cần chờ mạng tải về.
   - **Bộ Nhớ Đệm Hợp Nhất (Unified Cache - 0 Reads khi đổi Store/Year)**: Toàn bộ dữ liệu được quản lý tập trung trong một kho đệm đồng nhất (`taka_projects_global`, `taka_tasks_global`, `taka_costs_global`). Mọi thao tác chuyển đổi chi nhánh (**HCM ↔ HN ↔ All Stores**) và năm (**2026 ↔ 2027 ↔ 2028 ↔ All Years**) diễn ra hoàn toàn trên bộ nhớ RAM với độ trễ 0ms và **0 lượt đọc Firestore**.
   - **Chỉ tải các bản ghi có thay đổi mới (`updatedAt > lastSync`)**: Hệ thống ghi nhận mốc thời gian đồng bộ lần cuối (`lastSync`) toàn cục. Lắng nghe Firestore chỉ truy vấn những tài liệu được tạo hoặc cập nhật sau mốc `lastSync`. Nếu không có ai sửa đổi dữ liệu kể từ lần mở trước, số lượt đọc (Firestore Reads) phát sinh là **0 lượt**.
   - **Cơ chế Xóa mềm (Soft Delete `isDeleted: true`)**: Khi một dự án, task hoặc chi phí bị xóa, hệ thống đánh dấu cờ xóa và cập nhật `updatedAt`. Quá trình Delta Sync trên các thiết bị khác sẽ nhận diện cờ này để tự động xóa mục tương ứng khỏi bộ nhớ cục bộ mà không bị mất dấu hay sót dữ liệu.
   - **Tự phục hồi thiết bị quá hạn (Stale Client Auto-Healing > 60 ngày)**: Nếu một thiết bị không mở ứng dụng trong hơn 60 ngày, hệ thống sẽ tự động làm mới bộ nhớ đệm và tải lại đầy đủ từ Firestore một lần duy nhất nhằm đảm bảo dữ liệu luôn chính xác 100%.
   - **Công cụ Quản trị Dữ liệu Gọn Gàng (Nút Mẹ Database Maintenance)**: Trong tab **Settings**, các công cụ *Clear & Resync Cache* và *Purge Tombstones (>60d)* (cùng công cụ *Chuẩn hóa Năm (Số)*) đã được thu gọn vào trong 1 nút mẹ mang tên **Database Maintenance** bên cạnh nút *Performance Monitor*. Khi Quản trị viên nhấp vào nút mẹ, một dòng công cụ riêng biệt sẽ mở ra ở ngay bên dưới (dưới nút Performance Monitor), giúp thanh công cụ cài đặt luôn gọn gàng và tinh tế.

33. **Bảng Giám Sát Hiệu Năng & Lượt Đọc Firestore Thời Gian Thực (Firestore Performance & Read Monitor Dashboard)**:
   - **Nút Bật/Tắt Gọn Gàng Trong Tab Cài đặt (Settings)**: Nằm trong hàng nút công cụ quản trị của Admin với tên **Performance Monitor**. Khi quản trị viên nhấp vào nút này, bảng giám sát chi tiết sẽ được xổ ra mượt mà; nhấp lại một lần nữa (hoặc bấm biểu tượng đóng `X`) thì bảng sẽ được giấu kín để giữ giao diện Cài đặt luôn tinh gọn.
   - **Thẻ Chỉ Số KPI Trực Quan (Real-time Metric Cards)**:
     - *Billable Server Reads*: Số lượt đọc tính phí lên máy chủ Firestore trong phiên làm việc hiện tại, kèm cảnh báo màu sắc (Xanh: Tối ưu cao < 200 reads, Vàng: Vừa phải < 1,500 reads, Đỏ: Cảnh báo đột biến truy vấn).
     - *Saved by Cache (Free)*: Số lượng tài liệu được phục vụ trực tiếp tức thì từ bộ nhớ đệm IndexedDB cục bộ với chi phí đọc = 0.
     - *Cache Hit Ratio (%)*: Tỷ lệ phần trăm hiệu quả của bộ nhớ đệm (ví dụ: 99.4%), kèm thanh tiến trình trực quan.
     - *Active Subscriptions*: Số lượng kênh lắng nghe thời gian thực (`onSnapshot`) đang hoạt động đồng thời, cùng thời gian diễn ra phiên làm việc.
   - **Bảng Phân Tích Chi Tiết Từng Bộ Dữ Liệu (Collections Matrix)**: Báo cáo chi tiết số lượng Server Reads, Cache Reads, số kênh kết nối và Tỷ lệ Hit Rate cho từng collection (`taka_projects`, `taka_tasks`, `taka_costs`, `taka_users`, `taka_settings`, `taka_rules`, v.v.).
   - **Nhật Ký Truy Vấn Thời Gian Thực (Live Read Events Log)**: Hiển thị dòng sự kiện đọc dữ liệu kèm nhãn nguồn (`SERVER [Billable]` vs `CACHE [Free]`), thời gian chính xác, số tài liệu và chức năng lọc theo nguồn hoặc tìm kiếm theo tên collection.
   - **Công Cụ Quản Trị Nhanh**: Hỗ trợ nút *Copy Report* (sao chép nhanh báo cáo phân tích), *Export JSON* (xuất toàn bộ nhật ký sự kiện ra file JSON để đối soát) và nút *Reset Counters* (làm mới bộ đếm phiên).


34. **Cơ Chế Đóng Băng Dữ Liệu Năm Cũ (Archived Years Read-Only Mode)**:
   - **Tối Ưu Hoá Truy Vấn Từ Gốc (Query Optimization)**: Khi người dùng chọn bộ lọc Năm là các năm trong quá khứ (ví dụ: năm 2025 so với năm hiện tại 2026), hệ thống sẽ ngắt kết nối hoàn toàn việc tải dữ liệu của các năm khác, giúp tiết kiệm tối đa lượt Read Firebase và tăng tốc độ xử lý.
   - **Chế Độ Read-Only Tự Động**: Ngay khi truy cập vào một năm trong quá khứ, toàn bộ ứng dụng (trên cả 9 phân hệ) sẽ tự động chuyển sang chế độ "Đóng Băng" (Read-Only). Tất cả các nút tạo mới (Add), chỉnh sửa (Edit), xóa (Delete) sẽ biến mất hoặc bị vô hiệu hóa. Người dùng (kể cả Admin) chỉ có thể xem, cuộn, lọc và xuất dữ liệu báo cáo (CSV/PDF) mà không thể vô tình sửa đổi làm sai lệch số liệu lịch sử của năm cũ.

35. **Chuẩn Hóa Định Dạng Niên Độ Sang Số (Standardize Year Format to Numbers)**:
   - **Đồng nhất 100% kiểu dữ liệu Năm**: Hệ thống đã chuyển đổi và đồng nhất toàn bộ các trường năm (`year` trên Dự án, `projectYear` trên Công việc và Chi phí) từ dạng chuỗi ký tự (`'2026'`, `'2027'`) thành kiểu số nguyên chuẩn (`2026`, `2027`) trên toàn bộ cơ sở dữ liệu (Firestore). Nhờ đó, việc chuyển đổi qua lại giữa các bộ lọc năm (`2026`, `2027`, `All Years`) luôn tức thì, đồng bộ và hiển thị dữ liệu chính xác 100%, không bị lệch hay ẩn bản ghi do sai khác kiểu dữ liệu.
   - **Bảo Vệ Toàn Diện Khi Tạo Mới & Nhập Dữ Liệu (Import & Form Guard)**: Mọi thao tác thêm mới dự án, thêm task, sửa chi phí cũng như tất cả các cổng nhập dữ liệu (CSV Import / Full Replace Import) đều tự động ép kiểu giá trị năm sang dạng số trước khi lưu lên Firestore.
   - **Nút Công Cụ Chuẩn Hóa Năm Trong Tab Cài Đặt (Admin Tool)**: Dành riêng cho Quản trị viên (Admin), nút **Chuẩn hóa Năm (Số)** trong tab Cài đặt (Settings) cho phép quét và tự động chuẩn hóa toàn bộ cơ sở dữ liệu bất cứ lúc nào chỉ với 1 cú nhấp chuột.

36. **Tối Ưu Hiển Thị Dữ Liệu Bảng (Wrap Text & Định Tuyến Thông Báo Dự Án An Toàn)**:
   - **Tự động xuống dòng (Wrap Text) trong Tab Ngân Sách (Budget) & Chi Phí (Cost)**: Tên dự án, tên chi phí, mô tả chi phí và nhà cung cấp/đối tác đã được hỗ trợ tự động xuống dòng (`whitespace-normal break-words`), không còn bị cắt cụt dấu ba chấm (`...`). Giúp người dùng đọc trọn vẹn thông tin tên dự án và diễn giải chi phí mà không cần kéo giãn cột thủ công.
   - **Trực quan hóa dự án mẹ trong Tab Ngân Sách**: Bỏ nhãn chữ "Mẹ", thay vào đó các dự án mẹ có nhiều hơn 2 hạng mục con sẽ được làm nổi bật với nút mở rộng màu xanh lá cây (`bg-emerald-600`), giúp người dùng dễ dàng nhận diện các gói ngân sách lớn nhiều hạng mục con.
   - **Điều hướng thông báo dự án an toàn & chống lỗi trang**: Khi nhấp vào các thông báo dự án (tiến độ, deadline, nhắc nhở, trao đổi @mention, phê duyệt), hệ thống tự động đồng bộ hóa bộ lọc Chi nhánh, Niên độ và Mã dự án, định tuyến an toàn tới chi tiết dự án mà không gây lỗi trang kể cả khi dữ liệu chưa tải sẵn trong bộ nhớ đệm.

37. **Định Tuyến & Phân Loại Thông Báo Chuẩn Xác Theo Chi Nhánh (Store-Aware Notification & Filtering)**:
   - **Bộ Lọc Chi Nhánh Trực Quan Trong Tab Thông Báo**: Tab Notification được bổ sung bộ nút lọc chi nhánh: **All Store**, **HCM**, và **HN** kèm theo huy hiệu đếm số lượng thông báo chưa đọc cho từng chi nhánh. Bộ lọc này tự động đồng bộ theo bộ lọc chi nhánh toàn cục trên Header và cho phép người dùng chuyển nhanh để xem thông báo riêng cho từng địa bàn làm việc.
   - **Định Tuyến Tuyệt Đối Theo Chi Nhánh (Zero Store Collision)**: Khắc phục triệt để tình trạng hai chi nhánh có mã dự án trùng nhau hoặc cùng tên công việc. Mỗi thẻ thông báo mang đầy đủ thông tin `projectStore` và `projectYear`. Khi nhấp vào thông báo, hệ thống tự động:
     1. Đồng bộ `globalStoreFilter` về đúng chi nhánh của dự án (HCM hoặc HN).
     2. Đồng bộ `globalYearFilter` về đúng niên độ của dự án.
     3. Mở chính xác Modal công việc/dự án của chi nhánh đó mà không bao giờ bị nhầm sang chi nhánh khác.

38. **Dọn Dẹp Bản Ghi Ủy Quyền Trùng Lặp & Định Danh Chuẩn Hóa Theo Chi Nhánh & Niên Độ (Multi-Store & Year Scoping Delegation)**:
   - **Phân tách tuyệt đối giữa các Chi nhánh & Năm**:
     - **Đối với Công việc (Task)**: Sử dụng ID xác định `del_[taskId]`. Bản thân mỗi công việc trong hệ thống đã có mã duy nhất (`taskId`), đồng thời luôn lưu trữ đầy đủ `projectCode`, `projectStore` và `projectYear` của công việc cha.
     - **Đối với Dự án (Project-level)**: Do cùng một mã dự án (ví dụ `CP-01` hay `PRJ-01`) có thể xuất hiện độc lập ở các chi nhánh khác nhau (HCM vs HN) hoặc giữa các niên độ (2026 vs 2027), định danh nhóm ủy quyền dự án được tạo theo cấu trúc đa tầng chuẩn xác: `del_proj_[code]_[store]_[year]` (ví dụ: `del_proj_CP-01_HCM_2026`). Điều này đảm bảo dữ liệu ủy quyền giữa HCM và HN, hoặc giữa năm 2026 và 2027 hoàn toàn tách biệt, không bao giờ bị ghi đè hay gộp nhầm lẫn sang nhau.
   - **Công Cụ Quản Trị Dọn Dẹp Bản Ghi Trùng Lặp (Admin Tool)**: Trong tab Cài đặt (Settings), Quản trị viên có nút **Dọn dẹp Ủy quyền trùng lặp** (màu tím sang trọng bên cạnh nút Chuẩn hóa Năm). Khi nhấn, hệ thống sẽ quét toàn bộ bộ sưu tập `taka_delegation_groups`, tự động phân tách theo đúng từng nhánh `projectCode + store + year` (đối với dự án) và `taskId` (đối với công việc), bảo toàn 100% các subtask và xóa sạch các bản ghi dư thừa. Giảm kích thước collection từ hàng ngàn bản ghi xuống còn đúng số lượng thực tế, triệt tiêu đột biến lượt đọc (Read Storm).

39. **Công Cụ Đồng Bộ Task Counts Toàn Bộ Dự Án (One-Time Task Counts & Progress Sync Tool)**:
   - **Vị trí**: Tab **Cài đặt (Setting Tab)** ➔ Bấm mở **Database Maintenance** ➔ Nút **"Cập nhật Task Counts toàn bộ Dự án"** (màu xanh ngọc teal với biểu tượng lấp lánh `Sparkles`).
   - **Mục đích & Cơ chế hoạt động**:
     - Quét toàn bộ danh sách `taka_projects` và `taka_tasks` trên Firestore.
     - Gom nhóm các task con theo từng dự án (`projectCode + year + store`).
     - Tính toán chính xác số lượng task con (`taskCount`), tóm tắt công việc (`taskSummaries`), ngày bắt đầu sớm nhất (`computedTakStart`), ngày hoàn thành muộn nhất (`computedTakCompl`), tiến độ kế hoạch (`computedPlanProgress`) và tiến độ thực tế (`computedActProgress`).
     - Ghi đồng loạt (Batch Write tối đa 400 thao tác/mẻ) trực tiếp vào tài liệu từng dự án trên Firestore.
   - **Lợi ích**: Giúp hoàn thiện 100% cơ chế **On-Demand Expansion Loading**, cho phép người dùng mở ứng dụng và xem ngay số lượng task con, tiến độ, thời gian của mọi dự án mà không cần tải bất kỳ task con nào (đạt chuẩn Zero-Read khi chưa mở rộng). Admin chỉ cần chạy nút này 1 lần duy nhất cho toàn bộ hệ thống.

### 🔄 Cơ Chế Tải Dữ Liệu Tối Ưu (Firestore Read Optimization)
- **Tải Dữ Liệu Đóng Băng Theo Năm & Chi Nhánh**: Hệ thống tự động giới hạn việc tải dữ liệu từ server Firebase dựa trên Niên độ (ví dụ 2026) và Chi nhánh (ví dụ HCM) mà người dùng đang chọn ở Header. Việc này giúp tiết kiệm hàng trăm ngàn lượt đọc (Firestore Reads) không cần thiết so với việc tải toàn bộ database, đảm bảo app luôn chạy mượt mà ngay cả khi dữ liệu lên tới hàng chục năm.
- **Client-Side Filtering (Lọc Bảo Mật Tại Trình Duyệt)**: 
  - Khi hai người dùng (ví dụ: `ksm-01` và `cp-hung`) cùng xem chi nhánh **HCM** năm **2026**, hệ thống sẽ **tải về cùng một lượng dữ liệu (số Firestore Reads bằng nhau)** để tối ưu truy vấn mảng phức tạp.
  - Sau khi tải về, hệ thống lọc thông minh tại Client (trình duyệt) dựa trên Ma trận `Location` và `Party`. `ksm-01` chỉ thấy các dự án khớp tên mình, trong khi `cp-hung` có quyền `all` (Tất cả Party / Location) sẽ tự động ghi đè quyền Store và thấy toàn bộ dữ liệu của chi nhánh đó mà không tốn thêm bất kỳ lượt Read nào.

### 💾 Bộ Nhớ Lưu Trữ Bền Vững Đa Nền Tảng (Persistent Storage PWA - iOS, Android & Desktop)
- **Bảo Vệ Dữ Liệu Ngoại Tuyến (Offline Data Protection)**: API chuẩn `navigator.storage.persist()` đã được kích hoạt trên toàn hệ thống:
  - **Trên iOS Safari / PWA**: Đăng ký quyền lưu trữ vĩnh viễn với iOS, loại bỏ chính sách 7-day auto-purge và giải phóng bộ nhớ tự động của Apple.
  - **Trên Android (Chrome PWA)**: Tự động cấp quyền `persistent: true` khi người dùng cài đặt PWA hoặc thêm vào màn hình chính, bảo vệ IndexedDB khỏi việc hệ điều hành dọn dẹp khi bộ nhớ đầy.
  - **Trên Desktop (Chrome, Edge, Firefox, macOS/Windows)**: Duy trì bộ nhớ đệm vĩnh viễn với hạn mức lưu trữ lên tới hàng chục GB, giúp app mở tức thì và đạt 0 lượt đọc Cloud Firestore cho các dữ liệu đã lưu trong bộ nhớ máy.

### 🚀 Tối Ưu Hiệu Năng Giao Diện & Kiến Trúc Tải Dữ Liệu
- **Bảng Điều Khiển Siêu Tốc (Pre-computed Dashboard)**: Tổng quan chung (General Tab) đã được tái cấu trúc hoàn toàn. Thay vì đọc hàng ngàn thẻ Công việc (Task) để tính toán phần trăm tiến độ, hệ thống tự động ghi sẵn tiến độ và tổng hợp danh sách công việc đang thực hiện trực tiếp vào thẻ Dự án mỗi khi có sự thay đổi. Điều này giúp Dashboard đạt tốc độ tải tức thì và chỉ tốn 1 lượt đọc (1 Read) duy nhất cho mỗi dự án.
- **Đồng Bộ Hai Chiều (Gantt & Chi Tiết)**: Khi thay đổi thanh tiến độ trên biểu đồ Gantt (Kéo/Thả, Thay đổi ngày) hoặc tạo mới/xóa task trong thẻ Chi tiết, thông số tiến độ trên Dashboard sẽ lập tức được tự động tính toán lại và đồng bộ trong vài mili-giây.
- **Tab Delegation (Quản Lý Phân Công)**: Giao diện giờ đây sử dụng cơ chế Lazy Rendering giống như GeneralTab. Khi mới mở, màn hình chỉ tải 20 nhóm Task đầu tiên để ngăn chặn hiện tượng giật lag do quá tải DOM. Để xem tiếp, người dùng có thể nhấn nút **Load More** ở cuối danh sách. Dữ liệu tải thêm này lấy trực tiếp từ bộ nhớ đệm nên tốc độ xử lý là ngay lập tức (0s) và không tốn chi phí gọi dữ liệu từ Cloud.
8. **Tạo mã QR truy cập nhanh (Quick Access QR Code)**: Nút biểu tượng QR được tích hợp tại bảng danh sách chi tiết (Detail Tab) và trong cửa sổ Modal của tất cả Dự án (Project) và Công việc con (Task). Khi nhấp vào biểu tượng này, hệ thống sẽ tự động tạo một mã QR kích thước lớn cùng đường dẫn URL định danh trực tiếp (`targetId`). Người dùng có thể quét mã này bằng điện thoại hoặc sao chép đường dẫn để truy cập, chia sẻ, và định hướng (navigation) thẳng tới bảng/thẻ thông tin tương ứng một cách nhanh chóng.
9. **Quét mã QR thông minh (QR Scanner)**: Biểu tượng máy quét mã QR (`ScanQrCode` - hình ô vuông mã QR kèm khung ngắm quét sắc nét) được đặt nổi bật ở thanh công cụ (Header), giúp người dùng nhận diện ngay tức thì chức năng quét mã QR của Project/Task trên mọi thiết bị:
   - **Tương thích toàn diện (Desktop PC, Laptop & Mobile)**: Hệ thống tự động nhận diện thiết bị. Trên điện thoại sẽ ưu tiên camera sau (Environment/Rear), trên máy tính Desktop/Laptop sẽ tự động kết nối Webcam/Camera có sẵn mà không bị lỗi ràng buộc phần cứng.
   - **Đổi Camera (Camera Switcher)**: Nếu thiết bị có từ 2 camera trở lên (trước/sau hoặc webcam rời), biểu tượng đổi camera sẽ xuất hiện ở góc trên để người dùng chuyển đổi linh hoạt.
   - **Tải ảnh mã QR (Upload Image Fallback)**: Trường hợp máy tính không có camera, camera đang bận họp Zoom/Teams hoặc quyền truy cập bị chặn, người dùng có thể bấm nút **"Tải ảnh mã QR"** để chọn ảnh chụp/ảnh chụp màn hình chứa mã QR từ máy tính. Hệ thống sẽ giải mã trực tiếp từ file ảnh trong tích tắc.
   - **Cơ chế Thử lại (Retry) & Mở tab mới**: Nếu trình duyệt chặn quyền hoặc chạy trong khung nhúng (iframe), giao diện cung cấp nút **"Thử lại Camera"** tại chỗ và nút **"Mở tab mới"** để cấp quyền dễ dàng.
   - Khi quét thành công, hệ thống sẽ tự động chuyển hướng và mở trực tiếp chi tiết Dự án hoặc Công việc tương ứng.
10. **Bảng Theo Dõi Hiệu Năng & Chi Phí Toàn Bộ Thiết Bị (Global Fleet Performance Monitor)**:
    - **Vị trí**: Nằm trong thẻ **Cài đặt (Setting Tab)** -> Bảng điều khiển hiệu năng **Firestore Performance & Read Monitor**.
    - **Chế độ xem 1: Thiết Bị Này (Current Device Session)**: Đo lường chi tiết phiên làm việc trên máy tính/điện thoại hiện tại:
      - Số lượt đọc Cloud trả phí (Billable Server Reads).
      - Số lượt đọc từ Cache IndexedDB nội bộ (0 đồng phí Firebase).
      - Tỷ lệ Cache Hit Rate (mục tiêu luôn đạt 95% - 100%).
      - Danh sách chi tiết từng Collection Firebase kèm thời gian và số lượng tài liệu đọc.
    - **Chế độ xem 2: Toàn Bộ Thiết Bị (All Devices Fleet)**:
      - Cho phép Quản trị viên (Admin) và người giám sát theo dõi tổng chi phí, số lượng thiết bị truy cập hệ thống theo thời gian thực (Real-time Fleet Telemetry).
      - **Tổng hợp mạng lưới**: Tính tổng số Server Reads, Cache Reads, và tỷ lệ Cache trung bình của toàn bộ các máy tính, iPad, điện thoại đang kết nối vào hệ thống.
      - **Phân loại trạng thái**: Tự động nhận diện thiết bị đang **Online** (hoạt động trong 3 phút qua), **Chờ (Idle)** (dưới 15 phút), hoặc **Offline**.
      - **Bộ lọc & Tìm kiếm**: Lọc theo vai trò người dùng (Admin, User, Guest) hoặc tìm kiếm theo tên thiết bị, hệ điều hành (Windows, MacOS, iOS iPhone, Android Chrome...).
      - **Đồng bộ thủ công & Dọn dẹp máy cũ**: Tích hợp nút **"Đồng bộ máy này"** để gửi ngay telemetry tức thời, và nút **"Dọn máy offline (>24h)"** để xoá các thiết bị rác cũ không còn hoạt động, giữ bảng dữ liệu luôn gọn gàng và tiết kiệm dung lượng.

### 🔗 QR Code Deep Linking & Auto-Routing
- Khi quét QR Code hoặc click vào đường link trực tiếp (Deep link) chứa tham số `?targetType=task&targetId=...`:
  - **Bước 1**: App sẽ tự động khởi động và tìm kiếm Task/Project đó trong bộ nhớ đệm (Cache) của hệ thống.
  - **Bước 2**: Nếu Task/Project nằm ngoài bộ lọc hiện tại (Ví dụ: Bạn đang lọc "Năm 2026" nhưng QR link dẫn tới một Task thuộc "Năm 2025"), app sẽ **tự động kết nối với Server (Firestore)** để tải về bản ghi đó.
  - **Bước 3**: Sau khi tìm thấy, app tự động chuyển đổi bộ lọc `Year` và `Store` trên toàn hệ thống để khớp với thông tin của Task/Project đó, sau đó lập tức mở cửa sổ Modal chi tiết lên cho bạn.

### 43. Thẻ Tổng Quan Chi Phí: Total Act/Forc & Total Balance (Cost Tab Summary Layout)
- **Giao diện thẻ tổng hợp (Desktop Summary Bar & Mobile Summary Card)**:
  - Vị trí ô `Total Budget` trước đây đã được thay thế bằng **Total Act/Forc** (Tổng chi phí thực tế / dự kiến đã phát sinh).
  - Bổ sung ô **Total Balance** (Tổng số dư chưa thanh toán còn lại của các khoản chi đối với nhà thầu), tự động đổi màu xanh lá (`emerald`) khi $\ge 0$ và màu đỏ (`red-500`) khi âm.
  - Các ô tổng quan bao gồm 4 chỉ số tài chính trọng tâm của phân hệ Chi phí:
    1. **Total Act/Forc**: Tổng giá trị thực tế/dự trù phát sinh (`totalActAll`).
    2. **Total Balance**: Tổng số dư còn phải giải ngân (`totalBalanceAll`).
    3. **Supporting Fee**: Tổng chi phí hỗ trợ (`totalSupAll`).
    4. **Total Remaining / Remaining**: Tổng ngân sách còn lại (`totalRemainingAll`), kèm nhãn *"Linked from Budget"* và cho phép nhấp vào để chuyển nhanh sang Tab Budget xem chi tiết.

### 44. Tối Ưu Nút Liên Kết Ngân Sách Trên Tab Chi Phí (Cost Tab Link to Budget Navigation)
- **Vị trí nút liên kết**: Nút icon liên kết chuyển nhanh sang tab Budget (`ExternalLink` ↗️) đã được di chuyển từ cột Mã dự án (Code) sang **cuối dòng tại cột ACTION**, đặt ngay cạnh nút `+ Add Cost`.
- **Tác dụng**: Giúp cột Code hiển thị mã dự án gọn gàng, rõ ràng và không bị che khuất; đồng thời gom nhóm toàn bộ các thao tác điều hướng và thêm chi phí vào cột Action cuối bảng tiện lợi cho người dùng thao tác.

### 45. Tối Ưu Nút Xem Chi Phí Trên Tab Ngân Sách (Budget Tab View Cost Link Relocation)
- **Vị trí nút liên kết**: Nút icon liên kết chuyển nhanh sang tab Chi phí (`ExternalLink` ↗️) trên Tab Budget đã được di chuyển từ vị trí bên cạnh Mã dự án (Code) sang **cuối dòng tại cột ACTION**, đặt ngay cạnh nút Link Budget (biểu tượng móc xích 🔗).
- **Tác dụng**: Giúp cột Code trên bảng Ngân sách hoàn toàn thông thoáng, chữ to rõ ràng, không bị chật chội; đồng thời tập trung toàn bộ nhóm thao tác liên kết (Link Budget, Unlink, View Cost Tab) về cột Action cuối dòng, mang lại trải nghiệm nhất quán giữa cả hai phân hệ Budget và Cost.

### 46. Cấu Hình Tối Ưu Desktop & Chống Ngủ Tab (Chrome & Edge Memory Saver Optimization)
- **Mục đích**: Ngăn các trình duyệt máy tính để bàn (Google Chrome & Microsoft Edge) tự động đóng băng (freezing/sleeping) hoặc giải phóng bộ nhớ (discarding) của tab Takashimaya khi người dùng chuyển sang làm việc trên các phần mềm khác (Excel, Outlook, Teams, v.v.). Giúp ứng dụng duy trì kết nối WebSocket thời gian thực liên tục, không bị giật lag, không phải reload lại trang và giữ nguyên chi phí phát sinh Firestore = 0 khi mở lại sau 15–30 phút.
- **Nút công cụ trên giao diện**:
  - Tại **Cài đặt hệ thống (Setting Tab)**, cạnh nút *Enable Push (iOS/PWA)* có nút màu tím chàm sang trọng: **Tối ưu Desktop (Chống ngủ tab)**.
  - Khi nhấp vào nút này, một cửa sổ hướng dẫn trực quan (Modal) sẽ hiện lên với:
    - **Nút 1-Click "Sao chép URL"**: Tự động copy chính xác link ứng dụng vào bộ nhớ tạm.
    - **Tab Google Chrome**: Hướng dẫn chi tiết 3 bước thêm URL vào danh sách *"Luôn duy trì các trang web này hoạt động"* (`chrome://settings/performance` ➜ Memory Saver).
    - **Tab Microsoft Edge**: Hướng dẫn chi tiết 3 bước thêm URL vào danh sách *"Không bao giờ đặt các trang web này ở chế độ ngủ"* (`edge://settings/system` ➜ Sleeping tabs).
- **Thực hiện**: Chỉ cần cấu hình 1 lần duy nhất trên máy tính văn phòng để ứng dụng hoạt động mượt mà và ổn định vĩnh viễn.

### 47. Đồng Bộ Tuyệt Đối "Total Remaining" Giữa Tab Cost và Tab Budget (Unified Budget Remaining Link)
- **Quy tắc nghiệp vụ**:
  - Chỉ số **Total Remaining** trên tab Chi phí (Cost Tab) được liên kết trực tiếp từ cấu trúc cây ngân sách chuẩn (`financialService.ts`) của tab Ngân sách (Budget Tab).
  - Công thức tính toán chuẩn xác: `Total Remaining = Total Budget - Total Actual + Total Supporting Fee`.
  - Mọi mối quan hệ liên kết cha-con (`parentId`, `linkCost`) giữa các dự án trên Budget Tab đều được tự động tính toán tổng hợp (Rollup) vào Tab Cost mà không lo bị trùng lặp ngân sách con.
- **Điểm hiển thị trên giao diện Tab Cost**:
  - **Thanh tổng kết Desktop (Desktop Summary Bar)**: Nằm ngay trên bảng chi phí, hiển thị `Total Act/Forc`, `Total Balance`, `Supporting Fee`, và `Total Remaining` kèm nhãn *"Linked from Budget"* cùng nút tắt sang Tab Budget.
  - **Dòng Total của Bảng Chi phí (Desktop Table)**: Cột `Description` hiển thị số dư `Remaining`, và cột `Action` có nút *"Budget"* để mở trực tiếp dự án tương ứng bên Tab Budget.
  - **Thẻ tổng kết Mobile/PWA (Mobile Summary Card)**: Hiển thị đầy đủ 4 chỉ số kèm nhãn *"Linked from Budget"* và cho phép chạm vào để chuyển ngay sang Tab Budget xem chi tiết.

### 48. Tiêu Đề Động Bộ Lọc Trên Bản In PDF & Xem Trước (Dynamic Header in PDF Print Output)
- **Mục đích**: Tự động hiển thị ngữ cảnh bộ lọc hiện tại bao gồm **Chi nhánh (Store: HCM / HN / All Stores)**, **Năm dự án (Year: 2026, 2027, 2028 / All Years)**, và **Mã dự án (Project Code / All Projects)** trên đầu mỗi trang của bản in PDF và màn hình Xem trước bản in (Print Preview).
- **Điểm nổi bật**:
  - **Nhận diện bộ lọc thông minh đa phân hệ**: Tự động trích xuất chính xác bộ lọc Store và Year toàn cục (hoặc theo phân quyền người dùng nếu bị giới hạn chi nhánh), cùng mã dự án đang được lọc ở từng Tab (Gantt, Detail, Cost, Layout, Budget...).
  - **Hiển thị trên bản in PDF độ nét cao (Vector Graphics)**: Khi bấm **"Print / Save PDF"**, thư viện xuất PDF sẽ tự động vẽ dải banner tiêu đề sắc nét ở đầu mỗi trang với logo Takashimaya, tên phân hệ tài liệu (Doc Type / Tab Title), và 3 huy hiệu (badges) màu sắc trực quan:
    - Huy hiệu Chi nhánh (Store): Màu xanh dương (HCM), màu đỏ hoa hồng (HN), hoặc màu xám trung tính (All Stores).
    - Huy hiệu Năm (Year): Màu tím chàm (năm cụ thể) hoặc màu xám (All Years).
    - Huy hiệu Mã dự án (Project Code): Màu cam hổ phách nổi bật (khi đang lọc riêng 1 dự án) hoặc màu xám (All Projects).
  - **Hiển thị trực tiếp trên Print Preview**: Trong giao diện xem trước bản in (Print Preview), dải banner bộ lọc hiển thị ngay phía trên nội dung trang giấy, hỗ trợ cả giao diện Sáng và Tối (Dark mode).
  - **Tùy chọn bật/tắt linh hoạt**: Trong thanh điều khiển nổi của Print Preview, bổ sung checkbox **"Show Filter Header"** (mặc định luôn BẬT) đặt ngay phía trên checkbox "Show Date". Người dùng có thể tùy ý tích chọn để bật hoặc tắt tiêu đề bộ lọc này theo nhu cầu in ấn thực tế.

### 49. Quản Lý & Xóa Sub-task Trùng Lặp Trong Tracker Của Project (Delegation Sub-task Deletion & Clean-up)
- **Tình huống trùng lặp**:
  - Khi một công việc được ủy quyền hoặc gán thêm bên phụ trách, có thể xuất hiện 2 sub-task được giao cho cùng một bên nhận việc (ví dụ cùng `To: CP`, một dòng đã `Accepted / On process` và một dòng còn `Assigned / State...`).
- **Thao tác xóa nhanh trực tiếp trên Tracker**:
  - Trong cửa sổ chi tiết dự án (**Project Details > Tracker**), ở mỗi dòng nhiệm vụ con (Sub-task) được giao, tài khoản Admin hoặc người tạo ủy quyền (`createdBy`) sẽ thấy một biểu tượng thùng rác nhỏ màu xám (khi di chuột / chạm vào sẽ chuyển màu đỏ).
  - Nhấp vào biểu tượng thùng rác của dòng sub-task thừa để xóa riêng lẻ dòng đó mà không làm mất các sub-task khác hoặc làm hủy toàn bộ nhóm ủy quyền của dự án.
- **Công cụ tự động quét và gộp (Deduplicate) trong Cài đặt**:
  - Trong **Setting Tab**, nút **"Dọn dẹp bản ghi Ủy quyền trùng lặp"** đã được nâng cấp: Tự động phát hiện các sub-task trùng lặp cùng một bên nhận việc (`party`) trên cùng một công việc, giữ lại bản ghi có tiến độ cao hơn hoặc có báo cáo/đính kèm mới nhất và loại bỏ các dòng `Assigned` thừa.

### 50. Quy Chuẩn 1 Delegation Duy Nhất Cho Mỗi Công Việc Đa Đơn Vị (Single Delegation Per Multi-Party Task)
- **Quy tắc nghiệp vụ**:
  - Đối với các công việc phân công cho nhiều đơn vị cùng phối hợp thực hiện (ví dụ trường `Party` của công việc gồm nhiều đơn vị như `KSM-01, Con1`), hệ thống **chỉ tạo và duy trì đúng 1 delegation duy nhất** cho công việc đó, không sinh ra nhiều thẻ ủy quyền hoặc nhiều dòng nhiệm vụ con thừa thãi.
  - **Đơn vị nhận việc (`party` / `To:` trong delegation)**: Tự động trích xuất từ bên phụ trách của công việc/task con (có thể lấy bất kỳ một party nào trong danh sách được giao, ví dụ đơn vị đầu tiên `KSM-01`).
- **Cơ chế hoạt động**:
  - **Khi bật Ủy quyền trong Detail Tab**: Hệ thống tự động phân tách chuỗi đơn vị của công việc và khởi tạo đúng 1 bản ghi nhiệm vụ con với đơn vị nhận việc tương ứng.
  - **Khi thêm nhiệm vụ ủy quyền trong Task Delegation Tab**: Ngăn chặn việc bấm thêm bản ghi ủy quyền trùng lặp cho công việc đã tồn tại delegation.
  - **Công cụ Dọn dẹp trong Cài đặt (Setting Tab)**: Khi chạy tính năng *"Dọn dẹp bản ghi Ủy quyền trùng lặp"*, hệ thống sẽ tự động rà soát toàn bộ các nhóm ủy quyền cấp task; nếu một task có nhiều hơn 1 sub-task do giao đa bên (như `Hoarding: To: KSM-01` và `To: Con1`), hệ thống sẽ giữ lại bản ghi tối ưu nhất (ưu tiên trạng thái đang thực hiện hoặc cập nhật mới nhất) và gộp lại thành 1 delegation duy nhất chuẩn chỉnh.






### 51. Công Cụ Chuyển Đổi Dữ Liệu Taka Data Converter (Tạo File Import Định Dạng Chuẩn)
- **Mục đích**: Hỗ trợ người dùng chuẩn hóa các file dữ liệu thô (từ Excel hoặc các nguồn khác) thành định dạng chuẩn với đầy đủ các trường cấu trúc của hệ thống Takashimaya, giúp việc import (Mass Upload) diễn ra nhanh chóng, chính xác tuyệt đối mà không cần nhập tay hay sửa lỗi thủ công.
- **Truy cập**: Đi tới menu **Help** (nút Trợ giúp) > Chọn tab **Import csv** (Taka Data Converter).
- **Cơ chế hoạt động**:
  - **Hỗ trợ 10 loại dữ liệu (Tab cấu hình riêng)**: Tương ứng với từng phân hệ (Project, Task detail, Budget, Cost, Investment, Mass-import Task, Brand, Sales, Profit, Size Unit). Chọn đúng tab để nạp bộ khung chuẩn tương ứng.
  - **Mapping Cột (Ghép nối linh hoạt)**: Khi tải lên một file `.xlsx` hoặc `.csv` bất kỳ, hệ thống sẽ cố gắng tự động nhận diện các cột dữ liệu tương đồng. Nếu sai lệch, người dùng có thể tự do gán ghép các cột từ file gốc vào cột chuẩn của hệ thống (Ví dụ: cột "Mã" trong file Excel của bạn sẽ được ép kiểu thành cột "code" của hệ thống).
  - **Giá Trị Tĩnh (Constant Mapping)**: Nếu muốn ép một cột toàn bộ đều mang chung 1 giá trị (ví dụ: cột `store` tất cả đều là `HCM`, hoặc muốn xóa toàn bộ `comments` bằng 1 dấu cách), bạn chỉ cần gõ vào ô "Giá trị tĩnh...".
  - **Tính năng "Giữ nguyên" (Dành riêng cho Import Tasks)**: Đối với các cột đặc thù như `Predecessor` hay `Task code phụ`, hệ thống mặc định sẽ tự động dán tiền tố `Project Code` vào phía trước dữ liệu (VD: 23 ➜ VN26-23) để đảm bảo ràng buộc logic toàn vẹn. Nếu dữ liệu của bạn đã được format chuẩn sẵn (VD: file tải xuống trực tiếp từ hệ thống), hãy tích chọn checkbox **"Giữ nguyên"** để bỏ qua bước dán mã tự động này.
- **Xuất bản và File Hướng Dẫn Kèm Theo (Method Sheet)**:
  - Xem trước 10 dòng đầu tiên của dữ liệu đã được xào nấu và chuyển đổi cấu trúc (Bảng xem trước).
  - Chọn nút **Tải xuống Excel** để lấy file thành phẩm.
  - **Lưu ý đặc biệt**: Dù ứng dụng tên là CSV Converter, nhưng hệ thống sẽ **xuất ra một file Excel đa trang (.xlsx)**. File này bao gồm 2 Sheet:
    1. **Sheet Data**: Dữ liệu chuẩn đã được chuyển đổi.
    2. **Sheet Method**: Bản ghi chú giải thích quy tắc, định dạng (Date format) và các hướng dẫn chuyên sâu (như cách xóa comments) cho loại dữ liệu bạn đang thao tác.
  - **Thao tác Import vào Hệ Thống**: Để Import file vừa tải xuống vào các bảng Gantt Tab hay Project Tracker của Takashimaya, bạn hãy mở file Excel này, chọn Sheet Data và chọn lệnh **Save As ➜ CSV (Comma delimited)** để lấy file dạng `.csv` thuần túy, sau đó upload như bình thường.
  - **Cơ chế ghi nhận người Import (User Attribution)**: Khi bạn Import file CSV có chứa nội dung ghi chú/trao đổi (cột `comments`), hệ thống tự động ghi nhận chính xác tên và ID của người dùng đang đăng nhập thực hiện thao tác Import (`userName`, `userId`), hiển thị đúng tên người dùng trong lịch sử Task Chat thay vì hiển thị "Unknown". Nếu nội dung comment có dạng `[Tên Người]: [Nội dung]`, hệ thống sẽ tự động ghép với tài khoản người dùng tương ứng trong hệ thống.

### 52. Bộ Lọc Ngày (Date Filter) & Tối Ưu Thu Gọn Header Tại Tab Gantt
- **Mục đích**: Tối ưu không gian hiển thị của thanh công cụ trên thiết bị di động (giảm bớt hàng ngang chiếm diện tích) và cung cấp bộ lọc khoảng thời gian trực quan, tập trung vào các công việc đang diễn ra.
- **Vị trí nút bấm**: Nút **Date Filter** (biểu tượng cuốn lịch 📅) được bố trí ngay trên thanh công cụ chính của Tab Gantt (thay thế vị trí của nút Edit Mode trước đây, đứng ngay trước nút `+ Add Column`). Điều này giúp gộp Date Filter vào cùng hàng với các công cụ thay vì nằm riêng một hàng, giúp thu gọn chiều cao của header trên di động.
- **Chế độ Edit Mode**: Vẫn được duy trì đầy đủ và tiện lợi thông qua nút nổi **Edit Mode** (biểu tượng cây bút xanh) ở góc trên bên phải thanh sticky header.
- **Cách sử dụng Bộ lọc Ngày**:
  - Nhấp vào nút **Date Filter** ngay cạnh nút `+ Add Column` để mở popover chọn ngày.
  - Chọn **Start Date** (Ngày bắt đầu) và/hoặc **Finish Date** (Ngày hoàn thành).
  - Hệ thống tự động lọc mượt mà: biểu đồ Gantt sẽ lọc giữ lại các dự án và task có thời gian giao thoa với khoảng ngày đã chọn; những dự án không có task nào trong khoảng này sẽ tự động ẩn đi.
  - Khi có bộ lọc ngày đang kích hoạt, nút Date Filter sẽ chuyển sang màu xanh dương nổi bật kèm dấu chấm tròn báo hiệu. Để hủy bộ lọc, chỉ cần mở popover và bấm nút **Clear**.

### 53. Chế Độ Toàn Màn Hình Mặt Bằng (Layout Focus Fullscreen) & Thao Tác Vuốt Lên Để Tắt
- **Mục đích**: Mang lại trải nghiệm xem bản đồ mặt bằng (Layout/Floor plan) nhanh chóng, trực quan và tiện dụng trên thiết bị di động cũng như máy tính bảng.
- **Cách mở chế độ Focus Toàn Màn Hình**: Nhấp đúp (Double-tap / Double-click) trực tiếp vào hình ảnh mặt bằng tại tab Layout.
- **Thao tác cử chỉ thông minh (Gesture Controls)**:
  - **Vuốt lên bằng 1 ngón tay (Swipe Up to Dismiss)**: Khi đang ở mức xem bình thường (scale = 1), bạn chỉ cần dùng 1 ngón tay vuốt nhẹ hình ảnh lên phía trên màn hình, hình sẽ trượt mượt mà theo tay bạn và tự động đóng chế độ toàn màn hình.
  - **Chống xung đột hoàn toàn với Zoom 2 ngón tay (Anti-Conflict with Pinch Zoom)**: 
    - Khi bạn đặt 2 ngón tay lên màn hình để phóng to (Zoom In) hoặc thu nhỏ (Zoom Out), hệ thống sẽ lập tức nhận diện cử chỉ 2 ngón tay và **vô hiệu hóa hoàn toàn thao tác vuốt tắt**, giúp bạn thoải mái co giãn bản vẽ mà không lo bị đóng nhầm.
    - Khi hình ảnh đang được phóng to (Zoom > 1.05), thao tác di chuyển 1 ngón tay sẽ dùng để kéo xem các vị trí chi tiết của bản vẽ (Pan), không kích hoạt thao tác tắt. Thao tác vuốt lên để tắt chỉ có hiệu lực khi hình ảnh ở kích thước toàn cảnh ban đầu.
  - **Phóng to nhanh**: Bạn vẫn có thể chạm đúp (Double-tap) bằng 1 ngón tay để phóng to nhanh vào tâm điểm và chạm đúp lần nữa để đưa về kích cỡ ban đầu.
  - **Nút đóng truyền thống**: Biểu tượng nút **X** ở góc trên bên phải vẫn luôn sẵn sàng để bạn thoát bất cứ lúc nào.

### 54. Chuẩn Hóa Phím Escape (Esc) Cho Toàn Bộ Cửa Sổ & Dấu "X" Trên Toàn Ứng Dụng (Universal Escape Key)
- **Mục đích**: Tối ưu hóa trải nghiệm thao tác bàn phím chuyên nghiệp (Power User Experience) và tính nhất quán, đảm bảo ở bất kỳ màn hình, cửa sổ popup, modal hoặc thanh trượt nào có dấu **"X"** (đóng), người dùng chỉ cần nhấn phím **`Esc`** là có thể đóng lại ngay lập tức tương đương với việc click vào dấu "X".
- **Phạm vi hỗ trợ toàn diện**:
  1. **Cửa sổ Dự án & Công việc (Project & Task Modals)**: Đóng nhanh cửa sổ chỉnh sửa/tạo mới ProjectModal và TaskModal.
  2. **Hộp thoại Xác nhận & Cảnh báo (Confirm Modal)**: Đóng và hủy bỏ (Cancel) các hộp thoại xác nhận xóa dự án, xóa task, xóa comment, xác nhận chuyển đổi...
  3. **Cửa sổ Phím tắt & Hướng dẫn (Shortcuts & App Tour)**: Nhấn `Esc` để đóng nhanh cửa sổ phím tắt hoặc tắt hướng dẫn giới thiệu người mới.
  4. **Cửa sổ Quản lý Tài khoản & Đăng nhập (User & Login Modals)**: Đóng nhanh cửa sổ thông tin tài khoản cá nhân hoặc popup đăng nhập.
  5. **Mặt bằng toàn màn hình (Layout Tab Fullscreen & Edit URL)**: Thoát nhanh chế độ Focus xem ảnh toàn màn hình hoặc hủy bỏ chế độ chỉnh sửa đường dẫn bản vẽ.
  6. **Cửa sổ Camera & QR Code (QR Scanner & QR Generator)**: Đóng nhanh camera quét mã QR và popup hiển thị mã QR.
  7. **Cửa sổ Ghi chú Công việc (Task Note Modal)**: Đóng popup danh sách ghi chú hiện trường.
  8. **Bảng Liên kết Ngân sách (Project Modular - Link Budget)**: Đóng nhanh popup liên kết dự án con vào dự án cha trong Tab Budget.
  9. **Bảng Hiệu năng Firestore & Tùy chọn In ấn (Performance Dashboard & Print Options)**: Đóng nhanh bảng giám sát lượt đọc Firestore hoặc popup cấu hình in ấn.
  10. **Menu Điều hướng & Bộ lọc (Navigation Drawer & Date Filter)**: Đóng menu điều hướng di động hoặc popover bộ lọc ngày.
- **Cơ chế phân lớp thông minh (Layered Event Propagation)**: Khi có nhiều lớp cửa sổ lồng nhau (ví dụ: đang mở TaskModal và hiện thêm hộp thoại ConfirmModal), nhấn `Esc` sẽ đóng hộp thoại phía trên trước, không làm tắt nhầm cửa sổ bên dưới.

### 55. Tính Năng Task Modular (Gom Nhóm Task Con Vào Task Mẹ & Thu Gọn/Mở Rộng Tại Tab Gantt)
- **Mục đích**: Cho phép gom các công việc con (Sub-tasks) vào một công việc chính (Task Mẹ) ngay trên biểu đồ Gantt tương tự tính năng Project Modular của Tab Budget, giúp biểu đồ Gantt gọn gàng, tổ chức cây công việc trực quan và dễ quản lý.
- **Phạm vi áp dụng**: Tính năng này được triển khai độc lập tại **Tab Gantt**, không làm ảnh hưởng đến cấu trúc hoặc dữ liệu hiển thị ở các tab khác.
- **Căn chỉnh thẳng cột & Tối ưu kích thước chống dịch dòng (Zero Layout Shift)**:
  - Cột nút bấm sổ Task Modular (Expand/Collapse) của Task Mẹ và biểu tượng rẽ nhánh của Task Con (`↳`) được đưa ra **cùng cột cố định với nút sổ của toàn bộ dự án** (ngay sau checkbox/nút ẩn).
  - Loại bỏ hoàn toàn khoảng thụt lề thừa và các badge cồng kềnh, kích cỡ nút được tối ưu siêu nhỏ gọn (`h-5 min-w-[24px]`) vừa khít với cột, giúp tên công việc có không gian hiển thị rộng rãi tối đa, **hoàn toàn không bị dịch dòng, rớt chữ hay chật chội**.
- **Quy Tắc 1 Lớp Duy Nhất & Tự Động Gom Chuyển Task Con (Strict 1-Level Modular & Auto Re-parenting)**:
  - Hệ thống áp dụng nghiêm ngặt **cấu trúc 1 lớp duy nhất (Single-layer hierarchy)**: Không cho phép tạo các nhóm lồng nhau đa tầng (task mẹ lồng trong task mẹ khác).
  - Khi một task mẹ đã có sẵn các task con được chọn để gộp vào một task mẹ mới khác:
    - Hệ thống sẽ **tự động gom toàn bộ các task con của task mẹ đó chuyển vào chung cùng task mẹ mới**.
    - **Hủy bỏ hoàn toàn liên kết cũ**: Task mẹ ban đầu trở thành một task con bình thường dưới task mẹ mới, và toàn bộ đàn task con cũ của nó cũng trở thành các task con trực tiếp dưới task mẹ mới (cùng cấp, 1 lớp duy nhất).
    - Cửa sổ Task Modular hiển thị thông báo trực quan cảnh báo quy tắc 1 lớp và thống kê chi tiết số task kèm theo `(+N sub kèm theo)`.
  - Danh sách Task Mẹ ứng viên bên phải tự động ẩn đi những task đang là con của task khác, đảm bảo chỉ có task cấp gốc (root tasks) mới được chọn làm task mẹ.
- **Cách sử dụng**:
  1. **Bật Chế độ Chỉnh sửa (Edit Mode)**: Nhấn biểu tượng cây bút xanh ở góc trên thanh công cụ của Tab Gantt.
  2. **Chọn các Task con cần gom**: Tích chọn vào ô checkbox trước các nhiệm vụ muốn gom nhóm.
  3. **Mở cửa sổ Task Modular**: Nhấn nút **Task Modular** (biểu tượng hộp xếp lớp `Layers` màu tím) xuất hiện trên thanh công cụ.
  4. **Chọn Task Mẹ và Xác nhận**: Chọn task mục tiêu để gom các task con vào, sau đó nhấn **Gom vào Task Mẹ**. Toàn bộ thay đổi cập nhật tức thì (Optimistic UI) với độ trễ bằng 0.
  5. **Nút Thu Gọn / Mở Rộng (Expand / Collapse)**:
     - Tại dòng của Task Mẹ trên biểu đồ Gantt, nút huy hiệu mũi tên tím nhỏ gọn kèm số lượng task con (ví dụ: `▼ 4` khi mở rộng hoặc `▶ 4` khi thu gọn) nằm thẳng hàng với nút sổ dự án, cho phép ẩn/hiện danh sách task con chỉ bằng một cú nhấp.
     - Các task con hiển thị biểu tượng nhánh `↳` sắc nét ngay tại cùng cột.
     - Trong Edit Mode, khi rê chuột vào biểu tượng `↳` của task con sẽ xuất hiện biểu tượng **Unlink** màu đỏ để tách nhanh khỏi task mẹ chỉ bằng một click.
     - Khi sử dụng thanh tìm kiếm, nếu từ khóa khớp với task con đang bị ẩn, hệ thống sẽ tự động bung mở nhóm đó ra ngay lập tức để người dùng không bỏ sót thông tin.


   6. **Mũi Tên Tím Mở Rộng / Thu Gọn Toàn Bộ Task Modular (Expand/Collapse All Modular Tasks)**:
      - Tại góc trên cùng của bảng Gantt (tiêu đề cột `PROJECT / TASK`), ngay **phía dưới mũi tên mở rộng/thu gọn toàn bộ Dự án**, hệ thống đã bổ sung thêm **1 mũi tên màu tím**.
      - **Chức năng**:
        + Khi nhấp vào mũi tên tím: Toàn bộ các Task Mẹ (Modular Tasks) trên bảng biểu đồ Gantt sẽ đồng loạt được mở rộng ra (hiển thị toàn bộ các task con) hoặc thu gọn lại (ẩn toàn bộ các task con) chỉ với 1 cú click.
        + Nếu các Dự án chứa Task Modular đang bị thu gọn, khi bấm mở rộng toàn bộ Task Modular, hệ thống sẽ tự động mở rộng các dự án đó để các task con lập tức xuất hiện trực quan.
        + Trạng thái biểu tượng tự động đổi chiều (Mũi tên chỉ xuống `▼` khi đang mở rộng với nền tím đậm và Mũi tên chỉ sang phải `▶` khi đang thu gọn với nền tím nhạt và viền tím nổi bật) cùng hiệu ứng phản hồi cảm ứng 0ms (`active:scale-90 touch-manipulation`). Nút luôn được tô màu tím trực quan ở cả 2 trạng thái thu gọn và mở rộng.

### 56. 🍎 ĐỒNG BỘ TRỰC TIẾP VỚI APPLE CALENDAR (iOS / iPadOS / macOS iCal & Webcal Feed)
Hệ thống hỗ trợ cơ chế đồng bộ trực tiếp lịch trình dự án vào ứng dụng **Lịch (Apple Calendar)** mặc định của iPhone, iPad và máy tính Mac theo chuẩn quốc tế RFC 5545 (iCalendar / Webcal).

- **Vị trí mở tính năng**:
  1. **Từ thanh Header**: Nhấn biểu tượng Menu (3 dấu gạch ngang) ➜ Chọn **"Đồng bộ Apple Calendar (iOS)"**.
  2. **Từ Tab Calendar**: Nhấn nút màu đỏ **"Apple Calendar (iOS)"** nằm ngay cạnh nút Export ICS trên thanh công cụ.

- **Các phương thức kết nối linh hoạt**:
  1. **Phương thức 1: 1-Chạm trên iPhone / iPad (Khuyên dùng)**:
     - Mở ứng dụng trên trình duyệt Safari của iPhone/iPad.
     - Mở cửa sổ "Đồng bộ Apple Calendar (iOS)" ➜ Nhấn nút **"Mở đăng ký trên Apple Calendar"**.
     - Hệ thống kích hoạt giao thức `webcal://`, ứng dụng Lịch của iOS sẽ tự động bật lên với hộp thoại: *"Bạn có muốn đăng ký lịch này không?"*.
     - Nhấn **Đăng ký (Subscribe)** và chọn tần suất tự động cập nhật là **Mỗi giờ (Hourly)** hoặc **Hàng ngày (Daily)**.
  2. **Phương thức 2: Quét mã QR từ màn hình Máy tính sang iPhone**:
     - Khi đang sử dụng máy tính PC / Laptop, mở tab **"Quét mã QR iPhone"**.
     - Mở ứng dụng **Camera** trên iPhone và hướng ống kính vào mã QR trên màn hình.
     - Một thông báo màu vàng *"Mở trong Lịch"* sẽ lập tức xuất hiện trên màn hình iPhone.
     - Chạm vào thông báo và nhấn **Đăng ký** để hoàn tất trong 3 giây.
  3. **Phương thức 3: Thêm thủ công qua Cài đặt iOS**:
     - Nhấn nút **"Chép link"** tại mục URL Webcal.
     - Mở **Cài đặt (Settings)** trên iPhone ➜ Chọn **Lịch (Calendar)** (trên iOS 18: vào *Ứng dụng ➜ Lịch*).
     - Chọn **Tài khoản Lịch (Calendar Accounts)** ➜ Nhấn **Thêm tài khoản (Add Account)** ➜ Chọn **Khác (Other)**.
     - Chọn **Thêm lịch đã đăng ký (Add Subscribed Calendar)** ➜ Dán link đã sao chép vào ô **Máy chủ (Server)** ➜ Nhấn **Tiếp tục** ➜ Bấm **Lưu**.
  4. **Phương thức 4: Tải file .ics độc lập**:
     - Nhấn **"Tải file .ics"** để lưu file lịch về máy hoặc chạm mở trực tiếp trên iPhone để thêm ngay lập tức toàn bộ sự kiện hiện tại vào danh bạ lịch của máy.

- **Bộ lọc thông minh trước khi đồng bộ**:
  - Hỗ trợ lọc theo chi nhánh: **Tất cả (HCM & HN)**, **Chỉ Takashimaya HCM**, hoặc **Chỉ Takashimaya HN**.
  - Hỗ trợ lọc theo năm: **Tất cả các năm**, **2026**, **2027**, **2028**...
  - Hỗ trợ phạm vi: **Tất cả công việc** hoặc **Chỉ công việc tôi phụ trách** (dựa theo tên / email tài khoản đang đăng nhập).
  - Tùy chọn ẩn/hiện **Mốc dự án chính** và **Task con**.

- **Cơ chế cập nhật tự động (Auto-Refresh)**:
  - Nút **"Làm mới nguồn lịch"**: Bất kỳ khi nào có thay đổi tiến độ hoặc dự án mới, người dùng chỉ cần nhấn nút này để hệ thống biên dịch và xuất bản ngay bản cập nhật lên máy chủ đám mây.
  - Ứng dụng Lịch trên iOS sẽ tự động làm mới theo chu kỳ đã chọn và hiển thị đầy đủ thông tin ra **Widget Lịch trên Màn hình chính (Home Screen Widget)**, Màn hình khóa và **Apple Watch**.


### Dọn Dẹp File Vật Lý (Deep Clean Storage)
Khi xóa các Task, Cost hoặc Project (bằng cách xóa đơn lẻ hoặc xóa hàng loạt trên Gantt Chart), hệ thống sẽ tự động đưa các bản ghi vào trạng thái "Soft Delete" (xóa mềm).
Tuy nhiên, nếu các tác vụ hoặc chi phí này có **đính kèm file tài liệu, hình ảnh**, hệ thống sẽ lập tức quét và xóa các file vật lý này khỏi Firebase Storage để tối ưu dung lượng (Zero-waste storage).

Để dọn dẹp hoàn toàn các bản ghi rác đã quá 60 ngày:
1. Vào tab **Settings**.
2. Tìm nút **Purge Tombstones (> 60 days)**.
3. Click để dọn dẹp vĩnh viễn dữ liệu rác, kèm theo dọn dẹp sạch sẽ các file mồ côi trên Cloud Storage nếu có.

---

## ⚡ 14. KIẾN TRÚC HIỆU NĂNG & TỐI ƯU HỆ THỐNG (ENTERPRISE ARCHITECTURE)
Hệ thống tuân thủ nghiêm ngặt các quy tắc kiến trúc chuẩn Enterprise quy định tại `AGENTS.md`:
* **Zero-Delay Optimistic UI**: Thao tác lưu/sửa/xóa phản hồi tức thì dưới 0ms, cập nhật trực tiếp vào Global State (Zustand) và đóng Modal ngay lập tức; thao tác đồng bộ mạng (Firestore) được thực hiện ngầm ở background.
* **Safe Boot Protocol**: Ứng dụng luôn khởi động an toàn tại phân hệ `general` (Tổng quan), không ghi nhớ tab nhạy cảm vào cache để đảm bảo tính sẵn sàng.
* **Decoupled Modal Host (`<AppModals />`)**: Hệ thống cửa sổ giao tiếp (Login, Project, Task, User, Calendar Sync) được đóng gói tách biệt hoàn toàn khỏi vòng đời kết xuất (render tree) của các tab làm việc chính. Giúp các phân hệ xử lý nặng như Gantt Chart, Chi tiết công việc và Mặt bằng không bị kích hoạt re-render ngoài ý muốn khi mở modal.
* **Tri-Gate Lazy Loading & Anti-Read-Storm**: Chỉ nạp dữ liệu Công việc (Tasks), Chi phí (Costs) và Phân công (Delegations) khi người dùng mở tab tương ứng. Sử dụng multi-listener pooling giữ delta-sync giá rẻ, ngăn chặn việc đọc lặp lại dữ liệu từ Firestore. Đặc biệt, cơ chế nạp ngầm công việc tự động đồng bộ theo toàn bộ dự án hiển thị trên màn hình (`visibleActiveProjectIds`) theo các điều kiện lọc (Năm, TTTM, Vị trí, Trạng thái, Tìm kiếm), đảm bảo nút sổ xuống và số lượng công việc con luôn hiển thị chính xác ngay lập tức.
* **Bảo vệ toàn vẹn Dữ liệu (Runtime Schema Validation)**: Tích hợp thư viện Zod kiểm soát trực tiếp tại tầng Firebase wrapper (`setDoc`, `updateDoc`, `writeBatch`). Dữ liệu bất thường hoặc sai quy tắc nghiệp vụ sẽ bị chặn ngay tại Client trước khi gửi lên Cloud Firestore.
* **Kiến trúc Zustand Slices (Bound-Store Pattern)**: Module hóa State thành các slices độc lập (`createUISlice`, `createDataSlice`, `createOptimisticSlice`) và tách biệt Interface kiểu tĩnh (`storeTypes.ts`) giúp ngăn ngừa xung đột mã nguồn và tối ưu hiệu suất render.
* **Cơ chế Tiết Kiệm Ghi Firestore 2 Lớp (Dirty Check Write Optimization)**: Khi người dùng chỉnh sửa công việc (Task), hệ thống tự động kiểm tra xem các mốc thời gian (`start`, `finish`), trạng thái hoàn thành (`isCompleted`, `status`), số lượng công việc con (`taskCount`) hoặc tiến độ (`progress %`) có thực sự thay đổi hay không. Nếu người dùng chỉ cập nhật bình luận (comments), chỉnh sửa mô tả tên công việc, ghi chú hoặc phân công mà không làm thay đổi các mốc ngày/tiến độ tổng hợp, hệ thống sẽ tự động bỏ qua lệnh ghi vào document dự án tổng hợp (`taka_projects`) trên Firestore (đạt 0 write cho Project), trong khi vẫn duy trì cập nhật giao diện tức thời (Optimistic UI 0ms).
* **Bộ Đệm Cấu Hình Tĩnh & Theo Dõi Phiên Bản (Static Config Cache + Versioning)**: Các danh mục cấu hình ít biến động (`taka_locations` - Danh sách chi nhánh/vị trí, `taka_parties` - Đối tác, `taka_settings/exchange_rates` - Tỷ giá JPY/USD, `taka_rules` - Quy tắc thông báo) được lưu sẵn trong bộ nhớ đệm cục bộ (`localStorage`), giúp ứng dụng khởi động tức thì với **0 Read và 0ms độ trễ**. Hệ thống chỉ duy trì 1 listener phiên bản cực nhẹ (`taka_config/versions`). Khi Quản trị viên (Admin) thay đổi cấu hình, cờ phiên bản tương ứng sẽ được nâng lên, kích hoạt các máy trạm khác tải lại đúng danh mục bị thay đổi trong tích tắc mà không cần lắng nghe liên tục 4 collection riêng biệt.

