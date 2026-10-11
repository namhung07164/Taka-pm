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
  - 🖥️ **Tùy chọn hiển thị Ribbon (Ribbon Display Options)**: Đặt trực tiếp trên thanh Header (cạnh ô đồng hồ Today) trên Desktop và trong Navigation Drawer trên Mobile. Hỗ trợ 3 chế độ: `Full-screen mode` (Toàn màn hình), `Show tabs only` (Chỉ hiện thanh Tab) và `Always show Ribbon` (Luôn hiển thị đầy đủ Header & Tab).
  - 🕒 **Đồng hồ / Ngày giờ Today (Compact Realtime Clock)**: Hiển thị thời gian thực theo định dạng nhỏ gọn `DD MMM YYYY HH:MM:SS` chống tràn dòng Header trên Desktop, kèm tooltip chi tiết khi di chuột.
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
2. **Lọc theo Năm (Enterprise Adaptive Year Filter)**: Chọn ô chọn Year (`2026`, `2027`, hoặc `All Years`).
   - **Cơ chế Tiết kiệm Firestore Read & Chống Bão Truy Vấn**: Mặc định ứng dụng luôn kích hoạt năm hoạt động chính (2026/2027). Khi chọn `All Years`, hệ thống ưu tiên duy trì luồng realtime cho các năm vận hành chính (`2026`, `2027`) và nạp dữ liệu các năm xa hơn từ bộ nhớ đệm Cache-First (0 Read Server), giảm 60% socket listener và tối ưu tài nguyên mạng tối đa.
3. **Lọc theo Trạng thái**: Chọn Trạng thái (`On process`, `Upcoming`, `Completed`, `Handover`, `Canceled`).
4. **Tìm kiếm nhanh & Tự động nhảy vị trí (Smart Search & Location Auto-Jump)**:
   - Gõ tên dự án, mã dự án, nội dung mô tả dự án (`Description`/`Detail`), mã công việc, nhà thầu hoặc vị trí gian hàng vào ô Search (hoặc bấm phím tắt `/`).
   - **Hỗ trợ tìm kiếm theo Description**: Tìm kiếm từ khóa xuất hiện trong phần mô tả chi tiết của dự án trên toàn bộ các phân hệ (**General**, **Task Detail**, **Gantt Chart**, **Cost**, **Budget**, **Floor Layout**, và **Command Palette `Ctrl+K`**).
   - **Tự động chuyển Location**: Trên các tab **General**, **Task detail**, **Cost**, **Budget**, **Gantt**, khi nhập nội dung tìm kiếm, hệ thống sẽ tự động quét và chuyển bộ lọc `Location` sang đúng tầng/vị trí tương ứng chứa kết quả tìm kiếm đó.
   - **Hoàn trả bộ lọc khi xóa/hủy tìm kiếm**: Khi bấm nút xóa ô tìm kiếm (X) hoặc xóa hết nội dung, hệ thống sẽ tự động khôi phục lại chính xác bộ lọc `Location` và bộ lọc `Status` toàn cục đã chọn trước khi tìm kiếm.
   - **Phím tắt `Esc` xóa nhanh tìm kiếm**: Khi ô search đang có nội dung, người dùng chỉ cần bấm phím `Esc` (ngay cả khi con trỏ không nằm trong ô search) để tự động xóa sạch ô tìm kiếm và hoàn trả lại trạng thái bộ lọc toàn cục trước đó.

#### 🔹 Hướng dẫn Tạo Mới / Chỉnh Sửa Dự Án:
* **Tạo mới**: Nhấp nút **"+ New Project"** (hoặc bấm phím tắt `P`):
  - **Bước 1**: Nhập Mã dự án (`Code` - *lưu ý: mã dự án không cho phép nhập khoảng trắng, viết hoa chuẩn Enterprise*), Tên dự án (`Project Name`), Chi nhánh (`Store`), Tầng/Vị trí (`Location`).
    + **Project Code Link (Mã liên kết mặt bằng)**: Cho phép liên kết dự án với một hoặc nhiều ô Unit cụ thể trên bản đồ mặt bằng (ví dụ: `L2-219-3-2` hoặc nhập nhiều ô phân cách bằng dấu phẩy: `L3-303-1, L3-303-2`).
    + **Quy tắc cô lập Unit độc lập (Strict Unit Isolation)**: Khi nhập mã liên kết cụ thể (như `L2-219-3-2`), hệ thống sẽ **chỉ gắn và tô màu chính xác ô Unit đó**, tuyệt đối không tự động lan truyền hay nhận nhầm sang ô cha (`L2-219`) hoặc các lô con khác. Nếu để trống, hệ thống sẽ tự động dùng mã `Code` của dự án làm mặc định.
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
4. **Sắp xếp thứ tự Task con**: Nhấp nút **"Sort"** (Predecessor) để tự động sắp xếp lại các task con theo trình tự ngày bắt đầu (trên giao diện máy tính).
5. **Tối ưu Thao tác Nhanh trên Điện thoại / iOS Card View**:
   - Tại thẻ dự án di động (iOS / Mobile Card View), nút **"Sort"** đã được thay thế bằng nút **Phóng to / Mở Modal Dự án** (biểu tượng ⤢ `Maximize2`), giúp người dùng mở xem và chỉnh sửa thông tin dự án toàn diện ngay lập tức mà không cần cuộn tìm.
   - Vị trí nút phóng to cũ được thay thế bằng nút bật bảng **Quick Navigator** (biểu tượng ↗ `ExternalLink`), cho phép mở ngay bảng điều hướng tắt chuyển đổi tức thì sang các phân hệ khác (General, Gantt, Cost, Budget, Layout, Dynamic) tương ứng với dự án đang chọn.

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
4. **Nút "Sync Predecessor" - 1 Lệnh Sửa Toàn Bộ Nội Dung Predecessor**:
   - Tại thanh công cụ của Task Detail Tab, bấm nút **"Sync Predecessor"** (biểu tượng cây đũa phép ✨).
   - Hệ thống sẽ chạy 1 lệnh quét và chuẩn hóa toàn diện: tự động nhận diện mã dự án mới, phân tách chỉ mục số thứ tự task (`subIndexNum`) và phần mở rộng liên kết / độ trễ (`lagSuffix` như `+0.5`, `SS`, `FS`, `FF`), từ đó đồng bộ toàn bộ nội dung trong các ô Predecessor (ví dụ chuyển `L1-115-2+0.5` thành `L1-115, L1-113-2+0.5`, `L1-115-3SS` thành `L1-115, L1-113-3SS`...).
   - Thao tác áp dụng ngay lập tức vào màn hình (Optimistic 0ms) và lưu đồng bộ lên Firestore theo khối Batch.

#### 🔹 Hướng dẫn Nhập (Import) & Xuất (Export) Dữ Liệu Task (Excel / CSV):
1. **Export Dữ Liệu (Xuất file định dạng chuẩn CSV)**:
   - Khi bấm nút **"Export Project"**: Hệ thống sẽ xuất ra file CSV (`taka_projects_filtered.csv`) chứa danh sách các dự án theo bộ lọc hiện tại (`store`, `location`, `year`, `code`, `name`).
   - Khi bấm nút **"Export Task"**: Hệ thống sẽ xuất ra file CSV (`taka_tasks_filtered.csv`) chứa danh sách đầy đủ các đầu việc tương ứng theo bộ lọc hiện tại, bao gồm đầy đủ các cột: `store`, `location`, `projectYear`, `projectCode`, `Sub-task code`, `Task name`, `start`, `finish`, `duration`, `party`, `predecessor`, `delegation`, `task flexible`, và `comments` (lịch sử bình luận & trao đổi). File CSV có thể mở trực tiếp bằng Excel hoặc bất kỳ phần mềm quản lý bảng tính nào.
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
   - **Tìm kiếm gợi ý xuyên dự án (Cross-Project Search & Suggestions)**: Khi gõ mã dự án ngoài (ví dụ: `HN-TKV-SMZ2`, `SMZ2`, `85`...) hoặc tên công việc của dự án khác, hệ thống tự động tìm kiếm và nạp dữ liệu tức thời, hiển thị các công việc ngoài dự án trong danh sách gợi ý kèm nhãn huy hiệu tím nổi bật `External Link: [Mã dự án]`.
   - **Hộp thoại xác nhận liên kết khác dự án (Multi-Factor Cross-Project Confirmation Dialog)**: Khi chọn hoặc nhập công việc khác dự án, hệ thống áp dụng cơ chế xác thực đa yếu tố:
     + **Quy tắc phân biệt dự án độc lập (Multi-Factor Project Isolation)**: Một công việc được xem là thuộc dự án khác nếu **khác bất kỳ một trong các yếu tố**: **Năm (Year)**, **Chi nhánh (Store)**, **Vị trí/Tầng (Location)**, hoặc **Mã dự án (Project Code)**. Ví dụ: dự án `2026 B2-B208 HCM` và `2027 B2-B208 HCM` (cùng mã `B2-B208`, cùng store và location nhưng khác niên độ 2026 vs 2027) được xác định là hai dự án riêng biệt.
     + **Hiển thị huy hiệu nhận diện chi tiết**: Trong danh sách gợi ý, các công việc khác yếu tố sẽ có huy hiệu màu tím chỉ rõ nguyên nhân: `Khác Năm: [Năm]`, `Khác Chi nhánh: [Store]`, `Khác Vị trí/Tầng: [Location]`, hoặc `Khác Dự án: [Code]`.
     + **Xác nhận người dùng trước khi liên kết**: Khi người dùng chọn công việc từ danh sách gợi ý hoặc nhập tay công việc khác dự án, hệ thống sẽ mở hộp thoại xác nhận nêu rõ các yếu tố khác biệt: *"Công việc '[Tên task]' ([Mã task]) thuộc dự án khác do khác yếu tố: [Năm: 2027 (hiện tại: 2026)]. Bạn có đồng ý liên kết phụ thuộc (Predecessor) khác dự án không? Hệ thống sẽ tự động đồng bộ ngày theo logic Predecessor"*. Người dùng bấm **"Đồng ý liên kết"** để áp dụng hoặc **"Hủy"** để hủy bỏ liên kết ngoại vi.
   - **Hỗ trợ Đa Tiền Nhiệm (Multi-Predecessor)**: Hỗ trợ nhập đồng thời nhiều tiền nhiệm phân cách bởi dấu phẩy `,` (ví dụ: `CP-01-1, CP-01-2FF` hoặc `HN-TKV-SMZ2-85SS, HN-TKV-IT-1FF`).
   - **Áp dụng đuôi FF hoặc SF cho Tiền nhiệm thứ 2**: Tiền nhiệm thứ 2 hỗ trợ cả 2 chuẩn liên kết ràng buộc mốc kết thúc: `FF` (Finish-to-Finish) và `SF` (Start-to-Finish). Khi người dùng chọn tiền nhiệm thứ 2 từ danh sách gợi ý, hệ thống mặc định gắn `FF` và cho phép tùy chỉnh sang `SF` (hoặc kèm Lag như `+2`, `-1`).
   - **Cảnh báo Task ngoài dự án (Cross-Project Warning)**: Cả tiền nhiệm thứ nhất và thứ hai (hoặc bất kỳ tiền nhiệm nào) nếu trỏ tới task thuộc dự án khác đều được hệ thống hiển thị huy hiệu nhận diện màu tím kèm tên dự án nguồn để người dùng nhận biết ngay.
   - **Tự động đổi ngày theo đúng logic Predecessor**: Ngay khi nhập hoặc chọn liên kết (cả trong Task Detail bảng tính lẫn trong Task Modal), hệ thống phân giải chính xác ngày bắt đầu/kết thúc của task ngoài dự án và tự động cập nhật ngày của task hiện tại:
     + `SS`: Ngày `Start` của task được gán bằng đúng ngày `Start` của task tiền nhiệm ngoài dự án (cộng/trừ Lag nếu có); ngày `Finish = Start + Duration`.
     + `FS`: Ngày `Start` được gán bằng ngày `Finish` của task tiền nhiệm ngoài dự án; ngày `Finish = Start + Duration`.
     + `FF`: Ngày `Finish` được gán bằng ngày `Finish` của task tiền nhiệm ngoài dự án.
     + `SF`: Ngày `Finish` được gán bằng ngày `Start` của task tiền nhiệm ngoài dự án.
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
4. **Tự Động Cập Nhật Predecessor Của Task Con Khi Đổi Task Code Mẹ (Hỗ Trợ Task Code Chứa Dấu Phẩy ",")**:
   - Khi chỉnh sửa mã công việc mẹ (`Task Code` / `taskCodePhu`), hệ thống tự động quét và cập nhật lại mã tương ứng trong chuỗi `Predecessor` của tất cả các Task con phụ thuộc mà không làm gián đoạn chuỗi liên kết tiến độ.
   - **Xử lý đặc biệt cho Task Code có chứa dấu phẩy `","`** (ví dụ mã công việc dạng `L1,L2-01`): Thuật toán nhận diện thông minh bảo vệ toàn vẹn chuỗi ký tự của Task Code, phân biệt chính xác dấu phẩy nằm bên trong mã với dấu phẩy dùng để ngăn cách giữa các Predecessor khác nhau, tuyệt đối không bị tách nhầm thành nhiều tiền nhiệm rời rạc hay làm mất dữ liệu.
5. **Chuẩn Định Dạng Mã Task Phụ & Bảo Toàn Dữ Liệu Tiền Nhiệm (Subtask Code & Predecessor Integrity)**:
   - **Hỗ trợ linh hoạt cả định dạng `#` và `-`**:
     + Hệ thống hỗ trợ linh hoạt cả 2 định dạng phân tách: dấu `#` (`ProjectCode#Index`, ví dụ `B2-B208#2`) và dấu gạch ngang `-` (`ProjectCode-Index`, ví dụ `B2-B208-2`).
     + **Tôn trọng định dạng người dùng (No Forced Auto-Conversion)**: Hệ thống giữ nguyên vẹn 100% mã do người dùng nhập hoặc lưu trữ trong dữ liệu, không tự động cưỡng bức chuyển đổi ký tự `-` sang `#`.
   - **Bảo Toàn Chuỗi Predecessor & Tính Nhất Quán Trong - Ngoài (Predecessor Modal & View Integrity)**:
     + Khi mở cửa sổ Task Modal hoặc sửa nhanh trên bảng DetailTab, giá trị `Predecessor` được giữ nguyên vẹn tuyệt đối từ cơ sở dữ liệu (ví dụ ở ngoài bảng là `B2-B208#2` thì trong Modal hiển thị chính xác `B2-B208#2`, không bị logic quét ngầm ghi đè hay thay đổi thành `#1`).
   - **Bảo Vệ Xung Đột Số (Numerical Conflict Guard)**:
      + **Bảo đảm chuẩn xác Subtask Index**: Khi nhập hoặc chọn mã công việc (như `B2-B208#2` hoặc `B2-B208-2`), hệ thống áp dụng cơ chế bảo vệ số thứ tự, đảm bảo 100% liên kết chính xác Subtask #2 (Re-instatement) và không bao giờ bị lệch sang Subtask #1 (Hoarding up).
      + **Hiệu năng lưu tức thời (Zero-Lag Save Engine)**: Lưu công việc và tính toán mốc ngày trong 0ms, loại bỏ hoàn toàn các vòng lặp quét nền ngầm gây đơ hoặc giật lag ứng dụng.
     + Khi người dùng gõ tìm kiếm tiền nhiệm có số thứ tự cụ thể (ví dụ nhập `B2-B208-2` hoặc `#2` hoặc `2`), hệ thống đối soát chính xác số thứ tự tương ứng, chặn tuyệt đối việc ép gợi ý về các task khác số (như `B2-B208#1`).
   - **Tự Động Đồng Bộ Chuỗi Predecessor Khi Đổi Mã Dự Án (Project Code Cascade)**:
     + Khi chỉnh sửa mã dự án trong cửa sổ chỉnh sửa dự án hoặc trên bảng chi tiết:
       * Hệ thống tự động cập nhật lại mã dự án và mã công việc phụ (`taskCodePhu` ví dụ: `PRJ-01#1` ➜ `PRJ-02#1`).
       * Đồng thời, tự động quét và viết lại toàn bộ các chuỗi tiền nhiệm (`Predecessor`) tham chiếu đến các công việc của dự án này trên toàn bộ hệ thống.
       * Toàn bộ hậu tố kiểu ràng buộc tiến độ (như `FS+2`, `SS`, `FF`, `SF-1`) được bảo toàn chính xác 100%.
    - **Tự Động Điền Giá Trị Mặc Định Khi Tạo Task Mới (Default Task Values)**:
      + Khi tạo công việc mới nếu người dùng không điền vào các ô `Start date`, `Finish date`, `Baseline start`, `Baseline finish`, `Duration`, `Party`:
        * Mốc ngày `Start date`, `Finish date`, `Baseline start`, `Baseline finish` sẽ tự động lấy mặc định là ngày hôm nay.
        * `Duration` (thời lượng) mặc định là `0` ngày.
        * `Party` (đơn vị phụ trách) tự động kế thừa từ thông tin đối tác của dự án mẹ hoặc mặc định là `Takashimaya`.
        * **Chế độ tự động tính ngày kết thúc (Auto Calculate End Date / Duration Manual)**: Khi tạo mới task hoặc nhập từ file CSV, trường durationManual luôn mặc định là true. Khi nhập Start date và Duration, hệ thống sẽ luôn tự động tính toán chính xác ngày kết thúc Finish date (Finish = Start + Duration).
        * **Ưu tiên sắp xếp theo Tiền nhiệm (Predecessor-Prioritized Sorting)**: Khi sắp xếp công việc hoặc nhập dữ liệu từ CSV có tiền nhiệm (Predecessor), hệ thống áp dụng thuật toán Topo để ưu tiên xếp công việc tiền nhiệm đứng trước công việc phụ thuộc, đồng thời tự động tính toán chuỗi ngày tháng nối tiếp liền mạch.
    - **Tìm Kiếm & Tự Động Điền Gợi Ý Tiền Nhiệm Thông Minh (Smart Predecessor Suggestion & Auto-Complete)**:
      + Ô nhập tiền nhiệm hỗ trợ đầy đủ ký tự `#` (gõ `Shift + 3`) và phân biệt rõ ràng giữa các năm/chi nhánh khác nhau (ví dụ phân biệt `2026 B2-B208 HCM` với `2027 B2-B208 HCM`).
      + Hệ thống hiển thị danh sách gợi ý theo thuật toán tính điểm ưu tiên tuyệt đối công việc cùng dự án cha, cùng năm, cùng chi nhánh và cùng tầng (`Location`).
      + Khi gõ mã gần giống nhất và nhấn `Enter` hoặc `Tab`, hệ thống sẽ tự động điền gợi ý phù hợp nhất vào ô một cách tức thời. Khi click ra ngoài, hệ thống cũng tự động chuẩn hóa tiền nhiệm đã nhập.

    - **Lệnh Quét & Chuyển Đổi Hàng Loạt '-' sang '#' (Batch Subtask Code & Predecessor Hash Converter)**:
      + **Vị trí 1 (Tab Task Detail)**: Khi bật chế độ chỉnh sửa (**Edit Mode**), trên thanh công cụ xuất hiện nút **"Đổi '-' sang '#'"** (biểu tượng dấu thăng `#`).
      + **Vị trí 2 (Tab Setting)**: Trong mục công cụ quản trị hệ thống có nút **"Chuyển '-' sang '#' (Subtask & Pred)"**.
      + **Cơ chế hoạt động**: Khi bấm nút và xác nhận, hệ thống sẽ thực hiện quét toàn bộ công việc trong ứng dụng:
        * Tự động nhận diện và chuyển đổi tất cả mã nhiệm vụ phụ (`taskCodePhu`) có dấu gạch ngang sang dấu thăng `#` (ví dụ: `B2-B208-1` ➜ `B2-B208#1`, `HN-TKV-SMZ2-85` ➜ `HN-TKV-SMZ2#85`, `CP-01-2` ➜ `CP-01#2`).
        * Đồng thời tự động phân tích và cập nhật toàn bộ các chuỗi tiền nhiệm (`Predecessor`) đang trỏ đến các mã này (ví dụ: `B2-B208-1, B2-B208-2FF` ➜ `B2-B208#1, B2-B208#2FF`).
        * Cập nhật tức thời vào bộ nhớ giao diện (0ms Optimistic UI) và đồng bộ hàng loạt (Batch writes 400 docs/lần) lên cơ sở dữ liệu nền, thông báo chính xác số lượng bản ghi đã được chuyển đổi thành công.

    - **Quy Trình Nhập Dữ Liệu Task Từ CSV / Excel Chuẩn 5 Bước**:
      + **Bước 1 (Đọc dữ liệu tạm thời vào Zustand)**: Hệ thống nạp toàn bộ các dòng từ tệp CSV hoặc Excel (`.csv`, `.xlsx`, `.xls`), bao gồm Ngày bắt đầu (`start`), Ngày hoàn thành (`finish`), Thời lượng (`duration`), Tiền nhiệm (`predecessor`), Mã công việc phụ (`taskCodePhu`), Task mẹ (`parentTaskId`), Ghi chú bình luận và Bên phụ trách, cập nhật tức thời (0ms Optimistic UI) vào bộ nhớ trạng thái Zustand.
      + **Bước 2 (Ưu tiên tính toán lại mốc ngày theo Predecessor & Duration)**: Hệ thống phân giải chính xác chuỗi tiền nhiệm (`Predecessor`) và Thời lượng (`Duration`), tự động áp dụng các quy tắc ràng buộc (FS, SS, FF, SF, Lag) để tính toán lại toàn bộ Ngày bắt đầu (`start`) và Ngày kết thúc (`finish`) cho tất cả các nhiệm vụ phụ thuộc theo dây chuyền (Cascading Topological Scheduling).
      + **Bước 3 (Cập nhật ngày Task Mẹ & Đồng bộ Task Summarize / Project Summarize)**:
        * Tự động tính toán lại mốc ngày của các **Task Mẹ (Parent Task)**: Ngày bắt đầu của Task Mẹ = ngày sớm nhất của các task con; Ngày kết thúc của Task Mẹ = ngày muộn nhất của các task con; Thời lượng = khoảng cách ngày giữa bắt đầu và kết thúc.
        * Đồng thời tự động cập nhật danh mục tóm tắt nhiệm vụ (**Task Summarize**) và tổng hợp dự án (**Project Summarize**): ngày khởi công (`computedTakStart`), ngày hoàn thành (`computedTakCompl`), ngày khai trương (`computedOpening`), tiến độ kế hoạch (`Plan Progress`), tiến độ thực tế (`Act Progress`) và tổng số lượng task (`taskCount`).
      + **Bước 4 (Đồng bộ hàng loạt lên Firestore)**: Ghi dữ liệu an toàn theo từng khối (Batch Write tối đa 400 docs/lần) lên bộ sưu tập `taka_tasks`, cập nhật nhóm ủy quyền `taka_delegation_groups` và tài liệu tổng hợp dự án `taka_projects`.
      + **Bước 5 (Chỉnh sửa Thời lượng Duration ngoài màn hình trong Edit Mode)**: Khi kích hoạt chế độ **Edit Mode** (`canWrite`), người dùng có thể nhấp trực tiếp vào ô **Duration** trên bảng Task Detail ngoài màn hình (hoặc trên giao diện di động) để thay đổi số ngày thực hiện. Hệ thống sẽ tự động tính lại ngày kết thúc (`Finish = Start + Duration`), lan truyền cập nhật đến các task tiền nhiệm phụ thuộc và tự động cập nhật mốc ngày của Task Mẹ.

6. **Đồng Bộ Ngày Bắt Đầu & Kết Thúc Tức Thì Sang Tab General (Real-Time Pre-computed Dates Sync)**:
   - Mọi thao tác thêm mới, chỉnh sửa ngày (`Start`/`Finish`), xóa hoặc cập nhật tiến độ công việc trên tab **Task detail** đều tự động tính toán lại ngày bắt đầu sớm nhất (`computedTakStart`), ngày kết thúc muộn nhất (`computedTakCompl`) và ngày khai trương (`computedOpening`) của dự án.
   - **Hỗ trợ Dự án Multi-code**: Đối với các dự án ghép mã gian hàng (ví dụ: `L3-333-2, L3-333-3` hoặc `L3-303-1`), hệ thống tự động gom chính xác toàn bộ danh sách task thuộc tất cả các phân đoạn mã để cập nhật tiến độ và mốc thời gian toàn diện.
   - **Cơ chế Fallback bảo toàn dữ liệu**: Tab General luôn hiển thị mốc ngày đầy đủ và chính xác ngay cả khi danh sách task đang được tải hoặc lọc theo năm, không bao giờ bị mất hay rỗng ngày Start/Finish.

7. **Cơ Chế Ảo Hóa Bảng Chuẩn Doanh Nghiệp (High-Performance Table Virtualization)**:
   - Thay thế việc render lặp hàng nghìn thẻ DOM bằng cơ chế cửa sổ ảo hóa thông minh (Virtual Windowing), chỉ render các hàng đang hiển thị trong tầm mắt người dùng (viewport) kèm vùng đệm.
   - Giữ nguyên 100% tính năng nghiệp vụ: Kéo thả sắp xếp nhiệm vụ (Drag & Drop), chỉnh sửa trực tiếp trên ô (In-place Editable Cells), mở rộng/thu gọn (Expand/Collapse), sắp xếp theo cột (Column Sort), đổi độ rộng cột (Column Resize), ẩn/hiện cột và chọn hàng loạt (Batch Selection).
   - Hiệu suất cuộn mượt mà đạt chuẩn 60 FPS ngay cả khi xử lý khối lượng dữ liệu khổng lồ của toàn bộ niên độ (All Years).

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
    - **Chỉnh Sửa & Điền Gợi Ý Tiền Nhiệm Trực Tiếp Trên Tooltip Gantt (Interactive Predecessor Tooltip Editor)**:
      * **Thao tác nhanh**: Rê chuột hoặc nhấp vào bất kỳ thanh công việc/milestone nào trên biểu đồ Gantt để mở bảng thông tin nổi (Tooltip).
      * **Nút sửa / thêm tiền nhiệm**: Trên bảng Tooltip xuất hiện dòng **Predecessors** kèm nút bấm `[ + Add ]` hoặc `[ ✏️ Edit ]`.
      * **Gợi ý tự động thông minh (Smart Suggestions Dropdown)**: Khi bấm nút, một ô nhập liệu tiền nhiệm chuyên dụng mở ra ngay trên tooltip với đầy đủ tính năng:
        - Tự động gợi ý danh sách các Task theo thứ tự ưu tiên gần nhất (cùng dự án, cùng năm, cùng chi nhánh, cùng vị trí).
        - Hỗ trợ các nút chọn nhanh loại liên kết quan hệ tiến độ: **FS (Finish-to-Start)**, **SS (Start-to-Start)**, **FF (Finish-to-Finish)**, **SF (Start-to-Finish)** và độ trễ (`+/- ngày`).
        - Khi nhấn **Enter** hoặc chọn gợi ý, hệ thống tự động tính toán lại các mốc ngày `Start`, `Finish`, `Duration` và tự động dịch chuyển (cascade) các công việc phụ thuộc phía sau trong 0ms (Optimistic UI), đồng thời lưu ngầm lên Firestore.
        - Hỗ trợ nút `[ ✓ Apply ]` để xác nhận hoặc `[ ✕ Cancel / Phím Escape ]` để hủy thao tác nhanh chóng.
    - **Nút Mở Rộng / Đóng All Tím Cho Task Gộp (Master Purple Modular Toggle Button)**:
      * **Vị trí**: Nằm ở ô tiêu đề cột **Project / Task** trên thanh header bảng Gantt, được đặt ngay phía dưới nút mũi tên xanh/xám mở rộng/thu gọn tất cả dự án (`ChevronDown / ChevronRight`).
      * **Chức năng**: Mở rộng hoặc thu gọn toàn bộ các nhóm Task gộp (Modular Group Tasks) đối với tất cả các dự án đang xem, đang tìm kiếm hoặc đang hiển thị trên màn hình hiện tại.
      * **Trạng thái trực quan**: Màu tím nổi bật (`bg-purple-600` khi đang mở rộng all, `bg-purple-100 dark:bg-purple-900/60` khi đang đóng all). Khi kích hoạt mở rộng all, hệ thống đồng thời tự động mở rộng các dự án đang đóng để hiển thị ngay lập tức toàn bộ cây công việc con gộp trên giao diện.
    - **Tương Tác Tooltip Task Gộp Mẹ Hiển Thị Các Task Con Gom Đang On Process**:
      * **Mục tiêu**: Nắm bắt nhanh tiến độ của các công việc con đang trong giai đoạn triển khai (`On Process`) của một nhóm việc cha mà không cần phải cuộn tìm kiếm.
      * **Thao tác**: Nhấp vào thanh biểu đồ Gantt hoặc nhấp vào Tooltip của Task gộp mẹ để ghim và kích hoạt tương tác (`isPinned`).
      * **Bảng danh sách Active Subtasks**: Ngay trên Tooltip của Task gộp mẹ hiển thị mục **On Process Subtasks ({số lượng})** kèm nút bấm mở rộng/thu gọn có chấm sáng nhấp nháy màu hổ phách.
      * **Chi tiết từng Task con**: Hiển thị rõ mã task phụ (`#1`, `#2`... trong huy hiệu tím), tên công việc, thanh tiến độ % xanh lá cây, mốc ngày thực hiện (`Start ➔ Finish`) và thời lượng (`d`).
      * **Điều hướng tức thì**: Nhấp vào bất kỳ task con nào trong danh sách trên Tooltip để chuyển ngay vào màn hình chi tiết công việc (**Task Detail Modal**) hoặc tự động focus/highlight công việc đó trên dòng thời gian.

---

6. **Chế Độ Chỉnh Sửa Hàng Loạt & Hủy Liên Kết Gộp (Edit Mode, Shift-Selection & Unlink Engine)**:
   - **Bật Chế Độ Edit Mode**: Nhấp nút **Edit Mode** (màu xanh dương nổi bật) trên thanh công cụ Gantt để kích hoạt các ô checkbox lựa chọn và thanh tác vụ hàng loạt.
   - **Tích Chọn Cấp Dự Án (Project-Level Bulk Select)**:
     * Tích vào checkbox của dòng Dự án: Hệ thống sẽ tự động tích chọn **100% toàn bộ công việc** (bao gồm cả task mẹ và task con) thuộc dự án đó.
     * Khi một số task trong dự án được chọn, checkbox dự án sẽ chuyển sang trạng thái gạch ngang (Indeterminate). Nhấp tiếp vào checkbox sẽ chuyển sang chọn tất cả.
     * Khi tất cả task trong dự án đã được chọn, nhấp lại vào checkbox sẽ bỏ chọn toàn bộ dự án.
   - **Chọn Nhanh Dải Nhiệm Vụ Bằng Phím Shift (Shift-Click Range Selection)**:
     * Nhấp tích chọn checkbox của công việc đầu tiên.
     * Nhấn giữ phím **Shift** trên bàn phím và nhấp vào checkbox của công việc cuối cùng trong vùng cần chọn.
     * Hệ thống sẽ tự động quét và tích chọn **toàn bộ các công việc nằm giữa hai mốc** theo đúng thứ tự hiển thị trực quan trên màn hình.
     * Tính năng này hoạt động đồng bộ và mượt mà trên cả biểu đồ **Gantt Chart** và bảng danh sách **Task Detail**.
   - **Nút Hủy Liên Kết Gộp (Unlink Modular Tasks)**:
     * **Tại Tab Gantt**: Trong Edit Mode, khi tích chọn một hoặc nhiều task, nút **Unlink** (màu hổ phách) sẽ sáng lên trên thanh công cụ nổi. Bấm nút để lập tức tách các task đã chọn ra khỏi task gộp cha.
     * **Tại Tab Task Detail**: Chọn các checkbox của task cần tách và bấm nút **Unlink** trên thanh tác vụ nổi phía dưới màn hình hoặc trên thanh công cụ lọc.
     * **Trong Cửa Sổ Task Modal**: 
       - Nếu task đang mở là task con (Sub-task): Có nút **Unlink Parent** để tự tách khỏi nhóm gộp.
       - Nếu task đang mở là task mẹ (Parent): Có huy hiệu số lượng task con kèm nút **Unlink Subtasks** để giải phóng toàn bộ task con chỉ với 1 cú nhấp chuột.
   - **Xóa Task Toàn Diện & Chống Hồi Sinh Dữ Liệu (Safe Delete & Clean Storage Engine)**:
     * Khi xóa một hoặc nhiều task, hệ thống tự động xóa tức thì khỏi Zustand store, xóa sạch trong cơ sở dữ liệu ngoại tuyến Dexie (IndexedDB), dọn sạch tệp đính kèm trên Firebase Storage và commit Firestore Batch.
     * Nếu task bị xóa là task cha của một nhóm gộp, các task con bên trong sẽ được tự động giải phóng (Unlink) an toàn về task độc lập, ngăn chặn hoàn toàn lỗi mất hiển thị hoặc treo cây task.

---

7. **Cơ Chế Tải Dữ Liệu Lười Theo Nhu Cầu (On-Demand Expansion Loading & Tiết Kiệm Chi Phí Đọc Firestore)**:
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
   - **Bộ Lọc Phạm Vi Linh Hoạt (Year, Store, Location Filters)**: Ngay dưới thanh tiêu đề của cửa sổ Project Modular, hệ thống trang bị thanh công cụ bộ lọc tích hợp cho phép lọc nhanh đồng bộ cả 2 bảng dự án theo **Năm (Year)**, **Chi nhánh (Store: HCM / HN)** và **Khu vực/Tầng (Location: B1, L1, L2, L3,...)** kèm nút **Reset Filters** quay về mặc định. Cửa sổ cũng tự động kế thừa bộ lọc đang chọn ngoài bảng Budget khi vừa mở lên.
   - **Lớp Hiển Thị Nổi Bật Tuyệt Đối (z-index cao hơn Header)**: Cửa sổ được thiết lập chỉ số tầng `z-[1000]`, đảm bảo luôn nổi hoàn toàn trên thanh Header và thanh điều hướng chính, không bao giờ bị che khuất tiêu đề hay nút đóng modal.
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
4. **Kiến Trúc Module Hóa Chuẩn Enterprise & Cơ Chế Tri-Gate Lazy Loading**:
   - Toàn bộ phân hệ Summary và Executive Dashboard tuân thủ triệt để cấu trúc module 4 lớp (`SummaryParts/`, `ExecutiveDashboardParts/`), kích hoạt Tri-Gate Lazy Loading chỉ nạp dữ liệu chi phí và công việc khi mở màn hình, giữ file điều phối dưới 100 dòng code và bảo toàn tốc độ phản hồi 60 FPS.

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

#### 🔹 Hướng dẫn Sử dụng Bản đồ & Live View:
1. **Bộ lọc Cửa hàng, Khu vực & Đồng bộ Phân quyền (Store, Location & RBAC Access Control)**:
   - **Chọn Cửa hàng (`HCM`, `HN`)**: Chuyển đổi linh hoạt giữa các chi nhánh được phân quyền; hệ thống **tự động đồng bộ và tính toán lại bảng dữ liệu tổng hợp (`useSummaryData`)** của chi nhánh tương ứng ngay tức thì (0ms) từ bộ nhớ đệm mà không cần người dùng phải bấm quay lại Tab General.
   - **Bộ lọc Khu vực & Tự động Lọc theo Quyền (Location Permissions)**: Tối ưu trực quan hóa bản vẽ 2D theo từng Tầng cụ thể (`L1`, `L2`, `L3`, `L4`, `B1`...), loại bỏ tùy chọn `All Locations` không cần thiết. Áp dụng chuẩn 100% cơ chế phân quyền tài khoản (Account Control RBAC) giống như Tab General và Tab Detail:
     * Người dùng **chỉ nhìn thấy các khu vực/tầng (Location) mà tài khoản được phân quyền** truy cập.
     * Các gian hàng/mã dự án (Unit / Project Code) mà người dùng **không có quyền xem (theo quyền Store, Location, Đối tác / Phân công Party)** sẽ hoàn toàn không hiển thị thông tin dự án, tiến độ hay xuất hiện trong danh sách gợi ý tìm kiếm (Autocomplete).
     * Tooltip thông tin gian hàng bảo mật tuyệt đối, chỉ hiển thị tên dự án, mốc ngày, tiến độ và bình luận đối với các dự án mà tài khoản được phép truy cập.
2. **Kéo & Thu phóng Siêu Mượt 60fps (Hardware-Accelerated Zoom/Pan)**:
   - **Con lăn chuột**: Phóng to/thu nhỏ mượt mà theo đường cong mượt mà, định vị chính xác vị trí con trỏ chuột mà không giật lag.
   - **Kéo thả chuột / Chạm ngón tay (Pan)**: Giữ và kéo để lướt toàn bộ mặt bằng; tối ưu hóa GPU giảm thiểu render lại không cần thiết.
   - **Cử chỉ 2 ngón tay (Pinch-to-zoom trên Mobile/iPad)**: Phóng to, thu nhỏ và xoay chuyển mượt mà tự nhiên theo thời gian thực.
   - **Nhấp đúp chuột / Chạm 2 lần (Double-click / Double-tap)**: Tự động zoom nhanh hoặc vừa vặn toàn bộ mặt bằng vào khung nhìn (Fit to Screen) với hiệu ứng chuyển cảnh mượt.
   - **Bộ điều khiển góc trên bên phải**: Nút `[+]`, `[-]`, tỉ lệ `%`, và nút `[⛶]` (Reset / Fit to Screen) phản hồi 1 chạm tức thì (`active:scale-95`).
3. **Ghim vị trí dự án (Add Pin)**: Nhấp nút "Add Pin", sau đó nhấp vào vị trí gian hàng trên bản đồ và liên kết với Dự án tương ứng.
4. **Xem nhanh thông tin & Bảng tóm tắt công việc (Interactive Task Summary Tooltip & Auto Anti-Obstruction)**: 
   - Rê chuột (hoặc chạm trên thiết bị di động) vào bất kỳ gian hàng nào trên bản đồ để xem ngay bảng Tooltip thông tin chi tiết đồng bộ hoàn toàn theo phong cách Bảng Task Summary (`IMG_9172`):
     - **Cơ chế Tự Động Định Vị Chống Che Khuất (Auto Anti-Obstruction & Safe Collision Engine)**:
       * **Tự động tránh che khuất trên Di động & Chống đè bởi Header (Mobile Smart Flip & Safe Header Clearance)**: Khi chạm vào gian hàng ở nửa dưới màn hình, Tooltip tự động tính toán khoảng an toàn (`safeTop`) căn theo đáy của thanh Header và các thanh công cụ để đặt Tooltip ở nửa trên trong vùng mặt bằng thông thoáng, tuyệt đối không bị Header ứng dụng đè hay che khuất. Ngược lại, khi chạm vào gian hàng ở nửa trên, Tooltip tự động đặt ở nửa dưới với khoảng cách an toàn.
       * **Tự động ẩn nút Menu tạm thời (Mobile Focus Mode)**: Khi Tooltip mở trên điện thoại, các nút Menu và Chú thích màu dưới đáy màn hình tự động làm mờ và tạm ẩn (`opacity-0 pointer-events-none`) để không che khuất hay tranh chấp thao tác bấm với Tooltip.
        * **Khóa ghim cố định (Pinning)**: Nhấp hoặc chạm vào gian hàng sẽ ghim cố định Tooltip, cho phép người dùng thoải mái xem thông tin tiến độ, mở trao đổi/bình luận mà không bị biến mất. Nhấp vào nền trống hoặc nút X để đóng.
        * **Tự động đo đạc theo thời gian thực (ResizeObserver & VisualViewport)**: Tooltip tự động tính toán lại kích thước linh hoạt, đảm bảo thẻ luôn nằm trọn trong vùng nhìn thấy được của màn hình (hỗ trợ hoàn hảo Safari iOS với dynamic URL bar).
      - **Thanh tiêu đề (Header)**: Hiển thị Store - Mã Gian hàng (Unit) - Tên Dự án/Brand, Huy hiệu Trạng thái tiến độ (`Completed` xanh lá, `On Process` màu cam ấm đồng bộ chuẩn màu tab General, `Handover` xanh dương, `Delay` đỏ), Huy hiệu **`MD Status`** (tự động lấy từ trường MD Status của dự án với màu sắc trạng thái tương ứng) và Nút đóng (`X`). Nhấp vào tên dự án để mở xem chi tiết dự án.
      - **Thanh Tiến độ Đôi (Dual Progress Bars)**:
        * **Plan Progress**: Thanh phần trăm tiến độ theo Kế hoạch (màu xanh dương).
        * **Act Progress**: Thanh phần trăm tiến độ Thực tế (màu xanh ngọc).
      - **Hàng Thông tin Hợp nhất (Unified Info Row)**:
        * **Floor & Diện tích**: Thẻ nhỏ gọn `Floor: L1`, `DT: ... m²` (MD Status đã được gom gọn tinh tế lên hàng Header trên cùng, loại bỏ thẻ trùng lặp giúp giao diện thoáng đãng).
        * **Biểu tượng Trao đổi / Bình luận (`MessageSquare`)**: Nút bình luận nhỏ gọn kèm số lượng tin nhắn ngay trên cùng hàng. Nhấp vào để mở ngay cửa sổ **Project Modal** chuyển thẳng vào tab **Chat (Trao đổi)** của dự án.
        * **Mốc Ngày Bắt đầu & Bàn giao (Start & Handover Dates)**: Ngày bắt đầu (màu xanh dương) và ngày bàn giao (màu hồng) nằm gọn gàng bên phải của cùng hàng, giúp tối ưu diện tích và không che khuất mặt bằng.
      - **Khối Chi tiết Công việc & Ghi chú (Details Section - Chuẩn Tab General)**:
        * Tự động hiển thị các dòng công việc đang chạy trong thời điểm hiện tại (`taskLines`) với màu sắc so le chuẩn mực (dòng 1 màu xanh dương, dòng 2 màu cam) giống hệt logic hiển thị cột Detail của tab General.
        * Hiển thị đầy đủ nội dung ghi chú chi tiết (`detail`) bên dưới danh sách công việc giúp theo dõi toàn diện tiến độ của gian hàng ngay trên mặt bằng.
      - **Cơ chế Tối ưu Firestore Read Tuyệt đối (Tri-Gate Lazy Loading for Comments)**:
         - Hệ thống nhận diện trạng thái mở modal ở chế độ chỉ Chat (`isChatOnly` = `isProjectModalOpen && modalInitialTab === 'chat'`).
         - Khi mở ô Comment từ Tooltip của Layout Tab, hệ thống **CHỈ** đọc tin nhắn trao đổi của riêng dự án đó (subcollection chats hoặc document chats) mà **KHÔNG** tải hay lắng nghe (listen) toàn bộ danh sách Task, Cost, hay Delegation của toàn bộ hệ thống.
         - Tiết kiệm 100% chi phí Firestore read không cần thiết, bảo vệ giới hạn đọc và duy trì hiệu năng 60fps mượt mà cho bản đồ.
          - **Phân trang Tin nhắn (Pagination / Limit to Last 25)**: Mặc định chỉ hiển thị 25 tin nhắn trao đổi gần nhất để giao diện chat mở tức thì (0ms) và chống tràn bộ nhớ. Phía trên có nút `[ ⬆️ Xem thêm tin nhắn cũ hơn (+25) ]` để người dùng chủ động tải thêm khi cần xem lại lịch sử trao đổi. Khi nhấp từ thông báo (`focusCommentId`), hệ thống tự động mở rộng vùng hiển thị để cuộn chính xác đến tin nhắn cần xem.
      - **Nút Xem Nhanh Biểu Đồ Mini Gantt (Modular Mini Gantt Timeline Button)**:
        * **Vị trí**: Đặt ngay bên cạnh nút Bình luận `[ 💬 ]` trong bảng thông tin `LayoutUnitTooltip` với nút bấm màu tím indigo nổi bật: `[ 📊 Gantt ]`.
        * **Cửa sổ Timeline Kéo thả (Draggable Window)**: Nhấp vào nút `[ 📊 Gantt ]` sẽ mở ra cửa sổ **Mini Gantt Timeline** độc lập, hỗ trợ kéo thả tự do (`.modal-handle`, `cursor-grab`) để di chuyển khắp màn hình mà không che khuất mặt bằng bản vẽ.
        * **Trực quan hóa Tiến độ Công việc & Đường Ngày Hiện Tại (Today Line)**:
          - Hiển thị dải thời gian tổng (`Timeline: Start → Finish`) và tổng số ngày thực hiện của gian hàng.
          - **Đường Ngày Hiện Tại (Today Line Marker)**: Tự động hiển thị một huy hiệu đánh dấu đỏ/hồng nổi bật `[ TODAY (Sep 27) ]` ở thanh thước thời gian (Timeline Header) và một đường kẻ chỉ báo dọc màu đỏ hồng chạy xuyên suốt toàn bộ các hàng công việc (Task Rows). Giúp người dùng ngay lập tức đối chiếu trực quan các công việc đã qua (Past), công việc đang diễn ra hôm nay (In Progress) hay sắp tới (Upcoming).
          - Liệt kê gọn gàng danh sách các hạng mục công việc (bỏ mã task rườm rà và nhãn Pending thừa thãi), hiển thị ngày bắt đầu và kết thúc dạng tháng ngày chuẩn quốc tế gọn đẹp (ví dụ: `Dec 15 - Dec 20` hoặc `Dec 20`) với mã màu đồng bộ tab General (**Start màu xanh dương Blue**, **Finish màu hồng Pink**), thời lượng số ngày và thanh bar tiến độ trực quan theo thời gian thực.
          - Tự động phân màu thanh Gantt và biểu tượng đồng bộ 100% với Tab Gantt chuẩn: Xanh lá (`Completed / bg-green-500`), Xanh dương (`On process / bg-blue-500`), Xám Slate (`Upcoming / bg-slate-700 dark:bg-slate-500`), và Xám nhạt (`Canceled / bg-slate-400`). Đặc biệt, mọi hạng mục có **`duration = 0` (hoặc 0 ngày)** sẽ tự động hiển thị dưới dạng **Hình thoi Milestone màu Cam (`rotate-45 bg-orange-500`)** căn giữa ngày mốc, kèm nhãn `0d` nổi bật và tính riêng vào huy hiệu thống kê `Milestone` ở header.
        * **Tự động Sắp xếp Đồng bộ 100% theo Biểu đồ Gantt Chính (Rule 8, 9 & 12)**: Tải lười qua `React.lazy`, chỉ mount khi mở (`{showMiniGantt && <LayoutMiniGanttModal />}`). Hệ thống áp dụng chung thuật toán phân nhóm và sắp xếp với Gantt chính (`useGanttVirtualization` & `sortGroupTasks`), nhận diện chính xác cây phân cấp Cha - Con (`parentTasks` và `childTasksMap`), đặt các task con thụt lề ngay dưới task cha (`↳`) và sắp xếp chuẩn xác 100% theo thứ tự của Gantt chính (ưu tiên mã task phụ `#1`, `#2`, orderIndex, sau đó đến mốc thời gian Start/Finish). Khi bấm `[ Full Gantt View ]`, hệ thống tự động cô lập và chuyển sang đúng dự án đó trên Gantt.
        * **Nút Chuyển nhanh sang Full Gantt Tab**: Góc dưới cửa sổ có nút `[ Full Gantt View ]` (biểu tượng ↗) giúp người dùng chuyển ngay sang biểu đồ Gantt toàn diện với đúng dự án đang chọn khi cần thao tác chi tiết. Bấm phím `Escape` hoặc nút `X` để đóng nhanh cửa sổ.
       - **Bảng Hình Ảnh & Link Thumbnail Liên Kết (Interactive Image & Link Gallery Panel)**:
         * **Mặc Định Ẩn Gọn Gàng & Bật/Tắt Linh Hoạt Qua Biểu Tượng Hình Ảnh**: Khi nhấp chọn gian hàng trên mặt bằng, Tooltip mặc định hiển thị gọn gàng các thông tin tiến độ và ô Detail/Description. Chỉ khi người dùng nhấp vào **biểu tượng hình ảnh** ở góc phải thanh tiêu đề, bảng hình ảnh mới mở rộng bên dưới ô Detail để xem ảnh; nhấp lại lần nữa hoặc bấm nút `[X]` để thu gọn.
         * **Bảo Vệ Tính Toàn Vẹn Ô Detail**: Tuyệt đối không tự ý chèn các đường dẫn URL (`http://...`, `https://...`) hay chuỗi thô vào nội dung ô Detail/Description. Ô Detail giữ đúng chức năng hiển thị danh sách đầu việc và mô tả nghiệp vụ chuẩn, trong khi các link ảnh được quản lý và hiển thị riêng biệt trong khu vực hình ảnh.
         * **Tự Động Trích Xuất & Hiển Thị Đa Nguồn & Phân Vùng Độc Lập Theo Chi Nhánh (Store Partitioning HCM vs HN)**:
           - **Phân Vùng Riêng Biệt 100% Theo Chi Nhánh (HCM & HN Isolation)**: Toàn bộ hình ảnh, link dán và ảnh tải lên Cloudflare R2 đều được lưu trữ và lọc tách biệt hoàn toàn theo chi nhánh hiện hành (`HCM` hoặc `HN`). Khi người dùng thêm link hay tải ảnh tại chi nhánh Hà Nội (`HN`), hình ảnh sẽ chỉ hiển thị trong Tooltip và mặt bằng của Hà Nội, tuyệt đối không bị lẫn hay hiển thị chéo sang chi nhánh TP.HCM (`HCM`) và ngược lại.
           - **Hiển Thị Huy Hiệu Chi Nhánh Rõ Ràng**: Tiêu đề bảng hình ảnh trong Tooltip hiển thị rõ nhãn chi nhánh (`Hình ảnh liên kết (HCM)` hoặc `Hình ảnh liên kết (HN)`) kèm huy hiệu đếm số lượng ảnh theo quy chuẩn màu thương hiệu (HCM: Xanh dương, HN: Đỏ).
           - Tự động hiển thị và đồng bộ các link ảnh/thumbnail được lưu trong **Task Summarize (`project.taskSummaries`)** thuộc đúng chi nhánh tương ứng trên toàn bộ hệ thống Firestore và bộ nhớ Zustand.
           - Tự động nhận diện ảnh/thumbnail từ trường dữ liệu dự án (`project.thumbnail`, `project.imageUrl`, `project.image`, `project.photo`) thuộc đúng chi nhánh.
           - Tự động hiển thị các file ảnh đính kèm từ bình luận tiến độ (`project.comments.attachments`) của dự án thuộc đúng chi nhánh.
           - Tự động nhận diện ảnh/thumbnail từ dữ liệu mặt bằng (`data.imageUrl`, `data.thumbnail`) của đúng chi nhánh.
           - Tự động hiển thị các đường link ảnh / bài viết do người dùng dán vào qua nút **`+ Thêm`** theo đúng phân vùng chi nhánh.
         * **Hiển Thị Link Address Kèm Thao Tác 1 Chạm & Phóng To Trực Tiếp**: Hiển thị đường dẫn liên kết (`Link address`) ngay dưới từng thumbnail, tích hợp nút **Mở link sang tab mới** (`ExternalLink`), nút **Sao chép link** (`Copy`), nút **Phóng to xem ảnh HD** (`Lightbox Zoom`) và cho phép nhấp trực tiếp vào thumbnail mini ở header để mở hộp thoại phóng to chuẩn Enterprise (`LayoutUnitLightboxModal`) với đầy đủ nút đóng `[X]` đa lớp, thao tác phóng to/thu nhỏ và phím `Escape`.
         * **Dán & Lưu Link Nhanh Chóng**: Nút **`+ Thêm`** trên thanh tiêu đề mở ô nhập link; khi bấm **OK**, đường link sẽ tự động được ghi nhận và lưu đồng bộ trực tiếp mà không gây xáo trộn ô Detail của dự án.
         * **Tối Ưu Hiển Thị & Phóng To Toàn Màn Hình Trên iPad / Tablet (iOS Safari Portal & Sticky Header)**:
           - **Thanh Tiêu Đề Cố Định (Sticky Header)**: Giữ nguyên thanh tiêu đề tooltip luôn ghim ở trên cùng (`sticky top-0 z-30`) khi cuộn xem hình ảnh lớn, đảm bảo các huy hiệu trạng thái, tên dự án, nút Thêm và nút Đóng `[X]` không bao giờ bị trôi khỏi màn hình.
           - **Xem Ảnh Phóng To Độc Lập (Full-Screen Lightbox Portal)**: Trình xem ảnh phóng to được gắn trực tiếp vào `document.body` qua React Portal, loại bỏ hoàn toàn lỗi kẹt/cắt xén khung nhìn trên iPad Safari, cho phép quan sát bản vẽ chi tiết toàn màn hình sắc nét.
           - **Khung Thumbnail Tỷ Lệ Tự Nhiên (Flexible Fit & Zero-Crop)**: Tự động điều chỉnh vừa vặn cả ảnh khổ đứng (Portrait) lẫn khổ ngang (Landscape), giữ nguyên vẹn 100% chi tiết không bị cắt đầu cắt đuôi.
         * **Huy Hiệu Biểu Tượng Hình Ảnh Trực Tiếp Trên Mặt Bằng (Floorplan Image Badge)**: Mọi gian hàng có đính kèm thumbnail hoặc đường link ảnh (từ Task Summaries, Comments hay liên kết người dùng) sẽ tự động hiển thị **biểu tượng hình ảnh màu xanh dương (`#2563eb`)** ngay trên góc khối gian hàng ngoài mặt bằng Live View. Nhờ đó, người xem có thể nhận biết tức thì gian hàng nào có hình ảnh thực tế để nhấp vào xem mà không cần phải mở từng gian hàng.
5. **Chế độ Bản đồ Trực quan (Live View), Bảng Chú Thích Màu & Cấu Hình Hiển Thị Labels Appear (Tooltip Visibility)**:
   - **Kiến trúc Đồ họa Đa tầng (Multi-Layer Canvas), Lướt Quán tính (Kinetic Inertia) & Hiệu năng 60 FPS**: 
     * **Tách Layer Độc lập (Multi-Layer Split)**: Tách bản vẽ CAD nền vào `FastLayer` tĩnh hoàn toàn, các khối gian hàng vào `UnitsLayer` và vòng hào quang chọn gian hàng (`Focused Unit Golden Ring`) vào `OverlayHighlightLayer`. Khi hover hoặc chọn gian hàng, GPU không cần vẽ lại toàn bộ các khối mặt bằng.
     * **Hình học Vector Đa giác Tiền tính toán (Cached Geometry & SVG Paths)**: Tự động biên dịch sẵn chuỗi SVG Path `Path2D` cho các gian hàng hình đa giác vát góc phức tạp ngay trong bộ nhớ cache, loại bỏ hoàn toàn việc tính toán lại tọa độ đỉnh trên từng khung hình.
     * **Cuộn Lướt Quán tính Mượt mà (Kinetic Inertia Momentum Panning)**: Tích hợp bộ tính toán vật lý quán tính (`requestAnimationFrame` Deceleration Physics). Khi người dùng vuốt/kéo thả chuột hoặc ngón tay trên màn hình cảm ứng (iPad/iPhone/POS), bản đồ sẽ lướt êm ái tự nhiên và giảm tốc mượt mà như Google Maps / Apple Maps.
     * **Viewport Spatial Culling & Dynamic LOD**: Tự động chỉ vẽ các gian hàng trong tầm mắt khi phóng to và tinh chỉnh độ chi tiết chữ theo độ zoom, duy trì 60 FPS ổn định trên mọi thiết bị.
   - **Edit Mode & Tùy Chỉnh Bật/Tắt Nhãn Tooltip (Labels Appear Settings)**: Trong menu Hamburger góc phải trên cùng (nằm giữa mục "Đồng bộ Apple Calendar" và "Print Preview"), mục **Edit Mode** cho phép người dùng mở bảng cấu hình chuyên sâu của mặt bằng:
     * `Project Code`: Mã gian hàng / Mã dự án.
     * `Project Name`: Tên dự án / Tên thương hiệu.
     * `MD Status`: Huy hiệu trạng thái MD (`approached`, `negotiation`, `Verbally agreed`, `MOU signed`, `Signed agreement`, `Rejected`).
     * `AC Status`: Huy hiệu trạng thái thi công thực tế (Actual Status).
     * `Màu sắc Legend`: Bật/tắt toàn bộ màu sắc phân nhóm & tiến độ trên các gian hàng ngoài mặt bằng Live View lẫn trong ô Tooltip (khi tắt, các khối gian hàng sẽ chuyển sang chế độ trong suốt - transparent - giúp nhìn rõ trọn vẹn bản vẽ kiến trúc nền bên dưới cùng đường viền và tên gian hàng sắc nét, đồng thời tự động ẩn thanh chú thích màu nổi).
     * `Floor / Store`: Tầng và chi nhánh (HCM/HN).
     * `Start Date` & `End Date`: Mốc thời gian bắt đầu và kết thúc thi công.
     * `Detail`: Chi tiết các đầu việc phân nhóm.
     * `Description`: Mô tả và ghi chú dự án.
     * `Progress Bars`: Thanh tiến độ kế hoạch (Plan) và tiến độ thực tế (Act).
     * `Diện tích (m²)`: Kích thước diện tích sàn của gian hàng.
     * *Hệ thống tự động lưu cấu hình cá nhân này vào bộ nhớ thiết bị, có sẵn các nút "Bật tất cả" và "Mặc định" để thao tác 1 chạm nhanh chóng.*
   - **Thanh Chú Thích Màu Chuẩn Thiết Kế Chuyên Nghiệp (Floating Draggable Color Legend HUD)**: Được thiết kế dưới dạng bảng HUD nổi thông minh (Professional Canvas HUD), giải quyết triệt để vấn đề che khuất hay khó đọc:
     - **Tùy Chọn Vị Trí & Docking Linh Hoạt**: Hỗ trợ chuyển đổi nhanh vị trí gắn (Docking) sang `Top-Right` (ngay dưới nút Zoom, vị trí tối ưu chuẩn CAD/GIS), `Bottom-Right`, hoặc `Bottom-Left`. Hệ thống tự động ghi nhớ vị trí ưu tiên của bạn trên trình duyệt.
     - **Kéo Thả Tự Do (Universal Draggable)**: Tích hợp tay cầm kéo (`Grip Handle` ⠿) cho phép rê chuột hoặc chạm kéo bảng chú thích đến bất kỳ tọa độ nào trên mặt bằng mà không lo che khuất các gian hàng đang thao tác.
     - **Tìm Kiếm Nhanh (Inline Search)**: Khi có nhiều hơn 5 nhóm phân loại, thanh tìm kiếm thông minh xuất hiện tức thì giúp lọc nhanh theo tên ngành hàng (F&B, Thời trang, Mỹ phẩm...).
     - **Chạm 1 chạm để Lọc & Highlight**: Chạm vào một thẻ nhóm màu trên bảng Legend để highlight các gian hàng thuộc nhóm đó và tự động làm mờ các gian hàng còn lại trên mặt bằng; chạm lại lần nữa hoặc bấm nút `Clear Filter` để khôi phục hiển thị toàn bộ.
     - **Tích Hợp Xuất Bản Vẽ (Export Menu)**: Hỗ trợ xuất ảnh HD (JPEG), xuất tài liệu PDF khổ A3/A4, xem trước in ấn (Print Preview), và kích hoạt đồng bộ tự động lên Cloudflare R2 ngay từ bảng Legend.
     - **Nút Thu Gọn Siêu Nhẹ (Compact Pill Mode)**: Bấm nút Chevron để thu gọn thành một thanh pill nhỏ gọn `[ 🎨 Color Legend ]` cao chỉ 36px, tối đa hóa diện tích quan sát bản đồ.
   - **Bảng Tra Cứu Chú Thích Màu Toàn Diện (Color Legend Modal)**: Có thể mở nhanh bằng nút `[ Layers / All Groups ]`:
     - Hiển thị danh sách đầy đủ tất cả các nhóm ngành hàng/phân loại, mã màu sắc nét, số lượng gian hàng và danh sách chi tiết các mã gian hàng liên quan.
     - Cung cấp bảng quy chuẩn màu sắc trạng thái tiến độ dự án (`Completed` - Xanh lá, `On Process` - Xanh dương, `Upcoming` - Vàng cam, `Delay` - Đỏ) giúp người dùng tra cứu nhanh chóng mọi lúc mọi nơi.
    - **Hệ Thống Cảnh Báo Thông Minh & Chế Độ Lọc Sự Cố Mặt Bằng (Smart Alerts & Focus Mode)**:
      - **Huy hiệu cảnh báo trực quan (Smart Alert Badges)**: Tự động hiển thị huy hiệu đỏ (Critical) hoặc cam (Warning) ngay trên đỉnh gian hàng gặp vấn đề (công việc quá hạn, dự án chậm tiến độ, sắp bàn giao trong 3 ngày, hoặc nguy cơ trễ khai trương dưới 80% tiến độ khi còn dưới 5 ngày).
      - **Chống báo động giả & Gộp lỗi thông minh**: Loại trừ hoàn toàn cảnh báo đối với các gian hàng đã hoàn thành 100% nghiệm thu (Completed); tự động gộp trùng lặp giữa lỗi trễ tiến độ dự án và danh sách công việc quá hạn thành một thông điệp súc tích: `Project delayed (X overdue tasks)`.
      - **Chế độ Lọc Nhanh Sự Cố (Focus Alerts Mode)**: Nút bấm tiện ích `[ Focus Alerts ]` / `[ Alerts Only ]` ở góc trên và thanh công cụ đáy cho phép lọc nhanh chỉ hiển thị các gian hàng đang có sự cố, tự động làm mờ các gian hàng an toàn để người quản lý TTTM nhận diện ngay điểm nóng cần xử lý trên toàn tầng.
      - **Tương tác 1 chạm (Click-to-Action)**: Nhấp trực tiếp vào dải thông báo cảnh báo trong `LayoutUnitTooltip` sẽ mở ngay bảng chi tiết dự án và công việc (`Inspect`) để phối hợp xử lý tức thì với nhà thầu.
      - **Bảng Cấu Hình Thu Gọn (Accordion)**: Bảng tùy chỉnh Smart Alerts trong drawer được thiết kế dạng accordion thu gọn, cho phép bật/tắt linh hoạt từng loại cảnh báo: Overdue Tasks, Project Delay, Opening Risk, Handover Notice, Opening Notice.
6. **Quy trình Xuất tự động 3 bước (Trigger Export - Live View & Layout)**:
   - Khi bấm nút **"Trigger Export"** (ở thanh công cụ Layout hoặc trong Menu chế độ Live View), hệ thống sẽ tự động thực hiện 3 bước tuần tự:
     - **Bước 1 — Tải Cloud R2 (Load Cloud)**: Kiểm tra thông minh dữ liệu trong ứng dụng; nếu dữ liệu bản vẽ Picture Mapping đã được tải từ Cloud trước đó thì tự động bỏ qua để tối ưu tốc độ và tránh ghi đè, nếu chưa có sẽ tự động tải cấu hình và ảnh nền mới nhất từ Cloudflare R2 về ứng dụng.
     - **Bước 2 — Áp dụng toàn bộ Dynamic Rules (Apply Rules)**: Tự động đánh giá toàn bộ các bộ quy tắc (Dynamic Rules) của tất cả các tầng/version thuộc chi nhánh đang xem, tự động cập nhật tiến độ, tính toán dữ liệu và tô màu chuẩn cho các gian hàng.
     - **Bước 3 — Lưu Cloud R2 (Save Cloud & Trigger)**: Tự động đóng gói cấu hình bản vẽ và lưu lên Cloudflare R2 cho toàn bộ chi nhánh đang xem, đồng thời kích hoạt trigger để cập nhật hiển thị đồng bộ tức thời.
6. **Quản lý Dynamic Hierarchy & Nhóm theo từng Version (Per-Version Groups)**:
   - Các nhóm quy tắc (Rule-Based Groups) và điều kiện lọc (Conditions API) được lưu trữ độc lập theo từng phiên bản (version). Khi chuyển đổi giữa các version, hệ thống sẽ tự động hiển thị chính xác các nhóm và điều kiện thuộc riêng version đó.
   - Khi cần sao chép nhanh bộ quy tắc từ version khác, sử dụng tính năng **`[ COPY GROUPS FROM ]`** để nhân bản danh sách nhóm sang version đang chọn.
   - **Các trường lọc quy tắc thông minh (Rule Conditions & Project Integration)**: Bên cạnh các chỉ số bán hàng và diện tích từ Excel (Sales, Margin, Size, Profit...), hệ thống tích hợp sâu các trường dữ liệu dự án thời gian thực (Real-time Project Attributes) liên kết theo mã gian hàng (Unit Code):
     * **`App: MD Status`**: Lọc theo trạng thái MD Status của dự án (`approached`, `negotiation`, `Verbally agreed`, `MOU signed`, `Signed agreement`, `Rejected`).
     * **`App: Act Status`**: Lọc theo trạng thái thi công thực tế (Actual Status) được tính toán tự động dựa trên tiến độ và các nhóm ủy quyền (Delegation Groups) của dự án.
     * **`App: Detail (Project)`**: Lọc theo nội dung chi tiết hoặc ghi chú của dự án mẹ.
     * **`App: Description (Project)`**: Lọc theo mô tả công việc/dự án (tự động nhận diện từ các trường Detail, Description hoặc Note).
     * **`App: Party`**: Lọc theo tên nhà thầu, đơn vị phụ trách hoặc đối tác thi công (`party` / `contractor`).
     * Hỗ trợ đầy đủ các toán tử so sánh chuỗi linh hoạt: `=`, `contains` (chứa các từ khóa), `exclude` (loại trừ từ khóa) cũng như các toán tử số học `>`, `<`, `>=`, `<=`. Dữ liệu được chuẩn hóa và tự động đồng bộ xuyên suốt từ giao diện Dynamic Tab, Live Layout Viewer cho đến tiến trình Trigger Export.

7. **Kiến Trúc Tối Ưu Cho Dynamic Rules (Senior Reactive In-Memory Engine & Explicit R2 Cloud Persistence)**:
   - **Tầng 1: Đánh giá tức thời trên bộ nhớ RAM (In-Memory Evaluation - 0ms)**: Danh sách gian hàng thuộc các nhóm quy tắc được đánh giá tự động tức thì trên RAM (Zustand Global Store `useAppStore` & `useDataStore`) thông qua thuật toán tối ưu hóa `useDynamicRules`. Tốc độ tính toán dưới 3ms cho toàn bộ các tầng, không tốn bất kỳ lượt đọc/ghi Firestore hay Cloud R2 nào, loại bỏ hoàn toàn các vòng lặp ghi đè bản nháp khi đang tinh chỉnh quy tắc.
   - **Tầng 2: Đồng bộ Cloud chuẩn xác theo lệnh (Intentional & Reliable R2 Persistence)**: Loại bỏ các luồng auto-save 5 giây và ngắt kết nối dở dang khi tắt trình duyệt (`beforeunload`). Cấu hình chỉ được ghi vĩnh viễn lên Cloudflare R2 khi người dùng chủ động bấm **"Apply Rules"** (Áp dụng quy tắc) hoặc bấm **"Save Cloud"**, đảm bảo tính toàn vẹn 100% của bản vẽ phát hành chính thức và tiết kiệm chi phí lưu trữ tối đa.
   - **Huy hiệu chỉ báo trạng thái trực quan**: Ngay tại thanh công cụ Dynamic Hierarchy, hệ thống hiển thị huy hiệu trạng thái:
     * `🟢 RAM 0ms`: Báo hiệu thuật toán RAM đang phản hồi tức thì trong chưa đầy 3ms.
     * `🔵 Lưu R2...`: Báo hiệu tiến trình đang tải bản cập nhật lên Cloudflare R2 ở chế độ ngầm không chặn UI.
     * `🟢 R2 Đã lưu`: Báo hiệu toàn bộ cấu hình quy tắc và màu sắc đã được đồng bộ lên Cloudflare R2 an toàn.
     * `⚪ R2 Sẵn sàng`: Sẵn sàng cho lần áp dụng quy tắc tiếp theo.

8. **Giao Diện Thanh Công Cụ Tinh Gọn, Chống Che Khuất & Tối Ưu Màn Hình Nhỏ (Optimized & Collision-Free Responsive Toolbar)**:
   - **Cụm Hàng Trên — Tiêu Đề, Bộ Lọc Hợp Nhất & Cụm Nút Hành Động Liền Kề Nút Gantt**:
     * Tích hợp Store, Location và Year vào một thanh kính mờ bo tròn nhỏ gọn (`Unified Filter Pill`), giảm thiểu chiều cao thanh công cụ.
     * **Tích hợp Cụm Nút Hành Động lên cùng hàng Nút Gantt**: Các nút `[ ← Gantt ]`, `[ Live Map / Exit Live ]`, `[ Refresh ]`, `[ Export ]` (và `[ Edit URL ]` cho Quản trị viên) được gom lên cùng một cụm điều khiển liền kề nhau. Trên điện thoại di động, các nút nằm trọn vẹn trong một hàng ngang nhỏ gọn, loại bỏ hoàn toàn 1 dòng công cụ thừa, giúp giảm đáng kể kích thước chiếm dụng dọc và mở rộng tối đa vùng hiển thị cho mặt bằng.
     * Trạng thái xuất file (`Export Status`) chỉ hiển thị khi đang trong tiến trình xuất (kèm biểu tượng xoay linh hoạt), loại bỏ hoàn toàn các thông báo trạng thái dư thừa gây chật chội màn hình.
   - **Hàng Tìm Kiếm Toàn Chiều Rộng, Độ Zoom 70% & Chống Che Gian Hàng (Smart Search Zoom 70% & Obstruction-Proof Positioning)**:
     * Ô tìm kiếm `Tìm ô unit, brand hoặc dự án...` chiếm trọn vẹn toàn bộ chiều rộng, mang lại không gian rộng rãi, thoáng đãng, văn bản gợi ý không bị chèn ép hay cắt ngắn.
     * **Độ Zoom Chuẩn 70%**: Khi tìm kiếm ô unit hoặc dự án, hệ thống tự động pan và phóng to bản đồ về tỷ lệ chuẩn **70% (Zoom 70%)**, giúp người dùng nhìn rõ đồng thời cả chi tiết gian hàng và bối cảnh vị trí các gian hàng lân cận trên cùng một tầng.
     * **Tự Động Tính Toán Thông Minh Không Che Unit (Smart Obstruction-Proof Placement)**: Bảng thông tin chi tiết (Tooltip) tự động nhận diện tọa độ màn hình của gian hàng mục tiêu để tính toán vị trí đặt tooltip sang bên phải, bên trái hoặc phía trên/dưới, đảm bảo **100% không bao giờ che khuất ô unit đang tìm kiếm**.
     * **Hỗ Trợ Kéo Thả Di Chuyển Tự Do (Universal Draggability)**: Tất cả các bảng modular, hộp thoại và tooltip nổi (`LayoutUnitTooltip`, `TaskModularModal`, `ProjectModal`...) đều hỗ trợ tính năng kéo thả di chuyển linh hoạt (Pointer Drag với biểu tượng tay nắm `GripHorizontal`) giúp người dùng thoải mái kéo dịch chuyển bảng sang vị trí khác để quan sát các vùng bản vẽ hoặc dữ liệu bên dưới.
      * **Hệ Thống Quản Lý Độ Sâu Thứ Tự Lớp Toàn Cục (Central Z-Index & Overlay Depth Management - AGENTS.md Rule 11 & 12)**:
        - Quản lý tập trung thứ tự hiển thị qua `src/lib/zIndexManager.ts` chuẩn kiến trúc AGENTS.md.
        - **Phân tầng an toàn**: `LAYOUT_TOOLTIP` (`z-[50000]`) luôn nằm dưới `MODAL_BASE` (`z-[100000]`), `MODAL_NESTED` (`z-[120000]`), `QUICK_NAV` & `MINI_GANTT` (`z-[150000]`), `CONFIRM_ALERT` (`z-[160000]`), `LIGHTBOX` (`z-[180000]`), và `TOAST` (`z-[200000]`).
        - **Tự động đóng Tooltip khi chuyển tab (Tab-Switch Auto-Close)**: Khi người dùng chuyển sang bất kỳ tab nào khác (`gantt`, `detail`, `budget`, `cost`, `summary`...), `useOverlayStack` và listener tương tác sẽ tự động thu dọn sạch sẽ Tooltip và trạng thái ghim, đảm bảo không lưu lại rác giao diện.
   - **Chống Va Chạm & Chồng Lấn Trên Bản Đồ (Anti-Collision Floating Controls)**:
     * Cụm góc trên bên trái (`Store • Location • Version`) và cụm góc trên bên phải (`Zoom In/Out/Percentage/Fit`) được điều chỉnh kích thước và khoảng cách an toàn (`top-2.5`, font chữ và padding tối ưu theo màn hình), đảm bảo khoảng cách thông thoáng > 100px ở giữa, tuyệt đối không bị đè hay chạm vào nhau trên bất kỳ kích cỡ điện thoại nào.
     * Chiều cao bản đồ sử dụng đơn vị `100dvh` (Dynamic Viewport Height) chuẩn xác cho Safari/Chrome Mobile, loại bỏ tình trạng thanh công cụ đẩy bản đồ xuống quá dài gây hiện tượng cuộn trang không mong muốn.
     * Ở góc dưới, cụm nút nổi `[ 🎨 Chú thích màu ]` và `[ ☰ Menu ]` được bo tròn mềm mại ngay chính giữa đáy màn hình, giúp thao tác ngón cái dễ dàng mà không che lấp các gian hàng ở rìa dưới.

---

### 4.9. 🖨️ XUẤT DỮ LIỆU & IN ẤN BÁO CÁO (EXPORT & PRINT)
1. **Xuất Excel / CSV**: Nhấp nút **"Export CSV/Excel"** ở menu góc bảng để tải toàn bộ bảng tính về máy tính.
2. **In ấn & Xuất hình ảnh độ nét cao (Print Preview & Export PNG/PDF)**:
   - **Cách kích hoạt**: Mở menu góc (Hamburger Menu ☰ trên thanh Header) khi đang ở bất kỳ tab nào (Gantt, Layout, General, Detail, Budget, Cost) và chọn **"Print Preview"** hoặc **"Export as PNG"**. Trên tab Layout Live View, cũng có thể mở qua nút Print Preview trong menu đáy màn hình.
   - **Tùy chọn in**:
     - Chọn khổ giấy: `A2`, `A3` hoặc `A4` (Hướng ngang Landscape hoặc Hướng dọc Portrait).
     - Điều chỉnh tỷ lệ thu phóng (Scale: 50% - 150%) hoặc chế độ Fit to Width / Fit to Height.
     - Tùy chọn đóng dấu mờ bản quyền: Tích chọn **"Watermark"** (`DRAFT`, `CONFIDENTIAL` hoặc `None`) để hiển thị dấu bảo mật nội bộ Takashimaya.
     - Tùy chọn hiển thị thông tin lọc (**Show Filter Header**) và ngày in (**Show Date**).
   - **Chế độ In Mặt Bằng Tràn Khung & Kèm Bảng Ký Hiệu (Full-Bleed Layout Print with High-Contrast Legend Overlay)**:
     - Khi in từ Tab **Layout**: Hệ thống tự động tối ưu hóa bản in tràn viền mép giấy (Edge-to-Edge), loại bỏ hoàn toàn các khoảng trống thừa 2 bên, viền hộp thừa và tiêu đề header bên ngoài.
     - Tự động hiển thị **Bảng Chú Thích Ký Hiệu Màu Sắc (Legend Overlay)** sắc nét ngay góc bản vẽ với đầy đủ các nhóm ngành hàng/trạng thái và số lượng ô gian hàng tương ứng, giúp bản in mặt bằng trực quan và rõ ràng nhất.
     - Tự động kích hoạt cơ chế `beforeprint` để căn chỉnh và phóng to hình nền bản vẽ vừa khít 100% trang in theo thời gian thực.
   - **In ấn & Xuất file**: Bấm **"Print Document"** (hoặc Save PDF) để in ra máy in hoặc lưu file PDF độ nét cao. Mọi thanh công cụ điều khiển, thanh zoom và menu nổi sẽ tự động ẩn đi để tạo bản in mặt bằng sạch sẽ, chuyên nghiệp.

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

20. **Điều hướng thông minh từ Trung tâm Thông báo sang Mặt Bằng Trực Quan (Notification to Layout Liveview Navigation)**: 
   - Khi người dùng nhấp vào bất kỳ thẻ thông báo nào trong danh sách **Active Notifications** (hạn chót dự án, mốc bắt đầu/bàn giao, tiến độ công việc, hoặc nhắc việc @mention):
     + Hệ thống tự động nhận diện Chi nhánh (`HCM`/`HN`), Năm (`Year`), Tầng/Vị trí (`Location`: ví dụ `L3` từ mã `L3-306-2`) và Mã dự án (`projectCode`).
     + **Tự động chuyển thẳng sang phân hệ Mặt bằng (Layout Tab) ở chế độ Trực quan (Liveview Mode)**: Hệ thống tự động đồng bộ bộ lọc Chi nhánh, mở đúng Tầng của gian hàng, tự động phóng to (zoom & pan) và hiển thị thẻ thông tin tiến độ/bản đồ của dự án tương ứng.
     + Nếu thông báo liên quan đến bình luận/trao đổi (@mention), cửa sổ Chat sẽ được mở ngay trên nền mặt bằng Liveview giúp người dùng trao đổi tức thì mà vẫn giữ nguyên vị trí trên bản đồ.

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
   - **Tìm Kiếm Gian Hàng / Dự Án & Tự Động Phóng To (Smart Unit Search & Auto-Zoom)**:
     - Cạnh nút xuất sơ đồ trên thanh công cụ Layout Tab có ô tìm kiếm **"Tìm gian hàng / dự án / brand..."** với chữ nhập vào màu tím đậm nổi bật (`text-purple-700` / `text-purple-300`), nét chữ đậm rõ ràng, độ tương phản cao trên cả nền sáng và tối.
     - Hỗ trợ tìm kiếm theo: **Tên gian hàng (Unit code / Unit name)**, **Tên dự án**, **Tên thương hiệu (Brand)** hoặc **Mã code dự án**.
     - **Tự động chuyển tầng / vị trí**: Khi bạn chọn một gian hàng hoặc dự án thuộc tầng/vị trí khác, hệ thống sẽ **tự động chuyển ngay sang tầng đó** và thực hiện phóng to (zoom & pan) mượt mà vào chính giữa gian hàng được chọn kèm viền highlight vàng nổi bật và thẻ thông tin chi tiết.
     - **Tự Động Xóa Ký Tự Đóng Băng & Thoát Zoom (Auto Clear Search & Unfreeze)**: Khi người dùng xóa hết ký tự trong ô tìm kiếm (Backspaced/Deleted rỗng), nhấn nút **X** trên ô tìm kiếm, bấm nút **"Thoát zoom" (X)** trên thanh thông báo nổi, đóng thẻ tooltip thông tin hoặc nhấn phím **Esc**, hệ thống sẽ tự động xóa sạch các ký tự bị đóng băng (freeze) trong ô search và đưa sơ đồ về trạng thái vừa vặn toàn màn hình (Fit to screen) tức thì.
   - **Hiển thị Tên Gian Hàng Siêu Nét (Không Đổ Bóng - Crystal Clear Vector Text)**: Tên gian hàng trên sơ đồ mặt bằng được thiết kế không viền bóng (no drop shadow/stroke), sử dụng thuật toán tính toán độ tương phản chuẩn YIQ giúp chữ luôn có độ tương phản tối đa (chữ đen đậm trên ô màu sáng, chữ trắng tinh trên ô màu tối), sắc nét và dễ đọc nhất ở mọi mức phóng to.
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
   - **Bộ Lọc Chi Nhánh Trực Quan Trong Tab Thông Báo**: Tab Notification được bổ sung bộ nút lọc chi nhánh: **All Stores**, **HCM**, và **HN** (tự động phân quyền hiển thị theo `getUserAllowedStores(currentUser)` để tài khoản chỉ thấy các chi nhánh mình được cấp quyền) kèm theo huy hiệu đếm số lượng thông báo chưa đọc cho từng chi nhánh. Bộ lọc này tự động đồng bộ theo bộ lọc chi nhánh toàn cục trên Header và cho phép người dùng chuyển nhanh để xem thông báo riêng cho từng địa bàn làm việc.
   - **Định Tuyến Tuyệt Đối Theo Chi Nhánh (Zero Store Collision)**: Khắc phục triệt để tình trạng hai chi nhánh có mã dự án trùng nhau hoặc cùng tên công việc. Mỗi thẻ thông báo mang đầy đủ thông tin `projectStore` và `projectYear`. Khi nhấp vào thông báo, hệ thống tự động:
     1. Đồng bộ `globalStoreFilter` về đúng chi nhánh của dự án (HCM hoặc HN).
     2. Đồng bộ `globalYearFilter` về đúng niên độ của dự án.
     3. Mở chính xác Modal công việc/dự án của chi nhánh đó mà không bao giờ bị nhầm sang chi nhánh khác.

38. **Dọn Dẹp Bản Ghi Ủy Quyền Trùng Lặp & Định Danh Chuẩn Hóa Theo Chi Nhánh & Niên Độ (Multi-Store & Year Scoping Delegation)**:
   - **Phân tách tuyệt đối giữa các Chi nhánh & Năm**:
     - **Đối với Công việc (Task)**: Sử dụng ID xác định `del_[taskId]`. Bản thân mỗi công việc trong hệ thống đã có mã duy nhất (`taskId`), đồng thời luôn lưu trữ đầy đủ `projectCode`, `projectStore` và `projectYear` của công việc cha.
     - **Đối với Dự án (Project-level)**: Do cùng một mã dự án (ví dụ `CP-01` hay `PRJ-01`) có thể xuất hiện độc lập ở các chi nhánh khác nhau (HCM vs HN) hoặc giữa các niên độ (2026 vs 2027), định danh nhóm ủy quyền dự án được tạo theo cấu trúc đa tầng chuẩn xác: `del_proj_[code]_[store]_[year]` (ví dụ: `del_proj_CP-01_HCM_2026`). Điều này đảm bảo dữ liệu ủy quyền giữa HCM và HN, hoặc giữa năm 2026 và 2027 hoàn toàn tách biệt, không bao giờ bị ghi đè hay gộp nhầm lẫn sang nhau.
   - **Công Cụ Quản Trị Dọn Dẹp Bản Ghi Trùng Lặp & Phân Công Rỗng (Prune Empty Delegations)**: Trong tab Cài đặt (Settings) ➔ **Database Maintenance**, Quản trị viên có nút **"Prune Empty Delegations"** (màu tím với biểu tượng `Layers`).
     - Khi bấm, hệ thống quét toàn bộ bộ sưu tập `taka_delegation_groups`, tự động phân tách và phát hiện các bản ghi rỗng phát sinh tự động khi import Excel (các nhóm chỉ có 1 subtask trống không tên, không comment, không tệp đính kèm, không báo cáo).
     - Hệ thống giữ nguyên 100% tất cả các nhóm phân công thật (genuine groups) có trao đổi, có phân công rõ ràng hoặc có tiến độ thực tế, đồng thời dọn sạch các bản ghi rỗng dư thừa trên cả Cloud Firestore, Dexie IndexedDB và Zustand Store.
     - Cắt giảm ngay lập tức hơn 95%–99% kích thước collection (từ hơn 3.100 bản ghi xuống còn vài chục bản ghi thực tế), triệt tiêu hoàn toàn bão đọc Firestore.
   - **Cơ Chế Tải Thông Minh Smart Tri-Gate + Local-First Delta Sync cho Task Delegation**:
     - Khi người dùng ở các tab tổng quát (Gantt, Detail, Notification), hệ thống nạp dữ liệu phân công trực tiếp từ bộ nhớ đệm Dexie IndexedDB trong 5ms (0 read).
     - Toàn bộ đột biến phân công mới được đồng bộ tức thời qua kênh siêu nhẹ `taka_deltas` (Delta Sync), không cần quét lại toàn bộ collection hàng ngàn bản ghi, giúp bảo toàn 100% độ chính xác của % tiến độ thực tế mà không gây tốn lượt đọc Firestore.
     - Cơ chế Smart Import: Khi nhập file Excel/CSV, hệ thống chỉ tạo nhóm phân công khi cột `Party` có người phụ trách cụ thể, loại bỏ hoàn toàn việc tự động sinh hàng ngàn bản ghi rỗng khi import.

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
- **Bộ Nhớ Đệm Mã Nguồn & Shell Ứng Dụng (Static Asset & Service Worker Cache)**:
  - Toàn bộ file mã nguồn (`.js`, `.css`), font chữ và icon ứng dụng được tự động lưu vào Cache Storage của iPhone và trình duyệt qua Service Worker:
    + **Cache-First (0ms)**: Áp dụng cho các bundle mã nguồn (Vite Chunks có hash nội dung). Trình duyệt nạp trực tiếp từ ổ cứng thiết bị chỉ trong 0ms, triệt tiêu độ trễ mạng khi chuyển trang hoặc mở lại ứng dụng.
    + **Network-First**: Áp dụng cho trang khởi động `index.html`. Khi có mạng, ứng dụng luôn lấy phiên bản mới nhất từ server; nếu mất kết nối hoặc mạng chập chờn, tự động nạp từ cache trên máy để không bị lỗi màn hình trắng.
    + **Bảo Toàn Tuyệt Đối Dữ Liệu Thời Gian Thực**: Mọi truy vấn Firestore, WebSocket, xác thực tài khoản và tác vụ tải file R2 được cấu hình vượt rào (bypass) hoàn toàn, đảm bảo tính tức thời 100% của số liệu dự án và không bao giờ xung đột với dữ liệu của các phòng ban khác.

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
     - **Bảng Tooltip hiển thị các Task Con đang On Process (In Progress)**: Khi bạn rê chuột (hoặc nhấp) vào thanh ngang biểu đồ Gantt của Task Mẹ gom nhóm (có biểu tượng mũi tên tím), bảng chú giải (Tooltip) sẽ tự động hiển thị chi tiết danh sách các **Task con đang trong tiến trình thi công (`Tasks In Progress`)** kèm mã task và % tiến độ hoàn thành thực tế, giúp người dùng nắm bắt ngay hiện trạng thi công chi tiết của từng hạng mục con mà không cần phải mở rộng cây công việc.


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
* **Tối Ưu Hóa GPU & Bỏ Render Unit Không Có Dự Án (High-Performance Liveview Culling)**: Tại phân hệ **Layout Liveview**, hệ thống tự động loại bỏ các gian hàng/unit không có dự án (`hasAppProject = false`) trong niên độ, chi nhánh và tầng đang xem ra khỏi cây kết xuất đồ họa (Konva Render Tree). Nhờ đó, số lượng nút vẽ, tính toán hit-graph và thao tác quét GPU giảm tới 80-90%, mang lại tốc độ phóng to/thu nhỏ (Zoom) và kéo (Pan) siêu mượt 60 FPS ngay cả trên thiết bị di động yếu.
* **Cơ chế Tiết Kiệm Ghi Firestore 2 Lớp (Dirty Check Write Optimization)**: Khi người dùng chỉnh sửa công việc (Task), hệ thống tự động kiểm tra xem các mốc thời gian (`start`, `finish`), trạng thái hoàn thành (`isCompleted`, `status`), số lượng công việc con (`taskCount`) hoặc tiến độ (`progress %`) có thực sự thay đổi hay không. Nếu người dùng chỉ cập nhật bình luận (comments), chỉnh sửa mô tả tên công việc, ghi chú hoặc phân công mà không làm thay đổi các mốc ngày/tiến độ tổng hợp, hệ thống sẽ tự động bỏ qua lệnh ghi vào document dự án tổng hợp (`taka_projects`) trên Firestore (đạt 0 write cho Project), trong khi vẫn duy trì cập nhật giao diện tức thời (Optimistic UI 0ms).
* **Bộ Đệm Cấu Hình Tĩnh & Theo Dõi Phiên Bản (Static Config Cache + Versioning)**: Các danh mục cấu hình ít biến động (`taka_locations` - Danh sách chi nhánh/vị trí, `taka_parties` - Đối tác, `taka_settings/exchange_rates` - Tỷ giá JPY/USD, `taka_rules` - Quy tắc thông báo) được lưu sẵn trong bộ nhớ đệm cục bộ (`localStorage`), giúp ứng dụng khởi động tức thì với **0 Read và 0ms độ trễ**. Hệ thống chỉ duy trì 1 listener phiên bản cực nhẹ (`taka_config/versions`). Khi Quản trị viên (Admin) thay đổi cấu hình, cờ phiên bản tương ứng sẽ được nâng lên, kích hoạt các máy trạm khác tải lại đúng danh mục bị thay đổi trong tích tắc mà không cần lắng nghe liên tục 4 collection riêng biệt.

---

## 🗺️ 15. PHÂN HỆ VẼ VÀ ÁNH XẠ MẶT BẰNG (PICTURE MAPPING)

Phân hệ **Picture Mapping** cung cấp công cụ số hóa, vẽ gian hàng và gán dữ liệu chuyên đề (Thematic Mapping) trực tiếp lên ảnh mặt bằng kỹ thuật số.

### ✏️ Tạo Mới & Đặt Tên Gian Hàng Tự Do (Unit Creation & Free-Form Naming):
- **Tự do tạo tên Unit mới**: Tại **Edit Tab**, người dùng có thể tùy ý nhập và tạo tên gian hàng/unit mới mà không bị giới hạn bắt buộc phải chọn từ danh sách Master Units có sẵn.
- **Cửa sổ gán tên sau khi vẽ hình (Pop-up Assign / Create Unit Name)**:
  + Khi vẽ xong một hình khối (Polygon, Hình chữ nhật, Hình tròn), cửa sổ đặt tên hiển thị cho phép nhập tên unit bất kỳ.
  + Nhấn phím **Enter** hoặc bấm nút **"Create"** để tạo và gán ngay lập tức tên unit vừa gõ.
  + Danh sách gợi ý vẫn hiển thị các unit tương đồng từ hệ thống để hỗ trợ chọn nhanh nếu muốn.
- **Bảng thuộc tính bên phải (Properties Panel - Unit Name)**:
  + Ô **Unit Name** hỗ trợ nhập trực tiếp ký tự và lưu tức thì. Nếu tên gõ mới chưa có trong danh mục, nút gợi ý *"Create unit: [Tên]"* sẽ hiển thị để xác nhận nhanh.

### 🏢 Phân Tách Dữ Liệu Theo Store & Location (Chi Nhánh & Tầng):
1. **Bộ lọc Store & Location áp dụng phân quyền tài khoản (RBAC Account Control)**:
   - Trên thanh công cụ trên cùng của phân hệ (Data Mapping Bar), hệ thống tích hợp sẵn cụm bộ lọc:
     - **Store**: Chọn chi nhánh **HCM** hoặc **HN**. Menu tự động lọc theo `storePermissions` của người dùng; nếu tài khoản chỉ có quyền HCM hoặc HN, hệ thống sẽ tự động khóa và chỉ cho phép thao tác trên chi nhánh được phân quyền.
     - **Location**: Chọn tầng cụ thể (**B2, B1, L1, L2, L3, L4, L5...**). Danh sách tầng được kiểm soát nghiêm ngặt theo quyền `locationPermissions` trong Account Control. Nếu người dùng không có quyền truy cập tầng nào đó, tầng đó sẽ tự động bị ẩn khỏi danh sách lựa chọn.
     - **Year (Bộ lọc Niên độ Năm)**: Chọn năm làm việc cụ thể (**2024, 2025, 2026, 2027, 2028...**). Bộ lọc Year hiện diện đồng bộ ở thanh công cụ chính (Data Mapping Bar), tab **Dynamic Hierarchy**, và tab **Review**, giúp đồng bộ hoàn toàn với niên độ dự án của Task Detail, General và Layout.
     - **Quản lý Phiên bản theo Year**: Bất kỳ phiên bản bản vẽ (`MapVersion`) nào được tạo mới (`Add Version`), nhân bản (`Duplicate Version`) trong tab Dynamic Hierarchy, Review hay Edit đều tự động lưu kèm trường dữ liệu `year`. Tab Layout Live View tự động đọc theo đúng `version` và lọc theo `year` được chọn tại Picture Mapping.
     - **Bộ đếm Unit**: Hiển thị số lượng gian hàng thực tế đang có tại tầng/chi nhánh tương ứng.
2. **Cơ chế phân vùng và cô lập dữ liệu độc lập (Zero Cross-Contamination)**:
   - Toàn bộ dữ liệu gian hàng (`mapUnits`), hình vẽ (Polygon, Hình chữ nhật, Hình tròn), ảnh mặt bằng kỹ thuật (`backgroundUrl`), tỷ lệ scale/tọa độ và các phiên bản (`mapVersions`) được cô lập hoàn toàn theo từng cặp `(Store, Location)`.
   - Khi chuyển từ `HCM - L1` sang `HCM - L2`, hệ thống tự động lưu giữ trạng thái vẽ của `L1` và mở ra không gian vẽ riêng biệt của `L2`. Khi quay lại `L1`, toàn bộ hình vẽ và ảnh nền trước đó được khôi phục nguyên vẹn 100%.
   - **Đồng bộ thời gian thực với Tab Layout (Live View)**:
     + Dữ liệu phiên bản kích hoạt (`activeMapVersionId`), các nhóm ngành hàng (`groups`), và tô màu quy tắc động (`unitColorMap`) được đồng bộ trực tiếp giữa Picture Mapping và Tab Layout Live View cho mọi tầng (L1, L2, L3,...).
     + **Tự động nhận diện và hiển thị màu sắc theo từng tầng (Floor-Aware Thematic Mapping)**: Khi chuyển sang tầng L2 (hoặc bất kỳ tầng nào), hệ thống tự động tìm nạp đúng phiên bản bản vẽ của tầng đó (ví dụ `pm-l2-hcm`), tập hợp toàn bộ gian hàng và áp dụng đầy đủ quy tắc tô màu theo phân nhóm hoặc ánh xạ thủ công tương đương như ở Tab Review của Picture Mapping.
     + **Bộ chuyển đổi phiên bản trực tiếp (Layout Version Switcher)**: Tại góc trên bên trái của Live Layout Viewer, hệ thống tích hợp sẵn huy hiệu định vị Chi nhánh • Tầng (`HCM • L2`) cùng danh sách chọn phiên bản (`Version Selector`) nếu tầng đó có nhiều phiên bản mặt bằng khác nhau, cho phép người dùng chuyển đổi xem các kịch bản bố trí ngay lập tức.
3. **Đồng Bộ Đầy Đủ Tất Cả Các Tab & Phân Vùng Lên Cloudflare R2 (Full Cloud Sync)**:
   - **Đồng bộ toàn diện & Bảo toàn 100% tất cả Version và Unit (Comprehensive Version & Unit Preservation)**:
     - Khi nhấn **Save Cloud** (kể cả khi đang ở chế độ xem Dynamic, Edit hay Review), hệ thống sẽ đóng gói và sao lưu toàn bộ trạng thái của phân hệ Picture Mapping lên file `mapping_config.json`:
       + **Bảo toàn 100% tất cả các Versions**: Hệ thống tự động hợp nhất (union) toàn bộ các phiên bản bản vẽ trên Cloud và ở máy cục bộ theo ID, bảo đảm không bao giờ bị ghi đè, mất phiên bản cũ của các năm hoặc phiên bản do người khác tạo.
       + **Bảo toàn 100% tất cả các Units**: Toàn bộ danh sách các hình khối gian hàng (`mapUnits`) trên tầng đang xem và mọi tầng khác đều được lưu trữ đầy đủ, không bị ghi đè thành rỗng.
       + **Toàn bộ chi nhánh & tầng**: Lưu giữ cấu trúc phân vùng `storeLocationData` đầy đủ cho cả HCM và HN trên mọi tầng (B2, B1, L1, L2, L3, L4, L5,...), không bị ghi đè hay mất dữ liệu giữa các tầng.
       + **Chống từ chối ghi (Zero Rejection Guarantee)**: 
         * Cơ chế bảo vệ trần dung lượng 1MB của Firestore: Tự động lọc bỏ các chuỗi base64 nặng trong bản vẽ để Firestore không bao giờ báo lỗi `Document exceeds maximum allowed size`, đồng thời lưu trữ toàn vẹn file JSON đầy đủ trên Cloudflare R2 và LocalStorage.
         * Tự động làm sạch khoảng trắng (trim) thông tin xác thực R2, hỗ trợ 2 cơ chế tải lên (S3 SDK direct + Presigned URL fallback).
         * Hiển thị thông báo Toast nổi với số lượng chính xác: `Successfully saved X units and Y versions across all floors to Cloud!`.
       + **Tab Vẽ & Chỉnh Sửa (Edit Tab)**: Lưu đầy đủ các hình khối gian hàng (`mapUnits`), đồng bộ ngay lập tức vào thuộc tính `mapUnits` của các phiên bản bản vẽ (`mapVersions`), loại bỏ hoàn toàn tình trạng unit bị giữ tên cũ trong phiên bản khi xem Live Layout.
       + **Đồng bộ tự động khóa kết nối R2 (R2 Credentials Auto-Sync)**: Khóa R2 lưu trên Firestore được tự động nạp ngầm vào mọi tài khoản người dùng (bao gồm các tài khoản CP như CP-Hung, CP-Quynh) mà không cần cấu hình thủ công lại trên từng máy.
        + **Chống rò rỉ dữ liệu và chống trùng lặp giữa các tầng (Floor Boundary Matching & Geometry Deduplication)**: Trong tab Live Layout Viewer, hệ thống cách ly tuyệt đối gian hàng theo từng tầng (Store_Floor) bằng chuẩn khớp từ vựng chính xác (Regex Word Boundary), loại bỏ 100% việc trộn lẫn bản vẽ/unit của các tầng khác (như B11, B12 vào B1; hay L10, L11 vào L1), đồng thời tự động băm tọa độ hình học đa giác & hình chữ nhật (Geometry Hashing) để khử trùng hoàn toàn nét vẽ đè chập, bóng mờ hoặc chữ chồng lấn khi người dùng sửa/tách gian hàng.
        + **Đồng nhất 100% giữa Tab Liveview và Tab Picture Mapping (Zero Discrepancy)**: Cả hai tab hiển thị đầy đủ 100% các ô gian hàng của tầng (loại bỏ cơ chế ẩn ngầm các gian hàng chưa có dự án), đồng thời cùng sử dụng chung Động cơ Quy tắc động (useDynamicUnitSummary), phân giải ảnh nền Cloudflare R2 (r2://), kế thừa groupMappings và thuộc tính màu sắc, bảo đảm màu sắc, phân nhóm và nhãn luôn khớp nhau 100% giữa EditTab, ReviewTab và LiveLayoutViewer.
       + **Ảnh nền mặt bằng (R2 Backgrounds)**: Toàn bộ ảnh nền dưới dạng blob hoặc URL được tự động tải lên Cloudflare R2, lưu dưới dạng key chuẩn (`r2://bg_...`) và phân giải presigned URL tự động khi tải về.
       + **Tab Điều Kiện Động (Dynamic Hierarchy Tab)**: Lưu toàn bộ danh mục nhóm phân cấp (`groups`), bộ quy tắc điều kiện gán màu/phân nhóm (`rules`) và liên kết ánh xạ gian hàng (`groupMappings`).
       + **Tab Đánh Giá & Xem Lại (Review Tab)**: Lưu toàn bộ danh sách nhãn đã chọn (`reviewSelectedLabels`), bảng màu tùy chỉnh (`reviewLabelColors`) và các cài đặt hiển thị liên quan.
       + **Dữ liệu kinh doanh đính kèm**: Lưu trữ đồng bộ các bảng thông tin chuyên đề (`unitInfo`, `classInfo`, `actualClassInfo`, `sales`, `profits`, `subFees`, `mdStatus`, `projectStatus`, `basePlan`, `units`).
   - **Thu gom & Dọn rác file cũ tự động trên R2 (R2 Garbage Collector)**:
     - **Tự động xóa ảnh nền khi thay thế (Replace Background Auto-GC)**: Khi người dùng tải lên ảnh nền mới thay cho ảnh cũ của một Version, hệ thống tự động kiểm tra xem ảnh cũ trên R2 có còn được dùng bởi Version nào khác không. Nếu không, file cũ trên R2 sẽ được tự động xóa ngầm ngay lập tức, ngăn chặn rác mồ côi.
     - **Tự động xóa ảnh khi xóa Version (Delete Version Auto-GC)**: Khi xóa một phiên bản bản đồ, nếu ảnh nền của phiên bản đó là duy nhất và không còn liên kết với bất kỳ bản vẽ nào, hệ thống tự động gửi lệnh xóa file vật lý trên Cloudflare R2 trong nền (fire-and-forget 0ms).
     - **Tính năng Dọn rác R2 1 chạm (1-Click Clean R2 Button)**: Trên thanh công cụ Cloud Sync của Picture Mapping, hệ thống trang bị nút **"Clean R2"** (icon ✨). Khi bấm, hệ thống sẽ đối soát toàn bộ danh sách file ảnh nền trên R2 Bucket với các phiên bản đang hoạt động trên tất cả các tầng/chi nhánh, tự động thu gom và xóa sạch 100% các file ảnh nền mồ côi dư thừa, tiết kiệm tối đa chi phí lưu trữ Cloud.
   - **Tải từ Cloud (Load Cloud)**:
     - Khi nhấn **Load Cloud**, hệ thống tự động tải `mapping_config.json`, tạo signed URL 7 ngày cho toàn bộ ảnh nền trên mọi tầng và nạp đồng thời (atomic load) vào Zustand store mà không gây xung đột hoặc mất dữ liệu.
4. **Cơ Chế Bảng Pop-up Linh Hoạt (Draggable & Responsive Viewport)**:
   - **Tự động điều chỉnh kích thước theo khung hình**: Tất cả các bảng pop-up trong phân hệ Picture Mapping (bảng gán tên gian hàng *Assign Unit Name*, bảng chia sẻ *Share Review Viewer*, bảng xuất bản vẽ *Export Map / Upload to R2 / Drive*, và bảng cấu hình *Cloudflare R2*) được tối ưu chiều cao (`max-h-[85vh]` - `max-h-[88vh]`) và chiều rộng linh hoạt (`max-w-[calc(100vw-1rem)]`), thân bảng có thanh cuộn mượt mà giúp người dùng luôn xem trọn vẹn nội dung trên mọi kích cỡ màn hình mà không bị tràn khung.
   - **Kéo di chuyển tự do (Draggable)**:
     - Trên thanh tiêu đề của mỗi pop-up đều có icon tay cầm kéo di chuyển (`GripHorizontal`) và trạng thái con trỏ trực quan (`cursor-grab` / `cursor-grabbing`).
     - Người dùng có thể nhấn giữ thanh tiêu đề và kéo pop-up đến bất kỳ vị trí nào trên màn hình để không che khuất bản vẽ mặt bằng đang quan sát phía dưới.
     - Phạm vi kéo di chuyển được giới hạn thông minh bên trong khung hình (`bounds="parent"`), ngăn cửa sổ bị trôi ra ngoài màn hình.
     - Trên màn hình thiết bị di động nhỏ (<640px), tính năng kéo tự động chuyển sang chế độ cố định giữa màn hình để người dùng thao tác chạm vuốt cuộn nội dung thuận tiện nhất.
5. **Hướng Dẫn Cấu Hình Cloudflare R2 & Khắc Phục Lỗi Khi Lưu (CORS / Token)**:
   - **Bước 1 - Tạo R2 API Token**:
     + Đăng nhập Cloudflare Dashboard &gt; chọn **R2** &gt; chọn **Manage R2 API Tokens** &gt; bấm **Create API token**.
     + Tại mục **Permissions**: Bắt buộc chọn **Object Read & Write** (hoặc *Admin Read & Write*). *Lưu ý: Không chọn "Object Read Only" vì hệ thống sẽ không thể ghi file.*
     + Mục **Specify bucket**: Chọn Bucket của bạn hoặc "All buckets".
     + Bấm **Create API Token**, copy các thông tin: `Access Key ID`, `Secret Access Key`.
     + Lấy `Account ID`: Nằm ở cột bên phải trang chính của mục R2.
   - **Bước 2 - Bật CORS trên Bucket (Khắc phục triệt để lỗi "Failed to fetch" khi Lưu Cloud)**:
     + Trong Cloudflare Dashboard &gt; vào **R2** &gt; nhấp vào tên **Bucket** của bạn.
     + Chọn tab **Settings** &gt; cuộn xuống phần **CORS Policy** &gt; bấm **Add CORS policy** (hoặc Edit).
     + Dán đoạn JSON sau và bấm Save:
       ```json
       [
         {
           "AllowedOrigins": ["*"],
           "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
           "AllowedHeaders": ["*"],
           "ExposeHeaders": [],
           "MaxAgeSeconds": 3000
         }
       ]
       ```
   - **Bước 3 - Kiểm tra kết nối 1 chạm**:
     + Mở pop-up **Save Cloud** (hoặc **R2 Cloud** trong tab Review) &gt; điền thông tin và bấm nút **"Kiểm tra kết nối & CORS trước khi Lưu"**.
     + Hệ thống sẽ tự động gửi gói tin kiểm tra và phản hồi tức thời: Nếu thành công, bạn có thể an tâm bấm "Save & Upload"; nếu còn thiếu CORS hoặc sai quyền token, hệ thống sẽ chỉ rõ nguyên nhân để bạn xử lý ngay.

6. **Chế Độ Xem Mặt Bằng Trực Tiếp (Live Layout Viewer - Tab Layout)**:
   - **Kiến Trúc Module Hóa Toàn Diện Chuẩn Enterprise (Modular Architecture & Cap < 500 lines)**:
     - Toàn bộ phân hệ Tab Layout từ tệp điều phối chính đến phần lõi canvas đã được chuẩn hóa và phân tách thành các submodule chuyên biệt (tất cả đều < 500 dòng/file theo quy định AGENTS.md), bảo toàn nguyên vẹn 100% logic tính toán, hiệu năng và trải nghiệm UI/UX:
       + **Phân hệ Vỏ Điều Phối (`LayoutTab.tsx` - từ 1.418 dòng giảm còn 166 dòng)**:
         * `LayoutTab.tsx`: Container Orchestrator tối giản, điều phối các luồng dữ liệu cấp cao (166 dòng).
         * `useLayoutTabData.ts`: Hook chuyên trách quản lý bộ lọc Store, Tầng, Năm, đồng bộ URL và quyền truy cập (477 dòng).
         * `LayoutTabFilterToolbar.tsx`: Thanh công cụ lọc thống nhất, chuyển đổi chế độ Live/Static, tìm kiếm căn hộ (361 dòng).
         * `LayoutTabFullscreenView.tsx`: Giao diện toàn màn hình với cử chỉ cảm ứng vuốt để đóng (swipe-to-dismiss) và pinch-to-zoom (317 dòng).
         * `LayoutTabStaticViewer.tsx`: Khung xem bản vẽ tĩnh dự phòng với tính năng pan, zoom và nhúng iframe (116 dòng).
         * `layoutTabSearchUtils.ts`: Tiện ích sắp xếp thứ tự tầng và thuật toán chấm điểm gợi ý căn hộ thông minh (294 dòng).
       + **Phân hệ Lõi Bản Đồ Trực Tiếp (`LiveLayoutViewer.tsx` - từ 2.767 dòng)**:
         * `LiveLayoutViewer.tsx`: Container kết nối phân quyền và cấu hình R2 (100 dòng).
         * `LiveCanvas.tsx`: Điều phối Canvas chính, thanh công cụ phụ và modal chú giải (419 dòng).
         * `useLayoutFloorData.ts`: Quản lý tải và đồng bộ phiên bản mặt bằng, khử trùng lặp hình khối (419 dòng).
         * `useLayoutAggregates.ts`: Xử lý phân quyền RBAC, so khớp dự án và lọc gian hàng (358 dòng).
         * `layoutDataAggregator.ts`: Động cơ tổng hợp dữ liệu tài chính, cảnh báo và tiến độ dự án (384 dòng).
         * `useLayoutGestures.ts`: Xử lý quán tính mượt mà (Kinetic Inertia), thu phóng bánh xe chuột và cảm ứng 2 ngón (335 dòng).
         * `useLayoutStageInteractions.ts`: Xử lý tiêu điểm gian hàng, bảng thông tin nổi (Tooltip) và phím tắt (495 dòng).
         * `layoutStageUtils.ts`: Tiện ích tính toán tọa độ trọng tâm và xuất ảnh sắc nét cao (297 dòng).
         * `LayoutCanvasViewport.tsx`: Lớp kết xuất đồ họa Konva Stage và Canvas Viewport (330 dòng).
   - **Đồng bộ tự động theo tầng & chi nhánh (Multi-Floor & Cloud R2 Partition Sync)**: Tại Tab Layout, khi chuyển sang chế độ xem Live View, hệ thống tự động quét toàn bộ các phân vùng (partitions) lưu trên Cloudflare R2 (`storeLocationData`) và bộ nhớ in-memory. Bản vẽ mặt bằng cùng toàn bộ hình khối vẽ (polygons, rects, circles) của mọi tầng (B2, B1, L1, L2, L3, L4, L5) được tự động tải và lập chỉ mục đầy đủ, sẵn sàng hiển thị ngay khi người dùng chuyển tầng.
   - **Tô màu chuẩn xác 100% như Tab Review**:
     - *Đồng nhất phong cách đồ họa*: Tích hợp cơ chế hiển thị chuẩn của ReviewTab với viền trắng tương phản cao (`stroke="#ffffff"`), độ dày viền thích ứng linh hoạt theo tỉ lệ thu phóng (`strokeWidth={2 / scale}`), và bóng đổ nổi khối (`shadowBlur={4}`, `shadowColor="rgba(0,0,0,0.5)"`).
     - *Độ mờ chuẩn phân nhóm*: Áp dụng chính xác độ mờ (`opacity`) cấu hình riêng cho từng nhóm trạng thái hoặc quy tắc động.
     - *Chữ hiển thị sắc nét*: Tên gian hàng/unit được phủ màu trắng viền đen tương phản, tự động co giãn theo cấp độ zoom, đảm bảo đọc rõ ràng ở mọi mức độ phóng to hay thu nhỏ.
   - **Tối ưu hiển thị theo Tab Dynamic**: Chỉ hiển thị các gian hàng/vị trí đã được phân nhóm hoặc gán quy tắc động ở Tab Dynamic, ẩn các unit trống giúp bản vẽ trực quan và tập trung.
   - **Xem nhanh thông tin (Tooltip)**: Rê chuột hoặc chạm vào unit để xem thông tin chi tiết: Tên gian hàng, Phân loại/Brand, Trạng thái thi công, **MD Status**, Diện tích, Thời gian thi công (định dạng ngày giờ chuẩn `formatDisplayDateTime` đồng bộ 100% với Task Detail), **Khung DETAILS** (đồng bộ 100% chuẩn theo logic bảng dự án chung General Tab: chỉ hiển thị các hạng mục công việc đang thi công trong thời điểm hiện tại `now >= start && now <= finish`, tự động ẩn nếu không có task nào đang chạy hôm nay, không đọc Firestore thừa), và **Nút trao đổi/Comment (💬)**: Khi bấm mở trao đổi/bình luận dự án từ Tooltip, sau khi trao đổi xong và tắt/đóng modal Comment thì bảng Tooltip vẫn được giữ nguyên vị trí hiển thị trên mặt bằng để tiếp tục quan sát mà không bị đóng cùng modal.
   - **Tối ưu trải nghiệm chạm & hiệu năng trên iOS/Mobile**:
     - *Thao tác cảm ứng mượt mà (Touch Gestures)*: Hỗ trợ cử chỉ chạm đa điểm phóng to/thu nhỏ bằng 2 ngón tay (**Pinch-to-zoom**) và chạm đúp (**Double-tap**) để reset góc nhìn về vị trí trung tâm tức thì.
     - *Tăng tốc phần cứng (GPU Optimization)*: Tự động giới hạn `pixelRatio` tối đa 1.5 trên màn hình Retina/iOS, loại bỏ hoàn toàn hiện tượng trễ khung hình khi kéo rê hay thu phóng mặt bằng phức tạp.
     - *Thanh công cụ nổi & Menu Drawer trên di động*: Trên màn hình điện thoại, thanh công cụ tự động thu gọn vào nút Menu nổi thông minh, mở ngăn kéo (Drawer) chứa Chú thích màu (Legend), Tùy chọn xuất ảnh/PDF (Export), và cấu hình URL một cách gọn gàng.
     - *Cụm phím điều khiển Zoom nổi*: Dễ dàng phóng to, thu nhỏ và cân chỉnh toàn cảnh qua cụm nút bấm nổi trực tiếp trên bản vẽ.

7. **Tìm Kiếm Gian Hàng & Tự Động Phóng To / Cuộn Tới Ô Unit (Unit Search & Auto-Zoom on Live Layout)**:
   - **Ô Tìm Kiếm Kế Nút Trigger Export**:
     + Ngay bên cạnh nút **"Trigger Export"** tại thanh công cụ Tab Layout, hệ thống tích hợp ô tìm kiếm chuyên dụng `Tìm ô unit (vd: L2-210)...`.
     + Hỗ trợ gợi ý tự động (Autocomplete Dropdown) thông minh: Khi bạn bắt đầu gõ mã ô (ví dụ: `210`, `L2-210`, `L1-101`), hệ thống lập tức lọc và hiển thị danh sách các gian hàng phù hợp kèm tên thương hiệu (Brand), dự án và phân khu tầng (Location).
   - **Tự Động Cuộn & Phóng To Trực Tiếp Đến Unit (Auto-Zoom & Pan Smoothly)**:
     + Khi bạn chọn gian hàng từ danh sách gợi ý hoặc nhấn phím **Enter**:
       - Hệ thống tự động kích hoạt chế độ **Live Map Mode** (nếu đang ở chế độ xem ảnh tĩnh).
       - Tự động chuyển tầng phù hợp nếu ô unit thuộc tầng khác.
       - Tự động tính toán tâm điểm toạ độ và điều khiển Canvas lướt mượt mà, phóng to (Zoom In) chính xác vào vị trí của ô unit đó giữa màn hình với tỷ lệ khung hình trực quan nhất.
       - Ô unit được tìm kiếm sẽ phát sáng với **viền vàng hổ phách đứt nét (Golden Glow Animation)** và tự động mở bảng thông tin chi tiết (Tooltip) của gian hàng.
   - **Tối Ưu Độ Tương Phản Màu Sắc & Chữ Hiển Thị Ô Unit (High-Contrast Unit Readability)**:
     + Thuật toán tự động tính toán độ sáng màu nền (Luminance YIQ) để áp dụng màu chữ và viền chữ tương phản tối ưu: nền tối chữ trắng viền đen sắc nét, nền sáng chữ đen viền trắng nổi khối.
     + Kích thước chữ được tính toán động theo tỷ lệ khung hình và cấp độ thu phóng, đảm bảo tên gian hàng luôn rõ ràng, không bị vỡ nét hay nhòe mờ ở bất kỳ mức độ zoom nào.

8. **Quy Hoạch Dữ Liệu Phân Vùng Theo Store, Vị Trí Tầng & Năm (Strict Data Partitioning: Store - Location - Year)**:
   - **Phân Định Rõ Ràng Từng Phân Hệ Trong Picture Mapping**:
     + **Tab Edit (Vẽ Mặt Bằng & Tải Ảnh)**: Được quản lý độc lập theo cặp `Store` và `Location` (Ví dụ: `HCM - B1`, `HN - L2`). Do hình học vật lý của gian hàng và ảnh nền bản vẽ mang tính cố định theo tầng, **bộ lọc Năm (Year) được ẩn đi tại tab Edit** để tránh gây nhầm lẫn.
     + **Tab Dynamic (Cấu Hình Quy Tắc Động & Phiên Bản)**: Dữ liệu phiên bản (Version) được quy định chặt chẽ bởi cả 3 yếu tố: `Store` + `Location` + `Year` (Ví dụ: Mở `HCM - B1 - 2026` sẽ có danh sách version riêng; chuyển qua `HCM - B1 - 2027` sẽ có dữ liệu version riêng biệt, không bị trộn lẫn giữa các năm).
       - Khi tạo mới version tại `HCM - B1 - 2026`, version tự động gắn nhãn và lưu trữ vào phân vùng `HCM - B1 - 2026`.
       - Hỗ trợ tính năng sao chép bộ quy tắc nhóm (**Copy Groups From**) linh hoạt từ bất kỳ version nào của năm khác hoặc tầng khác để tiết kiệm thời gian thiết lập.
       - Tự động kế thừa ảnh nền bản vẽ của tầng đó mà không cần tải lại ảnh.
     + **Tab Review (Duyệt Màu Sắc & Nhãn Dữ Liệu)**: Dựa trên 3 bộ lọc `Store`, `Location`, `Year` để đọc chính xác phiên bản quy hoạch tương ứng, áp dụng màu sắc và hiển thị bảng mặt bằng hoàn chỉnh.
     + **Tab Layout (Xem Mặt Bằng Trực Tiếp - Live Layout)**:
       - **Phụ thuộc duy nhất vào Task Summaries**: Luồng tô màu của Tab Layout Liveview hoàn toàn phụ thuộc vào dữ liệu công việc và dự án thực tế (`Task Summaries` / `projects` & `tasks`) của hệ thống, kết hợp với các quy tắc so sánh trong Dynamic Rules (hoặc tự động tô màu theo tiến độ dự án nếu không có quy tắc tùy biến).
       - **Cách ly tuyệt đối theo 3 thành phần (Year, Store, Location Isolation)**: Mỗi dự án và unit bắt buộc đối soát đủ cả 3 tiêu chí `Store`, `Location` (Tầng) và `Year` (Năm). Mã dự án (Project Code) chứa năm hoặc tầng (ví dụ `L1-115 y2026`) chỉ khớp duy nhất khi xem tại năm `2026`; khi người dùng chuyển sang năm `2027`, ô gian hàng đó không có dự án trong năm 2027 sẽ **hoàn toàn để trống (không tô màu và không viết chữ)**.
       - **Tối ưu hiệu năng siêu nhẹ (Zero Text Overhead on Empty Units)**: Hệ thống triệt tiêu hoàn toàn việc dựng các node chữ (`Konva <Text>`) và huy hiệu cảnh báo đối với các ô gian hàng để trống, giúp tiết kiệm hơn 80% bộ nhớ đồ họa và giữ FPS luôn ở mức 60-120 FPS khi kéo rê, thu phóng mặt bằng.
       - **Đồng bộ Dự Án Toàn Cửa Hàng (Storewide Projects - Location = STORE)**: Khi dự án có trường `location` là `STORE` (hoặc `ALL`, `STOREWIDE`, `ALL FLOORS`, `WHOLE STORE`), cả hai phân hệ **Layout Liveview** và **Picture Mapping (Dynamic Rules / Review)** đều đồng bộ cho phép dự án áp dụng xuyên suốt tất cả các tầng. Các ô gian hàng khớp mã dự án (`projectCodes`, `linkCodes` hoặc liên kết `ProjectLink`) sẽ hiển thị đầy đủ thông tin, chuỗi công việc tóm tắt (`Task Summarize`) và quy tắc tô màu động đồng nhất 100%.
       - **Hiển Thị Đầy Đủ 100% Các Ô Gian Hàng Trên Mặt Bằng (Floor Unit Preservation)**: Tại phân hệ **Layout Liveview**, toàn bộ các ô gian hàng thuộc tầng đang xem (ví dụ các gian hàng `HN-TKV-SNG` tại HN - B1) luôn được hiển thị trọn vẹn trên mặt bằng. Nếu ô gian hàng khớp quy tắc động hoặc dự án trong niên độ (ví dụ 2027 cho HN), ô sẽ được tô màu trực quan; nếu chưa có dự án trong niên độ đó, ô vẫn hiển thị viền và khung định vị rõ ràng trên bản vẽ mà không bị ẩn ngầm, đảm bảo đồng nhất tuyệt đối giữa Picture Mapping và Layout Liveview.




9. **Tối Ưu Hiệu Năng & Chuyển Đổi Tab Mượt Mà (Zero-Lag Navigation & Rendering Optimization)**:
   - **Tối Ưu Hoá Bộ Lọc & Chỉ Mục Dữ Liệu (Hash Indexing)**: Toàn bộ quá trình đối soát giữa Dự án (Projects) và Công việc (Tasks) được tăng tốc bằng cơ chế lập chỉ mục bản đồ bộ nhớ (Hash Index Map), giảm độ phức tạp từ O(N × M) xuống O(1).
   - **Chuyển Tab Không Chặn Con Trỏ Chuột (Concurrent Rendering with startTransition)**: Thao tác bấm vào dự án từ General Tab để điều hướng sang Gantt Tab hoặc Task Detail Tab được bọc trong `startTransition`, tách biệt luồng xử lý UI ưu tiên cao khỏi quá trình dựng giao diện của các bảng dữ liệu lớn, giúp con trỏ chuột không bị khựng, lag hay đơ khi chuyển đổi.
   - **Bộ Nhớ Đệm Kết Quả Tính Toán (Module-Level Caching)**: Kết quả của hàm `enrichProjects` được lưu cache tham chiếu; khi không có thay đổi dữ liệu, hàm phản hồi trong 0ms mà không phải duyệt hay sắp xếp lại hàng ngàn bản ghi.
   - **Giảm Tải Trọng Dựng Giao Diện (Debounced Background Synchronization)**: Các tiến trình tự động chuẩn hóa tiền nhiệm và vẽ liên kết trên Gantt được chuyển sang chế độ nền (background non-blocking) và điều tiết bằng animation frame, giữ cho tốc độ khung hình (FPS) luôn ổn định ở mức 60 FPS.

10. **Bảng Điều Hướng Nhanh Dự Án & Tác Vụ (Project & Task Quick Navigation Hub Modal)**:
   - **Thao Tác Kích Hoạt**: 
     - Tại tab **General (Tổng quan)**: Nhấp vào bất kỳ dự án nào (trên bản vẽ Canvas hoặc Card danh sách điện thoại).
     - Tại tab **Gantt Chart**:
       + **Nhấp vào Tiêu đề dự án (Project Title)**: Mở bảng Quick Navigation của toàn dự án. Khi điều hướng sang **Task Detail**, hệ thống mở dòng dự án ở trạng thái thu gọn (collapsed), lọc theo mã dự án mà không tự động mở rộng công việc con, giúp bảo vệ hạn mức đọc Firestore (0 Read tải ngầm). Người dùng chỉ cần nhấp biểu tượng mũi tên mở rộng `(Số task) >` khi thực sự cần làm việc với các task con của dự án đó.
       + **Nhấp trực tiếp vào Tên task con (Subtask Name)** hoặc **Nút điều hướng (`ExternalLink`) trên Tooltip thanh Gantt**: Hệ thống lập tức kích hoạt cơ chế Zero-Lag Transition, chuyển sang tab **Task Detail**, tự động mở rộng dự án mẹ và cuộn mượt mà trực tiếp đến đúng vị trí của task con đó.
     - Tại tab **Layout (Mặt bằng 2D)**: **Nhấp vào nút Quick Navigator (`QuickNavButton`) ngay trong Tooltip chi tiết của gian hàng/ô unit** (ở góc phải phía trên kế bên nút đóng và trên thanh thao tác bên dưới).
     - Tại các tab **Task Detail**, **Ngân Sách (Budget)**, và **Chi Phí (Cost)**: Nhấp vào nút biểu tượng điều hướng (`QuickNavButton`) nằm ở cột **Action** của từng dòng dự án mẹ (các dòng con đã được ẩn nút để tránh rối mắt).
   - **Hỗ Trợ Task Code Phụ (Sub-task Code)**: Khi kích hoạt từ từng tác vụ/task cụ thể, hệ thống tự động nhận diện và ưu tiên điền mã `taskCodePhu` (hoặc tính toán chuẩn theo `computeTaskCode`) để lọc và định vị chính xác nhiệm vụ đó tại các tab đích (Gantt, Task Detail, Cost).
   - **Giao Diện Tinh Gọn & Đa Nền Tảng (Compact English UI & Draggable)**:
     - Giao diện thiết kế siêu gọn nhẹ theo chuẩn tiếng Anh (`Layout`, `Gantt`, `Tasks`, `Budget`, `Cost`), tối ưu hiển thị hoàn hảo trên cả iOS/Mobile và Desktop.
     - Thanh kéo (Drag Handle) cho phép người dùng kéo thả linh hoạt trên màn hình mà không bị che khuất nội dung quan trọng bên dưới.
     - Vị trí hiển thị thông minh với `z-index` phù hợp bên dưới Header chính để tránh tình trạng che phủ thanh điều hướng.
   - **Tối Ưu Vị Trí Nút Chỉnh Sửa (Edit Mode)**: Tại tab **Task Detail**, các nút thao tác nhanh (Edit Mode, Add Project, Add Task, Sync Predecessor) được đặt trực tiếp bên cạnh thanh công cụ điều khiển (Controls Bar), loại bỏ tình trạng bị thanh Header che khuất trên màn hình nhỏ.
   - **Thứ Tự Phân Hệ Lựa Chọn (5 Tùy Chọn Chuẩn)**:
     1. 🗺️ **Layout (Mặt Bằng)**: Chuyển sang bản vẽ mặt bằng trực tiếp, tự động lọc theo store/location và highlight gian hàng tương ứng với mã dự án/task.
     2. 📊 **Gantt (Gantt Chart)**: Tự động lọc theo năm, store, tầng/location của dự án và điền mã dự án vào thanh tìm kiếm Gantt (`taka_gantt_search`). Hệ thống giữ hàng dự án ở **trạng thái thu gọn (collapsed)**, không tự động mở rộng các task con bên trong và không gán focus task (giao diện thanh công cụ gọn gàng, không hiện badge Focus Active), đồng thời tự động cuộn đến mốc thời gian hiện tại (`triggerGanttToday`). Người dùng có thể bấm nút `[X]` ngay trên ô tìm kiếm bất cứ lúc nào để xóa tìm kiếm và xem toàn bộ dự án.
     3. 📋 **Tasks (Task Detail)**: Tự động chuyển sang bảng chi tiết công việc, lọc theo mã dự án hoặc mã task code phụ. Hệ thống luôn định vị và tự động cuộn (Auto-Scroll) mượt mà đến **chính xác vị trí dòng dự án đó trong Task Detail** (trên cả giao diện bảng cuộn ảo Desktop Virtualized Table và giao diện danh sách Card Mobile), đồng thời kích hoạt hiệu ứng chớp màu xanh lục (Change Flash) làm nổi bật dự án mục tiêu. Nếu điều hướng tới dự án chung, hàng dự án được giữ ở trạng thái thu gọn an toàn để không kích hoạt đọc Firestore ngoài ý muốn; nếu điều hướng tới một task con cụ thể, dự án sẽ tự động mở rộng và cuộn thẳng đến task con đó.
     4. 💰 **Budget (Ngân Sách)**: Tự động chuyển sang bảng ngân sách, đồng bộ năm/store và tự động điền mã dự án vào ô tìm kiếm ngân sách.
     5. 🧾 **Cost (Chi Phí)**: Tự động chuyển sang bảng chi tiết chi phí, đồng bộ năm/store và tự động điền mã dự án/task code vào ô tìm kiếm chi phí.
   - **Thao Tác Nhanh**: Nhấn phím `Esc` hoặc bấm nút đóng để thoát bảng điều hướng ngay lập tức.

11. **Kiến Trúc Bảng Dữ Liệu Enterprise: Virtual Windowing & Row-Level Memoization (Chuẩn Monday.com, Linear)**:
   - **Cơ Chế Native Virtual Windowing (Cửa Sổ Cuộn Ảo)**:
     + Bảng chi tiết công việc (`DetailTab`) áp dụng kỹ thuật Virtual Windowing gốc không phụ thuộc thư viện ngoài, tính toán chính xác chiều cao (`rowOffsets`) và chỉ dựng các phần tử DOM nằm trong khung nhìn hiển thị của người dùng (kèm vùng đệm Overscan an toàn).
     + Sử dụng 2 dòng đệm trên/dưới (`paddingTop` và `paddingBottom`) giữ đúng vị trí thanh cuộn gốc, giảm tải số lượng DOM nodes từ hàng nghìn phần tử xuống dưới 60 phần tử tại bất kỳ thời điểm nào.
     + Tốc độ cuộn đạt chuẩn 60 FPS ngay cả khi dữ liệu có hàng trăm dự án và hàng ngàn đầu việc lồng ghép.
   - **Cô Lập & Tối Ưu Render Cấp Hàng (Row-Level React.memo Isolation)**:
     + Các dòng dự án (`DetailProjectRow`) và dòng công việc (`DetailTaskRow`) được tách biệt thành các standalone component độc lập và bọc bởi `React.memo`.
     + Toàn bộ hành vi chỉnh sửa ô nhanh (Inline Edit), tick chọn nhiều dòng (Shift + Click), kéo thả sắp xếp (Drag-and-Drop) chỉ kích hoạt re-render cục bộ tại chính dòng tương tác, triệt tiêu 100% hiện tượng re-render toàn bộ bảng tính.
   - **Lập Bản Đồ Dữ Liệu Tối Ưu (Pre-computed Lookup Maps)**:
     + Các phép tính nặng như sinh mã nhiệm vụ phụ (`taskCodeMap`) và giải mã trạng thái ủy quyền thực tế (`taskActualStatusMap`) được tiền tính toán một lần thông qua `useMemo`, chuyển độ phức tạp từ O(N) trong vòng lặp hiển thị về truy xuất tức thì O(1).
   - **Tối Ưu Hóa Giao Diện Di Động & Hình Ảnh (Mobile Card Virtualization & Async Image Decoding)**:
     + **CSS Content-Visibility (`.mobile-card-optimized`)**: Áp dụng cho các card dự án và danh sách công việc trên điện thoại (`DetailMobileView`, `CostMobileView`, `GeneralMobileView`, `BudgetMobileView`, `TaskDelegationMobileView`), giúp trình duyệt mobile bỏ qua việc tính toán layout và render các phần tử nằm ngoài màn hình, nâng tốc độ cuộn chạm đạt chuẩn 60–120 FPS.
     + **Giải Mã Hình Ảnh Bất Đồng Bộ (`loading="lazy" & decoding="async"`)**: Áp dụng đồng bộ trên toàn bộ ảnh thumbnail đính kèm và trình xem ảnh, loại bỏ hoàn toàn hiện tượng nghẽn luồng xử lý chính (Main Thread jank) khi xem các hạng mục có nhiều ảnh hiện trường.

12. **Bộ So Sánh Biến Động Trực Quan & Kiểm Toán Bất Biến (Visual Diff Viewer - Chuẩn GitHub, Linear & Jira)**:
   - **Mục Đích**: Giúp cấp Quản lý và Kiểm toán viên xem chính xác từng trường thông tin bị thay đổi (Trước & Sau khi sửa) một cách trực quan, không cần phải đọc mã JSON thô.
   - **Cách Kích Hoạt**:
     + Vào tab **Audit Log** (biểu tượng chiếc khiên 🛡️ tại Header hoặc mục Phân quyền).
     + Nhấp trực tiếp vào bất kỳ dòng nhật ký nào trong bảng danh sách, hoặc bấm nút **Diff** ở cột bên phải.
   - **Các Tính Năng Của Hộp Thoại Diff Viewer**:
     + **Draggable Modal (Kéo thả di chuyển)**: Người dùng có thể giữ tay cầm (`GripHorizontal`) để di chuyển hộp thoại quanh màn hình, không bị che dữ liệu bên dưới. Nhấn phím `Esc` để đóng nhanh.
     + **Visual Changes (So sánh trực quan Before & After)**:
       * Ô màu Đỏ (Before / Cũ) hiển thị giá trị trước khi sửa kèm dấu trừ `- OLD`.
       * Ô màu Xanh (After / Mới) hiển thị giá trị sau khi sửa kèm dấu cộng `+ NEW`.
       * Tự động nhận diện và định dạng tiền tệ Việt Nam Đồng (`₫`), ngày tháng (ISO Date), nhãn trạng thái (Completed, In Progress, Delayed) và cờ Boolean.
       * Gắn huy hiệu rõ ràng: `ADDED` (Thêm mới), `MODIFIED` (Chỉnh sửa), `REMOVED` (Xóa bỏ).
     + **Side-by-Side JSON**: Hiển thị bảng so sánh 2 cột song song giữa trạng thái cũ và trạng thái mới.
     + **Raw Event Inspector**: Xem toàn bộ đối tượng sự kiện kiểm toán và hỗ trợ 1-click **Copy JSON** vào bộ nhớ tạm.
     + **Bộ Lọc Nhanh (Field Filter)**: Cho phép gõ tên trường (như `budget`, `status`, `finish`, v.v.) để tìm nhanh biến động khi tài liệu có nhiều thông tin.
   - **Cấu Trúc Module Chuẩn Enterprise (Rule 12 - AGENTS.md)**:
     + Phân hệ **Audit Log** đã được băm nhỏ thành các submodule độc lập tại thư mục `src/components/AuditLogParts/` (`AuditLogFilterToolbar`, `AuditLogTableView`, `AuditLogRowItem`, `auditLogTypes`, `useAuditLogData`), đưa component chính `AuditLogTab.tsx` về vai trò điều phối tinh gọn (< 85 dòng code).
     + Tương tự, phân hệ **Active Notifications** đã được module hóa toàn diện tại `src/components/NotificationParts/` (`NotificationFilterToolbar`, `NotificationItemCard`, `notificationTypes`, `useNotificationData`), giúp `NotificationTab.tsx` chỉ giữ vai trò container orchestrator (< 95 dòng code).
     + Bảng điều khiển hiệu năng **Firestore Performance & Read Monitor** đã được tách thành `src/components/PerformanceDashboardParts/` (`PerformanceHeader`, `PerformanceMetricsCards`, `PerformanceCollectionTable`, `PerformanceEventLogs`, `performanceTypes`), hạ line count từ 568 dòng xuống 209 dòng code.
     + Hộp thoại lệnh trung tâm **Command Palette (`Ctrl+K`)** được chuẩn hóa vào `src/components/CommandPaletteParts/` (`CommandPaletteItemRow`, `CommandPaletteFooter`, `useCommandPaletteItems`, `commandPaletteTypes`), giảm từ 691 dòng xuống 215 dòng.
     + Hộp thoại Gantt rút gọn mặt bằng **LayoutMiniGanttModal** được tách thành `MiniGanttHeader`, `MiniGanttRowItem`, `useMiniGanttData`, giảm từ 738 dòng xuống 238 dòng, đảm bảo 100% file `.tsx`/`.ts` trong hệ thống tuân thủ nghiêm ngặt trần < 500 dòng code.

13. **Hệ Thống Thiết Kế Thống Nhất Trên Thiết Bị Di Động & iOS (Unified Mobile Design Language)**:
   - **Đồng Bộ Màu Sắc & Thành Phần Dữ Liệu Tương Đồng**:
     + **Huy hiệu Thông tin (Badges)**:
       * **Niên độ (Year)**: Nền xám bo góc chuẩn mực `bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700`.
       * **Chi nhánh (Store)**: Phân biệt rõ ràng theo nhận diện thương hiệu (`HCM`: Xanh dương đậm `bg-blue-100 text-blue-800`, `HN`: Đỏ hồng `bg-rose-100 text-rose-800`).
       * **Mã dự án & Mã Task con (Code & Task Code)**: Kiểu chữ monospace in đậm trong khung viền bo sắc nét `bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300`.
       * **Vị trí (Location)**: Phân cách bằng dấu chấm giữa `• L1` hiển thị màu trung tính dễ đọc.
     + **Màu Sắc Mốc Thời Gian (Dates)**:
       * **Start Date**: Màu xanh dương đậm chuẩn mực `text-blue-700 dark:text-[#8ab4f8] font-bold font-mono`.
       * **Finish Date**: Màu hồng đậm `text-pink-700 dark:text-pink-400 font-bold font-mono`.
       * **Opening Date**: Màu xanh lục bảo `text-emerald-600 dark:text-emerald-400 font-bold font-mono`.
     + **Trạng Thái Dự Án & Task Con (Status Badges)**:
       * `COMPLETED`: Nền xanh lục bảo `bg-emerald-600 text-white`.
       * `ON PROCESS`: Nền hổ phách `bg-amber-500 text-white`.
       * `HANDOVER`: Nền xanh dương `bg-blue-600 text-white`.
       * `CANCELED`: Nền đỏ hồng `bg-rose-600 text-white`.
     + **Viền Nhấn Trạng Thái Thẻ (Status Accent Border)**: Các thẻ dự án và task con trên các tab Task Detail, Cost, Budget đều có viền nhấn bên trái (`border-l-[4px]` hoặc `border-l-[5px]`) tương ứng với trạng thái tiến độ hoặc số dư tài chính.
   - **Đồng Bộ Giữa Phân Hệ Tài Chính Tab Cost & Tab Budget**:
     + Các thẻ dự án trong tab Cost có thiết kế hàng thông tin trên cùng (Year, Store, Code, Location, QuickNav) và tiêu đề đồng nhất với tab Budget.
     + **Huy Hiệu Tài Chính Góc Phải**:
       * Tab Budget: `Rem: ...` (Màu xanh khi còn dư >= 0, Màu đỏ khi âm ngân sách < 0).
       * Tab Cost: `Bal: ...` (Màu xanh khi Balance >= 0, Màu đỏ khi âm) kèm nhãn `ACT:` (Xanh dương) hoặc `FORC:` (Hổ phách) phản ánh trực quan trạng thái quyết toán.
     + **Bảng 3 Đợt Thanh Toán (1st Paid, 2nd Paid, 3rd Paid)**: Trình bày dạng lưới 3 cột nền trắng mờ viền bo cong sắc sảo, ngày thanh toán hiển thị màu xanh lá đậm in đậm monospace tương ứng với thiết kế lưới tài chính của tab Budget.
   - **Vị Trí Nút Điều Hướng Nhanh Trên Mobile (Quick Navigator Placement) & Tối Ưu Bố Cục Tên Công Việc**:
     + Được chuẩn hóa đặt tại **góc trên bên phải** của thẻ dự án, nằm trên **cùng một dòng ngang với Tên Dự Án / Tên Công Việc (Task Name)**:
       * **Tab Task detail**: Huy hiệu trạng thái dự án (**Project Status**) nằm ở góc trên cùng bên phải; ngay dòng tiếp theo là **Tên Dự Án** (kèm nút thu gọn/mở rộng Expand `(X)`) đi cùng dòng với nút **Quick Navigator** ở góc phải.
       * **Tab Budget**: Huy hiệu ngân sách còn lại (**Rem**) nằm ở góc trên cùng bên phải; ngay dòng tiếp theo là **Tên Hạng Mục / Dự Án** đi cùng dòng với nút **Quick Navigator** ở góc phải.
       * **Tab Cost**: Cột bên phải được tổ chức theo trục dọc chuẩn chỉnh: Huy hiệu dòng tiền (**ACT / FORC**) đặt ở trên cùng bên phải, ngay bên dưới là ô số dư (Balance / Bal), và ngay phía dưới ô Balance là nút Quick Navigator. Cột bên trái gồm hàng huy hiệu (Year, Store, Code, Location) và ngay bên dưới là Tên Dự Án (kèm nút Expand).
     + **Triệt Tiêu Hoàn Toàn Khoảng Trống Lãng Phí (Zero Wasted Space)**: Bố cục 2 dòng gọn gàng, chặt chẽ chuẩn Human Interface Guidelines giúp toàn bộ thẻ hiển thị đầy đủ thông tin mà không tạo ra khoảng trống thừa thãi giữa các trường dữ liệu trên màn hình di động/iOS.




14. **Tối Ưu Hiệu Năng Cuộn Mượt Mà & Triệt Tiêu Hiện Tượng Trắng Màn Hình Khi Mở Task Con (iOS High-Performance Scroll Architecture)**:
   - **Triệt Tiêu Hiện Tượng Trắng Khung Nhìn (Anti-White Screen on Mobile)**:
     + Khắc phục triệt để hiện tượng ngắt tile và trắng màn hình khi mở rộng danh sách hàng chục task con: loại bỏ xung đột của `content-visibility: auto` trên thẻ dự án mẹ, cho phép Safari WebKit duy trì liên tục cây DOM hoàn chỉnh khi cuộn trang với tốc độ cao.
     + Bổ sung khai báo màu nền đồng nhất cho `html.dark` và `body` (`#131314` ở Dark mode và `#f8fafc` ở Light mode), đảm bảo khi người dùng cuộn quán tính (Momentum Scroll Bounce) trên iOS không bao giờ xuất hiện vùng sáng trắng bất thường.
   - **Kiến Trúc Cô Lập Render Cấp Task Con (`DetailMobileTaskItem` & `contain: content`)**:
     + Tách biệt mỗi task con thành standalone component `DetailMobileTaskItem` được bọc bởi `React.memo` và gán thuộc tính layout `contain: content`.
     + Mọi thao tác cập nhật tiến độ, ủy quyền, chỉnh sửa hoặc dịch chuyển thứ tự một task con chỉ dựng lại đúng task con đó, ngăn chặn 100% tình trạng layout reflow trên toàn bộ danh sách 30+ task con.
   - **Tra Cứu Dữ Liệu O(1) Siêu Tốc (Pre-computed Lookup Maps)**:
     + Chuyển giao toàn bộ việc tính toán mã công việc (`computeTaskCode`) và tính toán trạng thái thực tế (`resolveActualStatus`) sang Map được tính toán 1 lần tại Store/Tab container (`taskCodeMap`, `taskActualStatusMap`).
     + Loại bỏ hoàn toàn các hàm duyệt mảng toàn cục (O(N * M)) trong quá trình render danh sách task con trên di động, giảm tải 95% áp lực CPU trên thiết bị iPhone, đem lại trải nghiệm cuộn 60-120 FPS mượt mà.
   - **Tự Động Nạp Thêm Dữ Liệu Thông Minh (Auto Infinite Loading)**:
     + Tích hợp cơ chế lắng nghe sự kiện cuộn thông minh trên container di động: tự động nạp tiếp 25 dự án tiếp theo khi người dùng cuộn cách đáy dưới 450px, loại bỏ cảm giác chờ đợi hoặc phải ấn phím thủ công.

15. **Giá Trị Mặc Định Thông Minh Khi Tạo Task Mới (New Task Smart Defaults)**:
   - **Tự động điền ngày hiện tại (Today Timestamp)**:
     + Khi mở form tạo Task mới hoặc nếu người dùng để trống các ô ngày, hệ thống sẽ tự động gán ngày hôm nay (mốc 21:00 chuẩn) cho các trường:
       * **Start (Plan)**: Mặc định là ngày hôm nay.
       * **Finish (Plan)**: Mặc định là ngày hôm nay.
       * **Baseline Start**: Mặc định là ngày hôm nay (đồng bộ với Start Plan).
       * **Baseline Finish**: Mặc định là ngày hôm nay (đồng bộ với Finish Plan).
   - **Thời lượng công việc (Duration)**:
     + Tự động mặc định là `0` ngày (do Start và Finish cùng ngày hôm nay).
   - **Đơn vị phụ trách (Party)**:
     + Khi tạo task trong dự án, hệ thống tự động kế thừa `Party` từ Dự án cha (Project) để đảm bảo tính nhất quán danh mục nhà thầu/đơn vị phụ trách (hoặc người dùng có thể tự do chọn nhà thầu mong muốn từ MultiSelect).
   - **Bảo Vệ Tính Toàn Vẹn Khi Lưu (Persistence Normalization)**:
     + Cả hai chế độ Online (Firestore) và Offline Sync đều tự động chuẩn hóa các trường này trước khi lưu trữ, đảm bảo không bao giờ phát sinh giá trị rác hoặc rỗng trên hệ thống.

16. **Ô Tìm Kiếm & Tự Động Điền Khớp Nhất Cho Predecessor (Predecessor Smart Search & Nearest Match Auto-fill)**:
   - **Gợi Ý & Xếp Hạng Độ Trùng Khớp Thông Minh (Ranked Suggestions)**:
     + Khi gõ vào ô Predecessor (ở cả Modal chi tiết Task và ô sửa nhanh trực tiếp trên bảng DetailTab), hệ thống hiển thị danh sách gợi ý được sắp xếp theo mức độ gần giống nhất (Match Score).
     + Ứng viên gần giống nhất được đánh dấu nổi bật với huy hiệu `★ Khớp nhất` (`★ Best Match`) cùng màu viền/nền tương phản.
     + Hỗ trợ tra cứu siêu tốc đa tiêu chí: mã task đầy đủ (`CP-01-2`), mã viết tắt/thiếu ký tự (`smz2-85` → `HN-TKV-SMZ2-85`), số thứ tự trong dự án (`2`, `85`), hoặc tên công việc (`Thi công sàn gỗ`).
   - **Tự Động Điền Ô Đúng Vào Khi Nhập Gần Giống Nhất (Auto-fill Nearest Match)**:
     + **Khi nhấn phím Tab hoặc điều hướng mũi tên và Enter**: Tự động lấy kết quả gợi ý đang được chọn và điền mã task chính xác vào ô.
     + **Khi nhấn Enter trực tiếp hoặc nhấp chuột ra ngoài (Blur / Click Outside)**: Nếu người dùng nhập mã cụ thể (như `B2-B208-2`), hệ thống luôn ưu tiên lưu mã chính xác đó. Nếu gõ ký tự viết tắt hợp lệ (như `smz2-85SS` hoặc `2`), hệ thống sẽ chuyển đổi thành mã chuẩn (`HN-TKV-SMZ2-85SS` hoặc `B2-B208-2`), bảo toàn nguyên vẹn mối quan hệ (`SS`, `FF`, `SF`, `FS`) và độ trễ (`Lag`).
     + **Khi gõ dấu phẩy (`,`)**: Tự động chuẩn hóa phân đoạn tiền nhiệm thứ nhất thành mã đúng trước khi chuyển sang nhập phân đoạn tiền nhiệm thứ hai.
   - **Cơ Chế Bảo Vệ Toàn Vẹn Mã Nhập & Chống Xung Đột Số Thứ Tự (Numerical Conflict Guard & Precision Protection)**:
      + **Bảo đảm chuẩn xác Subtask Index**: Khi nhập hoặc chọn mã công việc (như B2-B208#2), hệ thống áp dụng cơ chế bảo vệ số thứ tự, đảm bảo 100% liên kết chính xác Subtask #2 (Re-instatement) và không bao giờ bị lệch sang Subtask #1 (Hoarding up).
      + **Hiệu năng lưu tức thời (Zero-Lag Save Engine)**: Lưu công việc và tính toán mốc ngày trong 0ms, loại bỏ hoàn toàn các vòng lặp quét nền ngầm gây đơ hoặc giật lag ứng dụng.
     + **Bảo vệ mã người dùng gõ**: Khi người dùng nhập một mã cụ thể (ví dụ `B2-B208-2` có đuôi `-2`), hệ thống áp dụng cơ chế *Numerical Conflict Guard* chặt chẽ: các công việc có số thứ tự khác (như `B2-B208-1` mang đuôi `-1` hay `B2-B208-3` mang đuôi `-3`) bị gán điểm trùng khớp bằng 0, tuyệt đối không bao giờ được tự động ép hay thay thế đè lên mã người dùng đã gõ.
      + **Bảo đảm chuẩn xác Subtask Index**: Khi nhập hoặc chọn mã công việc (như B2-B208#2), hệ thống áp dụng cơ chế bảo vệ số thứ tự, đảm bảo 100% liên kết chính xác Subtask #2 (Re-instatement) và không bao giờ bị lệch sang Subtask #1 (Hoarding up).
      + **Hiệu năng lưu tức thời (Zero-Lag Save Engine)**: Lưu công việc và tính toán mốc ngày trong 0ms, loại bỏ hoàn toàn các vòng lặp quét nền ngầm gây đơ hoặc giật lag ứng dụng.
     + **Nhận diện toàn vẹn qua bộ lọc (Global Task Visibility Pool)**: Cơ chế phân giải quét toàn bộ kho dữ liệu công việc trong bộ nhớ ứng dụng (`Global Task Store`), đảm bảo nhận diện chính xác các mã công việc ngay cả khi công việc đó đang bị ẩn bởi bộ lọc tìm kiếm hoặc phân quyền phụ trách (Party RBAC).
   - **Trải Nghiệm Nhập Liệu & Chỉnh Sửa Mã Tiền Nhiệm Tối Ưu (Zero-Lag & Cursor-Stable Predecessor Input)**:
     + **Loại bỏ khoảng trắng/dấu phẩy thừa trước con trỏ**: Khi chọn mã công việc từ danh sách gợi ý (ví dụ chọn Subtask #1 B2-B208#1), hệ thống chỉ điền chính xác mã B2-B208#1, không tự động chèn thêm dấu phẩy hay khoảng trắng thừa (", ") trước con trỏ. Người dùng có thể lưu ngay với 1 tiền nhiệm hoặc chủ động gõ dấu phẩy khi muốn thêm tiền nhiệm thứ hai.
     + **Khắc phục lỗi xóa ký tự & Chống nhảy con trỏ (Cursor Stability Engine)**: Loại bỏ hoàn toàn bẫy tự động điền lại khoảng trắng khi nhấn Backspace. Khi chỉnh sửa hoặc xóa mã subtask (như xóa "#1" thành "#2"), hệ thống ghi nhớ và bảo toàn tuyệt đối vị trí con trỏ chuột (Selection Preservation), không làm con trỏ bị giật nhảy về cuối dòng.
     + **Loại Bỏ Lớp Phủ Ghost Overlay (Triệt tiêu hiện tượng trùng / bóng chữ 2 lớp)**: Chuyển đổi sang kiến trúc Single-Layer Native Input thuần túy, loại bỏ hoàn toàn thẻ div lớp phủ màu chạy ngầm. Ký tự hiển thị trực tiếp bằng phông `font-mono` màu xanh thương hiệu chuẩn (`text-blue-600 dark:text-[#8ab4f8]`), triệt tiêu 100% hiện tượng chữ bị nhân đôi, bóng ma hoặc lệch trục trên iOS Safari và Android.
     + **Phông chữ Monospace chuẩn xác & Nút xóa nhanh (X)**: Ô nhập áp dụng chuẩn typography font-mono, căn chỉnh vị trí ký tự và con trỏ chuột chuẩn xác 100% trên cả iPhone/iPad và Desktop; bổ sung nút icon X để xóa nhanh toàn bộ tiền nhiệm bằng một chạm.
   - **Hỗ Trợ Ký Tự `#` (Shift + 3) & Định Dạng Subtask Chuẩn Mới**:
     + Ô nhập Predecessor cho phép gõ trực tiếp ký tự `#` (thao tác `Shift + 3` trên bàn phím) một cách trơn tru, không bị lọc hay xóa tự động.
     + Hệ thống hỗ trợ tìm kiếm và gợi ý thông minh với cả định dạng mã subtask có dấu thăng `#` (ví dụ: `B2-B208#1`, `#1`, `smz2#85SS`), tự động phân tách tiền tố dự án và số thứ tự công việc con để đưa ra đề xuất chính xác nhất.
   - **Tải Động & Cảnh Báo Liên Kết Khác Dự Án (Multi-Factor Cross-Project Predecessor Integration)**:
     + Tự động phát hiện tiền tố dự án ngoài (như `smz2` cho `HN-TKV-SMZ2`) để tải trước danh sách công việc của dự án đó từ máy chủ.
     + **Kiểm soát đa yếu tố (Year / Store / Location / Code)**: Phân biệt chính xác giữa các dự án có cùng mã nhưng khác niên độ (như 2026 vs 2027), khác chi nhánh (HCM vs HN) hoặc khác vị trí/tầng (như B2 vs 1F). Khi khác bất kỳ yếu tố nào, hệ thống đều phân loại là khác dự án và tự động bật hộp thoại xác nhận (ConfirmModal) kèm lý do chi tiết để người dùng phê duyệt trước khi tạo liên kết.




17. **Khôi Phục Thanh Trực Quan Tiến Độ & Bảng Điều Khiển Nhanh Dự Án (Task Detail Progress Bars & Controls Bar)**:
   - **Thanh Tiến Độ Kế Hoạch & Thực Tế (Visual Progress Bars)**:
     + **PLAN PRG**: Thanh đo tiến độ kế hoạch màu xanh dương (`bg-blue-500`) kèm chỉ số phần trăm hiển thị trực quan tỷ lệ hoàn thành dự kiến của các công việc con.
     + **ACT PRG**: Thanh đo tiến độ thực tế màu xanh ngọc (`bg-emerald-500`) kèm chỉ số phần trăm phản ánh chính xác trạng thái thực thi thực tế của dự án.
   - **Thanh Điều Khiển & Nhãn Trực Quan (Controls Bar)**:
     + **Nút Sắp Xếp (Sort)**: Biểu tượng mũi tên hai chiều `[↑↓ Sort]` giúp sắp xếp tức thời danh sách công việc con theo Ngày bắt đầu (Start Date).
     + **Huy Hiệu Nhà Thầu/Bên Phụ Trách (Party Tag)**: Huy hiệu viền tím nổi bật (`border-purple-500 bg-purple-950/60`) liệt kê các đối tác, nhà thầu chịu trách nhiệm thực hiện (ví dụ: `Con1, CP, MD`).
     + **Nút Gạt Ủy Quyền (Delegation FastToggle)**: Công tắc gạt nhanh trạng thái ủy quyền của dự án sang phân hệ Delegation.
     + **Nút Xem Chi Tiết (Maximize)**: Biểu tượng mũi tên mở rộng chéo `⤢` màu xanh dương cho phép mở nhanh modal chi tiết dự án.
     + **Hiển Thị Ngày 3 Dòng (Stacked Dates Display)**:
       - **Ngày bắt đầu (Start Date)**: Hiển thị 3 dòng màu xanh dương (`Tháng\nNgày,\nNăm` ví dụ: `May\n4,\n2026`).
       - **Ngày kết thúc (Completion Date)**: Hiển thị 3 dòng màu hồng cánh sen (`Tháng\nNgày,\nNăm` ví dụ: `Oct\n16,\n2026`).


18. **Tìm Kiếm Toàn Cục Toàn Năng (Global Search - Phím tắt `/`)**:
   - **Kích Hoạt Nhanh Bằng Phím Tắt `/`**:
     + Nhấn phím `/` từ bất kỳ tab hoặc vị trí nào trên ứng dụng để mở và focus trực tiếp vào thanh tìm kiếm toàn cục (Global Search).
     + Khi người dùng kích hoạt tìm kiếm, hệ thống tự động kích hoạt tải danh sách công việc ngầm (`isTasksRequested: true`) mà không phá vỡ cơ chế lazy-loading.
     + Nhấn `Esc` để đóng hộp thoại kết quả và xóa tiêu điểm con trỏ.
   - **Phạm Vi Tìm Kiếm Đa Chiều (Multi-Domain Search Scope)**:
     + **Tên Dự Án & Mã Dự Án (Project Names & Codes)**: Tìm kiếm tức thời theo mã dự án (ví dụ `L1-01`, `B2-208`), tên gian hàng/dự án, chi nhánh (HCM, HN), niên độ năm, và vị trí/tầng.
     + **Tên Công Việc Con & Mã WBS (Task Names & Subtask Codes)**: Tìm kiếm chi tiết theo tên hạng mục thi công (ví dụ: `Demolition`, `MEP`, `Painting`), mã định danh công việc con (`#1`, `L1-01-1`), ngày bắt đầu/kết thúc.
     + **Bên Phụ Trách / Nhà Thầu / Assignees (Party & PIC)**: Tìm kiếm danh sách các nhà thầu, bên phụ trách (`Con1`, `CP`, `MD`, `Tenant`, người được phân công) kèm số lượng dự án và công việc đang đảm nhiệm.
   - **Bảng Kết Quả Thả Xuống Trực Quan & Điều Hướng Nhanh (Dropdown Results & Quick Navigation)**:
     + **Bộ Lọc Phân Loại Tabs**: Cho phép chuyển đổi nhanh giữa các nhóm kết quả: `All` (Tất cả), `Projects` (Dự án), `Tasks` (Công việc), và `Assignees` (Người phụ trách). Nhấn phím `Tab` để xoay vòng chuyển đổi giữa các nhóm.
     + **Điều Hướng Bàn Phím Chuẩn**: Dùng phím `↑` và `↓` để di chuyển chọn các kết quả trong danh sách thả xuống, nhấn `Enter` để kích hoạt chuyển trang tới kết quả đang chọn.
     + **Nút Nhảy Nhanh Đa Phân Hệ (1-Click Quick Jump)**:
       - **Dự án**: Hỗ trợ nút nhảy nhanh đến `Detail` (bảng chi tiết), `Gantt` (tiến độ ngang), hoặc mở modal điều hướng 5 tab `Quick Nav`.
       - **Công việc**: Nhấp vào công việc sẽ chuyển ngay sang `Detail Tab`, tự động mở rộng dự án cha, cuộn mượt và làm nổi bật (focus highlight) công việc đó; hoặc nhảy thẳng tới thanh bar của công việc trong biểu đồ `Gantt`.
       - **Assignees**: Nhấp vào người phụ trách sẽ tự động lọc toàn bộ công việc và dự án thuộc quyền quản lý của đơn vị/cá nhân đó.

19. **Tự Động Cập Nhật Ngay Lập Tức Task Count, Summary Task & Project Dates (0ms + Firestore Sync)**:
   - **Đồng Bộ Tức Thời Khi Upload CSV & Tạo Task Mới**: Mỗi khi người dùng tải lên file CSV chứa danh sách công việc (Import Task) hoặc tạo một công việc mới trong Task Modal:
     + Hệ thống lập tức tính toán lại toàn bộ thông số dự án cha tương ứng: `taskCount` (tổng số lượng task), `taskSummaries` (danh sách tóm tắt mã phụ, tên, ngày bắt đầu và kết thúc), `computedTakStart` (ngày bắt đầu sớm nhất), `computedTakCompl` (ngày hoàn thành muộn nhất), `computedOpening` và tỷ lệ tiến độ thực tế / kế hoạch.
     + Cập nhật ngay lập tức vào bộ nhớ Zustand (0ms) và đồng bộ trực tiếp lên tài liệu dự án trên Firestore (`taka_projects`) bằng phương thức an toàn `setDoc({ merge: true })`.
     + Đảm bảo khi đóng/thu gọn dự án (collapsed), hàng dự án luôn hiển thị đầy đủ số lượng task `(33)`, ngày bắt đầu và ngày kết thúc chuẩn xác mà không cần phải mở rộng mới cập nhật.

20. **Tối Ưu Tải Dữ Liệu Chi Nhánh Hà Nội (HN) & Niên Độ 2027 Trên Desktop**:
   - **Khắc Phục Tự Động Xung Đột Bộ Lọc Vị Trí (Location Filter Auto-Reset)**: Khi người dùng chuyển đổi chi nhánh (Store) từ HCM sang HN (hoặc ngược lại) trên Desktop/Mobile, hệ thống tự động reset bộ lọc vị trí (`globalLocationFilter: []`) về "All Locations" để ngăn chặn các tầng của HCM (như B1, B2, L1...) làm ẩn toàn bộ dự án của chi nhánh HN.
   - **Đồng Bộ Quyền Truy Cập Chi Nhánh Cho Toàn Bộ User (RBAC Store Resolution)**: Hệ thống sử dụng hàm chuẩn hóa `getUserAllowedStores` thay vì kiểm tra thủ công cờ cứng, đảm bảo các tài khoản Manager, CP, Staff hoặc tài khoản mặc định đều có thể truy cập và tải đầy đủ dữ liệu dự án, công việc và chi phí của chi nhánh HN và niên độ 2027.
   - **Chuẩn Hóa So Khớp Không Phân Biệt Hoa Thường**: Toàn bộ các bộ lọc chi nhánh và năm trên các Tab (General, Detail, Gantt, Cost, Budget, Layout) đều so khớp chuỗi không phân biệt chữ hoa/thường (`'hn'` và `'HN'`), đồng thời hỗ trợ cả kiểu số `2027` lẫn kiểu chuỗi `'2027'` trên Firestore.

21. **Nâng Cấp Trình Xem Ảnh Phóng To Toàn Màn Hình Trong Tooltip Bản Đồ (Tooltip Lightbox Modal)**:
   - **Hỗ Trợ Tự Động Chuyển Đổi Link Google Drive & Dropbox**: Khi người dùng đính kèm link hình ảnh từ Google Drive (dạng `drive.google.com/file/d/.../view` hoặc `open?id=...`), hệ thống tự động chuyển đổi sang đường dẫn thumbnail chất lượng cao (`&sz=w1600`) để trình duyệt hiển thị ảnh trực tiếp mà không bị lỗi trang trắng/ảnh hỏng.
   - **Phóng To Nhanh 1-Chạm Ngay Trên Header Tooltip**: Nhấp trực tiếp vào ảnh thumbnail nhỏ ở góc phải thanh tiêu đề tooltip sẽ lập tức mở modal phóng to ảnh HD toàn màn hình.
   - **Nút Đóng "X" Nổi Bật & Phím Tắt Escape**:
     + Trang bị nút đóng tròn "X" kích thước lớn, màu sắc tương phản cao nổi cố định ở góc trên bên phải màn hình (`fixed top-3 right-3 sm:top-5 sm:right-5`), luôn hiển thị rõ ràng trên mọi kích thước màn hình và thiết bị (Desktop, iPad, Mobile).
     + Nút đóng rõ ràng kèm nhãn `Đóng (Esc)` trên thanh công cụ của modal.
     + Nhấn phím `Escape` trên bàn phím hoặc nhấp vào vùng đen nền mờ (Backdrop) sẽ lập tức đóng trình xem ảnh.
     + Hỗ trợ giao diện thông báo và nút "Mở liên kết trong tab mới" nếu đường dẫn là tài liệu/trang web không cho phép tải trực tiếp dạng thẻ ảnh.

22. **Lưu Trữ Tỉ Lệ Scale % Tab Gantt & Cấu Hình Thêm/Bỏ Cột Theo Thiết Bị (Device-Screen Aware Persistence)**:
   - **Tỉ Lệ Scale % & Độ Rộng Gantt Theo Từng Thiết Bị (Mobile / Tablet / Desktop)**:
     + Khi người dùng điều chỉnh ô nhập `% Scale` (hoặc kéo thanh trượt `Scale` trong menu Hamburger drawer / thanh công cụ Gantt), hệ thống tự động lưu trữ tức thì cấu hình tỉ lệ phóng to/thu nhỏ này vào bộ nhớ thiết bị theo từng hồ sơ màn hình độc lập (`mobile` < 768px, `tablet` 768px - 1024px, `desktop` ≥ 1024px).
     + Khi đăng nhập hoặc sử dụng trên điện thoại, máy tính bảng hay máy tính để bàn, hệ thống tự động khôi phục đúng mức % Scale và chế độ xem (`Monthly` / `Weekly` / `Quarterly`) tối ưu cho kích thước màn hình của thiết bị đó.
   - **Cấu Hình Thêm Cột / Bỏ Cột (Column Visibility) Theo Từng Thiết Bị & Tài Khoản**:
     + Mọi thao tác thêm cột hoặc bỏ cột (qua công cụ `+ Add Column` / `Toggle Columns` hoặc nút đóng `x` trên tiêu đề các cột) tại tất cả các phân hệ (**Gantt Chart, Detail Tab, Budget Tab, Cost Tab, Task Delegation Tab**) đều được lưu trữ độc lập theo tài khoản người dùng và thiết bị đang sử dụng.
     + Trên màn hình điện thoại (Mobile), người dùng có thể tinh gọn bảng chỉ hiển thị 2-4 cột quan trọng nhất, trong khi trên màn hình Desktop lớn vẫn giữ nguyên đầy đủ 10-14 cột dữ liệu chi tiết mà không bị ghi đè hay xung đột giữa các thiết bị.

23. **Tối Ưu Hóa Bộ Máy In Ấn & Xuất Bản PDF (Print Engine & PDF Export Optimization)**:
   - **Căn Chuẩn Tỉ Lệ Khung In & Bảo Toàn Đúng Tỉ Lệ 1:1 (Exact Frame Scale & Proportional Aspect Ratio)**:
     + Khắc phục triệt để hiện tượng biến dạng hoặc lệch khung in: hệ thống tự động đo lường kích thước thực của nội dung bảng biểu (`naturalWidth`, `naturalHeight`), tính toán tỉ lệ thu phóng `printScale` theo đúng chuẩn kích cỡ giấy in (A4: 210x297mm, A3: 297x420mm, A2: 420x594mm) với lề chuẩn 10mm.
     + Đảm bảo các chế độ `Fit to width (cols on 1 page)`, `Fit to height (rows on 1 page)`, và `Fit to 1 page` tự động co giãn vừa khít 100% diện tích trang in mà không làm méo hình, không bị kéo dãn hay cắt xén nội dung.
     + Đường lưới phân trang (Page Break overlay) và các trang PDF được cắt ghép chính xác theo từng ranh giới hàng của bảng dữ liệu.
   - **Tối Ưu Siêu Nhẹ & Triệt Tiêu Hiện Tượng Đơ Lag Máy Ở Mọi Mức DPI (Zero-Lag & Lightweight Memory Architecture)**:
     + **Cơ chế cắt lát từng trang (Per-Page Tile Slicing)**: Thay vì nhúng toàn bộ ảnh canvas khổng lồ (dung lượng hàng chục MB) lặp lại trên mọi trang PDF, hệ thống chỉ trích xuất đúng lát cắt của từng trang riêng lẻ sang ảnh JPEG tối ưu (chỉ khoảng 80-150KB/trang), giúp dung lượng file PDF siêu nhẹ và tốc độ xuất file hoàn tất chỉ trong 0.2 - 0.5 giây.
     + **Bảo vệ bộ nhớ phần cứng (Hardware Memory Protection)**: Tự động giới hạn số điểm ảnh tối đa an toàn (Memory Cap < 6 Megapixels), tối ưu hóa quá trình chụp DOM (`skipFonts: true`) ngăn chặn triệt để tình trạng CPU/GPU bị quá tải hoặc treo trình duyệt khi chọn mức độ phân giải cao `200 DPI` hay `300 DPI`.
     + **Tùy chọn In Trực Tiếp Siêu Nhanh (Direct Browser Print)**: Bổ sung tùy chọn máy in *"Direct Browser Print (Ctrl+P / Vector)"* cho phép mở ngay hộp thoại in bản địa của trình duyệt với đồ họa vector sắc nét tuyệt đối, phản hồi tức thì 0ms mà không tốn tài nguyên máy.

24. **Chuẩn Hóa Hiển Thị Ngày Giờ Gọn Gàng & Chuyên Nghiệp (Standardized Clean Date & Time Display)**:
   - **Bố Cục 2 Tầng Cân Đối (2-Tier Compact Date & Time Architecture)**:
     + Thay vì hiển thị chuỗi dài lộn xộn bị rớt dòng ngắt quãng thành 3-4 dòng (như `Thu, Jul / 2, 2026, / 8:00 AM`), các cột **Start** và **Finish** trên bảng tiến độ Gantt được tổ chức thành cấu trúc 2 tầng chuẩn mực:
       * **Dòng 1 (Ngày tháng năm)**: Định dạng rõ ràng, phông Monospace in đậm sắc nét (ví dụ: `02 Jul 2026`, `27 Jul 2026`).
       * **Dòng 2 (Khung giờ thi công)**: Hiển thị giờ thi công nhỏ gọn bên dưới (ví dụ: `8:00 AM`, `10:00 PM`), màu sắc mờ nhẹ nhàng để không làm rối mắt.
     + Cột Start sử dụng màu xanh dương thương hiệu (`text-blue-700 dark:text-[#8ab4f8]`), cột Finish sử dụng màu hồng đậm (`text-pink-700 dark:text-pink-400`).
   - **Chống Tràn & Không Bị Ngắt Chữ (Zero Awkward Line Wrapping)**:
     + Tự động chống ngắt dòng giữa chừng (`whitespace-nowrap`), căn giữa tuyệt đối trong ô (width 80–110px), đem lại giao diện báo cáo chuyên nghiệp chuẩn Enterprise.

25. **Cột Predecessor Trên Biểu Đồ Gantt & Đồng Bộ Phân Cấp Mẹ - Con Khi Xuất / Nhập CSV (Gantt Predecessors & Parent-Child CSV Synchronization)**:
   - **Bổ Sung Cột Predecessor Trong Menu `+ Add Column` (Gantt Tab)**:
     + Người dùng có thể bật/tắt cột **Predecessor** trực tiếp từ nút menu `+ Add Column` trên thanh công cụ Gantt hoặc ẩn nhanh bằng biểu tượng con mắt `EyeOff` trên tiêu đề cột.
     + Hiển thị trực quan toàn bộ chuỗi tiền nhiệm liên kết (ví dụ: `1FS`, `2SS+3d`, `PJ-01#2FF`) với phông Monospace màu tím đặc trưng (`text-indigo-600 dark:text-indigo-400`), tự động căn chuẩn vị trí đường dây liên kết SVG (Dependency Lines) và mốc thời gian thực tế `Today Indicator Line`.
   - **Tối Ưu Tối Giản 1 Trường Cột Duy Nhất Cho Công Việc Mẹ (`Parent task code`)**:
     + **Khi Xuất File CSV / Excel (`Export Tasks`)**: Chỉ xuất duy nhất 1 cột đại diện cho công việc mẹ:
       * `Parent task code`: Mã sub-task / ID của công việc mẹ (ví dụ: `PJ-01#1`). Để trống nếu không thuộc công việc mẹ nào.
     + **Khi Nhập File CSV / Excel (`Import Tasks`)**:
       * Tự động đọc cột `Parent task code` (hoặc các định danh tên cột tương đương như `Parent task code`, `Parent task name`, `Task mẹ`, `Parent task ID`, `Parent`).
       * Tự động liên kết công việc con vào đúng công việc mẹ trong cùng dự án, sau đó kích hoạt bộ máy **Rollup Engine** để tính toán tự động ngày bắt đầu (Start), ngày kết thúc (Finish) và thời lượng (Duration) cho toàn bộ cây công việc.

26. **Co Giãn Độ Rộng Cột Linh Hoạt & Thao Tác Kéo Tráo Đổi Thứ Tự Task Trực Quan (Gantt Column Resizing & Drag-and-Drop Task Reordering)**:
   - **Tự Điều Chỉnh Kích Thước Các Cột Dữ Liệu (`Start`, `Finish`, `Party`, `Duration`, `Predecessor`)**:
     + Đã trang bị thanh kéo con trỏ (`cursor-col-resize`) trên biên phải của tất cả tiêu đề cột dữ liệu bảng Gantt.
     + Người dùng có thể giữ chuột và kéo sang trái/phải để thu hẹp hoặc mở rộng độ rộng từng cột dữ liệu tùy ý.
     + Kích thước các cột được lưu tự động theo từng thiết bị/tài khoản (`localStorage`), đảm bảo bảo toàn chính xác giao diện tùy biến của từng người dùng.
   - **Kéo Thả Di Chuyển Vị Trí Công Việc Tức Thì Trong Chế Độ Chỉnh Sửa (Edit Mode Drag & Drop Task Reordering)**:
     + Kéo thả di chuyển thứ tự công việc được phân quyền an toàn **chỉ kích hoạt khi bật chế độ Chỉnh sửa (`Edit Mode`)**.
     + Khi ở Edit Mode, tay cầm kéo thả (`GripVertical`) xuất hiện rõ ràng trên từng hàng công việc. Cho phép người dùng nhấp giữ và kéo bất kỳ công việc nào (cả công việc chính và công việc con) di chuyển lên/xuống để thay đổi thứ tự.
     + Ở chế độ xem thông thường (Edit Mode tắt), cột đầu tiên hiển thị số thứ tự công việc `#` rõ ràng, vô hiệu hóa hoàn toàn tính năng kéo thả để tránh thao tác nhầm lẫn ngoài ý muốn.

27. **Tối Ưu Trải Nghiệm Tìm Kiếm & Chuyển Tab Sang Mặt Bằng Layout (Layout Search & Link Focus Zoom)**:
   - **Tập Trung Zoom Vào Unit (Tắt Tự Động Mở Tooltip)**:
     - Khi người dùng gõ ô tìm kiếm gian hàng/dự án (`Search unit`) hoặc nhấp liên kết chuyển từ Tab khác (Task Detail / Gantt) sang Tab Layout:
     - Bản đồ sơ đồ mặt bằng tự động chuyển tầng, định vị và **phóng to (Zoom & Pan)** chính xác đến vị trí gian hàng/unit được chọn, kèm hiệu ứng phát sáng nhấp nháy (`Pulse Glow`).
     - Bảng thông tin chi tiết (Tooltip Popover) sẽ **không tự động mở đè lên màn hình**, giữ cho mặt bằng thông thoáng và toàn diện.
     - Khi cần xem chi tiết dự án/thông tin gian hàng, người dùng chỉ cần nhấp trực tiếp vào ô gian hàng tương ứng trên bản đồ.

28. **Mẫu Cấu Hình In Ấn Tự Động (Print Presets in PrintOptionsPanel)**:
   - **Tích Hợp Bộ Mẫu In Chuẩn Định Sẵn (Built-in Presets)**:
     - **Weekly Report**: Khổ A4 Ngang (Landscape), 150 DPI, Watermark DRAFT, Tỷ lệ fit-page.
     - **Budget Overview**: Khổ A3 Ngang (Landscape), 200 DPI, Watermark CONFIDENTIAL, Tỷ lệ fit-cols.
     - **Full Project Gantt**: Khổ A2 Ngang (Landscape), 300 DPI (Sắc nét), Watermark None, Tỷ lệ fit-page.
     - **Quick Summary**: Khổ A4 Dọc (Portrait), 96 DPI (In nhanh trực tiếp trình duyệt).
   - **Lưu & Quản Lý Mẫu In Tùy Chỉnh (Custom Saved Presets)**:
     - Người dùng có thể nhấn nút **`+ Save Preset`** trên bảng `PrintOptionsPanel` để đặt tên và lưu lại toàn bộ cấu hình khổ giấy, hướng xoay, tỷ lệ scale, DPI, watermark, và hiển thị bộ lọc hiện tại.
     - Mẫu in được lưu trữ an toàn theo từng tài khoản (`localStorage`), áp dụng nhanh lại bất cứ lúc nào chỉ với 1 cú nhấp chọn từ menu thả xuống (`-- Select Print Preset --`).

29. **Đồng Bộ Dữ Liệu Thông Báo Từ Task Summarize (Notification Integration with Task Summarize)**:
   - **Hợp Nhất Dữ Liệu Task Summarize Vào Hệ Thống Notification**:
     - Hệ thống tính toán thông báo (`calculateActiveNotifications`) đã được cập nhật để **trích xuất và đồng bộ tự động dữ liệu từ danh sách `taskSummaries` (Task Summarize)** đính kèm trong từng hồ sơ dự án.
     - Giúp toàn bộ thông báo về thời hạn công việc (Start/Finish/Handover deadline), thông báo nhắc nhở công việc tồn đọng giữa các năm (Cross-Year Rollover) và thông báo nhắc tên (`@mention`) hoạt động chính xác 100% ngay cả khi ứng dụng chưa tải chi tiết toàn bộ bảng task (Tri-Gate Lazy Loading / Zero-Read optimization).

30. **Cố Định Vị Trí Bảng Tooltip Gian Hàng Trên Mặt Bằng (Tooltip Stable Position Locking)**:
   - **Khóa Vị Trí Chuẩn (Cố Định Tuyệt Đối Khi Thao Tác)**:
     - Khi mở bảng thông tin chi tiết gian hàng (`LayoutUnitTooltip`) trên sơ đồ mặt bằng, vị trí tọa độ ban đầu (`top`/`left`) được xác định và **khóa cố định tuyệt đối** cho gian hàng đó.
     - Thao tác nhấp nút **"Thêm hình" (+ Link / Image)** hay nhấp con trỏ vào ô nhập link (`Input Focus`) sẽ **giữ nguyên vị trí bảng**, tuyệt đối không bị nhảy hay giật vị trí khi kích thước bảng thay đổi hoặc bàn phím xuất hiện.
     - Vị trí chỉ được tính toán lại khi người dùng nhấp chọn sang một gian hàng mới hoặc thay đổi kích thước cửa sổ trình duyệt (`Window Resize`).

31. **Hiển Thị Bảng Hình Ảnh Nằm Bên Dưới Ô Mô Tả (Layout Tooltip Image Gallery Below Description)**:
   - **Thứ Tự Trực Quan Chuẩn**:
     - Bảng thư viện hình ảnh & link thumbnail (`Image & Link Gallery Panel`) luôn nằm ở **phía dưới ô mô tả / chi tiết dự án (Description)**.
     - Khi người dùng nhấp nút biểu tượng hình ảnh trên thanh tiêu đề, bảng thư viện hình ảnh mở rộng mượt mà xuống bên dưới ô mô tả và tự động cuộn nhẹ hiển thị toàn bộ nội dung hình ảnh một cách trực quan, rõ ràng.

32. **Phóng To & Cuộn Chuột Thu Phóng Hình Ảnh Trong Cửa Sổ Xem Ảnh (Lightbox Zoom & Wheel Scroll Controls)**:
   - **Thao Tác Thu Phóng Đa Năng**:
     - Trong cửa sổ xem ảnh phóng to (`LayoutUnitLightboxModal`), người dùng có thể **cuộn con trỏ chuột (`Mouse Wheel Scroll`)** lên/ลง để phóng to hoặc thu nhỏ ảnh linh hoạt.
     - Tích hợp thêm các nút điều khiển nhanh trên thanh tiêu đề: **Phóng to (`+`)**, **Thu nhỏ (`-`)**, và **Đặt lại tỷ lệ (`1:1`)**.
     - Hỗ trợ thao tác chụm 2 ngón tay (`Pinch-to-zoom`) trên màn hình cảm ứng di động, nhấp cúi đúp (`Double click`) để phóng to/thu nhỏ nhanh, và giữ rê chuột (`Drag to Pan`) để di chuyển hình ảnh dễ dàng.

33. **Tự Động Đẩy Đỉnh Bảng Tooltip Tránh Bị Che Nút Menu (Tooltip Smart Clearance & Height Clamping)**:
   - **Tối Ưu Vùng Nhìn Trên Di Động**:
     - Khi mở rộng bảng hình ảnh trong Tooltip gian hàng trên màn hình di động, bảng Tooltip tự động đẩy vị trí mép trên (`top = safeTop`) lên ngay sát dưới thanh điều hướng chính.
     - Tối ưu kích thước xem trước hình ảnh ở mức vừa vặn (`max-h-[190px]`), giúp toàn bộ khung thông tin và hình ảnh nằm gọn gàng phía trên nút Menu điều hướng (`≡ Menu`), tuyệt đối không bị che khuất hay chìm xuống dưới mép màn hình.

34. **Vẽ Thanh Baseline Kế Hoạch Chuẩn Trên Sơ Đồ Gantt (Gantt Baseline Bar Rendering)**:
   - **Định Vị Đường Baseline Chính Xác**:
     - Trên biểu đồ Gantt, thanh Baseline (màu vàng/amber) được tính toán vẽ chính xác **từ ngày bắt đầu Baseline (`baselineStart` / `baseStart`) đến ngày kết thúc Baseline (`baselineFinish` / `baseFinish`)**.
     - Đã sửa lại công thức tính độ rộng khoảng ngày (`widthDays = Math.max(getExactDays(s, e) + 1, 1)`), giúp thanh Baseline hiển thị trải dài khớp 100% với khoảng thời gian kế hoạch chuẩn, hỗ trợ xem so sánh trực quan giữa tiến độ Baseline và tiến độ thực tế (Actual).

36. **Khắc Phục & Nâng Cấp Toàn Diện Cơ Chế Focus Gian Hàng Trên Tab Layout (Layout Focus & Cross-Floor Auto-Zoom)**:
   - **Tự Động Chuyển Tầng & Zoom Đến Gian Hàng Khi Tìm Kiếm (Auto Floor-Switch & Zoom Focus)**:
     - Khi người dùng tìm kiếm theo mã gian hàng (`unit`), mã dự án (`code`), tên dự án (`name`) hoặc thương hiệu (`brand`), hệ thống sẽ tự động chuyển đúng tầng lầu tương ứng và phóng to mượt mà (`Zoom & Pan`) đến vị trí gian hàng, hiển thị viền vàng nổi bật (`Golden Ring Indicator`) và thanh trạng thái (`LayoutFocusBanner`).
     - Khắc phục hoàn toàn lỗi chuyển tầng bị huỷ lệnh zoom trước khi dữ liệu tầng mới kịp tải xong.
   - **Nút Focus 1-Chạm Trên Bảng Tooltip (Crosshair Focus Button)**:
     - Tích hợp thêm nút Focus (`Crosshair icon`) trực tiếp trên thanh công cụ góc phải của bảng tooltip `LayoutUnitTooltip`, cho phép người dùng phóng to và đưa gian hàng đang xem vào giữa màn hình chỉ bằng một cú nhấp chuột.

37. **Điều Chỉnh Tốc Độ Thu Phóng Con Trỏ Chuột Mượt Mà (Smooth Damped Mouse Wheel Zoom)**:
   - **Tối Ưu Tốc Độ Zoom Trên Desktop**:
     - Áp dụng hệ số giảm chấn hàm mũ mềm mại (`Math.exp(-deltaY * 0.0008)`) trên toàn bộ các trình xem sơ đồ mặt bằng (Live Canvas, Review Tab, Edit Tab), giúp thao tác cuộn con trỏ chuột trên máy tính để bàn diễn ra từ từ, êm ái và chính xác tương đương tốc độ của nút bấm kính lúp (+ / -).

38. **Kiến Trúc Tối Ưu Hóa Hiệu Năng & Giảm Chi Phí Firestore Enterprise (Firestore Zero-Read & Write Coalescing Engine)**:
   - **Cơ Chế Metadata Fingerprinting Cho Niên Độ Cũ (Zero-Read Prior Years)**:
     + Lưu trữ bảng vân tay `years_meta` trên Firestore ghi nhận mốc thời gian cập nhật cuối cùng (`updatedAt`) của từng niên độ (ví dụ các năm đã đóng: 2023, 2024, 2025).
     + Khi người dùng chuyển sang năm cũ, hệ thống đối soát vân tay metadata. Nếu trùng khớp với phiên bản đã lưu trong Local Cache/IndexedDB của trình duyệt, ứng dụng sẽ nạp tức thì 100% dữ liệu từ máy cục bộ mà **không mở listener Firestore mới**, tiết kiệm từ hàng trăm đến hàng nghìn lượt Document READ.
   - **Truy Vấn Tổng Hợp Phía Máy Chủ (Server-Side Aggregations)**:
     + Tích hợp dịch vụ `aggregationService.ts` tận dụng `getCountFromServer` và `getAggregateFromServer` (`sum`, `average`) của Firestore v10+, cho phép lấy tổng số lượng và tổng ngân sách/chi phí chỉ tốn 1 lượt Read duy nhất mà không cần tải hàng nghìn document về client.
   - **Động Cơ Gom Ghi Đột Biến (Write Coalescing & Debouncing Engine)**:
     + Mô-đun `mutationCoalescer.ts` tiếp nhận các thao tác chỉnh sửa liên tiếp (nhập ghi chú, đổi màu, chỉnh tiến độ), gom gộp (merge) dữ liệu trong cửa sổ trễ 400ms – 800ms và chỉ ghi 1 lần duy nhất lên Firestore, giảm tới 70% số lượng Document WRITE.
     + Tự động đẩy vào `syncQueue.ts` khi mất mạng để chống mất mát dữ liệu ngầm theo Quy tắc 2 của AGENTS.md.
   - **Ảo Hóa Bảng Dữ Liệu Toàn Diện (TanStack Table Virtualization)**:
     + Tích hợp hook `useTableVirtualizer.ts` bọc thư viện `@tanstack/react-virtual` vào các bảng lớn (`CostTableView.tsx`, `DetailTableView.tsx`), đảm bảo trình duyệt chỉ render đúng số hàng hiển thị trên khung nhìn màn hình (~20 - 30 hàng), giữ tốc độ cuộn mượt mà 60 FPS trên iPad/máy POS và giảm 90% dung lượng DOM tree.

39. **Hệ Thống Đồng Bộ Biến Thiên Hai Chiều (Giai Đoạn 2: Delta Sync Pipeline)**:
   - **Bảng Nhật Ký Thay Đổi (`taka_deltas`)**:
     + Mỗi khi phát sinh mutation (tạo mới, cập nhật, xóa) trên các thực thể chính (Dự án, Nhiệm vụ, Chi phí, Ủy quyền), hệ thống tự động ghi 1 bản ghi biến thiên vào collection `taka_deltas` với `numericTime = Date.now()`, `docId`, `collectionName`, `action` và `data` payload.
   - **Cơ Chế Kéo Delta Cục Bộ (Client Delta Pull Engine)**:
     + Trình duyệt lưu giữ mốc đồng bộ cuối cùng (`taka_last_delta_sync_time_v1`).
     + Thay vì mở listener toàn bộ bảng hoặc reload toàn bộ dữ liệu, client định kỳ kéo (pull) chỉ những bản ghi có `numericTime > lastSyncTime` và nạp trực tiếp vào Zustand Store (0ms UI re-render).
     + Tự động kích hoạt khi người dùng quay lại tab trình duyệt (`visibilitychange`) hoặc khi mạng trực tuyến trở lại (`online`).
   - **Hiệu Quả**: Giảm ngay **80% - 90% số lượng Document READ** cho toàn bộ các năm còn lại, đưa tốc độ và kiến trúc tiệm cận mô hình Local-First của Linear.

40. **Động Cơ Cơ Sở Dữ Liệu Cục Bộ Local-First Hoàn Chỉnh (Giai Đoạn 3: Dexie.js Storage Engine)**:
   - **Cơ Sở Dữ Liệu Cục Bộ IndexedDB Có Chỉ Mục (`TakaLocalDB` qua Dexie.js)**:
     + Ứng dụng tích hợp động cơ `TakaLocalDB` (`src/lib/localDb.ts`) quản lý các bảng có chỉ mục cao cấp: `projects`, `tasks`, `costs`, `delegations`, `syncMeta` với các index `&id, code, store, year, status, updatedAt`.
   - **Khởi Động Tức Thì Siêu Tốc (Instant Boot ~5ms, 0 Read, 0 Network)**:
     + Khi người dùng mở app, module `bootstrapLocalStore()` lập tức đọc dữ liệu từ Dexie đẩy vào Zustand Store chỉ trong 5ms – 10ms. Giao diện hiển thị tức thì 100% không cần màn hình chờ hay loading spinner.
   - **Điều Phối Viên Đồng Bộ Chạy Ngầm (Background Sync Worker: `backgroundSyncWorker.ts`)**:
     + Các thao tác lưu trữ hàng loạt (`bulkPut`) và phân giải delta được thực hiện trong background microtasks tách biệt khỏi luồng render UI, đảm bảo giao diện luôn duy trì 60 FPS mượt mà.
   - **Đạt Chuẩn Trải Nghiệm Instantaneous Đẳng Cấp Thế Giới**:
     + Kết hợp hoàn hảo giữa IndexedDB (Primary Client Storage), Zustand (In-memory Reactive State), và Firestore (Sync Bus & Cloud Backup Replica), đưa ứng dụng đạt đẳng cấp trải nghiệm người dùng tức thì tương tự Linear và Figma.

41. **Đồng Bộ Đa Tab Qua Kênh Phát Sóng Trình Duyệt & Tự Động Dọn Rác Delta (Giai Đoạn 1 Nâng Cấp: BroadcastChannel & Auto-Purge 48h)**:
   - **Đồng Bộ Tức Thì Giữa Các Tab Trình Duyệt (`broadcastSyncService.ts`)**:
     + Ứng dụng tích hợp kênh phát sóng nội bộ `BroadcastChannel('taka_multi_tab_sync_v1')`. Khi người dùng mở nhiều tab cùng lúc (ví dụ: Tab 1 xem Gantt, Tab 2 xem Detail, Tab 3 xem Cost), nếu có một tab nạp được Delta từ Firestore hoặc thực hiện chỉnh sửa, dữ liệu sẽ được phát sóng trực tiếp qua bộ nhớ RAM của trình duyệt sang tất cả các tab còn lại.
     + Các tab phụ tự động cập nhật Zustand Store và IndexedDB ngay lập tức (0ms độ trễ) mà **không cần gửi thêm bất kỳ yêu cầu đọc nào lên Firestore**, giúp cắt giảm từ **66% đến 80% lượt Document READ** khi làm việc đa tab.
   - **Tự Động Dọn Dẹp Delta Cũ Định Kỳ (`deltaPurgeService.ts`)**:
     + Hệ thống trang bị tiến trình ngầm tự động quét và xóa các bản ghi delta có tuổi thọ lớn hơn 48 giờ (`numericTime < Date.now() - 48h`) theo từng đợt an toàn (`writeBatch`).
     + Giúp bảng `taka_deltas` luôn duy trì kích thước tinh gọn, tối ưu hóa tốc độ truy vấn delta và bảo vệ định mức lưu trữ Firestore lâu dài.

42. **Gom Gộp Biến Thiên Hàng Loạt & Đồng Bộ Nguyên Tử (Giai Đoạn 2 Nâng Cấp: Delta Batching & Coalescing Engine)**:
   - **Hàm Ghi Delta Theo Lô (`recordBatchDeltas`)**:
     + Khi người dùng thực hiện các thao tác biến động hàng loạt (như kéo dời lịch Gantt liên hoàn nhiều task phụ thuộc, import file CSV/Excel 50–100 công việc, hoặc chỉnh sửa tiền nhiệm hàng loạt), hệ thống tự động gom toàn bộ các thay đổi vào **1 document Delta duy nhất** với cấu trúc `action: 'batch_update'` và danh sách `batchItems: [...]`.
     + **Hiệu Quả**: Cắt giảm **80% – 90% số lượng Document WRITE** phát sinh trên Firestore, giúp tiết kiệm chi phí dịch vụ đám mây tối đa.
   - **Đồng Bộ Nguyên Tử (Atomic Multi-Task Synchronization)**:
     + Khi client khác nhận được bản tin `batch_update`, toàn bộ các task liên quan được giải nén và cập nhật vào Zustand Store + Dexie Database trong **cùng 1 khung hình hiển thị (1 render frame)**, triệt tiêu hoàn toàn hiện tượng các task phụ thuộc nhảy gián đoạn nối đuôi nhau.

43. **Tối Ưu Băng Thông & Chống Xung Đột Dữ Liệu Đồng Thời (Giai Đoạn 3 Nâng Cấp: Field-Level Granular Patching)**:
   - **Cơ Chế Bóc Tách Trường Đột Biến Cục Bộ (`deltaPatchService.ts`)**:
     + Thay vì phát tán toàn bộ document Task cồng kềnh (gồm hơn 30 thuộc tính, lịch sử comments, danh sách thành viên, tọa độ layout lên tới 3KB – 5KB), hàm `computeFieldPatch` tự động đối chiếu dữ liệu cũ và mới để trích xuất duy nhất các trường thực sự thay đổi (chẳng hạn chỉ gồm `{ start, finish, duration, updatedAt }`).
     + Đóng gói vào payload delta với cờ `isPatch: true`.
   - **Tiết Kiệm 80% – 95% Băng Thông Mạng (Bandwidth Optimization)**:
     + Dung lượng gói tin đồng bộ delta được cắt giảm xuống chỉ còn khoảng 60 – 150 byte (giảm hơn 95%), giúp việc đồng bộ thời gian thực diễn ra cực nhanh ngay cả trên mạng 3G/4G chập chờn hoặc máy POS cửa hàng.
   - **Triệt Tiêu Xung Đột Ghi Đè Đồng Thời (Zero Concurrent Field-Clobbering)**:
     + Khi hai kỹ sư hoặc quản lý cùng thao tác trên một công việc cùng lúc (ví dụ: Kỹ sư A dời tiến độ ngày bắt đầu/kết thúc trên Gantt trong khi Kỹ sư B đang gõ ghi chú hoặc đổi trạng thái task), hàm `applyFieldPatch` và Dexie `patchLocalRecord` chỉ hòa trộn các trường được chỉ định vào bộ nhớ. Toàn bộ các trường còn lại được bảo toàn nguyên vẹn 100%, xóa bỏ hoàn toàn rủi ro người này ghi đè làm mất công sức nhập liệu của người kia.

44. **Tối Ưu Hóa Sâu Lượt Đọc & Ghi Firestore (Advanced Read/Write Reduction Engine)**:
   - **Cơ Chế Kiểm Tra Bẩn Trước Khi Ghi Dự Án (Dirty-Check Guard in `syncProjectDatesToFirestore`)**:
     + Mỗi khi tính toán lại tiến độ hoặc ngày của dự án, hệ thống so sánh đối chiếu với dữ liệu hiện tại trong RAM. Nếu các mốc ngày (`computedTakStart`, `computedTakCompl`, `computedOpening`) và tiến độ (`computedPlanProgress`, `computedActProgress`, `taskCount`) không có biến động, hệ thống **bỏ qua hoàn toàn lệnh ghi Firestore**, giúp tiết kiệm 50% – 70% lượt ghi `taka_projects`.
   - **Gom Gộp Ghi Metadata Năm (`touchYearMeta` Debounced Coalescing)**:
     + Đưa vào hàng đợi debounce 1.5s với cơ chế giới hạn tối đa 5s. Khi phát sinh nhiều biến động liên tiếp trong cùng 1 năm (như kéo Gantt bar, import task, sửa tiền nhiệm), hệ thống chỉ ghi 1 lần duy nhất lên `taka_config/years_meta`, cắt giảm tới 80% – 90% lượt ghi metadata.
   - **Bảo Vệ Điểm Ngủ Nhàn Rỗi (Idle 0-Read Protection in `pullAndApplyDeltas`)**:
     + Khi máy chủ không có delta mới, hệ thống tự động tịnh tiến an toàn mốc `lastSyncTime` với khoảng đệm an toàn 30s. Điều này duy trì cờ Heartbeat Fingerprint luôn có hiệu lực, ngăn chặn triệt để hiện tượng quá hạn 2 phút gây phát sinh truy vấn kiểm tra định kỳ 25s/lần khi người dùng không thao tác, đưa số lượt đọc lúc nhàn rỗi về đúng **0 lượt READ**.
   - **Ghi Nhận Delta Hai Chiều Cho Module Chi Phí (Cost Delta Sync Pipeline)**:
     + Tích hợp trực tiếp `recordDelta` vào quy trình lưu và xóa chi phí (`financialService.ts`), giúp các máy trạm khác cập nhật tức thời biến động ngân sách qua kênh delta siêu nhẹ mà không cần truy vấn lại toàn bộ danh mục chi phí.






45. **Tối Ưu Hóa Chuông Thông Báo Qua Bộ Nhớ Cục Bộ (Local-First Notification Task Engine)**:
   - **Đọc Trực Tiếp Từ Dexie Local DB (0 Firestore Read)**:
     + Thay vì phát sinh truy vấn Firestore định kỳ kéo 50 công việc để phục vụ biểu tượng chuông thông báo và cảnh báo quá hạn/hạn chót trên Header, hệ thống chuyển sang đọc trực tiếp từ kho lưu trữ cục bộ Dexie (`notificationTaskService.ts`).
     + Dữ liệu được tính toán ngay tại client trong <2ms với chi phí **0 lượt READ Firestore**.
   - **Cơ Chế Dự Phòng 2 Tầng An Toàn Tuyệt Đối (Cold-Boot Safe Fallback)**:
     + Khi người dùng đăng nhập lần đầu tiên trên thiết bị mới hoặc mở bằng chế độ ẩn danh (Incognito) lúc bộ nhớ cục bộ chưa có dữ liệu, hệ thống tự động kích hoạt truy vấn dự phòng lên Firestore đúng 1 lần duy nhất, sau đó nạp ngay vào Dexie.
     + Kể từ lần thứ hai trở đi, 100% các lần tính toán thông báo đều thực hiện ngoại tuyến cục bộ, vừa bảo đảm không bị mất thông báo trên máy mới, vừa tiết kiệm tối đa chi phí truy vấn máy chủ.


46. **Tối Ưu Hóa Hiệu Năng Render Bảng O(1) & Nạp Cục Bộ Tức Thì (Instant Tab Hydration & Pre-indexing Engine)**:
   - **Triệt Tiêu Vòng Lặp O(N²) Trên Từng Dòng Task (`childTasksCountMap`)**:
     + Thay vì mỗi dòng công việc tự chạy vòng lặp lọc trên toàn bộ danh sách hàng trăm công việc để đếm số lượng task con, hệ thống tiền lập chỉ mục O(1) duy nhất 1 lần ở cấp Container (`useDetailData.ts`).
     + Loại bỏ hoàn toàn 250.000 phép so sánh lặp thừa trên mỗi khung hình render, bẻ gãy chuỗi re-render lan truyền giúp bảng cuộn và gõ phím đạt 60 FPS mượt mà tuyệt đối.
   - **Nạp Tức Thì Dữ Liệu Từ Dexie Khi Đổi Tab (`hydrateTasksFromLocal`, `hydrateCostsFromLocal`, `hydrateDelegationsFromLocal`)**:
     + Khi chuyển từ General Tab sang Detail, Gantt, Cost hay Phân quyền, dữ liệu đã có trong IndexedDB lập tức được nạp vào Zustand Store trong 3ms – 5ms, triệt tiêu hoàn toàn màn hình xoay vòng chờ tải.

47. **Nạp Cục Bộ Tức Thời Từng Dự Án (Dexie Local-First Task Hydration) & Ưu Tiên Khung Nhìn Cuộn (Viewport Lazy Loading)**:
   - **Nạp Task Dự Án Cụ Thể Tức Thời 0ms (`hydrateTasksForProjects`)**:
     + Khi người dùng bấm mở rộng (Expand `▶`) một dự án lẻ hoặc tìm kiếm công việc, hệ thống tức thời truy vấn các Task của dự án đó từ cơ sở dữ liệu cục bộ IndexedDB (`localDb.tasks`) thông qua chỉ mục `projectId` và `code` để nạp ngay vào Zustand Store trong 0ms.
     + Người dùng thấy toàn bộ cây công việc hiện lên ngay lập tức mà không phải chờ phản hồi từ mạng internet hay Firestore.
   - **Ưu Tiên Tải Theo Khung Nhìn Thực Tế (Viewport Prioritization & `visibleActiveProjectIds`)**:
     + Bộ đo ảo hóa (`useDetailVirtualization`) và giao diện di động (`DetailMobileView`) liên tục nhận diện các dự án đang hiển thị trực tiếp trong khung nhìn của màn hình (`visibleActiveProjectIds`).
     + Khi mở rộng nhiều dự án cùng lúc, hệ thống ưu tiên kết nối và cập nhật các dự án đang nhìn thấy trước, trong khi các dự án ngoài tầm mắt (off-screen) tiếp tục sử dụng dữ liệu đệm cục bộ cực nhanh, tiết kiệm tối đa băng thông và lượt đọc mạng máy chủ.

48. **Chế Độ Xem Nhanh Nhiệm Vụ 0-Read (Quick Preview Via `taskSummaries`)**:
   - **Xem Nhanh Tiến Độ & Danh Mục Công Việc Không Tốn Lượt Đọc**:
     + Khi mở Quick Navigator trên bất kỳ dự án nào (từ Budget, Cost, Detail, Gantt hay Layout), hệ thống cung cấp thanh "Tasks Preview" tích hợp sẵn.
     + Danh mục nhiệm vụ (Tên task, ngày bắt đầu → kết thúc, số lượng) được hiển thị trực tiếp từ mảng nhúng `p.taskSummaries` đã có sẵn trong tài liệu dự án mà không phát sinh thêm bất kỳ truy vấn Firestore nào (0 Read).
   - **Chuyển Tiếp Linh Hoạt Khi Cần Chỉnh Sửa Chi Tiết**:
     + Người dùng có thể nhấp chuột trực tiếp vào từng task trong danh sách xem nhanh để điều hướng thẳng đến công việc đó trong tab Task Detail hoặc mở Task Modal khi cần chỉnh sửa sâu (ghi chú, hình ảnh hiện trường, phân công...).
     + Tách biệt hoàn toàn giữa nhu cầu "Xem nhanh tổng quan (0 read)" và "Chỉnh sửa chuyên sâu (on-demand read)", tối ưu hóa trải nghiệm mượt mà 60 FPS.

49. **Kiến Trúc Tải Dự Án Cục Bộ & Đồng Bộ Vi Phân Không Rủi Ro (Local-First Projects Hydration & Zero-Risk Delta Pipeline)**:
   - **Nạp Toàn Bộ Danh Mục 250+ Dự Án Từ Dexie IndexedDB (0 Firestore Read)**:
     + Khi mở ứng dụng hoặc đổi năm, hệ thống nạp toàn bộ danh mục 250+ dự án trực tiếp từ cơ sở dữ liệu IndexedDB trên thiết bị (`hydrateProjectsFromLocal`) trong 3ms – 5ms.
     + Triệt tiêu hoàn toàn truy vấn toàn bảng nặng nề (vốn tiêu tốn 220–250 reads mỗi lần vào app), đưa chi phí nạp danh sách dự án về **0 Firestore Read**.
   - **Đồng Bộ Biến Động Qua Delta Pipeline (`taka_deltas`)**:
     + Thay vì giữ kết nối lắng nghe snapshot toàn bộ 250 dự án, ứng dụng chỉ lắng nghe và kéo các bản ghi thay đổi vi phân (`taka_deltas`) phát sinh sau mốc thời gian `lastSyncTime`.
     + Đảm bảo khi đồng nghiệp tạo mới, sửa hoặc xóa dự án, dữ liệu vẫn được cập nhật tức thì theo thời gian thực (1–2 reads) mà không cần tải lại toàn bộ danh mục.
   - **Bảo Toàn 100% Tính Toàn Vẹn Số Liệu Tài Chính & Bản Đồ**:
     + Nhờ duy trì đầy đủ 100% danh mục 250+ dự án trong RAM (Zustand) và Dexie, các công thức tính toán thẻ KPI Tổng quan, Tổng ngân sách năm, Tỷ lệ hoàn thành và Sơ đồ gian hàng mặt bằng (Layout Tab) luôn chính xác tuyệt đối từng đồng, loại bỏ 100% rủi ro hụt số liệu hay trùng số thứ tự No khi tạo mới.

50. **Chuẩn Hóa Thứ Tự Sắp Xếp Công Việc Trên Tab Gantt (Unified Gantt Task Hierarchy & Ordering Engine)**:
   - **Tự Động Sắp Xếp Chuẩn Xác Theo Thứ Tự Nhiệm Vụ (`orderIndex` & `taskCodePhu`)**:
     + Danh sách nhiệm vụ (Tasks) bên dưới từng dự án trên biểu đồ Gantt được tự động sắp xếp theo thứ tự số tự nhiên chuẩn xác: ưu tiên chỉ số con từ mã nhiệm vụ phụ (`#1, #2, #3... #33`), chỉ số thứ tự (`orderIndex: 0, 1, 2...`), hoặc theo thứ tự ngày tháng bắt đầu (`Start Date`) thay vì hiển thị ngẫu nhiên theo thứ tự nạp mạng từ cơ sở dữ liệu.
   - **Bảo Toàn Cấu Trúc Cây Cha - Con (Parent-Child Modular Hierarchy)**:
     + Các nhóm công việc cha và nhiệm vụ con dạng mô-đun được gom nhóm và sắp xếp tuần tự theo đúng tiến độ thực tế, đảm bảo cột số thứ tự `#` hiển thị liền mạch 1, 2, 3... 33 mà không bị nhảy cóc hay xáo trộn vị trí.

51. **Tô Màu Chuẩn Xác Thanh Bar Gantt Theo Vòng Đời Công Việc (Accurate Gantt Bar Lifecycle Coloring)**:
   - **Phân Biệt Chuẩn Xác Trạng Thái Thực Tế Công Việc**:
     + Khắc phục hoàn toàn hiện tượng công việc bị tô màu xanh lá (Green) dựa trên từ khóa tên công việc (`isGreenDesignTask`).
     + Màu sắc thanh Gantt được chuẩn hóa đồng bộ 100% với hệ thống trạng thái doanh nghiệp:
       * **Completed (Hoàn thành)**: Màu xanh lục (`bg-emerald-500`) khi công việc đạt 100% tiến độ thực tế hoặc được duyệt `Approved`.
       * **Delayed / Overdue (Trễ hạn)**: Màu đỏ hồng (`bg-rose-500`) khi công việc quá hạn so với ngày kết thúc hoặc trạng thái bị từ chối/trễ.
       * **On Process (Đang thực hiện)**: Màu xanh dương (`bg-blue-500`) khi công việc đang trong giai đoạn triển khai thực tế.
       * **Upcoming (Sắp diễn ra)**: Màu xám bạc (`bg-slate-400 dark:bg-slate-500`) cho các công việc có ngày thực hiện trong tương lai.
       * **Milestone (Mốc quan trọng)**: Hình thoi màu cam rực rỡ (`bg-[#f97316]`) khi thời lượng bằng 0 ngày hoặc là mốc Opening.
     + Hỗ trợ tô màu tùy biến (`textColor`) do người dùng cài đặt riêng mà không làm mất hiệu ứng tiến độ thực tế (`Actual Progress Fill`).

52. **Tự Động Mở Toàn Màn Hình & Zoom Tiếp Khi Kéo/Zoom Hình Ảnh Trong Tooltip (Auto-Fullscreen Continuous Zoom from Tooltip Images)**:
   - **Nhận Diện Cử Chỉ Thu Phóng Đa Nền Tảng (Pinch-to-Zoom & Wheel Gesture Detection)**:
     + Khi người dùng xem hình ảnh trong bảng Tooltip chi tiết gian hàng (`LayoutUnitTooltip`), hệ thống tự động nhận biết cử chỉ phóng to trực tiếp trên ảnh thu nhỏ:
       * **Trên iPad / iPhone / Màn hình cảm ứng**: Nhận biết cử chỉ chụm mở 2 ngón tay (`Pinch-to-zoom`) với phản hồi phóng to tức thời ngay dưới ngón tay.
       * **Chạm đúp (Double-tap)**: Tự động kích hoạt phóng to toàn màn hình ở mức tỷ lệ 2x.
       * **Trên Máy tính / Chuột / Trackpad**: Nhận biết thao tác cuộn con trỏ chuột lên (`Wheel Up`) hoặc chụm phóng to trên trackpad (`Ctrl + Wheel`).
   - **Tự Động Mở Toàn Màn Hình & Tiếp Tục Zoom Mượt Mà (Seamless Fullscreen Zoom Continuation)**:
     + Ngay khi nhận biết cử chỉ thu phóng vượt ngưỡng, cửa sổ xem ảnh toàn màn hình chất lượng cao (`LayoutUnitLightboxModal` / `ZoomableImageViewer`) tự động mở lên ngay lập tức.
     + Mức phóng to đang thực hiện từ cử chỉ (`initialScale`) được truyền thẳng vào cửa sổ toàn màn hình, giúp hình ảnh mở ra đúng tỷ lệ đã zoom và cho phép người dùng **tiếp tục thu phóng sâu hơn (lên đến 8x)** mà không bị gián đoạn hay phải thao tác lại từ đầu.

53. **Cơ Chế Tự Động Dọn Dẹp File Rác & Bảo Vệ Vệ Sinh Mã Nguồn (Automated Repository Hygiene & Anti-Junk Guard)**:
   - **Loại Bỏ Triệt Để File Rác Ngoại Lai**:
     + Đã thanh lọc toàn bộ các file nén backup cũ (`*.zip`), file so sánh tạm thời (`*.diff`, `*.patch`), các script kiểm thử tạm (`test_*.js`, `patch_*.js`, `USER_MANUAL_UPDATE.py`) và thư mục đệm (`tmp/`, `workspace/`).
   - **Chốt Chặn Khóa Phụ Kiện Tự Động (Strict NPM-Only Guard)**:
     + Tích hợp lệnh tiền xây dựng `prebuild` và `clean:junk` trong `package.json` tự động tiêu hủy bất kỳ lockfile phụ nào (`bun.lock*`, `yarn.lock`, `pnpm-lock.yaml`) trước mỗi lần build ứng dụng.
     + Bổ sung cấu hình toàn diện trong `.gitignore` ngăn chặn vĩnh viễn việc tạo hay lưu vết file rác trên kho mã nguồn.

54. **Tối Ưu Hiệu Năng Kéo Mặt Bằng 60 FPS & Tải Ảnh Tooltip Tức Thời 0ms (LiveView Smooth Panning & Instant Lightbox Hydration)**:
   - **Kéo Thả Mặt Bằng LiveView Mượt Mà 60 FPS (Zero-Jank Canvas Panning Engine)**:
     + Khắc phục hoàn toàn hiện tượng khựng giật khi rê chuột hoặc kéo di chuyển mặt bằng: loại bỏ toàn bộ các sự kiện `handleMouseLeaveUnit` và `handleMouseEnterUnit` phát sinh ngoài ý muốn trong quá trình di chuột hoặc kéo Stage (`buttons > 0` hoặc `isInteractingRef.current`), triệt tiêu 100% các lượt re-render React thừa thãi.
     + Loại bỏ hiệu ứng đổ bóng mờ Canvas nặng nề (`shadowBlur: 3px / 10px`) trên các huy hiệu cảnh báo và hình ảnh gian hàng, giúp bộ xử lý đồ họa Konva 2D đạt tốc độ khung hình mượt mà 60 FPS – 120 FPS ngay cả trên mặt bằng chứa hơn 300 gian hàng phức tạp.
   - **Khắc Phục Triệt Để Lỗi Ảnh Xoay Vòng Không Mở Trong Tooltips (Instant Image Lightbox & CDN Fallback)**:
     + Chuyển đổi và nạp tức thời các định dạng link hình ảnh: hỗ trợ chuyển đổi giao thức `r2://` sang endpoint công khai HTTP (`https://hcm.taka-pm.org/...`), đồng thời hỗ trợ chuyển tiếp hình ảnh Google Drive sang CDN trực tiếp (`lh3.googleusercontent.com`) giúp hình ảnh hiển thị ngay trong 0ms mà không bị chặn bởi cookie bên thứ ba.
     + Tách biệt cửa sổ phóng to toàn màn hình (`LayoutUnitLightboxModal`) ra khỏi vùng DOM bao bọc của Tooltip, ngăn chặn xung đột sự kiện cuộn/chặn sự kiện (`stopPropagation`), cho phép ảnh mở ra ở vị trí trung tâm tự nhiên và tiếp tục thu phóng mượt mà.

55. **Cơ Chế Bảo Vệ Thức Giấc Thông Minh & Tải Nhiệm Vụ Cục Bộ (Sleep/Wake Delta Reconnect Guard & Local-First Tasks Engine)**:
   - **Triệt Tiêu Bão Đọc Sau Khi Mở Lại App Cách 2–4–8 Tiếng (Zero-Storm iOS Sleep/Wake Guard)**:
     + Tự động nhận diện khi người dùng khóa màn hình iPhone hoặc chuyển ứng dụng nền trong thời gian dài (> 10 phút, 2h, 4h, 8h) qua các sự kiện `visibilitychange`, `pageshow` (iOS WebKit BFCache) và `focus`.
     + Ngắt bỏ hoàn toàn các listener cũ bị hết hạn `resumeToken` của Firestore, ngăn chặn triệt để hiện tượng Firestore tự động tải lại toàn bộ danh mục nhiệm vụ từ máy chủ (tiết kiệm hàng ngàn lượt Firestore READ mỗi lần mở app).
     + Kích hoạt ngay cơ chế đồng bộ vi phân tức thời (`triggerImmediateDeltaSync`): chỉ tải đúng các bản ghi thay đổi mới phát sinh trong thời gian thiết bị ngủ (0 đến vài read thay vì 1,000+ reads).
   - **Đồng Bộ Hai Lớp Cho Toàn Bộ Nhiệm Vụ (IndexedDB Dexie ➔ RAM Zustand ➔ Delta Pipeline)**:
     + Khi người dùng chuyển sang tab Gantt / Detail / Calendar / Task Delegation: ưu tiên kiểm tra dữ liệu đã lưu trong IndexedDB (Dexie). Nếu đã có dữ liệu, hiển thị ngay tức thì trong 0ms mà không cần truy vấn toàn bảng từ Firestore.
     + Hỗ trợ rút cạn đa trang vi phân (`Multi-page Delta Draining` lên đến 1,000 bản ghi), đảm bảo dù điện thoại tắt mạng hoặc để qua đêm thì khi kết nối lại, 100% dữ liệu mới từ đồng nghiệp đều được cập nhật hoàn chỉnh, không bao giờ xảy ra lỗi lệch số hay mất mát thông tin.


56. **Phân Khúc Tải Nhiệm Vụ Theo Dự Án & Quản Trị Ngân Sách Bộ Nhớ iOS 40MB (On-Demand Task Chunking & iOS 40MB Memory Budget Guard)**:
   - **Tải Nhiệm Vụ Theo Nhu Cầu & Tối Ưu Hóa Khung Nhìn (On-Demand Project Task Chunking)**:
     + Khi người dùng chuyển sang tab Gantt hoặc Detail, danh sách nhiệm vụ được nạp linh hoạt theo đúng các dự án đang bung mở (`expandedProjectIds`) hoặc được tìm kiếm (`searchActiveProjectIds`), triệt tiêu việc tải toàn bộ danh mục của tất cả dự án cùng lúc.
     + Cơ chế nạp bất đồng bộ ưu tiên Dexie (`hydrateTasksForProjects`) đưa dữ liệu cục bộ vào bộ nhớ trước khi đánh giá kết nối Firestore, giúp ứng dụng nhận biết tức thời dữ liệu đã có sẵn và chuyển thẳng sang chế độ đồng bộ vi phân Delta Pipeline mà không kích hoạt cuộc gọi tải toàn bộ bảng từ máy chủ.
   - **Quản Trị Trần Bộ Nhớ iOS 40MB & Dọn Rác Tự Động (iOS 40MB Memory Budget & LRU Eviction)**:
     + Tích hợp dịch vụ quản trị bộ nhớ `storageBudgetService`: định kỳ đo đạc dung lượng IndexedDB qua `navigator.storage.estimate()` trên iOS Safari.
     + Khi bộ nhớ đạt 80% ngưỡng an toàn 35MB, hệ thống tự động giải phóng các đầu việc đã hoàn thành (`Completed`) của các niên độ cũ (từ 2 năm trước trở về trước) khỏi bộ nhớ đệm thiết bị, giữ nguyên vẹn 100% dữ liệu các năm hiện hành (2025, 2026, 2027...). Điều này ngăn chặn triệt để hiện tượng WebKit tự động dọn sạch cơ sở dữ liệu IndexedDB khi tắt máy lâu.
   - **Tự Động Thu Gom Kênh Kết Nối Sau 15 Phút (TTL Auto-Garbage Collection cho Listeners)**:
     + Bổ sung bộ đếm thời gian sống TTL (15 phút) cho các listener chi phí (`costsTTLTimeouts`) và nhiệm vụ (`tasksTTLTimeouts`): khi người dùng rời khỏi tab hoặc thu gọn dự án, kênh kết nối sẽ tự động đóng lại sau 15 phút không hoạt động để tiết kiệm pin thiết bị và tài nguyên WebSocket.
   - **Kiểm Toán & Giám Sát Hiệu Năng Thức Giấc (Zero-Read Wake Recovery Audit)**:
     + Mọi chu kỳ thức giấc sau khi iPhone ngủ 2h, 4h, 8h đều được ghi nhận tự động vào bảng giám sát hiệu năng (`usePerformanceStore`), xác nhận việc khôi phục giao diện hoàn thành trong 0ms với 0 lượt tải lặp lại từ Cloud Firestore.


57. **Nâng Cấp Tab Gantt: Tắt Tooltip Dứt Điểm, Mũi Tên Tím Độc Lập & Chế Độ Focus Active Toàn Diện (Gantt UX & Focus Engine)**:
   - **Nút "X" Tắt Tooltip Nhạy Bén & Dứt Điểm (Zero-Sticking Tooltip Dismissal)**:
     + Khắc phục triệt để hiện tượng nhấn "X" nhưng tooltip không đóng hoặc bị ghim lại: phân lập hoàn toàn `e.stopPropagation()` và chặn quyền chiếm con trỏ `setPointerCapture` của tính năng kéo thả khi tương tác trên các nút điều khiển tiêu đề (X, Pin, Open Detail, Focus 🎯).
     + Bổ sung cờ trạng thái `isDismissed` và callback `onClose` trên thanh GanttBar: khi bấm "X", tooltip đóng tức thì (0ms) và dập tắt hoàn toàn trạng thái hover của thanh công việc cho đến khi người dùng di chuột rời hẳn khỏi thanh bar (`onMouseLeave`), loại bỏ 100% cảm giác dính tooltip ngoài ý muốn.
   - **Nút Mũi Tên Tím Tự Động Quay Xuống (ChevronDown) Khi Có Task Con Gộp Mở**:
     + Chuẩn hóa logic kiểm tra từ `.every()` sang `.some()` (`currentModularParentIds.some(...)`): ngay khi có bất kỳ nhóm công việc con gộp nào đang được mở rộng, nút mũi tên tím ở tiêu đề cột lập tức chuyển sang trạng thái quay xuống (`ChevronDown`) với màu tím nổi bật (`bg-purple-600 text-white`).
     + Cho phép người dùng thu gọn nhanh toàn bộ các nhóm task con gộp (Collapse All Modular Groups) chỉ với 1 chạm duy nhất.
   - **Tôn Trọng 100% Trạng Thái Đóng / Mở Dự Án Khi Nhấn Mũi Tên Tím**:
     + Loại bỏ hoàn toàn các lệnh tự động ép mở dự án (`handleToggle(p.id)` và `setExpandedProjectIds`) khi người dùng nhấn nút mũi tên tím ở cả tiêu đề cột và ở từng dòng dự án.
     + Nếu dự án đang đóng, hệ thống tôn trọng tuyệt đối trạng thái đóng của dự án và chỉ điều khiển trạng thái mở/đóng của các nhóm task con gộp bên trong, ngăn chặn xáo trộn bố cục bảng Gantt.
   - **Chế Độ Focus Active Toàn Diện Trên Tab Gantt (Gantt Focus Active Engine)**:
     + **Tự Động Mở Rộng & Định Vị Tâm Điểm (Auto-Reveal & Auto-Center)**: Khi kích hoạt Focus (nhấn nút 🎯 trên dòng công việc, trong Tooltip, hoặc điều hướng từ Task Detail / Command Palette), hệ thống tự động bung mở dự án cha (nếu đang đóng) và nhóm task mẹ (nếu là task con). Đồng thời tự động cuộn mượt định vị chính xác vị trí dòng task (Vertical Scroll) và canh giữa thanh tiến độ trên dòng thời gian Timeline (Horizontal Scroll).
     + **Thanh Điều Khiển Nổi (`GanttFocusControls` Widget)**: Cụm điều khiển nổi đặt tại góc dưới bên phải màn hình hiển thị trực quan mã task (Mono badge), tên task, dự án liên quan cùng 3 nút hành động tiện lợi:
       * **Locate (🎯)**: Tái định vị tâm điểm dòng thời gian và dòng task bất kỳ lúc nào.
       * **Task Detail (↗️)**: Mở ngay cửa sổ chi tiết công việc.
       * **Exit / Clear (Esc)**: Thoát khỏi chế độ Focus.
     + **Huy Hiệu Focus Active & Phím Tắt Thoát Nhanh (Escape Shortcut)**: Thanh công cụ Gantt hiển thị huy hiệu Focus Active nổi bật kèm mã phụ và tên task; người dùng có thể nhấn phím `Escape` bất kỳ lúc nào trên bàn phím để thoát ngay chế độ Focus.


58. **Khắc Phục Lỗi Kẹt OFFLINE & Tải Dự Án L3 HCM Mới Cho Niên Độ Active (Current Active Year Realtime Sync Guard)**:
   - **Xử Lý Lỗi Bỏ Qua `onSnapshot` Cho Năm Hiện Hành (`!isClosedOrPastYear`)**:
     + **Nguyên nhân trước đó**: Khi bộ nhớ đệm thiết bị (Dexie/IndexedDB) đã chứa sẵn một vài dự án năm 2026, cờ `hasLocalData` trong `useFirebaseData.ts` tự động kích hoạt chế độ local-first và ngắt kết nối `onSnapshot` cho năm 2026, khiến cờ kết nối trên Header bị kẹt ở trạng thái **OFFLINE** (màu đỏ) và không nạp tiếp các dự án L3 HCM mới tạo trên Cloud.
     + **Khắc phục**: Thêm điều kiện ràng buộc `hasLocalData && isClosedOrPastYear`: chỉ cho phép bỏ qua `onSnapshot` đối với các niên độ cũ đã đóng (`isClosedOrPastYear`, ví dụ 2024, 2025). Đối với các niên độ active hiện hành (2026, 2027...), dữ liệu vẫn được nạp ngay tức thì từ Dexie trong 0ms (không giật đơ UI), đồng thời kênh `onSnapshot` được kích hoạt liên tục bên dưới background để cập nhật trạng thái **ONLINE** (màu xanh) và tự động kéo các dự án L3 HCM mới về thiết bị theo thời gian thực.
   - **Đồng Bộ Trạng Thái Kết Nối Cho Các Kênh Dữ Liệu (Projects, Tasks, Costs, Delegations & Configs)**:
     + Áp dụng đồng bộ quy tắc `isClosedOrPastYear` cho toàn bộ các kênh theo dõi Dự án, Nhiệm vụ, Chi phí và Phân công.
     + Tích hợp cập nhật `setCloudStatus("online")` ngay khi nhận được snapshot cấu hình tĩnh (`taka_config/versions`), đảm bảo chỉ số trạng thái kết nối luôn phản ánh chính xác trạng thái Firestore tức thì.

59. **Chuẩn Hóa Thuật Toán Tính Tiến Độ % & Phân Loại Trạng Thái Thực Tế (Act Status & Progress % Calculation)**:
    - **Ánh Xạ Tỷ Lệ Tiến Độ % Chuẩn Theo Từng Trạng Thái Thực Tế (`getActStatusPercent` & `getSubTaskProgressScore`)**:
      + **Completed / Approved / Finish**: Đạt **100%** tiến độ thực tế (công việc đã hoàn thành và được duyệt).
      + **Pending Approval / Pending Completed / Review Late / ReqApproval**: Đạt **80%** tiến độ (người thực hiện đã làm xong và gửi yêu cầu duyệt nghiệm thu, chờ người giao việc xác nhận).
      + **Accepted / In Progress / On process / Delayed**: Đạt **50%** tiến độ (người nhận đã tiếp nhận công việc và đang tích cực triển khai; có tính nội suy theo thời gian nếu có ngày thực tế `startAct` và `finishAct`).
      + **Correction Needed / Needs Rework / Rejected**: Đạt **30%** tiến độ (công việc đã triển khai một phần nhưng bị trả về chỉnh sửa lại).
      + **Planned / Assigned / Upcoming / Critical Delay / Cancel**: **0%** tiến độ (mới giao hoặc chỉ mới lên kế hoạch, chưa tiếp nhận thực thi).
    - **Tối Ưu Hóa Phân Loại Trạng Thái Thực Tế Nhóm Ủy Quyền (`resolveActualStatus`)**:
      + **Khắc phục lỗi nhận diện sai `Accepted`**: Trước đây, các subtask có trạng thái `Accepted` bị đưa vào nhóm mặc định `Assigned`, dẫn đến việc bị gán nhầm thành `Planned` khi chưa đến hạn hoặc `Critical Delay` khi quá hạn kế hoạch. Nay hệ thống tự động phân loại chính xác các subtask `Accepted` / `On process` thành nhóm `In Progress` (hiển thị nhãn **In Progress** màu xanh dương khi trong hạn, hoặc **Delayed** màu vàng hổ phách khi quá hạn kế hoạch).
      + **Trực Quan Hóa Tỷ Lệ % Trên Huy Hiệu Trạng Thái**: Trên các bảng phân hệ **Task Delegation (Desktop/Mobile)**, **Task Detail**, **Project Modal** và **Gantt Tooltip**, huy hiệu thực tế hiển thị minh bạch cả nhãn trạng thái lẫn tỷ lệ phần trăm tương ứng, ví dụ: `Act: In Progress (50%)`, `Act: Completed (100%)`, `Act: Pending Approval (80%)`, `Act: Delayed (50%)`.
    - **Tổng Hợp Tiến Độ Dự Án Đa Tầng (`computeActProgressPercent`)**:
      + Đối với các công việc có ủy quyền (`Delegation`): Tiến độ công việc mẹ được tính bằng trung bình cộng chính xác điểm số tiến độ của tất cả các subtask con, phản ánh chân thực tiến độ thực thi thực tế của từng phòng ban.
      + Đối với các công việc thuần túy không qua ủy quyền: Tự động ghi nhận 100% khi có `runningStatus === 'Completed'` hoặc `approval === 'Approved'`, và 50% khi `On process` / `Delayed`, loại bỏ hoàn toàn lỗi hiển thị 0% tiến độ cho các công việc không có nhóm ủy quyền.

60. **Tối Ưu Hóa Hệ Thống Thông Báo Doanh Nghiệp (Enterprise Notification System - 4 Pillars)**:
    - **Đề Xuất 1: Phân Cấp Mức Độ Khẩn Cấp & Độ Ưu Tiên (Priority & Urgency Tiering)**:
      + Phân tầng thông báo theo 4 mức độ trực quan chuẩn quốc tế (Asana/Jira/Linear):
        * **Critical (Nguy Cấp - Đỏ/Rose)**: Công việc hoặc dự án đã quá hạn (`Overdue`), hoặc yêu cầu ủy quyền bị từ chối (`Rejected`). Có đường viền đỏ nổi bật bên trái thẻ và huy hiệu `CRITICAL`.
        * **Due Soon (Sắp Đến Hạn - Hổ Phách/Amber)**: Công việc/mốc bàn giao sắp đến hạn trong vòng 48 giờ. Có đường viền màu vàng hổ phách và huy hiệu `DUE SOON`.
        * **Action Req (Cần Thao Tác - Xanh Tím/Indigo)**: Được nhắc tên (`@mention`), yêu cầu duyệt/nhận việc phân công, hoặc chuyển tiếp công việc sang năm mới (`Cross-Year Rollover`). Có huy hiệu `ACTION REQ`.
        * **Info (Thông Tin - Xanh/Slate)**: Cập nhật thông thường hoặc mốc tiến độ xa hơn 48 giờ.
      + Bổ sung thanh nút lọc mức độ ưu tiên: `All Priorities`, `Critical`, `Due Soon`, `Action Req` kèm bộ đếm số lượng chưa đọc theo thời gian thực.
    - **Đề Xuất 2: Nhận Diện Vai Trò & Việc Trực Tiếp Của Tôi (Smart Role & Assignee Relevance)**:
      + Tự động rà soát và gắn nhãn **Assigned to You** (Xanh lá/Emerald) hoặc **@Mentioned You** khi công việc/ủy quyền thuộc phòng ban/người dùng hiện hành.
      + Bổ sung nút chuyển nhanh trên thanh công cụ: `All` vs `My Tasks` giúp người quản lý hoặc nhân viên lọc tức thì những việc mình cần trực tiếp xử lý giữa hàng trăm thông báo toàn dự án.
    - **Đề Xuất 3: Thao Tác Nhanh Trực Tiếp Trên Thẻ Thông Báo & Hoãn Nhắc Việc (Inline Quick Actions & Snooze)**:
      + **Hoàn Thành Nhanh 1-Chạm (`Complete Task`)**: Nút bấm trực tiếp trên thẻ công việc chưa hoàn thành giúp cập nhật ngay trạng thái `Completed`, ghi nhận tức thì vào Zustand Store, lưu xuống Firestore và tự động đánh dấu đã đọc thông báo.
      + **Hoãn Nhắc Nhở (`Snooze 1d / 3d`)**: Cho phép người dùng hoãn thông báo 1 ngày hoặc 3 ngày nếu chưa thể xử lý ngay; thông báo tạm thời ẩn khỏi danh sách unread và tự động xuất hiện trở lại khi hết hạn hoãn.
      + **Mở Nhanh (`Open`)**: Nút mở trực tiếp đến hồ sơ dự án/công việc tương ứng mà không gây nhầm lẫn khi bấm vào thẻ.
61. **Tối Ưu Hóa Logic Hiển Thị Nút Delegation & Tiến Độ Thực Tế (Project & Task Delegation UI Logic)**:
    - **Nút Delegation Ở Cấp Dự Án Mang Tính Chỉ Báo Trạng Thái (Read-Only Status Indicator)**:
      + Nút công tắc Delegation ở cấp Project được chuyển sang chế độ chỉ đọc (Read-only status indicator), loại bỏ chức năng gạt trực tiếp bằng tay ở cấp dự án.
      + Công tắc cấp Project chỉ sáng màu xanh lá (ON) khi có ít nhất 1 công việc con (Subtask) trong dự án đó được bật gạt Delegation ON (`groupTasks.some(t => Boolean(t.delegation))`).
    - **Ẩn / Hiện Thanh Tiến Độ Thực Tế (`ACT PRG:`) Đồng Bộ Trên Tab General Và Tab Detail**:
      + Khi dự án không có Delegation màu xanh lá (tức không có công việc con nào bật Delegation), thanh progress bar màu xanh lá cây (`Act:` / `ACT PRG:`) sẽ tự động ẩn đi trên cả thẻ di động (Mobile Card), bảng chi tiết (Detail Table View), sơ đồ mặt bằng General Tab (General Canvas & Cards), chỉ giữ lại thanh tiến độ kế hoạch (`PLAN PRG:`).
      + Trạng thái ẩn/hiện thanh xanh lá ở Tab General đồng bộ 100% theo đúng trạng thái Delegation của công việc con trong Tab Detail.
    - **Ẩn Huy Hiệu Cập Nhật Act Status % Trong Công Việc Con**:
      + Đối với các công việc con trong dự án không bật Delegation, hệ thống ẩn hoàn toàn huy hiệu `Act: ... (X%)`, chỉ hiển thị trạng thái kế hoạch `Pl: ...`, bảo đảm giao diện luôn gọn gàng và chính xác theo bản chất nghiệp vụ.
    - **Quy Tắc Cộng Dồn Tiến Độ Khi Công Việc Con Đạt 100% (`Cumulative Predecessor Completion Rule`)**:
      + Khi một công việc con (Subtask / Task con) bất kỳ được nghiệm thu hoặc cập nhật đạt **100% Act Status (`Completed / Approved / Finish`)**, toàn bộ các công việc con đứng trước nó trong chuỗi thực hiện sẽ tự động được tính **100% tiến độ thực tế** (dù chưa thay đổi nhãn trạng thái riêng) và được cộng dồn giá trị 100% vào tổng tiến độ thanh bar (`ACT PRG:`).
    - **Bảo Toàn Liên Kết Tiền Nhiệm Tuyệt Đối Theo Task ID Khi Đổi Thứ Tự/Mã Subtask (`Absolute Predecessor Task Binding`)**:
      + Khi người dùng di chuyển lên/xuống (Move Up/Down), sắp xếp lại theo ngày (Sort Subtasks), hoặc kéo thả (Drag & Drop) làm thay đổi thứ tự và mã hiển thị subtask (ví dụ `#1` chuyển thành `#2`), hệ thống duy trì liên kết tuyệt đối dựa trên `Task ID` cố định của công việc tiền nhiệm.
      + Chuỗi Predecessor của các công việc phụ thuộc sẽ tự động cập nhật hiển thị theo mã hiển thị mới của đúng công việc tiền nhiệm đó, tuyệt đối không bị đứt gãy hoặc trỏ nhầm sang công việc khác ở vị trí cũ.




