import React from 'react';
import { Search, Loader2, Edit2, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
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
  handleClearFocus,
}: GanttToolbarProps) {
  const { t } = useLanguage();

  return (
    <div className="px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-[#1e1e20]/60 border-b border-slate-200 dark:border-[#333336] flex flex-col xl:flex-row gap-2.5 justify-between items-stretch xl:items-center shrink-0 print:hidden rounded-t-xl">
      {/* Filters Left Section */}
      <div className="flex flex-wrap items-center gap-2 flex-grow max-w-5xl">
        {/* Year Filter */}
        <select
          value={globalYearFilter}
          onChange={(e) => setGlobalYearFilter(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs rounded-lg p-2 outline-none shadow-xs min-w-[80px]"
        >
          <option value="all">{t('All Years')}</option>
          {uniqueYears.map((y) => (
            <option key={y} value={y}>{t('Year')} {y}</option>
          ))}
        </select>

        {/* Store Filter */}
        <select
          value={effectiveStore}
          onChange={(e) => setGlobalStoreFilter(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs rounded-lg p-2 outline-none shadow-xs min-w-[80px]"
        >
          {uniqueStores.length > 1 && <option value="all">{t('All Stores')}</option>}
          {uniqueStores.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Location Filter */}
        <MultiCheckboxSelect
          value={globalLocationFilter}
          onChange={setGlobalLocationFilter}
          options={locationOptions}
          placeholder={t('All Locations')}
          className="min-w-[95px]"
        />

        {/* Status Filter */}
        <select
          value={filterProjectStatus}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs rounded-lg p-2 outline-none shadow-xs min-w-[95px]"
        >
          <option value="all">{t('All Statuses')}</option>
          <option value="On process">{t('On process')}</option>
          <option value="On process + Upcoming 3 days">{t('On process + Upcoming 3 days')}</option>
          <option value="Upcoming">{t('Upcoming')}</option>
          <option value="Completed">{t('Completed')}</option>
          <option value="Handover">{t('Handover')}</option>
          <option value="Canceled">{t('Canceled')}</option>
        </select>

        {/* Search Input */}
        <div className="relative min-w-[150px] flex-1 max-w-xs">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-slate-400">
            <Search className="w-3.5 h-3.5" />
          </div>
          <DebouncedSearchInput
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder={t('Search Gantt...')}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs rounded-lg pl-8 pr-2.5 py-1.5 outline-none w-full shadow-xs focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Task loading spinner */}
        {isTasksLoading && (
          <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="hidden sm:inline">{t('Syncing tasks...')}</span>
          </div>
        )}

        {/* Focused Task clear button */}
        {(initialFocusTaskId || ganttTabFocusTaskId) && (
          <button
            type="button"
            onClick={handleClearFocus}
            className="flex items-center gap-1 px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 font-bold rounded-lg text-xs transition-colors"
          >
            <span>Focus Active</span>
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Right Controls: Timeline & Batch Actions */}
      <div className="flex flex-wrap items-center gap-2 justify-end">
        {/* Date Filter & View Mode Controls */}
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

        {/* Edit Mode & Batch Actions */}
        {canWrite && (
          <button
            type="button"
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn(
              "p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition-all active:scale-95",
              isEditMode
                ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#c3c3c3] hover:bg-slate-50"
            )}
            title={t('Toggle Edit / Batch Actions Mode')}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isEditMode ? t('Editing') : t('Edit')}</span>
          </button>
        )}

        {isEditMode && canWrite && (
          <GanttToolbarActions
            selectedProjectIds={selectedProjectIds}
            selectedTaskIds={selectedTaskIds}
            handleSetTextColor={handleSetTextColor}
            handleSetBaselineSelected={handleSetBaselineSelected}
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
        )}

        {/* Column Adder */}
        <ColumnAdder
          availableColumns={GANTT_AVAILABLE_COLUMNS}
          visibleColumns={visibleColumns}
          onAddColumn={handleToggleColumn}
        />
      </div>
    </div>
  );
}
