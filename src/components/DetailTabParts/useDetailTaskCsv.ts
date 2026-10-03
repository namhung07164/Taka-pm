import React from 'react';
import { Project, Task, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { downloadCSV, parseCSV, generateCSV } from '../../lib/csvUtils';
import { doc, writeBatch } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { sortGroupTasks } from '../../lib/ganttUtils';
import { formatToDatetimeLocal, getDefaultDatetimeLocal } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates, syncProjectDatesToFirestore } from '../../lib/projectDatesService';
import { 
  calculateDatesFromPredecessorsAndDuration, 
  rollupParentTaskDates, 
  cleanDurationString,
  batchSaveTasksToFirestore
} from '../../lib/taskImportService';
import { findAffectedProjects } from '../../lib/taskStateService';
import { formatToCSVDate, parseCSVDate } from './detailCsvUtils';

interface UseDetailTaskCsvParams {
  filteredProjects: Project[];
  projects: Project[];
  tasks: Task[];
  appUsers: AppUser[];
  currentUser: AppUser;
}

export function useDetailTaskCsv({
  filteredProjects,
  projects,
  tasks,
  appUsers,
  currentUser,
}: UseDetailTaskCsvParams) {
  const handleExportTasks = () => {
    const headers = [
      'store',
      'location',
      'projectYear',
      'projectCode',
      'Sub-task code',
      'Task name',
      'Parent task code',
      'start',
      'finish',
      'duration',
      'party',
      'predecessor',
      'delegation',
      'task flexible',
      'comments'
    ];
    
    // Flatten filtered belonging to filtered
    const filteredTasksToExport: Task[] = [];
    filteredProjects.forEach(p => {
      const groupTasks = sortGroupTasks(tasks.filter(t => 
        t.projectCode === p.code && 
        (t.projectYear == p.year || (!t.projectYear && !p.year)) &&
        (t.projectStore == p.store || (!t.projectStore && !p.store))
      ));
      filteredTasksToExport.push(...groupTasks);
    });

    const data = filteredTasksToExport.map((t, idx) => {
      const p = projects.find(proj => 
        proj.code === t.projectCode && 
        (t.projectYear == proj.year || (!t.projectYear && !proj.year)) &&
        (t.projectStore == proj.store || (!t.projectStore && !proj.store))
      );
      const subTaskCode = t.taskCodePhu || (p ? `${p.code}#${t.orderIndex !== undefined ? t.orderIndex + 1 : idx + 1}` : '');
      const parentTask = t.parentTaskId ? tasks.find(pt => String(pt.id) === String(t.parentTaskId)) : null;

      const commentsText = t.comments && t.comments.length > 0 
        ? t.comments.map(c => {
            const author = appUsers.find(u => 
              u.id === c.userId || 
              (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase())
            );
            const name = c.userName || author?.username || c.userId || '';
            return `${name ? name + ': ' : ''}${c.text}`;
          }).join(' | ') 
        : '';

      return [
        t.projectStore || p?.store || '',
        p?.location || '',
        t.projectYear || p?.year || '',
        t.projectCode || '', 
        subTaskCode,
        t.name || '', 
        parentTask ? (parentTask.taskCodePhu || parentTask.name || '') : '',
        formatToCSVDate(t.start), 
        formatToCSVDate(t.finish), 
        t.duration !== undefined ? t.duration : '',
        t.party || '',
        t.predecessor || '',
        t.delegation ? 'true' : 'false',
        t.realtimeUpdate ? 'true' : 'false',
        commentsText
      ];
    });

    const csv = generateCSV(headers, data);
    downloadCSV(csv, 'taka_tasks_filtered.csv');
  };

  const handleImportTasks = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let rows: string[][] = [];
      const fileName = file.name.toLowerCase();
      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames.includes('tasks') ? 'tasks' : workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
        rows = rawRows.map(row => row.map((cell: any) => String(cell !== null && cell !== undefined ? cell : '').trim()));
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }

      if (!rows || rows.length < 2) {
        useAppStore.getState().setToast({ title: "Thông báo", message: "File không có dữ liệu hoặc định dạng không đúng." });
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
          errorMsg = `Row ${idx + 2} is missing Year, Store, or Project Code. All imported data must include these three fields.`;
          break;
        }
      }
      
      if (hasError) {
        useAppStore.getState().setToast({ title: "Thông báo", message: 'Import failed: ' + errorMsg });
        return;
      }

      const processedTasks = new Map<string, Task>();
      tasks.forEach(tsk => {
        if (tsk.projectCode && tsk.name) {
          const yearKey = tsk.projectYear ? String(tsk.projectYear).trim().toLowerCase() : '';
          const storeKey = tsk.projectStore ? String(tsk.projectStore).trim().toLowerCase() : '';
          processedTasks.set(`${String(tsk.projectCode).trim().toLowerCase()}_${yearKey}_${storeKey}_${String(tsk.name).trim().toLowerCase()}`, tsk);
        }
      });
      
      const previousStates = new Map<string, any>();
      const newIds = new Set<string>();
      let importCount = 0;
      const tasksToImport: Task[] = [];
      const simulatedTasksMap = new Map<string, Task>();
      tasks.forEach(t => simulatedTasksMap.set(t.id, t));

      // First pass: extract all parsed rows grouped by project key
      const rawParsedRowsByProject = new Map<string, Array<{ rowData: any, originalCsvIndex: number }>>();
      dataRows.forEach((row, rowIndex) => {
        if (row.length < headers.length) return;
        const t: any = {};
        headers.forEach((h, i) => {
          let key = h;
          if (h === 'task name') key = 'name';
          if (h === 'projectcode') key = 'projectCode';
          if (h === 'year' || h === 'projectyear') key = 'projectYear';
          if (h === 'store' || h === 'projectstore') key = 'projectStore';
          if (h === 'sub-task code' || h === 'sub task code' || h === 'subtask code' || h === 'sub_task_code' || h === 'taskcodephu' || h === 'task code phu' || h === 'task_code_phu') {
            key = 'taskCodePhu';
          }
          if (h === 'orderindex' || h === 'order_index') key = 'orderIndex';
          if (h === 'delegation' || h === 'task delegation' || h === 'task_delegation' || h === 'isdelegation') {
            key = 'delegation';
          }
          if (h === 'task flexible' || h === 'task_flexible' || h === 'taskflexible' || h === 'flexible' || h === 'realtimeupdate' || h === 'realtime_update') {
            key = 'realtimeUpdate';
          }
          if (h === 'comments' || h === 'comment') {
            key = 'importComment';
          }
          if (h === 'parent task code' || h === 'parenttaskcode' || h === 'parent_task_code' || h === 'parent code' || h === 'parent_code' || h === 'task mẹ code' || h === 'task me code') {
            key = 'parentTaskCode';
          }
          if (h === 'parent task name' || h === 'parenttaskname' || h === 'parent_task_name' || h === 'parent name' || h === 'parent_name' || h === 'task mẹ name' || h === 'task me name' || h === 'task mẹ' || h === 'task me' || h === 'parent task' || h === 'parenttask') {
            key = 'parentTaskName';
          }
          if (h === 'parenttaskid' || h === 'parent_task_id' || h === 'parent id' || h === 'parentid') {
            key = 'parentTaskId';
          }
          if (h === 'is parent' || h === 'is_parent' || h === 'isparent') {
            key = 'isParent';
          }
          if (h === 'level' || h === 'wbs level' || h === 'wbs_level') {
            key = 'level';
          }
          
          if (['projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'importComment', 'parentTaskId', 'parentTaskCode', 'parentTaskName', 'isParent', 'level'].includes(key)) {
            let val: any = row[i];
            if (key === 'start' || key === 'finish') {
              val = parseCSVDate(val);
            } else if (key === 'duration') {
              val = cleanDurationString(val);
            } else if (key === 'delegation' || key === 'realtimeUpdate') {
              const strVal = String(val || '').trim().toLowerCase();
              val = (strVal === 'true' || strVal === '1' || strVal === 'yes' || strVal === 'on');
            } else if (key === 'projectYear') {
              val = isNaN(Number(val)) ? val : Number(val);
            }
            t[key] = val;
          }
        });

        if (t.projectCode && t.name) {
          if (!t.projectYear || !t.projectStore) {
            const possibleProjects = projects.filter(p => String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase());
            if (possibleProjects.length === 1) {
              if (!t.projectYear) t.projectYear = possibleProjects[0].year;
              if (!t.projectStore) t.projectStore = possibleProjects[0].store;
            }
          }

          if (!t.projectYear) {
            const matchedProj = projects.find(p => String(p.code).trim().toLowerCase() === String(t.projectCode).trim().toLowerCase());
            t.projectYear = (matchedProj?.year && !isNaN(Number(matchedProj.year))) ? Number(matchedProj.year) : new Date().getFullYear();
          }

          if (t.projectYear !== undefined && !isNaN(Number(t.projectYear))) {
            t.projectYear = Number(t.projectYear);
          } else {
            t.projectYear = new Date().getFullYear();
          }

          const yearKey = t.projectYear ? String(t.projectYear).trim().toLowerCase() : '';
          const storeKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
          const prjKey = `${String(t.projectCode).trim().toLowerCase()}_${yearKey}_${storeKey}`;
          
          if (!rawParsedRowsByProject.has(prjKey)) {
            rawParsedRowsByProject.set(prjKey, []);
          }
          rawParsedRowsByProject.get(prjKey)!.push({ rowData: t, originalCsvIndex: rowIndex });
        }
      });

      // Second pass: for each project, sort tasks by sub-task code if provided, otherwise preserve CSV top-to-bottom order
      rawParsedRowsByProject.forEach((items, prjKey) => {
        const sortedItems = [...items].sort((a, b) => {
          const codeA = String(a.rowData.taskCodePhu || '').trim();
          const codeB = String(b.rowData.taskCodePhu || '').trim();
          const numMatchA = codeA.match(/-(\d+)$/);
          const numMatchB = codeB.match(/-(\d+)$/);
          if (numMatchA && numMatchB) {
            const numA = parseInt(numMatchA[1], 10);
            const numB = parseInt(numMatchB[1], 10);
            if (numA !== numB) return numA - numB;
          } else if (codeA && codeB) {
            const comp = codeA.localeCompare(codeB, undefined, { numeric: true });
            if (comp !== 0) return comp;
          } else if (codeA && !codeB) {
            return -1;
          } else if (!codeA && codeB) {
            return 1;
          }

          if (a.rowData.orderIndex !== undefined && b.rowData.orderIndex !== undefined && a.rowData.orderIndex !== '' && b.rowData.orderIndex !== '') {
            const ordA = Number(a.rowData.orderIndex);
            const ordB = Number(b.rowData.orderIndex);
            if (!isNaN(ordA) && !isNaN(ordB) && ordA !== ordB) return ordA - ordB;
          }
          return a.originalCsvIndex - b.originalCsvIndex;
        });

        sortedItems.forEach((item, index) => {
          const t = item.rowData;
          const taskOrderIndex = index;
          const taskCodePhu = t.taskCodePhu ? String(t.taskCodePhu).trim() : `${String(t.projectCode).trim()}#${taskOrderIndex + 1}`;
          const key = `${prjKey}_${String(t.name).trim().toLowerCase()}`;
          const existing = processedTasks.get(key);
          const id = existing ? existing.id : `t_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${tasksToImport.length}`;
          
          if (existing) {
            if (!previousStates.has(id)) {
              previousStates.set(id, existing);
            }
          } else {
            newIds.add(id);
          }

          let updatedComments = existing?.comments ? [...existing.comments] : [];
          if (t.importComment !== undefined) {
             const importedCommentText = String(t.importComment).trim();
             
             // Lệnh đặc biệt để xóa toàn bộ comments
             if (importedCommentText === '[DELETE]' || importedCommentText === '[CLEAR]') {
                 updatedComments = [];
             } else if (importedCommentText) {
                const existingText = updatedComments.map(c => {
                   const author = appUsers.find(u => 
                       u.id === c.userId || 
                       (u.username && String(u.username).toLowerCase() === String(c.userId).toLowerCase())
                   );
                   const name = c.userName || author?.username || c.userId || '';
                   return `${name ? name + ': ' : ''}${c.text}`;
                }).join(' | ');
                
                // Nếu khác với nội dung hiện có, thêm comment mới
                if (importedCommentText !== existingText) {
                   const activeUser = useAppStore.getState().currentUser || currentUser;
                   const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
                   const activeUserName = (activeUser?.username && activeUser.username !== 'Guest') ? activeUser.username : (activeUser?.name || activeUser?.email || 'User');
                   
                   // Check if user prefixed the comment in CSV like "Name: Message"
                   let commentText = importedCommentText;
                   let commentUserId = activeUserId;
                   let commentUserName = activeUserName;
                   const prefixMatch = importedCommentText.match(/^([^:\n]+):\s*(.+)$/s);
                   if (prefixMatch) {
                      const potentialName = prefixMatch[1].trim();
                      const potentialText = prefixMatch[2].trim();
                      const matchedUser = appUsers.find(u => 
                         (u.username && u.username.toLowerCase() === potentialName.toLowerCase()) ||
                         (u.id && u.id.toLowerCase() === potentialName.toLowerCase()) ||
                         (u.email && u.email.toLowerCase() === potentialName.toLowerCase())
                      );
                      if (matchedUser) {
                         commentUserId = matchedUser.id;
                         commentUserName = matchedUser.username || potentialName;
                         commentText = potentialText;
                      }
                   }
                   
                   updatedComments.push({
                      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                      text: commentText,
                      createdAt: new Date().toISOString(),
                      userId: commentUserId,
                      userName: commentUserName
                   });
                }
             }
          }
          delete t.importComment;

          if (!existing) {
            const defaultToday = getDefaultDatetimeLocal();
            if (!t.start) t.start = defaultToday;
            if (!t.finish) t.finish = t.start || defaultToday;
            if (!t.baselineStart) t.baselineStart = t.start || defaultToday;
            if (!t.baselineFinish) t.baselineFinish = t.finish || defaultToday;
            if (t.duration === undefined || t.duration === null || String(t.duration).trim() === '') {
              t.duration = "0";
            }
          }

          const finalTask = existing 
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
          } else if (finalTask.start && finalTask.finish) {
            const s = new Date(finalTask.start);
            const f = new Date(finalTask.finish);
            if (!isNaN(s.getTime()) && !isNaN(f.getTime())) {
              const diffDays = (f.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
              finalTask.duration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
              finalTask.durationManual = true;
            }
          } else if (finalTask.start) {
            finalTask.duration = finalTask.duration || "0";
            finalTask.finish = finalTask.finish || finalTask.start;
            finalTask.durationManual = true;
          }

          processedTasks.set(key, finalTask);
          simulatedTasksMap.set(id, finalTask as Task);
          tasksToImport.push(finalTask as Task);
        });
      });

      // Resolve parent-child hierarchy (Mẹ - Con) across imported tasks and existing tasks
      const lookupTaskMap = new Map<string, Task>();
      tasks.forEach(t => lookupTaskMap.set(t.id, t));
      tasksToImport.forEach(t => lookupTaskMap.set(t.id, t));

      tasksToImport.forEach(t => {
        let resolvedParentId: string | undefined = undefined;

        // 1. Direct parentTaskId match
        if (t.parentTaskId && lookupTaskMap.has(t.parentTaskId)) {
          resolvedParentId = t.parentTaskId;
        }
        // 2. By parentTaskCode (e.g. PJ-01#1, #1, 1) within the same project
        else if ((t as any).parentTaskCode) {
          const pCode = String((t as any).parentTaskCode).trim().toLowerCase();
          const cleanNumMatch = pCode.match(/^#?(\d+)$/);
          const targetIndex = cleanNumMatch ? parseInt(cleanNumMatch[1], 10) - 1 : -1;

          const matchedParent = Array.from(lookupTaskMap.values()).find(
            pt => pt.projectCode === t.projectCode &&
                  (pt.projectYear == t.projectYear || (!pt.projectYear && !t.projectYear)) &&
                  (pt.projectStore == t.projectStore || (!pt.projectStore && !t.projectStore)) &&
                  (
                    String(pt.taskCodePhu || '').trim().toLowerCase() === pCode ||
                    String(pt.id).toLowerCase() === pCode ||
                    (cleanNumMatch && String(pt.taskCodePhu || '').trim().toLowerCase().endsWith(`#${cleanNumMatch[1]}`)) ||
                    (targetIndex >= 0 && pt.orderIndex === targetIndex)
                  )
          );
          if (matchedParent && matchedParent.id !== t.id) {
            resolvedParentId = matchedParent.id;
          }
        }
        // 3. By parentTaskName within the same project
        else if ((t as any).parentTaskName) {
          const pName = String((t as any).parentTaskName).trim().toLowerCase();
          const matchedParent = Array.from(lookupTaskMap.values()).find(
            pt => pt.projectCode === t.projectCode &&
                  (pt.projectYear == t.projectYear || (!pt.projectYear && !t.projectYear)) &&
                  (pt.projectStore == t.projectStore || (!pt.projectStore && !t.projectStore)) &&
                  String(pt.name || '').trim().toLowerCase() === pName
          );
          if (matchedParent && matchedParent.id !== t.id) {
            resolvedParentId = matchedParent.id;
          }
        }

        if (resolvedParentId && resolvedParentId !== t.id) {
          t.parentTaskId = resolvedParentId;
          (t as any).parentId = resolvedParentId;
        } else if (resolvedParentId === t.id) {
          delete t.parentTaskId;
          delete (t as any).parentId;
        }

        delete (t as any).parentTaskCode;
        delete (t as any).parentTaskName;
        delete (t as any).isParent;
        delete (t as any).level;
      });

      // Auto-expand any parent tasks in Gantt view
      try {
        const parentIdsToExpand = new Set<string>();
        tasksToImport.forEach(t => {
          if (t.parentTaskId) parentIdsToExpand.add(String(t.parentTaskId));
        });
        if (parentIdsToExpand.size > 0) {
          const saved = sessionStorage.getItem("taka_gantt_modular_expanded");
          const existingList: string[] = saved ? JSON.parse(saved) : [];
          parentIdsToExpand.forEach(id => {
            if (!existingList.includes(id)) existingList.push(id);
          });
          sessionStorage.setItem("taka_gantt_modular_expanded", JSON.stringify(existingList));
        }
      } catch (_) {}

      // 1. Tạm thời đọc start date, end date vào Zustand (Optimistic UI - Rule 2)
      useAppStore.getState().optimisticUpdateTasks(tasksToImport);

      // 2. Ưu tiên theo predecessor được gán, duration để tính lại các ngày start date, end date theo logic
      const allCurrentTasks = useAppStore.getState().tasks;
      const calculatedTasks = calculateDatesFromPredecessorsAndDuration(
        tasksToImport,
        allCurrentTasks,
        projects
      );

      // 3. Cập nhật lại ngày start date, end date của task mẹ sau khi tính toán xong, rồi cập nhật lên task summarize, project summarize,…
      const tasksMapAfterCalc = new Map<string, Task>();
      allCurrentTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
      calculatedTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
      const allTasksWithCalc = Array.from(tasksMapAfterCalc.values());
      const { updatedParents, allTasksMap } = rollupParentTaskDates(allTasksWithCalc);

      // Danh sách task cuối cùng cần lưu (bao gồm tasks được import và tasks mẹ được rollup)
      const tasksToSaveMap = new Map<string, Task>();
      calculatedTasks.forEach(t => tasksToSaveMap.set(t.id, t));
      updatedParents.forEach(p => tasksToSaveMap.set(p.id, p));
      const finalTasksToSave = Array.from(tasksToSaveMap.values());

      // Cập nhật Optimistic tức thì vào Zustand tasks (0ms)
      useAppStore.getState().optimisticUpdateTasks(finalTasksToSave);

      // Cập nhật task summarize, project summarize cho toàn bộ các dự án liên quan
      const finalFullTasksList = Array.from(allTasksMap.values());
      const affectedProjects = findAffectedProjects(finalTasksToSave, projects);
      const delegationGroups = useAppStore.getState().delegationGroups;
      const currentProjects = useAppStore.getState().projects;
      const updatedProjects = currentProjects.map(proj => {
        const isAffected = affectedProjects.some(ap => ap.id === proj.id);
        if (!isAffected) return proj;
        const pTasks = getTasksForProject(proj, finalFullTasksList);
        const computed = calculateProjectComputedDates(proj, pTasks, delegationGroups);
        return { ...proj, ...computed };
      });
      useAppStore.getState().setProjects(updatedProjects);

      // 4. Cập nhật lên Firestore
      const activeUser = useAppStore.getState().currentUser || currentUser;
      await batchSaveTasksToFirestore(finalTasksToSave, activeUser);

      for (const p of affectedProjects) {
        const pTasks = getTasksForProject(p, finalFullTasksList);
        const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);
        await syncProjectDatesToFirestore(p.id, computed);
      }

      importCount = finalTasksToSave.length;
      
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
              batch.commit().catch(e => console.error("Batch commit failed", e));
            } catch (error: any) {
              console.error("Batch commit failed", error);
              useAppStore.getState().setToast({ title: "Save Failed", message: "Network error or permission denied. Data was not saved.", type: "error" });
              return;
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
  };

  return {
    handleExportTasks,
    handleImportTasks,
    parseCSVDate,
    formatToCSVDate,
  };
}
