import { drawPdfFilterHeader } from '../printFilterHelper';

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
      const exportRatio = Math.min(3.0, Math.max(1.0, printDpi / 96));
      dataUrl = stage.toDataURL({ pixelRatio: exportRatio, mimeType: 'image/jpeg', quality: 0.94 });
      imgW = (stage.width ? stage.width() : 1200) * exportRatio;
      imgH = (stage.height ? stage.height() : 800) * exportRatio;
    } else if (stageCanvas) {
      dataUrl = stageCanvas.toDataURL('image/jpeg', 0.94);
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

      const hasTotalRow =
        Array.isArray(legendBridge.activeGroups) && legendBridge.activeGroups.length > 1;
      const totalUnits = hasTotalRow
        ? legendBridge.activeGroups.reduce((acc: number, g: any) => acc + Number(g.matchCount || 0), 0)
        : 0;
      const totalArea = hasTotalRow
        ? legendBridge.activeGroups.reduce((acc: number, g: any) => acc + Number(g.totalArea || 0), 0)
        : 0;

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      const maxItemWidth = items.reduce((maxW, it) => {
        const w = pdf.getTextWidth(it.label) + 8;
        return Math.max(maxW, w);
      }, 48);

      const relRect =
        typeof legendBridge.getRelativeRect === 'function' ? legendBridge.getRelativeRect() : null;

      const defaultBoxW = Math.min(targetW * 0.48, Math.max(54, maxItemWidth + 6));
      const defaultRowH = 4.4;
      const defaultBoxH = 8 + items.length * defaultRowH + (hasTotalRow ? 5.2 : 1.8);

      let boxW = relRect && relRect.relW > 0.05 ? relRect.relW * targetW : defaultBoxW;
      let boxH = relRect && relRect.relH > 0.03 ? relRect.relH * targetH : defaultBoxH;
      boxW = Math.max(boxW, Math.min(targetW * 0.65, maxItemWidth + 5));

      let boxX = xPos + 4;
      let boxY = yPos + targetH - boxH - 4;
      if (relRect) {
        boxX = xPos + relRect.relX * targetW;
        boxY = yPos + relRect.relY * targetH;
        boxX = Math.max(xPos, Math.min(xPos + targetW - boxW, boxX));
        boxY = Math.max(yPos, Math.min(yPos + targetH - boxH, boxY));
      }

      const scaleFactor = Math.max(0.72, Math.min(1.35, boxH / Math.max(1, defaultBoxH)));
      const headerH = 6.2 * scaleFactor;
      const footerH = hasTotalRow ? 5.0 * scaleFactor : 1.5 * scaleFactor;
      const availItemsH = Math.max(items.length * 3.2, boxH - headerH - footerH - 1.2 * scaleFactor);
      const rowH = availItemsH / Math.max(1, items.length);

      pdf.setFillColor(255, 255, 255);
      pdf.setDrawColor(30, 41, 59);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(boxX, boxY, boxW, boxH, 1.8, 1.8, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8 * scaleFactor);
      pdf.setTextColor(15, 23, 42);
      pdf.text('COLOR LEGEND', boxX + 2.8, boxY + 4.4 * scaleFactor);

      const scopeText = `${legendBridge.storeFilter || ''} • ${legendBridge.targetLoc || ''}${
        legendBridge.versionYear ? ` (${legendBridge.versionYear})` : ''
      }`;
      pdf.setFontSize(6.6 * scaleFactor);
      pdf.setTextColor(71, 85, 105);
      pdf.text(scopeText, boxX + boxW - 2.8, boxY + 4.4 * scaleFactor, { align: 'right' });

      pdf.setDrawColor(203, 213, 225);
      pdf.setLineWidth(0.2);
      pdf.line(boxX + 2.5, boxY + headerH, boxX + boxW - 2.5, boxY + headerH);

      const swatchSize = Math.min(3.2 * scaleFactor, rowH * 0.72);
      items.forEach((it, idx) => {
        const iy = boxY + headerH + 1.4 * scaleFactor + idx * rowH;
        const [r, g, b] = hexToRgb(it.color);
        pdf.setFillColor(r, g, b);
        pdf.setDrawColor(100, 116, 139);
        pdf.setLineWidth(0.2);
        pdf.rect(boxX + 2.8, iy, swatchSize, swatchSize, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.8 * scaleFactor);
        pdf.setTextColor(15, 23, 42);
        pdf.text(it.label, boxX + 3.8 + swatchSize, iy + swatchSize * 0.82);
      });

      if (hasTotalRow) {
        const totalLineY = boxY + boxH - footerH;
        pdf.setDrawColor(226, 232, 240);
        pdf.setLineWidth(0.2);
        pdf.line(boxX + 2.5, totalLineY, boxX + boxW - 2.5, totalLineY);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5 * scaleFactor);
        pdf.setTextColor(100, 116, 139);
        pdf.text('TOTAL', boxX + 2.8, totalLineY + 3.4 * scaleFactor);

        const totalSummary = `${totalUnits} ${totalUnits === 1 ? 'unit' : 'units'}${
          totalArea > 0
            ? ` • ${totalArea.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} m² • 100%`
            : ''
        }`;
        pdf.setTextColor(51, 65, 85);
        pdf.text(totalSummary, boxX + boxW - 2.8, totalLineY + 3.4 * scaleFactor, { align: 'right' });
      }
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
