import React from 'react';
import { doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Cost, Project, TakaDeltaItem } from '../../types';
import { generateCSV, downloadCSV, parseCSV } from '../../lib/csvUtils';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { undoManager } from '../../lib/undoManager';
import { useAppStore } from '../../store/useAppStore';

interface UseCostCsvOpsParams {
  costs: Cost[];
  projects: Project[];
  filteredCostsForTotals: Cost[];
}

export function useCostCsvOps({
  costs,
  projects,
  filteredCostsForTotals,
}: UseCostCsvOpsParams) {
  const handleExportCosts = () => {
    const headers = [
      'store',
      'location',
      'projectYear',
      'projectCode',
      'budget',
      'actual',
      'firstPaid',
      'firstPaidAt',
      'secondPaid',
      'secondPaidAt',
      'thirdPaid',
      'thirdPaidAt',
      'supportingFee',
      'description',
      'vendor',
    ];
    const data = filteredCostsForTotals.map((c) => {
      const p = projects.find(
        (proj) =>
          (c.projectId && proj.id && String(c.projectId) === String(proj.id)) ||
          (String(proj.code).trim().toLowerCase() ===
            String(c.projectCode).trim().toLowerCase() &&
            (String(proj.year || '') === String(c.projectYear || '') ||
              (!proj.year && !c.projectYear)) &&
            (!proj.store ||
              !c.projectStore ||
              String(proj.store).trim().toLowerCase() ===
                String(c.projectStore).trim().toLowerCase()))
      );
      return [
        c.projectStore || p?.store || '',
        p?.location || '',
        c.projectYear || p?.year || '',
        c.projectCode,
        p?.budget || 0,
        c.actual || 0,
        c.firstPaid || 0,
        c.firstPaidAt || '',
        c.secondPaid || 0,
        c.secondPaidAt || '',
        c.thirdPaid || 0,
        c.thirdPaidAt || '',
        c.supportingFee || 0,
        c.description || '',
        c.vendor || '',
      ];
    });
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_costs_filtered.csv');
  };

  const handleImportCosts = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) {
          useAppStore.getState().setToast({
            title: 'Notice',
            message: 'CSV file is empty or has no data rows.',
          });
          return;
        }

        const headers = rows[0].map((h) => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Required Field Validation
        let hasError = false;
        let errorMsg = '';
        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          if (row.every((c) => !String(c).trim())) continue;

          let hasYear = false,
            hasStore = false,
            hasCode = false;
          headers.forEach((h, i) => {
            const val = String(row[i] || '').trim();
            if ((h === 'year' || h === 'projectyear') && val) hasYear = true;
            if ((h === 'store' || h === 'projectstore') && val) hasStore = true;
            if ((h === 'code' || h === 'projectcode') && val) hasCode = true;
          });

          if (!hasYear || !hasStore || !hasCode) {
            hasError = true;
            errorMsg = `Row ${idx + 2} is missing Year, Store, or Code. All imported data must include these three fields.`;
            break;
          }
        }

        if (hasError) {
          useAppStore.getState().setToast({
            title: 'Notice',
            message: 'Import failed: ' + errorMsg,
          });
          return;
        }

        const parseCSVNumber = (val: any) => {
          if (typeof val === 'string') {
            const cleaned = val.replace(/,/g, '').trim();
            if (cleaned === '-' || cleaned === '') return 0;
            const num = Number(cleaned);
            return isNaN(num) ? 0 : num;
          }
          return Number(val) || 0;
        };

        let importCount = 0;
        const processedCosts = new Map<string, Cost>();
        const costsById = new Map<string, Cost>();
        const currentStoreCosts =
          useAppStore.getState().costs.length > 0
            ? useAppStore.getState().costs
            : costs;

        currentStoreCosts.forEach((c) => {
          if (c.id) costsById.set(c.id, c);
          if (c.projectCode) {
            const key = `${String(c.projectCode).trim().toLowerCase()}_${String(
              c.projectYear || ''
            ).trim().toLowerCase()}_${String(
              c.projectStore || ''
            ).trim().toLowerCase()}_${String(
              c.description || ''
            ).trim().toLowerCase()}_${String(
              c.vendor || ''
            ).trim().toLowerCase()}`;
            processedCosts.set(key, c);
            if (c.id) {
              processedCosts.set(c.id, c);
            }
          }
        });

        const previousStates = new Map<string, any>();
        const newIds = new Set<string>();
        const previousProjectBudgets = new Map<string, number | undefined>();
        const updatedProjectBudgets = new Map<string, { budget: number; project: Project }>();
        const writeOps: MassWriteOp[] = [];
        const deltaItems: TakaDeltaItem[] = [];
        const touchedCostsMap = new Map<string, Cost>();
        const nowIso = new Date().toISOString();

        for (const row of dataRows) {
          if (row.every((c) => !String(c).trim())) continue;
          if (row.length < headers.length) continue;

          const c: any = {};
          headers.forEach((h, i) => {
            let val: any = row[i];
            if (
              h === 'budget' ||
              h === 'actual' ||
              h === 'firstpaid' ||
              h === 'secondpaid' ||
              h === 'thirdpaid' ||
              h === 'supportingfee'
            ) {
              val = parseCSVNumber(val);
            }
            const keyMap: Record<string, string> = {
              projectcode: 'projectCode',
              code: 'projectCode',
              projectyear: 'projectYear',
              year: 'projectYear',
              projectstore: 'projectStore',
              store: 'projectStore',
              firstpaid: 'firstPaid',
              firstpaidat: 'firstPaidAt',
              secondpaid: 'secondPaid',
              secondpaidat: 'secondPaidAt',
              thirdpaid: 'thirdPaid',
              thirdpaidat: 'thirdPaidAt',
              supportingfee: 'supportingFee',
            };
            const field = keyMap[h] || h;
            c[field] = val;
          });

          if (!c.projectCode || !c.description) continue;

          if (c.projectYear !== undefined && c.projectYear !== null && !isNaN(Number(c.projectYear))) {
            c.projectYear = Number(c.projectYear);
          }

          // Match project strictly with composite key (Code + Year + Store)
          const matchedProject = projects.find(
            (p) =>
              String(p.code).trim().toLowerCase() ===
                String(c.projectCode).trim().toLowerCase() &&
              (String(p.year || '').trim() === String(c.projectYear || '').trim() ||
                (!p.year && !c.projectYear)) &&
              (!p.store ||
                !c.projectStore ||
                String(p.store).trim().toLowerCase() ===
                  String(c.projectStore).trim().toLowerCase())
          );

          if (matchedProject) {
            c.projectId = String(matchedProject.id || matchedProject.no);
            if (!c.projectStore && matchedProject.store) {
              c.projectStore = matchedProject.store;
            }
          }

          const compositeKey = `${String(c.projectCode).trim().toLowerCase()}_${String(
            c.projectYear || ''
          ).trim().toLowerCase()}_${String(
            c.projectStore || ''
          ).trim().toLowerCase()}_${String(
            c.description || ''
          ).trim().toLowerCase()}_${String(
            c.vendor || ''
          ).trim().toLowerCase()}`;

          let existingCost: Cost | undefined;
          if (c.id && processedCosts.has(c.id)) {
            existingCost = processedCosts.get(c.id);
          } else {
            existingCost = processedCosts.get(compositeKey);
          }

          const docId = existingCost?.id || c.id || doc(db, 'dummy').id;
          const isExistingOnServer = Boolean(existingCost && !newIds.has(docId));
          const mergedCost: Cost = existingCost
            ? { ...existingCost, ...c, id: docId, updatedAt: nowIso }
            : { ...c, id: docId, updatedAt: nowIso };

          if (existingCost && !previousStates.has(docId) && !newIds.has(docId)) {
            previousStates.set(docId, existingCost);
          } else if (!existingCost) {
            newIds.add(docId);
          }

          processedCosts.set(compositeKey, mergedCost);
          processedCosts.set(docId, mergedCost);
          costsById.set(docId, mergedCost);
          touchedCostsMap.set(docId, mergedCost);

          writeOps.push({
            collectionName: 'taka_costs',
            docId,
            action: 'set',
            data: mergedCost,
            merge: true,
          });

          deltaItems.push({
            docId,
            collectionName: 'taka_costs',
            action: isExistingOnServer ? 'update' : 'create',
            isPatch: false,
            data: mergedCost,
            year: mergedCost.projectYear ? String(mergedCost.projectYear) : undefined,
            projectId: mergedCost.projectId ? String(mergedCost.projectId) : undefined,
            projectCode: mergedCost.projectCode ? String(mergedCost.projectCode) : undefined,
            projectStore: mergedCost.projectStore ? String(mergedCost.projectStore) : undefined,
          });

          if (c.budget !== undefined && matchedProject) {
            const projectNo = String(matchedProject.id || matchedProject.no);
            if (!previousProjectBudgets.has(projectNo)) {
              previousProjectBudgets.set(projectNo, matchedProject.budget);
            }
            updatedProjectBudgets.set(projectNo, {
              budget: Number(c.budget) || 0,
              project: matchedProject,
            });
          }

          importCount++;
        }

        // Append coalesced project budget updates
        updatedProjectBudgets.forEach(({ budget, project }, projectNo) => {
          const budgetPayload = { budget, updatedAt: nowIso };
          writeOps.push({
            collectionName: 'taka_projects',
            docId: projectNo,
            action: 'update',
            data: budgetPayload,
          });
          deltaItems.push({
            docId: projectNo,
            collectionName: 'taka_projects',
            action: 'update',
            isPatch: true,
            data: budgetPayload,
            year: project.year ? String(project.year) : undefined,
            projectId: projectNo,
            projectCode: project.code ? String(project.code) : undefined,
            projectStore: project.store ? String(project.store) : undefined,
          });
        });

        if (importCount > 0) {
          // 1. Optimistic UI + LocalDB (Dexie) update (0ms)
          const store = useAppStore.getState();
          store.setCosts(Array.from(costsById.values()));

          const touchedCostsList = Array.from(touchedCostsMap.values());
          const touchedProjectsList: Project[] = [];
          if (updatedProjectBudgets.size > 0) {
            const nextProjects = store.projects.map((p) => {
              const pId = String(p.id || p.no);
              const budgetUpdate = updatedProjectBudgets.get(pId);
              if (!budgetUpdate) return p;
              const nextP = { ...p, budget: budgetUpdate.budget, updatedAt: nowIso };
              touchedProjectsList.push(nextP);
              return nextP;
            });
            store.setProjects(nextProjects);
          }

          try {
            const { bulkPersistCosts, bulkPersistProjects } = await import('../../lib/localDb');
            await bulkPersistCosts(touchedCostsList).catch(() => {});
            if (touchedProjectsList.length > 0) {
              await bulkPersistProjects(touchedProjectsList).catch(() => {});
            }
          } catch {
            // fallback
          }

          // 2. Resilient Mass Batch Commit to Firestore + Batch Deltas
          await executeMassBatchOperations(writeOps, { suppressAutoDelta: true });
          await recordBatchDeltas(deltaItems);

          undoManager.push({
            description: `Import Costs (${importCount} entries)`,
            revert: async () => {
              const revertOps: MassWriteOp[] = [];
              newIds.forEach((id) => {
                revertOps.push({
                  collectionName: 'taka_costs',
                  docId: id,
                  action: 'delete',
                });
              });
              previousStates.forEach((oldData, id) => {
                revertOps.push({
                  collectionName: 'taka_costs',
                  docId: id,
                  action: 'set',
                  data: oldData,
                  merge: false,
                });
              });
              previousProjectBudgets.forEach((oldBudget, projectNo) => {
                revertOps.push({
                  collectionName: 'taka_projects',
                  docId: projectNo,
                  action: 'update',
                  data: { budget: oldBudget || 0, updatedAt: new Date().toISOString() },
                });
              });
              await executeMassBatchOperations(revertOps).catch((e) =>
                console.error('Batch commit undo failed', e)
              );
            },
          });
        }

        useAppStore.getState().setToast({
          title: 'Notice',
          message: `Import Costs completed! Processed ${importCount} records.`,
        });
      } catch (err) {
        console.error('Import error:', err);
        useAppStore.getState().setToast({
          title: 'Error',
          message:
            'Error importing CSV: ' +
            (err instanceof Error ? err.message : String(err)),
        });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportCosts,
    handleImportCosts,
  };
}

