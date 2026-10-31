import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { GripHorizontal, Building, X, Link as LinkIcon, Check, Copy } from 'lucide-react';
import { MapVersion } from '../types';
import { DynamicUnitSummaryTable } from '../DynamicUnitSummaryTable';

export const ReviewTabModals = ({
  isSummaryTableOpen,
  setIsSummaryTableOpen,
  activeVersion,
  store,
  location,
  effectiveYear,
  dynamicSummaryList,
  selectedReviewUnitId,
  setSelectedReviewUnitId,
  showShareModal,
  setShowShareModal,
  shareImage,
  actualShareLink,
  copyToClipboard,
  copiedLink,
  exportModalVisible,
  setExportModalVisible,
  exportFormat,
  exportPaperSize,
  setExportPaperSize,
  exportQuality,
  setExportQuality,
  handleConfirmExport,
  selectedVersionsToExport,
  setSelectedVersionsToExport,
  versions,
  activeVersionId,
}: {
  isSummaryTableOpen: boolean;
  setIsSummaryTableOpen: (open: boolean) => void;
  activeVersion?: MapVersion;
  store: string;
  location: string;
  effectiveYear: string;
  dynamicSummaryList: any[];
  selectedReviewUnitId: string | null;
  setSelectedReviewUnitId: (id: string | null) => void;
  showShareModal: boolean;
  setShowShareModal: (open: boolean) => void;
  shareImage: string | null;
  actualShareLink: string;
  copyToClipboard: () => void;
  copiedLink: boolean;
  exportModalVisible: boolean;
  setExportModalVisible: (open: boolean) => void;
  exportFormat: 'pdf' | 'jpeg' | 'r2_jpeg' | 'drive';
  exportPaperSize: 'a4' | 'a3' | 'a2' | 'original';
  setExportPaperSize: (size: 'a4' | 'a3' | 'a2' | 'original') => void;
  exportQuality: 'high' | 'medium' | 'low';
  setExportQuality: (q: 'high' | 'medium' | 'low') => void;
  handleConfirmExport: () => void;
  selectedVersionsToExport: Record<string, boolean>;
  setSelectedVersionsToExport: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  versions: MapVersion[];
  activeVersionId: string | null;
}) => {
  const summaryModalRef = useRef<HTMLDivElement>(null);
  const shareModalRef = useRef<HTMLDivElement>(null);
  const exportModalRef = useRef<HTMLDivElement>(null);

  if (typeof document === 'undefined') return null;

  return (
    <>
      {isSummaryTableOpen &&
        createPortal(
          <div className="fixed inset-0 z-[99998] pointer-events-none flex items-center justify-center p-4">
            <Draggable handle=".summary-modal-handle" nodeRef={summaryModalRef}>
              <div
                ref={summaryModalRef}
                className="pointer-events-auto bg-slate-900/95 border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-slate-200 backdrop-blur-md flex flex-col max-h-[85vh]"
              >
                <div className="summary-modal-handle cursor-grab active:cursor-grabbing px-5 py-3.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between select-none">
                  <div className="flex items-center gap-2">
                    <GripHorizontal className="text-slate-400 w-5 h-5" />
                    <Building className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                      Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế [
                      {(activeVersion?.store as any) || store} •{' '}
                      {activeVersion?.location || location} •{' '}
                      {activeVersion?.year || effectiveYear}]
                    </h3>
                  </div>
                  <button
                    onClick={() => setIsSummaryTableOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                  <DynamicUnitSummaryTable
                    summaryList={dynamicSummaryList}
                    selectedUnitId={selectedReviewUnitId}
                    onSelectUnit={(uid) => {
                      setSelectedReviewUnitId(uid);
                    }}
                    title={`Chi tiết ${dynamicSummaryList.length} gian hàng theo bộ luật`}
                  />
                </div>
              </div>
            </Draggable>
          </div>,
          document.body
        )}

      {showShareModal &&
        createPortal(
          <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-hidden">
            <Draggable
              disabled={typeof window !== 'undefined' && window.innerWidth < 640}
              handle=".modal-handle"
              bounds="parent"
              nodeRef={shareModalRef}
              cancel="button, input, select, textarea, .no-drag"
            >
              <div
                ref={shareModalRef}
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-w-[calc(100vw-1rem)] sm:max-w-3xl max-h-[88vh] flex flex-col shadow-2xl relative overflow-hidden my-auto pointer-events-auto"
              >
                <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/95 select-none">
                  <div className="flex items-center gap-3">
                    <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                    <div className="w-10 h-10 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
                      <LinkIcon size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-bold text-white">
                        Share Review Viewer
                      </h3>
                      <p className="text-xs sm:text-sm text-slate-400">
                        Copy this link to share the current view.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowShareModal(false)}
                    className="p-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg z-10 transition-colors no-drag"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="flex-1 overflow-auto p-4 sm:p-6 bg-bg-dark flex justify-center items-center custom-scrollbar min-h-0">
                  {shareImage && (
                    <img
                      src={shareImage}
                      alt="Share preview"
                      loading="lazy"
                      decoding="async"
                      className="max-w-full max-h-full object-contain rounded-xl border border-slate-800 shadow-xl"
                    />
                  )}
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex flex-col sm:flex-row gap-3 shrink-0">
                  <input
                    type="text"
                    readOnly
                    value={actualShareLink}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-4 py-2.5 text-slate-300 font-mono text-xs sm:text-sm outline-none"
                  />
                  <button
                    onClick={copyToClipboard}
                    className="px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors text-sm shrink-0"
                  >
                    {copiedLink ? <Check size={18} /> : <Copy size={18} />}
                    {copiedLink ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </Draggable>
          </div>,
          document.body
        )}

      {exportModalVisible &&
        createPortal(
          <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-6 overflow-hidden">
            <Draggable
              disabled={typeof window !== 'undefined' && window.innerWidth < 640}
              handle=".modal-handle"
              bounds="parent"
              nodeRef={exportModalRef}
              cancel="button, input, select, textarea, label, .no-drag"
            >
              <div
                ref={exportModalRef}
                className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-w-[calc(100vw-1rem)] sm:max-w-xl flex flex-col shadow-2xl relative overflow-hidden max-h-[88vh] my-auto pointer-events-auto"
              >
                <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-6 border-b border-slate-800 shrink-0 select-none bg-slate-900/95">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                      <h3 className="text-lg sm:text-xl font-bold text-white uppercase tracking-wider">
                        {exportFormat === 'drive'
                          ? 'Upload to Drive'
                          : exportFormat === 'r2_jpeg'
                          ? 'Upload to Cloud R2'
                          : `Export ${exportFormat.toUpperCase()}`}
                      </h3>
                    </div>
                    <button
                      onClick={() => setExportModalVisible(false)}
                      className="p-1.5 bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors no-drag"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1 ml-7">
                    Select which versions to include in the export.
                  </p>

                  <div className="mt-4 flex flex-col gap-3 relative">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      {exportFormat === 'pdf' ||
                      exportFormat === 'drive' ||
                      exportFormat === 'r2_jpeg' ? (
                        <div className="flex items-center gap-2 sm:gap-3">
                          <label className="text-xs sm:text-sm font-medium text-slate-300">
                            Paper Size:
                          </label>
                          <select
                            value={exportPaperSize}
                            onChange={(e) => setExportPaperSize(e.target.value as any)}
                            className="bg-slate-950 text-white text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700 outline-none"
                          >
                            <option value="a4">A4</option>
                            <option value="a3">A3</option>
                            <option value="a2">A2</option>
                            <option value="original">Original Dimensions</option>
                          </select>
                        </div>
                      ) : (
                        <div></div>
                      )}

                      <div className="flex justify-end gap-2 shrink-0">
                        <button
                          onClick={() => setExportModalVisible(false)}
                          className="px-3 py-1.5 text-xs hover:bg-slate-800 text-slate-300 font-bold rounded-lg transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleConfirmExport}
                          disabled={!Object.values(selectedVersionsToExport).some((v) => v)}
                          className="px-3.5 sm:px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-lg flex items-center transition-colors shadow-sm"
                        >
                          {exportFormat === 'drive'
                            ? 'Upload Selected'
                            : exportFormat === 'r2_jpeg'
                            ? 'Xác nhận & Tiếp tục'
                            : 'Export Selected'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <label className="text-xs sm:text-sm font-medium text-slate-300 shrink-0">
                        Quality / File Size:
                      </label>
                      <select
                        value={exportQuality}
                        onChange={(e) => setExportQuality(e.target.value as any)}
                        className="bg-slate-950 text-white text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-700 outline-none w-full sm:w-64"
                      >
                        <option value="high">High (4x resolution, large size)</option>
                        <option value="medium">Medium (2x resolution, medium size)</option>
                        <option value="low">Low (1x resolution, small size)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {exportFormat === 'r2_jpeg' && (
                  <div className="px-6 pt-4">
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-amber-400">
                        <span>⚡</span> Xuất Cloud R2 An Toàn & Chuẩn Xác (Targeted File Overwrite)
                      </div>
                      <p className="text-slate-300">
                        Hệ thống chỉ quét và cập nhật/ghi đè{' '}
                        <strong className="text-white">
                          đúng tên file của phiên bản tương ứng
                        </strong>{' '}
                        trên Cloudflare R2, bảo toàn nguyên vẹn tất cả dữ liệu, sơ đồ và các tầng
                        khác trong bucket.
                      </p>
                    </div>
                  </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto min-h-0 flex flex-col gap-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg border border-slate-700 bg-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={
                        versions.length > 0 && versions.every((v) => selectedVersionsToExport[v.id])
                      }
                      onChange={(e) => {
                        const newSel: Record<string, boolean> = {};
                        versions.forEach((v) => (newSel[v.id] = e.target.checked));
                        setSelectedVersionsToExport(newSel);
                      }}
                      className="w-5 h-5 rounded bg-slate-900 border-slate-600 focus:ring-brand-500"
                    />
                    <span className="text-white font-bold">Select All</span>
                  </label>
                  <div className="h-px bg-slate-800 my-1"></div>
                  {versions.map((v) => (
                    <label
                      key={v.id}
                      className="flex items-center gap-3 p-3.5 rounded-lg border border-slate-800 bg-slate-950 cursor-pointer hover:bg-slate-900 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedVersionsToExport[v.id]}
                        onChange={(e) => {
                          setSelectedVersionsToExport((prev) => ({
                            ...prev,
                            [v.id]: e.target.checked,
                          }));
                        }}
                        className="w-5 h-5 rounded bg-slate-900 border-slate-600 focus:ring-brand-500"
                      />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-200">
                          {v.location ? `[${v.location}] ` : ''}
                          {v.name}
                        </span>
                        {v.id === activeVersionId && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-brand-900/60 text-brand-300 border border-brand-700/50">
                            Đang xem
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </Draggable>
          </div>,
          document.body
        )}
    </>
  );
};
