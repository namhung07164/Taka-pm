import type { S3Client as S3ClientType } from '@aws-sdk/client-s3';
import { useAppStore } from '../../../store/useAppStore';

export async function getS3Sdk() {
  const [s3Module, presignerModule] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/s3-request-presigner')
  ]);
  return {
    S3Client: s3Module.S3Client,
    PutObjectCommand: s3Module.PutObjectCommand,
    GetObjectCommand: s3Module.GetObjectCommand,
    ListObjectsV2Command: s3Module.ListObjectsV2Command,
    DeleteObjectCommand: s3Module.DeleteObjectCommand,
    getSignedUrl: presignerModule.getSignedUrl,
  };
}

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
 * Extracts R2 object key from an r2:// link, signed/public R2 URL, or direct object key
 */
export function extractR2Key(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('r2://')) {
    return trimmed.replace('r2://', '');
  }

  // If it's a full URL (signed R2 URL, dev/custom domain URL, or S3 endpoint URL)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      // If pathname starts with bucket name (e.g. hcmlayout/key)
      const pathParts = pathname.split('/');
      const filename = pathParts[pathParts.length - 1];

      // Check if filename matches bg_* pattern
      const bgMatch = filename.match(/(bg_[a-zA-Z0-9_.-]+)/i);
      if (bgMatch) {
        return bgMatch[1];
      }

      if (filename) {
        return filename;
      }
    } catch {
      // Ignore URL parse error
    }

    // Match bg_* pattern anywhere in string
    const match = trimmed.match(/(bg_[a-zA-Z0-9_.-]+\.(jpeg|jpg|png|webp|gif))/i);
    if (match) {
      return match[1];
    }
  } else {
    // If not a full URL or data URI, check if it's a plain filename/key
    if (!trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Retrieve saved R2 credentials from useAppStore or localStorage with multi-key fallback
 */
export function getStoredR2Credentials(): R2Credentials | null {
  let accountId = '';
  let accessKeyId = '';
  let secretAccessKey = '';
  let bucketName = '';

  try {
    const r2Config = useAppStore.getState().r2Config;
    if (r2Config) {
      accountId = (r2Config.accountId || '').trim();
      accessKeyId = (r2Config.accessKeyId || '').trim();
      secretAccessKey = (r2Config.secretAccessKey || '').trim();
      bucketName = (r2Config.bucketName || '').trim();
    }
  } catch {
    // fallback to localStorage if store not yet ready
  }

  // Check taka_cache_r2_config_v1
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    try {
      const cached = localStorage.getItem('taka_cache_r2_config_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        const a = parsed?.accountId || parsed?.account_id;
        const k = parsed?.accessKeyId || parsed?.access_key_id || parsed?.accessKey;
        const s = parsed?.secretAccessKey || parsed?.secret_access_key || parsed?.secretKey;
        const b = parsed?.bucketName || parsed?.bucket_name;
        if (a && k && s && b) {
          accountId = String(a).trim();
          accessKeyId = String(k).trim();
          secretAccessKey = String(s).trim();
          bucketName = String(b).trim();
        }
      }
    } catch {}
  }

  if (!accountId) accountId = (localStorage.getItem('r2_account_id') || '').trim();
  if (!accessKeyId) accessKeyId = (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
  if (!secretAccessKey) secretAccessKey = (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
  if (!bucketName) bucketName = (localStorage.getItem('r2_bucket_name') || '').trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName };
}

/**
 * Validates R2 credentials format to detect misconfigurations (such as pasting AccessKey into SecretKey)
 */
export function isR2CredentialsValid(creds: R2Credentials | null): { valid: boolean; reason?: string } {
  if (!creds) return { valid: false, reason: 'Chưa cấu hình Cloudflare R2' };
  if (!creds.accountId || !creds.bucketName || !creds.accessKeyId || !creds.secretAccessKey) {
    return { valid: false, reason: 'Thiếu thông tin tài khoản hoặc Access/Secret Key' };
  }
  if (creds.accessKeyId.trim() === creds.secretAccessKey.trim()) {
    return { 
      valid: false, 
      reason: 'Secret Access Key đang bị trùng với Access Key ID (Key bí mật của Cloudflare R2 là chuỗi 64 ký tự hex, không phải chuỗi 32 ký tự của Access Key ID).' 
    };
  }
  return { valid: true };
}

/**
 * Asynchronously retrieve R2 credentials, with fallback to Firestore taka_config/r2_credentials
 * on fresh accounts / cold boots before configCacheService sync completes.
 */
export async function getStoredR2CredentialsAsync(): Promise<R2Credentials | null> {
  const syncCreds = getStoredR2Credentials();
  if (syncCreds) return syncCreds;

  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db, APP_ID } = await import('../../../lib/firebase');
    const r2Doc = await getDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"));
    if (r2Doc.exists()) {
      const data = r2Doc.data() as any;
      const acc = (data?.accountId || data?.account_id || '').trim();
      const bkt = (data?.bucketName || data?.bucket_name || '').trim();
      const key = (data?.accessKeyId || data?.access_key_id || data?.accessKey || '').trim();
      const sec = (data?.secretAccessKey || data?.secret_access_key || data?.secretKey || '').trim();

      if (acc && bkt && key && sec) {
        const creds: R2Credentials = {
          accountId: acc,
          accessKeyId: key,
          secretAccessKey: sec,
          bucketName: bkt,
        };
        try {
          useAppStore.getState().setR2Config(creds);
        } catch {}
        try {
          localStorage.setItem('r2_account_id', creds.accountId);
          localStorage.setItem('r2_bucket_name', creds.bucketName);
          localStorage.setItem('r2_access_key', creds.accessKeyId);
          localStorage.setItem('r2_access_key_id', creds.accessKeyId);
          localStorage.setItem('r2_secret_key', creds.secretAccessKey);
          localStorage.setItem('r2_secret_access_key', creds.secretAccessKey);
          localStorage.setItem('taka_cache_r2_config_v1', JSON.stringify(creds));
        } catch {}
        return creds;
      }
    }
  } catch (err) {
    console.warn('[R2 Async Creds] Failed to fetch r2_credentials from Firestore:', err);
  }
  return null;
}

/**
 * Resolves an r2:// link, R2 object key, or expired signed URL into a valid presigned HTTP GET URL.
 */
export async function resolveR2UrlToHttp(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const r2Key = extractR2Key(trimmed);
  // If it's a regular external HTTP URL (not R2), return directly
  if (!r2Key && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
    return trimmed;
  }

  if (r2Key) {
    const creds = await getStoredR2CredentialsAsync();
    if (creds) {
      try {
        const { S3Client, GetObjectCommand, getSignedUrl } = await getS3Sdk();
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
        });
        const command = new GetObjectCommand({ Bucket: creds.bucketName, Key: r2Key });
        return await getSignedUrl(s3, command, { expiresIn: 3600 * 24 * 7 });
      } catch (err) {
        console.warn('[R2 Resolve] Could not generate presigned url for key:', r2Key, err);
      }
    }
  }

  return trimmed.startsWith('r2://') ? null : trimmed;
}

/**
 * Test R2 connection and CORS policy by attempting a temporary test upload
 */
export async function testR2Connection(creds: R2Credentials): Promise<{ ok: boolean; message: string }> {
  try {
    const { S3Client, PutObjectCommand, DeleteObjectCommand, getSignedUrl } = await getS3Sdk();
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId.trim()}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: creds.accessKeyId.trim(),
        secretAccessKey: creds.secretAccessKey.trim(),
      },
    });

    const testKey = '.r2_cors_check.txt';
    const testBlob = new Blob(['cors-ok'], { type: 'text/plain' });
    const command = new PutObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: testKey,
      ContentType: 'text/plain',
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/plain' },
      body: testBlob,
    });

    if (res.ok) {
      // Clean up test file
      try {
        const delCmd = new DeleteObjectCommand({
          Bucket: creds.bucketName.trim(),
          Key: testKey,
        });
        const delUrl = await getSignedUrl(s3, delCmd, { expiresIn: 300 });
        await fetch(delUrl, { method: 'DELETE' });
      } catch (_) {}

      return { ok: true, message: 'Kết nối và quyền ghi Cloudflare R2 thành công (CORS hoạt động chuẩn)!' };
    }

    const errText = await res.text().catch(() => '');
    if (res.status === 403) {
      return {
        ok: false,
        message: 'Lỗi 403: Sai Access Key / Secret Key hoặc API Token không có quyền ghi ("Object Read & Write").',
      };
    }
    if (res.status === 404) {
      return {
        ok: false,
        message: `Lỗi 404: Không tìm thấy Bucket "${creds.bucketName}". Vui lòng kiểm tra lại tên Bucket.`,
      };
    }
    return { ok: false, message: `Lỗi R2 HTTP ${res.status}: ${errText.substring(0, 100)}` };
  } catch (err: any) {
    console.error('[R2 Test] Connection error:', err);
    const msg = err?.message || String(err);
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')) {
      return {
        ok: false,
        message: 'Lỗi CORS: Bucket chưa được bật CORS trên Cloudflare R2 Dashboard. Trình duyệt đã chặn gửi file!',
      };
    }
    return { ok: false, message: `Lỗi kết nối: ${msg}` };
  }
}

/**
 * List objects in an R2 bucket (with presigned GET URL fallback for CORS safety)
 */
export async function listR2Objects(
  creds: R2Credentials,
  s3: S3ClientType,
  prefix?: string
): Promise<string[]> {
  try {
    const { ListObjectsV2Command, getSignedUrl } = await getS3Sdk();
    const command = new ListObjectsV2Command({
      Bucket: creds.bucketName,
      Prefix: prefix || undefined,
    });
    const res = await s3.send(command);
    return (res.Contents || []).map((c) => c.Key).filter(Boolean) as string[];
  } catch (err: any) {
    console.warn('[R2 List] Direct list failed, trying presigned GET URL fallback:', err);
    try {
      const { ListObjectsV2Command, getSignedUrl } = await getS3Sdk();
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
  s3: S3ClientType
): Promise<boolean> {
  try {
    const { DeleteObjectCommand, getSignedUrl } = await getS3Sdk();
    const command = new DeleteObjectCommand({
      Bucket: creds.bucketName,
      Key: key,
    });
    await s3.send(command);
    return true;
  } catch (err: any) {
    console.warn(`[R2 Delete] Direct delete failed for "${key}", trying presigned DELETE:`, err);
    try {
      const { DeleteObjectCommand, getSignedUrl } = await getS3Sdk();
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
      // Delete existing exact key if present to guarantee clean replacement
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

  // Method 1: S3Client SDK direct send
  try {
    const command = new GetObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: key,
    });
    const res = await s3.send(command);
    if (res.Body) {
      const text = await (res.Body as any).transformToString();
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

  // Method 2: Presigned GET URL fetch
  try {
    const command = new GetObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: key,
      ResponseCacheControl: 'no-cache, no-store, must-revalidate',
    });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
    // Append timestamp query parameter to strictly bypass any browser / CDN HTTP cache
    const cacheBusterUrl = signedUrl.includes('?') 
      ? `${signedUrl}&_t=${Date.now()}` 
      : `${signedUrl}?_t=${Date.now()}`;
    const res = await fetch(cacheBusterUrl, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
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
    if (errMsg.includes('Load failed') || errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError') || errMsg.includes('CORS')) {
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
  maxRetries = 3
): Promise<R2UploadFileResult> {
  const originalName = file.name || 'Export.jpeg';
  const isJson = originalName.toLowerCase().endsWith('.json');
  const safeName = originalName.replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
  const contentType = file.blob.type || (isJson ? 'application/json' : 'image/jpeg');
  const cacheControl = isJson ? 'no-cache, no-store, must-revalidate, max-age=0' : 'public, max-age=604800, immutable';

  let lastError = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Attempt Method 1: S3 SDK direct PutObjectCommand with ArrayBuffer
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

      await s3.send(command);
      return { name: safeName, success: true };
    } catch (s3Err: any) {
      console.warn(`[R2 Upload] S3 SDK send failed (lần ${attempt}/${maxRetries}), trying presigned URL:`, s3Err);
    }

    // Attempt Method 2: Presigned PUT URL fetch
    try {
      const { PutObjectCommand, getSignedUrl } = await getS3Sdk();
      const command = new PutObjectCommand({
        Bucket: creds.bucketName.trim(),
        Key: safeName,
        ContentType: contentType,
        CacheControl: cacheControl,
      });

      const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
        },
        body: file.blob,
      });

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
      if (errMsg.includes('Failed to fetch') || errMsg.includes('NetworkError')) {
        errMsg = 'Lỗi CORS / Mạng: Vui lòng vào Cloudflare R2 > Bucket > Settings > thêm CORS Policy cho phép PUT & GET.';
      }
      lastError = errMsg;
      
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
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

  // 1. Check / clean only the exact target file names to be replaced (preserving all other bucket data)
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
      statusText: `Đang tải lên bản vẽ: ${safeName} (${i + 1}/${files.length})...`,
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
    statusText: 'Đang hoàn tất và xóa cache Cloudflare CDN...',
  });

  // Attempt cache purge if configured
  const cfZoneId = localStorage.getItem('cf_zone_id');
  const cfApiToken = localStorage.getItem('cf_api_token');
  if (cfZoneId && cfApiToken) {
    try {
      // Direct API call to cloudflare since the proxy doesn't work on the public hosting (405)
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
