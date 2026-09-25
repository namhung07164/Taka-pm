import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
import { getStatus, enrichProjects, computeProjectActStatus } from "../../../../lib/utils";
import Papa from "papaparse";
import { ColorPicker } from "../ColorPicker";
import { useDataStore } from "../../DataContext";
import { useShallow } from "zustand/react/shallow";
import {
  applyAllDynamicRulesForStore,
  triggerBackgroundR2Sync,
  subscribeBackgroundSyncStatus,
  BackgroundSyncStatus,
} from "../../lib/dynamicExportService";
import { useDynamicRules } from "../../hooks/useDynamicRules";

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
  if (f === "appMdStatus" || f === "app:md status") return "appProjectMdStatus";
  if (f === "appActStatus" || f === "app: act status") return "appProjectActStatus";
  if (f === "appDetail" || f === "app: detail (project)") return "appProjectDetail";
  if (f === "appDescription" || f === "app: description (project)" || f === "description (project)") return "appProjectDescription";
  if (f === "appParty" || f === "app: party") return "appProjectParty";
  return f;
};

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
  const summaryData = useSummaryData();
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const delegationGroups = useAppStore(state => state.delegationGroups);
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

  // Ensure strict year tagging for legacy versions without auto-creating deleted versions
  useEffect(() => {
    let hasUntagged = false;
    const normalizedVersions = versions.map(v => {
      if (!v.year || !String(v.year).trim()) {
        hasUntagged = true;
        return { ...v, year: String(effectiveYear || '2026') };
      }
      return v;
    });

    if (hasUntagged) {
      setVersions(normalizedVersions);
    }
  }, [effectiveYear, versions, setVersions]);

  const viewVersionId = (activeVersionId && filteredVersions.some(v => v.id === activeVersionId))
    ? activeVersionId
    : (filteredVersions[0]?.id || null);

  const activeVersion = versions.find((v) => v.id === viewVersionId);
  const isVersionActive = true; // Always permanently active per system mandate

  // ============================================================================
  // 3-TIER ARCHITECTURE FOR DYNAMIC RULES
  // Tier 1: Memory Evaluation (0ms on RAM)
  // Tier 2: Debounce Cloud Saver (5000ms delay)
  // Tier 3: Auto-Save On Unmount / Tab Switch
  // ============================================================================
  const isDirtyRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const versionsRef = useRef(versions);
  versionsRef.current = versions;

  const [cloudSyncStatus, setCloudSyncStatus] = useState<BackgroundSyncStatus>('idle');
  const [isDebouncePending, setIsDebouncePending] = useState(false);

  useEffect(() => {
    const unsub = subscribeBackgroundSyncStatus((status) => {
      setCloudSyncStatus(status);
      if (status === 'saved') {
        setIsDebouncePending(false);
      }
    });
    return unsub;
  }, []);

  const scheduleDebounceSave = useCallback(() => {
    isDirtyRef.current = true;
    setIsDebouncePending(true);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      if (isDirtyRef.current) {
        setIsDebouncePending(false);
        triggerBackgroundR2Sync(storeRef.current);
        isDirtyRef.current = false;
      }
    }, 5000);
  }, []);

  // Tier 3: Auto-Save On Unmount / Tab Switch
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (isDirtyRef.current) {
        triggerBackgroundR2Sync(storeRef.current);
        isDirtyRef.current = false;
      }
    };
  }, []);

  // Flush on browser tab close / refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isDirtyRef.current) {
        triggerBackgroundR2Sync(storeRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Wrap setVersions to automatically schedule 5s debounced cloud save
  const updateVersionsWithDebounce = useCallback(
    (newVersions: MapVersion[]) => {
      setVersions(newVersions);
      scheduleDebounceSave();
    },
    [setVersions, scheduleDebounceSave]
  );

  // Tier 1: Auto-Evaluate in RAM (0ms execution, <3ms across all units, zero Firestore reads/writes)
  useDynamicRules({
    units,
    versions,
    setVersions,
    setUnits,
    store,
    year: effectiveYear,
    autoEvaluate: true,
    onDirtyChange: scheduleDebounceSave,
  });

  const toggleVersionActive = () => {
    if (!activeVersion) return;
    // Always keep isDynamicActive: true permanently
    updateVersionsWithDebounce(versions.map(v => ({ ...v, isDynamicActive: true })));
  };

  const unitNamesStr = useMemo(() => JSON.stringify(units.map(u => ({ id: u.id, name: u.name, location: u.location }))), [units]);

  // Pre-compute aggregated data for unit evaluation
  const enrichedProjects = useMemo(() => enrichProjects(projects, tasks, delegationGroups), [projects, tasks, delegationGroups]);

  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};

    // Initialize with mapped shapes
    const parsedUnits = JSON.parse(unitNamesStr);
    parsedUnits.forEach((u: any) => {
      const uName = (u.name || '').toLowerCase();
      if (!uName) return;
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        year: "",
        size: 0,
        sales: 0,
        salesByCp: 0,
        salesByHcmcate: 0,
        profit: 0,
        profitByCp: 0,
        profitByHcmcate: 0,
        margin: 0,
        marginByCp: 0,
        hcmSalesEffi: 0,
        hcmMargin: 0,
        mdStatus: "",
        task: "",
        projectStatus: "",
        actStatus: "",
        startDate: "",
        endDate: "",
        status: "",
        vendorCode: "",
        brandCode: "",
        brandName: "",
        classCode: "",
        floor: u.location || "",
        appProjectStatus: "",
        appProjectBudget: 0,
        appProjectActual: 0,
        appProjectCode: "",
        appProjectYear: "",
        appProjectMdStatus: "",
        appMdStatus: "",
        appProjectActStatus: "",
        appActStatus: "",
        appProjectDetail: "",
        appDetail: "",
        appProjectDescription: "",
        appDescription: "",
        appProjectParty: "",
        appParty: "",
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase();
      if (key && dataMap[key]) {
        dataMap[key].size = sumData.size || 0;
        dataMap[key].sales = sumData.salesAmount || 0;
        dataMap[key].salesByCp = sumData.salesByCp || 0;
        dataMap[key].salesByHcmcate = sumData.salesByHcmcate || 0;
        dataMap[key].profit = sumData.profitAmount || 0;
        dataMap[key].profitByCp = sumData.profitByCp || 0;
        dataMap[key].profitByHcmcate = sumData.profitByHcmcate || 0;
        dataMap[key].margin = sumData.margin || 0;
        dataMap[key].marginByCp = sumData.marginByCp || 0;
        dataMap[key].hcmSalesEffi = sumData.hcmSalesEffi || 0;
        dataMap[key].hcmMargin = sumData.hcmMargin || 0;
        dataMap[key].mdStatus = sumData.mdStatus || "";
        dataMap[key].task = sumData.task || "";
        dataMap[key].projectStatus = sumData.projectStatus || "";
        dataMap[key].actStatus = sumData.actStatus || "";
        dataMap[key].startDate = sumData.startDate || "";
        dataMap[key].endDate = sumData.endDate || "";
        dataMap[key].status = sumData.status || "";
        dataMap[key].vendorCode = sumData.vendorCode || "";
        dataMap[key].brandCode = sumData.brandCode || "";
        dataMap[key].brandName = sumData.brandName || "";
        dataMap[key].classCode = sumData.classCode || "";
        dataMap[key].floor = dataMap[key].floor || (sumData as any).floor || "";
        dataMap[key].year = (sumData as any).year || dataMap[key].year || "";
      }
    });

    // Merge real Project data synchronized by globalYearFilter
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;
      const pYear = String(p.year || (p as any).projectYear || '').trim();
      if (globalYearFilter && globalYearFilter !== 'all' && pYear && pYear !== String(globalYearFilter)) return;

      const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
      const pCodes = rawCodes.split(/[+;,/]+/).map(c => c.trim().toLowerCase()).filter(Boolean);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);
      const detailStr = p.detail || '';
      const descStr = p.detail || (p as any).description || '';
      const partyStr = p.party || (p as any).contractor || '';
      const mdStatusStr = p.mdStatus || '';

      pCodes.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].appProjectStatus = status;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code);
            dataMap[code].appProjectYear = pYear;

            dataMap[code].appProjectMdStatus = mdStatusStr;
            dataMap[code].appMdStatus = mdStatusStr;

            dataMap[code].appProjectActStatus = actStatus;
            dataMap[code].appActStatus = actStatus;

            dataMap[code].appProjectDetail = detailStr;
            dataMap[code].appDetail = detailStr;

            dataMap[code].appProjectDescription = descStr;
            dataMap[code].appDescription = descStr;

            dataMap[code].appProjectParty = partyStr;
            dataMap[code].appParty = partyStr;

            if (!dataMap[code].year) dataMap[code].year = pYear;
         }
      });
    });

    return dataMap;
  }, [unitNamesStr, summaryData, enrichedProjects, globalYearFilter, delegationGroups]);

  // Evaluates rules for a given group against a unit shape
  const matchRules = (unit: UnitShape, rules: GroupRule[] | undefined) => {
    if (!rules || rules.length === 0) return false;
    const uName = (unit.name || '').toLowerCase();
    const data = uName ? aggregatedData[uName] : null;
    if (!data) return false;

    // Must pass all rules (AND condition)
    return rules.every((rule) => {
      let val = data[rule.field];
      if (val === undefined || val === null) {
        if (rule.field === 'appProjectMdStatus' || rule.field === 'appMdStatus' || rule.field === 'app:md status') {
          val = data.appProjectMdStatus ?? '';
        } else if (rule.field === 'appProjectActStatus' || rule.field === 'appActStatus' || rule.field === 'app: act status') {
          val = data.appProjectActStatus ?? '';
        } else if (rule.field === 'appProjectDetail' || rule.field === 'appDetail' || rule.field === 'app: detail (project)') {
          val = data.appProjectDetail ?? '';
        } else if (rule.field === 'appProjectDescription' || rule.field === 'appDescription' || rule.field === 'app: description (project)' || rule.field === 'description (project)') {
          val = data.appProjectDescription ?? '';
        } else if (rule.field === 'appProjectParty' || rule.field === 'appParty' || rule.field === 'app: party') {
          val = data.appProjectParty ?? '';
        } else if (rule.field === 'appProjectStatus' || rule.field === 'appStatus' || rule.field === 'app: status') {
          val = data.appProjectStatus ?? '';
        } else if (rule.field === 'appProjectYear' || rule.field === 'appYear' || rule.field === 'app: year') {
          val = data.appProjectYear ?? '';
        } else if (rule.field === 'appProjectCode' || rule.field === 'appCode' || rule.field === 'app: project code') {
          val = data.appProjectCode ?? '';
        }
      }

      if (rule.field === "margin" || rule.field === "marginByCp") {
        val = val * 100; // evaluate margin as percentage, e.g. 25 instead of 0.25
      }

      const numVal = Number(rule.value);
      const isNum = !isNaN(numVal) && rule.value.trim() !== "";
      
      let res = false;
      
      let compareValStr = String(val || "").toLowerCase().trim();
      let compareRuleStr = String(rule.value || "").toLowerCase().trim();
      if (compareRuleStr === "in progress") compareRuleStr = "on process";
      if (compareValStr === "in progress") compareValStr = "on process";

      switch (rule.operator) {
        case ">":
          res = isNum ? Number(val) > numVal : false; break;
        case "<":
          res = isNum ? Number(val) < numVal : false; break;
        case ">=":
          res = isNum ? Number(val) >= numVal : false; break;
        case "<=":
          res = isNum ? Number(val) <= numVal : false; break;
        case "=":
          res = compareValStr === compareRuleStr; break;
        case "contains": {
          const searchTerms = compareRuleStr.split(/\s+/);
          res = searchTerms.every(term => compareValStr.includes(term));
          break;
        }
        case "exclude": {
          const searchTerms = compareRuleStr.split(/\s+/);
          res = !searchTerms.some(term => compareValStr.includes(term));
          break;
        }
        default:
          res = false; break;
      }
      
      return res;
    });
  };

  const applyRules = async () => {
    try {
      const { totalEvaluatedUnits } = applyAllDynamicRulesForStore(store);
      const allUpdatedVersions = useDataStore.getState().getAllStoreVersions(store);
      const allUpdatedUnits = useDataStore.getState().getAllStoreUnits(store);

      setVersions(allUpdatedVersions);
      setUnits(allUpdatedUnits);

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      isDirtyRef.current = false;
      setIsDebouncePending(false);

      // Immediately trigger background R2 sync
      await triggerBackgroundR2Sync(store);

      alert(`Đã áp dụng điều kiện logic cho toàn bộ các version trên tất cả các tầng tại ${store} (${totalEvaluatedUnits} units). Dữ liệu đã được lưu ngầm lên Cloudflare R2.`);
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
      updateVersionsWithDebounce([...versions, newVersion]);
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
      updateVersionsWithDebounce([...versions, newVersion]);
      setActiveVersionId(newVersion.id);
    }
  };

  const deleteVersion = () => {
    if (!activeVersion) return;
    if (!confirm(`Bạn có chắc muốn xoá version "${activeVersion.name}" (${activeVersion.store || store} - ${activeVersion.location || location} - ${activeVersion.year || effectiveYear})?`))
      return;
    const newVersions = versions.filter((v) => v.id !== activeVersion.id);
    updateVersionsWithDebounce(newVersions);

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

      updateVersionsWithDebounce(
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
    updateVersionsWithDebounce(
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
      updateVersionsWithDebounce(
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
    updateVersionsWithDebounce(
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
    updateVersionsWithDebounce(
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

  const addRuleToGroup = (groupId: string) => {
    updateVersionsWithDebounce(
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
    updateVersionsWithDebounce(
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
    updateVersionsWithDebounce(
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

    updateVersionsWithDebounce(
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
    <div className="flex flex-col h-full gap-6">
      <div className="flex-1 bg-slate-900/50 rounded-2xl border border-slate-800/50 p-6 glass flex flex-col relative overflow-hidden">
        <div className="flex items-center justify-between mb-8 shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-white uppercase tracking-widest flex items-center gap-3">
              <Calculator className="text-brand-500" /> Dynamic Hierarchy
            </h3>

            {/* Year Filter */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg shadow-inner">
              <Calendar size={13} className="text-brand-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Year:</span>
              <select
                value={effectiveYear}
                onChange={(e) => setGlobalYearFilter(e.target.value)}
                className="bg-transparent border-none text-xs text-white font-bold outline-none cursor-pointer hover:text-brand-300 transition-colors"
                title="Filter Dynamic Hierarchy by Year"
              >
                {availableYears.map(y => (
                  <option key={y} value={y} className="bg-slate-950 text-white font-semibold">{y}</option>
                ))}
              </select>
            </div>

            {/* Version Select */}
            <select
              className="bg-slate-950 text-white text-sm px-4 py-2 rounded-lg border border-slate-700 outline-none cursor-pointer hover:border-brand-500 transition-colors"
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
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 text-slate-300 border border-slate-700 text-xs font-semibold" title="Quy hoạch phân vùng dữ liệu theo Store, Vị trí và Năm">
              <span className="text-brand-400 font-bold">{store}</span>
              <span className="text-slate-600">•</span>
              <span className="text-purple-400 font-bold">{location}</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400 font-bold">{effectiveYear}</span>
              <span className="text-slate-500 text-[11px]">({currentLocationUnits.length} units)</span>
            </div>
            {activeVersion && (
              <>
                <button
                  onClick={toggleVersionActive}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors shrink-0 bg-emerald-600/20 text-emerald-400 border border-emerald-500/50 flex items-center gap-1.5 shadow-sm"
                  title="Dynamic Rules is permanently enabled (Always ON)"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Dynamic Active: ALWAYS ON
                </button>
                <button
                  onClick={duplicateVersion}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-brand-400 transition-colors"
                  title="Duplicate version"
                >
                  <Copy size={16} />
                </button>
                <button
                  onClick={deleteVersion}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
                  title="Delete version"
                >
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={addVersion}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold uppercase shadow-lg hover:bg-brand-500 transition-colors"
            >
              <Plus size={14} /> New Version
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {activeVersion ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 flex-wrap gap-2">
                <h4 className="text-sm font-bold text-slate-300 uppercase tracking-widest">
                  Rule-Based Groups
                </h4>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* 3-Tier Status Indicator */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="Tier 1: Đánh giá RAM 0ms" />
                    <span className="text-slate-300 font-semibold">RAM 0ms</span>
                    <span className="text-slate-600">•</span>
                    {isDebouncePending ? (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                        Chờ Cloud (5s)...
                      </span>
                    ) : cloudSyncStatus === 'syncing' ? (
                      <span className="text-cyan-400 font-semibold flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Lưu R2 ngầm...
                      </span>
                    ) : cloudSyncStatus === 'saved' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={12} className="text-emerald-400" />
                        R2 Đã lưu
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Cloud size={12} className="text-slate-500" />
                        R2 Tự động
                      </span>
                    )}
                  </div>

                  <button
                    onClick={applyRules}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase transition-colors shadow-lg shadow-brand-900/20 box-border border-2 border-brand-400 active:scale-95"
                  >
                    <Calculator size={12} /> Apply Rules
                  </button>
                  <button
                    onClick={addGroup}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-brand-400 text-xs font-bold uppercase transition-colors active:scale-95"
                  >
                    <Plus size={12} /> Create Group
                  </button>

                  {versions.filter(v => v.id !== activeVersion.id && (v.groups || []).length > 0).length > 0 && (
                    <select
                      className="bg-slate-800 hover:bg-slate-700 text-brand-400 text-xs font-bold uppercase px-3 py-1.5 rounded-lg border border-slate-700 outline-none transition-colors cursor-pointer"
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
                <div className="text-center py-10 px-6 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-950/40 text-slate-400 flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                    <Calculator size={24} />
                  </div>
                  <p className="text-sm font-semibold text-slate-300">
                    Phiên bản này ({activeVersion.name} • {activeVersion.year || effectiveYear}) chưa có nhóm phân loại & quy tắc.
                  </p>
                  <p className="text-xs text-slate-500 max-w-md">
                    Mỗi phiên bản (theo từng năm) có nhóm quy tắc riêng. Bạn có thể sao chép nhanh từ phiên bản năm khác hoặc tự tạo nhóm mới.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
                    <button
                      onClick={addGroup}
                      className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold uppercase transition-colors shadow-md flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Tạo nhóm mới
                    </button>
                    {versions.filter(v => v.id !== activeVersion.id && (v.groups || []).length > 0).map(v => (
                      <button
                        key={v.id}
                        onClick={() => copyGroups(v.id)}
                        className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-brand-400 border border-slate-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                      >
                        <Copy size={13} /> Copy từ {v.name} ({v.year || 'N/A'})
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {activeGroups.map((group) => {
                  const assignedUnits =
                    activeVersion.groupMappings[group.id] || [];
                  return (
                    <div
                      key={group.id}
                      className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/80 hover:border-brand-500/50 transition-colors"
                    >
                      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ColorPicker
                            color={group.color}
                            onChange={(color) => updateGroupColor(group.id, color)}
                            className="shrink-0"
                          />
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={group.opacity ?? 0.6}
                            title={`Opacity: ${group.opacity ?? 0.6}`}
                            onChange={(e) =>
                              updateGroupOpacity(
                                group.id,
                                parseFloat(e.target.value),
                              )
                            }
                            className="w-12 h-1 accent-brand-500 shrink-0 cursor-pointer"
                          />
                          <span 
                            className="text-sm font-bold text-white ml-2 cursor-pointer hover:text-brand-400 transition-colors flex items-center gap-2 group/title"
                            onClick={(e) => renameGroup(group.id, e)}
                          >
                            {group.name}
                            <Edit2 size={10} className="opacity-0 group-hover/title:opacity-100" />
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-slate-300 bg-slate-700 px-2 py-1 rounded-md font-medium">
                            {assignedUnits.length} Matches
                          </span>
                          <button
                            onClick={(e) => deleteGroup(group.id, e)}
                            className="p-1 text-slate-400 hover:text-red-400"
                            title="Delete group"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase text-slate-500 font-bold">
                            Conditions API
                          </span>
                          <button
                            onClick={() => addRuleToGroup(group.id)}
                            className="text-[10px] uppercase font-bold text-brand-400 hover:text-brand-300 flex items-center gap-1"
                          >
                            <Plus size={12} /> Add Rule
                          </button>
                        </div>

                        {(!group.rules || group.rules.length === 0) && (
                          <div className="text-xs text-slate-500 italic">
                            No rules defined. Add a rule to dynamically assign
                            units.
                          </div>
                        )}

                        {group.rules &&
                          group.rules.map((rule, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800"
                            >
                              <select
                                className="bg-slate-900 text-slate-300 text-sm outline-none w-1/3 flex-shrink-0 px-2 py-1 rounded border border-slate-700"
                                value={normalizeRuleField(rule.field)}
                                onChange={(e) =>
                                  updateRule(
                                    group.id,
                                    idx,
                                    "field",
                                    e.target.value,
                                  )
                                }
                              >
                                <optgroup label="Metrics">
                                  <option value="sales">Sales</option>
                                  <option value="salesByCp">Sales by CP</option>
                                  <option value="salesByHcmcate">Sales by HCMcate</option>
                                  <option value="margin">Margin</option>
                                  <option value="marginByCp">Margin by CP</option>
                                  <option value="profit">Profit</option>
                                  <option value="profitByCp">Profit by CP</option>
                                  <option value="profitByHcmcate">Profit by HCMcate</option>
                                  <option value="hcmSalesEffi">HCM Sales Effi</option>
                                  <option value="hcmMargin">HCM Margin</option>
                                </optgroup>
                                <optgroup label="Attributes">
                                  <option value="unit">Unit</option>
                                  <option value="year">Year</option>
                                  <option value="size">Size</option>
                                  <option value="floor">Floor</option>
                                  <option value="classCode">Class Code</option>
                                  <option value="vendorCode">Vendor Code</option>
                                  <option value="brandCode">Brand Code</option>
                                  <option value="brandName">Brand Name</option>
                                  <option value="mdStatus">MD Status</option>
                                  <option value="mdNotes">MD Notes</option>
                                  <option value="task">Task</option>
                                  <option value="projectStatus">Project Status</option>
                                  <option value="actStatus">Act: Status</option>
                                  <option value="startDate">Start Date</option>
                                  <option value="endDate">End Date</option>
                                  <option value="status">Status</option>
                                </optgroup>
                                <optgroup label="App Data (Real-time)">
                                  <option value="appProjectStatus">App: Status</option>
                                  <option value="appProjectMdStatus">App: MD Status</option>
                                  <option value="appProjectActStatus">App: Act Status</option>
                                  <option value="appProjectDetail">App: Detail (Project)</option>
                                  <option value="appProjectDescription">App: Description (Project)</option>
                                  <option value="appProjectParty">App: Party</option>
                                  <option value="appProjectBudget">App: Budget</option>
                                  <option value="appProjectActual">App: Actual</option>
                                  <option value="appProjectCode">App: Project Code</option>
                                  <option value="appProjectYear">App: Year</option>
                                </optgroup>
                              </select>

                              <select
                                className="bg-slate-900 text-slate-300 text-sm px-2 py-1 rounded border border-slate-700 outline-none"
                                value={rule.operator}
                                onChange={(e) =>
                                  updateRule(
                                    group.id,
                                    idx,
                                    "operator",
                                    e.target.value,
                                  )
                                }
                              >
                                <option value=">">&gt;</option>
                                <option value="<">&lt;</option>
                                <option value=">=">&gt;=</option>
                                <option value="<=">&lt;=</option>
                                <option value="=">=</option>
                                <option value="contains">Contains (Bao gồm)</option>
                                <option value="exclude">Exclude (Ngoại trừ)</option>
                              </select>

                              <input
                                type="text"
                                className="bg-transparent text-slate-300 text-sm flex-1 outline-none border-b border-slate-700 focus:border-brand-500 px-1"
                                value={rule.value}
                                onChange={(e) =>
                                  updateRule(
                                    group.id,
                                    idx,
                                    "value",
                                    e.target.value,
                                  )
                                }
                                placeholder="Value..."
                              />

                              <button
                                onClick={() => deleteRule(group.id, idx)}
                                className="text-slate-500 hover:text-red-400 p-1"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}

                        {group.rules &&
                          group.rules.length > 0 &&
                          assignedUnits.length > 0 && (
                            <div className="pt-2 mt-2 border-t border-slate-800/50">
                              <span className="text-[10px] uppercase text-slate-500 font-bold mb-2 block">
                                Matched Units
                              </span>
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                {assignedUnits.map((uid) => {
                                  const u = units.find((x) => x.id === uid);
                                  return u ? (
                                    <div
                                      key={uid}
                                      className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 flex items-center gap-1.5"
                                    >
                                      {u.location && (
                                        <span className="text-[9px] px-1 py-0.2 rounded bg-purple-950/80 text-purple-300 font-bold border border-purple-800/40">
                                          {u.location}
                                        </span>
                                      )}
                                      <span>{u.name}</span>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
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
