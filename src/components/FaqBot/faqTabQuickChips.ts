import { TabId } from '../../types';

export interface FaqQuickChip {
  id: string;
  tabIds: Array<TabId | 'all'>;
  labelVi: string;
  labelEn: string;
  answerVi: string;
  answerEn: string;
  targetTab?: TabId;
  targetTabLabelVi?: string;
  targetTabLabelEn?: string;
}

export const TAB_DISPLAY_NAMES: Record<string, { vi: string; en: string }> = {
  general: { vi: 'Tab General (Dự án)', en: 'General Tab (Projects)' },
  detail: { vi: 'Tab Task Detail (WBS)', en: 'Task Detail Tab (WBS)' },
  gantt: { vi: 'Tab Gantt (Tiến độ)', en: 'Gantt Chart Tab' },
  budget: { vi: 'Tab Budget (Ngân sách)', en: 'Budget Tab' },
  cost: { vi: 'Tab Cost (Chi phí 3 đợt)', en: 'Cost Tab (3 Installments)' },
  calendar: { vi: 'Tab Lịch (Calendar)', en: 'Calendar Tab' },
  delCalendar: { vi: 'Tab Lịch Giao việc', en: 'Delegation Calendar Tab' },
  taskDelegation: { vi: 'Tab Giao việc (Tracker)', en: 'Task Delegation Tab' },
  projectDelegation: { vi: 'Tab Ủy quyền Dự án', en: 'Project Delegation Tab' },
  layout: { vi: 'Tab Mặt bằng 2D (Layout)', en: '2D Floor Layout Tab' },
  picture_mapping: { vi: 'Tab Ảnh hiện trường & R2', en: 'Picture Mapping & R2 Tab' },
  setting: { vi: 'Tab Cài đặt & Cloudflare R2', en: 'Settings & Cloudflare R2 Tab' },
  accControl: { vi: 'Tab Phân quyền (RBAC)', en: 'Account Control (RBAC) Tab' },
  summary: { vi: 'Tab Tổng hợp (Summary)', en: 'Summary Tab' },
  executive: { vi: 'Tab Executive Dashboard', en: 'Executive Dashboard Tab' },
  notification: { vi: 'Tab Thông báo', en: 'Notifications Tab' },
  manual: { vi: 'Tab Cẩm nang HDSD', en: 'User Manual Tab' },
  auditLog: { vi: 'Tab Nhật ký Kiểm toán', en: 'Audit Log Tab' },
  csvExport: { vi: 'Tab Xuất/Nhập CSV & Excel', en: 'CSV / Excel Export Tab' },
  myWork: { vi: 'Tab My Work (Việc của tôi)', en: 'My Work Tab' }
};

export const FAQ_TAB_QUICK_CHIPS: FaqQuickChip[] = [
  {
    id: 'chip-mywork-reviewed-sync',
    tabIds: ['myWork', 'all'],
    labelVi: 'Đồng bộ tích việc My Work & Bộ lọc Today',
    labelEn: 'My Work Account Sync & Time Filters',
    targetTab: 'myWork',
    targetTabLabelVi: 'Mở Tab My Work',
    targetTabLabelEn: 'Open My Work Tab',
    answerVi:
      '### ⚡ Quản lý Việc cá nhân (`My Work`) & Đồng bộ Đã kiểm tra theo Tài khoản\n' +
      '• **Bộ lọc thời gian**: Lọc nhanh theo `Today` (Hôm nay), `This Week` (Tuần này), `Next 7 Days`, `This Month`, hoặc `Overdue` (Quá hạn) kết hợp `All / HCM / HN` và `Fix Project Code`.\n' +
      '• **Đồng bộ theo Tài khoản (iOS ⇄ Laptop)**: Khi bạn tích chọn hoàn tất/đã kiểm tra 1 task trên điện thoại iOS (VD: tài khoản `CP-HUNG`), trạng thái được đồng bộ thời gian thực lên Cloud theo tài khoản. Khi mở Laptop, task đó tự động nằm ở cột **`Completed`** và không hiện lại ở cột việc cần làm.\n' +
      '• **Tự động nhắc lại thông minh**: Nếu task đã tích nhưng sau đó có cập nhật % tiến độ mới, đổi hạn chót hoặc bị `Reject`, task sẽ tự động quay lại cột `To Do / In Progress`.',
    answerEn:
      '### ⚡ My Work Time-Horizon Filters & Per-Account Reviewed Sync\n' +
      '• **Time Filters**: Filter by `Today`, `This Week`, `Next 7 Days`, `This Month`, or `Overdue` alongside `All / HCM / HN` and `Fix Project Code`.\n' +
      '• **Per-Account Cross-Device Sync**: Checking off a task on iOS syncs to your account (`taka_config/mywork_reviewed_<account>`) so it automatically appears in **`Completed`** on your Laptop without reappearing in active columns.\n' +
      '• **Smart Reopen**: If a reviewed task later changes progress, due date, or is rejected for rework, it automatically returns to active columns.'
  },
  {
    id: 'chip-quick-nav-fix-project',
    tabIds: ['general', 'detail', 'gantt', 'budget', 'cost', 'myWork'],
    labelVi: 'Quick Navigator & Ô Fix Project Code',
    labelEn: 'Quick Navigator & Fix Project Code',
    targetTab: 'detail',
    targetTabLabelVi: 'Xem trên Task Detail',
    targetTabLabelEn: 'View on Task Detail',
    answerVi:
      '### 📌 Cơ chế điền `Fix Project Code` khi chọn từ Quick Navigator\n' +
      '• Khi bạn click chọn dự án từ **Quick Navigator** (hoặc link dự án), mã dự án được điền vào ô **`Fix Project Code`** thay vì ô `Search`.\n' +
      '• **Lợi ích kép**:\n' +
      '  1. Ô **`Fix Project Code`** vẫn tự động nhảy đúng tầng (`Location`), mở khóa bộ lọc `All` và bung mở các dòng con y hệt như khi tìm kiếm.\n' +
      '  2. Ô **`Search`** được giữ trống hoàn toàn để bạn thoải mái gõ thêm từ khóa lọc sâu (tên nhà thầu, tên việc, hạng mục chi phí) bên trong dự án đã ghim!',
    answerEn:
      '### 📌 Quick Navigator & `Fix Project Code` vs `Search`\n' +
      '• Selecting a project from **Quick Navigator** populates **`Fix Project Code`** instead of the `Search` input.\n' +
      '• **Dual Benefit**:\n' +
      '  1. **`Fix Project Code`** automatically jumps to the project floor, relaxes status/money filters to `All`, and expands child rows.\n' +
      '  2. The **`Search`** box stays empty so you can filter by secondary keywords (task name, contractor, cost item) inside the pinned project!'
  },
  {
    id: 'chip-picture-mapping-dynamic-csv',
    tabIds: ['picture_mapping', 'layout'],
    labelVi: 'Import/Export CSV & Sheet 2 Giải thích (Dynamic)',
    labelEn: 'Dynamic Rules CSV/Excel & Sheet 2 Guide',
    targetTab: 'picture_mapping',
    targetTabLabelVi: 'Mở Picture Mapping',
    targetTabLabelEn: 'Open Picture Mapping',
    answerVi:
      '### 📊 Xuất / Nhập CSV & Excel 2 Sheet trong `Picture Mapping ➔ DYNAMIC`\n' +
      '• **Xuất Excel 2 Sheet (`Export Excel`)**:\n' +
      '  - **Sheet 1 (`Dynamic_Rules_Data`)**: Chứa toàn bộ danh sách nhóm (`Rule-Based Groups`) và các điều kiện lọc để bạn chỉnh sửa hàng loạt rồi Import ngược lại.\n' +
      '  - **Sheet 2 (`Field_Reference_Guide`)**: Bảng từ điển giải thích chi tiết từng cột, liệt kê các trường hợp lệ (`Floor`, `Category`, `Lease Status`, `Area`, `Party`...), các toán tử (`=`, `!=`, `contains`, `>`, `<`) và ví dụ mẫu.\n' +
      '• **Đồng bộ R2**: Bấm `SAVE CLOUD DYNAMIC` / `LOAD CLOUD DYNAMIC` để lưu và tải mặt bằng + quy tắc động từ Cloudflare R2.',
    answerEn:
      '### 📊 2-Sheet Excel/CSV Import & Export in `Picture Mapping ➔ DYNAMIC`\n' +
      '• **2-Sheet Excel Export**:\n' +
      '  - **Sheet 1 (`Dynamic_Rules_Data`)**: Editable flat table of all rule groups and matching conditions for bulk import.\n' +
      '  - **Sheet 2 (`Field_Reference_Guide`)**: Complete dictionary explaining every column, valid field keys (`Floor`, `Category`, `Lease Status`, `Area`...), operators (`=`, `!=`, `contains`, `>`, `<`), and sample values.\n' +
      '• **Cloudflare R2 Sync**: Use `SAVE CLOUD DYNAMIC` / `LOAD CLOUD DYNAMIC` to sync floor plans and rules across devices.'
  },
  {
    id: 'chip-gantt-predecessor',
    tabIds: ['gantt', 'detail', 'all'],
    labelVi: 'Cách nối Predecessor #',
    labelEn: 'How to link Predecessor #',
    targetTab: 'detail',
    targetTabLabelVi: 'Mở Tab Task Detail',
    targetTabLabelEn: 'Open Task Detail Tab',
    answerVi:
      '### 🔗 Cách nối Tiền nhiệm (Predecessor `#`) trong Taka PM\n' +
      '• **Cú pháp chuẩn**: `[Mã_Dự_Án]#[Số_Thứ_Tự_Task][Loại][ Độ_Trễ]` (VD: `A01#1FS+2` hoặc gõ nhanh `#1` trong cùng dự án).\n' +
      '• **4 Loại liên kết**:\n' +
      '  - **`FS` (Finish-to-Start - Mặc định)**: Việc trước xong ➔ Việc này bắt đầu.\n' +
      '  - **`SS` (Start-to-Start)**: Hai việc cùng bắt đầu song song (`#1SS`).\n' +
      '  - **`FF` (Finish-to-Finish)**: Hai việc cùng kết thúc (`#1FF`).\n' +
      '  - **`SF` (Start-to-Finish)**: Việc trước bắt đầu ➔ Việc này kết thúc.\n' +
      '• **Khóa 2 đầu (Double Predecessor)**: Nhập `A01#1SS, A01#3FF` để tự động khóa ngày `Start` theo `#1`, `Finish` theo `#3` và tự tính `Duration`.\n' +
      '• 💡 **Lưu ý**: Bật biểu tượng **Linh hoạt (▶️ Play xanh dương)** trên dòng task để lịch tự trượt dây chuyền.',
    answerEn:
      '### 🔗 Linking Predecessors (`#`) in Taka PM\n' +
      '• **Syntax**: `[ProjectCode]#[TaskNo][Type][±Lag]` (e.g., `A01#1FS+2` or `#1` within the same project).\n' +
      '• **4 Link Types**: `FS` (Finish-to-Start, default), `SS` (Start-to-Start), `FF` (Finish-to-Finish), `SF` (Start-to-Finish).\n' +
      '• **Two-Ended Lock**: Enter `A01#1SS, A01#3FF` to lock both `Start` and `Finish` and auto-compute `Duration`.\n' +
      '• 💡 **Tip**: Ensure the task is set to **Flexible (▶️ Blue Play)** so schedule changes cascade automatically.'
  },
  {
    id: 'chip-gantt-month-resize',
    tabIds: ['gantt'],
    labelVi: 'Chỉnh độ rộng tháng trên Gantt',
    labelEn: 'Resize month width on Gantt',
    targetTab: 'gantt',
    targetTabLabelVi: 'Thực hành trên Gantt',
    targetTabLabelEn: 'Try on Gantt',
    answerVi:
      '### ↔️ Cách chỉnh độ rộng Tháng & Giữ dòng Tháng cố định trên Gantt\n' +
      '• **Giữ cố định dòng tháng (Sticky Month Row)**: Khi cuộn xuống xem các task bên dưới, thanh tiêu đề tháng luôn ghim trên cùng để dễ gióng cột thời gian.\n' +
      '• **Kéo giãn giữa 2 tháng**: Đưa chuột vào **vạch ngăn cách giữa 2 tháng** trên thanh tiêu đề (con trỏ đổi thành `↔`), nhấn giữ chuột trái và kéo sang phải/trái để phóng rộng hoặc thu hẹp tháng.\n' +
      '• **Chống nhảy zoom**: Cuộn con lăn chuột trên dòng tháng đã được khóa zoom để bạn cuộn trang mượt mà.',
    answerEn:
      '### ↔️ Resizing Month Columns & Sticky Timeline Header\n' +
      '• **Sticky Month Row**: Scrolling vertically keeps the month row pinned at the top for easy date alignment.\n' +
      '• **Drag Between Months**: Hover over the **divider line between any two months** (`↔` cursor), click and drag left/right to shorten or lengthen month widths.\n' +
      '• **Safe Vertical Scroll**: Mouse wheel zoom on the month header is disabled to prevent accidental zooming while scrolling.'
  },
  {
    id: 'chip-calendar-ios-qr',
    tabIds: ['calendar', 'taskDelegationCalendar', 'all'],
    labelVi: 'Đồng bộ lịch iOS qua QR',
    labelEn: 'Sync iOS Calendar via QR',
    targetTab: 'calendar',
    targetTabLabelVi: 'Mở Tab Calendar',
    targetTabLabelEn: 'Open Calendar Tab',
    answerVi:
      '### 📱 Đồng bộ Lịch Dự án vào iPhone / iPad (iOS Calendar qua QR & Webcal)\n' +
      '1. Tại **Tab Calendar** (hoặc nút **Calendar Sync** trên Header), bấm nút **`Sync iOS / QR`**.\n' +
      '2. Chọn phạm vi cần đồng bộ (`Chi nhánh HCM/HN`, `Năm`, hoặc `Dự án phụ trách`).\n' +
      '3. Mở **Camera iPhone/iPad** quét mã **QR Code** trên màn hình (hoặc bấm **`Subscribe Webcal`**).\n' +
      '4. Bấm **"Đăng ký" (Subscribe)** trên ứng dụng Lịch của iOS ➔ Mọi mốc `Start`, `Handover`, `Opening` và `Task` sẽ tự động cập nhật ngầm về điện thoại!',
    answerEn:
      '### 📱 Syncing Schedule to iOS Calendar via QR / Webcal\n' +
      '1. In the **Calendar Tab** (or Header **Calendar Sync** button), click **`Sync iOS / QR`**.\n' +
      '2. Select your desired filter scope (`Store HCM/HN`, `Year`, or `Assigned Projects`).\n' +
      '3. Scan the **QR Code** using your iPhone/iPad Camera (or tap **`Subscribe Webcal`**).\n' +
      '4. Tap **Subscribe** in Apple Calendar to receive live updates for `Start`, `Handover`, `Opening`, and `Tasks`.'
  },
  {
    id: 'chip-setting-sleep-tabs',
    tabIds: ['setting', 'all'],
    labelVi: 'Chống ngủ tab Chrome/Edge',
    labelEn: 'Prevent Chrome/Edge Sleeping Tabs',
    targetTab: 'setting',
    targetTabLabelVi: 'Mở Tab Cài đặt',
    targetTabLabelEn: 'Open Settings Tab',
    answerVi:
      '### ⚡ Chống ngủ Tab Chrome / Edge & Tự hồi phục qua đêm\n' +
      '• **Cách thêm vào danh sách loại trừ trình duyệt**:\n' +
      '  - **Chrome**: Vào `chrome://settings/performance` ➔ Mục *Always keep these sites active* ➔ Bấm **Add** và thêm địa chỉ trang Taka PM.\n' +
      '  - **Edge**: Vào `edge://settings/system` ➔ Mục *Never put these sites to sleep* ➔ Bấm **Add**.\n' +
      '• **Cơ chế Tự Hồi Phục Qua Đêm (Overnight Wake-up Guard)**: Ngay cả khi gập máy tính hoặc iPad ngủ qua đêm, khi mở lại app hệ thống tự động phát hiện nhịp tim (`Heartbeat Gap > 60s`), tự kéo bù 100% `taka_deltas` và dọn sạch "Task Ma" mà không cần bấm xóa cache.',
    answerEn:
      '### ⚡ Preventing Chrome/Edge Sleeping Tabs & Overnight Recovery\n' +
      '• **Browser Whitelist**:\n' +
      '  - **Chrome**: Go to `chrome://settings/performance` ➔ *Always keep these sites active* ➔ Add the Taka PM URL.\n' +
      '  - **Edge**: Go to `edge://settings/system` ➔ *Never put these sites to sleep* ➔ Add URL.\n' +
      '• **Built-in Overnight Wake-up Guard**: Upon waking from sleep (`Heartbeat Gap > 60s`), Taka PM automatically reconnects sockets, pulls missed deltas (`forceAll`), and reconciles zombie tasks.'
  },
  {
    id: 'chip-r2-cors-fix',
    tabIds: ['setting', 'picture_mapping', 'layout', 'all'],
    labelVi: 'Sửa lỗi CORS R2',
    labelEn: 'Fix Cloudflare R2 CORS',
    targetTab: 'setting',
    targetTabLabelVi: 'Mở Cài đặt R2',
    targetTabLabelEn: 'Open R2 Settings',
    answerVi:
      '### ☁️ Cách sửa lỗi CORS trên Cloudflare R2 (GET, PUT, DELETE)\n' +
      '• Khi tải ảnh mặt bằng/hiện trường hoặc PDF lên R2 bị lỗi mạng/CORS, hãy vào **Cloudflare Dashboard ➔ R2 ➔ Chọn Bucket ➔ Settings ➔ CORS Policy** và dán cấu hình chuẩn sau:\n' +
      '  - `AllowedOrigins`: `["*"]`\n' +
      '  - `AllowedMethods`: `["GET", "PUT", "POST", "DELETE", "HEAD"]`\n' +
      '  - `AllowedHeaders`: `["*"]`\n' +
      '  - `ExposeHeaders`: `["ETag", "Content-Length"]`\n' +
      '• 💡 **Cơ chế dự phòng**: Taka PM tích hợp sẵn proxy `/api/r2-upload` và `/api/pdf-proxy` trên `server.ts` giúp vượt rào cản CORS tự động trên cả Safari iOS.',
    answerEn:
      '### ☁️ Fixing Cloudflare R2 CORS Policy (GET, PUT, DELETE)\n' +
      '• Open **Cloudflare Dashboard ➔ R2 ➔ Your Bucket ➔ Settings ➔ CORS Policy** and configure:\n' +
      '  - `AllowedOrigins`: `["*"]`\n' +
      '  - `AllowedMethods`: `["GET", "PUT", "POST", "DELETE", "HEAD"]`\n' +
      '  - `AllowedHeaders`: `["*"]`\n' +
      '  - `ExposeHeaders`: `["ETag", "Content-Length"]`\n' +
      '• 💡 **Built-in Proxy**: Taka PM also routes uploads and PDF streams via `/api/r2-upload` and `/api/pdf-proxy` in `server.ts` to bypass iOS Safari ITP/CORS blocks.'
  },
  {
    id: 'chip-budget-cost-3paid',
    tabIds: ['budget', 'cost', 'summary', 'all'],
    labelVi: 'Ngân sách & Thanh toán 3 đợt',
    labelEn: 'Budget & 3-Stage Payments',
    targetTab: 'cost',
    targetTabLabelVi: 'Mở Tab Cost',
    targetTabLabelEn: 'Open Cost Tab',
    answerVi:
      '### 💰 Quản lý Ngân sách & Thanh toán 3 Đợt (`1st, 2nd, 3rd Paid`)\n' +
      '• **Công thức Số dư Ngân sách (`Remaining`)**:\n' +
      '  `Remaining = Budget - Actual/Forc + Supporting Fee`\n' +
      '  - 🟢 **Xanh (`> 20%`)**: Ngân sách an toàn.\n' +
      '  - 🟡 **Vàng (`0% – 20%`)**: Sắp chạm trần ngân sách.\n' +
      '  - 🔴 **Đỏ (`< 0%`)**: Vượt ngân sách.\n' +
      '• **Quy tắc 3 Đợt thanh toán (`Cost Tab`)**:\n' +
      '  - `Tổng sau VAT = Trước VAT × (1 + VAT%)` (VAT hỗ trợ `0%`, `8%`, `10%`).\n' +
      '  - Khi nhập **Đợt 1 (`1st Paid`)** và **Đợt 2 (`2nd Paid`)**, hệ thống tự tính **Đợt 3 (`3rd Paid`)** để tổng đủ **100%**.\n' +
      '  - `Balance = Actual - (1st + 2nd + 3rd Paid)` (bằng `0` khi đã tất toán).',
    answerEn:
      '### 💰 Budget Warnings & 3-Installment Payments (`1st, 2nd, 3rd Paid`)\n' +
      '• **Remaining Budget Formula**: `Remaining = Budget - Actual/Forc + Supporting Fee`\n' +
      '  - 🟢 **Green (`> 20%`)**: Safe | 🟡 **Amber (`0%–20%`)**: Near limit | 🔴 **Red (`< 0%`)**: Over budget.\n' +
      '• **3-Installment Cost Rule**:\n' +
      '  - `Incl. VAT = Excl. VAT × (1 + VAT%)` (`0%`, `8%`, `10%`).\n' +
      '  - Entering `1st Paid` and `2nd Paid` auto-computes `3rd Paid` to equal **100%**.\n' +
      '  - `Balance = Actual - (1st + 2nd + 3rd Paid)`.'
  },
  {
    id: 'chip-layout-area-m2',
    tabIds: ['layout', 'general'],
    labelVi: 'Tính diện tích m² & Code Link',
    labelEn: 'Area m² & Project Code Link',
    targetTab: 'layout',
    targetTabLabelVi: 'Mở Tab Layout 2D',
    targetTabLabelEn: 'Open 2D Layout Tab',
    answerVi:
      '### 📐 Tương quan Diện tích `Size (m²)` giữa Unit và Project Code Link\n' +
      '• **Đồng bộ 2 chiều**: Khi sửa `Size (m²)` của ô Unit trong **Tab Layout (Edit Mode)**, diện tích dự án gắn với Unit đó tự động cập nhật theo.\n' +
      '• **Gom nhóm nhiều Unit (`Project Code Link`)**: Nếu dự án chính `L1-104-1` nối thêm `L1-104-2, L1-104-3, L1-104-4`, tổng diện tích trên **Color Legend** sẽ cộng đầy đủ diện tích của dự án chính **cùng diện tích của từng Unit được link vào**.\n' +
      '• **Dự án gom nhóm (Modular)**: Các dự án con lấy diện tích trực tiếp từ Unit tương ứng trên mặt bằng (nếu không có Unit thì `= 0`), không lấy trùng diện tích của dự án chủ.',
    answerEn:
      '### 📐 Area `Size (m²)` Sync & Multi-Unit `Project Code Link`\n' +
      '• **Two-Way Sync**: Editing a unit’s `Size (m²)` in **Layout Edit Mode** automatically updates the linked project’s area.\n' +
      '• **Multi-Unit `Project Code Link`**: When project `L1-104-1` links `L1-104-2, L1-104-3, L1-104-4`, the **Color Legend** sums the primary project area plus all linked unit areas accurately.\n' +
      '• **Grouped Projects**: Linked sub-projects take their own unit area from the layout (or `0` if unmapped) rather than duplicating the host project’s size.'
  },
  {
    id: 'chip-ios-40mb-dexie',
    tabIds: ['setting', 'general', 'audit'],
    labelVi: 'Bộ nhớ Local Dexie & Trần 40MB iOS',
    labelEn: 'Dexie Local-First & iOS 40MB Cap',
    targetTab: 'setting',
    targetTabLabelVi: 'Xem trạng thái bộ nhớ',
    targetTabLabelEn: 'View Storage Status',
    answerVi:
      '### 🚀 Kiến trúc Local-First (Dexie.js) & Chống tràn 40MB trên iOS\n' +
      '• **Nạp tức thì `0ms`**: Khi mở app, dữ liệu đọc trực tiếp từ **Dexie.js (IndexedDB)** giúp hiển thị ngay trong 5–10ms không cần chờ xoay vòng tải.\n' +
      '• **Trần bộ nhớ iOS 40MB**: Trên iPhone/iPad, bộ nhớ đệm Firestore được giới hạn ở mức `40MB` (`41,943,040 bytes`) kết hợp `persistentSingleTabManager` để ngăn Safari WebKit tự ý xóa trắng IndexedDB.\n' +
      '• **Cô lập 4 khóa (`projectId + projectCode + year + store`)**: Đảm bảo các dự án trùng mã giữa các năm hoặc giữa `HCM` và `HN` không bao giờ bị lẫn dữ liệu.',
    answerEn:
      '### 🚀 Local-First (Dexie.js) & iOS 40MB Memory Guard\n' +
      '• **0ms Cold Boot**: Data loads instantaneously from **Dexie.js (IndexedDB)** in 5–10ms while syncing deltas in the background.\n' +
      '• **iOS 40MB Cap**: On iOS/iPadOS, cache size is capped at `40MB` (`41,943,040 bytes`) with `persistentSingleTabManager` to prevent WebKit IndexedDB eviction.\n' +
      '• **4-Key Isolation (`projectId + projectCode + year + store`)**: Strictly isolates projects across years and stores (`HCM` vs `HN`).'
  },
  {
    id: 'chip-delegation-tracker',
    tabIds: ['taskDelegation', 'notification'],
    labelVi: 'Quy trình 5 bước duyệt Tracker',
    labelEn: '5-Step Tracker Approval',
    targetTab: 'taskDelegation',
    targetTabLabelVi: 'Mở Tab Delegation',
    targetTabLabelEn: 'Open Delegation Tab',
    answerVi:
      '### 🤝 Quy trình 5 Bước nghiệm thu công việc trên Tracker\n' +
      '1. **`Assigned (0%)`**: Giao việc cho PIC / Nhà thầu kèm hạn chót.\n' +
      '2. **`Accepted / On process (50%)`**: Người nhận xác nhận và bắt đầu thi công.\n' +
      '3. **`Pending completed (85%)`**: Báo cáo xong và đính kèm ảnh nghiệm thu.\n' +
      '4. **`Approved / Completed (100%)`**: Quản lý duyệt hoàn thành (nếu bật `Realtime Update`, lịch Task cha tự chốt 100%).\n' +
      '5. **`Rejected (25%)`**: Yêu cầu làm lại kèm ghi chú lý do.',
    answerEn:
      '### 🤝 5-Step Delegation Tracker Workflow\n' +
      '1. **`Assigned (0%)`** ➔ 2. **`Accepted / On process (50%)`** ➔ 3. **`Pending completed (85%)`** ➔ 4. **`Approved / Completed (100%)`** (or 5. **`Rejected (25%)`**).\n' +
      '• When 100% of sub-tasks are `Approved` and `Realtime Update` is active, the parent task automatically completes.'
  },
  {
    id: 'chip-gantt-inline-edit-mode',
    tabIds: ['gantt', 'detail'],
    labelVi: 'Sửa trực tiếp trên Gantt (Edit Mode)',
    labelEn: 'Inline Edit on Gantt (Edit Mode)',
    targetTab: 'gantt',
    targetTabLabelVi: 'Mở Tab Gantt',
    targetTabLabelEn: 'Open Gantt Tab',
    answerVi:
      '### ✏️ Nhập liệu `Duration`, `Start`, `Finish`, `Party`, `Predecessor` trên Tab Gantt\n' +
      '• **Chỉ mở khi bật `Edit Mode`**: Bấm nút **`ON Task detail`** (màu xanh trên Header) để mở khóa sửa trực tiếp 5 cột trên bảng Gantt.\n' +
      '• **Đồng bộ 2 chiều (0ms)**: Mọi thay đổi trên Gantt tự động tính lại lịch dây chuyền (`cascade`) và đồng bộ 100% với **Tab Task Detail**.',
    answerEn:
      '### ✏️ Inline-Editing `Duration`, `Start`, `Finish`, `Party`, `Predecessor` on Gantt\n' +
      '• **Protected by `Edit Mode`**: Toggle **`ON Task detail`** on the Header to unlock inline editing for all 5 columns on the Gantt table.\n' +
      '• **Two-Way Sync (0ms)**: Edits cascade dependent dates and sync 100% with **Task Detail**.'
  },
  {
    id: 'chip-layout-legend-attached',
    tabIds: ['layout'],
    labelVi: 'Xem 📎 Attached trên Legend & Mở Comment Tooltip',
    labelEn: 'Legend 📎 Attachments & Tooltip Comments',
    targetTab: 'layout',
    targetTabLabelVi: 'Thực hành trên Layout',
    targetTabLabelEn: 'Try on Layout Tab',
    answerVi:
      '### 📎 Nút Xem Ảnh Đính kèm trên `Color Legend` & Mở `Comments` từ Tooltip\n' +
      '• **Nút `📎 Attached` trên Color Legend**: Bấm biểu tượng kẹp giấy trên từng dòng trạng thái của **Color Legend** để mở Lightbox xem toàn bộ ảnh/PDF của nhóm dự án đó (0 Firestore Read).\n' +
      '• **Mở Dự án từ Tooltip ưu tiên hiện `Comments`**: Khi bấm nút mở Project trên hộp thoại nổi (Tooltip) của mặt bằng, cửa sổ dự án tự động mở thẳng vào tab **`Comments`** trước tiên.',
    answerEn:
      '### 📎 Color Legend Attachments & Tooltip Comments-First\n' +
      '• **`📎 Attached` on Color Legend**: Click the paperclip badge on any status row in the Color Legend to browse all project photos/PDFs in that status group (0 Firestore Reads).\n' +
      '• **Tooltip Opens `Comments` First**: Clicking Open Project on a Layout unit tooltip opens the Project Modal directly to the **`Comments`** tab first.'
  }
];

export function getQuickChipsForTab(activeTab: TabId): FaqQuickChip[] {
  const tabSpecific = FAQ_TAB_QUICK_CHIPS.filter(chip => chip.tabIds.includes(activeTab));
  const generalFallbacks = FAQ_TAB_QUICK_CHIPS.filter(
    chip => chip.tabIds.includes('all') && !tabSpecific.some(t => t.id === chip.id)
  );
  return [...tabSpecific, ...generalFallbacks].slice(0, 6);
}
