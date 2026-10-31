import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useOffscreenImage } from '../../../../hooks/useOffscreenImage';
import { Upload } from 'lucide-react';
import { UnitShape, ShapeType, MapVersion } from './types';
import { useDropzone } from 'react-dropzone';
import { useSummaryData } from '../../lib/summaryData';
import { useAppStore } from '../../../../store/useAppStore';
import { useDynamicUnitSummary } from '../../lib/dynamicSummaryEngine';
import { syncUnitSizeToMatchedProjects } from '../../../../lib/unitSizeResolver';
import { EditTabInspector } from './EditTabParts/EditTabInspector';
import { EditTabModals, createGridPattern } from './EditTabParts/EditTabModals';
import {
  EditTabLeftToolbar,
  EditTabCanvasFloatingControls,
} from './EditTabParts/EditTabToolbars';
import { EditTabCanvasStage } from './EditTabParts/EditTabCanvasStage';
import { useEditTabHandlers } from './EditTabParts/useEditTabHandlers';
import { useEditCopyBackground } from './EditTabParts/useEditCanvasInteractions';
import { resolveR2UrlToHttp } from '../../lib/r2Upload';

interface EditTabProps {
  units: UnitShape[];
  setUnits: (u: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
}

function EditTab({
  units, setUnits, versions, setVersions, activeVersionId, setActiveVersionId,
}: EditTabProps) {
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const effectiveYear =
    globalYearFilter && globalYearFilter !== 'all'
      ? globalYearFilter
      : new Date().getFullYear().toString();
  const summaryData = useSummaryData();
  const masterUnits = React.useMemo(() => {
    const map = new Map<string, { unit: string; floor?: string; size?: string | number }>();
    summaryData.forEach((u) => {
      if (u.unit && u.status === 'Active' && !map.has(u.unit)) {
        map.set(u.unit, { unit: u.unit, floor: String(u.floor), size: String(u.size) });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.unit.localeCompare(b.unit));
  }, [summaryData]);

  const masterUnitOptions = React.useMemo(
    () => masterUnits.map((u) => ({ value: u.unit, label: `${u.unit} (F${u.floor})` })),
    [masterUnits]
  );

  const summaryMap = React.useMemo(() => {
    const map = new Map();
    summaryData.forEach((u) => map.set(u.unit, u));
    return map;
  }, [summaryData]);

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const [isSummaryTableOpen, setIsSummaryTableOpen] = useState(false);

  const emptyUnitsRef = useRef<UnitShape[]>([]);
  const { summaryList: dynamicSummaryList } = useDynamicUnitSummary({
    units: isSummaryTableOpen ? units : emptyUnitsRef.current,
    activeVersion,
    store: (activeVersion?.store as any) || 'HCM',
    location: activeVersion?.location || 'B1',
    year: String(effectiveYear),
  });

  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [bgRotation, setBgRotation] = useState(0);
  const [imagePos, setImagePos] = useState({ x: 0, y: 0 });
  const [imageScale, setImageScale] = useState(1);
  const [alignStep, setAlignStep] = useState<'none' | 'bg1' | 'bg2' | 'target1' | 'target2'>('none');
  const [alignPts, setAlignPts] = useState<{
    bg1?: { x: number; y: number };
    bg2?: { x: number; y: number };
    target1?: { x: number; y: number };
  }>({});
  const [isLocked, setIsLocked] = useState(false);
  const [magneticGrid, setMagneticGrid] = useState(false);

  const [gridSize, setGridSize] = useState(10);
  const [librarySearchTerm] = useState('');
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalNode(document.getElementById('data-mapping-toolbar-portal'));
  }, []);

  const gridPattern = React.useMemo(() => createGridPattern(gridSize), [gridSize]);

  const [isNamingModalOpen, setIsNamingModalOpen] = useState(false);
  const [searchUnit, setSearchUnit] = useState('');
  const [namingCallback, setNamingCallback] = useState<{
    resolve: (name: string) => void;
    reject: () => void;
  } | null>(null);

  const [isCopyBgModalOpen, setIsCopyBgModalOpen] = useState(false);
  const [copyBgSearchTerm, setCopyBgSearchTerm] = useState('');
  const [showAllVersionsForCopy, setShowAllVersionsForCopy] = useState(false);

  const { filteredCopyVersions, handleCopyBackgroundFromVersion } = useEditCopyBackground({
    versions, activeVersionId, activeVersion, effectiveYear: String(effectiveYear),
    showAllVersionsForCopy, copyBgSearchTerm, setLocalImageUrl, setScale, setPosition,
    setBgRotation, setImagePos, setImageScale, setIsLocked, setVersions, setIsCopyBgModalOpen,
  });

  const openNamingModal = useCallback((): Promise<string> => {
    setIsNamingModalOpen(true);
    setSearchUnit('');
    return new Promise((resolve, reject) => {
      setNamingCallback({ resolve, reject });
    });
  }, []);

  const handleSelectUnit = (name: string) => {
    if (namingCallback) namingCallback.resolve(name);
    setIsNamingModalOpen(false);
    setNamingCallback(null);
  };

  const viewPropsRef = React.useRef({ scale, position, bgRotation, imagePos, imageScale, activeVersionId });
  const versionsRef = React.useRef(versions);

  useEffect(() => {
    viewPropsRef.current = { scale, position, bgRotation, imagePos, imageScale, activeVersionId };
  }, [scale, position, bgRotation, imagePos, imageScale, activeVersionId]);

  useEffect(() => { versionsRef.current = versions; }, [versions]);

  useEffect(() => {
    return () => {
      const cur = viewPropsRef.current;
      const curVersions = versionsRef.current;
      if (cur.activeVersionId && curVersions.length > 0) {
        setVersions(
          curVersions.map((v) =>
            v.id === cur.activeVersionId
              ? { ...v, backgroundScale: cur.scale, backgroundPos: cur.position, backgroundRotation: cur.bgRotation, imagePos: cur.imagePos, imageScale: cur.imageScale }
              : v
          )
        );
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (activeVersion) {
      const rawUrl = activeVersion.backgroundUrl || '';
      if (!rawUrl) {
        setLocalImageUrl(null);
      } else if (
        rawUrl.startsWith('r2://') ||
        (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))
      ) {
        resolveR2UrlToHttp(rawUrl)
          .then((url) => { if (isMounted) setLocalImageUrl(url || rawUrl); })
          .catch(() => { if (isMounted) setLocalImageUrl(rawUrl); });
      } else {
        setLocalImageUrl(rawUrl);
      }
      setScale(activeVersion.backgroundScale || 1);
      setPosition(activeVersion.backgroundPos || { x: 0, y: 0 });
      setBgRotation(activeVersion.backgroundRotation || 0);
      setImagePos(activeVersion.imagePos || { x: 0, y: 0 });
      setImageScale(activeVersion.imageScale || 1);
      setIsLocked(true);
    } else {
      setLocalImageUrl(null);
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setBgRotation(0);
      setImagePos({ x: 0, y: 0 });
      setImageScale(1);
      setIsLocked(false);
    }
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersionId, activeVersion?.backgroundUrl]);

  useEffect(() => {
    return () => {
      if (localImageUrl && localImageUrl.startsWith('blob:')) URL.revokeObjectURL(localImageUrl);
    };
  }, [localImageUrl]);

  const [image] = useOffscreenImage(localImageUrl || '', 'anonymous');
  const [activeTool, setActiveTool] = useState<ShapeType | 'select' | 'edit-bg'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedUnit = React.useMemo(() => {
    if (!selectedId) return null;
    return units.find((u) => u && u.id === selectedId) || null;
  }, [units, selectedId]);

  const stageRef = useRef<any>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<UnitShape[][]>([]);

  const handleSetUnitsWithHistory = useCallback(
    (newUnits: UnitShape[]) => {
      setHistory((h) => [...h.slice(-20), units]);
      setUnits(newUnits);
    },
    [units, setUnits]
  );

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length > 0) {
        setUnits(h[h.length - 1]);
        return h.slice(0, -1);
      }
      return h;
    });
  }, [setUnits]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (
        selectedId &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        const step = magneticGrid ? gridSize : e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        setUnits(units.map((u) => (u.id === selectedId ? { ...u, x: (u.x || 0) + dx, y: (u.y || 0) + dy } : u)));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, selectedId, magneticGrid, gridSize, units, setUnits]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
    window.dispatchEvent(new CustomEvent('taka_toggle_mapping_fullscreen'));
  };

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth, h = containerRef.current.clientHeight;
        if (w > 0 && h > 0) setCanvasSize({ width: w, height: h });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    let observer: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) setCanvasSize({ width: Math.round(width), height: Math.round(height) });
        }
      });
      observer.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateSize);
      if (observer) observer.disconnect();
    };
  }, []);

  const handleFitToScreen = useCallback(() => {
    if (!image || !containerRef.current) return;
    const canvasW = canvasSize.width, canvasH = canvasSize.height;
    const imgW = image.width, imgH = image.height;
    if (canvasW <= 0 || canvasH <= 0 || !imgW || !imgH) return;
    const scaleFactor = Math.min(Math.max(100, canvasW - 48) / imgW, Math.max(100, canvasH - 48) / imgH, 1.5);
    setScale(scaleFactor);
    setPosition({ x: Math.round((canvasW - imgW * scaleFactor) / 2), y: Math.round((canvasH - imgH * scaleFactor) / 2) });
  }, [image, canvasSize]);

  useEffect(() => {
    if (image && image.width && image.height && canvasSize.width > 0 && canvasSize.height > 0) {
      if (!activeVersion?.backgroundScale || activeVersion.backgroundScale === 1) handleFitToScreen();
    }
  }, [image, canvasSize.width, canvasSize.height, activeVersionId, activeVersion?.backgroundScale, handleFitToScreen]);

  const filteredUnits = React.useMemo(() => {
    if (!librarySearchTerm.trim()) return units;
    const tokens = librarySearchTerm.toLowerCase().split(/[,\s]+/).filter((t) => t.length > 0);
    return units.filter((u) => tokens.some((token) => (u.name || '').toLowerCase().includes(token)));
  }, [units, librarySearchTerm]);

  const {
    onDrop, handleWheel, handleTouchMove, handleTouchEnd, handleDelete, handleRotate,
    handleRotateBackground, handleExportUnits, handleReplaceBackground,
    handleReloadExternalBackground, handleImportUnits, handleDeleteAll,
    handleToggleAllVisibility, handleToggleAllLock, handleCreateVersion, handleUpdateVersion,
  } = useEditTabHandlers({
    units, filteredUnits, selectedId, setSelectedId, handleSetUnitsWithHistory,
    versions, setVersions, activeVersionId, setActiveVersionId, activeVersion,
    effectiveYear: String(effectiveYear), localImageUrl, setLocalImageUrl,
    setIsLoading, setIsLocked, scale, setScale, position, setPosition,
    bgRotation, setBgRotation, imagePos, imageScale, librarySearchTerm, stageRef,
  });

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'], 'application/pdf': ['.pdf'] },
  });

  return (
    <div className="flex h-full gap-1 p-0.5 overflow-hidden">
      <EditTabLeftToolbar
        activeTool={activeTool} setActiveTool={setActiveTool} selectedId={selectedId}
        selectedUnit={selectedUnit} historyLength={history.length} handleRotate={handleRotate}
        handleUndo={handleUndo} handleDelete={handleDelete} portalNode={portalNode}
        magneticGrid={magneticGrid} setMagneticGrid={setMagneticGrid}
        handleExportUnits={handleExportUnits} handleImportUnits={handleImportUnits}
        activeVersionId={activeVersionId} handleReplaceBackground={handleReplaceBackground}
        handleRotateBackground={handleRotateBackground} isCopyBgModalOpen={isCopyBgModalOpen}
        setCopyBgSearchTerm={setCopyBgSearchTerm} setIsCopyBgModalOpen={setIsCopyBgModalOpen}
      />

      <div className="flex-1 min-h-[320px] rounded-lg border border-slate-800 shadow-lg overflow-hidden relative flex flex-col bg-[#141416]" ref={containerRef}>
        <EditTabCanvasFloatingControls
          activeVersionId={activeVersionId} setActiveVersionId={setActiveVersionId}
          versions={versions} setVersions={setVersions} magneticGrid={magneticGrid}
          gridSize={gridSize} setGridSize={setGridSize} activeTool={activeTool}
          imageScale={imageScale} setImageScale={setImageScale} alignStep={alignStep}
          setAlignStep={setAlignStep} setAlignPts={setAlignPts} localImageUrl={localImageUrl}
          isLocked={isLocked} setIsLocked={setIsLocked} handleCreateVersion={handleCreateVersion}
          handleUpdateVersion={handleUpdateVersion} isSummaryTableOpen={isSummaryTableOpen}
          setIsSummaryTableOpen={setIsSummaryTableOpen} dynamicSummaryCount={dynamicSummaryList.length}
          unitsCount={units.length} setCopyBgSearchTerm={setCopyBgSearchTerm}
          setIsCopyBgModalOpen={setIsCopyBgModalOpen} handleReplaceBackground={handleReplaceBackground}
          handleReloadExternalBackground={handleReloadExternalBackground}
          handleRotateBackground={handleRotateBackground} isFullscreen={isFullscreen}
          toggleFullscreen={toggleFullscreen} scale={scale}
          handleZoomOut={() => setScale((s) => Math.max(s / 1.25, 0.05))}
          handleZoomReset={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
          handleZoomIn={() => setScale((s) => Math.min(s * 1.25, 10))}
          handleFitToScreen={handleFitToScreen}
        />

        {isLoading && (
          <div className="absolute inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto">
            <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin mb-4" />
            <p className="text-sm font-bold text-slate-300 uppercase tracking-widest animate-pulse">Processing File...</p>
          </div>
        )}

        {!localImageUrl && (
          <div {...getRootProps()} className="absolute inset-0 flex items-center justify-center cursor-pointer hover:bg-slate-800/20 transition-colors z-10 pointer-events-auto">
            <input {...getInputProps()} />
            <div className="text-center p-8 bg-slate-900/40 rounded-3xl border border-dashed border-slate-700 max-w-md backdrop-blur-sm">
              <div className="w-16 h-16 bg-brand-600/20 text-brand-400 rounded-2xl mx-auto flex items-center justify-center mb-4">
                <Upload size={32} />
              </div>
              <h3 className="text-xl text-white font-medium mb-2">Start Mapping Units</h3>
              <p className="text-sm text-slate-400">Click or drag & drop to upload a PDF or Image floor plan for this version</p>
            </div>
          </div>
        )}

        {localImageUrl && (
          <EditTabCanvasStage
            canvasSize={canvasSize} scale={scale} position={position} setPosition={setPosition}
            stageRef={stageRef} activeTool={activeTool} setActiveTool={setActiveTool}
            selectedId={selectedId} setSelectedId={setSelectedId} selectedUnit={selectedUnit}
            alignStep={alignStep} setAlignStep={setAlignStep} alignPts={alignPts}
            setAlignPts={setAlignPts} image={image} imagePos={imagePos} setImagePos={setImagePos}
            imageScale={imageScale} setImageScale={setImageScale} bgRotation={bgRotation}
            isLocked={isLocked} magneticGrid={magneticGrid} gridSize={gridSize}
            gridPattern={gridPattern} units={units} summaryMap={summaryMap}
            handleSetUnitsWithHistory={handleSetUnitsWithHistory} openNamingModal={openNamingModal}
            handleWheel={handleWheel} handleTouchMove={handleTouchMove} handleTouchEnd={handleTouchEnd}
          />
        )}
      </div>

      <EditTabInspector
        units={units} selectedId={selectedId} setSelectedId={setSelectedId}
        selectedUnit={selectedUnit} activeVersion={activeVersion} activeVersionId={activeVersionId}
        versions={versions} setVersions={setVersions} effectiveYear={String(effectiveYear)}
        summaryMap={summaryMap} masterUnitOptions={masterUnitOptions}
        handleSetUnitsWithHistory={handleSetUnitsWithHistory}
        syncUnitSizeToMatchedProjects={syncUnitSizeToMatchedProjects}
        setActiveTool={setActiveTool} handleToggleAllVisibility={handleToggleAllVisibility}
        handleToggleAllLock={handleToggleAllLock} handleDeleteAll={handleDeleteAll}
      />

      <EditTabModals
        isNamingModalOpen={isNamingModalOpen} setIsNamingModalOpen={setIsNamingModalOpen}
        namingCallback={namingCallback} searchUnit={searchUnit} setSearchUnit={setSearchUnit}
        handleSelectUnit={handleSelectUnit} masterUnits={masterUnits}
        isCopyBgModalOpen={isCopyBgModalOpen} setIsCopyBgModalOpen={setIsCopyBgModalOpen}
        activeVersion={activeVersion} effectiveYear={String(effectiveYear)}
        copyBgSearchTerm={copyBgSearchTerm} setCopyBgSearchTerm={setCopyBgSearchTerm}
        showAllVersionsForCopy={showAllVersionsForCopy}
        setShowAllVersionsForCopy={setShowAllVersionsForCopy}
        filteredCopyVersions={filteredCopyVersions}
        handleCopyBackgroundFromVersion={handleCopyBackgroundFromVersion}
        isSummaryTableOpen={isSummaryTableOpen} setIsSummaryTableOpen={setIsSummaryTableOpen}
        dynamicSummaryList={dynamicSummaryList} selectedId={selectedId} setSelectedId={setSelectedId}
      />
    </div>
  );
}

export default React.memo(EditTab);
