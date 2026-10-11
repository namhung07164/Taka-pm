import { doc, collection, query, where, getDocs } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID, storage } from '../../lib/firebase';
import { ref, uploadString } from 'firebase/storage';

export async function purgeDeletedTombstones(): Promise<number> {
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  let deletedCount = 0;
  for (const colName of ["taka_projects", "taka_tasks", "taka_costs"]) {
    const q = query(
      collection(db, "artifacts", APP_ID, "public", "data", colName),
      where("isDeleted", "==", true),
      where("updatedAt", "<", sixtyDaysAgo)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const batch = writeBatch(db);
      snap.docs.forEach(d => { batch.delete(d.ref); deletedCount++; });
      await batch.commit();
    }
  }
  return deletedCount;
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
