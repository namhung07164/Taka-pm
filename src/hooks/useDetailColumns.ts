import { useState, useCallback, useMemo } from 'react';
import { AppUser } from '../types';

export const AVAILABLE_COLUMNS = [
  { id: 'no', label: 'No' },
  { id: 'year', label: 'Year' },
  { id: 'store', label: 'Store' },
  { id: 'location', label: 'Location' },
  { id: 'code', label: 'Code' },
  { id: 'projectName', label: 'Project Name' },
  { id: 'taskName', label: 'Task Name' },
  { id: 'duration', label: 'Duration' },
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Finish' },
  { id: 'predecessor', label: 'Predecessor' },
  { id: 'party', label: 'Party' },
  { id: 'action', label: 'Action' }
];

interface UseDetailColumnsParams {
  currentUser: AppUser;
  canWrite: boolean;
}

export function useDetailColumns({ currentUser, canWrite }: UseDetailColumnsParams) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`taka_detail_visible_cols_${currentUser.id}`);
      return saved ? JSON.parse(saved) : AVAILABLE_COLUMNS.map(c => c.id);
    } catch {
      return AVAILABLE_COLUMNS.map(c => c.id);
    }
  });

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('taka_detail_column_widths');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const handleColumnResize = useCallback((colId: string, width: number) => {
    setColumnWidths(prev => {
      const next = { ...prev, [colId]: width };
      try {
        localStorage.setItem('taka_detail_column_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleResetColumnWidth = useCallback((colId: string) => {
    setColumnWidths(prev => {
      const next = { ...prev };
      delete next[colId];
      try {
        localStorage.setItem('taka_detail_column_widths', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const handleToggleColumn = useCallback((colId: string) => {
    setVisibleColumns(prev => {
      const next = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      localStorage.setItem(`taka_detail_visible_cols_${currentUser.id}`, JSON.stringify(next));
      return next;
    });
  }, [currentUser.id]);

  const availableColumnsForUser = useMemo(() => {
    return AVAILABLE_COLUMNS.filter(c => {
      if (c.id === 'party') {
        return currentUser.role === 'admin' || currentUser.partyPermissions?.['all'] || currentUser.partyPermissions?.[(currentUser.username || '').toLowerCase()];
      }
      return true;
    });
  }, [currentUser]);

  const effectiveVisibleColumns = useMemo(() => {
    if (canWrite) {
      return visibleColumns.includes('action') ? visibleColumns : [...visibleColumns, 'action'];
    }
    return visibleColumns.filter(c => c !== 'action');
  }, [visibleColumns, canWrite]);

  const columnsWithWidths = useMemo(() => {
    return availableColumnsForUser
      .filter(col => effectiveVisibleColumns.includes(col.id))
      .map(col => ({
        ...col,
        width: columnWidths[col.id]
      }));
  }, [availableColumnsForUser, effectiveVisibleColumns, columnWidths]);

  return {
    visibleColumns,
    availableColumnsForUser,
    effectiveVisibleColumns,
    columnsWithWidths,
    handleToggleColumn,
    handleColumnResize,
    handleResetColumnWidth,
  };
}
