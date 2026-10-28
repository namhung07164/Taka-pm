import { Project } from '../../types';
import { parseCSV } from '../../lib/csvUtils';
import { cleanDurationString } from '../../lib/taskImportService';
import { parseCSVDate } from './detailCsvUtils';
import { validateTasksImportData, generateTaskErrorReportCSV, ImportValidationResult } from './importValidator';
import { hydrateProjectsForImport, RawImportProjectKey } from './detailProjectImportHydrator';
import { normalizeDashes } from '../../lib/utils';
import { matchProjectCode } from '../../lib/projectDatesService';

export interface ParsedTasksFileResult {
  rawParsedRowsByProject: Map<string, Array<{ rowData: any; originalCsvIndex: number }>>;
  headers: string[];
  dataRows: string[][];
  validation: ImportValidationResult;
  errorReportCSV: string;
  allKnownProjects: Project[];
}

export async function parseTasksFile(
  file: File,
  projects: Project[]
): Promise<ParsedTasksFileResult> {
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
    throw new Error('CSV file is empty or format is invalid. At least 1 header row and 1 data row are required.');
  }

  const headers = rows[0].map(h => String(h || '').replace(/^\uFEFF/, '').trim().toLowerCase());
  const dataRows = rows.slice(1);

  // Extract project keys from data rows (including cross-project predecessor references) to hydrate any projects not yet loaded in active year view
  const pCodeIdx = headers.findIndex(h => ['projectcode', 'project code', 'code'].includes(h));
  const pYearIdx = headers.findIndex(h => ['projectyear', 'project year', 'year'].includes(h));
  const pStoreIdx = headers.findIndex(h => ['projectstore', 'project store', 'store'].includes(h));
  const predIdx = headers.findIndex(h =>
    ['predecessor', 'predecessors', 'predecessor code', 'predecessor_code', 'predecessorcode', 'tiền nhiệm', 'tien nhiem'].includes(h)
  );

  const rawKeys: RawImportProjectKey[] = [];
  dataRows.forEach(r => {
    const year = pYearIdx !== -1 ? String(r[pYearIdx] || '').trim() : undefined;
    const store = pStoreIdx !== -1 ? String(r[pStoreIdx] || '').trim() : undefined;
    if (pCodeIdx !== -1) {
      const code = String(r[pCodeIdx] || '').trim();
      if (code) {
        rawKeys.push({ projectCode: code, projectYear: year, projectStore: store });
      }
    }
    if (predIdx !== -1) {
      const rawPred = normalizeDashes(String(r[predIdx] || '')).trim();
      if (rawPred) {
        rawPred.split(/[,;]+/).forEach(tok => {
          const cleanTok = tok.trim();
          const hashIdx = cleanTok.indexOf('#');
          if (hashIdx > 0) {
            const extCode = cleanTok.substring(0, hashIdx).trim();
            if (extCode) {
              rawKeys.push({ projectCode: extCode, projectYear: year, projectStore: store });
              rawKeys.push({ projectCode: extCode });
            }
          }
        });
      }
    }
  });

  const allKnownProjects = await hydrateProjectsForImport(rawKeys, projects);

  // 1. Run Comprehensive Validation against all known projects across all years
  const validation = validateTasksImportData(headers, dataRows, allKnownProjects);
  const errorReportCSV = validation.isValid ? '' : generateTaskErrorReportCSV(headers, dataRows, validation);

  const rawParsedRowsByProject = new Map<string, Array<{ rowData: any; originalCsvIndex: number }>>();

  // If validation failed, return immediately without parsing into project maps to ensure 0 writes
  if (!validation.isValid) {
    return {
      rawParsedRowsByProject,
      headers,
      dataRows,
      validation,
      errorReportCSV,
      allKnownProjects
    };
  }

  dataRows.forEach((row, rowIndex) => {
    if (!row || row.every(c => !String(c || '').trim())) return;
    const t: any = {};

    headers.forEach((h, i) => {
      let key = h;
      if (h === 'task name' || h === 'taskname') key = 'name';
      if (h === 'projectid' || h === 'project_id' || h === 'project id') key = 'projectId';
      if (h === 'projectcode' || h === 'project code' || h === 'code') key = 'projectCode';
      if (h === 'year' || h === 'projectyear' || h === 'project year') key = 'projectYear';
      if (h === 'store' || h === 'projectstore' || h === 'project store') key = 'projectStore';
      if (h === 'start date' || h === 'startdate') key = 'start';
      if (h === 'finish date' || h === 'finishdate' || h === 'end') key = 'finish';
      if (h === 'durations') key = 'duration';
      if (h === 'pic' || h === 'department') key = 'party';
      if (h === 'predecessor' || h === 'predecessors' || h === 'predecessor code' || h === 'predecessor_code' || h === 'predecessorcode' || h === 'tiền nhiệm' || h === 'tien nhiem') {
        key = 'predecessor';
      }
      if (h === 'sub-task code' || h === 'sub task code' || h === 'subtask code' || h === 'sub_task_code' || h === 'taskcodephu' || h === 'task code phu' || h === 'task_code_phu' || h === 'task code phụ') {
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

      if (['projectId', 'projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'importComment', 'parentTaskId', 'parentTaskCode', 'parentTaskName', 'isParent', 'level'].includes(key)) {
        let val: any = row[i] !== undefined ? row[i] : '';
        if (key === 'start' || key === 'finish') {
          val = parseCSVDate(val);
        } else if (key === 'duration') {
          val = cleanDurationString(val);
        } else if (key === 'predecessor') {
          val = normalizeDashes(String(val ?? '')).trim().replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
        } else if (key === 'delegation') {
          const strVal = String(val ?? '').trim().toLowerCase();
          if (strVal === '') {
            val = undefined;
          } else {
            val = !(strVal === 'false' || strVal === '0' || strVal === 'no' || strVal === 'off');
          }
        } else if (key === 'realtimeUpdate') {
          const strVal = String(val ?? '').trim().toLowerCase();
          val = (strVal === 'true' || strVal === '1' || strVal === 'yes' || strVal === 'on');
        } else if (key === 'projectYear') {
          val = isNaN(Number(val)) ? val : Number(val);
        }
        t[key] = val;
      }
    });

    if (t.projectCode && t.name) {
      const cleanPCode = normalizeDashes(t.projectCode).trim();
      t.projectCode = cleanPCode;
      if (!t.projectYear || !t.projectStore) {
        const possibleProjects = allKnownProjects.filter(p => matchProjectCode(p.code, cleanPCode));
        if (possibleProjects.length === 1) {
          if (!t.projectYear) t.projectYear = possibleProjects[0].year;
          if (!t.projectStore) t.projectStore = possibleProjects[0].store;
        }
      }

      if (!t.projectYear) {
        const matchedProj = allKnownProjects.find(p => matchProjectCode(p.code, cleanPCode));
        t.projectYear = (matchedProj?.year && !isNaN(Number(matchedProj.year))) ? Number(matchedProj.year) : new Date().getFullYear();
      }

      if (t.projectYear !== undefined && !isNaN(Number(t.projectYear))) {
        t.projectYear = Number(t.projectYear);
      } else {
        t.projectYear = new Date().getFullYear();
      }

      const yearKey = t.projectYear ? String(t.projectYear).trim().toLowerCase() : '';
      const storeKey = t.projectStore ? String(t.projectStore).trim().toLowerCase() : '';
      const prjKey = `${String(cleanPCode).toLowerCase()}_${yearKey}_${storeKey}`;

      if (!rawParsedRowsByProject.has(prjKey)) {
        rawParsedRowsByProject.set(prjKey, []);
      }
      rawParsedRowsByProject.get(prjKey)!.push({ rowData: t, originalCsvIndex: rowIndex });
    }
  });

  return {
    rawParsedRowsByProject,
    headers,
    dataRows,
    validation,
    errorReportCSV,
    allKnownProjects
  };
}
