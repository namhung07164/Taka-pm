import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Draggable from 'react-draggable';
import { Bot, X, Send, Sparkles, BookOpen, GripHorizontal, RotateCcw, HelpCircle, Globe, Zap, Minimize2, Maximize2 } from 'lucide-react';
import { FAQ_CATEGORIES, FAQ_KNOWLEDGE_BASE, FaqKnowledgeEntry, searchFaqKnowledge } from './faqKnowledgeEngine';
import { FaqQuickChip, TAB_DISPLAY_NAMES, getQuickChipsForTab } from './faqTabQuickChips';
import { getDailyAiQuotaStatus, incrementDailyAiQuota, getSmartCachedAiAnswer, saveSmartCachedAiAnswer } from './faqAiCacheAndQuota';
import { FaqMessageList, ChatMessage } from './FaqMessageList';
import { useAppStore } from '../../store/useAppStore';
import { TabId } from '../../types';

export const FaqChatbotModal: React.FC = React.memo(() => {
  const activeTab = useAppStore(state => state.activeTab);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [selectedCategory, setSelectedCategory] = useState<'All' | FaqKnowledgeEntry['category']>('All');
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [quotaState, setQuotaState] = useState(() => getDailyAiQuotaStatus());

  const nodeRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeTabQuickChips = useMemo(() => getQuickChipsForTab(activeTab), [activeTab]);
  const activeTabDisplay = useMemo(() => {
    const info = TAB_DISPLAY_NAMES[activeTab];
    if (!info) return activeTab.toUpperCase();
    return lang === 'vi' ? info.vi : info.en;
  }, [activeTab, lang]);

  const initialGreeting = useMemo<ChatMessage>(
    () => ({
      id: 'welcome',
      role: 'assistant',
      tierSource: 'local_manual',
      text:
        lang === 'vi'
          ? '👋 Xin chào! Tôi là **Trợ lý Hướng dẫn Taka PM (Hybrid 3-Tier)**.\n\n⚡ **Tầng 1 (0ms - 0đ)**: Bấm ngay các nút gợi ý theo Tab hiện tại ở thanh trên.\n🤖 **Tầng 2 (Gemini 2.5 Flash)**: Đặt câu hỏi tự do ở ô bên dưới (20 lượt miễn phí/ngày).\n💾 **Tầng 3 (Smart Cache)**: Tự động lưu câu trả lời vào Dexie.js / LocalStorage để phản hồi tức thì.'
          : '👋 Welcome! I am the **Taka PM Hybrid 3-Tier User Manual Assistant**.\n\n⚡ **Tier 1 (0ms - Free)**: Tap any context-aware Quick Chip for your active tab above.\n🤖 **Tier 2 (Gemini 2.5 Flash)**: Ask custom questions below (20 free AI queries/day).\n💾 **Tier 3 (Smart Cache)**: Caches AI answers in Dexie.js / LocalStorage for instant 0ms reuse.',
      primaryEntry: FAQ_KNOWLEDGE_BASE[0],
      relatedEntries: FAQ_KNOWLEDGE_BASE.slice(0, 4),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }),
    [lang]
  );

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);

  useEffect(() => {
    setMessages(prev => (prev.length <= 1 ? [initialGreeting] : prev));
  }, [initialGreeting]);

  useEffect(() => {
    if (isOpen) {
      setQuotaState(getDailyAiQuotaStatus());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleOpenEvent = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };
    window.addEventListener('taka:open-faq-bot', handleOpenEvent);
    return () => window.removeEventListener('taka:open-faq-bot', handleOpenEvent);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  const categoryEntries = useMemo(() => {
    if (selectedCategory === 'All') return FAQ_KNOWLEDGE_BASE;
    return FAQ_KNOWLEDGE_BASE.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

  const handleJumpToTab = useCallback((tabId: TabId) => {
    try {
      useAppStore.getState().setActiveTab(tabId);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setIsOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSelectQuickChip = useCallback(
    (chip: FaqQuickChip) => {
      const questionLabel = lang === 'vi' ? chip.labelVi : chip.labelEn;
      const answerBody = lang === 'vi' ? chip.answerVi : chip.answerEn;
      const targetTabLabel = lang === 'vi' ? chip.targetTabLabelVi : chip.targetTabLabelEn;
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      setMessages(prev => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', text: questionLabel, timestamp: now },
        {
          id: `a_${Date.now() + 1}`,
          role: 'assistant',
          text: answerBody,
          tierSource: 'tier1_quick_chip',
          targetTab: chip.targetTab,
          targetTabLabel,
          timestamp: now
        }
      ]);
    },
    [lang]
  );

  const handleSelectEntry = useCallback(
    (entry: FaqKnowledgeEntry) => {
      const userQuestion = lang === 'vi' ? entry.titleVi : entry.titleEn;
      const answerBody = lang === 'vi' ? entry.answerVi : entry.answerEn;
      const related = (entry.relatedIds || [])
        .map(id => FAQ_KNOWLEDGE_BASE.find(x => x.id === id))
        .filter(Boolean) as FaqKnowledgeEntry[];

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', text: userQuestion, timestamp: now },
        {
          id: `a_${Date.now() + 1}`,
          role: 'assistant',
          text: `### ${userQuestion}\n${answerBody}`,
          tierSource: 'tier1_quick_chip',
          primaryEntry: entry,
          relatedEntries: related,
          timestamp: now
        }
      ]);
    },
    [lang]
  );

  const submitQuestionText = useCallback(
    async (rawQuestion: string) => {
      const q = rawQuestion.trim();
      if (!q || isTyping) return;

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setMessages(prev => [
        ...prev,
        { id: `u_${Date.now()}`, role: 'user', text: q, timestamp: now }
      ]);
      setInputQuery('');
      setIsTyping(true);

      const localResult = searchFaqKnowledge(q, lang);
      const topEntry = localResult.bestMatches[0];

      // 1. Tầng 3: Smart Cache (Dexie.js / LocalStorage)
      const cachedAnswer = await getSmartCachedAiAnswer(q, lang);
      if (cachedAnswer) {
        setMessages(prev => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            text: cachedAnswer,
            tierSource: 'tier3_smart_cache',
            primaryEntry: topEntry,
            relatedEntries: localResult.bestMatches,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setIsTyping(false);
        return;
      }

      // 2. Kiểm tra Daily Quota (taka_ai_quota_YYYY-MM-DD, tối đa 20 câu/ngày)
      const currentQuota = getDailyAiQuotaStatus();
      setQuotaState(currentQuota);
      if (currentQuota.isExceeded) {
        const quotaMsg =
          lang === 'vi'
            ? `### ⚠️ Đã hết lượt hỏi AI miễn phí hôm nay (${currentQuota.used}/${currentQuota.limit} câu)\n` +
              `Bạn đã sử dụng hết **20 câu hỏi AI mới** trong ngày. Vui lòng bấm vào các **Nút gợi ý nhanh (Quick Chips)** ở trên hoặc tham khảo hướng dẫn tĩnh khớp nhất dưới đây:\n\n---\n\n` +
              localResult.formattedAnswer
            : `### ⚠️ Daily Free AI Quota Reached (${currentQuota.used}/${currentQuota.limit} queries)\n` +
              `You have used all **20 free AI questions** for today. Please use the **Quick Chips** above or review the closest manual guide below:\n\n---\n\n` +
              localResult.formattedAnswer;

        setMessages(prev => [
          ...prev,
          {
            id: `a_${Date.now()}`,
            role: 'assistant',
            text: quotaMsg,
            tierSource: 'quota_exceeded_fallback',
            primaryEntry: topEntry,
            relatedEntries: localResult.bestMatches,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setIsTyping(false);
        return;
      }

      // 3. Tầng 2: Gọi API Gemini 2.5 Flash qua server.ts (maxOutputTokens: 300)
      try {
        const res = await fetch('/api/faq-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            lang,
            activeTab,
            localContext: localResult.formattedAnswer
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.answer) {
            const isGeminiSource = data.source === 'gemini_2_5_flash';
            if (isGeminiSource) {
              const nextQuota = incrementDailyAiQuota();
              setQuotaState(nextQuota);
              saveSmartCachedAiAnswer(q, data.answer, lang);
            }
            setMessages(prev => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                text: data.answer,
                tierSource: isGeminiSource ? 'tier2_gemini_flash' : 'local_manual',
                primaryEntry: topEntry,
                relatedEntries: localResult.bestMatches,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            setIsTyping(false);
            return;
          }
        }
      } catch {
        // Fallback an toàn về dữ liệu tĩnh nếu mất mạng hoặc lỗi API
      }

      setMessages(prev => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: localResult.formattedAnswer,
          tierSource: 'local_manual',
          primaryEntry: topEntry,
          relatedEntries: localResult.bestMatches,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsTyping(false);
    },
    [isTyping, lang, activeTab]
  );

  const handleSendQuestion = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      submitQuestionText(inputQuery);
    },
    [inputQuery, submitQuestionText]
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(prev => !prev);
          setIsMinimized(false);
        }}
        title="User Manual & Hybrid AI Assistant"
        className="fixed bottom-6 right-4 z-[9000] flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-600/30 border border-white/20 active:scale-95 touch-manipulation transition-all print:hidden"
      >
        <Bot className="w-4 h-4" />
        <span className="text-xs font-bold tracking-tight hidden sm:inline">FAQ Guide</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9998] pointer-events-none flex items-end sm:items-center justify-end sm:justify-center p-2 sm:p-4 print:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs pointer-events-auto sm:hidden z-0"
            onClick={() => setIsOpen(false)}
          />

          <Draggable
            nodeRef={nodeRef}
            handle=".modal-handle"
            cancel="button, input, textarea, select, .no-drag"
            disabled={typeof window !== 'undefined' && window.innerWidth < 768}
            bounds="parent"
          >
            <div
              ref={nodeRef}
              className={`pointer-events-auto relative z-10 w-full sm:w-[560px] max-w-[96vw] ${
                isMinimized ? 'h-auto' : 'h-[85vh] sm:h-[680px] max-h-[92vh]'
              } bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all`}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-4 py-3 flex items-center justify-between select-none shrink-0">
                <div className="modal-handle cursor-grab active:cursor-grabbing flex items-center gap-2.5 min-w-0 flex-1 mr-2 py-0.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs sm:text-sm font-bold tracking-tight truncate">
                        Taka PM Hybrid Manual & AI
                      </h3>
                      <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-blue-200/90 truncate">
                      <span>📍 {activeTabDisplay}</span>
                      <span>•</span>
                      <span
                        className={
                          quotaState.isExceeded ? 'text-rose-300 font-bold' : 'text-emerald-300 font-bold'
                        }
                      >
                        AI Quota: {quotaState.remaining}/{quotaState.limit}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 z-30 pointer-events-auto">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setLang(prev => (prev === 'vi' ? 'en' : 'vi')); }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase transition-colors active:scale-95 cursor-pointer"
                    title="Switch Language (VN / EN)"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {lang.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setMessages([initialGreeting]); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors active:scale-95 cursor-pointer"
                    title="Reset Conversation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setIsMinimized(prev => !prev); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors active:scale-95 cursor-pointer"
                    title={isMinimized ? 'Expand' : 'Minimize'}
                  >
                    {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/15 hover:bg-rose-600 text-white transition-all active:scale-90 cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!isMinimized && (
                <>
                  {/* Tầng 1: Quick Chips theo Tab hiện tại (0đ, 0ms) */}
                  <div className="px-3 py-2 bg-emerald-50/70 dark:bg-[#27272a]/70 border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mb-1.5">
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {lang === 'vi'
                          ? `Gợi ý nhanh cho ${activeTabDisplay} (0ms):`
                          : `Instant Quick Chips for ${activeTabDisplay} (0ms):`}
                      </span>
                      <span className="text-[9px] text-slate-400">Tier 1 • 0 Token</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {activeTabQuickChips.map(chip => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => handleSelectQuickChip(chip)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#1e1e20] text-emerald-700 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/60 hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40 active:scale-95 transition-all cursor-pointer shadow-2xs"
                        >
                          <Zap className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span>{lang === 'vi' ? chip.labelVi : chip.labelEn}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category Filter Bar */}
                  <div className="px-3 py-1.5 bg-slate-50 dark:bg-[#27272a]/40 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                    {FAQ_CATEGORIES.map(cat => {
                      const active = selectedCategory === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategory(cat.id)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 cursor-pointer ${
                            active
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white dark:bg-[#27272a] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {lang === 'vi' ? cat.labelVi : cat.labelEn}
                        </button>
                      );
                    })}
                  </div>

                  {/* Manual Topics */}
                  <div className="px-3 py-1.5 bg-blue-50/40 dark:bg-blue-950/10 border-b border-slate-200 dark:border-slate-800 max-h-20 overflow-y-auto shrink-0">
                    <div className="flex flex-wrap gap-1.5">
                      {categoryEntries.map(entry => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => handleSelectEntry(entry)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white dark:bg-[#27272a] text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 hover:bg-blue-50 active:scale-95 transition-all text-left cursor-pointer"
                        >
                          <BookOpen className="w-2.5 h-2.5 shrink-0 text-blue-500" />
                          <span className="truncate max-w-[230px]">
                            {lang === 'vi' ? entry.titleVi : entry.titleEn}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <FaqMessageList
                    messages={messages}
                    lang={lang}
                    isTyping={isTyping}
                    messagesEndRef={messagesEndRef}
                    onJumpToTab={handleJumpToTab}
                    onSubmitQuestionText={submitQuestionText}
                    onSelectEntry={handleSelectEntry}
                  />

                  {/* Input Form */}
                  <form
                    onSubmit={handleSendQuestion}
                    className="p-3 bg-white dark:bg-[#1e1e20] border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 shrink-0"
                  >
                    {quotaState.isExceeded && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                        <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span>
                          {lang === 'vi'
                            ? 'Đã hết 20 lượt AI miễn phí hôm nay. Bạn vẫn dùng được các nút Quick Chips (0đ) & câu hỏi đã lưu Cache!'
                            : 'Daily 20 free AI queries reached. Quick Chips (0ms) and Smart Cached answers remain active!'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inputQuery}
                        onChange={e => setInputQuery(e.target.value)}
                        placeholder={
                          lang === 'vi'
                            ? `Hỏi AI (${quotaState.remaining}/${quotaState.limit} lượt còn lại hôm nay)...`
                            : `Ask AI (${quotaState.remaining}/${quotaState.limit} free left today)...`
                        }
                        className="flex-1 bg-slate-100 dark:bg-[#27272a] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!inputQuery.trim() || isTyping}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 touch-manipulation transition-all shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{lang === 'vi' ? 'Gửi' : 'Ask'}</span>
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </Draggable>
        </div>
      )}
    </>
  );
});

FaqChatbotModal.displayName = 'FaqChatbotModal';
