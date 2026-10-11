import React from 'react';
import { Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { downloadCSV, parseCSV, generateCSV } from '../../lib/csvUtils';
import { doc } from 'firebase/firestore';
import { writeBatch, setDoc } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { recordDelta } from '../../lib/deltaSyncService';

interface UseDetailProjectCsvParams {
  filteredProjects: Project[];
  projects: Project[];
}

export function useDetailProjectCsv({ filteredProjects, projects }: UseDetailProjectCsvParams) {
  const handleExportProjects = () => {
    const headers = ['store', 'location', 'year', 'code', 'name'];
    const data = filteredProjects.map(p => [
      p.store || '', p.location || '', p.year || '', p.code || '', p.name || ''
    ]);
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_projects_filtered.csv');
  };

  const handleImportProjects = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
          useAppStore.getState().setToast({ title: "Notice", message: 'CSV file is empty or has no data rows.' });
          return;
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Required Field Validation
        let hasError = false;
        let errorMsg = '';
        for (let idx = 0; idx < dataRows.length; idx++) {
          const row = dataRows[idx];
          if (row.every(c => !String(c).trim())) continue;
          
          let hasYear = false, hasStore = false, hasCode = false;
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
          useAppStore.getState().setToast({ title: "Notice", message: 'Import failed: ' + errorMsg });
          return;
        }

        let maxNo = projects.length > 0 ? Math.max(...projects.map(p => {
          const n = Number(p.no);
          return isNaN(n) ? 0 : n;
        })) : 0;

        const processedProjects = new Map<string, Project>();
        projects.forEach(p => {
          const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '').trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
          processedProjects.set(key, p);
        });

        const previousStates = new Map<string, any>();
        const newIds = new Set<string>();
        let importCount = 0;

        for (const row of dataRows) {
          if (row.length < headers.length) continue;
          const p: any = {};
          headers.forEach((h, i) => {
            const fieldMap: Record<string, keyof Project> = {
              'store': 'store',
              'projectstore': 'store',
              'location': 'location',
              'year': 'year',
              'projectyear': 'year',
              'code': 'code',
              'projectcode': 'code',
              'name': 'name',
              'task name': 'name'
            };
            
            const targetField = fieldMap[h];
            if (targetField) {
              let val: any = row[i];
              if (targetField === 'year') {
                val = !isNaN(Number(val)) ? Number(val) : String(val).trim();
              }
              p[targetField] = val;
            }
          });
          
          if (p.code && p.year) {
            const key = `${String(p.code).trim().toLowerCase()}_${String(p.year).trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
            const existing = processedProjects.get(key);
            let no = existing ? existing.no : null;
            let docId = existing ? (existing.id || String(existing.no)) : null;
            
            if (!no) {
              maxNo++;
              no = maxNo;
              docId = String(no);
              newIds.add(docId);
            } else if (!docId) {
              docId = String(no);
            }
            
            if (docId && !previousStates.has(docId) && existing) {
              previousStates.set(docId, existing);
            }
            
            const finalProject = existing ? { ...existing, ...p } : { ...p, no };
            
            // Remove computed fields and undefined values before saving to Firestore
            const toSave = { ...finalProject };
            if (toSave.year !== undefined && toSave.year !== null && toSave.year !== '' && !isNaN(Number(toSave.year))) {
              toSave.year = Number(toSave.year);
            }
            delete (toSave as any).id;
            delete (toSave as any).computedTakStart;
            delete (toSave as any).computedTakCompl;
            delete (toSave as any).computedOpening;
            
            Object.keys(toSave).forEach(key => {
              if ((toSave as any)[key] === undefined) {
                delete (toSave as any)[key];
              }
            });

            processedProjects.set(key, finalProject);
            setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', docId!), toSave);
            recordDelta({
              docId: docId!,
              collectionName: 'taka_projects',
              action: existing ? 'update' : 'create',
              data: toSave,
              year: String(toSave.year || '')
            }).catch(console.error);
            importCount++;
          }
        }
        
        if (importCount > 0) {
          undoManager.push({
            description: 'Import Projects',
            revert: async () => {
              const batch = writeBatch(db);
              previousStates.forEach((oldData, id) => {
                const toSave = { ...oldData };
                delete toSave.computedTakStart;
                delete toSave.computedTakCompl;
                delete toSave.computedOpening;
                delete toSave.id;
                batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id), toSave);
              });
              newIds.forEach(id => {
                batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id));
              });
              try {
                batch.commit().catch(e => console.error("Batch commit failed", e));
              } catch (error: any) {
                console.error("Batch commit failed", error);
                useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
                return;
              }
            }
          });
        }
        
        useAppStore.getState().setToast({ title: "Success", message: `Import Projects completed! Processed ${importCount} projects.` });
      } catch (err) {
        console.error('Import error:', err);
        useAppStore.getState().setToast({ title: "Error", message: 'Error importing CSV: ' + (err instanceof Error ? err.message : String(err)) });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return {
    handleExportProjects,
    handleImportProjects,
  };
}
