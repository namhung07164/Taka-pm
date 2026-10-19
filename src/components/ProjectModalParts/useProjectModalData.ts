import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { useEnrichedData } from '../../hooks/useEnrichedData';
import { enrichProjects } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { bumpConfigVersion } from '../../lib/configCacheService';
import { getLinkCodesValidationError } from './projectModalTypes';
import { useProjectModalMutations } from './useProjectModalMutations';
import { hydrateDelegationsForProjects, hydrateDelegationsFromLocal, hydrateTasksForProjects } from '../../lib/backgroundSyncWorker';
import { ensureProjectTasksLoaded } from '../../lib/taskStateService';

interface UseProjectModalDataParams {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  isReadOnly?: boolean;
  initialTab?: 'details' | 'chat' | 'delegation';
}

export function useProjectModalData({
  isOpen,
  onClose,
  project,
  isReadOnly = false,
  initialTab = 'details'
}: UseProjectModalDataParams) {
  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser)!;
  const locations = useAppStore(state => state.locations);
  const parties = useAppStore(state => state.parties);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);

  const [activeTab, setActiveTab] = useState<'details' | 'chat' | 'delegation'>(initialTab);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState("");
  const yearRef = useRef<HTMLInputElement>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  // JIT Targeted Local-First Task & Delegation Hydration for Project (0ms, 0 Read - Rule 8)
  useEffect(() => {
    if (isOpen && project) {
      const keys = [project.id, project.code].filter(Boolean) as string[];
      if (keys.length > 0) {
        hydrateTasksForProjects(keys, project.year, project.store).catch(() => {});
        hydrateDelegationsForProjects(keys, project.year, project.store).catch(() => {});
      }
    }
  }, [isOpen, project?.id, project?.code, project?.year, project?.store]);

  // Tri-Gate Lazy Loading: Activate delegation pipeline if user selects delegation tab
  useEffect(() => {
    if (isOpen && activeTab === 'delegation') {
      const { isDelegationsRequested, setIsDelegationsRequested } = useAppStore.getState();
      if (!isDelegationsRequested) {
        setIsDelegationsRequested(true);
      }
      hydrateDelegationsFromLocal().catch(() => {});
    }
  }, [isOpen, activeTab]);

  const [formData, setFormData] = useState<Partial<Project>>({
    store: 'HCM',
    location: '',
    year: new Date().getFullYear(),
    code: '',
    name: '',
    party: '',
    detail: '',
    startMode: 'auto',
    handoverMode: 'auto',
    openingMode: 'auto'
  });

  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = !isReadOnly && (currentUser?.role === 'admin' || currentUser?.canWrite) && !isArchiveYear;

  const enrichedProject = useMemo(
    () => (project ? enrichProjects([project], tasks)[0] : null),
    [project, tasks]
  );

  const linkCodesError = useMemo(() => {
    const rawLink = formData.linkCodes !== undefined ? String(formData.linkCodes) : String(formData.code || '');
    return getLinkCodesValidationError(rawLink, String(formData.code || ''), project?.id, projects, formData.year, formData.store);
  }, [formData.linkCodes, formData.code, formData.year, formData.store, project?.id, projects]);

  const { isSubmitting, handleSubmit, handleDelete } = useProjectModalMutations({
    project,
    formData,
    canWrite,
    projects,
    tasks,
    linkCodesError,
    enrichedProject,
    onClose,
    setConfirmModal
  });

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModal.isOpen) return;
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, confirmModal.isOpen]);

  useEffect(() => {
    if (project) {
      setFormData({
        ...project,
        linkCodes: project.linkCodes ?? project.code ?? ''
      });
    } else {
      let defaultStore = 'HCM';
      if (currentUser?.role !== 'admin') {
        const allowedStores: string[] = [];
        if (currentUser?.storePermissions?.hcm) allowedStores.push('HCM');
        if (currentUser?.storePermissions?.hn) allowedStores.push('HN');
        if (allowedStores.length === 1) {
          defaultStore = allowedStores[0];
        } else {
          defaultStore = '';
        }
      }

      let defaultLocation = '';
      if (currentUser?.role !== 'admin' && currentUser?.locationPermissions) {
        if (currentUser.locationPermissions['all']) {
          defaultLocation = '';
        } else {
          const allowedLocs = Object.entries(currentUser.locationPermissions)
            .filter(([_, allowed]) => allowed)
            .map(([loc]) => loc);

          if (allowedLocs.length === 1) {
            const matched = locations.find(l => l.toLowerCase() === allowedLocs[0]);
            defaultLocation = matched || allowedLocs[0];
          } else {
            defaultLocation = '';
          }
        }
      }

      setFormData({
        store: defaultStore,
        location: defaultLocation,
        year: new Date().getFullYear(),
        code: '',
        linkCodes: '',
        name: '',
        party: '',
        detail: '',
        startMode: 'auto',
        handoverMode: 'auto',
        openingMode: 'auto'
      });
    }
  }, [project, isOpen, currentUser, locations]);

  const handleAddNewLocation = async () => {
    if (!newLocation.trim()) {
      setIsAddingLocation(false);
      return;
    }
    const locName = newLocation.trim();
    if (!locations.includes(locName)) {
      const newLocs = [...locations, locName];
      useAppStore.getState().setLocations(newLocs);
      try {
        setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "locations"), { list: newLocs }, { merge: true });
        bumpConfigVersion('locations');
      } catch (e) {
        console.error(e);
      }
    }
    setFormData(prev => ({ ...prev, location: locName }));
    setIsAddingLocation(false);
    setNewLocation('');
  };

  return {
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
    isSubmitting,
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
  };
}
