import { Task, Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { doc } from 'firebase/firestore';
import { writeBatch } from '../../lib/firestoreWrites';
import { db, APP_ID } from '../../lib/firebase';
import { undoManager } from '../../lib/undoManager';
import { formatToDatetimeLocal, getDefaultDatetimeLocal } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates, matchProjectCode } from '../../lib/projectDatesService';
import { 
  calculateDatesFromPredecessorsAndDuration, 
  rollupParentTaskDates, 
  batchSaveTasksToFirestore 
} from '../../lib/taskImportService';
import { healAllTasksPredecessors } from '../../lib/ganttUtils';
import { extractSubtaskIndex } from '../../lib/ganttUtilsParts/taskSortingAndCodes';
import { findAffectedProjects } from '../../lib/taskStateService';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { resolveParentChildHierarchy } from './detailTaskImportHierarchy';
import { syncAffectedProjectsSummaries } from './detailTaskImportProjectSync';

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
}: ExecuteImportTasksParams): Promise<{ count: number; projectCount?: number }> {
  // 1. Gather all tasks across memory and local storage to guarantee 100% presence
  const allInitialTasks = [...useAppStore.getState().tasks];
  tasks.forEach(t => {
    if (!allInitialTasks.some(existing => existing.id === t.id)) {
      allInitialTasks.push(t);
    }
  });

  try {
    const { localDb } = await import('../../lib/localDb');
    const dbTasks = await localDb.tasks.toArray();
    dbTasks.forEach(t => {
      if (!allInitialTasks.some(existing => existing.id === t.id)) {
        allInitialTasks.push(t);
      }
    });
  } catch {
    // localDb fallback
  }

  // 2. Build multi-index maps for existing tasks
  const existingTasksById = new Map<string, Task>();
  const existingTasksByName = new Map<string, Task>();
  const existingTasksByNorm = new Map<string, Task>();
  const existingTasksByCode = new Map<string, Task>();

  allInitialTasks.forEach(tsk => {
    if (!tsk || !tsk.id) return;
    existingTasksById.set(tsk.id, tsk);
    const prjKey = buildCanonicalProjectKey(tsk.projectCode, tsk.projectYear, tsk.projectStore, projects);
    if (tsk.name) {
      existingTasksByName.set(`${prjKey}:::${String(tsk.name).trim().toLowerCase()}`, tsk);
      const norm = normalizeTaskNameForComparison(tsk.name);
      if (norm) {
        existingTasksByNorm.set(`${prjKey}:::norm:::${norm}`, tsk);
      }
    }
    if (tsk.taskCodePhu) {
      existingTasksByCode.set(`${prjKey}:::code:::${String(tsk.taskCodePhu).trim().toLowerCase()}`, tsk);
    }
  });

  const previousStates = new Map<string, any>();
  const newIds = new Set<string>();
  const tasksToImport: Task[] = [];
  const processedImportTasksMap = new Map<string, Task>();

  // 3. Process rows project by project
  rawParsedRowsByProject.forEach((items, prjKey) => {
    const sample = items[0]?.rowData;
    const targetProject = projects.find(p => {
      const codeMatch = matchProjectCode(p.code, sample?.projectCode);
      const storeMatch = !sample?.projectStore || !p.store || String(p.store).trim().toLowerCase() === String(sample.projectStore).trim().toLowerCase();
      const yearMatch = !sample?.projectYear || p.year === undefined || p.year === null || String(p.year).trim() === String(sample.projectYear).trim();
      return codeMatch && storeMatch && yearMatch;
    });

    const projectExistingTasks = targetProject
      ? getTasksForProject(targetProject, allInitialTasks)
      : allInitialTasks.filter(t => buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects) === prjKey);

    // Compute maximum existing subtask code number and max orderIndex for this project
    let maxExistingSubtaskNum = 0;
    let maxExistingOrderIndex = -1;

    projectExistingTasks.forEach(pt => {
      if (pt.orderIndex !== undefined && pt.orderIndex !== null) {
        const ord = Number(pt.orderIndex);
        if (!isNaN(ord) && ord > maxExistingOrderIndex) {
          maxExistingOrderIndex = ord;
        }
      }
      if (pt.taskCodePhu) {
        const n = extractSubtaskIndex(pt.taskCodePhu);
        if (n !== null && n > maxExistingSubtaskNum) {
          maxExistingSubtaskNum = n;
        }
      }
    });

    let nextAutoNumber = Math.max(maxExistingSubtaskNum, maxExistingOrderIndex + 1);

    const sortedItems = [...items].sort((a, b) => {
      const codeA = String(a.rowData.taskCodePhu || '').trim();
      const codeB = String(b.rowData.taskCodePhu || '').trim();
      const numA = extractSubtaskIndex(codeA);
      const numB = extractSubtaskIndex(codeB);
      if (numA !== null && numB !== null) {
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

    sortedItems.forEach((item) => {
      const t = item.rowData;
      const exactProjectCode = String(t.projectCode || targetProject?.code || '').trim();
      const canonicalPrjKey = buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects);

      // Determine taskCodePhu and orderIndex: respect explicit subtask number from CSV
      const rawCode = String(t.taskCodePhu || '').trim();
      const explicitNum = extractSubtaskIndex(rawCode);
      const hasExplicitSubtaskNumber = explicitNum !== null;

      let taskCodePhu: string;
      let taskOrderIndex: number;

      if (explicitNum !== null) {
        taskCodePhu = `${exactProjectCode}#${explicitNum}`;
        nextAutoNumber = Math.max(nextAutoNumber, explicitNum);
        taskOrderIndex = t.orderIndex !== undefined && t.orderIndex !== '' && !isNaN(Number(t.orderIndex))
          ? Number(t.orderIndex)
          : explicitNum - 1;
      } else if (rawCode) {
        taskCodePhu = rawCode.startsWith(exactProjectCode) ? rawCode : `${exactProjectCode}#${rawCode}`;
        nextAutoNumber += 1;
        taskOrderIndex = t.orderIndex !== undefined && t.orderIndex !== '' && !isNaN(Number(t.orderIndex))
          ? Number(t.orderIndex)
          : nextAutoNumber - 1;
      } else {
        // No code specified in CSV -> auto-continue after max existing task
        nextAutoNumber += 1;
        taskCodePhu = `${exactProjectCode}#${nextAutoNumber}`;
        taskOrderIndex = t.orderIndex !== undefined && t.orderIndex !== '' && !isNaN(Number(t.orderIndex))
          ? Number(t.orderIndex)
          : nextAutoNumber - 1;
      }

      const rawName = String(t.name || '').trim().toLowerCase();
      const normName = normalizeTaskNameForComparison(t.name);
      const nameKey = `${canonicalPrjKey}:::${rawName}`;
      const normKey = `${canonicalPrjKey}:::norm:::${normName}`;
      const codeKey = `${canonicalPrjKey}:::code:::${taskCodePhu.toLowerCase()}`;

      let existing: Task | undefined = undefined;

      // Priority 1: Match within current import batch
      if (hasExplicitSubtaskNumber) {
        existing = processedImportTasksMap.get(codeKey);
      } else {
        existing = processedImportTasksMap.get(codeKey) ||
                   processedImportTasksMap.get(nameKey) ||
                   (normName ? processedImportTasksMap.get(normKey) : undefined);
      }

      // Priority 2: Direct ID match if row contains ID
      if (!existing && t.id) {
        existing = existingTasksById.get(t.id);
      }

      // Priority 3: When explicit subtask code was provided, ONLY match existing task with exact same code!
      // NEVER match by name if code does not match!
      if (!existing && hasExplicitSubtaskNumber) {
        existing = existingTasksByCode.get(codeKey);
      }

      // Priority 4: When NO explicit subtask code was provided, match by name
      if (!existing && !hasExplicitSubtaskNumber) {
        if (nameKey) existing = existingTasksByName.get(nameKey);
        if (!existing && normKey) existing = existingTasksByNorm.get(normKey);
        if (!existing && codeKey) existing = existingTasksByCode.get(codeKey);
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

      // Tự động phân giải và gán projectId từ danh sách projects theo bộ 3 mã (code + store + year)
      if (!finalTask.projectId && projects && projects.length > 0) {
        const pCode = String(finalTask.projectCode || '').trim().toLowerCase();
        const pStore = String(finalTask.projectStore || '').trim().toLowerCase();
        const pYear = String(finalTask.projectYear ?? '').trim();
        const matched = projects.find(p => {
          const matchCode = String(p.code || '').trim().toLowerCase() === pCode || String(p.no || '').trim().toLowerCase() === pCode;
          const matchStore = !pStore || !p.store || String(p.store).trim().toLowerCase() === pStore;
          const matchYear = !pYear || p.year === undefined || p.year === null || String(p.year).trim() === pYear;
          return matchCode && matchStore && matchYear;
        });
        if (matched) {
          finalTask.projectId = matched.id;
          if (!finalTask.projectStore && matched.store) finalTask.projectStore = matched.store;
          if (finalTask.projectYear === undefined && matched.year !== undefined) finalTask.projectYear = matched.year;
        }
      }

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

  // 4. Resolve parent-child hierarchy across imported tasks and existing tasks
  resolveParentChildHierarchy(tasksToImport, allInitialTasks);

  // 5. Calculate dates from predecessors and duration
  useAppStore.getState().optimisticUpdateTasks(tasksToImport);

  const allCurrentTasks = useAppStore.getState().tasks;
  const tasksMapAfterCalc = new Map<string, Task>();
  allInitialTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  allCurrentTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));

  const calculatedTasks = calculateDatesFromPredecessorsAndDuration(
    tasksToImport,
    Array.from(tasksMapAfterCalc.values()),
    projects
  );

  calculatedTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  const allTasksWithCalc = Array.from(tasksMapAfterCalc.values());
  const { updatedParents, allTasksMap } = rollupParentTaskDates(allTasksWithCalc, undefined, projects);

  const tasksToSaveMap = new Map<string, Task>();
  calculatedTasks.forEach(t => tasksToSaveMap.set(t.id, t));
  updatedParents.forEach(p => tasksToSaveMap.set(p.id, p));
  const rawTasksToSave = Array.from(tasksToSaveMap.values());

  // Auto-heal predecessor string codes on imported CSV/Excel tasks
  const healed = healAllTasksPredecessors(rawTasksToSave, projects);
  const finalTasksToSave = healed.updatedTasks;

  // Optimistic update (0ms UI)
  useAppStore.getState().optimisticUpdateTasks(finalTasksToSave);

  // Persist tasks to LocalDB (Dexie) immediately
  if (finalTasksToSave.length > 0) {
    import('../../lib/localDb')
      .then(({ bulkPersistTasks }) => bulkPersistTasks(finalTasksToSave))
      .catch(() => {});
  }

  // Compute & sync project summaries in memory BEFORE overwriting store.projects
  const finalFullTasksList = Array.from(allTasksMap.values());
  const affectedProjects = findAffectedProjects(finalTasksToSave, projects);
  const delegationGroups = useAppStore.getState().delegationGroups;
  const currentProjects = useAppStore.getState().projects;
  const computedByProjectId = new Map<string, ReturnType<typeof calculateProjectComputedDates>>();
  const touchedProjectsForPersistence: Project[] = [];

  const updatedProjects = currentProjects.map(proj => {
    const isAffected = affectedProjects.some(ap => ap.id === proj.id);
    if (!isAffected) return proj;
    const pTasks = getTasksForProject(proj, finalFullTasksList);
    const computed = calculateProjectComputedDates(proj, pTasks, delegationGroups);
    computedByProjectId.set(proj.id, computed);
    const nextProj = { ...proj, ...computed };
    touchedProjectsForPersistence.push(nextProj);
    return nextProj;
  });
  useAppStore.getState().setProjects(updatedProjects);

  // Persist affected projects to LocalDB (Dexie) immediately
  if (touchedProjectsForPersistence.length > 0) {
    import('../../lib/localDb')
      .then(({ bulkPersistProjects }) => bulkPersistProjects(touchedProjectsForPersistence))
      .catch(() => {});
  }

  // Save tasks & project summaries to Firestore + Delta bus in parallel chunks
  const activeUser = useAppStore.getState().currentUser || currentUser;
  const syncProjectsBatchPromise = syncAffectedProjectsSummaries(affectedProjects, computedByProjectId, activeUser);

  const cloudSyncPromise = Promise.all([
    batchSaveTasksToFirestore(finalTasksToSave, activeUser),
    syncProjectsBatchPromise,
  ]);

  // Wait up to 2.5s for fast cloud commit; if mass import is very large, let remaining chunks finish in background without blocking the UI notification
  await Promise.race([
    cloudSyncPromise,
    new Promise<void>(resolve => setTimeout(resolve, 2500)),
  ]);

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

  return { count: tasksToImport.length, projectCount: affectedProjects.length };
}
