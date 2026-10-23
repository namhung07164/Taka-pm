import { Project } from '../types';
import { getStatus } from './utils';
import { drawPdfFilterHeader } from './printFilterHelper';
import {
  PX_PER_MM,
  computePrintGridMetrics,
  exportLayoutPlanToPdf,
} from './exportPdfParts/pdfTableSlicer';

export interface ExportToExcelOptions {
  activeTab: string;
  sortedProjects: Project[];
}

export async function exportToExcel({ activeTab, sortedProjects }: ExportToExcelOptions): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  if (activeTab === 'general') {
    const wsData: (string | number)[][] = [];
    wsData.push(["Year", "Store", "Location", "Code", "Project", "Status", "Pj Start", "Pj Compl", "Opening"]);
    sortedProjects.forEach((p) => {
      wsData.push([
        p.year || "",
        p.store || "",
        p.location || "",
        p.code,
        p.name,
        getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code),
        p.computedTakStart ? String(p.computedTakStart).substring(0, 10) : "",
        p.computedTakCompl ? String(p.computedTakCompl).substring(0, 10) : "",
        (p.computedOpening || p.opening) ? String(p.computedOpening || p.opening).substring(0, 10) : ""
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "General");
  } else {
    const table = document.querySelector('.print-paper table');
    if (table) {
      const ws = XLSX.utils.table_to_sheet(table, { display: true });
      XLSX.utils.book_append_sheet(wb, ws, "Export");
    } else {
      const ws = XLSX.utils.aoa_to_sheet([["No data found"]]);
      XLSX.utils.book_append_sheet(wb, ws, "Export");
    }
  }

  XLSX.writeFile(wb, `export_${activeTab}_${Date.now()}.xlsx`);
}

export interface ExportToPdfOptions {
  activeTab: string;
  printOrientation: string;
  printPaperSize: string;
  printDpi: number;
  printScaleMode: string;
  printScale: number;
  printWidth: number;
  printHeight: number;
  printFilterHeader: boolean;
  printFilterContext: any;
  printDate: boolean;
  printWatermark: string;
}

export async function exportToPdf(options: ExportToPdfOptions): Promise<void> {
  const {
    activeTab,
    printOrientation,
    printPaperSize,
    printDpi = 150,
    printScaleMode = "fit-page",
    printScale = 100,
    printFilterHeader,
    printFilterContext,
    printDate,
    printWatermark,
  } = options;

  const orientation = printOrientation === "landscape" ? "l" : "p";
  const format = printPaperSize.toLowerCase();
  const isDark = document.documentElement.classList.contains('dark');

  // Fast path for Layout Plan Canvas (Fit to full page)
  if (activeTab === 'layout') {
    const exported = await exportLayoutPlanToPdf({
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
    });
    if (!exported) {
      window.print();
    }
    return;
  }

  const pages = document.querySelectorAll('.print-paper');
  if (pages.length === 0) return;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  const pdfPageWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();
  const sideMargin = 8;
  const topMargin = printFilterHeader ? 10.5 : 8;
  const bottomMargin = 9;
  const targetWidthMm = pdfPageWidth - sideMargin * 2;
  const targetHeightMm = pdfPageHeight - topMargin - bottomMargin;

  // Yield to avoid main thread freeze
  await new Promise(resolve => setTimeout(resolve, 40));

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] as HTMLElement;
    const wrapper = page.querySelector('.print-content-wrapper') as HTMLElement;
    if (!wrapper) continue;

    // Hide overlays & non-printable elements
    const dashedOverlay = wrapper.querySelector('.hide-on-actual-print') as HTMLElement;
    if (dashedOverlay) dashedOverlay.style.display = 'none';

    const originalTransform = wrapper.style.transform;
    const originalWidth = wrapper.style.width;
    const originalHeight = wrapper.style.height;
    const originalPosition = wrapper.style.position;
    const originalOverflow = wrapper.style.overflow;

    const hiddenElements: { el: HTMLElement; display: string }[] = [];
    const elementsToHide = wrapper.querySelectorAll('.hide-on-actual-print, .print\\:hidden');
    elementsToHide.forEach((el: any) => {
      hiddenElements.push({ el, display: el.style.display });
      el.style.display = 'none';
    });

    // Unscale to measure natural dimension accurately
    wrapper.style.transform = 'none';
    wrapper.style.width = 'max-content';
    wrapper.style.height = 'max-content';
    wrapper.style.position = 'static';
    wrapper.style.overflow = 'visible';

    const naturalWidth = Math.max(100, wrapper.scrollWidth);
    const naturalHeight = Math.max(100, wrapper.scrollHeight);

    wrapper.style.width = `${naturalWidth}px`;
    wrapper.style.height = `${naturalHeight}px`;

    const gridMetrics = computePrintGridMetrics({
      wrapper,
      naturalWidth,
      naturalHeight,
      targetWidthMm,
      targetHeightMm,
      topMarginMm: topMargin,
      printScaleMode,
      printScale,
      domScaleFactor: 1,
    });

    const {
      currentScale,
      usableWidthPx,
      cols,
      headerTopPx,
      headerHeight,
      pageBreaks,
    } = gridMetrics;

    // Calculate optimal pixelRatio for requested DPI without memory bloat
    const desiredDpi = Math.max(96, Math.min(300, printDpi || 150));
    let effectivePixelRatio = desiredDpi / 96;

    // Safety cap: max 6,500,000 pixels on master canvas to guarantee instant rendering & 0 lag
    const MAX_CANVAS_PIXELS = 6_500_000;
    const requestedPixels = naturalWidth * effectivePixelRatio * naturalHeight * effectivePixelRatio;
    if (requestedPixels > MAX_CANVAS_PIXELS) {
      effectivePixelRatio = Math.sqrt(MAX_CANVAS_PIXELS / (naturalWidth * naturalHeight));
    }
    effectivePixelRatio = Math.max(0.65, Math.min(2.0, effectivePixelRatio));

    const htmlToImage = await import('html-to-image');
    const canvas = await htmlToImage.toCanvas(wrapper, {
      width: naturalWidth,
      height: naturalHeight,
      style: {
        transform: 'none',
        width: `${naturalWidth}px`,
        height: `${naturalHeight}px`,
      },
      pixelRatio: effectivePixelRatio,
      backgroundColor: isDark ? '#1e1e20' : '#ffffff',
      skipFonts: true,
      cacheBust: false,
      filter: (node) => {
        if (node.classList && (node.classList.contains('hide-on-actual-print') || node.classList.contains('print:hidden'))) {
          return false;
        }
        return true;
      },
    });

    // Restore wrapper DOM style immediately
    wrapper.style.transform = originalTransform;
    wrapper.style.width = originalWidth;
    wrapper.style.height = originalHeight;
    wrapper.style.position = originalPosition;
    wrapper.style.overflow = originalOverflow;

    if (dashedOverlay) dashedOverlay.style.display = '';
    hiddenElements.forEach(({ el, display }) => {
      el.style.display = display;
    });

    const headerPdfHeight = (headerHeight * currentScale) / PX_PER_MM;
    const headerSrcY = Math.max(0, Math.floor(headerTopPx * effectivePixelRatio));
    const headerSrcH = Math.min(canvas.height - headerSrcY, Math.ceil(headerHeight * effectivePixelRatio));

    // Per-page canvas tile slicing
    const tileCanvas = document.createElement('canvas');
    const tileCtx = tileCanvas.getContext('2d', { alpha: false });
    const headerTileCanvas = document.createElement('canvas');
    const headerTileCtx = headerTileCanvas.getContext('2d', { alpha: false });

    const totalPages = pageBreaks.length * cols;
    let pageCount = 0;

    for (let r = 0; r < pageBreaks.length; r++) {
      const pb = pageBreaks[r];
      const domSliceH = pb.domEndY - pb.domStartY;

      for (let c = 0; c < cols; c++) {
        if (pageCount > 0 || i > 0) {
          pdf.addPage(format, orientation);
        }

        const domStartX = c * usableWidthPx;
        const domEndX = Math.min(naturalWidth, (c + 1) * usableWidthPx);
        const domSliceW = domEndX - domStartX;

        const srcX = Math.floor(domStartX * effectivePixelRatio);
        const srcY = Math.floor(pb.domStartY * effectivePixelRatio);
        const srcW = Math.min(canvas.width - srcX, Math.ceil(domSliceW * effectivePixelRatio));
        const srcH = Math.min(canvas.height - srcY, Math.ceil(domSliceH * effectivePixelRatio));

        const slicePdfW =
          printScaleMode === 'fill-page'
            ? targetWidthMm
            : (domSliceW * currentScale) / PX_PER_MM;
        const slicePdfH =
          printScaleMode === 'fill-page'
            ? targetHeightMm
            : (domSliceH * currentScale) / PX_PER_MM;

        if (srcW > 0 && srcH > 0 && tileCtx) {
          tileCanvas.width = srcW;
          tileCanvas.height = srcH;
          tileCtx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
          tileCtx.fillRect(0, 0, srcW, srcH);
          tileCtx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

          const tileDataUrl = tileCanvas.toDataURL('image/jpeg', 0.88);
          pdf.addImage(tileDataUrl, 'JPEG', sideMargin, pb.actualPdfStartY, slicePdfW, slicePdfH, undefined, 'FAST');
        }

        // Add repeated header on subsequent vertical pages (r > 0), horizontally sliced to match column c
        if (r > 0 && headerHeight > 0 && headerSrcH > 0 && srcW > 0 && headerTileCtx && pb.actualPdfStartY > topMargin) {
          try {
            headerTileCanvas.width = srcW;
            headerTileCanvas.height = headerSrcH;
            headerTileCtx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
            headerTileCtx.fillRect(0, 0, srcW, headerSrcH);
            headerTileCtx.drawImage(
              canvas,
              srcX,
              headerSrcY,
              srcW,
              headerSrcH,
              0,
              0,
              srcW,
              headerSrcH
            );
            const hDataUrl = headerTileCanvas.toDataURL('image/jpeg', 0.88);
            pdf.addImage(hDataUrl, 'JPEG', sideMargin, topMargin, slicePdfW, headerPdfHeight, undefined, 'FAST');
          } catch (err) {
            console.warn('Header slice failed:', err);
          }
        }

        // Draw Filter Header
        if (printFilterHeader) {
          drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, sideMargin, isDark);
        }

        // Draw Watermark
        if (printWatermark && printWatermark !== 'none') {
          try {
            pdf.saveGraphicsState();
            pdf.setGState(new (pdf as any).GState({ opacity: 0.12 }));
            pdf.setFontSize(printOrientation === 'landscape' ? 48 : 36);
            pdf.setFont('helvetica', 'bold');
            pdf.setTextColor(150, 150, 150);
            pdf.text(
              printWatermark.toUpperCase(),
              pdfPageWidth / 2,
              pdfPageHeight / 2,
              { align: 'center', angle: 45 }
            );
            pdf.restoreGraphicsState();
          } catch {
            // Fallback
          }
        }

        // Footer & Status indicators
        const footerY = pdfPageHeight - 3.5;
        pdf.setFontSize(7.5);
        pdf.setTextColor(130, 130, 130);
        const footerLeftText = printDate
          ? `Page ${pageCount + 1} of ${totalPages} • Printed: ${new Date().toLocaleString()}`
          : `Page ${pageCount + 1} of ${totalPages}`;
        pdf.text(footerLeftText, sideMargin, footerY);

        if (activeTab === 'gantt') {
          const legends: [string, number, [number, number, number]][] = [
            ["Completed", 18, [34, 197, 94]],
            ["In Process", 24, [59, 130, 246]],
            ["Upcoming", 22, [100, 116, 139]],
          ];
          let currentLegendX = pdfPageWidth - sideMargin;
          for (const [label, offset, [rCol, gCol, bCol]] of legends) {
            currentLegendX -= offset;
            pdf.text(label, currentLegendX, footerY);
            pdf.setFillColor(rCol, gCol, bCol);
            pdf.rect(currentLegendX - 4, footerY - 2.5, 3, 3, 'F');
          }
        }
        pageCount++;
      }
    }
  }

  pdf.save(`export_${activeTab}_${Date.now()}.pdf`);
}

