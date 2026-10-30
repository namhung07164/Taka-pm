import React, { memo, useState, useMemo } from 'react';
import { UnitShape, MapVersion } from '../types';
import { cn } from '../../../lib/utils';
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  Trash2 
} from 'lucide-react';
import { getUnitEffectiveSizeM2 } from '../../../../../lib/unitSizeResolver';
import { SearchableSelect, UnitSizeInput } from './InspectorInputs';

export interface EditTabInspectorProps {
  units: UnitShape[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selectedUnit: UnitShape | undefined;
  activeVersion: MapVersion | undefined;
  activeVersionId: string | null;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  effectiveYear: string;
  summaryMap: Map<string, any>;
  masterUnitOptions: { value: string; label: string }[];
  handleSetUnitsWithHistory: (newUnits: UnitShape[]) => void;
  syncUnitSizeToMatchedProjects: (params: any) => void;
  setActiveTool: (tool: any) => void;
  handleToggleAllVisibility: () => void;
  handleToggleAllLock: () => void;
  handleDeleteAll: () => void;
}

export const EditTabInspector = memo(function EditTabInspector({
  units,
  selectedId,
  setSelectedId,
  selectedUnit,
  activeVersion,
  activeVersionId,
  versions,
  setVersions,
  effectiveYear,
  summaryMap,
  masterUnitOptions,
  handleSetUnitsWithHistory,
  syncUnitSizeToMatchedProjects,
  setActiveTool,
  handleToggleAllVisibility,
  handleToggleAllLock,
  handleDeleteAll,
}: EditTabInspectorProps) {
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [librarySearchTerm, setLibrarySearchTerm] = useState('');

  const filteredUnits = useMemo(() => {
    if (!librarySearchTerm.trim()) return units;
    const term = librarySearchTerm.trim().toLowerCase();
    return units.filter(u => (u.name || '').toLowerCase().includes(term));
  }, [units, librarySearchTerm]);

  return (
    <div className={cn(
      "flex flex-col bg-slate-900/90 rounded-lg border border-slate-800/80 transition-all duration-300 relative shrink-0 overflow-hidden",
      isInspectorCollapsed ? "w-7 p-1 items-center" : "w-44 sm:w-48 p-1.5 gap-1.5 glass"
    )}>
      {/* Toggle Collapse Button */}
      <button 
        onClick={() => setIsInspectorCollapsed(!isInspectorCollapsed)}
        className={cn(
          "p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shadow-sm",
          isInspectorCollapsed ? "w-5 h-5 flex items-center justify-center my-0.5" : "absolute right-1.5 top-1.5 z-30 border border-slate-700 bg-slate-900"
        )}
        title={isInspectorCollapsed ? "Mở rộng Inspector" : "Thu gọn Inspector để mở rộng Canvas"}
      >
        {isInspectorCollapsed ? <ChevronLeft size={11} className="rotate-180" /> : <ChevronRight size={11} />}
      </button>

      {isInspectorCollapsed ? (
        <div className="flex flex-col items-center gap-2 mt-3 text-slate-400">
          <span className="text-[8px] font-bold uppercase tracking-widest [writing-mode:vertical-rl] rotate-180 select-none">
            INSPECTOR ({units.length})
          </span>
        </div>
      ) : (
        <div className="flex flex-col h-full overflow-hidden w-full gap-1.5">
          <div className="space-y-1 border-b border-slate-800 pb-1.5">
            <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest flex items-center justify-between pr-6">
              <span>Inspector</span>
              <span className="text-[8.5px] font-normal text-slate-500 font-mono">{units.length} units</span>
            </h4>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 z-10 pointer-events-none" size={11} />
              <input 
                placeholder="Search units..."
                className="w-full bg-slate-950 border border-slate-800 rounded pl-6 py-0.5 text-[10px] text-slate-200 outline-none focus:border-brand-500 transition-all"
                value={librarySearchTerm}
                onChange={(e) => setLibrarySearchTerm(e.target.value)}
              />
            </div>
          </div>
      
          {selectedId ? (
            <div className="space-y-2.5">
              <div className="grid grid-cols-12 gap-1.5 items-end">
                <div className="col-span-8 space-y-0.5">
                  <label className="text-[9px] uppercase text-slate-500 font-bold block">Unit Name</label>
                  <SearchableSelect 
                    value={selectedUnit?.name || ''}
                    onChange={(val) => {
                      const defaultExcelSize = summaryMap.get(val)?.size;
                      const updatedUnits = units.map(u => {
                        if (u.id !== selectedId) return u;
                        const inheritedSize = getUnitEffectiveSizeM2(
                          { ...u, name: val },
                          activeVersion,
                          defaultExcelSize
                        );
                        const nextSize = (u.sizeM2 !== undefined && u.sizeM2 > 0)
                          ? u.sizeM2
                          : (inheritedSize > 0 ? inheritedSize : u.sizeM2);
                        return {
                          ...u,
                          name: val,
                          ...(nextSize !== undefined ? { sizeM2: nextSize, size: nextSize } : {}),
                        };
                      });
                      handleSetUnitsWithHistory(updatedUnits);
                      syncUnitSizeToMatchedProjects({
                        unitId: selectedId,
                        unitName: val,
                        store: activeVersion?.store,
                        location: activeVersion?.location,
                        year: activeVersion?.year || effectiveYear,
                        updatedUnits,
                        activeVersionId,
                      });
                    }}
                    options={masterUnitOptions}
                  />
                </div>
                <div className="col-span-4 space-y-0.5">
                  <label className="text-[9px] uppercase text-slate-500 font-bold block">Size (m²)</label>
                  <UnitSizeInput
                    unitId={selectedId}
                    effectiveSize={getUnitEffectiveSizeM2(
                      selectedUnit,
                      activeVersion,
                      selectedUnit?.name ? summaryMap.get(selectedUnit.name)?.size : undefined
                    )}
                    onCommit={(numVal) => {
                      const updatedUnits = units.map(u =>
                        u.id === selectedId ? { ...u, sizeM2: numVal, size: numVal } : u
                      );
                      handleSetUnitsWithHistory(updatedUnits);
                      if (activeVersionId && selectedUnit) {
                        const uNameKey = String(selectedUnit.name || '').trim().toUpperCase();
                        const updatedVersions = versions.map(v => {
                          if (v.id !== activeVersionId) return v;
                          const nextUnitSizes = { ...(v.unitSizes || {}) };
                          if (numVal !== undefined && numVal > 0) {
                            nextUnitSizes[selectedUnit.id] = numVal;
                            if (uNameKey) nextUnitSizes[uNameKey] = numVal;
                          } else {
                            delete nextUnitSizes[selectedUnit.id];
                            if (uNameKey) delete nextUnitSizes[uNameKey];
                          }
                          return {
                            ...v,
                            unitSizes: nextUnitSizes,
                            ...(Array.isArray(v.mapUnits) && v.mapUnits.length > 0
                              ? {
                                mapUnits: v.mapUnits.map(vu =>
                                  (vu.id === selectedUnit.id || (uNameKey && String(vu.name || '').trim().toUpperCase() === uNameKey))
                                    ? { ...vu, sizeM2: numVal, size: numVal }
                                    : vu
                                )
                              }
                              : {}),
                          };
                        });
                        setVersions(updatedVersions);
                        syncUnitSizeToMatchedProjects({
                          unitId: selectedUnit.id,
                          unitName: selectedUnit.name,
                          store: activeVersion?.store,
                          location: activeVersion?.location,
                          year: activeVersion?.year || effectiveYear,
                          updatedUnits,
                          updatedVersions,
                          activeVersionId,
                        });
                      } else if (selectedUnit) {
                        syncUnitSizeToMatchedProjects({
                          unitId: selectedUnit.id,
                          unitName: selectedUnit.name,
                          store: activeVersion?.store,
                          location: activeVersion?.location,
                          year: activeVersion?.year || effectiveYear,
                          updatedUnits,
                          activeVersionId,
                        });
                      }
                    }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800">
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    "p-1.5 rounded-md",
                    selectedUnit?.locked ? "bg-amber-500/10 text-amber-500" : "bg-slate-800 text-slate-400"
                  )}>
                    {selectedUnit?.locked ? <Lock size={13} /> : <Unlock size={13} />}
                  </div>
                  <span className="text-[10px] font-bold text-slate-300 uppercase">Lock Position</span>
                </div>
                <button
                  onClick={() => {
                    handleSetUnitsWithHistory(units.map(u => u.id === selectedId ? { ...u, locked: !u.locked } : u));
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none",
                    selectedUnit?.locked ? "bg-amber-500" : "bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform",
                      selectedUnit?.locked ? "translate-x-4.5" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-3 text-slate-500 text-xs italic">
              Select a unit to edit properties
            </div>
          )}

          <div className="mt-1 border-t border-slate-800 pt-1.5 flex-1 overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-1">
              <h4 className="text-[9px] font-bold text-slate-300 uppercase tracking-wider">Library ({filteredUnits.length}/{units.length})</h4>
              <div className="flex items-center gap-1">
                <button 
                  onClick={handleToggleAllVisibility}
                  disabled={filteredUnits.length === 0 || !filteredUnits.some(u => !u.locked)}
                  className="text-[8px] font-bold text-brand-400 hover:text-brand-300 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-0.5"
                  title="Toggle Visibility for Unlocked Filtered Units"
                >
                  <Eye size={8} /> All
                </button>
                <button 
                  onClick={handleToggleAllLock}
                  disabled={filteredUnits.length === 0}
                  className="text-[8px] font-bold text-amber-500 hover:text-amber-400 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-0.5"
                  title="Toggle Lock for Filtered Units"
                >
                  {filteredUnits.length > 0 && filteredUnits.every(u => u.locked) ? <Unlock size={8} /> : <Lock size={8} />} All
                </button>
                <button 
                  onClick={handleDeleteAll}
                  disabled={filteredUnits.length === 0 || !filteredUnits.some(u => !u.locked)}
                  className="text-[8px] font-bold text-red-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed uppercase transition-colors flex items-center gap-0.5"
                  title="Delete All Unlocked Filtered Units"
                >
                  <Trash2 size={8} /> All
                </button>
              </div>
            </div>
            <div className="space-y-0.5">
              {filteredUnits.length > 0 ? filteredUnits.map(unit => (
                <div 
                  key={unit.id}
                  className={cn(
                    "flex items-center justify-between px-1.5 py-0.5 rounded border text-[10px] cursor-pointer transition-colors",
                    selectedId === unit.id ? "bg-brand-900/20 border-brand-500/50 text-brand-300" : "bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800"
                  )}
                  onClick={() => {
                    try {
                      setActiveTool('select');
                      setSelectedId(unit.id);
                    } catch (err) {
                      console.error("Error selecting unit:", err, unit);
                    }
                  }}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="truncate max-w-[75px] font-medium">{unit.name}</span>
                    {(() => {
                      const uSize = getUnitEffectiveSizeM2(
                        unit,
                        activeVersion,
                        unit.name ? summaryMap.get(unit.name)?.size : undefined
                      );
                      return uSize > 0 ? (
                        <span className="px-1 py-0.1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[8px] font-mono font-bold shrink-0">
                          {uSize}m²
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!unit.locked) {
                          handleSetUnitsWithHistory(units.map(u => u.id === unit.id ? { ...u, visible: !u.visible } : u));
                        }
                      }}
                      disabled={unit.locked}
                      className={cn(
                        "p-0.5 rounded transition-colors",
                        unit.visible ? "text-brand-400 hover:bg-brand-500/10" : "text-slate-600 hover:bg-slate-700",
                        unit.locked && "opacity-30 cursor-not-allowed"
                      )}
                      title={unit.locked ? "Unlock to toggle visibility" : (unit.visible ? "Hide Unit" : "Show Unit")}
                    >
                      {unit.visible ? <Eye size={10} /> : <EyeOff size={10} />}
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetUnitsWithHistory(units.map(u => u.id === unit.id ? { ...u, locked: !u.locked } : u));
                      }}
                      className={cn(
                        "p-0.5 rounded transition-colors",
                        unit.locked ? "text-amber-500 hover:bg-amber-500/10" : "text-slate-500 hover:bg-slate-700"
                      )}
                    >
                      {unit.locked ? <Lock size={10} /> : <Unlock size={10} />}
                    </button>
                    <div className="w-2 h-2 rounded-xs flex-shrink-0 ml-0.5" style={{ backgroundColor: (unit.fill && unit.fill !== 'rgba(0, 0, 0, 0.001)' && unit.fill !== 'transparent' && !unit.fill.startsWith('rgba(0,0,0,0')) ? unit.fill : '#3b82f6' }} />
                  </div>
                </div>
              )) : (
                <div className="text-center py-2 text-slate-600 text-[10px] italic">
                  No units match your search
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
