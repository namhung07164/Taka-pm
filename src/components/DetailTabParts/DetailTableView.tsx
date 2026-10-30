import React, { Dispatch, SetStateAction, memo, useEffect, useMemo, useRef } from 'react';
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
  expandedModularTasks?: Set<string>;
  onToggleModularParent?: (parentTaskId: string) => void;
  onToggleProjectModularTasks?: (parentTaskIds: string[], expand: boolean) => void;
  isAllModularExpanded?: boolean;
  onToggleExpandAllModular?: () => void;
  totalChildTasksCount?: number;
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
  expandedModularTasks,
  onToggleModularParent,
  onToggleProjectModularTasks,
  isAllModularExpanded,
  onToggleExpandAllModular,
  totalChildTasksCount,
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
  const isDraggingActive = draggingTaskIds.length > 0;
  const dragPointerYRef = useRef<number | null>(null);
  // Smooth 60fps upward & downward auto-scroll when dragging tasks near top sticky header or bottom edge
  useEffect(() => {
    if (!isDraggingActive) {
      dragPointerYRef.current = null;
      return;
    }

    let rafId: number | null = null;

    const handleWindowDragOver = (e: DragEvent) => {
      dragPointerYRef.current = e.clientY;
      const container = tableContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      // Allow drop effect even when hovering over sticky thead, project header, or near table boundaries
      if (
        e.clientX >= rect.left - 60 &&
        e.clientX <= rect.right + 60 &&
        e.clientY >= rect.top - 200 &&
        e.clientY <= rect.bottom + 200
      ) {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'move';
        }
      }
    };

    const autoScrollStep = () => {
      const container = tableContainerRef.current;
      const clientY = dragPointerYRef.current;
      if (container && clientY !== null) {
        const rect = container.getBoundingClientRect();
        // Generous 80px scroll zone at top and bottom of table
        const topEdge = rect.top + 80;
        const bottomEdge = rect.bottom - 80;

        if (clientY < topEdge && container.scrollTop > 0) {
          const dist = Math.max(1, topEdge - clientY);
          const intensity = Math.min(1, dist / 100);
          const delta = Math.round(4 + intensity * 24);
          container.scrollTop = Math.max(0, container.scrollTop - delta);
        } else if (
          clientY > bottomEdge &&
          container.scrollTop < container.scrollHeight - container.clientHeight
        ) {
          const dist = Math.max(1, clientY - bottomEdge);
          const intensity = Math.min(1, dist / 100);
          const delta = Math.round(4 + intensity * 24);
          container.scrollTop = Math.min(
            container.scrollHeight - container.clientHeight,
            container.scrollTop + delta
          );
        }
      }
      rafId = requestAnimationFrame(autoScrollStep);
    };

    window.addEventListener('dragover', handleWindowDragOver, { capture: true });
    rafId = requestAnimationFrame(autoScrollStep);

    return () => {
      window.removeEventListener('dragover', handleWindowDragOver, { capture: true });
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isDraggingActive, tableContainerRef]);

  // Stable virtual slice to eliminate scroll jumps during active drag
  const effectiveStartIndex = startIndex;
  const effectiveEndIndex = endIndex;
  const effectivePaddingTop = paddingTop;
  const effectivePaddingBottom = paddingBottom;

  return (
    <div className="hidden xl:block flex-grow pb-16">
      <div 
        ref={tableContainerRef}
        onScroll={handleTableScroll}
        onDragOver={isDraggingActive ? (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        } : undefined}
        onDrop={isDraggingActive ? (e) => {
          if (dragOverTaskId) {
            const targetRow = flatTableRows.find(r => r.type === 'task' && r.task.id === dragOverTaskId);
            if (targetRow && targetRow.type === 'task') {
              handleDetailTaskDrop(e, targetRow.task, targetRow.project);
            }
          }
        } : undefined}
        className="overflow-auto [overflow-anchor:none] border border-slate-200 dark:border-[#444446] rounded-xl shadow-xs bg-white dark:bg-[#1e1e20]"
        style={{ height: "calc(100vh - 210px)", minHeight: "520px", overflowAnchor: "none" }}
      >
        <table 
          className="text-sm text-left text-slate-600 dark:text-[#a3a3a3] table-fixed min-w-full [overflow-anchor:none]"
          style={{ width: `${totalTableWidth}px`, overflowAnchor: "none" }}
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
            onToggleExpandAllModular={onToggleExpandAllModular}
            isAllModularExpanded={isAllModularExpanded}
            totalChildTasksCount={totalChildTasksCount}
          />
          <tbody>
            {effectivePaddingTop > 0 && (
              <tr style={{ height: `${effectivePaddingTop}px`, overflowAnchor: 'none' }} className="[overflow-anchor:none] pointer-events-none select-none">
                <td colSpan={effectiveVisibleColumns.length} style={{ padding: 0, border: 'none', height: `${effectivePaddingTop}px` }} />
              </tr>
            )}
            {flatTableRows.slice(effectiveStartIndex, effectiveEndIndex).map((item) => {
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
                    expandedModularTasks={expandedModularTasks}
                    onToggleModularParent={onToggleModularParent}
                    onToggleProjectModularTasks={onToggleProjectModularTasks}
                  />
                );
              }
              const t = item.task;
              const actStatus = taskActualStatusMap.get(t.id) || { label: 'Pending', color: 'bg-slate-50 text-slate-600' };
              const childCount = childTasksCountMap?.get(String(t.id)) || childTasksCountMap?.get(t.id) || 0;
              const isModularExpanded = expandedModularTasks
                ? (expandedModularTasks.has(String(t.id)) ||
                   expandedModularTasks.has(String(t.id).toLowerCase()) ||
                   (!!t.taskCodePhu && (expandedModularTasks.has(t.taskCodePhu) || expandedModularTasks.has(t.taskCodePhu.trim().toLowerCase()))))
                : false;
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
                  isModularExpanded={isModularExpanded}
                  onToggleModularParent={onToggleModularParent}
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
            {effectivePaddingBottom > 0 && (
              <tr style={{ height: `${effectivePaddingBottom}px`, overflowAnchor: 'none' }} className="[overflow-anchor:none] pointer-events-none select-none">
                <td colSpan={effectiveVisibleColumns.length} style={{ padding: 0, border: 'none', height: `${effectivePaddingBottom}px` }} />
              </tr>
            )}
            {visibleCount < filteredProjects.length && (
              <tr className="print:hidden hide-on-actual-print">
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
