export interface FaqKnowledgeEntry {
  id: string;
  category: 'Overview & Scope' | 'Budget & Cost' | 'Task & Gantt' | 'Delegation & Tracker' | 'Layout & Floor Plan' | 'RBAC & Sync';
  titleVi: string;
  titleEn: string;
  keywords: string[];
  answerVi: string;
  answerEn: string;
  relatedIds?: string[];
}

export const FAQ_CATEGORIES: Array<{
  id: 'All' | FaqKnowledgeEntry['category'];
  labelVi: string;
  labelEn: string;
}> = [
  { id: 'All', labelVi: 'Tất cả chủ đề', labelEn: 'All Topics' },
  { id: 'Overview & Scope', labelVi: 'Chi nhánh & Năm TC', labelEn: 'Store & Fiscal Year' },
  { id: 'Budget & Cost', labelVi: 'Ngân sách & Chi phí', labelEn: 'Budget & Cost' },
  { id: 'Task & Gantt', labelVi: 'Task WBS & Gantt', labelEn: 'Task WBS & Gantt' },
  { id: 'Delegation & Tracker', labelVi: 'Giao việc & Tracker', labelEn: 'Delegation & Tracker' },
  { id: 'Layout & Floor Plan', labelVi: 'Mặt bằng & Diện tích', labelEn: 'Layout & Area' },
  { id: 'RBAC & Sync', labelVi: 'Phân quyền & Đồng bộ', labelEn: 'RBAC & Sync' },
];

export const FAQ_KNOWLEDGE_BASE: FaqKnowledgeEntry[] = [
  {
    id: 'store-year-isolation',
    category: 'Overview & Scope',
    titleVi: '1. Cô lập 4 khóa định danh (Chi nhánh Store & Năm tài chính)',
    titleEn: '1. 4-Key Isolation (Store & Fiscal Year Scope)',
    keywords: [
      'store', 'hcm', 'hn', 'year', 'năm', 'chi nhánh', 'cô lập', 'isolation',
      'projectcode', 'projectid', 'archive', 'read-only', 'khóa sổ', 'bắt đầu', 'người mới', 'new user'
    ],
    answerVi:
      '• **Cô lập tuyệt đối 4 khóa (`projectId` + `projectCode` + `year` + `store`)**: Một mã dự án (VD: `A01` hoặc `L1-105`) có thể tồn tại ở cả **HCM** và **HN** hoặc ở các năm tài chính khác nhau (`2025`, `2026`, `2027`). Hệ thống tách biệt hoàn toàn dữ liệu theo 4 khóa này.\n' +
      '• **Khóa sổ năm cũ (Archive Read-Only Lock)**: Khi chọn năm tài chính nhỏ hơn năm hiện tại (`year < CurrentYear`), hệ thống tự động bật chế độ **Read-Only** để bảo vệ số liệu lịch sử kiểm toán.\n' +
      '• **Safe Boot**: Khi mở ứng dụng, hệ thống nạp tức thì từ bộ nhớ đệm Local-First (Dexie IndexedDB) trong <10ms tại tab **General**.',
    answerEn:
      '• **Strict 4-Key Isolation (`projectId` + `projectCode` + `year` + `store`)**: A project code (e.g. `A01` or `L1-105`) can exist independently across **HCM** and **HN** or different fiscal years (`2025`, `2026`, `2027`). All Tasks, Costs, and Delegations are strictly isolated by these 4 keys.\n' +
      '• **Archive Read-Only Lock**: Selecting a past fiscal year (`year < CurrentYear`) automatically activates **Read-Only Mode** to protect historical audit data.\n' +
      '• **Safe Boot**: The app boots at the **General** tab in <10ms using Local-First Dexie IndexedDB cache.',
    relatedIds: ['project-status-lifecycle', 'rbac-permissions']
  },
  {
    id: 'budget-hierarchy-formula',
    category: 'Budget & Cost',
    titleVi: '2. Cấu trúc Ngân sách 3 cấp & Công thức tính Remaining Budget',
    titleEn: '2. 3-Tier Budget Hierarchy & Remaining Budget Formulas',
    keywords: [
      'budget', 'ngân sách', 'remaining', 'còn lại', 'approved', 'ratio', 'tỷ trọng',
      'category', 'sub-category', 'detail', 'utilization', 'vượt ngân sách', 'over budget', 'addendum', 'phụ lục'
    ],
    answerVi:
      '• **Cấu trúc 3 cấp (3-Tier Budget)**:\n' +
      '  1. **Category (Hạng mục lớn)**: Tổng ngân sách năm được phân bổ.\n' +
      '  2. **Sub-Category (Hạng mục con)**: Tự động quy đổi `Approved Budget = Category Budget × (Ratio% / 100)`.\n' +
      '  3. **Detail Row (Dòng chi tiết dự án)**: Liên kết trực tiếp với `projectCode` để gom chi phí thực tế.\n' +
      '• **Công thức cốt lõi**:\n' +
      '  - `Spent (Đã chi)` = Tổng `amount` (**Chưa VAT / Excl. VAT**) của các khoản chi phí hợp lệ gắn với dòng ngân sách.\n' +
      '  - `Remaining Budget (Còn lại)` = `Approved Budget - Spent (Excl. VAT)`.\n' +
      '  - `Utilization (%)` = `(Spent / Approved Budget) × 100`.\n' +
      '• **Ngưỡng cảnh báo màu**: Xanh lục (`< 80%`), Vàng cam (`80% – 100%`), Đỏ (`> 100%` - Vượt ngân sách).\n' +
      '• **Phụ lục hợp đồng (Addendum)**: Khi có phụ lục, ngân sách gốc tự động khóa (`isOriginalLocked = true`) để bảo toàn dấu vết kiểm toán.',
    answerEn:
      '• **3-Tier Budget Structure**:\n' +
      '  1. **Category**: Top-level annual budget allocation.\n' +
      '  2. **Sub-Category**: Auto-calculates `Approved Budget = Category Budget × (Ratio% / 100)`.\n' +
      '  3. **Detail Row**: Links via `projectCode` to aggregate actual project expenditures.\n' +
      '• **Core Formulas**:\n' +
      '  - `Spent` = Sum of `amount` (**Excl. VAT**) of linked valid Cost items.\n' +
      '  - `Remaining Budget` = `Approved Budget - Spent (Excl. VAT)`.\n' +
      '  - `Utilization (%)` = `(Spent / Approved Budget) × 100`.\n' +
      '• **Visual Thresholds**: Emerald (`< 80%`), Amber (`80% – 100%`), Rose Red (`> 100%` Over-budget).\n' +
      '• **Contract Addendum**: Adding an addendum locks the original budget (`isOriginalLocked = true`) for financial audit compliance.',
    relatedIds: ['cost-installments-vat', 'rbac-permissions']
  },
  {
    id: 'cost-installments-vat',
    category: 'Budget & Cost',
    titleVi: '3. Quản lý Chi phí (Cost), VAT & Quy tắc Thanh toán 3 đợt',
    titleEn: '3. Cost Management, VAT & 3-Installment Payment Rules',
    keywords: [
      'cost', 'chi phí', 'vat', 'thuế', 'installment', 'thanh toán', '3 đợt', 'p1', 'p2', 'p3',
      'variation order', 'vo', 'phát sinh', 'other expenses', 'final warning', '14 ngày', 'difference'
    ],
    answerVi:
      '• **Phân loại Chi phí**:\n' +
      '  1. `Cost Summary`: Chi phí hợp đồng chính.\n' +
      '  2. `Variation Order (VO)`: Chi phí phát sinh (tự động cộng dồn vào thực chi của hạng mục).\n' +
      '  3. `Other Expenses`: Chi phí lẻ / vận hành khác.\n' +
      '• **Công thức VAT & Chênh lệch**:\n' +
      '  - `Contract Amount (Sau VAT)` = `Amount (Chưa VAT) × (1 + VAT% / 100)`.\n' +
      '  - `Difference (Chênh lệch)` = `Approved Budget - Total Excl. VAT` (Dương = Tiết kiệm, Âm = Vượt trần).\n' +
      '• **Quy tắc 3 đợt thanh toán (`P1`, `P2`, `P3`)**:\n' +
      '  - Khi nhập `P1` (Tạm ứng) và `P2` (Thanh toán tiến độ), đợt quyết toán cuối `P3` tự động tính: `P3 = Contract Amount (Sau VAT) - P1 - P2`.\n' +
      '  - Tổng `%P1 + %P2 + %P3` luôn đối soát bằng **100%**.\n' +
      '• **Cảnh báo quyết toán (Final Warning)**: Cảnh báo vàng/đỏ khi hạn thanh toán đợt cuối còn `≤ 14 ngày` mà chưa tích chọn `Final Payment Done`.',
    answerEn:
      '• **Cost Categories**:\n' +
      '  1. `Cost Summary`: Main contract costs.\n' +
      '  2. `Variation Order (VO)`: Change orders (automatically rolled into category spend).\n' +
      '  3. `Other Expenses`: Miscellaneous operational expenses.\n' +
      '• **VAT & Difference Formulas**:\n' +
      '  - `Contract Amount (Incl. VAT)` = `Amount (Excl. VAT) × (1 + VAT% / 100)`.\n' +
      '  - `Difference` = `Approved Budget - Total Excl. VAT` (Positive = Savings, Negative = Overrun).\n' +
      '• **3-Installment Rule (`P1`, `P2`, `P3`)**:\n' +
      '  - Entering `P1` and `P2` auto-computes the final settlement: `P3 = Contract Amount (Incl. VAT) - P1 - P2` (`100%` total).\n' +
      '• **Final Settlement Alert**: Highlights a warning when the final payment due date is within `≤ 14 days` and `Final Payment Done` is not checked.',
    relatedIds: ['budget-hierarchy-formula']
  },
  {
    id: 'task-wbs-gantt-predecessors',
    category: 'Task & Gantt',
    titleVi: '4. Cây công việc (WBS), Mã Task, Predecessor & Tự động Lập lịch Gantt',
    titleEn: '4. Task WBS Hierarchy, Task Codes, Predecessors & Auto-Scheduling',
    keywords: [
      'task', 'gantt', 'wbs', 'predecessor', 'tiền nhiệm', 'fs', 'ss', 'ff', 'sf',
      'duration', 'rollup', 'task con', 'task mẹ', 'sub-task', 'parent', 'lập lịch', 'save task'
    ],
    answerVi:
      '• **Đánh mã WBS tự động**:\n' +
      '  - Task gốc (Root Task): `<ProjectCode>-<Index>` (VD: `A01-1`, `A01-2`).\n' +
      '  - Task con (Sub-task): `<ParentCode>.<SubIndex>` (VD: `A01-1.1`, `A01-1.2`).\n' +
      '• **In-Memory Rollup (Task mẹ)**: Ngày `Start` = Min(Start các con), `Finish` = Max(Finish các con), `% Tiến độ` = Trung bình cộng tiến độ các task con.\n' +
      '• **Quan hệ Tiền nhiệm (Predecessor)**:\n' +
      '  - Hỗ trợ 4 loại liên kết chuẩn MS Project: **FS** (Finish-to-Start, mặc định), **SS** (Start-to-Start), **FF** (Finish-to-Finish), **SF** (Start-to-Finish) kèm độ trễ `+/- N ngày` (VD: `A01-1FS+2`, `A01-1SS`).\n' +
      '  - Hỗ trợ liên kết chéo giữa các dự án khác nhau (Cross-Project Predecessors).\n' +
      '  - Khi Task tiền nhiệm đổi ngày, toàn bộ chuỗi Task phụ thuộc có bật `Realtime Update` sẽ tự động trượt lịch (Cascade Scheduling) và chống lặp vô tận (`Circular Guard`).',
    answerEn:
      '• **Automatic WBS Coding**:\n' +
      '  - Root Task: `<ProjectCode>-<Index>` (e.g. `A01-1`, `A01-2`).\n' +
      '  - Sub-task: `<ParentCode>.<SubIndex>` (e.g. `A01-1.1`, `A01-1.2`).\n' +
      '• **In-Memory Parent Rollup**: Parent `Start` = Min(children Start), `Finish` = Max(children Finish), and `Progress %` = Average of child tasks.\n' +
      '• **Predecessor Engine**:\n' +
      '  - Supports **FS** (default), **SS**, **FF**, **SF** with lag days `+/- N` (e.g. `A01-1FS+2`).\n' +
      '  - Supports cross-project predecessors and automatic topological cascade scheduling with a Circular Dependency Guard.',
    relatedIds: ['delegation-tracker-workflow', 'project-status-lifecycle']
  },
  {
    id: 'delegation-tracker-workflow',
    category: 'Delegation & Tracker',
    titleVi: '5. Quy trình Giao việc (Delegation) & Bảng Tracker phê duyệt',
    titleEn: '5. Delegation Workflow & Tracker Approval State Machine',
    keywords: [
      'delegation', 'tracker', 'giao việc', 'pic', 'approval', 'phê duyệt', 'accepted',
      'pending completed', 'approved', 'rejected', 'needs rework', 'tiến độ thực tế', 'act status', 'pro status'
    ],
    answerVi:
      '• **Luồng trạng thái Giao việc (State Machine)**:\n' +
      '  1. `Assigned` (0%): Người tạo giao việc cho PIC / Nhà thầu (`Party`).\n' +
      '  2. `Accepted / On process` (50%): PIC bấm nhận việc và bắt đầu triển khai.\n' +
      '  3. `Pending completed` (85%): PIC báo cáo hoàn thành và gửi yêu cầu nghiệm thu (`Requested Approval`).\n' +
      '  4. `Approved / Completed` (100%): Người giao việc hoặc Admin nghiệm thu đạt.\n' +
      '  5. `Rejected / Needs Rework` (25%): Yêu cầu làm lại.\n' +
      '• **Đồng bộ Ngày thực tế (Realtime Update)**:\n' +
      '  - Khi sub-task đầu tiên chuyển sang `On process`, nếu Task bật `Realtime Update`, ngày `Start` thực tế của Task tự động cập nhật.\n' +
      '  - Khi **100%** sub-task trong nhóm đạt `Approved / Completed`, Task cha tự động chốt ngày `Finish` thực tế và đẩy lịch các Task kế tiếp.',
    answerEn:
      '• **Delegation State Machine & Weighted Progress**:\n' +
      '  1. `Assigned` (0%): Task creator assigns sub-tasks to PICs/Parties.\n' +
      '  2. `Accepted / On process` (50%): PIC accepts and starts execution.\n' +
      '  3. `Pending completed` (85%): PIC requests completion approval.\n' +
      '  4. `Approved / Completed` (100%): Creator or Admin approves completion.\n' +
      '  5. `Rejected / Needs Rework` (25%): Returned for rework.\n' +
      '• **Auto-Sync with Gantt Schedule**:\n' +
      '  - When `Realtime Update` is enabled on the parent task, reaching 100% `Completed` across all delegated sub-tasks automatically stamps the actual finish date and cascades dependent tasks.',
    relatedIds: ['task-wbs-gantt-predecessors']
  },
  {
    id: 'project-status-lifecycle',
    category: 'Overview & Scope',
    titleVi: '6. Vòng đời Dự án (Project Status) & Các mốc Ngày Tự động / Thủ công',
    titleEn: '6. Project Status Lifecycle & Auto vs. Manual Milestone Dates',
    keywords: [
      'project', 'dự án', 'status', 'trạng thái', 'upcoming', 'in progress', 'completed', 'delayed',
      'handover', 'opening', 'bàn giao', 'khai trương', 'auto', 'manual'
    ],
    answerVi:
      '• **3 Mốc ngày trọng yếu của Dự án (`Start`, `Handover`, `Opening`)**:\n' +
      '  - Chế độ **Auto**: Tự động trích xuất từ các Task trong dự án (`Start` = ngày bắt đầu sớm nhất; `Handover` = ngày kết thúc của Task có chữ *"Handover"* / *"Bàn giao"*; `Opening` = ngày kết thúc của Task có chữ *"Opening"* / *"Khai trương"*).\n' +
      '  - Chế độ **Manual**: Cho phép khoá cứng ngày cố định trên hợp đồng thuê.\n' +
      '• **Cách tính Trạng thái Dự án**:\n' +
      '  - `Completed`: Tất cả các Task của dự án đã hoàn thành 100%.\n' +
      '  - `Delayed`: Có Task bị trễ hạn so với kế hoạch/thực tế.\n' +
      '  - `In Progress`: Đang trong thời gian thi công hoặc có Task đang chạy (`On process`).\n' +
      '  - `Upcoming`: Ngày bắt đầu lớn hơn ngày hiện tại và chưa có Task nào khởi chạy.',
    answerEn:
      '• **3 Key Project Milestones (`Start`, `Handover`, `Opening`)**:\n' +
      '  - **Auto Mode**: Derived automatically from project tasks (`Start` = earliest task start; `Handover` = finish date of task matching *"Handover"*; `Opening` = finish date of task matching *"Opening"*).\n' +
      '  - **Manual Mode**: Locks custom contractual dates.\n' +
      '• **Computed Project Status**:\n' +
      '  - `Completed`: 100% of project tasks are completed.\n' +
      '  - `Delayed`: One or more tasks are behind schedule.\n' +
      '  - `In Progress`: Currently active or has tasks in progress.\n' +
      '  - `Upcoming`: Start date is in the future with no started tasks.',
    relatedIds: ['layout-floorplan-area']
  },
  {
    id: 'layout-floorplan-area',
    category: 'Layout & Floor Plan',
    titleVi: '7. Mặt bằng tương tác (Layout Tab), Tính diện tích (m²) & Mã QR',
    titleEn: '7. Interactive Floor Plan (Layout Tab), Area (m²) Calculation & QR Code',
    keywords: [
      'layout', 'mặt bằng', 'floor plan', 'diện tích', 'area', 'm2', 'sizeM2',
      'color legend', 'unit', 'linkcodes', 'qr', 'qr code', 'zoom', 'polygon'
    ],
    answerVi:
      '• **Liên kết Ô mặt bằng (`linkCodes`)**: Một dự án có thể gộp nhiều ô mặt bằng (VD: `L1-101, L1-102`). Bản đồ tự động tô màu và gộp thông tin theo mã liên kết.\n' +
      '• **Quy chuẩn tính Diện tích (`sizeM2`) trong bảng Color Legend**:\n' +
      '  - Diện tích của từng nhóm trạng thái (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) được tính bằng **tổng diện tích (`sizeM2`) của các Project duy nhất (unique projects)** thuộc nhóm đó (chống nhân đôi khi 1 project nối nhiều polygon).\n' +
      '  - Chỉ khi ô mặt bằng chưa gắn Project nào hoặc Project chưa có `sizeM2` thì mới fallback về diện tích hình học của ô (`unit.sizeM2`).\n' +
      '• **Quét QR Code từ Project Modal**: Khi quét mã QR bằng điện thoại, ứng dụng tự động chuyển sang đúng `Store`, `Year`, `Floor`, mở tab **Layout** và **Auto-Zoom** thẳng vào vị trí gian hàng.',
    answerEn:
      '• **Multi-Unit Link Codes (`linkCodes`)**: A single project can link to multiple floor plan units (e.g., `L1-101, L1-102`).\n' +
      '• **Color Legend Area (`m²`) Formula**:\n' +
      '  - Group areas (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`, `Lease Status`) are computed as the **sum of `sizeM2` of unique matched projects** in that group (preventing double-counting across multi-polygon units).\n' +
      '  - Falls back to polygon `unit.sizeM2` only for unlinked units.\n' +
      '• **Mobile QR Code Auto-Zoom**: Scanning a project QR code automatically switches to the target `Store`, `Year`, and `Floor`, opens the **Layout** tab, and zooms directly into the unit.',
    relatedIds: ['project-status-lifecycle']
  },
  {
    id: 'rbac-permissions',
    category: 'RBAC & Sync',
    titleVi: '8. Phân quyền Người dùng (RBAC) & Bảo mật dữ liệu Tài chính',
    titleEn: '8. Role-Based Access Control (RBAC) & Financial Data Masking',
    keywords: [
      'rbac', 'permission', 'phân quyền', 'admin', 'user', 'canwrite', 'read only',
      'ẩn chi phí', 'masking', 'storepermission', 'locationpermission', 'partypermission', 'tab'
    ],
    answerVi:
      '• **2 Vai trò chính**:\n' +
      '  - `Admin`: Toàn quyền cấu hình hệ thống, quản lý User, phê duyệt ngân sách, xuất/nhập dữ liệu và cấu hình Auto-Backup R2.\n' +
      '  - `Standard User`: Được cấp quyền chi tiết theo 5 lớp:\n' +
      '    1. `canWrite`: Quyền Thêm/Sửa/Xóa (nếu tắt sẽ ở chế độ Chỉ xem).\n' +
      '    2. `storePermissions`: Quyền truy cập chi nhánh `HCM` và/hoặc `HN`.\n' +
      '    3. `locationPermissions`: Giới hạn theo tầng (`B2`, `B1`, `L1`... hoặc `All`).\n' +
      '    4. `partyPermissions`: Giới hạn theo bộ phận/nhà thầu phụ trách.\n' +
      '    5. `tabPermissions`: Ẩn/hiện từng Tab (`General`, `Gantt`, `Budget`, `Cost`, `Layout`, `Calendar`, `Log`).\n' +
      '• **Bảo mật Chi phí (Cost Masking)**: Người dùng không có quyền xem tài chính sẽ thấy số tiền hiển thị dạng `***`.',
    answerEn:
      '• **Two Core Roles**:\n' +
      '  - `Admin`: Full access to system settings, user permissions, budgets, and R2 backups.\n' +
      '  - `Standard User`: Governed by 5 granular permission layers (`canWrite`, `storePermissions`, `locationPermissions`, `partyPermissions`, `tabPermissions`).\n' +
      '• **Financial Masking**: Users without financial visibility have sensitive budget/cost figures masked as `***`.',
    relatedIds: ['store-year-isolation', 'sync-offline-r2-backup']
  },
  {
    id: 'sync-offline-r2-backup',
    category: 'RBAC & Sync',
    titleVi: '9. Đồng bộ Đa thiết bị Tức thì (Delta Sync), Offline Queue & R2 Auto-Backup',
    titleEn: '9. Instant Multi-Device Delta Sync, Offline Queue & R2 Auto-Backup',
    keywords: [
      'sync', 'đồng bộ', 'delta', 'offline', 'mất mạng', 'r2', 'cloudflare', 'backup',
      'sao lưu', 'zombie', 'task ma', 'qua đêm', 'sleep', 'ipad', 'dexie', 'cache'
    ],
    answerVi:
      '• **0ms Optimistic UI & Offline Queue**: Mọi thao tác Lưu/Sửa/Xóa cập nhật ngay vào giao diện trong 0ms. Nếu rớt mạng, dữ liệu được giữ an toàn trong `syncQueue` và tự động đẩy lên Cloud khi có mạng lại.\n' +
      '• **Real-time Delta Sync & Tự làm sạch Task Ma (Zero-Zombie)**:\n' +
      '  - Các máy tính và iPad đồng bộ tức thì qua kênh `taka_deltas`.\n' +
      '  - Khi máy mở lại sau giấc ngủ qua đêm (Overnight Wake-up), hệ thống tự động kéo bù Delta và quét đối chiếu 2 chiều để dọn sạch các Task đã xóa từ máy khác mà không cần bấm xóa cache.\n' +
      '• **Cloudflare R2 Auto-Backup Cron**: Tự động nén GZIP toàn bộ dữ liệu dự án, công việc, ngân sách, chi phí và lưu trữ định kỳ lên Cloudflare R2 (cấu hình trong `Settings -> R2 Auto-Backup`).',
    answerEn:
      '• **0ms Optimistic UI & Offline Queue**: Edits apply in 0ms locally and queue safely in `syncQueue` if offline.\n' +
      '• **Real-time Delta Sync & Bi-directional Reconciliation**:\n' +
      '  - Changes broadcast across devices via `taka_deltas`.\n' +
      '  - Overnight Wake-up Heartbeat automatically pulls missed deltas and removes stale "zombie" tasks without manual cache clearing.\n' +
      '• **Cloudflare R2 Auto-Backup**: Periodically compresses (GZIP) and uploads full system snapshots to Cloudflare R2 (`Settings -> R2 Auto-Backup`).',
    relatedIds: ['store-year-isolation', 'rbac-permissions']
  },
  {
    id: 'shortcuts-tips-new-user',
    category: 'Overview & Scope',
    titleVi: '10. Phím tắt & Mẹo thao tác nhanh cho Người dùng mới',
    titleEn: '10. Keyboard Shortcuts & Quick Tips for New Users',
    keywords: [
      'shortcut', 'phím tắt', 'mẹo', 'tips', 'hướng dẫn', 'command palette', 'ctrl+k',
      'undo', 'hoàn tác', 'kéo thả', 'draggable', 'excel', 'export', 'import', 'help'
    ],
    answerVi:
      '• **`Ctrl + K` (hoặc `Cmd + K`)**: Mở bảng **Command Palette** để nhảy nhanh tới bất kỳ Dự án, Tab hoặc chức năng nào.\n' +
      '• **`Ctrl + Z` / `Cmd + Z`**: Hoàn tác (Undo) thao tác sửa/xóa Task vừa thực hiện.\n' +
      '• **Kéo thả mọi cửa sổ (Draggable Modals)**: Mọi bảng chi tiết (Project, Task, Cost, QuickNav, FAQ Bot) đều có thanh nắm ở tiêu đề trên cùng để kéo sang vị trí bất kỳ, giúp vừa xem bảng vừa đối chiếu dữ liệu bên dưới.\n' +
      '• **Double-Click vào Dự án / Task / Ô mặt bằng**: Mở ngay cửa sổ chỉnh sửa chi tiết hoặc phóng to (Zoom) vào gian hàng.',
    answerEn:
      '• **`Ctrl + K` (or `Cmd + K`)**: Opens the **Command Palette** for instant navigation and actions.\n' +
      '• **`Ctrl + Z` / `Cmd + Z`**: Undoes the most recent task edit or deletion.\n' +
      '• **Draggable Modals**: Drag any modal by its top header bar to inspect underlying tables or floor plans simultaneously.\n' +
      '• **Double-Click**: Double-click any Project, Task, or Floor Plan unit to open its detail modal or zoom in.',
    relatedIds: ['store-year-isolation', 'task-wbs-gantt-predecessors']
  }
];

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s+%]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchFaqKnowledge(
  rawQuery: string,
  lang: 'vi' | 'en' = 'vi'
): {
  bestMatches: FaqKnowledgeEntry[];
  formattedAnswer: string;
} {
  const cleanQuery = rawQuery.trim();
  const normQuery = normalizeText(cleanQuery);

  if (!normQuery) {
    const starter = FAQ_KNOWLEDGE_BASE.slice(0, 3);
    return {
      bestMatches: starter,
      formattedAnswer:
        lang === 'vi'
          ? 'Xin chào! Tôi là Trợ lý Nghiệp vụ **Takashimaya PM** (dựa trên `BUSINESS_LOGIC.md`). Bạn có thể chọn một chủ đề bên dưới hoặc đặt câu hỏi về Ngân sách, Chi phí 3 đợt, Task/Gantt, Giao việc Tracker, Mặt bằng m² hay Phân quyền.'
          : 'Hello! I am the **Takashimaya PM Business Logic Assistant** (grounded on `BUSINESS_LOGIC.md`). Pick a topic below or ask any question about Budgets, 3-Installment Costs, Task/Gantt WBS, Delegation Tracker, Floor Plan Area (m²), or RBAC.'
    };
  }

  const tokens = normQuery.split(' ').filter(t => t.length >= 2);

  const scored = FAQ_KNOWLEDGE_BASE.map(entry => {
    let score = 0;
    const normTitle = normalizeText(entry.titleVi + ' ' + entry.titleEn);
    const normBody = normalizeText(entry.answerVi + ' ' + entry.answerEn);
    const normKeywords = entry.keywords.map(k => normalizeText(k));

    if (normTitle.includes(normQuery)) score += 25;
    if (normBody.includes(normQuery)) score += 12;

    for (const kw of normKeywords) {
      if (normQuery.includes(kw)) {
        score += 18;
      } else if (tokens.some(tk => kw.includes(tk) || tk.includes(kw))) {
        score += 8;
      }
    }

    for (const tk of tokens) {
      if (normTitle.includes(tk)) score += 6;
      if (normBody.includes(tk)) score += 3;
    }

    return { entry, score };
  }).sort((a, b) => b.score - a.score);

  const topMatches = scored.filter(s => s.score > 0).slice(0, 2).map(s => s.entry);

  if (topMatches.length === 0) {
    const fallback = FAQ_KNOWLEDGE_BASE.slice(0, 2);
    return {
      bestMatches: fallback,
      formattedAnswer:
        lang === 'vi'
          ? `Tôi chưa tìm thấy từ khóa khớp chính xác hoàn toàn với **"${cleanQuery}"**, nhưng dưới đây là các quy tắc nghiệp vụ cốt lõi trong \`BUSINESS_LOGIC.md\` có thể giúp bạn:\n\n` +
            fallback.map(item => `### ${item.titleVi}\n${item.answerVi}`).join('\n\n')
          : `I could not find an exact match for **"${cleanQuery}"**, but here are the core rules from \`BUSINESS_LOGIC.md\` to guide you:\n\n` +
            fallback.map(item => `### ${item.titleEn}\n${item.answerEn}`).join('\n\n')
    };
  }

  const formattedAnswer = topMatches
    .map(item => {
      const title = lang === 'vi' ? item.titleVi : item.titleEn;
      const body = lang === 'vi' ? item.answerVi : item.answerEn;
      return `### ${title}\n${body}`;
    })
    .join('\n\n---\n\n');

  return {
    bestMatches: topMatches,
    formattedAnswer
  };
}
