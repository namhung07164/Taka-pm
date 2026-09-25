import React, { memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { ResizableHeader } from '../ResizableHeader';
import { Project } from '../../types';

interface DetailTableHeaderProps {
  visibleColumns: string[];
  colWidths: Record<string, number>;
  canWrite: boolean;
  selectedTaskIds: Set<string>;
  allVisibleTaskIds: string[];
  expandedCodes: string[];
  filteredProjects: Project[];
  availableColumnsForUser: { id: string; label: string }[];
  sortConfig: { key: string; direction: 'asc' | 'desc' } | null;
  onResize: (col: string, width: number) => void;
  onToggleColumn: (col: string) => void;
  onSort: (key: string) => void;
  onSelectAllChange: (checked: boolean) => void;
  onToggleExpandAll: () => void;
}

export const DetailTableHeader = memo(function DetailTableHeader({
  visibleColumns,
  colWidths,
  canWrite,
  selectedTaskIds,
  allVisibleTaskIds,
  expandedCodes,
  availableColumnsForUser,
  sortConfig,
  onResize,
  onToggleColumn,
  onSort,
  onSelectAllChange,
  onToggleExpandAll
}: DetailTableHeaderProps) {
  return (
    <tr>
      {visibleColumns.includes('checkbox') && (
        <th className="px-2 py-3 w-10 text-center select-none bg-slate-50 dark:bg-[#1e1e20] border-b border-slate-200 dark:border-[#444446]">
          <input 
            type="checkbox" 
            title="Select All Visible Tasks"
            onChange={(e) => onSelectAllChange(e.target.checked)}
            checked={selectedTaskIds.size > 0 && selectedTaskIds.size === allVisibleTaskIds.length}
            className="cursor-pointer rounded border-slate-300 dark:border-slate-600 h-4 w-4 text-blue-600 focus:ring-blue-500"
          />
        </th>
      )}
      {visibleColumns.includes('no') && (
        <ResizableHeader 
          width={colWidths.no} 
          onResize={(w) => onResize('no', w)} 
          className="px-6 py-3 font-bold text-center" 
          hideable 
          onHide={() => onToggleColumn('no')}
        >
          <div className="flex items-center justify-center gap-1">
            {canWrite && !visibleColumns.includes('checkbox') && (
              <input 
                type="checkbox" 
                title="Select All Visible Tasks"
                onChange={(e) => onSelectAllChange(e.target.checked)}
                checked={selectedTaskIds.size > 0 && selectedTaskIds.size === allVisibleTaskIds.length}
                className="cursor-pointer rounded border-slate-300 dark:border-slate-600 mr-1"
              />
            )}
            No.
            <button 
              onClick={onToggleExpandAll} 
              className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8] cursor-pointer"
            >
              {expandedCodes.length === 0 ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </ResizableHeader>
      )}
      {visibleColumns.includes('year') && (
        <ResizableHeader 
          width={colWidths.year} 
          onResize={(w) => onResize('year', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('year')}
        >
          Year
        </ResizableHeader>
      )}
      {visibleColumns.includes('store') && (
        <ResizableHeader 
          width={colWidths.store} 
          onResize={(w) => onResize('store', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('store')}
        >
          Store
        </ResizableHeader>
      )}
      {visibleColumns.includes('location') && (
        <ResizableHeader 
          width={colWidths.location} 
          onResize={(w) => onResize('location', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('location')}
        >
          Location
        </ResizableHeader>
      )}
      {visibleColumns.includes('code') && (
        <ResizableHeader 
          width={colWidths.code} 
          onResize={(w) => onResize('code', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('code')}
        >
          Code
        </ResizableHeader>
      )}
      {visibleColumns.includes('projectName') && (
        <ResizableHeader 
          width={colWidths.projectName} 
          onResize={(w) => onResize('projectName', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('projectName')}
        >
          Project Name
        </ResizableHeader>
      )}
      {visibleColumns.includes('taskName') && (
        <ResizableHeader 
          width={colWidths.taskName} 
          onResize={(w) => onResize('taskName', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('taskName')}
        >
          Task Name
        </ResizableHeader>
      )}
      {visibleColumns.includes('duration') && (
        <ResizableHeader 
          width={colWidths.duration} 
          onResize={(w) => onResize('duration', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('duration')}
        >
          Duration
        </ResizableHeader>
      )}
      {visibleColumns.includes('start') && (
        <ResizableHeader 
          width={colWidths.start} 
          onResize={(w) => onResize('start', w)} 
          className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
          onClick={() => onSort('start')}
          hideable 
          onHide={() => onToggleColumn('start')}
        >
          Start (Plan) {sortConfig?.key === 'start' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
        </ResizableHeader>
      )}
      {visibleColumns.includes('finish') && (
        <ResizableHeader 
          width={colWidths.finish} 
          onResize={(w) => onResize('finish', w)} 
          className="px-6 py-3 font-bold cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors"
          onClick={() => onSort('finish')}
          hideable 
          onHide={() => onToggleColumn('finish')}
        >
          Finish (Plan) {sortConfig?.key === 'finish' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
        </ResizableHeader>
      )}
      {visibleColumns.includes('predecessor') && (
        <ResizableHeader 
          width={colWidths.predecessor} 
          onResize={(w) => onResize('predecessor', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('predecessor')}
        >
          Predecessor
        </ResizableHeader>
      )}
      {visibleColumns.includes('party') && (
        <ResizableHeader 
          width={colWidths.party} 
          onResize={(w) => onResize('party', w)} 
          className="px-6 py-3 font-bold" 
          hideable 
          onHide={() => onToggleColumn('party')}
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
      {visibleColumns.includes('action') && (
        <ResizableHeader 
          width={colWidths.action} 
          onResize={(w) => onResize('action', w)} 
          className="px-4 py-3 font-bold text-center" 
          hideable 
          onHide={() => onToggleColumn('action')}
        >
          Action
        </ResizableHeader>
      )}
    </tr>
  );
});
