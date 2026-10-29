import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import Draggable from 'react-draggable';
import {
  Bot,
  X,
  Send,
  Sparkles,
  BookOpen,
  GripHorizontal,
  RotateCcw,
  HelpCircle,
  ChevronRight,
  Globe
} from 'lucide-react';
import {
  FAQ_CATEGORIES,
  FAQ_KNOWLEDGE_BASE,
  FaqKnowledgeEntry,
  searchFaqKnowledge
} from './faqKnowledgeEngine';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  relatedEntries?: FaqKnowledgeEntry[];
  timestamp: string;
}

export const FaqChatbotModal: React.FC = React.memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [lang, setLang] = useState<'vi' | 'en'>('vi');
  const [selectedCategory, setSelectedCategory] = useState<'All' | FaqKnowledgeEntry['category']>('All');
  const [inputQuery, setInputQuery] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const nodeRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const initialGreeting = useMemo<ChatMessage>(
    () => ({
      id: 'welcome',
      role: 'assistant',
      text:
        lang === 'vi'
          ? 'Xin chào! Tôi là **Trợ lý Nghiệp vụ Takashimaya PM** (dữ liệu chuẩn từ `BUSINESS_LOGIC.md`).\n\nBạn là người dùng mới hay cần tra cứu nhanh công thức **Ngân sách 3 cấp**, **Chi phí 3 đợt & VAT**, **Gantt & Predecessor**, **Giao việc Tracker**, hay **Cách tính diện tích m² trên Layout**? Hãy chọn câu hỏi gợi ý hoặc nhập câu hỏi bên dưới!'
          : 'Welcome! I am the **Takashimaya PM Business Logic Assistant** (grounded on `BUSINESS_LOGIC.md`).\n\nWhether you are a new user or looking up **3-Tier Budget formulas**, **3-Installment Costs & VAT**, **Gantt Predecessors**, **Delegation Tracker**, or **Floor Plan Area (m²)** rules, pick a topic below or ask a question!',
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
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('taka:open-faq-bot', handleOpenEvent);
    return () => window.removeEventListener('taka:open-faq-bot', handleOpenEvent);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const categoryEntries = useMemo(() => {
    if (selectedCategory === 'All') return FAQ_KNOWLEDGE_BASE;
    return FAQ_KNOWLEDGE_BASE.filter(item => item.category === selectedCategory);
  }, [selectedCategory]);

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
        {
          id: `u_${Date.now()}`,
          role: 'user',
          text: userQuestion,
          timestamp: now
        },
        {
          id: `a_${Date.now() + 1}`,
          role: 'assistant',
          text: `### ${userQuestion}\n${answerBody}`,
          relatedEntries: related,
          timestamp: now
        }
      ]);
    },
    [lang]
  );

  const handleSendQuestion = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      const q = inputQuery.trim();
      if (!q || isTyping) return;

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text: q,
        timestamp: now
      };

      setMessages(prev => [...prev, userMsg]);
      setInputQuery('');
      setIsTyping(true);

      // Instant local BUSINESS_LOGIC.md match
      const localResult = searchFaqKnowledge(q, lang);

      try {
        const res = await fetch('/api/faq-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: q,
            lang,
            localContext: localResult.formattedAnswer
          })
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.answer) {
            setMessages(prev => [
              ...prev,
              {
                id: `a_${Date.now()}`,
                role: 'assistant',
                text: data.answer,
                relatedEntries: localResult.bestMatches,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              }
            ]);
            setIsTyping(false);
            return;
          }
        }
      } catch {
        // Fallback smoothly to deterministic BUSINESS_LOGIC.md engine
      }

      setMessages(prev => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: localResult.formattedAnswer,
          relatedEntries: localResult.bestMatches,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setIsTyping(false);
    },
    [inputQuery, isTyping, lang]
  );

  const renderFormattedText = (raw: string) => {
    const lines = raw.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} className="h-1.5" />;
      if (trimmed === '---') {
        return <hr key={idx} className="my-2 border-slate-200 dark:border-slate-700" />;
      }
      if (trimmed.startsWith('### ')) {
        return (
          <div key={idx} className="font-bold text-blue-700 dark:text-blue-300 text-xs sm:text-sm mb-1 mt-1">
            {trimmed.replace('### ', '')}
          </div>
        );
      }
      // Format bold **text** and inline code `code`
      const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
      return (
        <div key={idx} className="text-xs leading-relaxed text-slate-700 dark:text-slate-200">
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
                  className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 font-mono text-[11px]"
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
    <>
      {/* Floating FAQ Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        title="Business Logic & FAQ Guide"
        className="fixed bottom-6 right-4 z-[9000] flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg shadow-blue-600/30 border border-white/20 active:scale-95 touch-manipulation transition-all print:hidden"
      >
        <Bot className="w-4 h-4" />
        <span className="text-xs font-bold tracking-tight hidden sm:inline">FAQ Guide</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[9998] pointer-events-none flex items-end sm:items-center justify-end sm:justify-center p-2 sm:p-4 print:hidden">
          <Draggable nodeRef={nodeRef} handle=".modal-handle" bounds="parent">
            <div
              ref={nodeRef}
              className="pointer-events-auto w-full sm:w-[540px] max-w-[96vw] h-[82vh] sm:h-[640px] max-h-[90vh] bg-white dark:bg-[#18181b] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Draggable Header */}
              <div className="modal-handle cursor-grab active:cursor-grabbing bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white px-4 py-3 flex items-center justify-between select-none shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-300" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs sm:text-sm font-bold tracking-tight truncate">
                        Takashimaya Business Logic & FAQ Bot
                      </h3>
                      <GripHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                    <p className="text-[10px] text-blue-200/80 truncate">
                      Interactive Onboarding & Rules Reference (BUSINESS_LOGIC.md)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLang(prev => (prev === 'vi' ? 'en' : 'vi'));
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-bold uppercase tracking-wider transition-colors active:scale-95 touch-manipulation cursor-pointer"
                    title="Switch Language (VN / EN)"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {lang.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMessages([initialGreeting]);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors active:scale-95 touch-manipulation cursor-pointer"
                    title="Reset Conversation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-rose-600 text-slate-200 hover:text-white transition-all active:scale-90 touch-manipulation cursor-pointer z-20 shrink-0"
                    title="Close (Esc)"
                    aria-label="Close FAQ Modal"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Category Filter Bar */}
              <div className="px-3 py-2 bg-slate-50 dark:bg-[#202024] border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                {FAQ_CATEGORIES.map(cat => {
                  const active = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all active:scale-95 ${
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

              {/* Quick Topic Pills from Selected Category */}
              <div className="px-3 py-2 bg-blue-50/50 dark:bg-blue-950/15 border-b border-slate-200 dark:border-slate-800 max-h-24 overflow-y-auto shrink-0">
                <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                  <BookOpen className="w-3 h-3 text-blue-500" />
                  <span>
                    {lang === 'vi'
                      ? 'Chủ đề nghiệp vụ (Nhấn để xem ngay):'
                      : 'Business Logic Topics (Click for instant guide):'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {categoryEntries.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => handleSelectEntry(entry)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-white dark:bg-[#27272a] text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 hover:bg-blue-50 dark:hover:bg-blue-900/30 active:scale-95 transition-all text-left"
                    >
                      <HelpCircle className="w-3 h-3 shrink-0 text-blue-500" />
                      <span className="truncate max-w-[230px]">
                        {lang === 'vi' ? entry.titleVi : entry.titleEn}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/40 dark:bg-[#141417]">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-xs'
                          : 'bg-white dark:bg-[#202024] border border-slate-200/90 dark:border-slate-700/80 rounded-bl-xs'
                      }`}
                    >
                      {msg.role === 'user' ? (
                        <div className="text-xs font-medium leading-relaxed">{msg.text}</div>
                      ) : (
                        <div className="space-y-0.5">{renderFormattedText(msg.text)}</div>
                      )}

                      {msg.role === 'assistant' && msg.relatedEntries && msg.relatedEntries.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/70">
                          <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1">
                            {lang === 'vi' ? 'Câu hỏi liên quan:' : 'Related Topics:'}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {msg.relatedEntries.map(rel => (
                              <button
                                key={rel.id}
                                type="button"
                                onClick={() => handleSelectEntry(rel)}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 text-[10px] font-semibold text-blue-600 dark:text-blue-300 transition-colors"
                              >
                                <span>{lang === 'vi' ? rel.titleVi : rel.titleEn}</span>
                                <ChevronRight className="w-2.5 h-2.5" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 mt-0.5 px-1">{msg.timestamp}</span>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                    <span>
                      {lang === 'vi'
                        ? 'Đang tra cứu BUSINESS_LOGIC.md...'
                        : 'Consulting BUSINESS_LOGIC.md...'}
                    </span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Form */}
              <form
                onSubmit={handleSendQuestion}
                className="p-3 bg-white dark:bg-[#1c1c20] border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={inputQuery}
                  onChange={e => setInputQuery(e.target.value)}
                  placeholder={
                    lang === 'vi'
                      ? 'Hỏi về Budget, Cost 3 đợt, Gantt, Tracker, Layout m²...'
                      : 'Ask about Budget, 3-Installment Cost, Gantt, Tracker, Layout m²...'
                  }
                  className="flex-1 bg-slate-100 dark:bg-[#27272a] border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <button
                  type="submit"
                  disabled={!inputQuery.trim() || isTyping}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 touch-manipulation transition-all shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{lang === 'vi' ? 'Gửi' : 'Ask'}</span>
                </button>
              </form>
            </div>
          </Draggable>
        </div>
      )}
    </>
  );
});

FaqChatbotModal.displayName = 'FaqChatbotModal';
