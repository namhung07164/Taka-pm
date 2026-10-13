import React, { useMemo } from "react";
import { Project, Cost } from '../../types';
import { calculateParentBudgetRollup } from '../../lib/financialService';
import { BudgetTreeNode } from './budgetTypes';

interface UseBudgetTreeDataParams {
  projects: Project[];
  costs: Cost[];
}

export function buildBudgetTreeData(projects: Project[], costs: Cost[]): BudgetTreeNode[] {
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

    const getProjectYear = (p: any): string => 
      p.year ? String(p.year).trim() : (p.start ? String(p.start).substring(0, 4) : '');

    const getProjectStore = (p: any): string => 
      String(p.store || '').trim().toUpperCase();

    // Map linked children to parent codes, scoped by parentCode + year + store
    const parentToChildrenMap = new Map<string, any[]>();
    const linkedChildIds = new Set<string>();

    projects.forEach(p => {
      if (p.parentId && String(p.parentId).trim()) {
        const parentCode = String(p.parentId).trim().toUpperCase();
        const candidateParents = codeToProjects.get(parentCode);
        if (candidateParents && candidateParents.length > 0) {
          let childYear = getProjectYear(p);
          let childStore = getProjectStore(p);

          // If child year/store missing, inherit from candidate parent if unambiguous
          if (!childYear && candidateParents.length === 1) {
            childYear = getProjectYear(candidateParents[0]);
          }
          if (!childStore && candidateParents.length === 1) {
            childStore = getProjectStore(candidateParents[0]);
          }

          const scopedKey = `${parentCode}_${childYear}_${childStore}`;
          if (!parentToChildrenMap.has(scopedKey)) {
            parentToChildrenMap.set(scopedKey, []);
          }
          const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
          const pData = projectMap.get(key) || p;
          parentToChildrenMap.get(scopedKey)!.push(pData);
          linkedChildIds.add(p.id || `${p.code}-${p.year}-${p.store}-${p.no}`);
        }
      }
    });

    const roots: BudgetTreeNode[] = [];

    projects.forEach(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;

      // If project is linked as child of another project, it is only a child, not a root parent
      if (linkedChildIds.has(pId)) {
        return;
      }

      const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
      const pData = projectMap.get(key) || p;
      const parentCode = String(p.code).trim().toUpperCase();
      const pYear = getProjectYear(p);
      const pStore = getProjectStore(p);
      const scopedKey = `${parentCode}_${pYear}_${pStore}`;

      // Child 1: Self-Child of this project (its own budget)
      const selfBudget = pData.ownBudget ?? 0;
      const selfActual = pData.ownActual ?? 0;
      const selfSupportingFee = pData.ownSupportingFee ?? 0;
      const selfRemaining = selfBudget - selfActual + selfSupportingFee;

      const selfChild: BudgetTreeNode = {
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

      // Child 2+: Any other projects linked as children under this parent in the same year and store
      const matchedChildren = parentToChildrenMap.get(scopedKey) || [];
      const linkedProjects: BudgetTreeNode[] = matchedChildren.map((childP: any) => {
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

      // Roll-up sums for Parent Node (Budget Mẹ) utilizing central financialService
      const rollup = calculateParentBudgetRollup(allChildren);

      const parentNode: BudgetTreeNode = {
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

    return roots;
}

export function useBudgetTreeData({ projects, costs }: UseBudgetTreeDataParams): BudgetTreeNode[] {
  return useMemo(() => buildBudgetTreeData(projects, costs), [projects, costs]);
}
