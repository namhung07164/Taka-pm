import React, { FC } from 'react';
import { safeGetItemLocal, safeSetItemLocal } from '../../../lib/storage';
import { LazyImage } from '../../LazyImage';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../lib/utils';
import { DelegationGroup } from '../../../types';
import { FileText, Maximize2 } from 'lucide-react';

export const recordMention = (userId: string) => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    const habits = habitsStr ? JSON.parse(habitsStr) : {};
    habits[userId] = (habits[userId] || 0) + 1;
    safeSetItemLocal('mentionHabits', JSON.stringify(habits));
  } catch (e) {}
};

export const getMentionFrequencies = (): Record<string, number> => {
  try {
    const habitsStr = safeGetItemLocal('mentionHabits');
    return habitsStr ? JSON.parse(habitsStr) : {};
  } catch (e) {
    return {};
  }
};

interface ChatHighlightedTextProps {
  text: string;
  isMe?: boolean;
  taskName?: string;
  linkedGroup?: DelegationGroup | null;
}

export const ChatHighlightedText: React.FC<ChatHighlightedTextProps> = ({
  text,
  isMe = false,
  taskName,
  linkedGroup
}) => {
  const setZoomableImageSrc = useAppStore(state => state.setZoomableImageSrc);

  const knownTags: string[] = [];
  if (taskName) {
    knownTags.push(`#${taskName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  }
  if (linkedGroup) {
    linkedGroup.subTasks.forEach(st => {
      const pTag = st.party;
      if (pTag) {
        knownTags.push(`#${pTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      }
    });
  }

  const knownTagsPattern = knownTags.length > 0 ? `${knownTags.map(t => `${t}(?:-approval)?`).join('|')}|` : '';
  const urlPattern = `https?:\\/\\/[^\\s]+`;
  const regex = new RegExp(`(${urlPattern}|${knownTagsPattern}#[\\w\\-]+\\b|@[\\w\\-]+\\b)`, 'g');

  return (
    <>
      {text.split(regex).map((chunk, i) => {
        if (!chunk) return null;
        if (chunk.match(/^https?:\/\//)) {
          const isImage = chunk.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp)(\?.*)?$/i) || chunk.match(/^https?:\/\/.*(images|img|photo|picture).*/i);
          const isPdf = chunk.match(/\.pdf($|\?|#)/i) || chunk.match(/drive\.google\.com\/.*(?:file|document|pdf)/i) || chunk.match(/docs\.google\.com/i);
          const googleDriveMatch = chunk.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);

          const link = (
            <a
              key={`link-${i}`}
              href={chunk}
              target="_blank"
              rel="noopener noreferrer"
              className={cn("underline font-medium break-all", isMe ? "text-blue-200 hover:text-white" : "text-blue-600 dark:text-blue-400 hover:text-blue-800")}
              onClick={(e) => e.stopPropagation()}
            >
              {chunk}
            </a>
          );

          if (isImage || googleDriveMatch) {
            const imgSrc = googleDriveMatch ? `https://drive.google.com/thumbnail?id=${googleDriveMatch[1]}&sz=w800` : chunk;
            return (
              <span key={i} className="inline-flex flex-col gap-1.5 mt-1 mb-1 w-full">
                {link}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomableImageSrc(chunk);
                  }}
                  className="block max-w-[220px] text-left hover:opacity-90 transition active:scale-95 cursor-pointer rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  <LazyImage src={imgSrc} alt="Attachment" />
                </button>
              </span>
            );
          }

          if (isPdf) {
            return (
              <span key={i} className="inline-flex flex-col gap-1.5 mt-1 mb-1 w-full">
                {link}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setZoomableImageSrc(chunk);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition active:scale-95 cursor-pointer w-fit"
                >
                  <FileText className="w-4 h-4 text-red-500" />
                  <span>View PDF (Full Display)</span>
                  <Maximize2 className="w-3.5 h-3.5 ml-1 opacity-70" />
                </button>
              </span>
            );
          }

          return link;
        }
        if (chunk.startsWith('@')) return <span key={i} className={cn("font-bold", isMe ? "text-blue-200" : "text-blue-600 dark:text-blue-400")}>{chunk}</span>;
        if (chunk.startsWith('#')) return <span key={i} className={cn("font-bold", isMe ? "text-emerald-200" : "text-emerald-600 dark:text-emerald-400")}>{chunk.replace(/-approval$/, '')}</span>;
        return chunk;
      })}
    </>
  );
};
