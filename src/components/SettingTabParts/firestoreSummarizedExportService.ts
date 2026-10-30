import { collection, doc, getDoc, getDocsFromServer } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { useAppStore } from '../../store/useAppStore';
import { localDb } from '../../lib/localDb';
import { Project } from '../../types';
import { useDataStore } from '../PictureMapping/DataContext';
import { calculateSummaryData } from '../PictureMapping/lib/summaryData';

export type SummaryExportCategory =
  | 'all_summaries'
  | 'project_task_summaries'
  | 'financial_summaries'
  | 'years_config_meta'
  | 'layout_unit_summaries'
  | 'unit_images_summaries';

export interface SummaryExportOptions {
  category: SummaryExportCategory;
  sourceMode: 'firestore_server' | 'local_cache';
  yearFilter: string;
  storeFilter: string;
  format: 'json' | 'csv';
}

function normalizeStore(store?: string | null): string {
  if (!store) return '';
  const s = String(store).trim().toUpperCase();
  if (s.includes('HN') || s.includes('HÀ NỘI') || s.includes('HA NOI') || s.includes('HANOI')) return 'HN';
  if (s.includes('HCM') || s.includes('HỒ CHÍ MINH') || s.includes('HO CHI MINH') || s.includes('SAI GON') || s.includes('SG')) return 'HCM';
  return s;
}

function matchesYearAndStore(
  itemYear: string | number | undefined,
  itemStore: string | undefined,
  yearFilter: string,
  storeFilter: string
): boolean {
  if (yearFilter && yearFilter !== 'all') {
    if (String(itemYear ?? '').trim() !== String(yearFilter).trim()) {
      return false;
    }
  }
  if (storeFilter && storeFilter !== 'all') {
    const normItem = normalizeStore(itemStore);
    const normFilter = normalizeStore(storeFilter);
    if (normItem && normFilter && normItem !== normFilter) {
      return false;
    }
  }
  return true;
}

async function fetchProjectsForSummary(sourceMode: 'firestore_server' | 'local_cache'): Promise<Project[]> {
  if (sourceMode === 'firestore_server') {
    const snap = await getDocsFromServer(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects')
    );
    return snap.docs
      .map((d) => ({ ...(d.data() as any), id: d.id } as Project))
      .filter((p) => !p.isDeleted);
  }

  const memProjects = useAppStore.getState().projects || [];
  let dbProjects: Project[] = [];
  try {
    dbProjects = await localDb.projects.toArray();
  } catch {
    // fallback to memory
  }
  const map = new Map<string, Project>();
  dbProjects.forEach((p) => {
    if (p?.id && !p.isDeleted) map.set(String(p.id), p);
  });
  memProjects.forEach((p) => {
    if (p?.id && !p.isDeleted) map.set(String(p.id), p);
  });
  return Array.from(map.values());
}

export function buildProjectTaskSummariesPayload(projects: Project[]) {
  return projects.map((p) => ({
    projectId: p.id || '',
    no: p.no,
    year: p.year,
    store: p.store,
    projectCode: p.code,
    linkCodes: p.linkCodes || '',
    projectName: p.name,
    location: p.location || '',
    party: p.party || '',
    shopType: p.shopType || '',
    sizeM2: p.sizeM2 ?? 0,
    mdStatus: p.mdStatus || '',
    computedTakStart: p.computedTakStart || p.start || '',
    computedTakCompl: p.computedTakCompl || p.handover || '',
    computedOpening: p.computedOpening || p.opening || '',
    computedStatus: p.computedStatus || '',
    computedActStatus: p.computedActStatus || '',
    computedPlanProgress: p.computedPlanProgress ?? 0,
    computedActProgress: p.computedActProgress ?? 0,
    taskCount: p.taskCount ?? (Array.isArray(p.taskSummaries) ? p.taskSummaries.length : 0),
    taskSummaries: Array.isArray(p.taskSummaries) ? p.taskSummaries : [],
    updatedAt: p.updatedAt || '',
  }));
}

export function buildFinancialSummariesPayload(projects: Project[]) {
  const storeTotals: Record<string, { budget: number; actual: number; approved: number; actualPaid: number; forecastPaid: number; balance: number; projectCount: number }> = {};
  const yearTotals: Record<string, { budget: number; actual: number; approved: number; actualPaid: number; forecastPaid: number; balance: number; projectCount: number }> = {};

  const items = projects.map((p) => {
    const fin = p.financial;
    const storeKey = normalizeStore(p.store) || 'OTHER';
    const yearKey = String(p.year || 'Unknown');

    const budget = Number(p.budget ?? fin?.totalBudget ?? 0);
    const actual = Number(p.actual ?? 0);
    const approved = Number(fin?.totalApproved ?? 0);
    const actualPaid = Number(fin?.totalActualPaid ?? 0);
    const forecastPaid = Number(fin?.totalForecastPaid ?? 0);
    const balance = Number(fin?.totalBalance ?? (approved - (actualPaid + forecastPaid)));

    if (!storeTotals[storeKey]) {
      storeTotals[storeKey] = { budget: 0, actual: 0, approved: 0, actualPaid: 0, forecastPaid: 0, balance: 0, projectCount: 0 };
    }
    storeTotals[storeKey].budget += budget;
    storeTotals[storeKey].actual += actual;
    storeTotals[storeKey].approved += approved;
    storeTotals[storeKey].actualPaid += actualPaid;
    storeTotals[storeKey].forecastPaid += forecastPaid;
    storeTotals[storeKey].balance += balance;
    storeTotals[storeKey].projectCount += 1;

    if (!yearTotals[yearKey]) {
      yearTotals[yearKey] = { budget: 0, actual: 0, approved: 0, actualPaid: 0, forecastPaid: 0, balance: 0, projectCount: 0 };
    }
    yearTotals[yearKey].budget += budget;
    yearTotals[yearKey].actual += actual;
    yearTotals[yearKey].approved += approved;
    yearTotals[yearKey].actualPaid += actualPaid;
    yearTotals[yearKey].forecastPaid += forecastPaid;
    yearTotals[yearKey].balance += balance;
    yearTotals[yearKey].projectCount += 1;

    return {
      projectId: p.id || '',
      year: p.year,
      store: p.store,
      projectCode: p.code,
      projectName: p.name,
      location: p.location || '',
      party: p.party || '',
      budget,
      actual,
      supportingFee: Number(p.supportingFee ?? 0),
      totalApproved: approved,
      totalActualPaid: actualPaid,
      totalForecastPaid: forecastPaid,
      totalBalance: balance,
      financialRaw: fin || null,
      updatedAt: p.updatedAt || '',
    };
  });

  return {
    aggregatedByStore: storeTotals,
    aggregatedByYear: yearTotals,
    projectFinancialSummaries: items,
  };
}

async function fetchYearsAndConfigMeta(sourceMode: 'firestore_server' | 'local_cache') {
  const st = useAppStore.getState();
  if (sourceMode === 'local_cache') {
    return {
      locations: st.locations || [],
      parties: st.parties || [],
      exchangeRates: { jpyRate: st.jpyRate, usdRate: st.usdRate },
      notificationRulesCount: (st.notificationRules || []).length,
    };
  }

  const [yearsMetaSnap, versionsSnap, locationsSnap, partiesSnap, ratesSnap] = await Promise.all([
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'years_meta')).catch(() => null),
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'versions')).catch(() => null),
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'locations')).catch(() => null),
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'parties')).catch(() => null),
    getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'exchange_rates')).catch(() => null),
  ]);

  return {
    yearsMeta: yearsMetaSnap?.exists() ? yearsMetaSnap.data() : {},
    configVersions: versionsSnap?.exists() ? versionsSnap.data() : {},
    locationsConfig: locationsSnap?.exists() ? locationsSnap.data() : { list: st.locations || [] },
    partiesConfig: partiesSnap?.exists() ? partiesSnap.data() : { list: st.parties || [] },
    exchangeRates: ratesSnap?.exists() ? ratesSnap.data() : { jpyRate: st.jpyRate, usdRate: st.usdRate },
  };
}

async function fetchLayoutUnitSummaries(
  sourceMode: 'firestore_server' | 'local_cache',
  yearFilter: string,
  storeFilter: string
) {
  const ds = useDataStore.getState();
  const computedSummaryRows = calculateSummaryData({
    unitInfo: ds.unitInfo,
    classInfo: ds.classInfo,
    actualClassInfo: ds.actualClassInfo,
    sales: ds.sales,
    profits: ds.profits,
    subFees: ds.subFees,
    mdStatus: ds.mdStatus,
    projectStatus: ds.projectStatus,
    projectLink: ds.projectLink,
    basePlan: ds.basePlan,
    units: ds.units,
    store: storeFilter !== 'all' ? storeFilter : undefined,
    year: yearFilter !== 'all' ? yearFilter : undefined,
  });

  let firestoreMappingConfig: any = null;
  if (sourceMode === 'firestore_server') {
    try {
      const snap = await getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config'));
      if (snap.exists()) {
        firestoreMappingConfig = snap.data();
      }
    } catch {
      // ignore
    }
  }

  const partitionSummaries = Object.entries(
    firestoreMappingConfig?.storeLocationData || ds.storeLocationData || {}
  ).map(([partitionKey, part]: [string, any]) => ({
    partitionKey,
    unitsCount: Array.isArray(part?.mapUnits) ? part.mapUnits.length : 0,
    versionsCount: Array.isArray(part?.mapVersions) ? part.mapVersions.length : 0,
    activeMapVersionId: part?.activeMapVersionId || null,
  }));

  return {
    partitionSummaries,
    computedUnitSummariesCount: computedSummaryRows.length,
    computedUnitSummaries: computedSummaryRows,
    firestorePictureMappingMeta: firestoreMappingConfig
      ? {
          store: firestoreMappingConfig.store,
          location: firestoreMappingConfig.location,
          year: firestoreMappingConfig.year,
          updatedAt: firestoreMappingConfig.updatedAt,
          timestamp: firestoreMappingConfig.timestamp,
        }
      : null,
  };
}

async function fetchUnitImagesSummaries(
  sourceMode: 'firestore_server' | 'local_cache',
  storeFilter: string
) {
  if (sourceMode === 'firestore_server') {
    const snap = await getDocsFromServer(
      collection(db, 'artifacts', APP_ID, 'public', 'data', 'taka_unit_images')
    );
    const docs = snap.docs.map((d) => ({
      docId: d.id,
      ...(d.data() as any),
    }));
    return docs.filter((item) => {
      if (storeFilter && storeFilter !== 'all') {
        return normalizeStore(item.store) === normalizeStore(storeFilter);
      }
      return true;
    });
  }

  const localItems: any[] = [];
  if (typeof localStorage !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('taka_unit_images_')) {
        try {
          const rest = k.replace('taka_unit_images_', '');
          const parts = rest.split('_');
          const st = parts[0] || 'HCM';
          const unitCode = parts.slice(1).join('_');
          if (storeFilter && storeFilter !== 'all' && normalizeStore(st) !== normalizeStore(storeFilter)) {
            continue;
          }
          const images = JSON.parse(localStorage.getItem(k) || '[]');
          localItems.push({
            docId: `${st}_${unitCode}`,
            store: st,
            unitCode,
            imagesCount: Array.isArray(images) ? images.length : 0,
            images,
          });
        } catch {
          // ignore
        }
      }
    }
  }
  return localItems;
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function convertRowsToCsv(headers: string[], rows: Record<string, any>[]): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(','));
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

function triggerBrowserDownload(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function executeDownloadFirestoreSummaries(
  options: SummaryExportOptions
): Promise<{ fileName: string; recordCount: number }> {
  const { category, sourceMode, yearFilter, storeFilter, format } = options;
  const rawProjects = await fetchProjectsForSummary(sourceMode);
  const filteredProjects = rawProjects.filter((p) =>
    matchesYearAndStore(p.year, p.store, yearFilter, storeFilter)
  );

  const dateTag = new Date().toISOString().slice(0, 10);
  const scopeTag = `${storeFilter === 'all' ? 'ALLStores' : storeFilter}_${yearFilter === 'all' ? 'ALLYears' : yearFilter}`;

  if (format === 'csv') {
    if (category === 'financial_summaries') {
      const finData = buildFinancialSummariesPayload(filteredProjects);
      const headers = [
        'projectId', 'year', 'store', 'projectCode', 'projectName', 'location', 'party',
        'budget', 'actual', 'supportingFee', 'totalApproved', 'totalActualPaid', 'totalForecastPaid', 'totalBalance', 'updatedAt'
      ];
      const csv = convertRowsToCsv(headers, finData.projectFinancialSummaries);
      const fileName = `taka_financial_summaries_${scopeTag}_${dateTag}.csv`;
      triggerBrowserDownload(csv, fileName, 'text/csv;charset=utf-8;');
      return { fileName, recordCount: finData.projectFinancialSummaries.length };
    }

    if (category === 'layout_unit_summaries') {
      const layoutData = await fetchLayoutUnitSummaries(sourceMode, yearFilter, storeFilter);
      const headers = [
        'unit', 'floor', 'size', 'projectCode', 'projectName', 'projectStatus', 'actStatus',
        'mdStatus', 'party', 'startDate', 'endDate', 'task', 'salesAmount', 'profitAmount', 'margin'
      ];
      const csv = convertRowsToCsv(headers, layoutData.computedUnitSummaries as any[]);
      const fileName = `taka_layout_unit_summaries_${scopeTag}_${dateTag}.csv`;
      triggerBrowserDownload(csv, fileName, 'text/csv;charset=utf-8;');
      return { fileName, recordCount: layoutData.computedUnitSummaries.length };
    }

    // Default CSV: Project & Task Summaries flattened
    const projSummaries = buildProjectTaskSummariesPayload(filteredProjects);
    const rows: Record<string, any>[] = [];
    projSummaries.forEach((p) => {
      const summaryNames = p.taskSummaries
        .map((ts: any, idx: number) => `${ts.taskCodePhu || `#${idx + 1}`}: ${ts.name || ''} (${ts.start || ''} -> ${ts.finish || ''})`)
        .join(' | ');
      rows.push({
        projectId: p.projectId,
        no: p.no,
        year: p.year,
        store: p.store,
        projectCode: p.projectCode,
        linkCodes: p.linkCodes,
        projectName: p.projectName,
        location: p.location,
        party: p.party,
        shopType: p.shopType,
        sizeM2: p.sizeM2,
        mdStatus: p.mdStatus,
        computedStatus: p.computedStatus,
        computedActStatus: p.computedActStatus,
        computedPlanProgress: p.computedPlanProgress,
        computedActProgress: p.computedActProgress,
        computedTakStart: p.computedTakStart,
        computedTakCompl: p.computedTakCompl,
        computedOpening: p.computedOpening,
        taskCount: p.taskCount,
        taskSummariesFormatted: summaryNames,
        updatedAt: p.updatedAt,
      });
    });

    const headers = [
      'projectId', 'no', 'year', 'store', 'projectCode', 'linkCodes', 'projectName',
      'location', 'party', 'shopType', 'sizeM2', 'mdStatus', 'computedStatus', 'computedActStatus',
      'computedPlanProgress', 'computedActProgress', 'computedTakStart', 'computedTakCompl',
      'computedOpening', 'taskCount', 'taskSummariesFormatted', 'updatedAt'
    ];
    const csv = convertRowsToCsv(headers, rows);
    const fileName = `taka_project_task_summaries_${scopeTag}_${dateTag}.csv`;
    triggerBrowserDownload(csv, fileName, 'text/csv;charset=utf-8;');
    return { fileName, recordCount: rows.length };
  }

  // JSON Export
  let payload: any = {};
  let recordCount = 0;

  if (category === 'project_task_summaries') {
    const list = buildProjectTaskSummariesPayload(filteredProjects);
    payload = { exportedAt: new Date().toISOString(), sourceMode, scope: { yearFilter, storeFilter }, count: list.length, projectTaskSummaries: list };
    recordCount = list.length;
  } else if (category === 'financial_summaries') {
    const fin = buildFinancialSummariesPayload(filteredProjects);
    payload = { exportedAt: new Date().toISOString(), sourceMode, scope: { yearFilter, storeFilter }, ...fin };
    recordCount = fin.projectFinancialSummaries.length;
  } else if (category === 'years_config_meta') {
    const meta = await fetchYearsAndConfigMeta(sourceMode);
    payload = { exportedAt: new Date().toISOString(), sourceMode, ...meta };
    recordCount = Object.keys(meta.yearsMeta || {}).length || 1;
  } else if (category === 'layout_unit_summaries') {
    const layout = await fetchLayoutUnitSummaries(sourceMode, yearFilter, storeFilter);
    payload = { exportedAt: new Date().toISOString(), sourceMode, scope: { yearFilter, storeFilter }, ...layout };
    recordCount = layout.computedUnitSummariesCount;
  } else if (category === 'unit_images_summaries') {
    const imgs = await fetchUnitImagesSummaries(sourceMode, storeFilter);
    payload = { exportedAt: new Date().toISOString(), sourceMode, storeFilter, count: imgs.length, unitImagesSummaries: imgs };
    recordCount = imgs.length;
  } else {
    // all_summaries
    const [meta, layout, imgs] = await Promise.all([
      fetchYearsAndConfigMeta(sourceMode),
      fetchLayoutUnitSummaries(sourceMode, yearFilter, storeFilter),
      fetchUnitImagesSummaries(sourceMode, storeFilter),
    ]);
    const projTask = buildProjectTaskSummariesPayload(filteredProjects);
    const fin = buildFinancialSummariesPayload(filteredProjects);

    payload = {
      exportedAt: new Date().toISOString(),
      sourceMode,
      scope: { yearFilter, storeFilter },
      summaryCounts: {
        projectsCount: projTask.length,
        embeddedTaskSummariesCount: projTask.reduce((acc, p) => acc + p.taskSummaries.length, 0),
        layoutUnitSummariesCount: layout.computedUnitSummariesCount,
        unitImageDocsCount: imgs.length,
      },
      projectTaskSummaries: projTask,
      financialSummaries: fin,
      yearsAndConfigMeta: meta,
      layoutUnitSummaries: layout,
      unitImagesSummaries: imgs,
    };
    recordCount = projTask.length + layout.computedUnitSummariesCount + imgs.length;
  }

  const fileName = `taka_firestore_${category}_${scopeTag}_${dateTag}.json`;
  triggerBrowserDownload(JSON.stringify(payload, null, 2), fileName, 'application/json');
  return { fileName, recordCount };
}
