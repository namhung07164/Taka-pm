import { Project } from '../../types';
import { normalizeStoreCode, normalizeYearString } from '../../lib/taskDeduplicationService';
import { parseCSVDate } from './detailCsvUtils';
import { ImportErrorDetail, ImportValidationResult, generateTaskErrorReportCSV } from './importTypes';
import { normalizeDashes } from '../../lib/utils';
import { matchProjectCode } from '../../lib/projectDatesService';

export type { ImportErrorDetail, ImportValidationResult };
export { generateTaskErrorReportCSV };

/**
 * Deeply validates all rows in a task CSV / Excel file before import.
 * If any invalid, duplicate, or buggy data is found, returns isValid: false
 * with a full list of errors.
 */
export function validateTasksImportData(
  headers: string[],
  dataRows: string[][],
  existingProjects: Project[] = []
): ImportValidationResult {
  const errors: ImportErrorDetail[] = [];
  const errorRowNumbers = new Set<number>();
  const errorSummaryByType: Record<string, number> = {};

  const addError = (err: ImportErrorDetail) => {
    errors.push(err);
    errorRowNumbers.add(err.rowNumber);
    errorSummaryByType[err.errorType] = (errorSummaryByType[err.errorType] || 0) + 1;
  };

  const headerIndexMap = new Map<string, number>();
  headers.forEach((h, i) => headerIndexMap.set(h.trim().toLowerCase(), i));

  const getCol = (row: string[], ...names: string[]): string => {
    for (const name of names) {
      const idx = headerIndexMap.get(name.toLowerCase());
      if (idx !== undefined && idx < row.length) {
        return String(row[idx] || '').trim();
      }
    }
    return '';
  };

  const seenTaskNamesWithinFile = new Map<string, { rowNumber: number; rawName: string }>();
  const seenSubTaskCodesWithinFile = new Map<string, { rowNumber: number }>();

  const projectLookup = new Map<string, Project>();
  existingProjects.forEach(p => {
    const pCode = normalizeDashes(String(p.code || '')).trim().toLowerCase();
    const pYear = normalizeYearString(p.year);
    const pStore = normalizeStoreCode(p.store);
    if (pCode) {
      if (pYear && pStore) projectLookup.set(`${pCode}__${pYear}__${pStore}`, p);
      if (pStore) projectLookup.set(`${pCode}____${pStore}`, p);
      if (pYear) projectLookup.set(`${pCode}__${pYear}__`, p);
      if (!projectLookup.has(pCode)) projectLookup.set(pCode, p);
    }
    if (p.id) projectLookup.set(String(p.id).trim().toLowerCase(), p);
  });

  let totalDataRows = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const rowNumber = idx + 2;

    if (row.every(c => !String(c).trim())) continue;
    totalDataRows++;

    const projectCode = getCol(row, 'projectcode', 'project code', 'code');
    const projectYear = getCol(row, 'projectyear', 'project year', 'year');
    const projectStore = getCol(row, 'projectstore', 'project store', 'store');
    const taskName = getCol(row, 'task name', 'taskname', 'name');
    const subTaskCode = getCol(row, 'sub-task code', 'sub task code', 'subtask code', 'sub_task_code', 'taskcodephu', 'task code phu');
    const startDateRaw = getCol(row, 'start', 'start date', 'startdate');
    const finishDateRaw = getCol(row, 'finish', 'finish date', 'finishdate', 'end');
    const predecessor = getCol(row, 'predecessor', 'predecessors');

    // 1. Missing Required Fields
    if (!projectCode) {
      addError({
        rowNumber,
        projectCode: '(empty)',
        projectYear,
        projectStore,
        taskName: taskName || '(empty)',
        errorType: 'MISSING_FIELD',
        field: 'Project Code',
        message: 'Missing required field: Project Code.'
      });
    }

    if (!taskName) {
      addError({
        rowNumber,
        projectCode,
        projectYear,
        projectStore,
        taskName: '(empty)',
        errorType: 'MISSING_FIELD',
        field: 'Task Name',
        message: 'Missing required field: Task Name. Every task must have a name.'
      });
    }

    if (!projectYear) {
      addError({
        rowNumber,
        projectCode,
        projectYear: '(empty)',
        projectStore,
        taskName,
        errorType: 'MISSING_FIELD',
        field: 'Year',
        message: 'Missing required field: Year.'
      });
    } else {
      const yearNum = Number(projectYear);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'INVALID_DATA',
          field: 'Year',
          message: `Invalid Year '${projectYear}'. Must be a valid 4-digit year between 2000 and 2100.`
        });
      }
    }

    if (!projectStore) {
      addError({
        rowNumber,
        projectCode,
        projectYear,
        projectStore: '(empty)',
        taskName,
        errorType: 'MISSING_FIELD',
        field: 'Store',
        message: 'Missing required field: Store (must be HN or HCM).'
      });
    } else {
      const normStore = normalizeStoreCode(projectStore);
      if (normStore !== 'HN' && normStore !== 'HCM') {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'INVALID_DATA',
          field: 'Store',
          message: `Unrecognized Store '${projectStore}'. Store must be 'HN' or 'HCM'.`
        });
      }
    }

    // 2. Project Existence
    if (projectCode && existingProjects.length > 0) {
      const pCodeClean = normalizeDashes(projectCode).trim();
      const pCodeLower = pCodeClean.toLowerCase();
      const pYearNorm = normalizeYearString(projectYear);
      const pStoreNorm = normalizeStoreCode(projectStore);
      let foundProject = (pYearNorm && pStoreNorm && projectLookup.get(`${pCodeLower}__${pYearNorm}__${pStoreNorm}`)) ||
                         (pStoreNorm && projectLookup.get(`${pCodeLower}____${pStoreNorm}`)) ||
                         projectLookup.get(pCodeLower);

      if (!foundProject) {
        foundProject = existingProjects.find(p => {
          if (!p || p.isDeleted) return false;
          const codeMatch = matchProjectCode(p.code, pCodeClean);
          const storeMatch = !pStoreNorm || !p.store || normalizeStoreCode(p.store) === pStoreNorm;
          const yearMatch = !pYearNorm || p.year === undefined || p.year === null || normalizeYearString(p.year) === pYearNorm;
          return codeMatch && storeMatch && yearMatch;
        });
      }

      if (!foundProject) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'PROJECT_NOT_FOUND',
          field: 'Project Code',
          message: `Project '${projectCode}' (${projectYear || 'no year'} - ${projectStore || 'no store'}) was not found in database.`
        });
      }
    }

    // 3. Duplicate Task Within File
    if (projectCode && taskName) {
      const pYearNorm = normalizeYearString(projectYear);
      const pStoreNorm = normalizeStoreCode(projectStore);
      const projKey = `${projectCode.toLowerCase()}__${pYearNorm}__${pStoreNorm}`;
      
      const absTaskName = taskName.trim().toLowerCase().replace(/\s+/g, ' ');
      const taskNameKey = `${projKey}:::name:::${absTaskName}`;

      if (seenTaskNamesWithinFile.has(taskNameKey)) {
        const firstOccurrence = seenTaskNamesWithinFile.get(taskNameKey)!;
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'DUPLICATE',
          field: 'Task Name',
          message: `Duplicate task name '${taskName}' in project ${projectCode} (conflicts with Row ${firstOccurrence.rowNumber}).`
        });
      } else {
        seenTaskNamesWithinFile.set(taskNameKey, { rowNumber, rawName: taskName });
      }

      if (subTaskCode) {
        const subTaskCodeKey = `${projKey}:::code:::${subTaskCode.toLowerCase()}`;
        if (seenSubTaskCodesWithinFile.has(subTaskCodeKey)) {
          const firstCodeOccurrence = seenSubTaskCodesWithinFile.get(subTaskCodeKey)!;
          addError({
            rowNumber,
            projectCode,
            projectYear,
            projectStore,
            taskName,
            subTaskCode,
            errorType: 'DUPLICATE',
            field: 'Sub-task code',
            message: `Duplicate Sub-task Code '${subTaskCode}' in project ${projectCode} (conflicts with Row ${firstCodeOccurrence.rowNumber}).`
          });
        } else {
          seenSubTaskCodesWithinFile.set(subTaskCodeKey, { rowNumber });
        }
      }
    }

    // 4. Date Formats & Chronological Logic
    let parsedStart: string | null = null;
    let parsedFinish: string | null = null;

    if (startDateRaw) {
      parsedStart = parseCSVDate(startDateRaw);
      if (!parsedStart || isNaN(new Date(parsedStart).getTime())) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'INVALID_DATE',
          field: 'Start Date',
          message: `Invalid Start Date format '${startDateRaw}'. Expected YYYY-MM-DD or DD/MM/YYYY.`
        });
      }
    }

    if (finishDateRaw) {
      parsedFinish = parseCSVDate(finishDateRaw);
      if (!parsedFinish || isNaN(new Date(parsedFinish).getTime())) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'INVALID_DATE',
          field: 'Finish Date',
          message: `Invalid Finish Date format '${finishDateRaw}'. Expected YYYY-MM-DD or DD/MM/YYYY.`
        });
      }
    }

    if (parsedStart && parsedFinish) {
      const startTime = new Date(parsedStart).getTime();
      const finishTime = new Date(parsedFinish).getTime();
      if (startTime > finishTime) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          errorType: 'DATE_LOGIC',
          field: 'Start/Finish Dates',
          message: `Date Logic Error: Start date (${parsedStart}) is later than Finish date (${parsedFinish}).`
        });
      }
    }

    // 5. Predecessor Self-Reference
    if (predecessor && subTaskCode) {
      if (predecessor.toUpperCase().includes(subTaskCode.toUpperCase())) {
        addError({
          rowNumber,
          projectCode,
          projectYear,
          projectStore,
          taskName,
          subTaskCode,
          errorType: 'PREDECESSOR_ERROR',
          field: 'Predecessor',
          message: `Invalid Predecessor: Task cannot reference itself ('${subTaskCode}') as a predecessor.`
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    totalRows: totalDataRows,
    validRowsCount: totalDataRows - errorRowNumbers.size,
    errorCount: errors.length,
    errors,
    errorRowNumbers,
    errorSummaryByType
  };
}

/**
 * Validates project CSV data rows.
 */
export function validateProjectsImportData(
  headers: string[],
  dataRows: string[][]
): ImportValidationResult {
  const errors: ImportErrorDetail[] = [];
  const errorRowNumbers = new Set<number>();
  const errorSummaryByType: Record<string, number> = {};

  const addError = (err: ImportErrorDetail) => {
    errors.push(err);
    errorRowNumbers.add(err.rowNumber);
    errorSummaryByType[err.errorType] = (errorSummaryByType[err.errorType] || 0) + 1;
  };

  const headerIndexMap = new Map<string, number>();
  headers.forEach((h, i) => headerIndexMap.set(h.trim().toLowerCase(), i));

  const getCol = (row: string[], ...names: string[]): string => {
    for (const name of names) {
      const idx = headerIndexMap.get(name.toLowerCase());
      if (idx !== undefined && idx < row.length) {
        return String(row[idx] || '').trim();
      }
    }
    return '';
  };

  const seenProjectCodes = new Map<string, number>();
  let totalDataRows = 0;

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const rowNumber = idx + 2;

    if (row.every(c => !String(c).trim())) continue;
    totalDataRows++;

    const code = getCol(row, 'code', 'projectcode', 'project code');
    const year = getCol(row, 'year', 'projectyear', 'project year');
    const store = getCol(row, 'store', 'projectstore', 'project store');
    const name = getCol(row, 'name', 'project name', 'projectname');

    if (!code) {
      addError({
        rowNumber,
        projectCode: '(empty)',
        projectYear: year,
        projectStore: store,
        taskName: name,
        errorType: 'MISSING_FIELD',
        field: 'Project Code',
        message: 'Missing required field: Project Code.'
      });
    }

    if (!year) {
      addError({
        rowNumber,
        projectCode: code,
        projectYear: '(empty)',
        projectStore: store,
        taskName: name,
        errorType: 'MISSING_FIELD',
        field: 'Year',
        message: 'Missing required field: Year.'
      });
    } else {
      const yearNum = Number(year);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        addError({
          rowNumber,
          projectCode: code,
          projectYear: year,
          projectStore: store,
          taskName: name,
          errorType: 'INVALID_DATA',
          field: 'Year',
          message: `Invalid Year '${year}'. Year must be a 4-digit number between 2000 and 2100.`
        });
      }
    }

    if (!store) {
      addError({
        rowNumber,
        projectCode: code,
        projectYear: year,
        projectStore: '(empty)',
        taskName: name,
        errorType: 'MISSING_FIELD',
        field: 'Store',
        message: 'Missing required field: Store (must be HN or HCM).'
      });
    } else {
      const normStore = normalizeStoreCode(store);
      if (normStore !== 'HN' && normStore !== 'HCM') {
        addError({
          rowNumber,
          projectCode: code,
          projectYear: year,
          projectStore: store,
          taskName: name,
          errorType: 'INVALID_DATA',
          field: 'Store',
          message: `Unrecognized Store '${store}'. Must be 'HN' or 'HCM'.`
        });
      }
    }

    if (code && year && store) {
      const pKey = `${code.toLowerCase()}__${normalizeYearString(year)}__${normalizeStoreCode(store)}`;
      if (seenProjectCodes.has(pKey)) {
        const firstRow = seenProjectCodes.get(pKey)!;
        addError({
          rowNumber,
          projectCode: code,
          projectYear: year,
          projectStore: store,
          taskName: name,
          errorType: 'DUPLICATE',
          field: 'Project Code',
          message: `Duplicate Project Code '${code}' for Year ${year} - Store ${store} (conflicts with Row ${firstRow}).`
        });
      } else {
        seenProjectCodes.set(pKey, rowNumber);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    totalRows: totalDataRows,
    validRowsCount: totalDataRows - errorRowNumbers.size,
    errorCount: errors.length,
    errors,
    errorRowNumbers,
    errorSummaryByType
  };
}
