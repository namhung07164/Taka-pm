import type { jsPDF } from "jspdf";
import { AppUser, TabId } from "../types";
import { getEffectiveStoreFilter } from "./utils";
import { safeGetItemSession, safeGetItemLocal } from "./storage";

export interface PrintFilterContext {
  storeRaw: string;
  storeDisplay: string;
  yearRaw: string;
  yearDisplay: string;
  projectCodeRaw: string;
  projectCodeDisplay: string;
  tabTitle: string;
  activeTab: string;
  dateStr: string;
  summaryText: string;
}

export const getTabDisplayTitle = (tab: string): string => {
  switch (tab) {
    case "gantt":
      return "Gantt Progress Schedule";
    case "detail":
      return "Detailed Tasks";
    case "general":
      return "Project Portfolio";
    case "budget":
      return "Budget Master Report";
    case "cost":
      return "Cost & Disbursement";
    case "summary":
      return "Executive Summary";
    case "layout":
      return "Store Layout Plan";
    case "calendar":
      return "Project Calendar";
    case "taskDelegation":
      return "Task Delegation Matrix";
    case "taskDelegationCalendar":
      return "Delegation Calendar";
    case "notification":
      return "Notification Center";
    case "notificationRule":
      return "Notification Rules";
    case "accControl":
      return "Access Control Matrix";
    case "setting":
      return "System Settings";
    default:
      return tab ? tab.charAt(0).toUpperCase() + tab.slice(1) : "Report";
  }
};

export const getPrintFilterContext = (params: {
  activeTab: string;
  globalStoreFilter: string;
  globalYearFilter: string;
  currentUser?: AppUser | null;
  detailTabFilterCode?: string;
  costTabFilterCode?: string;
  layoutTabFilters?: { projectCode?: string } | null;
  ganttSearchTerm?: string;
  fallbackProjectCode?: string;
}): PrintFilterContext => {
  const {
    activeTab,
    globalStoreFilter,
    globalYearFilter,
    currentUser,
    detailTabFilterCode,
    costTabFilterCode,
    layoutTabFilters,
    ganttSearchTerm,
    fallbackProjectCode,
  } = params;

  // 1. Store
  const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
  let storeDisplay = "All Stores";
  const normStore = String(effectiveStore || "all").trim().toLowerCase();
  if (normStore === "hcm") {
    storeDisplay = "HCM";
  } else if (normStore === "hn") {
    storeDisplay = "HN";
  } else {
    storeDisplay = "All Stores";
  }

  // 2. Year
  let yearDisplay = "All Years";
  const normYear = String(globalYearFilter || "all").trim().toLowerCase();
  if (normYear && normYear !== "all" && normYear !== "all year" && normYear !== "all years") {
    yearDisplay = String(globalYearFilter);
  } else {
    // Check if gantt session year is set
    const ganttYear = safeGetItemSession("taka_gantt_filter_year");
    if (ganttYear && ganttYear !== "all") {
      yearDisplay = String(ganttYear);
    } else {
      yearDisplay = "All Years";
    }
  }

  // 3. Project Code
  let projectCodeRaw = "";
  if (activeTab === "detail" && detailTabFilterCode && detailTabFilterCode.trim()) {
    projectCodeRaw = detailTabFilterCode.trim();
  } else if (activeTab === "cost" && costTabFilterCode && costTabFilterCode.trim()) {
    projectCodeRaw = costTabFilterCode.trim();
  } else if (layoutTabFilters?.projectCode && layoutTabFilters.projectCode.trim()) {
    projectCodeRaw = layoutTabFilters.projectCode.trim();
  } else if (fallbackProjectCode && fallbackProjectCode.trim()) {
    projectCodeRaw = fallbackProjectCode.trim();
  } else {
    // Check if Gantt search term looks like project code
    const sessionGanttSearch = ganttSearchTerm || safeGetItemSession("taka_gantt_search") || "";
    if (sessionGanttSearch && sessionGanttSearch.trim()) {
      projectCodeRaw = sessionGanttSearch.trim();
    } else if (detailTabFilterCode && detailTabFilterCode.trim()) {
      projectCodeRaw = detailTabFilterCode.trim();
    } else if (costTabFilterCode && costTabFilterCode.trim()) {
      projectCodeRaw = costTabFilterCode.trim();
    }
  }

  const projectCodeDisplay = projectCodeRaw ? projectCodeRaw : "All Projects";
  const tabTitle = getTabDisplayTitle(activeTab);
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const summaryText = `Store: ${storeDisplay} | Year: ${yearDisplay} | Project: ${projectCodeDisplay}`;

  return {
    storeRaw: normStore,
    storeDisplay,
    yearRaw: normYear,
    yearDisplay,
    projectCodeRaw,
    projectCodeDisplay,
    tabTitle,
    activeTab,
    dateStr,
    summaryText,
  };
};

/**
 * Draws a high-resolution, vector dynamic filter header onto a jsPDF page.
 * Fits within the top margin (y = 1.8mm to 8.6mm) without overlapping any table content or column headers.
 */
export const drawPdfFilterHeader = (
  pdf: jsPDF,
  context: PrintFilterContext,
  pageWidth: number,
  margin: number = 10,
  isDark: boolean = false
) => {
  const boxX = margin;
  const boxY = 1.8;
  const boxW = pageWidth - margin * 2;
  const boxH = 6.8;
  const radius = 1.2;

  // Background Box
  if (isDark) {
    pdf.setFillColor(24, 24, 27); // #18181b
    pdf.setDrawColor(63, 63, 70); // #3f3f46
  } else {
    pdf.setFillColor(248, 250, 252); // #f8fafc
    pdf.setDrawColor(226, 232, 240); // #e2e8f0
  }
  pdf.setLineWidth(0.2);
  pdf.roundedRect(boxX, boxY, boxW, boxH, radius, radius, "FD");

  // Left Title: Brand + Document context
  const textBaselineY = boxY + 4.5;
  let currentLeftX = boxX + 2.5;

  // Brand Name
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  if (isDark) {
    pdf.setTextColor(244, 244, 245); // zinc-100
  } else {
    pdf.setTextColor(15, 23, 42); // slate-900
  }
  const brandText = "TAKASHIMAYA";
  pdf.text(brandText, currentLeftX, textBaselineY);
  currentLeftX += pdf.getTextWidth(brandText) + 1.5;

  // Separator dot
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(isDark ? 161 : 148, isDark ? 161 : 163, isDark ? 170 : 184); // slate-400
  pdf.text("•", currentLeftX, textBaselineY);
  currentLeftX += 2.2;

  // Document Title
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  if (isDark) {
    pdf.setTextColor(147, 197, 253); // blue-300
  } else {
    pdf.setTextColor(29, 78, 216); // blue-700
  }
  pdf.text(context.tabTitle, currentLeftX, textBaselineY);

  // Right Filter Badges (Store, Year, Project Code)
  // Badge dimensions
  const badgeH = 4.6;
  const badgeY = boxY + 1.1;
  const badgeRadius = 0.8;
  const badgeTextY = badgeY + 3.2;
  const badgeGap = 1.8;

  // Define badges (right-to-left ordering: Project Code, then Year, then Store)
  const isFilteredProject = context.projectCodeDisplay !== "All Projects";
  
  interface BadgeConfig {
    text: string;
    bg: [number, number, number];
    border: [number, number, number];
    textCol: [number, number, number];
  }

  // Project Code Badge
  const projectBadge: BadgeConfig = isFilteredProject
    ? {
        text: `Project: ${context.projectCodeDisplay}`,
        bg: isDark ? [69, 26, 3] : [254, 243, 199], // amber-100
        border: isDark ? [180, 83, 9] : [253, 230, 138],
        textCol: isDark ? [253, 230, 138] : [146, 64, 14], // amber-800
      }
    : {
        text: `Project: ${context.projectCodeDisplay}`,
        bg: isDark ? [39, 39, 42] : [241, 245, 249],
        border: isDark ? [82, 82, 91] : [226, 232, 240],
        textCol: isDark ? [212, 212, 216] : [71, 85, 105],
      };

  // Year Badge
  const isFilteredYear = context.yearDisplay !== "All Years";
  const yearBadge: BadgeConfig = isFilteredYear
    ? {
        text: `Year: ${context.yearDisplay}`,
        bg: isDark ? [49, 46, 129] : [238, 242, 255], // indigo-100
        border: isDark ? [99, 102, 241] : [199, 210, 254],
        textCol: isDark ? [224, 231, 255] : [67, 56, 202], // indigo-700
      }
    : {
        text: `Year: ${context.yearDisplay}`,
        bg: isDark ? [39, 39, 42] : [241, 245, 249],
        border: isDark ? [82, 82, 91] : [226, 232, 240],
        textCol: isDark ? [212, 212, 216] : [71, 85, 105],
      };

  // Store Badge
  let storeBadge: BadgeConfig;
  if (context.storeRaw === "hcm") {
    storeBadge = {
      text: "Store: HCM",
      bg: isDark ? [30, 58, 138] : [239, 246, 255], // blue-50
      border: isDark ? [59, 130, 246] : [191, 219, 254],
      textCol: isDark ? [219, 234, 254] : [29, 78, 216], // blue-700
    };
  } else if (context.storeRaw === "hn") {
    storeBadge = {
      text: "Store: HN",
      bg: isDark ? [127, 29, 29] : [254, 242, 242], // red-50
      border: isDark ? [239, 68, 68] : [254, 202, 202],
      textCol: isDark ? [254, 226, 226] : [185, 28, 28], // red-700
    };
  } else {
    storeBadge = {
      text: "Store: All Stores",
      bg: isDark ? [39, 39, 42] : [241, 245, 249],
      border: isDark ? [82, 82, 91] : [226, 232, 240],
      textCol: isDark ? [212, 212, 216] : [71, 85, 105],
    };
  }

  // Draw badges from right to left
  const badges: BadgeConfig[] = [projectBadge, yearBadge, storeBadge];
  let currentRightX = boxX + boxW - 2.5;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);

  for (const b of badges) {
    const textW = pdf.getTextWidth(b.text);
    const badgeW = textW + 4.2; // 2.1mm padding on each side
    const badgeX = currentRightX - badgeW;

    // Guard against collision with left title
    if (badgeX <= currentLeftX + 3) {
      break;
    }

    // Draw pill background
    pdf.setFillColor(b.bg[0], b.bg[1], b.bg[2]);
    pdf.setDrawColor(b.border[0], b.border[1], b.border[2]);
    pdf.setLineWidth(0.15);
    pdf.roundedRect(badgeX, badgeY, badgeW, badgeH, badgeRadius, badgeRadius, "FD");

    // Draw pill text
    pdf.setTextColor(b.textCol[0], b.textCol[1], b.textCol[2]);
    pdf.text(b.text, badgeX + 2.1, badgeTextY);

    currentRightX = badgeX - badgeGap;
  }
};
