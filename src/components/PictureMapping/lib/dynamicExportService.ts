import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../lib/firebase';
import { useAppStore } from '../../../store/useAppStore';
import { useDataStore } from '../DataContext';
import { UnitShape, MapVersion } from '../components/DataMapping/types';
import { getStoredR2CredentialsAsync, uploadSingleR2File, extractR2Key, getS3Sdk } from './r2Upload';
import {
  matchRulesAgainstUnit,
  buildDataMapForYear,
  applyAllDynamicRulesForStore,
  isPictureMappingDataLoaded,
  BackgroundSyncStatus,
  getBackgroundSyncStatus,
  subscribeBackgroundSyncStatus,
  updateSyncStatus,
} from './dynamicRuleExportHelpers';

export {
  matchRulesAgainstUnit,
  buildDataMapForYear,
  applyAllDynamicRulesForStore,
  isPictureMappingDataLoaded,
  getBackgroundSyncStatus,
  subscribeBackgroundSyncStatus,
};
export type { BackgroundSyncStatus };

const getPartitionKey = (store: string, location: string) => `${store}_${location}`;

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

  const command = new GetObjectCommand({ Bucket: creds.bucketName, Key: 'mapping_config.json' });
  const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new Error('Không tìm thấy file mapping_config.json trên Cloudflare R2.');
  }

  const data = await res.json();
  const dataState = useDataStore.getState();
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

  const currentKey = `${dataState.store}_${dataState.location}`;
  const allLocalPartitions: Record<string, any> = { ...dataState.storeLocationData };
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
        mapUnits: localPart.mapUnits && localPart.mapUnits.length > 0 ? localPart.mapUnits : existingR2Part?.mapUnits || [],
        mapVersions: localPart.mapVersions.map((lv: any) => {
          const cloudV = existingR2Part?.mapVersions?.find((cv: any) => cv.id === lv.id || cv.name === lv.name);
          return { ...lv, backgroundUrl: lv.backgroundUrl || cloudV?.backgroundUrl || '' };
        }),
        activeMapVersionId:
          localPart.activeMapVersionId || existingR2Part?.activeMapVersionId || localPart.mapVersions[0]?.id || null,
      };
    }
  }

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
            v.backgroundUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 });
            (v as any).r2Key = r2Key;
          } catch (imgErr) {
            console.warn(`Lỗi tạo signed URL cho ảnh ${r2Key}:`, imgErr);
          }
        }

        const rawGroups = v.groups || [];
        const deepCopiedGroups = Array.isArray(rawGroups)
          ? rawGroups.map((g: any) => ({
              id: g.id,
              name: g.name,
              color: g.color,
              opacity: g.opacity,
              hatchPattern: g.hatchPattern || 'none',
              symbol: g.symbol || '',
              category: g.category || g.paintCategory || '',
              paintCategory: g.paintCategory || g.category || '',
              rules: Array.isArray(g.rules)
                ? g.rules.map((r: any) => ({
                    field: r.field,
                    operator: r.operator,
                    value: r.value !== undefined ? String(r.value) : '',
                  }))
                : [],
            }))
          : [];

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

export async function saveStoreToCloudR2(
  targetStore: 'HCM' | 'HN',
  customStoreLocationData?: Record<
    string,
    { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }
  >
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
          if (uploadRes.success) r2Key = uploadRes.name;
        } catch (e) {
          console.warn('[SaveStoreToCloudR2] Error uploading bg blob:', e);
        }
      }

      const rawGroups = v.groups || [];
      const deepCopiedGroups = Array.isArray(rawGroups)
        ? rawGroups.map((g: any) => ({
            id: g.id,
            name: g.name,
            color: g.color,
            opacity: g.opacity,
            hatchPattern: g.hatchPattern || 'none',
            symbol: g.symbol || '',
            category: g.category || g.paintCategory || '',
            paintCategory: g.paintCategory || g.category || '',
            rules: Array.isArray(g.rules)
              ? g.rules.map((r: any) => ({
                  field: r.field,
                  operator: r.operator,
                  value: r.value !== undefined ? String(r.value) : '',
                }))
              : [],
          }))
        : [];

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
  const activeCloudPartition =
    cloudStoreLocationData[currentKey] ||
    Object.values(cloudStoreLocationData)[0] || {
      mapUnits: [],
      mapVersions: [],
      activeMapVersionId: null,
    };

  const currentAppYear = useAppStore.getState().globalYearFilter;
  const targetYear =
    currentAppYear && currentAppYear !== 'all'
      ? currentAppYear
      : activeCloudPartition?.mapVersions?.[0]?.year || '2026';

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

  try {
    await setDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'versions'),
      { pictureMappingVersion: configData.timestamp, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    const firestoreStoreLocationData: Record<string, any> = {};
    for (const key in cloudStoreLocationData) {
      const part = cloudStoreLocationData[key];
      if (!part) continue;
      firestoreStoreLocationData[key] = {
        activeMapVersionId: part.activeMapVersionId,
        mapUnits: part.mapUnits || [],
        mapVersions: (part.mapVersions || []).map((v: any) => {
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
      await setDoc(
        doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config'),
        firestorePayload,
        { merge: true }
      );
    }
  } catch (fsErr) {
    console.warn('[dynamicExportService] Firestore backup error:', fsErr);
  }

  try {
    localStorage.setItem(
      'taka_mapping_config_backup',
      JSON.stringify({
        storeLocationData: cloudStoreLocationData,
        store: targetStore,
        location: dataState.location,
        year: targetYear,
        globalYearFilter: targetYear,
        activeMapVersionId: dataState.activeMapVersionId,
        updatedAt: Date.now(),
        timestamp: configData.timestamp,
      })
    );
  } catch {}

  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('taka_cloud_sync_updated', {
          detail: {
            timestamp: configData.timestamp,
            store: targetStore,
            location: dataState.location,
            storeLocationData: cloudStoreLocationData,
          },
        })
      );
    }
  } catch (_evtErr) {}

  return { success: true, message: 'Đã lưu cấu hình lên Cloudflare R2 & Firestore thành công.' };
}

let isBackgroundSyncInProgress = false;
let pendingBackgroundSync: {
  targetStore: 'HCM' | 'HN';
  customStoreLocationData?: Record<
    string,
    { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }
  >;
} | null = null;

export async function triggerBackgroundR2Sync(
  targetStore: 'HCM' | 'HN',
  customStoreLocationData?: Record<
    string,
    { mapUnits: UnitShape[]; mapVersions: MapVersion[]; activeMapVersionId?: string | null }
  >
): Promise<void> {
  const creds = await getStoredR2CredentialsAsync();
  if (!creds) {
    console.info('[BackgroundSync] R2 credentials not configured, skipping background upload.');
    return;
  }

  if (isBackgroundSyncInProgress) {
    pendingBackgroundSync = { targetStore, customStoreLocationData };
    return;
  }

  isBackgroundSyncInProgress = true;
  updateSyncStatus('syncing');

  setTimeout(async () => {
    try {
      await saveStoreToCloudR2(targetStore, customStoreLocationData);
      updateSyncStatus('saved');
    } catch (err: any) {
      console.warn('[BackgroundSync] Background Cloud R2 sync warning (non-blocking):', err?.message || err);
      updateSyncStatus('error');
    } finally {
      isBackgroundSyncInProgress = false;
      if (pendingBackgroundSync) {
        const next = pendingBackgroundSync;
        pendingBackgroundSync = null;
        triggerBackgroundR2Sync(next.targetStore, next.customStoreLocationData);
      }
    }
  }, 0);
}

export async function executeTriggerExportProcess(
  targetStore: 'HCM' | 'HN',
  onProgress?: (step: string) => void
): Promise<{ success: boolean; message: string }> {
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

  onProgress?.('Bước 2/4: Đang áp dụng toàn bộ logic Dynamic Rules cho các tầng...');
  const { updatedStoreLocationData } = applyAllDynamicRulesForStore(targetStore);

  onProgress?.('Bước 3/4: Đang đồng bộ và lưu bản vẽ lên Cloudflare R2 (Save Cloud)...');
  await saveStoreToCloudR2(targetStore, updatedStoreLocationData);

  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_settings', 'layout_trigger');
    await setDoc(
      docRef,
      { is_ready_to_export: true, requested_at: Date.now(), store: targetStore },
      { merge: true }
    );
  } catch (firestoreErr) {
    console.warn('[TriggerExport] Lỗi cập nhật layout_trigger Firestore:', firestoreErr);
  }

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
