import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
}

export interface R2FileItem {
  blob: Blob;
  name: string;
}

export interface R2UploadFileResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface R2BatchUploadResult {
  total: number;
  successCount: number;
  failedCount: number;
  results: R2UploadFileResult[];
  deletedOldCount?: number;
}

export interface R2ProgressInfo {
  current: number;
  total: number;
  fileName: string;
  percent: number;
  statusText: string;
}

/**
 * Retrieve saved R2 credentials from localStorage with multi-key fallback
 */
export function getStoredR2Credentials(): R2Credentials | null {
  const accountId = localStorage.getItem('r2_account_id') || '';
  const accessKeyId = localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '';
  const secretAccessKey = localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '';
  const bucketName = localStorage.getItem('r2_bucket_name') || '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

/**
 * List objects in an R2 bucket (with presigned GET URL fallback for CORS safety)
 */
export async function listR2Objects(
  creds: R2Credentials,
  s3: S3Client,
  prefix?: string
): Promise<string[]> {
  try {
    const command = new ListObjectsV2Command({
      Bucket: creds.bucketName,
      Prefix: prefix || undefined,
    });
    const res = await s3.send(command);
    return (res.Contents || []).map((c) => c.Key).filter(Boolean) as string[];
  } catch (err: any) {
    console.warn('[R2 List] Direct list failed, trying presigned GET URL fallback:', err);
    try {
      const command = new ListObjectsV2Command({
        Bucket: creds.bucketName,
        Prefix: prefix || undefined,
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const keys: string[] = [];
      const regex = /<Key>([^<]+)<\/Key>/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        keys.push(match[1]);
      }
      return keys;
    } catch (fallbackErr: any) {
      console.error('[R2 List] Failed to list objects:', fallbackErr);
      return [];
    }
  }
}

/**
 * Delete a single object in R2 with presigned DELETE fallback
 */
export async function deleteR2Object(
  key: string,
  creds: R2Credentials,
  s3: S3Client
): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: creds.bucketName,
      Key: key,
    });
    await s3.send(command);
    return true;
  } catch (err: any) {
    console.warn(`[R2 Delete] Direct delete failed for "${key}", trying presigned DELETE:`, err);
    try {
      const command = new DeleteObjectCommand({
        Bucket: creds.bucketName,
        Key: key,
      });
      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
      const res = await fetch(signedUrl, { method: 'DELETE' });
      return res.ok || res.status === 204 || res.status === 404;
    } catch (fallbackErr: any) {
      console.error(`[R2 Delete] Failed to delete "${key}":`, fallbackErr);
      return false;
    }
  }
}

/**
 * Purge all old export versions in R2 bucket except the newly uploaded files.
 * Deletes previous .jpeg, .jpg, .png, .pdf export files to guarantee ONLY 1 version exists on Cloud.
 */
export async function purgeOldR2ExportVersions(
  keepFileNames: string[],
  creds: R2Credentials,
  s3: S3Client,
  onStatus?: (text: string) => void
): Promise<{ deletedCount: number; deletedFiles: string[] }> {
  try {
    onStatus?.('Đang quét các bản xuất cũ trên R2...');
    const allKeys = await listR2Objects(creds, s3);
    const keepSet = new Set(keepFileNames.map((n) => n.toLowerCase()));

    // Old export images: any .jpeg, .jpg, .png, .pdf file that is not a background (bg_*)
    // and not mapping_config.json, and not in keepSet
    const oldFilesToDelete = allKeys.filter((key) => {
      const lower = key.toLowerCase();
      if (keepSet.has(lower)) return false;
      if (lower.startsWith('bg_')) return false;
      if (lower === 'mapping_config.json') return false;
      return lower.endsWith('.jpeg') || lower.endsWith('.jpg') || lower.endsWith('.png') || lower.endsWith('.pdf');
    });

    if (oldFilesToDelete.length === 0) {
      return { deletedCount: 0, deletedFiles: [] };
    }

    onStatus?.(`Đang dọn dẹp ${oldFilesToDelete.length} bản cũ trên R2 để chống rác...`);
    const deletedFiles: string[] = [];

    for (let i = 0; i < oldFilesToDelete.length; i++) {
      const key = oldFilesToDelete[i];
      onStatus?.(`Đang xóa bản cũ (${i + 1}/${oldFilesToDelete.length}): ${key}...`);
      const ok = await deleteR2Object(key, creds, s3);
      if (ok) {
        deletedFiles.push(key);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    return { deletedCount: deletedFiles.length, deletedFiles };
  } catch (err) {
    console.warn('[R2 Purge] Error purging old export versions:', err);
    return { deletedCount: 0, deletedFiles: [] };
  }
}

/**
 * Purge old background images in R2 bucket (any file starting with bg_ that is not keepImageName)
 */
export async function purgeOldR2BackgroundImages(
  keepImageName: string,
  creds: R2Credentials,
  s3: S3Client,
  onStatus?: (text: string) => void
): Promise<{ deletedCount: number; deletedFiles: string[] }> {
  try {
    onStatus?.('Đang quét ảnh nền cũ trên R2...');
    const allKeys = await listR2Objects(creds, s3, 'bg_');
    const keepLower = keepImageName.toLowerCase();

    const oldBgToDelete = allKeys.filter((key) => {
      const lower = key.toLowerCase();
      return lower.startsWith('bg_') && lower !== keepLower;
    });

    if (oldBgToDelete.length === 0) {
      return { deletedCount: 0, deletedFiles: [] };
    }

    onStatus?.(`Đang xóa ${oldBgToDelete.length} ảnh nền cũ trên R2...`);
    const deletedFiles: string[] = [];

    for (let i = 0; i < oldBgToDelete.length; i++) {
      const key = oldBgToDelete[i];
      const ok = await deleteR2Object(key, creds, s3);
      if (ok) {
        deletedFiles.push(key);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    return { deletedCount: deletedFiles.length, deletedFiles };
  } catch (err) {
    console.warn('[R2 Purge] Error purging old background images:', err);
    return { deletedCount: 0, deletedFiles: [] };
  }
}

/**
 * Upload single file with multiple retry attempts and proxy fallback
 */
export async function uploadSingleR2File(
  file: R2FileItem,
  creds: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
  },
  s3: S3Client,
  maxRetries = 3
): Promise<R2UploadFileResult> {
  const originalName = file.name || 'Export.jpeg';
  const isJson = originalName.toLowerCase().endsWith('.json');
  const safeName = originalName.replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
  const contentType = file.blob.type || (isJson ? 'application/json' : 'image/jpeg');

  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Try direct S3 presigned PUT URL
      const command = new PutObjectCommand({
        Bucket: creds.bucketName,
        Key: safeName,
        ContentType: contentType,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file.blob,
      });

      if (res.ok) {
        return { name: safeName, success: true };
      }

      const errText = await res.text().catch(() => '');
      throw new Error(`Direct PUT HTTP ${res.status}: ${errText.substring(0, 80)}`);
    } catch (directErr: any) {
      console.warn(`[R2 Upload] Direct upload error for ${safeName} (lần ${attempt}/${maxRetries}):`, directErr);
      lastError = directErr?.message || 'Direct upload error';

      // 2. Fallback to /api/r2-upload proxy on server to bypass CORS/Network barriers
      try {
        const proxyRes = await fetch('/api/r2-upload', {
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            'x-r2-account-id': creds.accountId,
            'x-r2-access-key-id': creds.accessKeyId,
            'x-r2-secret-access-key': creds.secretAccessKey,
            'x-r2-bucket-name': creds.bucketName,
            'x-r2-file-name': encodeURIComponent(safeName),
          },
          body: file.blob,
        });

        if (proxyRes.ok) {
          const json = await proxyRes.json().catch(() => ({ success: true }));
          if (json.success) {
            return { name: safeName, success: true };
          }
        }
        const proxyErrText = await proxyRes.text().catch(() => '');
        throw new Error(`Proxy upload HTTP ${proxyRes.status}: ${proxyErrText.substring(0, 80)}`);
      } catch (proxyErr: any) {
        console.warn(`[R2 Upload] Proxy fallback error for ${safeName} (lần ${attempt}/${maxRetries}):`, proxyErr);
        lastError = proxyErr?.message || lastError;
      }

      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  return { name: safeName, success: false, error: lastError };
}

/**
 * Sequentially uploads files to Cloudflare R2 with progress tracking,
 * automatic old versions purge (keeps only the latest uploaded files), and cache purge
 */
export async function uploadFilesToR2(
  files: R2FileItem[],
  onProgress?: (info: R2ProgressInfo) => void,
  options: { purgeOldVersions?: boolean } = { purgeOldVersions: true }
): Promise<R2BatchUploadResult> {
  const creds = getStoredR2Credentials();

  if (!creds) {
    throw new Error('Chưa cấu hình đầy đủ thông tin Cloudflare R2 trong cài đặt.');
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });

  const results: R2UploadFileResult[] = [];
  let deletedOldCount = 0;

  // 1. Automatically purge old export versions to enforce single-version policy
  if (options?.purgeOldVersions !== false && files.length > 0) {
    const keepNames = files.map(f => (f.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg');

    onProgress?.({
      current: 0,
      total: files.length,
      fileName: '',
      percent: 5,
      statusText: 'Đang dọn dẹp các bản cũ trên Cloudflare R2...',
    });

    try {
      const purgeResult = await purgeOldR2ExportVersions(keepNames, creds, s3, (statusText) => {
        onProgress?.({
          current: 0,
          total: files.length,
          fileName: '',
          percent: 10,
          statusText,
        });
      });
      deletedOldCount = purgeResult.deletedCount;
      if (deletedOldCount > 0) {
        console.log(`[R2 Auto-Cleanup] Đã xóa ${deletedOldCount} bản cũ trên R2:`, purgeResult.deletedFiles);
      }
    } catch (purgeErr) {
      console.warn('[R2 Auto-Cleanup] Lỗi dọn dẹp file cũ:', purgeErr);
    }
  }

  // 2. Upload new version files
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = (file.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg';
    const percent = Math.round(15 + ((i / files.length) * 80));

    onProgress?.({
      current: i + 1,
      total: files.length,
      fileName: safeName,
      percent,
      statusText: `Đang tải lên bản mới: ${safeName} (${i + 1}/${files.length})...`,
    });

    const res = await uploadSingleR2File(file, creds, s3, 3);
    results.push(res);

    // Yield to let browser UI refresh
    await new Promise((r) => setTimeout(r, 60));
  }

  onProgress?.({
    current: files.length,
    total: files.length,
    fileName: '',
    percent: 98,
    statusText: deletedOldCount > 0 
      ? `Đã xóa ${deletedOldCount} bản cũ. Đang xóa cache Cloudflare...` 
      : 'Đang hoàn tất và xóa cache Cloudflare...',
  });

  // Attempt cache purge if configured
  const cfZoneId = localStorage.getItem('cf_zone_id');
  const cfApiToken = localStorage.getItem('cf_api_token');
  if (cfZoneId && cfApiToken) {
    try {
      await fetch('/api/purge-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zoneId: cfZoneId, apiToken: cfApiToken }),
      });
    } catch (purgeErr) {
      console.warn('Purge cache error:', purgeErr);
    }
  }

  onProgress?.({
    current: files.length,
    total: files.length,
    fileName: '',
    percent: 100,
    statusText: deletedOldCount > 0 
      ? `Hoàn tất! Đã lưu 1 bản mới và xóa sạch ${deletedOldCount} bản cũ trên R2.` 
      : 'Hoàn tất cập nhật bản mới lên Cloudflare R2!',
  });

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return {
    total: files.length,
    successCount,
    failedCount,
    results,
    deletedOldCount,
  };
}
