import { Project } from '../types';
import { getStatus } from './utils';
import { drawPdfFilterHeader } from './printFilterHelper';

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

const PX_PER_MM = 3.779527559; // Standard 96 DPI CSS pixel-to-millimeter factor

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
        dataUrl = stage.toDataURL({ pixelRatio: exportRatio, mimeType: 'image/jpeg', quality: 0.90 });
        imgW = (stage.width ? stage.width() : 1200) * exportRatio;
        imgH = (stage.height ? stage.height() : 800) * exportRatio;
      } else if (stageCanvas) {
        dataUrl = stageCanvas.toDataURL('image/jpeg', 0.90);
        imgW = stageCanvas.width;
        imgH = stageCanvas.height;
      }
    }

    if (dataUrl) {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation, unit: 'mm', format });

      const pdfPageWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      
      // Tight outer margin (2mm) for near 100% full paper coverage
      const margin = 2;
      let usableWidth = pdfPageWidth - margin * 2;
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

      if (isFillPage) {
        targetW = usableWidth;
        targetH = usableHeight;
        xPos = margin;
        yPos = topOffset;
      } else {
        const imgAspect = imgW / imgH;
        const pageAspect = usableWidth / usableHeight;

        if (imgAspect > pageAspect) {
          // Fits width exactly
          targetW = usableWidth;
          targetH = usableWidth / imgAspect;
        } else {
          // Fits height exactly
          targetH = usableHeight;
          targetW = usableHeight * imgAspect;
        }

        xPos = margin + (usableWidth - targetW) / 2;
        yPos = topOffset + (usableHeight - targetH) / 2;
      }

      pdf.addImage(dataUrl, 'JPEG', xPos, yPos, targetW, targetH, undefined, 'FAST');

      // Watermark
      if (printWatermark && printWatermark !== 'none') {
        try {
          pdf.saveGraphicsState();
          pdf.setGState(new (pdf as any).GState({ opacity: 0.12 }));
          pdf.setFontSize(printOrientation === 'landscape' ? 52 : 38);
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

      // Footer
      const footerY = pdfPageHeight - 3;
      pdf.setFontSize(7.5);
      pdf.setTextColor(130, 130, 130);
      let footerText = `Takashimaya PM • Layout Plan (${printFilterContext?.storeDisplay || 'HCM'} - ${printFilterContext?.yearDisplay || 'All'})`;
      if (printDate) {
        footerText += ` • Printed: ${new Date().toLocaleString()}`;
      }
      pdf.text(footerText, margin, footerY);

      pdf.save(`layout_plan_${new Date().toISOString().slice(0, 10)}_${Date.now()}.pdf`);
      return;
    }

    window.print();
    return;
  }

  const pages = document.querySelectorAll('.print-paper');
  if (pages.length === 0) return;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation, unit: 'mm', format });

  const pdfPageWidth = pdf.internal.pageSize.getWidth();
  const pdfPageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const targetWidthMm = pdfPageWidth - margin * 2;
  const targetHeightMm = pdfPageHeight - margin * 2;

  const currentScale = Math.max(0.1, Math.min(2.0, (printScale || 100) / 100));

  // Yield to avoid main thread freeze
  await new Promise(resolve => setTimeout(resolve, 30));

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

    // Calculate row boundaries for table row-split safety
    const validBoundaries = [0];
    const wrapperRect = wrapper.getBoundingClientRect();
    const thead = wrapper.querySelector('thead');
    let headerHeight = 0;
    if (thead) {
      const theadRect = thead.getBoundingClientRect();
      headerHeight = Math.max(0, theadRect.bottom - wrapperRect.top);
    }

    const trElements = Array.from(wrapper.querySelectorAll('tbody tr'));
    trElements.forEach(tr => {
      validBoundaries.push(tr.getBoundingClientRect().bottom - wrapperRect.top);
    });
    validBoundaries.push(naturalHeight);
    validBoundaries.sort((a, b) => a - b);

    // Compute exact DPI and memory-safe pixel ratio
    // Target physical dimension per page: targetWidthMm
    // Desired output width for table across pages:
    const usableWidthPx = (targetWidthMm * PX_PER_MM) / currentScale;
    const usableHeightPx = (targetHeightMm * PX_PER_MM) / currentScale;
    const cols = Math.max(1, Math.ceil((naturalWidth - 2) / usableWidthPx));

    // Calculate optimal pixelRatio for requested DPI without memory bloat
    const desiredDpi = Math.max(96, Math.min(300, printDpi || 150));
    // Physical print resolution ratio relative to 96 DPI
    let effectivePixelRatio = desiredDpi / 96;

    // Safety cap: max 6,000,000 pixels on master canvas to guarantee instant rendering & 0 lag
    const MAX_CANVAS_PIXELS = 6_000_000;
    const requestedPixels = naturalWidth * effectivePixelRatio * naturalHeight * effectivePixelRatio;
    if (requestedPixels > MAX_CANVAS_PIXELS) {
      effectivePixelRatio = Math.sqrt(MAX_CANVAS_PIXELS / (naturalWidth * naturalHeight));
    }
    effectivePixelRatio = Math.max(0.65, Math.min(2.0, effectivePixelRatio));

    // High-speed lightweight DOM capture (skipFonts = true eliminates heavy font blocking)
    const htmlToImage = await import('html-to-image');
    const canvas = await htmlToImage.toCanvas(wrapper, {
      width: naturalWidth,
      height: naturalHeight,
      style: {
        transform: 'none',
        width: `${naturalWidth}px`,
        height: `${naturalHeight}px`
      },
      pixelRatio: effectivePixelRatio,
      backgroundColor: isDark ? '#1e1e20' : '#ffffff',
      skipFonts: true, // Crucial for instant rendering & avoiding lag
      cacheBust: false,
      filter: (node) => {
        if (node.classList && (node.classList.contains('hide-on-actual-print') || node.classList.contains('print:hidden'))) {
          return false;
        }
        return true;
      }
    });

    // Extract table header slice for multi-row repeating headers
    let headerDataUrl: string | null = null;
    const headerScaledHeight = Math.round(headerHeight * effectivePixelRatio);
    if (headerHeight > 0 && headerScaledHeight > 0 && headerHeight < naturalHeight) {
      try {
        const headerCanvas = document.createElement('canvas');
        headerCanvas.width = canvas.width;
        headerCanvas.height = headerScaledHeight;
        const hCtx = headerCanvas.getContext('2d', { alpha: false });
        if (hCtx) {
          hCtx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
          hCtx.fillRect(0, 0, headerCanvas.width, headerCanvas.height);
          hCtx.drawImage(
            canvas,
            0, 0, canvas.width, headerScaledHeight,
            0, 0, headerCanvas.width, headerCanvas.height
          );
          headerDataUrl = headerCanvas.toDataURL('image/jpeg', 0.85);
        }
      } catch (err) {
        console.warn('Header slice failed:', err);
      }
    }

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

    // Calculate vertical page breaks based on row boundaries
    const headerPdfHeight = (headerHeight * currentScale) / PX_PER_MM;
    const pageBreaks: { domStartY: number; domEndY: number; actualPdfStartY: number }[] = [];
    let domStartY = 0;

    while (domStartY < naturalHeight - 0.5) {
      let domEndY_theoretical: number;
      let actualPdfStartY: number;

      if (pageBreaks.length === 0) {
        domEndY_theoretical = domStartY + usableHeightPx;
        actualPdfStartY = margin;
      } else {
        domEndY_theoretical = domStartY + usableHeightPx - headerHeight;
        actualPdfStartY = margin + headerPdfHeight;
      }

      if (domEndY_theoretical >= naturalHeight) {
        pageBreaks.push({
          domStartY,
          domEndY: naturalHeight,
          actualPdfStartY
        });
        break;
      }

      let breakY = domStartY;
      for (let j = 0; j < validBoundaries.length; j++) {
        if (validBoundaries[j] > domStartY && validBoundaries[j] <= domEndY_theoretical + 1) {
          breakY = validBoundaries[j];
        }
      }

      if (breakY === domStartY) {
        breakY = domEndY_theoretical;
      }

      pageBreaks.push({
        domStartY,
        domEndY: breakY,
        actualPdfStartY
      });

      domStartY = breakY;
    }

    // Per-page canvas tile slicing (Ultra-lightweight memory, instant PDF build)
    const tileCanvas = document.createElement('canvas');
    const tileCtx = tileCanvas.getContext('2d', { alpha: false });
    const totalPages = pageBreaks.length * cols;
    let pageCount = 0;

    for (let r = 0; r < pageBreaks.length; r++) {
      const pb = pageBreaks[r];
      const domSliceH = pb.domEndY - pb.domStartY;

      for (let c = 0; c < cols; c++) {
        if (pageCount > 0) {
          pdf.addPage(format, orientation);
        }

        const domStartX = c * usableWidthPx;
        const domEndX = Math.min(naturalWidth, (c + 1) * usableWidthPx);
        const domSliceW = domEndX - domStartX;

        const srcX = Math.floor(domStartX * effectivePixelRatio);
        const srcY = Math.floor(pb.domStartY * effectivePixelRatio);
        const srcW = Math.min(canvas.width - srcX, Math.ceil(domSliceW * effectivePixelRatio));
        const srcH = Math.min(canvas.height - srcY, Math.ceil(domSliceH * effectivePixelRatio));

        const slicePdfW = (domSliceW * currentScale) / PX_PER_MM;
        const slicePdfH = (domSliceH * currentScale) / PX_PER_MM;

        if (srcW > 0 && srcH > 0 && tileCtx) {
          tileCanvas.width = srcW;
          tileCanvas.height = srcH;
          tileCtx.fillStyle = isDark ? '#1e1e20' : '#ffffff';
          tileCtx.fillRect(0, 0, srcW, srcH);
          tileCtx.drawImage(
            canvas,
            srcX, srcY, srcW, srcH,
            0, 0, srcW, srcH
          );

          const tileDataUrl = tileCanvas.toDataURL('image/jpeg', 0.86);
          pdf.addImage(tileDataUrl, 'JPEG', margin, pb.actualPdfStartY, slicePdfW, slicePdfH, undefined, 'FAST');
        }

        // Add repeated header on subsequent rows (r > 0)
        if (r > 0 && headerDataUrl) {
          pdf.addImage(headerDataUrl, 'JPEG', margin, margin, slicePdfW, headerPdfHeight, undefined, 'FAST');
        }

        // Draw Filter Header
        if (printFilterHeader) {
          drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, margin, isDark);
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
        const footerY = pdfPageHeight - 4;
        pdf.setFontSize(7.5);
        pdf.setTextColor(130, 130, 130);
        let footerLeftText = `Page ${pageCount + 1} of ${totalPages}`;
        if (printDate) {
          footerLeftText += ` • Printed: ${new Date().toLocaleString()}`;
        }
        pdf.text(footerLeftText, margin, footerY);

        // Status Indicators for Gantt
        if (activeTab === 'gantt') {
          let currentLegendX = pdfPageWidth - margin - 18;
          pdf.text("Completed", currentLegendX, footerY);
          pdf.setFillColor(34, 197, 94);
          pdf.rect(currentLegendX - 4, footerY - 2.5, 3, 3, 'F');

          currentLegendX -= 24;
          pdf.text("In Process", currentLegendX, footerY);
          pdf.setFillColor(59, 130, 246);
          pdf.rect(currentLegendX - 4, footerY - 2.5, 3, 3, 'F');

          currentLegendX -= 22;
          pdf.text("Upcoming", currentLegendX, footerY);
          pdf.setFillColor(100, 116, 139);
          pdf.rect(currentLegendX - 4, footerY - 2.5, 3, 3, 'F');
        }

        pageCount++;
      }
    }
  }

  pdf.save(`export_${activeTab}_${Date.now()}.pdf`);
}
