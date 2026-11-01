export interface ExportExecutiveDeckOptions {
  containerEl: HTMLElement | null;
  fileNamePrefix?: string;
  dpi?: number;
  watermark?: 'none' | 'draft' | 'confidential';
  onProgress?: (current: number, total: number) => void;
}

export async function exportExecutiveDeckToPdf({
  containerEl,
  fileNamePrefix = 'Taka_Executive_Deck',
  dpi = 200,
  watermark = 'none',
  onProgress,
}: ExportExecutiveDeckOptions): Promise<boolean> {
  if (!containerEl) return false;

  const slideNodes = Array.from(
    containerEl.querySelectorAll('[data-executive-slide="true"]')
  ) as HTMLElement[];

  if (slideNodes.length === 0) return false;

  const [{ jsPDF }, htmlToImage] = await Promise.all([
    import('jspdf'),
    import('html-to-image'),
  ]);

  const pdf = new jsPDF({
    orientation: 'l',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth(); // 297mm
  const pageHeightMm = pdf.internal.pageSize.getHeight(); // 210mm
  const pixelRatio = dpi >= 300 ? 2.5 : dpi >= 200 ? 2.0 : 1.5;

  for (let i = 0; i < slideNodes.length; i++) {
    const slideEl = slideNodes[i];
    onProgress?.(i + 1, slideNodes.length);

    if (i > 0) {
      pdf.addPage('a4', 'l');
    }

    // Yield briefly to keep UI responsive
    await new Promise((r) => setTimeout(r, 25));

    let dataUrl: string;
    try {
      dataUrl = await htmlToImage.toPng(slideEl, {
        width: 1122,
        height: 794,
        pixelRatio,
        backgroundColor: '#ffffff',
        cacheBust: false,
        filter: (node: any) => {
          if (
            node?.classList &&
            (node.classList.contains('hide-on-actual-print') ||
              node.classList.contains('print:hidden'))
          ) {
            return false;
          }
          return true;
        },
      });
    } catch {
      dataUrl = await htmlToImage.toPng(slideEl, {
        width: 1122,
        height: 794,
        pixelRatio: 1.5,
        backgroundColor: '#ffffff',
        skipFonts: true,
        cacheBust: false,
      });
    }

    pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');

    if (watermark && watermark !== 'none') {
      try {
        pdf.saveGraphicsState();
        pdf.setGState(new (pdf as any).GState({ opacity: 0.11 }));
        pdf.setFontSize(46);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(140, 140, 140);
        pdf.text(watermark.toUpperCase(), pageWidthMm / 2, pageHeightMm / 2, {
          align: 'center',
          angle: 35,
        });
        pdf.restoreGraphicsState();
      } catch {
        // Ignore GState fallback
      }
    }
  }

  const dateStamp = new Date().toISOString().slice(0, 10);
  pdf.save(`${fileNamePrefix}_${dateStamp}.pdf`);
  return true;
}
