import { Task, Project } from '../types';
import { parseDateTime, formatToDatetimeLocal } from './utils';

export function getPredecessorCodeUpdates(oldTaskNoMap: Map<string, Task[]>, newTaskNoMap: Map<string, Task[]>, projects: Project[], newTasks: Task[]): Map<string, string> {
  const oldCodeToNewCode = new Map<string, string>();
  const taskIdToOldCode = new Map<string, string>();
  for (const [code, groupTasks] of oldTaskNoMap.entries()) {
      groupTasks.forEach(t => taskIdToOldCode.set(t.id, code));
  }
  for (const [code, groupTasks] of newTaskNoMap.entries()) {
      groupTasks.forEach(t => {
          const oldCode = taskIdToOldCode.get(t.id);
          if (oldCode && oldCode !== code) {
              oldCodeToNewCode.set(oldCode, code);
          }
      });
  }
  return oldCodeToNewCode;
}

/**
 * Splits a predecessor string into individual predecessor tokens (up to 2 in standard Gantt),
 * correctly preserving task codes that contain commas (e.g. "L1,L2-01", "HCM,HN-01", or "101,102-1").
 */
export function splitPredecessors(
  predecessorString: string | undefined | null,
  knownCodes?: Iterable<string> | Map<string, any> | Set<string>
): string[] {
  if (!predecessorString || typeof predecessorString !== 'string') return [];
  const raw = predecessorString.trim();
  if (!raw) return [];

  // If there are no commas at all, it's definitely a single token
  if (!raw.includes(',')) return [raw];

  // Extract known codes
  let codeList: string[] = [];
  if (knownCodes) {
    if (knownCodes instanceof Map) {
      codeList = Array.from(knownCodes.keys());
    } else {
      codeList = Array.from(knownCodes);
    }
  }
  // Normalize & sort descending by length so longer codes (e.g. "l1,l2-01") match before sub-parts
  codeList = codeList
    .map(c => String(c).trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lowerRaw = raw.toLowerCase();

  // 1. If we have known codes, try to match the first predecessor from the start of raw
  if (codeList.length > 0) {
    for (const code of codeList) {
      if (lowerRaw.startsWith(code)) {
        const afterCode = lowerRaw.substring(code.length);
        // Valid successor after code: optional relation (FS|SS|FF|SF), optional lag ([+-]number), optional whitespace
        const matchRelLag = afterCode.match(/^(\s*(?:fs|ss|ff|sf))?(\s*[+-]\s*\d+(?:\.\d+)?)?/i);
        const relLagLen = matchRelLag ? matchRelLag[0].length : 0;
        const afterRel = afterCode.substring(relLagLen).trimStart();

        // If it's the entire string, it's a single predecessor
        if (afterRel.length === 0) {
          return [raw];
        }

        // If followed by a comma, that comma is the delimiter between predecessors!
        if (afterRel.startsWith(',')) {
          const firstToken = raw.substring(0, code.length + relLagLen).trim();
          const remainderAfterComma = raw.substring(code.length + relLagLen).replace(/^\s*,\s*/, '').trim();
          if (remainderAfterComma) {
            const secondTokens = splitPredecessors(remainderAfterComma, codeList);
            return [firstToken, ...secondTokens];
          }
          return [firstToken];
        }
      }
    }
  }

  // 2. Identify indices of commas that belong to any known code containing commas
  const protectedCommaIndices = new Set<number>();
  for (const code of codeList) {
    if (code.includes(',')) {
      let searchIdx = 0;
      while ((searchIdx = lowerRaw.indexOf(code, searchIdx)) !== -1) {
        let commaPos = 0;
        while ((commaPos = code.indexOf(',', commaPos)) !== -1) {
          protectedCommaIndices.add(searchIdx + commaPos);
          commaPos++;
        }
        searchIdx += code.length;
      }
    }
  }

  // 3. Fallback: Split at unprotected commas
  const tokens: string[] = [];
  let currentStart = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === ',' && !protectedCommaIndices.has(i)) {
      const segment = raw.substring(currentStart, i).trim();
      if (segment) {
        tokens.push(segment);
      }
      currentStart = i + 1;
    }
  }
  const lastSegment = raw.substring(currentStart).trim();
  if (lastSegment) {
    tokens.push(lastSegment);
  }

  return tokens.length > 0 ? tokens : [raw];
}

export function updatePredecessorsStrings(
  oldCodeToNewCode: Map<string, string>, 
  allTasks: Task[],
  projects?: Project[]
): {id: string, predecessor: string, updatedAt: string}[] {
  const updates: {id: string, predecessor: string, updatedAt: string}[] = [];
  if (!oldCodeToNewCode || oldCodeToNewCode.size === 0) return updates;
  
  // Normalize oldCodeToNewCode keys to lowercase for safe matching
  const normalizedMap = new Map<string, string>();
  for (const [k, v] of oldCodeToNewCode.entries()) {
    if (k && v) {
      normalizedMap.set(k.trim().toLowerCase(), v.trim());
    }
  }

  if (normalizedMap.size === 0) return updates;

  // Build comprehensive set of known codes so commas inside them are protected
  const knownCodes = new Set<string>();
  for (const k of normalizedMap.keys()) knownCodes.add(k);
  for (const v of normalizedMap.values()) knownCodes.add(v.toLowerCase());
  allTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.toLowerCase());
    if (t.projectCode && projects) {
      const c = computeTaskCode(projects, allTasks, t);
      if (c) knownCodes.add(c.toLowerCase());
    }
  });

  allTasks.forEach(t => {
      if (!t.predecessor) return;
      const preds = splitPredecessors(t.predecessor, knownCodes);
      let changed = false;
      const newPreds = preds.map(pMatches => {
          const lowerMatches = pMatches.toLowerCase();
          let longestMatch = "";
          for (const oldCode of normalizedMap.keys()) {
            if (lowerMatches.startsWith(oldCode) && oldCode.length > longestMatch.length) {
              const remainder = lowerMatches.substring(oldCode.length);
              if (remainder.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s*\d|$)/i.test(remainder)) {
                longestMatch = oldCode;
              }
            }
          }
          if (longestMatch) {
            const newCode = normalizedMap.get(longestMatch)!;
            if (newCode.toLowerCase() !== longestMatch) {
              changed = true;
              let replacementCode = newCode;
              const originalMatchStr = pMatches.substring(0, longestMatch.length);
              if (originalMatchStr === originalMatchStr.toUpperCase()) {
                replacementCode = replacementCode.toUpperCase();
              }
              return replacementCode + pMatches.substring(longestMatch.length);
            }
          }
          return pMatches;
      });

      if (changed) {
          updates.push({
              id: t.id,
              predecessor: newPreds.join(', '),
              updatedAt: new Date().toISOString()
          });
      }
  });

  return updates;
}

/**
 * Calculates task updates and predecessor cascades when a Project's code (or year/store) is changed.
 * This guarantees that both:
 * 1. The project's tasks' codes (e.g. A-1 -> B-1) are synchronized.
 * 2. All predecessor references across the entire database (both internal and external projects)
 *    are automatically cascaded and rewritten to point to the new code.
 */
export function getProjectCodeChangePredecessorUpdates(
  oldProject: Project,
  newCode: string,
  newYear: number | string | undefined,
  newStore: string | undefined,
  allTasks: Task[],
  projects: Project[]
): {
  oldCodeToNewCode: Map<string, string>;
  taskUpdates: Map<string, { taskCodePhu?: string; projectCode: string; projectYear?: number; projectStore?: string }>;
  predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[];
} {
  const oldCodeToNewCode = new Map<string, string>();
  const taskUpdates = new Map<string, { taskCodePhu?: string; projectCode: string; projectYear?: number; projectStore?: string }>();

  const oldPCode = String(oldProject.code || '').trim();
  const newPCode = String(newCode || '').trim();
  const oldYear = oldProject.year;
  const oldStore = oldProject.store;

  const yearNum = (newYear !== undefined && newYear !== null && !isNaN(Number(newYear))) 
    ? Number(newYear) 
    : (oldYear !== undefined && !isNaN(Number(oldYear)) ? Number(oldYear) : undefined);

  // Identify all tasks belonging to the old project
  const relatedTasks = allTasks.filter(t => {
    const matchesCode = String(t.projectCode || '').trim().toLowerCase() === oldPCode.toLowerCase();
    const matchesYear = !t.projectYear || !oldYear || String(t.projectYear) === String(oldYear);
    const matchesStore = !t.projectStore || !oldStore || String(t.projectStore) === String(oldStore);
    return matchesCode && matchesYear && matchesStore;
  });

  const sortedTasks = sortGroupTasks(relatedTasks);

  sortedTasks.forEach((t, i) => {
    const order = (t.orderIndex !== undefined ? t.orderIndex : i) + 1;
    const defaultOldCode = `${oldPCode}-${order}`;
    const defaultNewCode = `${newPCode}-${order}`;

    // Standard numbered code mapping (e.g., A-1 -> B-1)
    oldCodeToNewCode.set(defaultOldCode.toLowerCase(), defaultNewCode);

    let newTaskCodePhu: string | undefined = undefined;

    if (t.taskCodePhu && t.taskCodePhu.trim()) {
      const trimmedPhu = t.taskCodePhu.trim();
      const lowerPhu = trimmedPhu.toLowerCase();
      const lowerOldPCode = oldPCode.toLowerCase();

      if (lowerPhu.startsWith(lowerOldPCode + '-')) {
        // e.g. "L3-101-1" -> "L3-202-1"
        const suffix = trimmedPhu.substring(oldPCode.length);
        newTaskCodePhu = `${newPCode}${suffix}`;
        oldCodeToNewCode.set(lowerPhu, newTaskCodePhu);
      } else if (lowerPhu === lowerOldPCode) {
        newTaskCodePhu = newPCode;
        oldCodeToNewCode.set(lowerPhu, newTaskCodePhu);
      } else {
        // Custom taskCodePhu without old project prefix
        oldCodeToNewCode.set(defaultOldCode.toLowerCase(), defaultNewCode);
      }
    } else {
      // taskCodePhu is not set explicitly; it computes to defaultNewCode
      oldCodeToNewCode.set(defaultOldCode.toLowerCase(), defaultNewCode);
    }

    // Check computed task code
    const computedOld = computeTaskCode(projects, allTasks, t);
    if (computedOld && computedOld.trim()) {
      const trimmedComputed = computedOld.trim();
      const lowerComputed = trimmedComputed.toLowerCase();
      if (!oldCodeToNewCode.has(lowerComputed)) {
        if (lowerComputed.startsWith(oldPCode.toLowerCase() + '-')) {
          const suffix = trimmedComputed.substring(oldPCode.length);
          oldCodeToNewCode.set(lowerComputed, `${newPCode}${suffix}`);
        } else {
          oldCodeToNewCode.set(lowerComputed, defaultNewCode);
        }
      }
    }

    taskUpdates.set(t.id, {
      projectCode: newPCode,
      ...(yearNum !== undefined ? { projectYear: yearNum } : {}),
      ...(newStore ? { projectStore: newStore } : {}),
      ...(newTaskCodePhu ? { taskCodePhu: newTaskCodePhu } : {})
    });
  });

  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, allTasks, projects);

  return {
    oldCodeToNewCode,
    taskUpdates,
    predecessorUpdates
  };
}

export function sortGroupTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    const valAOrder = a.orderIndex !== undefined ? a.orderIndex : 0;
    const valBOrder = b.orderIndex !== undefined ? b.orderIndex : 0;
    
    if (valAOrder === valBOrder) {
      // Fallback to stable sorting using id
      return String(a.id || '').localeCompare(String(b.id || ''));
    }
    return valAOrder - valBOrder;
  });
}

export function buildTaskNoMap(projects: Project[], tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  const tasksByProjectCode = new Map<string, Task[]>();
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  for (const t of safeTasks) {
    if (!t) continue;
    const code = String(t.projectCode || '').trim().toLowerCase();
    let arr = tasksByProjectCode.get(code);
    if (!arr) {
      arr = [];
      tasksByProjectCode.set(code, arr);
    }
    arr.push(t);
  }

  safeProjects.forEach((p) => {
    if (!p) return;
    const pCode = String(p.code || '').trim().toLowerCase();
    const pTasks = tasksByProjectCode.get(pCode) || [];
    const groupTasks = sortGroupTasks(pTasks.filter(t => 
       t &&
       (p.year ? String(t.projectYear || '') === String(p.year) : true) &&
       (p.store ? String(t.projectStore || '') === String(p.store) : true)
    ));
    groupTasks.forEach((t, i) => {
      if (!t) return;
      const code = String(t.taskCodePhu || `${p.code || ''}-${i + 1}`).toLowerCase();
      const existing = map.get(code) || [];
      existing.push(t);
      map.set(code, existing);
    });
  });
  return map;
}

export function computeTaskCode(projects: Project[], tasks: Task[], task: Task): string {
  if (!task || !projects || !Array.isArray(projects) || !tasks || !Array.isArray(tasks)) return '';
  if (task.taskCodePhu) return task.taskCodePhu;
  const p = projects.find(proj => 
     proj && proj.code && task.projectCode &&
     String(proj.code).trim().toLowerCase() === String(task.projectCode).trim().toLowerCase() && 
     (proj.year ? String(task.projectYear || '').trim().toLowerCase() === String(proj.year).trim().toLowerCase() : true) &&
    (proj.store ? String(task.projectStore || '').trim().toLowerCase() === String(proj.store).trim().toLowerCase() : true)
  );
  if (!p) return '';
  const groupTasks = sortGroupTasks((tasks || []).filter(t => 
     t && t.projectCode && p.code &&
     String(t.projectCode).trim().toLowerCase() === String(p.code).trim().toLowerCase() && 
     (p.year ? String(t.projectYear || '').trim().toLowerCase() === String(p.year).trim().toLowerCase() : true) &&
    (p.store ? String(t.projectStore || '').trim().toLowerCase() === String(p.store).trim().toLowerCase() : true)
  ));
  const i = groupTasks.findIndex(t => t.id === task.id);
  if (i === -1) return '';
  return `${p.code}-${i + 1}`;
}

export function parsePredecessors(predecessorString: string, taskNoMap: Map<string, Task[]>, contextTask?: Task) {
  if (!predecessorString) return [];
  const preds = splitPredecessors(predecessorString, taskNoMap);
  return preds.map(pMatches => {
    const lowerMatches = pMatches.toLowerCase();
    let longestMatch = "";
    for (const code of taskNoMap.keys()) {
      if (lowerMatches.startsWith(code) && code.length > longestMatch.length) {
        const remainderCheck = lowerMatches.substring(code.length);
        if (remainderCheck.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
          longestMatch = code;
        }
      }
    }

    // Smart fallback 1: if input started with '1' instead of 'l' (common OCR/typing confusion like 11-113-3-2 for l1-113-3-2)
    if (!longestMatch && /^1/.test(lowerMatches)) {
      const fixedLower = 'l' + lowerMatches.substring(1);
      for (const code of taskNoMap.keys()) {
        if (fixedLower.startsWith(code) && code.length > longestMatch.length) {
          const remainderCheck = fixedLower.substring(code.length);
          if (remainderCheck.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
            longestMatch = code;
          }
        }
      }
    }

    // Smart fallback 2: short sub-task index within current project (e.g. "2", "-2", "#2")
    if (!longestMatch && contextTask && contextTask.projectCode) {
      const shortMatch = lowerMatches.match(/^[-#\s]*(\d+)(.*)$/);
      if (shortMatch) {
        const subIndex = shortMatch[1];
        const candidateCode = `${String(contextTask.projectCode).trim().toLowerCase()}-${subIndex}`;
        if (taskNoMap.has(candidateCode)) {
          longestMatch = candidateCode;
        }
      }
    }

    // Smart fallback 3: legacy project code prefix or partial project code (e.g. "l1-115-13" when project is "L1-115, L1-113")
    if (!longestMatch && contextTask && contextTask.projectCode) {
      const matchPrefixAndIndex = lowerMatches.match(/^(.+?)[-_\s]+(\d+)(.*)$/);
      if (matchPrefixAndIndex) {
        const candidatePrefix = matchPrefixAndIndex[1].trim();
        const subIndex = matchPrefixAndIndex[2];
        const currentPCode = String(contextTask.projectCode).trim().toLowerCase();
        
        // Split current project code by comma/slash in case of combined project codes like "l1-115, l1-113"
        const pCodeParts = currentPCode.split(/[,/]+/).map(p => p.trim()).filter(Boolean);
        const matchesPart = pCodeParts.some(part => part === candidatePrefix || part.startsWith(candidatePrefix) || candidatePrefix.startsWith(part));
        
        if (matchesPart) {
          const candidateCode = `${currentPCode}-${subIndex}`;
          if (taskNoMap.has(candidateCode)) {
            longestMatch = candidateCode;
          }
        }
      }
    }

    if (longestMatch) {
      // Find remainder from either pMatches or matched code
      let remainder = "";
      if (lowerMatches.startsWith(longestMatch)) {
        remainder = pMatches.substring(longestMatch.length).trim();
      } else {
        // Fallback matched through replacement or short index
        const cleaned = pMatches.replace(/^[-#\s]*\d+/, '').replace(/^11-/, '').trim();
        remainder = cleaned;
      }

      let type = 'FS';
      let lagSign = '+';
      let lagValue = 0;

      if (remainder) {
        const remainderMatch = remainder.match(/^(FS|SS|FF|SF)?\s*(?:([+-])?\s*(\d+(?:\.\d+)?))?\s*$/i);
        if (remainderMatch) {
          if (remainderMatch[1]) type = remainderMatch[1].toUpperCase();
          if (remainderMatch[2]) lagSign = remainderMatch[2];
          if (remainderMatch[3]) lagValue = parseFloat(remainderMatch[3]);
        }
      }
      
      const possibleTasks = taskNoMap.get(longestMatch);
      let resolvedTask;
      if (possibleTasks) {
        if (contextTask) {
           resolvedTask = possibleTasks.find(t => 
             t &&
             String(t.projectCode || '').trim().toLowerCase() === String(contextTask.projectCode || '').trim().toLowerCase() && 
             String(t.projectYear || '').trim().toLowerCase() === String(contextTask.projectYear || '').trim().toLowerCase() && 
             String(t.projectStore || '').trim().toLowerCase() === String(contextTask.projectStore || '').trim().toLowerCase()
           );
        }
        if (!resolvedTask) resolvedTask = possibleTasks[0];
      }

      return {
        no: longestMatch,
        type,
        lagSign,
        lagValue,
        task: resolvedTask
      };
    }
    return null;
  }).filter(Boolean);
}

export function addDays(dateStr: string, days: number): string {
  const s = parseDateTime(dateStr);
  if (!s || isNaN(s.getTime())) return dateStr;
  const f = new Date(s.getTime() + days * 24 * 60 * 60 * 1000);
  return formatToDatetimeLocal(f);
}

export interface PredecessorCalculationResult {
  start: string;
  finish: string;
  duration: string;
  durationManual: boolean;
}

export function calculateTaskDatesFromPredecessors(
  currentTask: {
    id?: string;
    start?: string;
    finish?: string;
    duration?: string;
    durationManual?: boolean;
  },
  parsedPreds: Array<{
    type: string;
    lagSign: string;
    lagValue: number;
    task?: { id?: string; start?: string; finish?: string } | null;
  }>,
  getTaskById?: (id: string) => { start?: string; finish?: string } | undefined
): PredecessorCalculationResult | null {
  if (!parsedPreds || parsedPreds.length === 0) return null;

  let maxStartConstraintMs = -1;
  let maxStartConstraintStr = "";

  let maxFinishConstraintMs = -1;
  let maxFinishConstraintStr = "";

  let hasValidPred = false;

  for (const pred of parsedPreds) {
    if (!pred || !pred.task) continue;
    const ptId = pred.task.id || "";
    const pt = (getTaskById && ptId ? getTaskById(ptId) : null) || pred.task;
    if (!pt || !pt.start || !pt.finish) continue;

    hasValidPred = true;
    const lagDays = pred.lagValue * (pred.lagSign === '-' ? -1 : 1);

    if (pred.type === 'FS') {
      const s = addDays(pt.finish, lagDays);
      const ms = parseDateTime(s)?.getTime() || -1;
      if (ms > maxStartConstraintMs) {
        maxStartConstraintMs = ms;
        maxStartConstraintStr = s;
      }
    } else if (pred.type === 'SS') {
      const s = addDays(pt.start, lagDays);
      const ms = parseDateTime(s)?.getTime() || -1;
      if (ms > maxStartConstraintMs) {
        maxStartConstraintMs = ms;
        maxStartConstraintStr = s;
      }
    } else if (pred.type === 'FF') {
      const f = addDays(pt.finish, lagDays);
      const ms = parseDateTime(f)?.getTime() || -1;
      if (ms > maxFinishConstraintMs) {
        maxFinishConstraintMs = ms;
        maxFinishConstraintStr = f;
      }
    } else if (pred.type === 'SF') {
      const f = addDays(pt.start, lagDays);
      const ms = parseDateTime(f)?.getTime() || -1;
      if (ms > maxFinishConstraintMs) {
        maxFinishConstraintMs = ms;
        maxFinishConstraintStr = f;
      }
    }
  }

  if (!hasValidPred) return null;

  const hasStartConstraint = maxStartConstraintMs !== -1;
  const hasFinishConstraint = maxFinishConstraintMs !== -1;

  if (!hasStartConstraint && !hasFinishConstraint) return null;

  const currentDurationNum = parseFloat(String(currentTask.duration || "0"));
  const safeDuration = isNaN(currentDurationNum) || currentDurationNum < 0 ? 0 : currentDurationNum;

  // Case 1: Both Start Constraint and Finish Constraint exist (e.g. Pred 1 is FS/SS, Pred 2 is FF/SF)
  if (hasStartConstraint && hasFinishConstraint) {
    const newStart = maxStartConstraintStr;
    let newFinish = maxFinishConstraintStr;
    const startMs = maxStartConstraintMs;
    const finishMs = maxFinishConstraintMs;
    let diffDays = (finishMs - startMs) / (1000 * 60 * 60 * 24);
    let newDuration = "0";

    if (diffDays >= 0) {
      newDuration = String(Number(diffDays.toFixed(2)));
    } else {
      newFinish = newStart;
      newDuration = "0";
    }

    return {
      start: newStart,
      finish: newFinish,
      duration: newDuration,
      durationManual: false
    };
  }

  // Case 2: Only Start Constraint exists (FS/SS)
  if (hasStartConstraint && !hasFinishConstraint) {
    const newStart = maxStartConstraintStr;
    const newFinish = addDays(newStart, safeDuration);
    return {
      start: newStart,
      finish: newFinish,
      duration: String(safeDuration),
      durationManual: currentTask.durationManual ?? true
    };
  }

  // Case 3: Only Finish Constraint exists (FF/SF)
  if (!hasStartConstraint && hasFinishConstraint) {
    const newFinish = maxFinishConstraintStr;
    let newStart = "";
    let newDuration = String(safeDuration);
    let durationManual = currentTask.durationManual ?? false;

    if (currentTask.durationManual) {
      newStart = addDays(newFinish, -safeDuration);
    } else if (currentTask.start) {
      newStart = currentTask.start;
      const startMs = parseDateTime(newStart)?.getTime() || -1;
      const finishMs = maxFinishConstraintMs;
      if (startMs !== -1) {
        const diffDays = (finishMs - startMs) / (1000 * 60 * 60 * 24);
        newDuration = String(diffDays >= 0 ? Number(diffDays.toFixed(2)) : 0);
      } else {
        newStart = addDays(newFinish, -safeDuration);
      }
    } else {
      newStart = addDays(newFinish, -safeDuration);
    }

    return {
      start: newStart,
      finish: newFinish,
      duration: newDuration,
      durationManual
    };
  }

  return null;
}

export function scheduleDependentTasks(updatedTask: Task, allTasks: Task[], projects: Project[]): Task[] {
  let mergedTasks = allTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
  if (!allTasks.some(t => t.id === updatedTask.id)) {
    mergedTasks.push(updatedTask);
  }
  const taskNoMap = buildTaskNoMap(projects, mergedTasks);
  const taskParsedPreds = new Map<string, any[]>();
  const dependencyGraph = new Map<string, string[]>();

  mergedTasks.forEach(tsk => {
    if (tsk.predecessor) {
      const parsed = parsePredecessors(tsk.predecessor, taskNoMap, tsk);
      
      if (parsed.length > 0) {
        taskParsedPreds.set(tsk.id, parsed);
        parsed.forEach(pred => {
          const predTask = pred?.task;
          if (predTask) {
            const deps = dependencyGraph.get(predTask.id) || [];
            deps.push(tsk.id);
            dependencyGraph.set(predTask.id, deps);
          }
        });
      }
    }
  });

  const queue: string[] = [];
  const processed = new Set<string>();
  const updatesToApply = new Map<string, Task>();
  const currentStates = new Map<string, Task>();
  
  mergedTasks.forEach(tsk => currentStates.set(tsk.id, tsk));
  currentStates.set(updatedTask.id, updatedTask);

  const updatedTaskPreds = taskParsedPreds.get(updatedTask.id) || [];
  updatedTaskPreds.forEach(pred => {
    if (pred) {
      const predTask = pred.task;
      if (predTask) queue.push(predTask.id);
    }
  });
  queue.push(updatedTask.id);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (processed.has(currentId)) continue;
    processed.add(currentId);

    const dependents = dependencyGraph.get(currentId) || [];
    
    dependents.forEach(depId => {
      const depTask = currentStates.get(depId)!;
      const preds = taskParsedPreds.get(depId) || [];
      
      const isFlexible = Boolean(depTask.predecessor?.trim());

      if (depTask.approval === "Approved" || (depTask as any)._isAutoActualized || !isFlexible) {
        return;
      }

      const calcResult = calculateTaskDatesFromPredecessors(
        depTask,
        preds,
        (id) => currentStates.get(id)
      );

      if (calcResult) {
        const { start: newStart, finish: newFinish, duration: newDuration, durationManual: newDurationManual } = calcResult;
        if (newStart !== depTask.start || newFinish !== depTask.finish || newDuration !== depTask.duration || newDurationManual !== depTask.durationManual) {
           const updatedDepTask = { 
             ...depTask, 
             start: newStart, 
             finish: newFinish,
             duration: newDuration,
             durationManual: newDurationManual,
             ...(depTask.realtimeUpdate === undefined && Boolean(depTask.predecessor?.trim()) ? { realtimeUpdate: true } : {})
           };
           currentStates.set(depId, updatedDepTask);
           updatesToApply.set(depId, updatedDepTask);
           queue.push(depId);
        }
      }
    });
  }

  return Array.from(updatesToApply.values());
}

export interface ReorderCalculationResult {
  groupTasks: Task[];
  allUpdatedTasks: Task[];
  taskUpdates: { id: string; updates: Partial<Task> }[];
  predecessorUpdates: { id: string; predecessor: string; updatedAt: string }[];
}

export function reorderAndCalculateTasks(
  allTasks: Task[],
  projects: Project[],
  targetProject: Project,
  tasksToMoveIds: string[],
  targetTaskId: string,
  position: 'before' | 'after'
): ReorderCalculationResult | null {
  if (!tasksToMoveIds.length) return null;
  if (tasksToMoveIds.length === 1 && tasksToMoveIds[0] === targetTaskId) return null;

  const targetPrjCode = targetProject.code;
  const targetPrjYear = targetProject.year || "";
  const targetPrjStore = targetProject.store || "";

  // Group tasks in the target project sorted by orderIndex
  const currentProjectTasks = sortGroupTasks(
    allTasks.filter(t =>
      String(t.projectCode || "").trim().toLowerCase() === String(targetPrjCode).trim().toLowerCase() &&
      (targetPrjYear ? String(t.projectYear || "").trim().toLowerCase() === String(targetPrjYear).trim().toLowerCase() : true) &&
      (targetPrjStore ? String(t.projectStore || "").trim().toLowerCase() === String(targetPrjStore).trim().toLowerCase() : true)
    )
  );

  // Remove moved tasks from the target project list if they were already there
  const remaining = currentProjectTasks.filter(t => !tasksToMoveIds.includes(t.id));

  // Find targetTask insertion index in remaining
  let targetIndex = remaining.findIndex(t => t.id === targetTaskId);
  if (targetIndex === -1) {
    targetIndex = remaining.length;
  } else if (position === 'after') {
    targetIndex += 1;
  }

  // Get moved tasks, preserving their current relative orderIndex
  const movedTasks = allTasks.filter(t => tasksToMoveIds.includes(t.id));
  movedTasks.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

  // Insert moved tasks into the target position
  remaining.splice(targetIndex, 0, ...movedTasks);
  const reorderedGroupTasks = remaining;

  // Build taskUpdates
  const taskUpdates: { id: string; updates: Partial<Task> }[] = [];
  const now = new Date().toISOString();

  // Create a working clone of all tasks for predecessor calculation
  const newTasksMap = new Map<string, Task>();
  allTasks.forEach(t => newTasksMap.set(t.id, { ...t }));

  reorderedGroupTasks.forEach((t, idx) => {
    const newOrderIndex = idx;
    const newTaskCodePhu = `${targetPrjCode}-${idx + 1}`;
    const isMoved = tasksToMoveIds.includes(t.id);
    const hasOrderChanged = t.orderIndex !== newOrderIndex || t.taskCodePhu !== newTaskCodePhu;

    if (hasOrderChanged || isMoved) {
      const updates: Partial<Task> = {
        orderIndex: newOrderIndex,
        taskCodePhu: newTaskCodePhu,
        updatedAt: now,
      };
      if (isMoved) {
        updates.projectCode = targetPrjCode;
        updates.projectYear = targetPrjYear;
        updates.projectStore = targetPrjStore;
      }
      taskUpdates.push({ id: t.id, updates });

      const existing = newTasksMap.get(t.id);
      if (existing) {
        newTasksMap.set(t.id, { ...existing, ...updates });
      }
    }
  });

  const updatedAllTasks = Array.from(newTasksMap.values());

  // Compute predecessor updates
  const oldTaskNoMap = buildTaskNoMap(projects, allTasks);
  const newTaskNoMap = buildTaskNoMap(projects, updatedAllTasks);
  const oldCodeToNewCode = getPredecessorCodeUpdates(oldTaskNoMap, newTaskNoMap, projects, updatedAllTasks);
  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, updatedAllTasks, projects);

  // Merge any predecessor updates for tasks that are already in taskUpdates
  predecessorUpdates.forEach(pu => {
    const existing = taskUpdates.find(tu => tu.id === pu.id);
    if (existing) {
      existing.updates.predecessor = pu.predecessor;
    }
    const memTask = updatedAllTasks.find(t => t.id === pu.id);
    if (memTask) {
      memTask.predecessor = pu.predecessor;
      memTask.updatedAt = pu.updatedAt;
    }
  });

  return {
    groupTasks: reorderedGroupTasks,
    allUpdatedTasks: updatedAllTasks,
    taskUpdates,
    predecessorUpdates,
  };
}

/**
 * Normalizes and heals a task's predecessor string by resolving legacy, shortened,
 * or out-of-sync task codes (e.g. "L1-115-13" when the project code is "L1-115, L1-113"
 * and task #13 has the modern code "L1-115, L1-113-13").
 */
export function normalizeAndHealTaskPredecessors(
  task: Task,
  allTasks: Task[],
  projects: Project[]
): { changed: boolean; newPredecessor: string } {
  if (!task || !task.predecessor || typeof task.predecessor !== 'string' || !task.predecessor.trim()) {
    return { changed: false, newPredecessor: task?.predecessor || '' };
  }

  const taskNoMap = buildTaskNoMap(projects, allTasks);
  const knownCodes = new Set<string>();
  for (const k of taskNoMap.keys()) knownCodes.add(k.toLowerCase());
  allTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.toLowerCase());
  });

  const tokens = splitPredecessors(task.predecessor, knownCodes);
  let changed = false;

  const resolvedTokens = tokens.map(token => {
    const rawToken = token.trim();
    if (!rawToken) return token;

    // Check if token already matches an exact known task code
    const lowerToken = rawToken.toLowerCase();
    for (const code of taskNoMap.keys()) {
      if (lowerToken.startsWith(code)) {
        const remainder = lowerToken.substring(code.length);
        if (remainder.length === 0 || /^(fs|ss|ff|sf|\s*[+-]|\s+\d|$)/i.test(remainder)) {
          // Already valid and exact match
          return token;
        }
      }
    }

    // Attempt to extract <prefix>-<subIndex><lag> or <number><lag>
    let codePrefix = "";
    let subIndexNum: number | null = null;
    let lagSuffix = "";

    const matchPrefixAndIndex = rawToken.match(/^(.+?)[-_\s]+(\d+)(.*)$/);
    if (matchPrefixAndIndex) {
      codePrefix = matchPrefixAndIndex[1].trim();
      subIndexNum = parseInt(matchPrefixAndIndex[2], 10);
      lagSuffix = matchPrefixAndIndex[3] || "";
    } else {
      const matchNumberOnly = rawToken.match(/^[-#\s]*(\d+)(.*)$/);
      if (matchNumberOnly) {
        subIndexNum = parseInt(matchNumberOnly[1], 10);
        lagSuffix = matchNumberOnly[2] || "";
      }
    }

    if (subIndexNum !== null && !isNaN(subIndexNum)) {
      // 1. Try finding within current task's project
      const currentPCode = String(task.projectCode || '').trim();
      const currentPCodeLower = currentPCode.toLowerCase();
      const pCodeParts = currentPCodeLower.split(/[,/]+/).map(p => p.trim()).filter(Boolean);

      const isMatchingCurrentProject = !codePrefix || 
        codePrefix.toLowerCase() === currentPCodeLower ||
        pCodeParts.some(part => part === codePrefix.toLowerCase() || part.startsWith(codePrefix.toLowerCase()) || codePrefix.toLowerCase().startsWith(part));

      if (isMatchingCurrentProject) {
        const sameProjectTasks = sortGroupTasks(
          allTasks.filter(t => 
            t &&
            String(t.projectCode || '').trim().toLowerCase() === currentPCodeLower &&
            (task.projectYear ? String(t.projectYear || '') === String(task.projectYear) : true) &&
            (task.projectStore ? String(t.projectStore || '') === String(task.projectStore) : true)
          )
        );

        if (subIndexNum >= 1 && subIndexNum <= sameProjectTasks.length) {
          const targetTask = sameProjectTasks[subIndexNum - 1];
          const newCode = (targetTask.taskCodePhu || computeTaskCode(projects, allTasks, targetTask) || `${currentPCode}-${subIndexNum}`).trim();
          if (newCode) {
            changed = true;
            return `${newCode}${lagSuffix.trim()}`;
          }
        }
      }

      // 2. Try finding across other projects if codePrefix was specified
      if (codePrefix) {
        const lowerPrefix = codePrefix.toLowerCase();
        const matchedProj = projects.find(p => {
          if (!p || !p.code) return false;
          const pLower = p.code.toLowerCase();
          const parts = pLower.split(/[,/]+/).map(item => item.trim()).filter(Boolean);
          return pLower === lowerPrefix || parts.some(part => part === lowerPrefix || part.startsWith(lowerPrefix) || lowerPrefix.startsWith(part));
        });

        if (matchedProj) {
          const targetTasks = sortGroupTasks(
            allTasks.filter(t => 
              t &&
              String(t.projectCode || '').trim().toLowerCase() === String(matchedProj.code).trim().toLowerCase() &&
              (matchedProj.year ? String(t.projectYear || '') === String(matchedProj.year) : true) &&
              (matchedProj.store ? String(t.projectStore || '') === String(matchedProj.store) : true)
            )
          );
          if (subIndexNum >= 1 && subIndexNum <= targetTasks.length) {
            const targetTask = targetTasks[subIndexNum - 1];
            const newCode = (targetTask.taskCodePhu || computeTaskCode(projects, allTasks, targetTask) || `${matchedProj.code}-${subIndexNum}`).trim();
            if (newCode) {
              changed = true;
              return `${newCode}${lagSuffix.trim()}`;
            }
          }
        }
      }
    }

    return token;
  });

  return {
    changed,
    newPredecessor: resolvedTokens.join(', ')
  };
}

/**
 * Sweeps through all tasks and heals any out-of-sync or legacy predecessor codes.
 */
export function healAllTasksPredecessors(
  allTasks: Task[],
  projects: Project[]
): {
  updatedTasks: Task[];
  changedCount: number;
  updatesToSave: { id: string; predecessor: string; updatedAt: string }[];
} {
  const updatesToSave: { id: string; predecessor: string; updatedAt: string }[] = [];
  let changedCount = 0;

  const updatedTasks = allTasks.map(t => {
    if (!t.predecessor) return t;
    const { changed, newPredecessor } = normalizeAndHealTaskPredecessors(t, allTasks, projects);
    if (changed && newPredecessor !== t.predecessor) {
      changedCount++;
      const updatedAt = new Date().toISOString();
      updatesToSave.push({
        id: t.id,
        predecessor: newPredecessor,
        updatedAt
      });
      return {
        ...t,
        predecessor: newPredecessor,
        updatedAt
      };
    }
    return t;
  });

  return {
    updatedTasks,
    changedCount,
    updatesToSave
  };
}

