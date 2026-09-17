import { create } from 'zustand';
import { UnitShape, MapVersion } from './components/DataMapping/types';

export interface StoreLocationRecord {
  mapUnits: UnitShape[];
  mapVersions: MapVersion[];
  activeMapVersionId: string | null;
}

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

interface DataStoreState {
  store: 'HCM' | 'HN';
  setStore: (store: 'HCM' | 'HN') => void;
  location: string;
  setLocation: (location: string) => void;
  setStoreAndLocation: (store: 'HCM' | 'HN', location: string) => void;
  storeLocationData: Record<string, StoreLocationRecord>;
  setStoreLocationData: (data: Record<string, StoreLocationRecord>) => void;
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
    const state = get();
    const oldKey = getPartitionKey(state.store, state.location);
    const newKey = getPartitionKey(newStore, newLocation);

    // Persist current active partition data
    const updatedStoreLocationData = {
      ...state.storeLocationData,
      [oldKey]: {
        mapUnits: state.mapUnits,
        mapVersions: state.mapVersions,
        activeMapVersionId: state.activeMapVersionId,
      },
    };

    // Retrieve target partition data
    const target = updatedStoreLocationData[newKey];
    const newUnits = target?.mapUnits ?? [];
    const newVersions = target?.mapVersions ?? [];
    const newActiveVersionId = target?.activeMapVersionId ?? (newVersions.length > 0 ? newVersions[0].id : null);

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
      ...(target ? {
        mapUnits: target.mapUnits || [],
        mapVersions: target.mapVersions || [],
        activeMapVersionId: target.activeMapVersionId || (target.mapVersions?.[0]?.id ?? null),
      } : {}),
    });
  },

  mapUnits: [],
  setMapUnits: (mapUnits) => {
    const state = get();
    const taggedUnits = mapUnits.map(u => ({
      ...u,
      store: u.store || state.store,
      location: u.location || state.location,
    }));
    const key = getPartitionKey(state.store, state.location);
    set({
      mapUnits: taggedUnits,
      storeLocationData: {
        ...state.storeLocationData,
        [key]: {
          ...(state.storeLocationData[key] || { mapVersions: state.mapVersions, activeMapVersionId: state.activeMapVersionId }),
          mapUnits: taggedUnits,
        },
      },
    });
  },

  mapVersions: [],
  setMapVersions: (mapVersions) => {
    const state = get();
    const taggedVersions = mapVersions.map(v => ({
      ...v,
      store: v.store || state.store,
      location: v.location || state.location,
    }));
    const key = getPartitionKey(state.store, state.location);
    set({
      mapVersions: taggedVersions,
      storeLocationData: {
        ...state.storeLocationData,
        [key]: {
          ...(state.storeLocationData[key] || { mapUnits: state.mapUnits, activeMapVersionId: state.activeMapVersionId }),
          mapVersions: taggedVersions,
        },
      },
    });
  },

  activeMapVersionId: null,
  setActiveMapVersionId: (activeMapVersionId) => {
    const state = get();
    const key = getPartitionKey(state.store, state.location);
    set({
      activeMapVersionId,
      storeLocationData: {
        ...state.storeLocationData,
        [key]: {
          ...(state.storeLocationData[key] || { mapUnits: state.mapUnits, mapVersions: state.mapVersions }),
          activeMapVersionId,
        },
      },
    });
  },

  reviewSelectedLabels: [],
  setReviewSelectedLabels: (reviewSelectedLabels) => set({ reviewSelectedLabels }),
  reviewLabelColors: {},
  setReviewLabelColors: (reviewLabelColors) => set({ reviewLabelColors }),

  getAllStoreUnits: (targetStore) => {
    const state = get();
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
        const loc = key.split('_')[1] || state.location;
        if (partition?.mapUnits) {
          for (const u of partition.mapUnits) {
            if (!seenIds.has(u.id)) {
              seenIds.add(u.id);
              allUnits.push({
                ...u,
                store: u.store || currentStore,
                location: u.location || loc,
              });
            }
          }
        }
      }
    }
    return allUnits;
  },

  getAllStoreVersions: (targetStore) => {
    const state = get();
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

    const allVersions: MapVersion[] = [];
    const seenIds = new Set<string>();

    for (const key in mergedData) {
      if (key.startsWith(`${currentStore}_`)) {
        const partition = mergedData[key];
        const loc = key.split('_')[1] || state.location;
        if (partition?.mapVersions) {
          for (const v of partition.mapVersions) {
            if (!seenIds.has(v.id)) {
              seenIds.add(v.id);
              allVersions.push({
                ...v,
                store: v.store || currentStore,
                location: v.location || loc,
              });
            }
          }
        }
      }
    }
    return allVersions;
  },

  updateStoreUnitsAcrossLocations: (updatedUnits, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const currentKey = getPartitionKey(state.store, state.location);

    const unitsByPartition: Record<string, UnitShape[]> = {};
    for (const u of updatedUnits) {
      const uStore = u.store || currentStore;
      const uLoc = u.location || state.location;
      const pKey = getPartitionKey(uStore, uLoc);
      if (!unitsByPartition[pKey]) unitsByPartition[pKey] = [];
      unitsByPartition[pKey].push(u);
    }

    const updatedStoreLocationData = { ...state.storeLocationData };
    for (const pKey in unitsByPartition) {
      if (pKey.startsWith(`${currentStore}_`)) {
        updatedStoreLocationData[pKey] = {
          ...(updatedStoreLocationData[pKey] || { mapVersions: [], activeMapVersionId: null }),
          mapUnits: unitsByPartition[pKey],
        };
      }
    }

    const activeUnits = updatedStoreLocationData[currentKey]?.mapUnits || state.mapUnits;

    set({
      storeLocationData: updatedStoreLocationData,
      mapUnits: activeUnits,
    });
  },

  updateStoreVersionsAcrossLocations: (updatedVersions, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const currentKey = getPartitionKey(state.store, state.location);

    const versionsByPartition: Record<string, MapVersion[]> = {};
    for (const v of updatedVersions) {
      const vStore = v.store || currentStore;
      const vLoc = v.location || state.location;
      const pKey = getPartitionKey(vStore, vLoc);
      if (!versionsByPartition[pKey]) versionsByPartition[pKey] = [];
      versionsByPartition[pKey].push(v);
    }

    const updatedStoreLocationData = { ...state.storeLocationData };
    for (const pKey in versionsByPartition) {
      if (pKey.startsWith(`${currentStore}_`)) {
        updatedStoreLocationData[pKey] = {
          ...(updatedStoreLocationData[pKey] || { mapUnits: [], activeMapVersionId: null }),
          mapVersions: versionsByPartition[pKey],
        };
      }
    }

    const activeVersions = updatedStoreLocationData[currentKey]?.mapVersions || state.mapVersions;

    set({
      storeLocationData: updatedStoreLocationData,
      mapVersions: activeVersions,
    });
  },

  syncGroupsToAllStoreLocations: (groups, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const updatedStoreLocationData = { ...state.storeLocationData };

    for (const pKey in updatedStoreLocationData) {
      if (pKey.startsWith(`${currentStore}_`)) {
        const partition = updatedStoreLocationData[pKey];
        if (partition?.mapVersions) {
          const newVersions = partition.mapVersions.map((v) => ({
            ...v,
            groups,
          }));
          updatedStoreLocationData[pKey] = {
            ...partition,
            mapVersions: newVersions,
          };
        }
      }
    }

    const currentKey = getPartitionKey(state.store, state.location);
    const activeVersions = updatedStoreLocationData[currentKey]?.mapVersions || state.mapVersions;

    set({
      storeLocationData: updatedStoreLocationData,
      mapVersions: activeVersions,
    });
  },

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
}));

