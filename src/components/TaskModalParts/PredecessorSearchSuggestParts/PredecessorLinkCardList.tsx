import React, { memo, useEffect, useRef, useState } from 'react';
import { PredecessorType } from '../../../types';
import { cn } from '../../../lib/utils';
import { X, Plus, Minus, ExternalLink } from 'lucide-react';
import { LinkItem } from './predecessorSuggestUtils';

export const LagInput = memo(function LagInput({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  onCommit: (n: number) => void;
}) {
  const fmt = (n: number) => (n > 0 ? `+${n}` : String(n));
  const [txt, setTxt] = useState(fmt(value));
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!isTypingRef.current) {
      setTxt(fmt(value));
    }
  }, [value]);

  const commit = () => {
    isTypingRef.current = false;
    const n = parseFloat(txt.replace(',', '.').replace('−', '-'));
    if (isNaN(n)) {
      setTxt(fmt(value));
      return;
    }
    const r = Math.round(n * 100) / 100;
    if (r !== value) onCommit(r);
    else setTxt(fmt(value));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={txt}
      disabled={disabled}
      onFocus={(e: any) => {
        isTypingRef.current = true;
        e.target.select?.();
      }}
      onChange={(e: any) => setTxt(e.target.value.replace(/[^0-9+\-−.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e: any) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          commit();
          e.target.blur?.();
        }
      }}
      title="Enter lag days, e.g. +2 or -1"
      className={cn(
        'h-6 w-12 rounded-md border border-slate-200/80 bg-white dark:border-[#38383a] dark:bg-[#18181a] text-center font-mono text-xs font-bold outline-none focus:border-blue-500 transition-colors shadow-2xs',
        value === 0 ? 'text-slate-500 dark:text-slate-400' : value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'
      )}
    />
  );
});

interface PredecessorLinkCardListProps {
  items: LinkItem[];
  canWrite: boolean;
  saving: boolean;
  onPatchItem: (idx: number, patch: Partial<LinkItem>) => void;
  onRemoveItem: (idx: number) => void;
  onStepLag: (idx: number, delta: number) => void;
}

export const PredecessorLinkCardList: React.FC<PredecessorLinkCardListProps> = memo(
  ({ items, canWrite, saving, onPatchItem, onRemoveItem, onStepLag }) => {
    if (items.length === 0) return null;

    return (
      <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
        {items.map((it, idx) => {
          const allowed: PredecessorType[] = idx === 0 ? ['FS', 'SS', 'FF', 'SF'] : ['FF', 'SF'];
          const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;

          return (
            <div
              key={it.key}
              className={cn(
                'group flex flex-col gap-2 rounded-xl border bg-white dark:bg-[#1c1c1f] p-2.5 shadow-2xs transition-all hover:border-blue-300 dark:hover:border-blue-700',
                it.resolved
                  ? 'border-slate-200 dark:border-[#38383a]'
                  : 'border-amber-300 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-950/20'
              )}
            >
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span
                    className={cn(
                      'inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded px-1 text-[11px] font-black mt-0.5',
                      idx === 0
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
                    )}
                  >
                    {idx === 0 ? '①' : '②'}
                  </span>

                  {it.resolved && it.task ? (
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-black text-blue-600 dark:text-[#8ab4f8] shrink-0">
                          {it.code}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-[#f3f3f3] leading-snug break-words">
                          {it.task.name}
                        </span>
                      </div>
                      {it.isExternal && (
                        <span className="mt-1 inline-flex shrink-0 items-center gap-1 w-fit rounded border border-amber-300 bg-amber-100/70 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                          <ExternalLink className="h-3 w-3" />
                          {it.externalLabel}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Not found «{it.raw}»
                    </span>
                  )}
                </div>

                {canWrite && (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(idx)}
                    disabled={saving}
                    title="Remove link"
                    className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 active:scale-95 transition-all touch-manipulation disabled:opacity-50 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {it.resolved && canWrite && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-[#2a2a2d] text-xs flex-wrap sm:flex-nowrap">
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">TYPE:</span>
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#252528] p-0.5 border border-slate-200/60 dark:border-[#38383a]">
                      {allowed.map((rel) => {
                        const active = it.type === rel;
                        return (
                          <button
                            key={rel}
                            type="button"
                            disabled={saving}
                            onClick={() => !active && onPatchItem(idx, { type: rel })}
                            className={cn(
                              'px-2 py-0.5 text-[11px] font-black rounded-md transition-all active:scale-95 touch-manipulation disabled:opacity-60 cursor-pointer',
                              active
                                ? 'bg-blue-600 text-white shadow-2xs dark:bg-blue-600'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                            )}
                          >
                            {rel}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">LAG:</span>
                    <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100 dark:bg-[#252528] px-1 py-0.5 border border-slate-200/60 dark:border-[#38383a]">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onStepLag(idx, -1)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-white dark:bg-[#1c1c1f] text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all touch-manipulation cursor-pointer"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <LagInput
                        value={signed}
                        disabled={saving}
                        onCommit={(n) =>
                          onPatchItem(idx, { lagSign: n < 0 ? '-' : '+', lagValue: Math.abs(n) })
                        }
                      />
                      <span className="text-[10px] font-bold text-slate-400 px-0.5">days</span>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => onStepLag(idx, 1)}
                        className="flex h-5 w-5 items-center justify-center rounded bg-white dark:bg-[#1c1c1f] text-slate-600 dark:text-slate-300 shadow-2xs hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all touch-manipulation cursor-pointer"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
);

PredecessorLinkCardList.displayName = 'PredecessorLinkCardList';
