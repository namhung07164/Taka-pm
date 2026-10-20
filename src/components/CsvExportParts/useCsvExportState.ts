import React, { useMemo, useState } from 'react';
import {
  TAB_CONFIG,
  safeJSONParse,
  safeGetStorage,
  safeSetStorage,
} from './csvExportTypes';
import { executeCsvExport } from './csvExportProcessing';
import { buildCsvPreviewData } from './csvExportPreviewBuilder';

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

  const previewData = useMemo(
    () =>
      buildCsvPreviewData({
        activeTab,
        excelData,
        templateData,
        mapping,
        constantMapping,
        keepOriginal,
        unitSizeMap,
      }),
    [
      activeTab,
      excelData,
      templateData,
      mapping,
      constantMapping,
      keepOriginal,
      unitSizeMap,
    ]
  );

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
