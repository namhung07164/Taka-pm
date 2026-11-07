import React, { useEffect, useRef, useState } from 'react';
import { safeGetDeviceItemLocal, safeSetDeviceItemLocal, getDeviceScreenType } from '../../lib/storage';
import { AVAILABLE_COLUMNS, CostColWidths } from './costTypes';

interface UseCostColumnsParams {
  userId: string;
}

export function useCostColumns({ userId }: UseCostColumnsParams) {
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    AVAILABLE_COLUMNS.map((c) => c.id)
  );

  const [colWidths, setColWidths] = useState<CostColWidths>({
    no: 76,
    year: 80,
    store: 80,
    code: 136,
    projectName: 192,
    actual: 132,
    firstPaid: 128,
    secondPaid: 128,
    thirdPaid: 128,
    balance: 128,
    supportingFee: 132,
    description: 256,
    vendor: 192,
    action: 104,
  });

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const loadDeviceConfig = () => {
      const saved = safeGetDeviceItemLocal('taka_cost_col_widths', userId);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.no && parsed.no < 72) parsed.no = 76;
          setColWidths((prev) => ({ ...prev, ...parsed }));
        } catch (e) {
          console.error(e);
        }
      }

      const savedCols = safeGetDeviceItemLocal('taka_cost_visible_cols', userId);
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
          setVisibleColumns(['no', 'code', 'projectName', 'actual', 'balance', 'action']);
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
  }, [userId]);

  const handleResize = (col: keyof CostColWidths, newWidth: number) => {
    setColWidths((prev) => {
      const next = { ...prev, [col]: newWidth };
      safeSetDeviceItemLocal('taka_cost_col_widths', JSON.stringify(next), userId);
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId];
      safeSetDeviceItemLocal('taka_cost_visible_cols', JSON.stringify(next), userId);
      return next;
    });
  };

  return {
    visibleColumns,
    setVisibleColumns,
    colWidths,
    setColWidths,
    handleResize,
    handleToggleColumn,
  };
}
