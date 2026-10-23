import React, { useCallback, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface UseGanttExportParams {
  tableRef: React.RefObject<HTMLTableElement | HTMLDivElement | null>;
}

export function useGanttExport({ tableRef }: UseGanttExportParams) {
  const [isExporting, setIsExporting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  const handleExportToPDF = async () => {
    useAppStore.getState().setIsPrintPreview(true);
  };

  const handleExportToPNG = useCallback(async () => {
    const el = tableRef.current;
    if (!el) return;

    setIsExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el as HTMLElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });

      const link = document.createElement('a');
      link.download = `taka_gantt_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

      useAppStore.getState().setToast({
        title: "Success",
        message: "Gantt chart exported to PNG."
      });
    } catch (err) {
      console.error("PNG export error:", err);
    } finally {
      setIsExporting(false);
    }
  }, [tableRef]);

  return {
    isExporting,
    isPrinting,
    setIsPrinting,
    handleExportToPDF,
    handleExportToPNG
  };
}
