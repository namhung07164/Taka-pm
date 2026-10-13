import React, { useEffect, useMemo, useState } from 'react';
import { Project, Task, AppUser, AppRole, PermissionMatrix } from '../../types';
import { getUserAllowedStores } from '../../lib/utils';
import { useLocationOptions } from '../../hooks/useLocationOptions';

interface UseDetailOptionsParams {
  currentUser: AppUser;
  locations: string[];
  projects: Project[];
  tasks: Task[];
  globalYearFilter: string;
  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  permissionMatrix: PermissionMatrix;
}

export function useDetailOptions({
  currentUser,
  locations,
  projects,
  tasks,
  globalYearFilter,
  globalLocationFilter,
  setGlobalLocationFilter,
  permissionMatrix,
}: UseDetailOptionsParams) {
  const isAdmin = currentUser.role === 'admin';
  const role = currentUser.role as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const hasWritePermission = (isAdmin || !!permissionMatrix[role]?.Write?.detail) && !isArchiveYear;
  const [isEditMode, setIsEditMode] = useState(false);
  const canWrite = hasWritePermission && isEditMode;

  const allowedStores = useMemo(() => getUserAllowedStores(currentUser), [currentUser]);
  const stores = allowedStores;

  const allowedStoreOptions = useMemo(() => {
    const allowed = getUserAllowedStores(currentUser);
    return allowed.map(s => ({ label: s, value: s }));
  }, [currentUser]);

  const locationFilterOptions = useLocationOptions();
  useEffect(() => {
    if (locationFilterOptions.length > 0 && globalLocationFilter.length > 0) {
      const valid = globalLocationFilter.filter(loc => locationFilterOptions.includes(loc));
      if (valid.length !== globalLocationFilter.length) {
        setGlobalLocationFilter(valid);
      }
    }
  }, [locationFilterOptions, globalLocationFilter, setGlobalLocationFilter]);

  const allowedLocationOptions = useMemo(() => {
    if (currentUser.role === 'admin') return Array.from(new Set(locations));
    return Array.from(new Set(locations)).filter(loc => 
      currentUser.locationPermissions?.['all'] || currentUser.locationPermissions?.[loc.toLowerCase()]
    );
  }, [locations, currentUser]);

  const years = useMemo(() => {
    const projYears = projects.map(p => {
      if (p.year) return String(p.year);
      if (p.start) return String(p.start).substring(0, 4);
      return null;
    }).filter(Boolean) as string[];
    const taskYears = tasks.map(t => {
      if (t.projectYear) return String(t.projectYear);
      if (t.start) return String(t.start).substring(0, 4);
      return null;
    }).filter(Boolean) as string[];
    const baseYears = ['2026', '2027'];
    const unique = Array.from(new Set([...projYears, ...taskYears, ...baseYears])).filter(Boolean).sort();
    return unique.length > 0 ? unique : ['2026', '2027'];
  }, [projects, tasks]);

  return {
    isAdmin,
    role,
    isArchiveYear,
    hasWritePermission,
    isEditMode,
    setIsEditMode,
    canWrite,
    stores,
    allowedStoreOptions,
    locationFilterOptions,
    allowedLocationOptions,
    years,
  };
}
