import { HATCH_PATTERNS, PRESET_SYMBOLS } from '../../../../LayoutTabParts/layoutPatternUtils';
import { normalizeRuleField } from './DynamicRuleRow';
import { DynamicUnitSummaryItem } from '../../../lib/dynamicRuleMatcher';

export interface RuleFieldDefinition {
  key: string;
  label: string;
  category: 'Metrics (Excel)' | 'Attributes (Excel / Map)' | 'App Data (Real-time Project & Task)';
  dataType: 'Number' | 'Text' | 'Status / Enum' | 'Date';
  operators: string;
  description: string;
  sampleValues: string;
}

export const DYNAMIC_RULE_FIELD_DICTIONARY: RuleFieldDefinition[] = [
  // 1. Metrics (Excel)
  { key: 'sales', label: 'Sales', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Doanh số bán hàng của Unit (từ dữ liệu Sales Excel).', sampleValues: '0, 500000, 1500000' },
  { key: 'salesByCp', label: 'Sales by CP', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Tỷ trọng / chỉ số Sales theo CP.', sampleValues: '0, 10, 25.5' },
  { key: 'salesByHcmcate', label: 'Sales by HCMcate', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Doanh số theo ngành hàng HCM Category.', sampleValues: '0, 100000' },
  { key: 'margin', label: 'Margin', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Biên lợi nhuận (Margin) của Unit.', sampleValues: '0, 15, 30' },
  { key: 'marginByCp', label: 'Margin by CP', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Biên lợi nhuận tính theo CP.', sampleValues: '0, 12.5, 25' },
  { key: 'profit', label: 'Profit', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Lợi nhuận gộp (Profit) của Unit.', sampleValues: '0, 200000, 800000' },
  { key: 'profitByCp', label: 'Profit by CP', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Lợi nhuận theo CP.', sampleValues: '0, 50000' },
  { key: 'profitByHcmcate', label: 'Profit by HCMcate', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Lợi nhuận theo ngành hàng HCM Category.', sampleValues: '0, 50000' },
  { key: 'hcmSalesEffi', label: 'HCM Sales Effi', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Hiệu suất doanh số trên mỗi m² (Sales Efficiency).', sampleValues: '0, 50, 120' },
  { key: 'hcmMargin', label: 'HCM Margin', category: 'Metrics (Excel)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Chỉ số HCM Margin.', sampleValues: '0, 20, 35' },

  // 2. Attributes (Excel / Map)
  { key: 'unit', label: 'Unit', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Mã vị trí Unit trên bản vẽ mặt bằng (hoặc danh sách nhiều mã cách nhau bởi dấu phẩy khi dùng OR).', sampleValues: 'L4-01, L1-101, B1-205, HN-TKV-BOH' },
  { key: 'year', label: 'Year', category: 'Attributes (Excel / Map)', dataType: 'Number', operators: '=, >=, <=, or', description: 'Năm tài chính của phiên bản / dữ liệu Unit.', sampleValues: '2025, 2026, 2027, 2028' },
  { key: 'size', label: 'Size (m²)', category: 'Attributes (Excel / Map)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Diện tích mặt bằng của Unit (m²).', sampleValues: '15.5, 25.2, 50, 120' },
  { key: 'floor', label: 'Floor', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Tầng / Khu vực của Unit trên mặt bằng.', sampleValues: 'B2, B1, L1, L2, L3, L4, L5' },
  { key: 'classCode', label: 'Class Code', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Mã phân loại ngành hàng (Class Code từ file Master Excel).', sampleValues: '1101, 2105, COSMETICS, FASHION' },
  { key: 'vendorCode', label: 'Vendor Code', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Mã nhà cung cấp / đối tác thuê (Vendor Code).', sampleValues: 'V001, V102' },
  { key: 'brandCode', label: 'Brand Code', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Mã thương hiệu (Brand Code).', sampleValues: 'BR01, CHANEL, DIOR' },
  { key: 'brandName', label: 'Brand Name', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Tên thương hiệu / gian hàng (Brand Name).', sampleValues: 'Tom Ford, Uniqlo, Starbucks' },
  { key: 'mdStatus', label: 'MD Status', category: 'Attributes (Excel / Map)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái đàm phán MD (kết hợp từ Excel MD Status & App).', sampleValues: 'Approached, Negotiation, Verbally agreed, MOU signed, Signed agreement, Rejected' },
  { key: 'mdNotes', label: 'MD Notes', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: 'contains, =, exclude', description: 'Ghi chú MD trong dữ liệu Excel.', sampleValues: 'Relocation, New Brand, Renewal' },
  { key: 'task', label: 'Task', category: 'Attributes (Excel / Map)', dataType: 'Text', operators: 'contains, =, or, exclude', description: 'Tên công việc (Task) từ dữ liệu ánh xạ.', sampleValues: 'Layout Confirmation, Handover, Opening' },
  { key: 'projectStatus', label: 'Project Status', category: 'Attributes (Excel / Map)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái kế hoạch của dự án (Plan Status).', sampleValues: 'On process, Completed, Delayed, Upcoming' },
  { key: 'actStatus', label: 'Act: Status', category: 'Attributes (Excel / Map)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái thực tế (Actual Status) tính từ tiến độ Task.', sampleValues: 'On process, Completed, Delayed, Upcoming' },
  { key: 'startDate', label: 'Start Date', category: 'Attributes (Excel / Map)', dataType: 'Date', operators: '>=, <=, =, contains', description: 'Ngày bắt đầu dự án / công việc (YYYY-MM-DD).', sampleValues: '2026-03-01, 2027-01-15' },
  { key: 'endDate', label: 'End Date', category: 'Attributes (Excel / Map)', dataType: 'Date', operators: '>=, <=, =, contains', description: 'Ngày kết thúc / bàn giao / khai trương (YYYY-MM-DD).', sampleValues: '2026-06-30, 2027-04-30' },
  { key: 'status', label: 'Status', category: 'Attributes (Excel / Map)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái chung của Unit.', sampleValues: 'Active, Vacant, Renovation' },
  { key: 'shopType', label: 'Shop Type', category: 'Attributes (Excel / Map)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Loại hình quầy kệ / gian hàng (Shop Type).', sampleValues: 'Open Counter, Semi-A, Semi-B, Semi-C, Skeleton' },

  // 3. App Data (Real-time)
  { key: 'appTask', label: 'App: Task Summarize (Real-time)', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: 'contains, =, or, exclude', description: 'Chuỗi tổng hợp các Task thời gian thực từ dự án trên App (tên task + trạng thái).', sampleValues: 'Handover, Fit-out, Design Approved, Completed' },
  { key: 'appProjectStatus', label: 'App: Status', category: 'App Data (Real-time Project & Task)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái kế hoạch (Plan Status) thời gian thực của Dự án trên App.', sampleValues: 'On process, Completed, Delayed, Upcoming' },
  { key: 'appProjectMdStatus', label: 'App: MD Status', category: 'App Data (Real-time Project & Task)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái MD thời gian thực của Dự án trong tab General.', sampleValues: 'approached, negotiation, Verbally agreed, MOU signed, Signed agreement, Rejected' },
  { key: 'appProjectActStatus', label: 'App: Act Status', category: 'App Data (Real-time Project & Task)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Trạng thái thực tế (Actual Status) thời gian thực của Dự án trên App.', sampleValues: 'On process, Completed, Delayed, Upcoming' },
  { key: 'appProjectDetail', label: 'App: Detail (Project)', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: 'contains, =, or, exclude', description: 'Trường Detail / Hạng mục chi tiết của Dự án trong App.', sampleValues: 'New shop, Renovation, Relocation, Re-layout' },
  { key: 'appProjectDescription', label: 'App: Description (Project)', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: 'contains, =, or, exclude', description: 'Mô tả / Ghi chú (Note/Description) của Dự án trên App.', sampleValues: 'Phase 1, Priority tenant, BOH area' },
  { key: 'appProjectParty', label: 'App: Party', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Bộ phận phụ trách (PIC / Party) của Dự án.', sampleValues: 'CP, MD, OP, Con1, Leasing' },
  { key: 'appProjectBudget', label: 'App: Budget', category: 'App Data (Real-time Project & Task)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Ngân sách được duyệt (Budget) của Dự án trên App.', sampleValues: '0, 100000, 500000' },
  { key: 'appProjectActual', label: 'App: Actual', category: 'App Data (Real-time Project & Task)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Chi phí thực tế (Actual Cost) của Dự án trên App.', sampleValues: '0, 80000, 450000' },
  { key: 'appProjectSizeM2', label: 'App: Size (m²)', category: 'App Data (Real-time Project & Task)', dataType: 'Number', operators: '>, <, >=, <=, =', description: 'Diện tích (m²) của Dự án khai báo trong App.', sampleValues: '20, 45.5, 110' },
  { key: 'appProjectShopType', label: 'App: Shop Type', category: 'App Data (Real-time Project & Task)', dataType: 'Status / Enum', operators: '=, contains, or, exclude', description: 'Loại gian hàng (Shop Type) của Dự án trên App.', sampleValues: 'Open Counter, Semi-A, Semi-B, Semi-C, Skeleton' },
  { key: 'appProjectName', label: 'App: Project Name', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: 'contains, =, or, exclude', description: 'Tên dự án (Project Name) trong tab General.', sampleValues: 'Tom Ford, Chanel, Corridor replacement' },
  { key: 'appProjectCode', label: 'App: Project Code', category: 'App Data (Real-time Project & Task)', dataType: 'Text', operators: '=, contains, or, exclude', description: 'Mã dự án (Project Code / Link Codes) trên App.', sampleValues: 'L4-01, L1-114, HN-TKV-BOH' },
  { key: 'appProjectYear', label: 'App: Year', category: 'App Data (Real-time Project & Task)', dataType: 'Number', operators: '=, >=, <=, or', description: 'Năm tài chính của Dự án trên App.', sampleValues: '2025, 2026, 2027, 2028' },
];

export const DYNAMIC_OPERATOR_DICTIONARY = [
  { operator: '=', label: 'Equals (=)', desc: 'So khớp bằng chính xác (không phân biệt hoa/thường với chữ, hoặc bằng số).' },
  { operator: 'contains', label: 'Contains', desc: 'Chứa chuỗi ký tự con (ví dụ: Rule_Value = "BOH" sẽ khớp "HN-TKV-BOH").' },
  { operator: 'or', label: 'OR (Danh sách)', desc: 'Khớp bất kỳ giá trị nào trong danh sách cách nhau bởi dấu phẩy `,` hoặc `;` (ví dụ: "L4-01, L4-02, L4-05").' },
  { operator: 'exclude', label: 'Exclude (Loại trừ)', desc: 'Loại trừ các Unit có chứa hoặc bằng giá trị chỉ định.' },
  { operator: '>', label: 'Greater than (>)', desc: 'Lớn hơn (áp dụng cho số: Size, Budget, Actual, Sales, Profit, Margin, Year).' },
  { operator: '<', label: 'Less than (<)', desc: 'Nhỏ hơn (áp dụng cho số).' },
  { operator: '>=', label: 'Greater or equal (>=)', desc: 'Lớn hơn hoặc bằng (áp dụng cho số hoặc ngày YYYY-MM-DD).' },
  { operator: '<=', label: 'Less or equal (<=)', desc: 'Nhỏ hơn hoặc bằng (áp dụng cho số hoặc ngày YYYY-MM-DD).' },
];

const FIELD_LABEL_TO_KEY_MAP = new Map<string, string>();
const FIELD_KEY_TO_LABEL_MAP = new Map<string, string>();
DYNAMIC_RULE_FIELD_DICTIONARY.forEach((f) => {
  FIELD_KEY_TO_LABEL_MAP.set(f.key, f.label);
  FIELD_LABEL_TO_KEY_MAP.set(f.key.toLowerCase(), f.key);
  FIELD_LABEL_TO_KEY_MAP.set(f.label.toLowerCase(), f.key);
});

export function resolveCanonicalRuleField(rawField: string): string {
  const cleaned = String(rawField || '').trim();
  if (!cleaned) return 'floor';
  const normalized = normalizeRuleField(cleaned);
  if (FIELD_KEY_TO_LABEL_MAP.has(normalized)) return normalized;
  const byLower =
    FIELD_LABEL_TO_KEY_MAP.get(cleaned.toLowerCase()) ||
    FIELD_LABEL_TO_KEY_MAP.get(normalized.toLowerCase());
  return byLower || normalized;
}

export function getRuleFieldDisplayLabel(fieldKey: string): string {
  const canonical = resolveCanonicalRuleField(fieldKey);
  return FIELD_KEY_TO_LABEL_MAP.get(canonical) || canonical;
}

/**
 * Builds Sheet 2 (Giải thích & Từ điển Trường Dữ Liệu + Dữ liệu Unit thực tế trên tầng) as an Array-of-Arrays (AOA).
 */
export function buildSheet2FieldGuideAOA(params: {
  store: string;
  location: string;
  year: string;
  summaryList: DynamicUnitSummaryItem[];
}): any[][] {
  const { store, location, year, summaryList } = params;
  const aoa: any[][] = [];

  aoa.push([`TAKA-PM PICTURE MAPPING — HƯỚNG DẪN & TỪ ĐIỂN TRƯỜNG DỮ LIỆU IMPORT CSV / EXCEL (SHEET 2)`]);
  aoa.push([`Phân vùng hiện tại (Current Scope): Store = ${store} | Floor/Location = ${location} | Year = ${year} | Tổng số Units = ${summaryList.length}`]);
  aoa.push([]);

  // Section 1: Column Guide
  aoa.push(['I. GIẢI THÍCH CÁC CỘT TRONG SHEET 1 (DYNAMIC_RULES_IMPORT / FILE CSV)']);
  aoa.push(['Tên Cột (Column Name)', 'Bắt buộc?', 'Giá trị mặc định', 'Giải thích chi tiết & Quy tắc xử lý khi Import']);
  aoa.push(['Store', 'Tùy chọn', store, 'Chi nhánh áp dụng (HCM hoặc HN). Nếu để trống sẽ lấy theo Store đang mở.']);
  aoa.push(['Location', 'Tùy chọn', location, 'Tầng / Vị trí mặt bằng (VD: B2, B1, L1, L2, L3, L4, L5).']);
  aoa.push(['Year', 'Tùy chọn', year, 'Năm tài chính của Version (VD: 2026, 2027).']);
  aoa.push(['Version_Name', 'Tùy chọn', `PM-${location}-${store}`, 'Tên Version. Các dòng có cùng Group_Name sẽ được gom chung các điều kiện (Matching Rules) vào cùng 1 Group.']);
  aoa.push(['Group_Name', 'BẮT BUỘC', '', 'Tên nhóm phân loại hiển thị trên thẻ Dynamic Group (VD: Approached, Negotiation, OFFICE - BOH). Nhiều dòng trùng Group_Name = nhiều Rule (kết hợp AND) trong nhóm đó.']);
  aoa.push(['Color', 'Tùy chọn', '#3b82f6', 'Mã màu Hex (VD: #3b82f6, #22c55e, #ef4444) hoặc "transparent" (trong suốt / không tô nền).']);
  aoa.push(['Opacity', 'Tùy chọn', '0.6', 'Độ đậm nhạt của màu tô từ 0.0 đến 1.0 (VD: 0.6 = 60%).']);
  aoa.push(['Hatch_Pattern', 'Tùy chọn', 'none', 'Kiểu gạch sọc (none, diagonal-right, diagonal-left, cross, dots, horizontal, vertical).']);
  aoa.push(['Symbol', 'Tùy chọn', '', 'Ký hiệu đánh dấu trên Unit (VD: ★, ▲, ◆, ■, ●, ✕, ⚡, ✓, !, P, H, O hoặc 1-4 ký tự tùy ý).']);
  aoa.push(['Rule_Order', 'Tùy chọn', '1, 2, 3...', 'Thứ tự điều kiện lọc bên trong Group.']);
  aoa.push(['Rule_Field', 'BẮT BUỘC', 'floor', 'Mã trường dữ liệu chuẩn (VD: floor, appProjectMdStatus, appProjectCode) HOẶC nhập tên hiển thị (VD: "Floor", "App: MD Status"). Xem bảng mục II bên dưới.']);
  aoa.push(['Rule_Field_Label', 'Chỉ xem', '', 'Cột giải thích tên hiển thị của Rule_Field (hệ thống tự nhận diện cả Rule_Field lẫn Rule_Field_Label khi Import).']);
  aoa.push(['Rule_Operator', 'BẮT BUỘC', '=', 'Toán tử so sánh: = , > , < , >= , <= , contains , or , exclude . Xem bảng mục III bên dưới.']);
  aoa.push(['Rule_Value', 'BẮT BUỘC', '', 'Giá trị cần đối chiếu (VD: L4, Approached, HN-TKV-BOH). Với toán tử "or", ngăn cách nhiều giá trị bằng dấu phẩy ",".']);
  aoa.push([]);

  // Section 2: All Rule_Field Dictionary + Live Sample Values from current floor
  aoa.push(['II. DANH MỤC TOÀN BỘ TRƯỜNG DỮ LIỆU ĐƯỢC HỖ TRỢ (RULE_FIELD DATA DICTIONARY)']);
  aoa.push([
    'Mã Trường (Rule_Field)',
    'Tên Hiển Thị UI (Rule_Field_Label)',
    'Nhóm Dữ Liệu (Category)',
    'Kiểu Dữ Liệu',
    'Toán Tử Khuyến Nghị',
    'Giải Thích Ý Nghĩa & Nguồn Dữ Liệu',
    'Giá Trị Mẫu Chuẩn (Standard Samples)',
    `Dữ Liệu Thực Tế Đang Có Tại [${store} • ${location} • ${year}]`,
  ]);

  DYNAMIC_RULE_FIELD_DICTIONARY.forEach((f) => {
    const liveVals = new Set<string>();
    for (let i = 0; i < summaryList.length && liveVals.size < 8; i++) {
      const item = summaryList[i] as any;
      const raw =
        f.key === 'unit'
          ? item.unitName
          : f.key === 'floor'
          ? item.location || item.floor
          : item[f.key];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '' && String(raw) !== '0') {
        liveVals.add(String(raw).trim());
      }
    }
    aoa.push([
      f.key,
      f.label,
      f.category,
      f.dataType,
      f.operators,
      f.description,
      f.sampleValues,
      liveVals.size > 0 ? Array.from(liveVals).join(' | ') : '(Chưa có dữ liệu trên tầng này)',
    ]);
  });
  aoa.push([]);

  // Section 3: Operators, Hatch Patterns, Symbols
  aoa.push(['III. BẢNG THAM CHIẾU TOÁN TỬ (RULE_OPERATOR), KIỂU SỌC (HATCH_PATTERN) & KÝ HIỆU (SYMBOL)']);
  aoa.push(['Loại Tham Chiếu', 'Mã Nhập Trong CSV (Code)', 'Tên Hiển Thị (Label)', 'Mô Tả Chi Tiết']);
  DYNAMIC_OPERATOR_DICTIONARY.forEach((op) => {
    aoa.push(['Rule_Operator (Toán tử)', op.operator, op.label, op.desc]);
  });
  HATCH_PATTERNS.forEach((pat) => {
    aoa.push(['Hatch_Pattern (Kiểu tô)', pat.id, `${pat.label} (${pat.iconLabel})`, pat.desc]);
  });
  PRESET_SYMBOLS.forEach((sym) => {
    aoa.push(['Symbol (Ký hiệu)', sym.symbol, sym.label, 'Ký hiệu hiển thị trên tâm Unit & Legend']);
  });
  aoa.push([]);

  // Section 4: Live Units Snapshot on Current Floor
  aoa.push([`IV. BẢNG DỮ LIỆU THỰC TẾ CÁC UNIT TRÊN MẶT BẰNG HIỆN TẠI [${store} • ${location} • ${year}] (DÙNG ĐỂ TRA CỨU KHI VIẾT RULE)`]);
  aoa.push([
    'Unit (unit)',
    'Floor (floor)',
    'Year (year)',
    'Size m² (size)',
    'App: Project Code (appProjectCode)',
    'App: Project Name (appProjectName)',
    'App: MD Status (appProjectMdStatus)',
    'App: Status (appProjectStatus)',
    'App: Act Status (appProjectActStatus)',
    'App: Party (appProjectParty)',
    'App: Shop Type (appProjectShopType)',
    'App: Detail (appProjectDetail)',
    'App: Budget (appProjectBudget)',
    'App: Actual (appProjectActual)',
    'Excel Brand Name (brandName)',
    'Excel MD Status (mdStatus)',
    'Excel Sales (sales)',
    'Excel Profit (profit)',
    'Current Matched Group',
  ]);

  summaryList.forEach((u) => {
    aoa.push([
      u.unitName || u.unitId,
      u.location || location,
      u.year || year,
      Number((u.sizeM2 || u.size || 0).toFixed(2)),
      u.appProjectCode || '',
      u.appProjectName || '',
      u.appProjectMdStatus || '',
      u.appProjectStatus || '',
      u.appProjectActStatus || '',
      u.appProjectParty || '',
      u.appProjectShopType || '',
      u.appProjectDetail || '',
      u.appProjectBudget || 0,
      u.appProjectActual || 0,
      u.brandName || '',
      u.mdStatus || '',
      u.sales || 0,
      u.profit || 0,
      u.matchedGroupName || 'Unassigned',
    ]);
  });

  return aoa;
}
