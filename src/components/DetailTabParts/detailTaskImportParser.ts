import { Project } from '../../types';
import { parseCSV } from '../../lib/csvUtils';
import { cleanDurationString } from '../../lib/taskImportService';
import { parseCSVDate } from './detailCsvUtils';

export async function parseTasksFile(
  file: File,
  projects: Project[]
): Promise<Map<string, Array<{ rowData: any; originalCsvIndex: number }>>> {
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
    throw new Error('CSV file is empty or format is invalid.');
  }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  const dataRows = rows.slice(1);

  // Field validation
  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    if (row.every(c => !String(c).trim())) continue;

    let hasYear = false;
    let hasStore = false;
    let hasCode = false;

    headers.forEach((h, i) => {
      const val = String(row[i] || '').trim();
      if ((h === 'year' || h === 'projectyear') && val) hasYear = true;
      if ((h === 'store' || h === 'projectstore') && val) hasStore = true;
      if ((h === 'code' || h === 'projectcode') && val) hasCode = true;
    });

    if (!hasYear || !hasStore || !hasCode) {
      throw new Error(`Row ${idx + 2} is missing Year, Store, or Project Code. All imported data must include these three fields.`);
    }
  }

  const rawParsedRowsByProject = new Map<string, Array<{ rowData: any; originalCsvIndex: number }>>();

  dataRows.forEach((row, rowIndex) => {
    if (row.length < headers.length) return;
    const t: any = {};

    headers.forEach((h, i) => {
      let key = h;
      if (h === 'task name') key = 'name';
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

      if (['projectCode', 'projectYear', 'projectStore', 'name', 'start', 'finish', 'duration', 'party', 'predecessor', 'taskCodePhu', 'orderIndex', 'delegation', 'realtimeUpdate', 'importComment', 'parentTaskId', 'parentTaskCode', 'parentTaskName', 'isParent', 'level'].includes(key)) {
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

  return rawParsedRowsByProject;
}
