import type { S3Client as S3ClientType } from '@aws-sdk/client-s3';
import {
  getS3Sdk,
  R2Credentials,
  R2FileItem,
  R2UploadFileResult,
  R2BatchUploadResult,
  R2ProgressInfo,
  extractR2Key,
  getStoredR2Credentials,
  isR2CredentialsValid,
  getStoredR2CredentialsAsync,
  resolveR2UrlToHttp,
  testR2Connection,
  listR2Objects,
  deleteR2Object,
} from './r2ClientAndCreds';

export {
  getS3Sdk,
  extractR2Key,
  getStoredR2Credentials,
  isR2CredentialsValid,
  getStoredR2CredentialsAsync,
  resolveR2UrlToHttp,
  testR2Connection,
  listR2Objects,
  deleteR2Object,
};

export type {
  R2Credentials,
  R2FileItem,
  R2UploadFileResult,
  R2BatchUploadResult,
  R2ProgressInfo,
};

/**
 * Purge or check exact export file in R2 bucket before upload.
 * ONLY targets the EXACT matching file name(s) to be updated, strictly protecting all other files in bucket.
 */
export async function purgeExactR2ExportFiles(
  fileNamesToReplace: string[],
  creds: R2Credentials,
  s3: S3ClientType,
  onStatus?: (text: string) => void
): Promise<{ deletedCount: number; deletedFiles: string[] }> {
  try {
    const deletedFiles: string[] = [];
    for (let i = 0; i < fileNamesToReplace.length; i++) {
      const key = fileNamesToReplace[i];
      onStatus?.(`Đang kiểm tra và cập nhật file: ${key}...`);
      const ok = await deleteR2Object(key, creds, s3);
      if (ok) {
        deletedFiles.push(key);
      }
    }
    return { deletedCount: deletedFiles.length, deletedFiles };
  } catch (err) {
    console.warn('[R2 Safe Replace] Error replacing exact file:', err);
    return { deletedCount: 0, deletedFiles: [] };
  }
}

/**
 * Purge old background images in R2 bucket (any file starting with bg_ that is not keepImageName)
 */
export async function purgeOldR2BackgroundImages(
  keepImageNames: string | string[],
  creds: R2Credentials,
  s3: S3ClientType,
  onStatus?: (text: string) => void
): Promise<{ deletedCount: number; deletedFiles: string[] }> {
  try {
    onStatus?.('Đang quét ảnh nền cũ trên R2...');
    const allKeys = await listR2Objects(creds, s3, 'bg_');
    const keepNames = Array.isArray(keepImageNames) ? keepImageNames : [keepImageNames];
    const keepSet = new Set(keepNames.map(n => n.toLowerCase()));

    const oldBgToDelete = allKeys.filter((key) => {
      const lower = key.toLowerCase();
      return lower.startsWith('bg_') && !keepSet.has(lower);
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

function withR2Timeout<T>(promise: Promise<T>, ms: number, errMsg = 'R2 request timed out'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errMsg)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Downloads a JSON file from Cloudflare R2 using dual method:
 * Method 1: S3 SDK direct getObject with transformToString()
 * Method 2: Presigned GET URL fetch with custom CORS error classification
 */
export async function downloadR2JsonFile<T = any>(
  key: string,
  creds: R2Credentials,
  s3: S3ClientType
): Promise<{ success: boolean; data?: T; error?: string; notFound?: boolean }> {
  const { GetObjectCommand, getSignedUrl } = await getS3Sdk();

  try {
    const command = new GetObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: key,
    });
    const res = await withR2Timeout(s3.send(command), 5000, 'S3 GetObject timed out');
    if (res.Body) {
      const text = await withR2Timeout((res.Body as any).transformToString() as Promise<string>, 5000, 'S3 Body read timed out');
      const parsed = JSON.parse(text);
      return { success: true, data: parsed };
    }
  } catch (sdkErr: any) {
    const name = sdkErr?.name || '';
    const msg = sdkErr?.message || '';
    if (name === 'NoSuchKey' || name === 'NotFound' || msg.includes('does not exist') || msg.includes('404')) {
      return { success: false, notFound: true, error: `File "${key}" chưa tồn tại trên R2 Bucket (Vui lòng bấm Save Cloud để lưu cấu hình lần đầu).` };
    }
    console.warn(`[R2 Download] S3 send failed for "${key}", trying signed URL fallback:`, sdkErr);
  }

  try {
    const command = new GetObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: key,
      ResponseCacheControl: 'no-cache, no-store, must-revalidate',
    });
    const signedUrl = await withR2Timeout(getSignedUrl(s3, command, { expiresIn: 3600 }), 4000, 'Presign GET timed out');
    const cacheBusterUrl = signedUrl.includes('?') 
      ? `${signedUrl}&_t=${Date.now()}` 
      : `${signedUrl}?_t=${Date.now()}`;
    const controller = new AbortController();
    const fetchTimer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(cacheBusterUrl, { 
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    }).finally(() => clearTimeout(fetchTimer));
    if (res.status === 404) {
      return { success: false, notFound: true, error: `File "${key}" chưa tồn tại trên R2 Bucket (Vui lòng bấm Save Cloud để lưu cấu hình lần đầu).` };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { success: false, error: `Lỗi R2 HTTP ${res.status}: ${txt.substring(0, 100)}` };
    }
    const data = await res.json();
    return { success: true, data };
  } catch (fetchErr: any) {
    const errMsg = fetchErr?.message || String(fetchErr);
    if (errMsg.includes('Load failed') || errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('CORS') || errMsg.includes('abort')) {
      return { 
        success: false, 
        error: 'Lỗi CORS / Mạng khi kết nối Cloudflare R2: Hãy đảm bảo CORS Policy trên R2 Bucket cho phép GET/PUT từ domain của bạn.' 
      };
    }
    return { success: false, error: errMsg };
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
  s3: S3ClientType,
  maxRetries = 2
): Promise<R2UploadFileResult> {
  const originalName = file.name || 'Export.jpeg';
  const isJson = originalName.toLowerCase().endsWith('.json');
  const safeName = originalName.replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
  const contentType = file.blob.type || (isJson ? 'application/json' : 'image/jpeg');
  const cacheControl = isJson ? 'no-cache, no-store, must-revalidate, max-age=0' : 'public, max-age=604800, immutable';

  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const { PutObjectCommand } = await getS3Sdk();
      const arrayBuffer = await file.blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const command = new PutObjectCommand({
        Bucket: creds.bucketName.trim(),
        Key: safeName,
        Body: uint8Array,
        ContentType: contentType,
        CacheControl: cacheControl,
      });

      await withR2Timeout(s3.send(command), 6000, 'S3 PutObject timed out');
      return { name: safeName, success: true };
    } catch (s3Err: any) {
      console.warn(`[R2 Upload] S3 SDK send failed (lần ${attempt}/${maxRetries}), trying presigned URL:`, s3Err);
    }

    try {
      const { PutObjectCommand, getSignedUrl } = await getS3Sdk();
      const command = new PutObjectCommand({
        Bucket: creds.bucketName.trim(),
        Key: safeName,
        ContentType: contentType,
        CacheControl: cacheControl,
      });

      const signedUrl = await withR2Timeout(getSignedUrl(s3, command, { expiresIn: 3600 }), 4000, 'Presign PUT timed out');
      const controller = new AbortController();
      const putTimer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(signedUrl, {
        method: 'PUT',
        signal: controller.signal,
        headers: { 
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        },
        body: file.blob,
      }).finally(() => clearTimeout(putTimer));

      if (res.ok) {
        return { name: safeName, success: true };
      }

      const errText = await res.text().catch(() => '');
      if (res.status === 403) {
        throw new Error('R2 từ chối quyền ghi (HTTP 403). Hãy đảm bảo API Token có quyền "Object Read & Write".');
      }
      if (res.status === 404) {
        throw new Error(`Không tìm thấy Bucket "${creds.bucketName}" (HTTP 404). Hãy kiểm tra lại tên Bucket.`);
      }
      throw new Error(`Cloudflare R2 từ chối lưu file (Mã lỗi: HTTP ${res.status}): ${errText.substring(0, 80)}`);
    } catch (directErr: any) {
      console.warn(`[R2 Upload] Lỗi tải lên presigned (lần ${attempt}/${maxRetries}):`, directErr);
      let errMsg = directErr?.message || 'Lỗi mạng khi tải lên R2.';
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('abort')) {
        errMsg = 'Lỗi CORS / Mạng: Vui lòng vào Cloudflare R2 > Bucket > Settings > thêm CORS Policy cho phép PUT & GET.';
      }
      lastError = errMsg;
      
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  return { name: safeName, success: false, error: lastError };
}

/**
 * Sequentially uploads files to Cloudflare R2 with progress tracking,
 * strictly replacing only the exact matching file names, and purging Cloudflare CDN cache
 */
export async function uploadFilesToR2(
  files: R2FileItem[],
  onProgress?: (info: R2ProgressInfo) => void,
  options: { replaceExactFilesOnly?: boolean } = { replaceExactFilesOnly: true }
): Promise<R2BatchUploadResult> {
  const creds = getStoredR2Credentials();

  if (!creds) {
    throw new Error('Chưa cấu hình đầy đủ thông tin Cloudflare R2 trong cài đặt.');
  }

  const { S3Client } = await getS3Sdk();
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
  });

  const results: R2UploadFileResult[] = [];
  let updatedExactCount = 0;

  if (options?.replaceExactFilesOnly !== false && files.length > 0) {
    const targetFileNames = files.map(f => (f.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg');

    onProgress?.({
      current: 0,
      total: files.length,
      fileName: '',
      percent: 5,
      statusText: 'Đang kiểm tra và chuẩn bị ghi đè đúng tên file tương ứng trên Cloudflare R2...',
    });

    try {
      const purgeResult = await purgeExactR2ExportFiles(targetFileNames, creds, s3, (statusText) => {
        onProgress?.({
          current: 0,
          total: files.length,
          fileName: '',
          percent: 10,
          statusText,
        });
      });
      updatedExactCount = purgeResult.deletedCount;
    } catch (purgeErr) {
      console.warn('[R2 Safe Replace] Cảnh báo kiểm tra file trước upload:', purgeErr);
    }
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = (file.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg';
    const percent = Math.round(15 + ((i / files.length) * 80));

    onProgress?.({
      current: i + 1,
      total: files.length,
      fileName: safeName,
      percent,
      statusText: `Đang tải lên bản vẽ: ${safeName} (${i + 1}/${files.length})...`,
    });

    const res = await uploadSingleR2File(file, creds, s3, 3);
    results.push(res);

    await new Promise((r) => setTimeout(r, 60));
  }

  onProgress?.({
    current: files.length,
    total: files.length,
    fileName: '',
    percent: 98,
    statusText: 'Đang hoàn tất và xóa cache Cloudflare CDN...',
  });

  const cfZoneId = localStorage.getItem('cf_zone_id');
  const cfApiToken = localStorage.getItem('cf_api_token');
  if (cfZoneId && cfApiToken) {
    try {
      await fetch(`https://api.cloudflare.com/client/v4/zones/${cfZoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfApiToken}`
        },
        body: JSON.stringify({ purge_everything: true }),
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
    statusText: `Hoàn tất cập nhật thành công ${files.length} bản vẽ lên Cloudflare R2!`,
  });

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return {
    total: files.length,
    successCount,
    failedCount,
    results,
    deletedOldCount: updatedExactCount,
  };
}
