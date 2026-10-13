import React, { useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getEffectiveStoreFilter } from '../lib/utils';
import { useEnrichedData } from './useEnrichedData';

export function useLocationOptions() {
  const { enrichedProjects, filteredTasks } = useEnrichedData();
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

    // 1. For non-admin users (contractor/partner accounts like ksm-01), strictly enforce year & task/project presence
    if (!isAdmin) {
      const userProjects = enrichedProjects.filter(p => {
        if (effectiveStore && effectiveStore !== 'all') {
          const pStore = String(p.store || '').toUpperCase().trim();
          if (pStore && pStore !== effectiveStore.toUpperCase().trim()) return false;
        }
        if (globalYearFilter && globalYearFilter !== 'all') {
          const pYear = String(p.year || '').trim();
          if (pYear && pYear !== String(globalYearFilter).trim()) return false;
        }
        return true;
      });

      const userTasks = (filteredTasks || []).filter(t => {
        if (effectiveStore && effectiveStore !== 'all') {
          const tStore = String(t.projectStore || '').toUpperCase().trim();
          if (tStore && tStore !== effectiveStore.toUpperCase().trim()) return false;
        }
        if (globalYearFilter && globalYearFilter !== 'all') {
          const tYear = String(t.projectYear || '').trim();
          if (tYear && tYear !== String(globalYearFilter).trim()) return false;
        }
        return true;
      });

      // If user has NO projects and NO tasks in this period (e.g. y2027), DO NOT show any locations!
      if (userProjects.length === 0 && userTasks.length === 0) {
        return [];
      }

      // Collect locations where the user actually has projects or tasks in this period
      const activeLocs = new Set<string>();
      userProjects.forEach(p => {
        if (p.location && String(p.location).trim()) {
          activeLocs.add(String(p.location).trim());
        }
      });
      userTasks.forEach(t => {
        if (t.location && String(t.location).trim()) {
          activeLocs.add(String(t.location).trim());
        }
      });

      // Filter active locations by user's locationPermissions and locationVisibility
      const permittedLocations = Array.from(activeLocs).filter(loc => {
        if (!loc || String(loc).trim() === '') return false;
        if (hasAll) return true;
        const lLower = String(loc).toLowerCase().trim();
        return locPerms[lLower] || locPerms[`md-${lLower}`];
      });

      return permittedLocations.filter(loc => locationVisibility[loc] !== false).sort();
    }

    // 2. Admin flow: all possible locations configured in store or found in projects
    const allKnownLocations = Array.from(
      new Set([
        ...locations,
        ...enrichedProjects.map(p => p.location).filter(Boolean)
      ])
    );

    // Filter locations strictly by user RBAC permissions
    const permittedLocations = allKnownLocations.filter(loc => {
      if (!loc || String(loc).trim() === '') return false;
      if (hasAll) return true;
      const lLower = String(loc).toLowerCase().trim();
      return locPerms[lLower] || locPerms[`md-${lLower}`];
    });

    // Filter by locationVisibility config
    return permittedLocations.filter(loc => locationVisibility[loc] !== false).sort();
    
  }, [enrichedProjects, filteredTasks, locations, globalStoreFilter, globalYearFilter, currentUser, locationVisibility]);
}
