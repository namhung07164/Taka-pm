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

export function extractR2Key(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('r2://')) {
    return trimmed.replace('r2://', '');
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '');
      if (parsed.hostname.includes('taka-pm.org')) {
        return pathname;
      }
      const takaFolderIdx = pathname.indexOf('Taka-Pm-folder/');
      if (takaFolderIdx !== -1) {
        return pathname.slice(takaFolderIdx);
      }
      const pathParts = pathname.split('/');
      const filename = pathParts[pathParts.length - 1];

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

    const match = trimmed.match(/(bg_[a-zA-Z0-9_.-]+\.(jpeg|jpg|png|webp|gif))/i);
    if (match) {
      return match[1];
    }
  } else {
    if (!trimmed.startsWith('data:') && !trimmed.startsWith('blob:')) {
      return trimmed;
    }
  }

  return null;
}

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
  } catch {}

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

const resolvedR2UrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function resolveR2UrlToHttp(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const r2Key = extractR2Key(trimmed);
  if (!r2Key && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
    return trimmed;
  }

  if (r2Key) {
    const cached = resolvedR2UrlCache.get(r2Key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.url;
    }

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
        const signed = await getSignedUrl(s3, command, { expiresIn: 3600 * 24 * 7 });
        if (signed) {
          resolvedR2UrlCache.set(r2Key, { url: signed, expiresAt: Date.now() + 2 * 3600 * 1000 });
        }
        return signed;
      } catch (err) {
        console.warn('[R2 Resolve] Could not generate presigned url for key:', r2Key, err);
      }
    }
  }

  return trimmed.startsWith('r2://') ? null : trimmed;
}

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

export async function listR2Objects(
  creds: R2Credentials,
  s3: S3ClientType,
  prefix?: string
): Promise<string[]> {
  try {
    const { ListObjectsV2Command } = await getS3Sdk();
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

export async function deleteR2Object(
  key: string,
  creds: R2Credentials,
  s3: S3ClientType
): Promise<boolean> {
  try {
    const { DeleteObjectCommand } = await getS3Sdk();
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
