import React, { Dispatch, ReactNode, SetStateAction } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Project } from '../../types';
import { BudgetTreeNode } from './budgetTypes';
import { BudgetMobileCard } from './BudgetMobileCard';
import { useLanguage } from '../../lib/LanguageContext';

interface BudgetMobileViewProps {
  filteredRoots: BudgetTreeNode[];
  visibleCount: number;
  setVisibleCount: React.Dispatch<React.SetStateAction<number>>;
  canWrite: boolean;
  searchTerm: string;
  collapsedInSearch: Set<string>;
  expandedParents: Set<string>;
  toggleExpand: (id: string) => void;
  toggleAllParents: () => void;
  onGoToCost: (code: string) => void;
  onProjectClick: (p: Project) => void;
  handleOpenLinkModal: (p?: Project) => void;
  handleLinkParent: (childProject: Project, parentCode: string | null) => Promise<void>;
  formatCurrency: (val: number | undefined) => string;
}

export function BudgetMobileView({
  filteredRoots,
  visibleCount,
  setVisibleCount,
  canWrite,
  searchTerm,
  collapsedInSearch,
  expandedParents,
  toggleExpand,
  toggleAllParents,
  onGoToCost,
  onProjectClick,
  handleOpenLinkModal,
  handleLinkParent,
  formatCurrency
}: BudgetMobileViewProps) {
  const { t } = useLanguage();

  const renderMobileCards = (nodes: BudgetTreeNode[], depth = 0): React.ReactNode[] => {
    let cards: React.ReactNode[] = [];
    nodes.forEach((node) => {
      const isParent = node.isParentNode && node.filteredChildren && node.filteredChildren.length > 0;
      const isExpanded = searchTerm.trim() 
        ? !collapsedInSearch.has(node.id || node.code) 
        : expandedParents.has(node.id || node.code);

      cards.push(
        <BudgetMobileCard
          key={`mobile-${node.id || `${node.code}-${node.year}-${node.store}-${node.no}`}`}
          node={node}
          depth={depth}
          isExpanded={isExpanded}
          canWrite={canWrite}
          onGoToCost={onGoToCost}
          onProjectClick={onProjectClick}
          toggleExpand={toggleExpand}
          handleOpenLinkModal={handleOpenLinkModal}
          handleLinkParent={handleLinkParent}
          formatCurrency={formatCurrency}
        />
      );

      if (isParent && isExpanded && node.filteredChildren) {
        cards = cards.concat(renderMobileCards(node.filteredChildren, depth + 1));
      }
    });
    return cards;
  };

  const paginatedRoots = filteredRoots.slice(0, visibleCount);

  return (
    <div className="xl:hidden flex-grow overflow-y-auto flex flex-col gap-3 p-3 bg-slate-50 dark:bg-[#121214] relative min-h-0">
      {/* Expand / Collapse All Parents for Mobile */}
      <div className="flex justify-between items-center px-1">
        <span className="text-xs text-slate-500 font-medium">
          {t('Showing')} {Math.min(visibleCount, filteredRoots.length)} {t('of')} {filteredRoots.length} {t('projects')}
        </span>
        <button 
          onClick={toggleAllParents} 
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-[#8ab4f8] font-semibold hover:underline touch-manipulation active:scale-95"
        >
          {expandedParents.size === 0 ? (
            <><ChevronRight className="w-3.5 h-3.5" /> {t('Expand Parents')}</>
          ) : (
            <><ChevronDown className="w-3.5 h-3.5" /> {t('Collapse Parents')}</>
          )}
        </button>
      </div>

      {/* Cards List */}
      {renderMobileCards(paginatedRoots)}

      {/* Load More on Mobile */}
      {visibleCount < filteredRoots.length && (
        <div className="py-2 text-center">
          <button
            onClick={() => setVisibleCount(prev => prev + 30)}
            className="px-6 py-2.5 bg-blue-100 hover:bg-blue-200 text-blue-700 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-300 font-bold rounded-full shadow-sm transition-colors text-xs w-full max-w-xs touch-manipulation active:scale-95"
          >
            {t('Load More Projects')} ({filteredRoots.length - visibleCount} {t('remaining')})
          </button>
        </div>
      )}
    </div>
  );
}
