import { Task, Project } from '../types';
import { parseDateTime, formatToDatetimeLocal, isTaskBelongsToProject } from './utils';
import { useAppStore } from '../store/useAppStore';
import { parsePredecessorToken } from './predecessorMatchUtils';

export function getPredecessorCodeUpdates(oldTaskNoMap: Map<string, Task[]>, newTaskNoMap: Map<string, Task[]>, projects: Project[], newTasks: Task[]): Map<string, string> {
  const oldCodeToNewCode = new Map<string, string>();
  const taskIdToOldCodes = new Map<string, string[]>();

  for (const [code, groupTasks] of oldTaskNoMap.entries()) {
    groupTasks.forEach(t => {
      if (!t || !t.id) return;
      const list = taskIdToOldCodes.get(t.id) || [];
      if (!list.includes(code)) list.push(code);
      taskIdToOldCodes.set(t.id, list);
    });
  }

  const taskCodeMap = computeAllTaskCodes(projects, newTasks);

  newTasks.forEach(t => {
    if (!t || !t.id) return;
    const oldCodes = taskIdToOldCodes.get(t.id) || [];
    const newPrimaryCode = taskCodeMap.get(t.id) || t.taskCodePhu || (t.projectCode ? `${t.projectCode}#${(t.orderIndex ?? 0) + 1}` : t.id);

    if (newPrimaryCode) {
      oldCodes.forEach(oldCode => {
        if (
          oldCode &&
          oldCode.toLowerCase() !== newPrimaryCode.toLowerCase() &&
          oldCode.toLowerCase() !== t.id.toLowerCase()
        ) {
          oldCodeToNewCode.set(oldCode.toLowerCase(), newPrimaryCode);
        }
      });
    }
  });

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
  projects?: Project[],
  oldTaskNoMap?: Map<string, Task[]>
): {id: string, predecessor: string, updatedAt: string}[] {
  const updates: {id: string, predecessor: string, updatedAt: string}[] = [];
  if ((!oldCodeToNewCode || oldCodeToNewCode.size === 0) && !oldTaskNoMap) return updates;
  
  // Normalize oldCodeToNewCode keys to lowercase for safe matching
  const normalizedMap = new Map<string, string>();
  if (oldCodeToNewCode) {
    for (const [k, v] of oldCodeToNewCode.entries()) {
      if (k && v) {
        normalizedMap.set(k.trim().toLowerCase(), v.trim());
      }
    }
  }

  // Build taskIdToNewTask map for fast lookup
  const taskIdToNewTask = new Map<string, Task>();
  allTasks.forEach(t => {
    if (t && t.id) taskIdToNewTask.set(t.id, t);
  });

  // Build comprehensive set of known codes so commas inside them are protected
  const knownCodes = new Set<string>();
  for (const k of normalizedMap.keys()) knownCodes.add(k);
  for (const v of normalizedMap.values()) knownCodes.add(v.toLowerCase());
  if (oldTaskNoMap) {
    for (const k of oldTaskNoMap.keys()) knownCodes.add(k.toLowerCase());
  }
  allTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.toLowerCase());
    if (t.projectCode) knownCodes.add(t.projectCode.toLowerCase());
  });

  allTasks.forEach(t => {
    if (!t || !t.predecessor) return;
    const preds = splitPredecessors(t.predecessor, knownCodes);
    let changed = false;
    const newPreds = preds.map((pMatches, tokIdx) => {
      const trimmed = pMatches.trim();
      if (!trimmed) return pMatches;

      // 1. If oldTaskNoMap is provided, resolve target task before reorder via parsePredecessors (Absolute ID binding)
      if (oldTaskNoMap) {
        // Hard-link ID tính theo vị trí: đưa đúng ID của token này (không phải luôn là token đầu)
        const tokenCtx = { ...t, predecessorTaskIds: [(t.predecessorTaskIds || [])[tokIdx] || ''] } as Task;
        const parsed = parsePredecessors(trimmed, oldTaskNoMap, tokenCtx);
        if (parsed.length > 0 && parsed[0]?.task) {
          const targetTaskObj = parsed[0].task;
          const updatedTargetTask = taskIdToNewTask.get(targetTaskObj.id);
          if (updatedTargetTask) {
            const newPrimaryCode = updatedTargetTask.taskCodePhu || 
              (updatedTargetTask.projectCode ? `${updatedTargetTask.projectCode}#${(updatedTargetTask.orderIndex ?? 0) + 1}` : updatedTargetTask.id);

            // Lấy phần quan hệ/độ lệch (vd "SS", "FF+2") trực tiếp từ chính token.
            // Lưu ý: với predecessor gắn cứng, parsed[0].no là CẢ token (gồm cả "SS"/"+2")
            // nên không được dùng để đo độ dài của mã.
            let remainder = parsePredecessorToken(trimmed).suffix;
            const lowerMatches = trimmed.toLowerCase();
            if (!remainder) {
              if (parsed[0].no && lowerMatches.startsWith(parsed[0].no.toLowerCase()) && parsed[0].no.length < trimmed.length) {
                remainder = trimmed.substring(parsed[0].no.length);
              } else if (!(parsed[0].no && lowerMatches === parsed[0].no.toLowerCase())) {
                remainder = trimmed.replace(/^[-#\s]*\d+/, '').replace(/^[a-zA-Z0-9_-]+[-#]\d+/, '').trim();
              }
            }

            // Check if user originally wrote a short index (e.g. "2", "#2", "-2", "2FS+1") within same project
            const shortMatch = trimmed.match(/^([-#\s]*)(\d+)(.*)$/);
            const isSameProject = t.projectId && updatedTargetTask.projectId
              ? t.projectId === updatedTargetTask.projectId
              : (t.projectCode && updatedTargetTask.projectCode && 
                 String(t.projectCode).trim().toLowerCase() === String(updatedTargetTask.projectCode).trim().toLowerCase());

            if (shortMatch && isSameProject) {
              const prefixSymbol = shortMatch[1]; // e.g. "", "#", "-"
              const newSubtaskNum = (updatedTargetTask.orderIndex !== undefined ? updatedTargetTask.orderIndex : 0) + 1;
              const restSuffix = shortMatch[3]; // e.g. "FS+1"
              const reassembled = `${prefixSymbol}${newSubtaskNum}${restSuffix}`;
              if (reassembled !== trimmed) {
                changed = true;
                return reassembled;
              }
              return trimmed;
            } else {
              // Full project code format
              const reassembled = `${newPrimaryCode}${remainder}`;
              if (reassembled !== trimmed) {
                changed = true;
                return reassembled;
              }
              return trimmed;
            }
          }
        }
      }

      // 2. Fallback to string normalizedMap matching
      const lowerMatches = trimmed.toLowerCase();
      let longestMatch = "";
      for (const oldCode of normalizedMap.keys()) {
        if (lowerMatches.startsWith(oldCode) && oldCode.length > longestMatch.length) {
          const remainder = lowerMatches.substring(oldCode.length);
          if (remainder.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s*\d|$)/i.test(remainder)) {
            longestMatch = oldCode;
          }
        }
      }
      if (longestMatch) {
        const newCode = normalizedMap.get(longestMatch)!;
        if (newCode.toLowerCase() !== longestMatch) {
          changed = true;
          let replacementCode = newCode;
          const originalMatchStr = trimmed.substring(0, longestMatch.length);
          if (originalMatchStr === originalMatchStr.toUpperCase()) {
            replacementCode = replacementCode.toUpperCase();
          }
          return replacementCode + trimmed.substring(longestMatch.length);
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
    // Ép tuyệt đối sử dụng dấu # thay vì dấu -
    const defaultOldCode = `${oldPCode}#${order}`;
    const defaultNewCode = `${newPCode}#${order}`;
    
    oldCodeToNewCode.set(defaultOldCode.toLowerCase(), defaultNewCode);

    let newTaskCodePhu: string | undefined = undefined;

    // Luôn ép newTaskCodePhu theo chuẩn ProjectCode#Index
    newTaskCodePhu = `${newPCode}#${order}`;
    
    if (t.taskCodePhu && t.taskCodePhu.trim()) {
      const lowerPhu = t.taskCodePhu.trim().toLowerCase();
      oldCodeToNewCode.set(lowerPhu, newTaskCodePhu);
    }

    taskUpdates.set(t.id, {
      projectCode: newPCode,
      ...(yearNum !== undefined ? { projectYear: yearNum } : {}),
      ...(newStore ? { projectStore: newStore } : {}),
      taskCodePhu: newTaskCodePhu // Ghi đè tuyệt đối giá trị mới
    });
  });

  const predecessorUpdates = updatePredecessorsStrings(oldCodeToNewCode, allTasks, projects);

  return {
    oldCodeToNewCode,
    taskUpdates,
    predecessorUpdates
  };
}

/**
 * Extracts a numeric subtask index from any taskCodePhu representation.
 * Supports "#13", "L3-304#13", "L3-304-13", "CP-01-2", "HN-TKV-SMZ2-85", "Task 13", "13", etc.
 */
export function extractSubtaskIndex(codeOrPhu?: string | null): number | null {
  if (!codeOrPhu) return null;
  const str = String(codeOrPhu).trim();
  if (!str) return null;

  // 1. Check for '#' followed by digits (e.g., "L3-304#13", "#13", "HN-L3-304#1")
  const hashMatch = str.match(/#\s*(\d+)/);
  if (hashMatch) {
    const num = parseInt(hashMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. Check for delimiter (- _ . : /) followed by digits at the end (e.g., "L3-304-13", "CP-01-2", "HN-TKV-SMZ2-85", "B2-B208-1", "L3-304.13")
  const delimiterMatch = str.match(/[-_.:/\s]+(\d+)\s*$/);
  if (delimiterMatch) {
    const num = parseInt(delimiterMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 3. Check if pure numeric string (e.g., "1", "13", "05")
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    if (!isNaN(num)) return num;
  }

  // 4. Check for 'Task' or 'Step' or 'No' or 'T' prefix (e.g. "Task 1", "T-13", "No. 5")
  const prefixMatch = str.match(/(?:task|step|no\.?|t)\s*[-#.:]?\s*(\d+)/i);
  if (prefixMatch) {
    const num = parseInt(prefixMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 5. Fallback: match any trailing number at end of string
  const trailingDigitsMatch = str.match(/(\d+)\s*$/);
  if (trailingDigitsMatch) {
    const num = parseInt(trailingDigitsMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  return null;
}

export function sortGroupTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;

    // 1. Prioritize orderIndex if explicitly assigned (0, 1, 2, 3...)
    const valAOrder = a.orderIndex !== undefined && a.orderIndex !== null ? Number(a.orderIndex) : null;
    const valBOrder = b.orderIndex !== undefined && b.orderIndex !== null ? Number(b.orderIndex) : null;

    if (valAOrder !== null && valBOrder !== null && valAOrder !== valBOrder) {
      return valAOrder - valBOrder;
    }
    if (valAOrder !== null && valBOrder === null) return -1;
    if (valAOrder === null && valBOrder !== null) return 1;

    // 2. Prioritize natural subtask index extracted from taskCodePhu (e.g. #1, -1, #13, -13)
    const codeA = a.taskCodePhu || (a.projectCode && a.orderIndex !== undefined ? `${a.projectCode}#${a.orderIndex + 1}` : a.name || '');
    const codeB = b.taskCodePhu || (b.projectCode && b.orderIndex !== undefined ? `${b.projectCode}#${b.orderIndex + 1}` : b.name || '');
    const numA = extractSubtaskIndex(codeA);
    const numB = extractSubtaskIndex(codeB);

    if (numA !== null && numB !== null) {
      if (numA !== numB) return numA - numB;
    } else if (numA !== null && numB === null) {
      return -1;
    } else if (numA === null && numB !== null) {
      return 1;
    }

    // 3. If both have taskCodePhu without single trailing number, compare with natural alphanumeric sort
    if (codeA && codeB && codeA !== codeB) {
      const codeCmp = codeA.localeCompare(codeB, undefined, { numeric: true, sensitivity: 'base' });
      if (codeCmp !== 0) return codeCmp;
    }

    // 4. Chronological sort by Start Date (e.g., Jul 12 < Jul 15 < Jul 31 < Oct 29 < Nov 15 < Jan 1)
    const startA = a.start || '';
    const startB = b.start || '';
    if (startA && startB && startA !== startB) {
      return startA.localeCompare(startB);
    }
    const finishA = a.finish || '';
    const finishB = b.finish || '';
    if (finishA && finishB && finishA !== finishB) {
      return finishA.localeCompare(finishB);
    }

    // 5. Stable sort using name (natural) and then id
    const nameA = a.name || '';
    const nameB = b.name || '';
    if (nameA && nameB && nameA !== nameB) {
      const nameCmp = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      if (nameCmp !== 0) return nameCmp;
    }

    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

/**
 * Sorts tasks prioritizing predecessor dependency relationships and computed dates.
 * If Task B depends on Task A, Task A will always be positioned before Task B.
 */
export function sortTasksByPredecessorsAndDates(
  groupTasks: Task[], 
  projects: Project[] = [], 
  allTasks: Task[] = []
): Task[] {
  if (!Array.isArray(groupTasks) || groupTasks.length <= 1) return groupTasks || [];
  
  const pool = groupTasks.length > 0 ? groupTasks : (allTasks.length > 0 ? allTasks : []);
  const taskNoMap = buildTaskNoMap(projects, pool);
  const taskMap = new Map<string, Task>();
  groupTasks.forEach(t => { if (t && t.id) taskMap.set(t.id, t); });

  // Directed graph: adjMap[u] = list of tasks v that depend on u (u -> v)
  // Undirected graph: undirectedAdj[u] = list of tasks connected to u (u <-> v)
  const adjMap = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const undirectedAdj = new Map<string, Set<string>>();

  groupTasks.forEach(t => {
    adjMap.set(t.id, []);
    inDegree.set(t.id, 0);
    undirectedAdj.set(t.id, new Set());
  });

  groupTasks.forEach(t => {
    if (t.predecessor && t.predecessor.trim()) {
      const parsed = parsePredecessors(t.predecessor, taskNoMap, t);
      parsed.forEach(pObj => {
        if (pObj?.task && pObj.task.id && pObj.task.id !== t.id && taskMap.has(pObj.task.id)) {
          const u = pObj.task.id;
          const v = t.id;
          const neighbors = adjMap.get(u) || [];
          if (!neighbors.includes(v)) {
            neighbors.push(v);
            adjMap.set(u, neighbors);
            inDegree.set(v, (inDegree.get(v) || 0) + 1);
          }
          undirectedAdj.get(u)?.add(v);
          undirectedAdj.get(v)?.add(u);
        }
      });
    }
  });

  // 1. Partition groupTasks into connected components (dependency chains) using BFS
  const visited = new Set<string>();
  const components: Task[][] = [];

  groupTasks.forEach(t => {
    if (visited.has(t.id)) return;

    const compTasks: Task[] = [];
    const queue = [t.id];
    visited.add(t.id);

    while (queue.length > 0) {
      const currId = queue.shift()!;
      const currTask = taskMap.get(currId);
      if (currTask) compTasks.push(currTask);

      const neighbors = undirectedAdj.get(currId);
      if (neighbors) {
        neighbors.forEach(neighborId => {
          if (!visited.has(neighborId)) {
            visited.add(neighborId);
            queue.push(neighborId);
          }
        });
      }
    }
    components.push(compTasks);
  });

  // Task comparator for topological queue
  const compareTasks = (a: Task, b: Task) => {
    const startA = a.start || '9999-12-31';
    const startB = b.start || '9999-12-31';
    if (startA !== startB) return startA < startB ? -1 : 1;
    
    const finishA = a.finish || '9999-12-31';
    const finishB = b.finish || '9999-12-31';
    if (finishA !== finishB) return finishA < finishB ? -1 : 1;

    const ordA = a.orderIndex !== undefined ? a.orderIndex : 0;
    const ordB = b.orderIndex !== undefined ? b.orderIndex : 0;
    if (ordA !== ordB) return ordA - ordB;

    return String(a.id || '').localeCompare(String(b.id || ''));
  };

  // 2. Topologically sort each component internally using Kahn's algorithm
  const sortedComponents = components.map(compTasks => {
    if (compTasks.length <= 1) return compTasks;

    const compSet = new Set(compTasks.map(ct => ct.id));
    const compInDegree = new Map<string, number>();
    compTasks.forEach(ct => {
      let deg = 0;
      groupTasks.forEach(other => {
        if (compSet.has(other.id) && other.id !== ct.id) {
          const neighbors = adjMap.get(other.id) || [];
          if (neighbors.includes(ct.id)) deg++;
        }
      });
      compInDegree.set(ct.id, deg);
    });

    const ready: Task[] = compTasks.filter(ct => (compInDegree.get(ct.id) || 0) === 0);
    ready.sort(compareTasks);

    const compResult: Task[] = [];
    const compProcessed = new Set<string>();

    while (ready.length > 0) {
      const u = ready.shift()!;
      compResult.push(u);
      compProcessed.add(u.id);

      const neighbors = adjMap.get(u.id) || [];
      let newlyReady = false;
      for (const vId of neighbors) {
        if (!compSet.has(vId)) continue;
        const currentDeg = (compInDegree.get(vId) || 0) - 1;
        compInDegree.set(vId, currentDeg);
        if (currentDeg === 0 && !compProcessed.has(vId)) {
          const vTask = taskMap.get(vId);
          if (vTask) {
            ready.push(vTask);
            newlyReady = true;
          }
        }
      }
      if (newlyReady) {
        ready.sort(compareTasks);
      }
    }

    if (compResult.length < compTasks.length) {
      const remaining = compTasks.filter(ct => !compProcessed.has(ct.id));
      remaining.sort(compareTasks);
      compResult.push(...remaining);
    }

    return compResult;
  });

  // 3. Sort components relative to each other by start date & order of the root task in each chain
  sortedComponents.sort((compA, compB) => {
    const rootA = compA[0];
    const rootB = compB[0];
    if (!rootA && !rootB) return 0;
    if (!rootA) return 1;
    if (!rootB) return -1;
    return compareTasks(rootA, rootB);
  });

  // 4. Flatten sorted component chains into single contiguous array
  return sortedComponents.flat();
}

export function buildTaskNoMap(projects: Project[], tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  const addKey = (t: Task, rawKey?: string | number | null) => {
    if (rawKey === undefined || rawKey === null) return;
    const k = String(rawKey).trim().toLowerCase();
    if (!k) return;
    const existing = map.get(k) || [];
    if (!existing.some(item => item.id === t.id)) {
      existing.push(t);
      map.set(k, existing);
    }
  };

  const taskCodeMap = computeAllTaskCodes(safeProjects, safeTasks);

  safeProjects.forEach((p) => {
    if (!p || p.isDeleted) return;
    const pCode = String(p.code || '').trim();
    if (!pCode) return;

    const pTasks = safeTasks.filter(t => isTaskBelongsToProject(t, p));
    const groupTasks = sortGroupTasks(pTasks);
    groupTasks.forEach((t, i) => {
      if (!t) return;
      const computed = taskCodeMap.get(t.id) || t.taskCodePhu || `${pCode}#${i + 1}`;
      if (computed) {
        addKey(t, computed);
        if (computed.includes('#')) addKey(t, computed.replace('#', '-'));
        if (computed.includes('-')) addKey(t, computed.replace(/-(\d+)$/, '#$1'));
      }

      if (t.taskCodePhu) {
        addKey(t, t.taskCodePhu);
        if (t.taskCodePhu.includes('#')) addKey(t, t.taskCodePhu.replace('#', '-'));
        if (t.taskCodePhu.includes('-')) addKey(t, t.taskCodePhu.replace(/-(\d+)$/, '#$1'));
      }

      addKey(t, `${pCode}#${i + 1}`);
      addKey(t, `${pCode}-${i + 1}`);
      addKey(t, `#${i + 1}`);

      if (t.orderIndex !== undefined && t.orderIndex !== null) {
        addKey(t, `${pCode}#${Number(t.orderIndex) + 1}`);
        addKey(t, `${pCode}-${Number(t.orderIndex) + 1}`);
        addKey(t, `#${Number(t.orderIndex) + 1}`);
      }

      if (t.id) addKey(t, t.id);
    });
  });

  safeTasks.forEach(t => {
    if (!t || t.isDeleted) return;
    const computed = taskCodeMap.get(t.id) || t.taskCodePhu || '';
    if (computed) {
      addKey(t, computed);
      if (computed.includes('#')) addKey(t, computed.replace('#', '-'));
      if (computed.includes('-')) addKey(t, computed.replace(/-(\d+)$/, '#$1'));
    }
    if (t.taskCodePhu) {
      addKey(t, t.taskCodePhu);
      if (t.taskCodePhu.includes('#')) addKey(t, t.taskCodePhu.replace('#', '-'));
      if (t.taskCodePhu.includes('-')) addKey(t, t.taskCodePhu.replace(/-(\d+)$/, '#$1'));
    }
    if (t.orderIndex !== undefined && t.orderIndex !== null && t.projectCode) {
      addKey(t, `${t.projectCode}#${Number(t.orderIndex) + 1}`);
      addKey(t, `${t.projectCode}-${Number(t.orderIndex) + 1}`);
    }
    if (t.id) addKey(t, t.id);
  });

  return map;
}

export function computeTaskCode(projects: Project[], tasks: Task[], task: Task): string {
  if (!task || task.isDeleted) return '';

  const taskPCode = String(task.projectCode || '').trim();
  const taskYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim() : '';
  const taskStore = task.projectStore ? String(task.projectStore).trim().toUpperCase() : '';

  const p =
    (task.projectId ? (projects || []).find(proj => proj && !proj.isDeleted && String(proj.id) === String(task.projectId)) : undefined) ||
    (projects || []).find(proj => proj && !proj.isDeleted && isTaskBelongsToProject(task, proj));

  const currentPCode = p ? String(p.code).trim() : taskPCode;
  
  // Nếu không có Project Code, trả về rỗng để hệ thống không sinh mã rác
  if (!currentPCode) return '';

  const pTasks = p
    ? (tasks || []).filter(t => isTaskBelongsToProject(t, p))
    : (tasks || []).filter(t => {
        if (!t || t.isDeleted) return false;
        if (!t.projectCode || String(t.projectCode).trim().toLowerCase() !== currentPCode.toLowerCase()) return false;
        const tYear = t.projectYear !== undefined && t.projectYear !== null ? String(t.projectYear).trim() : '';
        const tStore = t.projectStore ? String(t.projectStore).trim().toUpperCase() : '';
        if (taskYear && tYear && taskYear !== tYear) return false;
        if (taskStore && tStore && taskStore !== tStore) return false;
        return true;
      });
  
  const sorted = sortGroupTasks(pTasks);
  const idx = sorted.findIndex(t => t.id === task.id);
  
  // Tuyệt đối lấy số thứ tự theo Index mảng thực tế để KHÔNG NHẢY CÓC
  const orderNum = idx !== -1 ? idx + 1 : (task.orderIndex !== undefined ? Number(task.orderIndex) + 1 : 1);

  // Ép định dạng: [ProjectCode]#[Số thứ tự]
  return `${currentPCode}#${orderNum}`;
}

let _lastProjectsForCodeMapRef: Project[] | null = null;
let _lastTasksForCodeMapRef: Task[] | null = null;
let _cachedTaskCodesMap: Map<string, string> = new Map();

/**
 * Pre-indexes all task codes in O(N log K) single pass instead of O(N^2 log N).
 * Includes reference-level memoization to eliminate recalculations across sibling components.
 */
export function computeAllTaskCodes(projects: Project[], tasks: Task[]): Map<string, string> {
  if (
    _lastProjectsForCodeMapRef === projects &&
    _lastTasksForCodeMapRef === tasks &&
    _cachedTaskCodesMap.size > 0
  ) {
    return _cachedTaskCodesMap;
  }

  const map = new Map<string, string>();
  if (!tasks || !Array.isArray(tasks)) return map;

  const projectMapByScopedCode = new Map<string, Project>();
  const projectMapById = new Map<string, Project>();
  (projects || []).forEach(p => {
    if (!p || p.isDeleted) return;
    if (p.id) projectMapById.set(String(p.id), p);
    if (p.code) {
      const key = `${String(p.code).trim()}-${p.year || ''}-${p.store || ''}`.toLowerCase();
      projectMapByScopedCode.set(key, p);
    }
  });

  const resolveTaskProject = (t: Task): Project | undefined => {
    if (t.projectId) {
      const byId = projectMapById.get(String(t.projectId));
      if (byId && isTaskBelongsToProject(t, byId)) return byId;
    }
    if (t.projectCode) {
      const scopedKey = `${String(t.projectCode).trim()}-${t.projectYear || ''}-${t.projectStore || ''}`.toLowerCase();
      const byScoped = projectMapByScopedCode.get(scopedKey);
      if (byScoped && isTaskBelongsToProject(t, byScoped)) return byScoped;
    }
    return (projects || []).find(proj => proj && !proj.isDeleted && isTaskBelongsToProject(t, proj));
  };

  const tasksByGroupKey = new Map<string, { pCode: string; tasks: Task[] }>();
  for (let idx = 0; idx < tasks.length; idx++) {
    const t = tasks[idx];
    if (!t || t.isDeleted) continue;
    const p = resolveTaskProject(t);
    const pCode = p ? String(p.code || '').trim() : String(t.projectCode || '').trim();

    if (!pCode) {
      if (t.taskCodePhu && t.taskCodePhu.trim()) {
        map.set(t.id, t.taskCodePhu.trim());
      }
      continue;
    }

    const groupKey = p?.id
      ? `pid:${p.id}`
      : `${pCode}-${p?.year ?? t.projectYear ?? ''}-${p?.store ?? t.projectStore ?? ''}`.toLowerCase();
    
    let entry = tasksByGroupKey.get(groupKey);
    if (!entry) {
      entry = { pCode, tasks: [] };
      tasksByGroupKey.set(groupKey, entry);
    }
    entry.tasks.push(t);
  }

  tasksByGroupKey.forEach(({ pCode, tasks: groupTasks }) => {
    const sorted = sortGroupTasks(groupTasks);
    sorted.forEach((t, i) => {
      const orderNum = i + 1;
      const code = pCode ? `${pCode}#${orderNum}` : (t.taskCodePhu || '');
      map.set(t.id, code);
    });
  });

  _lastProjectsForCodeMapRef = projects;
  _lastTasksForCodeMapRef = tasks;
  _cachedTaskCodesMap = map;
  return map;
}

export function parsePredecessors(predecessorString: string, taskNoMap: Map<string, Task[]>, contextTask?: Task) {
  if (!predecessorString) return [];
  const safeProjects: Project[] = typeof window !== 'undefined' ? (useAppStore.getState?.()?.projects || []) : [];
  const safeTasks: Task[] = typeof window !== 'undefined' ? (useAppStore.getState?.()?.tasks || []) : [];
  const preds = splitPredecessors(predecessorString, taskNoMap);
  const taskIds = contextTask?.predecessorTaskIds || [];

  return preds.map((pMatches, index) => {
    const lowerMatches = pMatches.toLowerCase();
    const hardLinkedId = taskIds[index];

    if (hardLinkedId) {
      const exact = safeTasks.find(t => t.id === hardLinkedId);
      if (exact && !exact.isDeleted) {
        const { suffix } = parsePredecessorToken(pMatches);
        let type = 'FS';
        let lagSign = '+';
        let lagValue = 0;
        if (suffix) {
          const matchSuffix = suffix.match(/^(FS|SS|FF|SF)?\s*(?:([+-])?\s*(\d+(?:\.\d+)?))?\s*$/i);
          if (matchSuffix) {
            if (matchSuffix[1]) type = matchSuffix[1].toUpperCase();
            if (matchSuffix[2]) lagSign = matchSuffix[2];
            if (matchSuffix[3]) lagValue = parseFloat(matchSuffix[3]);
          }
        }
        return {
          no: pMatches,
          type,
          lagSign,
          lagValue,
          task: exact
        };
      }
    }

    let longestMatch = "";
    for (const code of taskNoMap.keys()) {
      if (lowerMatches.startsWith(code) && code.length > longestMatch.length) {
        const remainderCheck = lowerMatches.substring(code.length);
        if (remainderCheck.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
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
          if (remainderCheck.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
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
        const candidateHash = `${String(contextTask.projectCode).trim().toLowerCase()}#${subIndex}`;
        const candidateDash = `${String(contextTask.projectCode).trim().toLowerCase()}-${subIndex}`;
        if (taskNoMap.has(candidateHash)) {
          longestMatch = candidateHash;
        } else if (taskNoMap.has(candidateDash)) {
          longestMatch = candidateDash;
        }
      }
    }

    // Smart fallback 3: legacy project code prefix or partial project code (e.g. "l1-115#13" or "l1-115-13")
    if (!longestMatch && contextTask && contextTask.projectCode) {
      const matchPrefixAndIndex = lowerMatches.match(/^(.+?)[-#_\s]+(\d+)(.*)$/);
      if (matchPrefixAndIndex) {
        const candidatePrefix = matchPrefixAndIndex[1].trim();
        const subIndex = matchPrefixAndIndex[2];
        const currentPCode = String(contextTask.projectCode).trim().toLowerCase();
        
        // Split current project code by semicolon/comma/slash in case of combined project codes like "l1-115; l1-113"
        const pCodeParts = currentPCode.split(/[,;/]+/).map(p => p.trim()).filter(Boolean);
        const matchesPart = pCodeParts.some(part => part === candidatePrefix || part.startsWith(candidatePrefix) || candidatePrefix.startsWith(part));
        
        if (matchesPart) {
          const candidateHash = `${currentPCode}#${subIndex}`;
          const candidateDash = `${currentPCode}-${subIndex}`;
          if (taskNoMap.has(candidateHash)) {
            longestMatch = candidateHash;
          } else if (taskNoMap.has(candidateDash)) {
            longestMatch = candidateDash;
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
      let resolvedTask: Task | undefined;
      if (possibleTasks && possibleTasks.length > 0) {
        if (possibleTasks.length === 1 && !contextTask) {
          resolvedTask = possibleTasks[0];
        } else {
          // Extract requested subtask number if any (e.g. "B2-B208#2" -> 2, "#2" -> 2, "2" -> 2)
          const targetNumMatch = longestMatch.match(/(?:^|[-#_])0*(\d+)$/);
          const targetSubtaskNumber = targetNumMatch ? parseInt(targetNumMatch[1], 10) : null;

          const ctxPCode = contextTask ? String(contextTask.projectCode || '').trim().toLowerCase() : '';
          const ctxProj = contextTask ? safeProjects.find(p => 
            (contextTask.projectId && p.id === contextTask.projectId) ||
            (p.code && String(p.code).trim().toLowerCase() === ctxPCode &&
             (contextTask.projectYear ? String(p.year) === String(contextTask.projectYear) : true) &&
             (contextTask.projectStore ? p.store === contextTask.projectStore : true))
          ) : undefined;

          const ctxYear = contextTask ? String(contextTask.projectYear || ctxProj?.year || '').trim().toLowerCase() : '';
          const ctxStore = contextTask ? String(contextTask.projectStore || ctxProj?.store || '').trim().toLowerCase() : '';
          const ctxLoc = contextTask ? String(contextTask.location || ctxProj?.location || '').trim().toLowerCase() : '';
          const ctxProjId = contextTask ? (contextTask.projectId || ctxProj?.id || '') : '';

          let bestScore = -Infinity;
          for (const cand of possibleTasks) {
            if (!cand) continue;
            let candScore = 0;
            const candPCode = String(cand.projectCode || '').trim().toLowerCase();
            const candProj = safeProjects.find(p =>
              (cand.projectId && p.id === cand.projectId) ||
              (p.code && String(p.code).trim().toLowerCase() === candPCode &&
               (cand.projectYear ? String(p.year) === String(cand.projectYear) : true) &&
               (cand.projectStore ? p.store === cand.projectStore : true))
            );

            const candYear = String(cand.projectYear || candProj?.year || '').trim().toLowerCase();
            const candStore = String(cand.projectStore || candProj?.store || '').trim().toLowerCase();
            const candLoc = String(cand.location || candProj?.location || '').trim().toLowerCase();
            const candProjId = cand.projectId || candProj?.id || '';

            // Numerical Conflict Guard: ensure subtask order numbers match exactly
            if (targetSubtaskNumber !== null) {
              const candComputed = computeTaskCode(safeProjects, safeTasks, cand) || cand.taskCodePhu || '';
              const candNumMatch = candComputed.match(/(?:^|[-#_])0*(\d+)$/);
              const candSubtaskNum = candNumMatch ? parseInt(candNumMatch[1], 10) : null;
              if (candSubtaskNum !== null) {
                if (candSubtaskNum === targetSubtaskNumber) {
                  candScore += 25000;
                } else {
                  candScore -= 50000; // Strong penalty for mismatched subtask number
                }
              }
            }

            // 1. Same parent project ID: top priority
            if (ctxProjId && candProjId && ctxProjId === candProjId) {
              candScore += 10000;
            }

            // 2. Same project code
            if (ctxPCode && candPCode && ctxPCode === candPCode) {
              candScore += 5000;
            }

            // 3. Same year
            if (ctxYear && candYear) {
              if (ctxYear === candYear) candScore += 3000;
              else candScore -= 4000; // Strong penalty for mismatched year
            }

            // 4. Same store (HCM / HN)
            if (ctxStore && candStore) {
              if (ctxStore === candStore) candScore += 1500;
              else candScore -= 2000;
            }

            // 5. Same location (floor / unit)
            if (ctxLoc && candLoc) {
              if (ctxLoc === candLoc) candScore += 500;
              else candScore -= 500;
            }

            if (candScore > bestScore) {
              bestScore = candScore;
              resolvedTask = cand;
            }
          }
        }
        if (!resolvedTask) {
          resolvedTask = possibleTasks[0];
        }
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
    const newTaskCodePhu = `${targetPrjCode}#${idx + 1}`;
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
  projects: Project[],
  cachedTaskNoMap?: Map<string, Task[]>,
  cachedKnownCodes?: Set<string>
): { changed: boolean; newPredecessor: string } {
  if (!task || !task.predecessor || typeof task.predecessor !== 'string' || !task.predecessor.trim()) {
    return { changed: false, newPredecessor: task?.predecessor || '' };
  }

  const updatedAllTasks = allTasks || [];
  const taskNoMap = cachedTaskNoMap || buildTaskNoMap(projects, updatedAllTasks);
  const knownCodes = cachedKnownCodes || (() => {
    const set = new Set<string>();
    for (const k of taskNoMap.keys()) set.add(k.toLowerCase());
    updatedAllTasks.forEach(t => {
      if (t.taskCodePhu) set.add(t.taskCodePhu.toLowerCase());
      if (t.projectCode) set.add(t.projectCode.toLowerCase());
    });
    return set;
  })();

  const tokens = splitPredecessors(task.predecessor, knownCodes);
  let changed = false;

  const sortedTaskNoMapEntries = Array.from(taskNoMap.entries()).sort((a, b) => b[0].length - a[0].length);

  const resolvedTokens = tokens.map(token => {
    const rawToken = token.trim();
    if (!rawToken) return token;

    const lowerToken = rawToken.toLowerCase();

    // 1. Check if token matches a known task code in taskNoMap
    for (const [code, matchingTasks] of sortedTaskNoMapEntries) {
      if (lowerToken.startsWith(code)) {
        const remainder = lowerToken.substring(code.length);
        if (remainder.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s+\d|$)/i.test(remainder)) {
          let targetTask: Task | undefined;
          if (matchingTasks && matchingTasks.length > 0) {
            if (matchingTasks.length === 1) {
              targetTask = matchingTasks[0];
            } else {
              const ctxPCode = String(task.projectCode || '').trim().toLowerCase();
              const ctxYear = task.projectYear !== undefined && task.projectYear !== null ? String(task.projectYear).trim().toLowerCase() : '';
              const ctxStore = String(task.projectStore || '').trim().toLowerCase();
              const ctxLoc = String(task.location || '').trim().toLowerCase();
              const ctxProjId = task.projectId || '';

              let bestScore = -Infinity;
              for (const cand of matchingTasks) {
                if (!cand) continue;
                let candScore = 0;
                if (ctxProjId && cand.projectId && ctxProjId === cand.projectId) candScore += 10000;
                if (ctxPCode && cand.projectCode && ctxPCode === String(cand.projectCode).trim().toLowerCase()) candScore += 5000;
                if (ctxYear && cand.projectYear) {
                  if (ctxYear === String(cand.projectYear).trim().toLowerCase()) candScore += 3000;
                  else candScore -= 4000;
                }
                if (ctxStore && cand.projectStore) {
                  if (ctxStore === String(cand.projectStore).trim().toLowerCase()) candScore += 1500;
                  else candScore -= 2000;
                }
                if (ctxLoc && cand.location) {
                  if (ctxLoc === String(cand.location).trim().toLowerCase()) candScore += 500;
                  else candScore -= 500;
                }
                if (candScore > bestScore) {
                  bestScore = candScore;
                  targetTask = cand;
                }
              }
            }
          }
          if (targetTask) {
            const currentTargetCode = targetTask.taskCodePhu || computeTaskCode(projects, updatedAllTasks, targetTask);
            if (currentTargetCode && currentTargetCode.trim().toLowerCase() !== code) {
              changed = true;
              return `${currentTargetCode.trim()}${rawToken.substring(code.length)}`;
            }
          }
          // Already valid and exact match
          return token;
        }
      }
    }

    // 2. Extract trailing link/lag suffix: e.g. "SS", "FS+0.5", "+0.5", " - 1", "FF", etc.
    const suffixMatch = rawToken.match(/\s*((?:FS|SS|FF|SF)\s*(?:[+-]\s*\d+(?:\.\d+)?|\s+\d+(?:\.\d+)?)?|\+\s*\d+(?:\.\d+)?|\s+-\s*\d+(?:\.\d+)?|\s+\d+(?:\.\d+)?)\s*$/i);
    let lagSuffix = "";
    let baseToken = rawToken;

    if (suffixMatch && suffixMatch.index !== undefined && suffixMatch[0].trim()) {
      lagSuffix = suffixMatch[1].trim();
      baseToken = rawToken.substring(0, suffixMatch.index).trim();
    }

    let codePrefix = "";
    let subIndexNum: number | null = null;

    if (/^\d+$/.test(baseToken)) {
      subIndexNum = parseInt(baseToken, 10);
      codePrefix = "";
    } else {
      // Use greedy match to grab everything up to the LAST dash/space/underscore delimiter
      const matchPrefix = baseToken.match(/^(.+)[-_\s]+(\d+)$/);
      if (matchPrefix) {
        codePrefix = matchPrefix[1].trim();
        subIndexNum = parseInt(matchPrefix[2], 10);
      } else {
        codePrefix = baseToken;
      }
    }

    if (subIndexNum !== null && !isNaN(subIndexNum)) {
      // 1. Try finding within current task's project
      const currentPCode = String(task.projectCode || '').trim();
      const currentPCodeLower = currentPCode.toLowerCase();
      const pCodeParts = currentPCodeLower.split(/[,;/]+/).map(p => p.trim()).filter(Boolean);

      const isMatchingCurrentProject = !codePrefix || 
        codePrefix.toLowerCase() === currentPCodeLower ||
        pCodeParts.some(part => part === codePrefix.toLowerCase() || part.startsWith(codePrefix.toLowerCase()) || codePrefix.toLowerCase().startsWith(part));

      if (isMatchingCurrentProject) {
        const sameProjectTasks = sortGroupTasks(
          updatedAllTasks.filter(t => {
            if (!t) return false;
            const tPCode = String(t.projectCode || '').trim().toLowerCase();
            const sameProj = tPCode === currentPCodeLower ||
              pCodeParts.some(p => p && (tPCode === p || tPCode.includes(p)));
            if (!sameProj) return false;
            if (task.projectYear && t.projectYear && String(t.projectYear) !== String(task.projectYear)) return false;
            if (task.projectStore && t.projectStore && String(t.projectStore) !== String(task.projectStore)) return false;
            return true;
          })
        );

        let targetTask = (subIndexNum >= 1 && subIndexNum <= sameProjectTasks.length)
          ? sameProjectTasks[subIndexNum - 1]
          : undefined;

        if (!targetTask) {
          targetTask = sameProjectTasks.find(t => {
            const code = String(t.taskCodePhu || computeTaskCode(projects, updatedAllTasks, t) || '').trim();
            return code.endsWith(`#${subIndexNum}`) || code.endsWith(`-${subIndexNum}`) || t.orderIndex === subIndexNum;
          });
        }

        if (targetTask) {
          const newCode = (targetTask.taskCodePhu || computeTaskCode(projects, updatedAllTasks, targetTask) || `${currentPCode}#${subIndexNum}`).trim();
          if (newCode) {
            changed = true;
            return `${newCode}${lagSuffix ? (lagSuffix.startsWith('+') || lagSuffix.startsWith('-') || /^[a-z]/i.test(lagSuffix) ? lagSuffix : ` ${lagSuffix}`) : ''}`;
          }
        }
      }

      // 2. Try finding across other projects if codePrefix was specified
      if (codePrefix) {
        const lowerPrefix = codePrefix.toLowerCase();
        const matchedProj = projects.find(p => {
          if (!p || !p.code) return false;
          const pLower = p.code.toLowerCase();
          const parts = pLower.split(/[,;/]+/).map(item => item.trim()).filter(Boolean);
          return pLower === lowerPrefix || parts.some(part => part === lowerPrefix || part.startsWith(lowerPrefix) || lowerPrefix.startsWith(part));
        });

        if (matchedProj) {
          const targetTasks = sortGroupTasks(
            updatedAllTasks.filter(t => 
              t &&
              String(t.projectCode || '').trim().toLowerCase() === String(matchedProj.code).trim().toLowerCase() &&
              (matchedProj.year ? String(t.projectYear || '') === String(matchedProj.year) : true) &&
              (matchedProj.store ? String(t.projectStore || '') === String(matchedProj.store) : true)
            )
          );

          let targetTask = (subIndexNum >= 1 && subIndexNum <= targetTasks.length)
            ? targetTasks[subIndexNum - 1]
            : undefined;

          if (!targetTask) {
            targetTask = targetTasks.find(t => {
              const code = String(t.taskCodePhu || computeTaskCode(projects, updatedAllTasks, t) || '').trim();
              return code.endsWith(`#${subIndexNum}`) || code.endsWith(`-${subIndexNum}`) || t.orderIndex === subIndexNum;
            });
          }

          if (targetTask) {
            const newCode = (targetTask.taskCodePhu || computeTaskCode(projects, updatedAllTasks, targetTask) || `${matchedProj.code}#${subIndexNum}`).trim();
            if (newCode) {
              changed = true;
              return `${newCode}${lagSuffix ? (lagSuffix.startsWith('+') || lagSuffix.startsWith('-') || /^[a-z]/i.test(lagSuffix) ? lagSuffix : ` ${lagSuffix}`) : ''}`;
            }
          }
        }
      }
    }

    return token;
  });

  const newPredecessor = resolvedTokens.join(', ');
  return {
    changed: changed || newPredecessor !== task.predecessor,
    newPredecessor
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
  updatesToSave: { id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string }[];
} {
  const updatesToSave: { id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string }[] = [];
  let changedCount = 0;
  const safeTasks = Array.isArray(allTasks) ? allTasks : [];
  const safeProjects = Array.isArray(projects) ? projects : [];

  // Precompute task codes and taskNoMap once for all tasks
  const taskCodeMap = computeAllTaskCodes(safeProjects, safeTasks);
  const taskNoMap = buildTaskNoMap(safeProjects, safeTasks);
  const knownCodes = new Set<string>();
  for (const k of taskNoMap.keys()) knownCodes.add(k.toLowerCase());
  safeTasks.forEach(t => {
    if (t.taskCodePhu) knownCodes.add(t.taskCodePhu.toLowerCase());
    if (t.projectCode) knownCodes.add(t.projectCode.toLowerCase());
  });

  const updatedTasks = safeTasks.map(t => {
    let taskChanged = false;
    let newPred = t.predecessor || '';
    const originalTask = t;

    const newPhu = t.taskCodePhu || taskCodeMap.get(t.id) || '';

    if (t.predecessor) {
      const { changed, newPredecessor } = normalizeAndHealTaskPredecessors(
        { ...t, taskCodePhu: newPhu }, 
        safeTasks, 
        safeProjects,
        taskNoMap,
        knownCodes
      );
      if (changed && newPredecessor !== t.predecessor) {
        newPred = newPredecessor;
        taskChanged = true;
      }
    }

    if (taskChanged) {
      changedCount++;
      const updatedAt = new Date().toISOString();
      const origPhu = originalTask.taskCodePhu || '';
      const origPred = originalTask.predecessor || '';

      const updatePayload: { id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string } = {
        id: t.id,
        updatedAt
      };
      if (newPred !== origPred) updatePayload.predecessor = newPred;
      if (newPhu !== origPhu) updatePayload.taskCodePhu = newPhu;

      updatesToSave.push(updatePayload);
      return {
        ...t,
        taskCodePhu: newPhu,
        predecessor: newPred,
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

/**
 * Scans all tasks and projects in the app and explicitly converts subtask codes and predecessor references
 * from '-' format (e.g. B2-B208-1) to '#' format (e.g. B2-B208#1).
 */
export function convertAllSubtaskCodesAndPredecessorsToHash(
  allTasks: Task[],
  allProjects: Project[]
): {
  updatedTasks: Task[];
  changedCount: number;
  updatesToSave: Array<{ id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string }>;
} {
  const sortedProjects = [...(allProjects || [])]
    .filter(p => p && p.code && p.code.trim())
    .sort((a, b) => String(b.code).trim().length - String(a.code).trim().length);

  const canonicalTaskCodes = computeAllTaskCodes(allProjects, allTasks);
  const taskOldToNewCodeMap = new Map<string, string>();
  const buildScopedOldKey = (t: Task, codeLower: string) =>
    `${String(t.projectId || '').trim()}__${String(t.projectCode || '').trim().toLowerCase()}__${String(t.projectYear || '').trim()}__${String(t.projectStore || '').trim().toUpperCase()}__${codeLower}`;

  const updatedTasksWithCodes = (allTasks || []).map((t, idx) => {
    const oldCode = (t.taskCodePhu || '').trim();
    const newCode = canonicalTaskCodes.get(t.id) || oldCode;

    if (oldCode && oldCode.toLowerCase() !== newCode.toLowerCase()) {
      taskOldToNewCodeMap.set(buildScopedOldKey(t, oldCode.toLowerCase()), newCode);
      if (!taskOldToNewCodeMap.has(oldCode.toLowerCase())) {
        taskOldToNewCodeMap.set(oldCode.toLowerCase(), newCode);
      }
    }

    return {
      ...t,
      orderIndex: (t.orderIndex !== undefined && t.orderIndex !== null) ? t.orderIndex : idx,
      taskCodePhu: newCode
    };
  });

  // 2. Convert predecessor strings across all tasks
  let changedCount = 0;
  const updatesToSave: Array<{ id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string }> = [];

  const finalTasks = updatedTasksWithCodes.map((t, idx) => {
    const originalTask = allTasks[idx];
    let predChanged = false;
    let newPred = t.predecessor || '';
    const oldPred = t.predecessor || '';

    if (oldPred && oldPred.trim()) {
      const tokens = splitPredecessors(oldPred);
      const convertedTokens = tokens.map(rawToken => {
        const token = rawToken.trim();
        if (!token) return token;

        const { query, suffix } = parsePredecessorToken(token);
        const queryLower = query.toLowerCase();

        // 1. Direct mapping from taskOldToNewCodeMap (scoped to same project first)
        const scopedKey = buildScopedOldKey(t, queryLower);
        const mapped = taskOldToNewCodeMap.get(scopedKey) || taskOldToNewCodeMap.get(queryLower);
        if (mapped) {
          const formattedSuffix = suffix ? (suffix.startsWith('+') || suffix.startsWith('-') || /^[a-zA-Z]/.test(suffix) ? suffix : ` ${suffix}`) : '';
          return `${mapped}${formattedSuffix}`;
        }

        // 2. Format ProjectCode-Index -> ProjectCode#Index
        const dashMatch = query.match(/^(.*)-(\d+)$/);
        if (dashMatch) {
          const prefix = dashMatch[1];
          const digits = dashMatch[2];
          const isKnownProj = (allProjects || []).some(p => p.code && p.code.toLowerCase() === prefix.toLowerCase()) ||
            (t.projectCode && prefix.toLowerCase() === String(t.projectCode).trim().toLowerCase());
          
          if (isKnownProj) {
            const canonicalPrefix = (allProjects || []).find(p => p.code && p.code.toLowerCase() === prefix.toLowerCase())?.code || prefix;
            const formattedSuffix = suffix ? (suffix.startsWith('+') || suffix.startsWith('-') || /^[a-zA-Z]/.test(suffix) ? suffix : ` ${suffix}`) : '';
            return `${canonicalPrefix}#${digits}${formattedSuffix}`;
          }
        }

        const formattedSuffix = suffix ? (suffix.startsWith('+') || suffix.startsWith('-') || /^[a-zA-Z]/.test(suffix) ? suffix : ` ${suffix}`) : '';
        return `${query}${formattedSuffix}`;
      });

      newPred = convertedTokens.join(', ');
      if (newPred !== oldPred) {
        predChanged = true;
      }
    }

    const codeChanged = (t.taskCodePhu || '') !== (originalTask.taskCodePhu || '');
    if (codeChanged || predChanged) {
      changedCount++;
      const updatedAt = new Date().toISOString();
      const updatePayload: { id: string; predecessor?: string; taskCodePhu?: string; updatedAt: string } = {
        id: t.id,
        updatedAt
      };
      if (codeChanged) updatePayload.taskCodePhu = t.taskCodePhu;
      if (predChanged) updatePayload.predecessor = newPred;
      updatesToSave.push(updatePayload);

      return {
        ...t,
        predecessor: newPred,
        updatedAt
      };
    }

    return t;
  });

  return {
    updatedTasks: finalTasks,
    changedCount,
    updatesToSave
  };
}


