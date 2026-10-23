import React, { FC, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, FileText, Crosshair, X, GripHorizontal } from 'lucide-react';
import { cn, extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata } from '../../lib/utils';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { LayoutUnitLightboxModal } from './LayoutUnitLightboxModal';
import { LayoutUnitTooltipProps, getMdStatusColorClass } from './TooltipParts/tooltipTypes';
import { useTooltipPosition } from './TooltipParts/useTooltipPosition';
import { useTooltipImages } from './TooltipParts/useTooltipImages';
import { TooltipHeaderBar } from './TooltipParts/TooltipHeaderBar';
import { TooltipTitleSection } from './TooltipParts/TooltipTitleSection';
import { TooltipAlertBanner } from './TooltipParts/TooltipAlertBanner';
import { TooltipProgressBars } from './TooltipParts/TooltipProgressBars';
import { TooltipMetaRow } from './TooltipParts/TooltipMetaRow';
import { TooltipDetailsSection } from './TooltipParts/TooltipDetailsSection';
import { TooltipImageGalleryPanel } from './TooltipParts/TooltipImageGalleryPanel';
import { getZIndexClass, useOverlayStack } from '../../lib/zIndexManager';

export { getMdStatusColorClass };
export type { LayoutUnitTooltipProps };

export const LayoutUnitTooltip: React.FC<LayoutUnitTooltipProps> = ({
  hoverInfo,
  tooltipRef,
  containerRef,
  onClose,
  onEditProject,
  onOpenMiniGantt,
  onFocusUnit,
  canWrite = false,
  storeFilter = 'HCM'
}) => {
  const { enrichedProjects: projects } = useEnrichedData();
  const vis = useAppStore(state => state.layoutTooltipVisibility);
  const data = hoverInfo?.data || {};
  const initialP: Project | undefined = data.matchedProject;

  const [isQuickImageView, setIsQuickImageView] = useState<boolean>(Boolean(hoverInfo?.quickImageMode));
  useEffect(() => {
    setIsQuickImageView(Boolean(hoverInfo?.quickImageMode));
  }, [hoverInfo?.quickImageMode, hoverInfo?.unitName]);

  const p: Project | undefined = useMemo(() => {
    const expectedStore = (
      data.store ||
      (storeFilter && storeFilter.toUpperCase() !== 'ALL' ? storeFilter : '') ||
      'HCM'
    ).toUpperCase().trim();

    const expectedYear = String(data.year || useAppStore.getState().globalYearFilter || '').trim();

    if (initialP?.id) {
      const found = projects.find(item => String(item.id) === String(initialP.id));
      if (found) return found;
    }

    const targetCode = String(data.appProjectCode || data.code || hoverInfo.unitName || '').trim().toLowerCase();
    if (targetCode) {
      const found = projects.find(item => {
        const itemMeta = extractProjectMetadata(item);
        if (expectedStore && itemMeta.store && itemMeta.store !== expectedStore) {
          return false;
        }
        if (expectedYear && expectedYear !== 'all' && itemMeta.year && itemMeta.year !== 'ALL' && itemMeta.year !== expectedYear) {
          return false;
        }
        const itemUnitCodes = extractAllProjectCodes(item).map(c => c.toLowerCase());
        return itemUnitCodes.includes(targetCode) || projectMatchesUnitCode(itemUnitCodes, targetCode);
      });
      if (found) return found;
    }

    if (initialP) return initialP;
    return undefined;
  }, [initialP, data.hasAppProject, data.matchedProject, data.appProjectCode, data.code, data.store, data.year, hoverInfo.unitName, projects, storeFilter]);

  const activeYearFilter = String(data.year || useAppStore.getState().globalYearFilter || '').trim();
  const isDataMatchingActiveYear = !data.hasAppProject || !data.year || data.year === 'all' || activeYearFilter === 'all' || data.year === activeYearFilter;
  const hasProject = Boolean(p || (data.hasAppProject && isDataMatchingActiveYear));

  const unitCode = p?.code || hoverInfo.unitName;
  const storeDisplay = (p?.store || data.store || storeFilter || 'HCM').toUpperCase().trim();
  const projectName = p?.name || (hasProject ? (data.projectName || data.brandName || '') : '');
  const floorValue = data.floor || (p as any)?.floor;

  const targetProject: Project = p || ({
    id: `unit_${unitCode}`,
    code: unitCode,
    name: projectName || unitCode,
    store: storeDisplay,
    location: floorValue ? String(floorValue) : undefined,
  } as Project);

  // Status computation
  const status = hasProject ? (p?.computedStatus || data.appProjectStatus || data.status || 'On process') : '';
  
  let statusColorClass = 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  const lowerStatus = String(status).toLowerCase();
  if (lowerStatus.includes('completed') || lowerStatus.includes('done')) {
    statusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200 dark:border-emerald-800';
  } else if (lowerStatus.includes('handover')) {
    statusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200 dark:border-blue-900/60';
  } else if (lowerStatus.includes('on process') || lowerStatus.includes('process')) {
    statusColorClass = 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/60';
  } else if (lowerStatus.includes('delay') || lowerStatus.includes('canceled') || lowerStatus.includes('late')) {
    statusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/60';
  } else if (lowerStatus.includes('ready')) {
    statusColorClass = 'bg-amber-50 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-900/60';
  }

  // MD Status from project or layout data
  const rawMdStatus = p?.mdStatus || data.mdStatus || (p as any)?.md_status || (data as any)?.md_status || '';
  const mdStatus = (rawMdStatus && rawMdStatus !== '-' && String(rawMdStatus).trim().toLowerCase() !== 'null') 
    ? String(rawMdStatus).trim() 
    : '';
  const mdStatusColorClass = getMdStatusColorClass(mdStatus);

  // Progress metrics
  const planProgressPercent = hasProject ? (p?.computedPlanProgress ?? data.planProgressPercent ?? 0) : 0;
  const actProgressPercent = hasProject ? (p?.computedActProgress ?? data.actProgressPercent ?? 0) : 0;

  // Dates & Comments
  const computedTakStart = hasProject ? (p?.computedTakStart || p?.start || data.startDate || '') : '';
  const computedTakCompl = hasProject ? (p?.computedTakCompl || p?.handover || data.handoverDate || '') : '';
  const commentsCount = p?.comments?.length || 0;

  // Task lines & Details (Strictly matching General Tab logic - pure work tasks only)
  const isUrlOrPhotoLine = (str: string | undefined | null) => {
    if (!str || typeof str !== 'string') return false;
    const lower = str.toLowerCase().trim();
    return (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('link / photo:') ||
      lower.startsWith('link:') ||
      lower.startsWith('photo:') ||
      lower.startsWith('image:') ||
      lower.includes('.jpg') ||
      lower.includes('.jpeg') ||
      lower.includes('.png') ||
      lower.includes('.webp') ||
      lower.includes('.gif')
    );
  };

  const rawTaskLines: string[] = (data.taskLines && Array.isArray(data.taskLines) && data.taskLines.length > 0)
    ? data.taskLines
    : (() => {
        if (!p) return [];
        const now = new Date();
        let activeTaskNames: string[] = [];
        if (p.taskSummaries && p.taskSummaries.length > 0) {
          const activeTasks = p.taskSummaries.filter(t => {
            if (!t.start || !t.finish) return false;
            const start = new Date(t.start);
            const finish = new Date(t.finish);
            return now >= start && now <= finish;
          });
          activeTaskNames = activeTasks.map(t => t.name).filter(Boolean);
        }
        const lines: string[] = [];
        activeTaskNames.forEach(name => {
          lines.push(...name.split('\n').map((l: string) => l.trim()).filter((l: string) => l !== ''));
        });
        return Array.from(new Set(lines));
      })();

  const taskLines = Array.from(new Set(rawTaskLines.filter(line => !isUrlOrPhotoLine(line))));

  const rawDetailText = p?.detail || data.detail || data.appProjectDetail || data.appDetail || '';
  const detailText = isUrlOrPhotoLine(rawDetailText) ? '' : rawDetailText;
  const rawDescText = (p as any)?.description || (p?.detail !== detailText ? p?.detail : '') || data.appProjectDescription || data.appDescription || data.description || '';
  const descriptionText = isUrlOrPhotoLine(rawDescText) ? '' : rawDescText;

  const positionTooltipRef = React.useRef<(forceRecalculate?: boolean) => void>(() => {});

  // Hook 2: Images & Gallery management
  const {
    showImagePanel,
    setShowImagePanel,
    showAddLinkInput,
    setShowAddLinkInput,
    newLinkInput,
    setNewLinkInput,
    copiedLink,
    enlargedImage,
    setEnlargedImage,
    allUnitImages,
    handleAddCustomImage,
    handleDeleteCustomImage,
    handleCopyLink,
  } = useTooltipImages({
    p,
    data,
    unitCode,
    tooltipRef,
    positionTooltip: (force) => positionTooltipRef.current(force),
    storeFilter: storeDisplay,
    quickImageMode: isQuickImageView,
    canWrite,
  });

  // Hook 1: Position & Dragging management
  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    positionTooltip,
  } = useTooltipPosition({
    hoverInfo,
    tooltipRef,
    containerRef,
    showImagePanel: isQuickImageView || showImagePanel,
  });

  positionTooltipRef.current = positionTooltip;

  // Safe fallback if vis is undefined
  const v = vis || {
    projectCode: true,
    projectName: true,
    mdStatus: true,
    actStatus: true,
    legendColor: true,
    floor: true,
    startDate: true,
    endDate: true,
    detail: true,
    description: true,
    progressBars: true,
    area: true,
  };

  const zInfo = useOverlayStack({
    layer: 'LAYOUT_TOOLTIP',
    isOpen: !!hoverInfo?.visible,
    onClose,
    closeOnTabChange: true
  });

  const tooltipElement = createPortal(
    <div 
      ref={tooltipRef}
      className={cn(
        "fixed pointer-events-auto rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xl p-2.5 sm:p-3 flex flex-col gap-2 transition-all duration-150 select-none",
        zInfo.zClass,
        "bg-white dark:bg-[#1e1e20] text-slate-800 dark:text-slate-100",
        "overflow-y-auto custom-scrollbar overscroll-contain touch-pan-y"
      )}
      style={{ 
        position: 'fixed',
        transformOrigin: 'top left',
        touchAction: 'pan-y'
      }}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        if (!(e.target as HTMLElement).closest('.cursor-grab, .modal-handle')) {
          e.stopPropagation();
        }
      }}
    >
      {isQuickImageView ? (
        /* Dedicated Quick Image Tooltip Mode (Bypasses Task Tooltip) */
        <>
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              handlePointerDown(e);
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="modal-handle sticky top-0 z-30 bg-white/95 dark:bg-[#1e1e20]/95 backdrop-blur-md pb-1.5 pt-0.5 -mt-1 -mx-1 px-1 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-white font-mono text-[10px] font-bold shrink-0 shadow-2xs">
                <ImageIcon className="w-3 h-3 shrink-0" />
                <span>{unitCode}</span>
              </span>
              {allUnitImages.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono shrink-0 font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-[#8ab4f8]">
                  {allUnitImages.length}
                </span>
              )}
              {projectName && projectName !== unitCode && (
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate" title={projectName}>
                  {projectName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsQuickImageView(false);
                }}
                className="px-2 py-1 rounded-md bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-[#8ab4f8] border border-slate-200 dark:border-[#444446] text-[10px] font-bold flex items-center gap-1 transition-colors active:scale-95 touch-manipulation cursor-pointer"
                title="Switch to Task & Unit Info Tooltip"
              >
                <FileText className="w-3 h-3" />
                <span>Task Info</span>
              </button>
              {onFocusUnit && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusUnit(unitCode || hoverInfo.unitName);
                  }}
                  className="p-1 rounded-md bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-amber-950/50 dark:hover:text-amber-400 border border-slate-200 dark:border-[#444446] transition-colors active:scale-95 touch-manipulation cursor-pointer"
                  title="Zoom & Center this unit"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="Close Quick Image Tooltip"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <TooltipImageGalleryPanel
            showImagePanel={true}
            setShowImagePanel={(val) => {
              const next = typeof val === 'function' ? val(true) : val;
              if (!next) onClose();
              else setShowImagePanel(next);
            }}
            showAddLinkInput={false}
            setShowAddLinkInput={setShowAddLinkInput}
            newLinkInput={newLinkInput}
            setNewLinkInput={setNewLinkInput}
            allUnitImages={allUnitImages}
            copiedLink={copiedLink}
            handleAddCustomImage={handleAddCustomImage}
            handleDeleteCustomImage={handleDeleteCustomImage}
            handleCopyLink={handleCopyLink}
            setEnlargedImage={setEnlargedImage}
            unitCode={unitCode || data.code || ''}
            activeStore={storeDisplay}
            isQuickMode={true}
            canWrite={canWrite}
          />
        </>
      ) : (
        /* Standard Task & Unit Tooltip Mode */
        <>
          {/* 1. Header Bar: Badges, Drag Handle & Action Buttons */}
          <TooltipHeaderBar
            v={v}
            mdStatus={mdStatus}
            mdStatusColorClass={mdStatusColorClass}
            status={status}
            statusColorClass={statusColorClass}
            allUnitImages={allUnitImages}
            showImagePanel={showImagePanel}
            setShowImagePanel={setShowImagePanel}
            targetProject={targetProject}
            unitCode={unitCode}
            unitName={hoverInfo.unitName}
            onFocusUnit={onFocusUnit}
            onClose={onClose}
            handlePointerDown={handlePointerDown}
            handlePointerMove={handlePointerMove}
            handlePointerUp={handlePointerUp}
          />

          {/* 2. Full-Width Task / Unit Title Section */}
          <TooltipTitleSection
            v={v}
            p={p}
            canWrite={canWrite}
            storeDisplay={storeDisplay}
            unitCode={unitCode}
            projectName={projectName}
            onEditProject={onEditProject}
          />

          {/* 3. Smart Alert Notification Banner */}
          <TooltipAlertBanner
            alerts={data.alerts}
            visNotifications={vis?.notifications}
            p={p}
            canWrite={canWrite}
            onEditProject={onEditProject}
          />

          {/* 4. Progress Bars */}
          {v.progressBars && (
            <TooltipProgressBars
              planProgressPercent={planProgressPercent}
              actProgressPercent={actProgressPercent}
            />
          )}

          {/* 5. Unified Information Row: Floor, Area, Comment Symbol & Dates */}
          <TooltipMetaRow
            v={v}
            p={p}
            canWrite={canWrite}
            floorValue={floorValue}
            dataSize={p?.sizeM2 ?? (p as any)?.size ?? (p as any)?.area ?? data.sizeM2 ?? data.size ?? data.area ?? 0}
            commentsCount={commentsCount}
            computedTakStart={computedTakStart}
            computedTakCompl={computedTakCompl}
            onEditProject={onEditProject}
            onOpenMiniGantt={onOpenMiniGantt}
          />

          {/* 6. Details & Description Section */}
          <TooltipDetailsSection
            v={v}
            taskLines={taskLines}
            detailText={detailText}
            descriptionText={descriptionText}
          />

          {/* 7. Image & Link Thumbnail Gallery Panel */}
          <TooltipImageGalleryPanel
            showImagePanel={showImagePanel}
            setShowImagePanel={setShowImagePanel}
            showAddLinkInput={showAddLinkInput}
            setShowAddLinkInput={setShowAddLinkInput}
            newLinkInput={newLinkInput}
            setNewLinkInput={setNewLinkInput}
            allUnitImages={allUnitImages}
            copiedLink={copiedLink}
            handleAddCustomImage={handleAddCustomImage}
            handleDeleteCustomImage={handleDeleteCustomImage}
            handleCopyLink={handleCopyLink}
            setEnlargedImage={setEnlargedImage}
            unitCode={unitCode || data.code || ''}
            activeStore={storeDisplay}
            canWrite={canWrite}
          />
        </>
      )}
    </div>,
    document.body
  );

  return (
    <>
      {tooltipElement}
      {/* 8. Enlarged Image Lightbox Modal - Mounted as clean top-level sibling portal */}
      {enlargedImage && (
        <LayoutUnitLightboxModal
          enlargedImage={enlargedImage}
          onClose={() => setEnlargedImage(null)}
          onCopyLink={handleCopyLink}
          copiedLink={copiedLink}
        />
      )}
    </>
  );
};

export default LayoutUnitTooltip;
