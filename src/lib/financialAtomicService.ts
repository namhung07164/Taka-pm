import { db, APP_ID } from "./firebase";
import { doc, increment } from 'firebase/firestore';
import { Cost } from "../types";
import { useAppStore } from "../store/useAppStore";
import { recordDelta } from "./deltaSyncService";
import { writeBatch } from "../lib/firestoreWrites";
import { calculatePaidBreakdown } from './financialService';

export async function saveCostWithAtomicSummary(
  projectId: string, 
  newCostData: Cost, 
  oldCostData: Cost | null, 
  budgetHierarchy?: { level3Id?: string, level2Id?: string, level1Id?: string }
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Calculate Deltas
  const oldCalc = oldCostData ? calculatePaidBreakdown(oldCostData) : { actualPaid: 0, forecastPaid: 0, totalApproved: 0 };
  const newCalc = calculatePaidBreakdown(newCostData);

  const deltaActual = newCalc.actualPaid - oldCalc.actualPaid;
  const deltaForecast = newCalc.forecastPaid - oldCalc.forecastPaid;
  const deltaApproved = newCalc.totalApproved - oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast);

  // 2. Cost Document
  const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', newCostData.id);
  batch.set(costRef, { ...newCostData }, { merge: true });

  // 3. Budget Hierarchy Cascade (Rule 3: Atomic Aggregates)
  if (budgetHierarchy) {
    if (budgetHierarchy.level3Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level3Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level2Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level2Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level1Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level1Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
  }

  // 4. Create 1 single payload for taka_projects (Rule 3: Dot-Notation)
  const projectUpdates: Record<string, any> = {};

  // 4.1. Project Totals
  projectUpdates['financial.totalApproved'] = increment(deltaApproved);
  projectUpdates['financial.totalActualPaid'] = increment(deltaActual);
  projectUpdates['financial.totalForecastPaid'] = increment(deltaForecast);
  projectUpdates['financial.totalBalance'] = increment(deltaBalance);

  // 4.2. Store Logic
  const oldStore = (oldCostData?.projectStore || 'HCM').toUpperCase();
  const newStore = (newCostData.projectStore || 'HCM').toUpperCase();

  if (!oldCostData || oldStore === newStore) {
    projectUpdates[`financial.byStore.${newStore}.totalApproved`] = increment(deltaApproved);
    projectUpdates[`financial.byStore.${newStore}.totalActualPaid`] = increment(deltaActual);
    projectUpdates[`financial.byStore.${newStore}.totalForecastPaid`] = increment(deltaForecast);
    projectUpdates[`financial.byStore.${newStore}.totalBalance`] = increment(deltaBalance);
  } else {
    // CHANGE OF STORE: subtract old from oldStore, add new to newStore
    projectUpdates[`financial.byStore.${oldStore}.totalApproved`] = increment(-oldCalc.totalApproved);
    projectUpdates[`financial.byStore.${oldStore}.totalActualPaid`] = increment(-oldCalc.actualPaid);
    projectUpdates[`financial.byStore.${oldStore}.totalForecastPaid`] = increment(-oldCalc.forecastPaid);
    projectUpdates[`financial.byStore.${oldStore}.totalBalance`] = increment(-(oldCalc.totalApproved - (oldCalc.actualPaid + oldCalc.forecastPaid)));

    projectUpdates[`financial.byStore.${newStore}.totalApproved`] = increment(newCalc.totalApproved);
    projectUpdates[`financial.byStore.${newStore}.totalActualPaid`] = increment(newCalc.actualPaid);
    projectUpdates[`financial.byStore.${newStore}.totalForecastPaid`] = increment(newCalc.forecastPaid);
    projectUpdates[`financial.byStore.${newStore}.totalBalance`] = increment(newCalc.totalApproved - (newCalc.actualPaid + newCalc.forecastPaid));
  }

  // 4.3. Year Logic
  const oldYear = String(oldCostData?.projectYear || '2026');
  const newYear = String(newCostData.projectYear || '2026');

  if (!oldCostData || oldYear === newYear) {
    projectUpdates[`financial.byYear.${newYear}.totalApproved`] = increment(deltaApproved);
    projectUpdates[`financial.byYear.${newYear}.totalActualPaid`] = increment(deltaActual);
    projectUpdates[`financial.byYear.${newYear}.totalForecastPaid`] = increment(deltaForecast);
    projectUpdates[`financial.byYear.${newYear}.totalBalance`] = increment(deltaBalance);
  } else {
    // CHANGE OF YEAR: subtract old from oldYear, add new to newYear
    projectUpdates[`financial.byYear.${oldYear}.totalApproved`] = increment(-oldCalc.totalApproved);
    projectUpdates[`financial.byYear.${oldYear}.totalActualPaid`] = increment(-oldCalc.actualPaid);
    projectUpdates[`financial.byYear.${oldYear}.totalForecastPaid`] = increment(-oldCalc.forecastPaid);
    projectUpdates[`financial.byYear.${oldYear}.totalBalance`] = increment(-(oldCalc.totalApproved - (oldCalc.actualPaid + oldCalc.forecastPaid)));

    projectUpdates[`financial.byYear.${newYear}.totalApproved`] = increment(newCalc.totalApproved);
    projectUpdates[`financial.byYear.${newYear}.totalActualPaid`] = increment(newCalc.actualPaid);
    projectUpdates[`financial.byYear.${newYear}.totalForecastPaid`] = increment(newCalc.forecastPaid);
    projectUpdates[`financial.byYear.${newYear}.totalBalance`] = increment(newCalc.totalApproved - (newCalc.actualPaid + newCalc.forecastPaid));
  }

  // Apply single update to project
  batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectId), projectUpdates);

  // Optimistic Update: Cập nhật tức thì vào Zustand Store in-memory (Rule 2)
  const optimisticStore = useAppStore.getState();
  optimisticStore.optimisticUpdateProjectFinancial(projectId, {
    'financial.totalApproved': deltaApproved,
    'financial.totalActualPaid': deltaActual,
    'financial.totalForecastPaid': deltaForecast,
    'financial.totalBalance': deltaBalance,
    [`financial.byStore.${newStore}.totalApproved`]: newCalc.totalApproved - (oldStore === newStore ? oldCalc.totalApproved : 0),
    [`financial.byStore.${newStore}.totalActualPaid`]: newCalc.actualPaid - (oldStore === newStore ? oldCalc.actualPaid : 0),
    [`financial.byStore.${newStore}.totalForecastPaid`]: newCalc.forecastPaid - (oldStore === newStore ? oldCalc.forecastPaid : 0),
    [`financial.byYear.${newYear}.totalApproved`]: newCalc.totalApproved - (oldYear === newYear ? oldCalc.totalApproved : 0),
    [`financial.byYear.${newYear}.totalActualPaid`]: newCalc.actualPaid - (oldYear === newYear ? oldCalc.actualPaid : 0),
    [`financial.byYear.${newYear}.totalForecastPaid`]: newCalc.forecastPaid - (oldYear === newYear ? oldCalc.forecastPaid : 0),
  });

  if (oldStore !== newStore && oldCostData) {
     optimisticStore.optimisticUpdateProjectFinancial(projectId, {
       [`financial.byStore.${oldStore}.totalApproved`]: -oldCalc.totalApproved,
       [`financial.byStore.${oldStore}.totalActualPaid`]: -oldCalc.actualPaid,
       [`financial.byStore.${oldStore}.totalForecastPaid`]: -oldCalc.forecastPaid,
     });
  }
  if (oldYear !== newYear && oldCostData) {
     optimisticStore.optimisticUpdateProjectFinancial(projectId, {
       [`financial.byYear.${oldYear}.totalApproved`]: -oldCalc.totalApproved,
       [`financial.byYear.${oldYear}.totalActualPaid`]: -oldCalc.actualPaid,
       [`financial.byYear.${oldYear}.totalForecastPaid`]: -oldCalc.forecastPaid,
     });
  }

  // 5. Commit batch
  batch.commit().catch(console.error);

  recordDelta({
    docId: newCostData.id,
    collectionName: 'taka_costs',
    action: oldCostData ? 'update' : 'create',
    isPatch: !!oldCostData,
    data: newCostData,
    year: String(newCostData.projectYear || '2026'),
  }).catch(() => {});

  const latestProjForSave = useAppStore.getState().projects.find(p => p.id === projectId);
  if (latestProjForSave?.financial) {
    recordDelta({
      docId: projectId,
      collectionName: 'taka_projects',
      action: 'update',
      isPatch: true,
      data: { financial: latestProjForSave.financial },
      year: String(latestProjForSave.year || newCostData.projectYear || '2026'),
    }).catch(() => {});
  }
}

export async function deleteCostWithAtomicSummary(
  projectId: string, 
  costToDelete: Cost, 
  budgetHierarchy?: { level3Id?: string, level2Id?: string, level1Id?: string }
): Promise<void> {
  const batch = writeBatch(db);

  // 1. Calculate Deltas for deletion
  const oldCalc = calculatePaidBreakdown(costToDelete);

  const deltaActual = -oldCalc.actualPaid;
  const deltaForecast = -oldCalc.forecastPaid;
  const deltaApproved = -oldCalc.totalApproved;
  const deltaBalance = deltaApproved - (deltaActual + deltaForecast);

  // 2. Cost Document (Mark Deleted)
  const costRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', costToDelete.id);
  batch.set(costRef, { id: costToDelete.id, isDeleted: true }, { merge: true });

  // 3. Budget Hierarchy Cascade
  if (budgetHierarchy) {
    if (budgetHierarchy.level3Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level3Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level2Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level2Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
    if (budgetHierarchy.level1Id) {
      batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', budgetHierarchy.level1Id), {
        actualPaid: increment(deltaActual),
        forecastPaid: increment(deltaForecast),
        balance: increment(deltaBalance)
      });
    }
  }

  // 4. Create 1 single payload for taka_projects (Dot-Notation)
  const projectUpdates: Record<string, any> = {};

  projectUpdates['financial.totalApproved'] = increment(deltaApproved);
  projectUpdates['financial.totalActualPaid'] = increment(deltaActual);
  projectUpdates['financial.totalForecastPaid'] = increment(deltaForecast);
  projectUpdates['financial.totalBalance'] = increment(deltaBalance);

  const store = (costToDelete.projectStore || 'HCM').toUpperCase();
  projectUpdates[`financial.byStore.${store}.totalApproved`] = increment(deltaApproved);
  projectUpdates[`financial.byStore.${store}.totalActualPaid`] = increment(deltaActual);
  projectUpdates[`financial.byStore.${store}.totalForecastPaid`] = increment(deltaForecast);
  projectUpdates[`financial.byStore.${store}.totalBalance`] = increment(deltaBalance);

  const year = String(costToDelete.projectYear || '2026');
  projectUpdates[`financial.byYear.${year}.totalApproved`] = increment(deltaApproved);
  projectUpdates[`financial.byYear.${year}.totalActualPaid`] = increment(deltaActual);
  projectUpdates[`financial.byYear.${year}.totalForecastPaid`] = increment(deltaForecast);
  projectUpdates[`financial.byYear.${year}.totalBalance`] = increment(deltaBalance);

  batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectId), projectUpdates);

  const optimisticStore = useAppStore.getState();
  optimisticStore.optimisticUpdateProjectFinancial(projectId, {
    'financial.totalApproved': deltaApproved,
    'financial.totalActualPaid': deltaActual,
    'financial.totalForecastPaid': deltaForecast,
    'financial.totalBalance': deltaBalance,
    [`financial.byStore.${store}.totalApproved`]: deltaApproved,
    [`financial.byStore.${store}.totalActualPaid`]: deltaActual,
    [`financial.byStore.${store}.totalForecastPaid`]: deltaForecast,
    [`financial.byStore.${store}.totalBalance`]: deltaBalance,
    [`financial.byYear.${year}.totalApproved`]: deltaApproved,
    [`financial.byYear.${year}.totalActualPaid`]: deltaActual,
    [`financial.byYear.${year}.totalForecastPaid`]: deltaForecast,
    [`financial.byYear.${year}.totalBalance`]: deltaBalance,
  });

  // 5. Commit
  batch.commit().catch(console.error);

  recordDelta({
    docId: costToDelete.id,
    collectionName: 'taka_costs',
    action: 'delete',
    data: { id: costToDelete.id, isDeleted: true },
    year: String(costToDelete.projectYear || '2026'),
  }).catch(() => {});

  const latestProjForDelete = useAppStore.getState().projects.find(p => p.id === projectId);
  if (latestProjForDelete?.financial) {
    recordDelta({
      docId: projectId,
      collectionName: 'taka_projects',
      action: 'update',
      isPatch: true,
      data: { financial: latestProjForDelete.financial },
      year: String(latestProjForDelete.year || year),
    }).catch(() => {});
  }
}
