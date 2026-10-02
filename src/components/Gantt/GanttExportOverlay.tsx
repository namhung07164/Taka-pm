import React from 'react';

export interface GanttExportOverlayProps {
  isExporting?: boolean;
}

export const GanttExportOverlay: React.FC<GanttExportOverlayProps> = React.memo(({ isExporting = true }) => {
  if (!isExporting) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl p-8 flex flex-col items-center max-w-sm w-full mx-4 border border-slate-200 dark:border-[#444446]">
        <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4" />
        <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3] mb-2">Exporting Chart</h3>
        <p className="text-slate-500 dark:text-[#a3a3a3] text-center text-sm">
          Please wait while we generate your file. This may take a few moments for large charts.
        </p>
      </div>
    </div>
  );
});

GanttExportOverlay.displayName = 'GanttExportOverlay';
