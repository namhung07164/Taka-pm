import React, { Dispatch, SetStateAction } from 'react';
import { Project } from '../../types';
import { DragOverTarget } from './generalTypes';
import { GeneralMobileCard } from './GeneralMobileCard';

interface GeneralMobileViewProps {
  paginatedProjects: Project[];
  filteredProjects: Project[];
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  pinnedProjects: string[];
  draggedPinnedId: string | null;
  dragOverTarget: DragOverTarget | null;
  justDroppedId: string | null;
  onProjectClick: (p: Project) => void;
  handlePinToggle: (e: React.MouseEvent, projectId: string) => void;
  handleMovePinned: (e: React.MouseEvent, projectId: string, direction: 'up' | 'down') => void;
  handleDragStart: (e: React.DragEvent, id: string) => void;
  handleRowDragOver: (e: React.DragEvent, targetProject: Project, idx: number) => void;
  handleRowDrop: (e: React.DragEvent, targetId: string, position: 'above' | 'below') => void;
  handleDragEnd: () => void;
}

export function GeneralMobileView({
  paginatedProjects,
  filteredProjects,
  visibleCount,
  setVisibleCount,
  pinnedProjects,
  draggedPinnedId,
  dragOverTarget,
  justDroppedId,
  onProjectClick,
  handlePinToggle,
  handleMovePinned,
  handleDragStart,
  handleRowDragOver,
  handleRowDrop,
  handleDragEnd
}: GeneralMobileViewProps) {
  return (
    <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-2.5 p-2.5 sm:p-4 relative">
      {paginatedProjects.map((p, idx) => (
        <GeneralMobileCard
          key={p.id || p.no || idx}
          project={p}
          idx={idx}
          pinnedProjects={pinnedProjects}
          draggedPinnedId={draggedPinnedId}
          dragOverTarget={dragOverTarget}
          justDroppedId={justDroppedId}
          onProjectClick={onProjectClick}
          handlePinToggle={handlePinToggle}
          handleMovePinned={handleMovePinned}
          handleDragStart={handleDragStart}
          handleRowDragOver={handleRowDragOver}
          handleRowDrop={handleRowDrop}
          handleDragEnd={handleDragEnd}
        />
      ))}

      {visibleCount < filteredProjects.length && (
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setVisibleCount(prev => prev + 20)}
            className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm touch-manipulation active:scale-95"
          >
            Load More Projects ({filteredProjects.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}
