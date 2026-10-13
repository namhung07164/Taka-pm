import React, { Dispatch, SetStateAction, useState } from 'react';
import { Project, Task } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { removeCodeFromLinkCodesString, extractAllProjectCodes } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc, deleteDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { addPendingUpdate } from '../../lib/syncQueue';
import { calculateProjectComputedDates, getTasksForProject } from '../../lib/projectDatesService';
import { deleteStorageFiles, extractStorageUrls } from '../../lib/storageUtils';
import { recordDelta } from '../../lib/deltaSyncService';
import { LinkCodesValidationError } from './projectModalTypes';
import { handleProjectIdentityChange } from './projectModalIdentityService';

interface UseProjectModalMutationsParams {
  project: Project | null;
  formData: Partial<Project>;
  canWrite: boolean;
  projects: Project[];
  tasks: Task[];
  linkCodesError: LinkCodesValidationError | null;
  enrichedProject: any;
  onClose: () => void;
  setConfirmModal: React.Dispatch<React.SetStateAction<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>>;
}

export function useProjectModalMutations({
  project,
  formData,
  canWrite,
  projects,
  tasks,
  linkCodesError,
  enrichedProject,
  onClose,
  setConfirmModal
}: UseProjectModalMutationsParams) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const setToast = useAppStore(state => state.setToast);
  const cloudStatus = useAppStore(state => state.cloudStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      if (!canWrite) {
        setIsSubmitting(false);
        return;
      }

      const allStoreProjects = useAppStore.getState().projects || [];
      const validNos = allStoreProjects.map(p => p.no).filter(n => typeof n === 'number' && !isNaN(n));
      let no = project ? project.no : (validNos.length ? Math.max(...validNos) + 1 : 1);
      if (isNaN(no)) no = (validNos.length ? Math.max(...validNos) + 1 : 1);

      const docId = project?.id || String(no);

      if (!formData.year || String(formData.year).trim() === '') {
        setToast({ title: 'Validation Error', message: 'Project Year is strictly required.', type: 'error' });
        setIsSubmitting(false);
        return;
      }
      const yearNum = Number(formData.year);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        setToast({ title: 'Validation Error', message: 'Please enter a valid Project Year.', type: 'error' });
        setIsSubmitting(false);
        return;
      }

      const cleanCode = String(formData.code || '').replace(/\s+/g, '');
      if (!cleanCode) {
        setToast({ title: 'Validation Error', message: 'Project Code is strictly required and cannot contain spaces.', type: 'error' });
        setIsSubmitting(false);
        return;
      }

      if (linkCodesError) {
        const yearDetail = linkCodesError.duplicateProjectYear ? ` (Year ${linkCodesError.duplicateProjectYear})` : '';
        setToast({
          title: 'Duplicate Project Code',
          message: `Code "${linkCodesError.invalidCode}" is already assigned to project "${linkCodesError.duplicateProjectCode}"${yearDetail} (${linkCodesError.duplicateProjectName}). Another project's code cannot be used as Project Code Link.`,
          type: 'error'
        });
        setIsSubmitting(false);
        return;
      }

      const storeTasks = useAppStore.getState().tasks;
      const storeDelegationGroups = useAppStore.getState().delegationGroups;
      const projectForDates = project ? { ...project, ...formData } : formData;
      const computedDates = calculateProjectComputedDates(
        projectForDates,
        getTasksForProject(projectForDates, storeTasks),
        storeDelegationGroups
      );

      const dataToSave: any = {
        ...formData,
        no,
        year: yearNum,
        code: String(formData.code).trim(),
        linkCodes: formData.linkCodes ? String(formData.linkCodes).trim() : String(formData.code).trim(),
        isDeleted: false,
        taskCount: computedDates.taskCount !== undefined ? computedDates.taskCount : (project?.taskCount || 0),
        taskSummaries: (computedDates.taskSummaries && computedDates.taskSummaries.length >= (project?.taskSummaries?.length || 0))
          ? computedDates.taskSummaries
          : (project?.taskSummaries || computedDates.taskSummaries || []),
        computedPlanProgress: computedDates.computedPlanProgress ?? project?.computedPlanProgress ?? 0,
        computedActProgress: computedDates.computedActProgress ?? project?.computedActProgress ?? 0,
        computedTakStart: computedDates.computedTakStart || project?.computedTakStart || enrichedProject?.computedTakStart || formData.start || "",
        computedTakCompl: computedDates.computedTakCompl || project?.computedTakCompl || enrichedProject?.computedTakCompl || formData.handover || "",
        computedOpening: computedDates.computedOpening || project?.computedOpening || enrichedProject?.computedOpening || formData.opening || "",
      };

      if (cloudStatus === 'offline') {
        const payload = { ...dataToSave, updatedAt: new Date().toISOString() };
        delete payload.id;
        Object.keys(payload).forEach(key => {
          if ((payload as any)[key] === undefined) delete (payload as any)[key];
        });
        addPendingUpdate({ collectionPath: `artifacts/${APP_ID}/public/data/taka_projects`, action: 'set', docId, data: payload } as any);
        setToast({ title: 'Draft Saved', message: 'Project saved offline. Will sync when connection returns.' });
        onClose();
        setIsSubmitting(false);
        return;
      }

      delete dataToSave.id;
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key];
        }
      });

      const isDuplicate = projects.some(p =>
        String(p.code || '').trim().toLowerCase() === String(formData.code || '').trim().toLowerCase() &&
        String(p.year) === String(formData.year) &&
        String(p.store || '').trim().toLowerCase() === String(formData.store || '').trim().toLowerCase() &&
        (!project || (project.id && p.id ? p.id !== project.id : String(p.no) !== String(project.no)))
      );

      if (isDuplicate) {
        setToast({ title: "Error", message: `Project code "${formData.code}" already exists in year ${formData.year} - Store ${formData.store}. Please enter a different code.`, type: "error" });
        setIsSubmitting(false);
        return;
      }

      const isIdentityChange = project && (
        String(project.code || '').trim() !== String(formData.code || '').trim() ||
        String(project.year) !== String(formData.year) ||
        String(project.store || '').trim() !== String(formData.store || '').trim()
      );

      if (isIdentityChange) {
        await handleProjectIdentityChange({
          project,
          formData,
          dataToSave,
          docId,
          yearNum,
          projects,
          setToast
        });
      } else {
        const fullProjectPayload = {
          ...dataToSave,
          updatedAt: new Date().toISOString()
        };
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), fullProjectPayload, { merge: true });

        // Record delta so Desktop and other devices receive instant realtime update via delta pipeline
        recordDelta({
          docId,
          collectionName: 'taka_projects',
          action: project ? 'update' : 'create',
          data: fullProjectPayload,
          year: String(yearNum),
        }).catch(console.error);

        const rawProjects = useAppStore.getState().projects || [];
        const savedCode = String(formData.code).trim().toLowerCase();
        const savedYearStr = String(formData.year || '').trim();
        const savedStoreStr = String(formData.store || '').trim().toUpperCase();

        const otherProjectsToClean: { id: string; linkCodes: string }[] = [];
        const updatedProjects = rawProjects.map(p => {
          if (project && ((p.id && p.id === project.id) || (p.no !== undefined && project.no !== undefined && p.no === project.no))) {
            return { ...p, ...dataToSave, isDeleted: false, id: project.id || docId, updatedAt: new Date().toISOString() };
          }
          const pStore = String(p.store || '').trim().toUpperCase();
          const pYear = String(p.year || '').trim();
          if ((!savedStoreStr || !pStore || pStore === savedStoreStr) && (!savedYearStr || !pYear || pYear === savedYearStr)) {
            if (p.linkCodes) {
              const allCodes = extractAllProjectCodes(p);
              if (allCodes.includes(savedCode) && String(p.code || '').trim().toLowerCase() !== savedCode) {
                const cleaned = removeCodeFromLinkCodesString(p.linkCodes, formData.code);
                otherProjectsToClean.push({ id: p.id || String(p.no), linkCodes: cleaned });
                return { ...p, linkCodes: cleaned, updatedAt: new Date().toISOString() };
              }
            }
          }
          return p;
        });

        otherProjectsToClean.forEach(item => {
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', item.id), {
            linkCodes: item.linkCodes,
            updatedAt: new Date().toISOString()
          }, { merge: true }).catch(console.error);
        });

        if (project) {
          useAppStore.getState().setProjects(updatedProjects);
        } else {
          useAppStore.getState().setProjects([...updatedProjects, { ...dataToSave, isDeleted: false, id: docId, updatedAt: new Date().toISOString() } as any]);

          const currentYearFilter = useAppStore.getState().globalYearFilter;
          const currentStoreFilter = useAppStore.getState().globalStoreFilter;
          let filterChangedNotice = '';

          if (currentYearFilter !== 'all' && String(currentYearFilter) !== String(yearNum)) {
            useAppStore.getState().setGlobalYearFilter(String(yearNum));
            filterChangedNotice += ` Năm ${yearNum}`;
          }
          if (currentStoreFilter !== 'all' && currentStoreFilter !== formData.store) {
            const curUser = useAppStore.getState().currentUser;
            const canSeeStore = curUser?.role === 'admin' || (formData.store === 'HCM' ? curUser?.storePermissions?.hcm : curUser?.storePermissions?.hn);
            if (canSeeStore) {
              useAppStore.getState().setGlobalStoreFilter(formData.store);
              filterChangedNotice += ` Chi nhánh ${formData.store}`;
            }
          }

          setToast({
            title: "Project Created Successfully",
            message: filterChangedNotice
              ? `Created project ${formData.code} (${yearNum} - ${formData.store}) and automatically switched active filter to${filterChangedNotice}.`
              : `Created project ${formData.code} successfully.`,
            type: "success"
          });
        }

        undoManager.push({
          description: project ? `Update Project: ${formData.code}` : `Create Project: ${formData.code}`,
          revert: async () => {
            if (project) {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), project, { merge: true });
            } else {
              deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId));
            }
          }
        });
      }
      onClose();
    } catch (e: any) {
      console.error("Save project error:", e);
      setToast({ title: "Error", message: e?.message || "Failed to save project.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: `Permanently delete project ${project.code || project.name || ''} and all associated tasks?`,
      onConfirm: async () => {
        try {
          const { deleteProjectStateUnified } = await import('../../lib/taskStateService');
          await deleteProjectStateUnified(project.id || String(project.no) || project.code, project);
          useAppStore.getState().setToast({
            title: "Success",
            message: `Deleted project ${project.code} successfully.`,
            type: "success"
          });
          onClose();
        } catch (e: any) {
          console.error("Delete project error:", e);
          useAppStore.getState().setToast({
            title: "Error",
            message: e?.message || "Failed to delete project.",
            type: "error"
          });
        }
      }
    });
  };

  return {
    isSubmitting,
    handleSubmit,
    handleDelete
  };
}
