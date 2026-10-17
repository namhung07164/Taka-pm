import React, { Dispatch, SetStateAction, useMemo } from 'react';
import { Search, Loader2, Edit2, X, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { useAppStore } from '../../store/useAppStore';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { ColumnAdder } from '../ColumnAdder';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { ViewMode } from './ganttTypes';
import { GanttToolbarActions } from './GanttToolbarActions';
import { GanttToolbarDateFilter } from './GanttToolbarDateFilter';

const GANTT_AVAILABLE_COLUMNS = [
  { id: 'start', label: 'Start' },
  { id: 'finish', label: 'Finish' },
  { id: 'party', label: 'Party' },
  { id: 'duration', label: 'Duration' },
  { id: 'predecessor', label: 'Predecessor' },
];

export interface GanttToolbarProps {
  // Year & Store & Location & Status filters
  globalYearFilter: string;
  setGlobalYearFilter: (year: string) => void;
  uniqueYears: string[];

  effectiveStore: string;
  setGlobalStoreFilter: (store: string) => void;
  uniqueStores: string[];

  globalLocationFilter: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  locationOptions: string[];

  filterProjectStatus: string;
  onStatusFilterChange: (status: string) => void;

  isTasksLoading: boolean;

  // Delegation Highlight
  canWrite: boolean;
  isEditMode: boolean;
  setIsEditMode: (val: boolean) => void;
  isHighlightDelegationOn: boolean;
  setIsHighlightDelegationOn: (val: boolean) => void;

  // Edit Mode actions
  selectedProjectIds: string[];
  selectedTaskIds: string[];
  setSelectedProjectIds: (ids: string[]) => void;
  setSelectedTaskIds: React.Dispatch<React.SetStateAction<string[]>>;
  handleSetTextColor: (color: string | null) => void;
  handleSetBaselineSelected: () => void;
  handleToggleRealtimeUpdate: () => void;
  handleUnlinkModularTasks?: (childTaskIds?: string[]) => void | Promise<void>;
  isTaskModularModalOpen?: boolean;
  setIsTaskModularModalOpen: (val: boolean) => void;
  sumMode: "none" | "duration";
  setSumMode: (val: "none" | "duration") => void;
  handleDeleteSelected: () => void;
  handleDragStart: (e: React.DragEvent) => void;
  isHideMode: boolean;
  setIsHideMode: (val: boolean) => void;
  hiddenRows: string[];
  setHiddenRows: (rows: string[]) => void;
  handleExportToPDF: () => void;
  isExporting: boolean;

  // Date Filter
  tempStartDate: string;
  setTempStartDate: (val: string) => void;
  tempEndDate: string;
  setTempEndDate: (val: string) => void;
  setFilterStartDate: (val: string) => void;
  setFilterEndDate: (val: string) => void;

  // Columns & View Controls
  visibleColumns: string[];
  handleToggleColumn: (colId: string) => void;
  handleTodayClick: () => void;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  scaleInput: string;
  setScaleInput: (val: string) => void;
  dayWidth: number;
  setDayWidth: (val: number) => void;
  isWidthChanged: boolean;
  setIsWidthChanged: (val: boolean) => void;
  saveDayWidth: () => void;

  // Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  initialFocusTaskId?: string;
  ganttTabFocusTaskId?: string | null;
  ganttTabFilterProjectId?: string | null;
  handleClearFocus: () => void;
}

export function GanttToolbar({
  globalYearFilter,
  setGlobalYearFilter,
  uniqueYears,
  effectiveStore,
  setGlobalStoreFilter,
  uniqueStores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationOptions,
  filterProjectStatus,
  onStatusFilterChange,
  isTasksLoading,
  canWrite,
  isEditMode,
  setIsEditMode,
  isHighlightDelegationOn,
  setIsHighlightDelegationOn,
  selectedProjectIds,
  selectedTaskIds,
  setSelectedProjectIds,
  setSelectedTaskIds,
  handleSetTextColor,
  handleSetBaselineSelected,
  handleUnlinkModularTasks,
  isTaskModularModalOpen = false,
  setIsTaskModularModalOpen,
  sumMode,
  setSumMode,
  handleDeleteSelected,
  isHideMode,
  setIsHideMode,
  hiddenRows,
  setHiddenRows,
  handleExportToPDF,
  isExporting,
  tempStartDate,
  setTempStartDate,
  tempEndDate,
  setTempEndDate,
  setFilterStartDate,
  setFilterEndDate,
  visibleColumns,
  handleToggleColumn,
  handleTodayClick,
  viewMode,
  setViewMode,
  scaleInput,
  setScaleInput,
  dayWidth,
  setDayWidth,
  isWidthChanged,
  setIsWidthChanged,
  saveDayWidth,
  searchTerm,
  setSearchTerm,
  initialFocusTaskId,
  ganttTabFocusTaskId,
  ganttTabFilterProjectId,
  handleClearFocus,
}: GanttToolbarProps) {
  const { t } = useLanguage();
  const tasks = useAppStore((state) => state.tasks);

  const activeFocusTaskId = initialFocusTaskId || ganttTabFocusTaskId;
  const focusedTask = React.useMemo(() => {
    if (!activeFocusTaskId || !tasks) return null;
    return tasks.find(t => String(t.id) === String(activeFocusTaskId)) || null;
  }, [activeFocusTaskId, tasks]);

  return (
    <div className="p-2 sm:p-3 bg-slate-100 dark:bg-[#121214] border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2 shrink-0 print:hidden rounded-t-xl text-slate-800 dark:text-slate-100">
      {/* Row 1: 4 Compact Filter Boxes in 2x2 grid on mobile and 4 cols on desktop */}
      <div className="flex flex-col lg:flex-row gap-2 justify-between items-stretch lg:items-center w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-grow w-full">
          {/* Col 1: Year */}
          <select
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            <option value="all">{t('All Years')}</option>
            {uniqueYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Col 2: Store */}
          <select
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            {uniqueStores.length > 1 && <option value="all">{t('All Stores')}</option>}
            {uniqueStores.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Col 3: Location */}
          <MultiCheckboxSelect
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder={t('All Locations')}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 rounded-lg text-xs"
          />

          {/* Col 4: Status */}
          <select
            value={filterProjectStatus}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="w-full bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-slate-700/80 text-slate-800 dark:text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
          >
            <option value="all">{t('All Statuses')}</option>
            <option value="On process & Upcoming">{t('On Process & Upcoming')}</option>
            <option value="On process">{t('On process')}</option>
            <option value="On process + Upcoming 3 days">{t('On process + Upcoming 3 days')}</option>
            <option value="Upcoming">{t('Upcoming')}</option>
            <option value="Completed">{t('Completed')}</option>
            <option value="Handover">{t('Handover')}</option>
            <option value="Canceled">{t('Canceled')}</option>
          </select>
        </div>

      {/* Floating Sticky Edit Mode Button - Moved to bottom-16 right-4 */}
      {canWrite && !isEditMode && !isTaskModularModalOpen && (
        <div className="fixed bottom-16 right-4 z-40 flex flex-row gap-2 justify-end items-start print:hidden pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsEditMode(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 dark:bg-blue-600 border border-blue-400 text-white hover:bg-blue-700 dark:hover:bg-blue-500 rounded-xl font-bold transition-all shadow-2xl hover:scale-105 active:scale-95 shrink-0 touch-manipulation text-xs cursor-pointer ring-2 ring-blue-500/30"
            title="Edit Mode"
          >
            <Edit2 className="w-4 h-4 text-white pointer-events-none" />
            <span className="pointer-events-none">
              Edit Mode
            </span>
          </button>
        </div>
      )}

      {canWrite && isEditMode && !isTaskModularModalOpen && (
        <div className="fixed top-[154px] sm:top-[160px] left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-2.5 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-2xl shadow-2xl backdrop-blur-md bg-opacity-95 w-[calc(100vw-1rem)] sm:w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] print:hidden pointer-events-auto">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 shrink-0">
            <Edit2 className="w-3.5 h-3.5 text-blue-500" />
            <span>Editing Mode</span>
          </div>

          {/* Highlight Me Button INSIDE Edit Mode Panel */}
          <button
            type="button"
            onClick={() => setIsHighlightDelegationOn(!isHighlightDelegationOn)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs border active:scale-95 cursor-pointer h-8 shrink-0",
              isHighlightDelegationOn
                ? "bg-amber-100 dark:bg-[#2d2415] border-amber-500 text-amber-900 dark:text-amber-300 ring-1 ring-amber-500/50 font-extrabold"
                : "bg-slate-100 dark:bg-[#1c1c1e] border-slate-300 dark:border-slate-700/80 text-amber-600 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-[#252528]"
            )}
            title={t('Highlight My Tasks')}
          >
            <span className="text-amber-500 dark:text-amber-400 text-xs">🎯</span>
            <span>Highlight Me</span>
          </button>

          {/* Edit Mode Batch Actions */}
          <GanttToolbarActions
            selectedProjectIds={selectedProjectIds}
            selectedTaskIds={selectedTaskIds}
            handleSetTextColor={handleSetTextColor}
            handleSetBaselineSelected={handleSetBaselineSelected}
            handleUnlinkModularTasks={handleUnlinkModularTasks}
            setIsTaskModularModalOpen={setIsTaskModularModalOpen}
            sumMode={sumMode}
            setSumMode={setSumMode}
            handleDeleteSelected={handleDeleteSelected}
            isHideMode={isHideMode}
            setIsHideMode={setIsHideMode}
            hiddenRows={hiddenRows}
            setHiddenRows={setHiddenRows}
            handleExportToPDF={handleExportToPDF}
            isExporting={isExporting}
          />

          {/* Close Edit Mode button */}
          <button
            type="button"
            onClick={() => setIsEditMode(false)}
            className="flex items-center justify-center gap-1 px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-[#38383c] dark:hover:bg-[#444448] text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs transition-colors shrink-0 cursor-pointer active:scale-95"
            title="Done / Exit Edit Mode"
          >
            <span>Done</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      </div>

      {/* Row 2: Action Toolbar (Date Filter, + Add Column, Today) */}
      <div className="flex flex-col gap-1 w-full">
        <div className="flex flex-wrap items-center gap-2 justify-between w-full">
          <div className="flex flex-wrap items-center gap-2">
            <GanttToolbarDateFilter
              handleTodayClick={handleTodayClick}
              viewMode={viewMode}
              setViewMode={setViewMode}
              scaleInput={scaleInput}
              setScaleInput={setScaleInput}
              dayWidth={dayWidth}
              setDayWidth={setDayWidth}
              isWidthChanged={isWidthChanged}
              setIsWidthChanged={setIsWidthChanged}
              saveDayWidth={saveDayWidth}
              tempStartDate={tempStartDate}
              setTempStartDate={setTempStartDate}
              tempEndDate={tempEndDate}
              setTempEndDate={setTempEndDate}
              setFilterStartDate={setFilterStartDate}
              setFilterEndDate={setFilterEndDate}
            />

            <ColumnAdder
              availableColumns={GANTT_AVAILABLE_COLUMNS}
              visibleColumns={visibleColumns}
              onAddColumn={handleToggleColumn}
            />
          </div>

          {/* Task loading spinner - Only on cold start when no cached tasks exist */}
          {isTasksLoading && (!tasks || tasks.length === 0) && (
            <div className="flex items-center gap-1 text-xs text-blue-400 font-semibold animate-pulse ml-auto">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('Syncing...')}</span>
            </div>
          )}


        </div>
      </div>

      {/* Row 3: Full-width Search Bar */}
      <div className="relative w-full">
        <DebouncedSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search or ... ( + AND, , OR )"
        />
      </div>
    </div>
  );
}
