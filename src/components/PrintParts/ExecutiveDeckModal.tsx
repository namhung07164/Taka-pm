import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  X, GripHorizontal, FileDown, Printer, Layers, FolderKanban,
  Search, ZoomIn, CheckSquare, Square, Sparkles,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { normalizeFloorCode } from '../../lib/unitSizeResolver';
import { ExecutiveDeckMode } from './executiveDeckTypes';
import { useExecutiveDeckData } from './useExecutiveDeckData';
import { ExecutiveProjectSlideCard } from './ExecutiveProjectSlideCard';
import { ExecutiveFloorSlideCard } from './ExecutiveFloorSlideCard';
import { exportExecutiveDeckToPdf } from './executivePdfGenerator';

export interface ExecutiveDeckOpenPayload {
  mode?: ExecutiveDeckMode;
  store?: string;
  year?: string;
  location?: string;
  projectCode?: string;
}

interface ExecutiveDeckModalProps {
  isOpen: boolean;
  initialPayload?: ExecutiveDeckOpenPayload | null;
  onClose: () => void;
}

export const ExecutiveDeckModal: React.FC<ExecutiveDeckModalProps> = React.memo(({
  isOpen,
  initialPayload,
  onClose,
}) => {
  const projects = useAppStore((state) => state.projects);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const globalLocationFilter = useAppStore((state) => state.globalLocationFilter);
  const printWatermark = useAppStore((state) => state.printWatermark);
  const printDpi = useAppStore((state) => state.printDpi);
  const setToast = useAppStore((state) => state.setToast);

  const [mode, setMode] = useState<ExecutiveDeckMode>(initialPayload?.mode || 'project');
  const [storeFilter, setStoreFilter] = useState<string>(
    initialPayload?.store || (globalStoreFilter && globalStoreFilter !== 'all' ? globalStoreFilter : 'all')
  );
  const [yearFilter, setYearFilter] = useState<string>(
    initialPayload?.year || (globalYearFilter && globalYearFilter !== 'all' ? globalYearFilter : 'all')
  );
  const [locationFilter, setLocationFilter] = useState<string>(
    initialPayload?.location ||
      (Array.isArray(globalLocationFilter) && globalLocationFilter.length === 1 ? globalLocationFilter[0] : 'all')
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>(initialPayload?.projectCode || '');
  const [zoomToUnit, setZoomToUnit] = useState<boolean>(false);
  const [watermark, setWatermark] = useState<'none' | 'draft' | 'confidential'>(printWatermark || 'none');
  const [customRiskNotes, setCustomRiskNotes] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string> | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(null);

  const slidesContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialPayload?.mode) setMode(initialPayload.mode);
    if (initialPayload?.store) setStoreFilter(initialPayload.store);
    if (initialPayload?.year) setYearFilter(initialPayload.year);
    if (initialPayload?.location) setLocationFilter(initialPayload.location);
    if (initialPayload?.projectCode !== undefined) setSearchQuery(initialPayload.projectCode);
    setSelectedIds(null);
  }, [isOpen, initialPayload]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExporting) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  const { availableStores, availableYears, availableLocations } = useMemo(() => {
    const stores = new Set<string>();
    const years = new Set<string>();
    const locs = new Set<string>();
    (projects || []).forEach((p) => {
      if (!p || p.isDeleted) return;
      if (p.store) stores.add(String(p.store).toUpperCase().trim());
      if (p.year) years.add(String(p.year).trim());
      if (p.location) locs.add(normalizeFloorCode(p.location));
    });
    return {
      availableStores: Array.from(stores).sort(),
      availableYears: Array.from(years).sort((a, b) => Number(b) - Number(a)),
      availableLocations: Array.from(locs).filter(Boolean).sort(),
    };
  }, [projects]);

  const { projectSlides, floorSlides } = useExecutiveDeckData({
    storeFilter, yearFilter, locationFilter, statusFilter, searchQuery, customRiskNotes,
  });

  const handleUpdateRiskNote = useCallback((projectId: string, val: string) => {
    setCustomRiskNotes((prev) => ({ ...prev, [projectId]: val }));
  }, []);

  const visibleProjectSlides = useMemo(() => {
    if (!selectedIds) return projectSlides;
    return projectSlides.filter((s) => selectedIds.has(String(s.project.id || s.project.code)));
  }, [projectSlides, selectedIds]);

  const visibleFloorSlides = useMemo(() => {
    if (!selectedIds) return floorSlides;
    return floorSlides.filter((f) => selectedIds.has(f.floorKey));
  }, [floorSlides, selectedIds]);

  const activeSlideCount = mode === 'project' ? visibleProjectSlides.length : visibleFloorSlides.length;

  const toggleItemSelection = (id: string) => {
    const allCurrentIds = mode === 'project'
      ? projectSlides.map((s) => String(s.project.id || s.project.code))
      : floorSlides.map((f) => f.floorKey);
    const currentSet = selectedIds ? new Set(selectedIds) : new Set(allCurrentIds);
    if (currentSet.has(id)) currentSet.delete(id);
    else currentSet.add(id);
    setSelectedIds(currentSet);
  };

  const handleExportPdf = async () => {
    if (isExporting || activeSlideCount === 0) return;
    setIsExporting(true);
    setExportProgress({ current: 1, total: activeSlideCount });

    try {
      const storeTag = storeFilter === 'all' ? 'AllStores' : storeFilter;
      const prefix = mode === 'project' ? `Executive_Project_Deck_${storeTag}` : `Executive_Floor_Deck_${storeTag}`;

      const ok = await exportExecutiveDeckToPdf({
        containerEl: slidesContainerRef.current,
        fileNamePrefix: prefix,
        dpi: printDpi || 200,
        watermark,
        onProgress: (current, total) => setExportProgress({ current, total }),
      });

      if (ok) {
        setToast({
          title: 'Executive Deck Exported',
          message: `Successfully exported ${activeSlideCount} A4 Landscape slide(s) to PDF.`,
          type: 'success',
        });
      }
    } catch (err) {
      console.error('Executive Deck PDF Export error:', err);
      setToast({
        title: 'Export Error',
        message: 'Failed to generate Executive Deck PDF. Please try again.',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-hidden">
      <motion.div
        drag
        dragMomentum={false}
        dragListener={true}
        className="w-full max-w-[1420px] h-[94dvh] bg-slate-900 text-slate-100 rounded-2xl shadow-2xl border border-slate-700/80 flex flex-col overflow-hidden"
      >
        {/* Top Draggable Modal Header */}
        <div className="modal-handle px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing shrink-0 hide-on-actual-print print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <GripHorizontal className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="w-7 h-7 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-red-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                  1-Click Executive Project One-Pager (A4 Landscape Deck)
                </h2>
                <span className="hidden md:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
                  297 × 210 mm
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">
                Auto-layouts Floor Plan Unit Highlight + Budget/Actuals + Key Milestones + Latest Risk Notes onto 1 A4 Landscape slide per Project or Floor.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              disabled={isExporting || activeSlideCount === 0}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
              title="Open native browser print dialog"
            >
              <Printer className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Print Deck</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting || activeSlideCount === 0}
              className="px-4 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/25 text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              <span>
                {isExporting && exportProgress
                  ? `Rendering Slide ${exportProgress.current}/${exportProgress.total}...`
                  : `1-Click Export PDF (${activeSlideCount} ${activeSlideCount === 1 ? 'Slide' : 'Slides'})`}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isExporting}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter & Deck Configuration Bar */}
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 shrink-0 hide-on-actual-print print:hidden">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setMode('project'); setSelectedIds(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'project' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>By Project (1 Slide / Project)</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('floor'); setSelectedIds(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                mode === 'floor' ? 'bg-red-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>By Floor / Level (1 Slide / Floor)</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={storeFilter}
              onChange={(e) => { setStoreFilter(e.target.value); setSelectedIds(null); }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer"
            >
              <option value="all">All Stores</option>
              {availableStores.map((s) => <option key={s} value={s}>Store: {s}</option>)}
            </select>

            <select
              value={yearFilter}
              onChange={(e) => { setYearFilter(e.target.value); setSelectedIds(null); }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer"
            >
              <option value="all">All Years</option>
              {availableYears.map((y) => <option key={y} value={y}>FY {y}</option>)}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setSelectedIds(null); }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer"
            >
              <option value="all">All Floors</option>
              {availableLocations.map((loc) => <option key={loc} value={loc}>Floor: {loc}</option>)}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setSelectedIds(null); }}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active (On Process + Upcoming)</option>
              <option value="On process">On Process</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Completed">Completed</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSelectedIds(null); }}
                placeholder="Filter code or brand..."
                className="bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-6 py-1.5 text-xs font-semibold text-white placeholder-slate-500 outline-none focus:border-red-500 w-44"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {mode === 'project' && (
              <button
                type="button"
                onClick={() => setZoomToUnit((v) => !v)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  zoomToUnit ? 'bg-blue-600/25 border-blue-500 text-blue-300' : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                }`}
                title="Toggle between full floor map and zoomed-in unit view"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                <span>{zoomToUnit ? 'Zoomed to Unit' : 'Full Floor Map'}</span>
              </button>
            )}

            <select
              value={watermark}
              onChange={(e) => setWatermark(e.target.value as 'none' | 'draft' | 'confidential')}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-200 outline-none cursor-pointer"
              title="Slide Watermark"
            >
              <option value="none">Watermark: None</option>
              <option value="draft">Watermark: DRAFT</option>
              <option value="confidential">Watermark: CONFIDENTIAL</option>
            </select>
          </div>
        </div>

        {/* Main Workspace: Left Slide Selector Sidebar + Right A4 Landscape Slide Preview Stream */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <div className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col shrink-0 hidden lg:flex hide-on-actual-print print:hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Slides ({activeSlideCount} Selected)
              </span>
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <button type="button" onClick={() => setSelectedIds(null)} className="text-blue-400 hover:underline cursor-pointer">
                  All
                </button>
                <span className="text-slate-600">/</span>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-white cursor-pointer">
                  None
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {mode === 'project'
                ? projectSlides.map((ps) => {
                    const pId = String(ps.project.id || ps.project.code);
                    const isChecked = !selectedIds || selectedIds.has(pId);
                    return (
                      <button
                        key={pId}
                        type="button"
                        onClick={() => toggleItemSelection(pId)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2 transition-colors cursor-pointer ${
                          isChecked ? 'bg-slate-800/90 text-white border border-slate-700' : 'text-slate-500 hover:bg-slate-900'
                        }`}
                      >
                        {isChecked ? <CheckSquare className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-red-400 truncate">{ps.project.code}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-slate-300">{ps.store}•{ps.location}</span>
                          </div>
                          <div className="truncate font-medium text-slate-200 mt-0.5">{ps.project.name}</div>
                        </div>
                      </button>
                    );
                  })
                : floorSlides.map((fs) => {
                    const isChecked = !selectedIds || selectedIds.has(fs.floorKey);
                    return (
                      <button
                        key={fs.floorKey}
                        type="button"
                        onClick={() => toggleItemSelection(fs.floorKey)}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-start gap-2 transition-colors cursor-pointer ${
                          isChecked ? 'bg-slate-800/90 text-white border border-slate-700' : 'text-slate-500 hover:bg-slate-900'
                        }`}
                      >
                        {isChecked ? <CheckSquare className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /> : <Square className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />}
                        <div className="min-w-0 flex-1">
                          <div className="font-mono font-bold text-red-400">{fs.store} — Floor {fs.location} (FY {fs.year})</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{fs.totalProjects} projects • {fs.totalAreaM2.toLocaleString('en-US')} m²</div>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-slate-900/95 p-4 sm:p-6 flex flex-col items-center gap-6">
            {activeSlideCount === 0 ? (
              <div className="my-auto text-center p-8 bg-slate-950/80 rounded-2xl border border-slate-800 max-w-md">
                <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <div className="text-base font-bold text-white">No Matching Slides Selected</div>
                <p className="text-xs text-slate-400 mt-1">
                  Adjust the Store, Year, Floor, or Search filters above, or click "All" in the sidebar to include projects in your Executive One-Pager Deck.
                </p>
              </div>
            ) : (
              <div ref={slidesContainerRef} className="flex flex-col items-center gap-8 pb-10">
                {mode === 'project'
                  ? visibleProjectSlides.map((slide, idx) => {
                      const pId = String(slide.project.id || slide.project.code);
                      return (
                        <ExecutiveProjectSlideCard
                          key={pId}
                          slide={slide}
                          slideIndex={idx}
                          totalSlides={visibleProjectSlides.length}
                          zoomToUnit={zoomToUnit}
                          customRiskNote={customRiskNotes[pId]}
                          onUpdateRiskNote={handleUpdateRiskNote}
                        />
                      );
                    })
                  : visibleFloorSlides.map((floorSlide, idx) => (
                      <ExecutiveFloorSlideCard
                        key={floorSlide.floorKey}
                        floorSlide={floorSlide}
                        slideIndex={idx}
                        totalSlides={visibleFloorSlides.length}
                      />
                    ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
});

ExecutiveDeckModal.displayName = 'ExecutiveDeckModal';
