import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../../../lib/firebase';
import { StoreLocationRecord } from '../../../DataContext';
import { getStoredR2Credentials } from '../../../lib/r2Upload';
import { cleanOrphanR2Files } from '../../../../../lib/r2StorageUtils';
import type { CloudSyncScope } from '../CloudSyncManager';
import { sanitizeForFirestore, withSyncTimeout } from './cloudSyncUploadService';

export async function saveCloudBackupToFirestore(params: {
  cloudStoreLocationData: Record<string, StoreLocationRecord>;
  store: 'HCM' | 'HN';
  location: string;
  targetYear: string;
  activeMapVersionId: string | null;
  reviewSelectedLabels: string[];
  reviewLabelColors: Record<string, string>;
  currentScope: CloudSyncScope;
  timestamp: number;
}): Promise<boolean> {
  const {
    cloudStoreLocationData,
    store,
    location,
    targetYear,
    activeMapVersionId,
    reviewSelectedLabels,
    reviewLabelColors,
    currentScope,
    timestamp,
  } = params;

  try {
    const firestoreStoreLocationData: Record<string, any> = {};
    for (const key in cloudStoreLocationData) {
      const part = cloudStoreLocationData[key];
      if (!part) continue;
      firestoreStoreLocationData[key] = {
        activeMapVersionId: part.activeMapVersionId || null,
        mapUnits: (part.mapUnits || []).map((u) => ({
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
          size: u.size ?? u.sizeM2 ?? null,
          sizeM2: u.sizeM2 ?? u.size ?? null,
          groupId: (u as any).groupId || null,
          groupName: (u as any).groupName || null,
        })),
        mapVersions: (part.mapVersions || []).map((v) => {
          const bg = v.backgroundUrl || '';
          const safeBg =
            bg.startsWith('data:') || bg.startsWith('blob:')
              ? (v as any).r2Key
                ? `r2://${(v as any).r2Key}`
                : ''
              : bg;
          return {
            id: v.id,
            name: v.name,
            year: v.year,
            store: v.store,
            location: v.location,
            backgroundUrl: safeBg,
            groups: (v.groups || []).map((g: any) => ({
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
            })),
            groupMappings: v.groupMappings || {},
            unitSizes: v.unitSizes || {},
            isDynamicActive: v.isDynamicActive !== false,
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
      activeMapVersionId,
      reviewSelectedLabels: reviewSelectedLabels || [],
      reviewLabelColors: reviewLabelColors || {},
      lastSavedScope: currentScope,
      updatedAt: new Date().toISOString(),
      timestamp,
    });

    const fsWrite1 = setDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'picture_mapping_config'),
      firestorePayload,
      { merge: true }
    );
    const fsWrite2 = setDoc(
      doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', 'versions'),
      {
        pictureMappingVersion: timestamp,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    await withSyncTimeout(Promise.all([fsWrite1, fsWrite2]), 5000, 'Firestore write queued');
    return true;
  } catch (fsErr: any) {
    if (fsErr?.message === 'Firestore write queued') {
      return true;
    }
    console.error('[Firestore Backup] Error saving backup:', fsErr);
    return false;
  }
}

export async function executeCleanR2GarbageAction(params: {
  storeLocationData: Record<string, StoreLocationRecord>;
  mapVersions: any[];
  setSyncing: (val: boolean) => void;
  setStatusText: (val: string) => void;
}): Promise<void> {
  const { storeLocationData, mapVersions, setSyncing, setStatusText } = params;
  const creds = getStoredR2Credentials();
  if (!creds) {
    alert('Chưa cấu hình Cloudflare R2 trong hệ thống.');
    return;
  }

  if (
    !confirm(
      'Hệ thống sẽ quét toàn bộ R2 Bucket và xóa tất cả ảnh nền cũ/mồ côi không còn thuộc bất kỳ version nào. Bạn có muốn tiếp tục?'
    )
  ) {
    return;
  }

  setSyncing(true);
  setStatusText('Đang quét và thu gom file rác R2...');

  try {
    const result = await cleanOrphanR2Files(
      { storeLocationData, mapVersions },
      { onProgress: (msg) => setStatusText(msg) }
    );

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
}
