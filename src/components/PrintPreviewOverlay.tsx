import React, { useState, useEffect } from "react";

interface PrintPreviewOverlayProps {
  printScale: number;
  printPaperSize: "A2" | "A3" | "A4";
  printOrientation: "portrait" | "landscape";
  printScaleMode: string;
}

const PX_PER_MM = 3.779527559;

export const PrintPreviewOverlay: React.FC<PrintPreviewOverlayProps> = ({
  printScale,
  printPaperSize,
  printOrientation,
}) => {
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
      const wrapper = document.querySelector('.print-content-wrapper') as HTMLElement;
      if (!wrapper) return;
      
      const naturalWidth = Math.max(100, wrapper.scrollWidth);
      const naturalHeight = Math.max(100, wrapper.scrollHeight);
      
      const { w: paperW, h: paperH } = getPaperDimensions();
      const printWidth = printOrientation === 'landscape' ? paperH : paperW;
      const printHeight = printOrientation === 'landscape' ? paperW : paperH;
      
      const currentScale = Math.max(0.1, (printScale || 100) / 100);
      const targetUsableWidthPx = ((printWidth - 20) * PX_PER_MM) / currentScale;
      const targetUsableHeightPx = ((printHeight - 20) * PX_PER_MM) / currentScale;
      
      const calculatedCols = Math.max(1, Math.ceil((naturalWidth - 2) / targetUsableWidthPx));
      
      let headerHeight = 0;
      const thead = wrapper.querySelector('thead');
      const wrapperRect = wrapper.getBoundingClientRect();

      if (thead) {
         const theadRect = thead.getBoundingClientRect();
         headerHeight = Math.max(0, (theadRect.bottom - wrapperRect.top) / currentScale);
      }
      
      const validBoundaries = [0];
      const trElements = Array.from(wrapper.querySelectorAll('tbody tr'));
      trElements.forEach(tr => {
          validBoundaries.push(Math.max(0, (tr.getBoundingClientRect().bottom - wrapperRect.top) / currentScale));
      });
      validBoundaries.push(naturalHeight);
      validBoundaries.sort((a, b) => a - b);
      
      const newPageBreaks: { domStartY: number; domEndY: number }[] = [];
      let domStartY = 0;
      
      while (domStartY < naturalHeight - 0.5) {
          let domEndY_theoretical: number;
          
          if (newPageBreaks.length === 0) {
              domEndY_theoretical = domStartY + targetUsableHeightPx;
          } else {
              domEndY_theoretical = domStartY + targetUsableHeightPx - headerHeight;
          }
          
          if (domEndY_theoretical >= naturalHeight) {
              newPageBreaks.push({ domStartY, domEndY: naturalHeight });
              break;
          }
          
          let breakY = domStartY;
          for (let i = 0; i < validBoundaries.length; i++) {
              if (validBoundaries[i] > domStartY && validBoundaries[i] <= domEndY_theoretical + 1) {
                  breakY = validBoundaries[i];
              }
          }
          
          if (breakY === domStartY) {
              breakY = domEndY_theoretical;
          }
          
          newPageBreaks.push({ domStartY, domEndY: breakY });
          domStartY = breakY;
      }
      
      setCols(calculatedCols);
      setUsableWidthPx(targetUsableWidthPx);
      setPageBreaks(newPageBreaks);
    };

    const wrapper = document.querySelector('.print-content-wrapper') as HTMLElement;
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
  }, [printScale, printPaperSize, printOrientation]);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-[100] hide-on-actual-print">
      {/* Horizontal lines */}
      {pageBreaks.map((pb, index) => {
        if (index === pageBreaks.length - 1 && pb.domEndY >= (document.querySelector('.print-content-wrapper')?.scrollHeight || 0)) {
          return null;
        }
        return (
          <div 
            key={`h-${index}`} 
            className="absolute left-0 w-full border-b-2 border-red-500 border-dashed opacity-70"
            style={{ top: `${pb.domEndY}px` }}
          >
            <span className="absolute left-1 -top-5 text-red-600 dark:text-red-400 font-bold text-xs bg-white/90 dark:bg-[#1e1e20]/90 px-1 rounded shadow-sm">
              Page Break
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
