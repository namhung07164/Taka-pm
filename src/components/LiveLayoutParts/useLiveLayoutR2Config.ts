import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { extractR2Key, getS3Sdk, downloadR2JsonFile } from '../PictureMapping/lib/r2Upload';
import { preloadFloorImages } from '../../lib/imageDBCache';
import {
  getMemoryCachedLayoutConfig,
  getCachedLayoutConfigFromDisk,
  saveLayoutConfigToDisk,
  getLastLayoutNetworkCheckAt,
  markLayoutNetworkChecked,
  getCachedLayoutConfigTimestamp,
} from '../../lib/layoutConfigCache';
import { db, APP_ID } from '../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { setDoc } from '../../lib/firestoreWrites';
import { getLocalConfigVersions } from '../../lib/configCacheService';

export interface LiveLayoutR2ConfigState {
  config: any;
  setConfig: (config: any) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  showConfigModal: boolean;
  setShowConfigModal: (show: boolean) => void;
  cfgAccountId: string;
  setCfgAccountId: (id: string) => void;
  cfgBucketName: string;
  setCfgBucketName: (bucket: string) => void;
  cfgAccessKey: string;
  setCfgAccessKey: (key: string) => void;
  cfgSecretKey: string;
  setCfgSecretKey: (sec: string) => void;
  initFormFromStorage: () => void;
  loadConfig: (forceRefresh?: boolean) => Promise<void>;
  handleSaveR2Config: () => Promise<void>;
}

function getInitialSyncConfig(): any {
  const mem = getMemoryCachedLayoutConfig();
  if (mem) return mem;

  try {
    const ds = useDataStore.getState();
    if (ds.storeLocationData && Object.keys(ds.storeLocationData).length > 0) {
      return {
        storeLocationData: ds.storeLocationData,
        store: ds.store,
        location: ds.location,
        activeMapVersionId: ds.activeMapVersionId,
        mapUnits: ds.mapUnits,
        versions: ds.mapVersions,
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
      };
    }
  } catch (_e) {}

  return null;
}

function collectAllBackgroundUrls(data: any): string[] {
  const bgUrls: string[] = [];
  if (!data) return bgUrls;
  if (data.storeLocationData) {
    Object.values(data.storeLocationData).forEach((part: any) => {
      if (Array.isArray(part?.mapVersions)) {
        part.mapVersions.forEach((v: any) => {
          const u = v?.backgroundUrl || (v?.r2Key ? `r2://${v.r2Key}` : '');
          if (u && !u.startsWith('data:')) {
            bgUrls.push(u);
          }
        });
      }
    });
  }
  if (Array.isArray(data.versions)) {
    data.versions.forEach((v: any) => {
      const u = v?.backgroundUrl || (v?.r2Key ? `r2://${v.r2Key}` : '');
      if (u && !u.startsWith('data:')) {
        bgUrls.push(u);
      }
    });
  }
  if (data.version?.backgroundUrl && !data.version.backgroundUrl.startsWith('data:')) {
    bgUrls.push(data.version.backgroundUrl);
  }
  return bgUrls;
}

export function useLiveLayoutR2Config(): LiveLayoutR2ConfigState {
  const r2Config = useAppStore(state => state.r2Config);
  const setR2Config = useAppStore(state => state.setR2Config);

  const [config, setConfig] = useState<any>(() => getInitialSyncConfig());
  const [loading, setLoading] = useState<boolean>(() => !getInitialSyncConfig());
  const [error, setError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  const configRef = useRef<any>(config);
  configRef.current = config;

  // Form states for in-place R2 configuration
  const [cfgAccountId, setCfgAccountId] = useState('');
  const [cfgBucketName, setCfgBucketName] = useState('');
  const [cfgAccessKey, setCfgAccessKey] = useState('');
  const [cfgSecretKey, setCfgSecretKey] = useState('');

  const initFormFromStorage = useCallback(() => {
    setCfgAccountId(r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim());
    setCfgBucketName(r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim());
    setCfgAccessKey(r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim());
    setCfgSecretKey(r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim());
  }, [r2Config]);

  const applyAndCacheConfig = useCallback((data: any, persistToDisk = true) => {
    if (!data) return;
    let finalData = data;
    if (!data.storeLocationData && Array.isArray(data.versions) && data.versions.length > 0) {
      const activeVersion = data.versions.find((v: any) => v.isDynamicActive) || data.versions[0];
      finalData = {
        ...data,
        version: activeVersion,
        units: data.mapUnits || data.units || [],
      };
    }

    configRef.current = finalData;
    setConfig(finalData);
    setLoading(false);
    setError(null);

    try {
      useDataStore.getState().setLoadedCloudData(finalData);
    } catch (_e) {}

    if (persistToDisk) {
      saveLayoutConfigToDisk(finalData).catch(() => {});
    }

    try {
      const bgUrls = collectAllBackgroundUrls(finalData);
      if (bgUrls.length > 0) {
        preloadFloorImages(bgUrls);
      }
    } catch (_preloadErr) {}
  }, []);

  // Load config with Instant Persistent Disk Cache (CacheStorage + IndexedDB) + Background Stale-While-Revalidate
  const loadConfig = useCallback(async (forceRefresh = false) => {
    setError(null);

    // STEP 1: Instant Disk Cache hydration (<10ms) so UI never blocks on network if cached on disk
    let activeCached = configRef.current || getInitialSyncConfig();
    if (!activeCached) {
      activeCached = await getCachedLayoutConfigFromDisk();
      if (activeCached) {
        applyAndCacheConfig(activeCached, false);
      }
    } else {
      setLoading(false);
    }

    // Check if we can skip network download when disk cache is already fresh and matches server pictureMappingVersion
    const knownPicMapVer = getLocalConfigVersions().pictureMappingVersion || 0;
    const cachedTs = getCachedLayoutConfigTimestamp();
    const lastCheck = getLastLayoutNetworkCheckAt();
    const isCacheFreshEnough =
      !forceRefresh &&
      Boolean(activeCached) &&
      lastCheck > 0 &&
      Date.now() - lastCheck < 5 * 60 * 1000 &&
      (knownPicMapVer === 0 || (cachedTs > 0 && cachedTs >= knownPicMapVer));

    if (isCacheFreshEnough) {
      return;
    }

    // Only show loading spinner if there is ZERO cached map data on disk or memory
    if (!activeCached) {
      setLoading(true);
    }

    try {
      let accountId = r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim();
      let accessKeyId = r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
      let secretAccessKey = r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
      let bucketName = r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim();

      const cachedR2 =
        localStorage.getItem('taka_cache_r2_config_v1') ??
        localStorage.getItem('taka_r2_config_cache_v1');
      if (cachedR2) {
        try {
          const parsed = JSON.parse(cachedR2);
          if (parsed?.accountId && parsed?.accessKeyId && parsed?.secretAccessKey && parsed?.bucketName) {
            accountId = parsed.accountId;
            accessKeyId = parsed.accessKeyId;
            secretAccessKey = parsed.secretAccessKey;
            bucketName = parsed.bucketName;
            useAppStore.getState().setR2Config(parsed);
          }
        } catch {}
      }

      const alreadyVerifiedEmptyByConfigSync =
        localStorage.getItem('taka_cache_r2_config_v1') === '';

      if ((!accountId || !accessKeyId || !secretAccessKey || !bucketName) && !alreadyVerifiedEmptyByConfigSync) {
        try {
          const r2Doc = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"));
          if (r2Doc.exists()) {
            const r2Data = r2Doc.data() as any;
            if (r2Data?.accountId && r2Data?.accessKeyId) {
              accountId = r2Data.accountId;
              accessKeyId = r2Data.accessKeyId;
              secretAccessKey = r2Data.secretAccessKey;
              bucketName = r2Data.bucketName;
              localStorage.setItem('taka_cache_r2_config_v1', JSON.stringify(r2Data));
              localStorage.setItem('taka_r2_config_cache_v1', JSON.stringify(r2Data));
              useAppStore.getState().setR2Config(r2Data);
            } else {
              localStorage.setItem('taka_cache_r2_config_v1', '');
            }
          } else {
            localStorage.setItem('taka_cache_r2_config_v1', '');
          }
        } catch (fetchErr) {
          console.warn("Could not fetch r2_credentials from Firestore:", fetchErr);
        }
      }

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        if (activeCached) return;
        initFormFromStorage();
        throw new Error('Cloudflare R2 is not configured yet. Please click "Configure R2" below or open Picture Mapping to connect Cloud Sync.');
      }

      const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', { accountId, accessKeyId, secretAccessKey, bucketName }, s3);
      let data: any = (downloadRes.success && downloadRes.data) ? downloadRes.data : null;

      const r2Timestamp = data?.timestamp || 0;
      if (!data || (knownPicMapVer > 0 && knownPicMapVer > r2Timestamp)) {
        try {
          const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"));
          if (snap.exists()) {
            const fsData = snap.data() as any;
            if (fsData?.storeLocationData) {
              const fsTimestamp = fsData.timestamp || (fsData.updatedAt ? new Date(fsData.updatedAt).getTime() : 0);
              if (fsTimestamp > r2Timestamp || !data) {
                data = {
                  ...(data || {}),
                  ...fsData,
                  storeLocationData: {
                    ...(data?.storeLocationData || {}),
                    ...fsData.storeLocationData,
                  },
                };
              }
            }
          }
        } catch (fsErr) {
          console.warn('Could not check Firestore backup:', fsErr);
        }
      }

      if (!data) {
        if (activeCached) return;
        throw new Error(downloadRes.error || 'Configuration file (mapping_config.json) not found on Cloud. Please check your Bucket or export floor plans first.');
      }

      markLayoutNetworkChecked();

      // If no cached config was rendered yet, render immediately with raw r2:// URLs while signed URLs resolve in parallel
      if (!activeCached) {
        applyAndCacheConfig(data, false);
      }

      // Resolve R2 signed URLs in parallel
      const resolvePromises: Promise<void>[] = [];
      if (data.storeLocationData) {
        for (const pKey in data.storeLocationData) {
          const partition = data.storeLocationData[pKey];
          if (!partition?.mapVersions) continue;
          for (const v of partition.mapVersions) {
            const imgKey = extractR2Key(v.backgroundUrl) || (v as any).r2Key;
            if (imgKey) {
              (v as any).r2Key = imgKey;
              const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
              resolvePromises.push(
                getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 })
                  .then(url => {
                    v.backgroundUrl = url;
                  })
                  .catch(() => {})
              );
            }
          }
        }
      }

      if (Array.isArray(data.versions)) {
        for (const v of data.versions) {
          const imgKey = extractR2Key(v.backgroundUrl) || (v as any).r2Key;
          if (imgKey) {
            (v as any).r2Key = imgKey;
            const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
            resolvePromises.push(
              getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 })
                .then(url => {
                  v.backgroundUrl = url;
                })
                .catch(() => {})
            );
          }
        }
      }

      if (data.version) {
        const imgKey = extractR2Key(data.version.backgroundUrl) || (data.version as any).r2Key;
        if (imgKey) {
          (data.version as any).r2Key = imgKey;
          const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
          resolvePromises.push(
            getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 })
              .then(url => {
                data.version.backgroundUrl = url;
              })
              .catch(() => {})
          );
        }
      }

      if (resolvePromises.length > 0) {
        await Promise.all(resolvePromises);
      }

      applyAndCacheConfig({ ...data }, true);
    } catch (err: any) {
      if (!configRef.current) {
        setError(err.message || 'Failed to load layout configuration');
      }
    } finally {
      setLoading(false);
    }
  }, [r2Config, initFormFromStorage, applyAndCacheConfig]);

  const handleSaveR2Config = useCallback(async () => {
    const acc = cfgAccountId.trim();
    const bkt = cfgBucketName.trim();
    const key = cfgAccessKey.trim();
    const sec = cfgSecretKey.trim();

    if (!acc || !bkt || !key || !sec) {
      alert('Please fill in all 4 fields: Account ID, Bucket Name, Access Key, and Secret Key.');
      return;
    }

    localStorage.setItem('r2_account_id', acc);
    localStorage.setItem('r2_bucket_name', bkt);
    localStorage.setItem('r2_access_key', key);
    localStorage.setItem('r2_access_key_id', key);
    localStorage.setItem('r2_secret_key', sec);
    localStorage.setItem('r2_secret_access_key', sec);

    const configData = {
      accountId: acc,
      bucketName: bkt,
      accessKeyId: key,
      secretAccessKey: sec,
    };
    localStorage.setItem('taka_r2_config_cache_v1', JSON.stringify(configData));
    setR2Config(configData);

    try {
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"), configData);
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), {
        r2Version: Date.now(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (e) {
      console.error("Failed to save R2 config to server:", e);
    }

    setShowConfigModal(false);
    loadConfig(true);
  }, [cfgAccountId, cfgBucketName, cfgAccessKey, cfgSecretKey, setR2Config, loadConfig]);

  useEffect(() => {
    loadConfig(false);

    const handleSyncUpdate = () => {
      loadConfig(true);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('taka_cloud_sync_updated', handleSyncUpdate);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('taka_cloud_sync_updated', handleSyncUpdate);
      }
    };
  }, [loadConfig]);

  return {
    config,
    setConfig,
    loading,
    setLoading,
    error,
    setError,
    showConfigModal,
    setShowConfigModal,
    cfgAccountId,
    setCfgAccountId,
    cfgBucketName,
    setCfgBucketName,
    cfgAccessKey,
    setCfgAccessKey,
    cfgSecretKey,
    setCfgSecretKey,
    initFormFromStorage,
    loadConfig,
    handleSaveR2Config,
  };
}

export default useLiveLayoutR2Config;
