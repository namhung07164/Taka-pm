import { Project } from '../../types';
import { parseCSV } from '../../lib/csvUtils';
import { cleanDurationString } from '../../lib/taskImportService';
import { parseCSVDate } from './detailCsvUtils';
import { validateTasksImportData, generateTaskErrorReportCSV, ImportValidationResult } from './importValidator';

export interface ParsedTasksFileResult {
  rawParsedRowsByProject: Map<string, Array<{ rowData: any; originalCsvIndex: number }>>;
  headers: string[];
  dataRows: string[][];
  validation: ImportValidationResult;
  errorReportCSV: string;
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

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const dataRows = rows.slice(1);

  // 1. Run Comprehensive Validation
  const validation = validateTasksImportData(headers, dataRows, projects);
  const errorReportCSV = validation.isValid ? '' : generateTaskErrorReportCSV(headers, dataRows, validation);

  const rawParsedRowsByProject = new Map<string, Array<{ rowData: any; originalCsvIndex: number }>>();

  // If validation failed, return immediately without parsing into project maps to ensure 0 writes
  if (!validation.isValid) {
    return {
      rawParsedRowsByProject,
      headers,
      dataRows,
      validation,
      errorReportCSV
    };
  }

  dataRows.forEach((row, rowIndex) => {
    if (row.length < headers.length) return;
    const t: any = {};

    headers.forEach((h, i) => {
      let key = h;
      if (h === 'task name') key = 'name';
      if (h === 'projectid' || h === 'project_id' || h === 'project id') key = 'projectId';
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

      if (['projectId', 'projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'importComment', 'parentTaskId', 'parentTaskCode', 'parentTaskName', 'isParent', 'level'].includes(key)) {
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

  return {
    rawParsedRowsByProject,
    headers,
    dataRows,
    validation,
    errorReportCSV
  };
}
