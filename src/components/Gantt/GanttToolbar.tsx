import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Calendar,
  Loader2,
  Target,
  Edit2,
  Palette,
  Play,
  Layers,
  Trash2,
  GripVertical,
  EyeOff,
  Eye,
  X,
  Save,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLanguage } from '../../lib/LanguageContext';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { ColumnAdder } from '../ColumnAdder';
import { DebouncedSearchInput } from '../DebouncedSearchInput';

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

  viewMode: "weekly" | "monthly" | "quarterly";
  setViewMode: (mode: "weekly" | "monthly" | "quarterly") => void;

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

export const GanttToolbar: React.FC<GanttToolbarProps> = React.memo(({
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
  handleToggleRealtimeUpdate,
  setIsTaskModularModalOpen,
  sumMode,
  setSumMode,
  handleDeleteSelected,
  handleDragStart,
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
}) => {
  const { t } = useLanguage();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const dateFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutsideDate = (e: MouseEvent) => {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target as Node)) {
        setIsDateFilterOpen(false);
      }
    };
    if (isDateFilterOpen) {
      document.addEventListener("mousedown", handleClickOutsideDate);
    }
    return () => document.removeEventListener("mousedown", handleClickOutsideDate);
  }, [isDateFilterOpen]);

  return (
    <div className="px-5 pt-4 pb-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col gap-4 shrink-0 print:hidden">
      <div className="flex flex-col xl:flex-row gap-4 justify-between items-start xl:items-center">
        <div className="flex flex-wrap gap-3 w-full xl:w-auto flex-grow max-w-2xl">
          <select
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[100px] flex-[1_1_45%] xl:flex-none"
          >
            <option value="all">{t("All Years")}</option>
            {uniqueYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[100px] flex-[1_1_45%] xl:flex-none"
          >
            {uniqueStores.length > 1 && <option value="all">{t("All Stores")}</option>}
            {uniqueStores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <MultiCheckboxSelect
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationOptions}
            placeholder={t("All Locations")}
            className="min-w-[100px] flex-[1_1_45%] xl:flex-none"
          />

          <select
            value={filterProjectStatus}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[100px] flex-[1_1_45%] xl:flex-none"
          >
            <option value="active">On Process & Upcoming</option>
            <option value="On process">{t("On Process")}</option>
            <option value="Upcoming">{t("Upcoming")}</option>
            <option value="Completed">{t("Completed")}</option>
            <option value="all">All Status</option>
          </select>

          {isTasksLoading && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800 shadow-sm animate-pulse shrink-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>{t("Loading tasks...") || "Loading tasks..."}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:justify-end ml-auto">
          {canWrite && !isEditMode && (
            <div className="fixed top-[76px] xl:top-[84px] right-4 md:right-8 z-50 flex flex-row gap-2 justify-end items-start print:hidden">
              <div className="relative group">
                <button
                  onClick={() => setIsHighlightDelegationOn(!isHighlightDelegationOn)}
                  className={cn("flex items-center justify-center gap-1.5 px-3 py-2 border rounded-lg font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs",
                    isHighlightDelegationOn ? "bg-yellow-400 text-yellow-900 border-yellow-500 hover:bg-yellow-500" : "bg-white dark:bg-[#1e1e20] border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#e3e3e3] hover:bg-slate-50 dark:hover:bg-[#28282a]"
                  )}
                  title="Highlight My Tasks"
                >
                  <Target className={cn("w-4 h-4 pointer-events-none", isHighlightDelegationOn ? "text-yellow-900" : "text-yellow-500")} />
                  <span className="hidden sm:inline pointer-events-none">
                    Highlight Me
                  </span>
                </button>
                {isHighlightDelegationOn && (
                  <div className="absolute top-full right-0 mt-2 p-2 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-lg shadow-xl text-xs whitespace-nowrap z-[100] hidden group-hover:block">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3 h-3 rounded-full border-2 border-yellow-400 bg-yellow-400/20 shadow-[0_0_5px_rgba(250,204,21,0.7)]" />
                      <span className="text-slate-700 dark:text-[#e3e3e3] font-medium">As Assignee</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border-2 border-purple-400 bg-purple-400/20 shadow-[0_0_5px_rgba(192,132,252,0.7)]" />
                      <span className="text-slate-700 dark:text-[#e3e3e3] font-medium">As Creator</span>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setIsEditMode(true);
                  setIsHideMode(false);
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-800 dark:bg-[#1e1e20] border border-slate-700 dark:border-[#444446] text-white dark:text-[#e3e3e3] rounded-lg hover:bg-slate-700 dark:hover:bg-[#28282a]/50 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs"
                title="Edit Mode"
              >
                <Edit2 className="w-4 h-4 text-blue-400 pointer-events-none" />
                <span className="hidden sm:inline pointer-events-none">
                  Edit Mode
                </span>
              </button>
            </div>
          )}

          {canWrite && isEditMode && (
            <div className="fixed top-[76px] xl:top-[84px] left-1/2 -translate-x-1/2 z-[100] flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-2xl shadow-xl backdrop-blur-md bg-opacity-90 w-[calc(100vw-1rem)] sm:w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] print:hidden">
              <div className="hidden sm:block text-sm font-bold text-slate-700 dark:text-[#e3e3e3] mr-2 shrink-0">
                Edit Mode
              </div>

              <div className="grid grid-cols-4 items-center gap-1.5 border-r border-slate-200 dark:border-[#444446] pr-3 mr-1 shrink-0">
                {[
                  "#ef4444",
                  "#f97316",
                  "#eab308",
                  "#22c55e",
                  "#3b82f6",
                  "#a855f7",
                ].map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => handleSetTextColor(color)}
                    disabled={
                      selectedProjectIds.length === 0 &&
                      selectedTaskIds.length === 0
                    }
                    className="w-5 h-5 rounded border border-black/10 shadow-sm disabled:opacity-50 transition-transform active:scale-95"
                    style={{ backgroundColor: color }}
                    title={`Set text color ${color}`}
                  />
                ))}
                <label
                  className="flex items-center justify-center w-5 h-5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-[#1e1e20] shadow-sm cursor-pointer hover:bg-slate-50 relative"
                  title="Custom color"
                >
                  <Palette className="w-3 h-3 text-slate-500" />
                  <input
                    type="color"
                    onBlur={(e) => handleSetTextColor(e.target.value)}
                    disabled={
                      selectedProjectIds.length === 0 &&
                      selectedTaskIds.length === 0
                    }
                    className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => handleSetTextColor(null)}
                  disabled={
                    selectedProjectIds.length === 0 &&
                    selectedTaskIds.length === 0
                  }
                  className="flex items-center justify-center w-5 h-5 text-[9px] uppercase font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  title="Clear color"
                >
                  X
                </button>
              </div>

              <button
                type="button"
                onClick={handleSetBaselineSelected}
                disabled={
                  selectedProjectIds.length === 0 &&
                  selectedTaskIds.length === 0
                }
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-slate-50 dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#a3a3a3] rounded-lg hover:bg-slate-100 dark:hover:bg-[#28282a] font-bold transition-colors text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer touch-manipulation"
                title="Set Baseline for Selected"
              >
                <Target className="w-3.5 h-3.5 pointer-events-none" />
                <span className="hidden sm:inline pointer-events-none">
                  Set Baseline
                </span>
              </button>
              <button
                type="button"
                onClick={handleToggleRealtimeUpdate}
                disabled={
                  selectedProjectIds.length === 0 &&
                  selectedTaskIds.length === 0
                }
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 font-bold transition-colors text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer touch-manipulation"
                title="Toggle Task flexible"
              >
                <Play className="w-3.5 h-3.5 pointer-events-none fill-current" />
                <span className="hidden sm:inline pointer-events-none">
                  Task flexible
                </span>
              </button>
              <button
                type="button"
                onClick={() => setIsTaskModularModalOpen(true)}
                disabled={selectedTaskIds.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-purple-700 dark:text-purple-300 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-500/20 font-bold transition-all text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer touch-manipulation active:scale-95"
                title="Task Modular (Hợp các task con vào 1 task mẹ)"
              >
                <Layers className="w-3.5 h-3.5 pointer-events-none" />
                <span className="hidden sm:inline pointer-events-none">
                  Task Modular
                </span>
                {selectedTaskIds.length > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] bg-purple-600 text-white rounded-full font-extrabold">
                    {selectedTaskIds.length}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={sumMode}
                  onChange={(e) => setSumMode(e.target.value as "none" | "duration")}
                  className="px-2 py-1.5 min-h-[44px] bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20 font-bold transition-colors text-xs shadow-sm cursor-pointer outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="none">Sum none</option>
                  <option value="duration">Sum Dur</option>
                </select>
              </div>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={
                  selectedProjectIds.length === 0 &&
                  selectedTaskIds.length === 0
                }
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-500/20 font-bold transition-all text-xs shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer touch-manipulation active:scale-95"
                title="Delete Selected"
              >
                <Trash2 className="w-3.5 h-3.5 pointer-events-none" />
                <span className="hidden sm:inline pointer-events-none">{t("Delete")}</span>
              </button>
              <div
                draggable
                onDragStart={handleDragStart}
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-slate-50 dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-600 dark:text-[#a3a3a3] rounded-lg text-xs shadow-sm cursor-grab active:cursor-grabbing hover:bg-slate-100 shrink-0 font-bold select-none touch-manipulation"
                title="Drag to move selected items"
              >
                Drag{" "}
                <GripVertical className="w-3.5 h-3.5 text-slate-400 inline pointer-events-none" />{" "}
                <span className="hidden sm:inline pointer-events-none">
                  to Move
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsHideMode(!isHideMode)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 min-h-[44px] text-xs font-bold rounded-lg transition-colors border shadow-sm shrink-0 touch-manipulation cursor-pointer",
                  isHideMode
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                    : "bg-slate-50 dark:bg-[#1e1e20] text-slate-700 dark:text-[#a3a3a3] hover:bg-slate-100 dark:hover:bg-[#28282a] border-slate-200 dark:border-[#444446]",
                )}
                title="Hide Rows"
              >
                <EyeOff className="w-3.5 h-3.5 pointer-events-none" />
                <span className="hidden sm:inline pointer-events-none">
                  {isHideMode ? "Done Hiding" : "Hide Rows"}
                </span>
              </button>
              <button
                id="gantt-export-pdf-btn"
                type="button"
                onClick={handleExportToPDF}
                disabled={isExporting}
                className="hidden"
              >
                {isExporting ? "Exporting..." : "Export"}
              </button>
              {hiddenRows.length > 0 && !isHideMode && (
                <button
                  type="button"
                  onClick={() => setHiddenRows([])}
                  className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-slate-50 dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#a3a3a3] rounded-lg hover:bg-slate-100 dark:hover:bg-[#28282a] font-bold transition-colors text-xs shadow-sm shrink-0 touch-manipulation cursor-pointer"
                  title="Clear Hidden"
                >
                  <Eye className="w-3.5 h-3.5 pointer-events-none" />
                  <span className="hidden sm:inline pointer-events-none">
                    Clear Hidden ({hiddenRows.length})
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsEditMode(false);
                  setIsHideMode(false);
                  setSelectedProjectIds([]);
                  setSelectedTaskIds([]);
                }}
                className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-slate-100 dark:bg-[#1e1e20] border border-slate-300 dark:border-[#555557] text-slate-700 dark:text-[#e3e3e3] rounded-lg hover:bg-slate-200 dark:hover:bg-[#333336] font-bold transition-colors text-xs shadow-sm shrink-0 cursor-pointer touch-manipulation"
              >
                <X className="w-3.5 h-3.5 pointer-events-none" />
                <span className="pointer-events-none">Done</span>
              </button>
            </div>
          )}

          {/* Date Filter */}
          <div className="relative shrink-0" ref={dateFilterRef}>
            <button 
              type="button"
              onClick={() => setIsDateFilterOpen(!isDateFilterOpen)} 
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all border active:scale-95 shadow-sm shrink-0",
                (tempStartDate || tempEndDate)
                  ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  : "bg-white dark:bg-[#28282a] text-slate-700 dark:text-[#e3e3e3] border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#333336]"
              )}
              title="Date Filter"
            >
              <Calendar className={cn("w-3.5 h-3.5", (tempStartDate || tempEndDate) ? "text-white" : "text-blue-500")} />
              <span>Date Filter {(tempStartDate || tempEndDate) && '•'}</span>
            </button>
            {isDateFilterOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] shadow-xl rounded-lg p-3 z-[110] flex flex-col gap-3 min-w-[220px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Date Filter</span>
                  {(tempStartDate || tempEndDate) && (
                    <button
                      type="button"
                      onClick={() => {
                        setTempStartDate('');
                        setTempEndDate('');
                        setFilterStartDate('');
                        setFilterEndDate('');
                        setIsDateFilterOpen(false);
                      }}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Start Date</label>
                  <input
                    type="date"
                    value={tempStartDate}
                    onChange={e => setTempStartDate(e.target.value)}
                    className="p-1.5 text-xs rounded border border-slate-200 dark:border-[#444446] dark:bg-[#232325] outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Finish Date</label>
                  <input
                    type="date"
                    value={tempEndDate}
                    onChange={e => setTempEndDate(e.target.value)}
                    className="p-1.5 text-xs rounded border border-slate-200 dark:border-[#444446] dark:bg-[#232325] outline-none text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>
            )}
          </div>

          <ColumnAdder
            availableColumns={[
              { id: "start", label: "Start Date" },
              { id: "finish", label: "End Date" },
              { id: "party", label: "Party" },
              { id: "duration", label: "Duration" },
            ]}
            visibleColumns={visibleColumns || []}
            onAddColumn={handleToggleColumn}
          />

          <button
            onClick={handleTodayClick}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-[#28282a] text-slate-700 dark:text-[#e3e3e3] text-xs font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-[#333336] transition-colors border border-slate-200 dark:border-[#444446] active:scale-95 shadow-sm"
            title="Center timeline on Today"
          >
            <Calendar className="w-3.5 h-3.5 text-rose-500" />
            <span>Today</span>
          </button>

          <span className="text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase">
            View
          </span>
          <input
            type="range"
            min="0"
            max="2"
            step="1"
            value={viewMode === "weekly" ? 0 : viewMode === "monthly" ? 1 : 2}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              setViewMode(val === 0 ? "weekly" : val === 1 ? "monthly" : "quarterly");
            }}
            className="w-16"
            title={viewMode === "weekly" ? "Weekly View" : viewMode === "monthly" ? "Monthly View" : "Quarterly View"}
          />
          <span className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3] w-16 text-center">
            {viewMode === "weekly" ? "Weekly" : viewMode === "monthly" ? "Monthly" : "Quarterly"}
          </span>

          <span className="text-xs font-bold text-slate-500 dark:text-[#a3a3a3] uppercase ml-2 flex items-center gap-1">
            Scale 
            <input
               type="number"
               value={scaleInput}
               onFocus={(e) => e.target.select()}
               onChange={(e) => setScaleInput(e.target.value)}
               onBlur={() => {
                  const pct = parseInt(scaleInput, 10);
                  if (!isNaN(pct)) {
                     const newWidth = Math.max(1, Math.min(20, (pct / 100) * 4));
                     setDayWidth(newWidth);
                     setScaleInput(Math.round((newWidth / 4) * 100).toString());
                     setIsWidthChanged(true);
                  } else {
                     setScaleInput(Math.round((dayWidth / 4) * 100).toString());
                  }
               }}
               onKeyDown={(e) => {
                  if (e.key === "Enter") {
                     e.currentTarget.blur();
                  }
               }}
               className="w-14 px-1 py-0.5 text-center font-bold border border-slate-200 dark:border-[#444446] rounded bg-white dark:bg-[#131314] text-slate-800 dark:text-[#e3e3e3] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 hide-arrows transition-colors"
            />%
          </span>
          <input
            type="range"
            min="25"
            max="500"
            step="1"
            value={Math.round((dayWidth / 4) * 100)}
            onChange={(e) => {
              const pct = parseInt(e.target.value, 10);
              const newWidth = (pct / 100) * 4;
              setDayWidth(newWidth);
              setIsWidthChanged(true);
            }}
            className="w-24 accent-blue-500 cursor-pointer"
          />
          {isWidthChanged && (
            <button
              title="Fix"
              onClick={saveDayWidth}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Save className="w-3 h-3" /> Fix
            </button>
          )}
        </div>
      </div>

      <div className="relative w-full">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 dark:text-[#838383] z-10">
          <Search className="w-4 h-4" />
        </div>
        <DebouncedSearchInput
          placeholder="Search or ... ( + AND, , OR )"
          value={searchTerm}
          onChange={(val) => {
            setSearchTerm(val);
            if (!val || val.trim() === "") {
              if (initialFocusTaskId || ganttTabFocusTaskId) {
                handleClearFocus();
              }
            }
          }}
          className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
        />
      </div>
    </div>
  );
});
