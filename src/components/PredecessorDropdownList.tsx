import React from 'react';
import { Task } from '../types';
import { RankedPredecessorMatch } from '../lib/predecessorMatchUtils';
import { useLanguage } from '../lib/LanguageContext';
import { Sparkles, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface PredecessorDropdownListProps {
  isOpen: boolean;
  activeSegment: string;
  rankedCandidateList: RankedPredecessorMatch[];
  disabled?: boolean;
  highlightedIndex: number;
  setHighlightedIndex: (idx: number) => void;
  segments: string[];
  isTrailingDelimiter: boolean;
  activeQuery: string;
  activeSuffix?: string;
  handleSelect: (task: Task, relationship?: string, forceConfirmed?: boolean, triggerCommit?: boolean) => void;
  getBadgeLabel: (item: RankedPredecessorMatch) => string;
}

export const PredecessorDropdownList: React.FC<PredecessorDropdownListProps> = React.memo(({
  isOpen,
  activeSegment,
  rankedCandidateList,
  disabled,
  highlightedIndex,
  setHighlightedIndex,
  segments,
  isTrailingDelimiter,
  activeQuery,
  activeSuffix,
  handleSelect,
  getBadgeLabel,
}) => {
  const { t: translate } = useLanguage();

  if (!isOpen || !activeSegment || rankedCandidateList.length === 0 || disabled) {
    return null;
  }

  return (
    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-[#333336] rounded-lg shadow-xl overflow-hidden max-h-64 overflow-y-auto">
      {rankedCandidateList.map((item, idx) => {
        const t = item.task;
        const isSecondPredecessor = segments.length >= 2 || (segments.length === 1 && isTrailingDelimiter);
        const isExternal = item.isExternal;
        const taskCode = item.exactTaskCode;
        const isHighlighted = idx === highlightedIndex;
        const isBestMatch = activeQuery && idx === 0 && item.score >= 450;

        return (
          <div
            key={t.id}
            onClick={() => !isSecondPredecessor && handleSelect(t, activeSuffix || undefined)}
            onMouseEnter={() => setHighlightedIndex(idx)}
            className={cn(
              "p-2.5 border-b border-slate-100 dark:border-[#28282a] last:border-0 transition-colors",
              isHighlighted ? "bg-purple-50/80 dark:bg-purple-900/30" : "",
              !isSecondPredecessor ? "hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer flex flex-col" : "flex flex-col bg-slate-50/50 dark:bg-[#18181a]/50"
            )}
          >
            <div className="flex flex-col min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate flex-1">
                  {t.name}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {isBestMatch && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 inline-flex items-center gap-1">
                      <Sparkles className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400" />
                      {translate("Best Match") || "Best Match"}
                    </span>
                  )}
                  {isExternal && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800 inline-flex items-center gap-1">
                      <ExternalLink className="w-2.5 h-2.5" />
                      {getBadgeLabel(item)}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-blue-600 dark:text-[#8ab4f8] font-mono font-bold">
                  {taskCode}
                </span>
                {(t.start || t.finish) && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                    {t.start ? t.start.substring(5, 10) : ''} {t.start && t.finish ? '→' : ''} {t.finish ? t.finish.substring(5, 10) : ''}
                  </span>
                )}
              </div>
            </div>
            
            {isSecondPredecessor && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200 dark:border-[#333336]">
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'FF'); }}
                  className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded transition-colors border border-blue-200 dark:border-blue-800/50"
                >
                  + FF (Finish-to-Finish)
                </button>
                <button 
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSelect(t, 'SF'); }}
                  className="flex-1 py-1.5 px-2 text-[10px] font-bold bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-400 rounded transition-colors border border-rose-200 dark:border-rose-800/50"
                >
                  + SF (Start-to-Finish)
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
PredecessorDropdownList.displayName = 'PredecessorDropdownList';
