import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../lib/firebase';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { calculateSummaryData } from './summaryData';
import { getStoredR2Credentials, getStoredR2CredentialsAsync, uploadSingleR2File, extractR2Key, getS3Sdk } from './r2Upload';
import { enrichProjects, getStatus, computeProjectActStatus, projectMatchesUnitCode } from '../../../lib/utils';

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

// Evaluates a set of rules on a unit shape using the data map
export function matchRulesAgainstUnit(unit: UnitShape, rules: GroupRule[] | undefined, dataMap: Record<string, any>): boolean {
  if (!rules || rules.length === 0) return false;
  const uName = (unit.name || '').toLowerCase();
  const data = uName ? dataMap[uName] : null;
  if (!data) return false;

  return rules.every((rule) => {
    let val = data[rule.field];
    const f = String(rule.field || '').toLowerCase().trim();

    // 1. Explicit App Data / Real-time Project checks (Strictly from App Projects & Live Task Summaries - ZERO Excel)
    if (f === 'appprojectstatus' || f === 'appstatus' || f === 'app: status' || f === 'status' || f === 'projectstatus') {
      val = data.hasAppProject ? (data.appProjectStatus || '') : '';
    } else if (f === 'apptask' || f === 'app: task' || f === 'app: task summarize' || f === 'app: task summaries' || f === 'app: tasks' || f === 'task' || f === 'tasks' || f === 'tasksummaries' || f === 'task summarize' || f === 'task summary' || f === 'task name') {
      val = data.hasAppProject ? (data.task || '') : '';
    } else if (f === 'appprojectyear' || f === 'appyear' || f === 'app: year') {
      val = data.hasAppProject ? (data.appProjectYear || '') : '';
    } else if (f === 'appprojectcode' || f === 'appcode' || f === 'app: project code') {
      val = data.hasAppProject ? (data.appProjectCode || '') : '';
    } else if (f === 'appprojectfloor' || f === 'appfloor' || f === 'app: floor') {
      val = data.hasAppProject ? (data.location || data.floor || '') : '';
    } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
      val = data.hasAppProject ? (data.appProjectMdStatus || '') : '';
    } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status' || f === 'actstatus') {
      val = data.hasAppProject ? (data.appProjectActStatus || '') : '';
    } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)' || f === 'detail') {
      val = data.hasAppProject ? (data.appProjectDetail || '') : '';
    } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)' || f === 'description (project)') {
      val = data.hasAppProject ? (data.appProjectDescription || '') : '';
    } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party' || f === 'party') {
      val = data.hasAppProject ? (data.appProjectParty || '') : '';
    } else if (f === 'appprojectbudget' || f === 'appbudget' || f === 'app: budget' || f === 'budget') {
      val = data.hasAppProject ? (data.appProjectBudget ?? 0) : 0;
    } else if (f === 'appprojectactual' || f === 'appactual' || f === 'app: actual' || f === 'actual') {
      val = data.hasAppProject ? (data.appProjectActual ?? 0) : 0;
    } else if (val === undefined || val === null || String(val).trim() === '') {
      // 2. General attribute fallbacks
      if (f === 'floor' || f === 'location') {
        val = data.floor || unit.location || '';
      } else if (f === 'year') {
        val = data.year || '';
      } else if (f === 'mdstatus') {
        val = data.hasAppProject ? (data.appProjectMdStatus || data.mdStatus || '') : (data.mdStatus || '');
      } else if (f === 'unit' || f === 'code') {
        val = data.unit || data.appProjectCode || unit.name || '';
      }
    }

    if (rule.field === 'margin' || rule.field === 'marginByCp') {
      val = val * 100;
    }

    const numVal = Number(rule.value);
    const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== '';

    let res = false;
    let compareValStr = String(val || '').toLowerCase().trim();
    let compareRuleStr = String(rule.value || '').toLowerCase().trim();
    if (compareRuleStr === 'in progress') compareRuleStr = 'on process';
    if (compareValStr === 'in progress') compareValStr = 'on process';

    switch (rule.operator) {
      case '>':
        res = isNum ? Number(val) > numVal : false;
        break;
      case '<':
        res = isNum ? Number(val) < numVal : false;
        break;
      case '>=':
        res = isNum ? Number(val) >= numVal : false;
        break;
      case '<=':
        res = isNum ? Number(val) <= numVal : false;
        break;
      case '=':
        res = compareValStr === compareRuleStr;
        break;
      case 'contains': {
        const searchTerms = compareRuleStr.split(/\s+/);
        res = searchTerms.every((term) => compareValStr.includes(term));
        break;
      }
      case 'or':
      case 'OR': {
        const orTerms = compareRuleStr
          .split(/[\r\n\t,;+/&|]+|\s{2,}/)
          .map((t) => {
            let tr = t.trim();
            if (tr === 'in progress') tr = 'on process';
            return tr;
          })
          .filter(Boolean);
        if (orTerms.length === 0) {
          const spaceTerms = compareRuleStr.split(/\s+/).filter(Boolean);
          res = spaceTerms.some(term => compareValStr === term || compareValStr.includes(term));
        } else {
          res = orTerms.some((term) => {
            if (compareValStr === term) return true;
            if (compareValStr.includes(term)) return true;
            if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
            return false;
          });
        }
        break;
      }
      case 'exclude': {
        const searchTerms = compareRuleStr.split(/\s+/);
        res = !searchTerms.some((term) => compareValStr.includes(term));
        break;
      }
      default:
        res = false;
        break;
    }

    return res;
  });
}

/**
 * Helper: Tạo dataMap tương ứng với từng năm cụ thể để đánh giá rule không bị chéo năm
 */
export function buildDataMapForYear(targetYear: string, targetStore: 'HCM' | 'HN'): Record<string, any> {
  const appState = useAppStore.getState();
  const dataState = useDataStore.getState();

  const projects = appState.projects || [];
  const tasks = appState.tasks || [];
  const delegationGroups = appState.delegationGroups || [];
  const enrichedProjects = enrichProjects(projects, tasks, delegationGroups);

  const summaryData = calculateSummaryData({
    unitInfo: dataState.unitInfo,
    classInfo: dataState.classInfo,
    actualClassInfo: dataState.actualClassInfo,
    sales: dataState.sales,
    profits: dataState.profits,
    subFees: dataState.subFees,
    mdStatus: dataState.mdStatus,
    projectStatus: dataState.projectStatus,
    projectLink: dataState.projectLink,
    basePlan: dataState.basePlan,
    units: dataState.units,
  });

  const allUnits = dataState.getAllStoreUnits(targetStore);
  const dataMap: Record<string, any> = {};

  allUnits.forEach((u) => {
    const uName = (u.name || '').toLowerCase();
    if (!uName) return;
    const item = summaryData.find((s) => s.unit?.toLowerCase() === uName);
    dataMap[uName] = {
      name: u.name || '',
      id: u.id,
      unit: u.name || '',
      year: targetYear,
      size: item?.size || 0,
      sales: item?.salesAmount || 0,
      salesAmount: item?.salesAmount || 0,
      salesByCp: item?.salesByCp || 0,
      salesByHcmcate: item?.salesByHcmcate || 0,
      profit: item?.profitAmount || 0,
      profitAmount: item?.profitAmount || 0,
      profitByCp: item?.profitByCp || 0,
      profitByHcmcate: item?.profitByHcmcate || 0,
      margin: item?.margin || 0,
      marginByCp: item?.marginByCp || 0,
      hcmSalesEffi: item?.hcmSalesEffi || 0,
      hcmMargin: item?.hcmMargin || 0,
      mdStatus: item?.mdStatus || '',
      mdNotes: item?.mdNotes || '',
      task: item?.task || '',
      projectStatus: item?.projectStatus || '',
      actStatus: item?.actStatus || '',
      startDate: item?.startDate || '',
      endDate: item?.endDate || '',
      status: item?.status || '',
      vendorCode: item?.vendorCode || '',
      brandCode: item?.brandCode || '',
      brandName: item?.brandName || '',
      classCode: item?.classCode || '',
      floor: u.location || (item as any)?.floor || '',
      appProjectStatus: '',
      appProjectBudget: 0,
      appProjectActual: 0,
      appProjectCode: '',
      appProjectYear: '',
      ...(item || {}),
      unitName: u.name,
    };
  });

  summaryData.forEach((item) => {
    const key = (item.unit || '').toLowerCase();
    if (key && !dataMap[key]) {
      dataMap[key] = {
        name: item.unit || '',
        unit: item.unit || '',
        year: targetYear,
        size: item.size || 0,
        sales: item.salesAmount || 0,
        salesAmount: item.salesAmount || 0,
        salesByCp: item.salesByCp || 0,
        salesByHcmcate: item.salesByHcmcate || 0,
        profit: item.profitAmount || 0,
        profitAmount: item.profitAmount || 0,
        profitByCp: item.profitByCp || 0,
        profitByHcmcate: item.profitByHcmcate || 0,
        margin: item.margin || 0,
        marginByCp: item.marginByCp || 0,
        hcmSalesEffi: item.hcmSalesEffi || 0,
        hcmMargin: item.hcmMargin || 0,
        mdStatus: item.mdStatus || '',
        mdNotes: item.mdNotes || '',
        task: item.task || '',
        projectStatus: item.projectStatus || '',
        actStatus: item.actStatus || '',
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        status: item.status || '',
        vendorCode: item.vendorCode || '',
        brandCode: item.brandCode || '',
        brandName: item.brandName || '',
        classCode: item.classCode || '',
        floor: (item as any)?.floor || '',
        appProjectStatus: '',
        appProjectBudget: 0,
        appProjectActual: 0,
        appProjectCode: '',
        appProjectYear: '',
        ...item,
        unitName: item.unit,
      };
    }
  });

  const normalizedTargetYear = String(targetYear || '').trim();

  // Pre-index projectLink: maps unit name -> list of linked project codes
  const unitToProjectCodesMap = new Map<string, string[]>();
  (dataState.projectLink || []).forEach((pl: any) => {
    const u = String(pl?.unit || '').trim().toLowerCase();
    const pCode = String(pl?.code || pl?.projectCode || pl?.project || '').trim().toLowerCase();
    if (u && pCode) {
      if (!unitToProjectCodesMap.has(u)) unitToProjectCodesMap.set(u, []);
      unitToProjectCodesMap.get(u)!.push(pCode);
    }
  });

  enrichedProjects.forEach((p) => {
    const pYear = String(p.year || (p as any).projectYear || '').trim();
    if (normalizedTargetYear && normalizedTargetYear !== 'all' && pYear && pYear !== normalizedTargetYear) {
      return;
    }

    const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
    const pCodes = rawCodes.split(/[+;,/]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    const status = getStatus(
      p.computedTakStart || p.start,
      p.computedTakCompl || p.handover,
      p.computedOpening || p.opening,
      p.code
    );
    const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);
    const detailStr = p.detail || '';
    const descStr = p.detail || (p as any).description || '';
    const partyStr = p.party || (p as any).contractor || '';
    const mdStatusStr = p.mdStatus || '';

    const targetUnitKeys = new Set<string>();
    Object.keys(dataMap).forEach((uKey) => {
      const uEntry = dataMap[uKey];
      if (!uEntry) return;

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

    targetUnitKeys.forEach((code) => {
      if (dataMap[code]) {
        dataMap[code].hasAppProject = true;
        dataMap[code].appProjectStatus = status;
        dataMap[code].appProjectBudget = p.budget || 0;
        dataMap[code].appProjectActual = p.actual || 0;
        dataMap[code].appProjectCode = String(p.code);
        dataMap[code].appProjectYear = pYear || normalizedTargetYear;

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

        if (!dataMap[code].year) dataMap[code].year = pYear || normalizedTargetYear;
        dataMap[code].projectStatus = status;
        if (!dataMap[code].task) dataMap[code].task = (p as any).title || (p as any).name || '';
        if (p.computedTakStart || p.start) dataMap[code].startDate = p.computedTakStart || p.start;
        if (p.computedOpening || p.opening || p.computedTakCompl || p.handover) dataMap[code].endDate = p.computedOpening || p.opening || p.computedTakCompl || p.handover;
      }
    });
  });

  return dataMap;
}

/**
 * Bước 1: Áp dụng toàn bộ rules của toàn bộ tab dynamic cho store đang xem
 */
export function applyAllDynamicRulesForStore(targetStore: 'HCM' | 'HN'): {
  updatedStoreLocationData: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>;
  totalEvaluatedUnits: number;
} {
  const dataState = useDataStore.getState();
  const effectiveYear = String(useAppStore.getState().globalYearFilter || '2026').trim();

  const dataMapCache: Record<string, Record<string, any>> = {};
  const getDataMap = (year: string) => {
    const yrKey = String(year || effectiveYear || '2026').trim();
    if (!dataMapCache[yrKey]) {
      dataMapCache[yrKey] = buildDataMapForYear(yrKey, targetStore);
    }
    return dataMapCache[yrKey];
  };

  // 4. Update all partitions for this store
  const updatedStoreLocationData = { ...dataState.storeLocationData };
  let totalEvaluatedUnits = 0;

  for (const pKey in updatedStoreLocationData) {
    if (pKey.startsWith(`${targetStore}_`)) {
      const partition = updatedStoreLocationData[pKey];
      if (!partition) continue;

      const pUnits = partition.mapUnits ? [...partition.mapUnits] : [];
      const pVersions = partition.mapVersions ? [...partition.mapVersions] : [];
      const pLoc = pKey.split('_')[1] || dataState.location;

      // Evaluate rules for every version in partition using THAT VERSION'S YEAR
      const updatedVersions = pVersions.map((v) => {
        if (!v.groups || v.groups.length === 0) return v;

        const vYear = String(v.year || effectiveYear).trim();
        const yearDataMap = getDataMap(vYear);

        const newMappings: Record<string, string[]> = {};
        v.groups.forEach((group) => {
          if (group.rules && group.rules.length > 0) {
            const matchingIds = pUnits
              .filter((u) => (!v.location || !u.location || u.location === v.location || u.location === pLoc) && matchRulesAgainstUnit(u, group.rules, yearDataMap))
              .map((u) => u.id);
            newMappings[group.id] = matchingIds;
          } else {
            newMappings[group.id] = [];
          }
        });

        return {
          ...v,
          groupMappings: newMappings,
        };
      });

      // Ensure units maintain default visible styling and do not get overwritten with transparent colors
      const sanitizedUnits = pUnits.map((u) => ({
        ...u,
        fill: (u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' && u.fill !== 'transparent') ? u.fill : '#3b82f6',
      }));

      totalEvaluatedUnits += sanitizedUnits.length;
      updatedStoreLocationData[pKey] = {
        ...partition,
        mapUnits: sanitizedUnits,
        mapVersions: updatedVersions,
      };
    }
  }

  // Update Zustand store
  const currentKey = getPartitionKey(dataState.store, dataState.location);
  const activePartition = updatedStoreLocationData[currentKey];

  useDataStore.setState({
    storeLocationData: updatedStoreLocationData,
    mapUnits: activePartition?.mapUnits || dataState.mapUnits,
    mapVersions: activePartition?.mapVersions || dataState.mapVersions,
  });

  return { updatedStoreLocationData, totalEvaluatedUnits };
}

/**
 * Bước 1: Tải toàn bộ cấu hình và dữ liệu từ Cloudflare R2 về ứng dụng
 */
export async function loadStoreFromCloudR2(): Promise<{ success: boolean; message: string }> {
  const creds = await getStoredR2CredentialsAsync();
  if (!creds) {
    throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng cấu hình R2 trước.');
  }

  const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId.trim(),
      secretAccessKey: creds.secretAccessKey.trim(),
    },
  });

  const command = new GetObjectCommand({
    Bucket: creds.bucketName,
    Key: 'mapping_config.json',
  });

  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error('Không tìm thấy file mapping_config.json trên Cloudflare R2.');
  }

  const data = await res.json();
  const dataState = useDataStore.getState();

  // Convert data into normalized storeLocationData
  let normalizedStoreLocationData: Record<string, any> = {};

  if (data.storeLocationData && typeof data.storeLocationData === 'object') {
    normalizedStoreLocationData = data.storeLocationData;
  } else if (Array.isArray(data.versions) || Array.isArray(data.mapUnits) || Array.isArray(data.units)) {
    const legacyKey = `${data.store || dataState.store || 'HCM'}_${data.location || dataState.location || 'L1'}`;
    normalizedStoreLocationData = {
      [legacyKey]: {
        mapUnits: data.mapUnits || data.units || [],
        mapVersions: data.versions || [],
        activeMapVersionId: data.activeMapVersionId || data.versions?.[0]?.id || null,
      },
    };
  }

  // Merge current local partition and storeLocationData from in-memory state
  const currentKey = `${dataState.store}_${dataState.location}`;
  const allLocalPartitions: Record<string, any> = {
    ...dataState.storeLocationData,
  };
  if (dataState.mapVersions && dataState.mapVersions.length > 0) {
    allLocalPartitions[currentKey] = {
      mapUnits: dataState.mapUnits,
      mapVersions: dataState.mapVersions,
      activeMapVersionId: dataState.activeMapVersionId,
    };
  }

  for (const pKey in allLocalPartitions) {
    const localPart = allLocalPartitions[pKey];
    if (localPart && Array.isArray(localPart.mapVersions) && localPart.mapVersions.length > 0) {
      const existingR2Part = normalizedStoreLocationData[pKey];
      normalizedStoreLocationData[pKey] = {
        mapUnits: (localPart.mapUnits && localPart.mapUnits.length > 0) ? localPart.mapUnits : (existingR2Part?.mapUnits || []),
        mapVersions: localPart.mapVersions.map((lv: any) => {
          const cloudV = existingR2Part?.mapVersions?.find((cv: any) => cv.id === lv.id || cv.name === lv.name);
          return {
            ...lv,
            backgroundUrl: lv.backgroundUrl || cloudV?.backgroundUrl || '',
          };
        }),
        activeMapVersionId: localPart.activeMapVersionId || existingR2Part?.activeMapVersionId || localPart.mapVersions[0]?.id || null,
      };
    }
  }

  // Resolve all R2 background images across all partitions
  for (const pKey in normalizedStoreLocationData) {
    const partition = normalizedStoreLocationData[pKey];
    if (!partition) continue;

    const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const pLoc = pKey.split('_')[1] || 'L1';

    partition.mapUnits = (partition.mapUnits || []).map((u: any) => ({
      ...u,
      store: u.store || pStore,
      location: u.location || pLoc,
      visible: u.visible !== false,
      locked: !!u.locked,
    }));

    if (Array.isArray(partition.mapVersions)) {
      for (let j = 0; j < partition.mapVersions.length; j++) {
        const v = partition.mapVersions[j];
        const r2Key = extractR2Key(v.backgroundUrl) || (v as any).r2Key;

        if (r2Key) {
          try {
            const imgCommand = new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key });
            const imgUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 });
            v.backgroundUrl = imgUrl;
            (v as any).r2Key = r2Key;
          } catch (imgErr) {
            console.warn(`Lỗi tạo signed URL cho ảnh ${r2Key}:`, imgErr);
          }
        }

        const rawGroups = v.groups || [];
        const deepCopiedGroups = Array.isArray(rawGroups) ? rawGroups.map((g: any) => ({
          id: g.id,
          name: g.name,
          color: g.color,
          opacity: g.opacity,
          rules: Array.isArray(g.rules) ? g.rules.map((r: any) => ({
            field: r.field,
            operator: r.operator,
            value: r.value !== undefined ? String(r.value) : '',
          })) : [],
        })) : [];

        v.store = v.store || pStore;
        v.location = v.location || pLoc;
        v.groups = deepCopiedGroups;
        v.groupMappings = v.groupMappings || {};
        v.isDynamicActive = true;
      }
    }
  }

  if (data.globalYearFilter || data.year) {
    useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
  }

  useDataStore.getState().loadFullCloudData({
    storeLocationData: normalizedStoreLocationData,
    store: data.store || dataState.store,
    location: data.location || dataState.location,
    activeMapVersionId: data.activeMapVersionId,
    reviewSelectedLabels: data.reviewSelectedLabels || [],
    reviewLabelColors: data.reviewLabelColors || {},
    unitInfo: data.unitInfo || [],
    classInfo: data.classInfo || [],
    actualClassInfo: data.actualClassInfo || [],
    sales: data.sales || [],
    profits: data.profits || [],
    subFees: data.subFees || [],
    mdStatus: data.mdStatus || [],
    projectStatus: data.projectStatus || [],
    projectLink: data.projectLink || [],
    basePlan: data.basePlan || [],
    units: data.units || [],
  });

  return { success: true, message: 'Đã tải thành công cấu hình và dữ liệu từ Cloudflare R2.' };
}

/**
 * Bước 3: Lưu cloud của store đang xem lên R2 Cloudflare
 */
export async function saveStoreToCloudR2(
  targetStore: 'HCM' | 'HN',
  customStoreLocationData?: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>
): Promise<{ success: boolean; message: string }> {
  const creds = await getStoredR2CredentialsAsync();
  if (!creds) {
    throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng bấm "Cấu hình R2" để kết nối.');
  }

  const { S3Client } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId.trim(),
      secretAccessKey: creds.secretAccessKey.trim(),
    },
  });
  const dataState = useDataStore.getState();
  const currentActiveKey = getPartitionKey(dataState.store || targetStore, dataState.location || 'L1');
  const baseStoreLocationData = customStoreLocationData || {
    ...dataState.storeLocationData,
    [currentActiveKey]: {
      mapUnits: dataState.mapUnits || [],
      mapVersions: dataState.mapVersions || [],
      activeMapVersionId: dataState.activeMapVersionId,
    },
  };

  // Format cloudStoreLocationData with r2:// references
  const cloudStoreLocationData: Record<string, any> = {};
  for (const pKey in baseStoreLocationData) {
    const partition = baseStoreLocationData[pKey];
    if (!partition) continue;

    const pStore = pKey.split('_')[0] || targetStore;
    const pLoc = pKey.split('_')[1] || 'L1';
    const pUnits = partition.mapUnits || [];
    const pVersions = partition.mapVersions || [];

    const pVersionsCloud: any[] = [];
    for (const v of pVersions) {
      const displayUrl = (v.backgroundUrl || '').trim();
      let r2Key = extractR2Key(displayUrl) || (v as any).r2Key;

      if (displayUrl && (displayUrl.startsWith('blob:') || displayUrl.startsWith('data:'))) {
        try {
          const res = await fetch(displayUrl);
          const blob = await res.blob();
          const bgName = `bg_${v.id}_${Date.now()}.jpeg`;
          const uploadRes = await uploadSingleR2File({ name: bgName, blob }, creds, s3);
          if (uploadRes.success) {
            r2Key = uploadRes.name;
          }
        } catch (e) {
          console.warn('[SaveStoreToCloudR2] Error uploading bg blob:', e);
        }
      }

      const rawGroups = v.groups || [];
      const deepCopiedGroups = Array.isArray(rawGroups) ? rawGroups.map((g: any) => ({
        id: g.id,
        name: g.name,
        color: g.color,
        opacity: g.opacity,
        rules: Array.isArray(g.rules) ? g.rules.map((r: any) => ({
          field: r.field,
          operator: r.operator,
          value: r.value !== undefined ? String(r.value) : '',
        })) : [],
      })) : [];

      pVersionsCloud.push({
        ...v,
        year: String(v.year || useAppStore.getState().globalYearFilter || '2026'),
        store: v.store || pStore,
        location: v.location || pLoc,
        backgroundUrl: r2Key ? `r2://${r2Key}` : displayUrl,
        groups: deepCopiedGroups,
        groupMappings: v.groupMappings || {},
        isDynamicActive: true,
      });
    }

    cloudStoreLocationData[pKey] = {
      mapUnits: pUnits,
      mapVersions: pVersionsCloud,
      activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
    };
  }

  const currentKey = getPartitionKey(targetStore, dataState.location);
  const activeCloudPartition = cloudStoreLocationData[currentKey] ||
    Object.values(cloudStoreLocationData)[0] ||
    { mapUnits: [], mapVersions: [], activeMapVersionId: null };

  const currentAppYear = useAppStore.getState().globalYearFilter;
  const targetYear = (currentAppYear && currentAppYear !== 'all') ? currentAppYear : (activeCloudPartition?.mapVersions?.[0]?.year || '2026');

  const configData = {
    storeLocationData: cloudStoreLocationData,
    store: targetStore,
    location: dataState.location,
    year: targetYear,
    globalYearFilter: targetYear,
    activeMapVersionId: dataState.activeMapVersionId,
    reviewSelectedLabels: dataState.reviewSelectedLabels || [],
    reviewLabelColors: dataState.reviewLabelColors || {},
    mapUnits: activeCloudPartition.mapUnits,
    versions: activeCloudPartition.mapVersions,
    unitInfo: dataState.unitInfo,
    classInfo: dataState.classInfo,
    actualClassInfo: dataState.actualClassInfo,
    sales: dataState.sales,
    profits: dataState.profits,
    subFees: dataState.subFees,
    mdStatus: dataState.mdStatus,
    projectStatus: dataState.projectStatus,
    projectLink: dataState.projectLink,
    basePlan: dataState.basePlan,
    units: dataState.units,
    timestamp: Date.now(),
  };

  const configBlob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
  const uploadRes = await uploadSingleR2File({ name: 'mapping_config.json', blob: configBlob }, creds, s3);
  if (!uploadRes.success) {
    throw new Error(`Lỗi tải lên R2 Cloudflare: ${uploadRes.error}`);
  }

  // Dual Backup to Firestore & LocalStorage
  try {
    const { doc, setDoc } = await import('firebase/firestore');
    const { db, APP_ID } = await import('../../../lib/firebase');
    
    // Update versions doc to trigger live snapshot listeners
    await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), { 
      r2Version: configData.timestamp,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Backup to picture_mapping_config doc
    const firestoreStoreLocationData: Record<string, any> = {};
    for (const key in cloudStoreLocationData) {
      const part = cloudStoreLocationData[key];
      if (!part) continue;
      firestoreStoreLocationData[key] = {
        activeMapVersionId: part.activeMapVersionId,
        mapUnits: part.mapUnits || [],
        mapVersions: (part.mapVersions || []).map(v => {
          const bg = v.backgroundUrl || '';
          const safeBg = bg.startsWith('data:') ? ((v as any).r2Key ? `r2://${(v as any).r2Key}` : '') : bg;
          return { ...v, backgroundUrl: safeBg };
        }),
      };
    }

    const firestorePayload = {
      storeLocationData: firestoreStoreLocationData,
      store: targetStore,
      location: dataState.location,
      year: targetYear,
      globalYearFilter: targetYear,
      activeMapVersionId: dataState.activeMapVersionId,
      reviewSelectedLabels: configData.reviewSelectedLabels,
      reviewLabelColors: configData.reviewLabelColors,
      updatedAt: new Date().toISOString(),
      timestamp: configData.timestamp,
    };

    const estimatedBytes = new Blob([JSON.stringify(firestorePayload)]).size;
    if (estimatedBytes < 950000) {
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"), firestorePayload, { merge: true });
    }
  } catch (fsErr) {
    console.warn('[dynamicExportService] Firestore backup error:', fsErr);
  }

  try {
    localStorage.setItem('taka_mapping_config_backup', JSON.stringify({
      storeLocationData: cloudStoreLocationData,
      store: targetStore,
      location: dataState.location,
      year: targetYear,
      globalYearFilter: targetYear,
      activeMapVersionId: dataState.activeMapVersionId,
      updatedAt: Date.now(),
      timestamp: configData.timestamp,
    }));
  } catch {}

  // Broadcast to LiveLayoutViewer, ReviewTab, etc.
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('taka_cloud_sync_updated', {
        detail: {
          timestamp: configData.timestamp,
          store: targetStore,
          location: dataState.location,
          storeLocationData: cloudStoreLocationData,
        }
      }));
    }
  } catch (evtErr) {}

  return { success: true, message: 'Đã lưu cấu hình lên Cloudflare R2 & Firestore thành công.' };
}

// ============================================================================
// 3-TIER ARCHITECTURE: NON-BLOCKING BACKGROUND CLOUD SYNC MANAGER (R2)
// ============================================================================
let isBackgroundSyncInProgress = false;
let pendingBackgroundSync: {
  targetStore: 'HCM' | 'HN';
  customStoreLocationData?: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>;
} | null = null;

export type BackgroundSyncStatus = 'idle' | 'syncing' | 'saved' | 'error';
const syncStatusListeners = new Set<(status: BackgroundSyncStatus, lastSavedAt?: number) => void>();
let currentSyncStatus: BackgroundSyncStatus = 'idle';
let lastSavedTimestamp: number = 0;

export function getBackgroundSyncStatus(): { status: BackgroundSyncStatus; lastSavedAt: number } {
  return { status: currentSyncStatus, lastSavedAt: lastSavedTimestamp };
}

export function subscribeBackgroundSyncStatus(listener: (status: BackgroundSyncStatus, lastSavedAt?: number) => void) {
  syncStatusListeners.add(listener);
  return () => {
    syncStatusListeners.delete(listener);
  };
}

function updateSyncStatus(status: BackgroundSyncStatus) {
  currentSyncStatus = status;
  if (status === 'saved') lastSavedTimestamp = Date.now();
  syncStatusListeners.forEach((fn) => fn(status, lastSavedTimestamp));
}

/**
 * Trigger background non-blocking sync to Cloudflare R2.
 * - Runs fully asynchronous outside the main React render loop.
 * - Concurrency-safe: Queues subsequent edits to prevent overlapping R2 uploads.
 * - Zero UI freezing: Never blocks the user typing or navigating tabs.
 */
export async function triggerBackgroundR2Sync(
  targetStore: 'HCM' | 'HN',
  customStoreLocationData?: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>
): Promise<void> {
  const creds = await getStoredR2CredentialsAsync();
  if (!creds) {
    console.info('[BackgroundSync] R2 credentials not configured, skipping background upload.');
    return;
  }

  if (isBackgroundSyncInProgress) {
    // Queue up the latest requested payload to sync right after current finishes
    pendingBackgroundSync = { targetStore, customStoreLocationData };
    return;
  }

  isBackgroundSyncInProgress = true;
  updateSyncStatus('syncing');

  // Defer execution using setTimeout(..., 0) so the main thread is freed immediately
  setTimeout(async () => {
    try {
      await saveStoreToCloudR2(targetStore, customStoreLocationData);
      updateSyncStatus('saved');
    } catch (err: any) {
      console.warn('[BackgroundSync] Background Cloud R2 sync warning (non-blocking):', err?.message || err);
      updateSyncStatus('error');
    } finally {
      isBackgroundSyncInProgress = false;
      // If a newer payload was queued while this one was uploading, process it next
      if (pendingBackgroundSync) {
        const next = pendingBackgroundSync;
        pendingBackgroundSync = null;
        triggerBackgroundR2Sync(next.targetStore, next.customStoreLocationData);
      }
    }
  }, 0);
}

/**
 * Kiểm tra xem dữ liệu tab Picture Mapping đã được load Cloud trước đó chưa
 */
export function isPictureMappingDataLoaded(targetStore?: 'HCM' | 'HN'): boolean {
  const dataState = useDataStore.getState();
  if (dataState.isCloudLoaded) return true;

  // Kiểm tra nếu các phân vùng storeLocationData đã có mapUnits hoặc mapVersions
  const partitions = Object.entries(dataState.storeLocationData || {});
  const hasStorePartitionData = partitions.some(([k, v]) => {
    if (targetStore && !k.startsWith(targetStore)) return false;
    return (v?.mapUnits && v.mapUnits.length > 0) || (v?.mapVersions && v.mapVersions.length > 0);
  });
  if (hasStorePartitionData) return true;

  // Kiểm tra mapUnits hoặc mapVersions hiện hành
  if ((dataState.mapUnits && dataState.mapUnits.length > 0) || (dataState.mapVersions && dataState.mapVersions.length > 0)) {
    if (!targetStore || dataState.store === targetStore) {
      return true;
    }
  }

  // Kiểm tra helpers getAllStoreUnits / getAllStoreVersions
  const allUnits = dataState.getAllStoreUnits(targetStore);
  const allVersions = dataState.getAllStoreVersions(targetStore);
  if (allUnits.length > 0 || allVersions.length > 0) {
    return true;
  }

  return false;
}

/**
 * Trigger toàn bộ quy trình 4 bước:
 * - Bước 1: Load Cloud R2 về app (kiểm tra nếu đã load trước đó thì bỏ qua)
 * - Bước 2: Apply All Dynamic Rules
 * - Bước 3: Lưu Cloud R2 & Ghi trigger Firestore
 * - Bước 4: Load lại Cloud R2 về ứng dụng (Reload Cloud R2)
 */
export async function executeTriggerExportProcess(
  targetStore: 'HCM' | 'HN',
  onProgress?: (step: string) => void
): Promise<{ success: boolean; message: string }> {
  // BƯỚC 1: Load Cloud R2 về app (kiểm tra nếu đã load trước đó thì bỏ qua để tối ưu tốc độ và không ghi đè)
  const isAlreadyLoaded = isPictureMappingDataLoaded(targetStore);
  if (!isAlreadyLoaded) {
    onProgress?.('Bước 1/4: Đang tải dữ liệu từ Cloudflare R2 về ứng dụng (Load Cloud)...');
    try {
      await loadStoreFromCloudR2();
    } catch (loadErr: any) {
      console.warn('[TriggerExport] Cảnh báo khi tải từ R2 (có thể tiếp tục với dữ liệu hiện tại):', loadErr);
    }
  } else {
    onProgress?.('Bước 1/4: Dữ liệu Picture Mapping đã sẵn sàng trong ứng dụng (bỏ qua tải lại từ Cloud)...');
  }

  // BƯỚC 2: Apply all rules của toàn bộ tab dynamic cho store đang xem
  onProgress?.('Bước 2/4: Đang áp dụng toàn bộ logic Dynamic Rules cho các tầng...');
  const { updatedStoreLocationData } = applyAllDynamicRulesForStore(targetStore);

  // BƯỚC 3: Lưu cloud của store đang xem lên R2 Cloudflare
  onProgress?.('Bước 3/4: Đang đồng bộ và lưu bản vẽ lên Cloudflare R2 (Save Cloud)...');
  await saveStoreToCloudR2(targetStore, updatedStoreLocationData);

  // Ghi trigger Firestore để cập nhật cho các worker/listeners
  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout_trigger');
    await setDoc(
      docRef,
      {
        is_ready_to_export: true,
        requested_at: Date.now(),
        store: targetStore,
      },
      { merge: true }
    );
  } catch (firestoreErr) {
    console.warn('[TriggerExport] Lỗi cập nhật layout_trigger Firestore:', firestoreErr);
  }

  // BƯỚC 4: Load lại Cloud R2 về ứng dụng để đảm bảo ứng dụng có dữ liệu mới nhất được lưu từ R2
  onProgress?.('Bước 4/4: Đang tải lại dữ liệu từ Cloudflare R2 về ứng dụng (Reload Cloud R2)...');
  try {
    await loadStoreFromCloudR2();
  } catch (reloadErr: any) {
    console.warn('[TriggerExport] Cảnh báo khi tải lại từ Cloud R2 ở bước 4:', reloadErr);
  }

  return {
    success: true,
    message: `Đã hoàn thành 4 bước: Tải Cloud R2 -> Áp dụng Dynamic Rules -> Lưu Cloud R2 -> Tải lại Cloud R2 cho ${targetStore}!`,
  };
}
