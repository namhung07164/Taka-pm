export const METHOD_SHEET_ROWS = [
  ['QUY ĐỊNH & HƯỚNG DẪN IMPORT DATA'],
  [],
  ['Cột', 'Quy tắc / Hướng dẫn'],
  [
    'Predecessor',
    "Nếu không check 'Giữ nguyên', hệ thống sẽ tự ghép với Project Code. (VD: 23 thành VN26#23). Nếu nhiều task cách nhau bằng dấu phẩy.",
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

export function buildMassTaskExportRows(params: {
  excelData: any[];
  templateData: any[];
  activeTab: string;
  mapping: Record<string, string>;
  constantMapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  unitSizeMap: Record<string, string>;
  getCellValue: (
    row: any,
    colName: string,
    activeTab: string,
    mapping: Record<string, string>,
    constantMapping: Record<string, string>,
    keepOriginal: Record<string, boolean>,
    unitSizeMap: Record<string, string>,
    rowIndex?: number
  ) => any;
}): any[] {
  const {
    excelData,
    templateData,
    activeTab,
    mapping,
    constantMapping,
    keepOriginal,
    unitSizeMap,
    getCellValue,
  } = params;

  const finalJson: any[] = [];
  for (const proj of excelData) {
    const projStore = getCellValue(proj, 'store', activeTab, mapping, constantMapping, keepOriginal, unitSizeMap);
    const projLocation = getCellValue(proj, 'location', activeTab, mapping, constantMapping, keepOriginal, unitSizeMap);
    const projCode = getCellValue(proj, 'projectCode', activeTab, mapping, constantMapping, keepOriginal, unitSizeMap);
    const projYear =
      getCellValue(proj, 'projectYear', activeTab, mapping, constantMapping, keepOriginal, unitSizeMap) ||
      getCellValue(proj, 'YEAR', activeTab, mapping, constantMapping, keepOriginal, unitSizeMap);

    let taskIndex = 0;
    for (const taskDef of templateData) {
      taskIndex++;
      const taskName = taskDef['Task name'] || '';

      const tcKey = Object.keys(taskDef).find((k) => {
        const clean = k.toLowerCase().replace(/á»¥/g, 'ụ').replace(/[^a-z0-9]/g, '');
        return clean.includes('subtaskcode') || clean.includes('taskcodephu') || clean.includes('subtask');
      });
      const mappedSubTaskCode = constantMapping['Sub-task code'] || proj[mapping['Sub-task code']];
      let subTaskCode =
        mappedSubTaskCode !== undefined && mappedSubTaskCode !== null && String(mappedSubTaskCode).trim() !== ''
          ? String(mappedSubTaskCode).trim()
          : tcKey
          ? taskDef[tcKey]
          : '';

      if (keepOriginal['Sub-task code'] || keepOriginal['Task code phụ']) {
        if (subTaskCode !== undefined && subTaskCode !== null && String(subTaskCode).trim() !== '') {
          subTaskCode = String(subTaskCode).trim();
        } else {
          subTaskCode = projCode ? `${projCode}#${taskIndex}` : String(taskIndex);
        }
      } else if (subTaskCode !== undefined && subTaskCode !== null && String(subTaskCode).trim() !== '') {
        const strVal = String(subTaskCode).trim();
        subTaskCode =
          projCode && !strVal.includes('#') && !strVal.startsWith(projCode) ? `${projCode}#${strVal}` : strVal;
      } else {
        subTaskCode = projCode ? `${projCode}#${taskIndex}` : String(taskIndex);
      }

      const ptKey = Object.keys(taskDef).find((k) => {
        const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean.includes('parenttaskcode') || clean.includes('parenttask') || clean.includes('taskme');
      });
      const mappedParentTaskCode = constantMapping['Parent task code'] || proj[mapping['Parent task code']];
      let parentTaskCode =
        mappedParentTaskCode !== undefined && mappedParentTaskCode !== null && String(mappedParentTaskCode).trim() !== ''
          ? String(mappedParentTaskCode).trim()
          : ptKey
          ? taskDef[ptKey]
          : '';

      if (!keepOriginal['Parent task code']) {
        if (parentTaskCode !== undefined && parentTaskCode !== null && String(parentTaskCode).trim() !== '') {
          const strVal = String(parentTaskCode).trim();
          if (projCode && !strVal.includes('#') && !strVal.includes('-') && !strVal.startsWith(projCode)) {
            parentTaskCode = `${projCode}#${strVal}`;
          } else {
            parentTaskCode = strVal;
          }
        } else {
          parentTaskCode = '';
        }
      } else {
        parentTaskCode = parentTaskCode !== undefined && parentTaskCode !== null ? String(parentTaskCode).trim() : '';
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
      const durKey = Object.keys(taskDef).find((k) => k.toLowerCase().trim() === 'duration');
      const duration =
        durKey && taskDef[durKey] !== undefined && taskDef[durKey] !== null
          ? String(taskDef[durKey])
          : taskDef['duration'] !== undefined && taskDef['duration'] !== null
          ? String(taskDef['duration'])
          : '';

      const predKey = Object.keys(taskDef).find((k) => {
        const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean.includes('predecessor') || clean === 'tiennhiem';
      });
      const templatePred = predKey ? taskDef[predKey] : '';
      const constPred = constantMapping['predecessor'];
      const projPred = mapping['predecessor'] ? proj[mapping['predecessor']] : '';
      let pred =
        constPred !== undefined && constPred !== null && String(constPred).trim() !== ''
          ? constPred
          : templatePred !== undefined && templatePred !== null && String(templatePred).trim() !== ''
          ? templatePred
          : projPred;

      if (pred !== undefined && pred !== null && String(pred).trim() !== '') {
        const strPred = String(pred).trim().replace(/^[,;\s]+|[,;\s]+$/g, '').trim();
        if (keepOriginal['predecessor']) {
          pred = strPred;
        } else if (projCode) {
          pred = strPred
            .split(/[,;]+/)
            .map((part) => {
              let cleanPart = part.trim();
              if (!cleanPart) return '';
              cleanPart = cleanPart.replace(/^([A-Za-z0-9_-]+)-(\d+)(\s*(?:FS|SS|FF|SF).*)?$/i, '$1#$2$3');
              if (cleanPart.includes('#') || cleanPart.toLowerCase().startsWith(String(projCode).toLowerCase())) {
                return cleanPart;
              }
              if (/^\d+/.test(cleanPart)) {
                return `${projCode}#${cleanPart}`;
              }
              return cleanPart;
            })
            .filter(Boolean)
            .join(', ');
        } else {
          pred = strPred;
        }
      }
      const mappedDelegation = constantMapping['delegation'] || proj[mapping['delegation']];
      const delegation =
        mappedDelegation !== undefined && mappedDelegation !== null && String(mappedDelegation).trim() !== ''
          ? String(mappedDelegation).trim()
          : taskDef['delegation'] !== undefined
          ? String(taskDef['delegation'])
          : 'true';
      const comments =
        taskDef['comments'] !== undefined ? taskDef['comments'] : constantMapping['comments'] || '';

      finalJson.push({
        store: projStore,
        location: projLocation,
        projectYear: projYear,
        projectCode: projCode,
        'Sub-task code': subTaskCode,
        'Task name': taskName,
        'Parent task code': parentTaskCode,
        start,
        finish,
        duration,
        party,
        predecessor: pred,
        delegation,
        comments,
      });
    }
  }
  return finalJson;
}
