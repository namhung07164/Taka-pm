import React, { FC, memo } from 'react';
import { Project, Task, AppUser, DelegationGroup } from '../../types';
import { getTaskStatus, resolveActualStatus, cn, computeDelegationGroupProgressPercent } from '../../lib/utils';
import { FileText, ExternalLink, Trash2 } from 'lucide-react';
import { ProjectDelegationSubTaskItem } from './ProjectDelegationSubTaskItem';

interface LinkedDelegationGroup extends DelegationGroup {
  _taskCode?: string;
  _taskName?: string;
  _isChildTask?: boolean;
  _parentTaskName?: string | null;
}

interface ProjectDelegationGroupCardProps {
  linkedGroup: LinkedDelegationGroup;
  project: Project;
  tasks: Task[];
  projects: Project[];
  currentUser: AppUser;
  appUsers: AppUser[];
  picOptions: string[];
  onInsertTaskTag?: (tagName: string) => void;
  handleDeleteGroup: (group: DelegationGroup) => Promise<void>;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => Promise<void>;
}

export const ProjectDelegationGroupCard: React.FC<ProjectDelegationGroupCardProps> = React.memo(({
  linkedGroup,
  project,
  tasks,
  projects,
  currentUser,
  appUsers,
  picOptions,
  onInsertTaskTag,
  handleDeleteGroup,
  handleDeleteSubTask,
}) => {
  const firstSt = linkedGroup.subTasks[0];
  const flowTxtGroup = firstSt ? (firstSt.delegationStatus || firstSt.status || 'Assigned') : 'Assigned';
  
  const parentTask = tasks.find(t => t.id === linkedGroup.parentTaskId);
  const planStatus = parentTask ? getTaskStatus(parentTask.start, parentTask.finish) : 'Upcoming';
  const isRunning = planStatus === 'On process';
  
  let groupBgColor = 'bg-slate-50 dark:bg-slate-900/10 border-slate-200 dark:border-slate-800/50';
  let groupHeaderBorder = 'border-slate-200 dark:border-slate-800/50';
  let groupTitleColor = 'text-slate-900 dark:text-slate-100';
  let groupIconColor = 'text-slate-600 dark:text-slate-400';
  let groupSubTitleColor = 'text-slate-600 dark:text-slate-400';
  let groupTrackerBtn = 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200';

  if (flowTxtGroup === 'Completed') {
    groupBgColor = 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30';
    groupHeaderBorder = 'border-green-200 dark:border-green-900/50';
    groupTitleColor = 'text-green-900 dark:text-green-100';
    groupIconColor = 'text-green-600 dark:text-green-400';
    groupSubTitleColor = 'text-green-700 dark:text-green-300';
    groupTrackerBtn = 'bg-green-100 dark:bg-green-800/50 hover:bg-green-200 dark:hover:bg-green-700 text-green-700 dark:text-green-200';
  } else if (flowTxtGroup === 'On process' || flowTxtGroup === 'Accepted') {
    groupBgColor = 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/30';
    groupHeaderBorder = 'border-blue-200 dark:border-blue-900/50';
    groupTitleColor = 'text-blue-900 dark:text-blue-100';
    groupIconColor = 'text-blue-600 dark:text-blue-400';
    groupSubTitleColor = 'text-blue-700 dark:text-blue-300';
    groupTrackerBtn = 'bg-blue-100 dark:bg-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200';
  } else if (flowTxtGroup === 'Pending completed' || flowTxtGroup === 'Pending Completed' || flowTxtGroup === 'Delayed' || ['requested', 'hold', 'waiting for approval'].includes(flowTxtGroup.toLowerCase())) {
    groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
    groupHeaderBorder = 'border-orange-200 dark:border-orange-900/50';
    groupTitleColor = 'text-orange-900 dark:text-orange-100';
    groupIconColor = 'text-orange-600 dark:text-orange-400';
    groupSubTitleColor = 'text-orange-700 dark:text-orange-300';
    groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
  } else if (flowTxtGroup === 'Approved' || flowTxtGroup === 'Rejected' || flowTxtGroup === 'Request Delay' || flowTxtGroup === 'Needs Rework') {
    groupBgColor = 'bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-900/30';
    groupHeaderBorder = 'border-purple-200 dark:border-purple-900/50';
    groupTitleColor = 'text-purple-900 dark:text-purple-100';
    groupIconColor = 'text-purple-600 dark:text-purple-400';
    groupSubTitleColor = 'text-purple-700 dark:text-purple-300';
    groupTrackerBtn = 'bg-purple-100 dark:bg-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-700 text-purple-700 dark:text-purple-200';
  } else if (flowTxtGroup === 'Assigned') {
    groupBgColor = 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/30';
    groupHeaderBorder = 'border-orange-200 dark:border-orange-900/50';
    groupTitleColor = 'text-orange-900 dark:text-orange-100';
    groupIconColor = 'text-orange-600 dark:text-orange-400';
    groupSubTitleColor = 'text-orange-700 dark:text-orange-300';
    groupTrackerBtn = 'bg-orange-100 dark:bg-orange-800/50 hover:bg-orange-200 dark:hover:bg-orange-700 text-orange-700 dark:text-orange-200';
  }

  const proStatus = planStatus || 'On process';
  let proStatusColorClass = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-white border-amber-400 font-extrabold';
  if (proStatus === 'Completed') {
    proStatusColorClass = 'bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white border-emerald-500 font-extrabold';
  } else if (proStatus === 'Upcoming') {
    proStatusColorClass = 'bg-slate-500 text-white dark:bg-slate-600 dark:text-white border-slate-400 font-extrabold';
  } else if (proStatus === 'Delay') {
    proStatusColorClass = 'bg-rose-600 text-white dark:bg-rose-600 dark:text-white border-rose-500 font-extrabold';
  }
  const actualStatus = resolveActualStatus(planStatus, linkedGroup.subTasks);

  return (
    <div className={cn("p-4 border rounded-xl shadow-sm transition-all duration-500", groupBgColor, isRunning ? "ring-2 ring-blue-500 dark:ring-blue-400 shadow-md" : "")}>
      <div className={cn("flex items-center justify-between mb-3 border-b pb-2", groupHeaderBorder)}>
        <div className="flex flex-col">
          <h4 className={cn("text-sm font-bold flex items-center gap-2", groupTitleColor)}>
            <FileText className={cn("w-4 h-4", groupIconColor)} />
            <span>{linkedGroup._taskName || linkedGroup.name || 'Delegated Sub-tasks'}</span>
            {linkedGroup._isChildTask && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-mono">
                ↳ SUB {linkedGroup._parentTaskName ? `(Cha: ${linkedGroup._parentTaskName})` : ''}
              </span>
            )}
          </h4>
          <span className={cn("text-[10px] font-mono mt-1", groupSubTitleColor)}>Task Code: {linkedGroup._taskCode}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border font-bold whitespace-nowrap shadow-2xs ${proStatusColorClass}`}>
              Pro: {proStatus}
            </span>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-bold border whitespace-nowrap shadow-2xs ${actualStatus.color}`}>
              Act: {actualStatus.label} ({computeDelegationGroupProgressPercent(linkedGroup)}%)
            </span>
          </div>
          <a
            href={`https://tracker.taka-pm.org/?search=${encodeURIComponent((linkedGroup.projectCode ? linkedGroup.projectCode + ' ' : '') + linkedGroup.name)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-bold transition-colors shrink-0", groupTrackerBtn)}
            title="Open Tracker & Search"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Tracker
          </a>
          {(currentUser.role === 'admin' || linkedGroup.createdBy === currentUser.id) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDeleteGroup(linkedGroup); }}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-bold transition-colors shrink-0 bg-red-50 text-red-500 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"
              title="Delete Delegation Group"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 mt-3">
        {linkedGroup.subTasks.map((st) => (
          <ProjectDelegationSubTaskItem
            key={st.id}
            st={st}
            linkedGroup={linkedGroup}
            currentUser={currentUser}
            appUsers={appUsers}
            project={project}
            tasks={tasks}
            projects={projects}
            picOptions={picOptions}
            onInsertTaskTag={onInsertTaskTag}
            handleDeleteSubTask={handleDeleteSubTask}
          />
        ))}
      </div>
    </div>
  );
});
ProjectDelegationGroupCard.displayName = 'ProjectDelegationGroupCard';
