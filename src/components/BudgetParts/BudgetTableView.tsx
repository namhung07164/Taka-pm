import React, { ReactNode } from 'react';
import { Project } from '../../types';
import { BudgetTreeNode, BudgetSortConfig } from './budgetTypes';
import { BudgetTableRow } from './BudgetTableRow';
import { ResizableHeader } from '../ResizableHeader';
import { useLanguage } from '../../lib/LanguageContext';
import { cn } from '../../lib/utils';

interface BudgetTableViewProps {
  filteredRoots: BudgetTreeNode[];
  visibleCount: number;
  visibleColumns: string[];
  colWidths: Record<string, number>;
  sortConfig: BudgetSortConfig | null;
  canWrite: boolean;
  currency: 'VND' | 'JPY' | 'USD';
  jpyRate: number;
  usdRate: number;
  searchTerm: string;
  collapsedInSearch: Set<string>;
  expandedParents: Set<string>;
  totalGlobalBudget: number;
  totalGlobalActual: number;
  totalGlobalSupportingFee: number;
  totalGlobalRemaining: number;
  totalVarianceColor: string;
  onGoToCost: (code: string) => void;
  onProjectClick: (p: Project) => void;
  toggleExpand: (id: string) => void;
  handleSort: (key: string) => void;
  handleResize: (col: string, width: number) => void;
  handleBudgetScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  handleUpdateProject: (p: Project, field: keyof Project, value: any) => Promise<void>;
  handleOpenLinkModal: (p?: Project) => void;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
}

export function BudgetTableView({
  filteredRoots,
  visibleCount,
  visibleColumns,
  colWidths,
  sortConfig,
  canWrite,
  currency,
  jpyRate,
  usdRate,
  searchTerm,
  collapsedInSearch,
  expandedParents,
  totalGlobalBudget,
  totalGlobalActual,
  totalGlobalSupportingFee,
  totalGlobalRemaining,
  totalVarianceColor,
  onGoToCost,
  onProjectClick,
  toggleExpand,
  handleSort,
  handleResize,
  handleBudgetScroll,
  handleUpdateProject,
  handleOpenLinkModal,
  handleLinkParent,
  formatCurrency
}: BudgetTableViewProps) {
  const { t } = useLanguage();

  const renderRows = (nodes: BudgetTreeNode[], depth = 0): React.ReactNode[] => {
    let rows: React.ReactNode[] = [];
    nodes.forEach((node, idx) => {
      const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
      const isExpanded = searchTerm.trim() 
        ? !collapsedInSearch.has(node.id || node.code) 
        : expandedParents.has(node.id || node.code);

      rows.push(
        <BudgetTableRow
          key={node.id || `${node.code}-${node.year}-${node.store}-${node.no}`}
          node={node}
          idx={idx}
          depth={depth}
          isExpanded={isExpanded}
          visibleColumns={visibleColumns}
          canWrite={canWrite}
          currency={currency}
          jpyRate={jpyRate}
          usdRate={usdRate}
          onGoToCost={onGoToCost}
          onProjectClick={onProjectClick}
          toggleExpand={toggleExpand}
          handleUpdateProject={handleUpdateProject}
          handleOpenLinkModal={handleOpenLinkModal}
          handleLinkParent={handleLinkParent}
          formatCurrency={formatCurrency}
        />
      );

      if (isParent && isExpanded && node.filteredChildren) {
        rows = rows.concat(renderRows(node.filteredChildren, depth + 1));
      }
    });
    return rows;
  };

  const paginatedRoots = filteredRoots.slice(0, visibleCount);

  return (
    <div 
      onScroll={handleBudgetScroll}
      className="hidden xl:block flex-grow overflow-auto border-t border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] relative min-h-0"
    >
      <table className="w-full text-left border-collapse table-fixed">
        <thead className="sticky top-0 z-30 bg-slate-100 dark:bg-[#28282b] text-slate-700 dark:text-[#c3c3c3] font-bold shadow-xs text-xs border-b border-slate-200 dark:border-[#38383a]">
          <tr>
            {visibleColumns.includes('no') && (
              <th className="px-2 py-3 text-center" style={{ width: colWidths.no || 80 }}>{t('No.')}</th>
            )}
            {visibleColumns.includes('year') && (
              <ResizableHeader width={colWidths.year} onResize={(w) => handleResize('year', w)} className="text-center">{t('Year')}</ResizableHeader>
            )}
            {visibleColumns.includes('store') && (
              <ResizableHeader width={colWidths.store} onResize={(w) => handleResize('store', w)}>{t('Store')}</ResizableHeader>
            )}
            {visibleColumns.includes('location') && (
              <ResizableHeader width={colWidths.location} onResize={(w) => handleResize('location', w)}>{t('Location')}</ResizableHeader>
            )}
            {visibleColumns.includes('code') && (
              <ResizableHeader width={colWidths.code} onResize={(w) => handleResize('code', w)}>{t('Code')}</ResizableHeader>
            )}
            {visibleColumns.includes('projectName') && (
              <ResizableHeader width={colWidths.projectName} onResize={(w) => handleResize('projectName', w)}>{t('Project Name')}</ResizableHeader>
            )}
            {visibleColumns.includes('totalBudget') && (
              <ResizableHeader 
                width={colWidths.totalBudget} 
                onResize={(w) => handleResize('totalBudget', w)} 
                onClick={() => handleSort('totalBudget')} 
                className="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] text-right"
              >
                {t('Budget')} {sortConfig?.key === 'totalBudget' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </ResizableHeader>
            )}
            {visibleColumns.includes('actual') && (
              <ResizableHeader 
                width={colWidths.actual} 
                onResize={(w) => handleResize('actual', w)} 
                onClick={() => handleSort('actual')} 
                className="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] text-right"
              >
                {t('Actual/Forc')} {sortConfig?.key === 'actual' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </ResizableHeader>
            )}
            {visibleColumns.includes('supportingFee') && (
              <ResizableHeader width={colWidths.supportingFee} onResize={(w) => handleResize('supportingFee', w)} className="text-right">{t('Supporting Fee')}</ResizableHeader>
            )}
            {visibleColumns.includes('variance') && (
              <ResizableHeader 
                width={colWidths.variance} 
                onResize={(w) => handleResize('variance', w)} 
                onClick={() => handleSort('variance')} 
                className="cursor-pointer hover:bg-slate-200 dark:hover:bg-[#333336] text-right"
              >
                {t('Remaining')} {sortConfig?.key === 'variance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </ResizableHeader>
            )}
            {visibleColumns.includes('type') && (
              <ResizableHeader width={colWidths.type} onResize={(w) => handleResize('type', w)}>{t('Type')}</ResizableHeader>
            )}
            {visibleColumns.includes('note') && (
              <ResizableHeader width={colWidths.note} onResize={(w) => handleResize('note', w)}>{t('Note')}</ResizableHeader>
            )}
            {visibleColumns.includes('actions') && (
              <th className="px-3 py-3 text-center" style={{ width: colWidths.actions || 90 }}>{t('Actions')}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-[#2d2d30]">
          {/* Sticky Sum Bar */}
          <tr className="sticky top-[37px] z-20 bg-blue-50/90 dark:bg-[#1a2030]/90 backdrop-blur-xs font-bold text-xs border-b-2 border-blue-200 dark:border-[#38383a] shadow-xs">
            {visibleColumns.includes('no') && <td className="px-2 py-2 text-center text-blue-900 dark:text-[#8ab4f8]">{t('Total')}</td>}
            {visibleColumns.includes('year') && <td></td>}
            {visibleColumns.includes('store') && <td></td>}
            {visibleColumns.includes('location') && <td></td>}
            {visibleColumns.includes('code') && <td></td>}
            {visibleColumns.includes('projectName') && <td className="px-4 py-2 text-blue-900 dark:text-[#8ab4f8]">{filteredRoots.length} {t('projects')}</td>}
            {visibleColumns.includes('totalBudget') && <td className="px-4 py-2 text-right font-mono text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(totalGlobalBudget)}</td>}
            {visibleColumns.includes('actual') && <td className="px-4 py-2 text-right font-mono text-emerald-600 dark:text-emerald-400">{formatCurrency(totalGlobalActual)}</td>}
            {visibleColumns.includes('supportingFee') && <td className="px-4 py-2 text-right font-mono text-indigo-700 dark:text-indigo-400">{formatCurrency(totalGlobalSupportingFee)}</td>}
            {visibleColumns.includes('variance') && <td className={cn("px-4 py-2 text-right font-mono", totalVarianceColor)}>{formatCurrency(totalGlobalRemaining)}</td>}
            {visibleColumns.includes('type') && <td></td>}
            {visibleColumns.includes('note') && <td></td>}
            {visibleColumns.includes('actions') && <td></td>}
          </tr>

          {filteredRoots.length === 0 ? (
            <tr>
              <td colSpan={visibleColumns.length} className="text-center py-12 text-slate-400 dark:text-[#838383]">
                {t('No projects found matching the criteria.')}
              </td>
            </tr>
          ) : (
            renderRows(paginatedRoots)
          )}
        </tbody>
      </table>
    </div>
  );
}
