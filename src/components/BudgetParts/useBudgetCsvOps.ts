import React from 'react';
import { Project } from '../../types';
import { BudgetTreeNode } from './budgetTypes';
import { downloadCSV, parseCSV, generateCSV } from '../../lib/csvUtils';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
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
        const batch = writeBatch(db);
        let importCount = 0;

        for (const row of dataRows) {
          if (row.every(cell => !cell.trim())) continue;
          const p: any = {};
          headers.forEach((h, i) => {
            let key = h;
            if (h === 'project code' || h === 'code') key = 'code';
            if (h === 'project name' || h === 'name') key = 'name';
            
            if (['code', 'name', 'year', 'store', 'location', 'budget'].includes(key)) {
              let val: any = row[i];
              if (key === 'year' || key === 'budget') val = isNaN(Number(val)) ? val : Number(val);
              p[key] = val;
            }
          });
          if (!p.code) continue;
          
          const match = projects.find(proj => 
            String(proj.code).trim().toLowerCase() === String(p.code).trim().toLowerCase() && 
            String(proj.year || '') === String(p.year || '') && 
            String(proj.store || '') === String(p.store || '')
          );
          
          if (match && p.budget !== undefined) {
            batch.update(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', match.id), { 
              budget: p.budget, 
              updatedAt: new Date().toISOString() 
            });
            importCount++;
          }
        }
        
        if (importCount > 0) {
          try {
            await batch.commit();
            useAppStore.getState().setToast({ 
              title: "Thông báo", 
              message: `Successfully updated budget for ${importCount} projects.` 
            });
          } catch (error: any) {
            console.error("Batch commit failed", error);
            useAppStore.getState().setToast({ 
              title: "Save Failed", 
              message: "Network error or permission denied. Data was not saved.", 
              type: "error" 
            });
          }
        } else {
          useAppStore.getState().setToast({ 
            title: "Thông báo", 
            message: 'No matching projects found to update budget.' 
          });
        }
      } catch (err) {
        console.error(err);
        useAppStore.getState().setToast({ 
          title: "Thông báo", 
          message: 'Error importing CSV: ' + (err instanceof Error ? err.message : String(err)) 
        });
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportBudget,
    handleImportBudget
  };
}
