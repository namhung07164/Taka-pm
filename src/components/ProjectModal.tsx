import React, { Suspense, useRef } from 'react';
import Draggable from 'react-draggable';
import { Portal } from './Portal';
import { ProjectModalProps } from './ProjectModalParts/projectModalTypes';
import { ProjectModalHeader } from './ProjectModalParts/ProjectModalHeader';
import { ProjectDetailsForm } from './ProjectModalParts/ProjectDetailsForm';
import { useProjectModalData } from './ProjectModalParts/useProjectModalData';
import { ProjectChat } from './ProjectModal/ProjectChat';
import { ProjectDelegationTab } from './ProjectDelegationTab';
import { lazyWithRetry } from '../lib/lazyWithRetry';
import { getZIndexClass } from '../lib/zIndexManager';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');

export function ProjectModal(props: ProjectModalProps) {
  const { isOpen, onClose, project, onOpenTask } = props;
  const nodeRef = useRef(null);

  const {
    projects,
    tasks,
    delegationGroups,
    currentUser,
    locations,
    parties,
    appUsers,
    subAppUsers,
    activeTab,
    setActiveTab,
    isAddingLocation,
    setIsAddingLocation,
    newLocation,
    setNewLocation,
    formData,
    setFormData,
    canWrite,
    enrichedProject,
    linkCodesError,
    confirmModal,
    setConfirmModal,
    yearRef,
    handleAddNewLocation,
    handleSubmit,
    handleDelete
  } = useProjectModalData(props);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className={`fixed inset-0 bg-slate-900/60 ${getZIndexClass('MODAL_BASE')} flex items-center justify-center p-0 md:p-4 overscroll-contain`}>
        <React.Suspense fallback={null}>
          {confirmModal.isOpen && (
            <ConfirmModal
              isOpen={confirmModal.isOpen}
              title={confirmModal.title}
              message={confirmModal.message}
              onConfirm={confirmModal.onConfirm}
              onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
            />
          )}
        </React.Suspense>
        <Draggable
          disabled={typeof window !== 'undefined' && window.innerWidth < 768}
          handle=".modal-handle"
          bounds="parent"
          nodeRef={nodeRef}
          cancel="button"
        >
          <div
            ref={nodeRef}
            className="bg-white dark:bg-[#1e1e20] md:rounded-2xl shadow-2xl w-full h-[92vh] md:h-[88vh] max-h-[96vh] md:max-h-[90vh] max-w-3xl overflow-hidden relative flex flex-col pointer-events-auto overscroll-contain"
          >
            <ProjectModalHeader
              project={project}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onClose={onClose}
            />

            {activeTab === 'details' && (
              <ProjectDetailsForm
                formData={formData}
                setFormData={setFormData}
                linkCodesError={linkCodesError}
                canWrite={canWrite}
                currentUser={currentUser}
                locations={locations}
                parties={parties}
                isAddingLocation={isAddingLocation}
                setIsAddingLocation={setIsAddingLocation}
                newLocation={newLocation}
                setNewLocation={setNewLocation}
                handleAddNewLocation={handleAddNewLocation}
                enrichedProject={enrichedProject}
                project={project}
                handleSubmit={handleSubmit}
                handleDelete={handleDelete}
                onClose={onClose}
                yearRef={yearRef}
              />
            )}

            {activeTab === 'chat' && project && (
              <ProjectChat
                project={project}
                projects={projects}
                tasks={tasks}
                currentUser={currentUser}
                appUsers={appUsers}
                subAppUsers={subAppUsers}
                delegationGroups={delegationGroups}
                onOpenTask={onOpenTask}
              />
            )}

            {activeTab === 'delegation' && project && (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <ProjectDelegationTab
                  project={project}
                  projects={projects}
                  tasks={tasks}
                  currentUser={currentUser}
                  appUsers={appUsers}
                  delegationGroups={delegationGroups}
                  setConfirmModal={setConfirmModal}
                />
              </div>
            )}
          </div>
        </Draggable>
      </div>
    </Portal>
  );
}

export type { ProjectModalProps } from './ProjectModalParts/projectModalTypes';
