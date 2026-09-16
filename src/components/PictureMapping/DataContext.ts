import { create } from 'zustand';
import { UnitShape, MapVersion } from './components/DataMapping/types';

interface DataStoreState {
  store: 'HCM' | 'HN';
  setStore: (store: 'HCM' | 'HN') => void;
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

export const useDataStore = create<DataStoreState>((set) => ({
  store: 'HCM',
  setStore: (store) => set({ store }),
  mapUnits: [],
  setMapUnits: (mapUnits) => set({ mapUnits }),
  mapVersions: [],
  setMapVersions: (mapVersions) => set({ mapVersions }),
  activeMapVersionId: null,
  setActiveMapVersionId: (activeMapVersionId) => set({ activeMapVersionId }),
  reviewSelectedLabels: [],
  setReviewSelectedLabels: (reviewSelectedLabels) => set({ reviewSelectedLabels }),
  reviewLabelColors: {},
  setReviewLabelColors: (reviewLabelColors) => set({ reviewLabelColors }),
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

