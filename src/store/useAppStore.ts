import { create } from "zustand";
import { AppState } from "./storeTypes";
import { createUISlice } from "./slices/createUISlice";
import { createDataSlice } from "./slices/createDataSlice";
import { createOptimisticSlice } from "./slices/createOptimisticSlice";

export const useAppStore = create<AppState>((...a) => ({
  ...createUISlice(...a),
  ...createDataSlice(...a),
  ...createOptimisticSlice(...a),
}));

if (typeof window !== 'undefined') {
  (window as any).__TAKA_APP_STORE__ = useAppStore;
}

export type { AppState };
export { useUISlice, useDataSlice, useOptimisticSlice, useStoreShallow } from "./storeSelectors";

