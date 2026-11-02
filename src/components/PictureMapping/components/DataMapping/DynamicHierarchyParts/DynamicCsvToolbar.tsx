import React, { memo, useCallback, useRef, useState } from 'react';
import { BookOpen, FileSpreadsheet, FileText, Upload } from 'lucide-react';
import { Group, MapVersion } from '../types';
import { DynamicUnitSummaryItem } from '../../../lib/dynamicRuleMatcher';
import { useAppStore } from '../../../../../store/useAppStore';
import {
  exportDynamicHierarchyFile,
  parseDynamicHierarchyImportFile,
} from './dynamicCsvService';
import { DynamicCsvGuideModal } from './DynamicCsvGuideModal';

interface DynamicCsvToolbarProps {
  store: string;
  location: string;
  effectiveYear: string;
  activeVersion?: MapVersion;
  summaryList: DynamicUnitSummaryItem[];
  groupMatchDetailsMap?: Map<string, { unitNames: string[]; totalAreaM2: number }>;
  onImportGroups: (groups: Group[], mode: 'merge' | 'replace') => void;
}

export const DynamicCsvToolbar = memo(function DynamicCsvToolbar({
  store,
  location,
  effectiveYear,
  activeVersion,
  summaryList,
  groupMatchDetailsMap,
  onImportGroups,
}: DynamicCsvToolbarProps) {
  const setToast = useAppStore((s) => s.setToast);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  const handleExport = useCallback(
    async (format: 'xlsx' | 'csv' | 'template_xlsx') => {
      try {
        await exportDynamicHierarchyFile({
          format,
          activeVersion,
          store,
          location,
          year: effectiveYear,
          summaryList,
          groupMatchDetailsMap,
        });
        setToast({
          title: format === 'csv' ? 'Exported Dynamic CSV' : 'Exported Excel (2 Sheets)',
          message:
            format === 'csv'
              ? `Downloaded CSV rules for [${store} • ${location} • ${effectiveYear}].`
              : `Downloaded Workbook with Sheet 1 (Dynamic Rules) & Sheet 2 (Field Guide + Live Floor Data).`,
          type: 'success',
        });
      } catch (err: any) {
        setToast({
          title: 'Export Failed',
          message: err?.message || 'Unable to export Dynamic Hierarchy file.',
          type: 'error',
        });
      }
    },
    [activeVersion, effectiveYear, groupMatchDetailsMap, location, setToast, store, summaryList]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      try {
        const { groups, importedGroupsCount, importedRulesCount } =
          await parseDynamicHierarchyImportFile(file, activeVersion?.groups || [], importMode);
        onImportGroups(groups, importMode);
        setToast({
          title: 'Dynamic Rules Imported (0ms RAM)',
          message: `Imported ${importedGroupsCount} groups (${importedRulesCount} rules) in ${
            importMode === 'replace' ? 'Replace' : 'Merge/Update'
          } mode.`,
          type: 'success',
        });
      } catch (err: any) {
        setToast({
          title: 'Import Failed',
          message: err?.message || 'Could not parse the uploaded CSV/Excel file.',
          type: 'error',
        });
      }
    },
    [activeVersion?.groups, importMode, onImportGroups, setToast]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="inline-flex items-center gap-1 flex-wrap bg-slate-950/90 border border-slate-800 rounded-md p-0.5">
        <select
          value={importMode}
          onChange={(e) => setImportMode(e.target.value as 'merge' | 'replace')}
          className="bg-slate-900 text-slate-300 text-[10px] font-bold px-1.5 py-1 rounded border border-slate-700 outline-none cursor-pointer hover:border-brand-500 transition-colors"
          title="Select how imported CSV/Excel groups should be applied"
        >
          <option value="merge">Import: Merge</option>
          <option value="replace">Import: Replace</option>
        </select>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Import Dynamic Groups & Matching Rules from .CSV or .XLSX"
        >
          <Upload size={11} /> Import CSV/XLSX
        </button>

        <button
          type="button"
          onClick={() => handleExport('xlsx')}
          className="flex items-center gap-1 px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold uppercase transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Export 2-Sheet Excel: Sheet 1 (Dynamic Rules) + Sheet 2 (Field Dictionary & Live Unit Data)"
        >
          <FileSpreadsheet size={11} /> Export XLSX (2 Sheets)
        </button>

        <button
          type="button"
          onClick={() => handleExport('csv')}
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold uppercase transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Export Sheet 1 Dynamic Rules as UTF-8 CSV"
        >
          <FileText size={11} /> Export CSV
        </button>

        <button
          type="button"
          onClick={() => setIsGuideOpen(true)}
          className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[10px] font-bold uppercase transition-colors cursor-pointer active:scale-95 touch-manipulation"
          title="Open Sheet 2: Field Explanation, Valid Operators & Live Floor Data Reference"
        >
          <BookOpen size={11} /> Sheet 2: Field Guide
        </button>
      </div>

      {isGuideOpen && (
        <DynamicCsvGuideModal
          isOpen={isGuideOpen}
          onClose={() => setIsGuideOpen(false)}
          store={store}
          location={location}
          effectiveYear={effectiveYear}
          summaryList={summaryList}
          onDownloadTemplate={() => handleExport('template_xlsx')}
        />
      )}
    </>
  );
});
