import React, { Dispatch, SetStateAction, memo, useCallback, useEffect } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Project, Task, DelegationGroup } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { DetailMobileProjectCard } from './DetailMobileProjectCard';

interface DetailMobileViewProps {
  filteredProjects: Project[];
  expandedCodes: string[];
  setExpandedCodes: React.Dispatch<React.SetStateAction<string[]>>;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  projectInfoMap: Map<string, any>;
  getProjectInfo: (p: Project) => any;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  delegationGroupByParentKey?: Map<string, DelegationGroup>;
  initialFocusTaskId?: string;
  canWrite: boolean;
  tasks: Task[];
  projects: Project[];
  lowerSearchTerm: string;
  delegationGroups: DelegationGroup[];
  toggleGroup: (id: string) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onAddTask: (p?: Project | null) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  handleUpdateProject: (p: Project, field: string, val: any) => void;
  handleMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => void;
  handleUpdateTask: (task: Task, updates: Partial<Task>) => void;
  handleDeleteTask: (task: Task) => void;
  taskCodeMap?: Map<string, string>;
  taskActualStatusMap?: Map<string, { label: string; color: string }>;
  onSortSubTasks?: (p: Project, groupTasks: Task[]) => void;
  onNavigateToDelegation?: (groupId: string, sourceTaskId?: string) => void;
}

export const DetailMobileView = memo(function DetailMobileView({
  filteredProjects,
  expandedCodes,
  setExpandedCodes,
  visibleCount,
  setVisibleCount,
  projectInfoMap,
  getProjectInfo,
  sortConfig,
  initialFocusTaskId,
  canWrite,
  tasks = [],
  projects = [],
  lowerSearchTerm,
  delegationGroups,
  toggleGroup,
  onEditProject,
  onAddTask,
  onEditTask,
  handleUpdateProject,
  handleMoveTask,
  handleUpdateTask,
  handleDeleteTask,
  taskCodeMap,
  taskActualStatusMap,
  onSortSubTasks
}: DetailMobileViewProps) {
  const handleMobileScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const st = target.scrollTop;
    const sh = target.scrollHeight;
    const ch = target.clientHeight;

    if (sh - (st + ch) < 450) {
      if (visibleCount < filteredProjects.length) {
        setVisibleCount(prev => Math.min(prev + 25, filteredProjects.length));
      }
    }
  }, [visibleCount, filteredProjects.length, setVisibleCount]);

  useEffect(() => {
    if (!filteredProjects || filteredProjects.length === 0) return;
    const visibleSlice = filteredProjects.slice(0, visibleCount);
    const visibleIds = new Set<string>();
    for (const p of visibleSlice) {
      if (p.id) visibleIds.add(String(p.id));
      if (p.code) visibleIds.add(String(p.code));
    }
    const arr = Array.from(visibleIds).filter(Boolean);
    if (arr.length > 0) {
      useAppStore.getState().setVisibleActiveProjectIds(arr);
    }
  }, [filteredProjects, visibleCount]);

  return (
    <>
      <div className="xl:hidden flex justify-between items-center px-2 pb-2">
        <span className="text-sm font-bold text-slate-600 dark:text-[#a3a3a3]">Projects ({filteredProjects.length})</span>
        <button 
          onClick={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p => String(p.id!)) : [])} 
          className="flex items-center gap-1 text-sm text-blue-600 dark:text-[#8ab4f8] font-medium hover:text-blue-800 dark:text-[#8ab4f8] transition-colors cursor-pointer"
        >
          {expandedCodes.length === 0 ? (
            <><ChevronRight className="w-4 h-4" /> Expand All</>
          ) : (
            <><ChevronDown className="w-4 h-4" /> Collapse All</>
          )}
        </button>
      </div>

      <div 
        onScroll={handleMobileScroll}
        className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-4 pb-16 px-2 bg-slate-50/60 dark:bg-[#131314] overscroll-y-contain transition-colors"
      >
        {filteredProjects.slice(0, visibleCount).map((p) => (
          <DetailMobileProjectCard
            key={p.id || p.no}
            project={p}
            projectInfoMap={projectInfoMap}
            getProjectInfo={getProjectInfo}
            sortConfig={sortConfig}
            expandedCodes={expandedCodes}
            delegationGroups={delegationGroups}
            lowerSearchTerm={lowerSearchTerm}
            canWrite={canWrite}
            tasks={tasks}
            projects={projects}
            toggleGroup={toggleGroup}
            onEditProject={onEditProject}
            onAddTask={onAddTask}
            onEditTask={onEditTask}
            handleUpdateProject={handleUpdateProject}
            handleMoveTask={handleMoveTask}
            handleUpdateTask={handleUpdateTask}
            handleDeleteTask={handleDeleteTask}
            taskCodeMap={taskCodeMap}
            taskActualStatusMap={taskActualStatusMap}
            onSortSubTasks={onSortSubTasks}
            initialFocusTaskId={initialFocusTaskId}
          />
        ))}
        {visibleCount < filteredProjects.length && (
          <div className="py-6 flex justify-center w-full">
            <button 
              onClick={() => setVisibleCount(prev => Math.min(prev + 25, filteredProjects.length))}
              className="px-6 py-2.5 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-full text-sm font-bold text-blue-600 dark:text-[#8ab4f8] shadow-sm hover:shadow hover:border-blue-300 dark:hover:border-blue-500 transition-all active:scale-95 cursor-pointer touch-manipulation"
            >
              Load More Projects ({filteredProjects.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
});
