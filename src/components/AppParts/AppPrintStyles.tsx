import React from "react";

interface AppPrintStylesProps {
  printPaperSize: string;
  printOrientation: string;
  activeTab: string;
  printScale: number;
  isPrintPreview: boolean;
  printWidth: number;
  printHeight: number;
  printScaleMode?: string;
  measuredContentWidth?: number;
  measuredContentHeight?: number;
}

export const AppPrintStyles: React.FC<AppPrintStylesProps> = React.memo(
  ({
    printPaperSize,
    printOrientation,
    activeTab,
    printScale,
    isPrintPreview,
    printWidth,
    printHeight,
    printScaleMode = "fit-page",
    measuredContentWidth = 0,
    measuredContentHeight = 0,
  }) => {
    const isLayout = activeTab === "layout";
    const scaleRatio = Math.max(0.1, (printScale || 100) / 100);
    const compMarginRight =
      !isLayout && scaleRatio < 1 && measuredContentWidth > 0
        ? -Math.round(measuredContentWidth * (1 - scaleRatio))
        : 0;
    const compMarginBottom =
      !isLayout && scaleRatio < 1 && measuredContentHeight > 0
        ? -Math.round(measuredContentHeight * (1 - scaleRatio))
        : 0;

    const isSinglePageFit =
      printScaleMode === "fit-page" || printScaleMode === "fill-page";
    const isFitCols = printScaleMode === "fit-cols";

    const paperWidthRule = isLayout
      ? "width: 100% !important; min-width: 100%;"
      : isSinglePageFit || isFitCols
      ? `width: ${printWidth}mm !important; min-width: ${printWidth}mm !important; max-width: ${printWidth}mm !important;`
      : `width: max-content !important; min-width: ${printWidth}mm;`;

    const paperHeightRule = isLayout
      ? "height: 100% !important; min-height: 85vh;"
      : isSinglePageFit
      ? `height: ${printHeight}mm !important; min-height: ${printHeight}mm !important;`
      : `height: max-content !important; min-height: ${printHeight}mm;`;

    return (
      <style>{`
        /* Global print overrides for crisp enterprise contrast & unclipped tables */
        @media print, screen {
          html:not(.dark) .print-preview-content-active {
             --tw-text-opacity: 1;
             -webkit-font-smoothing: antialiased;
             text-rendering: geometricPrecision;
          }
          html:not(.dark) .print-preview-content-active .border-slate-300,
          html:not(.dark) .print-preview-content-active .border-slate-200,
          html:not(.dark) .print-preview-content-active [data-print-header="true"] {
             border-color: #64748b !important;
          }
          html:not(.dark) .print-preview-content-active .border-slate-100 {
             border-color: #cbd5e1 !important;
          }
          html:not(.dark) .print-preview-content-active .print-sticky-x {
             box-shadow: none !important;
          }
          html:not(.dark) .print-preview-content-active .text-slate-500,
          html:not(.dark) .print-preview-content-active .text-slate-600 {
             color: #334155 !important;
             font-weight: 700 !important;
          }
          html:not(.dark) .print-preview-content-active .text-slate-700,
          html:not(.dark) .print-preview-content-active .text-slate-800,
          html:not(.dark) .print-preview-content-active .text-slate-900 {
             color: #0f172a !important;
             font-weight: 700 !important;
          }
          html:not(.dark) .print-preview-content-active .bg-slate-100 {
             background-color: #f1f5f9 !important;
          }
          html:not(.dark) .print-preview-content-active table,
          html:not(.dark) .print-preview-content-active th,
          html:not(.dark) .print-preview-content-active td {
             border-color: #475569 !important;
          }
          ${!isLayout ? `
          /* Ensure desktop table/canvas views are always used for print/PDF even on tablet/mobile viewports */
          .print-preview-content-active .hidden.xl\\:block,
          .print-preview-content-active .hidden.lg\\:block {
             display: block !important;
          }
          .print-preview-content-active .xl\\:hidden,
          .print-preview-content-active .lg\\:hidden {
             display: none !important;
          }
          /* Unclip scrollable table & Gantt containers so 100% of rows/columns render */
          .print-preview-content-active .overflow-auto,
          .print-preview-content-active .overflow-y-auto,
          .print-preview-content-active .overflow-x-auto,
          .print-preview-content-active .overflow-x-hidden,
          .print-preview-content-active .overflow-y-hidden,
          .print-preview-content-active .overflow-hidden {
             overflow: visible !important;
             max-height: none !important;
             height: auto !important;
          }
          .print-preview-content-active [data-print-header="true"],
          .print-preview-content-active thead,
          .print-preview-content-active tr.sticky,
          .print-preview-content-active th.sticky,
          .print-preview-content-active td.sticky {
             position: static !important;
             top: 0 !important;
          }
          ` : ""}
        }
        @media print {
          @page {
            size: ${printPaperSize} ${printOrientation};
            margin: ${isLayout ? '5mm !important' : '8mm !important'};
          }
          .print-content-wrapper {
            transform: ${isLayout ? 'none' : `scale(${scaleRatio})`};
            transform-origin: top left;
            width: ${isLayout ? '100% !important' : `${100 / scaleRatio}% !important`};
            height: ${isLayout ? '100% !important' : 'auto !important'};
            overflow: visible !important;
          }
          #live-layout-canvas-container {
            width: 100% !important;
            height: 100% !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          #live-layout-canvas-container canvas {
            max-width: 100% !important;
            max-height: 95vh !important;
            object-fit: contain !important;
          }
          .hide-on-actual-print, .print\\:hidden {
            display: none !important;
          }
        }
        ${isPrintPreview ? `
          @media screen {
            body.print-preview-active {
              background-color: #94a3b8 !important;
            }
            .print-preview-container {
              padding-top: ${isLayout ? '50px !important' : '72px !important'};
              padding-bottom: ${isLayout ? '20px !important' : '48px !important'};
              background-color: transparent !important;
              overflow: auto !important;
            }
            .print-paper {
              ${paperWidthRule}
              ${paperHeightRule}
              background-color: white !important;
              margin: 0 auto;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
              padding: ${isLayout ? '0 !important' : '8mm !important'};
              position: relative;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              box-sizing: border-box !important;
            }
            .print-preview-content-active {
              transform: ${isLayout ? 'none' : `scale(${scaleRatio})`};
              transform-origin: top left;
              margin-right: ${compMarginRight}px !important;
              margin-bottom: ${compMarginBottom}px !important;
              width: ${isLayout ? '100% !important' : 'max-content !important'};
              height: ${isLayout ? '100% !important' : 'max-content !important'};
              background-color: transparent !important;
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              padding: 0 !important;
              flex-grow: 0 !important;
            }
          }
        ` : ""}
      `}</style>
    );
  }
);
