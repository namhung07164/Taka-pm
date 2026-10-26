import React, { useState } from 'react';
import { Project, TakaDeltaItem } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { downloadCSV, parseCSV, generateCSV } from '../../lib/csvUtils';
import { undoManager } from '../../lib/undoManager';
import { recordBatchDeltas } from '../../lib/deltaSyncService';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';
import { validateProjectsImportData, generateTaskErrorReportCSV, ImportValidationResult } from './importValidator';
import { ImportErrorModal } from './ImportErrorModal';

interface UseDetailProjectCsvParams {
  filteredProjects: Project[];
  projects: Project[];
}

export function useDetailProjectCsv({ filteredProjects, projects }: UseDetailProjectCsvParams) {
  const [projectImportErrorData, setProjectImportErrorData] = useState<{
    validationResult: ImportValidationResult;
    errorReportCSV: string;
    fileName: string;
  } | null>(null);

  const handleExportProjects = () => {
    const headers = ['store', 'location', 'year', 'code', 'name', 'shopType', 'sizeM2'];
    const data = filteredProjects.map(p => [
      p.store || '',
      p.location || '',
      p.year || '',
      p.code || '',
      p.name || '',
      p.shopType || '',
      p.sizeM2 !== undefined && p.sizeM2 !== null ? p.sizeM2 : ''
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

        // Required Field & Duplicate Validation
        const validation = validateProjectsImportData(headers, dataRows);
        if (!validation.isValid) {
          const errorReportCSV = generateTaskErrorReportCSV(headers, dataRows, validation);
          setProjectImportErrorData({
            validationResult: validation,
            errorReportCSV,
            fileName: `${file.name.replace(/\.[^/.]+$/, '')}_project_errors.csv`
          });
          useAppStore.getState().setToast({
            title: "Import Blocked",
            message: `Found ${validation.errorCount} error(s) in ${validation.errorRowNumbers.size} row(s). Import was blocked.`,
            type: "error"
          });
          return;
        }

        const currentStoreProjects = useAppStore.getState().projects.length > 0
          ? useAppStore.getState().projects
          : projects;

        let maxNo = currentStoreProjects.length > 0 ? Math.max(...currentStoreProjects.map(p => {
          const n = Number(p.no);
          return isNaN(n) ? 0 : n;
        })) : 0;

        const processedProjects = new Map<string, Project>();
        const projectsById = new Map<string, Project>();
        currentStoreProjects.forEach(p => {
          const key = `${String(p.code).trim().toLowerCase()}_${String(p.year || '').trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
          processedProjects.set(key, p);
          if (p.id) projectsById.set(String(p.id), p);
        });

        const previousStates = new Map<string, any>();
        const newIds = new Set<string>();
        const writeOps: MassWriteOp[] = [];
        const deltaItems: TakaDeltaItem[] = [];
        const touchedProjectsMap = new Map<string, Project>();
        const nowIso = new Date().toISOString();
        let importCount = 0;

        for (const row of dataRows) {
          if (row.every(c => !String(c).trim())) continue;
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
              'projectname': 'name',
              'project name': 'name',
              'task name': 'name',
              'shoptype': 'shopType',
              'shop type': 'shopType',
              'shop_type': 'shopType',
              'shop': 'shopType',
              'sizem2': 'sizeM2',
              'size m2': 'sizeM2',
              'size': 'sizeM2',
              'size (m2)': 'sizeM2',
              'area': 'sizeM2',
              'area (m2)': 'sizeM2',
              'm2': 'sizeM2'
            };
            
            const targetField = fieldMap[h];
            if (targetField) {
              let val: any = row[i];
              if (targetField === 'year') {
                val = !isNaN(Number(val)) ? Number(val) : String(val).trim();
              } else if (targetField === 'shopType') {
                val = val !== undefined && val !== null && String(val).trim() !== '' ? String(val).trim() : undefined;
              } else if (targetField === 'sizeM2') {
                const clean = String(val ?? '').replace(/,/g, '').trim();
                const num = Number(clean);
                val = (!isNaN(num) && clean !== '') ? num : undefined;
              }
              p[targetField] = val;
            }
          });
          
          if (p.code && p.year) {
            const key = `${String(p.code).trim().toLowerCase()}_${String(p.year).trim().toLowerCase()}_${String(p.store || '').trim().toLowerCase()}`;
            const existing = processedProjects.get(key);
            let no = existing ? existing.no : null;
            let docId = existing ? (existing.id || String(existing.no)) : null;
            const isExistingOnServer = Boolean(existing && !newIds.has(String(docId)));
            
            if (!no) {
              maxNo++;
              no = maxNo;
              docId = String(no);
              newIds.add(docId);
            } else if (!docId) {
              docId = String(no);
            }
            
            if (docId && !previousStates.has(docId) && existing && !newIds.has(docId)) {
              previousStates.set(docId, existing);
            }
            
            const projDocId = String(docId || no);
            const finalProject: Project = existing
              ? { ...existing, ...p, id: projDocId, no, updatedAt: nowIso }
              : { ...p, id: projDocId, no, updatedAt: nowIso };

            processedProjects.set(key, finalProject);
            projectsById.set(projDocId, finalProject);
            touchedProjectsMap.set(projDocId, finalProject);
            
            // Remove computed fields and undefined values before saving to Firestore
            const toSave: Record<string, any> = { ...finalProject, updatedAt: nowIso };
            if (toSave.year !== undefined && toSave.year !== null && toSave.year !== '' && !isNaN(Number(toSave.year))) {
              toSave.year = Number(toSave.year);
            }
            delete toSave.id;
            delete toSave.computedTakStart;
            delete toSave.computedTakCompl;
            delete toSave.computedOpening;
            delete toSave.taskSummaries;
            delete toSave.taskCount;

            writeOps.push({
              collectionName: 'taka_projects',
              docId: projDocId,
              action: 'set',
              data: toSave,
              merge: true,
            });

            deltaItems.push({
              docId: projDocId,
              collectionName: 'taka_projects',
              action: isExistingOnServer ? 'update' : 'create',
              isPatch: isExistingOnServer,
              data: toSave,
              year: toSave.year ? String(toSave.year) : undefined,
              projectId: projDocId,
              projectCode: toSave.code ? String(toSave.code) : undefined,
              projectStore: toSave.store ? String(toSave.store) : undefined,
            });

            importCount++;
          }
        }

        if (importCount > 0) {
          // 1. Optimistic UI + LocalDB (Dexie) update (0ms)
          const updatedAllProjects = Array.from(projectsById.values());
          useAppStore.getState().setProjects(updatedAllProjects);

          const touchedList = Array.from(touchedProjectsMap.values());
          try {
            const { bulkPersistProjects } = await import('../../lib/localDb');
            await bulkPersistProjects(touchedList).catch(() => {});
          } catch {
            // fallback
          }

          // 2. Resilient Mass Batch Commit to Firestore + Batch Deltas
          await executeMassBatchOperations(writeOps, { suppressAutoDelta: true });
          await recordBatchDeltas(deltaItems);

          undoManager.push({
            description: 'Import Projects',
            revert: async () => {
              const revertOps: MassWriteOp[] = [];
              previousStates.forEach((oldData, id) => {
                const toSave = { ...oldData };
                delete toSave.computedTakStart;
                delete toSave.computedTakCompl;
                delete toSave.computedOpening;
                delete toSave.id;
                revertOps.push({
                  collectionName: 'taka_projects',
                  docId: id,
                  action: 'set',
                  data: toSave,
                  merge: false,
                });
              });
              newIds.forEach(id => {
                revertOps.push({
                  collectionName: 'taka_projects',
                  docId: id,
                  action: 'delete',
                });
              });
              try {
                await executeMassBatchOperations(revertOps);
              } catch (error: any) {
                console.error("Batch commit failed", error);
                useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
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

  const projectImportErrorModal = projectImportErrorData ? React.createElement(ImportErrorModal, {
    isOpen: Boolean(projectImportErrorData),
    onClose: () => setProjectImportErrorData(null),
    validationResult: projectImportErrorData.validationResult,
    errorReportCSV: projectImportErrorData.errorReportCSV,
    fileName: projectImportErrorData.fileName
  }) : null;

  return {
    handleExportProjects,
    handleImportProjects,
    projectImportErrorModal
  };
}
