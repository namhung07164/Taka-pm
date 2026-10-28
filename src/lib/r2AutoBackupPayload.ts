import { useAppStore } from '../store/useAppStore';
import { localDb } from './localDb';
import { safeGetItemLocal, safeSetItemLocal } from './storage';

export interface R2AutoBackupConfig {
  enabled: boolean;
  intervalHours: number;
  retentionCount: number;
  targetYearHorizon: string;
  onlyWhenChanged: boolean;
}

export interface R2BackupSnapshotMeta {
  key: string;
  fileName: string;
  createdAtIso: string;
  timestampMs: number;
  triggeredBy: 'cron_auto' | 'manual';
  triggeredUser?: string;
  rawSizeBytes: number;
  compressedSizeBytes: number;
  compressionRatioPercent: number;
  projectsCount: number;
  tasksCount: number;
  costsCount: number;
  delegationsCount: number;
  dataChecksum: string;
}

export interface R2AutoBackupState {
  config: R2AutoBackupConfig;
  lastBackupTimeMs: number;
  lastBackupMeta: R2BackupSnapshotMeta | null;
  lastDataChecksum: string;
  isRunning: boolean;
  lastError: string | null;
}

const LS_CONFIG_KEY = 'taka_r2_auto_backup_config_v1';
const LS_STATE_KEY = 'taka_r2_auto_backup_state_v1';

const DEFAULT_CONFIG: R2AutoBackupConfig = {
  enabled: true,
  intervalHours: 6,
  retentionCount: 30,
  targetYearHorizon: '2027',
  onlyWhenChanged: true,
};

let _isBackupInFlight = false;
const _listeners = new Set<(state: R2AutoBackupState) => void>();

export function getBackupInFlight(): boolean {
  return _isBackupInFlight;
}

export function setBackupInFlight(val: boolean): void {
  _isBackupInFlight = val;
  notifyBackupListeners();
}

export function getR2AutoBackupConfig(): R2AutoBackupConfig {
  try {
    const raw = safeGetItemLocal(LS_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : DEFAULT_CONFIG.enabled,
        intervalHours: Number(parsed.intervalHours) > 0 ? Number(parsed.intervalHours) : DEFAULT_CONFIG.intervalHours,
        retentionCount: Number(parsed.retentionCount) >= 5 ? Number(parsed.retentionCount) : DEFAULT_CONFIG.retentionCount,
        targetYearHorizon: parsed.targetYearHorizon || DEFAULT_CONFIG.targetYearHorizon,
        onlyWhenChanged: parsed.onlyWhenChanged !== undefined ? Boolean(parsed.onlyWhenChanged) : DEFAULT_CONFIG.onlyWhenChanged,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveR2AutoBackupConfig(partial: Partial<R2AutoBackupConfig>): R2AutoBackupConfig {
  const next = { ...getR2AutoBackupConfig(), ...partial };
  try {
    safeSetItemLocal(LS_CONFIG_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  notifyBackupListeners();
  return next;
}

export function getR2AutoBackupState(): R2AutoBackupState {
  const config = getR2AutoBackupConfig();
  let lastBackupTimeMs = 0;
  let lastBackupMeta: R2BackupSnapshotMeta | null = null;
  let lastDataChecksum = '';
  let lastError: string | null = null;

  try {
    const raw = safeGetItemLocal(LS_STATE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      lastBackupTimeMs = Number(parsed.lastBackupTimeMs) || 0;
      lastBackupMeta = parsed.lastBackupMeta || null;
      lastDataChecksum = parsed.lastDataChecksum || '';
      lastError = parsed.lastError || null;
    }
  } catch {
    // ignore
  }

  return {
    config,
    lastBackupTimeMs,
    lastBackupMeta,
    lastDataChecksum,
    isRunning: _isBackupInFlight,
    lastError,
  };
}

export function updateStoredBackupState(patch: Partial<Omit<R2AutoBackupState, 'config' | 'isRunning'>>) {
  const current = getR2AutoBackupState();
  const next = {
    lastBackupTimeMs: patch.lastBackupTimeMs !== undefined ? patch.lastBackupTimeMs : current.lastBackupTimeMs,
    lastBackupMeta: patch.lastBackupMeta !== undefined ? patch.lastBackupMeta : current.lastBackupMeta,
    lastDataChecksum: patch.lastDataChecksum !== undefined ? patch.lastDataChecksum : current.lastDataChecksum,
    lastError: patch.lastError !== undefined ? patch.lastError : current.lastError,
  };
  try {
    safeSetItemLocal(LS_STATE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  notifyBackupListeners();
}

export function subscribeR2AutoBackupState(listener: (state: R2AutoBackupState) => void): () => void {
  _listeners.add(listener);
  listener(getR2AutoBackupState());
  return () => {
    _listeners.delete(listener);
  };
}

export function notifyBackupListeners() {
  const st = getR2AutoBackupState();
  _listeners.forEach((fn) => {
    try {
      fn(st);
    } catch {
      // ignore
    }
  });
}

function computeFastDataChecksum(
  projects: any[],
  tasks: any[],
  costs: any[],
  delegations: any[]
): string {
  let maxUpdated = '';
  const scanUpdated = (arr: any[]) => {
    for (let i = 0; i < arr.length; i++) {
      const u = String(arr[i]?.updatedAt || '');
      if (u > maxUpdated) maxUpdated = u;
    }
  };
  scanUpdated(projects);
  scanUpdated(tasks);
  scanUpdated(costs);
  scanUpdated(delegations);
  return `P${projects.length}_T${tasks.length}_C${costs.length}_D${delegations.length}_${maxUpdated}`;
}

export async function collectFullSystemBackupPayload() {
  const storeState = useAppStore.getState();

  const mergeById = <T extends { id?: string; isDeleted?: boolean; _isVirtualSummary?: boolean }>(
    dbItems: T[],
    memItems: T[]
  ): T[] => {
    const map = new Map<string, T>();
    for (let i = 0; i < dbItems.length; i++) {
      const it = dbItems[i];
      if (it?.id && !it.isDeleted && !it._isVirtualSummary) {
        map.set(it.id, it);
      }
    }
    for (let i = 0; i < memItems.length; i++) {
      const it = memItems[i];
      if (it?.id && !it.isDeleted && !it._isVirtualSummary) {
        map.set(it.id, it);
      }
    }
    return Array.from(map.values());
  };

  let dbProjects: any[] = [];
  let dbTasks: any[] = [];
  let dbCosts: any[] = [];
  let dbDelegations: any[] = [];

  try {
    [dbProjects, dbTasks, dbCosts, dbDelegations] = await Promise.all([
      localDb.projects.toArray(),
      localDb.tasks.toArray(),
      localDb.costs.toArray(),
      localDb.delegations.toArray(),
    ]);
  } catch {
    // Fallback to in-memory Zustand store if IndexedDB is restricted
  }

  const projects = mergeById(dbProjects, storeState.projects || []);
  const tasks = mergeById(dbTasks, storeState.tasks || []);
  const costs = mergeById(dbCosts, storeState.costs || []);
  const delegations = mergeById(dbDelegations, storeState.delegationGroups || []);

  const checksum = computeFastDataChecksum(projects, tasks, costs, delegations);
  const now = new Date();

  let layoutMappingBackup: any = null;
  try {
    const rawLayout = safeGetItemLocal('taka_mapping_config_backup');
    if (rawLayout) layoutMappingBackup = JSON.parse(rawLayout);
  } catch {
    // ignore
  }

  const payload = {
    schemaVersion: '2027.1',
    protectionHorizon: '2027-Operations-Guard',
    createdAtIso: now.toISOString(),
    timestampMs: now.getTime(),
    dataChecksum: checksum,
    counts: {
      projects: projects.length,
      tasks: tasks.length,
      costs: costs.length,
      delegations: delegations.length,
    },
    systemConfig: {
      locations: storeState.locations || [],
      parties: storeState.parties || [],
      jpyRate: storeState.jpyRate,
      usdRate: storeState.usdRate,
      notificationRules: storeState.notificationRules || [],
    },
    layoutMappingBackup,
    data: {
      projects,
      tasks,
      costs,
      delegationGroups: delegations,
    },
  };

  return { payload, checksum };
}

export async function compressStringToGzip(jsonString: string): Promise<{
  bytes: Uint8Array;
  isGzipped: boolean;
  rawSizeBytes: number;
  compressedSizeBytes: number;
}> {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(jsonString);
  const rawSizeBytes = rawBytes.byteLength;

  if (typeof CompressionStream !== 'undefined') {
    try {
      const cs = new CompressionStream('gzip');
      const writer = cs.writable.getWriter();
      await writer.write(rawBytes);
      await writer.close();
      const buffer = await new Response(cs.readable).arrayBuffer();
      const compressedBytes = new Uint8Array(buffer);
      return {
        bytes: compressedBytes,
        isGzipped: true,
        rawSizeBytes,
        compressedSizeBytes: compressedBytes.byteLength,
      };
    } catch (e) {
      console.warn('[R2AutoBackup] Native CompressionStream failed, falling back to plain UTF-8:', e);
    }
  }

  return {
    bytes: rawBytes,
    isGzipped: false,
    rawSizeBytes,
    compressedSizeBytes: rawSizeBytes,
  };
}

export async function decompressBackupBytes(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip && typeof DecompressionStream !== 'undefined') {
    const ds = new DecompressionStream('gzip');
    const writer = ds.writable.getWriter();
    await writer.write(bytes);
    await writer.close();
    return await new Response(ds.readable).text();
  }
  return new TextDecoder().decode(bytes);
}
