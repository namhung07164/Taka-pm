import { useMemo } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { Project, Cost } from '../../types';
import { UnitShape, MapVersion } from '../PictureMapping/components/DataMapping/types';
import { getStatus } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates } from '../../lib/projectDatesService';
import {
  calculateBudgetRemaining, getBudgetHealthStatus, calculatePaidBreakdown,
} from '../../lib/financialService';
import {
  ensureMappingConfigHydrated, normalizeFloorCode, extractPrimaryProjectCodes,
  isProjectGroupedWithOthers, resolveMatchedUnitSizeM2,
} from '../../lib/unitSizeResolver';
import { extractAllProjectCodes, projectMatchesUnitCode } from '../../lib/utilsParts/projectCodeAndScopeUtils';
import { _cachedLocalBackup } from '../../lib/unitCodeMatcher';
import {
  ExecutiveProjectSlideData, ExecutiveFloorSlideData, ExecutiveFinancialBreakdown,
  ExecutiveMilestoneItem, ExecutiveRiskItem, MatchedUnitHighlight,
} from './executiveDeckTypes';

function isCostBelongsToProject(c: Partial<Cost>, p: Partial<Project>): boolean {
  if (!c || !p || (c as { isDeleted?: boolean }).isDeleted) return false;
  if (c.projectId && p.id) return c.projectId === p.id;
  const cStore = String(c.projectStore || '').toUpperCase().trim();
  const pStore = String(p.store || '').toUpperCase().trim();
  if (cStore && pStore && cStore !== pStore) return false;
  const cYear = String(c.projectYear || '').trim();
  const pYear = String(p.year || '').trim();
  if (cYear && pYear && cYear !== pYear) return false;
  const cCode = String(c.projectCode || '').trim().toLowerCase();
  const pCode = String(p.code || '').trim().toLowerCase();
  return Boolean(cCode && pCode && cCode === pCode);
}

function getStatusColorHex(status: string): string {
  const s = (status || '').toLowerCase();
  if (s.includes('completed') || s.includes('handover') || s.includes('done')) return '#10b981';
  if (s.includes('delay') || s.includes('overdue') || s.includes('cancel')) return '#ef4444';
  if (s.includes('process') || s.includes('active')) return '#3b82f6';
  return '#f59e0b';
}

export function useExecutiveDeckData(filters: {
  storeFilter: string;
  yearFilter: string;
  locationFilter: string;
  statusFilter: string;
  searchQuery: string;
  customRiskNotes: Record<string, string>;
}) {
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const costs = useAppStore((state) => state.costs);
  const currency = useAppStore((state) => state.currency);
  const jpyRate = useAppStore((state) => state.jpyRate);
  const usdRate = useAppStore((state) => state.usdRate);

  const storeLocationData = useDataStore((state) => state.storeLocationData);
  const activeStoreInMap = useDataStore((state) => state.store);
  const activeLocInMap = useDataStore((state) => state.location);
  const activeMapUnits = useDataStore((state) => state.mapUnits);
  const activeMapVersions = useDataStore((state) => state.mapVersions);
  const activeMapVersionId = useDataStore((state) => state.activeMapVersionId);

  const formatMoney = useMemo(() => {
    return (valInThousandVnd: number): string => {
      const cleanVal = Number(valInThousandVnd) || 0;
      if (currency === 'JPY') {
        const manYen = (cleanVal * 1000) / (jpyRate || 160) / 10000;
        return `${manYen.toLocaleString('en-US', { maximumFractionDigits: 1 })} 万円`;
      }
      if (currency === 'USD') {
        const usd = (cleanVal * 1000) / (usdRate || 25000);
        return `$${usd.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      }
      return `${Math.round(cleanVal).toLocaleString('en-US')}`;
    };
  }, [currency, jpyRate, usdRate]);

  const currencyLabel = currency === 'VND' ? "'000 VND" : currency === 'JPY' ? '万円 (JPY)' : 'USD';

  const floorPartitionsMap = useMemo(() => {
    ensureMappingConfigHydrated();
    const basePartitions: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId: string | null }> =
      storeLocationData && Object.keys(storeLocationData).length > 0
        ? { ...storeLocationData }
        : { ...(_cachedLocalBackup || {}) };

    const activeKey = `${activeStoreInMap}_${normalizeFloorCode(activeLocInMap)}`;
    if ((activeMapUnits && activeMapUnits.length > 0) || (activeMapVersions && activeMapVersions.length > 0)) {
      const existing = basePartitions[activeKey];
      basePartitions[activeKey] = {
        mapUnits: activeMapUnits.length > 0 ? activeMapUnits : existing?.mapUnits || [],
        mapVersions: activeMapVersions.length > 0 ? activeMapVersions : existing?.mapVersions || [],
        activeMapVersionId: activeMapVersionId || existing?.activeMapVersionId || null,
      };
    }
    return basePartitions;
  }, [storeLocationData, activeStoreInMap, activeLocInMap, activeMapUnits, activeMapVersions, activeMapVersionId]);

  const projectSlides = useMemo<ExecutiveProjectSlideData[]>(() => {
    const activeProjects = (projects || []).filter((p) => {
      if (!p || p.isDeleted) return false;
      const pStore = String(p.store || 'HCM').toUpperCase().trim();
      const pYear = String(p.year || '').trim();
      const pLoc = normalizeFloorCode(p.location);

      if (filters.storeFilter !== 'all' && pStore !== filters.storeFilter.toUpperCase()) return false;
      if (filters.yearFilter !== 'all' && pYear !== String(filters.yearFilter).trim()) return false;
      if (filters.locationFilter !== 'all' && pLoc !== normalizeFloorCode(filters.locationFilter)) return false;

      const computedStatus = getStatus(
        p.computedTakStart || p.start,
        p.computedTakCompl || p.handover,
        p.computedOpening || p.opening,
        p.code
      );
      if (filters.statusFilter !== 'all') {
        if (filters.statusFilter === 'active') {
          if (computedStatus !== 'On process' && computedStatus !== 'Upcoming') return false;
        } else if (computedStatus !== filters.statusFilter) return false;
      }

      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        const hay = `${p.code || ''} ${p.name || ''} ${p.location || ''} ${p.shopType || ''} ${p.party || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const activeTasks = (tasks || []).filter((t) => t && !t.isDeleted);
    const activeCosts = (costs || []).filter((c) => c && !(c as { isDeleted?: boolean }).isDeleted);

    return activeProjects.map((project) => {
      const store = String(project.store || 'HCM').toUpperCase().trim();
      const year = String(project.year || (store === 'HN' ? '2027' : '2026')).trim();
      const location = normalizeFloorCode(project.location) || 'L1';

      const projTasks = getTasksForProject(project, activeTasks, { realTasksOnly: true });
      const computedDates = calculateProjectComputedDates(project, projTasks);

      const takStart = computedDates.computedTakStart || project.computedTakStart || project.start || '-';
      const takCompl = computedDates.computedTakCompl || project.computedTakCompl || project.handover || '-';
      const openingDate = computedDates.computedOpening || project.computedOpening || project.opening || '-';
      const planProgress = Math.round(computedDates.computedPlanProgress ?? project.computedPlanProgress ?? 0);
      const actProgress = Math.round(computedDates.computedActProgress ?? project.computedActProgress ?? 0);

      const overallStatus = getStatus(
        takStart !== '-' ? takStart : undefined,
        takCompl !== '-' ? takCompl : undefined,
        openingDate !== '-' ? openingDate : undefined,
        project.code
      );
      const actStatus = project.computedActStatus || overallStatus;

      const matchedSizeInfo = resolveMatchedUnitSizeM2(project);
      const effectiveSizeM2 = matchedSizeInfo.sizeM2 ?? (Number(project.sizeM2) || 0);

      const partKey = `${store}_${location}`;
      const partition = floorPartitionsMap[partKey];
      let matchedVersion: MapVersion | undefined;
      if (partition && Array.isArray(partition.mapVersions) && partition.mapVersions.length > 0) {
        const yearMatches = partition.mapVersions.filter((v) => String(v.year || '').trim() === year);
        const pool = yearMatches.length > 0 ? yearMatches : partition.mapVersions;
        matchedVersion =
          pool.find((v) => v.id === partition.activeMapVersionId) ||
          pool.find((v) => v.isDynamicActive !== false && Array.isArray(v.groups) && v.groups.length > 0) ||
          pool[0];
      }

      const versionR2Key = (matchedVersion as { r2Key?: string } | undefined)?.r2Key;
      const rawBgUrl =
        matchedVersion?.backgroundUrl ||
        (versionR2Key ? `r2://${versionR2Key}` : null) ||
        project.imageUrl ||
        project.thumbnail ||
        null;

      const combinedUnitsMap = new Map<string, UnitShape>();
      (partition?.mapUnits || []).forEach((u) => {
        if (u && (u.name || u.id)) combinedUnitsMap.set(String(u.name || u.id).trim().toLowerCase(), u);
      });
      (matchedVersion?.mapUnits || []).forEach((u) => {
        if (u && (u.name || u.id)) {
          const k = String(u.name || u.id).trim().toLowerCase();
          const prev = combinedUnitsMap.get(k);
          combinedUnitsMap.set(k, prev ? { ...prev, ...u } : u);
        }
      });

      const allFloorUnits = Array.from(combinedUnitsMap.values());
      const pCodes = isProjectGroupedWithOthers(project)
        ? extractPrimaryProjectCodes(project)
        : extractAllProjectCodes(project);

      const matchedUnits: MatchedUnitHighlight[] = [];
      allFloorUnits.forEach((u) => {
        const uName = String(u.name || u.id || '').trim();
        if (!uName) return;
        const uLower = uName.toLowerCase();
        const isMatch = pCodes.some((c) => c.toLowerCase() === uLower) || projectMatchesUnitCode(pCodes, uName);
        if (isMatch) {
          matchedUnits.push({
            unit: u,
            projectCode: project.code,
            projectName: project.name,
            status: overallStatus,
            color: getStatusColorHex(overallStatus),
            sizeM2: Number(u.sizeM2 ?? u.size ?? effectiveSizeM2) || 0,
          });
        }
      });

      const projCosts = activeCosts.filter((c) => isCostBelongsToProject(c, project));
      let actualPaid = 0;
      let forecastPaid = 0;
      let approvedCost = 0;
      let costSupportingFee = 0;

      if (projCosts.length > 0) {
        projCosts.forEach((c) => {
          const bd = calculatePaidBreakdown(c);
          actualPaid += bd.actualPaid;
          forecastPaid += bd.forecastPaid;
          approvedCost += bd.totalApproved;
          costSupportingFee += Number(c.supportingFee) || 0;
        });
      }

      const budget = Number(project.budget) || 0;
      const supportingFee = Number(project.supportingFee) || costSupportingFee || 0;
      const totalCommitted = actualPaid + forecastPaid;
      const remainingBalance = calculateBudgetRemaining(budget, totalCommitted, supportingFee);
      const effectivePool = budget + supportingFee;
      const utilizationPercent = effectivePool > 0 ? Math.min(999, Math.round((totalCommitted / effectivePool) * 100)) : 0;
      const healthStatus = getBudgetHealthStatus(remainingBalance, budget);

      const financials: ExecutiveFinancialBreakdown = {
        budget, approvedCost, actualPaid, forecastPaid, supportingFee,
        remainingBalance, utilizationPercent, healthStatus,
        formattedBudget: formatMoney(budget),
        formattedActual: formatMoney(actualPaid),
        formattedForecast: formatMoney(forecastPaid),
        formattedSupportingFee: formatMoney(supportingFee),
        formattedRemaining: formatMoney(remainingBalance),
        currencyLabel,
      };

      const pKeyId = String(project.id || project.code);
      const milestones: ExecutiveMilestoneItem[] = [];
      if (takStart && takStart !== '-') {
        milestones.push({
          id: `${pKeyId}-ms-start`,
          name: 'Project Kickoff / Start',
          start: takStart,
          finish: takStart,
          status: planProgress > 0 || actProgress > 0 ? 'Completed' : 'Upcoming',
          party: project.party || 'PMO',
          progress: planProgress > 0 || actProgress > 0 ? 100 : 0,
          isPrimaryMilestone: true,
        });
      }
      if (takCompl && takCompl !== '-') {
        milestones.push({
          id: `${pKeyId}-ms-handover`,
          name: 'Handover / Completion',
          start: takStart !== '-' ? takStart : takCompl,
          finish: takCompl,
          status: overallStatus === 'Completed' ? 'Completed' : overallStatus,
          party: project.party || 'PMO',
          progress: actProgress,
          isPrimaryMilestone: true,
        });
      }
      if (openingDate && openingDate !== '-') {
        milestones.push({
          id: `${pKeyId}-ms-opening`,
          name: 'Grand Opening Milestone',
          start: openingDate,
          finish: openingDate,
          status: overallStatus === 'Completed' ? 'Completed' : 'Upcoming',
          party: 'Store Ops',
          progress: overallStatus === 'Completed' ? 100 : 0,
          isPrimaryMilestone: true,
        });
      }

      const sortedTasks = [...projTasks].sort((a, b) => {
        const prio = (st?: string) => (st === 'Delayed' ? 0 : st === 'On process' ? 1 : st === 'Upcoming' ? 2 : 3);
        const diff = prio(a.runningStatus) - prio(b.runningStatus);
        return diff !== 0 ? diff : String(a.start || '').localeCompare(String(b.start || ''));
      });

      sortedTasks.slice(0, 5).forEach((t) => {
        const tStatus = t.runningStatus || 'Upcoming';
        const tProg = tStatus === 'Completed' || t.approval === 'Approved' ? 100 : tStatus === 'On process' ? 50 : tStatus === 'Delayed' ? 35 : 0;
        milestones.push({
          id: t.id,
          code: t.taskCodePhu,
          name: t.name || 'Unnamed Task',
          start: t.start || '-',
          finish: t.finish || '-',
          status: tStatus,
          party: t.party || '-',
          progress: tProg,
          isPrimaryMilestone: false,
        });
      });

      const risks: ExecutiveRiskItem[] = [];
      const customNote = filters.customRiskNotes[pKeyId];
      if (customNote && customNote.trim()) {
        risks.push({
          id: `${pKeyId}-custom-risk`,
          source: 'Project Note',
          author: 'PM Executive Note',
          content: customNote.trim(),
          severity: 'high',
        });
      } else if (project.note && project.note.trim()) {
        risks.push({
          id: `${pKeyId}-note`,
          source: 'Project Note',
          content: project.note.trim(),
          severity: 'medium',
        });
      }

      const delayedTasks = projTasks.filter((t) => t.runningStatus === 'Delayed');
      delayedTasks.slice(0, 3).forEach((dt) => {
        risks.push({
          id: `${dt.id}-delayed`,
          source: 'Delayed Task',
          author: dt.party || 'Assignee',
          timestamp: dt.finish || '',
          content: `[DELAYED] ${dt.name}${dt.finish ? ` (Due: ${dt.finish})` : ''}`,
          severity: 'high',
        });
      });

      if (Array.isArray(project.comments) && project.comments.length > 0) {
        [...project.comments].slice(-2).reverse().forEach((c) => {
          if (c?.text?.trim()) {
            risks.push({
              id: c.id,
              source: 'Project Comment',
              author: c.userName || c.userId,
              timestamp: c.createdAt ? String(c.createdAt).slice(0, 10) : '',
              content: c.text.trim(),
              severity: 'info',
            });
          }
        });
      }

      if (risks.length < 4) {
        for (const t of projTasks) {
          if (Array.isArray(t.notes) && t.notes.length > 0) {
            const latestNote = t.notes[t.notes.length - 1];
            if (latestNote?.content?.trim()) {
              risks.push({
                id: latestNote.id,
                source: 'Task Note',
                author: t.party || t.name,
                timestamp: latestNote.updatedAt ? String(latestNote.updatedAt).slice(0, 10) : '',
                content: `${t.name}: ${latestNote.content.trim()}`,
                severity: t.runningStatus === 'Delayed' ? 'high' : 'info',
              });
            }
          }
          if (risks.length >= 4) break;
        }
      }

      const completedTaskCount = projTasks.filter(
        (t) => t.runningStatus === 'Completed' || t.approval === 'Approved'
      ).length;

      return {
        project, store, year, location, effectiveSizeM2, overallStatus, actStatus,
        planProgress, actProgress, takStart, takCompl, openingDate,
        floorBgUrl: rawBgUrl,
        floorVersionName: matchedVersion?.name || `${store} - ${location}`,
        floorBgScale: matchedVersion?.backgroundScale ?? 1,
        floorBgPos: matchedVersion?.backgroundPos || { x: 0, y: 0 },
        allFloorUnits, matchedUnits, financials,
        milestones: milestones.slice(0, 7),
        risks: risks.slice(0, 5),
        tasks: projTasks,
        totalTaskCount: projTasks.length,
        completedTaskCount,
        delayedTaskCount: delayedTasks.length,
      };
    });
  }, [projects, tasks, costs, filters, floorPartitionsMap, formatMoney, currencyLabel]);

  const floorSlides = useMemo<ExecutiveFloorSlideData[]>(() => {
    const groups = new Map<string, ExecutiveProjectSlideData[]>();
    projectSlides.forEach((ps) => {
      const key = `${ps.store}_${ps.location}_${ps.year}`;
      const list = groups.get(key) || [];
      list.push(ps);
      groups.set(key, list);
    });

    const result: ExecutiveFloorSlideData[] = [];
    groups.forEach((slides, floorKey) => {
      if (slides.length === 0) return;
      const first = slides[0];
      const totalProjects = slides.length;
      const totalAreaM2 = Math.round(slides.reduce((acc, s) => acc + (s.effectiveSizeM2 || 0), 0) * 100) / 100;
      const avgPlanProgress = Math.round(slides.reduce((acc, s) => acc + s.planProgress, 0) / totalProjects);
      const avgActProgress = Math.round(slides.reduce((acc, s) => acc + s.actProgress, 0) / totalProjects);

      let completedCount = 0, onProcessCount = 0, delayedCount = 0, upcomingCount = 0;
      let sumBudget = 0, sumApproved = 0, sumActual = 0, sumForecast = 0, sumSupporting = 0;

      const matchedUnitsMap = new Map<string, MatchedUnitHighlight>();
      const topRisks: ExecutiveRiskItem[] = [];

      slides.forEach((s) => {
        const st = s.overallStatus;
        if (st === 'Completed' || st === 'Handover') completedCount++;
        else if (s.delayedTaskCount > 0 || st === 'Delayed') delayedCount++;
        else if (st === 'On process') onProcessCount++;
        else upcomingCount++;

        sumBudget += s.financials.budget;
        sumApproved += s.financials.approvedCost;
        sumActual += s.financials.actualPaid;
        sumForecast += s.financials.forecastPaid;
        sumSupporting += s.financials.supportingFee;

        s.matchedUnits.forEach((mu) => {
          const uKey = String(mu.unit.id || mu.unit.name).toLowerCase();
          if (!matchedUnitsMap.has(uKey)) matchedUnitsMap.set(uKey, mu);
        });

        s.risks.forEach((r) => {
          if (topRisks.length < 6) topRisks.push({ ...r, content: `[${s.project.code}] ${r.content}` });
        });
      });

      const totalCommitted = sumActual + sumForecast;
      const remainingBalance = calculateBudgetRemaining(sumBudget, totalCommitted, sumSupporting);
      const effectivePool = sumBudget + sumSupporting;
      const utilizationPercent = effectivePool > 0 ? Math.min(999, Math.round((totalCommitted / effectivePool) * 100)) : 0;

      result.push({
        floorKey,
        store: first.store,
        location: first.location,
        year: first.year,
        floorBgUrl: first.floorBgUrl,
        floorVersionName: first.floorVersionName,
        floorBgScale: first.floorBgScale,
        floorBgPos: first.floorBgPos,
        allFloorUnits: first.allFloorUnits,
        matchedUnits: Array.from(matchedUnitsMap.values()),
        projects: slides,
        totalProjects,
        totalAreaM2,
        avgPlanProgress,
        avgActProgress,
        completedCount,
        onProcessCount,
        delayedCount,
        upcomingCount,
        financials: {
          budget: sumBudget, approvedCost: sumApproved, actualPaid: sumActual,
          forecastPaid: sumForecast, supportingFee: sumSupporting,
          remainingBalance, utilizationPercent,
          healthStatus: getBudgetHealthStatus(remainingBalance, sumBudget),
          formattedBudget: formatMoney(sumBudget),
          formattedActual: formatMoney(sumActual),
          formattedForecast: formatMoney(sumForecast),
          formattedSupportingFee: formatMoney(sumSupporting),
          formattedRemaining: formatMoney(remainingBalance),
          currencyLabel,
        },
        topRisks,
      });
    });

    return result.sort((a, b) => a.floorKey.localeCompare(b.floorKey));
  }, [projectSlides, formatMoney, currencyLabel]);

  return { projectSlides, floorSlides, currencyLabel };
}
