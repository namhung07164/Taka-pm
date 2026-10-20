import React, { useEffect, useRef, useState } from 'react';
import { Task, Project } from '../../types';
import { cn } from '../../lib/utils';

export type PredecessorType = 'FS' | 'SS' | 'FF' | 'SF';

export interface PredecessorChange {
  predecessor: string;
  predecessorTaskIds: string[];
  predecessors: { taskId: string; type: PredecessorType }[];
}

export interface LinkItem {
  key: string;
  resolved: boolean;
  taskId: string;
  task?: Task;
  code: string;
  type: PredecessorType;
  lagSign: '+' | '-';
  lagValue: number;
  raw: string;
  isExternal: boolean;
  externalLabel: string;
}

export const REL_INFO: Record<PredecessorType, { hint: string }> = {
  FS: { hint: 'Finish → Start' },
  SS: { hint: 'Start → Start' },
  FF: { hint: 'Finish → Finish' },
  SF: { hint: 'Start → Finish' },
};

export const SLOT_STYLE = [
  {
    tag: '1',
    border: 'border-l-blue-500',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-[#8ab4f8]',
    active: 'bg-blue-600 text-white border-blue-600 shadow-sm',
    caption: 'text-blue-700 dark:text-[#8ab4f8]',
  },
  {
    tag: '2',
    border: 'border-l-amber-500',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
    active: 'bg-amber-600 text-white border-amber-600 shadow-sm',
    caption: 'text-amber-700 dark:text-amber-300',
  },
];

export function shortDate(s?: string): string {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : String(s);
}

export function externalLabel(diffDetails: any, fallbackCode?: string) {
  if (!diffDetails || !diffDetails.diffFactors || diffDetails.diffFactors.length === 0) {
    return fallbackCode || 'Cross-Project';
  }
  const factors = diffDetails.diffFactors;
  const factorLabels = factors.map((f: string) => {
    if (f === 'year') return 'Year';
    if (f === 'store') return 'Store';
    if (f === 'location') return 'Location';
    return 'Project';
  });
  return `Cross-Project (${factorLabels.join(', ')})`;
}

export function lagToText(sign: string, v: number): string {
  return v ? `${sign}${v}` : '';
}

export function tokenOf(it: LinkItem): string {
  if (!it.resolved) return it.raw;
  const lag = lagToText(it.lagSign, it.lagValue);
  const rel = it.type === 'FS' && !lag ? '' : it.type;
  return `${it.code}${rel}${lag}`;
}

export function normalize(list: LinkItem[]): LinkItem[] {
  return list.slice(0, 2).map((it, i) =>
    i === 1 && it.resolved && it.type !== 'FF' && it.type !== 'SF' ? { ...it, type: 'FF' as PredecessorType } : it
  );
}

export function milestoneDate(it: LinkItem): string {
  if (!it.resolved || !it.task) return '';
  const base = it.type === 'FS' || it.type === 'FF' ? it.task.finish : it.task.start;
  if (!base) return '';
  const d = new Date(base);
  if (isNaN(d.getTime())) return '';
  const signed = (it.lagSign === '-' ? -1 : 1) * it.lagValue;
  if (signed !== 0) d.setDate(d.getDate() + signed);
  return d.toISOString().split('T')[0];
}

export function describe(it: LinkItem): string {
  if (!it.resolved || !it.task) return '';
  const n = it.task.name;
  const s = it.lagValue > 0 ? ` (lag ${it.lagSign}${it.lagValue} days)` : '';
  switch (it.type) {
    case 'FS': return `Start after «${n}» finishes${s}`;
    case 'SS': return `Start when «${n}» starts${s}`;
    case 'FF': return `Finish when «${n}» finishes${s}`;
    case 'SF': return `Finish when «${n}» starts${s}`;
  }
}

export async function persistDefault(source: Task, change: PredecessorChange, _projects: Project[]): Promise<void> {
  if (!source?.id) throw new Error('Please save the task before linking a predecessor.');
  const now = new Date().toISOString();

  const updatedTask = {
    ...source,
    predecessor: change.predecessor,
    predecessorTaskIds: change.predecessorTaskIds,
    predecessors: change.predecessors,
    updatedAt: now,
  } as Task;

  const { writeBatch } = await import('../../lib/firestoreWrites');
  const { db, APP_ID } = await import('../../lib/firebase');
  const { doc, serverTimestamp } = await import('firebase/firestore');

  const cleanData = Object.fromEntries(Object.entries(updatedTask).filter(([_, v]) => v !== undefined));
  if (!cleanData.parentTaskId) cleanData.parentTaskId = null;

  const batch = writeBatch(db);
  batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', source.id), {
    ...cleanData,
    _serverTimestamp: serverTimestamp(),
  });

  await batch.commit();
}

export const LagInput = React.memo(function LagInput({
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
    if (!isTypingRef.current) setTxt(fmt(value));
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
      onFocus={(e: any) => { isTypingRef.current = true; e.target.select?.(); }}
      onChange={(e: any) => setTxt(e.target.value.replace(/[^0-9+-−.,]/g, ''))}
      onBlur={commit}
      onKeyDown={(e: any) => {
        if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation(); commit(); e.target.blur?.();
        }
      }}
      title="Enter lag days, e.g. +2 or -1"
      className={cn(
        'h-6 w-12 rounded bg-slate-100 dark:bg-[#18181a] border border-slate-200 dark:border-[#333] text-center font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 transition-colors',
        value === 0 ? 'text-slate-500 dark:text-slate-400' : value > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-orange-600 dark:text-orange-400'
      )}
    />
  );
});
