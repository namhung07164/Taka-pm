import { create } from 'zustand';
import { UnitShape, MapVersion } from './components/DataMapping/types';
import { useAppStore } from '../../store/useAppStore';
import {
  saveLayoutConfigToDisk,
  getCachedLayoutConfigFromDisk,
  isValidLayoutConfig,
} from '../../lib/layoutConfigCache';
import {
  StoreLocationRecord,
  LoadedCloudDataPayload,
  getPartitionKey,
  computeAllStoreUnits,
  computeAllStoreVersions,
  computeUpdatedUnitsAcrossLocations,
  computeUpdatedVersionsAcrossLocations,
  buildFullCloudDataStateUpdate,
} from './dataContextHelpers';

export type { StoreLocationRecord, LoadedCloudDataPayload };

let backupTimeout: any = null;
export function autoBackupStoreLocationData(
  data: Record<string, StoreLocationRecord>,
  store: string,
  location: string,
  activeMapVersionId?: string | null
) {
  if (typeof window === 'undefined') return;
  if (!isValidLayoutConfig({ storeLocationData: data })) return;
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    const state = useDataStore.getState();
    const consolidated = state.getConsolidatedSaveData();
    const backupObj = {
      ...consolidated,
      storeLocationData: data,
      store,
      location,
      activeMapVersionId,
    };
    if (!isValidLayoutConfig(backupObj)) return;
    saveLayoutConfigToDisk(backupObj).catch(() => {});
  }, 1200);
}

interface DataStoreState {
  store: 'HCM' | 'HN';
  setStore: (store: 'HCM' | 'HN') => void;
  location: string;
  setLocation: (location: string) => void;
  setStoreAndLocation: (store: 'HCM' | 'HN', location: string) => void;
  storeLocationData: Record<string, StoreLocationRecord>;
  setStoreLocationData: (data: Record<string, StoreLocationRecord>) => void;
  setLoadedCloudData: (payload: LoadedCloudDataPayload) => void;
  getConsolidatedSaveData: () => {
    storeLocationData: Record<string, StoreLocationRecord>;
    store: 'HCM' | 'HN';
    location: string;
    mapUnits: UnitShape[];
    mapVersions: MapVersion[];
    activeMapVersionId: string | null;
    reviewSelectedLabels: string[];
    reviewLabelColors: Record<string, string>;
    unitInfo: any[];
    classInfo: any[];
    actualClassInfo: any[];
    sales: any[];
    profits: any[];
    subFees: any[];
    mdStatus: any[];
    projectStatus: any[];
    projectLink: any[];
    basePlan: any[];
    units: any[];
  };
  mapUnits: UnitShape[];
  setMapUnits: (units: UnitShape[]) => void;
  mapVersions: MapVersion[];
  setMapVersions: (versions: MapVersion[]) => void;
  activeMapVersionId: string | null;
  setActiveMapVersionId: (id: string | null) => void;
  reviewSelectedLabels: string[];
  setReviewSelectedLabels: (labels: string[]) => void;
  reviewLabelColors: Record<string, string>;
  setReviewLabelColors: (colors: Record<string, string>) => void;
  getAllStoreUnits: (store?: 'HCM' | 'HN') => UnitShape[];
  getAllStoreVersions: (store?: 'HCM' | 'HN') => MapVersion[];
  updateStoreUnitsAcrossLocations: (units: UnitShape[], store?: 'HCM' | 'HN') => void;
  updateStoreVersionsAcrossLocations: (versions: MapVersion[], store?: 'HCM' | 'HN') => void;
  syncGroupsToAllStoreLocations: (groups: MapVersion['groups'], store?: 'HCM' | 'HN') => void;
  isCloudLoaded: boolean;
  setIsCloudLoaded: (isCloudLoaded: boolean) => void;
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  unitInfo: any[];
  setUnitInfo: (info: any[]) => void;
  projectStatus: any[];
  setProjectStatus: (status: any[]) => void;
  classInfo: any[];
  setClassInfo: (info: any[]) => void;
  actualClassInfo: any[];
  setActualClassInfo: (info: any[]) => void;
  sales: any[];
  setSales: (sales: any[]) => void;
  profits: any[];
  setProfits: (profits: any[]) => void;
  subFees: any[];
  setSubFees: (fees: any[]) => void;
  mdStatus: any[];
  setMdStatus: (status: any[]) => void;
  projectLink: any[];
  setProjectLink: (link: any[]) => void;
  basePlan: any[];
  setBasePlan: (plan: any[]) => void;
  units: any[];
  setUnits: (units: any[]) => void;
  loadFullCloudData: (payload: LoadedCloudDataPayload) => void;
}

export const useDataStore = create<DataStoreState>((set, get) => ({
  store: 'HCM',
  location: 'L1',
  storeLocationData: {},

  setStore: (newStore) => {
    const current = get();
    if (current.store === newStore) return;
    current.setStoreAndLocation(newStore, current.location);
  },

  setLocation: (newLocation) => {
    const current = get();
    if (current.location === newLocation) return;
    current.setStoreAndLocation(current.store, newLocation);
  },

  setStoreAndLocation: (newStore, newLocation) => {
    if (!newLocation || newLocation.trim() === '' || newLocation.toUpperCase() === 'ALL') {
      return;
    }
    const state = get();
    if (state.store === newStore && state.location === newLocation) {
      return;
    }
    const oldKey = getPartitionKey(state.store, state.location);
    const newKey = getPartitionKey(newStore, newLocation);

    const hasCurrentData =
      state.mapUnits.length > 0 ||
      state.mapVersions.length > 0 ||
      Boolean(state.storeLocationData[oldKey]);

    const updatedStoreLocationData = hasCurrentData
      ? {
          ...state.storeLocationData,
          [oldKey]: {
            mapUnits: state.mapUnits,
            mapVersions: state.mapVersions,
            activeMapVersionId: state.activeMapVersionId,
          },
        }
      : state.storeLocationData;

    const target = updatedStoreLocationData[newKey];
    const newUnits = target?.mapUnits ?? [];
    const newVersions = target?.mapVersions ?? [];
    const newActiveVersionId =
      target?.activeMapVersionId ?? (newVersions.length > 0 ? newVersions[0].id : null);

    set({
      store: newStore,
      location: newLocation,
      storeLocationData: updatedStoreLocationData,
      mapUnits: newUnits,
      mapVersions: newVersions,
      activeMapVersionId: newActiveVersionId,
    });
  },

  setStoreLocationData: (data) => {
    const state = get();
    const currentKey = getPartitionKey(state.store, state.location);
    const target = data[currentKey];
    set({
      storeLocationData: data,
      ...(target
        ? {
            mapUnits: target.mapUnits || [],
            mapVersions: target.mapVersions || [],
            activeMapVersionId: target.activeMapVersionId || (target.mapVersions?.[0]?.id ?? null),
          }
        : {}),
    });
    autoBackupStoreLocationData(data, state.store, state.location, state.activeMapVersionId);
  },

  setLoadedCloudData: (payload: LoadedCloudDataPayload) => {
    const state = get();
    const targetStore = payload.store || state.store;
    const targetLocation = (payload.location || state.location).toUpperCase().trim();
    const pKey = getPartitionKey(targetStore, targetLocation);

    const storeLocationData = payload.storeLocationData || state.storeLocationData;
    const target = storeLocationData[pKey];

    const mapUnits =
      target?.mapUnits && Array.isArray(target.mapUnits) && target.mapUnits.length > 0
        ? target.mapUnits
        : payload.mapUnits || [];
    const mapVersions =
      target?.mapVersions && Array.isArray(target.mapVersions) && target.mapVersions.length > 0
        ? target.mapVersions
        : payload.mapVersions || [];
    const activeMapVersionId =
      target?.activeMapVersionId || payload.activeMapVersionId || (mapVersions[0]?.id ?? null);

    set({
      store: targetStore,
      location: targetLocation,
      storeLocationData,
      mapUnits,
      mapVersions,
      activeMapVersionId,
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
    });
  },

  getConsolidatedSaveData: () => {
    const state = get();
    const currentKey = getPartitionKey(state.store, state.location);
    const updatedStoreLocationData = {
      ...state.storeLocationData,
      [currentKey]: {
        mapUnits: state.mapUnits,
        mapVersions: state.mapVersions,
        activeMapVersionId: state.activeMapVersionId,
      },
    };
    return {
      storeLocationData: updatedStoreLocationData,
      store: state.store,
      location: state.location,
      mapUnits: state.mapUnits,
      mapVersions: state.mapVersions,
      activeMapVersionId: state.activeMapVersionId,
      reviewSelectedLabels: state.reviewSelectedLabels,
      reviewLabelColors: state.reviewLabelColors,
      unitInfo: state.unitInfo,
      classInfo: state.classInfo,
      actualClassInfo: state.actualClassInfo,
      sales: state.sales,
      profits: state.profits,
      subFees: state.subFees,
      mdStatus: state.mdStatus,
      projectStatus: state.projectStatus,
      projectLink: state.projectLink,
      basePlan: state.basePlan,
      units: state.units,
    };
  },

  mapUnits: [],
  setMapUnits: (mapUnits) => {
    const state = get();
    const taggedUnits = mapUnits.map((u) => ({
      ...u,
      store: u.store || state.store,
      location: u.location || state.location,
    }));
    const key = getPartitionKey(state.store, state.location);
    const newStoreLocationData = {
      ...state.storeLocationData,
      [key]: {
        ...(state.storeLocationData[key] || {
          mapVersions: state.mapVersions,
          activeMapVersionId: state.activeMapVersionId,
        }),
        mapUnits: taggedUnits,
      },
    };
    set({ mapUnits: taggedUnits, storeLocationData: newStoreLocationData });
    autoBackupStoreLocationData(newStoreLocationData, state.store, state.location, state.activeMapVersionId);
  },

  mapVersions: [],
  setMapVersions: (mapVersions) => {
    const state = get();
    const appYear = String(
      useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all'
        ? useAppStore.getState().globalYearFilter
        : '2026'
    );
    const taggedVersions = mapVersions.map((v) => ({
      ...v,
      store: v.store || state.store,
      location: v.location || state.location,
      year: v.year ? String(v.year).trim() : appYear,
    }));
    const key = getPartitionKey(state.store, state.location);
    const newStoreLocationData = {
      ...state.storeLocationData,
      [key]: {
        ...(state.storeLocationData[key] || {
          mapUnits: state.mapUnits,
          activeMapVersionId: state.activeMapVersionId,
        }),
        mapVersions: taggedVersions,
      },
    };
    set({ mapVersions: taggedVersions, storeLocationData: newStoreLocationData });
    autoBackupStoreLocationData(newStoreLocationData, state.store, state.location, state.activeMapVersionId);
  },

  activeMapVersionId: null,
  setActiveMapVersionId: (activeMapVersionId) => {
    const state = get();
    let targetKey = getPartitionKey(state.store, state.location);
    if (activeMapVersionId) {
      for (const pKey in state.storeLocationData) {
        if (state.storeLocationData[pKey]?.mapVersions?.some((v) => v.id === activeMapVersionId)) {
          targetKey = pKey;
          break;
        }
      }
    }
    set({
      activeMapVersionId,
      storeLocationData: {
        ...state.storeLocationData,
        [targetKey]: {
          ...(state.storeLocationData[targetKey] || { mapUnits: [], mapVersions: [] }),
          activeMapVersionId,
        },
      },
    });
  },

  reviewSelectedLabels: [],
  setReviewSelectedLabels: (reviewSelectedLabels) => set({ reviewSelectedLabels }),
  reviewLabelColors: {},
  setReviewLabelColors: (reviewLabelColors) => set({ reviewLabelColors }),

  getAllStoreUnits: (targetStore) => computeAllStoreUnits(get(), targetStore),
  getAllStoreVersions: (targetStore) => computeAllStoreVersions(get(), targetStore),

  updateStoreUnitsAcrossLocations: (updatedUnits, targetStore) => {
    const state = get();
    const res = computeUpdatedUnitsAcrossLocations(state, updatedUnits, targetStore);
    set(res);
    autoBackupStoreLocationData(res.storeLocationData, state.store, state.location, state.activeMapVersionId);
  },

  updateStoreVersionsAcrossLocations: (updatedVersions, targetStore) => {
    const state = get();
    const res = computeUpdatedVersionsAcrossLocations(state, updatedVersions, targetStore);
    set(res);
    autoBackupStoreLocationData(res.storeLocationData, state.store, state.location, res.activeMapVersionId);
  },

  syncGroupsToAllStoreLocations: (groups, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const updatedStoreLocationData = { ...state.storeLocationData };

    for (const pKey in updatedStoreLocationData) {
      if (pKey.startsWith(`${currentStore}_`)) {
        const partition = updatedStoreLocationData[pKey];
        if (partition?.mapVersions) {
          updatedStoreLocationData[pKey] = {
            ...partition,
            mapVersions: partition.mapVersions.map((v) => ({ ...v, groups })),
          };
        }
      }
    }

    const currentKey = getPartitionKey(state.store, state.location);
    set({
      storeLocationData: updatedStoreLocationData,
      mapVersions: updatedStoreLocationData[currentKey]?.mapVersions || state.mapVersions,
    });
  },

  isCloudLoaded: false,
  setIsCloudLoaded: (isCloudLoaded) => set({ isCloudLoaded }),
  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),
  unitInfo: [],
  setUnitInfo: (unitInfo) => set({ unitInfo }),
  projectStatus: [],
  setProjectStatus: (projectStatus) => set({ projectStatus }),
  classInfo: [],
  setClassInfo: (classInfo) => set({ classInfo }),
  actualClassInfo: [],
  setActualClassInfo: (actualClassInfo) => set({ actualClassInfo }),
  sales: [],
  setSales: (sales) => set({ sales }),
  profits: [],
  setProfits: (profits) => set({ profits }),
  subFees: [],
  setSubFees: (subFees) => set({ subFees }),
  mdStatus: [],
  setMdStatus: (mdStatus) => set({ mdStatus }),
  projectLink: [],
  setProjectLink: (projectLink) => set({ projectLink }),
  basePlan: [],
  setBasePlan: (basePlan) => set({ basePlan }),
  units: [],
  setUnits: (units) => set({ units }),

  loadFullCloudData: (payload) => {
    set(buildFullCloudDataStateUpdate(get(), payload));
  },
}));

if (typeof window !== 'undefined') {
  setTimeout(async () => {
    try {
      const state = useDataStore.getState();
      if (!state.storeLocationData || Object.keys(state.storeLocationData).length === 0) {
        const diskConfig = await getCachedLayoutConfigFromDisk();
        if (diskConfig && diskConfig.storeLocationData && Object.keys(diskConfig.storeLocationData).length > 0) {
          useDataStore.getState().setLoadedCloudData(diskConfig);
        }
      }
    } catch (_e) {}
  }, 0);
}
