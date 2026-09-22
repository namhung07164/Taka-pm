import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from './useAppStore';
import { AppState, UISlice, DataSlice, OptimisticSlice } from './storeTypes';

/**
 * Atomic selector hook for UI slice state with shallow equality checking.
 * Prevents unnecessary re-renders when unrelated UI state changes.
 */
export function useUISlice<T>(selector: (state: UISlice) => T): T {
  return useAppStore(useShallow(selector));
}

/**
 * Atomic selector hook for Data slice state with shallow equality checking.
 * Prevents re-renders when data arrays are mutated in-place or unrelated state updates.
 */
export function useDataSlice<T>(selector: (state: DataSlice) => T): T {
  return useAppStore(useShallow(selector));
}

/**
 * Atomic selector hook for Optimistic slice state with shallow equality checking.
 */
export function useOptimisticSlice<T>(selector: (state: OptimisticSlice) => T): T {
  return useAppStore(useShallow(selector));
}

/**
 * Generic shallow selector wrapper for custom multi-property store subscriptions.
 */
export function useStoreShallow<T>(selector: (state: AppState) => T): T {
  return useAppStore(useShallow(selector));
}
