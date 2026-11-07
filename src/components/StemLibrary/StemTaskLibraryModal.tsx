import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'motion/react';
import {
  GripHorizontal,
  X,
  Zap,
  AlertTriangle,
  Calendar,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  Layers,
  Building2,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getZIndexClass } from '../../lib/zIndexManager';
import {
  StemPartsBinColumn,
  StemPresetTopBar,
  StemSmartBlockCard,
} from './StemWorkbenchSubcomponents';
import { useStemWorkbenchState } from './useStemWorkbenchState';

interface StemTaskLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialProjectId?: string;
  initialProjectCode?: string;
}

export const StemTaskLibraryModal: React.FC<StemTaskLibraryModalProps> = ({
  isOpen,
  onClose,
  initialProjectId,
  initialProjectCode,
}) => {
  const dragControls = useDragControls();
  const {
    projects,
    targetProject,
    setSelectedProjectId,
    presets,
    partsBin,
    activePresetId,
    anchorMode,
    setAnchorMode,
    customAnchorDate,
    setCustomAnchorDate,
    appendOnPresetClick,
    setAppendOnPresetClick,
    setWorkbenchBlocks,
    isSubmitting,
    errorMsg,
    schedule,
    handleSelectPreset,
    handleDeleteCustomPreset,
    handleAddPart,
    handleCycleConnector,
    handleChangeDuration,
    handleChangeName,
    handleChangeParty,
    handleToggleDelegation,
    handleMoveOrder,
    handleRemoveBlock,
    handleAutoParallelOptimize,
    handleApplyToProject,
  } = useStemWorkbenchState({
    isOpen,
    onClose,
    initialProjectId,
    initialProjectCode,
  });

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs',
        getZIndexClass('MODAL_MODULAR')
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-[#131316] border border-slate-200 dark:border-[#2e2e32] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Draggable Modal Header */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="modal-handle px-4 py-3 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing select-none shrink-0"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight truncate flex items-center gap-2">
                <span>⚡ Visual STEM Task Library Builder</span>
                <span className="hidden sm:inline-flex text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  0ms Auto-Wiring Engine
                </span>
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Bàn Lắp Ghép Khối Tiến Độ 3 Vùng — Tự động sinh mã [ProjectCode]#[Index] & khớp nối Gantt
              </p>
            </div>
          </div>

          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-2 shrink-0"
          >
            <div className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 border border-white/15 rounded-xl px-2.5 py-1">
              <Building2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <select
                value={targetProject?.id || ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                aria-label="Target Project"
                className="text-xs font-bold text-white bg-transparent focus:outline-none max-w-[180px] sm:max-w-[240px] truncate cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                    [{p.store || 'HCM'} • {p.year || ''}] {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close STEM Workbench"
              className="p-1.5 rounded-xl bg-white/10 hover:bg-red-500/80 text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Zone 1: Top Bar - Main Stems Presets */}
        <StemPresetTopBar
          presets={presets}
          activePresetId={activePresetId}
          onSelectPreset={handleSelectPreset}
          onDeleteCustomPreset={handleDeleteCustomPreset}
        />

        {/* Zone 2 (Left 35%) + Zone 3 (Right 65%) Split Workspace */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
          <StemPartsBinColumn parts={partsBin} onAddPart={handleAddPart} />

          <div className="w-full md:w-[65%] flex-1 flex flex-col min-h-0 bg-white dark:bg-[#131316]">
            {/* Anchor Mode Bar (Forward vs Backward Retail Mode) */}
            <div className="p-3 bg-slate-50/70 dark:bg-[#19191d] border-b border-slate-200 dark:border-[#2e2e32] flex flex-col gap-2 shrink-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 bg-slate-200/80 dark:bg-[#252529] p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAnchorMode('forward')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 touch-manipulation',
                      anchorMode === 'forward'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    🔘 Chế độ Tiến (Forward Start)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnchorMode('backward')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer active:scale-95 touch-manipulation',
                      anchorMode === 'backward'
                        ? 'bg-purple-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
                    )}
                  >
                    🔘 Chế độ Lùi (Backward Retail Opening)
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-[#b3b3b3] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appendOnPresetClick}
                      onChange={(e) => setAppendOnPresetClick(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Nối thêm khi bấm Gói mẫu</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setWorkbenchBlocks([])}
                    title="Xóa trắng bàn lắp ghép"
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 dark:text-[#9e9ea2] flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-blue-500" />
                    {anchorMode === 'forward' ? 'Ngày bắt đầu mốc:' : 'Cố định ngày Khai trương:'}
                  </span>
                  <input
                    type="date"
                    value={customAnchorDate}
                    onChange={(e) => setCustomAnchorDate(e.target.value)}
                    className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-[#3c3c42] bg-white dark:bg-[#222226] text-xs font-mono font-bold text-slate-800 dark:text-white"
                  />
                </div>

                {schedule.blocks.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {anchorMode === 'backward' && schedule.hoardingStartDate && (
                      <span className="px-2 py-0.5 rounded-lg bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-800 text-[11px] font-bold">
                        🚧 Chậm nhất phải Dựng rào: {schedule.hoardingStartDate.slice(0, 10)}
                      </span>
                    )}
                    <span className="px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-[#26262b] text-slate-700 dark:text-[#d4d4d8] font-mono text-[11px] font-bold flex items-center gap-1">
                      <span>{schedule.earliestStart.slice(0, 10)}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span>{schedule.latestFinish.slice(0, 10)}</span>
                      <span className="text-blue-600 dark:text-blue-400">
                        ({schedule.totalSpanDays}d)
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Visual Flow Canvas List */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-1">
              {schedule.blocks.length === 0 ? (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 dark:border-[#2e2e32] rounded-2xl">
                  <Layers className="w-10 h-10 text-slate-300 dark:text-[#44444a] mb-2" />
                  <p className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">
                    Bàn lắp ghép đang trống
                  </p>
                  <p className="text-xs text-slate-400 max-w-md mt-1">
                    Bấm 1 chạm vào các thẻ Gói Mẫu Chuẩn ở thanh trên cùng hoặc bấm nút [+] ở Kho Khối Lẻ bên trái để bắt đầu lắp ghép.
                  </p>
                </div>
              ) : (
                schedule.blocks.map((blk, idx) => (
                  <StemSmartBlockCard
                    key={blk.instanceId}
                    block={blk}
                    index={idx}
                    totalCount={schedule.blocks.length}
                    prevBlockCode={idx > 0 ? schedule.blocks[idx - 1].previewCode : undefined}
                    isHoardingHighlight={
                      anchorMode === 'backward' && /hoarding|dựng rào/i.test(blk.name)
                    }
                    onCycleConnector={handleCycleConnector}
                    onChangeDuration={handleChangeDuration}
                    onChangeName={handleChangeName}
                    onChangeParty={handleChangeParty}
                    onToggleDelegation={handleToggleDelegation}
                    onMoveOrder={handleMoveOrder}
                    onRemoveBlock={handleRemoveBlock}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer: Opening Risk Warning & Apply Action */}
        <div className="p-3 bg-slate-50 dark:bg-[#18181b] border-t border-slate-200 dark:border-[#2e2e32] space-y-2 shrink-0">
          {schedule.risk.hasRisk && (
            <div
              className={cn(
                'flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 rounded-xl text-xs border font-medium transition-all',
                schedule.risk.level === 'critical'
                  ? 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/60'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
              )}
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle
                  className={cn(
                    'w-4 h-4 shrink-0 mt-0.5',
                    schedule.risk.level === 'critical' ? 'text-red-500 animate-pulse' : 'text-amber-500'
                  )}
                />
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-extrabold text-[11px] uppercase tracking-wide">
                      Cảnh báo Rủi ro Trễ Ngày Khai Trương ({schedule.risk.daysLate} ngày)
                    </span>
                  </div>
                  {schedule.risk.reasons.map((r, i) => (
                    <p key={i} className="text-[11px] leading-snug">
                      • {r}
                    </p>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={handleAutoParallelOptimize}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-2xs cursor-pointer active:scale-95 touch-manipulation"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Chuyển MEP/IT sang ⚡ SS</span>
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-300 text-xs font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-500 dark:text-[#9e9ea2] flex items-center gap-2">
              <span>
                Mã tự động:{' '}
                <strong className="font-mono text-slate-800 dark:text-white">
                  {targetProject?.code || 'PROJ'}#{schedule.nextStartIndex} → #
                  {schedule.nextStartIndex + Math.max(0, schedule.blocks.length - 1)}
                </strong>
              </span>
              <span>•</span>
              <span>
                Ủy quyền (Delegation):{' '}
                <strong className="text-emerald-600 dark:text-emerald-400">
                  {schedule.blocks.filter((b) => b.delegation).length} nhóm
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#343438] text-xs font-bold text-slate-600 dark:text-[#c3c3c3] hover:bg-slate-100 dark:hover:bg-[#26262a] cursor-pointer"
              >
                Hủy (Esc)
              </button>
              <button
                type="button"
                disabled={!targetProject || schedule.blocks.length === 0 || isSubmitting}
                onClick={handleApplyToProject}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-md cursor-pointer active:scale-95 touch-manipulation"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmitting
                    ? 'Đang hàn mạch...'
                    : `Áp dụng vào Dự án (${schedule.blocks.length} công việc)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>,
    document.body
  );
};

export default StemTaskLibraryModal;
