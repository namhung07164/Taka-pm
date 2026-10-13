import React, { useState } from "react";
import { CloudUpload, CloudDownload, RefreshCw, Sparkles, ChevronDown, Check, Layers, GitMerge, Eye, Edit3, Settings } from 'lucide-react';
import { uploadSingleR2File, purgeOldR2BackgroundImages, getStoredR2Credentials, getStoredR2CredentialsAsync, extractR2Key, getS3Sdk, downloadR2JsonFile, isR2CredentialsValid } from '../../lib/r2Upload';
import { cleanOrphanR2Files } from '../../../../lib/r2StorageUtils';
import { useDataStore, StoreLocationRecord } from '../../DataContext';
import { useAppStore } from '../../../../store/useAppStore';
import { useShallow } from 'zustand/react/shallow';
import { MapVersion } from '../DataMapping/types';
import R2UploadModal from '../R2UploadModal';
import { cn } from '../../lib/utils';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../../lib/firebase';

let hasGlobalAutoSyncStarted = false;

// Recursive sanitizer to ensure zero 'undefined' properties reach Firestore
function sanitizeForFirestore(val: any): any {
  if (val === undefined) return null;
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sanitizeForFirestore);
  const out: Record<string, any> = {};
  for (const k of Object.keys(val)) {
    const v = val[k];
    if (v !== undefined) {
      out[k] = sanitizeForFirestore(v);
    }
  }
  return out;
}

export type CloudSyncScope = 'all' | 'edit' | 'dynamic' | 'review';

export interface CloudSyncManagerProps {
  scope?: CloudSyncScope;
  className?: string;
  showCleanButton?: boolean;
  compact?: boolean;
}

export default function CloudSyncManager({
  scope = 'all',
  className,
  showCleanButton = true,
  compact = false,
}: CloudSyncManagerProps) {
  const [selectedScope, setSelectedScope] = useState<CloudSyncScope>(scope);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);

  // Sync internal selectedScope when prop scope changes
  React.useEffect(() => {
    setSelectedScope(scope);
  }, [scope]);

  const { 
    store,
    location,
    storeLocationData,
    mapUnits, mapVersions,
    activeMapVersionId,
    reviewSelectedLabels,
    reviewLabelColors,
    unitInfo,
    classInfo,
    actualClassInfo,
    sales,
    profits,
    subFees,
    mdStatus,
    projectStatus,
    projectLink,
    basePlan,
    units,
    loadFullCloudData,
    isCloudLoaded
  } = useDataStore(useShallow(state => ({
    store: state.store,
    location: state.location,
    storeLocationData: state.storeLocationData,
    mapUnits: state.mapUnits,
    mapVersions: state.mapVersions,
    activeMapVersionId: state.activeMapVersionId,
    reviewSelectedLabels: state.reviewSelectedLabels,
    reviewLabelColors: state.reviewLabelColors,
    unitInfo: state.unitInfo,
    classInfo: state.classInfo,
    actualClassInfo: state.actualClassInfo,
    sales: state.sales,
    profits: state.profits,
    subFees: state.subFees,
    mdStatus: state.mdStatus,
    projectStatus: state.projectStatus,
    projectLink: state.projectLink,
    basePlan: state.basePlan,
    units: state.units,
    loadFullCloudData: state.loadFullCloudData,
    isCloudLoaded: state.isCloudLoaded,
  })));

  React.useEffect(() => {
    if (hasGlobalAutoSyncStarted || isCloudLoaded) return;
    async function checkAutoLoad() {
      if (hasGlobalAutoSyncStarted) return;
      hasGlobalAutoSyncStarted = true;

      // 1. Immediately restore from LocalStorage cache for instant 0ms restoration
      try {
        const cached = localStorage.getItem('taka_mapping_config_backup');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.storeLocationData && Object.keys(parsed.storeLocationData).length > 0) {
            loadFullCloudData({
              storeLocationData: parsed.storeLocationData,
              store: parsed.store || store,
              location: parsed.location || location,
              activeMapVersionId: parsed.activeMapVersionId || activeMapVersionId,
              reviewSelectedLabels: parsed.reviewSelectedLabels || [],
              reviewLabelColors: parsed.reviewLabelColors || {},
            });
          }
        }
      } catch (e) {}

      // 2. Fetch latest from Cloudflare R2 / Firestore
      const creds = await getStoredR2CredentialsAsync();
      if (creds && creds.accountId && creds.accessKeyId) {
        executeSync('download', true, 'all');
      } else {
        // Fallback to Firestore backup on boot
        try {
          const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"));
          if (snap.exists()) {
            const fsData = snap.data() as any;
            if (fsData?.storeLocationData) {
              loadFullCloudData({
                storeLocationData: fsData.storeLocationData,
                store: store,
                location: location,
                activeMapVersionId: activeMapVersionId,
                reviewSelectedLabels: fsData.reviewSelectedLabels || [],
                reviewLabelColors: fsData.reviewLabelColors || {},
              });
            }
          }
        } catch (e) {
          console.warn('[AutoLoad Fallback] Firestore boot fallback error:', e);
        }
      }
    }
    checkAutoLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenSync = async (type: 'upload' | 'download', targetScope?: CloudSyncScope) => {
    setActionType(type);
    const effScope = targetScope || selectedScope;
    if (targetScope) setSelectedScope(targetScope);

    // Direct 1-click execution: always saves/loads via R2 + Firestore + LocalStorage
    executeSync(type, false, effScope);
  };

  const [backgroundSyncing, setBackgroundSyncing] = useState<'upload' | 'download' | null>(null);

  const getScopeName = (sc: CloudSyncScope) => {
    switch (sc) {
      case 'edit': return 'Edit';
      case 'dynamic': return 'Dynamic';
      case 'review': return 'Review';
      case 'all': return 'All';
    }
  };

  const executeSync = async (forceAction?: 'upload' | 'download', isAuto = false, forceScope?: CloudSyncScope) => {
    const syncStartTime = Date.now();
    const currentAction = forceAction || actionType;
    const currentScope = forceScope || selectedScope;
    setIsModalOpen(false);
    setSyncing(true);
    setBackgroundSyncing(currentAction);

    // 1. INSTANT 0ms OPTIMISTIC COMMIT TO ZUSTAND & LOCALSTORAGE
    const freshDataState = useDataStore.getState();
    const currentStore = (freshDataState.store || store || 'HCM') as 'HCM' | 'HN';
    const currentLocation = (freshDataState.location || location || 'L1').trim();
    const currentActiveKey = `${currentStore}_${currentLocation}`;
    const updatedStoreLocationData: Record<string, StoreLocationRecord> = {
      ...(freshDataState.storeLocationData || {})
    };

    // Guarantee the active partition contains the user's latest on-screen units and versions
    const currentActiveUnits = Array.isArray(freshDataState.mapUnits) ? freshDataState.mapUnits : (updatedStoreLocationData[currentActiveKey]?.mapUnits || []);
    const currentActiveVersions = Array.isArray(freshDataState.mapVersions) ? freshDataState.mapVersions : (updatedStoreLocationData[currentActiveKey]?.mapVersions || []);
    const currentActiveVersionId = freshDataState.activeMapVersionId 
      || activeMapVersionId 
      || (currentActiveVersions[0]?.id ?? null);

    updatedStoreLocationData[currentActiveKey] = {
      mapUnits: currentActiveUnits,
      mapVersions: currentActiveVersions,
      activeMapVersionId: currentActiveVersionId,
    };

    if (currentAction === 'upload') {
      // Synchronously write to Zustand and LocalStorage
      useDataStore.setState({
        storeLocationData: updatedStoreLocationData,
        mapUnits: currentActiveUnits,
        mapVersions: currentActiveVersions,
        activeMapVersionId: currentActiveVersionId,
      });
      try {
        const payload = JSON.stringify({
          storeLocationData: updatedStoreLocationData,
          store: currentStore,
          location: currentLocation,
          activeMapVersionId: currentActiveVersionId,
          updatedAt: Date.now(),
          timestamp: Date.now(),
        });
        if (payload.length < 1000000) {
          localStorage.setItem('taka_mapping_config_backup', payload);
        } else {
          localStorage.removeItem('taka_mapping_config_backup');
        }
      } catch {
        try { localStorage.removeItem('taka_mapping_config_backup'); } catch (_) {}
      }
    }

    // 2. NETWORK ASYNC CLOUD SYNC (R2 & FIRESTORE)
    try {
      const creds = await getStoredR2CredentialsAsync();
      const credsValidation = isR2CredentialsValid(creds);

      if (currentAction === 'upload') {
        let existingCloudData: any = null;

        let s3ClientInstance: any = null;
        if (creds && credsValidation.valid) {
          try {
            const { S3Client } = await getS3Sdk();
            s3ClientInstance = new S3Client({
              region: 'auto',
              endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId: creds.accessKeyId.trim(), secretAccessKey: creds.secretAccessKey.trim() },
            });
            const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', creds, s3ClientInstance);
            if (downloadRes.success && downloadRes.data) {
              existingCloudData = downloadRes.data;
            }
          } catch (e) {
            console.warn('Could not pre-fetch mapping_config.json for merge:', e);
          }
        }

        // Fallback pre-fetch from Firestore backup if R2 did not have data
        if (!existingCloudData) {
          try {
            const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"));
            if (snap.exists()) {
              existingCloudData = snap.data();
            }
          } catch (e) {
            console.warn('Could not pre-fetch Firestore backup for merge:', e);
          }
        }

        const allValidBgNames: string[] = [];
        const cloudStoreLocationData: Record<string, StoreLocationRecord> = existingCloudData?.storeLocationData 
          ? JSON.parse(JSON.stringify(existingCloudData.storeLocationData)) 
          : {};
        const localStoreLocationData: Record<string, StoreLocationRecord> = {};

        // Merge all partitions across all stores and locations without dropping any floor
        const allPartitionKeys = Array.from(new Set([
          ...Object.keys(updatedStoreLocationData),
          ...Object.keys(cloudStoreLocationData),
        ]));

        // 1. Process Background Images, Units & All Versions across all floors
        for (const pKey of allPartitionKeys) {
          const localPart = updatedStoreLocationData[pKey];
          const cloudPart = cloudStoreLocationData[pKey];

          const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
          const pLoc = pKey.split('_')[1] || 'L1';

          // Authoritative Units: If local partition exists, local units are 100% authoritative
          const sourceUnits = (localPart && localPart.mapUnits !== undefined)
            ? localPart.mapUnits
            : (cloudPart?.mapUnits || []);

          const pUnits = sourceUnits.map(u => ({
            ...u,
            store: u.store || pStore,
            location: u.location || pLoc,
            visible: u.visible !== false,
            locked: !!u.locked,
            fill: (u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' && u.fill !== 'transparent') ? u.fill : '#3b82f6',
          }));

          // Authoritative Versions: If local partition exists, local versions are 100% authoritative
          const finalVersionsList: MapVersion[] = (localPart && localPart.mapVersions !== undefined)
            ? localPart.mapVersions
            : (cloudPart?.mapVersions || []);

          const pVersionsCloud: MapVersion[] = [];
          const pVersionsLocal: MapVersion[] = [];

          for (let i = 0; i < finalVersionsList.length; i++) {
            const v = finalVersionsList[i];
            const currentBg = v.backgroundUrl;
            let r2Key = extractR2Key(currentBg) || (v as any).r2Key || null;
            let displayUrl = currentBg;

            if (creds && s3ClientInstance && currentBg && (currentBg.startsWith('blob:') || currentBg.startsWith('data:'))) {
              try {
                setStatusText(`Đang tải ảnh nền: [${pKey}] ${v.name}...`);
                const res = await fetch(currentBg);
                const blob = await res.blob();
                if (blob.size > 0) {
                  const bgName = `bg_${v.id}_${Date.now()}.jpeg`;
                  const uploadRes = await uploadSingleR2File({ name: bgName, blob }, creds, s3ClientInstance);
                  if (uploadRes.success) {
                    r2Key = uploadRes.name;
                    const { GetObjectCommand, getSignedUrl } = await getS3Sdk();
                    const signedUrl = await getSignedUrl(s3ClientInstance, new GetObjectCommand({ Bucket: creds.bucketName.trim(), Key: r2Key }), { expiresIn: 3600 * 24 * 7 });
                    displayUrl = signedUrl;
                  }
                }
              } catch (bgErr) {
                console.warn(`[Background Upload] Failed to upload background for ${v.name}:`, bgErr);
              }
            } else if (creds && s3ClientInstance && r2Key) {
              if (!displayUrl || displayUrl.startsWith('r2://')) {
                try {
                  const { GetObjectCommand, getSignedUrl } = await getS3Sdk();
                  displayUrl = await getSignedUrl(s3ClientInstance, new GetObjectCommand({ Bucket: creds.bucketName.trim(), Key: r2Key }), { expiresIn: 3600 * 24 * 7 });
                } catch (e) {
                  console.warn('Could not generate signed url for key', r2Key, e);
                }
              }
            }

            if (r2Key) {
              allValidBgNames.push(r2Key);
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

            const versionYear = String(v.year || (useAppStore.getState().globalYearFilter && useAppStore.getState().globalYearFilter !== 'all' ? useAppStore.getState().globalYearFilter : '2026'));

            pVersionsCloud.push({
              ...v,
              year: versionYear,
              store: v.store || pStore,
              location: v.location || pLoc,
              backgroundUrl: r2Key ? `r2://${r2Key}` : displayUrl,
              groups: deepCopiedGroups,
              groupMappings: v.groupMappings || {},
              isDynamicActive: true,
              mapUnits: pUnits,
            });

            pVersionsLocal.push({
              ...v,
              year: versionYear,
              store: v.store || pStore,
              location: v.location || pLoc,
              backgroundUrl: displayUrl,
              groups: deepCopiedGroups,
              groupMappings: v.groupMappings || {},
              isDynamicActive: true,
              mapUnits: pUnits,
            });
          }

          const activeVerId = localPart?.activeMapVersionId 
            || cloudPart?.activeMapVersionId 
            || (pVersionsCloud[0]?.id ?? null);

          cloudStoreLocationData[pKey] = {
            mapUnits: pUnits,
            mapVersions: pVersionsCloud,
            activeMapVersionId: activeVerId,
          };

          localStoreLocationData[pKey] = {
            mapUnits: pUnits,
            mapVersions: pVersionsLocal,
            activeMapVersionId: activeVerId,
          };
        }

        // 2. Dọn dẹp ảnh mồ côi nếu scope có liên quan tới edit hoặc all
        if (creds && s3ClientInstance && (currentScope === 'edit' || currentScope === 'all') && allValidBgNames.length > 0) {
          setProgress(60);
          setStatusText('Đang dọn dẹp ảnh nền cũ trên R2...');
          try {
            await purgeOldR2BackgroundImages(allValidBgNames, creds, s3ClientInstance, (status) => setStatusText(status));
          } catch (cleanErr) {
            console.warn('[CloudSync] Lỗi dọn dẹp ảnh nền cũ:', cleanErr);
          }
        }

        // 3. Build config Data
        setProgress(75);
        setStatusText(`Đang lưu cấu hình [${getScopeName(currentScope)}] lên Cloud...`);

        const activeCloudPartition = cloudStoreLocationData[currentActiveKey] 
          || Object.values(cloudStoreLocationData)[0] 
          || { mapUnits: [], mapVersions: [], activeMapVersionId: null };
        const currentAppYear = useAppStore.getState().globalYearFilter;
        const targetYear = (currentAppYear && currentAppYear !== 'all') ? currentAppYear : (activeCloudPartition?.mapVersions?.[0]?.year || '2026');

        const configData = {
          ...(existingCloudData || {}),
          storeLocationData: cloudStoreLocationData,
          store,
          location,
          year: targetYear,
          globalYearFilter: targetYear,
          activeMapVersionId: activeCloudPartition.activeMapVersionId || activeMapVersionId,
          reviewSelectedLabels: reviewSelectedLabels || [],
          reviewLabelColors: reviewLabelColors || {},
          mapUnits: activeCloudPartition.mapUnits,
          versions: activeCloudPartition.mapVersions,
          unitInfo: existingCloudData?.unitInfo || unitInfo,
          classInfo: existingCloudData?.classInfo || classInfo,
          actualClassInfo: existingCloudData?.actualClassInfo || actualClassInfo,
          sales: existingCloudData?.sales || sales,
          profits: existingCloudData?.profits || profits,
          subFees: existingCloudData?.subFees || subFees,
          mdStatus: existingCloudData?.mdStatus || mdStatus,
          projectStatus: existingCloudData?.projectStatus || projectStatus,
          projectLink: existingCloudData?.projectLink || projectLink,
          basePlan: existingCloudData?.basePlan || basePlan,
          units: existingCloudData?.units || units,
          lastSavedScope: currentScope,
          timestamp: Date.now(),
        };

        // Upload to Cloudflare R2 if creds available and valid
        let r2UploadSuccess = false;
        let r2ErrorMessage = '';

        if (creds && credsValidation.valid && s3ClientInstance) {
          try {
            const configBlob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
            const uploadRes = await uploadSingleR2File({ name: 'mapping_config.json', blob: configBlob }, creds, s3ClientInstance);
            if (uploadRes.success) {
              r2UploadSuccess = true;
            } else {
              r2ErrorMessage = uploadRes.error || 'Cloudflare R2 không phản hồi';
              console.warn(`[R2 Upload Warning] ${r2ErrorMessage}`);
            }
          } catch (r2Err: any) {
            r2ErrorMessage = r2Err?.message || String(r2Err);
            console.warn('[R2 Upload Warning]', r2ErrorMessage);
          }
        } else if (creds && !credsValidation.valid) {
          r2ErrorMessage = credsValidation.reason || 'Cấu hình Cloudflare R2 không hợp lệ';
          console.warn('[R2 Upload Warning]', r2ErrorMessage);
        } else {
          console.warn('[CloudSync] Missing R2 credentials when saving. Data saved to Firestore backup only.');
        }

        // Parallel Backup: Always save snapshot to Firestore and LocalStorage (with size protection)
        let firestoreSaveSuccess = false;
        try {
          // Prepare sanitized Firestore backup copy (replace any heavy data: URLs to keep doc < 1MB)
          const firestoreStoreLocationData: Record<string, any> = {};
          for (const key in cloudStoreLocationData) {
            const part = cloudStoreLocationData[key];
            if (!part) continue;
            firestoreStoreLocationData[key] = {
              activeMapVersionId: part.activeMapVersionId || null,
              mapUnits: (part.mapUnits || []).map(u => ({
                id: u.id,
                name: u.name || '',
                type: u.type,
                x: u.x || 0,
                y: u.y || 0,
                width: u.width ?? null,
                height: u.height ?? null,
                radius: u.radius ?? null,
                points: u.points ?? null,
                rotation: u.rotation || 0,
                scaleX: (u as any).scaleX ?? null,
                scaleY: (u as any).scaleY ?? null,
                fill: u.fill || '#3b82f6',
                opacity: u.opacity ?? 0.5,
                visible: u.visible !== false,
                locked: !!u.locked,
                store: u.store || null,
                location: u.location || null,
                groupId: (u as any).groupId || null,
                groupName: (u as any).groupName || null,
              })),
              mapVersions: (part.mapVersions || []).map(v => {
                const bg = v.backgroundUrl || '';
                const safeBg = (bg.startsWith('data:') || bg.startsWith('blob:'))
                  ? ((v as any).r2Key ? `r2://${(v as any).r2Key}` : '')
                  : bg;
                return {
                  id: v.id,
                  name: v.name,
                  year: v.year,
                  store: v.store,
                  location: v.location,
                  backgroundUrl: safeBg,
                  groups: v.groups || [],
                  groupMappings: v.groupMappings || {},
                  isDynamicActive: v.isDynamicActive !== false,
                  // Do not duplicate mapUnits inside every version to keep Firestore doc well under 1MB
                };
              }),
            };
          }

          const firestorePayload = sanitizeForFirestore({
            storeLocationData: firestoreStoreLocationData,
            store,
            location,
            year: targetYear,
            globalYearFilter: targetYear,
            activeMapVersionId: activeCloudPartition.activeMapVersionId || activeMapVersionId || null,
            reviewSelectedLabels: configData.reviewSelectedLabels || [],
            reviewLabelColors: configData.reviewLabelColors || {},
            lastSavedScope: currentScope,
            updatedAt: new Date().toISOString(),
            timestamp: configData.timestamp,
          });

          await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"), firestorePayload, { merge: true });
          firestoreSaveSuccess = true;

          // Also update version timestamp to notify LiveLayoutViewer and other clients
          await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), { 
            r2Version: configData.timestamp,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fsErr) {
          console.error('[Firestore Backup] Error saving backup:', fsErr);
        }

        try {
          const payload = JSON.stringify({
            storeLocationData: cloudStoreLocationData,
            store,
            location,
            year: targetYear,
            globalYearFilter: targetYear,
            activeMapVersionId: activeCloudPartition.activeMapVersionId || activeMapVersionId,
            updatedAt: Date.now(),
            timestamp: configData.timestamp,
          });
          if (payload.length < 1000000) {
            localStorage.setItem('taka_mapping_config_backup', payload);
          } else {
            localStorage.removeItem('taka_mapping_config_backup');
          }
        } catch {
          try { localStorage.removeItem('taka_mapping_config_backup'); } catch (_) {}
        }

        // 4. Update local React store
        loadFullCloudData({
          storeLocationData: localStoreLocationData,
          store,
          location,
          activeMapVersionId: activeCloudPartition.activeMapVersionId || activeMapVersionId,
          reviewSelectedLabels: reviewSelectedLabels || [],
          reviewLabelColors: reviewLabelColors || {},
        });

        // Broadcast to LiveLayoutViewer, ReviewTab, etc.
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('taka_cloud_sync_updated', {
              detail: {
                timestamp: configData.timestamp,
                store,
                location,
                storeLocationData: localStoreLocationData,
              }
            }));
          }
        } catch (evtErr) {}

        setProgress(100);
        const totalVersions = Object.values(cloudStoreLocationData).reduce((acc, p) => acc + (p.mapVersions?.length || 0), 0);
        const totalUnits = Object.values(cloudStoreLocationData).reduce((acc, p) => acc + (p.mapUnits?.length || 0), 0);
        const elapsedSec = ((Date.now() - syncStartTime) / 1000).toFixed(1);

        if (r2UploadSuccess) {
          setStatusText(`Đã lưu thành công: ${totalUnits} units, ${totalVersions} versions lên Cloudflare R2 (${elapsedSec}s)!`);
          useAppStore.getState().setToast({
            title: "Save Cloud Success",
            message: `Successfully saved ${totalUnits} units and ${totalVersions} versions across all floors to Cloudflare R2 & Firestore in ${elapsedSec}s!`,
            type: "success",
          });
        } else if (firestoreSaveSuccess) {
          const warnNote = r2ErrorMessage ? ` (Lưu ý: ${r2ErrorMessage})` : '';
          setStatusText(`Đã lưu ${totalUnits} units, ${totalVersions} versions vào Firestore Cloud (${elapsedSec}s)!`);
          useAppStore.getState().setToast({
            title: "Saved to Firestore Cloud",
            message: `Data saved successfully to Firestore Cloud in ${elapsedSec}s!${warnNote}`,
            type: r2ErrorMessage ? "warning" : "success",
          });
        } else {
          setStatusText(`Lỗi lưu Cloud (${elapsedSec}s): ${r2ErrorMessage || 'Không thể ghi dữ liệu'}`);
          useAppStore.getState().setToast({
            title: "Save Cloud Failed",
            message: `Could not save to Cloud: ${r2ErrorMessage || 'Permission denied or network failure'}.`,
            type: "error",
          });
        }

      } else if (currentAction === 'download') {
        setProgress(20);
        setStatusText(`Đang tải dữ liệu [${getScopeName(currentScope)}] từ Cloud...`);

        let data: any = null;
        let loadSource = '';

        // Try R2 download first if credentials are valid
        if (creds && credsValidation.valid) {
          try {
            const { S3Client } = await getS3Sdk();
            const s3 = new S3Client({
              region: 'auto',
              endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
              credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
            });
            const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', creds, s3);
            if (downloadRes.success && downloadRes.data) {
              data = downloadRes.data;
              loadSource = 'Cloudflare R2';
            }
          } catch (r2Err) {
            console.warn('[R2 Download] R2 fetch error, trying fallback:', r2Err);
          }
        }

        // Compare or fallback to Firestore backup
        try {
          const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "picture_mapping_config"));
          if (snap.exists()) {
            const fsData = snap.data() as any;
            if (fsData?.storeLocationData) {
              // Prefer Firestore if R2 had no data OR Firestore timestamp is strictly newer
              if (!data || (fsData.timestamp && (!data.timestamp || fsData.timestamp > data.timestamp))) {
                data = fsData;
                loadSource = 'Firestore Cloud';
              }
            }
          }
        } catch (fsErr) {
          console.warn('[Firestore Fallback] Error reading backup:', fsErr);
        }

        // Fallback to LocalStorage backup
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
            setSyncing(false);
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

        // Resolve background signed URLs if creds available and valid
        let s3ClientInstance: any = null;
        if (creds && credsValidation.valid) {
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

          partition.mapUnits = (partition.mapUnits || []).map(u => ({
            ...u,
            store: u.store || pStore,
            location: u.location || pLoc,
            visible: u.visible !== false,
            locked: !!u.locked,
            fill: (u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' && u.fill !== 'transparent') ? u.fill : '#3b82f6',
          }));

          if (Array.isArray(partition.mapVersions)) {
            for (let j = 0; j < partition.mapVersions.length; j++) {
              const v = partition.mapVersions[j];
              const r2Key = extractR2Key(v.backgroundUrl) || (v as any).r2Key;

              if (creds && credsValidation.valid && s3ClientInstance && r2Key) {
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

        // Scoped Application to local state (read directly from getState to avoid any stale closure)
        const currentLocalStoreLocationData = useDataStore.getState().storeLocationData || {};
        const localMergedStoreLocationData: Record<string, StoreLocationRecord> = { ...currentLocalStoreLocationData };

        if (currentScope === 'edit') {
          // Update ONLY coordinates & background transforms, keeping local dynamic rules
          for (const pKey in normalizedStoreLocationData) {
            const cloudPart = normalizedStoreLocationData[pKey];
            const localPart = localMergedStoreLocationData[pKey];
            if (!cloudPart) continue;

            const mergedVersions = (cloudPart.mapVersions || []).map((cv) => {
              const localV = localPart?.mapVersions?.find((lv) => 
                lv.id === cv.id || (lv.name === cv.name && String(lv.year || '').trim() === String(cv.year || '').trim())
              );
              return {
                ...cv,
                groups: localV?.groups || cv.groups || [],
                groupMappings: localV?.groupMappings || cv.groupMappings || {},
              };
            });

            localMergedStoreLocationData[pKey] = {
              mapUnits: cloudPart.mapUnits,
              mapVersions: mergedVersions,
              activeMapVersionId: cloudPart.activeMapVersionId || localPart?.activeMapVersionId || null,
            };
          }

          loadFullCloudData({
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
            title: "Load Cloud Success",
            message: `Successfully loaded map units and floor plans from ${loadSource || 'Cloud'} in ${elapsedSec}s!`,
            type: "success"
          });

        } else if (currentScope === 'dynamic') {
          // Update dynamic rules and groups, while preserving all versions and units
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
                const deepCopied = Array.isArray(groupsToUse) ? groupsToUse.map((g: any) => ({
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
              mapUnits: (cloudPart.mapUnits && cloudPart.mapUnits.length > 0) ? cloudPart.mapUnits : (localPart?.mapUnits || []),
              mapVersions: Array.from(versionMap.values()),
              activeMapVersionId: cloudPart.activeMapVersionId || localPart?.activeMapVersionId || null,
            };
          }

          if (data.globalYearFilter || data.year) {
            useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
          }

          loadFullCloudData({
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
            title: "Load Cloud Success",
            message: "Successfully synchronized dynamic rules and group classifications from Cloud!",
            type: "success"
          });

        } else if (currentScope === 'review') {
          // Update ONLY reviewSelectedLabels and reviewLabelColors
          if (data.globalYearFilter || data.year) {
            useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
          }
          loadFullCloudData({
            storeLocationData: useDataStore.getState().storeLocationData || storeLocationData,
            store: useDataStore.getState().store || store,
            location: useDataStore.getState().location || location,
            activeMapVersionId: useDataStore.getState().activeMapVersionId || activeMapVersionId,
            reviewSelectedLabels: data.reviewSelectedLabels || [],
            reviewLabelColors: data.reviewLabelColors || {},
          });

          setProgress(100);
          setStatusText('Đã tải cấu hình review & nhãn (Tab Review) từ Cloud!');
          useAppStore.getState().setToast({
            title: "Load Cloud Success",
            message: "Successfully synchronized review label settings from Cloud!",
            type: "success"
          });

        } else {
          // 'all'
          if (data.globalYearFilter || data.year) {
            useAppStore.getState().setGlobalYearFilter(data.globalYearFilter || data.year);
          }
          loadFullCloudData({
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
            title: "Load Cloud Success",
            message: "Successfully downloaded all floor plans, units, and dynamic rules from Cloud!",
            type: "success"
          });
        }
      }
    } catch (err: any) {
      if (!isAuto) {
        console.error('[CloudSync Background Error]', err);
        useAppStore.getState().setToast({
          title: "Cloud Sync Error",
          message: `Lỗi đồng bộ Cloud: ${err.message || err}. Dữ liệu trên máy vẫn an toàn.`,
          type: "warning",
        });
      }
    } finally {
      setBackgroundSyncing(null);
      setSyncing(false);
    }
  };

  const handleCleanR2Garbage = async () => {
    const creds = getStoredR2Credentials();
    if (!creds) {
      alert('Chưa cấu hình Cloudflare R2 trong hệ thống.');
      return;
    }

    if (!confirm('Hệ thống sẽ quét toàn bộ R2 Bucket và xóa tất cả ảnh nền cũ/mồ côi không còn thuộc bất kỳ version nào. Bạn có muốn tiếp tục?')) {
      return;
    }

    setSyncing(true);
    setStatusText('Đang quét và thu gom file rác R2...');

    try {
      const activeData = {
        storeLocationData,
        mapVersions,
      };

      const result = await cleanOrphanR2Files(activeData, {
        onProgress: (msg) => setStatusText(msg),
      });

      if (result.deletedCount > 0) {
        alert(`🧹 Đã dọn dẹp và giải phóng thành công ${result.deletedCount} file rác trên Cloudflare R2!`);
      } else {
        alert(`✅ R2 Bucket hoàn toàn sạch sẽ! Tất cả ${result.scannedCount} file đều đang được sử dụng.`);
      }
    } catch (err: any) {
      alert(`Lỗi khi dọn rác R2: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const scopeBadgeColor = {
    edit: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    dynamic: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    review: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    all: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  }[selectedScope];

  return (
    <div className={cn("flex items-center gap-1.5 relative", className)}>
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Main Save Button with non-blocking progress */}
        <button 
          onClick={() => handleOpenSync('upload')}
          disabled={backgroundSyncing === 'upload'}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-brand-400 hover:text-brand-300 transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer",
            backgroundSyncing === 'upload' && "opacity-90 cursor-wait",
            compact ? "text-[10px] px-2 py-1" : "text-[11px]"
          )}
          title={`Lưu dữ liệu (${getScopeName(selectedScope)}) lên Cloudflare R2 & Firestore`}
        >
          {backgroundSyncing === 'upload' ? (
            <RefreshCw size={13} className="shrink-0 animate-spin text-brand-400" />
          ) : (
            <CloudUpload size={13} className="shrink-0" />
          )}
          <span className="font-bold uppercase tracking-wider">
            {backgroundSyncing === 'upload' ? 'Saving Cloud...' : 'Save Cloud'}
          </span>
          {selectedScope !== 'all' && (
            <span className={cn("text-[9px] font-extrabold uppercase px-1 py-0.2 rounded border", scopeBadgeColor)}>
              {selectedScope}
            </span>
          )}
        </button>
        
        {/* Main Load Button with non-blocking progress */}
        <button 
          onClick={() => handleOpenSync('download')}
          disabled={backgroundSyncing === 'download'}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-purple-400 hover:text-purple-300 transition-all shadow-sm active:scale-95 touch-manipulation cursor-pointer",
            backgroundSyncing === 'download' && "opacity-90 cursor-wait",
            compact ? "text-[10px] px-2 py-1" : "text-[11px]"
          )}
          title={`Tải dữ liệu (${getScopeName(selectedScope)}) từ Cloudflare R2`}
        >
          {backgroundSyncing === 'download' ? (
            <RefreshCw size={13} className="shrink-0 animate-spin text-purple-400" />
          ) : (
            <CloudDownload size={13} className="shrink-0" />
          )}
          <span className="font-bold uppercase tracking-wider">
            {backgroundSyncing === 'download' ? 'Loading Cloud...' : 'Load Cloud'}
          </span>
          {selectedScope !== 'all' && (
            <span className={cn("text-[9px] font-extrabold uppercase px-1 py-0.2 rounded border", scopeBadgeColor)}>
              {selectedScope}
            </span>
          )}
        </button>

          {/* Scope Selector Dropdown Button */}
          <div className="relative">
            <button
              onClick={() => setShowScopeDropdown(!showScopeDropdown)}
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Chọn phạm vi Lưu / Tải Cloud (Edit, Dynamic, Review, Toàn bộ)"
            >
              <ChevronDown size={12} className={cn("transition-transform duration-200", showScopeDropdown && "rotate-180")} />
            </button>

            {showScopeDropdown && (
              <div 
                className="absolute right-0 top-full mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-1 min-w-[170px] flex flex-col gap-1 backdrop-blur-xl"
                onMouseLeave={() => setShowScopeDropdown(false)}
              >
                <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-800">
                  Phạm vi Cloud Sync:
                </div>
                <button
                  onClick={() => { setSelectedScope('edit'); setShowScopeDropdown(false); }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer",
                    selectedScope === 'edit' ? "bg-blue-500/20 text-blue-300" : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Edit3 size={12} className="text-blue-400" />
                    <span>Tab Edit (Bản vẽ)</span>
                  </span>
                  {selectedScope === 'edit' && <Check size={12} />}
                </button>
                <button
                  onClick={() => { setSelectedScope('dynamic'); setShowScopeDropdown(false); }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer",
                    selectedScope === 'dynamic' ? "bg-amber-500/20 text-amber-300" : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <GitMerge size={12} className="text-amber-400" />
                    <span>Tab Dynamic (Rules)</span>
                  </span>
                  {selectedScope === 'dynamic' && <Check size={12} />}
                </button>
                <button
                  onClick={() => { setSelectedScope('review'); setShowScopeDropdown(false); }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer",
                    selectedScope === 'review' ? "bg-emerald-500/20 text-emerald-300" : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Eye size={12} className="text-emerald-400" />
                    <span>Tab Review (Nhãn)</span>
                  </span>
                  {selectedScope === 'review' && <Check size={12} />}
                </button>
                <button
                  onClick={() => { setSelectedScope('all'); setShowScopeDropdown(false); }}
                  className={cn(
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left border-t border-slate-800 mt-0.5 cursor-pointer",
                    selectedScope === 'all' ? "bg-purple-500/20 text-purple-300" : "text-slate-300 hover:bg-slate-800"
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    <Layers size={12} className="text-purple-400" />
                    <span>Tất cả (All Tabs)</span>
                  </span>
                  {selectedScope === 'all' && <Check size={12} />}
                </button>
              </div>
            )}
          </div>

          {/* R2 Credentials Settings Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Cài đặt khóa kết nối Cloudflare R2"
          >
            <Settings size={12} />
          </button>

          {showCleanButton && (
            <button 
              onClick={handleCleanR2Garbage}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-700/50 text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm active:scale-95 cursor-pointer",
                compact ? "text-[10px] px-1.5 py-1" : "text-[11px]"
              )}
              title="Dọn dẹp & giải phóng tất cả ảnh nền mồ côi trên Cloudflare R2"
            >
              <Sparkles size={12} className="shrink-0" />
              <span className="font-bold uppercase tracking-widest hidden md:inline">Clean R2</span>
            </button>
          )}
        </div>

      <R2UploadModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStartExport={() => executeSync('upload', false, selectedScope)}
        uploading={false}
        uploadProgress={0}
      />
    </div>
  );
}
