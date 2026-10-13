import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { preloadFloorImages } from '../../lib/imageDBCache';
import { resolveR2UrlToHttp } from '../PictureMapping/lib/r2Upload';
import { useOffscreenImage } from '../../hooks/useOffscreenImage';

interface UseLayoutFloorDataProps {
  config: any;
  storeFilter: string;
  locationFilter: string;
  yearFilter?: string;
}

export function useLayoutFloorData({
  config,
  storeFilter,
  locationFilter,
  yearFilter,
}: UseLayoutFloorDataProps) {
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const localStoreLocationData = useDataStore((state) => state.storeLocationData);
  const localStore = useDataStore((state) => state.store);
  const localLocation = useDataStore((state) => state.location);
  const localMapUnits = useDataStore((state) => state.mapUnits);
  const localMapVersions = useDataStore((state) => state.mapVersions);
  const localActiveMapVersionId = useDataStore((state) => state.activeMapVersionId);
  const getAllStoreVersions = useDataStore((state) => state.getAllStoreVersions);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const targetLoc = locationFilter !== 'all' ? locationFilter : 'L1';

  const activeYear = (
    (yearFilter && yearFilter !== 'all' ? yearFilter : '') ||
    (globalYearFilter && globalYearFilter !== 'all' ? globalYearFilter : '') ||
    (storeFilter === 'HN' ? '2027' : '2026')
  ).trim();

  // 1. Gather all store versions across all sources (Zustand helper, local partitions, cloud partitions, and root config)
  const prevAvailVersionsRef = useRef<any[]>([]);
  const prevAvailVersionsKeyRef = useRef<string>('');

  const availableStoreVersions = useMemo(() => {
    const versionsMap = new Map<string, any>();

    // From Zustand store helper
    try {
      const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM');
      const storeVers = getAllStoreVersions(targetStoreParam);
      if (Array.isArray(storeVers)) {
        storeVers.forEach(v => {
          if (v?.id) versionsMap.set(v.id, v);
        });
      }
    } catch (e) {}

    // From local in-memory partitions
    if (localStoreLocationData) {
      Object.entries(localStoreLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${storeFilter}_`) && Array.isArray(part?.mapVersions)) {
          part.mapVersions.forEach((v: any) => {
            if (v?.id) versionsMap.set(v.id, { ...v, location: v.location || key.split('_')[1] });
          });
        }
      });
    }

    // From cloud config partitions
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

    // From cloud config root versions (legacy fallback for HCM only)
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

    const finalVersions = Array.from(versionsMap.values());
    const key = `${storeFilter}_${finalVersions.map(v => `${v?.id || ''}_${v?.backgroundUrl || ''}`).join('|')}`;
    if (key === prevAvailVersionsKeyRef.current) {
      return prevAvailVersionsRef.current;
    }
    prevAvailVersionsKeyRef.current = key;
    prevAvailVersionsRef.current = finalVersions;
    return finalVersions;
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

  // 2. Filter versions specific to targetLoc (e.g. L2) and year from Picture Mapping / global setting
  const prevLocationVersionsRef = useRef<any[]>([]);
  const prevLocationVersionsKeyRef = useRef<string>('');

  const locationVersions = useMemo(() => {
    if (availableStoreVersions.length === 0) return [];
    
    const tLoc = targetLoc.toUpperCase().trim();
    const tokenRegex = new RegExp(`(^|[^a-zA-Z0-9])${tLoc}([^a-zA-Z0-9]|$)`, 'i');

    const matched = availableStoreVersions.filter(v => {
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      return vLoc === tLoc || (vLoc === '' && tokenRegex.test(vName));
    });

    let result = matched;
    if (matched.length === 0) {
      result = [];
    } else if (activeYear && activeYear !== 'all') {
      const targetYear = String(activeYear).trim();
      const yearMatched = matched.filter(v => String(v.year || '').trim() === targetYear);
      if (yearMatched.length > 0) {
        result = yearMatched;
      } else {
        result = [...matched].sort((a, b) => {
          const yA = Number(a.year) || 0;
          const yB = Number(b.year) || 0;
          return yB - yA;
        });
      }
    }

    const key = `${targetLoc}_${activeYear}_${result.map(v => v?.id || '').join('|')}`;
    if (key === prevLocationVersionsKeyRef.current) {
      return prevLocationVersionsRef.current;
    }
    prevLocationVersionsKeyRef.current = key;
    prevLocationVersionsRef.current = result;
    return result;
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

    // Pick version: check selectedVersionId first, then localActiveMapVersionId from Picture tab, then partition.activeMapVersionId, then matching location versions
    let v: any = null;
    if (selectedVersionId && locationVersions.some(lv => lv.id === selectedVersionId)) {
      v = locationVersions.find(lv => lv.id === selectedVersionId);
    } else if (localActiveMapVersionId && locationVersions.some(lv => lv.id === localActiveMapVersionId)) {
      v = locationVersions.find(lv => lv.id === localActiveMapVersionId);
    } else if (partition?.activeMapVersionId && locationVersions.some(lv => lv.id === partition.activeMapVersionId)) {
      v = locationVersions.find(lv => lv.id === partition.activeMapVersionId);
    } else if (locationVersions.length > 0) {
      // Prioritize version for this floor with dynamic rules or groups
      v = locationVersions.find(lv => lv.isDynamicActive !== false && Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions.find(lv => Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions[0];
    }

    if (!v) {
      return { r2Version: null, r2Units: [] };
    }

    // Resolve backgroundUrl if empty or r2://
    let bgUrl = v.backgroundUrl || '';
    if (!bgUrl || bgUrl.startsWith('r2://')) {
      // Scan all cloud partitions and versions for resolved signed URL
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
    if (Array.isArray(finalVersion?.mapUnits) && finalVersion.mapUnits.length > 0) {
      candidateUnits = finalVersion.mapUnits;
    } else if (localStore === targetStoreParam && String(localLocation).toUpperCase().trim() === tLoc && Array.isArray(localMapUnits) && localMapUnits.length > 0) {
      candidateUnits = localMapUnits;
    } else if (localStoreLocationData?.[pKey]?.mapUnits && Array.isArray(localStoreLocationData[pKey].mapUnits) && localStoreLocationData[pKey].mapUnits.length > 0) {
      candidateUnits = localStoreLocationData[pKey].mapUnits;
    } else if (config?.storeLocationData?.[pKey]?.mapUnits && Array.isArray(config.storeLocationData[pKey].mapUnits) && config.storeLocationData[pKey].mapUnits.length > 0) {
      candidateUnits = config.storeLocationData[pKey].mapUnits;
    } else if (targetStoreParam === 'HCM' && Array.isArray(config?.mapUnits) && config.mapUnits.length > 0) {
      candidateUnits = config.mapUnits;
    } else if (targetStoreParam === 'HCM' && Array.isArray(config?.units) && config.units.length > 0) {
      candidateUnits = config.units;
    }

    // Sanitize, filter strictly to target floor & year, and deduplicate overlapping ghost shapes
    const unitsMap = new Map<string, any>();
    const seenCoordinates = new Map<string, string>(); // geometryKey -> id
    const seenUnitNames = new Map<string, string>(); // lowercase clean unit name -> id

    candidateUnits.forEach((u: any) => {
      if (!u || (!u.id && !u.name)) return;
      if (!u.type && !u.points && !(u.width && u.height)) return;

      const uLoc = String(u.location || '').toUpperCase().trim();
      const uStore = String(u.store || '').toUpperCase().trim();

      // Store check
      if (uStore && uStore !== 'ALL' && uStore !== targetStoreParam) return;

      // Year check
      const uYr = String(u.year || '').trim();
      if (uYr && uYr !== 'ALL' && activeYear && activeYear !== 'all' && uYr !== activeYear) return;

      // Strict Floor check: accept units explicitly matching current floor, matching active version floor, or storewide
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

      // Geometry hash for deduplication (rect, circle, polygon)
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

      // Check Coordinate Collision: If two shapes occupy the exact same geometry spot
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

      // Check Name Collision: If two units on the same floor have the exact same unit name
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

    const finalUnitsList = Array.from(unitsMap.values());
    return { r2Version: finalVersion, r2Units: finalUnitsList };
  }, [
    config, storeFilter, targetLoc, localStoreLocationData, localStore, localLocation,
    localMapUnits, localMapVersions, localActiveMapVersionId, selectedVersionId,
    locationVersions
  ]);

  const version = r2Version;
  const units = r2Units;

  const [resolvedBgUrl, setResolvedBgUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    const rawUrl = version?.backgroundUrl || '';
    if (!rawUrl) {
      setResolvedBgUrl(prev => prev === '' ? prev : '');
      return;
    }
    if (rawUrl.startsWith('r2://') || (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://') && !rawUrl.startsWith('data:') && !rawUrl.startsWith('blob:'))) {
      resolveR2UrlToHttp(rawUrl).then(url => {
        if (isMounted) setResolvedBgUrl(prev => prev === (url || rawUrl) ? prev : (url || rawUrl));
      }).catch(() => {
        if (isMounted) setResolvedBgUrl(prev => prev === rawUrl ? prev : rawUrl);
      });
    } else {
      setResolvedBgUrl(prev => prev === rawUrl ? prev : rawUrl);
    }
    return () => { isMounted = false; };
  }, [version?.backgroundUrl]);

  const [bgImage] = useOffscreenImage(resolvedBgUrl || version?.backgroundUrl || '', 'anonymous');

  // Helper to accurately check if unit has user-attached images in localStorage partitioned by store
  const hasStoredUnitImages = useCallback((key: string | undefined | null, overrideStore?: string): boolean => {
    if (typeof window === 'undefined' || !key) return false;
    try {
      const activeStore = (overrideStore || (storeFilter === 'HN' ? 'HN' : 'HCM')).toUpperCase();
      const storeKey = `taka_unit_images_${activeStore}_${key}`;
      const raw = localStorage.getItem(storeKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return true;
      }
      // Migrate legacy un-prefixed key for HN if present
      if (activeStore === 'HN') {
        const legacyRaw = localStorage.getItem(`taka_unit_images_${key}`);
        if (legacyRaw) {
          try {
            const parsed = JSON.parse(legacyRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const tagged = parsed.map((item: any) => ({ ...item, store: 'HN' }));
              localStorage.setItem(storeKey, JSON.stringify(tagged));
              localStorage.removeItem(`taka_unit_images_${key}`);
              return true;
            }
          } catch {}
        }
      }
      return false;
    } catch {
      return false;
    }
  }, [storeFilter]);

  // Realtime image change subscription to update canvas badges instantly upon add/delete in Tooltip
  const [unitImagesRev, setUnitImagesRev] = useState(0);
  useEffect(() => {
    const handleStorageChange = () => {
      setUnitImagesRev(prev => prev + 1);
    };
    window.addEventListener('taka_unit_images_changed', handleStorageChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('taka_unit_images_changed', handleStorageChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Reset selected version and ensure useDataStore partition syncs when locationFilter, storeFilter, or globalYearFilter changes
  useEffect(() => {
    setSelectedVersionId(prev => prev !== null ? null : prev);
    const targetStore = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const targetFloor = locationFilter && locationFilter !== 'all' ? locationFilter : 'L1';
    if (!targetFloor || targetFloor.trim() === '' || targetFloor.toUpperCase() === 'ALL') {
      return;
    }
    const currStore = useDataStore.getState().store;
    const currLocation = useDataStore.getState().location;
    if (currStore !== targetStore || currLocation !== targetFloor) {
      useDataStore.getState().setStoreAndLocation(targetStore, targetFloor);
    }
  }, [locationFilter, storeFilter, globalYearFilter]);

  const effectiveLayoutYear = String(
    activeYear || 
    version?.year || 
    (storeFilter === 'HN' ? '2027' : '2026')
  ).trim();

  return {
    version,
    units,
    locationVersions,
    availableStoreVersions,
    bgImage,
    resolvedBgUrl,
    unitImagesRev,
    hasStoredUnitImages,
    selectedVersionId,
    setSelectedVersionId,
    targetLoc,
    activeYear,
    effectiveLayoutYear,
  };
}
