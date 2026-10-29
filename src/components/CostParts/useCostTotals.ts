import { useMemo } from 'react';
import { Project, Cost } from '../../types';
import { PaidDateMatches } from './costTypes';

interface UseCostTotalsParams {
  filteredProjectsForDisplay: Project[];
  projects: Project[];
  costs: Cost[];
  paidDateStart: string;
  paidDateEnd: string;
  paidStageFilter: 'all' | '1st' | '2nd' | '3rd';
  getGroupCostsForProject: (p: Project) => Cost[];
  getCostPaidMatches: (
    c: Cost,
    start: string,
    end: string,
    stage: 'all' | '1st' | '2nd' | '3rd'
  ) => PaidDateMatches;
}

export function useCostTotals({
  filteredProjectsForDisplay,
  paidDateStart,
  paidDateEnd,
  paidStageFilter,
  getGroupCostsForProject,
  getCostPaidMatches,
}: UseCostTotalsParams) {
  return useMemo(() => {
    const matchedCosts: Cost[] = [];
    const seenCostIds = new Set<string>();
    const hasDateFilter = Boolean(paidDateStart || paidDateEnd);

    let totalActAll = 0;
    let totalFirstPaidAll = 0;
    let totalSecondPaidAll = 0;
    let totalThirdPaidAll = 0;
    let totalBalanceAll = 0;
    let totalSupAll = 0;
    let totalRemainingAll = 0;

    for (let i = 0; i < filteredProjectsForDisplay.length; i++) {
      const p = filteredProjectsForDisplay[i];
      const pGroupCosts = getGroupCostsForProject(p);
      const hasCosts = pGroupCosts.length > 0;

      let pActualSum = 0;
      let pFirstSum = 0;
      let pSecondSum = 0;
      let pThirdSum = 0;
      let pBalanceSum = 0;
      let pSupSum = 0;

      for (let j = 0; j < pGroupCosts.length; j++) {
        const c = pGroupCosts[j];
        const act = Number(c.actual) || 0;
        const first = Number(c.firstPaid) || 0;
        const second = Number(c.secondPaid) || 0;
        const third = Number(c.thirdPaid) || 0;
        const sup = Number(c.supportingFee) || 0;

        pActualSum += act;
        pFirstSum += first;
        pSecondSum += second;
        pThirdSum += third;
        pBalanceSum += act - first - second - third;
        pSupSum += sup;

        if (!seenCostIds.has(c.id)) {
          if (
            !hasDateFilter ||
            getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches
          ) {
            seenCostIds.add(c.id);
            matchedCosts.push(c);
          }
        }
      }

      const fin = p.financial || {
        totalApproved: p.budget || 0,
        totalActualPaid: p.actual || 0,
      };
      const fallbackActual = fin.totalActualPaid || p.actual || 0;
      const fallbackSup = p.supportingFee || 0;
      const finalBudget = fin.totalApproved || p.budget || 0;

      const effectiveActual = hasCosts ? pActualSum : fallbackActual;
      const effectiveSup = hasCosts ? pSupSum : fallbackSup;

      totalActAll += effectiveActual;
      totalFirstPaidAll += pFirstSum;
      totalSecondPaidAll += pSecondSum;
      totalThirdPaidAll += pThirdSum;
      totalBalanceAll += pBalanceSum;
      totalSupAll += effectiveSup;
      totalRemainingAll += finalBudget - effectiveActual + effectiveSup;
    }

    return {
      filteredCostsForTotals: matchedCosts,
      totalActAll,
      totalFirstPaidAll,
      totalSecondPaidAll,
      totalThirdPaidAll,
      totalBalanceAll,
      totalSupAll,
      totalRemainingAll,
    };
  }, [
    filteredProjectsForDisplay,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    getGroupCostsForProject,
    getCostPaidMatches,
  ]);
}
