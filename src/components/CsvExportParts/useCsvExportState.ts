import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { executeCsvExport } from './csvExportProcessing';
import { buildCsvPreviewData } from './csvExportPreviewBuilder';
import {
  CsvMappingPreset,
  loadLocalTabHabit,
  saveLocalTabHabit,
  recordPreferredHeaderChoice,
  loadLocalPresets,
  saveLocalPresets,
  resolveSmartColumnMappingForFile,
  syncHabitToCloud,
  pullHabitFromCloud,
} from './csvExportHabitService';

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

  const initialHabit = useMemo(() => loadLocalTabHabit('project'), []);
  const [isLocked, setIsLocked] = useState<boolean>(initialHabit.isLocked);
  const [mapping, setMappingState] = useState<Record<string, string>>(initialHabit.mapping);
  const [keepOriginal, setKeepOriginalState] = useState<Record<string, boolean>>(initialHabit.keepOriginal);
  const [constantMapping, setConstantMappingState] = useState<Record<string, string>>(initialHabit.constantMapping);
  const [explicitEmptyCols, setExplicitEmptyCols] = useState<Record<string, boolean>>(initialHabit.explicitEmptyCols);
  const [preferredHeaders, setPreferredHeaders] = useState<Record<string, string[]>>(initialHabit.preferredHeaders);
  const [presets, setPresets] = useState<CsvMappingPreset[]>(() => loadLocalPresets('project'));
  const [activePresetId, setActivePresetId] = useState<string>(initialHabit.activePresetId);

  const excelHeadersRef = useRef<string[]>([]);
  useEffect(() => {
    excelHeadersRef.current = excelHeaders;
  }, [excelHeaders]);

  // Hydrate Admin habits & presets from Cloud (`taka_config/csv_converter_habits`) when switching tabs
  useEffect(() => {
    let cancelled = false;
    pullHabitFromCloud(activeTab).then((cloudData) => {
      if (cancelled || !cloudData) return;
      const localNow = loadLocalTabHabit(activeTab);
      const localPresets = loadLocalPresets(activeTab);

      if (cloudData.presets && cloudData.presets.length > 0 && localPresets.length === 0) {
        setPresets(cloudData.presets);
        saveLocalPresets(activeTab, cloudData.presets);
      }

      if (cloudData.habit) {
        const hasLocalMapping = Object.values(localNow.mapping).some(Boolean);
        const hasLocalKeep = Object.values(localNow.keepOriginal).some(Boolean);
        const mergedMapping = hasLocalMapping ? localNow.mapping : { ...localNow.mapping, ...(cloudData.habit.mapping || {}) };
        const mergedKeep = hasLocalKeep ? localNow.keepOriginal : { ...localNow.keepOriginal, ...(cloudData.habit.keepOriginal || {}) };
        const mergedConst = { ...cloudData.habit.constantMapping, ...localNow.constantMapping };
        const mergedEmpty = { ...(cloudData.habit.explicitEmptyCols || {}), ...localNow.explicitEmptyCols };
        const mergedPref: Record<string, string[]> = { ...(cloudData.habit.preferredHeaders || {}), ...localNow.preferredHeaders };

        saveLocalTabHabit(activeTab, {
          mapping: mergedMapping,
          keepOriginal: mergedKeep,
          constantMapping: mergedConst,
          explicitEmptyCols: mergedEmpty,
          preferredHeaders: mergedPref,
        });

        setKeepOriginalState(mergedKeep);
        setConstantMappingState(mergedConst);
        setExplicitEmptyCols(mergedEmpty);
        setPreferredHeaders(mergedPref);

        if (excelHeadersRef.current.length > 0) {
          const resolved = resolveSmartColumnMappingForFile({
            tabId: activeTab,
            headers: excelHeadersRef.current,
            currentMapping: mergedMapping,
            preferredHeaders: mergedPref,
            explicitEmptyCols: mergedEmpty,
            constantMapping: mergedConst,
          });
          setMappingState(resolved);
          saveLocalTabHabit(activeTab, { mapping: resolved });
        } else {
          setMappingState(mergedMapping);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  // Auto-persisting setters that immediately remember Admin's habits on every dropdown/checkbox/input change
  const setMapping: React.Dispatch<React.SetStateAction<Record<string, string>>> = (updater) => {
    setMappingState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const nextEmpty = { ...explicitEmptyCols };
      let nextPref = { ...preferredHeaders };

      Object.keys(next).forEach((col) => {
        if (next[col] !== prev[col]) {
          if (!next[col]) {
            nextEmpty[col] = true;
          } else {
            nextEmpty[col] = false;
            nextPref = recordPreferredHeaderChoice(activeTab, col, next[col], nextPref);
          }
        }
      });

      setExplicitEmptyCols(nextEmpty);
      setPreferredHeaders(nextPref);
      saveLocalTabHabit(activeTab, {
        mapping: next,
        explicitEmptyCols: nextEmpty,
        preferredHeaders: nextPref,
      });
      return next;
    });
  };

  const setKeepOriginal: React.Dispatch<React.SetStateAction<Record<string, boolean>>> = (updater) => {
    setKeepOriginalState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveLocalTabHabit(activeTab, { keepOriginal: next });
      return next;
    });
  };

  const setConstantMapping: React.Dispatch<React.SetStateAction<Record<string, string>>> = (updater) => {
    setConstantMappingState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveLocalTabHabit(activeTab, { constantMapping: next });
      return next;
    });
  };

  const unitSizeMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (activeTab !== 'size_unit' || !Array.isArray(excelData) || excelData.length === 0) {
      return map;
    }
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

    const habit = loadLocalTabHabit(tabId);
    const tabPresets = loadLocalPresets(tabId);
    setMappingState(habit.mapping);
    setKeepOriginalState(habit.keepOriginal);
    setConstantMappingState(habit.constantMapping);
    setExplicitEmptyCols(habit.explicitEmptyCols);
    setPreferredHeaders(habit.preferredHeaders);
    setIsLocked(habit.isLocked);
    setPresets(tabPresets);
    setActivePresetId(habit.activePresetId);
  };

  const processSheet = async (worksheet: any, tabIdOverride?: string) => {
    const targetTab = tabIdOverride || activeTab;
    try {
      if (!worksheet) throw new Error('Sheet bị trống.');

      const xlsx = await import('xlsx');
      const jsonData = (xlsx.utils.sheet_to_json(worksheet, { defval: '' }) as any[]) || [];
      setExcelData(jsonData);

      if (jsonData.length > 0) {
        const headers = Object.keys(jsonData[0] || {});
        setExcelHeaders(headers);

        // Read freshest saved habits from storage so FileReader async closure never uses stale state
        const freshHabit = loadLocalTabHabit(targetTab);
        const smartMapped = resolveSmartColumnMappingForFile({
          tabId: targetTab,
          headers,
          currentMapping: freshHabit.mapping,
          preferredHeaders: freshHabit.preferredHeaders,
          explicitEmptyCols: freshHabit.explicitEmptyCols,
          constantMapping: freshHabit.constantMapping,
        });

        setMappingState(smartMapped);
        setKeepOriginalState(freshHabit.keepOriginal);
        setConstantMappingState(freshHabit.constantMapping);
        saveLocalTabHabit(targetTab, { mapping: smartMapped });
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
        const wb = isCSV
          ? xlsx.read(result, { type: 'string' })
          : xlsx.read(new Uint8Array(result as ArrayBuffer), { type: 'array' });
        const firstSheet = wb.SheetNames[0];
        const json = xlsx.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' }) as any[];
        setTemplateData(json);
      } catch (err: any) {
        setError(`Lỗi đọc template: ${err.message}`);
      }
    };

    if (isCSV) reader.readAsText(uploadedFile, 'UTF-8');
    else reader.readAsArrayBuffer(uploadedFile);
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
    const currentTabAtUpload = activeTab;

    reader.onload = async (event) => {
      try {
        const result = event.target?.result;
        if (!result) throw new Error('File tải lên trống.');
        const xlsx = await import('xlsx');
        let wb;
        try {
          wb = isCSV
            ? xlsx.read(result, { type: 'string' })
            : xlsx.read(new Uint8Array(result as ArrayBuffer), { type: 'array' });
        } catch (xlsxErr) {
          console.error('XLSX Parse Error:', xlsxErr);
          throw new Error('Định dạng file không được hỗ trợ hoặc cấu trúc file bị lỗi.');
        }

        if (!wb.SheetNames || wb.SheetNames.length === 0) {
          throw new Error('Không thể tìm thấy sheet dữ liệu nào trong file.');
        }

        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        const firstSheet = wb.SheetNames[0];
        setActiveSheet(firstSheet);
        processSheet(wb.Sheets[firstSheet], currentTabAtUpload);
      } catch (err: any) {
        setError(`Không thể xử lý file: ${err.message}`);
        console.error(err);
        setExcelData([]);
      }
    };

    reader.onerror = () => setError('Trình duyệt gặp lỗi trong quá trình nạp file.');
    if (isCSV) reader.readAsText(uploadedFile, 'UTF-8');
    else reader.readAsArrayBuffer(uploadedFile);
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
    const nextHabit = { mapping, keepOriginal, constantMapping, explicitEmptyCols, preferredHeaders, isLocked: true, activePresetId };
    saveLocalTabHabit(activeTab, nextHabit);
    setIsLocked(true);
    syncHabitToCloud(activeTab, nextHabit, presets).catch(() => {});
    useAppStore.getState().setToast({
      title: 'Đã Lưu & Khóa Mẫu Thói Quen',
      message: 'Đã ghi nhớ cách chọn cột, ô tick và giá trị tĩnh làm mặc định khi chọn file!',
      type: 'success',
    });
  };

  const handleSelectPreset = (presetId: string) => {
    setActivePresetId(presetId);
    saveLocalTabHabit(activeTab, { activePresetId: presetId });
    if (presetId === 'default') return;
    const found = presets.find((p) => p.id === presetId);
    if (!found) return;

    const nextEmpty = found.explicitEmptyCols || {};
    const resolvedMapping = excelHeaders.length > 0
      ? resolveSmartColumnMappingForFile({
          tabId: activeTab,
          headers: excelHeaders,
          currentMapping: found.mapping,
          preferredHeaders,
          explicitEmptyCols: nextEmpty,
          constantMapping: found.constantMapping,
        })
      : found.mapping;

    setMappingState(resolvedMapping);
    setKeepOriginalState(found.keepOriginal || {});
    setConstantMappingState(found.constantMapping || {});
    setExplicitEmptyCols(nextEmpty);
    saveLocalTabHabit(activeTab, {
      mapping: resolvedMapping,
      keepOriginal: found.keepOriginal || {},
      constantMapping: found.constantMapping || {},
      explicitEmptyCols: nextEmpty,
      activePresetId: presetId,
    });
  };

  const handleSavePreset = (presetName: string) => {
    const cleanName = presetName.trim();
    if (!cleanName) return;
    const existingIdx = presets.findIndex((p) => p.name.toLowerCase() === cleanName.toLowerCase());
    const presetObj: CsvMappingPreset = {
      id: existingIdx >= 0 ? presets[existingIdx].id : `preset_${Date.now()}`,
      name: cleanName,
      tabId: activeTab,
      mapping: { ...mapping },
      keepOriginal: { ...keepOriginal },
      constantMapping: { ...constantMapping },
      explicitEmptyCols: { ...explicitEmptyCols },
      isDefault: true,
      updatedAt: Date.now(),
    };
    const nextPresets = existingIdx >= 0 ? presets.map((p, i) => (i === existingIdx ? presetObj : p)) : [presetObj, ...presets];
    setPresets(nextPresets);
    setActivePresetId(presetObj.id);
    saveLocalPresets(activeTab, nextPresets);

    const nextHabit = { mapping, keepOriginal, constantMapping, explicitEmptyCols, preferredHeaders, isLocked, activePresetId: presetObj.id };
    saveLocalTabHabit(activeTab, nextHabit);
    syncHabitToCloud(activeTab, nextHabit, nextPresets).catch(() => {});
    useAppStore.getState().setToast({
      title: 'Đã Lưu Mẫu Cấu Hình',
      message: `Mẫu "${cleanName}" đã được lưu và sẽ tự động áp dụng khi chọn file!`,
      type: 'success',
    });
  };

  const handleDeletePreset = (presetId: string) => {
    const nextPresets = presets.filter((p) => p.id !== presetId);
    setPresets(nextPresets);
    setActivePresetId('default');
    saveLocalPresets(activeTab, nextPresets);
    const nextHabit = { mapping, keepOriginal, constantMapping, explicitEmptyCols, preferredHeaders, isLocked, activePresetId: 'default' };
    saveLocalTabHabit(activeTab, { activePresetId: 'default' });
    syncHabitToCloud(activeTab, nextHabit, nextPresets).catch(() => {});
  };

  const handleUnlock = () => {
    if (passwordInput === '1641985') {
      saveLocalTabHabit(activeTab, { isLocked: false });
      setIsLocked(false);
      setShowUnlockModal(false);
      setPasswordInput('');
      setPasswordError('');
    } else {
      setPasswordError('Mật khẩu không đúng!');
    }
  };

  const previewData = useMemo(
    () => buildCsvPreviewData({ activeTab, excelData, templateData, mapping, constantMapping, keepOriginal, unitSizeMap }),
    [activeTab, excelData, templateData, mapping, constantMapping, keepOriginal, unitSizeMap]
  );

  const exportData = async () => {
    await executeCsvExport({
      activeTab, sheetNames, workbook, mapping, constantMapping, keepOriginal, templateData, excelData, unitSizeMap, setError,
    });
  };

  return {
    file, workbook, sheetNames, activeSheet, setActiveSheet, excelData, excelHeaders,
    templateFile, setTemplateFile, setTemplateData, error, activeTab,
    showUnlockModal, setShowUnlockModal, passwordInput, setPasswordInput, passwordError,
    isLocked, mapping, setMapping, keepOriginal, setKeepOriginal, constantMapping, setConstantMapping,
    presets, activePresetId, handleSelectPreset, handleSavePreset, handleDeletePreset,
    switchTab, processSheet, handleTemplateUpload, handleFileUpload, handleCancelUpload,
    handleSaveMapping, handleUnlock, previewData, exportData,
  };
}

