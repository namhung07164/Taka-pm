import React, { memo, useMemo } from 'react';
import { Project, Task } from '../../types';
import { cn, formatDisplayDateTime, calculateDays } from '../../lib/utils';
import { ChevronRight, ChevronDown, Plus, Trash2, Edit3, ArrowDownUp, GripVertical } from 'lucide-react';
import { DetailTableRow } from './detailTypes';
import { EditableCell } from './EditableCell';
import { FastToggle } from './FastToggle';
import { QuickNavButton } from '../QuickNavButton';
import { useIsRowFlashed } from '../../lib/changeFlashService';

interface DetailProjectRowProps {
  item: DetailTableRow & { type: 'project' };
  visibleColumns: string[];
  canWrite: boolean;
  isAllTasksSelected: boolean;
  allowedStoreOptions: { label: string; value: string }[];
  allowedLocationOptions: string[];
  onToggleGroup: (id: string) => void;
  onSelectAllTasksInProject: (groupTasks: Task[], select: boolean) => void;
  onUpdateProject: (p: Project, field: keyof Project, value: any) => Promise<void>;
  onSortSubTasks: (p: Project, groupTasks: Task[]) => void;
  onEditProject: (p: Project) => void;
  onAddTask: (p: Project) => void;
  onDeleteProject: (p: Project) => void;
  expandedModularTasks?: Set<string>;
  onToggleModularParent?: (parentTaskId: string) => void;
  onToggleProjectModularTasks?: (parentTaskIds: string[], expand: boolean) => void;
}

export const DetailProjectRow = React.memo(function DetailProjectRow({
  item,
  visibleColumns,
  canWrite,
  isAllTasksSelected,
  allowedStoreOptions,
  allowedLocationOptions,
  onToggleGroup,
  onSelectAllTasksInProject,
  onUpdateProject,
  onSortSubTasks,
  onEditProject,
  onAddTask,
  onDeleteProject,
  expandedModularTasks,
  onToggleModularParent,
  onToggleProjectModularTasks,
}: DetailProjectRowProps) {
  const p = item.project;
  const isExpanded = item.isExpanded;
  const groupTasks = item.groupTasks;
  const effectiveTaskCount = item.effectiveTaskCount;

  const parentTaskMap = React.useMemo(() => {
    const map = new Map<string, Task>();
    (groupTasks || []).forEach((gt) => {
      if (gt.id) {
        const idStr = String(gt.id).trim();
        map.set(idStr, gt);
        map.set(idStr.toLowerCase(), gt);
      }
      if (gt.taskCodePhu) {
        const codeStr = String(gt.taskCodePhu).trim().toLowerCase();
        map.set(codeStr, gt);
        const numMatch = codeStr.match(/[-#]?(\d+)$/);
        if (numMatch) {
          map.set(numMatch[1], gt);
          map.set(`#${numMatch[1]}`, gt);
        }
      }
      if (gt.orderIndex !== undefined && gt.orderIndex !== null) {
        map.set(String(Number(gt.orderIndex) + 1), gt);
        map.set(`#${Number(gt.orderIndex) + 1}`, gt);
      }
      if (gt.name) {
        map.set(String(gt.name).trim().toLowerCase(), gt);
      }
    });
    return map;
  }, [groupTasks]);

  const projectModularParentIds = React.useMemo(() => {
    const parentIds = new Set<string>();
    (groupTasks || []).forEach((t) => {
      if (t.parentTaskId) {
        const rawParentId = String(t.parentTaskId).trim();
        const matchedParent = parentTaskMap.get(rawParentId) || parentTaskMap.get(rawParentId.toLowerCase());
        const effectiveId = matchedParent ? String(matchedParent.id) : rawParentId;
        parentIds.add(effectiveId);
      }
    });
    return Array.from(parentIds);
  }, [groupTasks, parentTaskMap]);

  const hasModularTasks = projectModularParentIds.length > 0;
  const isProjectModularExpanded =
    hasModularTasks &&
    projectModularParentIds.some((id) => 
      expandedModularTasks?.has(id) || 
      expandedModularTasks?.has(id.toLowerCase())
    );

  const projectChildTasksCount = React.useMemo(() => {
    return (groupTasks || []).filter((t) => Boolean(t.parentTaskId)).length;
  }, [groupTasks]);

  const handleToggleProjectModular = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasModularTasks) return;
    if (!isExpanded) {
      onToggleGroup(String(p.id || p.code || p.no || ''));
    }
    if (onToggleProjectModularTasks) {
      onToggleProjectModularTasks(projectModularParentIds, !isProjectModularExpanded);
    } else if (onToggleModularParent) {
      projectModularParentIds.forEach((id) => {
        const isExp = expandedModularTasks?.has(id) || expandedModularTasks?.has(id.toLowerCase());
        if (isProjectModularExpanded) {
          if (isExp) onToggleModularParent(id);
        } else {
          if (!isExp) onToggleModularParent(id);
        }
      });
    }
  };
  const isProjDelegationOn = item.isProjDelegationOn;
  const planProgressPercent = item.planProgressPercent;
  const actProgressPercent = item.actProgressPercent;

  const computedStart = React.useMemo(() => {
    if (groupTasks && groupTasks.length > 0) {
      let minStart: string | undefined = undefined;
      for (const t of groupTasks) {
        if (t.start && (!minStart || t.start < minStart)) minStart = t.start;
      }
      if (minStart) return minStart;
    }
    return p.computedTakStart || p.start;
  }, [groupTasks, p.computedTakStart, p.start]);

  const computedFinish = React.useMemo(() => {
    if (groupTasks && groupTasks.length > 0) {
      let maxFinish: string | undefined = undefined;
      for (const t of groupTasks) {
        if (t.finish && (!maxFinish || t.finish > maxFinish)) maxFinish = t.finish;
      }
      if (maxFinish) return maxFinish;
    }
    return p.computedTakCompl || p.handover || p.opening;
  }, [groupTasks, p.computedTakCompl, p.handover, p.opening]);

  const computedDuration = React.useMemo(() => {
    if (!computedStart || !computedFinish) return '-';
    return calculateDays(computedStart, computedFinish);
  }, [computedStart, computedFinish]);

  const { isFlashed } = useIsRowFlashed(p.id);

  return (
    <tr
      id={`detail-project-${p.no ?? p.code}`}
      data-project-item="true"
      data-project-id={String(p.id || p.no || p.code)}
      data-project-code={p.code}
      data-project-year={p.year || ''}
      data-project-store={p.store || ''}
      className={cn(
        "table-row-optimized border-b-2 border-slate-200 dark:border-[#444446] transition-all duration-700",
        item.projectIndex % 2 === 0 ? "bg-slate-100/80 dark:bg-[#1e1e20]/80" : "bg-blue-50/50 dark:bg-[#28282a]",
        isFlashed && "ring-2 ring-emerald-500/80 bg-emerald-50/90 dark:bg-emerald-950/70 z-10 shadow-sm"
      )}
    >
      {visibleColumns.includes('drag') && (
        <td className="px-2 py-2 text-center select-none w-8 text-slate-400">
          <div className="flex items-center justify-center cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <GripVertical size={14} />
          </div>
        </td>
      )}
      {visibleColumns.includes('checkbox') && (
        <td className="px-2 py-2 text-center select-none">
          <input
            type="checkbox"
            checked={isAllTasksSelected}
            onChange={(e) => onSelectAllTasksInProject(groupTasks, e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4 bg-white dark:bg-[#28282a] border-slate-300 dark:border-[#444446]"
            title="Select all tasks in this project"
          />
        </td>
      )}
      {visibleColumns.includes('no') && (
        <td className="px-3 py-2 font-bold text-slate-800 dark:text-[#f5f5f7]">
          <div className="flex flex-col items-center justify-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleGroup(String(p.id || p.code || p.no || ''));
              }}
              className={cn(
                "px-1.5 py-0.5 rounded text-white transition-all shadow-2xs flex items-center gap-1 cursor-pointer font-semibold active:scale-95 touch-manipulation text-xs",
                isExpanded
                  ? "bg-slate-600 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                  : effectiveTaskCount > 0
                  ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              )}
              title={isExpanded ? "Collapse tasks" : `Expand tasks (${effectiveTaskCount})`}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span className="text-[10px]">({effectiveTaskCount})</span>
            </button>
            {hasModularTasks && (
              <button
                type="button"
                onClick={handleToggleProjectModular}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-all active:scale-95 touch-manipulation cursor-pointer border shadow-2xs select-none",
                  isProjectModularExpanded
                    ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-500 shadow-purple-500/20"
                    : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-950/80 dark:hover:bg-purple-900 dark:text-purple-200 border-purple-300 dark:border-purple-700"
                )}
                title={isProjectModularExpanded ? "Collapse modular tasks of this project" : `Expand modular tasks (${projectChildTasksCount})`}
              >
                {isProjectModularExpanded ? (
                  <ChevronDown className="w-3 h-3 text-current pointer-events-none" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-current pointer-events-none" />
                )}
                <span>({projectChildTasksCount})</span>
              </button>
            )}
          </div>
        </td>
      )}
      {visibleColumns.includes('year') && (
        <td className="px-3 py-2">
          <EditableCell
            value={p.year}
            type="number"
            onSave={(val) => onUpdateProject(p, 'year', Number(val))}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('store') && (
        <td className="px-3 py-2">
          <EditableCell
            value={p.store}
            type="select"
            options={allowedStoreOptions}
            className={cn(
              "font-bold",
              p.store?.toLowerCase() === 'hcm' 
                ? "text-blue-600 dark:text-[#8ab4f8]" 
                : p.store?.toLowerCase() === 'hn' 
                ? "text-rose-600 dark:text-rose-400" 
                : "text-slate-700 dark:text-[#e3e3e3]"
            )}
            onSave={(val) => onUpdateProject(p, 'store', val)}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('location') && (
        <td className="px-3 py-2">
          <EditableCell
            value={p.location}
            type="select"
            options={allowedLocationOptions}
            onSave={(val) => onUpdateProject(p, 'location', val)}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('code') && (
        <td className="px-3 py-2 font-bold text-slate-800 dark:text-[#f5f5f7]">
          <EditableCell
            value={p.code}
            onSave={(val) => onUpdateProject(p, 'code', val)}
            canWrite={canWrite}
          />
        </td>
      )}
      {visibleColumns.includes('projectName') && (
        <td className="px-3 py-2 font-bold text-slate-800 dark:text-[#f5f5f7]">
          <div className="flex items-center gap-2">
            <EditableCell
              value={p.name}
              onSave={(val) => onUpdateProject(p, 'name', val)}
              canWrite={canWrite}
            />
          </div>
        </td>
      )}
      {visibleColumns.includes('taskName') && (
        <td className="px-3 py-2 font-bold text-slate-800 dark:text-[#f5f5f7]">
          <div className="flex items-center gap-2">
            <EditableCell
              value={p.name}
              onSave={(val) => onUpdateProject(p, 'name', val)}
              canWrite={canWrite}
            />
          </div>
        </td>
      )}
      {visibleColumns.includes('duration') && (
        <td className="px-3 py-2 text-slate-500 dark:text-[#a3a3a3] italic font-mono text-xs">
          {computedDuration}
        </td>
      )}
      {visibleColumns.includes('start') && (
        <td className="px-3 py-2 text-blue-600 dark:text-[#8ab4f8] font-mono text-xs font-semibold">
          {formatDisplayDateTime(computedStart)}
        </td>
      )}
      {visibleColumns.includes('finish') && (
        <td className="px-3 py-2 text-pink-600 dark:text-pink-400 font-mono text-xs font-semibold">
          {formatDisplayDateTime(computedFinish)}
        </td>
      )}
      {visibleColumns.includes('planProgress') && (
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="w-12 bg-slate-200 dark:bg-[#333336] rounded-full h-1.5 overflow-hidden shrink-0">
              <div
                className="bg-blue-600 h-1.5 rounded-full transition-all"
                style={{ width: `${planProgressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-slate-600 dark:text-[#a3a3a3]">
              {planProgressPercent}%
            </span>
          </div>
        </td>
      )}
      {visibleColumns.includes('actProgress') && (
        <td className="px-3 py-2">
          {isProjDelegationOn ? (
            <div className="flex items-center gap-1.5">
              <div className="w-12 bg-slate-200 dark:bg-[#333336] rounded-full h-1.5 overflow-hidden shrink-0">
                <div
                  className="bg-emerald-600 h-1.5 rounded-full transition-all"
                  style={{ width: `${actProgressPercent}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-600 dark:text-[#a3a3a3]">
                {actProgressPercent}%
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-mono text-xs">-</span>
          )}
        </td>
      )}
      {visibleColumns.includes('predecessor') && (
        <td className="px-3 py-2 text-slate-400">-</td>
      )}
      {visibleColumns.includes('party') && (
        <td className="px-3 py-2">
          <div className="flex items-center justify-between gap-2 pr-1">
            <div className="flex-1 text-slate-400 text-xs">-</div>
            <FastToggle
              value={isProjDelegationOn}
              canWrite={false}
              readOnly={true}
              onToggle={() => {}}
              isSmall={true}
              title="Project delegation status (active when child tasks have delegation enabled)"
            />
          </div>
        </td>
      )}
      {visibleColumns.includes('action') && (
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
            <QuickNavButton 
              project={p} 
              title={`Quick Navigator (${p.code})`} 
              className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-blue-500 hover:text-blue-400 bg-transparent border-0 shadow-none"
            />
            <button
              onClick={() => onSortSubTasks(p, groupTasks)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              title="Sort sub-tasks by Start Date"
            >
              <ArrowDownUp size={14} />
            </button>
            <button
              onClick={() => onEditProject(p)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
              title="Edit Project"
            >
              <Edit3 size={14} />
            </button>
            {canWrite && (
              <button
                onClick={() => onAddTask(p)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-green-600 transition-colors cursor-pointer"
                title="Add Task to this Project"
              >
                <Plus size={14} />
              </button>
            )}
            {canWrite && (
              <button
                onClick={() => onDeleteProject(p)}
                className="p-1 hover:bg-slate-200 dark:hover:bg-[#333336] rounded text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
                title="Delete Project"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});
