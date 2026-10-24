import React from 'react';
import { Project, TakaDeltaItem } from '../../types';
import { BudgetTreeNode } from './budgetTypes';
import { downloadCSV, parseCSV, generateCSV } from '../../lib/csvUtils';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { undoManager } from '../../lib/undoManager';
import { useAppStore } from '../../store/useAppStore';

interface UseBudgetCsvOpsParams {
  projects: Project[];
  filteredRoots: BudgetTreeNode[];
}

export function useBudgetCsvOps({ projects, filteredRoots }: UseBudgetCsvOpsParams) {
  const handleExportBudget = () => {
    const headers = ['store', 'location', 'year', 'code', 'name', 'budget'];
    const data = filteredRoots.map(node => [
      node.store || '',
      node.location || '',
      node.year || '',
      node.code || '',
      node.name || '',
      node.budget || 0
    ]);
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_budget_filtered.csv');
  };

  const handleImportBudget = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error('CSV is empty or invalid.');
        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const writeOps: MassWriteOp[] = [];
        const deltaItems: TakaDeltaItem[] = [];
        const previousBudgets = new Map<string, number | undefined>();
        const updatedBudgetByProjId = new Map<string, number>();
        const nowIso = new Date().toISOString();
        let importCount = 0;

        for (const row of dataRows) {
          if (row.every(cell => !cell.trim())) continue;
          const p: any = {};
          headers.forEach((h, i) => {
            let key = h;
            if (h === 'project code' || h === 'code' || h === 'projectcode') key = 'code';
            if (h === 'project name' || h === 'name' || h === 'projectname') key = 'name';
            if (h === 'projectyear') key = 'year';
            if (h === 'projectstore') key = 'store';
            
            if (['code', 'name', 'year', 'store', 'location', 'budget'].includes(key)) {
              let val: any = row[i];
              if (key === 'year' || key === 'budget') {
                const cleaned = typeof val === 'string' ? val.replace(/,/g, '').trim() : val;
                val = isNaN(Number(cleaned)) ? val : Number(cleaned);
              }
              p[key] = val;
            }
          });
          if (!p.code) continue;
          
          const match = projects.find(proj => 
            String(proj.code).trim().toLowerCase() === String(p.code).trim().toLowerCase() && 
            String(proj.year || '').trim() === String(p.year || '').trim() && 
            String(proj.store || '').trim().toLowerCase() === String(p.store || '').trim().toLowerCase()
          );
          
          if (match && p.budget !== undefined) {
            const projDocId = String(match.id || match.no);
            if (!previousBudgets.has(projDocId)) {
              previousBudgets.set(projDocId, match.budget);
            }
            updatedBudgetByProjId.set(projDocId, Number(p.budget) || 0);

            const updatePayload = {
              budget: Number(p.budget) || 0,
              updatedAt: nowIso,
            };

            writeOps.push({
              collectionName: 'taka_projects',
              docId: projDocId,
              action: 'update',
              data: updatePayload,
            });

            deltaItems.push({
              docId: projDocId,
              collectionName: 'taka_projects',
              action: 'update',
              isPatch: true,
              data: updatePayload,
              year: match.year ? String(match.year) : undefined,
              projectId: projDocId,
              projectCode: match.code ? String(match.code) : undefined,
              projectStore: match.store ? String(match.store) : undefined,
            });

            importCount++;
          }
        }
        
        if (importCount > 0) {
          // 1. Optimistic UI + LocalDB (Dexie) update (0ms)
          const storeProjects = useAppStore.getState().projects;
          const touchedProjects: Project[] = [];
          const nextProjects = storeProjects.map((proj) => {
            const pid = String(proj.id || proj.no);
            if (!updatedBudgetByProjId.has(pid)) return proj;
            const nextProj = { ...proj, budget: updatedBudgetByProjId.get(pid), updatedAt: nowIso };
            touchedProjects.push(nextProj);
            return nextProj;
          });
          useAppStore.getState().setProjects(nextProjects);

          if (touchedProjects.length > 0) {
            import('../../lib/localDb')
              .then(({ bulkPersistProjects }) => bulkPersistProjects(touchedProjects))
              .catch(() => {});
          }

          // 2. Resilient Mass Batch Commit to Firestore + Batch Deltas
          try {
            await executeMassBatchOperations(writeOps, { suppressAutoDelta: true });
            await recordBatchDeltas(deltaItems);

            undoManager.push({
              description: `Import Budget (${importCount} projects)`,
              revert: async () => {
                const revertOps: MassWriteOp[] = [];
                previousBudgets.forEach((oldBudget, projDocId) => {
                  revertOps.push({
                    collectionName: 'taka_projects',
                    docId: projDocId,
                    action: 'update',
                    data: { budget: oldBudget || 0, updatedAt: new Date().toISOString() },
                  });
                });
                await executeMassBatchOperations(revertOps);
              },
            });

            useAppStore.getState().setToast({ 
              title: "Notice", 
              message: `Successfully updated budget for ${importCount} projects.` 
            });
          } catch (error: any) {
            console.error("Batch commit failed", error);
            useAppStore.getState().setToast({ 
              title: "Save Failed", 
              message: "Network error or permission denied. Data was queued for sync.", 
              type: "error" 
            });
          }
        } else {
          useAppStore.getState().setToast({ 
            title: "Notice", 
            message: 'No matching projects found to update budget.' 
          });
        }
      } catch (err) {
        console.error(err);
        useAppStore.getState().setToast({ 
          title: "Notice", 
          message: 'Error importing CSV: ' + (err instanceof Error ? err.message : String(err)) 
        });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportBudget,
    handleImportBudget
  };
}

