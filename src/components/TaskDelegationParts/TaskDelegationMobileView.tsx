import React, { memo } from 'react';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup, DelegationSubTask } from '../../types';
import { TaskDelegationMobileCard } from './TaskDelegationMobileCard';

interface TaskDelegationMobileViewProps {
  groupedDelegations: {
    orderedProjects: Array<{ project: Project; groups: DelegationGroup[] }>;
    orphans: DelegationGroup[];
  };
  expandedProjects: string[];
  toggleProject: (id: string) => void;
  expandedGroups: string[];
  toggleGroup: (id: string) => void;
  handleToggleAllGroups: () => void;
  isAllExpanded: boolean;
  visibleGroups: DelegationGroup[];
  visibleCount: number;
  setVisibleCount: (fn: (prev: number) => number) => void;
  projects: Project[];
  tasks: Task[];
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

export const TaskDelegationMobileView = React.memo(function TaskDelegationMobileView({
  groupedDelegations,
  expandedProjects,
  toggleProject,
  expandedGroups,
  toggleGroup,
  handleToggleAllGroups,
  isAllExpanded,
  visibleGroups,
  visibleCount,
  setVisibleCount,
  projects,
  tasks,
  canWrite,
  currentUser,
  focusTarget,
  picOptions,
  uniqueParties,
  handleDeleteGroup,
  handleUpdateSubTask,
  handleDeleteSubTask,
  setMultiSearchTerm,
}: TaskDelegationMobileViewProps) {
  return (
    <div className="lg:hidden flex flex-col flex-grow overflow-y-auto bg-slate-50 dark:bg-[#1e1e20]/50 p-3 md:p-6 [-webkit-overflow-scrolling:touch]">
      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 md:gap-6">
        {visibleGroups.length > 0 && (
          <div className="flex justify-end">
            <button
              onClick={handleToggleAllGroups}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-[#a3a3a3] hover:text-slate-700 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] shadow-sm px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Toggle all"
            >
              {isAllExpanded ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronRight className="w-3.5 h-3.5" />
                  Expand All
                </>
              )}
            </button>
          </div>
        )}
        {visibleGroups.length === 0 ? (
          <div className="py-12 text-center text-slate-500 dark:text-[#a3a3a3] flex flex-col items-center justify-center gap-2">
            <div className="w-12 h-12 rounded-full bg-white dark:bg-[#1e1e20] flex items-center justify-center mb-2 shadow-sm">
              <Search className="w-6 h-6 text-slate-400 dark:text-[#838383]" />
            </div>
            <p className="font-medium text-slate-700 dark:text-[#c3c3c3]">No delegated tasks yet</p>
            <p className="text-xs">Search above or add a custom delegation.</p>
          </div>
        ) : (
          <>
            {groupedDelegations.orderedProjects.map(({ project, groups }) => {
              const projectId = project.id || String(project.no);
              const isProjectExpanded = expandedProjects.includes(projectId);
              return (
                <div key={`proj-${projectId}`} className="flex flex-col gap-3">
                  <div
                    onClick={() => toggleProject(projectId)}
                    className="bg-blue-50 dark:bg-[#28282a]/70 border border-blue-200 p-3 rounded-xl shadow-sm flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex flex-col gap-1 pr-4">
                      <span className="font-bold text-slate-800 dark:text-[#e3e3e3] text-sm leading-snug">
                        {project.name}
                      </span>
                      <span className="text-xs text-blue-700 dark:text-[#8ab4f8] font-mono">
                        {project.store ? `${project.store} - ` : ''}
                        {project.code || '-'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-[#a3a3a3] mt-1 font-medium">
                        {groups.length} sub task(s)
                      </span>
                    </div>
                    <div className="p-1 bg-white dark:bg-[#1e1e20] rounded text-blue-600 dark:text-[#8ab4f8] shadow-sm border border-blue-100 flex-shrink-0">
                      {isProjectExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </div>
                  </div>
                  {isProjectExpanded && (
                    <div className="flex flex-col gap-3 md:pl-4 border-l-[3px] border-blue-100/50 ml-1.5 pl-2 mt-1">
                      {groups.map((group) => (
                        <TaskDelegationMobileCard
                          key={group.id}
                          group={group}
                          projects={projects}
                          tasks={tasks}
                          expandedGroups={expandedGroups}
                          toggleGroup={toggleGroup}
                          canWrite={canWrite}
                          currentUser={currentUser}
                          focusTarget={focusTarget}
                          picOptions={picOptions}
                          uniqueParties={uniqueParties}
                          handleDeleteGroup={handleDeleteGroup}
                          handleUpdateSubTask={handleUpdateSubTask}
                          handleDeleteSubTask={handleDeleteSubTask}
                          setMultiSearchTerm={setMultiSearchTerm}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {groupedDelegations.orphans.length > 0 && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-[#444446]">
                <div className="text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase tracking-wider mb-2">
                  Other Tasks ({groupedDelegations.orphans.length})
                </div>
                {groupedDelegations.orphans.map((group) => (
                  <TaskDelegationMobileCard
                    key={group.id}
                    group={group}
                    projects={projects}
                    tasks={tasks}
                    expandedGroups={expandedGroups}
                    toggleGroup={toggleGroup}
                    canWrite={canWrite}
                    currentUser={currentUser}
                    focusTarget={focusTarget}
                    picOptions={picOptions}
                    uniqueParties={uniqueParties}
                    handleDeleteGroup={handleDeleteGroup}
                    handleUpdateSubTask={handleUpdateSubTask}
                    handleDeleteSubTask={handleDeleteSubTask}
                    setMultiSearchTerm={setMultiSearchTerm}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {visibleCount < visibleGroups.length && (
        <div className="flex justify-center mt-4 mb-6">
          <button
            onClick={() => setVisibleCount((prev) => prev + 20)}
            className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm cursor-pointer"
          >
            Load More ({visibleGroups.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
});
