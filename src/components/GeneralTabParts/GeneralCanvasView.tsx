import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { Project } from '../../types';
import { DragOverTarget, SortConfig } from './generalTypes';
import { drawGeneralCanvas, resolveCanvasClick } from './generalCanvasUtils';
import { useLanguage } from '../../lib/LanguageContext';
import { Pin, ChevronUp, ChevronDown, CheckCircle2, ArrowUp, ArrowDown } from 'lucide-react';

interface GeneralCanvasViewProps {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  paginatedProjects: Project[];
  pinnedProjects: string[];
  sortConfig: SortConfig | null;
  setSortConfig: React.Dispatch<React.SetStateAction<SortConfig | null>>;
  theme: string;
  flashToggle: boolean;
  searchTerm: string;
  globalYearFilter: string;
  globalStoreFilter: string;
  globalLocationFilter: string[];
  statusFilter: string;
  draggedPinnedId: string | null;
  dragOverTarget: DragOverTarget | null;
  justDroppedId: string | null;
  onProjectClick: (p: Project) => void;
  handlePinToggle: (e: React.MouseEvent, projectId: string) => void;
  handleMovePinned: (e: React.MouseEvent, projectId: string, direction: 'up' | 'down') => void;
  handleRowDragOver: (e: React.DragEvent, targetProject: Project, idx: number) => void;
  handleRowDrop: (e: React.DragEvent, targetId: string, position: 'above' | 'below') => void;
  handleCanvasDragOver: (e: React.DragEvent<HTMLCanvasElement>) => void;
  handleCanvasDrop: (e: React.DragEvent<HTMLCanvasElement>) => void;
}

export function GeneralCanvasView({
  wrapperRef,
  canvasRef,
  paginatedProjects,
  pinnedProjects,
  sortConfig,
  setSortConfig,
  theme,
  flashToggle,
  searchTerm,
  globalYearFilter,
  globalStoreFilter,
  globalLocationFilter,
  statusFilter,
  draggedPinnedId,
  dragOverTarget,
  justDroppedId,
  onProjectClick,
  handlePinToggle,
  handleMovePinned,
  handleRowDragOver,
  handleRowDrop,
  handleCanvasDragOver,
  handleCanvasDrop
}: GeneralCanvasViewProps) {
  const { t } = useLanguage();

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    drawGeneralCanvas({
      canvas,
      wrapper,
      paginatedProjects,
      pinnedProjects,
      sortConfig,
      theme,
      flashToggle,
      t
    });
  }, [
    paginatedProjects, 
    pinnedProjects, 
    searchTerm, 
    globalYearFilter, 
    globalStoreFilter, 
    globalLocationFilter, 
    statusFilter, 
    flashToggle, 
    sortConfig, 
    theme,
    t,
    canvasRef,
    wrapperRef
  ]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    resolveCanvasClick({
      e,
      canvas,
      wrapper,
      paginatedProjects,
      onProjectClick,
      handlePinToggle,
      setSortConfig,
      t
    });
  };

  return (
    <div ref={wrapperRef} className="hidden xl:block flex-grow overflow-auto border-t border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] relative">
      <canvas 
        ref={canvasRef} 
        onClick={onCanvasClick}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        className="block cursor-pointer"
      />
      
      {/* Full-width drag-over drop target zones when dragging */}
      {draggedPinnedId && paginatedProjects.map((p, idx) => {
        if (!p.id || !pinnedProjects.includes(p.id)) return null;
        const isSource = p.id === draggedPinnedId;
        const isTarget = dragOverTarget?.id === p.id;
        return (
          <div
            key={`drop-zone-${p.id}`}
            className={`absolute left-0 right-0 z-20 min-w-[1100px] transition-colors pointer-events-auto ${
              isSource 
                ? 'opacity-40 bg-slate-200/50 dark:bg-slate-800/50 border-2 border-dashed border-blue-400' 
                : isTarget 
                  ? 'bg-blue-500/10 dark:bg-blue-400/10' 
                  : 'hover:bg-blue-500/5'
            }`}
            style={{ top: 60 + idx * 70, height: 70 }}
            onDragOver={(e) => handleRowDragOver(e, p, idx)}
            onDrop={(e) => dragOverTarget && handleRowDrop(e, p.id!, dragOverTarget.position)}
          >
            {isSource && (
              <div className="absolute inset-0 flex items-center pl-28 text-xs font-semibold text-blue-600 dark:text-blue-400 select-none">
                <span>{t('Moving project')}: {p.code} - {p.name}</span>
              </div>
            )}
          </div>
        );
      })}

      {/* High-visibility glowing insertion beam during drag */}
      {draggedPinnedId && dragOverTarget && (
        <div
          className="absolute left-0 right-0 min-w-[1100px] z-30 pointer-events-none transition-all duration-75"
          style={{
            top: (dragOverTarget.position === 'above' 
              ? 60 + dragOverTarget.index * 70 
              : 60 + (dragOverTarget.index + 1) * 70) - 2,
          }}
        >
          <div className="w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.9)] rounded-full relative">
            <div className="absolute -left-1 -top-1 w-3 h-3 rounded-full bg-blue-600 ring-4 ring-blue-300 dark:ring-blue-800" />
            <div className="absolute -top-3.5 left-28 flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-600 text-white text-xs font-bold shadow-lg border border-blue-300/40 animate-pulse">
              {dragOverTarget.position === 'above' ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>{t('Insert above')}: {dragOverTarget.projectCode}</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>{t('Insert below')}: {dragOverTarget.projectCode}</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Success pulse highlight overlay on the newly dropped row */}
      {justDroppedId && (
        paginatedProjects.map((p, idx) => {
          if (p.id !== justDroppedId) return null;
          return (
            <div
              key={`just-dropped-${p.id}`}
              className="absolute left-0 right-0 min-w-[1100px] h-[70px] bg-emerald-500/15 dark:bg-emerald-400/15 border-2 border-emerald-500 z-30 pointer-events-none flex items-center justify-between px-6 animate-pulse rounded-lg transition-all duration-700"
              style={{ top: 60 + idx * 70 }}
            >
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs bg-white/95 dark:bg-slate-900/95 px-3 py-1 rounded-full shadow border border-emerald-500/50">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('Position updated successfully!')}</span>
              </div>
            </div>
          );
        })
      )}

      {/* Action overlay (drag handle, pin button, and quick up/down) for projects on Canvas */}
      {paginatedProjects.map((p, idx) => {
        if (!p.id) return null;
        const isPinned = pinnedProjects.includes(p.id);
        const pinnedIndex = pinnedProjects.indexOf(p.id);
        return (
          <div 
            key={`row-ctrl-${p.id}`}
            className="absolute left-0 flex items-center gap-1 z-10 pl-2 pointer-events-auto"
            style={{ 
              top: 60 + idx * 70, 
              width: isPinned ? 58 : 36,
              height: 70 
            }}
          >
            {isPinned ? (
              <>
                {/* Quick 1-click reorder buttons (Move Up / Down) placed where drag handle was */}
                <div className="flex flex-col items-center justify-center gap-0.5 w-5 h-7">
                  <button
                    type="button"
                    disabled={pinnedIndex === 0}
                    onClick={(e) => handleMovePinned(e, p.id!, 'up')}
                    className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === 0 ? 'invisible pointer-events-none' : ''}`}
                    title={t('Move up')}
                  >
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={pinnedIndex === pinnedProjects.length - 1}
                    onClick={(e) => handleMovePinned(e, p.id!, 'down')}
                    className={`p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors ${pinnedIndex === pinnedProjects.length - 1 ? 'invisible pointer-events-none' : ''}`}
                    title={t('Move down')}
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePinToggle(e, p.id!);
                  }}
                  className="flex items-center justify-center w-6 h-7 rounded hover:bg-blue-100/70 dark:hover:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  title={t('Unpin')}
                >
                  <Pin className="w-3.5 h-3.5 fill-current" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handlePinToggle(e, p.id!);
                }}
                className="flex items-center justify-center w-6 h-7 rounded opacity-0 hover:opacity-100 text-slate-300 hover:text-blue-600 hover:bg-slate-100 dark:text-slate-600 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-all"
                title={t('Pin to top')}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
