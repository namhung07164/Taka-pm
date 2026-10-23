import { Task, Project } from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { normalizeDashes } from '../utils';
import { parsePredecessorToken } from '../predecessorMatchUtils';
import { computeTaskCode } from './taskSortingAndCodes';

/**
 * Splits a predecessor string into individual predecessor tokens (up to 2 in standard Gantt),
 * correctly preserving task codes that contain commas (e.g. "L1,L2-01", "HCM,HN-01", or "101,102-1").
 */
export function splitPredecessors(
  predecessorString: string | undefined | null,
  knownCodes?: Iterable<string> | Map<string, any> | Set<string>
): string[] {
  if (!predecessorString || typeof predecessorString !== 'string') return [];
  const raw = normalizeDashes(predecessorString).trim();
  if (!raw) return [];

  if (!raw.includes(',')) return [raw];

  let codeList: string[] = [];
  if (knownCodes) {
    if (knownCodes instanceof Map) {
      codeList = Array.from(knownCodes.keys());
    } else {
      codeList = Array.from(knownCodes);
    }
  }
  codeList = codeList
    .flatMap(c => {
      const s = String(c).trim().toLowerCase();
      const norm = normalizeDashes(s);
      return norm !== s ? [s, norm] : [s];
    })
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  const lowerRaw = raw.toLowerCase();

  if (codeList.length > 0) {
    for (const code of codeList) {
      if (lowerRaw.startsWith(code)) {
        const afterCode = lowerRaw.substring(code.length);
        const matchRelLag = afterCode.match(/^(\s*(?:fs|ss|ff|sf))?(\s*[+-]\s*\d+(?:\.\d+)?)?/i);
        const relLagLen = matchRelLag ? matchRelLag[0].length : 0;
        const afterRel = afterCode.substring(relLagLen).trimStart();

        if (afterRel.length === 0) {
          return [raw];
        }

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

export function parsePredecessors(predecessorString: string, taskNoMap: Map<string, Task[]>, contextTask?: Task) {
  if (!predecessorString) return [];
  const safeProjects: Project[] = typeof window !== 'undefined' ? (useAppStore.getState?.()?.projects || []) : [];
  const safeTasks: Task[] = typeof window !== 'undefined' ? (useAppStore.getState?.()?.tasks || []) : [];
  const preds = splitPredecessors(predecessorString, taskNoMap);
  const taskIds = contextTask?.predecessorTaskIds || [];

  return preds.map((pMatches, index) => {
    const lowerMatches = normalizeDashes(pMatches).toLowerCase();
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
      const codeNorm = normalizeDashes(code).toLowerCase();
      if ((lowerMatches.startsWith(code) || lowerMatches.startsWith(codeNorm)) && code.length > longestMatch.length) {
        const prefixLen = lowerMatches.startsWith(code) ? code.length : codeNorm.length;
        const remainderCheck = lowerMatches.substring(prefixLen);
        if (remainderCheck.length === 0 || /^(\s*(?:fs|ss|ff|sf)|\s*[+-]|\s+\d|$)/i.test(remainderCheck)) {
          longestMatch = code;
        }
      }
    }

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

    if (!longestMatch && contextTask && contextTask.projectCode) {
      const matchPrefixAndIndex = lowerMatches.match(/^(.+?)[-#_\s]+(\d+)(.*)$/);
      if (matchPrefixAndIndex) {
        const candidatePrefix = matchPrefixAndIndex[1].trim();
        const subIndex = matchPrefixAndIndex[2];
        const currentPCode = String(contextTask.projectCode).trim().toLowerCase();
        
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
      let remainder = "";
      if (lowerMatches.startsWith(longestMatch)) {
        remainder = pMatches.substring(longestMatch.length).trim();
      } else {
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

            if (targetSubtaskNumber !== null) {
              const candComputed = computeTaskCode(safeProjects, safeTasks, cand) || cand.taskCodePhu || '';
              const candNumMatch = candComputed.match(/(?:^|[-#_])0*(\d+)$/);
              const candSubtaskNum = candNumMatch ? parseInt(candNumMatch[1], 10) : null;
              if (candSubtaskNum !== null) {
                if (candSubtaskNum === targetSubtaskNumber) {
                  candScore += 25000;
                } else {
                  candScore -= 50000;
                }
              }
            }

            if (ctxProjId && candProjId && ctxProjId === candProjId) {
              candScore += 10000;
            }
            if (ctxPCode && candPCode && ctxPCode === candPCode) {
              candScore += 5000;
            }
            if (ctxYear && candYear) {
              if (ctxYear === candYear) candScore += 3000;
              else candScore -= 4000;
            }
            if (ctxStore && candStore) {
              if (ctxStore === candStore) candScore += 1500;
              else candScore -= 2000;
            }
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
