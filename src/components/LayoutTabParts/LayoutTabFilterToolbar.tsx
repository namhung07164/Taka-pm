import React, { memo, useMemo } from 'react';
import { 
  Filter, 
  Map, 
  RefreshCw, 
  Edit2, 
  Search, 
  X, 
  Clipboard, 
  Save,
  Palette,
  SlidersHorizontal
} from 'lucide-react';
import { DebouncedSearchInput } from '../DebouncedSearchInput';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { getSavedCustomPaintCategories } from './LayoutPaintCategoriesSection';

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
  const layoutPaintCategory = useAppStore(state => state.layoutPaintCategory);
  const setLayoutPaintCategory = useAppStore(state => state.setLayoutPaintCategory);
  const storeLocationData = useDataStore(state => state.storeLocationData);
  const getAllStoreVersions = useDataStore(state => state.getAllStoreVersions);

  const availablePaintCategories = useMemo(() => {
    const set = new Set<string>(getSavedCustomPaintCategories());
    try {
      const storeKey = (activeStore === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      const versions = getAllStoreVersions(storeKey) || [];
      versions.forEach(v => {
        (v.groups || []).forEach((g: any) => {
          const raw = String(g.paintCategory || g.category || '').trim();
          if (raw) {
            raw.split(',').forEach(part => {
              const trimmed = part.trim();
              if (trimmed) set.add(trimmed);
            });
          }
        });
      });
    } catch {
      // ignore
    }
    return Array.from(set);
  }, [activeStore, getAllStoreVersions, storeLocationData]);

  return (
    <div className="flex flex-col gap-1.5 mb-1.5 hide-on-actual-print print:hidden">
      {/* Single Unified Header & Action Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        {/* Left: Title & Filter Pill */}
        <div className="flex items-center gap-2 shrink-0">
          <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-[#e3e3e3] shrink-0">Layout</h2>
          
          {/* Unified Filter Pill */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-white dark:bg-[#1e1e20] p-1 rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 dark:text-[#838383] ml-1 shrink-0" />
            {allowedStores.length > 0 && (
              <select
                value={activeStore}
                onChange={(e) => setGlobalStoreFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-700 dark:text-[#c3c3c3] font-bold outline-none cursor-pointer"
              >
                {allowedStores.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {allowedStores.length > 0 && availableLocations.length > 0 && (
              <div className="w-px h-3 bg-slate-200 dark:bg-[#444446]"></div>
            )}
            {availableLocations.length > 0 && (
              <select
                value={locFilterStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalLocationFilter([val]);
                }}
                className="bg-transparent border-none text-xs text-slate-700 dark:text-[#c3c3c3] font-bold outline-none cursor-pointer"
              >
                {availableLocations.map(loc => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            )}
            {availableLocations.length > 0 && availableYears.length > 0 && (
              <div className="w-px h-3 bg-slate-200 dark:bg-[#444446]"></div>
            )}
            {availableYears.length > 0 && (
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-slate-700 dark:text-[#c3c3c3] font-bold outline-none cursor-pointer pr-1"
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

          {/* Paint Categories Filter (LiveView Mode) */}
          {isLiveMapMode && (
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#1e1e20] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#444446] shadow-2xs">
              <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 hidden lg:inline shrink-0">
                Paint Categories:
              </span>
              <select
                value={layoutPaintCategory}
                onChange={(e) => setLayoutPaintCategory(e.target.value)}
                className="bg-transparent border-none text-xs text-indigo-700 dark:text-indigo-300 font-bold outline-none cursor-pointer max-w-[140px]"
                title="Filter units by Paint Category (configured in Edit Mode)"
              >
                <option value="all">All Categories</option>
                {availablePaintCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="none">None (Unpainted)</option>
              </select>
            </div>
          )}
        </div>

        {/* Center: Expanded Search Unit Box (All on the same line) */}
        {!isEditing && (
          <div ref={searchContainerRef} className="relative flex-1 min-w-[180px] max-w-full md:max-w-xl lg:max-w-2xl mx-1 sm:mx-2">
            <div className="relative flex items-center w-full">
              <Search className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10 shrink-0" />
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
                className="w-full h-9 pl-9 pr-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 rounded-xl text-xs sm:text-sm font-semibold text-purple-700 dark:text-purple-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-normal outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 dark:focus:border-purple-400 shadow-2xs transition-all"
              />
              {unitSearchInput && (
                <button
                  type="button"
                  onClick={onClearSearchAndFocus}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors z-10 cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && unitSearchInput.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl max-h-72 overflow-y-auto p-1.5 animate-in fade-in duration-100">
                {filteredUnitSuggestions.length === 0 ? (
                  <div className="p-3 text-xs text-slate-500 dark:text-slate-400 text-center italic">
                    Press Enter to search "{unitSearchInput}"
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
        )}

        {/* Right: Harmonized Action Buttons (Exit/Live, Export, Edit URL) */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Live Map / Exit View button */}
          <button
            onClick={() => setIsLiveMapMode((prev: boolean) => !prev)}
            title={isLiveMapMode ? 'Exit Live Map View' : 'Switch to Live Interactive Map'}
            className={`h-9 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border shadow-2xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0 cursor-pointer ${
              isLiveMapMode 
                ? 'bg-purple-600 text-white border-purple-700 ring-1 ring-purple-400/50 hover:bg-purple-700' 
                : 'bg-white dark:bg-[#1e1e20] text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/40 border-slate-200 dark:border-[#444446]'
            }`}
          >
            <Map className="w-3.5 h-3.5 shrink-0" />
            <span>{isLiveMapMode ? 'Exit' : 'Live'}</span>
          </button>



          {/* Edit URL for Admin / Write.layout */}
          {canWrite && (
            <button 
              onClick={() => { setEditUrl(url); setIsEditing(true); }}
              className="h-9 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-xl text-xs font-bold transition-colors border border-blue-200 dark:border-blue-800 shadow-2xs whitespace-nowrap active:scale-95 touch-manipulation shrink-0 cursor-pointer"
              title="Edit layout image/drive URL"
            >
              <Edit2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden lg:inline">Edit URL</span>
            </button>
          )}

          {/* Active Export Status Banner */}
          {isExporting && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium bg-amber-50 dark:bg-amber-950/60 px-2 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 animate-pulse shrink-0">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">{exportStatusMessage || 'Exporting...'}</span>
            </div>
          )}
        </div>
      </div>

      {/* URL Edit Bar */}
      {canWrite && isEditing && (
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
    </div>
  );
});

