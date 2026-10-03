import React from 'react';
import { ChevronDown, ChevronRight, X, EyeOff } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';

export interface GanttTimelineHeaderProps {
  isEditMode?: boolean;
  isAllSelected?: boolean;
  onToggleSelectAll?: (checked: boolean) => void;
  hasAnyExpanded?: boolean;
  hasAnyModularExpanded?: boolean;
  toggleAll?: () => void;
  toggleAllModular?: () => void;
  isResizingSide?: boolean;
  startResizingSide?: (e: React.MouseEvent) => void;
  sideWidth?: number;
  showStart?: boolean;
  startColWidth?: number;
  showFinish?: boolean;
  finishColWidth?: number;
  showParty?: boolean;
  partyColWidth?: number;
  showDuration?: boolean;
  durationColWidth?: number;
  handleToggleColumn?: (columnId: string) => void;
  timeUnits: Array<{
    date: Date;
    days: number;
    label?: string;
    labelPrimary?: string;
    labelSecondary?: string;
  }>;
  dayWidth: number;
}

export const GanttTimelineHeader: React.FC<GanttTimelineHeaderProps> = React.memo(({
  isEditMode = false,
  isAllSelected = false,
  onToggleSelectAll,
  hasAnyExpanded = false,
  hasAnyModularExpanded = false,
  toggleAll,
  toggleAllModular,
  isResizingSide = false,
  startResizingSide,
  sideWidth,
  showStart = false,
  startColWidth = 80,
  showFinish = false,
  finishColWidth = 80,
  showParty = false,
  partyColWidth = 70,
  showDuration = false,
  durationColWidth = 50,
  handleToggleColumn,
  timeUnits,
  dayWidth,
}) => {
  const { t } = useLanguage();

  if (sideWidth === undefined) {
    return (
      <div className="flex h-full">
        {timeUnits.map((unit) => {
          const width = unit.days * dayWidth;
          return (
            <div
              key={unit.date.getTime()}
              className="flex flex-col justify-center items-center border-r border-slate-200 dark:border-slate-800 text-center shrink-0 px-1 py-1"
              style={{
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
              }}
            >
              <div className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3] truncate">
                {unit.labelPrimary || unit.label}
              </div>
              {unit.labelSecondary && (
                <div className="text-[10px] text-slate-400 dark:text-[#838383] truncate">
                  {unit.labelSecondary}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <thead>
      <tr>
        <th
          className="print-sticky-x sticky left-0 top-0 z-50 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-3 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group/header"
          style={{
            position: "sticky",
            left: 0,
            top: 0,
            zIndex: 50,
            width: sideWidth,
            minWidth: sideWidth,
            maxWidth: sideWidth,
          }}
        >
          <div className="flex items-center gap-2">
            {isEditMode && (
              <label className="flex items-center justify-center p-1 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={(e) => onToggleSelectAll(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 bg-white cursor-pointer active:scale-95 transition-all touch-manipulation"
                />
              </label>
            )}
            <div className="flex flex-col items-center justify-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={toggleAll}
                className={cn(
                  "p-0.5 rounded shrink-0 active:scale-90 transition-all touch-manipulation cursor-pointer",
                  hasAnyExpanded
                    ? "text-slate-600 dark:text-[#c3c3c3] bg-slate-100 dark:bg-[#28282a] hover:bg-slate-200 dark:hover:bg-[#333336]"
                    : "text-slate-500 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a]"
                )}
                title={hasAnyExpanded ? "Thu gọn tất cả Dự án" : "Mở rộng tất cả Dự án"}
              >
                {hasAnyExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 pointer-events-none" />
                )}
              </button>
              <button
                type="button"
                onClick={toggleAllModular}
                className={cn(
                  "p-0.5 rounded shrink-0 active:scale-90 transition-all touch-manipulation cursor-pointer",
                  hasAnyModularExpanded
                    ? "bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-600 dark:hover:bg-purple-500 shadow-xs ring-1 ring-purple-400/50"
                    : "bg-purple-100 hover:bg-purple-200 text-purple-700 dark:bg-purple-900/60 dark:hover:bg-purple-900/90 dark:text-purple-200 border border-purple-300 dark:border-purple-600/70"
                )}
                title={hasAnyModularExpanded ? "Thu gọn tất cả Task Modular" : "Mở rộng tất cả Task Modular"}
              >
                {hasAnyModularExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 pointer-events-none" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 pointer-events-none" />
                )}
              </button>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase tracking-wider">
              Project / Task
            </span>
          </div>
          {/* Resizer handle */}
          <div
            className={cn(
              "absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-400 z-40 transition-colors pointer-events-auto",
              isResizingSide
                ? "bg-blue-500"
                : "bg-transparent group-hover/header:bg-slate-200 dark:group-hover/header:bg-slate-600",
            )}
            onMouseDown={startResizingSide}
          />
        </th>
        {showStart && (
          <th
            className="print-sticky-x sticky top-0 z-50 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-2 sm:p-2.5 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group/col"
            style={{
              position: "sticky",
              left: sideWidth,
              top: 0,
              zIndex: 50,
              width: startColWidth,
              minWidth: startColWidth,
              maxWidth: startColWidth,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-[#c3c3c3] uppercase tracking-wider truncate">
                {t('Start')}
              </span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("start");
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer opacity-70 hover:opacity-100 active:scale-90 print:hidden shrink-0"
                  title="Hide Start Date column"
                  aria-label="Hide Start Date"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </th>
        )}
        {showFinish && (
          <th
            className="print-sticky-x sticky top-0 z-50 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-2 sm:p-2.5 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group/col"
            style={{
              position: "sticky",
              left: sideWidth + (showStart ? startColWidth : 0),
              top: 0,
              zIndex: 50,
              width: finishColWidth,
              minWidth: finishColWidth,
              maxWidth: finishColWidth,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-[#c3c3c3] uppercase tracking-wider truncate">
                {t('Finish')}
              </span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("finish");
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer opacity-70 hover:opacity-100 active:scale-90 print:hidden shrink-0"
                  title="Hide Finish Date column"
                  aria-label="Hide Finish Date"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </th>
        )}
        {showParty && (
          <th
            className="print-sticky-x sticky top-0 z-50 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-2 sm:p-2.5 text-left shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group/col"
            style={{
              position: "sticky",
              left:
                sideWidth +
                (showStart ? startColWidth : 0) +
                (showFinish ? finishColWidth : 0),
              top: 0,
              zIndex: 50,
              width: partyColWidth,
              minWidth: partyColWidth,
              maxWidth: partyColWidth,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-[#c3c3c3] uppercase tracking-wider truncate">
                {t("Party")}
              </span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("party");
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer opacity-70 hover:opacity-100 active:scale-90 print:hidden shrink-0"
                  title="Hide Party column"
                  aria-label="Hide Party"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </th>
        )}
        {showDuration && (
          <th
            className="print-sticky-x sticky top-0 z-50 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-2 sm:p-2.5 text-center shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] group/col"
            style={{
              position: "sticky",
              left:
                sideWidth +
                (showStart ? startColWidth : 0) +
                (showFinish ? finishColWidth : 0) +
                (showParty ? partyColWidth : 0),
              top: 0,
              zIndex: 50,
              width: durationColWidth,
              minWidth: durationColWidth,
              maxWidth: durationColWidth,
            }}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-600 dark:text-[#c3c3c3] uppercase tracking-wider truncate">
                {t('Dur')}
              </span>
              {handleToggleColumn && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleColumn("duration");
                  }}
                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-all cursor-pointer opacity-70 hover:opacity-100 active:scale-90 print:hidden shrink-0"
                  title="Hide Duration column"
                  aria-label="Hide Duration"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </th>
        )}
        {timeUnits.map((unit) => {
          const width = unit.days * dayWidth;
          return (
            <th
              key={unit.date.getTime()}
              className="sticky top-0 z-40 bg-white dark:bg-[#1e1e20] border-b border-r border-slate-200 dark:border-[#444446] p-1 text-center overflow-hidden"
              style={{
                width: `${width}px`,
                minWidth: `${width}px`,
                maxWidth: `${width}px`,
              }}
            >
              <div className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3]">
                {unit.labelPrimary}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-[#838383]">
                {unit.labelSecondary}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
});
