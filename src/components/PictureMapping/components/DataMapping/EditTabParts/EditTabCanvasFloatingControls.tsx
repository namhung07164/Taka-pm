import React from 'react';
import {
  Trash2,
  Maximize,
  Minimize,
  Lock,
  Save,
  RotateCw,
  RefreshCw,
  Pencil,
  FileImage,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Building,
  Copy,
} from 'lucide-react';
import { ShapeType, MapVersion } from '../types';
import { cn } from '../../../lib/utils';
import { extractR2Key } from '../../../lib/r2Upload';
import { deleteR2StorageFiles } from '../../../../../lib/r2StorageUtils';

interface EditTabCanvasFloatingControlsProps {
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  magneticGrid: boolean;
  gridSize: number;
  setGridSize: (v: number) => void;
  activeTool: ShapeType | 'select' | 'edit-bg';
  imageScale: number;
  setImageScale: (v: number) => void;
  alignStep: 'none' | 'bg1' | 'bg2' | 'target1' | 'target2';
  setAlignStep: (v: 'none' | 'bg1' | 'bg2' | 'target1' | 'target2') => void;
  setAlignPts: (v: any) => void;
  localImageUrl: string | null;
  isLocked: boolean;
  setIsLocked: (v: boolean) => void;
  handleCreateVersion: () => void;
  handleUpdateVersion: () => void;
  isSummaryTableOpen: boolean;
  setIsSummaryTableOpen: React.Dispatch<React.SetStateAction<boolean>>;
  dynamicSummaryCount: number;
  unitsCount: number;
  setCopyBgSearchTerm: (v: string) => void;
  setIsCopyBgModalOpen: (v: boolean) => void;
  handleReplaceBackground: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleReloadExternalBackground: () => void;
  handleRotateBackground: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  scale: number;
  handleZoomOut: () => void;
  handleZoomReset: () => void;
  handleZoomIn: () => void;
  handleFitToScreen: () => void;
}

export const EditTabCanvasFloatingControls: React.FC<EditTabCanvasFloatingControlsProps> =
  React.memo(
    ({
      activeVersionId,
      setActiveVersionId,
      versions,
      setVersions,
      magneticGrid,
      gridSize,
      setGridSize,
      activeTool,
      imageScale,
      setImageScale,
      alignStep,
      setAlignStep,
      setAlignPts,
      localImageUrl,
      isLocked,
      setIsLocked,
      handleCreateVersion,
      handleUpdateVersion,
      isSummaryTableOpen,
      setIsSummaryTableOpen,
      dynamicSummaryCount,
      unitsCount,
      setCopyBgSearchTerm,
      setIsCopyBgModalOpen,
      handleReplaceBackground,
      handleReloadExternalBackground,
      handleRotateBackground,
      isFullscreen,
      toggleFullscreen,
      scale,
      handleZoomOut,
      handleZoomReset,
      handleZoomIn,
      handleFitToScreen,
    }) => {
      return (
        <>
          <div className="absolute top-1 left-1 right-1 z-20 flex justify-between items-center pointer-events-none gap-1 flex-wrap">
            <div className="flex gap-1 pointer-events-auto items-center flex-wrap">
              <select
                className="bg-slate-900/90 text-white text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-slate-700 outline-none backdrop-blur-md cursor-pointer"
                value={activeVersionId || ''}
                onChange={(e) => setActiveVersionId(e.target.value === '' ? null : e.target.value)}
              >
                <option value="">-- Active Draft --</option>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.year ? ` • ${v.year}` : ''}
                  </option>
                ))}
              </select>

              {activeVersionId && (
                <>
                  <button
                    onClick={() => {
                      const v = versions.find((item) => item.id === activeVersionId);
                      if (!v) return;
                      const newName = prompt('Enter new version name:', v.name);
                      if (newName && newName.trim() && newName.trim() !== v.name) {
                        setVersions(
                          versions.map((version) =>
                            version.id === activeVersionId
                              ? { ...version, name: newName.trim() }
                              : version
                          )
                        );
                      }
                    }}
                    className="p-1 bg-slate-900/90 text-slate-400 hover:text-white rounded-md border border-slate-700 backdrop-blur-md transition-colors"
                    title="Rename Version"
                  >
                    <Pencil size={12} />
                  </button>

                  <button
                    onClick={() => {
                      const v = versions.find((item) => item.id === activeVersionId);
                      if (!v) return;
                      if (
                        !confirm(
                          `Bạn có chắc muốn xoá version "${v.name}${v.year ? ` • ${v.year}` : ''}"?`
                        )
                      )
                        return;
                      const oldBgKey = extractR2Key(v.backgroundUrl);
                      const newVersions = versions.filter((item) => item.id !== activeVersionId);
                      setVersions(newVersions);
                      setActiveVersionId(newVersions.length > 0 ? newVersions[0].id : null);

                      if (oldBgKey) {
                        const isUsedElsewhere = newVersions.some(
                          (item) => extractR2Key(item.backgroundUrl) === oldBgKey
                        );
                        if (!isUsedElsewhere) {
                          deleteR2StorageFiles([oldBgKey]).catch((err) =>
                            console.warn('[R2 Auto-GC] Could not delete removed version image:', err)
                          );
                        }
                      }
                    }}
                    className="p-1 bg-slate-900/90 text-rose-400 hover:text-rose-200 hover:bg-rose-900/50 rounded-md border border-slate-700 backdrop-blur-md transition-colors"
                    title="Delete Version"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}

              {magneticGrid && (
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded-md border border-slate-700 backdrop-blur-md">
                  <span className="text-[9px] font-bold text-slate-400 uppercase">Grid</span>
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={gridSize}
                    onChange={(e) => setGridSize(Math.max(0.1, Number(e.target.value) || 0.1))}
                    className="w-12 bg-transparent text-white text-[10px] outline-none text-center"
                  />
                  <span className="text-[9px] text-slate-500 font-bold uppercase">px</span>
                </div>
              )}

              {activeTool === 'edit-bg' && (
                <div className="flex items-center gap-1.5 bg-slate-900/90 px-2 py-1 rounded-md border border-slate-700 backdrop-blur-md pointer-events-auto">
                  <span className="text-[9px] font-bold text-slate-400 uppercase whitespace-nowrap">
                    BG Zoom
                  </span>
                  <input
                    type="range"
                    min="0.1"
                    max="5"
                    step="0.01"
                    value={imageScale}
                    onChange={(e) => setImageScale(Number(e.target.value))}
                    className="w-20"
                  />
                  <span className="text-[9px] text-slate-500 font-bold w-6 text-right">
                    {(imageScale * 100).toFixed(0)}%
                  </span>

                  <div className="w-px h-3.5 bg-slate-700 mx-1" />

                  {alignStep === 'none' ? (
                    <button
                      onClick={() => setAlignStep('bg1')}
                      className="text-[9px] font-bold uppercase text-brand-400 hover:text-brand-300 flex items-center gap-1"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0z"></path>
                        <path d="M12 8v8"></path>
                        <path d="M8 12h8"></path>
                      </svg>
                      2-Point Align
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-amber-400">
                        {alignStep === 'bg1' && 'Set Point 1 (on image)'}
                        {alignStep === 'bg2' && 'Set Point 2 (on image)'}
                        {alignStep === 'target1' && 'Set Target 1a (on canvas)'}
                        {alignStep === 'target2' && 'Set Target 2a (on canvas)'}
                      </span>
                      <button
                        onClick={() => {
                          setAlignStep('none');
                          setAlignPts({});
                        }}
                        className="text-[9px] font-bold text-red-400 hover:text-red-300 px-1"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}

              {localImageUrl && (
                <button
                  onClick={() => setIsLocked(!isLocked)}
                  className={cn(
                    'flex items-center gap-1 px-1.5 py-0.5 rounded border backdrop-blur-md text-[9px] font-bold uppercase transition-all',
                    isLocked
                      ? 'bg-red-500/20 text-red-400 border-red-500/50'
                      : 'bg-green-500/20 text-green-400 border-green-500/50'
                  )}
                >
                  <Lock size={10} /> {isLocked ? 'Unlock Grid' : 'Lock Grid'}
                </button>
              )}

              {localImageUrl && !activeVersionId && isLocked && (
                <button
                  onClick={handleCreateVersion}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-600 text-white border border-brand-500 text-[9px] font-bold uppercase shadow hover:bg-brand-500"
                >
                  <Save size={10} /> Save Version
                </button>
              )}

              {activeVersionId && !isLocked && (
                <button
                  onClick={handleUpdateVersion}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-600/80 text-white border border-amber-500 text-[9px] font-bold uppercase shadow hover:bg-amber-500"
                >
                  <Save size={10} /> Update View
                </button>
              )}
            </div>

            <div className="flex gap-1 items-center pointer-events-auto flex-wrap">
              <button
                onClick={() => setIsSummaryTableOpen((prev) => !prev)}
                className={cn(
                  'px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 rounded border backdrop-blur-sm transition-all flex items-center gap-1 shadow-sm',
                  isSummaryTableOpen
                    ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/40 ring-1 ring-emerald-500/30'
                    : 'text-slate-300 border-slate-700'
                )}
                title="Mở Bảng Tổng Hợp So Sánh & Màu Tô Thực Tế (Dynamic Unit Summary)"
              >
                <Building size={10} className="text-emerald-400" />
                <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                  Summary
                </span>
                <span className="px-1 py-0.1 text-[8px] font-mono rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold">
                  {isSummaryTableOpen ? dynamicSummaryCount : unitsCount}
                </span>
              </button>

              <button
                onClick={() => {
                  setCopyBgSearchTerm('');
                  setIsCopyBgModalOpen(true);
                }}
                className="px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-brand-400 hover:text-brand-300 rounded border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-1 shadow-sm"
                title="Sao chép Background & cách căn chỉnh từ một Version khác (cùng Store, Tầng, Năm)"
              >
                <Copy size={10} />
                <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                  Copy BG
                </span>
              </button>

              {localImageUrl && (
                <>
                  <div className="relative">
                    <button
                      onClick={() => document.getElementById('replace-bg-input2')?.click()}
                      className="px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-1"
                      title="Thay đổi Background Image/PDF"
                    >
                      <FileImage size={10} />
                      <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                        Thay BG
                      </span>
                    </button>
                    <input
                      id="replace-bg-input2"
                      type="file"
                      accept=".pdf,image/*"
                      className="hidden"
                      onChange={handleReplaceBackground}
                    />
                  </div>

                  {!localImageUrl.startsWith('data:') && !localImageUrl.startsWith('blob:') && (
                    <button
                      onClick={handleReloadExternalBackground}
                      className="px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-1"
                      title="Tải lại ảnh nền từ máy chủ (Tránh bị lưu bộ nhớ đệm)"
                    >
                      <RefreshCw size={10} />
                      <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                        Làm Mới
                      </span>
                    </button>
                  )}

                  <button
                    onClick={handleRotateBackground}
                    className="px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded border border-slate-700 backdrop-blur-sm transition-all flex items-center gap-1"
                    title="Xoay Background Image/PDF (90 độ)"
                  >
                    <RotateCw size={10} />
                    <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                      Xoay BG
                    </span>
                  </button>

                  <button
                    onClick={toggleFullscreen}
                    className="px-1.5 py-0.5 bg-slate-900/80 hover:bg-slate-800 text-white rounded border border-slate-700 backdrop-blur-sm transition-all pointer-events-auto flex items-center gap-1"
                    title="Toggle Fullscreen"
                  >
                    {isFullscreen ? <Minimize size={10} /> : <Maximize size={10} />}
                    <span className="text-[8.5px] uppercase font-bold tracking-wider hidden sm:inline">
                      Full
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>

          {localImageUrl && (
            <div className="absolute bottom-1.5 left-1.5 z-20 flex items-center gap-0.5 p-0.5 bg-slate-900/90 border border-slate-700/80 rounded-md backdrop-blur-md shadow-lg pointer-events-auto">
              <button
                onClick={handleZoomOut}
                className="p-0.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors"
                title="Thu nhỏ (Zoom Out)"
              >
                <ZoomOut size={11} />
              </button>
              <button
                onClick={handleZoomReset}
                className="px-1 py-0.5 hover:bg-slate-800 text-slate-200 hover:text-white rounded transition-colors text-[9px] font-mono font-bold min-w-[34px] text-center"
                title="Đặt lại 100%"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                className="p-0.5 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition-colors"
                title="Phóng to (Zoom In)"
              >
                <ZoomIn size={11} />
              </button>
              <div className="w-px h-3 bg-slate-700 mx-0.5" />
              <button
                onClick={handleFitToScreen}
                className="px-1.5 py-0.5 bg-brand-600/25 hover:bg-brand-600/40 text-brand-300 hover:text-brand-200 border border-brand-500/40 rounded transition-colors text-[9px] font-bold flex items-center gap-1 shadow-sm"
                title="Tự động căn vừa màn hình (Fit to Screen) - Khắc phục bị crop ảnh"
              >
                <Maximize2 size={10} />
                <span>Vừa Màn Hình</span>
              </button>
            </div>
          )}
        </>
      );
    }
  );
