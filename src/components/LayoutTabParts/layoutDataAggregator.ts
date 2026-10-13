import { Project } from '../../types';
import { 
  getStatus, 
  computeProjectActStatus, 
  extractAllProjectCodes, 
  projectMatchesUnitCode, 
  extractProjectMetadata, 
  projectMatchesScope,
  computePlanProgressFromSummaries,
  computeActProgressFromSummaries,
  computePlanProgressPercent,
  computeActProgressPercent
} from '../../lib/utils';

export interface BuildAggregatedUnitDataParams {
  units: any[];
  summaryData: any[];
  enrichedProjects: Project[];
  tasks: any[];
  projectLinkData: any[];
  storeFilter: string;
  locationFilter: string;
  targetLoc: string;
  effectiveLayoutYear: string;
  delegationGroups: any[];
  layoutTooltipVisibility: any;
  restrictedProjectCodes: Set<string>;
  hasStoredUnitImages: (key: string | undefined | null, store?: string) => boolean;
}

export function buildAggregatedUnitData({
  units,
  summaryData,
  enrichedProjects,
  tasks,
  projectLinkData,
  storeFilter,
  locationFilter,
  targetLoc,
  effectiveLayoutYear,
  delegationGroups,
  layoutTooltipVisibility,
  restrictedProjectCodes,
  hasStoredUnitImages,
}: BuildAggregatedUnitDataParams) {
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

  // Pre-index tasks by code map and projectId for O(1) lookup (Filtered by store and year)
  const tasksByCodeMap = new Map<string, any[]>();
  const tasksByProjIdMap = new Map<string, any[]>();
  tasks.forEach(t => {
    if (!t || !t.name) return;
    const tStore = String(t.projectStore || t.store || '').toUpperCase().trim();
    if (tStore && tStore !== 'ALL' && storeFilter && storeFilter !== 'all' && tStore !== storeFilter.toUpperCase().trim()) return;
    const tYear = String(t.projectYear || t.year || '').trim();
    if (tYear && tYear !== 'ALL' && effectiveLayoutYear && effectiveLayoutYear !== 'all' && tYear !== String(effectiveLayoutYear).trim()) return;

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

  // Pre-index projectLink: maps unit name -> list of linked project codes
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
    
    const seenTaskKeys = new Set<string>();
    const allMatchedTasks: any[] = [];
    const addTaskIfUnique = (t: any) => {
      if (!t) return;
      const key = t.id 
        ? String(t.id).trim().toLowerCase()
        : `${String(t.name || '').trim().toLowerCase()}_${String(t.start || t.startDate || '').trim()}_${String(t.finish || t.endDate || '').trim()}`;
      if (!seenTaskKeys.has(key)) {
        seenTaskKeys.add(key);
        allMatchedTasks.push(t);
      }
    };

    if (p.id) {
      const pIdLower = String(p.id).trim().toLowerCase();
      const list = tasksByProjIdMap.get(pIdLower);
      if (list) list.forEach(addTaskIfUnique);
    }
    if (p.no) {
      const pNoLower = String(p.no).trim().toLowerCase();
      const list = tasksByProjIdMap.get(pNoLower);
      if (list) list.forEach(addTaskIfUnique);
    }
    pCodes.forEach(c => {
      const list = tasksByCodeMap.get(c);
      if (list) list.forEach(addTaskIfUnique);
    });
    if (p.code) {
      const pCodeLower = String(p.code).trim().toLowerCase();
      const list = tasksByCodeMap.get(pCodeLower);
      if (list) list.forEach(addTaskIfUnique);
    }
    // Only supplement from p.taskSummaries if not already captured from real tasks
    if (p.taskSummaries && Array.isArray(p.taskSummaries)) {
      p.taskSummaries.forEach(addTaskIfUnique);
    }
    const allTaskNames = Array.from(new Set(allMatchedTasks.map((t: any) => t.name).filter(Boolean)));

    const activeTasks = allMatchedTasks.filter((t: any) => {
      const startStr = t.start || t.startDate || t.takStart;
      const finishStr = t.finish || t.end || t.endDate || t.takCompl || t.handover;
      if (!startStr || !finishStr) return false;
      const start = new Date(startStr);
      const finish = new Date(finishStr);
      return now >= start && now <= finish;
    });
    const activeTaskNames = Array.from(new Set(activeTasks.map(t => t.name).filter(Boolean)));

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

    const cleanAllTaskNames = Array.from(new Set(allTaskNames.filter(t => !isUrlOrImageLine(t))));
    const cleanActiveTaskNames = Array.from(new Set(activeTaskNames.filter(t => !isUrlOrImageLine(t))));

    const taskSummaryStr = cleanAllTaskNames.length > 0 
      ? cleanAllTaskNames.join('; ')
      : (cleanActiveTaskNames.join('; ') || (p.taskSummaries?.map((t: any) => t.name).filter((n: string) => !isUrlOrImageLine(n)).join('; ') || ''));

    let taskLines: string[] = [];
    cleanActiveTaskNames.forEach(name => {
      taskLines.push(...name.split('\n').map((l: string) => l.trim()).filter((l: string) => l !== '' && !isUrlOrImageLine(l)));
    });
    taskLines = Array.from(new Set(taskLines));

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

    targetUnitKeys.forEach(code => {
       if (dataMap[code]) {
          const uStore = (dataMap[code]?.store || pMeta.store || storeFilter || '').toUpperCase().trim();
          dataMap[code].matchedProject = p;
          dataMap[code].hasAppProject = true;
          dataMap[code].appProjectStatus = status;
          dataMap[code].appProjectBudget = p.budget || 0;
          dataMap[code].appProjectActual = p.actual || 0;
          dataMap[code].appProjectCode = String(p.code);
          dataMap[code].appProjectYear = pMeta.year || (p.year ? String(p.year) : '');
          dataMap[code].year = pMeta.year || (p.year ? String(p.year) : '') || dataMap[code].year || '';
          dataMap[code].floor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
          dataMap[code].appProjectFloor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
          dataMap[code].appFloor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
          dataMap[code].projectName = p.name || "";
          dataMap[code].startDate = p.start || p.computedTakStart || "";
          dataMap[code].handoverDate = p.handover || p.computedTakCompl || "";
          dataMap[code].openingDate = p.opening || p.computedOpening || "";
          dataMap[code].detail = detailStr;
          dataMap[code].task = taskSummaryStr;
          dataMap[code].taskLines = taskLines;
          dataMap[code].taskSummaries = allMatchedTasks;
          dataMap[code].activeTasks = activeTaskNames;
          dataMap[code].mdStatus = mdStatusStr || dataMap[code].mdStatus || "";
          dataMap[code].actStatus = actStatus || dataMap[code].actStatus || "";
          dataMap[code].party = partyStr;
          dataMap[code].projectStatus = status || dataMap[code].projectStatus || "";
          dataMap[code].status = status || dataMap[code].status || "";

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

          dataMap[code].matchedTasks = allMatchedTasks;
          dataMap[code].subTasks = allMatchedTasks.length > 0 ? allMatchedTasks : (p.taskSummaries || []);

          const projPlanProgress = (allMatchedTasks && allMatchedTasks.length > 0)
            ? computePlanProgressPercent(allMatchedTasks)
            : ((p.computedPlanProgress && p.computedPlanProgress > 0)
                ? p.computedPlanProgress
                : (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0
                    ? computePlanProgressFromSummaries(p.taskSummaries)
                    : (p.computedPlanProgress ?? 0)));

          const projActProgress = (allMatchedTasks && allMatchedTasks.length > 0)
            ? computeActProgressPercent(allMatchedTasks, delegationGroups)
            : ((p.computedActProgress && p.computedActProgress > 0)
                ? p.computedActProgress
                : (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.length > 0
                    ? computeActProgressFromSummaries(p.taskSummaries)
                    : (p.computedActProgress ?? 0)));

          const hasProjectDelegation = Boolean(
            (p as any).delegation ||
            (p as any).hasDelegation ||
            (allMatchedTasks.length > 0 && allMatchedTasks.some((t: any) => Boolean(t.delegation))) ||
            (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.some((ts: any) => Boolean(ts.delegation))) ||
            (delegationGroups && Array.isArray(delegationGroups) && delegationGroups.some((g: any) =>
              (p.code && g.projectCode === p.code) ||
              (p.id && String(g.projectId) === String(p.id)) ||
              (allMatchedTasks.some((t: any) => t.id === g.parentTaskId))
            ))
          );

          dataMap[code].planProgressPercent = projPlanProgress;
          dataMap[code].actProgressPercent = projActProgress;
          dataMap[code].hasProjectDelegation = hasProjectDelegation;

          const hasProjectImages = Boolean(
            (p.thumbnail && typeof p.thumbnail === 'string' && p.thumbnail.trim()) ||
            (p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.trim()) ||
            ((p as any).image && typeof (p as any).image === 'string' && (p as any).image.trim()) ||
            ((p as any).photo && typeof (p as any).photo === 'string' && (p as any).photo.trim()) ||
            (p.taskSummaries && Array.isArray(p.taskSummaries) && p.taskSummaries.some((ts: any) => ts.link || ts.imageUrl || ts.thumbnail || (typeof ts.name === 'string' && ts.name.match(/https?:\/\/[^\s]+/)))) ||
            (p.comments && Array.isArray(p.comments) && p.comments.some((c: any) => c.attachments && c.attachments.length > 0)) ||
            (p as any).imageUrl || (p as any).thumbnail || (p as any).image ||
            dataMap[code].imageUrl || dataMap[code].thumbnail || dataMap[code].image ||
            hasStoredUnitImages(code, uStore) ||
            hasStoredUnitImages(p.code, uStore)
          );
          dataMap[code].hasImage = hasProjectImages || dataMap[code].hasImage;

          const todayStr = now.toISOString().split('T')[0];
          const alertReasons: string[] = [];
          let alertLevel: 'critical' | 'warning' | null = null;

          const isProjectCompleted = (p.computedActProgress ?? 0) >= 100 || 
            String(status).toLowerCase() === 'completed' || 
            String(actStatus).toLowerCase() === 'completed';

          if (layoutTooltipVisibility?.notifications !== false && !isProjectCompleted) {
            const subTasksList = allMatchedTasks.length > 0 ? allMatchedTasks : (p.taskSummaries || []);
            let overdueCount = 0;
            if (layoutTooltipVisibility?.alertOverdue !== false) {
              subTasksList.forEach((st: any) => {
                if (st.finish && st.finish < todayStr) {
                  const prog = st.progress ?? st.computedActProgress ?? 0;
                  if (prog < 100 && st.status !== 'Completed' && st.status !== 'Done' && st.status !== 'Canceled') {
                    overdueCount++;
                  }
                }
              });
            }

            let isDelayed = false;
            if (layoutTooltipVisibility?.alertDelay !== false) {
              const lowerStat = String(status).toLowerCase();
              const lowerAct = String(actStatus).toLowerCase();
              isDelayed = lowerStat.includes('delay') || lowerStat.includes('late') || lowerAct.includes('delay') || lowerAct.includes('late');
            }

            if (isDelayed && overdueCount > 0) {
              alertReasons.push(`Project delayed (${overdueCount} overdue task${overdueCount > 1 ? 's' : ''})`);
              alertLevel = 'critical';
            } else if (isDelayed) {
              alertReasons.push('Project delayed');
              alertLevel = 'critical';
            } else if (overdueCount > 0) {
              alertReasons.push(`${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`);
              alertLevel = 'critical';
            }

            if (layoutTooltipVisibility?.alertHandover !== false) {
              const hDate = p.handover || p.computedTakCompl;
              if (hDate && hDate >= todayStr && (p.computedActProgress ?? 0) < 100) {
                const diffDays = Math.ceil((new Date(hDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays <= 3) {
                  alertReasons.push(`Handover ${diffDays === 0 ? 'Today' : 'in ' + diffDays + 'd'}`);
                  if (!alertLevel) alertLevel = 'warning';
                }
              }
            }

            if (layoutTooltipVisibility?.alertOpening !== false) {
              const oDate = p.opening || p.computedOpening;
              if (oDate && oDate >= todayStr && (p.computedActProgress ?? 0) < 100) {
                const diffDays = Math.ceil((new Date(oDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays >= 0 && diffDays <= 5) {
                  const actProg = p.computedActProgress ?? 0;
                  if (actProg < 80 && layoutTooltipVisibility?.alertOpeningRisk !== false) {
                    alertReasons.push(`Opening at risk (<80% prg, ${diffDays === 0 ? 'Today' : 'in ' + diffDays + 'd'})`);
                    alertLevel = 'critical';
                  } else if (diffDays <= 3) {
                    alertReasons.push(`Opening ${diffDays === 0 ? 'Today' : 'in ' + diffDays + 'd'}`);
                    if (!alertLevel) alertLevel = 'warning';
                  }
                }
              }
            }
          }

          dataMap[code].alerts = {
            hasAlert: alertReasons.length > 0,
            level: alertLevel,
            count: alertReasons.length,
            reasons: alertReasons
          };
       }
    });
  });

  return dataMap;
}
