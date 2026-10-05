import React from 'react';
import {
  Activity,
  Copy,
  Download,
  RotateCcw,
  CheckCircle2,
  X,
  Users,
} from 'lucide-react';

interface PerformanceHeaderProps {
  activeViewMode: 'session' | 'fleet';
  setActiveViewMode: (mode: 'session' | 'fleet') => void;
  copied: boolean;
  onCopySummary: () => void;
  onExportJson: () => void;
  onResetStats: () => void;
  onClose?: () => void;
}

export const PerformanceHeader: React.FC<PerformanceHeaderProps> = ({
  activeViewMode,
  setActiveViewMode,
  copied,
  onCopySummary,
  onExportJson,
  onResetStats,
  onClose,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-[#ededed] flex items-center gap-2">
                Firestore Performance & Read Monitor
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold border border-emerald-300/40">
                  Live Session
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa]">
                Theo dõi và đo lường chi phí lượt đọc (Reads/Writes), tỷ lệ Cache IndexedDB và hiệu năng mạng.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {activeViewMode === 'session' && (
            <>
              <button
                onClick={onCopySummary}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#27272a] hover:bg-slate-100 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-[#d4d4d8] border border-slate-200 dark:border-[#3f3f46] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
              >
                {copied ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copied ? 'Copied' : 'Copy Report'}
              </button>
              <button
                onClick={onExportJson}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-[#27272a] hover:bg-slate-100 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-[#d4d4d8] border border-slate-200 dark:border-[#3f3f46] rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <button
                onClick={onResetStats}
                title="Reset counters for this session"
                className="px-3 py-1.5 text-xs font-medium bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-lg transition-colors flex items-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Counters
              </button>
            </>
          )}
          {onClose && (
            <button
              onClick={onClose}
              title="Close Performance Dashboard"
              className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-[#3f3f46] rounded-lg transition-colors border border-transparent hover:border-slate-300 dark:hover:border-[#52525b]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Scope Mode Switcher: Single Device Session vs All Devices Fleet */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-[#27272a] rounded-xl border border-slate-200 dark:border-[#3f3f46] w-fit">
        <button
          onClick={() => setActiveViewMode('session')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeViewMode === 'session'
              ? 'bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-[#3f3f46]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          Thiết Bị Này (Current Device Session)
        </button>

        <button
          onClick={() => setActiveViewMode('fleet')}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
            activeViewMode === 'fleet'
              ? 'bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-[#3f3f46]'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Toàn Bộ Thiết Bị (All Devices Fleet)
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
            Mới
          </span>
        </button>
      </div>
    </div>
  );
};
