import { Project } from '../types';
import { getStatus } from './utils';
import { drawPdfFilterHeader } from './printFilterHelper';
import { useAppStore } from '../store/useAppStore';

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
    printDpi,
    printScaleMode,
    printScale,
    printWidth,
    printHeight,
    printFilterHeader,
    printFilterContext,
    printDate,
    printWatermark,
  } = options;

  if (activeTab === 'layout') {
    const stage = (window as any).__taka_layout_stage;
    const stageCanvas = document.querySelector('#live-layout-canvas-container canvas') as HTMLCanvasElement;

    let dataUrl: string | null = null;
    let imgW = 1200;
    let imgH = 800;

    if (stage && typeof stage.toDataURL === 'function') {
      const exportRatio = Math.min(3, Math.max(1.5, printDpi / 96));
      dataUrl = stage.toDataURL({ pixelRatio: exportRatio });
      imgW = (stage.width ? stage.width() : 1200) * exportRatio;
      imgH = (stage.height ? stage.height() : 800) * exportRatio;
    } else if (stageCanvas) {
      dataUrl = stageCanvas.toDataURL('image/jpeg', 0.95);
      imgW = stageCanvas.width;
      imgH = stageCanvas.height;
    }

    if (dataUrl) {
      const orientation = printOrientation === "landscape" ? "l" : "p";
      const format = printPaperSize.toLowerCase();

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation,
        unit: 'mm',
        format
      });

      const pdfPageWidth = pdf.internal.pageSize.getWidth();
      const pdfPageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;
      const usableWidth = pdfPageWidth - margin * 2;
      let usableHeight = pdfPageHeight - margin * 2;
      let topOffset = margin;

      // Filter Header
      if (printFilterHeader) {
        drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, margin, false);
        topOffset += 14;
        usableHeight -= 14;
      }

      // Date & footer spacing
      if (printDate) {
        usableHeight -= 8;
      }

      // Compute exact aspect ratio fit to 1 page
      const imgAspect = imgW / imgH;
      const pageAspect = usableWidth / usableHeight;

      let targetW = usableWidth;
      let targetH = usableHeight;

      if (imgAspect > pageAspect) {
        targetW = usableWidth;
        targetH = usableWidth / imgAspect;
      } else {
        targetH = usableHeight;
        targetW = usableHeight * imgAspect;
      }

      const xPos = margin + (usableWidth - targetW) / 2;
      const yPos = topOffset + (usableHeight - targetH) / 2;

      pdf.addImage(dataUrl, 'JPEG', xPos, yPos, targetW, targetH, undefined, 'FAST');

      // Watermark
      if (printWatermark && printWatermark !== 'none') {
        try {
          pdf.saveGraphicsState();
          pdf.setGState(new (pdf as any).GState({ opacity: 0.15 }));
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
          pdf.setFontSize(printOrientation === 'landscape' ? 52 : 38);
          pdf.setFont('helvetica', 'bold');
          pdf.setTextColor(220, 220, 220);
          pdf.text(
            printWatermark.toUpperCase(),
            pdfPageWidth / 2,
            pdfPageHeight / 2,
            { align: 'center', angle: 45 }
          );
        }
      }

      // Footer info
      const footerY = pdfPageHeight - 4;
      pdf.setFontSize(7.5);
      pdf.setTextColor(130, 130, 130);
      let footerText = `Takashimaya PM • Layout Plan (${printFilterContext.storeDisplay || 'HCM'} - ${printFilterContext.yearDisplay || 'All'})`;
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
  if (pages.length === 0) {
    return;
  }

  const orientation = printOrientation === "landscape" ? "l" : "p";
  const format = printPaperSize.toLowerCase();

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format
  });

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i] as HTMLElement;
    const wrapper = page.querySelector('.print-content-wrapper') as HTMLElement;

    // Hide the dashed line overlay during capture
    const dashedOverlay = wrapper.querySelector('.hide-on-actual-print') as HTMLElement;
    if (dashedOverlay) dashedOverlay.style.display = 'none';

    const originalTransform = wrapper.style.transform;
    const originalWidth = wrapper.style.width;
    const originalHeight = wrapper.style.height;
    const originalWrapperPos = wrapper.style.position;
    const originalWrapperOverflow = wrapper.style.overflow;

    // Hide print:hidden elements BEFORE any measuring
    const hiddenElements: { el: HTMLElement; display: string }[] = [];
    const elementsToHide = wrapper.querySelectorAll('.hide-on-actual-print, .print\\:hidden');
    elementsToHide.forEach((el: any) => {
      hiddenElements.push({ el, display: el.style.display });
      el.style.display = 'none';
    });

    // Remove scale to let it assume its natural unscaled size
    wrapper.style.transform = 'none';
    wrapper.style.width = 'max-content';
    wrapper.style.height = 'max-content';
    wrapper.style.position = 'static';
    wrapper.style.overflow = 'visible';

    // Force reflow
    const naturalWidth = wrapper.scrollWidth;
    const naturalHeight = wrapper.scrollHeight;

    wrapper.style.width = naturalWidth + 'px';
    wrapper.style.height = naturalHeight + 'px';

    // Calculate header height and valid boundaries while wrapper is fully expanded
    const validBoundaries = [0];
    const wrapperRect = wrapper.getBoundingClientRect();

    const thead = wrapper.querySelector('thead');
    let headerHeight = wrapper.scrollHeight;
    if (thead) {
      const theadRect = thead.getBoundingClientRect();
      headerHeight = theadRect.bottom - wrapperRect.top;
    }

    const trElements = Array.from(wrapper.querySelectorAll('tbody tr'));
    trElements.forEach(tr => {
      validBoundaries.push(tr.getBoundingClientRect().bottom - wrapperRect.top);
    });
    validBoundaries.push(naturalHeight);
    validBoundaries.sort((a, b) => a - b);

    const originalPageOverflow = page.style.overflow;
    page.style.overflow = 'visible';

    // Capture full content
    const htmlToImage = await import('html-to-image');
    const dataUrl = await htmlToImage.toJpeg(wrapper, {
      width: naturalWidth,
      height: naturalHeight,
      style: {
        transform: 'none',
        width: naturalWidth + 'px',
        height: naturalHeight + 'px'
      },
      quality: 0.7,
      pixelRatio: Math.min(2, printDpi / 96),
      backgroundColor: document.documentElement.classList.contains('dark') ? '#1e1e20' : '#ffffff',
      skipFonts: false,
      filter: (node) => {
        if (node.classList && node.classList.contains('hide-on-actual-print')) return false;
        if (node.classList && node.classList.contains('print:hidden')) return false;
        return true;
      }
    });

    // Capture header
    const tbody = wrapper.querySelector('tbody');
    const originalTbodyDisplay = tbody ? tbody.style.display : '';
    if (tbody) tbody.style.display = 'none';

    const headerDataUrl = await htmlToImage.toJpeg(wrapper, {
      width: naturalWidth,
      height: headerHeight,
      style: {
        transform: 'none',
        width: naturalWidth + 'px',
        height: headerHeight + 'px'
      },
      quality: 0.7,
      pixelRatio: Math.min(2, printDpi / 96),
      backgroundColor: document.documentElement.classList.contains('dark') ? '#1e1e20' : '#ffffff',
      skipFonts: false,
      filter: (node) => {
        if (node.classList && node.classList.contains('hide-on-actual-print')) return false;
        if (node.classList && node.classList.contains('print:hidden')) return false;
        return true;
      }
    });

    if (tbody) tbody.style.display = originalTbodyDisplay;

    // Restore everything
    wrapper.style.transform = originalTransform;
    wrapper.style.width = originalWidth;
    wrapper.style.height = originalHeight;
    wrapper.style.position = originalWrapperPos;
    wrapper.style.overflow = originalWrapperOverflow;
    page.style.overflow = originalPageOverflow;

    if (dashedOverlay) dashedOverlay.style.display = '';

    hiddenElements.forEach(({ el, display }) => {
      el.style.display = display;
    });

    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();

    // Calculate slicing
    const usableWidthPx = (printWidth - 20) * 3.78 / (printScale / 100);
    const usableHeightPx = (printHeight - 20) * 3.78 / (printScale / 100);

    const wrapperActualWidth = naturalWidth;
    const wrapperActualHeight = naturalHeight;

    let scaleAdjustment = 1;

    if (printScaleMode === 'fit-page') {
      scaleAdjustment = Math.max(1, wrapperActualWidth / usableWidthPx, wrapperActualHeight / usableHeightPx);
    } else if (printScaleMode === 'fit-cols') {
      scaleAdjustment = Math.max(1, wrapperActualWidth / usableWidthPx);
    } else if (printScaleMode === 'fit-rows') {
      scaleAdjustment = Math.max(1, wrapperActualHeight / usableHeightPx);
    }

    const finalUsableWidthPx = usableWidthPx * scaleAdjustment;
    const finalUsableHeightPx = usableHeightPx * scaleAdjustment;

    const cols = Math.max(1, Math.ceil(wrapperActualWidth / finalUsableWidthPx - 0.05));

    const pageBreaks = [];
    let domStartY = 0;
    const targetHeightForScale = pdfPageHeight - 20;
    const scaleY = targetHeightForScale / finalUsableHeightPx;
    const headerPdfHeight = headerHeight * scaleY;

    while (domStartY < wrapperActualHeight - 0.5) {
      let domEndY_theoretical: number;
      let actualPdfStartY: number;

      if (pageBreaks.length === 0) {
        domEndY_theoretical = domStartY + finalUsableHeightPx;
        actualPdfStartY = 10;
      } else {
        domEndY_theoretical = domStartY + finalUsableHeightPx - headerHeight;
        actualPdfStartY = 10 + headerPdfHeight;
      }

      if (domEndY_theoretical >= wrapperActualHeight) {
        pageBreaks.push({
          domStartY,
          domEndY: wrapperActualHeight,
          actualPdfStartY,
          eraseStartPdf: null as number | null
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

      const actualPdfEndY = actualPdfStartY + (breakY - domStartY) * scaleY;

      pageBreaks.push({
        domStartY,
        domEndY: breakY,
        actualPdfStartY,
        eraseStartPdf: actualPdfEndY as number | null
      });

      domStartY = breakY;
    }

    let pageCount = 0;
    for (let r = 0; r < pageBreaks.length; r++) {
      const pb = pageBreaks[r];
      for (let c = 0; c < cols; c++) {
        if (pageCount > 0) {
          pdf.addPage(format, orientation);
        }

        const margin = 10;
        const targetWidth = pdfPageWidth - margin * 2;
        const targetHeight = pdfPageHeight - margin * 2;

        const totalPdfWidth = (wrapperActualWidth / finalUsableWidthPx) * targetWidth;
        const totalPdfHeight = (wrapperActualHeight / finalUsableHeightPx) * targetHeight;

        const xOffset = margin - (c * targetWidth);
        const yOffset = pb.actualPdfStartY - (pb.domStartY * scaleY);

        pdf.addImage(dataUrl, 'JPEG', xOffset, yOffset, totalPdfWidth, totalPdfHeight);

        if (pb.eraseStartPdf) {
          const eraseHeight = pdfPageHeight - pb.eraseStartPdf;
          if (document.documentElement.classList.contains('dark')) {
            pdf.setFillColor(30, 30, 32);
          } else {
            pdf.setFillColor(255, 255, 255);
          }
          pdf.rect(0, pb.eraseStartPdf - 0.2, pdfPageWidth, eraseHeight + 2, 'F');
        }

        if (!pb.eraseStartPdf || pb.eraseStartPdf > margin + targetHeight) {
          if (document.documentElement.classList.contains('dark')) {
            pdf.setFillColor(30, 30, 32);
          } else {
            pdf.setFillColor(255, 255, 255);
          }
          pdf.rect(0, margin + targetHeight, pdfPageWidth, pdfPageHeight - (margin + targetHeight), 'F');
        }

        if (document.documentElement.classList.contains('dark')) {
          pdf.setFillColor(30, 30, 32);
        } else {
          pdf.setFillColor(255, 255, 255);
        }
        pdf.rect(0, 0, pdfPageWidth, margin, 'F');

        if (printFilterHeader) {
          const isDark = document.documentElement.classList.contains('dark');
          drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, margin, isDark);
        }

        if (r > 0) {
          pdf.addImage(headerDataUrl, 'JPEG', xOffset, margin, totalPdfWidth, headerPdfHeight);
        }

        // Draw Legend
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        const legendY = pdfPageHeight - 4;

        // Footer Left info
        pdf.setFontSize(7.5);
        pdf.setTextColor(130, 130, 130);
        let footerLeftText = `Page ${pageCount + 1} of ${pageBreaks.length * cols}`;
        if (printDate) {
          footerLeftText += ` • Printed: ${new Date().toLocaleString()}`;
        }
        pdf.text(footerLeftText, margin, legendY);

        // Status Indicators
        let currentLegendX = pdfPageWidth - margin - 18;
        pdf.text("Completed", currentLegendX, legendY);
        pdf.setFillColor(34, 197, 94);
        pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

        currentLegendX -= 24;
        pdf.text("In Process", currentLegendX, legendY);
        pdf.setFillColor(59, 130, 246);
        pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

        currentLegendX -= 22;
        pdf.text("Upcoming", currentLegendX, legendY);
        pdf.setFillColor(100, 116, 139);
        pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

        pageCount++;
      }
    }
  }

  pdf.save(`gantt_chart_${Date.now()}.pdf`);
}
