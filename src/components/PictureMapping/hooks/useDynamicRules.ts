import React, { useEffect, useMemo, useCallback, useRef } from "react";
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { SummaryDataItem, calculateSummaryData } from '../lib/summaryData';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import {
  enrichProjects,
  getStatus,
  computeProjectActStatus,
  extractAllProjectCodes,
  projectMatchesUnitCode,
  extractProjectMetadata,
  projectMatchesScope,
} from '../../../lib/utils';

// ============================================================================
// TIER 1: MEMORY EVALUATION (0ms - 100% RAM EXECUTION)
// Evaluates rules on units in RAM (<3ms) with zero Firestore reads/writes.
// ============================================================================

export function matchRuleAgainstData(rule: GroupRule, data: Record<string, any>): boolean {
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
      val = data.floor || data.location || '';
    } else if (f === 'year') {
      val = data.year || '';
    } else if (f === 'mdstatus') {
      val = data.hasAppProject ? (data.appProjectMdStatus || data.mdStatus || '') : (data.mdStatus || '');
    } else if (f === 'unit' || f === 'code') {
      val = data.unit || data.appProjectCode || '';
    }
  }

  if (rule.field === 'margin' || rule.field === 'marginByCp' || rule.field === 'hcmMargin') {
    val = Number(val) * 100; // evaluate margin as percentage, e.g. 25 instead of 0.25
  }

  const numVal = Number(rule.value);
  const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

  let compareValStr = String(val ?? '').toLowerCase().trim();
  let compareRuleStr = String(rule.value ?? '').toLowerCase().trim();
  if (compareRuleStr === 'in progress') compareRuleStr = 'on process';
  if (compareValStr === 'in progress') compareValStr = 'on process';

  switch (rule.operator) {
    case '>':
      return isNum ? Number(val) > numVal : false;
    case '<':
      return isNum ? Number(val) < numVal : false;
    case '>=':
      return isNum ? Number(val) >= numVal : false;
    case '<=':
      return isNum ? Number(val) <= numVal : false;
    case '=':
      return compareValStr === compareRuleStr;
    case 'contains': {
      const searchTerms = compareRuleStr.split(/\s+/).filter(Boolean);
      return searchTerms.every((term) => compareValStr.includes(term));
    }
    case 'or':
    case 'OR': {
      const orTerms = compareRuleStr
        .split(/[\r\n\t,;+/&|]+|\s{2,}/)
        .map((t) => {
          let tr = t.trim();
          if (tr === 'in progress') tr = 'on process';
          return tr;
        })
        .filter(Boolean);
      if (orTerms.length === 0) {
        const spaceTerms = compareRuleStr.split(/\s+/).filter(Boolean);
        return spaceTerms.some((term) => compareValStr === term || compareValStr.includes(term));
      }
      return orTerms.some((term) => {
        if (compareValStr === term) return true;
        if (compareValStr.includes(term)) return true;
        if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
        return false;
      });
    }
    case 'exclude': {
      const searchTerms = compareRuleStr.split(/\s+/).filter(Boolean);
      return !searchTerms.some((term) => compareValStr.includes(term));
    }
    default:
      return false;
  }
}

export function evaluateRulesOnUnits(
  units: UnitShape[],
  rules: GroupRule[] | undefined,
  dataMap: Record<string, any>
): string[] {
  if (!rules || rules.length === 0) return [];
  const matchedIds: string[] = [];
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const uName = (u.name || '').toLowerCase();
    const data = uName ? dataMap[uName] : null;
    if (data && rules.every((r) => matchRuleAgainstData(r, data))) {
      matchedIds.push(u.id);
    }
  }
  return matchedIds;
}

export interface UseDynamicRulesOptions {
  units: UnitShape[];
  versions?: MapVersion[];
  setVersions?: (v: MapVersion[]) => void;
  setUnits?: (u: UnitShape[]) => void;
  summaryData?: SummaryDataItem[];
  store?: 'HCM' | 'HN';
  location?: string;
  year?: string;
  autoEvaluate?: boolean;
  onDirtyChange?: () => void;
}

export function useDynamicRules(
  unitsOrOptions: UnitShape[] | UseDynamicRulesOptions,
  legacySummaryData?: SummaryDataItem[]
) {
  // Normalize input options
  const isOptionsObject = !Array.isArray(unitsOrOptions) && typeof unitsOrOptions === 'object';
  const options: UseDynamicRulesOptions = isOptionsObject
    ? (unitsOrOptions as UseDynamicRulesOptions)
    : {
        units: unitsOrOptions as UnitShape[],
        summaryData: legacySummaryData,
      };

  const units = options.units || [];
  const versions = options.versions;
  const setVersions = options.setVersions;
  const setUnits = options.setUnits;
  const store = options.store || 'HCM';
  const location = options.location || 'L1';
  const year = options.year;
  const autoEvaluate = options.autoEvaluate ?? false;
  const onDirtyChange = options.onDirtyChange;

  // Reactively track projects and tasks from Zustand Global Store
  const projects = useAppStore((state) => state.projects || []);
  const tasks = useAppStore((state) => state.tasks || []);
  const delegationGroups = useAppStore((state) => state.delegationGroups || []);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const effectiveYear = year || (globalYearFilter && globalYearFilter !== 'all' ? globalYearFilter : '2026');

  // Reactively track data from DataContext if summaryData wasn't passed
  const unitInfo = useDataStore((state) => state.unitInfo);
  const classInfo = useDataStore((state) => state.classInfo);
  const actualClassInfo = useDataStore((state) => state.actualClassInfo);
  const sales = useDataStore((state) => state.sales);
  const profits = useDataStore((state) => state.profits);
  const subFees = useDataStore((state) => state.subFees);
  const mdStatus = useDataStore((state) => state.mdStatus);
  const projectStatus = useDataStore((state) => state.projectStatus);
  const projectLink = useDataStore((state) => state.projectLink);
  const basePlan = useDataStore((state) => state.basePlan);
  const storeUnits = useDataStore((state) => state.units);

  const enrichedProjects = useMemo(() => enrichProjects(projects, tasks, delegationGroups), [projects, tasks, delegationGroups]);

  const internalSummaryData = useMemo(() => {
    if (options.summaryData && options.summaryData.length > 0) {
      return options.summaryData;
    }
    return calculateSummaryData({
      unitInfo,
      classInfo,
      actualClassInfo,
      sales,
      profits,
      subFees,
      mdStatus,
      projectStatus,
      projectLink,
      basePlan,
      units: storeUnits,
    });
  }, [
    options.summaryData,
    unitInfo,
    classInfo,
    actualClassInfo,
    sales,
    profits,
    subFees,
    mdStatus,
    projectStatus,
    projectLink,
    basePlan,
    storeUnits,
  ]);

  const unitNamesStr = useMemo(
    () => JSON.stringify(units.map((u) => ({ id: u.id, name: u.name, location: u.location }))),
    [units]
  );

  // Aggregated Data Map (0ms RAM memoization)
  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};

    // Pre-index tasks by project code
    const tasksByCodeMap = new Map<string, any[]>();
    tasks.forEach((t) => {
      if (!t || !t.name || !t.projectCode) return;
      const tStore = String(t.projectStore || (t as any).store || '').toUpperCase().trim();
      const currentStore = String(store || '').trim();
      if (tStore && tStore !== 'ALL' && currentStore && currentStore !== 'all' && tStore !== currentStore.toUpperCase()) return;
      const tYear = String(t.projectYear || (t as any).year || '').trim();
      if (tYear && tYear !== 'ALL' && effectiveYear && effectiveYear !== 'all' && tYear !== String(effectiveYear).trim()) return;

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
        mdStatus: '',
        task: '',
        projectStatus: '',
        actStatus: '',
        startDate: '',
        endDate: '',
        status: '',
        vendorCode: '',
        brandCode: '',
        brandName: '',
        classCode: '',
        appProjectStatus: '',
        appProjectBudget: 0,
        appProjectActual: 0,
        appProjectCode: '',
        appProjectYear: '',
      };
    });

    internalSummaryData.forEach((sumData) => {
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
        dataMap[key].mdStatus = sumData.mdStatus || '';
        dataMap[key].vendorCode = sumData.vendorCode || '';
        dataMap[key].brandCode = sumData.brandCode || '';
        dataMap[key].brandName = sumData.brandName || '';
        dataMap[key].classCode = sumData.classCode || '';
        dataMap[key].floor = dataMap[key].floor || (sumData as any).floor || '';
      }
    });

    // Pre-index projectLink: maps unit name -> list of linked project codes
    const unitToProjectCodesMap = new Map<string, string[]>();
    (projectLink || []).forEach((pl: any) => {
      const u = String(pl?.unit || '').trim().toLowerCase();
      const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
      if (u && pCode) {
        if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
        unitToProjectCodesMap.get(u)!.push(pCode);
      }
    });

    // Merge real-time Project data from Zustand
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;

      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store, location, year: effectiveYear })) {
        return;
      }

      const pCodes = extractAllProjectCodes(p);
      const status = getStatus(
        p.computedTakStart || p.start,
        p.computedTakCompl || p.handover,
        p.computedOpening || p.opening,
        p.code
      );

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

        // Strict Store, Location, and Year Isolation
        if (pMeta.store && uStore && uStore !== 'ALL' && uStore !== 'all' && pMeta.store !== uStore) return;
        const isStorewide = pMeta.location === 'ALL' || pMeta.location === 'STORE' || pMeta.location === 'STOREWIDE' || pMeta.location === 'WHOLE STORE' || pMeta.location === 'ALL FLOORS';
        if (pMeta.location && uLoc && !isStorewide && pMeta.location !== uLoc) return;
        if (pMeta.year && uYr && uYr !== 'ALL' && uYr !== 'all' && pMeta.year !== uYr) return;

        const linkedCodes = [
          ...(unitToProjectCodesMap.get(uKey.toLowerCase()) || []),
          ...(uEntry.name ? (unitToProjectCodesMap.get(uEntry.name.toLowerCase()) || []) : []),
          ...(uEntry.id ? (unitToProjectCodesMap.get(uEntry.id.toLowerCase()) || []) : []),
        ];
        const isLinkedViaProjectLink = linkedCodes.some(lc => 
          pCodes.some(pc => pc.toLowerCase() === lc.toLowerCase() || projectMatchesUnitCode([pc], lc))
        );

        const isExactCode = pCodes.some(c => c.toLowerCase() === uKey.toLowerCase() || (uEntry.name && c.toLowerCase() === uEntry.name.toLowerCase()));
        if (isExactCode || isLinkedViaProjectLink || projectMatchesUnitCode(pCodes, uKey) || (uEntry.name && projectMatchesUnitCode(pCodes, uEntry.name))) {
          targetUnitKeys.add(uKey);
        }
      });

      targetUnitKeys.forEach((code) => {
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
  }, [unitNamesStr, internalSummaryData, enrichedProjects, tasks, store, location, effectiveYear, delegationGroups]);

  // Pure in-memory calculation function (< 3ms)
  const calculateNextVersions = useCallback(
    (inputVersions: MapVersion[]): { nextVersions: MapVersion[]; hasChanges: boolean } => {
      let hasChanges = false;
      const nextVersions = inputVersions.map((v) => {
        const isActive = true; // Always active
        if (!v.groups || v.groups.length === 0) return { ...v, isDynamicActive: true };

        let versionChanged = false;
        const newMappings: Record<string, string[]> = { ...(v.groupMappings || {}) };

        v.groups.forEach((group) => {
          if (!group.rules || group.rules.length === 0) {
            if (newMappings[group.id] && newMappings[group.id].length > 0) {
              newMappings[group.id] = [];
              versionChanged = true;
              hasChanges = true;
            }
            return;
          }

          const matchingUnits = evaluateRulesOnUnits(units, group.rules, aggregatedData);
          const currentMappings = newMappings[group.id] || [];

          if (
            matchingUnits.length !== currentMappings.length ||
            !matchingUnits.every((id) => currentMappings.includes(id))
          ) {
            newMappings[group.id] = matchingUnits;
            versionChanged = true;
            hasChanges = true;
          }
        });

        if (versionChanged) {
          return { ...v, groupMappings: newMappings };
        }
        return v;
      });

      return { nextVersions, hasChanges };
    },
    [units, aggregatedData]
  );

  // Reactive Memory Evaluation Effect:
  // When autoEvaluate is enabled and dependencies change, evaluate in RAM (0ms) without Firestore
  const prevEvaluatedRef = useRef<string>('');

  useEffect(() => {
    if (!autoEvaluate || !versions || !setVersions || versions.length === 0) return;

    // Fast-path evaluation in memory
    const { nextVersions, hasChanges } = calculateNextVersions(versions);

    if (hasChanges) {
      const serialized = JSON.stringify(
        nextVersions.map((v) => ({ id: v.id, m: v.groupMappings }))
      );
      if (serialized !== prevEvaluatedRef.current) {
        prevEvaluatedRef.current = serialized;
        setVersions(nextVersions);

        // Note: Dynamic rules calculate groupMappings and display colors without corrupting base units
        onDirtyChange?.();
      }
    }
  }, [
    autoEvaluate,
    versions,
    setVersions,
    calculateNextVersions,
    units,
    setUnits,
    effectiveYear,
    onDirtyChange,
  ]);

  return {
    aggregatedData,
    calculateNextVersions,
  };
}
