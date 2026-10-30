import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { Link2, Image as ImageIcon, Trash2, RefreshCw, Search, X, GripHorizontal, Loader2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import { useOverlayStack } from '../../lib/zIndexManager';
import {
  ProjectMediaLinkItem,
  RemoteUnitImagesDoc,
  buildProjectMediaLinksList,
  deleteProjectMediaLinkItem,
  fetchAllCloudUnitImagesDocs,
} from './projectLinksImagesService';
import { ProjectLinksImagesRowItem } from './ProjectLinksImagesRowItem';

interface ProjectLinksImagesManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  canWrite: boolean;
  onConfirmAction?: (
    title: string,
    message: string,
    onConfirm: () => Promise<void> | void,
    confirmStyle?: 'primary' | 'danger',
    confirmText?: string
  ) => void;
}

export const ProjectLinksImagesManagerModal: React.FC<ProjectLinksImagesManagerModalProps> = ({
  isOpen,
  onClose,
  canWrite,
  onConfirmAction,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const appUsers = useAppStore((state) => state.appUsers);

  const [cloudUnitDocs, setCloudUnitDocs] = useState<RemoteUnitImagesDoc[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [placementFilter, setPlacementFilter] = useState<'all' | 'comment_modular' | 'layout_picture' | 'both'>('all');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'image' | 'pdf_drive' | 'link'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<ProjectMediaLinkItem | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const syncCloudDocs = useCallback(async () => {
    setLoadingCloud(true);
    try {
      const docs = await fetchAllCloudUnitImagesDocs();
      setCloudUnitDocs(docs);
      setRefreshTick((t) => t + 1);
    } finally {
      setLoadingCloud(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) syncCloudDocs();
  }, [isOpen, syncCloudDocs]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (previewItem) setPreviewItem(null);
        else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, previewItem]);

  const allItems = useMemo(() => {
    void refreshTick;
    return buildProjectMediaLinksList(projects, tasks, cloudUnitDocs, appUsers);
  }, [projects, tasks, cloudUnitDocs, appUsers, refreshTick]);

  const availableYears = useMemo(() => {
    const s = new Set<string>(['2024', '2025', '2026', '2027']);
    allItems.forEach((it) => { if (it.year) s.add(String(it.year)); });
    return Array.from(s).sort();
  }, [allItems]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allItems.filter((item) => {
      if (yearFilter !== 'all' && String(item.year) !== String(yearFilter)) return false;
      if (storeFilter !== 'all' && item.store.toUpperCase() !== storeFilter.toUpperCase()) return false;
      if (placementFilter === 'comment_modular' && !item.placements.includes('comment_modular')) return false;
      if (placementFilter === 'layout_picture' && !item.placements.includes('layout_picture')) return false;
      if (placementFilter === 'both' && !(item.placements.includes('comment_modular') && item.placements.includes('layout_picture'))) return false;
      if (mediaTypeFilter !== 'all' && item.mediaType !== mediaTypeFilter) return false;
      if (q) {
        const hay = `${item.projectCode} ${item.linkCodes} ${item.unitCode} ${item.projectName} ${item.location} ${item.year} ${item.store} ${item.url} ${item.title} ${item.authorName || ''} ${item.commentSnippet || ''} ${item.placementDetails.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allItems, yearFilter, storeFilter, placementFilter, mediaTypeFilter, searchQuery]);

  const stats = useMemo(() => {
    let commentCount = 0;
    let layoutCount = 0;
    let imageCount = 0;
    filteredItems.forEach((it) => {
      if (it.placements.includes('comment_modular')) commentCount++;
      if (it.placements.includes('layout_picture')) layoutCount++;
      if (it.mediaType === 'image') imageCount++;
    });
    return { total: filteredItems.length, commentCount, layoutCount, imageCount };
  }, [filteredItems]);

  const toggleSelectOne = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllFiltered = () => {
    if (filteredItems.length === 0) return;
    const allSelected = filteredItems.every((it) => selectedKeys.has(it.key));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((it) => (allSelected ? next.delete(it.key) : next.add(it.key)));
      return next;
    });
  };

  const handleCopyUrl = useCallback((key: string, url: string) => {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1500);
  }, []);

  const executeSingleDelete = useCallback(async (item: ProjectMediaLinkItem) => {
    setDeletingKey(item.key);
    try {
      await deleteProjectMediaLinkItem(item);
      setCloudUnitDocs((prev) =>
        prev.map((d) => ({
          ...d,
          images: (d.images || []).filter((img: any) => (typeof img === 'string' ? img : img?.url) !== item.url),
        }))
      );
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        next.delete(item.key);
        return next;
      });
      setRefreshTick((t) => t + 1);
      useAppStore.getState().setToast({
        title: 'Link / Image Deleted',
        message: `Removed from ${item.projectCode} (${item.store} • ${item.year}) across Comment & Layout.`,
        type: 'success',
      });
    } catch (err: any) {
      useAppStore.getState().setToast({
        title: 'Delete Failed',
        message: err?.message || 'Failed to delete link/image.',
        type: 'error',
      });
    } finally {
      setDeletingKey(null);
    }
  }, []);

  const handleRequestDeleteOne = useCallback(
    (item: ProjectMediaLinkItem) => {
      if (!canWrite) return;
      const msg = `Delete this ${item.mediaType === 'image' ? 'image' : 'link'} from project [${item.year} • ${item.store} • ${item.projectCode}]? This will remove it from Comment Modular, Layout Picture Gallery, and cloud storage.`;
      if (onConfirmAction) {
        onConfirmAction('Delete Project Link / Image', msg, () => executeSingleDelete(item), 'danger', 'Delete');
      } else {
        executeSingleDelete(item);
      }
    },
    [canWrite, onConfirmAction, executeSingleDelete]
  );

  const handleRequestBulkDelete = () => {
    if (!canWrite || selectedKeys.size === 0) return;
    const targets = filteredItems.filter((it) => selectedKeys.has(it.key));
    if (targets.length === 0) return;
    const msg = `Permanently delete ${targets.length} selected link(s) / image(s) across Comment Modular, Layout Picture, and cloud storage?`;
    const runBulk = async () => {
      setBulkDeleting(true);
      try {
        for (const item of targets) {
          await deleteProjectMediaLinkItem(item);
        }
        const deletedUrls = new Set(targets.map((t) => t.url));
        setCloudUnitDocs((prev) =>
          prev.map((d) => ({
            ...d,
            images: (d.images || []).filter((img: any) => !deletedUrls.has(typeof img === 'string' ? img : img?.url)),
          }))
        );
        setSelectedKeys(new Set());
        setRefreshTick((t) => t + 1);
        useAppStore.getState().setToast({
          title: 'Bulk Delete Completed',
          message: `Deleted ${targets.length} link(s) and image(s).`,
          type: 'success',
        });
      } finally {
        setBulkDeleting(false);
      }
    };

    if (onConfirmAction) {
      onConfirmAction(`Delete ${targets.length} Selected Items`, msg, runBulk, 'danger', 'Delete All');
    } else {
      runBulk();
    }
  };

  const zInfo = useOverlayStack({ layer: 'MODAL_BASE', isOpen, onClose, closeOnTabChange: true });

  if (!isOpen) return null;

  const allFilteredSelected = filteredItems.length > 0 && filteredItems.every((it) => selectedKeys.has(it.key));

  return createPortal(
    <div
      className={`fixed inset-0 ${zInfo.zClass} flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-hidden pointer-events-auto animate-in fade-in duration-150`}
      style={{ zIndex: zInfo.zValue || 180000 }}
      onClick={onClose}
    >
      <Draggable
        disabled={typeof window !== 'undefined' && window.innerWidth < 768}
        handle=".modal-handle"
        bounds="parent"
        nodeRef={nodeRef}
        cancel="button, input, select, a"
      >
        <div
          ref={nodeRef}
          onClick={(e) => e.stopPropagation()}
          className="bg-white dark:bg-[#1e1e20] rounded-2xl shadow-2xl w-[98vw] max-w-6xl h-[88vh] flex flex-col border border-slate-200 dark:border-[#333336] overflow-hidden"
        >
          {/* Draggable Header */}
          <div className="modal-handle cursor-grab active:cursor-grabbing px-4 py-3 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/90 dark:bg-[#18181a] select-none shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <GripHorizontal className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                <Link2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base text-slate-900 dark:text-[#e3e3e3] truncate">
                  Project Links & Attached Images Manager
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Audit & delete links/images attached by (Year • Store • Project Code) in Comment Modular & Layout Picture
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={syncCloudDocs}
                disabled={loadingCloud}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#38383c] bg-white dark:bg-[#252528] hover:bg-slate-50 dark:hover:bg-[#2f2f33] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                title="Refresh cloud unit image registries from Firestore"
              >
                <RefreshCw className={cn('w-3.5 h-3.5 text-blue-500', loadingCloud && 'animate-spin')} />
                <span className="hidden sm:inline">Sync Cloud</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/50 dark:hover:bg-[#28282a] transition-colors active:scale-95 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Filter & Telemetry Toolbar */}
          <div className="p-3 border-b border-slate-200 dark:border-[#333336] bg-white dark:bg-[#1e1e20] space-y-2.5 shrink-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#161618] border border-slate-200/70 dark:border-[#2c2c2f] flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Total Links</span>
                <span className="text-sm font-extrabold font-mono text-slate-800 dark:text-slate-100">{stats.total}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/70 dark:border-purple-900/40 flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase">Comment Modular</span>
                <span className="text-sm font-extrabold font-mono text-purple-700 dark:text-purple-300">{stats.commentCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200/70 dark:border-cyan-900/40 flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-600 dark:text-cyan-400 uppercase">Layout Picture</span>
                <span className="text-sm font-extrabold font-mono text-cyan-700 dark:text-cyan-300">{stats.layoutCount}</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/40 flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Image Files</span>
                <span className="text-sm font-extrabold font-mono text-emerald-700 dark:text-emerald-300">{stats.imageCount}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Project Code, Unit, Name, URL, Comment, User..."
                  className="w-full h-[34px] pl-8 pr-7 rounded-lg border border-slate-200 dark:border-[#444446] bg-slate-50 dark:bg-[#252528] text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">All Years</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year: {y}
                  </option>
                ))}
              </select>

              <select
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                className="h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">All Stores</option>
                <option value="HCM">HCM Store</option>
                <option value="HN">HN Store</option>
              </select>

              <select
                value={placementFilter}
                onChange={(e) => setPlacementFilter(e.target.value as any)}
                className="h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">All Locations (Comment & Layout)</option>
                <option value="comment_modular">Comment Modular Only</option>
                <option value="layout_picture">Layout Picture Only</option>
                <option value="both">Attached in Both</option>
              </select>

              <select
                value={mediaTypeFilter}
                onChange={(e) => setMediaTypeFilter(e.target.value as any)}
                className="h-[34px] px-2.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#252528] text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              >
                <option value="all">All Media Types</option>
                <option value="image">Images Only</option>
                <option value="pdf_drive">PDF / Google Drive</option>
                <option value="link">Web Links</option>
              </select>

              {canWrite && selectedKeys.size > 0 && (
                <button
                  type="button"
                  disabled={bulkDeleting}
                  onClick={handleRequestBulkDelete}
                  className="h-[34px] px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                >
                  {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Delete Selected ({selectedKeys.size})</span>
                </button>
              )}
            </div>
          </div>

          {/* Table View */}
          <div className="flex-1 overflow-auto min-h-0">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-[#161618] border-b border-slate-200 dark:border-[#333336] text-[11px] font-bold uppercase text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-2.5 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      className="rounded border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="p-2.5 w-28">Year / Store</th>
                  <th className="p-2.5 w-48">Project Code & Unit</th>
                  <th className="p-2.5 w-56">Attached Location</th>
                  <th className="p-2.5">Preview & Link / Comment Details</th>
                  <th className="p-2.5 w-32 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#2a2a2d] text-xs">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      No attached links or images match the current filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <ProjectLinksImagesRowItem
                      key={item.key}
                      item={item}
                      isChecked={selectedKeys.has(item.key)}
                      isDeleting={deletingKey === item.key}
                      isCopied={copiedKey === item.key}
                      canWrite={canWrite}
                      onToggleSelect={toggleSelectOne}
                      onPreview={setPreviewItem}
                      onCopyUrl={handleCopyUrl}
                      onDelete={handleRequestDeleteOne}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Image Lightbox Overlay */}
          {previewItem && (
            <div
              className="fixed inset-0 z-[200000] bg-black/80 flex items-center justify-center p-4"
              onClick={() => setPreviewItem(null)}
            >
              <div
                className="bg-white dark:bg-[#1e1e20] rounded-xl max-w-4xl max-h-[85vh] overflow-hidden border border-slate-200 dark:border-[#38383c] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <ImageIcon className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="font-mono font-bold text-xs text-blue-600 dark:text-[#8ab4f8]">
                      [{previewItem.year} • {previewItem.store} • {previewItem.projectCode}]
                    </span>
                    <span className="text-xs text-slate-700 dark:text-slate-200 truncate">{previewItem.projectName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewItem(null)}
                    className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2c2c30] text-slate-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-auto">
                  <img src={previewItem.url} alt={previewItem.title} className="max-w-full max-h-[70vh] object-contain" />
                </div>
              </div>
            </div>
          )}
        </div>
      </Draggable>
    </div>,
    document.body
  );
};

export default ProjectLinksImagesManagerModal;
