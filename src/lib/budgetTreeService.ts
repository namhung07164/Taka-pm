import { 
  calculatePaidBreakdown, 
  calculateBudgetRemaining, 
  BudgetRollupChild, 
  BudgetRollupResult 
} from './financialService';

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
