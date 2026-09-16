import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
}

export interface R2ProgressInfo {
  current: number;
  total: number;
  fileName: string;
  percent: number;
  statusText: string;
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
  const safeName = (file.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg';
  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 1. Try direct S3 presigned PUT URL
      const command = new PutObjectCommand({
        Bucket: creds.bucketName,
        Key: safeName,
        ContentType: 'image/jpeg',
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
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
            'Content-Type': 'image/jpeg',
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
 * Sequentially uploads files to Cloudflare R2 with progress tracking and cache purge
 */
export async function uploadFilesToR2(
  files: R2FileItem[],
  onProgress?: (info: R2ProgressInfo) => void
): Promise<R2BatchUploadResult> {
  const accountId = localStorage.getItem('r2_account_id') || '';
  const accessKeyId = localStorage.getItem('r2_access_key') || '';
  const secretAccessKey = localStorage.getItem('r2_secret_key') || '';
  const bucketName = localStorage.getItem('r2_bucket_name') || '';

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('Chưa cấu hình đầy đủ thông tin Cloudflare R2 trong cài đặt.');
  }

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const results: R2UploadFileResult[] = [];
  const creds = { accountId, accessKeyId, secretAccessKey, bucketName };

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const safeName = (file.name || 'Export').replace(/[\/\\]/g, '_').replace(/\s+/g, '_') + '.jpeg';
    const percent = Math.round((i / files.length) * 100);

    onProgress?.({
      current: i + 1,
      total: files.length,
      fileName: safeName,
      percent,
      statusText: `Đang tải lên ${safeName} (${i + 1}/${files.length})...`,
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
    percent: 100,
    statusText: 'Đang hoàn tất và xóa cache Cloudflare...',
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

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return {
    total: files.length,
    successCount,
    failedCount,
    results,
  };
}
