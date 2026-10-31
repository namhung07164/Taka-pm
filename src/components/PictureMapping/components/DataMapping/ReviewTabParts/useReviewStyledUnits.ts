import React, { useEffect, useRef } from 'react';
import { UnitShape, MapVersion } from '../types';
import { generateSizeLabel, generateSizeLabelLines } from '../../../lib/summaryData';

export const AVAILABLE_LABELS = [
  'Unit ID', 'Size SQM', 'Floor', 'Brand Code', 'Brand Name', 'Vendor Code',
  'Name', 'Class Code', 'Update', 'Status', 'MD Status', 'MD Notes', 'Task',
  'Project Status', 'Act: Status', 'Start Date', 'End Date', 'Sales',
  'Sales By CP', 'Sales By HCM Categ', 'Profit', 'Profit By CP',
  'Profit By HCM Categ', 'Margin', 'Margin By CP', 'HCM Margin', 'HCM Sales Effi',
];

export function useReviewFilteredVersions({
  versions, store, location, effectiveYear,
}: {
  versions: MapVersion[]; store: string; location: string; effectiveYear: string;
}) {
  return React.useMemo(() => {
    const sTarget = String(store || 'HCM').toUpperCase().trim();
    const lTarget = String(location || 'L1').toUpperCase().trim();
    const tokenRegex = new RegExp(`(^|[^a-zA-Z0-9])${lTarget}([^a-zA-Z0-9]|$)`, 'i');

    const matched = versions.filter((v) => {
      const matchStore = !v.store || v.store.toUpperCase().trim() === sTarget;
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      const matchLoc = vLoc === lTarget || (vLoc === '' && tokenRegex.test(vName));
      return matchStore && matchLoc;
    });

    if (matched.length === 0) return [];
    const yearMatched = matched.filter((v) => String(v.year || '').trim() === String(effectiveYear).trim());
    if (yearMatched.length > 0) return yearMatched;
    return [...matched].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
  }, [versions, store, location, effectiveYear]);
}

export function useReviewStyledUnits({
  units, activeVersion, summaryData, dynamicSummaryMap, selectedLabels, location,
}: {
  units: UnitShape[]; activeVersion: MapVersion | undefined; summaryData: any[];
  dynamicSummaryMap: Map<string, any>; selectedLabels: string[]; location: string;
}) {
  return React.useMemo(() => {
    if (!activeVersion) return [];
    const summaryMap = new Map();
    summaryData.forEach((s) => summaryMap.set(s.unit, s));
    const activeLoc = String(activeVersion.location || location || '').toUpperCase().trim();
    const candidateUnits =
      Array.isArray(activeVersion?.mapUnits) && activeVersion.mapUnits.length > 0
        ? activeVersion.mapUnits
        : units;

    const unitToGroupStyle = new Map<string, { color: string; opacity: number; groupId: string }>();
    if (activeVersion.groups && activeVersion.groupMappings) {
      activeVersion.groups.forEach((group: any) => {
        const assignedIds = activeVersion.groupMappings[group.id] || [];
        assignedIds.forEach((id: string) => {
          unitToGroupStyle.set(String(id).toLowerCase().trim(), {
            color: group.color,
            opacity: typeof group.opacity === 'number' ? group.opacity : 0.65,
            groupId: group.id,
          });
        });
      });
    }

    return candidateUnits
      .filter((unit) => {
        const uLoc = String(unit.location || '').toUpperCase().trim();
        if (activeLoc && uLoc && uLoc !== activeLoc) return false;
        return true;
      })
      .map((unit) => {
        const uName = String(unit.name || '').toLowerCase().trim();
        const uId = String(unit.id || '').toLowerCase().trim();
        const dynamicItem = dynamicSummaryMap.get(unit.id) || (uName ? dynamicSummaryMap.get(uName) : null);

        let displayColor = 'rgba(0, 0, 0, 0.001)';
        let displayOpacity = 0.85;
        let hasMatchedColor = false;

        if (dynamicItem?.matchedGroupId && dynamicItem?.color) {
          displayColor = dynamicItem.color;
          displayOpacity = dynamicItem.opacity ?? 0.85;
          hasMatchedColor = true;
        } else if (unitToGroupStyle.has(uId)) {
          const g = unitToGroupStyle.get(uId)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if (uName && unitToGroupStyle.has(uName)) {
          const g = unitToGroupStyle.get(uName)!;
          displayColor = g.color;
          displayOpacity = g.opacity;
          hasMatchedColor = true;
        } else if ((unit as any).targetColor) {
          displayColor = (unit as any).targetColor;
          displayOpacity = (unit as any).targetOpacity ?? 0.65;
          hasMatchedColor = true;
        } else if (dynamicItem?.hasAppProject && dynamicItem?.appProjectStatus) {
          const st = String(dynamicItem.appProjectStatus).toLowerCase().trim();
          const stColorMap: Record<string, string> = {
            completed: '#10b981', 'on process': '#3b82f6', 'in progress': '#3b82f6',
            delay: '#ef4444', delayed: '#ef4444', overdue: '#ef4444', upcoming: '#f59e0b',
          };
          if (stColorMap[st]) {
            displayColor = stColorMap[st];
            displayOpacity = 0.85;
            hasMatchedColor = true;
          }
        } else if (
          unit.fill && unit.fill !== 'transparent' &&
          !unit.fill.startsWith('rgba(0,0,0,0') && unit.fill !== 'rgba(0, 0, 0, 0.001)'
        ) {
          displayColor = unit.fill;
          displayOpacity = unit.opacity ?? 0.65;
          hasMatchedColor = true;
        }

        const uInfo = summaryMap.get(unit.name);
        const sizeLabelLines = generateSizeLabelLines(unit, uInfo, selectedLabels);
        const sizeLabel = generateSizeLabel(unit, uInfo, selectedLabels);

        let bbox = { x: unit.x, y: unit.y, width: unit.width || 100, height: unit.height || 30 };
        if (unit.type === 'circle') {
          const r = unit.radius || 0;
          bbox = { x: unit.x - r, y: unit.y - r, width: r * 2, height: r * 2 };
        } else if (unit.type === 'polygon' && unit.points && unit.points.length >= 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i], py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          bbox = { x: minX, y: minY, width: Math.max(10, maxX - minX), height: Math.max(10, maxY - minY) };
        }

        return {
          ...unit, displayColor, displayOpacity: hasMatchedColor ? displayOpacity : 0.85,
          hasMatchedColor, sizeLabelLines, sizeLabel, bbox,
        };
      });
  }, [units, activeVersion, summaryData, dynamicSummaryMap, selectedLabels, location]);
}

export function useReviewCanvasZoom({
  stageRef, setScale, setPosition,
}: {
  stageRef: React.MutableRefObject<any>;
  setScale: React.Dispatch<React.SetStateAction<number>>;
  setPosition: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
}) {
  const wheelRafRef = useRef<number | null>(null);
  const wheelSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pinchDistRef = useRef<number>(0);
  const pinchCenterRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRafRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (wheelRafRef.current !== null) cancelAnimationFrame(wheelRafRef.current);
      if (pinchRafRef.current !== null) cancelAnimationFrame(pinchRafRef.current);
      if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
    };
  }, []);

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const pointer = e.target.getStage()?.getPointerPosition();
    if (!pointer) return;
    lastWheelPointerRef.current = pointer;
    pendingWheelDeltaRef.current += e.evt.deltaY;

    if (wheelRafRef.current === null) {
      wheelRafRef.current = requestAnimationFrame(() => {
        wheelRafRef.current = null;
        const curStage = stageRef.current;
        const ptr = lastWheelPointerRef.current;
        if (!curStage || !ptr) return;
        const deltaY = pendingWheelDeltaRef.current;
        pendingWheelDeltaRef.current = 0;

        const oldScale = curStage.scaleX();
        const newScale = Math.max(0.05, Math.min(10, oldScale * Math.exp(-deltaY * 0.0008)));
        const mousePointTo = { x: (ptr.x - curStage.x()) / oldScale, y: (ptr.y - curStage.y()) / oldScale };
        curStage.scale({ x: newScale, y: newScale });
        curStage.position({ x: ptr.x - mousePointTo.x * newScale, y: ptr.y - mousePointTo.y * newScale });
        curStage.getLayers().forEach((l: any) => l.drawScene());

        if (wheelSyncTimerRef.current) clearTimeout(wheelSyncTimerRef.current);
        wheelSyncTimerRef.current = setTimeout(() => {
          wheelSyncTimerRef.current = null;
          if (!stageRef.current) return;
          stageRef.current.batchDraw();
          setScale(stageRef.current.scaleX());
          setPosition({ x: stageRef.current.x(), y: stageRef.current.y() });
        }, 120);
      });
    }
  };

  const handleTouchMove = (e: any) => {
    const touch1 = e.evt.touches?.[0], touch2 = e.evt.touches?.[1];
    if (!touch1 || !touch2) return;
    e.evt.preventDefault();
    const curStage = stageRef.current;
    if (!curStage) return;
    if (curStage.isDragging()) curStage.stopDrag();

    const p1 = { x: touch1.clientX, y: touch1.clientY }, p2 = { x: touch2.clientX, y: touch2.clientY };
    const newCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

    if (!pinchDistRef.current || !pinchCenterRef.current) {
      pinchDistRef.current = dist;
      pinchCenterRef.current = newCenter;
      return;
    }
    if (pinchRafRef.current !== null) return;
    pinchRafRef.current = requestAnimationFrame(() => {
      pinchRafRef.current = null;
      const st = stageRef.current, lastCenter = pinchCenterRef.current, lastDist = pinchDistRef.current;
      if (!st || !lastCenter || !lastDist) return;

      const rect = st.container().getBoundingClientRect();
      const localCenter = { x: newCenter.x - rect.left, y: newCenter.y - rect.top };
      const oldScale = st.scaleX();
      const pointTo = { x: (localCenter.x - st.x()) / oldScale, y: (localCenter.y - st.y()) / oldScale };
      const newScale = Math.max(0.05, Math.min(10, oldScale * (dist / lastDist)));
      st.scale({ x: newScale, y: newScale });
      st.position({
        x: localCenter.x - pointTo.x * newScale + (newCenter.x - lastCenter.x),
        y: localCenter.y - pointTo.y * newScale + (newCenter.y - lastCenter.y),
      });
      st.getLayers().forEach((l: any) => l.drawScene());
      pinchDistRef.current = dist;
      pinchCenterRef.current = newCenter;
    });
  };

  const handleTouchEnd = () => {
    if (pinchDistRef.current !== 0) {
      pinchDistRef.current = 0;
      pinchCenterRef.current = null;
      if (stageRef.current) {
        stageRef.current.batchDraw();
        setScale(stageRef.current.scaleX());
        setPosition({ x: stageRef.current.x(), y: stageRef.current.y() });
      }
    }
  };

  return { handleWheel, handleTouchMove, handleTouchEnd };
}
