import React, { useState, useEffect, useRef } from "react";
import { createPortal } from 'react-dom';
import { 
  X, CloudUpload, Settings, Key, GripHorizontal, 
  CheckCircle2, AlertCircle, HelpCircle, Copy, Check, 
  ChevronDown, ChevronUp, RefreshCw 
} from 'lucide-react';
import Draggable from 'react-draggable';
import { testR2Connection } from '../lib/r2Upload';
import { cn } from '../lib/utils';
import { useAppStore } from '../../../store/useAppStore';
import { doc, setDoc } from 'firebase/firestore';
import { db, APP_ID } from '../../../lib/firebase';

interface R2UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartExport: () => void;
  uploading: boolean;
  uploadProgress: number;
  statusMessage?: string;
}

const CORS_SAMPLE_JSON = `[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [],
    "MaxAgeSeconds": 3000
  }
]`;

export default function R2UploadModal({ isOpen, onClose, onStartExport, uploading, uploadProgress, statusMessage }: R2UploadModalProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucketName, setBucketName] = useState('');
  const [cfZoneId, setCfZoneId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [copiedCors, setCopiedCors] = useState(false);
  const [testStatus, setTestStatus] = useState<{ state: 'idle' | 'testing' | 'success' | 'error'; message: string }>({
    state: 'idle',
    message: '',
  });

  const r2Config = useAppStore(state => state.r2Config);
  const setR2Config = useAppStore(state => state.setR2Config);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Ưu tiên lấy từ global store (đồng bộ từ Server), nếu không có mới lấy local storage
    const storedAccountId = r2Config?.accountId || (localStorage.getItem('r2_account_id') || '').trim();
    const storedAccessKey = r2Config?.accessKeyId || (localStorage.getItem('r2_access_key') || localStorage.getItem('r2_access_key_id') || '').trim();
    const storedSecretKey = r2Config?.secretAccessKey || (localStorage.getItem('r2_secret_key') || localStorage.getItem('r2_secret_access_key') || '').trim();
    const storedBucketName = r2Config?.bucketName || (localStorage.getItem('r2_bucket_name') || '').trim();
    const storedCfZoneId = (localStorage.getItem('cf_zone_id') || '').trim();
    const storedCfApiToken = (localStorage.getItem('cf_api_token') || '').trim();

    setAccountId(storedAccountId);
    setAccessKey(storedAccessKey);
    setSecretKey(storedSecretKey);
    setBucketName(storedBucketName);
    setCfZoneId(storedCfZoneId);
    setCfApiToken(storedCfApiToken);
    setTestStatus({ state: 'idle', message: '' });

    if (storedAccountId && storedAccessKey && storedSecretKey && storedBucketName) {
      setShowConfig(false);
    } else {
      setShowConfig(true);
    }
  }, [isOpen, r2Config]);

  const handleCopyCors = () => {
    navigator.clipboard.writeText(CORS_SAMPLE_JSON);
    setCopiedCors(true);
    setTimeout(() => setCopiedCors(false), 2000);
  };

  const handleTestConnection = async () => {
    const cleanAccountId = accountId.trim();
    const cleanBucketName = bucketName.trim();
    const cleanAccessKey = accessKey.trim();
    const cleanSecretKey = secretKey.trim();

    if (!cleanAccountId || !cleanBucketName || !cleanAccessKey || !cleanSecretKey) {
      setTestStatus({
        state: 'error',
        message: 'Vui lòng điền đủ 4 trường: Account ID, Bucket Name, Access Key và Secret Key trước khi test.',
      });
      return;
    }

    setTestStatus({ state: 'testing', message: 'Đang gửi file kiểm tra kết nối & CORS lên Cloudflare R2...' });
    const res = await testR2Connection({
      accountId: cleanAccountId,
      bucketName: cleanBucketName,
      accessKeyId: cleanAccessKey,
      secretAccessKey: cleanSecretKey,
    });

    if (res.ok) {
      setTestStatus({ state: 'success', message: res.message });
    } else {
      setTestStatus({ state: 'error', message: res.message });
    }
  };

  const handleSaveAndUpload = async () => {
    const cleanAccountId = accountId.trim();
    const cleanAccessKey = accessKey.trim();
    const cleanSecretKey = secretKey.trim();
    const cleanBucketName = bucketName.trim();
    const cleanCfZoneId = cfZoneId.trim();
    const cleanCfApiToken = cfApiToken.trim();

    if (cleanAccessKey && cleanSecretKey && cleanAccessKey === cleanSecretKey) {
      alert('Lỗi cấu hình Cloudflare R2:\nSecret Access Key đang bị trùng khớp với Access Key ID!\n\nTrong Cloudflare R2:\n- Access Key ID: chuỗi 32 ký tự hex (vd: 53fdcb...)\n- Secret Access Key: chuỗi 64 ký tự hex (vd: a1b2c3d4...)\n\nVui lòng kiểm tra lại Cloudflare Dashboard > R2 > Manage R2 API Tokens để lấy đúng Secret Access Key.');
      return;
    }

    localStorage.setItem('r2_account_id', cleanAccountId);
    localStorage.setItem('r2_access_key', cleanAccessKey);
    localStorage.setItem('r2_access_key_id', cleanAccessKey);
    localStorage.setItem('r2_secret_key', cleanSecretKey);
    localStorage.setItem('r2_secret_access_key', cleanSecretKey);
    localStorage.setItem('r2_bucket_name', cleanBucketName);
    localStorage.setItem('cf_zone_id', cleanCfZoneId);
    localStorage.setItem('cf_api_token', cleanCfApiToken);

    // Đồng bộ cấu hình lên Firestore để dùng chung toàn hệ thống
    if (cleanAccountId && cleanBucketName && cleanAccessKey && cleanSecretKey) {
      const configData = {
        accountId: cleanAccountId,
        bucketName: cleanBucketName,
        accessKeyId: cleanAccessKey,
        secretAccessKey: cleanSecretKey
      };
      setR2Config(configData);
      try {
        await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "r2_credentials"), configData);
        await setDoc(doc(db, "artifacts", APP_ID, "public", "data", "taka_config", "versions"), { 
          r2Version: Date.now(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (e) {
        console.error("Lỗi khi lưu cấu hình R2 lên server:", e);
      }
    }

    if (window.confirm("Đồng ý lưu bản mới lên Cloudflare R2?\nHệ thống sẽ tự động dọn dẹp các bản cũ trên R2 để chỉ lưu 1 version duy nhất, tránh rác lưu trữ.\nĐồng thời, khoá kết nối R2 sẽ được đồng bộ lên Server cho toàn hệ thống.")) {
      onStartExport();
    }
  };

  if (!isOpen || !mounted) return null;

  const isConfigured = accountId.trim() && bucketName.trim() && accessKey.trim() && secretKey.trim();

  const modalContent = (
    <div className="fixed inset-0 z-[999999] bg-black/80 flex items-center justify-center p-2 sm:p-4 backdrop-blur-sm animate-in fade-in duration-150 overflow-hidden">
      <Draggable
        disabled={typeof window !== 'undefined' && window.innerWidth < 640}
        handle=".modal-handle"
        bounds="parent"
        nodeRef={nodeRef}
        cancel="button, input, select, textarea, .no-drag"
      >
        <div 
          ref={nodeRef} 
          className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[88vh] flex flex-col overflow-hidden my-auto pointer-events-auto"
        >
          <div className="modal-handle cursor-grab active:cursor-grabbing flex items-center justify-between p-4 border-b border-slate-800 shrink-0 bg-slate-900/95 select-none">
            <div className="flex items-center gap-2.5">
              <GripHorizontal className="text-slate-500 shrink-0" size={18} />
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2 font-sans">
                <CloudUpload className="text-amber-400" size={20} />
                Upload to Cloudflare R2
              </h2>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-colors no-drag">
              <X size={20} />
            </button>
          </div>

        <div className="p-5 space-y-4 font-sans overflow-y-auto flex-1 custom-scrollbar">
          {!showConfig && isConfigured ? (
            <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-1">
                  <Key size={12} className="text-amber-500" /> Cấu hình hiện tại
                </span>
                <button 
                  onClick={() => setShowConfig(true)} 
                  className="text-xs text-amber-500 hover:text-amber-400 font-bold transition-colors flex items-center gap-1"
                  disabled={uploading}
                >
                  <Settings size={12} /> Cài đặt lại
                </button>
              </div>
              <div className="text-sm text-slate-300 space-y-1.5 font-mono text-[13px]">
                <div><span className="text-slate-500 font-sans">Bucket:</span> <span className="text-amber-400">{bucketName}</span></div>
                <div><span className="text-slate-500 font-sans">Account ID:</span> {accountId.substring(0, 12)}...</div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {isConfigured && (
                <div className="flex justify-end">
                  <button 
                    onClick={() => setShowConfig(false)} 
                    className="text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium"
                    disabled={uploading}
                  >
                    ← Ẩn bảng điền API
                  </button>
                </div>
              )}

              {/* Collapsible Guide */}
              <div className="border border-slate-800 rounded-xl bg-slate-950/60 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowGuide(!showGuide)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-semibold text-amber-400 hover:text-amber-300 hover:bg-slate-900/60 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <HelpCircle size={14} /> Hướng dẫn điền & Khắc phục lỗi (CORS / Token)
                  </span>
                  {showGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                {showGuide && (
                  <div className="p-3.5 border-t border-slate-800/80 text-xs text-slate-300 space-y-3 bg-slate-900/30">
                    <div className="space-y-1">
                      <p className="font-bold text-amber-300">1. Khi tạo R2 API Token trong Cloudflare:</p>
                      <p>• Quyền (Permissions): Chọn <strong className="text-white bg-slate-800 px-1 py-0.5 rounded">Object Read & Write</strong> (hoặc Admin Read & Write). <span className="text-rose-400">Không chọn Object Read Only</span>.</p>
                      <p>• Account ID: Xem ở cột phải trang chính R2 trong Cloudflare.</p>
                    </div>

                    <div className="space-y-1.5 border-t border-slate-800 pt-2">
                      <p className="font-bold text-amber-300">2. Cấu hình CORS (Nguyên nhân 99% lỗi khi Save):</p>
                      <p>• Vào Cloudflare Dashboard &gt; <strong>R2</strong> &gt; Chọn <strong>Bucket của bạn</strong> &gt; Tab <strong>Settings</strong> &gt; Cuộn xuống mục <strong>CORS Policy</strong> &gt; Bấm <strong>Add CORS policy</strong>.</p>
                      <div className="relative">
                        <pre className="p-2 bg-slate-950 border border-slate-800 rounded text-[11px] font-mono text-emerald-400 overflow-x-auto max-h-28">
                          {CORS_SAMPLE_JSON}
                        </pre>
                        <button
                          type="button"
                          onClick={handleCopyCors}
                          className="absolute top-1.5 right-1.5 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] rounded flex items-center gap-1 border border-slate-700 transition-colors"
                        >
                          {copiedCors ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                          {copiedCors ? 'Đã copy!' : 'Copy JSON'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Account ID</label>
                <input
                  type="text"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-sm font-mono transition-colors"
                  placeholder="e.g. 1a2b3c4d5e6f7g8h9i0j"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Bucket Name</label>
                <input
                  type="text"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-sm font-mono transition-colors"
                  placeholder="e.g. my-taka-exports"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Access Key ID</label>
                <input
                  type="text"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500 text-sm font-mono transition-colors"
                  placeholder="e.g. YOUR_ACCESS_KEY_ID"
                  disabled={uploading}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Secret Access Key</label>
                <input
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className={cn(
                    "w-full bg-slate-950 border rounded-lg px-3 py-2 text-white focus:outline-none text-sm font-mono transition-colors",
                    accessKey.trim() && secretKey.trim() && accessKey.trim() === secretKey.trim()
                      ? "border-rose-500 focus:border-rose-500 text-rose-200"
                      : "border-slate-700 focus:border-amber-500"
                  )}
                  placeholder="e.g. YOUR_SECRET_ACCESS_KEY"
                  disabled={uploading}
                />
                {accessKey.trim() && secretKey.trim() && accessKey.trim() === secretKey.trim() && (
                  <p className="mt-1 text-[11px] text-rose-400 font-semibold flex items-center gap-1">
                    ⚠️ Secret Access Key đang bị trùng với Access Key ID! Key bí mật của Cloudflare R2 là chuỗi 64 ký tự hex.
                  </p>
                )}
              </div>

              {/* Test Connection Button & Status */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={uploading || testStatus.state === 'testing' || !accountId || !bucketName || !accessKey || !secretKey}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
                >
                  {testStatus.state === 'testing' ? (
                    <>
                      <RefreshCw size={13} className="animate-spin text-amber-400" />
                      <span>Đang kiểm tra kết nối và CORS...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>Kiểm tra kết nối & CORS trước khi Lưu</span>
                    </>
                  )}
                </button>

                {testStatus.state === 'success' && (
                  <div className="mt-2 p-2.5 rounded-lg bg-emerald-950/50 border border-emerald-800/80 text-xs text-emerald-300 flex items-start gap-2">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{testStatus.message}</span>
                  </div>
                )}

                {testStatus.state === 'error' && (
                  <div className="mt-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-xs text-rose-300 flex items-start gap-2">
                    <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span>{testStatus.message}</span>
                  </div>
                )}
              </div>
              
              <div className="pt-2 mt-4 border-t border-slate-800">
                <h3 className="text-xs font-semibold text-slate-300 uppercase mb-3 flex items-center gap-1.5"><Settings size={14} className="text-brand-400"/> Tùy chọn xóa Cache</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Cloudflare Zone ID (Tùy chọn)</label>
                    <input
                      type="text"
                      value={cfZoneId}
                      onChange={(e) => setCfZoneId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500 text-sm font-mono transition-colors"
                      placeholder="e.g. 023e105f4ecef8ad9ca31a8372d0c353"
                      disabled={uploading}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">CF API Token (Quyền Purge Cache, Tùy chọn)</label>
                    <input
                      type="password"
                      value={cfApiToken}
                      onChange={(e) => setCfApiToken(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-brand-500 text-sm font-mono transition-colors"
                      placeholder="e.g. xyZabc123"
                      disabled={uploading}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {uploading && (
            <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-300">
                <span className="flex items-center gap-2">
                  <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
                  {statusMessage || 'Đang tải file lên Cloudflare R2...'}
                </span>
                <span className="font-mono text-amber-400 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
                <div 
                  className="bg-amber-500 h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="pt-2 text-xs text-slate-400 bg-slate-800/40 p-3.5 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-amber-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              Chế độ Lưu 1 Version Duy Nhất (Chống Rác R2)
            </div>
            <p>Hệ thống tự động lưu phiên bản mới và <strong className="text-white">quét xóa toàn bộ các bản xuất cũ</strong> trên bucket R2 để tránh rác và không tốn chi phí lưu trữ.</p>
            <p className="text-amber-500/80"><strong className="text-amber-500">Lưu ý cấu hình:</strong> Đảm bảo cấu hình CORS trên Cloudflare R2 Bucket cho phép các method <code className="text-slate-300 bg-slate-900 border border-slate-700 px-1 rounded">GET, PUT, DELETE</code>.</p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 flex justify-end gap-3 bg-slate-900/50">
          <button 
            onClick={onClose}
            className="px-4 py-2 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors text-sm font-medium font-sans"
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            onClick={handleSaveAndUpload}
            disabled={uploading || !accountId.trim() || !bucketName.trim() || !accessKey.trim() || !secretKey.trim()}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors text-sm font-bold font-sans flex items-center justify-center min-w-[120px]"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Uploading...
              </>
            ) : (!showConfig && isConfigured ? "Upload Now" : "Save & Upload")}
          </button>
        </div>
        </div>
      </Draggable>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
