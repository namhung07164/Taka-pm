import React, { useRef, useState, useMemo } from 'react';
import Draggable from 'react-draggable';
import { AlertOctagon, Download, X, Search, ShieldAlert, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { ImportValidationResult } from './importValidator';
import { downloadCSV } from '../../lib/csvUtils';

interface ImportErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  validationResult: ImportValidationResult;
  errorReportCSV: string;
  fileName?: string;
}

export function ImportErrorModal({
  isOpen,
  onClose,
  validationResult,
  errorReportCSV,
  fileName = 'taka_tasks_import_errors.csv'
}: ImportErrorModalProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredErrors = useMemo(() => {
    return validationResult.errors.filter(err => {
      if (filterType !== 'ALL' && err.errorType !== filterType) {
        return false;
      }
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        String(err.rowNumber).includes(term) ||
        err.projectCode.toLowerCase().includes(term) ||
        err.taskName.toLowerCase().includes(term) ||
        err.message.toLowerCase().includes(term) ||
        err.field.toLowerCase().includes(term)
      );
    });
  }, [validationResult.errors, filterType, searchTerm]);

  const handleDownload = () => {
    if (!errorReportCSV) return;
    downloadCSV(errorReportCSV, fileName);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <Draggable
        disabled={typeof window !== 'undefined' && window.innerWidth < 768}
        handle=".modal-handle"
        bounds="parent"
        nodeRef={nodeRef}
        cancel="button, input, select"
      >
        <div
          ref={nodeRef}
          className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl border border-rose-300 dark:border-rose-900/60 flex flex-col overflow-hidden text-slate-800 dark:text-slate-100 animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Draggable Header */}
          <div className="modal-handle cursor-grab active:cursor-grabbing px-5 py-4 bg-gradient-to-r from-rose-500/10 via-rose-500/5 to-transparent dark:from-rose-950/40 dark:via-rose-950/20 border-b border-rose-200 dark:border-rose-900/50 flex items-center justify-between gap-3 shrink-0 select-none">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 shadow-xs">
                <AlertOctagon className="w-5 h-5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base sm:text-lg text-rose-600 dark:text-rose-400 tracking-tight leading-tight">
                    CSV Import Validation Failed
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                    Import Blocked ({validationResult.errorCount} {validationResult.errorCount === 1 ? 'issue' : 'issues'})
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  Database protected • No records were changed or saved
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Bar */}
          <div className="px-5 py-3 bg-slate-50/80 dark:bg-[#252528]/80 border-b border-slate-200/80 dark:border-[#38383a] grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-xl bg-white dark:bg-[#1a1a1c] border border-slate-200 dark:border-[#333336] flex flex-col">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Total Rows Checked</span>
              <span className="font-mono font-extrabold text-base sm:text-lg text-slate-700 dark:text-slate-200">{validationResult.totalRows}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 flex flex-col">
              <span className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Rows With Errors</span>
              <span className="font-mono font-extrabold text-base sm:text-lg text-rose-600 dark:text-rose-400">{validationResult.errorRowNumbers.size}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 flex flex-col">
              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">Valid Rows</span>
              <span className="font-mono font-extrabold text-base sm:text-lg text-emerald-600 dark:text-emerald-400">{validationResult.validRowsCount}</span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 flex flex-col">
              <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Total Violations</span>
              <span className="font-mono font-extrabold text-base sm:text-lg text-amber-600 dark:text-amber-400">{validationResult.errorCount}</span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="px-5 py-2.5 border-b border-slate-200 dark:border-[#38383a] flex flex-wrap items-center justify-between gap-2.5 bg-white dark:bg-[#1e1e20]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search row, task, project, message..."
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#252528] focus:outline-hidden focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto text-xs font-semibold">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  filterType === 'ALL'
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 border-slate-800 dark:border-slate-200'
                    : 'bg-white dark:bg-[#28282a] text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                All ({validationResult.errors.length})
              </button>
              {validationResult.errorSummaryByType['DUPLICATE'] ? (
                <button
                  onClick={() => setFilterType('DUPLICATE')}
                  className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterType === 'DUPLICATE'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900'
                  }`}
                >
                  Duplicates ({validationResult.errorSummaryByType['DUPLICATE']})
                </button>
              ) : null}
              {validationResult.errorSummaryByType['MISSING_FIELD'] ? (
                <button
                  onClick={() => setFilterType('MISSING_FIELD')}
                  className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterType === 'MISSING_FIELD'
                      ? 'bg-amber-600 text-white border-amber-600'
                      : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                  }`}
                >
                  Missing Fields ({validationResult.errorSummaryByType['MISSING_FIELD']})
                </button>
              ) : null}
              {validationResult.errorSummaryByType['DATE_LOGIC'] || validationResult.errorSummaryByType['INVALID_DATE'] ? (
                <button
                  onClick={() => setFilterType('DATE_LOGIC')}
                  className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                    filterType === 'DATE_LOGIC'
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900'
                  }`}
                >
                  Date Bugs
                </button>
              ) : null}
            </div>
          </div>

          {/* Error Table Scroll Container */}
          <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[460px] p-4">
            {filteredErrors.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No errors matching your filter.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#2e2e32] border border-slate-200 dark:border-[#38383a] rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1c]">
                {filteredErrors.map((err, i) => {
                  let badgeColor = 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800';
                  if (err.errorType === 'DUPLICATE') {
                    badgeColor = 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800';
                  } else if (err.errorType === 'DATE_LOGIC' || err.errorType === 'INVALID_DATE') {
                    badgeColor = 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950/80 dark:text-purple-300 dark:border-purple-800';
                  } else if (err.errorType === 'MISSING_FIELD') {
                    badgeColor = 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-800';
                  } else if (err.errorType === 'PROJECT_NOT_FOUND') {
                    badgeColor = 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950/80 dark:text-blue-300 dark:border-blue-800';
                  }

                  return (
                    <div
                      key={`err-${err.rowNumber}-${err.field}-${i}`}
                      className="p-3.5 hover:bg-slate-50 dark:hover:bg-[#222225] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="px-2 py-1 rounded-md font-mono font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
                          Row {err.rowNumber}
                        </span>

                        <div className="flex flex-col gap-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {err.taskName && err.taskName !== '(empty)' ? err.taskName : 'Task without name'}
                            </span>
                            {err.projectCode && (
                              <span className="font-mono px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px]">
                                {err.projectCode} {err.projectYear ? `(${err.projectYear})` : ''}
                              </span>
                            )}
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide uppercase ${badgeColor}`}>
                              {err.errorType.replace('_', ' ')}
                            </span>
                          </div>

                          <p className="text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                            {err.message}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0 font-medium text-[11px] text-slate-400">
                        Field: <span className="font-bold text-slate-600 dark:text-slate-300">{err.field}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Footer Actions */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#18181a] border-t border-slate-200 dark:border-[#333336] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Correct the issues in your file, then try importing again.</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownload}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Download full Error Report as CSV file"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export Error Report (CSV)</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs active:scale-95 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </Draggable>
    </div>
  );
}
