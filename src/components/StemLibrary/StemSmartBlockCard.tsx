import React, { useMemo } from 'react';
import {
  Plus,
  Minus,
  ChevronUp,
  ChevronDown,
  Trash2,
  ArrowDown,
  Zap,
  Flag,
  Unlock,
  Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  STEM_CONNECTOR_META,
  STEM_DEPARTMENTS,
  STEM_PARTY_OPTIONS,
  StemConnectorType,
  StemWorkbenchBlock,
} from './stemLibraryTypes';

const CONNECTOR_CYCLE_ORDER: StemConnectorType[] = ['FS', 'SS', 'FF', 'NONE'];

function formatShortDate(isoStr?: string): string {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.slice(0, 10);
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

export interface StemSmartBlockCardProps {
  block: StemWorkbenchBlock;
  index: number;
  totalCount: number;
  prevBlockCode?: string;
  isHoardingHighlight?: boolean;
  onCycleConnector: (instanceId: string, explicitType?: StemConnectorType) => void;
  onChangeDuration: (instanceId: string, nextDuration: number) => void;
  onChangeName: (instanceId: string, nextName: string) => void;
  onChangeParty: (instanceId: string, nextParty: string) => void;
  onToggleDelegation: (instanceId: string) => void;
  onMoveOrder: (index: number, direction: 'up' | 'down') => void;
  onRemoveBlock: (instanceId: string) => void;
}

export const StemSmartBlockCard: React.FC<StemSmartBlockCardProps> = React.memo(
  ({
    block,
    index,
    totalCount,
    prevBlockCode,
    isHoardingHighlight,
    onCycleConnector,
    onChangeDuration,
    onChangeName,
    onChangeParty,
    onToggleDelegation,
    onMoveOrder,
    onRemoveBlock,
  }) => {
    const dept = STEM_DEPARTMENTS[block.department] || STEM_DEPARTMENTS.prep_bql;
    const connMeta = STEM_CONNECTOR_META[block.connectorToPrev] || STEM_CONNECTOR_META.FS;

    const previewPredString = useMemo(() => {
      if (index === 0 || block.connectorToPrev === 'NONE' || !prevBlockCode) return 'Start Root';
      return `${prevBlockCode}${block.connectorToPrev === 'FS' ? '' : block.connectorToPrev}`;
    }, [index, block.connectorToPrev, prevBlockCode]);

    return (
      <div className="flex flex-col items-stretch">
        {/* Interactive Snap Connector between Block i-1 and Block i */}
        {index > 0 && (
          <div className="flex items-center justify-center gap-2 py-1.5 relative">
            <div className="h-full w-0.5 bg-slate-300 dark:bg-[#3a3a3e] absolute left-6 top-0 bottom-0 pointer-events-none" />

            <button
              type="button"
              onClick={() => onCycleConnector(block.instanceId)}
              title={`${connMeta.description} — Bấm để đổi khớp nối (FS → SS → FF → Tự do)`}
              className={cn(
                'z-10 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold shadow-2xs transition-all cursor-pointer active:scale-95 touch-manipulation',
                connMeta.badgeClass
              )}
            >
              {block.connectorToPrev === 'FS' && <ArrowDown className="w-3 h-3" />}
              {block.connectorToPrev === 'SS' && <Zap className="w-3 h-3" />}
              {block.connectorToPrev === 'FF' && <Flag className="w-3 h-3" />}
              {block.connectorToPrev === 'NONE' && <Unlock className="w-3 h-3" />}
              <span>{connMeta.label}</span>
              <span className="font-mono text-[10px] opacity-80 px-1 rounded bg-black/5 dark:bg-white/10">
                {previewPredString}
              </span>
            </button>

            <div className="hidden sm:flex items-center gap-0.5 bg-slate-100 dark:bg-[#222226] p-0.5 rounded-lg border border-slate-200/70 dark:border-[#333338]">
              {CONNECTOR_CYCLE_ORDER.map((cType) => (
                <button
                  key={cType}
                  type="button"
                  onClick={() => onCycleConnector(block.instanceId, cType)}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-[9.5px] font-bold transition-colors cursor-pointer',
                    block.connectorToPrev === cType
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-500 dark:text-[#9e9ea2] hover:bg-slate-200/60 dark:hover:bg-[#2f2f34]'
                  )}
                >
                  {cType === 'NONE' ? 'Tự do' : cType}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Smart STEM Block Card */}
        <div
          className={cn(
            'rounded-xl border bg-white dark:bg-[#1c1c1f] p-2.5 shadow-2xs transition-all',
            dept.borderClass,
            isHoardingHighlight
              ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/50'
              : 'border-slate-200/90 dark:border-[#2e2e32]'
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-[#2a2a2e] text-slate-700 dark:text-[#d4d4d8] text-[10px] font-extrabold flex items-center justify-center shrink-0">
                {index + 1}
              </span>
              <span className="font-mono text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/60 shrink-0">
                {block.previewCode || `#${index + 1}`}
              </span>
              <input
                type="text"
                value={block.name}
                onChange={(e) => onChangeName(block.instanceId, e.target.value)}
                className="flex-1 min-w-[140px] text-xs font-semibold text-slate-800 dark:text-[#f1f1f3] bg-transparent border-b border-transparent focus:border-blue-500 focus:outline-none px-1 py-0.5"
              />
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center bg-slate-100 dark:bg-[#252529] rounded-lg border border-slate-200 dark:border-[#38383d] p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeDuration(block.instanceId, Math.max(0.5, block.duration - 1))}
                  title="Giảm 1 ngày"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-600 dark:text-[#c3c3c3] hover:bg-white dark:hover:bg-[#323236] cursor-pointer active:scale-90 touch-manipulation"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <div className="flex items-center px-1.5">
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={block.duration}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0.5) {
                        onChangeDuration(block.instanceId, val);
                      }
                    }}
                    className="w-10 text-center text-xs font-mono font-bold bg-transparent text-slate-800 dark:text-white focus:outline-none"
                  />
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-[#9e9ea2]">
                    ngày
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onChangeDuration(block.instanceId, block.duration + 1)}
                  title="Tăng 1 ngày"
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-600 dark:text-[#c3c3c3] hover:bg-white dark:hover:bg-[#323236] cursor-pointer active:scale-90 touch-manipulation"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMoveOrder(index, 'up')}
                  title="Đưa khối lên trên"
                  className="p-1 rounded-md border border-slate-200 dark:border-[#343438] text-slate-600 dark:text-[#b3b3b3] hover:bg-slate-100 dark:hover:bg-[#2a2a2e] disabled:opacity-30 cursor-pointer active:scale-90 touch-manipulation"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={index === totalCount - 1}
                  onClick={() => onMoveOrder(index, 'down')}
                  title="Đưa khối xuống dưới"
                  className="p-1 rounded-md border border-slate-200 dark:border-[#343438] text-slate-600 dark:text-[#b3b3b3] hover:bg-slate-100 dark:hover:bg-[#2a2a2e] disabled:opacity-30 cursor-pointer active:scale-90 touch-manipulation"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveBlock(block.instanceId)}
                  title="Xóa khối này"
                  className="p-1 rounded-md border border-slate-200 dark:border-[#343438] text-slate-400 hover:text-red-600 hover:border-red-200 dark:hover:border-red-900/50 cursor-pointer active:scale-90 touch-manipulation"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-[#28282c] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-bold border',
                  dept.badgeClass
                )}
              >
                {dept.shortLabel}
              </span>

              <div className="flex items-center gap-1 font-mono text-[11px]">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">
                  {formatShortDate(block.computedStart)}
                </span>
                <span className="text-slate-400">→</span>
                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                  {formatShortDate(block.computedFinish)}
                </span>
              </div>

              {isHoardingHighlight && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[10px] font-bold">
                  🚧 Mốc Dựng Rào (Hoarding Up)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#252529] px-2 py-0.5 rounded-lg border border-slate-200 dark:border-[#36363b]">
                <Users className="w-3 h-3 text-purple-500 shrink-0" />
                <span className="text-[10px] text-slate-400">PIC:</span>
                <select
                  value={block.party}
                  onChange={(e) => onChangeParty(block.instanceId, e.target.value)}
                  aria-label="Chọn bộ phận phụ trách"
                  className="text-[11px] font-bold text-slate-700 dark:text-[#e3e3e3] bg-transparent focus:outline-none cursor-pointer"
                >
                  {STEM_PARTY_OPTIONS.map((p) => (
                    <option key={p} value={p} className="bg-white dark:bg-[#1e1e20]">
                      {p}
                    </option>
                  ))}
                  {!STEM_PARTY_OPTIONS.includes(block.party) && (
                    <option value={block.party} className="bg-white dark:bg-[#1e1e20]">
                      {block.party}
                    </option>
                  )}
                </select>
              </div>

              <button
                type="button"
                onClick={() => onToggleDelegation(block.instanceId)}
                title="Tự động tạo nhóm Delegation khi xuất ra dự án"
                className={cn(
                  'px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer active:scale-95 touch-manipulation',
                  block.delegation
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-[#252529] text-slate-400 border-slate-200 dark:border-[#36363b]'
                )}
              >
                Deleg: {block.delegation ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
