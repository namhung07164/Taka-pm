import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { Project, Task, AppUser, DelegationGroup } from '../types';
import { computeTaskCode } from '../lib/ganttUtils';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from '../lib/utils';
import { doc } from 'firebase/firestore';
import { deleteDoc, setDoc } from '../lib/firestoreWrites';
import { db, APP_ID } from "../lib/firebase";
import { useAppStore } from "../store/useAppStore";
import { Search, ChevronDown } from 'lucide-react';
import { DebouncedSearchInput } from './DebouncedSearchInput';
import { ProjectDelegationGroupCard } from './ProjectModalParts/ProjectDelegationGroupCard';

interface ProjectDelegationTabProps {
  tasks: Task[];
  projects: Project[];
  delegationGroups: DelegationGroup[];
  currentUser: AppUser;
  appUsers: AppUser[];
  project: Project;
  onInsertTaskTag?: (tagName: string) => void;
  setConfirmModal?: (modal: {isOpen: boolean, title: string, message: string, onConfirm: () => void}) => void;
}

const INITIAL_VISIBLE_GROUPS = 20;
const LOAD_MORE_STEP = 25;

export const ProjectDelegationTab = React.memo(function ProjectDelegationTab({
  project,
  tasks,
  projects,
  delegationGroups,
  currentUser,
  appUsers,
  onInsertTaskTag,
  setConfirmModal
}: ProjectDelegationTabProps) {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_GROUPS);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_GROUPS);
  }, [project?.id, project?.code, searchQuery]);

  // Pre-index tasks belonging strictly to this project in O(1) Maps
  const { projectTasks, projectTaskIds, projectTaskCodePhuSet, taskByIdMap, taskByCodePhuMap } = useMemo(() => {
    const pTasks: Task[] = [];
    const pTaskIds = new Set<string>();
    const pTaskCodePhuSet = new Set<string>();
    const byId = new Map<string, Task>();
    const byCodePhu = new Map<string, Task>();

    if (project) {
      for (let i = 0; i < tasks.length; i++) {
        const tsk = tasks[i];
        if (!tsk || tsk.isDeleted) continue;
        if (!isTaskBelongsToProject(tsk, project)) continue;
        pTasks.push(tsk);
        if (tsk.id) {
          pTaskIds.add(tsk.id);
          byId.set(tsk.id, tsk);
        }
        if (tsk.taskCodePhu) {
          const lower = String(tsk.taskCodePhu).trim().toLowerCase();
          pTaskCodePhuSet.add(lower);
          byCodePhu.set(lower, tsk);
        }
      }
    }

    return {
      projectTasks: pTasks,
      projectTaskIds: pTaskIds,
      projectTaskCodePhuSet: pTaskCodePhuSet,
      taskByIdMap: byId,
      taskByCodePhuMap: byCodePhu
    };
  }, [tasks, project]);

  const handleDeleteGroup = useCallback(async (group: DelegationGroup) => {
    const doDelete = async () => {
      // 0ms Optimistic UI update
      const state = useAppStore.getState();
      state.setDelegationGroups(state.delegationGroups.filter(g => g.id !== group.id));
      deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
      if (group.parentTaskId) {
        const parentTask = taskByIdMap.get(group.parentTaskId) || tasks.find(t => t.id === group.parentTaskId);
        if (parentTask) {
          const updatedTask = { ...parentTask, delegation: false, updatedAt: new Date().toISOString() };
          state.optimisticUpdateTasks([updatedTask]);
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), updatedTask, { merge: true });
        }
      }
    };

    if (setConfirmModal) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Delegation Group',
        message: 'Delete this delegation group?',
        onConfirm: doDelete
      });
    } else {
      doDelete();
    }
  }, [setConfirmModal, taskByIdMap, tasks]);

  const handleDeleteSubTask = useCallback(async (group: DelegationGroup, subTaskId: string) => {
    const doDelete = async () => {
      const state = useAppStore.getState();
      const updatedSubTasks = (group.subTasks || []).filter(st => st.id !== subTaskId);
      if (updatedSubTasks.length === 0) {
        state.setDelegationGroups(state.delegationGroups.filter(g => g.id !== group.id));
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
        if (group.parentTaskId) {
          const parentTask = taskByIdMap.get(group.parentTaskId) || tasks.find(t => t.id === group.parentTaskId);
          if (parentTask) {
            const updatedTask = { ...parentTask, delegation: false, updatedAt: new Date().toISOString() };
            state.optimisticUpdateTasks([updatedTask]);
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), updatedTask, { merge: true });
          }
        }
      } else {
        const fallbackYear = (group.projectYear !== undefined && group.projectYear !== null && !isNaN(Number(group.projectYear)))
          ? Number(group.projectYear)
          : (project?.year && !isNaN(Number(project.year)) ? Number(project.year) : new Date().getFullYear());
        const updatedGroup = JSON.parse(JSON.stringify({
          ...group,
          projectYear: fallbackYear,
          subTasks: updatedSubTasks,
          updatedAt: new Date().toISOString()
        }));
        state.setDelegationGroups(state.delegationGroups.map(g => g.id === group.id ? updatedGroup : g));
        setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id), updatedGroup, { merge: true });
      }
    };

    if (setConfirmModal) {
      setConfirmModal({
        isOpen: true,
        title: 'Delete Delegation Task',
        message: 'Delete this delegation sub-task?',
        onConfirm: doDelete
      });
    } else {
      doDelete();
    }
  }, [setConfirmModal, taskByIdMap, tasks, project?.year]);

  const projectGroups = useMemo(() => {
    if (!project) return [];

    const scopedProjects = [project];
    const codeCache = new Map<string, string>();
    const getCachedTaskCode = (t: Task): string => {
      if (t.taskCodePhu) return t.taskCodePhu;
      const cached = codeCache.get(t.id);
      if (cached !== undefined) return cached;
      const computed = computeTaskCode(scopedProjects, projectTasks, t);
      codeCache.set(t.id, computed);
      return computed;
    };

    return (delegationGroups || []).filter(g => {
      if (!g || g.isDeleted) return false;

      const gParentTaskId = String(g.parentTaskId || '').trim();
      const gParentTaskIdLower = gParentTaskId.toLowerCase();

      // 1. Direct O(1) match with project's own tasks
      if (gParentTaskId && projectTaskIds.has(gParentTaskId)) {
        return true;
      }

      // 2. Match by taskCodePhu only if group does not belong to a conflicting year/store/projectId
      if (gParentTaskIdLower && projectTaskCodePhuSet.has(gParentTaskIdLower)) {
        if (isDelegationGroupBelongsToProject({ ...g, projectCode: g.projectCode || project.code }, project)) {
          return true;
        }
      }

      // 3. Direct match with project (verifying store, year, projectId, and projectCode)
      if (isDelegationGroupBelongsToProject(g, project, projectTaskIds)) {
        return true;
      }

      return false;
    }).map(g => {
      const gParentTaskId = String(g.parentTaskId || '').trim();
      const gParentTaskIdLower = gParentTaskId.toLowerCase();
      const parentTask =
        taskByIdMap.get(gParentTaskId) ||
        taskByCodePhuMap.get(gParentTaskIdLower) ||
        null;
      const isChildTask = parentTask ? Boolean(parentTask.parentTaskId) : false;
      const rootParentTask = (isChildTask && parentTask?.parentTaskId)
        ? (taskByIdMap.get(parentTask.parentTaskId) || null)
        : null;
      return {
        ...g,
        _parentTask: parentTask,
        _taskCode: parentTask ? getCachedTaskCode(parentTask) : (g.projectCode || ''),
        _taskName: parentTask?.name || g.name || 'Delegated Sub-tasks',
        _isChildTask: isChildTask,
        _parentTaskName: rootParentTask?.name || null
      };
    }).sort((a, b) => (a._taskCode || '').localeCompare(b._taskCode || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [delegationGroups, project, projectTasks, projectTaskIds, projectTaskCodePhuSet, taskByIdMap, taskByCodePhuMap]);

  const picOptions = useMemo(() => {
    const list = new Set<string>();
    (appUsers || []).forEach(u => u && u.username && list.add(u.username));
    projectGroups.forEach(g => {
       (g.subTasks || []).forEach(st => {
         if (st && st.party) {
           const parts = String(st.party).split(',').map(s => s.trim()).filter(Boolean);
           parts.forEach(p => list.add(p));
         }
       });
    });
    return Array.from(list).sort((a,b) => a.localeCompare(b));
  }, [appUsers, projectGroups]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return projectGroups;
    const lowerQuery = searchQuery.toLowerCase();
    return projectGroups.filter(g => 
      (g._taskName && g._taskName.toLowerCase().includes(lowerQuery)) ||
      (g._taskCode && g._taskCode.toLowerCase().includes(lowerQuery))
    );
  }, [projectGroups, searchQuery]);

  const visibleGroups = useMemo(
    () => filteredGroups.slice(0, visibleCount),
    [filteredGroups, visibleCount]
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (visibleCount >= filteredGroups.length) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) {
      setVisibleCount(prev => Math.min(filteredGroups.length, prev + LOAD_MORE_STEP));
    }
  }, [visibleCount, filteredGroups.length]);

  return (
    <div
      onScroll={handleScroll}
      className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#1e1e20]/50 relative overflow-y-auto p-4 md:p-6 pb-20 sm:pb-24 overscroll-contain"
    >
      <div className="relative w-full mb-4 flex-shrink-0">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
          <Search className="w-4 h-4" />
        </div>
        <DebouncedSearchInput
          placeholder="Search task name or code..."
          value={searchQuery}
          onChange={(val) => setSearchQuery(val)}
          className="bg-blue-50 dark:bg-[#1e1e20] border border-blue-200 dark:border-blue-800/50 text-blue-900 dark:text-blue-100 text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-10 p-2 outline-none shadow-sm placeholder:text-blue-400"
        />
      </div>
      <datalist id="pic-list-modal-project">
        {picOptions.map((u, i) => <option key={i} value={u} />)}
      </datalist>

      {filteredGroups.length === 0 ? (
        <div className="text-center text-slate-500 py-10">{t("No delegated tasks for this project yet.") || "No delegated tasks for this project yet."}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {visibleGroups.map(linkedGroup => (
            <ProjectDelegationGroupCard
              key={linkedGroup.id}
              linkedGroup={linkedGroup}
              project={project}
              tasks={projectTasks}
              projects={projects}
              currentUser={currentUser}
              appUsers={appUsers}
              picOptions={picOptions}
              onInsertTaskTag={onInsertTaskTag}
              handleDeleteGroup={handleDeleteGroup}
              handleDeleteSubTask={handleDeleteSubTask}
            />
          ))}
          {visibleCount < filteredGroups.length && (
            <button
              type="button"
              onClick={() => setVisibleCount(prev => Math.min(filteredGroups.length, prev + LOAD_MORE_STEP))}
              className="mx-auto my-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50 active:scale-95 touch-manipulation transition-all"
            >
              <ChevronDown className="w-4 h-4" />
              Show More ({filteredGroups.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
});
