import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store/useAppStore";
import {
  safeGetDeviceItemLocal,
  safeGetItemLocal,
  safeGetItemSession,
} from "../../lib/storage";
import { getStatus, matchesAdvancedSearch, parseDateTime } from "../../lib/utils";
import { getPrintFilterContext } from "../../lib/printFilterHelper";
import { exportToExcel, exportToPdf } from "../../lib/exportPdfEngine";
import { Project, Task } from "../../types";

interface UseAppPrintControllerParams {
  enrichedProjects: Project[];
  filteredTasks: Task[];
}

export function useAppPrintController({
  enrichedProjects,
  filteredTasks,
}: UseAppPrintControllerParams) {
  const currentUser = useAppStore((state) => state.currentUser)!;
  const activeTab = useAppStore((state) => state.activeTab);
  const isPrintPreview = useAppStore((state) => state.isPrintPreview);
  const setIsPrintPreview = useAppStore((state) => state.setIsPrintPreview);
  const printOrientation = useAppStore((state) => state.printOrientation);
  const printPaperSize = useAppStore((state) => state.printPaperSize);
  const printDate = useAppStore((state) => state.printDate);
  const printFilterHeader = useAppStore((state) => state.printFilterHeader);
  const printScaleMode = useAppStore((state) => state.printScaleMode);
  const printScaleCustom = useAppStore((state) => state.printScaleCustom);
  const printDpi = useAppStore((state) => state.printDpi);
  const printWatermark = useAppStore((state) => state.printWatermark);
  const printTarget = useAppStore((state) => state.printTarget);
  const isExportingPDF = useAppStore((state) => state.isExportingPDF);
  const setIsExportingPDF = useAppStore((state) => state.setIsExportingPDF);
  const printRangeType = useAppStore((state) => state.printRangeType);
  const printStartDate = useAppStore((state) => state.printStartDate);
  const printEndDate = useAppStore((state) => state.printEndDate);
  const ganttViewMode = useAppStore((state) => state.ganttViewMode);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const detailTabFilterCode = useAppStore((state) => state.detailTabFilterCode);
  const layoutTabFilters = useAppStore((state) => state.layoutTabFilters);

  useEffect(() => {
    if (isPrintPreview) {
      document.body.classList.add("print-preview-active");
      document.body.style.setProperty("--print-orientation", printOrientation);
      document.documentElement.classList.remove("dark");
    } else {
      document.body.classList.remove("print-preview-active");
      document.body.style.removeProperty("--print-orientation");
      if (useAppStore.getState().theme === "dark") {
        document.documentElement.classList.add("dark");
      }
    }
  }, [isPrintPreview, printOrientation]);

  useEffect(() => {
    if (!isPrintPreview) return;
    const fitColsTabs = new Set([
      "general",
      "detail",
      "budget",
      "cost",
      "taskDelegation",
      "accControl",
      "audit",
      "notification",
    ]);
    const targetMode = fitColsTabs.has(activeTab) ? "fit-cols" : "fit-page";
    useAppStore.getState().setPrintScaleMode(targetMode);
  }, [isPrintPreview, activeTab]);

  const paperDimensions = useMemo(() => {
    if (printPaperSize === "A2") return { w: 420, h: 594 };
    if (printPaperSize === "A3") return { w: 297, h: 420 };
    return { w: 210, h: 297 };
  }, [printPaperSize]);

  const printWidth = printOrientation === "landscape" ? paperDimensions.h : paperDimensions.w;
  const printHeight = printOrientation === "landscape" ? paperDimensions.w : paperDimensions.h;

  const printFilteredData = useMemo(() => {
    if (!isPrintPreview || activeTab !== "gantt") {
      return { sortedProjects: [] as Project[], tasksByProj: new Map<string, Task[]>(), expanded: [] as string[] };
    }

    const expandedStr = safeGetItemSession("taka_gantt_expanded_projects");
    const expanded = expandedStr ? JSON.parse(expandedStr) : [];

    const filterLocationStr = safeGetItemSession("taka_gantt_filter_location");
    const filterLocation: string[] = filterLocationStr ? JSON.parse(filterLocationStr) : [];
    const filterProjectStatus =
      safeGetItemSession("taka_gantt_filter_project_status") || "active";
    const filterYear = safeGetItemSession("taka_gantt_filter_year") || "all";
    const filterStore = safeGetItemLocal(`taka_store_filter_${currentUser?.id}`) || "all";
    const searchTerm = safeGetItemSession("taka_gantt_search") || "";

    // O(1) Pre-indexed Project Keys by Location (Rule 7)
    const allProjectKeys: string[] = [];
    const projectKeysByLocMap = new Map<string, string[]>();
    enrichedProjects.forEach((p) => {
      const k = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
      allProjectKeys.push(k);
      if (p.location) {
        let locList = projectKeysByLocMap.get(p.location);
        if (!locList) {
          locList = [];
          projectKeysByLocMap.set(p.location, locList);
        }
        locList.push(k);
      }
    });

    const tasksByProj = new Map<string, Task[]>();
    filteredTasks.forEach((t) => {
      const pKeys =
        t.party === "All"
          ? allProjectKeys
          : projectKeysByLocMap.get(t.party || "") || [];
      for (let i = 0; i < pKeys.length; i++) {
        const key = pKeys[i];
        let list = tasksByProj.get(key);
        if (!list) {
          list = [];
          tasksByProj.set(key, list);
        }
        list.push(t);
      }
    });

    const actuallyVisibleProjects = enrichedProjects.filter((p) => {
      if (filterYear !== "all" && String(p.year) !== filterYear) return false;
      if (filterStore !== "all" && p.store !== filterStore) return false;
      if (filterLocation.length > 0 && !filterLocation.includes(p.location)) return false;

      if (filterProjectStatus && filterProjectStatus !== "all") {
        const pStart = p.computedTakStart || p.start || "9999-12-31";
        const pEnd = p.computedTakCompl || p.handover;
        const pStatus = getStatus(pStart, pEnd, p.computedOpening || p.opening, p.code);

        if (filterProjectStatus === "active") {
          if (pStatus !== "On process" && pStatus !== "Upcoming") return false;
        } else if (pStatus !== filterProjectStatus) {
          return false;
        }
      }

      const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
      const projectTasks = tasksByProj.get(pKey) || [];

      if (searchTerm) {
        return matchesAdvancedSearch(
          searchTerm,
          [p.code, p.name, p.store, p.location],
          [],
          (_term, andTerms) => {
            return projectTasks.some((t) => {
              return andTerms.every((tTerm) => {
                const inProject = [p.code, p.name, p.store, p.location].some((v) =>
                  String(v || "").toLowerCase().includes(tTerm)
                );
                if (inProject) return true;
                return [t.name, t.party].some((v) =>
                  String(v || "").toLowerCase().includes(tTerm)
                );
              });
            });
          }
        );
      }
      return true;
    });

    const statusPriority: Record<string, number> = {
      "On process": 1,
      Upcoming: 2,
      Completed: 3,
      Handover: 4,
      Canceled: 5,
    };

    const sortedProjects = [...actuallyVisibleProjects].sort((a, b) => {
      const pinA = a.isPinned ? 1 : 0;
      const pinB = b.isPinned ? 1 : 0;
      if (pinA !== pinB) return pinB - pinA;

      const aStart = a.computedTakStart || a.start || "9999-12-31";
      const aEnd = a.computedTakCompl || a.handover;
      const aStatus = getStatus(aStart, aEnd, a.computedOpening || a.opening, a.code);

      const bStart = b.computedTakStart || b.start || "9999-12-31";
      const bEnd = b.computedTakCompl || b.handover;
      const bStatus = getStatus(bStart, bEnd, b.computedOpening || b.opening, b.code);

      const pA = statusPriority[aStatus] || 99;
      const pB = statusPriority[bStatus] || 99;

      if (pA !== pB) return pA - pB;

      if (aStatus === "On process") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const finishA = parseDateTime(aEnd || a.computedOpening || a.opening);
        const finishB = parseDateTime(bEnd || b.computedOpening || b.opening);

        if (finishA && finishB) {
          const diffA = Math.abs(finishA.getTime() - today.getTime());
          const diffB = Math.abs(finishB.getTime() - today.getTime());
          if (diffA !== diffB) {
            return diffA - diffB;
          }
        }
      }
      return aStart.localeCompare(bStart);
    });

    return { sortedProjects, tasksByProj, expanded };
  }, [isPrintPreview, activeTab, enrichedProjects, filteredTasks, currentUser?.id]);

  const printFilterContext = useMemo(() => {
    let fallbackCode = "";
    if (activeTab === "gantt" && printFilteredData.sortedProjects.length === 1) {
      fallbackCode = printFilteredData.sortedProjects[0].code;
    }
    return getPrintFilterContext({
      activeTab,
      globalStoreFilter,
      globalYearFilter,
      currentUser,
      detailTabFilterCode,
      layoutTabFilters,
      fallbackProjectCode: fallbackCode,
    });
  }, [
    activeTab,
    globalStoreFilter,
    globalYearFilter,
    currentUser,
    detailTabFilterCode,
    layoutTabFilters,
    printFilteredData,
  ]);

  const printDates = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    const { sortedProjects, tasksByProj } = printFilteredData;

    if (printRangeType === "custom") {
      if (printStartDate) {
        minDate = parseDateTime(printStartDate) || new Date();
        hasDates = true;
      }
      if (printEndDate) {
        maxDate = parseDateTime(printEndDate) || new Date();
        hasDates = true;
      }
    } else {
      const updateMinMax = (dateStr: string | undefined | null) => {
        if (!dateStr) return;
        const d = parseDateTime(dateStr);
        if (d && !isNaN(d.getTime())) {
          if (!hasDates) {
            minDate = d;
            maxDate = d;
            hasDates = true;
          } else {
            if (d < minDate) minDate = d;
            if (d > maxDate) maxDate = d;
          }
        }
      };

      sortedProjects.forEach((p) => {
        updateMinMax(p.computedTakStart || p.start);
        updateMinMax(p.computedTakCompl || p.handover);
        updateMinMax(p.computedOpening || p.opening);

        const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
        const projectTasks = tasksByProj.get(pKey) || [];
        projectTasks.forEach((t) => {
          updateMinMax(t.start);
          updateMinMax(t.finish);
        });
      });
    }

    if (hasDates) {
      if (printRangeType !== "custom") {
        minDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
        maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
      }
    } else {
      minDate = new Date();
      minDate = new Date(minDate.getFullYear(), minDate.getMonth() - 1, 1);
      maxDate = new Date();
      maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 2, 0);
    }

    return { minDate, maxDate };
  }, [printFilteredData, printRangeType, printStartDate, printEndDate]);

  const [measuredContentSize, setMeasuredContentSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!isPrintPreview) return;
    let t: any;
    const updateSize = () => {
      const wrapper = document.querySelector(".print-content-wrapper") as HTMLElement;
      if (wrapper) {
        const w = Math.max(100, wrapper.scrollWidth || wrapper.offsetWidth);
        const h = Math.max(100, wrapper.scrollHeight || wrapper.offsetHeight);
        setMeasuredContentSize((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
    };
    const wrapper = document.querySelector(".print-content-wrapper") as HTMLElement;
    let ro: ResizeObserver | null = null;
    if (wrapper && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        clearTimeout(t);
        t = setTimeout(updateSize, 60);
      });
      ro.observe(wrapper);
    }
    t = setTimeout(updateSize, 80);
    return () => {
      clearTimeout(t);
      if (ro) ro.disconnect();
    };
  }, [isPrintPreview, activeTab, printOrientation, printPaperSize, ganttViewMode]);

  const printScale = useMemo(() => {
    if (printScaleMode === "default") return 100;
    if (printScaleMode === "custom") return printScaleCustom;

    const targetWidthPx = (printWidth - 16) * 3.779527559;
    const targetHeightPx = (printHeight - (printFilterHeader ? 19.5 : 17)) * 3.779527559;

    let contentW = measuredContentSize.width;
    let contentH = measuredContentSize.height;

    if (contentW <= 0 || contentH <= 0) {
      if (activeTab === "gantt") {
        const { sortedProjects } = printFilteredData;
        const { minDate, maxDate } = printDates;
        const savedDayWidth = safeGetDeviceItemLocal("taka_gantt_day_width");
        const currentDayWidth = savedDayWidth ? Math.round(parseFloat(savedDayWidth)) : 4;
        const savedSideWidth = safeGetDeviceItemLocal("taka_gantt_side_width");
        const currentSideWidth = savedSideWidth ? parseInt(savedSideWidth, 10) : 300;
        const totalDays =
          Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        contentW = currentSideWidth + totalDays * currentDayWidth;
        contentH = 160 + sortedProjects.length * 44;
      } else {
        contentW = 1200;
        contentH = 800;
      }
    }

    if (printScaleMode === "fit-cols") {
      const scale = (targetWidthPx / contentW) * 100;
      return Math.max(10, Math.min(Number(scale.toFixed(2)), 100));
    }

    if (printScaleMode === "fit-rows") {
      const scale = (targetHeightPx / contentH) * 100;
      return Math.max(10, Math.min(Number(scale.toFixed(2)), 100));
    }

    if (printScaleMode === "fit-page") {
      const scaleCols = (targetWidthPx / contentW) * 100;
      const scaleRows = (targetHeightPx / contentH) * 100;
      return Math.max(10, Math.min(Number(Math.min(scaleCols, scaleRows).toFixed(2)), 100));
    }

    if (printScaleMode === "fill-page") {
      const scaleCols = (targetWidthPx / contentW) * 100;
      const scaleRows = (targetHeightPx / contentH) * 100;
      return Math.max(10, Math.min(Number(Math.min(scaleCols, scaleRows).toFixed(2)), 200));
    }

    return 100;
  }, [
    printScaleMode,
    printScaleCustom,
    printWidth,
    printHeight,
    printFilterHeader,
    measuredContentSize,
    activeTab,
    printFilteredData,
    printDates,
  ]);

  const ganttPrintPages = useMemo(() => {
    if (!isPrintPreview || activeTab !== "gantt") return null;
    if (printRangeType === "custom" && (printStartDate || printEndDate)) {
      return [
        {
          dateRange: {
            start: printDates.minDate.toISOString().slice(0, 10),
            end: printDates.maxDate.toISOString().slice(0, 10),
          },
        },
      ];
    }
    return [{ dateRange: undefined as any }];
  }, [isPrintPreview, activeTab, printRangeType, printStartDate, printEndDate, printDates]);

  const handleExportToExcel = async () => {
    if (isExportingPDF || activeTab === "gantt") return;
    setIsExportingPDF(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      await exportToExcel({
        activeTab,
        sortedProjects: printFilteredData.sortedProjects,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrintToPDF = async () => {
    if (isExportingPDF) return;
    if (printTarget === "browser") {
      window.print();
      return;
    }
    setIsExportingPDF(true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      await exportToPdf({
        activeTab,
        printOrientation,
        printPaperSize,
        printDpi,
        printScaleMode,
        printScale,
        printWidth,
        printHeight,
        printFilterHeader,
        printFilterContext,
        printDate,
        printWatermark,
      });
    } catch (err) {
      console.error("Export to PDF failed:", err);
      useAppStore.getState().setToast({
        title: "Notice",
        message: "Failed to export PDF. Please try again.",
      });
    } finally {
      setIsExportingPDF(false);
    }
  };

  return {
    isPrintPreview,
    setIsPrintPreview,
    printOrientation,
    printPaperSize,
    printDate,
    printFilterHeader,
    printScaleMode,
    printWatermark,
    isExportingPDF,
    printWidth,
    printHeight,
    printFilterContext,
    printScale,
    measuredContentSize,
    ganttPrintPages,
    handleExportToExcel,
    handlePrintToPDF,
  };
}
