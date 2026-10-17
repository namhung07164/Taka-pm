import React, { FC, Suspense, memo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { TabErrorBoundary } from './TabErrorBoundary';
import { AppUser } from '../types';

const LoginModal = lazyWithRetry(() => import('./LoginModal').then(m => ({ default: m.LoginModal })), 'LoginModal');
const ProjectModal = lazyWithRetry(() => import('./ProjectModal').then(m => ({ default: m.ProjectModal })), 'ProjectModal');
const TaskModal = lazyWithRetry(() => import('./TaskModal').then(m => ({ default: m.TaskModal })), 'TaskModal');
const UserModal = lazyWithRetry(() => import('./UserModal').then(m => ({ default: m.UserModal })), 'UserModal');
const CalendarSyncModal = lazyWithRetry(() => import('./CalendarSyncModal').then(m => ({ default: m.CalendarSyncModal })), 'CalendarSyncModal');
const ZoomableImageViewer = lazyWithRetry(() => import('./ZoomableImageViewer').then(m => ({ default: m.ZoomableImageViewer })), 'ZoomableImageViewer');

interface AppModalsProps {
  onLogin: (appUser: AppUser) => void;
  onTabChange: (tab: any) => void;
}

export const AppModals: React.FC<AppModalsProps> = React.memo(({ onLogin, onTabChange }) => {
  const isLoginModalOpen = useAppStore(state => state.isLoginModalOpen);
  const setIsLoginModalOpen = useAppStore(state => state.setIsLoginModalOpen);
  
  const isProjectModalOpen = useAppStore(state => state.isProjectModalOpen);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  
  const isTaskModalOpen = useAppStore(state => state.isTaskModalOpen);
  const setIsTaskModalOpen = useAppStore(state => state.setIsTaskModalOpen);
  
  const isUserModalOpen = useAppStore(state => state.isUserModalOpen);
  const setIsUserModalOpen = useAppStore(state => state.setIsUserModalOpen);
  
  const isCalendarSyncModalOpen = useAppStore(state => state.isCalendarSyncModalOpen);
  
  const editingProject = useAppStore(state => state.editingProject);
  const editingTask = useAppStore(state => state.editingTask);
  const setEditingTask = useAppStore(state => state.setEditingTask);
  const editingUser = useAppStore(state => state.editingUser);
  
  const modalInitialTab = useAppStore(state => state.modalInitialTab);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const isReadOnlyModal = useAppStore(state => state.isReadOnlyModal);
  const setIsReadOnlyModal = useAppStore(state => state.setIsReadOnlyModal);
  
  const prefillProjectCode = useAppStore(state => state.prefillProjectCode);
  const prefillProjectYear = useAppStore(state => state.prefillProjectYear);
  const prefillProjectStore = useAppStore(state => state.prefillProjectStore);

  const zoomableImageSrc = useAppStore(state => state.zoomableImageSrc);
  const [eventViewerImage, setEventViewerImage] = React.useState<{
    url: string;
    title?: string;
    initialScale?: number;
  } | null>(null);

  React.useEffect(() => {
    const handleOpenEvent = (e: Event) => {
      const detail = (e as CustomEvent<{ url?: string; imageUrl?: string; src?: string; title?: string; initialScale?: number }>).detail;
      const rawUrl = detail?.url || detail?.imageUrl || detail?.src || '';
      if (rawUrl) {
        setEventViewerImage({
          url: rawUrl,
          title: detail?.title || '',
          initialScale: detail?.initialScale,
        });
      }
    };
    window.addEventListener('taka_open_image_viewer', handleOpenEvent);
    return () => window.removeEventListener('taka_open_image_viewer', handleOpenEvent);
  }, []);

  const { filteredTasks: tasks, visibleDelegationGroups } = useEnrichedData();
  const isImageViewerActive = Boolean(zoomableImageSrc || eventViewerImage);

  return (
    <Suspense fallback={null}>
      {isLoginModalOpen && (
        <LoginModal
          isOpen={isLoginModalOpen}
          onClose={() => setIsLoginModalOpen(false)}
          onLogin={onLogin}
        />
      )}

      {isProjectModalOpen && (
        <ProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          project={editingProject}
          isReadOnly={isReadOnlyModal}
          initialTab={modalInitialTab}
          onOpenTask={(taskId) => {
            const t = tasks.find((item) => item.id === taskId);
            if (t) {
              setEditingTask(t);
              setIsReadOnlyModal(false);
              setModalInitialTab("chat");
              setIsProjectModalOpen(false);
              setIsTaskModalOpen(true);
            }
          }}
        />
      )}

      {isTaskModalOpen && (
        <TabErrorBoundary tabKey="TaskModal">
          <TaskModal
            isOpen={isTaskModalOpen}
            onClose={() => setIsTaskModalOpen(false)}
            task={editingTask}
            visibleDelegationGroups={visibleDelegationGroups}
            prefillProjectCode={prefillProjectCode}
            prefillProjectYear={prefillProjectYear}
            prefillProjectStore={prefillProjectStore}
            isReadOnly={isReadOnlyModal}
            initialTab={modalInitialTab === "chat" ? "chat" : "details"}
            onNavigateToDelegation={(groupId) => {
              setIsTaskModalOpen(false);
              onTabChange("taskDelegation");
              setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent("taka_open_delegation_group", {
                    detail: { groupId },
                  })
                );
              }, 400);
            }}
          />
        </TabErrorBoundary>
      )}

      {isUserModalOpen && (
        <UserModal
          isOpen={isUserModalOpen}
          onClose={() => setIsUserModalOpen(false)}
          user={editingUser}
        />
      )}

      {isCalendarSyncModalOpen && <CalendarSyncModal />}
      {isImageViewerActive && (
        <ZoomableImageViewer
          isOpen={true}
          image={
            eventViewerImage ||
            (zoomableImageSrc ? { url: zoomableImageSrc } : null)
          }
          onClose={() => {
            setEventViewerImage(null);
            useAppStore.getState().setZoomableImageSrc(null);
          }}
        />
      )}
    </Suspense>
  );
});
