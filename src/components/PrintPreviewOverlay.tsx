import React, { useState, useEffect } from "react";
import { computePrintGridMetrics } from "../lib/exportPdfParts/pdfTableSlicer";
import { useAppStore } from "../store/useAppStore";

interface PrintPreviewOverlayProps {
  printScale: number;
  printPaperSize: "A2" | "A3" | "A4";
  printOrientation: "portrait" | "landscape";
  printScaleMode: string;
}

export const PrintPreviewOverlay: React.FC<PrintPreviewOverlayProps> = ({
  printScale,
  printPaperSize,
  printOrientation,
  printScaleMode,
}) => {
  const printFilterHeader = useAppStore((state) => state.printFilterHeader);
  const printDpi = useAppStore((state) => state.printDpi);
  const [pageBreaks, setPageBreaks] = useState<{ domStartY: number; domEndY: number }[]>([]);
  const [cols, setCols] = useState(1);
  const [usableWidthPx, setUsableWidthPx] = useState(0);

  const getPaperDimensions = () => {
    switch (printPaperSize) {
      case "A2":
        return { w: 420, h: 594 };
      case "A3":
        return { w: 297, h: 420 };
      case "A4":
      default:
        return { w: 210, h: 297 };
    }
  };

  useEffect(() => {
    let timeoutId: any;
    const calculatePreviewGrid = () => {
      const wrapper = document.querySelector(".print-content-wrapper") as HTMLElement;
      if (!wrapper) return;

      const naturalWidth = Math.max(100, wrapper.scrollWidth);
      const naturalHeight = Math.max(100, wrapper.scrollHeight);

      const { w: paperW, h: paperH } = getPaperDimensions();
      const printWidth = printOrientation === "landscape" ? paperH : paperW;
      const printHeight = printOrientation === "landscape" ? paperW : paperH;

      const sideMargin = 8;
      const topMargin = printFilterHeader ? 10.5 : 8;
      const bottomMargin = 9;
      const targetWidthMm = printWidth - sideMargin * 2;
      const targetHeightMm = printHeight - topMargin - bottomMargin;

      const domScaleFactor = Math.max(0.1, (printScale || 100) / 100);

      const metrics = computePrintGridMetrics({
        wrapper,
        naturalWidth,
        naturalHeight,
        targetWidthMm,
        targetHeightMm,
        topMarginMm: topMargin,
        printScaleMode,
        printScale,
        domScaleFactor,
      });

      setCols(metrics.cols);
      setUsableWidthPx(metrics.usableWidthPx);
      setPageBreaks(metrics.pageBreaks);
    };

    const wrapper = document.querySelector(".print-content-wrapper") as HTMLElement;
    let observer: ResizeObserver | null = null;
    if (wrapper) {
      observer = new ResizeObserver(() => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(calculatePreviewGrid, 80);
      });
      observer.observe(wrapper);
    }

    timeoutId = setTimeout(calculatePreviewGrid, 120);

    return () => {
      clearTimeout(timeoutId);
      if (observer) observer.disconnect();
    };
  }, [printScale, printPaperSize, printOrientation, printScaleMode, printFilterHeader]);

  const { w: paperW, h: paperH } = getPaperDimensions();
  const displayW = printOrientation === "landscape" ? paperH : paperW;
  const displayH = printOrientation === "landscape" ? paperW : paperH;
  const totalPages = Math.max(1, pageBreaks.length * cols);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[100] hide-on-actual-print">
      {/* Live Paper Spec Badge */}
      <div
        className="fixed bottom-4 left-4 z-[9998] bg-slate-900/90 text-white px-3 py-1.5 rounded-lg shadow-lg border border-slate-700 text-[11px] font-mono font-bold flex items-center gap-2 backdrop-blur-md hide-on-actual-print"
      >
        <span className="text-blue-400">
          {printPaperSize} {printOrientation === "landscape" ? "Landscape" : "Portrait"} ({displayW}×{displayH}mm)
        </span>
        <span className="text-slate-500">•</span>
        <span className="text-emerald-400">Scale: {Math.round(printScale)}%</span>
        <span className="text-slate-500">•</span>
        <span className="text-amber-300">{printDpi || 300} DPI</span>
        <span className="text-slate-500">•</span>
        <span>{totalPages} {totalPages === 1 ? "Page" : "Pages"}</span>
      </div>

      {/* Horizontal page-break lines */}
      {pageBreaks.map((pb, index) => {
        if (
          index === pageBreaks.length - 1 &&
          pb.domEndY >= (document.querySelector(".print-content-wrapper")?.scrollHeight || 0) - 2
        ) {
          return null;
        }
        return (
          <div
            key={`h-${index}`}
            className="absolute left-0 w-full border-b-2 border-red-500 border-dashed opacity-75"
            style={{ top: `${pb.domEndY}px` }}
          >
            <span className="absolute left-1 -top-5 text-red-600 dark:text-red-400 font-bold text-xs bg-white/95 dark:bg-[#1e1e20]/95 px-1.5 py-0.5 rounded shadow-sm border border-red-200">
              Page Break (Page {index + 1} → {index + 2})
            </span>
          </div>
        );
      })}

      {/* Vertical page-break lines */}
      {Array.from({ length: cols - 1 }).map((_, index) => (
        <div
          key={`v-${index}`}
          className="absolute top-0 h-full border-r-2 border-red-500 border-dashed opacity-75"
          style={{ left: `${(index + 1) * usableWidthPx}px` }}
        />
      ))}
    </div>
  );
};
