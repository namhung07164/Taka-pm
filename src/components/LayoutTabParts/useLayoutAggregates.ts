import React, { useMemo, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { useSummaryData } from '../PictureMapping/lib/summaryData';
import { useDataStore } from '../PictureMapping/DataContext';
import { useDynamicUnitSummary } from '../PictureMapping/lib/dynamicSummaryEngine';
import { buildAggregatedUnitData } from './layoutDataAggregator';

const EMPTY_RESTRICTED_SET = new Set<string>();

interface UseLayoutAggregatesProps {
  units: any[];
  version: any;
  storeFilter: string;
  locationFilter: string;
  targetLoc: string;
  effectiveLayoutYear: string;
  hasStoredUnitImages: (key: string | undefined | null, store?: string) => boolean;
  unitImagesRev: number;
  focusedUnitId: string | null;
  filterOnlyAlerts: boolean;
  deferredSearchQuery: string;
  stageScale: number;
  stagePos: { x: number; y: number };
  dimensions: { width: number; height: number };
}

export function useLayoutAggregates({
  units,
  version,
  storeFilter,
  locationFilter,
  targetLoc,
  effectiveLayoutYear,
  hasStoredUnitImages,
  unitImagesRev,
  focusedUnitId,
  filterOnlyAlerts,
  deferredSearchQuery,
  stageScale,
  stagePos,
  dimensions,
}: UseLayoutAggregatesProps) {
  const { enrichedProjects, filteredTasks: tasks } = useEnrichedData();
  const allProjects = useAppStore(state => state.projects);
  const currUser = useAppStore(state => state.currentUser);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const summaryData = useSummaryData({ store: storeFilter, location: targetLoc, year: effectiveLayoutYear });

  // Compute set of project codes that the current user is NOT allowed to access (RBAC)
  const restrictedProjectCodes = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return EMPTY_RESTRICTED_SET;

    const allowedCodeSet = new Set<string>();
    enrichedProjects.forEach(p => {
      if (p.code) allowedCodeSet.add(String(p.code).trim().toLowerCase());
      if (p.linkCodes) {
        p.linkCodes.split(/[+;,/]/).forEach(c => {
          if (c.trim()) allowedCodeSet.add(c.trim().toLowerCase());
        });
      }
    });

    const restrictedSet = new Set<string>();
    allProjects.forEach(p => {
      const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
      const pCodes = rawCodes.split(/[+;,/]/).map(c => c.trim().toLowerCase()).filter(Boolean);
      pCodes.forEach(code => {
        if (!allowedCodeSet.has(code)) {
          restrictedSet.add(code);
        }
      });
    });

    return restrictedSet;
  }, [allProjects, enrichedProjects, currUser]);

  // Build aggregatedData using pure aggregation engine
  const aggregatedData = useMemo(() => {
    const projectLinkData = useDataStore.getState().projectLink || [];
    return buildAggregatedUnitData({
      units,
      summaryData,
      enrichedProjects,
      tasks,
      projectLinkData,
      storeFilter,
      locationFilter,
      targetLoc,
      effectiveLayoutYear,
      delegationGroups,
      layoutTooltipVisibility,
      restrictedProjectCodes,
      hasStoredUnitImages,
    });
  }, [units, summaryData, enrichedProjects, tasks, storeFilter, locationFilter, targetLoc, effectiveLayoutYear, delegationGroups, layoutTooltipVisibility, restrictedProjectCodes, hasStoredUnitImages, unitImagesRev]);

  const { summaryMap: dynamicSummaryMap } = useDynamicUnitSummary({
    units,
    activeVersion: version,
    store: (version?.store as any) || (storeFilter === 'HN' ? 'HN' : 'HCM'),
    location: version?.location || targetLoc,
    year: effectiveLayoutYear,
  });

  // Evaluate rules on the fly: STRICTLY depends ONLY on Task Summaries & Projects in active Year, Store, Location!
  const { unitColorMap, unitGroupMap, unitOpacityMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupMap: Record<string, string> = {};
    const opacityMap: Record<string, number> = {};
    const groupsInUseMap = new Map<string, any>();
    
    if (!version || !version.groups) return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, activeGroups: [] };

    units.forEach((u: any) => {
      const uName = String(u.name || '').toLowerCase().trim();
      if (restrictedProjectCodes.has(uName) || aggregatedData[uName]?.isRestricted) return;

      const dynamicItem = dynamicSummaryMap.get(u.id) || (uName ? dynamicSummaryMap.get(uName) : null);
      if (!dynamicItem?.hasAppProject) {
        return;
      }

      if (dynamicItem.matchedGroupId && dynamicItem.color) {
        colorMap[u.id] = dynamicItem.color;
        groupMap[u.id] = dynamicItem.matchedGroupId;
        opacityMap[u.id] = dynamicItem.opacity ?? 0.85;
      }
    });

    const matchedUnitsByGroup = new Map<string, any[]>();
    units.forEach((u: any) => {
      const gid = groupMap[u.id];
      if (gid) {
        let list = matchedUnitsByGroup.get(gid);
        if (!list) {
          list = [];
          matchedUnitsByGroup.set(gid, list);
        }
        list.push({ id: u.id, name: u.name });
      }
    });

    version.groups.forEach((group: any) => {
      const matchedUnits = matchedUnitsByGroup.get(group.id) || [];
      if (matchedUnits.length > 0) {
        groupsInUseMap.set(group.id, { ...group, matchCount: matchedUnits.length, matchedUnits });
      }
    });

    return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, activeGroups: Array.from(groupsInUseMap.values()) };
  }, [version?.groups, units, aggregatedData, dynamicSummaryMap, restrictedProjectCodes]);

  // Total count of units with alerts on this floor
  const totalFloorAlerts = useMemo(() => {
    let count = 0;
    units.forEach((u: any) => {
      const uName = (u?.name || '').toLowerCase().trim();
      if (uName && aggregatedData[uName]?.alerts?.hasAlert) {
        count++;
      }
    });
    return count;
  }, [units, aggregatedData]);

  // Filter only units and precalculate bounds
  const displayedUnits = useMemo(() => {
    return units
      .filter((unit: any) => {
        if (unit.visible === false) return false;

        const uName = (unit.name || '').toLowerCase().trim();
        const uData = (uName && aggregatedData[uName]) ? aggregatedData[uName] : {};
        const isRestricted = restrictedProjectCodes.has(uName) || uData?.isRestricted;

        if (isRestricted) {
          return false;
        }

        const isFocused = focusedUnitId === unit.id;

        if (filterOnlyAlerts && !isFocused) {
          if (!uData?.alerts?.hasAlert) {
            return false;
          }
        }

        if (deferredSearchQuery.trim()) {
          const q = deferredSearchQuery.toLowerCase().trim();
          const matchName = (unit.name || '').toLowerCase().includes(q);
          const matchBrand = (uData.brandName || '').toLowerCase().includes(q);
          const matchProject = (uData.projectName || '').toLowerCase().includes(q);
          const matchCode = (uData.appProjectCode || '').toLowerCase().includes(q);
          const matchDesc = (uData.appProjectDescription || uData.appDescription || uData.appProjectDetail || uData.appDetail || uData.detail || uData.description || '').toLowerCase().includes(q);
          if (!matchName && !matchBrand && !matchProject && !matchCode && !matchDesc) {
            return false;
          }
        }
        return true;
      })
      .map((unit: any) => {
        const targetColor = unitColorMap[unit.id] || null;
        const targetOpacity = unitOpacityMap[unit.id] ?? 0.85;
        
        let minX = 0;
        let maxX = 0;
        let minY = 0;
        let maxY = 0;
        let textX = unit.x || 0;
        let textY = unit.y || 0;
        let textWidth = 100;
        let textHeight = 30;

        let svgPath = '';
        if (unit.type === 'rect') {
          minX = unit.x || 0;
          minY = unit.y || 0;
          maxX = minX + (unit.width || 100);
          maxY = minY + (unit.height || 30);
          textX = minX;
          textY = minY;
          textWidth = unit.width || 100;
          textHeight = unit.height || 30;
        } else if (unit.type === 'circle') {
          const r = unit.radius || 20;
          minX = (unit.x || 0) - r;
          maxX = (unit.x || 0) + r;
          minY = (unit.y || 0) - r;
          maxY = (unit.y || 0) + r;
          textX = minX;
          textY = minY;
          textWidth = r * 2;
          textHeight = r * 2;
        } else if (unit.type === 'polygon' && unit.points && unit.points.length >= 2) {
          minX = Infinity;
          maxX = -Infinity;
          minY = Infinity;
          maxY = -Infinity;
          let pathStr = `M ${unit.points[0]} ${unit.points[1]}`;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            if (i > 0) {
              pathStr += ` L ${px} ${py}`;
            }
          }
          pathStr += ' Z';
          svgPath = pathStr;
          if (minX === Infinity) { minX = 0; maxX = 100; minY = 0; maxY = 30; }
          const offsetX = unit.x || 0;
          const offsetY = unit.y || 0;
          minX = minX + offsetX;
          maxX = maxX + offsetX;
          minY = minY + offsetY;
          maxY = maxY + offsetY;
          textX = minX;
          textY = minY;
          textWidth = Math.max(20, maxX - minX);
          textHeight = Math.max(20, maxY - minY);
        }

        return {
          ...unit,
          targetColor,
          targetOpacity,
          targetGroupId: unitGroupMap[unit.id],
          minX,
          maxX,
          minY,
          maxY,
          svgPath,
          textX,
          textY,
          textWidth,
          textHeight,
        };
      });
  }, [units, unitColorMap, unitGroupMap, unitOpacityMap, deferredSearchQuery, aggregatedData, dynamicSummaryMap, focusedUnitId, filterOnlyAlerts]);

  // Focused unit object for Isolated Overlay Highlight Layer
  const focusedUnit = useMemo(() => {
    if (!focusedUnitId) return null;
    return displayedUnits.find((u: any) => u.id === focusedUnitId) || null;
  }, [displayedUnits, focusedUnitId]);

  // Viewport Spatial Culling (Loại bỏ các shape nằm ngoài khung nhìn khi Zoom để tối ưu GPU/FPS)
  const prevVisibleUnitsRef = useRef<any[]>([]);
  const prevVisibleUnitsKeyRef = useRef<string>('');

  const visibleUnits = useMemo(() => {
    const scale = stageScale || 1;
    const vpW = dimensions.width || 800;
    const vpH = dimensions.height || 600;

    let filtered = displayedUnits;
    if (scale > 0.35 && displayedUnits.length > 40) {
      const bufferPadding = Math.max(150, 300 / scale);
      const minWorldX = (-stagePos.x / scale) - bufferPadding;
      const maxWorldX = ((vpW - stagePos.x) / scale) + bufferPadding;
      const minWorldY = (-stagePos.y / scale) - bufferPadding;
      const maxWorldY = ((vpH - stagePos.y) / scale) + bufferPadding;

      filtered = displayedUnits.filter((unit: any) => {
        if (unit.id === focusedUnitId || deferredSearchQuery.trim()) {
          return true;
        }

        const uMinX = unit.minX ?? unit.x ?? 0;
        const uMaxX = unit.maxX ?? (uMinX + (unit.width || 100));
        const uMinY = unit.minY ?? unit.y ?? 0;
        const uMaxY = unit.maxY ?? (uMinY + (unit.height || 30));

        return uMaxX >= minWorldX && uMinX <= maxWorldX && uMaxY >= minWorldY && uMinY <= maxWorldY;
      });
    }

    if (filtered === displayedUnits) {
      return displayedUnits;
    }

    const key = `${effectiveLayoutYear}_${storeFilter}_${targetLoc}_` + filtered.map((u: any) => `${u.id}:${u.targetColor || ''}:${u.targetGroupId || ''}:${u.targetOpacity ?? ''}`).join('|');
    if (key === prevVisibleUnitsKeyRef.current) {
      return prevVisibleUnitsRef.current;
    }
    prevVisibleUnitsKeyRef.current = key;
    prevVisibleUnitsRef.current = filtered;
    return filtered;
  }, [displayedUnits, stageScale, stagePos.x, stagePos.y, dimensions.width, dimensions.height, focusedUnitId, deferredSearchQuery, effectiveLayoutYear, storeFilter, targetLoc]);

  // Security defense: If non-admin user has NO accessible tasks or projects in this store & year, do not render layout
  const hasUserAccessInStoreYear = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return true;

    const isInternalRole = ['manager', 'staff', 'cp'].includes(String(currUser.role || '').toLowerCase());
    const hasStorePerm = storeFilter === 'HN'
      ? Boolean(currUser.storePermissions?.hn)
      : (storeFilter === 'HCM' ? Boolean(currUser.storePermissions?.hcm) : true);

    if (isInternalRole && hasStorePerm && !currUser.byPartyAccess) {
      return true;
    }

    const yr = effectiveLayoutYear;
    if (yr === 'all') return true;
    const hasProj = enrichedProjects.some(p => {
      if (storeFilter !== 'all') {
        const pStore = String(p.store || '').toUpperCase().trim();
        if (pStore && pStore !== storeFilter.toUpperCase()) return false;
      }
      const pYear = String(p.year || '').trim();
      return pYear === yr;
    });
    if (hasProj) return true;
    const hasTask = tasks.some(t => {
      if (storeFilter !== 'all') {
        const tStore = String(t.projectStore || '').toUpperCase().trim();
        if (tStore && tStore !== storeFilter.toUpperCase()) return false;
      }
      const tYear = String(t.projectYear || '').trim();
      return tYear === yr;
    });
    return hasTask;
  }, [currUser, enrichedProjects, tasks, storeFilter, effectiveLayoutYear]);

  return {
    aggregatedData,
    activeGroups,
    totalFloorAlerts,
    displayedUnits,
    focusedUnit,
    visibleUnits,
    hasUserAccessInStoreYear,
    restrictedProjectCodes,
  };
}
