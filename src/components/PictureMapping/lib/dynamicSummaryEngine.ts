import { useMemo } from "react";
import { UnitShape, MapVersion } from '../components/DataMapping/types';
import { useAppStore } from '../../../store/useAppStore';
import { useEnrichedData } from '../../../hooks/useEnrichedData';
import { useDataStore } from '../DataContext';
import { getStatus, computeProjectActStatus, extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata, projectMatchesScope } from '../../../lib/utils';
import { calculateSummaryData, SummaryDataItem } from './summaryData';
import { DynamicUnitSummaryItem, matchSingleRule } from './dynamicRuleMatcher';

export type { DynamicUnitSummaryItem };
export { matchSingleRule };

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
  const { enrichedProjects, filteredTasks: tasks } = useEnrichedData();
  const allProjects = useAppStore((state) => state.projects);
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

  // 2. Compute restricted project/unit codes (RBAC from Acc Control)
  const restrictedProjectCodes = useMemo(() => {
    if (!currentUser || currentUser.role === 'admin') return new Set<string>();

    const unitToProjectCodesMap = new Map<string, string[]>();
    (projectLink || []).forEach((pl: any) => {
      const u = String(pl?.unit || '').trim().toLowerCase();
      const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
      if (u && pCode) {
        if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
        unitToProjectCodesMap.get(u)!.push(pCode);
      }
    });

    const allowedCodeSet = new Set<string>();
    enrichedProjects.forEach((p) => {
      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store, location, year: effectiveYear })) return;
      const pCodes = extractAllProjectCodes(p);
      pCodes.forEach((c) => {
        if (c) allowedCodeSet.add(c.toLowerCase());
      });
      units.forEach((u) => {
        const uName = String(u.name || '').trim().toLowerCase();
        const uId = String(u.id || '').trim().toLowerCase();
        const linkedCodes = [
          ...(unitToProjectCodesMap.get(uName) || []),
          ...(unitToProjectCodesMap.get(uId) || []),
        ];
        const isLinked = linkedCodes.some((lc) =>
          pCodes.some((pc) => pc.toLowerCase() === lc.toLowerCase() || projectMatchesUnitCode([pc], lc))
        );
        const isExact = pCodes.some((c) => c.toLowerCase() === uName || c.toLowerCase() === uId);
        if (isExact || isLinked || projectMatchesUnitCode(pCodes, uName || uId)) {
          if (uName) allowedCodeSet.add(uName);
          if (uId) allowedCodeSet.add(uId);
        }
      });
    });

    const restrictedSet = new Set<string>();
    const isPartyRestricted = currentUser.byPartyAccess === true && currentUser.partyPermissions?.['all'] !== true;

    if (isPartyRestricted) {
      units.forEach((u) => {
        const uName = String(u.name || '').trim().toLowerCase();
        const uId = String(u.id || '').trim().toLowerCase();
        if (uName && !allowedCodeSet.has(uName)) restrictedSet.add(uName);
        if (uId && !allowedCodeSet.has(uId)) restrictedSet.add(uId);
      });
    }

    allProjects.forEach((p) => {
      const pMeta = extractProjectMetadata(p);
      if (!projectMatchesScope(pMeta, { store, location, year: effectiveYear })) return;
      const pCodes = extractAllProjectCodes(p).map((c) => c.toLowerCase());
      pCodes.forEach((code) => {
        if (!allowedCodeSet.has(code)) {
          restrictedSet.add(code);
        }
      });
      units.forEach((u) => {
        const uName = String(u.name || '').trim().toLowerCase();
        if (!uName || allowedCodeSet.has(uName)) return;
        if (pCodes.includes(uName) || projectMatchesUnitCode(pCodes, uName)) {
          restrictedSet.add(uName);
        }
      });
    });

    return restrictedSet;
  }, [allProjects, enrichedProjects, currentUser, units, projectLink, store, location, effectiveYear]);

  // 3. Main Event-Driven Rollup calculation
  const { summaryMap, summaryList, groupStats } = useMemo(() => {
    const sMap = new Map<string, DynamicUnitSummaryItem>();
    const sList: DynamicUnitSummaryItem[] = [];

    // Pre-index tasks by code and projectId for O(1) matching
    const tasksByCodeMap = new Map<string, any[]>();
    const tasksByProjIdMap = new Map<string, any[]>();
    tasks.forEach((t) => {
      if (!t || !t.name) return;
      const tStore = String(t.projectStore || (t as any).store || '').toUpperCase().trim();
      const currentStore = String(store || '').trim();
      if (tStore && tStore !== 'ALL' && currentStore && currentStore !== 'all' && tStore !== currentStore.toUpperCase()) return;
      const tYear = String(t.projectYear || (t as any).year || '').trim();
      if (tYear && tYear !== 'ALL' && effectiveYear && effectiveYear !== 'all' && tYear !== String(effectiveYear).trim()) return;

      if (t.projectId) {
        const pId = String(t.projectId).trim().toLowerCase();
        let list = tasksByProjIdMap.get(pId);
        if (!list) {
          list = [];
          tasksByProjIdMap.set(pId, list);
        }
        list.push(t);
      }
      if (t.projectCode) {
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
      }
    });

    // Pre-index Excel summary data
    const summaryLookup = new Map<string, SummaryDataItem>();
    summaryData.forEach((s) => {
      if (s.unit) summaryLookup.set(s.unit.toLowerCase().trim(), s);
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
        task: '',
        activeTasks: [],
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

    // Step B: Match Real-time App Project & Tasks (Filtered STRICTLY by Store, Location & Year)
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;

      const pMeta = extractProjectMetadata(p);

      // Strict Scope Matching across all 3 components: Store, Location (Floor), Year
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

      // Match tasks for this project (by ID, No, Code, linkCodes, and embedded taskSummaries)
      const matchedTaskSet = new Set<any>();
      if (p.id) {
        const pIdLower = String(p.id).trim().toLowerCase();
        const list = tasksByProjIdMap.get(pIdLower);
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      }
      if (p.no) {
        const pNoLower = String(p.no).trim().toLowerCase();
        const list = tasksByProjIdMap.get(pNoLower);
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      }
      pCodes.forEach((c) => {
        const list = tasksByCodeMap.get(c);
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      });
      if (p.code) {
        const list = tasksByCodeMap.get(String(p.code).trim().toLowerCase());
        if (list) list.forEach((t) => matchedTaskSet.add(t));
      }
      if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
        p.taskSummaries.forEach((ts) => matchedTaskSet.add(ts));
      }

      const allMatchedTasks = Array.from(matchedTaskSet);
      const allTaskNames = allMatchedTasks.map((t: any) => t.name).filter(Boolean);

      const now = new Date();
      const activeTasks = allMatchedTasks.filter((t: any) => {
        const startStr = t.start || t.startDate || t.takStart;
        const finishStr = t.finish || t.end || t.endDate || t.takCompl || t.handover;
        if (!startStr || !finishStr) return false;
        const start = new Date(startStr);
        const finish = new Date(finishStr);
        return now >= start && now <= finish;
      });
      const activeTaskNames = activeTasks.map((t: any) => t.name).filter(Boolean);

      // Full task string contains all sub-tasks so dynamic rules can match any planned, active, or upcoming task
      const taskSummaryStr = allTaskNames.length > 0 
        ? allTaskNames.join('; ')
        : (activeTaskNames.join('; ') || (p.taskSummaries?.map((t: any) => t.name).join('; ') || ''));

      const targetUnitKeys = new Set<string>();
      sList.forEach(item => {
        if (item.isRestricted) return;
        // Unit must match store, location, and year
        const itemStore = (item.store || store || '').toUpperCase().trim();
        const itemLoc = (item.location || location || '').toUpperCase().trim();
        const itemYear = String(item.year || effectiveYear || '').trim();

        // Strict Store, Location, and Year Isolation
        if (pMeta.store && itemStore && itemStore !== 'ALL' && itemStore !== 'all' && pMeta.store !== itemStore) return;
        const isStorewide = pMeta.location === 'ALL' || pMeta.location === 'STORE' || pMeta.location === 'STOREWIDE' || pMeta.location === 'WHOLE STORE' || pMeta.location === 'ALL FLOORS';
        if (pMeta.location && itemLoc && !isStorewide && pMeta.location !== itemLoc) return;
        if (pMeta.year && itemYear && itemYear !== 'ALL' && itemYear !== 'all' && pMeta.year !== itemYear) return;

        const linkedCodes = [
          ...(unitToProjectCodesMap.get(item.unitName.toLowerCase()) || []),
          ...(unitToProjectCodesMap.get(item.unitId.toLowerCase()) || []),
        ];
        const isLinkedViaProjectLink = linkedCodes.some(lc => 
          pCodes.some(pc => pc.toLowerCase() === lc.toLowerCase() || projectMatchesUnitCode([pc], lc))
        );

        const isExactCode = pCodes.some(c => c.toLowerCase() === item.unitName.toLowerCase() || c.toLowerCase() === item.unitId.toLowerCase());
        const isMatch = isExactCode || isLinkedViaProjectLink || projectMatchesUnitCode(pCodes, item.unitName || item.unitId);

        if (isMatch) {
          targetUnitKeys.add(item.unitId);
          if (item.unitName) targetUnitKeys.add(item.unitName.toLowerCase());
        }
      });

      targetUnitKeys.forEach((code) => {
        const item = sMap.get(code);
        if (item && !item.isRestricted) {
          item.hasAppProject = true;
          item.appProjectCode = String(p.code || code);
          item.projectName = p.name || '';
          item.appProjectStatus = status || '';
          item.appProjectYear = pMeta.year || effectiveYear;
          item.year = pMeta.year || effectiveYear;
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
          item.task = taskSummaryStr || item.task || '';
          item.activeTasks = activeTaskNames;
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
  }, [units, activeVersion, store, location, effectiveYear, summaryData, enrichedProjects, tasks, allProjects, restrictedProjectCodes, delegationGroups, projectLink]);

  return {
    summaryMap,
    summaryList,
    groupStats,
    effectiveYear,
  };
}
