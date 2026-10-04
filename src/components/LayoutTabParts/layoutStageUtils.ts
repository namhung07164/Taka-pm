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
  if (!targetUnitOrName) return null;

  let targetUnit: any = null;
  if (typeof targetUnitOrName === 'object' && targetUnitOrName?.id) {
    targetUnit = targetUnitOrName;
  } else {
    const q = String(targetUnitOrName).toLowerCase().trim();
    targetUnit = units.find((u: any) => 
      (u.name || '').toLowerCase().trim() === q || 
      String(u.id).toLowerCase() === q
    );
    if (!targetUnit) {
      targetUnit = units.find((u: any) => {
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
    if (!targetUnit) {
      const stem = q.replace(/[-_.#]\d+$/, '').trim();
      if (stem && stem !== q) {
        targetUnit = units.find((u: any) => 
          (u.name || '').toLowerCase().trim() === stem || 
          String(u.id).toLowerCase() === stem
        );
      }
    }
    if (!targetUnit) {
      targetUnit = units.find((u: any) => {
        const uName = (u.name || '').toLowerCase().trim();
        if (uName && (uName.includes(q) || q.includes(uName))) return true;
        const d = aggregatedData[uName];
        if (!d) return false;
        return (d.projectName && d.projectName.toLowerCase().includes(q)) ||
               (d.brandName && d.brandName.toLowerCase().includes(q)) ||
               (d.appProjectCode && (d.appProjectCode.toLowerCase().includes(q) || q.includes(d.appProjectCode.toLowerCase())));
      });
    }
    if (!targetUnit) {
      targetUnit = units.find((u: any) => 
        (u.name || '').toLowerCase().includes(q) ||
        String(u.id).toLowerCase() === q
      );
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
  const topMargin = isMobile ? 64 : 16;

  if (isMobile) {
    let top: number;
    if (clientY > viewportHeight * 0.52) {
      top = topMargin;
    } else {
      top = Math.max(topMargin, viewportHeight - tooltipHeight - bottomMargin);
    }

    return {
      position: 'fixed' as const,
      left: `${pad}px`,
      right: `${pad}px`,
      top: `${top}px`,
      width: `calc(100vw - ${pad * 2}px)`,
      maxWidth: '420px',
      maxHeight: `calc(${viewportHeight - topMargin - bottomMargin}px)`,
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
  top = Math.max(topMargin, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));

  return {
    position: 'fixed' as const,
    left: `${left}px`,
    right: 'auto',
    top: `${top}px`,
    width: '350px',
    maxWidth: `calc(100vw - ${pad * 2}px)`,
    maxHeight: `calc(${viewportHeight - topMargin - bottomMargin}px)`,
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
  return availableStoreVersions.find((v: any) => {
    if (v?.groupMappings) {
      const inGroup = Object.values(v.groupMappings).some((m: any) => 
        Array.isArray(m) && m.some(id => String(id).toLowerCase() === q.toLowerCase())
      );
      if (inGroup) return true;
    }
    if (v?.mapUnits && Array.isArray(v.mapUnits)) {
      const inUnits = v.mapUnits.some((u: any) => 
        (u.name && String(u.name).toLowerCase() === q.toLowerCase()) ||
        (u.id && String(u.id).toLowerCase() === q.toLowerCase())
      );
      if (inUnits) return true;
    }
    return false;
  });
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
