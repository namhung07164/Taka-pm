import React from "react";

interface AppPrintStylesProps {
  printPaperSize: string;
  printOrientation: string;
  activeTab: string;
  printScale: number;
  isPrintPreview: boolean;
  printWidth: number;
  printHeight: number;
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
  }) => {
    const isLayout = activeTab === "layout";
    return (
      <style>{`
        /* Global print overrides for crisp enterprise contrast & unclipped tables */
        @media print, screen {
          html:not(.dark) .print-preview-content-active {
             --tw-text-opacity: 1;
          }
          html:not(.dark) .print-preview-content-active .border-slate-200,
          html:not(.dark) .print-preview-content-active .border-b,
          html:not(.dark) .print-preview-content-active .border-r {
             border-color: #475569 !important;
          }
          html:not(.dark) .print-preview-content-active .text-slate-500,
          html:not(.dark) .print-preview-content-active .text-slate-600 {
             color: #1e293b !important;
             font-weight: 700 !important;
          }
          html:not(.dark) .print-preview-content-active .text-slate-700,
          html:not(.dark) .print-preview-content-active .text-slate-800,
          html:not(.dark) .print-preview-content-active .text-slate-900 {
             color: #000000 !important;
             font-weight: 800 !important;
          }
          html:not(.dark) .print-preview-content-active .bg-slate-100 {
             background-color: #e2e8f0 !important;
          }
          html:not(.dark) .print-preview-content-active table,
          html:not(.dark) .print-preview-content-active th,
          html:not(.dark) .print-preview-content-active td {
             border-color: #334155 !important;
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
          /* Unclip scrollable table & dashboard containers so 100% of rows/columns render */
          .print-preview-content-active .overflow-auto,
          .print-preview-content-active .overflow-y-auto,
          .print-preview-content-active .overflow-x-auto,
          .print-preview-content-active .overflow-hidden {
             overflow: visible !important;
             max-height: none !important;
             height: auto !important;
          }
          .print-preview-content-active thead,
          .print-preview-content-active tr.sticky,
          .print-preview-content-active th.sticky,
          .print-preview-content-active td.sticky {
             position: static !important;
          }
          ` : ""}
        }
        @media print {
          @page {
            size: ${printPaperSize} ${printOrientation};
            margin: ${isLayout ? '5mm !important' : '8mm !important'};
          }
          .print-content-wrapper {
            transform: ${isLayout ? 'none' : `scale(${printScale / 100})`};
            transform-origin: top left;
            width: ${isLayout ? '100% !important' : `${100 / (printScale / 100)}% !important`};
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
              padding-top: ${isLayout ? '50px !important' : '100px !important'};
              padding-bottom: ${isLayout ? '20px !important' : '60px !important'};
              background-color: transparent !important;
              overflow: auto !important;
            }
            .print-paper {
              width: ${isLayout ? '100% !important' : 'max-content !important'};
              height: ${isLayout ? '100% !important' : 'max-content !important'};
              min-width: ${isLayout ? '100%' : `${printWidth}mm`};
              min-height: ${isLayout ? '85vh' : `${printHeight}mm`};
              background-color: white !important;
              margin: 0 auto;
              box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5) !important;
              padding: ${isLayout ? '0 !important' : '8mm !important'};
              position: relative;
              overflow: hidden;
              display: flex;
              flex-direction: column;
            }
            .print-preview-content-active {
              transform: ${isLayout ? 'none' : `scale(${printScale / 100})`};
              transform-origin: top left;
              width: ${isLayout ? '100% !important' : 'max-content !important'};
              height: ${isLayout ? '100% !important' : 'max-content !important'};
              background-color: transparent !important;
              border: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              padding: 0 !important;
              flex-grow: 1 !important;
            }
          }
        ` : ""}
      `}</style>
    );
  }
);

