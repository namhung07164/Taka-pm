import React, { useState } from 'react';
import { CloudUpload, CloudDownload, RefreshCw } from 'lucide-react';
import { uploadSingleR2File, purgeOldR2BackgroundImages, getStoredR2Credentials } from '../../lib/r2Upload';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { useDataStore } from '../../DataContext';
import R2UploadModal from '../R2UploadModal';

export default function CloudSyncManager() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [actionType, setActionType] = useState<'upload' | 'download' | null>(null);

  const { 
    store,
    location,
    storeLocationData,
    setStoreLocationData,
    mapUnits, mapVersions, setMapUnits, setMapVersions,
    activeMapVersionId, setActiveMapVersionId,
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
    units, setUnits
  } = useDataStore();

  const handleOpenSync = (type: 'upload' | 'download') => {
    setActionType(type);
    setIsModalOpen(true);
  };

  const executeSync = async () => {
    setIsModalOpen(false);
    setSyncing(true);
    setProgress(10);
    setStatusText(actionType === 'upload' ? 'Chuẩn bị dữ liệu...' : 'Đang kết nối Cloudflare R2...');

    try {
      const creds = getStoredR2Credentials();
      if (!creds) {
        throw new Error('Thiếu thông tin cấu hình Cloudflare R2 trong cài đặt!');
      }

      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
      });

      if (actionType === 'upload') {
        // Enforce Single Version on Cloud: save the currently active version and clean up old files
        const baseActive = mapVersions.find(v => v.id === activeMapVersionId) || mapVersions[0];
        const activeVersion = baseActive || {
          id: 'v1',
          name: 'Phiên bản chính',
          groups: [],
          groupMappings: {},
          backgroundUrl: null,
          backgroundScale: 1,
          backgroundPos: { x: 0, y: 0 },
        };

        const activeBgName = `bg_active_version.jpeg`;
        let finalBgUrl = activeVersion.backgroundUrl;

        // 1 & 2: Process ALL versions across ALL locations and upload their backgrounds if needed
        setProgress(25);
        setStatusText('Đang kiểm tra và tải lên ảnh nền của tất cả vị trí...');
        
        const updatedStoreLocationData = { ...storeLocationData };
        // Ensure current active store/location is synced to storeLocationData
        const currentActiveKey = `${store}_${location}`;
        updatedStoreLocationData[currentActiveKey] = {
            mapUnits,
            mapVersions,
            activeMapVersionId
        };

        const allValidBgNames: string[] = [];

        for (const pKey in updatedStoreLocationData) {
            const partition = updatedStoreLocationData[pKey];
            if (!partition?.mapVersions) continue;
            
            for (let i = 0; i < partition.mapVersions.length; i++) {
                const v = partition.mapVersions[i];
                let finalBgUrl = v.backgroundUrl;
                
                if (finalBgUrl && (finalBgUrl.startsWith('blob:') || finalBgUrl.startsWith('data:'))) {
                    setStatusText(`Đang tải lên ảnh nền phiên bản: [${pKey}] ${v.name}...`);
                    const res = await fetch(finalBgUrl);
                    const blob = await res.blob();
                    const bgName = `bg_${v.id}_${Date.now()}.jpeg`;
                    
                    const uploadRes = await uploadSingleR2File({ name: bgName, blob }, creds, s3);
                    if (!uploadRes.success) {
                        throw new Error(`Lỗi tải lên ảnh nền ${v.name}: ${uploadRes.error}`);
                    }
                    finalBgUrl = `r2://${uploadRes.name}`;
                }
                
                partition.mapVersions[i] = { ...v, backgroundUrl: finalBgUrl };
                if (finalBgUrl && finalBgUrl.startsWith('r2://')) {
                    allValidBgNames.push(finalBgUrl.replace('r2://', ''));
                }
            }
        }

        setProgress(50);
        setStatusText('Đang dọn dẹp các ảnh nền cũ trên Cloudflare R2...');
        try {
          // This would need to be updated to support an array of keepBgNames
          const purgeBgResult = await purgeOldR2BackgroundImages(allValidBgNames, creds, s3, (status) => setStatusText(status));
          if (purgeBgResult.deletedCount > 0) {
            console.log(`[CloudSync] Đã xóa ${purgeBgResult.deletedCount} ảnh nền cũ trên R2`);
          }
        } catch (cleanErr) {
          console.warn('[CloudSync] Lỗi dọn dẹp ảnh nền cũ:', cleanErr);
        }

        // 3. Build the config data
        setProgress(75);
        setStatusText('Đang lưu cấu hình JSON toàn bộ vị trí lên Cloudflare R2...');
        const configData = {
          storeLocationData: updatedStoreLocationData,
          store,
          location,
          mapUnits,
          versions: updatedStoreLocationData[currentActiveKey].mapVersions, // legacy support
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
          timestamp: Date.now()
        };
        const configBlob = new Blob([JSON.stringify(configData)], { type: 'application/json' });
        
        const uploadRes = await uploadSingleR2File({ name: 'mapping_config.json', blob: configBlob }, creds, s3);
        
        if (!uploadRes.success) {
           throw new Error(`Lỗi tải lên cấu hình: ${uploadRes.error}`);
        }

        // Update local state
        setMapVersions(updatedStoreLocationData[currentActiveKey].mapVersions);
        setStoreLocationData(updatedStoreLocationData);
        
        setProgress(100);
        setStatusText('Hoàn tất! Đã lưu toàn bộ bản vẽ và dọn sạch các bản cũ trên R2.');
        
      } else if (actionType === 'download') {
        setProgress(30);
        setStatusText('Đang tải cấu hình từ R2...');
        
        const command = new GetObjectCommand({
          Bucket: creds.bucketName,
          Key: 'mapping_config.json'
        });
        
        const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const res = await fetch(signedUrl);
        if (!res.ok) throw new Error('Không tìm thấy file cấu hình trên Cloudflare R2.');
        
        const data = await res.json();
        
        setProgress(70);
        setStatusText('Đang phân giải link ảnh...');
        
        // Resolve r2:// links
        const loadedVersions = data.versions || [];
        for (let i = 0; i < loadedVersions.length; i++) {
           const v = loadedVersions[i];
           if (v.backgroundUrl && v.backgroundUrl.startsWith('r2://')) {
              const imgKey = v.backgroundUrl.replace('r2://', '');
              const imgCommand = new GetObjectCommand({
                Bucket: creds.bucketName,
                Key: imgKey
              });
              const imgUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }); // 7 days
              loadedVersions[i].backgroundUrl = imgUrl;
           }
        }

        // Resolve links in storeLocationData if present
        if (data.storeLocationData) {
          const loadedStoreLocationData = data.storeLocationData;
          for (const pKey in loadedStoreLocationData) {
            const p = loadedStoreLocationData[pKey];
            if (p && p.mapVersions) {
              for (let j = 0; j < p.mapVersions.length; j++) {
                const pv = p.mapVersions[j];
                if (pv.backgroundUrl && pv.backgroundUrl.startsWith('r2://')) {
                  const imgKey = pv.backgroundUrl.replace('r2://', '');
                  const imgCommand = new GetObjectCommand({ Bucket: creds.bucketName, Key: imgKey });
                  const imgUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 });
                  p.mapVersions[j].backgroundUrl = imgUrl;
                }
              }
            }
          }

          setStoreLocationData(loadedStoreLocationData);

          const activeKey = `${store}_${location}`;
          const currentPartition = loadedStoreLocationData[activeKey] || (data.store && data.location && loadedStoreLocationData[`${data.store}_${data.location}`]) || Object.values(loadedStoreLocationData)[0];
          if (currentPartition) {
            setMapUnits(currentPartition.mapUnits || []);
            setMapVersions(currentPartition.mapVersions || []);
            setActiveMapVersionId(currentPartition.activeMapVersionId || currentPartition.mapVersions?.[0]?.id || null);
          }
        } else {
          // Backward compatibility
          const activeKey = `${data.store || store || 'HCM'}_${data.location || location || 'L1'}`;
          const initialPartition = {
            mapUnits: data.mapUnits || data.units || [],
            mapVersions: loadedVersions,
            activeMapVersionId: loadedVersions[0]?.id || null,
          };
          setStoreLocationData({ [activeKey]: initialPartition });
          setMapUnits(initialPartition.mapUnits);
          setMapVersions(initialPartition.mapVersions);
          setActiveMapVersionId(initialPartition.activeMapVersionId);
        }
        
        setUnitInfo(data.unitInfo || []);
        setClassInfo(data.classInfo || []);
        setActualClassInfo(data.actualClassInfo || []);
        setSales(data.sales || []);
        setProfits(data.profits || []);
        setSubFees(data.subFees || []);
        setMdStatus(data.mdStatus || []);
        setProjectStatus(data.projectStatus || []);
        setProjectLink(data.projectLink || []);
        setBasePlan(data.basePlan || []);
        setUnits(data.units || []);
        
        setProgress(100);
        setStatusText('Tải cấu hình thành công!');
      }

      setTimeout(() => setSyncing(false), 2000);

    } catch (err: any) {
      console.error('Cloud Sync Error:', err);
      setStatusText(`Lỗi: ${err.message}`);
      setTimeout(() => setSyncing(false), 4000);
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
