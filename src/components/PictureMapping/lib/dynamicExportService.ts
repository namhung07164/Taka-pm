import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../lib/firebase';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { UnitShape, MapVersion, GroupRule } from '../components/DataMapping/types';
import { calculateSummaryData } from './summaryData';
import { getStoredR2Credentials, uploadSingleR2File, extractR2Key } from './r2Upload';
import { enrichProjects, getStatus } from '../../../lib/utils';

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

// Evaluates a set of rules on a unit shape using the data map
export function matchRulesAgainstUnit(unit: UnitShape, rules: GroupRule[] | undefined, dataMap: Record<string, any>): boolean {
  if (!rules || rules.length === 0) return false;
  const uName = (unit.name || '').toLowerCase();
  const data = uName ? dataMap[uName] : null;
  if (!data) return false;

  return rules.every((rule) => {
    let val = data[rule.field];
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
 * Bước 1: Áp dụng toàn bộ rules của toàn bộ tab dynamic cho store đang xem
 */
export function applyAllDynamicRulesForStore(targetStore: 'HCM' | 'HN'): {
  updatedStoreLocationData: Record<string, { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }>;
  totalEvaluatedUnits: number;
} {
  const dataState = useDataStore.getState();
  const appState = useAppStore.getState();

  const projects = appState.projects || [];
  const tasks = appState.tasks || [];

  // 1. Enrich projects with dates and statuses
  const enrichedProjects = enrichProjects(projects, tasks);

  // 2. Compute Summary Data
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

  // 3. Build aggregated data map for all unit names
  const allUnits = dataState.getAllStoreUnits(targetStore);
  const dataMap: Record<string, any> = {};

  allUnits.forEach((u) => {
    const uName = (u.name || '').toLowerCase();
    if (!uName) return;
    const item = summaryData.find((s) => s.unit?.toLowerCase() === uName);
    dataMap[uName] = { ...(item || {}), unitName: u.name };
  });

  enrichedProjects.forEach((p) => {
    const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
    const pCodes = rawCodes.split(/[+;,/]/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    const status = getStatus(
      p.computedTakStart || p.start,
      p.computedTakCompl || p.handover,
      p.computedOpening || p.opening,
      p.code
    );
    pCodes.forEach((code) => {
      if (dataMap[code]) {
        dataMap[code].appProjectStatus = status;
        dataMap[code].appProjectBudget = p.budget || 0;
        dataMap[code].appProjectActual = p.actual || 0;
        dataMap[code].appProjectCode = String(p.code);
      }
    });
  });

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

      // Evaluate rules for every version in partition
      const updatedVersions = pVersions.map((v) => {
        if (!v.groups || v.groups.length === 0) return v;

        const newMappings: Record<string, string[]> = {};
        v.groups.forEach((group) => {
          if (group.rules && group.rules.length > 0) {
            const matchingIds = pUnits
              .filter((u) => (!v.location || !u.location || u.location === v.location || u.location === pLoc) && matchRulesAgainstUnit(u, group.rules, dataMap))
              .map((u) => u.id);
            newMappings[group.id] = matchingIds;
          } else {
            newMappings[group.id] = v.groupMappings?.[group.id] || [];
          }
        });

        return {
          ...v,
          groupMappings: newMappings,
        };
      });

      // Find the active version to colorize unit fills
      const activeVer = updatedVersions.find((v) => v.id === partition.activeMapVersionId) ||
        updatedVersions.find((v) => v.isDynamicActive !== false) ||
        updatedVersions[0];

      if (activeVer && activeVer.groups) {
        pUnits.forEach((u, idx) => {
          let assignedColor = '#3b82f6';
          activeVer.groups.forEach((g) => {
            if (activeVer.groupMappings?.[g.id]?.includes(u.id)) {
              assignedColor = g.color;
            }
          });
          pUnits[idx] = { ...u, fill: assignedColor };
        });
      }

      totalEvaluatedUnits += pUnits.length;
      updatedStoreLocationData[pKey] = {
        ...partition,
        mapUnits: pUnits,
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
  const creds = getStoredR2Credentials();
  if (!creds) {
    throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng cấu hình R2 trước.');
  }

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

        v.store = v.store || pStore;
        v.location = v.location || pLoc;
        v.groups = v.groups || [];
        v.groupMappings = v.groupMappings || {};
        v.isDynamicActive = v.isDynamicActive !== false;
      }
    }
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
  const creds = getStoredR2Credentials();
  if (!creds) {
    throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng bấm "Cấu hình R2" để kết nối.');
  }

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

      pVersionsCloud.push({
        ...v,
        store: v.store || pStore,
        location: v.location || pLoc,
        backgroundUrl: r2Key ? `r2://${r2Key}` : displayUrl,
        groups: v.groups || [],
        groupMappings: v.groupMappings || {},
        isDynamicActive: v.isDynamicActive !== false,
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

  const configData = {
    storeLocationData: cloudStoreLocationData,
    store: targetStore,
    location: dataState.location,
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

  return { success: true, message: 'Đã lưu cấu hình lên Cloudflare R2 thành công.' };
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
 * Trigger toàn bộ quy trình 3 bước:
 * - Bước 1: Load Cloud R2 về app (kiểm tra nếu đã load trước đó thì bỏ qua)
 * - Bước 2: Apply All Dynamic Rules
 * - Bước 3: Lưu Cloud R2 & Ghi trigger Firestore
 */
export async function executeTriggerExportProcess(
  targetStore: 'HCM' | 'HN',
  onProgress?: (step: string) => void
): Promise<{ success: boolean; message: string }> {
  // BƯỚC 1: Load Cloud R2 về app (kiểm tra nếu đã load trước đó thì bỏ qua để tối ưu tốc độ và không ghi đè)
  const isAlreadyLoaded = isPictureMappingDataLoaded(targetStore);
  if (!isAlreadyLoaded) {
    onProgress?.('Bước 1/3: Đang tải dữ liệu từ Cloudflare R2 về ứng dụng (Load Cloud)...');
    try {
      await loadStoreFromCloudR2();
    } catch (loadErr: any) {
      console.warn('[TriggerExport] Cảnh báo khi tải từ R2 (có thể tiếp tục với dữ liệu hiện tại):', loadErr);
    }
  } else {
    onProgress?.('Bước 1/3: Dữ liệu Picture Mapping đã sẵn sàng trong ứng dụng (bỏ qua tải lại từ Cloud)...');
  }

  // BƯỚC 2: Apply all rules của toàn bộ tab dynamic cho store đang xem
  onProgress?.('Bước 2/3: Đang áp dụng toàn bộ logic Dynamic Rules cho các tầng...');
  const { updatedStoreLocationData } = applyAllDynamicRulesForStore(targetStore);

  // BƯỚC 3: Lưu cloud của store đang xem lên R2 Cloudflare
  onProgress?.('Bước 3/3: Đang đồng bộ và lưu bản vẽ lên Cloudflare R2 (Save Cloud)...');
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

  return {
    success: true,
    message: `Đã hoàn thành 3 bước: Tải Cloud R2 -> Áp dụng Dynamic Rules -> Lưu Cloud R2 cho ${targetStore}!`,
  };
}
