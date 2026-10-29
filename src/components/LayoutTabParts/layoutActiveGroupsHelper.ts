import { isSecondaryGroupedUnitForProject } from '../../lib/unitSizeResolver';

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

  const getUnitProject = (u: any, dynamicItem: any, uName: string): any => {
    return (
      dynamicItem?.matchedProject ||
      aggregatedData[uName]?.matchedProject ||
      (u?.id ? aggregatedData[String(u.id).toLowerCase()]?.matchedProject : null) ||
      null
    );
  };

  const isUnitSecondaryGrouped = (u: any, dynamicItem: any, uName: string, proj: any): boolean => {
    if (dynamicItem?.isGroupedSecondaryUnit || aggregatedData[uName]?.isGroupedSecondaryUnit) {
      return true;
    }
    if (u?.id && aggregatedData[String(u.id).toLowerCase()]?.isGroupedSecondaryUnit) {
      return true;
    }
    if (proj && isSecondaryGroupedUnitForProject(proj, u?.name || u?.id || uName)) {
      return true;
    }
    return false;
  };

  const getUnitOwnSize = (u: any, dynamicItem: any, uName: string): number => {
    const rawSize =
      aggregatedData[uName]?.editTabSizeM2 ??
      dynamicItem?.sizeM2 ??
      dynamicItem?.size ??
      aggregatedData[uName]?.sizeM2 ??
      aggregatedData[uName]?.size ??
      (u?.id ? aggregatedData[String(u.id).toLowerCase()]?.sizeM2 : 0) ??
      (u?.id ? aggregatedData[String(u.id).toLowerCase()]?.size : 0) ??
      u?.sizeM2 ??
      u?.size ??
      0;
    const parsed = Number(String(rawSize).replace(/,/g, '.'));
    return !isNaN(parsed) && parsed > 0 ? parsed : 0;
  };

  const getUnitProjectSize = (u: any, dynamicItem: any, uName: string): number => {
    const proj = getUnitProject(u, dynamicItem, uName);
    if (isUnitSecondaryGrouped(u, dynamicItem, uName, proj)) {
      return getUnitOwnSize(u, dynamicItem, uName);
    }
    const rawPSize =
      proj?.sizeM2 ??
      (proj as any)?.size ??
      (proj as any)?.area ??
      dynamicItem?.appProjectSizeM2 ??
      aggregatedData[uName]?.appProjectSizeM2 ??
      (u?.id ? aggregatedData[String(u.id).toLowerCase()]?.appProjectSizeM2 : 0);
    const parsed = Number(String(rawPSize ?? '').replace(/,/g, '.'));
    return !isNaN(parsed) && parsed > 0 ? parsed : 0;
  };

  const getUnitArea = (u: any, dynamicItem: any, uName: string): number => {
    const proj = getUnitProject(u, dynamicItem, uName);
    if (isUnitSecondaryGrouped(u, dynamicItem, uName, proj)) {
      return getUnitOwnSize(u, dynamicItem, uName);
    }
    // 1. Highest priority for primary project unit: The Project's actual size (p.sizeM2 / appProjectSizeM2)
    const projSize = getUnitProjectSize(u, dynamicItem, uName);
    if (projSize > 0) return projSize;

    // 2. Fallback to dynamicItem / aggregatedData / unit shape
    return getUnitOwnSize(u, dynamicItem, uName);
  };

  // Step 1: Assign color and matched group for each unit with active app project
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

  // Step 2: Group matched units and collect distinct project sizes + linked secondary unit sizes
  const matchedUnitsByGroup = new Map<string, any[]>();
  const seenFloorProjectKeys = new Set<string>();
  let totalFloorUnitsArea = 0;

  units.forEach((u: any) => {
    const uName = String(u.name || '').toLowerCase().trim();
    if (restrictedProjectCodes.has(uName) || aggregatedData[uName]?.isRestricted) return;

    const dynamicItem = dynamicSummaryMap.get(u.id) || (uName ? dynamicSummaryMap.get(uName) : null);
    const proj = getUnitProject(u, dynamicItem, uName);
    const isSecondaryGrouped = isUnitSecondaryGrouped(u, dynamicItem, uName, proj);
    const projSize = getUnitProjectSize(u, dynamicItem, uName);
    const area = getUnitArea(u, dynamicItem, uName);

    const projKey = !isSecondaryGrouped && proj
      ? String(proj.id || proj.code || u.name).trim().toLowerCase()
      : null;

    if (projKey && projSize > 0) {
      if (!seenFloorProjectKeys.has(projKey)) {
        seenFloorProjectKeys.add(projKey);
        totalFloorUnitsArea += projSize;
      }
    } else {
      totalFloorUnitsArea += area;
    }

    const gid = groupMap[u.id];
    if (gid) {
      let list = matchedUnitsByGroup.get(gid);
      if (!list) {
        list = [];
        matchedUnitsByGroup.set(gid, list);
      }
      list.push({
        id: u.id,
        name: u.name,
        sizeM2: area,
        project: proj,
        projectSize: projSize,
        isSecondaryGrouped,
      });
    }
  });

  totalFloorUnitsArea = Math.round(totalFloorUnitsArea * 10) / 10;

  // Step 3: Compute total area for each group by summing primary project sizeM2 + secondary linked units' own sizeM2
  let totalCategorizedArea = 0;

  activeVersionGroups.forEach((group: any) => {
    const matchedUnits = matchedUnitsByGroup.get(group.id) || [];
    if (matchedUnits.length > 0) {
      const seenGroupProjectKeys = new Set<string>();
      let groupAreaSum = 0;

      matchedUnits.forEach((item) => {
        const proj = item.project;
        const projKey = !item.isSecondaryGrouped && proj
          ? String(proj.id || proj.code || item.name).trim().toLowerCase()
          : null;

        if (projKey && item.projectSize > 0) {
          if (!seenGroupProjectKeys.has(projKey)) {
            seenGroupProjectKeys.add(projKey);
            groupAreaSum += item.projectSize;
          }
        } else {
          groupAreaSum += item.sizeM2 || 0;
        }
      });

      const totalArea = Math.round(groupAreaSum * 10) / 10;
      totalCategorizedArea += totalArea;

      groupsInUseMap.set(group.id, {
        ...group,
        matchCount: matchedUnits.length,
        matchedUnits,
        totalArea,
      });
    }
  });

  totalCategorizedArea = Math.round(totalCategorizedArea * 10) / 10;

  // Step 4: Calculate final percentages
  groupsInUseMap.forEach((group, gid) => {
    const totalArea = group.totalArea || 0;
    const areaPercent = totalCategorizedArea > 0 ? (totalArea / totalCategorizedArea) * 100 : 0;
    const floorAreaPercent = totalFloorUnitsArea > 0 ? (totalArea / totalFloorUnitsArea) * 100 : 0;

    groupsInUseMap.set(gid, {
      ...group,
      areaPercent,
      floorAreaPercent,
    });
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
