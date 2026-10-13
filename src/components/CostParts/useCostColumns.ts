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
    no: 64,
    year: 80,
    store: 80,
    code: 128,
    projectName: 192,
    actual: 128,
    firstPaid: 128,
    secondPaid: 128,
    thirdPaid: 128,
    balance: 128,
    supportingFee: 128,
    description: 256,
    vendor: 192,
    action: 96,
  });

  const prevScreenTypeRef = useRef(getDeviceScreenType());

  useEffect(() => {
    const loadDeviceConfig = () => {
      const saved = safeGetDeviceItemLocal('taka_cost_col_widths', userId);
      if (saved) {
        try {
          setColWidths(JSON.parse(saved));
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
