import React, { memo } from 'react';
import { ChevronDown, ChevronRight, Layers, Unlink } from 'lucide-react';
import { Project } from '../../types';
import { BudgetTreeNode } from './budgetTypes';
import { QuickNavButton } from '../QuickNavButton';
import { QRCodeButton } from '../QRCodeButton';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

interface BudgetMobileCardProps {
  node: BudgetTreeNode;
  depth: number;
  isExpanded: boolean;
  canWrite: boolean;
  onGoToCost: (code: string) => void;
  onProjectClick: (p: Project) => void;
  toggleExpand: (id: string) => void;
  handleOpenLinkModal: (p?: Project) => void;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
}

export const BudgetMobileCard = memo(function BudgetMobileCard({
  node,
  depth,
  isExpanded,
  canWrite,
  onGoToCost,
  onProjectClick,
  toggleExpand,
  handleOpenLinkModal,
  handleLinkParent,
  formatCurrency
}: BudgetMobileCardProps) {
  const { t } = useLanguage();

  const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
  const vColor = (node.remaining || 0) < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400';
  const vBg = (node.remaining || 0) < 0 ? 'bg-red-50 dark:bg-[#3b1a1a] border-red-200 dark:border-[#5c2424]' : 'bg-emerald-50 dark:bg-[#1a3821] border-emerald-200 dark:border-[#265330]';
  
  const isSelfRow = !node.isParentNode && node.isSelf;
  const isSubRow = !node.isParentNode && !node.isSelf;
  const isHighlightedChild = !node.isParentNode && Boolean(node.isSearchMatch);

  let cardStyle = "";
  if (node.isParentNode) {
    cardStyle = isParent
      ? "border-2 border-blue-500/80 dark:border-blue-500/60 shadow-md bg-gradient-to-r from-blue-50/60 to-indigo-50/40 dark:from-[#1b2030] dark:to-[#1e1e24] border-l-[5px] border-l-blue-600"
      : cn("border border-slate-200/90 dark:border-[#38383b] shadow-xs bg-white dark:bg-[#1e1e20]", (node.remaining || 0) >= 0 ? "border-l-[5px] border-l-emerald-500" : "border-l-[5px] border-l-rose-500");
  } else if (isHighlightedChild) {
    cardStyle = isSelfRow
      ? "ml-4 border-2 border-blue-500 ring-2 ring-blue-500/50 bg-blue-100/60 dark:bg-blue-950/70 shadow-md border-l-[5px] border-l-blue-600"
      : "ml-4 border-2 border-amber-500 ring-2 ring-amber-500/50 bg-amber-100/60 dark:bg-amber-950/70 shadow-md border-l-[5px] border-l-amber-600";
  } else if (isSelfRow) {
    cardStyle = "ml-4 border-l-[5px] border-l-blue-500 border-t border-r border-b border-blue-200/80 dark:border-blue-900/50 bg-blue-50/30 dark:bg-[#151926]/70 shadow-xs";
  } else {
    cardStyle = "ml-4 border-l-[5px] border-l-amber-500 border-t border-r border-b border-amber-300/80 dark:border-amber-800/60 bg-amber-50/35 dark:bg-[#231b12]/70 shadow-xs";
  }

  const cleanNodeName = node.name ? node.name.replace(new RegExp(`^${node.store}\\s*-\\s*${node.code}\\s*-\\s*`, 'i'), '') : '-';

  return (
    <div 
      className={cn(
        "mobile-card-optimized rounded-xl p-3.5 flex flex-col gap-2.5 transition-all",
        cardStyle
      )}
    >
      {/* Top row: Badges & Remaining Badge */}
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {node.isParentNode && isParent && (
            <button 
              onClick={() => toggleExpand(node.id || node.code)} 
              className={cn(
                "px-2 py-0.5 text-white rounded-md transition-colors flex items-center gap-1 text-[10px] font-extrabold shadow-2xs shrink-0",
                (node.filteredChildren?.length ?? 0) >= 2
                  ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                  : "bg-blue-600 hover:bg-blue-700"
              )}
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              <span>MAIN ({node.filteredChildren.length})</span>
            </button>
          )}
          {isSelfRow && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase shrink-0 flex items-center gap-1 shadow-2xs">
              <span>↳</span> BẢN THÂN (SELF)
            </span>
          )}
          {isSubRow && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-600 text-white uppercase shrink-0 flex items-center gap-1 shadow-2xs">
              <span>↳</span> SUB
            </span>
          )}
          {isHighlightedChild && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase shrink-0 shadow-2xs">
              MATCH
            </span>
          )}
          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
            {node.year || '-'}
          </span>
          <span className={cn(
            "px-1.5 py-0.5 text-[10px] font-bold rounded border uppercase shrink-0", 
            node.store?.toLowerCase() === 'hcm' 
              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200/80 dark:border-blue-800' 
              : node.store?.toLowerCase() === 'hn' 
              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200/80 dark:border-rose-800' 
              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          )}>
            {node.store || '-'}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] font-bold font-mono rounded bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shrink-0">
            {node.code}
          </span>
          {(node.location || node.project?.location) && (
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate">
              • {node.location || node.project?.location}
            </span>
          )}
        </div>

        <div className="shrink-0">
          <span className={cn("px-2 py-0.5 text-xs font-mono font-bold rounded-lg border", vBg, vColor)}>
            {formatCurrency(node.remaining)}
          </span>
        </div>
      </div>

      {/* Project Name */}
      <div 
        onClick={() => node.project && onProjectClick(node.project)}
        className={cn(
          "font-bold text-sm leading-snug cursor-pointer hover:underline hover:text-blue-600 dark:hover:text-[#8ab4f8]",
          node.isParentNode ? "text-slate-900 dark:text-[#ffffff]" : (isSubRow ? "text-amber-950 dark:text-amber-200 font-semibold" : "text-slate-700 dark:text-[#e3e3e3]")
        )}
      >
        {cleanNodeName}
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-[#161618] rounded-lg p-2 border border-slate-100 dark:border-[#2e2e32] text-center">
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t('Budget')}</span>
          <span className="font-mono text-xs font-bold text-blue-900 dark:text-[#8ab4f8] truncate">
            {formatCurrency(node.totalBudget ?? node.budget)}
          </span>
        </div>
        <div className="flex flex-col border-x border-slate-200 dark:border-[#2e2e32] px-1">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase flex items-center justify-center gap-0.5">
            {t('Actual')}
            {node.hasForc && <span className="text-[8px] text-orange-600 font-extrabold">(F)</span>}
          </span>
          <span 
            onClick={() => onGoToCost(node.code)}
            className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 truncate cursor-pointer hover:underline"
          >
            {formatCurrency(node.totalActual)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase">{t('Support Fee')}</span>
          <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-400 truncate">
            {formatCurrency(node.totalSupportingFee ?? node.ownSupportingFee)}
          </span>
        </div>
      </div>

      {/* Note & Actions row */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-[#2e2e32]/60 text-xs">
        <div className="text-[11px] text-slate-500 dark:text-slate-400 italic truncate flex-1 min-w-0">
          {node.note || <span className="opacity-40">{t('No notes')}</span>}
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0">
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
                      className="p-1 text-red-500 hover:text-red-700 rounded bg-red-50 hover:bg-red-100 dark:bg-[#28282a] dark:hover:bg-red-950/50 transition-colors active:scale-95"
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
      </div>
    </div>
  );
});
