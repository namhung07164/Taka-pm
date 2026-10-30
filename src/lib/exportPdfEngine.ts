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
    wsData.push(["Year", "Store", "Location", "Code", "Project", "Shop Type", "Size (m²)", "Status", "Pj Start", "Pj Compl", "Opening"]);
    sortedProjects.forEach((p) => {
      wsData.push([
        p.year || "",
        p.store || "",
        p.location || "",
        p.code,
        p.name,
        p.shopType || "",
        p.sizeM2 !== undefined && p.sizeM2 !== null ? p.sizeM2 : "",
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
    printDpi = 300,
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
  const pdf = new jsPDF({ orientation, unit: 'mm', format, compress: true });

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

    const origPageStyles = {
      width: page.style.width,
      minWidth: page.style.minWidth,
      maxWidth: page.style.maxWidth,
      height: page.style.height,
      minHeight: page.style.minHeight,
      maxHeight: page.style.maxHeight,
      overflow: page.style.overflow,
    };

    const origWrapperStyles = {
      transform: wrapper.style.transform,
      width: wrapper.style.width,
      height: wrapper.style.height,
      position: wrapper.style.position,
      overflow: wrapper.style.overflow,
      marginRight: wrapper.style.marginRight,
      marginBottom: wrapper.style.marginBottom,
    };

    const hiddenElements: { el: HTMLElement; display: string }[] = [];
    const elementsToHide = wrapper.querySelectorAll('.hide-on-actual-print, .print\\:hidden');
    elementsToHide.forEach((el: any) => {
      hiddenElements.push({ el, display: el.style.display });
      el.style.display = 'none';
    });

    // Reset scroll offsets on any internal scroll containers so header & timeline align at 0
    const savedScrolls: { el: HTMLElement; left: number; top: number; overflowX: string; overflowY: string }[] = [];
    const scrollContainers = wrapper.querySelectorAll('[data-print-header="true"], .overflow-auto, .overflow-x-auto, .overflow-x-hidden');
    scrollContainers.forEach((node) => {
      const el = node as HTMLElement;
      savedScrolls.push({
        el,
        left: el.scrollLeft,
        top: el.scrollTop,
        overflowX: el.style.overflowX,
        overflowY: el.style.overflowY,
      });
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (el.scrollTop !== 0) el.scrollTop = 0;
      el.style.overflowX = 'visible';
      el.style.overflowY = 'visible';
    });

    // Unconstrain page & wrapper to measure natural unscaled dimensions accurately
    page.style.width = 'max-content';
    page.style.minWidth = '0px';
    page.style.maxWidth = 'none';
    page.style.height = 'max-content';
    page.style.minHeight = '0px';
    page.style.maxHeight = 'none';
    page.style.overflow = 'visible';

    wrapper.style.transform = 'none';
    wrapper.style.marginRight = '0px';
    wrapper.style.marginBottom = '0px';
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

    // Calculate true physical page pixel ratio for requested DPI (compensating for downscale when fitting wide Gantt charts)
    const desiredDpi = Math.max(96, Math.min(300, printDpi || 300));
    const physicalPageTargetPxW = (targetWidthMm / 25.4) * desiredDpi;
    const scaleCompensatedRatio = physicalPageTargetPxW / Math.max(100, usableWidthPx);
    let effectivePixelRatio = Math.max(desiredDpi / 96, scaleCompensatedRatio);

    // High-DPI canvas budget (up to 28MP for 300 DPI Ultra Sharp mode)
    const maxCanvasPixels =
      desiredDpi >= 300 ? 28_000_000 : desiredDpi >= 200 ? 18_000_000 : 10_000_000;
    const maxAllowedRatio = desiredDpi >= 300 ? 4.0 : desiredDpi >= 200 ? 3.0 : 2.0;

    const requestedPixels =
      naturalWidth * effectivePixelRatio * (naturalHeight * effectivePixelRatio);
    if (requestedPixels > maxCanvasPixels) {
      effectivePixelRatio = Math.sqrt(maxCanvasPixels / (naturalWidth * naturalHeight));
    }
    // Ensure neither canvas dimension exceeds hardware texture limit (11,500px)
    const maxSidePx = 11_500;
    if (naturalWidth * effectivePixelRatio > maxSidePx) {
      effectivePixelRatio = maxSidePx / naturalWidth;
    }
    if (naturalHeight * effectivePixelRatio > maxSidePx) {
      effectivePixelRatio = Math.min(effectivePixelRatio, maxSidePx / naturalHeight);
    }
    // Snap pixelRatio to clean 0.5x steps (2.0, 2.5, 3.0, 3.5, 4.0) so 1px vertical cell borders never suffer from irrational sub-pixel Moiré aliasing
    const snappedRatio = Math.floor(Math.min(maxAllowedRatio, effectivePixelRatio) * 2) / 2;
    effectivePixelRatio = Math.max(1.0, snappedRatio);

    const htmlToImage = await import('html-to-image');
    const buildCanvasOptions = (skipFontsFlag: boolean) => ({
      width: naturalWidth,
      height: naturalHeight,
      style: {
        transform: 'none',
        marginRight: '0px',
        marginBottom: '0px',
        width: `${naturalWidth}px`,
        height: `${naturalHeight}px`,
        WebkitFontSmoothing: 'antialiased',
        textRendering: 'geometricPrecision',
      } as any,
      pixelRatio: effectivePixelRatio,
      backgroundColor: isDark ? '#1e1e20' : '#ffffff',
      skipFonts: skipFontsFlag,
      cacheBust: false,
      filter: (node: any) => {
        if (
          node.classList &&
          (node.classList.contains('hide-on-actual-print') ||
            node.classList.contains('print:hidden'))
        ) {
          return false;
        }
        return true;
      },
    });

    let canvas: HTMLCanvasElement;
    try {
      canvas = await htmlToImage.toCanvas(wrapper, buildCanvasOptions(false));
    } catch {
      canvas = await htmlToImage.toCanvas(wrapper, buildCanvasOptions(true));
    }

    // Restore wrapper, page & scroll DOM styles immediately
    wrapper.style.transform = origWrapperStyles.transform;
    wrapper.style.width = origWrapperStyles.width;
    wrapper.style.height = origWrapperStyles.height;
    wrapper.style.position = origWrapperStyles.position;
    wrapper.style.overflow = origWrapperStyles.overflow;
    wrapper.style.marginRight = origWrapperStyles.marginRight;
    wrapper.style.marginBottom = origWrapperStyles.marginBottom;

    page.style.width = origPageStyles.width;
    page.style.minWidth = origPageStyles.minWidth;
    page.style.maxWidth = origPageStyles.maxWidth;
    page.style.height = origPageStyles.height;
    page.style.minHeight = origPageStyles.minHeight;
    page.style.maxHeight = origPageStyles.maxHeight;
    page.style.overflow = origPageStyles.overflow;

    savedScrolls.forEach(({ el, left, top, overflowX, overflowY }) => {
      el.style.overflowX = overflowX;
      el.style.overflowY = overflowY;
      if (left !== 0) el.scrollLeft = left;
      if (top !== 0) el.scrollTop = top;
    });

    if (dashedOverlay) dashedOverlay.style.display = '';
    hiddenElements.forEach(({ el, display }) => {
      el.style.display = display;
    });

    const headerPdfHeight = (headerHeight * currentScale) / PX_PER_MM;
    const headerSrcY = Math.max(0, Math.floor(headerTopPx * effectivePixelRatio));
    const headerSrcH = Math.min(canvas.height - headerSrcY, Math.ceil(headerHeight * effectivePixelRatio));

    // Per-page canvas tile slicing with lossless PNG for >= 200 DPI (zero JPEG text blur)
    const useLosslessPng = desiredDpi >= 200;
    const tileMime = useLosslessPng ? 'image/png' : 'image/jpeg';
    const tileFormat = useLosslessPng ? 'PNG' : 'JPEG';

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
          tileCtx.imageSmoothingEnabled = true;
          tileCtx.imageSmoothingQuality = 'high';
          tileCtx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
          tileCtx.fillRect(0, 0, srcW, srcH);
          tileCtx.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

          const tileDataUrl = useLosslessPng
            ? tileCanvas.toDataURL('image/png')
            : tileCanvas.toDataURL(tileMime, 0.94);
          pdf.addImage(tileDataUrl, tileFormat, sideMargin, pb.actualPdfStartY, slicePdfW, slicePdfH, undefined, 'FAST');
        }

        // Add repeated header on subsequent vertical pages (r > 0), horizontally sliced to match column c
        if (r > 0 && headerHeight > 0 && headerSrcH > 0 && srcW > 0 && headerTileCtx && pb.actualPdfStartY > topMargin) {
          try {
            headerTileCanvas.width = srcW;
            headerTileCanvas.height = headerSrcH;
            headerTileCtx.imageSmoothingEnabled = true;
            headerTileCtx.imageSmoothingQuality = 'high';
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
            const hDataUrl = useLosslessPng
              ? headerTileCanvas.toDataURL('image/png')
              : headerTileCanvas.toDataURL(tileMime, 0.94);
            pdf.addImage(hDataUrl, tileFormat, sideMargin, topMargin, slicePdfW, headerPdfHeight, undefined, 'FAST');
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
