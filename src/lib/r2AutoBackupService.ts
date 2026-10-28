import { useAppStore } from '../store/useAppStore';
import {
  getS3Sdk,
  getStoredR2CredentialsAsync,
  isR2CredentialsValid,
  R2Credentials,
} from '../components/PictureMapping/lib/r2Upload';
import {
  R2AutoBackupConfig,
  R2BackupSnapshotMeta,
  R2AutoBackupState,
  getBackupInFlight,
  setBackupInFlight,
  getR2AutoBackupConfig,
  saveR2AutoBackupConfig,
  getR2AutoBackupState,
  updateStoredBackupState,
  subscribeR2AutoBackupState,
  collectFullSystemBackupPayload,
  compressStringToGzip,
  decompressBackupBytes,
} from './r2AutoBackupPayload';

export type {
  R2AutoBackupConfig,
  R2BackupSnapshotMeta,
  R2AutoBackupState,
};
export {
  getR2AutoBackupConfig,
  saveR2AutoBackupConfig,
  getR2AutoBackupState,
  subscribeR2AutoBackupState,
  collectFullSystemBackupPayload,
  compressStringToGzip,
  decompressBackupBytes,
};

const R2_BACKUP_PREFIX = 'Taka-Pm-folder/AutoBackups/';
const R2_MANIFEST_KEY = 'Taka-Pm-folder/AutoBackups/manifest_2027.json';
const R2_LATEST_KEY = 'Taka-Pm-folder/AutoBackups/latest/taka_system_latest.json.gz';

let _cronIntervalId: ReturnType<typeof setInterval> | null = null;

async function createR2S3Client(creds: R2Credentials) {
  const { S3Client } = await getS3Sdk();
  const cleanAccountId = creds.accountId.trim().replace(/^https?:\/\//, '').split('.')[0];
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cleanAccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId.trim(),
      secretAccessKey: creds.secretAccessKey.trim(),
    },
  });
}

export async function executeR2BackupNow(options?: {
  triggeredBy?: 'cron_auto' | 'manual';
  force?: boolean;
}): Promise<{
  success: boolean;
  skipped?: boolean;
  reason?: string;
  meta?: R2BackupSnapshotMeta;
}> {
  if (getBackupInFlight()) {
    return { success: false, skipped: true, reason: 'A backup operation is already in progress.' };
  }

  const triggeredBy = options?.triggeredBy || 'manual';
  const force = Boolean(options?.force);
  const currentState = getR2AutoBackupState();

  if (triggeredBy === 'cron_auto' && !currentState.config.enabled && !force) {
    return { success: false, skipped: true, reason: 'Auto-backup cron is disabled.' };
  }

  setBackupInFlight(true);

  try {
    const creds = await getStoredR2CredentialsAsync();
    if (!isR2CredentialsValid(creds)) {
      const msg = 'Cloudflare R2 credentials are not configured yet.';
      updateStoredBackupState({ lastError: msg });
      return { success: false, reason: msg };
    }

    const { payload, checksum } = await collectFullSystemBackupPayload();
    const totalRecords =
      payload.counts.projects +
      payload.counts.tasks +
      payload.counts.costs +
      payload.counts.delegations;

    if (totalRecords === 0 && !force) {
      return {
        success: false,
        skipped: true,
        reason: 'Local database is empty or still hydrating; skipping backup.',
      };
    }

    if (
      triggeredBy === 'cron_auto' &&
      !force &&
      currentState.config.onlyWhenChanged &&
      currentState.lastDataChecksum === checksum &&
      currentState.lastBackupTimeMs > 0
    ) {
      return {
        success: true,
        skipped: true,
        reason: 'No data changes detected since last R2 snapshot.',
      };
    }

    const jsonString = JSON.stringify(payload);
    const { bytes, isGzipped, rawSizeBytes, compressedSizeBytes } =
      await compressStringToGzip(jsonString);

    const now = new Date(payload.timestampMs);
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const min = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');

    const ext = isGzipped ? 'json.gz' : 'json';
    const fileName = `taka_backup_${yyyy}${mm}${dd}_${hh}${min}${ss}_${triggeredBy}.${ext}`;
    const snapshotKey = `${R2_BACKUP_PREFIX}snapshots/${yyyy}-${mm}/${fileName}`;

    const { PutObjectCommand } = await getS3Sdk();
    const s3Client = await createR2S3Client(creds);
    const bucketName = creds.bucketName.trim();
    const currentUser = useAppStore.getState().currentUser;

    const ratio =
      rawSizeBytes > 0
        ? Math.max(0, Math.round((1 - compressedSizeBytes / rawSizeBytes) * 100))
        : 0;

    const snapshotMeta: R2BackupSnapshotMeta = {
      key: snapshotKey,
      fileName,
      createdAtIso: payload.createdAtIso,
      timestampMs: payload.timestampMs,
      triggeredBy,
      triggeredUser: currentUser?.username || currentUser?.id || 'system',
      rawSizeBytes,
      compressedSizeBytes,
      compressionRatioPercent: ratio,
      projectsCount: payload.counts.projects,
      tasksCount: payload.counts.tasks,
      costsCount: payload.counts.costs,
      delegationsCount: payload.counts.delegations,
      dataChecksum: checksum,
    };

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: snapshotKey,
        Body: bytes,
        ContentType: isGzipped ? 'application/gzip' : 'application/json',
      })
    );

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: R2_LATEST_KEY,
        Body: bytes,
        ContentType: isGzipped ? 'application/gzip' : 'application/json',
      })
    );

    await updateR2BackupManifestAndRetention(
      s3Client,
      bucketName,
      snapshotMeta,
      currentState.config.retentionCount
    );

    updateStoredBackupState({
      lastBackupTimeMs: payload.timestampMs,
      lastBackupMeta: snapshotMeta,
      lastDataChecksum: checksum,
      lastError: null,
    });

    return { success: true, meta: snapshotMeta };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error('[R2AutoBackup] Backup failed:', err);
    updateStoredBackupState({ lastError: errMsg });
    return { success: false, reason: errMsg };
  } finally {
    setBackupInFlight(false);
  }
}

async function updateR2BackupManifestAndRetention(
  s3Client: any,
  bucketName: string,
  newMeta: R2BackupSnapshotMeta,
  retentionCount: number
) {
  try {
    const { GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = await getS3Sdk();
    let history: R2BackupSnapshotMeta[] = [];

    try {
      const resp = await s3Client.send(
        new GetObjectCommand({ Bucket: bucketName, Key: R2_MANIFEST_KEY })
      );
      if (resp.Body) {
        const text = await resp.Body.transformToString();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed?.snapshots)) {
          history = parsed.snapshots;
        }
      }
    } catch {
      // Manifest may not exist on first run
    }

    const merged = [newMeta, ...history.filter((item) => item.key !== newMeta.key)].sort(
      (a, b) => b.timestampMs - a.timestampMs
    );

    const maxKeep = Math.max(5, retentionCount || 30);
    const toKeep = merged.slice(0, maxKeep);
    const toDelete = merged.slice(maxKeep);

    for (const oldItem of toDelete) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({ Bucket: bucketName, Key: oldItem.key })
        );
      } catch {
        // Ignore individual deletion failure
      }
    }

    const manifestPayload = {
      updatedAtIso: new Date().toISOString(),
      protectionHorizon: '2027-Operations-Guard',
      latestSnapshot: newMeta,
      snapshots: toKeep,
    };

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: R2_MANIFEST_KEY,
        Body: new TextEncoder().encode(JSON.stringify(manifestPayload, null, 2)),
        ContentType: 'application/json',
      })
    );
  } catch (e) {
    console.warn('[R2AutoBackup] Manifest update warning:', e);
  }
}

export async function listR2BackupSnapshots(): Promise<R2BackupSnapshotMeta[]> {
  const creds = await getStoredR2CredentialsAsync();
  if (!isR2CredentialsValid(creds)) return [];

  const { GetObjectCommand, ListObjectsV2Command } = await getS3Sdk();
  const s3Client = await createR2S3Client(creds);
  const bucketName = creds.bucketName.trim();

  try {
    const resp = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: R2_MANIFEST_KEY })
    );
    if (resp.Body) {
      const text = await resp.Body.transformToString();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.snapshots)) {
        return parsed.snapshots;
      }
    }
  } catch {
    // Fallback to S3 ListObjectsV2
  }

  try {
    const listResp = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `${R2_BACKUP_PREFIX}snapshots/`,
      })
    );
    const contents = listResp.Contents || [];
    return contents
      .filter((obj: any) => obj.Key && !obj.Key.endsWith('/'))
      .map((obj: any) => {
        const key = String(obj.Key);
        const fileName = key.split('/').pop() || key;
        const ts = obj.LastModified ? new Date(obj.LastModified).getTime() : Date.now();
        return {
          key,
          fileName,
          createdAtIso: new Date(ts).toISOString(),
          timestampMs: ts,
          triggeredBy: fileName.includes('cron_auto') ? 'cron_auto' : 'manual',
          rawSizeBytes: Number(obj.Size) || 0,
          compressedSizeBytes: Number(obj.Size) || 0,
          compressionRatioPercent: 0,
          projectsCount: 0,
          tasksCount: 0,
          costsCount: 0,
          delegationsCount: 0,
          dataChecksum: '',
        } as R2BackupSnapshotMeta;
      })
      .sort((a: R2BackupSnapshotMeta, b: R2BackupSnapshotMeta) => b.timestampMs - a.timestampMs);
  } catch (e) {
    console.warn('[R2AutoBackup] Failed to list snapshots from R2:', e);
    return [];
  }
}

export async function downloadAndDecompressR2Backup(key: string): Promise<any> {
  const creds = await getStoredR2CredentialsAsync();
  if (!isR2CredentialsValid(creds)) {
    throw new Error('Cloudflare R2 credentials are not valid.');
  }

  const { GetObjectCommand } = await getS3Sdk();
  const s3Client = await createR2S3Client(creds);
  const resp = await s3Client.send(
    new GetObjectCommand({
      Bucket: creds.bucketName.trim(),
      Key: key,
    })
  );

  if (!resp.Body) {
    throw new Error('Empty backup object body from R2.');
  }

  const byteArray = await resp.Body.transformToByteArray();
  const jsonText = await decompressBackupBytes(byteArray);
  return JSON.parse(jsonText);
}

export async function deleteR2BackupSnapshot(key: string): Promise<boolean> {
  const creds = await getStoredR2CredentialsAsync();
  if (!isR2CredentialsValid(creds)) return false;

  const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = await getS3Sdk();
  const s3Client = await createR2S3Client(creds);
  const bucketName = creds.bucketName.trim();

  await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));

  try {
    const resp = await s3Client.send(
      new GetObjectCommand({ Bucket: bucketName, Key: R2_MANIFEST_KEY })
    );
    if (resp.Body) {
      const text = await resp.Body.transformToString();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed?.snapshots)) {
        parsed.snapshots = parsed.snapshots.filter((s: any) => s.key !== key);
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: R2_MANIFEST_KEY,
            Body: new TextEncoder().encode(JSON.stringify(parsed, null, 2)),
            ContentType: 'application/json',
          })
        );
      }
    }
  } catch {
    // ignore
  }

  return true;
}

export async function downloadLocalBackupFile(compressed = true): Promise<void> {
  const { payload } = await collectFullSystemBackupPayload();
  const jsonString = JSON.stringify(payload, null, 2);
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (compressed) {
    const { bytes, isGzipped } = await compressStringToGzip(jsonString);
    const blob = new Blob([bytes], {
      type: isGzipped ? 'application/gzip' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taka_2027_backup_${stamp}.${isGzipped ? 'json.gz' : 'json'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taka_2027_backup_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export function startR2AutoBackupCronDaemon(): () => void {
  if (_cronIntervalId) {
    clearInterval(_cronIntervalId);
    _cronIntervalId = null;
  }

  const checkAndTriggerCron = async () => {
    try {
      const currentUser = useAppStore.getState().currentUser;
      if (!currentUser || currentUser.role === 'guest') return;

      const state = getR2AutoBackupState();
      if (!state.config.enabled || state.isRunning) return;

      const intervalMs = Math.max(1, state.config.intervalHours) * 3600 * 1000;
      const elapsed = Date.now() - state.lastBackupTimeMs;

      if (elapsed >= intervalMs) {
        setTimeout(() => {
          executeR2BackupNow({ triggeredBy: 'cron_auto', force: false }).catch((err) => {
            console.warn('[R2AutoBackupCron] Scheduled run warning:', err);
          });
        }, 1500);
      }
    } catch (e) {
      console.warn('[R2AutoBackupCron] Check cycle error:', e);
    }
  };

  const initialTimer = setTimeout(() => {
    checkAndTriggerCron();
  }, 25000);

  _cronIntervalId = setInterval(checkAndTriggerCron, 5 * 60 * 1000);

  const handleVisibilityWake = () => {
    if (document.visibilityState === 'visible') {
      checkAndTriggerCron();
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityWake);

  return () => {
    clearTimeout(initialTimer);
    if (_cronIntervalId) {
      clearInterval(_cronIntervalId);
      _cronIntervalId = null;
    }
    document.removeEventListener('visibilitychange', handleVisibilityWake);
  };
}
