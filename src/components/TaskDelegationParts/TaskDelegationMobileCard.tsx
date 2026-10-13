import React, { memo } from 'react';
import { ChevronRight, ChevronDown, Search, Trash2 } from 'lucide-react';
import { DelegationGroup, DelegationSubTask, AppUser, Project, Task } from '../../types';
import { formatDisplayDateMain, getStatus, getTaskStatus, resolveActualStatus, computeDelegationGroupProgressPercent } from '../../lib/utils';
import { resolveGroupParentProject } from './taskDelegationTypes';
import { TaskDelegationMobileSubTaskItem } from './TaskDelegationMobileSubTaskItem';

interface TaskDelegationMobileCardProps {
  group: DelegationGroup;
  projects: Project[];
  tasks: Task[];
  expandedGroups: string[];
  toggleGroup: (id: string) => void;
  canWrite: boolean;
  currentUser: AppUser;
  focusTarget: { groupId: string; subTaskId?: string } | null;
  picOptions: string[];
  uniqueParties: string[];
  handleDeleteGroup: (group: DelegationGroup) => void;
  handleUpdateSubTask: (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => void;
  setMultiSearchTerm: (term: string) => void;
}

export const TaskDelegationMobileCard = React.memo(function TaskDelegationMobileCard({
  group,
  projects,
  tasks,
  expandedGroups,
  toggleGroup,
  canWrite,
  currentUser,
  focusTarget,
  picOptions,
  uniqueParties,
  handleDeleteGroup,
  handleUpdateSubTask,
  handleDeleteSubTask,
  setMultiSearchTerm,
}: TaskDelegationMobileCardProps) {
  const isExpanded = expandedGroups.includes(group.id);
  const parentTask = group.parentTaskId ? tasks.find((t) => t.id === group.parentTaskId) : null;
  const parentProject = resolveGroupParentProject(group, projects, tasks);

  let plStatus = 'Upcoming';
  if (parentTask) {
    plStatus = getTaskStatus(parentTask.start, parentTask.finish);
  } else if (parentProject) {
    const computedTakStart = parentProject.computedTakStart || parentProject.start;
    const computedTakCompl = parentProject.computedTakCompl;
    plStatus = getStatus(
      computedTakStart,
      computedTakCompl,
      parentProject.computedOpening || parentProject.opening,
      parentProject.code
    );
  }

  const plStatusColorClass =
    plStatus === 'Completed'
      ? 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200'
      : plStatus === 'On process' || plStatus === 'Handover'
      ? 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200'
      : plStatus === 'Canceled'
      ? 'bg-red-50 text-red-600 dark:text-red-400 border-red-200'
      : 'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';

  const isLinked = !!group.parentTaskId;

  return (
    <div
      id={`delegation-group-mobile-${group.id}`}
      key={group.id}
      className="mobile-card-optimized bg-white dark:bg-[#1e1e20] rounded-xl shadow-sm border border-slate-200 dark:border-[#444446] flex flex-col"
    >
      <div
        className="p-3 bg-slate-100 dark:bg-[#1e1e20]/50 border-b border-slate-100 dark:border-[#333336] flex items-start justify-between cursor-pointer"
        onClick={() => toggleGroup(group.id)}
      >
        <div className="flex flex-col gap-1 pr-2 flex-1">
          <div className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm leading-snug">
            {!isLinked
              ? group.name
              : parentTask
              ? `${parentTask.name}${parentProject?.name ? ` - ${parentProject.name}` : ''}`
              : parentProject?.name || group.name}
          </div>
          {isLinked && (
            <div className="text-xs text-blue-600 dark:text-[#8ab4f8] font-mono font-medium">
              {group.projectStore ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{group.projectStore} -</span> : ''}
              {group.projectCode || '-'}
              {parentProject?.name ? (
                <span className="text-slate-500 dark:text-[#a3a3a3] font-sans font-normal ml-1 text-[11px]">
                  - {parentProject.name}
                </span>
              ) : (
                ''
              )}
            </div>
          )}
          {isLinked && (parentTask || parentProject) && (
            <div className="text-[10px] text-slate-500 dark:text-[#a3a3a3] font-medium mt-1">
              P:{' '}
              {formatDisplayDateMain(parentTask?.start || parentProject?.computedTakStart || parentProject?.start)} -{' '}
              {formatDisplayDateMain(parentTask?.finish || parentProject?.computedTakCompl)}
            </div>
          )}
          <div className="flex gap-2 max-w-full flex-wrap">
            <span className={`mt-1.5 text-[10px] px-2 py-0.5 rounded flex font-bold border break-words leading-tight text-center items-center justify-center ${plStatusColorClass}`}>
              Pl: {plStatus}
            </span>
            <span className={`mt-1.5 text-[10px] px-2 py-0.5 rounded flex font-bold border break-words leading-tight text-center items-center justify-center ${resolveActualStatus(plStatus, group.subTasks).color}`}>
              Act: {resolveActualStatus(plStatus, group.subTasks).label} ({computeDelegationGroupProgressPercent(group)}%)
            </span>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {[...new Set(group.subTasks.map((st) => st.party).filter((p) => p && String(p).trim() !== ''))].map(
              (p) => (
                <span
                  key={String(p)}
                  className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[9.5px] tracking-wider flex-shrink-0 font-bold max-w-[80px] truncate"
                  title={String(p)}
                >
                  {String(p)}
                </span>
              )
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="p-1.5 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded shadow-sm text-slate-500 dark:text-[#a3a3a3] flex shrink-0 items-center justify-center">
            {!isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
          <div className="flex items-center gap-1 mt-2">
            <div
              className={`text-[10px] leading-tight font-bold px-1.5 py-1 rounded-full border whitespace-nowrap ${
                resolveActualStatus(plStatus, group.subTasks).color
              } shrink-0`}
            >
              Act: {resolveActualStatus(plStatus, group.subTasks).label} ({computeDelegationGroupProgressPercent(group)}%)
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + group.name);
              }}
              className="p-1.5 rounded bg-blue-50 dark:bg-[#28282a] text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] hover:bg-blue-100 dark:hover:bg-[#444446] transition-colors cursor-pointer"
              title="Filter by Tracker"
            >
              <Search className="w-4 h-4" />
            </button>
            {canWrite && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteGroup(group);
                }}
                className="p-1.5 rounded bg-red-50 text-red-500 hover:bg-red-100 transition-colors cursor-pointer"
                title="Delete Group"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="flex flex-col bg-slate-50 dark:bg-[#1e1e20]/50 p-2 gap-3 border-t border-slate-200 dark:border-[#444446]">
          {group.subTasks.length === 0 && (
            <div className="py-4 text-center text-slate-400 dark:text-[#838383] text-xs italic">
              No delegation tasks.
            </div>
          )}
          {group.subTasks.map((st) => (
            <TaskDelegationMobileSubTaskItem
              key={st.id}
              st={st}
              group={group}
              parentTask={parentTask}
              parentProject={parentProject}
              plStatus={plStatus}
              canWrite={canWrite}
              currentUser={currentUser}
              focusTarget={focusTarget}
              picOptions={picOptions}
              uniqueParties={uniqueParties}
              handleUpdateSubTask={handleUpdateSubTask}
              handleDeleteSubTask={handleDeleteSubTask}
              setMultiSearchTerm={setMultiSearchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
});
