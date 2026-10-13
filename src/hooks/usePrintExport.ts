import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import { useMemo } from 'react';
import { parseDateTime, getStatus } from "../lib/utils";
import { useAppStore } from "../store/useAppStore";
import { getPrintFilterContext, drawPdfFilterHeader } from "../lib/printFilterHelper";

export function usePrintExport(printFilteredData: any) {
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const setIsPrintPreview = useAppStore(state => state.setIsPrintPreview);
  const printOrientation = useAppStore(state => state.printOrientation);
  const printPaperSize = useAppStore(state => state.printPaperSize);
  const printDate = useAppStore(state => state.printDate);
  const printFilterHeader = useAppStore(state => state.printFilterHeader);
  const printScaleMode = useAppStore(state => state.printScaleMode);
  const printScaleCustom = useAppStore(state => state.printScaleCustom);
  const printDpi = useAppStore(state => state.printDpi);
  const printWatermark = useAppStore(state => state.printWatermark);
  const printTarget = useAppStore(state => state.printTarget);
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

    if (printRangeType === "custom") {
       if (printStartDate) { minDate = parseDateTime(printStartDate) || new Date(); hasDates = true; }
       if (printEndDate) { maxDate = parseDateTime(printEndDate) || new Date(); hasDates = true; }
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
        projectTasks.forEach(t => {
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

  const printScale = useMemo(() => {
    if (printScaleMode === "default") return 100;
    if (printScaleMode === "custom") return printScaleCustom;

    const { sortedProjects, tasksByProj, expanded } = printFilteredData;
    const { minDate, maxDate } = printDates;

    let estimatedGanttWidth = 0;
    let estimatedGanttHeight = 0;

    if (printScaleMode === "fit-cols" || printScaleMode === "fit-page") {
       const savedDayWidth = safeGetItemLocal("taka_gantt_day_width");
       const currentDayWidth = savedDayWidth ? Math.round(parseFloat(savedDayWidth)) : 4;
       
       const savedSideWidth = safeGetItemLocal("taka_gantt_side_width");
       const currentSideWidth = savedSideWidth ? parseInt(savedSideWidth, 10) : 300;
       
       const savedCols = safeGetItemLocal("taka_gantt_columns");
       let visibleCols: string[] = [];
       try { visibleCols = savedCols ? JSON.parse(savedCols) : []; } catch (e) {}
       const safeColumns = visibleCols || [];
       
       const startColWidth = safeGetItemLocal("taka_gantt_start_width") ? parseInt(safeGetItemLocal("taka_gantt_start_width")!, 10) : 110;
       const finishColWidth = safeGetItemLocal("taka_gantt_finish_width") ? parseInt(safeGetItemLocal("taka_gantt_finish_width")!, 10) : 110;
       const partyColWidth = safeGetItemLocal("taka_gantt_party_width") ? parseInt(safeGetItemLocal("taka_gantt_party_width")!, 10) : 95;
       const durationColWidth = safeGetItemLocal("taka_gantt_duration_width") ? parseInt(safeGetItemLocal("taka_gantt_duration_width")!, 10) : 60;
       
       const dateColsWidth = 
         (safeColumns.includes("start") ? startColWidth : 0) +
         (safeColumns.includes("finish") ? finishColWidth : 0) +
         (safeColumns.includes("party") ? partyColWidth : 0) +
         (safeColumns.includes("duration") ? durationColWidth : 0);
         
       const leftAreaWidth = currentSideWidth + dateColsWidth;

       const totalDays = Math.round((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
       estimatedGanttWidth = leftAreaWidth + (totalDays * currentDayWidth);
    }
    
    if (printScaleMode === "fit-rows" || printScaleMode === "fit-page") {
       estimatedGanttHeight = 160; 
       sortedProjects.forEach(p => {
         const pKey = `${p.code || ""}-${p.year || ""}-${p.store || ""}`;
         let itemHeight = 44; 
         if (expanded.includes(String(p.no))) {
            const tCount = (tasksByProj.get(pKey) || []).length;
            itemHeight += (tCount * 32); 
         }
         estimatedGanttHeight += itemHeight;
       });
    }

    if (printScaleMode === "fit-cols") {
       const targetWidthPx = (printWidth - 20) * 3.78;
       const scale = Math.floor((targetWidthPx / estimatedGanttWidth) * 100);
       return Math.max(10, Math.min(scale, 100));
    }
    
    if (printScaleMode === "fit-rows") {
       const targetHeightPx = (printHeight - 20) * 3.78;
       const scale = Math.floor((targetHeightPx / estimatedGanttHeight) * 100);
       return Math.max(10, Math.min(scale, 100));
    }
    
    if (printScaleMode === "fit-page") {
       const targetWidthPx = (printWidth - 20) * 3.78;
       const scaleCols = Math.floor((targetWidthPx / estimatedGanttWidth) * 100);
       
       const targetHeightPx = (printHeight - 20) * 3.78;
       const scaleRows = Math.floor((targetHeightPx / estimatedGanttHeight) * 100);
       
       return Math.max(10, Math.min(scaleCols, scaleRows, 100));
    }

    return 100;
  }, [printScaleMode, printScaleCustom, printWidth, printHeight, printFilteredData, printDates]);

  const ganttPrintPages = useMemo(() => {
    if (!isPrintPreview || activeTab !== "gantt") return null;
    return [{
       projects: printFilteredData.sortedProjects,
       dateRange: { start: new Date(printDates.minDate), end: new Date(printDates.maxDate) }
    }];
  }, [isPrintPreview, activeTab, printFilteredData, printDates]);

  
  
  const handleExportToExcel = async () => {
    if (isExportingPDF || activeTab === 'gantt') return;
    setIsExportingPDF(true);

    await new Promise(resolve => setTimeout(resolve, 150));
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();


      if (activeTab === 'general') {
        const wsData = [];
        wsData.push(["Year", "Store", "Location", "Code", "Project", "Status", "Pj Start", "Pj Compl", "Opening"]);
        printFilteredData.sortedProjects.forEach((p) => {
          wsData.push([
            p.year || "", p.store || "", p.location || "", p.code, p.name, 
            getStatus(p.computedTakStart, p.computedTakCompl, p.computedOpening || p.opening, p.code),
            p.computedTakStart ? p.computedTakStart.substring(0,10) : "",
            p.computedTakCompl ? p.computedTakCompl.substring(0,10) : "",
            (p.computedOpening || p.opening) ? (p.computedOpening || p.opening).substring(0,10) : ""
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

      XLSX.writeFile(wb, `export_${activeTab}_${new Date().getTime()}.xlsx`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsExportingPDF(false);
    }
  };

const handlePrintToPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    
    // Allow UI to render the spinner before blocking the thread
    await new Promise(resolve => setTimeout(resolve, 150));
    
    try {
      const state = useAppStore.getState();
      const printFilterContext = getPrintFilterContext({
        activeTab: 'layout',
        globalStoreFilter: state.globalStoreFilter,
        globalYearFilter: state.globalYearFilter,
        currentUser: state.currentUser,
        detailTabFilterCode: state.detailTabFilterCode,
        layoutTabFilters: state.layoutTabFilters,
      });

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
          
          const { jsPDF } = await import("jspdf");
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
            const isDark = false;
            drawPdfFilterHeader(pdf, printFilterContext, pdfPageWidth, margin, isDark);
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
            } catch (e) {
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

          pdf.save(`layout_plan_${new Date().toISOString().slice(0, 10)}_${new Date().getTime()}.pdf`);
          setIsExportingPDF(false);
          return;
        }

        window.print();
        setIsExportingPDF(false);
        return;
      }

      const pages = document.querySelectorAll('.print-paper');
      if (pages.length === 0) {
        setIsExportingPDF(false);
        return;
      }
      
      const orientation = printOrientation === "landscape" ? "l" : "p";
      const format = printPaperSize.toLowerCase();
      
      const { jsPDF } = await import("jspdf");
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
        
        // CRITICAL FIX: Hide print:hidden elements BEFORE any measuring
        const hiddenElements: { el: HTMLElement, display: string }[] = [];
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
        let naturalWidth = wrapper.scrollWidth;
        let naturalHeight = wrapper.scrollHeight;
        
        // CRITICAL FIX: To ensure DOM measurements exactly match what htmlToImage will render,
        // we must explicitly set the exact pixel dimensions on the live DOM before measuring!
        wrapper.style.width = naturalWidth + 'px';
        wrapper.style.height = naturalHeight + 'px';
        
        // Calculate header height and valid boundaries while wrapper is fully expanded
        const validBoundaries = [0];
        const wrapperRect = wrapper.getBoundingClientRect();
        
        const thead = wrapper.querySelector('thead');
        let headerHeight = wrapper.scrollHeight; // fallback
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
                const dataUrl = await (await import("html-to-image")).toJpeg(wrapper, {
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
        
                      const headerDataUrl = await (await import("html-to-image")).toJpeg(wrapper, {
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
        
        // Restore hidden elements
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
        
        // Adjust usable dimensions by the SAME factor to preserve aspect ratio
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

        // Calculate columns
        const cols = Math.max(1, Math.ceil(wrapperActualWidth / finalUsableWidthPx - 0.05));
        
        const pageBreaks = [];
        let domStartY = 0;
        const targetHeightForScale = pdfPageHeight - 20;
        const scaleY = targetHeightForScale / finalUsableHeightPx;
        const headerPdfHeight = headerHeight * scaleY;

        while (domStartY < wrapperActualHeight - 0.5) {
            let domEndY_theoretical;
            let actualPdfStartY;
            
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
                    eraseStartPdf: null
                });
                break;
            }
            
            let breakY = domStartY;
            for (let i=0; i<validBoundaries.length; i++) {
                if (validBoundaries[i] > domStartY && validBoundaries[i] <= domEndY_theoretical + 1) {
                    breakY = validBoundaries[i];
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
                eraseStartPdf: actualPdfEndY
            });
            
            domStartY = breakY;
        }
        
        // Render each slice
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
            
            // Map pb.domStartY to pb.actualPdfStartY
            // Add a tiny 2px safety buffer to prevent the header from overlapping the row due to subpixel rendering
            const yOffset = pb.actualPdfStartY - (pb.domStartY * scaleY);
            
            pdf.addImage(dataUrl, 'JPEG', xOffset, yOffset, totalPdfWidth, totalPdfHeight);
            
            if (pb.eraseStartPdf) {
                // ERASE ALL THE WAY TO THE BOTTOM OF THE PAGE
                const eraseHeight = pdfPageHeight - pb.eraseStartPdf;
                if (document.documentElement.classList.contains('dark')) {
                    pdf.setFillColor(30, 30, 32); // #1e1e20
                } else {
                    pdf.setFillColor(255, 255, 255); // #ffffff
                }
                // Also erase the left and right margins to be safe, just erase everything below eraseStartPdf
                pdf.rect(0, pb.eraseStartPdf - 0.2, pdfPageWidth, eraseHeight + 2, 'F');
            }
            
            // ALWAYS erase the bottom margin even if we don't have eraseStartPdf
            if (!pb.eraseStartPdf || pb.eraseStartPdf > margin + targetHeight) {
                if (document.documentElement.classList.contains('dark')) {
                    pdf.setFillColor(30, 30, 32); // #1e1e20
                } else {
                    pdf.setFillColor(255, 255, 255); // #ffffff
                }
                pdf.rect(0, margin + targetHeight, pdfPageWidth, pdfPageHeight - (margin + targetHeight), 'F');
            }
            
            // ALWAYS erase the top margin
            if (document.documentElement.classList.contains('dark')) {
                pdf.setFillColor(30, 30, 32); // #1e1e20
            } else {
                pdf.setFillColor(255, 255, 255); // #ffffff
            }
            pdf.rect(0, 0, pdfPageWidth, margin, 'F');
            
            // Draw Dynamic Filter Header (Store, Year, Project Code)
            if (printFilterHeader) {
                const isDark = document.documentElement.classList.contains('dark');
                const filterContext = getPrintFilterContext({
                  activeTab,
                  globalStoreFilter: useAppStore.getState().globalStoreFilter,
                  globalYearFilter: useAppStore.getState().globalYearFilter,
                  currentUser: useAppStore.getState().currentUser,
                  detailTabFilterCode: useAppStore.getState().detailTabFilterCode,
                                    layoutTabFilters: useAppStore.getState().layoutTabFilters,
                });
                drawPdfFilterHeader(pdf, filterContext, pdfPageWidth, margin, isDark);
            }
            
            if (r > 0) {
               // Draw the header overlay
               pdf.addImage(headerDataUrl, 'JPEG', xOffset, margin, totalPdfWidth, headerPdfHeight);
            }
            
            // Draw Legend
            pdf.setFontSize(8);
            pdf.setTextColor(100, 100, 100);
            const legendY = pdfPageHeight - 4;

            // Footer Left info (Page number & Print date)
            pdf.setFontSize(7.5);
            pdf.setTextColor(130, 130, 130);
            let footerLeftText = `Page ${pageCount + 1} of ${pageBreaks.length * cols}`;
            if (printDate) {
              footerLeftText += ` • Printed: ${new Date().toLocaleString()}`;
            }
            pdf.text(footerLeftText, margin, legendY);
            
            // Completed
            let currentLegendX = pdfPageWidth - margin - 18;
            pdf.text("Completed", currentLegendX, legendY);
            pdf.setFillColor(34, 197, 94); // Green 500
            pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

            // In Process
            currentLegendX -= 24;
            pdf.text("In Process", currentLegendX, legendY);
            pdf.setFillColor(59, 130, 246); // Blue 500
            pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

            // Upcoming
            currentLegendX -= 22;
            pdf.text("Upcoming", currentLegendX, legendY);
            pdf.setFillColor(100, 116, 139); // Slate 500
            pdf.rect(currentLegendX - 4, legendY - 2.5, 3, 3, 'F');

            
            pageCount++;
          }
        }
      }
      
      pdf.save(`gantt_chart_${new Date().getTime()}.pdf`);
    } catch (err) {
      console.error("Export to PDF failed:", err);
      useAppStore.getState().setToast({ title: "Error", message: "PDF export failed. Please try again." });
    } finally {
      setIsExportingPDF(false);
    }
  };




  return {
    printDates,
    printScale,
    ganttPrintPages,
    handleExportToExcel,
    handlePrintToPDF
  };
}
