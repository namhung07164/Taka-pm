import React, { memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ResizableHeader } from '../ResizableHeader';
import { Project } from '../../types';

export interface DetailTableHeaderProps {
  columnsWithWidths?: Array<{ id: string; label: string; width?: number }>;
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  canWrite: boolean;
  selectedTaskIds: Set<string>;
  allVisibleTaskIds: string[];
  onSelectAllVisibleTasks?: (select: boolean) => void;
  onResize: (col: string, width: number) => void;
  onResetWidth?: (col: string) => void;
  visibleColumns?: string[];
  colWidths?: Record<string, number>;
  expandedCodes?: string[];
  filteredProjects?: Project[];
  availableColumnsForUser?: { id: string; label: string }[];
  onToggleColumn?: (col: string) => void;
  onSelectAllChange?: (checked: boolean) => void;
  onToggleExpandAll?: () => void;
}

export const DetailTableHeader = memo(function DetailTableHeader({
  columnsWithWidths,
  visibleColumns,
  colWidths = {},
  canWrite,
  selectedTaskIds,
  allVisibleTaskIds,
  expandedCodes = [],
  sortConfig,
  onResize,
  onResetWidth: _onResetWidth,
  onToggleColumn,
  onSort,
  onSelectAllChange,
  onToggleExpandAll,
  onSelectAllVisibleTasks
}: DetailTableHeaderProps) {
  const isAllSelected = selectedTaskIds.size > 0 && selectedTaskIds.size === allVisibleTaskIds.length;
  const handleSelectAll = (checked: boolean) => {
    if (onSelectAllVisibleTasks) onSelectAllVisibleTasks(checked);
    if (onSelectAllChange) onSelectAllChange(checked);
  };

  // If columnsWithWidths is provided, render dynamically
  if (columnsWithWidths && columnsWithWidths.length > 0) {
    return (
      <thead className="sticky top-0 z-20 text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446] shadow-xs">
        <tr className="bg-slate-50 dark:bg-[#1e1e20] text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-[#444446] sticky top-0 z-20">
          {columnsWithWidths.map((col) => {
            if (col.id === 'checkbox') {
              return (
                <th
                  key="checkbox"
                  style={{ width: col.width || 40 }}
                  className="px-2 py-3 text-center select-none bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]"
                >
                  <input
                    type="checkbox"
                    title="Select All Visible Tasks"
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={isAllSelected}
                    className="cursor-pointer rounded border-slate-300 dark:border-slate-600 h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              );
            }

            const isSortable = col.id === 'start' || col.id === 'finish';
            const isSorted = sortConfig?.key === col.id;

            return (
              <ResizableHeader
                key={col.id}
                width={col.width || 100}
                onResize={(w) => onResize(col.id, w)}
                className={`px-4 py-3 font-bold select-none text-left ${isSortable ? 'cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors' : ''}`}
                onClick={isSortable ? () => onSort(col.id) : undefined}
                hideable={!!onToggleColumn}
                onHide={onToggleColumn ? () => onToggleColumn(col.id) : undefined}
              >
                <div className="flex items-center gap-1">
                  {col.id === 'no' && canWrite && !columnsWithWidths.some(c => c.id === 'checkbox') && (
                    <input
                      type="checkbox"
                      title="Select All Visible Tasks"
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      checked={isAllSelected}
                      className="cursor-pointer rounded border-slate-300 dark:border-slate-600 mr-1"
                    />
                  )}
                  <span>
                    {col.label}
                    {isSorted && (sortConfig.direction === 'asc' ? ' ↑' : ' ↓')}
                  </span>
                  {col.id === 'no' && onToggleExpandAll && (
                    <button
                      type="button"
                      onClick={onToggleExpandAll}
                      className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8] cursor-pointer ml-1"
                    >
                      {expandedCodes.length === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {col.id === 'party' && (
                    <div className="ml-1 inline-flex items-center">
                      <span className="text-[9px] font-bold text-slate-400 dark:text-[#838383] normal-case leading-none mr-1">deleg</span>
                      <div className="relative inline-flex h-3 w-5 items-center rounded-full bg-green-500">
                        <span className="inline-block h-2 w-2 transform translate-x-2.5 rounded-full bg-white dark:bg-[#1e1e20]" />
                      </div>
                    </div>
                  )}
                </div>
              </ResizableHeader>
            );
          })}
        </tr>
      </thead>
    );
  }

  // Fallback to visibleColumns rendering
  const visCols = visibleColumns || [];
  return (
    <thead className="sticky top-0 z-20 text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446] shadow-xs">
      <tr className="bg-slate-50 dark:bg-[#1e1e20] text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-[#444446] sticky top-0 z-20">
        {visCols.includes('checkbox') && (
          <th className="px-2 py-3 w-10 text-center select-none bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
            <input 
              type="checkbox" 
              title="Select All Visible Tasks"
              onChange={(e) => handleSelectAll(e.target.checked)}
              checked={isAllSelected}
              className="cursor-pointer rounded border-slate-300 dark:border-slate-600 h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
          </th>
        )}
        {visCols.includes('no') && (
          <ResizableHeader 
            width={colWidths.no || 60} 
            onResize={(w) => onResize('no', w)} 
            className="px-6 py-3 font-bold text-center" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('no') : undefined}
          >
            <div className="flex items-center justify-center gap-1">
              {canWrite && !visCols.includes('checkbox') && (
                <input 
                  type="checkbox" 
                  title="Select All Visible Tasks"
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  checked={isAllSelected}
                  className="cursor-pointer rounded border-slate-300 dark:border-slate-600 mr-1"
                />
              )}
              No.
              {onToggleExpandAll && (
                <button 
                  type="button"
                  onClick={onToggleExpandAll} 
                  className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8] cursor-pointer"
                >
                  {expandedCodes.length === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </ResizableHeader>
        )}
        {visCols.includes('year') && (
          <ResizableHeader 
            width={colWidths.year || 80} 
            onResize={(w) => onResize('year', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('year') : undefined}
          >
            Year
          </ResizableHeader>
        )}
        {visCols.includes('store') && (
          <ResizableHeader 
            width={colWidths.store || 80} 
            onResize={(w) => onResize('store', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('store') : undefined}
          >
            Store
          </ResizableHeader>
        )}
        {visCols.includes('location') && (
          <ResizableHeader 
            width={colWidths.location || 90} 
            onResize={(w) => onResize('location', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('location') : undefined}
          >
            Location
          </ResizableHeader>
        )}
        {visCols.includes('code') && (
          <ResizableHeader 
            width={colWidths.code || 90} 
            onResize={(w) => onResize('code', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('code') : undefined}
          >
            Code
          </ResizableHeader>
        )}
        {visCols.includes('projectName') && (
          <ResizableHeader 
            width={colWidths.projectName || 160} 
            onResize={(w) => onResize('projectName', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('projectName') : undefined}
          >
            Project Name
          </ResizableHeader>
        )}
        {visCols.includes('taskName') && (
          <ResizableHeader 
            width={colWidths.taskName || 180} 
            onResize={(w) => onResize('taskName', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('taskName') : undefined}
          >
            Task Name
          </ResizableHeader>
        )}
        {visCols.includes('duration') && (
          <ResizableHeader 
            width={colWidths.duration || 70} 
            onResize={(w) => onResize('duration', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('duration') : undefined}
          >
            Duration
          </ResizableHeader>
        )}
        {visCols.includes('start') && (
          <ResizableHeader 
            width={colWidths.start || 110} 
            onResize={(w) => onResize('start', w)} 
            className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors" 
            onClick={() => onSort('start')}
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('start') : undefined}
          >
            Start (Plan) {sortConfig?.key === 'start' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
          </ResizableHeader>
        )}
        {visCols.includes('finish') && (
          <ResizableHeader 
            width={colWidths.finish || 110} 
            onResize={(w) => onResize('finish', w)} 
            className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors" 
            onClick={() => onSort('finish')}
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('finish') : undefined}
          >
            Finish (Plan) {sortConfig?.key === 'finish' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
          </ResizableHeader>
        )}
        {visCols.includes('predecessor') && (
          <ResizableHeader 
            width={colWidths.predecessor || 100} 
            onResize={(w) => onResize('predecessor', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('predecessor') : undefined}
          >
            Predecessor
          </ResizableHeader>
        )}
        {visCols.includes('party') && (
          <ResizableHeader 
            width={colWidths.party || 90} 
            onResize={(w) => onResize('party', w)} 
            className="px-6 py-3 font-bold" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('party') : undefined}
          >
            <div className="flex flex-col items-center justify-center text-center">
              <span>Party</span>
              <div className="mt-1 flex flex-col items-center">
                <span className="text-[9px] font-bold text-slate-400 dark:text-[#838383] normal-case leading-none mb-1">deleg</span>
                <div className="relative inline-flex h-3 w-5 items-center rounded-full bg-green-500">
                  <span className="inline-block h-2 w-2 transform translate-x-2.5 rounded-full bg-white dark:bg-[#1e1e20]" />
                </div>
              </div>
            </div>
          </ResizableHeader>
        )}
        {visCols.includes('action') && (
          <ResizableHeader 
            width={colWidths.action || 90} 
            onResize={(w) => onResize('action', w)} 
            className="px-4 py-3 font-bold text-center" 
            hideable={!!onToggleColumn} 
            onHide={onToggleColumn ? () => onToggleColumn('action') : undefined}
          >
            Action
          </ResizableHeader>
        )}
      </tr>
    </thead>
  );
});
