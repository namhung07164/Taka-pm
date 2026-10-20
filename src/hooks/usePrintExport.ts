import { useMemo } from 'react';
import { parseDateTime } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';
import { getPrintFilterContext } from '../lib/printFilterHelper';
import { exportToExcel, exportToPdf } from '../lib/exportPdfEngine';

export function usePrintExport(printFilteredData: any) {
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const printOrientation = useAppStore(state => state.printOrientation);
  const printPaperSize = useAppStore(state => state.printPaperSize);
  const printDate = useAppStore(state => state.printDate);
  const printFilterHeader = useAppStore(state => state.printFilterHeader);
  const printScaleMode = useAppStore(state => state.printScaleMode);
  const printScaleCustom = useAppStore(state => state.printScaleCustom);
  const printDpi = useAppStore(state => state.printDpi);
  const printWatermark = useAppStore(state => state.printWatermark);
  const isExportingPDF = useAppStore(state => state.isExportingPDF);
  const setIsExportingPDF = useAppStore(state => state.setIsExportingPDF);
  const printRangeType = useAppStore(state => state.printRangeType);
  const printStartDate = useAppStore(state => state.printStartDate);
  const printEndDate = useAppStore(state => state.printEndDate);
  const activeTab = useAppStore(state => state.activeTab);

  const getPaperDimensions = () => {
    if (printPaperSize === 'A2') return { w: 420, h: 594 };
    if (printPaperSize === 'A3') return { w: 297, h: 420 };
    return { w: 210, h: 297 };
  };
  const { w: paperW, h: paperH } = getPaperDimensions();
  const printWidth = printOrientation === 'landscape' ? paperH : paperW;
  const printHeight = printOrientation === 'landscape' ? paperW : paperH;

  const printDates = useMemo(() => {
    let minDate = new Date();
    let maxDate = new Date();
    let hasDates = false;

    const { sortedProjects, tasksByProj } = printFilteredData;

    if (printRangeType === 'custom') {
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

      sortedProjects.forEach((p: any) => {
        updateMinMax(p.computedTakStart);
        updateMinMax(p.computedTakCompl);
        updateMinMax(p.computedOpening || p.opening);
        const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
        const pTasks = tasksByProj.get(pKey) || [];
        pTasks.forEach((t: any) => {
          updateMinMax(t.start);
          updateMinMax(t.finish);
        });
      });

      if (hasDates) {
        minDate = new Date(minDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        maxDate = new Date(maxDate.getTime() + 5 * 24 * 60 * 60 * 1000);
      }
    }

    if (!hasDates || minDate > maxDate) {
      minDate = new Date();
      maxDate = new Date(minDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    return { minDate, maxDate };
  }, [printRangeType, printStartDate, printEndDate, printFilteredData]);

  const printScale = useMemo(() => {
    if (printScaleMode === 'custom') return printScaleCustom;

    let estimatedGanttWidth = 1200;
    let estimatedGanttHeight = 800;

    const ganttElem = document.getElementById('gantt-export-area');
    if (ganttElem && ganttElem.scrollWidth > 500 && printRangeType === 'entire') {
      estimatedGanttWidth = ganttElem.scrollWidth;
      estimatedGanttHeight = ganttElem.scrollHeight;
    } else {
      const daysDiff = Math.max(
        1,
        Math.ceil((printDates.maxDate.getTime() - printDates.minDate.getTime()) / (1000 * 3600 * 24))
      );
      estimatedGanttWidth = 710 + daysDiff * 24;
      let totalRows = 3;
      const { sortedProjects, tasksByProj, expanded } = printFilteredData;
      sortedProjects.forEach((p: any) => {
        totalRows += 1;
        const pKey = `${p.code || ''}-${p.year || ''}-${p.store || ''}`;
        if (expanded.includes(p.code)) {
          totalRows += (tasksByProj.get(pKey) || []).length;
        }
      });
      estimatedGanttHeight = totalRows * 32 + 100;
    }

    if (printScaleMode === 'fit-cols') {
      const targetWidthPx = (printWidth - 20) * 3.78;
      return Math.max(10, Math.min(Math.floor((targetWidthPx / estimatedGanttWidth) * 100), 100));
    }
    if (printScaleMode === 'fit-rows') {
      const targetHeightPx = (printHeight - 20) * 3.78;
      return Math.max(10, Math.min(Math.floor((targetHeightPx / estimatedGanttHeight) * 100), 100));
    }
    if (printScaleMode === 'fit-page') {
      const targetWidthPx = (printWidth - 20) * 3.78;
      const targetHeightPx = (printHeight - 20) * 3.78;
      const scaleCols = Math.floor((targetWidthPx / estimatedGanttWidth) * 100);
      const scaleRows = Math.floor((targetHeightPx / estimatedGanttHeight) * 100);
      return Math.max(10, Math.min(scaleCols, scaleRows, 100));
    }
    return 100;
  }, [printScaleMode, printScaleCustom, printWidth, printHeight, printFilteredData, printDates, printRangeType]);

  const ganttPrintPages = useMemo(() => {
    if (!isPrintPreview || activeTab !== 'gantt') return null;
    return [
      {
        projects: printFilteredData.sortedProjects,
        dateRange: { start: new Date(printDates.minDate), end: new Date(printDates.maxDate) },
      },
    ];
  }, [isPrintPreview, activeTab, printFilteredData, printDates]);

  const handleExportToExcel = async () => {
    if (isExportingPDF || activeTab === 'gantt') return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      await exportToExcel({
        activeTab,
        sortedProjects: printFilteredData.sortedProjects || [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handlePrintToPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      const state = useAppStore.getState();
      const printFilterContext = getPrintFilterContext({
        activeTab,
        globalStoreFilter: state.globalStoreFilter,
        globalYearFilter: state.globalYearFilter,
        currentUser: state.currentUser,
        detailTabFilterCode: state.detailTabFilterCode,
        layoutTabFilters: state.layoutTabFilters,
      });
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
      console.error('Export to PDF failed:', err);
      useAppStore.getState().setToast({ title: 'Error', message: 'PDF export failed. Please try again.' });
    } finally {
      setIsExportingPDF(false);
    }
  };

  return {
    printDates,
    printScale,
    ganttPrintPages,
    handleExportToExcel,
    handlePrintToPDF,
  };
}
