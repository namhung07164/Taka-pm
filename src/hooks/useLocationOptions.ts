import { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getEffectiveStoreFilter } from '../lib/utils';
import { useEnrichedData } from './useEnrichedData';

export function useLocationOptions() {
  const { enrichedProjects } = useEnrichedData();
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const currentUser = useAppStore(state => state.currentUser);
  const locationVisibility = useAppStore(state => state.locationVisibility);
  const locations = useAppStore(state => state.locations);
  
  return useMemo(() => {
    const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
    const isAdmin = currentUser?.role === 'admin';
    const locPerms = currentUser?.locationPermissions || {};
    const hasAll = isAdmin || locPerms['all'];

    // 1. All possible locations configured in store or found in projects
    const allKnownLocations = Array.from(
      new Set([
        ...locations,
        ...enrichedProjects.map(p => p.location).filter(Boolean)
      ])
    );

    // 2. Filter locations strictly by user RBAC permissions
    const permittedLocations = allKnownLocations.filter(loc => {
      if (!loc || String(loc).trim() === '') return false;
      if (hasAll) return true;
      const lLower = String(loc).toLowerCase().trim();
      return locPerms[lLower] || locPerms[`md-${lLower}`];
    });

    // 3. Filter by locationVisibility config
    return permittedLocations.filter(loc => locationVisibility[loc] !== false).sort();
    
  }, [enrichedProjects, locations, globalStoreFilter, globalYearFilter, currentUser, locationVisibility]);
}
