import { getStoredR2Credentials, getS3Sdk, extractR2Key, listR2Objects, deleteR2Object, R2Credentials } from '../components/PictureMapping/lib/r2Upload';

/**
 * R2 Storage Garbage Collector & Cleanup Utilities.
 * Mirrors the storageUtils.ts architecture for Firebase Storage, dedicated to Cloudflare R2 CAD/Floorplan assets.
 */

/**
 * Extracts all unique R2 object keys (bg_* images) referenced in an item, version, or full store dataset.
 */
export function extractR2ImageKeys(data: any): string[] {
  if (!data) return [];
  const keys = new Set<string>();

  const processUrl = (url: any) => {
    if (typeof url === 'string') {
      const k = extractR2Key(url);
      if (k) keys.add(k);
    }
  };

  const processVersion = (v: any) => {
    if (!v) return;
    if (v.backgroundUrl) processUrl(v.backgroundUrl);
    if (v.r2Key) processUrl(v.r2Key);
  };

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (typeof item === 'string') processUrl(item);
      else if (item && typeof item === 'object') {
        if (item.backgroundUrl || item.r2Key) processVersion(item);
        if (Array.isArray(item.mapVersions)) item.mapVersions.forEach(processVersion);
        if (Array.isArray(item.versions)) item.versions.forEach(processVersion);
      }
    });
  } else if (typeof data === 'object') {
    // Single version object
    if (data.backgroundUrl || data.r2Key) {
      processVersion(data);
    }
    // StoreLocationData partitions
    if (data.storeLocationData && typeof data.storeLocationData === 'object') {
      Object.values(data.storeLocationData).forEach((part: any) => {
        if (Array.isArray(part?.mapVersions)) part.mapVersions.forEach(processVersion);
      });
    }
    if (Array.isArray(data.mapVersions)) {
      data.mapVersions.forEach(processVersion);
    }
    if (Array.isArray(data.versions)) {
      data.versions.forEach(processVersion);
    }
  }

  return Array.from(keys);
}

/**
 * Deletes specific R2 object keys/URLs from the Cloudflare R2 bucket in the background.
 */
export async function deleteR2StorageFiles(
  keysOrUrls: string[],
  customCreds?: R2Credentials | null
): Promise<{ deletedCount: number; deletedKeys: string[] }> {
  if (!keysOrUrls || keysOrUrls.length === 0) {
    return { deletedCount: 0, deletedKeys: [] };
  }

  const creds = customCreds || getStoredR2Credentials();
  if (!creds || !creds.accountId || !creds.bucketName) {
    console.warn('[R2 GC] Bỏ qua xóa file: Chưa cấu hình thông tin R2 credentials.');
    return { deletedCount: 0, deletedKeys: [] };
  }

  const targetKeys = Array.from(
    new Set(keysOrUrls.map((k) => extractR2Key(k) || k).filter((k): k is string => !!k && typeof k === 'string'))
  );

  if (targetKeys.length === 0) {
    return { deletedCount: 0, deletedKeys: [] };
  }

  try {
    const { S3Client } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });

    const deletedKeys: string[] = [];
    for (const key of targetKeys) {
      try {
        const ok = await deleteR2Object(key, creds, s3);
        if (ok) {
          deletedKeys.push(key);
          console.log(`[R2 GC] Đã dọn dẹp file mồ côi trên R2: ${key}`);
        }
      } catch (err) {
        console.warn(`[R2 GC] Không thể xóa file ${key}:`, err);
      }
    }

    return { deletedCount: deletedKeys.length, deletedKeys };
  } catch (err) {
    console.error('[R2 GC] Lỗi khởi tạo kết nối xóa file R2:', err);
    return { deletedCount: 0, deletedKeys: [] };
  }
}

/**
 * Scans all files on R2 bucket and deletes any orphan background images
 * that are no longer referenced anywhere in activeData (all floors & versions).
 */
export async function cleanOrphanR2Files(
  activeData: any,
  options?: {
    customCreds?: R2Credentials | null;
    onProgress?: (status: string) => void;
  }
): Promise<{ scannedCount: number; deletedCount: number; deletedKeys: string[] }> {
  const creds = options?.customCreds || getStoredR2Credentials();
  if (!creds || !creds.accountId || !creds.bucketName) {
    return { scannedCount: 0, deletedCount: 0, deletedKeys: [] };
  }

  try {
    options?.onProgress?.('Đang kết nối R2 để quét các file ảnh nền...');
    const { S3Client } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    });

    // 1. List all background files on R2
    const allR2Keys = await listR2Objects(creds, s3, 'bg_');
    if (allR2Keys.length === 0) {
      options?.onProgress?.('Không có file ảnh nền nào cần quét trên R2.');
      return { scannedCount: 0, deletedCount: 0, deletedKeys: [] };
    }

    // 2. Extract all actively used keys across all locations, floors & versions
    const activeKeys = new Set(extractR2ImageKeys(activeData).map((k) => k.toLowerCase()));

    // 3. Find orphaned files (present in R2 but NOT referenced in activeData)
    const orphanKeys = allR2Keys.filter((key) => {
      const lower = key.toLowerCase();
      return lower.startsWith('bg_') && !activeKeys.has(lower);
    });

    if (orphanKeys.length === 0) {
      options?.onProgress?.('Toàn bộ file trên R2 đều đang được sử dụng hợp lệ (0 file rác).');
      return { scannedCount: allR2Keys.length, deletedCount: 0, deletedKeys: [] };
    }

    options?.onProgress?.(`Tìm thấy ${orphanKeys.length} file rác mồ côi. Đang tiến hành thu gom...`);

    const deletedKeys: string[] = [];
    for (let i = 0; i < orphanKeys.length; i++) {
      const key = orphanKeys[i];
      options?.onProgress?.(`Đang xóa file rác: ${key} (${i + 1}/${orphanKeys.length})...`);
      const ok = await deleteR2Object(key, creds, s3);
      if (ok) {
        deletedKeys.push(key);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    options?.onProgress?.(`Đã thu gom và giải phóng thành công ${deletedKeys.length} file rác trên R2!`);
    return { scannedCount: allR2Keys.length, deletedCount: deletedKeys.length, deletedKeys };
  } catch (err) {
    console.error('[R2 GC] Lỗi trong quá trình quét và dọn dẹp R2:', err);
    return { scannedCount: 0, deletedCount: 0, deletedKeys: [] };
  }
}
