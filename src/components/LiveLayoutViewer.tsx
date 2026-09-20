import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Konva from 'konva';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Line, Text, Group } from 'react-konva';
import { useAppStore } from '../store/useAppStore';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RefreshCw, Download, Layers, Settings, Key, X, Cloud, Search, ZoomIn, ZoomOut, Maximize2, FolderOutput, Menu, Palette, ChevronDown, ChevronUp, Check, Info } from 'lucide-react';
import useImage from 'use-image';
import { useSummaryData } from './PictureMapping/lib/summaryData';
import { extractR2Key } from './PictureMapping/lib/r2Upload';
import { getStatus, enrichProjects, formatDisplayDateTime } from '../lib/utils';
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
  const { r2Config, setR2Config, currentUser, permissionMatrix, globalYearFilter } = useAppStore();
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
      const accountId = r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim();
      const accessKeyId = r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
      const secretAccessKey = r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
      const bucketName = r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim();

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        initFormFromStorage();
        throw new Error('Chưa cấu hình R2 Cloudflare trên hệ thống. Vui lòng bấm "Cấu hình R2" bên dưới hoặc vào Tab Picture Mapping để kết nối Cloud Sync.');
      }

      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: 'mapping_config.json'
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error('Không tìm thấy file cấu hình trên Cloud (mapping_config.json). Vui lòng kiểm tra lại Bucket hoặc xuất bản vẽ trước.');
      
      const data = await res.json();
      
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
          await Promise.all(resolvePromises);
          setConfig(data);
          try {
            useDataStore.getState().setLoadedCloudData(data);
          } catch (e) {
            console.warn('Could not sync loaded cloud data to store', e);
          }
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
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-500">
        <RefreshCw className="w-6 h-6 animate-spin mb-2" />
        <p className="text-sm font-medium">Đang tải cấu hình Bản đồ Chuyên đề (Thematic Map)...</p>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-amber-600 p-4">
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
  const { currentUser, permissionMatrix, globalYearFilter } = useAppStore();
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
              versionsMap.set(v.id, { ...existing, ...v, location: v.location || existing.location || key.split('_')[1] });
            }
          });
        }
      });
    }

    // From cloud config root versions
    if (Array.isArray(config?.versions)) {
      config.versions.forEach((v: any) => {
        if (v?.id) {
          const existing = versionsMap.get(v.id) || {};
          versionsMap.set(v.id, { ...existing, ...v });
        }
      });
    }

    return Array.from(versionsMap.values());
  }, [getAllStoreVersions, storeFilter, localStoreLocationData, config]);

  // 2. Filter versions specific to targetLoc (e.g. L2)
  const locationVersions = useMemo(() => {
    if (availableStoreVersions.length === 0) return [];
    
    const tLoc = targetLoc.toUpperCase().trim();
    const matched = availableStoreVersions.filter(v => {
      const vLoc = (v.location || '').toUpperCase().trim();
      const vName = (v.name || '').toUpperCase().trim();
      return vLoc === tLoc || vName.includes(tLoc) || vName.startsWith(`PM-${tLoc}`) || vName.startsWith(tLoc);
    });

    return matched.length > 0 ? matched : availableStoreVersions;
  }, [availableStoreVersions, targetLoc]);

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

    // Pick version: check selectedVersionId first, then partition.activeMapVersionId, then matching location versions
    let v: any = null;
    if (selectedVersionId && locationVersions.some(lv => lv.id === selectedVersionId)) {
      v = locationVersions.find(lv => lv.id === selectedVersionId);
    } else if (partition?.activeMapVersionId) {
      v = locationVersions.find(lv => lv.id === partition.activeMapVersionId) ||
          availableStoreVersions.find(av => av.id === partition.activeMapVersionId);
    }

    if (!v) {
      // Prioritize version for this floor with dynamic rules or groups
      v = locationVersions.find(lv => lv.isDynamicActive !== false && Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions.find(lv => Array.isArray(lv.groups) && lv.groups.length > 0) ||
          locationVersions[0] ||
          partition?.mapVersions?.[0] ||
          config?.version || {};
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

    // 1. From config.storeLocationData across ALL partitions
    if (config?.storeLocationData) {
      Object.entries(config.storeLocationData).forEach(([key, part]: [string, any]) => {
        if (storeFilter === 'all' || key.startsWith(`${storeFilter}_`)) {
          const loc = key.split('_')[1] || '';
          if (Array.isArray(part?.mapUnits)) {
            part.mapUnits.forEach((u: any) => {
              if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
                const existing = unitsMap.get(u.id) || {};
                unitsMap.set(u.id, { ...existing, ...u, location: u.location || existing.location || loc });
              }
            });
          }
        }
      });
    }

    // 2. From config.mapUnits (root-level drawn shapes)
    if (Array.isArray(config?.mapUnits)) {
      config.mapUnits.forEach((u: any) => {
        if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
          const existing = unitsMap.get(u.id) || {};
          unitsMap.set(u.id, { ...existing, ...u, location: u.location || existing.location || targetLoc });
        }
      });
    }

    // 3. From local in-memory storeLocationData across all partitions
    if (localStoreLocationData) {
      Object.entries(localStoreLocationData).forEach(([key, part]: [string, any]) => {
        if (storeFilter === 'all' || key.startsWith(`${storeFilter}_`)) {
          const loc = key.split('_')[1] || '';
          if (Array.isArray(part?.mapUnits)) {
            part.mapUnits.forEach((u: any) => {
              if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
                const existing = unitsMap.get(u.id) || {};
                unitsMap.set(u.id, { ...existing, ...u, location: u.location || existing.location || loc });
              }
            });
          }
        }
      });
    }

    // 4. From current active in-memory partition
    if (Array.isArray(localMapUnits)) {
      localMapUnits.forEach((u: any) => {
        if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
          const existing = unitsMap.get(u.id) || {};
          unitsMap.set(u.id, { ...existing, ...u, location: u.location || existing.location || targetLoc });
        }
      });
    }

    // 5. From global store helper
    try {
      const targetStoreParam = (storeFilter === 'HN' ? 'HN' : 'HCM');
      const storeUnits = getAllStoreUnits(targetStoreParam);
      if (Array.isArray(storeUnits)) {
        storeUnits.forEach((u: any) => {
          if (u?.id && (u?.type || u?.points || (u?.width && u?.height))) {
            const existing = unitsMap.get(u.id) || {};
            unitsMap.set(u.id, { ...existing, ...u, location: u.location || existing.location || targetLoc });
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

    // 7. Filter units for finalVersion: include mapped units or units matching this floor
    const finalUnitsList = Array.from(unitsMap.values()).filter((u: any) => {
      // If mapped in this version's groups, ALWAYS include
      if (mappedUnitIds.has(String(u.id))) return true;

      // If unit has location matching this floor or version
      const uLoc = (u.location || '').toUpperCase().trim();
      if (uLoc && (uLoc === vLoc || uLoc === tLoc || vLoc.includes(uLoc) || uLoc.includes(vLoc))) return true;

      // Fallback: if no location info, include
      if (!uLoc && !vLoc) return true;

      return false;
    });

    // 8. Fallback to config.units if no drawn shapes found at all
    if (finalUnitsList.length === 0 && Array.isArray(config?.units)) {
      config.units.forEach((u: any) => {
        if (u?.id) unitsMap.set(u.id, { ...u, location: u.location || targetLoc });
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
  const [bgImage] = useImage(version.backgroundUrl || '', 'anonymous');
  
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoverInfo, setHoverInfo] = useState<{ visible: boolean; data: any; unitName: string } | null>(null);
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [showMenu, setShowMenu] = useState(false);
  const [showLegendModal, setShowLegendModal] = useState(false);
  const [isLegendStripCollapsed, setIsLegendStripCollapsed] = useState(false);
  const [selectedLegendGroupId, setSelectedLegendGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedUnitId, setFocusedUnitId] = useState<string | null>(null);
  const focusedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
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
      setExportStatus('Bước 1/3: Đang tải dữ liệu từ Cloudflare R2...');
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
      const imgNaturalW = bgImage.naturalWidth || bgImage.width || 1000;
      const imgNaturalH = bgImage.naturalHeight || bgImage.height || 800;
      const imgScale = version.imageScale || 1;
      contentW = imgNaturalW * imgScale;
      contentH = imgNaturalH * imgScale;
      contentX = version.imagePos?.x || 0;
      contentY = version.imagePos?.y || 0;
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

  // Trigger fitToScreen when background image or partition version changes
  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  // 1. Get real-time projects and Excel summary data
  const projects = useAppStore(state => state.projects);
  const tasks = useAppStore(state => state.tasks);
  const summaryData = useSummaryData();

  // 2. Build aggregatedData
  const aggregatedData = useMemo(() => {
    const dataMap: Record<string, any> = {};
    
    units.forEach((u: any) => {
      const uName = (u?.name || '').toLowerCase();
      if (!uName) return;
      dataMap[uName] = {
        name: u.name || '',
        id: u.id,
        unit: u.name || '',
        size: 0, sales: 0, salesByCp: 0, salesByHcmcate: 0,
        profit: 0, profitByCp: 0, profitByHcmcate: 0,
        margin: 0, marginByCp: 0, hcmSalesEffi: 0, hcmMargin: 0,
        mdStatus: "", task: "", projectStatus: "", actStatus: "",
        endDate: "", status: "", vendorCode: "",
        brandCode: "", brandName: "", classCode: "", floor: u.location || locationFilter || "",
        appProjectStatus: "", appProjectBudget: 0, appProjectActual: 0, appProjectCode: "", projectName: "", startDate: "", handoverDate: "", openingDate: "", detail: "", party: ""
      };
    });

    summaryData.forEach((sumData) => {
      const key = sumData.unit?.toLowerCase();
      if (key && dataMap[key]) {
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

    const enrichedProjects = enrichProjects(projects, tasks);
    const now = new Date();
    enrichedProjects.forEach((p) => {
      if (!p.code) return;
      if (storeFilter !== 'all' && p.store && String(p.store).trim().toUpperCase() !== String(storeFilter).trim().toUpperCase()) return;
      const pCodes = String(p.code || '').split(/[+;,/]/).map(c => c.trim().toLowerCase()).filter(Boolean);
      const status = getStatus(p.computedTakStart || p.start, p.computedTakCompl || p.handover, p.computedOpening || p.opening, p.code);
      
      // Match tasks directly from Zustand tasks store for real-time subtasks without Firestore reads
      const matchedTasks = tasks.filter(t => {
        if (!t || !t.name) return false;
        const tCode = String(t.projectCode || '').trim().toLowerCase();
        if (pCodes.includes(tCode)) return true;
        if (p.code && tCode === String(p.code).trim().toLowerCase()) return true;
        return false;
      });

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

      pCodes.forEach(code => {
         if (dataMap[code]) {
            dataMap[code].appProjectStatus = status;
            dataMap[code].appProjectBudget = p.budget || 0;
            dataMap[code].appProjectActual = p.actual || 0;
            dataMap[code].appProjectCode = String(p.code);
            dataMap[code].projectName = p.name || "";
            dataMap[code].startDate = p.start || p.computedTakStart || "";
            dataMap[code].handoverDate = p.handover || p.computedTakCompl || "";
            dataMap[code].openingDate = p.opening || p.computedOpening || "";
            dataMap[code].detail = p.detail || "";
            dataMap[code].taskLines = taskLines;
            dataMap[code].mdStatus = p.mdStatus || dataMap[code].mdStatus || "";
            dataMap[code].party = p.party || (p as any).contractor || "";
         }
      });
    });

    return dataMap;
  }, [units, summaryData, projects, tasks, storeFilter, locationFilter]);

  // 3. Evaluate rules on the fly to build unitColorMap
  const { unitColorMap, unitGroupMap, unitOpacityMap, activeGroups } = useMemo(() => {
    const colorMap: Record<string, string> = {};
    const groupMap: Record<string, string> = {};
    const opacityMap: Record<string, number> = {};
    const groupsInUse: any[] = [];
    
    if (!version.groups) return { unitColorMap: colorMap, unitGroupMap: groupMap, unitOpacityMap: opacityMap, activeGroups: groupsInUse };

    version.groups.forEach((group: any) => {
        let matchCount = 0;
        const matchedUnits: any[] = [];
        const mappedUnitIds = new Set((version.groupMappings?.[group.id] || []).map((id: any) => String(id)));
        const groupOpacity = typeof group.opacity === 'number' ? group.opacity : 0.65;
        
        units.forEach((u: any) => {
            let isMatch = false;
            
            if (mappedUnitIds.has(String(u.id))) {
                isMatch = true;
            }
            
            const isDynamicActive = version.isDynamicActive !== false;
            
            if (group.rules && group.rules.length > 0) {
                const hasManualMapping = version.groupMappings && Object.values(version.groupMappings).some(m => Array.isArray(m) && m.length > 0);
                if (isDynamicActive || !hasManualMapping) {
                    const data = aggregatedData[u.name?.toLowerCase() || ''];
                    if (data) {
                        const passedRules = group.rules.every((rule: any) => {
                            let val = data[rule.field];
                            if (rule.field === "margin" || rule.field === "marginByCp") val = val * 100;
                            const numVal = Number(rule.value);
                            const isNum = !isNaN(numVal) && rule.value.trim() !== "";
                            
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
                              case "exclude": {
                                const searchTerms = compareRuleStr.split(/\s+/);
                                return !searchTerms.some(term => compareValStr.includes(term));
                              }
                              default: return false;
                            }
                        });
                        if (passedRules) isMatch = true;
                    }
                }
            }

            if (!isMatch && u.fill && u.fill !== '#ffffff' && u.fill !== '#3b82f6' && group.color && (String(u.fill).toLowerCase() === String(group.color).toLowerCase())) {
                isMatch = true;
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
  }, [version.groups, version.groupMappings, version.isDynamicActive, units, aggregatedData]);

  // 4. Filter only units that appear in dynamic tab and precalculate bounds
  const displayedUnits = useMemo(() => {
    return units
      .filter((unit: any) => {
        if (unit.visible === false) return false;
        
        const targetColor = unitColorMap[unit.id] || (unit.fill && unit.fill !== '#ffffff' && unit.fill !== '#3b82f6' ? unit.fill : null);
        if (!targetColor) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const uData = aggregatedData[unit.name?.toLowerCase() || ''] || {};
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
        const targetColor = unitColorMap[unit.id] || (unit.fill && unit.fill !== '#ffffff' && unit.fill !== '#3b82f6' ? unit.fill : '#3b82f6');
        const targetOpacity = unitOpacityMap[unit.id] ?? 0.65;
        
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
  }, [units, unitColorMap, unitGroupMap, unitOpacityMap, searchQuery, aggregatedData]);

  // Handle position tooltip directly via DOM with 2D collision clamping to prevent screen cropping
  const updateTooltipPos = (clientX: number, clientY: number) => {
    requestAnimationFrame(() => {
      if (!tooltipRef.current) return;
      const el = tooltipRef.current;
      const rect = el.getBoundingClientRect();
      const tooltipWidth = rect.width > 0 ? rect.width : 300;
      const tooltipHeight = rect.height > 0 ? rect.height : 260;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const pad = 12;

      // 1. Calculate X position (try right first, then flip left, then clamp)
      let left = clientX + 16;
      if (left + tooltipWidth > viewportWidth - pad) {
        left = clientX - tooltipWidth - 16;
      }
      left = Math.max(pad, Math.min(left, viewportWidth - tooltipWidth - pad));

      // 2. Calculate Y position (try bottom first, then flip top, then clamp)
      let top = clientY + 16;
      if (top + tooltipHeight > viewportHeight - pad) {
        top = clientY - tooltipHeight - 16;
      }
      top = Math.max(pad, Math.min(top, viewportHeight - tooltipHeight - pad));

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      el.style.transform = 'none';
    });
  };

  // Reset selected version when locationFilter or storeFilter changes so active floor version is selected
  useEffect(() => {
    setSelectedVersionId(null);
  }, [locationFilter, storeFilter]);

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
          const uName = (u.name || '').toLowerCase();
          const d = aggregatedData[uName];
          if (!d) return false;
          return (d.projectName && d.projectName.toLowerCase().includes(q)) ||
                 (d.brandName && d.brandName.toLowerCase().includes(q)) ||
                 (d.appProjectCode && d.appProjectCode.toLowerCase().includes(q));
        });
      }
      // 3. Fallback: partial match
      if (!targetUnit) {
        targetUnit = units.find((u: any) => 
          (u.name || '').toLowerCase().includes(q) ||
          String(u.id).toLowerCase().includes(q)
        );
      }
    }

    if (!targetUnit) return false;

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

    // Calculate optimal zoom scale to clearly frame the unit
    const fitScaleX = (containerW * 0.5) / Math.max(80, uW);
    const fitScaleY = (containerH * 0.5) / Math.max(60, uH);
    const targetScale = Math.max(1.0, Math.min(Math.min(fitScaleX, fitScaleY), 3.2));

    const posX = containerW / 2 - cx * targetScale;
    const posY = containerH / 2 - cy * targetScale;
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

    // Open detailed info tooltip for unit
    const uName = (targetUnit.name || '').toLowerCase();
    setHoverInfo({
      visible: true,
      data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
      unitName: targetUnit.name || 'Unknown'
    });

    setTimeout(() => {
      updateTooltipPos(containerW / 2, Math.max(90, containerH * 0.25));
    }, 150);

    onUnitSelected?.(targetUnit);
    return true;
  }, [units, dimensions, aggregatedData, onUnitSelected]);

  // Sync with incoming targetUnitSearch prop from toolbar
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim()) {
      const q = String(targetUnitSearch).trim();
      const success = zoomAndPanToUnit(q);
      if (!success) {
        // Check other floor versions in availableStoreVersions
        const foundInOther = availableStoreVersions.find((v: any) => {
          if (!v?.groupMappings) return false;
          return Object.values(v.groupMappings).some((m: any) => 
            Array.isArray(m) && m.some(id => String(id).toLowerCase() === q.toLowerCase())
          );
        });
        if (foundInOther && foundInOther.id !== selectedVersionId) {
          setSelectedVersionId(foundInOther.id);
          setTimeout(() => {
            zoomAndPanToUnit(q);
          }, 400);
        }
      }
    } else if (targetUnitSearch === null || targetUnitSearch === '') {
      // Exit focus mode and reset zoom when user clears search or clicks cancel
      setFocusedUnitId(null);
      setHoverInfo(null);
      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
      fitToScreen(true);
    }
  }, [targetUnitSearch, zoomAndPanToUnit, availableStoreVersions, selectedVersionId, fitToScreen]);

  // Keyboard listener: Escape key to exit zoom focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (focusedUnitId || targetUnitSearch)) {
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

  // If units reload after floor switch and targetUnitSearch is active, trigger zoom
  useEffect(() => {
    if (targetUnitSearch && String(targetUnitSearch).trim() && units.length > 0) {
      const t = setTimeout(() => {
        zoomAndPanToUnit(targetUnitSearch);
      }, 250);
      return () => clearTimeout(t);
    }
  }, [units, targetUnitSearch, zoomAndPanToUnit]);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

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

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 overflow-hidden relative select-none [background-image:linear-gradient(to_right,#e5e7eb_1px,transparent_1px),linear-gradient(to_bottom,#e5e7eb_1px,transparent_1px)] [background-size:20px_20px]">
      
      {/* Floating Focus Unit Banner with Cancel / Exit Button */}
      {focusedUnitId && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-slate-900/95 dark:bg-slate-800/95 text-white px-3.5 py-1.5 rounded-full shadow-2xl border border-amber-400/60 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
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
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3 py-1.5 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider whitespace-nowrap">
            {storeFilter} • {targetLoc}
          </span>
        </div>
        {locationVersions.length > 1 && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-slate-400 uppercase hidden sm:inline">Version:</span>
              <select
                value={version?.id || ''}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer max-w-[180px] truncate"
                title="Select Layout Version"
              >
                {locationVersions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.id}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {locationVersions.length <= 1 && version?.name && (
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-2 max-w-[180px] truncate">
            {version.name}
          </span>
        )}
      </div>

      {/* Floating Top-Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1 border border-slate-200 dark:border-slate-700 shadow-md rounded-xl">
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
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
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
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="px-2 py-0.5 text-xs font-mono font-bold text-slate-700 dark:text-slate-200 border-l border-r border-slate-200 dark:border-slate-700">
          {Math.round(stageScale * 100)}%
        </div>
        <button 
          type="button" 
          onClick={() => {
            fitToScreen(true);
          }}
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-200 transition-colors active:scale-95 touch-manipulation"
          title="Reset / Fit to Screen"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* iOS Floating Color Legend Bar */}
      <div className="absolute bottom-16 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-xl z-20 pointer-events-auto">
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

      {/* Floating Bottom Action Buttons */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <button 
          onClick={() => setShowLegendModal(true)} 
          className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white backdrop-blur-md border border-purple-500 shadow-xl rounded-full text-xs font-bold active:scale-95 transition-all"
        >
          <Palette className="w-4 h-4" /> 
          <span>Chú thích màu</span>
          {activeGroups.length > 0 && (
            <span className="bg-white/25 px-1.5 py-0.2 rounded-full text-[10px] font-mono">
              {activeGroups.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setShowMenu(true)} 
          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 dark:bg-white/90 text-white dark:text-slate-900 backdrop-blur-md border border-slate-700 dark:border-slate-300 shadow-xl rounded-full text-xs font-bold hover:bg-slate-800 active:scale-95 transition-all"
        >
          <Menu className="w-4 h-4" /> Menu
        </button>
      </div>

      {/* Full Color Legend Modal / Drawer (iOS friendly) */}
      {showLegendModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150">
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

      {/* Floating Menu Drawer / Modal */}
      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 text-slate-800 dark:text-slate-200 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-base text-slate-800 dark:text-slate-100">
                <Layers className="w-5 h-5 text-purple-600" />
                Menu & Chú thích Bản đồ
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
                placeholder="Tìm Unit / Brand / Project..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Active Groups Legend */}
            <div>
              <div className="text-[11px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                Nhóm Phân Loại Đang Hiển Thị ({activeGroups.length})
              </div>
              {activeGroups.length === 0 ? (
                <div className="text-xs text-slate-400 italic py-2">Không có nhóm phân loại nào khớp dữ liệu.</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {activeGroups.map((g: any) => (
                    <div key={g.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full shadow-sm border border-black/10" style={{ backgroundColor: g.color }} />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{g.name}</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold bg-white dark:bg-slate-700 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                        {g.matchCount} units
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800">
              {canWrite && (
                <button 
                  onClick={handleTriggerExport}
                  disabled={isExporting}
                  title="Tự động thực hiện: Bước 1 Apply all rules Dynamic -> Bước 2 Save Cloud R2"
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${isExporting ? 'animate-spin' : ''}`} />
                  {isExporting ? (exportStatus || 'Đang xử lý...') : 'Trigger Export (Apply Rules & Cloud)'}
                </button>
              )}
              
              <div className={`grid ${canWrite ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                <button 
                  onClick={handleExport}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> Xuất ảnh HD
                </button>
                {canWrite && (
                  <button 
                    onClick={() => {
                      setShowMenu(false);
                      onOpenR2Config();
                    }}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors border border-slate-200 dark:border-slate-700"
                  >
                    <Settings className="w-4 h-4" /> Cấu hình R2
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {hoverInfo && hoverInfo.visible && (
        <div 
          ref={tooltipRef}
          className="fixed z-50 pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700 p-3.5 sm:p-4 w-72 sm:w-80 max-w-[calc(100vw-24px)] max-h-[calc(100vh-28px)] overflow-y-auto text-sm text-slate-700 dark:text-slate-200 transition-opacity duration-150 custom-scrollbar"
          style={{ 
            left: -9999, 
            top: -9999,
            transformOrigin: 'top left'
          }}
        >
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="font-bold text-base sm:text-lg text-slate-800 dark:text-slate-100 truncate max-w-[140px] sm:max-w-[170px]" title={hoverInfo.unitName}>
                {hoverInfo.unitName}
              </div>
              <div className="flex items-center gap-1.5">
                {hoverInfo.data?.appProjectStatus && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    hoverInfo.data.appProjectStatus === 'Completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
                    hoverInfo.data.appProjectStatus === 'On Process' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' :
                    hoverInfo.data.appProjectStatus === 'Delay' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
                    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {hoverInfo.data.appProjectStatus}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setHoverInfo(null);
                    if (focusedUnitId) {
                      setFocusedUnitId(null);
                      if (focusedTimerRef.current) clearTimeout(focusedTimerRef.current);
                      fitToScreen(true);
                      onClearFocus?.();
                    }
                  }}
                  className="p-1 -mr-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  title="Close tooltip"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {(hoverInfo.data?.projectName || hoverInfo.data?.brandName) && (
              <div>
                <div className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">BRAND / PROJECT</div>
                <div className="font-semibold text-sm sm:text-base text-slate-800 dark:text-slate-200 leading-snug">
                  {hoverInfo.data.projectName || hoverInfo.data.brandName}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {hoverInfo.data?.size > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Size (m²)</div>
                  <div className="font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200">{Number(hoverInfo.data.size).toLocaleString('en-US')}</div>
                </div>
              )}
              {hoverInfo.data?.floor && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 font-medium uppercase mb-0.5">Location</div>
                  <div className="font-semibold text-xs sm:text-sm text-slate-700 dark:text-slate-200">{hoverInfo.data.floor}</div>
                </div>
              )}
            </div>

            {hoverInfo.data?.mdStatus && (
              <div className="bg-purple-50/70 dark:bg-purple-950/30 px-2.5 py-1.5 rounded-lg border border-purple-100 dark:border-purple-900/50 flex items-center justify-between text-xs">
                <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider">MD Status:</span>
                <span className="font-semibold text-purple-700 dark:text-purple-300">{hoverInfo.data.mdStatus}</span>
              </div>
            )}

            {(hoverInfo.data?.startDate || hoverInfo.data?.handoverDate || hoverInfo.data?.openingDate) && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2 flex flex-col gap-1.5">
                {hoverInfo.data.startDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Start:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.startDate)}</span>
                    </div>
                  </div>
                )}
                {hoverInfo.data.handoverDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Handover:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.handoverDate)}</span>
                    </div>
                  </div>
                )}
                {hoverInfo.data.openingDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Opening:</span>
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <FolderOutput className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                      <span>{formatDisplayDateTime(hoverInfo.data.openingDate)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Subtasks from General Tab */}
            {hoverInfo.data?.taskLines && hoverInfo.data.taskLines.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-700 text-xs shadow-sm flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                  DETAILS
                </div>
                {hoverInfo.data.taskLines.map((line: string, idx: number) => (
                  <div key={idx} className={`font-semibold ${idx % 2 === 0 ? 'text-blue-600 dark:text-[#8ab4f8]' : 'text-orange-600 dark:text-orange-400'}`}>
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Project Modular Description */}
            {hoverInfo.data?.detail && (
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-lg p-2.5 border border-slate-200/80 dark:border-slate-700 text-xs shadow-sm flex flex-col gap-1">
                <div className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                  DESCRIPTION
                </div>
                <div className="text-slate-700 dark:text-slate-300 font-medium whitespace-pre-wrap">
                  {hoverInfo.data.detail}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas Viewport */}
      <div 
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
                setHoverInfo(null);
              }
            }}
            onTap={(e) => {
              if (e.target === stageRef.current) {
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
          {/* Single Unified Layer matching ReviewTab for consistent z-ordering and crisp rendering */}
          <Layer>
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

            {displayedUnits.map((unit: any) => {
               const fillColor = unit.targetColor || "#3b82f6";
               const isFocused = focusedUnitId === unit.id;
               const isDimmed = selectedLegendGroupId !== null && unit.targetGroupId !== selectedLegendGroupId;
               const contrast = getContrastStyle(fillColor);
               
               const displayOpacity = isFocused 
                 ? 1.0 
                 : isDimmed 
                 ? 0.2 
                 : Math.max(0.82, unit.targetOpacity ?? 0.85);
               
               const commonProps = {
                  id: unit.id,
                  fill: fillColor,
                  opacity: displayOpacity,
                  stroke: isFocused ? '#f59e0b' : (isDimmed ? '#94a3b8' : contrast.shapeStroke),
                  strokeWidth: isFocused ? 3 : 1.6,
                  strokeScaleEnabled: false,
                  perfectDrawEnabled: false,
                  shadowColor: isFocused ? '#f59e0b' : '#000000',
                  shadowBlur: isFocused ? 16 : 3,
                  shadowOpacity: isFocused ? 0.9 : 0.22,
                  x: unit.x || 0,
                  y: unit.y || 0,
                  rotation: unit.rotation || 0,
                  onMouseEnter: (e: any) => {
                     if (isInteractingRef.current) return;
                     try {
                        const container = e.target.getStage()?.container();
                        if (container) container.style.cursor = 'pointer';
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown'
                        });
                        setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                     } catch (err) {
                        console.error("Defensive Check: Error onMouseEnter unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onMouseMove: (e: any) => {
                     if (isInteractingRef.current) return;
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
                        setHoverInfo(null);
                     } catch (err) {
                        console.error("Defensive Check: Error onMouseLeave unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onClick: (e: any) => {
                     if (isInteractingRef.current) return;
                     try {
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown'
                        });
                        setTimeout(() => updateTooltipPos(e.evt.clientX, e.evt.clientY), 0);
                     } catch (err) {
                        console.error("Defensive Check: Error onClick unit in LiveLayoutViewer:", err, unit);
                     }
                  },
                  onTap: (e: any) => {
                     if (isInteractingRef.current) return;
                     try {
                        const clientX = e.evt.changedTouches ? e.evt.changedTouches[0].clientX : e.evt.clientX;
                        const clientY = e.evt.changedTouches ? e.evt.changedTouches[0].clientY : e.evt.clientY;
                        const uName = (unit.name || '').toLowerCase();
                        setHoverInfo({
                           visible: true,
                           data: (uName && aggregatedData[uName]) ? aggregatedData[uName] : {},
                           unitName: unit.name || 'Unknown'
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
                 </React.Fragment>
               );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
