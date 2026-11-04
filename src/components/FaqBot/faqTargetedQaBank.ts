import { TabId } from '../../types';

export interface TargetedQaItem {
  id: string;
  intentType: 'why' | 'how' | 'formula' | 'troubleshoot' | 'feature';
  phrasesVi: string[];
  phrasesEn: string[];
  mustHaveAny?: string[];
  keywords: string[];
  titleVi: string;
  titleEn: string;
  answerVi: string;
  answerEn: string;
  targetTab?: TabId;
  targetTabLabelVi?: string;
  targetTabLabelEn?: string;
  followUpsVi: string[];
  followUpsEn: string[];
}

export const FAQ_TARGETED_QA_BANK: TargetedQaItem[] = [
  {
    id: 'qa-gantt-inline-edit-mode',
    intentType: 'why',
    phrasesVi: [
      'sửa ở tab gantt', 'nhập liệu ở tab gantt', 'tại sao không sửa được trên gantt',
      'duration start finish party predecessor ở gantt', 'sửa duration trên gantt', 'edit mode gantt'
    ],
    phrasesEn: [
      'edit on gantt', 'cannot edit gantt columns', 'duration start finish party predecessor gantt',
      'why is gantt locked', 'inline edit gantt'
    ],
    mustHaveAny: ['gantt', 'duration', 'predecessor', 'start', 'finish', 'sua', 'nhap'],
    keywords: ['gantt', 'edit mode', 'duration', 'start date', 'finish date', 'party', 'predecessor', 'sửa', 'nhập liệu', 'khóa', 'locked'],
    titleVi: '✏️ Cách sửa trực tiếp Duration, Start, Finish, Party & Predecessor trên Tab Gantt',
    titleEn: '✏️ How to Inline-Edit Duration, Start, Finish, Party & Predecessor on Gantt',
    targetTab: 'gantt',
    targetTabLabelVi: 'Mở Tab Gantt Chart',
    targetTabLabelEn: 'Open Gantt Chart Tab',
    answerVi:
      '🎯 **Nguyên nhân & Quy tắc**: Các cột **`Duration`**, **`Start Date`**, **`Finish Date`**, **`Party`** và **`Predecessor`** trên bảng **Tab Gantt** chỉ cho phép sửa/nhập liệu khi bạn đang bật chế độ **`Edit Mode`** (để chống gõ nhầm khi đang cuộn xem tiến độ).\n\n' +
      '👆 **Cách bật và sửa ngay trong 2 bước**:\n' +
      '  1. Nhìn lên thanh công cụ góc trên bên phải (Header), bấm nút **`ON Task detail`** (chế độ **Edit Mode** sáng màu xanh dương) và đảm bảo tài khoản có quyền ghi (`canWrite`) ở năm hiện tại.\n' +
      '  2. Bấm trực tiếp vào các ô `Duration`, `Start`, `Finish`, `Party` hoặc `Predecessor` trên dòng Task ở Tab Gantt để nhập liệu.\n' +
      '🔄 **Đồng bộ 2 chiều tức thì (0ms)**: Mọi thay đổi trên Tab Gantt sẽ tự động tính toán lại dây chuyền tiền nhiệm (`cascade`) và đồng bộ 100% với **Tab Task Detail** cùng tiến độ dự án.',
    answerEn:
      '🎯 **Root Cause & Rule**: Inline editing for **`Duration`**, **`Start Date`**, **`Finish Date`**, **`Party`**, and **`Predecessor`** on the **Gantt** tab is enabled **only in `Edit Mode`** to prevent accidental changes while scrolling.\n\n' +
      '👆 **How to Edit in 2 Steps**:\n' +
      '  1. Click the **`ON Task detail` (Edit Mode)** toggle on the top Header (requires `canWrite` permission on the active fiscal year).\n' +
      '  2. Click directly inside the `Duration`, `Start`, `Finish`, `Party`, or `Predecessor` cell on any task row in the Gantt table.\n' +
      '🔄 **Two-Way Sync (0ms)**: Edits on Gantt automatically cascade predecessor dates and stay 100% synchronized with **Task Detail**.',
    followUpsVi: ['Cách nhập công thức Predecessor #1FS+2?', 'Tại sao task có Predecessor mà không tự trượt ngày?'],
    followUpsEn: ['How do I use Predecessor syntax #1FS+2?', 'Why is a task with a Predecessor not shifting dates?']
  },
  {
    id: 'qa-duplicate-project-4key-guard',
    intentType: 'why',
    phrasesVi: [
      '2 project bị trùng', 'trùng mã dự án', 'không cho tạo cùng year store location',
      'xóa 1 project thì project kia bị xóa', 'duplicate project', 'trùng code dự án'
    ],
    phrasesEn: [
      'duplicate project', 'same project code', 'cannot create same year store location code',
      'deleting one project deletes another'
    ],
    mustHaveAny: ['trung', 'duplicate', 'xoa', 'cung year', 'cung ma', 'code'],
    keywords: ['trùng', 'duplicate', 'project code', 'year', 'store', 'location', 'xóa', '4 khóa', 'cô lập'],
    titleVi: '🛡️ Quy tắc Chống trùng Dự án (4 Khóa) & Cô lập khi Xóa',
    titleEn: '🛡️ Duplicate Project Prevention (4-Key Guard) & Delete Isolation',
    targetTab: 'general',
    targetTabLabelVi: 'Mở Tab General',
    targetTabLabelEn: 'Open General Tab',
    answerVi:
      '🎯 **Quy tắc Chống tạo trùng Dự án**:\n' +
      '• Hệ thống **chặn tuyệt đối** việc tạo 2 dự án có cùng tổ hợp 4 thông tin: **`Year (Năm) + Store (Chi nhánh) + Location (Vị trí/Tầng) + Project Code (Mã dự án)`**.\n' +
      '• Ngoài ra, mã `Project Code` mới cũng không được trùng với các mã phụ đang nằm trong ô **`Project Code Link`** của dự án khác cùng Năm + Chi nhánh + Vị trí.\n\n' +
      '🔒 **Cô lập an toàn khi Xóa (`deleteProjectStateUnified`)**:\n' +
      '• Mỗi dự án có một mã định danh riêng (`projectId`). Khi bạn xóa 1 dự án, hệ thống chỉ xóa đúng `projectId` đó và các Task/Cost thuộc đúng `projectId` đó — **không bao giờ xóa nhầm** dự án khác dù có cùng tên hay mã ở năm/tầng khác.',
    answerEn:
      '🎯 **Duplicate Prevention Rule**:\n' +
      '• Taka PM strictly blocks creating two projects with the same **`Year + Store + Location + Project Code`** combination (including unit codes already claimed in another project’s **`Project Code Link`** within the same scope).\n\n' +
      '🔒 **Safe Delete Isolation**:\n' +
      '• Every project has a unique `projectId`. Deleting a project only removes that specific `projectId` and its own child records, never affecting other projects.',
    followUpsVi: ['Cách gộp nhiều ô mặt bằng vào 1 dự án qua Project Code Link?', 'Quy tắc cô lập 4 khóa hoạt động thế nào?'],
    followUpsEn: ['How do I link multiple floor units via Project Code Link?', 'How does 4-Key Isolation work?']
  },
  {
    id: 'qa-tooltip-open-project-comments-first',
    intentType: 'feature',
    phrasesVi: [
      'mở project ở tooltip hiện comment', 'nhấn nút mở project ở tooltips',
      'xem comment dự án từ mặt bằng', 'tooltip layout mở comment trước'
    ],
    phrasesEn: [
      'open project from tooltip shows comments', 'layout tooltip project comments tab',
      'view comments first from layout tooltip'
    ],
    mustHaveAny: ['tooltip', 'comment', 'binh luan'],
    keywords: ['tooltip', 'layout', 'comment', 'bình luận', 'mở project', 'open project', 'project modal'],
    titleVi: '💬 Mở Dự án từ Tooltip Mặt bằng (Layout) ưu tiên hiện Tab Comments trước',
    titleEn: '💬 Opening Project from Layout Tooltip Shows Comments Tab First',
    targetTab: 'layout',
    targetTabLabelVi: 'Mở Tab Layout 2D',
    targetTabLabelEn: 'Open 2D Layout Tab',
    answerVi:
      '🎯 **Tính năng Thông minh trên Layout 2D**:\n' +
      '• Khi bạn bấm vào một ô gian hàng (Unit) trên **Tab Layout**, hộp thoại nổi (**Tooltip**) sẽ xuất hiện.\n' +
      '• Khi nhấn nút **Mở Project (`Open Project Details` - icon mũi tên góc trên phải của Tooltip)**, cửa sổ dự án sẽ **tự động mở thẳng vào tab `Comments` (Bình luận & Ghi chú) trước tiên**!\n' +
      '💡 **Lợi ích**: Giúp Quản lý và Giám sát đọc ngay được các ghi chú hiện trường, vướng mắc hoặc trao đổi mới nhất của gian hàng đó chỉ bằng 1 cú nhấp chuột, sau đó có thể bấm sang tab `Project Details` hoặc `Tracker` bất kỳ lúc nào.',
    answerEn:
      '🎯 **Smart Layout Tooltip Workflow**:\n' +
      '• Clicking any unit on the **2D Layout** opens its interactive **Tooltip**.\n' +
      '• Clicking the **Open Project button** on the Tooltip opens the Project Modal directly to the **`Comments` tab first** so you can immediately review the latest team notes and site discussions before switching to `Project Details` or `Tracker`.',
    followUpsVi: ['Biểu tượng kẹp giấy (Attached) trên Color Legend dùng để làm gì?', 'Làm sao xem diện tích m² trên Color Legend?'],
    followUpsEn: ['What does the Paperclip (Attached) icon on Color Legend do?', 'How is area (m²) calculated in Color Legend?']
  },
  {
    id: 'qa-color-legend-attached-images',
    intentType: 'feature',
    phrasesVi: [
      'biểu tượng hình attached ở ô color legend', 'kẹp giấy trên color legend',
      'xem ảnh đính kèm trên color legend', 'attached icon color legend'
    ],
    phrasesEn: [
      'attached icon in color legend', 'paperclip on color legend',
      'view project attachments from color legend'
    ],
    mustHaveAny: ['legend', 'attached', 'kep giay', 'dinh kem'],
    keywords: ['color legend', 'attached', 'paperclip', 'kẹp giấy', 'ảnh đính kèm', 'pdf', 'lightbox', 'layout'],
    titleVi: '📎 Nút Xem Ảnh & File Đính kèm (Attached) ngay trên Bảng Color Legend',
    titleEn: '📎 Viewing Attached Images & PDFs Directly from Color Legend',
    targetTab: 'layout',
    targetTabLabelVi: 'Mở Tab Layout 2D',
    targetTabLabelEn: 'Open 2D Layout Tab',
    answerVi:
      '🎯 **Cách dùng biểu tượng Đính kèm (`📎 Attached`) trên Color Legend**:\n' +
      '• Trong **Tab Layout**, bảng **Color Legend** tự động tổng hợp toàn bộ hình ảnh hiện trường và bản vẽ PDF đính kèm của các dự án thuộc từng nhóm trạng thái (VD: `In Progress`, `Completed`...) cũng như dòng `TOTAL`.\n' +
      '• Nếu các dự án trong nhóm có file đính kèm, một nút **biểu tượng Kẹp giấy (`📎`) kèm số lượng file** sẽ hiện ngay trên dòng đó.\n' +
      '• **Bấm vào nút `📎`**: Hệ thống mở ngay trình xem ảnh/PDF phóng to (**Lightbox**) giống hệt như khi bạn bấm xem file đính kèm của từng dự án, cho phép lướt xem nhanh toàn bộ ảnh của nhóm trạng thái đó với **0 lượt đọc Firestore phụ trội**!',
    answerEn:
      '🎯 **Using the `📎 Attached` Button in Color Legend**:\n' +
      '• On the **2D Layout** tab, each status row in the **Color Legend** (plus the `TOTAL` row) aggregates all attached photos and PDFs from projects in that status group.\n' +
      '• When attachments exist, a **Paperclip (`📎`) badge with the file count** appears on the row.\n' +
      '• Clicking **`📎`** opens the full-screen **Image & PDF Lightbox** so you can browse all attachments across that status group instantly with **0 extra Firestore reads**.',
    followUpsVi: ['Khi bấm mở Project từ Tooltip trên Layout thì tab nào hiện trước?', 'Tại sao có ô hiện viền màu khi bấm Color Legend, có ô không?'],
    followUpsEn: ['Which tab opens first when clicking Open Project on the Layout Tooltip?', 'Why do some units show a colored border when clicking Color Legend?']
  },
  {
    id: 'qa-why-cannot-edit-money-or-readonly',
    intentType: 'troubleshoot',
    phrasesVi: [
      'tại sao không sửa được số tiền', 'không nhập được ngân sách', 'không sửa được dự án',
      'bị khóa chỉ xem', 'read only mode', 'hiện dấu sao ***', 'tại sao tiền hiện ***'
    ],
    phrasesEn: [
      'why cannot edit budget', 'money input locked', 'why is app read only',
      'numbers show as ***', 'cannot edit project or task'
    ],
    mustHaveAny: ['khong sua duoc', 'khoa', 'read only', '***', 'jpy', 'usd', 'khong nhap duoc'],
    keywords: ['không sửa được', 'read-only', 'khóa', 'jpy', 'usd', 'vnd', '***', 'canwrite', 'năm cũ', 'past year'],
    titleVi: '🔒 4 Lý do Bạn Không sửa được Dữ liệu hoặc Thấy số tiền hiện `***`',
    titleEn: '🔒 4 Reasons Editing is Locked or Financial Numbers Show `***`',
    targetTab: 'budget',
    targetTabLabelVi: 'Kiểm tra tại Tab Budget',
    targetTabLabelEn: 'Check on Budget Tab',
    answerVi:
      '🔍 **Hãy kiểm tra 4 nguyên nhân bảo vệ an toàn sau đây**:\n' +
      '  1. **Đang để đơn vị tiền tệ `JPY` hoặc `USD`**: Để tránh nhập nhầm tỷ giá, hệ thống khóa ô nhập tiền khi xem `JPY`/`USD`. 👉 **Cách mở**: Đổi tiền tệ trên Header về **`\'000 VND`**.\n' +
      '  2. **Đang chọn Năm tài chính cũ (`Past Year`)**: Các năm trước tự động bật **`Read-Only`** để khóa sổ kế toán. 👉 **Cách mở**: Chuyển bộ lọc `Year` về năm hiện tại hoặc năm tới.\n' +
      '  3. **Chưa bật `Edit Mode` (trên Tab Detail / Gantt)**: 👉 Bấm nút **`ON Task detail` (Edit Mode)** trên thanh Header.\n' +
      '  4. **Phân quyền Tài khoản (`RBAC`)**:\n' +
      '     • Nếu thấy số tiền hiện **`***`**: Tài khoản của bạn chưa được cấp quyền `See` mục `Budget / Cost`.\n' +
      '     • Nếu nút Lưu bị mờ: Tài khoản đang tắt quyền `canWrite` (Chỉ xem). Hãy liên hệ Admin tại **Tab Account Control**.',
    answerEn:
      '🔍 **Check these 4 built-in safety guards**:\n' +
      '  1. **Viewing `JPY` or `USD` Currency**: Money inputs lock when viewing converted currencies. 👉 **Fix**: Switch currency on the Header back to **`\'000 VND`**.\n' +
      '  2. **Viewing a Past Fiscal Year**: Past years auto-lock in **`Read-Only`** mode. 👉 **Fix**: Select the current or upcoming fiscal year.\n' +
      '  3. **`Edit Mode` is OFF (Detail / Gantt)**: 👉 Click **`ON Task detail` (Edit Mode)** on the Header.\n' +
      '  4. **Account Permissions (`RBAC`)**: Numbers masked as **`***`** mean financial visibility is disabled for your role; disabled save buttons mean `canWrite` is off.',
    followUpsVi: ['Cách phân quyền cho nhân viên trong Tab Account Control?', 'Công thức tính Remaining trong Budget là gì?'],
    followUpsEn: ['How do I configure user permissions in Account Control?', 'What is the Remaining Budget formula?']
  },
  {
    id: 'qa-predecessor-not-cascading',
    intentType: 'troubleshoot',
    phrasesVi: [
      'tại sao task không tự nhảy ngày', 'predecessor không chạy', 'tiền nhiệm không tự trượt lịch',
      'cách dùng nút play và ghim pin', 'khóa 2 đầu predecessor'
    ],
    phrasesEn: [
      'why predecessor not updating dates', 'task dates not cascading', 'flexible vs pinned task',
      'double predecessor lock'
    ],
    mustHaveAny: ['predecessor', 'tien nhiem', 'nhay ngay', 'truot lich', 'ghim', 'flexible'],
    keywords: ['predecessor', 'tiền nhiệm', 'không nhảy ngày', 'cascade', 'flexible', 'pin', 'ghim', 'play', 'fs', 'ss', 'ff'],
    titleVi: '🔗 Tại sao Task có Tiền nhiệm (`Predecessor`) mà không tự động trượt ngày?',
    titleEn: '🔗 Why Is a Task with a Predecessor Not Auto-Shifting Dates?',
    targetTab: 'detail',
    targetTabLabelVi: 'Mở Tab Task Detail',
    targetTabLabelEn: 'Open Task Detail Tab',
    answerVi:
      '🔍 **3 Điểm cần kiểm tra ngay khi lịch Tiền nhiệm không tự trượt**:\n' +
      '  1. **Task đang bị Ghim cố định (`📌 Pinned`)**: Nhìn vào cột trạng thái đồng bộ của Task — nếu đang hiện **Ghim xanh lá (`📌`)**, ngày của task đó đang bị khóa cứng. 👉 **Cách xử lý**: Bấm vào biểu tượng đó để chuyển sang **Linh hoạt (`▶️ Play xanh dương`)**.\n' +
      '  2. **Sai cú pháp dấu `#`**: Cú pháp chuẩn bắt buộc có dấu `#` trước số thứ tự task (VD: `#1`, `#2FS+3`, hoặc liên kết khác dự án `A01#1FS`). Nếu gõ dấu `-` hệ thống sẽ tự hỗ trợ đổi sang `#`.\n' +
      '  3. **Task Mẹ (`Parent Task`)**: Ngày của Task mẹ được tự động tính gộp (`Rollup`) từ ngày sớm nhất đến muộn nhất của các Task con bên trong nó.\n' +
      '💡 **Mẹo khóa 2 đầu**: Nhập 2 tiền nhiệm cách nhau dấu phẩy (VD: `#1SS, #3FF`) để tự khóa cả ngày `Start` và `Finish`!',
    answerEn:
      '🔍 **Check these 3 points if Predecessor dates do not cascade**:\n' +
      '  1. **Task is Pinned (`📌`)**: If the task row shows a **Green Pin (`📌`)**, its dates are frozen. 👉 **Fix**: Click the icon to switch to **Flexible (`▶️ Blue Play`)**.\n' +
      '  2. **Use `#` Syntax**: Format links as `#1`, `#2FS+3`, or cross-project `A01#1FS`.\n' +
      '  3. **Parent Task Rollup**: Parent WBS tasks automatically derive their `Start` and `Finish` from their child sub-tasks.\n' +
      '💡 **Two-Ended Lock**: Enter `#1SS, #3FF` to lock both `Start` and `Finish` and auto-compute `Duration`.',
    followUpsVi: ['Làm sao sửa trực tiếp Predecessor trên biểu đồ Gantt?', 'Ý nghĩa 4 loại liên kết FS, SS, FF, SF là gì?'],
    followUpsEn: ['How do I edit Predecessors directly on the Gantt chart?', 'What do FS, SS, FF, and SF mean?']
  },
  {
    id: 'qa-firestore-storm-and-zombie-sync',
    intentType: 'why',
    phrasesVi: [
      'bão firestore', 'firestore read cao', 'đồng bộ realtime', 'task zombie hiện lại',
      'task ma', 'xóa task trên máy này máy kia còn không', 'qua đêm ipad'
    ],
    phrasesEn: [
      'firestore read storm', 'high firestore reads', 'zombie tasks reappearing',
      'multi device realtime sync', 'overnight sleep sync'
    ],
    mustHaveAny: ['firestore', 'zombie', 'task ma', 'dong bo', 'bão', 'read'],
    keywords: ['firestore', 'read storm', 'bão đọc', 'zombie', 'task ma', 'realtime', 'delta', 'dexie', 'qua đêm'],
    titleVi: '⚡ Cơ chế Chống Bão Đọc Firestore (Zero-Read) & Triệt tiêu "Task Ma" (Zero-Zombie)',
    titleEn: '⚡ Anti-Read-Storm Protection & Zero-Zombie Real-Time Sync',
    targetTab: 'setting',
    targetTabLabelVi: 'Mở Tab Settings',
    targetTabLabelEn: 'Open Settings Tab',
    answerVi:
      '🛡️ **Hệ thống vận hành siêu tiết kiệm Firestore Read & Đồng bộ tức thì nhờ 3 cơ chế**:\n' +
      '  1. **Local-First (0 Read khi chuyển Tab / Xem ảnh)**: Toàn bộ dữ liệu được đọc từ bộ nhớ **Zustand + Dexie.js (IndexedDB)** trong `0ms`. Khi rê chuột xem Tooltip hay mở ảnh đính kèm trên Layout/Legend, hệ thống đọc 100% từ RAM mà không gọi Firestore.\n' +
      '  2. **Triệt tiêu "Task Ma" (`Zero-Zombie Reconciliation`) với 0 Read phụ trội**:\n' +
      '     • Khi Máy A xóa 1 task, lệnh xóa phát qua kênh `taka_deltas` sang Máy B, iPad tức thì.\n' +
      '     • Đồng thời, mỗi dự án đều lưu danh sách `taskSummaries` chuẩn. Bất kỳ task cũ nào còn sót trong bộ nhớ máy khách mà không còn trong `taskSummaries` (sau 30 giây bảo vệ task mới tạo) sẽ bị **quét sạch tự động khỏi Zustand & Dexie** kèm khóa chặn hồi sinh `taskDeletedTracker`.\n' +
      '  3. **Tự hồi phục khi ngủ qua đêm (`Overnight Wake-up Guard`)**: Khi mở lại Laptop/iPad sau một đêm (`gap > 60s`), app tự động kéo bù các delta bị lỡ và làm sạch dữ liệu mà không cần xóa cache.',
    answerEn:
      '🛡️ **How Taka PM Eliminates Read Storms & Zombie Tasks**:\n' +
      '  1. **Local-First Architecture (0 Extra Reads)**: Tab switches, Layout tooltips, and Color Legend attachments read 100% from in-memory **Zustand + Dexie.js**.\n' +
      '  2. **0-Read Zero-Zombie Reconciliation**: Deleted tasks broadcast instantly via `taka_deltas`, are blacklisted in `taskDeletedTracker`, and are cross-checked against `project.taskSummaries` (with a 30s recent-edit guard) so zombie tasks can never reappear.\n' +
      '  3. **Overnight Wake-up Guard**: Waking a device after `> 60s` automatically pulls missed deltas and reconciles local state.',
    followUpsVi: ['Trần bộ nhớ 40MB trên iOS hoạt động thế nào?', 'Làm sao chống ngủ tab trên Chrome/Edge?'],
    followUpsEn: ['How does the 40MB iOS memory cap work?', 'How do I prevent Chrome/Edge sleeping tabs?']
  },
  {
    id: 'qa-project-status-and-delay-formula',
    intentType: 'formula',
    phrasesVi: [
      'tại sao dự án bị báo delay', 'cách tính trạng thái dự án', 'opening risk là gì',
      'cách tính % tiến độ plan và actual', 'auto date và manual date khác gì nhau'
    ],
    phrasesEn: [
      'why is project delayed', 'how is project status calculated', 'what is opening risk',
      'plan vs actual progress formula', 'auto vs manual project dates'
    ],
    mustHaveAny: ['delay', 'trang thai', 'status', 'progress', 'tien do', 'opening risk', 'handover'],
    keywords: ['delayed', 'on process', 'completed', 'upcoming', 'opening risk', 'plan progress', 'actual progress', 'auto', 'manual'],
    titleVi: '📐 Công thức Tính Trạng thái Dự án (`Delayed / On process`) & `% Tiến độ`',
    titleEn: '📐 How Project Status (`Delayed / On process`) & Progress `%` Are Calculated',
    targetTab: 'general',
    targetTabLabelVi: 'Xem trên Tab General',
    targetTabLabelEn: 'View on General Tab',
    answerVi:
      '📐 **1. Cách tính `% Tiến độ Kế hoạch (Plan)` vs `Thực tế (Actual)`**:\n' +
      '  • **`Plan Progress (%)`**: Tỷ lệ thời gian đã trôi qua từ ngày `Start` đến ngày kết thúc dự kiến so với ngày hôm nay (`Today`).\n' +
      '  • **`Actual Progress (%)`**: Tỷ lệ số lượng (hoặc trọng số thời lượng) các Task con đã đạt trạng thái `Completed` (100%) và `On process`.\n\n' +
      '🚨 **2. Khi nào Dự án báo `Delayed` (Trễ) hoặc `Opening Risk`?**:\n' +
      '  • **`Delayed` (Đỏ)**: Khi có bất kỳ Task con nào bị quá hạn (`Finish < Today` mà chưa `Completed`) HOẶC tiến độ thực tế `Actual %` tụt hậu so với `Plan %`.\n' +
      '  • **`Opening Risk` (Nguy cơ trễ Khai trương)**: Khi ngày hoàn thành dự kiến của các task thi công vượt quá mốc ngày `Handover` hoặc `Opening`.\n\n' +
      '🗓️ **3. Chế độ ngày `Auto` vs `Manual`**:\n' +
      '  • Nếu bật **`Auto`**: Ngày `Start` lấy từ task sớm nhất; `Handover` tự lấy từ task có chữ *"Handover"*; `Opening` tự lấy từ task có chữ *"Opening"*.',
    answerEn:
      '📐 **1. `Plan (%)` vs `Actual (%)` Progress**:\n' +
      '  • **`Plan %`**: Elapsed schedule ratio from project `Start` to target completion relative to `Today`.\n' +
      '  • **`Actual %`**: Completion ratio rolled up from child WBS tasks.\n\n' +
      '🚨 **2. Why `Delayed` or `Opening Risk` Triggers**:\n' +
      '  • **`Delayed`**: Triggered when one or more child tasks are overdue (`Finish < Today` and not `Completed`) or `Actual % < Plan %`.\n' +
      '  • **`Opening Risk`**: Triggered when projected task completion pushes past the `Handover` or `Opening` milestone.\n\n' +
      '🗓️ **3. `Auto` vs `Manual` Dates**: `Auto` pulls `Start`, `Handover`, and `Opening` dates directly from matching child tasks.',
    followUpsVi: ['Dự án nào đang bị trễ tiến độ hiện nay?', 'Tổng hợp tình hình các dự án hiện tại?'],
    followUpsEn: ['Which projects are currently delayed?', 'Show me a summary of current projects?']
  }
];
