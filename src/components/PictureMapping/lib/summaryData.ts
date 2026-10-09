import { useShallow } from 'zustand/react/shallow';
import { useMemo } from "react";
import { useDataStore } from '../DataContext';
import { useAppStore } from '../../../store/useAppStore';
import { getStatus, computeProjectActStatus, enrichProjects, extractAllProjectCodes, projectMatchesUnitCode, extractProjectMetadata, projectMatchesScope } from '../../../lib/utils';
import { UnitInfo, SalesInfo } from "../types";

export interface SummaryDataItem extends UnitInfo {
  className?: string;
  salesAmount: number;
  salesByCp: number;
  profitAmount: number;
  profitByCp: number;
  margin: number;
  marginByCp: number;
  mgmtFee: number;
  mdStatus: string;
  mdNotes: string;
  task: string;
  projectStatus: string;
  actStatus: string;
  taskDelegation: string;
  flowStatus: string;
  party: string;
  startDate: string;
  endDate: string;
  detail?: string;
  description?: string;
  projectCode?: string;
  projectName?: string;
  salesByHcmcate: number;
  profitByHcmcate: number;
  hcmSalesEffi: number;
  hcmMargin: number;
}

export function calculateSummaryData({
  unitInfo,
  classInfo,
  actualClassInfo,
  sales: salesData,
  profits: profitData,
  subFees: subFeesData,
  mdStatus: mdStatusData,
  projectStatus: projectStatusData,
  projectLink: projectLinkData,
  basePlan,
  units: unitsData,
  store,
  location,
  year,
}: {
  unitInfo?: any[];
  classInfo?: any[];
  actualClassInfo?: any[];
  sales?: any[];
  profits?: any[];
  subFees?: any[];
  mdStatus?: any[];
  projectStatus?: any[];
  projectLink?: any[];
  basePlan?: any[];
  units?: any[];
  store?: string;
  location?: string;
  year?: string;
}): SummaryDataItem[] {
  // 1. Build Index Maps for fast lookup
  const normalize = (s: any) => String(s || "").toLowerCase().trim();

  const profitMap = new Map();
  (profitData || []).forEach(p => {
    if (!p?.brandCode) return;
    if (!profitMap.has(p.brandCode)) profitMap.set(p.brandCode, []);
    profitMap.get(p.brandCode).push(p);
  });

  const subFeesMap = new Map();
  (subFeesData || []).forEach(sf => {
    if (!sf?.brandCode) return;
    if (!subFeesMap.has(sf.brandCode)) subFeesMap.set(sf.brandCode, []);
    subFeesMap.get(sf.brandCode).push(sf);
  });

  const mdStatusMap = new Map();
  (mdStatusData || []).forEach(md => {
    if (md?.unit) mdStatusMap.set(md.unit, md);
  });

  const projectStatusMap = new Map();
  (projectStatusData || []).forEach(ps => {
    if (!ps?.unit) return;
    if (store && store !== 'all') {
      const psStore = String(ps.store || '').toUpperCase().trim();
      if (psStore && psStore !== 'ALL' && psStore !== store.toUpperCase().trim()) return;
    }
    if (location && location !== 'all') {
      let targetLoc = location.toUpperCase().trim();
      if (targetLoc.endsWith('F')) targetLoc = `L${targetLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(targetLoc)) targetLoc = targetLoc.slice(0, -1);
      let psLoc = String(ps.floor || ps.location || '').toUpperCase().trim();
      if (psLoc.endsWith('F')) psLoc = `L${psLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(psLoc)) psLoc = psLoc.slice(0, -1);
      const isStorewide = psLoc === 'ALL' || psLoc === 'STORE' || psLoc === 'STOREWIDE' || psLoc === 'WHOLE STORE' || psLoc === 'ALL FLOORS';
      if (psLoc && !isStorewide && psLoc !== targetLoc) return;
    }
    if (year && year !== 'all') {
      const targetYear = String(year).trim();
      let psYear = String(ps.year || ps.projectYear || '').trim();
      if (!psYear) {
        const dStr = `${ps.startDate || ''} ${ps.endDate || ''} ${ps.code || ''}`;
        const m = dStr.match(/\b(202\d|203\d)\b/);
        if (m) psYear = m[1];
      }
      if (psYear && psYear !== 'ALL' && psYear !== targetYear) return;
    }
    projectStatusMap.set(ps.unit, ps);
  });

  const projectLinkMap = new Map();
  (projectLinkData || []).forEach(pl => {
    if (!pl?.unit) return;
    if (store && store !== 'all') {
      const plStore = String(pl.store || '').toUpperCase().trim();
      if (plStore && plStore !== 'ALL' && plStore !== store.toUpperCase().trim()) return;
    }
    if (location && location !== 'all') {
      let targetLoc = location.toUpperCase().trim();
      if (targetLoc.endsWith('F')) targetLoc = `L${targetLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(targetLoc)) targetLoc = targetLoc.slice(0, -1);
      let plLoc = String(pl.floor || pl.location || '').toUpperCase().trim();
      if (plLoc.endsWith('F')) plLoc = `L${plLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(plLoc)) plLoc = plLoc.slice(0, -1);
      const isStorewide = plLoc === 'ALL' || plLoc === 'STORE' || plLoc === 'STOREWIDE' || plLoc === 'WHOLE STORE' || plLoc === 'ALL FLOORS';
      if (plLoc && !isStorewide && plLoc !== targetLoc) return;
    }
    if (year && year !== 'all') {
      const targetYear = String(year).trim();
      let plYear = String(pl.year || pl.projectYear || '').trim();
      if (!plYear) {
        const dStr = `${pl.startDate || ''} ${pl.endDate || ''} ${pl.code || ''} ${pl.projectCode || ''}`;
        const m = dStr.match(/\b(202\d|203\d)\b/);
        if (m) plYear = m[1];
      }
      if (plYear && plYear !== 'ALL' && plYear !== targetYear) return;
    }
    projectLinkMap.set(pl.unit, pl);
  });

  const classInfoMap = new Map();
  (classInfo || []).forEach(c => {
    const classCode = normalize(c.classCode || c['class code'] || c['classcode']);
    if (classCode) classInfoMap.set(classCode, c);
  });

  const actualClassInfoMap = new Map();
  (actualClassInfo || []).forEach(c => {
    const classCode = normalize(c.classCode || c['class code'] || c['classcode']);
    if (classCode) actualClassInfoMap.set(classCode, c);
  });

  const basePlanMap = new Map();
  (basePlan || []).forEach(bp => {
    const floor = normalize(bp.floor);
    if (floor) basePlanMap.set(floor, bp);
  });

  const unitsMap = new Map();
  (unitsData || []).forEach(u => {
    const unit = normalize(u.unit);
    if (unit) unitsMap.set(unit, u);
  });

  const appProjects = useAppStore.getState().projects || [];
  const appTasks = useAppStore.getState().tasks || [];
  const appDelegations = useAppStore.getState().delegationGroups || [];
  const enrichedAppProjects = enrichProjects(appProjects, appTasks).filter(p => {
    const pMeta = extractProjectMetadata(p);
    return projectMatchesScope(pMeta, { store, location, year });
  });

  const filteredUnitInfo = (unitInfo || []).filter((unit) => {
    if (store && store !== 'all') {
      const uStore = String(unit.store || '').toUpperCase().trim();
      if (uStore && uStore !== 'ALL' && uStore !== store.toUpperCase().trim()) return false;
    }
    if (location && location !== 'all') {
      let targetLoc = location.toUpperCase().trim();
      if (targetLoc.endsWith('F')) targetLoc = `L${targetLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(targetLoc)) targetLoc = targetLoc.slice(0, -1);
      let uLoc = String(unit.floor || unit.location || '').toUpperCase().trim();
      if (uLoc.endsWith('F')) uLoc = `L${uLoc[0]}`;
      if (/^L\d+[A-Z]$/i.test(uLoc)) uLoc = uLoc.slice(0, -1);
      const isStorewide = uLoc === 'ALL' || uLoc === 'STORE' || uLoc === 'STOREWIDE' || uLoc === 'WHOLE STORE' || uLoc === 'ALL FLOORS';
      if (uLoc && !isStorewide && uLoc !== targetLoc) return false;
    }
    if (year && year !== 'all') {
      const uYear = String(unit.year || '').trim();
      if (uYear && uYear !== 'ALL' && uYear !== String(year).trim()) return false;
    }
    return true;
  });

  return filteredUnitInfo.map((unit) => {
    let salesAmount = 0;
    let salesByCpAmount = 0;

    const matches = (salesData || []).filter((s) => {
      if (!s?.vendorCode && !s?.brandCode && !s?.brandName && !s?.classCode)
        return false;
      let isMatch = true;
      if (s?.vendorCode) {
        if (unit.vendorCode !== s.vendorCode) isMatch = false;
      }
      if (s?.brandCode) {
        if (unit.brandCode !== s.brandCode) isMatch = false;
      }
      if (s?.brandName) {
        if (unit.brandName !== s.brandName) isMatch = false;
      }
      if (s?.classCode && unit.classCode) {
        if (unit.classCode !== s.classCode) isMatch = false;
      }
      return isMatch;
    });

    if (matches.length > 0) {
      salesAmount = matches.reduce((sum, s) => sum + (Number(s?.sales) || 0), 0);
      salesByCpAmount = matches.reduce((sum, s) => sum + (Number(s?.salesByCp) || 0), 0);
    }

    let profitAmount = 0;
    let profitByCpAmount = 0;
    const profitMatches = profitMap.get(unit.brandCode) || [];
    if (profitMatches.length > 0) {
      profitAmount = profitMatches.reduce((sum: number, p: any) => sum + (Number(p?.profit) || 0), 0);
      profitByCpAmount = profitMatches.reduce((sum: number, p: any) => sum + (Number(p?.profitByCp) || 0), 0);
    }

    const margin = salesAmount > 0 ? profitAmount / salesAmount : 0;
    const marginByCp = salesByCpAmount > 0 ? profitByCpAmount / salesByCpAmount : 0;

    const subFeesMatches = subFeesMap.get(unit.brandCode) || [];
    let mgmtFeeAmount = 0;
    if (subFeesMatches.length > 0) {
      mgmtFeeAmount = subFeesMatches.reduce((sum: number, sf: any) => sum + (Number(sf?.managementFee) || 0), 0);
    }

    const mdStatusMatch = mdStatusMap.get(unit.unit);
    const projectStatusMatch = projectStatusMap.get(unit.unit);
    const projectLinkMatch = projectLinkMap.get(unit.unit);

    let linkedAppProject: any = null;
    const targetLinkCode = String(projectLinkMatch?.code || projectLinkMatch?.projectCode || projectLinkMatch?.project || '').trim().toLowerCase();
    
    if (targetLinkCode && enrichedAppProjects.length > 0) {
      linkedAppProject = enrichedAppProjects.find((p: any) => {
        const pCode = String(p.code || '').trim().toLowerCase();
        const pCodes = extractAllProjectCodes(p).map(c => c.toLowerCase());
        return pCode === targetLinkCode || pCodes.includes(targetLinkCode) || projectMatchesUnitCode(pCodes, targetLinkCode);
      });
    }

    if (!linkedAppProject && enrichedAppProjects.length > 0) {
      const uKey = String(unit.unit || '').trim().toLowerCase();
      linkedAppProject = enrichedAppProjects.find((p: any) => {
        const pCodes = extractAllProjectCodes(p).map(c => c.toLowerCase());
        return pCodes.includes(uKey) || projectMatchesUnitCode(pCodes, uKey);
      });
    }

    const appStatusFromProject = linkedAppProject
      ? getStatus(
          linkedAppProject.computedTakStart || linkedAppProject.start,
          linkedAppProject.computedTakCompl || linkedAppProject.handover,
          linkedAppProject.computedOpening || linkedAppProject.opening,
          linkedAppProject.code
        )
      : null;

    const appActStatusFromProject = linkedAppProject
      ? ((linkedAppProject as any).computedActStatus || (linkedAppProject as any).actStatus || computeProjectActStatus(linkedAppProject, appDelegations))
      : null;

    let statusVal = unit.status || "Active";
    if (statusVal === "act") statusVal = "Active";
    if (statusVal === "unact" || statusVal === "Inactive") statusVal = "Unactive";

    const matchedClass = classInfoMap.get(normalize(unit.classCode || unit['class code'] || unit['classcode']));
    const matchedActualClass = actualClassInfoMap.get(normalize(unit.classCode || unit['class code'] || unit['classcode']));

    const salesEffiStr = String(matchedClass?.salesEffi || matchedClass?.['sales effi'] || matchedClass?.['sales efficiency'] || matchedClass?.['hcm sales effi'] || 0);
    const profitEffiStr = String(matchedClass?.profitEffi || matchedClass?.['profit effi'] || matchedClass?.['profit efficiency'] || matchedClass?.['hcm profit effi'] || 0);
    
    const actualSalesEffiStr = String(matchedActualClass?.hcmSalesEffi || matchedActualClass?.['hcm sales effi'] || matchedActualClass?.['sales effi'] || 0);
    const actualProfitEffiStr = String(matchedActualClass?.hcmProfitEffi || matchedActualClass?.['hcm profit effi'] || matchedActualClass?.['profit effi'] || 0);
    
    const explicitMarginStr = String(matchedClass?.margin || matchedClass?.['hcm margin'] || matchedClass?.['margin (%)'] || matchedActualClass?.hcmMargin || matchedActualClass?.['hcm margin'] || 0);
    
    const salesEffi = Number(salesEffiStr.replace(/,/g, '').replace(/%/g, '')) || 0;
    const profitEffi = Number(profitEffiStr.replace(/,/g, '').replace(/%/g, '')) || 0;
    
    const actualSalesEffi = Number(actualSalesEffiStr.replace(/,/g, '').replace(/%/g, '')) || 0;
    const actualProfitEffi = Number(actualProfitEffiStr.replace(/,/g, '').replace(/%/g, '')) || 0;
    
    let explicitMargin = Number(explicitMarginStr.replace(/,/g, '').replace(/%/g, '')) || 0;
    if (explicitMargin > 1) {
      explicitMargin = explicitMargin / 100;
    }
    
    const finalSalesEffi = actualSalesEffi > 0 ? actualSalesEffi : salesEffi;
    const finalProfitEffi = actualProfitEffi !== 0 ? actualProfitEffi : profitEffi;
    
    let hcmMargin = Math.max(explicitMargin, finalSalesEffi > 0 ? finalProfitEffi / finalSalesEffi : 0);
    
    let unitSize = Number(String(unit.size).replace(/,/g, '')) || 0;
    if (unitSize === 0) {
      const matchedUnit = unitsMap.get(normalize(unit.unit));
      if (matchedUnit) {
        unitSize = Number(String(matchedUnit.size).replace(/,/g, '')) || 0;
      }
    }

    const matchedBasePlan = basePlanMap.get(normalize(unit.floor));
    const vsHCMStr = String(matchedBasePlan?.vshcm || matchedBasePlan?.Vshcm || 0);
    const vsHCM = Number(vsHCMStr.replace(/,/g, '').replace(/%/g, '')) || 0;

    const salesByHcmcate = finalSalesEffi * 12 * unitSize * (vsHCM / 100);
    const profitByHcmcate = finalProfitEffi * 12 * unitSize * (vsHCM / 100);

    return {
      ...unit,
      className: matchedClass?.name || matchedActualClass?.name || "",
      status: statusVal,
      update: unit?.update || "-",
      salesAmount,
      salesByCp: salesByCpAmount,
      profitAmount,
      profitByCp: profitByCpAmount,
      margin,
      marginByCp,
      mgmtFee: mgmtFeeAmount,
      mdStatus: mdStatusMatch ? mdStatusMatch.status : "-",
      mdNotes: mdStatusMatch?.mdNotes || "-",
      task: (() => {
        if (linkedAppProject?.taskSummaries && linkedAppProject.taskSummaries.length > 0) {
          return linkedAppProject.taskSummaries.map((t: any) => t.name).join('; ');
        }
        const psTask = projectStatusMatch?.task;
        const plTask = projectLinkMatch?.task;
        if (psTask && plTask && psTask !== plTask) return `${psTask} + ${plTask}`;
        return psTask || plTask || "-";
      })(),
      projectStatus: (() => {
        if (appStatusFromProject) return appStatusFromProject;
        const ps = projectStatusMatch?.status;
        const pl = projectLinkMatch?.status;
        if (ps && pl) return `${ps} + ${pl}`;
        return ps || pl || "N/A";
      })(),
      actStatus: 
        appActStatusFromProject || projectLinkMatch?.actStatus || projectStatusMatch?.actStatus || "-",
      taskDelegation: projectStatusMatch?.delegationStatus || "-",
      flowStatus: projectStatusMatch?.flowStatus || "-",
      party: linkedAppProject?.party || projectStatusMatch?.party || "-",
      startDate: (() => {
        if (linkedAppProject) {
          return linkedAppProject.computedTakStart || linkedAppProject.start || linkedAppProject.takStart || "-";
        }
        const psDate = projectStatusMatch?.startDate;
        const plDate = projectLinkMatch?.startDate;
        if (psDate && plDate && psDate !== plDate) return `${psDate} / ${plDate}`;
        return psDate || plDate || "-";
      })(),
      endDate: (() => {
        if (linkedAppProject) {
          return linkedAppProject.computedTakCompl || linkedAppProject.handover || linkedAppProject.opening || "-";
        }
        const psDate = projectStatusMatch?.endDate;
        const plDate = projectLinkMatch?.endDate;
        if (psDate && plDate && psDate !== plDate) return `${psDate} / ${plDate}`;
        return psDate || plDate || "-";
      })(),
      detail: linkedAppProject?.detail || projectStatusMatch?.detail || "-",
      description: linkedAppProject?.detail || (linkedAppProject as any)?.description || projectStatusMatch?.description || "-",
      projectCode: linkedAppProject?.code || (projectLinkMatch?.code || projectLinkMatch?.projectCode || "-"),
      projectName: linkedAppProject?.name || "-",
      salesByHcmcate,
      profitByHcmcate,
      hcmSalesEffi: finalSalesEffi,
      hcmMargin,
    };
  });
}

export function useSummaryData(scope?: { store?: string; location?: string; year?: string }) {
  const globalStoreFilter = useAppStore(state => state.globalStoreFilter);
  const globalLocationFilter = useAppStore(state => state.globalLocationFilter);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);

  const targetStore = scope?.store || (globalStoreFilter !== 'all' ? globalStoreFilter : undefined);
  const targetLocation = scope?.location || (globalLocationFilter[0] && globalLocationFilter[0] !== 'ALL' ? globalLocationFilter[0] : undefined);
  const targetYear = scope?.year || (globalYearFilter !== 'all' ? globalYearFilter : undefined);

  const { 
    unitInfo,
    classInfo,
    actualClassInfo,
    sales: salesData,
    profits: profitData,
    subFees: subFeesData,
    mdStatus: mdStatusData,
    projectStatus: projectStatusData,
    projectLink: projectLinkData,
    basePlan,
    units: unitsData,
   } = useDataStore(useShallow(state => ({
    unitInfo: state.unitInfo,
    classInfo: state.classInfo,
    actualClassInfo: state.actualClassInfo,
    sales: state.sales,
    profits: state.profits,
    subFees: state.subFees,
    mdStatus: state.mdStatus,
    projectStatus: state.projectStatus,
    projectLink: state.projectLink,
    basePlan: state.basePlan,
    units: state.units,
  })));

  const summaryData = useMemo(() => {
    return calculateSummaryData({
      unitInfo,
      classInfo,
      actualClassInfo,
      sales: salesData,
      profits: profitData,
      subFees: subFeesData,
      mdStatus: mdStatusData,
      projectStatus: projectStatusData,
      projectLink: projectLinkData,
      basePlan,
      units: unitsData,
      store: targetStore,
      location: targetLocation,
      year: targetYear,
    });
  }, [unitInfo, classInfo, actualClassInfo, salesData, profitData, subFeesData, mdStatusData, projectStatusData, projectLinkData, basePlan, unitsData, targetStore, targetLocation, targetYear]);

  return summaryData;
}

export const formatMoney = (val: any) => val ? Number(val).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0';
export const formatPercent = (val: any) => val ? (Number(val) * 100).toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%' : '0%';

export const generateSizeLabelLines = (unit: Record<string, any>, uInfo: any, selectedLabels: string[]) => {
    const lines: { key: string, text: string }[] = [];
    if (selectedLabels.includes('Unit ID')) lines.push({ key: 'Unit ID', text: unit.name });
    if (selectedLabels.includes('Size SQM') && uInfo?.size) lines.push({ key: 'Size SQM', text: `${uInfo.size} SQM` });
    if (selectedLabels.includes('Floor') && uInfo?.floor) lines.push({ key: 'Floor', text: `Floor: ${uInfo.floor}` });
    if (selectedLabels.includes('Brand Code') && uInfo?.brandCode) lines.push({ key: 'Brand Code', text: `Brand Code: ${uInfo.brandCode}` });
    if (selectedLabels.includes('Brand Name') && uInfo?.brandName) lines.push({ key: 'Brand Name', text: uInfo.brandName });
    if (selectedLabels.includes('Vendor Code') && uInfo?.vendorCode) lines.push({ key: 'Vendor Code', text: `Vendor Code: ${uInfo.vendorCode}` });
    if (selectedLabels.includes('Name') && uInfo?.className) lines.push({ key: 'Name', text: uInfo.className });
    if (selectedLabels.includes('Class Code') && uInfo?.classCode) lines.push({ key: 'Class Code', text: uInfo.classCode });
    if (selectedLabels.includes('Update') && uInfo?.update) lines.push({ key: 'Update', text: `Update: ${uInfo.update}` });
    if (selectedLabels.includes('Status') && uInfo?.status) lines.push({ key: 'Status', text: `Status: ${uInfo.status}` });
    if (selectedLabels.includes('MD Status') && uInfo?.mdStatus) lines.push({ key: 'MD Status', text: `MD Status: ${uInfo.mdStatus}` });
    if (selectedLabels.includes('MD Notes') && uInfo?.mdNotes) lines.push({ key: 'MD Notes', text: `MD Notes: ${uInfo.mdNotes}` });
    if (selectedLabels.includes('Task') && uInfo?.task) lines.push({ key: 'Task', text: `Task: ${uInfo.task}` });
    if (selectedLabels.includes('Project Status') && uInfo?.projectStatus) lines.push({ key: 'Project Status', text: `Project Status: ${uInfo.projectStatus}` });
    if (selectedLabels.includes('Act: Status') && uInfo?.actStatus) lines.push({ key: 'Act: Status', text: `Act: Status: ${uInfo.actStatus}` });
    if (selectedLabels.includes('Start Date') && uInfo?.startDate) lines.push({ key: 'Start Date', text: `Start Date: ${uInfo.startDate}` });
    if (selectedLabels.includes('End Date') && uInfo?.endDate) lines.push({ key: 'End Date', text: `End Date: ${uInfo.endDate}` });
    if (selectedLabels.includes('Detail') && uInfo?.detail && uInfo.detail !== '-') lines.push({ key: 'Detail', text: `Detail: ${uInfo.detail}` });
    if (selectedLabels.includes('Description') && uInfo?.description && uInfo.description !== '-') lines.push({ key: 'Description', text: `Desc: ${uInfo.description}` });
    if (selectedLabels.includes('Project Code') && uInfo?.projectCode && uInfo.projectCode !== '-') lines.push({ key: 'Project Code', text: `Project: ${uInfo.projectCode}` });
    if (selectedLabels.includes('Project Name') && uInfo?.projectName && uInfo.projectName !== '-') lines.push({ key: 'Project Name', text: `Project Name: ${uInfo.projectName}` });
    
    if (selectedLabels.includes('Sales') && uInfo?.salesAmount !== undefined) lines.push({ key: 'Sales', text: `Sales: ${formatMoney(uInfo.salesAmount)}` });
    if (selectedLabels.includes('Sales By CP') && uInfo?.salesByCp !== undefined) lines.push({ key: 'Sales By CP', text: `Sales (CP): ${formatMoney(uInfo.salesByCp)}` });
    if (selectedLabels.includes('Sales By HCM Categ') && uInfo?.salesByHcmcate !== undefined) lines.push({ key: 'Sales By HCM Categ', text: `Sales (HCM): ${formatMoney(uInfo.salesByHcmcate)}` });
    
    if (selectedLabels.includes('Profit') && uInfo?.profitAmount !== undefined) lines.push({ key: 'Profit', text: `Profit: ${formatMoney(uInfo.profitAmount)}` });
    if (selectedLabels.includes('Profit By CP') && uInfo?.profitByCp !== undefined) lines.push({ key: 'Profit By CP', text: `Profit (CP): ${formatMoney(uInfo.profitByCp)}` });
    if (selectedLabels.includes('Profit By HCM Categ') && uInfo?.profitByHcmcate !== undefined) lines.push({ key: 'Profit By HCM Categ', text: `Profit (HCM): ${formatMoney(uInfo.profitByHcmcate)}` });
    
    if (selectedLabels.includes('Margin') && uInfo?.margin !== undefined) lines.push({ key: 'Margin', text: `Margin: ${formatPercent(uInfo.margin)}` });
    if (selectedLabels.includes('Margin By CP') && uInfo?.marginByCp !== undefined) lines.push({ key: 'Margin By CP', text: `Margin (CP): ${formatPercent(uInfo.marginByCp)}` });
    if (selectedLabels.includes('HCM Margin') && uInfo?.hcmMargin !== undefined) lines.push({ key: 'HCM Margin', text: `HCM Margin: ${formatPercent(uInfo.hcmMargin)}` });
    
    if (selectedLabels.includes('HCM Sales Effi') && uInfo?.hcmSalesEffi !== undefined) lines.push({ key: 'HCM Sales Effi', text: `HCM Sales Effi: ${formatMoney(uInfo.hcmSalesEffi)}` });
    
    if (lines.length === 0) lines.push({ key: 'Unit ID', text: unit.name });
    return lines;
};

export const generateSizeLabel = (unit: Record<string, any>, uInfo: any, selectedLabels: string[]) => {
    return generateSizeLabelLines(unit, uInfo, selectedLabels).map(l => l.text).join('\n') || unit.name;
};
