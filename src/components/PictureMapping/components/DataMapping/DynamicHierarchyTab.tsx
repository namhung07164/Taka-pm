import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UnitShape, Group, GroupRule, MapVersion } from "./types";
import { v4 as uuidv4 } from "uuid";
import {
  Plus,
  Download,
  Trash2,
  FolderPlus,
  Calculator,
  Edit2,
  X,
  Copy,
  Layers,
  Calendar,
  Check,
  Cloud,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useSummaryData } from "../../lib/summaryData";
import { useAppStore } from "../../../../store/useAppStore";
import { getStatus, enrichProjects, computeProjectActStatus, extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata, projectMatchesScope } from "../../../../lib/utils";
import Papa from "papaparse";
import { ColorPicker } from "../ColorPicker";
import { useDataStore } from "../../DataContext";
import { useShallow } from "zustand/react/shallow";
import { useDynamicUnitSummary } from "../../lib/dynamicSummaryEngine";
import { DynamicUnitSummaryTable } from "./DynamicUnitSummaryTable";
import {
  applyAllDynamicRulesForStore,
  triggerBackgroundR2Sync,
  subscribeBackgroundSyncStatus,
  BackgroundSyncStatus,
} from "../../lib/dynamicExportService";
import { useDynamicRules } from "../../hooks/useDynamicRules";
import { DynamicGroupCard } from "./DynamicHierarchyParts/DynamicGroupCard";
import { HatchPatternType } from "../../../LayoutTabParts/layoutPatternUtils";

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

const normalizeRuleField = (f: string) => {
  if (f === "appStatus" || f === "app: status") return "appProjectStatus";
  if (f === "appTask" || f === "app: task" || f === "app: task summarize" || f === "app: task summaries" || f === "app: tasks" || f === "taskSummaries" || f === "taskSummarize") return "appTask";
  if (f === "appYear" || f === "app: year") return "appProjectYear";
  if (f === "appCode" || f === "app: project code") return "appProjectCode";
  if (f === "appFloor" || f === "app: floor") return "appProjectFloor";
  if (f === "appMdStatus" || f === "app: md status" || f === "app:md status") return "appProjectMdStatus";
  if (f === "appActStatus" || f === "app: act status" || f === "app:act status") return "appProjectActStatus";
  if (f === "appDetail" || f === "app: detail (project)") return "appProjectDetail";
  if (f === "appDescription" || f === "app: description (project)" || f === "description (project)") return "appProjectDescription";
  if (f === "appParty" || f === "app: party") return "appProjectParty";
  if (f === "appBudget" || f === "app: budget") return "appProjectBudget";
  if (f === "appActual" || f === "app: actual") return "appProjectActual";
  if (f === "appSizeM2" || f === "app: size (m²)" || f === "app: size m2" || f === "app: sizem2" || f === "appsizem2") return "appProjectSizeM2";
  if (f === "appShopType" || f === "app: shop type" || f === "app: shoptype" || f === "appshoptype") return "appProjectShopType";
  if (f === "shop_type" || f === "shop type") return "shopType";
  return f;
};

const DebouncedRuleValueInput = memo(({
  value,
  disabled,
  placeholder,
  className,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  onCommit: (val: string) => void;
}) => {
  const [localVal, setLocalVal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalVal(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current(next);
    }, 280);
  };

  const handleBlur = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      onCommitRef.current(localVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      onCommitRef.current(localVal);
    }
  };

  return (
    <input
      type="text"
      disabled={disabled}
      placeholder={placeholder}
      value={localVal}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
});

const DebouncedOpacitySlider = memo(({
  opacity,
  onCommit,
  compact,
}: {
  opacity: number;
  onCommit: (val: number) => void;
  compact?: boolean;
}) => {
  const [localOpacity, setLocalOpacity] = useState(opacity);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  useEffect(() => {
    setLocalOpacity(opacity);
  }, [opacity]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setLocalOpacity(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onCommitRef.current(val);
    }, 150);
  };

  if (compact) {
    return (
      <input
        type="range"
        min="0"
        max="1"
        step="0.1"
        value={localOpacity}
        title={`Opacity: ${localOpacity}`}
        onChange={handleChange}
        className="w-10 h-1 accent-brand-500 shrink-0 cursor-pointer"
      />
    );
  }

  return (
    <div
      className="flex items-center space-x-1.5 bg-white dark:bg-[#1a1d24] px-2 py-1 rounded border border-slate-200 dark:border-slate-700"
      title="Color Opacity"
    >
      <span className="text-[11px] font-medium text-slate-400">Opacity</span>
      <input
        type="range"
        min="0.1"
        max="1"
        step="0.05"
        value={localOpacity}
        onChange={handleChange}
        className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
      <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300 w-7 text-right">
        {Math.round(localOpacity * 100)}%
      </span>
    </div>
  );
});

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
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const setGlobalYearFilter = useAppStore(state => state.setGlobalYearFilter);

  const { currentStore, currentLocation } = useDataStore(useShallow(state => ({
    currentStore: state.store,
    currentLocation: state.location,
  })));

  const store = propStore || currentStore || 'HCM';
  const location = propLocation || currentLocation || 'L1';

  const availableYears = useMemo(() => {
    const currentYr = new Date().getFullYear().toString();
    const baseYears = ['2024', '2025', '2026', '2027', '2028'];
    const projectYears = projects.map(p => p.year ? String(p.year) : '').filter(Boolean);
    const taskYears = tasks.map(t => t.projectYear ? String(t.projectYear) : '').filter(Boolean);
    const versionYears = versions.map(v => v.year ? String(v.year) : '').filter(Boolean);
    const allYrs = Array.from(new Set([currentYr, ...baseYears, ...projectYears, ...taskYears, ...versionYears]))
      .filter(y => y && y.toLowerCase() !== 'all')
      .sort((a, b) => Number(b) - Number(a));
    return allYrs;
  }, [projects, tasks, versions]);

  const effectiveYear = (globalYearFilter && globalYearFilter !== 'all')
    ? globalYearFilter
    : (availableYears[0] || new Date().getFullYear().toString());

  // Filter versions STRICTLY by store, location, and effective year (no cross-year mixing)
  const filteredVersions = useMemo(() => {
    return versions.filter(v => {
      const matchStore = !v.store || v.store === store;
      const matchLoc = !v.location || v.location === location;
      const matchYear = String(v.year || '').trim() === String(effectiveYear).trim();
      return matchStore && matchLoc && matchYear;
    });
  }, [versions, store, location, effectiveYear]);

  // Ensure strict year tagging for legacy versions without mutating existing version years
  const normalizedYearVersionIdsRef = useRef<string>('');
  useEffect(() => {
    let hasUntagged = false;
    const normalizedVersions = versions.map(v => {
      if (!v.year || !String(v.year).trim()) {
        hasUntagged = true;
        const inferredYear = v.name?.match(/(202\d|203\d)/i)?.[1] || '2026';
        return { ...v, year: String(inferredYear) };
      }
      return v;
    });

    if (hasUntagged) {
      const currentUntaggedFingerprint = versions.filter(v => !v.year || !String(v.year).trim()).map(v => v.id).join('|');
      if (currentUntaggedFingerprint && currentUntaggedFingerprint !== normalizedYearVersionIdsRef.current) {
        normalizedYearVersionIdsRef.current = currentUntaggedFingerprint;
        setVersions(normalizedVersions);
      }
    }
  }, [versions, setVersions]);

  const viewVersionId = (activeVersionId && filteredVersions.some(v => v.id === activeVersionId))
    ? activeVersionId
    : (filteredVersions[0]?.id || null);

  const activeVersion = versions.find((v) => v.id === viewVersionId);
  const isVersionActive = true; // Always permanently active per system mandate

  // ============================================================================
  // 3-TIER ARCHITECTURE FOR DYNAMIC RULES
  // Tier 1: Memory Evaluation (0ms on RAM)
  // Tier 2: Debounce Cloud Saver (5000ms delay)
  // Pure In-Memory Version Management (Senior Coder Architecture: 0ms RAM, zero redundant R2 writes)
  const storeRef = useRef(store);
  storeRef.current = store;
  const versionsRef = useRef(versions);
  versionsRef.current = versions;

  const [cloudSyncStatus, setCloudSyncStatus] = useState<BackgroundSyncStatus>('idle');

  useEffect(() => {
    const unsub = subscribeBackgroundSyncStatus((status) => {
      setCloudSyncStatus(status);
    });
    return unsub;
  }, []);

  const syncDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Wrap setVersions to update Zustand and RAM state instantly (0ms) and background sync across devices
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

  // Tier 1: Auto-Evaluate in RAM (0ms execution, <3ms across all units, zero Firestore & R2 writes)
  useDynamicRules({
    units,
    versions,
    setVersions,
    setUnits,
    store,
    year: effectiveYear,
    autoEvaluate: true,
  });

  const toggleVersionActive = () => {
    if (!activeVersion) return;
    // Always keep isDynamicActive: true permanently
    updateVersions(versions.map(v => ({ ...v, isDynamicActive: true })));
  };

  const { summaryMap, summaryList, groupStats } = useDynamicUnitSummary({
    units,
    activeVersion,
    store,
    location,
    year: String(effectiveYear),
  });

  // Pre-index summaryList by matchedGroupId and units by id/name for O(1) group card rendering
  const matchedUnitIdsByGroupId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (let i = 0; i < summaryList.length; i++) {
      const item = summaryList[i];
      if (!item.matchedGroupId) continue;
      let list = map.get(item.matchedGroupId);
      if (!list) {
        list = [];
        map.set(item.matchedGroupId, list);
      }
      list.push(item.unitId);
    }
    return map;
  }, [summaryList]);

  const unitLookupMap = useMemo(() => {
    const map = new Map<string, UnitShape>();
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (u.id) map.set(u.id, u);
      if (u.name) map.set(u.name.toLowerCase(), u);
    }
    return map;
  }, [units]);

  const applyRules = async () => {
    try {
      const { totalEvaluatedUnits } = applyAllDynamicRulesForStore(store);
      const allUpdatedVersions = useDataStore.getState().getAllStoreVersions(store);
      const allUpdatedUnits = useDataStore.getState().getAllStoreUnits(store);

      setVersions(allUpdatedVersions);
      setUnits(allUpdatedUnits);

      // Immediately trigger background R2 sync when user confirms and applies rules
      await triggerBackgroundR2Sync(store);

      alert(`Đã áp dụng điều kiện logic cho toàn bộ các version trên tất cả các tầng tại ${store} (${totalEvaluatedUnits} units). Dữ liệu đã được lưu lên Cloudflare R2.`);
    } catch (err: any) {
      console.error("Lỗi khi áp dụng rules:", err);
      alert(`Có lỗi xảy ra khi áp dụng rules: ${err?.message || err}`);
    }
  };

  const currentLocationUnits = useMemo(() => {
    if (!location) return units;
    const matched = units.filter(u => !u.location || u.location === location);
    return matched.length > 0 ? matched : units;
  }, [units, location]);

  const addVersion = () => {
    const name = prompt(`Tên version mới cho [${store} - ${location} - ${effectiveYear}]:`);
    if (name) {
      const existingVer = versions.find(v => (v.location === location || !v.location) && (v.groups || []).length > 0);
      const existingBg = versions.find(v => (v.location === location || !v.location) && v.backgroundUrl)?.backgroundUrl || null;
      
      const inheritedGroups = existingVer ? existingVer.groups.map(g => ({
        ...g,
        id: uuidv4(),
        rules: g.rules ? g.rules.map(r => ({ ...r })) : [],
      })) : [];

      const newVersion: MapVersion = {
        id: uuidv4(),
        name,
        backgroundUrl: existingBg,
        backgroundScale: 1,
        backgroundPos: { x: 0, y: 0 },
        groups: inheritedGroups,
        groupMappings: {},
        store,
        location,
        isDynamicActive: true,
        year: String(effectiveYear),
      };
      updateVersions([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  };

  const duplicateVersion = () => {
    if (!activeVersion) return;
    const name = prompt("Tên version mới (bản sao):", `${activeVersion.name} (Copy)`);
    if (name) {
      const newVersionId = uuidv4();
      const newGroups = (activeVersion.groups || []).map(g => ({
        ...g,
        id: uuidv4(),
        rules: g.rules ? g.rules.map(r => ({ ...r })) : [],
      }));
      const newGroupMappings: Record<string, string[]> = {};
      (activeVersion.groups || []).forEach((g, idx) => {
        const newGId = newGroups[idx]?.id;
        if (newGId) {
          newGroupMappings[newGId] = [...(activeVersion.groupMappings?.[g.id] || [])];
        }
      });

      const newVersion: MapVersion = {
        ...activeVersion,
        id: newVersionId,
        name,
        store: store || activeVersion.store || 'HCM',
        location: location || activeVersion.location || 'L1',
        year: String(effectiveYear),
        groups: newGroups,
        groupMappings: newGroupMappings,
        isDynamicActive: true,
      };
      updateVersions([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  };

  const deleteVersion = () => {
    if (!activeVersion) return;
    if (!confirm(`Bạn có chắc muốn xoá version "${activeVersion.name}" (${activeVersion.store || store} - ${activeVersion.location || location} - ${activeVersion.year || effectiveYear})?`))
      return;
    const newVersions = versions.filter((v) => v.id !== activeVersion.id);
    updateVersions(newVersions);

    // Find remaining version in the same partition (store, location, effectiveYear)
    const remainingInPartition = newVersions.filter(v => {
      const matchStore = !v.store || v.store === store;
      const matchLoc = !v.location || v.location === location;
      const matchYear = String(v.year || '').trim() === String(effectiveYear).trim();
      return matchStore && matchLoc && matchYear;
    });

    setActiveVersionId(remainingInPartition.length > 0 ? remainingInPartition[0].id : null);
  };

  const addGroup = () => {
    if (!activeVersion) return alert("Hãy tạo hoặc chọn một Version trước.");
    const name = prompt("Tên group mới cho version này:");
    if (name) {
      const color =
        "#" +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, "0");
      const newGroup = { id: uuidv4(), name, color, rules: [] };

      updateVersions(
        versions.map((v) => {
          if (v.id === activeVersion.id) {
            return {
              ...v,
              groups: [...(v.groups || []), newGroup],
              groupMappings: { ...v.groupMappings, [newGroup.id]: [] },
            };
          }
          return v;
        }),
      );
    }
  };

  const deleteGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Xoá group này khỏi version hiện tại?")) return;
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          const newMappings = { ...v.groupMappings };
          delete newMappings[id];
          return {
            ...v,
            groups: v.groups.filter((g) => g.id !== id),
            groupMappings: newMappings,
          };
        }
        return v;
      }),
    );
  };

  const renameGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const group = activeVersion?.groups.find(g => g.id === id);
    if (!group) return;
    const newName = prompt("Đổi tên group:", group.name);
    if (newName && newName !== group.name) {
      updateVersions(
        versions.map((v) => {
          if (v.id === viewVersionId) {
            return {
              ...v,
              groups: v.groups.map((g) =>
                g.id === id ? { ...g, name: newName } : g,
              ),
            };
          }
          return v;
        }),
      );
    }
  };

  const updateGroupColor = (groupId: string, color: string) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) =>
              g.id === groupId ? { ...g, color } : g,
            ),
          };
        }
        return v;
      }),
    );
  };

  const updateGroupOpacity = (groupId: string, opacity: number) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) =>
              g.id === groupId ? { ...g, opacity } : g,
            ),
          };
        }
        return v;
      }),
    );
  };

  const updateGroupHatchPattern = (groupId: string, hatchPattern: HatchPatternType) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) =>
              g.id === groupId ? { ...g, hatchPattern } : g,
            ),
          };
        }
        return v;
      }),
    );
  };

  const updateGroupSymbol = (groupId: string, symbol: string) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) =>
              g.id === groupId ? { ...g, symbol } : g,
            ),
          };
        }
        return v;
      }),
    );
  };

  const addRuleToGroup = (groupId: string) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) => {
              if (g.id === groupId) {
                const newRules = [
                  ...(g.rules || []),
                  { field: "sales", operator: ">", value: "0" },
                ];
                return { ...g, rules: newRules };
              }
              return g;
            }),
          };
        }
        return v;
      }),
    );
  };

  const updateRule = (
    groupId: string,
    ruleIndex: number,
    attr: keyof GroupRule,
    value: string,
  ) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) => {
              if (g.id === groupId && g.rules) {
                const newRules = [...g.rules];
                newRules[ruleIndex] = { ...newRules[ruleIndex], [attr]: value };
                return { ...g, rules: newRules };
              }
              return g;
            }),
          };
        }
        return v;
      }),
    );
  };

  const deleteRule = (groupId: string, ruleIndex: number) => {
    updateVersions(
      versions.map((v) => {
        if (v.id === viewVersionId) {
          return {
            ...v,
            groups: v.groups.map((g) => {
              if (g.id === groupId && g.rules) {
                const newRules = [...g.rules];
                newRules.splice(ruleIndex, 1);
                return { ...g, rules: newRules };
              }
              return g;
            }),
          };
        }
        return v;
      }),
    );
  };

  const copyGroups = (sourceVersionId: string) => {
    const sourceVersion = versions.find((v) => v.id === sourceVersionId);
    if (!sourceVersion || !activeVersion) return;

    if (!confirm(`Bạn có chắc muốn copy groups từ version "${sourceVersion.name}"?\n(Các group hiện tại trong version này sẽ bị thay thế)`)) {
      return;
    }

    const newGroups = sourceVersion.groups.map(g => ({ ...g, id: uuidv4() }));
    const newGroupMappings: Record<string, string[]> = {};
    
    sourceVersion.groups.forEach((g, idx) => {
        const newId = newGroups[idx].id;
        newGroupMappings[newId] = [...(sourceVersion.groupMappings[g.id] || [])];
    });

    updateVersions(
      versions.map((v) => {
        if (v.id === activeVersion.id) {
          return {
            ...v,
            groups: newGroups,
            groupMappings: newGroupMappings,
          };
        }
        return v;
      }),
    );
  };

  const activeGroups = activeVersion?.groups || [];

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex-1 bg-slate-900/50 rounded-xl border border-slate-800/50 p-2.5 sm:p-3 glass flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between mb-2.5 shrink-0 flex-wrap gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Calculator size={14} className="text-brand-500" /> Dynamic Hierarchy
            </h3>

            {/* Year Filter */}
            <div className="flex items-center gap-1 bg-slate-950 border border-slate-700 px-2 py-0.5 rounded-md shadow-inner">
              <Calendar size={11} className="text-brand-400" />
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Year:</span>
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] text-white font-bold outline-none cursor-pointer hover:text-brand-300 transition-colors"
                title="Filter Dynamic Hierarchy by Year"
              >
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-slate-950 text-white font-semibold">{y}</option>
                ))}
              </select>
            </div>

            {/* Version Select */}
            <select
              className="bg-slate-950 text-white text-[11px] font-semibold px-2.5 py-1 rounded-md border border-slate-700 outline-none cursor-pointer hover:border-brand-500 transition-colors"
              value={viewVersionId || ""}
              onChange={(e) =>
                setActiveVersionId(
                  e.target.value === "" ? null : e.target.value,
                )
              }
            >
              {!viewVersionId && <option value="">-- No Version for {location} ({effectiveYear}) --</option>}
              {filteredVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <div className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950 text-slate-300 border border-slate-700 text-[10px] font-semibold" title="Quy hoạch phân vùng dữ liệu theo Store, Vị trí và Năm">
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
                  {/* Memory & Cloud Status Indicator */}
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

                  {versions.filter(v => v.id !== activeVersion.id && (v.groups || []).length > 0).length > 0 && (
                    <select
                      className="bg-slate-800 hover:bg-slate-700 text-brand-400 text-[10px] font-bold uppercase px-2 py-1 rounded-md border border-slate-700 outline-none transition-colors cursor-pointer"
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                            copyGroups(e.target.value);
                            e.target.value = "";
                        }
                      }}
                    >
                        <option value="">[ Copy Groups From ]</option>
                        {versions
                          .filter(v => v.id !== activeVersion.id && (v.groups || []).length > 0)
                          .map(v => (
                            <option key={v.id} value={v.id}>
                              {v.store ? `[${v.store}] ` : ""}{v.location ? `[${v.location}] ` : ""}{v.name}{v.year ? ` • ${v.year}` : ""} ({v.groups.length} {v.groups.length === 1 ? 'group' : 'groups'})
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
                    {versions.filter(v => v.id !== activeVersion.id && (v.groups || []).length > 0).map(v => (
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
                  const assignedUnits = (group.rules && group.rules.length > 0)
                    ? (matchedUnitIdsByGroupId.get(group.id) || [])
                    : (activeVersion.groupMappings[group.id] || []);
                  return (
                    <DynamicGroupCard
                      key={group.id}
                      group={group}
                      matchedUnits={assignedUnits}
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

              {/* Real-time Dynamic Unit Summary Table (Bảng Tổng Hợp So Sánh & Màu Tô) */}
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
