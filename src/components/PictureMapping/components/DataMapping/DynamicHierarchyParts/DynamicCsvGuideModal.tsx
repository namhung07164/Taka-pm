import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Check, Copy, Download, GripHorizontal, Search, X } from 'lucide-react';
import { DynamicUnitSummaryItem } from '../../../lib/dynamicRuleMatcher';
import { HATCH_PATTERNS, PRESET_SYMBOLS } from '../../../../LayoutTabParts/layoutPatternUtils';
import {
  DYNAMIC_OPERATOR_DICTIONARY,
  DYNAMIC_RULE_FIELD_DICTIONARY,
} from './dynamicCsvService';

interface DynamicCsvGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  store: string;
  location: string;
  effectiveYear: string;
  summaryList: DynamicUnitSummaryItem[];
  onDownloadTemplate: () => void;
}

export const DynamicCsvGuideModal = memo(function DynamicCsvGuideModal({
  isOpen,
  onClose,
  store,
  location,
  effectiveYear,
  summaryList,
  onDownloadTemplate,
}: DynamicCsvGuideModalProps) {
  const [activeGuideTab, setActiveGuideTab] = useState<'fields' | 'operators' | 'live_data'>('fields');
  const [guideSearch, setGuideSearch] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Draggable modal state (Rule 11)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  const handlePointerDownHeader = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest('button, input, select')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: dragOffset.x,
        origY: dragOffset.y,
      };
    },
    [dragOffset.x, dragOffset.y]
  );

  const handlePointerMoveHeader = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    setDragOffset({
      x: dragStartRef.current.origX + (e.clientX - dragStartRef.current.startX),
      y: dragStartRef.current.origY + (e.clientY - dragStartRef.current.startY),
    });
  }, []);

  const handlePointerUpHeader = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const handleCopyFieldKey = useCallback((key: string) => {
    navigator.clipboard?.writeText(key).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1400);
  }, []);

  const liveSamplesByField = useMemo(() => {
    const map = new Map<string, string>();
    DYNAMIC_RULE_FIELD_DICTIONARY.forEach((f) => {
      const vals = new Set<string>();
      for (let i = 0; i < summaryList.length && vals.size < 6; i++) {
        const item = summaryList[i] as any;
        const raw =
          f.key === 'unit'
            ? item.unitName
            : f.key === 'floor'
            ? item.location || item.floor
            : item[f.key];
        if (raw !== undefined && raw !== null && String(raw).trim() !== '' && String(raw) !== '0') {
          vals.add(String(raw).trim());
        }
      }
      map.set(f.key, vals.size > 0 ? Array.from(vals).join(' | ') : '');
    });
    return map;
  }, [summaryList]);

  const filteredFields = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    if (!q) return DYNAMIC_RULE_FIELD_DICTIONARY;
    return DYNAMIC_RULE_FIELD_DICTIONARY.filter(
      (f) =>
        f.key.toLowerCase().includes(q) ||
        f.label.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.sampleValues.toLowerCase().includes(q)
    );
  }, [guideSearch]);

  const filteredLiveUnits = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    if (!q) return summaryList;
    return summaryList.filter(
      (u) =>
        String(u.unitName || '').toLowerCase().includes(q) ||
        String(u.appProjectCode || '').toLowerCase().includes(q) ||
        String(u.appProjectName || '').toLowerCase().includes(q) ||
        String(u.appProjectMdStatus || '').toLowerCase().includes(q) ||
        String(u.appProjectStatus || '').toLowerCase().includes(q) ||
        String(u.brandName || '').toLowerCase().includes(q) ||
        String(u.matchedGroupName || '').toLowerCase().includes(q)
    );
  }, [guideSearch, summaryList]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-6">
      <div
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
        className="w-full max-w-6xl max-h-[88dvh] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-slate-200"
      >
        {/* Draggable Modal Header (Rule 11) */}
        <div
          onPointerDown={handlePointerDownHeader}
          onPointerMove={handlePointerMoveHeader}
          onPointerUp={handlePointerUpHeader}
          className="modal-handle px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <GripHorizontal size={16} className="text-slate-500 shrink-0" />
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 shrink-0">
              <BookOpen size={15} />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                Sheet 2: Dynamic CSV Import Field Dictionary &amp; Live Data Guide [{store} • {location} • {effectiveYear}]
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                Full reference of all {DYNAMIC_RULE_FIELD_DICTIONARY.length} supported Rule_Field codes, operators, hatch patterns, symbols, and live floor unit data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer active:scale-95"
            >
              <Download size={13} /> Download Template .XLSX (with Sheet 2)
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Sub-navigation & Search */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveGuideTab('fields')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeGuideTab === 'fields'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              1. Rule_Field Dictionary ({DYNAMIC_RULE_FIELD_DICTIONARY.length} Fields)
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('operators')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeGuideTab === 'operators'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              2. CSV Columns, Operators, Hatch &amp; Symbols
            </button>
            <button
              type="button"
              onClick={() => setActiveGuideTab('live_data')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeGuideTab === 'live_data'
                  ? 'bg-brand-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              3. Live Floor Unit Data [{store} • {location} • {effectiveYear}] ({summaryList.length} Units)
            </button>
          </div>

          <div className="relative w-64">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={guideSearch}
              onChange={(e) => setGuideSearch(e.target.value)}
              placeholder="Search field key, label, unit, brand..."
              className="w-full pl-8 pr-7 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500"
            />
            {guideSearch && (
              <button
                type="button"
                onClick={() => setGuideSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 custom-scrollbar">
          {activeGuideTab === 'fields' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-800/50 text-xs text-indigo-200">
                <strong>Tip:</strong> In your CSV/Excel file, you can enter either the exact{' '}
                <code className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono">Rule_Field</code> key (e.g.{' '}
                <code className="font-mono text-emerald-300">appProjectMdStatus</code>) OR its UI label (e.g.{' '}
                <code className="font-mono text-emerald-300">App: MD Status</code>). Click any key below to copy.
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px] uppercase">
                      <th className="py-2.5 px-3 font-bold">Rule_Field Key</th>
                      <th className="py-2.5 px-3 font-bold">UI Display Label</th>
                      <th className="py-2.5 px-3 font-bold">Category</th>
                      <th className="py-2.5 px-3 font-bold">Operators</th>
                      <th className="py-2.5 px-3 font-bold">Description</th>
                      <th className="py-2.5 px-3 font-bold">Standard / Live Floor Values</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredFields.map((f) => {
                      const liveSample = liveSamplesByField.get(f.key);
                      return (
                        <tr key={f.key} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-amber-300 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleCopyFieldKey(f.key)}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 hover:border-amber-400 transition-colors cursor-pointer"
                              title="Click to copy Rule_Field key"
                            >
                              <span>{f.key}</span>
                              {copiedKey === f.key ? (
                                <Check size={11} className="text-emerald-400" />
                              ) : (
                                <Copy size={11} className="text-slate-500" />
                              )}
                            </button>
                          </td>
                          <td className="py-2 px-3 font-semibold text-white whitespace-nowrap">{f.label}</td>
                          <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{f.category}</td>
                          <td className="py-2 px-3 font-mono text-[11px] text-cyan-300 whitespace-nowrap">
                            {f.operators}
                          </td>
                          <td className="py-2 px-3 text-slate-300">{f.description}</td>
                          <td className="py-2 px-3 text-[11px]">
                            <div className="text-slate-400">
                              <span className="font-semibold text-slate-300">Samples:</span> {f.sampleValues}
                            </div>
                            {liveSample && (
                              <div className="text-emerald-400 font-mono mt-0.5">
                                <span className="font-sans font-bold text-emerald-300">Live ({location}):</span>{' '}
                                {liveSample}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeGuideTab === 'operators' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-slate-800 rounded-xl p-3.5 bg-slate-950/60 space-y-2.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-400">
                  Supported Rule_Operator Values
                </h4>
                <div className="divide-y divide-slate-800 text-xs">
                  {DYNAMIC_OPERATOR_DICTIONARY.map((op) => (
                    <div key={op.operator} className="py-2 flex items-start gap-3">
                      <code className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold shrink-0">
                        {op.operator}
                      </code>
                      <div>
                        <div className="font-semibold text-white">{op.label}</div>
                        <div className="text-slate-400 text-[11px]">{op.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div className="border border-slate-800 rounded-xl p-3.5 bg-slate-950/60 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                    Supported Hatch_Pattern Codes
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {HATCH_PATTERNS.map((pat) => (
                      <div
                        key={pat.id}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <code className="text-purple-300 font-mono font-bold">{pat.id}</code>
                          <div className="text-[10px] text-slate-400">{pat.label}</div>
                        </div>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-950 text-slate-300">
                          {pat.iconLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-800 rounded-xl p-3.5 bg-slate-950/60 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    Supported Preset Symbols (or custom 1–4 chars)
                  </h4>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                    {PRESET_SYMBOLS.map((s) => (
                      <div
                        key={s.symbol}
                        className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center gap-2"
                      >
                        <span className="w-6 h-6 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold flex items-center justify-center shrink-0">
                          {s.symbol}
                        </span>
                        <span className="text-[10px] text-slate-300 truncate" title={s.label}>
                          {s.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeGuideTab === 'live_data' && (
            <div className="border border-slate-800 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[10px] uppercase whitespace-nowrap">
                    <th className="py-2 px-2.5">Unit (unit)</th>
                    <th className="py-2 px-2.5">Floor (floor)</th>
                    <th className="py-2 px-2.5">Size m² (size)</th>
                    <th className="py-2 px-2.5">App Code (appProjectCode)</th>
                    <th className="py-2 px-2.5">App Name (appProjectName)</th>
                    <th className="py-2 px-2.5">App MD Status (appProjectMdStatus)</th>
                    <th className="py-2 px-2.5">App Status (appProjectStatus)</th>
                    <th className="py-2 px-2.5">App Party (appProjectParty)</th>
                    <th className="py-2 px-2.5">Shop Type (appProjectShopType)</th>
                    <th className="py-2 px-2.5">Matched Group</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredLiveUnits.map((u) => (
                    <tr key={u.unitId} className="hover:bg-slate-800/50 whitespace-nowrap">
                      <td className="py-1.5 px-2.5 font-mono font-bold text-amber-300">{u.unitName}</td>
                      <td className="py-1.5 px-2.5 text-slate-300">{u.location || location}</td>
                      <td className="py-1.5 px-2.5 font-mono text-slate-300">
                        {Number(u.sizeM2 || u.size || 0).toFixed(1)}
                      </td>
                      <td className="py-1.5 px-2.5 font-mono text-cyan-300">{u.appProjectCode || '-'}</td>
                      <td className="py-1.5 px-2.5 text-white font-medium">{u.appProjectName || u.brandName || '-'}</td>
                      <td className="py-1.5 px-2.5 text-emerald-300">{u.appProjectMdStatus || u.mdStatus || '-'}</td>
                      <td className="py-1.5 px-2.5 text-slate-300">{u.appProjectStatus || '-'}</td>
                      <td className="py-1.5 px-2.5 text-slate-300">{u.appProjectParty || '-'}</td>
                      <td className="py-1.5 px-2.5 text-slate-300">{u.appProjectShopType || '-'}</td>
                      <td className="py-1.5 px-2.5 font-semibold text-brand-400">
                        {u.matchedGroupName || 'Unassigned'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
});
