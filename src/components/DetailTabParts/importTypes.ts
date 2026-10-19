import { generateCSV } from '../../lib/csvUtils';

export interface ImportErrorDetail {
  rowNumber: number; // 1-indexed row number in the file (header is row 1, data starts at 2)
  projectCode: string;
  projectYear: string;
  projectStore: string;
  taskName: string;
  subTaskCode?: string;
  errorType: 'DUPLICATE' | 'MISSING_FIELD' | 'INVALID_DATE' | 'DATE_LOGIC' | 'PROJECT_NOT_FOUND' | 'PREDECESSOR_ERROR' | 'INVALID_DATA';
  field: string;
  message: string;
}

export interface ImportValidationResult {
  isValid: boolean;
  totalRows: number;
  validRowsCount: number;
  errorCount: number;
  errors: ImportErrorDetail[];
  errorRowNumbers: Set<number>;
  errorSummaryByType: Record<string, number>;
}

/**
 * Generates an enriched Error Report CSV pointing out exact row issues.
 */
export function generateTaskErrorReportCSV(
  originalHeaders: string[],
  dataRows: string[][],
  validationResult: ImportValidationResult
): string {
  const errorMap = new Map<number, ImportErrorDetail[]>();
  validationResult.errors.forEach(err => {
    if (!errorMap.has(err.rowNumber)) {
      errorMap.set(err.rowNumber, []);
    }
    errorMap.get(err.rowNumber)!.push(err);
  });

  const reportHeaders = [
    'Row In File',
    'Status',
    'Error Count',
    'Error Types',
    'Error Details (What To Fix)',
    ...originalHeaders
  ];

  const reportRows: string[][] = [];

  for (let idx = 0; idx < dataRows.length; idx++) {
    const row = dataRows[idx];
    const rowNumber = idx + 2;
    if (row.every(c => !String(c).trim())) continue;

    const rowErrors = errorMap.get(rowNumber);
    const hasError = Boolean(rowErrors && rowErrors.length > 0);

    const status = hasError ? 'FAILED / ERROR' : 'PASSED';
    const errCount = hasError ? String(rowErrors!.length) : '0';
    const errorTypes = hasError ? Array.from(new Set(rowErrors!.map(e => e.errorType))).join(' | ') : 'None';
    const errorDetails = hasError
      ? rowErrors!.map((e, i) => `[Issue ${i + 1}] (${e.field}): ${e.message}`).join('; ')
      : 'No errors found';

    reportRows.push([
      `Row ${rowNumber}`,
      status,
      errCount,
      errorTypes,
      errorDetails,
      ...row
    ]);
  }

  return generateCSV(reportHeaders, reportRows);
}
