import React, { useEffect, useState } from 'react';
import { doc } from 'firebase/firestore';
import { setDoc, deleteDoc } from '../../lib/firestoreWrites';
import { Project, Task, AppUser, DelegationGroup, DelegationSubTask } from '../../types';
import { db, APP_ID } from '../../lib/firebase';
import { generateId, getTaskStatus, getStatus, resolveActualStatus } from '../../lib/utils';
import { useAppStore } from '../../store/useAppStore';
import { extractStorageUrls, deleteStorageFiles } from '../../lib/storageUtils';
import { DelegatableItem, resolveGroupParentProject, computeFallbackYear } from './taskDelegationTypes';
import { checkAndSyncRealtimeSubTaskCompletion } from './delegationAutoSync';

interface UseTaskDelegationMutationsParams {
  canWrite: boolean;
  currentUser: AppUser;
  projects: Project[];
  tasks: Task[];
  groups: DelegationGroup[];
  globalYearFilter: string;
  globalStoreFilter: string;
  setSearchTerm: (term: string) => void;
  setIsSearchFocused: (focused: boolean) => void;
}

export function useTaskDelegationMutations({
  canWrite,
  currentUser,
  projects,
  tasks,
  groups,
  globalYearFilter,
  globalStoreFilter,
  setSearchTerm,
  setIsSearchFocused,
}: UseTaskDelegationMutationsParams) {
  const setToast = useAppStore((state) => state.setToast);
  const [isAddingTask, setIsAddingTask] = useState<Record<string, boolean>>({});
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const handleAddLinkedGroup = async (item: DelegatableItem) => {
    if (!canWrite) return;
    if (isAddingTask[item.id]) return;

    const alreadyExists = groups.some((g) => {
      if (item.type === 'task') return g.parentTaskId === item.id;
      return g.parentTaskId === item.projectCode && (!g.projectStore || g.projectStore === item.projectStore);
    });

    if (alreadyExists) {
      setToast({ title: 'Error', message: 'A Delegation Group already exists for this item.' });
      return;
    }

    setIsAddingTask((prev) => ({ ...prev, [item.id]: true }));
    try {
      const parentTask = item.type === 'task' ? tasks.find((t) => t.id === item.id) : null;
      const parentProject = projects.find(
        (p) =>
          p.code === item.projectCode &&
          (item.projectStore ? p.store === item.projectStore : true) &&
          (item.projectYear ? String(p.year) === String(item.projectYear) : true)
      );

      let startAct = parentTask?.start || parentProject?.computedTakStart || parentProject?.start;
      let finishAct = parentTask?.finish || parentProject?.computedTakCompl;

      if (!startAct) startAct = new Date().toISOString().substring(0, 10);
      if (!finishAct) finishAct = new Date().toISOString().substring(0, 10);

      const rawParty =
        parentTask?.party && parentTask.party.trim()
          ? parentTask.party.trim()
          : parentProject?.party && parentProject.party.trim()
          ? parentProject.party.trim()
          : currentUser.username || '';
      const parsedParty = rawParty.split(/[,;/+]+/).map((s) => s.trim()).filter(Boolean)[0] || rawParty;

      const initialSubTask: DelegationSubTask = {
        id: generateId(),
        name: '',
        comments: '',
        status: 'Assigned',
        delegationStatus: 'Assigned',
        priority: 'Mid',
        party: parsedParty,
        startAct,
        finishAct,
        updatedAt: new Date().toISOString(),
        createdBy: currentUser.id,
        involvedUsers: [currentUser.id],
      };

      const fallbackYear = computeFallbackYear(item.projectYear, parentProject, globalYearFilter);
      const parentKey = item.type === 'project' ? item.projectCode : item.id;
      const storeSuffix = item.projectStore || parentProject?.store || 'HCM';
      const existingGroup = groups.find((g) =>
        item.type === 'project'
          ? g.parentTaskId === item.projectCode &&
            (!g.projectStore || g.projectStore === storeSuffix) &&
            (!g.projectYear || String(g.projectYear) === String(fallbackYear))
          : g.parentTaskId === item.id
      );
      const targetGroupId =
        existingGroup?.id ||
        (item.type === 'project' ? `del_proj_${item.projectCode}_${storeSuffix}_${fallbackYear}` : `del_${item.id}`);

      if (existingGroup) {
        if (item.type === 'task' && existingGroup.subTasks && existingGroup.subTasks.length > 0) {
          setToast({ title: 'Notice', message: 'This task already has a delegation.' });
          return;
        }
        const updatedSubTasks = [...(existingGroup.subTasks || []), initialSubTask];
        setDoc(
          doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', targetGroupId),
          {
            ...existingGroup,
            subTasks: updatedSubTasks,
            projectYear: fallbackYear,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        const newGroup: DelegationGroup = {
          id: targetGroupId,
          parentTaskId: parentKey,
          name: item.name,
          projectCode: item.projectCode,
          projectStore: item.projectStore || parentProject?.store || 'HCM',
          projectYear: fallbackYear,
          subTasks: [initialSubTask],
          updatedAt: new Date().toISOString(),
          createdBy: currentUser.id,
        };
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', targetGroupId), newGroup, {
          merge: true,
        });
      }

      if (item.type === 'task') {
        const taskRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', item.id);
        if (parentTask) {
          setDoc(taskRef, { ...parentTask, delegation: true, updatedAt: new Date().toISOString() });
        }
      } else if (item.type === 'project') {
        const projRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', item.id);
        if (parentProject) {
          setDoc(projRef, { ...parentProject, delegation: true, updatedAt: new Date().toISOString() });
        }
      }

      setSearchTerm('');
      setIsSearchFocused(false);
    } finally {
      setIsAddingTask((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  const handleAddCustomGroup = async () => {
    if (!canWrite) return;

    const dateStr = new Date().toISOString().substring(0, 10);
    const initialSubTask: DelegationSubTask = {
      id: generateId(),
      name: '',
      comments: '',
      status: 'Assigned',
      delegationStatus: 'Assigned',
      priority: 'Mid',
      party: currentUser.username || '',
      startAct: dateStr,
      finishAct: dateStr,
      updatedAt: new Date().toISOString(),
    };

    const fallbackYear = computeFallbackYear(null, null, globalYearFilter);
    const fallbackStore =
      globalStoreFilter && globalStoreFilter !== 'all'
        ? globalStoreFilter
        : currentUser?.storePermissions?.hcm
        ? 'HCM'
        : 'HN';

    const newGroup: DelegationGroup = {
      id: generateId(),
      name: 'New Custom Delegation',
      projectStore: fallbackStore,
      projectYear: fallbackYear,
      subTasks: [initialSubTask],
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.id,
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', newGroup.id), newGroup);
  };

  const handleUpdateGroup = async (group: DelegationGroup, updates: Partial<DelegationGroup>) => {
    if (!canWrite) return;
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    const fallbackYear = computeFallbackYear(group.projectYear, parentProject, globalYearFilter);
    const updated = {
      ...group,
      ...updates,
      projectYear:
        updates.projectYear !== undefined && !isNaN(Number(updates.projectYear))
          ? Number(updates.projectYear)
          : fallbackYear,
      updatedAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updated);
  };

  const handleDeleteGroup = async (group: DelegationGroup) => {
    if (!canWrite) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Delegation Group',
      message: 'Delete this delegation group?',
      onConfirm: async () => {
        // Deep clean attachments on Firebase Storage
        const urlsToDelete = extractStorageUrls(group);
        if (urlsToDelete.length > 0) {
          deleteStorageFiles(urlsToDelete).catch(console.error);
        }

        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));

        if (group.parentTaskId) {
          const parentTask = tasks.find((t) => t.id === group.parentTaskId);
          if (parentTask) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), {
              ...parentTask,
              delegation: false,
              updatedAt: new Date().toISOString(),
            });
          } else {
            const parentProject = resolveGroupParentProject(group, projects, tasks);
            if (parentProject) {
              setDoc(
                doc(
                  db,
                  'artifacts',
                  APP_ID,
                  'public',
                  'data',
                  'taka_projects',
                  parentProject.id || String(parentProject.no)
                ),
                { ...parentProject, delegation: false, updatedAt: new Date().toISOString() }
              );
            }
          }
        }
      },
    });
  };

  const handleAddSubTask = async (group: DelegationGroup) => {
    if (!canWrite) return;

    const parentTask = group.parentTaskId ? tasks.find((t) => t.id === group.parentTaskId) : null;
    const parentProject = resolveGroupParentProject(group, projects, tasks);

    let startAct = parentTask?.start || parentProject?.computedTakStart || parentProject?.start;
    let finishAct = parentTask?.finish || parentProject?.computedTakCompl;

    if (!startAct) startAct = new Date().toISOString().substring(0, 10);
    if (!finishAct) finishAct = new Date().toISOString().substring(0, 10);

    const newSubTask: DelegationSubTask = {
      id: generateId(),
      name: '',
      comments: '',
      status: 'Assigned',
      delegationStatus: 'Assigned',
      priority: 'Mid',
      party: currentUser.username || '',
      startAct,
      finishAct,
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.id,
      involvedUsers: [currentUser.id],
    };
    const fallbackYear = computeFallbackYear(group.projectYear, parentProject, globalYearFilter);
    const updatedGroup = {
      ...group,
      projectYear: fallbackYear,
      subTasks: [...group.subTasks, newSubTask],
      updatedAt: new Date().toISOString(),
    };
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);

    if (group.parentTaskId) {
      const parentTask = tasks.find((t) => t.id === group.parentTaskId);
      if (parentTask) {
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), {
          ...parentTask,
          projectYear: Number(parentTask.projectYear) || fallbackYear,
          delegation: true,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const parentProj = resolveGroupParentProject(group, projects, tasks);
        if (parentProj) {
          setDoc(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', parentProj.id || String(parentProj.no)),
            { ...parentProj, delegation: true, updatedAt: new Date().toISOString() }
          );
        }
      }
    }
  };

  const handleUpdateSubTask = async (
    group: DelegationGroup,
    subTaskId: string,
    updates: Partial<DelegationSubTask>
  ) => {
    const subTask = group.subTasks.find((st) => st.id === subTaskId);
    if (!subTask) return;

    const isCreator = group.createdBy === currentUser.id;
    const pPartyList = (subTask.party || '').split(',').map((p) => p.toLowerCase().trim());
    const userParties = currentUser.partyPermissions
      ? Object.keys(currentUser.partyPermissions)
          .filter((k) => currentUser.partyPermissions![k])
          .map((k) => k.toLowerCase().trim())
      : [];
    const isPIC =
      userParties.includes('all') ||
      pPartyList.some((p) => userParties.includes(p)) ||
      pPartyList.includes(String(currentUser.username || '').toLowerCase().trim()) ||
      (subTask.involvedUsers && subTask.involvedUsers.includes(currentUser.id));
    const canEditSubTask = canWrite || isCreator || isPIC;

    if (!canEditSubTask) return;

    const updatedSubTasks = group.subTasks.map((st) =>
      st.id === subTaskId
        ? {
            ...st,
            ...updates,
            updatedAt: new Date().toISOString(),
            involvedUsers: Array.from(new Set([...(st.involvedUsers || []), currentUser.id])),
          }
        : st
    );
    const parentProject = resolveGroupParentProject(group, projects, tasks);
    const fallbackYear = computeFallbackYear(group.projectYear, parentProject, globalYearFilter);
    const updatedGroup = JSON.parse(
      JSON.stringify({
        ...group,
        projectYear: fallbackYear,
        subTasks: updatedSubTasks,
        updatedAt: new Date().toISOString(),
      })
    );
    setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);

    if (group.parentTaskId) {
      const parentTask = tasks.find((t) => t.id === group.parentTaskId);
      if (parentTask) {
        checkAndSyncRealtimeSubTaskCompletion(
          parentTask,
          parentProject,
          group.subTasks,
          updatedSubTasks,
          tasks,
          projects
        );
      }
    }
  };

  const handleDeleteSubTask = async (group: DelegationGroup, subTaskId: string) => {
    if (!canWrite) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Delegation Task',
      message: 'Delete this delegation task?',
      onConfirm: async () => {
        const targetSubTask = group.subTasks.find((st) => st.id === subTaskId);
        if (targetSubTask) {
          const urlsToDelete = extractStorageUrls(targetSubTask);
          if (urlsToDelete.length > 0) {
            deleteStorageFiles(urlsToDelete).catch(console.error);
          }
        }

        const updatedSubTasks = group.subTasks.filter((st) => st.id !== subTaskId);
        if (updatedSubTasks.length === 0) {
          deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
          if (group.parentTaskId) {
            const parentTask = tasks.find((t) => t.id === group.parentTaskId);
            if (parentTask) {
              setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), {
                ...parentTask,
                delegation: false,
                updatedAt: new Date().toISOString(),
              });
            } else {
              const parentProject = resolveGroupParentProject(group, projects, tasks);
              if (parentProject) {
                setDoc(
                  doc(
                    db,
                    'artifacts',
                    APP_ID,
                    'public',
                    'data',
                    'taka_projects',
                    parentProject.id || String(parentProject.no)
                  ),
                  { ...parentProject, delegation: false, updatedAt: new Date().toISOString() }
                );
              }
            }
          }
        } else {
          const parentProject = resolveGroupParentProject(group, projects, tasks);
          const fallbackYear = computeFallbackYear(group.projectYear, parentProject, globalYearFilter);
          const updatedGroup = JSON.parse(
            JSON.stringify({
              ...group,
              projectYear: fallbackYear,
              subTasks: updatedSubTasks,
              updatedAt: new Date().toISOString(),
            })
          );
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup);
        }
      },
    });
  };

  // Synchronize plStatus and actStatus to Firestore
  useEffect(() => {
    if (!canWrite) return;

    groups.forEach((group) => {
      const parentTask = group.parentTaskId ? tasks.find((t) => t.id === group.parentTaskId) : null;
      const parentProject = resolveGroupParentProject(group, projects, tasks);

      let computedPlStatus = 'Upcoming';
      if (parentTask) {
        computedPlStatus = getTaskStatus(parentTask.start, parentTask.finish);
      } else if (parentProject) {
        computedPlStatus = getStatus(
          parentProject.computedTakStart || parentProject.start,
          parentProject.computedTakCompl,
          parentProject.computedOpening || parentProject.opening,
          parentProject.code
        );
      }

      const computedActStatusObj = resolveActualStatus(computedPlStatus, group.subTasks);
      const computedActStatus = computedActStatusObj.label;

      if (group.plStatus !== computedPlStatus || group.actStatus !== computedActStatus) {
        handleUpdateGroup(group, {
          plStatus: computedPlStatus,
          actStatus: computedActStatus,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, canWrite]);

  return {
    confirmModal,
    setConfirmModal,
    isAddingTask,
    handleAddLinkedGroup,
    handleAddCustomGroup,
    handleUpdateGroup,
    handleDeleteGroup,
    handleAddSubTask,
    handleUpdateSubTask,
    handleDeleteSubTask,
  };
}
