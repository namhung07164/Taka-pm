import React, { useState, useMemo } from 'react';
import { Palette, Plus, X, ChevronDown, ChevronUp, Tag, Check, Cloud } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDataStore } from '../PictureMapping/DataContext';
import { getHatchCssStyle } from './layoutPatternUtils';
import { triggerBackgroundR2Sync } from '../PictureMapping/lib/dynamicExportService';
import { useAppStore } from '../../store/useAppStore';

export const CUSTOM_PAINT_CATEGORIES_STORAGE_KEY = 'taka_layout_custom_paint_categories';
const DEFAULT_PRESET_CATEGORIES = ['Status', 'Timeline', 'Department', 'Risk'];

export function getSavedCustomPaintCategories(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PAINT_CATEGORIES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    }
  } catch {
    // ignore
  }
  return DEFAULT_PRESET_CATEGORIES;
}

export interface LayoutPaintCategoriesSectionProps {
  version?: any;
  storeFilter?: string;
  canWrite: boolean;
}

export const LayoutPaintCategoriesSection: React.FC<LayoutPaintCategoriesSectionProps> = ({
  version,
  storeFilter,
  canWrite,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [applyAllFloors, setApplyAllFloors] = useState(true);
  const [customCategories, setCustomCategories] = useState<string[]>(() => getSavedCustomPaintCategories());
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const layoutPaintCategory = useAppStore(state => state.layoutPaintCategory);
  const setLayoutPaintCategory = useAppStore(state => state.setLayoutPaintCategory);

  const storeLocationData = useDataStore(state => state.storeLocationData);
  const getAllStoreVersions = useDataStore(state => state.getAllStoreVersions);
  const updateStoreVersionsAcrossLocations = useDataStore(state => state.updateStoreVersionsAcrossLocations);

  const activeStore = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';

  const allVersions = useMemo(() => {
    try {
      return getAllStoreVersions(activeStore) || [];
    } catch {
      return [];
    }
  }, [getAllStoreVersions, activeStore, storeLocationData]);

  // Resolve target version and groups
  const targetVersion = useMemo(() => {
    if (version && Array.isArray(version.groups)) return version;
    return allVersions.find(v => Array.isArray(v.groups) && v.groups.length > 0) || allVersions[0] || null;
  }, [version, allVersions]);

  const groups: any[] = useMemo(() => {
    return targetVersion?.groups || [];
  }, [targetVersion]);

  // Collect all unique categories from groups + custom presets
  const allCategories = useMemo(() => {
    const set = new Set<string>(customCategories);
    allVersions.forEach(v => {
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
    return Array.from(set);
  }, [customCategories, allVersions]);

  const saveCustomCategories = (next: string[]) => {
    setCustomCategories(next);
    try {
      localStorage.setItem(CUSTOM_PAINT_CATEGORIES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleAddCategory = () => {
    const trimmed = newCategoryInput.trim();
    if (!trimmed) return;
    if (!allCategories.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      saveCustomCategories([...customCategories, trimmed]);
    }
    setNewCategoryInput('');
  };

  const handleRemoveCategoryTag = (catToRemove: string) => {
    const nextCustom = customCategories.filter(c => c.toLowerCase() !== catToRemove.toLowerCase());
    saveCustomCategories(nextCustom);

    // Also unassign this category from groups
    const updatedVers = allVersions.map(v => ({
      ...v,
      groups: (v.groups || []).map((g: any) => {
        const raw = String(g.paintCategory || g.category || '').trim();
        if (!raw) return g;
        const remaining = raw
          .split(',')
          .map(s => s.trim())
          .filter(s => s && s.toLowerCase() !== catToRemove.toLowerCase())
          .join(', ');
        return {
          ...g,
          paintCategory: remaining,
          category: remaining,
        };
      }),
    }));
    updateStoreVersionsAcrossLocations(updatedVers, activeStore);
    if (layoutPaintCategory.toLowerCase() === catToRemove.toLowerCase()) {
      setLayoutPaintCategory('all');
    }
  };

  const toggleGroupCategory = (group: any, cat: string) => {
    if (!canWrite) return;
    const currentRaw = String(group.paintCategory || group.category || '').trim();
    const currentList = currentRaw
      ? currentRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const exists = currentList.some(c => c.toLowerCase() === cat.toLowerCase());
    const nextList = exists
      ? currentList.filter(c => c.toLowerCase() !== cat.toLowerCase())
      : [...currentList, cat];
    const nextCategoryStr = nextList.join(', ');

    const updatedVers = allVersions.map(v => {
      if (!applyAllFloors && targetVersion && v.id !== targetVersion.id) {
        return v;
      }
      return {
        ...v,
        groups: (v.groups || []).map((g: any) => {
          const isSameGroup = g.id === group.id || (applyAllFloors && g.name === group.name);
          if (!isSameGroup) return g;
          return {
            ...g,
            paintCategory: nextCategoryStr,
            category: nextCategoryStr,
          };
        }),
      };
    });

    updateStoreVersionsAcrossLocations(updatedVers, activeStore);
  };

  const handleCloudSaveCategories = () => {
    triggerBackgroundR2Sync(activeStore);
    setSyncMessage('Syncing to Cloud...');
    setTimeout(() => setSyncMessage(null), 2500);
  };

  return (
    <div className="space-y-2.5 p-3 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsCollapsed(prev => !prev)}
          className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-indigo-700 dark:text-indigo-300 tracking-wider hover:opacity-80 cursor-pointer active:scale-95 touch-manipulation"
        >
          <Palette className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Paint Categories Mapping</span>
          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        <div className="flex items-center gap-1.5">
          {canWrite && (
            <button
              type="button"
              onClick={handleCloudSaveCategories}
              className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-2xs transition cursor-pointer active:scale-95"
              title="Save Paint Category mappings to Cloud R2 & Firestore"
            >
              <Cloud className="w-3 h-3" />
              <span>{syncMessage || 'Save Cloud'}</span>
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-3 pt-1 animate-in fade-in duration-150">
          {/* Active Filter Quick Switcher */}
          <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900/90 px-2.5 py-1.5 rounded-xl border border-indigo-200/70 dark:border-indigo-800/60">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Active Paint Filter:
            </span>
            <select
              value={layoutPaintCategory}
              onChange={(e) => setLayoutPaintCategory(e.target.value)}
              className="bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 outline-none cursor-pointer"
            >
              <option value="all">All Categories (Default)</option>
              {allCategories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              <option value="none">None (Unpainted)</option>
            </select>
          </div>

          {/* Manage Paint Category Tags */}
          {canWrite && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                  Available Paint Categories
                </span>
                <label className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyAllFloors}
                    onChange={(e) => setApplyAllFloors(e.target.checked)}
                    className="rounded accent-indigo-600 w-3 h-3"
                  />
                  <span>Sync across floors</span>
                </label>
              </div>

              <div className="flex flex-wrap gap-1">
                {allCategories.map(cat => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 shadow-2xs"
                  >
                    <Tag className="w-2.5 h-2.5 opacity-70" />
                    {cat}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategoryTag(cat)}
                      className="text-slate-400 hover:text-red-500 ml-0.5 cursor-pointer"
                      title={`Delete category "${cat}"`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                  placeholder="New category name (e.g. Handover, F&B)..."
                  className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddCategory}
                  className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          )}

          {/* Dynamic Conditions List -> Assign to Paint Categories */}
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
            <div className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500 tracking-wider">
              Assign Dynamic Conditions ({groups.length})
            </div>

            {groups.length === 0 ? (
              <div className="text-xs text-slate-400 italic py-2 text-center">
                No dynamic conditions found in this layout version.
              </div>
            ) : (
              groups.map((g: any) => {
                const rawCat = String(g.paintCategory || g.category || '').trim();
                const assignedList = rawCat
                  ? rawCat.split(',').map((s: string) => s.trim()).filter(Boolean)
                  : [];

                return (
                  <div
                    key={g.id}
                    className="p-2 rounded-xl bg-white dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/70 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-4 h-4 rounded-md shrink-0 border border-black/10 relative flex items-center justify-center overflow-hidden"
                          style={{ backgroundColor: g.color || '#3b82f6' }}
                        >
                          {g.hatchPattern && g.hatchPattern !== 'none' && (
                            <span
                              className="absolute inset-0"
                              style={getHatchCssStyle(g.color || '#3b82f6', g.hatchPattern)}
                            />
                          )}
                          {g.symbol && (
                            <span className="relative text-[8px] font-black text-white drop-shadow">
                              {g.symbol}
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {g.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                        {assignedList.length > 0 ? assignedList.join(', ') : 'Uncategorized'}
                      </span>
                    </div>

                    {/* Category Toggle Chips */}
                    <div className="flex flex-wrap gap-1">
                      {allCategories.map(cat => {
                        const isAssigned = assignedList.some(
                          (c: string) => c.toLowerCase() === cat.toLowerCase()
                        );
                        return (
                          <button
                            key={cat}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => toggleGroupCategory(g, cat)}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all flex items-center gap-1 cursor-pointer active:scale-95",
                              isAssigned
                                ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                                : "bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                            )}
                          >
                            {isAssigned && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            <span>{cat}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
