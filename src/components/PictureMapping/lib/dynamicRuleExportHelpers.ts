import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { calculateSummaryData } from './summaryData';
import { enrichProjects, getStatus, computeProjectActStatus, projectMatchesUnitCode } from '../../../lib/utils';

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

export type BackgroundSyncStatus = 'idle' | 'syncing' | 'saved' | 'error';
const syncStatusListeners = new Set<(status: BackgroundSyncStatus, lastSavedAt?: number) => void>();
let currentSyncStatus: BackgroundSyncStatus = 'idle';
let lastSavedTimestamp: number = 0;

export function getBackgroundSyncStatus(): { status: BackgroundSyncStatus; lastSavedAt: number } {
  return { status: currentSyncStatus, lastSavedAt: lastSavedTimestamp };
}

export function subscribeBackgroundSyncStatus(
  listener: (status: BackgroundSyncStatus, lastSavedAt?: number) => void
) {
  syncStatusListeners.add(listener);
  return () => {
    syncStatusListeners.delete(listener);
  };
}

export function updateSyncStatus(status: BackgroundSyncStatus) {
  currentSyncStatus = status;
  if (status === 'saved') lastSavedTimestamp = Date.now();
  syncStatusListeners.forEach((fn) => fn(status, lastSavedTimestamp));
}

export function isPictureMappingDataLoaded(targetStore?: 'HCM' | 'HN'): boolean {
  const dataState = useDataStore.getState();
  if (dataState.isCloudLoaded) return true;

  const partitions = Object.entries(dataState.storeLocationData || {});
  const hasStorePartitionData = partitions.some(([k, v]) => {
    if (targetStore && !k.startsWith(targetStore)) return false;
    return (v?.mapUnits && v.mapUnits.length > 0) || (v?.mapVersions && v.mapVersions.length > 0);
  });
  if (hasStorePartitionData) return true;

  if ((dataState.mapUnits && dataState.mapUnits.length > 0) || (dataState.mapVersions && dataState.mapVersions.length > 0)) {
    if (!targetStore || dataState.store === targetStore) {
      return true;
    }
  }

  const allUnits = dataState.getAllStoreUnits(targetStore);
  const allVersions = dataState.getAllStoreVersions(targetStore);
  return allUnits.length > 0 || allVersions.length > 0;
}

export function matchRulesAgainstUnit(unit: UnitShape, rules: GroupRule[] | undefined, dataMap: Record<string, any>): boolean {
  if (!rules || rules.length === 0) return false;
  const uName = (unit.name || '').toLowerCase();
  const data = uName ? dataMap[uName] : null;
  if (!data) return false;

  return rules.every((rule) => {
    let val = data[rule.field];
    const f = String(rule.field || '').toLowerCase().trim();

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
    } else if (f === 'appprojectshoptype' || f === 'appshoptype' || f === 'app: shop type' || f === 'app: shoptype' || f === 'shoptype' || f === 'shop type') {
      val = data.hasAppProject ? (data.appProjectShopType || data.shopType || '') : (data.shopType || '');
    } else if (val === undefined || val === null || String(val).trim() === '') {
      if (f === 'floor' || f === 'location') {
        val = data.floor || unit.location || '';
      } else if (f === 'year') {
        val = data.year || '';
      } else if (f === 'mdstatus') {
        val = data.hasAppProject ? (data.appProjectMdStatus || data.mdStatus || '') : (data.mdStatus || '');
      } else if (f === 'unit' || f === 'code') {
        val = data.unit || data.appProjectCode || unit.name || '';
      }
    }

    if (rule.field === 'margin' || rule.field === 'marginByCp') {
      val = val * 100;
    }

    const numVal = Number(rule.value);
    const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

    let res = false;
    let compareValStr = String(val || '').toLowerCase().trim();
    let compareRuleStr = String(rule.value || '').toLowerCase().trim();
    if (compareRuleStr === 'in progress') compareRuleStr = 'on process';
    if (compareValStr === 'in progress') compareValStr = 'on process';

    switch (rule.operator) {
      case '>':
        res = isNum ? Number(val) > numVal : false;
        break;
      case '<':
        res = isNum ? Number(val) < numVal : false;
        break;
      case '>=':
        res = isNum ? Number(val) >= numVal : false;
        break;
      case '<=':
        res = isNum ? Number(val) <= numVal : false;
        break;
      case '=':
        res = compareValStr === compareRuleStr;
        break;
      case 'contains': {
        const searchTerms = compareRuleStr.split(/\s+/);
        res = searchTerms.every((term) => compareValStr.includes(term));
        break;
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
          res = spaceTerms.some(term => compareValStr === term || compareValStr.includes(term));
        } else {
          res = orTerms.some((term) => {
            if (compareValStr === term) return true;
            if (compareValStr.includes(term)) return true;
            if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
            return false;
          });
        }
        break;
      }
      case 'exclude': {
        const searchTerms = compareRuleStr.split(/\s+/);
        res = !searchTerms.some((term) => compareValStr.includes(term));
        break;
      }
      default:
        res = false;
        break;
    }

    return res;
  });
}

export function buildDataMapForYear(targetYear: string, targetStore: 'HCM' | 'HN'): Record<string, any> {
  const appState = useAppStore.getState();
  const dataState = useDataStore.getState();

  const projects = appState.projects || [];
  const tasks = appState.tasks || [];
  const delegationGroups = appState.delegationGroups || [];
  const enrichedProjects = enrichProjects(projects, tasks, delegationGroups);

  const summaryData = calculateSummaryData({
    unitInfo: dataState.unitInfo,
    classInfo: dataState.classInfo,
    actualClassInfo: dataState.actualClassInfo,
    sales: dataState.sales,
    profits: dataState.profits,
    subFees: dataState.subFees,
    mdStatus: dataState.mdStatus,
    projectStatus: dataState.projectStatus,
    projectLink: dataState.projectLink,
    basePlan: dataState.basePlan,
    units: dataState.units,
  });

  const allUnits = dataState.getAllStoreUnits(targetStore);
  const dataMap: Record<string, any> = {};

  allUnits.forEach((u) => {
    const uName = (u.name || '').toLowerCase();
    if (!uName) return;
    const item = summaryData.find((s) => s.unit?.toLowerCase() === uName);
    dataMap[uName] = {
      name: u.name || '',
      id: u.id,
      unit: u.name || '',
      year: targetYear,
      size: item?.size || 0,
      sales: item?.salesAmount || 0,
      salesAmount: item?.salesAmount || 0,
      salesByCp: item?.salesByCp || 0,
      salesByHcmcate: item?.salesByHcmcate || 0,
      profit: item?.profitAmount || 0,
      profitAmount: item?.profitAmount || 0,
      profitByCp: item?.profitByCp || 0,
      profitByHcmcate: item?.profitByHcmcate || 0,
      margin: item?.margin || 0,
      marginByCp: item?.marginByCp || 0,
      hcmSalesEffi: item?.hcmSalesEffi || 0,
      hcmMargin: item?.hcmMargin || 0,
      mdStatus: item?.mdStatus || '',
      mdNotes: item?.mdNotes || '',
      task: item?.task || '',
      projectStatus: item?.projectStatus || '',
      actStatus: item?.actStatus || '',
      startDate: item?.startDate || '',
      endDate: item?.endDate || '',
      status: item?.status || '',
      vendorCode: item?.vendorCode || '',
      brandCode: item?.brandCode || '',
      brandName: item?.brandName || '',
      classCode: item?.classCode || '',
      floor: u.location || (item as any)?.floor || '',
      appProjectStatus: '',
      appProjectBudget: 0,
      appProjectActual: 0,
      appProjectCode: '',
      appProjectYear: '',
      ...(item || {}),
      unitName: u.name,
    };
  });

  summaryData.forEach((item) => {
    const key = (item.unit || '').toLowerCase();
    if (key && !dataMap[key]) {
      dataMap[key] = {
        name: item.unit || '',
        unit: item.unit || '',
        year: targetYear,
        size: item.size || 0,
        sales: item.salesAmount || 0,
        salesAmount: item.salesAmount || 0,
        salesByCp: item.salesByCp || 0,
        salesByHcmcate: item.salesByHcmcate || 0,
        profit: item.profitAmount || 0,
        profitAmount: item.profitAmount || 0,
        profitByCp: item.profitByCp || 0,
        profitByHcmcate: item.profitByHcmcate || 0,
        margin: item.margin || 0,
        marginByCp: item.marginByCp || 0,
        hcmSalesEffi: item.hcmSalesEffi || 0,
        hcmMargin: item.hcmMargin || 0,
        mdStatus: item.mdStatus || '',
        mdNotes: item.mdNotes || '',
        task: item.task || '',
        projectStatus: item.projectStatus || '',
        actStatus: item.actStatus || '',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        status: item.status || '',
        vendorCode: item.vendorCode || '',
        brandCode: item.brandCode || '',
        brandName: item.brandName || '',
        classCode: item.classCode || '',
        floor: (item as any)?.floor || '',
        appProjectStatus: '',
        appProjectBudget: 0,
        appProjectActual: 0,
        appProjectCode: '',
        appProjectYear: '',
        ...item,
        unitName: item.unit,
      };
    }
  });

  const normalizedTargetYear = String(targetYear || '').trim();

  const unitToProjectCodesMap = new Map<string, string[]>();
  (dataState.projectLink || []).forEach((pl: any) => {
    const u = String(pl?.unit || '').trim().toLowerCase();
    const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && pCode) {
      if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
      unitToProjectCodesMap.get(u)!.push(pCode);
    }
  });

  enrichedProjects.forEach((p) => {
    const pYear = String(p.year || (p as any).projectYear || '').trim();
    if (normalizedTargetYear && normalizedTargetYear !== 'all' && pYear && pYear !== normalizedTargetYear) {
      return;
    }

    const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
    const pCodes = rawCodes.split(/[+;,/]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
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
    Object.keys(dataMap).forEach((uKey) => {
      const uEntry = dataMap[uKey];
      if (!uEntry) return;

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
        dataMap[code].appProjectBudget = p.budget || 0;
        dataMap[code].appProjectActual = p.actual || 0;
        dataMap[code].appProjectCode = String(p.code);
        dataMap[code].appProjectYear = pYear || normalizedTargetYear;

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

        dataMap[code].appProjectShopType = p.shopType || '';
        dataMap[code].shopType = p.shopType || dataMap[code].shopType || '';

        if (!dataMap[code].year) dataMap[code].year = pYear || normalizedTargetYear;
        dataMap[code].projectStatus = status;
        if (!dataMap[code].task) dataMap[code].task = (p as any).title || (p as any).name || '';
        if (p.computedTakStart || p.start) dataMap[code].startDate = p.computedTakStart || p.start;
        if (p.computedOpening || p.opening || p.computedTakCompl || p.handover) dataMap[code].endDate = p.computedOpening || p.opening || p.computedTakCompl || p.handover;
      }
    });
  });

  return dataMap;
}

export function applyAllDynamicRulesForStore(targetStore: 'HCM' | 'HN'): {
  updatedStoreLocationData: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>;
  totalEvaluatedUnits: number;
} {
  const dataState = useDataStore.getState();
  const effectiveYear = String(useAppStore.getState().globalYearFilter || '2026').trim();

  const dataMapCache: Record<string, Record<string, any>> = {};
  const getDataMap = (year: string) => {
    const yrKey = String(year || effectiveYear || '2026').trim();
    if (!dataMapCache[yrKey]) {
      dataMapCache[yrKey] = buildDataMapForYear(yrKey, targetStore);
    }
    return dataMapCache[yrKey];
  };

  const updatedStoreLocationData = { ...dataState.storeLocationData };
  let totalEvaluatedUnits = 0;

  for (const pKey in updatedStoreLocationData) {
    if (pKey.startsWith(`${targetStore}_`)) {
      const partition = updatedStoreLocationData[pKey];
      if (!partition) continue;

      const pUnits = partition.mapUnits ? [...partition.mapUnits] : [];
      const pVersions = partition.mapVersions ? [...partition.mapVersions] : [];
      const pLoc = pKey.split('_')[1] || dataState.location;

      const updatedVersions = pVersions.map((v) => {
        if (!v.groups || v.groups.length === 0) return v;

        const vYear = String(v.year || effectiveYear).trim();
        const yearDataMap = getDataMap(vYear);

        const newMappings: Record<string, string[]> = {};
        v.groups.forEach((group) => {
          if (group.rules && group.rules.length > 0) {
            const matchingIds = pUnits
              .filter((u) => (!v.location || !u.location || u.location === v.location || u.location === pLoc) && matchRulesAgainstUnit(u, group.rules, yearDataMap))
              .map((u) => u.id);
            newMappings[group.id] = matchingIds;
          } else {
            newMappings[group.id] = [];
          }
        });

        return {
          ...v,
          groupMappings: newMappings,
        };
      });

      const sanitizedUnits = pUnits.map((u) => ({
        ...u,
        fill: (u.fill === 'transparent' || u.fill === 'none')
          ? 'transparent'
          : (u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' ? u.fill : '#3b82f6'),
      }));

      totalEvaluatedUnits += sanitizedUnits.length;
      updatedStoreLocationData[pKey] = {
        ...partition,
        mapUnits: sanitizedUnits,
        mapVersions: updatedVersions,
      };
    }
  }

  const currentKey = getPartitionKey(dataState.store, dataState.location);
  const activePartition = updatedStoreLocationData[currentKey];

  useDataStore.setState({
    storeLocationData: updatedStoreLocationData,
    mapUnits: activePartition?.mapUnits || dataState.mapUnits,
    mapVersions: activePartition?.mapVersions || dataState.mapVersions,
  });

  return { updatedStoreLocationData, totalEvaluatedUnits };
}
