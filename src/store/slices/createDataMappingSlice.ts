import { StateCreator } from "zustand";
import { AppState, DataMappingSlice } from "../storeTypes";
import { UnitShape, MapVersion } from "../../components/DataMapping/types";

const DEFAULT_MAP_VERSIONS: MapVersion[] = [
  {
    id: 'v-default',
    name: 'Standard Floor Plan (L1)',
    backgroundUrl: null,
    backgroundScale: 1,
    backgroundPos: { x: 0, y: 0 },
    groups: [
      { id: 'g-fashion', name: 'Fashion & Apparel', color: '#3b82f6', opacity: 0.6 },
      { id: 'g-fnb', name: 'F&B / Food Court', color: '#f97316', opacity: 0.6 },
      { id: 'g-cosmetics', name: 'Beauty & Cosmetics', color: '#ec4899', opacity: 0.6 },
      { id: 'g-services', name: 'Services & Operations', color: '#10b981', opacity: 0.6 },
    ],
    groupMappings: {},
    isDynamicActive: true,
  }
];

export const createDataMappingSlice: StateCreator<
  AppState,
  [],
  [],
  DataMappingSlice
> = (set) => ({
  store: 'HCM',
  setStore: (store) => set({ store }),

  mapUnits: [],
  setMapUnits: (updater) =>
    set((state) => ({
      mapUnits: typeof updater === 'function' ? updater(state.mapUnits) : updater,
    })),

  mapVersions: DEFAULT_MAP_VERSIONS,
  setMapVersions: (updater) =>
    set((state) => ({
      mapVersions: typeof updater === 'function' ? updater(state.mapVersions) : updater,
    })),

  activeMapVersionId: 'v-default',
  setActiveMapVersionId: (activeMapVersionId) => set({ activeMapVersionId }),

  reviewSelectedLabels: ['name', 'mdStatus', 'sales'],
  setReviewSelectedLabels: (reviewSelectedLabels) => set({ reviewSelectedLabels }),

  reviewLabelColors: {},
  setReviewLabelColors: (updater) =>
    set((state) => ({
      reviewLabelColors: typeof updater === 'function' ? updater(state.reviewLabelColors) : updater,
    })),

  isLoading: false,
  setIsLoading: (isLoading) => set({ isLoading }),

  unitInfo: [],
  setUnitInfo: (unitInfo) => set({ unitInfo }),

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

  projectStatus: [],
  setProjectStatus: (projectStatus) => set({ projectStatus }),

  projectLink: [],
  setProjectLink: (projectLink) => set({ projectLink }),

  basePlan: [],
  setBasePlan: (basePlan) => set({ basePlan }),

  units: [],
  setUnits: (units) => set({ units }),
});
