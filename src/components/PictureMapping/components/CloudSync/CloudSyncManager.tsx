import React, { useState } from 'react';
import { CloudUpload, CloudDownload, RefreshCw, Sparkles, ChevronDown, Check, Layers, GitMerge, Eye, Edit3 } from 'lucide-react';
import { uploadSingleR2File, purgeOldR2BackgroundImages, getStoredR2Credentials, getStoredR2CredentialsAsync, extractR2Key, getS3Sdk, downloadR2JsonFile } from '../../lib/r2Upload';
import { cleanOrphanR2Files } from '../../../../lib/r2StorageUtils';
import { useDataStore, StoreLocationRecord } from '../../DataContext';
import { MapVersion } from '../DataMapping/types';
import R2UploadModal from '../R2UploadModal';
import { cn } from '../../lib/utils';

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
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);

  // Sync internal selectedScope when prop scope changes
  React.useEffect(() => {
    setSelectedScope(scope);
  }, [scope]);

  const { 
    store,
    location,
    storeLocationData,
    setStoreLocationData,
    mapUnits, mapVersions, setMapUnits, setMapVersions,
    activeMapVersionId, setActiveMapVersionId,
    reviewSelectedLabels, setReviewSelectedLabels,
    reviewLabelColors, setReviewLabelColors,
    unitInfo, setUnitInfo,
    classInfo, setClassInfo,
    actualClassInfo, setActualClassInfo,
    sales, setSales,
    profits, setProfits,
    subFees, setSubFees,
    mdStatus, setMdStatus,
    projectStatus, setProjectStatus,
    projectLink, setProjectLink,
    basePlan, setBasePlan,
    units, setUnits,
    loadFullCloudData
  } = useDataStore();

  React.useEffect(() => {
    let isMounted = true;
    async function checkAutoLoad() {
      if (hasAutoLoaded) return;
      if (Object.keys(storeLocationData).length === 0 && mapVersions.length === 0) {
        const creds = await getStoredR2CredentialsAsync();
        if (isMounted && creds && creds.accountId && creds.accessKeyId) {
          setHasAutoLoaded(true);
          executeSync('download', true, 'all');
        }
      }
    }
    checkAutoLoad();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoLoaded, storeLocationData, mapVersions.length]);

  const handleOpenSync = (type: 'upload' | 'download', targetScope?: CloudSyncScope) => {
    setActionType(type);
    if (targetScope) setSelectedScope(targetScope);
    setIsModalOpen(true);
  };

  const getScopeName = (sc: CloudSyncScope) => {
    switch (sc) {
      case 'edit': return 'Edit';
      case 'dynamic': return 'Dynamic';
      case 'review': return 'Review';
      case 'all': return 'All';
    }
  };

  const executeSync = async (forceAction?: 'upload' | 'download', isAuto = false, forceScope?: CloudSyncScope) => {
    const currentAction = forceAction || actionType;
    const currentScope = forceScope || selectedScope;
    setIsModalOpen(false);
    setSyncing(true);
    setProgress(10);
    setStatusText(currentAction === 'upload' ? `Chuẩn bị lưu [${getScopeName(currentScope)}]...` : `Đang tải [${getScopeName(currentScope)}] từ R2...`);

    try {
      const creds = await getStoredR2CredentialsAsync();
      if (!creds) {
        throw new Error('Thiếu thông tin cấu hình Cloudflare R2 trong cài đặt!');
      }

      const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });

      // Fetch existing cloud configuration first for surgical scoped merges
      let existingCloudData: any = null;
      try {
        const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', creds, s3);
        if (downloadRes.success && downloadRes.data) {
          existingCloudData = downloadRes.data;
        }
      } catch (e) {
        console.warn('Could not pre-fetch mapping_config.json for merge:', e);
      }

      const currentActiveKey = `${store}_${location}`;
      const updatedStoreLocationData = { ...storeLocationData };
      updatedStoreLocationData[currentActiveKey] = {
        mapUnits,
        mapVersions,
        activeMapVersionId,
      };

      if (currentAction === 'upload') {
        setProgress(25);
        const allValidBgNames: string[] = [];
        const cloudStoreLocationData: Record<string, StoreLocationRecord> = existingCloudData?.storeLocationData ? { ...existingCloudData.storeLocationData } : {};
        const localStoreLocationData: Record<string, StoreLocationRecord> = { ...updatedStoreLocationData };

        // 1. Process Background Images & Partitions
        for (const pKey in updatedStoreLocationData) {
          const partition = updatedStoreLocationData[pKey];
          if (!partition) continue;

          const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
          const pLoc = pKey.split('_')[1] || 'L1';
          const existingCloudPart = cloudStoreLocationData[pKey];

          const pUnits = (partition.mapUnits || []).map(u => ({
            ...u,
            store: u.store || pStore,
            location: u.location || pLoc,
            visible: u.visible !== false,
            locked: !!u.locked,
            fill: (u.fill && u.fill !== 'rgba(0, 0, 0, 0.001)' && u.fill !== 'transparent') ? u.fill : '#3b82f6',
          }));

          const pVersionsCloud: MapVersion[] = [];
          const pVersionsLocal: MapVersion[] = [];

          for (let i = 0; i < (partition.mapVersions || []).length; i++) {
            const v = partition.mapVersions[i];
            const currentBg = v.backgroundUrl;
            let r2Key = extractR2Key(currentBg) || (v as any).r2Key || null;
            let displayUrl = currentBg;

            if (currentBg && (currentBg.startsWith('blob:') || currentBg.startsWith('data:'))) {
              setStatusText(`Đang tải ảnh nền: [${pKey}] ${v.name}...`);
              const res = await fetch(currentBg);
              const blob = await res.blob();
              const bgName = `bg_${v.id}_${Date.now()}.jpeg`;

              const uploadRes = await uploadSingleR2File({ name: bgName, blob }, creds, s3);
              if (!uploadRes.success) {
                throw new Error(`Lỗi tải lên ảnh nền ${v.name}: ${uploadRes.error}`);
              }
              r2Key = uploadRes.name;

              const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key }), { expiresIn: 3600 * 24 * 7 });
              displayUrl = signedUrl;
            } else if (r2Key) {
              if (!displayUrl || displayUrl.startsWith('r2://')) {
                try {
                  displayUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key }), { expiresIn: 3600 * 24 * 7 });
                } catch (e) {
                  console.warn('Could not generate signed url for key', r2Key, e);
                }
              }
            }

            if (r2Key) {
              allValidBgNames.push(r2Key);
            }

            // Version for Cloud: keep groups & mappings based on scope
            const existingCloudVer = existingCloudPart?.mapVersions?.find((cv: any) => cv.id === v.id || cv.name === v.name);

            const cloudGroups = (currentScope === 'edit' && existingCloudVer)
              ? (existingCloudVer.groups || v.groups || [])
              : (v.groups || []);

            const cloudMappings = (currentScope === 'edit' && existingCloudVer)
              ? (existingCloudVer.groupMappings || v.groupMappings || {})
              : (v.groupMappings || {});

            pVersionsCloud.push({
              ...v,
              store: v.store || pStore,
              location: v.location || pLoc,
              backgroundUrl: r2Key ? `r2://${r2Key}` : displayUrl,
              groups: cloudGroups,
              groupMappings: cloudMappings,
              isDynamicActive: true,
            });

            pVersionsLocal.push({
              ...v,
              store: v.store || pStore,
              location: v.location || pLoc,
              backgroundUrl: displayUrl,
              groups: v.groups || [],
              groupMappings: v.groupMappings || {},
              isDynamicActive: true,
            });
          }

          // Merge according to scope
          if (currentScope === 'edit') {
            cloudStoreLocationData[pKey] = {
              mapUnits: pUnits,
              mapVersions: pVersionsCloud,
              activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
            };
          } else if (currentScope === 'dynamic') {
            cloudStoreLocationData[pKey] = {
              mapUnits: existingCloudPart?.mapUnits || pUnits,
              mapVersions: pVersionsCloud,
              activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
            };
          } else if (currentScope === 'review') {
            cloudStoreLocationData[pKey] = {
              mapUnits: existingCloudPart?.mapUnits || pUnits,
              mapVersions: existingCloudPart?.mapVersions || pVersionsCloud,
              activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
            };
          } else {
            // 'all'
            cloudStoreLocationData[pKey] = {
              mapUnits: pUnits,
              mapVersions: pVersionsCloud,
              activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
            };
          }

          localStoreLocationData[pKey] = {
            mapUnits: pUnits,
            mapVersions: pVersionsLocal,
            activeMapVersionId: partition.activeMapVersionId || (pVersionsLocal[0]?.id ?? null),
          };
        }

        // 2. Dọn dẹp ảnh mồ côi nếu scope có liên quan tới edit hoặc all
        if ((currentScope === 'edit' || currentScope === 'all') && allValidBgNames.length > 0) {
          setProgress(60);
          setStatusText('Đang dọn dẹp ảnh nền cũ trên R2...');
          try {
            await purgeOldR2BackgroundImages(allValidBgNames, creds, s3, (status) => setStatusText(status));
          } catch (cleanErr) {
            console.warn('[CloudSync] Lỗi dọn dẹp ảnh nền cũ:', cleanErr);
          }
        }

        // 3. Build config Data
        setProgress(80);
        setStatusText(`Đang lưu cấu hình [${getScopeName(currentScope)}] lên R2...`);

        const activeCloudPartition = cloudStoreLocationData[currentActiveKey] || Object.values(cloudStoreLocationData)[0] || { mapUnits: [], mapVersions: [], activeMapVersionId: null };

        const configData = {
          ...(existingCloudData || {}),
          storeLocationData: cloudStoreLocationData,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels: currentScope === 'dynamic' ? (existingCloudData?.reviewSelectedLabels || reviewSelectedLabels) : (reviewSelectedLabels || []),
          reviewLabelColors: currentScope === 'dynamic' ? (existingCloudData?.reviewLabelColors || reviewLabelColors) : (reviewLabelColors || {}),
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

        const configBlob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
        const uploadRes = await uploadSingleR2File({ name: 'mapping_config.json', blob: configBlob }, creds, s3);
        if (!uploadRes.success) {
          throw new Error(`Lỗi tải lên cấu hình: ${uploadRes.error}`);
        }

        // 4. Update local React store
        loadFullCloudData({
          storeLocationData: localStoreLocationData,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels: reviewSelectedLabels || [],
          reviewLabelColors: reviewLabelColors || {},
        });

        setProgress(100);
        if (currentScope === 'edit') {
          setStatusText('Hoàn tất! Đã lưu bản vẽ & tọa độ (Tab Edit) lên Cloud.');
        } else if (currentScope === 'dynamic') {
          setStatusText('Hoàn tất! Đã lưu quy tắc & nhóm phân loại (Tab Dynamic) lên Cloud.');
        } else if (currentScope === 'review') {
          setStatusText('Hoàn tất! Đã lưu cấu hình review & nhãn (Tab Review) lên Cloud.');
        } else {
          setStatusText('Hoàn tất! Đã lưu toàn bộ bản vẽ, dynamic và review lên Cloud.');
        }

      } else if (currentAction === 'download') {
        setProgress(20);
        setStatusText(`Đang tải dữ liệu [${getScopeName(currentScope)}] từ R2...`);

        const downloadRes = await downloadR2JsonFile<any>('mapping_config.json', creds, s3);

        if (!downloadRes.success || !downloadRes.data) {
          if (downloadRes.notFound) {
            if (isAuto) {
              setSyncing(false);
              return;
            }
            throw new Error('Chưa có file cấu hình mapping_config.json trên R2 Bucket (Vui lòng bấm Save Cloud để lưu cấu hình đầu tiên).');
          }
          throw new Error(downloadRes.error || 'Không thể tải file cấu hình từ R2.');
        }

        const data = downloadRes.data;
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

        // Resolve background signed URLs
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
              v.isDynamicActive = true;
            }
          }
        }

        // Scoped Application to local state
        const localMergedStoreLocationData: Record<string, StoreLocationRecord> = { ...storeLocationData };

        if (currentScope === 'edit') {
          // Update ONLY coordinates & background transforms, keeping local dynamic rules
          for (const pKey in normalizedStoreLocationData) {
            const cloudPart = normalizedStoreLocationData[pKey];
            const localPart = localMergedStoreLocationData[pKey];
            if (!cloudPart) continue;

            const mergedVersions = (cloudPart.mapVersions || []).map((cv) => {
              const localV = localPart?.mapVersions?.find((lv) => lv.id === cv.id || lv.name === cv.name);
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
            store: store,
            location: location,
            activeMapVersionId: activeMapVersionId,
            reviewSelectedLabels: reviewSelectedLabels || [],
            reviewLabelColors: reviewLabelColors || {},
          });

          setProgress(100);
          setStatusText('Đã tải bản vẽ & tọa độ (Tab Edit) từ Cloud!');

        } else if (currentScope === 'dynamic') {
          // Update ONLY dynamic rules and groups, keeping local coordinates
          for (const pKey in normalizedStoreLocationData) {
            const cloudPart = normalizedStoreLocationData[pKey];
            const localPart = localMergedStoreLocationData[pKey];
            if (!cloudPart) continue;

            const mergedVersions = (localPart?.mapVersions || cloudPart.mapVersions || []).map((lv) => {
              const cloudV = cloudPart.mapVersions?.find((cv) => cv.id === lv.id || cv.name === lv.name);
              return {
                ...lv,
                groups: cloudV?.groups || lv.groups || [],
                groupMappings: cloudV?.groupMappings || lv.groupMappings || {},
                isDynamicActive: true,
              };
            });

            localMergedStoreLocationData[pKey] = {
              mapUnits: localPart?.mapUnits || cloudPart.mapUnits || [],
              mapVersions: mergedVersions,
              activeMapVersionId: localPart?.activeMapVersionId || cloudPart.activeMapVersionId || null,
            };
          }

          loadFullCloudData({
            storeLocationData: localMergedStoreLocationData,
            store: store,
            location: location,
            activeMapVersionId: activeMapVersionId,
            reviewSelectedLabels: reviewSelectedLabels || [],
            reviewLabelColors: reviewLabelColors || {},
          });

          setProgress(100);
          setStatusText('Đã tải quy tắc dynamic & nhóm (Tab Dynamic) từ Cloud!');

        } else if (currentScope === 'review') {
          // Update ONLY reviewSelectedLabels and reviewLabelColors
          loadFullCloudData({
            storeLocationData: storeLocationData,
            store: store,
            location: location,
            activeMapVersionId: activeMapVersionId,
            reviewSelectedLabels: data.reviewSelectedLabels || [],
            reviewLabelColors: data.reviewLabelColors || {},
          });

          setProgress(100);
          setStatusText('Đã tải cấu hình review & nhãn (Tab Review) từ Cloud!');

        } else {
          // 'all'
          loadFullCloudData({
            storeLocationData: normalizedStoreLocationData,
            store: data.store || store,
            location: data.location || location,
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

          setProgress(100);
          setStatusText('Tải toàn bộ cấu hình từ Cloud thành công!');
        }
      }

      setTimeout(() => setSyncing(false), 2000);

    } catch (err: any) {
      if (!isAuto) {
        console.error('Cloud Sync Error:', err);
        setStatusText(`Lỗi: ${err.message}`);
        setTimeout(() => setSyncing(false), 4000);
      } else {
        setSyncing(false);
      }
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
      {syncing ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 shadow-md">
           <RefreshCw className="animate-spin text-brand-400 shrink-0" size={13} />
           <span className="text-[10px] font-bold text-slate-200 uppercase tracking-wide truncate max-w-[200px]">{statusText}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Main Save Button */}
          <button 
            onClick={() => handleOpenSync('upload')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-brand-400 hover:text-brand-300 transition-all shadow-sm active:scale-95",
              compact ? "text-[10px] px-2 py-1" : "text-[11px]"
            )}
            title={`Lưu dữ liệu (${getScopeName(selectedScope)}) lên Cloudflare R2`}
          >
            <CloudUpload size={13} className="shrink-0" />
            <span className="font-bold uppercase tracking-wider">Save Cloud</span>
            {selectedScope !== 'all' && (
              <span className={cn("text-[9px] font-extrabold uppercase px-1 py-0.2 rounded border", scopeBadgeColor)}>
                {selectedScope}
              </span>
            )}
          </button>
          
          {/* Main Load Button */}
          <button 
            onClick={() => handleOpenSync('download')}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-purple-400 hover:text-purple-300 transition-all shadow-sm active:scale-95",
              compact ? "text-[10px] px-2 py-1" : "text-[11px]"
            )}
            title={`Tải dữ liệu (${getScopeName(selectedScope)}) từ Cloudflare R2`}
          >
            <CloudDownload size={13} className="shrink-0" />
            <span className="font-bold uppercase tracking-wider">Load Cloud</span>
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
              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors"
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
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left",
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
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left",
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
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left",
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
                    "flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors text-left border-t border-slate-800 mt-0.5",
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

          {showCleanButton && (
            <button 
              onClick={handleCleanR2Garbage}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-700/50 text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm active:scale-95",
                compact ? "text-[10px] px-1.5 py-1" : "text-[11px]"
              )}
              title="Dọn dẹp & giải phóng tất cả ảnh nền mồ côi trên Cloudflare R2"
            >
              <Sparkles size={12} className="shrink-0" />
              <span className="font-bold uppercase tracking-widest hidden md:inline">Clean R2</span>
            </button>
          )}
        </div>
      )}

      <R2UploadModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStartExport={executeSync}
        uploading={false}
        uploadProgress={0}
      />
    </div>
  );
}
