import { Task, Project, AppUser } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { undoManager } from '../../lib/undoManager';
import { formatToDatetimeLocal, getDefaultDatetimeLocal } from '../../lib/utils';
import { getTasksForProject, calculateProjectComputedDates, matchProjectCode } from '../../lib/projectDatesService';
import {
  calculateDatesFromPredecessorsAndDuration, rollupParentTaskDates,
  prepareMissingDelegationsForTasks, batchSaveTasksToFirestore
} from '../../lib/taskImportService';
import { healAllTasksPredecessors } from '../../lib/ganttUtils';
import { extractExplicitSubtaskNumber, extractSubtaskIndex } from '../../lib/ganttUtilsParts/taskSortingAndCodes';
import { findAffectedProjects } from '../../lib/taskStateService';
import { buildCanonicalProjectKey, normalizeTaskNameForComparison } from '../../lib/taskDeduplicationService';
import { resolveParentChildHierarchy } from './detailTaskImportHierarchy';
import { buildAffectedProjectsSyncOps, hasImportedTaskMeaningfullyChanged, commitImportedStateToStoreAndLocal } from './detailTaskImportProjectSync';
import { hydrateImportContextTasks, lockExistingProjectTasksOrder } from './detailTaskImportHydrator';

interface ExecuteImportTasksParams {
  rawParsedRowsByProject: Map<string, Array<{ rowData: any; originalCsvIndex: number }>>;
  projects: Project[];
  tasks: Task[];
  appUsers: AppUser[];
  currentUser: AppUser;
}

export async function executeImportTasks({ rawParsedRowsByProject, projects, tasks, appUsers, currentUser }: ExecuteImportTasksParams): Promise<{ count: number; projectCount?: number }> {
  // 1. Gather in-memory tasks in O(N) Map (no full-DB localDb.tasks.toArray() O(N^2) scan on main thread)
  const candidatesById = new Map<string, Task>();
  for (const t of useAppStore.getState().tasks || []) {
    if (t?.id) candidatesById.set(t.id, t);
  }
  for (const t of tasks || []) {
    if (t?.id && !candidatesById.has(t.id)) candidatesById.set(t.id, t);
  }

  // Hydrate only target & predecessor-referenced projects' tasks from Dexie/Firestore
  const allInitialTasks = await hydrateImportContextTasks(
    rawParsedRowsByProject,
    projects,
    Array.from(candidatesById.values())
  );

  // Hydrate delegations from Dexie only for the target projects
  try {
    const { getLocalDelegationsForProjects } = await import('../../lib/localDb');
    const targetCodes = Array.from(rawParsedRowsByProject.values())
      .map((g) => String(g[0]?.rowData?.projectCode || '').trim())
      .filter(Boolean);
    if (targetCodes.length > 0) {
      const dbDels = await getLocalDelegationsForProjects(targetCodes);
      if (dbDels && dbDels.length > 0) {
        const curDels = useAppStore.getState().delegationGroups || [];
        const delMap = new Map(curDels.map((d) => [d.id, d]));
        let addedDel = false;
        dbDels.forEach((d) => {
          if (d?.id && !delMap.has(d.id)) {
            delMap.set(d.id, d);
            addedDel = true;
          }
        });
        if (addedDel) useAppStore.getState().setDelegationGroups(Array.from(delMap.values()));
      }
    }
  } catch { /* localDb fallback */ }

  // Yield 1 microtask so the browser UI stays responsive at 60 FPS before heavy predecessor/rollup math
  await new Promise((r) => setTimeout(r, 0));

  // 2. Build multi-index maps for existing tasks in scoped projects
  const existingTasksById = new Map<string, Task>();
  const existingTasksByName = new Map<string, Task>();
  const existingTasksByNorm = new Map<string, Task>();
  const existingTasksByCode = new Map<string, Task>();

  allInitialTasks.forEach(tsk => {
    if (!tsk || !tsk.id) return;
    existingTasksById.set(tsk.id, tsk);
    const prjKey = buildCanonicalProjectKey(tsk.projectCode, tsk.projectYear, tsk.projectStore, projects);
    if (tsk.name) {
      const nameK = `${prjKey}:::${String(tsk.name).trim().toLowerCase()}`;
      if (!existingTasksByName.has(nameK)) existingTasksByName.set(nameK, tsk);
      const norm = normalizeTaskNameForComparison(tsk.name);
      if (norm && !existingTasksByNorm.has(`${prjKey}:::norm:::${norm}`)) {
        existingTasksByNorm.set(`${prjKey}:::norm:::${norm}`, tsk);
      }
    }
    if (tsk.taskCodePhu) existingTasksByCode.set(`${prjKey}:::code:::${String(tsk.taskCodePhu).trim().toLowerCase()}`, tsk);
  });

  const previousStates = new Map<string, any>();
  const newIds = new Set<string>();
  const tasksToImport: Task[] = [];
  const processedImportTasksMap = new Map<string, Task>();
  const lockedExistingTasksToSave = new Map<string, Task>();

  // 3. Process rows project by project
  rawParsedRowsByProject.forEach((items, prjKey) => {
    const sample = items[0]?.rowData;
    const targetProject = projects.find(p => {
      const codeMatch = matchProjectCode(p.code, sample?.projectCode);
      const storeMatch = !sample?.projectStore || !p.store || String(p.store).trim().toLowerCase() === String(sample.projectStore).trim().toLowerCase();
      const yearMatch = !sample?.projectYear || p.year === undefined || p.year === null || String(p.year).trim() === String(sample.projectYear).trim();
      return codeMatch && storeMatch && yearMatch;
    });

    const exactProjCodeForGroup = String(sample?.projectCode || targetProject?.code || '').trim();
    const canonicalGroupKey = buildCanonicalProjectKey(sample?.projectCode, sample?.projectYear, sample?.projectStore, projects);
    const projectExistingTasks = targetProject
      ? getTasksForProject(targetProject, allInitialTasks)
      : allInitialTasks.filter(t => buildCanonicalProjectKey(t.projectCode, t.projectYear, t.projectStore, projects) === prjKey);

    const { maxExistingSubtaskNum, maxExistingOrderIndex } = lockExistingProjectTasksOrder(
      projectExistingTasks,
      targetProject,
      exactProjCodeForGroup,
      canonicalGroupKey,
      allInitialTasks,
      existingTasksById,
      existingTasksByName,
      existingTasksByNorm,
      existingTasksByCode,
      lockedExistingTasksToSave,
      previousStates
    );
    let nextAutoNumber = Math.max(maxExistingSubtaskNum, maxExistingOrderIndex + 1);

    const sortedItems = [...items].sort((a, b) => {
      const codeA = String(a.rowData.taskCodePhu || '').trim();
      const codeB = String(b.rowData.taskCodePhu || '').trim();
      const numA = extractExplicitSubtaskNumber(codeA, exactProjCodeForGroup) ?? extractSubtaskIndex(codeA, exactProjCodeForGroup);
      const numB = extractExplicitSubtaskNumber(codeB, exactProjCodeForGroup) ?? extractSubtaskIndex(codeB, exactProjCodeForGroup);
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
      const explicitNum = extractExplicitSubtaskNumber(rawCode, exactProjectCode) ?? extractSubtaskIndex(rawCode, exactProjectCode);
      const hasExplicitSubtaskNumber = explicitNum !== null;

      let taskCodePhu: string;
      let taskOrderIndex: number;

      if (explicitNum !== null) {
        taskCodePhu = `${exactProjectCode}#${explicitNum}`;
        nextAutoNumber = Math.max(nextAutoNumber, explicitNum);
        taskOrderIndex = explicitNum - 1;
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
        existing =
          processedImportTasksMap.get(codeKey) ||
          (t.id ? existingTasksById.get(t.id) : undefined) ||
          existingTasksByCode.get(codeKey);
      } else {
        existing =
          processedImportTasksMap.get(codeKey) ||
          processedImportTasksMap.get(nameKey) ||
          (normName ? processedImportTasksMap.get(normKey) : undefined) ||
          (t.id ? existingTasksById.get(t.id) : undefined) ||
          (nameKey ? existingTasksByName.get(nameKey) : undefined) ||
          (normKey ? existingTasksByNorm.get(normKey) : undefined) ||
          (codeKey ? existingTasksByCode.get(codeKey) : undefined);
      }

      const hasRealExistingId = Boolean(existing?.id && !String(existing.id).startsWith('ts_'));
      const id = hasRealExistingId ? existing!.id : `t_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${tasksToImport.length}`;
      lockedExistingTasksToSave.delete(id);

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

      const defaultToday = getDefaultDatetimeLocal();
      const csvPred = t.predecessor !== undefined ? String(t.predecessor || '').trim().replace(/^[,;\s]+|[,;\s]+$/g, '').trim() : undefined;
      const csvBaselineStart = t.baselineStart ? String(t.baselineStart).trim() : '';
      const csvBaselineFinish = t.baselineFinish ? String(t.baselineFinish).trim() : '';
      if (!existing) {
        if (!t.start) t.start = defaultToday;
        if (!t.finish) t.finish = t.start || defaultToday;
        if (t.duration === undefined || t.duration === null || String(t.duration).trim() === '') t.duration = "0";
      } else {
        if (!t.start) t.start = existing.start || defaultToday;
        if (!t.finish) t.finish = existing.finish || t.start || defaultToday;
      }
      if (csvPred !== undefined) t.predecessor = csvPred;

      const resolvedDelegation =
        t.delegation !== undefined
          ? Boolean(t.delegation)
          : existing?.delegation !== undefined
          ? Boolean(existing.delegation)
          : true;
      const hasImportedParentRef = Boolean(t.parentTaskId || t.parentTaskCode || t.parentTaskName);
      const finalTask: Task = existing
        ? {
            ...existing, ...t, id, delegation: resolvedDelegation,
            predecessor: csvPred !== undefined ? (csvPred || existing.predecessor || '') : (existing.predecessor || ''),
            parentTaskId: hasImportedParentRef ? (t.parentTaskId || existing.parentTaskId) : undefined,
            predecessorTaskIds: undefined, predecessors: undefined, isModularParent: false,
            comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu,
            durationManual: true, finishManual: false, startManual: false, updatedAt: new Date().toISOString()
          }
        : {
            ...t, id, delegation: resolvedDelegation, predecessor: csvPred || '',
            comments: updatedComments, orderIndex: taskOrderIndex, taskCodePhu,
            durationManual: true, finishManual: false, startManual: false, updatedAt: new Date().toISOString()
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

      finalTask.baselineStart = csvBaselineStart || existing?.baselineStart || finalTask.start || defaultToday;
      finalTask.baselineFinish = csvBaselineFinish || existing?.baselineFinish || finalTask.finish || defaultToday;

      processedImportTasksMap.set(nameKey, finalTask);
      if (normKey) processedImportTasksMap.set(normKey, finalTask);
      if (codeKey) processedImportTasksMap.set(codeKey, finalTask);
      if (!hasExplicitSubtaskNumber || !existingTasksByName.has(nameKey)) {
        existingTasksByName.set(nameKey, finalTask);
      }
      if (normKey && (!hasExplicitSubtaskNumber || !existingTasksByNorm.has(normKey))) {
        existingTasksByNorm.set(normKey, finalTask);
      }
      existingTasksByCode.set(codeKey, finalTask);
      existingTasksById.set(finalTask.id, finalTask);

      const existingIndex = tasksToImport.findIndex(tk => tk.id === finalTask.id);
      if (existingIndex >= 0) tasksToImport[existingIndex] = finalTask;
      else tasksToImport.push(finalTask);
    });
  });

  // 4. Resolve parent-child hierarchy across imported tasks and scoped existing tasks
  resolveParentChildHierarchy(tasksToImport, allInitialTasks);
  const importedPredById = new Map<string, string>();
  tasksToImport.forEach(t => {
    if (t.predecessor && String(t.predecessor).trim()) importedPredById.set(t.id, String(t.predecessor).trim());
  });

  const commitNowIso = new Date().toISOString();
  const activeUser = useAppStore.getState().currentUser || currentUser;

  // 5. Compute predecessors, healing, and parent rollups purely in-memory on the scoped project tasks
  const tasksMapAfterCalc = new Map<string, Task>();
  allInitialTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  tasksToImport.forEach(t => tasksMapAfterCalc.set(t.id, t));

  const affectedProjects = findAffectedProjects([...allInitialTasks, ...tasksToImport], projects);
  const scopedProjects = affectedProjects.length > 0 ? affectedProjects : projects;

  const calculatedTasks = calculateDatesFromPredecessorsAndDuration(
    tasksToImport,
    Array.from(tasksMapAfterCalc.values()),
    scopedProjects
  );

  calculatedTasks.forEach(t => tasksMapAfterCalc.set(t.id, t));
  const healedAll = healAllTasksPredecessors(Array.from(tasksMapAfterCalc.values()), scopedProjects);
  const { updatedParents, allTasksMap } = rollupParentTaskDates(healedAll.updatedTasks, undefined, scopedProjects);

  const tasksToSaveIds = new Set<string>();
  lockedExistingTasksToSave.forEach((_, tid) => tasksToSaveIds.add(tid));
  calculatedTasks.forEach(t => tasksToSaveIds.add(t.id));
  healedAll.updatesToSave.forEach(ct => { if (ct.id && !String(ct.id).startsWith('ts_')) tasksToSaveIds.add(ct.id); });
  updatedParents.forEach(p => { if (p.id && !String(p.id).startsWith('ts_')) tasksToSaveIds.add(p.id); });
  const finalTasksToSave: Task[] = [];
  tasksToSaveIds.forEach(tid => {
    if (String(tid).startsWith('ts_')) return;
    const tk = allTasksMap.get(tid);
    if (tk) {
      const explicitPred = importedPredById.get(tid);
      const prevExisting = previousStates.get(tid);
      const hadValidPrevBaseline = Boolean(
        prevExisting?.baselineStart &&
        prevExisting?.baselineFinish &&
        !(prevExisting.baselineStart === prevExisting.baselineFinish && tk.start !== tk.finish)
      );
      const stamped: Task = {
        ...tk,
        baselineStart: hadValidPrevBaseline ? prevExisting!.baselineStart : (tk.start || tk.baselineStart),
        baselineFinish: hadValidPrevBaseline ? prevExisting!.baselineFinish : (tk.finish || tk.baselineFinish),
        ...(!tk.isModularParent && explicitPred && (!tk.predecessor || !String(tk.predecessor).trim())
          ? { predecessor: explicitPred }
          : {}),
        updatedAt: commitNowIso,
      };
      delete (stamped as any)._isVirtualSummary;
      const isTaskDirty =
        lockedExistingTasksToSave.has(tid) ||
        hasImportedTaskMeaningfullyChanged(prevExisting, stamped, newIds.has(tid));
      if (isTaskDirty) {
        allTasksMap.set(tid, stamped);
        finalTasksToSave.push(stamped);
      } else if (prevExisting) {
        allTasksMap.set(tid, prevExisting);
      }
    }
  });

  // 6. Prepare missing delegations ONLY for new tasks, newly delegated tasks, or tasks with loaded delegation groups
  const loadedDelSet = new Set(
    (useAppStore.getState().delegationGroups || []).flatMap(d => [d?.id, d?.parentTaskId].filter(Boolean))
  );
  const tasksNeedingDelegationCheck = finalTasksToSave.filter(
    t => newIds.has(t.id) || !previousStates.get(t.id)?.delegation || loadedDelSet.has(`del_${t.id}`) || loadedDelSet.has(t.id)
  );
  const precomputedDelegations = prepareMissingDelegationsForTasks(tasksNeedingDelegationCheck, activeUser, commitNowIso);

  // Compute project summaries in memory and perform ONE unified Zustand + LocalDB update
  const finalFullTasksList = Array.from(allTasksMap.values());
  const finalAffectedProjects = findAffectedProjects(
    finalTasksToSave.length > 0 ? finalTasksToSave : tasksToImport,
    projects
  );
  const delegationGroups = useAppStore.getState().delegationGroups;
  const currentProjects = projects && projects.length > 0 ? projects : useAppStore.getState().projects;
  const computedByProjectId = new Map<string, ReturnType<typeof calculateProjectComputedDates>>();
  const touchedProjectsForPersistence: Project[] = [];

  currentProjects.forEach(proj => {
    const isAffected = finalAffectedProjects.some(ap => String(ap.id) === String(proj.id));
    if (!isAffected) return;
    const pTasks = getTasksForProject(proj, finalFullTasksList, { realTasksOnly: true });
    const computed = calculateProjectComputedDates(proj, pTasks, delegationGroups);
    computedByProjectId.set(String(proj.id), computed);
    touchedProjectsForPersistence.push({ ...proj, ...computed, updatedAt: commitNowIso });
  });

  const hydratedRealTasks = finalFullTasksList.filter(t => t?.id && !String(t.id).startsWith('ts_') && !(t as any)._isVirtualSummary);
  await commitImportedStateToStoreAndLocal(hydratedRealTasks, finalTasksToSave, touchedProjectsForPersistence, finalAffectedProjects);

  const { writeOps: projectWriteOps, projDeltaItems } = buildAffectedProjectsSyncOps(finalAffectedProjects, computedByProjectId, commitNowIso);
  await batchSaveTasksToFirestore(finalTasksToSave, activeUser, { precomputedDelegations, projectWriteOps, projectDeltaItems: projDeltaItems });

  if (finalTasksToSave.length > 0) {
    const prevTasksList = Array.from(previousStates.values());
    const createdIdsList = Array.from(newIds);
    const createdDelegations = precomputedDelegations?.newDelegations || [];
    undoManager.push({
      description: `Import Tasks (${finalTasksToSave.length} items)`,
      revert: async () => {
        const { restoreTasksSnapshot } = await import('../../lib/undoStateHelpers');
        await restoreTasksSnapshot({ tasksToRestore: prevTasksList, taskIdsToDelete: createdIdsList, delegationIdsToDelete: createdDelegations.map(d => d.id) });
      },
      redo: async () => {
        const { restoreTasksSnapshot } = await import('../../lib/undoStateHelpers');
        await restoreTasksSnapshot({ tasksToRestore: finalTasksToSave, delegationsToRestore: createdDelegations });
      },
    });
  }
  return { count: tasksToImport.length, projectCount: finalAffectedProjects.length };
}
