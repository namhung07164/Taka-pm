import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { GanttTableRow } from './ganttTypes';
import { GanttColumnWidths } from './useGanttColumnResize';

interface UseGanttPrintDimensionsParams {
  sideWidth: number;
  dayWidth: number;
  totalDays: number;
  visibleGanttRows: GanttTableRow[];
  visibleColumns: string[];
  colWidths?: GanttColumnWidths;
}

export function useGanttPrintDimensions({
  sideWidth,
  dayWidth,
  totalDays,
  visibleGanttRows,
  visibleColumns,
  colWidths,
}: UseGanttPrintDimensionsParams) {
  const isPrintPreview = useAppStore((state) => state.isPrintPreview);
  const isExportingPDF = useAppStore((state) => state.isExportingPDF);
  const printPaperSize = useAppStore((state) => state.printPaperSize);
  const printOrientation = useAppStore((state) => state.printOrientation);
  const printScaleMode = useAppStore((state) => state.printScaleMode);
  const printFilterHeader = useAppStore((state) => state.printFilterHeader);
  const viewMode = useAppStore((state) => state.ganttViewMode);

  const isPrintMode = Boolean(isPrintPreview || isExportingPDF);

  return useMemo(() => {
    if (!isPrintMode) {
      return {
        effectiveSideWidth: sideWidth,
        effectiveDayWidth: dayWidth,
        isPrintMode: false,
      };
    }

    const startW = visibleColumns.includes('start') ? (colWidths?.start ?? 85) : 0;
    const finishW = visibleColumns.includes('finish') ? (colWidths?.finish ?? 85) : 0;
    const partyW = visibleColumns.includes('party') ? (colWidths?.party ?? 80) : 0;
    const durationW = visibleColumns.includes('duration') ? (colWidths?.duration ?? 60) : 0;
    const predW = visibleColumns.includes('predecessor') ? (colWidths?.predecessor ?? 90) : 0;
    const extraColsW = startW + finishW + partyW + durationW + predW;

    let maxNameLen = 22;
    let naturalHeightPx = 44; // Header height

    for (let i = 0; i < visibleGanttRows.length; i++) {
      const r = visibleGanttRows[i];
      if (r.isHidden) continue;
      if (r.type === 'project') {
        naturalHeightPx += 48;
        const pLen = (r.project?.name || '').length;
        if (pLen > maxNameLen) maxNameLen = pLen;
      } else {
        naturalHeightPx += 40;
        const tLen = (r.task?.name || '').length + (r.isChild ? 3 : 0) + (r.hasChildren ? 4 : 0);
        if (tLen > maxNameLen) maxNameLen = tLen;
      }
    }

    // Ensure enough width for full Project / Task title and task names without ellipsis truncation
    const singleLineChars = Math.min(maxNameLen, 50);
    const nameColW = Math.max(280, Math.min(370, Math.round(singleLineChars * 6.3 + 48)));
    const minPrintSideWidth = 40 + nameColW + extraColsW;
    const effectiveSideWidth = Math.max(sideWidth, minPrintSideWidth);

    const minDayWidth =
      viewMode === 'weekly' ? 5.5 : viewMode === 'quarterly' ? 0.55 : 1.55;

    const paperDims =
      printPaperSize === 'A2'
        ? { w: 420, h: 594 }
        : printPaperSize === 'A3'
        ? { w: 297, h: 420 }
        : { w: 210, h: 297 };

    const pageW = printOrientation === 'landscape' ? paperDims.h : paperDims.w;
    const pageH = printOrientation === 'landscape' ? paperDims.w : paperDims.h;
    const targetWidthMm = Math.max(100, pageW - 16);
    const targetHeightMm = Math.max(100, pageH - (printFilterHeader ? 19.5 : 17));
    const targetWidthPx = targetWidthMm * 3.779527559;
    const targetHeightPx = targetHeightMm * 3.779527559;

    let effectiveDayWidth = Math.max(dayWidth, minDayWidth);

    if (printScaleMode === 'fit-page' || printScaleMode === 'fill-page') {
      // Match total Gantt chart aspect ratio to the target printable page aspect ratio
      const effectiveHeightPx = Math.max(naturalHeightPx, targetHeightPx);
      const idealTotalWidthPx = Math.max(
        targetWidthPx,
        effectiveHeightPx * (targetWidthMm / targetHeightMm)
      );
      const idealTimelineWidthPx = Math.max(380, idealTotalWidthPx - effectiveSideWidth);
      const aspectMatchedDayWidth = idealTimelineWidthPx / Math.max(1, totalDays);
      effectiveDayWidth = Number(
        Math.max(minDayWidth, Math.min(18, aspectMatchedDayWidth)).toFixed(2)
      );
    } else if (printScaleMode === 'fit-cols') {
      const minTimelineW = Math.max(380, targetWidthPx - effectiveSideWidth);
      const fitColsDayWidth = minTimelineW / Math.max(1, totalDays);
      effectiveDayWidth = Number(
        Math.max(dayWidth, minDayWidth, Math.min(14, fitColsDayWidth)).toFixed(2)
      );
    }

    return {
      effectiveSideWidth,
      effectiveDayWidth,
      isPrintMode: true,
    };
  }, [
    isPrintMode,
    sideWidth,
    dayWidth,
    totalDays,
    visibleGanttRows,
    visibleColumns,
    colWidths,
    viewMode,
    printPaperSize,
    printOrientation,
    printScaleMode,
    printFilterHeader,
  ]);
}
