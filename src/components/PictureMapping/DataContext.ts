import { create } from 'zustand';
import { UnitShape, MapVersion } from './components/DataMapping/types';
import { useAppStore } from '../../store/useAppStore';

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

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

let backupTimeout: any = null;
export function autoBackupStoreLocationData(data: Record<string, StoreLocationRecord>, store: string, location: string, activeMapVersionId?: string | null) {
  if (typeof window === 'undefined') return;
  if (backupTimeout) clearTimeout(backupTimeout);
  backupTimeout = setTimeout(() => {
    try {
      const payload = JSON.stringify({
        storeLocationData: data,
        store,
        location,
        activeMapVersionId,
        updatedAt: Date.now(),
      });
      // Safety guard: Chrome localStorage limit is ~5MB. Cap single backup at 1MB to prevent QuotaExceededError
      if (payload.length < 1000000) {
        localStorage.setItem('taka_mapping_config_backup', payload);
      } else {
        localStorage.removeItem('taka_mapping_config_backup');
      }
    } catch (e) {
      try { localStorage.removeItem('taka_mapping_config_backup'); } catch (_) {}
    }
  }, 1500);
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
  loadFullCloudData: (payload: {
    storeLocationData: Record<string, StoreLocationRecord>;
    store?: 'HCM' | 'HN';
    location?: string;
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
  }) => void;
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
    autoBackupStoreLocationData(updatedStoreLocationData, newStore, newLocation, newActiveVersionId);
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
    autoBackupStoreLocationData(data, state.store, state.location, state.activeMapVersionId);
  },

  setLoadedCloudData: (payload: LoadedCloudDataPayload) => {
    const state = get();
    const targetStore = payload.store || state.store;
    const targetLocation = (payload.location || state.location).toUpperCase().trim();
    const pKey = getPartitionKey(targetStore, targetLocation);
    
    const storeLocationData = payload.storeLocationData || state.storeLocationData;
    const target = storeLocationData[pKey];
    
    // Strict priority: use partition data for this exact store & floor first, fallback to root legacy only if partition is empty
    const mapUnits = (target?.mapUnits && Array.isArray(target.mapUnits) && target.mapUnits.length > 0) 
      ? target.mapUnits 
      : (payload.mapUnits || []);
    const mapVersions = (target?.mapVersions && Array.isArray(target.mapVersions) && target.mapVersions.length > 0) 
      ? target.mapVersions 
      : (payload.mapVersions || []);
    const activeMapVersionId = target?.activeMapVersionId || payload.activeMapVersionId || (mapVersions[0]?.id ?? null);

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
    const taggedUnits = mapUnits.map(u => ({
      ...u,
      store: u.store || state.store,
      location: u.location || state.location,
    }));
    const key = getPartitionKey(state.store, state.location);
    const newStoreLocationData = {
      ...state.storeLocationData,
      [key]: {
        ...(state.storeLocationData[key] || { mapVersions: state.mapVersions, activeMapVersionId: state.activeMapVersionId }),
        mapUnits: taggedUnits,
      },
    };
    set({
      mapUnits: taggedUnits,
      storeLocationData: newStoreLocationData,
    });
    autoBackupStoreLocationData(newStoreLocationData, state.store, state.location, state.activeMapVersionId);
  },

  mapVersions: [],
  setMapVersions: (mapVersions) => {
    const state = get();
    const appYear = String(useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all' ? useAppStore.getState().globalYearFilter : '2026');
    const taggedVersions = mapVersions.map(v => ({
      ...v,
      store: v.store || state.store,
      location: v.location || state.location,
      year: v.year ? String(v.year).trim() : appYear,
    }));
    const key = getPartitionKey(state.store, state.location);
    const newStoreLocationData = {
      ...state.storeLocationData,
      [key]: {
        ...(state.storeLocationData[key] || { mapUnits: state.mapUnits, activeMapVersionId: state.activeMapVersionId }),
        mapVersions: taggedVersions,
      },
    };
    set({
      mapVersions: taggedVersions,
      storeLocationData: newStoreLocationData,
    });
    autoBackupStoreLocationData(newStoreLocationData, state.store, state.location, state.activeMapVersionId);
  },

  activeMapVersionId: null,
  setActiveMapVersionId: (activeMapVersionId) => {
    const state = get();
    // Identify which partition this version belongs to
    let targetKey = getPartitionKey(state.store, state.location);
    if (activeMapVersionId) {
      for (const pKey in state.storeLocationData) {
        if (state.storeLocationData[pKey]?.mapVersions?.some(v => v.id === activeMapVersionId)) {
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
  },

  getAllStoreVersions: (targetStore) => {
    const state = get();
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
        const appYear = String(useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all' ? useAppStore.getState().globalYearFilter : '2026');
        if (partition?.mapVersions) {
          for (const v of partition.mapVersions) {
            if (!seenIds.has(v.id)) {
              seenIds.add(v.id);
              const resolvedLoc = (v.location && String(v.location).trim()) 
                ? String(v.location).trim().toUpperCase() 
                : (v.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || loc);
              const resolvedYear = (v.year && String(v.year).trim()) 
                ? String(v.year).trim() 
                : (v.name?.match(/(202\d|203\d)/i)?.[1] || appYear);
              
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
  },

  updateStoreUnitsAcrossLocations: (updatedUnits, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const currentKey = getPartitionKey(state.store, state.location);

    const unitsByPartition: Record<string, UnitShape[]> = {};
    for (const u of updatedUnits) {
      const uStore = u.store || currentStore;
      const uLoc = (u.location && String(u.location).trim()) 
        ? String(u.location).trim().toUpperCase() 
        : (u.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || state.location || 'L1');
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

    set({
      storeLocationData: updatedStoreLocationData,
      mapUnits: activeUnits,
    });
    autoBackupStoreLocationData(updatedStoreLocationData, state.store, state.location, state.activeMapVersionId);
  },

  updateStoreVersionsAcrossLocations: (updatedVersions, targetStore) => {
    const state = get();
    const currentStore = targetStore || state.store;
    const currentKey = getPartitionKey(state.store, state.location);
    const appYear = String(useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all' ? useAppStore.getState().globalYearFilter : '2026');

    const versionsByPartition: Record<string, MapVersion[]> = {};
    for (const v of updatedVersions) {
      const vStore = v.store || currentStore;
      const vLoc = (v.location && String(v.location).trim()) 
        ? String(v.location).trim().toUpperCase() 
        : (v.name?.match(/(b\d|l\d|\d+f|gf|ug)/i)?.[1]?.toUpperCase() || state.location || 'L1');
      const vYr = (v.year && String(v.year).trim()) 
        ? String(v.year).trim() 
        : (v.name?.match(/(202\d|203\d)/i)?.[1] || appYear);

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
          activeMapVersionId: existing?.activeMapVersionId && newVers.some(v => v.id === existing.activeMapVersionId)
            ? existing.activeMapVersionId
            : (newVers[0]?.id || null),
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
    
    // Preserve current state.activeMapVersionId if it still exists in updatedVersions
    const isCurrentActiveValid = state.activeMapVersionId && updatedVersions.some(v => v.id === state.activeMapVersionId);
    const activeVersionId = isCurrentActiveValid
      ? state.activeMapVersionId
      : (activePartition?.activeMapVersionId || (activeVersions[0]?.id ?? null));

    set({
      storeLocationData: updatedStoreLocationData,
      mapVersions: activeVersions,
      activeMapVersionId: activeVersionId,
    });
    autoBackupStoreLocationData(updatedStoreLocationData, state.store, state.location, activeVersionId);
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
    const state = get();
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
    const targetActiveVerId = payload.activeMapVersionId || targetPartition.activeMapVersionId || (targetVersions[0]?.id ?? null);

    set({
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
    });
  },
}));

