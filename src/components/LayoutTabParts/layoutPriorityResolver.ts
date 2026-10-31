import { Project, Task, AppUser, AppRole } from '../../types';
import {
  getStatus,
  matchProjectStatusFilter,
  parseDateTime,
  getEffectiveStoreFilter,
} from '../../lib/utils';
import { safeGetItemSession } from '../../lib/storage';
import { getMemoryCachedLayoutConfig } from '../../lib/layoutConfigCache';
import {
  computeAvailableLayoutLocations,
  computeAvailableLayoutYears,
  extractFloorFromCodeOrName,
  isValidUrl,
  resolveInitialTargetLocation,
} from './layoutTabSearchUtils';

const LAYOUT_SETTINGS_CACHE_KEY = 'taka_cache_layout_settings_v1';

const NON_SPECIFIC_LOCATIONS = new Set([
  'ALL',
  'STORE',
  'STOREWIDE',
  'WHOLE STORE',
  'ALL FLOORS',
  'BUDGET',
  'COST',
  'SUMMARY',
  'GENERAL',
  'SETTING',
]);

const STATUS_WEIGHT: Record<string, number> = {
  'On process': 1,
  'Upcoming': 2,
  'Completed': 3,
  'Handover': 4,
  'Canceled': 5,
};

export interface PriorityProjectLayoutResult {
  store: string;
  location: string;
  year: string;
  projectCode: string;
  hasConfiguredData: boolean;
}

export interface ResolvePriorityProjectLayoutParams {
  projects: Project[];
  tasks: Task[];
  currentUser: AppUser;
  allowedStores: string[];
  pinnedProjects: string[];
  initialStoreFilter: string;
  initialYearFilter: string;
  locationVisibility: Record<string, boolean>;
  locations: string[];
  storeLocationData: Record<string, any> | undefined;
  getAllStoreVersions: (store?: 'HCM' | 'HN') => any[];
  unitInfo: any[];
  isAdmin: boolean;
  isPartyRestricted: boolean;
  role: AppRole;
}

function getProjectPriorityMeta(p: Project) {
  const computedTakStart = p.computedTakStart || p.start || '';
  const computedTakCompl = p.computedTakCompl || p.handover || (p as any).takCompl || '';
  const computedOpening = p.computedOpening || (p.openingMode === 'manual' ? p.opening : '') || '';
  const status = p.computedStatus || getStatus(computedTakStart, computedTakCompl, computedOpening || p.opening, p.code);
  return {
    computedTakStart,
    computedTakCompl,
    computedOpening,
    status,
  };
}

/**
 * Sorts projects using the exact priority rules from GeneralTab (`useGeneralData.ts`):
 * 1. Pinned projects (in pinned order)
 * 2. Status weight ('On process' -> 'Upcoming' -> 'Completed' -> 'Handover' -> 'Canceled')
 * 3. For 'On process', finish date proximity to today
 * 4. Start date -> Finish date -> Opening date -> Project code -> Year
 */
export function sortProjectsByGeneralTabPriority(
  projects: Project[],
  pinnedProjects: string[]
): Project[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  return [...projects].sort((a, b) => {
    const isPinnedA = Boolean(a.id && pinnedProjects.includes(a.id));
    const isPinnedB = Boolean(b.id && pinnedProjects.includes(b.id));

    if (isPinnedA !== isPinnedB) {
      return isPinnedA ? -1 : 1;
    }
    if (isPinnedA && isPinnedB) {
      const orderA = pinnedProjects.indexOf(a.id as string);
      const orderB = pinnedProjects.indexOf(b.id as string);
      if (orderA !== orderB) return orderA - orderB;
    }

    const infoA = getProjectPriorityMeta(a);
    const infoB = getProjectPriorityMeta(b);

    const weightA = STATUS_WEIGHT[infoA.status] || 99;
    const weightB = STATUS_WEIGHT[infoB.status] || 99;
    if (weightA !== weightB) {
      return weightA - weightB;
    }

    if (infoA.status === 'On process') {
      const finishA = parseDateTime(a.computedTakCompl || a.handover || a.computedOpening || a.opening);
      const finishB = parseDateTime(b.computedTakCompl || b.handover || b.computedOpening || b.opening);

      if (finishA && finishB) {
        const diffA = Math.abs(finishA.getTime() - todayMs);
        const diffB = Math.abs(finishB.getTime() - todayMs);
        if (diffA !== diffB) {
          return diffA - diffB;
        }
      } else if (finishA) {
        return -1;
      } else if (finishB) {
        return 1;
      }
    }

    const startA = a.computedTakStart || '9999-12-31';
    const startB = b.computedTakStart || '9999-12-31';
    if (startA !== startB) {
      return startA.localeCompare(startB);
    }

    const complA = a.computedTakCompl || '9999-12-31';
    const complB = b.computedTakCompl || '9999-12-31';
    if (complA !== complB) {
      return complA.localeCompare(complB);
    }

    const openA = a.computedOpening || a.opening || '9999-12-31';
    const openB = b.computedOpening || b.opening || '9999-12-31';
    if (openA !== openB) {
      return openA.localeCompare(openB);
    }

    return (a.code || '').localeCompare(b.code || '') || String(a.year || '').localeCompare(String(b.year || ''));
  });
}

/**
 * Resolves the highest-priority project from the General tab that has an available layout,
 * returning its { store, location, year, projectCode } to initialize the Layout tab filters.
 */
export function resolvePriorityProjectLayout(
  params: ResolvePriorityProjectLayoutParams
): PriorityProjectLayoutResult | null {
  const {
    projects,
    tasks,
    currentUser,
    allowedStores,
    pinnedProjects,
    initialStoreFilter,
    initialYearFilter,
    locationVisibility,
    locations,
    storeLocationData,
    getAllStoreVersions,
    unitInfo,
    isAdmin,
    isPartyRestricted,
    role,
  } = params;

  if (!allowedStores.length || !projects.length) return null;

  const cachedConfig = getMemoryCachedLayoutConfig();
  const mergedStoreLocationData: Record<string, any> = {
    ...(cachedConfig?.storeLocationData || {}),
    ...(storeLocationData || {}),
  };

  let cachedLayoutUrls: Record<string, any> = {};
  try {
    const raw = localStorage.getItem(LAYOUT_SETTINGS_CACHE_KEY);
    if (raw) cachedLayoutUrls = JSON.parse(raw) || {};
  } catch {}

  const storeContextMap = new Map<
    string,
    {
      versions: any[];
      permittedLocations: string[];
      configuredFloors: Set<string>;
      availableYears: string[];
    }
  >();

  let anyStoreHasConfiguredData = false;

  for (const rawStore of allowedStores) {
    const storeKey = (rawStore.toUpperCase().trim() === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const versionsMap = new Map<string, any>();

    try {
      const vers = getAllStoreVersions(storeKey);
      if (Array.isArray(vers)) {
        vers.forEach(v => {
          if (v?.id) versionsMap.set(v.id, v);
        });
      }
    } catch {}

    Object.entries(mergedStoreLocationData).forEach(([key, part]: [string, any]) => {
      if (key.startsWith(`${storeKey}_`) && Array.isArray(part?.mapVersions)) {
        const partLoc = key.slice(storeKey.length + 1).toUpperCase().trim();
        part.mapVersions.forEach((v: any) => {
          if (v?.id && !versionsMap.has(v.id)) {
            versionsMap.set(v.id, { ...v, location: v.location || partLoc });
          }
        });
      }
    });

    if (storeKey === 'HCM' && Array.isArray(cachedConfig?.versions)) {
      cachedConfig.versions.forEach((v: any) => {
        if (v?.id && !versionsMap.has(v.id)) {
          versionsMap.set(v.id, v);
        }
      });
    }

    const versions = Array.from(versionsMap.values());
    const availableYears = computeAvailableLayoutYears({
      projects,
      tasks,
      allStoreVersions: versions,
      activeStore: storeKey,
      isAdmin,
      isPartyRestricted,
      role,
    });

    const permittedLocations = computeAvailableLayoutLocations({
      allStoreVersions: versions,
      storeLocationData: mergedStoreLocationData,
      activeStore: storeKey,
      currentUser,
      locationVisibility,
      locations,
      isPartyRestricted,
      role,
      projects,
      tasks,
      effectiveYear: initialYearFilter !== 'all' ? initialYearFilter : (availableYears[0] || ''),
    });

    const permittedUpperSet = new Set(permittedLocations.map(l => l.toUpperCase().trim()));
    const configuredFloors = new Set<string>();

    versions.forEach(v => {
      const hasContent = Boolean(
        v?.backgroundUrl ||
        v?.r2Key ||
        (Array.isArray(v?.mapUnits) && v.mapUnits.length > 0) ||
        (Array.isArray(v?.groups) && v.groups.length > 0)
      );
      if (!hasContent) return;
      const vLoc = String(v.location || extractFloorFromCodeOrName(v.name) || '')
        .toUpperCase()
        .trim()
        .replace(/^MD-/, '');
      if (vLoc && permittedUpperSet.has(vLoc)) {
        configuredFloors.add(vLoc);
      }
    });

    Object.entries(mergedStoreLocationData).forEach(([key, part]: [string, any]) => {
      if (key.startsWith(`${storeKey}_`)) {
        const loc = key
          .slice(storeKey.length + 1)
          .toUpperCase()
          .trim()
          .replace(/^MD-/, '');
        const hasPartData = Boolean(
          (Array.isArray(part?.mapVersions) && part.mapVersions.length > 0) ||
          (Array.isArray(part?.mapUnits) && part.mapUnits.length > 0) ||
          part?.activeMapVersionId
        );
        if (loc && hasPartData && permittedUpperSet.has(loc)) {
          configuredFloors.add(loc);
        }
      }
    });

    permittedLocations.forEach(loc => {
      const uKey = `url_${storeKey}_${loc.toUpperCase().trim()}`;
      if (isValidUrl(cachedLayoutUrls[uKey])) {
        configuredFloors.add(loc.toUpperCase().trim());
      }
    });

    if (configuredFloors.size > 0) {
      anyStoreHasConfiguredData = true;
    }

    storeContextMap.set(storeKey, {
      versions,
      permittedLocations,
      configuredFloors,
      availableYears,
    });
  }

  const activeProjects = projects.filter(p => {
    if (p.isDeleted) return false;
    const pStore = String(p.store || allowedStores[0] || 'HCM').toUpperCase().trim();
    return allowedStores.includes(pStore);
  });

  const sortedProjects = sortProjectsByGeneralTabPriority(activeProjects, pinnedProjects);

  const resolveLayoutForProject = (p: Project): PriorityProjectLayoutResult | null => {
    const pStore = String(p.store || allowedStores[0] || 'HCM').toUpperCase().trim();
    const ctx = storeContextMap.get(pStore);
    if (!ctx || ctx.permittedLocations.length === 0) return null;

    const rawLoc = String(p.location || (p as any).floor || '').toUpperCase().trim();
    const isSpecificLoc = Boolean(rawLoc && !NON_SPECIFIC_LOCATIONS.has(rawLoc));

    let candidateFloor = isSpecificLoc ? rawLoc.replace(/^MD-/, '') : '';
    if (!candidateFloor) {
      const resolved = resolveInitialTargetLocation(
        '',
        p.code || (p as any).unit || '',
        [p],
        tasks,
        ctx.versions,
        unitInfo,
        pStore
      );
      if (resolved && !NON_SPECIFIC_LOCATIONS.has(resolved.toUpperCase().trim())) {
        candidateFloor = resolved.toUpperCase().trim().replace(/^MD-/, '');
      }
    }

    if (!candidateFloor) return null;

    const matchedPermitted = ctx.permittedLocations.find(l => {
      const normL = l.toUpperCase().trim().replace(/^MD-/, '');
      return normL === candidateFloor;
    });
    if (!matchedPermitted) return null;

    if (anyStoreHasConfiguredData && !ctx.configuredFloors.has(matchedPermitted.toUpperCase().trim().replace(/^MD-/, ''))) {
      return null;
    }

    const pYear = String(p.year || '').trim();
    const resolvedYear =
      pYear && ctx.availableYears.includes(pYear)
        ? pYear
        : initialYearFilter !== 'all' && ctx.availableYears.includes(initialYearFilter)
        ? initialYearFilter
        : ctx.availableYears[0] || String(new Date().getFullYear());

    return {
      store: pStore,
      location: matchedPermitted,
      year: resolvedYear,
      projectCode: p.code || '',
      hasConfiguredData: anyStoreHasConfiguredData,
    };
  };

  const generalStatusFilter =
    safeGetItemSession('taka_general_status_filter') || 'On process + Upcoming 3 days';
  const effectiveStore = getEffectiveStoreFilter(initialStoreFilter, currentUser);
  const normStoreFilter =
    effectiveStore && effectiveStore !== 'all' ? effectiveStore.toUpperCase().trim() : '';
  const normYearFilter =
    initialYearFilter && initialYearFilter !== 'all' ? String(initialYearFilter).trim() : '';

  // Pass 1: Exact match with General tab's active filters (Store + Year + Status Filter)
  for (const p of sortedProjects) {
    const pStore = String(p.store || '').toUpperCase().trim();
    const pYear = p.year ? String(p.year).trim() : '';
    if (normStoreFilter && pStore !== normStoreFilter) continue;
    if (normYearFilter && pYear !== normYearFilter) continue;
    const meta = getProjectPriorityMeta(p);
    if (!matchProjectStatusFilter(meta.status, generalStatusFilter, meta.computedTakStart)) continue;

    const hit = resolveLayoutForProject(p);
    if (hit) return hit;
  }

  // Pass 2: Match current Store + Year across all statuses in General tab priority order
  for (const p of sortedProjects) {
    const pStore = String(p.store || '').toUpperCase().trim();
    const pYear = p.year ? String(p.year).trim() : '';
    if (normStoreFilter && pStore !== normStoreFilter) continue;
    if (normYearFilter && pYear !== normYearFilter) continue;

    const hit = resolveLayoutForProject(p);
    if (hit) return hit;
  }

  // Pass 3: Match General tab status filter across all allowed stores & years
  for (const p of sortedProjects) {
    const meta = getProjectPriorityMeta(p);
    if (!matchProjectStatusFilter(meta.status, generalStatusFilter, meta.computedTakStart)) continue;

    const hit = resolveLayoutForProject(p);
    if (hit) return hit;
  }

  // Pass 4: Fallback to any project in General tab priority order that has a layout
  for (const p of sortedProjects) {
    const hit = resolveLayoutForProject(p);
    if (hit) return hit;
  }

  return null;
}
