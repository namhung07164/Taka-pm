import React, { useRef } from 'react';
import Draggable from 'react-draggable';
import { SlidersHorizontal, X, GripHorizontal, Eye, ArrowRightLeft, ZoomIn, Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { useLanguage } from '../../lib/LanguageContext';
import { cn } from '../../lib/utils';

interface GanttSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  visibleColumns?: string[];
  onToggleColumn?: (colId: string) => void;
}

export const GanttSettingsModal: React.FC<GanttSettingsModalProps> = ({
  isOpen,
  onClose,
  visibleColumns = ['start', 'finish', 'party', 'duration', 'predecessor'],
  onToggleColumn,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const { t } = useLanguage();

  const ganttViewMode = useAppStore((state) => state.ganttViewMode);
  const setGanttViewMode = useAppStore((state) => state.setGanttViewMode);
  const ganttDayWidth = useAppStore((state) => state.ganttDayWidth);
  const setGanttDayWidth = useAppStore((state) => state.setGanttDayWidth);
  const ganttScaleInput = useAppStore((state) => state.ganttScaleInput);
  const setGanttScaleInput = useAppStore((state) => state.setGanttScaleInput);
  const isGanttWidthChanged = useAppStore((state) => state.isGanttWidthChanged);
  const setIsGanttWidthChanged = useAppStore((state) => state.setIsGanttWidthChanged);
  const saveGanttDayWidth = useAppStore((state) => state.saveGanttDayWidth);
  const ganttShowDependencies = useAppStore((state) => state.ganttShowDependencies);
  const setGanttShowDependencies = useAppStore((state) => state.setGanttShowDependencies);

  if (!isOpen) return null;

  const handleScaleChange = (valStr: string) => {
    setGanttScaleInput(valStr);
    const num = Number(valStr);
    if (!isNaN(num) && num >= 0 && num <= 150) {
      const calculatedDayWidth = num === 0 ? 0.6 : Math.max(0.6, Math.round((num / 75) * 8 * 10) / 10);
      setGanttDayWidth(calculatedDayWidth);
      setIsGanttWidthChanged(true);
    }
  };

  const handleApplyPreset = (scalePct: number) => {
    handleScaleChange(String(scalePct));
  };

  const availableCols = [
    { id: 'start', label: t('Start Date') || 'Start Date' },
    { id: 'finish', label: t('Finish Date') || 'Finish Date' },
    { id: 'party', label: t('Contractor / Party') || 'Contractor' },
    { id: 'duration', label: t('Duration') || 'Duration' },
    { id: 'predecessor', label: t('Predecessor') || 'Predecessor' },
  ];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <Draggable nodeRef={nodeRef} handle=".modal-handle">
        <div
          ref={nodeRef}
          className="w-full max-w-md bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333336] overflow-hidden flex flex-col"
        >
          {/* Draggable Header */}
          <div className="modal-handle flex items-center justify-between px-4 py-3 bg-slate-100 dark:bg-[#252528] border-b border-slate-200 dark:border-[#333336] cursor-grab active:cursor-grabbing select-none">
            <div className="flex items-center gap-2">
              <GripHorizontal className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <SlidersHorizontal className="w-4 h-4 text-blue-600 dark:text-[#8ab4f8]" />
              <h3 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                Gantt Chart Settings
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
            {/* View Mode Selector */}
            <div className="p-3 bg-slate-50 dark:bg-[#222225] rounded-xl border border-slate-200/80 dark:border-[#333336] space-y-2">
              <div className="flex items-center justify-between font-bold text-slate-700 dark:text-[#e3e3e3]">
                <span className="uppercase text-[10px] tracking-wider text-slate-500 dark:text-slate-400">
                  Gantt View Mode
                </span>
                <span className="text-[11px] font-mono text-blue-600 dark:text-[#8ab4f8] capitalize">
                  {ganttViewMode}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-200/60 dark:bg-[#18181a] rounded-lg">
                {(['weekly', 'monthly', 'quarterly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setGanttViewMode(mode)}
                    className={cn(
                      'py-1.5 px-2 rounded-md font-bold text-[11px] capitalize transition-all cursor-pointer',
                      ganttViewMode === mode
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-300/50 dark:hover:bg-[#2e2e32]'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Scale & Day Width */}
            <div className="p-3 bg-slate-50 dark:bg-[#222225] rounded-xl border border-slate-200/80 dark:border-[#333336] space-y-2.5">
              <div className="flex items-center justify-between font-bold text-slate-700 dark:text-[#e3e3e3]">
                <div className="flex items-center gap-1.5">
                  <ZoomIn className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8]" />
                  <span className="uppercase text-[10px] tracking-wider text-slate-500 dark:text-slate-400">
                    Timeline Zoom Scale
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="150"
                    value={ganttScaleInput}
                    onChange={(e) => handleScaleChange(e.target.value)}
                    className="w-14 px-1.5 py-0.5 text-xs text-center font-mono font-bold bg-white dark:bg-[#18181a] border border-slate-300 dark:border-[#444446] text-slate-900 dark:text-white rounded-md outline-none"
                  />
                  <span className="font-mono text-slate-500 dark:text-slate-400 font-bold">%</span>
                </div>
              </div>

              {/* Slider */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0.6"
                  max="20"
                  step="0.2"
                  value={ganttDayWidth}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    setGanttDayWidth(num);
                    setGanttScaleInput(String(Math.round((num / 8) * 75)));
                    setIsGanttWidthChanged(true);
                  }}
                  className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
                {isGanttWidthChanged && (
                  <button
                    type="button"
                    onClick={saveGanttDayWidth}
                    className="px-2.5 py-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md shadow-2xs transition-colors cursor-pointer shrink-0"
                  >
                    Save Scale
                  </button>
                )}
              </div>

              {/* Quick Presets */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-400 font-medium">Presets:</span>
                <div className="flex items-center gap-1">
                  {[50, 75, 100, 125, 150].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleApplyPreset(pct)}
                      className={cn(
                        'px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer',
                        Number(ganttScaleInput) === pct
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-200/70 dark:bg-[#18181a] text-slate-600 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-[#2c2c30]'
                      )}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Display Options & Predecessor Arrows */}
            <div className="p-3 bg-slate-50 dark:bg-[#222225] rounded-xl border border-slate-200/80 dark:border-[#333336] space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8]" />
                  <span className="font-bold text-slate-700 dark:text-[#e3e3e3]">
                    Predecessor Link Arrows
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setGanttShowDependencies(!ganttShowDependencies)}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer',
                    ganttShowDependencies ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform',
                      ganttShowDependencies ? 'translate-x-4.5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Draw orthogonal dependency lines linking task predecessors and successor tasks in the Gantt timeline.
              </p>
            </div>

            {/* Visible Columns */}
            {onToggleColumn && (
              <div className="p-3 bg-slate-50 dark:bg-[#222225] rounded-xl border border-slate-200/80 dark:border-[#333336] space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-[#e3e3e3]">
                  <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-[#8ab4f8]" />
                  <span className="uppercase text-[10px] tracking-wider text-slate-500 dark:text-slate-400">
                    Visible Left Columns
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {availableCols.map((col) => {
                    const isVisible = visibleColumns.includes(col.id);
                    return (
                      <button
                        key={col.id}
                        type="button"
                        onClick={() => onToggleColumn(col.id)}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg border text-left transition-colors cursor-pointer',
                          isVisible
                            ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 text-blue-900 dark:text-blue-200 font-medium'
                            : 'bg-white dark:bg-[#18181a] border-slate-200 dark:border-[#333336] text-slate-500 dark:text-slate-400'
                        )}
                      >
                        <span className="text-[11px] font-medium">{col.label}</span>
                        {isVisible && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-slate-100/80 dark:bg-[#252528] border-t border-slate-200 dark:border-[#333336] flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </Draggable>
    </div>
  );
};
