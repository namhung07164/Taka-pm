import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { useSummaryData } from '../PictureMapping/lib/summaryData';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { useDynamicUnitSummary } from '../PictureMapping/lib/dynamicSummaryEngine';
import { useLiveLayoutVersionPartition } from './useLiveLayoutVersionPartition';
import { buildLiveLayoutAggregatedData } from './liveLayoutAggregatedData';

interface UseLiveLayoutDataParams {
  config: any;
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  selectedVersionId: string | null;
  filterOnlyAlerts: boolean;
  selectedLegendGroupId: string | null;
  searchQuery: string;
  focusedUnitId: string | null;
  stageScale: number;
  stagePos: { x: number; y: number };
  dimensions: { width: number; height: number };
}

export function useLiveLayoutData({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
  selectedVersionId,
  filterOnlyAlerts,
  selectedLegendGroupId,
  searchQuery,
  focusedUnitId,
  stageScale,
  stagePos,
  dimensions,
}: UseLiveLayoutDataParams) {
  const allProjects = useAppStore(state => state.projects);
  const currUser = useAppStore(state => state.currentUser);
  const delegationGroups = useAppStore(state => state.delegationGroups);

  // 1. Version & partition resolution
  const {
    targetLoc,
    activeYear,
    effectiveLayoutYear,
    availableStoreVersions,
    locationVersions,
    version,
    units,
    groups,
  } = useLiveLayoutVersionPartition({
    config,
    storeFilter,
    locationFilter,
    yearFilter,
    selectedVersionId,
  });

  // 2. Enriched Data & RBAC
  const { enrichedProjects, filteredTasks: tasks } = useEnrichedData();
  const summaryData = useSummaryData();

  const restrictedProjectCodes = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return new Set<string>();
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

  // 3. Build Aggregated Data
  const aggregatedData = useMemo(() => {
    const projectLinkData = useDataStore.getState().projectLink || [];
    return buildLiveLayoutAggregatedData({
      units,
      summaryData,
      tasks,
      enrichedProjects,
      storeFilter,
      targetLoc,
      effectiveLayoutYear,
      restrictedProjectCodes,
      projectLinkData,
      delegationGroups,
      locationFilter,
    });
  }, [
    units,
    summaryData,
    tasks,
    enrichedProjects,
    storeFilter,
    targetLoc,
    effectiveLayoutYear,
    restrictedProjectCodes,
    delegationGroups,
    locationFilter,
  ]);

  // 4. Dynamic Unit Summary
  const { summaryMap: dynamicSummaryMap } = useDynamicUnitSummary({
    units,
    activeVersion: version,
    store: (storeFilter === 'HN' ? 'HN' : 'HCM'),
    location: targetLoc,
    year: effectiveLayoutYear
  });

  // 5. Unit Color, Group, and Opacity Maps
  const { unitColorMap, unitGroupMap, unitOpacityMap, activeGroups } = useMemo(() => {
    const colorMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const opacityMap = new Map<string, number>();

    const groupCounts: Record<string, number> = {};
    const unassignedUnits: string[] = [];

    units.forEach((unit: any) => {
      const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase();
      const unitSummary = dynamicSummaryMap?.get(uCode);

      const gId = (unitSummary as any)?.groupId || unitSummary?.matchedGroupId;
      if (gId) {
        groupMap.set(unit.id, gId);
        colorMap.set(unit.id, unitSummary?.color || '#94a3b8');
        opacityMap.set(unit.id, unitSummary?.opacity ?? 0.85);
        groupCounts[gId] = (groupCounts[gId] || 0) + 1;
      } else {
        unassignedUnits.push(unit.id);
      }
    });

    const activeList = groups
      .map(g => ({
        ...g,
        count: groupCounts[g.id] || 0,
      }))
      .filter(g => g.count > 0);

    return {
      unitColorMap: colorMap,
      unitGroupMap: groupMap,
      unitOpacityMap: opacityMap,
      activeGroups: activeList,
    };
  }, [units, dynamicSummaryMap, groups]);

  // 6. Alert Counting
  const totalFloorAlerts = useMemo(() => {
    let count = 0;
    units.forEach((u: any) => {
      const uCode = String(u.name || u.id || u.code || '').toLowerCase();
      const uData = (uCode && aggregatedData[uCode]) ? aggregatedData[uCode] : null;
      if (uData?.alerts?.hasAlert) count++;
    });
    return count;
  }, [units, aggregatedData]);

  // 7. Spatial bounds and filtering
  const displayedUnits = useMemo(() => {
    return units
      .map((unit: any) => {
        let minX = unit.x || 0;
        let minY = unit.y || 0;
        let maxX = minX + (unit.width || 0);
        let maxY = minY + (unit.height || 0);

        if (unit.type === 'circle') {
          const r = unit.radius || 0;
          minX = (unit.x || 0) - r;
          maxX = (unit.x || 0) + r;
          minY = (unit.y || 0) - r;
          maxY = (unit.y || 0) + r;
        } else if (unit.type === 'polygon' && Array.isArray(unit.points) && unit.points.length >= 2) {
          minX = Infinity;
          maxX = -Infinity;
          minY = Infinity;
          maxY = -Infinity;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }

        const targetColor = unitColorMap.get(unit.id) || null;
        const targetGroupId = unitGroupMap.get(unit.id) || null;
        const targetOpacity = unitOpacityMap.get(unit.id) ?? 0.85;

        return {
          ...unit,
          bounds: { minX, minY, maxX, maxY },
          targetColor,
          targetGroupId,
          targetOpacity,
        };
      })
      .filter((unit: any) => {
        const isFocused = focusedUnitId === unit.id;
        if (isFocused) return true;

        if (filterOnlyAlerts) {
          const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase();
          const uData = (uCode && aggregatedData[uCode]) ? aggregatedData[uCode] : null;
          if (!uData?.alerts?.hasAlert) return false;
        }

        if (selectedLegendGroupId !== null) {
          if (unit.targetGroupId !== selectedLegendGroupId) return false;
        }

        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase().trim();
          const uCode = String(unit.name || unit.id || unit.code || '').toLowerCase();
          const uData = (uCode && aggregatedData[uCode]) ? aggregatedData[uCode] : null;
          const uName = (unit.name || '').toLowerCase();
          const pName = (uData?.projectName || '').toLowerCase();
          const brandName = (uData?.brandName || '').toLowerCase();

          const matches = uCode.includes(query) || uName.includes(query) || pName.includes(query) || brandName.includes(query);
          if (!matches) return false;
        }

        return true;
      });
  }, [
    units,
    unitColorMap,
    unitGroupMap,
    unitOpacityMap,
    focusedUnitId,
    filterOnlyAlerts,
    aggregatedData,
    selectedLegendGroupId,
    searchQuery,
  ]);

  const focusedUnit = useMemo(() => {
    if (!focusedUnitId) return null;
    return displayedUnits.find((u: any) => u.id === focusedUnitId) || null;
  }, [focusedUnitId, displayedUnits]);

  // 8. Viewport Spatial Culling
  const visibleUnits = useMemo(() => {
    if (!dimensions.width || !dimensions.height || stageScale <= 0) {
      return displayedUnits;
    }

    const padding = 200 / stageScale;
    const viewLeft = -stagePos.x / stageScale - padding;
    const viewTop = -stagePos.y / stageScale - padding;
    const viewRight = (-stagePos.x + dimensions.width) / stageScale + padding;
    const viewBottom = (-stagePos.y + dimensions.height) / stageScale + padding;

    return displayedUnits.filter((unit: any) => {
      if (unit.id === focusedUnitId) return true;
      const b = unit.bounds;
      if (!b) return true;
      return (
        b.maxX >= viewLeft &&
        b.minX <= viewRight &&
        b.maxY >= viewTop &&
        b.minY <= viewBottom
      );
    });
  }, [displayedUnits, stageScale, stagePos, dimensions, focusedUnitId]);

  return {
    targetLoc,
    activeYear,
    effectiveLayoutYear,
    availableStoreVersions,
    locationVersions,
    version,
    units,
    groups,
    enrichedProjects,
    tasks,
    restrictedProjectCodes,
    aggregatedData,
    dynamicSummaryMap,
    unitColorMap,
    unitGroupMap,
    unitOpacityMap,
    activeGroups,
    totalFloorAlerts,
    displayedUnits,
    focusedUnit,
    visibleUnits,
  };
}
