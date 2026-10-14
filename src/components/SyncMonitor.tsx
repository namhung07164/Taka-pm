import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { safeGetItemLocal } from '../lib/storage';
import { Wifi, WifiOff, Database, ShieldAlert, RefreshCw, Trash2 } from 'lucide-react';
import { getPendingUpdates, clearPendingUpdates } from '../lib/syncQueue';
import { getLastDeltaSyncTime, getRestoreCutoffTimestamp, pullAndApplyDeltas } from '../lib/deltaSyncService';

/**
 * SyncMonitor: A floating debug panel to verify real-time sync, fingerprinting, and cutoff.
 * CRITICAL for multi-device troubleshooting.
 */
export const SyncMonitor: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const cloudStatus = useAppStore(state => state.cloudStatus);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const [cutoff, setCutoff] = useState(0);
  const [fingerprint, setFingerprint] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const updateStats = async () => {
      const pending = await getPendingUpdates();
      setPendingCount(pending.length);
      setLastSync(getLastDeltaSyncTime());
      setCutoff(getRestoreCutoffTimestamp());
      setFingerprint(safeGetItemLocal('taka_data_fingerprint_v1') || 'none');
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await pullAndApplyDeltas();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearQueue = async () => {
    if (confirm('Clear local offline queue? This cannot be undone.')) {
      await clearPendingUpdates();
      setPendingCount(0);
    }
  };

  if (!isOpen) {
    return (
      <div 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[9999] p-2 bg-slate-900/80 backdrop-blur-md rounded-full shadow-lg cursor-pointer border border-slate-700 hover:bg-slate-800 transition-all flex items-center gap-2 group"
      >
        {cloudStatus === 'online' ? (
          <Wifi size={14} className="text-emerald-400" />
        ) : (
          <WifiOff size={14} className="text-rose-400" />
        )}
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {pendingCount}
          </span>
        )}
        <span className="text-[10px] text-slate-300 font-medium overflow-hidden w-0 group-hover:w-16 transition-all duration-300">Sync Monitor</span>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[9999] w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
      <div className="p-3 bg-slate-800 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-sky-400" />
          <span className="text-sm font-bold text-slate-100">Sync Monitor</span>
        </div>
        <button 
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-white p-1"
        >
          <XIcon size={16} />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">Connection</span>
          <div className="flex items-center gap-1.5">
            {cloudStatus === 'online' ? (
              <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Online
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-rose-400 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                Offline
              </span>
            )}
          </div>
        </div>

        {/* Offline Queue */}
        <div className="p-2.5 bg-slate-800/50 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400">Offline Queue</span>
            <span className={`text-xs font-bold ${pendingCount > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              {pendingCount} items
            </span>
          </div>
          {pendingCount > 0 && (
            <button 
              onClick={handleClearQueue}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 px-2 text-[10px] bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded transition-colors border border-rose-500/20"
            >
              <Trash2 size={10} />
              Clear Queue
            </button>
          )}
        </div>

        {/* Sync Metadata */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500">Last Sync</span>
            <span className="text-slate-300 font-mono">{lastSync > 0 ? new Date(lastSync).toLocaleTimeString() : 'Never'}</span>
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500">Restore Cutoff</span>
            <span className={`font-mono ${cutoff > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
              {cutoff > 0 ? new Date(cutoff).toLocaleTimeString() : 'None'}
            </span>
          </div>
          <div className="flex justify-between items-center text-[10px]">
            <span className="text-slate-500">Fingerprint</span>
            <span className="text-slate-400 font-mono truncate max-w-[120px]" title={fingerprint}>
              {fingerprint}
            </span>
          </div>
        </div>

        {/* Recovery Warning */}
        {cutoff > 0 && (
          <div className="p-2 bg-rose-500/5 border border-rose-500/20 rounded flex gap-2">
            <ShieldAlert size={14} className="text-rose-400 shrink-0" />
            <p className="text-[10px] text-rose-300/80 leading-relaxed">
              Restore Version active. Stale local data is strictly blocked from syncing back.
            </p>
          </div>
        )}

        {/* Actions */}
        <button 
          onClick={handleManualSync}
          disabled={isSyncing}
          className="w-full py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95"
        >
          <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  );
};

const XIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);
