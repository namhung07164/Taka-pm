import React, { useEffect, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { useLanguage } from "../lib/LanguageContext";
import { Portal } from './Portal';
import { X, Monitor, Copy, Check, ExternalLink, ShieldCheck, Zap, Info, GripHorizontal } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

interface DesktopOptimizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DesktopOptimizationModal({ isOpen, onClose }: DesktopOptimizationModalProps) {
  const { t } = useLanguage();
  const nodeRef = useRef<HTMLDivElement>(null);
  const [activeBrowser, setActiveBrowser] = useState<'chrome' | 'edge'>('chrome');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSettingsPath, setCopiedSettingsPath] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const appUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}${window.location.pathname}`.replace(/\/+$/, '') 
    : 'https://takashimaya.app';

  const chromeSettingsUrl = 'chrome://settings/performance';
  const edgeSettingsUrl = 'edge://settings/system';

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopiedUrl(true);
      useAppStore.getState().setToast({
        title: "Đã sao chép",
        message: "Đã sao chép URL ứng dụng vào bộ nhớ tạm!",
        type: "success"
      });
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch {
      useAppStore.getState().setToast({
        title: "Thông báo",
        message: "Không thể tự động sao chép. Vui lòng bôi đen và copy URL thủ công.",
        type: "info"
      });
    }
  };

  const handleCopySettings = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopiedSettingsPath(true);
      useAppStore.getState().setToast({
        title: "Đã sao chép",
        message: `Đã sao chép đường dẫn ${path}`,
        type: "success"
      });
      setTimeout(() => setCopiedSettingsPath(false), 2500);
    } catch {
      // ignore
    }
  };

  return (
    <Portal>
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150" 
        onClick={onClose}
      >
        <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button, input, textarea">
          <div 
            ref={nodeRef}
            className="bg-white dark:bg-[#1e1e20] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-[#333336] max-h-[90vh] pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-handle cursor-grab active:cursor-grabbing flex items-center justify-between p-5 border-b border-slate-100 dark:border-[#333336] bg-slate-50/50 dark:bg-[#252528]/50">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                  <Monitor className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-[#e3e3e3] text-base flex items-center gap-2">
                    Cấu Hình Tối Ưu Desktop & Chống Ngủ Tab
                    <GripHorizontal className="w-4 h-4 text-slate-400" />
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#a3a3a3] mt-0.5">
                    Ngăn Chrome / Edge đóng băng bộ nhớ (Memory Saver) khi bạn làm việc đa nhiệm
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-[#2e2e32] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-5">
            {/* Lợi ích */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-300">Không bị lag tab</div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400/80 mt-0.5">Không reload lại trang khi mở lại sau 15–30 phút</div>
                </div>
              </div>

              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-blue-800 dark:text-blue-300">Dữ liệu tức thời</div>
                  <div className="text-[11px] text-blue-700 dark:text-blue-400/80 mt-0.5">Duy trì đồng bộ WebSocket liên tục thời gian thực</div>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-2.5">
                <Monitor className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-indigo-800 dark:text-indigo-300">Tiết kiệm Server Read</div>
                  <div className="text-[11px] text-indigo-700 dark:text-indigo-400/80 mt-0.5">Không bị đứt quãng bộ đệm IndexedDB</div>
                </div>
              </div>
            </div>

            {/* Bước 1: Sao chép URL ứng dụng */}
            <div className="bg-slate-50 dark:bg-[#252528] p-4 rounded-xl border border-slate-200 dark:border-[#3a3a3e] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-[#d3d3d3] uppercase tracking-wider">
                  Bước 1: Sao chép URL ứng dụng của bạn
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#888]">Cần dùng để dán vào trình duyệt</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white dark:bg-[#1a1a1c] border border-slate-300 dark:border-[#4a4a4e] rounded-lg px-3 py-2 text-xs font-mono text-slate-700 dark:text-[#ccc] truncate select-all">
                  {appUrl}
                </div>
                <button
                  onClick={handleCopyUrl}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                >
                  {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedUrl ? "Đã chép!" : "Sao chép URL"}
                </button>
              </div>
            </div>

            {/* Bước 2: Chọn trình duyệt */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-[#d3d3d3] uppercase tracking-wider">
                  Bước 2: Chọn trình duyệt đang sử dụng
                </span>
              </div>

              {/* Tabs Trình duyệt */}
              <div className="flex rounded-lg bg-slate-100 dark:bg-[#28282c] p-1 border border-slate-200 dark:border-[#38383c]">
                <button
                  onClick={() => setActiveBrowser('chrome')}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                    activeBrowser === 'chrome'
                      ? 'bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
                  Google Chrome
                </button>
                <button
                  onClick={() => setActiveBrowser('edge')}
                  className={`flex-1 py-2 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${
                    activeBrowser === 'edge'
                      ? 'bg-white dark:bg-[#1e1e20] text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block"></span>
                  Microsoft Edge
                </button>
              </div>

              {/* Hướng dẫn chi tiết cho Chrome */}
              {activeBrowser === 'chrome' && (
                <div className="p-4 bg-slate-50 dark:bg-[#252528] rounded-xl border border-slate-200 dark:border-[#3a3a3e] space-y-3 text-xs leading-relaxed text-slate-700 dark:text-[#d0d0d0]">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="flex-1">
                      <span>Mở Cài đặt Hiệu suất của Chrome bằng cách mở một tab mới và dán:</span>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="bg-white dark:bg-[#1a1a1c] px-2.5 py-1 rounded border border-slate-300 dark:border-[#4a4a4e] font-mono text-[11px] text-blue-600 dark:text-blue-400 font-bold select-all">
                          {chromeSettingsUrl}
                        </code>
                        <button
                          onClick={() => handleCopySettings(chromeSettingsUrl)}
                          className="px-2 py-1 bg-slate-200 dark:bg-[#333] hover:bg-slate-300 dark:hover:bg-[#444] rounded text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedSettingsPath ? "Đã chép" : "Chép link"}
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-[#888] block mt-0.5">
                        (Hoặc vào menu <strong>⋮ (3 chấm góc phải) ➜ Cài đặt (Settings) ➜ Hiệu suất (Performance)</strong>)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="flex-1">
                      <span>Tại phần <strong>Trình tiết kiệm bộ nhớ (Memory Saver)</strong>, tìm mục:</span>
                      <div className="font-semibold text-slate-800 dark:text-white mt-0.5">
                        "Luôn duy trì các trang web này hoạt động" (Always keep these sites active)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      3
                    </span>
                    <div className="flex-1">
                      <span>Nhấn nút <strong>"Thêm" (Add)</strong>, dán URL ứng dụng vừa sao chép ở Bước 1 vào rồi nhấn <strong>"Thêm" (Save)</strong>.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Hướng dẫn chi tiết cho Edge */}
              {activeBrowser === 'edge' && (
                <div className="p-4 bg-slate-50 dark:bg-[#252528] rounded-xl border border-slate-200 dark:border-[#3a3a3e] space-y-3 text-xs leading-relaxed text-slate-700 dark:text-[#d0d0d0]">
                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      1
                    </span>
                    <div className="flex-1">
                      <span>Mở Cài đặt Hệ thống của Edge bằng cách mở một tab mới và dán:</span>
                      <div className="mt-1 flex items-center gap-2">
                        <code className="bg-white dark:bg-[#1a1a1c] px-2.5 py-1 rounded border border-slate-300 dark:border-[#4a4a4e] font-mono text-[11px] text-cyan-600 dark:text-cyan-400 font-bold select-all">
                          {edgeSettingsUrl}
                        </code>
                        <button
                          onClick={() => handleCopySettings(edgeSettingsUrl)}
                          className="px-2 py-1 bg-slate-200 dark:bg-[#333] hover:bg-slate-300 dark:hover:bg-[#444] rounded text-[11px] font-medium text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedSettingsPath ? "Đã chép" : "Chép link"}
                        </button>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-[#888] block mt-0.5">
                        (Hoặc vào menu <strong>… (3 chấm góc phải) ➜ Cài đặt (Settings) ➜ Hệ thống và hiệu suất (System and performance)</strong>)
                      </span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      2
                    </span>
                    <div className="flex-1">
                      <span>Tại phần <strong>Tối ưu hóa hiệu suất (Optimize Performance)</strong>, tìm mục:</span>
                      <div className="font-semibold text-slate-800 dark:text-white mt-0.5">
                        "Không bao giờ đặt các trang web này ở chế độ ngủ" (Never put these sites to sleep)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 font-bold flex items-center justify-center text-[11px] shrink-0 mt-0.5">
                      3
                    </span>
                    <div className="flex-1">
                      <span>Nhấn nút <strong>"Thêm" (Add)</strong>, dán URL ứng dụng vừa sao chép ở Bước 1 vào rồi nhấn <strong>"Thêm" (Save)</strong>.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Ghi chú bảo đảm */}
            <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl border border-amber-200/80 dark:border-amber-900/40 flex items-start gap-2.5 text-[11px] text-amber-800 dark:text-amber-300/90">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Lưu ý quan trọng:</strong> Sau khi thêm URL vào danh sách ngoại lệ, bạn chỉ cần thực hiện 1 lần duy nhất trên máy tính văn phòng. Trình duyệt sẽ luôn giữ trang Takashimaya ở chế độ hoạt động ưu tiên, hoàn toàn không bị ngắt kết nối hay reload ngoài ý muốn.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 dark:border-[#333336] bg-slate-50/50 dark:bg-[#252528]/50 flex justify-end">
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-200 dark:bg-[#38383c] hover:bg-slate-300 dark:hover:bg-[#48484c] text-slate-800 dark:text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
            >
              Đã hiểu & Đóng
            </button>
          </div>
        </div>
        </Draggable>
      </div>
    </Portal>
  );
}
