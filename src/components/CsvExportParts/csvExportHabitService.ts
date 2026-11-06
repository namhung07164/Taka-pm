import { doc, getDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../lib/firebase';
import { setDoc } from '../../lib/firestoreWrites';
import { TAB_CONFIG, safeGetStorage, safeSetStorage, safeJSONParse } from './csvExportTypes';

export interface CsvMappingPreset {
  id: string;
  name: string;
  tabId: string;
  mapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  constantMapping: Record<string, string>;
  explicitEmptyCols?: Record<string, boolean>;
  isDefault?: boolean;
  updatedAt: number;
}

export interface TabHabitState {
  mapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  constantMapping: Record<string, string>;
  explicitEmptyCols: Record<string, boolean>;
  preferredHeaders: Record<string, string[]>;
  isLocked: boolean;
  activePresetId: string;
}

const CLOUD_HABITS_DOC_ID = 'csv_converter_habits';

const COLUMN_ALIASES: Record<string, string[]> = {
  store: ['store', 'projectstore', 'project store', 'chi nhánh', 'chinhanh'],
  location: ['location', 'floor', 'tầng', 'vi tri', 'vị trí'],
  year: ['year', 'projectyear', 'project year', 'năm'],
  projectYear: ['projectyear', 'project year', 'year', 'năm'],
  code: ['code', 'projectcode', 'project code', 'mã dự án'],
  projectCode: ['projectcode', 'project code', 'code', 'mã dự án'],
  'Sub-task code': ['sub-task code', 'sub task code', 'subtask code', 'taskcodephu', 'task code phu', 'mã phụ', 'sub_task_code'],
  'Task name': ['task name', 'taskname', 'name', 'tên công việc', 'tên task', 'hạng mục'],
  'Parent task code': ['parent task code', 'parenttaskcode', 'parent code', 'task mẹ', 'mã task mẹ', 'parent_task_code'],
  start: ['start', 'start date', 'startdate', 'start (plan)', 'bắt đầu', 'ngay bat dau'],
  finish: ['finish', 'finish date', 'finishdate', 'end', 'finish (plan)', 'kết thúc', 'ngay ket thuc'],
  duration: ['duration', 'durations', 'số ngày', 'thời lượng'],
  party: ['party', 'pic', 'department', 'bộ phận', 'phụ trách'],
  predecessor: ['predecessor', 'predecessors', 'predecessor code', 'tiền nhiệm', 'tien nhiem'],
  delegation: ['delegation', 'task delegation', 'isdelegation', 'ủy quyền'],
  comments: ['comments', 'comment', 'note', 'notes', 'ghi chú', 'diễn giải'],
};

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function loadLocalTabHabit(tabId: string): TabHabitState {
  const cols = TAB_CONFIG[tabId]?.columns || [];
  const savedMapping = safeJSONParse(safeGetStorage(`taka_mapping_${tabId}`));
  const savedKeep = safeJSONParse(safeGetStorage(`taka_keeporiginal_${tabId}`));
  const rawConstStr = safeGetStorage(`taka_constant_${tabId}`);
  const savedConst = safeJSONParse(rawConstStr);
  const savedEmpty = safeJSONParse(safeGetStorage(`taka_emptycols_${tabId}`));
  const savedPref = safeJSONParse(safeGetStorage(`taka_prefheaders_${tabId}`));
  const activePresetId = safeGetStorage(`taka_active_preset_${tabId}`) || 'default';
  const isLocked = safeGetStorage(`taka_locked_${tabId}`) === 'true';

  const mapping: Record<string, string> = {};
  const keepOriginal: Record<string, boolean> = {};
  const constantMapping: Record<string, string> = {};
  const explicitEmptyCols: Record<string, boolean> = {};
  const preferredHeaders: Record<string, string[]> = {};

  cols.forEach((col) => {
    mapping[col] = savedMapping[col] || '';
    keepOriginal[col] = Boolean(savedKeep[col]);
    if (savedConst[col] !== undefined && rawConstStr) {
      constantMapping[col] = String(savedConst[col]);
    } else {
      constantMapping[col] = col === 'delegation' ? 'True' : '';
    }
    explicitEmptyCols[col] = Boolean(savedEmpty[col]);
    preferredHeaders[col] = Array.isArray(savedPref[col]) ? savedPref[col] : [];
  });

  return {
    mapping,
    keepOriginal,
    constantMapping,
    explicitEmptyCols,
    preferredHeaders,
    isLocked,
    activePresetId,
  };
}

export function saveLocalTabHabit(
  tabId: string,
  state: Partial<TabHabitState>
): void {
  if (state.mapping !== undefined) {
    safeSetStorage(`taka_mapping_${tabId}`, JSON.stringify(state.mapping));
  }
  if (state.keepOriginal !== undefined) {
    safeSetStorage(`taka_keeporiginal_${tabId}`, JSON.stringify(state.keepOriginal));
  }
  if (state.constantMapping !== undefined) {
    safeSetStorage(`taka_constant_${tabId}`, JSON.stringify(state.constantMapping));
  }
  if (state.explicitEmptyCols !== undefined) {
    safeSetStorage(`taka_emptycols_${tabId}`, JSON.stringify(state.explicitEmptyCols));
  }
  if (state.preferredHeaders !== undefined) {
    safeSetStorage(`taka_prefheaders_${tabId}`, JSON.stringify(state.preferredHeaders));
  }
  if (state.isLocked !== undefined) {
    safeSetStorage(`taka_locked_${tabId}`, state.isLocked ? 'true' : 'false');
  }
  if (state.activePresetId !== undefined) {
    safeSetStorage(`taka_active_preset_${tabId}`, state.activePresetId);
  }
}

export function recordPreferredHeaderChoice(
  tabId: string,
  col: string,
  chosenHeader: string,
  currentPreferred: Record<string, string[]>
): Record<string, string[]> {
  const clean = String(chosenHeader || '').trim();
  if (!clean) return currentPreferred;
  const existingList = Array.isArray(currentPreferred[col]) ? currentPreferred[col] : [];
  const nextList = [
    clean,
    ...existingList.filter((h) => normalizeHeader(h) !== normalizeHeader(clean)),
  ].slice(0, 8);
  const updated = { ...currentPreferred, [col]: nextList };
  safeSetStorage(`taka_prefheaders_${tabId}`, JSON.stringify(updated));
  return updated;
}

export function loadLocalPresets(tabId: string): CsvMappingPreset[] {
  const raw = safeGetStorage(`taka_presets_${tabId}`);
  const parsed = safeJSONParse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveLocalPresets(tabId: string, presets: CsvMappingPreset[]): void {
  safeSetStorage(`taka_presets_${tabId}`, JSON.stringify(presets));
}

/**
 * Resolves the best column mapping for a newly uploaded file while strictly preserving
 * Admin's saved selections, learned header habits (`preferredHeaders`), and intentional static-only columns.
 */
export function resolveSmartColumnMappingForFile(params: {
  tabId: string;
  headers: string[];
  currentMapping: Record<string, string>;
  preferredHeaders: Record<string, string[]>;
  explicitEmptyCols: Record<string, boolean>;
  constantMapping: Record<string, string>;
}): Record<string, string> {
  const {
    tabId,
    headers,
    currentMapping,
    preferredHeaders,
    explicitEmptyCols,
    constantMapping,
  } = params;
  const cols = TAB_CONFIG[tabId]?.columns || [];
  const nextMapping: Record<string, string> = { ...currentMapping };

  const headerByNorm = new Map<string, string>();
  headers.forEach((h) => {
    const norm = normalizeHeader(h);
    if (norm && !headerByNorm.has(norm)) {
      headerByNorm.set(norm, h);
    }
  });

  const findHeaderMatch = (candidate: string): string | undefined => {
    if (!candidate) return undefined;
    if (headers.includes(candidate)) return candidate;
    return headerByNorm.get(normalizeHeader(candidate));
  };

  cols.forEach((targetCol) => {
    // 1. If Admin explicitly chose "-- Cột Excel --" (empty) and filled a static value, respect that choice
    if (explicitEmptyCols[targetCol] && constantMapping[targetCol]) {
      nextMapping[targetCol] = '';
      return;
    }

    // 2. Check currently selected/saved mapping for this column (exact or case/space-insensitive)
    const savedCol = currentMapping[targetCol];
    if (savedCol) {
      const matchedSaved = findHeaderMatch(savedCol);
      if (matchedSaved) {
        nextMapping[targetCol] = matchedSaved;
        return;
      }
    }

    // 3. Check Admin's learned habit history (`preferredHeaders`) in most-recently-used order
    const history = preferredHeaders[targetCol] || [];
    for (const histHeader of history) {
      const matchedHist = findHeaderMatch(histHeader);
      if (matchedHist) {
        nextMapping[targetCol] = matchedHist;
        return;
      }
    }

    // 4. Check exact/alias match against targetCol and known aliases
    const exactOrNorm = findHeaderMatch(targetCol);
    if (exactOrNorm) {
      nextMapping[targetCol] = exactOrNorm;
      return;
    }

    const aliases = COLUMN_ALIASES[targetCol] || [];
    for (const alias of aliases) {
      const matchedAlias = findHeaderMatch(alias);
      if (matchedAlias) {
        nextMapping[targetCol] = matchedAlias;
        return;
      }
    }

    // 5. Fallback substring match
    const targetLower = normalizeHeader(targetCol);
    const subMatch = headers.find((h) => {
      const hLower = normalizeHeader(h);
      return hLower && (hLower.includes(targetLower) || targetLower.includes(hLower));
    });
    if (subMatch) {
      nextMapping[targetCol] = subMatch;
    }
  });

  return nextMapping;
}

/**
 * Syncs Admin's habits & presets for all tabs to/from Firestore (`taka_config/csv_converter_habits`)
 * so any device or session automatically gets the pre-configured selections, ticks, and static values.
 */
export async function syncHabitToCloud(
  tabId: string,
  habit: TabHabitState,
  presets: CsvMappingPreset[]
): Promise<void> {
  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', CLOUD_HABITS_DOC_ID);
    await setDoc(
      docRef,
      {
        [`tabs_${tabId}`]: {
          mapping: habit.mapping,
          keepOriginal: habit.keepOriginal,
          constantMapping: habit.constantMapping,
          explicitEmptyCols: habit.explicitEmptyCols,
          preferredHeaders: habit.preferredHeaders,
          isLocked: habit.isLocked,
          activePresetId: habit.activePresetId,
          presets,
          updatedAt: Date.now(),
        },
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('[csvExportHabitService] Cloud habit sync skipped:', err);
  }
}

export async function pullHabitFromCloud(tabId: string): Promise<{
  habit?: Partial<TabHabitState>;
  presets?: CsvMappingPreset[];
} | null> {
  try {
    const docRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'taka_config', CLOUD_HABITS_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const tabData = data?.[`tabs_${tabId}`];
    if (!tabData || typeof tabData !== 'object') return null;
    return {
      habit: {
        mapping: tabData.mapping || {},
        keepOriginal: tabData.keepOriginal || {},
        constantMapping: tabData.constantMapping || {},
        explicitEmptyCols: tabData.explicitEmptyCols || {},
        preferredHeaders: tabData.preferredHeaders || {},
        isLocked: Boolean(tabData.isLocked),
        activePresetId: tabData.activePresetId || 'default',
      },
      presets: Array.isArray(tabData.presets) ? tabData.presets : undefined,
    };
  } catch {
    return null;
  }
}
