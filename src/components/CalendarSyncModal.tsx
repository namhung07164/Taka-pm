import React, { FC, useEffect, useMemo, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { 
  X, 
  Calendar as CalendarIcon, 
  Copy, 
  Check, 
  QrCode, 
  Download, 
  ExternalLink, 
  RefreshCw, 
  Smartphone, 
  Sliders, 
  Info, 
  Sparkles,
  ChevronRight,
  ShieldCheck,
  Globe,
  GripHorizontal
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, APP_ID } from '../lib/firebase';
import { useAppStore } from '../store/useAppStore';
import { useEnrichedData } from '../hooks/useEnrichedData';
import { generateIcsString, downloadIcsFile, toWebcalUrl } from '../lib/icalGenerator';
import { useLanguage } from '../lib/LanguageContext';
import { safeGetItemLocal, safeSetItemLocal } from '../lib/storage';
import { CalendarSyncGuideTab } from './CalendarTabParts/CalendarSyncGuideTab';
import { CalendarSyncQrTab } from './CalendarTabParts/CalendarSyncQrTab';

export const CalendarSyncModal: React.FC = () => {
  const isOpen = useAppStore(state => state.isCalendarSyncModalOpen);
  const setIsOpen = useAppStore(state => state.setIsCalendarSyncModalOpen);
  const { enrichedProjects: projects, filteredTasks: tasks } = useEnrichedData();
  const currentUser = useAppStore(state => state.currentUser);
  const { t } = useLanguage();
  const nodeRef = useRef<HTMLDivElement>(null);

  // Filters
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'mine'>('all');
  const [includeProjects, setIncludeProjects] = useState<boolean>(true);
  const [includeSubtasks, setIncludeSubtasks] = useState<boolean>(true);

  // Active view tab
  const [activeTab, setActiveTab] = useState<'subscribe' | 'qr' | 'guide'>('subscribe');

  // Cloud sync state
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishedUrl, setPublishedUrl] = useState<string>(() => {
    return safeGetItemLocal('taka_calendar_feed_url_all') || '';
  });
  const [lastPublishedTime, setLastPublishedTime] = useState<string>(() => {
    return safeGetItemLocal('taka_calendar_feed_time_all') || '';
  });
  const [copiedWebcal, setCopiedWebcal] = useState<boolean>(false);
  const [copiedHttps, setCopiedHttps] = useState<boolean>(false);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  // Load saved feed URL whenever storeFilter changes
  useEffect(() => {
    const saved = safeGetItemLocal(`taka_calendar_feed_url_${storeFilter}`);
    const savedTime = safeGetItemLocal(`taka_calendar_feed_time_${storeFilter}`);
    setPublishedUrl(saved || '');
    setLastPublishedTime(savedTime || '');
  }, [storeFilter]);

  // Generate local ICS string on the fly based on selected filters
  const currentIcsContent = useMemo(() => {
    const onlyAssignedTo = scopeFilter === 'mine' ? (currentUser?.name || currentUser?.email || '') : '';
    return generateIcsString({
      tasks,
      projects,
      calendarName: storeFilter !== 'all' 
        ? `Takashimaya ${storeFilter} Projects` 
        : 'Takashimaya Projects',
      calendarDesc: `Lịch công việc và dự án Takashimaya - ${storeFilter.toUpperCase()}`,
      storeFilter: storeFilter === 'all' ? '' : storeFilter,
      yearFilter: yearFilter === 'all' ? '' : yearFilter,
      onlyAssignedTo,
      includeProjects,
      includeSubtasks,
    });
  }, [tasks, projects, storeFilter, yearFilter, scopeFilter, includeProjects, includeSubtasks, currentUser]);

  // Count events
  const eventCount = useMemo(() => {
    const matches = currentIcsContent.match(/BEGIN:VEVENT/g);
    return matches ? matches.length : 0;
  }, [currentIcsContent]);

  // Publish / Upload live calendar to Firebase Storage
  const handlePublishCalendar = async () => {
    setIsPublishing(true);
    try {
      const filename = `takashimaya_schedule_${storeFilter.toLowerCase()}.ics`;
      const fileRef = storageRef(storage, `taka_attachments/${APP_ID}/${filename}`);
      const blob = new Blob([currentIcsContent], { type: 'text/calendar;charset=utf-8' });

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Upload timeout after 15 seconds")), 15000)
      );

      // Race the upload against the timeout
      await Promise.race([
        uploadBytes(fileRef, blob, {
          contentType: 'text/calendar; charset=utf-8',
          cacheControl: 'public, max-age=300' // 5 min cache
        }),
        timeoutPromise
      ]);

      const downloadUrl = await getDownloadURL(fileRef);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setPublishedUrl(downloadUrl);
      setLastPublishedTime(timeStr);
      safeSetItemLocal(`taka_calendar_feed_url_${storeFilter}`, downloadUrl);
      safeSetItemLocal(`taka_calendar_feed_time_${storeFilter}`, timeStr);
    } catch (err) {
      console.error("Failed to publish calendar to Firebase Storage:", err);
      // If upload fails, create data URI fallback
      const blob = new Blob([currentIcsContent], { type: 'text/calendar;charset=utf-8' });
      const fallbackUrl = URL.createObjectURL(blob);
      setPublishedUrl(fallbackUrl);
      setLastPublishedTime(new Date().toLocaleTimeString());
    } finally {
      setIsPublishing(false);
    }
  };

  // Auto-publish once if no URL exists yet
  useEffect(() => {
    if (isOpen && !publishedUrl && tasks.length > 0) {
      handlePublishCalendar();
    }
  }, [isOpen, publishedUrl, tasks.length]);

  const webcalUrl = useMemo(() => {
    return publishedUrl ? toWebcalUrl(publishedUrl) : '';
  }, [publishedUrl]);

  // Copy helpers
  const handleCopyWebcal = () => {
    if (!webcalUrl) return;
    navigator.clipboard.writeText(webcalUrl);
    setCopiedWebcal(true);
    setTimeout(() => setCopiedWebcal(false), 2000);
  };

  const handleCopyHttps = () => {
    if (!publishedUrl) return;
    navigator.clipboard.writeText(publishedUrl);
    setCopiedHttps(true);
    setTimeout(() => setCopiedHttps(false), 2000);
  };

  // Direct download / open
  const handleDownloadIcs = () => {
    const filename = `Takashimaya_${storeFilter.toUpperCase()}_Calendar_${new Date().toISOString().slice(0, 10)}.ics`;
    downloadIcsFile(currentIcsContent, filename);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <Draggable disabled={typeof window !== 'undefined' && window.innerWidth < 768} handle=".modal-handle" bounds="parent" nodeRef={nodeRef} cancel="button, input, select">
        <div 
          ref={nodeRef}
          className="bg-white dark:bg-[#1e1e20] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-[#444446] overflow-hidden flex flex-col max-h-[92vh] pointer-events-auto"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-handle cursor-grab active:cursor-grabbing px-5 py-4 border-b border-slate-100 dark:border-[#333336] flex items-center justify-between bg-slate-50/80 dark:bg-[#28282a]/50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shadow-xs">
                <CalendarIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base sm:text-lg text-slate-800 dark:text-[#f0f0f0] flex items-center gap-2">
                  Đồng bộ Apple Calendar (iOS)
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    {eventCount} sự kiện
                  </span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#a3a3a3]">
                  Tự động hiển thị và cập nhật lịch trình dự án vào app Lịch của iPhone/iPad
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-[#e3e3e3] rounded-lg hover:bg-slate-100 dark:hover:bg-[#333336] transition-colors"
              title="Đóng (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

        {/* Filter Toolbar */}
        <div className="px-5 py-3 bg-slate-50/40 dark:bg-[#232326]/40 border-b border-slate-100 dark:border-[#333336] flex flex-wrap items-center gap-2.5 text-xs">
          <span className="font-semibold text-slate-600 dark:text-[#c3c3c3] flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            Lọc lịch:
          </span>

          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-700 dark:text-[#e3e3e3] font-medium outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">Tất cả chi nhánh (HCM & HN)</option>
            <option value="HCM">Chỉ Takashimaya HCM</option>
            <option value="HN">Chỉ Takashimaya HN</option>
          </select>

          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-700 dark:text-[#e3e3e3] font-medium outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">Tất cả các năm</option>
            <option value="2026">Năm 2026</option>
            <option value="2027">Năm 2027</option>
            <option value="2028">Năm 2028</option>
          </select>

          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#444446] bg-white dark:bg-[#1e1e20] text-slate-700 dark:text-[#e3e3e3] font-medium outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">Tất cả công việc</option>
            <option value="mine">Chỉ việc tôi phụ trách</option>
          </select>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-[#a3a3a3] ml-auto select-none">
            <input 
              type="checkbox" 
              checked={includeProjects} 
              onChange={e => setIncludeProjects(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500 border-slate-300 dark:border-[#555]"
            />
            Mốc dự án
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-[#a3a3a3] select-none">
            <input 
              type="checkbox" 
              checked={includeSubtasks} 
              onChange={e => setIncludeSubtasks(e.target.checked)}
              className="rounded text-red-600 focus:ring-red-500 border-slate-300 dark:border-[#555]"
            />
            Task con
          </label>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-slate-200 dark:border-[#333336] bg-slate-100/60 dark:bg-[#232326]">
          <button
            onClick={() => setActiveTab('subscribe')}
            className={`flex-1 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              activeTab === 'subscribe'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-[#1e1e20]'
                : 'border-transparent text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            1-Chạm iOS / Tải về
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`flex-1 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              activeTab === 'qr'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-[#1e1e20]'
                : 'border-transparent text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Quét mã QR iPhone
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex-1 py-3 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
              activeTab === 'guide'
                ? 'border-red-600 text-red-600 dark:text-red-400 bg-white dark:bg-[#1e1e20]'
                : 'border-transparent text-slate-600 dark:text-[#a3a3a3] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Info className="w-4 h-4" />
            Hướng dẫn cài đặt
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'subscribe' && (
            <div className="space-y-4">
              {/* iOS 1-Tap Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-br from-red-50 via-rose-50 to-orange-50 dark:from-red-950/30 dark:via-rose-950/20 dark:to-orange-950/10 border border-red-200/80 dark:border-red-800/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white shadow-xs mb-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Khuyên Dùng Cho iPhone & iPad
                    </div>
                    <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                      Đăng ký Lịch Trực Tuyến (Webcal Subscription)
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-[#c3c3c3] mt-1 leading-relaxed">
                      Lịch tự động đồng bộ liên tục 2 chiều: mỗi khi tiến độ thay đổi trong app, ứng dụng Lịch của iPhone sẽ tự động cập nhật mà không cần thao tác lại.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <a
                    href={webcalUrl || '#'}
                    onClick={(e) => {
                      if (!webcalUrl) {
                        e.preventDefault();
                        handlePublishCalendar();
                      }
                    }}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs sm:text-sm font-bold shadow-md shadow-red-600/20 transition-all cursor-pointer touch-manipulation"
                  >
                    <Smartphone className="w-4 h-4" />
                    Mở đăng ký trên Apple Calendar
                    <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                  </a>

                  <button
                    onClick={handlePublishCalendar}
                    disabled={isPublishing}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#28282a] border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#333336] active:scale-95 text-slate-700 dark:text-[#e3e3e3] text-xs font-semibold transition-all cursor-pointer"
                    title="Đẩy dữ liệu tiến độ mới nhất lên đường dẫn lịch"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPublishing ? 'animate-spin text-red-600' : 'text-slate-500'}`} />
                    {isPublishing ? 'Đang cập nhật...' : 'Làm mới nguồn lịch'}
                  </button>
                </div>

                {lastPublishedTime && (
                  <div className="mt-2 text-[11px] text-slate-500 dark:text-[#888] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    Đã xuất bản trực tuyến lúc {lastPublishedTime} ({eventCount} mục)
                  </div>
                )}
              </div>

              {/* Copy Links Section */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#28282a]/60 border border-slate-200 dark:border-[#333336] space-y-3">
                <h5 className="text-xs font-bold text-slate-700 dark:text-[#e3e3e3] uppercase tracking-wider flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-slate-400" />
                  Đường dẫn đăng ký (Subscription URL)
                </h5>

                {/* Webcal Link */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-[#a3a3a3]">
                    Link chuẩn Webcal (Cho iOS Calendar, Mac Calendar, Outlook):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webcalUrl || 'Đang tạo đường dẫn...'}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-slate-700 dark:text-[#e3e3e3] select-all outline-none"
                    />
                    <button
                      onClick={handleCopyWebcal}
                      disabled={!webcalUrl}
                      className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                    >
                      {copiedWebcal ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Chép link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* HTTPS Link */}
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-500 dark:text-[#a3a3a3]">
                    Link HTTPS trực tiếp (Cho Google Calendar / iCal Feed):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={publishedUrl || 'Đang tạo đường dẫn...'}
                      className="flex-1 px-3 py-2 text-xs font-mono bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] rounded-lg text-slate-700 dark:text-[#e3e3e3] select-all outline-none"
                    />
                    <button
                      onClick={handleCopyHttps}
                      disabled={!publishedUrl}
                      className="px-3 py-2 rounded-lg bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-[#444446] hover:bg-slate-50 dark:hover:bg-[#333336] text-slate-700 dark:text-[#e3e3e3] text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                    >
                      {copiedHttps ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600 font-bold">Đã chép</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Chép link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct File Download */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#28282a]/60 border border-slate-200 dark:border-[#333336] flex items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-slate-800 dark:text-[#e3e3e3]">
                    Tải file lịch thủ công (.ics)
                  </h5>
                  <p className="text-[11px] text-slate-500 dark:text-[#a3a3a3]">
                    Dành cho nhập tức thời toàn bộ sự kiện hiện tại vào lịch thiết bị không cần liên kết mạng.
                  </p>
                </div>
                <button
                  onClick={handleDownloadIcs}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 dark:bg-slate-200 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải file .ics
                </button>
              </div>
            </div>
          )}

          {activeTab === 'qr' && (
            <CalendarSyncQrTab
              webcalUrl={webcalUrl}
              publishedUrl={publishedUrl}
            />
          )}

          {activeTab === 'guide' && (
            <CalendarSyncGuideTab />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 dark:border-[#333336] bg-slate-50 dark:bg-[#28282a]/50 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-[#a3a3a3]">
            Hỗ trợ iOS 14+, iPadOS, macOS, Outlook và Google Calendar.
          </span>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-[#333336] dark:hover:bg-[#444446] text-slate-700 dark:text-[#e3e3e3] font-semibold active:scale-95 transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
      </Draggable>
    </div>
  );
};
