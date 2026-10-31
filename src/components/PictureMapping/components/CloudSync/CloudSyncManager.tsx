import React, { useState } from 'react';
import {
  CloudUpload,
  CloudDownload,
  RefreshCw,
  Sparkles,
  ChevronDown,
  Check,
  Layers,
  GitMerge,
  Eye,
  Edit3,
  Settings,
} from 'lucide-react';
import {
  getStoredR2Credentials,
  getStoredR2CredentialsAsync,
  isR2CredentialsValid,
} from '../../lib/r2Upload';
import { useDataStore, StoreLocationRecord } from '../../DataContext';
import { useAppStore } from '../../../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import R2UploadModal from '../R2UploadModal';
import { cn } from '../../lib/utils';
import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../../lib/firebase';
import {
  executeCloudUploadSync,
  getScopeName,
  withSyncTimeout,
} from './CloudSyncParts/cloudSyncUploadService';
import { executeCloudDownloadSync } from './CloudSyncParts/cloudSyncDownloadService';
import { executeCleanR2GarbageAction } from './CloudSyncParts/cloudSyncFirestoreBackup';

let hasGlobalAutoSyncStarted = false;

export type CloudSyncScope = 'all' | 'edit' | 'dynamic' | 'review';

export interface CloudSyncManagerProps {
  scope?: CloudSyncScope;
  className?: string;
  showCleanButton?: boolean;
  compact?: boolean;
}

export default function CloudSyncManager({
  scope = 'all',
  className,
  showCleanButton = true,
  compact = false,
}: CloudSyncManagerProps) {
  const [selectedScope, setSelectedScope] = useState<CloudSyncScope>(scope);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [_syncing, setSyncing] = useState(false);
  const [_progress, setProgress] = useState(0);
  const [_statusText, setStatusText] = useState('');
  const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);
  const [backgroundSyncing, setBackgroundSyncing] = useState<'upload' | 'download' | null>(null);

  React.useEffect(() => {
    setSelectedScope(scope);
  }, [scope]);

  const {
    store,
    location,
    storeLocationData,
    mapVersions,
    activeMapVersionId,
    reviewSelectedLabels,
    reviewLabelColors,
    loadFullCloudData,
    isCloudLoaded,
  } = useDataStore(
    useShallow((state) => ({
      store: state.store,
      location: state.location,
      storeLocationData: state.storeLocationData,
      mapVersions: state.mapVersions,
      activeMapVersionId: state.activeMapVersionId,
      reviewSelectedLabels: state.reviewSelectedLabels,
      reviewLabelColors: state.reviewLabelColors,
      loadFullCloudData: state.loadFullCloudData,
      isCloudLoaded: state.isCloudLoaded,
    }))
  );

  React.useEffect(() => {
    if (hasGlobalAutoSyncStarted || isCloudLoaded) return;
    async function checkAutoLoad() {
      if (hasGlobalAutoSyncStarted) return;
      hasGlobalAutoSyncStarted = true;

      try {
        const cached = localStorage.getItem('taka_mapping_config_backup');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.storeLocationData && Object.keys(parsed.storeLocationData).length > 0) {
            loadFullCloudData({
              storeLocationData: parsed.storeLocationData,
              store: parsed.store || store,
              location: parsed.location || location,
              activeMapVersionId: parsed.activeMapVersionId || activeMapVersionId,
              reviewSelectedLabels: parsed.reviewSelectedLabels || [],
              reviewLabelColors: parsed.reviewLabelColors || {},
            });
          }
        }
      } catch (_e) {}

      const creds = await getStoredR2CredentialsAsync();
      if (creds && creds.accountId && creds.accessKeyId) {
        executeSync('download', true, 'all');
      } else {
        try {
          const snap = await getDoc(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config')
          );
          if (snap.exists()) {
            const fsData = snap.data() as any;
            if (fsData?.storeLocationData) {
              loadFullCloudData({
                storeLocationData: fsData.storeLocationData,
                store,
                location,
                activeMapVersionId,
                reviewSelectedLabels: fsData.reviewSelectedLabels || [],
                reviewLabelColors: fsData.reviewLabelColors || {},
              });
            }
          }
        } catch (e) {
          console.warn('[AutoLoad Fallback] Firestore boot fallback error:', e);
        }
      }
    }
    checkAutoLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenSync = async (type: 'upload' | 'download', targetScope?: CloudSyncScope) => {
    setActionType(type);
    const effScope = targetScope || selectedScope;
    if (targetScope) setSelectedScope(targetScope);
    executeSync(type, false, effScope);
  };

  const executeSync = async (
    forceAction?: 'upload' | 'download',
    isAuto = false,
    forceScope?: CloudSyncScope
  ) => {
    const syncStartTime = Date.now();
    const currentAction = forceAction || actionType;
    const currentScope = forceScope || selectedScope;
    setIsModalOpen(false);
    setSyncing(true);
    setBackgroundSyncing(currentAction);

    const watchdogTimer = setTimeout(() => {
      setBackgroundSyncing(null);
      setSyncing(false);
    }, 18000);

    const freshDataState = useDataStore.getState();
    const currentStore = (freshDataState.store || store || 'HCM') as 'HCM' | 'HN';
    const currentLocation = (freshDataState.location || location || 'L1').trim();
    const currentActiveKey = `${currentStore}_${currentLocation}`;
    const updatedStoreLocationData: Record<string, StoreLocationRecord> = {
      ...(freshDataState.storeLocationData || {}),
    };

    const currentActiveUnits = Array.isArray(freshDataState.mapUnits)
      ? freshDataState.mapUnits
      : updatedStoreLocationData[currentActiveKey]?.mapUnits || [];
    const currentActiveVersions = Array.isArray(freshDataState.mapVersions)
      ? freshDataState.mapVersions
      : updatedStoreLocationData[currentActiveKey]?.mapVersions || [];
    const currentActiveVersionId =
      freshDataState.activeMapVersionId ||
      activeMapVersionId ||
      (currentActiveVersions[0]?.id ?? null);

    updatedStoreLocationData[currentActiveKey] = {
      mapUnits: currentActiveUnits,
      mapVersions: currentActiveVersions,
      activeMapVersionId: currentActiveVersionId,
    };

    if (currentAction === 'upload') {
      useDataStore.setState({
        storeLocationData: updatedStoreLocationData,
        mapUnits: currentActiveUnits,
        mapVersions: currentActiveVersions,
        activeMapVersionId: currentActiveVersionId,
      });
      try {
        const payload = JSON.stringify({
          storeLocationData: updatedStoreLocationData,
          store: currentStore,
          location: currentLocation,
          activeMapVersionId: currentActiveVersionId,
          updatedAt: Date.now(),
          timestamp: Date.now(),
        });
        if (payload.length < 1000000) {
          localStorage.setItem('taka_mapping_config_backup', payload);
        } else {
          localStorage.removeItem('taka_mapping_config_backup');
        }
      } catch {
        try {
          localStorage.removeItem('taka_mapping_config_backup');
        } catch (_) {}
      }
    }

    try {
      const creds = await withSyncTimeout(
        getStoredR2CredentialsAsync(),
        4000,
        'R2 credentials check timed out'
      ).catch(() => getStoredR2Credentials());
      const credsValidation = isR2CredentialsValid(creds);

      if (currentAction === 'upload') {
        await executeCloudUploadSync({
          creds,
          credsValid: credsValidation,
          currentScope,
          updatedStoreLocationData,
          currentActiveKey,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels,
          reviewLabelColors,
          syncStartTime,
          setProgress,
          setStatusText,
        });
      } else if (currentAction === 'download') {
        await executeCloudDownloadSync({
          creds,
          credsValid: credsValidation,
          currentScope,
          isAuto,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels,
          reviewLabelColors,
          syncStartTime,
          setProgress,
          setStatusText,
        });
      }
    } catch (err: any) {
      if (!isAuto) {
        console.error('[CloudSync Background Error]', err);
        useAppStore.getState().setToast({
          title: 'Cloud Sync Error',
          message: `Lỗi đồng bộ Cloud: ${err.message || err}. Dữ liệu trên máy vẫn an toàn.`,
          type: 'warning',
        });
      }
    } finally {
      clearTimeout(watchdogTimer);
      setBackgroundSyncing(null);
      setSyncing(false);
    }
  };

  const handleCleanR2Garbage = () =>
    executeCleanR2GarbageAction({ storeLocationData, mapVersions, setSyncing, setStatusText });

  const scopeBadgeColor = {
    edit: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    dynamic: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    review: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    all: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  }[selectedScope];

  return (
    <div className={cn('flex items-center gap-1 relative', className)}>
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => handleOpenSync('upload')}
          disabled={backgroundSyncing === 'upload'}
          className={cn(
            'flex items-center gap-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-brand-400 hover:text-brand-300 transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer',
            backgroundSyncing === 'upload' && 'opacity-90 cursor-wait',
            compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-1.5'
          )}
          title={`Lưu dữ liệu (${getScopeName(selectedScope)}) lên Cloudflare R2 & Firestore`}
        >
          {backgroundSyncing === 'upload' ? (
            <RefreshCw size={11} className="shrink-0 animate-spin text-brand-400" />
          ) : (
            <CloudUpload size={11} className="shrink-0" />
          )}
          <span className="font-bold uppercase tracking-wider">
            {backgroundSyncing === 'upload' ? 'Saving...' : 'Save Cloud'}
          </span>
          {selectedScope !== 'all' && (
            <span className={cn('text-[8px] font-extrabold uppercase px-1 py-0.1 rounded border', scopeBadgeColor)}>
              {selectedScope}
            </span>
          )}
        </button>

        <button
          onClick={() => handleOpenSync('download')}
          disabled={backgroundSyncing === 'download'}
          className={cn(
            'flex items-center gap-1 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-purple-400 hover:text-purple-300 transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer',
            backgroundSyncing === 'download' && 'opacity-90 cursor-wait',
            compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2.5 py-1.5'
          )}
          title={`Tải dữ liệu (${getScopeName(selectedScope)}) từ Cloudflare R2`}
        >
          {backgroundSyncing === 'download' ? (
            <RefreshCw size={11} className="shrink-0 animate-spin text-purple-400" />
          ) : (
            <CloudDownload size={11} className="shrink-0" />
          )}
          <span className="font-bold uppercase tracking-wider">
            {backgroundSyncing === 'download' ? 'Loading...' : 'Load Cloud'}
          </span>
          {selectedScope !== 'all' && (
            <span className={cn('text-[8px] font-extrabold uppercase px-1 py-0.1 rounded border', scopeBadgeColor)}>
              {selectedScope}
            </span>
          )}
        </button>

        <div className="relative">
          <button
            onClick={() => setShowScopeDropdown(!showScopeDropdown)}
            className={cn(
              'bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer',
              compact ? 'p-1' : 'p-1.5'
            )}
            title="Chọn phạm vi Lưu / Tải Cloud (Edit, Dynamic, Review, Toàn bộ)"
          >
            <ChevronDown size={11} className={cn('transition-transform duration-200', showScopeDropdown && 'rotate-180')} />
          </button>

          {showScopeDropdown && (
            <div
              className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 min-w-[170px] flex flex-col gap-1 backdrop-blur-xl"
              onMouseLeave={() => setShowScopeDropdown(false)}
            >
              <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                Phạm vi Cloud Sync:
              </div>
              <button
                onClick={() => {
                  setSelectedScope('edit');
                  setShowScopeDropdown(false);
                }}
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer',
                  selectedScope === 'edit' ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Edit3 size={12} className="text-blue-400" />
                  <span>Tab Edit (Bản vẽ)</span>
                </span>
                {selectedScope === 'edit' && <Check size={12} />}
              </button>
              <button
                onClick={() => {
                  setSelectedScope('dynamic');
                  setShowScopeDropdown(false);
                }}
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer',
                  selectedScope === 'dynamic' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <GitMerge size={12} className="text-amber-400" />
                  <span>Tab Dynamic (Rules)</span>
                </span>
                {selectedScope === 'dynamic' && <Check size={12} />}
              </button>
              <button
                onClick={() => {
                  setSelectedScope('review');
                  setShowScopeDropdown(false);
                }}
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer',
                  selectedScope === 'review' ? 'bg-emerald-500/20 text-emerald-300' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Eye size={12} className="text-emerald-400" />
                  <span>Tab Review (Nhãn)</span>
                </span>
                {selectedScope === 'review' && <Check size={12} />}
              </button>
              <button
                onClick={() => {
                  setSelectedScope('all');
                  setShowScopeDropdown(false);
                }}
                className={cn(
                  'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left border-t border-slate-800 mt-0.5 cursor-pointer',
                  selectedScope === 'all' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-300 hover:bg-slate-800'
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Layers size={12} className="text-purple-400" />
                  <span>Tất cả (All Tabs)</span>
                </span>
                {selectedScope === 'all' && <Check size={12} />}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className={cn(
            'bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer',
            compact ? 'p-1' : 'p-1.5'
          )}
          title="Cài đặt khóa kết nối Cloudflare R2"
        >
          <Settings size={11} />
        </button>

        {showCleanButton && (
          <button
            onClick={handleCleanR2Garbage}
            className={cn(
              'flex items-center gap-1 rounded-md bg-slate-900 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-700/50 text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm active:scale-95 cursor-pointer',
              compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[11px] px-2 py-1.5'
            )}
            title="Dọn dẹp & giải phóng tất cả ảnh nền mồ côi trên Cloudflare R2"
          >
            <Sparkles size={10} className="shrink-0" />
            <span className="font-bold uppercase tracking-widest hidden md:inline">Clean R2</span>
          </button>
        )}
      </div>

      <R2UploadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStartExport={() => executeSync('upload', false, selectedScope)}
        uploading={false}
        uploadProgress={0}
      />
    </div>
  );
}
