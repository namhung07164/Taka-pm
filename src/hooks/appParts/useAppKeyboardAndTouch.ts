import React, { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { AppRole, Project, TabId } from '../../types';

interface UseAppKeyboardAndTouchParams {
  projects: Project[];
  isAppReadyRef: React.MutableRefObject<boolean>;
  handleTabChange: (newTab: TabId) => void;
  handleDataUndoRef: React.MutableRefObject<() => Promise<void>>;
  handleDataRedoRef: React.MutableRefObject<() => Promise<void>>;
  handleGoBackRef: React.MutableRefObject<() => void>;
}

export function useAppKeyboardAndTouch({
  projects,
  isAppReadyRef,
  handleTabChange,
  handleDataUndoRef,
  handleDataRedoRef,
  handleGoBackRef,
}: UseAppKeyboardAndTouchParams) {
  const projectsRef = useRef(projects);
  const handleTabChangeRef = useRef(handleTabChange);

  useEffect(() => {
    projectsRef.current = projects;
    handleTabChangeRef.current = handleTabChange;
  });

  // Global keyboard shortcuts mounted ONCE with zero listener re-binding churn (Rule 3 & Rule 6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement;
      const isTyping =
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).isContentEditable);

      const state = useAppStore.getState();

      if (e.key === 'Escape') {
        if (state.isPrintPreview) {
          state.setIsPrintPreview(false);
          return;
        }
        if (state.isFocusMode) {
          state.setIsFocusMode(false);
          return;
        }
        if (state.toast) {
          state.setToast(null);
        }
        if (state.isProjectModalOpen) state.setIsProjectModalOpen(false);
        if (state.isTaskModalOpen) state.setIsTaskModalOpen(false);
        if (state.isUserModalOpen) state.setIsUserModalOpen(false);
        if (state.isLoginModalOpen) state.setIsLoginModalOpen(false);
        if (activeElement && typeof (activeElement as HTMLElement).blur === 'function') {
          (activeElement as HTMLElement).blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        state.setIsCommandPaletteOpen(!state.isCommandPaletteOpen);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (!isTyping) {
          e.preventDefault();
          handleDataUndoRef.current?.();
        }
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        if (!isTyping) {
          e.preventDefault();
          handleDataRedoRef.current?.();
        }
        return;
      }

      if (e.shiftKey && e.key.toUpperCase() === 'F' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isTyping) {
          e.preventDefault();
          state.setIsFocusMode(!state.isFocusMode);
        }
        return;
      }

      if (isTyping) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        const globalSearchInput = document.querySelector<HTMLInputElement>(
          'input[data-global-search-input="true"]'
        );
        if (globalSearchInput) {
          globalSearchInput.focus();
          globalSearchInput.select?.();
        } else {
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="Search" i], input[placeholder*="Tìm kiếm" i], input[type="search"]'
          );
          if (searchInput) {
            searchInput.focus();
            searchInput.select?.();
          }
        }
        return;
      }

      if (e.key === 'Backspace') {
        if (
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isLoginModalOpen
        ) {
          e.preventDefault();
          if (state.isProjectModalOpen) state.setIsProjectModalOpen(false);
          if (state.isTaskModalOpen) state.setIsTaskModalOpen(false);
          if (state.isUserModalOpen) state.setIsUserModalOpen(false);
          if (state.isLoginModalOpen) state.setIsLoginModalOpen(false);
          return;
        }
        e.preventDefault();
        handleGoBackRef.current?.();
        return;
      }

      if (e.key.toLowerCase() === 'p') {
        const userRole = state.currentUser?.role;
        const canWrite =
          userRole === 'admin' ||
          (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.general);
        if (canWrite) {
          e.preventDefault();
          state.setEditingProject(null);
          state.setIsReadOnlyModal(false);
          state.setModalInitialTab('details');
          state.setIsProjectModalOpen(true);
        }
        return;
      }

      if (e.key.toLowerCase() === 't') {
        if (!isAppReadyRef.current) return;
        const userRole = state.currentUser?.role;
        const canWrite =
          userRole === 'admin' ||
          (userRole && state.permissionMatrix[userRole as AppRole]?.Write?.detail);
        if (canWrite) {
          e.preventDefault();
          state.setEditingTask(null);
          state.setIsReadOnlyModal(false);
          state.setModalInitialTab('details');
          const curProjects = projectsRef.current;
          const safeP = curProjects && curProjects.length > 0 ? curProjects[0] : null;
          state.setPrefillProjectCode(safeP?.code || '');
          state.setPrefillProjectYear(safeP?.year || null);
          state.setIsTaskModalOpen(true);
        }
        return;
      }

      const tabNumberMap: Record<string, TabId> = {
        '1': 'general',
        '2': 'calendar',
        '3': 'gantt',
        '4': 'detail',
        '5': 'budget',
        '6': 'cost',
        '7': 'layout',
        '8': 'summary',
        '9': 'taskDelegation',
      };
      if (tabNumberMap[e.key]) {
        e.preventDefault();
        handleTabChangeRef.current(tabNumberMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAppReadyRef, handleDataUndoRef, handleDataRedoRef, handleGoBackRef]);

  // Edge swipe back gesture for mobile/tablet
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let touchTarget: HTMLElement | null = null;
    let isMultiTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        isMultiTouch = true;
        return;
      }
      isMultiTouch = false;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      touchTarget = e.target as HTMLElement;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isMultiTouch) return;
      if (window.visualViewport && window.visualViewport.scale > 1) return;

      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const diffX = startX - endX;
      const diffY = startY - endY;

      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      if (touchTarget && touchTarget.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }

      if (Math.abs(diffX) > 60 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
        if (diffX < 0 && startX <= 40) {
          handleGoBackRef.current();
        }
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleGoBackRef]);
}
