import { useMemo } from 'react';
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { enrichProjects, getStatus, computeProjectActStatus } from '../../../lib/utils';
import { calculateSummaryData, SummaryDataItem } from './summaryData';

export interface DynamicUnitSummaryItem {
  unitId: string;
  unitName: string;
  store: string;
  location: string;
  year: string;
  // Real-time App Project Data (Strictly from Zustand tasks & projects)
  hasAppProject: boolean;
  appProjectCode: string;
  projectName: string;
  appProjectStatus: string; // 'On process' | 'Upcoming' | 'Completed' | 'Delay' | ''
  appProjectYear: string;
  appProjectMdStatus: string;
  appProjectActStatus: string;
  appProjectDetail: string;
  appProjectDescription: string;
  appProjectParty: string;
  appProjectBudget: number;
  appProjectActual: number;
  planProgress: number;
  actProgress: number;
  matchedTasksCount: number;
  // Excel / Master Business Data
  size: number;
  sales: number;
  salesByCp: number;
  profit: number;
  profitByCp: number;
  margin: number;
  marginByCp: number;
  hcmSalesEffi: number;
  hcmMargin: number;
  mdStatus: string;
  mdNotes: string;
  excelProjectStatus: string;
  vendorCode: string;
  brandCode: string;
  brandName: string;
  classCode: string;
  // Dynamic Evaluation Result
  matchedGroupId: string | null;
  matchedGroupName: string | null;
  color: string; // Hex color
  opacity: number;
  matchedRuleReason: string;
  isRestricted?: boolean;
}

/**
 * Pure function to evaluate if a rule matches a unit's aggregated data
 */
export function matchSingleRule(rule: GroupRule, data: DynamicUnitSummaryItem): boolean {
  let val: any = (data as any)[rule.field];

  if (val === undefined || val === null || String(val).trim() === '') {
    const f = String(rule.field || '').toLowerCase().trim();
    if (f === 'floor' || f === 'location') {
      val = data.location || '';
    } else if (f === 'app: floor' || f === 'appfloor' || f === 'appprojectfloor') {
      val = data.hasAppProject ? data.location : '';
    } else if (f === 'year') {
      val = data.year || '';
    } else if (f === 'appprojectyear' || f === 'app: year' || f === 'appyear') {
      val = data.hasAppProject ? data.appProjectYear : '';
    } else if (f === 'status' || f === 'projectstatus') {
      val = data.excelProjectStatus || '';
    } else if (f === 'appprojectstatus' || f === 'app: status' || f === 'appstatus') {
      val = data.hasAppProject ? data.appProjectStatus : '';
    } else if (f === 'unit' || f === 'code') {
      val = data.unitName || '';
    } else if (f === 'appprojectcode' || f === 'app: project code' || f === 'appcode') {
      val = data.hasAppProject ? data.appProjectCode : '';
    } else if (f === 'mdstatus') {
      val = data.mdStatus || '';
    } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
      val = data.hasAppProject ? data.appProjectMdStatus : '';
    } else if (f === 'actstatus') {
      val = data.appProjectActStatus || '';
    } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status') {
      val = data.hasAppProject ? data.appProjectActStatus : '';
    } else if (f === 'detail') {
      val = data.appProjectDetail || '';
    } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)') {
      val = data.hasAppProject ? data.appProjectDetail : '';
    } else if (f === 'description (project)') {
      val = data.appProjectDescription || '';
    } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)') {
      val = data.hasAppProject ? data.appProjectDescription : '';
    } else if (f === 'party') {
      val = data.appProjectParty || '';
    } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party') {
      val = data.hasAppProject ? data.appProjectParty : '';
    }
  }

  if (rule.field === 'margin' || rule.field === 'marginByCp' || rule.field === 'hcmMargin') {
    val = Number(val || 0) * 100;
  }

  const numVal = Number(rule.value);
  const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

  let compareValStr = String(val ?? '').toLowerCase().trim();
  let compareRuleStr = String(rule.value ?? '').toLowerCase().trim();

  // Normalize synonym status strings
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

/**
 * Event-Driven Unit Summary Engine Hook
 * Evaluates in RAM (<2ms) and updates ONLY when tasks, projects, versions or filters change.
 */
export function useDynamicUnitSummary({
  units = [],
  activeVersion,
  store = 'HCM',
  location = 'B1',
  year,
}: {
  units?: UnitShape[];
  activeVersion?: MapVersion | null;
  store?: 'HCM' | 'HN';
  location?: string;
  year?: string;
}) {
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const delegationGroups = useAppStore((state) => state.delegationGroups);
  const globalYearFilter = useAppStore((state) => state.globalYearFilter);
  const currentUser = useAppStore((state) => state.currentUser);

  const effectiveYear = String(year || globalYearFilter || new Date().getFullYear()).trim();

  // 1. Fetch Excel Master Data
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

  const summaryData = useMemo(() => {
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
      units,
    });
  }, [unitInfo, classInfo, actualClassInfo, sales, profits, subFees, mdStatus, projectStatus, projectLink, basePlan, units]);

  // 2. Pre-enrich projects with live tasks
  const enrichedProjects = useMemo(() => {
    return enrichProjects(projects, tasks, delegationGroups);
  }, [projects, tasks, delegationGroups]);

  // 3. Compute restricted project codes (RBAC)
  const restrictedProjectCodes = useMemo(() => {
    if (!currentUser || currentUser.role === 'admin') return new Set<string>();
    const allowedCodeSet = new Set<string>();
    enrichedProjects.forEach((p) => {
      if (p.code) allowedCodeSet.add(String(p.code).trim().toLowerCase());
      if (p.linkCodes) {
        p.linkCodes.split(/[+;,/]/).forEach((c) => {
          if (c.trim()) allowedCodeSet.add(c.trim().toLowerCase());
        });
      }
    });

    const restrictedSet = new Set<string>();
    projects.forEach((p) => {
      const rawCodes = p.linkCodes && p.linkCodes.trim() ? p.linkCodes : String(p.code || '');
      const pCodes = rawCodes.split(/[+;,/]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
      pCodes.forEach((code) => {
        if (!allowedCodeSet.has(code)) {
          restrictedSet.add(code);
        }
      });
    });
    return restrictedSet;
  }, [projects, enrichedProjects, currentUser]);

  // 4. Main Event-Driven Rollup calculation
  const { summaryMap, summaryList, groupStats } = useMemo(() => {
    const sMap = new Map<string, DynamicUnitSummaryItem>();
    const sList: DynamicUnitSummaryItem[] = [];

    // Pre-index tasks by code for O(1) matching
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

    // Pre-index Excel summary data
    const summaryLookup = new Map<string, SummaryDataItem>();
    summaryData.forEach((s) => {
      if (s.unit) summaryLookup.set(s.unit.toLowerCase().trim(), s);
    });

    // Step A: Initialize summary item for each unit
    units.forEach((u) => {
      const uName = String(u.name || '').trim();
      const uKey = uName.toLowerCase();
      if (!uName) return;

      const excelItem = summaryLookup.get(uKey);
      const isRestricted = restrictedProjectCodes.has(uKey);

      const item: DynamicUnitSummaryItem = {
        unitId: u.id,
        unitName: uName,
        store: u.store || store,
        location: u.location || location,
        year: effectiveYear,
        hasAppProject: false,
        appProjectCode: '',
        projectName: '',
        appProjectStatus: '',
        appProjectYear: '',
        appProjectMdStatus: '',
        appProjectActStatus: '',
        appProjectDetail: '',
        appProjectDescription: '',
        appProjectParty: '',
        appProjectBudget: 0,
        appProjectActual: 0,
        planProgress: 0,
        actProgress: 0,
        matchedTasksCount: 0,
        size: typeof excelItem?.size === 'number' ? excelItem.size : (Number(excelItem?.size) || 0),
        sales: excelItem?.salesAmount || 0,
        salesByCp: excelItem?.salesByCp || 0,
        profit: excelItem?.profitAmount || 0,
        profitByCp: excelItem?.profitByCp || 0,
        margin: excelItem?.margin || 0,
        marginByCp: excelItem?.marginByCp || 0,
        hcmSalesEffi: excelItem?.hcmSalesEffi || 0,
        hcmMargin: excelItem?.hcmMargin || 0,
        mdStatus: excelItem?.mdStatus || '',
        mdNotes: excelItem?.mdNotes || '',
        excelProjectStatus: excelItem?.projectStatus || '',
        vendorCode: excelItem?.vendorCode || '',
        brandCode: excelItem?.brandCode || '',
        brandName: excelItem?.brandName || '',
        classCode: excelItem?.classCode || '',
        matchedGroupId: null,
        matchedGroupName: null,
        color: u.fill || '#3b82f6',
        opacity: 0.65,
        matchedRuleReason: 'Màu mặc định',
        isRestricted,
      };

      sMap.set(u.id, item);
      sMap.set(uKey, item);
      sList.push(item);
    });

    // Step B: Match Real-time App Project & Tasks (Filtered STRICTLY by Store & Year)
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;
      const pStore = String(p.store || (p as any).projectStore || '').trim().toUpperCase();
      if (store && pStore && pStore !== store.toUpperCase()) return;

      const pYear = String(p.year || (p as any).projectYear || '').trim();
      if (effectiveYear && effectiveYear !== 'all' && pYear && pYear !== effectiveYear) return;

      const rawCodes = p.linkCodes && p.linkCodes.trim() ? p.linkCodes : String(p.code || '');
      const pCodes = rawCodes.split(/[+;,/]+/).map((c) => c.trim().toLowerCase()).filter(Boolean);

      const status = getStatus(
        p.computedTakStart || p.start,
        p.computedTakCompl || p.handover,
        p.computedOpening || p.opening,
        p.code
      );
      const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);

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

      pCodes.forEach((code) => {
        const item = sMap.get(code);
        if (item) {
          item.hasAppProject = true;
          item.appProjectCode = String(p.code || code);
          item.projectName = p.name || '';
          item.appProjectStatus = status || '';
          item.appProjectYear = pYear || effectiveYear;
          item.appProjectMdStatus = p.mdStatus || '';
          item.appProjectActStatus = actStatus || '';
          item.appProjectDetail = p.detail || '';
          item.appProjectDescription = p.detail || (p as any).description || '';
          item.appProjectParty = p.party || (p as any).contractor || '';
          item.appProjectBudget = p.budget || 0;
          item.appProjectActual = p.actual || 0;
          item.planProgress = p.computedPlanProgress ?? 0;
          item.actProgress = p.computedActProgress ?? 0;
          item.matchedTasksCount = matchedTaskSet.size;
        }
      });
    });

    // Step C: Apply Dynamic Rules strictly from activeVersion (Rules-only evaluation)
    const stats: Record<string, { group: any; count: number; unitNames: string[] }> = {};

    if (activeVersion && Array.isArray(activeVersion.groups)) {
      activeVersion.groups.forEach((group) => {
        stats[group.id] = { group, count: 0, unitNames: [] };
      });

      // Strictly evaluate Dynamic Rules only - NO static manual groupMappings
      activeVersion.groups.forEach((group) => {
        if (!group.rules || group.rules.length === 0) return;

        sList.forEach((item) => {
          if (item.isRestricted) return;

          const isMatch = group.rules.every((rule) => matchSingleRule(rule, item));
          if (isMatch) {
            item.matchedGroupId = group.id;
            item.matchedGroupName = group.name;
            item.color = group.color;
            item.opacity = typeof group.opacity === 'number' ? group.opacity : 0.65;
            item.matchedRuleReason = group.rules
              .map((r) => `${r.field} ${r.operator} ${r.value}`)
              .join(' AND ');
          }
        });
      });

      // Calculate statistics
      sList.forEach((item) => {
        if (item.matchedGroupId && stats[item.matchedGroupId]) {
          stats[item.matchedGroupId].count++;
          stats[item.matchedGroupId].unitNames.push(item.unitName);
        }
      });
    }

    return {
      summaryMap: sMap,
      summaryList: sList,
      groupStats: Object.values(stats),
    };
  }, [units, activeVersion, store, location, effectiveYear, summaryData, enrichedProjects, tasks, projects, restrictedProjectCodes, delegationGroups]);

  return {
    summaryMap,
    summaryList,
    groupStats,
    effectiveYear,
  };
}
