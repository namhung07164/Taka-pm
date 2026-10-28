export interface ActiveGroupCalculationParams {
  units: any[];
  filteredVersionForPaint: any;
  dynamicSummaryMap: Map<string, any>;
  aggregatedData: Record<string, any>;
  restrictedProjectCodes: Set<string>;
}

export interface ActiveGroupResult {
  unitColorMap: Record<string, string>;
  unitGroupMap: Record<string, string>;
  unitOpacityMap: Record<string, number>;
  unitHatchMap: Record<string, string>;
  unitSymbolMap: Record<string, string>;
  activeGroups: any[];
}

export function computeActiveGroupsAndColorMaps({
  units,
  filteredVersionForPaint,
  dynamicSummaryMap,
  aggregatedData,
  restrictedProjectCodes,
}: ActiveGroupCalculationParams): ActiveGroupResult {
  const colorMap: Record<string, string> = {};
  const groupMap: Record<string, string> = {};
  const opacityMap: Record<string, number> = {};
  const hatchMap: Record<string, string> = {};
  const symbolMap: Record<string, string> = {};
  const groupsInUseMap = new Map<string, any>();

  const activeVersionGroups = filteredVersionForPaint?.groups;
  if (!filteredVersionForPaint || !activeVersionGroups) {
    return {
      unitColorMap: colorMap,
      unitGroupMap: groupMap,
      unitOpacityMap: opacityMap,
      unitHatchMap: hatchMap,
      unitSymbolMap: symbolMap,
      activeGroups: [],
    };
  }

  const getUnitArea = (u: any, dynamicItem: any, uName: string): number => {
    const rawSize =
      dynamicItem?.sizeM2 ??
      dynamicItem?.size ??
      aggregatedData[uName]?.sizeM2 ??
      aggregatedData[uName]?.size ??
      u?.sizeM2 ??
      u?.size ??
      0;
    const parsed = Number(String(rawSize).replace(/,/g, ''));
    return !isNaN(parsed) && parsed > 0 ? parsed : 0;
  };

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
  let totalFloorUnitsArea = 0;

  units.forEach((u: any) => {
    const uName = String(u.name || '').toLowerCase().trim();
    if (restrictedProjectCodes.has(uName) || aggregatedData[uName]?.isRestricted) return;

    const dynamicItem = dynamicSummaryMap.get(u.id) || (uName ? dynamicSummaryMap.get(uName) : null);
    const area = getUnitArea(u, dynamicItem, uName);
    totalFloorUnitsArea += area;

    const gid = groupMap[u.id];
    if (gid) {
      let list = matchedUnitsByGroup.get(gid);
      if (!list) {
        list = [];
        matchedUnitsByGroup.set(gid, list);
      }
      list.push({ id: u.id, name: u.name, sizeM2: area });
    }
  });

  let totalCategorizedArea = 0;
  matchedUnitsByGroup.forEach((uList) => {
    uList.forEach((item) => {
      totalCategorizedArea += item.sizeM2 || 0;
    });
  });

  activeVersionGroups.forEach((group: any) => {
    const matchedUnits = matchedUnitsByGroup.get(group.id) || [];
    if (matchedUnits.length > 0) {
      const totalArea = matchedUnits.reduce((acc, item) => acc + (item.sizeM2 || 0), 0);
      const areaPercent = totalCategorizedArea > 0 ? (totalArea / totalCategorizedArea) * 100 : 0;
      const floorAreaPercent = totalFloorUnitsArea > 0 ? (totalArea / totalFloorUnitsArea) * 100 : 0;

      groupsInUseMap.set(group.id, {
        ...group,
        matchCount: matchedUnits.length,
        matchedUnits,
        totalArea,
        areaPercent,
        floorAreaPercent,
      });
    }
  });

  return {
    unitColorMap: colorMap,
    unitGroupMap: groupMap,
    unitOpacityMap: opacityMap,
    unitHatchMap: hatchMap,
    unitSymbolMap: symbolMap,
    activeGroups: Array.from(groupsInUseMap.values()),
  };
}
