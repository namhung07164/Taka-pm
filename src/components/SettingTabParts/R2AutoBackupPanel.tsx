import React, { useEffect, useState, useCallback } from 'react';
import {
  Cloud,
  UploadCloud,
  Download,
  RefreshCw,
  Clock,
  ShieldCheck,
  Trash2,
  HardDriveDownload,
  CheckCircle2,
  AlertTriangle,
  Database,
  RotateCcw,
} from 'lucide-react';
import {
  R2AutoBackupState,
  R2BackupSnapshotMeta,
  getR2AutoBackupState,
  subscribeR2AutoBackupState,
  saveR2AutoBackupConfig,
  executeR2BackupNow,
  listR2BackupSnapshots,
  downloadAndDecompressR2Backup,
  deleteR2BackupSnapshot,
  downloadLocalBackupFile,
} from '../../lib/r2AutoBackupService';
import { useAppStore } from '../../store/useAppStore';
import { localDb } from '../../lib/localDb';

interface R2AutoBackupPanelProps {
  isAdmin: boolean;
  onConfirmAction: (title: string, message: string, onConfirm: () => Promise<void>) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export const R2AutoBackupPanel: React.FC<R2AutoBackupPanelProps> = ({
  isAdmin,
  onConfirmAction,
}) => {
  const [backupState, setBackupState] = useState<R2AutoBackupState>(() => getR2AutoBackupState());
  const [snapshots, setSnapshots] = useState<R2BackupSnapshotMeta[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    return subscribeR2AutoBackupState((nextState) => {
      setBackupState(nextState);
    });
  }, []);

  const refreshSnapshotList = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const list = await listR2BackupSnapshots();
      setSnapshots(list);
    } catch (e) {
      console.warn('[R2AutoBackupPanel] Failed to load snapshots:', e);
    } finally {
      setIsLoadingList(false);
    }
  }, []);

  useEffect(() => {
    refreshSnapshotList();
  }, [refreshSnapshotList]);

  const handleManualBackupToR2 = async () => {
    const res = await executeR2BackupNow({ triggeredBy: 'manual', force: true });
    if (res.success && res.meta) {
      useAppStore.getState().setToast({
        title: 'R2 Backup Complete',
        message: `Compressed ${formatBytes(res.meta.rawSizeBytes)} → ${formatBytes(
          res.meta.compressedSizeBytes
        )} (-${res.meta.compressionRatioPercent}%) and archived to Cloudflare R2.`,
      });
      await refreshSnapshotList();
    } else {
      useAppStore.getState().setToast({
        title: 'R2 Backup Notice',
        message: res.reason || 'Could not complete backup to Cloudflare R2.',
      });
    }
  };

  const handleDownloadSnapshotJson = async (snap: R2BackupSnapshotMeta) => {
    setBusyKey(snap.key);
    try {
      const parsed = await downloadAndDecompressR2Backup(snap.key);
      const blob = new Blob([JSON.stringify(parsed, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = snap.fileName.replace(/\.gz$/i, '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      useAppStore.getState().setToast({
        title: 'Snapshot Downloaded',
        message: `Decompressed and downloaded ${snap.fileName}`,
      });
    } catch (e: any) {
      useAppStore.getState().setToast({
        title: 'Download Failed',
        message: e?.message || 'Failed to download snapshot from R2.',
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestoreSnapshotToLocalCache = (snap: R2BackupSnapshotMeta) => {
    onConfirmAction(
      'Restore Snapshot to Local Cache',
      `Are you sure you want to restore snapshot "${snap.fileName}" (${new Date(
        snap.timestampMs
      ).toLocaleString()}) into your local IndexedDB & in-memory state?`,
      async () => {
        setBusyKey(snap.key);
        try {
          const backupDoc = await downloadAndDecompressR2Backup(snap.key);
          const data = backupDoc?.data;
          if (!data) {
            throw new Error('Snapshot does not contain a valid data payload.');
          }

          const projects = Array.isArray(data.projects) ? data.projects : [];
          const tasks = Array.isArray(data.tasks) ? data.tasks : [];
          const costs = Array.isArray(data.costs) ? data.costs : [];
          const delegations = Array.isArray(data.delegationGroups) ? data.delegationGroups : [];

          await Promise.all([
            projects.length > 0 ? localDb.projects.bulkPut(projects) : Promise.resolve(),
            tasks.length > 0 ? localDb.tasks.bulkPut(tasks) : Promise.resolve(),
            costs.length > 0 ? localDb.costs.bulkPut(costs) : Promise.resolve(),
            delegations.length > 0 ? localDb.delegations.bulkPut(delegations) : Promise.resolve(),
          ]);

          const store = useAppStore.getState();
          if (projects.length > 0) store.setProjects(projects);
          if (tasks.length > 0) store.setTasks(tasks);
          if (costs.length > 0) store.setCosts(costs);
          if (delegations.length > 0) store.setDelegationGroups(delegations);

          useAppStore.getState().setToast({
            title: 'Snapshot Restored',
            message: `Restored ${projects.length} projects, ${tasks.length} tasks, ${costs.length} costs from R2 backup.`,
          });
        } catch (e: any) {
          useAppStore.getState().setToast({
            title: 'Restore Failed',
            message: e?.message || 'Failed to restore snapshot.',
          });
        } finally {
          setBusyKey(null);
        }
      }
    );
  };

  const handleDeleteSnapshot = (snap: R2BackupSnapshotMeta) => {
    onConfirmAction(
      'Delete R2 Backup Snapshot',
      `Remove backup archive "${snap.fileName}" permanently from Cloudflare R2?`,
      async () => {
        setBusyKey(snap.key);
        try {
          await deleteR2BackupSnapshot(snap.key);
          setSnapshots((prev) => prev.filter((item) => item.key !== snap.key));
          useAppStore.getState().setToast({
            title: 'Snapshot Deleted',
            message: `Deleted ${snap.fileName} from Cloudflare R2.`,
          });
        } catch (e: any) {
          useAppStore.getState().setToast({
            title: 'Delete Failed',
            message: e?.message || 'Could not delete snapshot.',
          });
        } finally {
          setBusyKey(null);
        }
      }
    );
  };

  if (!isAdmin) return null;

  const { config, lastBackupTimeMs, lastBackupMeta, isRunning, lastError } = backupState;
  const nextScheduledMs =
    lastBackupTimeMs > 0 ? lastBackupTimeMs + config.intervalHours * 3600 * 1000 : 0;

  return (
    <div className="p-4 md:p-5 bg-cyan-50/40 dark:bg-cyan-950/15 border-b border-cyan-200/70 dark:border-cyan-900/40 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Cloud className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-cyan-950 dark:text-cyan-200">
                Cloudflare R2 Auto-Backup & Compression Cron Engine
              </h3>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                2027 Operations Data Insurance
              </span>
            </div>
            <p className="text-xs text-cyan-800/80 dark:text-cyan-300/70 mt-0.5">
              Background Cron Trigger periodically exports all Projects, Tasks, Costs, Delegations, and Floor Layouts from local cache (0 Firestore Reads), compresses via GZIP (~85% size reduction), and archives to Cloudflare R2 through 2027.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleManualBackupToR2}
            disabled={isRunning}
            className="px-3.5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
          >
            <UploadCloud className={`w-4 h-4 ${isRunning ? 'animate-bounce' : ''}`} />
            {isRunning ? 'Compressing & Uploading...' : 'Backup Now to R2'}
          </button>

          <button
            onClick={() => downloadLocalBackupFile(true)}
            className="px-3 py-2 rounded-lg border border-cyan-300 dark:border-cyan-800 bg-white dark:bg-[#1e1e20] hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-cyan-800 dark:text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
            title="Download GZIP Compressed Backup Archive (.json.gz)"
          >
            <HardDriveDownload className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            Export .json.gz
          </button>

          <button
            onClick={refreshSnapshotList}
            disabled={isLoadingList}
            className="px-2.5 py-2 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-[#28282a] text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-all active:scale-95"
            title="Refresh R2 Snapshot List"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Cron Configuration Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white dark:bg-[#1e1e20] p-3.5 rounded-xl border border-cyan-200/60 dark:border-[#333336] shadow-xs">
        <div className="flex items-center justify-between md:justify-start gap-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => saveR2AutoBackupConfig({ enabled: e.target.checked })}
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4"
            />
            Enable Background Cron
          </label>
        </div>

        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
            Cron Interval:
          </span>
          <select
            value={config.intervalHours}
            onChange={(e) => saveR2AutoBackupConfig({ intervalHours: Number(e.target.value) })}
            className="text-xs font-bold bg-slate-50 dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value={1}>Every 1 Hour</option>
            <option value={6}>Every 6 Hours (Recommended)</option>
            <option value={12}>Every 12 Hours</option>
            <option value={24}>Every 24 Hours (Daily)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
            Keep Snapshots:
          </span>
          <select
            value={config.retentionCount}
            onChange={(e) => saveR2AutoBackupConfig({ retentionCount: Number(e.target.value) })}
            className="text-xs font-bold bg-slate-50 dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg px-2.5 py-1.5 text-slate-800 dark:text-slate-200 outline-none"
          >
            <option value={15}>Last 15 Snapshots</option>
            <option value={30}>Last 30 Snapshots</option>
            <option value={60}>Last 60 Snapshots</option>
            <option value={90}>Last 90 Snapshots</option>
          </select>
        </div>

        <div className="flex items-center justify-between md:justify-end gap-2">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.onlyWhenChanged}
              onChange={(e) => saveR2AutoBackupConfig({ onlyWhenChanged: e.target.checked })}
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-3.5 h-3.5"
            />
            Skip if no data changed
          </label>
        </div>
      </div>

      {/* Status & Telemetry Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-100/80 dark:bg-[#252528] text-xs text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <strong>Last R2 Backup:</strong>{' '}
            {lastBackupTimeMs > 0 ? new Date(lastBackupTimeMs).toLocaleString() : 'Never run yet'}
          </span>
          {nextScheduledMs > 0 && config.enabled && (
            <span>
              <strong>Next Cron Trigger:</strong> {new Date(nextScheduledMs).toLocaleString()}
            </span>
          )}
          {lastBackupMeta && (
            <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold">
              {formatBytes(lastBackupMeta.rawSizeBytes)} →{' '}
              {formatBytes(lastBackupMeta.compressedSizeBytes)} (-
              {lastBackupMeta.compressionRatioPercent}% GZIP) • {lastBackupMeta.projectsCount}P /{' '}
              {lastBackupMeta.tasksCount}T / {lastBackupMeta.costsCount}C
            </span>
          )}
        </div>

        {lastError && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {lastError}
          </span>
        )}
      </div>

      {/* R2 Cloud Snapshot History Table */}
      <div className="bg-white dark:bg-[#1e1e20] rounded-xl border border-slate-200 dark:border-[#333336] overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-[#252528] border-b border-slate-200 dark:border-[#333336] flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Cloudflare R2 Archived Snapshots ({snapshots.length})
          </span>
          <span className="text-[11px] text-slate-400">
            Bucket Path: Taka-Pm-folder/AutoBackups/snapshots/
          </span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            {isLoadingList
              ? 'Loading snapshots from Cloudflare R2...'
              : 'No R2 backup snapshots found yet. Click "Backup Now to R2" to create your first compressed archive.'}
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2e2e32]">
            {snapshots.map((snap) => {
              const isBusy = busyKey === snap.key;
              return (
                <div
                  key={snap.key}
                  className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/80 dark:hover:bg-[#252528]/60 transition-colors text-xs"
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {snap.fileName}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          snap.triggeredBy === 'cron_auto'
                            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-300'
                            : 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
                        }`}
                      >
                        {snap.triggeredBy === 'cron_auto' ? 'Auto Cron' : 'Manual'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                      <span>{new Date(snap.timestampMs).toLocaleString()}</span>
                      <span>•</span>
                      <span>
                        Size: <strong>{formatBytes(snap.compressedSizeBytes)}</strong>
                        {snap.rawSizeBytes > snap.compressedSizeBytes
                          ? ` (Raw ${formatBytes(snap.rawSizeBytes)}, -${snap.compressionRatioPercent}%)`
                          : ''}
                      </span>
                      {snap.projectsCount > 0 && (
                        <>
                          <span>•</span>
                          <span>
                            {snap.projectsCount} Projects, {snap.tasksCount} Tasks, {snap.costsCount}{' '}
                            Costs
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleDownloadSnapshotJson(snap)}
                      disabled={isBusy}
                      className="px-2.5 py-1 rounded border border-slate-200 dark:border-[#444446] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-200 font-medium flex items-center gap-1 transition-all active:scale-95"
                      title="Download & Decompress to JSON"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      JSON
                    </button>
                    <button
                      onClick={() => handleRestoreSnapshotToLocalCache(snap)}
                      disabled={isBusy}
                      className="px-2.5 py-1 rounded border border-emerald-300 dark:border-emerald-800/70 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1 transition-all active:scale-95"
                      title="Restore Snapshot into Local Database"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </button>
                    <button
                      onClick={() => handleDeleteSnapshot(snap)}
                      disabled={isBusy}
                      className="p-1 rounded border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-all active:scale-95"
                      title="Delete Snapshot from R2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
