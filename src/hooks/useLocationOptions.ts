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
  
  return useMemo(() => {
    const effectiveStore = getEffectiveStoreFilter(globalStoreFilter, currentUser);
    
    // Filter enrichedProjects based on current year and store
    const filteredProjects = enrichedProjects.filter(p => {
      // 1. Check Store
      if (effectiveStore !== 'all' && p.store !== effectiveStore) return false;
      
      // 2. Check Year
      const pYear = String(p.year || '');
      if (globalYearFilter !== 'all' && pYear !== globalYearFilter) return false;
      
      return true;
    });
    
    // 3. Extract unique locations
    const uniqueLocations = [...new Set(filteredProjects.map(p => p.location).filter(Boolean))].sort();
    
    // 4. Apply locationVisibility (permissions are already applied in enrichedProjects)
    return uniqueLocations.filter(loc => locationVisibility[loc] !== false);
    
  }, [enrichedProjects, globalStoreFilter, globalYearFilter, currentUser, locationVisibility]);
}
