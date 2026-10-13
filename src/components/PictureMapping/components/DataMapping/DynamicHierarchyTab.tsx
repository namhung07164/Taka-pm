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

  // Wrap setVersions to update Zustand and RAM state instantly (0ms)
  const updateVersions = useCallback(
    (newVersions: MapVersion[]) => {
      setVersions(newVersions);
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

  const unitNamesStr = useMemo(() => JSON.stringify(units.map(u => ({ id: u.id, name: u.name, location: u.location }))), [units]);

  // Pre-compute aggregated data for unit evaluation
  const enrichedProjects = useMemo(() => enrichProjects(projects, tasks, delegationGroups), [projects, tasks, delegationGroups]);

  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};

    // Pre-index tasks by project code
    const tasksByCodeMap = new Map<string, any[]>();
    tasks.forEach((t) => {
      if (!t || !t.name || !t.projectCode) return;
      const rawCode = String(t.projectCode).trim().toLowerCase();
      const codeParts = rawCode.split(/[+;,/]/).map((c) => c.trim()).filter(Boolean);
      codeParts.forEach((c) => {
        let list = tasksByCodeMap.get(c);
        if (!list) {
          list = [];
          tasksByCodeMap.set(c, list);
        }
        list.push(t);
      });
    });

    // Initialize with mapped shapes
    const parsedUnits = JSON.parse(unitNamesStr);
    parsedUnits.forEach((u: any) => {
      const uName = (u.name || '').toLowerCase();
      if (!uName) return;
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        year: String(effectiveYear),
        store: u.store || store || 'HCM',
        location: u.location || location || 'L1',
        floor: u.location || location || '',
        hasAppProject: false,
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
        dataMap[key].vendorCode = sumData.vendorCode || "";
        dataMap[key].brandCode = sumData.brandCode || "";
        dataMap[key].brandName = sumData.brandName || "";
        dataMap[key].classCode = sumData.classCode || "";
        dataMap[key].floor = dataMap[key].floor || (sumData as any).floor || "";
      }
    });

    // Merge real Project data synchronized strictly by effectiveYear, location and store
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;

      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store, location, year: effectiveYear })) return;

      const pCodes = extractAllProjectCodes(p);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);
      const detailStr = p.detail || '';
      const descStr = p.detail || (p as any).description || '';
      const partyStr = p.party || (p as any).contractor || '';
      const mdStatusStr = p.mdStatus || '';

      // Match tasks for this project
      const matchedTaskSet = new Set<any>();
      pCodes.forEach((c) => {
        const list = tasksByCodeMap.get(c);
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      });
      if (p.code) {
        const list = tasksByCodeMap.get(String(p.code).trim().toLowerCase());
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      }

      const now = new Date();
      let activeTaskNames: string[] = [];
      const allMatchedTasks = Array.from(matchedTaskSet);
      if (allMatchedTasks.length > 0) {
        const activeTasks = allMatchedTasks.filter((t: any) => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map((t: any) => t.name);
      } else if (p.taskSummaries && p.taskSummaries.length > 0) {
        const activeTasks = p.taskSummaries.filter((t: any) => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map((t: any) => t.name);
      }
      const taskSummaryStr = activeTaskNames.length > 0 
        ? activeTaskNames.join('; ')
        : (allMatchedTasks.map((t: any) => t.name).join('; ') || (p.taskSummaries?.map((t: any) => t.name).join('; ') || ''));

      const targetUnitKeys = new Set<string>();
      Object.keys(dataMap).forEach(uKey => {
        const uEntry = dataMap[uKey];
        if (!uEntry) return;
        const uStore = (uEntry.store || store || '').toUpperCase().trim();
        const uLoc = (uEntry.location || location || '').toUpperCase().trim();
        const uYr = String(uEntry.year || effectiveYear || '').trim();

        if (pMeta.store && uStore && pMeta.store !== uStore) return;
        const isStorewide = pMeta.location === 'ALL' || pMeta.location === 'STORE' || pMeta.location === 'STOREWIDE' || pMeta.location === 'WHOLE STORE' || pMeta.location === 'ALL FLOORS';
        if (pMeta.location && uLoc && !isStorewide && pMeta.location !== uLoc) return;
        if (pMeta.year && uYr && pMeta.year !== uYr) return;

        const isExactCode = pCodes.some(c => c.toLowerCase() === uKey.toLowerCase() || (uEntry.name && c.toLowerCase() === uEntry.name.toLowerCase()));
        if (isExactCode || projectMatchesUnitCode(pCodes, uKey) || (uEntry.name && projectMatchesUnitCode(pCodes, uEntry.name))) {
          targetUnitKeys.add(uKey);
        }
      });

      targetUnitKeys.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].hasAppProject = true;
            dataMap[code].appProjectStatus = status;
            dataMap[code].task = taskSummaryStr;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code || code);
            dataMap[code].appProjectYear = pMeta.year || (p.year ? String(p.year) : String(effectiveYear));
            dataMap[code].year = pMeta.year || (p.year ? String(p.year) : String(effectiveYear));

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
         }
      });
    });

    return dataMap;
  }, [unitNamesStr, summaryData, enrichedProjects, tasks, store, location, effectiveYear, delegationGroups]);

  // Evaluates rules for a given group against a unit shape
  const matchRules = (unit: UnitShape, rules: GroupRule[] | undefined) => {
    if (!rules || rules.length === 0) return false;
    const uName = (unit.name || '').toLowerCase();
    const data = uName ? aggregatedData[uName] : null;
    if (!data) return false;

    // Must pass all rules (AND condition)
    return rules.every((rule) => {
      let val = data[rule.field];
      const f = String(rule.field || '').toLowerCase().trim();

      // 1. Explicit App Data / Real-time Project checks (Strictly from App Projects & Live Task Summaries - ZERO Excel)
      if (f === 'appprojectstatus' || f === 'appstatus' || f === 'app: status' || f === 'status' || f === 'projectstatus') {
        val = data.hasAppProject ? (data.appProjectStatus || '') : '';
      } else if (f === 'apptask' || f === 'app: task' || f === 'app: task summarize' || f === 'app: task summaries' || f === 'app: tasks' || f === 'task' || f === 'tasks' || f === 'tasksummaries' || f === 'task summarize' || f === 'task summary' || f === 'task name') {
        val = data.hasAppProject ? (data.task || '') : '';
      } else if (f === 'appprojectyear' || f === 'appyear' || f === 'app: year') {
        val = data.hasAppProject ? (data.appProjectYear || '') : '';
      } else if (f === 'appprojectcode' || f === 'appcode' || f === 'app: project code') {
        val = data.hasAppProject ? (data.appProjectCode || '') : '';
      } else if (f === 'appprojectfloor' || f === 'appfloor' || f === 'app: floor') {
        val = data.hasAppProject ? (data.location || data.floor || '') : '';
      } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
        val = data.hasAppProject ? (data.appProjectMdStatus || '') : '';
      } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status' || f === 'actstatus') {
        val = data.hasAppProject ? (data.appProjectActStatus || '') : '';
      } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)' || f === 'detail') {
        val = data.hasAppProject ? (data.appProjectDetail || '') : '';
      } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)' || f === 'description (project)') {
        val = data.hasAppProject ? (data.appProjectDescription || '') : '';
      } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party' || f === 'party') {
        val = data.hasAppProject ? (data.appProjectParty || '') : '';
      } else if (f === 'appprojectbudget' || f === 'appbudget' || f === 'app: budget' || f === 'budget') {
        val = data.hasAppProject ? (data.appProjectBudget ?? 0) : 0;
      } else if (f === 'appprojectactual' || f === 'appactual' || f === 'app: actual' || f === 'actual') {
        val = data.hasAppProject ? (data.appProjectActual ?? 0) : 0;
      } else if (val === undefined || val === null || String(val).trim() === '') {
        // 2. General attribute fallbacks
        if (f === 'floor' || f === 'location') {
          val = data.floor || unit.location || location || '';
        } else if (f === 'year') {
          val = data.year || String(effectiveYear);
        } else if (f === 'mdstatus') {
          val = data.hasAppProject ? (data.appProjectMdStatus || data.mdStatus || '') : (data.mdStatus || '');
        } else if (f === 'unit' || f === 'code') {
          val = data.unit || data.appProjectCode || unit.name || '';
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
        case "or":
        case "OR": {
          const orTerms = compareRuleStr
            .split(/[\r\n\t,;+/&|]+|\s{2,}/)
            .map(t => {
              let tr = t.trim();
              if (tr === "in progress") tr = "on process";
              return tr;
            })
            .filter(Boolean);
          if (orTerms.length === 0) {
            const spaceTerms = compareRuleStr.split(/\s+/).filter(Boolean);
            res = spaceTerms.some(term => compareValStr === term || compareValStr.includes(term));
          } else {
            res = orTerms.some(term => {
              if (compareValStr === term) return true;
              if (compareValStr.includes(term)) return true;
              if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
              return false;
            });
          }
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
                  {/* Memory & Cloud Status Indicator */}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Tier 1: Đánh giá RAM 0ms" />
                    <span className="text-slate-300 font-semibold">RAM 0ms</span>
                    <span className="text-slate-600">•</span>
                    {cloudSyncStatus === 'syncing' ? (
                      <span className="text-cyan-400 font-semibold flex items-center gap-1 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                        Lưu R2...
                      </span>
                    ) : cloudSyncStatus === 'saved' ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Check size={12} className="text-emerald-400" />
                        R2 Đã lưu
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Cloud size={12} className="text-slate-500" />
                        R2 Sẵn sàng
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
                  const groupMatchedItems = summaryList.filter((item) => item.matchedGroupId === group.id);
                  const assignedUnits = (group.rules && group.rules.length > 0)
                    ? groupMatchedItems.map((item) => item.unitId)
                    : (activeVersion.groupMappings[group.id] || []);
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
                                  <option value="appTask">App: Task Summarize (Real-time)</option>
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
                                <option value="or">OR (Hoặc)</option>
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
                                  const u = units.find((x) => x.id === uid || (x.name && x.name.toLowerCase() === uid.toLowerCase()));
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
                                      <span className="font-semibold">{u.name}</span>
                                    </div>
                                  ) : (
                                    <div
                                      key={uid}
                                      className="text-[10px] px-2 py-1 rounded bg-slate-800 text-slate-300 flex items-center gap-1.5"
                                    >
                                      <span className="font-semibold">{uid}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Real-time Dynamic Unit Summary Table (Bảng Tổng Hợp So Sánh & Màu Tô) */}
              <div className="pt-4 border-t border-slate-800/80">
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
