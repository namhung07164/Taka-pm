import React from 'react';
import {
  Folder,
  FileSpreadsheet,
  UploadCloud,
  Download,
  Trash2,
  RefreshCw,
  Loader2,
  Save,
  FileCode,
  FolderOpen,
} from 'lucide-react';
import { R2Credentials } from '../PictureMapping/lib/r2Upload';
import { R2TemplateItem } from './csvExportR2Service';

export interface R2BrowseTabViewProps {
  selectedFolder: string;
  setSelectedFolder: (v: string) => void;
  loading: boolean;
  creds: R2Credentials | null;
  templates: R2TemplateItem[];
  onRefresh: () => void;
  onGoToSave: () => void;
  onLoadTemplate: (item: R2TemplateItem) => void;
  onDeleteTemplate: (item: R2TemplateItem) => void;
}

export const R2BrowseTabView: React.FC<R2BrowseTabViewProps> = ({
  selectedFolder,
  setSelectedFolder,
  loading,
  creds,
  templates,
  onRefresh,
  onGoToSave,
  onLoadTemplate,
  onDeleteTemplate,
}) => (
  <div className="space-y-4">
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50 dark:bg-[#252528] p-3 rounded-xl border border-slate-200 dark:border-[#333336]">
      <div className="flex items-center gap-2 w-full sm:w-auto">
        <Folder className="w-4 h-4 text-amber-500 shrink-0" />
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thư mục R2:</span>
        <select
          value={selectedFolder}
          onChange={(e) => setSelectedFolder(e.target.value)}
          className="px-2.5 py-1.5 bg-white dark:bg-[#1a1a1c] border border-slate-200 dark:border-[#444446] rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="templates/converter/">templates/converter/ (Khuyên dùng)</option>
          <option value="templates/task_details/">templates/task_details/</option>
          <option value="templates/projects/">templates/projects/</option>
          <option value="templates/">templates/ (Tất cả Mẫu)</option>
        </select>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <button
          onClick={onRefresh}
          disabled={loading || !creds}
          className="px-3 py-1.5 bg-white dark:bg-[#1a1a1c] hover:bg-slate-100 dark:hover:bg-[#333336] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-[#444446] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Làm mới
        </button>

        <button
          onClick={onGoToSave}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shadow-xs"
        >
          <UploadCloud className="w-3.5 h-3.5" />
          Tải Mẫu Mới Lên R2
        </button>
      </div>
    </div>

    {loading ? (
      <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="text-xs font-bold">Đang tải danh sách mẫu từ Cloud R2...</span>
      </div>
    ) : templates.length === 0 ? (
      <div className="py-12 border-2 border-dashed border-slate-200 dark:border-[#333336] rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-3">
        <FolderOpen className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <p className="text-xs font-bold text-center">
          Chưa có file mẫu nào trong thư mục{' '}
          <code className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-blue-600">
            {selectedFolder}
          </code>
        </p>
        <button
          onClick={onGoToSave}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
        >
          + Lưu Mẫu Hiện Tại Lên R2 Ngay
        </button>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((item) => (
          <div
            key={item.key}
            className="p-3.5 bg-slate-50/80 dark:bg-[#252528] rounded-xl border border-slate-200 dark:border-[#38383b] hover:border-blue-300 dark:hover:border-blue-700 transition-all flex items-start justify-between gap-3 shadow-2xs group"
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <div className="p-2 bg-white dark:bg-[#1a1a1c] rounded-lg border border-slate-200 dark:border-[#444446] text-blue-600 dark:text-blue-400 shrink-0">
                {item.isConfigJson ? (
                  <FileCode className="w-5 h-5 text-purple-500" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4
                  className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors"
                  title={item.fileName}
                >
                  {item.fileName}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 font-mono">
                  <span>{(item.size / 1024).toFixed(1)} KB</span>
                  <span>•</span>
                  <span>
                    {item.lastModified
                      ? new Date(item.lastModified).toLocaleDateString('vi-VN')
                      : 'R2 Cloud'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onLoadTemplate(item)}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all active:scale-95 shadow-2xs cursor-pointer"
                title="Mở và nạp trực tiếp mẫu vào Taka Data Converter"
              >
                <Download className="w-3.5 h-3.5" />
                Mở
              </button>
              <button
                onClick={() => onDeleteTemplate(item)}
                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                title="Xóa mẫu khỏi Cloud R2"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export interface R2SaveTabViewProps {
  saveTemplateName: string;
  setSaveTemplateName: (v: string) => void;
  saveTargetFolder: string;
  setSaveTargetFolder: (v: string) => void;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  uploadFile: File | null;
  setUploadFile: (f: File | null) => void;
  file: File | null;
  templateFile: File | null;
  mapping: Record<string, string>;
  isSaving: boolean;
  onCancel: () => void;
  onSave: () => void;
}

export const R2SaveTabView: React.FC<R2SaveTabViewProps> = ({
  saveTemplateName,
  setSaveTemplateName,
  saveTargetFolder,
  setSaveTargetFolder,
  dragActive,
  setDragActive,
  uploadFile,
  setUploadFile,
  file,
  templateFile,
  mapping,
  isSaving,
  onCancel,
  onSave,
}) => (
  <div className="space-y-4">
    <div className="p-4 bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-blue-800 dark:text-blue-300">
      <p className="font-bold mb-1">💡 Đóng gói & Lưu trữ Mẫu lên Cloudflare R2:</p>
      <p>
        Bạn có thể lưu file đính kèm, dữ liệu Excel gốc hoặc toàn bộ cấu hình Column Mapping
        hiện tại vào thư mục mẫu R2 để chia sẻ và mở lại tức thì ở bất kỳ đâu.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
          Tên Mẫu Đóng Gói (Template Name)
        </label>
        <input
          type="text"
          value={saveTemplateName}
          onChange={(e) => setSaveTemplateName(e.target.value)}
          placeholder="vd: Mau_Takashimaya_Standard_2026"
          className="w-full px-3 py-2 bg-slate-50 dark:bg-[#252528] border border-slate-200 dark:border-[#444446] rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
          Thư mục R2 (R2 Target Folder)
        </label>
        <input
          type="text"
          value={saveTargetFolder}
          onChange={(e) => setSaveTargetFolder(e.target.value)}
          placeholder="templates/converter/"
          className="w-full px-3 py-2 bg-slate-50 dark:bg-[#252528] border border-slate-200 dark:border-[#444446] rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>

    <div>
      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
        Hoặc chọn File Mẫu Cục Bộ từ Máy Tính (.xlsx / .csv)
      </label>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files?.[0]) setUploadFile(e.dataTransfer.files[0]);
        }}
        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
          dragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40'
            : uploadFile
            ? 'border-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20'
            : 'border-slate-200 dark:border-[#333336] hover:bg-slate-50 dark:hover:bg-[#252528]'
        }`}
      >
        <UploadCloud
          className={`w-8 h-8 mb-1 ${uploadFile ? 'text-emerald-500' : 'text-slate-400'}`}
        />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
          {uploadFile ? uploadFile.name : 'Kéo thả hoặc nhấp để chọn file đính kèm đưa lên R2'}
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) setUploadFile(e.target.files[0]);
          }}
        />
      </label>
    </div>

    <div className="p-3 bg-slate-50 dark:bg-[#252528] rounded-xl border border-slate-200 dark:border-[#333336] text-xs space-y-1">
      <span className="font-bold text-slate-600 dark:text-slate-400">
        Nội dung sẵn sàng tải lên:
      </span>
      <ul className="list-disc list-inside text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
        {file && (
          <li>
            File dữ liệu đang mở: <strong>{file.name}</strong>
          </li>
        )}
        {templateFile && (
          <li>
            File Template Attached: <strong>{templateFile.name}</strong>
          </li>
        )}
        {uploadFile && (
          <li>
            File chọn thêm từ máy: <strong>{uploadFile.name}</strong>
          </li>
        )}
        <li>Cấu hình Mapping hiện tại ({Object.keys(mapping).length} cột)</li>
      </ul>
    </div>

    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#333336] rounded-xl transition-colors cursor-pointer"
      >
        Hủy
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Tải Lên Cloud R2 Ngay
      </button>
    </div>
  </div>
);

export interface R2ConfigTabViewProps {
  cfgAccountId: string;
  setCfgAccountId: (v: string) => void;
  cfgBucketName: string;
  setCfgBucketName: (v: string) => void;
  cfgAccessKey: string;
  setCfgAccessKey: (v: string) => void;
  cfgSecretKey: string;
  setCfgSecretKey: (v: string) => void;
  savingConfig: boolean;
  onSaveConfig: () => void;
}

export const R2ConfigTabView: React.FC<R2ConfigTabViewProps> = ({
  cfgAccountId,
  setCfgAccountId,
  cfgBucketName,
  setCfgBucketName,
  cfgAccessKey,
  setCfgAccessKey,
  cfgSecretKey,
  setCfgSecretKey,
  savingConfig,
  onSaveConfig,
}) => (
  <div className="space-y-4 max-w-lg mx-auto py-2">
    <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
      <p className="font-bold text-slate-700 dark:text-slate-300">
        Cấu hình kết nối Bucket Cloudflare R2:
      </p>
      <p>
        Thông tin kết nối được lưu an toàn vào Firestore và bộ nhớ trình duyệt để đồng bộ
        toàn hệ thống.
      </p>
    </div>

    <div className="space-y-3">
      {[
        { label: 'Cloudflare Account ID', val: cfgAccountId, set: setCfgAccountId, ph: 'e.g. 1a2b3c4d5e6f...', type: 'text' },
        { label: 'R2 Bucket Name', val: cfgBucketName, set: setCfgBucketName, ph: 'e.g. takashimaya-drawings', type: 'text' },
        { label: 'Access Key ID', val: cfgAccessKey, set: setCfgAccessKey, ph: 'Access Key ID', type: 'text' },
        { label: 'Secret Access Key', val: cfgSecretKey, set: setCfgSecretKey, ph: 'Secret Access Key', type: 'password' },
      ].map((f) => (
        <div key={f.label}>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
            {f.label}
          </label>
          <input
            type={f.type}
            value={f.val}
            onChange={(e) => f.set(e.target.value)}
            placeholder={f.ph}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-[#252528] border border-slate-200 dark:border-[#444446] rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ))}
    </div>

    <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#333336]">
      <button
        type="button"
        onClick={onSaveConfig}
        disabled={savingConfig}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
      >
        {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Lưu & Kết Nối R2
      </button>
    </div>
  </div>
);
