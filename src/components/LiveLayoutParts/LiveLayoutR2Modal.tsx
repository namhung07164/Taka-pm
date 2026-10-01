import React from 'react';
import { Cloud, X } from 'lucide-react';

interface LiveLayoutR2ModalProps {
  isOpen: boolean;
  onClose: () => void;
  cfgAccountId: string;
  setCfgAccountId: (val: string) => void;
  cfgBucketName: string;
  setCfgBucketName: (val: string) => void;
  cfgAccessKey: string;
  setCfgAccessKey: (val: string) => void;
  cfgSecretKey: string;
  setCfgSecretKey: (val: string) => void;
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
    <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-5 text-slate-200 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-base">
            <Cloud className="w-5 h-5" />
            Cấu hình Cloudflare R2
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">
              Account ID
            </label>
            <input
              type="text"
              value={cfgAccountId}
              onChange={(e) => setCfgAccountId(e.target.value)}
              placeholder="VD: a1b2c3d4e5f6..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">
              Bucket Name
            </label>
            <input
              type="text"
              value={cfgBucketName}
              onChange={(e) => setCfgBucketName(e.target.value)}
              placeholder="VD: takashimaya-mapping"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">
              Access Key ID
            </label>
            <input
              type="text"
              value={cfgAccessKey}
              onChange={(e) => setCfgAccessKey(e.target.value)}
              placeholder="R2 API Token Access Key"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-slate-400 uppercase tracking-wider font-semibold mb-1">
              Secret Access Key
            </label>
            <input
              type="password"
              value={cfgSecretKey}
              onChange={(e) => setCfgSecretKey(e.target.value)}
              placeholder="R2 API Token Secret Key"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-xs focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
          >
            Hủy
          </button>
          <button
            onClick={onSave}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold"
          >
            Lưu & Tải Live Map
          </button>
        </div>
      </div>
    </div>
  );
};
