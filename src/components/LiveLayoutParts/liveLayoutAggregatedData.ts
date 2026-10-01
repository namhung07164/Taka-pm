import {
  getStatus,
  computeProjectActStatus,
  extractAllProjectCodes,
  projectMatchesUnitCode,
  projectMatchesScope,
  extractProjectMetadata,
} from '../../lib/utils';
import { Project } from '../../types';

interface BuildAggregatedDataParams {
  units: any[];
  summaryData: any[];
  tasks: any[];
  enrichedProjects: Project[];
  storeFilter: string;
  targetLoc: string;
  effectiveLayoutYear: string;
  restrictedProjectCodes: Set<string>;
  projectLinkData: any[];
  delegationGroups: any[];
  locationFilter: string;
}

export function buildLiveLayoutAggregatedData({
  units,
  summaryData,
  tasks,
  enrichedProjects,
  storeFilter,
  targetLoc,
  effectiveLayoutYear,
  restrictedProjectCodes,
  projectLinkData,
  delegationGroups,
  locationFilter,
}: BuildAggregatedDataParams): Record<string, any> {
  const dataMap: Record<string, any> = {};

  units.forEach((u: any) => {
    const uName = (u?.name || '').toLowerCase().trim();
    if (!uName) return;
    const isRestricted = restrictedProjectCodes.has(uName);
    dataMap[uName] = {
      name: u.name || '',
      id: u.id,
      unit: u.name || '',
      isRestricted,
      hasImage: Boolean(u.imageUrl || u.thumbnail || u.image),
      year: effectiveLayoutYear,
      size: 0, sales: 0, salesByCp: 0, salesByHcmcate: 0,
      profit: 0, profitByCp: 0, profitByHcmcate: 0,
      margin: 0, marginByCp: 0, hcmSalesEffi: 0, hcmMargin: 0,
      mdStatus: "", task: "", projectStatus: "", actStatus: "",
      endDate: "", status: "", vendorCode: "",
      brandCode: "", brandName: "", classCode: "", floor: u.location || locationFilter || "",
      appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: "", appProjectYear: "", projectName: "", startDate: "", handoverDate: "", openingDate: "", detail: "", party: "",
      appProjectMdStatus: "", appMdStatus: "", appProjectActStatus: "", appActStatus: "", appProjectDetail: "", appDetail: "", appProjectDescription: "", appDescription: "", appProjectParty: "", appParty: ""
    };
  });

  summaryData.forEach((sumData) => {
    const key = sumData.unit?.toLowerCase().trim();
    if (key && dataMap[key]) {
      if (dataMap[key].isRestricted || restrictedProjectCodes.has(key)) {
        dataMap[key].isRestricted = true;
        return;
      }
      Object.assign(dataMap[key], {
        size: sumData.size || 0,
        sales: sumData.salesAmount || 0,
        profit: sumData.profitAmount || 0,
        margin: sumData.margin || 0,
        hcmSalesEffi: sumData.hcmSalesEffi || 0,
        mdStatus: sumData.mdStatus || "",
        projectStatus: sumData.projectStatus || "",
        status: sumData.status || "",
        brandName: sumData.brandName || "",
        floor: dataMap[key].floor || (sumData as any).floor || "",
      });
    }
  });

  const tasksByCodeMap = new Map<string, any[]>();
  const tasksByProjIdMap = new Map<string, any[]>();
  tasks.forEach(t => {
    if (!t || !t.name) return;
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
      const codeParts = rawCode.split(/[+;,/]/).map(c => c.trim()).filter(Boolean);
      codeParts.forEach(c => {
        let list = tasksByCodeMap.get(c);
        if (!list) {
          list = [];
          tasksByCodeMap.set(c, list);
        }
        list.push(t);
      });
    }
  });

  const unitToProjectCodesMap = new Map<string, string[]>();
  projectLinkData.forEach((pl: any) => {
    const u = String(pl?.unit || '').trim().toLowerCase();
    const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && pCode) {
      if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
      unitToProjectCodesMap.get(u)!.push(pCode);
    }
  });

  const now = new Date();
  enrichedProjects.forEach((p) => {
    if (!p.code && !p.linkCodes) return;
    const pMeta = extractProjectMetadata(p);
    if (!projectMatchesScope(pMeta, { store: storeFilter, location: targetLoc, year: effectiveLayoutYear })) {
      return;
    }

    const pCodes = extractAllProjectCodes(p);
    const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);

    const matchedTaskSet = new Set<any>();
    if (p.id) {
      const pIdLower = String(p.id).trim().toLowerCase();
      const list = tasksByProjIdMap.get(pIdLower);
      if (list) list.forEach(t => matchedTaskSet.add(t));
    }
    if (p.no) {
      const pNoLower = String(p.no).trim().toLowerCase();
      const list = tasksByProjIdMap.get(pNoLower);
      if (list) list.forEach(t => matchedTaskSet.add(t));
    }
    pCodes.forEach(c => {
      const list = tasksByCodeMap.get(c);
      if (list) list.forEach(t => matchedTaskSet.add(t));
    });
    if (p.code) {
      const pCodeLower = String(p.code).trim().toLowerCase();
      const list = tasksByCodeMap.get(pCodeLower);
      if (list) list.forEach(t => matchedTaskSet.add(t));
    }
    if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach(ts => matchedTaskSet.add(ts));
    }

    const allMatchedTasks = Array.from(matchedTaskSet);
    const allTaskNames = allMatchedTasks.map((t: any) => t.name).filter(Boolean);

    const activeTasks = allMatchedTasks.filter((t: any) => {
      const startStr = t.start || t.startDate || t.takStart;
      const finishStr = t.finish || t.end || t.endDate || t.takCompl || t.handover;
      if (!startStr || !finishStr) return false;
      const start = new Date(startStr);
      const finish = new Date(finishStr);
      return now >= start && now <= finish;
    });

    const activeTaskNames = activeTasks.map(t => t.name).filter(Boolean);

    const isUrlOrImageLine = (str: string | undefined | null) => {
      if (!str || typeof str !== 'string') return false;
      const lower = str.toLowerCase().trim();
      return (
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('link / photo:') ||
        lower.startsWith('link:') ||
        lower.startsWith('photo:') ||
        lower.startsWith('image:') ||
        lower.includes('.jpg') ||
        lower.includes('.jpeg') ||
        lower.includes('.png') ||
        lower.includes('.webp') ||
        lower.includes('.gif')
      );
    };

    const cleanAllTaskNames = allTaskNames.filter(t => !isUrlOrImageLine(t));
    const cleanActiveTaskNames = activeTaskNames.filter(t => !isUrlOrImageLine(t));

    const taskSummaryStr = cleanAllTaskNames.length > 0
      ? cleanAllTaskNames.join('; ')
      : (cleanActiveTaskNames.join('; ') || (p.taskSummaries?.map((t: any) => t.name).filter((n: string) => !isUrlOrImageLine(n)).join('; ') || ''));

    let taskLines: string[] = [];
    cleanActiveTaskNames.forEach(name => {
      taskLines.push(...name.split('\n').map((l: string) => l.trim()).filter((l: string) => l !== '' && !isUrlOrImageLine(l)));
    });

    const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);
    const detailStr = p.detail || '';
    const descStr = p.detail || (p as any).description || '';
    const partyStr = p.party || (p as any).contractor || '';
    const mdStatusStr = p.mdStatus || '';

    const targetUnitKeys = new Set<string>();
    Object.keys(dataMap).forEach(uKey => {
      const uEntry = dataMap[uKey];
      if (!uEntry) return;
      const uStore = (uEntry.store || storeFilter || '').toUpperCase().trim();
      const uLoc = (uEntry.location || targetLoc || '').toUpperCase().trim();
      const uYr = String(uEntry.year || effectiveLayoutYear || '').trim();

      const linkedCodes = [
        ...(unitToProjectCodesMap.get(uKey.toLowerCase()) || []),
        ...(uEntry.name ? (unitToProjectCodesMap.get(uEntry.name.toLowerCase()) || []) : []),
        ...(uEntry.id ? (unitToProjectCodesMap.get(uEntry.id.toLowerCase()) || []) : []),
      ];

      const isLinkedViaProjectLink = linkedCodes.some(lc =>
        pCodes.some(pc => pc.toLowerCase() === lc.toLowerCase() || projectMatchesUnitCode([pc], lc))
      );

      if (!isLinkedViaProjectLink) {
        if (pMeta.store && uStore && uStore !== 'all' && pMeta.store !== uStore) return;
        const isStorewide = pMeta.location === 'ALL' || pMeta.location === 'STORE' || pMeta.location === 'STOREWIDE' || pMeta.location === 'WHOLE STORE' || pMeta.location === 'ALL FLOORS';
        if (pMeta.location && uLoc && !isStorewide && pMeta.location !== uLoc) return;
        if (pMeta.year && uYr && uYr !== 'all' && pMeta.year !== uYr) return;
      }

      const isExactCode = pCodes.some(c => c.toLowerCase() === uKey.toLowerCase() || (uEntry.name && c.toLowerCase() === uEntry.name.toLowerCase()));
      if (isExactCode || isLinkedViaProjectLink || projectMatchesUnitCode(pCodes, uKey) || (uEntry.name && projectMatchesUnitCode(pCodes, uEntry.name))) {
        targetUnitKeys.add(uKey);
      }
    });

    targetUnitKeys.forEach(code => {
      if (dataMap[code]) {
        dataMap[code].matchedProject = p;
        dataMap[code].hasAppProject = true;
        dataMap[code].appProjectStatus = status;
        dataMap[code].appProjectBudget = p.budget || 0;
        dataMap[code].appProjectActual = p.actual || 0;
        dataMap[code].appProjectCode = String(p.code);
        dataMap[code].appProjectYear = String(p.year || effectiveLayoutYear);
        dataMap[code].projectName = p.name || dataMap[code].projectName;
        dataMap[code].startDate = p.computedTakStart || p.start || dataMap[code].startDate;
        dataMap[code].handoverDate = p.computedTakCompl || p.handover || dataMap[code].handoverDate;
        dataMap[code].openingDate = p.computedOpening || p.opening || dataMap[code].openingDate;
        dataMap[code].detail = detailStr || dataMap[code].detail;
        dataMap[code].party = partyStr || dataMap[code].party;
        dataMap[code].appProjectMdStatus = mdStatusStr || dataMap[code].appProjectMdStatus;
        dataMap[code].appMdStatus = mdStatusStr || dataMap[code].appMdStatus;
        dataMap[code].appProjectActStatus = actStatus || dataMap[code].appProjectActStatus;
        dataMap[code].appActStatus = actStatus || dataMap[code].appActStatus;
        dataMap[code].appProjectDetail = detailStr || dataMap[code].appProjectDetail;
        dataMap[code].appDetail = detailStr || dataMap[code].appDetail;
        dataMap[code].appProjectDescription = descStr || dataMap[code].appProjectDescription;
        dataMap[code].appDescription = descStr || dataMap[code].appDescription;
        dataMap[code].appProjectParty = partyStr || dataMap[code].appProjectParty;
        dataMap[code].appParty = partyStr || dataMap[code].appParty;
        dataMap[code].task = taskSummaryStr;
        dataMap[code].taskLines = taskLines;
        dataMap[code].activeTasks = activeTasks;
        dataMap[code].allTasks = allMatchedTasks;
      }
    });
  });

  return dataMap;
}
