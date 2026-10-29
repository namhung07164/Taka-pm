import React from 'react';
import {
  ChevronRight,
  ExternalLink,
  MessageSquarePlus,
  Zap,
  Database,
  Sparkles,
  ShieldAlert
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
}

const renderTierBadge = (source?: AnswerTierSource) => {
  if (!source) return null;
  if (source === 'tier1_quick_chip') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold">
        <Zap className="w-2.5 h-2.5" />
        Tier 1 • Instant FAQ (0ms)
      </span>
    );
  }
  if (source === 'tier3_smart_cache') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[9px] font-bold">
        <Database className="w-2.5 h-2.5" />
        Tier 3 • Smart Cache (0 tokens)
      </span>
    );
  }
  if (source === 'tier2_gemini_flash') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[9px] font-bold">
        <Sparkles className="w-2.5 h-2.5" />
        Tier 2 • Gemini 2.5 Flash
      </span>
    );
  }
  if (source === 'quota_exceeded_fallback') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[9px] font-bold">
        <ShieldAlert className="w-2.5 h-2.5" />
        Quota Limit • Static Manual
      </span>
    );
  }
  return null;
};

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
                className="px-1 py-0.5 rounded bg-slate-100 dark:bg-[#1e1e20] text-indigo-600 dark:text-indigo-300 font-mono text-[11px]"
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
  onSelectEntry
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-slate-50/40 dark:bg-[#1e1e20]">
      {messages.map(msg => {
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

        return (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 shadow-xs ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-xs'
                  : 'bg-white dark:bg-[#27272a] border border-slate-200/90 dark:border-slate-700/80 rounded-bl-xs'
              }`}
            >
              {msg.role === 'assistant' && msg.tierSource && (
                <div className="mb-1.5">{renderTierBadge(msg.tierSource)}</div>
              )}

              {msg.role === 'user' ? (
                <div className="text-xs font-medium leading-relaxed">{msg.text}</div>
              ) : (
                <div className="space-y-0.5">{renderFormattedText(msg.text)}</div>
              )}

              {msg.role === 'assistant' && targetTab && targetTabLabel && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-700/70 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {lang === 'vi' ? '🎯 Thực hành trực tiếp:' : '🎯 Try it now:'}
                  </span>
                  <button
                    type="button"
                    onClick={() => onJumpToTab(targetTab)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{targetTabLabel}</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}

              {msg.role === 'assistant' && quickPrompts && quickPrompts.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/70">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mb-1">
                    <MessageSquarePlus className="w-3 h-3" />
                    <span>{lang === 'vi' ? 'Hỏi tiếp 1 chạm:' : '1-Tap Follow-up:'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {quickPrompts.map((promptText, qIdx) => (
                      <button
                        key={qIdx}
                        type="button"
                        onClick={() => onSubmitQuestionText(promptText)}
                        className="inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-50/80 dark:bg-indigo-950/40 hover:bg-indigo-100 border border-indigo-200/70 dark:border-indigo-800/60 text-[11px] font-medium text-indigo-700 dark:text-indigo-200 text-left active:scale-98 transition-all cursor-pointer"
                      >
                        <span>💬 {promptText}</span>
                        <ChevronRight className="w-3 h-3 shrink-0 text-indigo-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && msg.relatedEntries && msg.relatedEntries.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/70">
                  <div className="flex flex-wrap gap-1">
                    {msg.relatedEntries.map(rel => (
                      <button
                        key={rel.id}
                        type="button"
                        onClick={() => onSelectEntry(rel)}
                        className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1e1e20] hover:bg-blue-50 text-[10px] font-semibold text-blue-600 dark:text-blue-300 transition-colors cursor-pointer"
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
        );
      })}

      {isTyping && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          <span>
            {lang === 'vi'
              ? 'Đang kiểm tra Smart Cache & Gemini 2.5 Flash...'
              : 'Checking Smart Cache & Gemini 2.5 Flash...'}
          </span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});

FaqMessageList.displayName = 'FaqMessageList';
