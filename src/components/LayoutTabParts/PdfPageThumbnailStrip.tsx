import React, { useEffect, useRef, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';
import {
  getCachedPageThumbSync,
  getCachedPageThumbAsync,
  setCachedPageThumb,
  renderPdfPageToThumbDataUrl,
} from '../../lib/pdfBinaryCache';

export interface PdfPageThumbnailStripProps {
  pdfDoc: any;
  url: string;
  numPages: number;
  currentPage: number;
  onSelectPage: (pageNum: number) => void;
}

export const PdfPageThumbnailStrip: React.FC<PdfPageThumbnailStripProps> = React.memo(({
  pdfDoc,
  url,
  numPages,
  currentPage,
  onSelectPage,
}) => {
  const [thumbs, setThumbs] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (let p = 1; p <= numPages; p++) {
      const hit = getCachedPageThumbSync(url, p);
      if (hit) initial[p] = hit;
    }
    return initial;
  });

  const stripRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Auto-scroll active page thumbnail into center view
  useEffect(() => {
    const activeBtn = itemRefs.current.get(currentPage);
    if (activeBtn && stripRef.current) {
      try {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } catch {}
    }
  }, [currentPage]);

  // Sequentially hydrate & generate thumbnails in background without blocking main thread
  useEffect(() => {
    if (!pdfDoc || numPages <= 0) return;
    let cancelled = false;

    (async () => {
      // Yield to main page render first (180ms) so main canvas renders at 60 FPS without PDF.js worker contention
      await new Promise((r) => setTimeout(r, 180));
      if (cancelled) return;

      // Prioritize currentPage and nearby pages first, then remaining pages
      const order: number[] = [];
      const seen = new Set<number>();
      const pushPage = (p: number) => {
        if (p >= 1 && p <= numPages && !seen.has(p)) {
          seen.add(p);
          order.push(p);
        }
      };

      pushPage(currentPage);
      pushPage(1);
      for (let offset = 1; offset <= numPages; offset++) {
        pushPage(currentPage + offset);
        pushPage(currentPage - offset);
      }

      for (const pageNum of order) {
        if (cancelled) return;

        // 1. Check RAM / IDB cache
        const cached = await getCachedPageThumbAsync(url, pageNum);
        if (cancelled) return;
        if (cached) {
          setThumbs((prev) => (prev[pageNum] === cached ? prev : { ...prev, [pageNum]: cached }));
          continue;
        }

        // 2. Yield to UI frame before rendering thumbnail
        await new Promise((r) => setTimeout(r, 35));
        if (cancelled) return;

        try {
          const rendered = await renderPdfPageToThumbDataUrl(pdfDoc, pageNum, 220);
          if (cancelled) return;
          if (rendered) {
            setCachedPageThumb(url, pageNum, rendered);
            setThumbs((prev) => ({ ...prev, [pageNum]: rendered }));
          } else {
            // Prevent infinite spinner on iOS/memory constrained devices: mark as placeholder
            setThumbs((prev) => (prev[pageNum] ? prev : { ...prev, [pageNum]: '__placeholder__' }));
          }
        } catch {
          if (!cancelled) {
            setThumbs((prev) => (prev[pageNum] ? prev : { ...prev, [pageNum]: '__placeholder__' }));
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, url, numPages, currentPage]);

  if (numPages <= 0) return null;

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div
      ref={stripRef}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      className="z-[55] w-full bg-slate-900/95 border-t border-slate-800 px-3 py-2 flex items-center gap-2.5 overflow-x-auto custom-scrollbar shrink-0 select-none"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x' }}
    >
      {pages.map((pageNum) => {
        const isCurrent = pageNum === currentPage;
        const thumbSrc = thumbs[pageNum];

        return (
          <button
            key={pageNum}
            ref={(el) => {
              if (el) itemRefs.current.set(pageNum, el);
              else itemRefs.current.delete(pageNum);
            }}
            type="button"
            onClick={() => onSelectPage(pageNum)}
            className={`group relative shrink-0 flex flex-col items-center rounded-lg p-1 transition-all active:scale-95 touch-manipulation cursor-pointer ${
              isCurrent
                ? 'bg-blue-600/25 ring-2 ring-blue-500 shadow-md'
                : 'bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 opacity-80 hover:opacity-100'
            }`}
            title={`Go to Page ${pageNum}`}
          >
            <div className="w-14 h-18 sm:w-16 sm:h-20 rounded bg-white overflow-hidden flex items-center justify-center relative">
              {thumbSrc && thumbSrc !== '__placeholder__' ? (
                <img
                  src={thumbSrc}
                  alt={`Page ${pageNum}`}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="w-full h-full object-contain select-none"
                />
              ) : thumbSrc === '__placeholder__' ? (
                <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                  <FileText className="w-5 h-5 text-slate-400" />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
                  <FileText className="w-3.5 h-3.5 opacity-40" />
                </div>
              )}
              <span
                className={`absolute bottom-0.5 right-0.5 px-1 py-0.2 rounded text-[9px] font-mono font-bold leading-tight ${
                  isCurrent ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-900/80 text-slate-200'
                }`}
              >
                {pageNum}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
});

export default PdfPageThumbnailStrip;
