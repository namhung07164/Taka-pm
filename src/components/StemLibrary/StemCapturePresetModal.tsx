import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, useDragControls } from 'motion/react';
import { GripHorizontal, PackagePlus, X, CheckCircle2, Sparkles } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Task } from '../../types';
import { cn } from '../../lib/utils';
import { getZIndexClass } from '../../lib/zIndexManager';
import {
  STEM_CONNECTOR_META,
  STEM_DEPARTMENTS,
  StemPresetBlockSeed,
  StemPresetPackage,
} from './stemLibraryTypes';
import {
  extractStemBlocksFromTasks,
  saveCustomStemPreset,
} from './stemLibraryConfigService';

interface StemCapturePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskIds?: string[];
  onSaved?: (preset: StemPresetPackage) => void;
}

const EMOJI_OPTIONS = ['📦', '🍔', '👗', '🎪', '🔨', '⚡', '🏗️', '🛍️'];
const COLOR_OPTIONS: Array<{ id: StemPresetPackage['themeColor']; label: string; dot: string }> = [
  { id: 'blue', label: 'Blue', dot: 'bg-blue-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'purple', label: 'Purple', dot: 'bg-purple-500' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'cyan', label: 'Cyan', dot: 'bg-cyan-500' },
];

export const StemCapturePresetModal: React.FC<StemCapturePresetModalProps> = ({
  isOpen,
  onClose,
  taskIds,
  onSaved,
}) => {
  const dragControls = useDragControls();
  const allTasks = useAppStore((s) => s.tasks);
  const currentUser = useAppStore((s) => s.currentUser);

  const targetTasks: Task[] = useMemo(() => {
    const ids = new Set(taskIds || []);
    if (ids.size === 0) return [];
    return (allTasks || []).filter((t) => t && !t.isDeleted && ids.has(t.id));
  }, [allTasks, taskIds]);

  const extractedBlocks: StemPresetBlockSeed[] = useMemo(
    () => extractStemBlocksFromTasks(targetTasks),
    [targetTasks]
  );

  const sampleProjCode = targetTasks[0]?.projectCode || 'Retail';
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [emoji, setEmoji] = useState('📦');
  const [themeColor, setThemeColor] = useState<StemPresetPackage['themeColor']>('blue');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(`Gói Chuẩn ${sampleProjCode} (${extractedBlocks.length} khối)`);
    setSubtitle(
      `Đóng gói tự động từ ${sampleProjCode} — Đã lọc bỏ ngày tháng cứng & giữ nguyên liên kết FS/SS/FF`
    );
  }, [isOpen, sampleProjCode, extractedBlocks.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const handleSavePreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || extractedBlocks.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const saved = await saveCustomStemPreset(
        {
          title: title.trim(),
          subtitle:
            subtitle.trim() ||
            `${extractedBlocks.length} khối chuẩn đóng gói bởi ${currentUser?.email || 'PM'}`,
          emoji,
          themeColor,
          blocks: extractedBlocks,
        },
        currentUser?.email
      );
      onSaved?.(saved);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs',
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
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl bg-white dark:bg-[#151518] border border-slate-200 dark:border-[#2e2e32] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {/* Draggable Header */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="modal-handle px-4 py-3 bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
        >
          <div className="flex items-center gap-2.5">
            <GripHorizontal className="w-4 h-4 text-slate-400" />
            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
              <PackagePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold">
                📦 Đóng gói vào Thư viện (1-Click STEM Capture)
              </h3>
              <p className="text-[11px] text-slate-300">
                Lưu mẫu tái sử dụng vào taka_config (0 lượt đọc Firestore phụ trội)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-red-500/80 text-slate-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSavePreset} className="p-4 space-y-3 overflow-y-auto flex-1">
          <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <span>
              Hệ thống đã tự động lọc bỏ ngày tháng cụ thể và mã dự án cũ ({sampleProjCode}), chỉ giữ lại{' '}
              <strong>{extractedBlocks.length} khối công việc</strong>, số ngày chuẩn (Duration), bộ phận phụ trách (Party) và mối nối tương đối (FS/SS/FF).
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-[#b3b3b3] mb-1">
                Tên Gói Mẫu (Preset Name)
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Gói Fit-out F&B Chuẩn..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#36363a] bg-white dark:bg-[#1e1e22] text-slate-800 dark:text-white font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 dark:text-[#b3b3b3] mb-1">
                Mô tả ngắn (Subtitle)
              </label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Mô tả gói lắp ghép..."
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-[#36363a] bg-white dark:bg-[#1e1e22] text-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block text-[11px] font-bold text-slate-600 dark:text-[#b3b3b3] mb-1">
                Biểu tượng (Icon)
              </span>
              <div className="flex items-center gap-1">
                {EMOJI_OPTIONS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => setEmoji(em)}
                    className={cn(
                      'w-7 h-7 rounded-lg border text-sm flex items-center justify-center cursor-pointer transition-transform active:scale-90',
                      emoji === em
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/60 ring-1 ring-blue-500'
                        : 'border-slate-200 dark:border-[#343438]'
                    )}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-slate-600 dark:text-[#b3b3b3] mb-1">
                Màu thẻ (Theme)
              </span>
              <div className="flex items-center gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setThemeColor(c.id)}
                    className={cn(
                      'px-2 py-1 rounded-lg border text-[10.5px] font-bold flex items-center gap-1 cursor-pointer',
                      themeColor === c.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-[#343438] text-slate-600 dark:text-[#a3a3a3]'
                    )}
                  >
                    <span className={cn('w-2 h-2 rounded-full', c.dot)} />
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preview Stripped Blocks */}
          <div className="border border-slate-200 dark:border-[#2e2e32] rounded-xl overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-100 dark:bg-[#202024] text-[11px] font-bold text-slate-600 dark:text-[#b3b3b3] flex items-center justify-between">
              <span>Chuỗi khối công việc sẽ lưu ({extractedBlocks.length} khối)</span>
              <span>
                Tổng: ~{extractedBlocks.reduce((acc, b) => acc + b.duration, 0)} ngày
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-[#26262a]">
              {extractedBlocks.map((b, i) => {
                const dept = STEM_DEPARTMENTS[b.department];
                const conn = STEM_CONNECTOR_META[b.connectorToPrev];
                return (
                  <div
                    key={i}
                    className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs bg-white dark:bg-[#18181b]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[10px] font-bold text-slate-400">
                        #{i + 1}
                      </span>
                      {i > 0 && (
                        <span
                          className={cn(
                            'px-1.5 py-0.2 rounded text-[9.5px] font-bold border shrink-0',
                            conn.badgeClass
                          )}
                        >
                          {conn.shortLabel}
                        </span>
                      )}
                      <span className="font-semibold text-slate-800 dark:text-[#e3e3e3] truncate">
                        {b.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 text-[10.5px]">
                      <span className={cn('px-1.5 py-0.2 rounded border', dept.badgeClass)}>
                        {b.party}
                      </span>
                      <span className="font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 dark:bg-[#26262b] text-slate-700 dark:text-[#d4d4d8]">
                        {b.duration}d
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#2e2e32]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#36363a] text-xs font-bold text-slate-600 dark:text-[#c3c3c3] cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={extractedBlocks.length === 0 || !title.trim() || isSaving}
              className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer active:scale-95 touch-manipulation"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Đang lưu...' : 'Lưu Gói Mẫu vào Thư viện'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
};

export default StemCapturePresetModal;
