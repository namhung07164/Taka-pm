import React, { useMemo } from 'react';
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
  projects,
  costs,
  paidDateStart,
  paidDateEnd,
  paidStageFilter,
  getGroupCostsForProject,
  getCostPaidMatches,
}: UseCostTotalsParams) {
  const filteredCostsForTotals = useMemo(() => {
    const includedKeys = new Set(
      filteredProjectsForDisplay.map((p) => {
        const pDerivedYear = p.year
          ? p.year
          : p.start
          ? Number(String(p.start).substring(0, 4))
          : undefined;
        return `${String(p.code).trim().toLowerCase()}-${String(
          pDerivedYear || ''
        ).trim()}-${String(p.store || '').trim().toLowerCase()}`;
      })
    );
    return costs.filter((c) => {
      const cCode = String(c.projectCode || '').trim().toLowerCase();
      const cYear = String(c.projectYear || '').trim();
      const cStore = String(c.projectStore || '').trim().toLowerCase();
      const cProjMatched = projects.find((proj) => {
        const projDerivedYear = proj.year
          ? proj.year
          : proj.start
          ? Number(String(proj.start).substring(0, 4))
          : undefined;
        return (
          String(proj.code).trim().toLowerCase() === cCode &&
          (String(projDerivedYear || '').trim() === cYear ||
            (!String(projDerivedYear || '').trim() && !cYear)) &&
          (!cStore ||
            !String(proj.store || '').trim().toLowerCase() ||
            String(proj.store || '').trim().toLowerCase() === cStore)
        );
      });
      if (!cProjMatched) return false;
      const projDerivedYear = cProjMatched.year
        ? cProjMatched.year
        : cProjMatched.start
        ? Number(String(cProjMatched.start).substring(0, 4))
        : undefined;
      const isIncluded = includedKeys.has(
        `${String(cProjMatched.code).trim().toLowerCase()}-${String(
          projDerivedYear || ''
        ).trim()}-${String(cProjMatched.store || '').trim().toLowerCase()}`
      );
      if (!isIncluded) return false;

      if (paidDateStart || paidDateEnd) {
        return getCostPaidMatches(c, paidDateStart, paidDateEnd, paidStageFilter).matches;
      }
      return true;
    });
  }, [
    costs,
    projects,
    filteredProjectsForDisplay,
    paidDateStart,
    paidDateEnd,
    paidStageFilter,
    getCostPaidMatches,
  ]);

  const totalActAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return sum + pGroupCosts.reduce((s, c) => s + (c.actual || 0), 0);
      }
      return sum + (p.financial?.totalActualPaid || p.actual || 0);
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalFirstPaidAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return sum + pGroupCosts.reduce((s, c) => s + (c.firstPaid || 0), 0);
      }
      return sum;
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalSecondPaidAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return sum + pGroupCosts.reduce((s, c) => s + (c.secondPaid || 0), 0);
      }
      return sum;
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalThirdPaidAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return sum + pGroupCosts.reduce((s, c) => s + (c.thirdPaid || 0), 0);
      }
      return sum;
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalBalanceAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return (
          sum +
          pGroupCosts.reduce(
            (s, c) =>
              s +
              ((c.actual || 0) -
                (c.firstPaid || 0) -
                (c.secondPaid || 0) -
                (c.thirdPaid || 0)),
            0
          )
        );
      }
      return sum;
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalSupAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const pGroupCosts = getGroupCostsForProject(p);
      if (pGroupCosts.length > 0) {
        return sum + pGroupCosts.reduce((s, c) => s + (c.supportingFee || 0), 0);
      }
      return sum + (p.supportingFee || 0);
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  const totalRemainingAll = useMemo(() => {
    return filteredProjectsForDisplay.reduce((sum, p) => {
      const projectCosts = getGroupCostsForProject(p);
      const hasCosts = projectCosts.length > 0;
      const computedActual = projectCosts.reduce((s, c) => s + (Number(c.actual) || 0), 0);
      const computedSup = projectCosts.reduce(
        (s, c) => s + (Number(c.supportingFee) || 0),
        0
      );

      const fin = p.financial || {
        totalApproved: p.budget || 0,
        totalActualPaid: p.actual || 0,
      };
      const finalActual = hasCosts ? computedActual : fin.totalActualPaid || p.actual || 0;
      const finalSup = hasCosts ? computedSup : p.supportingFee || 0;
      const finalBudget = fin.totalApproved || p.budget || 0;

      return sum + (finalBudget - finalActual + finalSup);
    }, 0);
  }, [filteredProjectsForDisplay, getGroupCostsForProject]);

  return {
    filteredCostsForTotals,
    totalActAll,
    totalFirstPaidAll,
    totalSecondPaidAll,
    totalThirdPaidAll,
    totalBalanceAll,
    totalSupAll,
    totalRemainingAll,
  };
}
