import React, { useEffect, useState } from 'react';
import { syncQueueManager, getConnectionStatus, processPendingSync } from '../lib/syncQueue';
import { listenerManager } from '../lib/syncResilience';
import { RefreshCw, Wifi, WifiOff, Trash2, ChevronUp, ChevronDown, Activity } from 'lucide-react';

export const SyncMonitor: React.FC = () => {
  const [status, setStatus] = useState<any>({});
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const updateStatus = async () => {
      try {
        const queueStatus = await syncQueueManager.getQueueStatus();
        const connection = getConnectionStatus();
        const listeners = listenerManager.getStatus();

        setStatus({
          queue: queueStatus,
          connection,
          listeners,
        });
      } catch (err) {
        console.warn('[SyncMonitor] Error updating status:', err);
      }
    };

    updateStatus();
    const interval = setInterval(updateStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await processPendingSync();
    } finally {
      setIsSyncing(false);
    }
  };

  const handleClearQueue = async () => {
    if (window.confirm('Clear pending sync queue?')) {
      await syncQueueManager.clearQueue();
    }
  };

  const isOnline = status.connection === 'online';
  const pendingCount = status.queue?.totalPending || 0;

  return (
    <div className="fixed bottom-2 left-2 z-[9990] font-sans text-xs">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg border backdrop-blur-md transition-all active:scale-95 ${
            pendingCount > 0
              ? 'bg-amber-500 text-white border-amber-600 animate-pulse'
              : isOnline
              ? 'bg-slate-900/85 text-emerald-400 border-slate-700 hover:bg-slate-900'
              : 'bg-rose-900/90 text-rose-300 border-rose-700'
          }`}
          title="Toggle Sync Status Monitor"
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="font-semibold uppercase tracking-wider">
            {isOnline ? 'Sync' : 'Offline'}
          </span>
          {pendingCount > 0 && (
            <span className="bg-white/20 text-white font-bold px-1.5 py-0.5 rounded-full text-[10px]">
              {pendingCount}
            </span>
          )}
          <ChevronUp className="w-3.5 h-3.5 opacity-70 ml-0.5" />
        </button>
      ) : (
        <div className="bg-slate-900/95 text-slate-200 border border-slate-700 rounded-xl p-3 shadow-2xl backdrop-blur-md w-80 space-y-2.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-slate-100 uppercase tracking-tight">
                Sync System Monitor
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block text-[10px] uppercase">Connection</span>
              <div className="flex items-center gap-1.5 font-bold mt-0.5">
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">ONLINE</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400">OFFLINE</span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/50">
              <span className="text-slate-400 block text-[10px] uppercase">Pending Queue</span>
              <div className="font-bold mt-0.5 text-amber-300">
                {pendingCount} item{pendingCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center justify-between bg-slate-800/40 p-1.5 rounded-lg border border-slate-800">
            <span>Last Sync:</span>
            <span className="font-mono text-slate-200 font-medium">
              {status.queue?.lastSyncTime
                ? new Date(status.queue.lastSyncTime).toLocaleTimeString()
                : 'Never'}
            </span>
          </div>

          {status.queue?.pendingUpdates?.length > 0 && (
            <div className="max-h-24 overflow-y-auto space-y-1 bg-slate-950 p-2 rounded-lg border border-slate-800 font-mono text-[10px]">
              {status.queue.pendingUpdates.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-slate-300">
                  <span className="truncate max-w-[140px]">{item.docId}</span>
                  <span className="uppercase text-emerald-400 font-semibold">{item.action}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            <button
              onClick={handleClearQueue}
              disabled={pendingCount === 0}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 disabled:opacity-40 text-rose-400 font-semibold rounded-lg transition-colors border border-slate-700"
              title="Clear pending queue"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
