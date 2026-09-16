import React, { useState } from 'react';
import { CloudUpload, CloudDownload, RefreshCw } from 'lucide-react';
import { uploadSingleR2File } from '../../lib/r2Upload';
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
    mapUnits, mapVersions, setMapUnits, setMapVersions,
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
      const accountId = localStorage.getItem('r2_account_id') || '';
      const accessKeyId = localStorage.getItem('r2_access_key') || '';
      const secretAccessKey = localStorage.getItem('r2_secret_key') || '';
      const bucketName = localStorage.getItem('r2_bucket_name') || '';

      if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
        throw new Error('Thiếu thông tin cấu hình R2!');
      }

      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });

      const creds = { accountId, accessKeyId, secretAccessKey, bucketName };

      if (actionType === 'upload') {
        // 1. We must extract all blob/data urls from backgroundUrl, convert to blobs, and upload them
        const newVersions = [...mapVersions];
        for (let i = 0; i < newVersions.length; i++) {
          const v = newVersions[i];
          if (v.backgroundUrl && (v.backgroundUrl.startsWith('blob:') || v.backgroundUrl.startsWith('data:'))) {
            setProgress(20 + Math.round((i / newVersions.length) * 40));
            setStatusText(`Đang tải lên ảnh nền phiên bản: ${v.name}...`);
            
            const res = await fetch(v.backgroundUrl);
            const blob = await res.blob();
            // Generate safe filename for image
            const imgName = `bg_${v.id}_${Date.now()}.jpeg`;
            
            const uploadRes = await uploadSingleR2File({ name: imgName, blob }, creds, s3);
            if (!uploadRes.success) {
               throw new Error(`Lỗi tải lên ảnh nền ${v.name}: ${uploadRes.error}`);
            }
            // Point the background url to the R2 public path or signed path
            // Usually we can just store the filename and generate presigned on load, 
            // but for simplicity, let's store the generic path. 
            // We'll store it as 'r2://' + imgName so it can be resolved later.
            newVersions[i] = { ...v, backgroundUrl: `r2://${uploadRes.name}` };
          }
        }

        // 2. Upload JSON config
        setProgress(70);
        setStatusText('Đang lưu cấu hình JSON...');
        const configData = {
          mapUnits,
          versions: newVersions,
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
        
        setProgress(100);
        setStatusText('Lưu lên Cloud thành công!');
        
      } else if (actionType === 'download') {
        setProgress(30);
        setStatusText('Đang tải cấu hình từ R2...');
        
        const command = new GetObjectCommand({
          Bucket: bucketName,
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
                Bucket: bucketName,
                Key: imgKey
              });
              const imgUrl = await getSignedUrl(s3, imgCommand, { expiresIn: 3600 * 24 * 7 }); // 7 days
              loadedVersions[i].backgroundUrl = imgUrl;
           }
        }
        
        setMapUnits(data.mapUnits || data.units || []); // handle backwards compat
        setMapVersions(loadedVersions);
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
