import React, { ReactNode, useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { Portal } from './Portal';
import { AuditLog } from '../types';
import { formatDisplayDateTime } from '../lib/utils';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { 
  X, GripHorizontal, ArrowRight, Copy, Check, ShieldCheck, 
  Layers, Clock, User, FileText, Search, Code2, Columns2, 
  PlusCircle, MinusCircle, RefreshCw
} from 'lucide-react';

interface AuditDiffViewerModalProps {
  isOpen: boolean;
  log: AuditLog | null;
  onClose: () => void;
}

export function AuditDiffViewerModal({ isOpen, log, onClose }: AuditDiffViewerModalProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'visual' | 'side-by-side' | 'raw'>('visual');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !log) return null;

  const handleCopyJson = () => {
    try {
      navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isFinancialKey = (key: string) => {
    const k = key.toLowerCase();
    return k.includes('budget') || k.includes('cost') || k.includes('fee') || k.includes('amount') || k.includes('price') || k.includes('total');
  };

  const formatValue = (key: string, val: any): React.ReactNode => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 dark:text-slate-500 italic font-mono text-xs">null</span>;
    }
    if (typeof val === 'boolean') {
      return (
        <span className={`inline-flex px-1.5 py-0.5 rounded text-[11px] font-bold ${val ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
          {val ? 'TRUE' : 'FALSE'}
        </span>
      );
    }
    if (typeof val === 'number') {
      if (isFinancialKey(key) || Math.abs(val) >= 10000) {
        return (
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
            {new Intl.NumberFormat('vi-VN').format(val)} <span className="text-[11px] text-slate-500 font-normal">₫</span>
          </span>
        );
      }
      return <span className="font-mono text-slate-900 dark:text-slate-100 font-semibold">{val}</span>;
    }
    if (typeof val === 'string') {
      // Check for ISO Date
      if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
        return <span className="font-mono text-indigo-600 dark:text-indigo-400 font-medium">{val}</span>;
      }
      // Status badges
      const lower = val.toLowerCase();
      if (lower === 'completed' || lower === 'finished' || lower === 'done' || lower === 'active') {
        return <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 font-semibold text-xs">{val}</span>;
      }
      if (lower === 'in progress' || lower === 'doing' || lower === 'ongoing') {
        return <span className="inline-flex px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 font-semibold text-xs">{val}</span>;
      }
      if (lower === 'pending' || lower === 'waiting' || lower === 'delayed') {
        return <span className="inline-flex px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold text-xs">{val}</span>;
      }
      return <span className="text-slate-800 dark:text-slate-200 break-words">{val}</span>;
    }
    if (typeof val === 'object') {
      return (
        <pre className="bg-slate-50 dark:bg-[#121214] p-1.5 rounded text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto max-h-32">
          {JSON.stringify(val, null, 2)}
        </pre>
      );
    }
    return String(val);
  };

  // Compile all changed keys
  const prevObj = log.previousData || {};
  const currentObj = log.data || {};
  const allKeysSet = new Set<string>();

  if (typeof prevObj === 'object' && prevObj !== null) {
    Object.keys(prevObj).forEach(k => allKeysSet.add(k));
  }
  if (typeof currentObj === 'object' && currentObj !== null) {
    Object.keys(currentObj).forEach(k => allKeysSet.add(k));
  }

  const allKeys = Array.from(allKeysSet).filter(k => 
    !searchTerm || k.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getActionBadgeClass = (action: string) => {
    switch (action) {
      case 'CREATE': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'UPDATE': return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'DELETE': return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      default: return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  const getEntityBadgeClass = (entity?: string) => {
    switch (entity) {
      case 'project': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-800';
      case 'task': return 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800';
      case 'cost': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'user': return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800';
      case 'delegation': return 'bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300 dark:border-orange-800';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700';
    }
  };

  return (
    <Portal>
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-2 md:p-6"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <Draggable 
          disabled={typeof window !== 'undefined' && window.innerWidth < 768} 
          handle=".modal-handle" 
          bounds="parent" 
          nodeRef={nodeRef} 
          cancel="button, input, select, textarea, pre"
        >
          <div 
            ref={nodeRef} 
            className="bg-white dark:bg-[#18181a] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-[#333336] animate-in zoom-in-95 duration-200 pointer-events-auto"
          >
            {/* Modal Draggable Header */}
            <div className="modal-handle cursor-grab active:cursor-grabbing px-5 py-3.5 bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#2e2e32] flex items-center justify-between select-none">
              <div className="flex items-center gap-2">
                <GripHorizontal className="w-4 h-4 text-slate-400" />
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="text-base font-bold text-slate-800 dark:text-white">
                    Audit Event Diff Viewer
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#3a3a3e] bg-white dark:bg-[#252528] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#2e2e32] transition-colors active:scale-95"
                  title="Copy full JSON event"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <button
                  onClick={onClose}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#2e2e32] transition-colors active:scale-95"
                  title="Close (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Event Metadata Bar */}
            <div className="px-5 py-3 bg-slate-100/70 dark:bg-[#141416] border-b border-slate-200 dark:border-[#2e2e32] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full font-bold border text-[11px] ${getActionBadgeClass(log.action)}`}>
                  {log.action}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full font-bold border uppercase text-[10px] ${getEntityBadgeClass(log.entityType)}`}>
                  {log.entityType || 'Document'}
                </span>
                <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 ml-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold">{log.userEmail}</span>
                  <span className="text-slate-400 text-[10px] font-mono">({log.userId})</span>
                </div>
              </div>

              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{formatDisplayDateTime(new Date(log.timestamp).toISOString())}</span>
                </div>
                <div className="hidden sm:flex items-center gap-1 font-mono text-[11px] text-slate-500 max-w-[220px] truncate" title={log.docPath}>
                  <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{log.docId}</span>
                </div>
              </div>
            </div>

            {/* Controls & View Mode Tabs */}
            <div className="px-5 py-2.5 bg-white dark:bg-[#18181a] border-b border-slate-200 dark:border-[#28282b] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center bg-slate-100 dark:bg-[#222226] p-1 rounded-xl w-full sm:w-auto">
                <button
                  onClick={() => setViewMode('visual')}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'visual'
                      ? 'bg-white dark:bg-[#2e2e34] text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Visual Changes</span>
                </button>
                <button
                  onClick={() => setViewMode('side-by-side')}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'side-by-side'
                      ? 'bg-white dark:bg-[#2e2e34] text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Columns2 className="w-3.5 h-3.5" />
                  <span>Side-by-Side</span>
                </button>
                <button
                  onClick={() => setViewMode('raw')}
                  className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    viewMode === 'raw'
                      ? 'bg-white dark:bg-[#2e2e34] text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Raw Event</span>
                </button>
              </div>

              {viewMode !== 'raw' && (
                <div className="relative w-full sm:w-64">
                  <DebouncedSearchInput
                    placeholder="Filter field changes..."
                    value={searchTerm}
                    onChange={(val) => setSearchTerm(val)}
                    debounceMs={200}
                    className="w-full"
                  />
                </div>
              )}
            </div>

            {/* Main Diff Content Container */}
            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-4">
              {/* TAB 1: VISUAL FIELD CHANGES */}
              {viewMode === 'visual' && (
                <div className="space-y-3">
                  {allKeys.length === 0 ? (
                    <div className="text-center py-10 text-slate-400 text-sm">
                      No matching field differences found.
                    </div>
                  ) : (
                    allKeys.map((key) => {
                      const prevVal = prevObj[key];
                      const nextVal = currentObj[key];
                      const hasPrev = key in prevObj;
                      const hasNext = key in currentObj;

                      const isChanged = hasPrev && hasNext && JSON.stringify(prevVal) !== JSON.stringify(nextVal);
                      const isAdded = !hasPrev && hasNext;
                      const isRemoved = hasPrev && !hasNext;

                      return (
                        <div 
                          key={key} 
                          className="bg-slate-50 dark:bg-[#1e1e22] border border-slate-200 dark:border-[#2e2e32] rounded-xl p-3.5 transition-all hover:border-indigo-200 dark:hover:border-indigo-900"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-[#28282c] px-2 py-0.5 rounded border border-slate-200 dark:border-[#38383c]">
                                {key}
                              </span>
                              {isAdded && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded">
                                  <PlusCircle className="w-3 h-3" /> ADDED
                                </span>
                              )}
                              {isRemoved && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/60 px-1.5 py-0.5 rounded">
                                  <MinusCircle className="w-3 h-3" /> REMOVED
                                </span>
                              )}
                              {isChanged && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                                  <RefreshCw className="w-3 h-3" /> MODIFIED
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Comparison Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1 text-xs">
                            {/* Before */}
                            <div className={`p-2.5 rounded-lg border ${
                              isChanged || isRemoved 
                                ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 text-rose-900 dark:text-rose-200' 
                                : 'bg-white dark:bg-[#252528] border-slate-200 dark:border-[#333336]'
                            }`}>
                              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center justify-between">
                                <span>Before</span>
                                {isChanged && <span className="text-rose-500 font-mono">- OLD</span>}
                              </div>
                              <div className="break-words">
                                {hasPrev ? formatValue(key, prevVal) : <span className="text-slate-400 italic">Not set</span>}
                              </div>
                            </div>

                            {/* After */}
                            <div className={`p-2.5 rounded-lg border ${
                              isChanged || isAdded 
                                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200' 
                                : 'bg-white dark:bg-[#252528] border-slate-200 dark:border-[#333336]'
                            }`}>
                              <div className="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center justify-between">
                                <span>After</span>
                                {(isChanged || isAdded) && <span className="text-emerald-500 font-mono">+ NEW</span>}
                              </div>
                              <div className="break-words">
                                {hasNext ? formatValue(key, nextVal) : <span className="text-slate-400 italic">Removed</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: SIDE-BY-SIDE JSON */}
              {viewMode === 'side-by-side' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-rose-400 font-bold">
                      <span>PREVIOUS STATE (BEFORE)</span>
                      <span className="text-[10px] text-slate-400">Snapshot</span>
                    </div>
                    <pre>{JSON.stringify(prevObj, null, 2)}</pre>
                  </div>

                  <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-emerald-400 font-bold">
                      <span>CURRENT STATE (AFTER)</span>
                      <span className="text-[10px] text-slate-400">Committed Payload</span>
                    </div>
                    <pre>{JSON.stringify(currentObj, null, 2)}</pre>
                  </div>
                </div>
              )}

              {/* TAB 3: RAW EVENT INSPECTOR */}
              {viewMode === 'raw' && (
                <div className="bg-slate-950 text-emerald-400 rounded-xl p-4 font-mono text-xs overflow-x-auto border border-slate-800 shadow-inner max-h-[50vh]">
                  <pre>{JSON.stringify(log, null, 2)}</pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 dark:bg-[#1a1a1d] border-t border-slate-200 dark:border-[#28282b] flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Takashimaya Immutable Audit Trail • Enterprise Security
              </span>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 dark:bg-slate-700 text-white rounded-xl text-xs font-bold hover:bg-slate-900 dark:hover:bg-slate-600 transition-colors active:scale-95 touch-manipulation"
              >
                Close Viewer
              </button>
            </div>
          </div>
        </Draggable>
      </div>
    </Portal>
  );
}
