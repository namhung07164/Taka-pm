import React, { useRef, useState, useMemo } from 'react';
import { Book, Download, Bot, ExternalLink, Search, Sparkles, Globe, HelpCircle } from 'lucide-react';
import { FAQ_CATEGORIES, FAQ_KNOWLEDGE_BASE, FaqKnowledgeEntry } from './FaqBot/faqKnowledgeEngine';
import { useAppStore } from '../store/useAppStore';
import { TabId } from '../types';

export function ManualTab() {
  const printRef = useRef<HTMLDivElement>(null);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [selectedCategory, setSelectedCategory] = useState<'All' | FaqKnowledgeEntry['category']>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    try {
      const htmlToImage = await import('html-to-image');
      const imgData = await htmlToImage.toPng(printRef.current, {
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      });
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('Takashimaya_PM_User_Manual.pdf');
    } catch (err) {
      console.error('PDF generation failed', err);
    }
  };

  const handleOpenFaqBot = () => {
    window.dispatchEvent(new CustomEvent('taka:open-faq-bot'));
  };

  const handleJumpToTab = (tabId: TabId) => {
    useAppStore.getState().setActiveTab(tabId);
  };

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return FAQ_KNOWLEDGE_BASE.filter(entry => {
      if (selectedCategory !== 'All' && entry.category !== selectedCategory) return false;
      if (!q) return true;
      const hay = `${entry.titleVi} ${entry.titleEn} ${entry.answerVi} ${entry.answerEn} ${entry.keywords.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [selectedCategory, searchQuery]);

  const renderManualBody = (raw: string) => {
    return raw.split('\n').map((line, idx) => {
      const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
      return (
        <div key={idx} className="text-xs sm:text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return (
                <strong key={pIdx} className="font-bold text-slate-900 dark:text-white">
                  {part.slice(2, -2)}
                </strong>
              );
            }
            if (part.startsWith('`') && part.endsWith('`')) {
              return (
                <code
                  key={pIdx}
                  className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-mono text-xs"
                >
                  {part.slice(1, -1)}
                </code>
              );
            }
            return <span key={pIdx}>{part}</span>;
          })}
        </div>
      );
    });
  };

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 md:p-8 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-2xl p-5 sm:p-6 mb-6 shadow-lg border border-blue-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
            <Book className="w-6 h-6 text-blue-300" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-[10px] font-bold text-blue-200 uppercase tracking-wider mb-1">
              <Sparkles className="w-3 h-3" />
              <span>USER_MANUAL.md & BUSINESS_LOGIC.md</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black tracking-tight">
              {lang === 'vi'
                ? 'Cẩm Nang Hướng Dẫn Sử Dụng Takashimaya PM'
                : 'Takashimaya PM Interactive User Manual'}
            </h1>
            <p className="text-xs sm:text-sm text-blue-200/80 mt-0.5">
              {lang === 'vi'
                ? 'Thiết kế tinh gọn, trực quan theo cấu trúc: Hiểu đơn giản ➔ Thao tác 3 bước ➔ Công thức & Ví dụ thực tế'
                : 'Concise, visual step-by-step guide for new and existing users'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full md:w-auto">
          <button
            type="button"
            onClick={() => setLang(prev => (prev === 'vi' ? 'en' : 'vi'))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
          >
            <Globe className="w-4 h-4" />
            <span>{lang === 'vi' ? 'Tiếng Việt' : 'English'}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenFaqBot}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Bot className="w-4 h-4" />
            <span>{lang === 'vi' ? 'Hỏi Trợ lý FAQ Bot' : 'Ask FAQ Bot'}</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{lang === 'vi' ? 'Tải PDF' : 'Export PDF'}</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-[#1e1e20] rounded-2xl p-3.5 mb-5 border border-slate-200 dark:border-[#38383c] shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {FAQ_CATEGORIES.map(cat => {
            const active = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {lang === 'vi' ? cat.labelVi : cat.labelEn}
              </button>
            );
          })}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={lang === 'vi' ? 'Tìm nhanh hướng dẫn, công thức...' : 'Search manual topics...'}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#27272a] border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Printable Manual Cards */}
      <div ref={printRef} className="space-y-4">
        {filteredEntries.map(entry => {
          const title = lang === 'vi' ? entry.titleVi : entry.titleEn;
          const body = lang === 'vi' ? entry.answerVi : entry.answerEn;
          const tabLabel = lang === 'vi' ? entry.targetTabLabelVi : entry.targetTabLabelEn;
          const prompts = lang === 'vi' ? entry.quickPromptsVi : entry.quickPromptsEn;

          return (
            <div
              key={entry.id}
              className="bg-white dark:bg-[#1e1e20] rounded-2xl p-5 border border-slate-200 dark:border-[#38383c] shadow-xs hover:border-blue-400/60 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm sm:text-base font-bold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 shrink-0 text-blue-500" />
                  <span>{title}</span>
                </h3>
                {entry.targetTab && tabLabel && (
                  <button
                    type="button"
                    onClick={() => handleJumpToTab(entry.targetTab!)}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
                  >
                    <span>{tabLabel}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">{renderManualBody(body)}</div>

              {prompts && prompts.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-400">
                    {lang === 'vi' ? 'Câu hỏi thực tế:' : 'Common Questions:'}
                  </span>
                  {prompts.map((p, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      onClick={handleOpenFaqBot}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50 hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      💬 {p}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
