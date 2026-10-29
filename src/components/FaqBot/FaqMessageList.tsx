import React from 'react';
import {
  ChevronRight,
  ExternalLink,
  MessageSquarePlus,
  BookOpen
} from 'lucide-react';
import { FaqKnowledgeEntry } from './faqKnowledgeEngine';
import { TabId } from '../../types';

export type AnswerTierSource =
  | 'tier1_quick_chip'
  | 'tier2_gemini_flash'
  | 'tier3_smart_cache'
  | 'quota_exceeded_fallback'
  | 'local_manual';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  tierSource?: AnswerTierSource;
  primaryEntry?: FaqKnowledgeEntry;
  relatedEntries?: FaqKnowledgeEntry[];
  targetTab?: TabId;
  targetTabLabel?: string;
  timestamp: string;
}

interface FaqMessageListProps {
  messages: ChatMessage[];
  lang: 'vi' | 'en';
  isTyping: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onJumpToTab: (tabId: TabId) => void;
  onSubmitQuestionText: (q: string) => void;
  onSelectEntry: (entry: FaqKnowledgeEntry) => void;
  onOpenManualExplorer?: () => void;
}

const getTierSourceLabel = (source: AnswerTierSource | undefined, lang: 'vi' | 'en'): string | null => {
  if (!source) return null;
  if (source === 'tier1_quick_chip') {
    return lang === 'vi' ? 'Trả lời tức thì (0ms)' : 'Instant Answer (0ms)';
  }
  if (source === 'tier3_smart_cache') {
    return lang === 'vi' ? 'Đã lưu trong bộ nhớ máy' : 'Saved in Smart Cache';
  }
  if (source === 'tier2_gemini_flash') {
    return lang === 'vi' ? 'Trợ lý AI Gemini' : 'Gemini AI Assistant';
  }
  if (source === 'quota_exceeded_fallback') {
    return lang === 'vi' ? 'Cẩm nang hướng dẫn' : 'Manual Guide';
  }
  return lang === 'vi' ? 'Trợ lý hướng dẫn' : 'Guide Assistant';
};

const renderFormattedText = (raw: string) => {
  const lines = raw.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return <div key={idx} className="h-2" />;
    if (trimmed === '---') {
      return <hr key={idx} className="my-2.5 border-slate-200 dark:border-slate-700" />;
    }
    if (trimmed.startsWith('### ')) {
      return (
        <div key={idx} className="font-bold text-slate-900 dark:text-white text-sm mb-1.5 mt-0.5">
          {trimmed.replace('### ', '')}
        </div>
      );
    }
    const parts = line.split(/(\*\*.*?\*\*|`.*?`)/g);
    return (
      <div key={idx} className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
        {parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className="font-semibold text-slate-900 dark:text-white">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={pIdx}
                className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#18181b] text-blue-600 dark:text-blue-300 font-mono text-xs"
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

export const FaqMessageList: React.FC<FaqMessageListProps> = React.memo(({
  messages,
  lang,
  isTyping,
  messagesEndRef,
  onJumpToTab,
  onSubmitQuestionText,
  onSelectEntry,
  onOpenManualExplorer
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50 dark:bg-[#18181b]">
      {messages.map(msg => {
        const isWelcome = msg.id === 'welcome';
        const quickPrompts = msg.primaryEntry
          ? lang === 'vi'
            ? msg.primaryEntry.quickPromptsVi
            : msg.primaryEntry.quickPromptsEn
          : undefined;
        const targetTab = msg.targetTab || msg.primaryEntry?.targetTab;
        const targetTabLabel =
          msg.targetTabLabel ||
          (msg.primaryEntry
            ? lang === 'vi'
              ? msg.primaryEntry.targetTabLabelVi
              : msg.primaryEntry.targetTabLabelEn
            : undefined);

        const sourceLabel = msg.role === 'assistant' ? getTierSourceLabel(msg.tierSource, lang) : null;

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-2xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-xs'
                  : 'bg-white dark:bg-[#27272a] border border-slate-200/90 dark:border-slate-700/80 rounded-bl-xs'
              }`}
            >
              {msg.role === 'user' ? (
                <div className="text-[13px] font-medium leading-relaxed">{msg.text}</div>
              ) : (
                <div className="space-y-1">{renderFormattedText(msg.text)}</div>
              )}

              {/* Welcome message special action: Open visual manual or 5-min guide */}
              {isWelcome && onOpenManualExplorer && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/70 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (msg.primaryEntry) onSelectEntry(msg.primaryEntry);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{lang === 'vi' ? '🚀 Xem lộ trình 5 phút cho người mới' : '🚀 5-Minute Quick Start'}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenManualExplorer}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1e1e20] hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-500" />
                    <span>{lang === 'vi' ? 'Mở danh mục Cẩm nang' : 'Browse Manual Topics'}</span>
                  </button>
                </div>
              )}

              {/* Direct tab navigation button for non-welcome answers */}
              {!isWelcome && msg.role === 'assistant' && targetTab && targetTabLabel && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/70 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {lang === 'vi' ? 'Đi tới màn hình thực hành:' : 'Go to screen:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToTab(targetTab)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{targetTabLabel}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Clean, max-2 follow-up questions (hidden on welcome to avoid clutter) */}
              {!isWelcome && msg.role === 'assistant' && quickPrompts && quickPrompts.length > 0 && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/70 space-y-1.5">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    <MessageSquarePlus className="w-3.5 h-3.5 text-blue-500" />
                    <span>{lang === 'vi' ? 'Câu hỏi liên quan:' : 'Related questions:'}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {quickPrompts.slice(0, 2).map((promptText, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => onSubmitQuestionText(promptText)}
                        className="inline-flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#1e1e20] hover:bg-blue-50 dark:hover:bg-blue-950/30 border border-slate-200/80 dark:border-slate-700/70 text-xs font-medium text-slate-700 dark:text-slate-200 text-left active:scale-98 transition-all cursor-pointer group"
                      >
                        <span className="group-hover:text-blue-600 dark:group-hover:text-blue-400">{promptText}</span>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-blue-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quiet unboxed metadata line below bubble */}
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-1 px-1.5">
              <span>{msg.timestamp}</span>
              {sourceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{sourceLabel}</span>
                </>
              )}
            </div>
          </div>
        );
      })}

      {isTyping && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-2 py-1">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          <span>
            {lang === 'vi'
              ? 'Đang soạn câu trả lời ngắn gọn cho bạn...'
              : 'Preparing a concise answer for you...'}
          </span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});

FaqMessageList.displayName = 'FaqMessageList';
