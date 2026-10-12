import { Task, Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { formatToDatetimeLocal, getDefaultDatetimeLocal } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates, syncProjectDatesToFirestore } from '../../lib/projectDatesService';
import { 
  calculateDatesFromPredecessorsAndDuration, 
  rollupParentTaskDates, 
  batchSaveTasksToFirestore 
} from '../../lib/taskImportService';
import { healAllTasksPredecessors } from '../../lib/ganttUtils';
import { findAffectedProjects } from '../../lib/taskStateService';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';

interface ExecuteImportTasksParams {
  rawParsedRowsByProject: Map<string, Array<{ rowData: any; originalCsvIndex: number }>>;
  projects: Project[];
  tasks: Task[];
  appUsers: AppUser[];
  currentUser: AppUser;
}

export async function executeImportTasks({
  rawParsedRowsByProject,
  projects,
  tasks,
  appUsers,
  currentUser
}: ExecuteImportTasksParams): Promise<{ count: number }> {
  // Build fast multi-index maps for existing tasks
  const existingTasksById = new Map<string, Task>();
  const existingTasksByName = new Map<string, Task>();
  const existingTasksByNorm = new Map<string, Task>();
  const existingTasksByCode = new Map<string, Task>();

  tasks.forEach(tsk => {
    existingTasksById.set(tsk.id, tsk);
    const prjKey = buildCanonicalProjectKey(tsk.projectCode, tsk.projectYear, tsk.projectStore, projects);
    const pCode = String(tsk.projectCode || '').trim().toLowerCase();
    if (tsk.name) {
      const nameKey = `${prjKey}:::${String(tsk.name).trim().toLowerCase()}`;
      existingTasksByName.set(nameKey, tsk);
      const norm = normalizeTaskNameForComparison(tsk.name, tsk.projectCode);
      if (norm) {
        existingTasksByNorm.set(`${pCode}:::norm:::${norm}`, tsk);
      }
    }
    if (tsk.taskCodePhu) {
      const codeKey = `${pCode}:::code:::${String(tsk.taskCodePhu).trim().toLowerCase()}`;
      existingTasksByCode.set(codeKey, tsk);
    }
  });

  const previousStates = new Map<string, any>();
  const newIds = new Set<string>();
  const tasksToImport: Task[] = [];
  const processedImportTasksMap = new Map<string, Task>();

  // Process rows project by project
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
      // Dùng index thực tế của dòng trong file CSV để đánh số lại, đảm bảo không nhảy cóc
      const taskOrderIndex = index; 
      const exactProjectCode = String(t.projectCode || '').trim();
      
      // Ép buộc tạo Subtask code: Lấy tuyệt đối Project Code + # + (Thứ tự dòng + 1)
      const taskCodePhu = `${exactProjectCode}#${taskOrderIndex + 1}`;

      const canonicalPrjKey = buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects);
      const pCode = exactProjectCode.toLowerCase();
      const rawName = String(t.name || '').trim().toLowerCase();
      const normName = normalizeTaskNameForComparison(t.name, t.projectCode);
      const nameKey = `${canonicalPrjKey}:::${rawName}`;
      const normKey = `${pCode}:::norm:::${normName}`;
      const codeKey = `${pCode}:::code:::${String(taskCodePhu).trim().toLowerCase()}`;

      // Match against existing tasks in priority:
      // 1. Matched in current import batch (by exact name, norm name, or code)
      // 2. By ID
      // 3. By exact project + name
      // 4. By normalized project + name
      // 5. By project + taskCodePhu
      let existing: Task | undefined = processedImportTasksMap.get(nameKey) ||
                                       (normName ? processedImportTasksMap.get(normKey) : undefined) ||
                                       (taskCodePhu ? processedImportTasksMap.get(codeKey) : undefined);
      if (!existing && t.id) {
        existing = existingTasksById.get(t.id);
      }
      if (!existing && nameKey) {
        existing = existingTasksByName.get(nameKey);
      }
      if (!existing && normKey) {
        existing = existingTasksByNorm.get(normKey);
      }
      if (!existing && taskCodePhu) {
        existing = existingTasksByCode.get(codeKey);
      }

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

          if (importedCommentText !== existingText) {
            const activeUser = useAppStore.getState().currentUser || currentUser;
            const activeUserId = activeUser?.id && activeUser.id !== 'guest' ? activeUser.id : (activeUser?.username || 'system');
            const activeUserName = (activeUser?.username && activeUser.username !== 'Guest') ? activeUser.username : (activeUser?.name || activeUser?.email || 'User');

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

      const finalTask: Task = existing
        ? {
            ...existing,
            ...t,
            id: existing.id,
            comments: updatedComments,
            orderIndex: taskOrderIndex,
            taskCodePhu,
            durationManual: true,
            finishManual: false,
            startManual: false,
            updatedAt: new Date().toISOString()
          }
        : {
            ...t,
            id,
            comments: updatedComments,
            orderIndex: taskOrderIndex,
            taskCodePhu,
            durationManual: true,
            finishManual: false,
            startManual: false,
            updatedAt: new Date().toISOString()
          };

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

      // Register immediately into lookup maps to prevent duplicate tasks within same import
      processedImportTasksMap.set(nameKey, finalTask);
      if (normKey) processedImportTasksMap.set(normKey, finalTask);
      if (codeKey) processedImportTasksMap.set(codeKey, finalTask);
      existingTasksByName.set(nameKey, finalTask);
      if (normKey) existingTasksByNorm.set(normKey, finalTask);
      existingTasksByCode.set(codeKey, finalTask);
      existingTasksById.set(finalTask.id, finalTask);

      const existingIndex = tasksToImport.findIndex(tk => tk.id === finalTask.id);
      if (existingIndex >= 0) {
        tasksToImport[existingIndex] = finalTask;
      } else {
        tasksToImport.push(finalTask);
      }
    });
  });

  // Resolve parent-child hierarchy across imported tasks and existing tasks
  const lookupTaskMap = new Map<string, Task>();
  tasks.forEach(t => lookupTaskMap.set(t.id, t));
  tasksToImport.forEach(t => lookupTaskMap.set(t.id, t));

  tasksToImport.forEach(t => {
    let resolvedParentId: string | undefined = undefined;

    if (t.parentTaskId && lookupTaskMap.has(t.parentTaskId)) {
      resolvedParentId = t.parentTaskId;
    } else if ((t as any).parentTaskCode) {
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
    } else if ((t as any).parentTaskName) {
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

  // Calculate dates from predecessors and duration
  useAppStore.getState().optimisticUpdateTasks(tasksToImport);

  const allCurrentTasks = useAppStore.getState().tasks;
  const calculatedTasks = calculateDatesFromPredecessorsAndDuration(
    tasksToImport,
    allCurrentTasks,
    projects
  );

  const tasksMapAfterCalc = new Map<string, Task>();
  allCurrentTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  calculatedTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  const allTasksWithCalc = Array.from(tasksMapAfterCalc.values());
  const { updatedParents, allTasksMap } = rollupParentTaskDates(allTasksWithCalc);

  const tasksToSaveMap = new Map<string, Task>();
  calculatedTasks.forEach(t => tasksToSaveMap.set(t.id, t));
  updatedParents.forEach(p => tasksToSaveMap.set(p.id, p));
  const rawTasksToSave = Array.from(tasksToSaveMap.values());

  // Auto-heal predecessor string codes on imported CSV/Excel tasks
  const healed = healAllTasksPredecessors(rawTasksToSave, projects);
  const finalTasksToSave = healed.updatedTasks;

  // Optimistic update
  useAppStore.getState().optimisticUpdateTasks(finalTasksToSave);

  // Sync project summaries
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

  // Save to Firestore
  const activeUser = useAppStore.getState().currentUser || currentUser;
  await batchSaveTasksToFirestore(finalTasksToSave, activeUser);

  for (const p of affectedProjects) {
    const pTasks = getTasksForProject(p, finalFullTasksList);
    const computed = calculateProjectComputedDates(p, pTasks, delegationGroups);
    await syncProjectDatesToFirestore(p.id, computed);
  }

  if (finalTasksToSave.length > 0) {
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
        await batch.commit();
      }
    });
  }

  return { count: tasksToImport.length };
}
