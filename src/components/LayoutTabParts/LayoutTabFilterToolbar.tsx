import React, { memo } from 'react';
import { 
  Filter, 
  ArrowLeft, 
  Map, 
  RefreshCw, 
  Edit2, 
  Search, 
  X, 
  Clipboard, 
  Save, 
  HelpCircle 
} from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';

interface LayoutTabFilterToolbarProps {
  activeStore: string;
  allowedStores: string[];
  setGlobalStoreFilter: (store: string) => void;
  locFilterStr: string;
  availableLocations: string[];
  setGlobalLocationFilter: (locs: string[]) => void;
  effectiveYear: string;
  availableYears: string[];
  setGlobalYearFilter: (year: string) => void;
  onBackToGantt?: () => void;
  isLiveMapMode: boolean;
  setIsLiveMapMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  onRefresh: () => void;
  canWrite: boolean;
  isExporting: boolean;
  exportStatusMessage: string;
  onTriggerReExport: () => void;
  isAdmin: boolean;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  editUrl: string;
  setEditUrl: (val: string) => void;
  url: string;
  onSaveUrl: () => void;
  unitSearchInput: string;
  setUnitSearchInput: (val: string) => void;
  setTargetUnitSearch: (val: string | null) => void;
  showSuggestions: boolean;
  setShowSuggestions: (val: boolean) => void;
  searchContainerRef: React.RefObject<HTMLDivElement | null>;
  filteredUnitSuggestions: Array<{ unit: string; location?: string; brand?: string; project?: string; code?: string }>;
  onSelectSearchUnit: (item: any) => void;
  onClearSearchAndFocus: () => void;
}

export const LayoutTabFilterToolbar = React.memo(function LayoutTabFilterToolbar({
  activeStore,
  allowedStores,
  setGlobalStoreFilter,
  locFilterStr,
  availableLocations,
  setGlobalLocationFilter,
  effectiveYear,
  availableYears,
  setGlobalYearFilter,
  onBackToGantt,
  isLiveMapMode,
  setIsLiveMapMode,
  onRefresh,
  canWrite,
  isExporting,
  exportStatusMessage,
  onTriggerReExport,
  isAdmin,
  isEditing,
  setIsEditing,
  editUrl,
  setEditUrl,
  url,
  onSaveUrl,
  unitSearchInput,
  setUnitSearchInput,
  setTargetUnitSearch,
  showSuggestions,
  setShowSuggestions,
  searchContainerRef,
  filteredUnitSuggestions,
  onSelectSearchUnit,
  onClearSearchAndFocus,
}: LayoutTabFilterToolbarProps) {
  return (
    <div className="flex flex-col gap-2 mb-2 hide-on-actual-print print:hidden">
      {/* Row 1: Header, Filter Bar, and Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-[#e3e3e3]">Layout</h2>
          
          {/* Unified Filter Pill */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-white dark:bg-[#1e1e20] p-1 sm:p-1.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383] ml-1 shrink-0" />
            {allowedStores.length > 0 && (
              <select
                value={activeStore}
                onChange={(e) => setGlobalStoreFilter(e.target.value)}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[70px] outline-none cursor-pointer"
              >
                {allowedStores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {allowedStores.length > 0 && availableLocations.length > 0 && (
              <div className="w-px h-3.5 bg-slate-200 dark:bg-[#444446]"></div>
            )}
            {availableLocations.length > 0 && (
              <select
                value={locFilterStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalLocationFilter([val]);
                }}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[65px] outline-none cursor-pointer"
              >
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            )}
            {availableLocations.length > 0 && availableYears.length > 0 && (
              <div className="w-px h-3.5 bg-slate-200 dark:bg-[#444446]"></div>
            )}
            {availableYears.length > 0 && (
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-xs sm:text-sm text-slate-700 dark:text-[#c3c3c3] font-bold min-w-[55px] sm:min-w-[65px] outline-none cursor-pointer pr-1"
              >
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
            {allowedStores.length === 0 && availableLocations.length === 0 && availableYears.length === 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500 italic px-2">No accessible projects</span>
            )}
          </div>
        </div>

        {/* Action Buttons & Navigation Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
          {onBackToGantt && (
            <button
              onClick={onBackToGantt}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 dark:bg-[#28282a] dark:text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs active:scale-95 touch-manipulation shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Back to Gantt</span>
              <span className="sm:hidden">Gantt</span>
            </button>
          )}

          {/* Live Map / Exit Live */}
          <button
            onClick={() => setIsLiveMapMode((prev: boolean) => !prev)}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-all border shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0 ${
              isLiveMapMode 
                ? 'bg-purple-600 text-white border-purple-700 ring-2 ring-purple-400' 
                : 'bg-white dark:bg-[#1e1e20] text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border-slate-200 dark:border-[#444446]'
            }`}
          >
            <Map className="w-3.5 h-3.5 shrink-0" />
            <span>{isLiveMapMode ? 'Exit Live' : 'Live Map'}</span>
          </button>

          {/* Refresh */}
          <button 
            onClick={onRefresh}
            className="flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 bg-white dark:bg-[#1e1e20] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-slate-200 dark:border-[#444446] shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
            title="Làm mới dữ liệu mặt bằng"
          >
            <RefreshCw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Export */}
          {canWrite && (
            <button 
              onClick={onTriggerReExport}
              disabled={isExporting}
              title="Tự động thực hiện: Bước 1 Apply all rules Dynamic -> Bước 2 Save Cloud R2"
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 disabled:opacity-50 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-emerald-200 dark:border-emerald-800 shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isExporting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isExporting ? (exportStatusMessage || 'Đang xuất...') : 'Trigger Export'}</span>
              <span className="sm:hidden">{isExporting ? 'Xuất...' : 'Export'}</span>
            </button>
          )}

          {/* Edit URL for Admin */}
          {isAdmin && (
            <button 
              onClick={() => { setEditUrl(url); setIsEditing(true); }}
              className="flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 rounded-xl text-xs sm:text-sm font-semibold transition-colors border border-blue-200 dark:border-blue-800 shadow-xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0"
              title="Chỉnh sửa liên kết URL bản đồ"
            >
              <Edit2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Edit URL</span>
            </button>
          )}

          {/* Active Export Status Banner */}
          {isExporting && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 animate-pulse shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">{exportStatusMessage || 'Đang xử lý xuất...'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Row 2: Search Unit Box */}
      {!isEditing && (
        <div className="w-full">
          <div ref={searchContainerRef} className="relative w-full">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10" />
              <DebouncedSearchInput 
                value={unitSearchInput}
                onChange={(val) => {
                  setUnitSearchInput(val);
                  if (!val.trim()) {
                    setTargetUnitSearch(null);
                  } else {
                    setTargetUnitSearch(val.trim());
                  }
                  setShowSuggestions(true);
                }}
                debounceMs={250}
                onFocus={() => setShowSuggestions(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredUnitSuggestions.length > 0) {
                      onSelectSearchUnit(filteredUnitSuggestions[0]);
                    } else if (unitSearchInput.trim()) {
                      onSelectSearchUnit({ unit: unitSearchInput.trim() });
                    }
                  } else if (e.key === 'Escape') {
                    setShowSuggestions(false);
                    onClearSearchAndFocus();
                  }
                }}
                placeholder="Search unit, brand, or project..."
                className="w-full pl-9 py-1.5 sm:py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-xl text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 dark:focus:border-purple-400 shadow-xs transition-all"
              />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && unitSearchInput.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-1.5 animate-in fade-in duration-100">
                {filteredUnitSuggestions.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center italic">
                    Nhấn Enter để tìm "{unitSearchInput}"
                  </div>
                ) : (
                  filteredUnitSuggestions.slice(0, 20).map((item) => (
                    <button
                      key={`${item.unit}_${item.project || ''}_${item.location || ''}`}
                      type="button"
                      onClick={() => onSelectSearchUnit(item)}
                      className="w-full text-left flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950/50 text-slate-800 dark:text-slate-100 transition-colors group cursor-pointer border-b border-slate-100 dark:border-slate-800/60 last:border-b-0"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs sm:text-sm font-mono text-purple-700 dark:text-purple-400 shrink-0">
                            {item.unit}
                          </span>
                          {item.brand && (
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {item.brand}
                            </span>
                          )}
                        </div>
                        {item.project && item.project !== item.unit && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            📁 {item.project}
                          </div>
                        )}
                      </div>
                      {item.location && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 shrink-0 ml-1">
                          {item.location}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admin URL Edit Bar */}
      {isAdmin && isEditing && (
        <div className="flex items-center gap-2 w-full max-w-xl">
          <div className="flex items-center gap-1 flex-grow">
            <input 
              type="text" 
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
              onPaste={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              placeholder="URL (Google Drive or Image URL)" 
              className="flex-grow p-2 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
            />
            <button 
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) setEditUrl(text);
                } catch (err) {
                  console.error('Failed to read clipboard', err);
                }
              }}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg shrink-0 border border-slate-300 transition-colors"
              title="Paste from clipboard"
            >
              <Clipboard className="w-4 h-4" />
            </button>
          </div>
          <button 
            onClick={onSaveUrl}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save
          </button>
          <button 
            onClick={() => setIsEditing(false)}
            className="px-3 py-2 bg-slate-200 text-slate-700 hover:bg-slate-300 rounded-lg text-sm font-medium transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Helpful hint for static view mode */}
      {url && !url.includes('drive.google.com') && !isEditing && (
        <div className="hidden md:flex mb-2 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 p-2 rounded-xl hide-on-actual-print print:hidden">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <span>💡 <b>Thao tác:</b> Cuộn chuột để di chuyển Lên/Xuống. Thu phóng: Giữ <b>Ctrl + Cuộn chuột</b> hoặc <b>Dùng 2 ngón tay</b> thu phóng trên màn hình cảm ứng/Touchpad.</span>
        </div>
      )}
    </div>
  );
});
