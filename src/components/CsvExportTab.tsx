import React from 'react';
import { useCsvExportState } from './CsvExportParts/useCsvExportState';
import { CsvExportHeaderTabs } from './CsvExportParts/CsvExportHeaderTabs';
import { CsvExportFileSection } from './CsvExportParts/CsvExportFileSection';
import { CsvExportMappingTable } from './CsvExportParts/CsvExportMappingTable';
import { CsvExportPreviewSection } from './CsvExportParts/CsvExportPreviewSection';
import { CsvExportUnlockModal } from './CsvExportParts/CsvExportUnlockModal';

export default function CsvExportTab() {
  const {
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
  } = useCsvExportState();

  return (
    <div className="h-full bg-slate-50 dark:bg-[#1a1a1c] p-4 font-sans text-slate-800 dark:text-[#e3e3e3] overflow-y-auto w-full custom-scrollbar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <CsvExportHeaderTabs
          activeTab={activeTab}
          onTabChange={switchTab}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-6">
            <CsvExportFileSection
              file={file}
              sheetNames={sheetNames}
              activeSheet={activeSheet}
              onSheetChange={(s) => {
                setActiveSheet(s);
                processSheet(workbook?.Sheets[s]);
              }}
              onFileUpload={handleFileUpload}
              onCancelUpload={handleCancelUpload}
              templateFile={templateFile}
              onTemplateUpload={handleTemplateUpload}
              onCancelTemplate={() => {
                setTemplateFile(null);
                setTemplateData([]);
              }}
              activeTab={activeTab}
              error={error}
            />

            <CsvExportMappingTable
              activeTab={activeTab}
              isLocked={isLocked}
              mapping={mapping}
              setMapping={setMapping}
              keepOriginal={keepOriginal}
              setKeepOriginal={setKeepOriginal}
              constantMapping={constantMapping}
              setConstantMapping={setConstantMapping}
              excelHeaders={excelHeaders}
              onLockToggle={
                isLocked ? () => setShowUnlockModal(true) : handleSaveMapping
              }
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <CsvExportPreviewSection
              activeTab={activeTab}
              previewData={previewData}
              excelData={excelData}
              file={file}
              templateFile={templateFile}
              onExport={exportData}
            />
          </div>
        </div>

        <CsvExportUnlockModal
          isOpen={showUnlockModal}
          onClose={() => setShowUnlockModal(false)}
          passwordInput={passwordInput}
          setPasswordInput={setPasswordInput}
          passwordError={passwordError}
          onUnlock={handleUnlock}
        />
      </div>
    </div>
  );
}
