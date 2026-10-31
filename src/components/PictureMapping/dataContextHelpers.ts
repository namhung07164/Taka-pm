import { UnitShape, MapVersion } from './components/DataMapping/types';
import { useAppStore } from '../../store/useAppStore';
import { saveLayoutConfigToDisk } from '../../lib/layoutConfigCache';

export interface StoreLocationRecord {
  mapUnits: UnitShape[];
  mapVersions: MapVersion[];
  activeMapVersionId: string | null;
}

export interface LoadedCloudDataPayload {
  storeLocationData: Record<string, StoreLocationRecord>;
  store?: 'HCM' | 'HN';
  location?: string;
  mapUnits?: UnitShape[];
  mapVersions?: MapVersion[];
  activeMapVersionId?: string | null;
  reviewSelectedLabels?: string[];
  reviewLabelColors?: Record<string, string>;
  unitInfo?: any[];
  classInfo?: any[];
  actualClassInfo?: any[];
  sales?: any[];
  profits?: any[];
  subFees?: any[];
  mdStatus?: any[];
  projectStatus?: any[];
  projectLink?: any[];
  basePlan?: any[];
  units?: any[];
}

export const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

export function buildFullCloudDataStateUpdate(
  state: { store: 'HCM' | 'HN'; location: string },
  payload: LoadedCloudDataPayload
): Record<string, any> {
  const storeLocationData = payload.storeLocationData || {};
  let activeStore = (payload.store || state.store) as 'HCM' | 'HN';
  let activeLoc = payload.location || state.location;
  let activeKey = getPartitionKey(activeStore, activeLoc);

  if (!storeLocationData[activeKey]) {
    const keys = Object.keys(storeLocationData);
    if (keys.length > 0) {
      const firstKey = keys[0];
      const parts = firstKey.split('_');
      activeStore = (parts[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      activeLoc = parts[1] || 'L1';
      activeKey = firstKey;
    }
  }

  const targetPartition = storeLocationData[activeKey] || {
    mapUnits: [],
    mapVersions: [],
    activeMapVersionId: null,
  };

  const targetUnits = targetPartition.mapUnits || [];
  const targetVersions = targetPartition.mapVersions || [];
  const targetActiveVerId =
    payload.activeMapVersionId || targetPartition.activeMapVersionId || (targetVersions[0]?.id ?? null);

  saveLayoutConfigToDisk({
    ...payload,
    storeLocationData,
    store: activeStore,
    location: activeLoc,
    activeMapVersionId: targetActiveVerId,
  }).catch(() => {});

  return {
    isCloudLoaded: true,
    store: activeStore,
    location: activeLoc,
    storeLocationData,
    mapUnits: targetUnits,
    mapVersions: targetVersions,
    activeMapVersionId: targetActiveVerId,
    ...(payload.reviewSelectedLabels ? { reviewSelectedLabels: payload.reviewSelectedLabels } : {}),
    ...(payload.reviewLabelColors ? { reviewLabelColors: payload.reviewLabelColors } : {}),
    ...(payload.unitInfo ? { unitInfo: payload.unitInfo } : {}),
    ...(payload.classInfo ? { classInfo: payload.classInfo } : {}),
    ...(payload.actualClassInfo ? { actualClassInfo: payload.actualClassInfo } : {}),
    ...(payload.sales ? { sales: payload.sales } : {}),
    ...(payload.profits ? { profits: payload.profits } : {}),
    ...(payload.subFees ? { subFees: payload.subFees } : {}),
    ...(payload.mdStatus ? { mdStatus: payload.mdStatus } : {}),
    ...(payload.projectStatus ? { projectStatus: payload.projectStatus } : {}),
    ...(payload.projectLink ? { projectLink: payload.projectLink } : {}),
    ...(payload.basePlan ? { basePlan: payload.basePlan } : {}),
    ...(payload.units ? { units: payload.units } : {}),
  };
}

export function computeAllStoreUnits(
  state: {
    store: 'HCM' | 'HN';
    location: string;
    storeLocationData: Record<string, StoreLocationRecord>;
    mapUnits: UnitShape[];
    mapVersions: MapVersion[];
    activeMapVersionId: string | null;
  },
  targetStore?: 'HCM' | 'HN'
): UnitShape[] {
  const currentStore = targetStore || state.store;
  const currentKey = getPartitionKey(state.store, state.location);

  const mergedData = {
    ...state.storeLocationData,
    [currentKey]: {
      ...(state.storeLocationData[currentKey] || {}),
      mapUnits: state.mapUnits,
      mapVersions: state.mapVersions,
      activeMapVersionId: state.activeMapVersionId,
    },
  };

  const allUnits: UnitShape[] = [];
  const seenIds = new Set<string>();

  for (const key in mergedData) {
    if (key.startsWith(`${currentStore}_`)) {
      const partition = mergedData[key];
      const loc = (key.split('_')[1] || state.location).toUpperCase().trim();
      if (partition?.mapUnits) {
        for (const u of partition.mapUnits) {
          const compositeKey = `${key}_${u.id || u.name}`;
          if (!seenIds.has(compositeKey)) {
            seenIds.add(compositeKey);
            allUnits.push({
              ...u,
              store: u.store || currentStore,
              location: (u.location || loc).toUpperCase().trim(),
            });
          }
        }
      }
    }
  }
  return allUnits;
}

export function computeAllStoreVersions(
  state: {
    store: 'HCM' | 'HN';
    location: string;
    storeLocationData: Record<string, StoreLocationRecord>;
    mapUnits: UnitShape[];
    mapVersions: MapVersion[];
    activeMapVersionId: string | null;
  },
  targetStore?: 'HCM' | 'HN'
): MapVersion[] {
  const currentStore = targetStore || state.store;
  const currentKey = getPartitionKey(state.store, state.location);

  const mergedData = { ...state.storeLocationData };
  if (!mergedData[currentKey] && state.mapVersions && state.mapVersions.length > 0) {
    mergedData[currentKey] = {
      mapUnits: state.mapUnits || [],
      mapVersions: state.mapVersions || [],
      activeMapVersionId: state.activeMapVersionId,
    };
  }

  const allVersions: MapVersion[] = [];
  const seenIds = new Set<string>();

  for (const key in mergedData) {
    if (key.startsWith(`${currentStore}_`)) {
      const partition = mergedData[key];
      const loc = key.split('_')[1] || state.location || 'L1';
      const appYear = String(
        useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all'
          ? useAppStore.getState().globalYearFilter
          : '2026'
      );
      if (partition?.mapVersions) {
        for (const v of partition.mapVersions) {
          if (!seenIds.has(v.id)) {
            seenIds.add(v.id);
            const resolvedLoc =
              v.location && String(v.location).trim()
                ? String(v.location).trim().toUpperCase()
                : v.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || loc;
            const resolvedYear =
              v.year && String(v.year).trim()
                ? String(v.year).trim()
                : v.name?.match(/(202\d|203\d)/i)?.[1] || appYear;

            allVersions.push({
              ...v,
              store: v.store || currentStore,
              location: resolvedLoc,
              year: resolvedYear,
            });
          }
        }
      }
    }
  }
  return allVersions;
}

export function computeUpdatedUnitsAcrossLocations(
  state: {
    store: 'HCM' | 'HN';
    location: string;
    storeLocationData: Record<string, StoreLocationRecord>;
    activeMapVersionId: string | null;
  },
  updatedUnits: UnitShape[],
  targetStore?: 'HCM' | 'HN'
): {
  storeLocationData: Record<string, StoreLocationRecord>;
  mapUnits: UnitShape[];
} {
  const currentStore = targetStore || state.store;
  const currentKey = getPartitionKey(state.store, state.location);

  const unitsByPartition: Record<string, UnitShape[]> = {};
  for (const u of updatedUnits) {
    const uStore = u.store || currentStore;
    const uLoc =
      u.location && String(u.location).trim()
        ? String(u.location).trim().toUpperCase()
        : u.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || state.location || 'L1';
    const pKey = getPartitionKey(uStore, uLoc);
    if (!unitsByPartition[pKey]) unitsByPartition[pKey] = [];
    unitsByPartition[pKey].push({ ...u, store: uStore, location: uLoc });
  }

  const updatedStoreLocationData = { ...state.storeLocationData };
  for (const pKey in updatedStoreLocationData) {
    if (pKey.startsWith(`${currentStore}_`)) {
      updatedStoreLocationData[pKey] = {
        ...(updatedStoreLocationData[pKey] || { mapVersions: [], activeMapVersionId: null }),
        mapUnits: unitsByPartition[pKey] || [],
      };
    }
  }
  for (const pKey in unitsByPartition) {
    if (!updatedStoreLocationData[pKey]) {
      updatedStoreLocationData[pKey] = {
        mapVersions: [],
        activeMapVersionId: null,
        mapUnits: unitsByPartition[pKey],
      };
    }
  }

  const activeUnits = updatedStoreLocationData[currentKey]?.mapUnits || [];
  return {
    storeLocationData: updatedStoreLocationData,
    mapUnits: activeUnits,
  };
}

export function computeUpdatedVersionsAcrossLocations(
  state: {
    store: 'HCM' | 'HN';
    location: string;
    storeLocationData: Record<string, StoreLocationRecord>;
    activeMapVersionId: string | null;
  },
  updatedVersions: MapVersion[],
  targetStore?: 'HCM' | 'HN'
): {
  storeLocationData: Record<string, StoreLocationRecord>;
  mapVersions: MapVersion[];
  activeMapVersionId: string | null;
} {
  const currentStore = targetStore || state.store;
  const currentKey = getPartitionKey(state.store, state.location);
  const appYear = String(
    useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all'
      ? useAppStore.getState().globalYearFilter
      : '2026'
  );

  const versionsByPartition: Record<string, MapVersion[]> = {};
  for (const v of updatedVersions) {
    const vStore = v.store || currentStore;
    const vLoc =
      v.location && String(v.location).trim()
        ? String(v.location).trim().toUpperCase()
        : v.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || state.location || 'L1';
    const vYr =
      v.year && String(v.year).trim()
        ? String(v.year).trim()
        : v.name?.match(/(202\d|203\d)/i)?.[1] || appYear;

    const pKey = getPartitionKey(vStore, vLoc);
    if (!versionsByPartition[pKey]) versionsByPartition[pKey] = [];
    versionsByPartition[pKey].push({
      ...v,
      store: vStore,
      location: vLoc,
      year: vYr,
    });
  }

  const updatedStoreLocationData = { ...state.storeLocationData };
  for (const pKey in updatedStoreLocationData) {
    if (pKey.startsWith(`${currentStore}_`)) {
      const existing = updatedStoreLocationData[pKey];
      const newVers = versionsByPartition[pKey] || [];
      updatedStoreLocationData[pKey] = {
        ...(existing || { mapUnits: [] }),
        mapVersions: newVers,
        activeMapVersionId:
          existing?.activeMapVersionId && newVers.some((v) => v.id === existing.activeMapVersionId)
            ? existing.activeMapVersionId
            : newVers[0]?.id || null,
      };
    }
  }
  for (const pKey in versionsByPartition) {
    if (!updatedStoreLocationData[pKey]) {
      const newVers = versionsByPartition[pKey];
      updatedStoreLocationData[pKey] = {
        mapUnits: [],
        activeMapVersionId: newVers[0]?.id || null,
        mapVersions: newVers,
      };
    }
  }

  const activePartition = updatedStoreLocationData[currentKey];
  const activeVersions = activePartition?.mapVersions || [];

  const isCurrentActiveValid =
    state.activeMapVersionId && updatedVersions.some((v) => v.id === state.activeMapVersionId);
  const activeVersionId = isCurrentActiveValid
    ? state.activeMapVersionId
    : activePartition?.activeMapVersionId || (activeVersions[0]?.id ?? null);

  return {
    storeLocationData: updatedStoreLocationData,
    mapVersions: activeVersions,
    activeMapVersionId: activeVersionId,
  };
}
