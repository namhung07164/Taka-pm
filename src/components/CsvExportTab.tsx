import React, { useState } from 'react';
import { useCsvExportState } from './CsvExportParts/useCsvExportState';
import { CsvExportHeaderTabs } from './CsvExportParts/CsvExportHeaderTabs';
import { CsvExportFileSection } from './CsvExportParts/CsvExportFileSection';
import { CsvExportMappingTable } from './CsvExportParts/CsvExportMappingTable';
import { CsvExportPreviewSection } from './CsvExportParts/CsvExportPreviewSection';
import { CsvExportUnlockModal } from './CsvExportParts/CsvExportUnlockModal';
import { CsvExportR2TemplateModal } from './CsvExportParts/CsvExportR2TemplateModal';

export default function CsvExportTab() {
  const [showR2Modal, setShowR2Modal] = useState(false);

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

  const handleLoadR2TemplateFile = (loadedFile: File, isTemplateAttached?: boolean) => {
    const fakeEvent = {
      target: { files: [loadedFile] }
    } as unknown as React.ChangeEvent<HTMLInputElement>;

    if (isTemplateAttached) {
      handleTemplateUpload(fakeEvent);
    } else {
      handleFileUpload(fakeEvent);
    }
  };

  const handleLoadR2TemplateMapping = (
    newMapping: Record<string, string>,
    newConstantMapping?: Record<string, string>,
    newKeepOriginal?: Record<string, boolean>
  ) => {
    if (newMapping) setMapping(newMapping);
    if (newConstantMapping) setConstantMapping(newConstantMapping);
    if (newKeepOriginal) setKeepOriginal(newKeepOriginal);
  };

  return (
    <div className="h-full bg-slate-50 dark:bg-[#1a1a1c] p-4 font-sans text-slate-800 dark:text-[#e3e3e3] overflow-y-auto w-full custom-scrollbar">
      <div className="max-w-[1400px] mx-auto space-y-6">
        <CsvExportHeaderTabs
          activeTab={activeTab}
          onTabChange={switchTab}
          onOpenR2Modal={() => setShowR2Modal(true)}
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
              onOpenR2Modal={() => setShowR2Modal(true)}
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

        <CsvExportR2TemplateModal
          isOpen={showR2Modal}
          onClose={() => setShowR2Modal(false)}
          activeTab={activeTab}
          file={file}
          templateFile={templateFile}
          mapping={mapping}
          constantMapping={constantMapping}
          keepOriginal={keepOriginal}
          onLoadTemplateFile={handleLoadR2TemplateFile}
          onLoadTemplateMapping={handleLoadR2TemplateMapping}
        />
      </div>
    </div>
  );
}
