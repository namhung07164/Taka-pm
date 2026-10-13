import React, { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useDataStore } from '../PictureMapping/DataContext';
import { extractR2Key, getS3Sdk, downloadR2JsonFile } from '../PictureMapping/lib/r2Upload';
import { preloadFloorImages } from '../../lib/imageDBCache';
import { db, APP_ID } from '../../lib/firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

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
  loadConfig: () => Promise<void>;
  handleSaveR2Config: () => Promise<void>;
}

export function useLiveLayoutR2Config(): LiveLayoutR2ConfigState {
  const r2Config = useAppStore(state => state.r2Config);
  const setR2Config = useAppStore(state => state.setR2Config);

  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Form states for in-place R2 configuration
  const [cfgAccountId, setCfgAccountId] = useState('');
  const [cfgBucketName, setCfgBucketName] = useState('');
  const [cfgAccessKey, setCfgAccessKey] = useState('');
  const [cfgSecretKey, setCfgSecretKey] = useState('');

  // Load initial form values from localStorage
  const initFormFromStorage = useCallback(() => {
    setCfgAccountId(r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim());
    setCfgBucketName(r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim());
    setCfgAccessKey(r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim());
    setCfgSecretKey(r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim());
  }, [r2Config]);

  // Load config from R2
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let accountId = r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim();
      let accessKeyId = r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
      let secretAccessKey = r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
      let bucketName = r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim();

      // If r2Config is not yet populated in store on fresh account boot, fetch directly from Firestore
      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        try {
          const r2Doc = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"));
          if (r2Doc.exists()) {
            const r2Data = r2Doc.data() as any;
            if (r2Data?.accountId && r2Data?.accessKeyId) {
              accountId = r2Data.accountId;
              accessKeyId = r2Data.accessKeyId;
              secretAccessKey = r2Data.secretAccessKey;
              bucketName = r2Data.bucketName;
              useAppStore.getState().setR2Config(r2Data);
            }
          }
        } catch (fetchErr) {
          console.warn("Could not fetch r2_credentials from Firestore:", fetchErr);
        }
      }

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        initFormFromStorage();
        throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng bấm "Cấu hình R2" bên dưới hoặc vào Tab Picture Mapping để kết nối Cloud Sync.');
      }

      const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', { accountId, accessKeyId, secretAccessKey, bucketName }, s3);
      let data: any = (downloadRes.success && downloadRes.data) ? downloadRes.data : null;

      // Parallel check with Firestore backup to ensure newest timestamp is used
      try {
        const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"));
        if (snap.exists()) {
          const fsData = snap.data() as any;
          if (fsData?.storeLocationData) {
            const fsTimestamp = fsData.timestamp || (fsData.updatedAt ? new Date(fsData.updatedAt).getTime() : 0);
            const r2Timestamp = data?.timestamp || 0;
            if (fsTimestamp > r2Timestamp || !data) {
              data = {
                ...(data || {}),
                ...fsData,
                storeLocationData: {
                  ...(data?.storeLocationData || {}),
                  ...fsData.storeLocationData,
                }
              };
            }
          }
        }
      } catch (fsErr) {
        console.warn('Could not check Firestore backup:', fsErr);
      }

      if (!data) {
        throw new Error(downloadRes.error || 'Không tìm thấy file cấu hình trên Cloud (mapping_config.json). Vui lòng kiểm tra lại Bucket hoặc xuất bản vẽ trước.');
      }
      
      // Resolve R2 URLs in storeLocationData if it exists (New Format)
      if (data.storeLocationData) {
        const resolvePromises: Promise<void>[] = [];
        
        for (const pKey in data.storeLocationData) {
          const partition = data.storeLocationData[pKey];
          if (!partition.mapVersions) continue;
          
          for (const v of partition.mapVersions) {
            const imgKey = extractR2Key(v.backgroundUrl);
            if (imgKey) {
              const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
              resolvePromises.push(
                getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }).then(url => {
                  v.backgroundUrl = url;
                }).catch(err => {
                  console.warn('Could not resolve signed URL for', imgKey, err);
                })
              );
            }
          }
        }

        // Also resolve signed URLs for legacy data.versions array and data.version at root
        if (Array.isArray(data.versions)) {
          for (const v of data.versions) {
            const imgKey = extractR2Key(v.backgroundUrl);
            if (imgKey) {
              const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
              resolvePromises.push(
                getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }).then(url => {
                  v.backgroundUrl = url;
                }).catch(err => {
                  console.warn('Could not resolve signed URL for', imgKey, err);
                })
              );
            }
          }
        }
        if (data.version) {
          const imgKey = extractR2Key(data.version.backgroundUrl);
          if (imgKey) {
            const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
            resolvePromises.push(
              getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }).then(url => {
                data.version.backgroundUrl = url;
              }).catch(err => {
                console.warn('Could not resolve signed URL for', imgKey, err);
              })
            );
          }
        }

        await Promise.all(resolvePromises);
        setConfig(data);
        try {
          useDataStore.getState().setLoadedCloudData(data);
        } catch (e) {
          console.warn('Could not sync loaded cloud data to store', e);
        }

        // Background Pre-cache all floor maps into IndexedDB for 0ms floor switching
        try {
          const bgUrlsToPreload: string[] = [];
          if (data?.storeLocationData) {
            Object.values(data.storeLocationData).forEach((part: any) => {
              if (Array.isArray(part?.mapVersions)) {
                part.mapVersions.forEach((v: any) => {
                  if (v?.backgroundUrl && !v.backgroundUrl.startsWith('r2://')) {
                    bgUrlsToPreload.push(v.backgroundUrl);
                  }
                });
              }
            });
          }
          if (Array.isArray(data?.versions)) {
            data.versions.forEach((v: any) => {
              if (v?.backgroundUrl && !v.backgroundUrl.startsWith('r2://')) {
                bgUrlsToPreload.push(v.backgroundUrl);
              }
            });
          }
          if (bgUrlsToPreload.length > 0) {
            preloadFloorImages(bgUrlsToPreload);
          }
        } catch (_preloadErr) {}
      } else if (data.versions && data.versions.length > 0) {
        // Legacy format fallback
        const activeVersion = data.versions.find((v: any) => v.isDynamicActive) || data.versions[0];
        const imgKey = extractR2Key(activeVersion?.backgroundUrl);
        if (activeVersion && imgKey) {
          const imgCommand = new GetObjectCommand({ Bucket: bucketName, Key: imgKey });
          activeVersion.backgroundUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 });
        }
        
        setConfig({
          ...data,
          version: activeVersion,
          units: data.mapUnits || data.units || []
        });
        try {
          useDataStore.getState().setLoadedCloudData(data);
        } catch (e) {
          console.warn('Could not sync loaded cloud data to store', e);
        }
      } else {
        setConfig(data);
        try {
          useDataStore.getState().setLoadedCloudData(data);
        } catch (e) {
          console.warn('Could not sync loaded cloud data to store', e);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [r2Config, initFormFromStorage]);

  const handleSaveR2Config = useCallback(async () => {
    const acc = cfgAccountId.trim();
    const bkt = cfgBucketName.trim();
    const key = cfgAccessKey.trim();
    const sec = cfgSecretKey.trim();

    if (!acc || !bkt || !key || !sec) {
      alert('Vui lòng điền đủ 4 trường: Account ID, Bucket Name, Access Key và Secret Key.');
      return;
    }

    localStorage.setItem('r2_account_id', acc);
    localStorage.setItem('r2_bucket_name', bkt);
    localStorage.setItem('r2_access_key', key);
    localStorage.setItem('r2_access_key_id', key);
    localStorage.setItem('r2_secret_key', sec);
    localStorage.setItem('r2_secret_access_key', sec);

    // Save to global config
    const configData = {
      accountId: acc,
      bucketName: bkt,
      accessKeyId: key,
      secretAccessKey: sec
    };
    setR2Config(configData);

    try {
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"), configData);
      await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), { 
        r2Version: Date.now(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.error("Lỗi khi lưu cấu hình R2 lên server:", e);
    }

    setShowConfigModal(false);
    loadConfig();
  }, [cfgAccountId, cfgBucketName, cfgAccessKey, cfgSecretKey, setR2Config, loadConfig]);

  useEffect(() => {
    loadConfig();

    const handleSyncUpdate = () => {
      loadConfig();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('taka_cloud_sync_updated', handleSyncUpdate);
    }

    let lastVersion = -1;
    // Realtime snapshot listener on taka_config/versions (version-guarded to eliminate duplicate read on mount)
    const unsubSnapshot = onSnapshot(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), (snap) => {
      if (snap.exists()) {
        const remoteVersion = (snap.data() as any)?.pictureMappingVersion ?? 0;
        if (lastVersion !== -1 && remoteVersion !== lastVersion) {
          loadConfig();
        }
        lastVersion = remoteVersion;
      }
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('taka_cloud_sync_updated', handleSyncUpdate);
      }
      unsubSnapshot();
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
