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
    <div className="p-2 sm:p-3 bg-[#141416] dark:bg-[#121214] border-b border-slate-800 flex flex-col gap-2 shrink-0 print:hidden rounded-t-xl text-slate-100">
      {/* Row 1: 4 Compact Filter Boxes in 2x2 grid on mobile and 4 cols on desktop */}
      <div className="flex flex-col lg:flex-row gap-2 justify-between items-stretch lg:items-center w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 flex-grow w-full">
          {/* Col 1: Year */}
          <select
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="w-full bg-[#1c1c1e] dark:bg-[#1a1a1c] border border-slate-700/80 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
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
            className="w-full bg-[#1c1c1e] dark:bg-[#1a1a1c] border border-slate-700/80 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
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
            className="w-full bg-[#1c1c1e] dark:bg-[#1a1a1c] border border-slate-700/80 rounded-lg text-xs"
          />

          {/* Col 4: Status */}
          <select
            value={filterProjectStatus}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="w-full bg-[#1c1c1e] dark:bg-[#1a1a1c] border border-slate-700/80 text-white text-xs rounded-lg px-2.5 py-1.5 outline-none shadow-xs font-medium cursor-pointer h-8"
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

        {/* Action Buttons: Highlight Me & Edit Mode */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsHighlightDelegationOn(!isHighlightDelegationOn)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs border active:scale-95 cursor-pointer h-8",
              isHighlightDelegationOn
                ? "bg-[#2d2415] border-amber-500 text-amber-300 ring-1 ring-amber-500/50"
                : "bg-[#1c1c1e] border-slate-700/80 text-amber-400 hover:bg-[#252528]"
            )}
            title={t('Highlight My Tasks')}
          >
            <span className="text-amber-400 text-xs">🎯</span>
            <span>Highlight Me</span>
          </button>

          <button
            type="button"
            onClick={() => setIsEditMode(!isEditMode)}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs border active:scale-95 cursor-pointer h-8",
              isEditMode
                ? "bg-blue-600 border-blue-500 text-white shadow-md ring-1 ring-blue-400"
                : "bg-[#1c1c1e] border-slate-700/80 text-blue-400 hover:bg-[#252528]"
            )}
            title={t('Toggle Edit / Batch Actions Mode')}
          >
            <Edit2 className="w-3.5 h-3.5 text-blue-400" />
            <span>Edit Mode</span>
          </button>
        </div>
      </div>

      {/* Row 2: Action Toolbar (Date Filter, + Add Column, Today, View Toggle, Scale input & slider) */}
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

          {/* Edit Mode Batch Actions (Color, Baseline, Modular group, Sum, Hide, Delete, Export) */}
          {isEditMode && (
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

          {/* Task loading spinner */}
          {isTasksLoading && (
            <div className="flex items-center gap-1 text-xs text-blue-400 font-semibold animate-pulse ml-auto">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{t('Syncing...')}</span>
            </div>
          )}

          {/* Focused Task clear button */}
          {(initialFocusTaskId || ganttTabFocusTaskId) && (
            <button
              type="button"
              onClick={handleClearFocus}
              className="flex items-center gap-1 px-2 py-1 bg-amber-950/70 text-amber-300 border border-amber-800/80 font-bold rounded-lg text-xs transition-colors"
            >
              <span>Focus Active</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Zoom Slider below Date Filter & Add Column */}
        <div className="flex items-center gap-2 pl-0.5">
          <input
            type="range"
            min="4"
            max="40"
            value={dayWidth}
            onChange={(e) => {
              const num = Number(e.target.value);
              setDayWidth(num);
              setScaleInput(String(Math.round((num / 8) * 75)));
              setIsWidthChanged(true);
            }}
            className="w-24 sm:w-32 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>

      {/* Row 3: Full-width Search Bar */}
      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 z-10">
          <Search className="w-3.5 h-3.5" />
        </div>
        <DebouncedSearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search or ... ( + AND, , OR )"
          className="w-full bg-[#18181a] dark:bg-[#161618] border border-slate-700/80 text-white placeholder-slate-400 text-xs rounded-lg pl-8 pr-8 py-1.5 outline-none shadow-inner focus:ring-1 focus:ring-blue-500 focus:border-blue-500 h-8 font-medium"
        />
      </div>
    </div>
  );
}
