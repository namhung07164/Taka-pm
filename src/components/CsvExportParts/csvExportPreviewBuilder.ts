import { TAB_CONFIG } from './csvExportTypes';
import { getCellValue } from './csvExportProcessing';

export interface BuildCsvPreviewParams {
  activeTab: string;
  excelData: any[];
  templateData: any[];
  mapping: Record<string, string>;
  constantMapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  unitSizeMap: Record<string, string>;
}

export function buildCsvPreviewData({
  activeTab,
  excelData,
  templateData,
  mapping,
  constantMapping,
  keepOriginal,
  unitSizeMap,
}: BuildCsvPreviewParams): any[] {
  if (!excelData || excelData.length === 0) return [];

  if (activeTab === 'mass_task') {
    if (!templateData || templateData.length === 0) return [];
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

      let taskIndex = 0;
      for (const taskDef of templateData) {
        if (finalJson.length >= 10) return finalJson;
        taskIndex++;
        const taskName = taskDef['Task name'] || '';

        const tcKey = Object.keys(taskDef).find((k) => {
          const clean = k
            .toLowerCase()
            .replace(/á»¥/g, 'ụ')
            .replace(/[^a-z0-9]/g, '');
          return clean.includes('subtaskcode') || clean.includes('taskcodephu') || clean.includes('subtask');
        });
        let subTaskCode = tcKey ? taskDef[tcKey] : '';
        if (
          keepOriginal['Sub-task code'] ||
          keepOriginal['Task code phụ']
        ) {
          if (subTaskCode !== undefined && subTaskCode !== null && String(subTaskCode).trim() !== '') {
            subTaskCode = String(subTaskCode).trim();
          } else {
            subTaskCode = projCode ? `${projCode}#${taskIndex}` : String(taskIndex);
          }
        } else if (
          subTaskCode !== undefined &&
          subTaskCode !== null &&
          String(subTaskCode).trim() !== ''
        ) {
          const strVal = String(subTaskCode).trim();
          subTaskCode = projCode && !strVal.includes('#') ? `${projCode}#${strVal}` : strVal;
        } else {
          subTaskCode = projCode ? `${projCode}#${taskIndex}` : String(taskIndex);
        }

        const ptKey = Object.keys(taskDef).find((k) => {
          const clean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          return clean.includes('parenttaskcode') || clean.includes('parenttask') || clean.includes('taskme');
        });
        let parentTaskCode = ptKey ? taskDef[ptKey] : '';
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
          pred = projCode
            ? `${projCode}-${String(pred).trim()}`
            : String(pred).trim();
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
          'Sub-task code': subTaskCode,
          'Task name': taskName,
          'Parent task code': parentTaskCode,
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
    return finalJson;
  }

  return excelData.slice(0, 10).map((row, rowIndex) => {
    const parsedRow: any = {};
    TAB_CONFIG[activeTab].columns.forEach((c: string) => {
      parsedRow[c] = getCellValue(
        row,
        c,
        activeTab,
        mapping,
        constantMapping,
        keepOriginal,
        unitSizeMap,
        rowIndex
      );
    });
    return parsedRow;
  });
}
