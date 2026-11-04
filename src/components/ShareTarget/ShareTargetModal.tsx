import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useDragControls } from 'motion/react';
import {
  Share2,
  GripHorizontal,
  X,
  Upload,
  Sparkles,
  Database,
  CloudUpload,
  MapPin,
  Trash2,
  CheckCircle2,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Project } from '../../types';
import { localDb, SharedMediaRecord } from '../../lib/localDb';
import { extractAllProjectCodes } from '../../lib/utils';
import { isTaskBelongsToProject } from '../../lib/taskStateService';
import {
  consumeSharedInboxPayloads,
  createSimulatedZaloInspectionFile,
  flushPendingSharedMediaQueue,
  IncomingSharedFileItem,
  saveSharedMediaToDexieAndR2,
} from '../../lib/shareTargetService';
import {
  PRESET_INSPECTION_PINS,
  ShareTargetSelectorsPanel,
} from './ShareTargetModalParts/ShareTargetSelectorsPanel';
import { ShareTargetGuideAndQueuePanel } from './ShareTargetModalParts/ShareTargetGuideAndQueuePanel';

function normalizeStore(store?: string | null): string {
  if (!store) return 'HCM';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  return 'HCM';
}

export const ShareTargetModal: React.FC = React.memo(() => {
  const dragControls = useDragControls();
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const locations = useAppStore((state) => state.locations);
  const globalStoreFilter = useAppStore((state) => state.globalStoreFilter);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setToast = useAppStore((state) => state.setToast);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'assign' | 'queue'>('assign');
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  // Shared payload state
  const [sharedFiles, setSharedFiles] = useState<IncomingSharedFileItem[]>([]);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [titleInput, setTitleInput] = useState('');
  const [captionInput, setCaptionInput] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');

  // Target selection state (4 Composite Keys + Unit + Pin)
  const [selectedStore, setSelectedStore] = useState<string>(() => normalizeStore(globalStoreFilter));
  const [selectedYear, setSelectedYear] = useState<string>(() =>
    globalYearFilter && globalYearFilter !== 'all' ? String(globalYearFilter) : 'ALL'
  );
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [unitCode, setUnitCode] = useState<string>('');

  // Pin selection state
  const [pinMode, setPinMode] = useState<'preset' | 'task' | 'custom'>('preset');
  const [selectedPinId, setSelectedPinId] = useState<string>(PRESET_INSPECTION_PINS[0].id);
  const [customPinLabel, setCustomPinLabel] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [pinCoords, setPinCoords] = useState<{ x: number; y: number } | null>({ x: 50, y: 50 });

  // Saving & Queue status
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [recentRecords, setRecentRecords] = useState<SharedMediaRecord[]>([]);
  const [isFlushing, setIsFlushing] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshLocalRecords = useCallback(async () => {
    try {
      const all = await localDb.sharedMedia.orderBy('updatedAt').reverse().limit(30).toArray();
      setRecentRecords(all);
    } catch {}
  }, []);

  const pullFromServiceWorkerInbox = useCallback(async () => {
    const payloads = await consumeSharedInboxPayloads();
    if (payloads.length === 0) return false;

    const latest = payloads[payloads.length - 1];
    const allFiles = payloads.flatMap((p) => p.files);
    if (allFiles.length > 0) {
      setSharedFiles((prev) => [...allFiles, ...prev]);
      setActiveFileIndex(0);
    }
    if (latest.title) setTitleInput(latest.title);
    const combinedCaption = [latest.text, latest.url].filter(Boolean).join(' ');
    if (combinedCaption) setCaptionInput(combinedCaption);
    if (latest.url) setSharedUrl(latest.url);

    setActiveTab('assign');
    setIsOpen(true);
    setToast({
      title: 'Zalo Share Target Received',
      message: `Loaded ${allFiles.length} shared photo(s) into Taka PM (Offline-Ready). Select Project / Unit / Pin to save.`,
      type: 'info',
    });
    return true;
  }, [setToast]);

  // Check URL params (?share-target-received=1) & SW messages on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const hasShareParam =
      url.searchParams.has('share-target-received') || url.searchParams.has('share-target');

    pullFromServiceWorkerInbox().then((found) => {
      if (hasShareParam) {
        url.searchParams.delete('share-target-received');
        url.searchParams.delete('share-target');
        window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        if (!found) {
          setIsOpen(true);
        }
      }
    });

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'TAKA_SHARE_TARGET_RECEIVED') {
        pullFromServiceWorkerInbox();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    const handleOpenModalEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.simulate) {
        handleSimulateZaloShare();
      } else {
        refreshLocalRecords();
        setIsOpen(true);
      }
    };

    window.addEventListener('taka_open_share_target_modal', handleOpenModalEvent);
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
      window.removeEventListener('taka_open_share_target_modal', handleOpenModalEvent);
    };
  }, [pullFromServiceWorkerInbox, refreshLocalRecords]);

  // Online / Offline listener & Auto-flush pending Dexie R2 uploads
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushPendingSharedMediaQueue().then(({ synced }) => {
        if (synced > 0) {
          refreshLocalRecords();
          setToast({
            title: 'Cloudflare R2 Auto-Sync Complete',
            message: `Automatically uploaded ${synced} offline shared photo(s) from IndexedDB to Cloudflare R2.`,
            type: 'success',
          });
        }
      });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Initial background flush check on boot
    flushPendingSharedMediaQueue().then(() => refreshLocalRecords());

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, [refreshLocalRecords, setToast]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    refreshLocalRecords();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSaving, refreshLocalRecords]);

  const activeProjects = useMemo(
    () => (projects || []).filter((p) => !p.isDeleted),
    [projects]
  );

  const availableYears = useMemo(() => {
    const years = new Set<string>(['2025', '2026', '2027']);
    activeProjects.forEach((p) => {
      if (p.year) years.add(String(p.year).trim());
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [activeProjects]);

  const availableLocations = useMemo(() => {
    const locs = new Set<string>(['B2', 'B1', 'L1', 'L2', 'L3', 'L4', 'L5', 'STORE']);
    (locations || []).forEach((l) => {
      if (l) locs.add(String(l).trim().toUpperCase());
    });
    activeProjects.forEach((p) => {
      if (p.location) locs.add(String(p.location).trim().toUpperCase());
    });
    return Array.from(locs);
  }, [locations, activeProjects]);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    return activeProjects.filter((p) => {
      if (normalizeStore(p.store) !== selectedStore) return false;
      if (selectedYear !== 'ALL' && String(p.year).trim() !== selectedYear) return false;
      if (
        selectedLocation !== 'ALL' &&
        String(p.location || '').trim().toUpperCase() !== selectedLocation
      ) {
        return false;
      }
      if (!q) return true;
      const codeMatch = String(p.code || '').toLowerCase().includes(q);
      const nameMatch = String(p.name || '').toLowerCase().includes(q);
      const linkMatch = String(p.linkCodes || '').toLowerCase().includes(q);
      return codeMatch || nameMatch || linkMatch;
    });
  }, [activeProjects, selectedStore, selectedYear, selectedLocation, projectSearch]);

  const selectedProject = useMemo(
    () => activeProjects.find((p) => p.id === selectedProjectId) || null,
    [activeProjects, selectedProjectId]
  );

  const suggestedUnits = useMemo(() => {
    const set = new Set<string>();
    if (selectedProject) {
      extractAllProjectCodes(selectedProject).forEach((c) => {
        if (c) set.add(c.trim());
      });
    }
    const floorTag =
      selectedLocation !== 'ALL'
        ? selectedLocation
        : selectedProject?.location || 'L1';
    set.add(`COLOR_LEGEND_${String(floorTag).toUpperCase()}`);
    return Array.from(set);
  }, [selectedProject, selectedLocation]);

  const projectTasks = useMemo(() => {
    if (!selectedProject) return [];
    return (tasks || []).filter(
      (t) => !t.isDeleted && isTaskBelongsToProject(t, selectedProject)
    );
  }, [tasks, selectedProject]);

  const handleSelectProject = useCallback((proj: Project | null) => {
    if (!proj) {
      setSelectedProjectId('');
      return;
    }
    setSelectedProjectId(proj.id || '');
    setSelectedStore(normalizeStore(proj.store));
    if (proj.year) setSelectedYear(String(proj.year));
    const codes = extractAllProjectCodes(proj);
    if (codes.length > 0) {
      setUnitCode(codes[0]);
    } else if (proj.code) {
      setUnitCode(proj.code);
    }
  }, []);

  const handleAddFilesFromInput = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const added: IncomingSharedFileItem[] = Array.from(fileList).map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
      size: file.size,
      type: file.type || 'image/jpeg',
    }));
    setSharedFiles((prev) => [...prev, ...added]);
    setActiveFileIndex(0);
  }, []);

  const handleSimulateZaloShare = useCallback(async () => {
    const defaultProj = filteredProjects[0] || activeProjects[0] || null;
    const sampleUnit = defaultProj?.code || unitCode || 'L1-102';
    const sampleFile = await createSimulatedZaloInspectionFile(sampleUnit);
    const item: IncomingSharedFileItem = {
      file: sampleFile,
      previewUrl: URL.createObjectURL(sampleFile),
      name: sampleFile.name,
      size: sampleFile.size,
      type: sampleFile.type,
    };
    setSharedFiles([item]);
    setActiveFileIndex(0);
    if (defaultProj && !selectedProjectId) {
      handleSelectProject(defaultProj);
    } else if (!unitCode) {
      setUnitCode(sampleUnit);
    }
    setTitleInput(`${sampleUnit} Ceiling MEP & Sprinkler Acceptance`);
    setCaptionInput(
      `[Zalo Contractor Group] Completed pressure test & ceiling framing inspection at unit ${sampleUnit}. Ready for Takashimaya PM sign-off.`
    );
    setPinCoords({ x: 54, y: 42 });
    setActiveTab('assign');
    setIsOpen(true);
  }, [filteredProjects, activeProjects, unitCode, selectedProjectId, handleSelectProject]);

  const handlePhotoClickForPin = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(2, Math.min(98, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(2, Math.min(98, ((e.clientY - rect.top) / rect.height) * 100));
    setPinCoords({ x, y });
  };

  const handleSaveToDexieAndR2 = async () => {
    if (sharedFiles.length === 0) {
      setToast({
        title: 'No Shared Photo Selected',
        message: 'Please attach a photo or click "Simulate Zalo Share" first.',
        type: 'warning',
      });
      return;
    }

    const effectiveUnit = (unitCode || selectedProject?.code || 'GENERAL-UNIT').trim();
    const targetTask =
      pinMode === 'task' && selectedTaskId
        ? projectTasks.find((t) => t.id === selectedTaskId) || null
        : null;

    let resolvedPinId = selectedPinId;
    let resolvedPinLabel =
      PRESET_INSPECTION_PINS.find((p) => p.id === selectedPinId)?.label || 'Inspection Pin';

    if (pinMode === 'task' && targetTask) {
      resolvedPinId = `task_${targetTask.id}`;
      resolvedPinLabel = `Task: ${targetTask.name}`;
    } else if (pinMode === 'custom' && customPinLabel.trim()) {
      resolvedPinId = `custom_${Date.now()}`;
      resolvedPinLabel = customPinLabel.trim();
    }

    setIsSaving(true);
    setStatusMessage('Saving directly to IndexedDB (Dexie)...');

    try {
      const result = await saveSharedMediaToDexieAndR2(
        {
          files: sharedFiles.map((f) => f.file),
          title: titleInput,
          caption: [captionInput, sharedUrl].filter(Boolean).join(' '),
          sharedUrl,
          store: selectedStore,
          year:
            selectedYear !== 'ALL'
              ? selectedYear
              : String(selectedProject?.year || new Date().getFullYear()),
          location:
            selectedLocation !== 'ALL'
              ? selectedLocation
              : String(selectedProject?.location || 'L1'),
          project: selectedProject,
          unitCode: effectiveUnit,
          pinId: resolvedPinId,
          pinLabel: resolvedPinLabel,
          pinX: pinCoords?.x,
          pinY: pinCoords?.y,
          targetTask,
        },
        (msg) => setStatusMessage(msg)
      );

      await refreshLocalRecords();

      setToast({
        title:
          result.syncedToR2Count > 0
            ? 'Saved to IndexedDB & Synced to Cloudflare R2'
            : 'Saved Offline to IndexedDB (Dexie)',
        message:
          result.syncedToR2Count > 0
            ? `${result.savedCount} photo(s) linked to ${effectiveUnit} (${resolvedPinLabel}) & uploaded to R2.`
            : `${result.savedCount} photo(s) stored in IndexedDB (Offline). Will auto-push to Cloudflare R2 when online.`,
        type: 'success',
      });

      setSharedFiles([]);
      setTitleInput('');
      setCaptionInput('');
      setSharedUrl('');
      setActiveTab('queue');
    } catch (err: any) {
      setToast({
        title: 'Save Error',
        message: err?.message || 'Failed to save shared media.',
        type: 'error',
      });
    } finally {
      setIsSaving(false);
      setStatusMessage('');
    }
  };

  const handleManualFlushQueue = async () => {
    setIsFlushing(true);
    try {
      const { synced, remaining } = await flushPendingSharedMediaQueue();
      await refreshLocalRecords();
      setToast({
        title: synced > 0 ? 'Cloudflare R2 Sync Complete' : 'Queue Status',
        message:
          synced > 0
            ? `Uploaded ${synced} pending item(s) to Cloudflare R2 (${remaining} remaining).`
            : remaining > 0
            ? 'Could not reach Cloudflare R2. Items remain safely in IndexedDB (Dexie).'
            : 'All IndexedDB items are already synced with Cloudflare R2.',
        type: synced > 0 ? 'success' : 'info',
      });
    } finally {
      setIsFlushing(false);
    }
  };

  const pendingCount = useMemo(
    () => recentRecords.filter((r) => r.syncStatus === 'pending_r2').length,
    [recentRecords]
  );

  if (!isOpen) return null;

  const currentFile = sharedFiles[activeFileIndex] || sharedFiles[0] || null;

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        className="w-full max-w-5xl max-h-[92dvh] flex flex-col rounded-2xl bg-white dark:bg-[#1a1a1d] border border-slate-200 dark:border-[#333338] shadow-2xl overflow-hidden"
      >
        {/* Draggable Modal Header */}
        <div
          onPointerDown={(e) => dragControls.start(e)}
          className="modal-handle cursor-grab active:cursor-grabbing select-none px-4 py-3 bg-slate-900 dark:bg-[#121214] text-white flex items-center justify-between gap-3 border-b border-slate-800 shrink-0"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
            <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-extrabold tracking-wide truncate">
                  Select Project / Layout Unit / Pin (Web Share Target)
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isOnline ? 'Online (Dexie + R2 Ready)' : 'Offline Mode (Dexie Local-First)'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Receive inspection photos & notes from Zalo → Save 0ms to IndexedDB (Dexie) + Push to Cloudflare R2
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('assign')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                activeTab === 'assign'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              Assign Photo ({sharedFiles.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                activeTab === 'queue'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <span>Dexie & R2 Log ({recentRecords.length})</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
                  {pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {activeTab === 'queue' ? (
            <ShareTargetGuideAndQueuePanel
              recentRecords={recentRecords}
              pendingCount={pendingCount}
              isFlushing={isFlushing}
              onFlushQueue={handleManualFlushQueue}
              onSimulateZaloShare={handleSimulateZaloShare}
              canInstallPwa={Boolean(deferredInstallPrompt)}
              onTriggerInstallPwa={() => {
                if (deferredInstallPrompt) {
                  deferredInstallPrompt.prompt();
                }
              }}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left Column: Shared Image Preview & Interactive Pin Placement */}
              <div className="lg:col-span-5 flex flex-col gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#222225] border border-slate-200 dark:border-[#36363a] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      Shared Inspection Media ({sharedFiles.length})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.pdf"
                        multiple
                        className="hidden"
                        onChange={(e) => handleAddFilesFromInput(e.target.files)}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#444446] text-slate-700 dark:text-slate-200 hover:border-blue-500 inline-flex items-center gap-1 cursor-pointer active:scale-95"
                      >
                        <Upload className="w-3 h-3 text-blue-600" />
                        Select Photo
                      </button>
                      <button
                        type="button"
                        onClick={handleSimulateZaloShare}
                        className="px-2 py-1 rounded-lg text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1 cursor-pointer active:scale-95"
                        title="Generate a sample Zalo inspection photo & caption to test immediately"
                      >
                        <Sparkles className="w-3 h-3" />
                        Simulate Zalo Share
                      </button>
                    </div>
                  </div>

                  {currentFile ? (
                    <div className="flex flex-col gap-2">
                      <div
                        onClick={handlePhotoClickForPin}
                        className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-slate-900 border border-slate-300 dark:border-[#444446] cursor-crosshair select-none group"
                        title="Click anywhere on the image to place the Inspection Pin marker"
                      >
                        <img
                          src={currentFile.previewUrl}
                          alt={currentFile.name}
                          className="w-full h-full object-contain"
                        />
                        {pinCoords && (
                          <div
                            style={{ left: `${pinCoords.x}%`, top: `${pinCoords.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none flex flex-col items-center"
                          >
                            <div className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-extrabold shadow-md whitespace-nowrap mb-0.5">
                              {unitCode || 'PIN'} ({pinCoords.x.toFixed(0)}%, {pinCoords.y.toFixed(0)}%)
                            </div>
                            <MapPin className="w-6 h-6 text-rose-500 drop-shadow-md fill-rose-500/30" />
                          </div>
                        )}
                        <div className="absolute bottom-2 inset-x-2 px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-xs text-[10px] text-slate-200 flex items-center justify-between">
                          <span className="truncate font-mono">{currentFile.name}</span>
                          <span className="text-emerald-300 font-bold shrink-0 ml-2">
                            Click photo to move Pin
                          </span>
                        </div>
                      </div>

                      {sharedFiles.length > 1 && (
                        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                          {sharedFiles.map((f, idx) => (
                            <div key={`${f.name}_${idx}`} className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() => setActiveFileIndex(idx)}
                                className={`w-14 h-14 rounded-lg overflow-hidden border-2 cursor-pointer ${
                                  idx === activeFileIndex
                                    ? 'border-blue-600'
                                    : 'border-transparent opacity-70 hover:opacity-100'
                                }`}
                              >
                                <img
                                  src={f.previewUrl}
                                  alt={f.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setSharedFiles((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center text-[9px] cursor-pointer"
                                title="Remove photo"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full aspect-[4/3] rounded-xl border-2 border-dashed border-slate-300 dark:border-[#444446] hover:border-blue-500 bg-white dark:bg-[#18181b] flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-colors"
                    >
                      <Share2 className="w-8 h-8 text-blue-500 mb-2 opacity-80" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        Waiting for Zalo Share Target or Click to Select Photo
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                        Long-press any photo in Zalo → Share → select <strong>Taka PM</strong>, or click{' '}
                        <strong>Simulate Zalo Share</strong> above to test right now.
                      </p>
                    </div>
                  )}
                </div>

                {/* Architecture Pipeline Summary Card */}
                <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/70 dark:border-blue-900/50 text-[11px] text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" />
                    <span>Dual Persistence Pipeline (Dexie + Cloudflare R2)</span>
                  </div>
                  <p>
                    • <strong>Step A (0ms Offline-Safe):</strong> Photo is compressed to WebP & saved into{' '}
                    <code className="font-mono text-blue-700 dark:text-blue-300">localDb.sharedMedia</code> + linked to
                    Layout Unit & Project immediately.
                  </p>
                  <p>
                    • <strong>Step B (Cloud Sync):</strong> Automatically uploads to{' '}
                    <code className="font-mono text-blue-700 dark:text-blue-300">Taka-Pm-folder/</code> on Cloudflare R2
                    and broadcasts real-time delta to all devices.
                  </p>
                </div>
              </div>

              {/* Right Column: Project / Layout Unit / Pin Selectors */}
              <div className="lg:col-span-7">
                <ShareTargetSelectorsPanel
                  selectedStore={selectedStore}
                  setSelectedStore={setSelectedStore}
                  selectedYear={selectedYear}
                  setSelectedYear={setSelectedYear}
                  selectedLocation={selectedLocation}
                  setSelectedLocation={setSelectedLocation}
                  availableYears={availableYears}
                  availableLocations={availableLocations}
                  filteredProjects={filteredProjects}
                  projectSearch={projectSearch}
                  setProjectSearch={setProjectSearch}
                  selectedProjectId={selectedProjectId}
                  onSelectProject={handleSelectProject}
                  unitCode={unitCode}
                  setUnitCode={setUnitCode}
                  suggestedUnits={suggestedUnits}
                  pinMode={pinMode}
                  setPinMode={setPinMode}
                  selectedPinId={selectedPinId}
                  setSelectedPinId={setSelectedPinId}
                  customPinLabel={customPinLabel}
                  setCustomPinLabel={setCustomPinLabel}
                  selectedTaskId={selectedTaskId}
                  setSelectedTaskId={setSelectedTaskId}
                  projectTasks={projectTasks}
                  pinCoords={pinCoords}
                  setPinCoords={setPinCoords}
                  titleInput={titleInput}
                  setTitleInput={setTitleInput}
                  captionInput={captionInput}
                  setCaptionInput={setCaptionInput}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Action Bar */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-[#141417] border-t border-slate-200 dark:border-[#2e2e32] flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            {statusMessage ? (
              <span className="text-blue-600 dark:text-blue-400 font-bold inline-flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {statusMessage}
              </span>
            ) : (
              <span>
                Target:{' '}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  [{selectedStore} • {selectedProject?.year || selectedYear}] {unitCode || selectedProject?.code || 'Select Unit'}
                </strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#28282c] transition-colors cursor-pointer"
            >
              Close
            </button>
            {activeTab === 'assign' && (
              <button
                type="button"
                onClick={handleSaveToDexieAndR2}
                disabled={isSaving || sharedFiles.length === 0}
                className="px-5 py-2 rounded-xl text-xs font-extrabold bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white shadow-md inline-flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
              >
                {isSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isOnline ? (
                  <CloudUpload className="w-4 h-4" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                <span>
                  {isSaving
                    ? 'Saving...'
                    : isOnline
                    ? 'Save to IndexedDB & Push to Cloudflare R2'
                    : 'Save Offline to IndexedDB (Auto-Sync R2 Later)'}
                </span>
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
});
