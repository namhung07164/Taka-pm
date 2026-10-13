import React, { FC } from 'react';

interface CsvExportUnlockModalProps {
  isOpen: boolean;
  onClose: () => void;
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  passwordError: string;
  onUnlock: () => void;
}

export const CsvExportUnlockModal: React.FC<CsvExportUnlockModalProps> = ({
  isOpen,
  onClose,
  passwordInput,
  setPasswordInput,
  passwordError,
  onUnlock,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#28282a] p-8 rounded-3xl shadow-2xl w-full max-w-xs text-center animate-in fade-in zoom-in duration-200">
        <div className="bg-amber-100 dark:bg-amber-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 dark:text-amber-400">
          <i className="ph-fill ph-lock-key text-3xl"></i>
        </div>
        <h3 className="font-bold text-lg mb-2 text-slate-800 dark:text-[#e3e3e3]">
          Mở khóa Mapping
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
          Nhập mật khẩu để thay đổi cấu hình các cột dữ liệu.
        </p>
        <input
          type="password"
          autoFocus
          className="w-full p-3 border border-slate-200 dark:border-[#333336] rounded-xl mb-2 text-center text-xl tracking-widest outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/30 transition-all text-slate-800 dark:text-[#e3e3e3] bg-white dark:bg-[#1a1a1c]"
          placeholder="••••••"
          value={passwordInput}
          onChange={(e) => setPasswordInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onUnlock()}
        />
        <div className="h-6">
          {passwordError && (
            <p className="text-red-500 text-xs font-medium">{passwordError}</p>
          )}
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#333336] hover:bg-slate-200 dark:hover:bg-[#444446] rounded-xl font-bold text-sm transition-colors cursor-pointer"
          >
            Hủy
          </button>
          <button
            onClick={onUnlock}
            className="flex-1 py-2.5 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-xl font-bold text-sm shadow-md transition-colors cursor-pointer"
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
};
