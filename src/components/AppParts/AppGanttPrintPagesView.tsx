import React, { Profiler, Suspense, memo } from "react";
import { lazyWithRetry } from "../../lib/lazyWithRetry";
import { PrintFilterHeader } from "../PrintFilterHeader";

const GanttTab = lazyWithRetry(() => import("../GanttTab"), "GanttTab");
const PrintPreviewOverlay = lazyWithRetry(
  () =>
    import("../PrintPreviewOverlay").then((m) => ({
      default: m.PrintPreviewOverlay,
    })),
  "PrintPreviewOverlay"
);

interface AppGanttPrintPagesViewProps {
  ganttPrintPages: Array<{ dateRange: { start: string; end: string } }>;
  printWatermark: string;
  printOrientation: "portrait" | "landscape";
  printDate: boolean;
  printFilterHeader: boolean;
  printFilterContext: any;
  isPrintPreview: boolean;
  printScale: number;
  printPaperSize: any;
  printScaleMode: any;
  ganttTabFocusTaskId: string;
  setGanttTabFocusTaskId: (id: string) => void;
  handleNavigateToLayout: (store: string, location: string, year?: string, code?: string) => void;
  handleNavigateToTaskDetail: (code: string, store?: string, year?: string, taskId?: string) => void;
  onRenderCallback: any;
}

export const AppGanttPrintPagesView: React.FC<AppGanttPrintPagesViewProps> = memo(
  ({
    ganttPrintPages,
    printWatermark,
    printOrientation,
    printDate,
    printFilterHeader,
    printFilterContext,
    isPrintPreview,
    printScale,
    printPaperSize,
    printScaleMode,
    ganttTabFocusTaskId,
    setGanttTabFocusTaskId,
    handleNavigateToLayout,
    handleNavigateToTaskDetail,
    onRenderCallback,
  }) => {
    return (
      <div className="flex flex-col gap-8 w-full items-center bg-slate-300 dark:bg-slate-800 p-4 sm:p-8 print:p-0 print:bg-transparent overflow-x-auto">
        {ganttPrintPages.map((pageData, idx) => (
          <div
            key={idx}
            className="print-paper relative flex flex-col shrink-0"
            style={{ pageBreakAfter: idx < ganttPrintPages.length - 1 ? "always" : "auto" }}
          >
            {printWatermark !== "none" && (
              <div
                className="absolute inset-0 pointer-events-none flex items-center justify-center z-[150] overflow-hidden hide-on-actual-print"
                style={{ opacity: 0.12 }}
              >
                <span
                  className="font-black text-slate-500 uppercase tracking-widest text-center select-none"
                  style={{
                    fontSize: printOrientation === "landscape" ? "48pt" : "36pt",
                    transform: "rotate(-45deg)",
                  }}
                >
                  {printWatermark}
                </span>
              </div>
            )}
            {printDate && (
              <div className="absolute bottom-2.5 left-4 text-[10px] font-mono text-slate-500 z-[90] hide-on-actual-print">
                Printed on: {new Date().toLocaleString()} - Page {idx + 1}
              </div>
            )}
            {printFilterHeader && (
              <div className="w-full px-1 pt-0.5 pb-1.5 bg-white dark:bg-[#1e1e20] shrink-0 hide-on-actual-print">
                <PrintFilterHeader
                  context={printFilterContext}
                  pageIndex={idx}
                  totalPages={ganttPrintPages.length}
                />
              </div>
            )}
            <div className="w-full flex-grow flex flex-col bg-white dark:bg-[#1e1e20] p-0 print-content-wrapper print-preview-content-active relative overflow-visible">
              {isPrintPreview && (
                <Suspense fallback={null}>
                  <PrintPreviewOverlay
                    printScale={printScale}
                    printPaperSize={printPaperSize}
                    printOrientation={printOrientation}
                    printScaleMode={printScaleMode}
                  />
                </Suspense>
              )}
              <Profiler id={`GanttTab-Page-${idx}`} onRender={onRenderCallback}>
                <GanttTab
                  printDateRangeOverride={pageData.dateRange}
                  initialFocusTaskId={ganttTabFocusTaskId}
                  onClearFocus={() => setGanttTabFocusTaskId("")}
                  onNavigateToLayout={handleNavigateToLayout}
                  onNavigateToTaskDetail={handleNavigateToTaskDetail}
                />
              </Profiler>
            </div>
          </div>
        ))}
      </div>
    );
  }
);

AppGanttPrintPagesView.displayName = "AppGanttPrintPagesView";
