import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { GripHorizontal, Search, X as CloseIcon, Plus, Copy, Building } from 'lucide-react';
import { MapVersion } from '../types';
import { cn } from '../../../lib/utils';
import { DebouncedSearchInput } from '../../../../DebouncedSearchInput';
import { DynamicUnitSummaryTable } from '../DynamicUnitSummaryTable';

export function ToolButton({
  icon: Icon,
  active,
  onClick,
  title,
  disabled,
}: {
  icon: any;
  active: boolean;
  onClick: () => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'p-1 rounded transition-all flex items-center justify-center',
        disabled ? 'opacity-30 cursor-not-allowed' : 'hover:bg-slate-800',
        active ? 'bg-brand-600/30 text-brand-300 shadow-inner' : 'text-slate-400'
      )}
    >
      <Icon size={12} />
    </button>
  );
}

export function createGridPattern(gridSize: number) {
  const canvas = document.createElement('canvas');
  const size = Math.max(10, Math.ceil(gridSize * 10));
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    const step = Math.max(0.1, gridSize);
    for (let i = 0; i <= size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  }
  return canvas;
}

interface EditTabModalsProps {
  isNamingModalOpen: boolean;
  setIsNamingModalOpen: (v: boolean) => void;
  namingCallback: { resolve: (name: string) => void; reject: () => void } | null;
  searchUnit: string;
  setSearchUnit: (v: string) => void;
  handleSelectUnit: (name: string) => void;
  masterUnits: { unit: string; floor?: string; size?: string | number }[];
  isCopyBgModalOpen: boolean;
  setIsCopyBgModalOpen: (v: boolean) => void;
  activeVersion: MapVersion | undefined;
  effectiveYear: string;
  copyBgSearchTerm: string;
  setCopyBgSearchTerm: (v: string) => void;
  showAllVersionsForCopy: boolean;
  setShowAllVersionsForCopy: (v: boolean) => void;
  filteredCopyVersions: MapVersion[];
  handleCopyBackgroundFromVersion: (sourceVer: MapVersion) => void;
  isSummaryTableOpen: boolean;
  setIsSummaryTableOpen: (v: boolean) => void;
  dynamicSummaryList: any[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
}

export const EditTabModals: React.FC<EditTabModalsProps> = React.memo(
  ({
    isNamingModalOpen,
    setIsNamingModalOpen,
    namingCallback,
    searchUnit,
    setSearchUnit,
    handleSelectUnit,
    masterUnits,
    isCopyBgModalOpen,
    setIsCopyBgModalOpen,
    activeVersion,
    effectiveYear,
    copyBgSearchTerm,
    setCopyBgSearchTerm,
    showAllVersionsForCopy,
    setShowAllVersionsForCopy,
    filteredCopyVersions,
    handleCopyBackgroundFromVersion,
    isSummaryTableOpen,
    setIsSummaryTableOpen,
    dynamicSummaryList,
    selectedId,
    setSelectedId,
  }) => {
    const namingModalRef = useRef<HTMLDivElement>(null);
    const copyBgModalRef = useRef<HTMLDivElement>(null);
    const summaryModalRef = useRef<HTMLDivElement>(null);

    if (typeof document === 'undefined') return null;

    return (
      <>
        {isNamingModalOpen &&
          createPortal(
            <div className="fixed inset-0 z-[999999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-hidden">
              <Draggable
                disabled={typeof window !== 'undefined' && window.innerWidth < 640}
                handle=".modal-handle"
                bounds="parent"
                nodeRef={namingModalRef}
                cancel="button, input, select, textarea, .no-drag"
              >
                <div
                  ref={namingModalRef}
                  className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md max-w-[calc(100vw-1rem)] sm:max-w-md max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in duration-200 my-auto pointer-events-auto"
                >
                  <div className="modal-handle cursor-grab active:cursor-grabbing p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between shrink-0 select-none bg-slate-900/95">
                    <div className="flex items-center gap-3">
                      <GripHorizontal className="text-slate-500 shrink-0" size={18} />
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-white uppercase tracking-wider">
                          Assign / Create Unit Name
                        </h3>
                        <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-tight">
                          Enter new unit name or choose from suggestions
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setIsNamingModalOpen(false);
                        namingCallback?.reject();
                      }}
                      className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors no-drag"
                      title="Cancel Naming"
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>

                  <div className="p-4 flex flex-col flex-1 min-h-0 overflow-hidden">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (searchUnit.trim()) {
                          handleSelectUnit(searchUnit.trim());
                        }
                      }}
                      className="flex gap-2 mb-3 shrink-0"
                    >
                      <div className="relative flex-1">
                        <Search
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                          size={16}
                        />
                        <input
                          autoFocus
                          type="text"
                          placeholder="Type unit name & press Enter to create..."
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white outline-none focus:border-brand-500 transition-all font-medium"
                          value={searchUnit}
                          onChange={(e) => setSearchUnit(e.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={!searchUnit.trim()}
                        className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shrink-0 shadow-lg shadow-brand-600/20 active:scale-95"
                      >
                        <Plus size={15} />
                        <span>Create</span>
                      </button>
                    </form>

                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar min-h-0 max-h-[45vh]">
                      {searchUnit.trim() &&
                        !masterUnits.some(
                          (u) => u.unit.toLowerCase() === searchUnit.trim().toLowerCase()
                        ) && (
                          <button
                            onClick={() => handleSelectUnit(searchUnit.trim())}
                            className="w-full text-left p-3 rounded-xl bg-brand-600/15 border border-brand-500/30 hover:bg-brand-600/25 transition-colors flex items-center justify-between group mb-2"
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold">
                                <Plus size={16} />
                              </div>
                              <div>
                                <div className="text-white font-bold text-sm tracking-wide">
                                  Create "{searchUnit.trim()}"
                                </div>
                                <div className="text-[10px] text-brand-400 font-bold uppercase">
                                  New Custom Unit
                                </div>
                              </div>
                            </div>
                            <div className="px-2.5 py-1 bg-brand-600 text-white text-[10px] font-bold rounded uppercase shadow">
                              Use
                            </div>
                          </button>
                        )}
                      {masterUnits
                        .filter((u) => u.unit.toLowerCase().includes(searchUnit.toLowerCase()))
                        .map((u) => (
                          <button
                            key={u.unit}
                            onClick={() => handleSelectUnit(u.unit)}
                            className="w-full text-left p-3 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-between group"
                          >
                            <div>
                              <div className="text-slate-200 font-bold text-sm tracking-wide">
                                {u.unit}
                              </div>
                              <div className="text-[10px] text-slate-500 font-bold uppercase flex gap-2">
                                <span>Floor {u.floor}</span>
                                <span>•</span>
                                <span>{u.size} SQM</span>
                              </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <div className="px-2 py-1 bg-brand-600/20 text-brand-400 text-[10px] font-bold rounded uppercase">
                                Select
                              </div>
                            </div>
                          </button>
                        ))}
                      {masterUnits.filter((u) =>
                        u.unit.toLowerCase().includes(searchUnit.toLowerCase())
                      ).length === 0 &&
                        !searchUnit.trim() && (
                          <div className="text-center py-8 text-slate-500 text-sm italic">
                            Type above to create a unit or search suggestions.
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </Draggable>
            </div>,
            document.body
          )}

        {isCopyBgModalOpen &&
          createPortal(
            <div className="fixed inset-0 z-[350000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <Draggable handle=".copy-bg-handle" nodeRef={copyBgModalRef}>
                <div
                  ref={copyBgModalRef}
                  className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-200"
                >
                  <div className="copy-bg-handle cursor-grab active:cursor-grabbing px-5 py-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between select-none">
                    <div className="flex items-center gap-2">
                      <GripHorizontal className="text-slate-400 w-5 h-5" />
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Copy size={16} className="text-brand-400" />
                          Copy Background & Căn Chỉnh từ Version Khác
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Sao chép ảnh nền/PDF cùng toàn bộ vị trí, góc xoay và tỷ lệ scale
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setIsCopyBgModalOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
                      <span className="text-slate-400">Đang chỉnh sửa Version:</span>
                      <div className="flex items-center gap-2 font-mono font-bold">
                        <span className="px-2 py-0.5 rounded bg-brand-600/20 text-brand-300 border border-brand-500/30">
                          {activeVersion?.name || 'Active Draft'}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="text-purple-400">{activeVersion?.store || 'HCM'}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-emerald-400">{activeVersion?.location || 'L1'}</span>
                        <span className="text-slate-500">•</span>
                        <span className="text-amber-400">
                          {activeVersion?.year || effectiveYear}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <DebouncedSearchInput
                          placeholder="Tìm kiếm version theo tên, năm..."
                          value={copyBgSearchTerm}
                          onChange={(val) => setCopyBgSearchTerm(val)}
                          debounceMs={250}
                          className="w-full"
                          inputClassName="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                      </div>
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none shrink-0 px-2">
                        <input
                          type="checkbox"
                          checked={showAllVersionsForCopy}
                          onChange={(e) => setShowAllVersionsForCopy(e.target.checked)}
                          className="rounded border-slate-700 text-brand-600 focus:ring-0"
                        />
                        <span>Tất cả tầng/năm</span>
                      </label>
                    </div>

                    <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                      {filteredCopyVersions.length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs italic bg-slate-950/40 rounded-xl border border-slate-800">
                          Không tìm thấy version nào khác có Background{' '}
                          {!showAllVersionsForCopy ? 'cùng Chi nhánh, Tầng và Năm' : ''}.
                        </div>
                      ) : (
                        filteredCopyVersions.map((v) => (
                          <div
                            key={v.id}
                            className="p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 group"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span
                                  className="font-bold text-white text-xs truncate max-w-[200px]"
                                  title={v.name}
                                >
                                  {v.name}
                                </span>
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                  {v.store || 'HCM'} • {v.location || 'L1'} •{' '}
                                  {v.year || effectiveYear}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-3 font-mono">
                                <span>
                                  Scale:{' '}
                                  <strong className="text-slate-200">
                                    {(v.backgroundScale ?? 1).toFixed(2)}x
                                  </strong>
                                </span>
                                <span>
                                  Pos:{' '}
                                  <strong className="text-slate-200">
                                    {Math.round(v.backgroundPos?.x ?? 0)},{' '}
                                    {Math.round(v.backgroundPos?.y ?? 0)}
                                  </strong>
                                </span>
                                <span>
                                  Rot:{' '}
                                  <strong className="text-slate-200">
                                    {v.backgroundRotation ?? 0}°
                                  </strong>
                                </span>
                                <span>
                                  Zoom:{' '}
                                  <strong className="text-slate-200">
                                    {Math.round((v.imageScale ?? 1) * 100)}%
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <button
                              onClick={() => handleCopyBackgroundFromVersion(v)}
                              className="px-3.5 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-all shadow-md active:scale-95 shrink-0 flex items-center gap-1.5"
                            >
                              <Copy size={14} />
                              <span>Sao chép</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-end">
                      <button
                        onClick={() => setIsCopyBgModalOpen(false)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>
                </div>
              </Draggable>
            </div>,
            document.body
          )}

        {isSummaryTableOpen &&
          createPortal(
            <div className="fixed inset-0 z-[320000] pointer-events-none flex items-center justify-center p-4">
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
                        {(activeVersion?.store as any) || 'HCM'} •{' '}
                        {activeVersion?.location || 'L1'} •{' '}
                        {activeVersion?.year || effectiveYear}]
                      </h3>
                    </div>
                    <button
                      onClick={() => setIsSummaryTableOpen(false)}
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <CloseIcon size={18} />
                    </button>
                  </div>

                  <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                    <DynamicUnitSummaryTable
                      summaryList={dynamicSummaryList}
                      selectedUnitId={selectedId}
                      onSelectUnit={(uid) => {
                        setSelectedId(uid);
                      }}
                      title={`Chi tiết ${dynamicSummaryList.length} gian hàng theo bộ luật`}
                    />
                  </div>
                </div>
              </Draggable>
            </div>,
            document.body
          )}
      </>
    );
  }
);
