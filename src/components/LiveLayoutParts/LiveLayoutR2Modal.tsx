import React, { FC } from 'react';
import { X, Cloud, Key, Save } from 'lucide-react';

export interface LiveLayoutR2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  cfgAccountId: string;
  setCfgAccountId: (v: string) => void;
  cfgBucketName: string;
  setCfgBucketName: (v: string) => void;
  cfgAccessKey: string;
  setCfgAccessKey: (v: string) => void;
  cfgSecretKey: string;
  setCfgSecretKey: (v: string) => void;
  onSave: () => void;
}

export const LiveLayoutR2Modal: React.FC<LiveLayoutR2ModalProps> = ({
  isOpen,
  onClose,
  cfgAccountId,
  setCfgAccountId,
  cfgBucketName,
  setCfgBucketName,
  cfgAccessKey,
  setCfgAccessKey,
  cfgSecretKey,
  setCfgSecretKey,
  onSave,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div 
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100 font-bold">
            <Cloud className="w-5 h-5 text-blue-500" />
            <span>Cấu hình Cloudflare R2</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nhập thông tin kết nối Bucket Cloudflare R2 để tải sơ đồ mặt bằng và cấu hình gian hàng.
        </p>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Cloudflare Account ID
            </label>
            <input
              type="text"
              value={cfgAccountId}
              onChange={(e) => setCfgAccountId(e.target.value)}
              placeholder="e.g. 1a2b3c4d5e6f..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              R2 Bucket Name
            </label>
            <input
              type="text"
              value={cfgBucketName}
              onChange={(e) => setCfgBucketName(e.target.value)}
              placeholder="e.g. takashimaya-drawings"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Access Key ID
            </label>
            <input
              type="text"
              value={cfgAccessKey}
              onChange={(e) => setCfgAccessKey(e.target.value)}
              placeholder="Access Key ID"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 block">
              Secret Access Key
            </label>
            <input
              type="password"
              value={cfgSecretKey}
              onChange={(e) => setCfgSecretKey(e.target.value)}
              placeholder="Secret Access Key"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 mt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors active:scale-95 touch-manipulation"
          >
            <Save className="w-4 h-4" />
            Lưu & Đồng bộ
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveLayoutR2Modal;
