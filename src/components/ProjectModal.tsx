import { FastInput } from './FastInput';
import { safeGetItemLocal, safeSetItemLocal, safeRemoveItemLocal, safeGetItemSession, safeSetItemSession, safeRemoveItemSession } from "../lib/storage";
import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import Draggable from 'react-draggable';
import { X, Target, Edit2, Plus, Trash2, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup, TaskComment } from '../types';
import { getStatus, formatToDatetimeLocal, parseDateTime, enrichProjects, generateId, cn, getTaskStatus, resolveActualStatus, removeCodeFromLinkCodesString, extractAllProjectCodes } from '../lib/utils';
import { doc, collection, query, where, getDocs } from 'firebase/firestore';
import {    db, APP_ID, storage , writeBatch , setDoc , deleteDoc } from "../lib/firebase";
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { googleSignIn, getAccessToken } from '../lib/firebase';
import { undoManager } from '../lib/undoManager';
import { lazyWithRetry } from '../lib/lazyWithRetry';

const ConfirmModal = lazyWithRetry(() => import('./ConfirmModal').then(m => ({ default: m.ConfirmModal })), 'ConfirmModal');
import { MultiSelect } from './MultiSelect';
import { LazyImage } from './LazyImage';
import { ProjectDelegationTab } from "./ProjectDelegationTab";
import { QRCodeButton } from './QRCodeButton';
import { useAppStore } from "../store/useAppStore";
import { deleteStorageFiles, extractStorageUrls } from "../lib/storageUtils";

import { useEnrichedData } from '../hooks/useEnrichedData';
import { addPendingUpdate } from '../lib/syncQueue';
import { bumpConfigVersion } from '../lib/configCacheService';
import { getProjectCodeChangePredecessorUpdates } from '../lib/ganttUtils';
import { calculateProjectComputedDates, getTasksForProject } from '../lib/projectDatesService';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  isReadOnly?: boolean;
  initialTab?: 'details' | 'chat' | 'delegation';
  onOpenTask?: (taskId: string) => void;
}



const FastTextarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string; onChange: (v: string) => void }>(({ value, onChange, ...props }, ref) => {
  const [local, setLocal] = useState(value);
  const isCanceling = React.useRef(false);
  useEffect(() => { setLocal(value); }, [value]);
  return <textarea 
    {...props} 
    ref={ref} 
    value={local} 
    onChange={e => { 
      const val = e.target.value;
      setLocal(val); 
      onChange(val);
      if (props.onChangeCapture) props.onChangeCapture(e); 
    }} 
    onBlur={(e) => { 
      if (!isCanceling.current) {
        onChange(local); 
      }
      isCanceling.current = false;
      if (props.onBlur) props.onBlur(e); 
    }} 
    onKeyDown={(e) => {
      if (e.key === 'Escape') {
        isCanceling.current = true;
        setLocal(value);
        onChange(value);
        e.currentTarget.blur();
      }
      if (props.onKeyDown) props.onKeyDown(e);
    }}
  />
});

function getLinkCodesValidationError(
  inputLinkCodes: string,
  currentCode: string,
  currentProjectId: string | undefined,
  allProjects: Project[],
  currentYear?: string | number | null,
  currentStore?: string | null
) {
  if (!inputLinkCodes || !inputLinkCodes.trim()) return null;

  const enteredCodes = inputLinkCodes
    .split(/[,;/]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const selfCodeLower = (currentCode || '').trim().toLowerCase();
  const currentYearStr = currentYear !== undefined && currentYear !== null ? String(currentYear).trim() : '';
  const currentStoreStr = currentStore ? String(currentStore).trim().toLowerCase() : '';

  for (const code of enteredCodes) {
    const codeLower = code.toLowerCase();
    if (codeLower === selfCodeLower) continue;

    const duplicate = allProjects.find((p) => {
      if (currentProjectId && p.id === currentProjectId) return false;
      const otherCodeLower = String(p.code || '').trim().toLowerCase();
      if (otherCodeLower !== codeLower || otherCodeLower === '') return false;

      // Condition: Compare Year / Project Year
      const pAny = p as any;
      const otherYearStr = p.year !== undefined && p.year !== null 
        ? String(p.year).trim() 
        : (pAny.projectYear !== undefined && pAny.projectYear !== null ? String(pAny.projectYear).trim() : '');

      if (currentYearStr && otherYearStr && currentYearStr !== otherYearStr) {
        return false; // Different year - no collision
      }

      // Condition: Compare Store if both present
      const otherStoreStr = p.store ? String(p.store).trim().toLowerCase() : (pAny.projectStore ? String(pAny.projectStore).trim().toLowerCase() : '');
      if (currentStoreStr && otherStoreStr && currentStoreStr !== otherStoreStr) {
        return false; // Different store - no collision
      }

      return true;
    });

    if (duplicate) {
      const dupYear = duplicate.year || (duplicate as any).projectYear || '';
      return {
        invalidCode: code,
        duplicateProjectCode: duplicate.code,
        duplicateProjectName: duplicate.name,
        duplicateProjectYear: dupYear,
      };
    }
  }

  return null;
}

import { ProjectChat } from './ProjectModal/ProjectChat';
export function ProjectModal({ isOpen, onClose, project, isReadOnly = false, initialTab = 'details', onOpenTask}: ProjectModalProps) {

  const { enrichedProjects: projects, filteredTasks: tasks, visibleDelegationGroups: delegationGroups } = useEnrichedData();
  const costs = useAppStore(state => state.costs);
  const currentUser = useAppStore(state => state.currentUser)!;
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const locations = useAppStore(state => state.locations);
  const theme = useAppStore(state => state.theme);
  const appUsers = useAppStore(state => state.appUsers);
  const subAppUsers = useAppStore(state => state.subAppUsers);
  const parties = useAppStore(state => state.parties);

  const { t } = useLanguage();
  const nodeRef = React.useRef(null);
  const setToast = useAppStore(state => state.setToast);
  const cloudStatus = useAppStore(state => state.cloudStatus);
  const [activeTab, setActiveTab] = useState<'details' | 'chat' | 'delegation'>(initialTab as any);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setIsSubmitting(false);
    }
  }, [isOpen, initialTab]);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [newLocation, setNewLocation] = useState("");

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

  const linkCodesError = React.useMemo(() => {
    const rawLink = formData.linkCodes !== undefined ? String(formData.linkCodes) : String(formData.code || '');
    return getLinkCodesValidationError(rawLink, String(formData.code || ''), project?.id, projects, formData.year, formData.store);
  }, [formData.linkCodes, formData.code, formData.year, formData.store, project?.id, projects]);
  const yearRef = useRef<HTMLInputElement>(null);

  const [confirmModal, setConfirmModal] = useState<{isOpen: boolean, title: string, message: string, onConfirm: () => void}>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = !isReadOnly && (currentUser?.role === 'admin' || currentUser?.canWrite) && !isArchiveYear;

  const enrichedProject = React.useMemo(() => (project ? enrichProjects([project], tasks)[0] : null), [project, tasks]);

  useEffect(() => {
    if (project) {
      setFormData({
        ...project,
        linkCodes: project.linkCodes ?? project.code ?? ''
      });
    } else {
      // Default suggestions based on permissions
      let defaultStore = 'HCM';
      if (currentUser?.role !== 'admin') {
        const allowedStores = [];
        if (currentUser?.storePermissions?.hcm) allowedStores.push('HCM');
        if (currentUser?.storePermissions?.hn) allowedStores.push('HN');
        
        if (allowedStores.length === 1) {
          defaultStore = allowedStores[0];
        } else {
          // If multiple or none, no suggestion
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
            .map(([loc, _]) => loc);
          
          if (allowedLocs.length === 1) {
            const matched = locations.find(l => l.toLowerCase() === allowedLocs[0]);
            defaultLocation = matched || allowedLocs[0];
          } else {
            // Multiple or none, no suggestion
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

  if (!isOpen) return null;

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
        useAppStore.getState().setToast({ title: 'Validation Error', message: 'Project Year is strictly required.', type: 'error' });
        setIsSubmitting(false);
        return;
      }
      const yearNum = Number(formData.year);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        useAppStore.getState().setToast({ title: 'Validation Error', message: 'Please enter a valid Project Year.', type: 'error' });
        setIsSubmitting(false);
        return;
      }

      const cleanCode = String(formData.code || '').replace(/\s+/g, '');
      if (!cleanCode) {
        useAppStore.getState().setToast({ title: 'Validation Error', message: 'Project Code is strictly required and cannot contain spaces.', type: 'error' });
        setIsSubmitting(false);
        return;
      }

      if (linkCodesError) {
        const yearDetail = linkCodesError.duplicateProjectYear ? ` năm ${linkCodesError.duplicateProjectYear}` : '';
        useAppStore.getState().setToast({
          title: 'Mã dự án trùng lặp',
          message: `Mã "${linkCodesError.invalidCode}" đã thuộc về dự án "${linkCodesError.duplicateProjectCode}"${yearDetail} (${linkCodesError.duplicateProjectName}). Không thể dùng mã dự án khác làm Project Code Link.`,
          type: 'error'
        });
        setIsSubmitting(false);
        return;
      }

      const tasks = useAppStore.getState().tasks;
      const delegationGroups = useAppStore.getState().delegationGroups;
      const computedDates = calculateProjectComputedDates(
        project || formData,
        getTasksForProject(formData, tasks),
        delegationGroups
      );

      const dataToSave: any = { 
        ...formData, 
        no, 
        year: yearNum,
        code: String(formData.code).trim(),
        linkCodes: formData.linkCodes ? String(formData.linkCodes).trim() : String(formData.code).trim(),
        isDeleted: false,
        taskCount: computedDates.taskCount ?? project?.taskCount ?? 0,
        taskSummaries: computedDates.taskSummaries || project?.taskSummaries || [],
        computedPlanProgress: computedDates.computedPlanProgress ?? project?.computedPlanProgress ?? 0,
        computedActProgress: computedDates.computedActProgress ?? project?.computedActProgress ?? 0,
        computedTakStart: computedDates.computedTakStart || enrichedProject?.computedTakStart || project?.computedTakStart || formData.start || "",
        computedTakCompl: computedDates.computedTakCompl || enrichedProject?.computedTakCompl || project?.computedTakCompl || formData.handover || "",
        computedOpening: computedDates.computedOpening || enrichedProject?.computedOpening || project?.computedOpening || formData.opening || "",
      };

      // Draft mechanism when offline
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

      // Sanitize dataToSave to remove any undefined fields
      Object.keys(dataToSave).forEach(key => {
        if (dataToSave[key] === undefined) {
          delete dataToSave[key];
        }
      });

      // Check for duplicate project code in the same year and store
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
        const batch = writeBatch(db);
        
        // Update project document
        const projectRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId);
        batch.set(projectRef, {
          ...dataToSave,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        // Compute cascaded code & predecessor updates across all tasks
        const storeTasks = useAppStore.getState().tasks || [];
        const { taskUpdates, predecessorUpdates } = getProjectCodeChangePredecessorUpdates(
          project,
          String(formData.code).trim(),
          formData.year,
          formData.store,
          storeTasks,
          projects
        );

        // Update tasks associated with old project identity
        const oldPCode = String(project.code || '').trim().toLowerCase();
        const oldPYear = String(project.year || '');
        const oldPStore = String(project.store || '').trim().toLowerCase();

        const relatedTasks = storeTasks.filter(t => {
          const matchesCode = String(t.projectCode || '').trim().toLowerCase() === oldPCode;
          const matchesYear = !t.projectYear || !oldPYear || String(t.projectYear) === oldPYear;
          const matchesStore = !t.projectStore || !oldPStore || String(t.projectStore).trim().toLowerCase() === oldPStore;
          return matchesCode && matchesYear && matchesStore;
        });

        const relatedTaskIds = new Set(relatedTasks.map(t => t.id));

        relatedTasks.forEach(t => {
          const tUpdate = taskUpdates.get(t.id) || { 
            projectCode: String(formData.code).trim(),
            projectYear: yearNum,
            projectStore: formData.store
          };
          const pu = predecessorUpdates.find(p => p.id === t.id);
          const payload: any = {
            ...tUpdate,
            updatedAt: new Date().toISOString()
          };
          if (pu && pu.predecessor !== undefined) {
            payload.predecessor = pu.predecessor;
          }
          // Remove any undefined keys to prevent Firestore errors
          Object.keys(payload).forEach(k => {
            if (payload[k] === undefined) delete payload[k];
          });

          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), payload, { merge: true });
        });

        // Update tasks in other projects that reference this project's tasks in predecessor
        predecessorUpdates.forEach(pu => {
          if (!relatedTaskIds.has(pu.id)) {
            const payload: any = {
              predecessor: pu.predecessor,
              updatedAt: pu.updatedAt || new Date().toISOString()
            };
            Object.keys(payload).forEach(k => {
              if (payload[k] === undefined) delete payload[k];
            });
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), payload, { merge: true });
          }
        });

        // Update costs from memory store
        const storeCosts = useAppStore.getState().costs || [];
        const relatedCosts = storeCosts.filter(c => {
          const matchesCode = String(c.projectCode || '').trim().toLowerCase() === oldPCode;
          const matchesYear = !c.projectYear || !oldPYear || String(c.projectYear) === oldPYear;
          const matchesStore = !c.projectStore || !oldPStore || String(c.projectStore).trim().toLowerCase() === oldPStore;
          return matchesCode && matchesYear && matchesStore;
        });

        relatedCosts.forEach(c => {
          const payload: any = { 
            projectCode: String(formData.code).trim(),
            projectYear: yearNum,
            projectStore: formData.store,
            updatedAt: new Date().toISOString()
          };
          Object.keys(payload).forEach(k => {
            if (payload[k] === undefined) delete payload[k];
          });
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), payload, { merge: true });
        });

        // Optimistic update in Zustand store (0ms UI latency)
        const predMap = new Map(predecessorUpdates.map(pu => [pu.id, pu.predecessor]));
        const updatedTasks = storeTasks.map(t => {
          const tUpdate = taskUpdates.get(t.id);
          const newPred = predMap.get(t.id);
          if (tUpdate || newPred !== undefined) {
            return {
              ...t,
              ...(tUpdate || {}),
              ...(newPred !== undefined ? { predecessor: newPred, updatedAt: new Date().toISOString() } : {})
            };
          }
          return t;
        });
        useAppStore.getState().setTasks(updatedTasks);

        const rawProjects = useAppStore.getState().projects || [];
        const savedCode = String(formData.code).trim().toLowerCase();
        const savedYearStr = String(formData.year || '').trim();
        const savedStoreStr = String(formData.store || '').trim().toUpperCase();

        // Automatically clean up savedCode from any other project's linkCodes in the same store and year
        const updatedProjects = rawProjects.map(p => {
          if ((p.id && p.id === project.id) || (p.no !== undefined && project.no !== undefined && p.no === project.no)) {
            return { ...p, ...dataToSave, id: project.id || docId, updatedAt: new Date().toISOString() };
          }
          const pStore = String(p.store || '').trim().toUpperCase();
          const pYear = String(p.year || '').trim();
          if ((!savedStoreStr || !pStore || pStore === savedStoreStr) && (!savedYearStr || !pYear || pYear === savedYearStr)) {
            if (p.linkCodes) {
              const allCodes = extractAllProjectCodes(p);
              if (allCodes.includes(savedCode) && String(p.code || '').trim().toLowerCase() !== savedCode) {
                const cleaned = removeCodeFromLinkCodesString(p.linkCodes, formData.code);
                batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id || String(p.no)), {
                  linkCodes: cleaned,
                  updatedAt: new Date().toISOString()
                }, { merge: true });
                return { ...p, linkCodes: cleaned, updatedAt: new Date().toISOString() };
              }
            }
          }
          return p;
        });
        useAppStore.getState().setProjects(updatedProjects);

        batch.commit().catch(e => {
          console.error("Batch commit failed", e);
          useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        });
        
        undoManager.push({
          description: `Update Identity: ${project.code}(${project.year}) -> ${formData.code}(${formData.year})`,
          revert: async () => {
            const revertBatch = writeBatch(db);
            revertBatch.set(projectRef, project, { merge: true });
            relatedTasks.forEach(t => {
              const tRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id);
              revertBatch.set(tRef, { 
                projectCode: project.code,
                projectYear: project.year,
                projectStore: project.store,
                ...(t.taskCodePhu !== undefined ? { taskCodePhu: t.taskCodePhu } : {}),
                ...(t.predecessor !== undefined ? { predecessor: t.predecessor } : {})
              }, { merge: true });
            });
            predecessorUpdates.forEach(pu => {
              if (!relatedTaskIds.has(pu.id)) {
                const originalTask = storeTasks.find(st => st.id === pu.id);
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', pu.id), {
                  predecessor: originalTask?.predecessor || ''
                }, { merge: true });
              }
            });
            relatedCosts.forEach(c => {
              const cRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id);
              revertBatch.set(cRef, { 
                projectCode: project.code,
                projectYear: project.year,
                projectStore: project.store
              }, { merge: true });
            });
            revertBatch.commit().catch(console.error);
          }
        });
      } else {
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), {
          ...dataToSave,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        
        const rawProjects = useAppStore.getState().projects || [];
        const savedCode = String(formData.code).trim().toLowerCase();
        const savedYearStr = String(formData.year || '').trim();
        const savedStoreStr = String(formData.store || '').trim().toUpperCase();

        // Automatically clean up savedCode from any other project's linkCodes in the same store and year
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

          // Auto-adjust filters so user immediately sees their newly created project
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

          useAppStore.getState().setToast({
            title: "Tạo dự án thành công",
            message: filterChangedNotice
              ? `Đã tạo dự án ${formData.code} (${yearNum} - ${formData.store}) và tự động chuyển bộ lọc sang${filterChangedNotice}.`
              : `Đã tạo dự án ${formData.code} thành công.`,
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
      useAppStore.getState().setToast({ title: "Error", message: e?.message || "Failed to save project.", type: "error" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!project) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Project',
      message: 'Permanently delete?',
      onConfirm: async () => {
        try {
          const docId = project.id || String(project.no);
          const relatedTasks = tasks.filter(t => 
            t.projectCode === project.code && 
            (t.projectYear == project.year || (!t.projectYear && !project.year)) &&
            (t.projectStore == project.store || (!t.projectStore && !project.store))
          );
          
          const nowIso = new Date().toISOString();
          const batch = writeBatch(db);
          batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), { id: docId, isDeleted: true, updatedAt: nowIso }, { merge: true });
          
          relatedTasks.forEach(t => {
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), { id: t.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });
          
          // Delete related costs from memory store (Zero-read optimization)
          const storeCosts = useAppStore.getState().costs || [];
          const relatedCosts = storeCosts.filter(c => 
            c.projectCode === project.code &&
            String(c.projectYear || '') === String(project.year || '') &&
            String(c.projectStore || '') === String(project.store || '')
          );
          relatedCosts.forEach(c => {
            batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), { id: c.id, isDeleted: true, updatedAt: nowIso }, { merge: true });
          });

          // Delete related delegations from memory store (Zero-read optimization)
          const storeDelegations = useAppStore.getState().delegationGroups || [];
          const relatedDelGroups = storeDelegations.filter(d => 
            relatedTasks.some(t => t.id === d.parentTaskId) || d.projectCode === project.code
          );
          relatedDelGroups.forEach(d => {
            batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id));
          });

          const costsToDelete = relatedCosts.map(c => ({ id: c.id, data: c }));
          const delegationsToDelete = relatedDelGroups.map(d => ({ id: d.id, data: d }));

          // Storage Cleanup (Deep Clean) - As per AGENTS.md Rule 4
          const urlsToDelete: string[] = [];
          urlsToDelete.push(...extractStorageUrls(project));
          relatedTasks.forEach(t => {
            urlsToDelete.push(...extractStorageUrls(t));
          });
          relatedCosts.forEach(c => {
            urlsToDelete.push(...extractStorageUrls(c));
          });
          if (urlsToDelete.length > 0) {
            deleteStorageFiles(urlsToDelete).catch(err => console.error("Storage delete failed", err));
          }

          try {
        batch.commit().catch(e => console.error("Batch commit failed", e));
      } catch (error: any) {
        console.error("Batch commit failed", error);
        useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
        return;
      }

          undoManager.push({
            description: `Delete Project: ${project.code}`,
            revert: async () => {
              const revertBatch = writeBatch(db);
              revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId), project);
              relatedTasks.forEach(t => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', t.id), t);
              });
              costsToDelete.forEach(c => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', c.id), c.data);
              });
              delegationsToDelete.forEach(d => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', d.id), d.data);
              });
              revertBatch.commit().catch(console.error);
            }
          });
          
          onClose();
        } catch (e) { console.error(e); }
      }
    });
  };

  return (
<Portal>
    <div 
      className="fixed inset-0 bg-slate-900/60 z-[9999] flex items-center justify-center p-0 md:p-4 overscroll-contain"
      onWheel={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
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
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button">
        <div 
          ref={nodeRef} 
          className="bg-white dark:bg-[#1e1e20] md:rounded-2xl shadow-2xl w-full h-full md:h-auto max-h-[100dvh] md:max-h-[90vh] max-w-2xl overflow-hidden relative flex flex-col pointer-events-auto overscroll-contain"
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          <div className="modal-handle cursor-move px-4 md:px-6 py-4 border-b border-slate-100 dark:border-[#333336] flex justify-between items-center bg-slate-50 dark:bg-[#1e1e20]/50 shrink-0 pt-[env(safe-area-inset-top)] md:pt-4">
          {project ? (
            <div className="flex gap-2">
              <button type="button" onClick={() => setActiveTab('details')} 
                className={cn("px-3 py-1 rounded-lg text-sm font-bold transition-colors", activeTab === 'details' ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]")}
              >
                Project Details
              </button>
              <button type="button" onClick={() => setActiveTab('chat')} 
                className={cn("px-3 py-1 rounded-lg text-sm font-bold transition-colors", activeTab === 'chat' ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]")}
              >{t("Comments")}</button>
              <button type="button" onClick={() => setActiveTab('delegation')} 
                className={cn("px-3 py-1 rounded-lg text-sm font-bold transition-colors flex items-center gap-1", activeTab === 'delegation' ? "bg-slate-200 dark:bg-[#333336] text-slate-800 dark:text-[#e3e3e3]" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-[#28282a]")}
              >
                Tracker
              </button>
            </div>
          ) : (
             <h3 className="text-lg font-bold text-slate-800 dark:text-[#e3e3e3]">New Project</h3>
          )}
          <div className="flex items-center gap-1">
            {project && project.id && (
              <QRCodeButton 
                title={project.name || project.code} 
                url={`${window.location.origin}${window.location.pathname}?targetType=project&targetId=${project.id || project.no}&code=${encodeURIComponent(project.code || '')}&store=${project.store || ''}&year=${project.year || ''}`} 
              />
            )}
            <button type="button" onClick={onClose} className="text-slate-400 dark:text-[#838383] hover:text-slate-600 p-3 -mr-3">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
        {activeTab === 'details' && (
        <form onSubmit={handleSubmit} className="flex flex-col flex-grow overflow-hidden">
          <div className="p-4 md:p-6 overflow-y-auto flex-grow">
            {/* Row 1: Store, Location, Year */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Store *</label>
                <select 
                  value={formData.store || ""}
                  onChange={(e) => setFormData({ ...formData, store: e.target.value })}
                  required 
                  disabled={!canWrite}
                  className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
                >
                  <option value="" disabled hidden>Select Store</option>
                  <option value="HCM">HCM</option>
                  <option value="HN">HN</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center justify-between">
                  <span>Location *</span>
                  {currentUser?.role === 'admin' && !isAddingLocation && (
                    <button type="button" onClick={() => setIsAddingLocation(true)} className="text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium text-[10px] flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add New
                    </button>
                  )}
                </label>
                {isAddingLocation ? (
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newLocation}
                      onChange={e => setNewLocation(e.target.value)}
                      placeholder="Enter new location"
                      className="flex-grow p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
                      autoFocus
                    />
                    <button type="button" 
                      onClick={async () => {
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
                        setFormData({ ...formData, location: locName });
                        setIsAddingLocation(false);
                        setNewLocation('');
                      }}
                      className="px-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-bold"
                    >
                      Add
                    </button>
                    <button type="button" 
                      onClick={() => { setIsAddingLocation(false); setNewLocation(''); }}
                      className="px-3 bg-slate-200 dark:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] rounded-lg hover:bg-slate-300 dark:hover:bg-[#444446] text-sm font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                <select 
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required 
                  disabled={!canWrite}
                  className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
                >
                  <option value="">Select Location</option>
                  {Array.from(new Set([...locations])).filter(loc => String(loc).toLowerCase() !== "all").filter(loc => {
                    if (currentUser?.role === 'admin') return true;
                    let permLoc = (loc as string).toLowerCase();
                    if (["md-b1", "md-l1", "md-l2", "md-l3", "md-l4"].includes(permLoc)) {
                      permLoc = permLoc.replace("md-", "");
                    }
                    return currentUser?.locationPermissions?.["all"] || currentUser?.locationPermissions?.[permLoc];
                  }).map(loc => (
                    <option key={loc as string} value={loc as string}>{loc as string}</option>
                  ))}
                </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Year *</label>
                <input 
                  ref={yearRef}
                  type="number" 
                  inputMode="numeric"
                  value={formData.year || ''}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value ? parseInt(e.target.value) : '' })}
                  required 
                  readOnly={!canWrite}
                  className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
              </div>
            </div>

            {/* Row 2: Project Code & Project Code Link (Wide side-by-side on iPad/desktop) */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
              <div className="sm:col-span-5">
                <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Project Code *</label>
                <FastInput 
                  type="text" 
                  inputMode="text"
                  value={formData.code || ''}
                  onChange={(val) => {
                    const cleanCode = val.replace(/\s+/g, '');
                    setFormData(prev => {
                      const newCode = cleanCode;
                      const currentLink = prev.linkCodes;
                      const oldCode = prev.code || '';
                      const shouldSync = !currentLink || currentLink.trim() === '' || currentLink.trim() === oldCode.trim();
                      return {
                        ...prev,
                        code: newCode,
                        linkCodes: shouldSync ? newCode : currentLink
                      };
                    });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.code === 'Space') {
                      e.preventDefault();
                    }
                  }}
                  required 
                  readOnly={!canWrite}
                  placeholder="e.g. PM-L1-HCM-2026-01"
                  className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono font-bold uppercase"
                />
              </div>

              <div className="sm:col-span-7">
                <label className="block text-[11px] font-bold text-slate-400 dark:text-[#838383] uppercase mb-1 flex items-center justify-between">
                  <span>Project Code Link</span>
                  <span className="text-[10px] text-slate-400 font-normal lowercase">(multi, cách nhau ",")</span>
                </label>
                <FastInput 
                  type="text" 
                  inputMode="text"
                  value={formData.linkCodes ?? (formData.code || '')}
                  onChange={(val) => setFormData({ ...formData, linkCodes: val })}
                  placeholder="e.g. L3-303-1, L3-303-2"
                  readOnly={!canWrite}
                  className={cn(
                    "w-full p-2.5 border rounded-lg focus:ring-2 outline-none text-xs bg-slate-50 dark:bg-[#1a1a1c]",
                    linkCodesError 
                      ? "border-rose-500 text-rose-600 dark:text-rose-400 focus:ring-rose-500" 
                      : "border-slate-200 dark:border-[#444446] focus:ring-blue-500"
                  )}
                />
                {linkCodesError && (
                  <p className="mt-1.5 text-[11px] text-rose-500 dark:text-rose-400 font-medium flex items-start gap-1 leading-tight">
                    <span className="shrink-0">⚠️</span>
                    <span>Mã "<strong>{linkCodesError.invalidCode}</strong>" đã thuộc về dự án khác (<strong>{linkCodesError.duplicateProjectCode}</strong>{linkCodesError.duplicateProjectYear ? ` - ${linkCodesError.duplicateProjectYear}` : ''} - {linkCodesError.duplicateProjectName}). Không thể nhập.</span>
                  </p>
                )}
              </div>
            </div>
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Project Name *</label>
            <FastInput 
              type="text" 
              inputMode="text"
              value={formData.name || ''}
              onChange={(val) => setFormData({ ...formData, name: val })}
              required 
              readOnly={!canWrite}
              className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
                <span>{t("Baseline Start")}</span>
                {canWrite && <button type="button" onClick={() => setFormData({ ...formData, baselineStart: enrichedProject?.computedTakStart || '' })} className="text-blue-500 hover:text-blue-600 outline-none transition-colors" title="Copy from Plan"><Target className="w-3.5 h-3.5"/></button>}
              </label>
              <input 
                type="datetime-local" 
                value={formData.baselineStart || ''}
                readOnly={!canWrite}
                onChange={(e) => setFormData({ ...formData, baselineStart: e.target.value })}
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm group-hover:border-slate-300 dark:group-hover:border-[#555557] focus:border-blue-500 outline-none read-only:bg-slate-50 read-only:text-slate-500"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">
                <span>{t("Baseline Finish")}</span>
                {canWrite && <button type="button" onClick={() => setFormData({ ...formData, baselineFinish: enrichedProject?.computedTakCompl || '' })} className="text-blue-500 hover:text-blue-600 outline-none transition-colors" title="Copy from Plan"><Target className="w-3.5 h-3.5"/></button>}
              </label>
              <input 
                type="datetime-local" 
                value={formData.baselineFinish || ''}
                readOnly={!canWrite}
                onChange={(e) => setFormData({ ...formData, baselineFinish: e.target.value })}
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm group-hover:border-slate-300 dark:group-hover:border-[#555557] focus:border-blue-500 outline-none read-only:bg-slate-50 read-only:text-slate-500"
              />
            </div>
          </div>
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Party")}</label>
            <MultiSelect
              value={formData.party || ''}
              onChange={(val) => setFormData({ ...formData, party: val })}
              options={parties}
              placeholder="Contractor A, Contractor B"
              disabled={!canWrite}
              className="w-full text-sm"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 mb-5">
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">MD Status</label>
              <select
                value={formData.mdStatus || ''}
                onChange={(e) => setFormData({ ...formData, mdStatus: e.target.value })}
                disabled={!canWrite}
                className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white dark:bg-[#1e1e20]"
              >
                <option value="" disabled hidden>Select MD Status</option>
                <option value="approached">approached</option>
                <option value="negotiation">negotiation</option>
                <option value="MOU sent">MOU sent</option>
                <option value="t&c Agreed">t&c Agreed</option>
                <option value="Signed agreement">Signed agreement</option>
                <option value="Rejected">{t("Rejected")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Description</label>
              <FastTextarea 
                inputMode="text"
                value={formData.detail || ''}
                onChange={(val) => setFormData({ ...formData, detail: val })}
                rows={3} 
                readOnly={!canWrite}
                className="w-full p-2.5 border border-slate-200 dark:border-[#444446] rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 md:grid-cols-2 gap-4 mb-8">
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Pj Start</label>
              <input 
                type="datetime-local" 
                value={enrichedProject?.computedTakStart || ''}
                readOnly
                disabled
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Pj Compl</label>
              <input 
                type="datetime-local" 
                value={enrichedProject?.computedTakCompl || ''}
                readOnly
                disabled
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">Opening</label>
              <input 
                type="datetime-local" 
                value={enrichedProject?.computedOpening || ''}
                readOnly
                disabled
                className="w-full p-2 border border-slate-200 dark:border-[#444446] rounded-lg text-sm bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] cursor-not-allowed font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 dark:text-[#838383] uppercase mb-1">{t("Status")}</label>
              <input 
                type="text" 
                value={getStatus(enrichedProject?.computedTakStart || '', enrichedProject?.computedTakCompl || '', enrichedProject?.computedOpening || '', formData.code || '')}
                disabled 
                className="w-full p-2 border border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-400 dark:text-[#838383] rounded-lg font-bold text-sm"
              />
            </div>
          </div>

          </div>
          <div className="px-4 md:px-6 py-4 border-t border-slate-100 dark:border-[#333336] flex items-center justify-between shrink-0 bg-white dark:bg-[#1e1e20] pb-[env(safe-area-inset-bottom)]">
            {project && canWrite && (
              <button title="Delete from Cloud" type="button" onClick={handleDelete} className="px-4 py-2 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                Delete from Cloud
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button type="button" onClick={onClose} className="px-6 py-2 text-sm font-bold text-slate-600 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] rounded-lg">Close</button>
              {canWrite && (
                <button title="Save to Cloud" type="submit" className="px-8 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-lg font-bold text-sm shadow-xl active:scale-95 transition-all">
                  Save to Cloud
                </button>
              )}
            </div>
          </div>
        </form>
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
          <ProjectDelegationTab
              project={project}
              projects={projects}
              tasks={tasks}
              currentUser={currentUser}
              appUsers={appUsers}
              delegationGroups={delegationGroups}
              setConfirmModal={setConfirmModal}
          />
        )}
      </div>
      </Draggable>
    </div>
</Portal>
  );
}

