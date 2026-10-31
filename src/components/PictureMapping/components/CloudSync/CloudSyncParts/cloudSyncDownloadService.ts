import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../../../lib/firebase';
import { useAppStore } from '../../../../../store/useAppStore';
import { useDataStore, StoreLocationRecord } from '../../../DataContext';
import { MapVersion } from '../../DataMapping/types';
import {
  extractR2Key,
  getS3Sdk,
  downloadR2JsonFile,
  R2Credentials,
} from '../../../lib/r2Upload';
import type { CloudSyncScope } from '../CloudSyncManager';
import { getScopeName, withSyncTimeout } from './cloudSyncUploadService';

export async function executeCloudDownloadSync(params: {
  creds: R2Credentials | null;
  credsValid: { valid: boolean; reason?: string };
  currentScope: CloudSyncScope;
  isAuto: boolean;
  store: 'HCM' | 'HN';
  location: string;
  activeMapVersionId: string | null;
  reviewSelectedLabels: string[];
  reviewLabelColors: Record<string, string>;
  syncStartTime: number;
  setProgress: (val: number) => void;
  setStatusText: (val: string) => void;
}): Promise<void> {
  const {
    creds,
    credsValid,
    currentScope,
    isAuto,
    store,
    location,
    activeMapVersionId,
    reviewSelectedLabels,
    reviewLabelColors,
    syncStartTime,
    setProgress,
    setStatusText,
  } = params;

  const dataState = useDataStore.getState();
  setProgress(20);
  setStatusText(`Đang tải dữ liệu [${getScopeName(currentScope)}] từ Cloud...`);

  let data: any = null;
  let loadSource = '';

  if (creds && credsValid.valid) {
    try {
      const { S3Client } = await getS3Sdk();
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });
      const downloadRes = await withSyncTimeout(
        downloadR2JsonFile<any>('mapping_config.json', creds, s3),
        8000,
        'R2 download mapping_config.json timed out'
      );
      if (downloadRes.success && downloadRes.data) {
        data = downloadRes.data;
        loadSource = 'Cloudflare R2';
      }
    } catch (r2Err) {
      console.warn('[R2 Download] R2 fetch error, trying fallback:', r2Err);
    }
  }

  let knownPicMapVer = 0;
  try {
    const rawVer = localStorage.getItem('taka_cache_config_versions_v1');
    if (rawVer) knownPicMapVer = JSON.parse(rawVer)?.pictureMappingVersion || 0;
  } catch {}
  if (!data || (knownPicMapVer > 0 && knownPicMapVer > (data.timestamp || 0))) {
    try {
      const snap = await withSyncTimeout(
        getDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config')),
        5000,
        'Firestore download timed out'
      );
      if (snap.exists()) {
        const fsData = snap.data() as any;
        if (fsData?.storeLocationData) {
          if (!data || (fsData.timestamp && (!data.timestamp || fsData.timestamp > data.timestamp))) {
            data = fsData;
            loadSource = 'Firestore Cloud';
          }
        }
      }
    } catch (fsErr) {
      console.warn('[Firestore Fallback] Error reading backup:', fsErr);
    }
  }

  if (!data) {
    try {
      const cached = localStorage.getItem('taka_mapping_config_backup');
      if (cached) {
        data = JSON.parse(cached);
        loadSource = 'LocalStorage Cache';
      }
    } catch {}
  }

  if (!data) {
    if (isAuto) {
      return;
    }
    throw new Error('Chưa tìm thấy dữ liệu trên Cloud (Vui lòng bấm Save Cloud để lưu cấu hình đầu tiên).');
  }

  setProgress(50);
  setStatusText('Đang phân giải liên kết ảnh và dữ liệu...');

  let normalizedStoreLocationData: Record<string, StoreLocationRecord> = {};
  if (data.storeLocationData && typeof data.storeLocationData === 'object') {
    normalizedStoreLocationData = data.storeLocationData;
  } else if (Array.isArray(data.versions) || Array.isArray(data.mapUnits) || Array.isArray(data.units)) {
    const legacyKey = `${data.store || store || 'HCM'}_${data.location || location || 'L1'}`;
    normalizedStoreLocationData = {
      [legacyKey]: {
        mapUnits: data.mapUnits || data.units || [],
        mapVersions: data.versions || [],
        activeMapVersionId: data.activeMapVersionId || data.versions?.[0]?.id || null,
      },
    };
  }

  let s3ClientInstance: any = null;
  if (creds && credsValid.valid) {
    const { S3Client } = await getS3Sdk();
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });
  }

  for (const pKey in normalizedStoreLocationData) {
    const partition = normalizedStoreLocationData[pKey];
    if (!partition) continue;

    const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const pLoc = pKey.split('_')[1] || 'L1';

    partition.mapUnits = (partition.mapUnits || []).map((u) => ({
      ...u,
      store: u.store || pStore,
      location: u.location || pLoc,
      visible: u.visible !== false,
      locked: !!u.locked,
      fill:
        u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' && u.fill !== 'transparent' ? u.fill : '#3b82f6',
    }));

    if (Array.isArray(partition.mapVersions)) {
      for (let j = 0; j < partition.mapVersions.length; j++) {
        const v = partition.mapVersions[j];
        const r2Key = extractR2Key(v.backgroundUrl) || (v as any).r2Key;

        if (creds && credsValid.valid && s3ClientInstance && r2Key) {
          try {
            const { GetObjectCommand, getSignedUrl } = await getS3Sdk();
            const imgCommand = new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key });
            const imgUrl = await getSignedUrl(s3ClientInstance, imgCommand, { expiresIn: 3600 * 24 * 7 });
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
        v.isDynamicActive = true;
      }
    }
  }

  const currentLocalStoreLocationData = useDataStore.getState().storeLocationData || {};
  const localMergedStoreLocationData: Record<string, StoreLocationRecord> = {
    ...currentLocalStoreLocationData,
  };

  if (currentScope === 'edit') {
    for (const pKey in normalizedStoreLocationData) {
      const cloudPart = normalizedStoreLocationData[pKey];
      const localPart = localMergedStoreLocationData[pKey];
      if (!cloudPart) continue;

      const mergedVersions = (cloudPart.mapVersions || []).map((cv) => {
        const localV = localPart?.mapVersions?.find(
          (lv) =>
            lv.id === cv.id ||
            (lv.name === cv.name && String(lv.year || '').trim() === String(cv.year || '').trim())
        );
        return {
          ...cv,
          groups: localV?.groups || cv.groups || [],
          groupMappings: localV?.groupMappings || cv.groupMappings || {},
          unitSizes: { ...(localV?.unitSizes || {}), ...(cv.unitSizes || {}) },
        };
      });

      localMergedStoreLocationData[pKey] = {
        mapUnits: cloudPart.mapUnits,
        mapVersions: mergedVersions,
        activeMapVersionId: cloudPart.activeMapVersionId || localPart?.activeMapVersionId || null,
      };
    }

    dataState.loadFullCloudData({
      storeLocationData: localMergedStoreLocationData,
      store: useDataStore.getState().store || store,
      location: useDataStore.getState().location || location,
      activeMapVersionId: useDataStore.getState().activeMapVersionId || activeMapVersionId,
      reviewSelectedLabels: reviewSelectedLabels || [],
      reviewLabelColors: reviewLabelColors || {},
    });

    setProgress(100);
    const elapsedSec = ((Date.now() - syncStartTime) / 1000).toFixed(1);
    setStatusText(`Đã tải bản vẽ & tọa độ (Tab Edit) từ ${loadSource || 'Cloud'} (${elapsedSec}s)!`);
    useAppStore.getState().setToast({
      title: 'Load Cloud Success',
      message: `Successfully loaded map units and floor plans from ${loadSource || 'Cloud'} in ${elapsedSec}s!`,
      type: 'success',
    });
  } else if (currentScope === 'dynamic') {
    for (const pKey in normalizedStoreLocationData) {
      const cloudPart = normalizedStoreLocationData[pKey];
      const localPart = localMergedStoreLocationData[pKey];
      if (!cloudPart) continue;

      const cloudVerList = cloudPart.mapVersions || [];
      const localVerList = localPart?.mapVersions || [];

      const versionMap = new Map<string, MapVersion>();
      for (const lv of localVerList) {
        if (lv?.id) versionMap.set(lv.id, { ...lv });
      }
      for (const cv of cloudVerList) {
        if (cv?.id) {
          const localV = versionMap.get(cv.id);
          const groupsToUse = cv.groups || localV?.groups || [];
          const deepCopied = Array.isArray(groupsToUse)
            ? groupsToUse.map((g: any) => ({
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

          versionMap.set(cv.id, {
            ...(localV || {}),
            ...cv,
            year: String(cv.year || localV?.year || data.year || data.globalYearFilter || '2026'),
            groups: deepCopied,
            groupMappings: cv.groupMappings || localV?.groupMappings || {},
            isDynamicActive: true,
          });
        }
      }

      localMergedStoreLocationData[pKey] = {
        mapUnits:
          cloudPart.mapUnits && cloudPart.mapUnits.length > 0
            ? cloudPart.mapUnits
            : localPart?.mapUnits || [],
        mapVersions: Array.from(versionMap.values()),
        activeMapVersionId: cloudPart.activeMapVersionId || localPart?.activeMapVersionId || null,
      };
    }

    if (data.globalYearFilter || data.year) {
      useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
    }

    dataState.loadFullCloudData({
      storeLocationData: localMergedStoreLocationData,
      store: useDataStore.getState().store || store,
      location: useDataStore.getState().location || location,
      activeMapVersionId: useDataStore.getState().activeMapVersionId || activeMapVersionId,
      reviewSelectedLabels: reviewSelectedLabels || [],
      reviewLabelColors: reviewLabelColors || {},
    });

    setProgress(100);
    setStatusText('Đã tải quy tắc dynamic & nhóm (Tab Dynamic) từ Cloud!');
    useAppStore.getState().setToast({
      title: 'Load Cloud Success',
      message: 'Successfully synchronized dynamic rules and group classifications from Cloud!',
      type: 'success',
    });
  } else if (currentScope === 'review') {
    if (data.globalYearFilter || data.year) {
      useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
    }
    dataState.loadFullCloudData({
      storeLocationData: useDataStore.getState().storeLocationData || dataState.storeLocationData,
      store: useDataStore.getState().store || store,
      location: useDataStore.getState().location || location,
      activeMapVersionId: useDataStore.getState().activeMapVersionId || activeMapVersionId,
      reviewSelectedLabels: data.reviewSelectedLabels || [],
      reviewLabelColors: data.reviewLabelColors || {},
    });

    setProgress(100);
    setStatusText('Đã tải cấu hình review & nhãn (Tab Review) từ Cloud!');
    useAppStore.getState().setToast({
      title: 'Load Cloud Success',
      message: 'Successfully synchronized review label settings from Cloud!',
      type: 'success',
    });
  } else {
    if (data.globalYearFilter || data.year) {
      useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
    }
    dataState.loadFullCloudData({
      storeLocationData: normalizedStoreLocationData,
      store: useDataStore.getState().store || data.store || store,
      location: useDataStore.getState().location || data.location || location,
      activeMapVersionId: data.activeMapVersionId || useDataStore.getState().activeMapVersionId,
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

    setProgress(100);
    setStatusText('Tải toàn bộ cấu hình từ Cloud thành công!');
    useAppStore.getState().setToast({
      title: 'Load Cloud Success',
      message: 'Successfully downloaded all floor plans, units, and dynamic rules from Cloud!',
      type: 'success',
    });
  }
}
