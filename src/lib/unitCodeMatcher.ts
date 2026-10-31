import { useDataStore } from '../components/PictureMapping/DataContext';
import { MapVersion, UnitShape } from '../components/PictureMapping/components/DataMapping/types';
import { extractAllProjectCodes, projectMatchesUnitCode } from './utilsParts/projectCodeAndScopeUtils';
import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';

let _hasAttemptedLocalRestore = false;
let _hasAttemptedFirestoreRestore = false;
export let _cachedLocalBackup: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null }> | null = null;

export function getCachedLocalBackup() {
  return _cachedLocalBackup;
}

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
