import { drawPdfFilterHeader } from '../printFilterHelper';

export const PX_PER_MM = 3.779527559; // Standard 96 DPI CSS pixel-to-millimeter factor

export interface PrintGridMetrics {
  currentScale: number;
  usableWidthPx: number;
  usableHeightPx: number;
  cols: number;
  headerTopPx: number;
  headerBottomPx: number;
  headerHeight: number;
  validBoundaries: number[];
  pageBreaks: { domStartY: number; domEndY: number; actualPdfStartY: number }[];
}

export function extractWrapperPrintMetrics(
  wrapper: HTMLElement,
  naturalHeight: number,
  domScaleFactor: number = 1
): {
  headerTopPx: number;
  headerBottomPx: number;
  headerHeight: number;
  validBoundaries: number[];
} {
  const safeScale = Math.max(0.05, domScaleFactor);
  const wrapperRect = wrapper.getBoundingClientRect();

  let headerTopPx = 0;
  let headerBottomPx = 0;
  let headerHeight = 0;

  const customHeader = wrapper.querySelector('[data-print-header="true"]') as HTMLElement | null;
  const thead = wrapper.querySelector('thead') as HTMLElement | null;
  const headerEl = customHeader || thead;
  const canvasHeaderEl = wrapper.querySelector('canvas[data-print-header-height]') as HTMLCanvasElement | null;

  if (headerEl) {
    const hRect = headerEl.getBoundingClientRect();
    if (hRect.height > 0) {
      headerTopPx = Math.max(0, (hRect.top - wrapperRect.top) / safeScale);
      headerBottomPx = Math.max(headerTopPx, (hRect.bottom - wrapperRect.top) / safeScale);
      headerHeight = Math.max(0, headerBottomPx - headerTopPx);
    }
  } else if (canvasHeaderEl) {
    const hAttr = Number(canvasHeaderEl.getAttribute('data-print-header-height')) || 0;
    if (hAttr > 0) {
      const cRect = canvasHeaderEl.getBoundingClientRect();
      headerTopPx = Math.max(0, (cRect.top - wrapperRect.top) / safeScale);
      headerHeight = hAttr;
      headerBottomPx = headerTopPx + hAttr;
    }
  }

  const rawBoundaries: number[] = [0];
  const rowElements = wrapper.querySelectorAll('tbody tr, .project-row, .task-row, [data-print-row]');
  rowElements.forEach((rowEl) => {
    const rRect = rowEl.getBoundingClientRect();
    if (rRect.height > 0) {
      const bottomY = Math.max(0, (rRect.bottom - wrapperRect.top) / safeScale);
      if (bottomY > 0 && bottomY <= naturalHeight + 2) {
        rawBoundaries.push(bottomY);
      }
    }
  });

  if (canvasHeaderEl) {
    const rowHAttr = Number(canvasHeaderEl.getAttribute('data-print-row-height')) || 0;
    if (rowHAttr > 0) {
      for (let y = headerBottomPx + rowHAttr; y < naturalHeight; y += rowHAttr) {
        rawBoundaries.push(y);
      }
    }
  }

  rawBoundaries.push(naturalHeight);
  rawBoundaries.sort((a, b) => a - b);

  const validBoundaries: number[] = [];
  for (let i = 0; i < rawBoundaries.length; i++) {
    if (i === 0 || rawBoundaries[i] - validBoundaries[validBoundaries.length - 1] > 0.5) {
      validBoundaries.push(rawBoundaries[i]);
    }
  }

  return {
    headerTopPx,
    headerBottomPx,
    headerHeight,
    validBoundaries,
  };
}

export function computePrintGridMetrics(params: {
  wrapper: HTMLElement;
  naturalWidth: number;
  naturalHeight: number;
  targetWidthMm: number;
  targetHeightMm: number;
  topMarginMm: number;
  printScaleMode: string;
  printScale: number;
  domScaleFactor?: number;
}): PrintGridMetrics {
  const {
    wrapper,
    naturalWidth,
    naturalHeight,
    targetWidthMm,
    targetHeightMm,
    topMarginMm,
    printScaleMode,
    printScale,
    domScaleFactor = 1,
  } = params;

  const { headerTopPx, headerBottomPx, headerHeight, validBoundaries } = extractWrapperPrintMetrics(
    wrapper,
    naturalHeight,
    domScaleFactor
  );

  const targetWidthPxAt100 = targetWidthMm * PX_PER_MM;
  const targetHeightPxAt100 = targetHeightMm * PX_PER_MM;

  const fitColsScale = targetWidthPxAt100 / Math.max(1, naturalWidth);
  const fitRowsScale = targetHeightPxAt100 / Math.max(1, naturalHeight);

  let currentScale = Math.max(0.1, Math.min(2.0, (printScale || 100) / 100));
  let cols = 1;

  if (printScaleMode === 'fit-cols') {
    currentScale = Math.max(0.1, Math.min(1.0, fitColsScale));
    cols = 1;
  } else if (printScaleMode === 'fit-rows') {
    currentScale = Math.max(0.1, Math.min(1.0, fitRowsScale));
    const uWidth = targetWidthPxAt100 / currentScale;
    cols = Math.max(1, Math.ceil((naturalWidth - 2) / uWidth));
  } else if (printScaleMode === 'fit-page') {
    currentScale = Math.max(0.1, Math.min(1.0, fitColsScale, fitRowsScale));
    cols = 1;
  } else if (printScaleMode === 'fill-page') {
    currentScale = Math.max(0.1, Math.min(2.0, Math.min(fitColsScale, fitRowsScale)));
    cols = 1;
  } else {
    const uWidth = targetWidthPxAt100 / currentScale;
    cols = Math.max(1, Math.ceil((naturalWidth - 2) / uWidth));
  }

  const usableWidthPx = cols === 1 ? Math.max(naturalWidth, targetWidthPxAt100 / currentScale) : targetWidthPxAt100 / currentScale;
  const usableHeightPx =
    printScaleMode === 'fit-page' || printScaleMode === 'fit-rows' || printScaleMode === 'fill-page'
      ? Math.max(naturalHeight + 1, targetHeightPxAt100 / currentScale)
      : targetHeightPxAt100 / currentScale;

  const headerPdfHeight = (headerHeight * currentScale) / PX_PER_MM;
  const pageBreaks: { domStartY: number; domEndY: number; actualPdfStartY: number }[] = [];

  if (printScaleMode === 'fit-page' || printScaleMode === 'fit-rows' || printScaleMode === 'fill-page') {
    pageBreaks.push({
      domStartY: 0,
      domEndY: naturalHeight,
      actualPdfStartY: topMarginMm,
    });
  } else {
    let domStartY = 0;
    const effectiveRepeatHeaderPx = headerHeight > 0 && headerHeight < usableHeightPx * 0.45 ? headerHeight : 0;
    const effectiveRepeatHeaderMm = effectiveRepeatHeaderPx > 0 ? headerPdfHeight : 0;

    while (domStartY < naturalHeight - 1) {
      let domEndYTheoretical: number;
      let actualPdfStartY: number;

      if (pageBreaks.length === 0) {
        domEndYTheoretical = domStartY + usableHeightPx;
        actualPdfStartY = topMarginMm;
      } else {
        domEndYTheoretical = domStartY + usableHeightPx - effectiveRepeatHeaderPx;
        actualPdfStartY = topMarginMm + effectiveRepeatHeaderMm;
      }

      if (domEndYTheoretical >= naturalHeight - 1) {
        pageBreaks.push({
          domStartY,
          domEndY: naturalHeight,
          actualPdfStartY,
        });
        break;
      }

      let breakY = domStartY;
      for (let j = 0; j < validBoundaries.length; j++) {
        if (validBoundaries[j] > domStartY + 4 && validBoundaries[j] <= domEndYTheoretical + 1.5) {
          breakY = validBoundaries[j];
        }
      }

      if (breakY <= domStartY + 4) {
        breakY = domEndYTheoretical;
      }

      pageBreaks.push({
        domStartY,
        domEndY: breakY,
        actualPdfStartY,
      });

      domStartY = breakY;
    }
  }

  return {
    currentScale,
    usableWidthPx,
    usableHeightPx,
    cols,
    headerTopPx,
    headerBottomPx,
    headerHeight,
    validBoundaries,
    pageBreaks,
  };
}

export async function exportLayoutPlanToPdf(params: {
  orientation: 'p' | 'l';
  format: string;
  printOrientation: string;
  printDpi: number;
  printScaleMode: string;
  printFilterHeader: boolean;
  printFilterContext: any;
  printDate: boolean;
  printWatermark: string;
  isDark: boolean;
}): Promise<boolean> {
  const {
    orientation,
    format,
    printOrientation,
    printDpi,
    printScaleMode,
    printFilterHeader,
    printFilterContext,
    printDate,
    printWatermark,
    isDark,
  } = params;

  let dataUrl: string | null = null;
  let imgW = 1200;
  let imgH = 800;

  const exportFn = (window as any).__taka_layout_export;
  if (typeof exportFn === 'function') {
    const res = exportFn(printDpi || 200);
    if (res && res.dataUrl) {
      dataUrl = res.dataUrl;
      imgW = res.width;
      imgH = res.height;
    }
  }

  if (!dataUrl) {
    const stage = (window as any).__taka_layout_stage;
    const stageCanvas = document.querySelector('#live-layout-canvas-container canvas') as HTMLCanvasElement;
    if (stage && typeof stage.toDataURL === 'function') {
      const exportRatio = Math.min(2.0, Math.max(1.0, printDpi / 96));
      dataUrl = stage.toDataURL({ pixelRatio: exportRatio, mimeType: 'image/jpeg', quality: 0.92 });
      imgW = (stage.width ? stage.width() : 1200) * exportRatio;
      imgH = (stage.height ? stage.height() : 800) * exportRatio;
    } else if (stageCanvas) {
      dataUrl = stageCanvas.toDataURL('image/jpeg', 0.92);
      imgW = stageCanvas.width;
      imgH = stageCanvas.height;
    }
  }

  if (!dataUrl) return false;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  const pdfPageWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();

  const margin = 2;
  const usableWidth = pdfPageWidth - margin * 2;
  let usableHeight = pdfPageHeight - margin * 2;
  let topOffset = margin;

  if (printFilterHeader) {
    drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, margin, isDark);
    topOffset += 8;
    usableHeight -= 8;
  }

  if (printDate) {
    usableHeight -= 3.5;
  }

  const isFillPage = printScaleMode === 'fill-page';
  let targetW = usableWidth;
  let targetH = usableHeight;
  let xPos = margin;
  let yPos = topOffset;

  if (!isFillPage) {
    const imgAspect = imgW / imgH;
    const pageAspect = usableWidth / usableHeight;
    if (imgAspect > pageAspect) {
      targetW = usableWidth;
      targetH = usableWidth / imgAspect;
    } else {
      targetH = usableHeight;
      targetW = usableHeight * imgAspect;
    }
    xPos = margin + (usableWidth - targetW) / 2;
    yPos = topOffset + (usableHeight - targetH) / 2;
  }

  pdf.addImage(dataUrl, 'JPEG', xPos, yPos, targetW, targetH, undefined, 'FAST');

  // Render Color Legend on PDF if enabled in Print Preview
  const legendBridge = (window as any).__taka_layout_print_legend;
  if (legendBridge && legendBridge.show) {
    try {
      const hexToRgb = (hex: string): [number, number, number] => {
        const clean = String(hex || '#3b82f6').replace('#', '').trim();
        if (clean.length === 3) {
          return [
            parseInt(clean[0] + clean[0], 16) || 59,
            parseInt(clean[1] + clean[1], 16) || 130,
            parseInt(clean[2] + clean[2], 16) || 246,
          ];
        }
        const num = parseInt(clean.slice(0, 6), 16);
        if (isNaN(num)) return [59, 130, 246];
        return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
      };

      const rawGroups: any[] =
        Array.isArray(legendBridge.activeGroups) && legendBridge.activeGroups.length > 0
          ? legendBridge.activeGroups
          : [
              { id: 'completed', name: 'Completed', color: '#10b981' },
              { id: 'on_process', name: 'On Process', color: '#3b82f6' },
              { id: 'upcoming', name: 'Upcoming', color: '#f59e0b' },
              { id: 'delay', name: 'Delay', color: '#f43f5e' },
            ];

      const items = rawGroups.map((g: any) => {
        let label = String(g.name || '');
        if (g.matchCount !== undefined) {
          const areaStr =
            g.totalArea > 0
              ? ` • ${Number(g.totalArea).toLocaleString('en-US', { maximumFractionDigits: 1 })} m²`
              : '';
          const pctStr = g.areaPercent ? ` • ${Number(g.areaPercent).toFixed(1)}%` : '';
          label += ` (${g.matchCount} ${g.matchCount === 1 ? 'unit' : 'units'}${areaStr}${pctStr})`;
        }
        return { label, color: g.color || '#3b82f6' };
      });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      const maxItemWidth = items.reduce((maxW, it) => {
        const w = pdf.getTextWidth(it.label) + 8;
        return Math.max(maxW, w);
      }, 48);

      const boxW = Math.min(targetW * 0.48, Math.max(54, maxItemWidth + 6));
      const rowH = 4.6;
      const boxH = 8 + items.length * rowH + 2;

      const relRect =
        typeof legendBridge.getRelativeRect === 'function' ? legendBridge.getRelativeRect() : null;
      let boxX = xPos + 4;
      let boxY = yPos + targetH - boxH - 4;
      if (relRect) {
        boxX = xPos + relRect.relX * targetW;
        boxY = yPos + relRect.relY * targetH;
        // Clamp inside the PDF page
        boxX = Math.max(margin, Math.min(pdfPageWidth - margin - boxW, boxX));
        boxY = Math.max(topOffset, Math.min(pdfPageHeight - margin - 5 - boxH, boxY));
      }

      // Draw white card with dark slate border
      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(boxX, boxY, boxW, boxH, 2, 2, 'FD');

      // Header text
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
      pdf.text('COLOR LEGEND', boxX + 3, boxY + 4.8);

      const scopeText = `${legendBridge.storeFilter || ''} • ${legendBridge.targetLoc || ''}${
        legendBridge.versionYear ? ` (${legendBridge.versionYear})` : ''
      }`;
      pdf.setFontSize(6.8);
      pdf.setTextColor(71, 85, 105);
      pdf.text(scopeText, boxX + boxW - 3, boxY + 4.8, { align: 'right' });

      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      pdf.line(boxX + 2.5, boxY + 6.4, boxX + boxW - 2.5, boxY + 6.4);

      items.forEach((it, idx) => {
        const iy = boxY + 8.2 + idx * rowH;
        const [r, g, b] = hexToRgb(it.color);
        pdf.setFillColor(r, g, b);
        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.2);
        pdf.rect(boxX + 3, iy, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(15, 23, 42);
        pdf.text(it.label, boxX + 7.5, iy + 2.4);
      });
    } catch {
      // Ignore legend PDF drawing errors
    }
  }

  if (printWatermark && printWatermark !== 'none') {
    try {
      pdf.saveGraphicsState();
      pdf.setGState(new (pdf as any).GState({ opacity: 0.12 }));
      pdf.setFontSize(printOrientation === 'landscape' ? 52 : 38);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(150, 150, 150);
      pdf.text(printWatermark.toUpperCase(), pdfPageWidth / 2, pdfPageHeight / 2, {
        align: 'center',
        angle: 45,
      });
      pdf.restoreGraphicsState();
    } catch {
      // Fallback
    }
  }

  const footerY = pdfPageHeight - 3;
  pdf.setFontSize(7.5);
  pdf.setTextColor(130, 130, 130);
  let footerText = `Takashimaya PM • Layout Plan (${printFilterContext?.storeDisplay || 'HCM'} - ${printFilterContext?.yearDisplay || 'All'})`;
  if (printDate) {
    footerText += ` • Printed: ${new Date().toLocaleString()}`;
  }
  pdf.text(footerText, margin, footerY);

  pdf.save(`layout_plan_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`);
  return true;
}
