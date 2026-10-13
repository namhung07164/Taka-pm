import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus, X } from 'lucide-react';
import { PredecessorSearchSuggest, PredecessorChange } from '../TaskModalParts/PredecessorSearchSuggest';
import { Task, Project } from '../../types';
import { splitPredecessors } from '../../lib/ganttUtils';
import { parsePredecessorToken } from '../../lib/predecessorMatchUtils';
import { cn } from '../../lib/utils';

type PanelLayout =
  | { mode: 'sheet' }
  | { mode: 'pop'; left: number; width: number; maxH: number; top?: number; bottom?: number };

const CHIP_STYLE = [
  'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-[#8ab4f8]',
  'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300',
];

export const PredecessorEditableCell = React.memo(function PredecessorEditableCell({
  value,
  onSave,
  canWrite,
  task,
}: {
  value: any;
  onSave: (updates: Partial<Task>) => void | Promise<void>;
  canWrite: boolean;
  task: Task;
  // giữ nguyên chữ ký cũ để không phải sửa nơi gọi
  tasks?: Task[];
  projects?: Project[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const text = value !== undefined && value !== null ? String(value) : '';
  const tokens = useMemo(() => splitPredecessors(text), [text]);

  /* ----- Vị trí khung chỉnh sửa (popover trên máy tính / bottom-sheet trên điện thoại) ----- */
  const computeLayout = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setLayout({ mode: 'sheet' });
      return;
    }
    const r = el.getBoundingClientRect();
    const width = Math.min(400, vw - 16);
    const left = Math.max(8, Math.min(r.left, vw - width - 8));
    const spaceBelow = vh - r.bottom - 8;
    const spaceAbove = r.top - 8;
    if (spaceBelow >= 360 || spaceBelow >= spaceAbove) {
      setLayout({ mode: 'pop', left, width, top: r.bottom + 4, maxH: Math.max(240, spaceBelow - 4) });
    } else {
      setLayout({ mode: 'pop', left, width, bottom: vh - r.top + 4, maxH: Math.max(240, spaceAbove - 4) });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isEditing) return;
    computeLayout();
    window.addEventListener('resize', computeLayout);
    window.addEventListener('scroll', computeLayout, true);
    return () => {
      window.removeEventListener('resize', computeLayout);
      window.removeEventListener('scroll', computeLayout, true);
    };
  }, [isEditing, computeLayout]);

  /* ----- Đóng khi bấm ra ngoài / nhấn Escape ----- */
  useEffect(() => {
    if (!isEditing) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      setIsEditing(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [isEditing]);

  const handleChange = async (c: PredecessorChange) => {
    await onSave({
      predecessor: c.predecessor,
      predecessorTaskIds: c.predecessorTaskIds,
      predecessors: c.predecessors,
    } as Partial<Task>);
  };

  /* ----- Hiển thị dạng thẻ dễ đọc ----- */
  const chips =
    tokens.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1">
        {tokens.slice(0, 2).map((tok, i) => {
          const { query, suffix } = parsePredecessorToken(tok);
          return (
            <span
              key={`${tok}-${i}`}
              title={tok}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]',
                CHIP_STYLE[i] || CHIP_STYLE[1]
              )}
            >
              <b className="truncate font-mono">{query || tok}</b>
              {suffix && (
                <span className="shrink-0 rounded bg-white/70 px-1 font-mono text-[10px] font-extrabold dark:bg-black/30">
                  {suffix.replace(/^(FS|SS|FF|SF)?([+-])(\d.*)$/i, (_m, r, sg, n) => `${r || ''} ${sg === '-' ? '−' : '+'}${n}d`).trim()}
                </span>
              )}
            </span>
          );
        })}
      </div>
    ) : null;

  if (!canWrite) {
    return chips ? <div className="w-full">{chips}</div> : <span className="text-slate-400">-</span>;
  }

  const panelContent = (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Predecessor</div>
          <div className="truncate text-[13px] font-bold text-slate-800 dark:text-[#f3f3f3]">{task?.name}</div>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-3.5 text-[12px] font-bold text-white shadow-sm hover:bg-blue-700 active:scale-95 touch-manipulation"
        >
          <X className="h-3.5 w-3.5" /> Xong
        </button>
      </div>
      <PredecessorSearchSuggest task={task} canWrite={canWrite} onChange={handleChange} />
    </>
  );

  return (
    <>
      <div
        ref={anchorRef}
        role="button"
        tabIndex={0}
        onClick={() => setIsEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsEditing(true);
          }
        }}
        className={cn(
          'group flex min-h-[32px] w-full cursor-pointer items-center rounded-md px-0.5 transition-colors hover:bg-slate-50 dark:hover:bg-[#202023]',
          isEditing && 'bg-blue-50/60 ring-1 ring-blue-300 dark:bg-blue-950/20 dark:ring-blue-700'
        )}
      >
        {chips || (
          <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-1.5 py-0.5 text-[11px] font-semibold text-slate-400 group-hover:border-blue-400 group-hover:text-blue-500 dark:border-slate-600 dark:text-slate-500">
            <Plus className="h-3 w-3" /> Thêm
          </span>
        )}
      </div>

      {isEditing &&
        layout &&
        createPortal(
          layout.mode === 'sheet' ? (
            <>
              <div className="fixed inset-0 z-[190] bg-black/40" onClick={() => setIsEditing(false)} />
              <div
                ref={panelRef}
                role="dialog"
                className="fixed inset-x-2 bottom-2 z-[200] max-h-[85vh] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl dark:border-[#444446] dark:bg-[#1c1c1f]"
              >
                {panelContent}
              </div>
            </>
          ) : (
            <div
              ref={panelRef}
              role="dialog"
              className="fixed z-[200] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-[#444446] dark:bg-[#1c1c1f]"
              style={{
                left: layout.left,
                width: layout.width,
                maxHeight: layout.maxH,
                ...(layout.top !== undefined ? { top: layout.top } : {}),
                ...(layout.bottom !== undefined ? { bottom: layout.bottom } : {}),
              }}
            >
              {panelContent}
            </div>
          ),
          document.body
        )}
    </>
  );
});
