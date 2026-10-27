import React, { useMemo, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { useSummaryData } from '../PictureMapping/lib/summaryData';
import { useDataStore } from '../PictureMapping/DataContext';
import { useDynamicUnitSummary } from '../PictureMapping/lib/dynamicSummaryEngine';
import { buildAggregatedUnitData } from './layoutDataAggregator';
import { extractAllProjectCodes, extractProjectMetadata, getUserAllowedStores, projectMatchesScope, projectMatchesUnitCode } from '../../lib/utils';

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
  const locationVisibility = useAppStore(state => state.locationVisibility);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const summaryData = useSummaryData({ store: storeFilter, location: targetLoc, year: effectiveLayoutYear });

  // Compute set of project/unit codes that the current user is NOT allowed to access (Acc Control RBAC)
  const restrictedProjectCodes = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return EMPTY_RESTRICTED_SET;

    const projectLinkData = useDataStore.getState().projectLink || [];
    const unitToProjectCodesMap = new Map<string, string[]>();
    projectLinkData.forEach((pl: any) => {
      const u = String(pl?.unit || '').trim().toLowerCase();
      const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
      if (u && pCode) {
        if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
        unitToProjectCodesMap.get(u)!.push(pCode);
      }
    });

    const allowedCodeSet = new Set<string>();
    enrichedProjects.forEach(p => {
      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store: storeFilter, location: targetLoc, year: effectiveLayoutYear })) return;
      const pCodes = extractAllProjectCodes(p);
      pCodes.forEach(c => {
        if (c) allowedCodeSet.add(c.toLowerCase());
      });
      units.forEach((u: any) => {
        const uName = String(u?.name || '').trim().toLowerCase();
        const uId = String(u?.id || '').trim().toLowerCase();
        const linkedCodes = [
          ...(unitToProjectCodesMap.get(uName) || []),
          ...(unitToProjectCodesMap.get(uId) || []),
        ];
        const isLinked = linkedCodes.some(lc =>
          pCodes.some(pc => pc.toLowerCase() === lc.toLowerCase() || projectMatchesUnitCode([pc], lc))
        );
        const isExact = pCodes.some(c => c.toLowerCase() === uName || c.toLowerCase() === uId);
        if (isExact || isLinked || projectMatchesUnitCode(pCodes, uName || uId)) {
          if (uName) allowedCodeSet.add(uName);
          if (uId) allowedCodeSet.add(uId);
        }
      });
    });

    const restrictedSet = new Set<string>();
    const isPartyRestricted = currUser.byPartyAccess === true && currUser.partyPermissions?.['all'] !== true;

    if (isPartyRestricted) {
      units.forEach((u: any) => {
        const uName = String(u?.name || '').trim().toLowerCase();
        const uId = String(u?.id || '').trim().toLowerCase();
        if (uName && !allowedCodeSet.has(uName)) restrictedSet.add(uName);
        if (uId && !allowedCodeSet.has(uId)) restrictedSet.add(uId);
      });
    }

    allProjects.forEach(p => {
      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store: storeFilter, location: targetLoc, year: effectiveLayoutYear })) return;
      const pCodes = extractAllProjectCodes(p).map(c => c.toLowerCase());
      pCodes.forEach(code => {
        if (!allowedCodeSet.has(code)) {
          restrictedSet.add(code);
        }
      });
      units.forEach((u: any) => {
        const uName = String(u?.name || '').trim().toLowerCase();
        if (!uName || allowedCodeSet.has(uName)) return;
        if (pCodes.includes(uName) || projectMatchesUnitCode(pCodes, uName)) {
          restrictedSet.add(uName);
        }
      });
    });

    return restrictedSet;
  }, [allProjects, enrichedProjects, currUser, units, storeFilter, targetLoc, effectiveLayoutYear]);

  // Build aggregatedData using pure aggregation engine
  const aggregatedData = useMemo(() => {
    const projectLinkData = useDataStore.getState().projectLink || [];
    return buildAggregatedUnitData({
      units,
      version,
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
  }, [units, version, summaryData, enrichedProjects, tasks, storeFilter, locationFilter, targetLoc, effectiveLayoutYear, delegationGroups, layoutTooltipVisibility, restrictedProjectCodes, hasStoredUnitImages, unitImagesRev]);

  const layoutPaintCategory = useAppStore(state => state.layoutPaintCategory);

  const filteredVersionForPaint = useMemo(() => {
    if (!version) return version;
    if (!layoutPaintCategory || layoutPaintCategory === 'all') return version;
    if (layoutPaintCategory === 'none') {
      return { ...version, groups: [] };
    }
    const targetCat = layoutPaintCategory.trim().toLowerCase();
    const filteredGroups = (version.groups || []).filter((g: any) => {
      const rawCat = String(g.paintCategory || g.category || '').trim();
      if (!rawCat) return false;
      return rawCat
        .split(',')
        .map((c: string) => c.trim().toLowerCase())
        .includes(targetCat);
    });
    return { ...version, groups: filteredGroups };
  }, [version, layoutPaintCategory]);

  const { summaryMap: dynamicSummaryMap } = useDynamicUnitSummary({
    units,
    activeVersion: filteredVersionForPaint,
    store: (version?.store as any) || (storeFilter === 'HN' ? 'HN' : 'HCM'),
    location: version?.location || targetLoc,
    year: effectiveLayoutYear,
  });

  // Evaluate rules on the fly: STRICTLY depends ONLY on Task Summaries & Projects in active Year, Store, Location!
  const { unitColorMap, unitGroupMap, unitOpacityMap, unitHatchMap, unitSymbolMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupMap: Record<string, string> = {};
    const opacityMap: Record<string, number> = {};
    const hatchMap: Record<string, string> = {};
    const symbolMap: Record<string, string> = {};
    const groupsInUseMap = new Map<string, any>();
    
    const activeVersionGroups = filteredVersionForPaint?.groups;
    if (!filteredVersionForPaint || !activeVersionGroups) return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, unitHatchMap: hatchMap, unitSymbolMap: symbolMap, activeGroups: [] };

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
        const matchedG = activeVersionGroups.find((g: any) => g.id === dynamicItem.matchedGroupId);
        hatchMap[u.id] = matchedG?.hatchPattern || dynamicItem.hatchPattern || 'none';
        symbolMap[u.id] = matchedG?.symbol || dynamicItem.symbol || '';
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

    activeVersionGroups.forEach((group: any) => {
      const matchedUnits = matchedUnitsByGroup.get(group.id) || [];
      if (matchedUnits.length > 0) {
        groupsInUseMap.set(group.id, { ...group, matchCount: matchedUnits.length, matchedUnits });
      }
    });

    return { 
      unitColorMap: colorMap, 
      unitGroupMap: groupMap, 
      unitOpacityMap: opacityMap, 
      unitHatchMap: hatchMap, 
      unitSymbolMap: symbolMap, 
      activeGroups: Array.from(groupsInUseMap.values()) 
    };
  }, [filteredVersionForPaint, units, aggregatedData, dynamicSummaryMap, restrictedProjectCodes]);

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
        const targetHatchPattern = unitHatchMap[unit.id] || 'none';
        const targetSymbol = unitSymbolMap[unit.id] || '';
        
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
          targetHatchPattern,
          targetSymbol,
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
  }, [units, unitColorMap, unitGroupMap, unitOpacityMap, unitHatchMap, unitSymbolMap, deferredSearchQuery, aggregatedData, dynamicSummaryMap, focusedUnitId, filterOnlyAlerts]);

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

    const key = `${effectiveLayoutYear}_${storeFilter}_${targetLoc}_` + filtered.map((u: any) => `${u.id}:${u.targetColor || ''}:${u.targetGroupId || ''}:${u.targetOpacity ?? ''}:${u.targetHatchPattern || ''}:${u.targetSymbol || ''}`).join('|');
    if (key === prevVisibleUnitsKeyRef.current) {
      return prevVisibleUnitsRef.current;
    }
    prevVisibleUnitsKeyRef.current = key;
    prevVisibleUnitsRef.current = filtered;
    return filtered;
  }, [displayedUnits, stageScale, stagePos.x, stagePos.y, dimensions.width, dimensions.height, focusedUnitId, deferredSearchQuery, effectiveLayoutYear, storeFilter, targetLoc]);

  // Security defense: Enforce Store, Location, Visibility, and Party permissions from Acc Control
  const hasUserAccessInStoreYear = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return true;

    const allowedStores = getUserAllowedStores(currUser);
    const normStore = storeFilter && storeFilter !== 'all' ? storeFilter.toUpperCase().trim() : '';
    if (normStore && !allowedStores.includes(normStore)) {
      return false;
    }

    if (targetLoc && targetLoc.toLowerCase() !== 'all') {
      const lUpper = targetLoc.toUpperCase().trim();
      const lLower = targetLoc.toLowerCase().trim();
      if (locationVisibility[targetLoc] === false || locationVisibility[lUpper] === false || locationVisibility[lLower] === false) {
        return false;
      }
      for (const [k, v] of Object.entries(locationVisibility)) {
        if (k.toUpperCase().trim() === lUpper && v === false) return false;
      }
      const locPerms = currUser.locationPermissions || {};
      if (!locPerms['all']) {
        const cleanLoc = lLower.replace(/^md-/, '');
        if (!(locPerms[cleanLoc] || locPerms[`md-${cleanLoc}`] || locPerms[lLower] || locPerms[lUpper])) {
          return false;
        }
      }
    }

    const isInternalRole = ['manager', 'staff', 'cp'].includes(String(currUser.role || '').toLowerCase());
    const isPartyRestricted = currUser.byPartyAccess === true && currUser.partyPermissions?.['all'] !== true;

    if (isInternalRole && !isPartyRestricted) {
      return true;
    }

    const yr = effectiveLayoutYear;
    if (yr === 'all') return true;
    const hasProj = enrichedProjects.some(p => {
      const pMeta = extractProjectMetadata(p);
      return projectMatchesScope(pMeta, { store: storeFilter, location: targetLoc, year: yr });
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
  }, [currUser, locationVisibility, enrichedProjects, tasks, storeFilter, targetLoc, effectiveLayoutYear]);

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
