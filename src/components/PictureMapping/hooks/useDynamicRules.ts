import { useMemo, useEffect, useRef, useCallback } from 'react';
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { SummaryDataItem, calculateSummaryData } from '../lib/summaryData';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { enrichProjects, getStatus, computeProjectActStatus, extractAllProjectCodes, projectMatchesUnitCode } from '../../../lib/utils';

// ============================================================================
// TIER 1: MEMORY EVALUATION (0ms - 100% RAM EXECUTION)
// Evaluates rules on units in RAM (<3ms) with zero Firestore reads/writes.
// ============================================================================

export function matchRuleAgainstData(rule: GroupRule, data: Record<string, any>): boolean {
  let val = data[rule.field];
  const f = String(rule.field || '').toLowerCase().trim();

  // 1. Explicit App Data / Real-time Project checks (NO fallback to legacy/static summary data)
  if (f === 'appprojectstatus' || f === 'appstatus' || f === 'app: status') {
    val = data.appProjectStatus || '';
  } else if (f === 'appprojectyear' || f === 'appyear' || f === 'app: year') {
    val = data.appProjectYear || '';
  } else if (f === 'appprojectcode' || f === 'appcode' || f === 'app: project code') {
    val = data.appProjectCode || '';
  } else if (f === 'appprojectfloor' || f === 'appfloor' || f === 'app: floor') {
    val = data.appProjectFloor || '';
  } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
    val = data.appProjectMdStatus || '';
  } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status') {
    val = data.appProjectActStatus || '';
  } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)') {
    val = data.appProjectDetail || '';
  } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)') {
    val = data.appProjectDescription || '';
  } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party') {
    val = data.appProjectParty || '';
  } else if (f === 'appprojectbudget' || f === 'appbudget' || f === 'app: budget') {
    val = data.appProjectBudget ?? 0;
  } else if (f === 'appprojectactual' || f === 'appactual' || f === 'app: actual') {
    val = data.appProjectActual ?? 0;
  } else if (val === undefined || val === null || String(val).trim() === '') {
    // 2. General attribute fallbacks
    if (f === 'floor' || f === 'location') {
      val = data.floor || data.location || '';
    } else if (f === 'year') {
      val = data.appProjectYear || data.year || '';
    } else if (f === 'status' || f === 'projectstatus') {
      val = data.appProjectStatus || data.projectStatus || data.status || '';
    } else if (f === 'mdstatus') {
      val = data.appProjectMdStatus || data.mdStatus || '';
    } else if (f === 'actstatus') {
      val = data.appProjectActStatus || data.actStatus || '';
    } else if (f === 'detail' || f === 'description (project)') {
      val = data.appProjectDetail || data.detail || '';
    } else if (f === 'party') {
      val = data.appProjectParty || data.party || '';
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

    const parsedUnits = JSON.parse(unitNamesStr);
    parsedUnits.forEach((u: any) => {
      const uName = (u.name || '').toLowerCase();
      if (!uName) return;
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        year: String(effectiveYear),
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
        floor: u.location || '',
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
        dataMap[key].task = sumData.task || '';
        dataMap[key].projectStatus = sumData.projectStatus || '';
        dataMap[key].actStatus = sumData.actStatus || '';
        dataMap[key].startDate = sumData.startDate || '';
        dataMap[key].endDate = sumData.endDate || '';
        dataMap[key].status = sumData.status || '';
        dataMap[key].vendorCode = sumData.vendorCode || '';
        dataMap[key].brandCode = sumData.brandCode || '';
        dataMap[key].brandName = sumData.brandName || '';
        dataMap[key].classCode = sumData.classCode || '';
        dataMap[key].floor = dataMap[key].floor || (sumData as any).floor || '';
        dataMap[key].year = (sumData as any).year || dataMap[key].year || String(effectiveYear);
      }
    });

    // Merge real-time Project data from Zustand
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;
      if (store && store !== 'all') {
        const pStore = String(p.store || (p as any).projectStore || '').trim().toUpperCase();
        if (pStore && pStore !== store.toUpperCase()) return;
      }
      const pYear = String(p.year || (p as any).projectYear || '').trim();
      if (effectiveYear && effectiveYear !== 'all' && pYear && pYear !== String(effectiveYear)) {
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

      const targetUnitKeys = new Set<string>();
      pCodes.forEach(code => {
        if (dataMap[code]) targetUnitKeys.add(code);
      });
      Object.keys(dataMap).forEach(uKey => {
        if (projectMatchesUnitCode(pCodes, uKey)) {
          targetUnitKeys.add(uKey);
        }
      });

      targetUnitKeys.forEach((code) => {
        if (dataMap[code]) {
          dataMap[code].appProjectStatus = status;
          dataMap[code].appProjectBudget = p.budget || 0;
          dataMap[code].appProjectActual = p.actual || 0;
          dataMap[code].appProjectCode = String(p.code);
          dataMap[code].appProjectYear = pYear;
          dataMap[code].year = pYear;

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
  }, [unitNamesStr, internalSummaryData, enrichedProjects, store, effectiveYear, delegationGroups]);

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
