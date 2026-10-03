import { useState, useEffect } from 'react';
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

  useEffect(() => {
    const saved = localStorage.getItem(`taka_cost_col_widths_${userId}`);
    if (saved) {
      try {
        setColWidths(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }

    const savedCols = localStorage.getItem(`taka_cost_visible_cols_${userId}`);
    if (savedCols) {
      try {
        let parsed = JSON.parse(savedCols);
        if (!parsed.includes('action')) parsed.push('action');
        setVisibleColumns(parsed);
      } catch (e) {
        console.error(e);
      }
    }
  }, [userId]);

  const handleResize = (col: keyof CostColWidths, newWidth: number) => {
    setColWidths((prev) => {
      const next = { ...prev, [col]: newWidth };
      localStorage.setItem(`taka_cost_col_widths_${userId}`, JSON.stringify(next));
      return next;
    });
  };

  const handleToggleColumn = (colId: string) => {
    setVisibleColumns((prev) => {
      const next = prev.includes(colId)
        ? prev.filter((id) => id !== colId)
        : [...prev, colId];
      localStorage.setItem(`taka_cost_visible_cols_${userId}`, JSON.stringify(next));
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
