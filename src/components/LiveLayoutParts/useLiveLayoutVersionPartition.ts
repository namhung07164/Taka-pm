import { useMemo, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { preloadFloorImages } from '../../lib/imageDBCache';

interface UseLiveLayoutVersionPartitionParams {
  config: any;
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
  selectedVersionId: string | null;
}

export function useLiveLayoutVersionPartition({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
  selectedVersionId,
}: UseLiveLayoutVersionPartitionParams) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);

  const localStore = useDataStore((state) => state.store);
  const localLocation = useDataStore((state) => state.location);
  const localMapUnits = useDataStore((state) => state.mapUnits);
  const localMapVersions = useDataStore((state) => state.mapVersions);
  const localActiveMapVersionId = useDataStore((state) => state.activeMapVersionId);
  const localStoreLocationData = useDataStore((state) => state.storeLocationData);
  const getAllStoreVersions = useDataStore((state) => state.getAllStoreVersions);

  const targetLoc = locationFilter !== 'all' ? locationFilter : 'L1';
  const activeYear = (
    (yearFilter && yearFilter !== 'all' ? yearFilter : '') ||
    (globalYearFilter && globalYearFilter !== 'all' ? globalYearFilter : '') ||
    (storeFilter === 'HN' ? '2027' : '2026')
  ).trim();

  // 1. Gather all store versions across all sources
  const availableStoreVersions = useMemo(() => {
    const versionsMap = new Map<string, any>();
    try {
      const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM');
      const storeVers = getAllStoreVersions(targetStoreParam);
      if (Array.isArray(storeVers)) {
        storeVers.forEach(v => {
          if (v?.id) versionsMap.set(v.id, v);
        });
      }
    } catch (e) {}

    if (localStoreLocationData) {
      Object.entries(localStoreLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${storeFilter}_`) && Array.isArray(part?.mapVersions)) {
          part.mapVersions.forEach((v: any) => {
            if (v?.id) versionsMap.set(v.id, { ...v, location: v.location || key.split('_')[1] });
          });
        }
      });
    }

    if (config?.storeLocationData) {
      Object.entries(config.storeLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${storeFilter}_`) && Array.isArray(part?.mapVersions)) {
          part.mapVersions.forEach((v: any) => {
            if (v?.id) {
              const existing = versionsMap.get(v.id) || {};
              const resolvedBg = (existing.backgroundUrl && !existing.backgroundUrl.startsWith('r2://'))
                ? existing.backgroundUrl
                : (v.backgroundUrl && !v.backgroundUrl.startsWith('r2://'))
                  ? v.backgroundUrl
                  : (existing.backgroundUrl || v.backgroundUrl);
              versionsMap.set(v.id, {
                ...v,
                ...existing,
                backgroundUrl: resolvedBg,
                location: existing.location || v.location || key.split('_')[1]
              });
            }
          });
        }
      });
    }

    if (storeFilter === 'HCM' && Array.isArray(config?.versions)) {
      config.versions.forEach((v: any) => {
        if (v?.id) {
          const existing = versionsMap.get(v.id) || {};
          const resolvedBg = (existing.backgroundUrl && !existing.backgroundUrl.startsWith('r2://'))
            ? existing.backgroundUrl
            : (v.backgroundUrl && !v.backgroundUrl.startsWith('r2://'))
              ? v.backgroundUrl
              : (existing.backgroundUrl || v.backgroundUrl);
          versionsMap.set(v.id, {
            ...v,
            ...existing,
            backgroundUrl: resolvedBg,
            store: existing.store || v.store || 'HCM'
          });
        }
      });
    }

    return Array.from(versionsMap.values());
  }, [getAllStoreVersions, storeFilter, localStoreLocationData, config]);

  // Pre-cache all floor maps for this store into IndexedDB
  useEffect(() => {
    if (availableStoreVersions.length > 0) {
      const urls = availableStoreVersions
        .map(v => v?.backgroundUrl)
        .filter((u): u is string => typeof u === 'string' && u.length > 0 && !u.startsWith('r2://'));
      if (urls.length > 0) {
        preloadFloorImages(urls);
      }
    }
  }, [availableStoreVersions]);

  // 2. Filter versions specific to targetLoc (e.g. L2) and year
  const locationVersions = useMemo(() => {
    if (availableStoreVersions.length === 0) return [];
    const tLoc = targetLoc.toUpperCase().trim();
    const tokenRegex = new RegExp(`(^|[^a-zA-Z0-9])${tLoc}([^a-zA-Z0-9]|$)`, 'i');
    const matched = availableStoreVersions.filter(v => {
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      return vLoc === tLoc || (vLoc === '' && tokenRegex.test(vName));
    });

    if (matched.length === 0) {
      return [];
    }

    if (activeYear && activeYear !== 'all') {
      const targetYear = String(activeYear).trim();
      const yearMatched = matched.filter(v => String(v.year || '').trim() === targetYear);
      if (yearMatched.length > 0) {
        return yearMatched;
      }
      const sortedByYear = [...matched].sort((a, b) => {
        const yA = Number(a.year) || 0;
        const yB = Number(b.year) || 0;
        return yB - yA;
      });
      return sortedByYear;
    }
    return matched;
  }, [availableStoreVersions, targetLoc, activeYear]);

  // 3. Resolve active version & units
  const { r2Version, r2Units } = useMemo(() => {
    const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const tLoc = targetLoc.toUpperCase().trim();
    const pKey = `${targetStoreParam}_${tLoc}`;

    const localPart = localStoreLocationData?.[pKey] || (
      localStore === targetStoreParam && String(localLocation).toUpperCase().trim() === tLoc
        ? { mapUnits: localMapUnits, mapVersions: localMapVersions, activeMapVersionId: localActiveMapVersionId }
        : null
    );
    const cloudPart = config?.storeLocationData?.[pKey];
    const partition = (localPart && Array.isArray(localPart.mapVersions) && localPart.mapVersions.length > 0)
      ? localPart
      : cloudPart;

    let v: any = null;
    if (selectedVersionId && locationVersions.some(lv => lv.id === selectedVersionId)) {
      v = locationVersions.find(lv => lv.id === selectedVersionId);
    } else if (localActiveMapVersionId && locationVersions.some(lv => lv.id === localActiveMapVersionId)) {
      v = locationVersions.find(lv => lv.id === localActiveMapVersionId);
    } else if (partition?.activeMapVersionId && locationVersions.some(lv => lv.id === partition.activeMapVersionId)) {
      v = locationVersions.find(lv => lv.id === partition.activeMapVersionId);
    } else if (locationVersions.length > 0) {
      v = locationVersions.find(lv => lv.isDynamicActive !== false && Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions.find(lv => Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions[0];
    }

    if (!v) {
      return { r2Version: null, r2Units: [] };
    }

    let bgUrl = v.backgroundUrl || '';
    if (!bgUrl || bgUrl.startsWith('r2://')) {
      if (cloudPart?.mapVersions) {
        const matchingCloudV = cloudPart.mapVersions.find((cv: any) => cv.id === v.id || cv.name === v.name);
        if (matchingCloudV?.backgroundUrl && !matchingCloudV.backgroundUrl.startsWith('r2://')) {
          bgUrl = matchingCloudV.backgroundUrl;
        }
      }
      if ((!bgUrl || bgUrl.startsWith('r2://')) && config?.storeLocationData) {
        for (const part of Object.values(config.storeLocationData) as any[]) {
          const matchingCloudV = part?.mapVersions?.find((cv: any) => cv.id === v.id || cv.name === v.name);
          if (matchingCloudV?.backgroundUrl && !matchingCloudV.backgroundUrl.startsWith('r2://')) {
            bgUrl = matchingCloudV.backgroundUrl;
            break;
          }
        }
      }
      if ((!bgUrl || bgUrl.startsWith('r2://')) && config?.version?.backgroundUrl && !config.version.backgroundUrl.startsWith('r2://')) {
        if (config.version.id === v.id || config.version.name === v.name) {
          bgUrl = config.version.backgroundUrl;
        }
      }
    }

    const finalVersion = { ...v, backgroundUrl: bgUrl };
    const vLoc = (finalVersion.location || targetLoc || '').toUpperCase().trim();

    let candidateUnits: any[] = [];
    if (localStore === targetStoreParam && String(localLocation).toUpperCase().trim() === tLoc && Array.isArray(localMapUnits) && localMapUnits.length > 0) {
      candidateUnits = localMapUnits;
    } else if (localStoreLocationData?.[pKey]?.mapUnits && Array.isArray(localStoreLocationData[pKey].mapUnits) && localStoreLocationData[pKey].mapUnits.length > 0) {
      candidateUnits = localStoreLocationData[pKey].mapUnits;
    } else if (config?.storeLocationData?.[pKey]?.mapUnits && Array.isArray(config.storeLocationData[pKey].mapUnits) && config.storeLocationData[pKey].mapUnits.length > 0) {
      candidateUnits = config.storeLocationData[pKey].mapUnits;
    } else if (Array.isArray(finalVersion?.mapUnits) && finalVersion.mapUnits.length > 0) {
      candidateUnits = finalVersion.mapUnits;
    } else if (targetStoreParam === 'HCM' && Array.isArray(config?.mapUnits) && config.mapUnits.length > 0) {
      candidateUnits = config.mapUnits;
    } else if (targetStoreParam === 'HCM' && Array.isArray(config?.units) && config.units.length > 0) {
      candidateUnits = config.units;
    }

    const unitsMap = new Map<string, any>();
    const seenCoordinates = new Map<string, string>();
    const seenUnitNames = new Map<string, string>();

    candidateUnits.forEach((u: any) => {
      if (!u || (!u.id && !u.name)) return;
      if (!u.type && !u.points && !(u.width && u.height)) return;
      const uLoc = String(u.location || '').toUpperCase().trim();
      const uStore = String(u.store || '').toUpperCase().trim();

      if (uStore && uStore !== 'ALL' && uStore !== targetStoreParam) return;

      const isStorewideUnit = uLoc === 'STORE' || uLoc === 'ALL' || uLoc === 'STOREWIDE' || uLoc === 'ALL FLOORS';
      if (uLoc && !isStorewideUnit && uLoc !== tLoc && uLoc !== vLoc) {
        return;
      }

      const id = String(u.id || u.name);
      const cleanName = String(u.name || '').trim();
      const lowerName = cleanName.toLowerCase();
      const taggedUnit = {
        ...u,
        id,
        name: cleanName,
        store: targetStoreParam,
        location: uLoc || tLoc,
      };

      let coordKey = '';
      if (u.type === 'rect' && u.width > 0 && u.height > 0) {
        coordKey = `rect_${Math.round(u.x || 0)}_${Math.round(u.y || 0)}_${Math.round(u.width || 0)}_${Math.round(u.height || 0)}`;
      } else if (u.type === 'circle' && u.radius > 0) {
        coordKey = `circle_${Math.round(u.x || 0)}_${Math.round(u.y || 0)}_${Math.round(u.radius || 0)}`;
      } else if (u.type === 'polygon' && Array.isArray(u.points) && u.points.length >= 4) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < u.points.length; i += 2) {
          const px = u.points[i];
          const py = u.points[i + 1];
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
        }
        coordKey = `poly_${Math.round(minX)}_${Math.round(minY)}_${Math.round(maxX - minX)}_${Math.round(maxY - minY)}`;
      }

      if (coordKey && seenCoordinates.has(coordKey)) {
        const prevId = seenCoordinates.get(coordKey)!;
        const prev = unitsMap.get(prevId);
        if (!prev?.name && taggedUnit.name) {
          unitsMap.delete(prevId);
          unitsMap.set(id, taggedUnit);
          seenCoordinates.set(coordKey, id);
          if (lowerName) seenUnitNames.set(lowerName, id);
        }
        return;
      }

      if (lowerName && seenUnitNames.has(lowerName)) {
        const prevId = seenUnitNames.get(lowerName)!;
        const prev = unitsMap.get(prevId);
        if (!prev || (!prev.type && taggedUnit.type)) {
          unitsMap.delete(prevId);
          unitsMap.set(id, taggedUnit);
          seenUnitNames.set(lowerName, id);
          if (coordKey) seenCoordinates.set(coordKey, id);
        }
        return;
      }

      if (coordKey) seenCoordinates.set(coordKey, id);
      if (lowerName) seenUnitNames.set(lowerName, id);
      unitsMap.set(id, taggedUnit);
    });

    return { r2Version: finalVersion, r2Units: Array.from(unitsMap.values()) };
  }, [
    config, storeFilter, targetLoc, localStoreLocationData, localStore, localLocation,
    localMapUnits, localMapVersions, localActiveMapVersionId, selectedVersionId,
    locationVersions
  ]);

  const version = r2Version || config?.version || { id: 'default', name: 'Mặc định', backgroundUrl: '' };
  const units: any[] = r2Units.length > 0 ? r2Units : (config?.units || config?.mapUnits || []);
  const groups: any[] = version?.groups || config?.groups || [];

  const effectiveLayoutYear = String(
    version?.year ||
    activeYear ||
    (storeFilter === 'HN' ? '2027' : '2026')
  ).trim();

  return {
    targetLoc,
    activeYear,
    effectiveLayoutYear,
    availableStoreVersions,
    locationVersions,
    version,
    units,
    groups,
  };
}
