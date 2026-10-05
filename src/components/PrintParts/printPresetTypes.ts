export interface PrintPreset {
  id: string;
  name: string;
  isBuiltIn?: boolean;
  target?: "pdf" | "browser" | "excel";
  orientation?: "portrait" | "landscape";
  paperSize?: "A2" | "A3" | "A4";
  scaleMode?: "fit-page" | "fill-page" | "fit-cols" | "fit-rows" | "default" | "custom";
  scaleCustom?: number;
  dpi?: number;
  watermark?: "none" | "draft" | "confidential";
  filterHeader?: boolean;
  showDate?: boolean;
  rangeType?: "entire" | "custom";
}

export const BUILT_IN_PRESETS: PrintPreset[] = [
  {
    id: "preset-weekly-report",
    name: "Weekly Report",
    isBuiltIn: true,
    target: "pdf",
    orientation: "landscape",
    paperSize: "A4",
    scaleMode: "fit-page",
    dpi: 150,
    watermark: "draft",
    filterHeader: true,
    showDate: true,
    rangeType: "entire"
  },
  {
    id: "preset-budget-overview",
    name: "Budget Overview",
    isBuiltIn: true,
    target: "pdf",
    orientation: "landscape",
    paperSize: "A3",
    scaleMode: "fit-cols",
    dpi: 200,
    watermark: "confidential",
    filterHeader: true,
    showDate: true,
    rangeType: "entire"
  },
  {
    id: "preset-full-gantt",
    name: "Full Project Gantt",
    isBuiltIn: true,
    target: "pdf",
    orientation: "landscape",
    paperSize: "A2",
    scaleMode: "fit-page",
    dpi: 300,
    watermark: "none",
    filterHeader: false,
    showDate: false,
    rangeType: "entire"
  },
  {
    id: "preset-quick-print",
    name: "Quick Summary",
    isBuiltIn: true,
    target: "browser",
    orientation: "portrait",
    paperSize: "A4",
    scaleMode: "default",
    dpi: 96,
    watermark: "none",
    filterHeader: true,
    showDate: true,
    rangeType: "entire"
  }
];

export const PRESETS_STORAGE_KEY = "taka_print_presets_v1";
