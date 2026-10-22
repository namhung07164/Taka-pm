import React, { useState, useEffect, useCallback } from 'react';
import { X, Cloud, AlertCircle, Save, Settings, FolderOpen } from 'lucide-react';
import {
  getStoredR2CredentialsAsync,
  isR2CredentialsValid,
  R2Credentials,
} from '../PictureMapping/lib/r2Upload';
import { useAppStore } from '../../store/useAppStore';
import {
  R2TemplateItem,
  listR2TemplatesInFolder,
  downloadR2TemplateObject,
  deleteR2TemplateObject,
  uploadR2TemplatePackage,
  saveR2ConfigToStorageAndCloud,
} from './csvExportR2Service';
import { R2BrowseTabView, R2SaveTabView, R2ConfigTabView } from './CsvExportR2TemplateTabs';

export type { R2TemplateItem } from './csvExportR2Service';

export interface CsvExportR2TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  file: File | null;
  templateFile: File | null;
  mapping: Record<string, string>;
  constantMapping: Record<string, string>;
  keepOriginal: Record<string, boolean>;
  onLoadTemplateFile: (file: File, isTemplateAttached?: boolean) => void;
  onLoadTemplateMapping?: (
    mapping: Record<string, string>,
    constantMapping?: Record<string, string>,
    keepOriginal?: Record<string, boolean>
  ) => void;
}

export const CsvExportR2TemplateModal: React.FC<CsvExportR2TemplateModalProps> = ({
  isOpen,
  onClose,
  activeTab,
  file,
  templateFile,
  mapping,
  constantMapping,
  keepOriginal,
  onLoadTemplateFile,
  onLoadTemplateMapping,
}) => {
  const [modalTab, setModalTab] = useState<'browse' | 'save' | 'config'>('browse');
  const [creds, setCreds] = useState<R2Credentials | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [templates, setTemplates] = useState<R2TemplateItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('templates/converter/');

  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTargetFolder, setSaveTargetFolder] = useState('templates/converter/');
  const [saveOption] = useState<'data_file' | 'template_file' | 'mapping_json' | 'all'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [cfgAccountId, setCfgAccountId] = useState('');
  const [cfgBucketName, setCfgBucketName] = useState('');
  const [cfgAccessKey, setCfgAccessKey] = useState('');
  const [cfgSecretKey, setCfgSecretKey] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const loadCredentials = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const c = await getStoredR2CredentialsAsync();
      setCreds(c);
      if (c) {
        setCfgAccountId(c.accountId);
        setCfgBucketName(c.bucketName);
        setCfgAccessKey(c.accessKeyId);
        setCfgSecretKey(c.secretAccessKey);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Không thể tải thông tin Cloudflare R2.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) loadCredentials();
  }, [isOpen, loadCredentials]);

  const fetchR2Templates = useCallback(async () => {
    if (!creds) return;
    const val = isR2CredentialsValid(creds);
    if (!val.valid) {
      setErrorMsg(val.reason || 'Cấu hình Cloudflare R2 chưa hợp lệ.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const items = await listR2TemplatesInFolder(creds, selectedFolder);
      setTemplates(items);
    } catch (err: any) {
      console.error('[R2 Templates] Fetch error:', err);
      setErrorMsg(`Lỗi kết nối R2: ${err?.message || 'Không thể lấy danh sách mẫu.'}`);
    } finally {
      setLoading(false);
    }
  }, [creds, selectedFolder]);

  useEffect(() => {
    if (isOpen && creds && modalTab === 'browse') {
      fetchR2Templates();
    }
  }, [isOpen, creds, modalTab, fetchR2Templates]);

  const handleLoadTemplate = async (item: R2TemplateItem) => {
    if (!creds) return;
    setLoading(true);
    try {
      const fetchRes = await downloadR2TemplateObject(creds, item.key);
      if (item.isConfigJson) {
        const jsonText = await fetchRes.text();
        const parsed = JSON.parse(jsonText);
        if (parsed.mapping || parsed.constantMapping) {
          onLoadTemplateMapping?.(
            parsed.mapping || {},
            parsed.constantMapping || {},
            parsed.keepOriginal || {}
          );
          useAppStore.getState().setToast({
            title: 'Tải Mẫu Thành Công',
            message: `Đã nạp cấu hình Mapping "${item.fileName}" từ Cloud R2!`,
          });
        }
      } else {
        const blob = await fetchRes.blob();
        const downloadedFile = new File([blob], item.fileName, {
          type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const isAttached =
          activeTab === 'mass_task' &&
          (item.fileName.toLowerCase().includes('attached') ||
            item.fileName.toLowerCase().includes('template'));
        onLoadTemplateFile(downloadedFile, isAttached);
        useAppStore.getState().setToast({
          title: 'Tải Mẫu Thành Công',
          message: `Đã nạp file mẫu "${item.fileName}" vào Taka Data Converter!`,
        });
      }
      onClose();
    } catch (err: any) {
      console.error('[R2 Load Error]:', err);
      useAppStore.getState().setToast({
        title: 'Lỗi Nạp Mẫu',
        message: err?.message || 'Không thể nạp file mẫu từ Cloud R2.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTemplate = async (item: R2TemplateItem) => {
    if (!creds || !window.confirm(`Bạn có chắc chắn muốn xóa mẫu "${item.fileName}" khỏi Cloud R2?`))
      return;
    setLoading(true);
    try {
      await deleteR2TemplateObject(creds, item.key);
      useAppStore.getState().setToast({
        title: 'Đã Xóa',
        message: `Đã xóa mẫu "${item.fileName}" khỏi Cloud R2.`,
      });
      fetchR2Templates();
    } catch (err: any) {
      useAppStore.getState().setToast({
        title: 'Lỗi Xóa Mẫu',
        message: err?.message || 'Không thể xóa mẫu khỏi R2.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToR2 = async () => {
    if (!creds) {
      setErrorMsg('Vui lòng cấu hình kết nối Cloudflare R2 trước khi tải lên.');
      return;
    }

    const name =
      saveTemplateName.trim() ||
      (uploadFile ? uploadFile.name.replace(/\.[^/.]+$/, '') : `template_${activeTab}_${Date.now()}`);
    const folder = saveTargetFolder.endsWith('/') ? saveTargetFolder : `${saveTargetFolder}/`;

    setIsSaving(true);
    setErrorMsg(null);

    try {
      await uploadR2TemplatePackage({
        creds,
        folder,
        name,
        activeTab,
        saveOption,
        uploadFile,
        file,
        templateFile,
        mapping,
        constantMapping,
        keepOriginal,
      });

      useAppStore.getState().setToast({
        title: 'Tải Lên Cloud R2 Thành Công',
        message: `Đã lưu mẫu "${name}" vào thư mục ${folder} trên Cloud R2!`,
      });

      setSaveTemplateName('');
      setUploadFile(null);
      setModalTab('browse');
      fetchR2Templates();
    } catch (err: any) {
      console.error('[R2 Save Error]:', err);
      setErrorMsg(err?.message || 'Xảy ra lỗi trong quá trình lưu mẫu lên Cloud R2.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!cfgAccountId || !cfgBucketName || !cfgAccessKey || !cfgSecretKey) {
      setErrorMsg('Vui lòng điền đầy đủ 4 thông tin cấu hình Cloudflare R2.');
      return;
    }

    setSavingConfig(true);
    setErrorMsg(null);

    const configData: R2Credentials = {
      accountId: cfgAccountId.trim(),
      bucketName: cfgBucketName.trim(),
      accessKeyId: cfgAccessKey.trim(),
      secretAccessKey: cfgSecretKey.trim(),
    };

    try {
      await saveR2ConfigToStorageAndCloud(configData);
      setCreds(configData);
      useAppStore.getState().setToast({
        title: 'Thành Công',
        message: 'Đã kết nối và đồng bộ cấu hình Cloudflare R2!',
      });
      setModalTab('browse');
      fetchR2Templates();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Lỗi khi lưu cấu hình R2.');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-in fade-in">
      <div
        className="w-full max-w-4xl bg-white dark:bg-[#1a1a1c] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#333336] flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#333336] flex items-center justify-between bg-slate-50/80 dark:bg-[#252528]/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-100 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 rounded-xl">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-[#f5f5f7] flex items-center gap-2">
                Thư Mục Mẫu Cloudflare R2
                {creds ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-800">
                    Connected: {creds.bucketName}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                    Not Configured
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Lưu trữ và mở nhanh các file mẫu Excel, CSV & cấu hình Mapping trên Cloud Storage
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors cursor-pointer active:scale-95 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-[#333336] bg-slate-100/60 dark:bg-[#202022] px-6 pt-2 gap-2">
          <button
            onClick={() => setModalTab('browse')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all flex items-center gap-1.5 border-t border-x cursor-pointer ${
              modalTab === 'browse'
                ? 'bg-white dark:bg-[#1a1a1c] text-blue-600 dark:text-blue-400 border-slate-200 dark:border-[#333336] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            Mở Mẫu Trên Cloud R2
          </button>

          <button
            onClick={() => setModalTab('save')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all flex items-center gap-1.5 border-t border-x cursor-pointer ${
              modalTab === 'save'
                ? 'bg-white dark:bg-[#1a1a1c] text-blue-600 dark:text-blue-400 border-slate-200 dark:border-[#333336] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Save className="w-4 h-4" />
            Lưu Mẫu Hiện Tại Lên R2
          </button>

          <button
            onClick={() => setModalTab('config')}
            className={`px-4 py-2 text-xs font-bold rounded-t-xl transition-all flex items-center gap-1.5 border-t border-x cursor-pointer ml-auto ${
              modalTab === 'config'
                ? 'bg-white dark:bg-[#1a1a1c] text-blue-600 dark:text-blue-400 border-slate-200 dark:border-[#333336] shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            Cấu Hình R2
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-grow space-y-4">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{errorMsg}</span>
            </div>
          )}

          {modalTab === 'browse' && (
            <R2BrowseTabView
              selectedFolder={selectedFolder}
              setSelectedFolder={setSelectedFolder}
              loading={loading}
              creds={creds}
              templates={templates}
              onRefresh={fetchR2Templates}
              onGoToSave={() => setModalTab('save')}
              onLoadTemplate={handleLoadTemplate}
              onDeleteTemplate={handleDeleteTemplate}
            />
          )}

          {modalTab === 'save' && (
            <R2SaveTabView
              saveTemplateName={saveTemplateName}
              setSaveTemplateName={setSaveTemplateName}
              saveTargetFolder={saveTargetFolder}
              setSaveTargetFolder={setSaveTargetFolder}
              dragActive={dragActive}
              setDragActive={setDragActive}
              uploadFile={uploadFile}
              setUploadFile={setUploadFile}
              file={file}
              templateFile={templateFile}
              mapping={mapping}
              isSaving={isSaving}
              onCancel={() => setModalTab('browse')}
              onSave={handleSaveToR2}
            />
          )}

          {modalTab === 'config' && (
            <R2ConfigTabView
              cfgAccountId={cfgAccountId}
              setCfgAccountId={setCfgAccountId}
              cfgBucketName={cfgBucketName}
              setCfgBucketName={setCfgBucketName}
              cfgAccessKey={cfgAccessKey}
              setCfgAccessKey={setCfgAccessKey}
              cfgSecretKey={cfgSecretKey}
              setCfgSecretKey={setCfgSecretKey}
              savingConfig={savingConfig}
              onSaveConfig={handleSaveConfig}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default CsvExportR2TemplateModal;
