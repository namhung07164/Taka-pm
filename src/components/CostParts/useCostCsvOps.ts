import React from 'react';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { Cost, Project } from '../../types';
import { generateCSV, downloadCSV, parseCSV } from '../../lib/csvUtils';
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
          String(proj.code).trim().toLowerCase() ===
            String(c.projectCode).trim().toLowerCase() &&
          (String(proj.year || '') === String(c.projectYear || '') ||
            (!proj.year && !c.projectYear))
      );
      return [
        p?.store || '',
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
            title: 'Thông báo',
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
            title: 'Thông báo',
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
        costs.forEach((c) => {
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

        for (const row of dataRows) {
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

          if (c.projectYear !== undefined && c.projectYear !== null) {
            c.projectYear = Number(c.projectYear);
          }

          let existingCost: Cost | undefined;
          if (c.id && processedCosts.has(c.id)) {
            existingCost = processedCosts.get(c.id);
          } else {
            const key = `${String(c.projectCode).trim().toLowerCase()}_${String(
              c.projectYear || ''
            ).trim().toLowerCase()}_${String(
              c.projectStore || ''
            ).trim().toLowerCase()}_${String(
              c.description || ''
            ).trim().toLowerCase()}_${String(
              c.vendor || ''
            ).trim().toLowerCase()}`;
            existingCost = processedCosts.get(key);
          }

          const docId = existingCost?.id || c.id || doc(db, 'dummy').id;
          c.id = docId;
          c.updatedAt = new Date().toISOString();

          if (existingCost) {
            previousStates.set(docId, existingCost);
          } else {
            newIds.add(docId);
          }

          const batch = writeBatch(db);
          batch.set(
            doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', docId),
            c,
            { merge: true }
          );

          if (c.budget !== undefined) {
            const matchedProject = projects.find(
              (p) =>
                String(p.code).trim().toLowerCase() ===
                  String(c.projectCode).trim().toLowerCase() &&
                (String(p.year || '') === String(c.projectYear || '') ||
                  (!p.year && !c.projectYear))
            );
            if (matchedProject) {
              const projectNo = String(matchedProject.no || matchedProject.id);
              if (!previousProjectBudgets.has(projectNo)) {
                previousProjectBudgets.set(projectNo, matchedProject.budget);
              }
              batch.update(
                doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', projectNo),
                { budget: c.budget }
              );
            }
          }

          await batch.commit();
          importCount++;
        }

        if (importCount > 0) {
          undoManager.push({
            description: `Import Costs (${importCount} entries)`,
            revert: async () => {
              const batch = writeBatch(db);
              newIds.forEach((id) => {
                batch.delete(
                  doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', id)
                );
              });
              previousStates.forEach((oldData, id) => {
                batch.set(
                  doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_costs', id),
                  oldData
                );
              });
              previousProjectBudgets.forEach((oldBudget, projectNo) => {
                batch.update(
                  doc(
                    db,
                    'artifacts',
                    APP_ID,
                    'public',
                    'data',
                    'taka_projects',
                    projectNo
                  ),
                  { budget: oldBudget || 0 }
                );
              });
              await batch.commit().catch((e) =>
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
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportCosts,
    handleImportCosts,
  };
}
