import React, { memo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Project } from '../../types';
import { ResizableHeader } from '../ResizableHeader';
import { CostColWidths } from './costTypes';

interface CostTableHeaderProps {
  visibleColumns: string[];
  colWidths: CostColWidths;
  handleResize: (col: keyof CostColWidths, newWidth: number) => void;
  handleToggleColumn: (colId: string) => void;
  expandedCodes: string[];
  setExpandedCodes: (codes: string[]) => void;
  sortedProjects: Project[];
}

export const CostTableHeader = React.memo(function CostTableHeader({
  visibleColumns,
  colWidths,
  handleResize,
  handleToggleColumn,
  expandedCodes,
  setExpandedCodes,
  sortedProjects,
}: CostTableHeaderProps) {
  return (
    <thead className="text-xs text-slate-500 dark:text-[#a3a3a3] uppercase bg-slate-50 dark:bg-[#1e1e20]/50 sticky top-0 border-b border-slate-200 dark:border-[#444446] z-10 shadow-sm">
      <tr>
        {visibleColumns.includes('no') && (
          <ResizableHeader
            width={colWidths.no}
            onResize={(w) => handleResize('no', w)}
            className="px-4 py-3 font-bold text-center"
            hideable
            onHide={() => handleToggleColumn('no')}
          >
            <div className="flex items-center justify-center gap-1">
              No.
              <button
                onClick={() =>
                  setExpandedCodes(
                    expandedCodes.length === 0
                      ? sortedProjects.map((p) => String(p.no))
                      : []
                  )
                }
                className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors text-blue-600 dark:text-[#8ab4f8] cursor-pointer"
              >
                {expandedCodes.length === 0 ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </ResizableHeader>
        )}
        {visibleColumns.includes('year') && (
          <ResizableHeader
            width={colWidths.year}
            onResize={(w) => handleResize('year', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('year')}
          >
            Year
          </ResizableHeader>
        )}
        {visibleColumns.includes('store') && (
          <ResizableHeader
            width={colWidths.store}
            onResize={(w) => handleResize('store', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('store')}
          >
            Store
          </ResizableHeader>
        )}
        {visibleColumns.includes('code') && (
          <ResizableHeader
            width={colWidths.code}
            onResize={(w) => handleResize('code', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('code')}
          >
            Code
          </ResizableHeader>
        )}
        {visibleColumns.includes('projectName') && (
          <ResizableHeader
            width={colWidths.projectName}
            onResize={(w) => handleResize('projectName', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('projectName')}
          >
            Project Name
          </ResizableHeader>
        )}
        {visibleColumns.includes('actual') && (
          <ResizableHeader
            width={colWidths.actual}
            onResize={(w) => handleResize('actual', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('actual')}
          >
            Act/Forecast
          </ResizableHeader>
        )}
        {visibleColumns.includes('firstPaid') && (
          <ResizableHeader
            width={colWidths.firstPaid}
            onResize={(w) => handleResize('firstPaid', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('firstPaid')}
          >
            1st Paid
          </ResizableHeader>
        )}
        {visibleColumns.includes('secondPaid') && (
          <ResizableHeader
            width={colWidths.secondPaid}
            onResize={(w) => handleResize('secondPaid', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('secondPaid')}
          >
            2nd Paid
          </ResizableHeader>
        )}
        {visibleColumns.includes('thirdPaid') && (
          <ResizableHeader
            width={colWidths.thirdPaid}
            onResize={(w) => handleResize('thirdPaid', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('thirdPaid')}
          >
            3rd Paid
          </ResizableHeader>
        )}
        {visibleColumns.includes('balance') && (
          <ResizableHeader
            width={colWidths.balance}
            onResize={(w) => handleResize('balance', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('balance')}
          >
            Balance
          </ResizableHeader>
        )}
        {visibleColumns.includes('supportingFee') && (
          <ResizableHeader
            width={colWidths.supportingFee}
            onResize={(w) => handleResize('supportingFee', w)}
            className="px-4 py-3 font-bold text-right"
            hideable
            onHide={() => handleToggleColumn('supportingFee')}
          >
            Supporting Fee
          </ResizableHeader>
        )}
        {visibleColumns.includes('description') && (
          <ResizableHeader
            width={colWidths.description}
            onResize={(w) => handleResize('description', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('description')}
          >
            Description
          </ResizableHeader>
        )}
        {visibleColumns.includes('vendor') && (
          <ResizableHeader
            width={colWidths.vendor}
            onResize={(w) => handleResize('vendor', w)}
            className="px-4 py-3 font-bold"
            hideable
            onHide={() => handleToggleColumn('vendor')}
          >
            Vendor
          </ResizableHeader>
        )}
        {visibleColumns.includes('action') && (
          <ResizableHeader
            width={colWidths.action}
            onResize={(w) => handleResize('action', w)}
            className="px-4 py-3 font-bold text-center"
            hideable
            onHide={() => handleToggleColumn('action')}
          >
            Action
          </ResizableHeader>
        )}
      </tr>
    </thead>
  );
});
