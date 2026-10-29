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
 * Extracts only the primary project code tokens from `project.code` (ignoring `linkCodes`).
 */
export function extractPrimaryProjectCodes(p?: { code?: string | null } | null): string[] {
  if (!p || !p.code) return [];
  return extractAllProjectCodes({ code: p.code });
}

/**
 * Checks whether a project has additional grouped codes in `linkCodes` beyond its primary `code`.
 */
export function isProjectGroupedWithOthers(p?: { code?: string | null; linkCodes?: string | null } | null): boolean {
  if (!p || !p.linkCodes || !String(p.linkCodes).trim()) return false;
  const allCodes = extractAllProjectCodes(p);
  if (allCodes.length <= 1) return false;
  const primaryCodes = extractPrimaryProjectCodes(p);
  if (primaryCodes.length === 0) return allCodes.length > 1;
  return allCodes.some(
    (c) => !primaryCodes.includes(c) && !projectMatchesUnitCode(primaryCodes, c)
  );
}

/**
 * Checks if a unit name/code is a secondary grouped unit of project `p` (i.e. matched via `linkCodes`
 * rather than matching `p.code` directly when `p` is grouped with other projects/units).
 */
export function isSecondaryGroupedUnitForProject(
  p: { code?: string | null; linkCodes?: string | null } | null | undefined,
  unitNameOrId: string
): boolean {
  if (!p || !unitNameOrId) return false;
  const uClean = String(unitNameOrId).trim();
  if (!uClean) return false;
  const primaryCodes = extractPrimaryProjectCodes(p);
  const matchesPrimary =
    primaryCodes.length > 0 &&
    (primaryCodes.some((c) => c.toLowerCase() === uClean.toLowerCase()) ||
      projectMatchesUnitCode(primaryCodes, uClean));
  if (matchesPrimary) return false;
  return true;
}

/**
 * Resolves the effective Size (m²) of a single unit shape, respecting version-specific unitSizes first,
 * then unit.sizeM2 / unit.size, then fallback master Excel size, and finally any non-grouped primary Project's sizeM2.
 */
export function getUnitEffectiveSizeM2(
  unit?: Partial<UnitShape> | null,
  version?: Partial<MapVersion> | null,
  fallbackSize?: number | string | null,
  skipProjectFallback = false
): number {
  if (!unit) {
    const fb = Number(String(fallbackSize ?? '').replace(/,/g, '.'));
    return !isNaN(fb) && fb > 0 ? fb : 0;
  }

  if (version?.unitSizes) {
    if (unit.id && typeof version.unitSizes[unit.id] === 'number' && !isNaN(version.unitSizes[unit.id]) && version.unitSizes[unit.id] >= 0) {
      return version.unitSizes[unit.id];
    }
    const uNameKey = String(unit.name || '').trim().toUpperCase();
    if (uNameKey && typeof version.unitSizes[uNameKey] === 'number' && !isNaN(version.unitSizes[uNameKey]) && version.unitSizes[uNameKey] >= 0) {
      return version.unitSizes[uNameKey];
    }
  }

  if (typeof unit.sizeM2 === 'number' && !isNaN(unit.sizeM2) && unit.sizeM2 >= 0) {
    return unit.sizeM2;
  }
  if (typeof unit.size === 'number' && !isNaN(unit.size) && unit.size >= 0) {
    return unit.size;
  }
  const rawUnitSize = (unit as any).sizeM2 ?? (unit as any).size;
  if (rawUnitSize !== undefined && rawUnitSize !== null && String(rawUnitSize).trim() !== '') {
    const parsedUnitSize = Number(String(rawUnitSize).replace(/,/g, '.'));
    if (!isNaN(parsedUnitSize) && parsedUnitSize >= 0) {
      return parsedUnitSize;
    }
  }

  const fb = Number(String(fallbackSize ?? '').replace(/,/g, '.'));
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

        // Rule: Grouped secondary projects/units NEVER inherit the master project's sizeM2.
        // Only a unit that directly matches the project's primary code (when not a secondary grouped unit) can fallback.
        const primaryCodes = extractPrimaryProjectCodes(p);
        if (primaryCodes.length === 0) continue;
        const isPrimaryExact = primaryCodes.some((c) => c.toLowerCase() === uNameLower);
        if (isPrimaryExact || projectMatchesUnitCode(primaryCodes, uName)) {
          return Math.round(p.sizeM2 * 100) / 100;
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

interface ResolverCachedIndex {
  storeLocationDataRef: any;
  mapUnitsRef: any;
  mapVersionsRef: any;
  activeMapVersionIdRef: any;
  unitInfoRef: any;
  projectLinkRef: any;
  storeRef: any;
  locationRef: any;
  localBackupRef: any;
  allPartitions: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null }>;
  partitionKeysByStore: { HCM: Array<{ key: string; loc: string }>; HN: Array<{ key: string; loc: string }> };
  masterSizeByUnit: Map<string, number>;
  projectLinkEntries: Array<{ unitLower: string; plCode: string }>;
  combinedUnitsCache: Map<string, Map<string, UnitShape>>;
  resultCache: Map<string, MatchedUnitSizeResult>;
}

let _resolverIndex: ResolverCachedIndex | null = null;

function getOrBuildResolverIndex(state: ReturnType<typeof useDataStore.getState>): ResolverCachedIndex {
  if (
    _resolverIndex &&
    _resolverIndex.storeLocationDataRef === state.storeLocationData &&
    _resolverIndex.mapUnitsRef === state.mapUnits &&
    _resolverIndex.mapVersionsRef === state.mapVersions &&
    _resolverIndex.activeMapVersionIdRef === state.activeMapVersionId &&
    _resolverIndex.unitInfoRef === state.unitInfo &&
    _resolverIndex.projectLinkRef === state.projectLink &&
    _resolverIndex.storeRef === state.store &&
    _resolverIndex.locationRef === state.location &&
    _resolverIndex.localBackupRef === _cachedLocalBackup
  ) {
    return _resolverIndex;
  }

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

  const partitionKeysByStore: { HCM: Array<{ key: string; loc: string }>; HN: Array<{ key: string; loc: string }> } = {
    HCM: [],
    HN: [],
  };
  for (const k of Object.keys(allPartitions)) {
    const loc = normalizeFloorCode(k.split('_')[1]);
    if (k.startsWith('HCM_')) {
      partitionKeysByStore.HCM.push({ key: k, loc });
    } else if (k.startsWith('HN_')) {
      partitionKeysByStore.HN.push({ key: k, loc });
    }
  }

  const masterSizeByUnit = new Map<string, number>();
  (state.unitInfo || []).forEach((ui: any) => {
    const uKey = String(ui?.unit || '').trim().toLowerCase();
    const sz = Number(String(ui?.size ?? '').replace(/,/g, ''));
    if (uKey && !isNaN(sz) && sz > 0) {
      masterSizeByUnit.set(uKey, sz);
    }
  });

  const projectLinkEntries: Array<{ unitLower: string; plCode: string }> = [];
  (state.projectLink || []).forEach((pl: any) => {
    const u = String(pl?.unit || '').trim().toLowerCase();
    const plCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && plCode) {
      projectLinkEntries.push({ unitLower: u, plCode });
    }
  });

  _resolverIndex = {
    storeLocationDataRef: state.storeLocationData,
    mapUnitsRef: state.mapUnits,
    mapVersionsRef: state.mapVersions,
    activeMapVersionIdRef: state.activeMapVersionId,
    unitInfoRef: state.unitInfo,
    projectLinkRef: state.projectLink,
    storeRef: state.store,
    locationRef: state.location,
    localBackupRef: _cachedLocalBackup,
    allPartitions,
    partitionKeysByStore,
    masterSizeByUnit,
    projectLinkEntries,
    combinedUnitsCache: new Map(),
    resultCache: new Map(),
  };

  return _resolverIndex;
}

const EMPTY_MATCH_RESULT: MatchedUnitSizeResult = { sizeM2: undefined, matchedUnitNames: [] };

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

  const pCodes = isProjectGroupedWithOthers(projectOrInput)
    ? extractPrimaryProjectCodes(projectOrInput)
    : extractAllProjectCodes(projectOrInput);
  if (pCodes.length === 0) {
    return EMPTY_MATCH_RESULT;
  }

  const state = useDataStore.getState();
  const idx = getOrBuildResolverIndex(state);

  const targetStore = (String(projectOrInput.store || state.store || 'HCM').toUpperCase().trim() === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
  const targetLoc = normalizeFloorCode(projectOrInput.location);
  const targetYear = String(projectOrInput.year || '').trim();

  const cacheKey = `${targetStore}|${targetLoc}|${targetYear}|${pCodes.join(',')}`;
  const cachedResult = idx.resultCache.get(cacheKey);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const linkedUnitNames = new Set<string>();
  if (idx.projectLinkEntries.length > 0) {
    for (let i = 0; i < idx.projectLinkEntries.length; i++) {
      const { unitLower, plCode } = idx.projectLinkEntries[i];
      if (pCodes.some(pc => pc === plCode || projectMatchesUnitCode([pc], plCode))) {
        linkedUnitNames.add(unitLower);
      }
    }
  }

  const isStorewideLoc =
    !targetLoc ||
    targetLoc === 'ALL' ||
    targetLoc === 'STORE' ||
    targetLoc === 'STOREWIDE' ||
    targetLoc === 'WHOLE STORE' ||
    targetLoc === 'ALL FLOORS';

  const storePartitions = idx.partitionKeysByStore[targetStore];
  const candidatePartitionKeys: string[] = [];
  for (let i = 0; i < storePartitions.length; i++) {
    const entry = storePartitions[i];
    if (isStorewideLoc || entry.loc === targetLoc) {
      candidatePartitionKeys.push(entry.key);
    }
  }

  const { allPartitions, masterSizeByUnit, combinedUnitsCache } = idx;
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

    const combinedCacheKey = `${pKey}__${matchedVersion?.id || 'base'}`;
    let combinedUnitsMap = combinedUnitsCache.get(combinedCacheKey);
    if (!combinedUnitsMap) {
      combinedUnitsMap = new Map<string, UnitShape>();
      const partitionUnits = Array.isArray(part.mapUnits) ? part.mapUnits : [];
      const versionUnits = Array.isArray(matchedVersion?.mapUnits) ? matchedVersion!.mapUnits! : [];

      for (let i = 0; i < partitionUnits.length; i++) {
        const u = partitionUnits[i];
        if (u && (u.name || u.id)) {
          combinedUnitsMap.set(String(u.name || u.id).trim().toLowerCase(), u);
        }
      }
      for (let i = 0; i < versionUnits.length; i++) {
        const u = versionUnits[i];
        if (u && (u.name || u.id)) {
          const key = String(u.name || u.id).trim().toLowerCase();
          const prev = combinedUnitsMap.get(key);
          combinedUnitsMap.set(
            key,
            prev
              ? {
                  ...prev,
                  ...u,
                  sizeM2: u.sizeM2 ?? prev.sizeM2,
                  size: u.size ?? prev.size,
                }
              : u
          );
        }
      }
      combinedUnitsCache.set(combinedCacheKey, combinedUnitsMap);
    }

    combinedUnitsMap.forEach((u) => {
      const uName = String(u.name || '').trim();
      const uId = String(u.id || '').trim();
      const uNameLower = uName.toLowerCase();
      const uIdLower = uId.toLowerCase();
      if (!uNameLower && !uIdLower) return;

      const isExact = pCodes.some((c) => c === uNameLower || (uIdLower && c === uIdLower));
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
    for (let i = 0; i < pCodes.length; i++) {
      const cl = pCodes[i].toLowerCase().trim();
      const sz = masterSizeByUnit.get(cl);
      if (sz && sz > 0) {
        matchedSizeByUnitKey.set(cl, { name: pCodes[i], sizeM2: sz });
      }
    }
  }

  if (matchedSizeByUnitKey.size === 0) {
    if (idx.resultCache.size < 4000) {
      idx.resultCache.set(cacheKey, EMPTY_MATCH_RESULT);
    }
    return EMPTY_MATCH_RESULT;
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
  const finalResult: MatchedUnitSizeResult = {
    sizeM2: roundedTotal > 0 ? roundedTotal : undefined,
    matchedUnitNames,
    versionName: firstVerName,
    versionYear: firstVerYear,
  };

  if (idx.resultCache.size >= 4000) {
    idx.resultCache.clear();
  }
  idx.resultCache.set(cacheKey, finalResult);
  return finalResult;
}

export { syncProjectSizeToUnits, syncUnitSizeToMatchedProjects } from './unitProjectSizeSyncService';
export type { ProjectSizeSyncInput, UnitSizeSyncInput } from './unitProjectSizeSyncService';
