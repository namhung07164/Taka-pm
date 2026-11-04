import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Draggable from 'react-draggable';
import {
  Bot, X, Send, Sparkles, BookOpen, MessageSquare, GripHorizontal, RotateCcw, HelpCircle, Globe, Zap, Minimize2, Maximize2
} from 'lucide-react';
import { FAQ_KNOWLEDGE_BASE, FaqKnowledgeEntry } from './faqKnowledgeEngine';
import { analyzeAndAnswerUserQuestion } from './faqSmartAnalyzer';
import { FaqQuickChip, TAB_DISPLAY_NAMES, getQuickChipsForTab } from './faqTabQuickChips';
import { getDailyAiQuotaStatus, incrementDailyAiQuota, getSmartCachedAiAnswer, saveSmartCachedAiAnswer } from './faqAiCacheAndQuota';
import { FaqMessageList, ChatMessage } from './FaqMessageList';
import { FaqManualExplorer } from './FaqManualExplorer';
import { useAppStore } from '../../store/useAppStore';
import { TabId } from '../../types';

export const FaqChatbotModal: React.FC = React.memo(() => {
  const activeTab = useAppStore(state => state.activeTab);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeMode, setActiveMode] = useState<'chat' | 'manual'>('chat');
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
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

  const initialGreeting = useMemo<ChatMessage>(() => ({
    id: 'welcome',
    role: 'assistant',
    tierSource: 'local_manual',
    text: lang === 'vi'
      ? `👋 Xin chào! Tôi là **Trợ lý AI & Phân tích Thông minh Taka PM**.\n\nBạn đang ở **${activeTabDisplay}**. Bạn có thể hỏi tôi:\n• **Phân tích trực tiếp dự án**: Gõ mã dự án (VD: \`L3-333-2\`, \`HN-TKV-BOH\`) hoặc hỏi *"Dự án nào đang bị trễ?"*, *"Tổng hợp dự án hiện tại"*.\n• **Giải đáp nguyên nhân & thao tác**: *"Tại sao không sửa được ở Gantt?"*, *"Cách nối Predecessor #"*, *"Tại sao tiền hiện \*\*\*"*.`
      : `👋 Hello! I am your **Taka PM Smart AI & Analytics Assistant**.\n\nYou are viewing **${activeTabDisplay}**. You can ask me:\n• **Live Project & Portfolio Analytics**: Type any project code (e.g., \`L3-333-2\`, \`HN-TKV-BOH\`) or ask *"Which projects are delayed?"*, *"Summary of current projects"*.\n• **Troubleshooting & How-To**: *"Why can't I edit on Gantt?"*, *"How to link Predecessor #"*, *"Why do numbers show \*\*\*"*.`,
    primaryEntry: FAQ_KNOWLEDGE_BASE[0],
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }), [lang, activeTabDisplay]);

  const [messages, setMessages] = useState<ChatMessage[]>([initialGreeting]);

  useEffect(() => {
    setMessages(prev => (prev.length <= 1 ? [initialGreeting] : prev));
  }, [initialGreeting]);

  useEffect(() => {
    if (isOpen) setQuotaState(getDailyAiQuotaStatus());
  }, [isOpen]);

  useEffect(() => {
    const handleOpenEvent = () => { setIsOpen(true); setIsMinimized(false); };
    window.addEventListener('taka:open-faq-bot', handleOpenEvent);
    return () => window.removeEventListener('taka:open-faq-bot', handleOpenEvent);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsOpen(false); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isMinimized && activeMode === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized, activeMode]);

  const handleJumpToTab = useCallback((tabId: TabId) => {
    try {
      useAppStore.getState().setActiveTab(tabId);
      if (typeof window !== 'undefined' && window.innerWidth < 768) setIsOpen(false);
    } catch { /* ignore */ }
  }, []);

  const handleSelectQuickChip = useCallback((chip: FaqQuickChip) => {
    const questionLabel = lang === 'vi' ? chip.labelVi : chip.labelEn;
    const answerBody = lang === 'vi' ? chip.answerVi : chip.answerEn;
    const targetTabLabel = lang === 'vi' ? chip.targetTabLabelVi : chip.targetTabLabelEn;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setActiveMode('chat');
    setMessages(prev => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', text: questionLabel, timestamp: now },
      { id: `a_${Date.now() + 1}`, role: 'assistant', text: answerBody, tierSource: 'tier1_quick_chip', targetTab: chip.targetTab, targetTabLabel, timestamp: now }
    ]);
  }, [lang]);

  const handleSelectEntry = useCallback((entry: FaqKnowledgeEntry) => {
    const userQuestion = lang === 'vi' ? entry.titleVi : entry.titleEn;
    const answerBody = lang === 'vi' ? entry.answerVi : entry.answerEn;
    const related = (entry.relatedIds || []).map(id => FAQ_KNOWLEDGE_BASE.find(x => x.id === id)).filter(Boolean) as FaqKnowledgeEntry[];
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    setActiveMode('chat');
    setMessages(prev => [
      ...prev,
      { id: `u_${Date.now()}`, role: 'user', text: userQuestion, timestamp: now },
      { id: `a_${Date.now() + 1}`, role: 'assistant', text: `### ${userQuestion}\n${answerBody}`, tierSource: 'tier1_quick_chip', primaryEntry: entry, relatedEntries: related, timestamp: now }
    ]);
  }, [lang]);

  const submitQuestionText = useCallback(async (rawQuestion: string) => {
    const q = rawQuestion.trim();
    if (!q || isTyping) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const recentHistory = messages
      .filter(m => m.id !== 'welcome')
      .slice(-4)
      .map(m => ({ role: m.role, text: m.text.slice(0, 350) }));

    setActiveMode('chat');
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text: q, timestamp: now }]);
    setInputQuery('');
    setIsTyping(true);

    // Run 0ms Smart Analyzer (Intent + Live Project/Portfolio Data + Targeted Q&A)
    const smartResult = analyzeAndAnswerUserQuestion(q, lang);
    const topEntry = smartResult.primaryEntry;
    const targetTabLabel = lang === 'vi' ? smartResult.targetTabLabelVi : smartResult.targetTabLabelEn;

    // If it's a direct live project lookup, portfolio analytics, or high-precision targeted Q&A,
    // check if we can also enrich via Gemini or return immediately
    if (!smartResult.isLiveDataQuery) {
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
            relatedEntries: smartResult.relatedEntries,
            followUpPrompts: smartResult.followUpPrompts,
            targetTab: smartResult.targetTab,
            targetTabLabel,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setIsTyping(false);
        return;
      }
    }

    // Daily Quota Check (max 20/day for external AI calls; local smart analysis is unlimited)
    const currentQuota = getDailyAiQuotaStatus();
    setQuotaState(currentQuota);
    if (currentQuota.isExceeded) {
      setMessages(prev => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: smartResult.formattedAnswer,
          tierSource: smartResult.isLiveDataQuery ? 'live_data_analysis' : 'quota_exceeded_fallback',
          primaryEntry: topEntry,
          relatedEntries: smartResult.relatedEntries,
          followUpPrompts: smartResult.followUpPrompts,
          targetTab: smartResult.targetTab,
          targetTabLabel,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsTyping(false);
      return;
    }

    // Call Server-Side Gemini AI with Live Workspace Digest + Matched Knowledge Context + Recent History
    try {
      const res = await fetch('/api/faq-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          lang,
          activeTab,
          intentCategory: smartResult.intentCategory,
          localContext: smartResult.formattedAnswer,
          liveDataContext: smartResult.liveWorkspaceDigest,
          recentHistory
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.answer) {
          const isGeminiSource = data.source === 'gemini_2_5_flash';
          if (isGeminiSource) {
            const nextQuota = incrementDailyAiQuota();
            setQuotaState(nextQuota);
            if (!smartResult.isLiveDataQuery) {
              saveSmartCachedAiAnswer(q, data.answer, lang);
            }
          }
          setMessages(prev => [
            ...prev,
            {
              id: `a_${Date.now()}`,
              role: 'assistant',
              text: data.answer,
              tierSource: smartResult.isLiveDataQuery
                ? 'live_data_analysis'
                : isGeminiSource
                ? 'tier2_gemini_flash'
                : 'local_manual',
              primaryEntry: topEntry,
              relatedEntries: smartResult.relatedEntries,
              followUpPrompts: smartResult.followUpPrompts,
              targetTab: smartResult.targetTab,
              targetTabLabel,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
          ]);
          setIsTyping(false);
          return;
        }
      }
    } catch {
      // Fallback to local smart analysis on network error
    }

    setMessages(prev => [
      ...prev,
      {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: smartResult.formattedAnswer,
        tierSource: smartResult.isLiveDataQuery ? 'live_data_analysis' : 'local_manual',
        primaryEntry: topEntry,
        relatedEntries: smartResult.relatedEntries,
        followUpPrompts: smartResult.followUpPrompts,
        targetTab: smartResult.targetTab,
        targetTabLabel,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setIsTyping(false);
  }, [isTyping, lang, activeTab, messages]);

  const handleSendQuestion = useCallback((e?: React.FormEvent) => {
    if (e) e.preventDefault();
    submitQuestionText(inputQuery);
  }, [inputQuery, submitQuestionText]);

  return (
    <>
      <button
        type="button"
        onClick={() => { setIsOpen(prev => !prev); setIsMinimized(false); }}
        title="Taka PM Help & Assistant"
        className="fixed bottom-6 right-4 z-[9000] flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/25 border border-white/15 active:scale-95 touch-manipulation transition-all print:hidden cursor-pointer"
      >
        <Bot className="w-4 h-4" />
        <span className="text-xs font-bold tracking-tight hidden sm:inline">
          {lang === 'vi' ? 'Trợ lý HDSD' : 'Help Guide'}
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9998] pointer-events-none flex items-end sm:items-center justify-end sm:justify-center p-2 sm:p-4 print:hidden">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs pointer-events-auto sm:hidden z-0" onClick={() => setIsOpen(false)} />

          <Draggable
            nodeRef={nodeRef}
            handle=".modal-handle"
            cancel="button, input, textarea, select, .no-drag"
            disabled={typeof window !== 'undefined' && window.innerWidth < 768}
            bounds="parent"
          >
            <div
              ref={nodeRef}
              className={`pointer-events-auto relative z-10 w-full sm:w-[500px] max-w-[96vw] ${
                isMinimized ? 'h-auto' : 'h-[82vh] sm:h-[620px] max-h-[90vh]'
              } bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all`}
              onClick={e => e.stopPropagation()}
            >
              {/* Clean Header */}
              <div className="bg-slate-900 dark:bg-[#141416] text-white px-4 py-3 flex items-center justify-between select-none shrink-0 border-b border-slate-800">
                <div className="modal-handle cursor-grab active:cursor-grabbing flex items-center gap-2.5 min-w-0 flex-1 mr-2 py-0.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-bold tracking-tight truncate">
                        {lang === 'vi' ? 'Trợ lý Hướng dẫn Taka PM' : 'Taka PM Help Assistant'}
                      </h3>
                      <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0 hidden sm:inline" />
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
                      <span>{activeTabDisplay}</span>
                      <span aria-hidden="true">·</span>
                      <span>{lang === 'vi' ? `Còn ${quotaState.remaining}/${quotaState.limit} câu AI` : `${quotaState.remaining}/${quotaState.limit} AI left`}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 z-30 pointer-events-auto">
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setLang(prev => (prev === 'vi' ? 'en' : 'vi')); }}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-semibold uppercase transition-colors active:scale-95 cursor-pointer"
                    title="Switch Language (VN / EN)"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {lang.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setMessages([initialGreeting]); setActiveMode('chat'); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 transition-colors active:scale-95 cursor-pointer"
                    title={lang === 'vi' ? 'Làm mới cuộc trò chuyện' : 'Reset Chat'}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setIsMinimized(prev => !prev); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 transition-colors active:scale-95 cursor-pointer"
                    title={isMinimized ? 'Expand' : 'Minimize'}
                  >
                    {isMinimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={e => { e.preventDefault(); e.stopPropagation(); setIsOpen(false); }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-rose-600 text-white transition-all active:scale-90 cursor-pointer"
                    title="Close (Esc)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {!isMinimized && (
                <>
                  {/* Mode Switcher: 2 Clean Segmented Tabs */}
                  <div className="px-3 pt-2.5 pb-2 bg-white dark:bg-[#1e1e20] border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-[#27272a] rounded-xl">
                      <button
                        type="button"
                        onClick={() => setActiveMode('chat')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeMode === 'chat'
                            ? 'bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{lang === 'vi' ? 'Hỏi đáp nhanh' : 'Quick Ask & AI'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveMode('manual')}
                        className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeMode === 'manual'
                            ? 'bg-white dark:bg-[#18181b] text-blue-600 dark:text-blue-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{lang === 'vi' ? 'Cẩm nang theo chủ đề' : 'Browse Manual'}</span>
                      </button>
                    </div>
                  </div>

                  {activeMode === 'manual' ? (
                    <FaqManualExplorer
                      lang={lang}
                      activeTabDisplay={activeTabDisplay}
                      activeTabQuickChips={activeTabQuickChips}
                      onSelectEntry={handleSelectEntry}
                      onSelectQuickChip={handleSelectQuickChip}
                      onJumpToTab={handleJumpToTab}
                    />
                  ) : (
                    <>
                      {/* Single Horizontal Row of Context-Aware Quick Chips */}
                      <div className="px-3.5 py-2 bg-white dark:bg-[#1e1e20] border-b border-slate-200/80 dark:border-slate-800 shrink-0">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-emerald-500" />
                            {lang === 'vi' ? `Câu hỏi thường gặp tại ${activeTabDisplay}:` : `Popular questions for ${activeTabDisplay}:`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                          {activeTabQuickChips.slice(0, 4).map(chip => (
                            <button
                              key={chip.id}
                              type="button"
                              onClick={() => handleSelectQuickChip(chip)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap bg-slate-100 dark:bg-[#27272a] hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200/80 dark:border-slate-700/70 active:scale-95 transition-all cursor-pointer shrink-0"
                            >
                              <span>{lang === 'vi' ? chip.labelVi : chip.labelEn}</span>
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
                        onOpenManualExplorer={() => setActiveMode('manual')}
                      />

                      {/* Clean Input Footer */}
                      <form onSubmit={handleSendQuestion} className="p-3 bg-white dark:bg-[#1e1e20] border-t border-slate-200 dark:border-slate-800 flex flex-col gap-1.5 shrink-0">
                        {quotaState.isExceeded && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                            <span>
                              {lang === 'vi'
                                ? 'Đã hết lượt AI hôm nay. Bạn vẫn có thể tìm trong Cẩm nang hoặc bấm câu hỏi gợi ý!'
                                : 'Daily AI limit reached. You can still browse Manual Topics or tap suggested chips!'}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={inputQuery}
                            onChange={e => setInputQuery(e.target.value)}
                            placeholder={lang === 'vi' ? 'Nhập câu hỏi của bạn (VD: cách nối Predecessor #)...' : 'Type your question (e.g., how to link Predecessor #)...'}
                            className="flex-1 bg-slate-100 dark:bg-[#27272a] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!inputQuery.trim() || isTyping}
                            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 touch-manipulation transition-all shrink-0 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{lang === 'vi' ? 'Hỏi' : 'Ask'}</span>
                          </button>
                        </div>
                      </form>
                    </>
                  )}
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
