import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Database,
  Server,
  HardDrive,
  X,
  GripHorizontal,
  Layers,
  DollarSign,
  Calendar,
  MapPin,
  Image as ImageIcon,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import { useOverlayStack } from '../../lib/zIndexManager';
import {
  SummaryExportCategory,
  executeDownloadFirestoreSummaries,
} from './firestoreSummarizedExportService';

interface FirestoreSummarizedExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SummaryCategoryOption {
  id: SummaryExportCategory;
  title: string;
  subtitle: string;
  collectionBadge: string;
  supportsCsv: boolean;
  icon: React.ReactNode;
}

const SUMMARY_CATEGORIES: SummaryCategoryOption[] = [
  {
    id: 'all_summaries',
    title: 'All Summarized Data Bundle (Master Summary)',
    subtitle: 'Complete package of Project/Task Rollup Summaries, Financial Atomic Summaries, Years Metadata, Layout Unit Summaries, and Unit Image Summaries.',
    collectionBadge: 'All Summary Collections',
    supportsCsv: false,
    icon: <Database className="w-4 h-4 text-blue-500" />,
  },
  {
    id: 'project_task_summaries',
    title: 'Project & Task Rollup Summaries',
    subtitle: 'Embedded taskSummaries[], taskCount, computedTakStart/Compl/Opening, and plan/actual progress stored on taka_projects.',
    collectionBadge: 'taka_projects.taskSummaries',
    supportsCsv: true,
    icon: <Layers className="w-4 h-4 text-indigo-500" />,
  },
  {
    id: 'financial_summaries',
    title: 'Financial & Budget Atomic Summaries',
    subtitle: 'Aggregated financial metrics (totalBudget, totalApproved, totalActualPaid, totalForecastPaid, totalBalance, byStore, byYear).',
    collectionBadge: 'taka_projects.financial',
    supportsCsv: true,
    icon: <DollarSign className="w-4 h-4 text-emerald-500" />,
  },
  {
    id: 'layout_unit_summaries',
    title: 'Layout & Picture Mapping Unit Summaries',
    subtitle: 'Summarized unit mapping records, floor version counts, dynamic status rollups, and sales/profit efficiency metrics.',
    collectionBadge: 'picture_mapping_config',
    supportsCsv: true,
    icon: <MapPin className="w-4 h-4 text-amber-500" />,
  },
  {
    id: 'years_config_meta',
    title: 'Fiscal Years Fingerprint & Config Metadata',
    subtitle: 'Server synchronization timestamps per fiscal year (years_meta), config version counters, locations, parties, and exchange rates.',
    collectionBadge: 'taka_config/years_meta',
    supportsCsv: false,
    icon: <Calendar className="w-4 h-4 text-purple-500" />,
  },
  {
    id: 'unit_images_summaries',
    title: 'Unit Attached Links & Images Summary',
    subtitle: 'Cloud-synced unit image & link registries across HCM and HN stores.',
    collectionBadge: 'taka_unit_images',
    supportsCsv: false,
    icon: <ImageIcon className="w-4 h-4 text-cyan-500" />,
  },
];

export const FirestoreSummarizedExportModal: React.FC<FirestoreSummarizedExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const projects = useAppStore((state) => state.projects);
  const [selectedCategory, setSelectedCategory] = useState<SummaryExportCategory>('all_summaries');
  const [sourceMode, setSourceMode] = useState<'firestore_server' | 'local_cache'>('firestore_server');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [busyFormat, setBusyFormat] = useState<'json' | 'csv' | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const availableYears = useMemo(() => {
    const set = new Set<string>(['2024', '2025', '2026', '2027']);
    (projects || []).forEach((p) => {
      if (p?.year && !p.isDeleted) set.add(String(p.year).trim());
    });
    return Array.from(set).sort();
  }, [projects]);

  const localStats = useMemo(() => {
    const active = (projects || []).filter((p) => !p.isDeleted);
    const totalSummaries = active.reduce(
      (acc, p) => acc + (Array.isArray(p.taskSummaries) ? p.taskSummaries.length : 0),
      0
    );
    const withFinancial = active.filter((p) => p.financial || p.budget || p.actual).length;
    return {
      projectsCount: active.length,
      totalSummaries,
      withFinancial,
    };
  }, [projects]);

  const zInfo = useOverlayStack({
    layer: 'MODAL_BASE',
    isOpen,
    onClose,
    closeOnTabChange: true,
  });

  if (!isOpen) return null;

  const activeCategoryObj =
    SUMMARY_CATEGORIES.find((c) => c.id === selectedCategory) || SUMMARY_CATEGORIES[0];

  const handleDownload = async (format: 'json' | 'csv', overrideCategory?: SummaryExportCategory) => {
    const targetCategory = overrideCategory || selectedCategory;
    setBusyFormat(format);
    try {
      const res = await executeDownloadFirestoreSummaries({
        category: targetCategory,
        sourceMode,
        yearFilter,
        storeFilter,
        format,
      });
      useAppStore.getState().setToast({
        title: 'Summary Data Downloaded',
        message: `Exported ${res.recordCount} summarized records to ${res.fileName}.`,
        type: 'success',
      });
    } catch (err: any) {
      console.error('[FirestoreSummarizedExportModal] Download failed:', err);
      useAppStore.getState().setToast({
        title: 'Export Failed',
        message: err?.message || 'Failed to download summarized data from Firestore.',
        type: 'error',
      });
    } finally {
      setBusyFormat(null);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${zInfo.zClass} flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto animate-in fade-in duration-150`}
      style={{ zIndex: zInfo.zValue || 180000 }}
      onClick={onClose}
    >
      <Draggable
        disabled={typeof window !== 'undefined' && window.innerWidth < 768}
        handle=".modal-handle"
        bounds="parent"
        nodeRef={nodeRef}
        cancel="button, input, select"
      >
        <div
          ref={nodeRef}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-[96vw] max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-[#333336] overflow-hidden"
        >
          {/* Draggable Header */}
          <div className="modal-handle cursor-grab active:cursor-grabbing px-4 py-3.5 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/90 dark:bg-[#18181a] select-none shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="p-2 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-[#8ab4f8] shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-slate-900 dark:text-[#e3e3e3] truncate">
                  Download Firestore Summarized Data
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Export aggregated rollups, task summaries, financial metrics, and layout summaries
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors active:scale-95 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            {/* Quick Summary Telemetry Bar */}
            <div className="grid grid-cols-3 gap-2.5 bg-slate-50 dark:bg-[#161618] p-3 rounded-xl border border-slate-200/80 dark:border-[#2c2c2f]">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Active Projects
                </span>
                <span className="text-base font-extrabold font-mono text-slate-800 dark:text-slate-100">
                  {localStats.projectsCount}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Embedded Task Summaries
                </span>
                <span className="text-base font-extrabold font-mono text-blue-600 dark:text-[#8ab4f8]">
                  {localStats.totalSummaries}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Financial Rollup Records
                </span>
                <span className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  {localStats.withFinancial}
                </span>
              </div>
            </div>

            {/* Source Mode & Scope Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Data Source
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-[#252528] p-1 rounded-lg border border-slate-200 dark:border-[#38383c]">
                  <button
                    type="button"
                    onClick={() => setSourceMode('firestore_server')}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer',
                      sourceMode === 'firestore_server'
                        ? 'bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-[#8ab4f8] shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                    title="Fetch fresh summarized data directly from Firestore Server"
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>Firestore Live</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('local_cache')}
                    className={cn(
                      'px-2 py-1.5 rounded-md text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer',
                      sourceMode === 'local_cache'
                        ? 'bg-white dark:bg-[#1e1e20] text-emerald-600 dark:text-emerald-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    )}
                    title="Export immediately from local Dexie/Zustand cache (0 Firestore Reads)"
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>0-Read Cache</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Fiscal Year Filter
                </label>
                <select
                  value={yearFilter}
                  onChange={(e) => setYearFilter(e.target.value)}
                  className="w-full h-[36px] px-3 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Years</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Year {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                  Store Branch Filter
                </label>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="w-full h-[36px] px-3 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Stores (HCM & HN)</option>
                  <option value="HCM">HCM Store</option>
                  <option value="HN">HN Store</option>
                </select>
              </div>
            </div>

            {/* Category Selection List */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Select Summarized Dataset to Export
              </div>
              <div className="grid grid-cols-1 gap-2">
                {SUMMARY_CATEGORIES.map((cat) => {
                  const isSelected = selectedCategory === cat.id;
                  return (
                    <div
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={cn(
                        'p-3 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 select-none',
                        isSelected
                          ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30 ring-1 ring-blue-500'
                          : 'border-slate-200 dark:border-[#333336] bg-white dark:bg-[#1a1a1d] hover:border-blue-300 dark:hover:border-blue-800'
                      )}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 dark:bg-[#252528] shrink-0">
                          {cat.icon}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {cat.title}
                            </span>
                            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#28282c] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-[#3a3a3e]">
                              {cat.collectionBadge}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                            {cat.subtitle}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-slate-200 dark:border-[#333336] bg-slate-50/90 dark:bg-[#18181a] flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-full sm:max-w-[45%]">
              Selected: <strong className="text-slate-800 dark:text-slate-200">{activeCategoryObj.title}</strong>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#28282a] transition-colors active:scale-95 cursor-pointer"
              >
                Close
              </button>

              {activeCategoryObj.supportsCsv && (
                <button
                  type="button"
                  disabled={busyFormat !== null}
                  onClick={() => handleDownload('csv')}
                  className="px-3.5 py-2 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 touch-manipulation disabled:opacity-50 cursor-pointer"
                >
                  {busyFormat === 'csv' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4" />
                  )}
                  <span>Download .CSV</span>
                </button>
              )}

              <button
                type="button"
                disabled={busyFormat !== null}
                onClick={() => handleDownload('json')}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 touch-manipulation disabled:opacity-50 cursor-pointer"
              >
                {busyFormat === 'json' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileJson className="w-4 h-4" />
                )}
                <span>Download .JSON</span>
              </button>
            </div>
          </div>
        </div>
      </Draggable>
    </div>,
    document.body
  );
};

export default FirestoreSummarizedExportModal;
