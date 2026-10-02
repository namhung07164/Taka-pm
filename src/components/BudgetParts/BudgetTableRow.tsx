import React, { memo } from 'react';
import { ChevronDown, ChevronRight, Layers, Unlink } from 'lucide-react';
import { Project } from '../../types';
import { BudgetTreeNode } from './budgetTypes';
import { BudgetEditableCell } from './BudgetEditableCell';
import { QuickNavButton } from '../QuickNavButton';
import { QRCodeButton } from '../QRCodeButton';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

interface BudgetTableRowProps {
  node: BudgetTreeNode;
  idx: number;
  depth: number;
  isExpanded: boolean;
  visibleColumns: string[];
  canWrite: boolean;
  currency: 'VND' | 'JPY' | 'USD';
  jpyRate: number;
  usdRate: number;
  onGoToCost: (code: string) => void;
  onProjectClick: (p: Project) => void;
  toggleExpand: (id: string) => void;
  handleUpdateProject: (p: Project, field: keyof Project, value: any) => Promise<void>;
  handleOpenLinkModal: (p?: Project) => void;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
}

export const BudgetTableRow = memo(function BudgetTableRow({
  node,
  idx,
  depth,
  isExpanded,
  visibleColumns,
  canWrite,
  currency,
  jpyRate,
  usdRate,
  onGoToCost,
  onProjectClick,
  toggleExpand,
  handleUpdateProject,
  handleOpenLinkModal,
  handleLinkParent,
  formatCurrency
}: BudgetTableRowProps) {
  const { t } = useLanguage();

  const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
  const vColor = (node.remaining || 0) < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
  
  const isSelfRow = !node.isParentNode && node.isSelf;
  const isSubRow = !node.isParentNode && !node.isSelf;
  const isHighlightedChild = !node.isParentNode && Boolean(node.isSearchMatch);

  let rowBgClass = "";
  if (node.isParentNode) {
    rowBgClass = isParent 
      ? "bg-blue-50/35 dark:bg-[#1a2030]/60 hover:bg-blue-50/60 font-semibold" 
      : (idx % 2 === 0 ? "bg-white dark:bg-[#1e1e20] hover:bg-blue-50/30" : "bg-slate-50/50 dark:bg-[#1b1b1d] hover:bg-blue-50/30");
  } else if (isHighlightedChild) {
    rowBgClass = isSelfRow 
      ? "bg-blue-100/80 dark:bg-blue-950/70 font-semibold ring-2 ring-blue-500 dark:ring-blue-400 ring-inset shadow-xs relative z-10" 
      : "bg-amber-100/80 dark:bg-amber-950/70 font-semibold ring-2 ring-amber-500 dark:ring-amber-400 ring-inset shadow-xs relative z-10";
  } else if (isSelfRow) {
    rowBgClass = "bg-blue-50/20 dark:bg-[#151926]/50 hover:bg-blue-50/40 border-l-2 border-l-blue-400/80";
  } else {
    rowBgClass = "bg-amber-50/25 dark:bg-[#221a12]/50 hover:bg-amber-50/40 border-l-2 border-l-amber-500/80";
  }

  return (
    <tr 
      className={cn(
        "table-row-optimized border-b border-slate-100 dark:border-[#333336] transition-all text-xs",
        rowBgClass
      )}
    >
      {visibleColumns.includes('no') && (
        <td className="px-2 py-2.5 text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1 min-w-0">
            {isParent && (
              <button 
                onClick={() => toggleExpand(node.id || node.code)} 
                className={cn(
                  "p-1 text-white rounded transition-colors flex items-center gap-0.5 text-xs font-bold shrink-0 shadow-2xs",
                  (node.filteredChildren?.length ?? 0) >= 2
                    ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    : "bg-blue-600 hover:bg-blue-700"
                )}
                title={isExpanded ? "Collapse" : `Expand (${node.filteredChildren?.length})`}
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                <span className="text-[10px]">({node.filteredChildren?.length})</span>
              </button>
            )}
            {isSelfRow && (
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-[#8ab4f8] uppercase shrink-0 border border-blue-200 dark:border-blue-800 flex items-center gap-0.5 leading-none" title="Dòng tự thân (Self)">
                ↳ SELF
              </span>
            )}
            {isSubRow && (
              <span className="text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-300 uppercase shrink-0 border border-amber-300 dark:border-amber-700 flex items-center gap-0.5 leading-none" title="Dòng con (Sub)">
                ↳ SUB
              </span>
            )}
            {isHighlightedChild && (
              <span className="text-[8.5px] font-black px-1.5 py-0.5 rounded bg-blue-600 dark:bg-blue-500 text-white uppercase shrink-0 shadow-2xs leading-none">
                MATCH
              </span>
            )}
          </div>
        </td>
      )}

      {visibleColumns.includes('year') && (
        <td className="px-4 py-3 text-center font-medium text-slate-600 dark:text-[#a3a3a3]">
          {node.isParentNode ? (
            <BudgetEditableCell 
              value={node.year} 
              type="number" 
              onSave={(val) => handleUpdateProject(node.project, 'year', val)} 
              canWrite={canWrite} 
            />
          ) : (
            <span className="text-slate-400 dark:text-[#838383]">{node.year || '-'}</span>
          )}
        </td>
      )}

      {visibleColumns.includes('store') && (
        <td className={cn("px-4 py-3 font-bold", node.store?.toLowerCase() === 'hcm' ? 'text-blue-600 dark:text-[#8ab4f8]' : node.store?.toLowerCase() === 'hn' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-[#c3c3c3]')}>
          {node.isParentNode ? (
            <BudgetEditableCell 
              value={node.store} 
              onSave={(val) => handleUpdateProject(node.project, 'store', val)} 
              canWrite={canWrite} 
            />
          ) : (
            <span>{node.store || '-'}</span>
          )}
        </td>
      )}

      {visibleColumns.includes('location') && (
        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3]">
          <BudgetEditableCell 
            value={node.location} 
            onSave={(val) => handleUpdateProject(node.project, 'location', val)} 
            canWrite={canWrite} 
          />
        </td>
      )}

      {visibleColumns.includes('code') && (
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1 font-mono font-extrabold uppercase whitespace-nowrap min-w-0">
            {node.isParentNode ? (
              <BudgetEditableCell 
                value={node.code} 
                onSave={(val) => handleUpdateProject(node.project, 'code', String(val || '').toUpperCase())} 
                canWrite={canWrite} 
              />
            ) : (
              <span 
                onClick={() => node.project && onProjectClick(node.project)}
                className={cn(
                  "font-semibold whitespace-nowrap text-xs tracking-tight cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]", 
                  isSubRow ? "text-amber-950 dark:text-amber-200" : "text-slate-700 dark:text-[#c3c3c3]"
                )}
                title="Click to view details in Tasks"
              >
                {node.code}
              </span>
            )}
          </div>
        </td>
      )}

      {visibleColumns.includes('projectName') && (
        <td 
          onClick={() => node.project && onProjectClick(node.project)}
          className={cn(
            "px-4 py-3 whitespace-normal break-words leading-snug min-w-[200px]", 
            node.project && "cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]",
            node.isParentNode ? "font-bold text-slate-800 dark:text-[#e3e3e3]" : (isSubRow ? "font-medium text-amber-950/90 dark:text-amber-200/90" : "font-normal text-slate-600 dark:text-[#c3c3c3]")
          )}
          title={node.project ? "Click to view details in Tasks" : undefined}
        >
          {node.name || '-'}
        </td>
      )}

      {visibleColumns.includes('totalBudget') && (
        <td className="px-4 py-3 text-right font-mono text-slate-800 dark:text-[#e3e3e3]">
          {node.isParentNode ? (
            <span className="font-bold text-blue-900 dark:text-[#8ab4f8]">{formatCurrency(node.totalBudget)}</span>
          ) : (
            <BudgetEditableCell 
              value={node.budget} 
              type="number" 
              onSave={(val) => handleUpdateProject(node.project, 'budget', val)} 
              canWrite={canWrite}
              isCurrency={true}
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
            />
          )}
        </td>
      )}

      {visibleColumns.includes('actual') && (
        <td className="px-4 py-3 text-right font-mono">
          <div className="flex items-center justify-end gap-1.5">
            <span 
              onClick={() => onGoToCost(node.code)}
              className={cn(
                "cursor-pointer hover:underline text-emerald-600 dark:text-emerald-400 font-medium",
                node.isParentNode && "font-bold"
              )}
              title="Click to view in Cost Tab"
            >
              {formatCurrency(node.totalActual)}
            </span>
            {node.hasForc && (
              <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800 uppercase" title="Includes Forecasted Costs">
                FORC
              </span>
            )}
          </div>
        </td>
      )}

      {visibleColumns.includes('supportingFee') && (
        <td className="px-4 py-3 text-right font-mono text-indigo-700 dark:text-indigo-400">
          {node.isParentNode ? (
            <span className="font-bold">{formatCurrency(node.totalSupportingFee)}</span>
          ) : (
            <BudgetEditableCell 
              value={node.ownSupportingFee} 
              type="number" 
              onSave={(val) => handleUpdateProject(node.project, 'supportingFee', val)} 
              canWrite={canWrite}
              isCurrency={true}
              currency={currency}
              jpyRate={jpyRate}
              usdRate={usdRate}
            />
          )}
        </td>
      )}

      {visibleColumns.includes('variance') && (
        <td className={cn("px-4 py-3 text-right font-mono font-bold", vColor)}>
          {formatCurrency(node.remaining)}
        </td>
      )}

      {visibleColumns.includes('type') && (
        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3]">
          {node.isParentNode ? (
            <BudgetEditableCell 
              value={node.type} 
              onSave={(val) => handleUpdateProject(node.project, 'type', val)} 
              canWrite={canWrite} 
            />
          ) : (
            <span>{node.type || '-'}</span>
          )}
        </td>
      )}

      {visibleColumns.includes('note') && (
        <td className="px-4 py-3 text-slate-600 dark:text-[#a3a3a3] max-w-xs">
          {node.isParentNode ? (
            <BudgetEditableCell 
              value={node.note} 
              onSave={(val) => handleUpdateProject(node.project, 'note', val)} 
              canWrite={canWrite} 
              wrapText={true}
            />
          ) : (
            <span className="whitespace-normal break-words">{node.note || '-'}</span>
          )}
        </td>
      )}

      {visibleColumns.includes('actions') && (
        <td className="px-3 py-2.5 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <QuickNavButton project={node.project} title={`Quick Navigator (${node.code})`} />
            <QRCodeButton title={node.name || node.code} url={`${window.location.origin}${window.location.pathname}?tab=budget&q=${encodeURIComponent(node.code || '')}`} />
            {canWrite && (
              <>
                {node.isParentNode ? (
                  <button 
                    onClick={() => handleOpenLinkModal(node.project)}
                    className="p-1 text-slate-400 hover:text-blue-600 rounded bg-slate-100 hover:bg-blue-100 dark:bg-[#28282a] dark:hover:bg-[#333336] transition-colors active:scale-95"
                    title="Project Modular (Set as Main)"
                  >
                    <Layers className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  !node.isSelf && (
                    <>
                      <button 
                        onClick={() => handleOpenLinkModal(node.project)}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded bg-slate-100 hover:bg-blue-100 dark:bg-[#28282a] dark:hover:bg-[#333336] transition-colors active:scale-95"
                        title="Project Modular (Set as Main)"
                      >
                        <Layers className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => handleLinkParent(node.project, null)}
                        className="p-1 text-red-500 hover:text-red-700 rounded bg-red-50 hover:bg-red-100 dark:bg-[#28282a] dark:hover:bg-red-950/50 transition-colors"
                        title="Unlink (Make Standalone Parent)"
                      >
                        <Unlink className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )
                )}
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
});
