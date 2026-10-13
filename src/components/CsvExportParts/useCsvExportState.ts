import React, { useMemo, useState } from 'react';
import {
  TAB_CONFIG,
  safeJSONParse,
  safeGetStorage,
  safeSetStorage,
} from './csvExportTypes';
import { getCellValue, executeCsvExport } from './csvExportProcessing';

export function useCsvExportState() {
  const [file, setFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<any | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [excelData, setExcelData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateData, setTemplateData] = useState<any[]>([]);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('project');
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return safeGetStorage('taka_locked_project') === 'true';
  });

  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const saved = safeGetStorage('taka_mapping_project');
    const parsed = safeJSONParse(saved);
    return TAB_CONFIG['project'].columns.reduce(
      (acc: any, col: string) => ({ ...acc, [col]: parsed[col] || '' }),
      {}
    );
  });

  const [keepOriginal, setKeepOriginal] = useState<Record<string, boolean>>(() => {
    const saved = safeGetStorage('taka_keeporiginal_project');
    const parsed = safeJSONParse(saved);
    return TAB_CONFIG['project'].columns.reduce(
      (acc: any, col: string) => ({ ...acc, [col]: !!parsed[col] }),
      {}
    );
  });

  const [constantMapping, setConstantMapping] = useState<
    Record<string, string>
  >(() => {
    const saved = safeGetStorage('taka_constant_project');
    const parsed = safeJSONParse(saved);
    return TAB_CONFIG['project'].columns.reduce(
      (acc: any, col: string) => ({
        ...acc,
        [col]:
          parsed[col] !== undefined
            ? parsed[col]
            : col === 'delegation'
              ? 'true'
              : '',
      }),
      {}
    );
  });

  const unitSizeMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (
      activeTab !== 'size_unit' ||
      !Array.isArray(excelData) ||
      excelData.length === 0
    )
      return map;

    excelData.forEach((row) => {
      if (!row || typeof row !== 'object') return;

      let u = constantMapping['unit'] || row[mapping['unit']];
      if (u === undefined || u === null || String(u).trim() === '') u = 'Temp';

      const s = constantMapping['size'] || row[mapping['size']];
      if (s !== undefined && s !== null && String(s).trim() !== '') {
        map[u] = s;
      }
    });
    return map;
  }, [activeTab, excelData, mapping, constantMapping]);

  const switchTab = (tabId: string) => {
    setActiveTab(tabId);
    setFile(null);
    setExcelData([]);
    setExcelHeaders([]);
    setWorkbook(null);
    setSheetNames([]);
    setActiveSheet('');
    setTemplateFile(null);
    setTemplateData([]);
    setError('');

    const savedMapping = safeGetStorage(`taka_mapping_${tabId}`);
    const parsedMapping = safeJSONParse(savedMapping);
    setMapping(
      TAB_CONFIG[tabId].columns.reduce(
        (acc: any, col: string) => ({ ...acc, [col]: parsedMapping[col] || '' }),
        {}
      )
    );

    const savedConstant = safeGetStorage(`taka_constant_${tabId}`);
    const parsedConstant = safeJSONParse(savedConstant);
    setConstantMapping(
      TAB_CONFIG[tabId].columns.reduce((acc: any, col: string) => {
        let val = parsedConstant[col];
        if (val === undefined || !savedConstant) {
          val = col === 'delegation' ? 'true' : val || '';
        }
        return { ...acc, [col]: val };
      }, {})
    );

    const savedKeepOriginal = safeGetStorage(`taka_keeporiginal_${tabId}`);
    const parsedKeepOriginal = safeJSONParse(savedKeepOriginal);
    setKeepOriginal(
      TAB_CONFIG[tabId].columns.reduce(
        (acc: any, col: string) => ({ ...acc, [col]: !!parsedKeepOriginal[col] }),
        {}
      )
    );

    setIsLocked(safeGetStorage(`taka_locked_${tabId}`) === 'true');
  };

  const processSheet = async (worksheet: any) => {
    try {
      if (!worksheet) throw new Error('Sheet bị trống.');

      const xlsx = await import('xlsx');
      const jsonData =
        (xlsx.utils.sheet_to_json(worksheet, { defval: '' }) as any[]) || [];
      setExcelData(jsonData);

      if (jsonData.length > 0) {
        const headers = Object.keys(jsonData[0] || {});
        setExcelHeaders(headers);

        if (!isLocked) {
          const newMapping = { ...(mapping || {}) };
          TAB_CONFIG[activeTab].columns.forEach((targetCol: string) => {
            const match = headers.find(
              (h) => h && h.toLowerCase().includes(targetCol.toLowerCase())
            );
            if (match) newMapping[targetCol] = match;
          });
          setMapping(newMapping);
        }
      } else {
        setExcelHeaders([]);
      }
    } catch (err: any) {
      console.error(err);
      setError('Đã xảy ra lỗi khi trích xuất dữ liệu từ Sheet này.');
      setExcelData([]);
      setExcelHeaders([]);
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setTemplateFile(uploadedFile);

    const isCSV = uploadedFile.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error('File tải lên trống.');

        const xlsx = await import('xlsx');
        let wb;
        if (isCSV) {
          wb = xlsx.read(result, { type: 'string' });
        } else {
          wb = xlsx.read(new Uint8Array(result as ArrayBuffer), { type: 'array' });
        }

        const firstSheet = wb.SheetNames[0];
        const json = xlsx.utils.sheet_to_json(wb.Sheets[firstSheet], {
          defval: '',
        }) as any[];
        setTemplateData(json);
      } catch (err: any) {
        setError(`Lỗi đọc template: ${err.message}`);
      }
    };

    if (isCSV) {
      reader.readAsText(uploadedFile, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(uploadedFile);
    }
    e.target.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setError('');
    setFile(uploadedFile);
    setWorkbook(null);
    setSheetNames([]);
    setActiveSheet('');
    setExcelData([]);
    setExcelHeaders([]);

    const isCSV = uploadedFile.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error('File tải lên trống.');

        const xlsx = await import('xlsx');
        let wb;
        try {
          if (isCSV) {
            wb = xlsx.read(result, { type: 'string' });
          } else {
            const data = new Uint8Array(result as ArrayBuffer);
            wb = xlsx.read(data, { type: 'array' });
          }
        } catch (xlsxErr) {
          console.error('XLSX Parse Error:', xlsxErr);
          throw new Error(
            'Định dạng file không được hỗ trợ hoặc cấu trúc file bị lỗi.'
          );
        }

        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error('Không thể tìm thấy sheet dữ liệu nào trong file.');
        }

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        const firstSheet = wb.SheetNames[0];
        setActiveSheet(firstSheet);
        processSheet(wb.Sheets[firstSheet]);
      } catch (err: any) {
        setError(`Không thể xử lý file: ${err.message}`);
        console.error(err);
        setExcelData([]);
      }
    };

    reader.onerror = () => {
      setError('Trình duyệt gặp lỗi trong quá trình nạp file.');
    };

    if (isCSV) {
      reader.readAsText(uploadedFile, 'UTF-8');
    } else {
      reader.readAsArrayBuffer(uploadedFile);
    }

    e.target.value = '';
  };

  const handleCancelUpload = () => {
    setFile(null);
    setWorkbook(null);
    setSheetNames([]);
    setActiveSheet('');
    setExcelData([]);
    setExcelHeaders([]);
    setError('');
  };

  const handleSaveMapping = () => {
    safeSetStorage(`taka_mapping_${activeTab}`, JSON.stringify(mapping));
    safeSetStorage(`taka_constant_${activeTab}`, JSON.stringify(constantMapping));
    safeSetStorage(`taka_keeporiginal_${activeTab}`, JSON.stringify(keepOriginal));
    safeSetStorage(`taka_locked_${activeTab}`, 'true');
    setIsLocked(true);
  };

  const handleUnlock = () => {
    if (passwordInput === '1641985') {
      safeSetStorage(`taka_locked_${activeTab}`, 'false');
      setIsLocked(false);
      setShowUnlockModal(false);
      setPasswordInput('');
      setPasswordError('');
    } else {
      setPasswordError('Mật khẩu không đúng!');
    }
  };

  const previewData = useMemo(() => {
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

        for (const taskDef of templateData) {
          if (finalJson.length >= 10) return finalJson;
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
      return finalJson;
    }

    return excelData.slice(0, 10).map((row) => {
      const parsedRow: any = {};
      TAB_CONFIG[activeTab].columns.forEach((c: string) => {
        parsedRow[c] = getCellValue(
          row,
          c,
          activeTab,
          mapping,
          constantMapping,
          keepOriginal,
          unitSizeMap
        );
      });
      return parsedRow;
    });
  }, [
    activeTab,
    excelData,
    templateData,
    mapping,
    constantMapping,
    keepOriginal,
    unitSizeMap,
  ]);

  const exportData = async () => {
    await executeCsvExport({
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
    });
  };

  return {
    file,
    workbook,
    sheetNames,
    activeSheet,
    setActiveSheet,
    excelData,
    excelHeaders,
    templateFile,
    setTemplateFile,
    setTemplateData,
    error,
    activeTab,
    showUnlockModal,
    setShowUnlockModal,
    passwordInput,
    setPasswordInput,
    passwordError,
    isLocked,
    mapping,
    setMapping,
    keepOriginal,
    setKeepOriginal,
    constantMapping,
    setConstantMapping,
    switchTab,
    processSheet,
    handleTemplateUpload,
    handleFileUpload,
    handleCancelUpload,
    handleSaveMapping,
    handleUnlock,
    previewData,
    exportData,
  };
}
