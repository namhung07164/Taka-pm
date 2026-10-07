import { writeBatch } from "../lib/firebase";
import { db, APP_ID } from "./firebase";
import { doc, increment } from 'firebase/firestore';
import { Cost } from "../types";
import { useAppStore } from "../store/useAppStore";
import { recordDelta } from "./deltaSyncService";

export interface CostInstallment {
  amount: number;
  status: 'Actual' | 'Forecast' | string;
}

// Thuật toán bóc tách số tiền Thực tế (Actual) và Dự kiến (Forecast)
export function calculatePaidBreakdown(cost: Partial<Cost>): { actualPaid: number; forecastPaid: number; totalApproved: number } {
  const installments = [
    { amount: Number(cost.advanceAmount || cost.advancePaid || cost.firstPaid || 0), status: cost.advanceStatus || cost.firstStatus || 'Actual' },
    { amount: Number(cost.interimAmount || cost.interimPaid || cost.secondPaid || 0), status: cost.interimStatus || cost.secondStatus || 'Forecast' },
    { amount: Number(cost.balanceAmount || cost.balancePaid || cost.thirdPaid || 0), status: cost.balanceStatus || cost.thirdStatus || 'Forecast' },
  ];

  let actualPaid = 0;
  let forecastPaid = 0;

  for (const inst of installments) {
    if (inst.status === 'Actual') {
      actualPaid += inst.amount;
    } else {
      forecastPaid += inst.amount;
    }
  }

  const totalApproved = Number(cost.approvedAmount || cost.amount || (actualPaid + forecastPaid));
  return { actualPaid, forecastPaid, totalApproved };
}

// 1.1. Công thức tính Số Dư Khoản Chi (Cost Balance sau 3 đợt thanh toán)
export function calculateCostBalance(
  actual: number,
  firstPaid: number = 0,
  secondPaid: number = 0,
  thirdPaid: number = 0
): number {
  return (Number(actual) || 0) - ((Number(firstPaid) || 0) + (Number(secondPaid) || 0) + (Number(thirdPaid) || 0));
}

// 1.2. Công thức tính Số Dư Ngân Sách Còn Lại (Budget Remaining)
export function calculateBudgetRemaining(
  budget: number,
  actual: number,
  supportingFee: number = 0
): number {
  return (Number(budget) || 0) - (Number(actual) || 0) + (Number(supportingFee) || 0);
}

// 1.3. Xác định trạng thái cảnh báo sức khỏe Ngân sách
export function getBudgetHealthStatus(
  remaining: number,
  budget: number
): 'normal' | 'warning' | 'danger' {
  if (remaining < 0) return 'danger';
  if (budget > 0 && remaining <= 0.2 * budget) return 'warning';
  return 'normal';
}

// 1.4. Công thức tính Thuế VAT & Tổng tiền hợp đồng
export function calculateVATAmount(amount: number, vatRate: number): { vatAmount: number; totalAmount: number } {
  const cleanAmount = Number(amount) || 0;
  const cleanRate = Number(vatRate) || 0;
  const vatAmount = Math.round(cleanAmount * cleanRate);
  const totalAmount = cleanAmount + vatAmount;
  return { vatAmount, totalAmount };
}

// 1.5. Cấu trúc và hàm Rollup Ngân Sách Cha - Con (Budget Parent-Child Rollup)
export interface BudgetRollupChild {
  budget?: number;
  totalActual?: number;
  totalSupportingFee?: number;
  hasForc?: boolean;
}

export interface BudgetRollupResult {
  totalBudget: number;
  totalActual: number;
  totalSupportingFee: number;
  hasForc: boolean;
  remaining: number;
}

export function calculateParentBudgetRollup(children: BudgetRollupChild[]): BudgetRollupResult {
  const totalBudget = children.reduce((sum, c) => sum + (Number(c.budget) || 0), 0);
  const totalActual = children.reduce((sum, c) => sum + (Number(c.totalActual) || 0), 0);
  const totalSupportingFee = children.reduce((sum, c) => sum + (Number(c.totalSupportingFee) || 0), 0);
  const hasForc = children.some(c => Boolean(c.hasForc));
  const remaining = calculateBudgetRemaining(totalBudget, totalActual, totalSupportingFee);

  return {
    totalBudget,
    totalActual,
    totalSupportingFee,
    hasForc,
    remaining
  };
}

export interface BudgetNode {
  id: string;
  isSelf: boolean;
  isParentNode: boolean;
  code: string;
  name?: string;
  year?: string | number;
  store?: string;
  location?: string;
  type?: string;
  note?: string;
  budget: number;
  totalBudget: number;
  ownActual: number;
  totalActual: number;
  ownSupportingFee: number;
  totalSupportingFee: number;
  hasForc: boolean;
  remaining: number;
  project: any;
  parentId?: string;
  children: BudgetNode[];
  filteredChildren?: BudgetNode[];
  isSearchMatch?: boolean;
}

export interface BudgetTreeResult {
  roots: BudgetNode[];
  projectMap: Map<string, any>;
  codeToProjects: Map<string, any[]>;
}

export function buildBudgetTree(projects: any[], costs: any[]): BudgetTreeResult {
  const projectMap = new Map<string, any>();
  const codeToProjects = new Map<string, any[]>();

  projects.forEach(p => {
    const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
    const projectCosts = costs.filter(c => {
      const costCode = String(c.projectCode || (c as any).code || '').trim().toLowerCase();
      const pCode = String(p.code || '').trim().toLowerCase();
      if (costCode !== pCode) return false;

      const costYear = String(c.projectYear || (c as any).year || '').trim();
      const pYear = String(p.year || (p.start ? String(p.start).substring(0, 4) : '')).trim();
      const matchesYear = !costYear || !pYear || costYear === pYear;
      if (!matchesYear) return false;

      const costStore = String(c.projectStore || (c as any).store || '').trim().toLowerCase();
      const pStore = String(p.store || '').trim().toLowerCase();
      const matchesStore = !costStore || !pStore || costStore === pStore;
      if (!matchesStore) return false;

      return true;
    });

    const computedActual = projectCosts.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
    const computedForc = projectCosts.filter(c => c.costType === 'forc').reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
    const computedSupportingFee = projectCosts.reduce((sum, c) => sum + (Number(c.supportingFee) || 0), 0);

    const fin = p.financial || { totalApproved: p.budget || 0, totalActualPaid: p.actual || 0, totalForecastPaid: 0 };
    const hasCosts = projectCosts.length > 0;

    const finalActual = hasCosts ? computedActual : (fin.totalActualPaid || p.actual || 0);
    const finalForc = hasCosts ? computedForc : (fin.totalForecastPaid || 0);
    const finalSupportingFee = hasCosts ? computedSupportingFee : (p.supportingFee || 0);

    const pData = {
      ...p,
      ownActual: finalActual,
      ownForc: finalForc,
      ownSupportingFee: finalSupportingFee,
      hasForc: finalForc > 0,
      ownBudget: fin.totalApproved || p.budget || 0,
    };
    projectMap.set(key, pData);

    const codeKey = String(p.code).trim().toUpperCase();
    if (!codeToProjects.has(codeKey)) {
      codeToProjects.set(codeKey, []);
    }
    codeToProjects.get(codeKey)!.push(pData);
  });

  const parentToChildrenMap = new Map<string, any[]>();
  const linkedChildIds = new Set<string>();

  projects.forEach(p => {
    if (p.parentId && String(p.parentId).trim()) {
      const parentCode = String(p.parentId).trim().toUpperCase();
      if (codeToProjects.has(parentCode)) {
        if (!parentToChildrenMap.has(parentCode)) {
          parentToChildrenMap.set(parentCode, []);
        }
        const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
        const pData = projectMap.get(key) || p;
        parentToChildrenMap.get(parentCode)!.push(pData);
        linkedChildIds.add(p.id || `${p.code}-${p.year}-${p.store}-${p.no}`);
      }
    }
  });

  const roots: BudgetNode[] = [];

  projects.forEach(p => {
    const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
    if (linkedChildIds.has(pId)) {
      return;
    }

    const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
    const pData = projectMap.get(key) || p;
    const parentCode = String(p.code).trim().toUpperCase();

    const selfBudget = pData.ownBudget ?? 0;
    const selfActual = pData.ownActual ?? 0;
    const selfSupportingFee = pData.ownSupportingFee ?? 0;
    const selfRemaining = selfBudget - selfActual + selfSupportingFee;

    const selfChild: BudgetNode = {
      id: `${pId}_self`,
      isSelf: true,
      isParentNode: false,
      code: p.code,
      name: p.name,
      year: p.year,
      store: p.store,
      location: p.location,
      type: p.type,
      note: p.note,
      budget: selfBudget,
      totalBudget: selfBudget,
      ownActual: selfActual,
      totalActual: selfActual,
      ownSupportingFee: selfSupportingFee,
      totalSupportingFee: selfSupportingFee,
      hasForc: pData.hasForc,
      remaining: selfRemaining,
      project: p,
      children: [],
    };

    const linkedProjects = (parentToChildrenMap.get(parentCode) || []).map((childP: any) => {
      const childId = childP.id || `${childP.code}-${childP.year}-${childP.store}-${childP.no}`;
      const cBudget = childP.ownBudget ?? 0;
      const cActual = childP.ownActual ?? 0;
      const cSupportingFee = childP.ownSupportingFee ?? 0;
      const cRemaining = cBudget - cActual + cSupportingFee;

      return {
        id: childId,
        isSelf: false,
        isParentNode: false,
        code: childP.code,
        name: childP.name,
        year: childP.year,
        store: childP.store,
        location: childP.location,
        type: childP.type,
        note: childP.note,
        budget: cBudget,
        totalBudget: cBudget,
        ownActual: cActual,
        totalActual: cActual,
        ownSupportingFee: cSupportingFee,
        totalSupportingFee: cSupportingFee,
        hasForc: childP.hasForc,
        remaining: cRemaining,
        parentId: childP.parentId,
        project: childP,
        children: [],
      };
    });

    const allChildren = [selfChild, ...linkedProjects];
    const rollup = calculateParentBudgetRollup(allChildren);

    const parentNode: BudgetNode = {
      ...pData,
      id: pId,
      isParentNode: true,
      isSelf: false,
      totalBudget: rollup.totalBudget,
      totalActual: rollup.totalActual,
      totalSupportingFee: rollup.totalSupportingFee,
      ownSupportingFee: selfSupportingFee,
      hasForc: rollup.hasForc,
      remaining: rollup.remaining,
      children: allChildren,
      project: p,
    };

    roots.push(parentNode);
  });

  return { roots, projectMap, codeToProjects };
}

export interface BudgetFilterOptions {
  globalYearFilter?: string;
  effectiveStore?: string;
  globalLocationFilter?: string[];
  codeFilter?: string;
  searchTerm?: string;
  moneyFilter?: 'all' | 'has_money' | 'has_budget' | 'has_act_forc';
}

export function filterBudgetRoots(roots: BudgetNode[], options: BudgetFilterOptions = {}): BudgetNode[] {
  const {
    globalYearFilter = 'all',
    effectiveStore = 'all',
    globalLocationFilter = [],
    codeFilter = '',
    searchTerm = '',
    moneyFilter = 'all'
  } = options;

  const cleanCode = (codeFilter || '').replace(/["']/g, '').trim().toLowerCase();

  return roots.filter(node => {
    const pYear = node.year ? String(node.year) : (node.project?.start ? String(node.project.start).substring(0, 4) : null);
    const matchesYear = globalYearFilter === 'all' || pYear === globalYearFilter;
    const matchesStore = effectiveStore === 'all' || node.store === effectiveStore;
    const matchesLocation = globalLocationFilter.length === 0 || (node.location && globalLocationFilter.includes(node.location));

    const hasBudget = (node.totalBudget || 0) !== 0;
    const hasActForc = (node.totalActual || 0) !== 0;
    let matchesMoney = true;
    if (moneyFilter === 'has_money') matchesMoney = hasBudget || hasActForc;
    else if (moneyFilter === 'has_budget') matchesMoney = hasBudget;
    else if (moneyFilter === 'has_act_forc') matchesMoney = hasActForc;

    const baseParentMatch = matchesYear && matchesStore && matchesLocation && matchesMoney;

    const matchesCode = !cleanCode || String(node.code || '').toLowerCase().includes(cleanCode) ||
      (node.children && node.children.some(c => String(c.code || '').toLowerCase().includes(cleanCode)));
    if (!matchesCode) return false;

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase().trim();
      const isParentMatch = [
        node.code, node.name, node.store, node.location, node.type, node.note, node.year,
        node.totalBudget, node.totalActual, node.remaining
      ].some(val => String(val ?? '').toLowerCase().includes(lowerTerm));

      const anyChildMatch = node.children && node.children.some(child => [
        child.code, child.name, child.store, child.location, child.type, child.note, child.year,
        child.budget, child.totalActual, child.remaining
      ].some(val => String(val ?? '').toLowerCase().includes(lowerTerm)));

      if (!isParentMatch && !anyChildMatch) return false;
    }

    return baseParentMatch;
  });
}

export function calculateBudgetGlobalTotals(filteredRoots: BudgetNode[]) {
  const totalBudget = filteredRoots.reduce((sum, p) => sum + (p.totalBudget || 0), 0);
  const totalActual = filteredRoots.reduce((sum, p) => sum + (p.totalActual || 0), 0);
  const totalSupportingFee = filteredRoots.reduce((sum, p) => sum + (p.totalSupportingFee || 0), 0);
  const totalRemaining = totalBudget - totalActual + totalSupportingFee;
  return { totalBudget, totalActual, totalSupportingFee, totalRemaining };
}

// 1.6. Tính toán chênh lệch (Deltas) khi thêm/sửa chi phí
export function calculateCostDeltas(newCostData: Partial<Cost>, oldCostData: Partial<Cost> | null) {
  const oldCalc = oldCostData ? calculatePaidBreakdown(oldCostData) : { actualPaid: 0, forecastPaid: 0, totalApproved: 0 };
  const newCalc = calculatePaidBreakdown(newCostData);

  const deltaActual = newCalc.actualPaid - oldCalc.actualPaid;
  const deltaForecast = newCalc.forecastPaid - oldCalc.forecastPaid;
  const deltaApproved = newCalc.totalApproved - oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast);

  return {
    oldCalc,
    newCalc,
    deltaActual,
    deltaForecast,
    deltaApproved,
    deltaBalance
  };
}

// 1.7. Tổng hợp chi phí theo danh sách khoản chi của Dự án
export function calculateCostsSummaryForProject(costs: Array<Partial<Cost>>) {
  const totalActual = costs.reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
  const totalForc = costs.filter(c => c.costType === 'forc').reduce((sum, c) => sum + (Number(c.actual) || 0), 0);
  const totalSupportingFee = costs.reduce((sum, c) => sum + (Number(c.supportingFee) || 0), 0);
  const totalFirstPaid = costs.reduce((sum, c) => sum + (Number(c.firstPaid) || 0), 0);
  const totalSecondPaid = costs.reduce((sum, c) => sum + (Number(c.secondPaid) || 0), 0);
  const totalThirdPaid = costs.reduce((sum, c) => sum + (Number(c.thirdPaid) || 0), 0);
  const totalBalance = costs.reduce((sum, c) => sum + calculateCostBalance(c.actual, c.firstPaid, c.secondPaid, c.thirdPaid), 0);
  const hasForc = costs.some(c => c.costType === 'forc');

  return {
    totalActual,
    totalForc,
    totalSupportingFee,
    totalFirstPaid,
    totalSecondPaid,
    totalThirdPaid,
    totalBalance,
    hasForc
  };
}

export async function saveCostWithAtomicSummary(
  projectId: string, 
  newCostData: Cost, 
  oldCostData: Cost | null, 
  budgetHierarchy?: { level3Id?: string, level2Id?: string, level1Id?: string }
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Calculate Deltas
  const oldCalc = oldCostData ? calculatePaidBreakdown(oldCostData) : { actualPaid: 0, forecastPaid: 0, totalApproved: 0 };
  const newCalc = calculatePaidBreakdown(newCostData);

  const deltaActual = newCalc.actualPaid - oldCalc.actualPaid;
  const deltaForecast = newCalc.forecastPaid - oldCalc.forecastPaid;
  const deltaApproved = newCalc.totalApproved - oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast);

  // 2. Cost Document (if newCostData.id doesn't exist, we assume it's created outside, but let's handle setting it)
  const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCostData.id);
  // Using set with merge to either create or update
  batch.set(costRef, { ...newCostData, updatedAt: new Date().toISOString() }, { merge: true });

  // 3. Budget Hierarchy Cascade
  if (budgetHierarchy) {
    if (budgetHierarchy.level3Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level3Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level2Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level2Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level1Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level1Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
  }

  // 4. Create 1 single payload for taka_projects (Dot-Notation)
  const projectUpdates: Record<string, any> = {};

  // 4.1. Project Totals
  projectUpdates['financial.totalApproved'] = increment(deltaApproved);
  projectUpdates['financial.totalActualPaid'] = increment(deltaActual);
  projectUpdates['financial.totalForecastPaid'] = increment(deltaForecast);
  projectUpdates['financial.totalBalance'] = increment(deltaBalance);

  // 4.2. Store Logic
  const oldStore = (oldCostData?.projectStore || 'HCM').toUpperCase();
  const newStore = (newCostData.projectStore || 'HCM').toUpperCase();

  if (!oldCostData || oldStore === newStore) {
    projectUpdates[`financial.byStore.${newStore}.totalApproved`] = increment(deltaApproved);
    projectUpdates[`financial.byStore.${newStore}.totalActualPaid`] = increment(deltaActual);
    projectUpdates[`financial.byStore.${newStore}.totalForecastPaid`] = increment(deltaForecast);
    projectUpdates[`financial.byStore.${newStore}.totalBalance`] = increment(deltaBalance);
  } else {
    // CHANGE OF STORE: subtract old from oldStore, add new to newStore
    projectUpdates[`financial.byStore.${oldStore}.totalApproved`] = increment(-oldCalc.totalApproved);
    projectUpdates[`financial.byStore.${oldStore}.totalActualPaid`] = increment(-oldCalc.actualPaid);
    projectUpdates[`financial.byStore.${oldStore}.totalForecastPaid`] = increment(-oldCalc.forecastPaid);
    projectUpdates[`financial.byStore.${oldStore}.totalBalance`] = increment(-(oldCalc.totalApproved - (oldCalc.actualPaid + oldCalc.forecastPaid)));

    projectUpdates[`financial.byStore.${newStore}.totalApproved`] = increment(newCalc.totalApproved);
    projectUpdates[`financial.byStore.${newStore}.totalActualPaid`] = increment(newCalc.actualPaid);
    projectUpdates[`financial.byStore.${newStore}.totalForecastPaid`] = increment(newCalc.forecastPaid);
    projectUpdates[`financial.byStore.${newStore}.totalBalance`] = increment(newCalc.totalApproved - (newCalc.actualPaid + newCalc.forecastPaid));
  }

  // 4.3. Year Logic
  const oldYear = String(oldCostData?.projectYear || '2026');
  const newYear = String(newCostData.projectYear || '2026');

  if (!oldCostData || oldYear === newYear) {
    projectUpdates[`financial.byYear.${newYear}.totalApproved`] = increment(deltaApproved);
    projectUpdates[`financial.byYear.${newYear}.totalActualPaid`] = increment(deltaActual);
    projectUpdates[`financial.byYear.${newYear}.totalForecastPaid`] = increment(deltaForecast);
    projectUpdates[`financial.byYear.${newYear}.totalBalance`] = increment(deltaBalance);
  } else {
    // CHANGE OF YEAR: subtract old from oldYear, add new to newYear
    projectUpdates[`financial.byYear.${oldYear}.totalApproved`] = increment(-oldCalc.totalApproved);
    projectUpdates[`financial.byYear.${oldYear}.totalActualPaid`] = increment(-oldCalc.actualPaid);
    projectUpdates[`financial.byYear.${oldYear}.totalForecastPaid`] = increment(-oldCalc.forecastPaid);
    projectUpdates[`financial.byYear.${oldYear}.totalBalance`] = increment(-(oldCalc.totalApproved - (oldCalc.actualPaid + oldCalc.forecastPaid)));

    projectUpdates[`financial.byYear.${newYear}.totalApproved`] = increment(newCalc.totalApproved);
    projectUpdates[`financial.byYear.${newYear}.totalActualPaid`] = increment(newCalc.actualPaid);
    projectUpdates[`financial.byYear.${newYear}.totalForecastPaid`] = increment(newCalc.forecastPaid);
    projectUpdates[`financial.byYear.${newYear}.totalBalance`] = increment(newCalc.totalApproved - (newCalc.actualPaid + newCalc.forecastPaid));
  }

  // Apply single update to project
  batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectId), projectUpdates);

  // Optimistic Update: Cập nhật tức thì vào Zustand Store in-memory
  const optimisticPayload: any = {};
  for (const key of Object.keys(projectUpdates)) {
    // projectUpdates uses increment(), we need to extract the raw number for Zustand
    // But since projectUpdates actually contains FieldValue objects, we should just use the calculated deltas!
  }
  
  const optimisticStore = useAppStore.getState();
  optimisticStore.optimisticUpdateProjectFinancial(projectId, {
    'financial.totalApproved': deltaApproved,
    'financial.totalActualPaid': deltaActual,
    'financial.totalForecastPaid': deltaForecast,
    'financial.totalBalance': deltaBalance,
    [`financial.byStore.${newStore}.totalApproved`]: newCalc.totalApproved - (oldStore === newStore ? oldCalc.totalApproved : 0),
    [`financial.byStore.${newStore}.totalActualPaid`]: newCalc.actualPaid - (oldStore === newStore ? oldCalc.actualPaid : 0),
    [`financial.byStore.${newStore}.totalForecastPaid`]: newCalc.forecastPaid - (oldStore === newStore ? oldCalc.forecastPaid : 0),
    [`financial.byYear.${newYear}.totalApproved`]: newCalc.totalApproved - (oldYear === newYear ? oldCalc.totalApproved : 0),
    [`financial.byYear.${newYear}.totalActualPaid`]: newCalc.actualPaid - (oldYear === newYear ? oldCalc.actualPaid : 0),
    [`financial.byYear.${newYear}.totalForecastPaid`]: newCalc.forecastPaid - (oldYear === newYear ? oldCalc.forecastPaid : 0),
  });

  if (oldStore !== newStore && oldCostData) {
     optimisticStore.optimisticUpdateProjectFinancial(projectId, {
       [`financial.byStore.${oldStore}.totalApproved`]: -oldCalc.totalApproved,
       [`financial.byStore.${oldStore}.totalActualPaid`]: -oldCalc.actualPaid,
       [`financial.byStore.${oldStore}.totalForecastPaid`]: -oldCalc.forecastPaid,
     });
  }
  if (oldYear !== newYear && oldCostData) {
     optimisticStore.optimisticUpdateProjectFinancial(projectId, {
       [`financial.byYear.${oldYear}.totalApproved`]: -oldCalc.totalApproved,
       [`financial.byYear.${oldYear}.totalActualPaid`]: -oldCalc.actualPaid,
       [`financial.byYear.${oldYear}.totalForecastPaid`]: -oldCalc.forecastPaid,
     });
  }

  // 5. Commit batch
  batch.commit().catch(console.error);

  recordDelta({
    docId: newCostData.id,
    collectionName: 'taka_costs',
    action: oldCostData ? 'update' : 'create',
    isPatch: !!oldCostData,
    data: newCostData,
    year: String(newCostData.projectYear || '2026'),
  }).catch(() => {});
}

export async function deleteCostWithAtomicSummary(
  projectId: string, 
  costToDelete: Cost, 
  budgetHierarchy?: { level3Id?: string, level2Id?: string, level1Id?: string }
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Calculate Deltas for deletion
  const oldCalc = calculatePaidBreakdown(costToDelete);

  const deltaActual = -oldCalc.actualPaid;
  const deltaForecast = -oldCalc.forecastPaid;
  const deltaApproved = -oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast); // - (totalApproved - paid)

  // 2. Cost Document (Mark Deleted for Delta Sync)
  const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', costToDelete.id);
  batch.set(costRef, { id: costToDelete.id, isDeleted: true, updatedAt: new Date().toISOString() }, { merge: true });

  // 3. Budget Hierarchy Cascade
  if (budgetHierarchy) {
    if (budgetHierarchy.level3Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level3Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level2Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level2Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level1Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level1Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
  }

  // 4. Create 1 single payload for taka_projects (Dot-Notation)
  const projectUpdates: Record<string, any> = {};

  projectUpdates['financial.totalApproved'] = increment(deltaApproved);
  projectUpdates['financial.totalActualPaid'] = increment(deltaActual);
  projectUpdates['financial.totalForecastPaid'] = increment(deltaForecast);
  projectUpdates['financial.totalBalance'] = increment(deltaBalance);

  const store = (costToDelete.projectStore || 'HCM').toUpperCase();
  projectUpdates[`financial.byStore.${store}.totalApproved`] = increment(deltaApproved);
  projectUpdates[`financial.byStore.${store}.totalActualPaid`] = increment(deltaActual);
  projectUpdates[`financial.byStore.${store}.totalForecastPaid`] = increment(deltaForecast);
  projectUpdates[`financial.byStore.${store}.totalBalance`] = increment(deltaBalance);

  const year = String(costToDelete.projectYear || '2026');
  projectUpdates[`financial.byYear.${year}.totalApproved`] = increment(deltaApproved);
  projectUpdates[`financial.byYear.${year}.totalActualPaid`] = increment(deltaActual);
  projectUpdates[`financial.byYear.${year}.totalForecastPaid`] = increment(deltaForecast);
  projectUpdates[`financial.byYear.${year}.totalBalance`] = increment(deltaBalance);

  batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectId), projectUpdates);

  const optimisticStore = useAppStore.getState();
  optimisticStore.optimisticUpdateProjectFinancial(projectId, {
    'financial.totalApproved': deltaApproved,
    'financial.totalActualPaid': deltaActual,
    'financial.totalForecastPaid': deltaForecast,
    'financial.totalBalance': deltaBalance,
    [`financial.byStore.${store}.totalApproved`]: deltaApproved,
    [`financial.byStore.${store}.totalActualPaid`]: deltaActual,
    [`financial.byStore.${store}.totalForecastPaid`]: deltaForecast,
    [`financial.byStore.${store}.totalBalance`]: deltaBalance,
    [`financial.byYear.${year}.totalApproved`]: deltaApproved,
    [`financial.byYear.${year}.totalActualPaid`]: deltaActual,
    [`financial.byYear.${year}.totalForecastPaid`]: deltaForecast,
    [`financial.byYear.${year}.totalBalance`]: deltaBalance,
  });

  // 5. Commit
  batch.commit().catch(console.error);

  recordDelta({
    docId: costToDelete.id,
    collectionName: 'taka_costs',
    action: 'delete',
    data: { id: costToDelete.id, isDeleted: true },
    year: String(costToDelete.projectYear || '2026'),
  }).catch(() => {});
}
