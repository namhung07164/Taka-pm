import { TabId } from '../../types';

export interface FaqKnowledgeEntry {
  id: string;
  category:
    | 'Overview & Scope'
    | 'Budget & Cost'
    | 'Task & Gantt'
    | 'Delegation & Tracker'
    | 'Layout & Floor Plan'
    | 'RBAC & Sync';
  titleVi: string;
  titleEn: string;
  keywords: string[];
  answerVi: string;
  answerEn: string;
  targetTab?: TabId;
  targetTabLabelVi?: string;
  targetTabLabelEn?: string;
  quickPromptsVi?: string[];
  quickPromptsEn?: string[];
  relatedIds?: string[];
}

export const FAQ_CATEGORIES: Array<{
  id: 'All' | FaqKnowledgeEntry['category'];
  labelVi: string;
  labelEn: string;
}> = [
  { id: 'All', labelVi: 'Tất cả chủ đề', labelEn: 'All Topics' },
  { id: 'Overview & Scope', labelVi: 'Bắt đầu & Dự án', labelEn: 'Quick Start & Projects' },
  { id: 'Task & Gantt', labelVi: 'Task WBS & Gantt', labelEn: 'Task WBS & Gantt' },
  { id: 'Budget & Cost', labelVi: 'Ngân sách & Chi phí', labelEn: 'Budget & Cost' },
  { id: 'Delegation & Tracker', labelVi: 'Giao việc & Tracker', labelEn: 'Delegation & Tracker' },
  { id: 'Layout & Floor Plan', labelVi: 'Mặt bằng & Diện tích', labelEn: 'Layout & Area (m²)' },
  { id: 'RBAC & Sync', labelVi: 'Phân quyền & Đồng bộ', labelEn: 'RBAC & Cloud Sync' }
];

export const FAQ_KNOWLEDGE_BASE: FaqKnowledgeEntry[] = [
  {
    id: 'new-user-quickstart',
    category: 'Overview & Scope',
    titleVi: '1. 🚀 Lộ trình 5 phút cho Người Mới & Quy tắc Cô lập 4 Khóa',
    titleEn: '1. 🚀 5-Minute New User Guide & 4-Key Isolation Rule',
    keywords: [
      'người mới', 'new user', 'bắt đầu', 'hướng dẫn', 'manual', 'store', 'hcm', 'hn',
      'year', 'năm', 'cô lập', '4 khóa', 'read-only', 'khóa sổ', 'set 1st page', 'tiền tệ', 'vnd', 'jpy', 'usd'
    ],
    targetTab: 'general',
    targetTabLabelVi: 'Mở Tab General (Trang chủ)',
    targetTabLabelEn: 'Open General Tab (Home)',
    quickPromptsVi: [
      'Làm sao tạo Dự án mới và nối ô mặt bằng?',
      'Tại sao tôi không sửa được số tiền khi xem JPY/USD?'
    ],
    quickPromptsEn: [
      'How do I create a new Project and link floor units?',
      'Why is money editing locked when viewing JPY/USD?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Hệ thống xoay quanh 4 bước: **Tạo Dự án (`General`) ➔ Chia việc (`Task detail` / `Gantt`) ➔ Quản lý tiền (`Budget` / `Cost`) ➔ Xem bản đồ 2D (`Layout`)**.\n' +
      '👆 **3 Thao tác đầu tiên cần biết**:\n' +
      '  1. **Chọn Bộ lọc trên cùng**: Chọn `Year` (2026/2027), `Store` (`HCM`/`HN`), và `Location` (Tầng `B2`..`L5`). Bộ lọc này sẽ đi theo bạn qua mọi Tab.\n' +
      '  2. **Đặt trang mở mặc định**: Đang ở Tab yêu thích, bấm nút **`Set 1st page`** trên Header để lần sau mở app vào thẳng Tab đó.\n' +
      '  3. **Quy tắc Cô lập 4 khóa (`ID + Code + Năm + Chi nhánh`)**: Cùng mã `L1-105` nhưng ở năm `2026` và `2027` (hoặc `HCM` vs `HN`) là 2 dự án hoàn toàn độc lập.\n' +
      '💡 **Mẹo hay**: Khi chọn **Năm cũ**, app tự bật **Chỉ xem (`Read-Only`)**. Khi đổi tiền tệ sang **`JPY`/`USD`**, ô sửa tiền tự khóa để chống nhập nhầm (hãy chuyển về `\'000 VND` khi cần nhập tiền).',
    answerEn:
      '🎯 **Simple Idea**: Taka PM revolves around 4 steps: **Create Project (`General`) ➔ Schedule Tasks (`Detail` / `Gantt`) ➔ Track Money (`Budget` / `Cost`) ➔ View 2D Map (`Layout`)**.\n' +
      '👆 **First 3 Steps for New Users**:\n' +
      '  1. **Top Global Filters**: Select `Year` (2026/2027), `Store` (`HCM`/`HN`), and `Location` (`B2`..`L5`). These filters persist across tabs.\n' +
      '  2. **Set Default Landing Tab**: Click **`Set 1st page`** on the Header to make the current tab your startup screen.\n' +
      '  3. **4-Key Isolation (`ID + Code + Year + Store`)**: Code `L1-105` in `2026` vs `2027` (or `HCM` vs `HN`) are completely independent projects.\n' +
      '💡 **Pro Tip**: Past years auto-lock in **Read-Only Mode**. Viewing **`JPY`/`USD`** locks money inputs to prevent currency mix-ups (switch back to `\'000 VND` to edit).',
    relatedIds: ['project-status-lifecycle', 'shortcuts-tips-new-user']
  },
  {
    id: 'project-status-lifecycle',
    category: 'Overview & Scope',
    titleVi: '2. 📊 Cách tạo Dự án, Nối nhiều ô mặt bằng & Tính ngày Tự động',
    titleEn: '2. 📊 Creating Projects, Multi-Unit Linking & Auto Dates',
    keywords: [
      'project', 'dự án', 'tạo dự án', 'new project', 'status', 'trạng thái', 'upcoming',
      'in progress', 'completed', 'delayed', 'handover', 'opening', 'auto', 'manual', 'linkcodes', 'ghim', 'pin'
    ],
    targetTab: 'general',
    targetTabLabelVi: 'Mở Tab General để tạo/xem Dự án',
    targetTabLabelEn: 'Open General Tab for Projects',
    quickPromptsVi: [
      'Cách chia nhỏ công việc (Task) trong dự án?',
      'Làm sao xem vị trí dự án trên bản đồ Layout?'
    ],
    quickPromptsEn: [
      'How do I break a project into WBS Tasks?',
      'How do I see the project on the 2D Layout map?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Mỗi dòng trên Tab `General` là 1 dự án thi công gian hàng kèm trạng thái và 3 mốc ngày chính (`Start`, `Handover`, `Opening`).\n' +
      '👆 **Cách tạo Dự án chuẩn trong 3 bước**:\n' +
      '  1. Bấm nút **`+ New Project`** (hoặc phím `P`), nhập `Code` (VD: `L1-105`), `Name`, `Store`, `Location`, và diện tích `Size (m²)`. \n' +
      '  2. **Gộp nhiều ô mặt bằng (`Project Code Link`)**: Nếu gian hàng gộp nhiều ô trên bản đồ, nhập cách nhau bằng dấu phẩy (VD: `L3-303-1, L3-303-2`). Bản đồ sẽ chỉ tô màu đúng các ô này.\n' +
      '  3. **Chọn chế độ ngày `Auto` hoặc `Manual`**:\n' +
      '     • **`Auto`**: Tự lấy `Start` từ task sớm nhất, `Handover` từ task có chữ *"Handover"*, `Opening` từ task có chữ *"Opening"*.\n' +
      '     • **`Manual`**: Tự nhập ngày cố định theo hợp đồng.\n' +
      '💡 **Mẹo hay**: Bấm ghim 📌 ở đầu dòng để đưa dự án quan trọng lên đầu bảng và dùng mũi tên `▲ / ▼` để sắp xếp thứ tự.',
    answerEn:
      '🎯 **Simple Idea**: Each row in `General` represents a store construction project with automatic status and 3 key milestones (`Start`, `Handover`, `Opening`).\n' +
      '👆 **3 Steps to Create a Project**:\n' +
      '  1. Click **`+ New Project`** (or press `P`), enter `Code`, `Name`, `Store`, `Location`, and `Size (m²)`. \n' +
      '  2. **Multi-Unit Link (`Project Code Link`)**: To link multiple floor units, separate codes with commas (e.g., `L3-303-1, L3-303-2`).\n' +
      '  3. **Choose `Auto` vs `Manual` Dates**: `Auto` derives dates directly from child tasks; `Manual` locks fixed contract dates.\n' +
      '💡 **Pro Tip**: Click the 📌 pin icon to keep priority projects at the top and reorder them with `▲ / ▼`.',
    relatedIds: ['task-wbs-gantt-predecessors', 'layout-floorplan-area']
  },
  {
    id: 'task-wbs-gantt-predecessors',
    category: 'Task & Gantt',
    titleVi: '3. 📝 Chia việc WBS & Nhập Tiền nhiệm (Predecessor FS/SS/FF/SF)',
    titleEn: '3. 📝 WBS Tasks & Predecessor Links (FS/SS/FF/SF)',
    keywords: [
      'task', 'wbs', 'predecessor', 'tiền nhiệm', 'fs', 'ss', 'ff', 'sf', 'lag',
      'duration', 'rollup', 'task con', 'task mẹ', 'sub-task', 'sync predecessor', 'flexible', 'pin', 'save task'
    ],
    targetTab: 'detail',
    targetTabLabelVi: 'Mở Tab Task Detail',
    targetTabLabelEn: 'Open Task Detail Tab',
    quickPromptsVi: [
      'Làm sao kéo thả và xem biểu đồ Gantt?',
      'Cách giao việc cho nhà thầu trên bảng Tracker?'
    ],
    quickPromptsEn: [
      'How do I use the Gantt chart timeline?',
      'How do I delegate tasks to contractors?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Task detail` giúp chia nhỏ đầu việc (`#1, #2...`) và nối dây chuyền tiền nhiệm (`Predecessor`) để việc trước đổi ngày thì việc sau tự động trượt lịch theo.\n' +
      '📐 **4 Kiểu Tiền nhiệm (`Predecessor`) dễ nhớ**:\n' +
      '  • **`FS` (Mặc định - Xong mới làm)**: Việc trước Kết thúc ➔ Việc này Bắt đầu (VD: `A01#1FS+2` = Xong việc `#1` nghỉ 2 ngày rồi làm).\n' +
      '  • **`SS` (Cùng bắt đầu)**: Việc trước Bắt đầu ➔ Việc này cùng Bắt đầu (`A01#1SS`).\n' +
      '  • **`FF` (Cùng kết thúc)**: Việc trước Kết thúc ➔ Việc này cùng Kết thúc (`A01#1FF`).\n' +
      '  • **`SF`**: Việc trước Bắt đầu ➔ Việc này Kết thúc.\n' +
      '👆 **Cách khóa 2 đầu bằng 2 Tiền nhiệm**:\n' +
      '  - Nhập 2 mã cách nhau dấu phẩy (VD: `A01#1SS, A01#3FF`) ➔ Hệ thống tự lấy ngày `Start` theo việc `#1`, lấy ngày `Finish` theo việc `#3` và tự tính `Duration = Finish - Start`.\n' +
      '💡 **Mẹo hay**: Đảm bảo nút **Linh hoạt (▶️ Play xanh dương)** đang bật để lịch tự động trượt dây chuyền; nếu bật **Ghim (📌 xanh lá)** thì task sẽ đứng im cố định.',
    answerEn:
      '🎯 **Simple Idea**: `Task detail` breaks projects into numbered WBS tasks (`#1, #2...`) and links them via `Predecessor` so schedule changes cascade automatically.\n' +
      '📐 **4 Predecessor Types Made Simple**:\n' +
      '  • **`FS` (Default - Finish to Start)**: Task B starts after Task A finishes (e.g., `A01#1FS+2` adds a 2-day lag).\n' +
      '  • **`SS` (Start to Start)**: Both tasks start together (`A01#1SS`).\n' +
      '  • **`FF` (Finish to Finish)**: Both tasks finish together (`A01#1FF`).\n' +
      '  • **`SF` (Start to Finish)**: Task B finishes when Task A starts.\n' +
      '👆 **Double Predecessor (Two-Ended Lock)**:\n' +
      '  - Enter two links separated by a comma (e.g., `A01#1SS, A01#3FF`) to lock both `Start` and `Finish` and auto-calculate `Duration`.\n' +
      '💡 **Pro Tip**: Keep the **Flexible toggle (▶️ Blue Play)** active for auto-cascading, or switch to **Pinned (📌 Green Pin)** to freeze a task’s dates.',
    relatedIds: ['gantt-chart-interactive', 'delegation-tracker-workflow']
  },
  {
    id: 'gantt-chart-interactive',
    category: 'Task & Gantt',
    titleVi: '4. 📈 Biểu đồ Gantt, Đường Today, Baseline & Nhảy nhanh Focus Mode',
    titleEn: '4. 📈 Interactive Gantt Chart, Baseline, Today Line & Focus Mode',
    keywords: [
      'gantt', 'biểu đồ', 'timeline', 'baseline', 'today', 'milestone', 'hình thoi',
      'focus mode', 'back to gantt', 'expand', 'mở rộng', 'nút tím', 'modular', 'kéo thả'
    ],
    targetTab: 'gantt',
    targetTabLabelVi: 'Mở Tab Gantt Chart',
    targetTabLabelEn: 'Open Gantt Chart Tab',
    quickPromptsVi: [
      'Cách nhập Predecessor trực tiếp trên Gantt?',
      'Ý nghĩa các màu thanh tiến độ trên Gantt là gì?'
    ],
    quickPromptsEn: [
      'How do I edit Predecessors directly on the Gantt tooltip?',
      'What do the Gantt bar colors mean?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Gantt` biến bảng công việc thành biểu đồ thanh thời gian trực quan theo `Day / Week / Month / Year`.\n' +
      '🎨 **Cách đọc màu trên biểu đồ Gantt**:\n' +
      '  • 🟢 **Thanh Xanh lá**: Đã xong (`Completed`) | 🔵 **Xanh dương**: Đang làm (`On process`) | ⚫ **Xám**: Sắp tới (`Upcoming`).\n' +
      '  • 🟠 **Hình thoi Cam (`0d`)**: Cột mốc quan trọng (`Milestone` có thời lượng = 0 ngày).\n' +
      '  • **Thanh mờ nằm dưới**: Kế hoạch gốc (`Baseline`) để đối chiếu xem có bị trễ so với ban đầu không.\n' +
      '  • **Đường kẻ dọc Đỏ (`TODAY`)**: Vị trí ngày hôm nay.\n' +
      '👆 **3 Tương tác cực tiện**:\n' +
      '  1. **2 Nút mở rộng ở đầu dự án**: Nút **Xám (trên)** để mở danh sách task; Nút **Tím (dưới)** để mở các nhóm việc gộp (`Modular`).\n' +
      '  2. **Sửa nhanh trên Tooltip**: Chạm vào thanh Gantt ➔ Bấm `[+ Add]` / `[✏️ Edit]` ngay trên hộp thoại nổi để gắn `Predecessor` tức thì.\n' +
      '  3. **Click nhảy sang Detail**: Bấm vào tên Task trên Gantt sẽ nhảy thẳng sang `Task detail` và tô sáng vàng task đó (bấm `Back to Gantt` để quay lại).',
    answerEn:
      '🎯 **Simple Idea**: The `Gantt` tab visualizes your schedule across `Day / Week / Month / Year` timelines.\n' +
      '🎨 **Color Guide**:\n' +
      '  • 🟢 **Green**: `Completed` | 🔵 **Blue**: `On process` | ⚫ **Slate**: `Upcoming` | 🟠 **Orange Diamond (`0d`)**: `Milestone`.\n' +
      '  • **Lower Faded Bar**: Original `Baseline` plan for delay comparison.\n' +
      '  • **Red Vertical Line (`TODAY`)**: Current date marker.\n' +
      '👆 **3 Quick Interactions**:\n' +
      '  1. **Dual Expand Buttons**: Top **Gray button** expands project tasks; bottom **Purple button** expands grouped Modular tasks.\n' +
      '  2. **Tooltip Predecessor Editor**: Hover/tap any bar and click `[+ Add]` / `[✏️ Edit]` to link predecessors right on the chart.\n' +
      '  3. **1-Click Focus to Detail**: Click a task on Gantt to jump straight to `Task detail` with yellow highlight (click `Back to Gantt` to return).',
    relatedIds: ['task-wbs-gantt-predecessors']
  },
  {
    id: 'budget-hierarchy-formula',
    category: 'Budget & Cost',
    titleVi: '5. 💰 Ngân sách (Budget): Gộp Dự án Cha - Con & Công thức Số dư',
    titleEn: '5. 💰 Budget Management: Parent-Child Linking & Remaining Formula',
    keywords: [
      'budget', 'ngân sách', 'remaining', 'còn lại', 'cha con', 'parent', 'self', 'sub',
      'project modular', 'supporting fee', 'act', 'forc', 'xanh lá', 'vượt ngân sách', 'over budget'
    ],
    targetTab: 'budget',
    targetTabLabelVi: 'Mở Tab Budget (Ngân sách)',
    targetTabLabelEn: 'Open Budget Tab',
    quickPromptsVi: [
      'Cách tính thanh toán 3 đợt và thuế VAT ở Tab Cost?',
      'Làm sao gộp 1 dự án con vào dự án mẹ trên Budget?'
    ],
    quickPromptsEn: [
      'How do 3-installment payments and VAT work in Cost Tab?',
      'How do I link a child project to a parent project in Budget?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Budget` kiểm soát trần ngân sách của từng dự án và cho phép gom nhiều dự án nhỏ (`↳ SUB`) vào trong 1 dự án lớn (`Parent`).\n' +
      '📐 **Công thức tính Số dư Ngân sách (`Remaining`)**:\n' +
      '  `Remaining (Còn lại) = Budget (Ngân sách) - Actual/Forc (Đã chi) + Supporting Fee (Phí hỗ trợ)`\n' +
      '  • 🟢 **Màu Xanh**: An toàn (Còn dư `> 20%`).\n' +
      '  • 🟡 **Màu Vàng**: Sắp chạm trần (Còn `0% – 20%`).\n' +
      '  • 🔴 **Màu Đỏ**: Vượt ngân sách (`< 0`).\n' +
      '👆 **Cách gộp Dự án Con vào Dự án Cha (`Project Modular`)**:\n' +
      '  1. Bấm nút **`Project Modular`** (icon xếp lớp ☶) trên dòng dự án muốn chọn làm Cha.\n' +
      '  2. Bảng bên trái là **Dự án Cha**, bảng bên phải là danh sách ứng viên ➔ Bấm **`Chọn làm Con`** để gộp ngay.\n' +
      '  3. Khi mở rộng dòng Cha trên bảng: dòng **`↳ SELF` (Xanh)** là tiền riêng của Cha; các dòng **`↳ SUB` (Cam)** là tiền của các Con. *(Khi có `> 2` dòng con, nút số lượng ở cột đầu tiên sẽ chuyển sang **Màu Xanh Lá** nổi bật).*',
    answerEn:
      '🎯 **Simple Idea**: The `Budget` tab tracks approved budgets and lets you roll up multiple child projects (`↳ SUB`) under a main parent project.\n' +
      '📐 **Remaining Budget Formula**:\n' +
      '  `Remaining = Budget - Actual/Forc + Supporting Fee`\n' +
      '  • 🟢 **Green**: Healthy (`> 20%` left) | 🟡 **Amber**: Tight (`0% – 20%` left) | 🔴 **Red**: Over-budget (`< 0`).\n' +
      '👆 **How to Link Parent-Child Projects (`Project Modular`)**:\n' +
      '  1. Click **`Project Modular`** (☶ icon) on the parent project row.\n' +
      '  2. Select candidate projects on the right panel to link as **`↳ SUB`**, or click **`Unlink`** to detach.\n' +
      '  3. Expanding a parent shows **`↳ SELF`** (its own budget) plus **`↳ SUB`** children (badge turns **Emerald Green** when `> 2` children).',
    relatedIds: ['cost-installments-vat']
  },
  {
    id: 'cost-installments-vat',
    category: 'Budget & Cost',
    titleVi: '6. 💳 Chi phí (Cost): Thuế VAT, Thanh toán 3 đợt & Lọc ngày trả',
    titleEn: '6. 💳 Cost Tab: VAT, 3-Installment Payments & Paid Date Filter',
    keywords: [
      'cost', 'chi phí', 'vat', 'thuế', 'installment', 'thanh toán', '3 đợt', '1st paid',
      '2nd paid', '3rd paid', 'p1', 'p2', 'p3', 'balance', 'filter paid date', '14 ngày', 'act', 'forc'
    ],
    targetTab: 'cost',
    targetTabLabelVi: 'Mở Tab Cost (Chi phí)',
    targetTabLabelEn: 'Open Cost Tab',
    quickPromptsVi: [
      'Sự khác nhau giữa nhãn ACT và FORC là gì?',
      'Làm sao lọc các khoản thanh toán trong tháng này?'
    ],
    quickPromptsEn: [
      'What is the difference between ACT and FORC?',
      'How do I filter payments made within a date range?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Cost` quản lý chi tiết từng hợp đồng nhà thầu, tính thuế VAT (`0%`, `8%`, `10%`) và chia lịch trả tiền thành **3 đợt (`1st`, `2nd`, `3rd Paid`)**.\n' +
      '📐 **Quy tắc Tự động tính 3 Đợt & Số dư (`Balance`)**:\n' +
      '  • `Tổng sau VAT = Số tiền trước VAT × (1 + VAT%)` (tự làm tròn số nguyên chuẩn kế toán).\n' +
      '  • Khi bạn nhập **Đợt 1 (Tạm ứng)** và **Đợt 2 (Tiến độ)**, hệ thống tự tính **Đợt 3 (Quyết toán)** = `Tổng sau VAT - Đợt 1 - Đợt 2` (đảm bảo tổng đủ **100%**).\n' +
      '  • `Số dư còn phải trả (Balance) = Actual - (Đợt 1 + Đợt 2 + Đợt 3)`. Khi trả đủ, `Balance = 0`.\n' +
      '👆 **2 Công cụ kiểm soát cực hay**:\n' +
      '  1. **Nút `act` (Xanh) vs `forc` (Cam)**: Bấm để đánh dấu khoản chi đã chốt thực tế (`ACT`) hay mới là dự kiến (`FORC`).\n' +
      '  2. **Nút `Filter Paid Date` 📅**: Chọn khoảng từ ngày... đến ngày... và chọn đợt (`1st/2nd/3rd`) để lọc riêng các khoản thanh toán trong kỳ (ô khớp sẽ sáng viền xanh lá).',
    answerEn:
      '🎯 **Simple Idea**: The `Cost` tab tracks vendor contracts, VAT (`0%`, `8%`, `10%`), and splits payments across **3 installments (`1st`, `2nd`, `3rd Paid`)**.\n' +
      '📐 **3-Installment & Balance Formulas**:\n' +
      '  • `Amount Incl. VAT = Excl. VAT × (1 + VAT%)` (rounded via `Math.round()`).\n' +
      '  • Entering `1st Paid` and `2nd Paid` auto-calculates final settlement `3rd Paid` so total equals **100%**.\n' +
      '  • `Balance = Actual - (1st Paid + 2nd Paid + 3rd Paid)` (`0` when fully settled).\n' +
      '👆 **Key Controls**:\n' +
      '  1. **`act` (Blue) vs `forc` (Amber)**: Toggle between actual committed spend and forecast estimate.\n' +
      '  2. **`Filter Paid Date` 📅**: Filter cost items by payment date range and stage (`1st`, `2nd`, `3rd`) with green cell highlights.',
    relatedIds: ['budget-hierarchy-formula']
  },
  {
    id: 'delegation-tracker-workflow',
    category: 'Delegation & Tracker',
    titleVi: '7. 🤝 Giao việc (Delegation) & Quy trình 5 Bước duyệt Tracker',
    titleEn: '7. 🤝 Task Delegation & 5-Step Tracker Approval Workflow',
    keywords: [
      'delegation', 'tracker', 'giao việc', 'ủy quyền', 'pic', 'party', 'approval',
      'phê duyệt', 'assigned', 'accepted', 'pending completed', 'approved', 'rejected', 'del calendar'
    ],
    targetTab: 'taskDelegation',
    targetTabLabelVi: 'Mở Tab Delegation (Giao việc)',
    targetTabLabelEn: 'Open Delegation Tab',
    quickPromptsVi: [
      'Khi duyệt xong 100% trên Tracker thì lịch Gantt có tự cập nhật không?',
      'Nhà thầu bên ngoài (Party) xem việc được giao ở đâu?'
    ],
    quickPromptsEn: [
      'Does 100% Tracker approval auto-update the Gantt schedule?',
      'Where do external contractors (Party) view their assigned tasks?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Delegation` dùng để giao đầu việc cho nhân sự (`PIC`) hoặc nhà thầu (`Party`) và nghiệm thu qua **5 bước chuẩn**.\n' +
      '🔄 **5 Bước chạy tự động trên Bảng Tracker**:\n' +
      '  1. **`Assigned` (0%)**: Quản lý giao việc và đặt hạn chót (`Deadline`).\n' +
      '  2. **`Accepted / On process` (50%)**: Người nhận bấm **"Nhận việc"** và bắt đầu thi công.\n' +
      '  3. **`Pending completed` (85%)**: Người làm báo cáo hoàn thành, tải ảnh hiện trường và gửi yêu cầu duyệt.\n' +
      '  4. **`Approved / Completed` (100%)**: Quản lý kiểm tra và bấm **"Approve"**.\n' +
      '  5. **`Rejected / Needs Rework` (25%)**: Nếu chưa đạt, bấm **"Reject"** kèm lý do để sửa lại.\n' +
      '💡 **Đồng bộ tự động**: Khi 100% đầu việc con trong Tracker đạt `Approved / Completed` (và Task cha bật `Realtime Update`), Task cha sẽ **tự động chốt ngày hoàn thành thực tế** và đẩy lịch các việc tiếp theo!',
    answerEn:
      '🎯 **Simple Idea**: The `Delegation` tab assigns sub-tasks to PICs or contractors (`Party`) and tracks them through a **5-step approval state machine**.\n' +
      '🔄 **The 5 Approval Steps**:\n' +
      '  1. **`Assigned` (0%)** ➔ 2. **`Accepted / On process` (50%)** ➔ 3. **`Pending completed` (85%)** ➔ 4. **`Approved / Completed` (100%)** (or 5. **`Rejected` 25%** for rework).\n' +
      '💡 **Auto Schedule Sync**: Once 100% of delegated sub-tasks reach `Approved / Completed` (with `Realtime Update` enabled), the parent task automatically stamps its actual finish date.',
    relatedIds: ['task-wbs-gantt-predecessors']
  },
  {
    id: 'layout-floorplan-area',
    category: 'Layout & Floor Plan',
    titleVi: '8. 🗺️ Mặt bằng Layout 2D: Tính diện tích (m²), Viền màu Legend & QR Code',
    titleEn: '8. 🗺️ 2D Floor Layout: Area (m²) Formula, Legend Outline & QR Code',
    keywords: [
      'layout', 'mặt bằng', 'floor plan', 'diện tích', 'area', 'm2', 'sizeM2',
      'color legend', 'viền màu', 'border', 'unit', 'qr', 'qr code', 'mini gantt', 'alerts'
    ],
    targetTab: 'layout',
    targetTabLabelVi: 'Mở Tab Layout (Bản đồ 2D)',
    targetTabLabelEn: 'Open Layout Tab (2D Map)',
    quickPromptsVi: [
      'Tại sao khi bấm vào Color Legend có ô hiện viền màu, có ô không có viền?',
      'Diện tích m² của In Progress / Completed được tính như thế nào?'
    ],
    quickPromptsEn: [
      'Why do some units show a colored border when clicking Color Legend while others do not?',
      'How is the m² area for In Progress / Completed calculated?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Tab `Layout` hiển thị bản vẽ mặt bằng các tầng (`B2` ➔ `L5`), tô màu tự động theo tiến độ và thống kê diện tích (`m²`) trực tiếp trong bảng **Color Legend** nổi.\n' +
      '📐 **Quy tắc tính Diện tích (`m²`) trong Color Legend**:\n' +
      '  • Diện tích của từng nhóm (`Upcoming`, `In Progress`, `Completed`, `Shop Type`, `Party`...) được tính bằng **tổng diện tích (`sizeM2`) của các Dự án duy nhất (Unique Projects)** thuộc nhóm đó.\n' +
      '  • *Tại sao?* Giúp khi 1 dự án gộp 2–3 ô mặt bằng thì diện tích dự án chỉ cộng **1 lần chuẩn xác**, không bao giờ bị nhân đôi.\n' +
      '✨ **Quy tắc Viền Màu khi bấm vào Color Legend**:\n' +
      '  • Khi bạn nhấn vào 1 dòng trong **Color Legend** (VD: nhấn vào ô `Completed` hoặc `In Progress`):\n' +
      '    - Gian hàng/dự án nào **có diện tích (`sizeM2 > 0`)** sẽ sáng **đường viền màu chính của trạng thái đó bao xung quanh**.\n' +
      '    - Ô nào **không có diện tích (`0 m²`)** sẽ **không có viền**.\n' +
      '💡 **Mẹo tương tác**: Chạm vào gian hàng trên bản đồ để mở **`[📊 Mini Gantt]`**, **`[💬 Chat]`** (siêu nhẹ 0ms), xem **`[🖼️ Ảnh]`** (cô lập riêng `HCM` và `HN`), hoặc dùng điện thoại **Quét QR Code** để tự động zoom thẳng vào gian hàng!',
    answerEn:
      '🎯 **Simple Idea**: The `Layout` tab renders interactive 2D floor plans (`B2` ➔ `L5`) with live status coloring and area (`m²`) metrics inside the floating **Color Legend**.\n' +
      '📐 **Area (`m²`) Calculation Rule**:\n' +
      '  • Group area (`Upcoming`, `In Progress`, `Completed`, etc.) equals the **sum of `sizeM2` of unique matched projects** in that status (preventing double-counting when one project spans multiple units).\n' +
      '✨ **Status Border Highlight Rule on Color Legend Click**:\n' +
      '  • Clicking any row in **Color Legend** draws a **bold status-colored outline around matched units/projects that have area (`sizeM2 > 0`)**. Units without area (`0 m²`) show no border.\n' +
      '💡 **Pro Tip**: Tap any booth on the map to open **`[📊 Mini Gantt]`**, **`[💬 Chat]`**, **`[🖼️ Photos]`** (strictly isolated between `HCM` and `HN`), or scan a **Project QR Code** to auto-zoom right into the unit!',
    relatedIds: ['project-status-lifecycle']
  },
  {
    id: 'rbac-permissions',
    category: 'RBAC & Sync',
    titleVi: '9. 🛡️ Phân quyền (RBAC), Đặc quyền "all" & Lý do hiện số tiền ***',
    titleEn: '9. 🛡️ RBAC Permissions, "all" Master Access & Financial *** Masking',
    keywords: [
      'rbac', 'permission', 'phân quyền', 'admin', 'user', 'canwrite', 'read only',
      'ẩn chi phí', 'masking', '***', 'all', 'party', 'location', 'không sửa được'
    ],
    targetTab: 'accControl',
    targetTabLabelVi: 'Mở Tab Account Control (Phân quyền)',
    targetTabLabelEn: 'Open Account Control Tab',
    quickPromptsVi: [
      'Tại sao tôi thấy số tiền hiển thị dấu ***?',
      'Làm sao cấp quyền cho 1 nhân viên xem được tất cả các tầng?'
    ],
    quickPromptsEn: [
      'Why do budget and cost numbers show as ***?',
      'How do I grant a user access to all floors or all parties?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Hệ thống bảo mật theo đúng vai trò từng người qua 5 lớp quyền chi tiết.\n' +
      '🔐 **5 Lớp quyền của tài khoản**:\n' +
      '  1. **`canWrite`**: Bật = Được Thêm/Sửa/Xóa | Tắt = Chỉ xem (`Read-Only`).\n' +
      '  2. **`storePermissions`**: Cấp quyền xem `HCM`, `HN` (nếu chỉ có 1 chi nhánh, hệ thống tự ẩn mục `All Stores`).\n' +
      '  3. **`locationPermissions`**: Cấp quyền theo tầng (`B1`, `L1`...). Nếu gán nhãn **`"all"`** ➔ Xem được mọi tầng.\n' +
      '  4. **`partyPermissions`**: Cấp quyền theo bộ phận/nhà thầu. Nếu gán nhãn **`"all"`** ➔ Điều phối được mọi bộ phận.\n' +
      '  5. **`tabPermissions`**: Bật/tắt quyền nhìn thấy từng Tab.\n' +
      '💡 **Giải đáp thắc mắc**: Nếu bạn thấy số tiền hiện **`***`**, nghĩa là tài khoản chưa được mở quyền xem Tài chính (hãy liên hệ Admin để cấp quyền).',
    answerEn:
      '🎯 **Simple Idea**: Access is governed by 5 granular permission layers per user.\n' +
      '🔐 **The 5 Permission Layers**:\n' +
      '  1. **`canWrite`** (Edit vs Read-Only) | 2. **`storePermissions`** (`HCM`/`HN`) | 3. **`locationPermissions`** (Floors or `"all"`) | 4. **`partyPermissions`** (Departments or `"all"`) | 5. **`tabPermissions`**.\n' +
      '💡 **Why do I see `***`?**: Users without financial visibility have sensitive budget and cost numbers masked as `***`.',
    relatedIds: ['sync-offline-r2-backup', 'new-user-quickstart']
  },
  {
    id: 'sync-offline-r2-backup',
    category: 'RBAC & Sync',
    titleVi: '10. ☁️ Đồng bộ Đa thiết bị 0ms, Tự dọn Task Ma & Sao lưu Cloudflare R2',
    titleEn: '10. ☁️ 0ms Multi-Device Sync, Zero-Zombie Cleanup & R2 Auto-Backup',
    keywords: [
      'sync', 'đồng bộ', 'delta', 'offline', 'mất mạng', 'r2', 'cloudflare', 'backup',
      'sao lưu', 'zombie', 'task ma', 'qua đêm', 'sleep', 'ipad', 'xóa cache'
    ],
    targetTab: 'setting',
    targetTabLabelVi: 'Mở Tab Settings (Cấu hình & Backup)',
    targetTabLabelEn: 'Open Settings Tab',
    quickPromptsVi: [
      'Nếu đang sửa mà mất mạng Wi-Fi thì có bị mất dữ liệu không?',
      'Tại sao không cần bấm xóa cache khi dùng trên nhiều máy?'
    ],
    quickPromptsEn: [
      'Will I lose data if Wi-Fi drops while editing?',
      'How does the app stay in sync after sleeping overnight?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Bạn cứ thoải mái làm việc trên Máy tính, iPad và Điện thoại cùng lúc — hệ thống tự đồng bộ tức thì và bảo hiểm dữ liệu tự động 100%.\n' +
      '⚡ **3 Cơ chế bảo vệ tự động**:\n' +
      '  1. **Lưu tức thì `0ms` & Chống rớt mạng (`Offline Queue`)**: Bấm Lưu là nhận ngay trong 0ms. Nếu rớt mạng, dữ liệu được giữ an toàn trong hàng đợi và tự đẩy lên Cloud ngay khi có mạng lại.\n' +
      '  2. **Thức giấc qua đêm & Tự dọn "Task Ma" (`Zero-Zombie`)**: Khi mở lại máy tính/iPad sau một đêm, hệ thống tự động kéo bù dữ liệu mới và dọn sạch các công việc đã xóa từ máy khác mà **không bao giờ cần bấm xóa cache**.\n' +
      '  3. **Sao lưu tự động lên Cloudflare R2 (`R2 Auto-Backup`)**: Tiến trình Cron ngầm định kỳ nén `GZIP` toàn bộ dữ liệu dự án và lưu trữ an toàn lên **Cloudflare R2**.',
    answerEn:
      '🎯 **Simple Idea**: Work seamlessly across Desktop, iPad, and iPhone with instant 0ms saves and automated cloud backup.\n' +
      '⚡ **3 Built-in Safeguards**:\n' +
      '  1. **0ms Optimistic UI & Offline Queue**: Edits apply immediately and queue safely if Wi-Fi drops.\n' +
      '  2. **Overnight Wake-up & Zero-Zombie Sync**: Waking a device automatically pulls missed deltas and removes deleted tasks without manual cache clearing.\n' +
      '  3. **Cloudflare R2 Auto-Backup**: Periodically compresses (`GZIP`) and backs up full database snapshots to Cloudflare R2.',
    relatedIds: ['new-user-quickstart', 'rbac-permissions']
  },
  {
    id: 'shortcuts-tips-new-user',
    category: 'Overview & Scope',
    titleVi: '11. ⌨️ Bảng Phím tắt Thần tốc & Mẹo Xuất PDF / Excel',
    titleEn: '11. ⌨️ Keyboard Shortcuts & PDF / Excel Export Tips',
    keywords: [
      'shortcut', 'phím tắt', 'mẹo', 'tips', 'command palette', 'ctrl+k',
      'undo', 'hoàn tác', 'kéo thả', 'draggable', 'excel', 'csv', 'export', 'import', 'print', 'in ấn', 'pdf'
    ],
    targetTab: 'manual',
    targetTabLabelVi: 'Mở Tab Manual (Xem & Tải PDF Hướng dẫn)',
    targetTabLabelEn: 'Open Manual Tab (View & Download PDF)',
    quickPromptsVi: [
      'Làm sao in bản vẽ mặt bằng hoặc biểu đồ Gantt ra PDF khổ A3?',
      'Cách nhập bình luận hàng loạt từ file Excel/CSV?'
    ],
    quickPromptsEn: [
      'How do I print the Floor Layout or Gantt chart to A3 PDF?',
      'How does the comments column work when importing Excel/CSV?'
    ],
    answerVi:
      '🎯 **Hiểu đơn giản**: Dùng phím tắt và Menu góc `☰` giúp bạn thao tác nhanh gấp 3 lần!\n' +
      '⌨️ **Top Phím tắt hay dùng nhất**:\n' +
      '  • **`Ctrl + K` (hoặc `Cmd + K`)**: Mở bảng tìm kiếm & nhảy nhanh tới mọi Dự án / Tab.\n' +
      '  • **`/`**: Nhảy con trỏ vào ô Tìm kiếm | **`Esc`**: Xóa nhanh tìm kiếm / Đóng cửa sổ.\n' +
      '  • **`P`**: Tạo Dự án mới | **`T`**: Tạo Công việc mới | **`Ctrl + Z`**: Hoàn tác (Undo).\n' +
      '  • **`Shift + Click`**: Tích chọn hàng loạt công việc liên tiếp trong `Edit Mode`.\n' +
      '🖨️ **Mẹo Xuất File & In ấn (`Menu ☰ góc phải`)**:\n' +
      '  • Mở Menu `☰` ➔ Chọn **`Print Preview`** để in hoặc xuất PDF/PNG khổ `A2/A3/A4` sắc nét kèm **Watermark** bảo mật.\n' +
      '  • Mọi cửa sổ nổi (Project, Task, Legend, FAQ Bot) đều **kéo thả được thanh tiêu đề** để vừa xem vừa đối chiếu số liệu bên dưới.',
    answerEn:
      '🎯 **Simple Idea**: Master these shortcuts and the top-right `☰` Menu to work 3x faster!\n' +
      '⌨️ **Essential Shortcuts**:\n' +
      '  • **`Ctrl + K` / `Cmd + K`**: Command Palette | **`/`**: Focus Search | **`Esc`**: Clear search / Close modal.\n' +
      '  • **`P`**: New Project | **`T`**: New Task | **`Ctrl + Z`**: Undo | **`Shift + Click`**: Range select tasks.\n' +
      '🖨️ **Export & Print (`☰ Menu`)**:\n' +
      '  • Open `☰ Menu` ➔ **`Print Preview`** to export high-res `A2/A3/A4` PDFs/PNGs with security watermarks.\n' +
      '  • Drag any modal by its header bar to compare underlying data side by side.',
    relatedIds: ['new-user-quickstart', 'task-wbs-gantt-predecessors']
  }
];

function normalizeText(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s+%*]/g, ' ')
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
          ? 'Xin chào! Tôi là **Trợ lý Hướng dẫn Tương tác Takashimaya PM** (dữ liệu từ `USER_MANUAL.md` & `BUSINESS_LOGIC.md`).\n\nHãy bấm vào một chủ đề gợi ý bên dưới hoặc gõ câu hỏi của bạn — tôi sẽ giải thích ngắn gọn, dễ hiểu kèm nút mở trực tiếp tính năng đó!'
          : 'Hello! I am the **Takashimaya PM Interactive Onboarding Assistant** (powered by `USER_MANUAL.md` & `BUSINESS_LOGIC.md`).\n\nTap any topic below or type your question for a simple, step-by-step explanation with direct tab shortcuts!'
    };
  }

  const tokens = normQuery.split(' ').filter(t => t.length >= 2);

  const scored = FAQ_KNOWLEDGE_BASE.map(entry => {
    let score = 0;
    const normTitle = normalizeText(entry.titleVi + ' ' + entry.titleEn);
    const normBody = normalizeText(entry.answerVi + ' ' + entry.answerEn);
    const normKeywords = entry.keywords.map(k => normalizeText(k));
    const normPrompts = (entry.quickPromptsVi || [])
      .concat(entry.quickPromptsEn || [])
      .map(p => normalizeText(p));

    if (normTitle.includes(normQuery)) score += 30;
    if (normPrompts.some(p => p.includes(normQuery) || normQuery.includes(p))) score += 35;
    if (normBody.includes(normQuery)) score += 14;

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
          ? `Tôi chưa tìm thấy mục khớp chính xác với **"${cleanQuery}"**, nhưng đây là hướng dẫn nền tảng dễ hiểu nhất từ \`USER_MANUAL.md\` dành cho bạn:\n\n` +
            fallback.map(item => `### ${item.titleVi}\n${item.answerVi}`).join('\n\n---\n\n')
          : `I could not find an exact match for **"${cleanQuery}"**, but here is the essential starter guide from \`USER_MANUAL.md\`:\n\n` +
            fallback.map(item => `### ${item.titleEn}\n${item.answerEn}`).join('\n\n---\n\n')
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
