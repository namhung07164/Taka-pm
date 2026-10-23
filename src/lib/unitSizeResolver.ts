import { useDataStore } from '../components/PictureMapping/DataContext';
import { MapVersion, UnitShape } from '../components/PictureMapping/components/DataMapping/types';
import { extractAllProjectCodes, projectMatchesUnitCode } from './utilsParts/projectCodeAndScopeUtils';
import { useAppStore } from '../store/useAppStore';
import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';

let _hasAttemptedLocalRestore = false;
let _hasAttemptedFirestoreRestore = false;
let _cachedLocalBackup: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null }> | null = null;

/**
 * Ensures Picture Mapping storeLocationData is hydrated in memory without mutating Zustand during React render.
 */
export function ensureMappingConfigHydrated(): void {
  if (typeof window === 'undefined') return;
  const state = useDataStore.getState();
  const hasPartitions =
    state.storeLocationData && Object.keys(state.storeLocationData).length > 0;
  if (hasPartitions) return;

  if (!_hasAttemptedLocalRestore) {
    _hasAttemptedLocalRestore = true;
    try {
      const cached = localStorage.getItem('taka_mapping_config_backup');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.storeLocationData && Object.keys(parsed.storeLocationData).length > 0) {
          _cachedLocalBackup = parsed.storeLocationData;
          // Defer Zustand setState to macrotask to avoid updating store during component render
          setTimeout(() => {
            const cur = useDataStore.getState();
            if (!cur.storeLocationData || Object.keys(cur.storeLocationData).length === 0) {
              cur.loadFullCloudData({
                storeLocationData: parsed.storeLocationData,
                store: parsed.store || cur.store,
                location: parsed.location || cur.location,
                activeMapVersionId: parsed.activeMapVersionId || cur.activeMapVersionId,
                reviewSelectedLabels: parsed.reviewSelectedLabels || cur.reviewSelectedLabels,
                reviewLabelColors: parsed.reviewLabelColors || cur.reviewLabelColors,
              });
            }
          }, 0);
          return;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  if (!_hasAttemptedFirestoreRestore) {
    _hasAttemptedFirestoreRestore = true;
    setTimeout(async () => {
      try {
        const current = useDataStore.getState();
        if (current.storeLocationData && Object.keys(current.storeLocationData).length > 0) {
          return;
        }
        const snap = await getDoc(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config')
        );
        if (snap.exists()) {
          const fsData = snap.data() as any;
          if (fsData?.storeLocationData && Object.keys(fsData.storeLocationData).length > 0) {
            _cachedLocalBackup = fsData.storeLocationData;
            useDataStore.getState().loadFullCloudData({
              storeLocationData: fsData.storeLocationData,
              store: fsData.store || current.store,
              location: fsData.location || current.location,
              activeMapVersionId: fsData.activeMapVersionId || current.activeMapVersionId,
              reviewSelectedLabels: fsData.reviewSelectedLabels || current.reviewSelectedLabels,
              reviewLabelColors: fsData.reviewLabelColors || current.reviewLabelColors,
            });
          }
        }
      } catch {
        // Ignore background fallback error
      }
    }, 0);
  }
}

export function normalizeFloorCode(rawLoc?: string | null): string {
  if (!rawLoc) return '';
  let loc = String(rawLoc).toUpperCase().trim();
  if (loc.startsWith('MD-')) loc = loc.slice(3);
  if (loc.endsWith('F') && loc.length === 2 && /^\dF$/.test(loc)) {
    loc = `L${loc[0]}`;
  }
  if (/^L\d+[A-Z]$/i.test(loc)) {
    loc = loc.slice(0, -1);
  }
  return loc;
}

/**
 * Resolves the effective Size (m²) of a single unit shape, respecting version-specific unitSizes first,
 * then unit.sizeM2 / unit.size, then fallback master Excel size, and finally any matched Project's sizeM2.
 */
export function getUnitEffectiveSizeM2(
  unit?: Partial<UnitShape> | null,
  version?: Partial<MapVersion> | null,
  fallbackSize?: number | string | null,
  skipProjectFallback = false
): number {
  if (!unit) {
    const fb = Number(String(fallbackSize ?? '').replace(/,/g, ''));
    return !isNaN(fb) && fb > 0 ? fb : 0;
  }

  if (version?.unitSizes) {
    if (unit.id && typeof version.unitSizes[unit.id] === 'number' && version.unitSizes[unit.id] > 0) {
      return version.unitSizes[unit.id];
    }
    const uNameKey = String(unit.name || '').trim().toUpperCase();
    if (uNameKey && typeof version.unitSizes[uNameKey] === 'number' && version.unitSizes[uNameKey] > 0) {
      return version.unitSizes[uNameKey];
    }
  }

  if (typeof unit.sizeM2 === 'number' && !isNaN(unit.sizeM2) && unit.sizeM2 > 0) {
    return unit.sizeM2;
  }
  if (typeof unit.size === 'number' && !isNaN(unit.size) && unit.size > 0) {
    return unit.size;
  }
  const parsedUnitSize = Number(String((unit as any).sizeM2 ?? (unit as any).size ?? '').replace(/,/g, ''));
  if (!isNaN(parsedUnitSize) && parsedUnitSize > 0) {
    return parsedUnitSize;
  }

  const fb = Number(String(fallbackSize ?? '').replace(/,/g, ''));
  if (!isNaN(fb) && fb > 0) {
    return fb;
  }

  if (!skipProjectFallback) {
    const uName = String(unit.name || unit.id || '').trim();
    if (uName) {
      const uNameLower = uName.toLowerCase();
      const targetStore = String(unit.store || version?.store || useDataStore.getState().store || 'HCM').toUpperCase().trim();
      const targetLoc = normalizeFloorCode(unit.location || version?.location || useDataStore.getState().location);
      const targetYear = String(version?.year || '').trim();

      const projects = useAppStore.getState().projects || [];
      for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        if (!p || p.isDeleted || !p.sizeM2 || p.sizeM2 <= 0) continue;
        const pStore = String(p.store || 'HCM').toUpperCase().trim();
        if (pStore !== targetStore) continue;
        if (targetYear && targetYear !== 'all' && p.year && String(p.year).trim() !== targetYear) continue;
        const pLoc = normalizeFloorCode(p.location);
        const isStorewide = !pLoc || pLoc === 'ALL' || pLoc === 'STORE' || pLoc === 'STOREWIDE' || pLoc === 'WHOLE STORE' || pLoc === 'ALL FLOORS';
        if (!isStorewide && targetLoc && pLoc !== targetLoc) continue;

        const pCodes = extractAllProjectCodes(p);
        if (pCodes.length === 0) continue;
        const isExact = pCodes.some((c) => c.toLowerCase() === uNameLower);
        if (isExact || projectMatchesUnitCode(pCodes, uName)) {
          const shareCount = Math.max(1, pCodes.length);
          return Math.round((p.sizeM2 / shareCount) * 100) / 100;
        }
      }
    }
  }

  return 0;
}

export interface MatchedUnitSizeResult {
  sizeM2: number | undefined;
  matchedUnitNames: string[];
  versionName?: string;
  versionYear?: string;
}

/**
 * Finds the matching version for a Project's (store, location, year) and calculates
 * the total Size (m²) from the unit(s) mapped/matched to the project in that version.
 */
export function resolveMatchedUnitSizeM2(projectOrInput: {
  code?: string;
  linkCodes?: string;
  store?: string;
  location?: string;
  year?: string | number;
}): MatchedUnitSizeResult {
  ensureMappingConfigHydrated();

  const pCodes = extractAllProjectCodes(projectOrInput);
  if (pCodes.length === 0) {
    return { sizeM2: undefined, matchedUnitNames: [] };
  }

  const state = useDataStore.getState();
  const targetStore = (String(projectOrInput.store || state.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
  const targetLoc = normalizeFloorCode(projectOrInput.location);
  const targetYear = String(projectOrInput.year || '').trim();

  // Also include any linked unit codes from projectLink table
  const projectLink = state.projectLink || [];
  const linkedUnitNames = new Set<string>();
  projectLink.forEach((pl: any) => {
    const u = String(pl?.unit || '').trim();
    const plCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && plCode) {
      if (pCodes.some(pc => pc.toLowerCase() === plCode || projectMatchesUnitCode([pc], plCode))) {
        linkedUnitNames.add(u.toLowerCase());
      }
    }
  });

  // Build merged partitions dictionary including cached localStorage backup and active in-memory partition
  const activeKey = `${state.store}_${normalizeFloorCode(state.location)}`;
  const basePartitions =
    state.storeLocationData && Object.keys(state.storeLocationData).length > 0
      ? state.storeLocationData
      : (_cachedLocalBackup || {});
  const allPartitions: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null }> = {
    ...basePartitions,
  };
  if ((state.mapUnits && state.mapUnits.length > 0) || (state.mapVersions && state.mapVersions.length > 0)) {
    const existing = allPartitions[activeKey];
    allPartitions[activeKey] = {
      mapUnits: state.mapUnits.length > 0 ? state.mapUnits : (existing?.mapUnits || []),
      mapVersions: state.mapVersions.length > 0 ? state.mapVersions : (existing?.mapVersions || []),
      activeMapVersionId: state.activeMapVersionId || existing?.activeMapVersionId || null,
    };
  }

  const isStorewideLoc =
    !targetLoc ||
    targetLoc === 'ALL' ||
    targetLoc === 'STORE' ||
    targetLoc === 'STOREWIDE' ||
    targetLoc === 'WHOLE STORE' ||
    targetLoc === 'ALL FLOORS';

  const candidatePartitionKeys = Object.keys(allPartitions).filter((k) => {
    if (!k.startsWith(`${targetStore}_`)) return false;
    if (isStorewideLoc) return true;
    const partLoc = normalizeFloorCode(k.split('_')[1]);
    return partLoc === targetLoc;
  });

  // Master unitInfo fallback lookup
  const masterSizeByUnit = new Map<string, number>();
  (state.unitInfo || []).forEach((ui: any) => {
    const uKey = String(ui?.unit || '').trim().toLowerCase();
    const sz = Number(String(ui?.size ?? '').replace(/,/g, ''));
    if (uKey && !isNaN(sz) && sz > 0) {
      masterSizeByUnit.set(uKey, sz);
    }
  });

  const matchedSizeByUnitKey = new Map<string, { name: string; sizeM2: number; versionName?: string; versionYear?: string }>();

  for (const pKey of candidatePartitionKeys) {
    const part = allPartitions[pKey];
    if (!part) continue;

    const versions = Array.isArray(part.mapVersions) ? part.mapVersions : [];
    let matchedVersion: MapVersion | undefined;

    if (versions.length > 0) {
      const yearMatched = targetYear
        ? versions.filter((v) => String(v.year || '').trim() === targetYear)
        : versions;

      const pool = yearMatched.length > 0 ? yearMatched : versions;

      if (state.activeMapVersionId && pool.some((v) => v.id === state.activeMapVersionId)) {
        matchedVersion = pool.find((v) => v.id === state.activeMapVersionId);
      } else if (part.activeMapVersionId && pool.some((v) => v.id === part.activeMapVersionId)) {
        matchedVersion = pool.find((v) => v.id === part.activeMapVersionId);
      } else {
        matchedVersion =
          pool.find((v) => v.isDynamicActive !== false && Array.isArray(v.groups) && v.groups.length > 0) ||
          pool[0];
      }
    }

    // Gather units from both the version's mapUnits and the partition's mapUnits
    const versionUnits = Array.isArray(matchedVersion?.mapUnits) ? matchedVersion!.mapUnits! : [];
    const partitionUnits = Array.isArray(part.mapUnits) ? part.mapUnits : [];

    // Index versionUnits by id and name so version-specific unit shapes take precedence
    const combinedUnitsMap = new Map<string, UnitShape>();
    partitionUnits.forEach((u) => {
      if (u && (u.name || u.id)) {
        combinedUnitsMap.set(String(u.name || u.id).trim().toLowerCase(), u);
      }
    });
    versionUnits.forEach((u) => {
      if (u && (u.name || u.id)) {
        const key = String(u.name || u.id).trim().toLowerCase();
        const prev = combinedUnitsMap.get(key);
        combinedUnitsMap.set(key, {
          ...(prev || {}),
          ...u,
          sizeM2: u.sizeM2 ?? prev?.sizeM2,
          size: u.size ?? prev?.size,
        });
      }
    });

    combinedUnitsMap.forEach((u) => {
      const uName = String(u.name || '').trim();
      const uId = String(u.id || '').trim();
      const uNameLower = uName.toLowerCase();
      const uIdLower = uId.toLowerCase();
      if (!uNameLower && !uIdLower) return;

      const isExact = pCodes.some((c) => {
        const cl = c.toLowerCase();
        return cl === uNameLower || (uIdLower && cl === uIdLower);
      });
      const isLinked = linkedUnitNames.has(uNameLower) || (uIdLower ? linkedUnitNames.has(uIdLower) : false);
      const isCodeMatch = isExact || isLinked || projectMatchesUnitCode(pCodes, uName || uId);

      if (isCodeMatch) {
        const fallbackMasterSize = masterSizeByUnit.get(uNameLower);
        const effSize = getUnitEffectiveSizeM2(u, matchedVersion, fallbackMasterSize, true);
        if (effSize > 0) {
          const dedupKey = uNameLower || uIdLower;
          matchedSizeByUnitKey.set(dedupKey, {
            name: uName || uId,
            sizeM2: effSize,
            versionName: matchedVersion?.name,
            versionYear: matchedVersion?.year,
          });
        }
      }
    });
  }

  // Fallback: if no partition canvas unit had a match, check masterSizeByUnit for exact code matches
  if (matchedSizeByUnitKey.size === 0 && masterSizeByUnit.size > 0) {
    pCodes.forEach((c) => {
      const cl = c.toLowerCase().trim();
      const sz = masterSizeByUnit.get(cl);
      if (sz && sz > 0) {
        matchedSizeByUnitKey.set(cl, { name: c, sizeM2: sz });
      }
    });
  }

  if (matchedSizeByUnitKey.size === 0) {
    return { sizeM2: undefined, matchedUnitNames: [] };
  }

  let totalSize = 0;
  const matchedUnitNames: string[] = [];
  let firstVerName: string | undefined;
  let firstVerYear: string | undefined;

  matchedSizeByUnitKey.forEach((val) => {
    totalSize += val.sizeM2;
    matchedUnitNames.push(val.name);
    if (!firstVerName && val.versionName) firstVerName = val.versionName;
    if (!firstVerYear && val.versionYear) firstVerYear = val.versionYear;
  });

  const roundedTotal = Math.round(totalSize * 100) / 100;
  return {
    sizeM2: roundedTotal > 0 ? roundedTotal : undefined,
    matchedUnitNames,
    versionName: firstVerName,
    versionYear: firstVerYear,
  };
}

export { syncProjectSizeToUnits, syncUnitSizeToMatchedProjects } from './unitProjectSizeSyncService';
export type { ProjectSizeSyncInput, UnitSizeSyncInput } from './unitProjectSizeSyncService';
