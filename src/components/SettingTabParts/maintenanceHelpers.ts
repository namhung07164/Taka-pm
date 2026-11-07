import { doc, collection, query, where, getDocs, writeBatch as rawWriteBatch } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID, storage } from '../../lib/firebase';
import { ref, uploadString } from 'firebase/storage';

export async function purgeDeletedTombstones(): Promise<number> {
  let deletedCount = 0;
  for (const colName of ["taka_projects", "taka_tasks", "taka_costs", "taka_delegation_groups"]) {
    const q = query(
      collection(db, "artifacts", APP_ID, "public", "data", colName),
      where("isDeleted", "==", true)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      let batch = rawWriteBatch(db);
      let count = 0;
      for (const d of snap.docs) {
        batch.delete(d.ref);
        deletedCount++;
        count++;
        if (count >= 400) {
          await batch.commit();
          batch = rawWriteBatch(db);
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
    }
  }
  return deletedCount;
}

export interface FirestoreOptimizationReport {
  purgedDeltas: number;
  purgedTombstones: number;
  purgedOrphanTasks: number;
  purgedNoiseAuditLogs: number;
  purgedStaleMetrics: number;
}

/**
 * Deeply cleans and optimizes Firestore storage by removing:
 * 1. Expired delta logs (`taka_deltas` older than 24h)
 * 2. Soft-deleted tombstones (`isDeleted == true` across all collections)
 * 3. Orphan tasks belonging to deleted/non-existent projects
 * 4. Redundant schedule-only `audit_logs` containing bloated `taskSummaries`
 * 5. Stale `taka_device_metrics` older than 7 days
 */
export async function optimizeFirestoreStorage(): Promise<FirestoreOptimizationReport> {
  const report: FirestoreOptimizationReport = {
    purgedDeltas: 0,
    purgedTombstones: 0,
    purgedOrphanTasks: 0,
    purgedNoiseAuditLogs: 0,
    purgedStaleMetrics: 0,
  };

  const commitDeletes = async (refs: any[]): Promise<number> => {
    if (!refs.length) return 0;
    for (let i = 0; i < refs.length; i += 400) {
      const chunk = refs.slice(i, i + 400);
      const batch = rawWriteBatch(db);
      chunk.forEach((r) => batch.delete(r));
      await batch.commit();
    }
    return refs.length;
  };

  // 1. Purge soft-deleted tombstones
  report.purgedTombstones = await purgeDeletedTombstones();

  // 2. Purge deltas older than 24 hours
  const deltaCutoff = Date.now() - 24 * 60 * 60 * 1000;
  const deltaSnap = await getDocs(
    query(
      collection(db, "artifacts", APP_ID, "public", "data", "taka_deltas"),
      where("numericTime", "<", deltaCutoff)
    )
  );
  report.purgedDeltas = await commitDeletes(deltaSnap.docs.map((d) => d.ref));

  // 3. Purge orphan tasks whose projectId references a deleted or missing project
  const [projSnap, taskSnap] = await Promise.all([
    getDocs(collection(db, "artifacts", APP_ID, "public", "data", "taka_projects")),
    getDocs(collection(db, "artifacts", APP_ID, "public", "data", "taka_tasks")),
  ]);
  const activeProjectIds = new Set<string>();
  projSnap.docs.forEach((d) => {
    const pData = d.data();
    if (!pData.isDeleted) activeProjectIds.add(d.id);
  });
  const orphanTaskRefs: any[] = [];
  taskSnap.docs.forEach((d) => {
    const tData = d.data();
    if (tData.isDeleted) {
      orphanTaskRefs.push(d.ref);
    } else if (tData.projectId && !activeProjectIds.has(String(tData.projectId))) {
      orphanTaskRefs.push(d.ref);
    }
  });
  report.purgedOrphanTasks = await commitDeletes(orphanTaskRefs);

  // 4. Purge redundant schedule-only audit_logs (that stored huge taskSummaries on auto-sync)
  const auditSnap = await getDocs(collection(db, "artifacts", APP_ID, "public", "data", "audit_logs"));
  const scheduleKeys = new Set([
    "updatedAt",
    "computedTakStart",
    "computedTakCompl",
    "computedOpening",
    "computedPlanProgress",
    "computedActProgress",
    "taskCount",
    "taskSummaries",
  ]);
  const noiseAuditRefs: any[] = [];
  auditSnap.docs.forEach((d) => {
    const aData = d.data();
    const payload = aData?.data;
    if (aData?.entityType === "project" && aData?.action === "UPDATE" && payload && typeof payload === "object") {
      const keys = Object.keys(payload);
      if (keys.length > 0 && keys.every((k) => scheduleKeys.has(k))) {
        noiseAuditRefs.push(d.ref);
      }
    }
  });
  report.purgedNoiseAuditLogs = await commitDeletes(noiseAuditRefs);

  // 5. Purge stale device telemetry (> 7 days)
  const metricCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const metricSnap = await getDocs(collection(db, "artifacts", APP_ID, "public", "data", "taka_device_metrics"));
  const staleMetricRefs = metricSnap.docs
    .filter((d) => Number(d.data()?.lastActiveTimestamp || 0) < metricCutoff)
    .map((d) => d.ref);
  report.purgedStaleMetrics = await commitDeletes(staleMetricRefs);

  return report;
}

export async function standardizeFiscalYears(): Promise<number> {
  let totalUpdated = 0;
  const collectionsConfig: Array<{ name: string; field: string; targetType: 'number' | 'string' }> = [
    { name: "taka_projects", field: "year", targetType: "number" },
    { name: "taka_tasks", field: "projectYear", targetType: "string" },
    { name: "taka_costs", field: "projectYear", targetType: "number" },
    { name: "taka_delegation_groups", field: "projectYear", targetType: "string" }
  ];

  for (const item of collectionsConfig) {
    const colRef = collection(db, "artifacts", APP_ID, "public", "data", item.name);
    const snap = await getDocs(colRef);
    let batch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const rawYear = data[item.field];
      if (rawYear === undefined || rawYear === null || rawYear === '') continue;
      const numYear = Number(String(rawYear).trim());
      if (isNaN(numYear) || numYear <= 2000 || numYear >= 2100) continue;

      const normalizedValue = item.targetType === 'number' ? numYear : String(numYear);
      if (rawYear !== normalizedValue) {
        batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), { [item.field]: normalizedValue });
        count++;
        totalUpdated++;
        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }
    }
    if (count > 0) await batch.commit();
  }
  return totalUpdated;
}

export async function repairMissingTaskYears(): Promise<number> {
  const projRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
  const projSnap = await getDocs(projRef);

  // Rule 16.1 Composite Key Isolation: Index by projectId (#1), code+store (#2), and unambiguous code (#3)
  const yearByProjectId = new Map<string, number>();
  const yearsByCodeAndStore = new Map<string, Set<number>>();
  const yearsByCodeOnly = new Map<string, Set<number>>();

  projSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (data.isDeleted) return;
    const numYear = Number(String(data.year ?? '').trim());
    if (isNaN(numYear) || numYear <= 2000 || numYear >= 2100) return;

    yearByProjectId.set(docSnap.id, numYear);
    const codeLower = String(data.code || '').trim().toLowerCase();
    const storeLower = String(data.store || '').trim().toLowerCase();
    if (codeLower) {
      if (storeLower) {
        const csKey = `${codeLower}|${storeLower}`;
        if (!yearsByCodeAndStore.has(csKey)) yearsByCodeAndStore.set(csKey, new Set());
        yearsByCodeAndStore.get(csKey)!.add(numYear);
      }
      if (!yearsByCodeOnly.has(codeLower)) yearsByCodeOnly.set(codeLower, new Set());
      yearsByCodeOnly.get(codeLower)!.add(numYear);
    }
  });

  const resolveIsolatedProjectYear = (data: Record<string, any>): number | null => {
    const pid = data.projectId ? String(data.projectId).trim() : '';
    if (pid) {
      // Rule 16.1 Priority #1: If projectId is present, never fallback to a different project's code
      return yearByProjectId.get(pid) ?? null;
    }
    const codeLower = String(data.projectCode || data.code || '').trim().toLowerCase();
    const storeLower = String(data.projectStore || data.store || '').trim().toLowerCase();
    if (!codeLower) return null;

    if (storeLower) {
      const csYears = yearsByCodeAndStore.get(`${codeLower}|${storeLower}`);
      if (csYears && csYears.size === 1) {
        return Array.from(csYears)[0];
      }
      return null;
    }

    const codeYears = yearsByCodeOnly.get(codeLower);
    if (codeYears && codeYears.size === 1) {
      return Array.from(codeYears)[0];
    }
    return null;
  };

  let totalUpdated = 0;
  const collectionsConfig: Array<{ name: string; field: string; targetType: 'number' | 'string' }> = [
    { name: "taka_tasks", field: "projectYear", targetType: "string" },
    { name: "taka_costs", field: "projectYear", targetType: "number" },
    { name: "taka_delegation_groups", field: "projectYear", targetType: "string" }
  ];

  for (const item of collectionsConfig) {
    const colRef = collection(db, "artifacts", APP_ID, "public", "data", item.name);
    const snap = await getDocs(colRef);
    let batch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const rawYear = data[item.field];
      if (rawYear === undefined || rawYear === null || rawYear === '' || isNaN(Number(rawYear))) {
        const resolvedYear = resolveIsolatedProjectYear(data);
        if (resolvedYear !== null) {
          const formattedYear = item.targetType === 'number' ? resolvedYear : String(resolvedYear);
          batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), {
            [item.field]: formattedYear
          });
          count++;
          totalUpdated++;
          if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
      }
    }
    if (count > 0) {
      await batch.commit();
    }
  }
  return totalUpdated;
}

export async function archiveHistoricalData(): Promise<number> {
  const yearsToArchive = [2024, 2025];
  const archiveData: Record<string, any[]> = {
    taka_projects: [],
    taka_tasks: [],
    taka_costs: [],
    taka_delegation_groups: []
  };

  for (const colName of Object.keys(archiveData)) {
    const seenIds = new Set<string>();
    for (const year of yearsToArchive) {
      const field = colName === "taka_projects" ? "year" : "projectYear";
      const [numSnap, strSnap] = await Promise.all([
        getDocs(query(collection(db, "artifacts", APP_ID, "public", "data", colName), where(field, "==", year))),
        getDocs(query(collection(db, "artifacts", APP_ID, "public", "data", colName), where(field, "==", String(year)))),
      ]);
      for (const d of [...numSnap.docs, ...strSnap.docs]) {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          archiveData[colName].push({ id: d.id, ...d.data() });
        }
      }
    }
  }

  const jsonStr = JSON.stringify(archiveData);
  const archiveRef = ref(storage, `archives/${APP_ID}/cold_storage_2024_2025_${Date.now()}.json`);
  await uploadString(archiveRef, jsonStr, 'raw', { contentType: 'application/json' });
  return Object.values(archiveData).reduce((acc: number, arr: any) => acc + arr.length, 0);
}

/**
 * Forces a smart Cloudflare/PWA static asset update while preserving local Dexie database & Delta Sync state (0 extra Firestore Reads/Writes).
 */
export async function executeZeroReadForceUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const swTask = (async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const reg of registrations) {
            try {
              if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              await reg.update().catch(() => {});
              await reg.unregister().catch(() => {});
            } catch {}
          }
        } catch {}
      })();
      await Promise.race([swTask, new Promise(resolve => setTimeout(resolve, 600))]);
    }
  } catch (e) {
    console.warn('[ForceUpdate] SW warning:', e);
  }

  try {
    if ('caches' in window) {
      const cacheTask = (async () => {
        try {
          const cacheNames = await window.caches.keys();
          await Promise.all(cacheNames.map((name) => window.caches.delete(name).catch(() => {})));
        } catch {}
      })();
      await Promise.race([cacheTask, new Promise(resolve => setTimeout(resolve, 600))]);
    }
  } catch (e) {
    console.warn('[ForceUpdate] Cache purge warning:', e);
  }

  try {
    sessionStorage.clear();
  } catch {}

  const timestamp = Date.now();
  const url = new URL(window.location.href);
  url.searchParams.set('v', String(timestamp));
  url.searchParams.set('force_update', String(timestamp));

  try {
    window.location.href = url.toString();
  } catch {}

  setTimeout(() => {
    try {
      window.location.reload();
    } catch {
      window.location.href = url.toString();
    }
  }, 100);
}


