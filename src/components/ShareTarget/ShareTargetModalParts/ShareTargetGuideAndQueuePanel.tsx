import React from 'react';
import { Smartphone, CloudUpload, Database, CheckCircle2, RefreshCw, Sparkles, WifiOff, ExternalLink } from 'lucide-react';
import { SharedMediaRecord } from '../../../lib/localDb';

interface ShareTargetGuideAndQueuePanelProps {
  recentRecords: SharedMediaRecord[];
  pendingCount: number;
  isFlushing: boolean;
  onFlushQueue: () => void;
  onSimulateZaloShare: () => void;
  canInstallPwa: boolean;
  onTriggerInstallPwa: () => void;
}

export const ShareTargetGuideAndQueuePanel: React.FC<ShareTargetGuideAndQueuePanelProps> = React.memo(({
  recentRecords,
  pendingCount,
  isFlushing,
  onFlushQueue,
  onSimulateZaloShare,
  canInstallPwa,
  onTriggerInstallPwa,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* Mobile PWA Web Share Target Workflow Guide */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50/70 dark:from-blue-950/30 dark:to-indigo-950/20 border border-blue-200/80 dark:border-blue-800/60">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              Zalo → Taka PM Web Share Target Guide (iOS & Android)
            </h4>
          </div>
          <div className="flex items-center gap-1.5">
            {canInstallPwa && (
              <button
                type="button"
                onClick={onTriggerInstallPwa}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-transform active:scale-95 cursor-pointer"
              >
                Install App to Home Screen
              </button>
            )}
            <button
              type="button"
              onClick={onSimulateZaloShare}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs inline-flex items-center gap-1 transition-transform active:scale-95 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              Simulate Zalo Photo Share
            </button>
          </div>
        </div>

        <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>
            <strong>Install as Home Screen PWA:</strong> On Android (Chrome/Edge) or iOS (Safari), tap{' '}
            <span className="font-mono font-bold text-blue-700 dark:text-blue-300">Share → Add to Home Screen</span> to
            register <span className="font-mono">share_target</span> with your phone OS.
          </li>
          <li>
            <strong>Share Directly from Zalo:</strong> When a contractor or supervisor sends an inspection photo in a
            Zalo group, <strong>long-press the photo in Zalo → select &ldquo;Share&rdquo; (Chia sẻ) → tap the Taka PM icon</strong>.
          </li>
          <li>
            <strong>100% Offline-Ready Pipeline:</strong> The Service Worker intercepts the multipart payload even
            without internet, opens this popup immediately, saves the compressed photo into{' '}
            <strong>IndexedDB (Dexie)</strong> in 0ms, and pushes to <strong>Cloudflare R2</strong> (or auto-syncs as
            soon as network connectivity returns).
          </li>
        </ol>
      </div>

      {/* Offline Queue & Recent Dexie + R2 Shared Records */}
      <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200 dark:border-[#36363a]">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              IndexedDB (Dexie) Shared Media Log & Cloudflare R2 Sync Status
            </span>
          </div>

          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                {pendingCount} Pending R2 Upload
              </span>
            )}
            <button
              type="button"
              onClick={onFlushQueue}
              disabled={isFlushing || pendingCount === 0}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white inline-flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${isFlushing ? 'animate-spin' : ''}`} />
              Sync Pending to R2
            </button>
          </div>
        </div>

        {recentRecords.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-[#38383c] rounded-xl">
            No shared inspection photos saved in IndexedDB yet. Share an image from Zalo or click &ldquo;Simulate Zalo Photo Share&rdquo; above.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-200/70 dark:divide-[#2e2e32] border border-slate-200 dark:border-[#38383c] rounded-xl bg-white dark:bg-[#18181b]">
            {recentRecords.map((rec) => {
              const displayUrl = rec.r2Url || rec.localDataUrl;
              const isSynced = rec.syncStatus === 'synced' && Boolean(rec.r2Url);
              return (
                <div key={rec.id} className="p-2.5 flex items-center gap-3 hover:bg-slate-50/80 dark:hover:bg-[#232327]">
                  {displayUrl ? (
                    <img
                      src={displayUrl}
                      alt={rec.title}
                      className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-[#38383c] shrink-0 bg-slate-100"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 shrink-0">
                      FILE
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        {rec.store} • {rec.year} • {rec.unitCode}
                      </span>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                        {rec.title}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Pin: <strong>{rec.pinLabel}</strong>
                      {typeof rec.pinX === 'number' && typeof rec.pinY === 'number'
                        ? ` (@ ${rec.pinX.toFixed(0)}%, ${rec.pinY.toFixed(0)}%)`
                        : ''}
                      {rec.caption ? ` — "${rec.caption}"` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isSynced ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Dexie + R2 Synced
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 inline-flex items-center gap-1">
                        <CloudUpload className="w-3 h-3" />
                        Saved in Dexie (Queued R2)
                      </span>
                    )}
                    {rec.r2Url && (
                      <a
                        href={rec.r2Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-[#2c2c30]"
                        title="Open Cloudflare R2 Image URL"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
