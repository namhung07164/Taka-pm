import React, { useCallback } from 'react';
import { Project, Task, AppUser } from '../types';
import { useAppStore } from '../store/useAppStore';
import { db, APP_ID, writeBatch, setDoc } from '../lib/firebase';
import { doc } from 'firebase/firestore';
import { downloadCSV, parseCSV, generateCSV } from '../lib/csvUtils';
import { formatDisplayDateMain, formatToDatetimeLocal, generateId } from '../lib/utils';
import { undoManager } from '../lib/undoManager';
import { saveTaskStateUnified, findAffectedProjects, syncAffectedProjects } from '../lib/taskStateService';

interface UseDetailCsvHandlersParams {
  filteredProjects: Project[];
  projects: Project[];
  tasks: Task[];
  locations: string[];
  currentUser: AppUser;
}

export function useDetailCsvHandlers({
  filteredProjects,
  projects,
  tasks,
  locations,
  currentUser,
}: UseDetailCsvHandlersParams) {

  const handleExportProjects = useCallback(() => {
    const headers = ['store', 'location', 'year', 'code', 'name'];
    const data = filteredProjects.map(p => [
      p.store || '', p.location || '', p.year || '', p.code || '', p.name || ''
    ]);
    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_projects_filtered.csv');
  }, [filteredProjects]);

  const handleImportProjects = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        
        if (rows.length < 2) {
          useAppStore.getState().setToast({ title: "Thông báo", message: 'CSV file is empty or has no data rows.' });
          return;
        }

        const headers = rows[0].map(h => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        // Required Field Validation
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
            useAppStore.getState().setToast({ 
              title: "Lỗi dữ liệu", 
              message: `Dòng ${idx + 2} thiếu thông tin bắt buộc: ${[!hasYear && 'Year', !hasStore && 'Store', !hasCode && 'Code'].filter(Boolean).join(', ')}. Không thể import!`, 
              type: "error" 
            });
            return;
          }
        }

        // Location Validation
        const validLocationsLower = locations.map(l => l.toLowerCase());
        const invalidLocations = new Set<string>();

        dataRows.forEach(row => {
          if (row.every(c => !String(c).trim())) return;
          headers.forEach((h, i) => {
            if (h === 'location') {
              const val = String(row[i] || '').trim();
              if (val && !validLocationsLower.includes(val.toLowerCase())) {
                invalidLocations.add(val);
              }
            }
          });
        });

        if (invalidLocations.size > 0) {
          useAppStore.getState().setToast({
            title: "Lỗi Location",
            message: `Các Location sau không tồn tại trong danh mục hệ thống: ${Array.from(invalidLocations).join(', ')}. Vui lòng kiểm tra lại file CSV.`,
            type: "error"
          });
          return;
        }

        const previousStates = new Map<string, any>();
        const newIds: string[] = [];
        const projectsToUpdate: Project[] = [];

        dataRows.forEach(row => {
          if (row.every(c => !String(c).trim())) return;
          const p: any = {};
          headers.forEach((h, i) => {
            let val = row[i];
            if (h === 'year') {
              p.year = Number(val) || val;
            } else if (h === 'no') {
              p.no = Number(val) || val;
            } else if (h === 'code' || h === 'projectcode') {
              p.code = String(val || '').trim();
            } else if (h === 'store' || h === 'projectstore') {
              p.store = String(val || '').trim().toUpperCase();
            } else {
              p[h] = val;
            }
          });

          const existing = projects.find(ep => 
            ep.code && p.code && 
            ep.code.trim().toLowerCase() === p.code.trim().toLowerCase() &&
            (String(ep.year || '') === String(p.year || '') || (!ep.year && !p.year)) &&
            (String(ep.store || '').toLowerCase() === String(p.store || '').toLowerCase() || (!ep.store && !p.store))
          );

          let id = existing ? existing.id : generateId();
          if (!id) id = generateId();

          if (existing) {
            previousStates.set(id, { ...existing });
          } else {
            newIds.push(id);
          }

          projectsToUpdate.push({
            ...(existing || {}),
            ...p,
            id,
            updatedAt: new Date().toISOString()
          });
        });

        const batch = writeBatch(db);
        projectsToUpdate.forEach(p => {
          const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', p.id);
          batch.set(docRef, p, { merge: true });
        });

        await batch.commit();

        // Optimistically update Zustand store
        const currentProjects = useAppStore.getState().projects || [];
        const projectMap = new Map<string, Project>();
        currentProjects.forEach(p => projectMap.set(p.id, p));
        projectsToUpdate.forEach(p => projectMap.set(p.id, p));
        useAppStore.getState().setProjects(Array.from(projectMap.values()));

        if (projectsToUpdate.length > 0) {
          undoManager.push({
            description: 'Import Projects',
            revert: async () => {
              const revertBatch = writeBatch(db);
              previousStates.forEach((oldData, id) => {
                revertBatch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id), oldData);
              });
              newIds.forEach(id => {
                revertBatch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_projects', id));
              });
              await revertBatch.commit();
            }
          });
        }

        useAppStore.getState().setToast({ title: "Thông báo", message: `Import Projects completed! Processed ${projectsToUpdate.length} projects.` });
      } catch (err: any) {
        console.error("Import error:", err);
        useAppStore.getState().setToast({ title: "Lỗi", message: "Không thể nhập file: " + (err?.message || "Lỗi xử lý file"), type: "error" });
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }, [locations, projects]);

  const handleExportTasks = useCallback(() => {
    const headers = [
      'store', 'location', 'projectYear', 'projectCode', 'Task code phụ', 'Task name', 'start', 'finish', 'duration', 'predecessor', 'flexible', 'baselineStart', 'baselineFinish', 'party', 'delegation', 'comments'
    ];
    
    const targetCodes = new Set(filteredProjects.map(p => (p.code || '').trim().toLowerCase()));
    const visibleTasks = tasks.filter(t => targetCodes.has((t.projectCode || '').trim().toLowerCase()));

    const data = visibleTasks.map(t => [
      t.projectStore || '',
      t.location || '',
      t.projectYear || '',
      t.projectCode || '',
      t.taskCodePhu || '',
      t.name || '',
      formatDisplayDateMain(t.start),
      formatDisplayDateMain(t.finish),
      t.duration || '',
      t.predecessor || '',
      ((t as any).flexible || (t as any).isFlexible) ? 'x' : '',
      formatDisplayDateMain(t.baselineStart),
      formatDisplayDateMain(t.baselineFinish),
      t.party || '',
      t.delegation ? 'x' : '',
      Array.isArray(t.comments) ? t.comments.map(c => c.text).join('; ') : (t.comments || '')
    ]);

    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_tasks_filtered.csv');
  }, [filteredProjects, tasks]);

  const handleImportTasks = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) {
        useAppStore.getState().setToast({ title: "Thông báo", message: 'CSV file is empty or has no data rows.' });
        return;
      }

      const headers = rows[0].map(h => h.trim().toLowerCase());
      const dataRows = rows.slice(1);

      // Required Field Validation
      for (let idx = 0; idx < dataRows.length; idx++) {
        const row = dataRows[idx];
        if (row.every(c => !String(c).trim())) continue;
        
        let hasYear = false, hasStore = false, hasCode = false, hasName = false;
        headers.forEach((h, i) => {
          const val = String(row[i] || '').trim();
          if ((h === 'projectyear' || h === 'year') && val) hasYear = true;
          if ((h === 'projectstore' || h === 'store') && val) hasStore = true;
          if ((h === 'projectcode' || h === 'code') && val) hasCode = true;
          if ((h === 'task name' || h === 'name' || h === 'taskname') && val) hasName = true;
        });

        if (!hasYear || !hasStore || !hasCode || !hasName) {
          useAppStore.getState().setToast({ 
            title: "Lỗi dữ liệu", 
            message: `Dòng ${idx + 2} thiếu thông tin bắt buộc: ${[!hasYear && 'Year', !hasStore && 'Store', !hasCode && 'Code', !hasName && 'Task Name'].filter(Boolean).join(', ')}. Không thể import!`, 
            type: "error" 
          });
          return;
        }
      }

      // Location Validation
      const validLocationsLower = locations.map(l => l.toLowerCase());
      const invalidLocations = new Set<string>();

      dataRows.forEach(row => {
        if (row.every(c => !String(c).trim())) return;
        headers.forEach((h, i) => {
          if (h === 'location') {
            const val = String(row[i] || '').trim();
            if (val && !validLocationsLower.includes(val.toLowerCase())) {
              invalidLocations.add(val);
            }
          }
        });
      });

      if (invalidLocations.size > 0) {
        useAppStore.getState().setToast({
          title: "Lỗi Location",
          message: `Các Location sau không tồn tại trong danh mục hệ thống: ${Array.from(invalidLocations).join(', ')}. Vui lòng kiểm tra lại file CSV.`,
          type: "error"
        });
        return;
      }

      const previousStates = new Map<string, any>();
      const newIds: string[] = [];
      const tasksToImport: Task[] = [];
      let importCount = 0;

      const defaultToday = formatToDatetimeLocal(new Date());

      for (const row of dataRows) {
        if (row.every(c => !String(c).trim())) continue;
        const t: any = {};
        let commentsText = '';

        headers.forEach((h, i) => {
          let val = row[i];
          if (h === 'projectyear' || h === 'year') {
            t.projectYear = Number(val) || val;
          } else if (h === 'projectstore' || h === 'store') {
            t.projectStore = String(val || '').trim().toUpperCase();
          } else if (h === 'projectcode' || h === 'code') {
            t.projectCode = String(val || '').trim();
          } else if (h === 'task code phụ' || h === 'taskcodephu') {
            t.taskCodePhu = String(val || '').trim();
          } else if (h === 'task name' || h === 'name' || h === 'taskname') {
            t.name = String(val || '').trim();
          } else if (h === 'start') {
            t.start = val ? formatToDatetimeLocal(new Date(val)) : '';
          } else if (h === 'finish') {
            t.finish = val ? formatToDatetimeLocal(new Date(val)) : '';
          } else if (h === 'baselinestart') {
            t.baselineStart = val ? formatToDatetimeLocal(new Date(val)) : '';
          } else if (h === 'baselinefinish') {
            t.baselineFinish = val ? formatToDatetimeLocal(new Date(val)) : '';
          } else if (h === 'duration') {
            t.duration = val ? String(val).trim() : '0';
          } else if (h === 'predecessor') {
            t.predecessor = val ? String(val).trim() : '';
          } else if (h === 'flexible') {
            t.flexible = String(val || '').toLowerCase().trim() === 'x' || String(val || '').toLowerCase().trim() === 'true';
          } else if (h === 'party') {
            t.party = val ? String(val).trim() : '';
          } else if (h === 'delegation') {
            t.delegation = String(val || '').toLowerCase().trim() === 'x' || String(val || '').toLowerCase().trim() === 'true';
          } else if (h === 'comments') {
            commentsText = val ? String(val).trim() : '';
          }
        });

        const existing = tasks.find(et => 
          et.projectCode && t.projectCode &&
          et.projectCode.trim().toLowerCase() === t.projectCode.trim().toLowerCase() &&
          et.name && t.name &&
          et.name.trim().toLowerCase() === t.name.trim().toLowerCase()
        );

        let id = existing ? existing.id : generateId();
        if (!id) id = generateId();

        if (existing) {
          previousStates.set(id, { ...existing });
        } else {
          newIds.push(id);
        }

        const taskOrderIndex = existing?.orderIndex !== undefined ? existing.orderIndex : importCount;
        const taskCodePhu = t.taskCodePhu || (t.projectCode ? `${t.projectCode}#${taskOrderIndex + 1}` : '');

        let updatedComments = existing?.comments || [];
        if (commentsText) {
          updatedComments = [
            ...updatedComments,
            {
              id: generateId(),
              text: commentsText,
              createdAt: new Date().toISOString(),
              userId: currentUser.id,
              userName: currentUser.name || currentUser.username || 'System'
            }
          ];
        }

        if (!existing) {
          if (!t.start) t.start = defaultToday;
          if (!t.finish) t.finish = t.start || defaultToday;
          if (!t.baselineStart) t.baselineStart = t.start || defaultToday;
          if (!t.baselineFinish) t.baselineFinish = t.finish || defaultToday;
          if (t.duration === undefined || t.duration === null || String(t.duration).trim() === '') {
            t.duration = "0";
          }
        }

        const finalTask: Task = existing 
          ? { ...existing, ...t, comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu, durationManual: true, finishManual: false, startManual: false, updatedAt: new Date().toISOString() } 
          : { ...t, id, comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu, durationManual: true, finishManual: false, startManual: false, updatedAt: new Date().toISOString() };
        
        if (finalTask.start && finalTask.duration !== undefined && finalTask.duration !== '') {
          const s = new Date(finalTask.start);
          const days = parseFloat(String(finalTask.duration));
          if (!isNaN(s.getTime()) && !isNaN(days)) {
            const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
            finalTask.finish = formatToDatetimeLocal(f);
            finalTask.durationManual = true;
          }
        }

        tasksToImport.push(finalTask);

        // Auto Provision Delegation Group if task.delegation is true
        if (finalTask.delegation) {
          const deterministicGroupId = `group-${finalTask.id}`;
          const now = new Date().toISOString();
          const parsedParty = finalTask.party ? String(finalTask.party).trim() : 'Unassigned';
          const activeUserId = currentUser.id || 'system';
          const dateStr = finalTask.start ? finalTask.start.substring(0, 10) : new Date().toISOString().substring(0, 10);
          
          const newGroup: any = {
            id: deterministicGroupId,
            name: `${finalTask.projectCode || ''} - ${finalTask.name || ''}`,
            parentTaskId: finalTask.id,
            projectCode: finalTask.projectCode,
            projectStore: finalTask.projectStore,
            projectYear: (finalTask.projectYear !== undefined && finalTask.projectYear !== null && !isNaN(Number(finalTask.projectYear))) ? Number(finalTask.projectYear) : (Number(projects.find(p => p.code === finalTask.projectCode)?.year) || new Date().getFullYear()),
            subTasks: [{ 
              id: generateId(), 
              name: '', 
              comments: '', 
              status: 'Assigned', 
              delegationStatus: 'Assigned', 
              priority: 'Mid', 
              party: parsedParty, 
              startAct: dateStr, 
              finishAct: dateStr, 
              updatedAt: now 
            }],
            updatedAt: now,
            createdBy: activeUserId
          };
          setDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_delegation_groups', deterministicGroupId), newGroup, { merge: true });
        }
        importCount++;
      }
      
      await saveTaskStateUnified(tasksToImport);
      const affectedProjects = findAffectedProjects(tasksToImport);
      const allCurrentTasks = useAppStore.getState().tasks;
      await syncAffectedProjects(affectedProjects, allCurrentTasks);
      
      if (importCount > 0) {
        undoManager.push({
          description: 'Import Tasks',
          revert: async () => {
            const batch = writeBatch(db);
            previousStates.forEach((oldData, id) => {
              batch.set(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id), oldData);
            });
            newIds.forEach(id => {
              batch.delete(doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_tasks', id));
            });
            try {
              await batch.commit();
            } catch (error: any) {
              console.error("Batch commit failed", error);
              useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
            }
          }
        });
      }
      
      useAppStore.getState().setToast({ title: "Thông báo", message: `Import Tasks completed! Processed ${tasksToImport.length} tasks.` });
    } catch (err: any) {
      console.error("Import error:", err);
      useAppStore.getState().setToast({ title: "Lỗi", message: "Không thể nhập file: " + (err?.message || "Lỗi xử lý file"), type: "error" });
    } finally {
      e.target.value = '';
    }
  }, [locations, tasks, projects, currentUser]);

  return {
    handleExportProjects,
    handleImportProjects,
    handleExportTasks,
    handleImportTasks,
  };
}
