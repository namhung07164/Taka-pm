import React, { useState } from 'react';
import { CloudUpload, CloudDownload, RefreshCw, Sparkles } from 'lucide-react';
import { uploadSingleR2File, purgeOldR2BackgroundImages, getStoredR2Credentials, getStoredR2CredentialsAsync, extractR2Key, getS3Sdk, downloadR2JsonFile } from '../../lib/r2Upload';
import { cleanOrphanR2Files } from '../../../../lib/r2StorageUtils';
import { useDataStore, StoreLocationRecord } from '../../DataContext';
import { MapVersion } from '../DataMapping/types';
import R2UploadModal from '../R2UploadModal';

export default function CloudSyncManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);
  const [hasAutoLoaded, setHasAutoLoaded] = useState(false);


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
          executeSync('download', true);
        }
      }
    }
    checkAutoLoad();
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAutoLoaded, storeLocationData, mapVersions.length]);

  const handleOpenSync = (type: 'upload' | 'download') => {
    setActionType(type);
    setIsModalOpen(true);
  };

  const executeSync = async (forceAction?: 'upload' | 'download', isAuto = false) => {
    const currentAction = forceAction || actionType;
    setIsModalOpen(false);
    setSyncing(true);
    setProgress(10);
    setStatusText(currentAction === 'upload' ? 'Chuẩn bị dữ liệu...' : 'Đang kết nối Cloudflare R2...');

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

      if (currentAction === 'upload') {
        setProgress(20);
        setStatusText('Chuẩn bị cấu hình toàn bộ vị trí & tầng...');

        // 1. Ensure current active partition in memory is fully up to date
        const updatedStoreLocationData = { ...storeLocationData };
        const currentActiveKey = `${store}_${location}`;
        updatedStoreLocationData[currentActiveKey] = {
          mapUnits,
          mapVersions,
          activeMapVersionId,
        };

        // 2. Process all versions across all partitions: upload blobs, resolve R2 keys, prepare signed URLs for memory
        setProgress(35);
        setStatusText('Đang kiểm tra và tải ảnh nền lên Cloudflare R2...');

        const allValidBgNames: string[] = [];
        const cloudStoreLocationData: Record<string, StoreLocationRecord> = {};
        const localStoreLocationData: Record<string, StoreLocationRecord> = {};

        for (const pKey in updatedStoreLocationData) {
          const partition = updatedStoreLocationData[pKey];
          if (!partition) continue;

          const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
          const pLoc = pKey.split('_')[1] || 'L1';

          const pUnits = (partition.mapUnits || []).map(u => ({
            ...u,
            store: u.store || pStore,
            location: u.location || pLoc,
            visible: u.visible !== false,
            locked: !!u.locked,
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

              // Generate working signed URL for local display so Konva canvas doesn't break
              const signedUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key }), { expiresIn: 3600 * 24 * 7 });
              displayUrl = signedUrl;
            } else if (r2Key) {
              // Existing R2 file: ensure we have a valid displayUrl
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

            // Cloud version: canonical r2:// for R2 keys, or direct external URL
            pVersionsCloud.push({
              ...v,
              store: v.store || pStore,
              location: v.location || pLoc,
              backgroundUrl: r2Key ? `r2://${r2Key}` : displayUrl,
              groups: v.groups || [],
              groupMappings: v.groupMappings || {},
              isDynamicActive: true,
            });

            // Local version: working HTTP signed URL so browser can render image
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

          cloudStoreLocationData[pKey] = {
            mapUnits: pUnits,
            mapVersions: pVersionsCloud,
            activeMapVersionId: partition.activeMapVersionId || (pVersionsCloud[0]?.id ?? null),
          };

          localStoreLocationData[pKey] = {
            mapUnits: pUnits,
            mapVersions: pVersionsLocal,
            activeMapVersionId: partition.activeMapVersionId || (pVersionsLocal[0]?.id ?? null),
          };
        }

        // 3. Purge old unreferenced background images safely (only if we have valid ones to keep)
        if (allValidBgNames.length > 0) {
          setProgress(60);
          setStatusText('Đang dọn dẹp các ảnh nền cũ không còn sử dụng trên R2...');
          try {
            const purgeBgResult = await purgeOldR2BackgroundImages(allValidBgNames, creds, s3, (status) => setStatusText(status));
            if (purgeBgResult.deletedCount > 0) {
              console.log(`[CloudSync] Đã xóa ${purgeBgResult.deletedCount} ảnh nền cũ trên R2`);
            }
          } catch (cleanErr) {
            console.warn('[CloudSync] Lỗi dọn dẹp ảnh nền cũ:', cleanErr);
          }
        }

        // 4. Build comprehensive configData including ALL tabs and states
        setProgress(80);
        setStatusText('Đang lưu mapping_config.json lên Cloudflare R2...');

        const activeCloudPartition = cloudStoreLocationData[currentActiveKey] || Object.values(cloudStoreLocationData)[0] || { mapUnits: [], mapVersions: [], activeMapVersionId: null };

        const configData = {
          storeLocationData: cloudStoreLocationData,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels: reviewSelectedLabels || [],
          reviewLabelColors: reviewLabelColors || {},
          // Legacy fallbacks for compatibility with older viewers
          mapUnits: activeCloudPartition.mapUnits,
          versions: activeCloudPartition.mapVersions,
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
          timestamp: Date.now(),
        };

        const configBlob = new Blob([JSON.stringify(configData, null, 2)], { type: 'application/json' });
        const uploadRes = await uploadSingleR2File({ name: 'mapping_config.json', blob: configBlob }, creds, s3);
        if (!uploadRes.success) {
          throw new Error(`Lỗi tải lên cấu hình: ${uploadRes.error}`);
        }

        // 5. Update local React store atomically with working display URLs
        loadFullCloudData({
          storeLocationData: localStoreLocationData,
          store,
          location,
          activeMapVersionId,
          reviewSelectedLabels: reviewSelectedLabels || [],
          reviewLabelColors: reviewLabelColors || {},
        });

        setProgress(100);
        setStatusText('Hoàn tất! Đã lưu toàn bộ bản vẽ, điều kiện dynamic và review lên Cloud.');

      } else if (currentAction === 'download') {
        setProgress(20);
        setStatusText('Đang tải mapping_config.json từ R2...');

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
        setStatusText('Đang phân giải liên kết ảnh và cấu hình các tầng...');

        // Convert data into normalized storeLocationData
        let normalizedStoreLocationData: Record<string, StoreLocationRecord> = {};

        if (data.storeLocationData && typeof data.storeLocationData === 'object') {
          normalizedStoreLocationData = data.storeLocationData;
        } else if (Array.isArray(data.versions) || Array.isArray(data.mapUnits) || Array.isArray(data.units)) {
          // Legacy format fallback
          const legacyKey = `${data.store || store || 'HCM'}_${data.location || location || 'L1'}`;
          normalizedStoreLocationData = {
            [legacyKey]: {
              mapUnits: data.mapUnits || data.units || [],
              mapVersions: data.versions || [],
              activeMapVersionId: data.activeMapVersionId || data.versions?.[0]?.id || null,
            },
          };
        }

        // Resolve all R2 background images across all partitions
        for (const pKey in normalizedStoreLocationData) {
          const partition = normalizedStoreLocationData[pKey];
          if (!partition) continue;

          const pStore = (pKey.split('_')[0] === 'HN' ? 'HN' : 'HCM') as 'HCM' | 'HN';
          const pLoc = pKey.split('_')[1] || 'L1';

          // Ensure mapUnits have default flags
          partition.mapUnits = (partition.mapUnits || []).map(u => ({
            ...u,
            store: u.store || pStore,
            location: u.location || pLoc,
            visible: u.visible !== false,
            locked: !!u.locked,
          }));

          // Process mapVersions
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

              // Ensure groups, mappings and flags are preserved
              v.store = v.store || pStore;
              v.location = v.location || pLoc;
              v.groups = v.groups || [];
              v.groupMappings = v.groupMappings || {};
              v.isDynamicActive = true;
            }
          }
        }

        setProgress(85);
        setStatusText('Đang nạp dữ liệu vào ứng dụng...');

        // Atomically load all cloud data into Zustand store
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
        setStatusText('Tải cấu hình thành công đầy đủ!');
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

  return (
    <div className="flex items-center gap-2 mr-2 border-r border-slate-700/50 pr-4">
      {syncing ? (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700">
           <RefreshCw className="animate-spin text-brand-400" size={14} />
           <span className="text-[10px] font-bold text-slate-300 uppercase">{statusText}</span>
        </div>
      ) : (
        <>
          <button 
            onClick={() => handleOpenSync('upload')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-brand-400 hover:text-brand-300 transition-colors shadow-sm"
            title="Lưu tất cả cấu hình & ảnh nền lên R2 Cloudflare"
          >
            <CloudUpload size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Save Cloud</span>
          </button>
          
          <button 
            onClick={() => handleOpenSync('download')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-purple-400 hover:text-purple-300 transition-colors shadow-sm"
            title="Tải cấu hình & ảnh nền từ R2 Cloudflare"
          >
            <CloudDownload size={14} />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden sm:inline">Load Cloud</span>
          </button>

          <button 
            onClick={handleCleanR2Garbage}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-950/40 border border-slate-700 hover:border-emerald-700/50 text-emerald-400 hover:text-emerald-300 transition-colors shadow-sm"
            title="Dọn dẹp & giải phóng tất cả ảnh nền mồ côi trên Cloudflare R2"
          >
            <Sparkles size={13} />
            <span className="text-[10px] font-bold uppercase tracking-widest hidden md:inline">Clean R2</span>
          </button>
        </>
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
