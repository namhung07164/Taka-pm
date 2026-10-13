import React, { Fragment, memo } from 'react';
import { ChevronRight, ChevronDown, Search, Trash2 } from 'lucide-react';
import { DelegationGroup, DelegationSubTask, AppUser, Project, Task } from '../../types';
import { cn, formatDisplayDateMain, getStatus, getTaskStatus, resolveActualStatus, parseDateTime, formatToDatetimeLocal, computeDelegationGroupProgressPercent } from '../../lib/utils';
import { resolveGroupParentProject } from './taskDelegationTypes';
import { TaskDelegationDesktopSubTaskRow } from './TaskDelegationDesktopSubTaskRow';

interface TaskDelegationDesktopGroupRowProps {
  group: DelegationGroup;
  isOrphan?: boolean;
  projects: Project[];
  tasks: Task[];
  expandedGroups: string[];
  toggleGroup: (id: string) => void;
  visibleColumns: string[];
  canWrite: boolean;
  currentUser: AppUser;
  focusTarget: { groupId: string; subTaskId?: string } | null;
  picOptions: string[];
  uniqueParties: string[];
  handleUpdateGroup: (group: DelegationGroup, updates: Partial<DelegationGroup>) => void;
  handleDeleteGroup: (group: DelegationGroup) => void;
  handleUpdateSubTask: (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => void;
  handleTextareaInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  setMultiSearchTerm: (term: string) => void;
}

export const TaskDelegationDesktopGroupRow = React.memo(function TaskDelegationDesktopGroupRow({
  group,
  isOrphan = false,
  projects,
  tasks,
  expandedGroups,
  toggleGroup,
  visibleColumns,
  canWrite,
  currentUser,
  focusTarget,
  picOptions,
  uniqueParties,
  handleUpdateGroup,
  handleDeleteGroup,
  handleUpdateSubTask,
  handleDeleteSubTask,
  handleTextareaInput,
  setMultiSearchTerm,
}: TaskDelegationDesktopGroupRowProps) {
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

  let plStatusColorClass =
    'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
  if (plStatus === 'Completed') plStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
  else if (plStatus === 'On process' || plStatus === 'Handover')
    plStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
  else if (plStatus === 'Canceled') plStatusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';

  const isLinked = !!group.parentTaskId;

  return (
    <React.Fragment key={group.id}>
      {/* Group Header Row */}
      <tr
        id={`delegation-group-${group.id}`}
        className={cn(
          'table-row-optimized border-b border-slate-200 dark:border-[#444446] hover:bg-slate-200 dark:hover:bg-[#333336]/50 transition-colors',
          isOrphan ? 'bg-slate-100/80 dark:bg-[#1e1e20]/80' : 'bg-white dark:bg-[#1e1e20]',
          plStatus === 'On process' ? 'shadow-[inset_4px_0_0_0_#3b82f6]' : ''
        )}
      >
        {visibleColumns.includes('expand') && (
          <td className={cn('px-4 py-3 text-center', !isOrphan && 'pl-8')}>
            <button
              title="Toggle Expand"
              onClick={() => toggleGroup(group.id)}
              className="p-1 hover:bg-slate-100 dark:hover:bg-[#28282a] rounded transition-colors text-slate-500 dark:text-[#a3a3a3] cursor-pointer"
            >
              {!isExpanded ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </td>
        )}
        {visibleColumns.includes('taskName') && (
          <td className="px-4 py-3 font-bold text-slate-800 dark:text-[#e3e3e3] break-words whitespace-normal">
            <div className="flex items-center gap-1">
              {!isOrphan && <span className="text-slate-400 dark:text-[#838383]">↳</span>}
              <div className="flex-grow">
                {!isLinked ? (
                  <textarea
                    defaultValue={group.name}
                    onBlur={(e) => handleUpdateGroup(group, { name: e.target.value })}
                    onInput={handleTextareaInput}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    disabled={!canWrite}
                    rows={1}
                    className="bg-[#eaffea] dark:bg-[#1a3821] border border-green-200 dark:border-[#265330] outline-none w-full focus:ring-2 focus:ring-blue-500 rounded px-2 py-1 text-slate-800 dark:text-[#e3e3e3] font-bold resize-none overflow-hidden min-h-[28px]"
                    placeholder="Custom Delegation Name"
                  />
                ) : (
                  <div className="flex flex-col">
                    <span>
                      {parentTask?.name || parentProject?.name || group.name}
                      {parentTask && parentProject?.name ? ` - ${parentProject.name}` : ''}
                    </span>
                    {(parentTask || parentProject) && (
                      <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-normal mt-0.5">
                        Start (Plan):{' '}
                        {formatDisplayDateMain(
                          parentTask?.start || parentProject?.computedTakStart || parentProject?.start
                        )}{' '}
                        | Finish (Plan):{' '}
                        {formatDisplayDateMain(parentTask?.finish || parentProject?.computedTakCompl)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </td>
        )}
        {visibleColumns.includes('projectCode') && (
          <td className="px-4 py-3 font-mono text-blue-700 dark:text-[#8ab4f8] font-bold break-words whitespace-normal">
            {group.projectStore ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{group.projectStore} -</span> : ''}
            {group.projectCode || '-'}
          </td>
        )}
        {visibleColumns.includes('comments') && (
          <td className="px-4 py-3 text-slate-500 dark:text-[#a3a3a3] italic text-xs break-words whitespace-normal">
            {group.subTasks.length} delegation task(s)
          </td>
        )}
        {visibleColumns.includes('status') && <td className="px-4 py-3"></td>}
        {visibleColumns.includes('priority') && <td className="px-4 py-3"></td>}
        {visibleColumns.includes('party') && (
          <td className="px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {Array.from(
                new Set(group.subTasks.map((st) => st.party).filter((p) => p && String(p).trim() !== ''))
              ).map((party, idx) => (
                <span
                  key={idx}
                  className="bg-blue-500 text-white px-1.5 py-0.5 rounded-[3px] text-[10px] font-bold tracking-wider inline-block max-w-[100px] truncate"
                  title={party}
                >
                  {party}
                </span>
              ))}
            </div>
          </td>
        )}
        {visibleColumns.includes('actions') && (
          <td className="px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-2">
              <div
                className={`text-[10px] leading-tight font-bold px-2 py-1 rounded-full border whitespace-nowrap ${
                  resolveActualStatus(plStatus, group.subTasks).color
                }`}
              >
                Act: {resolveActualStatus(plStatus, group.subTasks).label} ({computeDelegationGroupProgressPercent(group)}%)
              </div>
              <button
                type="button"
                onClick={() =>
                  setMultiSearchTerm((parentProject?.code ? parentProject.code + ' ' : '') + group.name)
                }
                className="text-blue-500 hover:text-blue-700 dark:text-[#8ab4f8] p-1 rounded hover:bg-blue-50 dark:hover:bg-[#333336] transition-colors cursor-pointer"
                title="Filter by Tracker"
              >
                <Search className="w-4 h-4" />
              </button>
              {canWrite && (
                <button
                  onClick={() => handleDeleteGroup(group)}
                  className="text-red-400 hover:text-red-600 dark:text-red-400 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                  title="Delete Group"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </td>
        )}
      </tr>

      {/* Sub Tasks Rows */}
      {isExpanded &&
        group.subTasks.map((st) => {
          const parsedStartObj = parseDateTime(
            parentTask?.start || parentProject?.computedTakStart || parentProject?.start
          );
          const defaultStartAct = parsedStartObj ? formatToDatetimeLocal(parsedStartObj) : '';
          const parsedFinishObj = parseDateTime(parentTask?.finish || parentProject?.computedTakCompl);
          const defaultFinishAct = parsedFinishObj ? formatToDatetimeLocal(parsedFinishObj) : '';

          return (
            <TaskDelegationDesktopSubTaskRow
              key={st.id}
              st={st}
              group={group}
              parentProject={parentProject}
              plStatus={plStatus}
              plStatusColorClass={plStatusColorClass}
              visibleColumns={visibleColumns}
              focusTarget={focusTarget}
              defaultStartAct={defaultStartAct}
              defaultFinishAct={defaultFinishAct}
              canWrite={canWrite}
              currentUser={currentUser}
              picOptions={picOptions}
              uniqueParties={uniqueParties}
              handleUpdateSubTask={handleUpdateSubTask}
              handleDeleteSubTask={handleDeleteSubTask}
              handleTextareaInput={handleTextareaInput}
              setMultiSearchTerm={setMultiSearchTerm}
            />
          );
        })}
    </React.Fragment>
  );
});
