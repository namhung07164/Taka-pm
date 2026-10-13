import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppUser } from '../../types';
import { safeGetDeviceItemLocal, safeSetDeviceItemLocal, getDeviceScreenType } from '../../lib/storage';
import { AVAILABLE_COLUMNS, SortConfig } from './detailTypes';

interface UseDetailColumnsParams {
  currentUser: AppUser;
  canWrite: boolean;
}

export function useDetailColumns({ currentUser, canWrite }: UseDetailColumnsParams) {
  const availableColumnsForUser = useMemo(() => {
    return AVAILABLE_COLUMNS;
  }, []);

  const [visibleColumns, setVisibleColumns] = useState<string[]>(availableColumnsForUser.map(c => c.id));
  const [colWidths, setColWidths] = useState<Record<string, number>>({
    checkbox: 44,
    no: 90,
    year: 80,
    store: 80,
    location: 120,
    code: 130,
    projectName: 220,
    taskName: 250,
    duration: 100,
    start: 200,
    finish: 200,
    predecessor: 140,
    party: 150,
    action: 160
  });

  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const loadDeviceConfig = () => {
      const saved = safeGetDeviceItemLocal('taka_detail_col_widths', currentUser.id);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.action && parsed.action < 160) {
            parsed.action = 160;
          }
          setColWidths(parsed);
        } catch (e) {
          console.error(e);
        }
      }
      
      const savedCols = safeGetDeviceItemLocal('taka_detail_visible_cols', currentUser.id);
      if (savedCols) {
        try {
          let parsed = JSON.parse(savedCols);
          if (!parsed.includes('action')) parsed.push('action');
          setVisibleColumns(parsed);
        } catch (e) {
          console.error(e);
        }
      } else {
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
        if (isMobile) {
          setVisibleColumns(['no', 'code', 'projectName', 'taskName', 'action']);
        } else {
          setVisibleColumns(availableColumnsForUser.map(c => c.id));
        }
      }
    };

    loadDeviceConfig();

    const handleResize = () => {
      const currentScreenType = getDeviceScreenType();
      if (currentScreenType !== prevScreenTypeRef.current) {
        prevScreenTypeRef.current = currentScreenType;
        loadDeviceConfig();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentUser.role, currentUser.id, availableColumnsForUser]);

  const handleResize = (col: string, newWidth: number) => {
    setColWidths(prev => {
      const updated = { ...prev, [col]: newWidth };
      safeSetDeviceItemLocal('taka_detail_col_widths', JSON.stringify(updated), currentUser.id);
      return updated;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      safeSetDeviceItemLocal('taka_detail_visible_cols', JSON.stringify(next), currentUser.id);
      return next;
    });
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev && prev.key === key) {
        if (prev.direction === 'asc') return { key, direction: 'desc' };
        return null;
      }
      return { key, direction: 'asc' };
    });
  };

  const effectiveVisibleColumns = useMemo(() => {
    if (canWrite) {
      return ['checkbox', ...visibleColumns.filter(c => c !== 'checkbox')];
    }
    return visibleColumns.filter(c => c !== 'checkbox');
  }, [canWrite, visibleColumns]);

  const totalTableWidth = useMemo(() => {
    return effectiveVisibleColumns.reduce((acc, col) => acc + (colWidths[col] || (col === 'checkbox' ? 44 : 100)), 0);
  }, [effectiveVisibleColumns, colWidths]);

  return {
    availableColumnsForUser,
    visibleColumns,
    setVisibleColumns,
    colWidths,
    setColWidths,
    sortConfig,
    setSortConfig,
    handleResize,
    handleToggleColumn,
    handleSort,
    effectiveVisibleColumns,
    totalTableWidth,
  };
}
