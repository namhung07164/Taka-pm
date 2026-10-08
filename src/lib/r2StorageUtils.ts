import { getStoredR2Credentials, getS3Sdk, extractR2Key, listR2Objects, deleteR2Object, R2Credentials } from '../components/PictureMapping/lib/r2Upload';
import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from './firebase';
import { useAppStore } from '../store/useAppStore';
import { compressImageToWebp } from './imageCompression';

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

/**
 * Uploads a picture file to Cloudflare R2 bucket under `Taka-Pm-folder/`
 * and returns the public HTTP URL: https://hcm.taka-pm.org/Taka-Pm-folder/<filename>
 */
export async function uploadPictureToTakaFolder(
  file: File,
  unitCode?: string,
  store?: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  let creds = getStoredR2Credentials();
  if (!creds) {
    try {
      const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.accountId && data.accessKeyId && data.secretAccessKey && data.bucketName) {
          creds = {
            accountId: data.accountId,
            accessKeyId: data.accessKeyId,
            secretAccessKey: data.secretAccessKey,
            bucketName: data.bucketName,
          };
          useAppStore.getState().setR2Config(data);
        }
      }
    } catch (e) {
      console.error("[R2 Upload] Error fetching R2 credentials:", e);
    }
  }

  if (!creds) {
    return { success: false, error: "Chưa cấu hình thông tin Cloudflare R2 (r2_credentials)." };
  }

  try {
    const { S3Client, PutObjectCommand } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: creds.accessKeyId.trim(),
        secretAccessKey: creds.secretAccessKey.trim(),
      },
    });

    // Auto-compress photo to ultra-lightweight WebP format (Canva & Cloudinary standard: max 1920px, quality 0.82)
    let uploadFile = file;
    let compressionInfo = '';
    try {
      const compressed = await compressImageToWebp(file, { maxWidth: 1920, maxHeight: 1920, quality: 0.82 });
      uploadFile = compressed.file;
      if (compressed.compressionRatio > 0) {
        compressionInfo = ` (Đã nén ${(compressed.originalSize / 1024).toFixed(0)}KB → ${(compressed.compressedSize / 1024).toFixed(0)}KB, tiết kiệm ${compressed.compressionRatio}%)`;
      }
    } catch (compressErr) {
      console.warn('[R2 Upload] Lỗi nén WebP, sử dụng file gốc:', compressErr);
    }

    const cleanName = uploadFile.name.replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
    const storePrefix = store ? `${store.toUpperCase().trim()}_` : '';
    const prefix = unitCode ? `${unitCode.replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    const keyName = `${storePrefix}${prefix}${Date.now()}_${cleanName}`;
    const fullKey = `Taka-Pm-folder/${keyName}`;

    const arrayBuffer = await uploadFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const command = new PutObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: fullKey,
      Body: uint8Array,
      ContentType: uploadFile.type || 'image/webp',
      CacheControl: 'public, max-age=604800, immutable',
    });

    await s3.send(command);

    const publicUrl = `https://hcm.taka-pm.org/${fullKey}`;
    return { success: true, publicUrl, compressionInfo } as any;
  } catch (err: any) {
    console.error("[R2 Upload] Failed to upload picture to Taka-Pm-folder:", err);
    return { success: false, error: err?.message || "Lỗi tải ảnh lên Cloudflare R2." };
  }
}

/**
 * Permanently deletes an image file from Cloudflare R2 Cloud Storage.
 * Handles both full public URLs (e.g. https://hcm.taka-pm.org/Taka-Pm-folder/file.jpg),
 * r2:// protocol links, and direct key names, ensuring zero leftover files or versions on R2.
 */
export async function deleteR2ImageCleanly(
  urlOrKey: string,
  customCreds?: R2Credentials | null
): Promise<{ success: boolean; deletedKeys: string[] }> {
  if (!urlOrKey || typeof urlOrKey !== 'string') {
    return { success: false, deletedKeys: [] };
  }

  const trimmed = urlOrKey.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return { success: false, deletedKeys: [] };
  }

  let creds = customCreds || getStoredR2Credentials();
  if (!creds) {
    try {
      const snap = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"));
      if (snap.exists()) {
        const data = snap.data() as any;
        if (data.accountId && data.accessKeyId && data.secretAccessKey && data.bucketName) {
          creds = {
            accountId: data.accountId,
            accessKeyId: data.accessKeyId,
            secretAccessKey: data.secretAccessKey,
            bucketName: data.bucketName,
          };
          useAppStore.getState().setR2Config(data);
        }
      }
    } catch (e) {
      console.error("[R2 Purge] Error fetching credentials:", e);
    }
  }

  if (!creds || !creds.accountId || !creds.bucketName) {
    console.warn('[R2 Purge] Cannot delete from R2: Credentials missing.');
    return { success: false, deletedKeys: [] };
  }

  // Extract all potential object key candidates
  const keysToDelete = new Set<string>();

  if (trimmed.startsWith('r2://')) {
    keysToDelete.add(trimmed.replace('r2://', ''));
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (pathname) {
        keysToDelete.add(pathname);
        const parts = pathname.split('/');
        if (parts.length > 1) {
          keysToDelete.add(parts[parts.length - 1]);
        }
      }
    } catch {}
  } else {
    keysToDelete.add(trimmed);
  }

  const r2Key = extractR2Key(trimmed);
  if (r2Key) {
    keysToDelete.add(r2Key);
  }

  const uniqueKeys = Array.from(keysToDelete).filter(Boolean);
  if (uniqueKeys.length === 0) {
    return { success: false, deletedKeys: [] };
  }

  try {
    const { S3Client } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: creds.accessKeyId.trim(),
        secretAccessKey: creds.secretAccessKey.trim(),
      },
    });

    const deletedKeys: string[] = [];
    for (const key of uniqueKeys) {
      try {
        const ok = await deleteR2Object(key, creds, s3);
        if (ok) {
          deletedKeys.push(key);
          console.log(`[R2 Purge] Permanently deleted object from R2: "${key}"`);
        }
      } catch (err) {
        console.warn(`[R2 Purge] Error deleting key "${key}":`, err);
      }
    }

    return { success: deletedKeys.length > 0, deletedKeys };
  } catch (err) {
    console.error('[R2 Purge] Error connecting to R2 for deletion:', err);
    return { success: false, deletedKeys: [] };
  }
}
