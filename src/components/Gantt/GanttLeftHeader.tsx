import React, { FC, memo } from 'react';
import { ChevronDown, ChevronRight, EyeOff } from 'lucide-react';
import { useLanguage } from '../../lib/LanguageContext';
import { GanttColumnWidths } from './useGanttColumnResize';
import { cn } from '../../lib/utils';

interface GanttLeftHeaderProps {
  sideWidth: number;
  isEditMode: boolean;
  isAllSelected: boolean;
  handleToggleSelectAll: () => void;
  isAllExpanded: boolean;
  handleToggleExpandAll: (e: React.MouseEvent) => void;
  isAllModularExpanded?: boolean;
  handleToggleExpandAllModular?: (e: React.MouseEvent) => void;
  hasModularTasks?: boolean;
  visibleColumns: string[];
  colWidths?: GanttColumnWidths;
  handleToggleColumn?: (colId: string) => void;
  startResizingColumn?: (colKey: keyof GanttColumnWidths, e: React.MouseEvent) => void;
}

export const GanttLeftHeader: React.FC<GanttLeftHeaderProps> = React.memo(({
  sideWidth,
  isEditMode,
  isAllSelected,
  handleToggleSelectAll,
  isAllExpanded,
  handleToggleExpandAll,
  isAllModularExpanded = false,
  handleToggleExpandAllModular,
  hasModularTasks = false,
  visibleColumns,
  colWidths,
  handleToggleColumn,
  startResizingColumn,
}) => {
  const { t } = useLanguage();

  const showStart = visibleColumns.includes('start');
  const showFinish = visibleColumns.includes('finish');
  const showParty = visibleColumns.includes('party');
  const showDuration = visibleColumns.includes('duration');
  const showPredecessor = visibleColumns.includes('predecessor');

  const startColWidth = colWidths?.start ?? 85;
  const finishColWidth = colWidths?.finish ?? 85;
  const partyColWidth = colWidths?.party ?? 80;
  const durationColWidth = colWidths?.duration ?? 60;
  const predecessorColWidth = colWidths?.predecessor ?? 90;

  return (
    <div
      className="sticky left-0 z-30 bg-slate-100 dark:bg-[#28282b] flex items-center border-r border-slate-300 dark:border-slate-700 font-bold text-xs text-slate-900 dark:text-[#c3c3c3] shrink-0"
      style={{ width: `${sideWidth}px` }}
    >
      <div className="w-10 px-1 py-2 text-center border-r border-slate-200 dark:border-slate-800 shrink-0">
        {isEditMode ? (
          <input
            type="checkbox"
            checked={isAllSelected}
            onChange={handleToggleSelectAll}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
            title="Select All"
          />
        ) : (
          <span>#</span>
        )}
      </div>
      <div className="flex-1 min-w-[140px] px-2 py-1 border-r border-slate-200 dark:border-slate-800 truncate flex items-center gap-1.5">
        <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={handleToggleExpandAll}
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-300 active:scale-90 transition-all shrink-0 cursor-pointer"
            title={isAllExpanded ? "Collapse All Projects" : "Expand All Projects"}
          >
            {isAllExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 font-bold" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 font-bold" />
            )}
          </button>
          <button
            type="button"
            onClick={handleToggleExpandAllModular}
            disabled={!hasModularTasks}
            className={cn(
              "p-0.5 rounded shrink-0 active:scale-90 transition-all touch-manipulation cursor-pointer",
              !hasModularTasks
                ? "opacity-25 cursor-not-allowed bg-slate-100 dark:bg-[#28282a] text-slate-400 dark:text-slate-600"
                : isAllModularExpanded
                ? "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-500 shadow-xs ring-1 ring-purple-400/50"
                : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/60 dark:hover:bg-purple-900/90 dark:text-purple-200 border border-purple-300 dark:border-purple-600/70"
            )}
            title={
              !hasModularTasks
                ? "No group tasks in currently displayed projects"
                : isAllModularExpanded
                ? "Collapse All Group Tasks (Current Projects)"
                : "Expand All Group Tasks (Current Projects)"
            }
          >
            {isAllModularExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 pointer-events-none" />
            )}
          </button>
        </div>
        <span className="truncate">{t('Project / Task')}</span>
      </div>
      {showStart && (
        <div
          className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
          style={{ width: `${startColWidth}px`, minWidth: `${startColWidth}px`, maxWidth: `${startColWidth}px` }}
        >
          <span className="truncate flex-1">{t('Start')}</span>
          {handleToggleColumn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleColumn("start");
              }}
              className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
              title="Hide Start column"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {startResizingColumn && (
            <div
              onMouseDown={(e) => startResizingColumn('start', e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
              title="Drag to resize column"
            />
          )}
        </div>
      )}
      {showFinish && (
        <div
          className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
          style={{ width: `${finishColWidth}px`, minWidth: `${finishColWidth}px`, maxWidth: `${finishColWidth}px` }}
        >
          <span className="truncate flex-1">{t('Finish')}</span>
          {handleToggleColumn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleColumn("finish");
              }}
              className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
              title="Hide Finish column"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {startResizingColumn && (
            <div
              onMouseDown={(e) => startResizingColumn('finish', e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
              title="Drag to resize column"
            />
          )}
        </div>
      )}
      {showParty && (
        <div
          className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
          style={{ width: `${partyColWidth}px`, minWidth: `${partyColWidth}px`, maxWidth: `${partyColWidth}px` }}
        >
          <span className="truncate flex-1">{t('Party')}</span>
          {handleToggleColumn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleColumn("party");
              }}
              className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
              title="Hide Party column"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {startResizingColumn && (
            <div
              onMouseDown={(e) => startResizingColumn('party', e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
              title="Drag to resize column"
            />
          )}
        </div>
      )}
      {showDuration && (
        <div
          className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
          style={{ width: `${durationColWidth}px`, minWidth: `${durationColWidth}px`, maxWidth: `${durationColWidth}px` }}
        >
          <span className="truncate flex-1">{t('Duration')}</span>
          {handleToggleColumn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleColumn("duration");
              }}
              className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
              title="Hide Duration column"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {startResizingColumn && (
            <div
              onMouseDown={(e) => startResizingColumn('duration', e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
              title="Drag to resize column"
            />
          )}
        </div>
      )}
      {showPredecessor && (
        <div
          className="relative px-1.5 py-2 text-center border-r border-slate-200 dark:border-slate-800 truncate text-[11px] font-bold flex items-center justify-between gap-1 group/col shrink-0"
          style={{ width: `${predecessorColWidth}px`, minWidth: `${predecessorColWidth}px`, maxWidth: `${predecessorColWidth}px` }}
        >
          <span className="truncate flex-1">{t('Pred')}</span>
          {handleToggleColumn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleColumn("predecessor");
              }}
              className="opacity-0 group-hover/col:opacity-70 hover:!opacity-100 p-0.5 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer shrink-0"
              title="Hide Predecessor column"
            >
              <EyeOff className="w-3 h-3" />
            </button>
          )}
          {startResizingColumn && (
            <div
              onMouseDown={(e) => startResizingColumn('predecessor', e)}
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 transition-colors z-20"
              title="Drag to resize column"
            />
          )}
        </div>
      )}
    </div>
  );
});
GanttLeftHeader.displayName = 'GanttLeftHeader';
