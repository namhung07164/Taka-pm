import React, { memo } from 'react';
import { Search, Plus, ExternalLink, ArrowLeft, X } from 'lucide-react';
import { ColumnAdder } from '../ColumnAdder';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { DelegatableItem } from './taskDelegationTypes';

interface TaskDelegationFilterToolbarProps {
  focusTarget: { groupId: string; subTaskId?: string } | null;
  setFocusTarget: (target: { groupId: string; subTaskId?: string } | null) => void;
  onBackFromFocus?: () => void;
  picOptions: string[];
  uniqueParties: string[];
  canWrite: boolean;
  handleAddCustomGroup: () => void;
  searchRef: React.RefObject<HTMLDivElement | null>;
  isSearchFocused: boolean;
  setIsSearchFocused: (focused: boolean) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchResults: DelegatableItem[];
  handleAddLinkedGroup: (item: DelegatableItem) => void;
  isAddingTask: Record<string, boolean>;
  filterFlowStatus: string;
  setFilterFlowStatus: (status: string) => void;
  filterParty: string;
  setFilterParty: (party: string) => void;
  multiSearchTerm: string;
  setMultiSearchTerm: (term: string) => void;
  availableColumnsForUser: Array<{ id: string; label: string }>;
  visibleColumns: string[];
  handleToggleColumn: (colId: string) => void;
}

export const TaskDelegationFilterToolbar = React.memo(function TaskDelegationFilterToolbar({
  focusTarget,
  setFocusTarget,
  onBackFromFocus,
  picOptions,
  uniqueParties,
  canWrite,
  handleAddCustomGroup,
  searchRef,
  isSearchFocused,
  setIsSearchFocused,
  searchTerm,
  setSearchTerm,
  searchResults,
  handleAddLinkedGroup,
  isAddingTask,
  filterFlowStatus,
  setFilterFlowStatus,
  filterParty,
  setFilterParty,
  multiSearchTerm,
  setMultiSearchTerm,
  availableColumnsForUser,
  visibleColumns,
  handleToggleColumn,
}: TaskDelegationFilterToolbarProps) {
  return (
    <>
      {focusTarget && (
        <>
          <div className="bg-yellow-50 dark:bg-yellow-900/40 border-b border-yellow-200 dark:border-yellow-700/50 px-4 py-2 flex items-center justify-between sticky top-0 z-50 shadow-sm print:hidden">
            <div className="text-yellow-800 dark:text-yellow-200 text-sm font-medium flex items-center gap-2">
              <span>Focus Mode Active</span>
              <button
                onClick={() => setFocusTarget(null)}
                className="hover:bg-yellow-200 dark:hover:bg-yellow-800 p-1 rounded-full transition-colors cursor-pointer"
                title="Clear Focus"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFocusTarget(null)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-yellow-200 dark:border-yellow-700/50 rounded-md text-xs font-medium text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800/50 transition-colors shadow-sm active:scale-95 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Clear Focus</span>
              </button>
              <button
                onClick={() => {
                  setFocusTarget(null);
                  onBackFromFocus?.();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#1e1e20] border border-yellow-200 dark:border-yellow-700/50 rounded-md text-xs font-medium text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-800/50 transition-colors shadow-sm active:scale-95 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Back to Source</span>
                <span className="sm:hidden">Back</span>
              </button>
            </div>
          </div>

          {/* Floating Action Buttons */}
          <div className="fixed bottom-24 right-4 md:bottom-8 md:right-8 z-[100] flex flex-col gap-2 items-end print:hidden pointer-events-none">
            <button
              onClick={() => setFocusTarget(null)}
              className="pointer-events-auto flex items-center gap-2 px-3 py-2 bg-slate-700/80 hover:bg-slate-800 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-white rounded-full shadow-lg transition-all active:scale-95 text-xs backdrop-blur-sm cursor-pointer"
              title="Clear Focus"
            >
              <X className="w-4 h-4" />
              <span className="font-semibold hidden md:inline">Clear Focus</span>
            </button>
            <button
              onClick={() => {
                setFocusTarget(null);
                onBackFromFocus?.();
              }}
              className="pointer-events-auto flex items-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white rounded-full shadow-xl transition-all active:scale-95 cursor-pointer"
              title="Back to Source"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold">Back</span>
            </button>
          </div>
        </>
      )}

      <datalist id="pic-list">
        {Array.from(new Set([...picOptions, ...uniqueParties]))
          .sort()
          .map((opt, i) => (
            <option key={i} value={opt} />
          ))}
      </datalist>

      <div className="flex flex-col md:flex-row flex-wrap gap-3 p-4 border-b border-slate-200 dark:border-[#444446] items-start md:items-center justify-between shrink-0 bg-slate-50 dark:bg-[#1e1e20]/50 rounded-t-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          {canWrite && (
            <button
              title="Add Custom"
              onClick={handleAddCustomGroup}
              className="flex items-center gap-1.5 bg-blue-600 dark:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap cursor-pointer active:scale-95 touch-manipulation"
            >
              <Plus className="w-4 h-4" />
              <span>Custom Delegation</span>
            </button>
          )}

          {/* Search Task to Link */}
          {canWrite && (
            <div className="relative flex-grow md:w-64" ref={searchRef as React.RefObject<HTMLDivElement>}>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <DebouncedSearchInput
                  placeholder="Link Project/Task..."
                  value={searchTerm}
                  onChange={(val) => setSearchTerm(val)}
                  onFocus={() => setIsSearchFocused(true)}
                  debounceMs={250}
                  className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-800 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 py-2 outline-none shadow-sm"
                />
              </div>

              {isSearchFocused && (
                <div className="absolute left-0 mt-1 w-full md:w-80 bg-white dark:bg-[#1e1e20] rounded-lg shadow-xl border border-slate-200 dark:border-[#444446] z-50 max-h-60 overflow-y-auto">
                  <div className="p-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-[#333336]">
                    Available Items
                  </div>
                  {searchResults.length === 0 ? (
                    <div className="p-3 text-sm text-slate-500 text-center">No delegatable items found</div>
                  ) : (
                    searchResults.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        onClick={() => handleAddLinkedGroup(item)}
                        className={`p-2 hover:bg-slate-50 dark:hover:bg-[#28282a] border-b border-slate-100 dark:border-[#333336] last:border-none flex items-center justify-between transition-colors ${
                          isAddingTask[item.id] ? 'opacity-50 pointer-events-none' : 'cursor-pointer'
                        }`}
                      >
                        <div className="flex flex-col flex-1 min-w-0 pr-2">
                          <span className="font-medium text-sm text-slate-800 dark:text-[#e3e3e3] truncate">
                            {item.name}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-blue-600 dark:text-[#8ab4f8]">
                              {item.projectStore ? `${item.projectStore} - ` : ''}
                              {item.projectCode}
                            </span>
                            {item.projectName && <span className="truncate">• {item.projectName}</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              item.type === 'project'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {item.type}
                          </span>
                          <button
                            disabled={isAddingTask[item.id]}
                            className="p-1 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-blue-600 dark:text-[#8ab4f8] rounded"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Tracker Search & Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
          <select
            value={filterFlowStatus}
            onChange={(e) => setFilterFlowStatus(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#e3e3e3] text-sm rounded-lg px-2.5 py-2 outline-none shadow-sm focus:ring-2 focus:ring-blue-500 font-medium"
          >
            <option value="all">Status Flow: All</option>
            <option value="active_only">Active Only (Excl. Completed)</option>
            <option value="assigned_inprogress">Assigned & In Progress</option>
            <option value="pending_rejected">Pending & Rejected</option>
            <option value="completed">Completed Only</option>
          </select>

          <select
            value={filterParty}
            onChange={(e) => setFilterParty(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-700 dark:text-[#e3e3e3] text-sm rounded-lg px-2.5 py-2 outline-none shadow-sm focus:ring-2 focus:ring-blue-500 font-medium max-w-[150px] truncate"
          >
            <option value="">PIC: All</option>
            <option value="unassigned">Unassigned</option>
            {uniqueParties.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <div className="relative flex-grow md:w-64">
            <DebouncedSearchInput
              value={multiSearchTerm}
              onChange={setMultiSearchTerm}
              placeholder="Search tracker..."
              className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-800 dark:text-[#e3e3e3] text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block w-full pl-9 pr-3 py-2 outline-none shadow-sm"
            />
          </div>

          <ColumnAdder
            availableColumns={availableColumnsForUser}
            visibleColumns={visibleColumns}
            onAddColumn={handleToggleColumn}
          />
        </div>
      </div>
    </>
  );
});
