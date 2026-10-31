import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnitShape, MapVersion } from './types';
import {
  Plus,
  Trash2,
  FolderPlus,
  Calculator,
  Copy,
  Calendar,
  Check,
  Cloud,
} from 'lucide-react';
import { useAppStore } from '../../../../store/useAppStore';
import { useDataStore } from '../../DataContext';
import { useShallow } from 'zustand/react/shallow';
import { useDynamicUnitSummary } from '../../lib/dynamicSummaryEngine';
import { DynamicUnitSummaryTable } from './DynamicUnitSummaryTable';
import {
  triggerBackgroundR2Sync,
  subscribeBackgroundSyncStatus,
  BackgroundSyncStatus,
} from '../../lib/dynamicExportService';
import { useDynamicRules } from '../../hooks/useDynamicRules';
import { DynamicGroupCard } from './DynamicHierarchyParts/DynamicGroupCard';
import {
  useDynamicHierarchyActions,
  computeGroupMatchDetailsMap,
} from './DynamicHierarchyParts/useDynamicHierarchyActions';

interface DynamicHierarchyTabProps {
  units: UnitShape[];
  setUnits: (u: UnitShape[]) => void;
  versions: MapVersion[];
  setVersions: (v: MapVersion[]) => void;
  activeVersionId: string | null;
  setActiveVersionId: (id: string | null) => void;
  store?: 'HCM' | 'HN';
  location?: string;
  year?: string;
}

function DynamicHierarchyTab({
  units,
  setUnits,
  versions,
  setVersions,
  activeVersionId,
  setActiveVersionId,
  store: propStore,
  location: propLocation,
}: DynamicHierarchyTabProps) {
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore((state) => state.setGlobalYearFilter);

  const { currentStore, currentLocation } = useDataStore(
    useShallow((state) => ({
      currentStore: state.store,
      currentLocation: state.location,
    }))
  );

  const store = propStore || currentStore || 'HCM';
  const location = propLocation || currentLocation || 'L1';

  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = projects.map((p) => (p.year ? String(p.year) : '')).filter(Boolean);
    const taskYears = tasks.map((t) => (t.projectYear ? String(t.projectYear) : '')).filter(Boolean);
    const versionYears = versions.map((v) => (v.year ? String(v.year) : '')).filter(Boolean);
    return Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears, ...versionYears]))
      .filter((y) => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
  }, [projects, tasks, versions]);

  const effectiveYear =
    globalYearFilter && globalYearFilter !== 'all'
      ? globalYearFilter
      : availableYears[0] || new Date().getFullYear().toString();

  const filteredVersions = useMemo(() => {
    return versions.filter((v) => {
      const matchStore = !v.store || v.store === store;
      const matchLoc = !v.location || v.location === location;
      const matchYear = String(v.year || '').trim() === String(effectiveYear).trim();
      return matchStore && matchLoc && matchYear;
    });
  }, [versions, store, location, effectiveYear]);

  const normalizedYearVersionIdsRef = useRef<string>('');
  useEffect(() => {
    let hasUntagged = false;
    const normalizedVersions = versions.map((v) => {
      if (!v.year || !String(v.year).trim()) {
        hasUntagged = true;
        const inferredYear = v.name?.match(/(202\d|203\d)/i)?.[1] || '2026';
        return { ...v, year: String(inferredYear) };
      }
      return v;
    });

    if (hasUntagged) {
      const currentUntaggedFingerprint = versions
        .filter((v) => !v.year || !String(v.year).trim())
        .map((v) => v.id)
        .join('|');
      if (
        currentUntaggedFingerprint &&
        currentUntaggedFingerprint !== normalizedYearVersionIdsRef.current
      ) {
        normalizedYearVersionIdsRef.current = currentUntaggedFingerprint;
        setVersions(normalizedVersions);
      }
    }
  }, [versions, setVersions]);

  const viewVersionId =
    activeVersionId && filteredVersions.some((v) => v.id === activeVersionId)
      ? activeVersionId
      : filteredVersions[0]?.id || null;

  const activeVersion = versions.find((v) => v.id === viewVersionId);

  const storeRef = useRef(store);
  storeRef.current = store;

  const [cloudSyncStatus, setCloudSyncStatus] = useState<BackgroundSyncStatus>('idle');

  useEffect(() => {
    const unsub = subscribeBackgroundSyncStatus((status) => {
      setCloudSyncStatus(status);
    });
    return unsub;
  }, []);

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const updateVersions = useCallback(
    (newVersions: MapVersion[]) => {
      setVersions(newVersions);

      if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = setTimeout(() => {
        triggerBackgroundR2Sync(storeRef.current).catch((err) => {
          console.warn('[DynamicHierarchy] Auto background sync warning:', err);
        });
      }, 1200);
    },
    [setVersions]
  );

  useDynamicRules({
    units,
    versions,
    setVersions,
    setUnits,
    store,
    year: effectiveYear,
    autoEvaluate: true,
  });

  const { summaryMap, summaryList } = useDynamicUnitSummary({
    units,
    activeVersion,
    store,
    location,
    year: String(effectiveYear),
  });

  const unitLookupMap = useMemo(() => {
    const map = new Map<string, UnitShape>();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.id) map.set(u.id, u);
      if (u.name) map.set(u.name.toLowerCase(), u);
    }
    return map;
  }, [units]);

  const groupMatchDetailsMap = useMemo(
    () =>
      computeGroupMatchDetailsMap({
        activeVersion,
        summaryList,
        summaryMap,
        unitLookupMap,
      }),
    [activeVersion, summaryList, summaryMap, unitLookupMap]
  );

  const currentLocationUnits = useMemo(() => {
    if (!location) return units;
    const matched = units.filter((u) => !u.location || u.location === location);
    return matched.length > 0 ? matched : units;
  }, [units, location]);

  const {
    toggleVersionActive,
    applyRules,
    addVersion,
    duplicateVersion,
    deleteVersion,
    addGroup,
    deleteGroup,
    renameGroup,
    updateGroupColor,
    updateGroupOpacity,
    updateGroupHatchPattern,
    updateGroupSymbol,
    addRuleToGroup,
    updateRule,
    deleteRule,
    copyGroups,
  } = useDynamicHierarchyActions({
    store,
    location,
    effectiveYear,
    versions,
    activeVersion,
    viewVersionId,
    updateVersions,
    setVersions,
    setUnits,
    setActiveVersionId,
  });

  const activeGroups = activeVersion?.groups || [];

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800/50 p-2.5 sm:p-3 glass flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between mb-2.5 shrink-0 flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Calculator size={14} className="text-brand-500" /> Dynamic Hierarchy
            </h3>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 px-2 py-0.5 rounded-md shadow-inner">
              <Calendar size={11} className="text-brand-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year:</span>
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] text-white font-bold outline-none cursor-pointer hover:text-brand-300 transition-colors"
                title="Filter Dynamic Hierarchy by Year"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y} className="bg-slate-950 text-white font-semibold">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <select
              className="bg-slate-950 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-700 outline-none cursor-pointer hover:border-brand-500 transition-colors"
              value={viewVersionId || ''}
              onChange={(e) => setActiveVersionId(e.target.value === '' ? null : e.target.value)}
            >
              {!viewVersionId && (
                <option value="">
                  -- No Version for {location} ({effectiveYear}) --
                </option>
              )}
              {filteredVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div
              className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-700 text-[10px] font-semibold"
              title="Quy hoạch phân vùng dữ liệu theo Store, Vị trí và Năm"
            >
              <span className="text-brand-400 font-bold">{store}</span>
              <span className="text-slate-600">•</span>
              <span className="text-purple-400 font-bold">{location}</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-bold">{effectiveYear}</span>
              <span className="text-slate-500 text-[9px]">({currentLocationUnits.length} units)</span>
            </div>
            {activeVersion && (
              <>
                <button
                  onClick={toggleVersionActive}
                  className="px-2 py-1 rounded-md text-[10px] font-bold uppercase transition-colors shrink-0 bg-emerald-600/20 text-emerald-400 border border-emerald-500/50 flex items-center gap-1 shadow-sm"
                  title="Dynamic Rules is permanently enabled (Always ON)"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Always ON
                </button>
                <button
                  onClick={duplicateVersion}
                  className="p-1 hover:bg-slate-800 rounded-md text-slate-500 hover:text-brand-400 transition-colors"
                  title="Duplicate version"
                >
                  <Copy size={13} />
                </button>
                <button
                  onClick={deleteVersion}
                  className="p-1 hover:bg-slate-800 rounded-md text-slate-500 hover:text-red-400 transition-colors"
                  title="Delete version"
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={addVersion}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-brand-600 text-white text-[10px] font-bold uppercase shadow hover:bg-brand-500 transition-colors"
            >
              <Plus size={12} /> New Version
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
          {activeVersion ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 flex-wrap gap-1.5">
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">
                  Rule-Based Groups ({activeGroups.length})
                </h4>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[10px] shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Tier 1: Đánh giá RAM 0ms" />
                    <span className="text-slate-300 font-semibold">RAM 0ms</span>
                    <span className="text-slate-600">•</span>
                    {cloudSyncStatus === 'syncing' ? (
                      <span className="text-cyan-400 font-semibold flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Lưu R2...
                      </span>
                    ) : cloudSyncStatus === 'saved' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={10} className="text-emerald-400" />
                        R2 Đã lưu
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Cloud size={10} className="text-slate-500" />
                        R2 Sẵn sàng
                      </span>
                    )}
                  </div>

                  <button
                    onClick={applyRules}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[10px] font-bold uppercase transition-colors shadow-sm border border-brand-400 active:scale-95"
                  >
                    <Calculator size={11} /> Apply Rules
                  </button>
                  <button
                    onClick={addGroup}
                    className="flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-brand-400 text-[10px] font-bold uppercase transition-colors active:scale-95"
                  >
                    <Plus size={11} /> Create Group
                  </button>

                  {versions.filter((v) => v.id !== activeVersion.id && (v.groups || []).length > 0).length > 0 && (
                    <select
                      className="bg-slate-800 hover:bg-slate-700 text-brand-400 text-[10px] font-bold uppercase px-2 py-1 rounded-md border border-slate-700 outline-none transition-colors cursor-pointer"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          copyGroups(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    >
                      <option value="">[ Copy Groups From ]</option>
                      {versions
                        .filter((v) => v.id !== activeVersion.id && (v.groups || []).length > 0)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.store ? `[${v.store}] ` : ''}
                            {v.location ? `[${v.location}] ` : ''}
                            {v.name}
                            {v.year ? ` • ${v.year}` : ''} ({v.groups.length}{' '}
                            {v.groups.length === 1 ? 'group' : 'groups'})
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>

              {activeGroups.length === 0 && (
                <div className="text-center py-6 px-4 border border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-400 flex flex-col items-center justify-center gap-2">
                  <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                    <Calculator size={18} />
                  </div>
                  <p className="text-xs font-semibold text-slate-300">
                    Phiên bản này ({activeVersion.name} • {activeVersion.year || effectiveYear}) chưa có nhóm phân loại & quy tắc.
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-md">
                    Mỗi phiên bản (theo từng năm) có nhóm quy tắc riêng. Bạn có thể sao chép nhanh từ phiên bản năm khác hoặc tự tạo nhóm mới.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                    <button
                      onClick={addGroup}
                      className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-white text-[10px] font-bold uppercase transition-colors shadow flex items-center gap-1"
                    >
                      <Plus size={12} /> Tạo nhóm mới
                    </button>
                    {versions
                      .filter((v) => v.id !== activeVersion.id && (v.groups || []).length > 0)
                      .map((v) => (
                        <button
                          key={v.id}
                          onClick={() => copyGroups(v.id)}
                          className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-brand-400 border border-slate-700 text-[10px] font-semibold transition-colors flex items-center gap-1"
                        >
                          <Copy size={11} /> Copy từ {v.name} ({v.year || 'N/A'})
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-2.5">
                {activeGroups.map((group) => {
                  const matchDetails = groupMatchDetailsMap.get(group.id);
                  return (
                    <DynamicGroupCard
                      key={group.id}
                      group={group}
                      matchedUnits={matchDetails?.unitNames || []}
                      totalAreaM2={matchDetails?.totalAreaM2}
                      onUpdateGroupColor={updateGroupColor}
                      onUpdateGroupOpacity={updateGroupOpacity}
                      onUpdateGroupHatchPattern={updateGroupHatchPattern}
                      onUpdateGroupSymbol={updateGroupSymbol}
                      onRenameGroup={renameGroup}
                      onDeleteGroup={deleteGroup}
                      onAddRule={addRuleToGroup}
                      onUpdateRule={updateRule}
                      onDeleteRule={deleteRule}
                    />
                  );
                })}
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <DynamicUnitSummaryTable
                  summaryList={summaryList}
                  title={`Bảng Tổng Hợp Trạng Thái & Màu Tô Thực Tế [${store} • ${location} • ${effectiveYear}]`}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <div className="p-4 rounded-full bg-slate-900 border border-slate-800 mb-4 text-slate-500">
                <FolderPlus size={44} />
              </div>
              <p className="text-base font-bold text-white mb-1">
                Chưa có Version nào cho [{store} • {location} • {effectiveYear}]
              </p>
              <p className="text-xs text-slate-400 mb-6 max-w-md">
                Bạn đã xóa hết version trong phân vùng này. Bấm nút dưới đây nếu bạn muốn tạo một version mới để cấu hình logic.
              </p>
              <button
                onClick={addVersion}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase shadow-lg shadow-brand-900/30 transition-all active:scale-95"
              >
                <Plus size={16} /> Tạo Version Mới
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(DynamicHierarchyTab);
