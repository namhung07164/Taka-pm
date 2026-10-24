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
  const collectionsConfig = [
    { name: "taka_projects", field: "year" },
    { name: "taka_tasks", field: "projectYear" },
    { name: "taka_costs", field: "projectYear" },
    { name: "taka_delegation_groups", field: "projectYear" }
  ];

  for (const item of collectionsConfig) {
    const colRef = collection(db, "artifacts", APP_ID, "public", "data", item.name);
    const snap = await getDocs(colRef);
    let batch = writeBatch(db);
    let count = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const rawYear = data[item.field];
      if (typeof rawYear === "string") {
        const numYear = Number(rawYear.trim());
        if (!isNaN(numYear) && numYear > 2000 && numYear < 2100) {
          batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), { [item.field]: numYear });
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
    if (count > 0) await batch.commit();
  }
  return totalUpdated;
}

export async function repairMissingTaskYears(): Promise<number> {
  const projRef = collection(db, "artifacts", APP_ID, "public", "data", "taka_projects");
  const projSnap = await getDocs(projRef);
  const projectYearMap = new Map<string, number>();
  projSnap.docs.forEach(docSnap => {
    const data = docSnap.data();
    if (data.code && data.year && typeof data.year === 'number') {
      projectYearMap.set(data.code, data.year);
    }
  });

  let totalUpdated = 0;
  const collectionsConfig = [
    { name: "taka_tasks", field: "projectYear" },
    { name: "taka_costs", field: "projectYear" },
    { name: "taka_delegation_groups", field: "projectYear" }
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
        const code = data.projectCode || data.code;
        if (code && projectYearMap.has(code)) {
          const correctYear = projectYearMap.get(code);
          batch.update(doc(db, "artifacts", APP_ID, "public", "data", item.name, d.id), {
            [item.field]: correctYear
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
    for (const year of yearsToArchive) {
      const field = colName === "taka_projects" ? "year" : "projectYear";
      const q = query(
        collection(db, "artifacts", APP_ID, "public", "data", colName),
        where(field, "==", year)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => archiveData[colName].push({ id: d.id, ...d.data() }));
    }
  }

  const jsonStr = JSON.stringify(archiveData);
  const archiveRef = ref(storage, `archives/${APP_ID}/cold_storage_2024_2025_${Date.now()}.json`);
  await uploadString(archiveRef, jsonStr, 'raw', { contentType: 'application/json' });
  return Object.values(archiveData).reduce((acc: number, arr: any) => acc + arr.length, 0);
}
