import { useAppStore } from '../../store/useAppStore';
import { extractFloorFromCodeOrName } from './layoutTabSearchUtils';

export interface UnitFocalPointResult {
  targetUnit: any;
  cx: number;
  cy: number;
  uW: number;
  uH: number;
}

export function calculateUnitFocalPoint(
  targetUnitOrName: string | any,
  units: any[],
  aggregatedData: Record<string, any>,
  restrictedProjectCodes: Set<string>
): UnitFocalPointResult | null {
  if (!targetUnitOrName || !Array.isArray(units) || units.length === 0) return null;

  let targetUnit: any = null;
  if (typeof targetUnitOrName === 'object' && targetUnitOrName?.id) {
    targetUnit = targetUnitOrName;
  } else {
    const q = String(targetUnitOrName).toLowerCase().trim();
    const qFloor = extractFloorFromCodeOrName(q);

    const isDifferentFloor = (u: any) => {
      if (!qFloor) return false;
      const uFloor = extractFloorFromCodeOrName(u.name || u.label || u.id);
      if (uFloor && uFloor.toUpperCase() !== qFloor.toUpperCase()) {
        return true;
      }
      return false;
    };

    // 1. Direct exact match by unit name, id, or label
    targetUnit = units.find((u: any) => {
      if (isDifferentFloor(u)) return false;
      return (
        (u.name || '').toLowerCase().trim() === q || 
        String(u.id).toLowerCase() === q ||
        (u.label && String(u.label).toLowerCase().trim() === q)
      );
    });

    // 2. Exact match in aggregated data (project code, brand name, unit, project name)
    if (!targetUnit) {
      targetUnit = units.find((u: any) => {
        if (isDifferentFloor(u)) return false;
        const uName = (u.name || '').toLowerCase().trim();
        const d = aggregatedData[uName];
        if (!d) return false;
        const matchCode = d.appProjectCode && String(d.appProjectCode).toLowerCase().trim() === q;
        const matchName = d.projectName && String(d.projectName).toLowerCase().trim() === q;
        const matchBrand = d.brandName && String(d.brandName).toLowerCase().trim() === q;
        const matchUnit = d.unit && String(d.unit).toLowerCase().trim() === q;
        return matchCode || matchName || matchBrand || matchUnit;
      });
    }

    // 3. Direct store lookup fallback if aggregatedData not ready or project not yet linked in dataMap
    if (!targetUnit) {
      try {
        const globalProjects = (useAppStore.getState?.() as any)?.projects || [];
        const activeStore = (useAppStore.getState?.() as any)?.globalStoreFilter || 'HCM';
        const activeYear = (useAppStore.getState?.() as any)?.globalYearFilter || '2026';

        const matchedProj = globalProjects.find((p: any) => {
          const pStore = p.store ? String(p.store).trim().toUpperCase() : 'HCM';
          const pYear = p.year ? String(p.year).trim() : '';
          if (activeStore && activeStore !== 'ALL' && pStore && pStore !== activeStore.toUpperCase()) return false;
          if (activeYear && activeYear !== 'all' && pYear && pYear !== 'ALL' && pYear !== activeYear) return false;

          return (
            (p.code && String(p.code).toLowerCase().trim() === q) ||
            (p.id && String(p.id).toLowerCase().trim() === q) ||
            (p.name && String(p.name).toLowerCase().trim() === q) ||
            ((p as any).unit && String((p as any).unit).toLowerCase().trim() === q)
          );
        });
        if (matchedProj) {
          const pCodes = [
            matchedProj.code,
            (matchedProj as any).unit,
            matchedProj.name,
            ...((matchedProj as any).linkCodes || [])
          ].filter(Boolean).map((s: string) => String(s).toLowerCase().trim());

          targetUnit = units.find((u: any) => {
            if (isDifferentFloor(u)) return false;
            const uName = (u.name || '').toLowerCase().trim();
            const uId = String(u.id || '').toLowerCase().trim();
            return pCodes.includes(uName) || pCodes.includes(uId);
          });
        }
      } catch {}
    }

    // 4. Normalized exact match (without hyphens/dots/spaces)
    if (!targetUnit) {
      const normQ = q.replace(/[-_.\s]/g, '');
      if (normQ.length >= 2) {
        targetUnit = units.find((u: any) => {
          if (isDifferentFloor(u)) return false;
          const normUName = (u.name || '').toLowerCase().trim().replace(/[-_.\s]/g, '');
          const normUId = String(u.id || '').toLowerCase().trim().replace(/[-_.\s]/g, '');
          return normUName === normQ || normUId === normQ;
        });
      }
    }

    // 5. Prefix / Stem match ONLY if same floor and significant length
    if (!targetUnit && q.length >= 3) {
      targetUnit = units.find((u: any) => {
        if (isDifferentFloor(u)) return false;
        const uName = (u.name || '').toLowerCase().trim();
        if (uName.length < 3) return false;
        return (
          uName.startsWith(q + '-') ||
          uName.startsWith(q + '_') ||
          q.startsWith(uName + '-') ||
          q.startsWith(uName + '_')
        );
      });
    }
  }

  if (!targetUnit) return null;

  const targetUName = (targetUnit.name || '').toLowerCase().trim();
  if (restrictedProjectCodes.has(targetUName) || aggregatedData[targetUName]?.isRestricted) {
    return null;
  }

  let cx = targetUnit.x || 0;
  let cy = targetUnit.y || 0;
  let uW = 100;
  let uH = 60;

  if (targetUnit.type === 'rect') {
    uW = Math.abs(targetUnit.width || 100);
    uH = Math.abs(targetUnit.height || 60);
    cx = (targetUnit.x || 0) + uW / 2;
    cy = (targetUnit.y || 0) + uH / 2;
  } else if (targetUnit.type === 'circle') {
    const r = targetUnit.radius || 30;
    uW = r * 2;
    uH = r * 2;
    cx = targetUnit.x || 0;
    cy = targetUnit.y || 0;
  } else if (targetUnit.type === 'polygon' && targetUnit.points && targetUnit.points.length >= 2) {
    let sumX = 0, sumY = 0, count = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < targetUnit.points.length; i += 2) {
      const px = targetUnit.points[i];
      const py = targetUnit.points[i + 1];
      sumX += px;
      sumY += py;
      count++;
      minX = Math.min(minX, px);
      maxX = Math.max(maxX, px);
      minY = Math.min(minY, py);
      maxY = Math.max(maxY, py);
    }
    cx = count > 0 ? sumX / count : 0;
    cy = count > 0 ? sumY / count : 0;
    uW = maxX > minX ? maxX - minX : 100;
    uH = maxY > minY ? maxY - minY : 60;
  } else {
    cx = (targetUnit.textX || targetUnit.x || 0) + (targetUnit.textWidth || 100) / 2;
    cy = (targetUnit.textY || targetUnit.y || 0) + (targetUnit.textHeight || 30) / 2;
  }

  return { targetUnit, cx, cy, uW, uH };
}

export function computeTooltipPosition(
  clientX: number,
  clientY: number,
  tooltipWidth: number,
  tooltipHeight: number,
  viewportWidth: number,
  viewportHeight: number
) {
  const isMobile = viewportWidth < 640;
  const pad = 12;
  const bottomMargin = isMobile ? 84 : 72;

  let safeTop = isMobile ? 120 : 100;
  if (typeof document !== 'undefined') {
    const headerEl = document.querySelector('header') || document.querySelector('.sticky.top-0');
    if (headerEl) {
      const hRect = headerEl.getBoundingClientRect();
      if (hRect.bottom > 0) {
        safeTop = Math.max(safeTop, hRect.bottom + 8);
      }
    }
  }

  if (isMobile) {
    let top: number;
    if (clientY > viewportHeight * 0.52) {
      top = safeTop;
    } else {
      top = Math.max(safeTop, viewportHeight - tooltipHeight - bottomMargin);
    }

    return {
      position: 'fixed' as const,
      zIndex: 999999,
      left: `${pad}px`,
      right: `${pad}px`,
      top: `${top}px`,
      width: `calc(100vw - ${pad * 2}px)`,
      maxWidth: '420px',
      maxHeight: `calc(${viewportHeight - safeTop - bottomMargin}px)`,
      margin: '0 auto',
      transform: 'none',
    };
  }

  let left = clientX + 16;
  if (left + tooltipWidth > viewportWidth - pad) {
    left = clientX - tooltipWidth - 16;
  }
  left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

  let top = clientY + 16;
  if (top + tooltipHeight > viewportHeight - bottomMargin) {
    top = clientY - tooltipHeight - 16;
  }
  top = Math.max(safeTop, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));

  return {
    position: 'fixed' as const,
    zIndex: 999999,
    left: `${left}px`,
    right: 'auto',
    top: `${top}px`,
    width: '350px',
    maxWidth: `calc(100vw - ${pad * 2}px)`,
    maxHeight: `calc(${viewportHeight - safeTop - bottomMargin}px)`,
    margin: '0',
    transform: 'none',
  };
}

export function exportStageHighRes(
  stage: any,
  bgImage: any,
  version: any,
  units: any[],
  dpi: number = 200
) {
  if (!stage) return null;

  let contentX = 0;
  let contentY = 0;
  let contentW = 1000;
  let contentH = 800;

  if (bgImage) {
    const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || bgImage.width || 1000;
    const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || bgImage.height || 800;
    const imgScale = version?.imageScale || 1;
    contentW = imgNaturalW * imgScale;
    contentH = imgNaturalH * imgScale;
    contentX = version?.imagePos?.x || 0;
    contentY = version?.imagePos?.y || 0;
  } else if (units && units.length > 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    units.forEach((u: any) => {
      const ux = u.x || 0;
      const uy = u.y || 0;
      const uw = u.width || 100;
      const uh = u.height || 100;
      minX = Math.min(minX, ux);
      minY = Math.min(minY, uy);
      maxX = Math.max(maxX, ux + uw);
      maxY = Math.max(maxY, uy + uh);
    });
    if (minX !== Infinity && maxX > minX) {
      contentX = minX;
      contentY = minY;
      contentW = Math.max(100, maxX - minX);
      contentH = Math.max(100, maxY - minY);
    }
  }

  const oldW = stage.width();
  const oldH = stage.height();
  const oldScaleX = stage.scaleX();
  const oldScaleY = stage.scaleY();
  const oldX = stage.x();
  const oldY = stage.y();

  const targetW = Math.max(100, Math.round(contentW));
  const targetH = Math.max(100, Math.round(contentH));
  stage.width(targetW);
  stage.height(targetH);
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: -contentX, y: -contentY });
  stage.batchDraw();

  const exportRatio = Math.min(2.5, Math.max(1.0, dpi / 96));
  const dataUrl = stage.toDataURL({
    x: 0,
    y: 0,
    width: targetW,
    height: targetH,
    pixelRatio: exportRatio,
    mimeType: 'image/jpeg',
    quality: 0.94
  });

  stage.width(oldW);
  stage.height(oldH);
  stage.scale({ x: oldScaleX, y: oldScaleY });
  stage.position({ x: oldX, y: oldY });
  stage.batchDraw();

  return {
    dataUrl,
    width: Math.round(targetW * exportRatio),
    height: Math.round(targetH * exportRatio),
  };
}

export function triggerStageDownload(stage: any) {
  if (!stage) return;
  const dataURL = stage.toDataURL({ pixelRatio: 2 });
  const link = document.createElement('a');
  link.download = `Thematic_Map_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function findUnitInOtherFloorVersions(q: string, availableStoreVersions: any[]) {
  if (!q || !Array.isArray(availableStoreVersions) || availableStoreVersions.length === 0) return null;
  const qLower = String(q).toLowerCase().trim();

  // 1. Direct version unit matching
  const matched = availableStoreVersions.find((v: any) => {
    if (v?.groupMappings) {
      const inGroup = Object.values(v.groupMappings).some((m: any) => 
        Array.isArray(m) && m.some(id => String(id).toLowerCase().trim() === qLower)
      );
      if (inGroup) return true;
    }
    const unitList = (Array.isArray(v?.mapUnits) ? v.mapUnits : (Array.isArray(v?.units) ? v.units : []));
    if (unitList.length > 0) {
      const inUnits = unitList.some((u: any) => 
        (u.name && String(u.name).toLowerCase().trim() === qLower) ||
        (u.id && String(u.id).toLowerCase().trim() === qLower) ||
        (u.label && String(u.label).toLowerCase().trim() === qLower)
      );
      if (inUnits) return true;
    }
    return false;
  });

  if (matched) return matched;

  // 2. Fallback: If q is a project code/name, find its floor location and matching version
  try {
    const globalProjects = (useAppStore.getState?.() as any)?.projects || [];
    const p = globalProjects.find((proj: any) => 
      (proj.code && String(proj.code).toLowerCase().trim() === qLower) ||
      (proj.id && String(proj.id).toLowerCase().trim() === qLower) ||
      (proj.name && String(proj.name).toLowerCase().trim() === qLower) ||
      ((proj as any).unit && String((proj as any).unit).toLowerCase().trim() === qLower)
    );
    if (p) {
      const pFloor = (p.location && p.location !== 'all' && p.location !== 'ALL') ? p.location : ((p as any).floor || extractFloorFromCodeOrName(p.code) || extractFloorFromCodeOrName((p as any).unit));
      if (pFloor && pFloor.toLowerCase() !== 'all') {
        const pLoc = String(pFloor).trim().toUpperCase();
        const verForLoc = availableStoreVersions.find((v: any) => 
          String(v.location || '').trim().toUpperCase() === pLoc
        );
        if (verForLoc) return verForLoc;
      }
    }
  } catch {}

  // 3. Fallback: If q contains floor pattern (e.g. "L3-303-1" -> "L3")
  const qFloor = extractFloorFromCodeOrName(q);
  if (qFloor && qFloor.toLowerCase() !== 'all') {
    const floorLoc = qFloor.toUpperCase();
    const verForLoc = availableStoreVersions.find((v: any) => 
      String(v.location || '').trim().toUpperCase() === floorLoc
    );
    if (verForLoc) return verForLoc;
  }

  return null;
}

export function hasAggregatedDataChanged(prev: any, next: any): boolean {
  if (!prev || !next) return true;
  return (
    prev.code !== next.code ||
    prev.status !== next.status ||
    prev.budget !== next.budget ||
    prev.actual !== next.actual ||
    prev.commentsCount !== next.commentsCount ||
    prev.planProgress !== next.planProgress ||
    prev.actProgress !== next.actProgress ||
    prev.matchedTasksCount !== next.matchedTasksCount
  );
}
