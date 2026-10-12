import React from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';

interface PdfOrImageViewerProps {
  url: string;
  getCleanUrl: (u: string | undefined | null) => string | undefined;
  fallbackSvg: string;
  isFullscreen?: boolean;
  onOpenFullscreen?: () => void;
}

export const PdfOrImageViewer: React.FC<PdfOrImageViewerProps> = ({
  url,
  getCleanUrl,
  fallbackSvg,
  isFullscreen = false,
  onOpenFullscreen,
}) => {
  const cleanUrl = React.useMemo(() => getCleanUrl(url) || '', [getCleanUrl, url]);

  const isPdf = React.useMemo(() => {
    if (!cleanUrl) return false;
    const lower = cleanUrl.toLowerCase();
    const rawLower = (url || '').toLowerCase();
    return (
      lower.includes('.pdf') ||
      lower.startsWith('data:application/pdf') ||
      rawLower.includes('.pdf')
    );
  }, [cleanUrl, url]);

  const [pdfDoc, setPdfDoc] = React.useState<any>(null);
  const [numPages, setNumPages] = React.useState<number>(0);
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [pageDataUrl, setPageDataUrl] = React.useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = React.useState<boolean>(false);
  const [pdfError, setPdfError] = React.useState<string | null>(null);

  const transformRef = React.useRef<any>(null);

  // Dynamically load PDF Document when URL changes and is a PDF
  React.useEffect(() => {
    if (!isPdf || !cleanUrl) {
      setPdfDoc(null);
      setNumPages(0);
      setCurrentPage(1);
      setPageDataUrl(null);
      setPdfError(null);
      return;
    }

    let isMounted = true;
    setLoadingPdf(true);
    setPdfError(null);

    let loadingTask: any = null;

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        if (!isMounted) return;

        loadingTask = pdfjsLib.getDocument({
          url: cleanUrl,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages || 1);
        setCurrentPage(1);
        setLoadingPdf(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('Failed to load PDF in layout viewer:', err);
        setPdfError(err?.message || 'Failed to parse PDF file');
        setLoadingPdf(false);
      }
    })();

    return () => {
      isMounted = false;
      try {
        if (loadingTask) loadingTask.destroy();
      } catch (_) {}
    };
  }, [cleanUrl, isPdf]);

  // Render Page to Data URL whenever currentPage or pdfDoc changes
  React.useEffect(() => {
    if (!pdfDoc || currentPage < 1) return;

    let isMounted = true;
    setLoadingPdf(true);

    pdfDoc
      .getPage(currentPage)
      .then(async (page: any) => {
        if (!isMounted) return;
        const viewport = page.getViewport({ scale: 2.2 }); // high resolution render
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        if (!isMounted) return;

        const dataUrl = canvas.toDataURL('image/png');
        setPageDataUrl(dataUrl);
        setLoadingPdf(false);

        // Reset transform to center new page
        if (transformRef.current?.resetTransform) {
          transformRef.current.resetTransform();
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        console.error(`Failed to render PDF page ${currentPage}:`, err);
        setLoadingPdf(false);
      });

    return () => {
      isMounted = false;
    };
  }, [pdfDoc, currentPage]);

  const handlePrevPage = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNextPage = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPage((p) => Math.min(numPages, p + 1));
  }, [numPages]);

  // Determine active display source (PDF rendered page image OR standard image URL)
  const displaySrc = isPdf ? pageDataUrl || '' : cleanUrl;

  return (
    <div className="w-full h-full relative flex-grow flex flex-col overflow-hidden bg-slate-950">
      {/* Loading Overlay */}
      {loadingPdf && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-xs text-white">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400 mb-2" />
          <span className="text-xs font-semibold text-slate-300">
            {isPdf ? `Rendering Page ${currentPage} of ${numPages || '...'}` : 'Loading Layout...'}
          </span>
        </div>
      )}

      {/* PDF Load Error Fallback: render native iframe */}
      {pdfError && !loadingPdf && (
        <div className="w-full h-full relative">
          <iframe
            src={cleanUrl}
            className="w-full h-full border-0"
            title="PDF Document"
          />
        </div>
      )}

      {!pdfError && (
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.5}
          maxScale={8}
          centerOnInit={true}
          smooth={true}
          wheel={{ step: 0.18 }}
          zoomAnimation={{ disabled: false, animationTime: 180 }}
          pinch={{ step: 10 }}
          panning={{ disabled: false }}
          doubleClick={{ mode: 'toggle', step: 2.5 }}
        >
          {({ zoomIn, zoomOut, resetTransform, state }) => (
            <>
              {/* Top Toolbar: Zoom Controls & Multi-Page Navigation */}
              <div className="absolute top-3 right-3 z-[50] flex items-center gap-1.5 bg-slate-900/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-700/80 shadow-xl rounded-xl text-white select-none">
                {/* PDF Page Navigation Controls */}
                {isPdf && numPages > 1 && (
                  <div className="flex items-center gap-1 pr-1.5 border-r border-slate-700">
                    <button
                      type="button"
                      onClick={handlePrevPage}
                      disabled={currentPage <= 1 || loadingPdf}
                      className="p-1.5 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg text-slate-200 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                      title="Previous Page (Trang trước)"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>

                    <div className="flex items-center gap-1 text-xs font-mono font-bold px-1 text-blue-400">
                      <span>Page</span>
                      <select
                        value={currentPage}
                        onChange={(e) => setCurrentPage(Number(e.target.value))}
                        disabled={loadingPdf}
                        className="bg-slate-800 text-white font-mono font-bold text-xs rounded px-1 py-0.5 border border-slate-700 outline-none cursor-pointer"
                      >
                        {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                      <span className="text-slate-400">/ {numPages}</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleNextPage}
                      disabled={currentPage >= numPages || loadingPdf}
                      className="p-1.5 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent rounded-lg text-slate-200 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                      title="Next Page (Trang sau)"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Zoom In/Out & Reset Buttons */}
                <button
                  type="button"
                  onClick={() => zoomIn(0.4)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                  title="Zoom In (Speed: Fast)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => zoomOut(0.4)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                  title="Zoom Out (Speed: Fast)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>

                <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-200 border-l border-r border-slate-700 min-w-[42px] text-center">
                  {Math.round((state.scale || 1) * 100)}%
                </span>

                <button
                  type="button"
                  onClick={() => resetTransform()}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-200 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                  title="Reset Zoom"
                >
                  <Maximize className="w-4 h-4" />
                </button>

                {!isFullscreen && onOpenFullscreen && (
                  <button
                    type="button"
                    onClick={onOpenFullscreen}
                    className="p-1.5 hover:bg-slate-800 rounded-lg text-blue-400 transition-colors active:scale-95 cursor-pointer touch-manipulation"
                    title="Fullscreen"
                  >
                    <Maximize className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Transform Container */}
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '1rem',
                }}
              >
                {displaySrc ? (
                  <img
                    src={displaySrc}
                    alt={isPdf ? `PDF Page ${currentPage}` : 'Layout Plan'}
                    decoding="async"
                    className="max-w-full max-h-full object-contain cursor-grab active:cursor-grabbing shadow-2xl rounded-lg"
                    onError={(e) => {
                      if (!isPdf) {
                        (e.target as HTMLImageElement).src = fallbackSvg;
                      }
                    }}
                  />
                ) : (
                  <img
                    src={fallbackSvg}
                    alt="Fallback Floor Plan"
                    className="max-w-full max-h-full object-contain opacity-50"
                  />
                )}
              </TransformComponent>
            </>
          )}
        </TransformWrapper>
      )}
    </div>
  );
};
