import { create } from "zustand";
import { AppState } from "./storeTypes";
import { createUISlice } from "./slices/createUISlice";
import { createDataSlice } from "./slices/createDataSlice";
import { createOptimisticSlice } from "./slices/createOptimisticSlice";
import { createDataMappingSlice } from "./slices/createDataMappingSlice";

export const useAppStore = create<AppState>((...a) => ({
  ...createUISlice(...a),
  ...createDataSlice(...a),
  ...createOptimisticSlice(...a),
  ...createDataMappingSlice(...a),
}));

export type { AppState };
