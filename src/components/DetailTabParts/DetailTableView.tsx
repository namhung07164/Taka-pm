import React from 'react';
import { Project, Task } from '../../types';
import { DetailTableRow } from './detailTabTypes';
import { DetailTableHeader } from './DetailTableHeader';
import { DetailProjectRow } from './DetailProjectRow';
import { DetailTaskRow } from './DetailTaskRow';

interface DetailTableViewProps {
  tableContainerRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  columnsWithWidths: Array<{ id: string; label: string; width?: number }>;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  canWrite: boolean;
  selectedTaskIds: Set<string>;
  allVisibleTaskIds: string[];
  onSelectAllVisibleTasks: (select: boolean) => void;
  handleColumnResize: (colId: string, width: number) => void;
  handleResetColumnWidth: (colId: string) => void;
  effectiveVisibleColumns: string[];
  paddingTop: number;
  paddingBottom: number;
  flatTableRows: DetailTableRow[];
  startIndex: number;
  endIndex: number;
  allowedStoreOptions: Array<{ label: string; value: string }>;
  allowedLocationOptions: string[];
  toggleGroup: (id: string | number) => void;
  handleSelectAllTasksInProject: (groupTasks: Task[], select: boolean) => void;
  handleUpdateProject: (p: Project, field: keyof Project, value: any) => Promise<void>;
  handleSortSubTasks: (p: Project, groupTasks: Task[]) => Promise<void>;
  onEditProject?: (p: Project, isReadOnly?: boolean, initialTab?: string) => void;
  onAddTask: (p?: Project | null) => void;
  handleDeleteProject: (p: Project) => Promise<void>;
  draggingTaskIds: string[];
  dragOverTaskId: string | null;
  dropPosition: 'before' | 'after' | null;
  draggingTaskNames: string;
  taskCodeMap: Map<string, string>;
  initialFocusTaskId?: string;
  taskActualStatusMap: Map<string, { label: string; color: string }>;
  tasks: Task[];
  projects: Project[];
  handleToggleSelectTask: (taskId: string, shiftKey: boolean) => void;
  onEditTask: (t: Task, isReadOnly?: boolean, initialTab?: string) => void;
  handleUpdateTask: (t: Task, updates: Partial<Task>) => Promise<void>;
  handleMoveTask: (p: Project, groupTasks: Task[], index: number, direction: 'up' | 'down') => Promise<void>;
  handleDeleteTask: (t: Task) => Promise<void>;
  handleDetailTaskDragStart: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragOver: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragLeave: (e: React.DragEvent, taskId: string) => void;
  handleDetailTaskDragEnd: (e: React.DragEvent) => void;
  handleDetailTaskDrop: (e: React.DragEvent, targetTask: Task, targetProject: Project) => Promise<void>;
  visibleCount: number;
  totalFilteredProjectsCount: number;
  onLoadMore: () => void;
}

export const DetailTableView: React.FC<DetailTableViewProps> = React.memo(function DetailTableView({
  tableContainerRef,
  handleScroll,
  columnsWithWidths,
  sortConfig,
  onSort,
  canWrite,
  selectedTaskIds,
  allVisibleTaskIds,
  onSelectAllVisibleTasks,
  handleColumnResize,
  handleResetColumnWidth,
  effectiveVisibleColumns,
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
  draggingTaskIds,
  dragOverTaskId,
  dropPosition,
  draggingTaskNames,
  taskCodeMap,
  initialFocusTaskId,
  taskActualStatusMap,
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
  totalFilteredProjectsCount,
  onLoadMore,
}) {
  return (
    <div className="hidden lg:block relative flex-grow overflow-hidden">
      <div 
        ref={tableContainerRef as any}
        onScroll={handleScroll}
        className="w-full h-full overflow-auto"
      >
        <table className="w-full border-collapse text-xs table-fixed">
          <DetailTableHeader
            columnsWithWidths={columnsWithWidths}
            sortConfig={sortConfig}
            onSort={onSort}
            canWrite={canWrite}
            selectedTaskIds={selectedTaskIds}
            allVisibleTaskIds={allVisibleTaskIds}
            onSelectAllVisibleTasks={onSelectAllVisibleTasks}
            onResize={handleColumnResize}
            onResetWidth={handleResetColumnWidth}
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
                    onEditProject={onEditProject}
                    onAddTask={onAddTask}
                    onDeleteProject={handleDeleteProject}
                  />
                );
              }

              const t = item.task;
              const actStatus = taskActualStatusMap.get(t.id) || { label: 'Pending', color: 'bg-slate-50 text-slate-600' };

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
                  tasks={tasks}
                  projects={projects}
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
            {visibleCount < totalFilteredProjectsCount && (
              <tr>
                <td colSpan={effectiveVisibleColumns.length} className="py-4 text-center bg-white/90 dark:bg-[#1e1e20]/90 backdrop-blur-sm border-t border-slate-200 dark:border-[#444446]">
                  <button
                    onClick={onLoadMore}
                    className="px-6 py-2 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-xs transition-colors text-sm cursor-pointer active:scale-95 touch-manipulation"
                  >
                    Load More Projects ({totalFilteredProjectsCount - visibleCount} remaining)
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
