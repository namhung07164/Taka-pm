import React, { FC, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
    showImagePanel: false,
  });

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
    positionTooltip,
    storeFilter: storeDisplay,
  });

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
        floorValue={floorValue}
        dataSize={data.size}
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
      />
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
