import { exportLayoutPlanToPdf } from './pdfLayoutExporter';
export { exportLayoutPlanToPdf };

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
