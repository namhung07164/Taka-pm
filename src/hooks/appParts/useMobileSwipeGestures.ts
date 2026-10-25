import { useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { TabId, AppRole, PermissionModule } from '../../types';

interface UseMobileSwipeGesturesParams {
  activeTab: TabId;
  onTabChange: (newTab: TabId) => void;
}

const TAB_SEQUENCE: TabId[] = [
  'general',
  'budget',
  'cost',
  'gantt',
  'detail',
  'layout',
  'calendar',
  'summary',
  'taskDelegation',
];

const TAB_MODULE_MAP: Partial<Record<TabId, PermissionModule>> = {
  general: 'general',
  budget: 'budget',
  cost: 'costDetail',
  gantt: 'report',
  detail: 'detail',
  layout: 'layout',
  calendar: 'calendar',
  summary: 'summary',
  taskDelegation: 'taskDelegation',
  taskDelegationCalendar: 'taskDelegation',
  manual: undefined,
  csv_export: 'importCsv',
  picture_mapping: 'pictureMapping',
  accControl: undefined,
  notification: undefined,
  setting: undefined,
};

export function useMobileSwipeGestures({
  activeTab,
  onTabChange,
}: UseMobileSwipeGesturesParams) {
  const activeTabRef = useRef(activeTab);
  const onTabChangeRef = useRef(onTabChange);

  useEffect(() => {
    activeTabRef.current = activeTab;
    onTabChangeRef.current = onTabChange;
  });

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let touchTarget: HTMLElement | null = null;
    let isMultiTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        isMultiTouch = true;
        return;
      }
      isMultiTouch = false;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      touchTarget = e.target as HTMLElement;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (isMultiTouch || !touchTarget) return;
      if (window.visualViewport && window.visualViewport.scale > 1) return;

      const elapsed = Date.now() - startTime;
      if (elapsed > 450) return; // Too slow for a deliberate swipe

      const touch = e.changedTouches[0];
      const diffX = startX - touch.clientX;
      const diffY = startY - touch.clientY;
      const absX = Math.abs(diffX);
      const absY = Math.abs(diffY);

      // Must be a clear horizontal swipe
      if (absX < 65 || absX < absY * 2.0) return;

      // Guard: active text selection
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;

      // Guard: active modal open
      const state = useAppStore.getState();
      const isAnyModalOpen = Boolean(
        state.isLoginModalOpen ||
          state.isProjectModalOpen ||
          state.isTaskModalOpen ||
          state.isUserModalOpen ||
          state.isPrintPreview ||
          state.isCommandPaletteOpen
      );
      if (isAnyModalOpen) return;

      // Guard: form inputs, canvas, Konva floorplans, or swiping list row
      if (
        touchTarget.closest(
          'input, textarea, select, [contenteditable="true"], canvas, .konvajs-content, #canvas-container, [data-swipeable-active="true"], [data-gesture-ignore="true"]'
        )
      ) {
        return;
      }

      // Guard: horizontally scrollable elements (tables, overflow-x-auto)
      const scrollableParent = touchTarget.closest('.overflow-x-auto, table');
      if (scrollableParent && scrollableParent.scrollWidth > scrollableParent.clientWidth + 20) {
        return;
      }

      // 1. Edge-Swipe Right from Left Screen Edge (startX <= 30px) -> Opens Mobile Navigation Drawer
      if (diffX < -50 && startX <= 30) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        window.dispatchEvent(new CustomEvent('taka_toggle_mobile_nav', { detail: { open: true } }));
        return;
      }

      // 2. Global Horizontal Screen Swipe -> Switch Tab
      const currentUser = state.currentUser;
      const isAdmin = currentUser?.role === 'admin';
      const role = (
        currentUser?.role === 'admin'
          ? 'Staff'
          : (currentUser?.role as string)?.toUpperCase() === 'CP'
          ? 'CP'
          : (currentUser?.role as string)?.toLowerCase() === 'manager'
          ? 'Manager'
          : (currentUser?.role as string)?.toLowerCase() === 'staff'
          ? 'Staff'
          : (currentUser?.role as string)?.toLowerCase() === 'external'
          ? 'External'
          : ((currentUser?.role as any) || 'Staff')
      ) as AppRole;
      const perms = state.permissionMatrix[role]?.See;
      const writePerms = state.permissionMatrix[role]?.Write;

      const isTabPermitted = (tId: TabId) => {
        const mod = TAB_MODULE_MAP[tId];
        if (!mod) return true;
        if (mod === 'taskDelegation') return isAdmin || Boolean(perms?.[mod]);
        return isAdmin || Boolean(perms?.[mod]) || Boolean(writePerms?.[mod]);
      };

      const permittedTabs = TAB_SEQUENCE.filter(isTabPermitted);
      if (permittedTabs.length <= 1) return;

      const currentIdx = permittedTabs.indexOf(activeTabRef.current);
      if (currentIdx === -1) return;

      let nextTab: TabId | null = null;
      if (diffX > 65) {
        // Swiped Left (<--) -> Move to Next Tab
        if (currentIdx < permittedTabs.length - 1) {
          nextTab = permittedTabs[currentIdx + 1];
        }
      } else if (diffX < -65 && startX > 30) {
        // Swiped Right (-->) -> Move to Previous Tab
        if (currentIdx > 0) {
          nextTab = permittedTabs[currentIdx - 1];
        }
      }

      if (nextTab && nextTab !== activeTabRef.current) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          try {
            navigator.vibrate(15);
          } catch {}
        }
        const dir = diffX > 0 ? 'left' : 'right';
        const formattedName = nextTab.charAt(0).toUpperCase() + nextTab.slice(1);
        showSwipeIndicator(formattedName, dir);
        onTabChangeRef.current(nextTab);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);
}

function showSwipeIndicator(tabLabel: string, direction: 'left' | 'right') {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('taka-swipe-indicator');
  if (existing) existing.remove();

  const pill = document.createElement('div');
  pill.id = 'taka-swipe-indicator';
  pill.className =
    'fixed top-14 left-1/2 -translate-x-1/2 z-[99] bg-slate-900/90 text-white dark:bg-white/95 dark:text-slate-900 px-4 py-1.5 rounded-full shadow-xl backdrop-blur-md text-xs font-extrabold flex items-center gap-1.5 pointer-events-none transition-all duration-300';
  pill.innerHTML =
    direction === 'left'
      ? `<span>${tabLabel}</span> <span class="text-sm font-bold">›</span>`
      : `<span class="text-sm font-bold">‹</span> <span>${tabLabel}</span>`;
  document.body.appendChild(pill);

  setTimeout(() => {
    pill.style.opacity = '0';
    pill.style.transform = 'translate(-50%, -6px)';
    setTimeout(() => pill.remove(), 250);
  }, 650);
}
