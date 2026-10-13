import React, { Fragment, memo } from 'react';
import { ChevronRight, ChevronDown, Search } from 'lucide-react';
import { Project, Task, AppUser, DelegationGroup, DelegationSubTask } from '../../types';
import { ResizableHeader } from '../ResizableHeader';
import { cn, formatDisplayDateMain, getStatus } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { DelegationColWidths } from './taskDelegationTypes';
import { TaskDelegationDesktopGroupRow } from './TaskDelegationDesktopGroupRow';

interface TaskDelegationTableViewProps {
  visibleColumns: string[];
  colWidths: DelegationColWidths;
  handleResize: (col: keyof DelegationColWidths, newWidth: number) => void;
  handleToggleColumn: (colId: string) => void;
  handleToggleAllGroups: () => void;
  isAllExpanded: boolean;
  groupedDelegations: {
    orderedProjects: Array<{ project: Project; groups: DelegationGroup[] }>;
    orphans: DelegationGroup[];
  };
  expandedProjects: string[];
  toggleProject: (id: string) => void;
  expandedGroups: string[];
  toggleGroup: (id: string) => void;
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
  handleUpdateGroup: (group: DelegationGroup, updates: Partial<DelegationGroup>) => void;
  handleDeleteGroup: (group: DelegationGroup) => void;
  handleUpdateSubTask: (group: DelegationGroup, subTaskId: string, updates: Partial<DelegationSubTask>) => void;
  handleDeleteSubTask: (group: DelegationGroup, subTaskId: string) => void;
  handleTextareaInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  setMultiSearchTerm: (term: string) => void;
}

export const TaskDelegationTableView = React.memo(function TaskDelegationTableView({
  visibleColumns,
  colWidths,
  handleResize,
  handleToggleColumn,
  handleToggleAllGroups,
  isAllExpanded,
  groupedDelegations,
  expandedProjects,
  toggleProject,
  expandedGroups,
  toggleGroup,
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
  handleUpdateGroup,
  handleDeleteGroup,
  handleUpdateSubTask,
  handleDeleteSubTask,
  handleTextareaInput,
  setMultiSearchTerm,
}: TaskDelegationTableViewProps) {
  const { t } = useLanguage();

  const tableWidth = visibleColumns.reduce(
    (acc, col) => acc + (colWidths[col as keyof DelegationColWidths] || 100),
    0
  );

  return (
    <div className="hidden lg:block overflow-auto flex-grow h-0 min-h-[300px] relative scroll-smooth [-webkit-overflow-scrolling:touch]">
      <table
        className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed"
        style={{ width: `${tableWidth}px` }}
      >
        <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
          <tr>
            {visibleColumns.includes('expand') && (
              <ResizableHeader
                width={colWidths.expand}
                onResize={(w) => handleResize('expand', w)}
                className="px-4 py-3 font-bold text-center"
                hideable
                onHide={() => handleToggleColumn('expand')}
              >
                <button
                  onClick={handleToggleAllGroups}
                  className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded transition-colors text-slate-400 dark:text-[#838383] hover:text-slate-600 cursor-pointer"
                  title="Toggle all"
                >
                  {isAllExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </ResizableHeader>
            )}
            {visibleColumns.includes('taskName') && (
              <ResizableHeader
                width={colWidths.taskName}
                onResize={(w) => handleResize('taskName', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('taskName')}
              >
                <div className="flex items-center gap-2">
                  {!visibleColumns.includes('expand') && (
                    <button
                      onClick={handleToggleAllGroups}
                      className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded transition-colors text-slate-400 dark:text-[#838383] hover:text-slate-600 mr-1 cursor-pointer"
                      title="Toggle all"
                    >
                      {isAllExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  )}
                  Task / Delegation
                </div>
              </ResizableHeader>
            )}
            {visibleColumns.includes('projectCode') && (
              <ResizableHeader
                width={colWidths.projectCode}
                onResize={(w) => handleResize('projectCode', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('projectCode')}
              >
                Project Code
              </ResizableHeader>
            )}
            {visibleColumns.includes('comments') && (
              <ResizableHeader
                width={colWidths.comments}
                onResize={(w) => handleResize('comments', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('comments')}
              >
                {t('Comments')}
              </ResizableHeader>
            )}
            {visibleColumns.includes('status') && (
              <ResizableHeader
                width={colWidths.status}
                onResize={(w) => handleResize('status', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('status')}
              >
                {t('Status')}
              </ResizableHeader>
            )}
            {visibleColumns.includes('priority') && (
              <ResizableHeader
                width={colWidths.priority}
                onResize={(w) => handleResize('priority', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('priority')}
              >
                Priority
              </ResizableHeader>
            )}
            {visibleColumns.includes('party') && (
              <ResizableHeader
                width={colWidths.party}
                onResize={(w) => handleResize('party', w)}
                className="px-4 py-3 font-bold"
                hideable
                onHide={() => handleToggleColumn('party')}
              >
                PIC
              </ResizableHeader>
            )}
            {visibleColumns.includes('actions') && (
              <ResizableHeader
                width={colWidths.actions}
                onResize={(w) => handleResize('actions', w)}
                className="px-4 py-3 font-bold text-center"
                hideable
                onHide={() => handleToggleColumn('actions')}
              >
                Actions
              </ResizableHeader>
            )}
          </tr>
        </thead>
        <tbody>
          {groupedDelegations.orderedProjects.map(({ project, groups }) => {
            const projectId = project.id || String(project.no);
            const isProjectExpanded = expandedProjects.includes(projectId);

            const computedTakStart = project.computedTakStart || project.start;
            const computedTakCompl = project.computedTakCompl;
            const plStatus = getStatus(
              computedTakStart,
              computedTakCompl,
              project.computedOpening || project.opening,
              project.code
            );

            let plStatusColorClass =
              'bg-slate-50 dark:bg-[#1e1e20]/50 text-slate-600 dark:text-[#a3a3a3] border-slate-200 dark:border-[#444446]';
            if (plStatus === 'Completed') plStatusColorClass = 'bg-green-50 text-green-600 dark:text-emerald-400 border-green-200';
            else if (plStatus === 'On process' || plStatus === 'Handover')
              plStatusColorClass = 'bg-blue-50 dark:bg-[#28282a] text-blue-600 dark:text-[#8ab4f8] border-blue-200';
            else if (plStatus === 'Canceled') plStatusColorClass = 'bg-red-50 text-red-600 dark:text-red-400 border-red-200';

            return (
              <React.Fragment key={`proj-${projectId}`}>
                <tr
                  className="border-b-2 border-slate-300 dark:border-[#555558] bg-blue-50/40 dark:bg-[#28282a] hover:bg-blue-50 dark:hover:bg-[#333336]/70 transition-colors cursor-pointer"
                  onClick={() => toggleProject(projectId)}
                >
                  {visibleColumns.includes('expand') && (
                    <td className="px-4 py-3 text-center">
                      <button className="p-1 hover:bg-white dark:hover:bg-[#333336] rounded transition-colors text-slate-500 dark:text-[#a3a3a3] cursor-pointer">
                        {!isProjectExpanded ? (
                          <ChevronRight className="w-5 h-5 font-bold text-blue-600 dark:text-[#8ab4f8]" />
                        ) : (
                          <ChevronDown className="w-5 h-5 font-bold text-blue-600 dark:text-[#8ab4f8]" />
                        )}
                      </button>
                    </td>
                  )}
                  {visibleColumns.includes('taskName') && (
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-[#e3e3e3] break-words whitespace-normal text-sm">
                      <div className="flex flex-col">
                        <span>{project.name}</span>
                        <span className="text-xs text-slate-500 dark:text-[#a3a3a3] font-normal mt-0.5">
                          Start (Plan): {formatDisplayDateMain(computedTakStart)} | Finish (Plan):{' '}
                          {formatDisplayDateMain(computedTakCompl)}
                        </span>
                      </div>
                    </td>
                  )}
                  {visibleColumns.includes('projectCode') && (
                    <td className="px-4 py-3 font-mono text-blue-800 dark:text-[#8ab4f8] font-bold break-words whitespace-normal text-sm">
                      {project.store ? <span className="text-slate-500 dark:text-[#a3a3a3] mr-1">{project.store} -</span> : ''}
                      {project.code || '-'}
                    </td>
                  )}
                  {visibleColumns.includes('comments') && (
                    <td className="px-4 py-3 text-slate-500 dark:text-[#a3a3a3] italic text-xs break-words whitespace-normal">
                      Project Delegations ({groups.length})
                    </td>
                  )}
                  {visibleColumns.includes('status') && (
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[11px] font-bold px-3 py-1 rounded-full border text-center ${plStatusColorClass}`}>
                        Pl: {plStatus}
                      </span>
                    </td>
                  )}
                  {visibleColumns.includes('priority') && <td className="px-4 py-3"></td>}
                  {visibleColumns.includes('party') && <td className="px-4 py-3"></td>}
                  {visibleColumns.includes('actions') && <td className="px-4 py-3 text-center"></td>}
                </tr>
                {isProjectExpanded &&
                  groups.map((g) => (
                    <TaskDelegationDesktopGroupRow
                      key={g.id}
                      group={g}
                      isOrphan={false}
                      projects={projects}
                      tasks={tasks}
                      expandedGroups={expandedGroups}
                      toggleGroup={toggleGroup}
                      visibleColumns={visibleColumns}
                      canWrite={canWrite}
                      currentUser={currentUser}
                      focusTarget={focusTarget}
                      picOptions={picOptions}
                      uniqueParties={uniqueParties}
                      handleUpdateGroup={handleUpdateGroup}
                      handleDeleteGroup={handleDeleteGroup}
                      handleUpdateSubTask={handleUpdateSubTask}
                      handleDeleteSubTask={handleDeleteSubTask}
                      handleTextareaInput={handleTextareaInput}
                      setMultiSearchTerm={setMultiSearchTerm}
                    />
                  ))}
              </React.Fragment>
            );
          })}

          {groupedDelegations.orphans.map((g) => (
            <TaskDelegationDesktopGroupRow
              key={g.id}
              group={g}
              isOrphan={true}
              projects={projects}
              tasks={tasks}
              expandedGroups={expandedGroups}
              toggleGroup={toggleGroup}
              visibleColumns={visibleColumns}
              canWrite={canWrite}
              currentUser={currentUser}
              focusTarget={focusTarget}
              picOptions={picOptions}
              uniqueParties={uniqueParties}
              handleUpdateGroup={handleUpdateGroup}
              handleDeleteGroup={handleDeleteGroup}
              handleUpdateSubTask={handleUpdateSubTask}
              handleDeleteSubTask={handleDeleteSubTask}
              handleTextareaInput={handleTextareaInput}
              setMultiSearchTerm={setMultiSearchTerm}
            />
          ))}

          {visibleGroups.length === 0 && (
            <tr>
              <td colSpan={visibleColumns.length} className="px-4 py-12 text-center text-slate-500 dark:text-[#a3a3a3]">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-[#1e1e20] flex items-center justify-center mb-2">
                    <Search className="w-6 h-6 text-slate-400 dark:text-[#838383]" />
                  </div>
                  <p className="font-medium text-slate-700 dark:text-[#c3c3c3]">No delegated tasks yet</p>
                  <p className="text-sm">Search for a task above or create a custom delegation.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {visibleCount < visibleGroups.length && (
        <div className="flex justify-center p-6 border-t border-slate-200 dark:border-[#444446]">
          <button
            onClick={() => setVisibleCount((prev) => prev + 20)}
            className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-sm cursor-pointer"
          >
            Load More Tasks ({visibleGroups.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
});
