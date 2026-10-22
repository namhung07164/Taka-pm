import { TAB_CONFIG } from './csvExportTypes';
import { METHOD_SHEET_ROWS, buildMassTaskExportRows } from './csvMassTaskBuilder';

export const formatDateTime = (val: any, colName: string) => {
  if (!val && val !== 0) return '';

  const defaultTime =
    colName === 'start' ? '22:00' : colName === 'finish' ? '10:00' : '00:00';

  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const y = date.getUTCFullYear();

    if (colName === 'date' || colName === 'start month') {
      return `${m}/${d}/${y}`;
    }

    const hasTime = val % 1 !== 0;

    if (hasTime) {
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const min = String(date.getUTCMinutes()).padStart(2, '0');
      return `${m}/${d}/${y} ${hh}:${min}`;
    } else {
      return `${m}/${d}/${y} ${defaultTime}`;
    }
  }

  const dateStr = String(val);
  const parsedDate = new Date(dateStr);

  if (!isNaN(parsedDate.getTime())) {
    const m = parsedDate.getMonth() + 1;
    const d = parsedDate.getDate();
    const y = parsedDate.getFullYear();

    if (colName === 'date' || colName === 'start month') {
      return `${m}/${d}/${y}`;
    }

    if (dateStr.includes(':')) {
      const hh = String(parsedDate.getHours()).padStart(2, '0');
      const min = String(parsedDate.getMinutes()).padStart(2, '0');
      return `${m}/${d}/${y} ${hh}:${min}`;
    } else {
      return `${m}/${d}/${y} ${defaultTime}`;
    }
  }

  return val;
};

export const getCellValue = (
  row: any,
  colName: string,
  activeTab: string,
  mapping: Record<string, string>,
  constantMapping: Record<string, string>,
  keepOriginal: Record<string, boolean>,
  unitSizeMap: Record<string, string>,
  rowIndex?: number
) => {
  if (!row || typeof row !== 'object') return '';

  let val = constantMapping[colName] || row[mapping[colName]];

  if (activeTab === 'task') {
    const projCode =
      constantMapping['projectCode'] || row[mapping['projectCode']] || '';

    if (colName === 'Sub-task code') {
      if (keepOriginal['Sub-task code'] && val !== undefined && val !== null && String(val).trim() !== '') {
        // Keep original
      } else if (val !== undefined && val !== null && String(val).trim() !== '') {
        const strVal = String(val).trim();
        if (projCode && !strVal.includes('#') && !strVal.startsWith(projCode)) {
          val = `${projCode}#${strVal}`;
        } else {
          val = strVal;
        }
      } else {
        const lineNum = (rowIndex ?? 0) + 1;
        val = projCode ? `${projCode}#${lineNum}` : String(lineNum);
      }
    } else if (colName === 'Parent task code') {
      if (!keepOriginal['Parent task code'] && val !== undefined && val !== null && String(val).trim() !== '') {
        const strVal = String(val).trim();
        if (projCode && !strVal.includes('#') && !strVal.includes('-') && !strVal.startsWith(projCode)) {
          val = `${projCode}#${strVal}`;
        } else {
          val = strVal;
        }
      }
    } else if (colName.toLowerCase() === 'predecessor' && !keepOriginal[colName]) {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const strVal = String(val).trim();
        val = strVal.replace(/^([A-Za-z0-9_]+)-(\d+)(.*)$/, '$1#$2$3');
        if (projCode && !val.includes('#') && !val.toLowerCase().startsWith(projCode.toLowerCase())) {
          if (/^\d+/.test(val)) {
            val = `${projCode}#${val}`;
          }
        }
      }
    }
  }

  if (activeTab === 'size_unit') {
    if (colName === 'unit') {
      if (val === undefined || val === null || String(val).trim() === '')
        return 'Temp';
      return val;
    }
    if (colName === 'size') {
      if (val === undefined || val === null || String(val).trim() === '') {
        let u = constantMapping['unit'] || row[mapping['unit']];
        if (u === undefined || u === null || String(u).trim() === '') u = 'Temp';
        val = unitSizeMap[u];
      }
    }
  }

  const dateCols = ['date', 'start month', 'start', 'finish'];
  if (dateCols.includes(colName.toLowerCase())) {
    return formatDateTime(val, colName.toLowerCase());
  }

  return val !== undefined && val !== null ? String(val) : '';
};

interface ExportDataParams {
  activeTab: string;
  sheetNames: string[];
  workbook: any;
  mapping: Record<string, string>;
  constantMapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  templateData: any[];
  excelData: any[];
  unitSizeMap: Record<string, string>;
  setError: (msg: string) => void;
}

export async function executeCsvExport({
  activeTab,
  sheetNames,
  workbook,
  mapping,
  constantMapping,
  keepOriginal,
  templateData,
  excelData,
  unitSizeMap,
  setError,
}: ExportDataParams) {
  const targetCols = TAB_CONFIG[activeTab].columns;
  const xlsx = await import('xlsx');

  if (activeTab === 'investment') {
    const wb = xlsx.utils.book_new();
    for (const name of sheetNames) {
      const sourceJson = xlsx.utils.sheet_to_json(workbook!.Sheets[name], {
        defval: '',
      }) as any[];

      const headerRows = [
        [
          'Takashimaya Vietnam - MD Investment Plan',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          new Date().toLocaleDateString(),
        ],
        [
          'Noted: ※Permanent shop / ※POP up shop / ※New Event Hall',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        ],
        [],
        targetCols,
      ];

      const rowsByLevel: Record<string, any[]> = {};
      sourceJson.forEach((row) => {
        const levelKey = row[mapping['Level']] || 'Other';
        if (!rowsByLevel[levelKey]) rowsByLevel[levelKey] = [];

        const mappedRow = targetCols.map((col: string) => {
          if (constantMapping[col]) return constantMapping[col];
          return row[mapping[col]] || '';
        });
        rowsByLevel[levelKey].push(mappedRow);
      });

      const finalRows = [...headerRows];
      Object.keys(rowsByLevel).forEach((level) => {
        finalRows.push([level, '', '', '', '', '', '', 'Subtotal', '', '', '', '']);
        rowsByLevel[level].forEach((r) => finalRows.push(r));
      });

      const ws = xlsx.utils.aoa_to_sheet(finalRows);
      xlsx.utils.book_append_sheet(wb, ws, name.substring(0, 31));
    }
    xlsx.writeFile(wb, `${TAB_CONFIG[activeTab].fileNamePrefix}.xlsx`);
  } else if (activeTab === 'mass_task') {
    if (!templateData || templateData.length === 0) {
      setError('Vui lòng tải lên file template (Attached)');
      return;
    }

    const finalJson = buildMassTaskExportRows({
      excelData,
      templateData,
      activeTab,
      mapping,
      constantMapping,
      keepOriginal,
      unitSizeMap,
      getCellValue,
    });

    const wb = xlsx.utils.book_new();
    const wsData = xlsx.utils.json_to_sheet(finalJson, { header: targetCols });
    xlsx.utils.book_append_sheet(wb, wsData, 'Data');
    const wsMethod = xlsx.utils.aoa_to_sheet(METHOD_SHEET_ROWS);
    xlsx.utils.book_append_sheet(wb, wsMethod, 'Method');
    xlsx.writeFile(wb, `${TAB_CONFIG[activeTab].fileNamePrefix}.xlsx`);
  } else {
    const exportJson = excelData.map((row, rowIndex) => {
      const out: any = {};
      targetCols.forEach((col: string) => {
        out[col] = getCellValue(
          row,
          col,
          activeTab,
          mapping,
          constantMapping,
          keepOriginal,
          unitSizeMap,
          rowIndex
        );
      });
      return out;
    });

    const wb = xlsx.utils.book_new();
    const wsData = xlsx.utils.json_to_sheet(exportJson, { header: targetCols });
    xlsx.utils.book_append_sheet(wb, wsData, 'Data');
    const wsMethod = xlsx.utils.aoa_to_sheet(METHOD_SHEET_ROWS);
    xlsx.utils.book_append_sheet(wb, wsMethod, 'Method');
    xlsx.writeFile(wb, `${TAB_CONFIG[activeTab].fileNamePrefix}.xlsx`);
  }
}
