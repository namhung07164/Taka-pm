import React, { useState, useMemo } from "react";
import { useLanguage } from "../lib/LanguageContext";
import { Project, Task, AppUser, DelegationGroup } from '../types';
import { computeTaskCode } from '../lib/ganttUtils';
import { isTaskBelongsToProject, isDelegationGroupBelongsToProject } from '../lib/utils';
import { doc } from 'firebase/firestore';
import { deleteDoc, setDoc } from '../lib/firestoreWrites';
import { db, APP_ID } from "../lib/firebase";
import { Search } from 'lucide-react';
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

  const handleDeleteGroup = async (group: DelegationGroup) => {
    const doDelete = async () => {
      deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
      if (group.parentTaskId) {
        const parentTask = tasks.find(t => t.id === group.parentTaskId);
        if (parentTask) {
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() }, { merge: true });
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
      if (window.confirm('Delete this delegation group?')) {
        doDelete();
      }
    }
  };

  const handleDeleteSubTask = async (group: DelegationGroup, subTaskId: string) => {
    const doDelete = async () => {
      const updatedSubTasks = (group.subTasks || []).filter(st => st.id !== subTaskId);
      if (updatedSubTasks.length === 0) {
        deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', group.id));
        if (group.parentTaskId) {
          const parentTask = tasks.find(t => t.id === group.parentTaskId);
          if (parentTask) {
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', parentTask.id), { ...parentTask, delegation: false, updatedAt: new Date().toISOString() }, { merge: true });
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
      if (window.confirm('Delete this delegation sub-task?')) {
        doDelete();
      }
    }
  };

  const projectGroups = useMemo(() => {
    if (!project) return [];

    // Collect all tasks, task IDs, and taskCodePhu belonging strictly to this project (matching year, store, projectId, and projectCode)
    const projectTasks: Task[] = [];
    const projectTaskIds = new Set<string>();
    const projectTaskCodePhuSet = new Set<string>();

    tasks.forEach(t => {
      if (!isTaskBelongsToProject(t, project)) return;
      projectTasks.push(t);
      if (t.id) projectTaskIds.add(t.id);
      if (t.taskCodePhu) projectTaskCodePhuSet.add(String(t.taskCodePhu).trim().toLowerCase());
    });

    return (delegationGroups || []).filter(g => {
      if (!g || g.isDeleted) return false;

      const gParentTaskId = String(g.parentTaskId || '').trim();
      const gParentTaskIdLower = gParentTaskId.toLowerCase();

      // 1. Direct match with project's own tasks
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
      const gParentTaskIdLower = String(g.parentTaskId || '').trim().toLowerCase();
      const parentTask =
        projectTasks.find(t => t.id === g.parentTaskId || (t.taskCodePhu && String(t.taskCodePhu).toLowerCase() === gParentTaskIdLower)) ||
        tasks.find(t => t && t.id === g.parentTaskId);
      const isChildTask = parentTask ? Boolean(parentTask.parentTaskId) : false;
      const rootParentTask = isChildTask
        ? (projectTasks.find(t => t.id === parentTask?.parentTaskId) || tasks.find(t => t.id === parentTask?.parentTaskId))
        : null;
      return {
        ...g,
        _taskCode: parentTask ? computeTaskCode(projects, tasks, parentTask) : (g.projectCode || ''),
        _taskName: parentTask?.name || g.name || 'Delegated Sub-tasks',
        _isChildTask: isChildTask,
        _parentTaskName: rootParentTask?.name || null
      };
    }).sort((a, b) => (a._taskCode || '').localeCompare(b._taskCode || '', undefined, { numeric: true, sensitivity: 'base' }));
  }, [delegationGroups, tasks, project, projects]);

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

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#1e1e20]/50 relative overflow-y-auto p-4 md:p-6 pb-20 sm:pb-24 overscroll-contain">
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
        <div className="text-center text-slate-500 py-10">No delegated tasks for this project yet.</div>
      ) : (
        <div className="flex flex-col gap-6">
          {filteredGroups.map(linkedGroup => (
            <ProjectDelegationGroupCard
              key={linkedGroup.id}
              linkedGroup={linkedGroup}
              project={project}
              tasks={tasks}
              projects={projects}
              currentUser={currentUser}
              appUsers={appUsers}
              picOptions={picOptions}
              onInsertTaskTag={onInsertTaskTag}
              handleDeleteGroup={handleDeleteGroup}
              handleDeleteSubTask={handleDeleteSubTask}
            />
          ))}
        </div>
      )}
    </div>
  );
});
