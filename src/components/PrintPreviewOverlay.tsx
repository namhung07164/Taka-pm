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

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[100] hide-on-actual-print">
      {/* Horizontal lines */}
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
            className="absolute left-0 w-full border-b-2 border-red-500 border-dashed opacity-70"
            style={{ top: `${pb.domEndY}px` }}
          >
            <span className="absolute left-1 -top-5 text-red-600 dark:text-red-400 font-bold text-xs bg-white/90 dark:bg-[#1e1e20]/90 px-1 rounded shadow-sm">
              Page Break (Page {index + 1} → {index + 2})
            </span>
          </div>
        );
      })}

      {/* Vertical lines */}
      {Array.from({ length: cols - 1 }).map((_, index) => (
        <div
          key={`v-${index}`}
          className="absolute top-0 h-full border-r-2 border-red-500 border-dashed opacity-70"
          style={{ left: `${(index + 1) * usableWidthPx}px` }}
        />
      ))}
    </div>
  );
};

