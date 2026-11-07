export type StemConnectorType = 'FS' | 'SS' | 'FF' | 'NONE';

export type StemDepartmentId =
  | 'prep_bql'
  | 'mep_pccc'
  | 'interior_hoarding'
  | 'it_pos_handover';

export type StemAnchorMode = 'forward' | 'backward';

export interface StemDepartmentMeta {
  id: StemDepartmentId;
  label: string;
  shortLabel: string;
  badgeClass: string;
  borderClass: string;
  headerBgClass: string;
  dotClass: string;
}

export interface StemLibraryBlockTemplate {
  id: string;
  name: string;
  defaultDuration: number;
  department: StemDepartmentId;
  party: string;
  delegation?: boolean;
  defaultConnector?: StemConnectorType;
  lagDays?: number;
}

export interface StemWorkbenchBlock {
  instanceId: string;
  templateId: string;
  name: string;
  duration: number;
  department: StemDepartmentId;
  party: string;
  delegation: boolean;
  connectorToPrev: StemConnectorType;
  lagDays: number;
  customStart?: string;
  computedStart?: string;
  computedFinish?: string;
  previewCode?: string;
}

export interface StemPresetBlockSeed {
  name: string;
  duration: number;
  department: StemDepartmentId;
  party: string;
  delegation?: boolean;
  connectorToPrev: StemConnectorType;
  lagDays?: number;
}

export interface StemPresetPackage {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  themeColor: 'amber' | 'rose' | 'purple' | 'emerald' | 'blue' | 'cyan';
  isBuiltIn?: boolean;
  createdAt?: string;
  createdBy?: string;
  blocks: StemPresetBlockSeed[];
}

export const STEM_DEPARTMENTS: Record<StemDepartmentId, StemDepartmentMeta> = {
  prep_bql: {
    id: 'prep_bql',
    label: 'Chuẩn bị / BQL (Management & Design)',
    shortLabel: 'Chuẩn bị/BQL',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/70',
    borderClass: 'border-l-4 border-l-blue-500',
    headerBgClass: 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
  mep_pccc: {
    id: 'mep_pccc',
    label: 'Thi công MEP / PCCC (M&E & Fire Safety)',
    shortLabel: 'MEP/PCCC',
    badgeClass:
      'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/70',
    borderClass: 'border-l-4 border-l-orange-500',
    headerBgClass: 'bg-orange-500/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300',
    dotClass: 'bg-orange-500',
  },
  interior_hoarding: {
    id: 'interior_hoarding',
    label: 'Nội thất / Hoarding (Fit-out & Millwork)',
    shortLabel: 'Nội thất/Hoarding',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800/70',
    borderClass: 'border-l-4 border-l-purple-500',
    headerBgClass: 'bg-purple-500/10 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',
    dotClass: 'bg-purple-500',
  },
  it_pos_handover: {
    id: 'it_pos_handover',
    label: 'IT/POS & Nghiệm thu (IT, POS & Handover)',
    shortLabel: 'IT/POS & Nghiệm thu',
    badgeClass:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/70',
    borderClass: 'border-l-4 border-l-emerald-500',
    headerBgClass: 'bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    dotClass: 'bg-emerald-500',
  },
};

export const STEM_CONNECTOR_META: Record<
  StemConnectorType,
  {
    type: StemConnectorType;
    shortLabel: string;
    label: string;
    description: string;
    badgeClass: string;
  }
> = {
  FS: {
    type: 'FS',
    shortLabel: '🔗 FS',
    label: '🔗 Làm nối tiếp (FS)',
    description: 'Khối trên xong mới làm khối dưới (Finish-to-Start)',
    badgeClass:
      'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  SS: {
    type: 'SS',
    shortLabel: '⚡ SS',
    label: '⚡ Làm song song (SS)',
    description: 'Bắt đầu cùng lúc với khối trên (Start-to-Start)',
    badgeClass:
      'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  FF: {
    type: 'FF',
    shortLabel: '🏁 FF',
    label: '🏁 Xong cùng lúc (FF)',
    description: 'Kết thúc cùng ngày với khối trên (Finish-to-Finish)',
    badgeClass:
      'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  },
  NONE: {
    type: 'NONE',
    shortLabel: '🔓 Tự do',
    label: '🔓 Tự do (Unlinked)',
    description: 'Ngắt kết nối để tự chọn ngày riêng',
    badgeClass:
      'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 dark:bg-[#28282a] dark:text-[#a3a3a3] dark:border-[#3c3c3e]',
  },
};

export const STEM_PARTY_OPTIONS: string[] = [
  'MD',
  'PMO',
  'Tenant',
  'Thạch Cao SG',
  'MEP Contractor',
  'PCCC Vendor',
  'FFD Vendor',
  'IT Store',
  'Operations',
];

export const DEFAULT_LEGO_PARTS_BIN: StemLibraryBlockTemplate[] = [
  // 1. Chuẩn bị / BQL (Blue)
  { id: 'part-design-guideline', name: 'Request & issue Design Guideline', defaultDuration: 2, department: 'prep_bql', party: 'MD', defaultConnector: 'FS' },
  { id: 'part-kickoff-meeting', name: 'Tenant Kick-off & Site Survey', defaultDuration: 3, department: 'prep_bql', party: 'PMO', defaultConnector: 'FS' },
  { id: 'part-1st-drawing', name: '1st Layout & 3D Drawing Submission', defaultDuration: 10, department: 'prep_bql', party: 'Tenant', defaultConnector: 'FS' },
  { id: 'part-pmo-drawing-check', name: 'PMO Technical Drawing Check & Approval', defaultDuration: 5, department: 'prep_bql', party: 'PMO', defaultConnector: 'FS' },
  { id: 'part-work-permit', name: 'Fit-out Deposit & Work Permit Registration', defaultDuration: 3, department: 'prep_bql', party: 'PMO', defaultConnector: 'SS' },

  // 2. Thi công MEP / PCCC (Orange)
  { id: 'part-mep-drawing', name: 'MEP & Kitchen Exhaust Shop Drawing', defaultDuration: 7, department: 'mep_pccc', party: 'MEP Contractor', defaultConnector: 'SS' },
  { id: 'part-pccc-submission', name: 'PCCC Fire Safety Dossier & Modification', defaultDuration: 10, department: 'mep_pccc', party: 'PCCC Vendor', delegation: true, defaultConnector: 'FS' },
  { id: 'part-waterproofing', name: 'Floor Waterproofing & Ponding Test (48h)', defaultDuration: 4, department: 'mep_pccc', party: 'MEP Contractor', defaultConnector: 'FS' },
  { id: 'part-overhead-mep', name: 'Overhead HVAC, Exhaust Duct & Sprinkler Piping', defaultDuration: 8, department: 'mep_pccc', party: 'MEP Contractor', delegation: true, defaultConnector: 'FS' },
  { id: 'part-gas-grease-trap', name: 'LPG Gas Detector & Grease Trap Plumbing', defaultDuration: 5, department: 'mep_pccc', party: 'MEP Contractor', defaultConnector: 'SS' },
  { id: 'part-mep-capoff', name: 'MEP / Sprinkler Cap-off & Utility Isolation', defaultDuration: 4, department: 'mep_pccc', party: 'MEP Contractor', defaultConnector: 'FS' },

  // 3. Nội thất / Hoarding (Purple)
  { id: 'part-hoarding-up', name: 'Site Handover & Hoarding Up (Dựng rào)', defaultDuration: 2, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, defaultConnector: 'FS' },
  { id: 'part-demolition', name: 'Existing Fixture Demolition & Debris Hauling', defaultDuration: 4, department: 'interior_hoarding', party: 'Thạch Cao SG', defaultConnector: 'FS' },
  { id: 'part-gypsum-ceiling', name: 'Wall Partition, Gypsum Ceiling & Flooring', defaultDuration: 10, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, defaultConnector: 'FS' },
  { id: 'part-millwork-joinery', name: 'Custom Millwork, Cabinetry & Counter Fit-out', defaultDuration: 12, department: 'interior_hoarding', party: 'FFD Vendor', delegation: true, defaultConnector: 'FS' },
  { id: 'part-kitchen-equip', name: 'Kitchen Equipment & Cold Storage Installation', defaultDuration: 6, department: 'interior_hoarding', party: 'Tenant', defaultConnector: 'SS' },
  { id: 'part-signage-lighting', name: 'Storefront Signage, Facade & Accent Lighting', defaultDuration: 4, department: 'interior_hoarding', party: 'FFD Vendor', defaultConnector: 'FS' },
  { id: 'part-vm-merchandising', name: 'Loose Furniture & Visual Merchandising Setup', defaultDuration: 3, department: 'interior_hoarding', party: 'Tenant', defaultConnector: 'FS' },

  // 4. IT/POS & Nghiệm thu (Green)
  { id: 'part-it-pos-cabling', name: 'IT / POS Terminal Cabling & Wi-Fi Setup', defaultDuration: 3, department: 'it_pos_handover', party: 'IT Store', delegation: true, defaultConnector: 'SS' },
  { id: 'part-pccc-final-check', name: 'PCCC & MEP Final Commissioning Test', defaultDuration: 2, department: 'it_pos_handover', party: 'PCCC Vendor', defaultConnector: 'FS' },
  { id: 'part-joint-inspection', name: 'PMO & Operations Final Joint Inspection', defaultDuration: 2, department: 'it_pos_handover', party: 'PMO', defaultConnector: 'FS' },
  { id: 'part-hoarding-down', name: 'Hoarding Down, Deep Cleaning & Grand Opening', defaultDuration: 2, department: 'it_pos_handover', party: 'Thạch Cao SG', delegation: true, defaultConnector: 'FS' },
];

export const DEFAULT_STEM_PRESETS: StemPresetPackage[] = [
  {
    id: 'preset-fnb-12',
    title: 'Gói Fit-out F&B',
    emoji: '🍔',
    subtitle: '12 khối chuẩn nhà hàng / cafe (Cấp thoát nước, Hút mùi, PCCC)',
    themeColor: 'amber',
    isBuiltIn: true,
    blocks: [
      { name: 'Request & issue Design Guideline', duration: 2, department: 'prep_bql', party: 'MD', connectorToPrev: 'FS' },
      { name: '1st Layout, Kitchen & MEP Drawing Submission', duration: 10, department: 'prep_bql', party: 'Tenant', connectorToPrev: 'FS' },
      { name: 'PMO Technical & MEP Drawing Approval', duration: 5, department: 'prep_bql', party: 'PMO', connectorToPrev: 'FS' },
      { name: 'PCCC Fire Safety Dossier & Permit Registration', duration: 7, department: 'mep_pccc', party: 'PCCC Vendor', delegation: true, connectorToPrev: 'SS' },
      { name: 'Site Handover & Hoarding Up (Dựng rào)', duration: 2, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
      { name: 'Floor Waterproofing & Ponding Test (48h)', duration: 4, department: 'mep_pccc', party: 'MEP Contractor', connectorToPrev: 'FS' },
      { name: 'Overhead HVAC, Kitchen Exhaust Duct & Sprinkler', duration: 8, department: 'mep_pccc', party: 'MEP Contractor', delegation: true, connectorToPrev: 'FS' },
      { name: 'LPG Gas Detector & Grease Trap Plumbing', duration: 5, department: 'mep_pccc', party: 'MEP Contractor', connectorToPrev: 'SS' },
      { name: 'Wall Partition, Gypsum Ceiling & Floor Tiling', duration: 10, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
      { name: 'Kitchen Equipment, Bar Counter & Dining Fit-out', duration: 8, department: 'interior_hoarding', party: 'FFD Vendor', connectorToPrev: 'FS' },
      { name: 'IT / POS Terminal Cabling & PCCC Final Check', duration: 3, department: 'it_pos_handover', party: 'IT Store', delegation: true, connectorToPrev: 'FS' },
      { name: 'Hoarding Down, Deep Cleaning & Grand Opening', duration: 2, department: 'it_pos_handover', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
    ],
  },
  {
    id: 'preset-fashion-8',
    title: 'Gói Thời trang',
    emoji: '👗',
    subtitle: '8 khối chuẩn Fashion / Cosmetics Boutique',
    themeColor: 'rose',
    isBuiltIn: true,
    blocks: [
      { name: 'Request & issue Design Guideline', duration: 2, department: 'prep_bql', party: 'MD', connectorToPrev: 'FS' },
      { name: '3D Concept & Shop Drawing Approval', duration: 10, department: 'prep_bql', party: 'PMO', connectorToPrev: 'FS' },
      { name: 'Site Handover & Hoarding Up (Dựng rào)', duration: 2, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
      { name: 'Overhead Ceiling, Lighting & Sprinkler Adjust', duration: 6, department: 'mep_pccc', party: 'MEP Contractor', delegation: true, connectorToPrev: 'FS' },
      { name: 'Wall Partition, Millwork & Fitting Room Fit-out', duration: 12, department: 'interior_hoarding', party: 'FFD Vendor', delegation: true, connectorToPrev: 'FS' },
      { name: 'Storefront Signage & Visual Merchandising', duration: 4, department: 'interior_hoarding', party: 'Tenant', connectorToPrev: 'FS' },
      { name: 'IT / POS Terminal Setup & Joint Inspection', duration: 2, department: 'it_pos_handover', party: 'IT Store', delegation: true, connectorToPrev: 'SS' },
      { name: 'Hoarding Down & Grand Opening Readiness', duration: 1, department: 'it_pos_handover', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
    ],
  },
  {
    id: 'preset-popup-5',
    title: 'Gói Pop-up Event',
    emoji: '🎪',
    subtitle: '5 khối thi công thần tốc cho Pop-up / Kiosk ngắn hạn',
    themeColor: 'purple',
    isBuiltIn: true,
    blocks: [
      { name: 'Pop-up Layout & 3D Artwork Approval', duration: 4, department: 'prep_bql', party: 'MD', connectorToPrev: 'FS' },
      { name: 'Work Permit & Night Access Registration', duration: 2, department: 'prep_bql', party: 'PMO', connectorToPrev: 'SS' },
      { name: 'Night Cordoning & Modular Booth Assembly', duration: 2, department: 'interior_hoarding', party: 'FFD Vendor', delegation: true, connectorToPrev: 'FS' },
      { name: 'Power Outlet, Spotlight & Mobile POS Setup', duration: 1, department: 'it_pos_handover', party: 'IT Store', delegation: true, connectorToPrev: 'SS' },
      { name: 'Safety Walkthrough & Pop-up Launch', duration: 1, department: 'it_pos_handover', party: 'PMO', connectorToPrev: 'FS' },
    ],
  },
  {
    id: 'preset-reinstatement-6',
    title: 'Gói Hoàn trả mặt bằng',
    emoji: '🔨',
    subtitle: '6 khối tháo dỡ & bàn giao Bare-shell chuẩn BQL',
    themeColor: 'emerald',
    isBuiltIn: true,
    blocks: [
      { name: 'Reinstatement Scope & Handover Checklist', duration: 2, department: 'prep_bql', party: 'PMO', connectorToPrev: 'FS' },
      { name: 'Hoarding Up & Power / Water Isolation', duration: 2, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
      { name: 'Signage, POS & Loose Equipment Removal', duration: 3, department: 'interior_hoarding', party: 'Tenant', connectorToPrev: 'FS' },
      { name: 'Interior Partition & Flooring Demolition', duration: 5, department: 'interior_hoarding', party: 'Thạch Cao SG', delegation: true, connectorToPrev: 'FS' },
      { name: 'MEP / Sprinkler Cap-off & Bare-shell Restore', duration: 4, department: 'mep_pccc', party: 'MEP Contractor', delegation: true, connectorToPrev: 'SS' },
      { name: 'Final Bare-shell Joint Inspection & Sign-off', duration: 2, department: 'it_pos_handover', party: 'PMO', connectorToPrev: 'FS' },
    ],
  },
];
