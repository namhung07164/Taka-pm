import { Task, Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { executeMassBatchOperations, MassWriteOp } from '../../lib/massBatchWriteEngine';
import { undoManager } from '../../lib/undoManager';
import { formatToDatetimeLocal, getDefaultDatetimeLocal } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates, matchProjectCode } from '../../lib/projectDatesService';
import { 
  calculateDatesFromPredecessorsAndDuration, 
  rollupParentTaskDates, 
  prepareMissingDelegationsForTasks,
  batchSaveTasksToFirestore 
} from '../../lib/taskImportService';
import { healAllTasksPredecessors } from '../../lib/ganttUtils';
import { extractSubtaskIndex } from '../../lib/ganttUtilsParts/taskSortingAndCodes';
import { findAffectedProjects } from '../../lib/taskStateService';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { resolveParentChildHierarchy } from './detailTaskImportHierarchy';
import { buildAffectedProjectsSyncOps } from './detailTaskImportProjectSync';
import { hydrateImportContextTasks } from './detailTaskImportHydrator';

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
  // 1. Gather all tasks across memory, local storage, and Firestore/summaries for target & referenced projects
  const initialCandidates = [...useAppStore.getState().tasks];
  tasks.forEach(t => {
    if (!initialCandidates.some(existing => existing.id === t.id)) {
      initialCandidates.push(t);
    }
  });

  try {
    const { localDb } = await import('../../lib/localDb');
    const dbTasks = await localDb.tasks.toArray();
    dbTasks.forEach(t => {
      if (!initialCandidates.some(existing => existing.id === t.id)) {
        initialCandidates.push(t);
      }
    });
  } catch {
    // localDb fallback
  }

  const allInitialTasks = await hydrateImportContextTasks(
    rawParsedRowsByProject,
    projects,
    initialCandidates
  );

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

      if (hasExplicitSubtaskNumber) {
        existing = processedImportTasksMap.get(codeKey);
      } else {
        existing = processedImportTasksMap.get(codeKey) ||
                   processedImportTasksMap.get(nameKey) ||
                   (normName ? processedImportTasksMap.get(normKey) : undefined);
      }

      if (!existing && t.id) {
        existing = existingTasksById.get(t.id);
      }

      if (!existing && hasExplicitSubtaskNumber) {
        existing = existingTasksByCode.get(codeKey);
      }

      if (!existing && !hasExplicitSubtaskNumber) {
        if (nameKey) existing = existingTasksByName.get(nameKey);
        if (!existing && normKey) existing = existingTasksByNorm.get(normKey);
        if (!existing && codeKey) existing = existingTasksByCode.get(codeKey);
      }

      const hasRealExistingId = Boolean(existing?.id && !String(existing.id).startsWith('ts_'));
      const id = hasRealExistingId ? existing!.id : `t_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${tasksToImport.length}`;

      if (existing && hasRealExistingId) {
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

      const hasImportedParentRef = Boolean(t.parentTaskId || t.parentTaskCode || t.parentTaskName);
      const finalTask: Task = existing
        ? {
            ...existing,
            ...t,
            id,
            parentTaskId: hasImportedParentRef ? (t.parentTaskId || existing.parentTaskId) : undefined,
            predecessorTaskIds: undefined,
            predecessors: undefined,
            isModularParent: false,
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
      delete (finalTask as any)._isVirtualSummary;

      if ((!finalTask.projectId || !finalTask.projectStore || finalTask.projectYear === undefined) && projects && projects.length > 0) {
        const pCode = String(finalTask.projectCode || '').trim().toLowerCase();
        const pStore = String(finalTask.projectStore || '').trim().toLowerCase();
        const pYear = String(finalTask.projectYear ?? '').trim();
        const matched = projects.find(p => {
          if (finalTask.projectId && String(p.id) === String(finalTask.projectId)) return true;
          const matchCode = matchProjectCode(p.code, pCode) || String(p.no || '').trim().toLowerCase() === pCode;
          const matchStore = !pStore || !p.store || String(p.store).trim().toLowerCase() === pStore;
          const matchYear = !pYear || p.year === undefined || p.year === null || String(p.year).trim() === pYear;
          return matchCode && matchStore && matchYear;
        });
        if (matched) {
          finalTask.projectId = matched.id;
          if (matched.code) finalTask.projectCode = matched.code;
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

  // 5. Prepare missing delegations BEFORE rolling up parent tasks & project summaries
  // so Desktop, Firestore, and all devices compute 100% identical runningStatus & progress
  const commitNowIso = new Date().toISOString();
  const activeUser = useAppStore.getState().currentUser || currentUser;
  const precomputedDelegations = prepareMissingDelegationsForTasks(tasksToImport, activeUser, commitNowIso);

  // 6. Calculate dates from predecessors and duration
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
  const healedAll = healAllTasksPredecessors(Array.from(tasksMapAfterCalc.values()), projects);
  const { updatedParents, allTasksMap } = rollupParentTaskDates(healedAll.updatedTasks, undefined, projects);

  const tasksToSaveIds = new Set<string>();
  calculatedTasks.forEach(t => tasksToSaveIds.add(t.id));
  updatedParents.forEach(p => {
    if (p.id && !String(p.id).startsWith('ts_')) {
      tasksToSaveIds.add(p.id);
    }
  });
  const finalTasksToSave: Task[] = [];
  tasksToSaveIds.forEach(tid => {
    if (String(tid).startsWith('ts_')) return;
    const tk = allTasksMap.get(tid);
    if (tk) {
      const stamped = { ...tk, updatedAt: commitNowIso };
      delete (stamped as any)._isVirtualSummary;
      allTasksMap.set(tid, stamped);
      finalTasksToSave.push(stamped);
    }
  });

  // Optimistic update (0ms UI)
  useAppStore.getState().optimisticUpdateTasks(finalTasksToSave);

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
    const pTasks = getTasksForProject(proj, finalFullTasksList, { realTasksOnly: true });
    const computed = calculateProjectComputedDates(proj, pTasks, delegationGroups);
    computedByProjectId.set(proj.id, computed);
    const nextProj = { ...proj, ...computed, updatedAt: commitNowIso };
    touchedProjectsForPersistence.push(nextProj);
    return nextProj;
  });
  useAppStore.getState().setProjects(updatedProjects);

  // Persist affected projects to LocalDB (Dexie) in background and mark tasks_proj as loaded
  if (touchedProjectsForPersistence.length > 0) {
    import('../../lib/localDb')
      .then(({ bulkPersistProjects }) => bulkPersistProjects(touchedProjectsForPersistence))
      .catch(() => {});
    import('../../lib/loadedMarkers')
      .then(({ markLoaded }) => {
        touchedProjectsForPersistence.forEach(proj => {
          if (proj.id) markLoaded('tasks_proj', proj.id).catch(() => {});
        });
      })
      .catch(() => {});
  }

  // Build authoritative project summary ops and commit tasks + delegations + project summaries
  // in ONE unified Firestore batch + parallel coalesced delta broadcast
  const { writeOps: projectWriteOps, projDeltaItems } = buildAffectedProjectsSyncOps(
    affectedProjects,
    computedByProjectId,
    commitNowIso
  );

  await batchSaveTasksToFirestore(finalTasksToSave, activeUser, {
    precomputedDelegations,
    projectWriteOps,
    projectDeltaItems: projDeltaItems,
  });

  if (finalTasksToSave.length > 0) {
    undoManager.push({
      description: 'Import Tasks',
      revert: async () => {
        const revertOps: MassWriteOp[] = [];
        previousStates.forEach((oldData, id) => {
          revertOps.push({
            collectionName: 'taka_tasks',
            docId: id,
            action: 'set',
            data: oldData,
            merge: false,
          });
        });
        newIds.forEach((id) => {
          revertOps.push({
            collectionName: 'taka_tasks',
            docId: id,
            action: 'delete',
          });
        });
        await executeMassBatchOperations(revertOps);
      },
    });
  }

  return { count: tasksToImport.length, projectCount: affectedProjects.length };
}
