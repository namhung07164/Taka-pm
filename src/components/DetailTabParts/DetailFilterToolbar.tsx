import React, { memo } from 'react';
import { Search, Edit3, Plus, Wand2, Hash, X, ArrowUpDown, Unlink } from 'lucide-react';
import { MultiCheckboxSelect } from '../MultiCheckboxSelect';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { ColumnAdder } from '../ColumnAdder';
import { FullReplaceImport } from '../FullReplaceImport';
import { Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../lib/utils';
import { doc } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { generateId } from '../../lib/utils';

interface DetailFilterToolbarProps {
  globalYearFilter: string;
  setGlobalYearFilter: (v: string) => void;
  years: (number | string)[];
  effectiveStore: string;
  setGlobalStoreFilter: (v: string) => void;
  stores: string[];
  globalLocationFilter: string[];
  setGlobalLocationFilter: (v: string[]) => void;
  locationFilterOptions: string[];
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  searchTerm: string;
  onSearchTermChange: (v: string) => void;
  availableColumnsForUser: { id: string; label: string }[];
  visibleColumns: string[];
  onToggleColumn: (col: string) => void;
  hasWritePermission: boolean;
  isEditMode: boolean;
  setIsEditMode: (v: boolean) => void;
  canWrite: boolean;
  onAddProject: () => void;
  onAddTask: (p?: Project | null) => void;
  activeProjectInView?: Project | null;
  filteredProjects: Project[];
  projects: Project[];
  handleSyncAllPredecessors: (v: boolean) => void;
  isSyncingPredecessors: boolean;
  handleConvertAllSubtasksToHash?: () => void;
  isConvertingToHash?: boolean;
  currentUser: AppUser;
  handleExportProjects: () => void;
  handleImportProjects: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportTasks: () => void;
  handleImportTasks: (e: React.ChangeEvent<HTMLInputElement>) => void;
  parseCSVDate?: (d: any) => string;
  onSortSubTasks?: () => void;
  isSortingSubTasks?: boolean;
  selectedTaskCount?: number;
  onBulkAction?: (action: any) => void;
}

export const DetailFilterToolbar = memo(function DetailFilterToolbar({
  globalYearFilter,
  setGlobalYearFilter,
  years,
  effectiveStore,
  setGlobalStoreFilter,
  stores,
  globalLocationFilter,
  setGlobalLocationFilter,
  locationFilterOptions,
  statusFilter,
  onStatusFilterChange,
  searchTerm,
  onSearchTermChange,
  availableColumnsForUser,
  visibleColumns,
  onToggleColumn,
  hasWritePermission,
  isEditMode,
  setIsEditMode,
  canWrite,
  onAddProject,
  onAddTask,
  activeProjectInView,
  filteredProjects,
  projects,
  handleSyncAllPredecessors,
  isSyncingPredecessors,
  handleConvertAllSubtasksToHash,
  isConvertingToHash,
  currentUser,
  handleExportProjects,
  handleImportProjects,
  handleExportTasks,
  handleImportTasks,
  parseCSVDate,
  onSortSubTasks,
  isSortingSubTasks,
  selectedTaskCount = 0,
  onBulkAction
}: DetailFilterToolbarProps) {
  return (
    <div className="px-3 sm:px-4 md:px-5 py-3 md:py-4 border-b border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#1e1e20]/50 flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center shrink-0 print:hidden">
      <div className="flex flex-col gap-2.5 sm:gap-3 w-full xl:w-auto flex-grow max-w-4xl">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full">
          <select 
            value={globalYearFilter}
            onChange={(e) => setGlobalYearFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            <option value="all">All Years</option>
            {years.map(y => <option key={y} value={y}>Year {y}</option>)}
          </select>
          <select 
            value={effectiveStore}
            onChange={(e) => setGlobalStoreFilter(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[85px] sm:min-w-[95px] flex-1 sm:flex-none"
          >
            {stores.length > 1 && <option value="all">All Stores</option>}
            {stores.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <MultiCheckboxSelect 
            value={globalLocationFilter}
            onChange={setGlobalLocationFilter}
            options={locationFilterOptions}
            placeholder="All Locations"
            className="min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          />
          <select 
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] text-slate-900 dark:text-[#e3e3e3] text-xs sm:text-sm rounded-lg focus:ring-2 focus:ring-blue-500 block p-2 outline-none shadow-sm min-w-[95px] sm:min-w-[100px] flex-1 sm:flex-none"
          >
            <option value="all">All Status</option>
            <option value="Upcoming">Upcoming</option>
            <option value="On process">On process</option>
            <option value="On process + Upcoming 3 days">On process + Upcoming 3 days</option>
            <option value="Handover">Handover</option>
            <option value="Completed">Completed</option>
            <option value="Canceled">Canceled</option>
          </select>
        </div>
        <div className="relative w-full">
          <DebouncedSearchInput 
            value={searchTerm}
            onChange={onSearchTermChange}
            placeholder="Search in detail..."
          />
        </div>
      </div>

      {/* Controls - Column customization is only used on desktop table view (xl), hidden on iOS/mobile */}
      <div className="hidden xl:flex items-center gap-2 w-full sm:w-auto justify-end shrink-0 self-end xl:self-center">
        <ColumnAdder 
          availableColumns={availableColumnsForUser} 
          visibleColumns={visibleColumns} 
          onAddColumn={onToggleColumn} 
        />
      </div>

      {/* Floating Edit Mode Button - Moved to bottom-16 right-4 to avoid overlapping search bar */}
      {hasWritePermission && !isEditMode && (
        <div className="fixed bottom-16 right-4 z-40 flex flex-row gap-2 justify-end items-start print:hidden pointer-events-auto">
          <button
            onClick={() => setIsEditMode(true)}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-600 dark:bg-blue-600 border border-blue-400 text-white hover:bg-blue-700 dark:hover:bg-blue-500 rounded-xl font-bold transition-all shadow-2xl hover:scale-105 active:scale-95 shrink-0 touch-manipulation text-xs cursor-pointer ring-2 ring-blue-500/30"
            title="Edit Mode"
          >
            <Edit3 className="w-4 h-4 text-white pointer-events-none" />
            <span className="pointer-events-none">
              Edit Mode
            </span>
          </button>
        </div>
      )}

      {hasWritePermission && isEditMode && (
        <div className="fixed top-[154px] sm:top-[160px] left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] rounded-2xl shadow-2xl backdrop-blur-md bg-opacity-95 w-[calc(100vw-1rem)] sm:w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-2rem)] print:hidden pointer-events-auto">
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 shrink-0">
              <Edit3 className="w-3.5 h-3.5 text-blue-500" />
              <span>Editing Mode</span>
            </div>

            {canWrite && (
              <>
                <button 
                  onClick={onAddProject}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-900 dark:bg-blue-600 border border-slate-800 dark:border-blue-500 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-blue-500 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs cursor-pointer active:scale-95"
                  title="Add Project"
                >
                  <Plus className="w-4 h-4 pointer-events-none" />
                  <span className="hidden sm:inline pointer-events-none">
                    Add Project
                  </span>
                </button>

                <button 
                  onClick={() => {
                    const targetProj = activeProjectInView || (filteredProjects && filteredProjects.length > 0 ? filteredProjects[0] : (projects && projects.length > 0 ? projects[0] : null));
                    onAddTask(targetProj);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 dark:bg-emerald-600 border border-emerald-700 text-white rounded-lg hover:bg-emerald-700 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs active:scale-95 cursor-pointer"
                  title={activeProjectInView?.code ? `Add Task for ${activeProjectInView.code}` : "Add New Task"}
                >
                  <Plus className="w-4 h-4 pointer-events-none" />
                  <span className="hidden sm:inline pointer-events-none">
                    {activeProjectInView?.code ? `+ Task (${activeProjectInView.code})` : 'Add New Task'}
                  </span>
                </button>

                {onSortSubTasks && (
                  <button 
                    onClick={onSortSubTasks}
                    disabled={isSortingSubTasks}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-600 dark:bg-amber-600 border border-amber-700 text-white rounded-lg hover:bg-amber-700 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                    title={activeProjectInView?.code ? `Sort sub-tasks for ${activeProjectInView.code} by Start Date & Dependencies` : "Sort sub-tasks by Start Date & Dependencies"}
                  >
                    <ArrowUpDown className={`w-4 h-4 pointer-events-none ${isSortingSubTasks ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline pointer-events-none">
                      {isSortingSubTasks ? 'Sorting...' : (activeProjectInView?.code ? `Sort (${activeProjectInView.code})` : 'Sort Sub-tasks')}
                    </span>
                  </button>
                )}

                <button 
                  onClick={() => handleSyncAllPredecessors(true)}
                  disabled={isSyncingPredecessors}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 dark:bg-indigo-600 border border-indigo-700 text-white rounded-lg hover:bg-indigo-700 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                  title="Fix and synchronize all predecessor references with subtask codes"
                >
                  <Wand2 className={`w-4 h-4 pointer-events-none ${isSyncingPredecessors ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline pointer-events-none">
                    {isSyncingPredecessors ? 'Syncing...' : 'Sync Predecessor'}
                  </span>
                </button>

                {handleConvertAllSubtasksToHash && (
                  <button 
                    onClick={() => handleConvertAllSubtasksToHash()}
                    disabled={isConvertingToHash}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-cyan-600 dark:bg-cyan-600 border border-cyan-700 text-white rounded-lg hover:bg-cyan-700 font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                    title="Scan and convert '-' to '#' for subtask codes and predecessors"
                  >
                    <Hash className={`w-4 h-4 pointer-events-none ${isConvertingToHash ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline pointer-events-none">
                      {isConvertingToHash ? 'Converting...' : "Convert '-' to '#'"}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onBulkAction && onBulkAction('unlink')}
                  disabled={selectedTaskCount < 1}
                  className={cn(
                    "flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all shadow-md shrink-0 touch-manipulation text-xs active:scale-95 cursor-pointer",
                    selectedTaskCount >= 1
                      ? "bg-amber-600 dark:bg-amber-600 border border-amber-700 text-white hover:bg-amber-700"
                      : "opacity-40 cursor-not-allowed bg-slate-200 dark:bg-[#333336] text-slate-400 border border-slate-300 dark:border-slate-700"
                  )}
                  title="Unlink selected tasks from parent modular link"
                >
                  <Unlink className="w-4 h-4 pointer-events-none" />
                  <span className="hidden sm:inline pointer-events-none">
                    Unlink{selectedTaskCount > 0 ? ` (${selectedTaskCount})` : ''}
                  </span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsEditMode(false)}
              className="flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-[#e3e3e3] rounded-lg hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors shrink-0 ml-1 cursor-pointer"
              title="Done Editing"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {hasWritePermission && (
          <>
            <div className="flex gap-1 items-center">
              {currentUser.role === 'admin' && (
                <FullReplaceImport 
                  collectionName="taka_projects"
                  onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Success", message: String(`Full replace successful! Imported ${count} projects.`) })}
                  onParseRow={(row, headers) => {
                    const p: any = {};
                    let rowNo: any = null;
                    headers.forEach((h, i) => {
                      const fieldMap: any = { 'store': 'store', 'location': 'location', 'year': 'year', 'code': 'code', 'name': 'name', 'no': 'no' };
                      const target = fieldMap[h];
                      if (target) {
                        let val: any = row[i];
                        if (target === 'year' || target === 'no') val = isNaN(Number(val)) ? val : Number(val);
                        p[target] = val;
                        if (target === 'no') rowNo = val;
                      }
                    });
                    if (!p.code) return null;
                    return p;
                  }}
                  id="detail-full-import-projects-btn"
                  hiddenBtn={true}
                />
              )}
              <button id="detail-export-projects-btn" onClick={handleExportProjects} className="hidden" />
              <input id="detail-import-projects-input" type="file" accept=".csv" onChange={handleImportProjects} className="hidden" />
            </div>
            <div className="flex gap-1 items-center hidden">
              {currentUser.role === 'admin' && (
                <FullReplaceImport 
                  collectionName="taka_tasks"
                  onImportSuccess={(count) => useAppStore.getState().setToast({ title: "Success", message: String(`Full replace successful! Imported ${count} tasks.`) })}
                  onParseRow={(row, headers) => {
                    const t: any = {};
                    headers.forEach((h, i) => {
                      let key = h;
                      if (h === 'task name') key = 'name';
                      if (h === 'projectcode') key = 'projectCode';
                      if (h === 'year' || h === 'projectyear') key = 'projectYear';
                      if (h === 'store' || h === 'projectstore') key = 'projectStore';
                      if (h === 'sub-task code' || h === 'sub task code' || h === 'subtask code' || h === 'sub_task_code' || h === 'taskcodephu' || h === 'task code phu' || h === 'task_code_phu') key = 'taskCodePhu';
                      if (h === 'orderindex' || h === 'order_index') key = 'orderIndex';
                      if (h === 'delegation' || h === 'task delegation' || h === 'task_delegation' || h === 'isdelegation') key = 'delegation';
                      if (h === 'task flexible' || h === 'task_flexible' || h === 'taskflexible' || h === 'flexible' || h === 'realtimeupdate' || h === 'realtime_update') key = 'realtimeUpdate';
                      if (['projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'id'].includes(key)) {
                        let val: any = row[i];
                        if (key === 'start' || key === 'finish') val = parseCSVDate(val);
                        else if (key === 'delegation' || key === 'realtimeUpdate') {
                          const strVal = String(val || '').trim().toLowerCase();
                          val = (strVal === 'true' || strVal === '1' || strVal === 'yes' || strVal === 'on');
                        } else if (key === 'projectYear') {
                          val = isNaN(Number(val)) ? val : Number(val);
                        }
                        t[key] = val;
                      }
                    });
                    if (!t.projectCode || !t.name) return null;
                    return t;
                  }}
                  onRecordSave={(record, batch) => {
                     if (record.delegation) {
                        const now = new Date().toISOString();
                        const dateStr = now.substring(0, 10);
                        const activeUser = useAppStore.getState().currentUser || currentUser;
                        const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                        const rawParty = (record.party && record.party.trim()) ? record.party.trim() : '';
                        const parsedParty = rawParty.split(/[,;/+]+/).map(s => s.trim()).filter(Boolean)[0] || rawParty;
                        const deterministicGroupId = `del_${record.id}`;

                        if (parsedParty) {
                          const newGroup = {
                            id: deterministicGroupId,
                            parentTaskId: record.id,
                            name: record.name || 'Delegated Task',
                            projectCode: record.projectCode,
                            projectStore: record.projectStore,
                            projectYear: (record.projectYear !== undefined && record.projectYear !== null && !isNaN(Number(record.projectYear))) ? Number(record.projectYear) : (Number(projects.find(p => p.code === record.projectCode)?.year) || new Date().getFullYear()),
                            subTasks: [{ 
                               id: generateId(), 
                               name: '', 
                               comments: '', 
                               status: 'Assigned', 
                               delegationStatus: 'Assigned', 
                               priority: 'Mid', 
                               party: parsedParty, 
                               startAct: dateStr, 
                               finishAct: dateStr, 
                               updatedAt: now 
                            }],
                            updatedAt: now,
                            createdBy: activeUserId
                          };
                          const delRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId);
                          batch.set(delRef, newGroup, { merge: true });
                        }
                     }
                  }}
                  id="detail-full-import-tasks-btn"
                  hiddenBtn={true}
                />
              )}
              <button id="detail-export-tasks-btn" onClick={handleExportTasks} className="hidden" />
              <input id="detail-import-tasks-input" type="file" accept=".csv, .xlsx, .xls" onChange={handleImportTasks} className="hidden" />
            </div>
          </>
        )}
    </div>
  );
});
