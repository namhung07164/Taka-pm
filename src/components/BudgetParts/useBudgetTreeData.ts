import React, { useMemo } from "react";
import { Project, Cost } from '../../types';
import { calculateParentBudgetRollup } from '../../lib/financialService';
import { BudgetTreeNode } from './budgetTypes';
import { normalizeSearchDashes } from '../../lib/utils';

interface UseBudgetTreeDataParams {
  projects: Project[];
  costs: Cost[];
}

export function buildBudgetTreeData(projects: Project[], costs: Cost[]): BudgetTreeNode[] {
  const projectMap = new Map<string, any>();
  const codeToProjects = new Map<string, any[]>();
  const normCode = (c: any) => normalizeSearchDashes(String(c || '')).trim().toUpperCase();

    projects.forEach(p => {
      const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
      const projectCosts = costs.filter(c => {
        const costCode = String(c.projectCode || (c as any).code || '').trim().toLowerCase();
        const pCode = String(p.code || '').trim().toLowerCase();
        if (costCode !== pCode) return false;

        const costYear = String(c.projectYear || (c as any).year || '').trim();
        const pYear = String(p.year || '').trim();
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

      const codeKey = normCode(p.code);
      if (!codeToProjects.has(codeKey)) {
        codeToProjects.set(codeKey, []);
      }
      codeToProjects.get(codeKey)!.push(pData);
    });

    const getProjectYear = (p: any): string => 
      p.year ? String(p.year).trim() : '';

    const getProjectStore = (p: any): string => 
      String(p.store || '').trim().toUpperCase();

    // Map linked children to parent codes, scoped by parentCode + year + store
    const parentToChildrenMap = new Map<string, any[]>();
    const linkedChildIds = new Set<string>();

    projects.forEach(p => {
      if (p.parentId && String(p.parentId).trim()) {
        const parentCode = normCode(p.parentId);
        const candidateParents = codeToProjects.get(parentCode);
        if (candidateParents && candidateParents.length > 0) {
          let childYear = getProjectYear(p);
          let childStore = getProjectStore(p);

          const matchedParent = candidateParents.find(cand => {
            const candStore = getProjectStore(cand);
            const candYear = getProjectYear(cand);
            const matchStore = !childStore || !candStore || childStore === candStore;
            const matchYear = !childYear || !candYear || childYear === candYear;
            return matchStore && matchYear;
          }) || candidateParents[0];

          const parentScopedYear = getProjectYear(matchedParent);
          const parentScopedStore = getProjectStore(matchedParent);
          const scopedKey = `${parentCode}_${parentScopedYear}_${parentScopedStore}`;

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
    const attachedChildIds = new Set<string>();

    projects.forEach(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;

      // If project is linked as child of another project, skip it if already attached
      if (linkedChildIds.has(pId)) {
        return;
      }

      const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
      const pData = projectMap.get(key) || p;
      const parentCode = normCode(p.code);
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

      linkedProjects.forEach(c => {
        attachedChildIds.add(c.id);
        if (c.project?.id) attachedChildIds.add(c.project.id);
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

    // Safety net: Any linked child that was NOT attached to any active parent remains visible as a root project
    projects.forEach(p => {
      const pId = p.id || `${p.code}-${p.year}-${p.store}-${p.no}`;
      if (linkedChildIds.has(pId) && !attachedChildIds.has(pId) && (!p.id || !attachedChildIds.has(p.id))) {
        const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '')}_${String(p.store || '')}`;
        const pData = projectMap.get(key) || p;
        const b = pData.ownBudget ?? 0;
        const a = pData.ownActual ?? 0;
        const sf = pData.ownSupportingFee ?? 0;
        roots.push({
          ...pData,
          id: pId,
          isParentNode: false,
          isSelf: false,
          totalBudget: b,
          totalActual: a,
          totalSupportingFee: sf,
          ownSupportingFee: sf,
          hasForc: pData.hasForc,
          remaining: b - a + sf,
          children: [],
          project: p,
        });
      }
    });

    return roots;
}

export function useBudgetTreeData({ projects, costs }: UseBudgetTreeDataParams): BudgetTreeNode[] {
  return useMemo(() => buildBudgetTreeData(projects, costs), [projects, costs]);
}
