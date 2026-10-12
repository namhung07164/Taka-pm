import React from 'react';
import { Map, ZoomIn, ZoomOut, Maximize, Maximize2, ArrowLeft } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface LayoutTabStaticViewerProps {
  url: string;
  getCleanUrl: (u: string | undefined | null) => string | undefined;
  fallbackSvg: string;
  cacheBuster: number;
  isAdmin: boolean;
  onOpenFullscreen: () => void;
}

export function LayoutTabStaticViewer({
  url,
  getCleanUrl,
  fallbackSvg,
  cacheBuster,
  isAdmin,
  onOpenFullscreen,
}: LayoutTabStaticViewerProps) {
  const [pdfPage, setPdfPage] = React.useState(1);

  const isDirectPdf = React.useMemo(() => {
    if (!url) return false;
    const clean = url.toLowerCase().split('?')[0];
    return clean.endsWith('.pdf');
  }, [url]);

  const effectiveUrl = React.useMemo(() => {
    let base = getCleanUrl(url) || '';
    if (isDirectPdf && base) {
      const baseUrl = base.split('#')[0];
      return `${baseUrl}#page=${pdfPage}`;
    }
    return base;
  }, [url, getCleanUrl, isDirectPdf, pdfPage]);

  if (!url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900">
        <Map className="w-12 h-12 mb-3 opacity-20" />
        <p className="text-sm font-medium">No floor plan layout available for this location</p>
        {isAdmin && <p className="text-xs mt-1">Click "Edit URL" to configure layout link</p>}
      </div>
    );
  }

  if (isDirectPdf || url.includes('drive.google.com')) {
    return (
      <div className="w-full h-full relative flex flex-col">
        {isDirectPdf && (
          <div className="absolute top-4 left-4 z-[50] flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
            <button
              onClick={() => setPdfPage(p => Math.max(1, p - 1))}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-30"
              disabled={pdfPage <= 1}
              title="Trang trước"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold px-2 min-w-[3rem] text-center dark:text-slate-300">Page {pdfPage}</span>
            <button
              onClick={() => setPdfPage(p => p + 1)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors"
              title="Trang sau"
            >
              <ArrowLeft className="w-4 h-4 rotate-180" />
            </button>
          </div>
        )}
        <div className="absolute top-4 right-4 z-[50]">
          <button 
            type="button"
            onClick={onOpenFullscreen}
            className="p-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-md rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-95 touch-manipulation"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
        <iframe 
          key={`${effectiveUrl}_${pdfPage}_${cacheBuster}`}
          src={effectiveUrl} 
          width="100%" 
          style={{ height: '100%', minHeight: '600px', border: 'none' }}
          allow="autoplay"
        />
      </div>
    );
  }

  return (
    <div className="w-full h-full relative flex-grow flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <TransformWrapper
        initialScale={1.15}
        minScale={0.5}
        maxScale={6}
        centerOnInit={true}
        smooth={false}
        wheel={{ step: 0.05 }}
        zoomAnimation={{ disabled: true }}
        pinch={{ step: 5 }}
        panning={{ disabled: false }}
        doubleClick={{
          mode: "toggle",
          step: 2.2
        }}
      >
        {({ zoomIn, zoomOut, resetTransform, state }) => (
          <>
            <div className="absolute top-4 right-4 z-[50] flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
              <button
                type="button"
                onClick={() => zoomIn(0.3)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => zoomOut(0.3)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700">
                {Math.round((state.scale || 1) * 100)}%
              </span>
              <button 
                type="button"
                onClick={() => resetTransform()}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Reset"
              >
                <Maximize className="w-4 h-4" />
              </button>
              <button 
                type="button"
                onClick={onOpenFullscreen}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
                title="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", padding: "1rem" }}
            >
              <img 
                src={getCleanUrl(url)} 
                alt="Layout Scroll Preview" 
                loading="lazy"
                decoding="async"
                className="max-w-full max-h-full object-contain shadow-lg rounded-lg border border-slate-200 bg-white cursor-grab active:cursor-grabbing"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = fallbackSvg;
                }}
              />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
