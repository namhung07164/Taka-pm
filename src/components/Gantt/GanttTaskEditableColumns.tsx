import React, { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import {
  cn,
  parseDateTime,
  formatToDatetimeLocal,
  getDefaultDatetimeLocal,
  getEffectiveTaskDuration,
} from '../../lib/utils';
import { cleanDurationString } from '../../lib/taskImportService';
import { renderGanttDateCell } from './GanttUtils';
import { PredecessorEditableCell } from '../DetailTabParts/PredecessorEditableCell';

interface GanttDateInlineCellProps {
  value?: string;
  colorClass: string;
  canWrite: boolean;
  onSave: (newVal: string) => void;
}

const GanttDateInlineCell = memo(function GanttDateInlineCell({
  value,
  colorClass,
  canWrite,
  onSave,
}: GanttDateInlineCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState('');
  const anchorRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const normalizeForInput = useCallback((raw?: string) => {
    if (!raw || !String(raw).trim()) return getDefaultDatetimeLocal();
    const parsed = parseDateTime(raw);
    if (parsed && !isNaN(parsed.getTime())) {
      return formatToDatetimeLocal(parsed);
    }
    return getDefaultDatetimeLocal();
  }, []);

  const openEditor = (e: React.MouseEvent) => {
    if (!canWrite) return;
    e.stopPropagation();
    setVal(normalizeForInput(value));
    setIsEditing(true);
  };

  const computePos = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popWidth = 225;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - popWidth - 8));
    const top = r.bottom + 4 + 44 > window.innerHeight ? Math.max(8, r.top - 44) : r.bottom + 2;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!isEditing) return;
    computePos();
    const timer = setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        try {
          if (typeof (inputRef.current as any).showPicker === 'function') {
            (inputRef.current as any).showPicker();
          }
        } catch {
          // Ignore showPicker restriction if any
        }
      }
    }, 10);
    window.addEventListener('resize', computePos);
    window.addEventListener('scroll', computePos, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', computePos);
      window.removeEventListener('scroll', computePos, true);
    };
  }, [isEditing, computePos]);

  const commitSave = useCallback(
    (nextVal: string) => {
      setIsEditing(false);
      const trimmed = String(nextVal || '').trim();
      if (!trimmed) return;
      const oldNorm = value ? normalizeForInput(value) : '';
      if (trimmed !== oldNorm && trimmed !== value) {
        onSave(trimmed);
      }
    },
    [value, normalizeForInput, onSave]
  );

  useEffect(() => {
    if (!isEditing) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      commitSave(val);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [isEditing, val, commitSave]);

  useEffect(() => {
    if (!canWrite && isEditing) {
      setIsEditing(false);
    }
  }, [canWrite, isEditing]);

  if (!canWrite) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {renderGanttDateCell(value, colorClass)}
      </div>
    );
  }

  return (
    <>
      <div
        ref={anchorRef}
        data-editable-cell="true"
        role="button"
        tabIndex={0}
        onClick={openEditor}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openEditor(e as any);
          }
        }}
        title="Click to edit date & time"
        className={cn(
          'w-full h-full flex items-center justify-center rounded px-0.5 cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-[#28282a]',
          isEditing && 'ring-1 ring-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
        )}
      >
        {renderGanttDateCell(value, colorClass)}
      </div>
      {isEditing &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            data-editable-cell="true"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[190000] bg-white dark:bg-[#1e1e20] border border-blue-500 rounded-lg shadow-xl p-1.5 flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              type="datetime-local"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onBlur={(e) => commitSave(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitSave((e.target as HTMLInputElement).value);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsEditing(false);
                }
              }}
              className="text-xs font-mono font-semibold bg-white dark:bg-[#1e1e20] text-slate-900 dark:text-[#e3e3e3] border border-slate-200 dark:border-[#444446] rounded px-2 py-1 outline-none focus:border-blue-500"
            />
          </div>,
          document.body
        )}
    </>
  );
});

export interface GanttTaskEditableColumnsProps {
  t: Task;
  projects: Project[];
  tasks: Task[];
  canWrite: boolean;
  isEditMode?: boolean;
  showStart: boolean;
  startColWidth: number;
  showFinish: boolean;
  finishColWidth: number;
  showParty: boolean;
  partyColWidth: number;
  showDuration: boolean;
  durationColWidth: number;
  showPredecessor: boolean;
  predecessorColWidth: number;
  onUpdateTask: (task: Task, updates: Partial<Task>) => Promise<void>;
}

export const GanttTaskEditableColumns = memo(function GanttTaskEditableColumns({
  t,
  projects,
  tasks,
  canWrite,
  isEditMode = false,
  showStart,
  startColWidth,
  showFinish,
  finishColWidth,
  showParty,
  partyColWidth,
  showDuration,
  durationColWidth,
  showPredecessor,
  predecessorColWidth,
  onUpdateTask,
}: GanttTaskEditableColumnsProps) {
  const isPrintMode = useAppStore((state) => Boolean((state as any).isPrintMode));
  const parties = useAppStore((state) => state.parties);
  const effectiveCanWrite = Boolean(canWrite && isEditMode && !isPrintMode);

  const effectiveDuration = getEffectiveTaskDuration(t);

  const [editingField, setEditingField] = useState<'party' | 'duration' | null>(null);
  const [draftVal, setDraftVal] = useState('');

  useEffect(() => {
    if (!effectiveCanWrite && editingField !== null) {
      setEditingField(null);
    }
  }, [effectiveCanWrite, editingField]);

  const startEditParty = (e: React.MouseEvent) => {
    if (!effectiveCanWrite) return;
    e.stopPropagation();
    setDraftVal(t.party || '');
    setEditingField('party');
  };

  const commitParty = () => {
    setEditingField(null);
    const next = draftVal.trim();
    if (next !== (t.party || '')) {
      onUpdateTask(t, { party: next });
    }
  };

  const startEditDuration = (e: React.MouseEvent) => {
    if (!effectiveCanWrite) return;
    e.stopPropagation();
    setDraftVal(effectiveDuration || '');
    setEditingField('duration');
  };

  const commitDuration = () => {
    setEditingField(null);
    const cleaned = cleanDurationString(draftVal);
    if (cleaned === '' && effectiveDuration === '') return;
    const parsed = Number(String(cleaned).replace(',', '.').trim());
    if (cleaned !== '' && Number.isNaN(parsed)) return;
    const normalizedNext = cleaned !== '' ? String(Number(parsed.toFixed(2))) : '';
    if (normalizedNext !== effectiveDuration) {
      onUpdateTask(t, { duration: normalizedNext, durationManual: true });
    }
  };

  const partyListId = `gantt-party-list-${t.id}`;

  return (
    <>
      {showStart && (
        <div
          data-editable-cell={effectiveCanWrite ? 'true' : undefined}
          className="border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
          style={{ width: startColWidth, minWidth: startColWidth, maxWidth: startColWidth }}
        >
          <GanttDateInlineCell
            value={t.start}
            colorClass="text-blue-600 dark:text-[#8ab4f8]"
            canWrite={effectiveCanWrite}
            onSave={(val) => onUpdateTask(t, { start: val })}
          />
        </div>
      )}

      {showFinish && (
        <div
          data-editable-cell={effectiveCanWrite ? 'true' : undefined}
          className="border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
          style={{ width: finishColWidth, minWidth: finishColWidth, maxWidth: finishColWidth }}
        >
          <GanttDateInlineCell
            value={t.finish}
            colorClass="text-pink-600 dark:text-pink-400"
            canWrite={effectiveCanWrite}
            onSave={(val) => onUpdateTask(t, { finish: val })}
          />
        </div>
      )}

      {showParty && (
        <div
          data-editable-cell={effectiveCanWrite ? 'true' : undefined}
          className="text-xs text-slate-700 dark:text-slate-300 font-medium border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
          style={{ width: partyColWidth, minWidth: partyColWidth, maxWidth: partyColWidth }}
        >
          {editingField === 'party' && effectiveCanWrite ? (
            <>
              <input
                autoFocus
                type="text"
                list={partyListId}
                value={draftVal}
                onChange={(e) => setDraftVal(e.target.value)}
                onBlur={commitParty}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setEditingField(null);
                  }
                }}
                className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 text-center text-xs outline-none text-slate-900 dark:text-[#e3e3e3]"
              />
              {parties && parties.length > 0 && (
                <datalist id={partyListId}>
                  {parties.map((pt) => (
                    <option key={pt} value={pt} />
                  ))}
                </datalist>
              )}
            </>
          ) : (
            <div
              role={effectiveCanWrite ? 'button' : undefined}
              tabIndex={effectiveCanWrite ? 0 : undefined}
              onClick={startEditParty}
              onKeyDown={(e) => {
                if (effectiveCanWrite && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  startEditParty(e as any);
                }
              }}
              title={effectiveCanWrite ? 'Click to edit Party' : t.party || ''}
              className={cn(
                'w-full h-full flex items-center justify-center truncate rounded px-1',
                effectiveCanWrite && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a]'
              )}
            >
              <span className="truncate">{t.party || '-'}</span>
            </div>
          )}
        </div>
      )}

      {showDuration && (
        <div
          data-editable-cell={effectiveCanWrite ? 'true' : undefined}
          className="font-mono text-[10px] sm:text-xs text-slate-700 dark:text-slate-300 border-l border-slate-200 dark:border-[#444446] p-1 flex items-center justify-center font-bold shrink-0 h-full overflow-hidden"
          style={{ width: durationColWidth, minWidth: durationColWidth, maxWidth: durationColWidth }}
        >
          {editingField === 'duration' && effectiveCanWrite ? (
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={draftVal}
              onChange={(e) => setDraftVal(e.target.value)}
              onBlur={commitDuration}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingField(null);
                }
              }}
              className="w-full bg-white dark:bg-[#1e1e20] border border-blue-400 rounded px-1 py-0.5 text-center font-mono text-xs outline-none text-slate-900 dark:text-[#e3e3e3]"
            />
          ) : (
            <div
              role={effectiveCanWrite ? 'button' : undefined}
              tabIndex={effectiveCanWrite ? 0 : undefined}
              onClick={startEditDuration}
              onKeyDown={(e) => {
                if (effectiveCanWrite && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  startEditDuration(e as any);
                }
              }}
              title={effectiveCanWrite ? 'Click to edit Duration (days)' : undefined}
              className={cn(
                'w-full h-full flex items-center justify-center truncate rounded px-0.5',
                effectiveCanWrite && 'cursor-pointer hover:bg-slate-100 dark:hover:bg-[#28282a]'
              )}
            >
              {effectiveDuration !== '' ? `${effectiveDuration}d` : '-'}
            </div>
          )}
        </div>
      )}

      {showPredecessor && (
        <div
          data-editable-cell={effectiveCanWrite ? 'true' : undefined}
          className="font-mono text-[10px] sm:text-xs text-indigo-600 dark:text-indigo-400 font-semibold border-l border-slate-200 dark:border-[#444446] px-1 flex items-center justify-center shrink-0 h-full overflow-hidden"
          style={{ width: predecessorColWidth, minWidth: predecessorColWidth, maxWidth: predecessorColWidth }}
          title={effectiveCanWrite ? (t.predecessor || 'Click to edit Predecessor') : (t.predecessor || undefined)}
        >
          <PredecessorEditableCell
            compact={true}
            value={t.predecessor}
            onSave={(updates) => onUpdateTask(t, updates)}
            canWrite={effectiveCanWrite}
            task={t}
            tasks={tasks}
            projects={projects}
          />
        </div>
      )}
    </>
  );
});
