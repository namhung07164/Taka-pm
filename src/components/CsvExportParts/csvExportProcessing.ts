import { TAB_CONFIG } from './csvExportTypes';

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
  unitSizeMap: Record<string, string>
) => {
  if (!row || typeof row !== 'object') return '';

  let val = constantMapping[colName] || row[mapping[colName]];

  if (
    activeTab === 'task' &&
    colName.toLowerCase() === 'predecessor' &&
    !keepOriginal[colName]
  ) {
    const projCode =
      constantMapping['projectCode'] || row[mapping['projectCode']] || '';
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      val = `${projCode}-${val}`;
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
        finalRows.push([
          level,
          '',
          '',
          '',
          '',
          '',
          '',
          'Subtotal',
          '',
          '',
          '',
          '',
        ]);
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

    const finalJson: any[] = [];
    for (const proj of excelData) {
      const projStore = getCellValue(
        proj,
        'store',
        activeTab,
        mapping,
        constantMapping,
        keepOriginal,
        unitSizeMap
      );
      const projLocation = getCellValue(
        proj,
        'location',
        activeTab,
        mapping,
        constantMapping,
        keepOriginal,
        unitSizeMap
      );
      const projCode = getCellValue(
        proj,
        'projectCode',
        activeTab,
        mapping,
        constantMapping,
        keepOriginal,
        unitSizeMap
      );
      const projYear =
        getCellValue(
          proj,
          'projectYear',
          activeTab,
          mapping,
          constantMapping,
          keepOriginal,
          unitSizeMap
        ) ||
        getCellValue(
          proj,
          'YEAR',
          activeTab,
          mapping,
          constantMapping,
          keepOriginal,
          unitSizeMap
        );

      for (const taskDef of templateData) {
        const taskName = taskDef['Task name'] || '';
        const tcKey = Object.keys(taskDef).find((k) => {
          const clean = k
            .toLowerCase()
            .replace(/á»¥/g, 'ụ')
            .replace(/\s+/g, '');
          return clean.includes('taskcodeph') || clean.includes('taskcodephu');
        });
        let taskCodePhu = tcKey ? taskDef[tcKey] : '';
        if (
          !keepOriginal['Task code phụ'] &&
          taskCodePhu !== undefined &&
          taskCodePhu !== null &&
          String(taskCodePhu).trim() !== ''
        ) {
          taskCodePhu = projCode
            ? `${projCode}#${String(taskCodePhu).trim()}`
            : String(taskCodePhu).trim();
        }
        let start = taskDef['start'] || '';
        let finish = taskDef['finish'] || '';

        const formatExcelDate = (val: any) => {
          if (typeof val !== 'number') return val;
          const date = new Date((val - 25569) * 86400 * 1000);
          return (
            date.toLocaleDateString('en-US') +
            ' ' +
            date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })
          );
        };
        if (typeof start === 'number') start = formatExcelDate(start);
        if (typeof finish === 'number') finish = formatExcelDate(finish);

        const party = taskDef['party'] || '';
        const duration =
          taskDef['duration'] !== undefined ? taskDef['duration'] : '';
        const predKey = Object.keys(taskDef).find(
          (k) => k.toLowerCase().replace(/\s+/g, '') === 'predecessor'
        );
        const templatePred = predKey ? taskDef[predKey] : '';
        const mappedPred =
          constantMapping['predecessor'] || proj[mapping['predecessor']];
        let pred =
          mappedPred !== undefined &&
          mappedPred !== null &&
          String(mappedPred).trim() !== ''
            ? mappedPred
            : templatePred;
        if (
          !keepOriginal['predecessor'] &&
          pred !== undefined &&
          pred !== null &&
          String(pred).trim() !== ''
        ) {
          pred = projCode ? `${projCode}-${String(pred).trim()}` : String(pred).trim();
        }
        const delegation =
          taskDef['delegation'] !== undefined
            ? taskDef['delegation']
            : constantMapping['delegation'] || 'true';
        const comments =
          taskDef['comments'] !== undefined
            ? taskDef['comments']
            : constantMapping['comments'] || '';

        finalJson.push({
          store: projStore,
          location: projLocation,
          projectYear: projYear,
          projectCode: projCode,
          'Task code phụ': taskCodePhu,
          'Task name': taskName,
          start: start,
          finish: finish,
          duration: duration,
          party: party,
          predecessor: pred,
          delegation: delegation,
          comments: comments,
        });
      }
    }

    const wb = xlsx.utils.book_new();
    const wsData = xlsx.utils.json_to_sheet(finalJson, { header: targetCols });
    xlsx.utils.book_append_sheet(wb, wsData, 'Data');

    const methodRows = [
      ['QUY ĐỊNH & HƯỚNG DẪN IMPORT DATA'],
      [],
      ['Cột', 'Quy tắc / Hướng dẫn'],
      [
        'Predecessor',
        "Nếu không check 'Giữ nguyên', hệ thống sẽ tự ghép với Project Code. (VD: 23 thành VN26-23). Nếu nhiều task cách nhau bằng dấu phẩy.",
      ],
      ['Task code phụ', 'Hệ thống tự động ghép với Project Code ở đầu.'],
      [
        'Comments',
        "Để xóa nội dung comments hiện tại trên hệ thống, bạn hãy điền một khoảng trắng (Space) vào ô này, hoặc nhập khoảng trắng ở 'Giá trị tĩnh'.",
      ],
      [
        'Start / Finish',
        'Định dạng chuẩn: MM/DD/YYYY HH:mm. Nếu không có giờ, Start mặc định là 22:00, Finish là 10:00.',
      ],
      ['Delegation', "Mặc định nếu để trống sẽ là 'true'."],
      [],
      [
        'LƯU Ý QUAN TRỌNG:',
        "Hệ thống Takashimaya hiện tại chỉ import được file đuôi .csv. Bạn hãy chỉnh sửa trên file này, sau đó mở Sheet 'Data' và chọn Save As -> định dạng CSV (Comma delimited) trước khi import nhé!",
      ],
    ];
    const wsMethod = xlsx.utils.aoa_to_sheet(methodRows);
    xlsx.utils.book_append_sheet(wb, wsMethod, 'Method');

    xlsx.writeFile(wb, `${TAB_CONFIG[activeTab].fileNamePrefix}.xlsx`);
  } else {
    const exportJson = excelData.map((row) => {
      const out: any = {};
      targetCols.forEach((col: string) => {
        out[col] = getCellValue(
          row,
          col,
          activeTab,
          mapping,
          constantMapping,
          keepOriginal,
          unitSizeMap
        );
      });
      return out;
    });

    const wb = xlsx.utils.book_new();
    const wsData = xlsx.utils.json_to_sheet(exportJson, { header: targetCols });
    xlsx.utils.book_append_sheet(wb, wsData, 'Data');

    const methodRows = [
      ['QUY ĐỊNH & HƯỚNG DẪN IMPORT DATA'],
      [],
      ['Cột', 'Quy tắc / Hướng dẫn'],
      [
        'Predecessor',
        "Nếu không check 'Giữ nguyên', hệ thống sẽ tự ghép với Project Code. (VD: 23 thành VN26-23). Nếu nhiều task cách nhau bằng dấu phẩy.",
      ],
      ['Task code phụ', 'Hệ thống tự động ghép với Project Code ở đầu.'],
      [
        'Comments',
        "Để xóa nội dung comments hiện tại trên hệ thống, bạn hãy điền một khoảng trắng (Space) vào ô này, hoặc nhập khoảng trắng ở 'Giá trị tĩnh'.",
      ],
      [
        'Start / Finish',
        'Định dạng chuẩn: MM/DD/YYYY HH:mm. Nếu không có giờ, Start mặc định là 22:00, Finish là 10:00.',
      ],
      ['Delegation', "Mặc định nếu để trống sẽ là 'true'."],
      [],
      [
        'LƯU Ý QUAN TRỌNG:',
        "Hệ thống Takashimaya hiện tại chỉ import được file đuôi .csv. Bạn hãy chỉnh sửa trên file này, sau đó mở Sheet 'Data' và chọn Save As -> định dạng CSV (Comma delimited) trước khi import nhé!",
      ],
    ];
    const wsMethod = xlsx.utils.aoa_to_sheet(methodRows);
    xlsx.utils.book_append_sheet(wb, wsMethod, 'Method');

    xlsx.writeFile(wb, `${TAB_CONFIG[activeTab].fileNamePrefix}.xlsx`);
  }
}
