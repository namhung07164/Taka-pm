import React, { useState, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import { useOffscreenImage } from '../../../../hooks/useOffscreenImage';
import { Layout, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { UnitShape, MapVersion } from './types';
import { useSummaryData } from '../../lib/summaryData';
import { useDataStore } from '../../DataContext';
import { useAppStore } from '../../../../store/useAppStore';
import { applyAllDynamicRulesForStore } from '../../lib/dynamicExportService';
import { initAuth, googleSignIn, getAccessToken } from '../../lib/auth';
import R2UploadModal from '../R2UploadModal';
import { uploadFilesToR2, resolveR2UrlToHttp } from '../../lib/r2Upload';
import { useDynamicUnitSummary } from '../../lib/dynamicSummaryEngine';
import { ReviewCanvasUnitShape } from './ReviewTabParts/ReviewCanvasUnitShape';
import { ExportAllManager } from './ReviewTabParts/ExportAllManager';
import { ReviewTabModals } from './ReviewTabParts/ReviewTabModals';
import {
  useReviewFilteredVersions,
  useReviewStyledUnits,
  useReviewCanvasZoom,
} from './ReviewTabParts/useReviewStyledUnits';
import {
  ReviewTabHeader,
  ReviewTabLegendSidebar,
} from './ReviewTabParts/ReviewTabHeaderAndSidebar';

export { ExportAllManager };

interface ReviewTabProps {
  units: UnitShape[];
  setUnits: (units: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (versions: MapVersion[]) => void;
  activeVersionId?: string | null;
  store?: 'HCM' | 'HN';
  location?: string;
  year?: string;
}

function ReviewTab({
  units, setUnits, versions, setVersions,
  activeVersionId: initialActiveVersionId, store: propStore, location: propLocation,
}: ReviewTabProps) {
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);

  const {
    store: storeFromState, location: locationFromState,
    reviewSelectedLabels: selectedLabels, setReviewSelectedLabels: setSelectedLabels,
    reviewLabelColors, setReviewLabelColors,
  } = useDataStore(
    useShallow((state) => ({
      store: state.store, location: state.location,
      reviewSelectedLabels: state.reviewSelectedLabels,
      reviewLabelColors: state.reviewLabelColors,
      setReviewLabelColors: state.setReviewLabelColors,
      setReviewSelectedLabels: state.setReviewSelectedLabels,
    }))
  );

  const store = propStore || storeFromState || 'HCM';
  const location = propLocation || locationFromState || 'L1';

  const availableYears = React.useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = projects.map((p) => (p.year ? String(p.year) : '')).filter(Boolean);
    const taskYears = tasks.map((t) => (t.projectYear ? String(t.projectYear) : '')).filter(Boolean);
    const versionYears = versions.map((v) => (v.year ? String(v.year) : '')).filter(Boolean);
    return Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears, ...versionYears]))
      .filter((y) => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
  }, [projects, tasks, versions]);

  const effectiveYear =
    globalYearFilter && globalYearFilter !== 'all'
      ? globalYearFilter
      : availableYears[0] || new Date().getFullYear().toString();

  const filteredVersions = useReviewFilteredVersions({
    versions, store, location, effectiveYear: String(effectiveYear),
  });

  const [activeVersionId, setActiveVersionId] = useState<string | null>(
    initialActiveVersionId || filteredVersions[0]?.id || null
  );

  useEffect(() => {
    if (initialActiveVersionId && filteredVersions.some((v) => v.id === initialActiveVersionId)) {
      setActiveVersionId((prev) => (prev !== initialActiveVersionId ? initialActiveVersionId : prev));
    } else if (filteredVersions.length > 0) {
      setActiveVersionId((prev) => (prev && filteredVersions.some((v) => v.id === prev) ? prev : filteredVersions[0].id));
    } else if (filteredVersions.length === 0) {
      setActiveVersionId((prev) => (prev !== null ? null : prev));
    }
  }, [initialActiveVersionId, filteredVersions]);

  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const summaryData = useSummaryData();

  const { summaryMap: dynamicSummaryMap, summaryList: dynamicSummaryList } = useDynamicUnitSummary({
    units, activeVersion,
    store: (activeVersion?.store as any) || store,
    location: activeVersion?.location || location,
    year: String(effectiveYear),
  });

  const [isSummaryTableOpen, setIsSummaryTableOpen] = useState(false);
  const [selectedReviewUnitId, setSelectedReviewUnitId] = useState<string | null>(null);
  const [showLabelSettings, setShowLabelSettings] = useState(false);

  const styledUnits = useReviewStyledUnits({
    units, activeVersion, summaryData, dynamicSummaryMap, selectedLabels, location,
  });

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');
  useEffect(() => {
    let isMounted = true;
    const rawUrl = activeVersion?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl('');
      return;
    }
    if (
      rawUrl.startsWith('r2://') ||
      (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))
    ) {
      resolveR2UrlToHttp(rawUrl)
        .then((url) => { if (isMounted) setResolvedBgUrl(url || rawUrl); })
        .catch(() => { if (isMounted) setResolvedBgUrl(rawUrl); });
    } else {
      setResolvedBgUrl(rawUrl);
    }
    return () => { isMounted = false; };
  }, [activeVersion?.backgroundUrl]);

  const [image] = useOffscreenImage(resolvedBgUrl || activeVersion?.backgroundUrl || '', 'anonymous');
  const [scale, setScale] = useState(activeVersion?.backgroundScale || 1);
  const [position, setPosition] = useState(activeVersion?.backgroundPos || { x: 0, y: 0 });
  const [copiedLink, setCopiedLink] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImage] = useState<string | null>(null);
  const [actualShareLink] = useState('');

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(actualShareLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const [exportAllFormat, setExportAllFormat] = useState<'pdf' | 'jpeg' | 'r2_jpeg' | 'drive' | null>(null);
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'jpeg' | 'r2_jpeg' | 'drive'>('pdf');
  const [exportPaperSize, setExportPaperSize] = useState<'a4' | 'a3' | 'a2' | 'original'>(
    () => (localStorage.getItem('export_paper_size') as any) || 'a4'
  );
  const [exportQuality, setExportQuality] = useState<'high' | 'medium' | 'low'>(
    () => (localStorage.getItem('export_quality') as any) || 'medium'
  );
  const [selectedVersionsToExport, setSelectedVersionsToExport] = useState<Record<string, boolean>>({});
  const [showR2Modal, setShowR2Modal] = useState(false);
  const [isUploadingToR2, setIsUploadingToR2] = useState(false);
  const [r2UploadProgress, setR2UploadProgress] = useState(0);
  const [r2StatusMessage, setR2StatusMessage] = useState('');

  const handleExportAllManagerComplete = async (success: boolean, data?: any) => {
    if (exportAllFormat === 'r2_jpeg') {
      if (!success || !data || (Array.isArray(data) && data.length === 0)) {
        alert('Lỗi tạo ảnh JPEG cho bản vẽ.');
        setExportAllFormat(null);
        setIsUploadingToR2(false);
        setShowR2Modal(false);
        return;
      }
      setIsUploadingToR2(true);
      setShowR2Modal(true);
      try {
        const filesToUpload = Array.isArray(data) ? data : [{ blob: data as Blob, name: 'Data_Mapping_Export' }];
        const uploadResult = await uploadFilesToR2(filesToUpload, ({ percent, statusText }) => {
          setR2UploadProgress(percent);
          setR2StatusMessage(statusText);
        });
        if (uploadResult.failedCount === 0) {
          alert(`Upload thành công ${uploadResult.successCount} bản vẽ lên Cloudflare R2!`);
        } else {
          const failedNames = uploadResult.results.filter((r) => !r.success).map((r) => `${r.name}: ${r.error}`).join('\n- ');
          alert(`Upload: ${uploadResult.successCount}/${uploadResult.total} thành công.\nThất bại:\n- ${failedNames}`);
        }
      } catch (err: any) {
        alert('Lỗi upload Cloudflare R2: ' + (err.message || 'Lỗi không xác định'));
      } finally {
        setIsUploadingToR2(false);
        setShowR2Modal(false);
        setExportAllFormat(null);
        setR2UploadProgress(0);
        setR2StatusMessage('');
      }
    } else {
      setExportAllFormat(null);
    }
  };

  useEffect(() => {
    const unsubscribe = initAuth();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const savedSelStr = localStorage.getItem('export_selected_versions');
    let savedSel: Record<string, boolean> = {};
    try { if (savedSelStr) savedSel = JSON.parse(savedSelStr); } catch (_e) {}
    const sel: Record<string, boolean> = {};
    versions.forEach((v) => { sel[v.id] = typeof savedSel?.[v.id] === 'boolean' ? savedSel[v.id] : true; });
    setSelectedVersionsToExport(sel);
  }, [versions]);

  useEffect(() => {
    if (Object.keys(selectedVersionsToExport).length > 0) {
      localStorage.setItem('export_selected_versions', JSON.stringify(selectedVersionsToExport));
    }
  }, [selectedVersionsToExport]);

  useEffect(() => { localStorage.setItem('export_paper_size', exportPaperSize); }, [exportPaperSize]);
  useEffect(() => { localStorage.setItem('export_quality', exportQuality); }, [exportQuality]);

  const handleExportClick = async (format: 'pdf' | 'jpeg' | 'r2_jpeg' | 'drive') => {
    if (format === 'drive') {
      let token = await getAccessToken();
      if (!token) {
        const res = await googleSignIn().catch(() => null);
        if (res) token = res.accessToken;
      }
      if (!token) return;
    }
    if (format === 'r2_jpeg') {
      const targetId = activeVersionId || versions[0]?.id;
      if (targetId) setSelectedVersionsToExport({ [targetId]: true });
    }
    setExportFormat(format);
    setExportModalVisible(true);
  };

  const handleConfirmExport = () => {
    setExportModalVisible(false);
    if (exportFormat === 'r2_jpeg') setShowR2Modal(true);
    else setExportAllFormat(exportFormat);
  };

  const unitMap = React.useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  const applyAllDynamicRules = () => {
    try {
      applyAllDynamicRulesForStore(store);
      setVersions(useDataStore.getState().getAllStoreVersions(store));
      setUnits(useDataStore.getState().getAllStoreUnits(store));
      alert(`Đã áp dụng điều kiện logic cho toàn bộ các version trên tất cả các tầng tại ${store}.`);
    } catch (err: any) {
      alert(`Có lỗi xảy ra khi áp dụng rules: ${err?.message || err}`);
    }
  };

  const [isReviewSidebarCollapsed, setIsReviewSidebarCollapsed] = useState(false);

  const handleFitToScreen = () => {
    if (!image || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;
    if (containerW <= 0 || containerH <= 0) return;
    const imgW = (image.width || 1000) * (activeVersion?.imageScale || 1);
    const imgH = (image.height || 800) * (activeVersion?.imageScale || 1);
    const fitScale = Math.min((containerW - 40) / imgW, (containerH - 40) / imgH, 1.5);
    const clampedScale = Math.max(0.05, Math.min(fitScale, 5));
    setScale(clampedScale);
    setPosition({ x: (containerW - imgW * clampedScale) / 2, y: (containerH - imgH * clampedScale) / 2 });
  };

  useEffect(() => {
    if (activeVersion) {
      setScale(activeVersion.backgroundScale || 1);
      setPosition(activeVersion.backgroundPos || { x: 0, y: 0 });
    }
  }, [activeVersionId, activeVersion]);

  useEffect(() => {
    if (image && containerRef.current && (!activeVersion?.backgroundScale || activeVersion.backgroundScale === 1)) {
      handleFitToScreen();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

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
  }, [activeVersion?.id]);

  const { handleWheel, handleTouchMove, handleTouchEnd } = useReviewCanvasZoom({ stageRef, setScale, setPosition });

  if (!activeVersion) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 italic">
        <Layout size={48} className="mb-4 opacity-20" />
        <p>Không có phiên bản nào. Hãy tạo phiên bản trong Edit hoặc Hierarchy tab.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-1 p-0.5 overflow-hidden">
      <ReviewTabHeader
        isSummaryTableOpen={isSummaryTableOpen}
        setIsSummaryTableOpen={setIsSummaryTableOpen}
        dynamicSummaryCount={dynamicSummaryList.length}
        applyAllDynamicRules={applyAllDynamicRules}
        handleExportClick={handleExportClick}
        showLabelSettings={showLabelSettings}
        setShowLabelSettings={setShowLabelSettings}
        reviewLabelColors={reviewLabelColors}
        setReviewLabelColors={setReviewLabelColors}
        selectedLabels={selectedLabels}
        setSelectedLabels={setSelectedLabels}
        effectiveYear={String(effectiveYear)}
        setGlobalYearFilter={setGlobalYearFilter}
        availableYears={availableYears}
        activeVersionId={activeVersionId}
        setActiveVersionId={setActiveVersionId}
        filteredVersions={filteredVersions}
        store={store}
        location={location}
      />

      <div className="flex-1 flex gap-1 overflow-hidden">
        <div className="flex-1 min-h-[320px] rounded-lg border border-slate-800 shadow-lg overflow-hidden relative bg-[#141416]" ref={containerRef}>
          <div className="absolute bottom-1.5 left-1.5 z-20 flex items-center gap-0.5 p-0.5 bg-slate-900/90 border border-slate-700/80 rounded-md backdrop-blur-md shadow-lg pointer-events-auto">
            <button onClick={() => setScale((prev) => Math.max(0.05, prev / 1.2))} className="p-0.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors" title="Thu nhỏ (Zoom Out)">
              <ZoomOut size={11} />
            </button>
            <button onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }} className="px-1 py-0.5 hover:bg-slate-800 text-slate-200 hover:text-white rounded transition-colors text-[9px] font-mono font-bold min-w-[34px] text-center" title="Đặt lại 100%">
              {Math.round(scale * 100)}%
            </button>
            <button onClick={() => setScale((prev) => Math.min(10, prev * 1.2))} className="p-0.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors" title="Phóng to (Zoom In)">
              <ZoomIn size={11} />
            </button>
            <div className="w-px h-3 bg-slate-700 mx-0.5" />
            <button onClick={handleFitToScreen} className="px-1.5 py-0.5 bg-brand-600/25 hover:bg-brand-600/40 text-brand-300 hover:text-brand-200 border border-brand-500/40 rounded transition-colors text-[9px] font-bold flex items-center gap-1 shadow-sm" title="Tự động căn vừa màn hình (Fit to Screen)">
              <Maximize2 size={10} />
              <span>Vừa Màn Hình</span>
            </button>
          </div>

          <Stage
            ref={stageRef} width={canvasSize.width} height={canvasSize.height}
            onWheel={handleWheel} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
            onDragEnd={(e) => { if (e.target === stageRef.current) setPosition({ x: e.target.x(), y: e.target.y() }); }}
            scaleX={scale} scaleY={scale} x={position.x} y={position.y} draggable
          >
            <Layer>
              {image && (
                <KonvaImage
                  image={image} listening={false} perfectDrawEnabled={false}
                  x={activeVersion?.imagePos?.x || 0} y={activeVersion?.imagePos?.y || 0}
                  scaleX={activeVersion?.imageScale || 1} scaleY={activeVersion?.imageScale || 1}
                  rotation={activeVersion?.backgroundRotation || 0}
                />
              )}
              {(() => {
                const showReviewLabels = scale > 0.3;
                const quantizedScale = Math.max(0.3, Math.round(scale * 4) / 4);
                return styledUnits.map((unit: any) => (
                  <ReviewCanvasUnitShape
                    key={unit.id} unit={unit} isSelected={selectedReviewUnitId === unit.id}
                    showLabel={showReviewLabels} quantizedScale={quantizedScale} reviewLabelColors={reviewLabelColors}
                  />
                ));
              })()}
            </Layer>
          </Stage>
        </div>

        <ReviewTabLegendSidebar
          isReviewSidebarCollapsed={isReviewSidebarCollapsed}
          setIsReviewSidebarCollapsed={setIsReviewSidebarCollapsed}
          activeVersion={activeVersion}
          effectiveYear={String(effectiveYear)}
          unitMap={unitMap}
        />
      </div>

      <ReviewTabModals
        isSummaryTableOpen={isSummaryTableOpen} setIsSummaryTableOpen={setIsSummaryTableOpen}
        activeVersion={activeVersion} store={store} location={location} effectiveYear={String(effectiveYear)}
        dynamicSummaryList={dynamicSummaryList} selectedReviewUnitId={selectedReviewUnitId}
        setSelectedReviewUnitId={setSelectedReviewUnitId} showShareModal={showShareModal}
        setShowShareModal={setShowShareModal} shareImage={shareImage} actualShareLink={actualShareLink}
        copyToClipboard={copyToClipboard} copiedLink={copiedLink} exportModalVisible={exportModalVisible}
        setExportModalVisible={setExportModalVisible} exportFormat={exportFormat}
        exportPaperSize={exportPaperSize} setExportPaperSize={setExportPaperSize}
        exportQuality={exportQuality} setExportQuality={setExportQuality}
        handleConfirmExport={handleConfirmExport} selectedVersionsToExport={selectedVersionsToExport}
        setSelectedVersionsToExport={setSelectedVersionsToExport} versions={versions} activeVersionId={activeVersionId}
      />

      {exportAllFormat && (
        <ExportAllManager
          versions={versions.filter((v) => selectedVersionsToExport[v.id])} units={units}
          summaryData={summaryData} dynamicSummaryMap={dynamicSummaryMap} format={exportAllFormat}
          paperSize={exportPaperSize} quality={exportQuality} selectedLabels={selectedLabels}
          reviewLabelColors={reviewLabelColors} onComplete={handleExportAllManagerComplete}
        />
      )}

      <R2UploadModal
        isOpen={showR2Modal}
        onClose={() => { if (!isUploadingToR2) { setShowR2Modal(false); setExportAllFormat(null); } }}
        onStartExport={() => setExportAllFormat('r2_jpeg')}
        uploading={isUploadingToR2} uploadProgress={r2UploadProgress} statusMessage={r2StatusMessage}
      />
    </div>
  );
}

export default React.memo(ReviewTab);
