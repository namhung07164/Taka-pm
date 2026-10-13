import React, { Dispatch, SetStateAction, memo } from 'react';
import { Project, Task } from '../../types';
import { DetailTableRow, SortConfig } from './detailTypes';
import { DetailTableHeader } from './DetailTableHeader';
import { DetailProjectRow } from './DetailProjectRow';
import { DetailTaskRow } from './DetailTaskRow';

export interface DetailTableViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  handleTableScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  totalTableWidth: number;
  effectiveVisibleColumns: string[];
  colWidths: Record<string, number>;
  canWrite: boolean;
  selectedTaskIds: Set<string>;
  allVisibleTaskIds: string[];
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  filteredProjects: Project[];
  availableColumnsForUser: { id: string; label: string }[];
  sortConfig: SortConfig | null;
  onResize: (col: string, newWidth: number) => void;
  onToggleColumn: (colId: string) => void;
  onSort: (key: string) => void;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  paddingTop: number;
  paddingBottom: number;
  flatTableRows: DetailTableRow[];
  startIndex: number;
  endIndex: number;
  allowedStoreOptions: { label: string; value: string }[];
  allowedLocationOptions: string[];
  toggleGroup: (id: string) => void;
  handleSelectAllTasksInProject: (groupTasks: Task[], isSelected: boolean) => void;
  handleUpdateProject: (p: Project, field: keyof Project, val: any) => Promise<void>;
  handleSortSubTasks: (p: Project, groupTasks: Task[]) => void;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onAddTask: (p?: Project | null) => void;
  handleDeleteProject: (p: Project) => Promise<void>;
  taskActualStatusMap: Map<string, { label: string; color: string }>;
  taskCodeMap: Map<string, string>;
  childTasksCountMap?: Map<string, number>;
  draggingTaskIds: string[];
  dragOverTaskId: string | null;
  dropPosition: 'before' | 'after' | null;
  draggingTaskNames: string;
  initialFocusTaskId?: string;
  tasks: Task[];
  projects: Project[];
  handleToggleSelectTask: (taskId: string, shiftKey: boolean) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  handleUpdateTask: (t: Task, updates: Partial<Task>, options?: { skipPredecessorRecalc?: boolean; skipProjectRollup?: boolean }) => Promise<void>;
  handleMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => Promise<void>;
  handleDeleteTask: (t: Task) => Promise<void>;
  handleDetailTaskDragStart: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragOver: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragLeave: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragEnd: (e: React.DragEvent) => void;
  handleDetailTaskDrop: (e: React.DragEvent, targetTask: Task, targetProject: Project) => Promise<void>;
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
}

export const DetailTableView = memo(function DetailTableView({
  tableContainerRef,
  handleTableScroll,
  totalTableWidth,
  effectiveVisibleColumns,
  colWidths,
  canWrite,
  selectedTaskIds,
  allVisibleTaskIds,
  expandedCodes,
  setExpandedCodes,
  filteredProjects,
  availableColumnsForUser,
  sortConfig,
  onResize,
  onToggleColumn,
  onSort,
  setSelectedTaskIds,
  paddingTop,
  paddingBottom,
  flatTableRows,
  startIndex,
  endIndex,
  allowedStoreOptions,
  allowedLocationOptions,
  toggleGroup,
  handleSelectAllTasksInProject,
  handleUpdateProject,
  handleSortSubTasks,
  onEditProject,
  onAddTask,
  handleDeleteProject,
  taskActualStatusMap,
  taskCodeMap,
  childTasksCountMap,
  draggingTaskIds,
  dragOverTaskId,
  dropPosition,
  draggingTaskNames,
  initialFocusTaskId,
  tasks,
  projects,
  handleToggleSelectTask,
  onEditTask,
  handleUpdateTask,
  handleMoveTask,
  handleDeleteTask,
  handleDetailTaskDragStart,
  handleDetailTaskDragOver,
  handleDetailTaskDragLeave,
  handleDetailTaskDragEnd,
  handleDetailTaskDrop,
  visibleCount,
  setVisibleCount
}: DetailTableViewProps) {
  return (
    <div className="hidden xl:block flex-grow pb-16">
      <div 
        ref={tableContainerRef}
        onScroll={handleTableScroll}
        className="overflow-auto border border-slate-200 dark:border-[#444446] rounded-xl shadow-xs bg-white dark:bg-[#1e1e20]"
        style={{ height: "calc(100vh - 210px)", minHeight: "520px" }}
      >
        <table 
          className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full"
          style={{ width: `${totalTableWidth}px` }}
        >
          <DetailTableHeader
            visibleColumns={effectiveVisibleColumns}
            colWidths={colWidths}
            canWrite={canWrite}
            selectedTaskIds={selectedTaskIds}
            allVisibleTaskIds={allVisibleTaskIds}
            expandedCodes={expandedCodes}
            filteredProjects={filteredProjects}
            availableColumnsForUser={availableColumnsForUser}
            sortConfig={sortConfig}
            onResize={onResize}
            onToggleColumn={onToggleColumn}
            onSort={onSort}
            onSelectAllChange={(checked) => {
              if (checked) {
                setSelectedTaskIds(new Set(allVisibleTaskIds));
              } else {
                setSelectedTaskIds(new Set());
              }
            }}
            onToggleExpandAll={() => setExpandedCodes(expandedCodes.length === 0 ? filteredProjects.map(p => String(p.id!)) : [])}
          />
          <tbody>
            {paddingTop > 0 && (
              <tr style={{ height: `${paddingTop}px` }}>
                <td colSpan={effectiveVisibleColumns.length} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
            {flatTableRows.slice(startIndex, endIndex).map((item) => {
              if (item.type === "project") {
                const groupTasks = item.groupTasks;
                const isAllTasksSelected = groupTasks.length > 0 && groupTasks.every(t => selectedTaskIds.has(t.id));
                return (
                  <DetailProjectRow
                    key={item.key}
                    item={item}
                    visibleColumns={effectiveVisibleColumns}
                    canWrite={canWrite}
                    isAllTasksSelected={isAllTasksSelected}
                    allowedStoreOptions={allowedStoreOptions}
                    allowedLocationOptions={allowedLocationOptions}
                    onToggleGroup={toggleGroup}
                    onSelectAllTasksInProject={handleSelectAllTasksInProject}
                    onUpdateProject={handleUpdateProject}
                    onSortSubTasks={handleSortSubTasks}
                    onEditProject={onEditProject || (() => {})}
                    onAddTask={onAddTask}
                    onDeleteProject={handleDeleteProject}
                  />
                );
              }
              const t = item.task;
              const actStatus = taskActualStatusMap.get(t.id) || { label: 'Pending', color: 'bg-slate-50 text-slate-600' };
              const childCount = (childTasksCountMap?.get(t.id) || 0) + (t.taskCodePhu && t.taskCodePhu !== t.id ? (childTasksCountMap?.get(t.taskCodePhu) || 0) : 0);
              return (
                <DetailTaskRow
                  key={item.key}
                  item={item}
                  visibleColumns={effectiveVisibleColumns}
                  canWrite={canWrite}
                  isSelected={selectedTaskIds.has(t.id)}
                  isDragging={draggingTaskIds.includes(t.id)}
                  isDragOver={dragOverTaskId === t.id}
                  dropPosition={dragOverTaskId === t.id ? dropPosition : null}
                  draggingTaskNames={draggingTaskNames}
                  taskCode={taskCodeMap.get(t.id) || ''}
                  isFocused={initialFocusTaskId === t.id}
                  delStatusText={actStatus.label}
                  delStatusColorClass={actStatus.color}
                  childTasksCount={childCount}
                  onToggleSelectTask={handleToggleSelectTask}
                  onEditTask={onEditTask}
                  onUpdateTask={handleUpdateTask}
                  onMoveTask={handleMoveTask}
                  onDeleteTask={handleDeleteTask}
                  onDragStart={handleDetailTaskDragStart}
                  onDragOver={handleDetailTaskDragOver}
                  onDragLeave={handleDetailTaskDragLeave}
                  onDragEnd={handleDetailTaskDragEnd}
                  onDrop={handleDetailTaskDrop}
                />
              );
            })}
            {paddingBottom > 0 && (
              <tr style={{ height: `${paddingBottom}px` }}>
                <td colSpan={effectiveVisibleColumns.length} style={{ padding: 0, border: 'none' }} />
              </tr>
            )}
            {visibleCount < filteredProjects.length && (
              <tr>
                <td colSpan={effectiveVisibleColumns.length} className="py-4 text-center bg-white/90 dark:bg-[#1e1e20]/90 backdrop-blur-sm border-t border-slate-200 dark:border-[#444446]">
                  <button
                    onClick={() => setVisibleCount(prev => Math.min(prev + 30, filteredProjects.length))}
                    className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-xs transition-colors text-sm cursor-pointer active:scale-95 touch-manipulation"
                  >
                    Load More Projects ({filteredProjects.length - visibleCount} remaining)
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
