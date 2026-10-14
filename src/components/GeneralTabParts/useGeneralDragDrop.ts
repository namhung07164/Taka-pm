import React, { useRef, useState } from 'react';
import { Project } from '../../types';
import { DragOverTarget } from './generalTypes';

interface UseGeneralDragDropParams {
  projects: Project[];
  paginatedProjects: Project[];
  pinnedProjects: string[];
  setPinnedProjects: (ids: string[]) => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  t: (key: string) => string;
}

export function useGeneralDragDrop({
  projects,
  paginatedProjects,
  pinnedProjects,
  setPinnedProjects,
  canvasRef,
  t
}: UseGeneralDragDropParams) {
  const [draggedPinnedId, setDraggedPinnedId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragOverTarget | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSuccessFeedback = (id: string, message: string) => {
    setJustDroppedId(id);
    setSuccessToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setJustDroppedId(null);
      setSuccessToast(null);
    }, 2400);
  };

  const reorderPinnedProjects = (
    currentPinned: string[],
    draggedId: string,
    targetId: string,
    position: 'above' | 'below'
  ): string[] => {
    if (draggedId === targetId) return currentPinned;
    const listWithoutDragged = currentPinned.filter(id => id !== draggedId);
    const targetIndexInCleanList = listWithoutDragged.indexOf(targetId);
    if (targetIndexInCleanList === -1) return currentPinned;
    const insertIndex = position === 'above' ? targetIndexInCleanList : targetIndexInCleanList + 1;
    const result = [...listWithoutDragged];
    result.splice(insertIndex, 0, draggedId);
    return result;
  };

  const handlePinToggle = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (pinnedProjects.includes(projectId)) {
      setPinnedProjects(pinnedProjects.filter(id => id !== projectId));
    } else {
      setPinnedProjects([...pinnedProjects, projectId]);
    }
  };

  const handleMovePinned = (e: React.MouseEvent, projectId: string, direction: 'up' | 'down') => {
    e.stopPropagation();
    const currIdx = pinnedProjects.indexOf(projectId);
    if (currIdx === -1) return;
    const newIdx = direction === 'up' ? currIdx - 1 : currIdx + 1;
    if (newIdx < 0 || newIdx >= pinnedProjects.length) return;
    const newPinned = [...pinnedProjects];
    const [moved] = newPinned.splice(currIdx, 1);
    newPinned.splice(newIdx, 0, moved);
    setPinnedProjects(newPinned);
    
    const proj = projects.find(p => p.id === projectId);
    triggerSuccessFeedback(
      projectId,
      direction === 'up'
        ? `Moved ${proj?.code || 'project'} up to position ${newIdx + 1}`
        : `Moved ${proj?.code || 'project'} down to position ${newIdx + 1}`
    );
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedPinnedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleRowDragOver = (e: React.DragEvent, targetProject: Project, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedPinnedId || !targetProject.id || draggedPinnedId === targetProject.id) {
      return;
    }
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeY = e.clientY - rect.top;
    const isAbove = relativeY < rect.height / 2;
    const position = isAbove ? 'above' : 'below';

    if (dragOverTarget?.id !== targetProject.id || dragOverTarget?.position !== position) {
      setDragOverTarget({
        id: targetProject.id,
        position,
        index: idx,
        projectCode: targetProject.code,
        projectName: targetProject.name,
      });
    }
  };

  const handleRowDrop = (e: React.DragEvent, targetId: string, position: 'above' | 'below') => {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedPinnedId || draggedPinnedId === targetId) {
      setDraggedPinnedId(null);
      setDragOverTarget(null);
      return;
    }

    const newPinned = reorderPinnedProjects(pinnedProjects, draggedPinnedId, targetId, position);
    setPinnedProjects(newPinned);

    const movedProj = projects.find(p => p.id === draggedPinnedId);
    const targetProj = projects.find(p => p.id === targetId);
    const code = movedProj?.code || 'Project';

    triggerSuccessFeedback(
      draggedPinnedId,
      position === 'above'
        ? `Moved ${code} before ${targetProj?.code || ''}!`
        : `Moved ${code} after ${targetProj?.code || ''}!`
    );

    setDraggedPinnedId(null);
    setDragOverTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedPinnedId(null);
    setDragOverTarget(null);
  };

  const handleCanvasDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!draggedPinnedId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const headerHeight = 60;
    const rowHeight = 70;

    if (y > headerHeight) {
      const idx = Math.floor((y - headerHeight) / rowHeight);
      if (idx >= 0 && idx < paginatedProjects.length) {
        const targetProject = paginatedProjects[idx];
        if (targetProject.id && pinnedProjects.includes(targetProject.id) && targetProject.id !== draggedPinnedId) {
          const rowY = headerHeight + idx * rowHeight;
          const relativeY = y - rowY;
          const position = relativeY < rowHeight / 2 ? 'above' : 'below';

          setDragOverTarget({
            id: targetProject.id,
            position,
            index: idx,
            projectCode: targetProject.code,
            projectName: targetProject.name,
          });
        }
      }
    }
  };

  const handleCanvasDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!draggedPinnedId) return;
    if (dragOverTarget && dragOverTarget.id !== draggedPinnedId) {
      handleRowDrop(e, dragOverTarget.id, dragOverTarget.position);
    } else {
      setDraggedPinnedId(null);
      setDragOverTarget(null);
    }
  };

  return {
    draggedPinnedId,
    dragOverTarget,
    justDroppedId,
    successToast,
    handlePinToggle,
    handleMovePinned,
    handleDragStart,
    handleRowDragOver,
    handleRowDrop,
    handleDragEnd,
    handleCanvasDragOver,
    handleCanvasDrop
  };
}
