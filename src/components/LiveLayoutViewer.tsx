import React, { useEffect, useState, useRef, useMemo, useCallback, useDeferredValue } from 'react';
import Konva from 'konva';
import { Stage, Layer, FastLayer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useAppStore } from '../store/useAppStore';
import { RefreshCw, Download, Layers, Settings, Key, X, Cloud, Search, ZoomIn, ZoomOut, Maximize2, FolderOutput, Menu, Palette, ChevronDown, ChevronUp, Check, Info, MessageSquare, Printer, SlidersHorizontal, Eye, EyeOff, Bell, AlertTriangle } from 'lucide-react';
import useImage from 'use-image';
import { useOffscreenImage } from '../hooks/useOffscreenImage';
import { preloadFloorImages } from '../lib/imageDBCache';
import { useSummaryData } from './PictureMapping/lib/summaryData';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { extractR2Key, getS3Sdk, downloadR2JsonFile } from './PictureMapping/lib/r2Upload';
import { getStatus, enrichProjects, formatDisplayDateTime, computeProjectActStatus, cn, extractAllProjectCodes, projectMatchesUnitCode } from '../lib/utils';
import { LayoutUnitTooltip } from './LayoutTabParts/LayoutUnitTooltip';
import { Project, AppRole } from '../types';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../lib/firebase';
import { executeTriggerExportProcess } from './PictureMapping/lib/dynamicExportService';
import { useDataStore } from './PictureMapping/DataContext';

interface LiveLayoutViewerProps {
  storeFilter: string;
  locationFilter: string;
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
}

// Calculate high-contrast text color based on background perceived luminance (No drop shadow, razor-sharp vector text)
function getContrastStyle(hexColor: string) {
  if (!hexColor || typeof hexColor !== 'string') {
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
  let c = hexColor.replace('#', '').trim();
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length !== 6) {
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  // Perceived luminance (YIQ standard)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  
  if (yiq >= 145) {
    // Light / bright color background -> Crisp deep dark slate text (#0f172a)
    return {
      text: '#0f172a',
      shapeStroke: '#1e293b',
    };
  } else {
    // Dark / saturated color background -> Crisp pure white text (#ffffff)
    return {
      text: '#ffffff',
      shapeStroke: '#ffffff',
    };
  }
}

export function LiveLayoutViewer({ storeFilter, locationFilter, targetUnitSearch, onUnitSelected, onClearFocus }: LiveLayoutViewerProps) {
  const r2Config = useAppStore(state => state.r2Config);
  const setR2Config = useAppStore(state => state.setR2Config);
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const setLayoutTooltipVisibility = useAppStore(state => state.setLayoutTooltipVisibility);
  const resetLayoutTooltipVisibility = useAppStore(state => state.resetLayoutTooltipVisibility);
  const isAdmin = currentUser ? currentUser.role === 'admin' : false;
  const role = (
    currentUser?.role === 'admin'
      ? 'admin'
      : (currentUser?.role as string)?.toUpperCase() === 'CP'
      ? 'CP'
      : (currentUser?.role as string)?.toLowerCase() === 'manager'
      ? 'Manager'
      : (currentUser?.role as string)?.toLowerCase() === 'staff'
      ? 'Staff'
      : (currentUser?.role as string)?.toLowerCase() === 'external'
      ? 'External'
      : currentUser?.role || 'viewer'
  ) as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout || !!permissionMatrix[role]?.Write?.pictureMapping) && !isArchiveYear;

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
  const initFormFromStorage = () => {
    setCfgAccountId(r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim());
    setCfgBucketName(r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim());
    setCfgAccessKey(r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim());
    setCfgSecretKey(r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim());
  };

  // Load config from R2
  const loadConfig = async () => {
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
          const { doc, getDoc } = await import('firebase/firestore');
          const { db, APP_ID } = await import('../lib/firebase');
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
      if (!downloadRes.success || !downloadRes.data) {
        throw new Error(downloadRes.error || 'Không tìm thấy file cấu hình trên Cloud (mapping_config.json). Vui lòng kiểm tra lại Bucket hoặc xuất bản vẽ trước.');
      }
      
      const data = downloadRes.data;
      
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
  };

  const handleSaveR2Config = async () => {
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
  };

  useEffect(() => {
    loadConfig();
  }, [r2Config]);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm font-medium">Đang tải cấu hình Bản đồ Chuyên đề (Thematic Map)...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-amber-600 dark:text-amber-400 p-4">
        <Layers className="w-10 h-10 mb-2 opacity-50" />
        <p className="text-sm font-medium px-4 text-center max-w-md">{error}</p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button 
            onClick={() => {
              initFormFromStorage();
              setShowConfigModal(true);
            }} 
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Settings className="w-4 h-4" />
            Cấu hình R2 Cloudflare
          </button>
          <button 
            onClick={loadConfig} 
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Thử lại
          </button>
        </div>

        {/* Modal cấu hình nhanh R2 ngay tại Live Map */}
        {showConfigModal && (
          <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-slate-200 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
                  <Cloud className="w-5 h-5" />
                  Cấu hình Cloudflare R2
                </div>
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Account ID</label>
                  <input
                    type="text"
                    value={cfgAccountId}
                    onChange={(e) => setCfgAccountId(e.target.value)}
                    placeholder="VD: a1b2c3d4e5f6..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Bucket Name</label>
                  <input
                    type="text"
                    value={cfgBucketName}
                    onChange={(e) => setCfgBucketName(e.target.value)}
                    placeholder="VD: takashimaya-mapping"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Access Key ID</label>
                  <input
                    type="text"
                    value={cfgAccessKey}
                    onChange={(e) => setCfgAccessKey(e.target.value)}
                    placeholder="R2 API Token Access Key"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">Secret Access Key</label>
                  <input
                    type="password"
                    value={cfgSecretKey}
                    onChange={(e) => setCfgSecretKey(e.target.value)}
                    placeholder="R2 API Token Secret Key"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveR2Config}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
                >
                  Lưu & Tải Live Map
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <LiveCanvas 
      config={config} 
      storeFilter={storeFilter} 
      locationFilter={locationFilter} 
      targetUnitSearch={targetUnitSearch}
      onUnitSelected={onUnitSelected}
      onClearFocus={onClearFocus}
      onRefreshConfig={loadConfig} 
      onOpenR2Config={() => { initFormFromStorage(); setShowConfigModal(true); }} 
    />
  );
}

function LiveCanvas({ 
  config, 
  storeFilter, 
  locationFilter, 
  targetUnitSearch,
  onUnitSelected,
  onClearFocus,
  onRefreshConfig, 
  onOpenR2Config 
}: { 
  config: any; 
  storeFilter: string; 
  locationFilter: string; 
  targetUnitSearch?: string | null;
  onUnitSelected?: (unit: any) => void;
  onClearFocus?: () => void;
  onRefreshConfig?: () => Promise<void> | void; 
  onOpenR2Config: () => void;
}) {
  const currentUser = useAppStore(state => state.currentUser);
  const permissionMatrix = useAppStore(state => state.permissionMatrix);
  const globalYearFilter = useAppStore(state => state.globalYearFilter);
  const layoutTooltipVisibility = useAppStore(state => state.layoutTooltipVisibility);
  const setLayoutTooltipVisibility = useAppStore(state => state.setLayoutTooltipVisibility);
  const resetLayoutTooltipVisibility = useAppStore(state => state.resetLayoutTooltipVisibility);
  const isAdmin = currentUser ? currentUser.role === 'admin' : false;
  const role = (
    currentUser?.role === 'admin'
      ? 'admin'
      : (currentUser?.role as string)?.toUpperCase() === 'CP'
      ? 'CP'
      : (currentUser?.role as string)?.toLowerCase() === 'manager'
      ? 'Manager'
      : (currentUser?.role as string)?.toLowerCase() === 'staff'
      ? 'Staff'
      : (currentUser?.role as string)?.toLowerCase() === 'external'
      ? 'External'
      : currentUser?.role || 'viewer'
  ) as AppRole;
  const isArchiveYear = globalYearFilter !== 'all' && Number(globalYearFilter) < new Date().getFullYear();
  const canWrite = (isAdmin || !!permissionMatrix[role]?.Write?.layout || !!permissionMatrix[role]?.Write?.pictureMapping) && !isArchiveYear;

  const localStoreLocationData = useDataStore((state) => state.storeLocationData);
  const localStore = useDataStore((state) => state.store);
  const localLocation = useDataStore((state) => state.location);
  const localMapUnits = useDataStore((state) => state.mapUnits);
  const localMapVersions = useDataStore((state) => state.mapVersions);
  const localActiveMapVersionId = useDataStore((state) => state.activeMapVersionId);
  const getAllStoreUnits = useDataStore((state) => state.getAllStoreUnits);
  const getAllStoreVersions = useDataStore((state) => state.getAllStoreVersions);

  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [filterOnlyAlerts, setFilterOnlyAlerts] = useState<boolean>(false);
  const targetLoc = locationFilter !== 'all' ? locationFilter : 'L1'; 

  // 1. Gather all store versions across all sources (Zustand helper, local partitions, cloud partitions, and root config)
  const availableStoreVersions = useMemo(() => {
    const versionsMap = new Map<string, any>();

    // From Zustand store helper
    try {
      const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM');
      const storeVers = getAllStoreVersions(targetStoreParam);
      if (Array.isArray(storeVers)) {
        storeVers.forEach(v => {
          if (v?.id) versionsMap.set(v.id, v);
        });
      }
    } catch (e) {}

    // From local in-memory partitions
    if (localStoreLocationData) {
      Object.entries(localStoreLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${storeFilter}_`) && Array.isArray(part?.mapVersions)) {
          part.mapVersions.forEach((v: any) => {
            if (v?.id) versionsMap.set(v.id, { ...v, location: v.location || key.split('_')[1] });
          });
        }
      });
    }

    // From cloud config partitions
    if (config?.storeLocationData) {
      Object.entries(config.storeLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${storeFilter}_`) && Array.isArray(part?.mapVersions)) {
          part.mapVersions.forEach((v: any) => {
            if (v?.id) {
              const existing = versionsMap.get(v.id) || {};
              const resolvedBg = (existing.backgroundUrl && !existing.backgroundUrl.startsWith('r2://'))
                ? existing.backgroundUrl
                : (v.backgroundUrl && !v.backgroundUrl.startsWith('r2://'))
                  ? v.backgroundUrl
                  : (existing.backgroundUrl || v.backgroundUrl);
              versionsMap.set(v.id, { 
                ...existing, 
                ...v, 
                backgroundUrl: resolvedBg,
                location: v.location || existing.location || key.split('_')[1] 
              });
            }
          });
        }
      });
    }

    // From cloud config root versions (legacy fallback for HCM only)
    if (storeFilter === 'HCM' && Array.isArray(config?.versions)) {
      config.versions.forEach((v: any) => {
        if (v?.id) {
          const existing = versionsMap.get(v.id) || {};
          const resolvedBg = (existing.backgroundUrl && !existing.backgroundUrl.startsWith('r2://'))
            ? existing.backgroundUrl
            : (v.backgroundUrl && !v.backgroundUrl.startsWith('r2://'))
              ? v.backgroundUrl
              : (existing.backgroundUrl || v.backgroundUrl);
          versionsMap.set(v.id, { 
            ...existing, 
            ...v, 
            backgroundUrl: resolvedBg,
            store: v.store || 'HCM' 
          });
        }
      });
    }

    return Array.from(versionsMap.values());
  }, [getAllStoreVersions, storeFilter, localStoreLocationData, config]);

  // Pre-cache all floor maps for this store into IndexedDB
  useEffect(() => {
    if (availableStoreVersions.length > 0) {
      const urls = availableStoreVersions
        .map(v => v?.backgroundUrl)
        .filter((u): u is string => typeof u === 'string' && u.length > 0 && !u.startsWith('r2://'));
      if (urls.length > 0) {
        preloadFloorImages(urls);
      }
    }
  }, [availableStoreVersions]);

  // 2. Filter versions specific to targetLoc (e.g. L2) and year from Picture Mapping / global setting
  const locationVersions = useMemo(() => {
    if (availableStoreVersions.length === 0) return [];
    
    const tLoc = targetLoc.toUpperCase().trim();
    const matched = availableStoreVersions.filter(v => {
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      return vLoc === tLoc || vName.includes(tLoc) || vName.startsWith(`PM-${tLoc}`) || vName.startsWith(tLoc);
    });

    if (matched.length === 0) {
      return [];
    }

    // Filter by year if globalYearFilter is active (synced with Picture tab / Review tab)
    if (globalYearFilter && globalYearFilter !== 'all') {
      const targetYear = String(globalYearFilter).trim();
      const yearMatched = matched.filter(v => String(v.year || '').trim() === targetYear);
      if (yearMatched.length > 0) {
        return yearMatched;
      }
      // If there is no specific version uploaded for this year yet, fallback to the latest available drawing
      // for this floor (sorted descending by year) so the layout and unit locations are never blank
      const sortedByYear = [...matched].sort((a, b) => {
        const yA = Number(a.year) || 0;
        const yB = Number(b.year) || 0;
        return yB - yA;
      });
      return sortedByYear;
    }

    return matched;
  }, [availableStoreVersions, targetLoc, globalYearFilter]);

  // 3. Resolve active version & units
  const { r2Version, r2Units } = useMemo(() => {
    const pKey = `${storeFilter}_${targetLoc}`;
    
    const localPart = localStoreLocationData?.[pKey] || (
      localStore === storeFilter && localLocation === targetLoc
        ? { mapUnits: localMapUnits, mapVersions: localMapVersions, activeMapVersionId: localActiveMapVersionId }
        : null
    );
    const cloudPart = config?.storeLocationData?.[pKey];
    const partition = (localPart && Array.isArray(localPart.mapVersions) && localPart.mapVersions.length > 0)
      ? localPart
      : cloudPart;

    // Pick version: check selectedVersionId first, then localActiveMapVersionId from Picture tab, then partition.activeMapVersionId, then matching location versions
    let v: any = null;
    if (selectedVersionId && locationVersions.some(lv => lv.id === selectedVersionId)) {
      v = locationVersions.find(lv => lv.id === selectedVersionId);
    } else if (localActiveMapVersionId && locationVersions.some(lv => lv.id === localActiveMapVersionId)) {
      v = locationVersions.find(lv => lv.id === localActiveMapVersionId);
    } else if (partition?.activeMapVersionId && locationVersions.some(lv => lv.id === partition.activeMapVersionId)) {
      v = locationVersions.find(lv => lv.id === partition.activeMapVersionId);
    } else if (locationVersions.length > 0) {
      // Prioritize version for this floor with dynamic rules or groups
      v = locationVersions.find(lv => lv.isDynamicActive !== false && Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions.find(lv => Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions[0];
    }

    if (!v) {
      return { r2Version: null, r2Units: [] };
    }

    // Resolve backgroundUrl if empty or r2://
    let bgUrl = v.backgroundUrl || '';
    if (!bgUrl || bgUrl.startsWith('r2://')) {
      // Scan all cloud partitions and versions for resolved signed URL
      if (cloudPart?.mapVersions) {
        const matchingCloudV = cloudPart.mapVersions.find((cv: any) => cv.id === v.id || cv.name === v.name);
        if (matchingCloudV?.backgroundUrl && !matchingCloudV.backgroundUrl.startsWith('r2://')) {
          bgUrl = matchingCloudV.backgroundUrl;
        }
      }
      if ((!bgUrl || bgUrl.startsWith('r2://')) && config?.storeLocationData) {
        for (const part of Object.values(config.storeLocationData) as any[]) {
          const matchingCloudV = part?.mapVersions?.find((cv: any) => cv.id === v.id || cv.name === v.name);
          if (matchingCloudV?.backgroundUrl && !matchingCloudV.backgroundUrl.startsWith('r2://')) {
            bgUrl = matchingCloudV.backgroundUrl;
            break;
          }
        }
      }
      if ((!bgUrl || bgUrl.startsWith('r2://')) && config?.version?.backgroundUrl && !config.version.backgroundUrl.startsWith('r2://')) {
        if (config.version.id === v.id || config.version.name === v.name) {
          bgUrl = config.version.backgroundUrl;
        }
      }
    }
    const finalVersion = { ...v, backgroundUrl: bgUrl };

    // Resolve units: collect all drawn shapes across all sources so any floor's shapes are readily available
    const unitsMap = new Map<string, any>();

    const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';

    // 1. From config.storeLocationData across partitions matching storeFilter
    if (config?.storeLocationData) {
      Object.entries(config.storeLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${targetStoreParam}_`)) {
          const loc = key.split('_')[1] || '';
          if (Array.isArray(part?.mapUnits)) {
            part.mapUnits.forEach((u: any) => {
              if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
                const existing = unitsMap.get(u.id) || {};
                unitsMap.set(u.id, { ...existing, ...u, store: targetStoreParam, location: u.location || existing.location || loc });
              }
            });
          }
        }
      });
    }

    // 2. From config.mapUnits (root-level drawn shapes - ONLY for HCM legacy fallback)
    if (targetStoreParam === 'HCM' && !config?.storeLocationData?.[pKey] && Array.isArray(config?.mapUnits)) {
      config.mapUnits.forEach((u: any) => {
        if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
          const existing = unitsMap.get(u.id) || {};
          unitsMap.set(u.id, { ...existing, ...u, store: 'HCM', location: u.location || existing.location || targetLoc });
        }
      });
    }

    // 3. From local in-memory storeLocationData across partitions matching storeFilter
    if (localStoreLocationData) {
      Object.entries(localStoreLocationData).forEach(([key, part]: [string, any]) => {
        if (key.startsWith(`${targetStoreParam}_`)) {
          const loc = key.split('_')[1] || '';
          if (Array.isArray(part?.mapUnits)) {
            part.mapUnits.forEach((u: any) => {
              if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
                const existing = unitsMap.get(u.id) || {};
                unitsMap.set(u.id, { ...existing, ...u, store: targetStoreParam, location: u.location || existing.location || loc });
              }
            });
          }
        }
      });
    }

    // 4. From current active in-memory partition (ONLY if localStore matches targetStoreParam)
    if (localStore === targetStoreParam && Array.isArray(localMapUnits)) {
      localMapUnits.forEach((u: any) => {
        if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
          const existing = unitsMap.get(u.id) || {};
          unitsMap.set(u.id, { ...existing, ...u, store: targetStoreParam, location: u.location || existing.location || targetLoc });
        }
      });
    }

    // 5. From global store helper
    try {
      const storeUnits = getAllStoreUnits(targetStoreParam);
      if (Array.isArray(storeUnits)) {
        storeUnits.forEach((u: any) => {
          if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
            const existing = unitsMap.get(u.id) || {};
            unitsMap.set(u.id, { ...existing, ...u, store: targetStoreParam, location: u.location || existing.location || targetLoc });
          }
        });
      }
    } catch (e) {}

    // 6. Gather all unit IDs mapped in finalVersion.groupMappings
    const mappedUnitIds = new Set<string>();
    if (finalVersion?.groupMappings) {
      Object.values(finalVersion.groupMappings).forEach((m: any) => {
        if (Array.isArray(m)) m.forEach(id => mappedUnitIds.add(String(id)));
      });
    }

    const vLoc = (finalVersion.location || targetLoc || '').toUpperCase().trim();
    const tLoc = targetLoc.toUpperCase().trim();

    // 7. Filter units for finalVersion: include mapped units or units strictly matching this store & floor
    const finalUnitsList = Array.from(unitsMap.values()).filter((u: any) => {
      // Must match store
      if (u.store && String(u.store).toUpperCase() !== targetStoreParam) return false;

      // If mapped in this version's groups, ALWAYS include
      if (mappedUnitIds.has(String(u.id))) return true;

      // If unit has location matching this floor or version
      const uLoc = (u.location || '').toUpperCase().trim();
      if (uLoc && (uLoc === vLoc || uLoc === tLoc || vLoc.includes(uLoc) || uLoc.includes(vLoc))) return true;

      // Fallback: if no location info, include only if both vLoc and tLoc are empty
      if (!uLoc && !vLoc && !tLoc) return true;

      return false;
    });

    // 8. Fallback to config.units if no drawn shapes found at all (ONLY for HCM legacy fallback)
    if (finalUnitsList.length === 0 && targetStoreParam === 'HCM' && Array.isArray(config?.units)) {
      config.units.forEach((u: any) => {
        if (u?.id) unitsMap.set(u.id, { ...u, store: 'HCM', location: u.location || targetLoc });
      });
      return { r2Version: finalVersion, r2Units: Array.from(unitsMap.values()) };
    }

    return { r2Version: finalVersion, r2Units: finalUnitsList };
  }, [
    config, storeFilter, targetLoc, localStoreLocationData, localStore, localLocation,
    localMapUnits, localMapVersions, localActiveMapVersionId, selectedVersionId,
    locationVersions, availableStoreVersions, getAllStoreUnits
  ]);

  const version = r2Version;
  const units = r2Units;
  const [bgImage] = useOffscreenImage(version?.backgroundUrl || '', 'anonymous');
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<{ 
    visible: boolean; 
    data: any; 
    unitName: string; 
    clientX?: number; 
    clientY?: number;
    unitScreenBounds?: {
      left: number;
      right: number;
      top: number;
      bottom: number;
      centerX: number;
      centerY: number;
    };
  } | null>(null);
  const isPinnedRef = useRef(false);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [isLegendStripCollapsed, setIsLegendStripCollapsed] = useState(false);
  const [selectedLegendGroupId, setSelectedLegendGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [focusedUnitId, setFocusedUnitId] = useState<string | null>(null);
  const focusedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastHandledSearchRef = useRef<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  // Listen for Edit Mode trigger from hamburger menu
  useEffect(() => {
    const handleOpenEditMode = () => {
      setShowMenu(true);
    };
    window.addEventListener("open-layout-edit-mode", handleOpenEditMode);
    return () => {
      window.removeEventListener("open-layout-edit-mode", handleOpenEditMode);
    };
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
    };
  }, []);

  // Wake-up redraw handler after tab cold freeze or background sleep
  useEffect(() => {
    const handleWakeUp = () => {
      if (document.visibilityState === 'visible') {
        stageRef.current?.batchDraw();
      }
    };
    document.addEventListener('visibilitychange', handleWakeUp);
    window.addEventListener('focus', handleWakeUp);
    return () => {
      document.removeEventListener('visibilitychange', handleWakeUp);
      window.removeEventListener('focus', handleWakeUp);
    };
  }, []);

  const handleTriggerExport = async () => {
    if (!canWrite) {
      alert('⚠️ Bạn không có quyền ghi (Write) để thực hiện Trigger Export.');
      return;
    }
    if (isExporting) return;
    try {
      setIsExporting(true);
      setExportStatus('Bước 1/4: Đang tải dữ liệu từ Cloudflare R2...');
      const targetStore = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
      const res = await executeTriggerExportProcess(targetStore, (status) => {
        setExportStatus(status);
      });
      setIsExporting(false);
      setExportStatus('');
      alert(`✅ ${res.message}`);
      if (onRefreshConfig) {
        await onRefreshConfig();
      }
    } catch (err: any) {
      console.error("Lỗi khi Trigger Export:", err);
      setIsExporting(false);
      setExportStatus('');
      alert(`⚠️ Lỗi khi Trigger Export:\n${err?.message || err}`);
    }
  };

  const touchStateRef = useRef<{
    lastDist: number;
    lastCenter: { x: number; y: number } | null;
    lastTap: number;
  }>({
    lastDist: 0,
    lastCenter: null,
    lastTap: 0,
  });

  const isInteractingRef = useRef(false);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingWheelDeltaRef = useRef<number>(0);
  const rafWheelIdRef = useRef<number | null>(null);
  const lastWheelPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    (window as any).__taka_layout_stage = stageRef.current;
    return () => {
      if ((window as any).__taka_layout_stage === stageRef.current) {
        (window as any).__taka_layout_stage = null;
      }
    };
  });

  useEffect(() => {
    return () => {
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      if (rafWheelIdRef.current !== null) cancelAnimationFrame(rafWheelIdRef.current);
    };
  }, []);

  // Auto-fit floor plan background & units to perfectly fit and center in the viewport
  const fitToScreen = useCallback((animated: boolean = false) => {
    const containerW = containerRef.current?.offsetWidth || dimensions.width;
    const containerH = containerRef.current?.offsetHeight || dimensions.height;
    if (containerW <= 0 || containerH <= 0) return;

    let contentW = 1000;
    let contentH = 800;
    let contentX = 0;
    let contentY = 0;

    if (bgImage) {
      const imgNaturalW = (bgImage as HTMLImageElement).naturalWidth || bgImage.width || 1000;
      const imgNaturalH = (bgImage as HTMLImageElement).naturalHeight || bgImage.height || 800;
      const imgScale = version?.imageScale || 1;
      contentW = imgNaturalW * imgScale;
      contentH = imgNaturalH * imgScale;
      contentX = version?.imagePos?.x || 0;
      contentY = version?.imagePos?.y || 0;
    } else if (units && units.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      units.forEach((u: any) => {
        const ux = u.x || 0;
        const uy = u.y || 0;
        const uw = u.width || 100;
        const uh = u.height || 100;
        minX = Math.min(minX, ux);
        minY = Math.min(minY, uy);
        maxX = Math.max(maxX, ux + uw);
        maxY = Math.max(maxY, uy + uh);
      });
      if (minX !== Infinity && maxX > minX) {
        contentX = minX;
        contentY = minY;
        contentW = Math.max(100, maxX - minX);
        contentH = Math.max(100, maxY - minY);
      }
    }

    // Dynamic padding so the background image borders never get clipped on mobile or desktop
    const pad = containerW < 640 ? 12 : 24;
    const availW = Math.max(10, containerW - pad * 2);
    const availH = Math.max(10, containerH - pad * 2);

    const scaleX = availW / contentW;
    const scaleY = availH / contentH;
    const fitScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(0.01, Math.min(fitScale, 10));

    // Center content in viewport
    const contentCenterX = contentX + contentW / 2;
    const contentCenterY = contentY + contentH / 2;
    const posX = containerW / 2 - contentCenterX * clampedScale;
    const posY = containerH / 2 - contentCenterY * clampedScale;

    const newPos = { x: posX, y: posY };

    const stage = stageRef.current;
    if (stage) {
      if (animated) {
        stage.to({
          scaleX: clampedScale,
          scaleY: clampedScale,
          x: posX,
          y: posY,
          duration: 0.22,
          easing: Konva.Easings.EaseOut,
          onFinish: () => {
            setStageScale(clampedScale);
            setStagePos(newPos);
          }
        });
      } else {
        stage.scale({ x: clampedScale, y: clampedScale });
        stage.position(newPos);
        stage.batchDraw();
        setStageScale(clampedScale);
        setStagePos(newPos);
      }
    } else {
      setStageScale(clampedScale);
      setStagePos(newPos);
    }
  }, [bgImage, version, units, dimensions]);

  // Trigger fitToScreen when background image or partition version changes (only if no unit is currently searched/focused)
  const lastFloorVersionKeyRef = useRef<string>('');
  useEffect(() => {
    const currentKey = `${storeFilter}_${targetLoc}_${version?.id || ''}_${bgImage ? 'loaded' : 'none'}`;
    const floorChanged = lastFloorVersionKeyRef.current !== currentKey;
    lastFloorVersionKeyRef.current = currentKey;

    if (floorChanged && !targetUnitSearch && !focusedUnitId && !lastHandledSearchRef.current) {
      fitToScreen();
    }
  }, [storeFilter, targetLoc, version?.id, bgImage, fitToScreen, targetUnitSearch, focusedUnitId]);

  // 1. Get real-time projects and Excel summary data (Filtered strictly by Account Control RBAC permissions)
  const { enrichedProjects, filteredTasks: tasks } = useEnrichedData();
  const allProjects = useAppStore(state => state.projects);
  const currUser = useAppStore(state => state.currentUser);
  const delegationGroups = useAppStore(state => state.delegationGroups);
  const setEditingProject = useAppStore(state => state.setEditingProject);
  const setIsProjectModalOpen = useAppStore(state => state.setIsProjectModalOpen);
  const isProjectModalOpen = useAppStore(state => state.isProjectModalOpen);
  const setModalInitialTab = useAppStore(state => state.setModalInitialTab);
  const isPrintPreview = useAppStore(state => state.isPrintPreview);
  const setIsPrintPreview = useAppStore(state => state.setIsPrintPreview);
  const summaryData = useSummaryData();

  // Compute set of project codes that the current user is NOT allowed to access (RBAC)
  const restrictedProjectCodes = useMemo(() => {
    if (!currUser || currUser.role === 'admin') return new Set<string>();

    const allowedCodeSet = new Set<string>();
    enrichedProjects.forEach(p => {
      if (p.code) allowedCodeSet.add(String(p.code).trim().toLowerCase());
      if (p.linkCodes) {
        p.linkCodes.split(/[+;,/]/).forEach(c => {
          if (c.trim()) allowedCodeSet.add(c.trim().toLowerCase());
        });
      }
    });

    const restrictedSet = new Set<string>();
    allProjects.forEach(p => {
      const rawCodes = (p.linkCodes && p.linkCodes.trim()) ? p.linkCodes : String(p.code || '');
      const pCodes = rawCodes.split(/[+;,/]/).map(c => c.trim().toLowerCase()).filter(Boolean);
      pCodes.forEach(code => {
        if (!allowedCodeSet.has(code)) {
          restrictedSet.add(code);
        }
      });
    });

    return restrictedSet;
  }, [allProjects, enrichedProjects, currUser]);

  // 2. Build aggregatedData
  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};
    
    units.forEach((u: any) => {
      const uName = (u?.name || '').toLowerCase().trim();
      if (!uName) return;
      const isRestricted = restrictedProjectCodes.has(uName);
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        isRestricted,
        year: globalYearFilter || '2026',
        size: 0, sales: 0, salesByCp: 0, salesByHcmcate: 0,
        profit: 0, profitByCp: 0, profitByHcmcate: 0,
        margin: 0, marginByCp: 0, hcmSalesEffi: 0, hcmMargin: 0,
        mdStatus: "", task: "", projectStatus: "", actStatus: "",
        endDate: "", status: "", vendorCode: "",
        brandCode: "", brandName: "", classCode: "", floor: u.location || locationFilter || "",
        appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: "", appProjectYear: "", projectName: "", startDate: "", handoverDate: "", openingDate: "", detail: "", party: "",
        appProjectMdStatus: "", appMdStatus: "", appProjectActStatus: "", appActStatus: "", appProjectDetail: "", appDetail: "", appProjectDescription: "", appDescription: "", appProjectParty: "", appParty: ""
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase().trim();
      if (key && dataMap[key]) {
        if (dataMap[key].isRestricted || restrictedProjectCodes.has(key)) {
          dataMap[key].isRestricted = true;
          return;
        }
        Object.assign(dataMap[key], {
            size: sumData.size || 0,
            sales: sumData.salesAmount || 0,
            profit: sumData.profitAmount || 0,
            margin: sumData.margin || 0,
            hcmSalesEffi: sumData.hcmSalesEffi || 0,
            mdStatus: sumData.mdStatus || "",
            projectStatus: sumData.projectStatus || "",
            status: sumData.status || "",
            brandName: sumData.brandName || "",
            floor: dataMap[key].floor || (sumData as any).floor || "",
        });
      }
    });

    // Pre-index tasks by code map for O(1) lookup to eliminate O(N*M) loop
    const tasksByCodeMap = new Map<string, any[]>();
    tasks.forEach(t => {
      if (!t || !t.name || !t.projectCode) return;
      const rawCode = String(t.projectCode).trim().toLowerCase();
      const codeParts = rawCode.split(/[+;,/]/).map(c => c.trim()).filter(Boolean);
      codeParts.forEach(c => {
        let list = tasksByCodeMap.get(c);
        if (!list) {
          list = [];
          tasksByCodeMap.set(c, list);
        }
        list.push(t);
      });
    });

    const now = new Date();
    enrichedProjects.forEach((p) => {
      if (!p.code && !p.linkCodes) return;
      if (storeFilter !== 'all') {
        const pStore = String(p.store || (p as any).projectStore || '').trim().toUpperCase();
        if (pStore && pStore !== String(storeFilter).trim().toUpperCase()) return;
      }
      const pYear = String(p.year || (p as any).projectYear || '').trim();
      if (globalYearFilter && globalYearFilter !== 'all') {
        if (pYear && pYear !== String(globalYearFilter)) return;
      }
      const pCodes = extractAllProjectCodes(p);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      
      // Match tasks directly from pre-indexed map for O(1) lookup
      const matchedTaskSet = new Set<any>();
      pCodes.forEach(c => {
        const list = tasksByCodeMap.get(c);
        if (list) list.forEach(t => matchedTaskSet.add(t));
      });
      if (p.code) {
        const pCodeLower = String(p.code).trim().toLowerCase();
        const list = tasksByCodeMap.get(pCodeLower);
        if (list) list.forEach(t => matchedTaskSet.add(t));
      }
      const matchedTasks = Array.from(matchedTaskSet);

      // Match active tasks following STRICTLY the same logic as General Tab (Project General Table):
      // Only tasks that are currently active right now (now >= start && now <= finish).
      // If no tasks are currently active, activeTaskNames is empty [].
      let activeTaskNames: string[] = [];
      if (matchedTasks.length > 0) {
        const activeTasks = matchedTasks.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      } else if (p.taskSummaries && p.taskSummaries.length > 0) {
        const activeTasks = p.taskSummaries.filter(t => {
          if (!t.start || !t.finish) return false;
          const start = new Date(t.start);
          const finish = new Date(t.finish);
          return now >= start && now <= finish;
        });
        activeTaskNames = activeTasks.map(t => t.name);
      }

      let taskLines: string[] = [];
      activeTaskNames.forEach(name => {
        taskLines.push(...name.split('\n').filter((l: string) => l.trim() !== ''));
      });

      const actStatus = (p as any).computedActStatus || (p as any).actStatus || computeProjectActStatus(p, delegationGroups);
      const detailStr = p.detail || '';
      const descStr = p.detail || (p as any).description || '';
      const partyStr = p.party || (p as any).contractor || '';
      const mdStatusStr = p.mdStatus || '';

      const targetUnitKeys = new Set<string>();
      pCodes.forEach(code => {
        if (dataMap[code]) targetUnitKeys.add(code);
      });
      Object.keys(dataMap).forEach(uKey => {
        if (projectMatchesUnitCode(pCodes, uKey)) {
          targetUnitKeys.add(uKey);
        }
      });

      targetUnitKeys.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].matchedProject = p;
            dataMap[code].appProjectStatus = status;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code);
            dataMap[code].appProjectYear = pYear;
            dataMap[code].year = pYear || dataMap[code].year || '';
            dataMap[code].floor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
            dataMap[code].appProjectFloor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
            dataMap[code].appFloor = (p as any).floor || p.location || dataMap[code].floor || targetLoc || '';
            dataMap[code].projectName = p.name || "";
            dataMap[code].startDate = p.start || p.computedTakStart || "";
            dataMap[code].handoverDate = p.handover || p.computedTakCompl || "";
            dataMap[code].openingDate = p.opening || p.computedOpening || "";
            dataMap[code].detail = detailStr;
            dataMap[code].taskLines = taskLines;
            dataMap[code].mdStatus = mdStatusStr || dataMap[code].mdStatus || "";
            dataMap[code].actStatus = actStatus || dataMap[code].actStatus || "";
            dataMap[code].party = partyStr;
            dataMap[code].projectStatus = status || dataMap[code].projectStatus || "";
            dataMap[code].status = status || dataMap[code].status || "";

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

            dataMap[code].matchedTasks = matchedTasks;
            dataMap[code].subTasks = matchedTasks.length > 0 ? matchedTasks : (p.taskSummaries || []);
            dataMap[code].planProgressPercent = p.computedPlanProgress ?? 0;
            dataMap[code].actProgressPercent = p.computedActProgress ?? 0;

            // Compute Smart Alert for this unit based on notification preferences
            const todayStr = now.toISOString().split('T')[0];
            const alertReasons: string[] = [];
            let alertLevel: 'critical' | 'warning' | null = null;

            if (layoutTooltipVisibility?.notifications !== false) {
              // 1. Overdue tasks check
              if (layoutTooltipVisibility?.alertOverdue !== false) {
                const subTasksList = matchedTasks.length > 0 ? matchedTasks : (p.taskSummaries || []);
                let overdueCount = 0;
                subTasksList.forEach((st: any) => {
                  if (st.finish && st.finish < todayStr) {
                    const prog = st.progress ?? st.computedActProgress ?? 0;
                    if (prog < 100 && st.status !== 'Completed' && st.status !== 'Done') {
                      overdueCount++;
                    }
                  }
                });
                if (overdueCount > 0) {
                  alertReasons.push(`${overdueCount} overdue task${overdueCount > 1 ? 's' : ''}`);
                  alertLevel = 'critical';
                }
              }

              // 2. Project status delayed / late
              if (layoutTooltipVisibility?.alertDelay !== false) {
                const lowerStat = String(status).toLowerCase();
                const lowerAct = String(actStatus).toLowerCase();
                if (lowerStat.includes('delay') || lowerStat.includes('late') || lowerAct.includes('delay') || lowerAct.includes('late')) {
                  alertReasons.push('Project delayed');
                  alertLevel = 'critical';
                }
              }

              // 3. Upcoming handover within 3 days (if not completed)
              if (layoutTooltipVisibility?.alertHandover !== false) {
                const hDate = p.handover || p.computedTakCompl;
                if (hDate && hDate >= todayStr && (p.computedActProgress ?? 0) < 100) {
                  const diffDays = Math.ceil((new Date(hDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays >= 0 && diffDays <= 3) {
                    alertReasons.push(`Handover ${diffDays === 0 ? 'Today' : 'in ' + diffDays + 'd'}`);
                    if (!alertLevel) alertLevel = 'warning';
                  }
                }
              }

              // 4. Upcoming opening within 3 days (if not completed)
              if (layoutTooltipVisibility?.alertOpening !== false) {
                const oDate = p.opening || p.computedOpening;
                if (oDate && oDate >= todayStr && (p.computedActProgress ?? 0) < 100) {
                  const diffDays = Math.ceil((new Date(oDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays >= 0 && diffDays <= 3) {
                    alertReasons.push(`Opening ${diffDays === 0 ? 'Today' : 'in ' + diffDays + 'd'}`);
                    if (!alertLevel) alertLevel = 'warning';
                  }
                }
              }
            }

            dataMap[code].alerts = {
              hasAlert: alertReasons.length > 0,
              level: alertLevel,
              count: alertReasons.length,
              reasons: alertReasons
            };
         }
      });
    });

    return dataMap;
  }, [units, summaryData, enrichedProjects, tasks, storeFilter, locationFilter, globalYearFilter, delegationGroups, layoutTooltipVisibility]);

  // 3. Evaluate rules on the fly to build unitColorMap (Strict Dynamic Rules matching only)
  const { unitColorMap, unitGroupMap, unitOpacityMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupMap: Record<string, string> = {};
    const opacityMap: Record<string, number> = {};
    const groupsInUse: any[] = [];
    
    if (!version || !version.groups) return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, activeGroups: groupsInUse };

    version.groups.forEach((group: any) => {
        let matchCount = 0;
        const matchedUnits: any[] = [];
        const groupOpacity = typeof group.opacity === 'number' ? group.opacity : 0.65;
        
        // STRICT REQUIREMENT: Only match when group.rules are defined and pass against aggregatedData
        // (Do NOT use static/manual groupMappings or any other fallback)
        if (!group.rules || !Array.isArray(group.rules) || group.rules.length === 0) {
            return;
        }

        units.forEach((u: any) => {
            const uName = String(u.name || '').toLowerCase().trim();
            if (restrictedProjectCodes.has(uName) || aggregatedData[uName]?.isRestricted) {
                // Restricted project for current user -> DO NOT match color or group
                return;
            }
            let isMatch = false;

            const data = aggregatedData[u.name?.toLowerCase() || ''];
            if (data) {
                const passedRules = group.rules.every((rule: any) => {
                    let val = data[rule.field];
                    const f = String(rule.field || '').toLowerCase().trim();

                    // 1. Explicit App Data / Real-time Project checks (NO fallback to legacy/static summary data)
                    if (f === 'appprojectstatus' || f === 'appstatus' || f === 'app: status') {
                      val = data.appProjectStatus || '';
                    } else if (f === 'appprojectyear' || f === 'appyear' || f === 'app: year') {
                      val = data.appProjectYear || '';
                    } else if (f === 'appprojectcode' || f === 'appcode' || f === 'app: project code') {
                      val = data.appProjectCode || '';
                    } else if (f === 'appprojectfloor' || f === 'appfloor' || f === 'app: floor') {
                      val = data.appProjectFloor || '';
                    } else if (f === 'appprojectmdstatus' || f === 'appmdstatus' || f === 'app: md status' || f === 'app:md status') {
                      val = data.appProjectMdStatus || '';
                    } else if (f === 'appprojectactstatus' || f === 'appactstatus' || f === 'app: act status' || f === 'app:act status') {
                      val = data.appProjectActStatus || '';
                    } else if (f === 'appprojectdetail' || f === 'appdetail' || f === 'app: detail (project)') {
                      val = data.appProjectDetail || '';
                    } else if (f === 'appprojectdescription' || f === 'appdescription' || f === 'app: description (project)') {
                      val = data.appProjectDescription || '';
                    } else if (f === 'appprojectparty' || f === 'appparty' || f === 'app: party') {
                      val = data.appProjectParty || '';
                    } else if (f === 'appprojectbudget' || f === 'appbudget' || f === 'app: budget') {
                      val = data.appProjectBudget ?? 0;
                    } else if (f === 'appprojectactual' || f === 'appactual' || f === 'app: actual') {
                      val = data.appProjectActual ?? 0;
                    } else if (val === undefined || val === null || String(val).trim() === '') {
                      // 2. General attribute fallbacks
                      if (f === 'floor' || f === 'location') {
                        val = data.floor || u.location || targetLoc || '';
                      } else if (f === 'year') {
                        val = data.appProjectYear || data.year || '';
                      } else if (f === 'status' || f === 'projectstatus') {
                        val = data.appProjectStatus || data.projectStatus || data.status || '';
                      } else if (f === 'mdstatus') {
                        val = data.appProjectMdStatus || data.mdStatus || '';
                      } else if (f === 'actstatus') {
                        val = data.appProjectActStatus || data.actStatus || '';
                      } else if (f === 'detail' || f === 'description (project)') {
                        val = data.appProjectDetail || data.detail || '';
                      } else if (f === 'party') {
                        val = data.appProjectParty || data.party || '';
                      } else if (f === 'unit' || f === 'code') {
                        val = data.unit || data.appProjectCode || u.name || '';
                      }
                    }
                    if (rule.field === "margin" || rule.field === "marginByCp") val = Number(val || 0) * 100;
                    const numVal = Number(rule.value);
                    const isNum = !isNaN(numVal) && String(rule.value || '').trim() !== "";
                    
                    let compareValStr = String(val || "").toLowerCase().trim();
                    let compareRuleStr = String(rule.value || "").toLowerCase().trim();
                    if (compareRuleStr === "in progress") compareRuleStr = "on process";
                    if (compareValStr === "in progress") compareValStr = "on process";

                    switch (rule.operator) {
                      case ">": return isNum ? Number(val) > numVal : false;
                      case "<": return isNum ? Number(val) < numVal : false;
                      case ">=": return isNum ? Number(val) >= numVal : false;
                      case "<=": return isNum ? Number(val) <= numVal : false;
                      case "=": return compareValStr === compareRuleStr;
                      case "contains": {
                        const searchTerms = compareRuleStr.split(/\s+/);
                        return searchTerms.every(term => compareValStr.includes(term));
                      }
                      case "or":
                      case "OR": {
                        const orTerms = compareRuleStr
                          .split(/[\r\n\t,;+/&|]+|\s{2,}/)
                          .map((t) => {
                            let tr = t.trim();
                            if (tr === "in progress") tr = "on process";
                            return tr;
                          })
                          .filter(Boolean);
                        if (orTerms.length === 0) {
                          const spaceTerms = compareRuleStr.split(/\s+/).filter(Boolean);
                          return spaceTerms.some(term => compareValStr === term || compareValStr.includes(term));
                        }
                        return orTerms.some((term) => {
                          if (compareValStr === term) return true;
                          if (compareValStr.includes(term)) return true;
                          if (isNum && !isNaN(Number(term)) && Number(val) === Number(term)) return true;
                          return false;
                        });
                      }
                      case "exclude": {
                        const searchTerms = compareRuleStr.split(/\s+/);
                        return !searchTerms.some(term => compareValStr.includes(term));
                      }
                      default: return false;
                    }
                });
                if (passedRules) isMatch = true;
            }

            if (isMatch) {
                colorMap[u.id] = group.color;
                groupMap[u.id] = group.id;
                opacityMap[u.id] = groupOpacity;
                matchCount++;
                matchedUnits.push({ id: u.id, name: u.name });
            }
        });
        
        if (matchCount > 0) {
            groupsInUse.push({ ...group, matchCount, matchedUnits });
        }
    });

    return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, activeGroups: groupsInUse };
  }, [version?.groups, units, aggregatedData, restrictedProjectCodes, targetLoc]);

  // Total count of units with alerts on this floor
  const totalFloorAlerts = useMemo(() => {
    let count = 0;
    units.forEach((u: any) => {
      const uName = (u?.name || '').toLowerCase().trim();
      if (uName && aggregatedData[uName]?.alerts?.hasAlert) {
        count++;
      }
    });
    return count;
  }, [units, aggregatedData]);

  // 4. Filter only units and precalculate bounds
  const displayedUnits = useMemo(() => {
    return units
      .filter((unit: any) => {
        if (unit.visible === false) return false;

        const uName = (unit.name || '').toLowerCase().trim();
        const uData = (uName && aggregatedData[uName]) ? aggregatedData[uName] : {};
        const isRestricted = restrictedProjectCodes.has(uName) || uData?.isRestricted;

        if (isRestricted) {
          return false;
        }

        const hasProject = Boolean(uData?.matchedProject || uData?.projectName || uData?.appProjectCode);
        const isMappedInGroup = Boolean(unitColorMap[unit.id]);
        const isFocused = focusedUnitId === unit.id;

        // Filter by Alerts toggle
        if (filterOnlyAlerts && !isFocused) {
          if (!uData?.alerts?.hasAlert) {
            return false;
          }
        }

        // Performance & Clarity Optimization: Only render units that have active projects or custom group classification
        // (Unless the user is searching or this unit is currently focused/zoomed)
        if (!deferredSearchQuery.trim() && !isFocused && !filterOnlyAlerts) {
          if (!hasProject && !isMappedInGroup) {
            return false;
          }
        }

        if (deferredSearchQuery.trim()) {
          const q = deferredSearchQuery.toLowerCase().trim();
          const matchName = (unit.name || '').toLowerCase().includes(q);
          const matchBrand = (uData.brandName || '').toLowerCase().includes(q);
          const matchProject = (uData.projectName || '').toLowerCase().includes(q);
          const matchCode = (uData.appProjectCode || '').toLowerCase().includes(q);
          if (!matchName && !matchBrand && !matchProject && !matchCode) {
            return false;
          }
        }
        return true;
      })
      .map((unit: any) => {
        const targetColor = unitColorMap[unit.id] || null;
        const targetOpacity = unitOpacityMap[unit.id] ?? 0.85;
        
        let textX = unit.x || 0;
        let textY = unit.y || 0;
        let textWidth = 100;
        let textHeight = 30;

        if (unit.type === 'rect') {
          textX = unit.x || 0;
          textY = unit.y || 0;
          textWidth = unit.width || 100;
          textHeight = unit.height || 30;
        } else if (unit.type === 'circle') {
          const r = unit.radius || 20;
          textX = (unit.x || 0) - r;
          textY = (unit.y || 0) - r;
          textWidth = r * 2;
          textHeight = r * 2;
        } else if (unit.type === 'polygon' && unit.points && unit.points.length >= 2) {
          let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
          for (let i = 0; i < unit.points.length; i += 2) {
            const px = unit.points[i];
            const py = unit.points[i + 1];
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
          textX = minX;
          textY = minY;
          textWidth = Math.max(20, maxX - minX);
          textHeight = Math.max(20, maxY - minY);
        }

        return {
          ...unit,
          targetColor,
          targetOpacity,
          targetGroupId: unitGroupMap[unit.id],
          textX,
          textY,
          textWidth,
          textHeight,
        };
      });
  }, [units, unitColorMap, unitGroupMap, unitOpacityMap, deferredSearchQuery, aggregatedData, focusedUnitId, filterOnlyAlerts]);

  // Handle position tooltip directly via DOM with 2D collision clamping to prevent screen cropping
  const updateTooltipPos = (clientX: number, clientY: number) => {
    requestAnimationFrame(() => {
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      const tooltipWidth = rect.width > 0 ? rect.width : 340;
      const tooltipHeight = rect.height > 0 ? rect.height : 280;

      const viewportWidth = window.innerWidth;
      const visualVp = typeof window !== 'undefined' ? window.visualViewport : null;
      const viewportHeight = visualVp ? visualVp.height : window.innerHeight;
      const isMobile = viewportWidth < 640;

      const pad = 12;
      const bottomMargin = isMobile ? 84 : 72;
      const topMargin = isMobile ? 64 : 16;

      if (isMobile) {
        const left = pad;
        const right = pad;
        let top: number;
        if (clientY > viewportHeight * 0.52) {
          top = topMargin;
        } else {
          top = Math.max(topMargin, viewportHeight - tooltipHeight - bottomMargin);
        }

        el.style.position = 'fixed';
        el.style.left = `${left}px`;
        el.style.right = `${right}px`;
        el.style.top = `${top}px`;
        el.style.width = `calc(100vw - ${pad * 2}px)`;
        el.style.maxWidth = '420px';
        el.style.maxHeight = `calc(${viewportHeight - topMargin - bottomMargin}px)`;
        el.style.margin = '0 auto';
        el.style.transform = 'none';
      } else {
        let left = clientX + 16;
        if (left + tooltipWidth > viewportWidth - pad) {
          left = clientX - tooltipWidth - 16;
        }
        left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

        let top = clientY + 16;
        if (top + tooltipHeight > viewportHeight - bottomMargin) {
          top = clientY - tooltipHeight - 16;
        }
        top = Math.max(topMargin, Math.min(top, viewportHeight - tooltipHeight - bottomMargin));

        el.style.position = 'fixed';
        el.style.left = `${left}px`;
        el.style.right = 'auto';
        el.style.top = `${top}px`;
        el.style.width = '350px';
        el.style.maxWidth = `calc(100vw - ${pad * 2}px)`;
        el.style.maxHeight = `calc(${viewportHeight - topMargin - bottomMargin}px)`;
        el.style.margin = '0';
        el.style.transform = 'none';
      }
    });
  };

  // Reset selected version and ensure useDataStore partition syncs when locationFilter, storeFilter, or globalYearFilter changes
  useEffect(() => {
    setSelectedVersionId(null);
    const targetStore = (storeFilter === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
    const targetFloor = locationFilter && locationFilter !== 'all' ? locationFilter : 'L1';
    const currStore = useDataStore.getState().store;
    const currLocation = useDataStore.getState().location;
    if (currStore !== targetStore || currLocation !== targetFloor) {
      useDataStore.getState().setStoreAndLocation(targetStore, targetFloor);
    }
  }, [locationFilter, storeFilter, globalYearFilter]);

  // Zoom & Pan smoothly to target unit and highlight it
  const zoomAndPanToUnit = useCallback((targetUnitOrName: string | any) => {
    if (!targetUnitOrName) return false;

    let targetUnit: any = null;
    if (typeof targetUnitOrName === 'object' && targetUnitOrName?.id) {
      targetUnit = targetUnitOrName;
    } else {
      const q = String(targetUnitOrName).toLowerCase().trim();
      // 1. Direct unit name or id match
      targetUnit = units.find((u: any) => 
        (u.name || '').toLowerCase().trim() === q || 
        String(u.id).toLowerCase() === q
      );
      // 2. Project name, brand, or code match via aggregatedData
      if (!targetUnit) {
        targetUnit = units.find((u: any) => {
          const uName = (u.name || '').toLowerCase().trim();
          const d = aggregatedData[uName];
          if (!d) return false;
          const matchCode = d.appProjectCode && String(d.appProjectCode).toLowerCase().trim() === q;
          const matchName = d.projectName && String(d.projectName).toLowerCase().trim() === q;
          const matchBrand = d.brandName && String(d.brandName).toLowerCase().trim() === q;
          const matchUnit = d.unit && String(d.unit).toLowerCase().trim() === q;
          return matchCode || matchName || matchBrand || matchUnit;
        });
      }
      // 3. Prefix / stem match (e.g. project code "L3-303-1" matches unit "L3-303")
      if (!targetUnit) {
        const stem = q.replace(/[-_.#]\d+$/, '').trim();
        if (stem && stem !== q) {
          targetUnit = units.find((u: any) => 
            (u.name || '').toLowerCase().trim() === stem ||
            String(u.id).toLowerCase() === stem
          );
        }
      }
      // 4. Substring inclusion in aggregatedData or unit name
      if (!targetUnit) {
        targetUnit = units.find((u: any) => {
          const uName = (u.name || '').toLowerCase().trim();
          if (uName && (uName.includes(q) || q.includes(uName))) return true;
          const d = aggregatedData[uName];
          if (!d) return false;
          return (d.projectName && d.projectName.toLowerCase().includes(q)) ||
                 (d.brandName && d.brandName.toLowerCase().includes(q)) ||
                 (d.appProjectCode && (d.appProjectCode.toLowerCase().includes(q) || q.includes(d.appProjectCode.toLowerCase())));
        });
      }
      // 5. Fallback: partial match
      if (!targetUnit) {
        targetUnit = units.find((u: any) => 
          (u.name || '').toLowerCase().includes(q) ||
          String(u.id).toLowerCase() === q
        );
      }
    }

    if (!targetUnit) return false;

    const targetUName = (targetUnit.name || '').toLowerCase().trim();
    if (restrictedProjectCodes.has(targetUName) || aggregatedData[targetUName]?.isRestricted) {
      return false;
    }

    // Calculate center and bounding box of target unit
    let cx = targetUnit.x || 0;
    let cy = targetUnit.y || 0;
    let uW = 100;
    let uH = 60;

    if (targetUnit.type === 'rect') {
      uW = Math.abs(targetUnit.width || 100);
      uH = Math.abs(targetUnit.height || 60);
      cx = (targetUnit.x || 0) + uW / 2;
      cy = (targetUnit.y || 0) + uH / 2;
    } else if (targetUnit.type === 'circle') {
      const r = targetUnit.radius || 30;
      uW = r * 2;
      uH = r * 2;
      cx = targetUnit.x || 0;
      cy = targetUnit.y || 0;
    } else if (targetUnit.type === 'polygon' && targetUnit.points && targetUnit.points.length >= 2) {
      let sumX = 0, sumY = 0, count = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < targetUnit.points.length; i += 2) {
        const px = targetUnit.points[i];
        const py = targetUnit.points[i + 1];
        sumX += px;
        sumY += py;
        count++;
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      cx = count > 0 ? sumX / count : 0;
      cy = count > 0 ? sumY / count : 0;
      uW = maxX > minX ? maxX - minX : 100;
      uH = maxY > minY ? maxY - minY : 60;
    } else {
      cx = (targetUnit.textX || targetUnit.x || 0) + (targetUnit.textWidth || 100) / 2;
      cy = (targetUnit.textY || targetUnit.y || 0) + (targetUnit.textHeight || 30) / 2;
    }

    const containerW = containerRef.current?.offsetWidth || dimensions.width || 800;
    const containerH = containerRef.current?.offsetHeight || dimensions.height || 600;
    const isDesktop = containerW >= 768;

    // Set zoom level to 70% (scale 0.7) on search
    const targetScale = 0.7;

    // Smart focal point calculation to guarantee the unit is centered in the unobstructed view area
    const targetScreenCenterX = isDesktop ? containerW * 0.38 : containerW * 0.50;
    const targetScreenCenterY = isDesktop ? containerH * 0.50 : containerH * 0.35;

    const posX = targetScreenCenterX - cx * targetScale;
    const posY = targetScreenCenterY - cy * targetScale;
    const newPos = { x: posX, y: posY };

    const stage = stageRef.current;
    if (stage) {
      stage.to({
        scaleX: targetScale,
        scaleY: targetScale,
        x: posX,
        y: posY,
        duration: 0.35,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          setStageScale(targetScale);
          setStagePos(newPos);
        }
      });
    } else {
      setStageScale(targetScale);
      setStagePos(newPos);
    }

    // Highlight unit with pulse glow
    setFocusedUnitId(targetUnit.id);
    if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
    focusedTimerRef.current = setTimeout(() => {
      setFocusedUnitId(null);
    }, 10000);

    // Calculate precise screen bounding box for the unit in viewport coordinates
    const unitScreenLeft = targetScreenCenterX - (uW / 2) * targetScale;
    const unitScreenRight = targetScreenCenterX + (uW / 2) * targetScale;
    const unitScreenTop = targetScreenCenterY - (uH / 2) * targetScale;
    const unitScreenBottom = targetScreenCenterY + (uH / 2) * targetScale;

    // Open detailed info tooltip for unit positioned intelligently to never cover the unit
    const uName = (targetUnit.name || '').toLowerCase();
    isPinnedRef.current = true;
    setHoverInfo({
      visible: true,
      data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
      unitName: targetUnit.name || 'Unknown',
      clientX: isDesktop ? Math.min(containerW - 360, unitScreenRight + 24) : containerW / 2,
      clientY: isDesktop ? Math.max(115, Math.min(unitScreenTop, containerH - 320)) : containerH * 0.65,
      unitScreenBounds: {
        left: unitScreenLeft,
        right: unitScreenRight,
        top: unitScreenTop,
        bottom: unitScreenBottom,
        centerX: targetScreenCenterX,
        centerY: targetScreenCenterY,
      }
    });

    onUnitSelected?.(targetUnit);
    return true;
  }, [units, dimensions, aggregatedData, onUnitSelected]);

  // Sync with incoming targetUnitSearch prop from toolbar
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim()) {
      const q = String(targetUnitSearch).trim();
      if (lastHandledSearchRef.current === q && focusedUnitId) {
        return; // Already focused and zoomed for this search
      }

      const success = zoomAndPanToUnit(q);
      if (success) {
        lastHandledSearchRef.current = q;
      } else {
        // Check other floor versions in availableStoreVersions
        const foundInOther = availableStoreVersions.find((v: any) => {
          if (v?.groupMappings) {
            const inGroup = Object.values(v.groupMappings).some((m: any) => 
              Array.isArray(m) && m.some(id => String(id).toLowerCase() === q.toLowerCase())
            );
            if (inGroup) return true;
          }
          if (v?.mapUnits && Array.isArray(v.mapUnits)) {
            const inUnits = v.mapUnits.some((u: any) => 
              (u.name && String(u.name).toLowerCase() === q.toLowerCase()) ||
              (u.id && String(u.id).toLowerCase() === q.toLowerCase())
            );
            if (inUnits) return true;
          }
          return false;
        });
        if (foundInOther) {
          if (foundInOther.location) {
            const floorLoc = String(foundInOther.location).trim().toUpperCase();
            if (useAppStore.getState().globalLocationFilter[0] !== floorLoc) {
              useAppStore.getState().setGlobalLocationFilter([floorLoc]);
            }
          }
          if (foundInOther.id !== selectedVersionId) {
            setSelectedVersionId(foundInOther.id);
          }
        }
      }
    } else if (targetUnitSearch === null || targetUnitSearch === '') {
      // Exit focus mode and reset zoom when user clears search or clicks cancel
      lastHandledSearchRef.current = null;
      setFocusedUnitId(null);
      setHoverInfo(null);
      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
      fitToScreen(true);
    }
  }, [targetUnitSearch, zoomAndPanToUnit, availableStoreVersions, selectedVersionId, fitToScreen, focusedUnitId]);

  // Keyboard listener: Escape key to exit zoom focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (focusedUnitId || targetUnitSearch)) {
        lastHandledSearchRef.current = null;
        setFocusedUnitId(null);
        setHoverInfo(null);
        if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
        fitToScreen(true);
        onClearFocus?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedUnitId, targetUnitSearch, fitToScreen, onClearFocus]);

  // If units reload after floor switch and targetUnitSearch is waiting to be zoomed, zoom once cleanly
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim() && units.length > 0) {
      const q = String(targetUnitSearch).trim();
      if (lastHandledSearchRef.current !== q) {
        const success = zoomAndPanToUnit(q);
        if (success) {
          lastHandledSearchRef.current = q;
        }
      }
    }
  }, [units, targetUnitSearch, zoomAndPanToUnit]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || 800,
          height: containerRef.current.offsetHeight || 600
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(() => {
        updateSize();
      });
      ro.observe(containerRef.current);
    }
    return () => {
      window.removeEventListener('resize', updateSize);
      if (ro) ro.disconnect();
    };
  }, []);

  // When print preview activates or deactivates, automatically fit floor plan to screen (strictly on print state transition)
  const prevPrintPreviewRef = useRef(isPrintPreview);
  useEffect(() => {
    if (prevPrintPreviewRef.current !== isPrintPreview) {
      prevPrintPreviewRef.current = isPrintPreview;
      const timer = setTimeout(() => {
        fitToScreen(false);
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isPrintPreview, fitToScreen]);

  // Handle browser native print events (Ctrl+P / window.print)
  useEffect(() => {
    const handleBeforePrint = () => {
      fitToScreen(false);
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, [fitToScreen]);

  // Listen to custom export-png window event (from hamburger menu)
  useEffect(() => {
    const handleExportPngEvent = () => {
      handleExport();
    };
    window.addEventListener('export-png', handleExportPngEvent);
    return () => window.removeEventListener('export-png', handleExportPngEvent);
  }, []);

  // Keep hoverInfo.data in sync with latest aggregatedData if projects update
  useEffect(() => {
    if (hoverInfo?.visible && hoverInfo.unitName) {
      const uName = hoverInfo.unitName.toLowerCase();
      const latestData = aggregatedData[uName];
      if (latestData && latestData !== hoverInfo.data) {
        setHoverInfo(prev => prev ? { ...prev, data: latestData } : null);
      }
    }
  }, [aggregatedData, hoverInfo?.visible, hoverInfo?.unitName]);

  // Re-anchor tooltip position when ProjectModal closes if it was kept open from comment button
  const prevIsProjectModalOpenRef = useRef(isProjectModalOpen);
  useEffect(() => {
    if (prevIsProjectModalOpenRef.current && !isProjectModalOpen) {
      if (hoverInfo?.visible && hoverInfo.clientX != null && hoverInfo.clientY != null) {
        updateTooltipPos(hoverInfo.clientX, hoverInfo.clientY);
      }
    }
    prevIsProjectModalOpenRef.current = isProjectModalOpen;
  }, [isProjectModalOpen, hoverInfo?.visible, hoverInfo?.clientX, hoverInfo?.clientY]);

  const handleExport = () => {
     if (!stageRef.current) return;
     const dataURL = stageRef.current.toDataURL({ pixelRatio: 2 });
     const link = document.createElement('a');
     link.download = `Thematic_Map_${new Date().toISOString().slice(0,10)}.png`;
     link.href = dataURL;
     document.body.appendChild(link);
     link.click();
     document.body.removeChild(link);
  };

  // Capped pixel ratio for silky smooth iOS GPU execution
  const pixelRatio = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;

  if (!version || !version.id) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/50 text-slate-400 p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/40 flex items-center justify-center mb-3 shadow-inner">
          <Layers className="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-80" />
        </div>
        <p className="text-base font-bold text-slate-700 dark:text-slate-200">
          Chưa có dữ liệu Layout cho {storeFilter} • {targetLoc} ({globalYearFilter || 'Tất cả năm'})
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-md leading-relaxed">
          Bộ lọc và dữ liệu mặt bằng đồng bộ trực tiếp theo các phiên bản tại tab Review. Hãy tạo hoặc gán phiên bản tại tab Picture Mapping để hiển thị tại đây.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 dark:bg-slate-950 overflow-hidden relative select-none [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] [background-size:20px_20px] print:bg-white print:bg-none print:p-0 print:m-0 print:border-none">
      
      {/* Clean High-Contrast Print Legend Overlay - Renders only on print & print preview */}
      <div className="hidden print:flex absolute bottom-4 left-4 z-30 bg-white/95 backdrop-blur-md px-3.5 py-2.5 rounded-xl border border-slate-300 shadow-md flex-col gap-1.5 min-w-[200px] max-w-xl pointer-events-none">
        <div className="flex items-center justify-between border-b border-slate-200 pb-1 gap-3">
          <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider">
            Chú thích / Legend
          </span>
          <span className="text-[10px] font-bold text-slate-600">
            {storeFilter} • {targetLoc} {version?.year ? `(${version.year})` : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {activeGroups.length > 0 ? (
            activeGroups.map((g: any) => (
              <div key={g.id} className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs border border-slate-400 shrink-0" style={{ backgroundColor: g.color }} />
                <span className="font-bold">{g.name}</span>
                {g.matchCount !== undefined && (
                  <span className="text-[10px] text-slate-500 font-mono">({g.matchCount})</span>
                )}
              </div>
            ))
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 border border-slate-400 shrink-0" />
                <span>Completed</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-blue-500 border border-slate-400 shrink-0" />
                <span>On Process</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-amber-500 border border-slate-400 shrink-0" />
                <span>Upcoming</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-800 text-[11px] font-semibold">
                <span className="w-3 h-3 rounded-xs bg-rose-500 border border-slate-400 shrink-0" />
                <span>Delay</span>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Floating Focus Unit Banner with Cancel / Exit Button */}
      {focusedUnitId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/95 dark:bg-slate-800/95 text-white px-3.5 py-1.5 rounded-full shadow-2xl border border-amber-400/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 hide-on-actual-print print:hidden">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
          <span className="text-xs font-bold text-amber-300">
            {units.find((u: any) => u.id === focusedUnitId)?.name || 'Gian hàng'}
          </span>
          <button
            type="button"
            onClick={() => {
              setFocusedUnitId(null);
              setHoverInfo(null);
              if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
              fitToScreen(true);
              onClearFocus?.();
            }}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-2 py-0.5 rounded-full transition-all ml-1 active:scale-95 touch-manipulation"
            title="Thoát chế độ phóng to"
          >
            <X className="w-3 h-3" />
            <span>Thoát zoom</span>
          </button>
        </div>
      )}

      {/* Floating Top-Left Controls: Location & Layout Version Switcher */}
      <div className="absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 flex items-center gap-1.5 sm:gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 py-1 sm:px-3 sm:py-1.5 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl max-w-[55%] sm:max-w-none hide-on-actual-print print:hidden">
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider whitespace-nowrap">
            {storeFilter} • {targetLoc}
          </span>
        </div>
        {locationVersions.length > 1 && (
          <>
            <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-[10px] font-semibold text-slate-400 uppercase hidden sm:inline">Version:</span>
              <select
                value={version?.id || ''}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-[10px] sm:text-xs font-semibold rounded-lg px-1.5 py-0.5 sm:px-2 sm:py-1 outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer max-w-[85px] sm:max-w-[180px] truncate"
                title="Select Layout Version"
              >
                {locationVersions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.id}{v.year ? ` • ${v.year}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {locationVersions.length <= 1 && version?.name && (
          <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-1.5 sm:pl-2 max-w-[80px] sm:max-w-[180px] truncate">
            {version.name}{version.year ? ` • ${version.year}` : ''}
          </span>
        )}
      </div>

      {/* Floating Top-Right Controls */}
      <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-20 flex items-center gap-0.5 sm:gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl hide-on-actual-print print:hidden">
        {totalFloorAlerts > 0 && (
          <button
            type="button"
            onClick={() => setFilterOnlyAlerts(prev => !prev)}
            className={cn(
              "flex items-center gap-1 px-1.5 py-1 sm:px-2 sm:py-1 rounded-lg text-[10px] sm:text-xs font-semibold transition-all active:scale-95 touch-manipulation border mr-0.5",
              filterOnlyAlerts
                ? "bg-red-500 text-white border-red-600 shadow-sm"
                : "bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-950/50 dark:hover:bg-red-900/60 dark:text-red-300 border-red-200 dark:border-red-900/60"
            )}
            title={filterOnlyAlerts ? "Filtering alert units (Click to show all)" : `Filter ${totalFloorAlerts} alert units`}
          >
            <Bell className={cn("w-3.5 h-3.5", filterOnlyAlerts ? "text-white animate-bounce" : "text-red-500")} />
            <span className="font-bold font-mono">{totalFloorAlerts}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            const stage = stageRef.current;
            if (!stage) return;
            const oldScale = stage.scaleX();
            const newScale = Math.min(oldScale * 1.3, 20);
            const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
            const mousePointTo = {
              x: (center.x - stage.x()) / oldScale,
              y: (center.y - stage.y()) / oldScale,
            };
            const newPos = {
              x: center.x - mousePointTo.x * newScale,
              y: center.y - mousePointTo.y * newScale,
            };
            stage.to({
              scaleX: newScale,
              scaleY: newScale,
              x: newPos.x,
              y: newPos.y,
              duration: 0.18,
              easing: Konva.Easings.EaseOut,
              onFinish: () => {
                setStageScale(newScale);
                setStagePos(newPos);
              }
            });
          }}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Zoom In"
        >
          <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            const stage = stageRef.current;
            if (!stage) return;
            const oldScale = stage.scaleX();
            const newScale = Math.max(oldScale / 1.3, 0.04);
            const center = { x: dimensions.width / 2, y: dimensions.height / 2 };
            const mousePointTo = {
              x: (center.x - stage.x()) / oldScale,
              y: (center.y - stage.y()) / oldScale,
            };
            const newPos = {
              x: center.x - mousePointTo.x * newScale,
              y: center.y - mousePointTo.y * newScale,
            };
            stage.to({
              scaleX: newScale,
              scaleY: newScale,
              x: newPos.x,
              y: newPos.y,
              duration: 0.18,
              easing: Konva.Easings.EaseOut,
              onFinish: () => {
                setStageScale(newScale);
                setStagePos(newPos);
              }
            });
          }}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Zoom Out"
        >
          <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <div className="px-1.5 py-0.5 text-[10px] sm:text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700 min-w-[34px] sm:min-w-[42px] text-center">
          {Math.round(stageScale * 100)}%
        </div>
        <button 
          type="button" 
          onClick={() => {
            fitToScreen(true);
          }}
          className="p-1 sm:p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Reset / Fit to Screen"
        >
          <Maximize2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>

      {/* iOS Floating Color Legend Bar - Hidden on mobile screens so it does not block the bottom floor plan */}
      {layoutTooltipVisibility?.legendColor !== false && (
        <div className="hidden sm:block absolute bottom-16 left-4 max-w-xl z-20 pointer-events-auto hide-on-actual-print print:hidden">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl p-2.5 transition-all">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="p-1 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <Palette className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Chú thích màu
                </span>
                {activeGroups.length > 0 && (
                  <span className="text-[10px] font-bold font-mono px-1.5 py-0.2 rounded-full bg-purple-50 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    {activeGroups.length} nhóm
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {selectedLegendGroupId && (
                  <button
                    onClick={() => setSelectedLegendGroupId(null)}
                    className="text-[10px] font-bold text-purple-600 dark:text-purple-400 hover:underline px-1.5 py-0.5"
                  >
                    Bỏ lọc
                  </button>
                )}
                <button
                  onClick={() => setShowLegendModal(true)}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Bảng đầy đủ
                </button>
                <button
                  onClick={() => setIsLegendStripCollapsed(!isLegendStripCollapsed)}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title={isLegendStripCollapsed ? "Mở rộng" : "Thu gọn"}
                >
                  {isLegendStripCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Swatches List */}
            {!isLegendStripCollapsed && (
              <div className="pt-2">
                {activeGroups.length === 0 ? (
                  <div className="flex items-center gap-2 overflow-x-auto py-0.5 text-xs" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-[11px] font-medium whitespace-nowrap">Completed</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                      <span className="text-[11px] font-medium whitespace-nowrap">On Process</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                      <span className="text-[11px] font-medium whitespace-nowrap">Upcoming</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                      <span className="text-[11px] font-medium whitespace-nowrap">Delay</span>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="flex items-center gap-1.5 overflow-x-auto pb-0.5 touch-pan-x"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    {activeGroups.map((g: any) => {
                      const isSelected = selectedLegendGroupId === g.id;
                      return (
                        <button
                          key={g.id}
                          onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border ${
                            isSelected
                              ? 'bg-purple-100 dark:bg-purple-950 border-purple-400 text-purple-900 dark:text-purple-100 shadow-sm scale-105'
                              : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                          title={`Bấm để ${isSelected ? 'bỏ lọc' : 'lọc & highlight'} nhóm ${g.name}`}
                        >
                          <span 
                            className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-black/15" 
                            style={{ backgroundColor: g.color }}
                          />
                          <span className="whitespace-nowrap font-medium text-[11px] sm:text-xs">
                            {g.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {g.matchCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Action Buttons */}
      <div className={`absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 transition-all duration-150 hide-on-actual-print print:hidden ${hoverInfo?.visible ? 'max-sm:opacity-0 max-sm:pointer-events-none' : 'opacity-100'}`}>
        <button 
          onClick={() => setShowLegendModal(true)} 
          className={cn(
            "flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 backdrop-blur-md border shadow-xl rounded-full text-xs font-bold active:scale-95 touch-manipulation transition-all whitespace-nowrap",
            layoutTooltipVisibility?.legendColor !== false
              ? "bg-purple-600 hover:bg-purple-700 text-white border-purple-500"
              : "bg-slate-700/90 hover:bg-slate-800 text-slate-200 border-slate-600"
          )}
        >
          <Palette className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> 
          <span>Chú thích màu</span>
          {layoutTooltipVisibility?.legendColor !== false && activeGroups.length > 0 && (
            <span className="bg-white/25 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
              {activeGroups.length}
            </span>
          )}
          {layoutTooltipVisibility?.legendColor === false && (
            <span className="bg-black/30 px-1.5 py-0.2 rounded-full text-[9px] font-medium text-slate-300">
              Tắt
            </span>
          )}
        </button>
      </div>

      {/* Full Color Legend Modal / Drawer (iOS friendly) */}
      {showLegendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150 hide-on-actual-print print:hidden">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
                <Palette className="w-5 h-5 text-purple-600" />
                Bảng Chú Thích Màu (Color Legend)
              </div>
              <button 
                onClick={() => setShowLegendModal(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Groups Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                  Nhóm Phân Loại Đang Áp Dụng ({activeGroups.length})
                </div>
                {selectedLegendGroupId && (
                  <button
                    onClick={() => setSelectedLegendGroupId(null)}
                    className="text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium"
                  >
                    Bỏ lọc nhóm
                  </button>
                )}
              </div>

              {activeGroups.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 text-center">
                  Bản đồ hiện đang hiển thị màu theo trạng thái tiến độ dự án hoặc chưa có nhóm phân loại.
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {activeGroups.map((g: any) => {
                    const isSelected = selectedLegendGroupId === g.id;
                    return (
                      <div 
                        key={g.id}
                        onClick={() => setSelectedLegendGroupId(isSelected ? null : g.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 shadow-sm'
                            : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2.5">
                            <div 
                              className="w-4 h-4 rounded-full shadow-sm border border-black/15 shrink-0" 
                              style={{ backgroundColor: g.color }} 
                            />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                              {g.name}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                            {g.matchCount} gian hàng
                          </span>
                        </div>

                        {g.matchedUnits && g.matchedUnits.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {g.matchedUnits.slice(0, 15).map((u: any) => (
                              <span 
                                key={u.id}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                              >
                                {u.name}
                              </span>
                            ))}
                            {g.matchedUnits.length > 15 && (
                              <span className="text-[10px] text-slate-400 self-center">
                                +{g.matchedUnits.length - 15} nữa...
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Project Status Legend Section */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                Quy Chuẩn Màu Trạng Thái Dự Án (Project Status)
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Completed</div>
                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Đã hoàn thành</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50">
                  <div className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-blue-800 dark:text-blue-300">On Process</div>
                    <div className="text-[10px] text-blue-600 dark:text-blue-400">Đang thi công</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                  <div className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-amber-800 dark:text-amber-300">Upcoming</div>
                    <div className="text-[10px] text-amber-600 dark:text-amber-400">Sắp diễn ra</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50">
                  <div className="w-3 h-3 rounded-full bg-rose-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-rose-800 dark:text-rose-300">Delay</div>
                    <div className="text-[10px] text-rose-600 dark:text-rose-400">Chậm tiến độ</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowLegendModal(false)}
                className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Edit Mode Drawer / Modal */}
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150 hide-on-actual-print print:hidden">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
                <SlidersHorizontal className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                Edit Mode
              </div>
              <button 
                onClick={() => setShowMenu(false)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Unit / Brand / Project..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Smart Notifications & Alerts Config */}
            <div className="space-y-2 p-3 bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-red-600 dark:text-red-400 tracking-wider">
                  <Bell className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  <span>Smart Notifications & Alerts</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLayoutTooltipVisibility({
                        notifications: true,
                        alertOverdue: true,
                        alertDelay: true,
                        alertHandover: true,
                        alertOpening: true,
                      });
                    }}
                    className="text-[10px] text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer"
                  >
                    Enable All
                  </button>
                  <span className="text-red-200 dark:text-red-800">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      setLayoutTooltipVisibility({
                        notifications: false,
                        alertOverdue: false,
                        alertDelay: false,
                        alertHandover: false,
                        alertOpening: false,
                      });
                    }}
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                  >
                    Disable All
                  </button>
                </div>
              </div>

              {/* Notification Toggle Items Grid */}
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'notifications', label: 'All Alert Badges', desc: 'Master alert switch' },
                  { key: 'alertOverdue', label: 'Overdue Tasks', desc: 'Past due unfinished tasks' },
                  { key: 'alertDelay', label: 'Project Delay', desc: 'Late / delayed status' },
                  { key: 'alertHandover', label: 'Handover Notice', desc: 'Handover within 3 days' },
                  { key: 'alertOpening', label: 'Opening Notice', desc: 'Opening within 3 days' },
                ].map((item) => {
                  const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setLayoutTooltipVisibility((prev) => ({
                          ...prev,
                          [item.key]: !isActive,
                        }));
                      }}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-xl border text-left transition-all active:scale-95 touch-manipulation cursor-pointer",
                        isActive
                          ? "bg-red-500/10 dark:bg-red-950/40 border-red-300 dark:border-red-800/80 text-red-900 dark:text-red-200 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate leading-tight">
                          {item.label}
                        </div>
                        <div className="text-[9px] opacity-75 truncate">
                          {item.desc}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1.5 transition-colors",
                          isActive
                            ? "bg-red-600 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-transparent"
                        )}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Labels Appear / Tooltip Visibility Config */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Display & Tooltip Fields</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setLayoutTooltipVisibility({
                        projectCode: true,
                        projectName: true,
                        mdStatus: true,
                        actStatus: true,
                        legendColor: true,
                        floor: true,
                        startDate: true,
                        endDate: true,
                        detail: true,
                        description: true,
                        progressBars: true,
                        area: true,
                      });
                    }}
                    className="text-[10px] text-purple-600 dark:text-purple-400 hover:underline font-semibold cursor-pointer"
                  >
                    Enable All
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button
                    type="button"
                    onClick={() => resetLayoutTooltipVisibility()}
                    className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium cursor-pointer"
                  >
                    Default
                  </button>
                </div>
              </div>

              {/* Toggle Items Grid */}
              <div className="grid grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {[
                  { key: 'projectCode', label: 'Project Code', desc: 'Unit / Project ID' },
                  { key: 'projectName', label: 'Project Name', desc: 'Brand / Tenant Name' },
                  { key: 'mdStatus', label: 'MD Status', desc: 'Merchandising status' },
                  { key: 'actStatus', label: 'AC Status', desc: 'Fit-out actual status' },
                  { key: 'legendColor', label: 'Legend Color', desc: 'Unit & Tooltip color' },
                  { key: 'floor', label: 'Floor / Store', desc: 'Location & Store level' },
                  { key: 'startDate', label: 'Start Date', desc: 'Planned start date' },
                  { key: 'endDate', label: 'End Date', desc: 'Planned end date' },
                  { key: 'detail', label: 'Detail', desc: 'Work breakdown summary' },
                  { key: 'description', label: 'Description', desc: 'Notes & Descriptions' },
                  { key: 'progressBars', label: 'Progress Bars', desc: 'Plan & Actual progress' },
                  { key: 'area', label: 'Area (m²)', desc: 'Floor surface area' },
                ].map((item) => {
                  const isActive = (layoutTooltipVisibility as any)?.[item.key] !== false;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setLayoutTooltipVisibility((prev) => ({
                          ...prev,
                          [item.key]: !isActive,
                        }));
                      }}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-xl border text-left transition-all active:scale-95 touch-manipulation cursor-pointer",
                        isActive
                          ? "bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800/80 text-purple-900 dark:text-purple-200 shadow-xs"
                          : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-400 dark:text-slate-500 opacity-60 hover:opacity-100"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold truncate leading-tight">
                          {item.label}
                        </div>
                        <div className="text-[9px] opacity-75 truncate">
                          {item.desc}
                        </div>
                      </div>
                      <div
                        className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center shrink-0 ml-1.5 transition-colors",
                          isActive
                            ? "bg-purple-600 text-white"
                            : "bg-slate-200 dark:bg-slate-700 text-transparent"
                        )}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800">
              {canWrite && (
                <button 
                  onClick={handleTriggerExport}
                  disabled={isExporting}
                  title="Automatically: Step 1 Apply all rules Dynamic -> Step 2 Save Cloud R2"
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
                  {isExporting ? (exportStatus || 'Processing...') : 'Trigger Export (Apply Rules & Cloud)'}
                </button>
              )}
              
              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => {
                    setShowMenu(false);
                    setIsPrintPreview(!isPrintPreview);
                  }}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm active:scale-95 touch-manipulation"
                >
                  <Printer className="w-4 h-4" /> Print Preview
                </button>
                <button 
                  onClick={handleExport}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm active:scale-95 touch-manipulation"
                >
                  <Download className="w-4 h-4" /> Export HD Image
                </button>
                {canWrite && (
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      onOpenR2Config();
                    }}
                    className="col-span-2 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700 active:scale-95 touch-manipulation"
                  >
                    <Settings className="w-4 h-4" /> R2 Storage Config
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoverInfo && hoverInfo.visible && (
        <div className="hide-on-actual-print print:hidden">
          <LayoutUnitTooltip
            hoverInfo={hoverInfo}
            tooltipRef={tooltipRef}
            containerRef={containerRef}
            onClose={() => {
              isPinnedRef.current = false;
              setHoverInfo(null);
              if (focusedUnitId) {
                setFocusedUnitId(null);
                if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
                fitToScreen(true);
                onClearFocus?.();
              }
            }}
            onEditProject={(project, isReadOnly, tab) => {
              if (tab === 'chat') {
                isPinnedRef.current = true;
                // Giữ lại tooltip khi mở comment: khi người dùng đóng modal comment thì tooltip vẫn tiếp tục hiển thị
              } else {
                isPinnedRef.current = false;
                setHoverInfo(null);
              }
              setEditingProject(project);
              setModalInitialTab(tab || 'details');
              setIsProjectModalOpen(true);
            }}
            canWrite={canWrite}
            storeFilter={storeFilter}
          />
        </div>
      )}

      {/* Canvas Viewport */}
      <div 
        id="live-layout-canvas-container"
        ref={containerRef} 
        className="flex-grow w-full h-full relative cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <Stage 
            ref={stageRef} 
            width={dimensions.width} 
            height={dimensions.height}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            pixelRatio={pixelRatio}
            draggable
            style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
            onDragStart={() => {
              isInteractingRef.current = true;
              setHoverInfo(null);
            }}
            onDragEnd={(e) => {
              isInteractingRef.current = false;
              setStagePos({ x: e.target.x(), y: e.target.y() });
            }}
            onClick={(e) => {
              if (e.target === stageRef.current) {
                isPinnedRef.current = false;
                setHoverInfo(null);
              }
            }}
            onTap={(e) => {
              if (e.target === stageRef.current) {
                isPinnedRef.current = false;
                setHoverInfo(null);
              }
            }}
            onDblClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const pointer = stage.getPointerPosition();
              if (!pointer) return;
              const oldScale = stage.scaleX();
              const newScale = oldScale > 2.5 ? Math.max(0.1, oldScale / 2.2) : Math.min(20, oldScale * 2.2);
              const mousePointTo = {
                x: (pointer.x - stage.x()) / oldScale,
                y: (pointer.y - stage.y()) / oldScale,
              };
              const newPos = {
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
              };
              stage.to({
                scaleX: newScale,
                scaleY: newScale,
                x: newPos.x,
                y: newPos.y,
                duration: 0.22,
                easing: Konva.Easings.EaseOut,
                onFinish: () => {
                  setStageScale(newScale);
                  setStagePos(newPos);
                }
              });
            }}
            onTouchStart={(e) => {
              if (e.evt.touches.length === 2) {
                const touch1 = e.evt.touches[0];
                const touch2 = e.evt.touches[1];
                const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                const center = {
                  x: (touch1.clientX + touch2.clientX) / 2,
                  y: (touch1.clientY + touch2.clientY) / 2,
                };
                touchStateRef.current = { lastDist: dist, lastCenter: center, lastTap: 0 };
                const stage = stageRef.current;
                if (stage) stage.draggable(false);
                isInteractingRef.current = true;
                setHoverInfo(null);
              } else if (e.evt.touches.length === 1) {
                const now = Date.now();
                if (now - touchStateRef.current.lastTap < 300) {
                  fitToScreen(true);
                  touchStateRef.current.lastTap = 0;
                } else {
                  touchStateRef.current.lastTap = now;
                }
              }
            }}
            onTouchMove={(e) => {
              if (e.evt.touches.length === 2) {
                e.evt.preventDefault();
                const touch1 = e.evt.touches[0];
                const touch2 = e.evt.touches[1];
                const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);
                const center = {
                  x: (touch1.clientX + touch2.clientX) / 2,
                  y: (touch1.clientY + touch2.clientY) / 2,
                };
                const { lastDist, lastCenter } = touchStateRef.current;
                const stage = stageRef.current;
                if (stage && lastDist > 0 && lastCenter) {
                  const oldScale = stage.scaleX();
                  const scaleDelta = dist / lastDist;
                  const newScale = Math.max(0.04, Math.min(oldScale * scaleDelta, 20));
                  
                  const stageBox = stage.container().getBoundingClientRect();
                  const lastPointerX = lastCenter.x - stageBox.left;
                  const lastPointerY = lastCenter.y - stageBox.top;
                  const currentPointerX = center.x - stageBox.left;
                  const currentPointerY = center.y - stageBox.top;

                  const worldPointX = (lastPointerX - stage.x()) / oldScale;
                  const worldPointY = (lastPointerY - stage.y()) / oldScale;

                  const newPos = {
                    x: currentPointerX - worldPointX * newScale,
                    y: currentPointerY - worldPointY * newScale,
                  };

                  stage.scale({ x: newScale, y: newScale });
                  stage.position(newPos);
                  stage.batchDraw();

                  touchStateRef.current.lastDist = dist;
                  touchStateRef.current.lastCenter = center;
                }
              }
            }}
            onTouchEnd={() => {
              touchStateRef.current.lastDist = 0;
              touchStateRef.current.lastCenter = null;
              const stage = stageRef.current;
              if (stage) {
                stage.draggable(true);
                setStageScale(stage.scaleX());
                setStagePos({ x: stage.x(), y: stage.y() });
              }
              isInteractingRef.current = false;
            }}
            onWheel={(e) => {
              e.evt.preventDefault();
              const stage = stageRef.current;
              if (!stage) return;
              
              isInteractingRef.current = true;
              setHoverInfo(null);

              const pointer = stage.getPointerPosition();
              if (!pointer) return;

              lastWheelPointerRef.current = pointer;
              pendingWheelDeltaRef.current += e.evt.deltaY;

              if (rafWheelIdRef.current === null) {
                rafWheelIdRef.current = requestAnimationFrame(() => {
                  rafWheelIdRef.current = null;
                  const currentStage = stageRef.current;
                  const ptr = lastWheelPointerRef.current;
                  if (!currentStage || !ptr) return;

                  const deltaY = pendingWheelDeltaRef.current;
                  pendingWheelDeltaRef.current = 0;

                  const oldScale = currentStage.scaleX();
                  // Smooth exponential zoom curve
                  const zoomFactor = Math.exp(-deltaY * 0.002);
                  const newScale = Math.max(0.04, Math.min(oldScale * zoomFactor, 20));

                  const mousePointTo = {
                    x: (ptr.x - currentStage.x()) / oldScale,
                    y: (ptr.y - currentStage.y()) / oldScale,
                  };

                  const newPos = {
                    x: ptr.x - mousePointTo.x * newScale,
                    y: ptr.y - mousePointTo.y * newScale,
                  };

                  currentStage.scale({ x: newScale, y: newScale });
                  currentStage.position(newPos);
                  currentStage.batchDraw();

                  // Debounce React state updates to prevent re-rendering during wheel gestures
                  if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
                  wheelTimeoutRef.current = setTimeout(() => {
                    setStageScale(currentStage.scaleX());
                    setStagePos({ x: currentStage.x(), y: currentStage.y() });
                    isInteractingRef.current = false;
                  }, 120);
                });
              }
            }}
        >
          {/* Static FastLayer for background CAD layout image to bypass hit-graph calculations */}
          <FastLayer listening={false}>
            {bgImage && (
              <KonvaImage
                image={bgImage}
                listening={false}
                perfectDrawEnabled={false}
                x={version.imagePos?.x || 0}
                y={version.imagePos?.y || 0}
                scaleX={version.imageScale || 1}
                scaleY={version.imageScale || 1}
                rotation={version.backgroundRotation || 0}
              />
            )}
          </FastLayer>

          {/* Dynamic Layer for interactive unit shapes and tooltips */}
          <Layer>
            {displayedUnits.map((unit: any) => {
               const isLegendColorOn = layoutTooltipVisibility?.legendColor !== false;
               const isDarkMode = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
               const hasColor = Boolean(unit.targetColor);
               const fillColor = isLegendColorOn && hasColor ? unit.targetColor : "rgba(0, 0, 0, 0.001)";
               const isFocused = focusedUnitId === unit.id;
               const isDimmed = isLegendColorOn && hasColor && selectedLegendGroupId !== null && unit.targetGroupId !== selectedLegendGroupId;
               const contrast = isLegendColorOn && hasColor 
                 ? getContrastStyle(fillColor) 
                 : { text: isDarkMode ? '#f8fafc' : '#0f172a', shapeStroke: isDarkMode ? '#64748b' : '#94a3b8' };
               
               const displayOpacity = !isLegendColorOn || !hasColor
                 ? (isFocused ? 1.0 : 0.9)
                 : (isFocused 
                     ? 1.0 
                     : isDimmed 
                     ? 0.2 
                     : Math.max(0.82, unit.targetOpacity ?? 0.85));
               
               const commonProps = {
                  id: unit.id,
                  fill: fillColor,
                  opacity: displayOpacity,
                  stroke: isFocused ? '#f59e0b' : (isDimmed ? '#94a3b8' : contrast.shapeStroke),
                  strokeWidth: isFocused ? 3 : 1.5,
                  strokeScaleEnabled: false,
                  perfectDrawEnabled: false,
                  shadowColor: isFocused ? '#f59e0b' : '#000000',
                  shadowBlur: isFocused ? 16 : 0,
                  shadowOpacity: isFocused ? 0.9 : 0,
                  x: unit.x || 0,
                  y: unit.y || 0,
                  rotation: unit.rotation || 0,
                  onMouseEnter: (e: any) => {
                     if (isInteractingRef.current || isPinnedRef.current) return;
                     try {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown',
                           clientX: e.evt.clientX,
                           clientY: e.evt.clientY
                        });
                        setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                     } catch (err) {
                        console.error("Defensive Check: Error onMouseEnter unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onMouseMove: (e: any) => {
                     if (isInteractingRef.current || isPinnedRef.current) return;
                     try {
                        updateTooltipPos(e.evt.clientX, e.evt.clientY);
                     } catch (err) {
                        console.error("Defensive Check: Error onMouseMove unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onMouseLeave: (e: any) => {
                     try {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'grab';
                        if (isPinnedRef.current) return;
                        setHoverInfo(null);
                     } catch (err) {
                        console.error("Defensive Check: Error onMouseLeave unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onClick: (e: any) => {
                     if (isInteractingRef.current) return;
                     try {
                        isPinnedRef.current = true;
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown',
                           clientX: e.evt.clientX,
                           clientY: e.evt.clientY
                        });
                        setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                     } catch (err) {
                        console.error("Defensive Check: Error onClick unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onTap: (e: any) => {
                     if (isInteractingRef.current) return;
                     try {
                        isPinnedRef.current = true;
                        const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                        const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown',
                           clientX,
                           clientY
                        });
                        setTimeout(() => updateTooltipPos(clientX, clientY), 0);
                     } catch (err) {
                        console.error("Defensive Check: Error onTap unit in LiveLayoutViewer:", err, unit);
                     }
                  }
               };

               // Calculated font size for optimal legibility
               const unitW = unit.textWidth || 100;
               const unitH = unit.textHeight || 30;
               const baseFont = Math.max(10, Math.min(18, Math.round(Math.min(unitW, unitH * 2.2) / 5.5)));
               const currentZoom = stageScale || 1;
               const dynamicFontSize = Math.max(9, Math.min(22, baseFont / Math.max(0.65, Math.min(currentZoom, 1.8))));

               // Badge placement coordinates
               let badgeX = (unit.textX || unit.x || 0) + (unit.textWidth || unit.width || 100) - 2;
               let badgeY = (unit.textY || unit.y || 0) + 2;
               if (unit.type === 'circle') {
                 const r = unit.radius || 20;
                 badgeX = (unit.x || 0) + r * 0.7;
                 badgeY = (unit.y || 0) - r * 0.7;
               }
               const uName = (unit.name || '').toLowerCase();
               const unitData = (uName && aggregatedData[uName]) ? aggregatedData[uName] : null;
               const hasAlert = Boolean(unitData?.alerts?.hasAlert);
               const badgeRadius = Math.max(4.5, Math.min(8.5, 6.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));
               const badgeFontSize = Math.max(6.5, Math.min(10.5, 8.5 / Math.sqrt(Math.max(0.4, stageScale || 1))));

               return (
                 <React.Fragment key={unit.id}>
                    {unit.type === 'rect' && (
                       <Rect {...commonProps} width={unit.width} height={unit.height} cornerRadius={4} />
                    )}
                    {unit.type === 'circle' && (
                       <Circle {...commonProps} radius={unit.radius} />
                    )}
                    {unit.type === 'polygon' && unit.points && (
                       <Line {...commonProps} points={unit.points} closed={true} />
                    )}

                    {/* Focused Unit Golden Ring Indicator */}
                    {isFocused && (
                       <Rect
                          x={(unit.textX || unit.x || 0) - 4}
                          y={(unit.textY || unit.y || 0) - 4}
                          width={(unit.textWidth || unit.width || 100) + 8}
                          height={(unit.textHeight || unit.height || 40) + 8}
                          stroke="#f59e0b"
                          strokeWidth={2.5}
                          strokeScaleEnabled={false}
                          dash={[6, 4]}
                          cornerRadius={6}
                          listening={false}
                       />
                    )}

                    {unit.name && (stageScale || 1) > 0.08 && (
                       <Text 
                          text={unit.name}
                          x={unit.textX}
                          y={unit.textY}
                          width={unit.textWidth}
                          height={unit.textHeight}
                          rotation={unit.rotation || 0}
                          align="center"
                          verticalAlign="middle"
                          fontSize={dynamicFontSize}
                          fontStyle="bold"
                          fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                          fill={contrast.text}
                          strokeScaleEnabled={false}
                          perfectDrawEnabled={false}
                          wrap="none"
                          ellipsis={true}
                          listening={false}
                       />
                    )}

                    {/* Smart Alert Badge (Rendered ONLY when unit has real critical/warning alerts) */}
                    {hasAlert && unitData?.alerts && (stageScale || 1) > 0.08 && (
                       <Group x={badgeX} y={badgeY} listening={false}>
                          <Circle
                             radius={badgeRadius}
                             fill={unitData.alerts.level === 'critical' ? '#ef4444' : '#f59e0b'}
                             stroke="#ffffff"
                             strokeWidth={Math.max(1, 1.5 / Math.sqrt(Math.max(0.4, stageScale || 1)))}
                             strokeScaleEnabled={false}
                             perfectDrawEnabled={false}
                             shadowColor="#000000"
                             shadowBlur={3}
                             shadowOpacity={0.35}
                          />
                          <Text
                             text={unitData.alerts.count > 1 ? String(unitData.alerts.count) : '!'}
                             x={-badgeRadius}
                             y={-badgeRadius + 0.5}
                             width={badgeRadius * 2}
                             height={badgeRadius * 2}
                             align="center"
                             verticalAlign="middle"
                             fontSize={badgeFontSize}
                             fontStyle="bold"
                             fill="#ffffff"
                             fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                             strokeScaleEnabled={false}
                             perfectDrawEnabled={false}
                          />
                       </Group>
                    )}
                 </React.Fragment>
               );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
